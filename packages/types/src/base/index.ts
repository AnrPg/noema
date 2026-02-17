/**
 * @noema/types - Base Entity Types
 *
 * Common interfaces and utilities used across all domain entities.
 */

// ============================================================================
// Timestamp Fields
// ============================================================================

/**
 * Standard timestamp fields for all entities.
 */
export interface Timestamps {
  /** When entity was created (ISO 8601) */
  createdAt: string;
  /** When entity was last updated (ISO 8601) */
  updatedAt: string;
}

/**
 * Soft-delete support.
 */
export interface SoftDeletable {
  /** When entity was soft-deleted (ISO 8601), null if active */
  deletedAt: string | null;
}

// ============================================================================
// Versioning
// ============================================================================

/**
 * Optimistic locking version field.
 */
export interface Versioned {
  /** Version for optimistic concurrency control */
  version: number;
}

// ============================================================================
// Audit Fields
// ============================================================================

/**
 * Full audit trail fields.
 */
export interface Auditable {
  /** User who created this entity */
  createdBy: string;
  /** User who last updated this entity */
  updatedBy: string;
}

// ============================================================================
// Combined Base Types
// ============================================================================

/**
 * Standard entity with timestamps and version.
 */
export interface BaseEntity extends Timestamps, Versioned {}

/**
 * Full-featured entity with audit trail.
 */
export interface AuditedEntity extends BaseEntity, Auditable, SoftDeletable {}

// ============================================================================
// Pagination
// ============================================================================

/**
 * Cursor-based pagination request.
 */
export interface CursorPagination {
  /** Cursor for next page */
  cursor?: string;
  /** Number of items per page */
  limit: number;
}

/**
 * Offset-based pagination request.
 */
export interface OffsetPagination {
  /** Page offset (0-indexed) */
  offset: number;
  /** Number of items per page */
  limit: number;
}

/**
 * Paginated response wrapper.
 */
export interface PaginatedResponse<T> {
  /** Items in this page */
  items: T[];
  /** Total count (if available) */
  total?: number;
  /** Cursor for next page (cursor pagination) */
  nextCursor?: string;
  /** Whether more items exist */
  hasMore: boolean;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Discriminated union for operation results.
 * Prefer this over throwing exceptions for expected failures.
 */
export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

/**
 * Helper to create success result.
 */
export function ok<T>(data: T): Result<T, never> {
  return { success: true, data };
}

/**
 * Helper to create failure result.
 */
export function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

/**
 * Async result type.
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Make specific properties optional.
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Make specific properties required.
 */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/**
 * Deep partial (all nested properties optional).
 */
export type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T;

/**
 * Non-nullable version of a type.
 */
export type NonNullableFields<T> = {
  [P in keyof T]: NonNullable<T[P]>;
};

/**
 * Extract nullable fields from a type.
 */
export type NullableKeys<T> = {
  [K in keyof T]: null extends T[K] ? K : never;
}[keyof T];

/**
 * JSON-safe types (no functions, symbols, etc.).
 */
export type JsonPrimitive = string | number | boolean | null;
export type JsonArray = JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

// ============================================================================
// Metadata Types
// ============================================================================

/**
 * Flexible metadata storage (JSON-compatible).
 */
export type Metadata = Record<string, JsonValue>;

/**
 * Entity with metadata support.
 */
export interface WithMetadata {
  /** Arbitrary metadata (JSON-compatible) */
  metadata?: Metadata;
}

// ============================================================================
// Time Intervals
// ============================================================================

/**
 * ISO 8601 duration string.
 * Examples: "PT30M" (30 minutes), "P1D" (1 day)
 */
export type Duration = string;

/**
 * Time range with start and optional end.
 */
export interface TimeRange {
  /** Start time (ISO 8601) */
  start: string;
  /** End time (ISO 8601), null if ongoing */
  end: string | null;
}

// ============================================================================
// Confidence / Probability
// ============================================================================

/**
 * Confidence score (0-1 range).
 */
export type Confidence = number;

/**
 * Probability value (0-1 range).
 */
export type Probability = number;

/**
 * Percentage value (0-100 range).
 */
export type Percentage = number;

// ============================================================================
// Coordinates
// ============================================================================

/**
 * 2D coordinates.
 */
export interface Point2D {
  x: number;
  y: number;
}

/**
 * Rectangular region.
 */
export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Structured error for API responses.
 */
export interface ApiError {
  /** Error code (machine-readable) */
  code: string;
  /** Human-readable message */
  message: string;
  /** Additional details */
  details?: JsonObject;
  /** Stack trace (dev only) */
  stack?: string;
}

/**
 * Validation error with field-level details.
 */
export interface ValidationError extends ApiError {
  /** Field-specific errors */
  fieldErrors: Record<string, string[]>;
}
