/**
 * @noema/types - Knowledge Graph Domain Types
 *
 * Shared interfaces for the knowledge graph domain, used by the
 * knowledge-graph-service and by agents/services that consume graph data.
 */

import type { Metadata } from '../base/index.js';
import type { EdgeId, MisconceptionPatternId, NodeId } from '../branded-ids/index.js';
import type { ConfidenceScore, EdgeWeight, MasteryLevel } from '../branded-numerics/index.js';
import type {
  GraphEdgeType,
  GraphNodeType,
  GraphType,
  MetacognitiveStage,
  MetricHealthStatus,
  MisconceptionSeverity,
  MisconceptionStatus,
  MisconceptionType,
  StructuralMetricType,
  TrendDirection,
} from '../enums/index.js';

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
  masteryLevel?: MasteryLevel;

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
  weight: EdgeWeight;

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
  readonly confidence: ConfidenceScore;

  /** The pattern that detected this misconception */
  readonly patternId: MisconceptionPatternId;

  // --- Severity (per-detection) ---

  /** Assessed severity of this misconception instance */
  readonly severity: MisconceptionSeverity;

  /** Normalised severity score (0.0–1.0) for ranking and triage */
  readonly severityScore: number;

  // --- Family ---

  /** Machine-readable family key (e.g. 'graph_structural') */
  readonly family: string;

  /** Human-readable family label */
  readonly familyLabel: string;

  // --- Enriched metadata ---

  /** Free-text description of the misconception (from detection or pattern) */
  readonly description: string | null;

  /** How many times this misconception has been detected (upsert counter) */
  readonly detectionCount: number;

  /** When this misconception was first detected (ISO 8601) */
  readonly detectedAt: string;

  /** When the most recent detection occurred (ISO 8601) */
  readonly lastDetectedAt: string;

  /** When this misconception was resolved (ISO 8601), null if unresolved */
  resolvedAt: string | null;
}

// ============================================================================
// Structural Health Report
// ============================================================================

/**
 * Per-metric health status entry in the structural health report.
 * Captures the metric's current value, classification, and trend.
 */
export interface IMetricStatusEntry {
  /** Which structural metric this entry describes */
  readonly metricType: StructuralMetricType;

  /** Current metric value */
  readonly value: number;

  /** Health classification based on threshold tables */
  readonly status: MetricHealthStatus;

  /** Trend direction computed from recent snapshots */
  readonly trend: TrendDirection;

  /** Human-readable hint for this metric's current state */
  readonly hint: string;
}

/**
 * Composite structural health report for a user in a domain.
 *
 * Synthesizes all 11 structural metrics into a single health assessment
 * with per-metric breakdowns, metacognitive stage, and actionable insights.
 */
export interface IStructuralHealthReport {
  /** Overall health score (0–1, higher is better) */
  readonly overallScore: number;

  /** Per-metric status breakdown */
  readonly metricBreakdown: readonly IMetricStatusEntry[];

  /** Overall trend direction */
  readonly trend: TrendDirection;

  /** Number of currently active misconceptions */
  readonly activeMisconceptionCount: number;

  /** Current metacognitive stage assessment */
  readonly metacognitiveStage: MetacognitiveStage;

  /** Knowledge domain this report covers */
  readonly domain: string;

  /** When this report was generated (ISO 8601) */
  readonly generatedAt: string;

  /**
   * Detected cross-metric interaction patterns (optional).
   *
   * Populated when the health report builder detects compound patterns
   * formed by combinations of metric values (e.g., "Double Misframing"
   * when both AD and DCG are high).
   */
  readonly crossMetricPatterns?: readonly ICrossMetricPatternEntry[];
}

/**
 * A cross-metric interaction pattern detected in the health report.
 */
export interface ICrossMetricPatternEntry {
  /** Pattern identifier (e.g., "double_misframing") */
  readonly id: string;

  /** Human-readable pattern name */
  readonly name: string;

  /** Severity level */
  readonly severity: 'info' | 'warning' | 'critical';

  /** Description of what the pattern means */
  readonly description: string;

  /** Abbreviated metric names that participate */
  readonly participatingMetrics: readonly string[];

  /** Recommended remediation action */
  readonly suggestedAction: string;
}

// ============================================================================
// Metacognitive Stage Assessment
// ============================================================================

/**
 * A single stage gate criterion and whether it's met.
 */
export interface IStageGateCriterion {
  /** Which metric this criterion evaluates */
  readonly metricType: StructuralMetricType;

  /** The threshold the metric must meet */
  readonly threshold: number;

  /** Comparison operator (e.g., 'below', 'above', 'stable') */
  readonly operator: 'below' | 'above' | 'stable' | 'improving';

  /** Current metric value */
  readonly currentValue: number;

  /** Whether this criterion is currently met */
  readonly met: boolean;
}

/**
 * Gap analysis for a single unmet stage gate criterion.
 */
export interface IStageGateGap {
  /** Which metric needs improvement */
  readonly metricType: StructuralMetricType;

  /** Current value */
  readonly currentValue: number;

  /** Required threshold value */
  readonly requiredValue: number;

  /** Numeric gap (absolute distance to threshold) */
  readonly gap: number;

  /** Human-readable description of what needs to change */
  readonly description: string;
}

/**
 * Full metacognitive stage assessment for a user in a domain.
 *
 * Includes the current stage, evidence supporting the assessment,
 * gaps to the next stage, and regression detection.
 */
export interface IMetacognitiveStageAssessment {
  /** Current metacognitive stage */
  readonly currentStage: MetacognitiveStage;

  /** Knowledge domain assessed */
  readonly domain: string;

  /** Stage gate criteria that support the current stage */
  readonly stageEvidence: readonly IStageGateCriterion[];

  /** Gaps preventing advancement to the next stage */
  readonly nextStageGaps: readonly IStageGateGap[];

  /** Whether metrics indicate a potential stage regression */
  readonly regressionDetected: boolean;

  /** When the assessment was performed (ISO 8601) */
  readonly assessedAt: string;
}

// ============================================================================
// Relational Traversal Results (Phase 8b)
// ============================================================================

/**
 * A single group of siblings sharing a common parent.
 */
export interface ISiblingGroupResult {
  /** The common parent node */
  readonly parent: IGraphNode;
  /** The edge type connecting origin to parent */
  readonly edgeType: GraphEdgeType;
  /** The sibling nodes under this parent (excluding the origin) */
  readonly siblings: readonly IGraphNode[];
  /** Total sibling count under this parent (may exceed returned if capped) */
  readonly totalInGroup: number;
}

/**
 * Complete result of a siblings query.
 */
export interface ISiblingsResult {
  /** The node whose siblings were queried */
  readonly originNodeId: NodeId;
  /** The origin node (full data) */
  readonly originNode: IGraphNode;
  /** The edge type used for the sibling query */
  readonly edgeType: GraphEdgeType;
  /** The direction used (outbound or inbound) */
  readonly direction: 'outbound' | 'inbound';
  /** Sibling groups, one per shared parent */
  readonly groups: readonly ISiblingGroupResult[];
  /** Total number of unique sibling nodes across all groups */
  readonly totalSiblingCount: number;
}

/**
 * A single group of co-parents sharing a common child.
 */
export interface ICoParentGroupResult {
  /** The shared child node */
  readonly child: IGraphNode;
  /** The edge type connecting origin to child */
  readonly edgeType: GraphEdgeType;
  /** The co-parent nodes for this child (excluding the origin) */
  readonly coParents: readonly IGraphNode[];
  /** Total co-parent count for this child (may exceed returned if capped) */
  readonly totalInGroup: number;
}

/**
 * Complete result of a co-parents query.
 */
export interface ICoParentsResult {
  /** The node whose co-parents were queried */
  readonly originNodeId: NodeId;
  /** The origin node (full data) */
  readonly originNode: IGraphNode;
  /** The edge type used for the co-parent query */
  readonly edgeType: GraphEdgeType;
  /** The direction used (outbound or inbound) */
  readonly direction: 'outbound' | 'inbound';
  /** Co-parent groups, one per shared child */
  readonly groups: readonly ICoParentGroupResult[];
  /** Total number of unique co-parent nodes across all groups */
  readonly totalCoParentCount: number;
}

/**
 * A group of neighbors reachable via a specific edge type from the origin.
 */
export interface IEdgeTypeNeighborGroup {
  /** The edge type from origin (for hops=1) or the first-hop edge type */
  readonly edgeType: GraphEdgeType;
  /** Direction of this edge type relative to origin */
  readonly direction: 'inbound' | 'outbound';
  /** Neighbor nodes reachable via this edge type */
  readonly neighbors: readonly IGraphNode[];
  /** Total count (may exceed returned if capped by maxPerGroup) */
  readonly totalInGroup: number;
}

/**
 * Complete result of a neighborhood query.
 */
export interface INeighborhoodResult {
  /** The origin node ID */
  readonly originNodeId: NodeId;
  /** The origin node (full data) */
  readonly originNode: IGraphNode;
  /** Results grouped by the connecting edge type */
  readonly groups: readonly IEdgeTypeNeighborGroup[];
  /** All edges in the neighborhood (for visualization), if includeEdges=true */
  readonly edges: readonly IGraphEdge[];
  /** Total unique neighbor count across all groups */
  readonly totalNeighborCount: number;
}

// ============================================================================
// Phase 8c: Bridge Nodes (Articulation Points)
// ============================================================================

/**
 * A single bridge node (articulation point) with impact metrics.
 */
export interface IBridgeNode {
  /** The bridge node */
  readonly node: IGraphNode;
  /** Number of connected components created if this node were removed */
  readonly componentsCreated: number;
  /** Sizes of the downstream components that would be disconnected */
  readonly downstreamComponentSizes: readonly number[];
  /** Total nodes that would become unreachable */
  readonly totalAffectedNodes: number;
  /** The edge types through which this node is a bridge */
  readonly bridgeEdgeTypes: readonly GraphEdgeType[];
}

/**
 * Complete result of a bridge nodes (articulation points) query.
 */
export interface IBridgeNodesResult {
  /** Total nodes analyzed in the domain subgraph */
  readonly totalNodesAnalyzed: number;
  /** Identified bridge nodes, ordered by impact (largest downstream first) */
  readonly bridges: readonly IBridgeNode[];
}

// ============================================================================
// Phase 8c: Knowledge Frontier
// ============================================================================

/**
 * A single frontier node — a concept the learner is ready to study next.
 */
export interface IFrontierNode {
  /** The frontier node */
  readonly node: IGraphNode;
  /** Average mastery of its prerequisite parents */
  readonly prerequisiteMasteryAvg: number;
  /** Number of mastered prerequisites / total prerequisites */
  readonly prerequisiteReadiness: string;
  /** Readiness score (0–1): how prepared the learner is for this concept */
  readonly readinessScore: number;
  /** Mastered prerequisites (if includePrerequisites=true) */
  readonly masteredPrerequisites?: readonly IGraphNode[];
}

/**
 * Summary statistics for the knowledge frontier analysis.
 */
export interface IFrontierSummary {
  /** Number of nodes with mastery ≥ threshold */
  readonly totalMastered: number;
  /** Number of nodes with mastery < threshold */
  readonly totalUnmastered: number;
  /** Number of frontier nodes (unmastered with mastered prereqs) */
  readonly totalFrontier: number;
  /** Number of deep-unmastered nodes (unmastered with unmastered prereqs) */
  readonly totalDeepUnmastered: number;
  /** mastered / total */
  readonly masteryPercentage: number;
}

/**
 * Complete result of a knowledge frontier query.
 */
export interface IKnowledgeFrontierResult {
  /** Knowledge domain analyzed */
  readonly domain: string;
  /** Mastery threshold used */
  readonly masteryThreshold: number;
  /** Frontier nodes — ready to learn next */
  readonly frontier: readonly IFrontierNode[];
  /** Summary statistics */
  readonly summary: IFrontierSummary;
}

// ============================================================================
// Phase 8c: Common Ancestors
// ============================================================================

/**
 * A single common ancestor entry with depth information.
 */
export interface ICommonAncestorEntry {
  /** The ancestor node */
  readonly node: IGraphNode;
  /** Depth from nodeA to this ancestor */
  readonly depthFromA: number;
  /** Depth from nodeB to this ancestor */
  readonly depthFromB: number;
  /** Sum of depths (lower = closer = more relevant as LCA) */
  readonly combinedDepth: number;
}

/**
 * Complete result of a common ancestors query.
 */
export interface ICommonAncestorsResult {
  /** The two query nodes */
  readonly nodeA: IGraphNode;
  readonly nodeB: IGraphNode;
  /** The Lowest Common Ancestor(s) — closest shared ancestor(s) */
  readonly lowestCommonAncestors: readonly IGraphNode[];
  /** All common ancestors, ordered by depth from nodes (shallowest first) */
  readonly allCommonAncestors: readonly ICommonAncestorEntry[];
  /** Whether the two nodes are directly connected */
  readonly directlyConnected: boolean;
  /** Path from nodeA to LCA (if exists) */
  readonly pathFromA: readonly IGraphNode[];
  /** Path from nodeB to LCA (if exists) */
  readonly pathFromB: readonly IGraphNode[];
}

// ============================================================================
// Prerequisite Chain (Phase 8d)
// ============================================================================

/**
 * Centrality algorithm type.
 */
export type CentralityAlgorithm = 'degree' | 'betweenness' | 'pagerank';

/**
 * A single prerequisite in the topological ordering.
 */
export interface IPrerequisiteEntry {
  /** Node ID of the prerequisite */
  readonly nodeId: string;
  /** Display label */
  readonly label: string;
  /** Mastery level (0–1), if available from the PKG */
  readonly masteryLevel?: number;
  /** Whether the prerequisite is mastered (above threshold) */
  readonly isMastered: boolean;
}

/**
 * A topological layer in the prerequisite chain.
 * All entries in a layer can be studied in parallel.
 */
export interface IPrerequisiteLayer {
  /** Topological depth (0 = direct prerequisite of target) */
  readonly depth: number;
  /** Entries at this depth */
  readonly entries: readonly IPrerequisiteEntry[];
}

/**
 * Complete result of a prerequisite chain query.
 */
export interface IPrerequisiteChainResult {
  /** Node ID of the target concept */
  readonly targetNodeId: string;
  /** Topologically-ordered layers (deepest-first) */
  readonly layers: readonly IPrerequisiteLayer[];
  /** Length of the critical (longest) path to the target */
  readonly criticalPathLength: number;
  /** Whether a cycle was detected in prerequisites */
  readonly hasCycle: boolean;
}

// ============================================================================
// Centrality Ranking (Phase 8d)
// ============================================================================

/**
 * Statistical summary for a set of centrality scores.
 */
export interface ICentralityStatistics {
  readonly mean: number;
  readonly median: number;
  readonly standardDeviation: number;
  readonly skewness: number;
  readonly kurtosis: number;
  readonly maxScore: number;
  readonly minScore: number;
}

/**
 * A single centrality ranking entry.
 */
export interface ICentralityEntry {
  /** Node ID */
  readonly nodeId: string;
  /** Display label */
  readonly label: string;
  /** Raw centrality score */
  readonly score: number;
  /** Normalised score (0–1), or 0 if not normalised */
  readonly normalizedScore: number;
  /** Degree breakdown (present only for degree algorithm) */
  readonly degreeBreakdown?: {
    readonly inDegree: number;
    readonly outDegree: number;
    readonly totalDegree: number;
  };
}

/**
 * Complete result of a centrality ranking query.
 */
export interface ICentralityResult {
  /** The algorithm used */
  readonly algorithm: CentralityAlgorithm;
  /** Ranked entries (highest centrality first) */
  readonly entries: readonly ICentralityEntry[];
  /** Descriptive statistics for the full (pre-topK) distribution */
  readonly statistics: ICentralityStatistics;
  /** Total number of nodes analysed (before topK) */
  readonly totalNodesAnalyzed: number;
}
