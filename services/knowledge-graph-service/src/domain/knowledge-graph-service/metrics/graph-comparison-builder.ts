/**
 * @noema/knowledge-graph-service - Graph Comparison Builder
 *
 * Computes an IGraphComparison from PKG and CKG subgraphs.
 * This alignment object is computed once per (userId, domain) pair
 * and shared across all CKG-dependent metrics and misconception detection.
 *
 * Alignment algorithm:
 * 1. Match PKG nodes to CKG nodes by normalized label + domain + nodeType
 * 2. Compute edge alignment for matched node pairs
 * 3. Identify structural divergences
 */

import type { GraphEdgeType, IGraphEdge, IGraphNode, ISubgraph, NodeId } from '@noema/types';
import { GraphEdgeType as EdgeType } from '@noema/types';

import {
  DivergenceSeverity,
  DivergenceType,
  type IGraphComparison,
  type IStructuralDivergence,
} from '../value-objects/comparison.js';

// ============================================================================
// Edge importance weights for alignment scoring
// ============================================================================

const EDGE_IMPORTANCE: Record<string, number> = {
  [EdgeType.PREREQUISITE]: 1.0,
  [EdgeType.IS_A]: 0.9,
  [EdgeType.PART_OF]: 0.85,
  [EdgeType.CAUSES]: 0.7,
  [EdgeType.DERIVED_FROM]: 0.65,
  [EdgeType.CONTRADICTS]: 0.6,
  [EdgeType.EXEMPLIFIES]: 0.5,
  [EdgeType.RELATED_TO]: 0.3,
};

function edgeImportance(edgeType: GraphEdgeType): number {
  return EDGE_IMPORTANCE[edgeType] ?? 0.5;
}

// ============================================================================
// Builder
// ============================================================================

/**
 * Build a complete IGraphComparison by aligning PKG and CKG subgraphs.
 */
export function buildGraphComparison(
  pkgSubgraph: ISubgraph,
  ckgSubgraph: ISubgraph
): IGraphComparison {
  // Step 1: Node alignment
  const { nodeAlignment, unmatchedPkgNodes, unmatchedCkgNodes } = alignNodes(
    pkgSubgraph.nodes,
    ckgSubgraph.nodes
  );

  // Step 2: Edge alignment score
  const edgeAlignmentScore = computeEdgeAlignmentScore(
    pkgSubgraph.edges,
    ckgSubgraph.edges,
    nodeAlignment
  );

  // Step 3: Structural divergences
  const structuralDivergences = detectDivergences(
    pkgSubgraph,
    ckgSubgraph,
    nodeAlignment,
    unmatchedPkgNodes,
    unmatchedCkgNodes
  );

  return {
    pkgSubgraph,
    ckgSubgraph,
    nodeAlignment,
    unmatchedPkgNodes,
    unmatchedCkgNodes,
    edgeAlignmentScore,
    structuralDivergences,
  };
}

// ============================================================================
// Node Alignment
// ============================================================================

/**
 * Normalize a node label for comparison.
 * Lowercase, trim, collapse whitespace.
 */
function normalizeLabel(label: string): string {
  return label.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Align PKG nodes to CKG nodes by normalized label matching.
 *
 * Strategy:
 * 1. Build a CKG lookup: normalized label → CKG node(s)
 * 2. For each PKG node, find matching CKG nodes
 * 3. Prefer same nodeType when multiple matches exist
 * 4. Each CKG node can only be matched once (greedy)
 */
function alignNodes(
  pkgNodes: readonly IGraphNode[],
  ckgNodes: readonly IGraphNode[]
): {
  nodeAlignment: Map<NodeId, NodeId>;
  unmatchedPkgNodes: NodeId[];
  unmatchedCkgNodes: NodeId[];
} {
  // Build CKG lookup by normalized label
  const ckgByLabel = new Map<string, IGraphNode[]>();
  for (const ckgNode of ckgNodes) {
    const key = normalizeLabel(ckgNode.label);
    if (!ckgByLabel.has(key)) {
      ckgByLabel.set(key, []);
    }
    ckgByLabel.get(key)?.push(ckgNode);
  }

  const nodeAlignment = new Map<NodeId, NodeId>();
  const matchedCkgIds = new Set<NodeId>();

  // Sort PKG nodes by label length (shorter = more likely to be unique matches)
  const sortedPkgNodes = [...pkgNodes].sort((a, b) => a.label.length - b.label.length);

  for (const pkgNode of sortedPkgNodes) {
    const key = normalizeLabel(pkgNode.label);
    const candidates = ckgByLabel.get(key);
    if (!candidates) continue;

    // Find best unmatched candidate
    let bestMatch: IGraphNode | null = null;
    let bestScore = -1;

    for (const candidate of candidates) {
      if (matchedCkgIds.has(candidate.nodeId)) continue;

      let score = 1; // base match score for label match
      // Prefer same nodeType
      if (candidate.nodeType === pkgNode.nodeType) score += 2;
      // Prefer same domain
      if (candidate.domain === pkgNode.domain) score += 1;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    }

    if (bestMatch) {
      nodeAlignment.set(pkgNode.nodeId, bestMatch.nodeId);
      matchedCkgIds.add(bestMatch.nodeId);
    }
  }

  const unmatchedPkgNodes = pkgNodes
    .filter((n) => !nodeAlignment.has(n.nodeId))
    .map((n) => n.nodeId);

  const unmatchedCkgNodes = ckgNodes
    .filter((n) => !matchedCkgIds.has(n.nodeId))
    .map((n) => n.nodeId);

  return { nodeAlignment, unmatchedPkgNodes, unmatchedCkgNodes };
}

// ============================================================================
// Edge Alignment Score
// ============================================================================

/**
 * Compute the fraction of CKG edges that have a PKG counterpart,
 * weighted by edge importance.
 *
 * For each CKG edge between aligned nodes, check if a corresponding
 * PKG edge exists (same mapped source/target and same type).
 */
function computeEdgeAlignmentScore(
  pkgEdges: readonly IGraphEdge[],
  ckgEdges: readonly IGraphEdge[],
  nodeAlignment: ReadonlyMap<NodeId, NodeId>
): number {
  if (ckgEdges.length === 0) return 1.0;

  // Build inverse alignment: CKG → PKG
  const inverseAlignment = new Map<NodeId, NodeId>();
  for (const [pkgId, ckgId] of nodeAlignment) {
    inverseAlignment.set(ckgId, pkgId);
  }

  // Build PKG edge lookup: "sourceId|targetId|type" → true
  const pkgEdgeSet = new Set<string>();
  for (const edge of pkgEdges) {
    pkgEdgeSet.add(
      `${edge.sourceNodeId as string}|${edge.targetNodeId as string}|${edge.edgeType}`
    );
  }

  let matchedWeight = 0;
  let totalWeight = 0;

  for (const ckgEdge of ckgEdges) {
    const pkgSource = inverseAlignment.get(ckgEdge.sourceNodeId);
    const pkgTarget = inverseAlignment.get(ckgEdge.targetNodeId);

    // Only consider CKG edges where both endpoints are aligned
    if (!pkgSource || !pkgTarget) continue;

    const weight = edgeImportance(ckgEdge.edgeType);
    totalWeight += weight;

    const key = `${pkgSource as string}|${pkgTarget as string}|${ckgEdge.edgeType}`;
    if (pkgEdgeSet.has(key)) {
      matchedWeight += weight;
    }
  }

  return totalWeight > 0 ? matchedWeight / totalWeight : 1.0;
}

// ============================================================================
// Divergence Detection
// ============================================================================

/**
 * Detect structural divergences between PKG and CKG.
 * Returns divergences sorted by severity (critical first).
 */
function detectDivergences(
  pkgSubgraph: ISubgraph,
  ckgSubgraph: ISubgraph,
  nodeAlignment: ReadonlyMap<NodeId, NodeId>,
  unmatchedPkgNodes: readonly NodeId[],
  unmatchedCkgNodes: readonly NodeId[]
): IStructuralDivergence[] {
  const divergences: IStructuralDivergence[] = [];

  // Build inverse alignment
  const inverseAlignment = new Map<NodeId, NodeId>();
  for (const [pkgId, ckgId] of nodeAlignment) {
    inverseAlignment.set(ckgId, pkgId);
  }

  // Build edge lookups (multi-map: source|target → all edges between pair)
  const pkgEdgeMultiMap = buildEdgeMultiMap(pkgSubgraph.edges);
  const ckgEdgeMultiMap = buildEdgeMultiMap(ckgSubgraph.edges);

  // Missing nodes (CKG has, PKG doesn't) — severity depends on connectivity
  for (const ckgNodeId of unmatchedCkgNodes) {
    const ckgNode = ckgSubgraph.nodes.find((n) => n.nodeId === ckgNodeId);
    const connectivity = countNodeEdges(ckgSubgraph.edges, ckgNodeId);
    const severity =
      connectivity >= 4
        ? DivergenceSeverity.HIGH
        : connectivity >= 2
          ? DivergenceSeverity.MEDIUM
          : DivergenceSeverity.LOW;
    divergences.push({
      divergenceType: DivergenceType.MISSING_NODE,
      affectedPkgNodeIds: [],
      affectedCkgNodeIds: [ckgNodeId],
      severity,
      description: `Missing canonical concept: "${ckgNode?.label ?? ckgNodeId}"`,
    });
  }

  // Extra nodes (PKG has, CKG doesn't) — severity depends on connectivity
  for (const pkgNodeId of unmatchedPkgNodes) {
    const pkgNode = pkgSubgraph.nodes.find((n) => n.nodeId === pkgNodeId);
    const connectivity = countNodeEdges(pkgSubgraph.edges, pkgNodeId);
    const severity = connectivity >= 4 ? DivergenceSeverity.MEDIUM : DivergenceSeverity.LOW;
    divergences.push({
      divergenceType: DivergenceType.EXTRA_NODE,
      affectedPkgNodeIds: [pkgNodeId],
      affectedCkgNodeIds: [],
      severity,
      description: `Novel concept not in canonical graph: "${pkgNode?.label ?? pkgNodeId}"`,
    });
  }

  // Edge divergences — O(E) iteration over edges instead of O(n²) over all aligned pairs.
  // For each CKG edge between aligned nodes, check if PKG has a matching edge type.
  // For each PKG edge between aligned nodes, check if CKG has a matching edge type.

  // Build sets for quick lookups: "alignedSource|alignedTarget|edgeType" → exists
  const pkgEdgeTypeSet = new Set<string>();
  const ckgEdgeTypeSet = new Set<string>();

  for (const edge of ckgSubgraph.edges) {
    const pkgSource = inverseAlignment.get(edge.sourceNodeId);
    const pkgTarget = inverseAlignment.get(edge.targetNodeId);
    if (pkgSource === undefined || pkgTarget === undefined) continue;

    ckgEdgeTypeSet.add(`${pkgSource as string}|${pkgTarget as string}|${edge.edgeType}`);

    // Check if PKG has a matching edge for this CKG edge
    const pairKeyPkg = `${pkgSource as string}|${pkgTarget as string}`;
    const pkgEdgesForPair = pkgEdgeMultiMap.get(pairKeyPkg) ?? [];
    const pkgHasType = pkgEdgesForPair.some((e) => e.edgeType === edge.edgeType);

    if (!pkgHasType) {
      const isHierarchical =
        edge.edgeType === EdgeType.PREREQUISITE ||
        edge.edgeType === EdgeType.IS_A ||
        edge.edgeType === EdgeType.PART_OF;
      divergences.push({
        divergenceType: DivergenceType.MISSING_EDGE,
        affectedPkgNodeIds: [pkgSource, pkgTarget],
        affectedCkgNodeIds: [edge.sourceNodeId, edge.targetNodeId],
        severity: isHierarchical ? DivergenceSeverity.HIGH : DivergenceSeverity.MEDIUM,
        description: `Missing ${edge.edgeType} edge between aligned nodes`,
      });
    }
  }

  for (const edge of pkgSubgraph.edges) {
    const ckgSource = nodeAlignment.get(edge.sourceNodeId);
    const ckgTarget = nodeAlignment.get(edge.targetNodeId);
    if (ckgSource === undefined || ckgTarget === undefined) continue;

    // Check if CKG has a matching edge for this PKG edge (using PKG-keyed set)
    const key = `${edge.sourceNodeId as string}|${edge.targetNodeId as string}|${edge.edgeType}`;
    if (!ckgEdgeTypeSet.has(key)) {
      divergences.push({
        divergenceType: DivergenceType.EXTRA_EDGE,
        affectedPkgNodeIds: [edge.sourceNodeId, edge.targetNodeId],
        affectedCkgNodeIds: [ckgSource, ckgTarget],
        severity: DivergenceSeverity.LOW,
        description: `Extra ${edge.edgeType} edge not in canonical graph`,
      });
    }
  }

  // Sort by severity: critical > high > medium > low
  const severityOrder: Record<string, number> = {
    [DivergenceSeverity.CRITICAL]: 0,
    [DivergenceSeverity.HIGH]: 1,
    [DivergenceSeverity.MEDIUM]: 2,
    [DivergenceSeverity.LOW]: 3,
  };

  divergences.sort((a, b) => (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4));

  return divergences;
}

/**
 * Count the number of edges incident to a node (as source or target).
 * Used to estimate node importance for context-aware severity.
 */
function countNodeEdges(edges: readonly IGraphEdge[], nodeId: NodeId): number {
  let count = 0;
  for (const edge of edges) {
    if (edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId) {
      count++;
    }
  }
  return count;
}

/**
 * Build multi-edge lookup: "sourceId|targetId" → all edges between pair.
 * Used for divergence detection where we need to compare all edge types.
 */
function buildEdgeMultiMap(edges: readonly IGraphEdge[]): Map<string, IGraphEdge[]> {
  const map = new Map<string, IGraphEdge[]>();
  for (const edge of edges) {
    const key = `${edge.sourceNodeId as string}|${edge.targetNodeId as string}`;
    const list = map.get(key) ?? [];
    list.push(edge);
    map.set(key, list);
  }
  return map;
}
