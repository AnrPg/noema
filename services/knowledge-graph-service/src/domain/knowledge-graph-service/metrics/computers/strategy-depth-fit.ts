/**
 * Strategy-Depth Fit (SDF) — Metric Computer
 *
 * Measures alignment between the student's graph depth profile and
 * their active learning strategy's ideal depth distribution. Uses
 * Jensen-Shannon divergence to quantify the mismatch.
 *
 * Range: [0, 1] — 0 = maximum mismatch, 1 = perfect fit (goodness)
 */

import type { IMetricComputationContext, IMetricComputer } from '../types.js';

/** Minimum nodes for meaningful SDF computation */
const MIN_NODES = 5;

/** Depth band boundaries */
const SHALLOW_MAX = 2;
const MEDIUM_MAX = 5;

/**
 * Strategy-specific ideal depth band distributions.
 * [shallow, medium, deep]
 */
const STRATEGY_TARGETS: Record<string, [number, number, number]> = {
  fast_recall_build: [0.6, 0.3, 0.1],
  deep_understanding_build: [0.15, 0.35, 0.5],
  exam_survival_build: [0.3, 0.45, 0.25],
  calibration_training_build: [0.25, 0.5, 0.25],
  discrimination_build: [0.4, 0.4, 0.2],
};

/** Uniform distribution when strategy is unknown */
const UNIFORM_TARGET: [number, number, number] = [1 / 3, 1 / 3, 1 / 3];

export class StrategyDepthFitComputer implements IMetricComputer {
  readonly abbreviation = 'SDF';
  readonly name = 'Strategy-Depth Fit';

  compute(ctx: IMetricComputationContext): number {
    const { pkgSubgraph, pkgDepthMap, activeStrategy } = ctx;
    const totalNodes = pkgSubgraph.nodes.length;

    // Edge case: insufficient data
    if (totalNodes < MIN_NODES) return 0.5;

    // Step 1: Compute depth profile
    let shallow = 0;
    let medium = 0;
    let deep = 0;

    for (const node of pkgSubgraph.nodes) {
      const depth = pkgDepthMap.get(node.nodeId) ?? 0;
      if (depth <= SHALLOW_MAX) shallow++;
      else if (depth <= MEDIUM_MAX) medium++;
      else deep++;
    }

    const emphasis: [number, number, number] = [
      shallow / totalNodes,
      medium / totalNodes,
      deep / totalNodes,
    ];

    // Step 2: Get target distribution
    const target =
      activeStrategy !== undefined
        ? (STRATEGY_TARGETS[activeStrategy] ?? UNIFORM_TARGET)
        : UNIFORM_TARGET;

    // Step 3: Compute Jensen-Shannon Divergence
    const jsd = jensenShannonDivergence(emphasis, target);

    // SDF = 1 - JSD (higher is better)
    return 1 - jsd;
  }
}

/**
 * Compute Jensen-Shannon Divergence between two distributions.
 * Uses log2 so result is in [0, 1].
 */
function jensenShannonDivergence(p: number[], q: number[]): number {
  const m = p.map((pi, i) => (pi + (q[i] ?? 0)) / 2);

  const klP = klDivergence(p, m);
  const klQ = klDivergence(q, m);

  return (klP + klQ) / 2;
}

/**
 * Compute KL divergence D_KL(P || Q).
 * Handles zeros by skipping terms where p[i] = 0.
 */
function klDivergence(p: number[], q: number[]): number {
  let sum = 0;
  const epsilon = 1e-10;
  for (let i = 0; i < p.length; i++) {
    const pi = p[i] ?? 0;
    const qi = q[i] ?? 0;
    if (pi > 0) {
      sum += pi * Math.log2(pi / (qi + epsilon));
    }
  }
  return sum;
}
