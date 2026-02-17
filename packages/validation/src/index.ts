/**
 * @noema/validation
 *
 * Zod validation schemas for all Noema types.
 * This package provides runtime validation for data crossing service boundaries.
 *
 * @packageDocumentation
 */

export const VERSION = '0.1.0';

// Re-export Zod for convenience
export { z } from 'zod';
export type { ZodError, ZodIssue, ZodSchema, ZodType } from 'zod';

// ============================================================================
// ID Schemas
// ============================================================================
export * from './ids.js';

// ============================================================================
// Base Entity Schemas
// ============================================================================
export * from './base.js';

// ============================================================================
// Domain Enum Schemas
// ============================================================================
export * from './enums.js';

// ============================================================================
// Mental Debugger Schemas
// ============================================================================
export * from './mental-debugger.js';
