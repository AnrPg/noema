/**
 * @noema/events
 *
 * Event definitions and schemas for Noema's event-driven architecture.
 * All services communicate via immutable events defined here.
 *
 * @packageDocumentation
 */

export const VERSION = '0.1.0';

// ============================================================================
// Event Types
// ============================================================================
export type * from './types.js';

// ============================================================================
// Zod Schemas
// ============================================================================
export * from './schemas.js';
