/**
 * @noema/events - Base Event Types
 *
 * Core interfaces for the event-driven architecture.
 * All events MUST conform to these structures.
 */

import type {
  AgentId,
  CausationId,
  CorrelationId,
  Environment,
  EventId,
  Metadata,
  SessionId,
  UserId,
} from '@noema/types';

// ============================================================================
// Event Identity
// ============================================================================

/**
 * Event type string format: {aggregate}.{action} or {aggregate}.{subresource}.{action}
 * Examples: "card.created", "user.settings.changed"
 */
export type EventType = string;

/**
 * Aggregate type. PascalCase entity name.
 * Examples: "Card", "User", "Session", "Deck"
 */
export type AggregateType = string;

/**
 * Aggregate ID - the entity ID this event is about.
 */
export type AggregateId = string;

// ============================================================================
// Event Metadata
// ============================================================================

/**
 * Required metadata for all events.
 */
export interface IEventMetadata {
  /** Service that published the event (e.g., "content-service") */
  serviceName: string;

  /** Semantic version of the publishing service */
  serviceVersion: string;

  /** Environment where event was published */
  environment: Environment;

  /** User who triggered the event (null for system events) */
  userId?: UserId | null;

  /** Session when event occurred */
  sessionId?: SessionId | null;

  /** UUID linking all events in a request flow */
  correlationId: CorrelationId;

  /** EventId of the event that caused this event */
  causationId?: CausationId | null;

  /** Agent that triggered the event (if agent-initiated) */
  agentId?: AgentId | null;

  /** Client IP for audit (anonymize if required) */
  clientIp?: string | null;

  /** Browser/client user agent */
  userAgent?: string | null;

  /** Additional flexible metadata */
  additional?: Metadata;
}

// ============================================================================
// Base Event Structure
// ============================================================================

/**
 * Base structure for all events in Noema.
 *
 * @typeParam TPayload - The event-specific payload type
 */
export interface IBaseEvent<TPayload = unknown> {
  /** Globally unique event identifier (UUID v4) */
  eventId: EventId;

  /** Event type: {aggregate}.{action} (lowercase, past tense) */
  eventType: EventType;

  /** Entity type this event is about (PascalCase) */
  aggregateType: AggregateType;

  /** ID of the specific entity instance */
  aggregateId: AggregateId;

  /** Schema version of this event (starts at 1) */
  version: number;

  /** When the event occurred (ISO 8601 UTC) */
  timestamp: string;

  /** Event metadata for tracing and context */
  metadata: IEventMetadata;

  /** Event-specific data */
  payload: TPayload;
}

// ============================================================================
// Typed Event Helper
// ============================================================================

/**
 * Create a strongly-typed event interface.
 */
export interface ITypedEvent<
  TEventType extends string,
  TAggregateType extends string,
  TPayload,
> extends IBaseEvent<TPayload> {
  eventType: TEventType;
  aggregateType: TAggregateType;
}
