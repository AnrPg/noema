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

import type { EdgeId, MutationState, NodeId } from '@noema/types';

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

  validate(
    mutation: ICkgMutation,
    _context: IValidationContext
  ): Promise<IValidationStageResult> {
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
