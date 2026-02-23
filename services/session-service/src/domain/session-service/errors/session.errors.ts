/**
 * @noema/session-service - Domain Errors
 *
 * Custom error classes for session service domain exceptions.
 * Follows the canonical DomainError hierarchy pattern.
 */

// ============================================================================
// Base Domain Error
// ============================================================================

/**
 * Base class for all domain errors.
 */
export abstract class DomainError extends Error {
  public readonly code: string;
  public readonly timestamp: string;
  public readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.timestamp = new Date().toISOString();
    if (details !== undefined) {
      this.details = details;
    }
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      timestamp: this.timestamp,
      details: this.details,
    };
  }
}

// ============================================================================
// Validation Errors
// ============================================================================

/**
 * Thrown when input validation fails.
 */
export class ValidationError extends DomainError {
  public readonly fieldErrors: Record<string, string[]>;

  constructor(message: string, fieldErrors: Record<string, string[]> = {}) {
    super('VALIDATION_ERROR', message, { fieldErrors });
    this.fieldErrors = fieldErrors;
  }
}

// ============================================================================
// Authentication & Authorization Errors
// ============================================================================

/**
 * Thrown when authentication fails.
 */
export class AuthenticationError extends DomainError {
  constructor(message: string = 'Authentication failed') {
    super('AUTHENTICATION_ERROR', message);
  }
}

/**
 * Thrown when user lacks permission.
 */
export class AuthorizationError extends DomainError {
  constructor(message: string = 'Access denied') {
    super('AUTHORIZATION_ERROR', message);
  }
}

// ============================================================================
// Not Found Errors
// ============================================================================

/**
 * Thrown when a session is not found.
 */
export class SessionNotFoundError extends DomainError {
  public readonly sessionId: string;

  constructor(sessionId: string) {
    super('SESSION_NOT_FOUND', `Session not found: ${sessionId}`, { sessionId });
    this.sessionId = sessionId;
  }
}

/**
 * Thrown when an attempt is not found.
 */
export class AttemptNotFoundError extends DomainError {
  public readonly attemptId: string;

  constructor(attemptId: string) {
    super('ATTEMPT_NOT_FOUND', `Attempt not found: ${attemptId}`, { attemptId });
    this.attemptId = attemptId;
  }
}

/**
 * Thrown when a queue item (card) is not found in the session queue.
 */
export class QueueItemNotFoundError extends DomainError {
  constructor(sessionId: string, cardId: string) {
    super('QUEUE_ITEM_NOT_FOUND', `Card ${cardId} not found in session ${sessionId} queue`, {
      sessionId,
      cardId,
    });
  }
}

// ============================================================================
// State Machine Errors
// ============================================================================

/**
 * Thrown when a session state transition is invalid.
 */
export class InvalidSessionStateError extends DomainError {
  public readonly currentState: string;
  public readonly attemptedAction: string;

  constructor(currentState: string, attemptedAction: string) {
    super('INVALID_SESSION_STATE', `Cannot ${attemptedAction} session in state "${currentState}"`, {
      currentState,
      attemptedAction,
    });
    this.currentState = currentState;
    this.attemptedAction = attemptedAction;
  }
}

/**
 * Thrown when a user already has an active session and concurrent sessions
 * are not permitted (business rule).
 * @deprecated Concurrent sessions are now allowed by policy.
 */
export class SessionAlreadyActiveError extends DomainError {
  public readonly existingSessionId: string;

  constructor(existingSessionId: string) {
    super('SESSION_ALREADY_ACTIVE', `User already has an active session: ${existingSessionId}`, {
      existingSessionId,
    });
    this.existingSessionId = existingSessionId;
  }
}

// ============================================================================
// Conflict Errors
// ============================================================================

/**
 * Thrown when optimistic concurrency check fails.
 */
export class VersionConflictError extends DomainError {
  public readonly expectedVersion: number;
  public readonly actualVersion: number;

  constructor(expectedVersion: number, actualVersion: number) {
    super(
      'VERSION_CONFLICT',
      `Version conflict: expected ${expectedVersion}, found ${actualVersion}`,
      { expectedVersion, actualVersion }
    );
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

// ============================================================================
// Business Rule Errors
// ============================================================================

/**
 * Thrown when a business rule is violated.
 */
export class BusinessRuleError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('BUSINESS_RULE_ERROR', message, details);
  }
}

/**
 * Thrown when queue manipulation fails.
 */
export class QueueError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('QUEUE_ERROR', message, details);
  }
}

export class OutboxDispatchError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('OUTBOX_DISPATCH_ERROR', message, details);
  }
}

// ============================================================================
// External Service Errors
// ============================================================================

/**
 * Thrown when an external service call fails.
 */
export class ExternalServiceError extends DomainError {
  public readonly serviceName: string;

  constructor(serviceName: string, message: string) {
    super('EXTERNAL_SERVICE_ERROR', `${serviceName}: ${message}`, { serviceName });
    this.serviceName = serviceName;
  }
}

// ============================================================================
// Type Guards
// ============================================================================

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

export function isSessionNotFoundError(error: unknown): error is SessionNotFoundError {
  return error instanceof SessionNotFoundError;
}

export function isAttemptNotFoundError(error: unknown): error is AttemptNotFoundError {
  return error instanceof AttemptNotFoundError;
}

export function isInvalidSessionStateError(error: unknown): error is InvalidSessionStateError {
  return error instanceof InvalidSessionStateError;
}

export function isVersionConflictError(error: unknown): error is VersionConflictError {
  return error instanceof VersionConflictError;
}
