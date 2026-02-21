/**
 * Half-Life Regression (HLR) Algorithm
 *
 * Pure TypeScript translation of Duolingo's Half-Life Regression model.
 * Every constant, default parameter, formula, and gradient computation is
 * identical to the original Python implementation in:
 *   third-party/halflife-regression/experiment.py
 *
 * Reference: Settles & Meeder (2016) — "A Trainable Spaced Repetition Model
 *            for Language Learning" (ACL 2016)
 */

// ---------------------------------------------------------------------------
// Constants (identical to experiment.py)
// ---------------------------------------------------------------------------

/** 15 minutes in days */
const MIN_HALF_LIFE = 15.0 / (24 * 60);

/** ~9 months in days */
const MAX_HALF_LIFE = 274.0;

const LN2 = Math.log(2.0);

// ---------------------------------------------------------------------------
// Helper functions (identical to experiment.py)
// ---------------------------------------------------------------------------

/** Bound min/max model predictions. */
function pclip(p: number): number {
  return Math.min(Math.max(p, 0.0001), 0.9999);
}

/** Bound min/max half-life. */
function hclip(h: number): number {
  return Math.min(Math.max(h, MIN_HALF_LIFE), MAX_HALF_LIFE);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single feature: [name, value] pair — mirrors Python's (str, float) tuples. */
export type Feature = [name: string, value: number];

export interface HLRModelOptions {
  initialWeights?: Record<string, number> | null;
  omitHTerm?: boolean;
  lrate?: number;
  hlwt?: number;
  l2wt?: number;
  sigma?: number;
}

export interface PredictResult {
  recallProbability: number;
  halfLifeDays: number;
}

// ---------------------------------------------------------------------------
// HLR Model
// ---------------------------------------------------------------------------

/**
 * Half-Life Regression model.
 *
 * Maintains trained weights and can:
 * - predict recall probability and half-life given features
 * - update weights from a single training instance (online learning)
 */
export class HLRModel {
  readonly omitHTerm: boolean;
  readonly lrate: number;
  readonly hlwt: number;
  readonly l2wt: number;
  readonly sigma: number;

  private weights: Map<string, number>;
  private fcounts: Map<string, number>;

  constructor(options: HLRModelOptions = {}) {
    const {
      initialWeights = null,
      omitHTerm = false,
      lrate = 0.001,
      hlwt = 0.01,
      l2wt = 0.1,
      sigma = 1.0,
    } = options;

    this.omitHTerm = omitHTerm;
    this.weights = new Map();
    if (initialWeights !== null && initialWeights !== undefined) {
      for (const [k, v] of Object.entries(initialWeights)) {
        this.weights.set(k, v);
      }
    }
    this.fcounts = new Map();
    this.lrate = lrate;
    this.hlwt = hlwt;
    this.l2wt = l2wt;
    this.sigma = sigma;
  }

  /** Compute half-life from feature vector. */
  halflife(features: Feature[], base: number = 2.0): number {
    try {
      let dp = 0;
      for (const [k, xK] of features) {
        dp += (this.weights.get(k) ?? 0) * xK;
      }
      return hclip(base ** dp);
    } catch {
      return MAX_HALF_LIFE;
    }
  }

  /**
   * Predict recall probability and half-life.
   *
   * @param features - List of [featureName, value] tuples.
   * @param deltaDays - Time since last review in days.
   * @param base - Logarithmic base for half-life computation.
   * @returns { recallProbability, halfLifeDays }
   */
  predict(
    features: Feature[],
    deltaDays: number,
    base: number = 2.0,
  ): PredictResult {
    const h = this.halflife(features, base);
    const p = 2.0 ** (-deltaDays / h);
    return { recallProbability: pclip(p), halfLifeDays: h };
  }

  /**
   * Online weight update from a single observation.
   *
   * @param features - Feature vector.
   * @param deltaDays - Time since last review in days.
   * @param actualRecall - Observed recall proportion [0, 1].
   * @param actualHalfLife - Observed half-life (optional, estimated if null).
   */
  trainUpdate(
    features: Feature[],
    deltaDays: number,
    actualRecall: number,
    actualHalfLife: number | null = null,
  ): void {
    const base = 2.0;
    const { recallProbability: p, halfLifeDays: h } = this.predict(
      features,
      deltaDays,
      base,
    );

    if (actualHalfLife === null || actualHalfLife === undefined) {
      // Estimate half-life from actual recall and delta
      if (actualRecall > 0.0001 && deltaDays > 0) {
        actualHalfLife = hclip(-deltaDays / Math.log2(actualRecall));
      } else {
        actualHalfLife = h;
      }
    }

    const dlpDw =
      2.0 * (p - actualRecall) * (LN2 ** 2) * p * (deltaDays / h);
    const dlhDw = 2.0 * (h - actualHalfLife) * LN2 * h;

    for (const [k, xK] of features) {
      const rate =
        (1.0 / (1.0 + actualRecall)) *
        this.lrate /
        Math.sqrt(1 + (this.fcounts.get(k) ?? 0));

      // sl(p) update
      this.weights.set(k, (this.weights.get(k) ?? 0) - rate * dlpDw * xK);
      // sl(h) update
      if (!this.omitHTerm) {
        this.weights.set(
          k,
          (this.weights.get(k) ?? 0) - rate * this.hlwt * dlhDw * xK,
        );
      }
      // L2 regularization update
      this.weights.set(
        k,
        (this.weights.get(k) ?? 0) -
          (rate * this.l2wt * (this.weights.get(k) ?? 0)) / this.sigma ** 2,
      );
      // increment feature count for learning rate
      this.fcounts.set(k, (this.fcounts.get(k) ?? 0) + 1);
    }
  }

  /** Return current model weights. */
  getWeights(): Record<string, number> {
    return Object.fromEntries(this.weights);
  }

  /** Return current feature counts. */
  getFeatureCounts(): Record<string, number> {
    return Object.fromEntries(this.fcounts);
  }

  /** Load model weights. */
  loadWeights(weights: Record<string, number>): void {
    this.weights = new Map();
    for (const [k, v] of Object.entries(weights)) {
      this.weights.set(k, v);
    }
  }
}

// Re-export helpers for testing
export { hclip, LN2, MAX_HALF_LIFE, MIN_HALF_LIFE, pclip };

