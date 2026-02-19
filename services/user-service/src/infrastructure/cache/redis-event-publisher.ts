/**
 * @noema/user-service - Redis Event Publisher
 *
 * Event publisher implementation using Redis Streams.
 */

import { ID_PREFIXES, type Environment, type EventId } from '@noema/types';
import type { Redis } from 'ioredis';
import { nanoid } from 'nanoid';
import type { Logger } from 'pino';
import type { IEventPublisher, IEventToPublish } from '../../domain/shared/event-publisher.js';

// ============================================================================
// Configuration
// ============================================================================

export interface IRedisEventPublisherConfig {
  streamKey: string;
  maxLen: number;
  serviceName: string;
  serviceVersion: string;
  environment: Environment;
}

// ============================================================================
// Implementation
// ============================================================================

export class RedisEventPublisher implements IEventPublisher {
  private readonly logger: Logger;

  constructor(
    private readonly redis: Redis,
    private readonly config: IRedisEventPublisherConfig,
    logger: Logger
  ) {
    this.logger = logger.child({ component: 'RedisEventPublisher' });
  }

  async publish(event: IEventToPublish): Promise<void> {
    const eventId = `${ID_PREFIXES.EventId}${nanoid(21)}` as EventId;
    const timestamp = new Date().toISOString();

    const fullEvent = {
      eventId,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      version: 1,
      timestamp,
      metadata: {
        serviceName: this.config.serviceName,
        serviceVersion: this.config.serviceVersion,
        environment: this.config.environment,
        userId: event.metadata.userId || null,
        correlationId: event.metadata.correlationId,
        causationId: event.metadata.causationId || null,
      },
      payload: event.payload,
    };

    try {
      await this.redis.xadd(
        this.config.streamKey,
        'MAXLEN',
        '~',
        this.config.maxLen.toString(),
        '*',
        'event',
        JSON.stringify(fullEvent)
      );

      this.logger.debug(
        { eventId, eventType: event.eventType, aggregateId: event.aggregateId },
        'Event published'
      );
    } catch (error) {
      this.logger.error({ error, eventId, eventType: event.eventType }, 'Failed to publish event');
      throw error;
    }
  }

  async publishBatch(events: IEventToPublish[]): Promise<void> {
    const pipeline = this.redis.pipeline();
    const timestamp = new Date().toISOString();

    for (const event of events) {
      const eventId = `${ID_PREFIXES.EventId}${nanoid(21)}` as EventId;

      const fullEvent = {
        eventId,
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        version: 1,
        timestamp,
        metadata: {
          serviceName: this.config.serviceName,
          serviceVersion: this.config.serviceVersion,
          environment: this.config.environment,
          userId: event.metadata.userId || null,
          correlationId: event.metadata.correlationId,
          causationId: event.metadata.causationId || null,
        },
        payload: event.payload,
      };

      pipeline.xadd(
        this.config.streamKey,
        'MAXLEN',
        '~',
        this.config.maxLen.toString(),
        '*',
        'event',
        JSON.stringify(fullEvent)
      );
    }

    try {
      await pipeline.exec();
      this.logger.debug({ count: events.length }, 'Batch events published');
    } catch (error) {
      this.logger.error({ error, count: events.length }, 'Failed to publish batch events');
      throw error;
    }
  }
}
