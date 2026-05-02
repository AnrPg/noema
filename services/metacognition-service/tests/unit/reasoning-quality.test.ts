import { describe, expect, it } from 'vitest';
import { scoreReasoningQuality } from '../../src/domain/metacognition-service/reasoning-quality.js';

const frameNames = ['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6'];

function traceWithScore(score: number) {
  return {
    frames: Object.fromEntries(frameNames.map((frame) => [frame, { score }])),
  };
}

describe('scoreReasoningQuality', () => {
  it('averages explicit frame scores across the seven-frame trace', () => {
    expect(scoreReasoningQuality(traceWithScore(0.8)).reasoningQuality).toBe(0.8);
  });

  it('derives low quality from guessing and superficial cues', () => {
    const result = scoreReasoningQuality({
      frames: {
        f0: { score: 0.2, notes: 'goal not identified' },
        f1: { score: 0.2, notes: 'prompt misread' },
        f2: { score: 0.2, notes: 'superficial cue' },
        f3: { score: 0.2, notes: 'guess' },
        f4: { score: 0.2, notes: 'invalid reasoning' },
        f5: { score: 0.2, notes: 'premature commit' },
        f6: { score: 0.2, notes: 'wrong attribution' },
      },
    });

    expect(result.reasoningQuality).toBeLessThan(0.3);
  });
});
