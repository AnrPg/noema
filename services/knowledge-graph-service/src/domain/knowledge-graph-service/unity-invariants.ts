import {
  GraphEdgeType,
  type EdgeId,
  type IGraphEdge,
  type Metadata,
  type NodeId,
} from '@noema/types';
import { z } from 'zod';

import type { IGraphRepository } from './graph.repository.js';
import type { ICkgMutation } from './mutation.repository.js';
import type {
  IValidationContext,
  IValidationStage,
  IValidationStageResult,
  IValidationViolation,
} from './validation.js';
import type { CkgMutationOperation } from './ckg-mutation-dsl.js';
import { CkgMutationOperationSchema, CkgOperationType } from './ckg-mutation-dsl.js';
import { TraversalOptions } from './value-objects/index.js';

interface IInvariantDefinition {
  readonly name: string;
  readonly description: string;
  readonly disposition: 'hard_block' | 'review';
}

interface IMutuallyExclusiveRelationPair {
  readonly left: GraphEdgeType;
  readonly right: GraphEdgeType;
  readonly reason: string;
}

interface IProjectedEdge {
  readonly edgeId: string;
  readonly sourceNodeId: NodeId;
  readonly targetNodeId: NodeId;
  readonly edgeType: GraphEdgeType;
}

const UNITY_INVARIANTS = Object.freeze({
  NO_CIRCULAR_PREREQUISITES: {
    name: 'no_circular_prerequisites',
    description: 'Projected prerequisite structure must remain a DAG.',
    disposition: 'hard_block',
  },
  NO_BIDIRECTIONAL_DEPENDENCY_PAIRS: {
    name: 'no_bidirectional_dependency_pairs',
    description: 'Directed dependency relations must not appear in both directions.',
    disposition: 'hard_block',
  },
  NO_MUTUALLY_EXCLUSIVE_RELATION_PAIRS: {
    name: 'no_mutually_exclusive_relation_pairs',
    description: 'Certain canonical relations cannot coexist on the same node pair.',
    disposition: 'hard_block',
  },
  NO_REQUIRED_STRUCTURE_LOSS_ON_MERGE: {
    name: 'no_required_structure_loss_on_merge',
    description: 'Merges must not erase required canonical structural edges.',
    disposition: 'hard_block',
  },
  NO_UNASSIGNED_REQUIRED_EDGES_ON_SPLIT: {
    name: 'no_unassigned_required_edges_on_split',
    description: 'Splits must explicitly preserve required structural edges.',
    disposition: 'hard_block',
  },
} satisfies Record<string, IInvariantDefinition>);

const DIRECTIONAL_DEPENDENCY_TYPES = [
  GraphEdgeType.PREREQUISITE,
  GraphEdgeType.DEPENDS_ON,
  GraphEdgeType.DERIVED_FROM,
  GraphEdgeType.SUBSKILL_OF,
  GraphEdgeType.HAS_SUBSKILL,
] as const;

const REQUIRED_STRUCTURAL_EDGE_TYPES = [
  GraphEdgeType.PREREQUISITE,
  GraphEdgeType.DEPENDS_ON,
  GraphEdgeType.DERIVED_FROM,
  GraphEdgeType.SUBSKILL_OF,
  GraphEdgeType.HAS_SUBSKILL,
  GraphEdgeType.ESSENTIAL_FOR_OCCUPATION,
  GraphEdgeType.OCCUPATION_REQUIRES_ESSENTIAL_SKILL,
  GraphEdgeType.OPTIONAL_FOR_OCCUPATION,
  GraphEdgeType.OCCUPATION_BENEFITS_FROM_OPTIONAL_SKILL,
] as const;

const MUTUALLY_EXCLUSIVE_RELATION_PAIRS: readonly IMutuallyExclusiveRelationPair[] = Object.freeze([
  {
    left: GraphEdgeType.PREREQUISITE,
    right: GraphEdgeType.EQUIVALENT_TO,
    reason: 'Equivalent concepts cannot simultaneously stand in a prerequisite relation.',
  },
  {
    left: GraphEdgeType.PREREQUISITE,
    right: GraphEdgeType.CONTRADICTS,
    reason: 'A concept cannot be both a prerequisite of and contradictory to the same target.',
  },
  {
    left: GraphEdgeType.DEPENDS_ON,
    right: GraphEdgeType.CONTRADICTS,
    reason: 'A node cannot depend on and contradict the same canonical target.',
  },
  {
    left: GraphEdgeType.DERIVED_FROM,
    right: GraphEdgeType.CONTRADICTS,
    reason: 'A node cannot be derived from and contradictory to the same canonical target.',
  },
  {
    left: GraphEdgeType.SUBSKILL_OF,
    right: GraphEdgeType.EQUIVALENT_TO,
    reason: 'A subskill cannot be equivalent to the parent skill it is nested under.',
  },
  {
    left: GraphEdgeType.HAS_SUBSKILL,
    right: GraphEdgeType.EQUIVALENT_TO,
    reason: 'A skill cannot both contain and be equivalent to the same skill.',
  },
]);

const MAX_INVARIANT_TRAVERSAL_DEPTH = 12;

export class UnityInvariantStage implements IValidationStage {
  readonly name = 'unity_invariants';
  readonly order = 260;

  constructor(private readonly graphRepository: IGraphRepository) {}

  async validate(
    mutation: ICkgMutation,
    context: IValidationContext
  ): Promise<IValidationStageResult> {
    const start = Date.now();
    const operations = parseOperations(mutation.operations);
    const violations: IValidationViolation[] = [];
    const edgeCache = new Map<string, readonly IGraphEdge[]>();

    violations.push(...(await this.validateProjectedPrerequisiteCycles(operations)));
    if (context.shortCircuitOnError && hasErrorViolation(violations)) {
      return buildStageResult(this.name, start, violations);
    }

    violations.push(...(await this.validateBidirectionalDependencies(operations, edgeCache)));
    if (context.shortCircuitOnError && hasErrorViolation(violations)) {
      return buildStageResult(this.name, start, violations);
    }

    violations.push(...(await this.validateMutuallyExclusivePairs(operations, edgeCache)));
    if (context.shortCircuitOnError && hasErrorViolation(violations)) {
      return buildStageResult(this.name, start, violations);
    }

    violations.push(...(await this.validateMergeStructureLoss(operations, edgeCache)));
    if (context.shortCircuitOnError && hasErrorViolation(violations)) {
      return buildStageResult(this.name, start, violations);
    }

    violations.push(...(await this.validateSplitRequiredEdges(operations, edgeCache)));
    return buildStageResult(this.name, start, violations);
  }

  private async validateProjectedPrerequisiteCycles(
    operations: readonly CkgMutationOperation[]
  ): Promise<readonly IValidationViolation[]> {
    const addedPrerequisites = operations
      .map((operation, index) => ({ operation, index }))
      .filter(
        (
          candidate
        ): candidate is {
          operation: Extract<CkgMutationOperation, { type: 'add_edge' }>;
          index: number;
        } =>
          candidate.operation.type === CkgOperationType.ADD_EDGE &&
          candidate.operation.edgeType === GraphEdgeType.PREREQUISITE
      );

    if (addedPrerequisites.length === 0) {
      return [];
    }

    const removedEdgeIds = new Set(
      operations
        .filter(
          (operation): operation is Extract<CkgMutationOperation, { type: 'remove_edge' }> =>
            operation.type === CkgOperationType.REMOVE_EDGE
        )
        .map((operation) => operation.edgeId as EdgeId)
    );

    const projectedEdges = new Map<string, IProjectedEdge>();
    for (const { operation } of addedPrerequisites) {
      const subgraph = await this.graphRepository.getSubgraph(
        operation.targetNodeId as NodeId,
        TraversalOptions.create({
          maxDepth: MAX_INVARIANT_TRAVERSAL_DEPTH,
          edgeTypes: [GraphEdgeType.PREREQUISITE],
          direction: 'both',
          includeProperties: false,
        })
      );

      for (const edge of subgraph.edges) {
        if (edge.edgeType !== GraphEdgeType.PREREQUISITE || removedEdgeIds.has(edge.edgeId)) {
          continue;
        }

        projectedEdges.set(edge.edgeId as string, {
          edgeId: edge.edgeId as string,
          sourceNodeId: edge.sourceNodeId,
          targetNodeId: edge.targetNodeId,
          edgeType: edge.edgeType,
        });
      }
    }

    for (const { operation, index } of addedPrerequisites) {
      projectedEdges.set(`planned:${String(index)}`, {
        edgeId: `planned:${String(index)}`,
        sourceNodeId: operation.sourceNodeId as NodeId,
        targetNodeId: operation.targetNodeId as NodeId,
        edgeType: GraphEdgeType.PREREQUISITE,
      });
    }

    const cyclePath = detectDirectedCycle([...projectedEdges.values()]);
    if (cyclePath === null) {
      return [];
    }

    return [
      createInvariantViolation(
        UNITY_INVARIANTS.NO_CIRCULAR_PREREQUISITES,
        `Projected prerequisite graph would contain a cycle: ${cyclePath.join(' -> ')}.`,
        addedPrerequisites[0]?.index ?? -1,
        {
          edgeType: GraphEdgeType.PREREQUISITE,
          cyclePath: [...cyclePath],
          offendingNodeIds: [...cyclePath],
          projectedEdgeCount: projectedEdges.size,
        }
      ),
    ];
  }

  private async validateBidirectionalDependencies(
    operations: readonly CkgMutationOperation[],
    edgeCache: Map<string, readonly IGraphEdge[]>
  ): Promise<readonly IValidationViolation[]> {
    const projectedEdges = await this.collectProjectedEdgesForTypes(
      operations,
      edgeCache,
      DIRECTIONAL_DEPENDENCY_TYPES
    );
    const violations: IValidationViolation[] = [];
    const seenPairs = new Set<string>();

    for (const edge of projectedEdges) {
      const reverseKey = `${edge.edgeType}:${edge.targetNodeId}:${edge.sourceNodeId}`;
      if (!seenPairs.has(reverseKey)) {
        seenPairs.add(`${edge.edgeType}:${edge.sourceNodeId}:${edge.targetNodeId}`);
        continue;
      }

      violations.push(
        createInvariantViolation(
          UNITY_INVARIANTS.NO_BIDIRECTIONAL_DEPENDENCY_PAIRS,
          `Dependency edge '${edge.edgeType}' appears in both directions between '${edge.sourceNodeId}' and '${edge.targetNodeId}'.`,
          findOperationIndexForEdge(operations, edge),
          {
            edgeType: edge.edgeType,
            offendingNodeIds: [edge.sourceNodeId, edge.targetNodeId],
            projectedPath: [edge.sourceNodeId, edge.targetNodeId, edge.sourceNodeId],
          }
        )
      );
    }

    return dedupeViolations(violations);
  }

  private async validateMutuallyExclusivePairs(
    operations: readonly CkgMutationOperation[],
    edgeCache: Map<string, readonly IGraphEdge[]>
  ): Promise<readonly IValidationViolation[]> {
    const edgeTypes = getUniqueEdgeTypes(MUTUALLY_EXCLUSIVE_RELATION_PAIRS);
    const projectedEdges = await this.collectProjectedEdgesForTypes(
      operations,
      edgeCache,
      edgeTypes
    );
    const pairMap = new Map<string, Set<GraphEdgeType>>();
    const violations: IValidationViolation[] = [];

    for (const edge of projectedEdges) {
      const pairKey = createUnorderedPairKey(edge.sourceNodeId, edge.targetNodeId);
      if (!pairMap.has(pairKey)) {
        pairMap.set(pairKey, new Set());
      }
      pairMap.get(pairKey)?.add(edge.edgeType);
    }

    for (const [pairKey, edgeTypesForPair] of pairMap.entries()) {
      for (const relationPair of MUTUALLY_EXCLUSIVE_RELATION_PAIRS) {
        if (!edgeTypesForPair.has(relationPair.left) || !edgeTypesForPair.has(relationPair.right)) {
          continue;
        }

        const [leftNodeId, rightNodeId] = pairKey.split('::') as [NodeId, NodeId];
        violations.push(
          createInvariantViolation(
            UNITY_INVARIANTS.NO_MUTUALLY_EXCLUSIVE_RELATION_PAIRS,
            `Projected canonical pair '${leftNodeId}' ↔ '${rightNodeId}' would carry mutually exclusive relations '${relationPair.left}' and '${relationPair.right}'. ${relationPair.reason}`,
            findOperationIndexForExclusivePair(operations, relationPair),
            {
              leftRelation: relationPair.left,
              rightRelation: relationPair.right,
              offendingNodeIds: [leftNodeId, rightNodeId],
              reason: relationPair.reason,
            }
          )
        );
      }
    }

    return dedupeViolations(violations);
  }

  private async validateMergeStructureLoss(
    operations: readonly CkgMutationOperation[],
    edgeCache: Map<string, readonly IGraphEdge[]>
  ): Promise<readonly IValidationViolation[]> {
    const violations: IValidationViolation[] = [];
    const mergeOperations = operations
      .map((operation, index) => ({ operation, index }))
      .filter(
        (
          candidate
        ): candidate is {
          operation: Extract<CkgMutationOperation, { type: 'merge_nodes' }>;
          index: number;
        } => candidate.operation.type === CkgOperationType.MERGE_NODES
      );

    for (const { operation, index } of mergeOperations) {
      const [sourceEdges, targetEdges] = await Promise.all([
        this.getEdgesForNodeCached(operation.sourceNodeId as NodeId, edgeCache),
        this.getEdgesForNodeCached(operation.targetNodeId as NodeId, edgeCache),
      ]);
      const requiredIncidentEdges = [...sourceEdges, ...targetEdges].filter((edge) =>
        REQUIRED_STRUCTURAL_EDGE_TYPES.includes(
          edge.edgeType as (typeof REQUIRED_STRUCTURAL_EDGE_TYPES)[number]
        )
      );
      const connectingEdges = requiredIncidentEdges.filter((edge) => {
        const nodeIds = [edge.sourceNodeId, edge.targetNodeId];
        return (
          nodeIds.includes(operation.sourceNodeId as NodeId) &&
          nodeIds.includes(operation.targetNodeId as NodeId)
        );
      });

      if (connectingEdges.length === 0) {
        const projectedEdges = projectRequiredEdgesAfterMerge(
          requiredIncidentEdges,
          operation.sourceNodeId as NodeId,
          operation.targetNodeId as NodeId
        );

        const selfLoopEdges = projectedEdges.filter(
          (edge) => edge.sourceNodeId === edge.targetNodeId
        );
        if (selfLoopEdges.length > 0) {
          violations.push(
            createInvariantViolation(
              UNITY_INVARIANTS.NO_REQUIRED_STRUCTURE_LOSS_ON_MERGE,
              `Merging '${operation.sourceNodeId}' into '${operation.targetNodeId}' would collapse required structural edges into self-loops.`,
              index,
              {
                sourceNodeId: operation.sourceNodeId,
                targetNodeId: operation.targetNodeId,
                offendingEdgeIds: selfLoopEdges.map((edge) => edge.edgeId),
                offendingEdgeTypes: selfLoopEdges.map((edge) => edge.edgeType),
                projectedSubgraph: selfLoopEdges.map((edge) => ({
                  edgeId: edge.edgeId,
                  edgeType: edge.edgeType,
                  sourceNodeId: edge.sourceNodeId,
                  targetNodeId: edge.targetNodeId,
                })),
              }
            )
          );
        }

        const bidirectionalConflict = findProjectedBidirectionalDependency(projectedEdges);
        if (bidirectionalConflict !== null) {
          violations.push(
            createInvariantViolation(
              UNITY_INVARIANTS.NO_REQUIRED_STRUCTURE_LOSS_ON_MERGE,
              `Merging '${operation.sourceNodeId}' into '${operation.targetNodeId}' would create a bidirectional dependency conflict with '${bidirectionalConflict.leftNodeId}' and '${bidirectionalConflict.rightNodeId}'.`,
              index,
              {
                sourceNodeId: operation.sourceNodeId,
                targetNodeId: operation.targetNodeId,
                offendingNodeIds: [
                  bidirectionalConflict.leftNodeId,
                  bidirectionalConflict.rightNodeId,
                ],
                offendingEdgeType: bidirectionalConflict.edgeType,
                projectedPath: [
                  bidirectionalConflict.leftNodeId,
                  bidirectionalConflict.rightNodeId,
                  bidirectionalConflict.leftNodeId,
                ],
              }
            )
          );
        }

        const exclusiveConflict = findProjectedExclusivePair(projectedEdges);
        if (exclusiveConflict !== null) {
          violations.push(
            createInvariantViolation(
              UNITY_INVARIANTS.NO_REQUIRED_STRUCTURE_LOSS_ON_MERGE,
              `Merging '${operation.sourceNodeId}' into '${operation.targetNodeId}' would collapse distinct structural relations into the mutually exclusive pair '${exclusiveConflict.leftRelation}' and '${exclusiveConflict.rightRelation}'.`,
              index,
              {
                sourceNodeId: operation.sourceNodeId,
                targetNodeId: operation.targetNodeId,
                offendingNodeIds: [exclusiveConflict.leftNodeId, exclusiveConflict.rightNodeId],
                leftRelation: exclusiveConflict.leftRelation,
                rightRelation: exclusiveConflict.rightRelation,
              }
            )
          );
        }

        continue;
      }

      violations.push(
        createInvariantViolation(
          UNITY_INVARIANTS.NO_REQUIRED_STRUCTURE_LOSS_ON_MERGE,
          `Merging '${operation.sourceNodeId}' into '${operation.targetNodeId}' would erase required structural edges between the two canonical nodes.`,
          index,
          {
            sourceNodeId: operation.sourceNodeId,
            targetNodeId: operation.targetNodeId,
            offendingEdgeIds: connectingEdges.map((edge) => edge.edgeId),
            offendingEdgeTypes: connectingEdges.map((edge) => edge.edgeType),
          }
        )
      );
    }

    return violations;
  }

  private async validateSplitRequiredEdges(
    operations: readonly CkgMutationOperation[],
    edgeCache: Map<string, readonly IGraphEdge[]>
  ): Promise<readonly IValidationViolation[]> {
    const violations: IValidationViolation[] = [];
    const splitOperations = operations
      .map((operation, index) => ({ operation, index }))
      .filter(
        (
          candidate
        ): candidate is {
          operation: Extract<CkgMutationOperation, { type: 'split_node' }>;
          index: number;
        } => candidate.operation.type === CkgOperationType.SPLIT_NODE
      );

    for (const { operation, index } of splitOperations) {
      const existingEdges = await this.getEdgesForNodeCached(operation.nodeId as NodeId, edgeCache);
      const requiredEdges = existingEdges.filter((edge) =>
        REQUIRED_STRUCTURAL_EDGE_TYPES.includes(
          edge.edgeType as (typeof REQUIRED_STRUCTURAL_EDGE_TYPES)[number]
        )
      );
      const reassignedEdgeIds = new Set(operation.edgeReassignmentRules.map((rule) => rule.edgeId));
      const unassignedRequiredEdges = requiredEdges.filter(
        (edge) => !reassignedEdgeIds.has(edge.edgeId as string)
      );

      if (unassignedRequiredEdges.length === 0) {
        continue;
      }

      violations.push(
        createInvariantViolation(
          UNITY_INVARIANTS.NO_UNASSIGNED_REQUIRED_EDGES_ON_SPLIT,
          `Split of '${operation.nodeId}' leaves required canonical edges unassigned. Every structural dependency edge must be explicitly preserved.`,
          index,
          {
            nodeId: operation.nodeId,
            offendingEdgeIds: unassignedRequiredEdges.map((edge) => edge.edgeId),
            offendingEdgeTypes: unassignedRequiredEdges.map((edge) => edge.edgeType),
            projectedTargets: ['newNodeA', 'newNodeB'],
          }
        )
      );
    }

    return violations;
  }

  private async collectProjectedEdgesForTypes(
    operations: readonly CkgMutationOperation[],
    edgeCache: Map<string, readonly IGraphEdge[]>,
    edgeTypes: readonly GraphEdgeType[]
  ): Promise<readonly IProjectedEdge[]> {
    const touchedNodeIds = collectTouchedNodeIds(operations);
    const removedEdgeIds = new Set(
      operations
        .filter(
          (operation): operation is Extract<CkgMutationOperation, { type: 'remove_edge' }> =>
            operation.type === CkgOperationType.REMOVE_EDGE
        )
        .map((operation) => operation.edgeId as EdgeId)
    );
    const projectedEdges = new Map<string, IProjectedEdge>();

    for (const nodeId of touchedNodeIds) {
      const edges = await this.getEdgesForNodeCached(nodeId, edgeCache);
      for (const edge of edges) {
        if (removedEdgeIds.has(edge.edgeId) || !edgeTypes.includes(edge.edgeType)) {
          continue;
        }

        projectedEdges.set(edge.edgeId as string, {
          edgeId: edge.edgeId as string,
          sourceNodeId: edge.sourceNodeId,
          targetNodeId: edge.targetNodeId,
          edgeType: edge.edgeType,
        });
      }
    }

    operations.forEach((operation, index) => {
      if (operation.type !== CkgOperationType.ADD_EDGE || !edgeTypes.includes(operation.edgeType)) {
        return;
      }

      projectedEdges.set(`planned:${String(index)}`, {
        edgeId: `planned:${String(index)}`,
        sourceNodeId: operation.sourceNodeId as NodeId,
        targetNodeId: operation.targetNodeId as NodeId,
        edgeType: operation.edgeType,
      });
    });

    return [...projectedEdges.values()];
  }

  private async getEdgesForNodeCached(
    nodeId: NodeId,
    edgeCache: Map<string, readonly IGraphEdge[]>
  ): Promise<readonly IGraphEdge[]> {
    const cacheKey = nodeId as string;
    if (!edgeCache.has(cacheKey)) {
      edgeCache.set(cacheKey, await this.graphRepository.getEdgesForNode(nodeId, 'both'));
    }
    return edgeCache.get(cacheKey) ?? [];
  }
}

function parseOperations(raw: Metadata[]): CkgMutationOperation[] {
  return z.array(CkgMutationOperationSchema).parse(raw) as CkgMutationOperation[];
}

function buildStageResult(
  stageName: string,
  start: number,
  violations: readonly IValidationViolation[]
): IValidationStageResult {
  const hasErrors = violations.some((violation) => violation.severity === 'error');
  return {
    stageName,
    passed: !hasErrors,
    details: hasErrors
      ? `UNITY invariant validation failed with ${String(violations.length)} violation(s)`
      : 'UNITY invariant validation passed',
    violations,
    duration: Date.now() - start,
  };
}

function createInvariantViolation(
  invariant: IInvariantDefinition,
  message: string,
  affectedOperationIndex: number,
  metadata: Metadata
): IValidationViolation {
  return {
    code: 'UNITY_INVARIANT_VIOLATION',
    message,
    severity: 'error',
    affectedOperationIndex,
    metadata: {
      invariantName: invariant.name,
      invariantDescription: invariant.description,
      escalationDisposition: invariant.disposition,
      ...metadata,
    },
  };
}

function collectTouchedNodeIds(operations: readonly CkgMutationOperation[]): readonly NodeId[] {
  const nodeIds = new Set<NodeId>();

  for (const operation of operations) {
    switch (operation.type) {
      case CkgOperationType.ADD_EDGE:
        nodeIds.add(operation.sourceNodeId as NodeId);
        nodeIds.add(operation.targetNodeId as NodeId);
        break;
      case CkgOperationType.UPDATE_NODE:
      case CkgOperationType.REMOVE_NODE:
      case CkgOperationType.SPLIT_NODE:
        nodeIds.add(operation.nodeId as NodeId);
        break;
      case CkgOperationType.MERGE_NODES:
        nodeIds.add(operation.sourceNodeId as NodeId);
        nodeIds.add(operation.targetNodeId as NodeId);
        break;
      default:
        break;
    }
  }

  return [...nodeIds];
}

function detectDirectedCycle(edges: readonly IProjectedEdge[]): readonly NodeId[] | null {
  const adjacency = new Map<NodeId, NodeId[]>();
  for (const edge of edges) {
    const current = adjacency.get(edge.sourceNodeId) ?? [];
    current.push(edge.targetNodeId);
    adjacency.set(edge.sourceNodeId, current);
  }

  const visited = new Set<NodeId>();
  const inStack = new Set<NodeId>();
  const stack: NodeId[] = [];

  const visit = (nodeId: NodeId): readonly NodeId[] | null => {
    visited.add(nodeId);
    inStack.add(nodeId);
    stack.push(nodeId);

    const neighbors = adjacency.get(nodeId) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        const path = visit(neighbor);
        if (path !== null) {
          return path;
        }
        continue;
      }

      if (inStack.has(neighbor)) {
        const cycleStart = stack.indexOf(neighbor);
        return [...stack.slice(cycleStart), neighbor];
      }
    }

    stack.pop();
    inStack.delete(nodeId);
    return null;
  };

  for (const nodeId of adjacency.keys()) {
    if (visited.has(nodeId)) {
      continue;
    }

    const cycle = visit(nodeId);
    if (cycle !== null) {
      return cycle;
    }
  }

  return null;
}

function getUniqueEdgeTypes(
  relationPairs: readonly IMutuallyExclusiveRelationPair[]
): readonly GraphEdgeType[] {
  const edgeTypes = new Set<GraphEdgeType>();
  for (const pair of relationPairs) {
    edgeTypes.add(pair.left);
    edgeTypes.add(pair.right);
  }
  return [...edgeTypes];
}

function createUnorderedPairKey(leftNodeId: NodeId, rightNodeId: NodeId): string {
  return [leftNodeId, rightNodeId].sort().join('::');
}

function projectRequiredEdgesAfterMerge(
  edges: readonly IGraphEdge[],
  sourceNodeId: NodeId,
  targetNodeId: NodeId
): IProjectedEdge[] {
  const projected = new Map<string, IProjectedEdge>();

  for (const edge of edges) {
    projected.set(edge.edgeId as string, {
      edgeId: edge.edgeId as string,
      sourceNodeId: edge.sourceNodeId === sourceNodeId ? targetNodeId : edge.sourceNodeId,
      targetNodeId: edge.targetNodeId === sourceNodeId ? targetNodeId : edge.targetNodeId,
      edgeType: edge.edgeType,
    });
  }

  return [...projected.values()];
}

function findProjectedBidirectionalDependency(edges: readonly IProjectedEdge[]): {
  leftNodeId: NodeId;
  rightNodeId: NodeId;
  edgeType: GraphEdgeType;
} | null {
  const seenPairs = new Set<string>();

  for (const edge of edges) {
    if (
      !DIRECTIONAL_DEPENDENCY_TYPES.includes(
        edge.edgeType as (typeof DIRECTIONAL_DEPENDENCY_TYPES)[number]
      )
    ) {
      continue;
    }

    const reverseKey = `${edge.edgeType}:${edge.targetNodeId}:${edge.sourceNodeId}`;
    if (seenPairs.has(reverseKey)) {
      return {
        leftNodeId: edge.sourceNodeId,
        rightNodeId: edge.targetNodeId,
        edgeType: edge.edgeType,
      };
    }

    seenPairs.add(`${edge.edgeType}:${edge.sourceNodeId}:${edge.targetNodeId}`);
  }

  return null;
}

function findProjectedExclusivePair(edges: readonly IProjectedEdge[]): {
  leftNodeId: NodeId;
  rightNodeId: NodeId;
  leftRelation: GraphEdgeType;
  rightRelation: GraphEdgeType;
} | null {
  const pairMap = new Map<string, Set<GraphEdgeType>>();

  for (const edge of edges) {
    const pairKey = createUnorderedPairKey(edge.sourceNodeId, edge.targetNodeId);
    if (!pairMap.has(pairKey)) {
      pairMap.set(pairKey, new Set());
    }
    pairMap.get(pairKey)?.add(edge.edgeType);
  }

  for (const [pairKey, edgeTypesForPair] of pairMap.entries()) {
    for (const relationPair of MUTUALLY_EXCLUSIVE_RELATION_PAIRS) {
      if (!edgeTypesForPair.has(relationPair.left) || !edgeTypesForPair.has(relationPair.right)) {
        continue;
      }

      const [leftNodeId, rightNodeId] = pairKey.split('::') as [NodeId, NodeId];
      return {
        leftNodeId,
        rightNodeId,
        leftRelation: relationPair.left,
        rightRelation: relationPair.right,
      };
    }
  }

  return null;
}

function findOperationIndexForEdge(
  operations: readonly CkgMutationOperation[],
  edge: IProjectedEdge
): number {
  return operations.findIndex(
    (operation) =>
      operation.type === CkgOperationType.ADD_EDGE &&
      operation.edgeType === edge.edgeType &&
      operation.sourceNodeId === edge.sourceNodeId &&
      operation.targetNodeId === edge.targetNodeId
  );
}

function findOperationIndexForExclusivePair(
  operations: readonly CkgMutationOperation[],
  pair: IMutuallyExclusiveRelationPair
): number {
  return operations.findIndex(
    (operation) =>
      operation.type === CkgOperationType.ADD_EDGE &&
      (operation.edgeType === pair.left || operation.edgeType === pair.right)
  );
}

function dedupeViolations(
  violations: readonly IValidationViolation[]
): readonly IValidationViolation[] {
  const seen = new Set<string>();
  const deduped: IValidationViolation[] = [];

  for (const violation of violations) {
    const key = JSON.stringify([
      violation.code,
      violation.message,
      violation.affectedOperationIndex,
      violation.metadata['invariantName'],
    ]);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(violation);
  }

  return deduped;
}

function hasErrorViolation(violations: readonly IValidationViolation[]): boolean {
  return violations.some((violation) => violation.severity === 'error');
}

export type { IInvariantDefinition };
