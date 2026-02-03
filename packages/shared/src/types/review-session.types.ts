// =============================================================================
// REVIEW SESSION ORCHESTRATION TYPES
// =============================================================================
// Phase 6D: Review Session Integration (Orchestration)
//
// The Session Orchestrator wires together:
// - Scheduler → ranked candidates (SRS urgency)
// - Mode → filtered/prioritized candidates (learning context)
// - Deck → membership filtering (user's deck selection)
// - Face Resolution → dynamic face selection per card
//
// PARADIGM: This layer ORCHESTRATES existing components.
// It does NOT modify scheduler internals, algorithms, or UI.
//
// KEY CAPABILITIES:
// 1. Accept ranked candidates from scheduler/mode
// 2. Apply deck filtering
// 3. Resolve faces dynamically per card
// 4. Surface context indicators and explainability
// 5. Support optional face-pivoting for advanced users
//
// DESIGN PRINCIPLES:
// 1. Pure orchestration — no new algorithms
// 2. Explicit data flow — traceable from scheduler to face
// 3. Full explainability at every stage
// 4. LLM-agent ready (clean inputs/outputs)
// 5. Plugin-extensible for custom session policies
// =============================================================================

import type { UserId, CardId, DeckId } from "./user.types";
import type {
  CanonicalCardId,
  CardFace,
  CardFaceId,
} from "./canonical-card.types";
import type { CategoryId } from "./ecosystem.types";
import type {
  ParticipationId,
  ExtendedSemanticRole,
} from "./multi-belonging.types";
import type {
  Timestamp,
  Duration,
  Confidence,
  NormalizedValue,
} from "./lkgc/foundation";
import type {
  LearningModeId,
  ModeRuntimeState,
  ReviewCandidate,
  ReviewCandidateScoring,
  RankedCandidateList,
} from "./learning-mode.types";
import type {
  DynamicDeckId,
  DeckQueryEvaluationResult,
  CardInclusionExplanation,
  DeckCardResult,
} from "./dynamic-deck.types";
import type {
  FaceResolutionInput,
  FaceResolutionOutput,
  ScaffoldingDirectives,
  RenderingDirectives,
  FaceResolutionExplainability,
} from "./face-resolution.types";

// =============================================================================
// IDENTIFIERS
// =============================================================================

/** Unique identifier for a review session */
export type ReviewSessionId = string & { readonly __brand: "ReviewSessionId" };

/** Unique identifier for a review item within a session */
export type ReviewItemId = string & { readonly __brand: "ReviewItemId" };

/** Unique identifier for an orchestration trace */
export type OrchestrationTraceId = string & {
  readonly __brand: "OrchestrationTraceId";
};

/** Unique identifier for a face pivot event */
export type FacePivotId = string & { readonly __brand: "FacePivotId" };

/** Unique identifier for a session event */
export type SessionEventId = string & { readonly __brand: "SessionEventId" };

// =============================================================================
// SESSION REQUEST & RESPONSE
// =============================================================================

/**
 * Request to start a new review session
 *
 * This is the entry point for the orchestration layer.
 */
export interface ReviewSessionRequest {
  /** User initiating the session */
  readonly userId: UserId;

  /** Timestamp of the request */
  readonly requestedAt: Timestamp;

  // =========================================================================
  // MODE CONTEXT
  // =========================================================================

  /** Learning mode to use (optional, uses user's default if not specified) */
  readonly modeId?: LearningModeId;

  /** Mode parameter overrides */
  readonly modeParameterOverrides?: Record<string, unknown>;

  // =========================================================================
  // FILTERING
  // =========================================================================

  /** Deck to filter by (optional) */
  readonly deckId?: DynamicDeckId;

  /** Legacy deck ID for backwards compatibility */
  readonly legacyDeckId?: DeckId;

  /** Category filter (optional) */
  readonly categoryId?: CategoryId;

  /** Specific card IDs to include (optional, for targeted review) */
  readonly specificCardIds?: readonly CanonicalCardId[];

  // =========================================================================
  // SESSION CONSTRAINTS
  // =========================================================================

  /** Maximum number of cards to review */
  readonly maxCards?: number;

  /** Time budget for the session (ms) */
  readonly timeBudget?: Duration;

  /** Minimum retrievability threshold (skip cards above this) */
  readonly minRetrievabilityThreshold?: NormalizedValue;

  /** Include new cards in the session */
  readonly includeNewCards?: boolean;

  /** Maximum new cards to introduce */
  readonly maxNewCards?: number;

  // =========================================================================
  // OPTIONS
  // =========================================================================

  /** Enable face resolution (default: true) */
  readonly enableFaceResolution?: boolean;

  /** Enable face pivoting for advanced users */
  readonly enableFacePivoting?: boolean;

  /** Include full explainability traces */
  readonly includeExplainability?: boolean;

  /** Prefetch N cards ahead for smooth UX */
  readonly prefetchCount?: number;

  /** Session metadata (for tracking) */
  readonly sessionMetadata?: Record<string, unknown>;
}

/**
 * Response containing the initialized session
 */
export interface ReviewSessionResponse {
  /** Session identifier */
  readonly sessionId: ReviewSessionId;

  /** User ID */
  readonly userId: UserId;

  /** Created timestamp */
  readonly createdAt: Timestamp;

  // =========================================================================
  // SESSION CONTEXT
  // =========================================================================

  /** Active mode state */
  readonly modeState: ModeRuntimeState;

  /** Active deck (if filtered) */
  readonly activeDeck?: ActiveDeckContext;

  /** Session constraints applied */
  readonly constraints: SessionConstraints;

  // =========================================================================
  // QUEUE OVERVIEW
  // =========================================================================

  /** Total cards in the session queue */
  readonly totalCards: number;

  /** Cards due for review */
  readonly dueCards: number;

  /** New cards to introduce */
  readonly newCards: number;

  /** Estimated session duration (ms) */
  readonly estimatedDuration: Duration;

  // =========================================================================
  // FIRST ITEM (Pre-resolved)
  // =========================================================================

  /** First item in the queue (pre-resolved for immediate start) */
  readonly firstItem: ResolvedReviewItem | null;

  // =========================================================================
  // EXPLAINABILITY
  // =========================================================================

  /** Session-level explainability */
  readonly sessionExplainability?: SessionExplainability;

  /** Orchestration trace ID */
  readonly orchestrationTraceId?: OrchestrationTraceId;
}

// =============================================================================
// SESSION CONTEXT TYPES
// =============================================================================

/**
 * Active deck context when filtering by deck
 */
export interface ActiveDeckContext {
  /** Deck ID */
  readonly deckId: DynamicDeckId;

  /** Deck name */
  readonly name: string;

  /** Total cards in deck */
  readonly totalCards: number;

  /** Cards due in deck */
  readonly dueCards: number;

  /** Deck evaluation result (for explainability) */
  readonly evaluationSummary?: DeckEvaluationSummary;
}

/**
 * Summary of deck evaluation
 */
export interface DeckEvaluationSummary {
  /** Query complexity score */
  readonly complexity: number;

  /** Predicates evaluated */
  readonly predicatesEvaluated: number;

  /** Evaluation time (ms) */
  readonly evaluationTimeMs: number;

  /** Cache hit */
  readonly cacheHit: boolean;
}

/**
 * Session constraints that were applied
 */
export interface SessionConstraints {
  /** Maximum cards */
  readonly maxCards: number;

  /** Time budget (ms) */
  readonly timeBudget: Duration;

  /** Include new cards */
  readonly includeNewCards: boolean;

  /** Max new cards */
  readonly maxNewCards: number;

  /** Face resolution enabled */
  readonly faceResolutionEnabled: boolean;

  /** Face pivoting enabled */
  readonly facePivotingEnabled: boolean;

  /** Prefetch count */
  readonly prefetchCount: number;
}

// =============================================================================
// RESOLVED REVIEW ITEM
// =============================================================================

/**
 * A fully resolved review item ready for presentation
 *
 * This is the OUTPUT of the orchestration — everything needed to show a card.
 */
export interface ResolvedReviewItem {
  /** Item identifier */
  readonly itemId: ReviewItemId;

  /** Session ID this item belongs to */
  readonly sessionId: ReviewSessionId;

  /** Position in the queue (1-based) */
  readonly position: number;

  /** Timestamp when this item was resolved */
  readonly resolvedAt: Timestamp;

  // =========================================================================
  // CARD IDENTIFICATION
  // =========================================================================

  /** Canonical card ID */
  readonly canonicalCardId: CanonicalCardId;

  /** Legacy card ID (for backwards compatibility) */
  readonly legacyCardId?: CardId;

  // =========================================================================
  // CANDIDATE CONTEXT (from scheduler/mode)
  // =========================================================================

  /** Original review candidate from mode */
  readonly candidate: ReviewCandidate;

  /** Scheduling data */
  readonly scheduling: ReviewItemScheduling;

  // =========================================================================
  // DECK CONTEXT (if deck-filtered)
  // =========================================================================

  /** Deck membership info */
  readonly deckContext?: ReviewItemDeckContext;

  // =========================================================================
  // FACE RESOLUTION (if enabled)
  // =========================================================================

  /** Resolved face */
  readonly resolvedFace: ResolvedFaceContext;

  /** Alternative faces available (for pivoting) */
  readonly alternativeFaces?: readonly AlternativeFace[];

  // =========================================================================
  // CONTEXT INDICATORS
  // =========================================================================

  /** Visual context indicators for the UI */
  readonly contextIndicators: readonly ContextIndicator[];

  // =========================================================================
  // EXPLAINABILITY
  // =========================================================================

  /** Full explainability trace */
  readonly explainability?: ReviewItemExplainability;
}

/**
 * Scheduling data for a review item
 */
export interface ReviewItemScheduling {
  /** Due date */
  readonly dueDate: Timestamp;

  /** Days overdue (negative if not yet due) */
  readonly daysOverdue: number;

  /** Current stability */
  readonly stability: number;

  /** Current retrievability */
  readonly retrievability: NormalizedValue;

  /** Current difficulty */
  readonly difficulty: NormalizedValue;

  /** Card state */
  readonly state: CardState;

  /** Is this a new card */
  readonly isNew: boolean;

  /** Urgency level */
  readonly urgency: UrgencyLevel;
}

/** Card learning state */
export type CardState = "new" | "learning" | "review" | "relearning";

/** Urgency level for review */
export type UrgencyLevel =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "deferred"
  | "blocked";

/**
 * Deck context for a review item
 */
export interface ReviewItemDeckContext {
  /** Deck ID */
  readonly deckId: DynamicDeckId;

  /** Position in deck */
  readonly positionInDeck: number;

  /** Matching participation IDs */
  readonly matchingParticipationIds: readonly ParticipationId[];

  /** Matching category IDs */
  readonly matchingCategoryIds: readonly CategoryId[];

  /** Inclusion explanation */
  readonly inclusionExplanation?: CardInclusionExplanation;
}

/**
 * Resolved face context
 */
export interface ResolvedFaceContext {
  /** Selected face */
  readonly face: CardFace;

  /** Face ID */
  readonly faceId: CardFaceId;

  /** Is this the default face */
  readonly isDefaultFace: boolean;

  /** Scaffolding directives */
  readonly scaffolding: ScaffoldingDirectives;

  /** Rendering directives */
  readonly rendering: RenderingDirectives;

  /** Resolution confidence */
  readonly confidence: Confidence;

  /** Resolution time (ms) */
  readonly resolutionTimeMs: number;
}

/**
 * Alternative face available for pivoting
 */
export interface AlternativeFace {
  /** Face */
  readonly face: CardFace;

  /** Face ID */
  readonly faceId: CardFaceId;

  /** Relevance score for current context */
  readonly relevanceScore: NormalizedValue;

  /** Reason this face is available */
  readonly availabilityReason: string;

  /** Would switching improve learning? */
  readonly improvementPotential?: ImprovementPotential;
}

/**
 * Potential improvement from switching faces
 */
export interface ImprovementPotential {
  /** Expected improvement type */
  readonly type: "depth" | "breadth" | "reinforcement" | "challenge";

  /** Description */
  readonly description: string;

  /** Confidence in improvement */
  readonly confidence: Confidence;
}

// =============================================================================
// CONTEXT INDICATORS
// =============================================================================

/**
 * Visual context indicator for the UI
 *
 * These help the user understand WHY they're seeing a card.
 */
export interface ContextIndicator {
  /** Indicator type */
  readonly type: ContextIndicatorType;

  /** Icon (emoji or icon name) */
  readonly icon: string;

  /** Label */
  readonly label: string;

  /** Tooltip/description */
  readonly description: string;

  /** Importance (for display ordering) */
  readonly importance: "primary" | "secondary" | "tertiary";

  /** Color hint */
  readonly colorHint?: string;
}

/** Types of context indicators */
export type ContextIndicatorType =
  | "urgency" // Card urgency level
  | "mode" // Learning mode influence
  | "deck" // Deck membership
  | "category" // Category context
  | "prerequisite" // Prerequisite relationship
  | "dependent" // Something depends on this
  | "streak" // Streak-related
  | "mastery" // Mastery level
  | "lapse" // Recent lapse
  | "new" // New card
  | "overdue" // Overdue card
  | "exam" // Exam relevance
  | "synthesis" // Synthesis opportunity
  | "exploration" // Exploration suggestion
  | "face_adapted" // Face was adapted for context
  | "custom"; // Custom indicator

// =============================================================================
// EXPLAINABILITY
// =============================================================================

/**
 * Session-level explainability
 */
export interface SessionExplainability {
  /** Trace ID */
  readonly traceId: OrchestrationTraceId;

  /** Summary of session setup */
  readonly summary: string;

  /** Detailed explanation */
  readonly details: string;

  /** Mode influence explanation */
  readonly modeInfluence: ModeInfluenceExplanation;

  /** Deck filter explanation (if applicable) */
  readonly deckFilterExplanation?: DeckFilterExplanation;

  /** Queue composition explanation */
  readonly queueComposition: QueueCompositionExplanation;
}

/**
 * How the mode influenced the session
 */
export interface ModeInfluenceExplanation {
  /** Mode name */
  readonly modeName: string;

  /** Mode type */
  readonly modeType: string;

  /** Parameters used */
  readonly parametersUsed: Record<string, unknown>;

  /** Signal amplifications */
  readonly signalAmplifications: readonly SignalAmplificationExplanation[];

  /** Policy modifications */
  readonly policyModifications: readonly PolicyModificationExplanation[];
}

/**
 * Signal amplification explanation
 */
export interface SignalAmplificationExplanation {
  /** Signal type */
  readonly signalType: string;

  /** Amplification factor */
  readonly factor: number;

  /** Why this signal is amplified */
  readonly reason: string;
}

/**
 * Policy modification explanation
 */
export interface PolicyModificationExplanation {
  /** Policy name */
  readonly policyName: string;

  /** Modification type */
  readonly modificationType:
    | "weight_increase"
    | "weight_decrease"
    | "enabled"
    | "disabled";

  /** Modification value */
  readonly value: number;

  /** Reason */
  readonly reason: string;
}

/**
 * Deck filter explanation
 */
export interface DeckFilterExplanation {
  /** Deck name */
  readonly deckName: string;

  /** Cards before filtering */
  readonly cardsBefore: number;

  /** Cards after filtering */
  readonly cardsAfter: number;

  /** Cards filtered out */
  readonly cardsFiltered: number;

  /** Filter criteria summary */
  readonly filterCriteriaSummary: string;
}

/**
 * Queue composition explanation
 */
export interface QueueCompositionExplanation {
  /** Total cards */
  readonly total: number;

  /** By state */
  readonly byState: {
    readonly new: number;
    readonly learning: number;
    readonly review: number;
    readonly relearning: number;
  };

  /** By urgency */
  readonly byUrgency: {
    readonly critical: number;
    readonly high: number;
    readonly medium: number;
    readonly low: number;
  };

  /** Top factors */
  readonly topFactors: readonly string[];
}

/**
 * Review item explainability
 */
export interface ReviewItemExplainability {
  /** Trace ID */
  readonly traceId: OrchestrationTraceId;

  /** Human-readable summary */
  readonly summary: string;

  /** Detailed explanation */
  readonly details: string;

  // =========================================================================
  // STAGE EXPLANATIONS
  // =========================================================================

  /** Scheduler stage */
  readonly schedulerStage: SchedulerStageExplanation;

  /** Mode stage */
  readonly modeStage: ModeStageExplanation;

  /** Deck stage (if applicable) */
  readonly deckStage?: DeckStageExplanation;

  /** Face resolution stage */
  readonly faceStage: FaceStageExplanation;
}

/**
 * Scheduler stage explanation
 */
export interface SchedulerStageExplanation {
  /** Why this card is due */
  readonly dueDateReason: string;

  /** Stability explanation */
  readonly stabilityExplanation: string;

  /** Retrievability explanation */
  readonly retrievabilityExplanation: string;

  /** Interval prediction summary */
  readonly intervalPrediction: string;
}

/**
 * Mode stage explanation
 */
export interface ModeStageExplanation {
  /** Mode name */
  readonly modeName: string;

  /** Priority score from mode */
  readonly priorityScore: NormalizedValue;

  /** Scoring breakdown */
  readonly scoringBreakdown: ReviewCandidateScoring;

  /** Signal contributions */
  readonly signalContributions: readonly SignalContribution[];
}

/**
 * Signal contribution to priority
 */
export interface SignalContribution {
  /** Signal name */
  readonly signalName: string;

  /** Contribution value */
  readonly contribution: number;

  /** Interpretation */
  readonly interpretation: string;
}

/**
 * Deck stage explanation
 */
export interface DeckStageExplanation {
  /** Deck name */
  readonly deckName: string;

  /** Why included */
  readonly inclusionReason: string;

  /** Matched predicates */
  readonly matchedPredicates: readonly string[];
}

/**
 * Face stage explanation
 */
export interface FaceStageExplanation {
  /** Selected face name */
  readonly selectedFaceName: string;

  /** Why this face */
  readonly selectionReason: string;

  /** Rules matched */
  readonly rulesMatched: number;

  /** Scaffolding applied */
  readonly scaffoldingApplied: string[];

  /** Full face resolution explainability */
  readonly fullExplainability?: FaceResolutionExplainability;
}

// =============================================================================
// FACE PIVOTING
// =============================================================================

/**
 * Request to pivot to a different face
 */
export interface FacePivotRequest {
  /** Session ID */
  readonly sessionId: ReviewSessionId;

  /** Item ID */
  readonly itemId: ReviewItemId;

  /** Target face ID */
  readonly targetFaceId: CardFaceId;

  /** Reason for pivot (for learning analytics) */
  readonly pivotReason?: FacePivotReason;

  /** Timestamp */
  readonly timestamp: Timestamp;
}

/** Reasons for face pivot */
export type FacePivotReason =
  | "too_easy" // Current face is too easy
  | "too_hard" // Current face is too hard
  | "want_different_angle" // Want a different perspective
  | "prefer_depth" // Want more depth
  | "prefer_breadth" // Want broader coverage
  | "context_mismatch" // Face doesn't match current context
  | "exploration" // Exploring alternatives
  | "other"; // Other reason

/**
 * Response to face pivot request
 */
export interface FacePivotResponse {
  /** Pivot ID */
  readonly pivotId: FacePivotId;

  /** Updated item with new face */
  readonly updatedItem: ResolvedReviewItem;

  /** Pivot was successful */
  readonly success: boolean;

  /** Message */
  readonly message: string;

  /** Learning impact estimate */
  readonly learningImpact?: LearningImpactEstimate;
}

/**
 * Estimated learning impact of face pivot
 */
export interface LearningImpactEstimate {
  /** Impact type */
  readonly type: "positive" | "neutral" | "negative";

  /** Description */
  readonly description: string;

  /** Confidence */
  readonly confidence: Confidence;

  /** Recommendations */
  readonly recommendations?: readonly string[];
}

// =============================================================================
// SESSION EVENTS & STATE
// =============================================================================

/**
 * Session state
 */
export interface ReviewSessionState {
  /** Session ID */
  readonly sessionId: ReviewSessionId;

  /** Current status */
  readonly status: SessionStatus;

  /** Started at */
  readonly startedAt: Timestamp;

  /** Last activity */
  readonly lastActivityAt: Timestamp;

  /** Completed at (if finished) */
  readonly completedAt?: Timestamp;

  // =========================================================================
  // PROGRESS
  // =========================================================================

  /** Total items in queue */
  readonly totalItems: number;

  /** Items reviewed */
  readonly itemsReviewed: number;

  /** Items remaining */
  readonly itemsRemaining: number;

  /** Current item index (0-based) */
  readonly currentIndex: number;

  /** Current item (if any) */
  readonly currentItem?: ResolvedReviewItem;

  // =========================================================================
  // STATISTICS
  // =========================================================================

  /** Session statistics */
  readonly statistics: ReviewSessionStatistics;

  // =========================================================================
  // FACE PIVOTS
  // =========================================================================

  /** Face pivots made during session */
  readonly facePivots: readonly FacePivotRecord[];
}

/** Session status */
export type SessionStatus =
  | "initializing"
  | "active"
  | "paused"
  | "completed"
  | "abandoned"
  | "error";

/**
 * Review session statistics (named to avoid conflict with scheduler SessionStatistics)
 */
export interface ReviewSessionStatistics {
  /** Total time spent (ms) */
  readonly totalTimeMs: Duration;

  /** Average time per card (ms) */
  readonly averageTimePerCard: Duration;

  /** Rating distribution */
  readonly ratingDistribution: {
    readonly again: number;
    readonly hard: number;
    readonly good: number;
    readonly easy: number;
  };

  /** Cards by state */
  readonly cardsByState: {
    readonly new: number;
    readonly learning: number;
    readonly review: number;
    readonly relearning: number;
  };

  /** Face pivots count */
  readonly facePivotsCount: number;

  /** Accuracy estimate */
  readonly accuracyEstimate: NormalizedValue;
}

/**
 * Record of a face pivot
 */
export interface FacePivotRecord {
  /** Pivot ID */
  readonly pivotId: FacePivotId;

  /** Item ID */
  readonly itemId: ReviewItemId;

  /** Card ID */
  readonly cardId: CanonicalCardId;

  /** From face */
  readonly fromFaceId: CardFaceId;

  /** To face */
  readonly toFaceId: CardFaceId;

  /** Reason */
  readonly reason?: FacePivotReason;

  /** Timestamp */
  readonly timestamp: Timestamp;
}

// =============================================================================
// SESSION EVENTS
// =============================================================================

/**
 * Base session event
 */
export interface SessionEventBase {
  /** Event ID */
  readonly eventId: SessionEventId;

  /** Session ID */
  readonly sessionId: ReviewSessionId;

  /** Timestamp */
  readonly timestamp: Timestamp;
}

/**
 * Session started event
 */
export interface SessionStartedEvent extends SessionEventBase {
  readonly type: "session_started";
  readonly payload: {
    readonly modeId: LearningModeId;
    readonly totalCards: number;
    readonly constraints: SessionConstraints;
  };
}

/**
 * Item presented event
 */
export interface ItemPresentedEvent extends SessionEventBase {
  readonly type: "item_presented";
  readonly payload: {
    readonly itemId: ReviewItemId;
    readonly cardId: CanonicalCardId;
    readonly faceId: CardFaceId;
    readonly position: number;
  };
}

/**
 * Item reviewed event
 */
export interface ItemReviewedEvent extends SessionEventBase {
  readonly type: "item_reviewed";
  readonly payload: {
    readonly itemId: ReviewItemId;
    readonly cardId: CanonicalCardId;
    readonly rating: "again" | "hard" | "good" | "easy";
    readonly responseTimeMs: Duration;
    readonly faceId: CardFaceId;
  };
}

/**
 * Face pivoted event
 */
export interface FacePivotedEvent extends SessionEventBase {
  readonly type: "face_pivoted";
  readonly payload: {
    readonly itemId: ReviewItemId;
    readonly fromFaceId: CardFaceId;
    readonly toFaceId: CardFaceId;
    readonly reason?: FacePivotReason;
  };
}

/**
 * Session paused event
 */
export interface SessionPausedEvent extends SessionEventBase {
  readonly type: "session_paused";
  readonly payload: {
    readonly progress: number;
    readonly reason?: string;
  };
}

/**
 * Session resumed event
 */
export interface SessionResumedEvent extends SessionEventBase {
  readonly type: "session_resumed";
  readonly payload: {
    readonly pauseDurationMs: Duration;
  };
}

/**
 * Session completed event
 */
export interface SessionCompletedEvent extends SessionEventBase {
  readonly type: "session_completed";
  readonly payload: {
    readonly statistics: ReviewSessionStatistics;
    readonly completionType:
      | "finished"
      | "time_limit"
      | "card_limit"
      | "user_stopped";
  };
}

/**
 * Session error event
 */
export interface SessionErrorEvent extends SessionEventBase {
  readonly type: "session_error";
  readonly payload: {
    readonly errorCode: string;
    readonly errorMessage: string;
    readonly recoverable: boolean;
  };
}

/** Union of all session events */
export type SessionEvent =
  | SessionStartedEvent
  | ItemPresentedEvent
  | ItemReviewedEvent
  | FacePivotedEvent
  | SessionPausedEvent
  | SessionResumedEvent
  | SessionCompletedEvent
  | SessionErrorEvent;

// =============================================================================
// ORCHESTRATOR INTERFACE
// =============================================================================

/**
 * Review Session Orchestrator interface
 *
 * This is the main entry point for the orchestration layer.
 */
export interface IReviewSessionOrchestrator {
  // =========================================================================
  // SESSION LIFECYCLE
  // =========================================================================

  /**
   * Start a new review session
   */
  startSession(request: ReviewSessionRequest): Promise<ReviewSessionResponse>;

  /**
   * Get the next item in the session
   */
  getNextItem(sessionId: ReviewSessionId): Promise<ResolvedReviewItem | null>;

  /**
   * Process a review result
   */
  processReview(
    sessionId: ReviewSessionId,
    itemId: ReviewItemId,
    result: ReviewResult,
  ): Promise<ReviewResultResponse>;

  /**
   * Pause the session
   */
  pauseSession(sessionId: ReviewSessionId): Promise<void>;

  /**
   * Resume the session
   */
  resumeSession(sessionId: ReviewSessionId): Promise<void>;

  /**
   * End the session
   */
  endSession(sessionId: ReviewSessionId): Promise<SessionCompletionSummary>;

  /**
   * Get session state
   */
  getSessionState(sessionId: ReviewSessionId): Promise<ReviewSessionState>;

  // =========================================================================
  // FACE PIVOTING
  // =========================================================================

  /**
   * Pivot to a different face
   */
  pivotFace(request: FacePivotRequest): Promise<FacePivotResponse>;

  /**
   * Get available alternative faces for an item
   */
  getAlternativeFaces(
    sessionId: ReviewSessionId,
    itemId: ReviewItemId,
  ): Promise<readonly AlternativeFace[]>;

  // =========================================================================
  // EXPLAINABILITY
  // =========================================================================

  /**
   * Get explanation for an item
   */
  explainItem(
    sessionId: ReviewSessionId,
    itemId: ReviewItemId,
  ): Promise<ReviewItemExplainability>;

  /**
   * Get session explanation
   */
  explainSession(sessionId: ReviewSessionId): Promise<SessionExplainability>;

  // =========================================================================
  // SUBSCRIPTIONS
  // =========================================================================

  /**
   * Subscribe to session events
   */
  subscribeToEvents(
    sessionId: ReviewSessionId,
    callback: SessionEventCallback,
  ): SessionEventSubscription;
}

/**
 * Review result input
 */
export interface ReviewResult {
  /** Rating given */
  readonly rating: "again" | "hard" | "good" | "easy";

  /** Response time (ms) */
  readonly responseTimeMs: Duration;

  /** User feedback (optional) */
  readonly feedback?: ReviewFeedback;
}

/**
 * Optional feedback with review
 */
export interface ReviewFeedback {
  /** Face appropriateness */
  readonly faceAppropriateness?:
    | "appropriate"
    | "too_easy"
    | "too_hard"
    | "wrong_angle";

  /** Free-form note */
  readonly note?: string;
}

/**
 * Response after processing a review
 */
export interface ReviewResultResponse {
  /** Success */
  readonly success: boolean;

  /** Updated SRS state summary */
  readonly updatedState: {
    readonly nextDueDate: Timestamp;
    readonly newStability: number;
    readonly newDifficulty: NormalizedValue;
  };

  /** Next item (pre-resolved) */
  readonly nextItem: ResolvedReviewItem | null;

  /** Session progress */
  readonly progress: {
    readonly reviewed: number;
    readonly remaining: number;
    readonly percentComplete: NormalizedValue;
  };

  /** Feedback acknowledgment */
  readonly feedbackAcknowledged?: boolean;
}

/**
 * Session completion summary
 */
export interface SessionCompletionSummary {
  /** Session ID */
  readonly sessionId: ReviewSessionId;

  /** Final statistics */
  readonly statistics: ReviewSessionStatistics;

  /** Completion type */
  readonly completionType:
    | "finished"
    | "time_limit"
    | "card_limit"
    | "user_stopped";

  /** Learning insights */
  readonly insights: readonly LearningInsight[];

  /** Recommendations for next session */
  readonly recommendations: readonly SessionRecommendation[];
}

/**
 * Learning insight from the session
 */
export interface LearningInsight {
  /** Insight type */
  readonly type: "strength" | "weakness" | "pattern" | "achievement";

  /** Title */
  readonly title: string;

  /** Description */
  readonly description: string;

  /** Related category (if applicable) */
  readonly categoryId?: CategoryId;
}

/**
 * Recommendation for future sessions
 */
export interface SessionRecommendation {
  /** Recommendation type */
  readonly type: "focus_area" | "mode_suggestion" | "pacing" | "scheduling";

  /** Title */
  readonly title: string;

  /** Description */
  readonly description: string;

  /** Actionable */
  readonly actionable: boolean;

  /** Action (if actionable) */
  readonly action?: {
    readonly type: string;
    readonly parameters: Record<string, unknown>;
  };
}

/**
 * Session event callback
 */
export type SessionEventCallback = (event: SessionEvent) => void;

/**
 * Session event subscription
 */
export interface SessionEventSubscription {
  /** Unsubscribe */
  unsubscribe(): void;
}

// =============================================================================
// PROVIDER INTERFACES
// =============================================================================

/**
 * Provider for ranked candidates (from scheduler/mode)
 */
export interface RankedCandidateProvider {
  /**
   * Get ranked candidates for a user
   */
  getRankedCandidates(
    userId: UserId,
    modeId: LearningModeId,
    options?: RankedCandidateOptions,
  ): Promise<RankedCandidateList>;
}

/**
 * Options for getting ranked candidates
 */
export interface RankedCandidateOptions {
  /** Category filter */
  readonly categoryId?: CategoryId;

  /** Maximum candidates */
  readonly maxCandidates?: number;

  /** Time budget */
  readonly timeBudget?: Duration;

  /** Mode parameter overrides */
  readonly parameterOverrides?: Record<string, unknown>;
}

/**
 * Provider for deck evaluation
 */
export interface DeckEvaluationProvider {
  /**
   * Evaluate deck membership for cards
   */
  evaluateDeckMembership(
    deckId: DynamicDeckId,
    cardIds: readonly CanonicalCardId[],
    userId: UserId,
  ): Promise<DeckMembershipResult>;

  /**
   * Get full deck evaluation
   */
  evaluateDeck(
    deckId: DynamicDeckId,
    userId: UserId,
  ): Promise<DeckQueryEvaluationResult>;
}

/**
 * Result of deck membership check
 */
export interface DeckMembershipResult {
  /** Cards that are members */
  readonly members: ReadonlyMap<CanonicalCardId, DeckCardResult>;

  /** Cards that are not members */
  readonly nonMembers: readonly CanonicalCardId[];

  /** Evaluation metadata */
  readonly metadata: {
    readonly evaluationTimeMs: number;
    readonly predicatesEvaluated: number;
  };
}

/**
 * Provider for face resolution
 */
export interface FaceResolutionProvider {
  /**
   * Resolve face for a single card
   */
  resolveFace(input: FaceResolutionInput): Promise<FaceResolutionOutput>;

  /**
   * Resolve faces for multiple cards
   */
  resolveFacesBatch(
    inputs: readonly FaceResolutionInput[],
  ): Promise<readonly FaceResolutionOutput[]>;

  /**
   * Get alternative faces for a card
   */
  getAlternativeFaces(
    cardId: CanonicalCardId,
    currentFaceId: CardFaceId,
    context: FaceResolutionInput,
  ): Promise<readonly AlternativeFace[]>;
}

/**
 * Provider for card data
 */
export interface CardDataProviderForSession {
  /**
   * Get card by canonical ID
   */
  getCard(cardId: CanonicalCardId): Promise<CardData | null>;

  /**
   * Get cards in batch
   */
  getCardsBatch(
    cardIds: readonly CanonicalCardId[],
  ): Promise<ReadonlyMap<CanonicalCardId, CardData>>;

  /**
   * Get faces for a card
   */
  getCardFaces(cardId: CanonicalCardId): Promise<readonly CardFace[]>;
}

/**
 * Card data for session
 */
export interface CardData {
  readonly canonicalCardId: CanonicalCardId;
  readonly legacyCardId?: CardId;
  readonly faces: readonly CardFace[];
  readonly defaultFaceId: CardFaceId;
  readonly participations: readonly ParticipationSummary[];
}

/**
 * Summary of card participation
 */
export interface ParticipationSummary {
  readonly participationId: ParticipationId;
  readonly categoryId: CategoryId;
  readonly categoryName: string;
  readonly semanticRole: ExtendedSemanticRole;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Configuration for the session orchestrator
 */
export interface SessionOrchestratorConfig {
  /** Default max cards per session */
  readonly defaultMaxCards: number;

  /** Default time budget (ms) */
  readonly defaultTimeBudget: Duration;

  /** Default prefetch count */
  readonly defaultPrefetchCount: number;

  /** Enable face resolution by default */
  readonly defaultEnableFaceResolution: boolean;

  /** Enable face pivoting by default */
  readonly defaultEnableFacePivoting: boolean;

  /** Enable explainability by default */
  readonly defaultEnableExplainability: boolean;

  /** Cache TTL for resolved items (ms) */
  readonly resolvedItemCacheTtl: Duration;

  /** Maximum concurrent face resolutions */
  readonly maxConcurrentFaceResolutions: number;

  /** Session timeout (ms) */
  readonly sessionTimeout: Duration;

  /** Maximum face pivots per session */
  readonly maxFacePivotsPerSession: number;
}

/**
 * Default configuration
 */
export const DEFAULT_SESSION_ORCHESTRATOR_CONFIG: SessionOrchestratorConfig = {
  defaultMaxCards: 50,
  defaultTimeBudget: (30 * 60 * 1000) as Duration, // 30 minutes
  defaultPrefetchCount: 3,
  defaultEnableFaceResolution: true,
  defaultEnableFacePivoting: false,
  defaultEnableExplainability: true,
  resolvedItemCacheTtl: (5 * 60 * 1000) as Duration, // 5 minutes
  maxConcurrentFaceResolutions: 5,
  sessionTimeout: (2 * 60 * 60 * 1000) as Duration, // 2 hours
  maxFacePivotsPerSession: 20,
};
