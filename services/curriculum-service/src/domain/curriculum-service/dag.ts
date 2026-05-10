import { CurriculumEdgeType } from '@noema/types';
import type { CurriculumEdge, CurriculumNode, CurriculumVersionGraph } from './curriculum.types.js';
import { branchInfoForNode } from './branching.js';

export class CurriculumValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'CurriculumValidationError';
  }
}

export function validateCurriculumDag(graph: CurriculumVersionGraph): void {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));

  if (graph.nodes.length === 0) {
    throw new CurriculumValidationError(
      'Curriculum version must contain at least one node.',
      'NO_NODES'
    );
  }

  for (const node of graph.nodes) {
    if (node.stabilityThreshold <= 0 || node.stabilityThreshold > 1) {
      throw new CurriculumValidationError(
        `Node ${node.id} has an invalid stability threshold.`,
        'INVALID_THRESHOLD'
      );
    }
    if (node.ckgConceptId === undefined && node.proposedConcept === undefined) {
      throw new CurriculumValidationError(
        `Node ${node.id} must have a CKG concept anchor or proposed concept.`,
        'MISSING_CONCEPT_ANCHOR'
      );
    }
  }

  const edgeKeys = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.fromNodeId === edge.toNodeId) {
      throw new CurriculumValidationError(`Edge ${edge.id} is a self-edge.`, 'SELF_EDGE');
    }
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) {
      throw new CurriculumValidationError(
        `Edge ${edge.id} references a missing node.`,
        'MISSING_NODE'
      );
    }
    const key = `${edge.fromNodeId}:${edge.toNodeId}:${edge.type}`;
    if (edgeKeys.has(key)) {
      throw new CurriculumValidationError(`Duplicate curriculum edge ${key}.`, 'DUPLICATE_EDGE');
    }
    edgeKeys.add(key);
  }

  assertAcyclic(graph.nodes, graph.edges);

  const prerequisiteEdges = graph.edges.filter(
    (edge) => edge.type === CurriculumEdgeType.PREREQUISITE
  );
  const prerequisiteTargets = new Set(prerequisiteEdges.map((edge) => edge.toNodeId));
  const roots = graph.nodes.filter((node) => !prerequisiteTargets.has(node.id));
  if (roots.length === 0) {
    throw new CurriculumValidationError(
      'Curriculum version must have at least one prerequisite root.',
      'NO_ROOT'
    );
  }

  const edgeSources = new Set(graph.edges.map((edge) => edge.fromNodeId));
  const terminals = graph.nodes.filter((node) => !edgeSources.has(node.id));
  if (terminals.length === 0) {
    throw new CurriculumValidationError(
      'Curriculum version must have at least one terminal.',
      'NO_TERMINAL'
    );
  }

  const branchGroupRoots = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    const branchInfo = branchInfoForNode(node);
    if (branchInfo?.branchGroupKey === undefined) continue;
    if (!branchGroupRoots.has(branchInfo.branchGroupKey)) {
      branchGroupRoots.set(branchInfo.branchGroupKey, new Set<string>());
    }
    const incomingHard = prerequisiteEdges.filter((edge) => edge.toNodeId === node.id);
    const bucket = branchGroupRoots.get(branchInfo.branchGroupKey);
    if (bucket !== undefined && incomingHard.length === 0) {
      bucket.add(node.id);
    }
  }
  for (const [branchGroupKey, rootIds] of branchGroupRoots.entries()) {
    if (rootIds.size > 1) {
      throw new CurriculumValidationError(
        `Branch group ${branchGroupKey} has multiple hard-entry roots.`,
        'MULTIPLE_BRANCH_ROOTS'
      );
    }
  }

  for (const edge of graph.edges) {
    if (
      edge.type !== CurriculumEdgeType.DIVERSION_TO &&
      edge.type !== CurriculumEdgeType.BRANCH_OPTION
    ) {
      continue;
    }
    const source = graph.nodes.find((node) => node.id === edge.fromNodeId);
    const target = graph.nodes.find((node) => node.id === edge.toNodeId);
    const sourceBranch = source === undefined ? undefined : branchInfoForNode(source);
    const targetBranch = target === undefined ? undefined : branchInfoForNode(target);
    if (
      edge.type === CurriculumEdgeType.BRANCH_OPTION &&
      sourceBranch?.branchGroupKey !== undefined &&
      targetBranch?.branchGroupKey !== undefined &&
      sourceBranch.branchGroupKey === targetBranch.branchGroupKey
    ) {
      throw new CurriculumValidationError(
        `Branch option edge ${edge.id} cannot loop within the same branch group.`,
        'INVALID_BRANCH_OPTION'
      );
    }
  }
}

function assertAcyclic(nodes: CurriculumNode[], edges: CurriculumEdge[]): void {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node.id, []);
  for (const edge of edges) adjacency.get(edge.fromNodeId)?.push(edge.toNodeId);

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (nodeId: string): void => {
    if (visiting.has(nodeId)) {
      throw new CurriculumValidationError('Curriculum DAG must not contain cycles.', 'CYCLE');
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) visit(next);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  for (const node of nodes) visit(node.id);
}
