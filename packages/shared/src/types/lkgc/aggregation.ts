// =============================================================================
// LKGC AGGREGATION - Event Processing Pipeline
// =============================================================================
// Models the explicit aggregation pipeline:
// 1. Raw events (append-only)
// 2. Derived features (per attempt / session / day)
// 3. State updates (MasteryState deltas)
// 4. Snapshots (for AI batch inference)
// 5. Proposals (AI outputs)
// 6. Applied changes (audited transitions)
// =============================================================================

import type {
  LKGCEntity,
  EntityId,
  NodeId,
  EventId,
  ProposalId,
  SnapshotId,
  SessionId,
  Timestamp,
  Duration,
  Confidence,
  NormalizedValue,
  Provenance,
} from "./foundation";
import type { LKGCEvent } from "./events";
import type {
  MasteryState,
  MasteryStateDelta,
  MasterySnapshot,
} from "./mastery";

// =============================================================================
// LAYER 1: RAW EVENTS (append-only)
// =============================================================================

/**
 * Raw event log entry
 * Events are immutable once written
 */
export interface RawEventEntry {
  readonly eventId: EventId;
  readonly event: LKGCEvent;
  readonly receivedAt: Timestamp;
  readonly processedAt?: Timestamp;
  readonly processingStatus: "pending" | "processed" | "failed" | "skipped";
  readonly processingError?: string;
}

/**
 * Event batch for bulk processing
 */
export interface EventBatch {
  readonly batchId: EntityId;
  readonly events: readonly RawEventEntry[];
  readonly createdAt: Timestamp;
  readonly processedAt?: Timestamp;
  readonly eventCount: number;
  readonly firstEventAt: Timestamp;
  readonly lastEventAt: Timestamp;
}

// =============================================================================
// LAYER 2: DERIVED FEATURES
// =============================================================================

/**
 * Feature granularity levels
 */
export type FeatureGranularity =
  | "attempt"
  | "session"
  | "day"
  | "week"
  | "month";

/**
 * Base derived feature
 */
export interface BaseDerivedFeature extends LKGCEntity {
  readonly granularity: FeatureGranularity;
  readonly periodStart: Timestamp;
  readonly periodEnd: Timestamp;
  readonly derivedAt: Timestamp;
  readonly sourceEventIds: readonly EventId[];
}

/**
 * Attempt-level features (single review)
 */
export interface AttemptFeatures extends BaseDerivedFeature {
  readonly granularity: "attempt";
  readonly cardId: NodeId;
  readonly sessionId: SessionId;

  /** Performance features */
  readonly performance: {
    readonly success: boolean;
    readonly responseTime: Duration;
    readonly hintCount: number;
    readonly changeCount: number;
    readonly partialCredit?: NormalizedValue;
  };

  /** Metacognitive features */
  readonly metacognition: {
    readonly preConfidence?: Confidence;
    readonly postConfidence?: Confidence;
    readonly calibrationError?: number;
    readonly feelingOfKnowing?: string;
  };

  /** Behavioral features */
  readonly behavior: {
    readonly peekedAtAnswer: boolean;
    readonly stallDuration?: Duration;
    readonly scrollDepth?: NormalizedValue;
    readonly rapidResponse: boolean;
  };

  /** Context features */
  readonly context: {
    readonly positionInSession: number;
    readonly timeSinceSessionStart: Duration;
    readonly timeOfDay: number;
    readonly daysSinceLastReview: number;
  };
}

/**
 * Session-level features (study session)
 */
export interface SessionFeatures extends BaseDerivedFeature {
  readonly granularity: "session";
  readonly sessionId: SessionId;

  /** Volume metrics */
  readonly volume: {
    readonly cardsReviewed: number;
    readonly newCardsLearned: number;
    readonly duration: Duration;
    readonly activeDuration: Duration;
  };

  /** Performance metrics */
  readonly performance: {
    readonly accuracy: NormalizedValue;
    readonly avgResponseTime: Duration;
    readonly responseTimeVariance: number;
    readonly maxStreak: number;
  };

  /** Pacing metrics */
  readonly pacing: {
    readonly trend: "speeding_up" | "slowing_down" | "steady" | "erratic";
    readonly fatiguePoint?: number;
    readonly interruptions: number;
    readonly pauseDuration: Duration;
  };

  /** Metacognition metrics */
  readonly metacognition: {
    readonly avgConfidence: Confidence;
    readonly calibrationError: number;
    readonly hintDependency: NormalizedValue;
    readonly reflectionSubmitted: boolean;
  };

  /** Affect indicators */
  readonly affect: {
    readonly frustrationIndicators: number;
    readonly engagementScore: NormalizedValue;
    readonly startMood?: NormalizedValue;
    readonly endMood?: NormalizedValue;
  };
}

/**
 * Daily features (aggregated across sessions)
 */
export interface DailyFeatures extends BaseDerivedFeature {
  readonly granularity: "day";
  readonly date: string; // ISO date YYYY-MM-DD

  /** Activity metrics */
  readonly activity: {
    readonly sessionCount: number;
    readonly totalDuration: Duration;
    readonly cardsReviewed: number;
    readonly newCardsLearned: number;
  };

  /** Performance summary */
  readonly performance: {
    readonly accuracy: NormalizedValue;
    readonly avgResponseTime: Duration;
    readonly comparedToAvg: number; // Standard deviations from mean
  };

  /** Streak info */
  readonly streak: {
    readonly maintained: boolean;
    readonly currentLength: number;
    readonly frozeUsed: boolean;
  };

  /** Goals */
  readonly goals: {
    readonly dailyGoalMet: boolean;
    readonly progress: NormalizedValue;
    readonly cardsUntilGoal: number;
  };

  /** Gamification */
  readonly gamification: {
    readonly xpEarned: number;
    readonly badgesEarned: number;
    readonly questsCompleted: number;
  };
}

/**
 * Weekly features (for trend analysis)
 */
export interface WeeklyFeatures extends BaseDerivedFeature {
  readonly granularity: "week";
  readonly weekNumber: number;
  readonly year: number;

  /** Consistency metrics */
  readonly consistency: {
    readonly activeDays: number;
    readonly streakMaintained: boolean;
    readonly avgSessionsPerDay: number;
    readonly sessionTimeVariance: number;
  };

  /** Progress metrics */
  readonly progress: {
    readonly netCardsAdded: number;
    readonly masteryGained: number;
    readonly conceptsCovered: number;
    readonly goalsCompleted: number;
  };

  /** Trend indicators */
  readonly trends: {
    readonly accuracyTrend: number;
    readonly retentionTrend: number;
    readonly engagementTrend: number;
    readonly efficiencyTrend: number;
  };

  /** Comparison to previous week */
  readonly weekOverWeek: {
    readonly cardsReviewedChange: number;
    readonly accuracyChange: number;
    readonly studyTimeChange: number;
  };
}

/**
 * Union of all derived features
 */
export type DerivedFeature =
  | AttemptFeatures
  | SessionFeatures
  | DailyFeatures
  | WeeklyFeatures;

// =============================================================================
// LAYER 3: STATE UPDATES
// =============================================================================

/**
 * State update batch
 */
export interface StateUpdateBatch {
  readonly batchId: EntityId;
  readonly timestamp: Timestamp;
  readonly triggeringEventIds: readonly EventId[];
  readonly deltas: readonly MasteryStateDelta[];
  readonly processingDuration: Duration;
}

/**
 * State transition record
 */
export interface StateTransition {
  readonly id: EntityId;
  readonly nodeId: NodeId;
  readonly timestamp: Timestamp;
  readonly previousStateVersion: number;
  readonly newStateVersion: number;
  readonly delta: MasteryStateDelta;
  readonly cause: StateTransitionCause;
}

export interface StateTransitionCause {
  readonly type: "event" | "batch_update" | "ai_proposal" | "manual" | "decay";
  readonly triggerId: EntityId;
  readonly description: string;
}

// =============================================================================
// LAYER 4: SNAPSHOTS (for AI batch inference)
// =============================================================================

/**
 * Complete snapshot for AI processing
 */
export interface AISnapshot extends LKGCEntity<SnapshotId> {
  readonly id: SnapshotId;
  readonly createdAt: Timestamp;
  readonly purpose: SnapshotPurpose;

  /** Mastery snapshots for all relevant nodes */
  readonly masterySnapshots: readonly MasterySnapshot[];

  /** Global features */
  readonly globalFeatures: GlobalFeatures;

  /** Recent session summary */
  readonly recentSessions: readonly SessionFeatures[];

  /** Pending decisions needed */
  readonly pendingDecisions: readonly PendingDecision[];

  /** Snapshot stats */
  readonly stats: {
    readonly nodesIncluded: number;
    readonly eventsProcessed: number;
    readonly timePeriodDays: number;
  };
}

export type SnapshotPurpose =
  | "scheduling" // For scheduling decisions
  | "coaching" // For coaching interventions
  | "gamification" // For gamification decisions
  | "analysis" // For user analytics
  | "model_training"; // For model improvement

/**
 * Global features (user-level, not node-level)
 */
export interface GlobalFeatures {
  /** Learning velocity */
  readonly learningVelocity: NormalizedValue;

  /** Overall retention rate */
  readonly retentionRate: NormalizedValue;

  /** Study consistency score */
  readonly consistencyScore: NormalizedValue;

  /** Current cognitive load estimate */
  readonly cognitiveLoadEstimate: NormalizedValue;

  /** Motivation indicators */
  readonly motivationIndicators: {
    readonly streakHealth: NormalizedValue;
    readonly goalProgress: NormalizedValue;
    readonly engagementTrend: number;
  };

  /** Time patterns */
  readonly timePatterns: {
    readonly preferredStudyTime: string;
    readonly avgSessionDuration: Duration;
    readonly daysActiveThisWeek: number;
  };
}

/**
 * Pending decision that AI needs to make
 */
export interface PendingDecision {
  readonly type: "schedule" | "coach" | "gamify" | "intervene";
  readonly priority: "low" | "medium" | "high" | "urgent";
  readonly context: Readonly<Record<string, unknown>>;
  readonly deadline?: Timestamp;
}

// =============================================================================
// LAYER 5: PROPOSALS (AI outputs)
// =============================================================================

/**
 * AI proposal - suggested change to the system
 */
export interface AIProposal extends LKGCEntity<ProposalId> {
  readonly id: ProposalId;
  readonly proposalType: ProposalType;
  readonly status: ProposalStatus;

  /** When proposed */
  readonly proposedAt: Timestamp;

  /** Source snapshot */
  readonly sourceSnapshotId: SnapshotId;

  /** Model that generated this */
  readonly modelId: string;
  readonly modelVersion: string;

  /** Confidence in proposal */
  readonly confidence: Confidence;

  /** The actual proposal content */
  readonly content: ProposalContent;

  /** Rationale (explainability) */
  readonly rationale: DecisionRationale;

  /** User response (if any) */
  readonly userResponse?: UserProposalResponse;

  /** Application result */
  readonly applicationResult?: ProposalApplicationResult;
}

export type ProposalType =
  | "scheduling" // Change review schedule
  | "difficulty_adjustment" // Adjust card difficulty
  | "coaching_intervention" // Show coaching message
  | "gamification_trigger" // Trigger gamification event
  | "content_suggestion" // Suggest content changes
  | "strategy_recommendation" // Recommend learning strategy
  | "goal_adjustment"; // Adjust user goals

export type ProposalStatus =
  | "pending" // Awaiting decision
  | "auto_approved" // Below threshold, auto-applied
  | "user_approved" // User approved
  | "user_rejected" // User rejected
  | "applied" // Successfully applied
  | "failed" // Application failed
  | "expired"; // Timed out

/**
 * Proposal content (discriminated union by type)
 */
export type ProposalContent =
  | SchedulingProposal
  | DifficultyAdjustmentProposal
  | CoachingInterventionProposal
  | GamificationTriggerProposal
  | ContentSuggestionProposal
  | StrategyRecommendationProposal
  | GoalAdjustmentProposal;

export interface SchedulingProposal {
  readonly type: "scheduling";
  readonly cardId: NodeId;
  readonly currentDue: Timestamp;
  readonly proposedDue: Timestamp;
  readonly proposedInterval: number;
  readonly reason:
    | "performance_based"
    | "load_balancing"
    | "context_optimal"
    | "user_preference";
}

export interface DifficultyAdjustmentProposal {
  readonly type: "difficulty_adjustment";
  readonly cardId: NodeId;
  readonly currentDifficulty: NormalizedValue;
  readonly proposedDifficulty: NormalizedValue;
  readonly evidenceStrength: NormalizedValue;
}

export interface CoachingInterventionProposal {
  readonly type: "coaching_intervention";
  readonly interventionType:
    | "encouragement"
    | "strategy"
    | "warning"
    | "celebration"
    | "tip";
  readonly message: string;
  readonly templateId?: NodeId;
  readonly urgency: "low" | "medium" | "high";
  readonly relatedNodeIds?: readonly NodeId[];
}

export interface GamificationTriggerProposal {
  readonly type: "gamification_trigger";
  readonly triggerType:
    | "quest_offer"
    | "challenge_offer"
    | "badge_hint"
    | "streak_warning";
  readonly targetId?: NodeId;
  readonly parameters: Readonly<Record<string, unknown>>;
}

export interface ContentSuggestionProposal {
  readonly type: "content_suggestion";
  readonly suggestionType:
    | "add_hint"
    | "rephrase"
    | "add_example"
    | "split_card"
    | "merge_cards";
  readonly targetNodeId: NodeId;
  readonly suggestion: string;
  readonly reason: string;
}

export interface StrategyRecommendationProposal {
  readonly type: "strategy_recommendation";
  readonly strategyId: NodeId;
  readonly targetNodeIds: readonly NodeId[];
  readonly expectedBenefit: string;
  readonly evidenceStrength: NormalizedValue;
}

export interface GoalAdjustmentProposal {
  readonly type: "goal_adjustment";
  readonly goalId: NodeId;
  readonly adjustmentType: "increase" | "decrease" | "extend" | "simplify";
  readonly currentTarget: number;
  readonly proposedTarget: number;
  readonly reason: string;
}

/**
 * Decision rationale - explainability artifact
 */
export interface DecisionRationale {
  /** Features that influenced decision */
  readonly featuresUsed: readonly FeatureContribution[];

  /** Top contributing factors */
  readonly topFactors: readonly string[];

  /** Counterfactuals */
  readonly counterfactuals: readonly Counterfactual[];

  /** Human-readable explanation */
  readonly explanation: string;

  /** Confidence breakdown */
  readonly confidenceBreakdown: {
    readonly dataConfidence: Confidence;
    readonly modelConfidence: Confidence;
    readonly historicalAccuracy: NormalizedValue;
  };
}

export interface FeatureContribution {
  readonly featureName: string;
  readonly value: number;
  readonly contribution: number; // SHAP-like value
  readonly direction: "positive" | "negative";
}

export interface Counterfactual {
  readonly condition: string;
  readonly alternativeOutcome: string;
  readonly likelihood: NormalizedValue;
}

/**
 * User response to proposal
 */
export interface UserProposalResponse {
  readonly timestamp: Timestamp;
  readonly decision: "approve" | "reject" | "modify" | "defer";
  readonly modifiedContent?: ProposalContent;
  readonly reason?: string;
  readonly feedback?: string;
}

/**
 * Result of applying a proposal
 */
export interface ProposalApplicationResult {
  readonly appliedAt: Timestamp;
  readonly success: boolean;
  readonly error?: string;
  readonly affectedEntities: readonly EntityId[];
  readonly stateTransitionIds: readonly EntityId[];
}

// =============================================================================
// LAYER 6: APPLIED CHANGES (audited transitions)
// =============================================================================

/**
 * Audited change record - immutable record of applied change
 */
export interface AuditedChange extends LKGCEntity {
  readonly changeType:
    | "state_update"
    | "proposal_applied"
    | "manual_override"
    | "system_maintenance";

  /** When change was applied */
  readonly appliedAt: Timestamp;

  /** Who/what initiated the change */
  readonly initiator: ChangeInitiator;

  /** Affected entities */
  readonly affectedEntities: readonly AffectedEntity[];

  /** Pre and post state hashes (for verification) */
  readonly stateHashes: {
    readonly pre: string;
    readonly post: string;
  };

  /** Rollback capability */
  readonly rollbackInfo: RollbackInfo;
}

export interface ChangeInitiator {
  readonly type: "user" | "ai_proposal" | "system" | "plugin";
  readonly id: EntityId;
  readonly provenance: Provenance;
}

export interface AffectedEntity {
  readonly entityId: EntityId;
  readonly entityType: string;
  readonly changeType: "created" | "updated" | "deleted";
  readonly fieldChanges?: readonly FieldChange[];
}

export interface FieldChange {
  readonly field: string;
  readonly previousValue: unknown;
  readonly newValue: unknown;
}

export interface RollbackInfo {
  readonly canRollback: boolean;
  readonly rollbackDeadline?: Timestamp;
  readonly rollbackData?: Readonly<Record<string, unknown>>;
  readonly rolledBackAt?: Timestamp;
  readonly rollbackReason?: string;
}

// =============================================================================
// AGGREGATION PIPELINE CONFIGURATION
// =============================================================================

/**
 * Pipeline configuration
 */
export interface AggregationPipelineConfig {
  /** Feature computation intervals */
  readonly featureIntervals: {
    readonly attemptFeatures: "immediate";
    readonly sessionFeatures: "on_session_end";
    readonly dailyFeatures: Duration; // e.g., compute every hour
    readonly weeklyFeatures: Duration;
  };

  /** Snapshot configuration */
  readonly snapshotConfig: {
    readonly schedulingSnapshotInterval: Duration;
    readonly maxNodesPerSnapshot: number;
    readonly includeHistoryDays: number;
  };

  /** Proposal configuration */
  readonly proposalConfig: {
    readonly autoApproveThreshold: Confidence;
    readonly expirationDuration: Duration;
    readonly maxPendingProposals: number;
  };

  /** Audit configuration */
  readonly auditConfig: {
    readonly retentionDays: number;
    readonly rollbackWindowDays: number;
  };
}
