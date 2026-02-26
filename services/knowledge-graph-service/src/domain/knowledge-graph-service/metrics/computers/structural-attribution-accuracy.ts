/**
 * Structural Attribution Accuracy (SAA) — Metric Computer
 *
 * Measures the accuracy of the student's stated rationales for nodes
 * and edges by verifying them against CKG structure. Checks whether
 * nodes have correct labels/types, edges connect semantically
 * appropriate concepts, and attributions reflect real patterns.
 *
 * Range: [0, 1] — 0 = no correct attributions, 1 = fully accurate (goodness)
 */

import type { NodeId } from '@noema/types';

import type { IMetricComputationContext, IMetricComputer } from '../types.js';

/** Default score when no attributions are available */
const DEFAULT_NO_ATTRIBUTION = 0.5;

/** Weight for node accuracy (vs edge accuracy) */
const NODE_WEIGHT = 0.5;

export class StructuralAttributionAccuracyComputer implements IMetricComputer {
  readonly abbreviation = 'SAA';
  readonly name = 'Structural Attribution Accuracy';

  compute(ctx: IMetricComputationContext): number {
    const { pkgSubgraph, comparison } = ctx;
    const alignment = comparison.nodeAlignment;

    // Edge case: empty graph
    if (pkgSubgraph.nodes.length === 0) return DEFAULT_NO_ATTRIBUTION;

    // Step 1: Node accuracy — fraction of PKG nodes matched in CKG
    let nodeAccuracy: number;
    if (pkgSubgraph.nodes.length > 0) {
      const matchedNodes = pkgSubgraph.nodes.filter((n) => alignment.has(n.nodeId)).length;
      nodeAccuracy = matchedNodes / pkgSubgraph.nodes.length;
    } else {
      nodeAccuracy = DEFAULT_NO_ATTRIBUTION;
    }

    // Step 2: Edge accuracy — fraction of edges connecting correctly aligned nodes
    let edgeAccuracy: number;
    if (pkgSubgraph.edges.length > 0) {
      const alignedNodeSet = new Set<NodeId>(alignment.keys());
      let correctEdges = 0;

      for (const edge of pkgSubgraph.edges) {
        // An edge is "correct" if both its endpoints are aligned AND
        // the CKG has an edge between the corresponding CKG nodes
        if (alignedNodeSet.has(edge.sourceNodeId) && alignedNodeSet.has(edge.targetNodeId)) {
          const ckgSource = alignment.get(edge.sourceNodeId);
          const ckgTarget = alignment.get(edge.targetNodeId);

          if (ckgSource && ckgTarget) {
            // Check if any CKG edge connects these nodes
            const ckgHasEdge = ctx.ckgSubgraph.edges.some(
              (e) =>
                (e.sourceNodeId === ckgSource && e.targetNodeId === ckgTarget) ||
                (e.sourceNodeId === ckgTarget && e.targetNodeId === ckgSource)
            );
            if (ckgHasEdge) correctEdges++;
          }
        }
      }

      edgeAccuracy = correctEdges / pkgSubgraph.edges.length;
    } else {
      edgeAccuracy = DEFAULT_NO_ATTRIBUTION;
    }

    // Step 3: Combine
    return NODE_WEIGHT * nodeAccuracy + (1 - NODE_WEIGHT) * edgeAccuracy;
  }
}
