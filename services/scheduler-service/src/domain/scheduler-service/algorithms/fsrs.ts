/**
 * FSRS (Free Spaced Repetition Scheduler) Algorithm
 *
 * Pure TypeScript implementation of the FSRS algorithm (version 5).
 * Translated from the reference implementation in:
 *   third-party/fsrs4anki/fsrs4anki_scheduler.js
 *
 * Reference: Jarrett Ye et al. — "A Stochastic Shortest Path Algorithm for
 *            Optimizing Spaced Repetition Scheduling" (KDD 2024)
 *            https://github.com/open-spaced-repetition/fsrs4anki
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum difficulty value */
const MIN_DIFFICULTY = 1;

/** Maximum difficulty value */
const MAX_DIFFICULTY = 10;

/** Minimum stability value (0.1 days) */
const MIN_STABILITY = 0.1;

/** Default request retention (target recall probability) */
const DEFAULT_REQUEST_RETENTION = 0.9;

/** Default maximum interval (100 years in days) */
const DEFAULT_MAXIMUM_INTERVAL = 36500;

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/** Constrain difficulty to [1, 10] range. */
function constrainDifficulty(difficulty: number): number {
  return Math.min(Math.max(Number(difficulty.toFixed(2)), MIN_DIFFICULTY), MAX_DIFFICULTY);
}

/** Constrain stability to minimum threshold. */
function constrainStability(stability: number): number {
  return Math.max(Number(stability.toFixed(2)), MIN_STABILITY);
}

/** Linear damping function for difficulty updates. */
function linearDamping(deltaDifficulty: number, oldDifficulty: number): number {
  return (deltaDifficulty * (MAX_DIFFICULTY - oldDifficulty)) / 9;
}

/** Mean reversion toward initial difficulty. */
function meanReversion(initDifficulty: number, currentDifficulty: number, w7: number): number {
  return w7 * initDifficulty + (1 - w7) * currentDifficulty;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FSRSRating = 'again' | 'hard' | 'good' | 'easy';

export interface IFSRSParameters {
  /** FSRS model weights (21 parameters: w[0]..w[20]) */
  weights?: number[];
  /** Target recall probability (0.75-0.95 recommended) */
  requestRetention?: number;
  /** Maximum interval in days */
  maximumInterval?: number;
}

export interface IFSRSModelOptions {
  /** FSRS model weights (21 parameters: w[0]..w[20]) */
  weights: number[];
  /** Target recall probability (0.75-0.95 recommended) */
  requestRetention?: number;
  /** Maximum interval in days */
  maximumInterval?: number;
  /** Random seed for interval fuzzing (0-1) */
  fuzzFactor?: number;
  /** Enable interval fuzzing */
  enableFuzz?: boolean;
}

export interface IFSRSState {
  /** Memory stability in days */
  stability: number;
  /** Difficulty parameter [1-10] */
  difficulty: number;
}

export interface IFSRSPrediction {
  /** Predicted stability after the rating */
  stability: number;
  /** Updated difficulty after the rating */
  difficulty: number;
  /** Next review interval in days */
  interval: number;
  /** Current retrievability (forgetting curve value) */
  retrievability?: number;
}

// ---------------------------------------------------------------------------
// Default FSRS-5 parameters
// ---------------------------------------------------------------------------

/**
 * Default FSRS-5 weights (optimized for general use).
 * These can be overridden with deck-specific optimized parameters.
 */
export const DEFAULT_FSRS_WEIGHTS = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
  0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
];

// ---------------------------------------------------------------------------
// FSRS Model
// ---------------------------------------------------------------------------

/**
 * FSRS (Free Spaced Repetition Scheduler) model.
 *
 * Maintains model parameters and provides methods to:
 * - Initialize stability and difficulty for new cards
 * - Predict next state and interval after a review
 * - Compute retrievability (forgetting curve)
 */
export class FSRSModel {
  private readonly w: number[];
  private readonly requestRetention: number;
  private readonly maximumInterval: number;
  private readonly enableFuzz: boolean;
  private readonly fuzzFactor: number;
  private readonly decay: number;
  private readonly factor: number;

  constructor(options: IFSRSModelOptions) {
    const {
      weights,
      requestRetention = DEFAULT_REQUEST_RETENTION,
      maximumInterval = DEFAULT_MAXIMUM_INTERVAL,
      enableFuzz = false,
      fuzzFactor = 0.5,
    } = options;

    if (weights.length !== 21) {
      throw new Error(`FSRS requires 21 weights, got ${weights.length.toString()}`);
    }

    this.w = weights;
    this.requestRetention = requestRetention;
    this.maximumInterval = maximumInterval;
    this.enableFuzz = enableFuzz;
    this.fuzzFactor = fuzzFactor;

    // Derived constants (from w[20])
    // Safe assertion: we validated length above
    const w20 = this.w[20];
    if (w20 === undefined) {
      throw new Error('Missing w[20] in FSRS weights array');
    }
    this.decay = -w20;
    this.factor = 0.9 ** (1 / this.decay) - 1;
  }

  /**
   * Compute initial difficulty for a new card given the first rating.
   *
   * @param rating - First rating (again=1, hard=2, good=3, easy=4)
   * @returns Initial difficulty [1-10]
   */
  initDifficulty(rating: FSRSRating): number {
    const ratingValue = this.getRatingValue(rating);
    const w4 = this.w[4];
    const w5 = this.w[5];
    if (w4 === undefined || w5 === undefined) {
      throw new Error('Missing required weights for initDifficulty');
    }
    const difficulty = w4 - Math.exp(w5 * (ratingValue - 1)) + 1;
    return constrainDifficulty(difficulty);
  }

  /**
   * Compute initial stability for a new card given the first rating.
   *
   * @param rating - First rating (again=1, hard=2, good=3, easy=4)
   * @returns Initial stability in days
   */
  initStability(rating: FSRSRating): number {
    const ratingValue = this.getRatingValue(rating);
    const weight = this.w[ratingValue - 1];
    if (weight === undefined) {
      throw new Error(`Missing weight for rating value ${ratingValue.toString()}`);
    }
    const stability = Math.max(weight, MIN_STABILITY);
    return constrainStability(stability);
  }

  /**
   * Compute retrievability (forgetting curve) at a given time.
   *
   * @param elapsedDays - Days since last review
   * @param stability - Current memory stability
   * @returns Retrievability [0-1]
   */
  forgettingCurve(elapsedDays: number, stability: number): number {
    return (1 + (this.factor * elapsedDays) / stability) ** this.decay;
  }

  /**
   * Compute updated difficulty after a review.
   *
   * @param currentDifficulty - Current difficulty
   * @param rating - Review rating
   * @returns Updated difficulty [1-10]
   */
  nextDifficulty(currentDifficulty: number, rating: FSRSRating): number {
    const ratingValue = this.getRatingValue(rating);
    const w6 = this.w[6];
    const w7 = this.w[7];
    if (w6 === undefined || w7 === undefined) {
      throw new Error('Missing required weights for nextDifficulty');
    }
    const deltaDifficulty = -w6 * (ratingValue - 3);
    const dampedDelta = linearDamping(deltaDifficulty, currentDifficulty);
    const newDifficulty = currentDifficulty + dampedDelta;
    const initDiff = this.initDifficulty('easy');
    return constrainDifficulty(meanReversion(initDiff, newDifficulty, w7));
  }

  /**
   * Compute stability after successful recall (hard/good/easy).
   *
   * @param currentDifficulty - Current difficulty
   * @param currentStability - Current stability
   * @param retrievability - Current retrievability [0-1]
   * @param rating - Review rating (hard/good/easy)
   * @returns Updated stability
   */
  nextRecallStability(
    currentDifficulty: number,
    currentStability: number,
    retrievability: number,
    rating: FSRSRating
  ): number {
    const w8 = this.w[8];
    const w9 = this.w[9];
    const w10 = this.w[10];
    const w15 = this.w[15];
    const w16 = this.w[16];
    if (
      w8 === undefined ||
      w9 === undefined ||
      w10 === undefined ||
      w15 === undefined ||
      w16 === undefined
    ) {
      throw new Error('Missing required weights for nextRecallStability');
    }

    const hardPenalty = rating === 'hard' ? w15 : 1;
    const easyBonus = rating === 'easy' ? w16 : 1;

    const newStability =
      currentStability *
      (1 +
        Math.exp(w8) *
          (11 - currentDifficulty) *
          currentStability ** -w9 *
          (Math.exp((1 - retrievability) * w10) - 1) *
          hardPenalty *
          easyBonus);

    return constrainStability(newStability);
  }

  /**
   * Compute stability after failed recall (again).
   *
   * @param currentDifficulty - Current difficulty
   * @param currentStability - Current stability
   * @param retrievability - Current retrievability [0-1]
   * @returns Updated stability
   */
  nextForgetStability(
    currentDifficulty: number,
    currentStability: number,
    retrievability: number
  ): number {
    const w11 = this.w[11];
    const w12 = this.w[12];
    const w13 = this.w[13];
    const w14 = this.w[14];
    const w17 = this.w[17];
    const w18 = this.w[18];
    if (
      w11 === undefined ||
      w12 === undefined ||
      w13 === undefined ||
      w14 === undefined ||
      w17 === undefined ||
      w18 === undefined
    ) {
      throw new Error('Missing required weights for nextForgetStability');
    }

    const stabilityMin = currentStability / Math.exp(w17 * w18);
    const newStability = Math.min(
      w11 *
        currentDifficulty ** -w12 *
        ((currentStability + 1) ** w13 - 1) *
        Math.exp((1 - retrievability) * w14),
      stabilityMin
    );
    return constrainStability(newStability);
  }

  /**
   * Compute stability after short-term review (learning/relearning).
   *
   * @param currentStability - Current stability
   * @param rating - Review rating
   * @returns Updated stability
   */
  nextShortTermStability(currentStability: number, rating: FSRSRating): number {
    const ratingValue = this.getRatingValue(rating);
    const w17 = this.w[17];
    const w18 = this.w[18];
    const w19 = this.w[19];
    if (w17 === undefined || w18 === undefined || w19 === undefined) {
      throw new Error('Missing required weights for nextShortTermStability');
    }

    let stabilityIncrease = Math.exp(w17 * (ratingValue - 3 + w18)) * currentStability ** -w19;

    // Ensure stability doesn't decrease for passing grades
    if (ratingValue >= 3) {
      stabilityIncrease = Math.max(stabilityIncrease, 1);
    }

    const newStability = currentStability * stabilityIncrease;
    return constrainStability(newStability);
  }

  /**
   * Compute next review interval from stability.
   *
   * @param stability - Memory stability in days
   * @param currentInterval - Current scheduled interval (for fuzz boundary)
   * @returns Next interval in days [1, maximumInterval]
   */
  nextInterval(stability: number, currentInterval?: number): number {
    // Base interval from stability and request retention
    const baseInterval =
      (stability / this.factor) * (this.requestRetention ** (1 / this.decay) - 1);

    // Apply fuzzing if enabled
    let interval = baseInterval;
    if (this.enableFuzz && baseInterval >= 2.5) {
      const roundedBase = Math.round(baseInterval);
      let minInterval = Math.max(2, Math.round(roundedBase * 0.95 - 1));
      const maxInterval = Math.round(roundedBase * 1.05 + 1);

      // Ensure fuzzed interval is greater than current interval for reviews
      if (currentInterval !== undefined && baseInterval > currentInterval) {
        minInterval = Math.max(minInterval, currentInterval + 1);
      }

      // Apply fuzz factor
      interval = Math.floor(this.fuzzFactor * (maxInterval - minInterval + 1) + minInterval);
    } else {
      interval = Math.round(interval);
    }

    // Constrain to [1, maximumInterval]
    return Math.min(Math.max(Math.round(interval), 1), this.maximumInterval);
  }

  /**
   * Predict next scheduling state for a review card.
   *
   * @param currentState - Current FSRS state (difficulty, stability)
   * @param elapsedDays - Days since last review
   * @param rating - Review rating
   * @param currentInterval - Current scheduled interval (for fuzz boundary)
   * @returns Predicted next state and interval
   */
  predictReviewState(
    currentState: IFSRSState,
    elapsedDays: number,
    rating: FSRSRating,
    currentInterval?: number
  ): IFSRSPrediction {
    const { stability: currentStability, difficulty: currentDifficulty } = currentState;
    const retrievability = this.forgettingCurve(elapsedDays, currentStability);

    const newDifficulty = this.nextDifficulty(currentDifficulty, rating);
    let newStability: number;

    if (rating === 'again') {
      newStability = this.nextForgetStability(currentDifficulty, currentStability, retrievability);
    } else {
      newStability = this.nextRecallStability(
        currentDifficulty,
        currentStability,
        retrievability,
        rating
      );
    }

    const interval = this.nextInterval(newStability, currentInterval);

    return {
      stability: newStability,
      difficulty: newDifficulty,
      interval,
      retrievability,
    };
  }

  /**
   * Predict next scheduling state for a learning/relearning card.
   *
   * @param currentState - Current FSRS state (difficulty, stability)
   * @param rating - Review rating
   * @returns Predicted next state and interval
   */
  predictLearningState(currentState: IFSRSState, rating: FSRSRating): IFSRSPrediction {
    const { stability: currentStability, difficulty: currentDifficulty } = currentState;

    const newDifficulty = this.nextDifficulty(currentDifficulty, rating);
    const newStability = this.nextShortTermStability(currentStability, rating);
    const interval = this.nextInterval(newStability);

    return {
      stability: newStability,
      difficulty: newDifficulty,
      interval,
    };
  }

  /**
   * Initialize FSRS state for a new card.
   *
   * @param rating - Initial rating
   * @returns Initial FSRS state
   */
  initState(rating: FSRSRating): IFSRSState {
    return {
      difficulty: this.initDifficulty(rating),
      stability: this.initStability(rating),
    };
  }

  /**
   * Convert rating to numeric value [1-4].
   */
  private getRatingValue(rating: FSRSRating): number {
    const ratingMap: Record<FSRSRating, number> = {
      again: 1,
      hard: 2,
      good: 3,
      easy: 4,
    };
    return ratingMap[rating];
  }

  /** Return current model weights. */
  getWeights(): number[] {
    return [...this.w];
  }

  /** Return current request retention. */
  getRequestRetention(): number {
    return this.requestRetention;
  }

  /** Return current maximum interval. */
  getMaximumInterval(): number {
    return this.maximumInterval;
  }
}

// Re-export constants for testing
export {
  constrainDifficulty,
  constrainStability,
  DEFAULT_MAXIMUM_INTERVAL,
  DEFAULT_REQUEST_RETENTION,
  MAX_DIFFICULTY,
  MIN_DIFFICULTY,
  MIN_STABILITY,
};
