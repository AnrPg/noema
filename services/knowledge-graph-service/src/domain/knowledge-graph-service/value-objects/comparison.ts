/**
 * @noema/knowledge-graph-service - Graph Comparison Value Objects
 *
 * Value objects for PKG↔CKG structural comparison — a reusable capability
 * needed by structural metrics, misconception detection, and the
 * aggregation pipeline.
 */

import type { ISubgraph, NodeId } from '@noema/types';

// ============================================================================
// Divergence Types
// ============================================================================

/**
 * Classification of structural divergence between a PKG and the CKG.
 */
export const DivergenceType = {
  /** A CKG edge is missing from the user's PKG */
  MISSING_EDGE: 'missing_edge',
  /** The user has an edge not present in the CKG */
  EXTRA_EDGE: 'extra_edge',
  /** The user's edge type differs from the CKG's for the same node pair */
  WRONG_EDGE_TYPE: 'wrong_edge_type',
  /** A CKG node is missing from the user's PKG (gap in understanding) */
  MISSING_NODE: 'missing_node',
  /** The user has a node not present in the CKG (novel concept) */
  EXTRA_NODE: 'extra_node',
  /** The user's prerequisite chain depth doesn't match the CKG */
  DEPTH_MISMATCH: 'depth_mismatch',
  /** The user's is_a/part_of hierarchy is inverted relative to the CKG */
  HIERARCHY_INVERSION: 'hierarchy_inversion',
} as const;

export type DivergenceType = (typeof DivergenceType)[keyof typeof DivergenceType];

/**
 * Severity of a structural divergence.
 * Based on how foundational the divergence is — a missing prerequisite
 * for a root concept is critical; an extra `related_to` edge is low.
 */
export const DivergenceSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

export type DivergenceSeverity = (typeof DivergenceSeverity)[keyof typeof DivergenceSeverity];

// ============================================================================
// IStructuralDivergence
// ============================================================================

/**
 * A single point of structural disagreement between a user's PKG and the CKG.
 *
 * Captures what diverged, where, how severe it is, and a human-readable
 * explanation suitable for agent hints or user-facing diagnostics.
 */
export interface IStructuralDivergence {
  /** Classification of the divergence */
  readonly divergenceType: DivergenceType;

  /** PKG node IDs involved in the divergence */
  readonly affectedPkgNodeIds: readonly NodeId[];

  /** CKG node IDs involved in the divergence */
  readonly affectedCkgNodeIds: readonly NodeId[];

  /** Severity based on structural importance */
  readonly severity: DivergenceSeverity;

  /** Human-readable explanation of the divergence */
  readonly description: string;
}

// ============================================================================
// IGraphComparison
// ============================================================================

/**
 * Complete PKG↔CKG structural comparison result.
 *
 * Computed once per (userId, domain) pair and reused by:
 * - Structural metrics (AD, DCG, SLI, SCE, etc.)
 * - Misconception detection
 * - Aggregation pipeline
 *
 * This centralisation prevents each subsystem from independently
 * fetching both subgraphs, building alignment maps, and computing
 * divergence analysis — duplicating expensive graph traversal and
 * alignment logic.
 */
export interface IGraphComparison {
  /** The user's PKG subgraph for the domain */
  readonly pkgSubgraph: ISubgraph;

  /** The canonical CKG subgraph for the same domain */
  readonly ckgSubgraph: ISubgraph;

  /**
   * Mapping of PKG node IDs to their CKG counterparts.
   * Matched by label similarity, semantic embedding, or explicit linking.
   */
  readonly nodeAlignment: ReadonlyMap<NodeId, NodeId>;

  /**
   * PKG nodes with no CKG counterpart — novel concepts the user added
   * that don't exist canonically.
   */
  readonly unmatchedPkgNodes: readonly NodeId[];

  /**
   * CKG nodes the user hasn't represented in their PKG — gaps in
   * understanding that may indicate incomplete learning.
   */
  readonly unmatchedCkgNodes: readonly NodeId[];

  /**
   * How well the user's edge structure matches the canonical one
   * for aligned nodes (0 = no match, 1 = perfect match).
   */
  readonly edgeAlignmentScore: number;

  /**
   * Specific points where the PKG and CKG disagree.
   * Sorted by severity (critical first).
   */
  readonly structuralDivergences: readonly IStructuralDivergence[];

  /**
   * Metadata describing which canonical scope was compared.
   * Optional for backward compatibility with older comparisons.
   */
  readonly scope?: IComparisonScopeMetadata;
}

export const ComparisonScopeMode = {
  DOMAIN: 'domain',
  ENGAGEMENT_HOPS: 'engagement_hops',
} as const;

export type ComparisonScopeMode = (typeof ComparisonScopeMode)[keyof typeof ComparisonScopeMode];

export interface IComparisonRequest {
  readonly domain?: string;
  readonly scopeMode: ComparisonScopeMode;
  readonly hopCount: number;
  readonly bootstrapWhenUnseeded: boolean;
}

export interface IComparisonScopeMetadata {
  readonly mode: ComparisonScopeMode;
  readonly hopCount: number;
  readonly requestedDomain: string | null;
  readonly bootstrapApplied: boolean;
  readonly seedNodeCount: number;
  readonly scopedCkgNodeCount: number;
  readonly totalCkgNodeCount: number;
}
