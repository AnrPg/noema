// =============================================================================
// IN-MEMORY GRAPH STORE - Test Implementation
// =============================================================================
// A pure in-memory implementation of GraphStore for unit testing.
// Does not persist data - all data is lost when the instance is destroyed.
// =============================================================================

import type {
  NodeId,
  EdgeId,
  RevisionNumber,
} from "../../types/lkgc/foundation";
import type { NodeType, LKGCNode } from "../../types/lkgc/nodes";
import type { EdgeType, LKGCEdge } from "../../types/lkgc/edges";
import { generateNodeId, generateEdgeId, revision, now } from "../id-generator";
import type {
  GraphStore,
  GraphStoreOptions,
  CreateNodeInput,
  UpdateNodeInput,
  DeleteNodeInput,
  CreateEdgeInput,
  UpdateEdgeInput,
  DeleteEdgeInput,
  NodeOperationResult,
  EdgeOperationResult,
  NodeRevision,
  EdgeRevision,
  NodeQueryOptions,
  EdgeQueryOptions,
  PaginationOptions,
  TraversalOptions,
  GraphStats,
  EdgeTypeRule,
} from "../graph-store";
import { DEFAULT_EDGE_TYPE_RULES } from "../graph-store";

// =============================================================================
// IN-MEMORY GRAPH STORE IMPLEMENTATION
// =============================================================================

/**
 * In-memory implementation of GraphStore for testing
 */
export class InMemoryGraphStore implements GraphStore {
  private nodes: Map<string, LKGCNode> = new Map();
  private edges: Map<string, LKGCEdge> = new Map();
  private nodeRevisions: Map<string, NodeRevision[]> = new Map();
  private edgeRevisions: Map<string, EdgeRevision[]> = new Map();
  private edgeTypeRules: readonly EdgeTypeRule[];
  private strictEdgeValidation: boolean;

  constructor(options?: GraphStoreOptions) {
    this.edgeTypeRules = options?.edgeTypeRules ?? DEFAULT_EDGE_TYPE_RULES;
    this.strictEdgeValidation = options?.strictEdgeValidation ?? false;

    // Initialize with provided data
    if (options?.initialNodes) {
      for (const node of options.initialNodes) {
        this.nodes.set(node.id, node);
      }
    }
    if (options?.initialEdges) {
      for (const edge of options.initialEdges) {
        this.edges.set(edge.id, edge);
      }
    }
  }

  // ===========================================================================
  // NODE OPERATIONS
  // ===========================================================================

  async createNode<T extends LKGCNode>(
    input: CreateNodeInput<T>,
  ): Promise<NodeOperationResult> {
    const nodeId = input.node.id ?? generateNodeId();
    const timestamp = now();

    // Check if node already exists
    if (this.nodes.has(nodeId)) {
      return {
        success: false,
        error: `Node with ID ${nodeId} already exists`,
      };
    }

    // Create the node with sync state
    const rev = revision(1);
    const node: LKGCNode = {
      ...input.node,
      id: nodeId,
      sync: {
        rev,
        mergeStrategy: "lww",
        pendingSync: true,
      },
      provenance: {
        ...input.node.provenance,
        createdAt: input.node.provenance.createdAt ?? timestamp,
        updatedAt: timestamp,
      },
    } as unknown as LKGCNode;

    // Store the node
    this.nodes.set(nodeId, node);

    // Create initial revision
    const nodeRevision: NodeRevision = {
      node,
      rev,
      createdAt: timestamp,
      mutation: input.mutation,
      previousRev: null,
    };
    this.nodeRevisions.set(nodeId, [nodeRevision]);

    return {
      success: true,
      node,
      rev,
    };
  }

  async updateNode<T extends LKGCNode>(
    input: UpdateNodeInput<T>,
  ): Promise<NodeOperationResult> {
    const existing = this.nodes.get(input.id);

    if (!existing) {
      return {
        success: false,
        error: `Node with ID ${input.id} does not exist`,
      };
    }

    if (existing.deletedAt) {
      return {
        success: false,
        error: `Node with ID ${input.id} has been deleted`,
      };
    }

    // Check expected revision
    if (
      input.expectedRev !== undefined &&
      existing.sync.rev !== input.expectedRev
    ) {
      return {
        success: false,
        error: `Revision mismatch: expected ${input.expectedRev}, got ${existing.sync.rev}`,
      };
    }

    const timestamp = now();
    const previousRev = existing.sync.rev;
    const newRev = revision((previousRev as unknown as number) + 1);

    // Merge updates
    const updated: LKGCNode = {
      ...existing,
      ...input.updates,
      id: existing.id,
      nodeType: existing.nodeType,
      sync: {
        ...existing.sync,
        rev: newRev,
        pendingSync: true,
      },
      provenance: {
        ...existing.provenance,
        updatedAt: timestamp,
      },
    } as LKGCNode;

    // Store updated node
    this.nodes.set(input.id, updated);

    // Create nodeRevision
    const nodeRevision: NodeRevision = {
      node: updated,
      rev: newRev,
      createdAt: timestamp,
      mutation: input.mutation,
      previousRev,
    };
    const revisions = this.nodeRevisions.get(input.id) ?? [];
    revisions.push(nodeRevision);
    this.nodeRevisions.set(input.id, revisions);

    return {
      success: true,
      node: updated,
      rev: newRev,
    };
  }

  async deleteNode(input: DeleteNodeInput): Promise<NodeOperationResult> {
    const existing = this.nodes.get(input.id);

    if (!existing) {
      return {
        success: false,
        error: `Node with ID ${input.id} does not exist`,
      };
    }

    if (existing.deletedAt) {
      return {
        success: false,
        error: `Node with ID ${input.id} has already been deleted`,
      };
    }

    // Check expected revision
    if (
      input.expectedRev !== undefined &&
      existing.sync.rev !== input.expectedRev
    ) {
      return {
        success: false,
        error: `Revision mismatch: expected ${input.expectedRev}, got ${existing.sync.rev}`,
      };
    }

    const timestamp = now();
    const previousRev = existing.sync.rev;
    const newRev = revision((previousRev as unknown as number) + 1);

    // Soft delete the node
    const deleted: LKGCNode = {
      ...existing,
      deletedAt: timestamp,
      sync: {
        ...existing.sync,
        rev: newRev,
        pendingSync: true,
      },
    } as LKGCNode;

    this.nodes.set(input.id, deleted);

    // Soft delete all connected edges
    for (const [edgeId, edge] of this.edges) {
      if (
        (edge.sourceId === input.id || edge.targetId === input.id) &&
        !edge.deletedAt
      ) {
        const deletedEdge: LKGCEdge = {
          ...edge,
          deletedAt: timestamp,
        } as LKGCEdge;
        this.edges.set(edgeId, deletedEdge);
      }
    }

    // Create nodeRevision
    const nodeRevision: NodeRevision = {
      node: deleted,
      rev: newRev,
      createdAt: timestamp,
      mutation: input.mutation,
      previousRev,
    };
    const revisions = this.nodeRevisions.get(input.id) ?? [];
    revisions.push(nodeRevision);
    this.nodeRevisions.set(input.id, revisions);

    return {
      success: true,
      rev: newRev,
    };
  }

  async getNode(
    id: NodeId,
    includeDeleted = false,
  ): Promise<LKGCNode | undefined> {
    const node = this.nodes.get(id);
    if (!node) return undefined;
    if (!includeDeleted && node.deletedAt) return undefined;
    return node;
  }

  async getNodes(
    ids: readonly NodeId[],
    includeDeleted = false,
  ): Promise<readonly LKGCNode[]> {
    const results: LKGCNode[] = [];
    for (const id of ids) {
      const node = await this.getNode(id, includeDeleted);
      if (node) results.push(node);
    }
    return results;
  }

  async queryNodes(options?: NodeQueryOptions): Promise<readonly LKGCNode[]> {
    let results = Array.from(this.nodes.values());

    // Filter deleted
    if (!options?.includeDeleted) {
      results = results.filter((n) => !n.deletedAt);
    }

    // Filter by node types
    if (options?.nodeTypes && options.nodeTypes.length > 0) {
      const types = new Set(options.nodeTypes);
      results = results.filter((n) => types.has(n.nodeType));
    }

    // Filter by tags
    if (options?.tags && options.tags.length > 0) {
      const tags = new Set(options.tags);
      results = results.filter(
        (n) => n.tags && n.tags.some((t: string) => tags.has(t)),
      );
    }

    // Filter by confidence
    if (options?.minConfidence !== undefined) {
      results = results.filter(
        (n) =>
          (n.provenance.confidence as unknown as number) >=
          (options.minConfidence as unknown as number),
      );
    }

    // Sort
    if (options?.sort) {
      const { field, direction } = options.sort;
      results.sort((a, b) => {
        const aRec = a as unknown as Record<string, unknown>;
        const bRec = b as unknown as Record<string, unknown>;
        const aVal = aRec[field];
        const bVal = bRec[field];
        if (aVal === bVal) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        const cmp = String(aVal) < String(bVal) ? -1 : 1;
        return direction === "asc" ? cmp : -cmp;
      });
    }

    // Pagination
    if (options?.offset) {
      results = results.slice(options.offset);
    }
    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  async getNodesByType<T extends NodeType>(
    nodeType: T,
    options?: NodeQueryOptions,
  ): Promise<readonly Extract<LKGCNode, { nodeType: T }>[]> {
    const results = await this.queryNodes({
      ...options,
      nodeTypes: [nodeType],
    });
    return results as readonly Extract<LKGCNode, { nodeType: T }>[];
  }

  async getNodeRevisions(
    id: NodeId,
    options?: PaginationOptions,
  ): Promise<readonly NodeRevision[]> {
    let revisions = this.nodeRevisions.get(id) ?? [];

    // Sort by rev descending (newest first)
    revisions = [...revisions].sort(
      (a, b) => (b.rev as unknown as number) - (a.rev as unknown as number),
    );

    // Pagination
    if (options?.offset) {
      revisions = revisions.slice(options.offset);
    }
    if (options?.limit) {
      revisions = revisions.slice(0, options.limit);
    }

    return revisions;
  }

  async getNodeAtRevision(
    id: NodeId,
    rev: RevisionNumber,
  ): Promise<LKGCNode | undefined> {
    const revisions = this.nodeRevisions.get(id);
    if (!revisions) return undefined;

    const revision = revisions.find((r) => r.rev === rev);
    return revision?.node;
  }

  // ===========================================================================
  // EDGE OPERATIONS
  // ===========================================================================

  async createEdge<T extends LKGCEdge>(
    input: CreateEdgeInput<T>,
  ): Promise<EdgeOperationResult> {
    const edgeId = input.edge.id ?? generateEdgeId();
    const timestamp = now();

    // Check if edge already exists
    if (this.edges.has(edgeId)) {
      return {
        success: false,
        error: `Edge with ID ${edgeId} already exists`,
      };
    }

    // Check source node exists
    const sourceNode = this.nodes.get(input.edge.sourceId);
    if (!sourceNode || sourceNode.deletedAt) {
      return {
        success: false,
        error: `Source node ${input.edge.sourceId} does not exist`,
      };
    }

    // Check target node exists
    const targetNode = this.nodes.get(input.edge.targetId);
    if (!targetNode || targetNode.deletedAt) {
      return {
        success: false,
        error: `Target node ${input.edge.targetId} does not exist`,
      };
    }

    // Validate edge type for node types
    if (this.strictEdgeValidation) {
      if (
        !this.isValidEdgeForNodes(
          input.edge.edgeType,
          sourceNode.nodeType,
          targetNode.nodeType,
        )
      ) {
        return {
          success: false,
          error: `Edge type ${input.edge.edgeType} is not valid for nodes of type ${sourceNode.nodeType} -> ${targetNode.nodeType}`,
        };
      }
    }

    // Validate inferred edges have confidence < 1
    // DataSource values: "user_action" | "import_parser" | "ai_inference" | "plugin" | "sync_merge" | "system"
    const provenanceSource = input.edge.provenance.source;
    if (provenanceSource === "ai_inference") {
      const conf = input.edge.provenance.confidence as unknown as number;
      if (conf >= 1) {
        return {
          success: false,
          error: `Inferred edges must have confidence < 1, got ${conf}`,
        };
      }
    }

    // Create the edge with sync state
    const rev = revision(1);
    const edge: LKGCEdge = {
      ...input.edge,
      id: edgeId,
      sync: {
        rev,
        mergeStrategy: "lww",
        pendingSync: true,
      },
      provenance: {
        ...input.edge.provenance,
        createdAt: input.edge.provenance.createdAt ?? timestamp,
        updatedAt: timestamp,
      },
    } as unknown as LKGCEdge;

    // Store the edge
    this.edges.set(edgeId, edge);

    // Create initial edgeRevision
    const edgeRevision: EdgeRevision = {
      edge,
      rev,
      createdAt: timestamp,
      mutation: input.mutation,
      previousRev: null,
    };
    this.edgeRevisions.set(edgeId, [edgeRevision]);

    return {
      success: true,
      edge,
      rev,
    };
  }

  async updateEdge<T extends LKGCEdge>(
    input: UpdateEdgeInput<T>,
  ): Promise<EdgeOperationResult> {
    const existing = this.edges.get(input.id);

    if (!existing) {
      return {
        success: false,
        error: `Edge with ID ${input.id} does not exist`,
      };
    }

    if (existing.deletedAt) {
      return {
        success: false,
        error: `Edge with ID ${input.id} has been deleted`,
      };
    }

    // Check expected revision
    if (
      input.expectedRev !== undefined &&
      existing.sync.rev !== input.expectedRev
    ) {
      return {
        success: false,
        error: `Revision mismatch: expected ${input.expectedRev}, got ${existing.sync.rev}`,
      };
    }

    const timestamp = now();
    const previousRev = existing.sync.rev;
    const newRev = revision((previousRev as unknown as number) + 1);

    // Merge updates
    const updated: LKGCEdge = {
      ...existing,
      ...input.updates,
      id: existing.id,
      edgeType: existing.edgeType,
      sourceId: existing.sourceId,
      targetId: existing.targetId,
      sync: {
        ...existing.sync,
        rev: newRev,
        pendingSync: true,
      },
      provenance: {
        ...existing.provenance,
        updatedAt: timestamp,
      },
    } as LKGCEdge;

    // Store updated edge
    this.edges.set(input.id, updated);

    // Create edgeRevision
    const edgeRevision: EdgeRevision = {
      edge: updated,
      rev: newRev,
      createdAt: timestamp,
      mutation: input.mutation,
      previousRev,
    };
    const revisions = this.edgeRevisions.get(input.id) ?? [];
    revisions.push(edgeRevision);
    this.edgeRevisions.set(input.id, revisions);

    return {
      success: true,
      edge: updated,
      rev: newRev,
    };
  }

  async deleteEdge(input: DeleteEdgeInput): Promise<EdgeOperationResult> {
    const existing = this.edges.get(input.id);

    if (!existing) {
      return {
        success: false,
        error: `Edge with ID ${input.id} does not exist`,
      };
    }

    if (existing.deletedAt) {
      return {
        success: false,
        error: `Edge with ID ${input.id} has already been deleted`,
      };
    }

    // Check expected revision
    if (
      input.expectedRev !== undefined &&
      existing.sync.rev !== input.expectedRev
    ) {
      return {
        success: false,
        error: `Revision mismatch: expected ${input.expectedRev}, got ${existing.sync.rev}`,
      };
    }

    const timestamp = now();
    const previousRev = existing.sync.rev;
    const newRev = revision((previousRev as unknown as number) + 1);

    // Soft delete the edge
    const deleted: LKGCEdge = {
      ...existing,
      deletedAt: timestamp,
      sync: {
        ...existing.sync,
        rev: newRev,
        pendingSync: true,
      },
    } as LKGCEdge;

    this.edges.set(input.id, deleted);

    // Create edgeRevision
    const edgeRevision: EdgeRevision = {
      edge: deleted,
      rev: newRev,
      createdAt: timestamp,
      mutation: input.mutation,
      previousRev,
    };
    const revisions = this.edgeRevisions.get(input.id) ?? [];
    revisions.push(edgeRevision);
    this.edgeRevisions.set(input.id, revisions);

    return {
      success: true,
      rev: newRev,
    };
  }

  async getEdge(
    id: EdgeId,
    includeDeleted = false,
  ): Promise<LKGCEdge | undefined> {
    const edge = this.edges.get(id);
    if (!edge) return undefined;
    if (!includeDeleted && edge.deletedAt) return undefined;
    return edge;
  }

  async getEdges(
    ids: readonly EdgeId[],
    includeDeleted = false,
  ): Promise<readonly LKGCEdge[]> {
    const results: LKGCEdge[] = [];
    for (const id of ids) {
      const edge = await this.getEdge(id, includeDeleted);
      if (edge) results.push(edge);
    }
    return results;
  }

  async queryEdges(options?: EdgeQueryOptions): Promise<readonly LKGCEdge[]> {
    let results = Array.from(this.edges.values());

    // Filter deleted
    if (!options?.includeDeleted) {
      results = results.filter((e) => !e.deletedAt);
    }

    // Filter by edge types
    if (options?.edgeTypes && options.edgeTypes.length > 0) {
      const types = new Set(options.edgeTypes);
      results = results.filter((e) => types.has(e.edgeType));
    }

    // Filter by weight
    if (options?.minWeight !== undefined) {
      results = results.filter(
        (e) =>
          (e.weight as unknown as number) >=
          (options.minWeight as unknown as number),
      );
    }

    // Filter by confidence
    if (options?.minConfidence !== undefined) {
      results = results.filter(
        (e) =>
          (e.provenance.confidence as unknown as number) >=
          (options.minConfidence as unknown as number),
      );
    }

    // Sort
    if (options?.sort) {
      const { field, direction } = options.sort;
      results.sort((a, b) => {
        const aVal = (a as unknown as Record<string, unknown>)[field];
        const bVal = (b as unknown as Record<string, unknown>)[field];
        if (aVal === bVal) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        const cmp = String(aVal) < String(bVal) ? -1 : 1;
        return direction === "asc" ? cmp : -cmp;
      });
    }

    // Pagination
    if (options?.offset) {
      results = results.slice(options.offset);
    }
    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  async getEdgesByType<T extends EdgeType>(
    edgeType: T,
    options?: EdgeQueryOptions,
  ): Promise<readonly Extract<LKGCEdge, { edgeType: T }>[]> {
    const results = await this.queryEdges({
      ...options,
      edgeTypes: [edgeType],
    });
    return results as readonly Extract<LKGCEdge, { edgeType: T }>[];
  }

  async getOutgoingEdges(
    nodeId: NodeId,
    options?: EdgeQueryOptions,
  ): Promise<readonly LKGCEdge[]> {
    let results = Array.from(this.edges.values()).filter(
      (e) => e.sourceId === nodeId,
    );

    if (!options?.includeDeleted) {
      results = results.filter((e) => !e.deletedAt);
    }

    if (options?.edgeTypes && options.edgeTypes.length > 0) {
      const types = new Set(options.edgeTypes);
      results = results.filter((e) => types.has(e.edgeType));
    }

    return results;
  }

  async getIncomingEdges(
    nodeId: NodeId,
    options?: EdgeQueryOptions,
  ): Promise<readonly LKGCEdge[]> {
    let results = Array.from(this.edges.values()).filter(
      (e) => e.targetId === nodeId,
    );

    if (!options?.includeDeleted) {
      results = results.filter((e) => !e.deletedAt);
    }

    if (options?.edgeTypes && options.edgeTypes.length > 0) {
      const types = new Set(options.edgeTypes);
      results = results.filter((e) => types.has(e.edgeType));
    }

    return results;
  }

  async getConnectedEdges(
    nodeId: NodeId,
    options?: EdgeQueryOptions,
  ): Promise<readonly LKGCEdge[]> {
    let results = Array.from(this.edges.values()).filter(
      (e) => e.sourceId === nodeId || e.targetId === nodeId,
    );

    if (!options?.includeDeleted) {
      results = results.filter((e) => !e.deletedAt);
    }

    if (options?.edgeTypes && options.edgeTypes.length > 0) {
      const types = new Set(options.edgeTypes);
      results = results.filter((e) => types.has(e.edgeType));
    }

    return results;
  }

  async getEdgeRevisions(
    id: EdgeId,
    options?: PaginationOptions,
  ): Promise<readonly EdgeRevision[]> {
    let revisions = this.edgeRevisions.get(id) ?? [];

    // Sort by rev descending
    revisions = [...revisions].sort(
      (a, b) => (b.rev as unknown as number) - (a.rev as unknown as number),
    );

    // Pagination
    if (options?.offset) {
      revisions = revisions.slice(options.offset);
    }
    if (options?.limit) {
      revisions = revisions.slice(0, options.limit);
    }

    return revisions;
  }

  async getEdgeAtRevision(
    id: EdgeId,
    rev: RevisionNumber,
  ): Promise<LKGCEdge | undefined> {
    const revisions = this.edgeRevisions.get(id);
    if (!revisions) return undefined;

    const revision = revisions.find((r) => r.rev === rev);
    return revision?.edge;
  }

  // ===========================================================================
  // TRAVERSAL HELPERS
  // ===========================================================================

  async getPrerequisites(
    nodeId: NodeId,
    options?: TraversalOptions,
  ): Promise<readonly LKGCNode[]> {
    // Prerequisites are nodes that THIS node requires
    // Following prerequisite_of edges IN REVERSE (incoming edges to this node)
    const edges = await this.getIncomingEdges(nodeId, {
      edgeTypes: ["prerequisite_of"],
      includeDeleted: options?.includeDeleted,
    });

    const prereqIds = edges.map((e) => e.sourceId);
    return this.getNodes(prereqIds, options?.includeDeleted);
  }

  async getDependents(
    nodeId: NodeId,
    options?: TraversalOptions,
  ): Promise<readonly LKGCNode[]> {
    // Dependents are nodes that REQUIRE this node
    // Following prerequisite_of edges FORWARD (outgoing edges from this node)
    const edges = await this.getOutgoingEdges(nodeId, {
      edgeTypes: ["prerequisite_of"],
      includeDeleted: options?.includeDeleted,
    });

    const dependentIds = edges.map((e) => e.targetId);
    return this.getNodes(dependentIds, options?.includeDeleted);
  }

  async getConfusions(
    nodeId: NodeId,
    options?: TraversalOptions,
  ): Promise<readonly LKGCNode[]> {
    // Get nodes frequently confused with this one (bidirectional)
    const outgoing = await this.getOutgoingEdges(nodeId, {
      edgeTypes: ["frequently_confused_with"],
      includeDeleted: options?.includeDeleted,
    });
    const incoming = await this.getIncomingEdges(nodeId, {
      edgeTypes: ["frequently_confused_with"],
      includeDeleted: options?.includeDeleted,
    });

    const confusedIds = new Set([
      ...outgoing.map((e) => e.targetId),
      ...incoming.map((e) => e.sourceId),
    ]);

    return this.getNodes(Array.from(confusedIds), options?.includeDeleted);
  }

  async getStrategiesForNode(
    nodeId: NodeId,
    options?: TraversalOptions,
  ): Promise<readonly LKGCNode[]> {
    // Get learning strategies effective for this node
    const edges = await this.getOutgoingEdges(nodeId, {
      edgeTypes: ["best_learned_with_strategy"],
      includeDeleted: options?.includeDeleted,
    });

    const strategyIds = edges.map((e) => e.targetId);
    return this.getNodes(strategyIds, options?.includeDeleted);
  }

  async getBacklinks(
    nodeId: NodeId,
    options?: TraversalOptions,
  ): Promise<readonly LKGCNode[]> {
    // Get nodes that link TO this node (via backlink edges)
    const edges = await this.getIncomingEdges(nodeId, {
      edgeTypes: ["backlink", "mentions"],
      includeDeleted: options?.includeDeleted,
    });

    const linkingIds = edges.map((e) => e.sourceId);
    return this.getNodes(linkingIds, options?.includeDeleted);
  }

  async getNeighbors(
    nodeId: NodeId,
    options?: TraversalOptions,
  ): Promise<readonly { node: LKGCNode; edge: LKGCEdge; depth: number }[]> {
    const maxDepth = options?.maxDepth ?? 1;
    const visited = new Set<string>([nodeId]);
    const results: { node: LKGCNode; edge: LKGCEdge; depth: number }[] = [];
    const queue: { nodeId: NodeId; depth: number }[] = [{ nodeId, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) continue;

      // Get edges based on direction
      const edges: LKGCEdge[] = [];
      if (
        options?.direction === "outgoing" ||
        options?.direction === "both" ||
        !options?.direction
      ) {
        const outgoing = await this.getOutgoingEdges(current.nodeId, {
          edgeTypes: options?.edgeTypes,
          includeDeleted: options?.includeDeleted,
        });
        edges.push(...outgoing);
      }
      if (options?.direction === "incoming" || options?.direction === "both") {
        const incoming = await this.getIncomingEdges(current.nodeId, {
          edgeTypes: options?.edgeTypes,
          includeDeleted: options?.includeDeleted,
        });
        edges.push(...incoming);
      }

      for (const edge of edges) {
        const neighborId =
          edge.sourceId === current.nodeId ? edge.targetId : edge.sourceId;

        if (visited.has(neighborId)) continue;
        visited.add(neighborId);

        const neighbor = await this.getNode(
          neighborId,
          options?.includeDeleted,
        );
        if (neighbor) {
          results.push({
            node: neighbor,
            edge,
            depth: current.depth + 1,
          });

          if (current.depth + 1 < maxDepth) {
            queue.push({ nodeId: neighborId, depth: current.depth + 1 });
          }
        }

        // Check limit
        if (options?.limit && results.length >= options.limit) {
          return results;
        }
      }
    }

    return results;
  }

  // ===========================================================================
  // VALIDATION HELPERS
  // ===========================================================================

  async nodeExists(id: NodeId): Promise<boolean> {
    const node = this.nodes.get(id);
    return node !== undefined && !node.deletedAt;
  }

  async edgeExists(id: EdgeId): Promise<boolean> {
    const edge = this.edges.get(id);
    return edge !== undefined && !edge.deletedAt;
  }

  isValidEdgeForNodes(
    edgeType: EdgeType,
    sourceNodeType: NodeType,
    targetNodeType: NodeType,
  ): boolean {
    const rule = this.edgeTypeRules.find((r) => r.edgeType === edgeType);

    // If no rule, allow all by default (unless strict)
    if (!rule) {
      return !this.strictEdgeValidation;
    }

    // Check source type
    if (
      rule.allowedSourceTypes &&
      !rule.allowedSourceTypes.includes(sourceNodeType)
    ) {
      return false;
    }

    // Check target type
    if (
      rule.allowedTargetTypes &&
      !rule.allowedTargetTypes.includes(targetNodeType)
    ) {
      return false;
    }

    return true;
  }

  // ===========================================================================
  // STATISTICS & INTROSPECTION
  // ===========================================================================

  async countNodes(
    options?: Omit<NodeQueryOptions, "limit" | "offset" | "cursor">,
  ): Promise<number> {
    const results = await this.queryNodes(options);
    return results.length;
  }

  async countEdges(
    options?: Omit<EdgeQueryOptions, "limit" | "offset" | "cursor">,
  ): Promise<number> {
    const results = await this.queryEdges(options);
    return results.length;
  }

  async getStats(): Promise<GraphStats> {
    const timestamp = now();
    const activeNodes = Array.from(this.nodes.values()).filter(
      (n) => !n.deletedAt,
    );
    const activeEdges = Array.from(this.edges.values()).filter(
      (e) => !e.deletedAt,
    );

    // Count by type
    const nodeCountByType: Partial<Record<NodeType, number>> = {};
    for (const node of activeNodes) {
      nodeCountByType[node.nodeType] =
        (nodeCountByType[node.nodeType] ?? 0) + 1;
    }

    const edgeCountByType: Partial<Record<EdgeType, number>> = {};
    for (const edge of activeEdges) {
      edgeCountByType[edge.edgeType] =
        (edgeCountByType[edge.edgeType] ?? 0) + 1;
    }

    // Find max revision
    let maxRev = 0;
    for (const node of this.nodes.values()) {
      const rev = node.sync.rev as unknown as number;
      if (rev > maxRev) maxRev = rev;
    }
    for (const edge of this.edges.values()) {
      const rev = edge.sync.rev as unknown as number;
      if (rev > maxRev) maxRev = rev;
    }

    return {
      nodeCount: activeNodes.length,
      nodeCountByType,
      edgeCount: activeEdges.length,
      edgeCountByType,
      avgEdgesPerNode:
        activeNodes.length > 0 ? activeEdges.length / activeNodes.length : 0,
      maxRevision: revision(maxRev),
      computedAt: timestamp,
    };
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create an in-memory graph store for testing
 */
export async function createInMemoryGraphStore(
  options?: GraphStoreOptions,
): Promise<GraphStore> {
  return new InMemoryGraphStore(options);
}
