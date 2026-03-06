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
  ICreateNodeInput,
  EdgeResponse,
  EdgesListResponse,
  FrontierResponse,
  HealthResponse,
  MetricHistoryResponse,
  MetricsResponse,
  MisconceptionDetectionResponse,
  MisconceptionResponse,
  MisconceptionsResponse,
  NodeResponse,
  NodesListResponse,
  OperationsResponse,
  PrerequisiteChainResponse,
  ISubgraphParams,
  SubgraphResponse,
  TopologyResponse,
  IUpdateMisconceptionStatusInput,
  IUpdateNodeInput,
} from './types.js';

const pkgBase = (userId: UserId) => `/api/v1/users/${userId}/pkg`;
const ckgBase = '/api/v1/ckg';
const metricsBase = (userId: UserId) => `/api/v1/users/${userId}/metrics`;
const miscBase = (userId: UserId) => `/api/v1/users/${userId}/misconceptions`;

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

  getFrontier: (userId: UserId): Promise<FrontierResponse> =>
    http.get(`${pkgBase(userId)}/traversal/frontier`),

  getBridges: (userId: UserId): Promise<BridgeNodesResponse> =>
    http.get(`${pkgBase(userId)}/traversal/bridges`),

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
      params: filters as Record<string, string | number | boolean | undefined>,
    }),

  get: (mutationId: MutationId): Promise<CkgMutationResponse> =>
    http.get(`${ckgBase}/mutations/${mutationId}`),

  approve: (mutationId: MutationId, note?: string): Promise<CkgMutationResponse> =>
    http.post(`${ckgBase}/mutations/${mutationId}/approve`, { note }),

  reject: (mutationId: MutationId, note?: string): Promise<CkgMutationResponse> =>
    http.post(`${ckgBase}/mutations/${mutationId}/reject`, { note }),

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
  get: (userId: UserId): Promise<MetricsResponse> => http.get(metricsBase(userId)),

  compute: (userId: UserId): Promise<MetricsResponse> =>
    http.post(`${metricsBase(userId)}/compute`, {}),

  getHistory: (userId: UserId): Promise<MetricHistoryResponse> =>
    http.get(`${metricsBase(userId)}/history`),
};

// ============================================================================
// Structural Health API
// ============================================================================

export const healthApi = {
  get: (userId: UserId): Promise<HealthResponse> =>
    http.get(`/api/v1/users/${userId}/structural-health`),
};

// ============================================================================
// Misconceptions API
// ============================================================================

export const misconceptionsApi = {
  list: (userId: UserId): Promise<MisconceptionsResponse> => http.get(miscBase(userId)),

  detect: (userId: UserId): Promise<MisconceptionDetectionResponse> =>
    http.post(`${miscBase(userId)}/detect`, {}),

  updateStatus: (
    userId: UserId,
    misconceptionId: string,
    data: IUpdateMisconceptionStatusInput
  ): Promise<MisconceptionResponse> => http.patch(`${miscBase(userId)}/${misconceptionId}`, data),
};

// ============================================================================
// Comparison API
// ============================================================================

export const comparisonApi = {
  compare: (userId: UserId): Promise<ComparisonResponse> =>
    http.get(`/api/v1/users/${userId}/comparison`),
};
