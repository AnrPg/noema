// =============================================================================
// SCHEDULER & ALGORITHM TYPES
// =============================================================================
// These types define the spaced repetition scheduling algorithms.
// Supports FSRS, Half-Life Regression, SM-2, Leitner, and custom algorithms.

/**
 * Supported spaced repetition scheduling algorithms.
 * Each has different characteristics and research basis.
 */
export type SchedulerType =
  | "fsrs" // Free Spaced Repetition Scheduler (most accurate)
  | "hlr" // Half-Life Regression (Duolingo style)
  | "sm2" // SuperMemo 2 (classic, simple)
  | "leitner" // Leitner box system (beginner-friendly)
  | "anki_default" // Anki's default algorithm
  | "custom"; // Plugin-provided custom algorithm

/**
 * Base configuration shared by all schedulers
 */
export interface BaseSchedulerConfig {
  readonly type: SchedulerType;
  readonly targetRetention: number; // 0.75 - 0.95 (probability)
  readonly maximumInterval: number; // Max days between reviews
  readonly minimumInterval: number; // Min days between reviews
  readonly fuzzFactor: boolean; // Add randomness to prevent clustering
  readonly hardIntervalModifier: number; // Multiplier for "hard" rating
  readonly easyIntervalModifier: number; // Multiplier for "easy" rating
}

// =============================================================================
// FSRS (FREE SPACED REPETITION SCHEDULER)
// =============================================================================
// Based on research by Jarrett Ye et al.
// Paper: "A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition"

/**
 * FSRS algorithm parameters
 * These 21 weights are learned from user review history
 * w[0-3]: Initial stability for each rating
 * w[4-5]: Initial difficulty calculation
 * w[6]: Difficulty update after review
 * w[7]: Mean reversion strength for difficulty
 * w[8-10]: Stability increase factors for successful recall
 * w[11-14]: Stability decrease factors for failed recall
 * w[15]: Hard penalty
 * w[16]: Easy bonus
 * w[17-19]: Short-term stability factors
 * w[20]: Decay rate
 */
export interface FSRSConfig extends BaseSchedulerConfig {
  readonly type: "fsrs";

  // The 21 FSRS parameters (w[0] through w[20])
  readonly weights: FSRSWeights;

  // Algorithm-specific settings
  readonly enableShortTermStability: boolean; // Use short-term memory model
  readonly decayFactor: number; // Memory decay rate
}

/**
 * FSRS weight parameters with named fields for clarity
 */
export interface FSRSWeights {
  // Initial stability for first review (one per rating)
  readonly initialStabilityAgain: number; // w[0]: ~0.2
  readonly initialStabilityHard: number; // w[1]: ~1.3
  readonly initialStabilityGood: number; // w[2]: ~2.3
  readonly initialStabilityEasy: number; // w[3]: ~8.3

  // Initial difficulty calculation
  readonly initialDifficultyBase: number; // w[4]: ~6.4
  readonly initialDifficultyModifier: number; // w[5]: ~0.83

  // Difficulty update parameters
  readonly difficultyUpdate: number; // w[6]: ~3.0
  readonly meanReversionStrength: number; // w[7]: ~0.001

  // Stability increase factors (successful recall)
  readonly stabilityBase: number; // w[8]: ~1.87
  readonly stabilityDifficultyDecay: number; // w[9]: ~0.17
  readonly stabilityRetrievabilityFactor: number; // w[10]: ~0.80

  // Stability decrease factors (failed recall)
  readonly forgetStabilityBase: number; // w[11]: ~1.48
  readonly forgetDifficultyFactor: number; // w[12]: ~0.061
  readonly forgetStabilityFactor: number; // w[13]: ~0.26
  readonly forgetRetrievabilityFactor: number; // w[14]: ~1.65

  // Rating modifiers
  readonly hardPenalty: number; // w[15]: ~0.60
  readonly easyBonus: number; // w[16]: ~1.87

  // Short-term stability
  readonly shortTermBase: number; // w[17]: ~0.54
  readonly shortTermModifier: number; // w[18]: ~0.091
  readonly shortTermDecay: number; // w[19]: ~0.066

  // Memory decay
  readonly decayRate: number; // w[20]: ~0.15
}

/**
 * Default FSRS weights (from FSRS v6.1.1)
 * These are general defaults; optimize for each user with their review history
 */
export const DEFAULT_FSRS_WEIGHTS: FSRSWeights = {
  initialStabilityAgain: 0.212,
  initialStabilityHard: 1.2931,
  initialStabilityGood: 2.3065,
  initialStabilityEasy: 8.2956,
  initialDifficultyBase: 6.4133,
  initialDifficultyModifier: 0.8334,
  difficultyUpdate: 3.0194,
  meanReversionStrength: 0.001,
  stabilityBase: 1.8722,
  stabilityDifficultyDecay: 0.1666,
  stabilityRetrievabilityFactor: 0.796,
  forgetStabilityBase: 1.4835,
  forgetDifficultyFactor: 0.0614,
  forgetStabilityFactor: 0.2629,
  forgetRetrievabilityFactor: 1.6483,
  hardPenalty: 0.6014,
  easyBonus: 1.8729,
  shortTermBase: 0.5425,
  shortTermModifier: 0.0912,
  shortTermDecay: 0.0658,
  decayRate: 0.1542,
} as const;

/**
 * Default FSRS configuration
 */
export const DEFAULT_FSRS_CONFIG: FSRSConfig = {
  type: "fsrs",
  targetRetention: 0.9,
  maximumInterval: 36500, // ~100 years
  minimumInterval: 1,
  fuzzFactor: true,
  hardIntervalModifier: 1.2,
  easyIntervalModifier: 1.3,
  weights: DEFAULT_FSRS_WEIGHTS,
  enableShortTermStability: true,
  decayFactor: -0.5, // Power law decay
} as const;

// =============================================================================
// HALF-LIFE REGRESSION (HLR) - Duolingo Style
// =============================================================================
// Based on Duolingo's research paper:
// "A Trainable Spaced Repetition Model for Language Learning"

/**
 * Half-Life Regression configuration
 * Models memory as exponential decay with learnable half-life
 */
export interface HLRConfig extends BaseSchedulerConfig {
  readonly type: "hlr";

  // Core HLR parameters
  readonly baseHalfLife: number; // Initial half-life in days
  readonly halfLifeMultiplierCorrect: number; // How much to increase on correct
  readonly halfLifeMultiplierIncorrect: number; // How much to decrease on incorrect

  // Feature weights (for personalization)
  readonly featureWeights: HLRFeatureWeights;

  // Threshold for scheduling
  readonly recallThreshold: number; // Review when p(recall) drops below this
}

/**
 * Feature weights for HLR model
 * These can be learned from user data
 */
export interface HLRFeatureWeights {
  readonly lagTime: number; // Weight for time since last review
  readonly previousCorrectCount: number; // Weight for correct history
  readonly previousIncorrectCount: number; // Weight for incorrect history
  readonly difficulty: number; // Weight for card difficulty
  readonly lexemeFrequency: number; // Weight for word frequency (language learning)
}

/**
 * Default HLR configuration
 */
export const DEFAULT_HLR_CONFIG: HLRConfig = {
  type: "hlr",
  targetRetention: 0.9,
  maximumInterval: 365,
  minimumInterval: 1,
  fuzzFactor: true,
  hardIntervalModifier: 0.8,
  easyIntervalModifier: 1.5,
  baseHalfLife: 2,
  halfLifeMultiplierCorrect: 2.0,
  halfLifeMultiplierIncorrect: 0.5,
  featureWeights: {
    lagTime: -0.05,
    previousCorrectCount: 0.1,
    previousIncorrectCount: -0.2,
    difficulty: -0.15,
    lexemeFrequency: 0.05,
  },
  recallThreshold: 0.5,
} as const;

// =============================================================================
// SM-2 (SUPERMEMO 2)
// =============================================================================
// Classic algorithm from SuperMemo, still widely used
// Simple but less accurate than FSRS/HLR

/**
 * SM-2 configuration
 */
export interface SM2Config extends BaseSchedulerConfig {
  readonly type: "sm2";

  readonly initialEaseFactor: number; // Starting ease (typically 2.5)
  readonly minimumEaseFactor: number; // Floor for ease (typically 1.3)
  readonly easeFactorIncrement: number; // Increase on easy
  readonly easeFactorDecrement: number; // Decrease on hard/again
  readonly againPenalty: number; // Ease reduction on "again"
}

/**
 * Default SM-2 configuration
 */
export const DEFAULT_SM2_CONFIG: SM2Config = {
  type: "sm2",
  targetRetention: 0.9,
  maximumInterval: 36500,
  minimumInterval: 1,
  fuzzFactor: true,
  hardIntervalModifier: 1.2,
  easyIntervalModifier: 1.3,
  initialEaseFactor: 2.5,
  minimumEaseFactor: 1.3,
  easeFactorIncrement: 0.15,
  easeFactorDecrement: 0.2,
  againPenalty: 0.2,
} as const;

// =============================================================================
// LEITNER BOX SYSTEM
// =============================================================================
// Simple box-based system, good for beginners
// Cards move between boxes based on correct/incorrect answers

/**
 * Leitner configuration
 */
export interface LeitnerConfig extends BaseSchedulerConfig {
  readonly type: "leitner";

  readonly boxCount: number; // Number of boxes (typically 5-7)
  readonly boxIntervals: readonly number[]; // Days for each box
  readonly correctAction: "advance" | "skip"; // Move to next box or skip one
  readonly incorrectAction: "reset" | "demote"; // Back to box 1 or previous box
}

/**
 * Default Leitner configuration
 */
export const DEFAULT_LEITNER_CONFIG: LeitnerConfig = {
  type: "leitner",
  targetRetention: 0.85,
  maximumInterval: 365,
  minimumInterval: 1,
  fuzzFactor: false,
  hardIntervalModifier: 1.0,
  easyIntervalModifier: 1.0,
  boxCount: 5,
  boxIntervals: [1, 2, 7, 14, 30], // Days per box
  correctAction: "advance",
  incorrectAction: "reset",
} as const;

// =============================================================================
// UNION TYPES
// =============================================================================

/**
 * Union of all scheduler configurations
 */
export type SchedulerConfig =
  | FSRSConfig
  | HLRConfig
  | SM2Config
  | LeitnerConfig;

/**
 * Get default config for a scheduler type
 */
export function getDefaultSchedulerConfig(
  type: SchedulerType,
): SchedulerConfig {
  switch (type) {
    case "fsrs":
      return DEFAULT_FSRS_CONFIG;
    case "hlr":
      return DEFAULT_HLR_CONFIG;
    case "sm2":
    case "anki_default":
      return DEFAULT_SM2_CONFIG;
    case "leitner":
      return DEFAULT_LEITNER_CONFIG;
    case "custom":
      return DEFAULT_FSRS_CONFIG; // Default to FSRS for custom
    default:
      return DEFAULT_FSRS_CONFIG;
  }
}

// =============================================================================
// SCHEDULING RESULT TYPES
// =============================================================================

/**
 * Simple result from scheduling a single rating
 * This is the format expected by API route handlers
 */
export interface SimpleSchedulingResult {
  readonly interval: number; // Days until next review
  readonly stability: number; // New stability value
  readonly difficulty: number; // New difficulty value
  readonly retrievability: number; // Predicted retrievability at next review
  readonly dueDate: Date; // When the card is due
}

/**
 * Result from a scheduling calculation
 * Contains new intervals for each possible rating
 */
export interface SchedulingResult {
  readonly cardId: string;
  readonly timestamp: Date;

  // Current state
  readonly currentRetrievability: number;
  readonly currentStability: number;
  readonly currentDifficulty: number;

  // Predicted intervals for each rating
  readonly againInterval: IntervalPrediction;
  readonly hardInterval: IntervalPrediction;
  readonly goodInterval: IntervalPrediction;
  readonly easyInterval: IntervalPrediction;
}

/**
 * Prediction for a specific rating
 */
export interface IntervalPrediction {
  readonly rating: string;
  readonly interval: number; // Days until next review
  readonly dueDate: Date;
  readonly newStability: number;
  readonly newDifficulty: number;
  readonly predictedRetrievability: number; // R at next review time
}

// =============================================================================
// FATIGUE & CONTEXT-AWARE SCHEDULING
// =============================================================================

/**
 * Context that affects scheduling decisions
 * Research basis: Circadian rhythms, fatigue, sleep
 */
export interface SchedulingContext {
  // Time context
  readonly localTime: Date;
  readonly timeOfDay: "morning" | "afternoon" | "evening" | "night";
  readonly dayOfWeek: number; // 0-6

  // Session context
  readonly cardsReviewedToday: number;
  readonly minutesStudiedToday: number;
  readonly sessionDuration: number; // Current session minutes
  readonly recentAccuracy: number; // Last N cards accuracy

  // User state (if tracked)
  readonly estimatedFatigue: number; // 0-1
  readonly lastSleepQuality: number | null; // 0-1 if tracked
  readonly lastSleepHours: number | null;

  // Device context
  readonly platform: string;
  readonly isOffline: boolean;
}

/**
 * Fatigue-aware scheduling adjustments
 */
export interface FatigueAdjustment {
  readonly shouldReduceNewCards: boolean;
  readonly newCardReduction: number; // 0-1, how much to reduce
  readonly shouldExtendIntervals: boolean;
  readonly intervalExtension: number; // 0-1, how much to extend
  readonly suggestedBreak: boolean;
  readonly breakDurationMinutes: number;
  readonly reason: string;
}
