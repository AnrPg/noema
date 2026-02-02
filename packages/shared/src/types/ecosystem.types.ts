// =============================================================================
// KNOWLEDGE ECOSYSTEM TYPES
// =============================================================================
// PARADIGM: Categories are LENSES, not containers.
//
// A card exists once; categories define the interpretive context through
// which cards are viewed. Each category lens provides:
// - A framing question (epistemic prompt)
// - Semantic intent (what meaning to extract)
// - Visual identity layer
// - Learning goals specific to that context
// - Differential emphasis rules
// - Contextual annotations (marginalia)
// =============================================================================

import type { CardId, UserId } from "./user.types";

// =============================================================================
// CORE IDENTIFIERS
// =============================================================================

export type CategoryId = string;
export type CategoryRelationId = string;
export type ParticipationId = string;
export type DynamicDeckId = string;
export type AnnotationId = string;
export type EmphasisRuleId = string;
export type ContextPerformanceId = string;

// =============================================================================
// ENUMS & TYPE UNIONS
// =============================================================================

/**
 * Learning intent defines what the learner wants to achieve with knowledge in this lens
 */
export type LearningIntent = "foundational" | "contextual" | "reference";

/**
 * Depth goal defines the level of mastery desired
 */
export type DepthGoal = "recognition" | "recall" | "application" | "synthesis";

/**
 * Maturity stage reflects how stable/crystallized the category structure is
 */
export type MaturityStage =
  | "acquisition"
  | "differentiation"
  | "crystallization";

/**
 * Semantic intent - the interpretive purpose of a category lens
 * Defines what kind of meaning/understanding the learner seeks
 */
export type SemanticIntent =
  | "learning" // Active knowledge acquisition
  | "review" // Spaced repetition and maintenance
  | "mastery" // Deep understanding and retention
  | "reference" // Quick lookup and recall
  | "exploration" // Discovery and curiosity-driven
  | "connection" // Cross-domain synthesis
  | "application" // Practical use and skills
  | "teaching"; // Explain to solidify understanding

/**
 * Interpretation priority determines how a lens treats a card
 */
export type InterpretationPriority =
  | "primary"
  | "secondary"
  | "tertiary"
  | "background";

/**
 * Semantic role of a card within a category lens
 */
export type SemanticRole =
  | "foundational" // Core concept for this lens
  | "application" // Applied example
  | "example" // Illustrative example
  | "edge_case" // Edge case or exception
  | "counterexample" // Counterexample
  | "concept"; // General concept

/**
 * Types of relationships between category lenses
 */
export type CategoryRelationType =
  | "conceptual_contains" // Soft conceptual hierarchy
  | "prepares_for" // Prerequisite relationship
  | "contrasts_with" // Opposing perspectives
  | "analogous_to" // Similar patterns/structures
  | "specializes" // More specific lens
  | "generalizes"; // More general lens

/**
 * Annotation type determines how the marginalia is used
 */
export type AnnotationType =
  | "note" // General note
  | "insight" // Key insight or realization
  | "question" // Question for further exploration
  | "warning" // Caution or common mistake
  | "connection" // Link to related concepts
  | "correction" // Correction or clarification
  | "elaboration"; // Extended explanation

/**
 * Emphasis rule types
 */
export type EmphasisRuleType =
  | "highlight" // Visually emphasize
  | "de_emphasize" // Visually de-emphasize
  | "collapse" // Hide/collapse content
  | "inject_prompt" // Add supplemental question
  | "reorder" // Change display order
  | "annotate"; // Auto-add annotation

/**
 * Emphasis operation type for plugin-based emphasis modifications
 */
export type EmphasisOperation =
  | "boost" // Increase emphasis
  | "reduce" // Decrease emphasis
  | "override" // Replace existing emphasis
  | "conditional"; // Apply based on conditions

/**
 * Position for injected prompts
 */
export type PromptPosition = "before" | "after" | "replace" | "overlay";

/**
 * Accuracy trend direction
 */
export type AccuracyTrend = "improving" | "declining" | "stable" | "volatile";

/**
 * Drift severity levels
 */
export type DriftSeverity = "mild" | "moderate" | "severe";

/**
 * Multi-context review session types
 */
export type MultiContextSessionType =
  | "drift_remediation"
  | "context_comparison"
  | "synthesis_check";

// =============================================================================
// VISUAL IDENTITY LAYER
// =============================================================================

/**
 * Visual identity configuration for a category lens
 * Determines how cards appear when viewed through this lens
 */
export interface VisualIdentityLayer {
  borderColor?: string;
  backgroundColor?: string;
  iconOverlay?: string;
  badgeText?: string;
  glowEffect?: boolean;
  opacity?: number;
  fontStyle?: "normal" | "italic";
  fontWeight?: "normal" | "bold";
}

// =============================================================================
// TARGET SELECTOR - For annotations and emphasis rules
// =============================================================================

/**
 * Selector for targeting specific content within a card
 */
export type TargetSelector =
  | { type: "text_range"; start: number; end: number }
  | { type: "field"; path: string }
  | { type: "regex"; pattern: string }
  | { type: "full_card" };

/**
 * Content selector for emphasis rules
 */
export interface ContentSelector {
  type: "regex" | "field" | "tag" | "semantic_role";
  pattern?: string;
  fieldPath?: string;
  tags?: string[];
  roles?: SemanticRole[];
}

// =============================================================================
// CATEGORY = LENS CORE TYPE
// =============================================================================

/**
 * Category as an interpretive lens, not a storage container.
 * Cards are viewed through lenses; they don't "live" in categories.
 */
export interface Category {
  id: CategoryId;
  userId: UserId;

  // Core identity
  name: string;
  description?: string;
  iconEmoji?: string;
  color?: string;
  coverImageUrl?: string;

  // =========================================================================
  // LENS DEFINITION - What makes this an interpretive context
  // =========================================================================

  /** The framing question - epistemic prompt defining this lens
   * e.g., "How does this relate to memory systems?" */
  framingQuestion?: string;

  /** Semantic intent - what kind of meaning does this lens extract?
   * e.g., "theoretical foundations", "practical applications" */
  semanticIntent?: string;

  /** Visual identity - how cards appear through this lens */
  visualIdentityLayer?: VisualIdentityLayer;

  /** Interpretation priority - when multiple lenses apply, which dominates?
   * Range: 0-100, higher = more dominant */
  interpretationPriority: number;

  /** Learning goals specific to this lens */
  learningGoals: string[];

  // Hierarchy (soft conceptual containment, not storage)
  parentId?: CategoryId;
  depth: number;
  path: CategoryId[]; // Materialized path

  // Learning parameters
  learningIntent: LearningIntent;
  depthGoal: DepthGoal;
  difficultyMultiplier: number;
  decayRateMultiplier: number;

  // Status
  maturityStage: MaturityStage;
  isArchived: boolean;
  isPinned: boolean;

  // Stats (denormalized for performance)
  cardCount: number;
  masteryScore: number;
  lastStudiedAt?: Date;
  totalStudyTime: number;

  // Ordering
  position: number;

  // Plugin extensibility
  pluginData: Record<string, unknown>;
  enabledPlugins: string[];

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Category with children for tree display
 */
export interface CategoryWithChildren extends Category {
  children: CategoryWithChildren[];
}

/**
 * Category with all relations for graph display
 */
export interface CategoryWithRelations extends Category {
  children: Category[];
  parent?: Category;
  outgoingRelations: CategoryRelation[];
  incomingRelations: CategoryRelation[];
  cardParticipations: CardCategoryParticipation[];
  annotations: ContextualAnnotation[];
  emphasisRules: EmphasisRule[];
}

/**
 * Minimal category info for lists and dropdowns
 */
export interface CategorySummary {
  id: CategoryId;
  name: string;
  iconEmoji?: string;
  color?: string;
  framingQuestion?: string;
  cardCount: number;
  masteryScore: number;
  depth: number;
  path: CategoryId[];
}

// =============================================================================
// CATEGORY RELATIONSHIPS - THE LENS GRAPH
// =============================================================================

/**
 * Relationship between two category lenses
 */
export interface CategoryRelation {
  id: CategoryRelationId;
  userId: UserId;

  sourceCategoryId: CategoryId;
  targetCategoryId: CategoryId;

  relationType: CategoryRelationType;
  strength: number; // 0-1
  isDirectional: boolean;

  /** What does viewing through connected lenses reveal? */
  epistemicBridge?: string;
  description?: string;

  isAutoSuggested: boolean;
  isUserConfirmed: boolean;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Relation with populated category info
 */
export interface CategoryRelationWithCategories extends CategoryRelation {
  sourceCategory: CategorySummary;
  targetCategory: CategorySummary;
}

// =============================================================================
// CARD-CATEGORY PARTICIPATION - MULTI-BELONGING AS MULTI-INTERPRETATION
// =============================================================================

/**
 * How a card participates in a category lens.
 * The same card can participate in multiple lenses with different roles.
 */
export interface CardCategoryParticipation {
  id: ParticipationId;
  cardId: CardId;
  categoryId: CategoryId;

  // Semantic role in this lens
  semanticRole: SemanticRole;
  isPrimary: boolean; // Is this the card's "home" lens?

  // Context-specific learning state
  contextDifficulty?: number;
  contextMastery: number;
  reviewCountInContext: number;
  lastReviewedInContext?: Date;

  // Quick notes (simple annotations)
  contextNotes?: string;
  contextTags: string[];

  // Learning goals
  learningGoal?: string;
  targetMastery: number;

  // Differential emphasis quick settings
  emphasisLevel: number; // -2 to +2
  isContextHighlighted: boolean;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Participation with category info included
 */
export interface ParticipationWithCategory extends CardCategoryParticipation {
  category: CategorySummary;
}

/**
 * Participation with card info included
 */
export interface ParticipationWithCard extends CardCategoryParticipation {
  card: {
    id: CardId;
    cardType: string;
    content: Record<string, unknown>;
    state: string;
  };
}

// =============================================================================
// CONTEXT FACES - DIFFERENT QUESTIONS PER CONTEXT
// =============================================================================

/**
 * Context-sensitive card face (different question per context)
 */
export interface CardContextFace {
  id: string;
  cardId: CardId;
  categoryId: CategoryId;

  frontOverride?: Record<string, unknown>;
  backOverride?: Record<string, unknown>;
  promptOverride?: string;

  timesShown: number;
  timesCorrect: number;

  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// CONTEXTUAL ANNOTATIONS (MARGINALIA)
// =============================================================================

/**
 * Style configuration for annotations
 */
export interface AnnotationStyle {
  color?: string;
  icon?: string;
  highlight?: boolean;
  borderStyle?: "solid" | "dashed" | "dotted";
}

/**
 * Contextual annotation - marginalia that exists only within a specific lens.
 * These are scholar's notes in the margins, context-dependent and versioned.
 */
export interface ContextualAnnotation {
  id: AnnotationId;
  userId: UserId;

  cardId: CardId;
  categoryId: CategoryId;
  participationId?: ParticipationId;

  // Annotation content
  annotationType: AnnotationType;
  content: string;
  targetSelector?: TargetSelector;
  style?: AnnotationStyle;

  // Connections & references
  linkedCardIds: CardId[];
  externalUrl?: string;
  citationText?: string;

  // Visibility & lifecycle
  isVisible: boolean;
  showDuringStudy: boolean;
  importance: number; // -2 to +2

  // Version control
  version: number;
  previousVersionId?: AnnotationId;
  cardContentHash?: string;
  isStale: boolean;

  // AI augmentation hooks
  isAiGenerated: boolean;
  aiConfidence?: number;
  aiSource?: string;
  isUserApproved: boolean;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Annotation with card and category info
 */
export interface AnnotationWithContext extends ContextualAnnotation {
  card: {
    id: CardId;
    cardType: string;
    content: Record<string, unknown>;
  };
  category: CategorySummary;
}

// =============================================================================
// DIFFERENTIAL EMPHASIS ENGINE
// =============================================================================

/**
 * Style configuration for emphasis rules
 */
export interface EmphasisStyle {
  backgroundColor?: string;
  textColor?: string;
  fontSize?: "small" | "normal" | "large" | "xlarge";
  fontWeight?: "normal" | "bold" | "light";
  border?: string;
  opacity?: number;
}

/**
 * Emphasis rule - defines how card content is emphasized/de-emphasized
 * within a specific category lens
 */
export interface EmphasisRule {
  id: EmphasisRuleId;
  userId: UserId;
  categoryId: CategoryId;

  // Rule definition
  name: string;
  description?: string;
  ruleType: EmphasisRuleType;

  // Targeting
  targetCardIds: CardId[];
  targetSemanticRoles: SemanticRole[];
  targetTags: string[];
  contentSelector?: ContentSelector;

  // Emphasis configuration
  emphasisLevel: number; // -2 to +2
  style?: EmphasisStyle;

  // Micro-prompt injection
  injectedPrompt?: string;
  promptPosition: PromptPosition;

  // Conditional activation
  minReviewCount?: number;
  minMastery?: number;
  maxMastery?: number;
  activeLearningModes: string[];

  // Lifecycle
  isEnabled: boolean;
  priority: number; // Higher = applied last (override)

  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// MULTI-CONTEXT PERFORMANCE TRACKING
// =============================================================================

/**
 * Performance record for a card within a specific category lens.
 * Essential for detecting context drift and supporting metacognition.
 */
export interface ContextPerformanceRecord {
  id: ContextPerformanceId;
  userId: UserId;
  cardId: CardId;
  categoryId: CategoryId;

  // Performance metrics
  totalReviews: number;
  correctReviews: number;
  accuracy: number;

  // Response time tracking
  avgResponseTime: number;
  minResponseTime?: number;
  maxResponseTime?: number;

  // Difficulty perception
  perceivedDifficulty: number;

  // Temporal patterns
  lastReviewedAt?: Date;
  daysSinceAnyReview?: number;
  currentStreak: number;
  longestStreak: number;

  // Context drift detection
  recentAccuracy: number;
  accuracyTrend: AccuracyTrend;
  performanceDeviation: number;
  hasDriftWarning: boolean;
  driftDetectedAt?: Date;
  driftSeverity?: DriftSeverity;

  // Metacognition support
  avgConfidence?: number;
  confidenceAccuracyCorrelation?: number;
  hasOverconfidenceFlag: boolean;
  hasUnderconfidenceFlag: boolean;

  // Multi-context moments
  multiContextReviewCount: number;
  contextSwitchAccuracy?: number;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Performance record with category info
 */
export interface PerformanceWithCategory extends ContextPerformanceRecord {
  category: CategorySummary;
}

// =============================================================================
// MULTI-CONTEXT REVIEW SESSION
// =============================================================================

/**
 * Session specifically designed for multi-context awareness
 */
export interface MultiContextReviewSession {
  id: string;
  userId: UserId;

  sessionType: MultiContextSessionType;
  categoryIds: CategoryId[];

  cardsReviewed: number;
  overallAccuracy: number;
  contextSwitchAccuracy: number;

  driftResolved: number;
  newDriftDetected: number;

  startedAt: Date;
  completedAt?: Date;
  durationMinutes: number;
}

// =============================================================================
// LEARNING MODES & FLOWS
// =============================================================================

/**
 * Learning mode defines how the user wants to engage with knowledge
 */
export type LearningMode =
  | "exploration" // Curiosity-driven wandering
  | "goal_driven" // Working toward a specific target
  | "exam_oriented" // Time-bounded cramming
  | "synthesis"; // Integration work

/**
 * View lens determines what aspect of the structure is emphasized
 */
export type ViewLens =
  | "structure" // Containment hierarchy
  | "flow" // Temporal dependencies
  | "bridge" // Cross-cutting connections
  | "progress"; // Mastery levels

/**
 * Learning mode per category (rigorous, intuitive, etc.)
 */
export type CategoryModeType =
  | "rigorous" // Proofs and derivations
  | "intuitive" // Analogies and visuals
  | "applied" // Problem-solving
  | "teaching"; // Explain to novice

/**
 * Question style for a learning mode
 */
export type QuestionStyle =
  | "standard"
  | "proof"
  | "analogy"
  | "problem"
  | "explain";

/**
 * Category learning mode configuration
 */
export interface CategoryLearningMode {
  id: string;
  categoryId: CategoryId;
  modeName: CategoryModeType;
  isActive: boolean;
  questionStyle: QuestionStyle;
  difficultyBias: number; // -1 to 1
  createdAt: Date;
}

/**
 * User's current learning flow state
 */
export interface UserLearningFlow {
  id: string;
  userId: UserId;

  currentMode: LearningMode;

  // Goal-driven mode
  goalCategoryId?: CategoryId;
  goalDeadline?: Date;
  goalProgress: number;

  // Exam mode
  examCategoryIds: CategoryId[];
  examDate?: Date;
  examPriority: "breadth" | "depth" | "mixed";

  // Synthesis mode
  synthesisCategoryIds: CategoryId[];

  // View settings
  activeLens: ViewLens;
  complexityLevel: number; // 1-5

  updatedAt: Date;
}

// =============================================================================
// DYNAMIC DECKS - VIEWS OVER THE ECOSYSTEM
// =============================================================================

/**
 * Query type for dynamic deck
 */
export type DynamicDeckQueryType =
  | "category" // Cards from specific categories
  | "union" // Cards from any of the categories
  | "intersection" // Cards in all of the categories
  | "difference" // Cards in A but not B
  | "custom"; // Custom query

/**
 * Sort options for dynamic deck
 */
export type DynamicDeckSortBy =
  | "due_date"
  | "difficulty"
  | "created"
  | "mastery"
  | "random";

/**
 * Dynamic deck definition - a query over the ecosystem
 */
export interface DynamicDeck {
  id: DynamicDeckId;
  userId: UserId;

  name: string;
  description?: string;
  iconEmoji?: string;
  color?: string;

  queryType: DynamicDeckQueryType;

  includeCategoryIds: CategoryId[];
  excludeCategoryIds: CategoryId[];
  includeSubcategories: boolean;

  stateFilter: string[];
  tagFilter: string[];
  difficultyRange?: { min: number; max: number };

  sortBy: DynamicDeckSortBy;
  sortOrder: "asc" | "desc";

  maxCards?: number;

  cachedCardCount: number;
  cacheUpdatedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// EVOLUTION & HISTORY
// =============================================================================

/**
 * Type of evolution event
 */
export type EvolutionEventType =
  | "created"
  | "renamed"
  | "split"
  | "merged"
  | "reparented"
  | "archived"
  | "intent_changed"
  | "mode_changed"
  | "lens_refined"; // Framing question or semantic intent changed

/**
 * Evolution event for category structure changes
 */
export interface CategoryEvolutionEvent {
  id: string;
  categoryId: CategoryId;
  userId: UserId;

  eventType: EvolutionEventType;

  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;

  relatedCategoryIds: CategoryId[];

  reason?: string;

  createdAt: Date;
}

// =============================================================================
// SUGGESTIONS - AI-DETECTED PATTERNS
// =============================================================================

/**
 * Status of a category suggestion
 */
export type SuggestionStatus = "pending" | "accepted" | "rejected" | "deferred";

/**
 * AI-suggested category based on detected patterns
 */
export interface CategorySuggestion {
  id: string;
  userId: UserId;

  suggestedName: string;
  suggestedDescription?: string;
  suggestedFramingQuestion?: string; // AI can suggest a lens
  detectedTheme?: string;

  cardIds: CardId[];

  confidence: number;

  status: SuggestionStatus;
  respondedAt?: Date;

  createdAt: Date;
}

// =============================================================================
// API INPUT/OUTPUT TYPES
// =============================================================================

/**
 * Input for creating a category lens
 */
export interface CreateCategoryInput {
  name: string;
  description?: string;
  framingQuestion?: string;
  semanticIntent?: SemanticIntent;
  iconEmoji?: string;
  color?: string;
  parentId?: CategoryId;
  learningIntent?: LearningIntent;
  depthGoal?: DepthGoal;
  learningGoals?: string[];
  visualIdentityLayer?: VisualIdentityLayer;
  interpretationPriority?: number;
}

/**
 * Input for updating a category lens
 */
export interface UpdateCategoryInput {
  name?: string;
  description?: string;
  framingQuestion?: string;
  semanticIntent?: SemanticIntent;
  iconEmoji?: string;
  color?: string;
  coverImageUrl?: string;
  learningIntent?: LearningIntent;
  depthGoal?: DepthGoal;
  difficultyMultiplier?: number;
  decayRateMultiplier?: number;
  maturityStage?: MaturityStage;
  isArchived?: boolean;
  isPinned?: boolean;
  position?: number;
  learningGoals?: string[];
  visualIdentityLayer?: VisualIdentityLayer;
  interpretationPriority?: number;
  pluginData?: Record<string, unknown>;
  enabledPlugins?: string[];
}

/**
 * Input for moving a category (re-parenting)
 */
export interface MoveCategoryInput {
  newParentId?: CategoryId | null;
  position?: number;
  reason?: string;
}

/**
 * Input for splitting a category
 */
export interface SplitCategoryInput {
  childNames: string[];
  cardAssignments: Record<string, CardId[]>; // childName -> cardIds
  keepParent?: boolean;
  reason?: string;
}

/**
 * Input for merging categories
 */
export interface MergeCategoriesInput {
  sourceIds: CategoryId[];
  targetName: string;
  targetDescription?: string;
  targetFramingQuestion?: string;
  reason?: string;
}

/**
 * Input for creating a category relation
 */
export interface CreateCategoryRelationInput {
  sourceCategoryId: CategoryId;
  targetCategoryId: CategoryId;
  relationType: CategoryRelationType;
  strength?: number;
  epistemicBridge?: string;
  description?: string;
}

/**
 * Input for adding a card to a category lens
 */
export interface AddCardToCategoryInput {
  cardId: CardId;
  categoryId: CategoryId;
  semanticRole?: SemanticRole;
  isPrimary?: boolean;
  contextNotes?: string;
  contextTags?: string[];
  learningGoal?: string;
  emphasisLevel?: number;
}

/**
 * Input for bulk adding cards to a category
 */
export interface BulkAddCardsToCategoryInput {
  categoryId: CategoryId;
  cardIds: CardId[];
  semanticRole?: SemanticRole;
}

/**
 * Input for creating a context face
 */
export interface CreateContextFaceInput {
  cardId: CardId;
  categoryId: CategoryId;
  frontOverride?: Record<string, unknown>;
  backOverride?: Record<string, unknown>;
  promptOverride?: string;
}

/**
 * Input for creating a contextual annotation
 */
export interface CreateAnnotationInput {
  cardId: CardId;
  categoryId: CategoryId;
  annotationType: AnnotationType;
  content: string;
  targetSelector?: TargetSelector;
  style?: AnnotationStyle;
  linkedCardIds?: CardId[];
  externalUrl?: string;
  citationText?: string;
  showDuringStudy?: boolean;
  importance?: number;
}

/**
 * Input for updating an annotation
 */
export interface UpdateAnnotationInput {
  annotationType?: AnnotationType;
  content?: string;
  targetSelector?: TargetSelector;
  style?: AnnotationStyle;
  linkedCardIds?: CardId[];
  externalUrl?: string;
  citationText?: string;
  isVisible?: boolean;
  showDuringStudy?: boolean;
  importance?: number;
}

/**
 * Input for creating an emphasis rule
 */
export interface CreateEmphasisRuleInput {
  categoryId: CategoryId;
  name: string;
  description?: string;
  ruleType: EmphasisRuleType;
  targetCardIds?: CardId[];
  targetSemanticRoles?: SemanticRole[];
  targetTags?: string[];
  contentSelector?: ContentSelector;
  emphasisLevel?: number;
  style?: EmphasisStyle;
  injectedPrompt?: string;
  promptPosition?: PromptPosition;
  minReviewCount?: number;
  minMastery?: number;
  maxMastery?: number;
  activeLearningModes?: string[];
  priority?: number;
}

/**
 * Input for updating an emphasis rule
 */
export interface UpdateEmphasisRuleInput {
  name?: string;
  description?: string;
  ruleType?: EmphasisRuleType;
  targetCardIds?: CardId[];
  targetSemanticRoles?: SemanticRole[];
  targetTags?: string[];
  contentSelector?: ContentSelector;
  emphasisLevel?: number;
  style?: EmphasisStyle;
  injectedPrompt?: string;
  promptPosition?: PromptPosition;
  minReviewCount?: number;
  minMastery?: number;
  maxMastery?: number;
  activeLearningModes?: string[];
  isEnabled?: boolean;
  priority?: number;
}

/**
 * Input for creating a dynamic deck
 */
export interface CreateDynamicDeckInput {
  name: string;
  description?: string;
  iconEmoji?: string;
  color?: string;
  queryType?: DynamicDeckQueryType;
  includeCategoryIds: CategoryId[];
  excludeCategoryIds?: CategoryId[];
  includeSubcategories?: boolean;
  stateFilter?: string[];
  tagFilter?: string[];
  difficultyRange?: { min: number; max: number };
  sortBy?: DynamicDeckSortBy;
  sortOrder?: "asc" | "desc";
  maxCards?: number;
}

/**
 * Input for updating user learning flow
 */
export interface UpdateLearningFlowInput {
  currentMode?: LearningMode;
  goalCategoryId?: CategoryId | null;
  goalDeadline?: Date | null;
  examCategoryIds?: CategoryId[];
  examDate?: Date | null;
  examPriority?: "breadth" | "depth" | "mixed";
  synthesisCategoryIds?: CategoryId[];
  activeLens?: ViewLens;
  complexityLevel?: number;
}

/**
 * Response for category suggestion action
 */
export interface RespondToSuggestionInput {
  suggestionId: string;
  action: "accept" | "reject" | "defer";
  modifications?: {
    name?: string;
    description?: string;
    framingQuestion?: string;
    cardIds?: CardId[];
    parentId?: CategoryId;
  };
}

// =============================================================================
// GRAPH VISUALIZATION TYPES
// =============================================================================

/**
 * Node in the category graph for visualization
 */
export interface CategoryGraphNode {
  id: CategoryId;
  name: string;
  iconEmoji?: string;
  color?: string;
  framingQuestion?: string;
  cardCount: number;
  masteryScore: number;
  maturityStage: MaturityStage;
  depth: number;

  // Position (computed by layout algorithm)
  x?: number;
  y?: number;

  // Visual state
  isExpanded?: boolean;
  isSelected?: boolean;
  isFocused?: boolean;
}

/**
 * Edge in the category graph
 */
export interface CategoryGraphEdge {
  id: CategoryRelationId;
  sourceId: CategoryId;
  targetId: CategoryId;
  relationType: CategoryRelationType;
  strength: number;
  isDirectional: boolean;
  epistemicBridge?: string;
}

/**
 * Full graph structure for visualization
 */
export interface CategoryGraph {
  nodes: CategoryGraphNode[];
  edges: CategoryGraphEdge[];
}

/**
 * Territory map region (for territory visualization)
 */
export interface TerritoryRegion {
  categoryId: CategoryId;
  name: string;
  color: string;
  framingQuestion?: string;
  masteryScore: number;
  maturityStage: MaturityStage;
  cardCount: number;

  // Boundaries for rendering
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  // Children regions
  children: TerritoryRegion[];

  // State
  isCore: boolean; // Well-understood, stable
  isFrontier: boolean; // Active learning
  isFogOfWar: boolean; // Unexplored
}

// =============================================================================
// STUDY FLOW TYPES
// =============================================================================

/**
 * Study session context for ecosystem-aware studying
 */
export interface EcosystemStudyContext {
  learningMode: LearningMode;
  activeCategoryId?: CategoryId;
  activeLens: ViewLens;

  // For goal-driven mode
  prerequisitePath?: CategoryId[];
  currentPathPosition?: number;

  // For exploration mode
  neighboringCategories?: CategorySummary[];

  // For synthesis mode
  bridgingCards?: CardId[];
}

/**
 * Card presentation context - everything needed to render a card through a lens
 */
export interface CardPresentationContext {
  cardId: CardId;
  activeCategoryId: CategoryId;
  activeFaceId?: string;

  // All categories this card participates in
  participations: ParticipationWithCategory[];

  // Context-specific info
  currentSemanticRole: SemanticRole;
  currentContextNotes?: string;
  framingQuestion?: string;

  // Visual identity for this context
  visualIdentity?: VisualIdentityLayer;

  // Active annotations for this context
  annotations: ContextualAnnotation[];

  // Applied emphasis rules
  appliedEmphasis: EmphasisRule[];

  // Performance in this context
  contextPerformance?: ContextPerformanceRecord;

  // Drift warning if applicable
  hasDriftWarning: boolean;
}

// =============================================================================
// CONTEXT DRIFT & METACOGNITION
// =============================================================================

/**
 * Context drift summary for a card across multiple lenses
 */
export interface CardContextDriftSummary {
  cardId: CardId;

  // Performance by context
  contextPerformances: PerformanceWithCategory[];

  // Drift analysis
  hasSignificantDrift: boolean;
  worstPerformingContext?: CategoryId;
  bestPerformingContext?: CategoryId;
  performanceSpread: number; // Difference between best and worst

  // Recommendations
  recommendedActions: ContextDriftAction[];
}

/**
 * Recommended action to address context drift
 */
export interface ContextDriftAction {
  actionType:
    | "review_in_context"
    | "add_annotation"
    | "create_connection"
    | "adjust_emphasis";
  categoryId: CategoryId;
  description: string;
  priority: number;
}

/**
 * Multi-context review moment - when to surface different contexts
 */
export interface MultiContextMoment {
  cardId: CardId;
  primaryContext: CategoryId;
  secondaryContexts: CategoryId[];

  reason: "drift_detected" | "scheduled_comparison" | "synthesis_opportunity";

  // How to present
  showFramingQuestions: boolean;
  showPerformanceComparison: boolean;
}
