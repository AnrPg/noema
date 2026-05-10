import type {
  IContentAgentContext,
  IContentAgentPort,
  IGeneratedCardDraft,
  IGeneratedTransformDraft,
} from '../../domain/content-service/content-agent.port.js';
import type { IContentGenerationJob } from '../../types/content.types.js';

export interface IHttpContentAgentClientConfig {
  baseUrl: string;
  serviceToken?: string;
  pollIntervalMs?: number;
  batchTimeoutMs?: number;
}

interface IAgentRunEnvelope {
  data?: {
    runId?: string;
    jobId?: string | null;
    status?: string;
    execution?: { result?: Record<string, unknown> | null } | null;
    pollAfterSeconds?: number | null;
  };
  error?: { message?: string };
}

interface IBatchJobEnvelope {
  data?: {
    job?: {
      status?: string;
      result?: Record<string, unknown> | null;
      errorMessage?: string | null;
    };
  };
  error?: { message?: string };
}

export class HttpContentAgentClient implements IContentAgentPort {
  private readonly baseUrl: string;
  private readonly serviceToken: string | undefined;
  private readonly pollIntervalMs: number;
  private readonly batchTimeoutMs: number;

  constructor(config: IHttpContentAgentClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.serviceToken = config.serviceToken;
    this.pollIntervalMs = config.pollIntervalMs ?? 1000;
    this.batchTimeoutMs = config.batchTimeoutMs ?? 60_000;
  }

  async generateContent(
    job: IContentGenerationJob,
    context: IContentAgentContext
  ): Promise<{ agentRunId: string; drafts: IGeneratedCardDraft[]; rejectedDrafts: unknown[] }> {
    const requestPayload = job.requestPayload ?? {};
    const curriculumContext =
      readRecord(requestPayload['curriculumContext']) ?? {};
    const studentContext =
      readRecord(requestPayload['studentContext']) ?? {};
    const varietyMandate =
      readRecord(requestPayload['varietyMandate']) ?? {};
    const budget = readRecord(requestPayload['budget']) ?? {};
    const desiredCardTypes = readStringArray(requestPayload['desiredCardTypes']) ?? job.requestedCardTypes;
    const operationName =
      job.documentIds.length > 0
        ? 'source_derived_generation'
        : readString(curriculumContext['curriculumId']) !== null
          ? 'curriculum_coverage_generation'
          : 'authoring_assistance';

    const result = await this.runAgent(
      'content-creation-orchestrator',
      {
        userId: context.userId,
        operationName,
        curriculumId: readString(curriculumContext['curriculumId']) ?? null,
        conceptIds: job.conceptIds,
        selectedNodeIds: readStringArray(curriculumContext['selectedNodeIds']) ?? [],
        desiredCardTypes,
        documentIds: job.documentIds,
        executionPreference: 'auto',
        payload: {
          operationName,
          mode: job.mode,
          budget,
          curriculumContext,
          studentContext,
          varietyMandate,
        },
      },
      context
    );

    return {
      agentRunId: String(result['agentRunId'] ?? ''),
      drafts: ((result['cards'] as IGeneratedCardDraft[] | undefined) ?? []),
      rejectedDrafts: ((result['rejectedDrafts'] as unknown[] | undefined) ?? []),
    };
  }

  async transformCard(
    input: Parameters<IContentAgentPort['transformCard']>[0],
    context: IContentAgentContext
  ): Promise<{ agentRunId: string; drafts: IGeneratedTransformDraft[]; rejectedDrafts: unknown[] }> {
    const targetCardTypes = input.targetCardTypes ?? (input.targetCardType ? [input.targetCardType] : []);
    const result = await this.runAgent(
      'content-transform-agent',
      {
        userId: context.userId,
        operationName: 'transform_content',
        selectedCardIds: [input.parentCardId],
        desiredCardTypes: targetCardTypes,
        executionPreference: 'realtime',
        allowFallback: false,
        payload: {
          operationName: 'transform_content',
          parentCardId: input.parentCardId,
          transformationKind: input.transformationKind,
          targetCardType: input.targetCardType,
          targetCardTypes,
          count: input.count ?? 1,
          prompt: input.prompt,
          card: input.card ?? { content: {} },
        },
      },
      context
    );

    return {
      agentRunId: String(result['agentRunId'] ?? ''),
      drafts: ((result['cards'] as IGeneratedTransformDraft[] | undefined) ?? []),
      rejectedDrafts: ((result['rejectedDrafts'] as unknown[] | undefined) ?? []),
    };
  }

  private async runAgent(
    agentName: string,
    body: Record<string, unknown>,
    context: IContentAgentContext
  ): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}/v1/agents/${agentName}/run`, {
      method: 'POST',
      headers: this.headers(context),
      body: JSON.stringify(body),
    });
    const envelope = (await response.json()) as IAgentRunEnvelope;
    if (!response.ok) {
      throw new Error(
        envelope.error?.message ??
          `Agent runtime request failed: ${String(response.status)}`
      );
    }

    const run = envelope.data ?? {};
    if (run.status === 'queued' && typeof run.jobId === 'string' && run.jobId.length > 0) {
      return await this.waitForBatchResult(run.jobId, context, run.pollAfterSeconds ?? null);
    }

    const result = run.execution?.result;
    if (!result || typeof result !== 'object') {
      throw new Error(`Agent runtime did not return a usable result for ${agentName}`);
    }
    return result;
  }

  private async waitForBatchResult(
    jobId: string,
    context: IContentAgentContext,
    pollAfterSeconds: number | null
  ): Promise<Record<string, unknown>> {
    const timeoutAt = Date.now() + this.batchTimeoutMs;
    const initialDelay = (pollAfterSeconds ?? 0) * 1000;
    if (initialDelay > 0) {
      await delay(initialDelay);
    }

    while (Date.now() < timeoutAt) {
      const response = await fetch(`${this.baseUrl}/v1/batch-jobs/${jobId}`, {
        method: 'GET',
        headers: this.headers(context),
      });
      const envelope = (await response.json()) as IBatchJobEnvelope;
      if (!response.ok) {
        throw new Error(
          envelope.error?.message ??
            `Failed to poll agent batch job ${jobId}: ${String(response.status)}`
        );
      }

      const job = envelope.data?.job;
      if (!job) {
        await delay(this.pollIntervalMs);
        continue;
      }
      if (job.status === 'completed' && job.result && typeof job.result === 'object') {
        return job.result;
      }
      if (job.status === 'failed' || job.status === 'cancelled') {
        throw new Error(
          job.errorMessage ?? `Agent batch job ${jobId} failed with status ${String(job.status)}`
        );
      }
      await delay(this.pollIntervalMs);
    }

    throw new Error(`Timed out waiting for agent batch job ${jobId}`);
  }

  private headers(context: IContentAgentContext): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-user-id': context.userId,
      'x-correlation-id': context.correlationId,
    };
    if (this.serviceToken !== undefined && this.serviceToken.trim().length > 0) {
      headers['authorization'] = `Bearer ${this.serviceToken}`;
    }
    return headers;
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? (value as string[])
    : null;
}
