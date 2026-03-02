/**
 * @noema/knowledge-graph-service - Local Branded Numeric Types
 *
 * KG-specific branded numeric types that do not belong in the shared
 * @noema/types package. Cross-service types (EdgeWeight, MasteryLevel,
 * ConfidenceScore) live in @noema/types/branded-numerics.
 */

import type { Brand } from '@noema/types';

// ============================================================================
// PositiveDepth
// ============================================================================

/**
 * A positive integer (≥ 1) used for `maxDepth` in traversal options.
 *
 * Prevents nonsensical depth values like 0, -1, or 3.7 at the type level.
 * Only the knowledge-graph-service uses traversal depths, so this type
 * is local rather than shared.
 */
export type PositiveDepth = Brand<number, 'PositiveDepth'>;

/**
 * Factory and utilities for `PositiveDepth`.
 */
export const PositiveDepth = {
  /**
   * Create a `PositiveDepth` from a raw number.
   * @throws Error if value is not a positive integer (≥ 1).
   */
  create(value: number): PositiveDepth {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`PositiveDepth must be a positive integer (≥ 1), received: ${String(value)}`);
    }
    return value as PositiveDepth;
  },

  /**
   * Check if a value is a valid PositiveDepth candidate.
   */
  isValid(value: number): boolean {
    return Number.isInteger(value) && value >= 1;
  },

  /**
   * Common depth presets.
   */
  presets: Object.freeze({
    /** Default traversal depth */
    DEFAULT: 3 as PositiveDepth,
    /** Shallow traversal (direct neighbors only) */
    SHALLOW: 1 as PositiveDepth,
    /** Deep traversal (for full subgraph extraction) */
    DEEP: 10 as PositiveDepth,
    /** Maximum safe depth (prevent runaway queries) */
    MAX_SAFE: 50 as PositiveDepth,
  }),
};
