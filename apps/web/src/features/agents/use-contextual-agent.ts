'use client';

import * as React from 'react';
import {
  agentsApi,
  type IAgentBatchJob,
  type IAgentRunRequest,
  type IAgentRunResult,
} from '@noema/api-client/agents';
import { useAuth } from '@noema/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAgentCapability, missingAgentContext } from './agent-capabilities';
import { normalizeAgentProposal, proposalJobPhase } from './normalize';
import type { EmbeddedAgentName, IAgentProposal, ProposalJobPhase } from './types';

function parseBatchJobError(errorMessage: string | null | undefined): Error | null {
  if (errorMessage === undefined || errorMessage === null || errorMessage.trim() === '') {
    return null;
  }

  const statusMatch = errorMessage.match(/\b(429|502|503|504)\b/);
  const status = statusMatch === null ? undefined : Number(statusMatch[1]);
  const normalizedMessage =
    status === 429
      ? 'Too many AI requests were sent at once. Please wait a moment and try again.'
      : errorMessage;

  return Object.assign(new Error(normalizedMessage), {
    status,
    code:
      status === 429
        ? 'UPSTREAM_SERVICE_RATE_LIMITED'
        : status !== undefined
          ? 'UPSTREAM_SERVICE_UNAVAILABLE'
          : 'BATCH_JOB_FAILED',
  });
}

export interface IUseContextualAgentOptions {
  agentName: EmbeddedAgentName;
  context?: Partial<IAgentRunRequest> | undefined;
  enabled?: boolean | undefined;
  executionPreference?: 'auto' | 'realtime' | 'batch' | undefined;
}

export function useContextualAgent(options: IUseContextualAgentOptions): {
  canRun: boolean;
  contextMissing: string[];
  isChecking: boolean;
  isRunning: boolean;
  isCancelling: boolean;
  runError: Error | null;
  proposal: IAgentProposal | null;
  latestRun: IAgentRunResult | undefined;
  jobId: string | null;
  batchJob: IAgentBatchJob | null;
  proposalJobPhase: ProposalJobPhase;
  canCancelJob: boolean;
  check: () => Promise<void>;
  run: () => Promise<void>;
  cancelJob: () => Promise<void>;
} {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const capability = getAgentCapability(options.agentName);
  const [latestRun, setLatestRun] = React.useState<IAgentRunResult | undefined>(undefined);
  const submissionInFlightRef = React.useRef(false);
  const jobId = latestRun?.jobId ?? null;

  const request = React.useMemo<IAgentRunRequest>(() => {
    return {
      userId: user?.id ?? '',
      executionPreference: options.executionPreference ?? capability.defaultExecution,
      allowFallback: true,
      ...(options.context ?? {}),
    };
  }, [capability.defaultExecution, options.context, options.executionPreference, user?.id]);

  const contextMissing = React.useMemo(
    () => missingAgentContext(capability, request),
    [capability, request]
  );
  const canRun = (options.enabled ?? true) && user !== null && contextMissing.length === 0;

  const preflight = useMutation({
    mutationFn: () => agentsApi.preflightAgent(options.agentName, request),
  });
  const runRealtime = useMutation({
    mutationFn: (runtimeRequest: IAgentRunRequest) => agentsApi.runAgent(options.agentName, runtimeRequest),
    onSuccess: (response) => {
      setLatestRun(response.data);
    },
  });
  const runAsync = useMutation({
    mutationFn: (runtimeRequest: IAgentRunRequest) =>
      agentsApi.runAgentAsync(options.agentName, runtimeRequest),
    onSuccess: (response) => {
      setLatestRun(response.data);
    },
  });
  const cancel = useMutation({
    mutationFn: () => (jobId === null ? Promise.resolve(null) : agentsApi.cancelBatchJob(jobId)),
    onSuccess: (response) => {
      if (response === null) {
        return;
      }

      const cancelledJob = response.data.job;
      queryClient.setQueryData(['embedded-agent-job', cancelledJob.jobId], response);
      setLatestRun((current) =>
        current === undefined
          ? current
          : {
              ...current,
              status: cancelledJob.status,
              execution:
                cancelledJob.result === undefined || cancelledJob.result === null
                  ? current.execution
                  : {
                      ...(current.execution ?? {}),
                      result: cancelledJob.result,
                    },
            }
      );
    },
  });

  const jobQuery = useQuery({
    queryKey: ['embedded-agent-job', jobId],
    queryFn: () => agentsApi.getBatchJob(jobId ?? ''),
    enabled: jobId !== null,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    refetchInterval: (query) => {
      const status = query.state.data?.data.job.status;
      if (status !== 'queued' && status !== 'submitted' && status !== 'running') {
        return false;
      }
      const suggestedPollSeconds =
        typeof latestRun?.pollAfterSeconds === 'number' && Number.isFinite(latestRun.pollAfterSeconds)
          ? latestRun.pollAfterSeconds
          : null;
      const intervalMs =
        suggestedPollSeconds !== null
          ? Math.max(suggestedPollSeconds * 1000, 10_000)
          : 10_000;
      return intervalMs;
    },
  });

  React.useEffect(() => {
    const job = jobQuery.data?.data.job;
    if (job === undefined) {
      return;
    }

    setLatestRun((current) =>
      current === undefined
        ? current
        : {
            ...current,
            status: job.status,
            execution:
              job.result === undefined || job.result === null
                ? current.execution
                : {
                    ...(current.execution ?? {}),
                    result: job.result,
                  },
          }
    );
  }, [jobQuery.data]);

  const batchJob = jobQuery.data?.data.job;
  const currentProposalJobPhase = proposalJobPhase(batchJob);
  const canCancelJob = batchJob?.isCancellable === true;
  const batchJobStatus = batchJob?.status.toLowerCase();
  const batchJobError =
    batchJobStatus === 'failed' ||
    batchJobStatus === 'finalization_failed'
      ? (parseBatchJobError(batchJob?.errorMessage) ??
        new Error(
          `Agent batch job ${jobId ?? 'unknown'} ended with status ${batchJob?.status ?? 'unknown'}.`
        ))
      : null;

  const polledJobStatus = jobQuery.data?.data.job.status.toLowerCase();
  const latestRunStatus = latestRun?.status?.toLowerCase();
  const isBatchJobRunning =
    polledJobStatus === 'queued' ||
    polledJobStatus === 'submitted' ||
    polledJobStatus === 'running' ||
    (jobId !== null &&
      (latestRunStatus === 'queued' ||
        latestRunStatus === 'submitted' ||
        latestRunStatus === 'running'));
  const hasActiveRequest =
    runRealtime.isPending || runAsync.isPending || cancel.isPending || isBatchJobRunning;

  async function buildRuntimeRequest(): Promise<IAgentRunRequest> {
    if (
      typeof request.requestTimeoutMs === 'number' &&
      Number.isFinite(request.requestTimeoutMs) &&
      request.requestTimeoutMs > 0
    ) {
      return request;
    }

    try {
      const agentDetail = await queryClient.fetchQuery({
        queryKey: ['embedded-agent-definition', options.agentName],
        queryFn: () => agentsApi.getAgent(options.agentName),
        staleTime: 5 * 60_000,
      });
      const maxLatencySeconds = agentDetail.data.maxLatencySeconds;
      if (typeof maxLatencySeconds !== 'number' || maxLatencySeconds <= 0) {
        return request;
      }

      return {
        ...request,
        requestTimeoutMs: Math.ceil(maxLatencySeconds * 1000),
      };
    } catch {
      return request;
    }
  }

  async function check(): Promise<void> {
    if (!canRun) {
      return;
    }
    await preflight.mutateAsync();
  }

  async function run(): Promise<void> {
    if (!canRun || hasActiveRequest || submissionInFlightRef.current) {
      return;
    }

    submissionInFlightRef.current = true;

    try {
      if ((options.executionPreference ?? capability.defaultExecution) === 'batch') {
        await runAsync.mutateAsync(await buildRuntimeRequest());
        return;
      }

      await runRealtime.mutateAsync(await buildRuntimeRequest());
    } finally {
      submissionInFlightRef.current = false;
    }
  }

  async function cancelJob(): Promise<void> {
    await cancel.mutateAsync();
  }

  return {
    canRun,
    contextMissing,
    isChecking: preflight.isPending,
    isRunning: hasActiveRequest,
    isCancelling: cancel.isPending,
    runError: preflight.error ?? runRealtime.error ?? runAsync.error ?? cancel.error ?? batchJobError,
    proposal: normalizeAgentProposal(options.agentName, latestRun),
    latestRun,
    jobId,
    batchJob: batchJob ?? null,
    proposalJobPhase: currentProposalJobPhase,
    canCancelJob,
    check,
    run,
    cancelJob,
  };
}
