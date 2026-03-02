/**
 * @noema/knowledge-graph-service - CKG Mutation Pipeline
 *
 * Orchestrates the full lifecycle of CKG mutations:
 *   propose → validate → prove (pass-through) → commit
 *
 * This is the primary composed class that the KnowledgeGraphService
 * delegates to for all CKG mutation operations (D2: separate pipeline).
 *
 * Architecture:
 * - Constructor DI: receives all repositories + validation pipeline
 * - State transitions use the typestate machine with audit logging
 * - Validation runs asynchronously (D3: hybrid fire-and-forget + events)
 * - PROVING/PROVEN auto-transition (D1: 8-state, Phase 6 pass-through)
 * - Commit protocol: Neo4j transaction → Postgres state update → events
 */

import type { Logger } from 'pino';
import { z } from 'zod';

import type {
  AgentId,
  EdgeId,
  EdgeWeight,
  GraphType,
  IGraphEdge,
  IGraphNode,
  Metadata,
  MutationId,
  MutationState,
  NodeId,
  ProposerId,
} from '@noema/types';

import type { IEventPublisher, IEventToPublish } from '../shared/event-publisher.js';
import type { IExecutionContext } from './execution-context.js';
import type { IGraphRepository, IUpdateNodeInput } from './graph.repository.js';
import type {
  ICkgMutation,
  ICreateMutationInput,
  IMutationAuditEntry,
  IMutationRepository,
} from './mutation.repository.js';
import type { IValidationPipeline, IValidationResult, IValidationViolation } from './validation.js';

import {
  type CkgMutationOperation,
  CkgMutationOperationSchema,
  CkgOperationType,
  extractAffectedEdgeIds,
  extractAffectedNodeIds,
} from './ckg-mutation-dsl.js';
import {
  CANCELLABLE_STATES,
  isTerminalState,
  isValidTransition,
  STATE_TRANSITIONS,
} from './ckg-typestate.js';
import { KnowledgeGraphEventType } from './domain-events.js';
import {
  InvalidStateTransitionError,
  MutationAlreadyCommittedError,
  MutationNotFoundError,
} from './errors/index.js';

// ============================================================================
// Helpers
// ============================================================================

const CkgMutationOperationsSchema = z.array(CkgMutationOperationSchema);

/**
 * Safely parse mutation operations from their DB-serialized form (Metadata[])
 * into typed CkgMutationOperation[]. Throws a ZodError if the data is
 * malformed, which the caller should handle or let propagate.
 */
function parseOperations(raw: unknown): CkgMutationOperation[] {
  return CkgMutationOperationsSchema.parse(raw) as CkgMutationOperation[];
}

/**
 * Convert operations to a serializable form suitable for event payloads.
 * Explicitly picks only the fields that are safe to serialize (C3/H5 fix).
 */
function toSerializableOperations(operations: CkgMutationOperation[]): Metadata[] {
  return operations.map((op) => {
    const base: Record<string, unknown> = { type: op.type };
    if ('nodeId' in op) base['nodeId'] = op.nodeId;
    if ('edgeId' in op) base['edgeId'] = op.edgeId;
    if ('label' in op) base['label'] = op.label;
    if ('nodeType' in op) base['nodeType'] = op.nodeType;
    if ('domain' in op) base['domain'] = op.domain;
    if ('edgeType' in op) base['edgeType'] = op.edgeType;
    if ('sourceNodeId' in op) base['sourceNodeId'] = op.sourceNodeId;
    if ('targetNodeId' in op) base['targetNodeId'] = op.targetNodeId;
    if ('weight' in op) base['weight'] = op.weight;
    if ('properties' in op) base['properties'] = op.properties;
    if ('description' in op) base['description'] = op.description;
    if ('mergedNodeIds' in op) base['mergedNodeIds'] = op.mergedNodeIds;
    if ('mergedLabel' in op) base['mergedLabel'] = op.mergedLabel;
    if ('splitLabels' in op) base['splitLabels'] = op.splitLabels;
    return base as Metadata;
  });
}

// ============================================================================
// CkgMutationPipeline
// ============================================================================

/**
 * Orchestrates the CKG mutation lifecycle.
 *
 * Created once and injected into KnowledgeGraphService via constructor DI.
 * All methods are stateless — they operate on mutation records from the
 * repository and use the typestate machine for transition enforcement.
 */
export class CkgMutationPipeline {
  constructor(
    private readonly mutationRepository: IMutationRepository,
    private readonly graphRepository: IGraphRepository,
    private readonly validationPipeline: IValidationPipeline,
    private readonly eventPublisher: IEventPublisher,
    private readonly logger: Logger
  ) {}

  // ==========================================================================
  // Public API — called by KnowledgeGraphService
  // ==========================================================================

  /**
   * Propose a new CKG mutation.
   *
   * Creates the mutation in PROPOSED state, publishes CkgMutationProposed
   * event, and fires off async validation (D3: hybrid approach).
   *
   * @param proposerId The agent or admin user proposing the mutation.
   * @param operations The mutation DSL operations.
   * @param rationale Human-readable justification.
   * @param evidenceCount Number of supporting evidence items (0 = agent-initiated).
   * @param priority Processing priority (higher = sooner).
   * @param context Execution context for correlation/auth.
   * @returns The created mutation.
   */
  async proposeMutation(
    proposerId: ProposerId,
    operations: CkgMutationOperation[],
    rationale: string,
    evidenceCount: number,
    priority: number,
    context: IExecutionContext
  ): Promise<ICkgMutation> {
    this.logger.info(
      { proposerId, operationCount: operations.length, evidenceCount },
      'Proposing CKG mutation'
    );

    // Create mutation in PROPOSED state
    const input: ICreateMutationInput = {
      proposedBy: proposerId,
      operations: toSerializableOperations(operations),
      rationale,
      evidenceCount,
    };

    const mutation = await this.mutationRepository.createMutation(input);

    // Audit log: initial creation
    await this.mutationRepository.appendAuditEntry({
      mutationId: mutation.mutationId,
      fromState: 'proposed' as MutationState,
      toState: 'proposed' as MutationState,
      performedBy: proposerId as string,
      context: {
        action: 'created',
        operationCount: operations.length,
        evidenceCount,
        priority,
      },
    });

    // Publish CkgMutationProposed event (D3: event audit trail)
    await this.publishEvent(
      KnowledgeGraphEventType.CKG_MUTATION_PROPOSED,
      'CanonicalKnowledgeGraph',
      mutation.mutationId,
      {
        mutationId: mutation.mutationId,
        proposedBy: proposerId,
        operations: toSerializableOperations(operations),
        rationale,
        evidenceCount,
      },
      context
    );

    // Fire async validation (D3: fire-and-forget in-process)
    void this.runPipelineAsync(mutation.mutationId, context);

    return mutation;
  }

  /**
   * Get a mutation by ID.
   */
  async getMutation(mutationId: MutationId): Promise<ICkgMutation> {
    const mutation = await this.mutationRepository.getMutation(mutationId);
    if (!mutation) {
      throw new MutationNotFoundError(mutationId);
    }
    return mutation;
  }

  /**
   * List mutations by state and/or proposer.
   */
  async listMutations(filters: {
    state?: MutationState;
    proposedBy?: ProposerId;
    createdAfter?: string;
    createdBefore?: string;
  }): Promise<ICkgMutation[]> {
    // Use the composite findMutations method when any filter is present
    const hasFilters =
      filters.state !== undefined ||
      filters.proposedBy !== undefined ||
      filters.createdAfter !== undefined ||
      filters.createdBefore !== undefined;

    if (hasFilters) {
      return this.mutationRepository.findMutations(filters);
    }

    // No filters — return all (via all non-terminal states)
    const states: MutationState[] = [
      'proposed',
      'validating',
      'validated',
      'pending_review',
      'proving',
      'proven',
      'committing',
      'committed',
      'rejected',
    ];
    const results: ICkgMutation[] = [];
    for (const state of states) {
      const batch = await this.mutationRepository.findMutationsByState(state);
      results.push(...batch);
    }
    return results;
  }

  /**
   * Cancel a mutation (only allowed for PROPOSED or VALIDATING).
   * Transitions to REJECTED with reason "cancelled by proposer."
   */
  async cancelMutation(mutationId: MutationId, context: IExecutionContext): Promise<ICkgMutation> {
    const mutation = await this.getMutation(mutationId);

    if (isTerminalState(mutation.state)) {
      throw new MutationAlreadyCommittedError(mutationId, mutation.state);
    }

    if (!CANCELLABLE_STATES.has(mutation.state)) {
      throw new InvalidStateTransitionError(mutation.state, 'rejected', [
        ...STATE_TRANSITIONS[mutation.state],
      ]);
    }

    return this.transitionState(
      mutation,
      'rejected',
      (context.userId as string | undefined) ?? 'system',
      'Cancelled by proposer',
      context
    );
  }

  /**
   * Retry a rejected mutation — creates a NEW mutation with the same
   * operations. The original stays REJECTED for audit.
   */
  async retryMutation(mutationId: MutationId, context: IExecutionContext): Promise<ICkgMutation> {
    const original = await this.getMutation(mutationId);

    if (original.state !== 'rejected') {
      throw new InvalidStateTransitionError(original.state, 'proposed', [
        'Only REJECTED mutations can be retried',
      ]);
    }

    this.logger.info({ originalMutationId: mutationId }, 'Retrying rejected mutation with new ID');

    // Create new mutation with same operations
    return this.proposeMutation(
      original.proposedBy,
      parseOperations(original.operations),
      `Retry of ${mutationId}: ${original.rationale}`,
      original.evidenceCount,
      0,
      context
    );
  }

  /**
   * Get the full audit log for a mutation.
   */
  async getAuditLog(mutationId: MutationId): Promise<IMutationAuditEntry[]> {
    // Validate mutation exists
    await this.getMutation(mutationId);
    return this.mutationRepository.getAuditLog(mutationId);
  }

  /**
   * Approve an escalated mutation (PENDING_REVIEW → VALIDATED).
   *
   * When a mutation is in PENDING_REVIEW due to ontological conflicts,
   * an admin or governance agent can approve it, overriding the conflicts.
   * The mutation then continues through the normal pipeline (prove → commit).
   *
   * @param mutationId The escalated mutation to approve.
   * @param reviewerId Who is approving (admin user or governance agent).
   * @param reason Justification for overriding the ontological conflicts.
   * @param context Execution context.
   * @returns The mutation transitioned to VALIDATED state.
   */
  async approveMutation(
    mutationId: MutationId,
    reviewerId: string,
    reason: string,
    context: IExecutionContext
  ): Promise<ICkgMutation> {
    const mutation = await this.getMutation(mutationId);

    if (mutation.state !== 'pending_review') {
      throw new InvalidStateTransitionError(mutation.state, 'validated', [
        'Only PENDING_REVIEW mutations can be approved',
      ]);
    }

    this.logger.info(
      { mutationId, reviewerId },
      'Approving escalated mutation — overriding ontological conflicts'
    );

    // PENDING_REVIEW → VALIDATED
    const updated = await this.transitionState(
      mutation,
      'validated',
      reviewerId,
      `Ontological conflicts overridden by reviewer: ${reason}`,
      context,
      { reviewAction: 'approved', reviewerId, reviewReason: reason }
    );

    // Publish CkgMutationValidated event
    await this.publishEvent(
      KnowledgeGraphEventType.CKG_MUTATION_VALIDATED,
      'CanonicalKnowledgeGraph',
      mutation.mutationId,
      {
        mutationId: mutation.mutationId,
        validationResults: { overriddenByReview: true, reviewerId, reason },
      },
      context
    );

    // Continue the pipeline asynchronously: prove → commit
    void this.runPostReviewPipeline(updated.mutationId, context);

    return updated;
  }

  /**
   * Reject an escalated mutation (PENDING_REVIEW → REJECTED).
   *
   * When a mutation is in PENDING_REVIEW, an admin or governance agent
   * can reject it, confirming the ontological conflicts are real.
   *
   * @param mutationId The escalated mutation to reject.
   * @param reviewerId Who is rejecting.
   * @param reason Justification for the rejection.
   * @param context Execution context.
   * @returns The mutation transitioned to REJECTED state.
   */
  async rejectEscalatedMutation(
    mutationId: MutationId,
    reviewerId: string,
    reason: string,
    context: IExecutionContext
  ): Promise<ICkgMutation> {
    const mutation = await this.getMutation(mutationId);

    if (mutation.state !== 'pending_review') {
      throw new InvalidStateTransitionError(mutation.state, 'rejected', [
        'Only PENDING_REVIEW mutations can be rejected via review',
      ]);
    }

    this.logger.info(
      { mutationId, reviewerId },
      'Rejecting escalated mutation — ontological conflicts confirmed'
    );

    // PENDING_REVIEW → REJECTED
    const updated = await this.transitionState(
      mutation,
      'rejected',
      reviewerId,
      `Ontological conflicts confirmed by reviewer: ${reason}`,
      context,
      { reviewAction: 'rejected', reviewerId, reviewReason: reason }
    );

    // Publish CkgMutationRejected event
    await this.publishEvent(
      KnowledgeGraphEventType.CKG_MUTATION_REJECTED,
      'CanonicalKnowledgeGraph',
      mutation.mutationId,
      {
        mutationId: mutation.mutationId,
        reason: `Ontological conflicts confirmed by reviewer: ${reason}`,
        failedStage: 'pending_review' as MutationState,
        rejectedBy: reviewerId,
      },
      context
    );

    return updated;
  }

  /**
   * Record aggregation evidence and optionally create a mutation proposal.
   * This is the "intake" of the PKG→CKG aggregation pipeline.
   */
  async proposeFromAggregation(
    operations: CkgMutationOperation[],
    rationale: string,
    evidenceCount: number,
    context: IExecutionContext
  ): Promise<ICkgMutation> {
    this.logger.info(
      { operationCount: operations.length, evidenceCount },
      'Proposing aggregation-initiated CKG mutation'
    );

    // Use a system agent ID for aggregation-initiated mutations
    const agentId = 'agent_aggregation-pipeline' as AgentId;

    return this.proposeMutation(
      agentId,
      operations,
      rationale,
      evidenceCount,
      10, // Aggregation mutations get higher default priority
      context
    );
  }

  /**
   * Get pipeline health metrics (for agent hints and monitoring).
   */
  async getPipelineHealth(): Promise<{
    proposedCount: number;
    validatingCount: number;
    validatedCount: number;
    pendingReviewCount: number;
    committedCount: number;
    rejectedCount: number;
    stuckCount: number;
  }> {
    const [proposed, validating, validated, pendingReview, committed, rejected] = await Promise.all(
      [
        this.mutationRepository.countMutationsByState('proposed'),
        this.mutationRepository.countMutationsByState('validating'),
        this.mutationRepository.countMutationsByState('validated'),
        this.mutationRepository.countMutationsByState('pending_review'),
        this.mutationRepository.countMutationsByState('committed'),
        this.mutationRepository.countMutationsByState('rejected'),
      ]
    );

    // "Stuck" = in non-terminal non-proposed state (could indicate processing failure)
    const proving = await this.mutationRepository.countMutationsByState('proving');
    const proven = await this.mutationRepository.countMutationsByState('proven');
    const committing = await this.mutationRepository.countMutationsByState('committing');
    const stuckCount = validating + proving + proven + committing;

    return {
      proposedCount: proposed,
      validatingCount: validating,
      validatedCount: validated,
      pendingReviewCount: pendingReview,
      committedCount: committed,
      rejectedCount: rejected,
      stuckCount,
    };
  }

  // ==========================================================================
  // Pipeline Processing (Async)
  // ==========================================================================

  /**
   * Run the full pipeline for a mutation asynchronously.
   *
   * This method is called fire-and-forget from proposeMutation.
   * It can also be called directly in tests for synchronous execution.
   */
  async runPipelineAsync(mutationId: MutationId, context: IExecutionContext): Promise<void> {
    try {
      await this.runPipeline(mutationId, context);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ mutationId, error: message }, 'Pipeline processing failed');
      // Pipeline errors should not propagate — they're recorded as REJECTED state
    }
  }

  /**
   * Run the full mutation pipeline: validate → prove → commit.
   *
   * Each stage transitions the mutation state with audit logging.
   * If any stage fails, the mutation transitions to REJECTED.
   * If ontological conflicts are detected, the mutation is escalated to PENDING_REVIEW.
   */
  private async runPipeline(mutationId: MutationId, context: IExecutionContext): Promise<void> {
    // Stage 1: PROPOSED → VALIDATING → run validation → VALIDATED/PENDING_REVIEW/REJECTED
    let mutation = await this.getMutation(mutationId);
    mutation = await this.runValidationStage(mutation, context);

    if (mutation.state === 'rejected' || mutation.state === 'pending_review') return;

    // Stage 2: VALIDATED → PROVING → PROVEN (pass-through for Phase 6)
    mutation = await this.runProofStage(mutation, context);

    if (mutation.state === 'rejected') return;

    // Stage 3: PROVEN → COMMITTING → COMMITTED/REJECTED
    await this.runCommitStage(mutation, context);
  }

  /**
   * Resume the pipeline after a PENDING_REVIEW mutation is approved.
   *
   * Picks up from VALIDATED state (post-approval) and runs prove → commit.
   * Called fire-and-forget from approveMutation().
   */
  private async runPostReviewPipeline(
    mutationId: MutationId,
    context: IExecutionContext
  ): Promise<void> {
    try {
      let mutation = await this.getMutation(mutationId);

      // Stage 2: VALIDATED → PROVING → PROVEN
      mutation = await this.runProofStage(mutation, context);
      if (mutation.state === 'rejected') return;

      // Stage 3: PROVEN → COMMITTING → COMMITTED/REJECTED
      await this.runCommitStage(mutation, context);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ mutationId, error: message }, 'Post-review pipeline processing failed');
    }
  }

  // ==========================================================================
  // Pipeline Stages
  // ==========================================================================

  /**
   * Validation stage: PROPOSED → VALIDATING → VALIDATED, PENDING_REVIEW, or REJECTED.
   *
   * Three possible outcomes:
   * 1. Passed, no ontological conflicts → VALIDATED (continue pipeline)
   * 2. Passed but has ontological conflicts → PENDING_REVIEW (escalate for review)
   * 3. Failed → REJECTED
   */
  private async runValidationStage(
    mutation: ICkgMutation,
    context: IExecutionContext
  ): Promise<ICkgMutation> {
    // PROPOSED → VALIDATING
    mutation = await this.transitionState(
      mutation,
      'validating',
      'system',
      'Starting validation pipeline',
      context
    );

    // Run the validation pipeline (now includes OntologicalConsistencyStage at order 250)
    const validationResult = await this.validationPipeline.validate(mutation, {
      correlationId: context.correlationId as string,
      shortCircuitOnError: true,
    });

    if (validationResult.passed) {
      // Check for ontological conflict violations that require escalation.
      // The OntologicalConsistencyStage marks violations as errors with code
      // ONTOLOGICAL_CONFLICT. If validation "passed" but we have these violations
      // in a stage that didn't block (because it was already collected), we escalate.
      // However, the standard flow is: if ontological stage fails, passed=false.
      // So we check the stageResults directly for the ontological stage.
      const ontologicalStage = validationResult.stageResults.find(
        (s) => s.stageName === 'ontological_consistency'
      );
      const hasOntologicalConflicts =
        ontologicalStage !== undefined &&
        !ontologicalStage.passed &&
        ontologicalStage.violations.some((v) => v.code === 'ONTOLOGICAL_CONFLICT');

      // NOTE: If shortCircuit is true and ontological stage fails, passed will be false.
      // This branch only fires if passed=true (no ontological conflicts).
      // VALIDATING → VALIDATED
      mutation = await this.transitionState(
        mutation,
        'validated',
        'system',
        `Validation passed: ${String(validationResult.stageResults.length)} stage(s), ` +
          `${String(validationResult.totalDuration)}ms` +
          (hasOntologicalConflicts ? ' (with advisory ontological warnings)' : ''),
        context,
        { validationResult: this.serializeValidationResult(validationResult) }
      );

      // Publish CkgMutationValidated event
      await this.publishEvent(
        KnowledgeGraphEventType.CKG_MUTATION_VALIDATED,
        'CanonicalKnowledgeGraph',
        mutation.mutationId,
        {
          mutationId: mutation.mutationId,
          validationResults: this.serializeValidationResult(validationResult),
        },
        context
      );
    } else {
      // Check if this is an ontological conflict (escalate) vs other failure (reject)
      const ontologicalViolations = validationResult.violations.filter(
        (v) => v.code === 'ONTOLOGICAL_CONFLICT'
      );
      const nonOntologicalErrors = validationResult.violations.filter(
        (v) => v.code !== 'ONTOLOGICAL_CONFLICT'
      );

      if (ontologicalViolations.length > 0 && nonOntologicalErrors.length === 0) {
        // ONLY ontological conflicts caused the failure → escalate to PENDING_REVIEW
        mutation = await this.transitionState(
          mutation,
          'pending_review',
          'system',
          `Ontological conflict(s) detected: ${String(ontologicalViolations.length)} conflict(s) ` +
            `require human review. ${String(validationResult.warnings.length)} warning(s).`,
          context,
          { validationResult: this.serializeValidationResult(validationResult) }
        );

        // Publish CKG_MUTATION_ESCALATED event
        await this.publishEscalationEvent(mutation, ontologicalViolations, context);
      } else {
        // Non-ontological errors present → standard rejection
        const failedStages = validationResult.stageResults
          .filter((s) => !s.passed)
          .map((s) => s.stageName);

        mutation = await this.transitionState(
          mutation,
          'rejected',
          'system',
          `Validation failed at stage(s): [${failedStages.join(', ')}]. ` +
            `${String(validationResult.violations.length)} error(s), ` +
            `${String(validationResult.warnings.length)} warning(s)`,
          context,
          { validationResult: this.serializeValidationResult(validationResult) }
        );

        // Publish CkgMutationRejected event
        await this.publishEvent(
          KnowledgeGraphEventType.CKG_MUTATION_REJECTED,
          'CanonicalKnowledgeGraph',
          mutation.mutationId,
          {
            mutationId: mutation.mutationId,
            reason: `Validation failed at stage(s): [${failedStages.join(', ')}]`,
            failedStage: 'validating' as MutationState,
            rejectedBy: 'system',
          },
          context
        );
      }
    }

    return mutation;
  }

  /**
   * Proof stage: VALIDATED → PROVING → PROVEN (pass-through for Phase 6).
   *
   * In the full architecture (ADR-001), this stage runs TLA+ verification
   * to prove that the mutation preserves UNITY invariants. For Phase 6,
   * it auto-transitions with an "auto-approved" audit entry.
   */
  private async runProofStage(
    mutation: ICkgMutation,
    context: IExecutionContext
  ): Promise<ICkgMutation> {
    // VALIDATED → PROVING
    mutation = await this.transitionState(
      mutation,
      'proving',
      'system',
      'Starting proof verification (Phase 6: auto-approved)',
      context
    );

    // PROVING → PROVEN (auto-transition — no actual proof logic in Phase 6)
    mutation = await this.transitionState(
      mutation,
      'proven',
      'system',
      'Proof stage auto-approved: formal verification not required for Phase 6. ' +
        'TLA+ invariant checking will be implemented in a future phase.',
      context,
      { proofResult: { autoApproved: true, phase: 6 } }
    );

    return mutation;
  }

  /**
   * Commit stage: PROVEN → COMMITTING → COMMITTED or REJECTED.
   *
   * Applies the mutation's operations to Neo4j atomically, then updates
   * the Postgres state. Cross-database consistency: if Postgres update
   * fails after Neo4j commit, logs ERROR for manual reconciliation.
   */
  private async runCommitStage(
    mutation: ICkgMutation,
    context: IExecutionContext
  ): Promise<ICkgMutation> {
    // PROVEN → COMMITTING
    mutation = await this.transitionState(
      mutation,
      'committing',
      'system',
      'Starting commit to CKG graph',
      context
    );

    try {
      // Apply operations to Neo4j (atomically)
      const commitResult = await this.applyOperations(mutation);

      // COMMITTING → COMMITTED (Postgres state update)
      // CRITICAL: If this fails after Neo4j committed, we have a cross-DB
      // inconsistency (Neo4j has the data, Postgres still says "committing").
      try {
        mutation = await this.transitionState(
          mutation,
          'committed',
          'system',
          `Committed ${String(commitResult.appliedCount)} operation(s) to CKG`,
          context,
          { commitResult }
        );
      } catch (pgError: unknown) {
        const pgMessage = pgError instanceof Error ? pgError.message : String(pgError);
        this.logger.error(
          {
            mutationId: mutation.mutationId,
            error: pgMessage,
            commitResult,
            reconciliationNeeded: true,
          },
          'CROSS-DB INCONSISTENCY: Neo4j commit succeeded but Postgres state update ' +
            'failed. Mutation data is in Neo4j but state is still COMMITTING. ' +
            'Manual reconciliation required.'
        );
        throw pgError;
      }

      // Publish CkgMutationCommitted event
      const operations = parseOperations(mutation.operations);
      await this.publishEvent(
        KnowledgeGraphEventType.CKG_MUTATION_COMMITTED,
        'CanonicalKnowledgeGraph',
        mutation.mutationId,
        {
          mutationId: mutation.mutationId,
          appliedOperations: mutation.operations,
          affectedNodeIds: extractAffectedNodeIds(operations) as NodeId[],
          affectedEdgeIds: extractAffectedEdgeIds(operations) as unknown as NodeId[],
        },
        context
      );

      return mutation;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        { mutationId: mutation.mutationId, error: message },
        'Commit failed — transitioning to REJECTED'
      );

      // COMMITTING → REJECTED
      mutation = await this.transitionState(
        mutation,
        'rejected',
        'system',
        `Commit failed: ${message}`,
        context,
        { commitError: message }
      );

      // Publish CkgMutationRejected event
      await this.publishEvent(
        KnowledgeGraphEventType.CKG_MUTATION_REJECTED,
        'CanonicalKnowledgeGraph',
        mutation.mutationId,
        {
          mutationId: mutation.mutationId,
          reason: `Commit failed: ${message}`,
          failedStage: 'committing' as MutationState,
          rejectedBy: 'system',
        },
        context
      );

      return mutation;
    }
  }

  // ==========================================================================
  // Commit Protocol — Apply Operations to Neo4j
  // ==========================================================================

  /**
   * Apply the mutation's DSL operations to Neo4j.
   *
   * Each operation is translated to the appropriate IGraphRepository call.
   * All operations use graphType: 'ckg' and no userId (CKG is shared).
   *
   * @returns Summary of applied operations.
   */
  private async applyOperations(mutation: ICkgMutation): Promise<{
    appliedCount: number;
    createdNodeIds: string[];
    createdEdgeIds: string[];
    deletedNodeIds: string[];
    deletedEdgeIds: string[];
  }> {
    const operations = parseOperations(mutation.operations);
    const graphType: GraphType = 'ckg' as GraphType;

    // Wrap all operations in a single Neo4j transaction so a failure
    // in any operation rolls back the entire batch (atomic commit).
    return this.graphRepository.runInTransaction(async (txRepo) => {
      const createdNodeIds: string[] = [];
      const createdEdgeIds: string[] = [];
      const deletedNodeIds: string[] = [];
      const deletedEdgeIds: string[] = [];

      for (const op of operations) {
        switch (op.type) {
          case CkgOperationType.ADD_NODE: {
            const node: IGraphNode = await txRepo.createNode(graphType, {
              label: op.label,
              nodeType: op.nodeType,
              domain: op.domain,
              description: op.description,
              properties: op.properties,
            });
            createdNodeIds.push(node.nodeId as string);
            break;
          }

          case CkgOperationType.REMOVE_NODE: {
            await txRepo.deleteNode(op.nodeId as NodeId);
            deletedNodeIds.push(op.nodeId);
            break;
          }

          case CkgOperationType.UPDATE_NODE: {
            const updateInput: Record<string, unknown> = {};
            if (op.updates.label !== undefined) updateInput['label'] = op.updates.label;
            if (op.updates.description !== undefined)
              updateInput['description'] = op.updates.description;
            if (op.updates.domain !== undefined) updateInput['domain'] = op.updates.domain;
            if (op.updates.properties !== undefined)
              updateInput['properties'] = op.updates.properties;
            await txRepo.updateNode(op.nodeId as NodeId, updateInput as IUpdateNodeInput);
            break;
          }

          case CkgOperationType.ADD_EDGE: {
            const edge: IGraphEdge = await txRepo.createEdge(graphType, {
              sourceNodeId: op.sourceNodeId as NodeId,
              targetNodeId: op.targetNodeId as NodeId,
              edgeType: op.edgeType,
              weight: op.weight as unknown as EdgeWeight,
            });
            createdEdgeIds.push(edge.edgeId as string);
            break;
          }

          case CkgOperationType.REMOVE_EDGE: {
            await txRepo.removeEdge(op.edgeId as unknown as EdgeId);
            deletedEdgeIds.push(op.edgeId);
            break;
          }

          case CkgOperationType.MERGE_NODES: {
            await this.executeMerge(op, graphType, txRepo);
            deletedNodeIds.push(op.sourceNodeId);
            break;
          }

          case CkgOperationType.SPLIT_NODE: {
            const { nodeAId, nodeBId } = await this.executeSplit(op, graphType, txRepo);
            createdNodeIds.push(nodeAId, nodeBId);
            deletedNodeIds.push(op.nodeId);
            break;
          }
        }
      }

      return {
        appliedCount: operations.length,
        createdNodeIds,
        createdEdgeIds,
        deletedNodeIds,
        deletedEdgeIds,
      };
    });
  }

  /**
   * Execute MergeNodes: redirect edges from source to target, soft-delete source.
   */
  private async executeMerge(
    op: Extract<CkgMutationOperation, { type: 'merge_nodes' }>,
    graphType: GraphType,
    repo: IGraphRepository = this.graphRepository
  ): Promise<void> {
    // Get all edges connected to the source node
    const sourceEdges = await repo.getEdgesForNode(op.sourceNodeId as NodeId, 'both');

    // Redirect each edge to the target node
    for (const edge of sourceEdges) {
      const isSource = (edge.sourceNodeId as string) === op.sourceNodeId;
      const otherNodeId = isSource ? edge.targetNodeId : edge.sourceNodeId;

      // Skip self-loops that would result from merging
      if ((otherNodeId as string) === op.targetNodeId) {
        await repo.removeEdge(edge.edgeId);
        continue;
      }

      // Create new edge from/to target node
      await repo.createEdge(graphType, {
        sourceNodeId: isSource ? (op.targetNodeId as NodeId) : otherNodeId,
        targetNodeId: isSource ? otherNodeId : (op.targetNodeId as NodeId),
        edgeType: edge.edgeType,
        weight: edge.weight,
        properties: edge.properties,
      });

      // Remove the old edge
      await repo.removeEdge(edge.edgeId);
    }

    // Update target node with merged properties
    if (Object.keys(op.mergedProperties).length > 0) {
      await repo.updateNode(op.targetNodeId as NodeId, {
        properties: op.mergedProperties,
      });
    }

    // Soft-delete the source node
    await repo.deleteNode(op.sourceNodeId as NodeId);
  }

  /**
   * Execute SplitNode: create two new nodes, reassign edges, soft-delete original.
   */
  private async executeSplit(
    op: Extract<CkgMutationOperation, { type: 'split_node' }>,
    graphType: GraphType,
    repo: IGraphRepository = this.graphRepository
  ): Promise<{ nodeAId: string; nodeBId: string }> {
    // Create the two new nodes
    const nodeA = await repo.createNode(graphType, {
      label: op.newNodeA.label,
      nodeType: op.newNodeA.nodeType,
      domain: '', // Domain inherited from original
      description: op.newNodeA.description,
      properties: op.newNodeA.properties,
    });

    const nodeB = await repo.createNode(graphType, {
      label: op.newNodeB.label,
      nodeType: op.newNodeB.nodeType,
      domain: '',
      description: op.newNodeB.description,
      properties: op.newNodeB.properties,
    });

    // Inherit domain from original node
    const originalNode = await repo.getNode(op.nodeId as NodeId);
    if (originalNode) {
      await Promise.all([
        repo.updateNode(nodeA.nodeId, { domain: originalNode.domain }),
        repo.updateNode(nodeB.nodeId, { domain: originalNode.domain }),
      ]);
    }

    // Reassign edges per rules
    const reassignmentMap = new Map(op.edgeReassignmentRules.map((r) => [r.edgeId, r.assignTo]));

    const allEdges = await repo.getEdgesForNode(op.nodeId as NodeId, 'both');

    for (const edge of allEdges) {
      const assignment = reassignmentMap.get(edge.edgeId as string);
      const targetNewNode = assignment === 'a' ? nodeA : assignment === 'b' ? nodeB : null;

      if (targetNewNode) {
        const isSource = (edge.sourceNodeId as string) === op.nodeId;

        await repo.createEdge(graphType, {
          sourceNodeId: isSource ? targetNewNode.nodeId : edge.sourceNodeId,
          targetNodeId: isSource ? edge.targetNodeId : targetNewNode.nodeId,
          edgeType: edge.edgeType,
          weight: edge.weight,
          properties: edge.properties,
        });
      }

      // Remove the old edge (whether reassigned or not)
      await repo.removeEdge(edge.edgeId);
    }

    // Soft-delete the original node
    await repo.deleteNode(op.nodeId as NodeId);

    return {
      nodeAId: nodeA.nodeId as string,
      nodeBId: nodeB.nodeId as string,
    };
  }

  // ==========================================================================
  // State Transition Helper
  // ==========================================================================

  /**
   * Transition a mutation to a new state with optimistic locking and audit log.
   *
   * @param mutation Current mutation state.
   * @param targetState The state to transition to.
   * @param performedBy Who/what triggered the transition.
   * @param reason Human-readable reason for the transition.
   * @param context Execution context for correlation.
   * @param snapshot Optional data snapshot at transition time.
   * @returns The updated mutation in the new state.
   * @throws InvalidStateTransitionError if the transition is not allowed.
   */
  private async transitionState(
    mutation: ICkgMutation,
    targetState: MutationState,
    performedBy: string,
    reason: string,
    context: IExecutionContext,
    snapshot?: Metadata
  ): Promise<ICkgMutation> {
    // Validate transition
    if (!isValidTransition(mutation.state, targetState)) {
      throw new InvalidStateTransitionError(mutation.state, targetState, [
        ...STATE_TRANSITIONS[mutation.state],
      ]);
    }

    // Atomically update state + append audit in a single DB transaction
    const { mutation: updated } = await this.mutationRepository.transitionStateWithAudit(
      mutation.mutationId,
      targetState,
      mutation.version,
      {
        mutationId: mutation.mutationId,
        fromState: mutation.state,
        toState: targetState,
        performedBy,
        context: {
          reason,
          correlationId: context.correlationId,
          ...snapshot,
        },
      }
    );

    this.logger.debug(
      {
        mutationId: mutation.mutationId,
        from: mutation.state,
        to: targetState,
        version: updated.version,
      },
      'Mutation state transitioned'
    );

    return updated;
  }

  // ==========================================================================
  // Event Publishing Helper
  // ==========================================================================

  private async publishEvent(
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: unknown,
    context: IExecutionContext
  ): Promise<void> {
    const event: IEventToPublish = {
      eventType,
      aggregateType,
      aggregateId,
      payload,
      metadata: {
        correlationId: context.correlationId,
        userId: context.userId,
      },
    };

    try {
      await this.eventPublisher.publish(event);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      // Event publishing failure is non-fatal — log and continue
      this.logger.warn(
        { eventType, aggregateId, error: message },
        'Failed to publish event (non-fatal)'
      );
    }
  }

  /**
   * Publish a CKG_MUTATION_ESCALATED event when ontological conflicts
   * cause a mutation to enter PENDING_REVIEW state.
   */
  private async publishEscalationEvent(
    mutation: ICkgMutation,
    ontologicalViolations: IValidationViolation[],
    context: IExecutionContext
  ): Promise<void> {
    const conflicts = ontologicalViolations.map((v) => ({
      proposedEdgeType: (v.metadata['proposedEdgeType'] ?? 'unknown') as string,
      conflictingEdgeType: (v.metadata['conflictingEdgeType'] ?? 'unknown') as string,
      sourceNodeId: (v.metadata['sourceNodeId'] ?? 'unknown') as string,
      targetNodeId: (v.metadata['targetNodeId'] ?? 'unknown') as string,
      reason: (v.metadata['reason'] ?? v.message) as string,
    }));

    await this.publishEvent(
      KnowledgeGraphEventType.CKG_MUTATION_ESCALATED,
      'CanonicalKnowledgeGraph',
      mutation.mutationId,
      {
        mutationId: mutation.mutationId,
        proposedBy: mutation.proposedBy,
        conflicts,
        violationCount: ontologicalViolations.length,
        reason: `${String(ontologicalViolations.length)} ontological conflict(s) require human review`,
      },
      context
    );
  }

  // ==========================================================================
  // Utility
  // ==========================================================================

  /**
   * Serialize validation result for storage in JSON columns.
   */
  private serializeValidationResult(result: IValidationResult): Metadata {
    return {
      passed: result.passed,
      totalDuration: result.totalDuration,
      stageResults: result.stageResults.map((s) => ({
        stageName: s.stageName,
        passed: s.passed,
        details: s.details,
        violationCount: s.violations.length,
        duration: s.duration,
      })),
      errorCount: result.violations.length,
      warningCount: result.warnings.length,
    };
  }

  /**
   * Recovery scan: find stuck mutations and attempt to re-process them.
   * Called on service startup (D3: recovery mechanism).
   *
   * "Stuck" = VALIDATING, PROVING, or COMMITTING state without recent
   * progress (indicating the process died during processing).
   */
  async recoverStuckMutations(context: IExecutionContext): Promise<number> {
    const stuckStates: MutationState[] = ['validating', 'proving', 'committing'];
    let recoveredCount = 0;

    for (const state of stuckStates) {
      const stuck = await this.mutationRepository.findMutationsByState(state);

      for (const mutation of stuck) {
        this.logger.warn(
          { mutationId: mutation.mutationId, state: mutation.state },
          'Found stuck mutation — rejecting for retry'
        );

        try {
          await this.transitionState(
            mutation,
            'rejected',
            'system:recovery',
            `Stuck in ${state} state — rejected during recovery scan. ` +
              'Original proposer can retry with retryMutation.',
            context,
            { recoveredFrom: state }
          );
          recoveredCount++;
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(
            { mutationId: mutation.mutationId, error: message },
            'Failed to recover stuck mutation'
          );
        }
      }
    }

    if (recoveredCount > 0) {
      this.logger.info(
        { recoveredCount },
        'Recovery scan completed — stuck mutations rejected for retry'
      );
    }

    return recoveredCount;
  }
}
