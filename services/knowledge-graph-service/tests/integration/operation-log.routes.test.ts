/**
 * @noema/knowledge-graph-service — PKG Operation Log Routes Integration Tests
 *
 * Tests: GET operation log
 * Prefix: /api/v1/users/:userId/pkg/operations
 * Auth: authMiddleware + assertUserAccess
 */

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerPkgOperationLogRoutes } from '../../src/api/rest/pkg-operation-log.routes.js';
import {
  operationLogEntry,
  OTHER_USER_ID,
  resetIdCounter,
  serviceResult,
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
  app = buildTestApp({ service, registerRoutes: registerPkgOperationLogRoutes });
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

const BASE = `/api/v1/users/${TEST_USER_ID}/pkg/operations`;

// ============================================================================
// GET /api/v1/users/:userId/pkg/operations
// ============================================================================

describe('GET /users/:userId/pkg/operations', () => {
  it('returns operation log entries for the user', async () => {
    service.getOperationLog.mockResolvedValue(
      serviceResult({
        items: [operationLogEntry()],
        total: 1,
        hasMore: false,
      })
    );

    const res = await app.inject({
      method: 'GET',
      url: BASE,
    });

    expect(res.statusCode).toBe(200);
    expect(service.getOperationLog).toHaveBeenCalledOnce();
  });

  it('returns 401 without auth', async () => {
    const unauthApp = buildUnauthenticatedTestApp({
      service,
      registerRoutes: registerPkgOperationLogRoutes,
    });
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'GET',
      url: BASE,
    });

    expect(res.statusCode).toBe(401);
    await unauthApp.close();
  });

  it('returns 403 when accessing another users operation log', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/users/${OTHER_USER_ID}/pkg/operations`,
    });

    expect(res.statusCode).toBe(403);
  });

  it('supports filtering and pagination query params', async () => {
    service.getOperationLog.mockResolvedValue(
      serviceResult({
        items: [],
        total: 0,
        hasMore: false,
      })
    );

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}?page=1&pageSize=20&operationType=PkgNodeCreated`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.getOperationLog).toHaveBeenCalledOnce();
  });
});
