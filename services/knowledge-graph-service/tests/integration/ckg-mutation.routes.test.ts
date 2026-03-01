/**
 * @noema/knowledge-graph-service — CKG Mutation Routes Integration Tests
 *
 * Tests: POST propose, GET list, GET health, GET by id, GET audit-log,
 *        POST cancel, POST retry, POST approve, POST reject
 * Prefix: /api/v1/ckg/mutations
 * Auth: authMiddleware (read), + assertAdminOrAgent (write)
 */

import type { MutationId } from '@noema/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerCkgMutationRoutes } from '../../src/api/rest/ckg-mutation.routes.js';
import { MutationNotFoundError } from '../../src/domain/knowledge-graph-service/errors/mutation.errors.js';
import {
  ADMIN_USER_ID,
  ckgMutation,
  mutationAuditEntry,
  resetIdCounter,
  serviceResult,
  TEST_DOMAIN,
} from '../fixtures/index.js';
import { mockKnowledgeGraphService } from '../helpers/mocks.js';
import { buildTestApp, buildUnauthenticatedTestApp } from './test-app.js';

// ============================================================================
// Setup — admin user for write operations
// ============================================================================

let app: FastifyInstance;
let readApp: FastifyInstance; // regular user (no admin role) for read routes
let service: ReturnType<typeof mockKnowledgeGraphService>;

beforeAll(async () => {
  service = mockKnowledgeGraphService();

  // Admin app: has admin role → passes assertAdminOrAgent
  app = buildTestApp({
    service,
    registerRoutes: registerCkgMutationRoutes,
    user: { sub: ADMIN_USER_ID, roles: ['admin'] },
  });
  await app.ready();

  // Regular user app: no admin/agent role → blocked by assertAdminOrAgent
  readApp = buildTestApp({
    service,
    registerRoutes: registerCkgMutationRoutes,
  });
  await readApp.ready();
});

afterAll(async () => {
  await app.close();
  await readApp.close();
});

beforeEach(() => {
  resetIdCounter();
  for (const fn of Object.values(service)) {
    fn.mockReset();
  }
});

const BASE = '/api/v1/ckg/mutations';

// ============================================================================
// POST /api/v1/ckg/mutations — Propose mutation
// ============================================================================

describe('POST /ckg/mutations', () => {
  it('creates a mutation proposal and returns 201', async () => {
    const mutation = ckgMutation();
    service.proposeMutation.mockResolvedValue(serviceResult(mutation));

    const res = await app.inject({
      method: 'POST',
      url: BASE,
      payload: {
        operations: [
          {
            type: 'add_node',
            nodeType: 'concept',
            label: 'Algebra',
            description: 'Fundamental branch of mathematics',
            domain: TEST_DOMAIN,
          },
        ],
        rationale: 'Adding algebra concept',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(service.proposeMutation).toHaveBeenCalledOnce();
  });

  it('returns 403 for non-admin users', async () => {
    const res = await readApp.inject({
      method: 'POST',
      url: BASE,
      payload: {
        operations: [
          { type: 'add_node', nodeType: 'concept', label: 'Algebra', domain: TEST_DOMAIN },
        ],
        rationale: 'Adding algebra concept',
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const unauthApp = buildUnauthenticatedTestApp({
      service,
      registerRoutes: registerCkgMutationRoutes,
    });
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'POST',
      url: BASE,
      payload: {
        operations: [
          { type: 'add_node', nodeType: 'concept', label: 'Algebra', domain: TEST_DOMAIN },
        ],
        rationale: 'Test',
      },
    });

    expect(res.statusCode).toBe(401);
    await unauthApp.close();
  });
});

// ============================================================================
// GET /api/v1/ckg/mutations — List mutations
// ============================================================================

describe('GET /ckg/mutations', () => {
  it('returns a list of mutations', async () => {
    service.listMutations.mockResolvedValue(
      serviceResult({
        items: [ckgMutation()],
        total: 1,
        hasMore: false,
      })
    );

    const res = await readApp.inject({
      method: 'GET',
      url: BASE,
    });

    expect(res.statusCode).toBe(200);
    expect(service.listMutations).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// GET /api/v1/ckg/mutations/health — Pipeline health
// ============================================================================

describe('GET /ckg/mutations/health', () => {
  it('returns pipeline health for admin', async () => {
    service.getMutationPipelineHealth.mockResolvedValue(
      serviceResult({
        status: 'healthy',
        totalMutations: 10,
        pendingCount: 2,
        failedCount: 0,
      })
    );

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/health`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.getMutationPipelineHealth).toHaveBeenCalledOnce();
  });

  it('returns 403 for non-admin users', async () => {
    const res = await readApp.inject({
      method: 'GET',
      url: `${BASE}/health`,
    });

    expect(res.statusCode).toBe(403);
  });
});

// ============================================================================
// GET /api/v1/ckg/mutations/:mutationId — Get mutation
// ============================================================================

describe('GET /ckg/mutations/:mutationId', () => {
  it('returns a mutation by id', async () => {
    const mutation = ckgMutation();
    service.getMutation.mockResolvedValue(serviceResult(mutation));

    const res = await readApp.inject({
      method: 'GET',
      url: `${BASE}/${mutation.mutationId}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toBeDefined();
    expect(service.getMutation).toHaveBeenCalledOnce();
  });

  it('returns 404 when mutation does not exist', async () => {
    const fakeId = 'mut_nonexistent' as MutationId;
    service.getMutation.mockRejectedValue(new MutationNotFoundError(fakeId));

    const res = await readApp.inject({
      method: 'GET',
      url: `${BASE}/${fakeId}`,
    });

    expect(res.statusCode).toBe(404);
  });
});

// ============================================================================
// GET /api/v1/ckg/mutations/:mutationId/audit-log
// ============================================================================

describe('GET /ckg/mutations/:mutationId/audit-log', () => {
  it('returns the audit log for a mutation', async () => {
    service.getMutationAuditLog.mockResolvedValue(serviceResult([mutationAuditEntry()]));

    const res = await readApp.inject({
      method: 'GET',
      url: `${BASE}/mut_test_0001/audit-log`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.getMutationAuditLog).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// POST /api/v1/ckg/mutations/:mutationId/cancel
// ============================================================================

describe('POST /ckg/mutations/:mutationId/cancel', () => {
  it('cancels a mutation', async () => {
    const mutation = ckgMutation({ state: 'cancelled' as never });
    service.cancelMutation.mockResolvedValue(serviceResult(mutation));

    const res = await app.inject({
      method: 'POST',
      url: `${BASE}/${mutation.mutationId}/cancel`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.cancelMutation).toHaveBeenCalledOnce();
  });

  it('returns 403 for non-admin users', async () => {
    const res = await readApp.inject({
      method: 'POST',
      url: `${BASE}/mut_test_0001/cancel`,
    });

    expect(res.statusCode).toBe(403);
  });
});

// ============================================================================
// POST /api/v1/ckg/mutations/:mutationId/retry
// ============================================================================

describe('POST /ckg/mutations/:mutationId/retry', () => {
  it('retries a mutation', async () => {
    const mutation = ckgMutation();
    service.retryMutation.mockResolvedValue(serviceResult(mutation));

    const res = await app.inject({
      method: 'POST',
      url: `${BASE}/${mutation.mutationId}/retry`,
    });

    expect(res.statusCode).toBe(201);
    expect(service.retryMutation).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// POST /api/v1/ckg/mutations/:mutationId/approve
// ============================================================================

describe('POST /ckg/mutations/:mutationId/approve', () => {
  it('approves an escalated mutation', async () => {
    const mutation = ckgMutation({ state: 'approved' as never });
    service.approveEscalatedMutation.mockResolvedValue(serviceResult(mutation));

    const res = await app.inject({
      method: 'POST',
      url: `${BASE}/mut_test_0001/approve`,
      payload: { reason: 'Looks good' },
    });

    expect(res.statusCode).toBe(200);
    expect(service.approveEscalatedMutation).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// POST /api/v1/ckg/mutations/:mutationId/reject
// ============================================================================

describe('POST /ckg/mutations/:mutationId/reject', () => {
  it('rejects an escalated mutation', async () => {
    const mutation = ckgMutation({ state: 'rejected' as never });
    service.rejectEscalatedMutation.mockResolvedValue(serviceResult(mutation));

    const res = await app.inject({
      method: 'POST',
      url: `${BASE}/mut_test_0001/reject`,
      payload: { reason: 'Insufficient evidence' },
    });

    expect(res.statusCode).toBe(200);
    expect(service.rejectEscalatedMutation).toHaveBeenCalledOnce();
  });
});
