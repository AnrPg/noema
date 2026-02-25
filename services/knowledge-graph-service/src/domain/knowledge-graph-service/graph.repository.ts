/**
 * @noema/knowledge-graph-service - Graph Repository Interfaces
 *
 * Split IGraphRepository following the Interface Segregation Principle (ISP)
 * into four focused sub-interfaces: INodeRepository, IEdgeRepository,
 * ITraversalRepository, and IBatchGraphRepository.
 *
 * The composite IGraphRepository extends all four for convenience — services
 * needing full graph capability inject it, while services needing only a
 * subset depend on the narrower interface.
 *
 * Zero infrastructure imports — these interfaces are implemented by
 * Neo4jGraphRepository in the infrastructure layer (Phase 4).
 */

import type {
  EdgeId,
  EdgeWeight,
  GraphEdgeType,
  IGraphEdge,
  IGraphNode,
  ISubgraph,
  MasteryLevel,
  NodeId,
} from '@noema/types';

import type { INodeFilter, ITraversalOptions } from './value-objects/graph.value-objects.js';

// ============================================================================
// Input Types
// ============================================================================

/**
 * Input for creating a graph node.
 */
export interface ICreateNodeInput {
  readonly label: string;
  readonly nodeType: string;
  readonly domain: string;
  readonly description?: string;
  readonly properties?: Record<string, unknown>;
  readonly masteryLevel?: MasteryLevel;
}

/**
 * Input for updating a graph node (partial update).
 */
export interface IUpdateNodeInput {
  readonly label?: string;
  readonly description?: string;
  readonly domain?: string;
  readonly properties?: Record<string, unknown>;
  readonly masteryLevel?: MasteryLevel;
}

/**
 * Input for creating a graph edge.
 */
export interface ICreateEdgeInput {
  readonly sourceNodeId: NodeId;
  readonly targetNodeId: NodeId;
  readonly edgeType: GraphEdgeType;
  readonly weight?: EdgeWeight;
  readonly properties?: Record<string, unknown>;
}

/**
 * Criteria for filtering edges.
 */
export interface IEdgeFilter {
  readonly edgeType?: GraphEdgeType;
  readonly sourceNodeId?: NodeId;
  readonly targetNodeId?: NodeId;
  readonly userId?: string;
}

/**
 * Direction for edge retrieval relative to a node.
 */
export type EdgeDirection = 'inbound' | 'outbound' | 'both';

// ============================================================================
// INodeRepository — Node CRUD operations
// ============================================================================

/**
 * Node-scoped graph repository.
 *
 * Covers creation, retrieval, update, soft-delete, and querying of
 * individual graph nodes. Graph-type aware: PKG nodes are scoped by userId.
 */
export interface INodeRepository {
  /**
   * Create a new graph node.
   * @param graphType Which graph (pkg or ckg) the node belongs to.
   * @param input Node creation data.
   * @param userId Owner user ID (required for PKG, omitted for CKG).
   * @returns The created node with generated ID and timestamps.
   */
  createNode(graphType: string, input: ICreateNodeInput, userId?: string): Promise<IGraphNode>;

  /**
   * Get a node by ID. Graph-type aware — PKG nodes are scoped by userId.
   * @returns The node, or null if not found (or soft-deleted).
   */
  getNode(nodeId: NodeId, userId?: string): Promise<IGraphNode | null>;

  /**
   * Update a node's properties (partial update).
   * @returns The updated node with new `updatedAt`.
   */
  updateNode(nodeId: NodeId, updates: IUpdateNodeInput, userId?: string): Promise<IGraphNode>;

  /**
   * Soft-delete a node (marks as deleted, does not remove from graph).
   * Also handles orphaned edges (edges where this node is source or target).
   */
  deleteNode(nodeId: NodeId, userId?: string): Promise<void>;

  /**
   * Find nodes matching filter criteria.
   * @param filter Reusable filter criteria.
   * @param limit Maximum number of results.
   * @param offset Offset for pagination.
   */
  findNodes(filter: INodeFilter, limit: number, offset: number): Promise<IGraphNode[]>;

  /**
   * Count nodes matching filter criteria (for pagination metadata).
   */
  countNodes(filter: INodeFilter): Promise<number>;
}

// ============================================================================
// IEdgeRepository — Edge CRUD operations
// ============================================================================

/**
 * Edge-scoped graph repository.
 *
 * Covers creation, retrieval, removal, and querying of edges.
 * Validation of edge types and weights is the service layer's concern
 * (using EDGE_TYPE_POLICIES); the repository performs raw CRUD.
 */
export interface IEdgeRepository {
  /**
   * Create an edge between two nodes.
   * @param graphType Which graph (pkg or ckg).
   * @param input Edge creation data.
   * @param userId Owner user ID (required for PKG).
   * @returns The created edge.
   */
  createEdge(
    graphType: string,
    input: ICreateEdgeInput,
    userId?: string
  ): Promise<IGraphEdge>;

  /**
   * Get an edge by ID.
   * @returns The edge, or null if not found.
   */
  getEdge(edgeId: EdgeId): Promise<IGraphEdge | null>;

  /**
   * Remove an edge (hard delete — edges have no soft-delete semantics).
   */
  removeEdge(edgeId: EdgeId): Promise<void>;

  /**
   * Find edges matching filter criteria.
   */
  findEdges(filter: IEdgeFilter): Promise<IGraphEdge[]>;

  /**
   * Get all edges for a node in a given direction.
   */
  getEdgesForNode(nodeId: NodeId, direction: EdgeDirection): Promise<IGraphEdge[]>;
}

// ============================================================================
// ITraversalRepository — Graph traversal operations
// ============================================================================

/**
 * Traversal-scoped graph repository.
 *
 * First-class traversal operations that leverage Neo4j's native graph
 * querying capabilities. These are what distinguish a graph database
 * from a relational one — queries like "find all prerequisites of
 * concept X" or "find all nodes reachable within 3 hops."
 */
export interface ITraversalRepository {
  /**
   * Get ancestors of a node (following edges of specified types, up to maxDepth).
   */
  getAncestors(nodeId: NodeId, options: ITraversalOptions, userId?: string): Promise<IGraphNode[]>;

  /**
   * Get descendants of a node (following edges in reverse direction).
   */
  getDescendants(
    nodeId: NodeId,
    options: ITraversalOptions,
    userId?: string
  ): Promise<IGraphNode[]>;

  /**
   * Find shortest path between two nodes.
   * @returns Ordered array of nodes forming the path, or empty if no path exists.
   */
  findShortestPath(fromNodeId: NodeId, toNodeId: NodeId, userId?: string): Promise<IGraphNode[]>;

  /**
   * Find shortest path between two nodes with edge type and node type filters.
   * More targeted than the basic findShortestPath.
   */
  findFilteredShortestPath(
    fromNodeId: NodeId,
    toNodeId: NodeId,
    edgeTypeFilter?: readonly GraphEdgeType[],
    nodeTypeFilter?: readonly string[],
    userId?: string
  ): Promise<IGraphNode[]>;

  /**
   * Get the full subgraph reachable from a node within a depth limit.
   * Returns both the nodes and the edges connecting them.
   */
  getSubgraph(rootNodeId: NodeId, options: ITraversalOptions, userId?: string): Promise<ISubgraph>;

  /**
   * Detect cycles involving a given node or edge.
   * Critical for acyclicity validation in edge creation.
   * @returns Array of node IDs forming the cycle, or empty if no cycle is found.
   */
  detectCycles(nodeId: NodeId, edgeType?: GraphEdgeType, userId?: string): Promise<NodeId[]>;
}

// ============================================================================
// IBatchGraphRepository — Batch operations
// ============================================================================

/**
 * Batch-scoped graph repository.
 *
 * Multi-entity operations that run in a single Neo4j transaction for
 * atomicity and performance. Used by import pipelines, aggregation,
 * and batch node/edge creation flows.
 */
export interface IBatchGraphRepository {
  /**
   * Create multiple nodes in a single transaction.
   * @returns The created nodes.
   */
  createNodes(
    graphType: string,
    inputs: readonly ICreateNodeInput[],
    userId?: string
  ): Promise<IGraphNode[]>;

  /**
   * Create multiple edges in a single transaction.
   * @returns The created edges.
   */
  createEdges(
    graphType: string,
    inputs: readonly ICreateEdgeInput[],
    userId?: string
  ): Promise<IGraphEdge[]>;

  /**
   * Get multiple nodes by their IDs.
   * @returns Found nodes (may be fewer than requested if some don't exist).
   */
  getNodesByIds(nodeIds: readonly NodeId[], userId?: string): Promise<IGraphNode[]>;
}

// ============================================================================
// IGraphRepository — Composite Interface
// ============================================================================

/**
 * Full graph repository interface — the composition of all four sub-interfaces.
 *
 * Services that need complete graph capability inject this composite.
 * The split sub-interfaces enable:
 * - **Testing ergonomics**: mock only the sub-interface you need
 * - **ISP compliance**: don't depend on methods you don't call
 * - **Decorator composition**: cache INodeRepository without ITraversalRepository
 */
export interface IGraphRepository
  extends INodeRepository, IEdgeRepository, ITraversalRepository, IBatchGraphRepository {}
