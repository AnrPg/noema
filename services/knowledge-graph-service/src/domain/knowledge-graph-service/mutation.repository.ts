/**
 * @noema/knowledge-graph-service - Mutation Repository Interface
 *
 * Prisma/PostgreSQL abstraction for the CKG mutation pipeline workflow data.
 * Mutations live in PostgreSQL (not Neo4j) because they represent workflow
 * state — typestate machine transitions, audit trails, validation results —
 * classically relational data with strict ACID requirements.
 */

import type { Metadata, MutationId, MutationState, ProposerId } from '@noema/types';

// ============================================================================
// Mutation Data Types
// ============================================================================

/**
 * A CKG mutation record — the workflow entity for the typestate pipeline.
 */
export interface ICkgMutation {
  /** Unique mutation ID */
  readonly mutationId: MutationId;

  /** Current typestate */
  readonly state: MutationState;

  /** Agent or admin user that proposed the mutation */
  readonly proposedBy: ProposerId;

  /** Optimistic locking version (incremented on each state transition) */
  readonly version: number;

  /** The mutation's operations (DSL) */
  readonly operations: Metadata[];

  /** Human-readable justification */
  readonly rationale: string;

  /** Number of supporting evidence items */
  readonly evidenceCount: number;

  /** When the mutation was created (ISO 8601) */
  readonly createdAt: string;

  /** When the mutation was last updated (ISO 8601) */
  readonly updatedAt: string;

  /**
   * Number of recovery attempts for stuck mutations.
   * Incremented each time `recoverStuckMutations()` retries this mutation.
   * After exceeding `MAX_RECOVERY_ATTEMPTS`, the mutation is rejected.
   */
  readonly recoveryAttempts: number;

  /**
   * Number of revision cycles this mutation has been through.
   * Incremented each time a reviewer requests changes and the proposer resubmits.
   */
  readonly revisionCount: number;

  /**
   * Latest reviewer feedback requesting changes (null if no active revision request).
   */
  readonly revisionFeedback: string | null;
}

/**
 * An immutable audit log entry for a mutation.
 */
export interface IMutationAuditEntry {
  /** Which mutation this entry belongs to */
  readonly mutationId: MutationId;

  /** State transition: from */
  readonly fromState: MutationState;

  /** State transition: to */
  readonly toState: MutationState;

  /** Who performed the transition (agent or system) */
  readonly performedBy: string;

  /** Optional context for the transition (e.g., validation results) */
  readonly context?: Metadata;

  /** When the transition occurred (ISO 8601) */
  readonly timestamp: string;
}

/**
 * Input for creating a new CKG mutation.
 */
export interface ICreateMutationInput {
  readonly proposedBy: ProposerId;
  readonly operations: Metadata[];
  readonly rationale: string;
  readonly evidenceCount: number;
}

// ============================================================================
// IMutationRepository
// ============================================================================

/**
 * Repository for CKG mutation workflow state.
 *
 * All mutations begin in the PROPOSED state and follow the typestate
 * machine through validation, proving, and commitment.
 */
export interface IMutationRepository {
  /**
   * Create a new mutation in the PROPOSED state.
   */
  createMutation(input: ICreateMutationInput): Promise<ICkgMutation>;

  /**
   * Get a mutation by ID.
   * @returns The mutation, or null if not found.
   */
  getMutation(mutationId: MutationId): Promise<ICkgMutation | null>;

  /**
   * Update a mutation's state with optimistic locking.
   * @param mutationId The mutation to update.
   * @param newState The target typestate.
   * @param expectedVersion Expected version for optimistic lock.
   * @returns The updated mutation.
   * @throws MutationConflictError if version mismatch.
   */
  updateMutationState(
    mutationId: MutationId,
    newState: MutationState,
    expectedVersion: number
  ): Promise<ICkgMutation>;

  /**
   * Append an entry to the mutation's audit log (immutable, no updates).
   */
  appendAuditEntry(entry: Omit<IMutationAuditEntry, 'timestamp'>): Promise<IMutationAuditEntry>;

  /**
   * Get the full audit log for a mutation, ordered chronologically.
   */
  getAuditLog(mutationId: MutationId): Promise<IMutationAuditEntry[]>;

  /**
   * Find mutations by state (for pipeline processing — "give me all
   * VALIDATING mutations").
   */
  findMutationsByState(state: MutationState): Promise<ICkgMutation[]>;

  /**
   * Find mutations matching any of the given states in a single query.
   * Avoids N+1 sequential queries when listing multiple states.
   */
  findMutationsByStates(states: MutationState[]): Promise<ICkgMutation[]>;

  /**
   * Find mutations by proposer (agent or admin user).
   */
  findMutationsByProposer(proposerId: ProposerId): Promise<ICkgMutation[]>;

  /**
   * Count mutations by state (for monitoring dashboards).
   */
  countMutationsByState(state: MutationState): Promise<number>;

  /**
   * Find mutations matching composite filter criteria (state, proposer, date range).
   * Supports createdAfter / createdBefore for date filtering.
   */
  findMutations(filters: {
    state?: MutationState;
    proposedBy?: ProposerId;
    createdAfter?: string;
    createdBefore?: string;
  }): Promise<ICkgMutation[]>;

  /**
   * Atomically update mutation state AND append the audit log entry
   * within a single database transaction. Prevents inconsistency where
   * the state updates but the audit entry fails (or vice versa).
   */
  transitionStateWithAudit(
    mutationId: MutationId,
    newState: MutationState,
    expectedVersion: number,
    auditEntry: Omit<IMutationAuditEntry, 'timestamp'>
  ): Promise<{ mutation: ICkgMutation; audit: IMutationAuditEntry }>;

  /**
   * Atomically increment the recovery attempts counter for a stuck mutation.
   * @returns The updated mutation with the incremented counter.
   */
  incrementRecoveryAttempts(mutationId: MutationId): Promise<ICkgMutation>;

  /**
   * Update mutable non-state fields on a mutation (e.g. operations, revisionFeedback).
   * Does NOT require optimistic locking — used after a state transition has already locked.
   */
  updateMutationFields(
    mutationId: MutationId,
    fields: Partial<{
      operations: Metadata[];
      revisionFeedback: string | null;
      revisionCount: number;
      validationResult: Metadata | null;
      proofResult: Metadata | null;
      commitResult: Metadata | null;
      rejectionReason: string | null;
    }>
  ): Promise<ICkgMutation>;
}
