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
  GraphType,
  IGraphEdge,
  IGraphNode,
  Metadata,
  MutationId,
  MutationState,
  NodeId,
  ProposerId,
} from '@noema/types';
import { EdgeWeight } from '@noema/types';

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
import type { ICkgMutationPipeline } from './ckg-mutation-pipeline.interface.js';
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
import { KG_COUNTERS, kgCounters, withSpan } from './observability.js';

// ============================================================================
// Helpers
// ============================================================================

/** Maximum recovery attempts before a stuck mutation is permanently rejected. */
const MAX_RECOVERY_ATTEMPTS = 3;

const CkgMutationOperationsSchema = z.array(CkgMutationOperationSchema);

/**
 * Safely parse mutation operations from their DB-serialized form (Metadata[])
 * into typed CkgMutationOperation[]. Throws a ZodError if the data is
 * malformed, which the caller should handle or let propagate.
 */
function parseOperations(raw: unknown): CkgMutationOperation[] {
  return CkgMutationOperationsSchema.parse(raw) as CkgMutationOperation[];
}

function toSerializableValue(value: unknown): Metadata[string] {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .filter((entry) => entry !== undefined)
      .map((entry) => toSerializableValue(entry));
  }

  if (typeof value === 'object') {
    return toSerializableMetadata(value as Record<string, unknown>);
  }

  return null;
}

function toSerializableMetadata(value: Record<string, unknown>): Metadata {
  const metadata = {} as Metadata;
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      metadata[key] = toSerializableValue(entry);
    }
  }
  return metadata;
}

function isOntologyImportMutation(mutation: Pick<ICkgMutation, 'rationale'>): boolean {
  return mutation.rationale.includes('[ontology-import ');
}

/**
 * Convert operations to a serializable form suitable for event payloads.
 * Explicitly picks only the fields that are safe to serialize (C3/H5 fix).
 */
function toSerializableOperations(operations: CkgMutationOperation[]): Metadata[] {
  return operations.map((operation) => {
    switch (operation.type) {
      case CkgOperationType.ADD_NODE:
        return toSerializableMetadata({
          type: operation.type,
          nodeType: operation.nodeType,
          label: operation.label,
          description: operation.description,
          domain: operation.domain,
          ...(operation.status !== undefined ? { status: operation.status } : {}),
          ...(operation.aliases !== undefined ? { aliases: operation.aliases } : {}),
          ...(operation.languages !== undefined ? { languages: operation.languages } : {}),
          ...(operation.tags !== undefined ? { tags: operation.tags } : {}),
          ...(operation.semanticHints !== undefined
            ? { semanticHints: operation.semanticHints }
            : {}),
          ...(operation.canonicalExternalRefs !== undefined
            ? { canonicalExternalRefs: operation.canonicalExternalRefs }
            : {}),
          ...(operation.ontologyMappings !== undefined
            ? { ontologyMappings: operation.ontologyMappings }
            : {}),
          ...(operation.provenance !== undefined ? { provenance: operation.provenance } : {}),
          ...(operation.reviewMetadata !== undefined
            ? { reviewMetadata: operation.reviewMetadata }
            : {}),
          ...(operation.sourceCoverage !== undefined
            ? { sourceCoverage: operation.sourceCoverage }
            : {}),
          properties: operation.properties,
        });

      case CkgOperationType.REMOVE_NODE:
        return toSerializableMetadata({
          type: operation.type,
          nodeId: operation.nodeId,
          rationale: operation.rationale,
        });

      case CkgOperationType.UPDATE_NODE:
        return toSerializableMetadata({
          type: operation.type,
          nodeId: operation.nodeId,
          updates: {
            ...(operation.updates.nodeType !== undefined
              ? { nodeType: operation.updates.nodeType }
              : {}),
            ...(operation.updates.label !== undefined ? { label: operation.updates.label } : {}),
            ...(operation.updates.description !== undefined
              ? { description: operation.updates.description }
              : {}),
            ...(operation.updates.domain !== undefined
              ? { domain: operation.updates.domain }
              : {}),
            ...(operation.updates.status !== undefined
              ? { status: operation.updates.status }
              : {}),
            ...(operation.updates.aliases !== undefined
              ? { aliases: operation.updates.aliases }
              : {}),
            ...(operation.updates.languages !== undefined
              ? { languages: operation.updates.languages }
              : {}),
            ...(operation.updates.tags !== undefined ? { tags: operation.updates.tags } : {}),
            ...(operation.updates.semanticHints !== undefined
              ? { semanticHints: operation.updates.semanticHints }
              : {}),
            ...(operation.updates.canonicalExternalRefs !== undefined
              ? { canonicalExternalRefs: operation.updates.canonicalExternalRefs }
              : {}),
            ...(operation.updates.ontologyMappings !== undefined
              ? { ontologyMappings: operation.updates.ontologyMappings }
              : {}),
            ...(operation.updates.provenance !== undefined
              ? { provenance: operation.updates.provenance }
              : {}),
            ...(operation.updates.reviewMetadata !== undefined
              ? { reviewMetadata: operation.updates.reviewMetadata }
              : {}),
            ...(operation.updates.sourceCoverage !== undefined
              ? { sourceCoverage: operation.updates.sourceCoverage }
              : {}),
            ...(operation.updates.properties !== undefined
              ? { properties: operation.updates.properties }
              : {}),
          },
          rationale: operation.rationale,
        });

      case CkgOperationType.ADD_EDGE:
        return toSerializableMetadata({
          type: operation.type,
          edgeType: operation.edgeType,
          sourceNodeId: operation.sourceNodeId,
          targetNodeId: operation.targetNodeId,
          weight: operation.weight,
          rationale: operation.rationale,
        });

      case CkgOperationType.REMOVE_EDGE:
        return toSerializableMetadata({
          type: operation.type,
          edgeId: operation.edgeId,
          rationale: operation.rationale,
        });

      case CkgOperationType.MERGE_NODES:
        return toSerializableMetadata({
          type: operation.type,
          sourceNodeId: operation.sourceNodeId,
          targetNodeId: operation.targetNodeId,
          mergedProperties: operation.mergedProperties,
          rationale: operation.rationale,
        });

      case CkgOperationType.SPLIT_NODE:
        return toSerializableMetadata({
          type: operation.type,
          nodeId: operation.nodeId,
          newNodeA: {
            label: operation.newNodeA.label,
            description: operation.newNodeA.description,
            nodeType: operation.newNodeA.nodeType,
            properties: operation.newNodeA.properties,
          },
          newNodeB: {
            label: operation.newNodeB.label,
            description: operation.newNodeB.description,
            nodeType: operation.newNodeB.nodeType,
            properties: operation.newNodeB.properties,
          },
          edgeReassignmentRules: operation.edgeReassignmentRules.map((rule) => ({
            edgeId: rule.edgeId,
            assignTo: rule.assignTo,
          })),
          rationale: operation.rationale,
        });
    }
  });
}

// ============================================================================
// Pipeline Error Metrics (4.8)
// ============================================================================

/** In-process pipeline failure/success counters for observability (4.8). */
export interface IPipelineErrorMetrics {
  pipelineSuccessCount: number;
  pipelineFailureCount: number;
  postReviewSuccessCount: number;
  postReviewFailureCount: number;
  lastFailureTimestamp: string | null;
  lastFailureMutationId: string | null;
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
export class CkgMutationPipeline implements ICkgMutationPipeline {
  /** Default priority for mutations created via aggregation pipeline. */
  private static readonly AGGREGATION_DEFAULT_PRIORITY = 10;

  /** In-process pipeline error metrics (4.8). */
  private readonly pipelineMetrics: IPipelineErrorMetrics = {
    pipelineSuccessCount: 0,
    pipelineFailureCount: 0,
    postReviewSuccessCount: 0,
    postReviewFailureCount: 0,
    lastFailureTimestamp: null,
    lastFailureMutationId: null,
  };

  constructor(
    private readonly mutationRepository: IMutationRepository,
    private readonly graphRepository: IGraphRepository,
    private readonly validationPipeline: IValidationPipeline,
    private readonly eventPublisher: IEventPublisher,
    private readonly logger: Logger,
    private readonly proofStageEnabled = false
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
    return withSpan('ckg.proposeMutation', async (span) => {
      span.setAttribute('kg.proposerId', proposerId as string);
      span.setAttribute('kg.operationCount', operations.length);
      span.setAttribute('kg.evidenceCount', evidenceCount);

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
      span.setAttribute('kg.mutationId', mutation.mutationId as string);

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

      kgCounters.increment(KG_COUNTERS.CKG_MUTATIONS, { stage: 'proposed' });

      // Fire async validation (D3: fire-and-forget in-process)
      void this.runPipelineAsync(mutation.mutationId, context);

      return mutation;
    });
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

    // No filters — return all (via all states in a single query)
    const states: MutationState[] = [
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
    ];
    return this.mutationRepository.findMutationsByStates(states);
  }

  /**
   * List all non-terminal (active) mutations.
   * Retrieves mutations in processing states (proposed through committing),
   * excluding terminal states (committed, rejected).
   */
  async listActiveMutations(): Promise<ICkgMutation[]> {
    const activeStates: MutationState[] = [
      'proposed',
      'validating',
      'validated',
      'pending_review',
      'revision_requested',
      'proving',
      'proven',
      'committing',
    ];
    return this.mutationRepository.findMutationsByStates(activeStates);
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
   * Request revision of an escalated mutation (PENDING_REVIEW → REVISION_REQUESTED).
   *
   * Instead of approving or rejecting, a reviewer can request changes.
   * The proposer must resubmit the mutation with updated operations.
   *
   * @param mutationId The escalated mutation to send back for revision.
   * @param reviewerId Who is requesting the revision.
   * @param feedback Specific feedback describing what needs to change.
   * @param context Execution context.
   * @returns The mutation transitioned to REVISION_REQUESTED state.
   */
  async requestRevision(
    mutationId: MutationId,
    reviewerId: string,
    feedback: string,
    context: IExecutionContext
  ): Promise<ICkgMutation> {
    const mutation = await this.getMutation(mutationId);

    if (mutation.state !== 'pending_review') {
      throw new InvalidStateTransitionError(mutation.state, 'revision_requested', [
        'Only PENDING_REVIEW mutations can have revisions requested',
      ]);
    }

    this.logger.info({ mutationId, reviewerId }, 'Requesting revision of escalated mutation');

    // PENDING_REVIEW → REVISION_REQUESTED
    const updated = await this.transitionState(
      mutation,
      'revision_requested',
      reviewerId,
      `Revision requested by reviewer: ${feedback}`,
      context,
      {
        reviewAction: 'revision_requested',
        reviewerId,
        feedback,
        revisionCount: mutation.revisionCount + 1,
      }
    );

    // Persist the feedback on the mutation record
    await this.mutationRepository.updateMutationFields(mutationId, {
      revisionFeedback: feedback,
      revisionCount: mutation.revisionCount + 1,
    });

    // Publish event
    await this.publishEvent(
      KnowledgeGraphEventType.CKG_MUTATION_REVISION_REQUESTED,
      'CanonicalKnowledgeGraph',
      mutation.mutationId,
      {
        mutationId: mutation.mutationId,
        reviewerId,
        feedback,
        revisionCount: mutation.revisionCount + 1,
      },
      context
    );

    return {
      ...updated,
      revisionFeedback: feedback,
      revisionCount: mutation.revisionCount + 1,
    };
  }

  /**
   * Resubmit a mutation after revision (REVISION_REQUESTED → PROPOSED).
   *
   * The proposer updates the mutation's operations and sends it back
   * through the pipeline from the beginning.
   *
   * @param mutationId The mutation to resubmit.
   * @param updatedOperations New DSL operations replacing the old ones.
   * @param submitterId Who is resubmitting.
   * @param context Execution context.
   * @returns The mutation transitioned back to PROPOSED state.
   */
  async resubmitMutation(
    mutationId: MutationId,
    updatedOperations: CkgMutationOperation[],
    submitterId: string,
    context: IExecutionContext
  ): Promise<ICkgMutation> {
    const mutation = await this.getMutation(mutationId);

    if (mutation.state !== 'revision_requested') {
      throw new InvalidStateTransitionError(mutation.state, 'proposed', [
        'Only REVISION_REQUESTED mutations can be resubmitted',
      ]);
    }

    this.logger.info(
      { mutationId, submitterId, revisionCount: mutation.revisionCount },
      'Resubmitting revised mutation — re-entering pipeline'
    );

    // REVISION_REQUESTED → PROPOSED
    const updated = await this.transitionState(
      mutation,
      'proposed',
      submitterId,
      `Mutation resubmitted after revision (cycle ${String(mutation.revisionCount)})`,
      context,
      {
        reviewAction: 'resubmitted',
        submitterId,
        revisionCount: mutation.revisionCount,
        previousOperations: mutation.operations,
      }
    );

    // Update operations and clear feedback
    await this.mutationRepository.updateMutationFields(mutationId, {
      operations: toSerializableOperations(updatedOperations),
      revisionFeedback: null,
    });

    // Publish CkgMutationProposed event (re-enters pipeline)
    await this.publishEvent(
      KnowledgeGraphEventType.CKG_MUTATION_PROPOSED,
      'CanonicalKnowledgeGraph',
      mutation.mutationId,
      {
        mutationId: mutation.mutationId,
        proposedBy: submitterId,
        operationCount: updatedOperations.length,
        isResubmission: true,
        revisionCount: mutation.revisionCount,
      },
      context
    );

    return {
      ...updated,
      operations: toSerializableOperations(updatedOperations),
      revisionFeedback: null,
    };
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
      CkgMutationPipeline.AGGREGATION_DEFAULT_PRIORITY,
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
    revisionRequestedCount: number;
    committedCount: number;
    rejectedCount: number;
    stuckCount: number;
  }> {
    const [
      proposed,
      validating,
      validated,
      pendingReview,
      committed,
      rejected,
      proving,
      proven,
      committing,
      revisionRequested,
    ] = await Promise.all([
      this.mutationRepository.countMutationsByState('proposed'),
      this.mutationRepository.countMutationsByState('validating'),
      this.mutationRepository.countMutationsByState('validated'),
      this.mutationRepository.countMutationsByState('pending_review'),
      this.mutationRepository.countMutationsByState('committed'),
      this.mutationRepository.countMutationsByState('rejected'),
      this.mutationRepository.countMutationsByState('proving'),
      this.mutationRepository.countMutationsByState('proven'),
      this.mutationRepository.countMutationsByState('committing'),
      this.mutationRepository.countMutationsByState('revision_requested'),
    ]);

    // "Stuck" = in non-terminal non-proposed state (could indicate processing failure)
    const stuckCount = validating + proving + proven + committing;

    return {
      proposedCount: proposed,
      validatingCount: validating,
      validatedCount: validated,
      pendingReviewCount: pendingReview,
      revisionRequestedCount: revisionRequested,
      committedCount: committed,
      rejectedCount: rejected,
      stuckCount,
    };
  }

  /**
   * Return in-process pipeline failure/success counters (4.8).
   *
   * These counters live in memory and are reset on service restart.
   * They complement the durable state counts from `getPipelineHealth()`
   * with real-time failure signals useful for alerting.
   */
  getPipelineErrorMetrics(): IPipelineErrorMetrics {
    return { ...this.pipelineMetrics };
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
      this.pipelineMetrics.pipelineSuccessCount++;
    } catch (error: unknown) {
      this.pipelineMetrics.pipelineFailureCount++;
      this.pipelineMetrics.lastFailureTimestamp = new Date().toISOString();
      this.pipelineMetrics.lastFailureMutationId = mutationId as string;
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        {
          mutationId,
          correlationId: context.correlationId,
          error: message,
          stack,
          failureCount: this.pipelineMetrics.pipelineFailureCount,
        },
        'Pipeline processing failed (fire-and-forget)'
      );

      // Durable audit: persist failure so it survives process restarts
      try {
        await this.mutationRepository.appendAuditEntry({
          mutationId,
          fromState: 'proposed' as MutationState,
          toState: 'rejected' as MutationState,
          performedBy: 'system',
          context: {
            action: 'pipeline_failure',
            error: message,
            correlationId: context.correlationId,
          },
        });
      } catch (auditError: unknown) {
        this.logger.error(
          { mutationId, auditError },
          'Failed to persist pipeline failure audit entry'
        );
      }
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
      this.pipelineMetrics.postReviewSuccessCount++;
    } catch (error: unknown) {
      this.pipelineMetrics.postReviewFailureCount++;
      this.pipelineMetrics.lastFailureTimestamp = new Date().toISOString();
      this.pipelineMetrics.lastFailureMutationId = mutationId as string;
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        {
          mutationId,
          correlationId: context.correlationId,
          error: message,
          stack,
          failureCount: this.pipelineMetrics.postReviewFailureCount,
        },
        'Post-review pipeline processing failed (fire-and-forget)'
      );
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
    return withSpan('ckg.validationStage', async (span) => {
      span.setAttribute('kg.mutationId', mutation.mutationId as string);

      // PROPOSED → VALIDATING
      mutation = await this.transitionState(
        mutation,
        'validating',
        'system',
        'Starting validation pipeline',
        context
      );

      kgCounters.increment(KG_COUNTERS.PIPELINE_STAGES, { stage: 'validating' });

      // Run the validation pipeline (now includes OntologicalConsistencyStage at order 250)
      const validationResult = await this.validationPipeline.validate(mutation, {
        correlationId: context.correlationId as string,
        shortCircuitOnError: true,
      });

      span.setAttribute('kg.validation.passed', validationResult.passed);
      span.setAttribute('kg.validation.stageCount', validationResult.stageResults.length);
      span.setAttribute('kg.validation.durationMs', validationResult.totalDuration);

      if (validationResult.passed) {
        const ontologicalStage = validationResult.stageResults.find(
          (s) => s.stageName === 'ontological_consistency'
        );
        const hasOntologicalConflicts =
          ontologicalStage !== undefined &&
          !ontologicalStage.passed &&
          ontologicalStage.violations.some((v) => v.code === 'ONTOLOGICAL_CONFLICT');
        const requiresManualReview = hasOntologicalConflicts || isOntologyImportMutation(mutation);
        const ontologicalConflictCount = hasOntologicalConflicts
          ? ontologicalStage.violations.filter((v) => v.code === 'ONTOLOGICAL_CONFLICT').length
          : 0;

        if (requiresManualReview) {
          mutation = await this.transitionState(
            mutation,
            'pending_review',
            'system',
            hasOntologicalConflicts
              ? `Ontological conflict(s) detected: ${String(ontologicalConflictCount)} conflict(s) require human review. ${String(validationResult.warnings.length)} warning(s).`
              : 'Ontology-import proposal validated successfully and is queued for manual review before commit.',
            context,
            { validationResult: this.serializeValidationResult(validationResult) }
          );

          kgCounters.increment(KG_COUNTERS.PIPELINE_STAGES, { stage: 'pending_review' });

          if (hasOntologicalConflicts) {
            await this.publishEscalationEvent(
              mutation,
              ontologicalStage.violations.filter((v) => v.code === 'ONTOLOGICAL_CONFLICT'),
              context
            );
          } else {
            await this.publishEvent(
              KnowledgeGraphEventType.CKG_MUTATION_ESCALATED,
              'CanonicalKnowledgeGraph',
              mutation.mutationId,
              {
                mutationId: mutation.mutationId,
                conflicts: [],
                reason: 'Ontology import proposals require manual review before commit.',
              },
              context
            );
          }

          return mutation;
        }

        // VALIDATING → VALIDATED
        mutation = await this.transitionState(
          mutation,
          'validated',
          'system',
          `Validation passed: ${String(validationResult.stageResults.length)} stage(s), ` +
            `${String(validationResult.totalDuration)}ms`,
          context,
          { validationResult: this.serializeValidationResult(validationResult) }
        );

        kgCounters.increment(KG_COUNTERS.PIPELINE_STAGES, { stage: 'validated' });

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
        const ontologicalViolations = validationResult.violations.filter(
          (v) => v.code === 'ONTOLOGICAL_CONFLICT'
        );
        const nonOntologicalErrors = validationResult.violations.filter(
          (v) => v.code !== 'ONTOLOGICAL_CONFLICT'
        );

        if (ontologicalViolations.length > 0 && nonOntologicalErrors.length === 0) {
          mutation = await this.transitionState(
            mutation,
            'pending_review',
            'system',
            `Ontological conflict(s) detected: ${String(ontologicalViolations.length)} conflict(s) ` +
              `require human review. ${String(validationResult.warnings.length)} warning(s).`,
            context,
            { validationResult: this.serializeValidationResult(validationResult) }
          );

          kgCounters.increment(KG_COUNTERS.PIPELINE_STAGES, { stage: 'pending_review' });

          await this.publishEscalationEvent(mutation, ontologicalViolations, context);
        } else {
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

          kgCounters.increment(KG_COUNTERS.PIPELINE_STAGES, { stage: 'rejected' });

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
    });
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
      this.proofStageEnabled
        ? 'Starting formal proof verification (TLA+)'
        : 'Starting proof verification (auto-approved: formal verification disabled)',
      context
    );

    if (this.proofStageEnabled) {
      // TODO(NOEMA-tla): Run actual TLA+ invariant checking when implemented.
      // For now, even when enabled, we auto-approve since TLA+ integration
      // is not yet available. This flag gates future implementation.
      // Tracked: Phase 11 — formal verification with TLA+ proofs.
      this.logger.warn(
        { mutationId: mutation.mutationId },
        'Proof stage enabled but TLA+ integration not yet implemented — auto-approving'
      );
    }

    // PROVING → PROVEN (auto-transition — no actual proof logic yet)
    mutation = await this.transitionState(
      mutation,
      'proven',
      'system',
      this.proofStageEnabled
        ? 'Proof stage auto-approved: TLA+ integration pending implementation.'
        : 'Proof stage auto-approved: formal verification not required (disabled by config).',
      context,
      { proofResult: { autoApproved: true, proofStageEnabled: this.proofStageEnabled } }
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
    return withSpan('ckg.commitStage', async (span) => {
      span.setAttribute('kg.mutationId', mutation.mutationId as string);

      // PROVEN → COMMITTING
      mutation = await this.transitionState(
        mutation,
        'committing',
        'system',
        'Starting commit to CKG graph',
        context
      );

      kgCounters.increment(KG_COUNTERS.PIPELINE_STAGES, { stage: 'committing' });

      try {
        // Apply operations to Neo4j (atomically)
        const commitResult = await this.applyOperations(mutation);
        span.setAttribute('kg.commit.appliedCount', commitResult.appliedCount);

        // COMMITTING → COMMITTED (Postgres state update with retry)
        // CRITICAL: If this fails after Neo4j committed, we have a cross-DB
        // inconsistency (Neo4j has the data, Postgres still says "committing").
        // Retry with exponential backoff to reduce the window of inconsistency.
        mutation = await this.retryPostgresStateUpdate(
          mutation,
          'committed',
          `Committed ${String(commitResult.appliedCount)} operation(s) to CKG`,
          context,
          { commitResult }
        );

        kgCounters.increment(KG_COUNTERS.PIPELINE_STAGES, { stage: 'committed' });

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
            affectedEdgeIds: extractAffectedEdgeIds(operations) as EdgeId[],
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

        kgCounters.increment(KG_COUNTERS.PIPELINE_STAGES, { stage: 'commit_rejected' });

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
    });
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
              ...(op.status !== undefined ? { status: op.status } : {}),
              ...(op.aliases !== undefined ? { aliases: op.aliases } : {}),
              ...(op.languages !== undefined ? { languages: op.languages } : {}),
              ...(op.tags !== undefined ? { tags: op.tags } : {}),
              ...(op.semanticHints !== undefined ? { semanticHints: op.semanticHints } : {}),
              ...(op.canonicalExternalRefs !== undefined
                ? { canonicalExternalRefs: op.canonicalExternalRefs }
                : {}),
              ...(op.ontologyMappings !== undefined
                ? { ontologyMappings: op.ontologyMappings }
                : {}),
              ...(op.provenance !== undefined ? { provenance: op.provenance } : {}),
              ...(op.reviewMetadata !== undefined ? { reviewMetadata: op.reviewMetadata } : {}),
              ...(op.sourceCoverage !== undefined ? { sourceCoverage: op.sourceCoverage } : {}),
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
            if (op.updates.nodeType !== undefined) updateInput['nodeType'] = op.updates.nodeType;
            if (op.updates.label !== undefined) updateInput['label'] = op.updates.label;
            if (op.updates.description !== undefined)
              updateInput['description'] = op.updates.description;
            if (op.updates.domain !== undefined) updateInput['domain'] = op.updates.domain;
            if (op.updates.status !== undefined) updateInput['status'] = op.updates.status;
            if (op.updates.aliases !== undefined) updateInput['aliases'] = op.updates.aliases;
            if (op.updates.languages !== undefined) updateInput['languages'] = op.updates.languages;
            if (op.updates.tags !== undefined) updateInput['tags'] = op.updates.tags;
            if (op.updates.semanticHints !== undefined) {
              updateInput['semanticHints'] = op.updates.semanticHints;
            }
            if (op.updates.canonicalExternalRefs !== undefined) {
              updateInput['canonicalExternalRefs'] = op.updates.canonicalExternalRefs;
            }
            if (op.updates.ontologyMappings !== undefined) {
              updateInput['ontologyMappings'] = op.updates.ontologyMappings;
            }
            if (op.updates.provenance !== undefined) {
              updateInput['provenance'] = op.updates.provenance;
            }
            if (op.updates.reviewMetadata !== undefined) {
              updateInput['reviewMetadata'] = op.updates.reviewMetadata;
            }
            if (op.updates.sourceCoverage !== undefined) {
              updateInput['sourceCoverage'] = op.updates.sourceCoverage;
            }
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
              weight: EdgeWeight.clamp(op.weight),
            });
            createdEdgeIds.push(edge.edgeId as string);
            break;
          }

          case CkgOperationType.REMOVE_EDGE: {
            await txRepo.removeEdge(op.edgeId as EdgeId);
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
    // Look up original node first to get domain for atomic creation
    const originalNode = await repo.getNode(op.nodeId as NodeId);
    const domain = originalNode?.domain ?? '';

    // Create the two new nodes with domain directly (atomic, no update needed)
    const nodeA = await repo.createNode(graphType, {
      label: op.newNodeA.label,
      nodeType: op.newNodeA.nodeType,
      domain,
      description: op.newNodeA.description,
      properties: op.newNodeA.properties,
    });

    const nodeB = await repo.createNode(graphType, {
      label: op.newNodeB.label,
      nodeType: op.newNodeB.nodeType,
      domain,
      description: op.newNodeB.description,
      properties: op.newNodeB.properties,
    });

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
  // Cross-DB Consistency: Retry & Reconciliation (4.1)
  // ==========================================================================

  /** Maximum retry attempts for Postgres state update after Neo4j commit. */
  private static readonly PG_RETRY_MAX = 3;

  /** Base delay (ms) for exponential backoff on Postgres retry. */
  private static readonly PG_RETRY_BASE_DELAY_MS = 200;

  /** Threshold (ms) for detecting stuck committing mutations. */
  private static readonly STUCK_COMMITTING_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Retry Postgres state update with exponential backoff.
   *
   * After Neo4j has committed, the Postgres state update is the most critical
   * step — failure leaves a cross-DB inconsistency. Retrying with backoff
   * reduces the window of inconsistency for transient failures.
   */
  private async retryPostgresStateUpdate(
    mutation: ICkgMutation,
    targetState: MutationState,
    reason: string,
    context: IExecutionContext,
    snapshot?: Metadata
  ): Promise<ICkgMutation> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= CkgMutationPipeline.PG_RETRY_MAX; attempt++) {
      try {
        return await this.transitionState(
          mutation,
          targetState,
          'system',
          reason,
          context,
          snapshot
        );
      } catch (error: unknown) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);

        if (attempt < CkgMutationPipeline.PG_RETRY_MAX) {
          const delayMs = CkgMutationPipeline.PG_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          this.logger.warn(
            {
              mutationId: mutation.mutationId,
              attempt,
              maxAttempts: CkgMutationPipeline.PG_RETRY_MAX,
              delayMs,
              error: message,
            },
            'Postgres state update failed — retrying with backoff'
          );
          await this.sleep(delayMs);
        } else {
          kgCounters.increment(KG_COUNTERS.CROSS_DB_INCONSISTENCIES, {
            mutation: mutation.mutationId as string,
          });
          this.logger.error(
            {
              mutationId: mutation.mutationId,
              attempt,
              error: message,
              reconciliationNeeded: true,
            },
            'CROSS-DB INCONSISTENCY: Neo4j commit succeeded but all Postgres retry ' +
              'attempts failed. Mutation data is in Neo4j but state is still COMMITTING. ' +
              'Reconciliation sweep will resolve this automatically.'
          );
        }
      }
    }
    throw lastError;
  }

  /**
   * Reconcile mutations stuck in COMMITTING state.
   *
   * If a mutation has been in COMMITTING for longer than the threshold,
   * it means the Postgres state update failed after Neo4j committed.
   * Since Neo4j data is already applied, we transition to COMMITTED.
   *
   * Called periodically from service startup or a scheduled job.
   */
  async reconcileStuckCommitting(context: IExecutionContext): Promise<number> {
    const stuck = await this.mutationRepository.findMutationsByState('committing');
    let reconciledCount = 0;

    for (const mutation of stuck) {
      const updatedAt = new Date(mutation.updatedAt).getTime();
      const ageMs = Date.now() - updatedAt;

      if (ageMs < CkgMutationPipeline.STUCK_COMMITTING_THRESHOLD_MS) {
        // Not stuck yet — might still be processing
        continue;
      }

      try {
        this.logger.warn(
          { mutationId: mutation.mutationId, ageMs, state: mutation.state },
          'Reconciling stuck COMMITTING mutation — Neo4j data assumed committed'
        );

        await this.transitionState(
          mutation,
          'committed',
          'system:reconciliation',
          `Reconciled from stuck COMMITTING state after ${String(Math.round(ageMs / 1000))}s. ` +
            'Neo4j operations assumed committed. Resolved by periodic reconciliation sweep.',
          context,
          { reconciledFrom: 'committing', ageMs }
        );
        reconciledCount++;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          { mutationId: mutation.mutationId, error: message },
          'Failed to reconcile stuck committing mutation'
        );
      }
    }

    if (reconciledCount > 0) {
      this.logger.info(
        { reconciledCount },
        'Reconciliation sweep completed — stuck COMMITTING mutations resolved'
      );
    }

    return reconciledCount;
  }

  async rejectStuckMutation(
    mutationId: MutationId,
    actorId: string,
    reason: string,
    context: IExecutionContext
  ): Promise<ICkgMutation> {
    const mutation = await this.getMutation(mutationId);

    if (isTerminalState(mutation.state)) {
      throw new MutationAlreadyCommittedError(mutationId, mutation.state);
    }

    return this.transitionState(
      mutation,
      'rejected',
      actorId,
      `Manual operator recovery rejected stuck mutation: ${reason}`,
      context,
      { recoveredFrom: mutation.state, manualRecovery: true }
    );
  }

  async reconcileMutationCommit(
    mutationId: MutationId,
    actorId: string,
    reason: string,
    context: IExecutionContext
  ): Promise<ICkgMutation> {
    const mutation = await this.getMutation(mutationId);

    if (mutation.state !== 'committing') {
      throw new InvalidStateTransitionError(mutation.state, 'committed', [
        'Only COMMITTING mutations can be manually reconciled',
      ]);
    }

    return this.transitionState(
      mutation,
      'committed',
      actorId,
      `Manual operator reconciliation from COMMITTING: ${reason}`,
      context,
      { reconciledFrom: 'committing', manualRecovery: true }
    );
  }

  /** Async sleep helper for retry backoff. */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
        try {
          // Increment recovery counter first
          await this.mutationRepository.incrementRecoveryAttempts(mutation.mutationId);

          // If max attempts exceeded, permanently reject instead of retrying
          if (mutation.recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
            this.logger.warn(
              {
                mutationId: mutation.mutationId,
                state: mutation.state,
                recoveryAttempts: mutation.recoveryAttempts + 1,
              },
              'Stuck mutation exceeded max recovery attempts — permanently rejecting'
            );

            await this.transitionState(
              mutation,
              'rejected',
              'system:recovery',
              `Permanently rejected after ${String(mutation.recoveryAttempts + 1)} recovery attempts. ` +
                `Stuck in ${state} state. Manual intervention required.`,
              context,
              { recoveredFrom: state, permanentlyRejected: true }
            );
          } else {
            this.logger.warn(
              {
                mutationId: mutation.mutationId,
                state: mutation.state,
                recoveryAttempts: mutation.recoveryAttempts + 1,
              },
              'Found stuck mutation — rejecting for retry'
            );

            await this.transitionState(
              mutation,
              'rejected',
              'system:recovery',
              `Stuck in ${state} state — rejected during recovery scan (attempt ${String(mutation.recoveryAttempts + 1)}/${String(MAX_RECOVERY_ATTEMPTS)}). ` +
                'Original proposer can retry with retryMutation.',
              context,
              { recoveredFrom: state }
            );
          }
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
