import {
  StepEventType,
  type IStepAnsweredEventPayload,
} from '@noema/events';
import {
  BaseEventConsumer,
  type IEventConsumerConfig,
  type IStreamEventEnvelope,
} from '@noema/events/consumer';
import type { CorrelationId } from '@noema/types';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

import type { MetacognitionService } from '../../domain/metacognition-service/index.js';

function buildConfig(overrides: {
  sourceStreamKey: string;
  consumerName: string;
}): IEventConsumerConfig {
  return {
    sourceStreamKey: overrides.sourceStreamKey,
    consumerGroup: 'metacognition-service:step-answered',
    consumerName: overrides.consumerName,
    batchSize: 20,
    blockMs: 5000,
    retryBaseDelayMs: 250,
    maxProcessAttempts: 5,
    pendingIdleMs: 30_000,
    pendingBatchSize: 50,
    drainTimeoutMs: 15_000,
    deadLetterStreamKey: 'noema:dlq:metacognition-service:step-answered',
  };
}

export class StepAnsweredConsumer extends BaseEventConsumer {
  public constructor(
    redis: Redis,
    logger: Logger,
    consumerName: string,
    private readonly metacognitionService: MetacognitionService,
    sourceStreamKey = 'noema:events:session-service'
  ) {
    super(redis, buildConfig({ sourceStreamKey, consumerName }), logger);
  }

  protected async handleEvent(envelope: IStreamEventEnvelope): Promise<boolean> {
    if (envelope.eventType !== StepEventType.STEP_ANSWERED) {
      return true;
    }

    await this.metacognitionService.recordEvaluation(
      envelope.payload as unknown as IStepAnsweredEventPayload,
      {
        userId: (envelope.payload['userId'] ?? 'anonymous') as never,
        correlationId:
          typeof envelope.metadata['correlationId'] === 'string'
            ? (envelope.metadata['correlationId'] as CorrelationId)
            : (`correlation_${Date.now().toString(36)}` as CorrelationId),
      }
    );

    return true;
  }
}
