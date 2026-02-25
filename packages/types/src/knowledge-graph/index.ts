/**
 * @noema/types - Knowledge Graph Domain Types
 *
 * Shared interfaces for the knowledge graph domain, used by the
 * knowledge-graph-service and by agents/services that consume graph data.
 */

import type { EdgeId, MisconceptionPatternId, NodeId } from '../branded-ids/index.js';
import type {
  GraphEdgeType,
  GraphNodeType,
  GraphType,
  MisconceptionStatus,
  MisconceptionType,
} from '../enums/index.js';
import type { Metadata } from '../base/index.js';

// ============================================================================
// Graph Data Interfaces
// ============================================================================

/**
 * Universal representation of a graph node.
 *
 * Used in both PKG (Personal Knowledge Graph) and CKG (Canonical Knowledge
 * Graph). The `graphType` field discriminates which graph the node belongs to.
 */
export interface IGraphNode {
  /** Stable identifier for this node */
  readonly nodeId: NodeId;

  /** Which graph this node lives in (pkg or ckg) */
  readonly graphType: GraphType;

  /** Semantic type of this node (concept, skill, fact, etc.) */
  readonly nodeType: GraphNodeType;

  /** Human-readable label */
  label: string;

  /** Optional longer description */
  description?: string;

  /** Knowledge domain this node belongs to */
  domain: string;

  /** Owner user ID — present for PKG nodes, absent for CKG nodes */
  userId?: string;

  /** Extensible key-value properties */
  properties: Metadata;

  /** Mastery level (0–1) — present only for PKG nodes */
  masteryLevel?: number;

  /** When this node was created (ISO 8601) */
  readonly createdAt: string;

  /** When this node was last updated (ISO 8601) */
  updatedAt: string;
}

/**
 * Universal representation of a graph edge.
 *
 * Edges are directed: sourceNodeId → targetNodeId. The weight represents
 * the strength of the relationship (0 = weakest, 1 = strongest).
 */
export interface IGraphEdge {
  /** Stable identifier for this edge */
  readonly edgeId: EdgeId;

  /** Which graph this edge lives in (pkg or ckg) */
  readonly graphType: GraphType;

  /** Semantic type of this edge (prerequisite, related_to, etc.) */
  readonly edgeType: GraphEdgeType;

  /** Source node of the directed edge */
  readonly sourceNodeId: NodeId;

  /** Target node of the directed edge */
  readonly targetNodeId: NodeId;

  /** Owner user ID — present for PKG edges, absent for CKG edges */
  userId?: string;

  /** Relationship strength (0–1) */
  weight: number;

  /** Extensible key-value properties */
  properties: Metadata;

  /** When this edge was created (ISO 8601) */
  readonly createdAt: string;
}

/**
 * A self-contained fragment of a graph returned by traversal queries.
 *
 * Contains the subgraph's nodes, edges, and an optional root node that
 * anchors the traversal.
 */
export interface ISubgraph {
  /** All nodes in this subgraph */
  readonly nodes: readonly IGraphNode[];

  /** All edges in this subgraph (both endpoints are in `nodes`) */
  readonly edges: readonly IGraphEdge[];

  /** Optional root node that anchored the traversal */
  readonly rootNodeId?: NodeId;
}

// ============================================================================
// Structural Metrics
// ============================================================================

/**
 * Complete set of structural health metrics for a user in a domain.
 *
 * Each field is a number representing a specific facet of knowledge graph
 * health. This is a "snapshot in time" — metrics are recalculated
 * periodically and compared against previous snapshots.
 */
export interface IStructuralMetrics {
  /** Drift between a user's abstraction hierarchy and the CKG's */
  abstractionDrift: number;

  /** Gradient of depth accuracy across the tree */
  depthCalibrationGradient: number;

  /** Fraction of edges that cross domain boundaries inappropriately */
  scopeLeakageIndex: number;

  /** Entropy of sibling-node similarity (high = hard to distinguish) */
  siblingConfusionEntropy: number;

  /** Mean strength of upward (child→parent) links */
  upwardLinkStrength: number;

  /** Breadth of traversal paths available from each node */
  traversalBreadthScore: number;

  /** How well the graph depth matches the user's learning strategy */
  strategyDepthFit: number;

  /** Entropy of strategy choices relative to graph structure */
  structuralStrategyEntropy: number;

  /** Accuracy of the user's structural self-assessment */
  structuralAttributionAccuracy: number;

  /** Stability gain across successive snapshots */
  structuralStabilityGain: number;

  /** Improvement in boundary sensitivity over time */
  boundarySensitivityImprovement: number;
}

// ============================================================================
// Misconception Detection
// ============================================================================

/**
 * A detected misconception instance in a user's PKG.
 *
 * Tracks the full lifecycle from detection through remediation to resolution
 * (or recurrence).
 */
export interface IMisconceptionDetection {
  /** The user whose PKG contains this misconception */
  readonly userId: string;

  /** Which misconception type was detected */
  readonly misconceptionType: MisconceptionType;

  /** Current lifecycle status */
  status: MisconceptionStatus;

  /** Node IDs affected by this misconception */
  readonly affectedNodeIds: readonly NodeId[];

  /** Detection confidence (0–1) */
  readonly confidence: number;

  /** The pattern that detected this misconception */
  readonly patternId: MisconceptionPatternId;

  /** When this misconception was first detected (ISO 8601) */
  readonly detectedAt: string;

  /** When this misconception was resolved (ISO 8601), null if unresolved */
  resolvedAt: string | null;
}
