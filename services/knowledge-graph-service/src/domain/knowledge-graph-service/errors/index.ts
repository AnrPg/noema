/**
 * @noema/knowledge-graph-service - Domain Errors Barrel Export
 *
 * Re-exports all domain error classes, type guards, and the base
 * DomainError abstract class.
 */

// Base
export {
  DomainError,
  isDomainError,
  isValidationError,
  RateLimitExceededError,
  UnauthorizedError,
  ValidationError,
} from './base.errors.js';

// Graph
export {
  CyclicEdgeError,
  DuplicateNodeError,
  EdgeNotFoundError,
  GraphConsistencyError,
  GraphSnapshotNotFoundError,
  InvalidEdgeTypeError,
  MaxDepthExceededError,
  NodeNotFoundError,
  OrphanEdgeError,
} from './graph.errors.js';

// Mutation
export {
  InvalidStateTransitionError,
  isInvalidStateTransitionError,
  isMutationAlreadyCommittedError,
  isMutationConflictError,
  isMutationNotFoundError,
  isValidationFailedError,
  MutationAlreadyCommittedError,
  MutationConflictError,
  MutationNotFoundError,
  ValidationFailedError,
} from './mutation.errors.js';

// Misconception
export {
  InterventionTemplateNotFoundError,
  InvalidMisconceptionStateTransitionError,
  isInterventionTemplateNotFoundError,
  isInvalidMisconceptionStateTransitionError,
  isMisconceptionPatternNotFoundError,
  MisconceptionPatternNotFoundError,
} from './misconception.errors.js';
