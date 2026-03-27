import type { GraphEdgeType, GraphNodeType, IGraphEdge, IGraphNode, NodeId } from '@noema/types';

import {
  type IMutationProposal,
  CkgOperationType,
  type IRemoveNodeOperation,
  type IUpdateNodeOperation,
} from '../../../domain/knowledge-graph-service/ckg-mutation-dsl.js';
import { NodeNotFoundError } from '../../../domain/knowledge-graph-service/errors/graph.errors.js';
import type { IGraphRepository } from '../../../domain/knowledge-graph-service/graph.repository.js';
import { getEdgePolicy } from '../../../domain/knowledge-graph-service/policies/edge-type-policies.js';
import type { ICkgEdgeAuthoringNodeSummary } from '../edge-authoring/contracts.js';
import type {
  ICkgNodeBatchAuthoringConflict,
  ICkgNodeBatchAuthoringPreview,
  ICkgNodeBatchAuthoringPreviewRequest,
  ICkgNodeBatchAuthoringService,
  ICkgNodeBatchUpdateInput,
} from './contracts.js';

export class CkgNodeBatchAuthoringService implements ICkgNodeBatchAuthoringService {
  constructor(private readonly graphRepository: IGraphRepository) {}

  async preview(
    input: ICkgNodeBatchAuthoringPreviewRequest
  ): Promise<ICkgNodeBatchAuthoringPreview> {
    const uniqueNodeIds = [...new Set(input.nodeIds)];
    const nodes = await Promise.all(
      uniqueNodeIds.map(async (nodeId) => {
        const node = await this.graphRepository.getNode(nodeId);
        if (node === null) {
          throw new NodeNotFoundError(nodeId, 'ckg');
        }
        return node;
      })
    );

    const nodeMap = new Map(nodes.map((node) => [node.nodeId, node]));
    const nodeSummaries = nodes.map(toNodeSummary);
    const attachedEdges = await collectUniqueEdges(this.graphRepository, uniqueNodeIds);
    const warnings: string[] = [];

    if (input.action === 'delete') {
      if (attachedEdges.length > 0) {
        warnings.push(
          `Deleting ${String(nodes.length)} node(s) will also soft-delete ${String(
            attachedEdges.length
          )} connected edge(s) automatically when the mutation is committed.`
        );
      }

      return {
        action: input.action,
        nodes: nodeSummaries,
        updates: null,
        canProceed: true,
        affectedEdgeCount: attachedEdges.length,
        warnings,
        conflicts: [],
        proposal: buildDeleteProposal(nodes, attachedEdges.length, input.rationale),
      };
    }

    const normalizedUpdates = normalizeUpdates(input.updates);
    if (normalizedUpdates === null) {
      warnings.push('Choose at least one batch update before previewing a mutation proposal.');
      return {
        action: input.action,
        nodes: nodeSummaries,
        updates: null,
        canProceed: false,
        affectedEdgeCount: attachedEdges.length,
        warnings,
        conflicts: [],
        proposal: null,
      };
    }

    const conflicts =
      normalizedUpdates.nodeType !== undefined
        ? await this.detectRetypingConflicts(
            nodes,
            attachedEdges,
            normalizedUpdates.nodeType,
            nodeMap
          )
        : [];

    if (normalizedUpdates.nodeType !== undefined && conflicts.length === 0) {
      warnings.push(
        `Validated ${String(attachedEdges.length)} connected edge(s) against the requested node type "${normalizedUpdates.nodeType}".`
      );
    }

    if (conflicts.length > 0) {
      warnings.push(
        'The requested node-type change cannot proceed until the conflicting edges are removed or the new type is changed.'
      );
    }

    return {
      action: input.action,
      nodes: nodeSummaries,
      updates: normalizedUpdates,
      canProceed: conflicts.length === 0,
      affectedEdgeCount: attachedEdges.length,
      warnings,
      conflicts,
      proposal:
        conflicts.length === 0
          ? buildUpdateProposal(nodes, normalizedUpdates, input.rationale)
          : null,
    };
  }

  private async detectRetypingConflicts(
    selectedNodes: IGraphNode[],
    attachedEdges: IGraphEdge[],
    nextNodeType: GraphNodeType,
    initialNodeMap: Map<NodeId, IGraphNode>
  ): Promise<ICkgNodeBatchAuthoringConflict[]> {
    const selectedNodeIds = new Set(selectedNodes.map((node) => node.nodeId));
    const nodeMap = new Map(initialNodeMap);
    const conflicts: ICkgNodeBatchAuthoringConflict[] = [];

    for (const edge of attachedEdges) {
      const sourceNode = await this.getOrLoadNode(nodeMap, edge.sourceNodeId);
      const targetNode = await this.getOrLoadNode(nodeMap, edge.targetNodeId);
      if (sourceNode === null || targetNode === null) {
        continue;
      }

      const prospectiveSourceType = selectedNodeIds.has(sourceNode.nodeId)
        ? nextNodeType
        : sourceNode.nodeType;
      const prospectiveTargetType = selectedNodeIds.has(targetNode.nodeId)
        ? nextNodeType
        : targetNode.nodeType;
      const policy = getEdgePolicy(edge.edgeType);

      if (
        selectedNodeIds.has(sourceNode.nodeId) &&
        !policy.allowedSourceTypes.includes(prospectiveSourceType)
      ) {
        conflicts.push(
          buildRetypingConflict({
            node: sourceNode,
            role: 'source',
            otherNode: targetNode,
            edgeId: edge.edgeId as string,
            edgeType: edge.edgeType,
            nextNodeType,
            allowedTypes: policy.allowedSourceTypes,
          })
        );
      }

      if (
        selectedNodeIds.has(targetNode.nodeId) &&
        !policy.allowedTargetTypes.includes(prospectiveTargetType)
      ) {
        conflicts.push(
          buildRetypingConflict({
            node: targetNode,
            role: 'target',
            otherNode: sourceNode,
            edgeId: edge.edgeId as string,
            edgeType: edge.edgeType,
            nextNodeType,
            allowedTypes: policy.allowedTargetTypes,
          })
        );
      }
    }

    return dedupeConflicts(conflicts);
  }

  private async getOrLoadNode(
    nodeMap: Map<NodeId, IGraphNode>,
    nodeId: NodeId
  ): Promise<IGraphNode | null> {
    const cached = nodeMap.get(nodeId);
    if (cached !== undefined) {
      return cached;
    }

    const node = await this.graphRepository.getNode(nodeId);
    if (node !== null) {
      nodeMap.set(nodeId, node);
    }
    return node;
  }
}

async function collectUniqueEdges(
  graphRepository: IGraphRepository,
  nodeIds: NodeId[]
): Promise<IGraphEdge[]> {
  const edgeGroups = await Promise.all(
    nodeIds.map((nodeId) => graphRepository.getEdgesForNode(nodeId, 'both'))
  );
  const uniqueEdges = new Map<string, IGraphEdge>();

  for (const group of edgeGroups) {
    for (const edge of group) {
      uniqueEdges.set(edge.edgeId as string, edge);
    }
  }

  return [...uniqueEdges.values()];
}

function normalizeUpdates(
  updates: ICkgNodeBatchUpdateInput | undefined
): ICkgNodeBatchUpdateInput | null {
  if (updates === undefined) {
    return null;
  }

  const normalized: ICkgNodeBatchUpdateInput = {};

  if (updates.nodeType !== undefined) {
    normalized.nodeType = updates.nodeType;
  }
  if (updates.domain !== undefined && updates.domain.trim() !== '') {
    normalized.domain = updates.domain.trim();
  }
  if (updates.tags !== undefined) {
    normalized.tags = [
      ...new Set(updates.tags.map((tag) => tag.trim()).filter((tag) => tag !== '')),
    ];
  }

  return Object.keys(normalized).length === 0 ? null : normalized;
}

function buildDeleteProposal(
  nodes: IGraphNode[],
  affectedEdgeCount: number,
  rationale: string | undefined
): IMutationProposal {
  const firstNode = nodes[0];
  const firstNodeLabel =
    firstNode !== undefined
      ? firstNode.label !== ''
        ? firstNode.label
        : String(firstNode.nodeId)
      : 'selected node';
  const defaultRationale =
    nodes.length === 1
      ? `Delete canonical node "${firstNodeLabel}" and automatically remove its connected edges (${String(affectedEdgeCount)}).`
      : `Delete ${String(nodes.length)} canonical nodes and automatically remove ${String(affectedEdgeCount)} connected edges.`;

  const trimmedRationale = rationale?.trim();
  const mutationRationale =
    trimmedRationale !== undefined && trimmedRationale !== '' ? trimmedRationale : defaultRationale;

  return {
    operations: nodes.map<IRemoveNodeOperation>((node) => ({
      type: CkgOperationType.REMOVE_NODE,
      nodeId: node.nodeId,
      rationale: mutationRationale,
    })),
    rationale: mutationRationale,
    evidenceCount: 0,
    priority: 0,
  };
}

function buildUpdateProposal(
  nodes: IGraphNode[],
  updates: ICkgNodeBatchUpdateInput,
  rationale: string | undefined
): IMutationProposal {
  const firstNode = nodes[0];
  const firstNodeLabel =
    firstNode !== undefined
      ? firstNode.label !== ''
        ? firstNode.label
        : String(firstNode.nodeId)
      : 'selected node';
  const updateFragments = [
    updates.nodeType !== undefined ? `type → ${updates.nodeType}` : null,
    updates.domain !== undefined ? `domain → ${updates.domain}` : null,
    updates.tags !== undefined ? `tags → ${updates.tags.join(', ')}` : null,
  ].filter((entry): entry is string => entry !== null);

  const defaultRationale =
    nodes.length === 1
      ? `Update canonical node "${firstNodeLabel}" (${updateFragments.join('; ')}).`
      : `Batch-update ${String(nodes.length)} canonical nodes (${updateFragments.join('; ')}).`;

  const trimmedRationale = rationale?.trim();
  const mutationRationale =
    trimmedRationale !== undefined && trimmedRationale !== '' ? trimmedRationale : defaultRationale;

  return {
    operations: nodes.map<IUpdateNodeOperation>((node) => ({
      type: CkgOperationType.UPDATE_NODE,
      nodeId: node.nodeId,
      updates,
      rationale: mutationRationale,
    })),
    rationale: mutationRationale,
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

function buildRetypingConflict(input: {
  node: IGraphNode;
  role: 'source' | 'target';
  otherNode: IGraphNode;
  edgeId: string;
  edgeType: GraphEdgeType;
  nextNodeType: GraphNodeType;
  allowedTypes: readonly GraphNodeType[];
}): ICkgNodeBatchAuthoringConflict {
  const compatibleSuggestions = input.allowedTypes.join(', ');
  return {
    nodeId: input.node.nodeId,
    nodeLabel: input.node.label,
    edgeId: input.edgeId,
    edgeType: input.edgeType,
    direction: input.role,
    otherNodeId: input.otherNode.nodeId,
    otherNodeLabel: input.otherNode.label,
    message: `The ${input.edgeType} edge (${input.edgeId}) uses "${input.node.label}" as a ${input.role}, and the requested type "${input.nextNodeType}" is not valid for that role.`,
    suggestions: [
      `Remove the conflicting ${input.edgeType} edge and retry the node re-type.`,
      `Choose one of the compatible ${input.role} types for this edge: ${compatibleSuggestions}.`,
      `Keep "${input.node.label}" as ${input.node.nodeType}.`,
    ],
  };
}

function dedupeConflicts(
  conflicts: ICkgNodeBatchAuthoringConflict[]
): ICkgNodeBatchAuthoringConflict[] {
  const unique = new Map<string, ICkgNodeBatchAuthoringConflict>();
  for (const conflict of conflicts) {
    unique.set(
      `${conflict.nodeId}:${conflict.edgeId}:${conflict.direction}:${conflict.edgeType}`,
      conflict
    );
  }
  return [...unique.values()];
}
