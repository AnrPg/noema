// =============================================================================
// LEARNING MODE FRAMEWORK TYPES
// =============================================================================
// Phase 5A: Mode Framework & Runtime
// Defines the type system for Manthanein's four learning modes:
// - Exploration: Prioritizes breadth and discovery
// - Goal-Driven: Focuses on specific knowledge targets
// - Exam-Oriented: Time-pressured retention optimization
// - Synthesis: Cross-domain connection building
// =============================================================================

import type {
  Timestamp,
  Duration,
  NormalizedValue,
  Confidence,
} from "./lkgc/foundation";
import type { CanonicalCardId, CardFaceId } from "./canonical-card.types";
import type { CategoryId } from "./ecosystem.types";
import type { UserId } from "./user.types";

// =============================================================================
// IDENTIFIERS
// =============================================================================

/**
 * Unique identifier for a learning mode (system or plugin)
 */
export type LearningModeId = string & { readonly __brand: "LearningModeId" };

/**
 * Unique identifier for a mode activation record
 */
export type ModeActivationId = string & {
  readonly __brand: "ModeActivationId";
};

/**
 * Unique identifier for a parameter set configuration
 */
export type ModeParameterSetId = string & {
  readonly __brand: "ModeParameterSetId";
};

/**
 * Unique identifier for a mode session (time-boxed mode usage)
 */
export type ModeSessionId = string & { readonly __brand: "ModeSessionId" };

/**
 * Unique identifier for an explainability trace
 */
export type ExplainabilityTraceId = string & {
  readonly __brand: "ExplainabilityTraceId";
};

/**
 * Unique identifier for a navigation suggestion
 */
export type NavigationSuggestionId = string & {
  readonly __brand: "NavigationSuggestionId";
};

/**
 * Unique identifier for a review candidate
 */
export type ReviewCandidateId = string & {
  readonly __brand: "ReviewCandidateId";
};

/**
 * Unique identifier for a mode plugin
 */
export type ModePluginId = string & { readonly __brand: "ModePluginId" };

// =============================================================================
// MODE DEFINITION
// =============================================================================

/**
 * The four system-defined learning modes
 */
export type SystemModeType =
  | "exploration"
  | "goal_driven"
  | "exam_oriented"
  | "synthesis";

/**
 * Where a mode comes from
 */
export type ModeSource = "system" | "plugin" | "user_custom";

/**
 * Complete definition of a learning mode
 */
export interface ModeDefinition {
  readonly id: LearningModeId;
  readonly source: ModeSource;
  readonly systemType?: SystemModeType;

  // Metadata
  readonly name: string;
  readonly description: string;
  readonly tagline?: string;
  readonly version?: string;
  readonly icon: string;
  readonly color?: ModeColorTheme;
  readonly colorTheme?: ModeColorTheme; // Alias for color

  // Parameter Schema
  readonly parameterSchema: ModeParameterSchema;
  readonly defaultParameters: Record<string, unknown>;

  // Policy Declarations
  readonly policyDeclarations?: readonly ModePolicyDeclaration[];
  readonly affects?: ModePolicyAffects;
  readonly affectedPolicies?: AffectedPolicies; // Alias for explainability

  // LKGC Signal Configuration
  readonly amplifiedLkgcSignals?: readonly LkgcSignalType[];
  readonly consumedLkgcSignals?: readonly LkgcSignalType[];

  // UI Configuration
  readonly uiEmphasis: ModeUiEmphasis;
  readonly capabilities?: readonly ModeCapability[];
  readonly suggestedViewLens?: string;

  // Mode Availability
  readonly enabledByDefault?: boolean;
  readonly supportsCategoryDefault?: boolean;
  readonly supportsSessionOverride?: boolean;
  readonly requiredCapabilities?: readonly string[];

  // Plugin specific
  readonly pluginId?: ModePluginId;
  readonly pluginManifest?: ModePluginManifest;

  // Timestamps
  readonly createdAt?: Timestamp;
  readonly updatedAt?: Timestamp;
}

// =============================================================================
// MODE PARAMETERS
// =============================================================================

/**
 * Supported parameter value types
 */
export type ModeParameterType =
  | "number"
  | "integer"
  | "boolean"
  | "string"
  | "enum"
  | "bipolar" // -1 to 1 scale
  | "normalized" // 0 to 1 scale
  | "duration" // time in minutes
  | "percentage" // 0 to 100
  | "range" // numeric range
  | "category_list" // list of category IDs
  | "card_list"; // list of card IDs

/**
 * Range definition for range-type parameters
 */
export interface ParameterRange {
  readonly min: number;
  readonly max: number;
  readonly step?: number;
}

/**
 * Enum option for enum-type parameters
 */
export interface EnumOption {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

/**
 * Definition of a configurable parameter
 */
export interface ModeParameterDefinition {
  readonly key: string;
  readonly type: ModeParameterType;
  readonly label: string;
  readonly description: string;
  readonly defaultValue: unknown;
  readonly constraints?: ModeParameterConstraints;
  readonly uiGroup?: string | ModeParameterUiGroup; // Can be string ID or full definition
  readonly advanced?: boolean;
  readonly crossValidation?: readonly CrossValidationRule[];
  // Additional fields for specific types
  readonly required?: boolean;
  readonly range?: ParameterRange;
  readonly enumOptions?: readonly EnumOption[];
}

/**
 * Constraints on parameter values
 */
export interface ModeParameterConstraints {
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly enumValues?: readonly string[];
  readonly pattern?: string; // regex for string validation
  readonly required?: boolean;
  // String constraints
  readonly minLength?: number;
  readonly maxLength?: number;
  // Array constraints
  readonly minItems?: number;
  readonly maxItems?: number;
}

/**
 * Complete parameter schema for a mode
 */
export interface ModeParameterSchema {
  readonly version?: string;
  readonly parameters: readonly ModeParameterDefinition[];
  readonly uiGroups?: readonly ModeParameterUiGroup[];
  readonly crossValidationRules?: readonly CrossValidationRule[];
}

/**
 * UI grouping for parameters
 */
export interface ModeParameterUiGroup {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly order?: number;
  readonly collapsible?: boolean;
  readonly collapsed?: boolean; // Alias for defaultCollapsed
  readonly defaultCollapsed?: boolean;
}

/**
 * Cross-validation rule between parameters
 */
export interface CrossValidationRule {
  readonly dependencies: readonly string[];
  readonly validator: string; // expression or function name
  readonly validatorKey?: string; // function key for handler lookup
  readonly parameters?: readonly string[]; // parameter keys involved
  readonly errorMessage: string;
}

// =============================================================================
// MODE POLICIES
// =============================================================================

/**
 * Which aspects of learning the mode affects
 */
export interface ModePolicyAffects {
  readonly navigation: boolean;
  readonly reviewSelection: boolean;
  readonly cardOrdering: boolean;
  readonly newCardIntroduction: boolean;
  readonly scheduling: boolean;
  readonly schedulingParameters?: boolean; // Alias for scheduling
  readonly ui: boolean;
  readonly uiEmphasis?: boolean; // Alias for ui
  readonly metacognitivePrompts?: boolean;
  readonly synthesisTriggers?: boolean;
  readonly categoryBehavior?: boolean;
}

/**
 * Affected policies structure for explainability
 * (alternate naming convention for algorithm compatibility)
 */
export interface AffectedPolicies {
  readonly navigation?: boolean;
  readonly reviewSelection: boolean;
  readonly cardOrdering: boolean;
  readonly newCardIntroduction: boolean;
  readonly schedulingParameters: boolean;
  readonly metacognitivePrompts?: boolean;
  readonly synthesisTriggers?: boolean;
  readonly uiEmphasis?: boolean;
  readonly categoryBehavior?: boolean;
}

/**
 * LKGC signal types used for mode-aware decisions
 */
export type LkgcSignalType =
  // Core LKGC signals
  | "confidence"
  | "confidence_variance"
  | "volatility"
  | "interference"
  | "coherence"
  | "stability"
  | "recency"
  | "frequency"
  | "contextual_strength"
  // Mode-specific signals
  | "prerequisite_completion"
  | "blocking_gap"
  | "mastery_level"
  | "goal_progress"
  | "coverage_gap"
  | "synthesis_potential"
  // Synthesis mode signals
  | "synthesis_depth"
  | "cross_context_stability"
  | "exploration_potential"
  // Scheduler signals
  | "novelty_score"
  | "retrievability"
  | "forgetting_risk"
  // Performance trend signals
  | "performance_trend"
  // Additional built-in mode signals
  | "serendipity_score"
  | "learning_velocity"
  | "structural_maturity"
  | "overdue_pressure"
  | "difficulty"
  | "half_life"
  | "context_fragmentation"
  | "interference_risk";

// =============================================================================
// MODE UI
// =============================================================================

/**
 * UI emphasis configuration for a mode
 */
export interface ModeUiEmphasis {
  readonly pressureLevel:
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | NormalizedValue;
  readonly showTimer: boolean;
  readonly showProgress: boolean;
  readonly showStreaks: boolean;
  readonly showEstimates: boolean;
  readonly showOverdueIndicators?: boolean;
  readonly showTimePressure?: boolean;
  readonly showDiscoveryPrompts?: boolean;
  readonly showSynthesisPrompts?: boolean;
  readonly showMetacognitiveSignals?: boolean;
  readonly cardTransitionSpeed: "slow" | "normal" | "fast";
  readonly feedbackDetail: "minimal" | "standard" | "detailed";
  /** Deprecated alias for showProgress */
  readonly showProgressMeters?: boolean;
  /** Coverage vs depth bias: -1 = depth, 0 = balanced, 1 = coverage */
  readonly coverageVsDepth?: number;
  /** Card display density */
  readonly cardDisplayDensity?: "compact" | "normal" | "detailed";
}

/**
 * Bipolar scale value (-1 to 1)
 */
export type BipolarValue = number & { readonly __brand: "BipolarValue" };

/**
 * Color theme for a mode
 */
export interface ModeColorTheme {
  readonly primary: string;
  readonly secondary: string;
  readonly accent: string;
  readonly background?: string;
}

/**
 * Capability flags for a mode
 */
export type ModeCapability =
  | "time_boxing"
  | "goal_tracking"
  | "synthesis_prompts"
  | "exploration_hints"
  | "spaced_repetition_override"
  | "category_focus"
  | "cross_domain_linking"
  | "metacognitive_prompts";

// =============================================================================
// MODE ACTIVATION & PERSISTENCE
// =============================================================================

/**
 * Scope at which a mode is activated
 */
export type ModeActivationScope = "global" | "category" | "session";

/**
 * Active mode configuration
 */
export interface ModeActivation {
  readonly id: ModeActivationId;
  readonly userId: UserId;
  readonly modeId: LearningModeId;
  readonly scope: ModeActivationScope;
  readonly categoryId?: CategoryId;
  readonly sessionId?: ModeSessionId;
  readonly parameters?: Record<string, unknown>;
  readonly parameterOverrides?: Record<string, unknown>;
  readonly activatedAt: Timestamp;
  readonly deactivatedAt?: Timestamp;
  readonly expiresAt?: Timestamp;
  readonly isActive?: boolean;
  readonly priority?: number;
}

/**
 * User's mode preferences and history
 */
export interface UserModePreferences {
  readonly userId: UserId;
  readonly defaultMode: LearningModeId;
  /** Alias for defaultMode */
  readonly defaultModeId?: LearningModeId;
  readonly categoryDefaults: ReadonlyMap<CategoryId, LearningModeId>;
  readonly savedPresets: readonly ModeParameterPreset[];
  /** Alias for savedPresets */
  readonly parameterPresets?: readonly ModeParameterPreset[];
  readonly recentModes: readonly LearningModeId[];
  /** Alias for recentModes */
  readonly favoriteModes?: readonly LearningModeId[];
  readonly lastUpdated: Timestamp;
  /** Alias for lastUpdated */
  readonly updatedAt?: Timestamp;
}

/**
 * Saved parameter preset
 */
export interface ModeParameterPreset {
  readonly id: ModeParameterSetId;
  readonly modeId: LearningModeId;
  readonly name: string;
  readonly description?: string;
  readonly parameters: Record<string, unknown>;
  readonly createdAt: Timestamp;
  readonly usageCount: number;
}

// =============================================================================
// MODE RUNTIME
// =============================================================================

/**
 * Current runtime state for a mode
 */
export interface ModeRuntimeState {
  readonly modeId: LearningModeId;
  readonly definition: ModeDefinition;
  readonly activation: ModeActivation;
  readonly scopeContext: ModeScopeContext;
  readonly lkgcSnapshot: LkgcSignalSnapshot;
  readonly sessionStats?: ModeSessionStats;

  // Convenience aliases for algorithms
  readonly activeModeDefinition: ModeDefinition;
  readonly resolvedParameters: Record<string, unknown>;
  readonly activeLkgcSignals?: ReadonlyMap<LkgcSignalType, LkgcSignalValue>;
}

/**
 * Context for the current mode scope
 */
export interface ModeScopeContext {
  readonly scope: ModeActivationScope;
  readonly categoryId?: CategoryId;
  readonly sessionId?: ModeSessionId;
  readonly startedAt: Timestamp;
  readonly timeBudgetMinutes?: number;
  readonly goalTargets?: readonly GoalTarget[];
  /** Category-specific context for category-scoped modes */
  readonly categoryContext?: {
    readonly categoryName: string;
    readonly cardCount: number;
    readonly dueCount: number;
    readonly newCount: number;
  };
  /** Session-specific context for session-scoped modes */
  readonly sessionContext?: {
    readonly startedAt: Timestamp;
    readonly cardsReviewed: number;
    readonly timeSpentMinutes: number;
  };
}

/**
 * Goal target for goal-driven mode
 */
export interface GoalTarget {
  readonly categoryId: CategoryId;
  readonly targetRetention: NormalizedValue;
  readonly currentRetention: NormalizedValue;
  readonly cardsDue: number;
  readonly estimatedMinutes: number;
}

/**
 * Session statistics
 */
export interface ModeSessionStats {
  readonly cardsReviewed: number;
  readonly newCardsIntroduced: number;
  readonly correctCount: number;
  readonly averageResponseTime: Duration;
  readonly timeSpentMinutes: number;
  readonly streakCurrent: number;
  readonly streakBest: number;
}

/**
 * Snapshot of LKGC signals for mode decisions
 */
export interface LkgcSignalSnapshot {
  readonly timestamp: Timestamp;
  /** Signal values indexed by signal type - can be Map or Record for flexibility */
  readonly signals:
    | ReadonlyMap<LkgcSignalType, LkgcSignalValue>
    | Partial<Record<LkgcSignalType, LkgcSignalValue>>;
  readonly aggregateConfidence?: Confidence;
  readonly aggregateStability?: NormalizedValue;
  /** Snapshot timestamp alias */
  readonly snapshotAt?: Timestamp;
  /** Optional user context for enriched snapshots */
  readonly userContext?: {
    readonly userId: UserId;
    readonly overallMastery: NormalizedValue;
    readonly activeStreakDays: number;
    readonly recentReviewCount: number;
  };
}

/**
 * Individual LKGC signal value
 */
export interface LkgcSignalValue {
  readonly type: LkgcSignalType;
  readonly value: NormalizedValue;
  readonly normalizedValue: NormalizedValue; // Alias for compatibility
  readonly confidence: Confidence;
  readonly trend: "increasing" | "decreasing" | "stable";
  readonly lastUpdated: Timestamp;
}

// =============================================================================
// EXPLAINABILITY
// =============================================================================

/**
 * Complete explainability trace for a decision
 */
export interface ExplainabilityTrace {
  readonly id: ExplainabilityTraceId;
  readonly timestamp?: Timestamp;
  readonly createdAt?: Timestamp; // Alias for timestamp
  readonly modeId?: LearningModeId;
  readonly subject: ExplainabilitySubject;
  readonly parametersUsed?: Record<string, unknown>;
  readonly factors: readonly ExplainabilityFactor[];
  readonly summary?: string;
  readonly humanReadable?: string; // Alias for summary
  readonly detailedExplanation?: string;
  readonly suggestedActions?: readonly ExplainabilitySuggestedAction[];
  readonly ttlMs?: Duration;
}

/**
 * What the explainability is about
 */
export interface ExplainabilitySubject {
  readonly type:
    | "navigation"
    | "review_selection"
    | "card_ordering"
    | "scheduling"
    | "card"
    | "list"
    | "session";
  readonly cardId?: CanonicalCardId;
  readonly listId?: string;
  readonly navigationId?: string;
  readonly sessionId?: ModeSessionId;
  readonly categoryId?: CategoryId;
  readonly faceId?: CardFaceId;
}

/**
 * Factor contributing to a decision
 */
export interface ExplainabilityFactor {
  readonly name: string;
  readonly weight: NormalizedValue;
  readonly description: string;
  readonly sourceSignal?: LkgcSignalType;
  readonly modeInfluence?: NormalizedValue;
}

/**
 * Suggested action based on explainability
 */
export interface ExplainabilitySuggestedAction {
  readonly action: string;
  readonly reason: string;
  readonly priority: "low" | "medium" | "high";
}

// =============================================================================
// NAVIGATION (Phase 5B placeholders)
// =============================================================================

/**
 * Navigation suggestion from mode
 */
export interface NavigationSuggestion {
  readonly id: NavigationSuggestionId;
  readonly type: NavigationSuggestionType;
  readonly target: NavigationTarget;
  readonly reason: string;
  readonly priority: NormalizedValue;
  readonly modeContext: LearningModeId;
  readonly explainability: ExplainabilityTrace;
}

/**
 * Type of navigation suggestion
 */
export type NavigationSuggestionType =
  | "prerequisite"
  | "related_concept"
  | "synthesis_opportunity"
  | "coverage_gap"
  | "reinforcement"
  | "exploration"
  // Feed-specific types
  | "bridge"
  | "serendipity"
  | "adjacent_category"
  | "exam_coverage"
  | "goal_progress";

/**
 * Target of a navigation suggestion
 */
export interface NavigationTarget {
  readonly type: "category" | "card" | "face";
  readonly categoryId?: CategoryId;
  readonly cardId?: CanonicalCardId;
  readonly faceId?: CardFaceId;
}

// =============================================================================
// REVIEW CANDIDATES (Phase 5B placeholders)
// =============================================================================

/**
 * Review candidate from scheduler
 */
export interface ReviewCandidate {
  readonly id: ReviewCandidateId;
  readonly cardId: CanonicalCardId;
  readonly faceId?: CardFaceId;
  readonly categoryId: CategoryId;
  readonly participationId?: string; // For multi-belonging context
  readonly scheduledFor: Timestamp;
  readonly urgency: NormalizedValue;
  readonly priorityScore: NormalizedValue; // Mode-weighted priority
  readonly scoring: ReviewCandidateScoring;
  readonly modeBoost?: NormalizedValue;
}

/**
 * Scoring breakdown for a review candidate
 */
export interface ReviewCandidateScoring {
  readonly baseScore: NormalizedValue;
  readonly urgencyBonus: NormalizedValue;
  readonly modeModifier: NormalizedValue;
  readonly finalScore: NormalizedValue;
  readonly urgency: NormalizedValue; // Direct urgency value
  readonly factors: readonly ScoringFactor[];
  readonly signalContributions?: ReadonlyMap<LkgcSignalType, NormalizedValue>;
}

/**
 * Individual scoring factor
 */
export interface ScoringFactor {
  readonly name: string;
  readonly value: NormalizedValue;
  readonly weight: NormalizedValue;
  readonly contribution: NormalizedValue;
}

// =============================================================================
// RANKED OUTPUT
// =============================================================================

/**
 * Ranked list of candidates from mode runtime
 */
export interface RankedCandidateList {
  readonly modeId?: LearningModeId;
  readonly sourceModeId?: LearningModeId; // Alias for modeId
  readonly timestamp?: Timestamp;
  readonly generatedAt?: Timestamp; // Alias for timestamp
  readonly candidates?: readonly ReviewCandidate[];
  readonly reviewCandidates: readonly ReviewCandidate[]; // Required for compatibility
  readonly newCardRecommendations: readonly NewCardRecommendation[];
  readonly synthesisOpportunities: readonly SynthesisOpportunity[];
  readonly metacognitivePrompts: readonly MetacognitivePrompt[];
  readonly navigationSuggestions?: readonly NavigationSuggestion[];
  readonly listExplainabilityTraceId?: ExplainabilityTraceId;
  readonly parametersUsed?: Record<string, unknown>;
  readonly ttlMs?: Duration;
}

/**
 * Recommendation for introducing a new card
 */
export interface NewCardRecommendation {
  readonly cardId: CanonicalCardId;
  readonly reason: string;
  readonly priority: NormalizedValue;
  readonly prerequisites: readonly CanonicalCardId[];
  readonly estimatedDifficulty: NormalizedValue;
}

/**
 * Opportunity for synthesis between concepts
 */
export interface SynthesisOpportunity {
  readonly cards: readonly CanonicalCardId[];
  readonly connectionType: string;
  readonly prompt: string;
  readonly difficulty: NormalizedValue;
}

/**
 * Metacognitive prompt for the learner
 */
export interface MetacognitivePrompt {
  readonly type: "reflection" | "strategy" | "feedback" | "encouragement";
  readonly message: string;
  readonly trigger: string;
  readonly priority: NormalizedValue;
}

// =============================================================================
// POLICY INTERFACES
// =============================================================================

/**
 * Navigation policy for a mode
 */
export interface NavigationPolicy {
  readonly modeId: LearningModeId;
  generateSuggestions(
    context: ModePolicyContext,
  ): readonly NavigationSuggestion[];
  prioritize(
    suggestions: readonly NavigationSuggestion[],
  ): readonly NavigationSuggestion[];
}

/**
 * Review selection policy for a mode
 */
export interface ReviewSelectionPolicy {
  readonly modeId: LearningModeId;
  filterCandidates(
    candidates: readonly ReviewCandidateInput[],
    context: ModePolicyContext,
  ): readonly ReviewCandidateInput[];
  rankCandidates(
    candidates: readonly ReviewCandidateInput[],
    context: ModePolicyContext,
  ): readonly ReviewCandidate[];
}

/**
 * Card ordering policy for a mode
 */
export interface CardOrderingPolicy {
  readonly modeId: LearningModeId;
  orderCards(
    candidates: readonly ReviewCandidate[],
    context: ModePolicyContext,
  ): readonly ReviewCandidate[];
}

/**
 * New card introduction policy for a mode
 */
export interface NewCardIntroductionPolicy {
  readonly modeId: LearningModeId;
  shouldIntroduceNew(context: ModePolicyContext): boolean;
  selectNewCards(
    available: readonly CanonicalCardId[],
    context: ModePolicyContext,
  ): readonly NewCardRecommendation[];
}

/**
 * Input for review candidate processing
 */
export interface ReviewCandidateInput {
  readonly cardId: CanonicalCardId;
  readonly faceId?: CardFaceId;
  readonly categoryId: CategoryId;
  readonly scheduledFor: Timestamp;
  readonly dueState: "overdue" | "due" | "upcoming";
  readonly lastReviewedAt?: Timestamp;
  readonly stability?: NormalizedValue;
  readonly difficulty?: NormalizedValue;
  readonly participationId?: string;
  readonly schedulingData?: {
    readonly stability?: number;
    readonly difficulty?: number;
    readonly dueDate?: Timestamp;
    readonly lastReviewedAt?: Timestamp;
    readonly retrievability?: number;
    readonly state?: string;
  };
  readonly lkgcSignals?: Partial<Record<LkgcSignalType, LkgcSignalValue>>;
}

/**
 * Context for policy decisions
 */
export interface ModePolicyContext {
  readonly modeRuntime: ModeRuntimeState;
  readonly userId: UserId;
  readonly currentTime: Timestamp;
  readonly sessionDuration?: Duration;
  readonly cardsReviewedThisSession: number;
  readonly categoryFocus?: CategoryId;
}

// =============================================================================
// PLUGIN
// =============================================================================

/**
 * Manifest for a mode plugin
 */
export interface ModePluginManifest {
  readonly pluginId: ModePluginId;
  readonly name: string;
  readonly version: string;
  readonly author: string;
  readonly description: string;
  readonly homepage?: string;
  readonly modeDefinitions: readonly ModeDefinition[];
  readonly dependencies?: readonly string[];
}

/**
 * Policy declaration for a mode
 */
export interface ModePolicyDeclaration {
  readonly policyType:
    | "navigation"
    | "review_selection"
    | "card_ordering"
    | "new_card_introduction"
    | "scheduling";
  readonly priority: number;
  readonly description: string;
  readonly affectedSignals: readonly LkgcSignalType[];
}

// =============================================================================
// CATEGORY SCHEDULING
// =============================================================================

/**
 * Scheduling metadata influenced by category structure
 */
export interface CategorySchedulingMetadata {
  readonly categoryId: CategoryId;
  readonly decayModel: DecayModelType;
  readonly baseDifficulty: NormalizedValue;
  readonly difficultySpread: NormalizedValue;
  readonly averageRetention: NormalizedValue;
  readonly cardCount: number;
  readonly lastCalculated: Timestamp;
}

/**
 * Type of decay model used for scheduling
 */
export type DecayModelType = "exponential" | "power_law" | "hybrid";

// =============================================================================
// DEFAULT PARAMETERS
// =============================================================================

/**
 * Default parameters for Exploration mode
 */
export const DEFAULT_EXPLORATION_PARAMETERS: Record<string, unknown> = {
  breadthBias: 0.7,
  noveltyWeight: 0.6,
  connectionDiscoveryEnabled: true,
  timePressure: 0.2,
  maxNewCardsPerSession: 15,
  retentionThreshold: 0.7,
  enableSurpriseCards: true,
};

/**
 * Default parameters for Goal-Driven mode
 */
export const DEFAULT_GOAL_DRIVEN_PARAMETERS: Record<string, unknown> = {
  focusIntensity: 0.8,
  goalPrioritization: "retention_first",
  distractionTolerance: 0.1,
  timePressure: 0.5,
  maxNewCardsPerSession: 5,
  retentionThreshold: 0.85,
  enableProgressTracking: true,
};

/**
 * Default parameters for Exam-Oriented mode
 */
export const DEFAULT_EXAM_ORIENTED_PARAMETERS: Record<string, unknown> = {
  urgencyMultiplier: 1.5,
  recallPriority: 0.9,
  timePressure: 0.9,
  maxNewCardsPerSession: 0,
  retentionThreshold: 0.95,
  enableSimulatedPressure: true,
  countdownEnabled: true,
};

/**
 * Default parameters for Synthesis mode
 */
export const DEFAULT_SYNTHESIS_PARAMETERS: Record<string, unknown> = {
  connectionWeight: 0.8,
  crossDomainEnabled: true,
  synthesisPromptFrequency: 0.3,
  timePressure: 0.3,
  maxNewCardsPerSession: 10,
  retentionThreshold: 0.75,
  enableMetacognitivePrompts: true,
};

/**
 * Default category scheduling metadata
 */
export const DEFAULT_CATEGORY_SCHEDULING_METADATA: Omit<
  CategorySchedulingMetadata,
  "categoryId" | "lastCalculated"
> = {
  decayModel: "exponential",
  baseDifficulty: 0.5 as NormalizedValue,
  difficultySpread: 0.2 as NormalizedValue,
  averageRetention: 0.8 as NormalizedValue,
  cardCount: 0,
};
