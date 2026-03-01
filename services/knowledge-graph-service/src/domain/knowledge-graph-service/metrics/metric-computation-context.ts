/**
 * @noema/knowledge-graph-service - Metric Computation Context Factory
 *
 * Eagerly builds the IMetricComputationContext from raw inputs.
 * All shared data structures (depth maps, parent maps, sibling groups,
 * edge distributions, structural regions) are computed once here and
 * then consumed read-only by the 11 metric computers.
 */

import type { GraphEdgeType, IGraphEdge, ISubgraph, NodeId, UserId } from '@noema/types';
import { GraphEdgeType as EdgeType } from '@noema/types';

import type { IMetricSnapshot } from '../metrics.repository.js';
import type { IGraphComparison } from '../value-objects/comparison.js';

import type { IMetricComputationContext, ISiblingGroup, IStructuralRegion } from './types.js';

// ============================================================================
// Constants
// ============================================================================

/** Edge types that define hierarchical (parent-child) relationships */
const HIERARCHICAL_EDGE_TYPES: ReadonlySet<string> = new Set([EdgeType.IS_A, EdgeType.PART_OF]);

/** Edge type used for prerequisite chain depth computation */
const PREREQUISITE_EDGE_TYPE: string = EdgeType.PREREQUISITE;

// ============================================================================
// Factory
// ============================================================================

/**
 * Build a fully populated IMetricComputationContext.
 *
 * This function performs all expensive pre-computations up front:
 * - Depth maps (topological sort + DP on prerequisite edges)
 * - Parent maps (hierarchical is_a/part_of relationships)
 * - Sibling groups (CKG nodes sharing a common parent)
 * - Edge type distributions (per-graph and per-node)
 * - Structural regions (subtrees rooted at top-level concepts)
 */
export function buildMetricComputationContext(
  pkgSubgraph: ISubgraph,
  ckgSubgraph: ISubgraph,
  comparison: IGraphComparison,
  previousSnapshot: IMetricSnapshot | null,
  domain: string,
  userId: UserId,
  activeStrategy?: string
): IMetricComputationContext {
  // Build depth maps
  const pkgDepthMap = computeDepthMap(pkgSubgraph);
  const ckgDepthMap = computeDepthMap(ckgSubgraph);

  // Build parent maps
  const pkgParentMap = computeParentMap(pkgSubgraph);
  const ckgParentMap = computeParentMap(ckgSubgraph);

  // Build CKG sibling groups
  const ckgSiblingGroups = computeSiblingGroups(ckgSubgraph, ckgParentMap);

  // Build edge distributions
  const pkgEdgesByType = groupEdgesByType(pkgSubgraph.edges);
  const pkgNodeEdgeTypes = computeNodeEdgeTypes(pkgSubgraph);

  // Build structural regions
  const structuralRegions = computeStructuralRegions(pkgSubgraph, pkgDepthMap);

  return {
    pkgSubgraph,
    ckgSubgraph,
    comparison,
    previousSnapshot,
    pkgDepthMap,
    ckgDepthMap,
    pkgParentMap,
    ckgParentMap,
    ckgSiblingGroups,
    pkgEdgesByType,
    pkgNodeEdgeTypes,
    structuralRegions,
    domain,
    userId,
    ...(activeStrategy !== undefined ? { activeStrategy } : {}),
  };
}

// ============================================================================
// Depth Map — Topological Sort + DAG Longest Path
// ============================================================================

/**
 * Compute the longest prerequisite chain depth for every node in the subgraph.
 *
 * Uses topological sort + dynamic programming on prerequisite edges.
 * If cycles are detected (shouldn't happen with acyclicity checks, but
 * defensive), the cycle is broken at the node with most connections.
 * Nodes not reachable via prerequisite edges get depth 0 (roots).
 */
function computeDepthMap(subgraph: ISubgraph): Map<NodeId, number> {
  const depthMap = new Map<NodeId, number>();
  const nodeIds = new Set(subgraph.nodes.map((n) => n.nodeId));

  // Build adjacency: source → targets for prerequisite edges
  const prereqTargets = new Map<NodeId, NodeId[]>();
  const inDegree = new Map<NodeId, number>();

  for (const id of nodeIds) {
    prereqTargets.set(id, []);
    inDegree.set(id, 0);
  }

  for (const edge of subgraph.edges) {
    if (
      edge.edgeType === PREREQUISITE_EDGE_TYPE &&
      nodeIds.has(edge.sourceNodeId) &&
      nodeIds.has(edge.targetNodeId)
    ) {
      // prerequisite: source is prerequisite for target
      // so source → target means "source before target"
      // depth(target) = max(depth(source) + 1)
      prereqTargets.get(edge.sourceNodeId)?.push(edge.targetNodeId);
      inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) ?? 0) + 1);
    }
  }

  // Kahn's algorithm for topological sort + DP longest path
  const queue: NodeId[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) {
      queue.push(id);
      depthMap.set(id, 0);
    }
  }

  let processed = 0;
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    processed++;
    const currentDepth = depthMap.get(current) ?? 0;

    for (const target of prereqTargets.get(current) ?? []) {
      const newDepth = currentDepth + 1;
      const existingDepth = depthMap.get(target) ?? 0;
      depthMap.set(target, Math.max(existingDepth, newDepth));

      const remaining = (inDegree.get(target) ?? 1) - 1;
      inDegree.set(target, remaining);
      if (remaining === 0) {
        queue.push(target);
      }
    }
  }

  // Handle cycle survivors — assign depth 0 (defensive)
  if (processed < nodeIds.size) {
    for (const id of nodeIds) {
      if (!depthMap.has(id)) {
        depthMap.set(id, 0);
      }
    }
  }

  return depthMap;
}

// ============================================================================
// Parent Map — Hierarchical is_a / part_of
// ============================================================================

/**
 * Build a map from child node ID → set of parent node IDs,
 * where "parent" means the target of an is_a or part_of edge
 * FROM the child (child → parent).
 */
function computeParentMap(subgraph: ISubgraph): Map<NodeId, Set<NodeId>> {
  const parentMap = new Map<NodeId, Set<NodeId>>();
  const nodeIds = new Set(subgraph.nodes.map((n) => n.nodeId));

  for (const node of subgraph.nodes) {
    parentMap.set(node.nodeId, new Set());
  }

  // Track which edge type(s) connect each (source, target) pair
  const edgePairTypes = new Map<string, Set<string>>();

  for (const edge of subgraph.edges) {
    if (
      HIERARCHICAL_EDGE_TYPES.has(edge.edgeType) &&
      nodeIds.has(edge.sourceNodeId) &&
      nodeIds.has(edge.targetNodeId)
    ) {
      // source (child) → target (parent) via is_a / part_of
      parentMap.get(edge.sourceNodeId)?.add(edge.targetNodeId);

      // Track for dual-edge detection
      const pairKey = `${edge.sourceNodeId}\u2192${edge.targetNodeId}`;
      if (!edgePairTypes.has(pairKey)) {
        edgePairTypes.set(pairKey, new Set());
      }
      const pairSet = edgePairTypes.get(pairKey);
      if (pairSet !== undefined) {
        pairSet.add(edge.edgeType);
      }
    }
  }

  // Diagnostic: report dual hierarchical edges (non-blocking).
  // This is a known scenario in PKGs — the ontological advisory was shown
  // but the learner chose to keep both edge types. Log but do not crash.
  for (const [pairKey, types] of edgePairTypes) {
    if (types.size > 1) {
      console.warn(
        `[metric-computation] Dual hierarchical edges detected: ${pairKey} has types [${[...types].join(', ')}]`
      );
    }
  }

  return parentMap;
}

// ============================================================================
// Sibling Groups — CKG nodes sharing a common parent
// ============================================================================

/**
 * Identify sibling groups in the CKG.
 * A sibling group is a set of nodes that share a common parent via
 * is_a or part_of. Only groups with ≥2 siblings are included.
 */
function computeSiblingGroups(
  ckgSubgraph: ISubgraph,
  ckgParentMap: ReadonlyMap<NodeId, ReadonlySet<NodeId>>
): ISiblingGroup[] {
  // Invert the parent map: parent → children
  const childrenMap = new Map<NodeId, NodeId[]>();
  const nodeIds = new Set(ckgSubgraph.nodes.map((n) => n.nodeId));

  for (const [childId, parents] of ckgParentMap) {
    for (const parentId of parents) {
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)?.push(childId);
    }
  }

  const groups: ISiblingGroup[] = [];
  for (const [parentId, children] of childrenMap) {
    // Only include groups where the parent is in the subgraph
    // and there are at least 2 siblings
    if (nodeIds.has(parentId) && children.length >= 2) {
      groups.push({
        parentNodeId: parentId,
        siblingNodeIds: children,
      });
    }
  }

  return groups;
}

// ============================================================================
// Edge Distribution
// ============================================================================

/**
 * Group edges by their edgeType.
 */
function groupEdgesByType(edges: readonly IGraphEdge[]): Map<GraphEdgeType, IGraphEdge[]> {
  const grouped = new Map<GraphEdgeType, IGraphEdge[]>();
  for (const edge of edges) {
    if (!grouped.has(edge.edgeType)) {
      grouped.set(edge.edgeType, []);
    }
    grouped.get(edge.edgeType)?.push(edge);
  }
  return grouped;
}

/**
 * For each node, compute the set of distinct edge types it participates in
 * (both as source and target).
 */
function computeNodeEdgeTypes(subgraph: ISubgraph): Map<NodeId, Set<GraphEdgeType>> {
  const nodeEdgeTypes = new Map<NodeId, Set<GraphEdgeType>>();

  for (const node of subgraph.nodes) {
    nodeEdgeTypes.set(node.nodeId, new Set());
  }

  for (const edge of subgraph.edges) {
    nodeEdgeTypes.get(edge.sourceNodeId)?.add(edge.edgeType);
    nodeEdgeTypes.get(edge.targetNodeId)?.add(edge.edgeType);
  }

  return nodeEdgeTypes;
}

// ============================================================================
// Structural Regions — Subtrees rooted at top-level concepts
// ============================================================================

/**
 * Identify structural regions in the PKG.
 *
 * A structural region is a subtree rooted at a "top-level concept" — a
 * node with no incoming is_a or part_of edges (a hierarchy root).
 * If no clear roots exist, falls back to connected components.
 */
function computeStructuralRegions(
  pkgSubgraph: ISubgraph,
  pkgDepthMap: ReadonlyMap<NodeId, number>
): IStructuralRegion[] {
  const nodeIds = new Set(pkgSubgraph.nodes.map((n) => n.nodeId));

  // Find nodes with incoming hierarchical edges
  const hasIncomingHierarchical = new Set<NodeId>();
  for (const edge of pkgSubgraph.edges) {
    if (
      HIERARCHICAL_EDGE_TYPES.has(edge.edgeType) &&
      nodeIds.has(edge.sourceNodeId) &&
      nodeIds.has(edge.targetNodeId)
    ) {
      // source (child) → target (parent): source has an outgoing hierarchical edge
      // The target is a parent, source is the child
      // We want roots = nodes that are NOT children = nodes NOT in sourceNodeId position
      hasIncomingHierarchical.add(edge.sourceNodeId);
    }
  }

  // Roots = nodes that are never a child (never source of is_a/part_of)
  const roots = pkgSubgraph.nodes
    .filter((n) => !hasIncomingHierarchical.has(n.nodeId))
    .map((n) => n.nodeId);

  if (roots.length === 0) {
    // Fallback: treat entire graph as one region
    if (pkgSubgraph.nodes.length === 0) return [];
    const maxDepth = Math.max(0, ...pkgSubgraph.nodes.map((n) => pkgDepthMap.get(n.nodeId) ?? 0));
    return [
      {
        rootNodeId: pkgSubgraph.nodes[0]?.nodeId ?? ('' as NodeId),
        nodeIds: pkgSubgraph.nodes.map((n) => n.nodeId),
        maxDepth,
        size: pkgSubgraph.nodes.length,
      },
    ];
  }

  // Build downward adjacency (parent → children) for hierarchical edges
  const childrenOf = new Map<NodeId, NodeId[]>();
  for (const id of nodeIds) {
    childrenOf.set(id, []);
  }
  for (const edge of pkgSubgraph.edges) {
    if (
      HIERARCHICAL_EDGE_TYPES.has(edge.edgeType) &&
      nodeIds.has(edge.sourceNodeId) &&
      nodeIds.has(edge.targetNodeId)
    ) {
      // source (child) → target (parent)
      childrenOf.get(edge.targetNodeId)?.push(edge.sourceNodeId);
    }
  }

  // BFS from each root to collect region members
  const assigned = new Set<NodeId>();
  const regions: IStructuralRegion[] = [];

  for (const rootId of roots) {
    if (assigned.has(rootId)) continue;

    const regionNodes: NodeId[] = [];
    const queue: NodeId[] = [rootId];
    let maxDepth = 0;

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      if (assigned.has(current)) continue;
      assigned.add(current);
      regionNodes.push(current);
      maxDepth = Math.max(maxDepth, pkgDepthMap.get(current) ?? 0);

      for (const child of childrenOf.get(current) ?? []) {
        if (!assigned.has(child)) {
          queue.push(child);
        }
      }
    }

    if (regionNodes.length > 0) {
      regions.push({
        rootNodeId: rootId,
        nodeIds: regionNodes,
        maxDepth,
        size: regionNodes.length,
      });
    }
  }

  // Assign orphans (nodes not reached by any root) to individual regions
  for (const node of pkgSubgraph.nodes) {
    if (!assigned.has(node.nodeId)) {
      regions.push({
        rootNodeId: node.nodeId,
        nodeIds: [node.nodeId],
        maxDepth: pkgDepthMap.get(node.nodeId) ?? 0,
        size: 1,
      });
    }
  }

  return regions;
}
