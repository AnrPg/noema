// =============================================================================
// REVIEW ENHANCEMENTS TYPES
// =============================================================================
// Phase 6E: Type definitions for enhanced review UI with multi-face support

// =============================================================================
// FACE RENDERING TYPES
// =============================================================================

import type { CardFaceType, ContentPrimitive } from "@manthanein/shared";
import type { DepthLevel, EditablePrimitive } from "../card-editor";

// Re-export for convenience
export type { ContentPrimitive } from "@manthanein/shared";
export type FaceType = CardFaceType;

/**
 * Face data for review rendering
 */
export interface ReviewFace {
  id: string;
  type: FaceType;
  depthLevel: DepthLevel;
  question: ContentPrimitive[];
  answer: ContentPrimitive[];
  hints?: ContentPrimitive[];
  explanation?: ContentPrimitive[];
  scaffoldingLevel: number;
  isActive: boolean;
}

/**
 * Card data for review with multi-face support
 */
export interface ReviewCard {
  id: string;
  canonicalId?: string;
  title?: string;
  faces: ReviewFace[];
  activeFaceIndex: number;
  tags: string[];
  deckId?: string;
  deckName?: string;
  categories?: ReviewCardCategory[];
}

/**
 * Category association for review cards
 */
export interface ReviewCardCategory {
  id: string;
  name: string;
  color?: string;
  icon?: string;
}

// =============================================================================
// CONTEXT INDICATOR TYPES
// =============================================================================

/**
 * Why this card was selected for review
 */
export type CardSelectionReason =
  | "due_review"
  | "spaced_repetition"
  | "interleaving"
  | "priority_boost"
  | "lapsed"
  | "new_card"
  | "related_to_previous"
  | "category_focus"
  | "user_requested";

/**
 * Context information for card presentation
 */
export interface CardContext {
  /** Why this card was selected */
  selectionReason: CardSelectionReason;
  /** Confidence level in selection (0-1) */
  confidence: number;
  /** Related cards if any */
  relatedCards?: string[];
  /** Relationship type to previous card */
  relationshipToPrevious?: "prerequisite" | "sibling" | "extension" | "contrast";
  /** Active learning mode affecting this card */
  learningMode?: string;
  /** Session goal context */
  sessionGoalContext?: string;
  /** Additional explainability data */
  explainability?: CardExplainability;
}

/**
 * Detailed explainability data from the session orchestrator
 */
export interface CardExplainability {
  /** Human-readable explanation */
  summary: string;
  /** Scheduling factors that led to this card */
  schedulingFactors: SchedulingFactor[];
  /** Memory model predictions */
  memoryPrediction: MemoryPrediction;
  /** Alternative cards that could have been shown */
  alternativeCards?: AlternativeCard[];
}

/**
 * Individual scheduling factor
 */
export interface SchedulingFactor {
  factor: string;
  weight: number;
  description: string;
  icon?: string;
}

/**
 * Memory model prediction for the card
 */
export interface MemoryPrediction {
  /** Current retrievability (0-1) */
  retrievability: number;
  /** Memory stability in days */
  stability: number;
  /** Card difficulty (0-1) */
  difficulty: number;
  /** Predicted next optimal review time */
  optimalReviewTime?: Date;
  /** Expected retention if reviewed now */
  expectedRetention?: number;
}

/**
 * Alternative card that could have been shown
 */
export interface AlternativeCard {
  id: string;
  title?: string;
  reason: string;
  retrievability: number;
}

// =============================================================================
// REVIEW FEEDBACK TYPES
// =============================================================================

/**
 * Enhanced review response with detailed feedback
 */
export interface EnhancedReviewResponse {
  /** User rating (1-4) */
  rating: 1 | 2 | 3 | 4;
  /** Response time in milliseconds */
  responseTimeMs: number;
  /** Which face was reviewed */
  faceId: string;
  /** Whether hints were used */
  hintsUsed: boolean;
  /** Number of hints revealed */
  hintsRevealedCount: number;
  /** User-reported confidence (0-1) */
  selfReportedConfidence?: number;
  /** Active lens/category during review */
  activeLensId?: string;
}

/**
 * Review result from the scheduling system
 */
export interface ReviewResult {
  /** New stability value */
  newStability: number;
  /** New difficulty value */
  newDifficulty: number;
  /** Next review date */
  nextReview: Date;
  /** XP earned */
  xpEarned: number;
  /** Combo maintained */
  comboMaintained: boolean;
  /** Streak info */
  streakInfo?: {
    currentStreak: number;
    longestStreak: number;
    streakBroken: boolean;
  };
}

// =============================================================================
// COMPONENT PROPS
// =============================================================================

/**
 * Multi-face card renderer props
 */
export interface MultiFaceCardRendererProps {
  /** Card to render */
  card: ReviewCard;
  /** Whether card is flipped to show answer */
  isFlipped: boolean;
  /** Callback when card is tapped to flip */
  onFlip: () => void;
  /** Callback to show hint */
  onShowHint?: () => void;
  /** Number of hints revealed */
  hintsRevealed: number;
  /** Card context for indicators */
  context?: CardContext;
  /** Whether to show context indicators */
  showContextIndicators?: boolean;
  /** Animation style */
  animationStyle?: "flip" | "slide" | "fade";
}

/**
 * Context indicator bar props
 */
export interface ContextIndicatorBarProps {
  /** Card context */
  context: CardContext;
  /** Whether expanded view is shown */
  isExpanded: boolean;
  /** Callback to toggle expansion */
  onToggleExpand: () => void;
  /** Compact mode for small screens */
  compact?: boolean;
}

/**
 * Explainability panel props
 */
export interface ExplainabilityPanelProps {
  /** Explainability data */
  explainability: CardExplainability;
  /** Whether panel is visible */
  visible: boolean;
  /** Callback to close panel */
  onClose: () => void;
  /** Whether to show alternatives */
  showAlternatives?: boolean;
}

/**
 * Memory prediction display props
 */
export interface MemoryPredictionDisplayProps {
  /** Prediction data */
  prediction: MemoryPrediction;
  /** Display mode */
  mode: "compact" | "detailed" | "visual";
}

/**
 * Hint revealer props
 */
export interface HintRevealerProps {
  /** Available hints */
  hints: ContentPrimitive[];
  /** Number of hints revealed */
  revealedCount: number;
  /** Callback to reveal next hint */
  onRevealNext: () => void;
  /** Whether all hints are revealed */
  allRevealed: boolean;
}

/**
 * Face selector for multi-face cards (during review)
 */
export interface ReviewFaceSelectorProps {
  /** Available faces */
  faces: ReviewFace[];
  /** Currently active face index */
  activeFaceIndex: number;
  /** Callback when face is selected */
  onFaceSelect: (index: number) => void;
  /** Whether selection is disabled (during answer reveal) */
  disabled?: boolean;
}

/**
 * Rating button configuration
 */
export interface RatingButtonConfig {
  rating: 1 | 2 | 3 | 4;
  label: string;
  sublabel?: string;
  color: string;
  icon: string;
  hapticStyle: "light" | "medium" | "heavy";
}

/**
 * Enhanced rating buttons props
 */
export interface EnhancedRatingButtonsProps {
  /** Callback when rating is selected */
  onRate: (response: EnhancedReviewResponse) => void;
  /** Current face ID being reviewed */
  faceId: string;
  /** Response start time */
  responseStartTime: number;
  /** Hints revealed count */
  hintsRevealedCount: number;
  /** Active lens ID */
  activeLensId?: string;
  /** Whether to show confidence slider */
  showConfidenceSlider?: boolean;
  /** Button configuration overrides */
  buttonConfig?: Partial<RatingButtonConfig>[];
}

// =============================================================================
// METADATA & CONSTANTS
// =============================================================================

/**
 * Selection reason metadata
 */
export const SELECTION_REASON_METADATA: Record<
  CardSelectionReason,
  { label: string; description: string; icon: string; color: string }
> = {
  due_review: {
    label: "Due",
    description: "This card is due for review based on your schedule",
    icon: "time-outline",
    color: "#3B82F6",
  },
  spaced_repetition: {
    label: "Spaced",
    description: "Optimal spacing interval reached",
    icon: "calendar-outline",
    color: "#8B5CF6",
  },
  interleaving: {
    label: "Mixed",
    description: "Interleaved for better learning",
    icon: "shuffle-outline",
    color: "#F59E0B",
  },
  priority_boost: {
    label: "Priority",
    description: "Boosted due to importance or difficulty",
    icon: "arrow-up-circle-outline",
    color: "#EF4444",
  },
  lapsed: {
    label: "Relearn",
    description: "Previously forgotten, needs reinforcement",
    icon: "refresh-outline",
    color: "#F97316",
  },
  new_card: {
    label: "New",
    description: "First time seeing this card",
    icon: "sparkles-outline",
    color: "#10B981",
  },
  related_to_previous: {
    label: "Related",
    description: "Connected to the previous card",
    icon: "git-branch-outline",
    color: "#6366F1",
  },
  category_focus: {
    label: "Focus",
    description: "Part of your current category focus",
    icon: "flag-outline",
    color: "#EC4899",
  },
  user_requested: {
    label: "Requested",
    description: "You specifically requested this card",
    icon: "hand-right-outline",
    color: "#14B8A6",
  },
};

/**
 * Rating button presets
 */
export const RATING_BUTTON_PRESETS: RatingButtonConfig[] = [
  {
    rating: 1,
    label: "Again",
    sublabel: "Forgot completely",
    color: "#EF4444",
    icon: "close-circle",
    hapticStyle: "heavy",
  },
  {
    rating: 2,
    label: "Hard",
    sublabel: "Struggled to recall",
    color: "#F59E0B",
    icon: "alert-circle",
    hapticStyle: "medium",
  },
  {
    rating: 3,
    label: "Good",
    sublabel: "Recalled with effort",
    color: "#10B981",
    icon: "checkmark-circle",
    hapticStyle: "medium",
  },
  {
    rating: 4,
    label: "Easy",
    sublabel: "Instant recall",
    color: "#3B82F6",
    icon: "star",
    hapticStyle: "light",
  },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get the appropriate selection reason metadata
 */
export function getSelectionReasonMeta(reason: CardSelectionReason) {
  return SELECTION_REASON_METADATA[reason];
}

/**
 * Format retrievability as percentage
 */
export function formatRetrievability(retrievability: number): string {
  return `${Math.round(retrievability * 100)}%`;
}

/**
 * Format stability in human-readable time
 */
export function formatStability(stabilityDays: number): string {
  if (stabilityDays < 1) {
    return `${Math.round(stabilityDays * 24)}h`;
  } else if (stabilityDays < 30) {
    return `${Math.round(stabilityDays)}d`;
  } else if (stabilityDays < 365) {
    return `${Math.round(stabilityDays / 30)}mo`;
  } else {
    return `${(stabilityDays / 365).toFixed(1)}y`;
  }
}

/**
 * Get difficulty label
 */
export function getDifficultyLabel(difficulty: number): string {
  if (difficulty < 0.2) return "Very Easy";
  if (difficulty < 0.4) return "Easy";
  if (difficulty < 0.6) return "Moderate";
  if (difficulty < 0.8) return "Hard";
  return "Very Hard";
}

/**
 * Calculate effective response considering hints
 */
export function calculateEffectiveRating(
  rating: 1 | 2 | 3 | 4,
  hintsUsed: number,
  totalHints: number
): number {
  if (hintsUsed === 0 || totalHints === 0) return rating;
  const hintPenalty = (hintsUsed / totalHints) * 0.5;
  return Math.max(1, rating - hintPenalty);
}

/**
 * Generate review response object
 */
export function createReviewResponse(
  rating: 1 | 2 | 3 | 4,
  faceId: string,
  responseStartTime: number,
  hintsRevealedCount: number,
  activeLensId?: string,
  selfReportedConfidence?: number
): EnhancedReviewResponse {
  return {
    rating,
    responseTimeMs: Date.now() - responseStartTime,
    faceId,
    hintsUsed: hintsRevealedCount > 0,
    hintsRevealedCount,
    activeLensId,
    selfReportedConfidence,
  };
}
