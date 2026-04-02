/**
 * @noema/knowledge-graph-service - Graph Domain Errors
 *
 * Error classes for graph operations: node/edge CRUD, traversal,
 * and structural integrity violations.
 */

import { DomainError } from './base.errors.js';

// ============================================================================
// Node Errors
// ============================================================================

/**
 * Thrown when a graph node cannot be found.
 * Maps to HTTP 404.
 */
export class NodeNotFoundError extends DomainError {
  public readonly nodeId: string;
  public readonly graphType: string | undefined;

  constructor(nodeId: string, graphType?: string) {
    const ctx = graphType !== undefined && graphType !== '' ? ` in ${graphType} graph` : '';
    super('NODE_NOT_FOUND', `Node not found: ${nodeId}${ctx}`, {
      nodeId,
      graphType,
    });
    this.nodeId = nodeId;
    this.graphType = graphType;
  }
}

/**
 * Thrown when an edge cannot be found.
 * Maps to HTTP 404.
 */
export class EdgeNotFoundError extends DomainError {
  public readonly edgeId: string;

  constructor(edgeId: string) {
    super('EDGE_NOT_FOUND', `Edge not found: ${edgeId}`, { edgeId });
    this.edgeId = edgeId;
  }
}

/**
 * Thrown when a graph snapshot cannot be found.
 * Maps to HTTP 404.
 */
export class GraphSnapshotNotFoundError extends DomainError {
  public readonly snapshotId: string;

  constructor(snapshotId: string) {
    super('GRAPH_SNAPSHOT_NOT_FOUND', `Graph snapshot not found: ${snapshotId}`, {
      snapshotId,
    });
    this.snapshotId = snapshotId;
  }
}

// ============================================================================
// Structural Integrity Errors
// ============================================================================

/**
 * Thrown when creating a node with a label that already exists in the same scope.
 * Maps to HTTP 409.
 */
export class DuplicateNodeError extends DomainError {
  public readonly label: string;
  public readonly domain: string;
  public readonly existingNodeId: string | undefined;

  constructor(label: string, domain: string, existingNodeId?: string) {
    super('DUPLICATE_NODE', `Node with label "${label}" already exists in domain "${domain}"`, {
      label,
      domain,
      existingNodeId,
    });
    this.label = label;
    this.domain = domain;
    this.existingNodeId = existingNodeId;
  }
}

/**
 * Thrown when adding an edge would create a cycle in an edge type that requires acyclicity.
 * Maps to HTTP 409.
 *
 * The cyclePath field contains the node IDs forming the cycle, enabling
 * the API layer to return actionable diagnostic information.
 */
export class CyclicEdgeError extends DomainError {
  public readonly edgeType: string;
  public readonly sourceNodeId: string;
  public readonly targetNodeId: string;
  public readonly cyclePath: readonly string[];

  constructor(
    edgeType: string,
    sourceNodeId: string,
    targetNodeId: string,
    cyclePath: readonly string[] = []
  ) {
    super(
      'CYCLIC_EDGE',
      `Adding ${edgeType} edge from ${sourceNodeId} to ${targetNodeId} would create a cycle`,
      { edgeType, sourceNodeId, targetNodeId, cyclePath }
    );
    this.edgeType = edgeType;
    this.sourceNodeId = sourceNodeId;
    this.targetNodeId = targetNodeId;
    this.cyclePath = cyclePath;
  }
}

/**
 * Thrown when an edge references a source or target node that doesn't exist.
 * Maps to HTTP 422.
 */
export class OrphanEdgeError extends DomainError {
  public readonly missingNodeId: string;
  public readonly role: 'source' | 'target';

  constructor(missingNodeId: string, role: 'source' | 'target') {
    super('ORPHAN_EDGE', `Edge ${role} node does not exist: ${missingNodeId}`, {
      missingNodeId,
      role,
    });
    this.missingNodeId = missingNodeId;
    this.role = role;
  }
}

/**
 * Thrown when an edge type is not allowed between the given node types,
 * according to EDGE_TYPE_POLICIES.
 * Maps to HTTP 422.
 */
export class InvalidEdgeTypeError extends DomainError {
  public readonly edgeType: string;
  public readonly sourceNodeType: string;
  public readonly targetNodeType: string;
  public readonly allowedSourceTypes: readonly string[] | undefined;
  public readonly allowedTargetTypes: readonly string[] | undefined;

  constructor(
    edgeType: string,
    sourceNodeType: string,
    targetNodeType: string,
    allowedSourceTypes?: readonly string[],
    allowedTargetTypes?: readonly string[]
  ) {
    super(
      'INVALID_EDGE_TYPE',
      `Edge type "${edgeType}" is not allowed from ${sourceNodeType} to ${targetNodeType}`,
      { edgeType, sourceNodeType, targetNodeType, allowedSourceTypes, allowedTargetTypes }
    );
    this.edgeType = edgeType;
    this.sourceNodeType = sourceNodeType;
    this.targetNodeType = targetNodeType;
    this.allowedSourceTypes = allowedSourceTypes;
    this.allowedTargetTypes = allowedTargetTypes;
  }
}

/**
 * Thrown when a traversal query exceeds the configured max depth.
 * Maps to HTTP 422.
 */
export class MaxDepthExceededError extends DomainError {
  public readonly requestedDepth: number;
  public readonly maxAllowed: number;

  constructor(requestedDepth: number, maxAllowed: number) {
    super(
      'MAX_DEPTH_EXCEEDED',
      `Traversal depth ${String(requestedDepth)} exceeds maximum allowed ${String(maxAllowed)}`,
      { requestedDepth, maxAllowed }
    );
    this.requestedDepth = requestedDepth;
    this.maxAllowed = maxAllowed;
  }
}

/**
 * Thrown when a general graph invariant is violated.
 * Maps to HTTP 409.
 */
export class GraphConsistencyError extends DomainError {
  public readonly invariant: string;

  constructor(invariant: string, message: string, details?: Record<string, unknown>) {
    super('GRAPH_CONSISTENCY_VIOLATION', message, { invariant, ...details });
    this.invariant = invariant;
  }
}
