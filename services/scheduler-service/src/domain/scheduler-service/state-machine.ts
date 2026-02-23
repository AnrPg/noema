/**
 * Scheduler Card State Machine
 *
 * Enforces explicit state transition rules for SchedulerCard entities.
 * Rejects illegal transitions with machine-readable error codes.
 *
 * Design Decision: Strict transition map (Phase 3 requirement)
 * - All transitions must be explicitly whitelisted
 * - Illegal transitions are rejected with structured errors
 * - State transitions are deterministic based on review outcomes
 */

import type { Rating, SchedulerCardState } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

export enum StateTransitionErrorCode {
  ILLEGAL_TRANSITION = 'ILLEGAL_TRANSITION',
  INVALID_STATE = 'INVALID_STATE',
  MISSING_RATING = 'MISSING_RATING',
  INVALID_RATING = 'INVALID_RATING',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IStateTransitionError {
  code: StateTransitionErrorCode;
  message: string;
  fromState: SchedulerCardState;
  toState?: SchedulerCardState;
  rating?: Rating;
}

export interface IStateTransitionContext {
  /** Current state of the scheduler card */
  fromState: SchedulerCardState;
  /** Review rating that triggers the transition */
  rating?: Rating;
  /** Number of consecutive correct reviews */
  consecutiveCorrect?: number;
  /** Whether the card should be suspended */
  suspend?: boolean;
  /** Whether the card should be unsuspended */
  unsuspend?: boolean;
  /** Previous state before suspension (for unsuspend) */
  previousState?: SchedulerCardState;
}

export interface IStateTransitionResult {
  /** Resulting state after transition */
  state: SchedulerCardState;
  /** Whether the transition is valid */
  valid: boolean;
  /** Error details if invalid */
  error?: IStateTransitionError;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum consecutive correct reviews required for graduation */
const GRADUATION_THRESHOLD = 3;

/** States that can transition to suspended */
const SUSPENDABLE_STATES: SchedulerCardState[] = [
  'new',
  'learning',
  'review',
  'relearning',
  'graduated',
];

/** Valid rating values */
const VALID_RATINGS: Rating[] = ['again', 'hard', 'good', 'easy'];

// ---------------------------------------------------------------------------
// State Transition Map
// ---------------------------------------------------------------------------

/**
 * Explicit whitelist of legal state transitions.
 * Map structure: fromState → (rating → toState)
 */
const STATE_TRANSITION_MAP: Record<
  SchedulerCardState,
  Partial<Record<Rating, SchedulerCardState>>
> = {
  // New cards enter learning on first review
  new: {
    again: 'learning',
    hard: 'learning',
    good: 'learning',
    easy: 'review', // Easy graduates immediately to review
  },

  // Learning cards can stay in learning or graduate to review
  learning: {
    again: 'learning', // Still learning, restart
    hard: 'learning', // Still learning, minimal progress
    good: 'review', // Graduate to review
    easy: 'review', // Graduate to review
  },

  // Review cards can stay in review or lapse to relearning
  review: {
    again: 'relearning', // Lapsed, enter relearning
    hard: 'review', // Stay in review
    good: 'review', // Stay in review
    easy: 'review', // Stay in review
  },

  // Relearning cards can stay in relearning or graduate back to review
  relearning: {
    again: 'relearning', // Still relearning
    hard: 'relearning', // Still relearning
    good: 'review', // Recovered, back to review
    easy: 'review', // Recovered, back to review
  },

  // Suspended cards cannot transition via ratings (must be explicitly unsuspended)
  suspended: {},

  // Graduated cards can still lapse back to review if reviewed again
  graduated: {
    again: 'relearning', // Lapsed
    hard: 'review', // Minor lapse
    good: 'graduated', // Stay graduated
    easy: 'graduated', // Stay graduated
  },
};

// ---------------------------------------------------------------------------
// State Transition Functions
// ---------------------------------------------------------------------------

/**
 * Validate a state transition.
 *
 * @param context - Transition context (fromState, rating, etc.)
 * @returns Transition result with validation status
 */
export function validateStateTransition(context: IStateTransitionContext): IStateTransitionResult {
  const { fromState, rating, suspend, unsuspend, previousState, consecutiveCorrect = 0 } = context;

  // Validate current state
  if (!isValidState(fromState)) {
    return {
      state: fromState,
      valid: false,
      error: {
        code: StateTransitionErrorCode.INVALID_STATE,
        message: `Invalid current state: ${String(fromState)}`,
        fromState,
      },
    };
  }

  // Handle suspension request
  if (suspend === true) {
    if (!SUSPENDABLE_STATES.includes(fromState)) {
      return {
        state: fromState,
        valid: false,
        error: {
          code: StateTransitionErrorCode.ILLEGAL_TRANSITION,
          message: `Cannot suspend from state: ${fromState}`,
          fromState,
          toState: 'suspended',
        },
      };
    }
    return {
      state: 'suspended',
      valid: true,
    };
  }

  // Handle unsuspension request
  if (unsuspend === true) {
    if (fromState !== 'suspended') {
      return {
        state: fromState,
        valid: false,
        error: {
          code: StateTransitionErrorCode.ILLEGAL_TRANSITION,
          message: 'Cannot unsuspend a card that is not suspended',
          fromState,
        },
      };
    }
    if (previousState === undefined) {
      return {
        state: fromState,
        valid: false,
        error: {
          code: StateTransitionErrorCode.INVALID_STATE,
          message: 'Missing or invalid previous state for unsuspend',
          fromState,
        },
      };
    }
    if (!isValidState(previousState)) {
      return {
        state: fromState,
        valid: false,
        error: {
          code: StateTransitionErrorCode.INVALID_STATE,
          message: 'Missing or invalid previous state for unsuspend',
          fromState,
        },
      };
    }
    return {
      state: previousState,
      valid: true,
    };
  }

  // Handle rating-based transitions
  if (rating === undefined) {
    return {
      state: fromState,
      valid: false,
      error: {
        code: StateTransitionErrorCode.MISSING_RATING,
        message: 'Rating is required for state transition',
        fromState,
      },
    };
  }

  if (!VALID_RATINGS.includes(rating)) {
    return {
      state: fromState,
      valid: false,
      error: {
        code: StateTransitionErrorCode.INVALID_RATING,
        message: `Invalid rating: ${rating}`,
        fromState,
        rating,
      },
    };
  }

  // Look up transition in whitelist
  const transitionMap = STATE_TRANSITION_MAP[fromState];
  const toState = transitionMap[rating];

  if (toState === undefined) {
    return {
      state: fromState,
      valid: false,
      error: {
        code: StateTransitionErrorCode.ILLEGAL_TRANSITION,
        message: `Illegal transition: ${fromState} → ${rating}`,
        fromState,
        rating,
      },
    };
  }

  // Check for graduation eligibility
  if (toState === 'graduated' && fromState === 'review') {
    if (consecutiveCorrect < GRADUATION_THRESHOLD) {
      // Stay in review, not yet eligible for graduation
      return {
        state: 'review',
        valid: true,
      };
    }
  }

  return {
    state: toState,
    valid: true,
  };
}

/**
 * Compute next state given current state and rating.
 * Throws error if transition is invalid.
 *
 * @param context - Transition context
 * @returns Next state
 * @throws {Error} If transition is invalid
 */
export function computeNextState(context: IStateTransitionContext): SchedulerCardState {
  const result = validateStateTransition(context);

  if (!result.valid) {
    const error = result.error;
    if (error === undefined) {
      throw new Error('Invalid state transition without error details');
    }
    const errorDetails = `[${error.code}] ${error.message} (from: ${error.fromState}, to: ${error.toState ?? 'unknown'}, rating: ${error.rating ?? 'none'})`;
    throw new Error(errorDetails);
  }

  return result.state;
}

/**
 * Check if a state transition is valid without throwing.
 *
 * @param context - Transition context
 * @returns True if transition is valid
 */
export function isValidTransition(context: IStateTransitionContext): boolean {
  const result = validateStateTransition(context);
  return result.valid;
}

/**
 * Check if a state value is valid.
 */
export function isValidState(state: string): state is SchedulerCardState {
  const validStates: SchedulerCardState[] = [
    'new',
    'learning',
    'review',
    'relearning',
    'suspended',
    'graduated',
  ];
  return validStates.includes(state as SchedulerCardState);
}

/**
 * Get all valid transitions from a given state.
 *
 * @param fromState - Current state
 * @returns Map of rating to next state
 */
export function getValidTransitions(
  fromState: SchedulerCardState
): Partial<Record<Rating, SchedulerCardState>> {
  return STATE_TRANSITION_MAP[fromState];
}

/**
 * Check if a card should graduate based on consecutive correct reviews.
 *
 * @param currentState - Current card state
 * @param consecutiveCorrect - Number of consecutive correct reviews
 * @returns True if card should graduate
 */
export function shouldGraduate(
  currentState: SchedulerCardState,
  consecutiveCorrect: number
): boolean {
  return currentState === 'review' && consecutiveCorrect >= GRADUATION_THRESHOLD;
}

// Re-export constants for testing
export { GRADUATION_THRESHOLD, SUSPENDABLE_STATES, VALID_RATINGS };
