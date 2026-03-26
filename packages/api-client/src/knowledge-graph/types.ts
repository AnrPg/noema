/**
 * @noema/api-client - Knowledge Graph Service Types
 *
 * DTOs for Knowledge Graph Service API requests and responses.
 * Defines simpler API-layer shapes distinct from the rich domain types
 * in @noema/types/knowledge-graph (no branded numerics, no readonly).
 */

import type { IApiResponse } from '@noema/contracts';
import type {
  EdgeId,
  MetacognitiveStage,
  MetricHealthStatus,
  MisconceptionSeverity,
  MutationId,
  NodeId,
  ProposerId,
  StructuralMetricType,
  TrendDirection,
  UserId,
} from '@noema/types';

// ============================================================================
// Enums
// ============================================================================

export type NodeType = 'concept' | 'skill' | 'fact' | 'procedure' | 'principle' | 'example';

export type EdgeType = 'prerequisite' | 'related' | 'part_of' | 'example_of' | 'contradicts';

export type MutationStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'retrying';
export type MutationWorkflowState =
  | 'proposed'
  | 'validating'
  | 'validated'
  | 'pending_review'
  | 'revision_requested'
  | 'proving'
  | 'proven'
  | 'committing'
  | 'committed'
  | 'rejected';

export type MisconceptionStatus =
  | 'detected'
  | 'confirmed'
  | 'addressed'
  | 'resolved'
  | 'recurring'
  | 'dismissed';

export type OntologySourceRole = 'backbone' | 'enhancement';
export type OntologyImportAccessMode = 'snapshot' | 'api' | 'linked_data' | 'hybrid';
export type OntologyImportStatus =
  | 'queued'
  | 'fetching'
  | 'fetched'
  | 'parsing'
  | 'parsed'
  | 'review_submitted'
  | 'ready_for_review'
  | 'failed'
  | 'cancelled';
export type OntologyImportStepType = 'fetch' | 'checksum' | 'parse' | 'stage' | 'validation';
export type OntologyImportStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type OntologyImportArtifactKind =
  | 'raw_payload'
  | 'manifest'
  | 'parsed_batch'
  | 'normalized_batch'
  | 'mutation_preview';
export type OntologyImportRunTrigger = 'manual' | 'scheduled' | 'retry';
export type OntologyMergeConfidenceBand = 'low' | 'medium' | 'high';
export type OntologyMergeConflictKind =
  | 'ambiguous_match'
  | 'domain_mismatch'
  | 'mapping_conflict'
  | 'weak_mapping_only';

export interface IOntologyImportRunConfigurationDto {
  mode: string | null;
  language: string | null;
  seedNodes: string[];
}

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

export type ComparisonScopeMode = 'domain' | 'engagement_hops';

export interface IComparisonScopeDto {
  mode: ComparisonScopeMode;
  hopCount: number;
  requestedDomain: string | null;
  bootstrapApplied: boolean;
  seedNodeCount: number;
  scopedCkgNodeCount: number;
  totalCkgNodeCount: number;
}

export interface IComparisonQueryParams {
  domain?: string;
  scopeMode?: ComparisonScopeMode;
  hopCount?: number;
  bootstrapWhenUnseeded?: boolean;
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

export interface IMetricStatusEntryDto {
  metricType: StructuralMetricType;
  value: number;
  status: MetricHealthStatus;
  trend: TrendDirection;
  hint: string;
}

export interface ICrossMetricPatternEntryDto {
  id: string;
  name: string;
  severity: 'info' | 'warning' | 'critical';
  description: string;
  participatingMetrics: string[];
  suggestedAction: string;
}

export interface IStructuralHealthReportDto {
  abstractionDrift: number;
  depthCalibrationGradient: number;
  scopeLeakageIndex: number;
  siblingConfusionEntropy: number;
  upwardLinkStrength: number;
  traversalBreadthScore: number;
  strategyDepthFit: number;
  structuralStrategyEntropy: number;
  structuralAttributionAccuracy: number;
  structuralStabilityGain: number;
  boundarySensitivityImprovement: number;
  score: number;
  grade: 'excellent' | 'good' | 'fair' | 'poor';
  issues: string[];
  recommendations: string[];
  overallScore: number;
  metricBreakdown: IMetricStatusEntryDto[];
  trend: TrendDirection;
  activeMisconceptionCount: number;
  metacognitiveStage: MetacognitiveStage;
  domain: string;
  generatedAt: string;
  crossMetricPatterns?: ICrossMetricPatternEntryDto[];
}

export interface IStageGateCriterionDto {
  metricType: StructuralMetricType;
  threshold: number;
  operator: 'below' | 'above' | 'stable' | 'improving';
  currentValue: number;
  met: boolean;
}

export interface IStageGateGapDto {
  metricType: StructuralMetricType;
  currentValue: number;
  requiredValue: number;
  gap: number;
  description: string;
}

export interface IMetacognitiveStageAssessmentDto {
  currentStage: MetacognitiveStage;
  domain: string;
  stageEvidence: IStageGateCriterionDto[];
  nextStageGaps: IStageGateGapDto[];
  regressionDetected: boolean;
  assessedAt: string;
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
  affectedNodeIds: NodeId[];
  misconceptionType?: string;
  pattern: string;
  family?: string;
  familyLabel?: string;
  description?: string | null;
  status: MisconceptionStatus;
  /** Detection confidence in [0, 1]. Optional — older records may omit it. */
  confidence?: number;
  severity?: MisconceptionSeverity;
  severityScore?: number;
  detectionCount?: number;
  detectedAt: string;
  lastDetectedAt?: string;
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
  state?: MutationWorkflowState;
  proposedBy: ProposerId;
  payload: Record<string, unknown>;
  operations?: Record<string, unknown>[];
  rationale?: string;
  ontologyImportContext?: {
    runId: string | null;
    sourceId: string | null;
    candidateId: string | null;
  };
  reviewHints?: {
    confidenceScore: number | null;
    confidenceBand: OntologyMergeConfidenceBand | null;
    conflictFlags: OntologyMergeConflictKind[];
  };
  reviewedBy: UserId | null;
  reviewNote: string | null;
  proposedAt: string;
  reviewedAt: string | null;
}

export interface ICkgMutationRecoveryCheckDto {
  mutationId: MutationId;
  check: 'safe_retry' | 'reconcile_commit';
  eligible: boolean;
  recommendedAction: 'recover_reject' | 'reconcile_commit' | 'wait' | 'none';
  mutationState: string;
  summary: string;
  details: string[];
  checkedAt: string;
  graphEvidence: {
    writeDetected: boolean;
    matchedNodeIds: NodeId[];
    matchedEdgeIds: EdgeId[];
  };
}

export interface ICkgMutationAuditEntry {
  id: string;
  mutationId: MutationId;
  fromStatus: string | null;
  toStatus: string;
  actorId: string;
  actorType: 'admin' | 'system';
  reason: string | null;
  transitionedAt: string;
}

export interface ICkgMutationAuditLogDto {
  mutationId: MutationId;
  entries: ICkgMutationAuditEntry[];
}

export type CkgMutationAuditLogResponse = IApiResponse<ICkgMutationAuditLogDto>;

export interface ICkgMutationFilters {
  status?: MutationStatus;
  state?: MutationWorkflowState;
  proposedBy?: ProposerId;
  importRunId?: string;
  includeImportRunAggregation?: boolean;
  page?: number;
  pageSize?: number;
  limit?: number;
  offset?: number;
}

export type CkgBulkReviewAction = 'approve' | 'reject' | 'request_revision';

export interface ICkgBulkReviewInput {
  action: CkgBulkReviewAction;
  mutationIds?: MutationId[];
  importRunId?: string;
  note: string;
}

export interface ICkgBulkReviewResult {
  action: CkgBulkReviewAction;
  importRunId: string | null;
  requestedCount: number;
  processedCount: number;
  skippedCount: number;
  succeededMutationIds: MutationId[];
  failed: {
    mutationId: MutationId;
    reason: string;
  }[];
}

// ============================================================================
// Ontology Imports
// ============================================================================

export interface IOntologySourceReleaseDto {
  version: string;
  publishedAt: string | null;
  checksum: string | null;
}

export interface IOntologyImportSourceDto {
  id: string;
  name: string;
  role: OntologySourceRole;
  accessMode: OntologyImportAccessMode;
  description: string;
  homepageUrl: string | null;
  documentationUrl: string | null;
  supportedLanguages: string[];
  supportsIncremental: boolean;
  enabled: boolean;
  latestRelease: IOntologySourceReleaseDto | null;
  createdAt: string;
  updatedAt: string;
}

export interface IOntologyImportArtifactDto {
  id: string;
  runId: string;
  sourceId: string;
  kind: OntologyImportArtifactKind;
  storageKey: string;
  contentType: string | null;
  checksum: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

export interface IOntologyImportArtifactContentDto {
  artifact: IOntologyImportArtifactDto;
  content: string;
}

export interface IOntologyImportCheckpointDto {
  id: string;
  runId: string;
  step: OntologyImportStepType;
  status: OntologyImportStepStatus;
  startedAt: string | null;
  completedAt: string | null;
  detail: string | null;
}

export interface IOntologyParsedBatchDto {
  runId: string;
  sourceId: string;
  sourceVersion: string | null;
  recordCount: number;
  artifactId: string;
}

export interface IOntologyNormalizedBatchDto {
  runId: string;
  sourceId: string;
  sourceVersion: string | null;
  artifactId: string;
  generatedAt: string;
  rawRecordCount: number;
  conceptCount: number;
  relationCount: number;
  mappingCount: number;
}

export interface IOntologyMutationPreviewCandidateDto {
  candidateId: string;
  entityKind: 'concept' | 'relation';
  status: 'ready' | 'blocked';
  title: string;
  summary: string;
  rationale: string;
  review: {
    confidenceScore: number;
    confidenceBand: OntologyMergeConfidenceBand;
    conflictFlags: OntologyMergeConflictKind[];
  };
  blockedReason: string | null;
  dependencyExternalIds: string[];
  proposal: {
    operations: Record<string, unknown>[];
    rationale: string;
    evidenceCount: number;
    priority: number;
  } | null;
}

export interface IOntologyMutationPreviewBatchDto {
  runId: string;
  sourceId: string;
  sourceVersion: string | null;
  generatedAt: string;
  artifactId: string | null;
  proposalCount: number;
  readyProposalCount: number;
  blockedCandidateCount: number;
  candidates: IOntologyMutationPreviewCandidateDto[];
}

export interface IOntologyImportRunDto {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceVersion: string | null;
  configuration: IOntologyImportRunConfigurationDto;
  submittedMutationIds: string[];
  status: OntologyImportStatus;
  trigger: OntologyImportRunTrigger;
  initiatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
}

export interface IOntologyImportRunDetailDto {
  run: IOntologyImportRunDto;
  source: IOntologyImportSourceDto | null;
  artifacts: IOntologyImportArtifactDto[];
  checkpoints: IOntologyImportCheckpointDto[];
  parsedBatch: IOntologyParsedBatchDto | null;
  normalizedBatch: IOntologyNormalizedBatchDto | null;
  mutationPreview: IOntologyMutationPreviewBatchDto | null;
}

export interface IListOntologyImportRunsParams {
  sourceId?: string;
  status?: OntologyImportStatus;
  sourceVersion?: string;
  mode?: string;
}

export interface ICreateOntologyImportRunInput {
  sourceId: string;
  trigger?: OntologyImportRunTrigger;
  sourceVersion?: string;
  configuration?: Partial<IOntologyImportRunConfigurationDto>;
}

export interface IRegisterOntologyImportSourceInput {
  id: string;
  name: string;
  role: OntologySourceRole;
  accessMode: OntologyImportAccessMode;
  description: string;
  homepageUrl?: string;
  documentationUrl?: string;
  supportedLanguages?: string[];
  supportsIncremental?: boolean;
}

export interface IUpdateOntologyImportSourceInput {
  enabled?: boolean;
}

export interface ICancelOntologyImportRunInput {
  reason?: string;
}

export interface IOntologyMutationPreviewSubmissionDto {
  runId: string;
  submittedAt: string;
  submittedCount: number;
  skippedCount: number;
  mutationIds: string[];
}

export interface IOntologyImportCapabilitySummaryDto {
  sourceId: string;
  fetch: boolean;
  parse: boolean;
  normalize: boolean;
}

export interface IOntologyImportsSystemStatusDto {
  status: 'healthy' | 'degraded' | 'unavailable';
  canReadRegistry: boolean;
  canManageRuns: boolean;
  canInspectArtifacts: boolean;
  missingTables: string[];
  issues: string[];
  sourceCapabilities: IOntologyImportCapabilitySummaryDto[];
  checkedAt: string;
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
  edgeAlignmentScore: number;
  pkgSubgraph: ISubgraphDto;
  ckgSubgraph: ISubgraphDto;
  scope: IComparisonScopeDto;
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
export type MetricStatusEntryDto = IMetricStatusEntryDto;
export type CrossMetricPatternEntryDto = ICrossMetricPatternEntryDto;
export type StructuralHealthReportDto = IStructuralHealthReportDto;
export type StageGateCriterionDto = IStageGateCriterionDto;
export type StageGateGapDto = IStageGateGapDto;
export type MetacognitiveStageAssessmentDto = IMetacognitiveStageAssessmentDto;
export type MetricHistoryDto = IMetricHistoryDto;
export type MisconceptionDto = IMisconceptionDto;
export type MisconceptionDetectionResult = IMisconceptionDetectionResult;
export type UpdateMisconceptionStatusInput = IUpdateMisconceptionStatusInput;
export type CkgMutationDto = ICkgMutationDto;
export type CkgMutationFilters = ICkgMutationFilters;
export type CkgBulkReviewInput = ICkgBulkReviewInput;
export type CkgBulkReviewResult = ICkgBulkReviewResult;
export type PkgCkgComparisonDto = IPkgCkgComparisonDto;
export type CkgMutationAuditEntry = ICkgMutationAuditEntry;
export type CkgMutationAuditLogDto = ICkgMutationAuditLogDto;
export type OntologyImportSourceDto = IOntologyImportSourceDto;
export type OntologyImportRunDto = IOntologyImportRunDto;
export type OntologyImportRunDetailDto = IOntologyImportRunDetailDto;
export type OntologyImportRunConfigurationDto = IOntologyImportRunConfigurationDto;
export type OntologyImportArtifactDto = IOntologyImportArtifactDto;
export type OntologyImportArtifactContentDto = IOntologyImportArtifactContentDto;
export type OntologyImportCheckpointDto = IOntologyImportCheckpointDto;
export type OntologyParsedBatchDto = IOntologyParsedBatchDto;
export type OntologyNormalizedBatchDto = IOntologyNormalizedBatchDto;
export type OntologyMutationPreviewBatchDto = IOntologyMutationPreviewBatchDto;
export type OntologyMutationPreviewSubmissionDto = IOntologyMutationPreviewSubmissionDto;
export type ListOntologyImportRunsParams = IListOntologyImportRunsParams;
export type OntologyImportsSystemStatusDto = IOntologyImportsSystemStatusDto;
export type OntologyImportCapabilitySummaryDto = IOntologyImportCapabilitySummaryDto;
export type RegisterOntologyImportSourceInput = IRegisterOntologyImportSourceInput;
export type UpdateOntologyImportSourceInput = IUpdateOntologyImportSourceInput;

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
export type StageResponse = IApiResponse<IMetacognitiveStageAssessmentDto>;
export type MetricHistoryResponse = IApiResponse<IMetricHistoryDto>;
export type MisconceptionsResponse = IApiResponse<IMisconceptionDto[]>;
/** Single-item misconception response (used by updateStatus) */
export type MisconceptionResponse = IApiResponse<IMisconceptionDto>;
export type MisconceptionDetectionResponse = IApiResponse<IMisconceptionDetectionResult>;
export type CkgMutationsResponse = IApiResponse<ICkgMutationDto[]>;
export type CkgMutationResponse = IApiResponse<ICkgMutationDto>;
export type CkgMutationRecoveryCheckResponse = IApiResponse<ICkgMutationRecoveryCheckDto>;
export type CkgBulkReviewResponse = IApiResponse<ICkgBulkReviewResult>;
export type ComparisonResponse = IApiResponse<IPkgCkgComparisonDto>;
export type OntologyImportSourcesResponse = IApiResponse<IOntologyImportSourceDto[]>;
export type OntologyImportSourceResponse = IApiResponse<IOntologyImportSourceDto>;
export type OntologyImportRunsResponse = IApiResponse<IOntologyImportRunDto[]>;
export type OntologyImportRunResponse = IApiResponse<IOntologyImportRunDto>;
export type OntologyImportRunDetailResponse = IApiResponse<IOntologyImportRunDetailDto>;
export type OntologyImportArtifactContentResponse = IApiResponse<IOntologyImportArtifactContentDto>;
export type OntologyMutationPreviewSubmissionResponse =
  IApiResponse<IOntologyMutationPreviewSubmissionDto>;
export type OntologyImportsSystemStatusResponse = IApiResponse<IOntologyImportsSystemStatusDto>;
