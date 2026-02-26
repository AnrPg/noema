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
  // Graph errors
  CyclicEdgeError,
  // Base errors
  DomainError,
  DuplicateNodeError,
  EdgeNotFoundError,
  GraphConsistencyError,
  // Misconception errors
  InterventionTemplateNotFoundError,
  InvalidEdgeTypeError,
  InvalidMisconceptionStateTransitionError,
  // Mutation errors
  InvalidStateTransitionError,
  MaxDepthExceededError,
  MisconceptionPatternNotFoundError,
  MutationAlreadyCommittedError,
  MutationConflictError,
  MutationNotFoundError,
  NodeNotFoundError,
  OrphanEdgeError,
  RateLimitExceededError,
  UnauthorizedError,
  ValidationError,
  ValidationFailedError,
  isDomainError,
  isInterventionTemplateNotFoundError,
  isInvalidMisconceptionStateTransitionError,
  isInvalidStateTransitionError,
  isMisconceptionPatternNotFoundError,
  isMutationAlreadyCommittedError,
  isMutationConflictError,
  isMutationNotFoundError,
  isValidationError,
  isValidationFailedError,
} from './errors/index.js';

// ============================================================================
// Value Objects
// ============================================================================

export {
  // Comparison
  DivergenceSeverity,
  DivergenceType,
  // Graph value objects
  EdgePolicy,
  NodeFilter,
  // Operation log
  PkgOperationType,
  // Branded numerics
  PositiveDepth,
  // Promotion band
  PromotionBandUtil,
  TraversalOptions,
  ValidationOptions,
} from './value-objects/index.js';

export type {
  // Comparison
  DivergenceSeverityType,
  DivergenceTypeType,
  // Graph value objects
  IEdgePolicy,
  IGraphComparison,
  INodeFilter,
  // Operation log
  IPkgBatchImportOp,
  IPkgEdgeCreatedOp,
  IPkgEdgeDeletedOp,
  IPkgNodeCreatedOp,
  IPkgNodeDeletedOp,
  IPkgNodeUpdatedOp,
  IStructuralDivergence,
  ITraversalOptions,
  IValidationOptions,
  PkgAtomicOperation,
  PkgOperation,
  PkgOperationTypeUnion,
  PositiveDepthType,
  TraversalDirection,
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
  IUpdateEdgeInput,
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
  IInterventionTemplate,
  // Misconception repository
  IMisconceptionPattern,
  IMisconceptionRecord,
  IMisconceptionRepository,
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
  // Metrics staleness repository
  IMetricsStalenessRecord,
  IMetricsStalenessRepository,
} from './metrics-staleness.repository.js';

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
// Service Implementation
// ============================================================================

export { KnowledgeGraphService } from './knowledge-graph.service.impl.js';

// ============================================================================
// Validation Schemas (Zod)
// ============================================================================

export {
  CreateEdgeInputSchema,
  CreateNodeInputSchema,
  EdgeFilterSchema,
  PaginationSchema,
  UpdateEdgeInputSchema,
  UpdateNodeInputSchema,
} from './knowledge-graph.schemas.js';

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

export { KnowledgeGraphEventType } from './domain-events.js';

export type {
  CkgDomainEvent,
  CkgMutationCommittedEvent,
  CkgMutationProposedEvent,
  CkgMutationRejectedEvent,
  CkgMutationValidatedEvent,
  CkgNodePromotedEvent,
  ICkgMutationCommittedPayload,
  // CKG events
  ICkgMutationProposedPayload,
  ICkgMutationRejectedPayload,
  ICkgMutationValidatedPayload,
  ICkgNodePromotedPayload,
  IEventMetadata,
  IInterventionTriggeredPayload,
  IMetacognitiveStageTransitionedPayload,
  // Metacognitive events
  IMisconceptionDetectedPayload,
  IPkgEdgeCreatedPayload,
  IPkgEdgeRemovedPayload,
  IPkgEdgeUpdatedPayload,
  // PKG events
  IPkgNodeCreatedPayload,
  IPkgNodeRemovedPayload,
  IPkgNodeUpdatedPayload,
  IPkgStructuralMetricsUpdatedPayload,
  InterventionTriggeredEvent,
  KnowledgeGraphDomainEvent,
  MetacognitiveDomainEvent,
  MetacognitiveStageTransitionedEvent,
  MisconceptionDetectedEvent,
  PkgDomainEvent,
  PkgEdgeCreatedEvent,
  PkgEdgeRemovedEvent,
  PkgEdgeUpdatedEvent,
  // Typed events
  PkgNodeCreatedEvent,
  PkgNodeRemovedEvent,
  PkgNodeUpdatedEvent,
  PkgStructuralMetricsUpdatedEvent,
} from './domain-events.js';
