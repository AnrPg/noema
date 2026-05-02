import {
  BaseEventConsumer,
  type IEventConsumerConfig,
  type IStreamEventEnvelope,
} from '@noema/events/consumer';
import { SessionEventType, type ISessionCompletedPayload } from '@noema/events/session';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { CorrelationId } from '@noema/types';
import type { GamificationService } from '../../domain/gamification-service/index.js';

function buildConfig(overrides: {
  sourceStreamKey: string;
  consumerName: string;
}): IEventConsumerConfig {
  return {
    sourceStreamKey: overrides.sourceStreamKey,
    consumerGroup: 'gamification-service:session-completed',
    consumerName: overrides.consumerName,
    batchSize: 20,
    blockMs: 5000,
    retryBaseDelayMs: 250,
    maxProcessAttempts: 5,
    pendingIdleMs: 30_000,
    pendingBatchSize: 50,
    drainTimeoutMs: 15_000,
    deadLetterStreamKey: 'noema:dlq:gamification-service:session-completed',
  };
}

export class SessionCompletedConsumer extends BaseEventConsumer {
  constructor(
    redis: Redis,
    logger: Logger,
    consumerName: string,
    private readonly gamificationService: GamificationService,
    sourceStreamKey = 'noema:events:session-service'
  ) {
    super(redis, buildConfig({ sourceStreamKey, consumerName }), logger);
  }

  protected async handleEvent(envelope: IStreamEventEnvelope): Promise<boolean> {
    if (envelope.eventType !== SessionEventType.SESSION_COMPLETED) {
      return true;
    }

    await this.gamificationService.applySessionCompletedEvent(
      envelope.payload as unknown as ISessionCompletedPayload,
      {
        eventId: envelope.eventId ?? `${envelope.aggregateId}:${envelope.eventType}`,
        eventType: envelope.eventType,
        ...(typeof envelope.metadata['correlationId'] === 'string'
          ? { correlationId: envelope.metadata['correlationId'] as CorrelationId }
          : {}),
      }
    );
    return true;
  }
}
