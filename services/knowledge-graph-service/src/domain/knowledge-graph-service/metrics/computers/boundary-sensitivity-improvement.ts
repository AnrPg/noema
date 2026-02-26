/**
 * Boundary Sensitivity Improvement (BSI) — Metric Computer
 *
 * Measures whether the student is getting better at staying within
 * domain boundaries. Compares current SLI with previous SLI.
 * Positive BSI → fewer scope leaks; negative → more leaks.
 *
 * Range: [-1, 1] — -1 = worsened, +1 = maximum improvement
 */

import type { IMetricComputationContext, IMetricComputer } from '../types.js';

import { ScopeLeakageIndexComputer } from './scope-leakage-index.js';

export class BoundarySensitivityImprovementComputer implements IMetricComputer {
  readonly abbreviation = 'BSI';
  readonly name = 'Boundary Sensitivity Improvement';

  private readonly sliComputer = new ScopeLeakageIndexComputer();

  compute(ctx: IMetricComputationContext): number {
    const { previousSnapshot } = ctx;

    // If no previous snapshot, improvement can't be assessed → neutral
    if (!previousSnapshot) return 0.0;

    const prevSLI = previousSnapshot.metrics.scopeLeakageIndex;

    // Compute current SLI
    const currentSLI = this.sliComputer.compute(ctx);

    // BSI = prevSLI - currentSLI (positive = improvement since SLI is badness)
    const delta = prevSLI - currentSLI;

    // Normalise to [-1, 1]
    return Math.min(Math.max(delta, -1), 1);
  }
}
