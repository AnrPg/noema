import { type CkgNodeStatus, GraphEdgeType, type IGraphNode, type NodeId } from '@noema/types';

import {
  type IAddEdgeOperation,
  type IMutationProposal,
  CkgOperationType,
} from '../../../domain/knowledge-graph-service/ckg-mutation-dsl.js';
import { NodeNotFoundError } from '../../../domain/knowledge-graph-service/errors/graph.errors.js';
import type { IGraphRepository } from '../../../domain/knowledge-graph-service/graph.repository.js';
import { getEdgePolicy } from '../../../domain/knowledge-graph-service/policies/edge-type-policies.js';
import type { ITraversalOptions } from '../../../domain/knowledge-graph-service/value-objects/graph.value-objects.js';
import type {
  ICkgEdgeAuthoringBlockedReason,
  ICkgEdgeAuthoringNodeSummary,
  ICkgEdgeAuthoringOption,
  ICkgEdgeAuthoringPreview,
  ICkgEdgeAuthoringPreviewRequest,
  ICkgEdgeAuthoringService,
} from './contracts.js';

const ACYCLICITY_TRAVERSAL_OPTIONS: ITraversalOptions = {
  direction: 'outbound',
  includeProperties: false,
  maxDepth: 50,
};

const BLOCKED_NODE_STATUSES = new Set<CkgNodeStatus>(['deprecated', 'merged', 'split']);
const INVERSE_EQUIVALENT_EDGE_TYPES = new Map<GraphEdgeType, readonly GraphEdgeType[]>([
  [GraphEdgeType.SUBSKILL_OF, [GraphEdgeType.HAS_SUBSKILL]],
  [GraphEdgeType.HAS_SUBSKILL, [GraphEdgeType.SUBSKILL_OF]],
  [GraphEdgeType.ESSENTIAL_FOR_OCCUPATION, [GraphEdgeType.OCCUPATION_REQUIRES_ESSENTIAL_SKILL]],
  [GraphEdgeType.OCCUPATION_REQUIRES_ESSENTIAL_SKILL, [GraphEdgeType.ESSENTIAL_FOR_OCCUPATION]],
  [GraphEdgeType.OPTIONAL_FOR_OCCUPATION, [GraphEdgeType.OCCUPATION_BENEFITS_FROM_OPTIONAL_SKILL]],
  [GraphEdgeType.OCCUPATION_BENEFITS_FROM_OPTIONAL_SKILL, [GraphEdgeType.OPTIONAL_FOR_OCCUPATION]],
]);

export class CkgEdgeAuthoringService implements ICkgEdgeAuthoringService {
  constructor(private readonly graphRepository: IGraphRepository) {}

  async preview(input: ICkgEdgeAuthoringPreviewRequest): Promise<ICkgEdgeAuthoringPreview> {
    const [sourceNode, targetNode] = await Promise.all([
      this.graphRepository.getNode(input.sourceNodeId),
      this.graphRepository.getNode(input.targetNodeId),
    ]);

    if (sourceNode === null) {
      throw new NodeNotFoundError(input.sourceNodeId, 'ckg');
    }
    if (targetNode === null) {
      throw new NodeNotFoundError(input.targetNodeId, 'ckg');
    }

    const options = await Promise.all(
      (Object.values(GraphEdgeType) as GraphEdgeType[]).map(async (edgeType) =>
        this.buildOption(sourceNode, targetNode, edgeType)
      )
    );
    const warnings = buildWarnings(sourceNode, targetNode, options);
    const selectedEdgeType =
      input.edgeType !== undefined
        ? options.find((option) => option.edgeType === input.edgeType)
        : undefined;
    const selectedEdgeTypeEnabled = selectedEdgeType?.enabled ?? false;
    const proposal =
      selectedEdgeTypeEnabled && selectedEdgeType !== undefined
        ? buildProposal(sourceNode.nodeId, targetNode.nodeId, selectedEdgeType, input.rationale)
        : null;

    return {
      source: toNodeSummary(sourceNode),
      target: toNodeSummary(targetNode),
      options,
      warnings,
      proposal,
    };
  }

  private async buildOption(
    sourceNode: IGraphNode,
    targetNode: IGraphNode,
    edgeType: GraphEdgeType
  ): Promise<ICkgEdgeAuthoringOption> {
    const policy = getEdgePolicy(edgeType);
    const blockedReasons: ICkgEdgeAuthoringBlockedReason[] = [];
    const existingEdges = await this.graphRepository.findEdges(
      {
        edgeType,
        sourceNodeId: sourceNode.nodeId,
        targetNodeId: targetNode.nodeId,
      },
      20,
      0
    );

    if (!policy.allowedSourceTypes.includes(sourceNode.nodeType)) {
      blockedReasons.push({
        code: 'invalid_source_type',
        message: `${sourceNode.nodeType} cannot be the source of ${edgeType}.`,
      });
    }

    if (!policy.allowedTargetTypes.includes(targetNode.nodeType)) {
      blockedReasons.push({
        code: 'invalid_target_type',
        message: `${targetNode.nodeType} cannot be the target of ${edgeType}.`,
      });
    }

    if (sourceNode.nodeId === targetNode.nodeId) {
      blockedReasons.push({
        code: 'self_reference',
        message: `${edgeType} cannot connect a node to itself.`,
      });
    }

    if (isStatusBlocked(sourceNode.status) || isStatusBlocked(targetNode.status)) {
      blockedReasons.push({
        code: 'status_blocked',
        message: 'Merged, split, and deprecated nodes cannot be used for new canonical relations.',
      });
    }

    if (existingEdges.length > 0) {
      blockedReasons.push({
        code: 'duplicate_edge',
        message: 'This exact relation already exists between the selected nodes.',
      });
    }

    if (policy.isSymmetric) {
      const reverseEdges = await this.graphRepository.findEdges(
        {
          edgeType,
          sourceNodeId: targetNode.nodeId,
          targetNodeId: sourceNode.nodeId,
        },
        20,
        0
      );

      if (reverseEdges.length > 0) {
        blockedReasons.push({
          code: 'duplicate_symmetric_edge',
          message: 'A symmetric version of this relation already exists in the opposite direction.',
        });
        existingEdges.push(...reverseEdges);
      }
    }

    const inverseEquivalentTypes = INVERSE_EQUIVALENT_EDGE_TYPES.get(edgeType) ?? [];
    if (inverseEquivalentTypes.length > 0) {
      const inverseEdges = await this.graphRepository.findConflictingEdges(
        sourceNode.nodeId,
        targetNode.nodeId,
        inverseEquivalentTypes
      );

      if (inverseEdges.length > 0) {
        blockedReasons.push({
          code: 'inverse_edge_exists',
          message:
            'An inverse-equivalent relation already exists for this node pair. Keep only one canonical direction for the same fact.',
        });
        existingEdges.push(...inverseEdges);
      }
    }

    if (
      policy.requiresAcyclicity &&
      blockedReasons.every((reason) => reason.code !== 'invalid_source_type') &&
      blockedReasons.every((reason) => reason.code !== 'invalid_target_type') &&
      blockedReasons.every((reason) => reason.code !== 'self_reference')
    ) {
      const descendantTraversal: ITraversalOptions = {
        ...ACYCLICITY_TRAVERSAL_OPTIONS,
        edgeTypes: [edgeType],
      };
      const descendants = await this.graphRepository.getDescendants(
        targetNode.nodeId,
        descendantTraversal
      );
      if (descendants.some((descendant) => descendant.nodeId === sourceNode.nodeId)) {
        blockedReasons.push({
          code: 'acyclicity_risk',
          message: 'This relation would introduce a directed cycle for an acyclic edge type.',
        });
      }
    }

    return {
      edgeType,
      category: policy.category,
      description: policy.description,
      defaultWeight: policy.defaultWeight,
      enabled: blockedReasons.length === 0,
      blockedReasons,
      existingEdgeIds: [...new Set(existingEdges.map((edge) => edge.edgeId as string))],
      isSymmetric: policy.isSymmetric,
      requiresAcyclicity: policy.requiresAcyclicity,
    };
  }
}

function buildProposal(
  sourceNodeId: NodeId,
  targetNodeId: NodeId,
  option: ICkgEdgeAuthoringOption,
  rationale: string | undefined
): IMutationProposal {
  const trimmedRationale = rationale?.trim();
  const normalizedRationale =
    trimmedRationale !== undefined && trimmedRationale !== ''
      ? trimmedRationale
      : `Create ${option.edgeType} relation.`;

  const operation: IAddEdgeOperation = {
    type: CkgOperationType.ADD_EDGE,
    edgeType: option.edgeType,
    sourceNodeId: sourceNodeId as string,
    targetNodeId: targetNodeId as string,
    weight: option.defaultWeight,
    rationale: normalizedRationale,
  };

  return {
    operations: [operation],
    rationale: normalizedRationale,
    evidenceCount: 0,
    priority: 0,
  };
}

function toNodeSummary(node: IGraphNode): ICkgEdgeAuthoringNodeSummary {
  return {
    nodeId: node.nodeId,
    label: node.label,
    nodeType: node.nodeType,
    domain: node.domain,
    status: node.status ?? null,
  };
}

function isStatusBlocked(status: IGraphNode['status']): boolean {
  return status !== undefined && BLOCKED_NODE_STATUSES.has(status);
}

function buildWarnings(
  sourceNode: IGraphNode,
  targetNode: IGraphNode,
  options: ICkgEdgeAuthoringOption[]
): string[] {
  const warnings: string[] = [];

  if (
    sourceNode.domain !== '' &&
    targetNode.domain !== '' &&
    sourceNode.domain !== targetNode.domain
  ) {
    warnings.push(
      `The selected nodes come from different domains (${sourceNode.domain} and ${targetNode.domain}).`
    );
  }

  if (options.every((option) => !option.enabled)) {
    warnings.push('No canonical relation types are currently valid for this node pair.');
  }

  return warnings;
}
