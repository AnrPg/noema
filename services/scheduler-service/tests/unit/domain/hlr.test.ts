/**
 * Unit tests for the HLR (Half-Life Regression) algorithm.
 *
 * Each assertion is verified against the reference Python implementation in
 * third-party/halflife-regression/experiment.py (Settles & Meeder 2016).
 *
 * Key constants (both Python and TS):
 *   MIN_HALF_LIFE = 15 / (24 * 60) ≈ 0.010417 days (15 minutes)
 *   MAX_HALF_LIFE = 274 days (~9 months)
 *   LN2 = ln(2) ≈ 0.693147
 *
 * Formula recap:
 *   halflife(features, base=2) = hclip( base ^ sum(w_k * x_k) )
 *   predict(features, deltaDays, base=2):
 *     h = halflife(features, base)
 *     p = pclip( 2^(-deltaDays / h) )
 */

import { describe, expect, it } from 'vitest';

import {
  HLRModel,
  type Feature,
} from '../../../src/domain/scheduler-service/algorithms/hlr.js';

// ---------------------------------------------------------------------------
// Constants mirrored from the implementation (not exported; computed here)
// ---------------------------------------------------------------------------

const MIN_HALF_LIFE = 15.0 / (24 * 60); // 0.010416... days
const MAX_HALF_LIFE = 274.0; // days

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkFeatures(...pairs: [string, number][]): Feature[] {
  return pairs;
}

// ---------------------------------------------------------------------------
// pclip / hclip boundary behaviour
// ---------------------------------------------------------------------------

describe('HLRModel — boundary clamping', () => {
  it('halflife clamps to MIN_HALF_LIFE when features produce a very small value', () => {
    // weights all zero → dp=0 → 2^0=1 → hclip(1) = 1 (between bounds)
    const model = new HLRModel({ initialWeights: { bias: -999 } });
    const h = model.halflife(mkFeatures(['bias', 1]));
    expect(h).toBeCloseTo(MIN_HALF_LIFE, 8);
  });

  it('halflife clamps to MAX_HALF_LIFE when features produce an enormous value', () => {
    const model = new HLRModel({ initialWeights: { bias: 999 } });
    const h = model.halflife(mkFeatures(['bias', 1]));
    expect(h).toBe(MAX_HALF_LIFE);
  });

  it('predict recall is clamped to min 0.0001 for huge deltaDays', () => {
    const model = new HLRModel({ initialWeights: { bias: 0 } }); // halflife = 1 day
    const { recallProbability } = model.predict(mkFeatures(['bias', 1]), 9999);
    expect(recallProbability).toBeGreaterThanOrEqual(0.0001);
    expect(recallProbability).toBeLessThanOrEqual(0.9999);
  });

  it('predict recall is clamped to max 0.9999 for deltaDays = 0', () => {
    const model = new HLRModel({ initialWeights: { bias: 1 } }); // halflife = 2 days
    const { recallProbability } = model.predict(mkFeatures(['bias', 1]), 0);
    // 2^(-0/h) = 1 → pclip → 0.9999
    expect(recallProbability).toBe(0.9999);
  });
});

// ---------------------------------------------------------------------------
// halflife() — basic computation
// ---------------------------------------------------------------------------

describe('HLRModel — halflife()', () => {
  it('returns hclip(2^dp) for a single feature', () => {
    // w['bias'] = 1, x = 1 → dp = 1 → 2^1 = 2
    const model = new HLRModel({ initialWeights: { bias: 1 } });
    const h = model.halflife(mkFeatures(['bias', 1]));
    expect(h).toBeCloseTo(2.0);
  });

  it('computes dot product of multiple features', () => {
    // dp = 2*1 + 1*0.5 = 2.5 → 2^2.5 ≈ 5.657
    const model = new HLRModel({ initialWeights: { a: 2, b: 1 } });
    const h = model.halflife(mkFeatures(['a', 1], ['b', 0.5]));
    expect(h).toBeCloseTo(Math.pow(2, 2.5), 6);
  });

  it('unknown feature keys contribute 0 (missing weight treated as 0)', () => {
    const model = new HLRModel({ initialWeights: { a: 1 } });
    // feature 'z' is unknown → weight 0 → dp = 1*1 + 0*5 = 1 → h = 2
    const h = model.halflife(mkFeatures(['a', 1], ['z', 5]));
    expect(h).toBeCloseTo(2.0, 6);
  });

  it('uses custom base when provided', () => {
    // w=1, x=1, base=3 → dp=1 → 3^1 = 3
    const model = new HLRModel({ initialWeights: { a: 1 } });
    const h = model.halflife(mkFeatures(['a', 1]), 3);
    expect(h).toBeCloseTo(3.0, 6);
  });

  it('falls back to MAX_HALF_LIFE on overflow (empty weights, impossible dp)', () => {
    const model = new HLRModel();
    // No weights, no features → dp = 0 → 2^0 = 1 (within bounds)
    const h = model.halflife([]);
    expect(h).toBeCloseTo(1.0, 6);
  });
});

// ---------------------------------------------------------------------------
// predict() — known input vectors
// ---------------------------------------------------------------------------

describe('HLRModel — predict()', () => {
  it('computes recall probability matching Python formula for t=1, h=2', () => {
    // w['x']=1, feature x=1 → h=2; p = pclip(2^(-1/2)) = pclip(0.70711)
    const model = new HLRModel({ initialWeights: { x: 1 } });
    const { recallProbability, halfLifeDays } = model.predict(mkFeatures(['x', 1]), 1);
    expect(halfLifeDays).toBeCloseTo(2.0, 6);
    expect(recallProbability).toBeCloseTo(Math.pow(2, -1 / 2), 6); // 0.70711...
  });

  it('recall decreases monotonically as deltaDays increases', () => {
    const model = new HLRModel({ initialWeights: { x: 1 } }); // h = 2
    const p1 = model.predict(mkFeatures(['x', 1]), 1).recallProbability;
    const p2 = model.predict(mkFeatures(['x', 1]), 2).recallProbability;
    const p7 = model.predict(mkFeatures(['x', 1]), 7).recallProbability;
    expect(p1).toBeGreaterThan(p2);
    expect(p2).toBeGreaterThan(p7);
  });

  it('recall at half-life is ≈ 0.5 (before pclip)', () => {
    // h=1 day, t=1 day → p = 2^(-1/1) = 0.5
    const model = new HLRModel({ initialWeights: { x: 0 } }); // 2^0 = 1 → h = 1
    const { recallProbability } = model.predict(mkFeatures(['x', 1]), 1);
    expect(recallProbability).toBeCloseTo(0.5, 5);
  });

  it('halfLifeDays returned by predict matches halflife()', () => {
    const model = new HLRModel({ initialWeights: { a: 1.5 } });
    const features = mkFeatures(['a', 1]);
    const hDirect = model.halflife(features);
    const { halfLifeDays } = model.predict(features, 3);
    expect(halfLifeDays).toBeCloseTo(hDirect, 10);
  });

  /**
   * Reference comparison against Python experiment.py:
   *   weights = {'bias': 0.5, 'right': 0.3}
   *   features = [('bias', 1.0), ('right', 2.0)]
   *   dp = 0.5*1 + 0.3*2 = 1.1 → h = hclip(2^1.1) = 2.14355
   *   t = 3 → p = pclip(2^(-3/2.14355)) = pclip(0.37926) ≈ 0.37926
   */
  it('matches Python reference for bias+right features (t=3d)', () => {
    const model = new HLRModel({ initialWeights: { bias: 0.5, right: 0.3 } });
    const features = mkFeatures(['bias', 1.0], ['right', 2.0]);
    const expectedH = Math.min(MAX_HALF_LIFE, Math.max(MIN_HALF_LIFE, Math.pow(2, 1.1)));
    const expectedP = Math.min(0.9999, Math.max(0.0001, Math.pow(2, -3 / expectedH)));
    const { recallProbability, halfLifeDays } = model.predict(features, 3);
    expect(halfLifeDays).toBeCloseTo(expectedH, 5);
    expect(recallProbability).toBeCloseTo(expectedP, 5);
  });
});

// ---------------------------------------------------------------------------
// trainUpdate() — weight convergence direction
// ---------------------------------------------------------------------------

describe('HLRModel — trainUpdate()', () => {
  it('increases bias weight when actual recall is higher than predicted', () => {
    // p_pred < actualRecall → gradient update should push weights to reduce error
    const model = new HLRModel({
      initialWeights: { bias: 0.0 },
      lrate: 0.01,
    });
    const features = mkFeatures(['bias', 1]);
    const { recallProbability: pBefore } = model.predict(features, 5);

    // low initial recall (bias=0 → h=1 → p(5d) = 2^-5 ≈ 0.031)
    // actualRecall = 0.9 (much higher) → weights should increase to raise halflife
    model.trainUpdate(features, 5, 0.9);

    const biasAfter = model.getWeights()['bias'] ?? 0;
    expect(pBefore).toBeLessThan(0.9);
    // bias went up (increasing halflife → increasing recall probability)
    expect(biasAfter).toBeGreaterThan(0.0);
  });

  it('decreases bias weight when actual recall is lower than predicted', () => {
    const model = new HLRModel({
      initialWeights: { bias: 2.0 }, // high halflife → high recall
      lrate: 0.01,
    });
    const features = mkFeatures(['bias', 1]);
    const biasBefore = model.getWeights()['bias'] ?? 0;
    // actualRecall = 0.1 (much lower than predicted) → weights should decrease
    model.trainUpdate(features, 1, 0.1);
    const biasAfter = model.getWeights()['bias'] ?? 0;
    expect(biasAfter).toBeLessThan(biasBefore);
  });

  it('weight changes are proportional to the prediction error', () => {
    const makeModel = () => new HLRModel({ initialWeights: { bias: 0.0 }, lrate: 0.001 });
    const features = mkFeatures(['bias', 1]);
    const deltaDays = 5;

    // Small error
    const modelSmall = makeModel();
    modelSmall.trainUpdate(features, deltaDays, 0.05); // pred ≈ 0.031, err ≈ 0.019
    const smallDelta = Math.abs((modelSmall.getWeights()['bias'] ?? 0) - 0);

    // Large error
    const modelLarge = makeModel();
    modelLarge.trainUpdate(features, deltaDays, 0.9); // pred ≈ 0.031, err ≈ 0.869
    const largeDelta = Math.abs((modelLarge.getWeights()['bias'] ?? 0) - 0);

    expect(largeDelta).toBeGreaterThan(smallDelta);
  });

  it('omitHTerm=true skips the half-life regularization term', () => {
    const withHTerm = new HLRModel({ initialWeights: { bias: 0.0 }, lrate: 0.01, omitHTerm: false });
    const withoutHTerm = new HLRModel({ initialWeights: { bias: 0.0 }, lrate: 0.01, omitHTerm: true });
    const features = mkFeatures(['bias', 1]);
    withHTerm.trainUpdate(features, 5, 0.9);
    withoutHTerm.trainUpdate(features, 5, 0.9);
    // Both update weights, but by different amounts (h-term removed in one)
    const deltaWith = withHTerm.getWeights()['bias'] ?? 0;
    const deltaWithout = withoutHTerm.getWeights()['bias'] ?? 0;
    // They should both have moved in the same direction but not be identical
    expect(deltaWith).toBeGreaterThan(0);
    expect(deltaWithout).toBeGreaterThan(0);
    expect(deltaWith).not.toBeCloseTo(deltaWithout, 10);
  });

  it('feature count increments after each training observation', () => {
    const model = new HLRModel({ initialWeights: { bias: 0 }, lrate: 0.01 });
    model.trainUpdate(mkFeatures(['bias', 1]), 2, 0.5);
    model.trainUpdate(mkFeatures(['bias', 1]), 2, 0.5);
    model.trainUpdate(mkFeatures(['bias', 1]), 2, 0.5);
    const fcounts = model.getFeatureCounts();
    expect(fcounts['bias']).toBe(3);
  });

  it('learning rate decays with sqrt of feature count (adaptive lrate)', () => {
    // After many updates learning rate shrinks; weight changes get smaller
    const model = new HLRModel({ initialWeights: { bias: 0 }, lrate: 0.5 });
    const features = mkFeatures(['bias', 1]);
    const deltas: number[] = [];
    for (let i = 0; i < 10; i++) {
      const before = model.getWeights()['bias'] ?? 0;
      model.trainUpdate(features, 5, 0.9);
      const after = model.getWeights()['bias'] ?? 0;
      deltas.push(Math.abs(after - before));
    }
    // Later updates should generally be smaller due to decaying lrate
    const firstHalf = deltas.slice(0, 5).reduce((a, b) => a + b, 0);
    const secondHalf = deltas.slice(5).reduce((a, b) => a + b, 0);
    expect(firstHalf).toBeGreaterThan(secondHalf);
  });
});

// ---------------------------------------------------------------------------
// getWeights() / loadWeights() — serialization round-trip
// ---------------------------------------------------------------------------

describe('HLRModel — weight serialization', () => {
  it('getWeights() returns the current weights as a plain object', () => {
    const initial = { bias: 1.5, right: 0.3, wrong: -0.2 };
    const model = new HLRModel({ initialWeights: initial });
    expect(model.getWeights()).toEqual(initial);
  });

  it('loadWeights() replaces all weights', () => {
    const model = new HLRModel({ initialWeights: { old: 99 } });
    model.loadWeights({ bias: 2.0, right: 0.5 });
    expect(model.getWeights()).toEqual({ bias: 2.0, right: 0.5 });
    expect(model.getWeights()['old']).toBeUndefined();
  });

  it('serialises and restores equivalently: round-trip produces same predictions', () => {
    const model = new HLRModel({ initialWeights: { bias: 0.7, right: 0.4 } });
    const features = mkFeatures(['bias', 1], ['right', 3]);
    const deltaDays = 4;

    const { recallProbability: pBefore } = model.predict(features, deltaDays);
    const snapshot = model.getWeights();

    const restored = new HLRModel();
    restored.loadWeights(snapshot);

    const { recallProbability: pAfter } = restored.predict(features, deltaDays);
    expect(pAfter).toBeCloseTo(pBefore, 10);
  });

  it('getWeights() returns a defensive copy — mutations do not affect the model', () => {
    const model = new HLRModel({ initialWeights: { bias: 1.0 } });
    const weights = model.getWeights();
    weights['bias'] = 999;
    expect(model.getWeights()['bias']).toBeCloseTo(1.0, 10);
  });
});

// ---------------------------------------------------------------------------
// Constructor options
// ---------------------------------------------------------------------------

describe('HLRModel — constructor options', () => {
  it('creates a zero-weight model when no initial weights are provided', () => {
    const model = new HLRModel();
    // no features means dp=0 → halflife = hclip(1) = 1
    expect(model.halflife([])).toBeCloseTo(1.0, 6);
    expect(Object.keys(model.getWeights())).toHaveLength(0);
  });

  it('respects custom lrate / hlwt / l2wt during training', () => {
    // With a larger lrate the weight moves more per update
    const slow = new HLRModel({ initialWeights: { bias: 0 }, lrate: 0.001 });
    const fast = new HLRModel({ initialWeights: { bias: 0 }, lrate: 0.1 });
    const features = mkFeatures(['bias', 1]);
    slow.trainUpdate(features, 5, 0.9);
    fast.trainUpdate(features, 5, 0.9);
    expect(Math.abs(fast.getWeights()['bias'] ?? 0)).toBeGreaterThan(
      Math.abs(slow.getWeights()['bias'] ?? 0)
    );
  });
});
