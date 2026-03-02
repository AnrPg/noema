/**
 * @noema/knowledge-graph-service — In-Memory Mock Graph Repository
 *
 * Faithful in-memory implementation of IGraphRepository for unit tests.
 * Stores nodes/edges in Maps and supports real BFS/DFS traversal, cycle
 * detection, and shortest-path queries.
 *
 * This mock is essential for testing edge-policy enforcement and graph
 * invariants without requiring a Neo4j instance. Graph operations mutate
 * the in-memory store so subsequent reads reflect changes.
 *
 * Created for Phase 10 (Testing & Integration).
 */

import type {
  EdgeId,
  EdgeWeight,
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
} from '../../src/domain/knowledge-graph-service/graph.repository.js';
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
} from '../../src/domain/knowledge-graph-service/value-objects/graph.value-objects.js';

// ============================================================================
// ID Generation
// ============================================================================

let mockIdCounter = 0;

function nextMockId(prefix: string): string {
  mockIdCounter += 1;
  return `${prefix}_mock_${String(mockIdCounter).padStart(6, '0')}`;
}

export function resetMockGraphIds(): void {
  mockIdCounter = 0;
}

// ============================================================================
// Adjacency Index
// ============================================================================

/**
 * Efficient adjacency index for traversal. Maintains both inbound
 * and outbound edge lists per node for bidirectional traversal.
 */
class AdjacencyIndex {
  /** nodeId → Set<edgeId> for outbound edges (source = nodeId) */
  private readonly outbound = new Map<NodeId, Set<EdgeId>>();
  /** nodeId → Set<edgeId> for inbound edges (target = nodeId) */
  private readonly inbound = new Map<NodeId, Set<EdgeId>>();

  addEdge(edge: IGraphEdge): void {
    if (!this.outbound.has(edge.sourceNodeId)) {
      this.outbound.set(edge.sourceNodeId, new Set());
    }
    this.outbound.get(edge.sourceNodeId)!.add(edge.edgeId);

    if (!this.inbound.has(edge.targetNodeId)) {
      this.inbound.set(edge.targetNodeId, new Set());
    }
    this.inbound.get(edge.targetNodeId)!.add(edge.edgeId);
  }

  removeEdge(edge: IGraphEdge): void {
    this.outbound.get(edge.sourceNodeId)?.delete(edge.edgeId);
    this.inbound.get(edge.targetNodeId)?.delete(edge.edgeId);
  }

  removeNode(nodeId: NodeId): void {
    this.outbound.delete(nodeId);
    this.inbound.delete(nodeId);
    // Also remove edges pointing to/from this node
    for (const edgeSet of this.inbound.values()) {
      // The caller must handle edge removal
    }
  }

  getOutbound(nodeId: NodeId): ReadonlySet<EdgeId> {
    return this.outbound.get(nodeId) ?? new Set();
  }

  getInbound(nodeId: NodeId): ReadonlySet<EdgeId> {
    return this.inbound.get(nodeId) ?? new Set();
  }

  getBoth(nodeId: NodeId): Set<EdgeId> {
    const result = new Set<EdgeId>();
    for (const id of this.getOutbound(nodeId)) result.add(id);
    for (const id of this.getInbound(nodeId)) result.add(id);
    return result;
  }

  clear(): void {
    this.outbound.clear();
    this.inbound.clear();
  }
}

// ============================================================================
// MockGraphRepository
// ============================================================================

/**
 * In-memory IGraphRepository with real traversal support.
 *
 * Usage:
 * ```ts
 * const repo = new MockGraphRepository();
 * // Seed with fixture data:
 * const topo = linearChainGraph();
 * repo.seed(topo.nodes, topo.edges);
 * // Now traversal methods work on the seeded graph.
 * ```
 */
export class MockGraphRepository implements IGraphRepository {
  private readonly nodes = new Map<NodeId, IGraphNode>();
  private readonly edges = new Map<EdgeId, IGraphEdge>();
  private readonly adjacency = new AdjacencyIndex();

  // ==========================================================================
  // Seeding (for test setup)
  // ==========================================================================

  /**
   * Seed the repository with initial data. Clears existing data first.
   */
  seed(nodes: readonly IGraphNode[], edges: readonly IGraphEdge[]): void {
    this.clear();
    for (const node of nodes) {
      this.nodes.set(node.nodeId, { ...node });
    }
    for (const edge of edges) {
      this.edges.set(edge.edgeId, { ...edge });
      this.adjacency.addEdge(edge);
    }
  }

  /**
   * Clear all data.
   */
  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.adjacency.clear();
    resetMockGraphIds();
  }

  /**
   * Get current counts for assertions.
   */
  get nodeCount(): number {
    return this.nodes.size;
  }

  get edgeCount(): number {
    return this.edges.size;
  }

  // ==========================================================================
  // INodeRepository
  // ==========================================================================

  async createNode(
    graphType: string,
    input: ICreateNodeInput,
    userId?: string
  ): Promise<IGraphNode> {
    const nodeId = nextMockId('node') as NodeId;
    const now = new Date().toISOString();
    const node: IGraphNode = {
      nodeId,
      graphType,
      nodeType: input.nodeType,
      label: input.label,
      domain: input.domain,
      ...(input.description !== undefined ? { description: input.description } : {}),
      properties: input.properties ?? {},
      ...(input.masteryLevel !== undefined ? { masteryLevel: input.masteryLevel } : {}),
      ...(userId !== undefined ? { userId } : {}),
      createdAt: now,
      updatedAt: now,
    } as IGraphNode;

    this.nodes.set(nodeId, node);
    return { ...node };
  }

  async getNode(nodeId: NodeId, _userId?: string): Promise<IGraphNode | null> {
    const node = this.nodes.get(nodeId);
    return node !== undefined ? { ...node } : null;
  }

  async updateNode(
    nodeId: NodeId,
    updates: IUpdateNodeInput,
    _userId?: string
  ): Promise<IGraphNode> {
    const existing = this.nodes.get(nodeId);
    if (existing === undefined) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    const updated: IGraphNode = {
      ...existing,
      ...(updates.label !== undefined ? { label: updates.label } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
      ...(updates.domain !== undefined ? { domain: updates.domain } : {}),
      ...(updates.properties !== undefined ? { properties: updates.properties } : {}),
      ...(updates.masteryLevel !== undefined ? { masteryLevel: updates.masteryLevel } : {}),
      updatedAt: new Date().toISOString(),
    } as IGraphNode;

    this.nodes.set(nodeId, updated);
    return { ...updated };
  }

  async deleteNode(nodeId: NodeId, _userId?: string): Promise<void> {
    // Remove the node
    this.nodes.delete(nodeId);

    // Remove all edges connected to this node
    const edgesToRemove: EdgeId[] = [];
    for (const [edgeId, edge] of this.edges) {
      if (edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId) {
        edgesToRemove.push(edgeId);
      }
    }
    for (const edgeId of edgesToRemove) {
      const edge = this.edges.get(edgeId);
      if (edge !== undefined) {
        this.adjacency.removeEdge(edge);
        this.edges.delete(edgeId);
      }
    }
  }

  async findNodes(filter: INodeFilter, limit: number, offset: number): Promise<IGraphNode[]> {
    let results = Array.from(this.nodes.values());

    const filterObj = filter as Record<string, unknown>;

    if (filterObj['graphType'] !== undefined) {
      results = results.filter((n) => n.graphType === filterObj['graphType']);
    }
    if (filterObj['nodeType'] !== undefined) {
      results = results.filter((n) => n.nodeType === filterObj['nodeType']);
    }
    if (filterObj['domain'] !== undefined) {
      results = results.filter((n) => n.domain === filterObj['domain']);
    }
    if (filterObj['userId'] !== undefined) {
      results = results.filter((n) => {
        const nObj = n as Record<string, unknown>;
        return nObj['userId'] === filterObj['userId'];
      });
    }

    return results.slice(offset, offset + limit).map((n) => ({ ...n }));
  }

  async countNodes(filter: INodeFilter): Promise<number> {
    const all = await this.findNodes(filter, Number.MAX_SAFE_INTEGER, 0);
    return all.length;
  }

  // ==========================================================================
  // IEdgeRepository
  // ==========================================================================

  async createEdge(
    graphType: string,
    input: ICreateEdgeInput,
    userId?: string
  ): Promise<IGraphEdge> {
    const edgeId = nextMockId('edge') as EdgeId;
    const now = new Date().toISOString();
    const edge: IGraphEdge = {
      edgeId,
      graphType,
      edgeType: input.edgeType,
      sourceNodeId: input.sourceNodeId,
      targetNodeId: input.targetNodeId,
      weight: (input.weight ?? 1.0) as EdgeWeight,
      ...(userId !== undefined ? { userId } : {}),
      properties: input.properties ?? {},
      createdAt: now,
    } as IGraphEdge;

    this.edges.set(edgeId, edge);
    this.adjacency.addEdge(edge);
    return { ...edge };
  }

  async getEdge(edgeId: EdgeId): Promise<IGraphEdge | null> {
    const edge = this.edges.get(edgeId);
    return edge !== undefined ? { ...edge } : null;
  }

  async updateEdge(edgeId: EdgeId, updates: IUpdateEdgeInput): Promise<IGraphEdge> {
    const existing = this.edges.get(edgeId);
    if (existing === undefined) {
      throw new Error(`Edge not found: ${edgeId}`);
    }

    const updated: IGraphEdge = {
      ...existing,
      ...(updates.weight !== undefined ? { weight: updates.weight } : {}),
      ...(updates.properties !== undefined ? { properties: updates.properties } : {}),
    } as IGraphEdge;

    this.edges.set(edgeId, updated);
    return { ...updated };
  }

  async removeEdge(edgeId: EdgeId): Promise<void> {
    const edge = this.edges.get(edgeId);
    if (edge !== undefined) {
      this.adjacency.removeEdge(edge);
      this.edges.delete(edgeId);
    }
  }

  async findEdges(filter: IEdgeFilter, limit?: number, offset?: number): Promise<IGraphEdge[]> {
    let results = Array.from(this.edges.values());

    if (filter.edgeType !== undefined) {
      results = results.filter((e) => e.edgeType === filter.edgeType);
    }
    if (filter.sourceNodeId !== undefined) {
      results = results.filter((e) => e.sourceNodeId === filter.sourceNodeId);
    }
    if (filter.targetNodeId !== undefined) {
      results = results.filter((e) => e.targetNodeId === filter.targetNodeId);
    }

    const start = offset ?? 0;
    const end = limit !== undefined ? start + limit : results.length;
    return results.slice(start, end).map((e) => ({ ...e }));
  }

  async getEdgesForNode(nodeId: NodeId, direction: EdgeDirection): Promise<IGraphEdge[]> {
    const results: IGraphEdge[] = [];

    if (direction === 'outbound' || direction === 'both') {
      for (const edgeId of this.adjacency.getOutbound(nodeId)) {
        const edge = this.edges.get(edgeId);
        if (edge !== undefined) results.push({ ...edge });
      }
    }
    if (direction === 'inbound' || direction === 'both') {
      for (const edgeId of this.adjacency.getInbound(nodeId)) {
        const edge = this.edges.get(edgeId);
        if (edge !== undefined) results.push({ ...edge });
      }
    }

    return results;
  }

  // ==========================================================================
  // ITraversalRepository — BFS/DFS implementations
  // ==========================================================================

  /**
   * BFS from a node following edges in the specified direction.
   * Used by getAncestors (inbound) and getDescendants (outbound).
   */
  private bfsTraverse(
    startId: NodeId,
    options: ITraversalOptions,
    direction: 'inbound' | 'outbound',
    userId?: string
  ): IGraphNode[] {
    const maxDepth = ((options as Record<string, unknown>)['maxDepth'] as number | undefined) ?? 3;
    const edgeTypes = (options as Record<string, unknown>)['edgeTypes'] as
      | readonly GraphEdgeType[]
      | undefined;

    const visited = new Set<NodeId>();
    const result: IGraphNode[] = [];
    const queue: { nodeId: NodeId; depth: number }[] = [{ nodeId: startId, depth: 0 }];
    visited.add(startId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) continue;

      const edgeIds =
        direction === 'outbound'
          ? this.adjacency.getOutbound(current.nodeId)
          : this.adjacency.getInbound(current.nodeId);

      for (const edgeId of edgeIds) {
        const edge = this.edges.get(edgeId);
        if (edge === undefined) continue;

        // Filter by edge type if specified
        if (edgeTypes !== undefined && edgeTypes.length > 0) {
          if (!edgeTypes.includes(edge.edgeType)) continue;
        }

        const neighborId = direction === 'outbound' ? edge.targetNodeId : edge.sourceNodeId;
        if (visited.has(neighborId)) continue;

        const neighbor = this.nodes.get(neighborId);
        if (neighbor === undefined) continue;

        visited.add(neighborId);
        result.push({ ...neighbor });
        queue.push({ nodeId: neighborId, depth: current.depth + 1 });
      }
    }

    return result;
  }

  async getAncestors(
    nodeId: NodeId,
    options: ITraversalOptions,
    userId?: string
  ): Promise<IGraphNode[]> {
    return this.bfsTraverse(nodeId, options, 'inbound', userId);
  }

  async getDescendants(
    nodeId: NodeId,
    options: ITraversalOptions,
    userId?: string
  ): Promise<IGraphNode[]> {
    return this.bfsTraverse(nodeId, options, 'outbound', userId);
  }

  async findShortestPath(
    fromNodeId: NodeId,
    toNodeId: NodeId,
    _userId?: string
  ): Promise<IGraphNode[]> {
    if (fromNodeId === toNodeId) {
      const node = this.nodes.get(fromNodeId);
      return node !== undefined ? [{ ...node }] : [];
    }

    // BFS for shortest path
    const visited = new Set<NodeId>();
    const parent = new Map<NodeId, NodeId>();
    const queue: NodeId[] = [fromNodeId];
    visited.add(fromNodeId);

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const edgeId of this.adjacency.getOutbound(current)) {
        const edge = this.edges.get(edgeId);
        if (edge === undefined) continue;

        const neighbor = edge.targetNodeId;
        if (visited.has(neighbor)) continue;

        visited.add(neighbor);
        parent.set(neighbor, current);

        if (neighbor === toNodeId) {
          // Reconstruct path
          const path: IGraphNode[] = [];
          let cur: NodeId | undefined = toNodeId;
          while (cur !== undefined) {
            const node = this.nodes.get(cur);
            if (node !== undefined) path.unshift({ ...node });
            cur = parent.get(cur);
          }
          return path;
        }

        queue.push(neighbor);
      }
    }

    return []; // No path found
  }

  async findFilteredShortestPath(
    fromNodeId: NodeId,
    toNodeId: NodeId,
    edgeTypeFilter?: readonly GraphEdgeType[],
    _nodeTypeFilter?: readonly string[],
    _userId?: string
  ): Promise<IGraphNode[]> {
    if (fromNodeId === toNodeId) {
      const node = this.nodes.get(fromNodeId);
      return node !== undefined ? [{ ...node }] : [];
    }

    const visited = new Set<NodeId>();
    const parent = new Map<NodeId, NodeId>();
    const queue: NodeId[] = [fromNodeId];
    visited.add(fromNodeId);

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const edgeId of this.adjacency.getOutbound(current)) {
        const edge = this.edges.get(edgeId);
        if (edge === undefined) continue;

        if (
          edgeTypeFilter !== undefined &&
          edgeTypeFilter.length > 0 &&
          !edgeTypeFilter.includes(edge.edgeType)
        ) {
          continue;
        }

        const neighbor = edge.targetNodeId;
        if (visited.has(neighbor)) continue;

        visited.add(neighbor);
        parent.set(neighbor, current);

        if (neighbor === toNodeId) {
          const path: IGraphNode[] = [];
          let cur: NodeId | undefined = toNodeId;
          while (cur !== undefined) {
            const node = this.nodes.get(cur);
            if (node !== undefined) path.unshift({ ...node });
            cur = parent.get(cur);
          }
          return path;
        }

        queue.push(neighbor);
      }
    }

    return [];
  }

  async getSubgraph(
    rootNodeId: NodeId,
    options: ITraversalOptions,
    _userId?: string
  ): Promise<ISubgraph> {
    const maxDepth = ((options as Record<string, unknown>)['maxDepth'] as number | undefined) ?? 3;
    const edgeTypes = (options as Record<string, unknown>)['edgeTypes'] as
      | readonly GraphEdgeType[]
      | undefined;

    const visitedNodes = new Set<NodeId>();
    const collectedEdges = new Set<EdgeId>();
    const queue: { nodeId: NodeId; depth: number }[] = [{ nodeId: rootNodeId, depth: 0 }];
    visitedNodes.add(rootNodeId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) continue;

      // Follow outbound edges
      for (const edgeId of this.adjacency.getOutbound(current.nodeId)) {
        const edge = this.edges.get(edgeId);
        if (edge === undefined) continue;

        if (edgeTypes !== undefined && edgeTypes.length > 0) {
          if (!edgeTypes.includes(edge.edgeType)) continue;
        }

        collectedEdges.add(edgeId);
        if (!visitedNodes.has(edge.targetNodeId)) {
          visitedNodes.add(edge.targetNodeId);
          queue.push({ nodeId: edge.targetNodeId, depth: current.depth + 1 });
        }
      }

      // Follow inbound edges
      for (const edgeId of this.adjacency.getInbound(current.nodeId)) {
        const edge = this.edges.get(edgeId);
        if (edge === undefined) continue;

        if (edgeTypes !== undefined && edgeTypes.length > 0) {
          if (!edgeTypes.includes(edge.edgeType)) continue;
        }

        collectedEdges.add(edgeId);
        if (!visitedNodes.has(edge.sourceNodeId)) {
          visitedNodes.add(edge.sourceNodeId);
          queue.push({ nodeId: edge.sourceNodeId, depth: current.depth + 1 });
        }
      }
    }

    const nodes: IGraphNode[] = [];
    for (const nId of visitedNodes) {
      const node = this.nodes.get(nId);
      if (node !== undefined) nodes.push({ ...node });
    }

    const edges: IGraphEdge[] = [];
    for (const eId of collectedEdges) {
      const edge = this.edges.get(eId);
      if (edge !== undefined) edges.push({ ...edge });
    }

    return { nodes, edges, rootNodeId };
  }

  async getSiblings(
    _nodeId: NodeId,
    _query: ISiblingsQuery,
    _userId?: string
  ): Promise<ISiblingsResult> {
    // Simplified: return empty result. Full implementation not needed for unit tests.
    return { groups: [], totalSiblingCount: 0 } as unknown as ISiblingsResult;
  }

  async getCoParents(
    _nodeId: NodeId,
    _query: ICoParentsQuery,
    _userId?: string
  ): Promise<ICoParentsResult> {
    return { groups: [], totalCoParentCount: 0 } as unknown as ICoParentsResult;
  }

  async getNeighborhood(
    _nodeId: NodeId,
    _query: INeighborhoodQuery,
    _userId?: string
  ): Promise<INeighborhoodResult> {
    return {
      groups: [],
      totalNeighborCount: 0,
      hops: 1,
    } as unknown as INeighborhoodResult;
  }

  /**
   * Detect cycles involving a node using DFS with a "gray/black" algorithm.
   * Returns the cycle path if found, empty array otherwise.
   */
  async detectCycles(
    nodeId: NodeId,
    edgeType?: GraphEdgeType,
    _userId?: string
  ): Promise<NodeId[]> {
    const WHITE = 0; // Not visited
    const GRAY = 1; // In current DFS path
    const BLACK = 2; // Fully processed

    const color = new Map<NodeId, number>();
    const parent = new Map<NodeId, NodeId>();

    // Initialize all nodes as WHITE
    for (const nId of this.nodes.keys()) {
      color.set(nId, WHITE);
    }

    const dfs = (current: NodeId): NodeId[] => {
      color.set(current, GRAY);

      for (const edgeId of this.adjacency.getOutbound(current)) {
        const edge = this.edges.get(edgeId);
        if (edge === undefined) continue;

        if (edgeType !== undefined && edge.edgeType !== edgeType) continue;

        const neighbor = edge.targetNodeId;
        const neighborColor = color.get(neighbor);

        if (neighborColor === GRAY) {
          // Found a cycle — reconstruct path
          const cycle: NodeId[] = [neighbor];
          let cur = current;
          while (cur !== neighbor) {
            cycle.unshift(cur);
            const p = parent.get(cur);
            if (p === undefined) break;
            cur = p;
          }
          cycle.unshift(neighbor);
          return cycle;
        }

        if (neighborColor === WHITE) {
          parent.set(neighbor, current);
          const result = dfs(neighbor);
          if (result.length > 0) return result;
        }
      }

      color.set(current, BLACK);
      return [];
    };

    return dfs(nodeId);
  }

  async getDomainSubgraph(
    domain: string,
    edgeTypes?: readonly GraphEdgeType[],
    _userId?: string
  ): Promise<ISubgraph> {
    const domainNodes = Array.from(this.nodes.values()).filter((n) => n.domain === domain);
    const domainNodeIds = new Set(domainNodes.map((n) => n.nodeId));

    const domainEdges = Array.from(this.edges.values()).filter((e) => {
      if (!domainNodeIds.has(e.sourceNodeId) || !domainNodeIds.has(e.targetNodeId)) return false;
      if (edgeTypes !== undefined && edgeTypes.length > 0) {
        return edgeTypes.includes(e.edgeType);
      }
      return true;
    });

    return {
      nodes: domainNodes.map((n) => ({ ...n })),
      edges: domainEdges.map((e) => ({ ...e })),
    };
  }

  async findArticulationPointsNative(
    _domain: string,
    _edgeTypes?: readonly GraphEdgeType[],
    _userId?: string
  ): Promise<NodeId[] | null> {
    // Return null — mock doesn't have GDS/APOC. Caller falls back to app-code Tarjan.
    return null;
  }

  async getKnowledgeFrontier(
    _query: IFrontierQuery,
    _userId: string
  ): Promise<IKnowledgeFrontierResult> {
    return { frontierNodes: [], totalCount: 0 } as unknown as IKnowledgeFrontierResult;
  }

  async getCommonAncestors(
    nodeIdA: NodeId,
    nodeIdB: NodeId,
    _query: ICommonAncestorsQuery,
    _userId?: string
  ): Promise<ICommonAncestorsResult> {
    // Simple implementation: BFS from both nodes, find intersection
    const ancestorsA = new Set<NodeId>();
    const ancestorsB = new Set<NodeId>();

    const collectAncestors = (startId: NodeId, ancestors: Set<NodeId>): void => {
      const queue: NodeId[] = [startId];
      ancestors.add(startId);
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const edgeId of this.adjacency.getInbound(current)) {
          const edge = this.edges.get(edgeId);
          if (edge === undefined) continue;
          if (!ancestors.has(edge.sourceNodeId)) {
            ancestors.add(edge.sourceNodeId);
            queue.push(edge.sourceNodeId);
          }
        }
      }
    };

    collectAncestors(nodeIdA, ancestorsA);
    collectAncestors(nodeIdB, ancestorsB);

    const common: NodeId[] = [];
    for (const a of ancestorsA) {
      if (ancestorsB.has(a) && a !== nodeIdA && a !== nodeIdB) {
        common.push(a);
      }
    }

    return {
      commonAncestors: common.map((id) => ({ ...this.nodes.get(id)! })),
      lowestCommonAncestors: common.length > 0 ? [{ ...this.nodes.get(common[0]!)! }] : [],
    } as unknown as ICommonAncestorsResult;
  }

  async getDegreeCentrality(
    _query: ICentralityQuery,
    _userId?: string
  ): Promise<ICentralityEntry[]> {
    return [];
  }

  async findConflictingEdges(
    sourceNodeId: NodeId,
    targetNodeId: NodeId,
    edgeTypes: readonly GraphEdgeType[]
  ): Promise<IGraphEdge[]> {
    const results: IGraphEdge[] = [];
    for (const edge of this.edges.values()) {
      if (!edgeTypes.includes(edge.edgeType)) continue;
      // Check both directions
      if (
        (edge.sourceNodeId === sourceNodeId && edge.targetNodeId === targetNodeId) ||
        (edge.sourceNodeId === targetNodeId && edge.targetNodeId === sourceNodeId)
      ) {
        results.push({ ...edge });
      }
    }
    return results;
  }

  // ==========================================================================
  // IBatchGraphRepository
  // ==========================================================================

  async createNodes(
    graphType: string,
    inputs: readonly ICreateNodeInput[],
    userId?: string
  ): Promise<IGraphNode[]> {
    const results: IGraphNode[] = [];
    for (const input of inputs) {
      results.push(await this.createNode(graphType, input, userId));
    }
    return results;
  }

  async createEdges(
    graphType: string,
    inputs: readonly ICreateEdgeInput[],
    userId?: string
  ): Promise<IGraphEdge[]> {
    const results: IGraphEdge[] = [];
    for (const input of inputs) {
      results.push(await this.createEdge(graphType, input, userId));
    }
    return results;
  }

  async getNodesByIds(nodeIds: readonly NodeId[], _userId?: string): Promise<IGraphNode[]> {
    const results: IGraphNode[] = [];
    for (const id of nodeIds) {
      const node = this.nodes.get(id);
      if (node !== undefined) results.push({ ...node });
    }
    return results;
  }

  // ==========================================================================
  // IGraphRepository — Transaction support
  // ==========================================================================

  async runInTransaction<T>(fn: (txRepo: IGraphRepository) => Promise<T>): Promise<T> {
    // Mock: just execute directly — no real transaction semantics needed
    return fn(this);
  }
}
