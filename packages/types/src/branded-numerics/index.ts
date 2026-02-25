/**
 * @noema/types - Branded Numeric Types
 *
 * Type-safe branded numerics with factory functions for runtime validation.
 * These constrained numeric types prevent accidentally mixing semantically
 * different values that share the same underlying numeric representation
 * (e.g., passing a MasteryLevel where an EdgeWeight is expected).
 *
 * Follows the same Brand<T, TBrand> pattern used for branded IDs.
 */

import type { Brand } from '../branded-ids/index.js';

// ============================================================================
// EdgeWeight — edge relationship strength [0.0, 1.0]
// ============================================================================

/**
 * A number in [0.0, 1.0] representing the strength of a graph edge relationship.
 *
 * Used in both PKG and CKG edges. A weight of 0.0 means no relationship
 * (effectively absent), 1.0 means maximum strength.
 */
export type EdgeWeight = Brand<number, 'EdgeWeight'>;

/**
 * Factory and utilities for EdgeWeight branded numeric.
 */
export const EdgeWeight = {
  /**
   * Create an EdgeWeight from a raw number.
   * @param value - Must be in [0.0, 1.0]
   * @throws RangeError if value is outside [0.0, 1.0] or not finite
   */
  create(value: number): EdgeWeight {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`EdgeWeight must be in [0.0, 1.0], got: ${value}`);
    }
    return value as EdgeWeight;
  },

  /**
   * Create an EdgeWeight, clamping to [0.0, 1.0] instead of throwing.
   * Useful in lenient contexts (e.g., data migration, import pipelines).
   */
  clamp(value: number): EdgeWeight {
    if (!Number.isFinite(value)) {
      return 0 as EdgeWeight;
    }
    return Math.max(0, Math.min(1, value)) as EdgeWeight;
  },

  /**
   * Check if a value is a valid EdgeWeight.
   */
  isValid(value: unknown): value is EdgeWeight {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
  },
} as const;

// ============================================================================
// MasteryLevel — concept mastery [0.0, 1.0]
// ============================================================================

/**
 * A number in [0.0, 1.0] representing a user's mastery of a concept.
 *
 * 0.0 = no mastery (brand new concept), 1.0 = full mastery.
 * Used in PKG nodes and scheduling algorithms.
 */
export type MasteryLevel = Brand<number, 'MasteryLevel'>;

/**
 * Factory and utilities for MasteryLevel branded numeric.
 */
export const MasteryLevel = {
  /**
   * Create a MasteryLevel from a raw number.
   * @param value - Must be in [0.0, 1.0]
   * @throws RangeError if value is outside [0.0, 1.0] or not finite
   */
  create(value: number): MasteryLevel {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`MasteryLevel must be in [0.0, 1.0], got: ${value}`);
    }
    return value as MasteryLevel;
  },

  /**
   * Create a MasteryLevel, clamping to [0.0, 1.0] instead of throwing.
   */
  clamp(value: number): MasteryLevel {
    if (!Number.isFinite(value)) {
      return 0 as MasteryLevel;
    }
    return Math.max(0, Math.min(1, value)) as MasteryLevel;
  },

  /**
   * Check if a value is a valid MasteryLevel.
   */
  isValid(value: unknown): value is MasteryLevel {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
  },
} as const;

// ============================================================================
// ConfidenceScore — detection / metric confidence [0.0, 1.0]
// ============================================================================

/**
 * A number in [0.0, 1.0] representing confidence in a detection or metric.
 *
 * Used in misconception detection, aggregation evidence, and structural
 * metric confidence. Semantically distinct from EdgeWeight and MasteryLevel
 * despite sharing the same numeric range.
 */
export type ConfidenceScore = Brand<number, 'ConfidenceScore'>;

/**
 * Factory and utilities for ConfidenceScore branded numeric.
 */
export const ConfidenceScore = {
  /**
   * Create a ConfidenceScore from a raw number.
   * @param value - Must be in [0.0, 1.0]
   * @throws RangeError if value is outside [0.0, 1.0] or not finite
   */
  create(value: number): ConfidenceScore {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`ConfidenceScore must be in [0.0, 1.0], got: ${value}`);
    }
    return value as ConfidenceScore;
  },

  /**
   * Create a ConfidenceScore, clamping to [0.0, 1.0] instead of throwing.
   */
  clamp(value: number): ConfidenceScore {
    if (!Number.isFinite(value)) {
      return 0 as ConfidenceScore;
    }
    return Math.max(0, Math.min(1, value)) as ConfidenceScore;
  },

  /**
   * Check if a value is a valid ConfidenceScore.
   */
  isValid(value: unknown): value is ConfidenceScore {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
  },
} as const;
