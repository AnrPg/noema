/**
 * @noema/knowledge-graph-service — Structural Health Routes Integration Tests
 *
 * Tests: GET health, GET stage
 * Prefix: /api/v1/users/:userId/health
 * Auth: authMiddleware + assertUserAccess
 */

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerStructuralHealthRoutes } from '../../src/api/rest/structural-health.routes.js';
import {
  OTHER_USER_ID,
  resetIdCounter,
  serviceResult,
  structuralHealthReport,
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
  app = buildTestApp({ service, registerRoutes: registerStructuralHealthRoutes });
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

const BASE = `/api/v1/users/${TEST_USER_ID}/health`;

// ============================================================================
// GET /api/v1/users/:userId/health
// ============================================================================

describe('GET /users/:userId/health', () => {
  it('returns structural health report for the user', async () => {
    const report = structuralHealthReport();
    service.getStructuralHealth.mockResolvedValue(serviceResult(report));

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}?domain=${TEST_DOMAIN}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toBeDefined();
    expect(service.getStructuralHealth).toHaveBeenCalledOnce();
  });

  it('returns 401 without auth', async () => {
    const unauthApp = buildUnauthenticatedTestApp({
      service,
      registerRoutes: registerStructuralHealthRoutes,
    });
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'GET',
      url: `${BASE}?domain=${TEST_DOMAIN}`,
    });

    expect(res.statusCode).toBe(401);
    await unauthApp.close();
  });

  it('returns 403 when accessing another users health', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/users/${OTHER_USER_ID}/health?domain=${TEST_DOMAIN}`,
    });

    expect(res.statusCode).toBe(403);
  });
});

// ============================================================================
// GET /api/v1/users/:userId/health/stage
// ============================================================================

describe('GET /users/:userId/health/stage', () => {
  it('returns metacognitive stage for the user', async () => {
    service.getMetacognitiveStage.mockResolvedValue(
      serviceResult({
        stage: 'developing',
        confidence: 0.85,
        evidence: [],
        domain: TEST_DOMAIN,
        assessedAt: '2025-01-01T00:00:00.000Z',
      })
    );

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/stage?domain=${TEST_DOMAIN}`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.getMetacognitiveStage).toHaveBeenCalledOnce();
  });
});
