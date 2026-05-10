import { http, type IRequestConfig } from '../client.js';
import type {
  IAgentAsyncRunResponse,
  IAgentBatchJobDetailResponse,
  IAgentBatchJobListResponse,
  IAgentConfigDetailResponse,
  IAgentConfigDraftRequest,
  IAgentConfigListResponse,
  IAgentConfigVersionResponse,
  IAgentDetailResponse,
  IAgentListResponse,
  IAgentPreflightResponse,
  IAgentRunDetailResponse,
  IAgentRunListResponse,
  IAgentRunRequest,
  IAgentRunResponse,
  IAgentStatsResponse,
  IAgentToolStatsResponse,
  IAgentUserStatsResponse,
  ICompositeToolListResponse,
} from './types.js';

let agentsBaseUrl: string | null = null;

export function configureAgentsClient(baseUrl: string | null): void {
  agentsBaseUrl = baseUrl;
}

function getAgentsBaseUrl(): string | undefined {
  return agentsBaseUrl ?? undefined;
}

function agentsConfig(extra?: IRequestConfig): IRequestConfig {
  const config: IRequestConfig = { ...(extra ?? {}) };
  const baseUrl = getAgentsBaseUrl();
  if (baseUrl !== undefined) {
    config.baseUrl = baseUrl;
  }
  return config;
}

function withParams(
  params?: Record<string, string | number | boolean | readonly string[] | undefined>
): Record<string, string | number | boolean | readonly string[]> | undefined {
  if (!params) {
    return undefined;
  }

  const cleaned = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined)
  ) as Record<string, string | number | boolean | readonly string[]>;

  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

function agentsParamsConfig(
  params?: Record<string, string | number | boolean | readonly string[] | undefined>
): IRequestConfig {
  const config = agentsConfig();
  const cleaned = withParams(params);
  if (cleaned !== undefined) {
    config.params = cleaned;
  }
  return config;
}

function runRequestBody(request: IAgentRunRequest): Omit<IAgentRunRequest, 'requestTimeoutMs'> {
  const { requestTimeoutMs: _requestTimeoutMs, ...body } = request;
  return body;
}

export const agentsApi = {
  listAgents: (): Promise<IAgentListResponse> => http.get('/v1/agents', agentsConfig()),

  getAgent: (agentName: string): Promise<IAgentDetailResponse> =>
    http.get(`/v1/agents/${agentName}`, agentsConfig()),

  preflightAgent: (
    agentName: string,
    request: IAgentRunRequest
  ): Promise<IAgentPreflightResponse> =>
    http.post(`/v1/agents/${agentName}/preflight`, request, agentsConfig()),

  runAgent: (agentName: string, request: IAgentRunRequest): Promise<IAgentRunResponse> =>
    http.post(
      `/v1/agents/${agentName}/run`,
      runRequestBody(request),
      agentsConfig({ timeout: request.requestTimeoutMs ?? 30_000 })
    ),

  runAgentAsync: (
    agentName: string,
    request: IAgentRunRequest
  ): Promise<IAgentAsyncRunResponse> =>
    http.post(
      `/v1/agents/${agentName}/run-async`,
      request,
      agentsConfig({ timeout: request.requestTimeoutMs ?? 30_000 })
    ),

  getBatchJob: (jobId: string): Promise<IAgentBatchJobDetailResponse> =>
    http.get(`/v1/batch-jobs/${jobId}`, agentsConfig()),

  listBatchJobs: (
    filters?: Record<string, string | number | boolean | readonly string[] | undefined>
  ): Promise<IAgentBatchJobListResponse> =>
    http.get('/v1/batch-jobs', agentsParamsConfig(filters)),

  cancelBatchJob: (jobId: string): Promise<IAgentBatchJobDetailResponse> =>
    http.post(`/v1/batch-jobs/${jobId}/cancel`, undefined, agentsConfig()),

  listAdminBatchJobs: (
    filters?: Record<string, string | number | boolean | readonly string[] | undefined>
  ): Promise<IAgentBatchJobListResponse> =>
    http.get('/v1/admin/batch-jobs', agentsParamsConfig(filters)),

  getAdminBatchJobEvents: (jobId: string): Promise<IAgentBatchJobDetailResponse> =>
    http.get(`/v1/admin/batch-jobs/${jobId}/events`, agentsConfig()),

  listCompositeTools: (): Promise<ICompositeToolListResponse> =>
    http.get('/v1/agent-tools/composite-tools', agentsConfig()),

  getStats: (
    filters?: Record<string, string | number | boolean | readonly string[] | undefined>
  ): Promise<IAgentStatsResponse> =>
    http.get('/v1/admin/agents/stats', agentsParamsConfig(filters)),

  listRuns: (
    filters?: Record<string, string | number | boolean | readonly string[] | undefined>
  ): Promise<IAgentRunListResponse> =>
    http.get('/v1/admin/agents/runs', agentsParamsConfig(filters)),

  getRun: (runId: string): Promise<IAgentRunDetailResponse> =>
    http.get(`/v1/admin/agents/runs/${runId}`, agentsConfig()),

  getToolStats: (
    filters?: Record<string, string | number | boolean | readonly string[] | undefined>
  ): Promise<IAgentToolStatsResponse> =>
    http.get('/v1/admin/agents/tool-stats', agentsParamsConfig(filters)),

  getUserStats: (): Promise<IAgentUserStatsResponse> =>
    http.get('/v1/admin/agents/users', agentsConfig()),

  getAgentStats: (
    filters?: Record<string, string | number | boolean | readonly string[] | undefined>
  ): Promise<IAgentStatsResponse> =>
    http.get('/v1/admin/agents/stats', agentsParamsConfig(filters)),

  listConfigs: (): Promise<IAgentConfigListResponse> =>
    http.get('/v1/admin/agents/config', agentsConfig()),

  getConfig: (agentName: string): Promise<IAgentConfigDetailResponse> =>
    http.get(`/v1/admin/agents/config/${agentName}`, agentsConfig()),

  createConfigDraft: (
    agentName: string,
    request: IAgentConfigDraftRequest
  ): Promise<IAgentConfigVersionResponse> =>
    http.post(`/v1/admin/agents/config/${agentName}/drafts`, request, agentsConfig()),

  updateConfigDraft: (
    agentName: string,
    versionId: string,
    request: IAgentConfigDraftRequest
  ): Promise<IAgentConfigVersionResponse> =>
    http.put(`/v1/admin/agents/config/${agentName}/drafts/${versionId}`, request, agentsConfig()),

  activateConfigDraft: (
    agentName: string,
    versionId: string
  ): Promise<IAgentConfigVersionResponse> =>
    http.post(
      `/v1/admin/agents/config/${agentName}/drafts/${versionId}/activate`,
      undefined,
      agentsConfig()
    ),

  createRollbackSourceDraft: (
    agentName: string,
    versionId: string
  ): Promise<IAgentConfigVersionResponse> =>
    http.post(
      `/v1/admin/agents/config/${agentName}/versions/${versionId}/rollback`,
      undefined,
      agentsConfig()
    ),

  getRunTranscript: (runId: string): Promise<IAgentRunDetailResponse> =>
    http.get(`/v1/admin/agents/runs/${runId}/transcript`, agentsConfig()),

  getExportUrl: (runId: string, format: 'json' | 'md'): string => {
    const baseUrl = getAgentsBaseUrl() ?? '';
    return `${baseUrl}/v1/admin/agents/runs/${encodeURIComponent(runId)}/export.${format}`;
  },
};
