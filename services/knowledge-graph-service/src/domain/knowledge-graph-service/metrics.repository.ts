/**
 * @noema/knowledge-graph-service - Metrics Repository Interface
 *
 * Repository for structural metric snapshots. Metrics change every time
 * a user's PKG changes; this repository tracks them over time so the
 * system can detect trends ("your Abstraction Drift has been worsening
 * over the last week").
 */

import type { IStructuralMetrics, StudyMode, UserId } from '@noema/types';

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

  /** Study mode lens these metrics apply to */
  readonly studyMode: StudyMode;

  /** The full set of structural health metrics */
  readonly metrics: IStructuralMetrics;

  /** When the snapshot was computed (ISO 8601) */
  readonly computedAt: string;

  /**
   * Schema version for forward-compatible deserialization.
   * Older snapshots missing new metric fields can be detected and
   * handled by checking this version. Defaults to 1 for legacy snapshots.
   */
  readonly schemaVersion: number;
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
    studyMode: StudyMode,
    metrics: IStructuralMetrics
  ): Promise<IMetricSnapshot>;

  /**
   * Get the latest snapshot for a user-domain combination.
   * @returns The most recent snapshot, or null if none exist.
   */
  getLatestSnapshot(
    userId: UserId,
    domain: string,
    studyMode: StudyMode
  ): Promise<IMetricSnapshot | null>;

  /**
   * Get snapshot history for a user-domain pair (for trend visualization).
   * Ordered by computedAt descending (most recent first).
   */
  getSnapshotHistory(
    userId: UserId,
    domain: string,
    studyMode: StudyMode,
    options?: IMetricsHistoryOptions
  ): Promise<IMetricSnapshot[]>;

  /**
   * Delete old snapshots (retention policy).
   * @param olderThan ISO 8601 timestamp — delete all snapshots before this date.
   * @returns Number of snapshots deleted.
   */
  deleteOldSnapshots(olderThan: string): Promise<number>;
}
