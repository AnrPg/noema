// =============================================================================
// AI BOUNDARY - Public API for AI Integration with LKGC
// =============================================================================
// This module provides the boundary layer between LKGC and AI components:
//
// Core principles:
// - AI never owns truth — it only proposes
// - LKGC is authoritative — it decides what is applied
// - All proposals are auditable
// - Human-in-the-loop is mandatory for irreversible/structural changes
//
// Components:
// - Snapshot types and builder for creating read-only AI inference contexts
// - Proposal types and validator for AI-suggested changes
// - Proposal applier for applying validated changes
// - Audit types and in-memory log for full traceability
//
// NO UI. NO REAL ML. LKGC IS AUTHORITATIVE.
// =============================================================================

// =============================================================================
// SNAPSHOT TYPES
// =============================================================================
export type {
  // Core snapshot types
  AISnapshot,
  SnapshotNode,
  SnapshotEdge,
  SnapshotMasteryState,
  SnapshotContext,
  SnapshotMetadata,
  SnapshotFeature,

  // Profile definition types
  SnapshotProfileDefinition,
  SnapshotProfileId,
  ProfileVersion,
  BuiltinProfileName,
  BudgetTier,
  SnapshotBudget,
  BoundedBudgetParam,
  ProfileBudgetBounds,
  TieredBudgets,
  BoundedTemporalParam,
  TemporalScope,
  ProfileTemporalBounds,
  GraphScope,
  ProfileGraphBounds,
  MasterySignalScope,
  ContextSignalScope,
  SnapshotPrivacyRules,
  ExpectedOutputType,
  ExpectedOutput,
  TargetSelectionCriteria,
  SnapshotRequest,
} from "./snapshot-types";

// =============================================================================
// SNAPSHOT PROFILES
// =============================================================================
export {
  // Concrete profiles
  SCHEDULING_SNAPSHOT_V1,
  CONFUSION_DETECTION_SNAPSHOT_V1,
  PREREQUISITE_GRAPH_SNAPSHOT_V1,
  STRATEGY_EFFICACY_SNAPSHOT_V1,
  CALIBRATION_TRAINING_SNAPSHOT_V1,
  SESSION_REGULATION_SNAPSHOT_V1,

  // Registry and helpers
  BUILTIN_SNAPSHOT_PROFILES,
  getSnapshotProfile,
  getSnapshotProfileByNameAndVersion,
  getLatestSnapshotProfile,
  listActiveProfileNames,
} from "./snapshot-profiles";

// =============================================================================
// SNAPSHOT BUILDER
// =============================================================================
export {
  // Builder class
  SnapshotBuilder,
} from "./snapshot-builder";

export type {
  // Reader interfaces
  MasteryStateReader as SnapshotMasteryReader,
  KnowledgeGraphReader as SnapshotGraphReader,
  SessionHistoryReader,
  SessionSummary,
  AttemptSummary,

  // Configuration
  SnapshotBuilderConfig,

  // Result types
  SnapshotBuildResult,
  SnapshotBuildError,
  SnapshotBuilderErrorCode,
  SnapshotBuildOutcome,
} from "./snapshot-builder";

// =============================================================================
// PROPOSAL TYPES
// =============================================================================
export type {
  // Core proposal types
  AIProposal,
  ProposalStatus,
  ModelIdentity,
  ModelId,
  ModelVersion,

  // Operation group types
  OperationGroup,
  OperationGroupId,
  OperationGroupType,
  BaseOperation,

  // Specific operation types
  MemoryParameterOperation,
  SchedulingHintOperation,
  EdgeOperation,
  NewEdgeOperation,
  EdgeWeightAdjustmentOperation,
  EdgeRemovalOperation,
  StrategyEfficacyOperation,
  CalibrationMetricOperation,
  SessionRegulationOperation,

  // Group convenience types
  MemoryParameterGroup,
  SchedulingHintGroup,
  ConfusionEdgeGroup,
  PrerequisiteEdgeGroup,
  StrategyEfficacyGroup,
  CalibrationMetricGroup,
  SessionRegulationGroup,

  // Rationale and evidence
  ProposalRationale,
  RationaleFactor,
  EvidenceReference,
  Counterfactual,

  // Validation types
  ValidationOutcome,
  HumanConfirmationReason,
  ValidationIssue,
  OperationGroupValidation,

  // Builder input types
  ProposalBuilderInput,
  OperationGroupInput,
} from "./proposal-types";

// =============================================================================
// PROPOSAL VALIDATOR
// =============================================================================
export {
  // Validator class
  ProposalValidator,

  // Configuration
  DEFAULT_CONFIDENCE_THRESHOLDS,
  DEFAULT_HUMAN_CONFIRMATION_TRIGGERS,
} from "./proposal-validator";

export type {
  // Configuration types
  ProposalValidatorConfig,
  ConfidenceThresholds,
  HumanConfirmationTriggers,

  // Reader interfaces
  KnowledgeGraphReader as ValidatorGraphReader,
  MasteryStateReader as ValidatorMasteryReader,
  RevisionChecker,

  // Result types
  ProposalValidationResult,
  GroupValidationResult,
  OperationValidationResult,
} from "./proposal-validator";

// =============================================================================
// PROPOSAL APPLIER
// =============================================================================
export {
  // Applier class
  ProposalApplier,

  // Configuration
  DEFAULT_APPLIER_CONFIG,
} from "./proposal-applier";

export type {
  // Configuration types
  ProposalApplierConfig,

  // Writer interfaces
  MasteryStateWriter,
  GraphEdgeWriter,
  SchedulingHintWriter,
  StrategyEfficacyWriter,

  // Supporting types
  MemoryParameterUpdates,
  UpdateMetadata,
  MasteryUpdateResult,
  EdgeMetadata,
  EdgeWriteResult,
  SchedulingHintData,
  HintMetadata,
  HintWriteResult,
  EfficacyMetadata,
  EfficacyWriteResult,

  // Result types
  ProposalApplicationResult,
  GroupApplicationResult,
  OperationApplicationResult,
  OperationSkipReason,
} from "./proposal-applier";

// =============================================================================
// AUDIT TYPES
// =============================================================================
export type {
  // Audit record ID and types
  AIAuditId,
  AIAuditRecordType,
  AIAuditRecord,
  BaseAIAuditRecord,
  DecisionMaker,

  // Specific audit record types
  SnapshotGeneratedAudit,
  ProposalReceivedAudit,
  ProposalValidatedAudit,
  OperationGroupValidatedAudit,
  OperationGroupAppliedAudit,
  OperationGroupRejectedAudit,
  HumanDecisionRequestedAudit,
  HumanDecisionReceivedAudit,
  ProposalExpiredAudit,
  ProposalSupersededAudit,
  ModelRegisteredAudit,
  ModelTrustUpdatedAudit,

  // Supporting types
  OperationStateChange,
  HumanDecision,
  PendingHumanDecision,

  // Statistics
  AIAuditStatistics,

  // Interface
  AIAuditLog,
} from "./audit-types";

// =============================================================================
// IN-MEMORY AUDIT LOG
// =============================================================================
export {
  // Implementation
  InMemoryAIAuditLog,

  // Configuration
  DEFAULT_AUDIT_LOG_CONFIG,
} from "./in-memory-audit-log";

export type {
  // Configuration types
  InMemoryAIAuditLogConfig,
} from "./in-memory-audit-log";
