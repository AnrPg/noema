/**
 * @noema/knowledge-graph-service — Graph Topology Fixtures
 *
 * Pre-built graph structures for testing traversal, cycle detection,
 * policy enforcement, and structural analysis. Each topology returns
 * a deterministic graph with known properties — tests assert against
 * these known properties rather than constructing graphs ad-hoc.
 *
 * 7 topologies per Phase 10 spec:
 *  1. Linear chain (A → B → C → D)
 *  2. Diamond (shared descendant)
 *  3. Cyclic (intentional cycle with `related_to`)
 *  4. Multi-domain (cross-domain edges)
 *  5. Deep hierarchy (10-level `part_of`)
 *  6. Hub (high-degree central node)
 *  7. CKG reference (canonical structure for comparison)
 */

import type {
  EdgeId,
  EdgeWeight,
  IGraphEdge,
  IGraphNode,
  ISubgraph,
  NodeId,
  UserId,
} from '@noema/types';

import { TEST_DOMAIN, TEST_USER_ID } from './index.js';

// ============================================================================
// Helpers
// ============================================================================

let topoCounter = 0;

function topoNodeId(prefix: string): NodeId {
  topoCounter += 1;
  return `node_topo_${prefix}_${String(topoCounter).padStart(4, '0')}` as NodeId;
}

function topoEdgeId(prefix: string): EdgeId {
  topoCounter += 1;
  return `edge_topo_${prefix}_${String(topoCounter).padStart(4, '0')}` as EdgeId;
}

export function resetTopoCounter(): void {
  topoCounter = 0;
}

function makeNode(nodeId: NodeId, label: string, overrides?: Partial<IGraphNode>): IGraphNode {
  return {
    nodeId,
    graphType: 'pkg',
    nodeType: 'concept',
    label,
    domain: TEST_DOMAIN,
    properties: {},
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  } as IGraphNode;
}

function makeEdge(
  edgeId: EdgeId,
  sourceNodeId: NodeId,
  targetNodeId: NodeId,
  edgeType: string,
  overrides?: Partial<IGraphEdge>
): IGraphEdge {
  return {
    edgeId,
    graphType: 'pkg',
    edgeType,
    sourceNodeId,
    targetNodeId,
    weight: 1.0 as EdgeWeight,
    properties: {},
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  } as IGraphEdge;
}

// ============================================================================
// Topology Result Shape
// ============================================================================

export interface IGraphTopology {
  /** All nodes in the graph */
  readonly nodes: readonly IGraphNode[];
  /** All edges in the graph */
  readonly edges: readonly IGraphEdge[];
  /** Named node lookups for assertions */
  readonly nodeIds: Readonly<Record<string, NodeId>>;
  /** Named edge lookups for assertions */
  readonly edgeIds: Readonly<Record<string, EdgeId>>;
  /** Owner user ID */
  readonly userId: UserId;
  /** The subgraph view (convenience for service-level tests) */
  readonly subgraph: ISubgraph;
}

// ============================================================================
// 1. Linear Chain: A → B → C → D
// ============================================================================

/**
 * Simple linear prerequisite chain.
 *
 * ```
 *   A ──prerequisite──▸ B ──prerequisite──▸ C ──prerequisite──▸ D
 * ```
 *
 * Properties:
 * - Ancestors of D: [C, B, A]
 * - Descendants of A: [B, C, D]
 * - Shortest path A→D: [A, B, C, D]
 * - No cycles
 * - Depth = 3
 */
export function linearChainGraph(): IGraphTopology {
  resetTopoCounter();

  const nA = topoNodeId('lin');
  const nB = topoNodeId('lin');
  const nC = topoNodeId('lin');
  const nD = topoNodeId('lin');

  const eAB = topoEdgeId('lin');
  const eBC = topoEdgeId('lin');
  const eCD = topoEdgeId('lin');

  const nodes = [
    makeNode(nA, 'Node A'),
    makeNode(nB, 'Node B'),
    makeNode(nC, 'Node C'),
    makeNode(nD, 'Node D'),
  ] as const;

  const edges = [
    makeEdge(eAB, nA, nB, 'prerequisite'),
    makeEdge(eBC, nB, nC, 'prerequisite'),
    makeEdge(eCD, nC, nD, 'prerequisite'),
  ] as const;

  return {
    nodes,
    edges,
    nodeIds: { A: nA, B: nB, C: nC, D: nD },
    edgeIds: { AB: eAB, BC: eBC, CD: eCD },
    userId: TEST_USER_ID,
    subgraph: { nodes, edges, rootNodeId: nA },
  };
}

// ============================================================================
// 2. Diamond Graph: A → B, A → C, B → D, C → D
// ============================================================================

/**
 * Diamond dependency — shared descendant D.
 *
 * ```
 *       A
 *      / \
 *     B   C
 *      \ /
 *       D
 * ```
 *
 * Properties:
 * - Descendants of A: [B, C, D] (D counted once)
 * - Ancestors of D: [B, C, A]
 * - Two paths A→D: A→B→D and A→C→D
 * - No cycles (prerequisite is acyclic)
 */
export function diamondGraph(): IGraphTopology {
  resetTopoCounter();

  const nA = topoNodeId('dia');
  const nB = topoNodeId('dia');
  const nC = topoNodeId('dia');
  const nD = topoNodeId('dia');

  const eAB = topoEdgeId('dia');
  const eAC = topoEdgeId('dia');
  const eBD = topoEdgeId('dia');
  const eCD = topoEdgeId('dia');

  const nodes = [
    makeNode(nA, 'Node A'),
    makeNode(nB, 'Node B'),
    makeNode(nC, 'Node C'),
    makeNode(nD, 'Node D'),
  ] as const;

  const edges = [
    makeEdge(eAB, nA, nB, 'prerequisite'),
    makeEdge(eAC, nA, nC, 'prerequisite'),
    makeEdge(eBD, nB, nD, 'prerequisite'),
    makeEdge(eCD, nC, nD, 'prerequisite'),
  ] as const;

  return {
    nodes,
    edges,
    nodeIds: { A: nA, B: nB, C: nC, D: nD },
    edgeIds: { AB: eAB, AC: eAC, BD: eBD, CD: eCD },
    userId: TEST_USER_ID,
    subgraph: { nodes, edges, rootNodeId: nA },
  };
}

// ============================================================================
// 3. Cyclic Graph: A → B → C → A (using `related_to`)
// ============================================================================

/**
 * Intentional cycle using `related_to` edges (which allow cycles).
 *
 * ```
 *   A ──related_to──▸ B ──related_to──▸ C ──related_to──▸ A
 * ```
 *
 * Properties:
 * - Cycle: [A, B, C, A]
 * - Acyclic edge types (prerequisite, is_a) should REJECT this structure
 * - related_to allows it (requiresAcyclicity = false)
 */
export function cyclicGraph(): IGraphTopology {
  resetTopoCounter();

  const nA = topoNodeId('cyc');
  const nB = topoNodeId('cyc');
  const nC = topoNodeId('cyc');

  const eAB = topoEdgeId('cyc');
  const eBC = topoEdgeId('cyc');
  const eCA = topoEdgeId('cyc');

  const nodes = [makeNode(nA, 'Node A'), makeNode(nB, 'Node B'), makeNode(nC, 'Node C')] as const;

  const edges = [
    makeEdge(eAB, nA, nB, 'related_to'),
    makeEdge(eBC, nB, nC, 'related_to'),
    makeEdge(eCA, nC, nA, 'related_to'),
  ] as const;

  return {
    nodes,
    edges,
    nodeIds: { A: nA, B: nB, C: nC },
    edgeIds: { AB: eAB, BC: eBC, CA: eCA },
    userId: TEST_USER_ID,
    subgraph: { nodes, edges, rootNodeId: nA },
  };
}

// ============================================================================
// 4. Multi-Domain Graph
// ============================================================================

/**
 * Nodes spanning "mathematics", "physics", "computer_science" with
 * cross-domain edges.
 *
 * ```
 *   [math] Calculus
 *      |
 *   prerequisite
 *      ↓
 *   [physics] Classical Mechanics ──related_to──▸ [cs] Numerical Methods
 * ```
 *
 * Properties:
 * - Nodes in 3 different domains
 * - Cross-domain edges present
 * - Tests domain-scoped queries and SLI computation
 */
export function multiDomainGraph(): IGraphTopology {
  resetTopoCounter();

  const nCalc = topoNodeId('mdom');
  const nMech = topoNodeId('mdom');
  const nNum = topoNodeId('mdom');
  const nAlg = topoNodeId('mdom');
  const nLin = topoNodeId('mdom');

  const eCalcMech = topoEdgeId('mdom');
  const eMechNum = topoEdgeId('mdom');
  const eAlgCalc = topoEdgeId('mdom');
  const eLinNum = topoEdgeId('mdom');

  const nodes = [
    makeNode(nCalc, 'Calculus', { domain: 'mathematics' }),
    makeNode(nMech, 'Classical Mechanics', { domain: 'physics' }),
    makeNode(nNum, 'Numerical Methods', { domain: 'computer_science' }),
    makeNode(nAlg, 'Algebra', { domain: 'mathematics' }),
    makeNode(nLin, 'Linear Algebra', { domain: 'mathematics' }),
  ] as const;

  const edges = [
    makeEdge(eCalcMech, nCalc, nMech, 'prerequisite'),
    makeEdge(eMechNum, nMech, nNum, 'related_to'),
    makeEdge(eAlgCalc, nAlg, nCalc, 'prerequisite'),
    makeEdge(eLinNum, nLin, nNum, 'prerequisite'),
  ] as const;

  return {
    nodes,
    edges,
    nodeIds: {
      Calculus: nCalc,
      ClassicalMechanics: nMech,
      NumericalMethods: nNum,
      Algebra: nAlg,
      LinearAlgebra: nLin,
    },
    edgeIds: {
      CalcMech: eCalcMech,
      MechNum: eMechNum,
      AlgCalc: eAlgCalc,
      LinNum: eLinNum,
    },
    userId: TEST_USER_ID,
    subgraph: { nodes, edges },
  };
}

// ============================================================================
// 5. Deep Hierarchy: 10-level `part_of` tree
// ============================================================================

/**
 * 10-level `part_of` hierarchy for testing depth-limited traversal.
 *
 * ```
 *   L0 ──part_of──▸ L1 ──part_of──▸ ... ──part_of──▸ L9
 * ```
 *
 * Properties:
 * - 10 nodes, 9 edges
 * - Requesting ancestors with maxDepth=3 from L9 should return [L8, L7, L6]
 * - Full path length = 9 hops
 */
export function deepHierarchyGraph(): IGraphTopology {
  resetTopoCounter();

  const nodeIds: Record<string, NodeId> = {};
  const edgeIds: Record<string, EdgeId> = {};
  const nodes: IGraphNode[] = [];
  const edges: IGraphEdge[] = [];

  for (let i = 0; i < 10; i++) {
    const nId = topoNodeId('deep');
    nodeIds[`L${String(i)}`] = nId;
    nodes.push(makeNode(nId, `Level ${String(i)}`));
  }

  for (let i = 0; i < 9; i++) {
    const eId = topoEdgeId('deep');
    const key = `L${String(i)}_L${String(i + 1)}`;
    edgeIds[key] = eId;
    const srcId = nodeIds[`L${String(i)}`];
    const tgtId = nodeIds[`L${String(i + 1)}`];
    if (srcId !== undefined && tgtId !== undefined) {
      edges.push(makeEdge(eId, srcId, tgtId, 'part_of'));
    }
  }

  return {
    nodes,
    edges,
    nodeIds,
    edgeIds,
    userId: TEST_USER_ID,
    subgraph: { nodes, edges, rootNodeId: nodeIds['L0'] },
  };
}

// ============================================================================
// 6. Hub Graph: 1 central + 20 peripheral
// ============================================================================

/**
 * Hub-and-spoke topology — one central concept connected to 20 peripherals.
 *
 * ```
 *       P1  P2  P3 ... P20
 *        \  |  /
 *    ───── HUB ─────
 * ```
 *
 * Properties:
 * - Hub node has degree 20 (all outbound `prerequisite` edges)
 * - Each peripheral has degree 1
 * - Tests high-degree node handling and centrality detection
 */
export function hubGraph(): IGraphTopology {
  resetTopoCounter();

  const hubId = topoNodeId('hub');
  const nodeIds: Record<string, NodeId> = { Hub: hubId };
  const edgeIds: Record<string, EdgeId> = {};
  const nodes: IGraphNode[] = [makeNode(hubId, 'Hub Concept')];
  const edges: IGraphEdge[] = [];

  for (let i = 1; i <= 20; i++) {
    const pId = topoNodeId('hub');
    const key = `P${String(i)}`;
    nodeIds[key] = pId;
    nodes.push(makeNode(pId, `Peripheral ${String(i)}`));

    const eId = topoEdgeId('hub');
    const edgeKey = `Hub_P${String(i)}`;
    edgeIds[edgeKey] = eId;
    edges.push(makeEdge(eId, hubId, pId, 'prerequisite'));
  }

  return {
    nodes,
    edges,
    nodeIds,
    edgeIds,
    userId: TEST_USER_ID,
    subgraph: { nodes, edges, rootNodeId: hubId },
  };
}

// ============================================================================
// 7. CKG Reference Graph
// ============================================================================

/**
 * A small canonical CKG structure for comparison testing.
 * Unlike PKG graphs (user-scoped), this has no userId.
 *
 * ```
 *   [ckg] Mathematics ──part_of──▸ [ckg] Algebra
 *                                      |
 *                                   is_a
 *                                      ↓
 *                                  [ckg] Linear Algebra
 *                                      |
 *                                   prerequisite
 *                                      ↓
 *                                  [ckg] Matrix Theory
 * ```
 *
 * Properties:
 * - graphType = 'ckg'
 * - No userId
 * - Mixed edge types
 * - Used for structural comparison tests
 */
export function ckgReferenceGraph(): IGraphTopology {
  resetTopoCounter();

  const nMath = topoNodeId('ckg');
  const nAlg = topoNodeId('ckg');
  const nLinAlg = topoNodeId('ckg');
  const nMatrix = topoNodeId('ckg');
  const nCalc = topoNodeId('ckg');

  const eMathAlg = topoEdgeId('ckg');
  const eAlgLin = topoEdgeId('ckg');
  const eLinMatrix = topoEdgeId('ckg');
  const eMathCalc = topoEdgeId('ckg');

  const nodes = [
    makeNode(nMath, 'Mathematics', { graphType: 'ckg', domain: 'mathematics' }),
    makeNode(nAlg, 'Algebra', { graphType: 'ckg', domain: 'mathematics' }),
    makeNode(nLinAlg, 'Linear Algebra', { graphType: 'ckg', domain: 'mathematics' }),
    makeNode(nMatrix, 'Matrix Theory', { graphType: 'ckg', domain: 'mathematics' }),
    makeNode(nCalc, 'Calculus', { graphType: 'ckg', domain: 'mathematics' }),
  ] as const;

  const edges = [
    makeEdge(eMathAlg, nMath, nAlg, 'part_of', { graphType: 'ckg' }),
    makeEdge(eAlgLin, nAlg, nLinAlg, 'is_a', { graphType: 'ckg' }),
    makeEdge(eLinMatrix, nLinAlg, nMatrix, 'prerequisite', { graphType: 'ckg' }),
    makeEdge(eMathCalc, nMath, nCalc, 'part_of', { graphType: 'ckg' }),
  ] as const;

  return {
    nodes,
    edges,
    nodeIds: {
      Mathematics: nMath,
      Algebra: nAlg,
      LinearAlgebra: nLinAlg,
      MatrixTheory: nMatrix,
      Calculus: nCalc,
    },
    edgeIds: {
      MathAlg: eMathAlg,
      AlgLin: eAlgLin,
      LinMatrix: eLinMatrix,
      MathCalc: eMathCalc,
    },
    userId: TEST_USER_ID,
    subgraph: { nodes, edges, rootNodeId: nMath },
  };
}
