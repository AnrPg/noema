import { beforeEach, describe, expect, it, vi } from 'vitest';

const { httpGet, httpPost, httpPut } = vi.hoisted(() => ({
  httpGet: vi.fn(),
  httpPost: vi.fn(),
  httpPut: vi.fn(),
}));

vi.mock('../client.js', () => ({
  http: {
    get: httpGet,
    post: httpPost,
    put: httpPut,
  },
}));

import { agentsApi, configureAgentsClient } from './api.js';

describe('agents api', () => {
  beforeEach(() => {
    configureAgentsClient('http://localhost:8011');
    httpGet.mockReset();
    httpPost.mockReset();
    httpPut.mockReset();
  });

  it('lists agent wrappers from the dedicated agent runtime base URL', async () => {
    const response = { data: { agents: [], count: 0 } };
    httpGet.mockResolvedValue(response);

    await expect(agentsApi.listAgents()).resolves.toEqual(response);

    expect(httpGet).toHaveBeenCalledWith('/v1/agents', {
      baseUrl: 'http://localhost:8011',
    });
  });

  it('routes preflight requests through the wrapper-specific endpoint', async () => {
    const response = { data: { decision: { allowed: true } } };
    const request = {
      userId: 'user_123',
      sessionId: 'session_123',
      payload: { explain: true },
    };
    httpPost.mockResolvedValue(response);

    await expect(agentsApi.preflightAgent('cognitive-copilot', request)).resolves.toEqual(
      response
    );

    expect(httpPost).toHaveBeenCalledWith(
      '/v1/agents/cognitive-copilot/preflight',
      request,
      {
        baseUrl: 'http://localhost:8011',
      }
    );
  });

  it('routes async run requests through the batch-capable endpoint', async () => {
    const response = { data: { runId: 'run_1', jobId: 'job_1', status: 'queued' } };
    const request = {
      userId: 'user_123',
      sessionId: 'session_123',
      executionPreference: 'batch' as const,
      requestTimeoutMs: 90_000,
    };
    httpPost.mockResolvedValue(response);

    await expect(agentsApi.runAgentAsync('content-creation-orchestrator', request)).resolves.toEqual(
      response
    );

    expect(httpPost).toHaveBeenCalledWith(
      '/v1/agents/content-creation-orchestrator/run-async',
      request,
      {
        baseUrl: 'http://localhost:8011',
        timeout: 90_000,
      }
    );
  });

  it('uses the configured realtime timeout without sending it in the request body', async () => {
    const response = { data: { runId: 'run_1', status: 'completed' } };
    const request = {
      userId: 'user_123',
      conceptIds: ['Family'],
      requestTimeoutMs: 90_000,
    };
    httpPost.mockResolvedValue(response);

    await expect(agentsApi.runAgent('content-creator-agent', request)).resolves.toEqual(response);

    expect(httpPost).toHaveBeenCalledWith(
      '/v1/agents/content-creator-agent/run',
      {
        userId: 'user_123',
        conceptIds: ['Family'],
      },
      {
        baseUrl: 'http://localhost:8011',
        timeout: 90_000,
      }
    );
  });

  it('lists batch jobs through the dedicated queue endpoint', async () => {
    const response = { data: { items: [], count: 0 } };
    httpGet.mockResolvedValue(response);

    await expect(agentsApi.listBatchJobs({ status: 'queued' })).resolves.toEqual(response);

    expect(httpGet).toHaveBeenCalledWith('/v1/batch-jobs', {
      baseUrl: 'http://localhost:8011',
      params: { status: 'queued' },
    });
  });

  it('cancels batch jobs through the dedicated queue endpoint', async () => {
    const response = {
      data: {
        job: {
          jobId: 'job_1',
          status: 'cancelled',
          isCancellable: false,
          cancellationWindow: 'none',
        },
        attempts: [],
        events: [],
      },
    };
    httpPost.mockResolvedValue(response);

    await expect(agentsApi.cancelBatchJob('job_1')).resolves.toEqual(response);

    expect(httpPost).toHaveBeenCalledWith('/v1/batch-jobs/job_1/cancel', undefined, {
      baseUrl: 'http://localhost:8011',
    });
  });
});
