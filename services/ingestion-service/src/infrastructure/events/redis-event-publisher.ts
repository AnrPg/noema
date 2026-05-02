import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { IEventPublisher } from '../../domain/shared/event-publisher.js';

export class RedisIngestionEventPublisher implements IEventPublisher {
  constructor(
    private readonly redis: Redis,
    private readonly source: string,
    private readonly logger: Logger
  ) {}

  async publish(input: Parameters<IEventPublisher['publish']>[0]): Promise<void> {
    const event = {
      id: `${input.eventType}:${input.aggregateId}:${String(Date.now())}`,
      type: input.eventType,
      source: this.source,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      payload: input.payload,
      metadata: input.metadata,
      occurredAt: new Date().toISOString(),
    };
    await this.redis.xadd(`events:${input.eventType}`, '*', 'event', JSON.stringify(event));
    await this.redis.publish('events', JSON.stringify(event));
    this.logger.debug(
      { eventType: input.eventType, aggregateId: input.aggregateId },
      'Published ingestion event'
    );
  }
}
