/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types */

import {
  useMutation,
  useQuery,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { agentsApi } from './api.js';
import type {
  IAgentDetailResponse,
  IAgentConfigDetailResponse,
  IAgentConfigDraftRequest,
  IAgentConfigListResponse,
  IAgentConfigVersionResponse,
  IAgentListResponse,
  IAgentPreflightResponse,
  IAgentRunRequest,
  IAgentRunDetailResponse,
  IAgentRunListResponse,
  IAgentRunResponse,
  IAgentStatsResponse,
  IAgentToolStatsResponse,
  IAgentUserStatsResponse,
  ICompositeToolListResponse,
} from './types.js';

export const agentKeys = {
  all: ['agent-runtime'] as const,
  list: () => [...agentKeys.all, 'list'] as const,
  detail: (agentName: string) => [...agentKeys.all, 'detail', agentName] as const,
  tools: () => [...agentKeys.all, 'tools'] as const,
  stats: (filters?: Record<string, unknown>) => [...agentKeys.all, 'stats', filters ?? {}] as const,
  runs: (filters?: Record<string, unknown>) => [...agentKeys.all, 'runs', filters ?? {}] as const,
  run: (runId: string) => [...agentKeys.all, 'run', runId] as const,
  toolStats: (filters?: Record<string, unknown>) => [...agentKeys.all, 'tool-stats', filters ?? {}] as const,
  users: () => [...agentKeys.all, 'users'] as const,
  configList: () => [...agentKeys.all, 'config-list'] as const,
  config: (agentName: string) => [...agentKeys.all, 'config', agentName] as const,
};

export function useAgents(
  options?: Omit<UseQueryOptions<IAgentListResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: agentKeys.list(),
    queryFn: agentsApi.listAgents,
    staleTime: 60 * 1000,
    ...options,
  });
}

export function useAgent(
  agentName: string,
  options?: Omit<UseQueryOptions<IAgentDetailResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: agentKeys.detail(agentName),
    queryFn: () => agentsApi.getAgent(agentName),
    enabled: agentName.trim().length > 0,
    staleTime: 60 * 1000,
    ...options,
  });
}

export function useAgentTools(
  options?: Omit<UseQueryOptions<ICompositeToolListResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: agentKeys.tools(),
    queryFn: agentsApi.listCompositeTools,
    staleTime: 60 * 1000,
    ...options,
  });
}

export function useAgentPreflight(
  agentName: string,
  options?: UseMutationOptions<IAgentPreflightResponse, Error, IAgentRunRequest>
) {
  return useMutation({
    mutationFn: (request) => agentsApi.preflightAgent(agentName, request),
    ...options,
  });
}

export function useAgentRun(
  agentName: string,
  options?: UseMutationOptions<IAgentRunResponse, Error, IAgentRunRequest>
) {
  return useMutation({
    mutationFn: (request) => agentsApi.runAgent(agentName, request),
    ...options,
  });
}

export function useAgentStats(
  filters?: Record<string, string | number | boolean | readonly string[] | undefined>,
  options?: Omit<UseQueryOptions<IAgentStatsResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: agentKeys.stats(filters),
    queryFn: () => agentsApi.getStats(filters),
    staleTime: 30 * 1000,
    ...options,
  });
}

export function useAgentRuns(
  filters?: Record<string, string | number | boolean | readonly string[] | undefined>,
  options?: Omit<UseQueryOptions<IAgentRunListResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: agentKeys.runs(filters),
    queryFn: () => agentsApi.listRuns(filters),
    staleTime: 15 * 1000,
    ...options,
  });
}

export function useAgentRunDetail(
  runId: string,
  options?: Omit<UseQueryOptions<IAgentRunDetailResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: agentKeys.run(runId),
    queryFn: () => agentsApi.getRun(runId),
    enabled: runId.trim().length > 0,
    staleTime: 15 * 1000,
    ...options,
  });
}

export function useAgentToolStats(
  filters?: Record<string, string | number | boolean | readonly string[] | undefined>,
  options?: Omit<UseQueryOptions<IAgentToolStatsResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: agentKeys.toolStats(filters),
    queryFn: () => agentsApi.getToolStats(filters),
    staleTime: 30 * 1000,
    ...options,
  });
}

export function useAgentUserStats(
  options?: Omit<UseQueryOptions<IAgentUserStatsResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: agentKeys.users(),
    queryFn: agentsApi.getUserStats,
    staleTime: 30 * 1000,
    ...options,
  });
}

export function useAgentConfigList(
  options?: Omit<UseQueryOptions<IAgentConfigListResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: agentKeys.configList(),
    queryFn: agentsApi.listConfigs,
    staleTime: 10 * 1000,
    ...options,
  });
}

export function useAgentConfig(
  agentName: string,
  options?: Omit<UseQueryOptions<IAgentConfigDetailResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: agentKeys.config(agentName),
    queryFn: () => agentsApi.getConfig(agentName),
    enabled: agentName.trim().length > 0,
    staleTime: 10 * 1000,
    ...options,
  });
}

export function useCreateAgentConfigDraft(
  agentName: string,
  options?: UseMutationOptions<IAgentConfigVersionResponse, Error, IAgentConfigDraftRequest>
) {
  return useMutation({
    mutationFn: (request) => agentsApi.createConfigDraft(agentName, request),
    ...options,
  });
}

export function useUpdateAgentConfigDraft(
  agentName: string,
  versionId: string,
  options?: UseMutationOptions<IAgentConfigVersionResponse, Error, IAgentConfigDraftRequest>
) {
  return useMutation({
    mutationFn: (request) => agentsApi.updateConfigDraft(agentName, versionId, request),
    ...options,
  });
}

export function useActivateAgentConfigDraft(
  agentName: string,
  versionId: string,
  options?: UseMutationOptions<IAgentConfigVersionResponse, Error, void>
) {
  return useMutation({
    mutationFn: () => agentsApi.activateConfigDraft(agentName, versionId),
    ...options,
  });
}

export function useCreateRollbackSourceDraft(
  agentName: string,
  versionId: string,
  options?: UseMutationOptions<IAgentConfigVersionResponse, Error, void>
) {
  return useMutation({
    mutationFn: () => agentsApi.createRollbackSourceDraft(agentName, versionId),
    ...options,
  });
}
