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
import type { IValidationPipeline, IValidationResult } from './validation.js';

import {
  type CkgMutationOperation,
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
      operations: operations as unknown as Metadata[],
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
        operations: operations as unknown as Metadata[],
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
      original.operations as unknown as CkgMutationOperation[],
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
    committedCount: number;
    rejectedCount: number;
    stuckCount: number;
  }> {
    const [proposed, validating, validated, committed, rejected] = await Promise.all([
      this.mutationRepository.countMutationsByState('proposed'),
      this.mutationRepository.countMutationsByState('validating'),
      this.mutationRepository.countMutationsByState('validated'),
      this.mutationRepository.countMutationsByState('committed'),
      this.mutationRepository.countMutationsByState('rejected'),
    ]);

    // "Stuck" = in non-terminal non-proposed state (could indicate processing failure)
    const proving = await this.mutationRepository.countMutationsByState('proving');
    const proven = await this.mutationRepository.countMutationsByState('proven');
    const committing = await this.mutationRepository.countMutationsByState('committing');
    const stuckCount = validating + proving + proven + committing;

    return {
      proposedCount: proposed,
      validatingCount: validating,
      validatedCount: validated,
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
   */
  private async runPipeline(mutationId: MutationId, context: IExecutionContext): Promise<void> {
    // Stage 1: PROPOSED → VALIDATING → run validation → VALIDATED/REJECTED
    let mutation = await this.getMutation(mutationId);
    mutation = await this.runValidationStage(mutation, context);

    if (mutation.state === 'rejected') return;

    // Stage 2: VALIDATED → PROVING → PROVEN (pass-through for Phase 6)
    mutation = await this.runProofStage(mutation, context);

    if (mutation.state === 'rejected') return;

    // Stage 3: PROVEN → COMMITTING → COMMITTED/REJECTED
    await this.runCommitStage(mutation, context);
  }

  // ==========================================================================
  // Pipeline Stages
  // ==========================================================================

  /**
   * Validation stage: PROPOSED → VALIDATING → VALIDATED or REJECTED.
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

    // Run the 4-stage validation pipeline
    const validationResult = await this.validationPipeline.validate(mutation, {
      correlationId: context.correlationId as string,
      shortCircuitOnError: true,
    });

    if (validationResult.passed) {
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
      // VALIDATING → REJECTED
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
      const operations = mutation.operations as unknown as CkgMutationOperation[];
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
    const operations = mutation.operations as unknown as CkgMutationOperation[];
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
