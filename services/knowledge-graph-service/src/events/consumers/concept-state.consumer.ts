import {
  MetacognitionEventType,
  SchedulerLearningEventType,
  type IMetacognitionEvaluationRecordedPayload,
  type ISchedulerConceptStateUpdatedPayload,
} from '@noema/events';
import { MetacognitionEvaluationRecordedPayloadSchema } from '@noema/learning-kernel';
import type { IEventConsumerConfig, IStreamEventEnvelope } from '@noema/events/consumer';
import { BaseEventConsumer } from '@noema/events/consumer';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { ConceptStateService } from '../../domain/knowledge-graph-service/concept-state.service.js';

function buildConfig(overrides: {
  sourceStreamKey: string;
  consumerName: string;
}): IEventConsumerConfig {
  return {
    sourceStreamKey: overrides.sourceStreamKey,
    consumerGroup: 'kg-service:concept-state',
    consumerName: overrides.consumerName,
    batchSize: 25,
    blockMs: 5000,
    retryBaseDelayMs: 500,
    maxProcessAttempts: 5,
    pendingIdleMs: 60_000,
    pendingBatchSize: 50,
    drainTimeoutMs: 15_000,
    deadLetterStreamKey: 'noema:dlq:kg-service:concept-state',
  };
}

export class ConceptStateConsumer extends BaseEventConsumer {
  constructor(
    redis: Redis,
    private readonly conceptStateService: ConceptStateService,
    logger: Logger,
    consumerName: string,
    sourceStreamKey: string
  ) {
    super(redis, buildConfig({ sourceStreamKey, consumerName }), logger);
  }

  protected async handleEvent(envelope: IStreamEventEnvelope): Promise<boolean> {
    const correlationId =
      typeof envelope.metadata['correlationId'] === 'string'
        ? envelope.metadata['correlationId']
        : undefined;

    if (envelope.eventType === MetacognitionEventType.METACOGNITION_EVALUATION_RECORDED) {
      const payload = MetacognitionEvaluationRecordedPayloadSchema.parse(
        envelope.payload
      ) as IMetacognitionEvaluationRecordedPayload;
      await Promise.all(
        payload.conceptRefs.map((conceptId) =>
          this.conceptStateService.recompute({
            userId: payload.userId,
            conceptId,
            studyMode: payload.studyMode,
            evaluationId: payload.evaluationId,
            reasoningQuality: payload.reasoningQuality,
            stepId: payload.stepId,
            eventId: `${envelope.eventId ?? envelope.aggregateId}:${conceptId}`,
            eventType: envelope.eventType,
            ...(envelope.timestamp !== undefined ? { evaluatedAt: envelope.timestamp } : {}),
            ...(correlationId !== undefined ? { correlationId } : {}),
          })
        )
      );
      return true;
    }

    if (envelope.eventType === SchedulerLearningEventType.SCHEDULER_CONCEPT_STATE_UPDATED) {
      const payload = envelope.payload as unknown as ISchedulerConceptStateUpdatedPayload;
      await this.conceptStateService.recompute({
        userId: payload.userId,
        conceptId: payload.conceptId,
        studyMode: payload.studyMode,
        evaluationId: payload.evaluationId,
        fsrsStability: payload.stability ?? payload.halfLife ?? null,
        stepId: payload.stepId,
        eventType: envelope.eventType,
        ...(envelope.eventId !== undefined ? { eventId: envelope.eventId } : {}),
        ...(correlationId !== undefined ? { correlationId } : {}),
      });
      return true;
    }

    return true;
  }
}
