/**
 * @noema/content-service - Domain Errors
 *
 * Custom error classes for content service domain exceptions.
 * Follows the same domain error pattern as user-service.
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

  /**
   * Convert error to JSON for logging/API responses.
   */
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
// Authentication Errors
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
 * Thrown when token is invalid or expired.
 */
export class InvalidTokenError extends AuthenticationError {
  constructor(message: string = 'Invalid or expired token') {
    super(message);
  }
}

// ============================================================================
// Authorization Errors
// ============================================================================

/**
 * Thrown when user lacks permission.
 */
export class AuthorizationError extends DomainError {
  constructor(message: string = 'Access denied') {
    super('AUTHORIZATION_ERROR', message);
  }
}

/**
 * Thrown when user lacks required role.
 */
export class InsufficientRoleError extends AuthorizationError {
  public readonly requiredRoles: string[];

  constructor(requiredRoles: string[]) {
    super(`Requires one of these roles: ${requiredRoles.join(', ')}`);
    this.requiredRoles = requiredRoles;
  }
}

// ============================================================================
// Not Found Errors
// ============================================================================

/**
 * Thrown when a card is not found.
 */
export class CardNotFoundError extends DomainError {
  public readonly cardId: string;

  constructor(identifier: string) {
    super('CARD_NOT_FOUND', `Card not found: ${identifier}`, { identifier });
    this.cardId = identifier;
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

/**
 * Thrown when a duplicate card is detected (same content hash).
 */
export class DuplicateCardError extends DomainError {
  public readonly existingCardId: string;

  constructor(existingCardId: string) {
    super('DUPLICATE_CARD', `A card with identical content already exists: ${existingCardId}`, {
      existingCardId,
    });
    this.existingCardId = existingCardId;
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
    super('BUSINESS_RULE_VIOLATION', message, details);
  }
}

/**
 * Thrown when card state prevents an action.
 */
export class InvalidCardStateError extends BusinessRuleError {
  public readonly currentState: string;
  public readonly attemptedAction: string;

  constructor(currentState: string, attemptedAction: string) {
    super(`Cannot ${attemptedAction} when card state is ${currentState}`, {
      currentState,
      attemptedAction,
    });
    this.currentState = currentState;
    this.attemptedAction = attemptedAction;
  }
}

/**
 * Thrown when batch operation exceeds limits.
 */
export class BatchLimitExceededError extends BusinessRuleError {
  public readonly limit: number;
  public readonly requested: number;

  constructor(limit: number, requested: number) {
    super(`Batch limit exceeded: max ${limit}, requested ${requested}`, {
      limit,
      requested,
    });
    this.limit = limit;
    this.requested = requested;
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
    super('EXTERNAL_SERVICE_ERROR', `${serviceName}: ${message}`, {
      serviceName,
    });
    this.serviceName = serviceName;
  }
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if error is a DomainError.
 */
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

/**
 * Check if error is a ValidationError.
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

/**
 * Check if error is an AuthenticationError.
 */
export function isAuthenticationError(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError;
}

/**
 * Check if error is an AuthorizationError.
 */
export function isAuthorizationError(error: unknown): error is AuthorizationError {
  return error instanceof AuthorizationError;
}
