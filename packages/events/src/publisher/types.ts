/**
 * @noema/events - Event Publisher Interface
 *
 * Abstract interface for publishing domain events.
 * Implementations can use Redis Streams, Kafka, etc.
 *
 * Previously duplicated across content-service, session-service, and
 * user-service — now centralized here as the single source of truth.
 */

import type { CorrelationId, UserId } from '@noema/types';

// ============================================================================
// Types
// ============================================================================

/**
 * Event to publish.
 */
export interface IEventToPublish {
  /** Event type (e.g., 'card.created', 'session.started') */
  eventType: string;
  /** Aggregate type (e.g., 'Card', 'Session', 'User') */
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
   * Publish a single event.
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
