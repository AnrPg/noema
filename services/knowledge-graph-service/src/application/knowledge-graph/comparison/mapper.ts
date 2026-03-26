/**
 * @noema/knowledge-graph-service - Comparison Mapper
 *
 * Maps the rich domain comparison object into the transport DTO consumed by
 * the web app and API client.
 */

import type { IGraphEdge, IGraphNode, UserId } from '@noema/types';

import { computeCoverageAlignmentScore } from '../../../domain/knowledge-graph-service/comparison-scope.builder.js';
import type { IGraphComparison } from '../../../domain/knowledge-graph-service/value-objects/comparison.js';
import type {
  IComparisonGraphEdgeDto,
  IComparisonGraphNodeDto,
  IComparisonRequestDto,
  IComparisonResponseDto,
  IComparisonSubgraphDto,
} from './contracts.js';

function toNodeType(nodeType: string): IComparisonGraphNodeDto['type'] {
  switch (nodeType) {
    case 'skill':
    case 'fact':
    case 'procedure':
    case 'principle':
    case 'example':
      return nodeType;
    default:
      return 'concept';
  }
}

function toEdgeType(edgeType: string): IComparisonGraphEdgeDto['type'] {
  switch (edgeType) {
    case 'prerequisite':
    case 'part_of':
    case 'example_of':
    case 'contradicts':
      return edgeType;
    default:
      return 'related';
  }
}

function mapNode(node: IGraphNode): IComparisonGraphNodeDto {
  return {
    id: node.nodeId as string,
    type: toNodeType(node.nodeType),
    label: node.label,
    description: node.description ?? null,
    tags: node.domain !== '' ? [node.domain] : [],
    metadata: node.properties,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
}

function mapEdge(edge: IGraphEdge): IComparisonGraphEdgeDto {
  return {
    id: edge.edgeId as string,
    sourceId: edge.sourceNodeId as string,
    targetId: edge.targetNodeId as string,
    type: toEdgeType(edge.edgeType),
    weight: edge.weight as number,
    metadata: edge.properties,
    createdAt: edge.createdAt,
  };
}

function mapSubgraph(comparisonSubgraph: IGraphComparison['pkgSubgraph']): IComparisonSubgraphDto {
  return {
    nodes: comparisonSubgraph.nodes.map(mapNode),
    edges: comparisonSubgraph.edges.map(mapEdge),
  };
}

export function toDomainComparisonRequest(
  request: IComparisonRequestDto
): IComparisonRequestDto {
  return request;
}

export function toComparisonResponseDto(
  userId: UserId,
  comparison: IGraphComparison
): IComparisonResponseDto {
  const ckgNodeById = new Map(comparison.ckgSubgraph.nodes.map((node) => [node.nodeId, node]));
  const pkgNodeById = new Map(comparison.pkgSubgraph.nodes.map((node) => [node.nodeId, node]));

  const missingFromPkg = comparison.unmatchedCkgNodes
    .map((nodeId) => ckgNodeById.get(nodeId))
    .filter((node): node is IGraphNode => node !== undefined)
    .map(mapNode);

  const extraInPkg = comparison.unmatchedPkgNodes
    .map((nodeId) => pkgNodeById.get(nodeId))
    .filter((node): node is IGraphNode => node !== undefined)
    .map(mapNode);

  return {
    userId: userId as string,
    pkgNodeCount: comparison.pkgSubgraph.nodes.length,
    ckgNodeCount: comparison.ckgSubgraph.nodes.length,
    matchedNodes: comparison.nodeAlignment.size,
    missingFromPkg,
    extraInPkg,
    alignmentScore: computeCoverageAlignmentScore(comparison),
    edgeAlignmentScore: comparison.edgeAlignmentScore,
    pkgSubgraph: mapSubgraph(comparison.pkgSubgraph),
    ckgSubgraph: mapSubgraph(comparison.ckgSubgraph),
    scope: comparison.scope ?? {
      mode: 'domain',
      hopCount: 0,
      requestedDomain: null,
      bootstrapApplied: false,
      seedNodeCount: comparison.nodeAlignment.size,
      scopedCkgNodeCount: comparison.ckgSubgraph.nodes.length,
      totalCkgNodeCount: comparison.ckgSubgraph.nodes.length,
    },
  };
}
