/**
 * @noema/knowledge-graph-service - CKG Mutation Pipeline Interface
 *
 * DI-friendly interface for the CKG mutation pipeline. Services and tests
 * depend on this interface rather than the concrete `CkgMutationPipeline`
 * class. This enables:
 *
 * - **Mock injection** in unit tests without importing the full pipeline
 * - **Decorator composition** (e.g., logged/metered pipeline wrappers)
 * - **Explicit public contract** — only the methods declared here are
 *   considered part of the public API
 *
 * The concrete implementation is in `ckg-mutation-pipeline.ts`.
 */

import type { MutationId, ProposerId } from '@noema/types';

import type { CkgMutationOperation } from './ckg-mutation-dsl.js';
import type { IExecutionContext } from './execution-context.js';
import type { ICkgMutation, IMutationAuditEntry } from './mutation.repository.js';

// ============================================================================
// ICkgMutationPipeline
// ============================================================================

export interface ICkgMutationPipeline {
  /**
   * Propose a new CKG mutation.
   * Creates the mutation in PROPOSED state and fires async validation.
   */
  proposeMutation(
    proposerId: ProposerId,
    operations: CkgMutationOperation[],
    rationale: string,
    evidenceCount: number,
    priority: number,
    context: IExecutionContext
  ): Promise<ICkgMutation>;

  /**
   * Get a mutation by ID.
   * @throws MutationNotFoundError if not found.
   */
  getMutation(mutationId: MutationId): Promise<ICkgMutation>;

  /**
   * List all non-terminal mutations.
   */
  listActiveMutations(): Promise<ICkgMutation[]>;

  /**
   * Cancel a mutation (only PROPOSED or VALIDATING).
   */
  cancelMutation(mutationId: MutationId, context: IExecutionContext): Promise<ICkgMutation>;

  /**
   * Retry a rejected mutation — creates a NEW mutation with the same operations.
   */
  retryMutation(mutationId: MutationId, context: IExecutionContext): Promise<ICkgMutation>;

  /**
   * Get the full audit log for a mutation.
   */
  getAuditLog(mutationId: MutationId): Promise<IMutationAuditEntry[]>;

  /**
   * Approve an escalated mutation (PENDING_REVIEW → VALIDATED).
   */
  approveMutation(
    mutationId: MutationId,
    reviewerId: string,
    reason: string,
    context: IExecutionContext
  ): Promise<ICkgMutation>;

  /**
   * Reject an escalated mutation (PENDING_REVIEW → REJECTED).
   */
  rejectEscalatedMutation(
    mutationId: MutationId,
    reviewerId: string,
    reason: string,
    context: IExecutionContext
  ): Promise<ICkgMutation>;

  /**
   * Record aggregation evidence and create a mutation proposal.
   */
  proposeFromAggregation(
    operations: CkgMutationOperation[],
    rationale: string,
    evidenceCount: number,
    context: IExecutionContext
  ): Promise<ICkgMutation>;

  /**
   * Get pipeline health metrics.
   */
  getPipelineHealth(): Promise<{
    proposedCount: number;
    validatingCount: number;
    validatedCount: number;
    pendingReviewCount: number;
    committedCount: number;
    rejectedCount: number;
    stuckCount: number;
  }>;

  /**
   * Return in-process pipeline failure/success counters (4.8).
   * Counters reset on service restart.
   */
  getPipelineErrorMetrics(): {
    pipelineSuccessCount: number;
    pipelineFailureCount: number;
    postReviewSuccessCount: number;
    postReviewFailureCount: number;
    lastFailureTimestamp: string | null;
    lastFailureMutationId: string | null;
  };

  /**
   * Run the full pipeline for a mutation asynchronously.
   */
  runPipelineAsync(mutationId: MutationId, context: IExecutionContext): Promise<void>;

  /**
   * Recover stuck mutations that have been in a non-terminal processing
   * state for too long.
   */
  recoverStuckMutations(context: IExecutionContext): Promise<number>;

  /**
   * Reconcile mutations stuck in COMMITTING state due to cross-DB
   * inconsistency (Neo4j committed but Postgres state update failed).
   * Transitions them to COMMITTED after a safety threshold.
   */
  reconcileStuckCommitting(context: IExecutionContext): Promise<number>;
}
