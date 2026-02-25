/**
 * @noema/knowledge-graph-service - Aggregation Evidence Repository Interface
 *
 * Repository for aggregation evidence records that track which PKG signals
 * contribute to CKG promotion proposals. Evidence has distinct access
 * patterns: append-heavy writes, threshold queries, and cross-user
 * aggregation.
 */

import type { ConfidenceScore, Metadata, NodeId, PromotionBand, UserId } from '@noema/types';

// ============================================================================
// Evidence Types
// ============================================================================

/**
 * A single aggregation evidence record linking a user's PKG signal
 * to a CKG promotion candidate.
 */
export interface IAggregationEvidence {
  /** Persistence ID */
  readonly id: string;

  /** User who produced this evidence signal */
  readonly sourceUserId: UserId;

  /** PKG node that provides the evidence */
  readonly sourcePkgNodeId: NodeId;

  /** Target CKG node ID (if already exists) or proposed label */
  readonly ckgTargetNodeId: NodeId | null;

  /** Proposed label if the CKG node doesn't exist yet */
  readonly proposedLabel: string | null;

  /** Type of evidence (e.g., 'node_match', 'edge_match', 'structural_similarity') */
  readonly evidenceType: string;

  /** Confidence of the evidence signal (0–1) */
  readonly confidence: ConfidenceScore;

  /** Additional evidence context */
  readonly metadata: Metadata;

  /** When the evidence was recorded (ISO 8601) */
  readonly recordedAt: string;
}

/**
 * Aggregated summary of evidence for a mutation or CKG node.
 */
export interface IEvidenceSummary {
  /** Total number of evidence records */
  readonly totalCount: number;

  /** Number of distinct users contributing evidence */
  readonly contributingUserCount: number;

  /** Average confidence across all evidence records */
  readonly averageConfidence: ConfidenceScore;

  /** Distribution of confidence scores */
  readonly confidenceDistribution: {
    readonly low: number; // 0.0–0.3
    readonly medium: number; // 0.3–0.7
    readonly high: number; // 0.7–1.0
  };

  /** Highest promotion band the evidence count qualifies for */
  readonly achievedBand: PromotionBand;
}

// ============================================================================
// IAggregationEvidenceRepository
// ============================================================================

/**
 * Repository for aggregation evidence records.
 *
 * Consumed by:
 * 1. Evidence sufficiency validation (Phase 6, Stage 4)
 * 2. Aggregation-initiated mutations (Phase 6, Task 5)
 * 3. Audit and transparency (agent/admin inspection)
 */
export interface IAggregationEvidenceRepository {
  /**
   * Record a new evidence entry.
   */
  recordEvidence(input: {
    sourceUserId: UserId;
    sourcePkgNodeId: NodeId;
    ckgTargetNodeId?: NodeId;
    proposedLabel?: string;
    evidenceType: string;
    confidence: ConfidenceScore;
    metadata?: Metadata;
  }): Promise<IAggregationEvidence>;

  /**
   * Get all evidence records for a CKG node or proposed mutation.
   */
  getEvidenceForTarget(ckgTargetNodeId: NodeId): Promise<IAggregationEvidence[]>;

  /**
   * Get evidence count by promotion band threshold.
   * Returns the number of independent PKGs (distinct users) supporting
   * the claim and the achieved promotion band.
   */
  getEvidenceCountByBand(ckgTargetNodeId: NodeId): Promise<{ count: number; band: PromotionBand }>;

  /**
   * Get evidence contributed by a specific user.
   */
  getEvidenceByUser(userId: UserId): Promise<IAggregationEvidence[]>;

  /**
   * Delete stale evidence for nodes/mutations that were rejected or superseded.
   * @param olderThan ISO 8601 timestamp.
   * @returns Number of records deleted.
   */
  deleteStaleEvidence(olderThan: string): Promise<number>;

  /**
   * Get a comprehensive evidence summary for a mutation or CKG node.
   */
  getEvidenceSummary(ckgTargetNodeId: NodeId): Promise<IEvidenceSummary>;
}
