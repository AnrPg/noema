// =============================================================================
// CANONICAL CARD CORE & CONTEXT-SENSITIVE FACE ABSTRACTIONS
// =============================================================================
// Phase 6A: Multi-Faceted Cards
//
// CORE PRINCIPLES:
// 1. Cards exist ONCE canonically - no duplication or fragmentation
// 2. Faces are context-sensitive overlays, NOT separate cards
// 3. The same canonical card can be viewed through multiple faces
// 4. Face selection is declarative and rule-based (resolved elsewhere)
// 5. All interfaces support LLM agent consumption (clean inputs/outputs)
//
// This module defines:
// - Canonical Card Core (identity, content primitives, global state hooks)
// - Face Abstraction (first-class, non-duplicative overlays)
// - Face Applicability Rules (category, role, mode, depth bindings)
// - Forward-compatible structures for AI-generated faces
// =============================================================================

import type { CardId, UserId, TagId } from "./user.types";
import type { CategoryId, ViewLens, SemanticRole } from "./ecosystem.types";
import type { LearningModeId } from "./learning-mode.types";
import type { ExtendedSemanticRole } from "./multi-belonging.types";
import type {
  Timestamp,
  Duration,
  Confidence,
  NormalizedValue,
} from "./lkgc/foundation";

// =============================================================================
// IDENTIFIERS
// =============================================================================

/** Unique identifier for a canonical card */
export type CanonicalCardId = CardId;

/** Unique identifier for a card face */
export type CardFaceId = string & { readonly __brand: "CardFaceId" };

/** Unique identifier for a face applicability rule */
export type FaceApplicabilityRuleId = string & {
  readonly __brand: "FaceApplicabilityRuleId";
};

/** Unique identifier for a content primitive */
export type ContentPrimitiveId = string & {
  readonly __brand: "ContentPrimitiveId";
};

/** Unique identifier for a face version */
export type FaceVersionId = string & { readonly __brand: "FaceVersionId" };

// =============================================================================
// CONTENT PRIMITIVES - Stable, reusable content blocks
// =============================================================================

/**
 * Content primitive types - the building blocks of card content
 * These are stable, portable, and can be referenced by multiple faces
 */
export type ContentPrimitiveType =
  | "text" // Plain or rich text
  | "markdown" // Markdown-formatted text
  | "html" // HTML content (sanitized)
  | "latex" // LaTeX mathematical notation
  | "code" // Code with syntax highlighting
  | "image" // Image with optional regions
  | "audio" // Audio content
  | "video" // Video content
  | "cloze_region" // Deletable region within text
  | "formula" // Mathematical formula
  | "diagram" // Structured diagram (mermaid, etc.)
  | "table" // Tabular data
  | "list" // Ordered or unordered list
  | "quote" // Blockquote
  | "callout" // Callout/admonition
  | "embed"; // Embedded external content

/**
 * Base interface for all content primitives
 */
export interface ContentPrimitiveBase {
  readonly id: ContentPrimitiveId;
  readonly type: ContentPrimitiveType;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;

  /** Optional label for referencing this primitive */
  readonly label?: string;

  /** Accessibility description */
  readonly altText?: string;

  /** Plugin that created this primitive (if any) */
  readonly sourcePluginId?: string;
}

/**
 * Text content primitive
 */
export interface TextPrimitive extends ContentPrimitiveBase {
  readonly type: "text";
  readonly content: string;
  readonly format: "plain" | "rich";
  readonly language?: string; // For internationalization
}

/**
 * Markdown content primitive
 */
export interface MarkdownPrimitive extends ContentPrimitiveBase {
  readonly type: "markdown";
  readonly content: string;
  readonly allowHtml: boolean;
}

/**
 * LaTeX content primitive
 */
export interface LatexPrimitive extends ContentPrimitiveBase {
  readonly type: "latex";
  readonly content: string;
  readonly displayMode: "inline" | "block";
}

/**
 * Code content primitive
 */
export interface CodePrimitive extends ContentPrimitiveBase {
  readonly type: "code";
  readonly content: string;
  readonly language: string;
  readonly highlightLines?: readonly number[];
  readonly showLineNumbers: boolean;
}

/**
 * Image content primitive with optional annotatable regions
 */
export interface ImagePrimitive extends ContentPrimitiveBase {
  readonly type: "image";
  readonly url: string;
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;

  /** Named regions that can be referenced by faces */
  readonly regions?: readonly ImageRegion[];
}

/**
 * A named region within an image
 */
export interface ImageRegion {
  readonly id: string;
  readonly label: string;
  readonly shape: "rect" | "circle" | "polygon";
  readonly coordinates: readonly number[]; // Shape-dependent
  readonly metadata?: Record<string, unknown>;
}

/**
 * Audio content primitive
 */
export interface AudioPrimitive extends ContentPrimitiveBase {
  readonly type: "audio";
  readonly url: string;
  readonly mimeType: string;
  readonly durationMs?: number;
  readonly transcript?: string;

  /** Named segments for reference */
  readonly segments?: readonly AudioSegment[];
}

/**
 * A named segment within audio
 */
export interface AudioSegment {
  readonly id: string;
  readonly label: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly transcript?: string;
}

/**
 * Cloze region primitive - a deletable region for cloze-style testing
 */
export interface ClozeRegionPrimitive extends ContentPrimitiveBase {
  readonly type: "cloze_region";

  /** The full text including cloze markers */
  readonly fullText: string;

  /** Individual cloze deletions */
  readonly clozes: readonly ClozeDefinition[];
}

/**
 * A single cloze deletion definition
 */
export interface ClozeDefinition {
  readonly id: string;
  readonly answer: string;
  readonly hint?: string;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly alternativeAnswers?: readonly string[];
  readonly difficulty?: NormalizedValue;
}

/**
 * Formula content primitive (for non-LaTeX formulas)
 */
export interface FormulaPrimitive extends ContentPrimitiveBase {
  readonly type: "formula";
  readonly notation: "latex" | "mathml" | "asciimath";
  readonly content: string;
  readonly displayMode: "inline" | "block";
}

/**
 * Union of all content primitives
 */
export type ContentPrimitive =
  | TextPrimitive
  | MarkdownPrimitive
  | LatexPrimitive
  | CodePrimitive
  | ImagePrimitive
  | AudioPrimitive
  | ClozeRegionPrimitive
  | FormulaPrimitive;

// =============================================================================
// CANONICAL CARD CORE - The single source of truth
// =============================================================================

/**
 * Canonical card - the single, authoritative representation of a card
 *
 * INVARIANTS:
 * - Each card has exactly ONE canonical representation
 * - Content primitives are stable and can be referenced by faces
 * - Global scheduling state lives here (compatible with FSRS/HLR)
 * - Global learning history is tracked here
 * - Faces REFERENCE this core, they don't duplicate it
 */
export interface CanonicalCard {
  readonly id: CanonicalCardId;
  readonly userId: UserId;

  // =========================================================================
  // CONTENT PRIMITIVES - The stable building blocks
  // =========================================================================

  /**
   * Primary content primitives that make up this card
   * These are the "atoms" that faces can reference and arrange
   */
  readonly contentPrimitives: readonly ContentPrimitive[];

  /**
   * Default content layout - how primitives are arranged by default
   * Faces can override this arrangement
   */
  readonly defaultLayout: CardContentLayout;

  // =========================================================================
  // CARD TYPE & METADATA
  // =========================================================================

  /**
   * Primary card type - affects rendering and interaction
   * This is the "structural" type, not the pedagogical face type
   */
  readonly structuralType: CanonicalCardStructuralType;

  /** Tags for organization and filtering */
  readonly tags: readonly TagId[];

  /** Optional notes about this card */
  readonly notes?: string;

  /** Source of this card (import, manual, AI-generated, etc.) */
  readonly source?: CardSource;

  // =========================================================================
  // GLOBAL SCHEDULING STATE - Single source of truth for SRS
  // =========================================================================

  /**
   * Global scheduling state - NOT duplicated per face
   * Individual faces may contribute to this state via transfer rules
   */
  readonly schedulingState: GlobalSchedulingState;

  // =========================================================================
  // GLOBAL LEARNING HISTORY HOOKS - Interfaces for history tracking
  // =========================================================================

  /**
   * Summary of global learning history
   * Detailed history is stored separately and queried on demand
   */
  readonly historySnapshot: LearningHistorySnapshot;

  // =========================================================================
  // FACE REGISTRY - References to all faces for this card
  // =========================================================================

  /**
   * IDs of all faces defined for this card
   * Actual face definitions are stored separately for query efficiency
   */
  readonly faceIds: readonly CardFaceId[];

  /**
   * ID of the default face (shown when no context-specific face applies)
   */
  readonly defaultFaceId: CardFaceId;

  // =========================================================================
  // PROVENANCE & VERSIONING
  // =========================================================================

  /** When the card was created */
  readonly createdAt: Timestamp;

  /** Last modification timestamp */
  readonly updatedAt: Timestamp;

  /** Version number for optimistic concurrency */
  readonly version: number;

  /** Whether this card is archived (soft delete) */
  readonly isArchived: boolean;

  /** Whether this card is suspended from review */
  readonly isSuspended: boolean;
  readonly suspendReason?: string;
}

/**
 * Structural card types - how the card is fundamentally structured
 * This is distinct from pedagogical face types
 */
export type CanonicalCardStructuralType =
  | "single_primitive" // Single content primitive (simple text, image, etc.)
  | "multi_primitive" // Multiple primitives that form a unit
  | "cloze_based" // Built around cloze deletions
  | "media_primary" // Media (image/audio/video) is the primary content
  | "composite"; // Complex arrangement of multiple primitive types

/**
 * Card source information - where this card came from
 */
export interface CardSource {
  readonly type: CardSourceType;
  readonly pluginId?: string;
  readonly importId?: string;
  readonly originalId?: string;
  readonly url?: string;
  readonly createdBy: "user" | "ai" | "import" | "plugin";
  readonly aiModel?: string;
  readonly aiPromptHash?: string;
}

export type CardSourceType =
  | "manual" // User-created
  | "import" // Imported from external source
  | "ai_generated" // Generated by AI
  | "plugin" // Created by plugin
  | "split" // Created from card split
  | "merge" // Created from card merge
  | "template"; // Created from template

/**
 * Default layout for card content
 */
export interface CardContentLayout {
  /** How primitives are arranged */
  readonly arrangement: "sequential" | "side_by_side" | "grid" | "custom";

  /** Order of primitive IDs */
  readonly primitiveOrder: readonly ContentPrimitiveId[];

  /** For custom arrangements, detailed layout spec */
  readonly customLayout?: CustomLayoutSpec;
}

/**
 * Custom layout specification (for complex arrangements)
 */
export interface CustomLayoutSpec {
  readonly type: "flex" | "grid" | "absolute";
  readonly config: Record<string, unknown>;
}

// =============================================================================
// GLOBAL SCHEDULING STATE - Unified SRS state
// =============================================================================

/**
 * Global scheduling state - the single source of truth for SRS
 *
 * This is compatible with both FSRS and HLR algorithms.
 * Face-level performance contributes to this state via configurable
 * transfer rules (implemented elsewhere).
 */
export interface GlobalSchedulingState {
  /** Current learning state */
  readonly state: CardLearningState;

  /** Stability parameter (FSRS) */
  readonly stability: number;

  /** Difficulty parameter (FSRS/HLR) */
  readonly difficulty: NormalizedValue;

  /** Days elapsed since last review */
  readonly elapsedDays: number;

  /** Scheduled interval in days */
  readonly scheduledDays: number;

  /** Total repetitions */
  readonly reps: number;

  /** Total lapses (forgetting events) */
  readonly lapses: number;

  /** Last review date */
  readonly lastReviewDate?: Timestamp;

  /** Next scheduled review date */
  readonly nextReviewDate?: Timestamp;

  /** HLR-specific: half-life in days */
  readonly halfLife?: number;

  /** HLR-specific: theta vector */
  readonly thetaVector?: readonly number[];

  /** Last algorithm used */
  readonly algorithmType: "fsrs" | "hlr" | "sm2" | "custom";

  /** Algorithm version for compatibility */
  readonly algorithmVersion: string;
}

export type CardLearningState =
  | "new" // Never reviewed
  | "learning" // In initial learning phase
  | "review" // In regular review rotation
  | "relearning" // Relearning after lapse
  | "mastered"; // Achieved mastery threshold

/**
 * Snapshot of learning history for quick access
 * Detailed history is stored separately
 */
export interface LearningHistorySnapshot {
  /** Total reviews across all faces */
  readonly totalReviews: number;

  /** Correct reviews across all faces */
  readonly correctReviews: number;

  /** Average response time in milliseconds */
  readonly avgResponseTimeMs: number;

  /** Overall retention rate */
  readonly retentionRate: NormalizedValue;

  /** First review date */
  readonly firstReviewDate?: Timestamp;

  /** Most recent review date */
  readonly mostRecentReviewDate?: Timestamp;

  /** Number of faces that have been reviewed */
  readonly facesReviewed: number;
}

// =============================================================================
// CARD FACE ABSTRACTION - Context-sensitive overlays
// =============================================================================

/**
 * Card Face - A context-sensitive interpretation of a canonical card
 *
 * CORE PRINCIPLES:
 * - Faces are OVERLAYS, not duplicates
 * - Same canonical card can have multiple faces
 * - Faces reference canonical content, they don't copy it
 * - Face selection is declarative and rule-based
 * - Faces are version-safe and forward-compatible with AI generation
 *
 * A face defines:
 * - HOW to present the canonical content (layout, emphasis, scaffolding)
 * - WHAT question to ask (prompt phrasing, depth level)
 * - WHAT response is expected (output type, evaluation criteria)
 * - WHEN this face applies (applicability rules)
 */
export interface CardFace {
  readonly id: CardFaceId;

  /** The canonical card this face belongs to */
  readonly canonicalCardId: CanonicalCardId;

  // =========================================================================
  // FACE IDENTITY
  // =========================================================================

  /** Human-readable name for this face */
  readonly name: string;

  /** Description of what this face tests/teaches */
  readonly description?: string;

  /** Face type - the pedagogical approach */
  readonly faceType: CardFaceType;

  /** Cognitive depth this face targets */
  readonly depthLevel: CognitiveDepthLevel;

  // =========================================================================
  // CONTENT PRESENTATION
  // =========================================================================

  /**
   * How to present the question/prompt
   * References canonical primitives or provides overrides
   */
  readonly questionPresentation: FaceContentPresentation;

  /**
   * How to present the answer/response
   * References canonical primitives or provides overrides
   */
  readonly answerPresentation: FaceContentPresentation;

  /**
   * Optional scaffolding/hints
   */
  readonly scaffolding?: FaceScaffolding;

  // =========================================================================
  // EXPECTED OUTPUT
  // =========================================================================

  /**
   * What type of response is expected from the learner
   */
  readonly expectedOutputType: ExpectedOutputType;

  /**
   * Evaluation criteria for the response
   */
  readonly evaluationCriteria?: EvaluationCriteria;

  // =========================================================================
  // APPLICABILITY RULES - When does this face apply?
  // =========================================================================

  /**
   * Rules that determine when this face should be selected
   * Face resolution engine uses these rules to pick faces
   */
  readonly applicabilityRules: readonly FaceApplicabilityRule[];

  /**
   * Priority for rule conflicts (higher = preferred)
   */
  readonly priority: number;

  // =========================================================================
  // MASTERY TRANSFER
  // =========================================================================

  /**
   * How performance on this face transfers to the canonical card
   * and to other faces
   */
  readonly masteryTransferConfig: MasteryTransferConfig;

  // =========================================================================
  // FACE-LEVEL TRACKING
  // =========================================================================

  /**
   * Summary of face-specific performance
   * Detailed history is stored separately
   */
  readonly facePerformanceSnapshot: FacePerformanceSnapshot;

  // =========================================================================
  // PROVENANCE & VERSIONING
  // =========================================================================

  /** How this face was created */
  readonly source: FaceSource;

  /** Current version */
  readonly version: FaceVersionId;

  /** Version history references */
  readonly previousVersions?: readonly FaceVersionId[];

  /** Creation timestamp */
  readonly createdAt: Timestamp;

  /** Last update timestamp */
  readonly updatedAt: Timestamp;

  /** Whether this face is active */
  readonly isActive: boolean;

  /** Whether this is the default face for its canonical card */
  readonly isDefault: boolean;
}

/**
 * Face types - the pedagogical approach of the face
 */
export type CardFaceType =
  // Recognition-level faces
  | "recognition" // "Which of these is X?"
  | "true_false" // "Is this statement true?"
  | "matching" // "Match A to B"

  // Recall-level faces
  | "definition" // "Define X"
  | "recall" // "What is X?"
  | "cloze" // "Fill in the blank"

  // Application-level faces
  | "application" // "Apply X to situation Y"
  | "problem_solving" // "Solve this problem using X"
  | "derivation" // "Derive X from first principles"
  | "explanation" // "Explain why X"

  // Synthesis-level faces
  | "synthesis" // "Integrate X and Y"
  | "comparison" // "Compare X and Y"
  | "critique" // "Critique argument X"
  | "transfer" // "Apply X to novel domain"

  // Meta-level faces
  | "intuition" // "What's your intuition about X?"
  | "self_assessment" // "Rate your confidence in X"
  | "teaching" // "Explain X as if teaching"

  // Custom/plugin-defined
  | "custom";

/**
 * Cognitive depth levels (Bloom's taxonomy inspired)
 */
export type CognitiveDepthLevel =
  | "recognition" // Identify, recognize
  | "recall" // Remember, retrieve
  | "understanding" // Explain, interpret
  | "application" // Apply, use
  | "analysis" // Analyze, differentiate
  | "synthesis" // Create, integrate
  | "evaluation"; // Critique, judge

/**
 * How face content references or overrides canonical content
 */
export interface FaceContentPresentation {
  /** Strategy for content selection */
  readonly strategy: ContentPresentationStrategy;

  /**
   * Which canonical primitives to include (for reference/subset strategies)
   */
  readonly primitiveRefs?: readonly PrimitiveReference[];

  /**
   * Override content (for override/augment strategies)
   */
  readonly overrideContent?: readonly ContentPrimitive[];

  /**
   * Additional text to prepend/append
   */
  readonly wrapperText?: {
    readonly prefix?: string;
    readonly suffix?: string;
  };

  /**
   * Layout override for this presentation
   */
  readonly layoutOverride?: CardContentLayout;

  /**
   * Emphasis hints for rendering
   */
  readonly emphasisHints?: readonly EmphasisHint[];
}

/**
 * Strategy for how face content relates to canonical content
 */
export type ContentPresentationStrategy =
  | "reference_all" // Use all canonical primitives as-is
  | "reference_subset" // Use specific primitives
  | "override" // Replace with face-specific content
  | "augment" // Canonical + additional content
  | "transform"; // Apply transformation to canonical content

/**
 * Reference to a canonical content primitive
 */
export interface PrimitiveReference {
  readonly primitiveId: ContentPrimitiveId;

  /** Optional transformation to apply */
  readonly transform?: PrimitiveTransform;

  /** Display order within this presentation */
  readonly order: number;
}

/**
 * Transformation to apply to a referenced primitive
 */
export interface PrimitiveTransform {
  readonly type:
    | "none"
    | "hide_clozes"
    | "reveal_clozes"
    | "highlight"
    | "redact"
    | "custom";
  readonly config?: Record<string, unknown>;
}

/**
 * Emphasis hint for rendering
 */
export interface EmphasisHint {
  readonly primitiveId?: ContentPrimitiveId;
  readonly type: "highlight" | "dim" | "annotate" | "focus";
  readonly value?: string;
}

/**
 * Scaffolding for a face - progressive hints and support
 */
export interface FaceScaffolding {
  /** Scaffolding level (0 = none, higher = more support) */
  readonly level: number;

  /** Progressive hints */
  readonly hints: readonly ScaffoldingHint[];

  /** Whether to auto-reveal hints on struggle */
  readonly autoRevealOnStruggle: boolean;

  /** Partial answer templates */
  readonly partialTemplates?: readonly string[];
}

/**
 * A single scaffolding hint
 */
export interface ScaffoldingHint {
  readonly id: string;
  readonly content: string;
  readonly revealOrder: number;
  readonly costToReveal?: NormalizedValue; // Penalty for revealing
}

/**
 * Expected output type from learner
 */
export type ExpectedOutputType =
  | "none" // Just reveal answer
  | "binary" // Correct/incorrect self-assessment
  | "rating" // Confidence rating
  | "selection" // Multiple choice
  | "text_exact" // Exact text match
  | "text_fuzzy" // Fuzzy text match
  | "text_semantic" // Semantic similarity
  | "spoken" // Speech recognition
  | "drawn" // Drawing/diagram
  | "ordered" // Sequence ordering
  | "custom";

/**
 * Evaluation criteria for responses
 */
export interface EvaluationCriteria {
  readonly type: "exact" | "fuzzy" | "semantic" | "rubric" | "custom";

  /** For exact/fuzzy: acceptable answers */
  readonly acceptedAnswers?: readonly string[];

  /** For fuzzy: similarity threshold */
  readonly similarityThreshold?: NormalizedValue;

  /** For rubric: evaluation rubric */
  readonly rubric?: EvaluationRubric;

  /** For semantic: embedding model to use */
  readonly embeddingModel?: string;
}

/**
 * Evaluation rubric for complex responses
 */
export interface EvaluationRubric {
  readonly criteria: readonly RubricCriterion[];
  readonly passingScore: NormalizedValue;
}

export interface RubricCriterion {
  readonly id: string;
  readonly description: string;
  readonly weight: NormalizedValue;
  readonly levels: readonly RubricLevel[];
}

export interface RubricLevel {
  readonly score: NormalizedValue;
  readonly description: string;
}

// =============================================================================
// FACE APPLICABILITY RULES - When does a face apply?
// =============================================================================

/**
 * Rule that determines when a face should be selected
 *
 * Rules are declarative and composable:
 * - AND conditions must all be true
 * - OR conditions need at least one true
 * - NOT conditions must be false
 *
 * This structure is designed to be:
 * - Machine-readable for resolution engine
 * - Human-readable for explainability
 * - Extensible via plugins
 * - Compatible with AI rule generation
 */
export interface FaceApplicabilityRule {
  readonly id: FaceApplicabilityRuleId;

  /** Human-readable description */
  readonly description: string;

  /** Rule type */
  readonly type: ApplicabilityRuleType;

  /** Rule conditions */
  readonly conditions: ApplicabilityConditionSet;

  /** Priority (higher = checked first) */
  readonly priority: number;

  /** Whether this rule is active */
  readonly isActive: boolean;

  /** Source of this rule */
  readonly source: "manual" | "ai_suggested" | "plugin";

  /** Confidence in this rule (for AI-generated) */
  readonly confidence?: Confidence;
}

export type ApplicabilityRuleType =
  | "category_binding" // Bound to specific categories
  | "role_binding" // Bound to participation roles
  | "mode_binding" // Bound to learning modes
  | "depth_binding" // Bound to depth goals
  | "intent_binding" // Bound to category intents
  | "lkgc_signal" // Based on LKGC metacognitive signals
  | "user_preference" // Based on user preferences
  | "temporal" // Time-based rules
  | "composite" // Combination of other rules
  | "custom"; // Plugin-defined

/**
 * Set of conditions (AND/OR/NOT composable)
 */
export interface ApplicabilityConditionSet {
  readonly operator: "and" | "or";
  readonly conditions: readonly ApplicabilityCondition[];
  readonly negated?: boolean;
}

/**
 * A single applicability condition
 */
export type ApplicabilityCondition =
  | CategoryCondition
  | RoleCondition
  | ModeCondition
  | DepthCondition
  | IntentCondition
  | LkgcSignalCondition
  | UserPreferenceCondition
  | TemporalCondition
  | CompositeCondition
  | CustomCondition;

/**
 * Condition based on category
 */
export interface CategoryCondition {
  readonly type: "category";
  readonly categoryIds?: readonly CategoryId[];
  readonly categoryPattern?: string; // Regex or glob pattern
  readonly includeDescendants?: boolean;
}

/**
 * Condition based on participation role
 */
export interface RoleCondition {
  readonly type: "role";
  readonly roles: readonly (SemanticRole | ExtendedSemanticRole)[];
  readonly requireAll?: boolean;
}

/**
 * Condition based on active learning mode
 */
export interface ModeCondition {
  readonly type: "mode";
  readonly modeIds?: readonly LearningModeId[];
  readonly modeTypes?: readonly string[];
}

/**
 * Condition based on depth goal
 */
export interface DepthCondition {
  readonly type: "depth";
  readonly targetDepths: readonly CognitiveDepthLevel[];
  readonly minDepth?: CognitiveDepthLevel;
  readonly maxDepth?: CognitiveDepthLevel;
}

/**
 * Condition based on category intent
 */
export interface IntentCondition {
  readonly type: "intent";
  readonly intents: readonly CategoryIntent[];
}

export type CategoryIntent =
  | "foundational" // Building core knowledge
  | "contextual" // Situational understanding
  | "reference" // Quick lookup
  | "exploratory" // Discovery and exploration
  | "exam_prep"; // Test preparation

/**
 * Condition based on LKGC metacognitive signals
 *
 * NOTE: This is the interface only - LKGC computation is implemented elsewhere
 */
export interface LkgcSignalCondition {
  readonly type: "lkgc_signal";
  readonly signal: LkgcSignalType;
  readonly operator: "gt" | "lt" | "eq" | "gte" | "lte" | "between";
  readonly threshold: NormalizedValue;
  readonly upperThreshold?: NormalizedValue; // For "between"
}

export type LkgcSignalType =
  | "confidence"
  | "volatility"
  | "interference"
  | "coherence"
  | "stability"
  | "recency"
  | "frequency"
  | "contextual_strength";

/**
 * Condition based on user preferences
 */
export interface UserPreferenceCondition {
  readonly type: "user_preference";
  readonly preferenceKey: string;
  readonly operator: "eq" | "in" | "not_in" | "contains";
  readonly value: unknown;
}

/**
 * Temporal condition
 */
export interface TemporalCondition {
  readonly type: "temporal";
  readonly timeConstraint: TimeConstraint;
}

export interface TimeConstraint {
  readonly type: "time_of_day" | "day_of_week" | "date_range" | "relative";
  readonly config: Record<string, unknown>;
}

/**
 * Composite condition (nested)
 */
export interface CompositeCondition {
  readonly type: "composite";
  readonly conditionSet: ApplicabilityConditionSet;
}

/**
 * Custom condition (plugin-defined)
 */
export interface CustomCondition {
  readonly type: "custom";
  readonly pluginId: string;
  readonly conditionType: string;
  readonly config: Record<string, unknown>;
}

// =============================================================================
// MASTERY TRANSFER CONFIGURATION
// =============================================================================

/**
 * Configuration for how face performance transfers to canonical card
 * and to other faces
 */
export interface MasteryTransferConfig {
  /**
   * Weight for contributing to canonical card's global state
   * 1.0 = full contribution, 0.0 = no contribution
   */
  readonly globalContributionWeight: NormalizedValue;

  /**
   * Which other faces receive partial transfer from this face
   */
  readonly crossFaceTransfer: readonly CrossFaceTransferRule[];

  /**
   * Whether this face can establish mastery independently
   */
  readonly canEstablishMastery: boolean;

  /**
   * Minimum reviews on this face before transfer applies
   */
  readonly minReviewsForTransfer: number;
}

/**
 * Rule for transferring mastery between faces
 */
export interface CrossFaceTransferRule {
  readonly targetFaceId: CardFaceId;
  readonly transferWeight: NormalizedValue;
  readonly transferDirection: "unidirectional" | "bidirectional";
  readonly requiresSameDepthOrLower: boolean;
}

// =============================================================================
// FACE PERFORMANCE TRACKING
// =============================================================================

/**
 * Snapshot of face-specific performance
 */
export interface FacePerformanceSnapshot {
  /** Times this specific face was shown */
  readonly timesShown: number;

  /** Correct responses on this face */
  readonly timesCorrect: number;

  /** Success rate on this face */
  readonly successRate: NormalizedValue;

  /** Average response time on this face */
  readonly avgResponseTimeMs: number;

  /** Last time this face was shown */
  readonly lastShownAt?: Timestamp;

  /** Estimated mastery for this face */
  readonly estimatedMastery: NormalizedValue;
}

// =============================================================================
// FACE PROVENANCE
// =============================================================================

/**
 * How a face was created
 */
export interface FaceSource {
  readonly type: FaceSourceType;
  readonly createdBy: "user" | "ai" | "plugin" | "system";

  /** For AI-generated: model used */
  readonly aiModel?: string;

  /** For AI-generated: prompt hash for reproducibility */
  readonly aiPromptHash?: string;

  /** For plugin-generated: plugin ID */
  readonly pluginId?: string;

  /** Human who approved (if AI/plugin created) */
  readonly approvedBy?: UserId;
  readonly approvedAt?: Timestamp;

  /** Original face this was derived from */
  readonly derivedFromFaceId?: CardFaceId;
}

export type FaceSourceType =
  | "manual" // User-created
  | "ai_generated" // AI-generated (requires approval workflow)
  | "ai_suggested" // AI-suggested (pending approval)
  | "plugin" // Plugin-created
  | "system" // System-generated (e.g., default face)
  | "derived" // Derived from another face
  | "import"; // Imported

// =============================================================================
// API INPUT/OUTPUT TYPES - Clean interfaces for LLM agent consumption
// =============================================================================

/**
 * Input for creating a canonical card
 */
export interface CreateCanonicalCardInput {
  readonly contentPrimitives: readonly ContentPrimitive[];
  readonly defaultLayout?: CardContentLayout;
  readonly structuralType: CanonicalCardStructuralType;
  readonly tags?: readonly TagId[];
  readonly notes?: string;
  readonly source?: CardSource;

  /** Optional: create initial face along with card */
  readonly initialFace?: CreateCardFaceInput;
}

/**
 * Input for updating a canonical card
 */
export interface UpdateCanonicalCardInput {
  readonly cardId: CanonicalCardId;
  readonly contentPrimitives?: readonly ContentPrimitive[];
  readonly defaultLayout?: CardContentLayout;
  readonly tags?: readonly TagId[];
  readonly notes?: string;
  readonly isArchived?: boolean;
  readonly isSuspended?: boolean;
  readonly suspendReason?: string;
}

/**
 * Input for creating a card face
 */
export interface CreateCardFaceInput {
  readonly canonicalCardId: CanonicalCardId;
  readonly name: string;
  readonly description?: string;
  readonly faceType: CardFaceType;
  readonly depthLevel: CognitiveDepthLevel;
  readonly questionPresentation: FaceContentPresentation;
  readonly answerPresentation: FaceContentPresentation;
  readonly scaffolding?: FaceScaffolding;
  readonly expectedOutputType: ExpectedOutputType;
  readonly evaluationCriteria?: EvaluationCriteria;
  readonly applicabilityRules?: readonly FaceApplicabilityRule[];
  readonly priority?: number;
  readonly masteryTransferConfig?: Partial<MasteryTransferConfig>;
  readonly isDefault?: boolean;
  readonly source?: FaceSource;
}

/**
 * Input for updating a card face
 */
export interface UpdateCardFaceInput {
  readonly faceId: CardFaceId;
  readonly name?: string;
  readonly description?: string;
  readonly faceType?: CardFaceType;
  readonly depthLevel?: CognitiveDepthLevel;
  readonly questionPresentation?: FaceContentPresentation;
  readonly answerPresentation?: FaceContentPresentation;
  readonly scaffolding?: FaceScaffolding;
  readonly expectedOutputType?: ExpectedOutputType;
  readonly evaluationCriteria?: EvaluationCriteria;
  readonly applicabilityRules?: readonly FaceApplicabilityRule[];
  readonly priority?: number;
  readonly masteryTransferConfig?: Partial<MasteryTransferConfig>;
  readonly isActive?: boolean;
}

/**
 * Input for adding applicability rules to a face
 */
export interface AddFaceApplicabilityRulesInput {
  readonly faceId: CardFaceId;
  readonly rules: readonly Omit<FaceApplicabilityRule, "id">[];
}

/**
 * Input for recording face performance
 */
export interface RecordFacePerformanceInput {
  readonly faceId: CardFaceId;
  readonly canonicalCardId: CanonicalCardId;
  readonly isCorrect: boolean;
  readonly responseTimeMs: number;
  readonly confidenceRating?: NormalizedValue;
  readonly contextCategoryId?: CategoryId;
  readonly contextModeId?: LearningModeId;
}

/**
 * Output: Face query by context (for face resolution)
 * Note: Face resolution logic is implemented elsewhere
 */
export interface FaceQueryContext {
  readonly canonicalCardId: CanonicalCardId;
  readonly categoryId?: CategoryId;
  readonly participationRole?: SemanticRole | ExtendedSemanticRole;
  readonly modeId?: LearningModeId;
  readonly targetDepth?: CognitiveDepthLevel;
  readonly lkgcSignals?: Record<LkgcSignalType, NormalizedValue>;
  readonly userPreferences?: Record<string, unknown>;
}

/**
 * Result of querying faces for a card
 */
export interface FaceQueryResult {
  readonly faces: readonly CardFace[];
  readonly defaultFace: CardFace;
  readonly totalCount: number;
}

// =============================================================================
// EVENTS - For audit trails and agent consumption
// =============================================================================

/**
 * Event emitted when a card is created
 */
export interface CanonicalCardCreatedEvent {
  readonly type: "canonical_card_created";
  readonly timestamp: Timestamp;
  readonly userId: UserId;
  readonly cardId: CanonicalCardId;
  readonly source: CardSource;
}

/**
 * Event emitted when a card is updated
 */
export interface CanonicalCardUpdatedEvent {
  readonly type: "canonical_card_updated";
  readonly timestamp: Timestamp;
  readonly userId: UserId;
  readonly cardId: CanonicalCardId;
  readonly changedFields: readonly string[];
  readonly previousVersion: number;
  readonly newVersion: number;
}

/**
 * Event emitted when a face is created
 */
export interface CardFaceCreatedEvent {
  readonly type: "card_face_created";
  readonly timestamp: Timestamp;
  readonly userId: UserId;
  readonly faceId: CardFaceId;
  readonly canonicalCardId: CanonicalCardId;
  readonly source: FaceSource;
}

/**
 * Event emitted when a face is updated
 */
export interface CardFaceUpdatedEvent {
  readonly type: "card_face_updated";
  readonly timestamp: Timestamp;
  readonly userId: UserId;
  readonly faceId: CardFaceId;
  readonly changedFields: readonly string[];
  readonly previousVersion: FaceVersionId;
  readonly newVersion: FaceVersionId;
}

/**
 * Event emitted when face performance is recorded
 */
export interface FacePerformanceRecordedEvent {
  readonly type: "face_performance_recorded";
  readonly timestamp: Timestamp;
  readonly userId: UserId;
  readonly faceId: CardFaceId;
  readonly canonicalCardId: CanonicalCardId;
  readonly isCorrect: boolean;
  readonly responseTimeMs: number;
  readonly contextCategoryId?: CategoryId;
  readonly contextModeId?: LearningModeId;
}

/**
 * Union of all card/face events
 */
export type CanonicalCardEvent =
  | CanonicalCardCreatedEvent
  | CanonicalCardUpdatedEvent
  | CardFaceCreatedEvent
  | CardFaceUpdatedEvent
  | FacePerformanceRecordedEvent;

// =============================================================================
// EXPLAINABILITY INTERFACES - Why this face was chosen
// =============================================================================

/**
 * Explanation of why a face was selected
 * This is the OUTPUT of face resolution (resolution logic is elsewhere)
 */
export interface FaceSelectionExplanation {
  readonly selectedFaceId: CardFaceId;
  readonly canonicalCardId: CanonicalCardId;

  /** Rules that matched */
  readonly matchedRules: readonly MatchedApplicabilityRule[];

  /** Rules that were checked but didn't match */
  readonly unmatchedRules: readonly UnmatchedApplicabilityRule[];

  /** Context that was used for resolution */
  readonly resolutionContext: FaceQueryContext;

  /** Human-readable summary */
  readonly summary: string;

  /** Timestamp of resolution */
  readonly resolvedAt: Timestamp;
}

/**
 * A rule that matched during face selection
 */
export interface MatchedApplicabilityRule {
  readonly rule: FaceApplicabilityRule;
  readonly matchedConditions: readonly string[]; // Descriptions of what matched
  readonly contributionToSelection: NormalizedValue;
}

/**
 * A rule that didn't match during face selection
 */
export interface UnmatchedApplicabilityRule {
  readonly rule: FaceApplicabilityRule;
  readonly failedConditions: readonly string[]; // Descriptions of what failed
}

// =============================================================================
// PLUGIN EXTENSION POINTS
// =============================================================================

/**
 * Plugin interface for custom face types
 */
export interface FaceTypePlugin {
  readonly pluginId: string;
  readonly faceType: string;
  readonly displayName: string;
  readonly description: string;

  /** Schema for face-type-specific configuration */
  readonly configSchema: Record<string, unknown>;

  /** Render hints for UI */
  readonly renderHints: FaceTypeRenderHints;
}

/**
 * Render hints for custom face types
 */
export interface FaceTypeRenderHints {
  readonly questionComponent?: string;
  readonly answerComponent?: string;
  readonly inputComponent?: string;
  readonly evaluationComponent?: string;
}

/**
 * Plugin interface for custom applicability rules
 */
export interface ApplicabilityRulePlugin {
  readonly pluginId: string;
  readonly ruleType: string;
  readonly displayName: string;
  readonly description: string;

  /** Schema for rule configuration */
  readonly configSchema: Record<string, unknown>;
}

// =============================================================================
// FORWARD COMPATIBILITY - AI-generated face support
// =============================================================================

/**
 * AI face suggestion (pending human approval)
 *
 * This structure supports the "suggest / propose / explain" workflow
 * for LLM agents while maintaining human-in-the-loop control
 */
export interface AiFaceSuggestion {
  readonly suggestionId: string;
  readonly canonicalCardId: CanonicalCardId;

  /** The suggested face (not yet created) */
  readonly suggestedFace: Omit<CreateCardFaceInput, "canonicalCardId">;

  /** AI's explanation for why this face was suggested */
  readonly aiExplanation: string;

  /** AI model that generated this suggestion */
  readonly aiModel: string;

  /** Prompt hash for reproducibility */
  readonly promptHash: string;

  /** Confidence score */
  readonly confidence: Confidence;

  /** Status of this suggestion */
  readonly status: AiFaceSuggestionStatus;

  /** Human reviewer (if reviewed) */
  readonly reviewedBy?: UserId;
  readonly reviewedAt?: Timestamp;
  readonly reviewNotes?: string;

  /** If approved, the created face ID */
  readonly createdFaceId?: CardFaceId;

  /** Created timestamp */
  readonly createdAt: Timestamp;
}

export type AiFaceSuggestionStatus =
  | "pending" // Awaiting review
  | "approved" // Approved and created
  | "rejected" // Rejected by human
  | "modified" // Approved with modifications
  | "expired"; // No longer relevant

/**
 * Input for requesting AI face suggestions
 *
 * This is a DECISION SURFACE (what could be suggested)
 * NOT an EXECUTION SURFACE (what actually mutates state)
 */
export interface RequestAiFaceSuggestionsInput {
  readonly canonicalCardId: CanonicalCardId;

  /** What type of face to suggest */
  readonly targetFaceType?: CardFaceType;

  /** Target depth level */
  readonly targetDepthLevel?: CognitiveDepthLevel;

  /** Target category (for context-aware suggestions) */
  readonly targetCategoryId?: CategoryId;

  /** Maximum number of suggestions */
  readonly maxSuggestions: number;

  /** Additional context for the AI */
  readonly additionalContext?: string;
}
