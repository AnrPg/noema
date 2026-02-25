/**
 * @noema/knowledge-graph-service - Misconception Domain Errors
 *
 * Error classes for misconception pattern matching and intervention management.
 */

import { DomainError } from './base.errors.js';

// ============================================================================
// Misconception Errors
// ============================================================================

/**
 * Thrown when a misconception pattern definition cannot be found.
 * Maps to HTTP 404.
 */
export class MisconceptionPatternNotFoundError extends DomainError {
  public readonly patternId: string;

  constructor(patternId: string) {
    super('MISCONCEPTION_PATTERN_NOT_FOUND', `Misconception pattern not found: ${patternId}`, {
      patternId,
    });
    this.patternId = patternId;
  }
}

/**
 * Thrown when an intervention template cannot be found.
 * Maps to HTTP 404.
 */
export class InterventionTemplateNotFoundError extends DomainError {
  public readonly templateId: string;

  constructor(templateId: string) {
    super('INTERVENTION_TEMPLATE_NOT_FOUND', `Intervention template not found: ${templateId}`, {
      templateId,
    });
    this.templateId = templateId;
  }
}

/**
 * Thrown when a misconception status transition is not allowed.
 *
 * Valid transitions:
 *   detected → confirmed → addressed → resolved
 *   resolved → recurring → confirmed (recurrence loop)
 *
 * Maps to HTTP 422.
 */
export class InvalidMisconceptionStateTransitionError extends DomainError {
  public readonly currentStatus: string;
  public readonly targetStatus: string;

  constructor(currentStatus: string, targetStatus: string) {
    super(
      'INVALID_MISCONCEPTION_STATE_TRANSITION',
      `Cannot transition misconception from '${currentStatus}' to '${targetStatus}'.`,
      { currentStatus, targetStatus }
    );
    this.currentStatus = currentStatus;
    this.targetStatus = targetStatus;
  }
}

// ============================================================================
// Type Guards
// ============================================================================

export function isMisconceptionPatternNotFoundError(
  error: unknown
): error is MisconceptionPatternNotFoundError {
  return error instanceof MisconceptionPatternNotFoundError;
}

export function isInterventionTemplateNotFoundError(
  error: unknown
): error is InterventionTemplateNotFoundError {
  return error instanceof InterventionTemplateNotFoundError;
}

export function isInvalidMisconceptionStateTransitionError(
  error: unknown
): error is InvalidMisconceptionStateTransitionError {
  return error instanceof InvalidMisconceptionStateTransitionError;
}
