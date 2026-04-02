/**
 * @noema/knowledge-graph-service - CKG Typestate Machine
 *
 * Implements the typestate pattern for the CKG mutation pipeline.
 * The state machine governs the lifecycle of every mutation:
 *
 *   PROPOSED → VALIDATING → VALIDATED → PROVING → PROVEN → COMMITTING → COMMITTED
 *                  ↓             ↓          ↓         ↓          ↓
 *               REJECTED     REJECTED   REJECTED  REJECTED   REJECTED
 *                  ↓
 *            PENDING_REVIEW → VALIDATED
 *                  ↑             ↑
 *                  └────── PROVING
 *                  ↓        ↓
 *               REJECTED  REVISION_REQUESTED → PROPOSED
 *                                            ↓
 *                                         REJECTED
 *
 * TypeScript enforcement:
 * - State transition rules encoded as a const transition table
 * - Transition functions narrow the type: only mutations in the correct
 *   state can call a given transition function
 * - Every transition produces an audit log entry
 *
 * The PROVING/PROVEN stages are pass-through for Phase 6 (no TLA+ proofs).
 * They auto-transition with an "auto-approved: proof not required" audit entry.
 */

import type { MutationState } from '@noema/types';

// ============================================================================
// State Transition Table
// ============================================================================

/**
 * Valid state transitions for the CKG mutation pipeline.
 *
 * Each key is a current state; the value is the set of states it's
 * allowed to transition to. COMMITTED and REJECTED are terminal.
 */
export const STATE_TRANSITIONS: Readonly<Record<MutationState, readonly MutationState[]>> =
  Object.freeze({
    proposed: ['validating', 'rejected'] as const,
    validating: ['validated', 'pending_review', 'rejected'] as const,
    validated: ['proving', 'rejected'] as const,
    proving: ['proven', 'pending_review', 'rejected'] as const,
    proven: ['committing', 'rejected'] as const,
    committing: ['committed', 'rejected'] as const,
    committed: [] as const,
    rejected: [] as const,
    pending_review: ['validated', 'revision_requested', 'rejected'] as const,
    revision_requested: ['proposed', 'rejected'] as const,
  });

/**
 * Terminal states — no further transitions allowed.
 */
export const TERMINAL_STATES: ReadonlySet<MutationState> = new Set<MutationState>([
  'committed',
  'rejected',
]);

/**
 * States that can be cancelled by the proposing agent.
 * Only early-stage mutations can be cancelled.
 */
export const CANCELLABLE_STATES: ReadonlySet<MutationState> = new Set<MutationState>([
  'proposed',
  'validating',
  'pending_review',
  'revision_requested',
]);

// ============================================================================
// Transition Validation
// ============================================================================

/**
 * Check whether a state transition is valid.
 *
 * @param from Current mutation state.
 * @param to Target state.
 * @returns `true` if the transition is allowed.
 */
export function isValidTransition(from: MutationState, to: MutationState): boolean {
  const allowed = STATE_TRANSITIONS[from];
  return allowed.includes(to);
}

/**
 * Get the list of states reachable from a given state.
 *
 * @param from Current mutation state.
 * @returns Array of valid target states.
 */
export function getAllowedTransitions(from: MutationState): readonly MutationState[] {
  return STATE_TRANSITIONS[from];
}

/**
 * Check whether a state is terminal (no further transitions possible).
 */
export function isTerminalState(state: MutationState): boolean {
  return TERMINAL_STATES.has(state);
}

/**
 * Check whether a mutation in this state can be cancelled.
 */
export function isCancellableState(state: MutationState): boolean {
  return CANCELLABLE_STATES.has(state);
}

// ============================================================================
// Typestate Wrapper Types
// ============================================================================

/**
 * Base mutation state wrapper.
 *
 * While TypeScript can't enforce phantom types like Rust, we use
 * branded-style types where transition functions accept only mutations
 * in specific states and return mutations in the next state.
 *
 * Example:
 *   `startValidation(m: MutationInState<'proposed'>): MutationInState<'validating'>`
 *
 * @internal Reserved for Phase 8 typestate narrowing at call sites.
 */
export interface IMutationInState<S extends MutationState> {
  readonly mutationId: string;
  readonly state: S;
  readonly version: number;
}

/**
 * A state transition record for the audit log.
 *
 * @internal The pipeline uses IMutationAuditEntry directly.
 * Retained for external consumers of the typestate API.
 */
export interface IStateTransition {
  /** State before the transition */
  readonly fromState: MutationState;
  /** State after the transition */
  readonly toState: MutationState;
  /** Who/what performed the transition */
  readonly performedBy: string;
  /** Reason or context for the transition */
  readonly reason: string;
  /** When the transition occurred */
  readonly timestamp: string;
}

// ============================================================================
// Transition Functions (Typestate Narrowing)
// ============================================================================

/**
 * Validate a state transition and throw a descriptive Error if invalid.
 *
 * @internal The pipeline calls `isValidTransition` directly
 * and throws `InvalidStateTransitionError`. Retained for external consumers
 * that may prefer the throwing-style API.
 *
 * @throws Error if the transition is not allowed.
 */
export function validateTransition(from: MutationState, to: MutationState): void {
  if (!isValidTransition(from, to)) {
    const allowed = getAllowedTransitions(from);
    // Caller wraps this in InvalidStateTransitionError
    throw new Error(
      `Invalid state transition: ${from} → ${to}. ` + `Allowed: [${allowed.join(', ')}]`
    );
  }
}

/**
 * Compute the next "happy path" state after a given state.
 * Used by the pipeline to determine the next stage to process.
 *
 * @internal The pipeline hard-codes its stage sequence.
 * Useful for generic pipeline orchestrators or external callers.
 *
 * @returns The next non-REJECTED state, or null if the state is terminal.
 */
export function getNextHappyPathState(state: MutationState): MutationState | null {
  const transitions = STATE_TRANSITIONS[state];
  // The first transition in each array is the happy path (non-REJECTED)
  const happyPath = transitions.find((t) => t !== 'rejected');
  return happyPath ?? null;
}
