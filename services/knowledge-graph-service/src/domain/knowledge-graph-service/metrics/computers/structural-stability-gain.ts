/**
 * Structural Stability Gain (SSG) — Metric Computer
 *
 * Measures the reduction in structural churn between two consecutive
 * snapshots. If the student's graph is churning less over time,
 * their mental model is stabilising. Depth-weighted so deeper
 * (more meaningful) structural changes matter more.
 *
 * Range: [-1, 1] — negative = destabilising, 0 = no change, positive = stabilising
 */

import type { NodeId } from '@noema/types';

import type { IMetricComputationContext, IMetricComputer } from '../types.js';

export class StructuralStabilityGainComputer implements IMetricComputer {
  readonly abbreviation = 'SSG';
  readonly name = 'Structural Stability Gain';

  compute(ctx: IMetricComputationContext): number {
    const { pkgSubgraph, previousSnapshot, pkgDepthMap } = ctx;

    // Compute current depth-weighted churn
    const currentChurn = computeDepthWeightedChurn(pkgSubgraph.nodes, pkgDepthMap);

    // Without a previous snapshot, store current stability for future deltas
    if (!previousSnapshot) return 1 - currentChurn;

    // Derive previous churn from previous snapshot's SSG value:
    // prev_SSG stored as (1 - prev_churn), so prev_churn = 1 - prev_SSG
    const prevSSG = previousSnapshot.metrics.structuralStabilityGain;
    const prevChurn = 1 - prevSSG;

    // SSG = churn_prev - churn_current (positive = stabilising)
    const ssg = prevChurn - currentChurn;

    return Math.min(Math.max(ssg, -1), 1);
  }
}

/**
 * Compute depth-weighted structural churn for a node set.
 * Nodes with `updatedAt !== createdAt` are considered changed.
 * Deeper nodes contribute more weight.
 */
function computeDepthWeightedChurn(
  nodes: readonly { nodeId: NodeId; createdAt: string; updatedAt: string }[],
  depthMap: ReadonlyMap<NodeId, number>
): number {
  if (nodes.length === 0) return 0;

  let totalWeight = 0;
  let changedWeight = 0;

  for (const node of nodes) {
    const depth = depthMap.get(node.nodeId) ?? 0;
    const weight = 1 + depth;
    totalWeight += weight;

    if (node.createdAt !== node.updatedAt) {
      changedWeight += weight;
    }
  }

  return totalWeight > 0 ? changedWeight / totalWeight : 0;
}
