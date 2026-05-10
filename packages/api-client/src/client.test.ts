import { beforeEach, describe, expect, it, vi } from 'vitest';

import { configureApiClient, request } from './client.js';
import type { ApiRequestError } from './client.js';

describe('request', () => {
  beforeEach(() => {
    configureApiClient({
      baseUrl: 'http://localhost:3000',
    });
    vi.restoreAllMocks();
  });

  it('classifies invalid JSON success payloads as BAD_RESPONSE instead of NETWORK_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('not-json', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    );

    await expect(request('GET', '/api/test')).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 200,
      code: 'BAD_RESPONSE',
    } satisfies Partial<ApiRequestError>);

    vi.unstubAllGlobals();
  });

  it('keeps genuine fetch failures classified as NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')));

    await expect(request('GET', '/api/test')).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 0,
      code: 'NETWORK_ERROR',
    } satisfies Partial<ApiRequestError>);

    vi.unstubAllGlobals();
  });
});
