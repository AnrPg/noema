/**
 * Traversal Breadth Score (TBS) — Metric Computer
 *
 * Measures the diversity of relationship types in the student's PKG.
 * Combines global edge type entropy (Shannon) with per-node edge type
 * variety. Higher TBS = richer multi-dimensional knowledge structure.
 *
 * Range: [0, 1] — 0 = one-dimensional, 1 = maximally diverse (goodness)
 */

import type { GraphEdgeType } from '@noema/types';
import { GraphEdgeType as EdgeType } from '@noema/types';

import type { IMetricComputationContext, IMetricComputer } from '../types.js';

/** All possible edge types from the GraphEdgeType enum */
const ALL_EDGE_TYPES: readonly GraphEdgeType[] = Object.values(EdgeType) as GraphEdgeType[];

export class TraversalBreadthScoreComputer implements IMetricComputer {
  readonly abbreviation = 'TBS';
  readonly name = 'Traversal Breadth Score';

  compute(ctx: IMetricComputationContext): number {
    const { pkgSubgraph, pkgEdgesByType, pkgNodeEdgeTypes } = ctx;
    const totalEdges = pkgSubgraph.edges.length;
    const totalNodes = pkgSubgraph.nodes.length;

    // Edge cases
    if (totalEdges <= 1 || totalNodes <= 1) return 0.0;

    // Step 1: Global edge type entropy (Shannon, normalized)
    const maxEntropy = Math.log2(ALL_EDGE_TYPES.length);
    let globalEntropy = 0;

    for (const edgeType of ALL_EDGE_TYPES) {
      const count = pkgEdgesByType.get(edgeType)?.length ?? 0;
      if (count === 0) continue;
      const p = count / totalEdges;
      globalEntropy -= p * Math.log2(p);
    }

    const normalizedEntropy = maxEntropy > 0 ? globalEntropy / maxEntropy : 0;

    // Step 2: Per-node edge type variety
    let varietySum = 0;
    for (const node of pkgSubgraph.nodes) {
      const nodeTypes = pkgNodeEdgeTypes.get(node.nodeId);
      const variety = nodeTypes ? nodeTypes.size / ALL_EDGE_TYPES.length : 0;
      varietySum += variety;
    }

    const meanVariety = totalNodes > 0 ? varietySum / totalNodes : 0;

    // Step 3: Combine with equal weighting
    return 0.5 * normalizedEntropy + 0.5 * meanVariety;
  }
}
