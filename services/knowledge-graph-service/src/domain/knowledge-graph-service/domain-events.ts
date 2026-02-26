/**
 * @noema/knowledge-graph-service - Domain Events Catalog
 *
 * Re-exports the knowledge-graph domain events from @noema/events
 * and defines the event metadata contract. Provides a complete
 * view of both the synchronous interface (IKnowledgeGraphService)
 * and the asynchronous interface (domain events) in the domain layer.
 *
 * All event types, payload interfaces, and typed events are defined
 * in @noema/events/knowledge-graph. This file:
 * 1. Re-exports them for convenience
 * 2. Documents the event metadata contract
 * 3. Provides compile-time verification that every event type
 *    has a corresponding publisher wiring (Phase 7)
 */

// ============================================================================
// Re-export all event types from @noema/events
// ============================================================================

// Event type registry
export { KnowledgeGraphEventType } from '@noema/events';

// PKG event payloads
export type {
  IPkgEdgeCreatedPayload, IPkgEdgeRemovedPayload, IPkgEdgeUpdatedPayload, IPkgNodeCreatedPayload, IPkgNodeRemovedPayload, IPkgNodeUpdatedPayload, IPkgStructuralMetricsUpdatedPayload
} from '@noema/events';

// CKG event payloads
export type {
  ICkgMutationCommittedPayload, ICkgMutationProposedPayload, ICkgMutationRejectedPayload, ICkgMutationValidatedPayload, ICkgNodePromotedPayload
} from '@noema/events';

// Metacognitive event payloads
export type {
  IInterventionTriggeredPayload,
  IMetacognitiveStageTransitionedPayload, IMisconceptionDetectedPayload
} from '@noema/events';

// Typed event aliases
export type {
  CkgDomainEvent, CkgMutationCommittedEvent,
  // CKG
  CkgMutationProposedEvent, CkgMutationRejectedEvent, CkgMutationValidatedEvent, CkgNodePromotedEvent, InterventionTriggeredEvent, KnowledgeGraphDomainEvent, MetacognitiveDomainEvent, MetacognitiveStageTransitionedEvent,
  // Metacognitive
  MisconceptionDetectedEvent,
  // Union types
  PkgDomainEvent, PkgEdgeCreatedEvent, PkgEdgeRemovedEvent, PkgEdgeUpdatedEvent,
  // PKG
  PkgNodeCreatedEvent, PkgNodeRemovedEvent, PkgNodeUpdatedEvent, PkgStructuralMetricsUpdatedEvent
} from '@noema/events';

// ============================================================================
// Event Metadata Contract
// ============================================================================

/**
 * Standard metadata present on every published domain event.
 * Populated by the infrastructure layer (Phase 7); defined in the
 * domain layer as the contract that all events must satisfy.
 */
export interface IEventMetadata {
  /** Unique event identifier (generated) */
  readonly eventId: string;

  /** Discriminator string matching the event name */
  readonly eventType: string;

  /** When the event occurred (ISO 8601) */
  readonly timestamp: string;

  /** Correlation ID from the originating request */
  readonly correlationId: string;

  /** The event or request ID that caused this event */
  readonly causationId: string;

  /** Service that produced the event */
  readonly serviceName: 'knowledge-graph-service';

  /** Event schema version for forward compatibility */
  readonly version: number;
}
