import {
  MetacognitionEventType,
  type IMetacognitionEvaluationRecordedPayload,
  type IMetacognitionTriggerFiredPayload,
} from '@noema/events';
import {
  BaseEventConsumer,
  type IEventConsumerConfig,
  type IStreamEventEnvelope,
} from '@noema/events/consumer';
import type {
  CorrelationId,
  CurriculumId,
  CurriculumNodeId,
  EventId,
  SessionId,
  UserId,
} from '@noema/types';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { CurriculumService } from '../../domain/curriculum-service/curriculum.service.js';
import type { ISessionLearningContextClient } from '../../domain/curriculum-service/external-ports.js';
import type { CurriculumNode, CurriculumVersionGraph } from '../../domain/curriculum-service/index.js';

function buildConfig(overrides: {
  sourceStreamKey: string;
  consumerName: string;
}): IEventConsumerConfig {
  return {
    sourceStreamKey: overrides.sourceStreamKey,
    consumerGroup: 'curriculum-service:metacognition',
    consumerName: overrides.consumerName,
    batchSize: 20,
    blockMs: 5000,
    retryBaseDelayMs: 500,
    maxProcessAttempts: 5,
    pendingIdleMs: 60_000,
    pendingBatchSize: 50,
    drainTimeoutMs: 15_000,
    deadLetterStreamKey: 'noema:dlq:curriculum-service:metacognition',
  };
}

export class MetacognitionCurriculumConsumer extends BaseEventConsumer {
  constructor(
    redis: Redis,
    private readonly curriculumService: CurriculumService,
    private readonly sessionClient: ISessionLearningContextClient,
    logger: Logger,
    consumerName: string,
    sourceStreamKey = 'noema:events:metacognition-service'
  ) {
    super(redis, buildConfig({ sourceStreamKey, consumerName }), logger);
  }

  protected async handleEvent(envelope: IStreamEventEnvelope): Promise<boolean> {
    if (envelope.eventType === MetacognitionEventType.METACOGNITION_EVALUATION_RECORDED) {
      await this.handleEvaluation(
        envelope.payload as unknown as IMetacognitionEvaluationRecordedPayload,
        readCorrelationId(envelope),
        readEventId(envelope)
      );
      return true;
    }

    if (envelope.eventType === MetacognitionEventType.METACOGNITION_TRIGGER_FIRED) {
      await this.handleTrigger(
        envelope.payload as unknown as IMetacognitionTriggerFiredPayload,
        readCorrelationId(envelope)
      );
      return true;
    }

    return true;
  }

  private async handleEvaluation(
    payload: IMetacognitionEvaluationRecordedPayload,
    correlationId: CorrelationId,
    sourceEventId?: EventId
  ): Promise<void> {
    const context = await this.resolveContext(payload.userId, payload.sessionId);
    if (context === null) return;

    const nodes = await this.resolveSelectedNodes(
      payload.userId,
      context.curriculumId,
      payload.selectedNodeIds
    );
    await Promise.all(
      nodes.map((node) =>
        this.curriculumService.recordEvaluation(
          payload.userId,
          context.curriculumId,
          {
            stableNodeKey: node.stableNodeKey,
            correct: payload.correct,
            stabilitySnapshot: payload.combinedScore,
            sessionId: payload.sessionId,
            evaluationId: payload.evaluationId,
            ...(sourceEventId !== undefined ? { sourceEventId } : {}),
          },
          correlationId
        )
      )
    );
  }

  private async handleTrigger(
    payload: IMetacognitionTriggerFiredPayload,
    correlationId: CorrelationId
  ): Promise<void> {
    const context = await this.resolveContext(payload.userId, payload.sessionId);
    if (context === null) return;

    const nodes = await this.resolveSelectedNodes(
      payload.userId,
      context.curriculumId,
      payload.selectedNodeIds
    );
    await Promise.all(
      nodes.map((node) =>
        this.curriculumService.recordRealignmentEvidence(
          payload.userId,
          context.curriculumId,
          {
            stableNodeKey: node.stableNodeKey,
            triggerType: payload.type,
            sessionId: payload.sessionId,
            weight: payload.severity,
          },
          correlationId
        )
      )
    );
  }

  private async resolveContext(
    userId: UserId,
    sessionId: SessionId
  ): Promise<{ curriculumId: CurriculumId } | null> {
    const context = await this.sessionClient.getSessionLearningContext({ userId, sessionId });
    if (context === null) {
      this.logger.warn({ userId, sessionId }, 'Skipping curriculum event without session context');
      return null;
    }
    return { curriculumId: context.curriculumId };
  }

  private async resolveSelectedNodes(
    userId: UserId,
    curriculumId: CurriculumId,
    selectedNodeIds: CurriculumNodeId[]
  ): Promise<CurriculumNode[]> {
    const graph = (await this.curriculumService.getActiveVersion(
      userId,
      curriculumId
    )) as CurriculumVersionGraph | undefined;
    if (graph === undefined) return [];
    const selectedNodeSet = new Set(selectedNodeIds);
    return graph.nodes.filter((node) => selectedNodeSet.has(node.id));
  }
}

function readEventId(envelope: IStreamEventEnvelope): EventId | undefined {
  return typeof envelope.eventId === 'string' && envelope.eventId.length > 0
    ? (envelope.eventId as EventId)
    : undefined;
}

function readCorrelationId(envelope: IStreamEventEnvelope): CorrelationId {
  const value = envelope.metadata['correlationId'];
  return (
    typeof value === 'string' && value.length > 0 ? value : `cor_${Date.now().toString(36)}`
  ) as CorrelationId;
}
