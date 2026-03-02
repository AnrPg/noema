/**
 * @noema/knowledge-graph-service - PKG Operation Log Types
 *
 * Discriminated union of all PKG operations for the append-only
 * operation log. Each entry is immutable and carries a monotonically
 * increasing sequence number per user for sync ordering guarantees.
 *
 * Design decision D3: Typed discriminated union rather than generic
 * payload maps — provides exhaustive pattern matching and type-safe
 * access to operation-specific fields.
 */

import type {
  EdgeId,
  EdgeWeight,
  GraphEdgeType,
  GraphNodeType,
  Metadata,
  NodeId,
} from '@noema/types';

// ============================================================================
// Operation Type Discriminator
// ============================================================================

export const PkgOperationType = {
  NODE_CREATED: 'PkgNodeCreated',
  NODE_UPDATED: 'PkgNodeUpdated',
  NODE_DELETED: 'PkgNodeDeleted',
  EDGE_CREATED: 'PkgEdgeCreated',
  EDGE_UPDATED: 'PkgEdgeUpdated',
  EDGE_DELETED: 'PkgEdgeDeleted',
  BATCH_IMPORT: 'PkgBatchImport',
} as const;

export type PkgOperationType = (typeof PkgOperationType)[keyof typeof PkgOperationType];

// ============================================================================
// Individual Operation Types
// ============================================================================

/**
 * Base fields present on every operation log entry.
 */
interface IPkgOperationBase {
  /** Discriminator for exhaustive matching */
  readonly operationType: PkgOperationType;

  /** Monotonically increasing sequence number per user */
  readonly sequenceNumber: number;

  /** When the operation was performed (ISO 8601) */
  readonly timestamp: string;

  /** Additional metadata (source agent, client version, etc.) */
  readonly metadata?: Metadata;
}

/**
 * A new node was created in the user's PKG.
 */
export interface IPkgNodeCreatedOp extends IPkgOperationBase {
  readonly operationType: typeof PkgOperationType.NODE_CREATED;
  readonly nodeId: NodeId;
  readonly nodeType: GraphNodeType;
  readonly label: string;
  readonly domain: string;
}

/**
 * A node's properties were updated.
 * Tracks before/after values for undo support.
 */
export interface IPkgNodeUpdatedOp extends IPkgOperationBase {
  readonly operationType: typeof PkgOperationType.NODE_UPDATED;
  readonly nodeId: NodeId;
  readonly changedFields: readonly {
    readonly field: string;
    readonly before: unknown;
    readonly after: unknown;
  }[];
}

/**
 * A node was soft-deleted.
 */
export interface IPkgNodeDeletedOp extends IPkgOperationBase {
  readonly operationType: typeof PkgOperationType.NODE_DELETED;
  readonly nodeId: NodeId;
}

/**
 * A new edge was created between two nodes.
 */
export interface IPkgEdgeCreatedOp extends IPkgOperationBase {
  readonly operationType: typeof PkgOperationType.EDGE_CREATED;
  readonly edgeId: EdgeId;
  readonly edgeType: GraphEdgeType;
  readonly sourceNodeId: NodeId;
  readonly targetNodeId: NodeId;
  readonly weight: EdgeWeight;

  /**
   * Records which validations were explicitly skipped via
   * IValidationOptions. Present only when at least one check
   * was bypassed — provides a governance audit trail.
   */
  readonly skippedValidations?: readonly string[];
}

/**
 * An edge's weight or properties were updated.
 * Tracks before/after values for undo support.
 */
export interface IPkgEdgeUpdatedOp extends IPkgOperationBase {
  readonly operationType: typeof PkgOperationType.EDGE_UPDATED;
  readonly edgeId: EdgeId;
  readonly changedFields: readonly {
    readonly field: string;
    readonly before: unknown;
    readonly after: unknown;
  }[];
}

/**
 * An edge was deleted.
 */
export interface IPkgEdgeDeletedOp extends IPkgOperationBase {
  readonly operationType: typeof PkgOperationType.EDGE_DELETED;
  readonly edgeId: EdgeId;
}

/**
 * A batch import of multiple sub-operations.
 */
export interface IPkgBatchImportOp extends IPkgOperationBase {
  readonly operationType: typeof PkgOperationType.BATCH_IMPORT;
  readonly subOperations: readonly PkgAtomicOperation[];
}

// ============================================================================
// Union Types
// ============================================================================

/**
 * Any single atomic PKG operation (excludes batch).
 */
export type PkgAtomicOperation =
  | IPkgNodeCreatedOp
  | IPkgNodeUpdatedOp
  | IPkgNodeDeletedOp
  | IPkgEdgeCreatedOp
  | IPkgEdgeUpdatedOp
  | IPkgEdgeDeletedOp;

/**
 * Any PKG operation (including batch).
 */
export type PkgOperation = PkgAtomicOperation | IPkgBatchImportOp;
