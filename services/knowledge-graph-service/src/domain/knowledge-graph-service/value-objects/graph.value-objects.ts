/**
 * @noema/knowledge-graph-service - Graph Value Objects
 *
 * Immutable value objects for graph operations: edge policies, traversal
 * configuration, node filtering, and validation parameterization.
 *
 * All value objects enforce invariants via factory methods and are deeply
 * frozen after construction.
 */

import type { DeepReadonly, GraphEdgeType, GraphNodeType, GraphType } from '@noema/types';

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
