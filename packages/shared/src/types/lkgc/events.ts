// =============================================================================
// LKGC EVENTS - Strict Event Taxonomy
// =============================================================================
// Defines the complete event taxonomy for all meaningful learning interactions.
// Events are append-only and form the foundation for all derived state.
//
// Categories:
// A. Review performance
// B. Metacognitive signals
// C. Attention & behavior
// D. Gamification interactions
// E. Content operations
// F. Environment
// =============================================================================

import type {
  LKGCEntity,
  EventId,
  EntityId,
  NodeId,
  SessionId,
  DeviceId,
  Timestamp,
  Duration,
  Confidence,
  NormalizedValue,
} from "./foundation";
import type { ReviewRating, ReviewAttemptId } from "./session";

// =============================================================================
// BASE EVENT
// =============================================================================

/**
 * All event categories
 */
export type EventCategory =
  | "review_performance"
  | "metacognitive"
  | "attention"
  | "gamification"
  | "content"
  | "environment"
  | "system";

/**
 * Base event interface - all events extend this
 */
export interface BaseEvent extends LKGCEntity<EventId> {
  readonly id: EventId;
  readonly category: EventCategory;
  readonly eventType: string;
  readonly timestamp: Timestamp;
  readonly sessionId?: SessionId;
  readonly deviceId: DeviceId;
}

// =============================================================================
// A. REVIEW PERFORMANCE EVENTS
// =============================================================================

/**
 * Review performance event types
 */
export type ReviewPerformanceEventType =
  | "review_started"
  | "review_completed"
  | "answer_revealed"
  | "hint_requested"
  | "answer_changed"
  | "card_edited"
  | "card_suspended"
  | "card_flagged";

/**
 * Review started event
 */
export interface ReviewStartedEvent extends BaseEvent {
  readonly category: "review_performance";
  readonly eventType: "review_started";
  readonly cardId: NodeId;
  readonly attemptId: ReviewAttemptId;
  readonly preReviewRetrievability: NormalizedValue;
  readonly scheduledInterval: number;
  readonly isOverdue: boolean;
  readonly overdueBy?: number;
}

/**
 * Review completed event - the core review outcome
 */
export interface ReviewCompletedEvent extends BaseEvent {
  readonly category: "review_performance";
  readonly eventType: "review_completed";
  readonly cardId: NodeId;
  readonly attemptId: ReviewAttemptId;

  /** Outcome */
  readonly rating: ReviewRating;

  /** Response time (ms) */
  readonly responseTime: Duration;

  /** Partial credit (0-1, for partial knowledge) */
  readonly partialCredit?: NormalizedValue;

  /** Was answer changed before final submit? */
  readonly answerChanged: boolean;

  /** Number of changes before final */
  readonly changeCount: number;

  /** Hint ladder (how many hints used, 0 = none) */
  readonly hintLevel: number;

  /** Total hints available */
  readonly hintsAvailable: number;

  /** Peek timing (ms after card shown) */
  readonly peekTiming?: readonly Duration[];

  /** Reveal timing (when answer was shown) */
  readonly revealTiming?: Duration;

  /** Did user edit card during review? */
  readonly editedDuringReview: boolean;

  /** Typed answer (for type-answer cards) */
  readonly typedAnswer?: string;

  /** Expected answer (for comparison) */
  readonly expectedAnswer?: string;

  /** Levenshtein distance (for partial credit) */
  readonly editDistance?: number;

  /** New scheduling parameters */
  readonly newStability: number;
  readonly newDifficulty: NormalizedValue;
  readonly newInterval: number;
}

/**
 * Answer revealed event
 */
export interface AnswerRevealedEvent extends BaseEvent {
  readonly category: "review_performance";
  readonly eventType: "answer_revealed";
  readonly cardId: NodeId;
  readonly attemptId: ReviewAttemptId;
  readonly timeAfterCardShow: Duration;
  readonly wasEarlyReveal: boolean;
}

/**
 * Hint requested event
 */
export interface HintRequestedEvent extends BaseEvent {
  readonly category: "review_performance";
  readonly eventType: "hint_requested";
  readonly cardId: NodeId;
  readonly attemptId: ReviewAttemptId;
  readonly hintLevel: number;
  readonly timeAfterCardShow: Duration;
}

/**
 * Answer changed event
 */
export interface AnswerChangedEvent extends BaseEvent {
  readonly category: "review_performance";
  readonly eventType: "answer_changed";
  readonly cardId: NodeId;
  readonly attemptId: ReviewAttemptId;
  readonly fromRating: ReviewRating;
  readonly toRating: ReviewRating;
  readonly changeNumber: number;
  readonly reason?: string;
}

/**
 * Card edited during review
 */
export interface CardEditedEvent extends BaseEvent {
  readonly category: "review_performance";
  readonly eventType: "card_edited";
  readonly cardId: NodeId;
  readonly attemptId?: ReviewAttemptId;
  readonly editType: "front" | "back" | "hints" | "tags" | "notes";
  readonly editSummary: string;
}

/**
 * Card suspended event
 */
export interface CardSuspendedEvent extends BaseEvent {
  readonly category: "review_performance";
  readonly eventType: "card_suspended";
  readonly cardId: NodeId;
  readonly reason:
    | "leech"
    | "user_request"
    | "content_issue"
    | "duplicate"
    | "temporary";
  readonly notes?: string;
}

/**
 * Card flagged event
 */
export interface CardFlaggedEvent extends BaseEvent {
  readonly category: "review_performance";
  readonly eventType: "card_flagged";
  readonly cardId: NodeId;
  readonly flagType:
    | "needs_review"
    | "needs_edit"
    | "important"
    | "confused"
    | "custom";
  readonly notes?: string;
}

// =============================================================================
// B. METACOGNITIVE SIGNAL EVENTS
// =============================================================================

/**
 * Metacognitive event types
 */
export type MetacognitiveEventType =
  | "confidence_reported"
  | "recall_forecast"
  | "feeling_of_knowing"
  | "error_attribution"
  | "strategy_selected"
  | "effort_reported"
  | "reflection_submitted";

/**
 * Confidence reported event (pre or post answer)
 */
export interface ConfidenceReportedEvent extends BaseEvent {
  readonly category: "metacognitive";
  readonly eventType: "confidence_reported";
  readonly cardId: NodeId;
  readonly attemptId: ReviewAttemptId;
  readonly timing: "pre_answer" | "post_answer";
  readonly confidence: Confidence;
  readonly previousConfidence?: Confidence;
}

/**
 * Recall forecast event ("I'll remember this for X days")
 */
export interface RecallForecastEvent extends BaseEvent {
  readonly category: "metacognitive";
  readonly eventType: "recall_forecast";
  readonly cardId: NodeId;
  readonly attemptId: ReviewAttemptId;
  readonly forecastDays: number;
  readonly algorithmForecastDays?: number;
  readonly difference?: number;
}

/**
 * Feeling of knowing event
 */
export interface FeelingOfKnowingEvent extends BaseEvent {
  readonly category: "metacognitive";
  readonly eventType: "feeling_of_knowing";
  readonly cardId: NodeId;
  readonly attemptId: ReviewAttemptId;
  readonly feeling: "knew_it" | "guessed" | "no_idea" | "tip_of_tongue";
  readonly actualOutcome?: "correct" | "incorrect";
}

/**
 * Error attribution event (why did I get it wrong?)
 */
export interface ErrorAttributionEvent extends BaseEvent {
  readonly category: "metacognitive";
  readonly eventType: "error_attribution";
  readonly cardId: NodeId;
  readonly attemptId: ReviewAttemptId;
  readonly attribution:
    | "forgot"
    | "misunderstood"
    | "misread"
    | "careless"
    | "interference"
    | "other";
  readonly details?: string;
  readonly confusedWith?: NodeId;
}

/**
 * Strategy selected event
 */
export interface StrategySelectedEvent extends BaseEvent {
  readonly category: "metacognitive";
  readonly eventType: "strategy_selected";
  readonly cardId?: NodeId;
  readonly strategyId: NodeId;
  readonly effortLevel: NormalizedValue;
  readonly context: "pre_review" | "during_review" | "post_review" | "learning";
}

/**
 * Effort reported event
 */
export interface EffortReportedEvent extends BaseEvent {
  readonly category: "metacognitive";
  readonly eventType: "effort_reported";
  readonly cardId?: NodeId;
  readonly attemptId?: ReviewAttemptId;
  readonly effortLevel: NormalizedValue;
  readonly mentalExertion: NormalizedValue;
  readonly context: "card" | "session" | "topic";
}

/**
 * Reflection submitted event
 */
export interface ReflectionSubmittedEvent extends BaseEvent {
  readonly category: "metacognitive";
  readonly eventType: "reflection_submitted";
  readonly reflectionId: NodeId;
  readonly reflectionType: "session" | "daily" | "weekly" | "topic" | "goal";
  readonly duration: Duration;
  readonly qualityScore?: NormalizedValue;
  readonly hasAudio: boolean;
  readonly wordCount: number;
  readonly actionItemCount: number;
}

// =============================================================================
// C. ATTENTION & BEHAVIOR EVENTS
// =============================================================================

/**
 * Attention event types
 */
export type AttentionEventType =
  | "idle_detected"
  | "app_backgrounded"
  | "app_foregrounded"
  | "notification_received"
  | "deck_switched"
  | "scroll_activity"
  | "rapid_fail_detected"
  | "graph_explored"
  | "speedrun_detected"
  | "stall_detected";

/**
 * Idle detected event
 */
export interface IdleDetectedEvent extends BaseEvent {
  readonly category: "attention";
  readonly eventType: "idle_detected";
  readonly idleDuration: Duration;
  readonly context: "mid_card" | "between_cards" | "session_start";
  readonly lastActivityType?: string;
}

/**
 * App backgrounded event
 */
export interface AppBackgroundedEvent extends BaseEvent {
  readonly category: "attention";
  readonly eventType: "app_backgrounded";
  readonly cardInProgress?: NodeId;
  readonly attemptInProgress?: ReviewAttemptId;
  readonly sessionState: "active" | "paused" | "idle";
}

/**
 * App foregrounded event
 */
export interface AppForegroundedEvent extends BaseEvent {
  readonly category: "attention";
  readonly eventType: "app_foregrounded";
  readonly backgroundDuration: Duration;
  readonly resumedTo: "same_card" | "next_card" | "home" | "other";
}

/**
 * Notification received event
 */
export interface NotificationReceivedEvent extends BaseEvent {
  readonly category: "attention";
  readonly eventType: "notification_received";
  readonly notificationType: string;
  readonly source: "app" | "external";
  readonly dismissed: boolean;
  readonly interruptedReview: boolean;
  readonly timeToReturn?: Duration;
}

/**
 * Deck switched event
 */
export interface DeckSwitchedEvent extends BaseEvent {
  readonly category: "attention";
  readonly eventType: "deck_switched";
  readonly fromDeckId: EntityId;
  readonly toDeckId: EntityId;
  readonly reason?: "completed" | "user_choice" | "recommended" | "random";
  readonly cardsCompletedInPrevious: number;
}

/**
 * Scroll activity event
 */
export interface ScrollActivityEvent extends BaseEvent {
  readonly category: "attention";
  readonly eventType: "scroll_activity";
  readonly cardId?: NodeId;
  readonly scrollCount: number;
  readonly maxDepth: NormalizedValue;
  readonly pattern: "none" | "minimal" | "thorough" | "erratic";
  readonly duration: Duration;
}

/**
 * Rapid fail detected event (potential rage-tap)
 */
export interface RapidFailDetectedEvent extends BaseEvent {
  readonly category: "attention";
  readonly eventType: "rapid_fail_detected";
  readonly cardIds: readonly NodeId[];
  readonly failCount: number;
  readonly timeSpan: Duration;
  readonly avgResponseTime: Duration;
  readonly possibleCause:
    | "frustration"
    | "difficulty"
    | "fatigue"
    | "interference"
    | "unknown";
}

/**
 * Graph explored event
 */
export interface GraphExploredEvent extends BaseEvent {
  readonly category: "attention";
  readonly eventType: "graph_explored";
  readonly entryNodeId: NodeId;
  readonly nodesVisited: readonly NodeId[];
  readonly edgesTraversed: number;
  readonly duration: Duration;
  readonly context: "mid_review" | "between_reviews" | "exploration_mode";
}

/**
 * Speedrun detected event
 */
export interface SpeedrunDetectedEvent extends BaseEvent {
  readonly category: "attention";
  readonly eventType: "speedrun_detected";
  readonly cardCount: number;
  readonly avgResponseTime: Duration;
  readonly accuracy: NormalizedValue;
  readonly duration: Duration;
  readonly isHealthy: boolean;
}

/**
 * Stall detected event
 */
export interface StallDetectedEvent extends BaseEvent {
  readonly category: "attention";
  readonly eventType: "stall_detected";
  readonly cardId: NodeId;
  readonly stallDuration: Duration;
  readonly possibleCause:
    | "thinking"
    | "distraction"
    | "confusion"
    | "difficulty"
    | "unknown";
}

// =============================================================================
// D. GAMIFICATION EVENTS
// =============================================================================

/**
 * Gamification event types
 */
export type GamificationEventType =
  | "quest_accepted"
  | "quest_completed"
  | "quest_abandoned"
  | "challenge_started"
  | "challenge_completed"
  | "challenge_failed"
  | "badge_earned"
  | "streak_extended"
  | "streak_broken"
  | "streak_frozen"
  | "boss_attempted"
  | "boss_defeated"
  | "boss_failed"
  | "reward_claimed"
  | "level_up"
  | "xp_gained";

/**
 * Quest accepted event
 */
export interface QuestAcceptedEvent extends BaseEvent {
  readonly category: "gamification";
  readonly eventType: "quest_accepted";
  readonly questId: NodeId;
  readonly questType: "main" | "side" | "daily" | "weekly" | "event";
  readonly objectiveCount: number;
  readonly deadline?: Timestamp;
}

/**
 * Quest completed event
 */
export interface QuestCompletedEvent extends BaseEvent {
  readonly category: "gamification";
  readonly eventType: "quest_completed";
  readonly questId: NodeId;
  readonly duration: Duration;
  readonly rewardsEarned: readonly NodeId[];
  readonly xpEarned: number;
}

/**
 * Quest abandoned event
 */
export interface QuestAbandonedEvent extends BaseEvent {
  readonly category: "gamification";
  readonly eventType: "quest_abandoned";
  readonly questId: NodeId;
  readonly progress: NormalizedValue;
  readonly reason?: string;
}

/**
 * Challenge started event
 */
export interface ChallengeStartedEvent extends BaseEvent {
  readonly category: "gamification";
  readonly eventType: "challenge_started";
  readonly challengeId: NodeId;
  readonly difficulty: "easy" | "medium" | "hard" | "extreme";
  readonly target: number;
  readonly timeLimit: Duration;
}

/**
 * Challenge completed event
 */
export interface ChallengeCompletedEvent extends BaseEvent {
  readonly category: "gamification";
  readonly eventType: "challenge_completed";
  readonly challengeId: NodeId;
  readonly achieved: number;
  readonly target: number;
  readonly timeUsed: Duration;
  readonly xpEarned: number;
}

/**
 * Challenge failed event
 */
export interface ChallengeFailedEvent extends BaseEvent {
  readonly category: "gamification";
  readonly eventType: "challenge_failed";
  readonly challengeId: NodeId;
  readonly achieved: number;
  readonly target: number;
  readonly reason: "time_expired" | "gave_up" | "missed_target";
}

/**
 * Badge earned event
 */
export interface BadgeEarnedEvent extends BaseEvent {
  readonly category: "gamification";
  readonly eventType: "badge_earned";
  readonly badgeId: NodeId;
  readonly badgeCategory: string;
  readonly rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  readonly xpEarned: number;
}

/**
 * Streak extended event
 */
export interface StreakExtendedEvent extends BaseEvent {
  readonly category: "gamification";
  readonly eventType: "streak_extended";
  readonly streakRuleId: NodeId;
  readonly newStreak: number;
  readonly isPersonalBest: boolean;
  readonly bonusXp?: number;
}

/**
 * Streak broken event
 */
export interface StreakBrokenEvent extends BaseEvent {
  readonly category: "gamification";
  readonly eventType: "streak_broken";
  readonly streakRuleId: NodeId;
  readonly brokenStreak: number;
  readonly reason: "missed_day" | "insufficient_activity" | "app_error";
  readonly freezeWasAvailable: boolean;
}

/**
 * Streak frozen event (used freeze protection)
 */
export interface StreakFrozenEvent extends BaseEvent {
  readonly category: "gamification";
  readonly eventType: "streak_frozen";
  readonly streakRuleId: NodeId;
  readonly currentStreak: number;
  readonly freezesRemaining: number;
}

/**
 * Boss attempted event
 */
export interface BossAttemptedEvent extends BaseEvent {
  readonly category: "gamification";
  readonly eventType: "boss_attempted";
  readonly bossId: NodeId;
  readonly attemptNumber: number;
  readonly conceptsTested: readonly NodeId[];
}

/**
 * Boss defeated event
 */
export interface BossDefeatedEvent extends BaseEvent {
  readonly category: "gamification";
  readonly eventType: "boss_defeated";
  readonly bossId: NodeId;
  readonly attemptNumber: number;
  readonly score: NormalizedValue;
  readonly duration: Duration;
  readonly rewardsEarned: readonly NodeId[];
  readonly xpEarned: number;
}

/**
 * Boss failed event
 */
export interface BossFailedEvent extends BaseEvent {
  readonly category: "gamification";
  readonly eventType: "boss_failed";
  readonly bossId: NodeId;
  readonly attemptNumber: number;
  readonly score: NormalizedValue;
  readonly weakestConcepts: readonly NodeId[];
  readonly attemptsRemaining: number;
}

/**
 * Reward claimed event
 */
export interface RewardClaimedEvent extends BaseEvent {
  readonly category: "gamification";
  readonly eventType: "reward_claimed";
  readonly rewardId: NodeId;
  readonly rewardType: "cosmetic" | "functional" | "xp" | "currency" | "unlock";
  readonly timeSinceEarned: Duration;
}

/**
 * Level up event
 */
export interface LevelUpEvent extends BaseEvent {
  readonly category: "gamification";
  readonly eventType: "level_up";
  readonly newLevel: number;
  readonly totalXp: number;
  readonly unlockedFeatures?: readonly string[];
}

/**
 * XP gained event
 */
export interface XpGainedEvent extends BaseEvent {
  readonly category: "gamification";
  readonly eventType: "xp_gained";
  readonly amount: number;
  readonly source:
    | "review"
    | "quest"
    | "challenge"
    | "badge"
    | "boss"
    | "streak"
    | "bonus";
  readonly sourceId?: EntityId;
  readonly multiplier?: number;
}

// =============================================================================
// E. CONTENT OPERATION EVENTS
// =============================================================================

/**
 * Content event types
 */
export type ContentEventType =
  | "import_started"
  | "import_completed"
  | "import_failed"
  | "duplicate_merged"
  | "tag_edited"
  | "link_created"
  | "link_deleted"
  | "node_created"
  | "node_updated"
  | "node_deleted";

/**
 * Import started event
 */
export interface ImportStartedEvent extends BaseEvent {
  readonly category: "content";
  readonly eventType: "import_started";
  readonly importId: EntityId;
  readonly sourceType:
    | "apkg"
    | "csv"
    | "markdown"
    | "obsidian"
    | "notion"
    | "other";
  readonly sourcePath: string;
  readonly estimatedItems: number;
}

/**
 * Import completed event
 */
export interface ImportCompletedEvent extends BaseEvent {
  readonly category: "content";
  readonly eventType: "import_completed";
  readonly importId: EntityId;
  readonly itemsImported: number;
  readonly itemsSkipped: number;
  readonly duplicatesFound: number;
  readonly errorsEncountered: number;
  readonly duration: Duration;
}

/**
 * Import failed event
 */
export interface ImportFailedEvent extends BaseEvent {
  readonly category: "content";
  readonly eventType: "import_failed";
  readonly importId: EntityId;
  readonly errorType: string;
  readonly errorMessage: string;
  readonly itemsProcessed: number;
  readonly failedAtItem?: number;
}

/**
 * Duplicate merged event
 */
export interface DuplicateMergedEvent extends BaseEvent {
  readonly category: "content";
  readonly eventType: "duplicate_merged";
  readonly primaryId: NodeId;
  readonly mergedIds: readonly NodeId[];
  readonly mergeStrategy: "keep_primary" | "keep_best" | "combine";
  readonly fieldsUpdated: readonly string[];
}

/**
 * Tag edited event
 */
export interface TagEditedEvent extends BaseEvent {
  readonly category: "content";
  readonly eventType: "tag_edited";
  readonly nodeId: NodeId;
  readonly action: "added" | "removed" | "renamed";
  readonly tag: string;
  readonly previousTag?: string;
}

/**
 * Link created event (Obsidian-style wikilink)
 */
export interface LinkCreatedEvent extends BaseEvent {
  readonly category: "content";
  readonly eventType: "link_created";
  readonly sourceNodeId: NodeId;
  readonly targetNodeId: NodeId;
  readonly linkText: string;
  readonly context?: string;
}

/**
 * Link deleted event
 */
export interface LinkDeletedEvent extends BaseEvent {
  readonly category: "content";
  readonly eventType: "link_deleted";
  readonly sourceNodeId: NodeId;
  readonly targetNodeId: NodeId;
  readonly linkText: string;
}

/**
 * Node created event
 */
export interface NodeCreatedEvent extends BaseEvent {
  readonly category: "content";
  readonly eventType: "node_created";
  readonly nodeId: NodeId;
  readonly nodeType: string;
  readonly source: "user" | "import" | "ai" | "plugin";
  readonly initialData: Readonly<Record<string, unknown>>;
}

/**
 * Node updated event
 */
export interface NodeUpdatedEvent extends BaseEvent {
  readonly category: "content";
  readonly eventType: "node_updated";
  readonly nodeId: NodeId;
  readonly fieldsChanged: readonly string[];
  readonly changeSource: "user" | "system" | "ai" | "plugin";
}

/**
 * Node deleted event
 */
export interface NodeDeletedEvent extends BaseEvent {
  readonly category: "content";
  readonly eventType: "node_deleted";
  readonly nodeId: NodeId;
  readonly nodeType: string;
  readonly deletionType: "soft" | "hard";
  readonly reason?: string;
}

// =============================================================================
// F. ENVIRONMENT EVENTS
// =============================================================================

/**
 * Environment event types
 */
export type EnvironmentEventType =
  | "session_environment_captured"
  | "connectivity_changed"
  | "time_zone_changed"
  | "device_changed";

/**
 * Session environment captured
 */
export interface SessionEnvironmentCapturedEvent extends BaseEvent {
  readonly category: "environment";
  readonly eventType: "session_environment_captured";
  readonly deviceType: "phone" | "tablet" | "desktop" | "other";
  readonly osVersion: string;
  readonly appVersion: string;
  readonly connectivity: "online" | "offline" | "metered";
  readonly batteryLevel?: NormalizedValue;
  readonly isCharging?: boolean;
  readonly timeZone: string;
  readonly locale: string;
  readonly screenBrightness?: NormalizedValue;
}

/**
 * Connectivity changed event
 */
export interface ConnectivityChangedEvent extends BaseEvent {
  readonly category: "environment";
  readonly eventType: "connectivity_changed";
  readonly previousState: "online" | "offline" | "metered";
  readonly newState: "online" | "offline" | "metered";
  readonly offlineDuration?: Duration;
}

/**
 * Time zone changed event
 */
export interface TimeZoneChangedEvent extends BaseEvent {
  readonly category: "environment";
  readonly eventType: "time_zone_changed";
  readonly previousZone: string;
  readonly newZone: string;
  readonly hoursDifference: number;
}

/**
 * Device changed event
 */
export interface DeviceChangedEvent extends BaseEvent {
  readonly category: "environment";
  readonly eventType: "device_changed";
  readonly previousDeviceId: DeviceId;
  readonly newDeviceId: DeviceId;
  readonly deviceType: "phone" | "tablet" | "desktop" | "other";
}

// =============================================================================
// EVENT UNION TYPES
// =============================================================================

/**
 * All review performance events
 */
export type ReviewPerformanceEvent =
  | ReviewStartedEvent
  | ReviewCompletedEvent
  | AnswerRevealedEvent
  | HintRequestedEvent
  | AnswerChangedEvent
  | CardEditedEvent
  | CardSuspendedEvent
  | CardFlaggedEvent;

/**
 * All metacognitive events
 */
export type MetacognitiveEvent =
  | ConfidenceReportedEvent
  | RecallForecastEvent
  | FeelingOfKnowingEvent
  | ErrorAttributionEvent
  | StrategySelectedEvent
  | EffortReportedEvent
  | ReflectionSubmittedEvent;

/**
 * All attention events
 */
export type AttentionEvent =
  | IdleDetectedEvent
  | AppBackgroundedEvent
  | AppForegroundedEvent
  | NotificationReceivedEvent
  | DeckSwitchedEvent
  | ScrollActivityEvent
  | RapidFailDetectedEvent
  | GraphExploredEvent
  | SpeedrunDetectedEvent
  | StallDetectedEvent;

/**
 * All gamification events
 */
export type GamificationEvent =
  | QuestAcceptedEvent
  | QuestCompletedEvent
  | QuestAbandonedEvent
  | ChallengeStartedEvent
  | ChallengeCompletedEvent
  | ChallengeFailedEvent
  | BadgeEarnedEvent
  | StreakExtendedEvent
  | StreakBrokenEvent
  | StreakFrozenEvent
  | BossAttemptedEvent
  | BossDefeatedEvent
  | BossFailedEvent
  | RewardClaimedEvent
  | LevelUpEvent
  | XpGainedEvent;

/**
 * All content events
 */
export type ContentEvent =
  | ImportStartedEvent
  | ImportCompletedEvent
  | ImportFailedEvent
  | DuplicateMergedEvent
  | TagEditedEvent
  | LinkCreatedEvent
  | LinkDeletedEvent
  | NodeCreatedEvent
  | NodeUpdatedEvent
  | NodeDeletedEvent;

/**
 * All environment events
 */
export type EnvironmentEvent =
  | SessionEnvironmentCapturedEvent
  | ConnectivityChangedEvent
  | TimeZoneChangedEvent
  | DeviceChangedEvent;

/**
 * Union of ALL events
 */
export type LKGCEvent =
  | ReviewPerformanceEvent
  | MetacognitiveEvent
  | AttentionEvent
  | GamificationEvent
  | ContentEvent
  | EnvironmentEvent;

/**
 * Type guard for event category
 */
export function isEventCategory<C extends EventCategory>(
  event: LKGCEvent,
  category: C,
): event is Extract<LKGCEvent, { category: C }> {
  return event.category === category;
}
