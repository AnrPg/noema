/**
 * @noema/knowledge-graph-service — Graph Analysis Algorithms
 *
 * Pure domain utility module containing graph algorithms that operate
 * on in-memory ISubgraph structures. Zero infrastructure imports —
 * depends only on @noema/types and local value objects.
 *
 * Phase 8c: Tarjan's articulation-point detection + BFS component sizing.
 * Phase 8d: Topological prerequisite ordering, degree/betweenness/PageRank centrality.
 *
 * Design decision D1: algorithms run in application code on the in-memory
 * adjacency list. For graphs up to ~10K nodes, Tarjan's O(V+E) is efficient.
 * A GDS-accelerated path exists at the repository layer for larger graphs.
 *
 * @see ADR-0043 for Phase 8c structural analysis design
 */

import type { GraphEdgeType, IGraphNode, ISubgraph, NodeId } from '@noema/types';

import type {
  IBridgeNode,
  ICentralityEntry,
  ICentralityStatistics,
  IPrerequisiteChainResult,
  IPrerequisiteEntry,
  IPrerequisiteLayer,
} from './value-objects/graph.value-objects.js';
import { GRAPH_ANALYSIS_DEFAULTS } from './value-objects/graph.value-objects.js';

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
      const frame = stack[stack.length - 1];
      if (frame === undefined) break;
      const neighbors = adj.get(frame.nodeId) ?? [];

      if (frame.neighborIdx < neighbors.length) {
        const neighbor = neighbors[frame.neighborIdx];
        frame.neighborIdx++;
        if (!neighbor) continue;

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
          const parentFrame = stack[stack.length - 1];
          if (parentFrame === undefined) break;
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
      const current = queue.shift();
      if (current === undefined) break;
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
      const current = queue.shift();
      if (current === undefined) break;
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

// ============================================================================
// Phase 8d: Directed Adjacency List
// ============================================================================

/** Directed adjacency lists — separate maps for outbound and inbound edges. */
interface IDirectedAdjacency {
  /** Outbound adjacency: source → targets */
  readonly outAdj: Map<NodeId, IAdjacencyEntry[]>;
  /** Inbound adjacency: target → sources */
  readonly inAdj: Map<NodeId, IAdjacencyEntry[]>;
}

/**
 * Build directed adjacency lists from an ISubgraph.
 *
 * Unlike the undirected `buildAdjacencyList`, this preserves edge direction.
 * Returns both outbound (source→target) and inbound (target→source) maps
 * so algorithms can traverse in either direction efficiently.
 */
function buildDirectedAdjacencyList(
  subgraph: ISubgraph,
  edgeTypes?: readonly GraphEdgeType[]
): IDirectedAdjacency {
  const outAdj = new Map<NodeId, IAdjacencyEntry[]>();
  const inAdj = new Map<NodeId, IAdjacencyEntry[]>();

  // Initialize entries for all nodes
  for (const node of subgraph.nodes) {
    outAdj.set(node.nodeId, []);
    inAdj.set(node.nodeId, []);
  }

  for (const edge of subgraph.edges) {
    if (edgeTypes !== undefined && !edgeTypes.includes(edge.edgeType)) {
      continue;
    }

    // Forward: source → target
    const srcOut = outAdj.get(edge.sourceNodeId);
    if (srcOut !== undefined) {
      srcOut.push({ neighborId: edge.targetNodeId, edgeType: edge.edgeType });
    }

    // Reverse: target ← source
    const tgtIn = inAdj.get(edge.targetNodeId);
    if (tgtIn !== undefined) {
      tgtIn.push({ neighborId: edge.sourceNodeId, edgeType: edge.edgeType });
    }
  }

  return { outAdj, inAdj };
}

// ============================================================================
// Phase 8d: Statistics Computation
// ============================================================================

/**
 * Compute distribution statistics over a set of numeric values.
 *
 * Calculates mean, median, standard deviation, skewness (Fisher–Pearson),
 * and excess kurtosis over the full value set.
 */
function computeStatistics(values: readonly number[]): ICentralityStatistics {
  if (values.length === 0) {
    return {
      mean: 0,
      median: 0,
      standardDeviation: 0,
      skewness: 0,
      kurtosis: 0,
      maxScore: 0,
      minScore: 0,
    };
  }

  const n = values.length;
  const sorted = [...values].sort((a, b) => a - b);

  const minScore = sorted[0] ?? 0;
  const maxScore = sorted[n - 1] ?? 0;

  // Mean
  const sum = values.reduce((acc, v) => acc + v, 0);
  const mean = sum / n;

  // Median
  const median =
    n % 2 === 1
      ? (sorted[Math.floor(n / 2)] ?? 0)
      : ((sorted[n / 2 - 1] ?? 0) + (sorted[n / 2] ?? 0)) / 2;

  // Variance & standard deviation (population)
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  const standardDeviation = Math.sqrt(variance);

  // Skewness (Fisher–Pearson, third standardized moment)
  let skewness = 0;
  if (standardDeviation > 0 && n >= 3) {
    const m3 = values.reduce((acc, v) => acc + ((v - mean) / standardDeviation) ** 3, 0) / n;
    skewness = m3;
  }

  // Excess kurtosis (fourth standardized moment minus 3)
  let kurtosis = 0;
  if (standardDeviation > 0 && n >= 4) {
    const m4 = values.reduce((acc, v) => acc + ((v - mean) / standardDeviation) ** 4, 0) / n;
    kurtosis = m4 - 3;
  }

  return { mean, median, standardDeviation, skewness, kurtosis, maxScore, minScore };
}

// ============================================================================
// Phase 8d: Topological Prerequisite Order (Kahn's Algorithm)
// ============================================================================

/**
 * Compute the topological prerequisite order for a target node.
 *
 * Uses Kahn's BFS-based topological sort on the prerequisite sub-DAG.
 * The edge convention is: prerequisite → dependent (forward direction).
 * So for "A is a prerequisite of B", the edge is A → B.
 * The target node's prerequisites are found by traversing **inbound** edges.
 *
 * @param subgraph - Prerequisite subgraph (fetched with edgeTypes=['prerequisite'],
 *   direction='inbound' from the target node).
 * @param targetNodeId - The node we're computing the prerequisite chain for.
 * @returns Complete prerequisite chain result with layers and topological order.
 */
export function computeTopologicalPrerequisiteOrder(
  subgraph: ISubgraph,
  targetNodeId: NodeId
): IPrerequisiteChainResult {
  const nodeMap = new Map<NodeId, IGraphNode>();
  for (const node of subgraph.nodes) {
    nodeMap.set(node.nodeId, node);
  }

  const targetNode = nodeMap.get(targetNodeId);
  if (targetNode === undefined) {
    // Return empty result if target not in subgraph
    return {
      targetNode: { nodeId: targetNodeId } as IGraphNode,
      layers: [],
      topologicalOrder: [],
      totalPrerequisites: 0,
      maxChainDepth: 0,
      gaps: [],
    };
  }

  // Build edge weight lookup: sourceId:targetId → weight
  const edgeWeightMap = new Map<string, number>();
  for (const edge of subgraph.edges) {
    const key = `${edge.sourceNodeId}:${edge.targetNodeId}`;
    edgeWeightMap.set(
      key,
      typeof edge.weight === 'number' ? edge.weight : GRAPH_ANALYSIS_DEFAULTS.DEFAULT_EDGE_WEIGHT
    );
  }

  // Build directed adjacency (prerequisite → dependent).
  // outAdj: prerequisite → nodes that depend on it
  // inAdj: dependent → its prerequisites
  const { outAdj, inAdj } = buildDirectedAdjacencyList(subgraph);

  // Compute depth from targetNode using BFS on reverse graph.
  // depth 0 = target itself. depth 1 = direct prerequisites. depth 2 = prerequisites of prerequisites.
  const depthMap = new Map<NodeId, number>();
  depthMap.set(targetNodeId, 0);
  const bfsQueue: NodeId[] = [targetNodeId];

  while (bfsQueue.length > 0) {
    const current = bfsQueue.shift();
    if (current === undefined) break;
    const currentDepth = depthMap.get(current) ?? 0;

    // Traverse inbound edges: current's prerequisites
    for (const entry of inAdj.get(current) ?? []) {
      if (!depthMap.has(entry.neighborId)) {
        depthMap.set(entry.neighborId, currentDepth + 1);
        bfsQueue.push(entry.neighborId);
      }
    }
  }

  // Collect all prerequisite nodes (everything except target)
  const prerequisiteNodeIds = new Set<NodeId>();
  for (const nodeId of depthMap.keys()) {
    if (nodeId !== targetNodeId) {
      prerequisiteNodeIds.add(nodeId);
    }
  }

  if (prerequisiteNodeIds.size === 0) {
    return {
      targetNode,
      layers: [],
      topologicalOrder: [],
      totalPrerequisites: 0,
      maxChainDepth: 0,
      gaps: [],
    };
  }

  // Kahn's algorithm on the prerequisite-only sub-DAG.
  // We restrict to nodes in prerequisiteNodeIds.
  // In-degree: count incoming prerequisite edges within the sub-DAG.
  const inDegree = new Map<NodeId, number>();
  for (const nid of prerequisiteNodeIds) {
    inDegree.set(nid, 0);
  }
  for (const nid of prerequisiteNodeIds) {
    for (const entry of outAdj.get(nid) ?? []) {
      if (prerequisiteNodeIds.has(entry.neighborId)) {
        inDegree.set(entry.neighborId, (inDegree.get(entry.neighborId) ?? 0) + 1);
      }
    }
  }

  // Start Kahn's from nodes with zero in-degree (deepest foundational concepts)
  const topoOrder: NodeId[] = [];
  const kahnQueue: NodeId[] = [];
  for (const [nid, deg] of inDegree) {
    if (deg === 0) {
      kahnQueue.push(nid);
    }
  }

  while (kahnQueue.length > 0) {
    const current = kahnQueue.shift();
    if (current === undefined) break;
    topoOrder.push(current);

    for (const entry of outAdj.get(current) ?? []) {
      if (!prerequisiteNodeIds.has(entry.neighborId)) continue;
      const newDeg = (inDegree.get(entry.neighborId) ?? 1) - 1;
      inDegree.set(entry.neighborId, newDeg);
      if (newDeg === 0) {
        kahnQueue.push(entry.neighborId);
      }
    }
  }

  // Any nodes not in topoOrder have cycles — include them at the end
  for (const nid of prerequisiteNodeIds) {
    if (!topoOrder.includes(nid)) {
      topoOrder.push(nid);
    }
  }

  // Compute critical path (longest path through the DAG) via DP on topo order.
  // longestPath[v] = max distance from any root (zero in-degree node) to v.
  const longestPath = new Map<NodeId, number>();
  for (const nid of topoOrder) {
    longestPath.set(nid, 0);
  }
  for (const nid of topoOrder) {
    const currentLen = longestPath.get(nid) ?? 0;
    for (const entry of outAdj.get(nid) ?? []) {
      if (!prerequisiteNodeIds.has(entry.neighborId)) continue;
      const existing = longestPath.get(entry.neighborId) ?? 0;
      if (currentLen + 1 > existing) {
        longestPath.set(entry.neighborId, currentLen + 1);
      }
    }
  }

  // Find the maximum path length and backtrack to identify critical path nodes.
  let maxPathLen = 0;
  for (const len of longestPath.values()) {
    if (len > maxPathLen) maxPathLen = len;
  }

  // Backtrack: a node is on the critical path if its longestPath value
  // is part of a chain from maxPathLen down to 0.
  const criticalPathNodes = new Set<NodeId>();
  // Start from all nodes at max length
  const backtrackQueue: NodeId[] = [];
  for (const [nid, len] of longestPath) {
    if (len === maxPathLen) {
      criticalPathNodes.add(nid);
      backtrackQueue.push(nid);
    }
  }
  while (backtrackQueue.length > 0) {
    const current = backtrackQueue.shift();
    if (current === undefined) break;
    const currentLen = longestPath.get(current) ?? 0;
    if (currentLen === 0) continue;

    // Check predecessors (inbound edges within prerequisite sub-DAG)
    for (const entry of inAdj.get(current) ?? []) {
      if (!prerequisiteNodeIds.has(entry.neighborId)) continue;
      const predLen = longestPath.get(entry.neighborId) ?? 0;
      if (predLen === currentLen - 1 && !criticalPathNodes.has(entry.neighborId)) {
        criticalPathNodes.add(entry.neighborId);
        backtrackQueue.push(entry.neighborId);
      }
    }
  }

  // Build IPrerequisiteEntry for each node
  const entryMap = new Map<NodeId, IPrerequisiteEntry>();
  for (const nid of topoOrder) {
    const node = nodeMap.get(nid);
    if (node === undefined) continue;

    const depth = depthMap.get(nid) ?? 1;

    // Weight: use the edge weight to the closest dependent in the chain.
    // For multiple edges, take the max weight.
    let weight = GRAPH_ANALYSIS_DEFAULTS.DEFAULT_EDGE_WEIGHT;
    for (const entry of outAdj.get(nid) ?? []) {
      const key = `${nid}:${entry.neighborId}`;
      const w = edgeWeightMap.get(key) ?? GRAPH_ANALYSIS_DEFAULTS.DEFAULT_EDGE_WEIGHT;
      if (w > weight) weight = w;
    }

    const prereqEntry: IPrerequisiteEntry = {
      node,
      depth,
      weight,
      isCriticalPath: criticalPathNodes.has(nid),
    };

    entryMap.set(nid, prereqEntry);
  }

  // Build layers grouped by depth
  const layerMap = new Map<number, IPrerequisiteEntry[]>();
  for (const nid of topoOrder) {
    const entry = entryMap.get(nid);
    if (entry === undefined) continue;
    const existing = layerMap.get(entry.depth);
    if (existing !== undefined) {
      existing.push(entry);
    } else {
      layerMap.set(entry.depth, [entry]);
    }
  }

  const layers: IPrerequisiteLayer[] = [];
  const sortedDepths = [...layerMap.keys()].sort((a, b) => a - b);
  for (const depth of sortedDepths) {
    layers.push({
      depth,
      nodes: layerMap.get(depth) ?? [],
    });
  }

  // Build topological order (flat list, study-order)
  const topologicalOrder: IPrerequisiteEntry[] = topoOrder
    .map((nid) => entryMap.get(nid))
    .filter((e): e is IPrerequisiteEntry => e !== undefined);

  const maxChainDepth = sortedDepths.length > 0 ? (sortedDepths[sortedDepths.length - 1] ?? 0) : 0;

  return {
    targetNode,
    layers,
    topologicalOrder,
    totalPrerequisites: topologicalOrder.length,
    maxChainDepth,
    gaps: [], // Populated by the service layer (needs mastery data)
  };
}

// ============================================================================
// Phase 8d: Degree Centrality (App-Code)
// ============================================================================

/**
 * Compute degree centrality for all nodes in a subgraph.
 *
 * Degree centrality = number of connections (in + out + total).
 * Primarily used as a fallback — the Cypher-based `getDegreeCentrality`
 * is preferred for degree queries.
 *
 * @param subgraph - The domain subgraph.
 * @param edgeTypes - Optional edge type filter.
 * @returns Array of ICentralityEntry with degreeBreakdown, sorted by score descending.
 */
export function computeDegreeCentrality(
  subgraph: ISubgraph,
  edgeTypes?: readonly GraphEdgeType[]
): ICentralityEntry[] {
  const { outAdj, inAdj } = buildDirectedAdjacencyList(subgraph, edgeTypes);
  const nodeMap = new Map<NodeId, IGraphNode>();
  for (const node of subgraph.nodes) {
    nodeMap.set(node.nodeId, node);
  }

  const entries: ICentralityEntry[] = [];

  for (const node of subgraph.nodes) {
    const inDeg = (inAdj.get(node.nodeId) ?? []).length;
    const outDeg = (outAdj.get(node.nodeId) ?? []).length;
    const totalDeg = inDeg + outDeg;

    entries.push({
      node,
      score: totalDeg,
      rank: 0, // Assigned after sorting
      degreeBreakdown: {
        inDegree: inDeg,
        outDegree: outDeg,
      },
    });
  }

  // Sort by score descending
  entries.sort((a, b) => b.score - a.score);

  // Assign ranks
  return entries.map((e, i) => ({ ...e, rank: i + 1 }));
}

// ============================================================================
// Phase 8d: Betweenness Centrality (Brandes' Algorithm)
// ============================================================================

/**
 * Compute betweenness centrality using Brandes' algorithm.
 *
 * Betweenness centrality measures how often a node lies on shortest paths
 * between other pairs of nodes. Time complexity: O(V·E).
 *
 * @param subgraph - The domain subgraph.
 * @param edgeTypes - Optional edge type filter.
 * @returns Array of ICentralityEntry sorted by score descending.
 */
export function computeBetweennessCentrality(
  subgraph: ISubgraph,
  edgeTypes?: readonly GraphEdgeType[]
): ICentralityEntry[] {
  if (subgraph.nodes.length === 0) return [];

  const { outAdj } = buildDirectedAdjacencyList(subgraph, edgeTypes);
  const nodeMap = new Map<NodeId, IGraphNode>();
  const nodeIds: NodeId[] = [];

  for (const node of subgraph.nodes) {
    nodeMap.set(node.nodeId, node);
    nodeIds.push(node.nodeId);
  }

  // Centrality accumulator
  const cb = new Map<NodeId, number>();
  for (const nid of nodeIds) {
    cb.set(nid, 0);
  }

  // Brandes' algorithm: BFS from each source node
  for (const s of nodeIds) {
    // Single-source shortest paths
    const stack: NodeId[] = [];
    const predecessors = new Map<NodeId, NodeId[]>();
    for (const nid of nodeIds) {
      predecessors.set(nid, []);
    }

    // sigma[t] = number of shortest paths from s to t
    const sigma = new Map<NodeId, number>();
    for (const nid of nodeIds) {
      sigma.set(nid, 0);
    }
    sigma.set(s, 1);

    // dist[t] = distance from s to t (-1 = not yet reached)
    const dist = new Map<NodeId, number>();
    for (const nid of nodeIds) {
      dist.set(nid, -1);
    }
    dist.set(s, 0);

    const queue: NodeId[] = [s];

    // BFS
    while (queue.length > 0) {
      const v = queue.shift();
      if (v === undefined) break;
      stack.push(v);

      for (const entry of outAdj.get(v) ?? []) {
        const w = entry.neighborId;
        if (!nodeMap.has(w)) continue;

        // First visit?
        if (dist.get(w) === -1) {
          dist.set(w, (dist.get(v) ?? 0) + 1);
          queue.push(w);
        }

        // Shortest path via v?
        if (dist.get(w) === (dist.get(v) ?? 0) + 1) {
          sigma.set(w, (sigma.get(w) ?? 0) + (sigma.get(v) ?? 0));
          predecessors.get(w)?.push(v);
        }
      }
    }

    // Accumulation: back-propagate dependencies
    const delta = new Map<NodeId, number>();
    for (const nid of nodeIds) {
      delta.set(nid, 0);
    }

    while (stack.length > 0) {
      const w = stack.pop();
      if (w === undefined) break;
      for (const v of predecessors.get(w) ?? []) {
        const sigmaV = sigma.get(v) ?? 1;
        const sigmaW = sigma.get(w) ?? 1;
        const contribution = (sigmaV / sigmaW) * (1 + (delta.get(w) ?? 0));
        delta.set(v, (delta.get(v) ?? 0) + contribution);
      }
      if (w !== s) {
        cb.set(w, (cb.get(w) ?? 0) + (delta.get(w) ?? 0));
      }
    }
  }

  // Build entries
  const entries: ICentralityEntry[] = [];
  for (const node of subgraph.nodes) {
    entries.push({
      node,
      score: cb.get(node.nodeId) ?? 0,
      rank: 0,
    });
  }

  entries.sort((a, b) => b.score - a.score);
  return entries.map((e, i) => ({ ...e, rank: i + 1 }));
}

// ============================================================================
// Phase 8d: PageRank (Power Iteration)
// ============================================================================

/**
 * Compute PageRank using the power iteration method.
 *
 * PageRank measures recursive importance — a node is important if it's
 * connected to other important nodes.
 *
 * @param subgraph - The domain subgraph.
 * @param edgeTypes - Optional edge type filter.
 * @param maxIterations - Maximum iterations (default from GRAPH_ANALYSIS_DEFAULTS).
 * @param dampingFactor - Damping factor (default from GRAPH_ANALYSIS_DEFAULTS).
 * @returns Array of ICentralityEntry sorted by score descending.
 */
export function computePageRank(
  subgraph: ISubgraph,
  edgeTypes?: readonly GraphEdgeType[],
  maxIterations = GRAPH_ANALYSIS_DEFAULTS.PAGERANK_MAX_ITERATIONS,
  dampingFactor = GRAPH_ANALYSIS_DEFAULTS.PAGERANK_DAMPING_FACTOR
): ICentralityEntry[] {
  if (subgraph.nodes.length === 0) return [];

  const { outAdj, inAdj } = buildDirectedAdjacencyList(subgraph, edgeTypes);
  const nodeMap = new Map<NodeId, IGraphNode>();
  const nodeIds: NodeId[] = [];

  for (const node of subgraph.nodes) {
    nodeMap.set(node.nodeId, node);
    nodeIds.push(node.nodeId);
  }

  const n = nodeIds.length;
  const initialScore = 1.0 / n;
  const teleportScore = (1.0 - dampingFactor) / n;

  // Initialize scores
  let scores = new Map<NodeId, number>();
  for (const nid of nodeIds) {
    scores.set(nid, initialScore);
  }

  // Power iteration
  for (let iter = 0; iter < maxIterations; iter++) {
    const newScores = new Map<NodeId, number>();

    // Handle dangling nodes (nodes with no outbound edges):
    // Distribute their rank equally to all nodes.
    let danglingSum = 0;
    for (const nid of nodeIds) {
      const outDeg = (outAdj.get(nid) ?? []).length;
      if (outDeg === 0) {
        danglingSum += scores.get(nid) ?? 0;
      }
    }
    const danglingContribution = (dampingFactor * danglingSum) / n;

    for (const nid of nodeIds) {
      // Sum incoming contributions
      let incomingSum = 0;
      for (const entry of inAdj.get(nid) ?? []) {
        const sourceScore = scores.get(entry.neighborId) ?? 0;
        const sourceOutDeg = (outAdj.get(entry.neighborId) ?? []).length;
        if (sourceOutDeg > 0) {
          incomingSum += sourceScore / sourceOutDeg;
        }
      }

      newScores.set(nid, teleportScore + dampingFactor * incomingSum + danglingContribution);
    }

    // Check convergence (L1 norm)
    let diff = 0;
    for (const nid of nodeIds) {
      diff += Math.abs((newScores.get(nid) ?? 0) - (scores.get(nid) ?? 0));
    }

    scores = newScores;

    if (diff < GRAPH_ANALYSIS_DEFAULTS.PAGERANK_CONVERGENCE_THRESHOLD) {
      break;
    }
  }

  // Build entries
  const entries: ICentralityEntry[] = [];
  for (const node of subgraph.nodes) {
    entries.push({
      node,
      score: scores.get(node.nodeId) ?? 0,
      rank: 0,
    });
  }

  entries.sort((a, b) => b.score - a.score);
  return entries.map((e, i) => ({ ...e, rank: i + 1 }));
}

// ============================================================================
// Phase 8d: Centrality Normalization & Statistics
// ============================================================================

/**
 * Normalise centrality entries to [0, 1] range and compute statistics.
 *
 * Normalisation divides each score by the maximum score. Statistics are
 * computed over all entries (not just topK) before slicing.
 *
 * @param entries - Full centrality entries (all nodes).
 * @param normalise - Whether to normalise scores to [0, 1].
 * @param topK - Number of top entries to return in the ranking.
 * @param algorithm - Which algorithm produced the scores.
 * @returns Normalized entries (topK slice) and statistics over all entries.
 */
export function normaliseCentralityResults(
  entries: ICentralityEntry[],
  normalise: boolean,
  topK: number,
  algorithm: string
): { ranking: ICentralityEntry[]; statistics: ICentralityStatistics } {
  const allScores = entries.map((e) => e.score);
  const maxScore = allScores.length > 0 ? Math.max(...allScores) : 0;

  let normalized: ICentralityEntry[];

  if (normalise && maxScore > 0) {
    // For betweenness, use (n-1)(n-2) normalization; for others, max-score
    const divisor =
      algorithm === 'betweenness' && entries.length >= 3
        ? (entries.length - 1) * (entries.length - 2)
        : maxScore;

    normalized = entries.map((e, i) => ({
      ...e,
      score: divisor > 0 ? e.score / divisor : 0,
      rank: i + 1,
    }));
  } else {
    normalized = entries.map((e, i) => ({ ...e, rank: i + 1 }));
  }

  // Compute statistics over all (potentially normalised) scores
  const statsScores = normalized.map((e) => e.score);
  const statistics = computeStatistics(statsScores);

  return {
    ranking: normalized.slice(0, topK),
    statistics,
  };
}
