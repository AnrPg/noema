/**
 * @noema/knowledge-graph-service — Statistical Misconception Detector
 *
 * Detects misconceptions by analysing statistical anomalies in the graph:
 * abnormal edge weight distributions, outlier node degrees, and
 * statistically unusual structural patterns.
 */

import type { NodeId } from '@noema/types';
import { ConfidenceScore as ConfidenceScoreFactory, MisconceptionPatternKind } from '@noema/types';
import { z } from 'zod';

import type {
  IMisconceptionDetectionContext,
  IMisconceptionDetectionResult,
  IMisconceptionDetector,
} from '../types.js';

/** Validated config shape for statistical detector patterns */
const StatisticalDetectorConfigSchema = z.object({
  detectionType: z.string().optional(),
});

export class StatisticalMisconceptionDetector implements IMisconceptionDetector {
  readonly kind = MisconceptionPatternKind.STATISTICAL;

  detect(ctx: IMisconceptionDetectionContext): IMisconceptionDetectionResult[] {
    const statisticalPatterns = ctx.patterns.filter((p) => p.kind === this.kind);
    if (statisticalPatterns.length === 0) return [];

    const results: IMisconceptionDetectionResult[] = [];

    for (const pattern of statisticalPatterns) {
      const parsed = StatisticalDetectorConfigSchema.safeParse(pattern.config);
      const detectionType = parsed.success ? parsed.data.detectionType : undefined;

      switch (detectionType ?? pattern.name) {
        case 'weight_anomaly':
          results.push(...this.detectWeightAnomalies(ctx, pattern.patternId, pattern.threshold));
          break;
        case 'degree_outlier':
          results.push(...this.detectDegreeOutliers(ctx, pattern.patternId, pattern.threshold));
          break;
        case 'clustering_gap':
          results.push(...this.detectClusteringGaps(ctx, pattern.patternId, pattern.threshold));
          break;
        default:
          break;
      }
    }

    return results;
  }

  // ── Detection: Weight Anomalies ─────────────────────────────────────
  private detectWeightAnomalies(
    ctx: IMisconceptionDetectionContext,
    patternId: string,
    threshold: number
  ): IMisconceptionDetectionResult[] {
    const { pkgSubgraph } = ctx;
    if (pkgSubgraph.edges.length < 5) return [];

    // Compute mean and std dev of edge weights
    const weights = pkgSubgraph.edges.map((e) => Number(e.weight));
    const mean = weights.reduce((s, w) => s + w, 0) / weights.length;
    const variance = weights.reduce((s, w) => s + (w - mean) ** 2, 0) / weights.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev < 0.01) return []; // No variation

    const zThreshold = threshold > 0 ? threshold : 2.0;
    const anomalousEdges: { source: NodeId; target: NodeId; weight: number }[] = [];

    for (const edge of pkgSubgraph.edges) {
      const z = Math.abs(Number(edge.weight) - mean) / stdDev;
      if (z > zThreshold) {
        anomalousEdges.push({
          source: edge.sourceNodeId,
          target: edge.targetNodeId,
          weight: Number(edge.weight),
        });
      }
    }

    if (anomalousEdges.length === 0) return [];

    const affectedNodes = new Set<NodeId>();
    for (const edge of anomalousEdges) {
      affectedNodes.add(edge.source);
      affectedNodes.add(edge.target);
    }

    return [
      {
        patternId,
        confidence: ConfidenceScoreFactory.clamp(0.5 + anomalousEdges.length * 0.1),
        affectedNodeIds: [...affectedNodes],
        description: `${String(anomalousEdges.length)} edge(s) have statistically anomalous weights (z-score > ${String(zThreshold)}).`,
      },
    ];
  }

  // ── Detection: Degree Outliers ──────────────────────────────────────
  private detectDegreeOutliers(
    ctx: IMisconceptionDetectionContext,
    patternId: string,
    threshold: number
  ): IMisconceptionDetectionResult[] {
    const { pkgSubgraph } = ctx;
    if (pkgSubgraph.nodes.length < 5) return [];

    // Compute degree for each node
    const degrees = new Map<NodeId, number>();
    for (const node of pkgSubgraph.nodes) {
      degrees.set(node.nodeId, 0);
    }
    for (const edge of pkgSubgraph.edges) {
      degrees.set(edge.sourceNodeId, (degrees.get(edge.sourceNodeId) ?? 0) + 1);
      degrees.set(edge.targetNodeId, (degrees.get(edge.targetNodeId) ?? 0) + 1);
    }

    const degreeValues = [...degrees.values()];
    const mean = degreeValues.reduce((s, d) => s + d, 0) / degreeValues.length;
    const variance = degreeValues.reduce((s, d) => s + (d - mean) ** 2, 0) / degreeValues.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev < 0.5) return [];

    const zThreshold = threshold > 0 ? threshold : 2.5;
    const outliers: NodeId[] = [];

    for (const [nodeId, degree] of degrees) {
      const z = Math.abs(degree - mean) / stdDev;
      if (z > zThreshold) {
        outliers.push(nodeId);
      }
    }

    if (outliers.length === 0) return [];

    return [
      {
        patternId,
        confidence: ConfidenceScoreFactory.clamp(0.4 + outliers.length * 0.15),
        affectedNodeIds: outliers,
        description: `${String(outliers.length)} node(s) have statistically unusual degree centrality.`,
      },
    ];
  }

  // ── Detection: Clustering Gaps ──────────────────────────────────────
  private detectClusteringGaps(
    ctx: IMisconceptionDetectionContext,
    patternId: string,
    _threshold: number
  ): IMisconceptionDetectionResult[] {
    const { pkgSubgraph } = ctx;
    if (pkgSubgraph.nodes.length < 10) return [];

    // Build adjacency for clustering coefficient computation
    const adj = new Map<NodeId, Set<NodeId>>();
    for (const node of pkgSubgraph.nodes) {
      adj.set(node.nodeId, new Set());
    }
    for (const edge of pkgSubgraph.edges) {
      adj.get(edge.sourceNodeId)?.add(edge.targetNodeId);
      adj.get(edge.targetNodeId)?.add(edge.sourceNodeId);
    }

    // Compute local clustering coefficient per node
    const lowClusteringNodes: NodeId[] = [];

    for (const [nodeId, neighbours] of adj) {
      if (neighbours.size < 2) continue;

      // Count connections between neighbours
      let triangles = 0;
      const neighbourArray = [...neighbours];
      for (let i = 0; i < neighbourArray.length; i++) {
        for (let j = i + 1; j < neighbourArray.length; j++) {
          const ni = neighbourArray[i];
          const nj = neighbourArray[j];
          if (ni !== undefined && nj !== undefined && adj.get(ni)?.has(nj) === true) {
            triangles++;
          }
        }
      }

      const possibleTriangles = (neighbours.size * (neighbours.size - 1)) / 2;
      const clusteringCoeff = possibleTriangles > 0 ? triangles / possibleTriangles : 0;

      // Nodes with many neighbours but low clustering → knowledge gap
      if (neighbours.size >= 3 && clusteringCoeff < 0.1) {
        lowClusteringNodes.push(nodeId);
      }
    }

    if (lowClusteringNodes.length === 0) return [];

    return [
      {
        patternId,
        confidence: ConfidenceScoreFactory.clamp(0.3 + lowClusteringNodes.length * 0.05),
        affectedNodeIds: lowClusteringNodes,
        description: `${String(lowClusteringNodes.length)} node(s) have many connections but low clustering — possible knowledge gaps.`,
      },
    ];
  }
}
