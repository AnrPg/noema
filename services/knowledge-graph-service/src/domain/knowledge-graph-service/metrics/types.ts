/**
 * @noema/knowledge-graph-service - Structural Metrics Types
 *
 * Internal types for the structural metrics computation engine.
 * These types are used within the metrics/ module and are not
 * exported beyond the knowledge-graph-service boundary.
 */

import type { GraphEdgeType, IGraphEdge, ISubgraph, NodeId, UserId } from '@noema/types';

import type { IMetricSnapshot } from '../metrics.repository.js';
import type { IGraphComparison } from '../value-objects/comparison.js';

// ============================================================================
// Metric Computer Interface
// ============================================================================

/**
 * Strategy interface for individual metric computation.
 *
 * Each structural metric is implemented as a separate class conforming
 * to this interface. The StructuralMetricsEngine orchestrates them,
 * passing a shared IMetricComputationContext to each.
 */
export interface IMetricComputer {
  /** Short identifier for logging/debugging (e.g., 'AD', 'DCG') */
  readonly abbreviation: string;

  /** Human-readable metric name */
  readonly name: string;

  /**
   * Compute the metric value from the shared context.
   * Must return a number in the documented range (typically [0, 1] or [-1, 1]).
   */
  compute(ctx: IMetricComputationContext): number;
}

// ============================================================================
// Metric Computation Context
// ============================================================================

/**
 * A sibling group from the CKG — a set of nodes sharing a common parent
 * via is_a or part_of edges.
 */
export interface ISiblingGroup {
  /** CKG parent node ID */
  readonly parentNodeId: NodeId;

  /** CKG sibling node IDs (children of the parent) */
  readonly siblingNodeIds: readonly NodeId[];
}

/**
 * A structural region in the PKG — a subtree rooted at a top-level concept.
 */
export interface IStructuralRegion {
  /** Root node of this region */
  readonly rootNodeId: NodeId;

  /** All node IDs in this region */
  readonly nodeIds: readonly NodeId[];

  /** Maximum prerequisite chain depth in this region */
  readonly maxDepth: number;

  /** Number of nodes in this region */
  readonly size: number;
}

/**
 * Eagerly computed, immutable context shared across all 11 metric computers.
 *
 * Built once by the context factory before any metrics run. Contains
 * pre-computed data structures (depth maps, parent maps, sibling groups)
 * to prevent redundant computation across metrics.
 */
export interface IMetricComputationContext {
  // ── Raw data ────────────────────────────────────────────────────────

  /** User's PKG subgraph for the domain */
  readonly pkgSubgraph: ISubgraph;

  /** Canonical CKG subgraph for the same domain */
  readonly ckgSubgraph: ISubgraph;

  /** Pre-computed PKG↔CKG alignment */
  readonly comparison: IGraphComparison;

  /** Most recent stored metric snapshot (null if first computation) */
  readonly previousSnapshot: IMetricSnapshot | null;

  // ── Pre-computed maps ───────────────────────────────────────────────

  /**
   * PKG prerequisite chain depths (longest path from any root).
   * Keys are PKG node IDs.
   */
  readonly pkgDepthMap: ReadonlyMap<NodeId, number>;

  /**
   * CKG prerequisite chain depths (longest path from any root).
   * Keys are CKG node IDs.
   */
  readonly ckgDepthMap: ReadonlyMap<NodeId, number>;

  /**
   * PKG hierarchical parent map (is_a/part_of parents).
   * Maps child node ID → set of parent node IDs.
   */
  readonly pkgParentMap: ReadonlyMap<NodeId, ReadonlySet<NodeId>>;

  /**
   * CKG hierarchical parent map (is_a/part_of parents).
   * Maps child node ID → set of parent node IDs.
   */
  readonly ckgParentMap: ReadonlyMap<NodeId, ReadonlySet<NodeId>>;

  // ── Pre-computed structures ─────────────────────────────────────────

  /** CKG sibling groups (nodes sharing a common is_a/part_of parent) */
  readonly ckgSiblingGroups: readonly ISiblingGroup[];

  /** PKG edges grouped by edge type */
  readonly pkgEdgesByType: ReadonlyMap<GraphEdgeType, readonly IGraphEdge[]>;

  /** Per-PKG-node set of distinct edge types (both in and out) */
  readonly pkgNodeEdgeTypes: ReadonlyMap<NodeId, ReadonlySet<GraphEdgeType>>;

  /** Structural regions — subtrees rooted at top-level PKG concepts */
  readonly structuralRegions: readonly IStructuralRegion[];

  // ── Domain & user context ───────────────────────────────────────────

  /** Knowledge domain being analyzed */
  readonly domain: string;

  /** User whose PKG is being analyzed */
  readonly userId: UserId;

  /** User's active learning strategy archetype (if known) */
  readonly activeStrategy?: string;
}
