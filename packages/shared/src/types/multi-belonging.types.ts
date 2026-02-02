// =============================================================================
// MULTI-BELONGING & CONCEPTUAL OVERLAP TYPES
// =============================================================================
// Core principle: A card exists ONCE, but PARTICIPATES in many categories.
// Each participation defines the card's role, context-specific behavior,
// performance tracking, and provenance within that interpretive lens.
//
// This creates a PARTICIPATION MODEL where:
// - Cards are canonical entities with one scheduling state
// - Categories are lenses that HOST participations
// - Performance and difficulty can be context-specific
// - Synthesis mechanisms prevent knowledge fragmentation
// =============================================================================

import type { CardId, UserId } from "./user.types";
import type {
  CategoryId,
  SemanticRole,
  CategorySummary,
} from "./ecosystem.types";

// =============================================================================
// IDENTIFIERS
// =============================================================================

export type ParticipationId = string;
export type SynthesisPromptId = string;
export type SynthesisResponseId = string;
export type SynthesisNoteId = string;
export type BridgeCardId = string;
export type BridgeCardSuggestionId = string;
export type CrossContextQuizId = string;
export type PerformanceDivergenceId = string;

// =============================================================================
// ENUMS & TYPE UNIONS
// =============================================================================

/**
 * Extended semantic roles for multi-belonging
 */
export type ExtendedSemanticRole =
  | SemanticRole
  | "prerequisite" // Required knowledge for other cards
  | "bridge" // Connects this context to another
  | "synthesis"; // Integrates multiple concepts

/**
 * Provenance type - how a participation was created
 */
export type ProvenanceType =
  | "manual" // User explicitly added
  | "import" // Imported from external source
  | "split" // Created during category split
  | "merge" // Created during category merge
  | "ai_suggested" // AI recommended this participation
  | "bulk_operation"; // Part of a bulk add operation

/**
 * Synthesis prompt trigger types
 */
export type SynthesisTriggerType =
  | "high_participation_count" // Card has many participations
  | "performance_divergence" // Performance differs across contexts
  | "frequent_lens_switch" // User switches contexts often
  | "scheduled" // Regular synthesis check
  | "user_requested"; // User asked for synthesis

/**
 * Synthesis prompt types
 */
export type SynthesisPromptType =
  | "connection" // Connect how concept changes across contexts
  | "fundamental_context" // Which context is most fundamental?
  | "bridge_explanation" // Write a bridge explanation
  | "context_comparison" // Compare/contrast across contexts
  | "role_reflection"; // Reflect on role in each context

/**
 * Synthesis prompt status
 */
export type SynthesisPromptStatus =
  | "pending" // Not yet shown
  | "shown" // Shown to user
  | "responded" // User responded
  | "skipped" // User skipped
  | "deferred"; // Deferred to later

/**
 * Synthesis note types
 */
export type SynthesisNoteType =
  | "connection" // Connection between contexts
  | "hierarchy" // Hierarchical relationship
  | "transformation" // How concept transforms
  | "application"; // Applied understanding

/**
 * Bridge card types
 */
export type BridgeType =
  | "concept_to_concept" // Links two cards
  | "context_to_context" // Links two categories
  | "concept_context"; // Links a card to a category

/**
 * Connection types for bridges
 */
export type ConnectionType =
  | "relates_to" // General relation
  | "contrasts_with" // Opposing/different
  | "generalizes" // More general than
  | "specializes" // More specific than
  | "enables" // Makes possible
  | "depends_on" // Requires
  | "transforms_into"; // Becomes/evolves into

/**
 * Bridge card surface triggers
 */
export type BridgeSurfaceTrigger =
  | "related_card_review" // During review of connected card
  | "context_switch" // When switching contexts
  | "scheduled" // Regular schedule
  | "synthesis_session"; // During synthesis review

/**
 * Bridge card status
 */
export type BridgeCardStatus =
  | "draft" // Not yet finalized
  | "active" // In rotation
  | "suspended" // Temporarily disabled
  | "archived"; // Soft deleted

/**
 * Cross-context quiz types
 */
export type CrossContextQuizType =
  | "easiest_context" // Which context is easiest?
  | "hardest_context" // Which context is hardest?
  | "best_role" // Which role fits best?
  | "context_comparison"; // Compare contexts

/**
 * Performance divergence severity
 */
export type DivergenceSeverity =
  | "mild" // Small difference
  | "moderate" // Notable difference
  | "severe"; // Large difference

/**
 * Performance divergence status
 */
export type DivergenceStatus =
  | "active" // Currently divergent
  | "addressed" // Action taken
  | "dismissed" // User dismissed
  | "resolved"; // No longer divergent

// =============================================================================
// ENHANCED PARTICIPATION MODEL
// =============================================================================

/**
 * Enhanced card-category participation with full multi-belonging support
 */
export interface CardCategoryParticipation {
  id: ParticipationId;
  cardId: CardId;
  categoryId: CategoryId;

  // =========================================================================
  // SEMANTIC ROLE
  // =========================================================================
  /** How this card functions within this lens */
  semanticRole: ExtendedSemanticRole;
  /** Is this the card's "home" lens? */
  isPrimary: boolean;

  // =========================================================================
  // CONTEXT-SPECIFIC LEARNING STATE
  // =========================================================================
  /** Override difficulty for this context */
  contextDifficulty?: number;
  /** Mastery level in this specific context (0-1) */
  contextMastery: number;
  /** Number of reviews in this context */
  reviewCountInContext: number;
  /** Last review timestamp in this context */
  lastReviewedInContext?: Date;

  // =========================================================================
  // CONTEXT-SPECIFIC PERFORMANCE SIGNALS
  // =========================================================================
  /** Success rate in this context */
  contextSuccessRate: number;
  /** Lapse rate in this context */
  contextLapseRate: number;
  /** Average response time in ms */
  avgResponseTimeMs?: number;
  /** User's self-reported confidence (0-1) */
  confidenceRating?: number;
  /** Computed mastery score for this context */
  contextMasteryScore: number;

  // =========================================================================
  // CONTEXT-SPECIFIC NOTES & TAGS
  // =========================================================================
  /** Quick notes specific to this context */
  contextNotes?: string;
  /** Tags specific to this context */
  contextTags: string[];

  // =========================================================================
  // LEARNING GOALS
  // =========================================================================
  /** What should learner understand in this context? */
  learningGoal?: string;
  /** Target mastery level for this context */
  targetMastery: number;
  /** Override learning intent */
  intentOverride?: "foundational" | "contextual" | "reference";

  // =========================================================================
  // ORDERING & PRIORITY
  // =========================================================================
  /** Position within this category */
  positionInCategory: number;
  /** Weight for review selection */
  priorityWeight: number;

  // =========================================================================
  // PROVENANCE
  // =========================================================================
  /** Why does this card belong here? */
  belongsBecause?: string;
  /** How was this participation created? */
  provenanceType: ProvenanceType;
  /** Reference to source (e.g., split event ID) */
  provenanceRef?: string;
  /** When was this participation added? */
  addedAt: Date;

  // =========================================================================
  // EMPHASIS & SCAFFOLDING
  // =========================================================================
  /** Emphasis level (-2 to +2) */
  emphasisLevel: number;
  /** Quick toggle to highlight in this context */
  isContextHighlighted: boolean;
  /** Scaffolding level (0=none, 3=full) */
  scaffoldingLevel: number;
  /** Additional prompts for weaker contexts */
  customPrompts: string[];

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
    nextReviewDate?: Date;
  };
}

/**
 * Full participation with both card and category
 */
export interface FullParticipation extends CardCategoryParticipation {
  card: {
    id: CardId;
    cardType: string;
    content: Record<string, unknown>;
    state: string;
    nextReviewDate?: Date;
    stability?: number;
    difficulty?: number;
  };
  category: CategorySummary;
}

// =============================================================================
// SYNTHESIS ENGINE TYPES
// =============================================================================

/**
 * Synthesis prompt - triggered to encourage cross-context connections
 */
export interface SynthesisPrompt {
  id: SynthesisPromptId;
  userId: UserId;
  cardId: CardId;

  /** Category contexts involved */
  categoryIds: CategoryId[];

  /** What triggered this prompt */
  triggerType: SynthesisTriggerType;
  /** Details about the trigger */
  triggerDetails?: {
    participationCount?: number;
    performanceSpread?: number;
    switchCount?: number;
    worstContextId?: CategoryId;
    bestContextId?: CategoryId;
  };

  /** Type of synthesis prompt */
  promptType: SynthesisPromptType;
  /** The actual prompt text */
  promptText: string;
  /** Alternative prompts for variety */
  alternativePrompts: string[];
  /** Hints to guide the user */
  hints: string[];

  /** Status of the prompt */
  status: SynthesisPromptStatus;
  /** When shown to user */
  shownAt?: Date;
  /** When user responded */
  respondedAt?: Date;
  /** When user skipped */
  skippedAt?: Date;
  /** Deferred until */
  deferredUntil?: Date;

  /** Times shown */
  timesShown: number;
  /** Maximum attempts before giving up */
  maxAttempts: number;

  /** Was this AI-generated? */
  isAiGenerated: boolean;
  /** AI confidence score */
  aiConfidence?: number;
  /** AI model used */
  aiModel?: string;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Synthesis prompt with context info
 */
export interface SynthesisPromptWithContext extends SynthesisPrompt {
  card: {
    id: CardId;
    cardType: string;
    content: Record<string, unknown>;
  };
  categories: CategorySummary[];
}

/**
 * User's response to a synthesis prompt
 */
export interface SynthesisResponse {
  id: SynthesisResponseId;
  userId: UserId;
  promptId: SynthesisPromptId;
  participationId?: ParticipationId;

  /** The user's response text */
  responseText: string;
  /** Structured response data */
  responseData?: {
    fundamentalContextId?: CategoryId;
    difficultyRankings?: { categoryId: CategoryId; rank: number }[];
    connectionStrength?: number;
    selectedRole?: ExtendedSemanticRole;
  };

  /** Quality indicators */
  wordCount: number;
  /** References multiple contexts? */
  hasConnections: boolean;

  /** Output actions */
  createdNoteId?: SynthesisNoteId;
  createdBridgeCardDraftId?: BridgeCardId;
  updatedParticipationIds: ParticipationId[];

  /** User's self-rating (1-5) */
  selfRating?: number;
  /** AI quality assessment (0-1) */
  aiQualityScore?: number;
  /** AI feedback */
  aiFeedback?: string;

  createdAt: Date;
}

/**
 * Synthesis note - stored insight from synthesis work
 */
export interface SynthesisNote {
  id: SynthesisNoteId;
  userId: UserId;
  cardId: CardId;

  /** Contexts being synthesized */
  categoryIds: CategoryId[];

  /** The synthesis insight */
  content: string;
  /** Type of synthesis */
  noteType: SynthesisNoteType;
  /** Key terms/concepts mentioned */
  keyTerms: string[];
  /** Referenced cards */
  referencedCardIds: CardId[];

  /** Source of this note */
  sourceType: "synthesis_prompt" | "manual" | "ai_suggested";
  /** Reference to source */
  sourceId?: string;

  /** Is visible? */
  isVisible: boolean;
  /** Show during review? */
  showDuringReview: boolean;
  /** Quality score (0-1) */
  qualityScore?: number;

  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// BRIDGE CARD TYPES
// =============================================================================

/**
 * Bridge card - explicitly links concepts or contexts
 */
export interface BridgeCard {
  id: BridgeCardId;
  userId: UserId;

  /** Type of bridge */
  bridgeType: BridgeType;

  /** Source references */
  sourceCardId?: CardId;
  sourceCategoryId?: CategoryId;

  /** Target references */
  targetCardId?: CardId;
  targetCategoryId?: CategoryId;

  /** The actual card ID */
  cardId: CardId;

  /** Bridge-specific content */
  bridgeQuestion: string;
  bridgeAnswer: string;

  /** Bidirectional support */
  isBidirectional: boolean;
  reverseQuestion?: string;
  reverseAnswer?: string;

  /** Connection metadata */
  connectionType: ConnectionType;
  connectionStrength: number;
  connectionDescription?: string;

  /** Review behavior */
  frequencyMultiplier: number;
  surfaceTrigger: BridgeSurfaceTrigger;
  minGapReviews: number;

  /** Provenance */
  createdFrom: "manual" | "synthesis_prompt" | "ai_suggestion" | "import";
  sourceId?: string;
  aiSuggested: boolean;
  aiConfidence?: number;
  isUserConfirmed: boolean;

  /** Status */
  status: BridgeCardStatus;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Bridge card with full context info
 */
export interface BridgeCardWithContext extends BridgeCard {
  card: {
    id: CardId;
    cardType: string;
    content: Record<string, unknown>;
    state: string;
    nextReviewDate?: Date;
  };
  sourceCard?: {
    id: CardId;
    content: Record<string, unknown>;
  };
  targetCard?: {
    id: CardId;
    content: Record<string, unknown>;
  };
  sourceCategory?: CategorySummary;
  targetCategory?: CategorySummary;
}

/**
 * AI suggestion for a bridge card
 */
export interface BridgeCardSuggestion {
  id: BridgeCardSuggestionId;
  userId: UserId;

  bridgeType: BridgeType;

  sourceCardId?: CardId;
  sourceCategoryId?: CategoryId;
  targetCardId?: CardId;
  targetCategoryId?: CategoryId;

  /** Suggested content */
  suggestedQuestion: string;
  suggestedAnswer: string;
  connectionType: ConnectionType;

  /** AI metadata */
  confidence: number;
  rationale: string;
  suggestionSource:
    | "performance_analysis"
    | "semantic_similarity"
    | "co_occurrence"
    | "user_behavior";
  suggestionDetails?: Record<string, unknown>;

  /** Status */
  status: "pending" | "accepted" | "rejected" | "deferred";
  respondedAt?: Date;
  createdBridgeId?: BridgeCardId;

  createdAt: Date;
}

// =============================================================================
// CROSS-CONTEXT QUIZ TYPES
// =============================================================================

/**
 * Cross-context quiz - tests awareness of context differences
 */
export interface CrossContextQuiz {
  id: CrossContextQuizId;
  userId: UserId;
  cardId: CardId;

  /** Contexts involved */
  categoryIds: CategoryId[];
  /** Type of quiz */
  quizType: CrossContextQuizType;

  /** Question content */
  questionText: string;
  /** Options for multiple choice */
  options?: {
    id: string;
    text: string;
    categoryId?: CategoryId;
    roleLabel?: string;
  }[];
  /** Correct answers */
  correctAnswers: string[];

  /** Response */
  userAnswer?: string;
  isCorrect?: boolean;
  answeredAt?: Date;
  responseTimeMs?: number;

  /** Insight from this quiz */
  insightType?:
    | "calibration_correct"
    | "needs_review"
    | "overconfident"
    | "underconfident";
  insightDetails?: Record<string, unknown>;
  /** Actions triggered */
  triggeredActions: string[];

  createdAt: Date;
}

// =============================================================================
// PERFORMANCE DIVERGENCE TYPES
// =============================================================================

/**
 * Performance divergence - detected when card performs differently across contexts
 */
export interface PerformanceDivergence {
  id: PerformanceDivergenceId;
  userId: UserId;
  cardId: CardId;

  /** Best performing context */
  bestContextId: CategoryId;
  bestAccuracy: number;

  /** Worst performing context */
  worstContextId: CategoryId;
  worstAccuracy: number;

  /** Spread between best and worst */
  performanceSpread: number;

  /** All contexts ranked */
  contextRankings: {
    categoryId: CategoryId;
    accuracy: number;
    rank: number;
  }[];

  /** Analysis */
  severity: DivergenceSeverity;
  possibleCauses: string[];
  recommendations?: {
    action: string;
    categoryId?: CategoryId;
    priority: number;
  }[];

  /** Status */
  status: DivergenceStatus;
  actionsTaken?: {
    action: string;
    timestamp: Date;
    result?: string;
  }[];

  detectedAt: Date;
  resolvedAt?: Date;
}

/**
 * Performance divergence with context info
 */
export interface PerformanceDivergenceWithContext extends PerformanceDivergence {
  card: {
    id: CardId;
    content: Record<string, unknown>;
  };
  bestContext: CategorySummary;
  worstContext: CategorySummary;
  allContexts: CategorySummary[];
}

// =============================================================================
// CARD PRESENTATION CONTEXT
// =============================================================================

/**
 * Complete context for presenting a card through a specific lens
 */
export interface CardPresentationContext {
  cardId: CardId;
  activeCategoryId: CategoryId;

  /** The participation record */
  participation: CardCategoryParticipation;

  /** All participations for this card */
  allParticipations: ParticipationWithCategory[];

  /** Context-specific info */
  framingQuestion?: string;
  visualIdentity?: {
    borderColor?: string;
    backgroundColor?: string;
    iconOverlay?: string;
    badgeText?: string;
  };

  /** Active annotations */
  annotations: {
    id: string;
    type: string;
    content: string;
    importance: number;
  }[];

  /** Synthesis notes for this card */
  synthesisNotes: SynthesisNote[];

  /** Pending synthesis prompts */
  pendingSynthesisPrompts: SynthesisPrompt[];

  /** Bridge cards involving this card */
  relatedBridgeCards: BridgeCard[];

  /** Performance divergence info */
  performanceDivergence?: PerformanceDivergence;

  /** Context drift warning */
  hasDriftWarning: boolean;

  /** Scaffolding to apply */
  scaffoldingLevel: number;
  additionalPrompts: string[];
}

// =============================================================================
// API INPUT TYPES
// =============================================================================

/**
 * Input for adding a participation
 */
export interface AddParticipationInput {
  cardId: CardId;
  categoryId: CategoryId;
  semanticRole?: ExtendedSemanticRole;
  isPrimary?: boolean;
  contextNotes?: string;
  contextTags?: string[];
  learningGoal?: string;
  targetMastery?: number;
  belongsBecause?: string;
  emphasisLevel?: number;
  positionInCategory?: number;
}

/**
 * Input for updating a participation
 */
export interface UpdateParticipationInput {
  semanticRole?: ExtendedSemanticRole;
  isPrimary?: boolean;
  contextNotes?: string;
  contextTags?: string[];
  learningGoal?: string;
  targetMastery?: number;
  intentOverride?: "foundational" | "contextual" | "reference";
  belongsBecause?: string;
  emphasisLevel?: number;
  isContextHighlighted?: boolean;
  scaffoldingLevel?: number;
  customPrompts?: string[];
  positionInCategory?: number;
  priorityWeight?: number;
}

/**
 * Input for bulk adding participations
 */
export interface BulkAddParticipationsInput {
  participations: {
    cardId: CardId;
    categoryId: CategoryId;
    semanticRole?: ExtendedSemanticRole;
  }[];
  defaultRole?: ExtendedSemanticRole;
  belongsBecause?: string;
}

/**
 * Input for bulk updating participations
 */
export interface BulkUpdateParticipationsInput {
  participationIds: ParticipationId[];
  updates: Partial<UpdateParticipationInput>;
}

/**
 * Input for responding to a synthesis prompt
 */
export interface RespondToSynthesisInput {
  promptId: SynthesisPromptId;
  responseText: string;
  responseData?: {
    fundamentalContextId?: CategoryId;
    difficultyRankings?: { categoryId: CategoryId; rank: number }[];
  };
  selfRating?: number;
  createNote?: boolean;
  createBridgeCardDraft?: boolean;
}

/**
 * Input for creating a synthesis note
 */
export interface CreateSynthesisNoteInput {
  cardId: CardId;
  categoryIds: CategoryId[];
  content: string;
  noteType?: SynthesisNoteType;
  keyTerms?: string[];
  referencedCardIds?: CardId[];
  showDuringReview?: boolean;
}

/**
 * Input for creating a bridge card
 */
export interface CreateBridgeCardInput {
  bridgeType: BridgeType;
  sourceCardId?: CardId;
  sourceCategoryId?: CategoryId;
  targetCardId?: CardId;
  targetCategoryId?: CategoryId;
  bridgeQuestion: string;
  bridgeAnswer: string;
  isBidirectional?: boolean;
  reverseQuestion?: string;
  reverseAnswer?: string;
  connectionType?: ConnectionType;
  connectionStrength?: number;
  connectionDescription?: string;
  frequencyMultiplier?: number;
  surfaceTrigger?: BridgeSurfaceTrigger;
}

/**
 * Input for answering a cross-context quiz
 */
export interface AnswerCrossContextQuizInput {
  quizId: CrossContextQuizId;
  answer: string;
  responseTimeMs?: number;
}

// =============================================================================
// QUERY TYPES
// =============================================================================

/**
 * Query options for participations
 */
export interface ParticipationQueryOptions {
  /** Filter by card */
  cardId?: CardId;
  /** Filter by category */
  categoryId?: CategoryId;
  /** Filter by semantic role */
  roles?: ExtendedSemanticRole[];
  /** Filter by primary status */
  isPrimary?: boolean;
  /** Filter by performance divergence */
  hasPerformanceDivergence?: boolean;
  /** Filter by mastery range */
  masteryRange?: { min: number; max: number };
  /** Filter by provenance */
  provenanceTypes?: ProvenanceType[];
  /** Include full card data */
  includeCard?: boolean;
  /** Include full category data */
  includeCategory?: boolean;
  /** Pagination */
  limit?: number;
  offset?: number;
  /** Sorting */
  sortBy?:
    | "createdAt"
    | "contextMastery"
    | "positionInCategory"
    | "lastReviewedInContext";
  sortOrder?: "asc" | "desc";
}

/**
 * Query options for bridge card candidates
 */
export interface BridgeCandidateQueryOptions {
  /** Cards with high participation count */
  minParticipations?: number;
  /** Cards with performance divergence */
  minPerformanceSpread?: number;
  /** Cards reviewed in multiple contexts recently */
  multiContextReviewThreshold?: number;
  /** Limit results */
  limit?: number;
}

/**
 * Query options for synthesis prompts
 */
export interface SynthesisPromptQueryOptions {
  cardId?: CardId;
  status?: SynthesisPromptStatus[];
  triggerType?: SynthesisTriggerType[];
  includeDeferred?: boolean;
  limit?: number;
  offset?: number;
}

// =============================================================================
// ANALYTICS TYPES
// =============================================================================

/**
 * Participation analytics for a card
 */
export interface CardParticipationAnalytics {
  cardId: CardId;
  totalParticipations: number;
  primaryCategoryId?: CategoryId;

  /** Performance by context */
  contextPerformance: {
    categoryId: CategoryId;
    categoryName: string;
    accuracy: number;
    reviewCount: number;
    avgResponseTime?: number;
    mastery: number;
    lastReviewed?: Date;
  }[];

  /** Divergence summary */
  hasSignificantDivergence: boolean;
  performanceSpread?: number;
  bestContext?: CategoryId;
  worstContext?: CategoryId;

  /** Synthesis activity */
  synthesisNotesCount: number;
  pendingSynthesisPrompts: number;
  bridgeCardsCount: number;

  /** Recommendations */
  recommendations: {
    type:
      | "add_to_context"
      | "remove_from_context"
      | "review_in_context"
      | "create_bridge"
      | "synthesis_needed";
    categoryId?: CategoryId;
    priority: number;
    reason: string;
  }[];
}

/**
 * Category participation analytics
 */
export interface CategoryParticipationAnalytics {
  categoryId: CategoryId;
  totalCards: number;

  /** Cards by role */
  cardsByRole: Record<ExtendedSemanticRole, number>;

  /** Performance distribution */
  masteryDistribution: {
    range: string;
    count: number;
  }[];

  /** Average metrics */
  avgMastery: number;
  avgReviewCount: number;

  /** Cards needing attention */
  cardsWithDivergence: number;
  cardsNeedingSynthesis: number;

  /** Bridge card coverage */
  bridgeCardsIn: number;
  bridgeCardsOut: number;
}

// =============================================================================
// EVENT TYPES (for plugin hooks and AI integration)
// =============================================================================

/**
 * Events emitted by the multi-belonging system
 */
export type MultiBelongingEvent =
  | {
      type: "participation_added";
      data: {
        participationId: ParticipationId;
        cardId: CardId;
        categoryId: CategoryId;
      };
    }
  | {
      type: "participation_removed";
      data: { cardId: CardId; categoryId: CategoryId };
    }
  | {
      type: "participation_updated";
      data: { participationId: ParticipationId; changes: string[] };
    }
  | {
      type: "role_changed";
      data: {
        participationId: ParticipationId;
        oldRole: string;
        newRole: string;
      };
    }
  | {
      type: "divergence_detected";
      data: { cardId: CardId; severity: DivergenceSeverity; spread: number };
    }
  | {
      type: "synthesis_prompt_created";
      data: {
        promptId: SynthesisPromptId;
        cardId: CardId;
        triggerType: string;
      };
    }
  | {
      type: "synthesis_completed";
      data: {
        promptId: SynthesisPromptId;
        createdNoteId?: string;
        createdBridgeId?: string;
      };
    }
  | {
      type: "bridge_card_created";
      data: { bridgeCardId: BridgeCardId; bridgeType: BridgeType };
    };

/**
 * Plugin hook for participation suggestions
 */
export interface ParticipationSuggestionProvider {
  /** Unique identifier for this provider */
  id: string;
  /** Human-readable name */
  name: string;
  /** Suggest participations for a card */
  suggestParticipations(
    cardId: CardId,
    existingParticipations: ParticipationId[],
  ): Promise<
    {
      categoryId: CategoryId;
      suggestedRole: ExtendedSemanticRole;
      confidence: number;
      reason: string;
    }[]
  >;
}

/**
 * Plugin hook for synthesis prompt generation
 */
export interface SynthesisPromptGenerator {
  /** Unique identifier */
  id: string;
  /** Generate a synthesis prompt for a card */
  generatePrompt(
    cardId: CardId,
    categoryIds: CategoryId[],
    triggerType: SynthesisTriggerType,
  ): Promise<{
    promptType: SynthesisPromptType;
    promptText: string;
    alternativePrompts: string[];
    hints: string[];
  } | null>;
}

/**
 * Plugin hook for bridge card recommendations
 */
export interface BridgeCardRecommender {
  /** Unique identifier */
  id: string;
  /** Recommend bridge cards */
  recommendBridges(
    cardId: CardId,
    participations: ParticipationWithCategory[],
  ): Promise<
    {
      bridgeType: BridgeType;
      targetCardId?: CardId;
      targetCategoryId?: CategoryId;
      suggestedQuestion: string;
      suggestedAnswer: string;
      confidence: number;
      rationale: string;
    }[]
  >;
}
