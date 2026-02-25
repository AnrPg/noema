/**
 * @noema/knowledge-graph-service - Mutation Domain Errors
 *
 * Error classes for the CKG mutation typestate pipeline:
 * lifecycle transitions, conflict detection, and validation outcomes.
 */

import { DomainError } from './base.errors.js';

// ============================================================================
// Mutation Lifecycle Errors
// ============================================================================

/**
 * Thrown when a CKG mutation cannot be found.
 * Maps to HTTP 404.
 */
export class MutationNotFoundError extends DomainError {
  public readonly mutationId: string;

  constructor(mutationId: string) {
    super('MUTATION_NOT_FOUND', `Mutation not found: ${mutationId}`, { mutationId });
    this.mutationId = mutationId;
  }
}

/**
 * Thrown when a typestate transition is not permitted.
 *
 * The CKG mutation pipeline enforces a strict typestate machine:
 * PROPOSED → VALIDATING → VALIDATED → PROVING → PROVEN → COMMITTING → COMMITTED
 * Any state can also transition to REJECTED.
 *
 * Maps to HTTP 422.
 */
export class InvalidStateTransitionError extends DomainError {
  public readonly currentState: string;
  public readonly targetState: string;
  public readonly allowedTargets: readonly string[];

  constructor(currentState: string, targetState: string, allowedTargets: readonly string[]) {
    super(
      'INVALID_STATE_TRANSITION',
      `Cannot transition from '${currentState}' to '${targetState}'. ` +
        `Allowed transitions: [${allowedTargets.join(', ')}]`,
      { currentState, targetState, allowedTargets }
    );
    this.currentState = currentState;
    this.targetState = targetState;
    this.allowedTargets = allowedTargets;
  }
}

/**
 * Thrown on optimistic locking failure — the mutation was modified concurrently.
 * Maps to HTTP 409.
 */
export class MutationConflictError extends DomainError {
  public readonly mutationId: string;
  public readonly expectedVersion: number;
  public readonly actualVersion: number;

  constructor(mutationId: string, expectedVersion: number, actualVersion: number) {
    super(
      'MUTATION_CONFLICT',
      `Mutation '${mutationId}' was modified concurrently. ` +
        `Expected version ${String(expectedVersion)}, found ${String(actualVersion)}.`,
      { mutationId, expectedVersion, actualVersion }
    );
    this.mutationId = mutationId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

/**
 * Thrown when a mutation fails one or more validation stages.
 * Maps to HTTP 422.
 */
export class ValidationFailedError extends DomainError {
  public readonly mutationId: string;
  public readonly failedStages: readonly string[];
  public readonly violationCount: number;

  constructor(mutationId: string, failedStages: readonly string[], violationCount: number) {
    super(
      'VALIDATION_FAILED',
      `Mutation '${mutationId}' failed validation. ` +
        `Failed stages: [${failedStages.join(', ')}], ${String(violationCount)} violation(s).`,
      { mutationId, failedStages, violationCount }
    );
    this.mutationId = mutationId;
    this.failedStages = failedStages;
    this.violationCount = violationCount;
  }
}

/**
 * Thrown when attempting to modify a mutation in a terminal state (COMMITTED or REJECTED).
 * Maps to HTTP 409.
 */
export class MutationAlreadyCommittedError extends DomainError {
  public readonly mutationId: string;
  public readonly terminalState: string;

  constructor(mutationId: string, terminalState: string) {
    super(
      'MUTATION_ALREADY_COMMITTED',
      `Mutation '${mutationId}' is already in terminal state '${terminalState}' and cannot be modified.`,
      { mutationId, terminalState }
    );
    this.mutationId = mutationId;
    this.terminalState = terminalState;
  }
}

// ============================================================================
// Type Guards
// ============================================================================

export function isMutationNotFoundError(error: unknown): error is MutationNotFoundError {
  return error instanceof MutationNotFoundError;
}

export function isInvalidStateTransitionError(
  error: unknown
): error is InvalidStateTransitionError {
  return error instanceof InvalidStateTransitionError;
}

export function isMutationConflictError(error: unknown): error is MutationConflictError {
  return error instanceof MutationConflictError;
}

export function isValidationFailedError(error: unknown): error is ValidationFailedError {
  return error instanceof ValidationFailedError;
}

export function isMutationAlreadyCommittedError(
  error: unknown
): error is MutationAlreadyCommittedError {
  return error instanceof MutationAlreadyCommittedError;
}
