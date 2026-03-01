/**
 * @noema/knowledge-graph-service — Metrics Routes Integration Tests
 *
 * Tests: GET metrics, POST compute, GET history
 * Prefix: /api/v1/users/:userId/metrics
 * Auth: authMiddleware + assertUserAccess
 */

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerMetricsRoutes } from '../../src/api/rest/metrics.routes.js';
import {
  OTHER_USER_ID,
  resetIdCounter,
  serviceResult,
  structuralMetrics,
  TEST_DOMAIN,
  TEST_USER_ID,
} from '../fixtures/index.js';
import { mockKnowledgeGraphService } from '../helpers/mocks.js';
import { buildTestApp, buildUnauthenticatedTestApp } from './test-app.js';

// ============================================================================
// Setup
// ============================================================================

let app: FastifyInstance;
let service: ReturnType<typeof mockKnowledgeGraphService>;

beforeAll(async () => {
  service = mockKnowledgeGraphService();
  app = buildTestApp({ service, registerRoutes: registerMetricsRoutes });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  resetIdCounter();
  for (const fn of Object.values(service)) {
    fn.mockReset();
  }
});

const BASE = `/api/v1/users/${TEST_USER_ID}/metrics`;

// ============================================================================
// GET /api/v1/users/:userId/metrics
// ============================================================================

describe('GET /users/:userId/metrics', () => {
  it('returns structural metrics for the user', async () => {
    const metrics = structuralMetrics();
    service.getMetrics.mockResolvedValue(serviceResult(metrics));

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}?domain=${TEST_DOMAIN}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toBeDefined();
    expect(service.getMetrics).toHaveBeenCalledOnce();
  });

  it('returns 401 without auth', async () => {
    const unauthApp = buildUnauthenticatedTestApp({
      service,
      registerRoutes: registerMetricsRoutes,
    });
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'GET',
      url: `${BASE}?domain=${TEST_DOMAIN}`,
    });

    expect(res.statusCode).toBe(401);
    await unauthApp.close();
  });

  it('returns 403 when accessing another users metrics', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/users/${OTHER_USER_ID}/metrics?domain=${TEST_DOMAIN}`,
    });

    expect(res.statusCode).toBe(403);
  });
});

// ============================================================================
// POST /api/v1/users/:userId/metrics/compute
// ============================================================================

describe('POST /users/:userId/metrics/compute', () => {
  it('triggers metrics computation and returns result', async () => {
    const metrics = structuralMetrics();
    service.computeMetrics.mockResolvedValue(serviceResult(metrics));

    const res = await app.inject({
      method: 'POST',
      url: `${BASE}/compute`,
      payload: { domain: TEST_DOMAIN },
    });

    expect(res.statusCode).toBe(200);
    expect(service.computeMetrics).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// GET /api/v1/users/:userId/metrics/history
// ============================================================================

describe('GET /users/:userId/metrics/history', () => {
  it('returns metrics history for the user', async () => {
    service.getMetricsHistory.mockResolvedValue(
      serviceResult({
        entries: [],
        total: 0,
      })
    );

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/history?domain=${TEST_DOMAIN}`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.getMetricsHistory).toHaveBeenCalledOnce();
  });
});
