/**
 * Upward Link Strength (ULS) — Metric Computer
 *
 * Measures how well the student connects specific knowledge to its
 * abstractions via is_a/part_of edges. Combines coverage (do the
 * expected upward edges exist?) with strength (how confident are they?).
 *
 * Range: [0, 1] — 0 = completely orphaned, 1 = strong scaffolding (goodness)
 */

import type { NodeId } from '@noema/types';
import { GraphEdgeType as EdgeType } from '@noema/types';

import type { IMetricComputationContext, IMetricComputer } from '../types.js';

/** Coverage weight in the ULS formula (α = 0.6) */
const COVERAGE_WEIGHT = 0.6;

export class UpwardLinkStrengthComputer implements IMetricComputer {
  readonly abbreviation = 'ULS';
  readonly name = 'Upward Link Strength';

  compute(ctx: IMetricComputationContext): number {
    const { pkgSubgraph, ckgSubgraph, comparison } = ctx;
    const alignment = comparison.nodeAlignment;

    // Build inverse alignment: CKG → PKG
    const inverseAlignment = new Map<NodeId, NodeId>();
    for (const [pkgId, ckgId] of alignment) {
      inverseAlignment.set(ckgId, pkgId);
    }

    // Identify expected upward edges from CKG (is_a/part_of between aligned nodes)
    const expectedEdges: { ckgSourceId: NodeId; ckgTargetId: NodeId }[] = [];
    for (const edge of ckgSubgraph.edges) {
      if (
        (edge.edgeType === EdgeType.IS_A || edge.edgeType === EdgeType.PART_OF) &&
        inverseAlignment.has(edge.sourceNodeId) &&
        inverseAlignment.has(edge.targetNodeId)
      ) {
        expectedEdges.push({
          ckgSourceId: edge.sourceNodeId,
          ckgTargetId: edge.targetNodeId,
        });
      }
    }

    // Edge case: CKG has no hierarchical edges → nothing to fail
    if (expectedEdges.length === 0) return 1.0;

    // Build PKG upward edge lookup: "sourceId|targetId" → weight
    const pkgUpwardEdges = new Map<string, number>();
    for (const edge of pkgSubgraph.edges) {
      if (edge.edgeType === EdgeType.IS_A || edge.edgeType === EdgeType.PART_OF) {
        const key = `${edge.sourceNodeId as string}|${edge.targetNodeId as string}`;
        pkgUpwardEdges.set(key, Number(edge.weight));
      }
    }

    // Compute coverage: fraction of expected edges that exist in PKG
    let matchCount = 0;
    let matchedWeightSum = 0;

    for (const expected of expectedEdges) {
      const pkgSourceId = inverseAlignment.get(expected.ckgSourceId);
      const pkgTargetId = inverseAlignment.get(expected.ckgTargetId);
      if (pkgSourceId === undefined || pkgTargetId === undefined) continue;

      const key = `${pkgSourceId as string}|${pkgTargetId as string}`;
      const weight = pkgUpwardEdges.get(key);

      if (weight !== undefined) {
        matchCount++;
        matchedWeightSum += weight;
      }
    }

    const coverage = matchCount / expectedEdges.length;
    const strength = matchCount > 0 ? matchedWeightSum / matchCount : 0;

    return COVERAGE_WEIGHT * coverage + (1 - COVERAGE_WEIGHT) * strength;
  }
}
