/**
 * Scope Leakage Index (SLI) — Metric Computer
 *
 * Measures how much the student's domain boundaries bleed into other
 * domains via inappropriate cross-domain edges. Checks against CKG
 * to distinguish legitimate cross-domain links from leakage.
 *
 * Range: [0, 1] — 0 = no leakage, 1 = severe domain contamination (badness)
 */

import type { GraphEdgeType, NodeId } from '@noema/types';
import { GraphEdgeType as EdgeType } from '@noema/types';

import type { IMetricComputationContext, IMetricComputer } from '../types.js';

// Edge type leakage severities — how concerning is a cross-domain edge of this type?
const LEAKAGE_WEIGHTS: Record<string, number> = {
  [EdgeType.PREREQUISITE]: 1.0,
  [EdgeType.IS_A]: 1.0,
  [EdgeType.PART_OF]: 0.8,
  [EdgeType.CAUSES]: 0.7,
  [EdgeType.DERIVED_FROM]: 0.5,
  [EdgeType.EXEMPLIFIES]: 0.4,
  [EdgeType.CONTRADICTS]: 0.3,
  [EdgeType.RELATED_TO]: 0.2,
};

function leakageWeight(edgeType: GraphEdgeType): number {
  return LEAKAGE_WEIGHTS[edgeType] ?? 0.5;
}

export class ScopeLeakageIndexComputer implements IMetricComputer {
  readonly abbreviation = 'SLI';
  readonly name = 'Scope Leakage Index';

  compute(ctx: IMetricComputationContext): number {
    const { pkgSubgraph, comparison, domain } = ctx;
    const edges = pkgSubgraph.edges;

    if (edges.length === 0) return 0.0;

    // Build node domain lookup from PKG subgraph
    const nodeDomain = new Map<NodeId, string>();
    for (const node of pkgSubgraph.nodes) {
      nodeDomain.set(node.nodeId, node.domain);
    }

    // Build CKG edge set for legitimacy checking
    const ckgEdgeSet = new Set<string>();
    for (const edge of ctx.ckgSubgraph.edges) {
      ckgEdgeSet.add(
        `${edge.sourceNodeId as string}|${edge.targetNodeId as string}|${edge.edgeType}`
      );
    }

    // Build inverse alignment for mapping PKG → CKG
    const alignment = comparison.nodeAlignment;

    let leakageSum = 0;

    for (const edge of edges) {
      const sourceDomain = nodeDomain.get(edge.sourceNodeId);
      const targetDomain = nodeDomain.get(edge.targetNodeId);

      // Only analyze edges originating from the domain being analyzed
      if (sourceDomain !== domain) continue;

      // Cross-domain check
      if (targetDomain === domain) continue; // same domain, not leakage

      // This is a cross-domain edge. Is it legitimate?
      const ckgSource = alignment.get(edge.sourceNodeId);
      const ckgTarget = alignment.get(edge.targetNodeId);

      let isLegitimate = false;
      if (ckgSource && ckgTarget) {
        // Check if CKG has a similar cross-domain edge
        const ckgKey = `${ckgSource as string}|${ckgTarget as string}|${edge.edgeType}`;
        isLegitimate = ckgEdgeSet.has(ckgKey);
      }

      if (!isLegitimate) {
        leakageSum += leakageWeight(edge.edgeType);
      }
    }

    // Normalize by total edge count + epsilon
    const epsilon = 1;
    return leakageSum / (edges.length + epsilon);
  }
}
