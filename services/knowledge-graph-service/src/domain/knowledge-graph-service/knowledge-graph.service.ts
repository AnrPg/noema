/**
 * @noema/knowledge-graph-service - Service Interface
 *
 * The contract that the API layer depends on. Every method returns
 * `IServiceResult<T>` — the content-service pattern that bundles the
 * response data with `IAgentHints` so downstream agents always get
 * actionable context.
 *
 * This is a pure interface — no implementation. The concrete
 * KnowledgeGraphService class (Phase 5) implements it, injecting
 * repository interfaces via constructor DI.
 */

import type {
  EdgeId,
  IGraphEdge,
  IGraphNode,
  IMetacognitiveStageAssessment,
  IMisconceptionDetection,
  INodeMasterySummary,
  IPaginatedResponse,
  IStructuralHealthReport,
  IStructuralMetrics,
  ISubgraph,
  MutationId,
  NodeId,
  StudyMode,
  UserId,
} from '@noema/types';

import type {
  CkgMutationOperation,
  IMutationFilter,
  IMutationProposal,
} from './ckg-mutation-dsl.js';
import type { GraphCrdtTargetKind, IGraphCrdtStat } from './crdt-stats.repository.js';
import type {
  ICreateEdgeInput,
  ICreateNodeInput,
  IEdgeFilter,
  IUpdateEdgeInput,
  IUpdateNodeInput,
} from './graph.repository.js';
import type { IMetricsHistoryOptions } from './metrics.repository.js';
import type { ICkgMutation, IMutationAuditEntry } from './mutation.repository.js';
import type { IPkgOperationLogEntry } from './pkg-operation-log.repository.js';
import type { GraphRestorationScope } from './graph-restoration.repository.js';
import type { IGraphComparison } from './value-objects/comparison.js';
import type { IComparisonRequest } from './value-objects/comparison.js';
import type {
  IBridgeNodesResult,
  IBridgeQuery,
  ICentralityQuery,
  ICentralityResult,
  ICommonAncestorsQuery,
  ICommonAncestorsResult,
  ICoParentsQuery,
  ICoParentsResult,
  IFrontierQuery,
  IKnowledgeFrontierResult,
  INeighborhoodQuery,
  INeighborhoodResult,
  INodeFilter,
  IPrerequisiteChainQuery,
  IPrerequisiteChainResult,
  ISiblingsQuery,
  ISiblingsResult,
  ITraversalOptions,
  IValidationOptions,
} from './value-objects/graph.value-objects.js';
import { type PkgOperationType } from './value-objects/operation-log.js';

import type { IExecutionContext, IServiceResult } from './execution-context.js';
export type { IExecutionContext, IServiceResult } from './execution-context.js';

export type IGraphRestoreScopeInput =
  | {
      readonly graphType: 'pkg';
      readonly userId: UserId;
      readonly domain?: string;
      readonly reason?: string;
    }
  | {
      readonly graphType: 'ckg';
      readonly domain?: string;
      readonly reason?: string;
    };

export interface IGraphSnapshotSummary {
  readonly snapshotId: string;
  readonly graphType: 'pkg' | 'ckg';
  readonly scope: GraphRestorationScope;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly schemaVersion: number;
  readonly reason: string | null;
  readonly createdAt: string;
  readonly createdBy: string | null;
  readonly sourceCursor: string | null;
}

export interface IGraphRestoreSummary {
  readonly scope: GraphRestorationScope;
  readonly currentNodeCount: number;
  readonly currentEdgeCount: number;
  readonly snapshotNodeCount: number;
  readonly snapshotEdgeCount: number;
  readonly nodesToCreate: number;
  readonly nodesToUpdate: number;
  readonly nodesToDelete: number;
  readonly edgesToCreate: number;
  readonly edgesToUpdate: number;
  readonly edgesToDelete: number;
}

export interface IGraphRestorePreview {
  readonly snapshot: IGraphSnapshotSummary;
  readonly summary: IGraphRestoreSummary;
  readonly requiresDestructiveChanges: boolean;
  readonly reasoning: string;
}

// ============================================================================
// IKnowledgeGraphService
// ============================================================================

/**
 * The primary service interface for the knowledge-graph-service.
 *
 * Covers:
 * - PKG operations (node/edge CRUD, traversal)
 * - CKG read operations (read-only access to canonical graph)
 * - Structural metrics (compute, get, history)
 * - Misconception detection and lifecycle management
 * - PKG↔CKG comparison
 */
export interface IKnowledgeGraphService {
  // ========================================================================
  // PKG Operations
  // ========================================================================

  /**
   * Create a node in the user's PKG.
   */
  createNode(
    userId: UserId,
    input: ICreateNodeInput,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode>>;

  /**
   * Get a node from the user's PKG by ID.
   */
  getNode(
    userId: UserId,
    nodeId: NodeId,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode>>;

  /**
   * Update a node in the user's PKG.
   */
  updateNode(
    userId: UserId,
    nodeId: NodeId,
    updates: IUpdateNodeInput,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode>>;

  /**
   * Soft-delete a node from the user's PKG.
   */
  deleteNode(
    userId: UserId,
    nodeId: NodeId,
    context: IExecutionContext
  ): Promise<IServiceResult<void>>;

  /**
   * List nodes in the user's PKG with filters and pagination.
   */
  listNodes(
    userId: UserId,
    filters: INodeFilter,
    pagination: { limit: number; offset: number },
    context: IExecutionContext
  ): Promise<IServiceResult<IPaginatedResponse<IGraphNode>>>;

  /**
   * Get a mode-scoped mastery summary for the user's PKG nodes.
   */
  getNodeMasterySummary(
    userId: UserId,
    filters: INodeFilter,
    masteryThreshold: number,
    context: IExecutionContext
  ): Promise<IServiceResult<INodeMasterySummary>>;

  /**
   * Create an edge in the user's PKG.
   * Validates against EDGE_TYPE_POLICIES unless overridden by validationOptions.
   */
  createEdge(
    userId: UserId,
    input: ICreateEdgeInput,
    context: IExecutionContext,
    validationOptions?: IValidationOptions
  ): Promise<IServiceResult<IGraphEdge>>;

  /**
   * Get an edge from the user's PKG by ID.
   */
  getEdge(
    userId: UserId,
    edgeId: EdgeId,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphEdge>>;

  /**
   * Update an edge in the user's PKG (weight and/or properties).
   */
  updateEdge(
    userId: UserId,
    edgeId: EdgeId,
    updates: IUpdateEdgeInput,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphEdge>>;

  /**
   * Delete an edge from the user's PKG.
   */
  deleteEdge(
    userId: UserId,
    edgeId: EdgeId,
    context: IExecutionContext
  ): Promise<IServiceResult<void>>;

  /**
   * List edges in the user's PKG with filters and pagination.
   */
  listEdges(
    userId: UserId,
    filters: IEdgeFilter,
    pagination: { limit: number; offset: number },
    context: IExecutionContext
  ): Promise<IServiceResult<IPaginatedResponse<IGraphEdge>>>;

  /**
   * Get the subgraph reachable from a root node in the user's PKG.
   */
  getSubgraph(
    userId: UserId,
    rootNodeId: NodeId,
    traversalOptions: ITraversalOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<ISubgraph>>;

  /**
   * Get ancestors of a node in the user's PKG.
   */
  getAncestors(
    userId: UserId,
    nodeId: NodeId,
    options: ITraversalOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode[]>>;

  /**
   * Get descendants of a node in the user's PKG.
   */
  getDescendants(
    userId: UserId,
    nodeId: NodeId,
    options: ITraversalOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode[]>>;

  /**
   * Find the shortest path between two nodes in the user's PKG.
   * @param maxDepth Optional maximum path length (hops).
   */
  findPath(
    userId: UserId,
    fromNodeId: NodeId,
    toNodeId: NodeId,
    context: IExecutionContext,
    maxDepth?: number
  ): Promise<IServiceResult<IGraphNode[]>>;

  /**
   * Get siblings (co-children) of a node in the user's PKG.
   * Returns nodes sharing a common parent via the same edge type.
   */
  getSiblings(
    userId: UserId,
    nodeId: NodeId,
    query: ISiblingsQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ISiblingsResult>>;

  /**
   * Get co-parents (co-ancestors) of a node in the user's PKG.
   * Returns nodes sharing a common child via the same edge type.
   */
  getCoParents(
    userId: UserId,
    nodeId: NodeId,
    query: ICoParentsQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ICoParentsResult>>;

  /**
   * Get the N-hop neighborhood of a node in the user's PKG.
   * Returns nodes grouped by connecting edge type.
   */
  getNeighborhood(
    userId: UserId,
    nodeId: NodeId,
    query: INeighborhoodQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<INeighborhoodResult>>;

  // ========================================================================
  // PKG Structural Analysis (Phase 8c)
  // ========================================================================

  /**
   * Detect bridge nodes (articulation points) in the user's PKG for a domain.
   *
   * Bridge nodes are concepts whose removal would disconnect part of the
   * knowledge graph. Tries GDS native detection first, falls back to
   * application-code Tarjan's algorithm.
   */
  getBridgeNodes(
    userId: UserId,
    query: IBridgeQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<IBridgeNodesResult>>;

  /**
   * Get the knowledge frontier for a user in a domain.
   *
   * Returns unmastered nodes whose prerequisites are mastered — the
   * optimal set for scheduling new study material. PKG-only.
   */
  getKnowledgeFrontier(
    userId: UserId,
    query: IFrontierQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<IKnowledgeFrontierResult>>;

  /**
   * Find common ancestors of two nodes in the user's PKG.
   *
   * Computes the intersection of ancestor sets and extracts the Lowest
   * Common Ancestor(s).
   */
  getCommonAncestors(
    userId: UserId,
    nodeIdA: NodeId,
    nodeIdB: NodeId,
    query: ICommonAncestorsQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ICommonAncestorsResult>>;

  // ========================================================================
  // PKG Ordering & Ranking (Phase 8d)
  // ========================================================================

  /**
   * Compute the prerequisite chain for a target node in the user's PKG.
   *
   * Returns a topologically-sorted layered structure of prerequisite concepts
   * leading to the target node (Kahn's algorithm), annotated with mastery.
   */
  getPrerequisiteChain(
    userId: UserId,
    nodeId: NodeId,
    query: IPrerequisiteChainQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<IPrerequisiteChainResult>>;

  /**
   * Rank nodes by centrality in the user's PKG for a domain.
   *
   * Supports degree (Cypher), betweenness (Brandes'), and PageRank
   * (power iteration) algorithms. Degree uses the repository; betweenness
   * and PageRank run in application code on the domain subgraph.
   */
  getCentralityRanking(
    userId: UserId,
    query: ICentralityQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ICentralityResult>>;

  // ========================================================================
  // CKG Operations (read-only)
  // ========================================================================

  /**
   * Get a node from the CKG.
   */
  getCkgNode(nodeId: NodeId, context: IExecutionContext): Promise<IServiceResult<IGraphNode>>;

  /**
   * Get a subgraph from the CKG.
   */
  getCkgSubgraph(
    rootNodeId: NodeId,
    traversalOptions: ITraversalOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<ISubgraph>>;

  /**
   * List CKG nodes with filters and pagination.
   */
  listCkgNodes(
    filters: INodeFilter,
    pagination: { limit: number; offset: number },
    context: IExecutionContext
  ): Promise<IServiceResult<IPaginatedResponse<IGraphNode>>>;

  /**
   * Get an edge from the CKG by ID.
   */
  getCkgEdge(edgeId: EdgeId, context: IExecutionContext): Promise<IServiceResult<IGraphEdge>>;

  /**
   * List edges in the CKG with filters and pagination.
   */
  listCkgEdges(
    filters: IEdgeFilter,
    pagination: { limit: number; offset: number },
    context: IExecutionContext
  ): Promise<IServiceResult<IPaginatedResponse<IGraphEdge>>>;

  /**
   * Get ancestors of a node in the CKG.
   * Same semantics as PKG getAncestors, but without userId scoping.
   */
  getCkgAncestors(
    nodeId: NodeId,
    options: ITraversalOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode[]>>;

  /**
   * Get descendants of a node in the CKG.
   * Same semantics as PKG getDescendants, but without userId scoping.
   */
  getCkgDescendants(
    nodeId: NodeId,
    options: ITraversalOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode[]>>;

  /**
   * Find the shortest path between two nodes in the CKG.
   * Same semantics as PKG findPath, but without userId scoping.
   */
  findCkgPath(
    fromNodeId: NodeId,
    toNodeId: NodeId,
    context: IExecutionContext,
    maxDepth?: number
  ): Promise<IServiceResult<IGraphNode[]>>;

  /**
   * Get siblings (co-children) of a node in the CKG.
   * Same semantics as PKG getSiblings, but without userId scoping.
   */
  getCkgSiblings(
    nodeId: NodeId,
    query: ISiblingsQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ISiblingsResult>>;

  /**
   * Get co-parents (co-ancestors) of a node in the CKG.
   * Same semantics as PKG getCoParents, but without userId scoping.
   */
  getCkgCoParents(
    nodeId: NodeId,
    query: ICoParentsQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ICoParentsResult>>;

  /**
   * Get the N-hop neighborhood of a node in the CKG.
   * Same semantics as PKG getNeighborhood, but without userId scoping.
   */
  getCkgNeighborhood(
    nodeId: NodeId,
    query: INeighborhoodQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<INeighborhoodResult>>;

  // ========================================================================
  // CKG Structural Analysis (Phase 8c)
  // ========================================================================

  /**
   * Detect bridge nodes (articulation points) in the CKG for a domain.
   * Same semantics as PKG getBridgeNodes, but without userId scoping.
   */
  getCkgBridgeNodes(
    query: IBridgeQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<IBridgeNodesResult>>;

  /**
   * Find common ancestors of two nodes in the CKG.
   * Same semantics as PKG getCommonAncestors, but without userId scoping.
   * (No CKG frontier — CKG has no mastery levels.)
   */
  getCkgCommonAncestors(
    nodeIdA: NodeId,
    nodeIdB: NodeId,
    query: ICommonAncestorsQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ICommonAncestorsResult>>;

  // ========================================================================
  // CKG Ordering & Ranking (Phase 8d)
  // ========================================================================

  /**
   * Compute the prerequisite chain for a target node in the CKG.
   * Same semantics as PKG getPrerequisiteChain, but without userId scoping.
   */
  getCkgPrerequisiteChain(
    nodeId: NodeId,
    query: IPrerequisiteChainQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<IPrerequisiteChainResult>>;

  /**
   * Rank nodes by centrality in the CKG for a domain.
   * Same semantics as PKG getCentralityRanking, but without userId scoping.
   */
  getCkgCentralityRanking(
    query: ICentralityQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ICentralityResult>>;

  // ========================================================================
  // Structural Metrics
  // ========================================================================

  /**
   * Compute structural metrics for a user in a domain.
   * This triggers a full recomputation (expensive).
   */
  computeMetrics(
    userId: UserId,
    domain: string,
    studyMode: StudyMode,
    context: IExecutionContext
  ): Promise<IServiceResult<IStructuralMetrics>>;

  /**
   * Get the latest structural metrics for a user in a domain.
   * Returns the most recent cached snapshot.
   */
  getMetrics(
    userId: UserId,
    domain: string,
    studyMode: StudyMode,
    context: IExecutionContext
  ): Promise<IServiceResult<IStructuralMetrics>>;

  /**
   * Get structural metrics history for trend visualization.
   */
  getMetricsHistory(
    userId: UserId,
    domain: string,
    studyMode: StudyMode,
    options: IMetricsHistoryOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<IStructuralMetrics[]>>;

  // ========================================================================
  // Misconception Detection
  // ========================================================================

  /**
   * Run misconception detection for a user in a domain.
   * Executes all active detection patterns against the user's PKG.
   */
  detectMisconceptions(
    userId: UserId,
    domain: string,
    studyMode: StudyMode,
    context: IExecutionContext
  ): Promise<IServiceResult<IMisconceptionDetection[]>>;

  /**
   * Get existing misconceptions for a user.
   * @param domain Optional domain filter.
   */
  getMisconceptions(
    userId: UserId,
    domain: string | undefined,
    studyMode: StudyMode,
    context: IExecutionContext
  ): Promise<IServiceResult<IMisconceptionDetection[]>>;

  /**
   * Update a misconception's lifecycle status.
   */
  updateMisconceptionStatus(
    detectionId: string,
    status: string,
    context: IExecutionContext
  ): Promise<IServiceResult<void>>;

  // ========================================================================
  // Structural Health & Metacognitive Stage (Phase 7)
  // ========================================================================

  /**
   * Get a comprehensive structural health report for a user in a domain.
   *
   * Synthesizes metrics, misconceptions, and metacognitive stage into
   * a single health assessment with per-metric breakdowns and trends.
   */
  getStructuralHealth(
    userId: UserId,
    domain: string,
    studyMode: StudyMode,
    context: IExecutionContext
  ): Promise<IServiceResult<IStructuralHealthReport>>;

  /**
   * Assess the user's metacognitive stage for a domain.
   *
   * Evaluates stage gate criteria based on structural metrics and
   * returns the current stage, evidence, gaps to the next stage,
   * and regression detection.
   */
  getMetacognitiveStage(
    userId: UserId,
    domain: string,
    studyMode: StudyMode,
    context: IExecutionContext
  ): Promise<IServiceResult<IMetacognitiveStageAssessment>>;

  // ========================================================================
  // PKG↔CKG Comparison
  // ========================================================================

  /**
   * Compare a user's PKG structure against the CKG for a domain.
   *
   * Fetches both subgraphs, runs alignment, computes divergences,
   * and returns the full comparison object. Agent hints highlight the
   * most significant divergences and suggest remediation actions.
   */
  compareWithCkg(
    userId: UserId,
    request: IComparisonRequest,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphComparison>>;

  // ========================================================================
  // CKG Mutation Pipeline (Phase 6)
  // ========================================================================

  /**
   * Propose a new CKG mutation.
   *
   * Creates a mutation in PROPOSED state and fires off async validation.
   * Returns immediately — the mutation progresses through the typestate
   * pipeline (validate → prove → commit) asynchronously.
   */
  proposeMutation(
    proposal: IMutationProposal,
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation>>;

  /**
   * Get a CKG mutation by ID.
   */
  getMutation(
    mutationId: MutationId,
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation>>;

  /**
   * List CKG mutations with optional filters (state, proposedBy).
   */
  listMutations(
    filters: IMutationFilter,
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation[]>>;

  /**
   * Cancel a CKG mutation. Only allowed for PROPOSED or VALIDATING state.
   * Transitions to REJECTED with "cancelled by proposer" reason.
   */
  cancelMutation(
    mutationId: MutationId,
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation>>;

  /**
   * Retry a rejected CKG mutation. Creates a NEW mutation with the same
   * operations — the original stays REJECTED for audit.
   */
  retryMutation(
    mutationId: MutationId,
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation>>;

  /**
   * Get the full audit log for a CKG mutation.
   */
  getMutationAuditLog(
    mutationId: MutationId,
    context: IExecutionContext
  ): Promise<IServiceResult<IMutationAuditEntry[]>>;

  /**
   * Get the CKG mutation pipeline health metrics.
   *
   * Returns per-state counts and stuck mutation count.
   * Restricted to admin/agent roles at the API layer.
   */
  getMutationPipelineHealth(
    context: IExecutionContext
  ): Promise<IServiceResult<IPipelineHealthResult>>;

  /**
   * Approve an escalated CKG mutation (PENDING_REVIEW → VALIDATED).
   *
   * Overrides ontological conflicts detected during validation and resumes
   * the mutation pipeline (prove → commit).
   */
  approveEscalatedMutation(
    mutationId: MutationId,
    reason: string,
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation>>;

  /**
   * Reject an escalated CKG mutation (PENDING_REVIEW → REJECTED).
   *
   * Confirms ontological conflicts are real and rejects the mutation.
   */
  rejectEscalatedMutation(
    mutationId: MutationId,
    reason: string,
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation>>;

  /**
   * Request revision of an escalated CKG mutation (PENDING_REVIEW → REVISION_REQUESTED).
   *
   * Instead of approving or rejecting, the reviewer requests changes.
   * The proposer must resubmit with updated operations.
   */
  requestMutationRevision(
    mutationId: MutationId,
    feedback: string,
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation>>;

  /**
   * Resubmit a mutation after revision (REVISION_REQUESTED → PROPOSED).
   *
   * The proposer provides updated operations. The mutation re-enters the
   * pipeline from the beginning.
   */
  resubmitMutation(
    mutationId: MutationId,
    updatedOperations: CkgMutationOperation[],
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation>>;

  /**
   * Force-reject a stuck mutation from the operator workflow.
   */
  rejectStuckMutation(
    mutationId: MutationId,
    reason: string,
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation>>;

  /**
   * Force-reconcile a COMMITTING mutation when the graph write is known to have landed.
   */
  reconcileMutationCommit(
    mutationId: MutationId,
    reason: string,
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation>>;

  /**
   * Diagnose whether a mutation is safe to reject-and-retry because no graph write landed.
   */
  checkMutationSafeRetry(
    mutationId: MutationId,
    context: IExecutionContext
  ): Promise<IServiceResult<IMutationRecoveryCheckResult>>;

  /**
   * Diagnose whether a COMMITTING mutation is safe to reconcile because the graph write landed.
   */
  checkMutationReconcileCommit(
    mutationId: MutationId,
    context: IExecutionContext
  ): Promise<IServiceResult<IMutationRecoveryCheckResult>>;

  // ========================================================================
  // Graph Snapshots & Restore (Phase G)
  // ========================================================================

  createGraphSnapshot(
    input: IGraphRestoreScopeInput,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphSnapshotSummary>>;

  listGraphSnapshots(
    filters: {
      graphType?: 'pkg' | 'ckg';
      userId?: UserId;
      domain?: string;
    },
    pagination: { limit: number; offset: number },
    context: IExecutionContext
  ): Promise<IServiceResult<IPaginatedResponse<IGraphSnapshotSummary>>>;

  previewGraphRestore(
    snapshotId: string,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphRestorePreview>>;

  executeGraphRestore(
    snapshotId: string,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphRestorePreview>>;

  // ========================================================================
  // Graph CRDT Stats (Phase I)
  // ========================================================================

  listGraphCrdtStats(
    filters: {
      targetKind?: GraphCrdtTargetKind;
      targetNodeId?: NodeId;
      proposedLabel?: string;
      evidenceType?: string;
    },
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphCrdtStat[]>>;

  // ========================================================================
  // PKG Operation Log
  // ========================================================================

  /**
   * Get the operation log for a user's PKG with filtering and pagination.
   *
   * Dispatches to the appropriate IPkgOperationLogRepository query method
   * based on which filters are present (nodeId, edgeId, operationType, since).
   */
  getOperationLog(
    userId: UserId,
    filters: IOperationLogFilter,
    pagination: { limit: number; offset: number },
    context: IExecutionContext
  ): Promise<IServiceResult<IPaginatedResponse<IPkgOperationLogEntry>>>;
}

// ============================================================================
// Supporting Types
// ============================================================================

/**
 * Filters for the PKG operation log query.
 * The service dispatches to the most specific repository method available.
 */
export interface IOperationLogFilter {
  readonly operationType?: PkgOperationType;
  readonly nodeId?: NodeId;
  readonly edgeId?: EdgeId;
  readonly since?: string;
}

/**
 * CKG mutation pipeline health result.
 */
export interface IPipelineHealthResult {
  readonly proposedCount: number;
  readonly validatingCount: number;
  readonly validatedCount: number;
  readonly pendingReviewCount: number;
  readonly revisionRequestedCount: number;
  readonly committedCount: number;
  readonly rejectedCount: number;
  readonly stuckCount: number;
  readonly totalCount: number;
}

export interface IMutationRecoveryCheckResult {
  readonly mutationId: MutationId;
  readonly check: 'safe_retry' | 'reconcile_commit';
  readonly eligible: boolean;
  readonly recommendedAction: 'recover_reject' | 'reconcile_commit' | 'wait' | 'none';
  readonly mutationState: string;
  readonly summary: string;
  readonly details: readonly string[];
  readonly checkedAt: string;
  readonly graphEvidence: {
    readonly writeDetected: boolean;
    readonly matchedNodeIds: readonly NodeId[];
    readonly matchedEdgeIds: readonly EdgeId[];
  };
}
