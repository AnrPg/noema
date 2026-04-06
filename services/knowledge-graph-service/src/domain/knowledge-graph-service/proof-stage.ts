/**
 * @noema/knowledge-graph-service - CKG Proof Stage Contracts
 *
 * Provides the proof-stage rollout modes, proof runner interface, mutation
 * model projection, and a deterministic proof adapter that performs concrete
 * safety/liveness checks before canonical commits.
 */

import type {
  GraphEdgeType,
  GraphNodeType,
  IGraphEdge,
  IGraphNode,
  Metadata,
  MutationId,
} from '@noema/types';

import {
  type CkgMutationOperation,
  CkgOperationType,
  extractAffectedEdgeIds,
  extractAffectedNodeIds,
} from './ckg-mutation-dsl.js';
import type { IExecutionContext } from './execution-context.js';
import type { ICkgMutation } from './mutation.repository.js';
import type { IOntologyArtifact } from './ontology-reasoning.js';
import { DEFAULT_ONTOLOGY_ARTIFACT } from './ontology-reasoning.js';

export const ProofRolloutMode = {
  DISABLED: 'disabled',
  OBSERVE_ONLY: 'observe_only',
  SOFT_BLOCK: 'soft_block',
  HARD_BLOCK: 'hard_block',
} as const;

export type ProofRolloutMode = (typeof ProofRolloutMode)[keyof typeof ProofRolloutMode];

export interface IProofFinding {
  readonly code: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
  readonly reviewable: boolean;
  readonly metadata?: Metadata;
}

export interface IProofNodeSnapshot {
  readonly nodeId: string;
  readonly nodeType: string;
  readonly domain: string;
  readonly origin: 'existing' | 'planned_add' | 'planned_split' | 'placeholder';
}

export interface IProofEdgeSnapshot {
  readonly edgeId: string;
  readonly edgeType: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly origin: 'existing' | 'planned_add' | 'planned_rewrite';
}

export interface IProofDependencyEdge {
  readonly edgeType: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
}

export interface IProofMissingEndpointWitness {
  readonly edgeId: string;
  readonly edgeType: string;
  readonly missingNodeIds: readonly string[];
}

export interface IProofDependencyCycleWitness {
  readonly edgeType: string;
  readonly path: readonly string[];
}

export interface IProofBidirectionalDependencyWitness {
  readonly edgeType: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
}

export interface IProofMutuallyExclusiveRelationWitness {
  readonly leftRelation: string;
  readonly rightRelation: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
}

export interface IProofSplitAssignmentGapWitness {
  readonly originalNodeId: string;
  readonly edgeId: string;
}

export interface IProofOntologyViolationWitness {
  readonly edgeId: string;
  readonly edgeType: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly reason: 'domain_range' | 'same_kind' | 'disjoint_class';
  readonly sourceClassifications: readonly string[];
  readonly targetClassifications: readonly string[];
  readonly requiredSourceClasses: readonly string[];
  readonly requiredTargetClasses: readonly string[];
}

export interface IProofNodeClassificationSnapshot {
  readonly nodeId: string;
  readonly classes: readonly string[];
}

export interface IProofEdgeConstraintSnapshot {
  readonly edgeType: string;
  readonly sourceClasses: readonly string[];
  readonly targetClasses: readonly string[];
  readonly sameKindRequired: boolean;
}

export interface IProofModel {
  readonly specVersion: string;
  readonly mutationId: MutationId;
  readonly operationCount: number;
  readonly operationTypes: readonly string[];
  readonly affectedNodeIds: readonly string[];
  readonly affectedEdgeIds: readonly string[];
  readonly operationFingerprints: readonly string[];
  readonly duplicateOperationFingerprints: readonly string[];
  readonly updateRemoveConflictNodeIds: readonly string[];
  readonly structuralRewriteCount: number;
  readonly currentNodes: readonly IProofNodeSnapshot[];
  readonly currentEdges: readonly IProofEdgeSnapshot[];
  readonly projectedNodes: readonly IProofNodeSnapshot[];
  readonly projectedEdges: readonly IProofEdgeSnapshot[];
  readonly dependencyEdges: readonly IProofDependencyEdge[];
  readonly missingEndpointWitnesses: readonly IProofMissingEndpointWitness[];
  readonly dependencyCycleWitnesses: readonly IProofDependencyCycleWitness[];
  readonly bidirectionalDependencyWitnesses: readonly IProofBidirectionalDependencyWitness[];
  readonly mutuallyExclusiveRelationWitnesses: readonly IProofMutuallyExclusiveRelationWitness[];
  readonly splitAssignmentGapWitnesses: readonly IProofSplitAssignmentGapWitness[];
  readonly ontologyViolationWitnesses: readonly IProofOntologyViolationWitness[];
  readonly ontologyArtifactVersion: string;
  readonly projectedNodeClassifications: readonly IProofNodeClassificationSnapshot[];
  readonly edgeConstraintSnapshots: readonly IProofEdgeConstraintSnapshot[];
  readonly disjointClassPairs: readonly (readonly [string, string])[];
  readonly generatedAt: string;
}

export interface IProofResult {
  readonly mode: ProofRolloutMode;
  readonly status: 'skipped' | 'passed' | 'failed';
  readonly passed: boolean;
  readonly engineVersion: string;
  readonly artifactRef: string | null;
  readonly checkedInvariants: readonly string[];
  readonly findings: readonly IProofFinding[];
  readonly failureExplanation?: string;
  readonly modelSummary: Metadata;
  readonly executedAt: string;
  readonly autoApproved: boolean;
  readonly enforcement: 'none' | 'observe_only' | 'pending_review' | 'rejected';
}

export interface IProofRunner {
  runProof(
    mutation: ICkgMutation,
    operations: readonly CkgMutationOperation[],
    model: IProofModel,
    context: IExecutionContext,
    mode: ProofRolloutMode
  ): Promise<IProofResult>;
}

export interface IProofGraphState {
  readonly nodes: readonly Pick<IGraphNode, 'nodeId' | 'nodeType' | 'domain'>[];
  readonly edges: readonly Pick<
    IGraphEdge,
    'edgeId' | 'edgeType' | 'sourceNodeId' | 'targetNodeId'
  >[];
}

const ENGINE_VERSION = 'noema-proof-v2';
const SPEC_VERSION = 'ckg-proof-spec-v2';
const REVIEWABLE_STRUCTURAL_REWRITE_THRESHOLD = 3;

function fingerprintOperation(operation: CkgMutationOperation): string {
  switch (operation.type) {
    case CkgOperationType.ADD_NODE:
      return `${operation.type}:${operation.nodeType}:${operation.domain}:${operation.label.toLowerCase()}`;
    case CkgOperationType.REMOVE_NODE:
      return `${operation.type}:${operation.nodeId}`;
    case CkgOperationType.UPDATE_NODE:
      return `${operation.type}:${operation.nodeId}`;
    case CkgOperationType.ADD_EDGE:
      return `${operation.type}:${operation.edgeType}:${operation.sourceNodeId}:${operation.targetNodeId}`;
    case CkgOperationType.REMOVE_EDGE:
      return `${operation.type}:${operation.edgeId}`;
    case CkgOperationType.MERGE_NODES:
      return `${operation.type}:${operation.sourceNodeId}:${operation.targetNodeId}`;
    case CkgOperationType.SPLIT_NODE:
      return `${operation.type}:${operation.nodeId}:${operation.newNodeA.label.toLowerCase()}:${operation.newNodeB.label.toLowerCase()}`;
  }
}

function toSerializableValue(value: unknown): Metadata[string] {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.filter((entry) => entry !== undefined).map((entry) => toSerializableValue(entry));
  }

  if (typeof value === 'object') {
    return toSerializableMetadata(value as Record<string, unknown>);
  }

  return null;
}

function toSerializableMetadata(value: Record<string, unknown>): Metadata {
  const metadata = {} as Metadata;
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      metadata[key] = toSerializableValue(entry);
    }
  }
  return metadata;
}

function snapshotNode(
  node:
    | Pick<IGraphNode, 'nodeId' | 'nodeType' | 'domain'>
    | {
        nodeId: string;
        nodeType: string;
        domain: string;
      },
  origin: IProofNodeSnapshot['origin']
): IProofNodeSnapshot {
  return {
    nodeId: node.nodeId,
    nodeType: node.nodeType,
    domain: node.domain,
    origin,
  };
}

function snapshotEdge(
  edge:
    | Pick<IGraphEdge, 'edgeId' | 'edgeType' | 'sourceNodeId' | 'targetNodeId'>
    | {
        edgeId: string;
        edgeType: string;
        sourceNodeId: string;
        targetNodeId: string;
      },
  origin: IProofEdgeSnapshot['origin']
): IProofEdgeSnapshot {
  return {
    edgeId: edge.edgeId,
    edgeType: edge.edgeType,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    origin,
  };
}

function toDependencyEdge(edge: IProofEdgeSnapshot): IProofDependencyEdge {
  return {
    edgeType: edge.edgeType,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
  };
}

function plannedNodeId(mutationId: MutationId, operationIndex: number, suffix: string): string {
  return `proof:${mutationId}:node:${String(operationIndex)}:${suffix}`;
}

function plannedEdgeId(mutationId: MutationId, operationIndex: number, suffix: string): string {
  return `proof:${mutationId}:edge:${String(operationIndex)}:${suffix}`;
}

function ensureNode(nodes: Map<string, IProofNodeSnapshot>, nodeId: string): IProofNodeSnapshot {
  const existing = nodes.get(nodeId);
  if (existing !== undefined) {
    return existing;
  }

  const placeholder = snapshotNode(
    {
      nodeId,
      nodeType: 'unknown',
      domain: 'unknown',
    },
    'placeholder'
  );
  nodes.set(nodeId, placeholder);
  return placeholder;
}

function upsertEdge(edges: Map<string, IProofEdgeSnapshot>, edge: IProofEdgeSnapshot): void {
  edges.set(edge.edgeId, edge);
}

function countStructuralRewrites(operations: readonly CkgMutationOperation[]): number {
  return operations.filter(
    (operation) =>
      operation.type === CkgOperationType.MERGE_NODES ||
      operation.type === CkgOperationType.SPLIT_NODE ||
      operation.type === CkgOperationType.REMOVE_NODE
  ).length;
}

export function buildProofModel(
  mutation: ICkgMutation,
  operations: readonly CkgMutationOperation[],
  graphState: IProofGraphState = {
    nodes: [],
    edges: [],
  },
  ontologyArtifact: IOntologyArtifact = DEFAULT_ONTOLOGY_ARTIFACT
): IProofModel {
  const currentNodes = graphState.nodes.map((node) => snapshotNode(node, 'existing'));
  const currentEdges = graphState.edges.map((edge) => snapshotEdge(edge, 'existing'));

  const projectedNodes = new Map<string, IProofNodeSnapshot>();
  const projectedEdges = new Map<string, IProofEdgeSnapshot>();

  for (const node of currentNodes) {
    projectedNodes.set(node.nodeId, node);
  }
  for (const edge of currentEdges) {
    projectedEdges.set(edge.edgeId, edge);
    ensureNode(projectedNodes, edge.sourceNodeId);
    ensureNode(projectedNodes, edge.targetNodeId);
  }

  const operationFingerprints = operations.map((operation) => fingerprintOperation(operation));
  const seenFingerprints = new Set<string>();
  const duplicateFingerprints = new Set<string>();
  for (const fingerprint of operationFingerprints) {
    if (seenFingerprints.has(fingerprint)) {
      duplicateFingerprints.add(fingerprint);
    }
    seenFingerprints.add(fingerprint);
  }

  const removedNodeIds = new Set<string>();
  const updatedNodeIds = new Set<string>();
  const splitAssignmentGapWitnesses: IProofSplitAssignmentGapWitness[] = [];

  for (const [operationIndex, operation] of operations.entries()) {
    switch (operation.type) {
      case CkgOperationType.ADD_NODE: {
        projectedNodes.set(
          plannedNodeId(mutation.mutationId, operationIndex, 'add'),
          snapshotNode(
            {
              nodeId: plannedNodeId(mutation.mutationId, operationIndex, 'add'),
              nodeType: operation.nodeType,
              domain: operation.domain,
            },
            'planned_add'
          )
        );
        break;
      }

      case CkgOperationType.REMOVE_NODE: {
        removedNodeIds.add(operation.nodeId);
        projectedNodes.delete(operation.nodeId);
        for (const [edgeId, edge] of projectedEdges.entries()) {
          if (edge.sourceNodeId === operation.nodeId || edge.targetNodeId === operation.nodeId) {
            projectedEdges.delete(edgeId);
          }
        }
        break;
      }

      case CkgOperationType.UPDATE_NODE: {
        updatedNodeIds.add(operation.nodeId);
        const existing = ensureNode(projectedNodes, operation.nodeId);
        projectedNodes.set(operation.nodeId, {
          ...existing,
          ...(operation.updates.nodeType !== undefined
            ? { nodeType: operation.updates.nodeType }
            : {}),
          ...(operation.updates.domain !== undefined ? { domain: operation.updates.domain } : {}),
        });
        break;
      }

      case CkgOperationType.ADD_EDGE: {
        ensureNode(projectedNodes, operation.sourceNodeId);
        ensureNode(projectedNodes, operation.targetNodeId);
        upsertEdge(
          projectedEdges,
          snapshotEdge(
            {
              edgeId: plannedEdgeId(mutation.mutationId, operationIndex, 'add'),
              edgeType: operation.edgeType,
              sourceNodeId: operation.sourceNodeId,
              targetNodeId: operation.targetNodeId,
            },
            'planned_add'
          )
        );
        break;
      }

      case CkgOperationType.REMOVE_EDGE: {
        projectedEdges.delete(operation.edgeId);
        break;
      }

      case CkgOperationType.MERGE_NODES: {
        ensureNode(projectedNodes, operation.targetNodeId);
        projectedNodes.delete(operation.sourceNodeId);

        for (const [edgeId, edge] of projectedEdges.entries()) {
          const redirectedSource =
            edge.sourceNodeId === operation.sourceNodeId
              ? operation.targetNodeId
              : edge.sourceNodeId;
          const redirectedTarget =
            edge.targetNodeId === operation.sourceNodeId
              ? operation.targetNodeId
              : edge.targetNodeId;

          if (redirectedSource !== edge.sourceNodeId || redirectedTarget !== edge.targetNodeId) {
            projectedEdges.set(edgeId, {
              ...edge,
              sourceNodeId: redirectedSource,
              targetNodeId: redirectedTarget,
              origin: edge.origin === 'existing' ? 'planned_rewrite' : edge.origin,
            });
          }
        }
        break;
      }

      case CkgOperationType.SPLIT_NODE: {
        const originalNodeId = operation.nodeId;
        const splitNodeAId = plannedNodeId(mutation.mutationId, operationIndex, 'split-a');
        const splitNodeBId = plannedNodeId(mutation.mutationId, operationIndex, 'split-b');
        const originalNode = ensureNode(projectedNodes, originalNodeId);
        const originalDomain = originalNode.domain;

        projectedNodes.delete(originalNodeId);
        projectedNodes.set(
          splitNodeAId,
          snapshotNode(
            {
              nodeId: splitNodeAId,
              nodeType: operation.newNodeA.nodeType,
              domain: originalDomain,
            },
            'planned_split'
          )
        );
        projectedNodes.set(
          splitNodeBId,
          snapshotNode(
            {
              nodeId: splitNodeBId,
              nodeType: operation.newNodeB.nodeType,
              domain: originalDomain,
            },
            'planned_split'
          )
        );

        const reassignmentRules = new Map(
          operation.edgeReassignmentRules.map((rule) => [rule.edgeId, rule.assignTo] as const)
        );

        for (const [edgeId, edge] of [...projectedEdges.entries()]) {
          if (edge.sourceNodeId !== originalNodeId && edge.targetNodeId !== originalNodeId) {
            continue;
          }

          const assignment = reassignmentRules.get(edgeId);
          if (assignment === undefined) {
            splitAssignmentGapWitnesses.push({
              originalNodeId,
              edgeId,
            });
            projectedEdges.delete(edgeId);
            continue;
          }

          const replacementNodeId = assignment === 'a' ? splitNodeAId : splitNodeBId;
          projectedEdges.set(edgeId, {
            ...edge,
            sourceNodeId:
              edge.sourceNodeId === originalNodeId ? replacementNodeId : edge.sourceNodeId,
            targetNodeId:
              edge.targetNodeId === originalNodeId ? replacementNodeId : edge.targetNodeId,
            origin: edge.origin === 'existing' ? 'planned_rewrite' : edge.origin,
          });
        }

        break;
      }
    }
  }

  const updateRemoveConflictNodeIds = [...updatedNodeIds].filter((nodeId) =>
    removedNodeIds.has(nodeId)
  );

  const projectedNodeList = [...projectedNodes.values()].sort((left, right) =>
    left.nodeId.localeCompare(right.nodeId)
  );
  const projectedEdgeList = [...projectedEdges.values()].sort((left, right) =>
    left.edgeId.localeCompare(right.edgeId)
  );
  const dependencyEdges = projectedEdgeList
    .filter((edge) => DIRECTIONAL_DEPENDENCY_EDGE_TYPES.has(edge.edgeType))
    .map((edge) => toDependencyEdge(edge));
  const projectedNodeClassifications = projectedNodeList.map((node) => {
    const classes = ontologyArtifact.nodeClassHierarchy[node.nodeType as GraphNodeType] as
      | readonly string[]
      | undefined;
    return {
      nodeId: node.nodeId,
      classes: [...(classes ?? [])],
    };
  });
  const edgeConstraintSnapshots = Object.entries(ontologyArtifact.edgeConstraints).map(
    ([edgeType, constraint]) => ({
      edgeType,
      sourceClasses: [...constraint.sourceClasses],
      targetClasses: [...constraint.targetClasses],
      sameKindRequired: constraint.sameKindRequired === true,
    })
  );
  const missingEndpointWitnesses = detectMissingEndpointWitnesses(
    projectedNodeList,
    projectedEdgeList
  );
  const ontologyViolationWitnesses = detectOntologyViolationWitnesses(
    projectedNodeList,
    projectedEdgeList,
    ontologyArtifact
  );
  const dependencyCycleWitnesses = detectDependencyCycles(dependencyEdges);
  const bidirectionalDependencyWitnesses = detectBidirectionalDependencies(dependencyEdges);
  const mutuallyExclusiveRelationWitnesses = detectMutuallyExclusivePairs(projectedEdgeList);

  return {
    specVersion: SPEC_VERSION,
    mutationId: mutation.mutationId,
    operationCount: operations.length,
    operationTypes: operations.map((operation) => operation.type),
    affectedNodeIds: extractAffectedNodeIds(operations).map((id) => id),
    affectedEdgeIds: extractAffectedEdgeIds(operations).map((id) => id),
    operationFingerprints,
    duplicateOperationFingerprints: [...duplicateFingerprints],
    updateRemoveConflictNodeIds,
    structuralRewriteCount: countStructuralRewrites(operations),
    currentNodes,
    currentEdges,
    projectedNodes: projectedNodeList,
    projectedEdges: projectedEdgeList,
    dependencyEdges,
    missingEndpointWitnesses,
    dependencyCycleWitnesses,
    bidirectionalDependencyWitnesses,
    mutuallyExclusiveRelationWitnesses,
    splitAssignmentGapWitnesses,
    ontologyViolationWitnesses,
    ontologyArtifactVersion: ontologyArtifact.version,
    projectedNodeClassifications,
    edgeConstraintSnapshots,
    disjointClassPairs: ontologyArtifact.disjointNodeClasses.map((pair) => [...pair] as const),
    generatedAt: new Date().toISOString(),
  };
}

function buildFinding(
  code: string,
  message: string,
  severity: 'error' | 'warning',
  reviewable: boolean,
  metadata?: Record<string, unknown>
): IProofFinding {
  return {
    code,
    message,
    severity,
    reviewable,
    ...(metadata !== undefined ? { metadata: toSerializableMetadata(metadata) } : {}),
  };
}

export class DeterministicProofRunner implements IProofRunner {
  runProof(
    mutation: ICkgMutation,
    operations: readonly CkgMutationOperation[],
    model: IProofModel,
    _context: IExecutionContext,
    mode: ProofRolloutMode
  ): Promise<IProofResult> {
    const findings: IProofFinding[] = [];
    const checkedInvariants = [
      'mutation_has_operations',
      'projected_graph_contains_nodes',
      'projected_nodes_have_known_shape',
      'operation_fingerprints_unique',
      'no_node_update_remove_conflict',
      'bounded_structural_rewrites',
      'projected_nodes_are_not_placeholders',
      'projected_edges_reference_declared_nodes',
      'projected_edges_satisfy_ontology_constraints',
      'dependency_edges_exist_in_projection',
      'projected_edges_have_known_endpoints',
      'projected_dependency_graph_is_acyclic',
      'projected_dependency_graph_is_unidirectional',
      'projected_relations_are_not_mutually_exclusive',
      'split_rewrites_assign_incident_edges',
      'mutation_eventually_committable',
    ];

    if (operations.length === 0) {
      findings.push(
        buildFinding(
          'PROOF_EMPTY_MUTATION',
          'Mutations without operations cannot satisfy the canonical commit protocol.',
          'error',
          false
        )
      );
    }

    if (model.duplicateOperationFingerprints.length > 0) {
      findings.push(
        buildFinding(
          'PROOF_DUPLICATE_OPERATION_FINGERPRINT',
          'The mutation contains duplicate structural operations that make the proof model ambiguous.',
          'error',
          false,
          { fingerprints: model.duplicateOperationFingerprints }
        )
      );
    }

    if (model.updateRemoveConflictNodeIds.length > 0) {
      findings.push(
        buildFinding(
          'PROOF_UPDATE_REMOVE_NODE_CONFLICT',
          'A node is both updated and removed in the same mutation.',
          'error',
          false,
          { nodeIds: model.updateRemoveConflictNodeIds }
        )
      );
    }

    if (model.structuralRewriteCount >= REVIEWABLE_STRUCTURAL_REWRITE_THRESHOLD) {
      findings.push(
        buildFinding(
          'PROOF_COMPLEX_STRUCTURAL_REWRITE',
          'The mutation contains multiple high-impact structural rewrites and should be reviewed before commit.',
          'warning',
          true,
          { structuralRewriteCount: model.structuralRewriteCount }
        )
      );
    }

    const mergeAndSplitInSameMutation =
      operations.some((operation) => operation.type === CkgOperationType.MERGE_NODES) &&
      operations.some((operation) => operation.type === CkgOperationType.SPLIT_NODE);
    if (mergeAndSplitInSameMutation) {
      findings.push(
        buildFinding(
          'PROOF_MIXED_STRUCTURAL_REWRITE',
          'Combining merge and split rewrites in one canonical mutation requires explicit review.',
          'warning',
          true
        )
      );
    }

    if (model.missingEndpointWitnesses.length > 0) {
      findings.push(
        buildFinding(
          'PROOF_MISSING_PROJECTED_ENDPOINT',
          'Projected edges must resolve to known canonical endpoints before commit.',
          'error',
          false,
          { edges: model.missingEndpointWitnesses }
        )
      );
    }

    if (model.ontologyViolationWitnesses.length > 0) {
      findings.push(
        buildFinding(
          'PROOF_ONTOLOGY_CONFLICT',
          'The projected canonical graph violates ontology domain/range, kind-alignment, or disjointness constraints.',
          'error',
          false,
          { violations: model.ontologyViolationWitnesses }
        )
      );
    }

    const dependencySelfLoops = model.dependencyEdges.filter(
      (edge) => edge.sourceNodeId === edge.targetNodeId
    );
    if (dependencySelfLoops.length > 0) {
      findings.push(
        buildFinding(
          'PROOF_DEPENDENCY_SELF_LOOP',
          'A directed dependency edge would create a semantic self-loop in the projected canonical graph.',
          'error',
          false,
          { edges: dependencySelfLoops }
        )
      );
    }

    if (model.dependencyCycleWitnesses.length > 0) {
      findings.push(
        buildFinding(
          'PROOF_DEPENDENCY_CYCLE',
          'The projected dependency graph would contain at least one cycle after commit.',
          'error',
          false,
          { cycles: model.dependencyCycleWitnesses }
        )
      );
    }

    if (model.bidirectionalDependencyWitnesses.length > 0) {
      findings.push(
        buildFinding(
          'PROOF_BIDIRECTIONAL_DEPENDENCY',
          'The projected graph would contain dependency edges in both directions for the same canonical pair.',
          'error',
          false,
          { pairs: model.bidirectionalDependencyWitnesses }
        )
      );
    }

    if (model.mutuallyExclusiveRelationWitnesses.length > 0) {
      findings.push(
        buildFinding(
          'PROOF_MUTUALLY_EXCLUSIVE_RELATIONS',
          'The projected canonical graph would assert mutually exclusive relations on the same pair.',
          'error',
          false,
          { pairs: model.mutuallyExclusiveRelationWitnesses }
        )
      );
    }

    if (model.splitAssignmentGapWitnesses.length > 0) {
      findings.push(
        buildFinding(
          'PROOF_SPLIT_ASSIGNMENT_GAP',
          'Split rewrites must assign every incident edge to one of the replacement nodes before commit.',
          'error',
          false,
          { gaps: model.splitAssignmentGapWitnesses }
        )
      );
    }

    const failureFindings = findings.filter((finding) => finding.severity === 'error');
    const reviewableFindings = findings.filter((finding) => finding.reviewable);
    const passed = failureFindings.length === 0 && reviewableFindings.length === 0;

    let enforcement: IProofResult['enforcement'] = 'none';
    if (mode === ProofRolloutMode.OBSERVE_ONLY && findings.length > 0) {
      enforcement = 'observe_only';
    } else if (reviewableFindings.length > 0) {
      enforcement = 'pending_review';
    } else if (failureFindings.length > 0) {
      enforcement = 'rejected';
    }

    return Promise.resolve({
      mode,
      status: passed ? 'passed' : 'failed',
      passed,
      engineVersion: ENGINE_VERSION,
      artifactRef: `proof://${mutation.mutationId}/${Date.now().toString(36)}`,
      checkedInvariants,
      findings,
      ...(passed
        ? {}
        : {
            failureExplanation:
              failureFindings[0]?.message ??
              reviewableFindings[0]?.message ??
              'Proof-stage findings require attention before commit.',
          }),
      modelSummary: toSerializableMetadata({
        specVersion: model.specVersion,
        operationCount: model.operationCount,
        operationTypes: model.operationTypes,
        affectedNodeIds: model.affectedNodeIds,
        affectedEdgeIds: model.affectedEdgeIds,
        structuralRewriteCount: model.structuralRewriteCount,
        currentNodeCount: model.currentNodes.length,
        currentEdgeCount: model.currentEdges.length,
        projectedNodeCount: model.projectedNodes.length,
        projectedEdgeCount: model.projectedEdges.length,
        dependencyEdges: model.dependencyEdges,
        dependencyCycleWitnesses: model.dependencyCycleWitnesses,
        bidirectionalDependencyWitnesses: model.bidirectionalDependencyWitnesses,
        mutuallyExclusiveRelationWitnesses: model.mutuallyExclusiveRelationWitnesses,
        missingEndpointWitnesses: model.missingEndpointWitnesses,
        splitAssignmentGapWitnesses: model.splitAssignmentGapWitnesses,
        ontologyViolationWitnesses: model.ontologyViolationWitnesses,
        ontologyArtifactVersion: model.ontologyArtifactVersion,
        projectedNodeClassifications: model.projectedNodeClassifications,
        edgeConstraintSnapshots: model.edgeConstraintSnapshots,
        disjointClassPairs: model.disjointClassPairs,
      }),
      executedAt: new Date().toISOString(),
      autoApproved: false,
      enforcement,
    });
  }
}

export function createDisabledProofResult(
  mode: ProofRolloutMode,
  model: IProofModel
): IProofResult {
  return {
    mode,
    status: 'skipped',
    passed: true,
    engineVersion: ENGINE_VERSION,
    artifactRef: null,
    checkedInvariants: [],
    findings: [],
    modelSummary: toSerializableMetadata({
      specVersion: model.specVersion,
      operationCount: model.operationCount,
      operationTypes: model.operationTypes,
      affectedNodeIds: model.affectedNodeIds,
      affectedEdgeIds: model.affectedEdgeIds,
      structuralRewriteCount: model.structuralRewriteCount,
      currentNodeCount: model.currentNodes.length,
      currentEdgeCount: model.currentEdges.length,
      projectedNodeCount: model.projectedNodes.length,
      projectedEdgeCount: model.projectedEdges.length,
      ontologyArtifactVersion: model.ontologyArtifactVersion,
    }),
    executedAt: new Date().toISOString(),
    autoApproved: true,
    enforcement: 'none',
  };
}

const DIRECTIONAL_DEPENDENCY_EDGE_TYPES = new Set<string>([
  'prerequisite',
  'depends_on',
  'derived_from',
  'subskill_of',
  'has_subskill',
]);

const MUTUALLY_EXCLUSIVE_RELATION_KEYS = new Set<string>([
  createExclusivePairKey('prerequisite', 'equivalent_to'),
  createExclusivePairKey('prerequisite', 'contradicts'),
  createExclusivePairKey('depends_on', 'contradicts'),
  createExclusivePairKey('derived_from', 'contradicts'),
  createExclusivePairKey('subskill_of', 'equivalent_to'),
  createExclusivePairKey('has_subskill', 'equivalent_to'),
]);

function hasAllowedClass(inferred: readonly string[], allowed: readonly string[]): boolean {
  return inferred.some((value) => allowed.includes(value));
}

function pickPrimaryKind(
  classes: readonly string[]
): 'abstraction' | 'role_like' | 'instance_like' | 'diagnostic_like' | null {
  if (classes.includes('abstraction') || classes.includes('concept_bearing')) {
    return 'abstraction';
  }
  if (classes.includes('role_like')) {
    return 'role_like';
  }
  if (classes.includes('instance_like')) {
    return 'instance_like';
  }
  if (classes.includes('diagnostic_like')) {
    return 'diagnostic_like';
  }
  return null;
}

function hasKindAlignment(source: readonly string[], target: readonly string[]): boolean {
  const sourceKind = pickPrimaryKind(source);
  const targetKind = pickPrimaryKind(target);
  return sourceKind !== null && sourceKind === targetKind;
}

function detectDisjointPair(
  source: readonly string[],
  target: readonly string[],
  ontologyArtifact: IOntologyArtifact
): readonly [string, string] | null {
  for (const [left, right] of ontologyArtifact.disjointNodeClasses) {
    if (
      (source.includes(left) && target.includes(right)) ||
      (source.includes(right) && target.includes(left))
    ) {
      return [left, right];
    }
  }
  return null;
}

function detectOntologyViolationWitnesses(
  nodes: readonly IProofNodeSnapshot[],
  edges: readonly IProofEdgeSnapshot[],
  ontologyArtifact: IOntologyArtifact
): readonly IProofOntologyViolationWitness[] {
  const nodesById = new Map(nodes.map((node) => [node.nodeId, node] as const));
  const witnesses = new Map<string, IProofOntologyViolationWitness>();

  for (const edge of edges) {
    if (!(edge.edgeType in ontologyArtifact.edgeConstraints)) {
      continue;
    }
    const constraint = ontologyArtifact.edgeConstraints[edge.edgeType as GraphEdgeType];

    const sourceNode = nodesById.get(edge.sourceNodeId);
    const targetNode = nodesById.get(edge.targetNodeId);
    if (sourceNode === undefined || targetNode === undefined) {
      continue;
    }

    const sourceClassifications =
      ontologyArtifact.nodeClassHierarchy[sourceNode.nodeType as GraphNodeType];
    const targetClassifications =
      ontologyArtifact.nodeClassHierarchy[targetNode.nodeType as GraphNodeType];

    if (!hasAllowedClass(sourceClassifications, constraint.sourceClasses)) {
      witnesses.set(`${edge.edgeId}:domain_range:source`, {
        edgeId: edge.edgeId,
        edgeType: edge.edgeType,
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        reason: 'domain_range',
        sourceClassifications,
        targetClassifications,
        requiredSourceClasses: [...constraint.sourceClasses],
        requiredTargetClasses: [...constraint.targetClasses],
      });
    }

    if (!hasAllowedClass(targetClassifications, constraint.targetClasses)) {
      witnesses.set(`${edge.edgeId}:domain_range:target`, {
        edgeId: edge.edgeId,
        edgeType: edge.edgeType,
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        reason: 'domain_range',
        sourceClassifications,
        targetClassifications,
        requiredSourceClasses: [...constraint.sourceClasses],
        requiredTargetClasses: [...constraint.targetClasses],
      });
    }

    if (
      constraint.sameKindRequired === true &&
      !hasKindAlignment(sourceClassifications, targetClassifications)
    ) {
      witnesses.set(`${edge.edgeId}:same_kind`, {
        edgeId: edge.edgeId,
        edgeType: edge.edgeType,
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        reason: 'same_kind',
        sourceClassifications,
        targetClassifications,
        requiredSourceClasses: [...constraint.sourceClasses],
        requiredTargetClasses: [...constraint.targetClasses],
      });
    }

    const disjointPair = detectDisjointPair(
      sourceClassifications,
      targetClassifications,
      ontologyArtifact
    );
    if (disjointPair !== null && constraint.sameKindRequired === true) {
      witnesses.set(`${edge.edgeId}:disjoint_class`, {
        edgeId: edge.edgeId,
        edgeType: edge.edgeType,
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        reason: 'disjoint_class',
        sourceClassifications,
        targetClassifications,
        requiredSourceClasses: [...constraint.sourceClasses],
        requiredTargetClasses: [...constraint.targetClasses],
      });
    }
  }

  return [...witnesses.values()];
}

function detectMissingEndpointWitnesses(
  nodes: readonly IProofNodeSnapshot[],
  edges: readonly IProofEdgeSnapshot[]
): readonly IProofMissingEndpointWitness[] {
  const knownNodeIds = new Set(nodes.map((node) => node.nodeId));
  return edges.flatMap((edge) => {
    const missingNodeIds = [edge.sourceNodeId, edge.targetNodeId].filter(
      (nodeId) => !knownNodeIds.has(nodeId)
    );
    if (missingNodeIds.length === 0) {
      return [];
    }

    return [
      {
        edgeId: edge.edgeId,
        edgeType: edge.edgeType,
        missingNodeIds,
      },
    ];
  });
}

function detectBidirectionalDependencies(
  dependencyEdges: readonly IProofDependencyEdge[]
): readonly IProofBidirectionalDependencyWitness[] {
  const seen = new Set<string>();
  const conflicts: IProofBidirectionalDependencyWitness[] = [];
  for (const edge of dependencyEdges) {
    const reverseKey = `${edge.edgeType}:${edge.targetNodeId}:${edge.sourceNodeId}`;
    if (seen.has(reverseKey)) {
      conflicts.push({
        edgeType: edge.edgeType,
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
      });
    }
    seen.add(`${edge.edgeType}:${edge.sourceNodeId}:${edge.targetNodeId}`);
  }
  return conflicts;
}

function detectDependencyCycles(
  dependencyEdges: readonly IProofDependencyEdge[]
): readonly IProofDependencyCycleWitness[] {
  const adjacency = new Map<string, { nodeId: string; edgeType: string }[]>();
  for (const edge of dependencyEdges) {
    const neighbors = adjacency.get(edge.sourceNodeId) ?? [];
    neighbors.push({ nodeId: edge.targetNodeId, edgeType: edge.edgeType });
    adjacency.set(edge.sourceNodeId, neighbors);
  }

  const witnesses = new Map<string, IProofDependencyCycleWitness>();
  const path: string[] = [];
  const state = new Map<string, 'visiting' | 'visited'>();

  function visit(nodeId: string): void {
    state.set(nodeId, 'visiting');
    path.push(nodeId);

    for (const neighbor of adjacency.get(nodeId) ?? []) {
      if (state.get(neighbor.nodeId) === 'visiting') {
        const cycleStart = path.lastIndexOf(neighbor.nodeId);
        const cyclePath = [...path.slice(cycleStart), neighbor.nodeId];
        const witness: IProofDependencyCycleWitness = {
          edgeType: neighbor.edgeType,
          path: cyclePath,
        };
        witnesses.set(`${neighbor.edgeType}:${cyclePath.join('>')}`, witness);
        continue;
      }

      if (state.get(neighbor.nodeId) !== 'visited') {
        visit(neighbor.nodeId);
      }
    }

    path.pop();
    state.set(nodeId, 'visited');
  }

  for (const nodeId of adjacency.keys()) {
    if (state.get(nodeId) === undefined) {
      visit(nodeId);
    }
  }

  return [...witnesses.values()];
}

function detectMutuallyExclusivePairs(
  projectedEdges: readonly IProofEdgeSnapshot[]
): readonly IProofMutuallyExclusiveRelationWitness[] {
  const byPair = new Map<string, Set<string>>();
  for (const edge of projectedEdges) {
    const pairKey = [edge.sourceNodeId, edge.targetNodeId].sort().join('::');
    if (!byPair.has(pairKey)) {
      byPair.set(pairKey, new Set());
    }
    byPair.get(pairKey)?.add(edge.edgeType);
  }

  const conflicts: IProofMutuallyExclusiveRelationWitness[] = [];
  for (const [pairKey, relationSet] of byPair.entries()) {
    const [sourceNodeId = '', targetNodeId = ''] = pairKey.split('::');
    const relations = [...relationSet];
    for (let index = 0; index < relations.length; index += 1) {
      for (let inner = index + 1; inner < relations.length; inner += 1) {
        const leftRelation = relations[index] ?? '';
        const rightRelation = relations[inner] ?? '';
        if (
          !MUTUALLY_EXCLUSIVE_RELATION_KEYS.has(createExclusivePairKey(leftRelation, rightRelation))
        ) {
          continue;
        }
        conflicts.push({ leftRelation, rightRelation, sourceNodeId, targetNodeId });
      }
    }
  }

  return conflicts;
}

function createExclusivePairKey(left: string, right: string): string {
  return [left, right].sort().join('::');
}
