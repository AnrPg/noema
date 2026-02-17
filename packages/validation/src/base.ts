/**
 * @noema/validation - Base Entity Schemas
 *
 * Zod schemas for common base types used across all entities.
 */

import { z } from 'zod';

// ============================================================================
// Timestamp Schemas
// ============================================================================

/**
 * ISO 8601 datetime string schema.
 */
export const IsoDateTimeSchema = z
  .string()
  .datetime({ message: 'Invalid ISO 8601 datetime format' })
  .describe('ISO 8601 datetime string');

/**
 * Standard timestamps for all entities.
 */
export const TimestampsSchema = z.object({
  createdAt: IsoDateTimeSchema.describe('When entity was created'),
  updatedAt: IsoDateTimeSchema.describe('When entity was last updated'),
});

/**
 * Soft-delete support.
 */
export const SoftDeletableSchema = z.object({
  deletedAt: IsoDateTimeSchema.nullable().describe('When entity was soft-deleted, null if active'),
});

// ============================================================================
// Versioning
// ============================================================================

/**
 * Optimistic locking version field.
 */
export const VersionedSchema = z.object({
  version: z.number().int().nonnegative().describe('Version for optimistic concurrency control'),
});

// ============================================================================
// Audit Fields
// ============================================================================

/**
 * Full audit trail fields.
 */
export const AuditableSchema = z.object({
  createdBy: z.string().describe('User who created this entity'),
  updatedBy: z.string().describe('User who last updated this entity'),
});

// ============================================================================
// Combined Base Types
// ============================================================================

/**
 * Standard entity with timestamps and version.
 */
export const BaseEntitySchema = TimestampsSchema.merge(VersionedSchema);

/**
 * Full-featured entity with audit trail.
 */
export const AuditedEntitySchema =
  BaseEntitySchema.merge(AuditableSchema).merge(SoftDeletableSchema);

// ============================================================================
// Pagination
// ============================================================================

/**
 * Cursor-based pagination request.
 */
export const CursorPaginationSchema = z.object({
  cursor: z.string().optional().describe('Cursor for next page'),
  limit: z.number().int().positive().max(100).default(20).describe('Number of items per page'),
});

/**
 * Offset-based pagination request.
 */
export const OffsetPaginationSchema = z.object({
  offset: z.number().int().nonnegative().default(0).describe('Page offset (0-indexed)'),
  limit: z.number().int().positive().max(100).default(20).describe('Number of items per page'),
});

/**
 * Create a paginated response schema for any item type.
 */
export function createPaginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema).describe('Items in this page'),
    total: z.number().int().nonnegative().optional().describe('Total count'),
    nextCursor: z.string().optional().describe('Cursor for next page'),
    hasMore: z.boolean().describe('Whether more items exist'),
  });
}

// ============================================================================
// Time Intervals
// ============================================================================

/**
 * ISO 8601 duration string.
 */
export const DurationSchema = z
  .string()
  .regex(
    /^P(?:\d+Y)?(?:\d+M)?(?:\d+W)?(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$/,
    'Invalid ISO 8601 duration format'
  )
  .describe('ISO 8601 duration (e.g., "PT30M", "P1D")');

/**
 * Time range with start and optional end.
 */
export const TimeRangeSchema = z.object({
  start: IsoDateTimeSchema.describe('Start time'),
  end: IsoDateTimeSchema.nullable().describe('End time, null if ongoing'),
});

// ============================================================================
// Confidence / Probability
// ============================================================================

/**
 * Confidence score (0-1 range).
 */
export const ConfidenceSchema = z.number().min(0).max(1).describe('Confidence score (0-1)');

/**
 * Probability value (0-1 range).
 */
export const ProbabilitySchema = z.number().min(0).max(1).describe('Probability value (0-1)');

/**
 * Percentage value (0-100 range).
 */
export const PercentageSchema = z.number().min(0).max(100).describe('Percentage value (0-100)');

// ============================================================================
// Coordinates
// ============================================================================

/**
 * 2D coordinates.
 */
export const Point2DSchema = z.object({
  x: z.number().describe('X coordinate'),
  y: z.number().describe('Y coordinate'),
});

/**
 * Rectangular region.
 */
export const RectangleSchema = z.object({
  x: z.number().describe('X position'),
  y: z.number().describe('Y position'),
  width: z.number().positive().describe('Width'),
  height: z.number().positive().describe('Height'),
});

// ============================================================================
// Metadata
// ============================================================================

/**
 * JSON-compatible value.
 */
export const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ])
);

/**
 * Flexible metadata storage.
 */
export const MetadataSchema = z
  .record(JsonValueSchema)
  .describe('Arbitrary metadata (JSON-compatible)');

// ============================================================================
// Error Types
// ============================================================================

/**
 * Structured error for API responses.
 */
export const ApiErrorSchema = z.object({
  code: z.string().describe('Error code (machine-readable)'),
  message: z.string().describe('Human-readable message'),
  details: z.record(JsonValueSchema).optional().describe('Additional details'),
  stack: z.string().optional().describe('Stack trace (dev only)'),
});

/**
 * Validation error with field-level details.
 */
export const ValidationErrorSchema = ApiErrorSchema.extend({
  fieldErrors: z.record(z.array(z.string())).describe('Field-specific errors'),
});

// ============================================================================
// Type Inference
// ============================================================================

export type TimestampsInput = z.input<typeof TimestampsSchema>;
export type BaseEntityInput = z.input<typeof BaseEntitySchema>;
export type AuditedEntityInput = z.input<typeof AuditedEntitySchema>;
export type CursorPaginationInput = z.input<typeof CursorPaginationSchema>;
export type OffsetPaginationInput = z.input<typeof OffsetPaginationSchema>;
export type TimeRangeInput = z.input<typeof TimeRangeSchema>;
export type MetadataInput = z.input<typeof MetadataSchema>;
export type ApiErrorInput = z.input<typeof ApiErrorSchema>;
export type ValidationErrorInput = z.input<typeof ValidationErrorSchema>;
