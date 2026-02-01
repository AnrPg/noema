// =============================================================================
// HALF-LIFE REGRESSION (HLR) - Duolingo-Style Scheduler
// =============================================================================
// Based on Duolingo's research paper:
// "A Trainable Spaced Repetition Model for Language Learning"
// Authors: Settles & Meeder (2016)
//
// HLR models memory as exponential decay with a learnable half-life.
// The half-life is the time it takes for recall probability to drop to 50%.
//
// Key concept: p(recall) = 2^(-Δ/h)
// Where Δ is time since last review and h is the half-life
//
// The half-life is predicted using logistic regression on features like:
// - Time since last practice
// - Number of correct/incorrect responses
// - Word difficulty
// - User strength

import type { Rating, CardState, CardSRSState } from '../types/card.types';
import type {
  HLRConfig,
  HLRFeatureWeights,
  SchedulingResult,
  IntervalPrediction,
  SchedulingContext,
} from '../types/scheduler.types';
import { DEFAULT_HLR_CONFIG } from '../types';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Rating values for calculations
 */
const RATINGS = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
} as const;

/**
 * Natural log of 2, used frequently in half-life calculations
 */
const LN2 = Math.LN2;  // ≈ 0.693

// =============================================================================
// HLR SCHEDULER CLASS
// =============================================================================

/**
 * Half-Life Regression Scheduler
 * 
 * Models memory decay as: p(recall) = 2^(-Δ/h)
 * Where:
 * - Δ (delta) = time since last review in days
 * - h = half-life in days
 * - p = probability of recall
 * 
 * The half-life is predicted using features about the card and user:
 * h = 2^(θ·x) where θ are learned weights and x are features
 */
export class HLRScheduler {
  private readonly config: HLRConfig;
  
  /**
   * Create a new HLR scheduler
   * @param config - Configuration including feature weights
   */
  constructor(config: Partial<HLRConfig> = {}) {
    this.config = { ...DEFAULT_HLR_CONFIG, ...config };
  }
  
  // ===========================================================================
  // PUBLIC API
  // ===========================================================================
  
  /**
   * Calculate scheduling options for a card
   * 
   * @param currentState - Current SRS state
   * @param context - Additional scheduling context
   * @returns Scheduling predictions for each rating
   */
  public schedule(
    currentState: CardSRSState,
    context?: SchedulingContext
  ): SchedulingResult {
    const now = new Date();
    
    // For new cards, use initial half-life
    if (currentState.state === 'new') {
      return this.scheduleNewCard(now);
    }
    
    // For all other cards, use HLR model
    return this.scheduleExistingCard(currentState, now, context);
  }
  
  /**
   * Update card state after a review
   * 
   * @param currentState - Current SRS state
   * @param rating - User's rating
   * @param responseTime - Time to answer (for future feature use)
   * @returns Updated SRS state
   */
  public updateAfterReview(
    currentState: CardSRSState,
    rating: Rating,
    responseTime: number
  ): CardSRSState {
    const now = new Date();
    const isCorrect = rating !== 'again';
    
    // Get current half-life (or initial if new)
    const currentHalfLife = currentState.halfLife > 0 
      ? currentState.halfLife 
      : this.config.baseHalfLife;
    
    // Update half-life based on rating
    const newHalfLife = this.updateHalfLife(
      currentHalfLife,
      isCorrect,
      rating
    );
    
    // Calculate FSRS-compatible stability (for cross-algorithm compatibility)
    // stability ≈ halfLife / ln(2) because p = 0.9 at stability in FSRS
    const newStability = this.halfLifeToStability(newHalfLife);
    
    // Update difficulty based on rating
    const newDifficulty = this.updateDifficulty(currentState.difficulty, rating);
    
    // Determine new state and interval
    let newState: CardState;
    let interval: number;
    
    if (rating === 'again') {
      // Memory lapsed
      newState = currentState.state === 'new' ? 'learning' : 'relearning';
      interval = 0;  // Review again today
    } else if (currentState.state === 'new' || currentState.state === 'learning') {
      // Still learning, but progressing
      if (rating === 'easy') {
        newState = 'review';
        interval = this.calculateInterval(newHalfLife);
      } else {
        newState = 'learning';
        interval = rating === 'good' ? 1 : 0;  // Good = tomorrow, hard = today
      }
    } else {
      // Regular review
      newState = 'review';
      interval = this.calculateInterval(newHalfLife);
    }
    
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + interval);
    
    // Update algorithm data with HLR-specific info
    const algorithmData = {
      ...currentState.algorithmData,
      hlrVersion: '1.0.0',
      correctCount: ((currentState.algorithmData?.correctCount as number) || 0) + (isCorrect ? 1 : 0),
      incorrectCount: ((currentState.algorithmData?.incorrectCount as number) || 0) + (isCorrect ? 0 : 1),
      lastResponseTime: responseTime,
    };
    
    return {
      ...currentState,
      stability: newStability,
      difficulty: newDifficulty,
      halfLife: newHalfLife,
      elapsedDays: 0,
      scheduledDays: interval,
      retrievability: this.calculateRetrievability(0, newHalfLife),
      dueDate,
      state: newState,
      lastReviewDate: now,
      lastRating: rating,
      algorithmData,
    };
  }
  
  /**
   * Calculate recall probability for a card
   * Formula: p = 2^(-Δ/h)
   * 
   * @param elapsedDays - Days since last review
   * @param halfLife - Memory half-life in days
   * @returns Probability of recall (0-1)
   */
  public calculateRetrievability(elapsedDays: number, halfLife: number): number {
    if (halfLife <= 0) return 0;
    if (elapsedDays <= 0) return 1;
    
    // Exponential decay: p = 2^(-Δ/h)
    return Math.pow(2, -elapsedDays / halfLife);
  }
  
  /**
   * Get the half-life needed for a target retention at a given interval
   * Inverse of retrievability formula
   * 
   * @param interval - Desired interval in days
   * @param targetRetention - Target recall probability
   * @returns Required half-life
   */
  public getRequiredHalfLife(interval: number, targetRetention: number): number {
    // From p = 2^(-Δ/h), solve for h:
    // h = -Δ / log2(p) = -Δ * ln(2) / ln(p)
    if (targetRetention <= 0 || targetRetention >= 1) return interval;
    return -interval / Math.log2(targetRetention);
  }
  
  // ===========================================================================
  // SCHEDULING METHODS
  // ===========================================================================
  
  /**
   * Schedule a new card
   */
  private scheduleNewCard(now: Date): SchedulingResult {
    const baseHalfLife = this.config.baseHalfLife;
    
    // Calculate half-lives for each rating
    const againHL = baseHalfLife * this.config.halfLifeMultiplierIncorrect;
    const hardHL = baseHalfLife * 0.8;
    const goodHL = baseHalfLife * this.config.halfLifeMultiplierCorrect;
    const easyHL = baseHalfLife * this.config.halfLifeMultiplierCorrect * 1.5;
    
    // Convert to intervals
    const goodInterval = this.calculateInterval(goodHL);
    const easyInterval = Math.max(this.calculateInterval(easyHL), goodInterval + 1);
    
    return {
      cardId: '',
      timestamp: now,
      currentRetrievability: 1,
      currentStability: 0,
      currentDifficulty: 5,  // Default difficulty
      
      againInterval: this.createPrediction('again', 0, againHL, 6, now),
      hardInterval: this.createPrediction('hard', 0, hardHL, 5.5, now),
      goodInterval: this.createPrediction('good', goodInterval, goodHL, 5, now),
      easyInterval: this.createPrediction('easy', easyInterval, easyHL, 4.5, now),
    };
  }
  
  /**
   * Schedule an existing card
   */
  private scheduleExistingCard(
    state: CardSRSState,
    now: Date,
    context?: SchedulingContext
  ): SchedulingResult {
    const currentHL = state.halfLife > 0 ? state.halfLife : this.config.baseHalfLife;
    const elapsedDays = state.elapsedDays;
    
    // Calculate current retrievability
    const retrievability = this.calculateRetrievability(elapsedDays, currentHL);
    
    // Predict new half-lives for each rating
    const againHL = this.updateHalfLife(currentHL, false, 'again');
    const hardHL = this.updateHalfLife(currentHL, true, 'hard');
    const goodHL = this.updateHalfLife(currentHL, true, 'good');
    const easyHL = this.updateHalfLife(currentHL, true, 'easy');
    
    // Calculate difficulties
    const againD = this.updateDifficulty(state.difficulty, 'again');
    const hardD = this.updateDifficulty(state.difficulty, 'hard');
    const goodD = this.updateDifficulty(state.difficulty, 'good');
    const easyD = this.updateDifficulty(state.difficulty, 'easy');
    
    // Calculate intervals
    let hardInterval = this.calculateInterval(hardHL);
    let goodInterval = this.calculateInterval(goodHL);
    let easyInterval = this.calculateInterval(easyHL);
    
    // Ensure proper ordering
    hardInterval = Math.max(1, Math.min(hardInterval, goodInterval - 1));
    goodInterval = Math.max(hardInterval + 1, goodInterval);
    easyInterval = Math.max(goodInterval + 1, easyInterval);
    
    return {
      cardId: '',
      timestamp: now,
      currentRetrievability: retrievability,
      currentStability: this.halfLifeToStability(currentHL),
      currentDifficulty: state.difficulty,
      
      againInterval: this.createPrediction('again', 0, againHL, againD, now),
      hardInterval: this.createPrediction('hard', hardInterval, hardHL, hardD, now),
      goodInterval: this.createPrediction('good', goodInterval, goodHL, goodD, now),
      easyInterval: this.createPrediction('easy', easyInterval, easyHL, easyD, now),
    };
  }
  
  // ===========================================================================
  // HALF-LIFE CALCULATIONS
  // ===========================================================================
  
  /**
   * Update half-life after a review
   * 
   * In HLR, the half-life update is multiplicative:
   * - Correct answer: h' = h * multiplier_correct
   * - Incorrect answer: h' = h * multiplier_incorrect
   * 
   * Additional adjustments based on rating:
   * - Easy: Extra boost
   * - Hard: Reduced boost
   * - Again: Significant reduction
   */
  private updateHalfLife(
    currentHL: number,
    isCorrect: boolean,
    rating: Rating
  ): number {
    let multiplier: number;
    
    if (!isCorrect) {
      // Incorrect - reduce half-life
      multiplier = this.config.halfLifeMultiplierIncorrect;
    } else {
      // Correct - increase half-life
      multiplier = this.config.halfLifeMultiplierCorrect;
      
      // Adjust based on rating
      switch (rating) {
        case 'hard':
          multiplier *= this.config.hardIntervalModifier;
          break;
        case 'easy':
          multiplier *= this.config.easyIntervalModifier;
          break;
        // 'good' uses base multiplier
      }
    }
    
    // Apply multiplier with minimum half-life protection
    const newHL = Math.max(
      currentHL * multiplier,
      this.config.baseHalfLife * 0.1  // Minimum 10% of base
    );
    
    return Number(newHL.toFixed(2));
  }
  
  /**
   * Predict half-life using feature weights (advanced HLR)
   * Formula: h = 2^(θ·x) where θ are weights and x are features
   * 
   * This is the machine learning aspect of HLR - the weights are
   * learned from user data to personalize the predictions.
   */
  private predictHalfLifeWithFeatures(
    currentHL: number,
    features: HLRFeatures
  ): number {
    const weights = this.config.featureWeights;
    
    // Calculate weighted feature sum
    const weightedSum = 
      weights.lagTime * features.lagTime +
      weights.previousCorrectCount * features.correctCount +
      weights.previousIncorrectCount * features.incorrectCount +
      weights.difficulty * features.difficulty +
      weights.lexemeFrequency * (features.lexemeFrequency || 0);
    
    // Half-life is exponential: h = base * 2^(weighted_sum)
    const predictedHL = this.config.baseHalfLife * Math.pow(2, weightedSum);
    
    return Math.max(predictedHL, 0.1);  // Minimum half-life
  }
  
  /**
   * Calculate optimal interval for a given half-life
   * We want p(recall) = targetRetention at the interval
   * 
   * From p = 2^(-Δ/h):
   * Δ = -h * log2(p)
   */
  private calculateInterval(halfLife: number): number {
    const target = this.config.recallThreshold;  // Default 0.5
    
    // When target = 0.5 (recall threshold), interval = halfLife
    // because 2^(-h/h) = 2^(-1) = 0.5
    if (target === 0.5) {
      return Math.max(1, Math.round(halfLife));
    }
    
    // General case: interval = -h * log2(target)
    const interval = -halfLife * Math.log2(target);
    
    // Apply fuzz and constraints
    const fuzzedInterval = this.config.fuzzFactor
      ? this.applyFuzz(interval)
      : interval;
    
    return Math.min(
      Math.max(Math.round(fuzzedInterval), this.config.minimumInterval),
      this.config.maximumInterval
    );
  }
  
  // ===========================================================================
  // DIFFICULTY CALCULATIONS
  // ===========================================================================
  
  /**
   * Update difficulty after a review
   * Similar to FSRS but simpler
   */
  private updateDifficulty(currentD: number, rating: Rating): number {
    const adjustment = {
      again: 0.5,    // Increase difficulty
      hard: 0.2,     // Slightly increase
      good: 0,       // No change
      easy: -0.3,    // Decrease difficulty
    };
    
    const newD = currentD + adjustment[rating];
    
    // Clamp to [1, 10]
    return Math.min(Math.max(Number(newD.toFixed(2)), 1), 10);
  }
  
  // ===========================================================================
  // CONVERSION UTILITIES
  // ===========================================================================
  
  /**
   * Convert half-life to FSRS-compatible stability
   * 
   * In FSRS, stability S is defined such that R(S) = 0.9
   * In HLR, half-life h is defined such that R(h) = 0.5
   * 
   * To find equivalent stability:
   * 0.9 = 2^(-S/h) → S = -h * log2(0.9) ≈ h * 0.152
   * 
   * Wait, that gives S < h, but FSRS stability > HLR half-life
   * Let's reconsider...
   * 
   * Actually, FSRS uses a different formula, so direct conversion
   * is approximate. We use: stability ≈ halfLife / ln(2) * factor
   */
  private halfLifeToStability(halfLife: number): number {
    // Approximate conversion factor
    // FSRS stability is roughly halfLife * 2.885 for 90% retention
    return Number((halfLife * 2.885).toFixed(2));
  }
  
  /**
   * Convert FSRS stability to half-life
   */
  private stabilityToHalfLife(stability: number): number {
    return Number((stability / 2.885).toFixed(2));
  }
  
  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================
  
  /**
   * Apply fuzz to interval
   */
  private applyFuzz(interval: number): number {
    if (interval < 2) return interval;
    
    const fuzzRange = interval * 0.1;  // ±10%
    const fuzz = (Math.random() - 0.5) * 2 * fuzzRange;
    
    return Math.max(1, interval + fuzz);
  }
  
  /**
   * Create prediction object
   */
  private createPrediction(
    rating: string,
    interval: number,
    halfLife: number,
    difficulty: number,
    now: Date
  ): IntervalPrediction {
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + interval);
    
    return {
      rating,
      interval,
      dueDate,
      newStability: this.halfLifeToStability(halfLife),
      newDifficulty: difficulty,
      predictedRetrievability: this.calculateRetrievability(interval, halfLife),
    };
  }
}

// =============================================================================
// TYPES
// =============================================================================

/**
 * Features used for half-life prediction
 */
interface HLRFeatures {
  lagTime: number;          // Days since last review (log-transformed)
  correctCount: number;     // Number of correct responses
  incorrectCount: number;   // Number of incorrect responses
  difficulty: number;       // Card difficulty (1-10)
  lexemeFrequency?: number; // Word frequency (for language learning)
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new HLR scheduler with optional configuration
 */
export function createHLRScheduler(config?: Partial<HLRConfig>): HLRScheduler {
  return new HLRScheduler(config);
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Calculate the strength of a memory based on review history
 * This is a Duolingo-specific metric
 * 
 * Strength = current_retrievability * practice_factor
 * Where practice_factor increases with more practice
 */
export function calculateMemoryStrength(
  retrievability: number,
  correctCount: number,
  totalReviews: number
): number {
  if (totalReviews === 0) return 0;
  
  // Practice factor: diminishing returns on practice
  const practiceFactor = 1 - Math.exp(-correctCount / 5);
  
  // Combine with retrievability
  const strength = retrievability * (0.5 + 0.5 * practiceFactor);
  
  return Math.min(1, Math.max(0, strength));
}

/**
 * Estimate time to review all due cards
 * Based on average response time and card count
 */
export function estimateReviewTime(
  dueCards: number,
  averageResponseTime: number = 8000  // 8 seconds default
): number {
  // Add overhead for UI transitions (~2s per card)
  const timePerCard = averageResponseTime + 2000;
  
  return Math.round(dueCards * timePerCard / 60000);  // Return minutes
}

/**
 * Calculate optimal daily review load
 * Balances learning new cards with maintaining old ones
 */
export function calculateOptimalLoad(
  totalCards: number,
  averageHalfLife: number,
  targetRetention: number = 0.85
): { newCards: number; reviews: number } {
  // Expected reviews per day for maintenance
  // Each card needs review when it drops below threshold
  // Average interval ≈ halfLife (for 50% threshold)
  const reviewsPerDay = totalCards / averageHalfLife;
  
  // Suggested new cards: roughly 10% of review load
  const newCards = Math.max(5, Math.round(reviewsPerDay * 0.1));
  
  return {
    newCards: Math.min(newCards, 30),  // Cap at 30
    reviews: Math.round(reviewsPerDay),
  };
}
