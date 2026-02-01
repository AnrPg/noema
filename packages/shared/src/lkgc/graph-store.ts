// =============================================================================
// GRAPH STORE - Canonical Graph Store Interface for LKGC
// =============================================================================
// The typed property graph of learning objects (nodes) and relations (edges).
// This is the persistent, queryable representation of the knowledge graph.
//
// Design principles:
// - Strong invariants (no dangling edges, valid edge types for node pairs)
// - Auditability (all mutations traceable to event IDs or proposal IDs)
// - Versioned updates (no silent overwrites, all updates increment rev)
// - Inferred edges carry confidence < 1
// =============================================================================

import type {
  NodeId,
  EdgeId,
  EventId,
  ProposalId,
  RevisionNumber,
  Timestamp,
  Confidence,
  NormalizedValue,
} from "../types/lkgc/foundation";
import type { NodeType, LKGCNode } from "../types/lkgc/nodes";
import type { EdgeType, LKGCEdge, EdgeDirection } from "../types/lkgc/edges";

// =============================================================================
// MUTATION PROVENANCE - Track why mutations happen
// =============================================================================

/**
 * Source of a graph mutation
 */
export type MutationSource = "user" | "ai" | "plugin" | "system" | "sync";

/**
 * Mutation provenance - why and by whom a mutation was made
 */
export interface MutationProvenance {
  /** Human-readable reason for the mutation */
  readonly reason: string;

  /** Who/what initiated the mutation */
  readonly source: MutationSource;

  /** Unique identifier for the source (userId, pluginId, etc.) */
  readonly sourceId: string;

  /** Event ID that triggered this mutation (from EventLog) */
  readonly eventId?: EventId;

  /** Proposal ID that triggered this mutation (from AI/suggestions) */
  readonly proposalId?: ProposalId;

  /** When the mutation was requested */
  readonly requestedAt: Timestamp;
}

// =============================================================================
// NODE OPERATIONS
// =============================================================================

/**
 * Input for creating a new node
 */
export interface CreateNodeInput<T extends LKGCNode = LKGCNode> {
  /** Node data (id will be generated if not provided) */
  readonly node: Omit<T, "id" | "sync"> & { id?: NodeId };

  /** Why this node is being created */
  readonly mutation: MutationProvenance;
}

/**
 * Input for updating an existing node
 */
export interface UpdateNodeInput<T extends LKGCNode = LKGCNode> {
  /** Node ID to update */
  readonly id: NodeId;

  /** Partial node data to merge */
  readonly updates: Partial<Omit<T, "id" | "nodeType" | "sync">>;

  /** Expected revision (for optimistic concurrency) */
  readonly expectedRev?: RevisionNumber;

  /** Why this node is being updated */
  readonly mutation: MutationProvenance;
}

/**
 * Input for soft-deleting a node
 */
export interface DeleteNodeInput {
  /** Node ID to delete */
  readonly id: NodeId;

  /** Expected revision (for optimistic concurrency) */
  readonly expectedRev?: RevisionNumber;

  /** Why this node is being deleted */
  readonly mutation: MutationProvenance;
}

/**
 * Result of a node operation
 */
export interface NodeOperationResult {
  /** Whether the operation succeeded */
  readonly success: boolean;

  /** The resulting node (after create/update) or undefined (after delete) */
  readonly node?: LKGCNode;

  /** Error message if failed */
  readonly error?: string;

  /** New revision number */
  readonly rev?: RevisionNumber;
}

// =============================================================================
// EDGE OPERATIONS
// =============================================================================

/**
 * Input for creating a new edge
 */
export interface CreateEdgeInput<T extends LKGCEdge = LKGCEdge> {
  /** Edge data (id will be generated if not provided) */
  readonly edge: Omit<T, "id" | "sync"> & { id?: EdgeId };

  /** Why this edge is being created */
  readonly mutation: MutationProvenance;
}

/**
 * Input for updating an existing edge
 */
export interface UpdateEdgeInput<T extends LKGCEdge = LKGCEdge> {
  /** Edge ID to update */
  readonly id: EdgeId;

  /** Partial edge data to merge */
  readonly updates: Partial<
    Omit<T, "id" | "edgeType" | "sourceId" | "targetId" | "sync">
  >;

  /** Expected revision (for optimistic concurrency) */
  readonly expectedRev?: RevisionNumber;

  /** Why this edge is being updated */
  readonly mutation: MutationProvenance;
}

/**
 * Input for soft-deleting an edge
 */
export interface DeleteEdgeInput {
  /** Edge ID to delete */
  readonly id: EdgeId;

  /** Expected revision (for optimistic concurrency) */
  readonly expectedRev?: RevisionNumber;

  /** Why this edge is being deleted */
  readonly mutation: MutationProvenance;
}

/**
 * Result of an edge operation
 */
export interface EdgeOperationResult {
  /** Whether the operation succeeded */
  readonly success: boolean;

  /** The resulting edge (after create/update) or undefined (after delete) */
  readonly edge?: LKGCEdge;

  /** Error message if failed */
  readonly error?: string;

  /** New revision number */
  readonly rev?: RevisionNumber;
}

// =============================================================================
// REVISION HISTORY
// =============================================================================

/**
 * A historical revision of a node
 */
export interface NodeRevision {
  /** The node state at this revision */
  readonly node: LKGCNode;

  /** Revision number */
  readonly rev: RevisionNumber;

  /** When this revision was created */
  readonly createdAt: Timestamp;

  /** Mutation provenance for this revision */
  readonly mutation: MutationProvenance;

  /** Previous revision number (null for first revision) */
  readonly previousRev: RevisionNumber | null;
}

/**
 * A historical revision of an edge
 */
export interface EdgeRevision {
  /** The edge state at this revision */
  readonly edge: LKGCEdge;

  /** Revision number */
  readonly rev: RevisionNumber;

  /** When this revision was created */
  readonly createdAt: Timestamp;

  /** Mutation provenance for this revision */
  readonly mutation: MutationProvenance;

  /** Previous revision number (null for first revision) */
  readonly previousRev: RevisionNumber | null;
}

// =============================================================================
// QUERY TYPES
// =============================================================================

/**
 * Pagination options
 */
export interface PaginationOptions {
  /** Maximum number of results */
  readonly limit?: number;

  /** Offset for pagination */
  readonly offset?: number;

  /** Cursor for cursor-based pagination */
  readonly cursor?: string;
}

/**
 * Sort options
 */
export interface SortOptions {
  /** Field to sort by */
  readonly field: string;

  /** Sort direction */
  readonly direction: "asc" | "desc";
}

/**
 * Node query options
 */
export interface NodeQueryOptions extends PaginationOptions {
  /** Filter by node types */
  readonly nodeTypes?: readonly NodeType[];

  /** Include soft-deleted nodes */
  readonly includeDeleted?: boolean;

  /** Filter by tags */
  readonly tags?: readonly string[];

  /** Filter by minimum confidence */
  readonly minConfidence?: Confidence;

  /** Sort options */
  readonly sort?: SortOptions;
}

/**
 * Edge query options
 */
export interface EdgeQueryOptions extends PaginationOptions {
  /** Filter by edge types */
  readonly edgeTypes?: readonly EdgeType[];

  /** Include soft-deleted edges */
  readonly includeDeleted?: boolean;

  /** Filter by direction relative to a node */
  readonly direction?: EdgeDirection;

  /** Filter by minimum weight */
  readonly minWeight?: NormalizedValue;

  /** Filter by minimum confidence */
  readonly minConfidence?: Confidence;

  /** Sort options */
  readonly sort?: SortOptions;
}

/**
 * Traversal depth options
 */
export interface TraversalOptions {
  /** Maximum traversal depth */
  readonly maxDepth?: number;

  /** Edge types to follow */
  readonly edgeTypes?: readonly EdgeType[];

  /** Direction to traverse */
  readonly direction?: EdgeDirection;

  /** Maximum nodes to return */
  readonly limit?: number;

  /** Include soft-deleted nodes/edges */
  readonly includeDeleted?: boolean;
}

// =============================================================================
// GRAPH STORE INTERFACE
// =============================================================================

/**
 * GraphStore - The canonical graph store interface
 *
 * Invariants enforced:
 * - Edges MUST reference existing nodes (no dangling edges)
 * - Edge types MUST be valid for the node-type pair
 * - No silent overwrites: all updates are versioned (rev)
 * - Inferred edges MUST carry confidence < 1
 * - Every mutation records: reason, source, sourceId
 * - Graph mutations traceable to event IDs or proposal IDs
 */
export interface GraphStore {
  // ===========================================================================
  // NODE OPERATIONS
  // ===========================================================================

  /**
   * Create a new node
   * @throws if node with same ID already exists
   */
  createNode<T extends LKGCNode>(
    input: CreateNodeInput<T>,
  ): Promise<NodeOperationResult>;

  /**
   * Update an existing node
   * @throws if node doesn't exist or expectedRev doesn't match
   */
  updateNode<T extends LKGCNode>(
    input: UpdateNodeInput<T>,
  ): Promise<NodeOperationResult>;

  /**
   * Soft-delete a node (sets deletedAt, doesn't remove)
   * Also soft-deletes all edges connected to this node
   * @throws if node doesn't exist or expectedRev doesn't match
   */
  deleteNode(input: DeleteNodeInput): Promise<NodeOperationResult>;

  /**
   * Get a node by ID
   * @returns undefined if not found or soft-deleted (unless includeDeleted)
   */
  getNode(id: NodeId, includeDeleted?: boolean): Promise<LKGCNode | undefined>;

  /**
   * Get multiple nodes by ID
   */
  getNodes(
    ids: readonly NodeId[],
    includeDeleted?: boolean,
  ): Promise<readonly LKGCNode[]>;

  /**
   * Get all nodes matching query options
   */
  queryNodes(options?: NodeQueryOptions): Promise<readonly LKGCNode[]>;

  /**
   * Get nodes by type
   */
  getNodesByType<T extends NodeType>(
    nodeType: T,
    options?: NodeQueryOptions,
  ): Promise<readonly Extract<LKGCNode, { nodeType: T }>[]>;

  /**
   * Get revision history for a node
   */
  getNodeRevisions(
    id: NodeId,
    options?: PaginationOptions,
  ): Promise<readonly NodeRevision[]>;

  /**
   * Get a specific revision of a node
   */
  getNodeAtRevision(
    id: NodeId,
    rev: RevisionNumber,
  ): Promise<LKGCNode | undefined>;

  // ===========================================================================
  // EDGE OPERATIONS
  // ===========================================================================

  /**
   * Create a new edge
   * @throws if edge with same ID already exists
   * @throws if source or target node doesn't exist (no dangling edges)
   * @throws if edge type is invalid for the node types
   * @throws if inferred edge has confidence >= 1
   */
  createEdge<T extends LKGCEdge>(
    input: CreateEdgeInput<T>,
  ): Promise<EdgeOperationResult>;

  /**
   * Update an existing edge
   * @throws if edge doesn't exist or expectedRev doesn't match
   */
  updateEdge<T extends LKGCEdge>(
    input: UpdateEdgeInput<T>,
  ): Promise<EdgeOperationResult>;

  /**
   * Soft-delete an edge (sets deletedAt, doesn't remove)
   * @throws if edge doesn't exist or expectedRev doesn't match
   */
  deleteEdge(input: DeleteEdgeInput): Promise<EdgeOperationResult>;

  /**
   * Get an edge by ID
   * @returns undefined if not found or soft-deleted (unless includeDeleted)
   */
  getEdge(id: EdgeId, includeDeleted?: boolean): Promise<LKGCEdge | undefined>;

  /**
   * Get multiple edges by ID
   */
  getEdges(
    ids: readonly EdgeId[],
    includeDeleted?: boolean,
  ): Promise<readonly LKGCEdge[]>;

  /**
   * Get all edges matching query options
   */
  queryEdges(options?: EdgeQueryOptions): Promise<readonly LKGCEdge[]>;

  /**
   * Get edges by type
   */
  getEdgesByType<T extends EdgeType>(
    edgeType: T,
    options?: EdgeQueryOptions,
  ): Promise<readonly Extract<LKGCEdge, { edgeType: T }>[]>;

  /**
   * Get outgoing edges from a node
   */
  getOutgoingEdges(
    nodeId: NodeId,
    options?: EdgeQueryOptions,
  ): Promise<readonly LKGCEdge[]>;

  /**
   * Get incoming edges to a node
   */
  getIncomingEdges(
    nodeId: NodeId,
    options?: EdgeQueryOptions,
  ): Promise<readonly LKGCEdge[]>;

  /**
   * Get all edges connected to a node (both directions)
   */
  getConnectedEdges(
    nodeId: NodeId,
    options?: EdgeQueryOptions,
  ): Promise<readonly LKGCEdge[]>;

  /**
   * Get revision history for an edge
   */
  getEdgeRevisions(
    id: EdgeId,
    options?: PaginationOptions,
  ): Promise<readonly EdgeRevision[]>;

  /**
   * Get a specific revision of an edge
   */
  getEdgeAtRevision(
    id: EdgeId,
    rev: RevisionNumber,
  ): Promise<LKGCEdge | undefined>;

  // ===========================================================================
  // TRAVERSAL HELPERS
  // ===========================================================================

  /**
   * Get prerequisites of a node (follows prerequisite_of edges in reverse)
   * Returns nodes that are prerequisites OF the given node
   */
  getPrerequisites(
    nodeId: NodeId,
    options?: TraversalOptions,
  ): Promise<readonly LKGCNode[]>;

  /**
   * Get dependents of a node (follows prerequisite_of edges forward)
   * Returns nodes that HAVE this node as a prerequisite
   */
  getDependents(
    nodeId: NodeId,
    options?: TraversalOptions,
  ): Promise<readonly LKGCNode[]>;

  /**
   * Get nodes frequently confused with this node
   * (follows frequently_confused_with edges)
   */
  getConfusions(
    nodeId: NodeId,
    options?: TraversalOptions,
  ): Promise<readonly LKGCNode[]>;

  /**
   * Get learning strategies effective for this node
   * (follows best_learned_with_strategy edges)
   */
  getStrategiesForNode(
    nodeId: NodeId,
    options?: TraversalOptions,
  ): Promise<readonly LKGCNode[]>;

  /**
   * Get backlinks to a node
   * (follows backlink edges)
   */
  getBacklinks(
    nodeId: NodeId,
    options?: TraversalOptions,
  ): Promise<readonly LKGCNode[]>;

  /**
   * Generic traversal: get neighbors at distance N
   */
  getNeighbors(
    nodeId: NodeId,
    options?: TraversalOptions,
  ): Promise<readonly { node: LKGCNode; edge: LKGCEdge; depth: number }[]>;

  // ===========================================================================
  // VALIDATION HELPERS
  // ===========================================================================

  /**
   * Check if a node exists (and is not soft-deleted)
   */
  nodeExists(id: NodeId): Promise<boolean>;

  /**
   * Check if an edge exists (and is not soft-deleted)
   */
  edgeExists(id: EdgeId): Promise<boolean>;

  /**
   * Validate that an edge type is allowed for the given node types
   * This enforces domain rules about which edges can connect which nodes
   */
  isValidEdgeForNodes(
    edgeType: EdgeType,
    sourceNodeType: NodeType,
    targetNodeType: NodeType,
  ): boolean;

  // ===========================================================================
  // STATISTICS & INTROSPECTION
  // ===========================================================================

  /**
   * Get count of nodes (optionally filtered)
   */
  countNodes(
    options?: Omit<NodeQueryOptions, "limit" | "offset" | "cursor">,
  ): Promise<number>;

  /**
   * Get count of edges (optionally filtered)
   */
  countEdges(
    options?: Omit<EdgeQueryOptions, "limit" | "offset" | "cursor">,
  ): Promise<number>;

  /**
   * Get statistics about the graph
   */
  getStats(): Promise<GraphStats>;
}

/**
 * Graph statistics
 */
export interface GraphStats {
  /** Total node count */
  readonly nodeCount: number;

  /** Node count by type (only includes types that have nodes) */
  readonly nodeCountByType: Readonly<Partial<Record<NodeType, number>>>;

  /** Total edge count */
  readonly edgeCount: number;

  /** Edge count by type (only includes types that have edges) */
  readonly edgeCountByType: Readonly<Partial<Record<EdgeType, number>>>;

  /** Average edges per node */
  readonly avgEdgesPerNode: number;

  /** Maximum revision number (across all entities) */
  readonly maxRevision: RevisionNumber;

  /** When stats were computed */
  readonly computedAt: Timestamp;
}

// =============================================================================
// EDGE TYPE VALIDATION RULES
// =============================================================================

/**
 * Rules for which edge types can connect which node types
 * This is a simplified version; full rules should be defined based on domain
 */
export interface EdgeTypeRule {
  /** The edge type this rule applies to */
  readonly edgeType: EdgeType;

  /** Allowed source node types (undefined = any) */
  readonly allowedSourceTypes?: readonly NodeType[];

  /** Allowed target node types (undefined = any) */
  readonly allowedTargetTypes?: readonly NodeType[];

  /** Whether this edge type is always bidirectional */
  readonly implicitlyBidirectional?: boolean;

  /** Human-readable description */
  readonly description?: string;
}

/**
 * Default edge type rules
 * Can be extended by implementations
 */
export const DEFAULT_EDGE_TYPE_RULES: readonly EdgeTypeRule[] = [
  // Knowledge structure edges
  {
    edgeType: "prerequisite_of",
    description: "Source concept/card is a prerequisite of target",
  },
  {
    edgeType: "part_of",
    description: "Source is a component/part of target",
  },
  {
    edgeType: "explains",
    description: "Source explains/elaborates on target",
  },
  {
    edgeType: "causes",
    description: "Source causes or leads to target",
  },
  {
    edgeType: "analogous_to",
    implicitlyBidirectional: true,
    description: "Source is analogous/similar to target",
  },
  {
    edgeType: "example_of",
    description: "Source is an example of target concept",
    allowedTargetTypes: ["concept", "term", "fact", "formula", "procedure"],
  },
  {
    edgeType: "counterexample_of",
    description: "Source is a counterexample of target",
  },
  {
    edgeType: "derived_from",
    description: "Source is derived/adapted from target",
  },
  {
    edgeType: "defines",
    description: "Source defines target term/concept",
  },
  {
    edgeType: "uses",
    description: "Source uses/references target",
  },
  {
    edgeType: "contrasts_with",
    implicitlyBidirectional: true,
    description: "Source contrasts with target",
  },

  // Learning design edges
  {
    edgeType: "targets_goal",
    allowedTargetTypes: ["goal"],
    description: "Source targets learning goal",
  },
  {
    edgeType: "introduced_in_path_step",
    allowedTargetTypes: ["learning_path"],
    description: "Source is introduced at a step in target learning path",
  },
  {
    edgeType: "assessed_by",
    allowedTargetTypes: ["card"],
    description: "Source is assessed by target card/assessment",
  },
  {
    edgeType: "practiced_by",
    allowedTargetTypes: ["card"],
    description: "Source is practiced by target card",
  },

  // Metacognitive edges
  {
    edgeType: "best_learned_with_strategy",
    allowedTargetTypes: ["strategy"],
    description: "Source is best learned using target strategy",
  },
  {
    edgeType: "error_pattern_for",
    allowedTargetTypes: ["card", "concept"],
    description: "Source error pattern occurs for target",
  },
  {
    edgeType: "reflection_about",
    allowedSourceTypes: ["reflection"],
    description: "Source reflection is about target",
  },

  // Behavioral edges
  {
    edgeType: "frequently_confused_with",
    implicitlyBidirectional: true,
    description: "Source is often confused with target",
  },
  {
    edgeType: "cross_deck_duplicate_of",
    allowedSourceTypes: ["card"],
    allowedTargetTypes: ["card"],
    description: "Source card duplicates target card",
  },

  // Obsidian mapping edges
  {
    edgeType: "mentions",
    description: "Source mentions (wikilinks to) target",
  },
  {
    edgeType: "backlink",
    description: "Computed inverse of mentions",
  },
] as const;

// =============================================================================
// FACTORY FUNCTION TYPE
// =============================================================================

/**
 * Factory function to create a GraphStore instance
 */
export type GraphStoreFactory = (
  options?: GraphStoreOptions,
) => Promise<GraphStore>;

/**
 * Options for creating a GraphStore
 */
export interface GraphStoreOptions {
  /** SQLite database path (for SQLiteGraphStore) */
  readonly dbPath?: string;

  /** Edge type rules to use (defaults to DEFAULT_EDGE_TYPE_RULES) */
  readonly edgeTypeRules?: readonly EdgeTypeRule[];

  /** Whether to enforce strict edge type validation */
  readonly strictEdgeValidation?: boolean;

  /** Initial data to populate (for testing) */
  readonly initialNodes?: readonly LKGCNode[];
  readonly initialEdges?: readonly LKGCEdge[];
}
