/**
 * @noema/knowledge-graph-service - Metrics Staleness Repository Interface
 *
 * Repository for tracking when a user's structural metrics need
 * recomputation. Upserted on every PKG mutation (node/edge CRUD).
 *
 * Phase 7's `computeMetrics` checks `lastStructuralChangeAt` against
 * the latest `StructuralMetricSnapshot.computedAt` to determine if
 * recomputation is needed.
 */

import type { UserId } from '@noema/types';

// ============================================================================
// Staleness Record
// ============================================================================

/**
 * A staleness record tracking the last structural change for a user+domain.
 */
export interface IMetricsStalenessRecord {
  /** Record ID */
  readonly id: string;

  /** Owner user ID */
  readonly userId: UserId;

  /** Knowledge domain */
  readonly domain: string;

  /** When the last structural change occurred (ISO 8601) */
  readonly lastStructuralChangeAt: string;

  /** What type of mutation triggered staleness */
  readonly lastMutationType: string;

  /** When the record was created (ISO 8601) */
  readonly createdAt: string;

  /** When the record was last updated (ISO 8601) */
  readonly updatedAt: string;
}

// ============================================================================
// IMetricsStalenessRepository
// ============================================================================

/**
 * Repository for metrics staleness tracking.
 *
 * Uses upsert semantics — one record per (userId, domain) pair.
 */
export interface IMetricsStalenessRepository {
  /**
   * Mark metrics as stale for a user+domain.
   * Upserts the staleness record with the current timestamp.
   *
   * @param userId The user whose metrics are stale.
   * @param domain The knowledge domain affected.
   * @param mutationType What type of mutation caused staleness.
   */
  markStale(userId: UserId, domain: string, mutationType: string): Promise<void>;

  /**
   * Check if metrics are stale for a user+domain.
   *
   * @param userId The user to check.
   * @param domain The knowledge domain.
   * @param lastComputedAt The timestamp of the last metric snapshot.
   * @returns True if there have been structural changes since lastComputedAt.
   */
  isStale(userId: UserId, domain: string, lastComputedAt: string): Promise<boolean>;

  /**
   * Get the staleness record for a user+domain.
   * @returns The record, or null if no mutations have occurred.
   */
  getStalenessRecord(userId: UserId, domain: string): Promise<IMetricsStalenessRecord | null>;
}
