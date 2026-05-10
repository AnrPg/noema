/**
 * @noema/events - Redis Event Publisher
 *
 * Event publisher implementation using Redis Streams.
 * Previously duplicated across content-service, session-service, and
 * user-service — now centralized here as the single source of truth.
 *
 * Uses Redis XADD with MAXLEN trimming for bounded stream growth.
 */

import { ID_PREFIXES, type Environment, type EventId } from '@noema/types';
import type { Redis } from 'ioredis';
import { nanoid } from 'nanoid';
import type { Logger } from 'pino';
import type { IEventPublisher, IEventToPublish } from './types.js';

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
        userId: event.metadata.userId ?? null,
        correlationId: event.metadata.correlationId,
        causationId: event.metadata.causationId ?? null,
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
          userId: event.metadata.userId ?? null,
          correlationId: event.metadata.correlationId,
          causationId: event.metadata.causationId ?? null,
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
      const results = await pipeline.exec();
      if (results === null) {
        throw new Error('Redis pipeline did not return batch publish results');
      }
      const failures = results
        .map(([error], index) => ({ error, event: events[index] }))
        .filter((result) => result.error !== null);
      if (failures.length > 0) {
        throw new Error(
          `Failed to publish ${failures.length.toString()} batch event(s): ${failures
            .map((failure) => {
              const eventType = failure.event?.eventType ?? 'unknown';
              const message = failure.error?.message ?? 'unknown error';
              return `${eventType}:${message}`;
            })
            .join(', ')}`
        );
      }
      this.logger.debug({ count: events.length }, 'Batch events published');
    } catch (error) {
      this.logger.error({ error, count: events.length }, 'Failed to publish batch events');
      throw error;
    }
  }
}
