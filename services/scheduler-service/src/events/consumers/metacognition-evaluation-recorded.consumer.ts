import {
  MetacognitionEventType,
  type IMetacognitionEvaluationRecordedPayload,
} from '@noema/events';
import {
  BaseEventConsumer,
  type IEventConsumerConfig,
  type IStreamEventEnvelope,
} from '@noema/events/consumer';
import type { CorrelationId } from '@noema/types';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

import type { SchedulerService } from '../../domain/scheduler-service/scheduler.service.js';

function buildConfig(overrides: {
  sourceStreamKey: string;
  consumerName: string;
}): IEventConsumerConfig {
  return {
    sourceStreamKey: overrides.sourceStreamKey,
    consumerGroup: 'scheduler-service:metacognition-evaluation-recorded',
    consumerName: overrides.consumerName,
    batchSize: 20,
    blockMs: 5000,
    retryBaseDelayMs: 250,
    maxProcessAttempts: 5,
    pendingIdleMs: 30_000,
    pendingBatchSize: 50,
    drainTimeoutMs: 15_000,
    deadLetterStreamKey: 'noema:dlq:scheduler-service:metacognition-evaluation-recorded',
  };
}

export class MetacognitionEvaluationRecordedConsumer extends BaseEventConsumer {
  public constructor(
    redis: Redis,
    logger: Logger,
    consumerName: string,
    private readonly schedulerService: SchedulerService,
    sourceStreamKey = 'noema:events:metacognition-service'
  ) {
    super(redis, buildConfig({ sourceStreamKey, consumerName }), logger);
  }

  protected async handleEvent(envelope: IStreamEventEnvelope): Promise<boolean> {
    if (envelope.eventType !== MetacognitionEventType.METACOGNITION_EVALUATION_RECORDED) {
      return true;
    }

    const payload = envelope.payload as unknown as IMetacognitionEvaluationRecordedPayload;
    await this.schedulerService.recordEvaluation(payload, {
      userId: payload.userId,
      correlationId:
        typeof envelope.metadata['correlationId'] === 'string'
          ? (envelope.metadata['correlationId'] as CorrelationId)
          : (`correlation_${Date.now().toString(36)}` as CorrelationId),
    });
    return true;
  }
}
