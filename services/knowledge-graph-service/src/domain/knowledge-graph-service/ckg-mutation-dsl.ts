/**
 * @noema/knowledge-graph-service - CKG Mutation DSL
 *
 * Defines the Domain Specific Language for CKG (Canonical Knowledge Graph)
 * mutations. The DSL is the vocabulary of possible structural changes to the
 * CKG. Each mutation contains one or more operations that describe what
 * structural change is being proposed.
 *
 * Why a DSL?
 * 1. Auditability — every change is a data structure that can be logged/reviewed
 * 2. Atomicity — multi-op mutations commit or rollback as a unit
 * 3. Validation — the pipeline can analyze all operations before applying any
 * 4. Agent interface — agents compose mutations programmatically
 *
 * Operation types: AddNode, RemoveNode, UpdateNode, AddEdge, RemoveEdge,
 * MergeNodes, SplitNode.
 */

import { z } from 'zod';

import type { GraphEdgeType, GraphNodeType, Metadata } from '@noema/types';

// ============================================================================
// Operation Type Discriminator
// ============================================================================

/**
 * Const-object enum for mutation operation types.
 * Follows the codebase pattern (PkgOperationType, GraphEdgeType, etc.).
 */
export const CkgOperationType = {
  ADD_NODE: 'add_node',
  REMOVE_NODE: 'remove_node',
  UPDATE_NODE: 'update_node',
  ADD_EDGE: 'add_edge',
  REMOVE_EDGE: 'remove_edge',
  MERGE_NODES: 'merge_nodes',
  SPLIT_NODE: 'split_node',
} as const;

export type CkgOperationType = (typeof CkgOperationType)[keyof typeof CkgOperationType];

// ============================================================================
// Operation Interfaces (Discriminated Union)
// ============================================================================

/**
 * Add a new concept node to the CKG.
 * This is how new canonical concepts enter the system.
 */
export interface IAddNodeOperation {
  readonly type: typeof CkgOperationType.ADD_NODE;
  readonly nodeType: GraphNodeType;
  readonly label: string;
  readonly description: string;
  readonly domain: string;
  readonly properties: Metadata;
}

/**
 * Propose removing a node from the CKG (soft delete).
 * Rarely used — typically for duplicates or out-of-scope concepts.
 */
export interface IRemoveNodeOperation {
  readonly type: typeof CkgOperationType.REMOVE_NODE;
  readonly nodeId: string;
  readonly rationale: string;
}

/**
 * Modify a node's properties (label, description, etc.).
 */
export interface IUpdateNodeOperation {
  readonly type: typeof CkgOperationType.UPDATE_NODE;
  readonly nodeId: string;
  readonly updates: {
    readonly label?: string;
    readonly description?: string;
    readonly domain?: string;
    readonly properties?: Metadata;
  };
  readonly rationale: string;
}

/**
 * Add a structural relationship between two CKG nodes.
 * Subject to the same EDGE_TYPE_POLICIES as PKG edges.
 */
export interface IAddEdgeOperation {
  readonly type: typeof CkgOperationType.ADD_EDGE;
  readonly edgeType: GraphEdgeType;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly weight: number;
  readonly rationale: string;
}

/**
 * Remove a structural relationship from the CKG.
 */
export interface IRemoveEdgeOperation {
  readonly type: typeof CkgOperationType.REMOVE_EDGE;
  readonly edgeId: string;
  readonly rationale: string;
}

/**
 * Merge two nodes into one (for deduplication).
 * All edges from the source are redirected to the target. The source
 * is soft-deleted. Downstream PKGs are notified via events.
 */
export interface IMergeNodesOperation {
  readonly type: typeof CkgOperationType.MERGE_NODES;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly mergedProperties: Metadata;
  readonly rationale: string;
}

/**
 * Edge reassignment rule for split operations.
 * Determines which of the two new nodes an existing edge should
 * be redirected to.
 */
export interface IEdgeReassignmentRule {
  readonly edgeId: string;
  /** Which split target gets this edge: 'a' or 'b' */
  readonly assignTo: 'a' | 'b';
}

/**
 * Split one node into two (when a concept conflates distinct ideas).
 * Creates two new nodes, reassigns edges per rules, soft-deletes original.
 */
export interface ISplitNodeOperation {
  readonly type: typeof CkgOperationType.SPLIT_NODE;
  readonly nodeId: string;
  readonly newNodeA: {
    readonly label: string;
    readonly description: string;
    readonly nodeType: GraphNodeType;
    readonly properties: Metadata;
  };
  readonly newNodeB: {
    readonly label: string;
    readonly description: string;
    readonly nodeType: GraphNodeType;
    readonly properties: Metadata;
  };
  readonly edgeReassignmentRules: readonly IEdgeReassignmentRule[];
  readonly rationale: string;
}

// ============================================================================
// Discriminated Union
// ============================================================================

/**
 * A single CKG mutation operation — discriminated on `type`.
 *
 * A mutation can contain multiple operations for atomicity.
 * For example: "add concept X, add concept Y, add PREREQUISITE from X to Y"
 * is one mutation with three operations.
 */
export type CkgMutationOperation =
  | IAddNodeOperation
  | IRemoveNodeOperation
  | IUpdateNodeOperation
  | IAddEdgeOperation
  | IRemoveEdgeOperation
  | IMergeNodesOperation
  | ISplitNodeOperation;

// ============================================================================
// Zod Validation Schemas
// ============================================================================

// Shared sub-schemas
const MetadataSchema = z.record(z.unknown()).default({});

const NodeTypeSchema = z.enum([
  'concept',
  'skill',
  'fact',
  'procedure',
  'principle',
  'example',
  'counterexample',
  'misconception',
]);

const EdgeTypeSchema = z.enum([
  'prerequisite',
  'part_of',
  'is_a',
  'related_to',
  'contradicts',
  'exemplifies',
  'causes',
  'derived_from',
]);

// ── Individual operation schemas ──────────────────────────────────────────

export const AddNodeOperationSchema = z.object({
  type: z.literal(CkgOperationType.ADD_NODE),
  nodeType: NodeTypeSchema,
  label: z.string().min(1).max(500),
  description: z.string().max(2000),
  domain: z.string().min(1).max(200),
  properties: MetadataSchema,
});

export const RemoveNodeOperationSchema = z.object({
  type: z.literal(CkgOperationType.REMOVE_NODE),
  nodeId: z.string().min(1),
  rationale: z.string().min(1).max(2000),
});

export const UpdateNodeOperationSchema = z.object({
  type: z.literal(CkgOperationType.UPDATE_NODE),
  nodeId: z.string().min(1),
  updates: z
    .object({
      label: z.string().min(1).max(500).optional(),
      description: z.string().max(2000).optional(),
      domain: z.string().min(1).max(200).optional(),
      properties: MetadataSchema.optional(),
    })
    .refine(
      (u) =>
        u.label !== undefined ||
        u.description !== undefined ||
        u.domain !== undefined ||
        u.properties !== undefined,
      { message: 'At least one update field is required' }
    ),
  rationale: z.string().min(1).max(2000),
});

export const AddEdgeOperationSchema = z.object({
  type: z.literal(CkgOperationType.ADD_EDGE),
  edgeType: EdgeTypeSchema,
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  weight: z.number().min(0).max(1),
  rationale: z.string().min(1).max(2000),
});

export const RemoveEdgeOperationSchema = z.object({
  type: z.literal(CkgOperationType.REMOVE_EDGE),
  edgeId: z.string().min(1),
  rationale: z.string().min(1).max(2000),
});

const EdgeReassignmentRuleSchema = z.object({
  edgeId: z.string().min(1),
  assignTo: z.enum(['a', 'b']),
});

export const MergeNodesOperationSchema = z.object({
  type: z.literal(CkgOperationType.MERGE_NODES),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  mergedProperties: MetadataSchema,
  rationale: z.string().min(1).max(2000),
});

const SplitNodeSubSchema = z.object({
  label: z.string().min(1).max(500),
  description: z.string().max(2000),
  nodeType: NodeTypeSchema,
  properties: MetadataSchema,
});

export const SplitNodeOperationSchema = z.object({
  type: z.literal(CkgOperationType.SPLIT_NODE),
  nodeId: z.string().min(1),
  newNodeA: SplitNodeSubSchema,
  newNodeB: SplitNodeSubSchema,
  edgeReassignmentRules: z.array(EdgeReassignmentRuleSchema),
  rationale: z.string().min(1).max(2000),
});

// ── Discriminated union schema ───────────────────────────────────────────

/**
 * Zod schema that validates any single CKG mutation operation.
 * Uses discriminated union on the `type` field.
 */
export const CkgMutationOperationSchema = z.discriminatedUnion('type', [
  AddNodeOperationSchema,
  RemoveNodeOperationSchema,
  UpdateNodeOperationSchema,
  AddEdgeOperationSchema,
  RemoveEdgeOperationSchema,
  MergeNodesOperationSchema,
  SplitNodeOperationSchema,
]);

// ── Mutation proposal schema ─────────────────────────────────────────────

/**
 * Schema for the full mutation proposal submitted by an agent or admin user.
 */
export const MutationProposalSchema = z.object({
  /** The operations comprising this mutation (at least one required) */
  operations: z.array(CkgMutationOperationSchema).min(1).max(50),

  /** Human-readable justification for the mutation */
  rationale: z.string().min(1).max(2000),

  /**
   * Evidence count from PKG aggregation pipeline (optional).
   * When provided, triggers evidence sufficiency validation.
   */
  evidenceCount: z.number().int().min(0).default(0),

  /** Processing priority (higher = processed sooner) */
  priority: z.number().int().min(0).max(100).default(0),
});

/**
 * Inferred TypeScript type from the mutation proposal schema.
 */
export type IMutationProposal = z.infer<typeof MutationProposalSchema>;

// ============================================================================
// Mutation Filter Schema (for listMutations)
// ============================================================================

export const MutationFilterSchema = z.object({
  /** Filter by mutation state */
  state: z
    .enum([
      'proposed',
      'validating',
      'validated',
      'pending_review',
      'revision_requested',
      'proving',
      'proven',
      'committing',
      'committed',
      'rejected',
    ])
    .optional(),

  /** Filter by proposer (agent or admin user) */
  proposedBy: z.string().min(1, 'proposedBy must be non-empty').optional(),

  /** Filter mutations created after this date (ISO 8601) */
  createdAfter: z.string().datetime().optional(),

  /** Filter mutations created before this date (ISO 8601) */
  createdBefore: z.string().datetime().optional(),
});

export type IMutationFilter = z.infer<typeof MutationFilterSchema>;

// ============================================================================
// Utility: Extract affected node/edge IDs from operations
// ============================================================================

/**
 * Extract all node IDs referenced by a set of operations.
 * Used for conflict detection and cache invalidation.
 */
export function extractAffectedNodeIds(operations: readonly CkgMutationOperation[]): string[] {
  const nodeIds = new Set<string>();

  for (const op of operations) {
    switch (op.type) {
      case CkgOperationType.ADD_NODE:
        // New node — no existing ID to track
        break;
      case CkgOperationType.REMOVE_NODE:
        nodeIds.add(op.nodeId);
        break;
      case CkgOperationType.UPDATE_NODE:
        nodeIds.add(op.nodeId);
        break;
      case CkgOperationType.ADD_EDGE:
        nodeIds.add(op.sourceNodeId);
        nodeIds.add(op.targetNodeId);
        break;
      case CkgOperationType.REMOVE_EDGE:
        // Edge removal — edge ID tracked separately
        break;
      case CkgOperationType.MERGE_NODES:
        nodeIds.add(op.sourceNodeId);
        nodeIds.add(op.targetNodeId);
        break;
      case CkgOperationType.SPLIT_NODE:
        nodeIds.add(op.nodeId);
        break;
    }
  }

  return [...nodeIds];
}

/**
 * Extract all edge IDs referenced by a set of operations.
 * Used for conflict detection and cache invalidation.
 */
export function extractAffectedEdgeIds(operations: readonly CkgMutationOperation[]): string[] {
  const edgeIds = new Set<string>();

  for (const op of operations) {
    switch (op.type) {
      case CkgOperationType.REMOVE_EDGE:
        edgeIds.add(op.edgeId);
        break;
      case CkgOperationType.SPLIT_NODE:
        for (const rule of op.edgeReassignmentRules) {
          edgeIds.add(rule.edgeId);
        }
        break;
      default:
        // Other operation types don't reference specific edge IDs
        break;
    }
  }

  return [...edgeIds];
}
