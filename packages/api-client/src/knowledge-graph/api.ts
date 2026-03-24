/**
 * @noema/api-client - Knowledge Graph Service API
 *
 * API methods for Knowledge Graph Service endpoints:
 *   - PKG (Personal Knowledge Graph) nodes, edges, traversal, operations
 *   - CKG (Canonical Knowledge Graph) nodes, edges, mutations, traversal
 *   - Structural metrics, health, misconceptions, PKG/CKG comparison
 */

import { http } from '../client.js';
import type { EdgeId, MutationId, NodeId, UserId } from '@noema/types';
import type {
  BridgeNodesResponse,
  CentralityResponse,
  CkgMutationAuditLogResponse,
  ICkgMutationFilters,
  CkgMutationResponse,
  CkgMutationsResponse,
  ICommonAncestorsInput,
  ComparisonResponse,
  ICreateEdgeInput,
  ICreateOntologyImportRunInput,
  ICreateNodeInput,
  ICancelOntologyImportRunInput,
  EdgeResponse,
  EdgesListResponse,
  FrontierResponse,
  HealthResponse,
  IListOntologyImportRunsParams,
  MetricHistoryResponse,
  MetricsResponse,
  MisconceptionDetectionResponse,
  MisconceptionResponse,
  MisconceptionsResponse,
  NodeResponse,
  NodesListResponse,
  OperationsResponse,
  OntologyImportRunDetailResponse,
  OntologyImportRunResponse,
  OntologyImportRunsResponse,
  OntologyImportSourcesResponse,
  OntologyMutationPreviewSubmissionResponse,
  PrerequisiteChainResponse,
  StageResponse,
  ISubgraphParams,
  SubgraphResponse,
  TopologyResponse,
  IUpdateMisconceptionStatusInput,
  IUpdateNodeInput,
} from './types.js';

const pkgBase = (userId: UserId) => `/api/v1/users/${userId}/pkg`;
const ckgBase = '/api/v1/ckg';
const ontologyImportsBase = '/api/v1/ckg/imports';
const metricsBase = (userId: UserId) => `/api/v1/users/${userId}/metrics`;
const miscBase = (userId: UserId) => `/api/v1/users/${userId}/misconceptions`;
const DEFAULT_DOMAIN = 'general';

// ============================================================================
// PKG Nodes API
// ============================================================================

export const pkgNodesApi = {
  create: (userId: UserId, data: ICreateNodeInput): Promise<NodeResponse> =>
    http.post(`${pkgBase(userId)}/nodes`, data),

  list: (userId: UserId): Promise<NodesListResponse> => http.get(`${pkgBase(userId)}/nodes`),

  get: (userId: UserId, nodeId: NodeId): Promise<NodeResponse> =>
    http.get(`${pkgBase(userId)}/nodes/${nodeId}`),

  update: (userId: UserId, nodeId: NodeId, data: IUpdateNodeInput): Promise<NodeResponse> =>
    http.patch(`${pkgBase(userId)}/nodes/${nodeId}`, data),

  delete: (userId: UserId, nodeId: NodeId): Promise<void> =>
    http.delete(`${pkgBase(userId)}/nodes/${nodeId}`),
};

// ============================================================================
// PKG Edges API
// ============================================================================

export const pkgEdgesApi = {
  create: (userId: UserId, data: ICreateEdgeInput): Promise<EdgeResponse> =>
    http.post(`${pkgBase(userId)}/edges`, data),

  list: (userId: UserId): Promise<EdgesListResponse> => http.get(`${pkgBase(userId)}/edges`),

  get: (userId: UserId, edgeId: EdgeId): Promise<EdgeResponse> =>
    http.get(`${pkgBase(userId)}/edges/${edgeId}`),

  delete: (userId: UserId, edgeId: EdgeId): Promise<void> =>
    http.delete(`${pkgBase(userId)}/edges/${edgeId}`),
};

// ============================================================================
// PKG Traversal API
// ============================================================================

export const pkgTraversalApi = {
  getSubgraph: (userId: UserId, params: ISubgraphParams): Promise<SubgraphResponse> =>
    http.get(`${pkgBase(userId)}/traversal/subgraph`, {
      params: params as unknown as Record<string, string | number | boolean | undefined>,
    }),

  getPrerequisites: (userId: UserId, nodeId: NodeId): Promise<PrerequisiteChainResponse> =>
    http.get(`${pkgBase(userId)}/traversal/prerequisites/${nodeId}`),

  getRelated: (userId: UserId, nodeId: NodeId): Promise<NodesListResponse> =>
    http.get(`${pkgBase(userId)}/traversal/related/${nodeId}`),

  getTopology: (userId: UserId): Promise<TopologyResponse> =>
    http.get(`${pkgBase(userId)}/traversal/topology`),

  getFrontier: (userId: UserId, domain: string): Promise<FrontierResponse> =>
    http.get(`${pkgBase(userId)}/traversal/frontier`, {
      params: { domain },
    }),

  getBridges: (userId: UserId, domain: string): Promise<BridgeNodesResponse> =>
    http.get(`${pkgBase(userId)}/traversal/bridges`, {
      params: { domain },
    }),

  getCentrality: (userId: UserId): Promise<CentralityResponse> =>
    http.get(`${pkgBase(userId)}/traversal/centrality`),

  getSiblings: (userId: UserId, nodeId: NodeId): Promise<NodesListResponse> =>
    http.get(`${pkgBase(userId)}/traversal/siblings/${nodeId}`),

  getCoParents: (userId: UserId, nodeId: NodeId): Promise<NodesListResponse> =>
    http.get(`${pkgBase(userId)}/traversal/co-parents/${nodeId}`),

  getCommonAncestors: (userId: UserId, data: ICommonAncestorsInput): Promise<NodesListResponse> =>
    http.post(`${pkgBase(userId)}/traversal/common-ancestors`, data),
};

// ============================================================================
// PKG Operations Log
// ============================================================================

export const pkgOperationsApi = {
  list: (userId: UserId): Promise<OperationsResponse> => http.get(`${pkgBase(userId)}/operations`),
};

// ============================================================================
// CKG Read API
// ============================================================================

export const ckgNodesApi = {
  list: (): Promise<NodesListResponse> => http.get(`${ckgBase}/nodes`),

  get: (nodeId: NodeId): Promise<NodeResponse> => http.get(`${ckgBase}/nodes/${nodeId}`),
};

export const ckgEdgesApi = {
  list: (): Promise<EdgesListResponse> => http.get(`${ckgBase}/edges`),

  get: (edgeId: EdgeId): Promise<EdgeResponse> => http.get(`${ckgBase}/edges/${edgeId}`),
};

// ============================================================================
// CKG Mutations API
// ============================================================================

export const ckgMutationsApi = {
  list: (filters?: ICkgMutationFilters): Promise<CkgMutationsResponse> =>
    http.get(`${ckgBase}/mutations`, {
      params: {
        state: filters?.state,
        proposedBy: filters?.proposedBy,
        importRunId: filters?.importRunId,
        includeImportRunAggregation: filters?.includeImportRunAggregation,
      },
    }),

  get: (mutationId: MutationId): Promise<CkgMutationResponse> =>
    http.get(`${ckgBase}/mutations/${mutationId}`),

  approve: (mutationId: MutationId, note?: string): Promise<CkgMutationResponse> =>
    http.post(`${ckgBase}/mutations/${mutationId}/approve`, {
      reason: note ?? 'Approved from admin console',
    }),

  reject: (mutationId: MutationId, note?: string): Promise<CkgMutationResponse> =>
    http.post(`${ckgBase}/mutations/${mutationId}/reject`, {
      reason: note ?? 'Rejected from admin console',
    }),

  cancel: (mutationId: MutationId): Promise<CkgMutationResponse> =>
    http.post(`${ckgBase}/mutations/${mutationId}/cancel`, {}),

  retry: (mutationId: MutationId): Promise<CkgMutationResponse> =>
    http.post(`${ckgBase}/mutations/${mutationId}/retry`, {}),

  getAuditLog: (mutationId: MutationId): Promise<CkgMutationAuditLogResponse> =>
    http.get(`${ckgBase}/mutations/${mutationId}/audit-log`),

  requestRevision: (mutationId: MutationId, feedback: string): Promise<CkgMutationResponse> =>
    http.post(`${ckgBase}/mutations/${mutationId}/request-revision`, { feedback }),
};

// ============================================================================
// Ontology Imports API
// ============================================================================

export const ontologyImportsApi = {
  listSources: (): Promise<OntologyImportSourcesResponse> =>
    http.get(`${ontologyImportsBase}/sources`),

  listRuns: (filters?: IListOntologyImportRunsParams): Promise<OntologyImportRunsResponse> =>
    http.get(`${ontologyImportsBase}/runs`, {
      params: {
        sourceId: filters?.sourceId,
        status: filters?.status,
      },
    }),

  getRun: (runId: string): Promise<OntologyImportRunDetailResponse> =>
    http.get(`${ontologyImportsBase}/runs/${runId}`),

  createRun: (input: ICreateOntologyImportRunInput): Promise<OntologyImportRunResponse> =>
    http.post(`${ontologyImportsBase}/runs`, input),

  startRun: (runId: string): Promise<OntologyImportRunResponse> =>
    http.post(`${ontologyImportsBase}/runs/${runId}/start`, {}),

  cancelRun: (
    runId: string,
    input?: ICancelOntologyImportRunInput
  ): Promise<OntologyImportRunResponse> =>
    http.post(`${ontologyImportsBase}/runs/${runId}/cancel`, input ?? {}),

  retryRun: (runId: string): Promise<OntologyImportRunResponse> =>
    http.post(`${ontologyImportsBase}/runs/${runId}/retry`, {}),

  submitRunPreview: (runId: string): Promise<OntologyMutationPreviewSubmissionResponse> =>
    http.post(`${ontologyImportsBase}/runs/${runId}/submit`, {}),
};

// ============================================================================
// CKG Traversal API (mirrors PKG traversal but on canonical graph)
// ============================================================================

export const ckgTraversalApi = {
  getSubgraph: (params: ISubgraphParams): Promise<SubgraphResponse> =>
    http.get(`${ckgBase}/traversal/subgraph`, {
      params: params as unknown as Record<string, string | number | boolean | undefined>,
    }),

  getFrontier: (): Promise<FrontierResponse> => http.get(`${ckgBase}/traversal/frontier`),

  getCentrality: (): Promise<CentralityResponse> => http.get(`${ckgBase}/traversal/centrality`),
};

// ============================================================================
// Structural Metrics API
// ============================================================================

export const metricsApi = {
  get: (userId: UserId): Promise<MetricsResponse> =>
    http.get(metricsBase(userId), { params: { domain: DEFAULT_DOMAIN } }),

  compute: (userId: UserId): Promise<MetricsResponse> =>
    http.post(`${metricsBase(userId)}/compute`, { domain: DEFAULT_DOMAIN }),

  getHistory: (userId: UserId): Promise<MetricHistoryResponse> =>
    http.get(`${metricsBase(userId)}/history`, { params: { domain: DEFAULT_DOMAIN } }),
};

// ============================================================================
// Structural Health API
// ============================================================================

export const healthApi = {
  get: (userId: UserId): Promise<HealthResponse> =>
    http.get(`/api/v1/users/${userId}/health`, { params: { domain: DEFAULT_DOMAIN } }),

  getStage: (userId: UserId): Promise<StageResponse> =>
    http.get(`/api/v1/users/${userId}/health/stage`, { params: { domain: DEFAULT_DOMAIN } }),
};

// ============================================================================
// Misconceptions API
// ============================================================================

export const misconceptionsApi = {
  list: (userId: UserId): Promise<MisconceptionsResponse> => http.get(miscBase(userId)),

  detect: (userId: UserId): Promise<MisconceptionDetectionResponse> =>
    http.post(`${miscBase(userId)}/detect`, { domain: DEFAULT_DOMAIN }),

  updateStatus: (
    userId: UserId,
    misconceptionId: string,
    data: IUpdateMisconceptionStatusInput
  ): Promise<MisconceptionResponse> =>
    http.patch(`${miscBase(userId)}/${misconceptionId}/status`, {
      ...data,
      status: data.status === 'dismissed' ? 'addressed' : data.status,
    }),
};

// ============================================================================
// Comparison API
// ============================================================================

export const comparisonApi = {
  compare: (userId: UserId): Promise<ComparisonResponse> =>
    http.get(`/api/v1/users/${userId}/comparison`, { params: { domain: DEFAULT_DOMAIN } }),
};
