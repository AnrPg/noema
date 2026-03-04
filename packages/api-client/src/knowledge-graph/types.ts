/**
 * @noema/api-client - Knowledge Graph Service Types
 *
 * DTOs for Knowledge Graph Service API requests and responses.
 * Defines simpler API-layer shapes distinct from the rich domain types
 * in @noema/types/knowledge-graph (no branded numerics, no readonly).
 */

import type { IApiResponse } from '@noema/contracts';
import type { EdgeId, MutationId, NodeId, ProposerId, UserId } from '@noema/types';

// ============================================================================
// Enums
// ============================================================================

export type NodeType = 'concept' | 'skill' | 'fact' | 'procedure' | 'principle' | 'example';

export type EdgeType = 'prerequisite' | 'related' | 'part_of' | 'example_of' | 'contradicts';

export type MutationStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'retrying';

export type MisconceptionStatus = 'detected' | 'confirmed' | 'resolved' | 'dismissed';

// ============================================================================
// PKG / CKG Node DTO
// ============================================================================

export interface IGraphNodeDto {
  id: NodeId;
  type: NodeType;
  label: string;
  description: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ICreateNodeInput {
  type: NodeType;
  label: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface IUpdateNodeInput {
  label?: string;
  description?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// PKG / CKG Edge DTO
// ============================================================================

export interface IGraphEdgeDto {
  id: EdgeId;
  sourceId: NodeId;
  targetId: NodeId;
  type: EdgeType;
  weight: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ICreateEdgeInput {
  sourceId: NodeId;
  targetId: NodeId;
  type: EdgeType;
  weight?: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Traversal Results
// ============================================================================

export interface ISubgraphDto {
  nodes: IGraphNodeDto[];
  edges: IGraphEdgeDto[];
}

export interface ISubgraphParams {
  rootNodeId: NodeId;
  depth?: number;
  edgeTypes?: EdgeType[];
}

export interface IPrerequisiteChainDto {
  nodeId: NodeId;
  chain: IGraphNodeDto[];
  depth: number;
}

export interface IKnowledgeFrontierDto {
  nodes: IGraphNodeDto[];
  totalReady: number;
}

export interface IBridgeNodesDto {
  nodes: IGraphNodeDto[];
}

export interface ICentralityEntry {
  nodeId: NodeId;
  score: number;
}

export interface ICentralityDto {
  rankings: ICentralityEntry[];
}

export interface ITopologyDto {
  nodeCount: number;
  edgeCount: number;
  isAcyclic: boolean;
  stronglyConnectedComponents: number;
}

export interface ICommonAncestorsInput {
  nodeIds: NodeId[];
}

// ============================================================================
// PKG Operations Log
// ============================================================================

export interface IPkgOperationDto {
  id: string;
  type: 'create_node' | 'update_node' | 'delete_node' | 'create_edge' | 'delete_edge';
  entityId: string;
  performedAt: string;
  performedBy: UserId;
}

// ============================================================================
// Structural Metrics
// ============================================================================

export interface IStructuralMetricsDto {
  userId: UserId;
  nodeCount: number;
  edgeCount: number;
  avgDegree: number;
  density: number;
  clusteredNodes: number;
  isolatedNodes: number;
  computedAt: string;
}

export interface IStructuralHealthReportDto {
  userId: UserId;
  score: number;
  grade: 'excellent' | 'good' | 'fair' | 'poor';
  issues: string[];
  recommendations: string[];
  computedAt: string;
}

export interface IMetricHistoryEntry {
  computedAt: string;
  nodeCount: number;
  edgeCount: number;
  density: number;
  score: number;
}

export interface IMetricHistoryDto {
  userId: UserId;
  entries: IMetricHistoryEntry[];
}

// ============================================================================
// Misconceptions
// ============================================================================

export interface IMisconceptionDto {
  id: string;
  userId: UserId;
  nodeId: NodeId;
  pattern: string;
  status: MisconceptionStatus;
  detectedAt: string;
  resolvedAt: string | null;
}

export interface IMisconceptionDetectionResult {
  detected: IMisconceptionDto[];
  totalAnalyzed: number;
}

export interface IUpdateMisconceptionStatusInput {
  status: MisconceptionStatus;
}

// ============================================================================
// CKG Mutations
// ============================================================================

export interface ICkgMutationDto {
  id: MutationId;
  type: 'create_node' | 'update_node' | 'delete_node' | 'create_edge' | 'delete_edge';
  status: MutationStatus;
  proposedBy: ProposerId;
  payload: Record<string, unknown>;
  reviewedBy: UserId | null;
  reviewNote: string | null;
  proposedAt: string;
  reviewedAt: string | null;
}

export interface ICkgMutationFilters {
  status?: MutationStatus;
  proposedBy?: ProposerId;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Comparison
// ============================================================================

export interface IPkgCkgComparisonDto {
  userId: UserId;
  pkgNodeCount: number;
  ckgNodeCount: number;
  matchedNodes: number;
  missingFromPkg: IGraphNodeDto[];
  extraInPkg: IGraphNodeDto[];
  alignmentScore: number;
}

// ============================================================================
// Backward-compat aliases (non-I names)
// ============================================================================

export type GraphNodeDto = IGraphNodeDto;
export type CreateNodeInput = ICreateNodeInput;
export type UpdateNodeInput = IUpdateNodeInput;
export type GraphEdgeDto = IGraphEdgeDto;
export type CreateEdgeInput = ICreateEdgeInput;
export type SubgraphDto = ISubgraphDto;
export type SubgraphParams = ISubgraphParams;
export type PrerequisiteChainDto = IPrerequisiteChainDto;
export type KnowledgeFrontierDto = IKnowledgeFrontierDto;
export type BridgeNodesDto = IBridgeNodesDto;
export type CentralityDto = ICentralityDto;
export type TopologyDto = ITopologyDto;
export type CommonAncestorsInput = ICommonAncestorsInput;
export type PkgOperationDto = IPkgOperationDto;
export type StructuralMetricsDto = IStructuralMetricsDto;
export type StructuralHealthReportDto = IStructuralHealthReportDto;
export type MetricHistoryDto = IMetricHistoryDto;
export type MisconceptionDto = IMisconceptionDto;
export type MisconceptionDetectionResult = IMisconceptionDetectionResult;
export type UpdateMisconceptionStatusInput = IUpdateMisconceptionStatusInput;
export type CkgMutationDto = ICkgMutationDto;
export type CkgMutationFilters = ICkgMutationFilters;
export type PkgCkgComparisonDto = IPkgCkgComparisonDto;

// ============================================================================
// Response aliases
// ============================================================================

export type NodeResponse = IApiResponse<IGraphNodeDto>;
export type NodesListResponse = IApiResponse<IGraphNodeDto[]>;
export type EdgeResponse = IApiResponse<IGraphEdgeDto>;
export type EdgesListResponse = IApiResponse<IGraphEdgeDto[]>;
export type SubgraphResponse = IApiResponse<ISubgraphDto>;
export type PrerequisiteChainResponse = IApiResponse<IPrerequisiteChainDto>;
export type FrontierResponse = IApiResponse<IKnowledgeFrontierDto>;
export type BridgeNodesResponse = IApiResponse<IBridgeNodesDto>;
export type CentralityResponse = IApiResponse<ICentralityDto>;
export type TopologyResponse = IApiResponse<ITopologyDto>;
export type OperationsResponse = IApiResponse<IPkgOperationDto[]>;
export type MetricsResponse = IApiResponse<IStructuralMetricsDto>;
export type HealthResponse = IApiResponse<IStructuralHealthReportDto>;
export type MetricHistoryResponse = IApiResponse<IMetricHistoryDto>;
export type MisconceptionsResponse = IApiResponse<IMisconceptionDto[]>;
/** Single-item misconception response (used by updateStatus) */
export type MisconceptionResponse = IApiResponse<IMisconceptionDto>;
export type MisconceptionDetectionResponse = IApiResponse<IMisconceptionDetectionResult>;
export type CkgMutationsResponse = IApiResponse<ICkgMutationDto[]>;
export type CkgMutationResponse = IApiResponse<ICkgMutationDto>;
export type ComparisonResponse = IApiResponse<IPkgCkgComparisonDto>;
