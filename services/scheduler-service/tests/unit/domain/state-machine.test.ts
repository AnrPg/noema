/**
 * Unit tests for Scheduler Card State Machine
 */

import { describe, expect, it } from 'vitest';

import {
  computeNextState,
  getValidTransitions,
  GRADUATION_THRESHOLD,
  isValidTransition,
  shouldGraduate,
  StateTransitionErrorCode,
  validateStateTransition,
} from '../../../src/domain/scheduler-service/state-machine.js';

describe('Scheduler Card State Machine', () => {
  describe('validateStateTransition', () => {
    it('should validate legal transitions from new state', () => {
      const result = validateStateTransition({
        fromState: 'new',
        rating: 'good',
      });

      expect(result.valid).toBe(true);
      expect(result.state).toBe('learning');
    });

    it('should transition to review immediately on easy rating from new', () => {
      const result = validateStateTransition({
        fromState: 'new',
        rating: 'easy',
      });

      expect(result.valid).toBe(true);
      expect(result.state).toBe('review');
    });

    it('should validate transitions from learning to review', () => {
      const result = validateStateTransition({
        fromState: 'learning',
        rating: 'good',
      });

      expect(result.valid).toBe(true);
      expect(result.state).toBe('review');
    });

    it('should keep card in learning on again rating', () => {
      const result = validateStateTransition({
        fromState: 'learning',
        rating: 'again',
      });

      expect(result.valid).toBe(true);
      expect(result.state).toBe('learning');
    });

    it('should transition review to relearning on lapse', () => {
      const result = validateStateTransition({
        fromState: 'review',
        rating: 'again',
      });

      expect(result.valid).toBe(true);
      expect(result.state).toBe('relearning');
    });

    it('should keep card in review on passing grades', () => {
      const result1 = validateStateTransition({
        fromState: 'review',
        rating: 'hard',
      });
      expect(result1.valid).toBe(true);
      expect(result1.state).toBe('review');

      const result2 = validateStateTransition({
        fromState: 'review',
        rating: 'good',
      });
      expect(result2.valid).toBe(true);
      expect(result2.state).toBe('review');

      const result3 = validateStateTransition({
        fromState: 'review',
        rating: 'easy',
      });
      expect(result3.valid).toBe(true);
      expect(result3.state).toBe('review');
    });

    it('should transition relearning to review on passing grades', () => {
      const result = validateStateTransition({
        fromState: 'relearning',
        rating: 'good',
      });

      expect(result.valid).toBe(true);
      expect(result.state).toBe('review');
    });

    it('should keep card in relearning on failing grades', () => {
      const result = validateStateTransition({
        fromState: 'relearning',
        rating: 'again',
      });

      expect(result.valid).toBe(true);
      expect(result.state).toBe('relearning');
    });

    it('should reject illegal transition from suspended via rating', () => {
      const result = validateStateTransition({
        fromState: 'suspended',
        rating: 'good',
      });

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe(StateTransitionErrorCode.ILLEGAL_TRANSITION);
    });

    it('should reject transition without rating', () => {
      const result = validateStateTransition({
        fromState: 'review',
      });

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe(StateTransitionErrorCode.MISSING_RATING);
    });

    it('should reject invalid rating', () => {
      const result = validateStateTransition({
        fromState: 'review',
        rating: 'invalid' as any,
      });

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe(StateTransitionErrorCode.INVALID_RATING);
    });

    it('should reject invalid state', () => {
      const result = validateStateTransition({
        fromState: 'invalid_state' as any,
        rating: 'good',
      });

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe(StateTransitionErrorCode.INVALID_STATE);
    });
  });

  describe('suspension and unsuspension', () => {
    it('should allow suspension from valid states', () => {
      const states: any[] = ['new', 'learning', 'review', 'relearning', 'graduated'];

      for (const state of states) {
        const result = validateStateTransition({
          fromState: state,
          suspend: true,
        });

        expect(result.valid).toBe(true);
        expect(result.state).toBe('suspended');
      }
    });

    it('should reject double suspension', () => {
      const result = validateStateTransition({
        fromState: 'suspended',
        suspend: true,
      });

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe(StateTransitionErrorCode.ILLEGAL_TRANSITION);
    });

    it('should allow unsuspension with previous state', () => {
      const result = validateStateTransition({
        fromState: 'suspended',
        unsuspend: true,
        previousState: 'review',
      });

      expect(result.valid).toBe(true);
      expect(result.state).toBe('review');
    });

    it('should reject unsuspension without previous state', () => {
      const result = validateStateTransition({
        fromState: 'suspended',
        unsuspend: true,
      });

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe(StateTransitionErrorCode.INVALID_STATE);
    });

    it('should reject unsuspension from non-suspended state', () => {
      const result = validateStateTransition({
        fromState: 'review',
        unsuspend: true,
        previousState: 'learning',
      });

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe(StateTransitionErrorCode.ILLEGAL_TRANSITION);
    });
  });

  describe('graduation', () => {
    it('should keep card in review if not enough consecutive correct', () => {
      const result = validateStateTransition({
        fromState: 'review',
        rating: 'good',
        consecutiveCorrect: GRADUATION_THRESHOLD - 1,
      });

      expect(result.valid).toBe(true);
      expect(result.state).toBe('review');
    });

    it('should graduate card after enough consecutive correct reviews', () => {
      // Note: Current implementation doesn't auto-graduate, manual graduation would be needed
      // This tests the shouldGraduate helper instead
      expect(shouldGraduate('review', GRADUATION_THRESHOLD)).toBe(true);
      expect(shouldGraduate('review', GRADUATION_THRESHOLD - 1)).toBe(false);
      expect(shouldGraduate('learning', GRADUATION_THRESHOLD)).toBe(false);
    });

    it('should handle graduated card reviews', () => {
      const goodResult = validateStateTransition({
        fromState: 'graduated',
        rating: 'good',
      });
      expect(goodResult.valid).toBe(true);
      expect(goodResult.state).toBe('graduated');

      const lapseResult = validateStateTransition({
        fromState: 'graduated',
        rating: 'again',
      });
      expect(lapseResult.valid).toBe(true);
      expect(lapseResult.state).toBe('relearning');
    });
  });

  describe('computeNextState', () => {
    it('should compute next state for valid transition', () => {
      const nextState = computeNextState({
        fromState: 'learning',
        rating: 'good',
      });

      expect(nextState).toBe('review');
    });

    it('should throw error for invalid transition', () => {
      expect(() =>
        computeNextState({
          fromState: 'suspended',
          rating: 'good',
        })
      ).toThrow();
    });
  });

  describe('isValidTransition', () => {
    it('should return true for valid transitions', () => {
      expect(
        isValidTransition({
          fromState: 'new',
          rating: 'good',
        })
      ).toBe(true);

      expect(
        isValidTransition({
          fromState: 'review',
          rating: 'again',
        })
      ).toBe(true);
    });

    it('should return false for invalid transitions', () => {
      expect(
        isValidTransition({
          fromState: 'suspended',
          rating: 'good',
        })
      ).toBe(false);

      expect(
        isValidTransition({
          fromState: 'review',
        })
      ).toBe(false);
    });
  });

  describe('getValidTransitions', () => {
    it('should return valid transitions map for each state', () => {
      const newTransitions = getValidTransitions('new');
      expect(newTransitions.good).toBe('learning');
      expect(newTransitions.easy).toBe('review');

      const reviewTransitions = getValidTransitions('review');
      expect(reviewTransitions.again).toBe('relearning');
      expect(reviewTransitions.good).toBe('review');

      const suspendedTransitions = getValidTransitions('suspended');
      expect(Object.keys(suspendedTransitions)).toHaveLength(0);
    });
  });

  describe('State transition matrix coverage', () => {
    it('should handle all new state transitions', () => {
      expect(computeNextState({ fromState: 'new', rating: 'again' })).toBe('learning');
      expect(computeNextState({ fromState: 'new', rating: 'hard' })).toBe('learning');
      expect(computeNextState({ fromState: 'new', rating: 'good' })).toBe('learning');
      expect(computeNextState({ fromState: 'new', rating: 'easy' })).toBe('review');
    });

    it('should handle all learning state transitions', () => {
      expect(computeNextState({ fromState: 'learning', rating: 'again' })).toBe('learning');
      expect(computeNextState({ fromState: 'learning', rating: 'hard' })).toBe('learning');
      expect(computeNextState({ fromState: 'learning', rating: 'good' })).toBe('review');
      expect(computeNextState({ fromState: 'learning', rating: 'easy' })).toBe('review');
    });

    it('should handle all review state transitions', () => {
      expect(computeNextState({ fromState: 'review', rating: 'again' })).toBe('relearning');
      expect(computeNextState({ fromState: 'review', rating: 'hard' })).toBe('review');
      expect(computeNextState({ fromState: 'review', rating: 'good' })).toBe('review');
      expect(computeNextState({ fromState: 'review', rating: 'easy' })).toBe('review');
    });

    it('should handle all relearning state transitions', () => {
      expect(computeNextState({ fromState: 'relearning', rating: 'again' })).toBe('relearning');
      expect(computeNextState({ fromState: 'relearning', rating: 'hard' })).toBe('relearning');
      expect(computeNextState({ fromState: 'relearning', rating: 'good' })).toBe('review');
      expect(computeNextState({ fromState: 'relearning', rating: 'easy' })).toBe('review');
    });

    it('should reject all suspended state rating transitions', () => {
      expect(() => computeNextState({ fromState: 'suspended', rating: 'again' })).toThrow();
      expect(() => computeNextState({ fromState: 'suspended', rating: 'hard' })).toThrow();
      expect(() => computeNextState({ fromState: 'suspended', rating: 'good' })).toThrow();
      expect(() => computeNextState({ fromState: 'suspended', rating: 'easy' })).toThrow();
    });

    it('should handle all graduated state transitions', () => {
      expect(computeNextState({ fromState: 'graduated', rating: 'again' })).toBe('relearning');
      expect(computeNextState({ fromState: 'graduated', rating: 'hard' })).toBe('review');
      expect(computeNextState({ fromState: 'graduated', rating: 'good' })).toBe('graduated');
      expect(computeNextState({ fromState: 'graduated', rating: 'easy' })).toBe('graduated');
    });
  });
});
