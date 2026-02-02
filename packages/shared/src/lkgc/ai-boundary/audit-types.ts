// =============================================================================
// AI BOUNDARY AUDIT TYPES - Audit Trail for AI Integration
// =============================================================================
// Defines audit records for tracking all AI-related decisions:
// - Applied proposals
// - Rejected proposals
// - Pending human decisions
//
// These records answer: "Why does the system believe this?"
//
// NO UI. NO REAL ML. FULL AUDITABILITY.
// =============================================================================

import type {
  EntityId,
  NodeId,
  UserId,
  ProposalId,
  SnapshotId,
  Timestamp,
  Duration,
  Confidence,
  RevisionNumber,
} from "../../types/lkgc/foundation";
import type {
  SnapshotProfileId,
  ProfileVersion,
  SnapshotMetadata,
} from "./snapshot-types";
import type {
  ModelIdentity,
  OperationGroupId,
  OperationGroupType,
  ProposalRationale,
  ValidationOutcome,
  HumanConfirmationReason,
  ValidationIssue,
} from "./proposal-types";

// =============================================================================
// AUDIT RECORD IDENTITY
// =============================================================================

/**
 * Unique identifier for an AI audit record
 */
declare const __aiAuditId: unique symbol;
export type AIAuditId = string & { readonly [__aiAuditId]: never };

/**
 * Types of AI audit records
 */
export type AIAuditRecordType =
  | "snapshot_generated"
  | "proposal_received"
  | "proposal_validated"
  | "operation_group_validated"
  | "operation_group_applied"
  | "operation_group_rejected"
  | "human_decision_requested"
  | "human_decision_received"
  | "proposal_expired"
  | "proposal_superseded"
  | "model_registered"
  | "model_trust_updated";

// =============================================================================
// DECISION MAKER
// =============================================================================

/**
 * Who made a decision
 */
export type DecisionMaker =
  | { readonly type: "system"; readonly ruleId: string }
  | {
      readonly type: "ai";
      readonly modelId: string;
      readonly modelVersion: string;
    }
  | { readonly type: "user"; readonly userId: UserId }
  | { readonly type: "policy"; readonly policyId: string };

// =============================================================================
// BASE AUDIT RECORD
// =============================================================================

/**
 * Base interface for all AI audit records
 */
export interface BaseAIAuditRecord {
  /** Audit record ID */
  readonly auditId: AIAuditId;

  /** Record type */
  readonly recordType: AIAuditRecordType;

  /** When this record was created */
  readonly timestamp: Timestamp;

  /** User ID (if applicable) */
  readonly userId?: UserId;

  /** Duration of the operation (ms) */
  readonly duration?: Duration;

  /** Additional context */
  readonly context?: Readonly<Record<string, unknown>>;
}

// =============================================================================
// SNAPSHOT AUDIT RECORDS
// =============================================================================

/**
 * Audit record for snapshot generation
 */
export interface SnapshotGeneratedAudit extends BaseAIAuditRecord {
  readonly recordType: "snapshot_generated";

  /** Generated snapshot ID */
  readonly snapshotId: SnapshotId;

  /** Profile used */
  readonly profileId: SnapshotProfileId;

  /** Profile version */
  readonly profileVersion: ProfileVersion;

  /** Snapshot metadata */
  readonly metadata: SnapshotMetadata;

  /** Request ID that triggered this */
  readonly requestId: EntityId;

  /** Overrides that were applied */
  readonly appliedOverrides: {
    readonly budget: Readonly<Record<string, unknown>>;
    readonly temporal: Readonly<Record<string, unknown>>;
    readonly graph: Readonly<Record<string, unknown>>;
  };

  /** Privacy rules applied */
  readonly privacyRulesApplied: readonly string[];
}

// =============================================================================
// PROPOSAL AUDIT RECORDS
// =============================================================================

/**
 * Audit record for proposal receipt
 */
export interface ProposalReceivedAudit extends BaseAIAuditRecord {
  readonly recordType: "proposal_received";

  /** Proposal ID */
  readonly proposalId: ProposalId;

  /** Snapshot ID */
  readonly snapshotId: SnapshotId;

  /** Model that generated the proposal */
  readonly model: ModelIdentity;

  /** Number of operation groups */
  readonly operationGroupCount: number;

  /** Total operation count */
  readonly totalOperationCount: number;

  /** Overall confidence */
  readonly confidence: Confidence;

  /** Proposal rationale summary */
  readonly rationaleSummary: string;
}

/**
 * Audit record for proposal validation
 */
export interface ProposalValidatedAudit extends BaseAIAuditRecord {
  readonly recordType: "proposal_validated";

  /** Proposal ID */
  readonly proposalId: ProposalId;

  /** Validation passed */
  readonly isValid: boolean;

  /** Groups validated */
  readonly groupsValidated: number;

  /** Groups accepted */
  readonly groupsAccepted: number;

  /** Groups rejected */
  readonly groupsRejected: number;

  /** Groups requiring human confirmation */
  readonly groupsRequiringHuman: number;

  /** Validation rules applied */
  readonly rulesApplied: readonly string[];

  /** Summary of issues found */
  readonly issueSummary: readonly {
    readonly code: string;
    readonly severity: string;
    readonly count: number;
  }[];
}

// =============================================================================
// OPERATION GROUP AUDIT RECORDS
// =============================================================================

/**
 * Audit record for operation group validation
 */
export interface OperationGroupValidatedAudit extends BaseAIAuditRecord {
  readonly recordType: "operation_group_validated";

  /** Proposal ID */
  readonly proposalId: ProposalId;

  /** Group ID */
  readonly groupId: OperationGroupId;

  /** Group type */
  readonly groupType: OperationGroupType;

  /** Validation outcome */
  readonly outcome: ValidationOutcome;

  /** Issues found */
  readonly issues: readonly ValidationIssue[];

  /** Human confirmation reasons (if required) */
  readonly humanConfirmationReasons: readonly HumanConfirmationReason[];

  /** Rules applied */
  readonly rulesApplied: readonly string[];
}

/**
 * Before/after state for an applied operation
 */
export interface OperationStateChange {
  /** Operation ID */
  readonly operationId: EntityId;

  /** Target node ID */
  readonly targetNodeId: NodeId;

  /** State before application */
  readonly stateBefore: Readonly<Record<string, unknown>>;

  /** State after application */
  readonly stateAfter: Readonly<Record<string, unknown>>;

  /** Delta (changes made) */
  readonly delta: Readonly<Record<string, unknown>>;
}

/**
 * Audit record for operation group application
 */
export interface OperationGroupAppliedAudit extends BaseAIAuditRecord {
  readonly recordType: "operation_group_applied";

  /** Proposal ID */
  readonly proposalId: ProposalId;

  /** Group ID */
  readonly groupId: OperationGroupId;

  /** Group type */
  readonly groupType: OperationGroupType;

  /** Who made the decision to apply */
  readonly decisionMaker: DecisionMaker;

  /** Rationale for the decision */
  readonly rationale: ProposalRationale;

  /** Operations applied */
  readonly operationsApplied: number;

  /** State changes for each operation */
  readonly stateChanges: readonly OperationStateChange[];

  /** Revision before application */
  readonly revisionBefore: RevisionNumber;

  /** Revision after application */
  readonly revisionAfter: RevisionNumber;

  /** Rule IDs that triggered this application */
  readonly triggeringRuleIds: readonly string[];

  /** Alternative options that were not chosen */
  readonly alternatives?: readonly {
    readonly description: string;
    readonly whyNotChosen: string;
  }[];
}

/**
 * Audit record for operation group rejection
 */
export interface OperationGroupRejectedAudit extends BaseAIAuditRecord {
  readonly recordType: "operation_group_rejected";

  /** Proposal ID */
  readonly proposalId: ProposalId;

  /** Group ID */
  readonly groupId: OperationGroupId;

  /** Group type */
  readonly groupType: OperationGroupType;

  /** Who made the decision to reject */
  readonly decisionMaker: DecisionMaker;

  /** Rejection reasons */
  readonly rejectionReasons: readonly string[];

  /** Validation issues that caused rejection */
  readonly validationIssues: readonly ValidationIssue[];

  /** Operations that would have been affected */
  readonly affectedOperationCount: number;

  /** Target node IDs that would have been affected */
  readonly affectedNodeIds: readonly NodeId[];
}

// =============================================================================
// HUMAN DECISION AUDIT RECORDS
// =============================================================================

/**
 * Audit record for requesting human decision
 */
export interface HumanDecisionRequestedAudit extends BaseAIAuditRecord {
  readonly recordType: "human_decision_requested";

  /** Proposal ID */
  readonly proposalId: ProposalId;

  /** Group IDs requiring decision */
  readonly groupIds: readonly OperationGroupId[];

  /** Reasons for requiring human decision */
  readonly reasons: readonly HumanConfirmationReason[];

  /** Deadline for decision (if any) */
  readonly deadline?: Timestamp;

  /** Summary of what the user needs to decide */
  readonly decisionSummary: string;

  /** Affected node IDs */
  readonly affectedNodeIds: readonly NodeId[];

  /** Potential impact description */
  readonly impactDescription: string;
}

/**
 * Human decision options
 */
export type HumanDecision =
  | "approve_all"
  | "approve_partial"
  | "reject_all"
  | "defer"
  | "request_more_info";

/**
 * Audit record for human decision received
 */
export interface HumanDecisionReceivedAudit extends BaseAIAuditRecord {
  readonly recordType: "human_decision_received";

  /** Proposal ID */
  readonly proposalId: ProposalId;

  /** Group IDs that were decided on */
  readonly groupIds: readonly OperationGroupId[];

  /** User who made the decision */
  readonly userId: UserId;

  /** Decision made */
  readonly decision: HumanDecision;

  /** User's rationale (if provided) */
  readonly userRationale?: string;

  /** Groups approved (if partial) */
  readonly approvedGroupIds?: readonly OperationGroupId[];

  /** Groups rejected (if partial) */
  readonly rejectedGroupIds?: readonly OperationGroupId[];

  /** Time taken to decide (ms) */
  readonly decisionDuration: Duration;
}

// =============================================================================
// PROPOSAL LIFECYCLE AUDIT RECORDS
// =============================================================================

/**
 * Audit record for proposal expiration
 */
export interface ProposalExpiredAudit extends BaseAIAuditRecord {
  readonly recordType: "proposal_expired";

  /** Proposal ID */
  readonly proposalId: ProposalId;

  /** When the proposal was generated */
  readonly generatedAt: Timestamp;

  /** When it expired */
  readonly expiredAt: Timestamp;

  /** Groups that were never processed */
  readonly unprocessedGroupIds: readonly OperationGroupId[];

  /** Reason for expiration */
  readonly expirationReason: "timeout" | "state_changed" | "superseded";
}

/**
 * Audit record for proposal supersession
 */
export interface ProposalSupersededAudit extends BaseAIAuditRecord {
  readonly recordType: "proposal_superseded";

  /** Original proposal ID */
  readonly proposalId: ProposalId;

  /** New proposal ID that supersedes it */
  readonly supersededByProposalId: ProposalId;

  /** Reason for supersession */
  readonly reason: string;

  /** Groups that were superseded */
  readonly supersededGroupIds: readonly OperationGroupId[];
}

// =============================================================================
// MODEL AUDIT RECORDS
// =============================================================================

/**
 * Audit record for model registration
 */
export interface ModelRegisteredAudit extends BaseAIAuditRecord {
  readonly recordType: "model_registered";

  /** Model identity */
  readonly model: ModelIdentity;

  /** Registered by */
  readonly registeredBy: DecisionMaker;

  /** Initial trust level */
  readonly initialTrust: "untrusted" | "limited" | "trusted";

  /** Capabilities claimed */
  readonly capabilities: readonly string[];
}

/**
 * Audit record for model trust update
 */
export interface ModelTrustUpdatedAudit extends BaseAIAuditRecord {
  readonly recordType: "model_trust_updated";

  /** Model ID */
  readonly modelId: string;

  /** Previous trust status */
  readonly previousTrust: boolean;

  /** New trust status */
  readonly newTrust: boolean;

  /** Reason for change */
  readonly reason: string;

  /** Decision maker */
  readonly decisionMaker: DecisionMaker;

  /** Evidence supporting the change */
  readonly evidence?: readonly string[];
}

// =============================================================================
// UNION TYPE
// =============================================================================

/**
 * Union of all AI audit record types
 */
export type AIAuditRecord =
  | SnapshotGeneratedAudit
  | ProposalReceivedAudit
  | ProposalValidatedAudit
  | OperationGroupValidatedAudit
  | OperationGroupAppliedAudit
  | OperationGroupRejectedAudit
  | HumanDecisionRequestedAudit
  | HumanDecisionReceivedAudit
  | ProposalExpiredAudit
  | ProposalSupersededAudit
  | ModelRegisteredAudit
  | ModelTrustUpdatedAudit;

// =============================================================================
// PENDING HUMAN DECISION
// =============================================================================

/**
 * A pending human decision
 */
export interface PendingHumanDecision {
  /** Decision ID */
  readonly decisionId: EntityId;

  /** Proposal ID */
  readonly proposalId: ProposalId;

  /** Group IDs requiring decision */
  readonly groupIds: readonly OperationGroupId[];

  /** User ID who needs to decide */
  readonly userId: UserId;

  /** Reasons for requiring human decision */
  readonly reasons: readonly HumanConfirmationReason[];

  /** When the decision was requested */
  readonly requestedAt: Timestamp;

  /** Deadline for decision */
  readonly deadline?: Timestamp;

  /** Summary of what needs to be decided */
  readonly summary: string;

  /** Impact description */
  readonly impactDescription: string;

  /** Affected node IDs */
  readonly affectedNodeIds: readonly NodeId[];

  /** Model that generated the proposal */
  readonly model: ModelIdentity;

  /** Overall confidence of the proposal */
  readonly confidence: Confidence;

  /** Status */
  readonly status: "pending" | "decided" | "expired" | "cancelled";

  /** Decision (if made) */
  readonly decision?: HumanDecision;

  /** Decided at (if decided) */
  readonly decidedAt?: Timestamp;
}

// =============================================================================
// AUDIT LOG INTERFACE
// =============================================================================

/**
 * Interface for AI audit log
 */
export interface AIAuditLog {
  /**
   * Append an audit record
   */
  append(record: Omit<AIAuditRecord, "auditId">): Promise<AIAuditId>;

  /**
   * Get audit record by ID
   */
  getById(auditId: AIAuditId): Promise<AIAuditRecord | undefined>;

  /**
   * Query audit records by proposal ID
   */
  queryByProposal(proposalId: ProposalId): Promise<readonly AIAuditRecord[]>;

  /**
   * Query audit records by snapshot ID
   */
  queryBySnapshot(snapshotId: SnapshotId): Promise<readonly AIAuditRecord[]>;

  /**
   * Query audit records by user ID
   */
  queryByUser(userId: UserId): Promise<readonly AIAuditRecord[]>;

  /**
   * Query audit records by type
   */
  queryByType(
    recordType: AIAuditRecordType,
    limit?: number,
  ): Promise<readonly AIAuditRecord[]>;

  /**
   * Query audit records by time range
   */
  queryByTimeRange(
    startAt: Timestamp,
    endAt: Timestamp,
    limit?: number,
  ): Promise<readonly AIAuditRecord[]>;

  /**
   * Query audit records for a specific node
   */
  queryByNode(nodeId: NodeId): Promise<readonly AIAuditRecord[]>;

  /**
   * Get pending human decisions for a user
   */
  getPendingDecisions(userId: UserId): Promise<readonly PendingHumanDecision[]>;

  /**
   * Add a pending human decision
   */
  addPendingDecision(
    decision: Omit<PendingHumanDecision, "decisionId">,
  ): Promise<EntityId>;

  /**
   * Update a pending human decision
   */
  updatePendingDecision(
    decisionId: EntityId,
    update: Partial<
      Pick<PendingHumanDecision, "status" | "decision" | "decidedAt">
    >,
  ): Promise<void>;

  /**
   * Get statistics for explainability queries
   */
  getStatistics(userId: UserId): Promise<AIAuditStatistics>;
}

/**
 * Statistics from the audit log
 */
export interface AIAuditStatistics {
  /** Total snapshots generated */
  readonly snapshotsGenerated: number;

  /** Total proposals received */
  readonly proposalsReceived: number;

  /** Proposals by status */
  readonly proposalsByStatus: Readonly<Record<string, number>>;

  /** Operations applied */
  readonly operationsApplied: number;

  /** Operations rejected */
  readonly operationsRejected: number;

  /** Human decisions requested */
  readonly humanDecisionsRequested: number;

  /** Human decisions made */
  readonly humanDecisionsMade: number;

  /** Average time to human decision (ms) */
  readonly avgHumanDecisionTime: Duration;

  /** Models used */
  readonly modelsUsed: readonly string[];

  /** Most common rejection reasons */
  readonly topRejectionReasons: readonly { reason: string; count: number }[];
}
