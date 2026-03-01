/**
 * @noema/knowledge-graph-service — Comparison Routes Integration Tests
 *
 * Tests: GET compare PKG ↔ CKG
 * Prefix: /api/v1/users/:userId/comparison
 * Auth: authMiddleware + assertUserAccess
 */

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerComparisonRoutes } from '../../src/api/rest/comparison.routes.js';
import {
  OTHER_USER_ID,
  resetIdCounter,
  serviceResult,
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
  app = buildTestApp({ service, registerRoutes: registerComparisonRoutes });
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

const BASE = `/api/v1/users/${TEST_USER_ID}/comparison`;

// ============================================================================
// GET /api/v1/users/:userId/comparison
// ============================================================================

describe('GET /users/:userId/comparison', () => {
  it('returns PKG ↔ CKG comparison', async () => {
    service.compareWithCkg.mockResolvedValue(
      serviceResult({
        userId: TEST_USER_ID,
        domain: TEST_DOMAIN,
        coverageRatio: 0.65,
        missingCkgNodes: [],
        extraPkgNodes: [],
        structuralDifferences: [],
        comparedAt: '2025-01-01T00:00:00.000Z',
      })
    );

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}?domain=${TEST_DOMAIN}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toBeDefined();
    expect(service.compareWithCkg).toHaveBeenCalledOnce();
  });

  it('returns 401 without auth', async () => {
    const unauthApp = buildUnauthenticatedTestApp({
      service,
      registerRoutes: registerComparisonRoutes,
    });
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'GET',
      url: `${BASE}?domain=${TEST_DOMAIN}`,
    });

    expect(res.statusCode).toBe(401);
    await unauthApp.close();
  });

  it('returns 403 when accessing another users comparison', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/users/${OTHER_USER_ID}/comparison?domain=${TEST_DOMAIN}`,
    });

    expect(res.statusCode).toBe(403);
  });
});
