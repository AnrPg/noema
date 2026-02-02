// =============================================================================
// DECISION TYPES - Core Types for the Decision Layer
// =============================================================================
// The Decision Layer produces ActionPlans for users at a given time.
// These types define all inputs, outputs, and intermediate structures.
//
// NOTE: Some types have "Decision" prefix to avoid conflicts with
// types in lkgc/aggregation.ts (e.g., DecisionRationale vs aggregation's)
//
// NO UI. NO AI. NO SCHEDULING IMPLEMENTATION.
// =============================================================================

import type {
  NodeId,
  UserId,
  SessionId,
  Timestamp,
  Duration,
  Confidence,
  NormalizedValue,
} from "../types/lkgc/foundation";
import type { MasteryGranularity } from "../types/lkgc/mastery";
import type { NodeType } from "../types/lkgc/nodes";

// =============================================================================
// DECISION IDS - Branded types for type safety
// =============================================================================

declare const __actionPlanId: unique symbol;
export type ActionPlanId = string & { readonly [__actionPlanId]: never };

declare const __queueItemId: unique symbol;
export type QueueItemId = string & { readonly [__queueItemId]: never };

declare const __interventionId: unique symbol;
export type InterventionId = string & { readonly [__interventionId]: never };

declare const __gameHookId: unique symbol;
export type GameHookId = string & { readonly [__gameHookId]: never };

declare const __rationaleId: unique symbol;
export type RationaleId = string & { readonly [__rationaleId]: never };

declare const __decisionRuleId: unique symbol;
export type DecisionRuleId = string & { readonly [__decisionRuleId]: never };

// =============================================================================
// DECISION CONSTRAINTS - User-specified parameters
// =============================================================================

/**
 * Constraints for generating an action plan
 */
export interface DecisionConstraints {
  /** Maximum number of items in the review queue */
  readonly maxItems: number;

  /** Time budget in milliseconds */
  readonly timeBudget: Duration;

  /** Desired retrievability range for items */
  readonly retrievabilityRange: RetrievabilityRange;

  /** Ratio of new items to review items (0 = all review, 1 = all new) */
  readonly newVsReviewRatio: NormalizedValue;

  /** Content filters */
  readonly contentFilters: ContentFilters;

  /** Whether to enable interleaving */
  readonly enableInterleaving: boolean;

  /** Maximum consecutive items from same topic */
  readonly maxConsecutiveSameTopic: number;

  /** Whether to include coaching interventions */
  readonly includeCoaching: boolean;

  /** Whether to include gamification hooks */
  readonly includeGamification: boolean;
}

/**
 * Retrievability range specification
 */
export interface RetrievabilityRange {
  /** Minimum retrievability (items below this are overdue) */
  readonly min: NormalizedValue;

  /** Maximum retrievability (items above this are not due yet) */
  readonly max: NormalizedValue;

  /** Target retrievability for scheduling */
  readonly target: NormalizedValue;
}

/**
 * Content filtering options
 */
export interface ContentFilters {
  /** Specific deck IDs to include (empty = all) */
  readonly deckIds: readonly NodeId[];

  /** Tags to include (empty = all) */
  readonly includeTags: readonly string[];

  /** Tags to exclude */
  readonly excludeTags: readonly string[];

  /** Node types to include (empty = all) */
  readonly nodeTypes: readonly NodeType[];

  /** Only items with goals linked */
  readonly goalLinkedOnly: boolean;

  /** Exclude items reviewed today */
  readonly excludeReviewedToday: boolean;
}

// =============================================================================
// DECISION CONTEXT - Session and user state
// =============================================================================

/**
 * Learning mode for study sessions (used in decision context)
 * Different from ecosystem LearningMode for categories
 */
export type SessionLearningMode = "review" | "learn" | "exam" | "mixed";

/**
 * Device type
 */
export type DeviceType = "mobile" | "desktop" | "tablet";

/**
 * Time of day (prefixed to avoid conflict with aggregation.ts TimeOfDay)
 */
export type DecisionTimeOfDay = "morning" | "afternoon" | "evening" | "night";

/**
 * Context for decision making
 */
export interface DecisionContext {
  /** Current learning mode */
  readonly mode: SessionLearningMode;

  /** Device being used */
  readonly device: DeviceType;

  /** User-reported fatigue level (0 = fresh, 1 = exhausted) */
  readonly fatigue: NormalizedValue;

  /** User-reported motivation level (0 = low, 1 = high) */
  readonly motivation: NormalizedValue;

  /** Available study time (ms) */
  readonly availableTime: Duration;

  /** Time of day */
  readonly timeOfDay: DecisionTimeOfDay;

  /** Current session ID (if in session) */
  readonly sessionId?: SessionId;

  /** Items already reviewed this session */
  readonly reviewedThisSession: readonly NodeId[];

  /** Current streak length (days) */
  readonly currentStreak: number;

  /** Whether user explicitly requested practice mode */
  readonly practiceMode: boolean;
}

// =============================================================================
// DEFAULT CONSTRAINTS AND CONTEXT
// =============================================================================

/**
 * Default decision constraints
 */
export const DEFAULT_CONSTRAINTS: DecisionConstraints = {
  maxItems: 20,
  timeBudget: (30 * 60 * 1000) as Duration, // 30 minutes
  retrievabilityRange: {
    min: 0.7 as NormalizedValue,
    max: 0.95 as NormalizedValue,
    target: 0.9 as NormalizedValue,
  },
  newVsReviewRatio: 0.2 as NormalizedValue, // 20% new
  contentFilters: {
    deckIds: [],
    includeTags: [],
    excludeTags: [],
    nodeTypes: [],
    goalLinkedOnly: false,
    excludeReviewedToday: false,
  },
  enableInterleaving: true,
  maxConsecutiveSameTopic: 3,
  includeCoaching: true,
  includeGamification: true,
};

/**
 * Default decision context
 */
export const DEFAULT_CONTEXT: DecisionContext = {
  mode: "review",
  device: "desktop",
  fatigue: 0.3 as NormalizedValue,
  motivation: 0.7 as NormalizedValue,
  availableTime: (30 * 60 * 1000) as Duration,
  timeOfDay: "morning",
  reviewedThisSession: [],
  currentStreak: 0,
  practiceMode: false,
};

// =============================================================================
// ACTION PLAN - Main output
// =============================================================================

/**
 * Complete action plan for a learning session
 */
export interface ActionPlan {
  /** Unique ID for this plan */
  readonly planId: ActionPlanId;

  /** User this plan is for */
  readonly userId: UserId;

  /** When this plan was generated */
  readonly generatedAt: Timestamp;

  /** Constraints used to generate this plan */
  readonly constraints: DecisionConstraints;

  /** Context used to generate this plan */
  readonly context: DecisionContext;

  /** Review queue (prioritized list of items) */
  readonly reviewQueue: ReviewQueue;

  /** Metacognitive coaching interventions */
  readonly coachingInterventions: readonly CoachingIntervention[];

  /** Gamification hooks */
  readonly gamificationHooks: readonly GamificationHook[];

  /** Plan diagnostics (for debugging and audit) */
  readonly diagnostics: ActionPlanDiagnostics;

  /** Overall plan rationale */
  readonly rationale: DecisionRationale;
}

// =============================================================================
// REVIEW QUEUE - Prioritized item list
// =============================================================================

/**
 * Review queue with metadata
 */
export interface ReviewQueue {
  /** Ordered list of items to review */
  readonly items: readonly ReviewQueueItem[];

  /** Total estimated time (ms) */
  readonly estimatedTime: Duration;

  /** Count by category */
  readonly counts: QueueCounts;

  /** Queue-level rationale */
  readonly rationale: DecisionRationale;
}

/**
 * Queue counts by category
 */
export interface QueueCounts {
  readonly total: number;
  readonly new: number;
  readonly review: number;
  readonly overdue: number;
  readonly byDifficulty: Readonly<Record<DifficultyBucket, number>>;
}

export type DifficultyBucket = "easy" | "medium" | "hard" | "very_hard";

/**
 * Single item in the review queue
 */
export interface ReviewQueueItem {
  /** Unique ID for this queue item */
  readonly itemId: QueueItemId;

  /** Node ID of the item to review */
  readonly nodeId: NodeId;

  /** Granularity */
  readonly granularity: MasteryGranularity;

  /** Position in queue (0-indexed) */
  readonly position: number;

  /** Priority score (higher = more urgent) */
  readonly priorityScore: number;

  /** Scoring breakdown */
  readonly scoring: PriorityScoring;

  /** Estimated time to review (ms) */
  readonly estimatedTime: Duration;

  /** Item category */
  readonly category: ItemCategory;

  /** Why this item is included and at this position */
  readonly rationale: DecisionRationale;

  /** Interleaving metadata */
  readonly interleaving?: InterleavingMetadata;
}

export type ItemCategory = "new" | "learning" | "review" | "relearning";

/**
 * Breakdown of priority scoring factors
 */
export interface PriorityScoring {
  /** Base urgency score (from retrievability) */
  readonly urgency: number;

  /** Importance factor (goal-linked) */
  readonly importance: number;

  /** Prerequisite pressure (blocks other items) */
  readonly prerequisitePressure: number;

  /** Interference penalty (confusable items) */
  readonly interferencePenalty: number;

  /** Time cost factor */
  readonly timeCost: number;

  /** Fatigue compatibility */
  readonly fatigueCompatibility: number;

  /** Weights used for each factor */
  readonly weights: PriorityScoringWeights;

  /** Final computed score */
  readonly finalScore: number;
}

/**
 * Weights for priority scoring
 */
export interface PriorityScoringWeights {
  readonly urgency: number;
  readonly importance: number;
  readonly prerequisitePressure: number;
  readonly interferencePenalty: number;
  readonly timeCost: number;
  readonly fatigueCompatibility: number;
}

/**
 * Metadata for interleaving decisions
 */
export interface InterleavingMetadata {
  /** Topic/deck this item belongs to */
  readonly topicId: NodeId;

  /** Items in queue from same topic */
  readonly sameTopicCount: number;

  /** Gap since last item from same topic */
  readonly gapFromSameTopic: number;

  /** Potential confusions in nearby queue positions */
  readonly nearbyConfusions: readonly NodeId[];

  /** Whether this item was moved for interleaving */
  readonly wasReordered: boolean;
}

// =============================================================================
// COACHING INTERVENTIONS - Metacognitive support
// =============================================================================

/**
 * Coaching intervention type
 */
export type CoachingInterventionType =
  | "prediction_prompt" // Pre-answer confidence
  | "error_attribution" // Why did you get it wrong?
  | "strategy_suggestion" // Try this strategy
  | "planning_prompt" // Set a goal
  | "reflection_prompt" // Post-session reflection
  | "interleaving_explanation" // Why we're mixing topics
  | "desirable_difficulty" // This is meant to be hard
  | "calibration_feedback" // Your confidence vs accuracy
  | "break_suggestion" // Time for a break
  | "progress_celebration" // Celebrate achievement
  | "streak_encouragement"; // Keep the streak going

/**
 * Scope of intervention
 */
export type InterventionScope = "session" | "item" | "batch";

/**
 * Metacognitive coaching intervention
 */
export interface CoachingIntervention {
  /** Unique ID */
  readonly interventionId: InterventionId;

  /** Intervention type */
  readonly type: CoachingInterventionType;

  /** Scope (session-level or item-level) */
  readonly scope: InterventionScope;

  /** Target item (if item-level) */
  readonly targetNodeId?: NodeId;

  /** Position in session to show (item index or special marker) */
  readonly triggerPosition: InterventionTrigger;

  /** Prompt text to show user */
  readonly promptText: string;

  /** Optional response schema (for structured responses) */
  readonly responseSchema?: InterventionResponseSchema;

  /** Link to scoring rubric (if applicable) */
  readonly rubricId?: NodeId;

  /** Priority (higher = more important to show) */
  readonly priority: number;

  /** Can be skipped by user */
  readonly skippable: boolean;

  /** Why this intervention now */
  readonly rationale: DecisionRationale;
}

/**
 * When to trigger an intervention
 */
export type InterventionTrigger =
  | { readonly type: "session_start" }
  | { readonly type: "session_end" }
  | { readonly type: "before_item"; readonly itemIndex: number }
  | { readonly type: "after_item"; readonly itemIndex: number }
  | { readonly type: "after_n_items"; readonly count: number }
  | { readonly type: "on_mistake" }
  | { readonly type: "on_low_confidence" };

/**
 * Schema for intervention responses
 */
export interface InterventionResponseSchema {
  /** Response type */
  readonly type: "confidence" | "text" | "choice" | "scale";

  /** Options for choice type */
  readonly options?: readonly string[];

  /** Scale range for scale type */
  readonly scaleRange?: { min: number; max: number };

  /** Whether response is required */
  readonly required: boolean;
}

// =============================================================================
// GAMIFICATION HOOKS - Learning-grounded game elements
// =============================================================================

/**
 * Gamification hook type
 */
export type GameHookType =
  | "quest" // Multi-item challenge
  | "challenge" // Single focused challenge
  | "boss" // Difficult item to defeat
  | "streak_rule" // Streak-based reward
  | "badge" // Achievement badge
  | "reward"; // Reward unlock

/**
 * Gamification hook
 */
export interface GamificationHook {
  /** Unique ID */
  readonly hookId: GameHookId;

  /** Hook type */
  readonly type: GameHookType;

  /** Human-readable title */
  readonly title: string;

  /** Description */
  readonly description: string;

  /** Hook parameters */
  readonly parameters: GameHookParameters;

  /** Target nodes (if applicable) */
  readonly targetNodes: readonly NodeId[];

  /** Duration/deadline (if applicable) */
  readonly deadline?: Timestamp;

  /** Reward for completion */
  readonly reward?: GameReward;

  /** Learning-grounded justification */
  readonly rationale: DecisionRationale;

  /** Current progress (if in-progress) */
  readonly progress?: HookProgress;
}

/**
 * Parameters for different hook types
 */
export type GameHookParameters =
  | QuestParameters
  | ChallengeParameters
  | BossParameters
  | StreakRuleParameters
  | BadgeParameters
  | RewardParameters;

export interface QuestParameters {
  readonly type: "quest";
  /** Number of items to complete */
  readonly targetCount: number;
  /** Difficulty level */
  readonly difficulty: DifficultyBucket;
  /** Time limit (optional) */
  readonly timeLimit?: Duration;
  /** Accuracy threshold */
  readonly accuracyThreshold: NormalizedValue;
}

export interface ChallengeParameters {
  readonly type: "challenge";
  /** Challenge category */
  readonly category:
    | "calibration"
    | "speed"
    | "accuracy"
    | "strategy"
    | "reflection";
  /** Target metric value */
  readonly targetValue: number;
  /** Current metric value */
  readonly currentValue: number;
}

export interface BossParameters {
  readonly type: "boss";
  /** Boss node (the difficult item) */
  readonly bossNodeId: NodeId;
  /** Number of successful recalls needed */
  readonly defeatsNeeded: number;
  /** Current defeats */
  readonly currentDefeats: number;
  /** Boss difficulty */
  readonly bossDifficulty: NormalizedValue;
}

export interface StreakRuleParameters {
  readonly type: "streak_rule";
  /** Streak type */
  readonly streakType: "daily" | "accuracy" | "reflection" | "strategy";
  /** Current streak count */
  readonly currentStreak: number;
  /** Target streak length */
  readonly targetStreak: number;
}

export interface BadgeParameters {
  readonly type: "badge";
  /** Badge ID */
  readonly badgeId: string;
  /** Badge tier */
  readonly tier: "bronze" | "silver" | "gold" | "platinum";
  /** Unlock criteria */
  readonly criteria: string;
}

export interface RewardParameters {
  readonly type: "reward";
  /** Reward type */
  readonly rewardType: "cosmetic" | "functional" | "recognition";
  /** Reward ID */
  readonly rewardId: string;
}

/**
 * Reward for completing a hook
 */
export interface GameReward {
  /** Reward type */
  readonly type: "cosmetic" | "functional" | "recognition";

  /** Reward ID (for looking up details) */
  readonly rewardId: string;

  /** Display name */
  readonly displayName: string;

  /** XP points (if applicable) */
  readonly xpPoints?: number;
}

/**
 * Progress on a hook
 */
export interface HookProgress {
  /** Items completed */
  readonly completed: number;

  /** Items total */
  readonly total: number;

  /** Percentage complete */
  readonly percentage: NormalizedValue;

  /** Estimated time to complete */
  readonly estimatedTimeRemaining?: Duration;
}

// =============================================================================
// DECISION RATIONALE - Explainability
// =============================================================================

/**
 * Rationale for a decision in the Decision Layer
 * Note: Named PlanRationale to avoid conflict with aggregation.ts DecisionRationale
 */
export interface PlanRationale {
  /** Unique ID */
  readonly rationaleId: RationaleId;

  /** Short summary of the decision */
  readonly summary: string;

  /** Top contributing factors */
  readonly topFactors: readonly RationaleFactor[];

  /** Rules applied */
  readonly rulesApplied: readonly AppliedRule[];

  /** Counterfactual explanations */
  readonly counterfactuals: readonly DecisionCounterfactual[];

  /** Confidence in this decision */
  readonly confidence: Confidence;
}

/**
 * Type alias for backward compatibility
 */
export type DecisionRationale = PlanRationale;

/**
 * A factor contributing to a decision
 */
export interface RationaleFactor {
  /** Factor name */
  readonly name: string;

  /** Factor value */
  readonly value: number | string | boolean;

  /** Source field (e.g., "memory.retrievability") */
  readonly sourceField: string;

  /** Weight in the decision */
  readonly weight: number;

  /** Contribution to final score */
  readonly contribution: number;

  /** Human-readable explanation */
  readonly explanation: string;
}

/**
 * A rule that was applied
 */
export interface AppliedRule {
  /** Rule ID */
  readonly ruleId: DecisionRuleId;

  /** Rule version */
  readonly version: number;

  /** Whether the rule matched */
  readonly matched: boolean;

  /** Rule output (if matched) */
  readonly output?: unknown;
}

/**
 * Counterfactual explanation (prefixed to avoid conflict with aggregation.ts)
 */
export interface DecisionCounterfactual {
  /** Condition that would change the decision */
  readonly condition: string;

  /** What would happen */
  readonly consequence: string;

  /** How close we are to this condition */
  readonly proximity: NormalizedValue;
}

// =============================================================================
// ACTION PLAN DIAGNOSTICS - For debugging and audit
// =============================================================================

/**
 * Diagnostics for an action plan
 */
export interface ActionPlanDiagnostics {
  /** Policy version used */
  readonly policyVersion: string;

  /** Decision rule versions */
  readonly ruleVersions: Readonly<Record<string, number>>;

  /** Constraints snapshot (for reproducibility) */
  readonly constraintsSnapshot: DecisionConstraints;

  /** Context snapshot */
  readonly contextSnapshot: DecisionContext;

  /** Generation time (ms) */
  readonly generationTime: Duration;

  /** Items considered but not included */
  readonly excludedItemCount: number;

  /** Warnings during generation */
  readonly warnings: readonly DiagnosticWarning[];

  /** Debug info (for development) */
  readonly debug?: Record<string, unknown>;
}

/**
 * Warning during plan generation
 */
export interface DiagnosticWarning {
  /** Warning code */
  readonly code: string;

  /** Warning message */
  readonly message: string;

  /** Severity */
  readonly severity: "info" | "warning" | "error";

  /** Related node (if applicable) */
  readonly relatedNodeId?: NodeId;
}

// =============================================================================
// COACHING INTERVENTION LOG - For uplift measurement
// =============================================================================

/**
 * Log entry for a coaching intervention
 */
export interface CoachingInterventionLog {
  /** Intervention ID */
  readonly interventionId: InterventionId;

  /** Plan ID */
  readonly planId: ActionPlanId;

  /** Session ID */
  readonly sessionId: SessionId;

  /** When shown */
  readonly shownAt: Timestamp;

  /** Whether user engaged */
  readonly engaged: boolean;

  /** User response (if any) */
  readonly response?: unknown;

  /** Time spent on intervention (ms) */
  readonly timeSpent: Duration;

  /** Intervention type */
  readonly type: CoachingInterventionType;

  /** Target node (if item-level) */
  readonly targetNodeId?: NodeId;

  /** Metrics before intervention */
  readonly metricsBefore: DecisionInterventionMetrics;

  /** Metrics after intervention (filled in later) */
  readonly metricsAfter?: DecisionInterventionMetrics;
}

/**
 * Metrics for measuring intervention effectiveness (prefixed to avoid conflict)
 */
export interface DecisionInterventionMetrics {
  /** Accuracy on target item(s) */
  readonly accuracy?: NormalizedValue;

  /** Confidence calibration */
  readonly calibration?: NormalizedValue;

  /** Engagement level */
  readonly engagement?: NormalizedValue;

  /** Time on task */
  readonly timeOnTask?: Duration;
}
