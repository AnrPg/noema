/**
 * @noema/knowledge-graph-service — CKG Edge Routes Integration Tests
 *
 * Tests: GET (list), GET (by id)
 * Prefix: /api/v1/ckg/edges
 * Auth: authMiddleware only (no userId scoping)
 */

import type { EdgeId } from '@noema/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ICkgEdgeAuthoringService } from '../../src/application/knowledge-graph/edge-authoring/contracts.js';
import { registerCkgEdgeRoutes } from '../../src/api/rest/ckg-edge.routes.js';
import { EdgeNotFoundError } from '../../src/domain/knowledge-graph-service/errors/graph.errors.js';
import { graphEdge, resetIdCounter, serviceResult } from '../fixtures/index.js';
import { mockKnowledgeGraphService } from '../helpers/mocks.js';
import { buildTestApp, buildUnauthenticatedTestApp } from './test-app.js';

// ============================================================================
// Setup
// ============================================================================

let app: FastifyInstance;
let service: ReturnType<typeof mockKnowledgeGraphService>;
const edgeAuthoringService: ICkgEdgeAuthoringService = {
  preview: () =>
    Promise.reject(new Error('CKG edge authoring preview not configured for this test')),
};
const registerCkgEdgeRoutesForTest = (
  fastify: FastifyInstance,
  graphService: ReturnType<typeof mockKnowledgeGraphService>,
  authMiddleware: Parameters<typeof buildTestApp>[0]['registerRoutes'] extends (
    fastify: FastifyInstance,
    service: ReturnType<typeof mockKnowledgeGraphService>,
    authMiddleware: infer TAuthMiddleware,
    options?: infer TOptions
  ) => void
    ? TAuthMiddleware
    : never,
  options?: Parameters<typeof buildTestApp>[0]['registerRoutes'] extends (
    fastify: FastifyInstance,
    service: ReturnType<typeof mockKnowledgeGraphService>,
    authMiddleware: unknown,
    options?: infer TOptions
  ) => void
    ? TOptions
    : never
) => {
  registerCkgEdgeRoutes(fastify, graphService, edgeAuthoringService, authMiddleware, options);
};

beforeAll(async () => {
  service = mockKnowledgeGraphService();
  app = buildTestApp({ service, registerRoutes: registerCkgEdgeRoutesForTest });
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

const BASE = '/api/v1/ckg/edges';

// ============================================================================
// GET /api/v1/ckg/edges
// ============================================================================

describe('GET /ckg/edges', () => {
  it('returns a paginated list of CKG edges', async () => {
    const edges = [graphEdge({ graphType: 'ckg' }), graphEdge({ graphType: 'ckg' })];
    service.listCkgEdges.mockResolvedValue(
      serviceResult({
        items: edges,
        total: 2,
        hasMore: false,
      })
    );

    const res = await app.inject({
      method: 'GET',
      url: BASE,
    });

    expect(res.statusCode).toBe(200);
    expect(service.listCkgEdges).toHaveBeenCalledOnce();
  });

  it('returns 401 without auth', async () => {
    const unauthApp = buildUnauthenticatedTestApp({
      service,
      registerRoutes: registerCkgEdgeRoutesForTest,
    });
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'GET',
      url: BASE,
    });

    expect(res.statusCode).toBe(401);
    await unauthApp.close();
  });
});

// ============================================================================
// GET /api/v1/ckg/edges/:edgeId
// ============================================================================

describe('GET /ckg/edges/:edgeId', () => {
  it('returns a CKG edge by id', async () => {
    const edge = graphEdge({ graphType: 'ckg' });
    service.getCkgEdge.mockResolvedValue(serviceResult(edge));

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/${edge.edgeId}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toBeDefined();
    expect(service.getCkgEdge).toHaveBeenCalledOnce();
  });

  it('returns 404 when edge does not exist', async () => {
    const fakeId = 'edge_nonexistent' as EdgeId;
    service.getCkgEdge.mockRejectedValue(new EdgeNotFoundError(fakeId));

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/${fakeId}`,
    });

    expect(res.statusCode).toBe(404);
  });
});
