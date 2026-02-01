// =============================================================================
// FSRS (FREE SPACED REPETITION SCHEDULER) - TypeScript Implementation
// =============================================================================
// Based on the FSRS v6.1.1 algorithm by Jarrett Ye
// Paper: "A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition"
// Repository: https://github.com/open-spaced-repetition/fsrs4anki
//
// FSRS models memory with two key concepts:
// 1. Stability (S): How long a memory lasts before decay
// 2. Difficulty (D): How hard a card is to remember (affects stability changes)
//
// The forgetting curve is modeled as: R(t) = (1 + t/(9*S))^(-1)
// Where R is retrievability (recall probability) and t is time since last review

import type { Rating, CardState, CardSRSState } from "../types/card.types";
import type {
  FSRSConfig,
  FSRSWeights,
  SchedulingResult,
  SimpleSchedulingResult,
  IntervalPrediction,
  SchedulingContext,
} from "../types/scheduler.types";
import {
  RatingValues,
  DEFAULT_FSRS_CONFIG,
  DEFAULT_FSRS_WEIGHTS,
} from "../types";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * The decay rate used in FSRS's power-law forgetting curve.
 * This value (-0.5) creates a power-law decay that matches empirical data.
 * Formula: R(t) = (1 + FACTOR * t / S) ^ DECAY
 */
const DECAY = -0.5;

/**
 * Factor derived from the decay rate to ensure R = 0.9 when t = S.
 * Calculated as: (0.9 ^ (1 / DECAY)) - 1 ≈ 19/81
 * This means when elapsed time equals stability, retrievability is 90%.
 */
const FACTOR = 19 / 81; // ≈ 0.2346

/**
 * Rating values as numbers for calculations
 */
const RATINGS = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
} as const;

// =============================================================================
// FSRS CLASS
// =============================================================================

/**
 * FSRS Scheduler - Implements the Free Spaced Repetition Scheduler algorithm
 *
 * The algorithm works by:
 * 1. Tracking memory stability (S) - how long until 90% forgetting
 * 2. Tracking difficulty (D) - inherent card difficulty (1-10)
 * 3. Calculating retrievability (R) - current recall probability
 * 4. Predicting optimal review intervals based on target retention
 */
export class FSRSScheduler {
  // Algorithm weights (21 parameters learned from data)
  private readonly w: number[];

  // Configuration
  private readonly config: FSRSConfig;

  // Derived constants from decay rate
  private readonly decay: number;
  private readonly factor: number;

  /**
   * Create a new FSRS scheduler instance
   * @param config - Configuration including weights and retention target
   */
  constructor(config: Partial<FSRSConfig> = {}) {
    // Merge provided config with defaults
    this.config = { ...DEFAULT_FSRS_CONFIG, ...config };

    // Convert named weights to array for calculation (matches original implementation)
    this.w = this.weightsToArray(this.config.weights);

    // Calculate decay constants
    // w[20] is the decay rate parameter
    this.decay = -this.w[20];
    this.factor = Math.pow(0.9, 1 / this.decay) - 1;
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Calculate scheduling options for a card
   * Returns predicted intervals for each possible rating (again/hard/good/easy)
   *
   * @param currentState - Current SRS state of the card
   * @param context - Additional context (time, fatigue, etc.)
   * @returns Scheduling predictions for each rating
   */
  public schedule(
    currentState: CardSRSState,
    context?: SchedulingContext,
  ): SchedulingResult {
    const now = new Date();

    // For new cards, calculate initial values
    if (currentState.state === "new") {
      return this.scheduleNewCard(now);
    }

    // For learning/relearning cards, use short-term stability model
    if (
      currentState.state === "learning" ||
      currentState.state === "relearning"
    ) {
      return this.scheduleLearningCard(currentState, now);
    }

    // For review cards, use full FSRS model
    return this.scheduleReviewCard(currentState, now);
  }

  /**
   * Calculate scheduling result for a specific rating
   * This is the simpler interface for API use
   *
   * @param currentState - Current SRS state of the card
   * @param rating - The rating to calculate for
   * @returns Simple scheduling result with interval, stability, difficulty
   */
  public scheduleRating(
    currentState: CardSRSState,
    rating: Rating,
  ): SimpleSchedulingResult {
    const fullResult = this.schedule(currentState);
    const ratingKey = `${rating}Interval` as keyof SchedulingResult;
    const prediction = fullResult[ratingKey] as IntervalPrediction;

    return {
      interval: prediction.interval,
      stability: prediction.newStability,
      difficulty: prediction.newDifficulty,
      retrievability: prediction.predictedRetrievability,
      dueDate: prediction.dueDate,
    };
  }

  /**
   * Update card state after a review
   *
   * @param currentState - Current SRS state
   * @param rating - User's rating (again/hard/good/easy)
   * @param responseTime - Time to answer in milliseconds (for future use)
   * @returns Updated SRS state
   */
  public updateAfterReview(
    currentState: CardSRSState,
    rating: Rating,
    responseTime: number,
  ): CardSRSState {
    const now = new Date();
    const ratingNum = RATINGS[rating];

    // Handle new cards
    if (currentState.state === "new") {
      return this.initializeNewCard(rating, now);
    }

    // Handle learning/relearning cards
    if (
      currentState.state === "learning" ||
      currentState.state === "relearning"
    ) {
      return this.updateLearningCard(currentState, rating, now);
    }

    // Handle review cards
    return this.updateReviewCard(currentState, rating, now);
  }

  /**
   * Calculate the retrievability (recall probability) for a card
   *
   * @param stability - Memory stability in days
   * @param elapsedDays - Days since last review
   * @returns Probability of recall (0-1)
   */
  public getRetrievability(stability: number, elapsedDays: number): number {
    return this.forgettingCurve(elapsedDays, stability);
  }

  /**
   * Calculate the optimal interval for a given retention target
   *
   * @param stability - Memory stability in days
   * @param targetRetention - Desired recall probability (default from config)
   * @returns Optimal interval in days
   */
  public getOptimalInterval(
    stability: number,
    targetRetention: number = this.config.targetRetention,
  ): number {
    return this.nextInterval(stability, targetRetention);
  }

  // ===========================================================================
  // SCHEDULING METHODS
  // ===========================================================================

  /**
   * Schedule a new card (never reviewed before)
   * Initial stability and difficulty depend on the first rating
   */
  private scheduleNewCard(now: Date): SchedulingResult {
    // Calculate initial values for each possible rating
    const againD = this.initDifficulty(RATINGS.again);
    const againS = this.initStability(RATINGS.again);

    const hardD = this.initDifficulty(RATINGS.hard);
    const hardS = this.initStability(RATINGS.hard);

    const goodD = this.initDifficulty(RATINGS.good);
    const goodS = this.initStability(RATINGS.good);

    const easyD = this.initDifficulty(RATINGS.easy);
    const easyS = this.initStability(RATINGS.easy);

    // Calculate intervals
    // For new cards, 'again' and 'hard' typically stay in learning
    // 'good' graduates to review, 'easy' graduates with longer interval
    const goodInterval = this.nextInterval(goodS);
    const easyInterval = Math.max(this.nextInterval(easyS), goodInterval + 1);

    return {
      cardId: "",
      timestamp: now,
      currentRetrievability: 1, // New card, hasn't been tested
      currentStability: 0,
      currentDifficulty: 0,

      againInterval: this.createPrediction("again", 0, againS, againD, now), // Stay in learning
      hardInterval: this.createPrediction("hard", 0, hardS, hardD, now), // Stay in learning
      goodInterval: this.createPrediction(
        "good",
        goodInterval,
        goodS,
        goodD,
        now,
      ),
      easyInterval: this.createPrediction(
        "easy",
        easyInterval,
        easyS,
        easyD,
        now,
      ),
    };
  }

  /**
   * Schedule a card in learning/relearning state
   * Uses short-term stability model
   */
  private scheduleLearningCard(
    state: CardSRSState,
    now: Date,
  ): SchedulingResult {
    const lastD = state.difficulty;
    const lastS = state.stability;

    // Calculate new values for each rating using short-term model
    const againD = this.nextDifficulty(lastD, RATINGS.again);
    const againS = this.nextShortTermStability(lastS, RATINGS.again);

    const hardD = this.nextDifficulty(lastD, RATINGS.hard);
    const hardS = this.nextShortTermStability(lastS, RATINGS.hard);

    const goodD = this.nextDifficulty(lastD, RATINGS.good);
    const goodS = this.nextShortTermStability(lastS, RATINGS.good);

    const easyD = this.nextDifficulty(lastD, RATINGS.easy);
    const easyS = this.nextShortTermStability(lastS, RATINGS.easy);

    // Good and easy graduate to review
    const goodInterval = this.nextInterval(goodS);
    const easyInterval = Math.max(this.nextInterval(easyS), goodInterval + 1);

    return {
      cardId: "",
      timestamp: now,
      currentRetrievability: this.forgettingCurve(state.elapsedDays, lastS),
      currentStability: lastS,
      currentDifficulty: lastD,

      againInterval: this.createPrediction("again", 0, againS, againD, now),
      hardInterval: this.createPrediction("hard", 0, hardS, hardD, now),
      goodInterval: this.createPrediction(
        "good",
        goodInterval,
        goodS,
        goodD,
        now,
      ),
      easyInterval: this.createPrediction(
        "easy",
        easyInterval,
        easyS,
        easyD,
        now,
      ),
    };
  }

  /**
   * Schedule a review card (in regular review cycle)
   * Uses full FSRS model with recall/forget stability updates
   */
  private scheduleReviewCard(state: CardSRSState, now: Date): SchedulingResult {
    const elapsedDays = state.elapsedDays;
    const lastD = state.difficulty;
    const lastS = state.stability;

    // Calculate current retrievability (how likely to recall)
    const retrievability = this.forgettingCurve(elapsedDays, lastS);

    // Calculate new values for each rating
    // 'Again' uses forget stability (memory lapsed)
    const againD = this.nextDifficulty(lastD, RATINGS.again);
    const againS = this.nextForgetStability(lastD, lastS, retrievability);

    // 'Hard', 'Good', 'Easy' use recall stability (memory reinforced)
    const hardD = this.nextDifficulty(lastD, RATINGS.hard);
    const hardS = this.nextRecallStability(
      lastD,
      lastS,
      retrievability,
      RATINGS.hard,
    );

    const goodD = this.nextDifficulty(lastD, RATINGS.good);
    const goodS = this.nextRecallStability(
      lastD,
      lastS,
      retrievability,
      RATINGS.good,
    );

    const easyD = this.nextDifficulty(lastD, RATINGS.easy);
    const easyS = this.nextRecallStability(
      lastD,
      lastS,
      retrievability,
      RATINGS.easy,
    );

    // Calculate intervals, ensuring proper ordering
    let hardInterval = this.nextInterval(hardS);
    let goodInterval = this.nextInterval(goodS);
    let easyInterval = this.nextInterval(easyS);

    // Ensure intervals are properly ordered: hard ≤ good < easy
    hardInterval = Math.min(hardInterval, goodInterval);
    goodInterval = Math.max(goodInterval, hardInterval + 1);
    easyInterval = Math.max(easyInterval, goodInterval + 1);

    return {
      cardId: "",
      timestamp: now,
      currentRetrievability: retrievability,
      currentStability: lastS,
      currentDifficulty: lastD,

      // 'Again' goes back to relearning (interval 0 means same day)
      againInterval: this.createPrediction("again", 0, againS, againD, now),
      hardInterval: this.createPrediction(
        "hard",
        hardInterval,
        hardS,
        hardD,
        now,
      ),
      goodInterval: this.createPrediction(
        "good",
        goodInterval,
        goodS,
        goodD,
        now,
      ),
      easyInterval: this.createPrediction(
        "easy",
        easyInterval,
        easyS,
        easyD,
        now,
      ),
    };
  }

  // ===========================================================================
  // STATE UPDATE METHODS
  // ===========================================================================

  /**
   * Initialize SRS state for a new card based on first rating
   */
  private initializeNewCard(rating: Rating, now: Date): CardSRSState {
    const ratingNum = RATINGS[rating];
    const difficulty = this.initDifficulty(ratingNum);
    const stability = this.initStability(ratingNum);

    // Determine new state and interval
    let newState: CardState;
    let interval: number;

    if (rating === "again" || rating === "hard") {
      // Stay in learning
      newState = "learning";
      interval = 0; // Review again today
    } else {
      // Graduate to review
      newState = "review";
      interval = this.nextInterval(stability);
    }

    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + interval);

    return {
      stability,
      difficulty,
      elapsedDays: 0,
      scheduledDays: interval,
      retrievability: 1,
      dueDate,
      state: newState,
      lastReviewDate: now,
      lastRating: rating,
      halfLife: stability * Math.LN2, // For HLR compatibility
      similarCardIds: [],
      lastInterferenceCheck: null,
      algorithmData: {
        fsrsVersion: "6.1.1",
        weights: this.w,
      },
    };
  }

  /**
   * Update a learning/relearning card after review
   */
  private updateLearningCard(
    currentState: CardSRSState,
    rating: Rating,
    now: Date,
  ): CardSRSState {
    const ratingNum = RATINGS[rating];
    const lastD = currentState.difficulty;
    const lastS = currentState.stability;

    // Update using short-term stability model
    const newDifficulty = this.nextDifficulty(lastD, ratingNum);
    const newStability = this.nextShortTermStability(lastS, ratingNum);

    // Determine new state
    let newState: CardState;
    let interval: number;

    if (rating === "again" || rating === "hard") {
      // Stay in learning/relearning
      newState = currentState.state;
      interval = 0;
    } else {
      // Graduate to review
      newState = "review";
      interval = this.nextInterval(newStability);
    }

    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + interval);

    return {
      ...currentState,
      stability: newStability,
      difficulty: newDifficulty,
      elapsedDays: 0,
      scheduledDays: interval,
      retrievability: this.forgettingCurve(0, newStability),
      dueDate,
      state: newState,
      lastReviewDate: now,
      lastRating: rating,
      halfLife: newStability * Math.LN2,
    };
  }

  /**
   * Update a review card after review
   */
  private updateReviewCard(
    currentState: CardSRSState,
    rating: Rating,
    now: Date,
  ): CardSRSState {
    const ratingNum = RATINGS[rating];
    const lastD = currentState.difficulty;
    const lastS = currentState.stability;
    const elapsedDays = currentState.elapsedDays;

    // Calculate retrievability at time of review
    const retrievability = this.forgettingCurve(elapsedDays, lastS);

    // Update difficulty
    const newDifficulty = this.nextDifficulty(lastD, ratingNum);

    // Update stability based on rating
    let newStability: number;
    let newState: CardState;
    let interval: number;

    if (rating === "again") {
      // Memory lapsed - use forget stability, go to relearning
      newStability = this.nextForgetStability(lastD, lastS, retrievability);
      newState = "relearning";
      interval = 0; // Review again today
    } else {
      // Memory reinforced - use recall stability
      newStability = this.nextRecallStability(
        lastD,
        lastS,
        retrievability,
        ratingNum,
      );
      newState = "review";
      interval = this.nextInterval(newStability);
    }

    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + interval);

    return {
      ...currentState,
      stability: newStability,
      difficulty: newDifficulty,
      elapsedDays: 0,
      scheduledDays: interval,
      retrievability: this.forgettingCurve(0, newStability),
      dueDate,
      state: newState,
      lastReviewDate: now,
      lastRating: rating,
      halfLife: newStability * Math.LN2,
    };
  }

  // ===========================================================================
  // CORE FSRS FORMULAS
  // ===========================================================================

  /**
   * The forgetting curve - probability of recall after t days
   * Formula: R(t) = (1 + FACTOR * t / S) ^ DECAY
   *
   * This is a power-law decay curve that:
   * - Returns 1 when t = 0 (just reviewed)
   * - Returns ~0.9 when t = S (at stability)
   * - Approaches 0 as t → ∞
   *
   * @param elapsedDays - Days since last review
   * @param stability - Memory stability in days
   */
  private forgettingCurve(elapsedDays: number, stability: number): number {
    if (stability <= 0) return 0;
    return Math.pow(1 + (this.factor * elapsedDays) / stability, this.decay);
  }

  /**
   * Calculate the interval for next review given desired retention
   * Inverse of the forgetting curve
   *
   * @param stability - Memory stability
   * @param targetRetention - Desired recall probability (default from config)
   */
  private nextInterval(
    stability: number,
    targetRetention: number = this.config.targetRetention,
  ): number {
    // Solve for t in: R(t) = targetRetention
    // t = S / FACTOR * (R^(1/DECAY) - 1)
    const interval =
      (stability / this.factor) *
      (Math.pow(targetRetention, 1 / this.decay) - 1);

    // Apply fuzz if enabled (prevents cards clustering on same day)
    const fuzzedInterval = this.config.fuzzFactor
      ? this.applyFuzz(interval)
      : interval;

    // Clamp to min/max interval
    return Math.min(
      Math.max(Math.round(fuzzedInterval), this.config.minimumInterval),
      this.config.maximumInterval,
    );
  }

  /**
   * Initialize difficulty for a new card
   * Formula: D = constrain(w[4] - e^(w[5] * (rating - 1)) + 1)
   *
   * - Easy first answer → lower difficulty
   * - Hard first answer → higher difficulty
   */
  private initDifficulty(rating: number): number {
    const d = this.w[4] - Math.exp(this.w[5] * (rating - 1)) + 1;
    return this.constrainDifficulty(d);
  }

  /**
   * Initialize stability for a new card
   * Simply uses the weight for that rating
   */
  private initStability(rating: number): number {
    return Math.max(this.w[rating - 1], 0.1);
  }

  /**
   * Update difficulty after a review
   * Uses linear damping to prevent extreme values
   * Formula: D' = D + linearDamping(ΔD, D)
   * Where ΔD = -w[6] * (rating - 3)
   *
   * This means:
   * - 'again' (1) increases difficulty
   * - 'hard' (2) slightly increases difficulty
   * - 'good' (3) no change
   * - 'easy' (4) decreases difficulty
   */
  private nextDifficulty(d: number, rating: number): number {
    // Calculate change in difficulty
    const deltaD = -this.w[6] * (rating - 3);

    // Apply linear damping (prevents extreme values)
    const dampedDelta = this.linearDamping(deltaD, d);

    // Apply mean reversion (pull towards initial difficulty)
    const nextD = d + dampedDelta;
    const revertedD = this.meanReversion(
      this.initDifficulty(RATINGS.easy),
      nextD,
    );

    return this.constrainDifficulty(revertedD);
  }

  /**
   * Linear damping function
   * Reduces the effect of difficulty changes for already-difficult cards
   * Formula: ΔD * (10 - D) / 9
   */
  private linearDamping(deltaD: number, d: number): number {
    return (deltaD * (10 - d)) / 9;
  }

  /**
   * Mean reversion - pulls difficulty towards initial value over time
   * Prevents difficulty from permanently drifting to extremes
   * Formula: w[7] * init + (1 - w[7]) * current
   */
  private meanReversion(init: number, current: number): number {
    return this.w[7] * init + (1 - this.w[7]) * current;
  }

  /**
   * Stability increase after successful recall
   * This is the key formula that determines how much stability increases
   *
   * Formula: S' = S * (1 + e^w[8] * (11-D) * S^(-w[9]) * (e^((1-R)*w[10]) - 1) * penalty * bonus)
   *
   * Factors:
   * - (11-D): Easier cards get bigger stability boost
   * - S^(-w[9]): Diminishing returns for already-stable cards
   * - (e^((1-R)*w[10]) - 1): Bigger boost for harder recalls (lower R)
   * - penalty/bonus: Hard gets penalty, easy gets bonus
   */
  private nextRecallStability(
    d: number,
    s: number,
    r: number,
    rating: number,
  ): number {
    // Apply hard penalty or easy bonus
    const hardPenalty = rating === RATINGS.hard ? this.w[15] : 1;
    const easyBonus = rating === RATINGS.easy ? this.w[16] : 1;

    // Calculate stability increase factor
    const newS =
      s *
      (1 +
        Math.exp(this.w[8]) *
          (11 - d) *
          Math.pow(s, -this.w[9]) *
          (Math.exp((1 - r) * this.w[10]) - 1) *
          hardPenalty *
          easyBonus);

    return Number(newS.toFixed(2));
  }

  /**
   * Stability decrease after forgetting (rating = again)
   * Memory has lapsed, so stability is reduced
   *
   * Formula: S' = min(w[11] * D^(-w[12]) * ((S+1)^w[13] - 1) * e^((1-R)*w[14]), S/e^(w[17]*w[18]))
   *
   * The minimum ensures stability doesn't drop too much at once
   */
  private nextForgetStability(d: number, s: number, r: number): number {
    // Minimum stability after forgetting
    const sMin = s / Math.exp(this.w[17] * this.w[18]);

    // Calculate new stability
    const newS =
      this.w[11] *
      Math.pow(d, -this.w[12]) *
      (Math.pow(s + 1, this.w[13]) - 1) *
      Math.exp((1 - r) * this.w[14]);

    return Number(Math.min(newS, sMin).toFixed(2));
  }

  /**
   * Short-term stability update for learning/relearning cards
   * Simpler model for cards not yet in regular review
   *
   * Formula: S' = S * S_inc
   * Where S_inc = e^(w[17] * (rating - 3 + w[18])) * S^(-w[19])
   */
  private nextShortTermStability(s: number, rating: number): number {
    // Calculate stability increment
    let sInc =
      Math.exp(this.w[17] * (rating - 3 + this.w[18])) *
      Math.pow(s, -this.w[19]);

    // For good/easy, ensure at least 1x (no decrease)
    if (rating >= RATINGS.good) {
      sInc = Math.max(sInc, 1);
    }

    return Number((s * sInc).toFixed(2));
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Constrain difficulty to valid range [1, 10]
   */
  private constrainDifficulty(d: number): number {
    return Number(Math.min(Math.max(d, 1), 10).toFixed(2));
  }

  /**
   * Apply fuzz to interval to prevent card clustering
   * Adds small random variation (±5%)
   */
  private applyFuzz(interval: number): number {
    if (interval < 2.5) return interval;

    const minInterval = Math.max(2, Math.round(interval * 0.95 - 1));
    const maxInterval = Math.round(interval * 1.05 + 1);

    // Use a deterministic random based on the interval
    // (In real implementation, should use card ID as seed)
    const fuzzFactor = Math.random();
    return Math.floor(
      fuzzFactor * (maxInterval - minInterval + 1) + minInterval,
    );
  }

  /**
   * Create an interval prediction object
   */
  private createPrediction(
    rating: string,
    interval: number,
    stability: number,
    difficulty: number,
    now: Date,
  ): IntervalPrediction {
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + interval);

    return {
      rating,
      interval,
      dueDate,
      newStability: stability,
      newDifficulty: difficulty,
      predictedRetrievability: this.forgettingCurve(interval, stability),
    };
  }

  /**
   * Convert named weights object to array
   */
  private weightsToArray(weights: FSRSWeights): number[] {
    return [
      weights.initialStabilityAgain, // w[0]
      weights.initialStabilityHard, // w[1]
      weights.initialStabilityGood, // w[2]
      weights.initialStabilityEasy, // w[3]
      weights.initialDifficultyBase, // w[4]
      weights.initialDifficultyModifier, // w[5]
      weights.difficultyUpdate, // w[6]
      weights.meanReversionStrength, // w[7]
      weights.stabilityBase, // w[8]
      weights.stabilityDifficultyDecay, // w[9]
      weights.stabilityRetrievabilityFactor, // w[10]
      weights.forgetStabilityBase, // w[11]
      weights.forgetDifficultyFactor, // w[12]
      weights.forgetStabilityFactor, // w[13]
      weights.forgetRetrievabilityFactor, // w[14]
      weights.hardPenalty, // w[15]
      weights.easyBonus, // w[16]
      weights.shortTermBase, // w[17]
      weights.shortTermModifier, // w[18]
      weights.shortTermDecay, // w[19]
      weights.decayRate, // w[20]
    ];
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new FSRS scheduler with optional custom configuration
 */
export function createFSRSScheduler(
  config?: Partial<FSRSConfig>,
): FSRSScheduler {
  return new FSRSScheduler(config);
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Format an interval as a human-readable string
 * @param days - Interval in days
 * @returns Formatted string like "10m", "1d", "2w", "3mo"
 */
export function formatInterval(days: number): string {
  if (days < 1) {
    // Less than a day - show minutes
    const minutes = Math.round(days * 24 * 60);
    return `${minutes}m`;
  } else if (days < 7) {
    // Less than a week - show days
    return `${Math.round(days)}d`;
  } else if (days < 30) {
    // Less than a month - show weeks
    const weeks = Math.round(days / 7);
    return `${weeks}w`;
  } else if (days < 365) {
    // Less than a year - show months
    const months = Math.round(days / 30);
    return `${months}mo`;
  } else {
    // More than a year - show years
    const years = (days / 365).toFixed(1);
    return `${years}y`;
  }
}

/**
 * Calculate Memory Integrity Score based on card states
 * This is a composite metric for long-term retention health
 */
export function calculateMemoryIntegrityScore(
  cards: {
    stability: number;
    difficulty: number;
    retrievability: number;
    state: CardState;
  }[],
): number {
  if (cards.length === 0) return 0;

  // Filter to review cards only
  const reviewCards = cards.filter((c) => c.state === "review");
  if (reviewCards.length === 0) return 0;

  // Calculate component scores
  const avgStability =
    reviewCards.reduce((sum, c) => sum + c.stability, 0) / reviewCards.length;
  const avgRetrievability =
    reviewCards.reduce((sum, c) => sum + c.retrievability, 0) /
    reviewCards.length;

  // Cards with stability > 90 days are "mastered"
  const masteredCards = reviewCards.filter((c) => c.stability > 90).length;
  const masteryRate = masteredCards / reviewCards.length;

  // Combine into final score (0-100)
  const stabilityScore = Math.min(avgStability / 180, 1) * 40; // Max 40 points
  const retrievabilityScore = avgRetrievability * 30; // Max 30 points
  const masteryScore = masteryRate * 30; // Max 30 points

  return Math.round(stabilityScore + retrievabilityScore + masteryScore);
}
