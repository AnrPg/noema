/**
 * Structural Strategy Entropy (SSE) — Metric Computer
 *
 * Measures how unevenly the student distributes learning effort across
 * structural regions. Low SSE = uniform, high SSE = very uneven.
 * Interpretation depends on context (neither extreme is unconditionally good).
 *
 * Range: [0, 1] — 0 = perfectly uniform, 1 = extremely uneven
 */

import type { IMetricComputationContext, IMetricComputer } from '../types.js';

export class StructuralStrategyEntropyComputer implements IMetricComputer {
  readonly abbreviation = 'SSE';
  readonly name = 'Structural Strategy Entropy';

  compute(ctx: IMetricComputationContext): number {
    const { structuralRegions, pkgSubgraph } = ctx;

    // Edge case: 0 or 1 region → no variation possible
    if (structuralRegions.length <= 1) return 0.0;

    const totalNodes = pkgSubgraph.nodes.length;
    if (totalNodes === 0) return 0.0;

    const numRegions = structuralRegions.length;
    const maxEntropy = Math.log2(numRegions);
    const epsilon = 1e-10;

    // Step 1: Compute depth entropy
    const totalDepth = structuralRegions.reduce((sum, r) => sum + r.maxDepth, 0);
    let depthEntropy = 0;
    if (totalDepth > 0) {
      for (const region of structuralRegions) {
        const p = region.maxDepth / totalDepth;
        if (p > 0) {
          depthEntropy -= p * Math.log2(p + epsilon);
        }
      }
    }
    const normalizedDepthEntropy = maxEntropy > 0 ? depthEntropy / maxEntropy : 0;

    // Step 2: Compute size entropy
    let sizeEntropy = 0;
    for (const region of structuralRegions) {
      const q = region.size / totalNodes;
      if (q > 0) {
        sizeEntropy -= q * Math.log2(q + epsilon);
      }
    }
    const normalizedSizeEntropy = maxEntropy > 0 ? sizeEntropy / maxEntropy : 0;

    // Step 3: Invert — high entropy (uniform) → low SSE
    const sse = 1 - (normalizedDepthEntropy + normalizedSizeEntropy) / 2;

    return Math.min(Math.max(sse, 0), 1);
  }
}
