/**
 * @noema/knowledge-graph-service - Graph Value Objects
 *
 * Immutable value objects for graph operations: edge policies, traversal
 * configuration, node filtering, and validation parameterization.
 *
 * All value objects enforce invariants via factory methods and are deeply
 * frozen after construction.
 */

import type {
  DeepReadonly,
  GraphEdgeType,
  GraphNodeType,
  GraphType,
  IGraphEdge,
  IGraphNode,
  MasteryLevel,
  NodeId,
} from '@noema/types';

import { ValidationError } from '../errors/base.errors.js';

// ============================================================================
// EdgePolicy
// ============================================================================

/**
 * Per-edge-type structural policy — the data-driven dispatch mechanism
 * from ADR-0010 that replaced hardcoded if-else chains.
 *
 * Each `GraphEdgeType` maps to exactly one `EdgePolicy` in the
 * EDGE_TYPE_POLICIES configuration.
 */
export interface IEdgePolicy {
  /** The edge type this policy governs */
  readonly edgeType: GraphEdgeType;

  /** Whether this edge type must form a DAG (no cycles) */
  readonly requiresAcyclicity: boolean;

  /** Node types allowed as the source of this edge */
  readonly allowedSourceTypes: readonly GraphNodeType[];

  /** Node types allowed as the target of this edge */
  readonly allowedTargetTypes: readonly GraphNodeType[];

  /** Maximum weight value (always ≤ 1.0) */
  readonly maxWeight: number;

  /** Default weight assigned when the caller doesn't specify one */
  readonly defaultWeight: number;
}

/**
 * Factory for creating validated, frozen `IEdgePolicy` instances.
 */
export const EdgePolicy = {
  create(input: {
    edgeType: GraphEdgeType;
    requiresAcyclicity: boolean;
    allowedSourceTypes: readonly GraphNodeType[];
    allowedTargetTypes: readonly GraphNodeType[];
    maxWeight: number;
    defaultWeight: number;
  }): DeepReadonly<IEdgePolicy> {
    if (input.maxWeight < 0 || input.maxWeight > 1.0) {
      throw new ValidationError('EdgePolicy maxWeight must be in [0.0, 1.0]', {
        maxWeight: [`Received ${String(input.maxWeight)}, expected 0.0–1.0`],
      });
    }
    if (input.defaultWeight < 0 || input.defaultWeight > input.maxWeight) {
      throw new ValidationError('EdgePolicy defaultWeight must be in [0.0, maxWeight]', {
        defaultWeight: [
          `Received ${String(input.defaultWeight)}, expected 0.0–${String(input.maxWeight)}`,
        ],
      });
    }
    if (input.allowedSourceTypes.length === 0) {
      throw new ValidationError('EdgePolicy must allow at least one source type', {
        allowedSourceTypes: ['Array is empty'],
      });
    }
    if (input.allowedTargetTypes.length === 0) {
      throw new ValidationError('EdgePolicy must allow at least one target type', {
        allowedTargetTypes: ['Array is empty'],
      });
    }

    const policy: IEdgePolicy = {
      edgeType: input.edgeType,
      requiresAcyclicity: input.requiresAcyclicity,
      allowedSourceTypes: [...input.allowedSourceTypes],
      allowedTargetTypes: [...input.allowedTargetTypes],
      maxWeight: input.maxWeight,
      defaultWeight: input.defaultWeight,
    };

    return Object.freeze(policy) as DeepReadonly<IEdgePolicy>;
  },
};

// ============================================================================
// ValidationOptions
// ============================================================================

/**
 * Per-stage toggles for edge validation (ADR-0010).
 *
 * Allows callers (particularly agents) to skip validation stages they've
 * already guaranteed, reducing redundant checks during batch operations.
 */
export interface IValidationOptions {
  /** Whether to run acyclicity checks */
  readonly validateAcyclicity: boolean;

  /** Whether to verify source/target node types against the edge policy */
  readonly validateNodeTypes: boolean;

  /** Whether to validate edge weight constraints */
  readonly validateWeight: boolean;

  /** Whether to run custom validation rules */
  readonly validateCustomRules: boolean;

  /** Optional array of custom validator functions */
  readonly customValidators?: readonly ((context: unknown) => boolean)[];
}

/**
 * Factory for creating validated, frozen `IValidationOptions` instances.
 * Defaults: all validations enabled, no custom validators.
 */
export const ValidationOptions = {
  create(input: Partial<IValidationOptions> = {}): DeepReadonly<IValidationOptions> {
    const options: IValidationOptions = {
      validateAcyclicity: input.validateAcyclicity ?? true,
      validateNodeTypes: input.validateNodeTypes ?? true,
      validateWeight: input.validateWeight ?? true,
      validateCustomRules: input.validateCustomRules ?? true,
      ...(input.customValidators ? { customValidators: [...input.customValidators] } : {}),
    };
    return Object.freeze(options) as DeepReadonly<IValidationOptions>;
  },

  /** All validations enabled (the default). */
  allEnabled(): DeepReadonly<IValidationOptions> {
    return ValidationOptions.create();
  },

  /** All standard validations disabled (custom validators still run if provided). */
  allDisabled(): DeepReadonly<IValidationOptions> {
    return ValidationOptions.create({
      validateAcyclicity: false,
      validateNodeTypes: false,
      validateWeight: false,
      validateCustomRules: false,
    });
  },
};

// ============================================================================
// TraversalOptions
// ============================================================================

/** Direction filter for traversal queries. */
export type TraversalDirection = 'inbound' | 'outbound' | 'both';

/**
 * Options for graph traversal queries (ancestors, descendants, subgraph).
 *
 * Control how far and through which edge types the traversal proceeds.
 */
export interface ITraversalOptions {
  /** Maximum traversal depth (positive integer ≥ 1) */
  readonly maxDepth: number;

  /** Only traverse edges of these types (undefined = all types) */
  readonly edgeTypes?: readonly GraphEdgeType[];

  /** Traversal direction: follow inbound edges, outbound, or both */
  readonly direction: TraversalDirection;

  /**
   * If true, return full node properties. If false, return only node IDs
   * for performance (e.g., cycle detection).
   */
  readonly includeProperties: boolean;
}

/**
 * Factory for creating validated, frozen `ITraversalOptions` instances.
 */
export const TraversalOptions = {
  create(input: {
    maxDepth: number;
    edgeTypes?: readonly GraphEdgeType[];
    direction?: TraversalDirection;
    includeProperties?: boolean;
  }): DeepReadonly<ITraversalOptions> {
    if (!Number.isInteger(input.maxDepth) || input.maxDepth < 1) {
      throw new ValidationError('TraversalOptions.maxDepth must be a positive integer (≥ 1)', {
        maxDepth: [`Received ${String(input.maxDepth)}, expected a positive integer`],
      });
    }

    const options: ITraversalOptions = {
      maxDepth: input.maxDepth,
      ...(input.edgeTypes ? { edgeTypes: [...input.edgeTypes] } : {}),
      direction: input.direction ?? 'outbound',
      includeProperties: input.includeProperties ?? true,
    };

    return Object.freeze(options) as DeepReadonly<ITraversalOptions>;
  },

  /** Default traversal: depth 3, outbound, with properties. */
  defaults(): DeepReadonly<ITraversalOptions> {
    return TraversalOptions.create({ maxDepth: 3 });
  },
};

// ============================================================================
// NodeFilter
// ============================================================================

/**
 * Reusable filter criteria for node queries.
 *
 * CKG filters must not include `userId` (CKG is shared).
 * PKG filters should include `userId` for scoping.
 */
export interface INodeFilter {
  /** Filter by semantic node type */
  readonly nodeType?: GraphNodeType;

  /** Filter by knowledge domain */
  readonly domain?: string;

  /** Filter by label substring (case-insensitive) */
  readonly labelContains?: string;

  /** Filter by owning user (PKG only) */
  readonly userId?: string;

  /** Filter by graph type (pkg or ckg) */
  readonly graphType?: GraphType;

  /** Whether to include soft-deleted nodes */
  readonly includeDeleted: boolean;
}

/**
 * Factory for creating validated, frozen `INodeFilter` instances.
 */
export const NodeFilter = {
  create(input: Partial<INodeFilter> = {}): DeepReadonly<INodeFilter> {
    // CKG filters must not specify userId
    if (input.graphType === 'ckg' && input.userId != null) {
      throw new ValidationError(
        'CKG filters must not include userId — the CKG is shared, not user-scoped.',
        { userId: ['Must be omitted for CKG graph type'] }
      );
    }

    const filter: INodeFilter = {
      ...(input.nodeType !== undefined && { nodeType: input.nodeType }),
      ...(input.domain !== undefined && { domain: input.domain }),
      ...(input.labelContains !== undefined && { labelContains: input.labelContains }),
      ...(input.userId !== undefined && { userId: input.userId }),
      ...(input.graphType !== undefined && { graphType: input.graphType }),
      includeDeleted: input.includeDeleted ?? false,
    };

    return Object.freeze(filter) as DeepReadonly<INodeFilter>;
  },
};

// ============================================================================
// SiblingsQuery
// ============================================================================

/**
 * Query configuration for the siblings (co-children) traversal.
 *
 * Siblings are nodes that share a common parent via the same edge type.
 * The `direction` parameter specifies the direction of the edge from the
 * queried node toward its parent.
 */
export interface ISiblingsQuery {
  /** The edge type defining the parent-child relationship (required) */
  readonly edgeType: GraphEdgeType;

  /**
   * Direction of the edge from the queried node to its parent.
   * - `outbound`: me → parent (IS_A, PART_OF, DERIVED_FROM, EXEMPLIFIES)
   * - `inbound`: parent → me (PREREQUISITE, CAUSES)
   */
  readonly direction: 'outbound' | 'inbound';

  /** Whether to return full parent node data (true) or just the parent ID (false) */
  readonly includeParentDetails: boolean;

  /** Maximum siblings returned per parent group */
  readonly maxSiblingsPerGroup: number;
}

/**
 * Factory for creating validated, frozen `ISiblingsQuery` instances.
 */
export const SiblingsQuery = {
  create(input: {
    edgeType: GraphEdgeType;
    direction?: 'outbound' | 'inbound';
    includeParentDetails?: boolean;
    maxSiblingsPerGroup?: number;
  }): DeepReadonly<ISiblingsQuery> {
    const maxSiblingsPerGroup = input.maxSiblingsPerGroup ?? 50;
    if (!Number.isInteger(maxSiblingsPerGroup) || maxSiblingsPerGroup < 1) {
      throw new ValidationError(
        'SiblingsQuery.maxSiblingsPerGroup must be a positive integer (≥ 1)',
        { maxSiblingsPerGroup: [`Received ${String(maxSiblingsPerGroup)}`] }
      );
    }

    const query: ISiblingsQuery = {
      edgeType: input.edgeType,
      direction: input.direction ?? 'outbound',
      includeParentDetails: input.includeParentDetails ?? true,
      maxSiblingsPerGroup,
    };

    return Object.freeze(query) as DeepReadonly<ISiblingsQuery>;
  },
};

// ============================================================================
// SiblingsResult
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

// ============================================================================
// CoParentsQuery
// ============================================================================

/**
 * Query configuration for the co-parents (co-ancestors) traversal.
 *
 * Co-parents are nodes that share a common child via the same edge type.
 * The `direction` parameter specifies the direction of the edge from the
 * queried node toward its child.
 */
export interface ICoParentsQuery {
  /** The edge type defining the parent-child relationship (required) */
  readonly edgeType: GraphEdgeType;

  /**
   * Direction of the edge from the queried node to its child.
   * - `outbound`: me → child (PREREQUISITE, CAUSES)
   * - `inbound`: child → me (IS_A, PART_OF, DERIVED_FROM, EXEMPLIFIES)
   */
  readonly direction: 'outbound' | 'inbound';

  /** Whether to return full child node data (true) or just the child ID (false) */
  readonly includeChildDetails: boolean;

  /** Maximum co-parents returned per child group */
  readonly maxCoParentsPerGroup: number;
}

/**
 * Factory for creating validated, frozen `ICoParentsQuery` instances.
 */
export const CoParentsQuery = {
  create(input: {
    edgeType: GraphEdgeType;
    direction?: 'outbound' | 'inbound';
    includeChildDetails?: boolean;
    maxCoParentsPerGroup?: number;
  }): DeepReadonly<ICoParentsQuery> {
    const maxCoParentsPerGroup = input.maxCoParentsPerGroup ?? 50;
    if (!Number.isInteger(maxCoParentsPerGroup) || maxCoParentsPerGroup < 1) {
      throw new ValidationError(
        'CoParentsQuery.maxCoParentsPerGroup must be a positive integer (≥ 1)',
        { maxCoParentsPerGroup: [`Received ${String(maxCoParentsPerGroup)}`] }
      );
    }

    const query: ICoParentsQuery = {
      edgeType: input.edgeType,
      direction: input.direction ?? 'inbound',
      includeChildDetails: input.includeChildDetails ?? true,
      maxCoParentsPerGroup,
    };

    return Object.freeze(query) as DeepReadonly<ICoParentsQuery>;
  },
};

// ============================================================================
// CoParentsResult
// ============================================================================

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

// ============================================================================
// NeighborhoodQuery
// ============================================================================

/** Filter mode for neighborhood traversals. */
export type NeighborhoodFilterMode = 'full_path' | 'immediate';

/**
 * Query configuration for the N-hop neighborhood traversal.
 *
 * The neighborhood query returns nodes reachable within N hops from an
 * origin, grouped by the edge type connecting to the origin.
 */
export interface INeighborhoodQuery {
  /** Number of relationship hops (1–10) */
  readonly hops: number;

  /** Edge type filter (undefined = all types) */
  readonly edgeTypes?: readonly GraphEdgeType[];

  /** Node type filter (undefined = all types) */
  readonly nodeTypes?: readonly GraphNodeType[];

  /** How edge/node filters apply: `full_path` or `immediate` */
  readonly filterMode: NeighborhoodFilterMode;

  /** Traversal direction */
  readonly direction: TraversalDirection;

  /** Max neighbors returned per edge-type group */
  readonly maxPerGroup: number;

  /** Whether to return connecting edges */
  readonly includeEdges: boolean;
}

/**
 * Factory for creating validated, frozen `INeighborhoodQuery` instances.
 */
export const NeighborhoodQuery = {
  create(input: {
    hops?: number;
    edgeTypes?: readonly GraphEdgeType[];
    nodeTypes?: readonly GraphNodeType[];
    filterMode?: NeighborhoodFilterMode;
    direction?: TraversalDirection;
    maxPerGroup?: number;
    includeEdges?: boolean;
  }): DeepReadonly<INeighborhoodQuery> {
    const hops = input.hops ?? 1;
    if (!Number.isInteger(hops) || hops < 1 || hops > 10) {
      throw new ValidationError('NeighborhoodQuery.hops must be an integer in [1, 10]', {
        hops: [`Received ${String(hops)}`],
      });
    }

    const maxPerGroup = input.maxPerGroup ?? 25;
    if (!Number.isInteger(maxPerGroup) || maxPerGroup < 1 || maxPerGroup > 100) {
      throw new ValidationError('NeighborhoodQuery.maxPerGroup must be an integer in [1, 100]', {
        maxPerGroup: [`Received ${String(maxPerGroup)}`],
      });
    }

    const query: INeighborhoodQuery = {
      hops,
      ...(input.edgeTypes !== undefined ? { edgeTypes: [...input.edgeTypes] } : {}),
      ...(input.nodeTypes !== undefined ? { nodeTypes: [...input.nodeTypes] } : {}),
      filterMode: input.filterMode ?? 'full_path',
      direction: input.direction ?? 'both',
      maxPerGroup,
      includeEdges: input.includeEdges ?? true,
    };

    return Object.freeze(query) as DeepReadonly<INeighborhoodQuery>;
  },
};

// ============================================================================
// NeighborhoodResult
// ============================================================================

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
// BridgeQuery (Phase 8c)
// ============================================================================

/**
 * Query parameters for bridge node (articulation point) detection.
 *
 * Bridge nodes are concepts whose removal would disconnect part of the
 * knowledge graph — structurally critical threshold concepts.
 */
export interface IBridgeQuery {
  /** Knowledge domain to analyze */
  readonly domain: string;

  /** Only consider these edge types for connectivity (undefined = all) */
  readonly edgeTypes?: readonly GraphEdgeType[];

  /** Minimum downstream component size for a node to qualify as a bridge */
  readonly minComponentSize: number;
}

/**
 * Factory for creating validated, frozen `IBridgeQuery` instances.
 */
export const BridgeQuery = {
  create(input: {
    domain: string;
    edgeTypes?: readonly GraphEdgeType[];
    minComponentSize?: number;
  }): DeepReadonly<IBridgeQuery> {
    if (!input.domain || input.domain.trim().length === 0) {
      throw new ValidationError('BridgeQuery.domain must be a non-empty string', {
        domain: ['Received empty string'],
      });
    }

    const minComponentSize = input.minComponentSize ?? 2;
    if (!Number.isInteger(minComponentSize) || minComponentSize < 1 || minComponentSize > 1000) {
      throw new ValidationError('BridgeQuery.minComponentSize must be an integer in [1, 1000]', {
        minComponentSize: [`Received ${String(minComponentSize)}`],
      });
    }

    const query: IBridgeQuery = {
      domain: input.domain.trim(),
      ...(input.edgeTypes !== undefined ? { edgeTypes: [...input.edgeTypes] } : {}),
      minComponentSize,
    };

    return Object.freeze(query) as DeepReadonly<IBridgeQuery>;
  },
};

// ============================================================================
// BridgeNode & BridgeNodesResult (Phase 8c)
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
// FrontierQuery (Phase 8c)
// ============================================================================

/** Sorting strategy for frontier nodes. */
export type FrontierSortBy = 'readiness' | 'centrality' | 'depth';

/**
 * Query parameters for knowledge frontier detection.
 *
 * The knowledge frontier is the set of unmastered nodes whose prerequisites
 * are mastered — the optimal next-study candidates.
 */
export interface IFrontierQuery {
  /** Knowledge domain */
  readonly domain: string;

  /** Mastery level above which a node is considered "mastered" */
  readonly masteryThreshold: MasteryLevel;

  /** Maximum frontier nodes to return */
  readonly maxResults: number;

  /** Sort strategy */
  readonly sortBy: FrontierSortBy;

  /** Whether to include each frontier node's mastered prerequisites */
  readonly includePrerequisites: boolean;
}

/**
 * Factory for creating validated, frozen `IFrontierQuery` instances.
 */
export const FrontierQuery = {
  create(input: {
    domain: string;
    masteryThreshold?: number;
    maxResults?: number;
    sortBy?: FrontierSortBy;
    includePrerequisites?: boolean;
  }): DeepReadonly<IFrontierQuery> {
    if (!input.domain || input.domain.trim().length === 0) {
      throw new ValidationError('FrontierQuery.domain must be a non-empty string', {
        domain: ['Received empty string'],
      });
    }

    const masteryThreshold = input.masteryThreshold ?? 0.7;
    if (masteryThreshold < 0 || masteryThreshold > 1) {
      throw new ValidationError('FrontierQuery.masteryThreshold must be in [0, 1]', {
        masteryThreshold: [`Received ${String(masteryThreshold)}`],
      });
    }

    const maxResults = input.maxResults ?? 20;
    if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 100) {
      throw new ValidationError('FrontierQuery.maxResults must be an integer in [1, 100]', {
        maxResults: [`Received ${String(maxResults)}`],
      });
    }

    const query: IFrontierQuery = {
      domain: input.domain.trim(),
      masteryThreshold: masteryThreshold as MasteryLevel,
      maxResults,
      sortBy: input.sortBy ?? 'readiness',
      includePrerequisites: input.includePrerequisites ?? false,
    };

    return Object.freeze(query) as DeepReadonly<IFrontierQuery>;
  },
};

// ============================================================================
// FrontierNode & KnowledgeFrontierResult (Phase 8c)
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
// CommonAncestorsQuery (Phase 8c)
// ============================================================================

/**
 * Query parameters for common ancestor detection between two nodes.
 */
export interface ICommonAncestorsQuery {
  /** Edge types to traverse for ancestry */
  readonly edgeTypes: readonly GraphEdgeType[];

  /** Maximum depth for ancestor search */
  readonly maxDepth: number;
}

/**
 * Factory for creating validated, frozen `ICommonAncestorsQuery` instances.
 */
export const CommonAncestorsQuery = {
  create(input: {
    edgeTypes?: readonly GraphEdgeType[];
    maxDepth?: number;
  }): DeepReadonly<ICommonAncestorsQuery> {
    const edgeTypes: readonly GraphEdgeType[] =
      input.edgeTypes !== undefined && input.edgeTypes.length > 0
        ? [...input.edgeTypes]
        : (['prerequisite', 'is_a', 'part_of'] as GraphEdgeType[]);

    const maxDepth = input.maxDepth ?? 10;
    if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 20) {
      throw new ValidationError('CommonAncestorsQuery.maxDepth must be an integer in [1, 20]', {
        maxDepth: [`Received ${String(maxDepth)}`],
      });
    }

    const query: ICommonAncestorsQuery = {
      edgeTypes,
      maxDepth,
    };

    return Object.freeze(query) as DeepReadonly<ICommonAncestorsQuery>;
  },
};

// ============================================================================
// CommonAncestorEntry & CommonAncestorsResult (Phase 8c)
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
