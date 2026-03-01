/**
 * @noema/knowledge-graph-service — Misconception Routes Integration Tests
 *
 * Tests: GET list, POST detect, PATCH status
 * Prefix: /api/v1/users/:userId/misconceptions
 * Auth: authMiddleware + assertUserAccess
 */

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerMisconceptionRoutes } from '../../src/api/rest/misconception.routes.js';
import {
  misconceptionDetection,
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
  app = buildTestApp({ service, registerRoutes: registerMisconceptionRoutes });
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

const BASE = `/api/v1/users/${TEST_USER_ID}/misconceptions`;

// ============================================================================
// GET /api/v1/users/:userId/misconceptions
// ============================================================================

describe('GET /users/:userId/misconceptions', () => {
  it('returns misconception detections for the user', async () => {
    service.getMisconceptions.mockResolvedValue(serviceResult([misconceptionDetection()]));

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}?domain=${TEST_DOMAIN}`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.getMisconceptions).toHaveBeenCalledOnce();
  });

  it('returns 401 without auth', async () => {
    const unauthApp = buildUnauthenticatedTestApp({
      service,
      registerRoutes: registerMisconceptionRoutes,
    });
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'GET',
      url: `${BASE}?domain=${TEST_DOMAIN}`,
    });

    expect(res.statusCode).toBe(401);
    await unauthApp.close();
  });

  it('returns 403 when accessing another users misconceptions', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/users/${OTHER_USER_ID}/misconceptions?domain=${TEST_DOMAIN}`,
    });

    expect(res.statusCode).toBe(403);
  });
});

// ============================================================================
// POST /api/v1/users/:userId/misconceptions/detect
// ============================================================================

describe('POST /users/:userId/misconceptions/detect', () => {
  it('triggers misconception detection', async () => {
    service.detectMisconceptions.mockResolvedValue(serviceResult([misconceptionDetection()]));

    const res = await app.inject({
      method: 'POST',
      url: `${BASE}/detect`,
      payload: { domain: TEST_DOMAIN },
    });

    expect(res.statusCode).toBe(200);
    expect(service.detectMisconceptions).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// PATCH /api/v1/users/:userId/misconceptions/:detectionId/status
// ============================================================================

describe('PATCH /users/:userId/misconceptions/:detectionId/status', () => {
  it('updates misconception status', async () => {
    const detection = misconceptionDetection({ status: 'resolved' });
    service.updateMisconceptionStatus.mockResolvedValue(serviceResult(detection));

    const res = await app.inject({
      method: 'PATCH',
      url: `${BASE}/det_001/status`,
      payload: { status: 'resolved' },
    });

    expect(res.statusCode).toBe(204);
    expect(service.updateMisconceptionStatus).toHaveBeenCalledOnce();
  });
});
