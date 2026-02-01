// =============================================================================
// LKGC SESSION & TIMELINE - Learning as a Process
// =============================================================================
// Explicit temporal structures to avoid LKGC degrading into raw event logs.
// Models:
// - StudySession (goals, time budget, mode, pacing)
// - ReviewAttempt (detailed interaction during a single review)
// - ReflectionArtifact (structured metacognitive output)
// =============================================================================

import type {
  LKGCEntity,
  EntityId,
  SessionId,
  NodeId,
  DeviceId,
  Timestamp,
  Duration,
  Confidence,
  NormalizedValue,
} from "./foundation";

// =============================================================================
// STUDY SESSION - A bounded learning period
// =============================================================================

/**
 * Study session mode
 */
export type SessionMode =
  | "review" // Spaced repetition review
  | "learn" // Learning new material
  | "cram" // Intensive study (pre-exam)
  | "explore" // Free exploration
  | "practice" // Deliberate practice
  | "test" // Assessment mode
  | "mixed"; // Combination

/**
 * Session goal type
 */
export type SessionGoalType =
  | "card_count" // Review N cards
  | "time_based" // Study for N minutes
  | "mastery" // Achieve mastery on specific items
  | "completion" // Complete a learning path step
  | "open_ended"; // No specific goal

/**
 * Study session - a bounded period of learning activity
 */
export interface StudySession extends LKGCEntity<SessionId> {
  readonly id: SessionId;

  /** Session mode */
  readonly mode: SessionMode;

  /** Session goals */
  readonly goals: readonly SessionGoal[];

  /** Time budget (planned duration) */
  readonly timeBudget?: Duration;

  /** Deck(s) being studied */
  readonly deckIds: readonly EntityId[];

  /** Device used */
  readonly deviceId: DeviceId;

  /** Start timestamp */
  readonly startedAt: Timestamp;

  /** End timestamp */
  readonly endedAt?: Timestamp;

  /** Actual duration */
  readonly actualDuration?: Duration;

  /** Session state */
  readonly state: "active" | "paused" | "completed" | "abandoned";

  /** Pause history */
  readonly pauses: readonly SessionPause[];

  /** Interruptions during session */
  readonly interruptions: readonly SessionInterruption[];

  /** Pacing profile */
  readonly pacing: PacingProfile;

  /** Cards reviewed in this session */
  readonly cardReviews: readonly ReviewAttemptId[];

  /** Session statistics (computed) */
  readonly stats?: SessionStatistics;

  /** User's mood at start (if captured) */
  readonly startMood?: MoodCapture;

  /** User's mood at end (if captured) */
  readonly endMood?: MoodCapture;

  /** Environment context */
  readonly environment: EnvironmentContext;
}

/**
 * Branded type for review attempt IDs
 */
export type ReviewAttemptId = EntityId & {
  readonly __reviewAttempt: unique symbol;
};

/**
 * Session goal specification
 */
export interface SessionGoal {
  readonly type: SessionGoalType;
  readonly target: number;
  readonly current: number;
  readonly achieved: boolean;
  readonly description?: string;
}

/**
 * Pause during session
 */
export interface SessionPause {
  readonly pausedAt: Timestamp;
  readonly resumedAt?: Timestamp;
  readonly duration?: Duration;
  readonly reason?:
    | "user_initiated"
    | "app_background"
    | "notification"
    | "system";
}

/**
 * Interruption during session
 */
export interface SessionInterruption {
  readonly timestamp: Timestamp;
  readonly type: "notification" | "phone_call" | "app_switch" | "other";
  readonly duration: Duration;
  readonly app?: string;
  readonly dismissed: boolean;
}

/**
 * Pacing profile - how the user progressed through the session
 */
export interface PacingProfile {
  /** Average time per card */
  readonly avgTimePerCard: Duration;

  /** Time per card variance */
  readonly timeVariance: number;

  /** Pacing trend (speeding up or slowing down) */
  readonly trend: "speeding_up" | "slowing_down" | "steady" | "erratic";

  /** Speed profile over time (normalized) */
  readonly speedProfile: readonly NormalizedValue[];

  /** Detected fatigue point (when performance started declining) */
  readonly fatiguePoint?: number;

  /** Cards reviewed per minute (rolling average) */
  readonly reviewRate: readonly number[];
}

/**
 * Session statistics
 */
export interface SessionStatistics {
  /** Total cards reviewed */
  readonly cardsReviewed: number;

  /** New cards learned */
  readonly newCardsLearned: number;

  /** Cards by outcome */
  readonly cardsByOutcome: {
    readonly again: number;
    readonly hard: number;
    readonly good: number;
    readonly easy: number;
  };

  /** Accuracy */
  readonly accuracy: NormalizedValue;

  /** Average response time */
  readonly avgResponseTime: Duration;

  /** Time in active review (excluding pauses) */
  readonly activeTime: Duration;

  /** Streak achieved */
  readonly maxStreak: number;

  /** Hints used */
  readonly hintsUsed: number;

  /** XP earned */
  readonly xpEarned: number;

  /** Goals completed */
  readonly goalsCompleted: number;
}

/**
 * Mood capture
 */
export interface MoodCapture {
  readonly timestamp: Timestamp;
  readonly energy: NormalizedValue;
  readonly focus: NormalizedValue;
  readonly motivation: NormalizedValue;
  readonly stress: NormalizedValue;
  readonly note?: string;
}

/**
 * Environment context
 */
export interface EnvironmentContext {
  /** Device type */
  readonly deviceType: "phone" | "tablet" | "desktop" | "other";

  /** Online/offline status */
  readonly connectivity: "online" | "offline" | "intermittent";

  /** Time of day category */
  readonly timeOfDay: "morning" | "afternoon" | "evening" | "night";

  /** Day of week */
  readonly dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;

  /** Location type (if available) */
  readonly locationType?: "home" | "work" | "commute" | "public" | "other";

  /** Ambient noise level (if detected) */
  readonly noiseLevel?: "quiet" | "moderate" | "noisy";

  /** Screen brightness (normalized) */
  readonly screenBrightness?: NormalizedValue;
}

// =============================================================================
// REVIEW ATTEMPT - Single card review interaction
// =============================================================================

/**
 * Review outcome rating
 */
export type ReviewRating = "again" | "hard" | "good" | "easy";

/**
 * Review attempt - detailed record of a single card review
 */
export interface ReviewAttempt extends LKGCEntity {
  readonly id: ReviewAttemptId;

  /** Session this review belongs to */
  readonly sessionId: SessionId;

  /** Card being reviewed */
  readonly cardId: NodeId;

  /** Position in session (1-indexed) */
  readonly positionInSession: number;

  /** Timing */
  readonly timing: ReviewTiming;

  /** User's response */
  readonly response: ReviewResponse;

  /** Hint usage */
  readonly hintUsage: HintUsage;

  /** Interaction details */
  readonly interaction: ReviewInteraction;

  /** Pre-review state */
  readonly preReviewState: PreReviewState;

  /** Post-review state */
  readonly postReviewState: PostReviewState;

  /** Metacognitive signals */
  readonly metacognition: ReviewMetacognition;
}

/**
 * Review timing details
 */
export interface ReviewTiming {
  /** When card was shown */
  readonly shownAt: Timestamp;

  /** When user first interacted */
  readonly firstInteractionAt?: Timestamp;

  /** When answer was revealed (if applicable) */
  readonly revealedAt?: Timestamp;

  /** When rating was submitted */
  readonly ratedAt: Timestamp;

  /** Total time on card */
  readonly totalTime: Duration;

  /** Time to first interaction */
  readonly timeToFirstInteraction?: Duration;

  /** Time viewing answer */
  readonly timeViewingAnswer?: Duration;

  /** Response time distribution (if multiple phases) */
  readonly responseTimeDistribution?: readonly Duration[];
}

/**
 * User's response to the review
 */
export interface ReviewResponse {
  /** Final rating */
  readonly rating: ReviewRating;

  /** Typed answer (for type-answer cards) */
  readonly typedAnswer?: string;

  /** Answer correctness (for type-answer) */
  readonly answerCorrectness?: NormalizedValue;

  /** Partial credit (if applicable) */
  readonly partialCredit?: NormalizedValue;

  /** Was answer changed? */
  readonly answerChanged: boolean;

  /** Answer change history */
  readonly changeHistory?: readonly AnswerChange[];

  /** Editing during review (notes, corrections) */
  readonly editsMade: readonly ReviewEdit[];
}

/**
 * Answer change during review
 */
export interface AnswerChange {
  readonly timestamp: Timestamp;
  readonly fromRating: ReviewRating;
  readonly toRating: ReviewRating;
  readonly reason?: string;
}

/**
 * Edit made during review
 */
export interface ReviewEdit {
  readonly timestamp: Timestamp;
  readonly editType: "note" | "correction" | "flag" | "suspend" | "tag";
  readonly details?: string;
}

/**
 * Hint usage during review
 */
export interface HintUsage {
  /** Were hints available? */
  readonly hintsAvailable: boolean;

  /** Number of hints used */
  readonly hintsUsed: number;

  /** Maximum hint level reached */
  readonly maxHintLevel: number;

  /** Hint reveal timing */
  readonly hintRevealTimes: readonly HintReveal[];
}

/**
 * Individual hint reveal
 */
export interface HintReveal {
  readonly level: number;
  readonly revealedAt: Timestamp;
  readonly timeAfterCardShow: Duration;
}

/**
 * Detailed interaction during review
 */
export interface ReviewInteraction {
  /** Did user peek at answer before rating? */
  readonly peekedAtAnswer: boolean;

  /** Peek timing */
  readonly peekTiming?: readonly Timestamp[];

  /** Did user reveal answer before attempting? */
  readonly revealedEarly: boolean;

  /** Scrolling behavior */
  readonly scrolling: ScrollingBehavior;

  /** Touch/click patterns */
  readonly touchPatterns: TouchPatterns;

  /** Deck switching during review */
  readonly deckSwitched: boolean;

  /** Graph exploration during review */
  readonly graphExplored: boolean;

  /** External links opened */
  readonly linksOpened: number;
}

/**
 * Scrolling behavior
 */
export interface ScrollingBehavior {
  readonly scrollCount: number;
  readonly maxScrollDepth: NormalizedValue;
  readonly scrollPattern: "none" | "minimal" | "thorough" | "erratic";
}

/**
 * Touch/click patterns (for detecting frustration, etc.)
 */
export interface TouchPatterns {
  readonly totalTaps: number;
  readonly rapidTapCount: number;
  readonly rageTapDetected: boolean;
  readonly hesitationCount: number;
}

/**
 * State before review
 */
export interface PreReviewState {
  readonly stability: number;
  readonly difficulty: NormalizedValue;
  readonly retrievability: NormalizedValue;
  readonly daysSinceLast: number;
  readonly scheduledInterval: number;
  readonly lapseCount: number;
}

/**
 * State after review
 */
export interface PostReviewState {
  readonly stability: number;
  readonly difficulty: NormalizedValue;
  readonly retrievability: NormalizedValue;
  readonly nextInterval: number;
  readonly nextDue: Timestamp;
  readonly newLapseCount: number;
}

/**
 * Metacognitive signals during review
 */
export interface ReviewMetacognition {
  /** Pre-answer confidence */
  readonly preConfidence?: Confidence;

  /** Post-answer confidence */
  readonly postConfidence?: Confidence;

  /** Recall forecast ("I'll remember this for X days") */
  readonly recallForecast?: number;

  /** Feeling of knowing */
  readonly feelingOfKnowing?:
    | "knew_it"
    | "guessed"
    | "no_idea"
    | "tip_of_tongue";

  /** Error attribution (if wrong) */
  readonly errorAttribution?:
    | "forgot"
    | "misunderstood"
    | "misread"
    | "careless"
    | "interference";

  /** Strategy used (if any) */
  readonly strategyUsed?: NodeId;

  /** Effort level */
  readonly effortLevel?: NormalizedValue;

  /** Self-reported difficulty */
  readonly selfReportedDifficulty?: NormalizedValue;
}

// =============================================================================
// REFLECTION ARTIFACT - Structured metacognitive output
// =============================================================================

/**
 * Reflection artifact - outcome of a metacognitive reflection
 */
export interface ReflectionArtifact extends LKGCEntity {
  /** Session this reflection is for (if session-based) */
  readonly sessionId?: SessionId;

  /** Reflection type */
  readonly type:
    | "session"
    | "daily"
    | "weekly"
    | "topic"
    | "goal"
    | "challenge";

  /** When reflection was created */
  readonly createdAt: Timestamp;

  /** Duration spent reflecting */
  readonly duration: Duration;

  /** Structured content */
  readonly content: ReflectionStructuredContent;

  /** Quality assessment */
  readonly quality: ReflectionQualityAssessment;

  /** Generated insights */
  readonly insights: readonly ReflectionInsight[];

  /** Action items */
  readonly actionItems: readonly ActionItem[];

  /** Related nodes */
  readonly relatedNodeIds: readonly NodeId[];

  /** Audio recording (if voice reflection) */
  readonly audioUrl?: string;

  /** Audio transcript */
  readonly transcript?: string;
}

/**
 * Structured reflection content
 */
export interface ReflectionStructuredContent {
  /** What worked well */
  readonly whatWorked: string;

  /** What didn't work */
  readonly whatDidntWork: string;

  /** Why (analysis) */
  readonly analysis?: string;

  /** Planned adjustments */
  readonly plannedAdjustments: readonly PlannedAdjustment[];

  /** Questions for future */
  readonly openQuestions?: readonly string[];

  /** Emotional check-in */
  readonly emotionalState?: MoodCapture;

  /** Free-form notes */
  readonly notes?: string;
}

/**
 * Planned adjustment from reflection
 */
export interface PlannedAdjustment {
  readonly area:
    | "strategy"
    | "schedule"
    | "content"
    | "environment"
    | "goal"
    | "other";
  readonly description: string;
  readonly specificAction?: string;
  readonly deadline?: Timestamp;
  readonly implemented: boolean;
  readonly implementedAt?: Timestamp;
}

/**
 * Quality assessment of reflection
 */
export interface ReflectionQualityAssessment {
  /** Depth of reflection */
  readonly depth: "surface" | "moderate" | "deep";

  /** Specificity of observations */
  readonly specificity: NormalizedValue;

  /** Actionability of insights */
  readonly actionability: NormalizedValue;

  /** Self-awareness demonstrated */
  readonly selfAwareness: NormalizedValue;

  /** Overall quality score */
  readonly overallScore: NormalizedValue;

  /** Quality assessed by */
  readonly assessedBy: "self" | "rubric" | "ai";
}

/**
 * Insight generated from reflection
 */
export interface ReflectionInsight {
  readonly id: EntityId;
  readonly type:
    | "pattern"
    | "strategy"
    | "obstacle"
    | "opportunity"
    | "question";
  readonly content: string;
  readonly confidence: Confidence;
  readonly relatedNodeIds?: readonly NodeId[];
  readonly actionable: boolean;
}

/**
 * Action item from reflection
 */
export interface ActionItem {
  readonly id: EntityId;
  readonly description: string;
  readonly priority: "low" | "medium" | "high";
  readonly deadline?: Timestamp;
  readonly status: "pending" | "in_progress" | "completed" | "cancelled";
  readonly completedAt?: Timestamp;
  readonly outcome?: string;
}

// =============================================================================
// TIMELINE VIEW - Aggregated temporal view
// =============================================================================

/**
 * Timeline entry - unified view of learning activities
 */
export interface TimelineEntry {
  readonly timestamp: Timestamp;
  readonly type: TimelineEntryType;
  readonly entityId: EntityId;
  readonly summary: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type TimelineEntryType =
  | "session_started"
  | "session_completed"
  | "milestone_achieved"
  | "badge_earned"
  | "streak_extended"
  | "streak_broken"
  | "goal_completed"
  | "reflection_submitted"
  | "quest_accepted"
  | "quest_completed"
  | "boss_defeated"
  | "level_up"
  | "insight_generated";
