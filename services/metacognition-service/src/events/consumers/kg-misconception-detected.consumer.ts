import {
  KnowledgeGraphEventType,
  type IMisconceptionDetectedPayload,
} from '@noema/events/knowledge-graph';
import {
  BaseEventConsumer,
  type IEventConsumerConfig,
  type IStreamEventEnvelope,
} from '@noema/events/consumer';
import { StepSelfRating, StudyMode, TransformationType, type CorrelationId } from '@noema/types';
import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

import type { MetacognitionService } from '../../domain/metacognition-service/index.js';

function buildConfig(overrides: {
  sourceStreamKey: string;
  consumerName: string;
}): IEventConsumerConfig {
  return {
    sourceStreamKey: overrides.sourceStreamKey,
    consumerGroup: 'metacognition-service:kg-misconception-detected',
    consumerName: overrides.consumerName,
    batchSize: 20,
    blockMs: 5000,
    retryBaseDelayMs: 250,
    maxProcessAttempts: 5,
    pendingIdleMs: 30_000,
    pendingBatchSize: 50,
    drainTimeoutMs: 15_000,
    deadLetterStreamKey: 'noema:dlq:metacognition-service:kg-misconception-detected',
  };
}

export class KgMisconceptionDetectedConsumer extends BaseEventConsumer {
  public constructor(
    redis: Redis,
    logger: Logger,
    consumerName: string,
    private readonly metacognitionService: MetacognitionService,
    sourceStreamKey = 'noema:events:knowledge-graph-service'
  ) {
    super(redis, buildConfig({ sourceStreamKey, consumerName }), logger);
  }

  protected async handleEvent(envelope: IStreamEventEnvelope): Promise<boolean> {
    if (envelope.eventType !== KnowledgeGraphEventType.MISCONCEPTION_DETECTED) {
      return true;
    }

    const payload = envelope.payload as unknown as IMisconceptionDetectedPayload;
    const eventKey = envelope.eventId ?? envelope.aggregateId;
    const idSuffix = createHash('sha256').update(eventKey).digest('hex').slice(0, 21);
    const conceptRefs = payload.affectedNodeIds.map((nodeId) => String(nodeId));

    await this.metacognitionService.recordEvaluation(
      {
        evaluationId: `eval_${idSuffix}`,
        stepId: `step_${idSuffix}`,
        lessonPlanId: `lesson_${idSuffix}`,
        sessionId: `session_${idSuffix}`,
        userId: payload.userId,
        conceptRefs,
        correct: false,
        selfRating: StepSelfRating.DIDNT_KNOW,
        trace: {
          frames: {
            f0: {
              score: payload.confidence,
              notes: 'Knowledge graph misconception event supplied the evaluation context.',
            },
            f1: {
              score: payload.confidence,
              notes: `Detected misconception type: ${payload.misconceptionType}`,
            },
            f2: {
              score: payload.confidence,
              notes: 'Affected concept references were extracted from the event payload.',
            },
            f3: {
              score: 0,
              notes: 'No learner retrieval trace is available for synthetic KG bridge events.',
            },
            f4: {
              score: payload.confidence,
              notes: 'Synthetic transformation records error detection evidence.',
            },
            f5: {
              score: 0,
              notes: 'Learner self-check is unknown for synthetic KG bridge events.',
            },
            f6: {
              score: payload.confidence,
              notes: JSON.stringify(payload.evidence),
            },
          },
        },
        errorType: payload.misconceptionType,
        misconceptionRef: payload.patternId,
        recentFailures: 1,
        prerequisiteGapConceptIds: conceptRefs,
        studyMode: StudyMode.KNOWLEDGE_GAINING,
        transformation: TransformationType.ERROR_DETECTION,
      },
      {
        userId: payload.userId,
        correlationId:
          typeof envelope.metadata['correlationId'] === 'string'
            ? (envelope.metadata['correlationId'] as CorrelationId)
            : (`correlation_${Date.now().toString(36)}` as CorrelationId),
      }
    );

    return true;
  }
}
