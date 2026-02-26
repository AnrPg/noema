/**
 * Abstraction Drift (AD) — Metric Computer
 *
 * Measures how far the user's is_a/part_of hierarchy has diverged
 * from the canonical structure. Uses Jaccard distance on parent sets
 * of aligned nodes, weighted by CKG depth importance.
 *
 * Range: [0, 1] — 0 = perfect match, 1 = total drift (badness metric)
 */

import type { NodeId } from '@noema/types';

import type { IMetricComputationContext, IMetricComputer } from '../types.js';

export class AbstractionDriftComputer implements IMetricComputer {
  readonly abbreviation = 'AD';
  readonly name = 'Abstraction Drift';

  compute(ctx: IMetricComputationContext): number {
    const { comparison, pkgParentMap, ckgParentMap, ckgDepthMap } = ctx;
    const alignment = comparison.nodeAlignment;

    // Edge case: no aligned nodes
    if (alignment.size === 0) return 1.0;

    // Check if PKG has any hierarchical edges at all
    let pkgHasHierarchical = false;
    for (const [, parents] of pkgParentMap) {
      if (parents.size > 0) {
        pkgHasHierarchical = true;
        break;
      }
    }

    // Check if CKG has hierarchical edges
    let ckgHasHierarchical = false;
    for (const [, parents] of ckgParentMap) {
      if (parents.size > 0) {
        ckgHasHierarchical = true;
        break;
      }
    }

    // If CKG has no hierarchical edges → nothing to drift from
    if (!ckgHasHierarchical) return 0.0;

    // If PKG has no hierarchical edges but CKG does → total drift
    if (!pkgHasHierarchical) return 1.0;

    let weightedDriftSum = 0;
    let importanceSum = 0;

    for (const [pkgNodeId, ckgNodeId] of alignment) {
      // Get PKG parents (in PKG node IDs)
      const pkgParents = pkgParentMap.get(pkgNodeId) ?? new Set<NodeId>();

      // Map PKG parents to CKG node IDs via alignment
      const pkgParentsMappedToCkg = new Set<NodeId>();
      for (const pkgParentId of pkgParents) {
        const ckgParentId = alignment.get(pkgParentId);
        if (ckgParentId) {
          pkgParentsMappedToCkg.add(ckgParentId);
        }
      }

      // Get CKG parents (in CKG node IDs)
      const ckgParents = ckgParentMap.get(ckgNodeId) ?? new Set<NodeId>();

      // Jaccard distance
      const unionSize = new Set([...pkgParentsMappedToCkg, ...ckgParents]).size;
      let intersectionSize = 0;
      for (const p of pkgParentsMappedToCkg) {
        if (ckgParents.has(p)) intersectionSize++;
      }

      const drift = unionSize === 0 ? 0 : 1 - intersectionSize / unionSize;

      // Importance: higher for shallower CKG nodes (root-level drift is worse)
      const ckgDepth = ckgDepthMap.get(ckgNodeId) ?? 0;
      const importance = 1 / (1 + ckgDepth);

      weightedDriftSum += drift * importance;
      importanceSum += importance;
    }

    return importanceSum > 0 ? weightedDriftSum / importanceSum : 0.0;
  }
}
