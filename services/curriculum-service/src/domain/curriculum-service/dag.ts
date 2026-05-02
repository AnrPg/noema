import { CurriculumEdgeType } from '@noema/types';
import type { CurriculumEdge, CurriculumNode, CurriculumVersionGraph } from './curriculum.types.js';

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
    if (node.masteryThreshold <= 0 || node.masteryThreshold > 1) {
      throw new CurriculumValidationError(
        `Node ${node.id} has an invalid mastery threshold.`,
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
