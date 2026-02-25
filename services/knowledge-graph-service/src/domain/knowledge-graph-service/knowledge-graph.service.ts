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
  IMisconceptionDetection,
  IPaginatedResponse,
  IStructuralMetrics,
  ISubgraph,
  NodeId,
  UserId,
} from '@noema/types';

import type { ICreateEdgeInput, ICreateNodeInput, IUpdateNodeInput } from './graph.repository.js';
import type { IMetricsHistoryOptions } from './metrics.repository.js';
import type { IGraphComparison } from './value-objects/comparison.js';
import type {
  INodeFilter,
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
   * Delete an edge from the user's PKG.
   */
  deleteEdge(
    userId: UserId,
    edgeId: string,
    context: IExecutionContext
  ): Promise<IServiceResult<void>>;

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
}
