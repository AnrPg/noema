/**
 * @noema/knowledge-graph-service - CKG Validation Stages
 *
 * Concrete implementations of the IValidationStage interface for the
 * 4-stage CKG mutation validation pipeline:
 *
 * Stage 1: SchemaValidation     — DSL syntax, operation types, field checks
 * Stage 2: StructuralIntegrity  — edge policies, acyclicity, orphan detection
 * Stage 3: ConflictDetection    — in-flight mutation overlap detection
 * Stage 4: EvidenceSufficiency  — promotion band threshold check
 *
 * Each stage runs independently and produces a pass/fail result with
 * detailed violations. Stages run sequentially — no point running
 * structural integrity if schema validation fails.
 */

import type { EdgeId, GraphEdgeType, MutationState, NodeId } from '@noema/types';

import type { IAggregationEvidenceRepository } from './aggregation-evidence.repository.js';
import type { IGraphRepository } from './graph.repository.js';
import type { ICkgMutation, IMutationRepository } from './mutation.repository.js';
import type {
  IValidationContext,
  IValidationStage,
  IValidationStageResult,
  IValidationViolation,
} from './validation.js';

import type { CkgMutationOperation } from './ckg-mutation-dsl.js';
import {
  CkgMutationOperationSchema,
  CkgOperationType,
  extractAffectedEdgeIds,
  extractAffectedNodeIds,
} from './ckg-mutation-dsl.js';
import { getEdgePolicy } from './policies/edge-type-policies.js';

// ============================================================================
// Stage 1: Schema Validation
// ============================================================================

/**
 * Validates mutation DSL syntax using Zod schemas.
 *
 * Checks:
 * - All operation types are recognized
 * - Required fields are present
 * - Field values are within valid ranges
 * - Node/edge types are valid enum values
 */
export class SchemaValidationStage implements IValidationStage {
  readonly name = 'schema';
  readonly order = 100;

  validate(mutation: ICkgMutation, _context: IValidationContext): Promise<IValidationStageResult> {
    const start = Date.now();
    const violations: IValidationViolation[] = [];

    const operations = mutation.operations;

    if (operations.length === 0) {
      violations.push({
        code: 'EMPTY_OPERATIONS',
        message: 'Mutation must contain at least one operation',
        severity: 'error',
        affectedOperationIndex: -1,
        metadata: {},
      });
    }

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      const result = CkgMutationOperationSchema.safeParse(op);

      if (!result.success) {
        for (const issue of result.error.issues) {
          violations.push({
            code: 'INVALID_OPERATION_SCHEMA',
            message: `Operation [${String(i)}]: ${issue.message} at ${issue.path.join('.')}`,
            severity: 'error',
            affectedOperationIndex: i,
            metadata: {
              path: issue.path,
              code: issue.code,
            },
          });
        }
      }
    }

    const duration = Date.now() - start;
    const hasErrors = violations.some((v) => v.severity === 'error');

    return Promise.resolve({
      stageName: this.name,
      passed: !hasErrors,
      details: hasErrors
        ? `Schema validation failed: ${String(violations.length)} violation(s)`
        : `Schema validation passed for ${String(operations.length)} operation(s)`,
      violations,
      duration,
    });
  }
}

// ============================================================================
// Stage 2: Structural Integrity
// ============================================================================

/**
 * Validates structural integrity of proposed mutations against the CKG.
 *
 * Checks:
 * - AddEdge: EDGE_TYPE_POLICIES compliance (node type compatibility, acyclicity)
 * - RemoveNode: orphan edge detection
 * - MergeNodes: target node existence and consistency
 * - SplitNode: valid split structure
 * - Referenced nodeIds/edgeIds exist in CKG
 */
export class StructuralIntegrityStage implements IValidationStage {
  readonly name = 'structural_integrity';
  readonly order = 200;

  constructor(private readonly graphRepository: IGraphRepository) {}

  async validate(
    mutation: ICkgMutation,
    context: IValidationContext
  ): Promise<IValidationStageResult> {
    const start = Date.now();
    const violations: IValidationViolation[] = [];
    const operations = mutation.operations as unknown as CkgMutationOperation[];

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      if (!op) continue;
      const opViolations = await this.validateOperation(op, i);
      violations.push(...opViolations);

      if (context.shortCircuitOnError && opViolations.some((v) => v.severity === 'error')) {
        break;
      }
    }

    const duration = Date.now() - start;
    const hasErrors = violations.some((v) => v.severity === 'error');

    return {
      stageName: this.name,
      passed: !hasErrors,
      details: hasErrors
        ? `Structural integrity failed: ${String(violations.length)} violation(s)`
        : `Structural integrity passed for ${String(operations.length)} operation(s)`,
      violations,
      duration,
    };
  }

  private async validateOperation(
    op: CkgMutationOperation,
    index: number
  ): Promise<IValidationViolation[]> {
    switch (op.type) {
      case CkgOperationType.ADD_EDGE:
        return this.validateAddEdge(op, index);
      case CkgOperationType.REMOVE_NODE:
        return this.validateRemoveNode(op, index);
      case CkgOperationType.UPDATE_NODE:
        return this.validateUpdateNode(op, index);
      case CkgOperationType.MERGE_NODES:
        return this.validateMergeNodes(op, index);
      case CkgOperationType.SPLIT_NODE:
        return this.validateSplitNode(op, index);
      case CkgOperationType.ADD_NODE:
      case CkgOperationType.REMOVE_EDGE:
        // AddNode has no structural preconditions beyond schema
        // RemoveEdge just needs edge existence (checked below)
        return this.validateEdgeExists(op, index);
      default:
        return [];
    }
  }

  private async validateAddEdge(
    op: Extract<CkgMutationOperation, { type: 'add_edge' }>,
    index: number
  ): Promise<IValidationViolation[]> {
    const violations: IValidationViolation[] = [];

    // Check source and target nodes exist
    const [sourceNode, targetNode] = await Promise.all([
      this.graphRepository.getNode(op.sourceNodeId as NodeId),
      this.graphRepository.getNode(op.targetNodeId as NodeId),
    ]);

    if (!sourceNode) {
      violations.push({
        code: 'SOURCE_NODE_NOT_FOUND',
        message: `Source node '${op.sourceNodeId}' does not exist in CKG`,
        severity: 'error',
        affectedOperationIndex: index,
        metadata: { nodeId: op.sourceNodeId },
      });
    }

    if (!targetNode) {
      violations.push({
        code: 'TARGET_NODE_NOT_FOUND',
        message: `Target node '${op.targetNodeId}' does not exist in CKG`,
        severity: 'error',
        affectedOperationIndex: index,
        metadata: { nodeId: op.targetNodeId },
      });
    }

    if (!sourceNode || !targetNode) {
      return violations;
    }

    // Check edge type policy
    const policy = getEdgePolicy(op.edgeType);

    // Node type compatibility
    if (!policy.allowedSourceTypes.includes(sourceNode.nodeType)) {
      violations.push({
        code: 'INVALID_SOURCE_NODE_TYPE',
        message: `Edge type '${op.edgeType}' does not allow source node type '${sourceNode.nodeType}'`,
        severity: 'error',
        affectedOperationIndex: index,
        metadata: {
          edgeType: op.edgeType,
          nodeType: sourceNode.nodeType,
          allowed: [...policy.allowedSourceTypes],
        },
      });
    }

    if (!policy.allowedTargetTypes.includes(targetNode.nodeType)) {
      violations.push({
        code: 'INVALID_TARGET_NODE_TYPE',
        message: `Edge type '${op.edgeType}' does not allow target node type '${targetNode.nodeType}'`,
        severity: 'error',
        affectedOperationIndex: index,
        metadata: {
          edgeType: op.edgeType,
          nodeType: targetNode.nodeType,
          allowed: [...policy.allowedTargetTypes],
        },
      });
    }

    // Weight validation
    if (op.weight > policy.maxWeight) {
      violations.push({
        code: 'WEIGHT_EXCEEDS_MAX',
        message: `Weight ${String(op.weight)} exceeds maximum ${String(policy.maxWeight)} for edge type '${op.edgeType}'`,
        severity: 'error',
        affectedOperationIndex: index,
        metadata: { weight: op.weight, maxWeight: policy.maxWeight },
      });
    }

    // Acyclicity check (if policy requires it)
    if (policy.requiresAcyclicity && violations.length === 0) {
      const cyclePath = await this.graphRepository.detectCycles(
        op.targetNodeId as NodeId,
        op.edgeType
      );
      if (cyclePath.length > 0) {
        violations.push({
          code: 'CYCLIC_EDGE_DETECTED',
          message: `Adding edge would create a cycle in the '${op.edgeType}' graph`,
          severity: 'error',
          affectedOperationIndex: index,
          metadata: { cyclePath },
        });
      }
    }

    return violations;
  }

  private async validateRemoveNode(
    op: Extract<CkgMutationOperation, { type: 'remove_node' }>,
    index: number
  ): Promise<IValidationViolation[]> {
    const violations: IValidationViolation[] = [];

    const node = await this.graphRepository.getNode(op.nodeId as NodeId);
    if (!node) {
      violations.push({
        code: 'NODE_NOT_FOUND',
        message: `Node '${op.nodeId}' does not exist in CKG`,
        severity: 'error',
        affectedOperationIndex: index,
        metadata: { nodeId: op.nodeId },
      });
      return violations;
    }

    // Check for orphaned edges
    const edges = await this.graphRepository.getEdgesForNode(op.nodeId as NodeId, 'both');
    if (edges.length > 0) {
      violations.push({
        code: 'ORPHAN_EDGES_DETECTED',
        message:
          `Removing node '${op.nodeId}' would orphan ${String(edges.length)} edge(s). ` +
          'Consider removing edges first or using MergeNodes.',
        severity: 'warning',
        affectedOperationIndex: index,
        metadata: {
          nodeId: op.nodeId,
          edgeCount: edges.length,
          edgeIds: edges.map((e) => e.edgeId),
        },
      });
    }

    return violations;
  }

  private async validateUpdateNode(
    op: Extract<CkgMutationOperation, { type: 'update_node' }>,
    index: number
  ): Promise<IValidationViolation[]> {
    const violations: IValidationViolation[] = [];

    const node = await this.graphRepository.getNode(op.nodeId as NodeId);
    if (!node) {
      violations.push({
        code: 'NODE_NOT_FOUND',
        message: `Node '${op.nodeId}' does not exist in CKG`,
        severity: 'error',
        affectedOperationIndex: index,
        metadata: { nodeId: op.nodeId },
      });
    }

    return violations;
  }

  private async validateMergeNodes(
    op: Extract<CkgMutationOperation, { type: 'merge_nodes' }>,
    index: number
  ): Promise<IValidationViolation[]> {
    const violations: IValidationViolation[] = [];

    const [sourceNode, targetNode] = await Promise.all([
      this.graphRepository.getNode(op.sourceNodeId as NodeId),
      this.graphRepository.getNode(op.targetNodeId as NodeId),
    ]);

    if (!sourceNode) {
      violations.push({
        code: 'SOURCE_NODE_NOT_FOUND',
        message: `Merge source node '${op.sourceNodeId}' does not exist in CKG`,
        severity: 'error',
        affectedOperationIndex: index,
        metadata: { nodeId: op.sourceNodeId },
      });
    }

    if (!targetNode) {
      violations.push({
        code: 'TARGET_NODE_NOT_FOUND',
        message: `Merge target node '${op.targetNodeId}' does not exist in CKG`,
        severity: 'error',
        affectedOperationIndex: index,
        metadata: { nodeId: op.targetNodeId },
      });
    }

    if (op.sourceNodeId === op.targetNodeId) {
      violations.push({
        code: 'SELF_MERGE',
        message: 'Cannot merge a node with itself',
        severity: 'error',
        affectedOperationIndex: index,
        metadata: { nodeId: op.sourceNodeId },
      });
    }

    return violations;
  }

  private async validateSplitNode(
    op: Extract<CkgMutationOperation, { type: 'split_node' }>,
    index: number
  ): Promise<IValidationViolation[]> {
    const violations: IValidationViolation[] = [];

    const node = await this.graphRepository.getNode(op.nodeId as NodeId);
    if (!node) {
      violations.push({
        code: 'NODE_NOT_FOUND',
        message: `Split target node '${op.nodeId}' does not exist in CKG`,
        severity: 'error',
        affectedOperationIndex: index,
        metadata: { nodeId: op.nodeId },
      });
      return violations;
    }

    // Validate edge reassignment rules reference existing edges
    const edges = await this.graphRepository.getEdgesForNode(op.nodeId as NodeId, 'both');
    const existingEdgeIds = new Set(edges.map((e) => e.edgeId as string));

    for (const rule of op.edgeReassignmentRules) {
      if (!existingEdgeIds.has(rule.edgeId)) {
        violations.push({
          code: 'EDGE_REASSIGNMENT_INVALID',
          message: `Edge '${rule.edgeId}' referenced in reassignment rules does not exist`,
          severity: 'error',
          affectedOperationIndex: index,
          metadata: { edgeId: rule.edgeId },
        });
      }
    }

    // Warn if not all edges are covered by reassignment rules
    const reassignedEdgeIds = new Set(op.edgeReassignmentRules.map((r) => r.edgeId));
    const uncoveredEdges = edges.filter((e) => !reassignedEdgeIds.has(e.edgeId as string));
    if (uncoveredEdges.length > 0) {
      violations.push({
        code: 'UNCOVERED_EDGES',
        message: `${String(uncoveredEdges.length)} edge(s) not covered by reassignment rules will be removed`,
        severity: 'warning',
        affectedOperationIndex: index,
        metadata: {
          uncoveredEdgeIds: uncoveredEdges.map((e) => e.edgeId),
        },
      });
    }

    return violations;
  }

  private async validateEdgeExists(
    op: CkgMutationOperation,
    index: number
  ): Promise<IValidationViolation[]> {
    const violations: IValidationViolation[] = [];

    if (op.type === CkgOperationType.REMOVE_EDGE) {
      const edge = await this.graphRepository.getEdge(op.edgeId as unknown as EdgeId);
      if (!edge) {
        violations.push({
          code: 'EDGE_NOT_FOUND',
          message: `Edge '${op.edgeId}' does not exist in CKG`,
          severity: 'error',
          affectedOperationIndex: index,
          metadata: { edgeId: op.edgeId },
        });
      }
    }

    return violations;
  }
}

// ============================================================================
// Stage 3: Conflict Detection
// ============================================================================

/**
 * Detects conflicts with other in-flight mutations.
 *
 * Checks for VALIDATING/VALIDATED/PROVING/PROVEN mutations that touch
 * overlapping nodeIds/edgeIds. Conflicts are flagged as warnings —
 * they don't automatically cause rejection, but the proposing agent
 * should be aware and may need to retry.
 */
export class ConflictDetectionStage implements IValidationStage {
  readonly name = 'conflict_detection';
  readonly order = 300;

  constructor(private readonly mutationRepository: IMutationRepository) {}

  async validate(
    mutation: ICkgMutation,
    _context: IValidationContext
  ): Promise<IValidationStageResult> {
    const start = Date.now();
    const violations: IValidationViolation[] = [];
    const operations = mutation.operations as unknown as CkgMutationOperation[];

    // Extract node/edge IDs affected by this mutation
    const myNodeIds = new Set(extractAffectedNodeIds(operations));
    const myEdgeIds = new Set(extractAffectedEdgeIds(operations));

    // Query for in-flight mutations in competing states
    const competingStates: MutationState[] = ['validating', 'validated', 'proving', 'proven'];

    for (const state of competingStates) {
      const competing = await this.mutationRepository.findMutationsByState(state);

      for (const other of competing) {
        if (other.mutationId === mutation.mutationId) continue;

        const otherOps = other.operations as unknown as CkgMutationOperation[];
        const otherNodeIds = new Set(extractAffectedNodeIds(otherOps));
        const otherEdgeIds = new Set(extractAffectedEdgeIds(otherOps));

        // Check node overlap
        const overlappingNodes = [...myNodeIds].filter((id) => otherNodeIds.has(id));
        const overlappingEdges = [...myEdgeIds].filter((id) => otherEdgeIds.has(id));

        if (overlappingNodes.length > 0 || overlappingEdges.length > 0) {
          violations.push({
            code: 'CONCURRENT_MUTATION_CONFLICT',
            message:
              `Mutation '${other.mutationId}' (state: ${other.state}) ` +
              `touches overlapping entities: ` +
              `${String(overlappingNodes.length)} node(s), ${String(overlappingEdges.length)} edge(s)`,
            severity: 'warning',
            affectedOperationIndex: -1,
            metadata: {
              conflictingMutationId: other.mutationId,
              conflictingState: other.state,
              overlappingNodeIds: overlappingNodes,
              overlappingEdgeIds: overlappingEdges,
            },
          });
        }
      }
    }

    const duration = Date.now() - start;

    return {
      stageName: this.name,
      passed: true, // Conflicts are warnings, not errors
      details:
        violations.length > 0
          ? `${String(violations.length)} conflict(s) detected with in-flight mutations`
          : 'No conflicts with in-flight mutations',
      violations,
      duration,
    };
  }
}

// ============================================================================
// Stage 4: Evidence Sufficiency
// ============================================================================

/**
 * Checks that aggregation-originated mutations have sufficient evidence.
 *
 * The PromotionBand determines the threshold:
 * - weak: 3+ independent PKGs
 * - moderate: 10+ PKGs
 * - strong: 25+ PKGs
 * - definitive: 50+ PKGs
 *
 * Agent-initiated mutations (evidenceCount === 0) bypass this stage.
 */
export class EvidenceSufficiencyStage implements IValidationStage {
  readonly name = 'evidence_sufficiency';
  readonly order = 400;

  /**
   * Minimum required promotion band for aggregation-originated mutations.
   * Mutations must meet at least the 'weak' threshold (3+ PKGs).
   */
  private readonly minimumBand: string = 'weak';
  private readonly minimumThreshold: number = 3;

  constructor(private readonly aggregationEvidenceRepository: IAggregationEvidenceRepository) {}

  async validate(
    mutation: ICkgMutation,
    _context: IValidationContext
  ): Promise<IValidationStageResult> {
    const start = Date.now();
    const violations: IValidationViolation[] = [];

    // Agent-initiated mutations (no evidence) bypass this stage
    if (mutation.evidenceCount === 0) {
      return {
        stageName: this.name,
        passed: true,
        details: 'Evidence sufficiency skipped: agent-initiated mutation (no aggregation evidence)',
        violations: [],
        duration: Date.now() - start,
      };
    }

    // Check evidence count against minimum threshold
    if (mutation.evidenceCount < this.minimumThreshold) {
      violations.push({
        code: 'INSUFFICIENT_EVIDENCE',
        message:
          `Mutation requires at least ${String(this.minimumThreshold)} independent PKG evidence ` +
          `signals (${this.minimumBand} band), but only has ${String(mutation.evidenceCount)}`,
        severity: 'error',
        affectedOperationIndex: -1,
        metadata: {
          evidenceCount: mutation.evidenceCount,
          requiredCount: this.minimumThreshold,
          requiredBand: this.minimumBand,
        },
      });
    }

    // For mutations with CKG target nodes, verify evidence in repository
    const operations = mutation.operations as unknown as CkgMutationOperation[];
    const nodeIds = extractAffectedNodeIds(operations);

    for (const nodeId of nodeIds) {
      try {
        const summary = await this.aggregationEvidenceRepository.getEvidenceSummary(
          nodeId as NodeId
        );
        if (summary.contributingUserCount < this.minimumThreshold) {
          violations.push({
            code: 'INSUFFICIENT_USER_EVIDENCE',
            message:
              `Node '${nodeId}' has evidence from only ${String(summary.contributingUserCount)} ` +
              `user(s), requires at least ${String(this.minimumThreshold)}`,
            severity: 'warning',
            affectedOperationIndex: -1,
            metadata: {
              nodeId,
              contributingUsers: summary.contributingUserCount,
              requiredUsers: this.minimumThreshold,
              achievedBand: summary.achievedBand,
            },
          });
        }
      } catch {
        // If evidence lookup fails, it's not a blocking error
        violations.push({
          code: 'EVIDENCE_LOOKUP_FAILED',
          message: `Could not verify evidence for node '${nodeId}'`,
          severity: 'warning',
          affectedOperationIndex: -1,
          metadata: { nodeId },
        });
      }
    }

    const duration = Date.now() - start;
    const hasErrors = violations.some((v) => v.severity === 'error');

    return {
      stageName: this.name,
      passed: !hasErrors,
      details: hasErrors
        ? `Evidence sufficiency failed: insufficient evidence for promotion`
        : `Evidence sufficiency passed (${String(mutation.evidenceCount)} evidence signals)`,
      violations,
      duration,
    };
  }
}

// ============================================================================
// Stage 2.5: Ontological Consistency (Phase 8e)
// ============================================================================

/**
 * An ontological conflict pair definition.
 *
 * When a mutation proposes an edge of type `edgeTypeA` between two nodes,
 * and an edge of type `edgeTypeB` already exists between the same node pair
 * (in either direction), this constitutes an ontological conflict.
 */
interface IOntologicalConflictPair {
  /** The first edge type in the conflict */
  readonly edgeTypeA: GraphEdgeType;
  /** The second (conflicting) edge type */
  readonly edgeTypeB: GraphEdgeType;
  /** Human-readable explanation of why these conflict */
  readonly reason: string;
}

/**
 * Data-driven table of the 10 ontological conflict pairs.
 *
 * These represent fundamental ontological incompatibilities: if A IS_A B,
 * then A cannot simultaneously be PART_OF B (you classify OR compose,
 * not both for the same pair). The table is frozen and order-insensitive.
 */
const ONTOLOGICAL_CONFLICT_PAIRS: readonly IOntologicalConflictPair[] = Object.freeze([
  // 1. Taxonomic vs Mereological
  {
    edgeTypeA: 'is_a' as GraphEdgeType,
    edgeTypeB: 'part_of' as GraphEdgeType,
    reason:
      'Taxonomic subsumption (IS_A) and mereological composition (PART_OF) are incompatible: classify OR compose, not both',
  },
  // 2. Taxonomic vs Constitution
  {
    edgeTypeA: 'is_a' as GraphEdgeType,
    edgeTypeB: 'constituted_by' as GraphEdgeType,
    reason:
      'Taxonomic subsumption (IS_A) and material constitution (CONSTITUTED_BY) are incompatible: a kind-of relation cannot also be a constitution relation',
  },
  // 3. Equivalence vs Taxonomy
  {
    edgeTypeA: 'equivalent_to' as GraphEdgeType,
    edgeTypeB: 'is_a' as GraphEdgeType,
    reason:
      'Equivalence (EQUIVALENT_TO) and subsumption (IS_A) are incompatible: if A ≡ B, then A cannot also be a subtype of B',
  },
  // 4. Equivalence vs Disjointness
  {
    edgeTypeA: 'equivalent_to' as GraphEdgeType,
    edgeTypeB: 'disjoint_with' as GraphEdgeType,
    reason:
      'Equivalence (EQUIVALENT_TO) and disjointness (DISJOINT_WITH) are contradictory: A cannot be both equivalent to and disjoint from B',
  },
  // 5. Entailment vs Contradiction
  {
    edgeTypeA: 'entails' as GraphEdgeType,
    edgeTypeB: 'contradicts' as GraphEdgeType,
    reason:
      'Entailment (ENTAILS) and contradiction (CONTRADICTS) are incompatible: A cannot both necessarily imply and contradict B',
  },
  // 6. Causes vs Precedes (strict reading)
  {
    edgeTypeA: 'causes' as GraphEdgeType,
    edgeTypeB: 'precedes' as GraphEdgeType,
    reason:
      'Causal dependence (CAUSES) subsumes temporal precedence (PRECEDES): use CAUSES when the relationship is causal, not both',
  },
  // 7. Prerequisite vs Derived-from
  {
    edgeTypeA: 'prerequisite' as GraphEdgeType,
    edgeTypeB: 'derived_from' as GraphEdgeType,
    reason:
      'Learning prerequisite (PREREQUISITE) and derivation (DERIVED_FROM) conflate pedagogical and logical dependency: choose one',
  },
  // 8. Disjoint vs Part-of
  {
    edgeTypeA: 'disjoint_with' as GraphEdgeType,
    edgeTypeB: 'part_of' as GraphEdgeType,
    reason:
      'Disjointness (DISJOINT_WITH) and composition (PART_OF) are incompatible: mutually exclusive concepts cannot be in a part-whole relation',
  },
  // 9. Contradicts vs Analogous-to
  {
    edgeTypeA: 'contradicts' as GraphEdgeType,
    edgeTypeB: 'analogous_to' as GraphEdgeType,
    reason:
      'Contradiction (CONTRADICTS) and analogy (ANALOGOUS_TO) are incompatible: contradictory concepts cannot be analogous',
  },
  // 10. Equivalent-to vs Contrasts-with
  {
    edgeTypeA: 'equivalent_to' as GraphEdgeType,
    edgeTypeB: 'contrasts_with' as GraphEdgeType,
    reason:
      'Equivalence (EQUIVALENT_TO) and contrast (CONTRASTS_WITH) are incompatible: equivalent concepts cannot be in opposition',
  },
]);

/**
 * Validates ontological consistency of proposed edge additions.
 *
 * Runs between StructuralIntegrity (200) and ConflictDetection (300).
 * For each ADD_EDGE operation, checks:
 *
 * 1. **Intra-mutation conflicts**: other ADD_EDGE ops in the same batch
 *    that would create a conflicting pair on the same node pair.
 * 2. **Graph conflicts**: existing edges in the CKG graph that would
 *    conflict with the proposed edge type.
 *
 * Violations use severity `'error'` with code `ONTOLOGICAL_CONFLICT`
 * to trigger the escalation mechanism in the mutation pipeline
 * (VALIDATING → PENDING_REVIEW instead of VALIDATING → REJECTED).
 *
 * @remarks Order 250 — runs after structural integrity confirms nodes
 * exist and edge policies are met, but before conflict detection scans
 * for in-flight mutation overlaps.
 */
export class OntologicalConsistencyStage implements IValidationStage {
  readonly name = 'ontological_consistency';
  readonly order = 250;

  constructor(private readonly graphRepository: IGraphRepository) {}

  async validate(
    mutation: ICkgMutation,
    context: IValidationContext
  ): Promise<IValidationStageResult> {
    const start = Date.now();
    const violations: IValidationViolation[] = [];
    const operations = mutation.operations as unknown as CkgMutationOperation[];

    // Collect all ADD_EDGE operations with their indices
    const addEdgeOps: Array<{
      op: Extract<CkgMutationOperation, { type: 'add_edge' }>;
      index: number;
    }> = [];

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      if (op?.type === CkgOperationType.ADD_EDGE) {
        addEdgeOps.push({
          op: op as Extract<CkgMutationOperation, { type: 'add_edge' }>,
          index: i,
        });
      }
    }

    // No add_edge operations → nothing to check
    if (addEdgeOps.length === 0) {
      return {
        stageName: this.name,
        passed: true,
        details: 'Ontological consistency skipped: no add_edge operations',
        violations: [],
        duration: Date.now() - start,
      };
    }

    // Phase 1: Intra-mutation conflict scan
    for (let i = 0; i < addEdgeOps.length; i++) {
      for (let j = i + 1; j < addEdgeOps.length; j++) {
        const opA = addEdgeOps[i];
        const opB = addEdgeOps[j];
        if (!opA || !opB) continue;

        // Check if they operate on the same node pair (direction-agnostic)
        if (this.isSameNodePair(opA.op, opB.op)) {
          const conflict = this.findConflict(opA.op.edgeType, opB.op.edgeType);
          if (conflict) {
            violations.push({
              code: 'ONTOLOGICAL_CONFLICT',
              message:
                `Intra-mutation ontological conflict: operations [${String(opA.index)}] (${opA.op.edgeType}) ` +
                `and [${String(opB.index)}] (${opB.op.edgeType}) on node pair ` +
                `(${opA.op.sourceNodeId}, ${opA.op.targetNodeId}). ${conflict.reason}`,
              severity: 'error',
              affectedOperationIndex: opA.index,
              metadata: {
                conflictType: 'intra_mutation',
                proposedEdgeType: opA.op.edgeType,
                conflictingEdgeType: opB.op.edgeType,
                sourceNodeId: opA.op.sourceNodeId,
                targetNodeId: opA.op.targetNodeId,
                conflictingOperationIndex: opB.index,
                reason: conflict.reason,
              },
            });
          }
        }
      }
    }

    // Phase 2: Graph conflict scan (existing edges in CKG)
    for (const { op, index } of addEdgeOps) {
      const conflictingTypes = this.getConflictingEdgeTypes(op.edgeType);
      if (conflictingTypes.length === 0) continue;

      const existingEdges = await this.graphRepository.findConflictingEdges(
        op.sourceNodeId as NodeId,
        op.targetNodeId as NodeId,
        conflictingTypes
      );

      for (const existing of existingEdges) {
        const conflict = this.findConflict(op.edgeType, existing.edgeType);
        if (conflict) {
          violations.push({
            code: 'ONTOLOGICAL_CONFLICT',
            message:
              `Graph ontological conflict: operation [${String(index)}] proposes ${op.edgeType} ` +
              `but ${existing.edgeType} already exists between ` +
              `(${op.sourceNodeId}, ${op.targetNodeId}). ${conflict.reason}`,
            severity: 'error',
            affectedOperationIndex: index,
            metadata: {
              conflictType: 'graph_existing',
              proposedEdgeType: op.edgeType,
              conflictingEdgeType: existing.edgeType,
              existingEdgeId: existing.edgeId,
              sourceNodeId: op.sourceNodeId,
              targetNodeId: op.targetNodeId,
              reason: conflict.reason,
            },
          });
        }
      }

      if (context.shortCircuitOnError && violations.some((v) => v.severity === 'error')) {
        break;
      }
    }

    const duration = Date.now() - start;
    const hasErrors = violations.some((v) => v.severity === 'error');

    return {
      stageName: this.name,
      passed: !hasErrors,
      details: hasErrors
        ? `Ontological consistency failed: ${String(violations.length)} conflict(s) detected`
        : `Ontological consistency passed for ${String(addEdgeOps.length)} add_edge operation(s)`,
      violations,
      duration,
    };
  }

  /**
   * Check if two ADD_EDGE operations target the same node pair
   * (direction-agnostic).
   */
  private isSameNodePair(
    a: Extract<CkgMutationOperation, { type: 'add_edge' }>,
    b: Extract<CkgMutationOperation, { type: 'add_edge' }>
  ): boolean {
    return (
      (a.sourceNodeId === b.sourceNodeId && a.targetNodeId === b.targetNodeId) ||
      (a.sourceNodeId === b.targetNodeId && a.targetNodeId === b.sourceNodeId)
    );
  }

  /**
   * Look up conflict between two edge types in the ONTOLOGICAL_CONFLICT_PAIRS table.
   * Order-insensitive: checks both (A,B) and (B,A).
   */
  private findConflict(
    typeA: GraphEdgeType,
    typeB: GraphEdgeType
  ): IOntologicalConflictPair | undefined {
    return ONTOLOGICAL_CONFLICT_PAIRS.find(
      (pair) =>
        (pair.edgeTypeA === typeA && pair.edgeTypeB === typeB) ||
        (pair.edgeTypeA === typeB && pair.edgeTypeB === typeA)
    );
  }

  /**
   * For a given edge type, return the set of edge types that would
   * conflict with it according to the conflict pairs table.
   */
  private getConflictingEdgeTypes(edgeType: GraphEdgeType): GraphEdgeType[] {
    const conflicting: GraphEdgeType[] = [];
    for (const pair of ONTOLOGICAL_CONFLICT_PAIRS) {
      if (pair.edgeTypeA === edgeType) {
        conflicting.push(pair.edgeTypeB);
      } else if (pair.edgeTypeB === edgeType) {
        conflicting.push(pair.edgeTypeA);
      }
    }
    return conflicting;
  }
}

// ============================================================================
// Standalone Helpers (Phase 8e — PKG Advisory Mode)
// ============================================================================

/**
 * For a given edge type, return the set of edge types that would conflict
 * with it according to the ontological conflict pairs table.
 *
 * Used by the PKG advisory check in `KnowledgeGraphService.createEdge()` to
 * produce non-blocking warnings without running the full CKG validation pipeline.
 */
export function getConflictingEdgeTypesForAdvisory(edgeType: GraphEdgeType): GraphEdgeType[] {
  const conflicting: GraphEdgeType[] = [];
  for (const pair of ONTOLOGICAL_CONFLICT_PAIRS) {
    if (pair.edgeTypeA === edgeType) {
      conflicting.push(pair.edgeTypeB);
    } else if (pair.edgeTypeB === edgeType) {
      conflicting.push(pair.edgeTypeA);
    }
  }
  return conflicting;
}
