/**
 * @noema/knowledge-graph-service — Cached Graph Repository
 *
 * Decorator around IGraphRepository that caches hot-path reads:
 * - getNode, getNodesByIds, getEdgesForNode
 *
 * Traversal operations (getAncestors, getDescendants, getSubgraph,
 * findShortestPath, detectCycles) pass through uncached — they're
 * too variable/expensive to cache effectively and called infrequently
 * during interactive sessions.
 *
 * Write operations delegate to inner + invalidate affected cache entries.
 *
 * Design decision D4: Cache hot-path reads, pass-through traversals.
 */

import type {
  EdgeId,
  GraphEdgeType,
  IGraphEdge,
  IGraphNode,
  ISubgraph,
  NodeId,
} from '@noema/types';

import type {
  EdgeDirection,
  ICreateEdgeInput,
  ICreateNodeInput,
  IEdgeFilter,
  IGraphRepository,
  IUpdateEdgeInput,
  IUpdateNodeInput,
} from '../../domain/knowledge-graph-service/graph.repository.js';
import type {
  INodeFilter,
  ITraversalOptions,
} from '../../domain/knowledge-graph-service/value-objects/graph.value-objects.js';
import type { KgRedisCacheProvider } from './kg-redis-cache.provider.js';

// ============================================================================
// CachedGraphRepository
// ============================================================================

export class CachedGraphRepository implements IGraphRepository {
  constructor(
    private readonly inner: IGraphRepository,
    private readonly cache: KgRedisCacheProvider,
    private readonly entityTtl: number,
    private readonly queryTtl: number
  ) {}

  // ==========================================================================
  // INodeRepository — Cached reads, write-through with invalidation
  // ==========================================================================

  async createNode(
    graphType: string,
    input: ICreateNodeInput,
    userId?: string
  ): Promise<IGraphNode> {
    const node = await this.inner.createNode(graphType, input, userId);
    // Pre-populate cache with newly created node
    await this.cache.set(this.cache.nodeKey(node.nodeId), node, this.entityTtl);
    return node;
  }

  async getNode(nodeId: NodeId, userId?: string): Promise<IGraphNode | null> {
    return this.cache.getOrLoad(this.cache.nodeKey(nodeId), this.entityTtl, () =>
      this.inner.getNode(nodeId, userId)
    );
  }

  async updateNode(
    nodeId: NodeId,
    updates: IUpdateNodeInput,
    userId?: string
  ): Promise<IGraphNode> {
    const node = await this.inner.updateNode(nodeId, updates, userId);
    await this.cache.del(this.cache.nodeKey(nodeId));
    return node;
  }

  async deleteNode(nodeId: NodeId, userId?: string): Promise<void> {
    await this.inner.deleteNode(nodeId, userId);
    await this.cache.del(this.cache.nodeKey(nodeId));
    // Invalidate cached edges for this node (all directions)
    await this.cache.delPattern(this.cache.edgesForNodePattern(nodeId));
  }

  async findNodes(filter: INodeFilter, limit: number, offset: number): Promise<IGraphNode[]> {
    // Pass through — filter queries are too variable to cache effectively
    return this.inner.findNodes(filter, limit, offset);
  }

  async countNodes(filter: INodeFilter): Promise<number> {
    return this.inner.countNodes(filter);
  }

  // ==========================================================================
  // IEdgeRepository — Cached getEdgesForNode, rest pass-through
  // ==========================================================================

  async createEdge(
    graphType: string,
    input: ICreateEdgeInput,
    userId?: string
  ): Promise<IGraphEdge> {
    const edge = await this.inner.createEdge(graphType, input, userId);
    // Invalidate cached edges for both source and target nodes
    await this.cache.delPattern(this.cache.edgesForNodePattern(input.sourceNodeId));
    await this.cache.delPattern(this.cache.edgesForNodePattern(input.targetNodeId));
    return edge;
  }

  async getEdge(edgeId: EdgeId): Promise<IGraphEdge | null> {
    // Pass through — individual edge lookups are rare
    return this.inner.getEdge(edgeId);
  }

  async removeEdge(edgeId: EdgeId): Promise<void> {
    // Pre-fetch edge to get node IDs for invalidation
    const edge = await this.inner.getEdge(edgeId);
    await this.inner.removeEdge(edgeId);
    if (edge) {
      await this.cache.delPattern(this.cache.edgesForNodePattern(edge.sourceNodeId));
      await this.cache.delPattern(this.cache.edgesForNodePattern(edge.targetNodeId));
    }
  }

  async updateEdge(edgeId: EdgeId, updates: IUpdateEdgeInput): Promise<IGraphEdge> {
    // Pre-fetch edge to get node IDs for invalidation
    const existingEdge = await this.inner.getEdge(edgeId);
    const updatedEdge = await this.inner.updateEdge(edgeId, updates);
    if (existingEdge) {
      await this.cache.delPattern(this.cache.edgesForNodePattern(existingEdge.sourceNodeId));
      await this.cache.delPattern(this.cache.edgesForNodePattern(existingEdge.targetNodeId));
    }
    return updatedEdge;
  }

  async findEdges(filter: IEdgeFilter): Promise<IGraphEdge[]> {
    return this.inner.findEdges(filter);
  }

  async getEdgesForNode(nodeId: NodeId, direction: EdgeDirection): Promise<IGraphEdge[]> {
    return this.cache.getOrLoad(this.cache.edgesForNodeKey(nodeId, direction), this.queryTtl, () =>
      this.inner.getEdgesForNode(nodeId, direction)
    );
  }

  // ==========================================================================
  // ITraversalRepository — All pass-through (D4)
  // ==========================================================================

  async getAncestors(
    nodeId: NodeId,
    options: ITraversalOptions,
    userId?: string
  ): Promise<IGraphNode[]> {
    return this.inner.getAncestors(nodeId, options, userId);
  }

  async getDescendants(
    nodeId: NodeId,
    options: ITraversalOptions,
    userId?: string
  ): Promise<IGraphNode[]> {
    return this.inner.getDescendants(nodeId, options, userId);
  }

  async findShortestPath(
    fromNodeId: NodeId,
    toNodeId: NodeId,
    userId?: string
  ): Promise<IGraphNode[]> {
    return this.inner.findShortestPath(fromNodeId, toNodeId, userId);
  }

  async findFilteredShortestPath(
    fromNodeId: NodeId,
    toNodeId: NodeId,
    edgeTypeFilter?: readonly GraphEdgeType[],
    nodeTypeFilter?: readonly string[],
    userId?: string
  ): Promise<IGraphNode[]> {
    return this.inner.findFilteredShortestPath(
      fromNodeId,
      toNodeId,
      edgeTypeFilter,
      nodeTypeFilter,
      userId
    );
  }

  async getSubgraph(
    rootNodeId: NodeId,
    options: ITraversalOptions,
    userId?: string
  ): Promise<ISubgraph> {
    return this.inner.getSubgraph(rootNodeId, options, userId);
  }

  async detectCycles(nodeId: NodeId, edgeType?: GraphEdgeType, userId?: string): Promise<NodeId[]> {
    return this.inner.detectCycles(nodeId, edgeType, userId);
  }

  // ==========================================================================
  // IBatchGraphRepository — Write-through with invalidation
  // ==========================================================================

  async createNodes(
    graphType: string,
    inputs: readonly ICreateNodeInput[],
    userId?: string
  ): Promise<IGraphNode[]> {
    const nodes = await this.inner.createNodes(graphType, inputs, userId);
    // Pre-populate cache for each new node
    for (const node of nodes) {
      await this.cache.set(this.cache.nodeKey(node.nodeId), node, this.entityTtl);
    }
    return nodes;
  }

  async createEdges(
    graphType: string,
    inputs: readonly ICreateEdgeInput[],
    userId?: string
  ): Promise<IGraphEdge[]> {
    const edges = await this.inner.createEdges(graphType, inputs, userId);
    // Invalidate edge caches for all affected nodes
    const nodeIds = new Set<NodeId>();
    for (const input of inputs) {
      nodeIds.add(input.sourceNodeId);
      nodeIds.add(input.targetNodeId);
    }
    for (const nodeId of nodeIds) {
      await this.cache.delPattern(this.cache.edgesForNodePattern(nodeId));
    }
    return edges;
  }

  async getNodesByIds(nodeIds: readonly NodeId[], userId?: string): Promise<IGraphNode[]> {
    return this.cache.getOrLoad(this.cache.nodesByIdsKey(nodeIds), this.queryTtl, () =>
      this.inner.getNodesByIds(nodeIds, userId)
    );
  }

  // ==========================================================================
  // Transaction support — delegates to inner (cache is bypassed within tx)
  // ==========================================================================

  async runInTransaction<T>(fn: (txRepo: IGraphRepository) => Promise<T>): Promise<T> {
    return this.inner.runInTransaction(fn);
  }
}
