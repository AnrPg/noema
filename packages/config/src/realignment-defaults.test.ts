import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ELIGIBILITY_CONFIG,
  DEFAULT_GAMIFICATION_CONFIG,
  DEFAULT_METACOGNITION_CONFIG,
  DEFAULT_REALIGNMENT_CONFIG,
} from './index.js';

describe('realignment config defaults', () => {
  it('exports metacognition thresholds used by the closed learning loop', () => {
    expect(DEFAULT_METACOGNITION_CONFIG.reasoningWeights.highReasoning.traceWeight).toBe(0.85);
    expect(DEFAULT_METACOGNITION_CONFIG.fsrsRatingBoundaries.goodBelow).toBe(0.8);
    expect(DEFAULT_METACOGNITION_CONFIG.triggerThresholds.overconfidenceConfidence).toBe(0.8);
  });

  it('composes gamification and eligibility defaults under one realignment config', () => {
    expect(DEFAULT_GAMIFICATION_CONFIG.progressiveCapabilityThresholds).toHaveLength(6);
    expect(DEFAULT_ELIGIBILITY_CONFIG.recentModeWindow).toBe(5);
    expect(DEFAULT_REALIGNMENT_CONFIG.gamification).toBe(DEFAULT_GAMIFICATION_CONFIG);
    expect(DEFAULT_REALIGNMENT_CONFIG.eligibility).toBe(DEFAULT_ELIGIBILITY_CONFIG);
  });
});
