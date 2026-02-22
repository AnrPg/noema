/**
 * @noema/session-service - Domain Errors Barrel Export
 */

export {
  AttemptNotFoundError,
  AuthenticationError,
  AuthorizationError,
  BusinessRuleError,
  DomainError,
  ExternalServiceError,
  InvalidSessionStateError,
  QueueError,
  QueueItemNotFoundError,
  SessionAlreadyActiveError,
  SessionNotFoundError,
  ValidationError,
  VersionConflictError,
  isAttemptNotFoundError,
  isDomainError,
  isInvalidSessionStateError,
  isSessionNotFoundError,
  isValidationError,
  isVersionConflictError,
} from './session.errors.js';
