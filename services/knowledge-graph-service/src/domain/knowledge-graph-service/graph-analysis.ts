/**
 * @noema/knowledge-graph-service — Graph Analysis Algorithms
 *
 * Pure domain utility module containing graph algorithms that operate
 * on in-memory ISubgraph structures. Zero infrastructure imports —
 * depends only on @noema/types and local value objects.
 *
 * Phase 8c: Tarjan's articulation-point detection + BFS component sizing.
 * Phase 8d: Additional algorithms (planned).
 *
 * Design decision D1: algorithms run in application code on the in-memory
 * adjacency list. For graphs up to ~10K nodes, Tarjan's O(V+E) is efficient.
 * A GDS-accelerated path exists at the repository layer for larger graphs.
 *
 * @see ADR-0043 for Phase 8c structural analysis design
 */

import type { GraphEdgeType, IGraphNode, ISubgraph, NodeId } from '@noema/types';

import type { IBridgeNode } from './value-objects/graph.value-objects.js';

// ============================================================================
// Types
// ============================================================================

/** Adjacency list entry: neighbor node ID + edge type connecting them. */
interface IAdjacencyEntry {
  readonly neighborId: NodeId;
  readonly edgeType: GraphEdgeType;
}

// ============================================================================
// Adjacency List Construction
// ============================================================================

/**
 * Build an undirected adjacency list from an ISubgraph.
 *
 * If `edgeTypes` is provided, only edges of those types are included.
 * Returns a Map from node ID to its neighbors (both directions).
 */
function buildAdjacencyList(
  subgraph: ISubgraph,
  edgeTypes?: readonly GraphEdgeType[]
): Map<NodeId, IAdjacencyEntry[]> {
  const adj = new Map<NodeId, IAdjacencyEntry[]>();

  // Initialize entries for all nodes (including isolated ones)
  for (const node of subgraph.nodes) {
    adj.set(node.nodeId, []);
  }

  for (const edge of subgraph.edges) {
    // Filter by edge type if specified
    if (edgeTypes !== undefined && !edgeTypes.includes(edge.edgeType)) {
      continue;
    }

    // Undirected: add both directions
    const sourceAdj = adj.get(edge.sourceNodeId);
    const targetAdj = adj.get(edge.targetNodeId);

    if (sourceAdj !== undefined) {
      sourceAdj.push({ neighborId: edge.targetNodeId, edgeType: edge.edgeType });
    }
    if (targetAdj !== undefined) {
      targetAdj.push({ neighborId: edge.sourceNodeId, edgeType: edge.edgeType });
    }
  }

  return adj;
}

// ============================================================================
// Tarjan's Articulation Point Algorithm
// ============================================================================

/**
 * Detect articulation points (bridge nodes) using Tarjan's algorithm.
 *
 * An articulation point is a vertex whose removal disconnects the graph
 * (or increases the number of connected components).
 *
 * This implementation uses an iterative DFS to avoid stack overflow on
 * large graphs (~10K+ nodes).
 *
 * @returns Set of node IDs that are articulation points.
 */
function tarjanArticulationPoints(adj: Map<NodeId, IAdjacencyEntry[]>): Set<NodeId> {
  const disc = new Map<NodeId, number>(); // Discovery time
  const low = new Map<NodeId, number>(); // Lowest reachable discovery time
  const parent = new Map<NodeId, NodeId>(); // DFS parent
  const articulationPoints = new Set<NodeId>();

  let timer = 0;

  // Iterative DFS to handle large graphs without stack overflow
  for (const startNode of adj.keys()) {
    if (disc.has(startNode)) continue; // Already visited in a previous component

    // Use explicit stack: [nodeId, neighborIndex]
    const stack: { nodeId: NodeId; neighborIdx: number }[] = [];

    disc.set(startNode, timer);
    low.set(startNode, timer);
    timer++;

    stack.push({ nodeId: startNode, neighborIdx: 0 });

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const neighbors = adj.get(frame.nodeId) ?? [];

      if (frame.neighborIdx < neighbors.length) {
        const neighbor = neighbors[frame.neighborIdx]!;
        frame.neighborIdx++;

        if (!disc.has(neighbor.neighborId)) {
          // Tree edge: descend
          parent.set(neighbor.neighborId, frame.nodeId);
          disc.set(neighbor.neighborId, timer);
          low.set(neighbor.neighborId, timer);
          timer++;

          stack.push({ nodeId: neighbor.neighborId, neighborIdx: 0 });
        } else if (neighbor.neighborId !== parent.get(frame.nodeId)) {
          // Back edge: update low value
          const currentLow = low.get(frame.nodeId) ?? Infinity;
          const neighborDisc = disc.get(neighbor.neighborId) ?? Infinity;
          low.set(frame.nodeId, Math.min(currentLow, neighborDisc));
        }
      } else {
        // All neighbors processed — pop and update parent
        stack.pop();

        if (stack.length > 0) {
          const parentFrame = stack[stack.length - 1]!;
          const parentLow = low.get(parentFrame.nodeId) ?? Infinity;
          const childLow = low.get(frame.nodeId) ?? Infinity;
          low.set(parentFrame.nodeId, Math.min(parentLow, childLow));

          // Check articulation point conditions
          const parentDisc = disc.get(parentFrame.nodeId) ?? Infinity;

          // Case 1: non-root with low[child] >= disc[parent]
          if (parent.has(parentFrame.nodeId) && childLow >= parentDisc) {
            articulationPoints.add(parentFrame.nodeId);
          }
        } else {
          // Root node: AP if it has more than one DFS subtree child
          let rootChildCount = 0;
          for (const n of adj.get(frame.nodeId) ?? []) {
            if (parent.get(n.neighborId) === frame.nodeId) {
              rootChildCount++;
            }
          }
          if (rootChildCount > 1) {
            articulationPoints.add(frame.nodeId);
          }
        }
      }
    }
  }

  return articulationPoints;
}

// ============================================================================
// Component Sizing via BFS
// ============================================================================

/**
 * Compute connected component sizes after virtually removing a node.
 *
 * Performs BFS on the adjacency list excluding `removedNodeId`.
 * Returns the sizes of all resulting connected components.
 */
function computeComponentSizesWithout(
  adj: Map<NodeId, IAdjacencyEntry[]>,
  removedNodeId: NodeId
): number[] {
  const visited = new Set<NodeId>();
  visited.add(removedNodeId); // "remove" the node by pre-visiting it
  const componentSizes: number[] = [];

  for (const nodeId of adj.keys()) {
    if (visited.has(nodeId)) continue;

    // BFS from this unvisited node
    const queue: NodeId[] = [nodeId];
    visited.add(nodeId);
    let size = 0;

    while (queue.length > 0) {
      const current = queue.shift()!;
      size++;

      for (const entry of adj.get(current) ?? []) {
        if (!visited.has(entry.neighborId)) {
          visited.add(entry.neighborId);
          queue.push(entry.neighborId);
        }
      }
    }

    componentSizes.push(size);
  }

  return componentSizes;
}

/**
 * Determine which edge types make a node an articulation point.
 *
 * For each edge type the node participates in, check if removing edges
 * of that type (from this node only) would disconnect the graph.
 */
function findBridgeEdgeTypes(
  nodeId: NodeId,
  adj: Map<NodeId, IAdjacencyEntry[]>,
  subgraph: ISubgraph
): GraphEdgeType[] {
  // Collect all edge types this node participates in
  const nodeEdgeTypes = new Set<GraphEdgeType>();
  for (const entry of adj.get(nodeId) ?? []) {
    nodeEdgeTypes.add(entry.edgeType);
  }

  // A node is a bridge "through" an edge type if that edge type is
  // necessary for connectivity. We check by building a filtered adjacency
  // list excluding each edge type and seeing if the node is still an AP.
  const bridgeTypes: GraphEdgeType[] = [];

  for (const edgeType of nodeEdgeTypes) {
    // Build adjacency without this edge type for edges involving this node
    const filteredAdj = new Map<NodeId, IAdjacencyEntry[]>();
    for (const n of subgraph.nodes) {
      filteredAdj.set(n.nodeId, []);
    }

    for (const edge of subgraph.edges) {
      // Skip edges of this type that involve our node
      if (
        edge.edgeType === edgeType &&
        (edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId)
      ) {
        continue;
      }

      const sourceAdj = filteredAdj.get(edge.sourceNodeId);
      const targetAdj = filteredAdj.get(edge.targetNodeId);

      if (sourceAdj !== undefined) {
        sourceAdj.push({ neighborId: edge.targetNodeId, edgeType: edge.edgeType });
      }
      if (targetAdj !== undefined) {
        targetAdj.push({ neighborId: edge.sourceNodeId, edgeType: edge.edgeType });
      }
    }

    // Count components without those edges vs. with
    const componentsBefore = countComponents(adj);
    const componentsAfter = countComponents(filteredAdj);

    if (componentsAfter > componentsBefore) {
      bridgeTypes.push(edgeType);
    }
  }

  // If no specific edge type alone causes disconnection, report all types
  // the node participates in (the node as a whole is the bridge).
  return bridgeTypes.length > 0 ? bridgeTypes : [...nodeEdgeTypes];
}

/**
 * Count the number of connected components in the adjacency list.
 */
function countComponents(adj: Map<NodeId, IAdjacencyEntry[]>): number {
  const visited = new Set<NodeId>();
  let count = 0;

  for (const nodeId of adj.keys()) {
    if (visited.has(nodeId)) continue;

    count++;
    const queue: NodeId[] = [nodeId];
    visited.add(nodeId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const entry of adj.get(current) ?? []) {
        if (!visited.has(entry.neighborId)) {
          visited.add(entry.neighborId);
          queue.push(entry.neighborId);
        }
      }
    }
  }

  return count;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Detect articulation points (bridge nodes) in an in-memory subgraph.
 *
 * Uses Tarjan's algorithm (O(V+E)) for articulation point detection,
 * then computes downstream component sizes via BFS for each bridge.
 *
 * @param subgraph - The domain subgraph to analyze.
 * @param edgeTypes - Optional edge type filter. If provided, only edges
 *   of these types are considered for connectivity.
 * @param minComponentSize - Minimum downstream component size for a node
 *   to qualify as a bridge (default: 2).
 * @returns Array of IBridgeNode, sorted by totalAffectedNodes descending.
 */
export function findArticulationPoints(
  subgraph: ISubgraph,
  edgeTypes?: readonly GraphEdgeType[],
  minComponentSize = 2
): IBridgeNode[] {
  if (subgraph.nodes.length === 0) return [];

  // Build adjacency list (optionally filtered by edge types)
  const adj = buildAdjacencyList(subgraph, edgeTypes);

  // Build node lookup
  const nodeMap = new Map<NodeId, IGraphNode>();
  for (const node of subgraph.nodes) {
    nodeMap.set(node.nodeId, node);
  }

  // Find articulation points using Tarjan's algorithm
  const apNodeIds = tarjanArticulationPoints(adj);

  if (apNodeIds.size === 0) return [];

  // For each articulation point, compute component impact
  const bridges: IBridgeNode[] = [];

  // Count components in the original graph for comparison
  const originalComponentCount = countComponents(adj);

  for (const apId of apNodeIds) {
    const node = nodeMap.get(apId);
    if (node === undefined) continue;

    const componentSizes = computeComponentSizesWithout(adj, apId);

    // How many new components appear vs. original
    const componentsCreated = componentSizes.length - originalComponentCount + 1;

    // Filter downstream components by minComponentSize
    const downstreamSizes = componentSizes.filter((s) => s >= minComponentSize);

    // If no downstream component meets the threshold, skip this bridge
    if (downstreamSizes.length === 0 && minComponentSize > 1) continue;

    const totalAffectedNodes =
      componentSizes.reduce((sum, size) => sum + size, 0) - Math.max(...componentSizes); // Exclude the largest (main) component

    // Determine which edge types this node is a bridge through
    const bridgeEdgeTypes = findBridgeEdgeTypes(apId, adj, subgraph);

    bridges.push({
      node,
      componentsCreated: Math.max(componentsCreated, 1),
      downstreamComponentSizes: downstreamSizes.sort((a, b) => b - a),
      totalAffectedNodes: Math.max(totalAffectedNodes, 0),
      bridgeEdgeTypes,
    });
  }

  // Sort by total affected nodes descending (highest impact first)
  bridges.sort((a, b) => b.totalAffectedNodes - a.totalAffectedNodes);

  return bridges;
}

/**
 * Find articulation points from a pre-computed set of node IDs.
 *
 * Used when GDS provides the articulation point IDs but we still need
 * to compute component metrics from the in-memory subgraph.
 *
 * @param subgraph - The domain subgraph.
 * @param articulationPointIds - Node IDs identified as APs (e.g., from GDS).
 * @param edgeTypes - Optional edge type filter.
 * @param minComponentSize - Minimum downstream component size.
 * @returns Array of IBridgeNode with full impact metrics.
 */
export function buildBridgeNodesFromIds(
  subgraph: ISubgraph,
  articulationPointIds: readonly NodeId[],
  edgeTypes?: readonly GraphEdgeType[],
  minComponentSize = 2
): IBridgeNode[] {
  if (subgraph.nodes.length === 0 || articulationPointIds.length === 0) return [];

  const adj = buildAdjacencyList(subgraph, edgeTypes);
  const nodeMap = new Map<NodeId, IGraphNode>();
  for (const node of subgraph.nodes) {
    nodeMap.set(node.nodeId, node);
  }

  const originalComponentCount = countComponents(adj);
  const bridges: IBridgeNode[] = [];

  for (const apId of articulationPointIds) {
    const node = nodeMap.get(apId);
    if (node === undefined) continue;

    const componentSizes = computeComponentSizesWithout(adj, apId);
    const componentsCreated = componentSizes.length - originalComponentCount + 1;
    const downstreamSizes = componentSizes.filter((s) => s >= minComponentSize);

    if (downstreamSizes.length === 0 && minComponentSize > 1) continue;

    const totalAffectedNodes =
      componentSizes.reduce((sum, size) => sum + size, 0) - Math.max(...componentSizes);

    const bridgeEdgeTypes = findBridgeEdgeTypes(apId, adj, subgraph);

    bridges.push({
      node,
      componentsCreated: Math.max(componentsCreated, 1),
      downstreamComponentSizes: downstreamSizes.sort((a, b) => b - a),
      totalAffectedNodes: Math.max(totalAffectedNodes, 0),
      bridgeEdgeTypes,
    });
  }

  bridges.sort((a, b) => b.totalAffectedNodes - a.totalAffectedNodes);

  return bridges;
}
