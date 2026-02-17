/**
 * @noema/user-service - Domain Errors
 *
 * Custom error classes for user service domain exceptions.
 * These follow the domain error pattern for consistent error handling.
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
 * Thrown when credentials are invalid.
 */
export class InvalidCredentialsError extends AuthenticationError {
  constructor() {
    super('Invalid email/username or password');
  }
}

/**
 * Thrown when MFA code is invalid.
 */
export class InvalidMfaCodeError extends AuthenticationError {
  constructor() {
    super('Invalid MFA code');
  }
}

/**
 * Thrown when account is locked.
 */
export class AccountLockedError extends AuthenticationError {
  public readonly lockedUntil: string;

  constructor(lockedUntil: string) {
    super(`Account is locked until ${lockedUntil}`);
    this.lockedUntil = lockedUntil;
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
 * Thrown when a user is not found.
 */
export class UserNotFoundError extends DomainError {
  public readonly userId: string;

  constructor(identifier: string) {
    super('USER_NOT_FOUND', `User not found: ${identifier}`, { identifier });
    this.userId = identifier;
  }
}

// ============================================================================
// Conflict Errors
// ============================================================================

/**
 * Thrown when email already exists.
 */
export class EmailAlreadyExistsError extends DomainError {
  constructor(email: string) {
    super('EMAIL_ALREADY_EXISTS', 'An account with this email already exists', {
      email,
    });
  }
}

/**
 * Thrown when username already exists.
 */
export class UsernameAlreadyExistsError extends DomainError {
  constructor(username: string) {
    super('USERNAME_ALREADY_EXISTS', 'This username is already taken', {
      username,
    });
  }
}

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
    super('BUSINESS_RULE_VIOLATION', message, details);
  }
}

/**
 * Thrown when account status prevents an action.
 */
export class InvalidAccountStatusError extends BusinessRuleError {
  public readonly status: string;

  constructor(status: string, action: string) {
    super(`Cannot ${action} when account status is ${status}`, { status, action });
    this.status = status;
  }
}

/**
 * Thrown when email is not verified.
 */
export class EmailNotVerifiedError extends BusinessRuleError {
  constructor() {
    super('Email address must be verified before performing this action');
  }
}

/**
 * Thrown when password doesn't meet requirements.
 */
export class WeakPasswordError extends BusinessRuleError {
  constructor(requirements: string[]) {
    super(`Password does not meet requirements: ${requirements.join(', ')}`, {
      requirements,
    });
  }
}

/**
 * Thrown when too many login attempts.
 */
export class TooManyLoginAttemptsError extends BusinessRuleError {
  public readonly remainingAttempts: number;

  constructor(remainingAttempts: number) {
    super(
      remainingAttempts > 0
        ? `Too many failed login attempts. ${remainingAttempts} attempts remaining.`
        : 'Account has been locked due to too many failed login attempts.'
    );
    this.remainingAttempts = remainingAttempts;
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
