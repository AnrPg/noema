/**
 * @noema/knowledge-graph-service - Metrics Repository Interface
 *
 * Repository for structural metric snapshots. Metrics change every time
 * a user's PKG changes; this repository tracks them over time so the
 * system can detect trends ("your Abstraction Drift has been worsening
 * over the last week").
 */

import type { IStructuralMetrics, UserId } from '@noema/types';

// ============================================================================
// Snapshot Types
// ============================================================================

/**
 * A point-in-time structural metric snapshot.
 */
export interface IMetricSnapshot {
  /** Snapshot ID */
  readonly id: string;

  /** Owner user ID */
  readonly userId: UserId;

  /** Knowledge domain these metrics apply to */
  readonly domain: string;

  /** The full set of structural health metrics */
  readonly metrics: IStructuralMetrics;

  /** When the snapshot was computed (ISO 8601) */
  readonly computedAt: string;
}

/**
 * Options for querying snapshot history.
 */
export interface IMetricsHistoryOptions {
  /** Maximum number of snapshots to return */
  readonly limit?: number;

  /** Only return snapshots after this timestamp (ISO 8601) */
  readonly since?: string;

  /** Only return snapshots before this timestamp (ISO 8601) */
  readonly until?: string;
}

// ============================================================================
// IMetricsRepository
// ============================================================================

/**
 * Repository for structural metric snapshots.
 */
export interface IMetricsRepository {
  /**
   * Save a new metric snapshot.
   */
  saveSnapshot(
    userId: UserId,
    domain: string,
    metrics: IStructuralMetrics
  ): Promise<IMetricSnapshot>;

  /**
   * Get the latest snapshot for a user-domain combination.
   * @returns The most recent snapshot, or null if none exist.
   */
  getLatestSnapshot(userId: UserId, domain: string): Promise<IMetricSnapshot | null>;

  /**
   * Get snapshot history for a user-domain pair (for trend visualization).
   * Ordered by computedAt descending (most recent first).
   */
  getSnapshotHistory(
    userId: UserId,
    domain: string,
    options?: IMetricsHistoryOptions
  ): Promise<IMetricSnapshot[]>;

  /**
   * Delete old snapshots (retention policy).
   * @param olderThan ISO 8601 timestamp — delete all snapshots before this date.
   * @returns Number of snapshots deleted.
   */
  deleteOldSnapshots(olderThan: string): Promise<number>;
}
