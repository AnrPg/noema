import { describe, expect, it } from 'vitest';
import { combineSignals } from '../../src/domain/metacognition-service/combine-signals.js';
import { ratingFromCombinedScore } from '../../src/domain/metacognition-service/fsrs-rating.js';

describe('combineSignals', () => {
  it('keeps self-rating nearly powerless when reasoning quality is low', () => {
    expect(combineSignals(0.2, 1)).toBe(0.24);
  });

  it('is monotonic in confidence for a fixed reasoning score', () => {
    for (const reasoning of [0, 0.2, 0.3, 0.5, 0.71, 1]) {
      let previous = combineSignals(reasoning, 0);
      for (let confidence = 0.1; confidence <= 1; confidence += 0.1) {
        const current = combineSignals(reasoning, confidence);
        expect(current).toBeGreaterThanOrEqual(previous);
        previous = current;
      }
    }
  });

  it('maps low-reasoning correct answers away from good scheduler rating', () => {
    const combined = combineSignals(0.2, 1);
    expect(ratingFromCombinedScore(combined)).toBe('again');
  });

  it('always maps reasoning below 0.3 to again regardless of confidence', () => {
    for (let reasoning = 0; reasoning < 0.3; reasoning += 0.001) {
      for (const confidence of [0, 0.25, 0.5, 0.75, 1]) {
        const combined = combineSignals(Number(reasoning.toFixed(3)), confidence);
        expect(combined).toBeLessThan(0.3);
        expect(ratingFromCombinedScore(combined)).toBe('again');
      }
    }
  });

  it('allows high-reasoning wrong answers to produce at least good scheduler rating', () => {
    const combined = combineSignals(0.9, 0);
    expect(combined).toBeGreaterThanOrEqual(0.5);
    expect(['good', 'easy']).toContain(ratingFromCombinedScore(combined));
  });
});
