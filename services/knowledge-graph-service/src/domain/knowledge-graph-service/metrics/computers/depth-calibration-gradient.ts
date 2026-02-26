/**
 * Depth Calibration Gradient (DCG) — Metric Computer
 *
 * Measures whether the student builds conceptual prerequisite chains
 * of the right depth compared to the CKG. High DCG = student mis-estimates
 * the depth of knowledge structures (Dunning-Kruger indicator).
 *
 * Range: [0, 1] — 0 = perfect depth match, 1 = severe miscalibration (badness)
 */

import type { IMetricComputationContext, IMetricComputer } from '../types.js';

export class DepthCalibrationGradientComputer implements IMetricComputer {
  readonly abbreviation = 'DCG';
  readonly name = 'Depth Calibration Gradient';

  compute(ctx: IMetricComputationContext): number {
    const { comparison, pkgDepthMap, ckgDepthMap } = ctx;
    const alignment = comparison.nodeAlignment;

    if (alignment.size === 0) return 0.0;

    // Check if CKG has any non-zero depths (prerequisite edges)
    let ckgHasDepth = false;
    for (const [, depth] of ckgDepthMap) {
      if (depth > 0) {
        ckgHasDepth = true;
        break;
      }
    }
    if (!ckgHasDepth) return 0.0;

    // Compute per-node depth discrepancy
    let weightedDiscrepancySum = 0;
    let weightSum = 0;

    for (const [pkgNodeId, ckgNodeId] of alignment) {
      const pkgDepth = pkgDepthMap.get(pkgNodeId) ?? 0;
      const ckgDepth = ckgDepthMap.get(ckgNodeId) ?? 0;

      // Normalized discrepancy
      const delta = Math.abs(pkgDepth - ckgDepth) / Math.max(ckgDepth, 1);

      // Weight by CKG depth (deeper nodes contribute more)
      const weight = 1 + ckgDepth;
      weightedDiscrepancySum += delta * weight;
      weightSum += weight;
    }

    const dcg = weightSum > 0 ? weightedDiscrepancySum / weightSum : 0.0;
    return Math.min(Math.max(dcg, 0), 1);
  }
}
