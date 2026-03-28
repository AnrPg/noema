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
  INodeMasterySummary,
  MasteryLevel,
  ISubgraph,
  NodeId,
  StudyMode,
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
  ICentralityEntry,
  ICentralityQuery,
  ICoParentsQuery,
  ICoParentsResult,
  ICommonAncestorsQuery,
  ICommonAncestorsResult,
  IFrontierQuery,
  IKnowledgeFrontierResult,
  INeighborhoodQuery,
  INeighborhoodResult,
  INodeFilter,
  ISiblingsQuery,
  ISiblingsResult,
  ITraversalOptions,
} from '../../domain/knowledge-graph-service/value-objects/graph.value-objects.js';
import type { KgRedisCacheProvider } from './kg-redis-cache.provider.js';

// ============================================================================
// CachedGraphRepository
// ============================================================================

export class CachedGraphRepository implements IGraphRepository {
  /** Short TTL for mastery-sensitive data (frontier, centrality). */
  private readonly shortTtl: number;

  constructor(
    private readonly inner: IGraphRepository,
    private readonly cache: KgRedisCacheProvider,
    private readonly entityTtl: number,
    private readonly queryTtl: number,
    shortTtl = 60
  ) {
    this.shortTtl = shortTtl;
  }

  // ==========================================================================
  // Cache key helpers — all keys include userId scope to prevent cross-user
  // cache pollution (Fix 2.7)
  // ==========================================================================

  private scopedNodeKey(nodeId: NodeId, userId?: string): string {
    const scope = userId ?? 'ckg';
    return `${scope}:${this.cache.nodeKey(nodeId)}`;
  }

  private scopedEdgesForNodeKey(nodeId: NodeId, direction: string, userId?: string): string {
    const scope = userId ?? 'ckg';
    return `${scope}:${this.cache.edgesForNodeKey(nodeId, direction)}`;
  }

  private scopedEdgesForNodePattern(nodeId: NodeId, userId?: string): string {
    const scope = userId ?? 'ckg';
    return `${scope}:${this.cache.edgesForNodePattern(nodeId)}`;
  }

  private scopedNodesByIdsKey(nodeIds: readonly NodeId[], userId?: string): string {
    const scope = userId ?? 'ckg';
    return `${scope}:${this.cache.nodesByIdsKey(nodeIds)}`;
  }

  // ==========================================================================
  // INodeRepository — Cached reads, write-through with invalidation
  // ==========================================================================

  async createNode(
    graphType: string,
    input: ICreateNodeInput,
    userId?: string
  ): Promise<IGraphNode> {
    const node = await this.inner.createNode(graphType, input, userId);
    // Pre-populate cache with newly created node (scoped by userId)
    await this.cache.set(this.scopedNodeKey(node.nodeId, userId), node, this.entityTtl);
    return node;
  }

  async getNode(nodeId: NodeId, userId?: string): Promise<IGraphNode | null> {
    return this.cache.getOrLoad(this.scopedNodeKey(nodeId, userId), this.entityTtl, () =>
      this.inner.getNode(nodeId, userId)
    );
  }

  async updateNode(
    nodeId: NodeId,
    updates: IUpdateNodeInput,
    userId?: string
  ): Promise<IGraphNode> {
    const node = await this.inner.updateNode(nodeId, updates, userId);
    await this.cache.del(this.scopedNodeKey(nodeId, userId));
    return node;
  }

  async deleteNode(nodeId: NodeId, userId?: string): Promise<void> {
    await this.inner.deleteNode(nodeId, userId);
    await this.cache.del(this.scopedNodeKey(nodeId, userId));
    // Invalidate cached edges for this node (all directions)
    await this.cache.delPattern(this.scopedEdgesForNodePattern(nodeId, userId));
  }

  async findNodes(filter: INodeFilter, limit: number, offset: number): Promise<IGraphNode[]> {
    // Pass through — filter queries are too variable to cache effectively
    return this.inner.findNodes(filter, limit, offset);
  }

  async countNodes(filter: INodeFilter): Promise<number> {
    return this.inner.countNodes(filter);
  }

  async getNodeMasterySummary(
    filter: INodeFilter,
    masteryThreshold: MasteryLevel
  ): Promise<INodeMasterySummary> {
    return this.inner.getNodeMasterySummary(filter, masteryThreshold);
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
    // Invalidate cached edges for both source and target nodes (scoped by userId)
    await this.cache.delPattern(this.scopedEdgesForNodePattern(input.sourceNodeId, userId));
    await this.cache.delPattern(this.scopedEdgesForNodePattern(input.targetNodeId, userId));
    return edge;
  }

  async getEdge(edgeId: EdgeId): Promise<IGraphEdge | null> {
    // Pass through — individual edge lookups are rare
    return this.inner.getEdge(edgeId);
  }

  async removeEdge(edgeId: EdgeId): Promise<void> {
    // Pre-fetch edge to get node IDs for cache invalidation
    const edge = await this.inner.getEdge(edgeId);
    await this.inner.removeEdge(edgeId);
    if (edge) {
      // Invalidate for the owning user's scope (or CKG if no userId)
      const scope = edge.userId ?? undefined;
      await this.cache.delPattern(this.scopedEdgesForNodePattern(edge.sourceNodeId, scope));
      await this.cache.delPattern(this.scopedEdgesForNodePattern(edge.targetNodeId, scope));
    }
  }

  async updateEdge(edgeId: EdgeId, updates: IUpdateEdgeInput): Promise<IGraphEdge> {
    // Pre-fetch edge to get node IDs for cache invalidation
    const existingEdge = await this.inner.getEdge(edgeId);
    const updatedEdge = await this.inner.updateEdge(edgeId, updates);
    if (existingEdge) {
      // Invalidate for the owning user's scope (or CKG if no userId)
      const scope = existingEdge.userId ?? undefined;
      await this.cache.delPattern(this.scopedEdgesForNodePattern(existingEdge.sourceNodeId, scope));
      await this.cache.delPattern(this.scopedEdgesForNodePattern(existingEdge.targetNodeId, scope));
    }
    return updatedEdge;
  }

  async findEdges(filter: IEdgeFilter, limit?: number, offset?: number): Promise<IGraphEdge[]> {
    // Bypass cache for paginated queries — cache only full-filter results.
    return this.inner.findEdges(filter, limit, offset);
  }

  async countEdges(filter: IEdgeFilter): Promise<number> {
    // Pass through — count queries are cheap and rarely repeated identically
    return this.inner.countEdges(filter);
  }

  async getEdgesForNode(
    nodeId: NodeId,
    direction: EdgeDirection,
    userId?: string
  ): Promise<IGraphEdge[]> {
    return this.cache.getOrLoad(
      this.scopedEdgesForNodeKey(nodeId, direction, userId),
      this.queryTtl,
      () => this.inner.getEdgesForNode(nodeId, direction, userId)
    );
  }

  async getEdgesForNodes(
    nodeIds: readonly NodeId[],
    filter?: IEdgeFilter,
    userId?: string
  ): Promise<IGraphEdge[]> {
    // Pass through — batch queries are too variable to cache effectively
    return this.inner.getEdgesForNodes(nodeIds, filter, userId);
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
    userId?: string,
    maxDepth?: number
  ): Promise<IGraphNode[]> {
    return this.inner.findShortestPath(fromNodeId, toNodeId, userId, maxDepth);
  }

  async findFilteredShortestPath(
    fromNodeId: NodeId,
    toNodeId: NodeId,
    edgeTypeFilter?: readonly GraphEdgeType[],
    nodeTypeFilter?: readonly string[],
    userId?: string,
    maxDepth?: number
  ): Promise<IGraphNode[]> {
    return this.inner.findFilteredShortestPath(
      fromNodeId,
      toNodeId,
      edgeTypeFilter,
      nodeTypeFilter,
      userId,
      maxDepth
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

  // Phase 8b: Relational traversal — pass-through (D4)

  async getSiblings(
    nodeId: NodeId,
    query: ISiblingsQuery,
    userId?: string
  ): Promise<ISiblingsResult> {
    const userKey = userId ?? 'ckg';
    const cacheKey = `siblings:${userKey}:${nodeId}:${query.edgeType}:${query.direction}:${String(query.includeParentDetails)}:${String(query.maxSiblingsPerGroup)}`;

    return this.cache.getOrLoad(cacheKey, this.queryTtl, () =>
      this.inner.getSiblings(nodeId, query, userId)
    );
  }

  async getCoParents(
    nodeId: NodeId,
    query: ICoParentsQuery,
    userId?: string
  ): Promise<ICoParentsResult> {
    const userKey = userId ?? 'ckg';
    const cacheKey = `co-parents:${userKey}:${nodeId}:${query.edgeType}:${query.direction}:${String(query.includeChildDetails)}:${String(query.maxCoParentsPerGroup)}`;

    return this.cache.getOrLoad(cacheKey, this.queryTtl, () =>
      this.inner.getCoParents(nodeId, query, userId)
    );
  }

  async getNeighborhood(
    nodeId: NodeId,
    query: INeighborhoodQuery,
    userId?: string
  ): Promise<INeighborhoodResult> {
    const etKey =
      query.edgeTypes !== undefined && query.edgeTypes.length > 0
        ? [...query.edgeTypes].sort().join(',')
        : 'all';
    const ntKey =
      query.nodeTypes !== undefined && query.nodeTypes.length > 0
        ? [...query.nodeTypes].sort().join(',')
        : 'all';
    const userKey = userId ?? 'ckg';
    const cacheKey = `neighborhood:${userKey}:${nodeId}:${String(query.hops)}:${etKey}:${ntKey}:${query.filterMode}:${query.direction}`;

    return this.cache.getOrLoad(cacheKey, this.queryTtl, () =>
      this.inner.getNeighborhood(nodeId, query, userId)
    );
  }

  // Phase 8c: Structural analysis — cached

  async getDomainSubgraph(
    domain: string,
    edgeTypes?: readonly GraphEdgeType[],
    studyMode?: StudyMode,
    userId?: string
  ): Promise<ISubgraph> {
    const etKey =
      edgeTypes !== undefined && edgeTypes.length > 0 ? [...edgeTypes].sort().join(',') : 'all';
    const userKey = userId ?? 'ckg';
    const modeKey = studyMode ?? 'all';
    const cacheKey = `domain-subgraph:${userKey}:${domain}:${etKey}:${modeKey}`;

    return this.cache.getOrLoad(cacheKey, this.queryTtl, () =>
      this.inner.getDomainSubgraph(domain, edgeTypes, studyMode, userId)
    );
  }

  async findArticulationPointsNative(
    domain: string,
    edgeTypes?: readonly GraphEdgeType[],
    studyMode?: StudyMode,
    userId?: string
  ): Promise<NodeId[] | null> {
    // GDS detection is already cached inside the Neo4j repo; pass through.
    return this.inner.findArticulationPointsNative(domain, edgeTypes, studyMode, userId);
  }

  async getKnowledgeFrontier(
    query: IFrontierQuery,
    userId: string
  ): Promise<IKnowledgeFrontierResult> {
    const cacheKey = `frontier:${userId}:${query.domain}:${String(query.masteryThreshold)}:${String(query.maxResults)}:${query.sortBy}`;

    return this.cache.getOrLoad(cacheKey, this.shortTtl, () =>
      this.inner.getKnowledgeFrontier(query, userId)
    );
  }

  async getCommonAncestors(
    nodeIdA: NodeId,
    nodeIdB: NodeId,
    query: ICommonAncestorsQuery,
    userId?: string
  ): Promise<ICommonAncestorsResult> {
    const etKey = [...query.edgeTypes].sort().join(',');
    const userKey = userId ?? 'ckg';
    // Sort node IDs for cache key consistency (A,B = B,A)
    const [sortedA, sortedB] = [nodeIdA, nodeIdB].sort();
    const cacheKey = `common-ancestors:${userKey}:${String(sortedA ?? '')}:${String(sortedB ?? '')}:${etKey}:${String(query.maxDepth)}`;

    return this.cache.getOrLoad(cacheKey, this.queryTtl, () =>
      this.inner.getCommonAncestors(nodeIdA, nodeIdB, query, userId)
    );
  }

  // Phase 8d: Ordering & ranking — cached

  async getDegreeCentrality(query: ICentralityQuery, userId?: string): Promise<ICentralityEntry[]> {
    const etKey =
      query.edgeTypes !== undefined && query.edgeTypes.length > 0
        ? [...query.edgeTypes].sort().join(',')
        : 'all';
    const userKey = userId ?? 'ckg';
    const cacheKey = `centrality-degree:${userKey}:${query.domain}:${etKey}:${String(query.topK)}:${String(query.normalise)}`;

    return this.cache.getOrLoad(cacheKey, this.queryTtl, () =>
      this.inner.getDegreeCentrality(query, userId)
    );
  }

  // Phase 8e: Ontological conflict check — pass-through (D4)
  async findConflictingEdges(
    sourceNodeId: NodeId,
    targetNodeId: NodeId,
    edgeTypes: GraphEdgeType[]
  ): Promise<IGraphEdge[]> {
    return this.inner.findConflictingEdges(sourceNodeId, targetNodeId, edgeTypes);
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
    // Pre-populate cache for each new node (scoped by userId)
    for (const node of nodes) {
      await this.cache.set(this.scopedNodeKey(node.nodeId, userId), node, this.entityTtl);
    }
    return nodes;
  }

  async createEdges(
    graphType: string,
    inputs: readonly ICreateEdgeInput[],
    userId?: string
  ): Promise<IGraphEdge[]> {
    const edges = await this.inner.createEdges(graphType, inputs, userId);
    // Invalidate edge caches for all affected nodes (scoped by userId)
    const nodeIds = new Set<NodeId>();
    for (const input of inputs) {
      nodeIds.add(input.sourceNodeId);
      nodeIds.add(input.targetNodeId);
    }
    for (const nodeId of nodeIds) {
      await this.cache.delPattern(this.scopedEdgesForNodePattern(nodeId, userId));
    }
    return edges;
  }

  async getNodesByIds(nodeIds: readonly NodeId[], userId?: string): Promise<IGraphNode[]> {
    return this.cache.getOrLoad(this.scopedNodesByIdsKey(nodeIds, userId), this.queryTtl, () =>
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
