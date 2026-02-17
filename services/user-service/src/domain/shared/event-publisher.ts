/**
 * @noema/user-service - Event Publisher Interface
 *
 * Abstract interface for publishing domain events.
 */

import type { CorrelationId, UserId } from '@noema/types';

/**
 * Event to publish.
 */
export interface IEventToPublish {
  /** Event type (e.g., 'user.created') */
  eventType: string;
  /** Aggregate type (e.g., 'User') */
  aggregateType: string;
  /** Aggregate ID */
  aggregateId: string;
  /** Event payload */
  payload: unknown;
  /** Event metadata */
  metadata: {
    correlationId: CorrelationId;
    userId?: UserId | null;
    causationId?: string;
  };
}

/**
 * Event publisher interface.
 * Implementations can use Redis Streams, Kafka, etc.
 */
export interface IEventPublisher {
  /**
   * Publish an event.
   */
  publish(event: IEventToPublish): Promise<void>;

  /**
   * Publish multiple events atomically.
   */
  publishBatch(events: IEventToPublish[]): Promise<void>;
}

/**
 * Symbol for dependency injection.
 */
export const EVENT_PUBLISHER = Symbol.for('IEventPublisher');
