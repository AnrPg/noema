// =============================================================================
// UNIFIED SCHEDULER - Adapter for multiple scheduling algorithms
// =============================================================================
// This provides a common interface for all scheduling algorithms,
// allowing easy switching between FSRS, HLR, and others.

import type {
  Rating,
  CardSRSState,
} from '../types/card.types';
import type {
  SchedulerType,
  SchedulerConfig,
  SchedulingResult,
  SchedulingContext,
  FSRSConfig,
  HLRConfig,
} from '../types/scheduler.types';
import { getDefaultSchedulerConfig } from '../types';
import { FSRSScheduler, createFSRSScheduler } from './fsrs';
import { HLRScheduler, createHLRScheduler } from './hlr';

// =============================================================================
// SCHEDULER INTERFACE
// =============================================================================

/**
 * Common interface for all scheduling algorithms
 */
export interface IScheduler {
  /**
   * Calculate scheduling options for a card
   */
  schedule(
    currentState: CardSRSState,
    context?: SchedulingContext
  ): SchedulingResult;
  
  /**
   * Update card state after a review
   */
  updateAfterReview(
    currentState: CardSRSState,
    rating: Rating,
    responseTime: number
  ): CardSRSState;
  
  /**
   * Get current recall probability
   */
  getRetrievability(stability: number, elapsedDays: number): number;
  
  /**
   * Get optimal interval for target retention
   */
  getOptimalInterval(stability: number, targetRetention?: number): number;
}

// =============================================================================
// UNIFIED SCHEDULER CLASS
// =============================================================================

/**
 * Unified scheduler that wraps multiple algorithm implementations
 * 
 * Usage:
 * ```typescript
 * const scheduler = new UnifiedScheduler('fsrs');
 * const result = scheduler.schedule(cardState);
 * const newState = scheduler.updateAfterReview(cardState, 'good', 5000);
 * ```
 */
export class UnifiedScheduler implements IScheduler {
  private readonly type: SchedulerType;
  private readonly config: SchedulerConfig;
  private readonly impl: IScheduler;
  
  constructor(
    type: SchedulerType = 'fsrs',
    config?: Partial<SchedulerConfig>
  ) {
    this.type = type;
    this.config = { ...getDefaultSchedulerConfig(type), ...config };
    this.impl = this.createImplementation();
  }
  
  /**
   * Create the appropriate scheduler implementation
   */
  private createImplementation(): IScheduler {
    switch (this.type) {
      case 'fsrs':
        return createFSRSScheduler(this.config as Partial<FSRSConfig>);
      
      case 'hlr':
        return createHLRScheduler(this.config as Partial<HLRConfig>);
      
      case 'sm2':
      case 'anki_default':
        // SM-2 uses FSRS with different defaults for now
        // TODO: Implement proper SM-2
        return createFSRSScheduler(this.config as Partial<FSRSConfig>);
      
      case 'leitner':
        // Leitner uses simplified FSRS for now
        // TODO: Implement proper Leitner
        return createFSRSScheduler(this.config as Partial<FSRSConfig>);
      
      case 'custom':
        // Custom schedulers are handled via plugin system
        // Default to FSRS
        return createFSRSScheduler();
      
      default:
        return createFSRSScheduler();
    }
  }
  
  // Delegate all methods to implementation
  
  public schedule(
    currentState: CardSRSState,
    context?: SchedulingContext
  ): SchedulingResult {
    return this.impl.schedule(currentState, context);
  }
  
  public updateAfterReview(
    currentState: CardSRSState,
    rating: Rating,
    responseTime: number
  ): CardSRSState {
    return this.impl.updateAfterReview(currentState, rating, responseTime);
  }
  
  public getRetrievability(stability: number, elapsedDays: number): number {
    return this.impl.getRetrievability(stability, elapsedDays);
  }
  
  public getOptimalInterval(stability: number, targetRetention?: number): number {
    return this.impl.getOptimalInterval(stability, targetRetention);
  }
  
  /**
   * Get the scheduler type
   */
  public getType(): SchedulerType {
    return this.type;
  }
  
  /**
   * Get the current configuration
   */
  public getConfig(): SchedulerConfig {
    return this.config;
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a scheduler for a given type
 */
export function createScheduler(
  type: SchedulerType = 'fsrs',
  config?: Partial<SchedulerConfig>
): UnifiedScheduler {
  return new UnifiedScheduler(type, config);
}

/**
 * Create a scheduler from stored configuration
 */
export function createSchedulerFromConfig(config: SchedulerConfig): UnifiedScheduler {
  return new UnifiedScheduler(config.type, config);
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Create initial SRS state for a new card
 */
export function createInitialSRSState(): CardSRSState {
  return {
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    retrievability: 1,
    dueDate: new Date(),
    state: 'new',
    lastReviewDate: null,
    lastRating: null,
    halfLife: 0,
    similarCardIds: [],
    lastInterferenceCheck: null,
    algorithmData: {},
  };
}

/**
 * Check if a card is due for review
 */
export function isCardDue(state: CardSRSState, now: Date = new Date()): boolean {
  if (state.state === 'new') return true;
  if (state.state === 'learning' || state.state === 'relearning') return true;
  return state.dueDate <= now;
}

/**
 * Calculate days until a card is due
 * Negative means overdue
 */
export function daysUntilDue(state: CardSRSState, now: Date = new Date()): number {
  if (state.state === 'new') return 0;
  
  const dueTime = state.dueDate.getTime();
  const nowTime = now.getTime();
  const diffMs = dueTime - nowTime;
  
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Sort cards by priority for review
 * Priority: overdue > due today > learning > new
 */
export function sortCardsByPriority(
  cards: Array<{ id: string; srsState: CardSRSState }>,
  now: Date = new Date()
): Array<{ id: string; srsState: CardSRSState }> {
  return [...cards].sort((a, b) => {
    const aState = a.srsState;
    const bState = b.srsState;
    
    // Learning/relearning cards first
    if (aState.state === 'learning' || aState.state === 'relearning') {
      if (bState.state !== 'learning' && bState.state !== 'relearning') {
        return -1;
      }
    } else if (bState.state === 'learning' || bState.state === 'relearning') {
      return 1;
    }
    
    // Then by due date
    const aDays = daysUntilDue(aState, now);
    const bDays = daysUntilDue(bState, now);
    
    if (aDays !== bDays) {
      return aDays - bDays;  // More overdue first
    }
    
    // Finally by difficulty (harder cards first)
    return bState.difficulty - aState.difficulty;
  });
}

/**
 * Calculate relative overdueness
 * Used for prioritizing which overdue cards to show first
 * Higher = more urgent
 */
export function calculateRelativeOverdueness(
  state: CardSRSState,
  now: Date = new Date()
): number {
  if (state.state === 'new') return 0;
  if (state.scheduledDays === 0) return 1;
  
  const daysSinceDue = -daysUntilDue(state, now);
  if (daysSinceDue <= 0) return 0;
  
  // Relative overdueness = days overdue / scheduled interval
  return daysSinceDue / state.scheduledDays;
}

// =============================================================================
// BATCH OPERATIONS
// =============================================================================

/**
 * Schedule multiple cards at once
 * More efficient than individual calls
 */
export function batchSchedule(
  scheduler: IScheduler,
  cards: Array<{ id: string; srsState: CardSRSState }>,
  context?: SchedulingContext
): Map<string, SchedulingResult> {
  const results = new Map<string, SchedulingResult>();
  
  for (const card of cards) {
    const result = scheduler.schedule(card.srsState, context);
    results.set(card.id, { ...result, cardId: card.id });
  }
  
  return results;
}

/**
 * Get statistics about a set of cards
 */
export function getCardSetStatistics(
  cards: Array<{ srsState: CardSRSState }>,
  scheduler: IScheduler
): CardSetStatistics {
  if (cards.length === 0) {
    return {
      total: 0,
      new: 0,
      learning: 0,
      review: 0,
      due: 0,
      overdue: 0,
      averageStability: 0,
      averageDifficulty: 0,
      averageRetrievability: 0,
      predictedRetention: 0,
    };
  }
  
  const now = new Date();
  let newCount = 0;
  let learningCount = 0;
  let reviewCount = 0;
  let dueCount = 0;
  let overdueCount = 0;
  let totalStability = 0;
  let totalDifficulty = 0;
  let totalRetrievability = 0;
  let reviewCardCount = 0;
  
  for (const card of cards) {
    const state = card.srsState;
    
    switch (state.state) {
      case 'new':
        newCount++;
        break;
      case 'learning':
      case 'relearning':
        learningCount++;
        break;
      case 'review':
        reviewCount++;
        reviewCardCount++;
        totalStability += state.stability;
        totalDifficulty += state.difficulty;
        totalRetrievability += scheduler.getRetrievability(
          state.stability,
          state.elapsedDays
        );
        break;
    }
    
    if (isCardDue(state, now)) {
      dueCount++;
      if (state.state === 'review' && daysUntilDue(state, now) < 0) {
        overdueCount++;
      }
    }
  }
  
  return {
    total: cards.length,
    new: newCount,
    learning: learningCount,
    review: reviewCount,
    due: dueCount,
    overdue: overdueCount,
    averageStability: reviewCardCount > 0 ? totalStability / reviewCardCount : 0,
    averageDifficulty: reviewCardCount > 0 ? totalDifficulty / reviewCardCount : 0,
    averageRetrievability: reviewCardCount > 0 ? totalRetrievability / reviewCardCount : 0,
    predictedRetention: reviewCardCount > 0 ? totalRetrievability / reviewCardCount : 0,
  };
}

/**
 * Statistics about a set of cards
 */
export interface CardSetStatistics {
  total: number;
  new: number;
  learning: number;
  review: number;
  due: number;
  overdue: number;
  averageStability: number;
  averageDifficulty: number;
  averageRetrievability: number;
  predictedRetention: number;
}
