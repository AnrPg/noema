// =============================================================================
// PROPOSAL VALIDATOR - Validates AI Proposals Against LKGC Constraints
// =============================================================================
// Validates proposals before application to ensure:
// - Schema correctness (all required fields, valid types)
// - Target existence (referenced nodes/edges exist)
// - Confidence thresholds (proposals meet profile requirements)
// - State revision compatibility (no stale updates)
// - Privacy/consent constraints (no unauthorized changes)
//
// Core principles:
// - AI never owns truth — it only proposes
// - LKGC is authoritative — it decides what is applied
// - All proposals are auditable
// - Human-in-the-loop is mandatory for irreversible or structural choices
//
// NO UI. NO REAL ML. LKGC IS AUTHORITATIVE.
// =============================================================================

import type {
  NodeId,
  EdgeId,
  UserId,
  Confidence,
  NormalizedValue,
  RevisionNumber,
  Timestamp,
  EntityId,
} from "../../types/lkgc/foundation";
import type { MasteryState } from "../../types/lkgc/mastery";
import type { BaseNode } from "../../types/lkgc/nodes";
import type { BaseEdge, EdgeType } from "../../types/lkgc/edges";
import type {
  AIProposal,
  OperationGroup,
  MemoryParameterOperation,
  SchedulingHintOperation,
  EdgeOperation,
  NewEdgeOperation,
  EdgeWeightAdjustmentOperation,
  EdgeRemovalOperation,
  StrategyEfficacyOperation,
  CalibrationMetricOperation,
  SessionRegulationOperation,
  ValidationOutcome,
  ValidationIssue,
  HumanConfirmationReason,
  OperationGroupId,
} from "./proposal-types";
import { now } from "../id-generator";

// =============================================================================
// VALIDATION CONFIGURATION
// =============================================================================

/**
 * Confidence thresholds for different operations
 */
export interface ConfidenceThresholds {
  /** Minimum confidence for memory parameter updates */
  readonly memoryParameter: Confidence;

  /** Minimum confidence for scheduling hints */
  readonly schedulingHint: Confidence;

  /** Minimum confidence for edge creation */
  readonly edgeCreate: Confidence;

  /** Minimum confidence for edge deletion (higher) */
  readonly edgeDelete: Confidence;

  /** Minimum confidence for edge weight updates */
  readonly edgeUpdate: Confidence;

  /** Minimum confidence for strategy efficacy updates */
  readonly strategyEfficacy: Confidence;

  /** Minimum confidence for calibration metrics */
  readonly calibrationMetric: Confidence;

  /** Minimum confidence for session regulation */
  readonly sessionRegulation: Confidence;
}

/**
 * Default confidence thresholds
 */
export const DEFAULT_CONFIDENCE_THRESHOLDS: ConfidenceThresholds = {
  memoryParameter: 0.6 as Confidence,
  schedulingHint: 0.5 as Confidence,
  edgeCreate: 0.7 as Confidence,
  edgeDelete: 0.85 as Confidence, // Higher threshold for destructive operations
  edgeUpdate: 0.6 as Confidence,
  strategyEfficacy: 0.6 as Confidence,
  calibrationMetric: 0.5 as Confidence,
  sessionRegulation: 0.5 as Confidence,
};

/**
 * Human confirmation triggers
 */
export interface HumanConfirmationTriggers {
  /** Always require human confirmation for edge deletions */
  readonly edgeDeletionRequiresConfirmation: boolean;

  /** Always require human confirmation for new prerequisite edges */
  readonly prerequisiteEdgeRequiresConfirmation: boolean;

  /** Require confirmation for low-confidence operations */
  readonly lowConfidenceThreshold: Confidence;

  /** Require confirmation for operations with high impact score */
  readonly highImpactThreshold: NormalizedValue;
}

/**
 * Default human confirmation triggers
 */
export const DEFAULT_HUMAN_CONFIRMATION_TRIGGERS: HumanConfirmationTriggers = {
  edgeDeletionRequiresConfirmation: true,
  prerequisiteEdgeRequiresConfirmation: true,
  lowConfidenceThreshold: 0.65 as Confidence,
  highImpactThreshold: 0.8 as NormalizedValue,
};

/**
 * Configuration for the proposal validator
 */
export interface ProposalValidatorConfig {
  readonly confidenceThresholds?: Partial<ConfidenceThresholds>;
  readonly humanConfirmationTriggers?: Partial<HumanConfirmationTriggers>;
  readonly masteryReader: MasteryStateReader;
  readonly graphReader: KnowledgeGraphReader;
  readonly revisionChecker: RevisionChecker;
}

/**
 * Read-only view of mastery state for validation
 */
export interface MasteryStateReader {
  getMasteryState(userId: UserId, nodeId: NodeId): MasteryState | undefined;
  getCurrentRevision(): RevisionNumber;
}

/**
 * Read-only view of the knowledge graph for validation
 */
export interface KnowledgeGraphReader {
  getNode(nodeId: NodeId): BaseNode | undefined;
  getEdge(edgeId: EdgeId): BaseEdge | undefined;
  edgeExists(sourceId: NodeId, targetId: NodeId, edgeType: EdgeType): boolean;
}

/**
 * Checks revision compatibility
 */
export interface RevisionChecker {
  isRevisionCurrent(revision: RevisionNumber): boolean;
  getCurrentRevision(): RevisionNumber;
}

// =============================================================================
// VALIDATION RESULT TYPES
// =============================================================================

/**
 * Result of validating an entire proposal
 */
export interface ProposalValidationResult {
  /** Proposal ID */
  readonly proposalId: string;

  /** Overall outcome */
  readonly overallOutcome: ValidationOutcome;

  /** Whether the proposal can be applied (at least partially) */
  readonly canApply: boolean;

  /** Validated group results */
  readonly groupResults: readonly GroupValidationResult[];

  /** Summary statistics */
  readonly summary: {
    readonly totalGroups: number;
    readonly acceptedGroups: number;
    readonly rejectedGroups: number;
    readonly pendingHumanConfirmation: number;
  };

  /** Validation timestamp */
  readonly validatedAt: Timestamp;

  /** Is the proposal stale? */
  readonly isStale: boolean;
}

/**
 * Result of validating a single operation group
 */
export interface GroupValidationResult {
  /** Group ID */
  readonly groupId: OperationGroupId;

  /** Group type */
  readonly groupType: string;

  /** Validation outcome */
  readonly outcome: ValidationOutcome;

  /** Validation issues */
  readonly issues: readonly ValidationIssue[];

  /** Human confirmation reasons (if outcome is require_human_confirmation) */
  readonly humanConfirmationReasons: readonly HumanConfirmationReason[];

  /** Per-operation results */
  readonly operationResults: readonly OperationValidationResult[];
}

/**
 * Result of validating a single operation
 */
export interface OperationValidationResult {
  /** Operation ID */
  readonly operationId: EntityId;

  /** Target node ID */
  readonly targetNodeId: NodeId;

  /** Outcome */
  readonly outcome: ValidationOutcome;

  /** Issues found */
  readonly issues: readonly ValidationIssue[];

  /** Human confirmation reasons */
  readonly humanConfirmationReasons: readonly HumanConfirmationReason[];
}

// =============================================================================
// PROPOSAL VALIDATOR
// =============================================================================

/**
 * Validates AI proposals against LKGC constraints
 *
 * The validator ensures proposals are:
 * - Structurally valid (correct schema)
 * - Contextually valid (targets exist, revisions match)
 * - Policy-compliant (confidence thresholds, human-in-the-loop)
 */
export class ProposalValidator {
  private readonly confidenceThresholds: ConfidenceThresholds;
  private readonly humanTriggers: HumanConfirmationTriggers;
  private readonly masteryReader: MasteryStateReader;
  private readonly graphReader: KnowledgeGraphReader;
  private readonly revisionChecker: RevisionChecker;

  constructor(config: ProposalValidatorConfig) {
    this.confidenceThresholds = {
      ...DEFAULT_CONFIDENCE_THRESHOLDS,
      ...config.confidenceThresholds,
    };
    this.humanTriggers = {
      ...DEFAULT_HUMAN_CONFIRMATION_TRIGGERS,
      ...config.humanConfirmationTriggers,
    };
    this.masteryReader = config.masteryReader;
    this.graphReader = config.graphReader;
    this.revisionChecker = config.revisionChecker;
  }

  /**
   * Validate a proposal
   */
  validate(proposal: AIProposal, userId: UserId): ProposalValidationResult {
    const timestamp = now();

    // Check staleness
    const isStale = !this.revisionChecker.isRevisionCurrent(
      proposal.stateRevision,
    );

    // Validate all operation groups
    const groupResults: GroupValidationResult[] = [];

    for (const group of proposal.memoryParameterGroups) {
      groupResults.push(this.validateMemoryParameterGroup(group, userId));
    }

    for (const group of proposal.schedulingHintGroups) {
      groupResults.push(this.validateSchedulingHintGroup(group));
    }

    for (const group of proposal.confusionEdgeGroups) {
      groupResults.push(this.validateEdgeGroup(group, "confusion"));
    }

    for (const group of proposal.prerequisiteEdgeGroups) {
      groupResults.push(this.validateEdgeGroup(group, "prerequisite"));
    }

    for (const group of proposal.strategyEfficacyGroups) {
      groupResults.push(this.validateStrategyEfficacyGroup(group));
    }

    for (const group of proposal.calibrationMetricGroups) {
      groupResults.push(this.validateCalibrationMetricGroup(group, userId));
    }

    for (const group of proposal.sessionRegulationGroups) {
      groupResults.push(this.validateSessionRegulationGroup(group));
    }

    // Compute overall outcome
    const overallOutcome = this.computeOverallOutcome(groupResults);

    // Compute summary
    const accepted = groupResults.filter((g) => g.outcome === "accept").length;
    const rejected = groupResults.filter((g) => g.outcome === "reject").length;
    const pending = groupResults.filter(
      (g) => g.outcome === "require_human_confirmation",
    ).length;

    return {
      proposalId: proposal.proposalId,
      overallOutcome,
      canApply: accepted > 0 || pending > 0,
      groupResults,
      summary: {
        totalGroups: groupResults.length,
        acceptedGroups: accepted,
        rejectedGroups: rejected,
        pendingHumanConfirmation: pending,
      },
      validatedAt: timestamp,
      isStale,
    };
  }

  // ===========================================================================
  // MEMORY PARAMETER VALIDATION
  // ===========================================================================

  private validateMemoryParameterGroup(
    group: OperationGroup<MemoryParameterOperation>,
    userId: UserId,
  ): GroupValidationResult {
    const operationResults: OperationValidationResult[] = [];
    const groupIssues: ValidationIssue[] = [];
    const groupConfirmationReasons: HumanConfirmationReason[] = [];

    for (const op of group.operations) {
      const result = this.validateMemoryParameterOperation(op, userId);
      operationResults.push(result);
    }

    // Check group-level confidence
    if (group.confidence < this.confidenceThresholds.memoryParameter) {
      groupIssues.push({
        code: "GROUP_LOW_CONFIDENCE",
        severity: "warning",
        message: `Group confidence ${group.confidence} below threshold ${this.confidenceThresholds.memoryParameter}`,
      });
    }

    if (group.confidence < this.humanTriggers.lowConfidenceThreshold) {
      groupConfirmationReasons.push("low_confidence");
    }

    const outcome = this.computeGroupOutcome(
      operationResults,
      groupConfirmationReasons,
    );

    return {
      groupId: group.groupId,
      groupType: group.groupType,
      outcome,
      issues: groupIssues,
      humanConfirmationReasons: groupConfirmationReasons,
      operationResults,
    };
  }

  private validateMemoryParameterOperation(
    op: MemoryParameterOperation,
    userId: UserId,
  ): OperationValidationResult {
    const issues: ValidationIssue[] = [];
    const confirmationReasons: HumanConfirmationReason[] = [];

    // Check target exists
    const node = this.graphReader.getNode(op.targetNodeId);
    if (!node) {
      issues.push({
        code: "TARGET_NOT_FOUND",
        severity: "error",
        message: `Target node not found: ${op.targetNodeId}`,
        relatedEntityId: op.targetNodeId,
      });
    }

    // Check mastery state exists (warning only)
    const mastery = this.masteryReader.getMasteryState(userId, op.targetNodeId);
    if (!mastery) {
      issues.push({
        code: "NO_MASTERY_STATE",
        severity: "warning",
        message: `No mastery state for node ${op.targetNodeId} - will be created`,
        relatedEntityId: op.targetNodeId,
      });
    }

    // Validate parameter ranges
    if (op.proposedValues.stability !== undefined) {
      if (
        op.proposedValues.stability < 0 ||
        op.proposedValues.stability > 100
      ) {
        issues.push({
          code: "INVALID_STABILITY",
          severity: "error",
          message: `Stability must be in [0, 100], got ${op.proposedValues.stability}`,
          fieldPath: "proposedValues.stability",
        });
      }
    }

    if (op.proposedValues.difficulty !== undefined) {
      if (
        op.proposedValues.difficulty < 0 ||
        op.proposedValues.difficulty > 1
      ) {
        issues.push({
          code: "INVALID_DIFFICULTY",
          severity: "error",
          message: `Difficulty must be in [0, 1], got ${op.proposedValues.difficulty}`,
          fieldPath: "proposedValues.difficulty",
        });
      }
    }

    if (op.proposedValues.retrievability !== undefined) {
      if (
        op.proposedValues.retrievability < 0 ||
        op.proposedValues.retrievability > 1
      ) {
        issues.push({
          code: "INVALID_RETRIEVABILITY",
          severity: "error",
          message: `Retrievability must be in [0, 1], got ${op.proposedValues.retrievability}`,
          fieldPath: "proposedValues.retrievability",
        });
      }
    }

    // Check confidence threshold
    if (op.confidence < this.confidenceThresholds.memoryParameter) {
      issues.push({
        code: "LOW_CONFIDENCE",
        severity: "warning",
        message: `Operation confidence ${op.confidence} below threshold`,
      });
    }

    if (op.confidence < this.humanTriggers.lowConfidenceThreshold) {
      confirmationReasons.push("low_confidence");
    }

    const hasErrors = issues.some((i) => i.severity === "error");
    let outcome: ValidationOutcome;

    if (hasErrors) {
      outcome = "reject";
    } else if (confirmationReasons.length > 0) {
      outcome = "require_human_confirmation";
    } else {
      outcome = "accept";
    }

    return {
      operationId: op.operationId,
      targetNodeId: op.targetNodeId,
      outcome,
      issues,
      humanConfirmationReasons: confirmationReasons,
    };
  }

  // ===========================================================================
  // SCHEDULING HINT VALIDATION
  // ===========================================================================

  private validateSchedulingHintGroup(
    group: OperationGroup<SchedulingHintOperation>,
  ): GroupValidationResult {
    const operationResults: OperationValidationResult[] = [];
    const groupIssues: ValidationIssue[] = [];
    const groupConfirmationReasons: HumanConfirmationReason[] = [];

    for (const op of group.operations) {
      const result = this.validateSchedulingHintOperation(op);
      operationResults.push(result);
    }

    const outcome = this.computeGroupOutcome(
      operationResults,
      groupConfirmationReasons,
    );

    return {
      groupId: group.groupId,
      groupType: group.groupType,
      outcome,
      issues: groupIssues,
      humanConfirmationReasons: groupConfirmationReasons,
      operationResults,
    };
  }

  private validateSchedulingHintOperation(
    op: SchedulingHintOperation,
  ): OperationValidationResult {
    const issues: ValidationIssue[] = [];
    const confirmationReasons: HumanConfirmationReason[] = [];

    // Check target exists
    const node = this.graphReader.getNode(op.targetNodeId);
    if (!node) {
      issues.push({
        code: "TARGET_NOT_FOUND",
        severity: "error",
        message: `Target node not found: ${op.targetNodeId}`,
        relatedEntityId: op.targetNodeId,
      });
    }

    // Validate hint values
    if (op.proposedDueDate < now()) {
      issues.push({
        code: "PAST_DUE_DATE",
        severity: "warning",
        message: `Proposed due date is in the past`,
        fieldPath: "proposedDueDate",
      });
    }

    if (op.priorityScore < 0 || op.priorityScore > 1) {
      issues.push({
        code: "INVALID_PRIORITY",
        severity: "error",
        message: `Priority score must be in [0, 1]`,
        fieldPath: "priorityScore",
      });
    }

    // Scheduling hints have lower bar - they're advisory
    const hasErrors = issues.some((i) => i.severity === "error");
    const outcome: ValidationOutcome = hasErrors ? "reject" : "accept";

    return {
      operationId: op.operationId,
      targetNodeId: op.targetNodeId,
      outcome,
      issues,
      humanConfirmationReasons: confirmationReasons,
    };
  }

  // ===========================================================================
  // EDGE OPERATION VALIDATION
  // ===========================================================================

  private validateEdgeGroup(
    group: OperationGroup<EdgeOperation>,
    edgeCategory: "confusion" | "prerequisite",
  ): GroupValidationResult {
    const operationResults: OperationValidationResult[] = [];
    const groupIssues: ValidationIssue[] = [];
    const groupConfirmationReasons: HumanConfirmationReason[] = [];

    for (const op of group.operations) {
      const result = this.validateEdgeOperation(op, edgeCategory);
      operationResults.push(result);
    }

    const outcome = this.computeGroupOutcome(
      operationResults,
      groupConfirmationReasons,
    );

    return {
      groupId: group.groupId,
      groupType: group.groupType,
      outcome,
      issues: groupIssues,
      humanConfirmationReasons: groupConfirmationReasons,
      operationResults,
    };
  }

  private validateEdgeOperation(
    op: EdgeOperation,
    edgeCategory: "confusion" | "prerequisite",
  ): OperationValidationResult {
    const issues: ValidationIssue[] = [];
    const confirmationReasons: HumanConfirmationReason[] = [];

    // Check source node exists
    const sourceNode = this.graphReader.getNode(op.sourceNodeId);
    if (!sourceNode) {
      issues.push({
        code: "SOURCE_NOT_FOUND",
        severity: "error",
        message: `Source node not found: ${op.sourceNodeId}`,
        relatedEntityId: op.sourceNodeId,
      });
    }

    // Check destination node exists
    const destNode = this.graphReader.getNode(op.destinationNodeId);
    if (!destNode) {
      issues.push({
        code: "DESTINATION_NOT_FOUND",
        severity: "error",
        message: `Destination node not found: ${op.destinationNodeId}`,
        relatedEntityId: op.destinationNodeId,
      });
    }

    // Validate based on operation type
    switch (op.operationType) {
      case "create": {
        const createOp = op as NewEdgeOperation;
        // Check edge doesn't already exist
        if (
          this.graphReader.edgeExists(
            createOp.sourceNodeId,
            createOp.destinationNodeId,
            createOp.edgeType,
          )
        ) {
          issues.push({
            code: "EDGE_EXISTS",
            severity: "error",
            message: `Edge already exists`,
          });
        }

        // Validate weight
        if (createOp.proposedWeight < 0 || createOp.proposedWeight > 1) {
          issues.push({
            code: "INVALID_WEIGHT",
            severity: "error",
            message: `Weight must be in [0, 1]`,
            fieldPath: "proposedWeight",
          });
        }

        // Check if prerequisite edge needs confirmation
        if (
          edgeCategory === "prerequisite" &&
          this.humanTriggers.prerequisiteEdgeRequiresConfirmation
        ) {
          confirmationReasons.push("structural_graph_change");
        }

        // Check confidence
        if (op.confidence < this.confidenceThresholds.edgeCreate) {
          issues.push({
            code: "LOW_CONFIDENCE",
            severity: "warning",
            message: `Confidence below threshold`,
          });
        }
        break;
      }

      case "adjust": {
        const adjustOp = op as EdgeWeightAdjustmentOperation;
        // Check edge exists
        if (
          !this.graphReader.edgeExists(
            adjustOp.sourceNodeId,
            adjustOp.destinationNodeId,
            adjustOp.edgeType,
          )
        ) {
          issues.push({
            code: "EDGE_NOT_FOUND",
            severity: "error",
            message: `Edge not found`,
          });
        }

        // Validate weight
        if (adjustOp.proposedWeight < 0 || adjustOp.proposedWeight > 1) {
          issues.push({
            code: "INVALID_WEIGHT",
            severity: "error",
            message: `Weight must be in [0, 1]`,
            fieldPath: "proposedWeight",
          });
        }

        // Check confidence
        if (op.confidence < this.confidenceThresholds.edgeUpdate) {
          issues.push({
            code: "LOW_CONFIDENCE",
            severity: "warning",
            message: `Confidence below threshold`,
          });
        }
        break;
      }

      case "remove": {
        const removeOp = op as EdgeRemovalOperation;
        // Check edge exists
        if (
          !this.graphReader.edgeExists(
            removeOp.sourceNodeId,
            removeOp.destinationNodeId,
            removeOp.edgeType,
          )
        ) {
          issues.push({
            code: "EDGE_NOT_FOUND",
            severity: "error",
            message: `Edge not found`,
          });
        }

        // Edge deletions always require human confirmation
        if (this.humanTriggers.edgeDeletionRequiresConfirmation) {
          confirmationReasons.push("structural_graph_change");
        }

        // Check confidence
        if (op.confidence < this.confidenceThresholds.edgeDelete) {
          issues.push({
            code: "LOW_CONFIDENCE",
            severity: "warning",
            message: `Confidence below threshold`,
          });
        }
        break;
      }
    }

    // Low confidence trigger
    if (op.confidence < this.humanTriggers.lowConfidenceThreshold) {
      if (!confirmationReasons.includes("low_confidence")) {
        confirmationReasons.push("low_confidence");
      }
    }

    const hasErrors = issues.some((i) => i.severity === "error");
    let outcome: ValidationOutcome;

    if (hasErrors) {
      outcome = "reject";
    } else if (confirmationReasons.length > 0) {
      outcome = "require_human_confirmation";
    } else {
      outcome = "accept";
    }

    return {
      operationId: op.operationId,
      targetNodeId: op.targetNodeId,
      outcome,
      issues,
      humanConfirmationReasons: confirmationReasons,
    };
  }

  // ===========================================================================
  // STRATEGY EFFICACY VALIDATION
  // ===========================================================================

  private validateStrategyEfficacyGroup(
    group: OperationGroup<StrategyEfficacyOperation>,
  ): GroupValidationResult {
    const operationResults: OperationValidationResult[] = [];
    const groupIssues: ValidationIssue[] = [];
    const groupConfirmationReasons: HumanConfirmationReason[] = [];

    for (const op of group.operations) {
      const result = this.validateStrategyEfficacyOperation(op);
      operationResults.push(result);
    }

    const outcome = this.computeGroupOutcome(
      operationResults,
      groupConfirmationReasons,
    );

    return {
      groupId: group.groupId,
      groupType: group.groupType,
      outcome,
      issues: groupIssues,
      humanConfirmationReasons: groupConfirmationReasons,
      operationResults,
    };
  }

  private validateStrategyEfficacyOperation(
    op: StrategyEfficacyOperation,
  ): OperationValidationResult {
    const issues: ValidationIssue[] = [];
    const confirmationReasons: HumanConfirmationReason[] = [];

    // Check strategy node exists
    const strategyNode = this.graphReader.getNode(op.strategyNodeId);
    if (!strategyNode) {
      issues.push({
        code: "STRATEGY_NOT_FOUND",
        severity: "error",
        message: `Strategy node not found: ${op.strategyNodeId}`,
        relatedEntityId: op.strategyNodeId,
      });
    } else if (strategyNode.nodeType !== "strategy") {
      issues.push({
        code: "NOT_STRATEGY_NODE",
        severity: "error",
        message: `Node ${op.strategyNodeId} is not a strategy node`,
        relatedEntityId: op.strategyNodeId,
      });
    }

    // Validate efficacy score
    if (op.proposedEfficacy < 0 || op.proposedEfficacy > 1) {
      issues.push({
        code: "INVALID_EFFICACY",
        severity: "error",
        message: `Efficacy must be in [0, 1]`,
        fieldPath: "proposedEfficacy",
      });
    }

    // Check confidence threshold
    if (op.confidence < this.confidenceThresholds.strategyEfficacy) {
      issues.push({
        code: "LOW_CONFIDENCE",
        severity: "warning",
        message: `Confidence below threshold`,
      });
    }

    if (op.confidence < this.humanTriggers.lowConfidenceThreshold) {
      confirmationReasons.push("low_confidence");
    }

    const hasErrors = issues.some((i) => i.severity === "error");
    let outcome: ValidationOutcome;

    if (hasErrors) {
      outcome = "reject";
    } else if (confirmationReasons.length > 0) {
      outcome = "require_human_confirmation";
    } else {
      outcome = "accept";
    }

    return {
      operationId: op.operationId,
      targetNodeId: op.targetNodeId,
      outcome,
      issues,
      humanConfirmationReasons: confirmationReasons,
    };
  }

  // ===========================================================================
  // CALIBRATION METRIC VALIDATION
  // ===========================================================================

  private validateCalibrationMetricGroup(
    group: OperationGroup<CalibrationMetricOperation>,
    userId: UserId,
  ): GroupValidationResult {
    const operationResults: OperationValidationResult[] = [];
    const groupIssues: ValidationIssue[] = [];
    const groupConfirmationReasons: HumanConfirmationReason[] = [];

    for (const op of group.operations) {
      const result = this.validateCalibrationMetricOperation(op, userId);
      operationResults.push(result);
    }

    const outcome = this.computeGroupOutcome(
      operationResults,
      groupConfirmationReasons,
    );

    return {
      groupId: group.groupId,
      groupType: group.groupType,
      outcome,
      issues: groupIssues,
      humanConfirmationReasons: groupConfirmationReasons,
      operationResults,
    };
  }

  private validateCalibrationMetricOperation(
    op: CalibrationMetricOperation,
    _userId: UserId,
  ): OperationValidationResult {
    const issues: ValidationIssue[] = [];
    const confirmationReasons: HumanConfirmationReason[] = [];

    // Check target exists
    const node = this.graphReader.getNode(op.targetNodeId);
    if (!node) {
      issues.push({
        code: "TARGET_NOT_FOUND",
        severity: "error",
        message: `Target node not found: ${op.targetNodeId}`,
        relatedEntityId: op.targetNodeId,
      });
    }

    // Validate metric-specific constraints
    switch (op.metricType) {
      case "brier_score":
        if (op.value < 0 || op.value > 1) {
          issues.push({
            code: "INVALID_BRIER_SCORE",
            severity: "error",
            message: `Brier score must be in [0, 1]`,
            fieldPath: "value",
          });
        }
        break;
      case "ece":
        if (op.value < 0 || op.value > 1) {
          issues.push({
            code: "INVALID_ECE",
            severity: "error",
            message: `ECE must be in [0, 1]`,
            fieldPath: "value",
          });
        }
        break;
      case "bias":
        if (op.value < -1 || op.value > 1) {
          issues.push({
            code: "INVALID_BIAS",
            severity: "error",
            message: `Bias must be in [-1, 1]`,
            fieldPath: "value",
          });
        }
        break;
    }

    // Calibration metrics are informational - lower bar
    const hasErrors = issues.some((i) => i.severity === "error");
    const outcome: ValidationOutcome = hasErrors ? "reject" : "accept";

    return {
      operationId: op.operationId,
      targetNodeId: op.targetNodeId,
      outcome,
      issues,
      humanConfirmationReasons: confirmationReasons,
    };
  }

  // ===========================================================================
  // SESSION REGULATION VALIDATION
  // ===========================================================================

  private validateSessionRegulationGroup(
    group: OperationGroup<SessionRegulationOperation>,
  ): GroupValidationResult {
    const operationResults: OperationValidationResult[] = [];
    const groupIssues: ValidationIssue[] = [];
    const groupConfirmationReasons: HumanConfirmationReason[] = [];

    for (const op of group.operations) {
      const result = this.validateSessionRegulationOperation(op);
      operationResults.push(result);
    }

    const outcome = this.computeGroupOutcome(
      operationResults,
      groupConfirmationReasons,
    );

    return {
      groupId: group.groupId,
      groupType: group.groupType,
      outcome,
      issues: groupIssues,
      humanConfirmationReasons: groupConfirmationReasons,
      operationResults,
    };
  }

  private validateSessionRegulationOperation(
    op: SessionRegulationOperation,
  ): OperationValidationResult {
    const issues: ValidationIssue[] = [];
    const confirmationReasons: HumanConfirmationReason[] = [];

    // Check target exists (if applicable)
    const node = this.graphReader.getNode(op.targetNodeId);
    if (!node) {
      issues.push({
        code: "TARGET_NOT_FOUND",
        severity: "warning", // Warning only for session regulation
        message: `Target node not found: ${op.targetNodeId}`,
        relatedEntityId: op.targetNodeId,
      });
    }

    // Validate urgency
    if (op.urgency < 0 || op.urgency > 1) {
      issues.push({
        code: "INVALID_URGENCY",
        severity: "error",
        message: `Urgency must be in [0, 1]`,
        fieldPath: "urgency",
      });
    }

    // Session regulation hints are advisory
    const hasErrors = issues.some((i) => i.severity === "error");
    const outcome: ValidationOutcome = hasErrors ? "reject" : "accept";

    return {
      operationId: op.operationId,
      targetNodeId: op.targetNodeId,
      outcome,
      issues,
      humanConfirmationReasons: confirmationReasons,
    };
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private computeGroupOutcome(
    results: readonly OperationValidationResult[],
    additionalConfirmationReasons: readonly HumanConfirmationReason[],
  ): ValidationOutcome {
    const rejected = results.filter((r) => r.outcome === "reject");
    const pending = results.filter(
      (r) => r.outcome === "require_human_confirmation",
    );

    // If any operations are rejected, the group is rejected
    if (rejected.length > 0) {
      return "reject";
    }

    // If any operations need human confirmation or group has confirmation reasons
    if (pending.length > 0 || additionalConfirmationReasons.length > 0) {
      return "require_human_confirmation";
    }

    return "accept";
  }

  private computeOverallOutcome(
    groupResults: readonly GroupValidationResult[],
  ): ValidationOutcome {
    const allRejected = groupResults.every((g) => g.outcome === "reject");
    const anyRejected = groupResults.some((g) => g.outcome === "reject");
    const anyPending = groupResults.some(
      (g) => g.outcome === "require_human_confirmation",
    );

    if (allRejected) {
      return "reject";
    }
    if (anyRejected || anyPending) {
      return "require_human_confirmation";
    }
    return "accept";
  }
}
