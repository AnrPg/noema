// =============================================================================
// PROPOSAL TYPES - AI Integration Boundary
// =============================================================================
// Defines the proposal model for AI-suggested changes to LKGC state.
//
// Core principles:
// - AI never owns truth — it only proposes
// - LKGC is authoritative — it decides what is applied
// - All proposals are auditable
// - Human-in-the-loop is mandatory for irreversible/structural changes
// - Proposals are batch-style with operation groups
//
// NO UI. NO REAL ML. LKGC IS AUTHORITATIVE.
// =============================================================================

import type {
  EntityId,
  NodeId,
  EdgeId,
  ProposalId,
  SnapshotId,
  Timestamp,
  Duration,
  Confidence,
  NormalizedValue,
  RevisionNumber,
} from "../../types/lkgc/foundation";
import type { MasteryGranularity } from "../../types/lkgc/mastery";
import type { EdgeType } from "../../types/lkgc/edges";
import type { SnapshotProfileId, ProfileVersion } from "./snapshot-types";

// =============================================================================
// MODEL IDENTITY
// =============================================================================

/**
 * Unique identifier for an AI model
 */
declare const __modelId: unique symbol;
export type ModelId = string & { readonly [__modelId]: never };

/**
 * Model version string
 */
export type ModelVersion = string;

/**
 * Information about the model that generated a proposal
 */
export interface ModelIdentity {
  /** Model identifier */
  readonly modelId: ModelId;

  /** Model version */
  readonly version: ModelVersion;

  /** Model type (heuristic, neural, ensemble, etc.) */
  readonly modelType:
    | "heuristic"
    | "neural"
    | "ensemble"
    | "hybrid"
    | "external";

  /** Human-readable name */
  readonly name: string;

  /** Model capabilities */
  readonly capabilities: readonly string[];

  /** Whether this model is trusted (has been validated) */
  readonly isTrusted: boolean;

  /** First time this model was used */
  readonly firstUsedAt?: Timestamp;

  /** Usage count for this user */
  readonly usageCount?: number;
}

// =============================================================================
// OPERATION GROUP IDENTITY
// =============================================================================

/**
 * Unique identifier for an operation group within a proposal
 */
declare const __operationGroupId: unique symbol;
export type OperationGroupId = string & {
  readonly [__operationGroupId]: never;
};

/**
 * Types of operation groups
 */
export type OperationGroupType =
  | "memory_parameter_update"
  | "scheduling_hint"
  | "confusion_edge"
  | "prerequisite_edge"
  | "strategy_efficacy"
  | "calibration_metric"
  | "session_regulation"
  | "edge_weight_adjustment"
  | "node_annotation";

// =============================================================================
// RATIONALE - Explainability for proposals
// =============================================================================

/**
 * Rationale for a proposal or operation group
 */
export interface ProposalRationale {
  /** Short summary */
  readonly summary: string;

  /** Detailed explanation */
  readonly explanation: string;

  /** Contributing factors */
  readonly factors: readonly RationaleFactor[];

  /** Evidence references */
  readonly evidenceRefs: readonly EvidenceReference[];

  /** Counterfactual explanations */
  readonly counterfactuals: readonly Counterfactual[];

  /** Confidence in this rationale */
  readonly confidence: Confidence;
}

/**
 * A factor contributing to the proposal
 */
export interface RationaleFactor {
  /** Factor name */
  readonly name: string;

  /** Factor value */
  readonly value: number | string | boolean;

  /** Importance/weight of this factor */
  readonly importance: NormalizedValue;

  /** Human-readable description */
  readonly description: string;
}

/**
 * Reference to evidence supporting the proposal
 */
export interface EvidenceReference {
  /** Type of evidence */
  readonly type: "event" | "feature" | "mastery_state" | "edge" | "pattern";

  /** Entity ID of the evidence */
  readonly entityId: EntityId;

  /** Brief description */
  readonly description: string;

  /** Relevance score */
  readonly relevance: NormalizedValue;
}

/**
 * Counterfactual explanation
 */
export interface Counterfactual {
  /** Condition that would change the proposal */
  readonly condition: string;

  /** What would happen if the condition were true */
  readonly consequence: string;

  /** How close the actual data is to this condition */
  readonly proximity: NormalizedValue;
}

// =============================================================================
// VALIDATION OUTCOME
// =============================================================================

/**
 * Validation outcome for an operation group
 */
export type ValidationOutcome =
  | "accept"
  | "reject"
  | "require_human_confirmation";

/**
 * Reason for requiring human confirmation
 */
export type HumanConfirmationReason =
  | "structural_graph_change"
  | "low_confidence"
  | "model_disagreement"
  | "first_time_model"
  | "schema_affecting"
  | "high_impact"
  | "privacy_sensitive"
  | "conflicts_with_user_data"
  | "exceeds_threshold";

/**
 * Validation result for an operation group
 */
export interface OperationGroupValidation {
  /** Validation outcome */
  readonly outcome: ValidationOutcome;

  /** Validation passed/failed */
  readonly isValid: boolean;

  /** Validation issues found */
  readonly issues: readonly ValidationIssue[];

  /** Reasons for human confirmation (if required) */
  readonly humanConfirmationReasons: readonly HumanConfirmationReason[];

  /** Validated at timestamp */
  readonly validatedAt: Timestamp;

  /** Validation rule IDs applied */
  readonly rulesApplied: readonly string[];
}

/**
 * A validation issue
 */
export interface ValidationIssue {
  /** Issue code */
  readonly code: string;

  /** Severity */
  readonly severity: "error" | "warning" | "info";

  /** Human-readable message */
  readonly message: string;

  /** Related entity ID (if applicable) - can be any LKGC ID type */
  readonly relatedEntityId?: EntityId | NodeId | EdgeId;

  /** Field path (if applicable) */
  readonly fieldPath?: string;
}

// =============================================================================
// OPERATION TYPES
// =============================================================================

/**
 * Base interface for all operations
 */
export interface BaseOperation {
  /** Operation ID (unique within the group) */
  readonly operationId: EntityId;

  /** Target node ID */
  readonly targetNodeId: NodeId;

  /** Target granularity (if applicable) */
  readonly targetGranularity?: MasteryGranularity;

  /** Per-operation confidence */
  readonly confidence: Confidence;

  /** Per-operation explanation (brief) */
  readonly explanation: string;
}

// -----------------------------------------------------------------------------
// Memory Parameter Operations
// -----------------------------------------------------------------------------

/**
 * Proposed update to memory parameters
 */
export interface MemoryParameterOperation extends BaseOperation {
  /** Current values (for diff display) */
  readonly currentValues: {
    readonly stability?: number;
    readonly difficulty?: NormalizedValue;
    readonly retrievability?: NormalizedValue;
    readonly halfLife?: number;
  };

  /** Proposed values */
  readonly proposedValues: {
    readonly stability?: number;
    readonly difficulty?: NormalizedValue;
    readonly retrievability?: NormalizedValue;
    readonly halfLife?: number;
  };

  /** Delta (proposed - current) */
  readonly delta: {
    readonly stability?: number;
    readonly difficulty?: number;
    readonly retrievability?: number;
    readonly halfLife?: number;
  };
}

// -----------------------------------------------------------------------------
// Scheduling Hint Operations
// -----------------------------------------------------------------------------

/**
 * Proposed scheduling hint (non-authoritative)
 */
export interface SchedulingHintOperation extends BaseOperation {
  /** Current due date (if any) */
  readonly currentDueDate?: Timestamp;

  /** Proposed due date */
  readonly proposedDueDate: Timestamp;

  /** Proposed interval (days) */
  readonly proposedIntervalDays: number;

  /** Priority score (for queue ordering) */
  readonly priorityScore: NormalizedValue;

  /** Scheduling rationale */
  readonly schedulingRationale: string;
}

// -----------------------------------------------------------------------------
// Edge Operations
// -----------------------------------------------------------------------------

/**
 * Base for edge operations
 */
export interface BaseEdgeOperation extends BaseOperation {
  /** Source node ID */
  readonly sourceNodeId: NodeId;

  /** Target node ID (destination of edge) */
  readonly destinationNodeId: NodeId;

  /** Edge type */
  readonly edgeType: EdgeType;
}

/**
 * Proposed new edge
 */
export interface NewEdgeOperation extends BaseEdgeOperation {
  readonly operationType: "create";

  /** Proposed edge weight */
  readonly proposedWeight: NormalizedValue;

  /** Evidence count supporting this edge */
  readonly evidenceCount: number;
}

/**
 * Proposed edge weight adjustment
 */
export interface EdgeWeightAdjustmentOperation extends BaseEdgeOperation {
  readonly operationType: "adjust";

  /** Current edge ID */
  readonly edgeId: EdgeId;

  /** Current weight */
  readonly currentWeight: NormalizedValue;

  /** Proposed weight */
  readonly proposedWeight: NormalizedValue;

  /** Weight delta */
  readonly weightDelta: number;
}

/**
 * Proposed edge removal
 */
export interface EdgeRemovalOperation extends BaseEdgeOperation {
  readonly operationType: "remove";

  /** Current edge ID */
  readonly edgeId: EdgeId;

  /** Current weight */
  readonly currentWeight: NormalizedValue;

  /** Reason for removal */
  readonly removalReason: string;
}

/**
 * Union of edge operations
 */
export type EdgeOperation =
  | NewEdgeOperation
  | EdgeWeightAdjustmentOperation
  | EdgeRemovalOperation;

// -----------------------------------------------------------------------------
// Strategy Efficacy Operations
// -----------------------------------------------------------------------------

/**
 * Proposed strategy efficacy update
 */
export interface StrategyEfficacyOperation extends BaseOperation {
  /** Strategy node ID */
  readonly strategyNodeId: NodeId;

  /** Domain/context this efficacy applies to */
  readonly domain?: string;

  /** Current efficacy score */
  readonly currentEfficacy?: NormalizedValue;

  /** Proposed efficacy score */
  readonly proposedEfficacy: NormalizedValue;

  /** Sample size supporting this estimate */
  readonly sampleSize: number;

  /** Confidence interval (if available) */
  readonly confidenceInterval?: {
    readonly lower: NormalizedValue;
    readonly upper: NormalizedValue;
  };
}

// -----------------------------------------------------------------------------
// Calibration Metric Operations
// -----------------------------------------------------------------------------

/**
 * Proposed calibration metric
 */
export interface CalibrationMetricOperation extends BaseOperation {
  /** Metric type */
  readonly metricType: "brier_score" | "ece" | "bias" | "resolution";

  /** Computed value */
  readonly value: number;

  /** Domain/context this metric applies to */
  readonly domain?: string;

  /** Sample size */
  readonly sampleSize: number;

  /** Confidence bins (for ECE) */
  readonly confidenceBins?: readonly {
    readonly binCenter: number;
    readonly accuracy: number;
    readonly count: number;
  }[];
}

// -----------------------------------------------------------------------------
// Session Regulation Operations
// -----------------------------------------------------------------------------

/**
 * Proposed session regulation hint
 */
export interface SessionRegulationOperation extends BaseOperation {
  /** Regulation type */
  readonly regulationType:
    | "session_length"
    | "pacing"
    | "mode_switch"
    | "break_suggestion"
    | "fatigue_warning";

  /** Current value (if applicable) */
  readonly currentValue?: unknown;

  /** Proposed value/action */
  readonly proposedValue: unknown;

  /** Urgency (how soon to act) */
  readonly urgency: NormalizedValue;
}

// =============================================================================
// OPERATION GROUP
// =============================================================================

/**
 * A group of operations of the same type within a proposal
 */
export interface OperationGroup<TOp extends BaseOperation = BaseOperation> {
  /** Group ID */
  readonly groupId: OperationGroupId;

  /** Group type */
  readonly groupType: OperationGroupType;

  /** Operations in this group */
  readonly operations: readonly TOp[];

  /** Group-level rationale */
  readonly rationale: ProposalRationale;

  /** Group-level confidence (may differ from individual operation confidence) */
  readonly confidence: Confidence;

  /** Validation result (populated after validation) */
  readonly validation?: OperationGroupValidation;

  /** Application status (populated after application attempt) */
  readonly applicationStatus?: OperationGroupApplicationStatus;
}

/**
 * Application status for an operation group
 */
export interface OperationGroupApplicationStatus {
  /** Whether the group was applied */
  readonly applied: boolean;

  /** Number of operations applied */
  readonly operationsApplied: number;

  /** Number of operations rejected */
  readonly operationsRejected: number;

  /** Number of operations pending human decision */
  readonly operationsPending: number;

  /** Applied at timestamp */
  readonly appliedAt?: Timestamp;

  /** Rejection reasons (if rejected) */
  readonly rejectionReasons?: readonly string[];
}

// =============================================================================
// TYPED OPERATION GROUPS
// =============================================================================

export type MemoryParameterGroup = OperationGroup<MemoryParameterOperation>;
export type SchedulingHintGroup = OperationGroup<SchedulingHintOperation>;
export type ConfusionEdgeGroup = OperationGroup<EdgeOperation>;
export type PrerequisiteEdgeGroup = OperationGroup<EdgeOperation>;
export type StrategyEfficacyGroup = OperationGroup<StrategyEfficacyOperation>;
export type CalibrationMetricGroup = OperationGroup<CalibrationMetricOperation>;
export type SessionRegulationGroup = OperationGroup<SessionRegulationOperation>;

// =============================================================================
// PROPOSAL
// =============================================================================

/**
 * Proposal status
 */
export type ProposalStatus =
  | "pending_validation"
  | "validated"
  | "partially_accepted"
  | "fully_accepted"
  | "fully_rejected"
  | "pending_human_decision"
  | "expired"
  | "superseded";

/**
 * Complete proposal from AI
 */
export interface AIProposal {
  /** Proposal ID */
  readonly proposalId: ProposalId;

  /** Snapshot this proposal is based on */
  readonly snapshotId: SnapshotId;

  /** Snapshot profile used */
  readonly snapshotProfileId: SnapshotProfileId;

  /** Snapshot profile version */
  readonly snapshotProfileVersion: ProfileVersion;

  /** Model that generated this proposal */
  readonly model: ModelIdentity;

  /** When the proposal was generated */
  readonly generatedAt: Timestamp;

  /** Proposal expiration (proposals become stale) */
  readonly expiresAt: Timestamp;

  /** Current status */
  readonly status: ProposalStatus;

  /** Overall proposal rationale */
  readonly rationale: ProposalRationale;

  /** Overall confidence */
  readonly confidence: Confidence;

  /** Operation groups */
  readonly operationGroups: readonly OperationGroup[];

  /** Memory parameter operations (convenience accessor) */
  readonly memoryParameterGroups: readonly MemoryParameterGroup[];

  /** Scheduling hint operations */
  readonly schedulingHintGroups: readonly SchedulingHintGroup[];

  /** Confusion edge operations */
  readonly confusionEdgeGroups: readonly ConfusionEdgeGroup[];

  /** Prerequisite edge operations */
  readonly prerequisiteEdgeGroups: readonly PrerequisiteEdgeGroup[];

  /** Strategy efficacy operations */
  readonly strategyEfficacyGroups: readonly StrategyEfficacyGroup[];

  /** Calibration metric operations */
  readonly calibrationMetricGroups: readonly CalibrationMetricGroup[];

  /** Session regulation operations */
  readonly sessionRegulationGroups: readonly SessionRegulationGroup[];

  /** State revision at proposal time (for staleness detection) */
  readonly stateRevision: RevisionNumber;

  /** Schema version */
  readonly schemaVersion: number;
}

// =============================================================================
// PROPOSAL BUILDER INPUT
// =============================================================================

/**
 * Input for building a proposal (from AI model output)
 */
export interface ProposalBuilderInput {
  /** Snapshot ID this proposal is based on */
  readonly snapshotId: SnapshotId;

  /** Model identity */
  readonly model: ModelIdentity;

  /** Overall rationale */
  readonly rationale: Omit<ProposalRationale, "confidence">;

  /** Overall confidence */
  readonly confidence: Confidence;

  /** Proposal TTL in milliseconds (time until expiration) */
  readonly ttlMs: Duration;

  /** Operation groups to include */
  readonly operationGroups: readonly OperationGroupInput[];
}

/**
 * Input for an operation group
 */
export interface OperationGroupInput<
  TOp extends BaseOperation = BaseOperation,
> {
  /** Group type */
  readonly groupType: OperationGroupType;

  /** Operations */
  readonly operations: readonly Omit<TOp, "operationId">[];

  /** Group rationale */
  readonly rationale: Omit<ProposalRationale, "confidence">;

  /** Group confidence */
  readonly confidence: Confidence;
}
