/**
 * @noema/knowledge-graph-service - Comparison Scope Builder
 *
 * Builds engagement-scoped PKG↔CKG comparisons by seeding from the learner's
 * aligned concepts and expanding the canonical graph by N undirected hops.
 */

import type { IGraphEdge, ISubgraph, NodeId } from '@noema/types';

import { buildGraphComparison } from './metrics/graph-comparison-builder.js';
import type {
  IComparisonRequest,
  IComparisonScopeMetadata,
  IGraphComparison,
} from './value-objects/comparison.js';

function uniqueNodeIds(nodeIds: Iterable<NodeId>): NodeId[] {
  return [...new Set(nodeIds)];
}

function createEmptySubgraph(): ISubgraph {
  return { nodes: [], edges: [] };
}

function expandCanonicalNeighborhood(
  ckgSubgraph: ISubgraph,
  seedNodeIds: readonly NodeId[],
  hopCount: number
): ISubgraph {
  if (seedNodeIds.length === 0 || ckgSubgraph.nodes.length === 0) {
    return createEmptySubgraph();
  }

  const adjacency = new Map<NodeId, Set<NodeId>>();
  for (const node of ckgSubgraph.nodes) {
    adjacency.set(node.nodeId, new Set());
  }

  for (const edge of ckgSubgraph.edges) {
    adjacency.get(edge.sourceNodeId)?.add(edge.targetNodeId);
    adjacency.get(edge.targetNodeId)?.add(edge.sourceNodeId);
  }

  const visited = new Set<NodeId>(seedNodeIds);
  const queue = seedNodeIds.map((nodeId) => ({ nodeId, depth: 0 }));

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || current.depth >= hopCount) {
      continue;
    }

    for (const neighborId of adjacency.get(current.nodeId) ?? []) {
      if (visited.has(neighborId)) {
        continue;
      }

      visited.add(neighborId);
      queue.push({ nodeId: neighborId, depth: current.depth + 1 });
    }
  }

  const scopedNodes = ckgSubgraph.nodes.filter((node) => visited.has(node.nodeId));
  const scopedNodeIds = new Set(scopedNodes.map((node) => node.nodeId));
  const scopedEdges = ckgSubgraph.edges.filter(
    (edge) => scopedNodeIds.has(edge.sourceNodeId) && scopedNodeIds.has(edge.targetNodeId)
  );

  return {
    nodes: scopedNodes,
    edges: scopedEdges,
  };
}

function attachScopeMetadata(
  comparison: IGraphComparison,
  scope: IComparisonScopeMetadata
): IGraphComparison {
  return {
    ...comparison,
    scope,
  };
}

export function buildScopedGraphComparison(
  pkgSubgraph: ISubgraph,
  ckgSubgraph: ISubgraph,
  request: IComparisonRequest
): IGraphComparison {
  const fullComparison = buildGraphComparison(pkgSubgraph, ckgSubgraph);
  const baseScope: IComparisonScopeMetadata = {
    mode: request.scopeMode,
    hopCount: request.hopCount,
    requestedDomain: request.domain ?? null,
    bootstrapApplied: false,
    seedNodeCount: fullComparison.nodeAlignment.size,
    scopedCkgNodeCount: ckgSubgraph.nodes.length,
    totalCkgNodeCount: ckgSubgraph.nodes.length,
  };

  if (request.scopeMode === 'domain') {
    return attachScopeMetadata(fullComparison, baseScope);
  }

  const seedNodeIds = uniqueNodeIds(fullComparison.nodeAlignment.values());
  if (seedNodeIds.length === 0) {
    if (request.bootstrapWhenUnseeded) {
      return attachScopeMetadata(fullComparison, {
        ...baseScope,
        bootstrapApplied: true,
      });
    }

    return attachScopeMetadata(buildGraphComparison(pkgSubgraph, createEmptySubgraph()), {
      ...baseScope,
      scopedCkgNodeCount: 0,
    });
  }

  const scopedCkgSubgraph = expandCanonicalNeighborhood(ckgSubgraph, seedNodeIds, request.hopCount);
  const scopedComparison = buildGraphComparison(pkgSubgraph, scopedCkgSubgraph);

  return attachScopeMetadata(scopedComparison, {
    ...baseScope,
    seedNodeCount: seedNodeIds.length,
    scopedCkgNodeCount: scopedCkgSubgraph.nodes.length,
  });
}

export function computeCoverageAlignmentScore(comparison: IGraphComparison): number {
  const scopedCkgNodeCount = comparison.scope?.scopedCkgNodeCount ?? comparison.ckgSubgraph.nodes.length;

  if (scopedCkgNodeCount === 0) {
    return comparison.scope?.seedNodeCount === 0 ? 0 : 1;
  }

  return comparison.nodeAlignment.size / scopedCkgNodeCount;
}

export function induceEdgeSubgraph(
  edges: readonly IGraphEdge[],
  allowedNodeIds: ReadonlySet<NodeId>
): IGraphEdge[] {
  return edges.filter(
    (edge) => allowedNodeIds.has(edge.sourceNodeId) && allowedNodeIds.has(edge.targetNodeId)
  );
}
