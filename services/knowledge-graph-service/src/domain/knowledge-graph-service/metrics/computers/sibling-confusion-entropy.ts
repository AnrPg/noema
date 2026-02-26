/**
 * Sibling Confusion Entropy (SCE) — Metric Computer
 *
 * Measures how much the student confuses concepts that share a common
 * parent in the CKG. High cross-sibling edges (not present in CKG)
 * indicate inability to discriminate between related concepts.
 *
 * Range: [0, 1] — 0 = good discrimination, 1 = total confusion (badness)
 */

import type { NodeId } from '@noema/types';

import type { IMetricComputationContext, IMetricComputer } from '../types.js';

export class SiblingConfusionEntropyComputer implements IMetricComputer {
  readonly abbreviation = 'SCE';
  readonly name = 'Sibling Confusion Entropy';

  compute(ctx: IMetricComputationContext): number {
    const { ckgSiblingGroups, comparison, pkgSubgraph, ckgSubgraph } = ctx;
    const alignment = comparison.nodeAlignment;

    if (ckgSiblingGroups.length === 0) return 0.0;

    // Build inverse alignment: CKG → PKG
    const inverseAlignment = new Map<NodeId, NodeId>();
    for (const [pkgId, ckgId] of alignment) {
      inverseAlignment.set(ckgId, pkgId);
    }

    // Build PKG edge set for cross-sibling edge checking
    const pkgEdgeSet = new Set<string>();
    for (const edge of pkgSubgraph.edges) {
      pkgEdgeSet.add(`${edge.sourceNodeId as string}|${edge.targetNodeId as string}`);
    }

    // Build CKG edge set for legitimacy checking
    const ckgEdgeSet = new Set<string>();
    for (const edge of ckgSubgraph.edges) {
      ckgEdgeSet.add(`${edge.sourceNodeId as string}|${edge.targetNodeId as string}`);
    }

    let weightedConfusionSum = 0;
    let weightSum = 0;

    for (const group of ckgSiblingGroups) {
      // Map CKG siblings to PKG node IDs
      const pkgSiblings: NodeId[] = [];
      for (const ckgSiblingId of group.siblingNodeIds) {
        const pkgId = inverseAlignment.get(ckgSiblingId);
        if (pkgId) pkgSiblings.push(pkgId);
      }

      // Need at least 2 mapped siblings
      if (pkgSiblings.length < 2) continue;

      // Count cross-sibling edges in PKG
      let crossEdges = 0;
      for (const srcId of pkgSiblings) {
        for (const tgtId of pkgSiblings) {
          if (srcId === tgtId) continue;
          if (pkgEdgeSet.has(`${srcId as string}|${tgtId as string}`)) {
            crossEdges++;
          }
        }
      }

      // Count legitimate cross-sibling edges (also exist in CKG)
      let legitimateEdges = 0;
      for (const srcPkgId of pkgSiblings) {
        const srcCkgId = alignment.get(srcPkgId);
        if (!srcCkgId) continue;
        for (const tgtPkgId of pkgSiblings) {
          if (srcPkgId === tgtPkgId) continue;
          const tgtCkgId = alignment.get(tgtPkgId);
          if (!tgtCkgId) continue;
          if (
            pkgEdgeSet.has(`${srcPkgId as string}|${tgtPkgId as string}`) &&
            ckgEdgeSet.has(`${srcCkgId as string}|${tgtCkgId as string}`)
          ) {
            legitimateEdges++;
          }
        }
      }

      const confusion = Math.max(crossEdges - legitimateEdges, 0);
      const maxCross = pkgSiblings.length * (pkgSiblings.length - 1); // directed

      const ratio = maxCross > 0 ? confusion / maxCross : 0;

      // Weight by group size (larger groups matter more)
      weightedConfusionSum += ratio * pkgSiblings.length;
      weightSum += pkgSiblings.length;
    }

    return weightSum > 0 ? weightedConfusionSum / weightSum : 0.0;
  }
}
