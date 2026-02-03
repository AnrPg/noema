// =============================================================================
// FACE RESOLUTION ENGINE TYPES
// =============================================================================
// Phase 6B: Face Resolution Engine (Logic Core)
//
// The Face Resolution Engine is the decision layer that determines:
// - WHICH face to present for a given card + context
// - WHAT scaffolding/emphasis to apply
// - WHY this face was chosen (explainability)
//
// DESIGN PRINCIPLES:
// 1. Declarative, rule-based resolution (not giant if-else)
// 2. Plugin-extensible resolution rules
// 3. Testable in isolation (no side effects)
// 4. Full explainability for every decision
// 5. LLM-agent ready (clean inputs/outputs, explicit interfaces)
//
// NO SCHEDULING. NO UI. NO DECK QUERIES.
// =============================================================================

import type {
  CanonicalCardId,
  CardFaceId,
  CardFace,
  FaceApplicabilityRule,
  CognitiveDepthLevel,
  ApplicabilityRuleType,
  ApplicabilityCondition,
  CategoryIntent,
  LkgcSignalType,
} from "./canonical-card.types";
import type {
  CategoryId,
  SemanticRole,
  SemanticIntent,
} from "./ecosystem.types";
import type { LearningModeId, SystemModeType } from "./learning-mode.types";
import type {
  ExtendedSemanticRole,
  ParticipationId,
} from "./multi-belonging.types";
import type { UserId } from "./user.types";
import type {
  Timestamp,
  NormalizedValue,
  Confidence,
  Duration,
} from "./lkgc/foundation";

// =============================================================================
// IDENTIFIERS
// =============================================================================

/** Unique identifier for a resolution request */
export type ResolutionRequestId = string & {
  readonly __brand: "ResolutionRequestId";
};

/** Unique identifier for a resolution rule plugin */
export type ResolutionRulePluginId = string & {
  readonly __brand: "ResolutionRulePluginId";
};

/** Unique identifier for an explainability trace */
export type FaceResolutionTraceId = string & {
  readonly __brand: "FaceResolutionTraceId";
};

// =============================================================================
// RESOLUTION INPUT - What the engine receives
// =============================================================================

/**
 * Complete input for face resolution
 *
 * This is the DECISION CONTEXT - everything the engine needs to choose a face.
 * All fields are explicit and well-typed for:
 * - Clean API boundaries
 * - LLM agent consumption
 * - Testability
 */
export interface FaceResolutionInput {
  /** Request identifier for tracing */
  readonly requestId: ResolutionRequestId;

  /** User making the request */
  readonly userId: UserId;

  /** Timestamp of the request */
  readonly timestamp: Timestamp;

  // =========================================================================
  // CARD & FACE CONTEXT
  // =========================================================================

  /** The canonical card to resolve a face for */
  readonly canonicalCardId: CanonicalCardId;

  /** Available faces for this card (pre-fetched for efficiency) */
  readonly availableFaces: readonly CardFaceWithRules[];

  /** Default face ID (fallback if no rules match) */
  readonly defaultFaceId: CardFaceId;

  // =========================================================================
  // CATEGORY LENS CONTEXT
  // =========================================================================

  /** Active category lens (if any) */
  readonly categoryLens?: CategoryLensContext;

  // =========================================================================
  // PARTICIPATION CONTEXT
  // =========================================================================

  /** Active participation (card-category relationship) */
  readonly participation?: ParticipationContext;

  // =========================================================================
  // MODE CONTEXT
  // =========================================================================

  /** Active learning mode */
  readonly mode?: ModeContext;

  // =========================================================================
  // LKGC METACOGNITIVE SIGNALS
  // =========================================================================

  /** LKGC signals for this card/context */
  readonly lkgcSignals?: LkgcSignalsContext;

  // =========================================================================
  // USER PREFERENCES
  // =========================================================================

  /** User preferences that may affect face selection */
  readonly userPreferences?: UserPreferencesContext;

  // =========================================================================
  // TEMPORAL CONTEXT
  // =========================================================================

  /** Time-based context */
  readonly temporalContext?: TemporalContext;

  // =========================================================================
  // RESOLUTION OPTIONS
  // =========================================================================

  /** Options controlling resolution behavior */
  readonly options?: ResolutionOptions;
}

/**
 * Card face with its applicability rules loaded
 */
export interface CardFaceWithRules {
  readonly face: CardFace;
  readonly rules: readonly FaceApplicabilityRule[];
}

/**
 * Category lens context for resolution
 */
export interface CategoryLensContext {
  readonly categoryId: CategoryId;
  readonly categoryName: string;

  /** Semantic intent of this category */
  readonly semanticIntent?: SemanticIntent;

  /** Category's framing question */
  readonly framingQuestion?: string;

  /** Category's target depth goal */
  readonly depthGoal?: CognitiveDepthLevel;

  /** Category's learning intent */
  readonly learningIntent?: CategoryIntent;

  /** Ancestor category IDs (for hierarchical matching) */
  readonly ancestorCategoryIds?: readonly CategoryId[];

  /** Descendant category IDs (for hierarchical matching) */
  readonly descendantCategoryIds?: readonly CategoryId[];
}

/**
 * Participation context - how the card relates to the active category
 */
export interface ParticipationContext {
  readonly participationId: ParticipationId;

  /** Semantic role of the card in this category */
  readonly semanticRole: SemanticRole | ExtendedSemanticRole;

  /** Is this the card's primary/home category? */
  readonly isPrimary: boolean;

  /** Context-specific mastery level */
  readonly contextMastery: NormalizedValue;

  /** Number of reviews in this context */
  readonly reviewCountInContext: number;

  /** Context-specific emphasis level */
  readonly emphasisLevel?: number;
}

/**
 * Mode context - active learning mode information
 */
export interface ModeContext {
  readonly modeId: LearningModeId;
  readonly modeName: string;

  /** System mode type (if built-in) */
  readonly systemModeType?: SystemModeType;

  /** Mode's suggested depth bias */
  readonly depthBias?: CognitiveDepthLevel;

  /** Mode's pressure level (0 = relaxed, 1 = high pressure) */
  readonly pressureLevel?: NormalizedValue;

  /** Mode-specific parameters */
  readonly parameters?: Record<string, unknown>;
}

/**
 * LKGC metacognitive signals context
 *
 * NOTE: These are INTERFACE types only - LKGC computation is elsewhere.
 * The resolution engine CONSUMES these signals, it does not compute them.
 */
export interface LkgcSignalsContext {
  /** Confidence in current mastery (0-1) */
  readonly confidence?: NormalizedValue;

  /** Memory stability estimate */
  readonly stability?: NormalizedValue;

  /** Volatility - how much confidence varies */
  readonly volatility?: NormalizedValue;

  /** Interference risk from similar items */
  readonly interference?: NormalizedValue;

  /** Coherence - consistency across contexts */
  readonly coherence?: NormalizedValue;

  /** Recency - when last reviewed */
  readonly recency?: NormalizedValue;

  /** Contextual strength - strength in current context */
  readonly contextualStrength?: NormalizedValue;

  /** Forgetting risk */
  readonly forgettingRisk?: NormalizedValue;

  /** Raw signal map for plugin access */
  readonly rawSignals?: Record<LkgcSignalType, NormalizedValue>;
}

/**
 * User preferences context
 */
export interface UserPreferencesContext {
  /** Preferred depth level */
  readonly preferredDepth?: CognitiveDepthLevel;

  /** Preferred face types */
  readonly preferredFaceTypes?: readonly string[];

  /** Scaffolding preference (0 = minimal, 1 = maximum) */
  readonly scaffoldingPreference?: NormalizedValue;

  /** Time preference (quick vs thorough) */
  readonly timePreference?: "quick" | "balanced" | "thorough";

  /** Custom preferences map */
  readonly customPreferences?: Record<string, unknown>;
}

/**
 * Temporal context for time-based rules
 */
export interface TemporalContext {
  /** Time of day */
  readonly timeOfDay: "morning" | "afternoon" | "evening" | "night";

  /** Day of week (0 = Sunday, 6 = Saturday) */
  readonly dayOfWeek: number;

  /** Is it a weekend? */
  readonly isWeekend: boolean;

  /** Available time budget */
  readonly timeBudget?: Duration;

  /** Session duration so far */
  readonly sessionDuration?: Duration;

  /** Current date for date-range checks */
  readonly currentDate: Timestamp;
}

/**
 * Options controlling resolution behavior
 */
export interface ResolutionOptions {
  /** Include full explainability trace */
  readonly includeExplainability?: boolean;

  /** Include all evaluated rules (not just matching) */
  readonly includeAllEvaluatedRules?: boolean;

  /** Minimum confidence threshold for selection */
  readonly minConfidenceThreshold?: Confidence;

  /** Force a specific face (for testing/preview) */
  readonly forceFaceId?: CardFaceId;

  /** Exclude specific faces */
  readonly excludeFaceIds?: readonly CardFaceId[];

  /** Plugin rule IDs to use (empty = all) */
  readonly enabledPluginRuleIds?: readonly ResolutionRulePluginId[];

  /** Maximum rules to evaluate (performance limit) */
  readonly maxRulesToEvaluate?: number;
}

// =============================================================================
// RESOLUTION OUTPUT - What the engine produces
// =============================================================================

/**
 * Complete output from face resolution
 *
 * This is the DECISION RESULT - the chosen face plus all context needed
 * for rendering and explainability.
 */
export interface FaceResolutionOutput {
  /** Resolution request ID (for correlation) */
  readonly requestId: ResolutionRequestId;

  /** Timestamp of resolution */
  readonly resolvedAt: Timestamp;

  // =========================================================================
  // SELECTED FACE
  // =========================================================================

  /** The chosen face */
  readonly selectedFace: CardFace;

  /** The face ID (convenience) */
  readonly selectedFaceId: CardFaceId;

  /** Whether this is the default face (no rules matched) */
  readonly isDefaultFace: boolean;

  // =========================================================================
  // SCAFFOLDING DIRECTIVES
  // =========================================================================

  /** Scaffolding to apply (may be modified from face's base scaffolding) */
  readonly scaffoldingDirectives: ScaffoldingDirectives;

  // =========================================================================
  // RENDERING DIRECTIVES
  // =========================================================================

  /** How to render/emphasize the face */
  readonly renderingDirectives: RenderingDirectives;

  // =========================================================================
  // EXPLAINABILITY PAYLOAD
  // =========================================================================

  /** Full explanation of why this face was chosen */
  readonly explainability: FaceResolutionExplainability;

  // =========================================================================
  // METADATA
  // =========================================================================

  /** Resolution confidence (how sure the engine is about this choice) */
  readonly confidence: Confidence;

  /** Time taken to resolve (ms) */
  readonly resolutionTimeMs: number;

  /** Number of rules evaluated */
  readonly rulesEvaluated: number;

  /** Number of faces considered */
  readonly facesConsidered: number;
}

/**
 * Scaffolding directives - modifications to base face scaffolding
 */
export interface ScaffoldingDirectives {
  /** Effective scaffolding level (may differ from face default) */
  readonly effectiveLevel: number;

  /** Scaffolding level adjustment reason */
  readonly levelAdjustmentReason?: string;

  /** Which hints to pre-reveal */
  readonly preRevealedHints?: readonly string[];

  /** Additional hints to add */
  readonly additionalHints?: readonly string[];

  /** Partial templates to use */
  readonly activePartialTemplates?: readonly string[];

  /** Whether to auto-reveal on struggle */
  readonly autoRevealOnStruggle: boolean;

  /** Time before auto-reveal (if enabled) */
  readonly autoRevealDelayMs?: Duration;
}

/**
 * Rendering directives - how to display the face
 */
export interface RenderingDirectives {
  /** Emphasis style for question */
  readonly questionEmphasis?: EmphasisDirective;

  /** Emphasis style for answer */
  readonly answerEmphasis?: EmphasisDirective;

  /** Content regions to highlight */
  readonly highlightRegions?: readonly ContentRegionHighlight[];

  /** Time pressure indicator */
  readonly timePressureLevel?: NormalizedValue;

  /** Whether to show context indicators */
  readonly showContextIndicators: boolean;

  /** Context indicator content */
  readonly contextIndicators?: readonly ContextIndicator[];

  /** Additional rendering metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Emphasis directive for content
 */
export interface EmphasisDirective {
  readonly type: "normal" | "highlighted" | "dimmed" | "focused";
  readonly color?: string;
  readonly intensity?: NormalizedValue;
}

/**
 * Content region to highlight
 */
export interface ContentRegionHighlight {
  readonly primitiveId?: string;
  readonly regionType: "text_range" | "field" | "whole";
  readonly start?: number;
  readonly end?: number;
  readonly field?: string;
  readonly style: EmphasisDirective;
}

/**
 * Context indicator shown during review
 */
export interface ContextIndicator {
  readonly type: "category" | "mode" | "role" | "lkgc" | "custom";
  readonly label: string;
  readonly value?: string;
  readonly icon?: string;
  readonly color?: string;
  readonly tooltip?: string;
}

// =============================================================================
// EXPLAINABILITY - Why this face was chosen
// =============================================================================

/**
 * Complete explainability payload for face resolution
 *
 * This supports the "Why am I seeing this face?" affordance.
 */
export interface FaceResolutionExplainability {
  /** Trace ID for this resolution */
  readonly traceId: FaceResolutionTraceId;

  /** Human-readable summary */
  readonly summary: string;

  /** Detailed human-readable explanation */
  readonly detailedExplanation: string;

  /** Factors that contributed to the decision */
  readonly contributingFactors: readonly FaceResolutionFactor[];

  /** Rules that matched and their contributions */
  readonly matchedRules: readonly MatchedRuleExplanation[];

  /** Rules that were evaluated but didn't match */
  readonly unmatchedRules: readonly UnmatchedRuleExplanation[];

  /** Alternative faces that were considered */
  readonly alternatives: readonly AlternativeFaceExplanation[];

  /** Context used for resolution */
  readonly resolutionContext: ResolutionContextSnapshot;
}

/**
 * A factor that contributed to face selection
 */
export interface FaceResolutionFactor {
  /** Factor type */
  readonly type: FaceResolutionFactorType;

  /** Human-readable description */
  readonly description: string;

  /** Contribution weight to final decision */
  readonly weight: NormalizedValue;

  /** The actual value that was evaluated */
  readonly actualValue?: unknown;

  /** The expected/threshold value */
  readonly expectedValue?: unknown;

  /** Whether this factor matched */
  readonly matched: boolean;

  /** Icon for UI display */
  readonly icon?: string;
}

export type FaceResolutionFactorType =
  | "category_match"
  | "role_match"
  | "mode_match"
  | "depth_match"
  | "intent_match"
  | "lkgc_signal"
  | "user_preference"
  | "temporal"
  | "priority"
  | "default_fallback"
  | "plugin_rule"
  | "custom";

/**
 * Explanation of a matched rule
 */
export interface MatchedRuleExplanation {
  /** The rule that matched */
  readonly rule: FaceApplicabilityRule;

  /** Which conditions specifically matched */
  readonly matchedConditions: readonly ConditionMatchExplanation[];

  /** How much this rule contributed to selection */
  readonly contributionScore: NormalizedValue;

  /** Human-readable summary */
  readonly summary: string;
}

/**
 * Explanation of an unmatched rule
 */
export interface UnmatchedRuleExplanation {
  /** The rule that didn't match */
  readonly rule: FaceApplicabilityRule;

  /** Which conditions failed */
  readonly failedConditions: readonly ConditionFailureExplanation[];

  /** Human-readable summary */
  readonly summary: string;
}

/**
 * Explanation of why a condition matched
 */
export interface ConditionMatchExplanation {
  /** The condition */
  readonly condition: ApplicabilityCondition;

  /** What was expected */
  readonly expected: string;

  /** What was found */
  readonly actual: string;

  /** Human-readable description */
  readonly description: string;
}

/**
 * Explanation of why a condition failed
 */
export interface ConditionFailureExplanation {
  /** The condition */
  readonly condition: ApplicabilityCondition;

  /** What was expected */
  readonly expected: string;

  /** What was found */
  readonly actual: string;

  /** Human-readable reason for failure */
  readonly reason: string;
}

/**
 * Explanation of an alternative face that was considered
 */
export interface AlternativeFaceExplanation {
  /** The face that was considered */
  readonly faceId: CardFaceId;
  readonly faceName: string;

  /** Why it wasn't selected */
  readonly reason: string;

  /** Score (if computed) */
  readonly score?: NormalizedValue;

  /** Rules that matched for this face */
  readonly matchedRuleCount: number;

  /** Rules that failed for this face */
  readonly failedRuleCount: number;
}

/**
 * Snapshot of the context used for resolution
 */
export interface ResolutionContextSnapshot {
  readonly categoryId?: CategoryId;
  readonly categoryName?: string;
  readonly semanticRole?: string;
  readonly modeId?: LearningModeId;
  readonly modeName?: string;
  readonly depthGoal?: CognitiveDepthLevel;
  readonly learningIntent?: CategoryIntent;
  readonly lkgcSignalsSummary?: string;
  readonly userPreferencesSummary?: string;
  readonly temporalSummary?: string;
}

// =============================================================================
// RESOLUTION RULE PLUGIN SYSTEM
// =============================================================================

/**
 * Plugin interface for custom resolution rules
 *
 * Plugins can provide custom condition evaluators and scoring logic.
 * This is the EXTENSION POINT for the resolution engine.
 */
export interface ResolutionRulePlugin {
  /** Plugin identifier */
  readonly pluginId: ResolutionRulePluginId;

  /** Human-readable name */
  readonly displayName: string;

  /** Description */
  readonly description: string;

  /** Version */
  readonly version: string;

  /** Rule types this plugin handles */
  readonly handledRuleTypes: readonly ApplicabilityRuleType[];

  /** Custom condition types this plugin provides */
  readonly customConditionTypes?: readonly CustomConditionTypeDefinition[];

  /** Schema for plugin configuration */
  readonly configSchema?: Record<string, unknown>;
}

/**
 * Definition of a custom condition type provided by a plugin
 */
export interface CustomConditionTypeDefinition {
  /** Condition type identifier */
  readonly conditionType: string;

  /** Human-readable name */
  readonly displayName: string;

  /** Description */
  readonly description: string;

  /** Schema for condition configuration */
  readonly configSchema: Record<string, unknown>;

  /** Example configurations */
  readonly examples?: readonly Record<string, unknown>[];
}

/**
 * Condition evaluator function signature
 *
 * Plugins implement this to evaluate custom conditions.
 *
 * @param condition - The condition to evaluate
 * @param context - The full resolution input context
 * @returns Evaluation result with explanation
 */
export type ConditionEvaluator = (
  condition: ApplicabilityCondition,
  context: FaceResolutionInput,
) => ConditionEvaluationResult;

/**
 * Result of evaluating a condition
 */
export interface ConditionEvaluationResult {
  /** Whether the condition matched */
  readonly matched: boolean;

  /** Confidence in the match (for fuzzy matching) */
  readonly confidence: Confidence;

  /** What was expected by the condition */
  readonly expected: string;

  /** What was actually found */
  readonly actual: string;

  /** Human-readable explanation */
  readonly explanation: string;

  /** Score contribution (0-1) */
  readonly score: NormalizedValue;
}

/**
 * Face scorer function signature
 *
 * After rules are evaluated, scores are computed for each face.
 * Plugins can contribute custom scoring logic.
 */
export type FaceScorer = (
  face: CardFaceWithRules,
  matchedRules: readonly FaceApplicabilityRule[],
  context: FaceResolutionInput,
) => FaceScoringResult;

/**
 * Result of scoring a face
 */
export interface FaceScoringResult {
  /** The face that was scored */
  readonly faceId: CardFaceId;

  /** Overall score (0-1, higher = better match) */
  readonly score: NormalizedValue;

  /** Breakdown of score components */
  readonly scoreBreakdown: readonly ScoreComponent[];

  /** Explanation of the score */
  readonly explanation: string;
}

/**
 * Component of a face score
 */
export interface ScoreComponent {
  readonly source: string;
  readonly weight: NormalizedValue;
  readonly rawScore: NormalizedValue;
  readonly weightedScore: NormalizedValue;
  readonly description: string;
}

// =============================================================================
// RESOLUTION RULE REGISTRATION
// =============================================================================

/**
 * Registration of condition evaluators by type
 */
export interface ConditionEvaluatorRegistry {
  /** Built-in evaluators by condition type */
  readonly builtIn: Record<ApplicabilityCondition["type"], ConditionEvaluator>;

  /** Plugin-provided evaluators by plugin ID and condition type */
  readonly plugins: Record<string, Record<string, ConditionEvaluator>>;
}

/**
 * Registration of face scorers
 */
export interface FaceScorerRegistry {
  /** Default scorer */
  readonly defaultScorer: FaceScorer;

  /** Additional scorers that contribute to final score */
  readonly additionalScorers: readonly NamedFaceScorer[];
}

export interface NamedFaceScorer {
  readonly name: string;
  readonly scorer: FaceScorer;
  readonly weight: NormalizedValue;
}

// =============================================================================
// ENGINE CONFIGURATION
// =============================================================================

/**
 * Configuration for the face resolution engine
 */
export interface FaceResolutionEngineConfig {
  /** Default confidence threshold */
  readonly defaultConfidenceThreshold: Confidence;

  /** Maximum rules to evaluate per face */
  readonly maxRulesPerFace: number;

  /** Default scaffolding adjustments based on LKGC signals */
  readonly scaffoldingAdjustments: ScaffoldingAdjustmentConfig;

  /** Default rendering directives */
  readonly defaultRenderingDirectives: Partial<RenderingDirectives>;

  /** Enabled plugins */
  readonly enabledPlugins: readonly ResolutionRulePluginId[];

  /** Plugin configurations */
  readonly pluginConfigs: Record<string, Record<string, unknown>>;

  /** Whether to generate full explainability by default */
  readonly defaultIncludeExplainability: boolean;

  /** Caching configuration */
  readonly caching: ResolutionCacheConfig;
}

/**
 * Configuration for scaffolding adjustments
 */
export interface ScaffoldingAdjustmentConfig {
  /** Increase scaffolding when volatility is high */
  readonly volatilityThreshold: NormalizedValue;
  readonly volatilityScaffoldingBoost: number;

  /** Increase scaffolding when confidence is low */
  readonly lowConfidenceThreshold: NormalizedValue;
  readonly lowConfidenceScaffoldingBoost: number;

  /** Decrease scaffolding when mastery is high */
  readonly highMasteryThreshold: NormalizedValue;
  readonly highMasteryScaffoldingReduction: number;

  /** Auto-reveal delay based on forgetting risk */
  readonly forgettingRiskAutoRevealEnabled: boolean;
  readonly forgettingRiskAutoRevealDelayMs: Duration;
}

/**
 * Caching configuration for resolution
 */
export interface ResolutionCacheConfig {
  /** Enable caching */
  readonly enabled: boolean;

  /** Cache TTL in milliseconds */
  readonly ttlMs: Duration;

  /** Cache key strategy */
  readonly keyStrategy: "full_context" | "card_and_category" | "card_only";

  /** Maximum cache entries */
  readonly maxEntries: number;
}

// =============================================================================
// ENGINE EVENTS - For audit trails and observability
// =============================================================================

/**
 * Event emitted when a face is resolved
 */
export interface FaceResolvedEvent {
  readonly type: "face_resolved";
  readonly timestamp: Timestamp;
  readonly requestId: ResolutionRequestId;
  readonly userId: UserId;
  readonly canonicalCardId: CanonicalCardId;
  readonly selectedFaceId: CardFaceId;
  readonly isDefaultFace: boolean;
  readonly confidence: Confidence;
  readonly resolutionTimeMs: number;
  readonly contextSummary: ResolutionContextSnapshot;
}

/**
 * Event emitted when resolution fails
 */
export interface FaceResolutionFailedEvent {
  readonly type: "face_resolution_failed";
  readonly timestamp: Timestamp;
  readonly requestId: ResolutionRequestId;
  readonly userId: UserId;
  readonly canonicalCardId: CanonicalCardId;
  readonly error: string;
  readonly contextSummary: ResolutionContextSnapshot;
}

/**
 * Event emitted when a plugin rule is evaluated
 */
export interface PluginRuleEvaluatedEvent {
  readonly type: "plugin_rule_evaluated";
  readonly timestamp: Timestamp;
  readonly requestId: ResolutionRequestId;
  readonly pluginId: ResolutionRulePluginId;
  readonly ruleType: string;
  readonly matched: boolean;
  readonly evaluationTimeMs: number;
}

/**
 * Union of resolution events
 */
export type FaceResolutionEvent =
  | FaceResolvedEvent
  | FaceResolutionFailedEvent
  | PluginRuleEvaluatedEvent;

// =============================================================================
// ENGINE INTERFACE - The contract
// =============================================================================

/**
 * Interface for the Face Resolution Engine
 *
 * This is the contract that any implementation must fulfill.
 * The engine is stateless - all state comes from the input.
 */
export interface IFaceResolutionEngine {
  /**
   * Resolve which face to show for a card given the context
   */
  resolve(input: FaceResolutionInput): Promise<FaceResolutionOutput>;

  /**
   * Resolve multiple cards in batch (for efficiency)
   */
  resolveBatch(
    inputs: readonly FaceResolutionInput[],
  ): Promise<readonly FaceResolutionOutput[]>;

  /**
   * Preview resolution without committing
   * (Returns same as resolve, but doesn't emit events)
   */
  preview(input: FaceResolutionInput): Promise<FaceResolutionOutput>;

  /**
   * Register a plugin
   */
  registerPlugin(plugin: ResolutionRulePlugin): void;

  /**
   * Register a condition evaluator
   */
  registerConditionEvaluator(
    conditionType: string,
    evaluator: ConditionEvaluator,
    pluginId?: ResolutionRulePluginId,
  ): void;

  /**
   * Register a face scorer
   */
  registerFaceScorer(scorer: NamedFaceScorer): void;

  /**
   * Get engine configuration
   */
  getConfig(): FaceResolutionEngineConfig;

  /**
   * Update engine configuration
   */
  updateConfig(config: Partial<FaceResolutionEngineConfig>): void;

  /**
   * Get registered plugins
   */
  getRegisteredPlugins(): readonly ResolutionRulePlugin[];
}

// =============================================================================
// HELPER TYPES FOR BUILDING RESOLUTION INPUTS
// =============================================================================

/**
 * Builder pattern helper for creating resolution inputs
 */
export interface FaceResolutionInputBuilder {
  forCard(cardId: CanonicalCardId): FaceResolutionInputBuilder;
  withFaces(faces: readonly CardFaceWithRules[]): FaceResolutionInputBuilder;
  withDefaultFace(faceId: CardFaceId): FaceResolutionInputBuilder;
  inCategory(context: CategoryLensContext): FaceResolutionInputBuilder;
  withParticipation(context: ParticipationContext): FaceResolutionInputBuilder;
  inMode(context: ModeContext): FaceResolutionInputBuilder;
  withLkgcSignals(signals: LkgcSignalsContext): FaceResolutionInputBuilder;
  withUserPreferences(
    prefs: UserPreferencesContext,
  ): FaceResolutionInputBuilder;
  withTemporalContext(temporal: TemporalContext): FaceResolutionInputBuilder;
  withOptions(options: ResolutionOptions): FaceResolutionInputBuilder;
  build(): FaceResolutionInput;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Default configuration values
 */
export const DEFAULT_RESOLUTION_CONFIG: FaceResolutionEngineConfig = {
  defaultConfidenceThreshold: 0.5 as Confidence,
  maxRulesPerFace: 50,
  scaffoldingAdjustments: {
    volatilityThreshold: 0.7 as NormalizedValue,
    volatilityScaffoldingBoost: 1,
    lowConfidenceThreshold: 0.3 as NormalizedValue,
    lowConfidenceScaffoldingBoost: 2,
    highMasteryThreshold: 0.9 as NormalizedValue,
    highMasteryScaffoldingReduction: 1,
    forgettingRiskAutoRevealEnabled: true,
    forgettingRiskAutoRevealDelayMs: 30000 as Duration,
  },
  defaultRenderingDirectives: {
    showContextIndicators: true,
  },
  enabledPlugins: [],
  pluginConfigs: {},
  defaultIncludeExplainability: true,
  caching: {
    enabled: true,
    ttlMs: 60000 as Duration, // 1 minute
    keyStrategy: "card_and_category",
    maxEntries: 1000,
  },
};

/**
 * Depth level ordering (for comparison)
 */
export const DEPTH_LEVEL_ORDER: Record<CognitiveDepthLevel, number> = {
  recognition: 0,
  recall: 1,
  understanding: 2,
  application: 3,
  analysis: 4,
  synthesis: 5,
  evaluation: 6,
};
