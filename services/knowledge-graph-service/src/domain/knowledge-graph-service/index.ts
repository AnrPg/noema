/**
 * @noema/knowledge-graph-service - Domain Layer Barrel Export
 *
 * Re-exports the complete domain layer: errors, value objects, policies,
 * repository interfaces, service interface, validation pipeline, and
 * domain events.
 *
 * Zero infrastructure imports — this layer defines contracts only.
 */

// ============================================================================
// Errors
// ============================================================================

export {
  // Base errors
  DomainError,
  isDomainError,
  isValidationError,
  RateLimitExceededError,
  UnauthorizedError,
  ValidationError,
  // Graph errors
  CyclicEdgeError,
  DuplicateNodeError,
  EdgeNotFoundError,
  GraphConsistencyError,
  InvalidEdgeTypeError,
  MaxDepthExceededError,
  NodeNotFoundError,
  OrphanEdgeError,
  // Mutation errors
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
  // Misconception errors
  InterventionTemplateNotFoundError,
  InvalidMisconceptionStateTransitionError,
  isInterventionTemplateNotFoundError,
  isInvalidMisconceptionStateTransitionError,
  isMisconceptionPatternNotFoundError,
  MisconceptionPatternNotFoundError,
} from './errors/index.js';

// ============================================================================
// Value Objects
// ============================================================================

export {
  // Graph value objects
  EdgePolicy,
  NodeFilter,
  TraversalOptions,
  ValidationOptions,
  // Branded numerics
  PositiveDepth,
  // Comparison
  DivergenceSeverity,
  DivergenceType,
  // Operation log
  PkgOperationType,
  // Promotion band
  PromotionBandUtil,
} from './value-objects/index.js';

export type {
  // Graph value objects
  IEdgePolicy,
  INodeFilter,
  ITraversalOptions,
  IValidationOptions,
  TraversalDirection,
  PositiveDepthType,
  // Comparison
  DivergenceSeverityType,
  DivergenceTypeType,
  IGraphComparison,
  IStructuralDivergence,
  // Operation log
  IPkgBatchImportOp,
  IPkgEdgeCreatedOp,
  IPkgEdgeDeletedOp,
  IPkgNodeCreatedOp,
  IPkgNodeDeletedOp,
  IPkgNodeUpdatedOp,
  PkgAtomicOperation,
  PkgOperation,
  PkgOperationTypeUnion,
} from './value-objects/index.js';

// ============================================================================
// Policies
// ============================================================================

export { EDGE_TYPE_POLICIES, getEdgePolicy } from './policies/index.js';

// ============================================================================
// Repository Interfaces
// ============================================================================

export type {
  // Graph repository (split interfaces + composite)
  EdgeDirection,
  IBatchGraphRepository,
  ICreateEdgeInput,
  ICreateNodeInput,
  IEdgeFilter,
  IEdgeRepository,
  IGraphRepository,
  INodeRepository,
  ITraversalRepository,
  IUpdateNodeInput,
} from './graph.repository.js';

export type {
  // Mutation repository
  ICkgMutation,
  ICreateMutationInput,
  IMutationAuditEntry,
  IMutationRepository,
} from './mutation.repository.js';

export type {
  // Metrics repository
  IMetricSnapshot,
  IMetricsHistoryOptions,
  IMetricsRepository,
} from './metrics.repository.js';

export type {
  // Misconception repository
  IMisconceptionPattern,
  IMisconceptionRecord,
  IMisconceptionRepository,
  IInterventionTemplate,
  IRecordDetectionInput,
  IUpsertInterventionTemplateInput,
  IUpsertPatternInput,
} from './misconception.repository.js';

export type {
  // PKG operation log repository
  IPkgOperationLogEntry,
  IPkgOperationLogRepository,
} from './pkg-operation-log.repository.js';

export type {
  // Aggregation evidence repository
  IAggregationEvidence,
  IAggregationEvidenceRepository,
  IEvidenceSummary,
} from './aggregation-evidence.repository.js';

// ============================================================================
// Service Interface
// ============================================================================

export type {
  IExecutionContext,
  IKnowledgeGraphService,
  IServiceResult,
} from './knowledge-graph.service.js';

// ============================================================================
// Validation Pipeline
// ============================================================================

export type {
  IValidationContext,
  IValidationPipeline,
  IValidationResult,
  IValidationStage,
  IValidationStageResult,
  IValidationViolation,
} from './validation.js';

// ============================================================================
// Domain Events
// ============================================================================

export type { KnowledgeGraphEventType } from './domain-events.js';

export type {
  IEventMetadata,
  // PKG events
  IPkgNodeCreatedPayload,
  IPkgNodeUpdatedPayload,
  IPkgNodeRemovedPayload,
  IPkgEdgeCreatedPayload,
  IPkgEdgeRemovedPayload,
  IPkgStructuralMetricsUpdatedPayload,
  // CKG events
  ICkgMutationProposedPayload,
  ICkgMutationValidatedPayload,
  ICkgMutationCommittedPayload,
  ICkgMutationRejectedPayload,
  ICkgNodePromotedPayload,
  // Metacognitive events
  IMisconceptionDetectedPayload,
  IInterventionTriggeredPayload,
  IMetacognitiveStageTransitionedPayload,
  // Typed events
  PkgNodeCreatedEvent,
  PkgNodeUpdatedEvent,
  PkgNodeRemovedEvent,
  PkgEdgeCreatedEvent,
  PkgEdgeRemovedEvent,
  PkgStructuralMetricsUpdatedEvent,
  CkgMutationProposedEvent,
  CkgMutationValidatedEvent,
  CkgMutationCommittedEvent,
  CkgMutationRejectedEvent,
  CkgNodePromotedEvent,
  MisconceptionDetectedEvent,
  InterventionTriggeredEvent,
  MetacognitiveStageTransitionedEvent,
  PkgDomainEvent,
  CkgDomainEvent,
  MetacognitiveDomainEvent,
  KnowledgeGraphDomainEvent,
} from './domain-events.js';
