/**
 * Unit tests for FSRS algorithm
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FSRS_WEIGHTS,
  FSRSModel,
  MAX_DIFFICULTY,
  MIN_DIFFICULTY,
  MIN_STABILITY,
  constrainDifficulty,
  constrainStability,
} from '../../../src/domain/scheduler-service/algorithms/fsrs.js';

describe('FSRS Algorithm', () => {
  describe('FSRSModel constructor', () => {
    it('should initialize with default parameters', () => {
      const fsrs = new FSRSModel({ weights: DEFAULT_FSRS_WEIGHTS });
      expect(fsrs.getWeights()).toEqual(DEFAULT_FSRS_WEIGHTS);
      expect(fsrs.getRequestRetention()).toBe(0.9);
      expect(fsrs.getMaximumInterval()).toBe(36500);
    });

    it('should accept custom parameters', () => {
      const customWeights = DEFAULT_FSRS_WEIGHTS.map((w) => w * 1.1);
      const fsrs = new FSRSModel({
        weights: customWeights,
        requestRetention: 0.85,
        maximumInterval: 10000,
      });
      expect(fsrs.getRequestRetention()).toBe(0.85);
      expect(fsrs.getMaximumInterval()).toBe(10000);
    });

    it('should throw error if weights array has wrong length', () => {
      expect(() => new FSRSModel({ weights: [1, 2, 3] })).toThrow('FSRS requires 21 weights');
    });
  });

  describe('initDifficulty', () => {
    const fsrs = new FSRSModel({ weights: DEFAULT_FSRS_WEIGHTS });

    it('should compute initial difficulty for each rating', () => {
      const againDiff = fsrs.initDifficulty('again');
      const hardDiff = fsrs.initDifficulty('hard');
      const goodDiff = fsrs.initDifficulty('good');
      const easyDiff = fsrs.initDifficulty('easy');

      // Difficulties should be in [1, 10] range
      expect(againDiff).toBeGreaterThanOrEqual(MIN_DIFFICULTY);
      expect(againDiff).toBeLessThanOrEqual(MAX_DIFFICULTY);

      // Higher ratings should generally have lower difficulty
      expect(againDiff).toBeGreaterThan(easyDiff);
    });

    it('should constrain difficulty to valid range', () => {
      const diff = fsrs.initDifficulty('again');
      expect(diff).toBeGreaterThanOrEqual(MIN_DIFFICULTY);
      expect(diff).toBeLessThanOrEqual(MAX_DIFFICULTY);
    });
  });

  describe('initStability', () => {
    const fsrs = new FSRSModel({ weights: DEFAULT_FSRS_WEIGHTS });

    it('should compute initial stability for each rating', () => {
      const againStab = fsrs.initStability('again');
      const hardStab = fsrs.initStability('hard');
      const goodStab = fsrs.initStability('good');
      const easyStab = fsrs.initStability('easy');

      // All stabilities should be >= MIN_STABILITY
      expect(againStab).toBeGreaterThanOrEqual(MIN_STABILITY);

      // Higher ratings should have higher stability
      expect(easyStab).toBeGreaterThan(againStab);
    });
  });

  describe('forgettingCurve', () => {
    const fsrs = new FSRSModel({ weights: DEFAULT_FSRS_WEIGHTS });

    it('should compute retrievability that decreases over time', () => {
      const stability = 10; // 10 days
      const r1 = fsrs.forgettingCurve(0, stability); // Immediately
      const r2 = fsrs.forgettingCurve(5, stability); // 5 days later
      const r3 = fsrs.forgettingCurve(10, stability); // 10 days later

      expect(r1).toBeGreaterThan(r2);
      expect(r2).toBeGreaterThan(r3);
    });

    it('should return higher retrievability for higher stability', () => {
      const elapsedDays = 7;
      const r1 = fsrs.forgettingCurve(elapsedDays, 5);
      const r2 = fsrs.forgettingCurve(elapsedDays, 15);

      expect(r2).toBeGreaterThan(r1);
    });
  });

  describe('nextDifficulty', () => {
    const fsrs = new FSRSModel({ weights: DEFAULT_FSRS_WEIGHTS });

    it('should increase difficulty for "again" rating', () => {
      const currentDiff = 5;
      const newDiff = fsrs.nextDifficulty(currentDiff, 'again');
      expect(newDiff).toBeGreaterThan(currentDiff);
    });

    it('should decrease difficulty for "easy" rating', () => {
      const currentDiff = 5;
      const newDiff = fsrs.nextDifficulty(currentDiff, 'easy');
      expect(newDiff).toBeLessThan(currentDiff);
    });

    it('should constrain difficulty to valid range', () => {
      const newDiff = fsrs.nextDifficulty(9.5, 'again');
      expect(newDiff).toBeLessThanOrEqual(MAX_DIFFICULTY);

      const newDiff2 = fsrs.nextDifficulty(1.5, 'easy');
      expect(newDiff2).toBeGreaterThanOrEqual(MIN_DIFFICULTY);
    });
  });

  describe('nextRecallStability', () => {
    const fsrs = new FSRSModel({ weights: DEFAULT_FSRS_WEIGHTS });

    it('should increase stability for successful recall', () => {
      const currentStab = 5;
      const currentDiff = 5;
      const retrievability = 0.8;

      const newStab = fsrs.nextRecallStability(currentDiff, currentStab, retrievability, 'good');
      expect(newStab).toBeGreaterThan(currentStab);
    });

    it('should apply hard penalty', () => {
      const currentStab = 5;
      const currentDiff = 5;
      const retrievability = 0.8;

      const goodStab = fsrs.nextRecallStability(currentDiff, currentStab, retrievability, 'good');
      const hardStab = fsrs.nextRecallStability(currentDiff, currentStab, retrievability, 'hard');

      expect(goodStab).toBeGreaterThan(hardStab);
    });

    it('should apply easy bonus', () => {
      const currentStab = 5;
      const currentDiff = 5;
      const retrievability = 0.8;

      const goodStab = fsrs.nextRecallStability(currentDiff, currentStab, retrievability, 'good');
      const easyStab = fsrs.nextRecallStability(currentDiff, currentStab, retrievability, 'easy');

      expect(easyStab).toBeGreaterThan(goodStab);
    });
  });

  describe('nextForgetStability', () => {
    const fsrs = new FSRSModel({ weights: DEFAULT_FSRS_WEIGHTS });

    it('should decrease stability after failed recall', () => {
      const currentStab = 10;
      const currentDiff = 5;
      const retrievability = 0.3; // Low retrievability

      const newStab = fsrs.nextForgetStability(currentDiff, currentStab, retrievability);
      expect(newStab).toBeLessThan(currentStab);
    });

    it('should never return stability below minimum', () => {
      const currentStab = 0.5;
      const currentDiff = 5;
      const retrievability = 0.1;

      const newStab = fsrs.nextForgetStability(currentDiff, currentStab, retrievability);
      expect(newStab).toBeGreaterThanOrEqual(MIN_STABILITY);
    });
  });

  describe('nextShortTermStability', () => {
    const fsrs = new FSRSModel({ weights: DEFAULT_FSRS_WEIGHTS });

    it('should increase stability for passing grades', () => {
      const currentStab = 1;

      const goodStab = fsrs.nextShortTermStability(currentStab, 'good');
      expect(goodStab).toBeGreaterThanOrEqual(currentStab);

      const easyStab = fsrs.nextShortTermStability(currentStab, 'easy');
      expect(easyStab).toBeGreaterThanOrEqual(currentStab);
    });

    it('should handle failing grade', () => {
      const currentStab = 1;
      const newStab = fsrs.nextShortTermStability(currentStab, 'again');
      expect(newStab).toBeGreaterThan(0);
    });
  });

  describe('nextInterval', () => {
    const fsrs = new FSRSModel({ weights: DEFAULT_FSRS_WEIGHTS });

    it('should compute interval from stability', () => {
      const interval = fsrs.nextInterval(10);
      expect(interval).toBeGreaterThan(0);
      expect(interval).toBeLessThanOrEqual(fsrs.getMaximumInterval());
    });

    it('should return larger intervals for higher stability', () => {
      const interval1 = fsrs.nextInterval(5);
      const interval2 = fsrs.nextInterval(15);
      expect(interval2).toBeGreaterThan(interval1);
    });

    it('should respect maximum interval', () => {
      const fsrs = new FSRSModel({ weights: DEFAULT_FSRS_WEIGHTS, maximumInterval: 365 });
      const interval = fsrs.nextInterval(1000);
      expect(interval).toBeLessThanOrEqual(365);
    });
  });

  describe('predictReviewState', () => {
    const fsrs = new FSRSModel({ weights: DEFAULT_FSRS_WEIGHTS });

    it('should predict next state for successful review', () => {
      const currentState = {
        stability: 5,
        difficulty: 5,
      };
      const prediction = fsrs.predictReviewState(currentState, 3, 'good');

      expect(prediction.stability).toBeGreaterThan(0);
      expect(prediction.difficulty).toBeGreaterThanOrEqual(MIN_DIFFICULTY);
      expect(prediction.difficulty).toBeLessThanOrEqual(MAX_DIFFICULTY);
      expect(prediction.interval).toBeGreaterThan(0);
      expect(prediction.retrievability).toBeDefined();
    });

    it('should predict next state for failed review', () => {
      const currentState = {
        stability: 10,
        difficulty: 5,
      };
      const prediction = fsrs.predictReviewState(currentState, 15, 'again');

      expect(prediction.stability).toBeLessThan(currentState.stability);
      expect(prediction.difficulty).toBeGreaterThan(currentState.difficulty);
    });
  });

  describe('predictLearningState', () => {
    const fsrs = new FSRSModel({ weights: DEFAULT_FSRS_WEIGHTS });

    it('should predict next state for learning card', () => {
      const currentState = {
        stability: 1,
        difficulty: 5,
      };
      const prediction = fsrs.predictLearningState(currentState, 'good');

      expect(prediction.stability).toBeGreaterThan(0);
      expect(prediction.difficulty).toBeGreaterThanOrEqual(MIN_DIFFICULTY);
      expect(prediction.interval).toBeGreaterThan(0);
    });
  });

  describe('initState', () => {
    const fsrs = new FSRSModel({ weights: DEFAULT_FSRS_WEIGHTS });

    it('should initialize state for new card', () => {
      const state = fsrs.initState('good');

      expect(state.stability).toBeGreaterThanOrEqual(MIN_STABILITY);
      expect(state.difficulty).toBeGreaterThanOrEqual(MIN_DIFFICULTY);
      expect(state.difficulty).toBeLessThanOrEqual(MAX_DIFFICULTY);
    });
  });

  describe('Helper functions', () => {
    it('constrainDifficulty should enforce bounds', () => {
      expect(constrainDifficulty(0.5)).toBe(MIN_DIFFICULTY);
      expect(constrainDifficulty(15)).toBe(MAX_DIFFICULTY);
      expect(constrainDifficulty(5)).toBe(5);
    });

    it('constrainStability should enforce minimum', () => {
      expect(constrainStability(0.05)).toBe(MIN_STABILITY);
      expect(constrainStability(10)).toBe(10);
    });
  });
});
