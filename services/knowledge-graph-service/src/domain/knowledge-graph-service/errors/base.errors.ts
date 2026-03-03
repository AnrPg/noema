/**
 * @noema/knowledge-graph-service - Base Domain Error
 *
 * Abstract base class for all domain errors in the knowledge-graph-service.
 * Follows the exact content-service DomainError pattern.
 */

// ============================================================================
// Base Domain Error
// ============================================================================

/**
 * Base class for all domain errors in the knowledge-graph-service.
 *
 * Each error carries a machine-readable `code` for deterministic mapping
 * to HTTP status codes in the API layer, a human-readable `message`, and
 * optional structured `details` for debugging.
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
// General Errors
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

/**
 * Thrown when a user lacks access to a graph region.
 * Maps to HTTP 403.
 */
export class UnauthorizedError extends DomainError {
  public readonly userId: string | undefined;
  public readonly resource: string | undefined;

  constructor(message = 'Access denied to this graph region', userId?: string, resource?: string) {
    super('UNAUTHORIZED', message, { userId, resource });
    this.userId = userId;
    this.resource = resource;
  }
}

/**
 * Thrown when the rate limit for graph operations is exceeded.
 * Maps to HTTP 429.
 */
export class RateLimitExceededError extends DomainError {
  public readonly limit: number;
  public readonly windowMs: number;

  constructor(limit: number, windowMs: number) {
    super(
      'RATE_LIMIT_EXCEEDED',
      `Rate limit exceeded: ${String(limit)} requests per ${String(windowMs)}ms`,
      { limit, windowMs }
    );
    this.limit = limit;
    this.windowMs = windowMs;
  }
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if error is a DomainError.
 *
 * @internal Not yet consumed — retained for API-layer error mapping.
 */
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

/**
 * Check if error is a ValidationError.
 *
 * @internal Not yet consumed — retained for API-layer error mapping.
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}
