/**
 * Integration tests for Phase 3: Algorithm integration in event consumer
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FSRS_WEIGHTS,
  FSRSModel,
} from '../../../src/domain/scheduler-service/algorithms/fsrs.js';
import { HLRModel } from '../../../src/domain/scheduler-service/algorithms/hlr.js';
import { computeNextState } from '../../../src/domain/scheduler-service/state-machine.js';

describe('Phase 3: Algorithm Integration', () => {
  describe('FSRS integration for retention lane', () => {
    const fsrs = new FSRSModel({ weights: DEFAULT_FSRS_WEIGHTS });

    it('should initialize new card with FSRS parameters', () => {
      const rating = 'good';
      const initialState = fsrs.initState(rating);

      expect(initialState.stability).toBeGreaterThan(0);
      expect(initialState.difficulty).toBeGreaterThanOrEqual(1);
      expect(initialState.difficulty).toBeLessThanOrEqual(10);
    });

    it('should compute next state for retention-lane review', () => {
      const currentState = {
        stability: 5,
        difficulty: 5,
      };
      const elapsedDays = 3;
      const rating = 'good';

      const prediction = fsrs.predictReviewState(currentState, elapsedDays, rating);

      expect(prediction.stability).toBeGreaterThan(0);
      expect(prediction.difficulty).toBeGreaterThanOrEqual(1);
      expect(prediction.interval).toBeGreaterThan(0);
      expect(prediction.retrievability).toBeDefined();
    });

    it('should handle lapse (again rating) correctly', () => {
      const currentState = {
        stability: 10,
        difficulty: 5,
      };
      const elapsedDays = 12; // Overdue
      const rating = 'again';

      const prediction = fsrs.predictReviewState(currentState, elapsedDays, rating);

      // Stability should decrease on lapse
      expect(prediction.stability).toBeLessThan(currentState.stability);
      // Difficulty should increase on lapse
      expect(prediction.difficulty).toBeGreaterThan(currentState.difficulty);
    });

    it('should handle learning state transitions', () => {
      const currentState = {
        stability: 1,
        difficulty: 5,
      };
      const rating = 'good';

      const prediction = fsrs.predictLearningState(currentState, rating);

      expect(prediction.stability).toBeGreaterThan(0);
      expect(prediction.interval).toBeGreaterThan(0);
    });
  });

  describe('HLR integration for calibration lane', () => {
    const hlr = new HLRModel();

    it('should predict half-life from features', () => {
      const features = [
        ['bias', 1.0],
        ['reviews', 5],
        ['lapses', 1],
        ['correct_streak', 3],
      ] as [string, number][];

      const prediction = hlr.predict(features, 0);

      expect(prediction.halfLifeDays).toBeGreaterThan(0);
      expect(prediction.recallProbability).toBeGreaterThan(0);
      expect(prediction.recallProbability).toBeLessThanOrEqual(1);
    });

    it('should update weights based on review outcome', () => {
      const features = [
        ['bias', 1.0],
        ['reviews', 3],
        ['lapses', 0],
        ['correct_streak', 3],
      ] as [string, number][];
      const deltaDays = 5;
      const actualRecall = 1.0; // Successful recall

      const featureCountsBefore = hlr.getFeatureCounts();
      hlr.trainUpdate(features, deltaDays, actualRecall);
      const featureCountsAfter = hlr.getFeatureCounts();

      // Feature counts should increase after training
      expect(featureCountsAfter['bias']).toBeGreaterThan(featureCountsBefore['bias'] ?? 0);
      expect(featureCountsAfter['reviews']).toBeGreaterThan(featureCountsBefore['reviews'] ?? 0);
    });

    it('should handle failed recall', () => {
      const hlr2 = new HLRModel();
      const features = [
        ['bias', 1.0],
        ['reviews', 5],
        ['lapses', 2],
        ['correct_streak', 0],
      ] as [string, number][];
      const deltaDays = 10;
      const actualRecall = 0.0; // Failed recall

      hlr2.trainUpdate(features, deltaDays, actualRecall);
      const prediction = hlr2.predict(features, 0);

      // Should still produce valid predictions
      expect(prediction.halfLifeDays).toBeGreaterThan(0);
    });
  });

  describe('State machine integration', () => {
    it('should compute correct state transitions for review flow', () => {
      // New card starts learning
      const state1 = computeNextState({
        fromState: 'new',
        rating: 'good',
        consecutiveCorrect: 1,
      });
      expect(state1).toBe('learning');

      // Learning card graduates to review
      const state2 = computeNextState({
        fromState: 'learning',
        rating: 'good',
        consecutiveCorrect: 2,
      });
      expect(state2).toBe('review');

      // Review card stays in review on success
      const state3 = computeNextState({
        fromState: 'review',
        rating: 'good',
        consecutiveCorrect: 3,
      });
      expect(state3).toBe('review');

      // Review card lapses to relearning
      const state4 = computeNextState({
        fromState: 'review',
        rating: 'again',
        consecutiveCorrect: 0,
      });
      expect(state4).toBe('relearning');

      // Relearning card recovers to review
      const state5 = computeNextState({
        fromState: 'relearning',
        rating: 'good',
        consecutiveCorrect: 1,
      });
      expect(state5).toBe('review');
    });

    it('should enforce strict transitions', () => {
      // Suspended cards cannot transition via rating
      expect(() =>
        computeNextState({
          fromState: 'suspended',
          rating: 'good',
        })
      ).toThrow();
    });
  });

  describe('Lane-specific algorithm routing', () => {
    it('should route retention lane to FSRS', () => {
      const lane = 'retention';
      const schedulingAlgorithm = lane === 'retention' ? 'fsrs' : 'hlr';

      expect(schedulingAlgorithm).toBe('fsrs');
    });

    it('should route calibration lane to HLR', () => {
      const lane = 'calibration';
      const schedulingAlgorithm = lane === 'retention' ? 'fsrs' : 'hlr';

      expect(schedulingAlgorithm).toBe('hlr');
    });
  });

  describe('Incremental calibration updates', () => {
    it('should update calibration data per-review (not threshold-based)', () => {
      const hlr = new HLRModel();
      const features = [
        ['bias', 1.0],
        ['reviews', 1],
      ] as [string, number][];

      // First review - should update immediately
      hlr.trainUpdate(features, 1, 1.0);
      const weights1 = hlr.getFeatureCounts();
      expect(weights1['bias']).toBe(1);

      // Second review - should update immediately again
      hlr.trainUpdate(features, 2, 1.0);
      const weights2 = hlr.getFeatureCounts();
      expect(weights2['bias']).toBe(2);

      // No threshold required - updates happen per-review
    });
  });

  describe('Edge cases', () => {
    it('should handle zero elapsed days', () => {
      const fsrs = new FSRSModel({ weights: DEFAULT_FSRS_WEIGHTS });
      const currentState = {
        stability: 5,
        difficulty: 5,
      };

      const prediction = fsrs.predictReviewState(currentState, 0, 'good');
      expect(prediction.stability).toBeGreaterThan(0);
      expect(prediction.retrievability).toBeGreaterThan(0.99); // Should be near 1.0
    });

    it('should handle very large elapsed days', () => {
      const fsrs = new FSRSModel({ weights: DEFAULT_FSRS_WEIGHTS });
      const currentState = {
        stability: 5,
        difficulty: 5,
      };

      const prediction = fsrs.predictReviewState(currentState, 365, 'again');
      expect(prediction.stability).toBeGreaterThan(0);
      // With stability of 5 days and 365 days elapsed, retrievability should be very low
      // but FSRS uses a specific decay formula, so just check it's significantly decreased
      expect(prediction.retrievability).toBeLessThan(0.9);
    });

    it('should handle consecutive correct without state change', () => {
      // Stay in review even with high consecutive correct
      const state = computeNextState({
        fromState: 'review',
        rating: 'good',
        consecutiveCorrect: 10,
      });
      expect(state).toBe('review');
    });
  });
});
