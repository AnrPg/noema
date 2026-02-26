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
  IGraphEdge,
  IGraphNode,
  IMetacognitiveStageAssessment,
  IMisconceptionDetection,
  IPaginatedResponse,
  IStructuralHealthReport,
  IStructuralMetrics,
  ISubgraph,
  MutationId,
  NodeId,
  UserId
} from '@noema/types';

import type { IMutationFilter, IMutationProposal } from './ckg-mutation-dsl.js';
import type {
  ICreateEdgeInput,
  ICreateNodeInput,
  IEdgeFilter,
  IUpdateEdgeInput,
  IUpdateNodeInput,
} from './graph.repository.js';
import type { IMetricsHistoryOptions } from './metrics.repository.js';
import type { ICkgMutation, IMutationAuditEntry } from './mutation.repository.js';
import type { IGraphComparison } from './value-objects/comparison.js';
import type {
  ICoParentsQuery,
  ICoParentsResult,
  INeighborhoodQuery,
  INeighborhoodResult,
  INodeFilter,
  ISiblingsQuery,
  ISiblingsResult,
  ITraversalOptions,
  IValidationOptions,
} from './value-objects/graph.value-objects.js';

import type { IExecutionContext, IServiceResult } from './execution-context.js';
export type { IExecutionContext, IServiceResult } from './execution-context.js';

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
    edgeId: string,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphEdge>>;

  /**
   * Update an edge in the user's PKG (weight and/or properties).
   */
  updateEdge(
    userId: UserId,
    edgeId: string,
    updates: IUpdateEdgeInput,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphEdge>>;

  /**
   * Delete an edge from the user's PKG.
   */
  deleteEdge(
    userId: UserId,
    edgeId: string,
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
   */
  findPath(
    userId: UserId,
    fromNodeId: NodeId,
    toNodeId: NodeId,
    context: IExecutionContext
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
  getCkgEdge(
    edgeId: EdgeId,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphEdge>>;

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
    context: IExecutionContext
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
  // Structural Metrics
  // ========================================================================

  /**
   * Compute structural metrics for a user in a domain.
   * This triggers a full recomputation (expensive).
   */
  computeMetrics(
    userId: UserId,
    domain: string,
    context: IExecutionContext
  ): Promise<IServiceResult<IStructuralMetrics>>;

  /**
   * Get the latest structural metrics for a user in a domain.
   * Returns the most recent cached snapshot.
   */
  getMetrics(
    userId: UserId,
    domain: string,
    context: IExecutionContext
  ): Promise<IServiceResult<IStructuralMetrics>>;

  /**
   * Get structural metrics history for trend visualization.
   */
  getMetricsHistory(
    userId: UserId,
    domain: string,
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
    context: IExecutionContext
  ): Promise<IServiceResult<IMisconceptionDetection[]>>;

  /**
   * Get existing misconceptions for a user.
   * @param domain Optional domain filter.
   */
  getMisconceptions(
    userId: UserId,
    domain: string | undefined,
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
    domain: string,
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
  readonly committedCount: number;
  readonly rejectedCount: number;
  readonly stuckCount: number;
  readonly totalCount: number;
}
