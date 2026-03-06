/**
 * @noema/api-client - Knowledge Graph Service Hooks
 *
 * TanStack Query hooks for Knowledge Graph Service endpoints:
 *   PKG nodes/edges/traversal, CKG nodes/edges/mutations,
 *   structural metrics, health, misconceptions, PKG/CKG comparison.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type { EdgeId, MutationId, NodeId, UserId } from '@noema/types';
import {
  ckgEdgesApi,
  ckgMutationsApi,
  ckgNodesApi,
  comparisonApi,
  healthApi,
  metricsApi,
  misconceptionsApi,
  pkgEdgesApi,
  pkgNodesApi,
  pkgOperationsApi,
  pkgTraversalApi,
} from './api.js';
import type {
  ICentralityDto,
  ICkgMutationAuditLogDto,
  ICkgMutationDto,
  ICkgMutationFilters,
  ICommonAncestorsInput,
  ICreateEdgeInput,
  ICreateNodeInput,
  IGraphEdgeDto,
  IGraphNodeDto,
  IPkgCkgComparisonDto,
  ISubgraphParams,
  IUpdateMisconceptionStatusInput,
  IUpdateNodeInput,
  BridgeNodesResponse,
  CentralityResponse,
  CkgMutationAuditLogResponse,
  CkgMutationResponse,
  CkgMutationsResponse,
  ComparisonResponse,
  EdgeResponse,
  EdgesListResponse,
  FrontierResponse,
  HealthResponse,
  MetricHistoryResponse,
  MetricsResponse,
  MisconceptionDetectionResponse,
  MisconceptionsResponse,
  NodeResponse,
  NodesListResponse,
  OperationsResponse,
  PrerequisiteChainResponse,
  SubgraphResponse,
} from './types.js';

// ============================================================================
// Query Key Factory
// ============================================================================

export const kgKeys = {
  all: ['kg'] as const,
  pkg: (userId: UserId) => [...kgKeys.all, 'pkg', userId] as const,
  pkgNodes: (userId: UserId) => [...kgKeys.pkg(userId), 'nodes'] as const,
  pkgNode: (userId: UserId, nodeId: NodeId) => [...kgKeys.pkgNodes(userId), nodeId] as const,
  pkgEdges: (userId: UserId) => [...kgKeys.pkg(userId), 'edges'] as const,
  pkgEdge: (userId: UserId, edgeId: EdgeId) => [...kgKeys.pkgEdges(userId), edgeId] as const,
  pkgSubgraph: (userId: UserId, params: ISubgraphParams) =>
    [...kgKeys.pkg(userId), 'subgraph', params] as const,
  pkgPrerequisites: (userId: UserId, nodeId: NodeId) =>
    [...kgKeys.pkg(userId), 'prerequisites', nodeId] as const,
  pkgFrontier: (userId: UserId) => [...kgKeys.pkg(userId), 'frontier'] as const,
  pkgBridges: (userId: UserId) => [...kgKeys.pkg(userId), 'bridges'] as const,
  pkgCentrality: (userId: UserId) => [...kgKeys.pkg(userId), 'centrality'] as const,
  pkgTopology: (userId: UserId) => [...kgKeys.pkg(userId), 'topology'] as const,
  pkgOps: (userId: UserId) => [...kgKeys.pkg(userId), 'operations'] as const,
  ckg: () => [...kgKeys.all, 'ckg'] as const,
  ckgNodes: () => [...kgKeys.ckg(), 'nodes'] as const,
  ckgEdges: () => [...kgKeys.ckg(), 'edges'] as const,
  ckgMutations: (filters?: ICkgMutationFilters) => [...kgKeys.ckg(), 'mutations', filters] as const,
  ckgMutation: (id: MutationId) => [...kgKeys.ckg(), 'mutations', id] as const,
  metrics: (userId: UserId) => [...kgKeys.all, 'metrics', userId] as const,
  metricHistory: (userId: UserId) => [...kgKeys.metrics(userId), 'history'] as const,
  health: (userId: UserId) => [...kgKeys.all, 'health', userId] as const,
  misconceptions: (userId: UserId) => [...kgKeys.all, 'misconceptions', userId] as const,
  comparison: (userId: UserId) => [...kgKeys.all, 'comparison', userId] as const,
};

// ============================================================================
// PKG Node Hooks
// ============================================================================

export function usePKGNodes(
  userId: UserId,
  options?: Omit<UseQueryOptions<NodesListResponse, Error, IGraphNodeDto[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.pkgNodes(userId),
    queryFn: () => pkgNodesApi.list(userId),
    select: (r) => r.data,
    enabled: userId !== '',
    ...options,
  });
}

export function usePKGNode(
  userId: UserId,
  nodeId: NodeId,
  options?: Omit<UseQueryOptions<NodeResponse, Error, IGraphNodeDto>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.pkgNode(userId, nodeId),
    queryFn: () => pkgNodesApi.get(userId, nodeId),
    select: (r) => r.data,
    enabled: userId !== '' && nodeId !== '',
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useCreatePKGNode(
  userId: UserId,
  options?: UseMutationOptions<NodeResponse, Error, ICreateNodeInput>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => pkgNodesApi.create(userId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kgKeys.pkgNodes(userId) });
      void queryClient.invalidateQueries({ queryKey: kgKeys.comparison(userId) });
    },
    ...options,
  });
}

export function useUpdatePKGNode(
  userId: UserId,
  nodeId: NodeId,
  options?: UseMutationOptions<NodeResponse, Error, IUpdateNodeInput>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => pkgNodesApi.update(userId, nodeId, data),
    onSuccess: (response) => {
      queryClient.setQueryData(kgKeys.pkgNode(userId, nodeId), response);
      void queryClient.invalidateQueries({ queryKey: kgKeys.pkgNodes(userId) });
    },
    ...options,
  });
}

export function useDeletePKGNode(
  userId: UserId,
  nodeId: NodeId,
  options?: UseMutationOptions<void>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => pkgNodesApi.delete(userId, nodeId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: kgKeys.pkgNode(userId, nodeId) });
      void queryClient.invalidateQueries({ queryKey: kgKeys.pkgNodes(userId) });
    },
    ...options,
  });
}

// ============================================================================
// PKG Edge Hooks
// ============================================================================

export function usePKGEdges(
  userId: UserId,
  options?: Omit<UseQueryOptions<EdgesListResponse, Error, IGraphEdgeDto[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.pkgEdges(userId),
    queryFn: () => pkgEdgesApi.list(userId),
    select: (r) => r.data,
    enabled: userId !== '',
    ...options,
  });
}

export function useCreatePKGEdge(
  userId: UserId,
  options?: UseMutationOptions<EdgeResponse, Error, ICreateEdgeInput>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => pkgEdgesApi.create(userId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kgKeys.pkgEdges(userId) });
    },
    ...options,
  });
}

export function useDeletePKGEdge(
  userId: UserId,
  edgeId: EdgeId,
  options?: UseMutationOptions<void>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => pkgEdgesApi.delete(userId, edgeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kgKeys.pkgEdges(userId) });
    },
    ...options,
  });
}

// ============================================================================
// PKG Traversal Hooks
// ============================================================================

export function usePKGSubgraph(
  userId: UserId,
  params: ISubgraphParams,
  options?: Omit<UseQueryOptions<SubgraphResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.pkgSubgraph(userId, params),
    queryFn: () => pkgTraversalApi.getSubgraph(userId, params),
    enabled: userId !== '' && params.rootNodeId !== '',
    ...options,
  });
}

export function usePKGPrerequisites(
  userId: UserId,
  nodeId: NodeId,
  options?: Omit<UseQueryOptions<PrerequisiteChainResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.pkgPrerequisites(userId, nodeId),
    queryFn: () => pkgTraversalApi.getPrerequisites(userId, nodeId),
    enabled: userId !== '' && nodeId !== '',
    ...options,
  });
}

export function useKnowledgeFrontier(
  userId: UserId,
  options?: Omit<UseQueryOptions<FrontierResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.pkgFrontier(userId),
    queryFn: () => pkgTraversalApi.getFrontier(userId),
    enabled: userId !== '',
    staleTime: 2 * 60 * 1000,
    ...options,
  });
}

export function useBridgeNodes(
  userId: UserId,
  options?: Omit<UseQueryOptions<BridgeNodesResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.pkgBridges(userId),
    queryFn: () => pkgTraversalApi.getBridges(userId),
    enabled: userId !== '',
    ...options,
  });
}

export function usePKGCentrality(
  userId: UserId,
  options?: Omit<UseQueryOptions<CentralityResponse, Error, ICentralityDto>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.pkgCentrality(userId),
    queryFn: () => pkgTraversalApi.getCentrality(userId),
    select: (r) => r.data,
    enabled: userId !== '',
    ...options,
  });
}

export function useCommonAncestors(
  userId: UserId,
  options?: UseMutationOptions<NodesListResponse, Error, ICommonAncestorsInput>
) {
  return useMutation({
    mutationFn: (data) => pkgTraversalApi.getCommonAncestors(userId, data),
    ...options,
  });
}

export function usePKGOperations(
  userId: UserId,
  options?: Omit<UseQueryOptions<OperationsResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.pkgOps(userId),
    queryFn: () => pkgOperationsApi.list(userId),
    enabled: userId !== '',
    ...options,
  });
}

// ============================================================================
// CKG Hooks
// ============================================================================

export function useCKGNodes(
  options?: Omit<UseQueryOptions<NodesListResponse, Error, IGraphNodeDto[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.ckgNodes(),
    queryFn: ckgNodesApi.list,
    select: (r) => r.data,
    staleTime: 10 * 60 * 1000,
    ...options,
  });
}

export function useCKGEdges(
  options?: Omit<UseQueryOptions<EdgesListResponse, Error, IGraphEdgeDto[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.ckgEdges(),
    queryFn: ckgEdgesApi.list,
    select: (r) => r.data,
    staleTime: 10 * 60 * 1000,
    ...options,
  });
}

export function useCKGMutations(
  filters?: ICkgMutationFilters,
  options?: Omit<
    UseQueryOptions<CkgMutationsResponse, Error, ICkgMutationDto[]>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: kgKeys.ckgMutations(filters),
    queryFn: () => ckgMutationsApi.list(filters),
    select: (r) => r.data,
    ...options,
  });
}

export function useCKGMutation(
  id: MutationId,
  options?: Omit<
    UseQueryOptions<CkgMutationResponse, Error, ICkgMutationDto>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: kgKeys.ckgMutation(id),
    queryFn: () => ckgMutationsApi.get(id),
    select: (r) => r.data,
    enabled: id !== '',
    ...options,
  });
}

export function useApproveMutation(
  options?: UseMutationOptions<CkgMutationResponse, Error, { id: MutationId; note?: string }>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }) => ckgMutationsApi.approve(id, note),
    onSuccess: (response, { id }) => {
      queryClient.setQueryData(kgKeys.ckgMutation(id), response);
      void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() });
    },
    ...options,
  });
}

export function useRejectMutation(
  options?: UseMutationOptions<CkgMutationResponse, Error, { id: MutationId; note?: string }>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }) => ckgMutationsApi.reject(id, note),
    onSuccess: (response, { id }) => {
      queryClient.setQueryData(kgKeys.ckgMutation(id), response);
      void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() });
    },
    ...options,
  });
}

export function useCKGMutationAuditLog(
  id: MutationId,
  options?: Omit<
    UseQueryOptions<CkgMutationAuditLogResponse, Error, ICkgMutationAuditLogDto>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: [...kgKeys.ckgMutation(id), 'audit-log'] as const,
    queryFn: () => ckgMutationsApi.getAuditLog(id),
    select: (r) => r.data,
    enabled: id !== '',
    ...options,
  });
}

export function useRequestRevision(
  options?: UseMutationOptions<CkgMutationResponse, Error, { id: MutationId; feedback: string }>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, feedback }) => ckgMutationsApi.requestRevision(id, feedback),
    onSuccess: (response, { id }) => {
      queryClient.setQueryData(kgKeys.ckgMutation(id), response);
      void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() });
    },
    ...options,
  });
}

export function useCancelMutation(
  options?: UseMutationOptions<CkgMutationResponse, Error, MutationId>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => ckgMutationsApi.cancel(id),
    onSuccess: (response, id) => {
      queryClient.setQueryData(kgKeys.ckgMutation(id), response);
      void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() });
    },
    ...options,
  });
}

// ============================================================================
// Metrics + Health Hooks
// ============================================================================

export function useStructuralMetrics(
  userId: UserId,
  options?: Omit<UseQueryOptions<MetricsResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.metrics(userId),
    queryFn: () => metricsApi.get(userId),
    enabled: userId !== '',
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useMetricHistory(
  userId: UserId,
  options?: Omit<UseQueryOptions<MetricHistoryResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.metricHistory(userId),
    queryFn: () => metricsApi.getHistory(userId),
    enabled: userId !== '',
    ...options,
  });
}

export function useStructuralHealth(
  userId: UserId,
  options?: Omit<UseQueryOptions<HealthResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.health(userId),
    queryFn: () => healthApi.get(userId),
    enabled: userId !== '',
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

// ============================================================================
// Misconception Hooks
// ============================================================================

export function useMisconceptions(
  userId: UserId,
  options?: Omit<UseQueryOptions<MisconceptionsResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.misconceptions(userId),
    queryFn: () => misconceptionsApi.list(userId),
    enabled: userId !== '',
    ...options,
  });
}

export function useDetectMisconceptions(
  userId: UserId,
  options?: UseMutationOptions<MisconceptionDetectionResponse>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => misconceptionsApi.detect(userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kgKeys.misconceptions(userId) });
    },
    ...options,
  });
}

export function useUpdateMisconceptionStatus(
  userId: UserId,
  options?: UseMutationOptions<
    unknown,
    Error,
    { id: string; data: IUpdateMisconceptionStatusInput }
  >
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => misconceptionsApi.updateStatus(userId, id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kgKeys.misconceptions(userId) });
    },
    ...options,
  });
}

// ============================================================================
// Comparison Hook
// ============================================================================

export function usePKGCKGComparison(
  userId: UserId,
  options?: Omit<
    UseQueryOptions<ComparisonResponse, Error, IPkgCkgComparisonDto>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: kgKeys.comparison(userId),
    queryFn: () => comparisonApi.compare(userId),
    select: (r) => r.data,
    enabled: userId !== '',
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}
