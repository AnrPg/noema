/**
 * @noema/knowledge-graph-service - PKG Operation Log Repository Interface
 *
 * Append-only changelog of all PKG mutations. Unlike the CKG mutation
 * pipeline, PKG writes are direct (no typestate, no multi-stage validation).
 * This log provides traceability for:
 *
 * 1. **Undo/redo** — reconstruct previous states without event sourcing.
 * 2. **Aggregation pipeline input** — structured data for the PKG→CKG
 *    aggregation pipeline (Phase 6, ADR-005).
 * 3. **Offline sync reconciliation** — server-side mutation history for
 *    conflict resolution with the mobile app's local changelog.
 *
 * The operation log is NOT a replacement for domain events: events are
 * ephemeral fire-and-forget notifications; the log is a durable,
 * queryable audit trail in PostgreSQL.
 */

import type { EdgeId, IPaginatedResponse, NodeId, UserId } from '@noema/types';

import type { PkgOperation, PkgOperationType } from './value-objects/operation-log.js';

// ============================================================================
// Operation Log Entry
// ============================================================================

/**
 * A persisted operation log entry — the raw PkgOperation plus
 * persistence metadata.
 */
export interface IPkgOperationLogEntry {
  /** Persistence ID */
  readonly id: string;

  /** Owner user ID */
  readonly userId: UserId;

  /** The operation payload (discriminated union) */
  readonly operation: PkgOperation;

  /** When the entry was appended (ISO 8601) */
  readonly createdAt: string;
}

// ============================================================================
// IPkgOperationLogRepository
// ============================================================================

/**
 * Append-only repository for PKG operation history.
 */
export interface IPkgOperationLogRepository {
  /**
   * Append an operation to the log.
   * @param userId The user who performed the operation.
   * @param operation The discriminated-union operation payload.
   * @returns The persisted log entry.
   */
  appendOperation(userId: UserId, operation: PkgOperation): Promise<IPkgOperationLogEntry>;

  /**
   * Get operation history for a user (with pagination).
   * Ordered by sequence number descending (most recent first).
   */
  getOperationHistory(
    userId: UserId,
    limit: number,
    offset: number
  ): Promise<IPaginatedResponse<IPkgOperationLogEntry>>;

  /**
   * Get operations since a timestamp (for sync reconciliation).
   * Ordered by sequence number ascending (oldest first, for replay).
   */
  getOperationsSince(userId: UserId, since: string): Promise<IPkgOperationLogEntry[]>;

  /**
   * Get operations by type (for analytics).
   */
  getOperationsByType(
    userId: UserId,
    operationType: PkgOperationType,
    limit: number,
    offset: number
  ): Promise<IPaginatedResponse<IPkgOperationLogEntry>>;

  /**
   * Get operations affecting a specific node (for undo context).
   */
  getOperationsForNode(userId: UserId, nodeId: NodeId): Promise<IPkgOperationLogEntry[]>;

  /**
   * Get operations affecting a specific edge (for undo context).
   */
  getOperationsForEdge(userId: UserId, edgeId: EdgeId): Promise<IPkgOperationLogEntry[]>;

  /**
   * Count operations matching optional filters (for exact pagination totals).
   * Without filters, returns the total count for the user.
   */
  countOperations(userId: UserId, filters?: { operationType?: PkgOperationType }): Promise<number>;
}
