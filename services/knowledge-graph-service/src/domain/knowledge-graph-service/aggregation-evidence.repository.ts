/**
 * @noema/knowledge-graph-service - Aggregation Evidence Repository Interface
 *
 * Repository for aggregation evidence records that track which PKG signals
 * contribute to CKG promotion proposals. Evidence has distinct access
 * patterns: append-heavy writes, threshold queries, and cross-user
 * aggregation.
 */

import type {
  ConfidenceScore,
  Metadata,
  MutationId,
  NodeId,
  PromotionBand,
  UserId,
} from '@noema/types';

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

  /** Linked mutation, if this evidence has already been promoted into a proposal */
  readonly mutationId: MutationId | null;

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

  /** Statistical direction of this evidence signal. */
  readonly direction: 'support' | 'oppose' | 'neutral';

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
    direction?: 'support' | 'oppose' | 'neutral';
  }): Promise<IAggregationEvidence>;

  /**
   * Get all evidence records for a CKG node or proposed mutation.
   */
  getEvidenceForTarget(ckgTargetNodeId: NodeId): Promise<IAggregationEvidence[]>;

  /**
   * Get all evidence records for a proposed label that does not yet have
   * a canonical target node.
   */
  getEvidenceForProposedLabel(proposedLabel: string): Promise<IAggregationEvidence[]>;

  /**
   * Get evidence count by promotion band threshold.
   * Returns the number of independent PKGs (distinct users) supporting
   * the claim and the achieved promotion band.
   */
  getEvidenceCountByBand(ckgTargetNodeId: NodeId): Promise<{ count: number; band: PromotionBand }>;

  /**
   * Get evidence count by promotion band threshold for a proposed label.
   */
  getEvidenceCountByProposedLabel(
    proposedLabel: string
  ): Promise<{ count: number; band: PromotionBand }>;

  /**
   * Get evidence contributed by a specific user.
   */
  getEvidenceByUser(userId: UserId): Promise<IAggregationEvidence[]>;

  /**
   * Find an existing evidence record for deduplication.
   */
  findEvidence(input: {
    sourceUserId: UserId;
    sourcePkgNodeId: NodeId;
    ckgTargetNodeId?: NodeId;
    proposedLabel?: string;
    evidenceType: string;
  }): Promise<IAggregationEvidence | null>;

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

  /**
   * Get a comprehensive evidence summary for a proposed label.
   */
  getEvidenceSummaryByProposedLabel(proposedLabel: string): Promise<IEvidenceSummary>;

  /**
   * Link all currently unlinked evidence for a target to a mutation.
   */
  linkEvidenceToMutation(input: {
    mutationId: MutationId;
    ckgTargetNodeId?: NodeId;
    proposedLabel?: string;
  }): Promise<number>;
}
