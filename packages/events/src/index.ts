/**
 * @noema/events
 *
 * Event definitions and schemas for Noema's event-driven architecture.
 * All services communicate via immutable events defined here.
 *
 * Sub-path exports available for tree-shaking:
 *   @noema/events/session   — Session domain events
 *   @noema/events/scheduler — Scheduler domain events
 *   @noema/events/content   — Content domain events
 *   @noema/events/user      — User domain events
 *   @noema/events/publisher  — Event publisher interface + Redis implementation
 *   @noema/events/consumer  — Base event consumer + Redis Streams lifecycle
 *
 * @packageDocumentation
 */

export const VERSION = '0.1.0';

// ============================================================================
// Base Event Types
// ============================================================================
export type * from './types.js';

// ============================================================================
// Base Zod Schemas
// ============================================================================
export * from './schemas.js';

// ============================================================================
// Event Publisher Infrastructure
// ============================================================================
export * from './publisher/index.js';

// ============================================================================
// Session Domain Events
// ============================================================================
export * from './session/session-event.schemas.js';
export type * from './session/session.events.js';

// ============================================================================
// Scheduler Domain Events
// ============================================================================
export * from './scheduler/scheduler-event.schemas.js';
export type * from './scheduler/scheduler.events.js';

// ============================================================================
// Content Domain Events
// ============================================================================
export * from './content/content-event.schemas.js';
export type * from './content/content.events.js';

// ============================================================================
// User Domain Events
// ============================================================================
export * from './user/user-event.schemas.js';
export type * from './user/user.events.js';

// ============================================================================
// Knowledge Graph Domain Events
// ============================================================================
export * from './knowledge-graph/knowledge-graph-event.schemas.js';
export * from './knowledge-graph/knowledge-graph.events.js';

// ============================================================================
// Event Consumer Infrastructure
// ============================================================================
export * from './consumer/index.js';
