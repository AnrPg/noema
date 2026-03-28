/**
 * @noema/knowledge-graph-service — CKG Node Routes Integration Tests
 *
 * Tests: GET (list), GET (by id)
 * Prefix: /api/v1/ckg/nodes
 * Auth: authMiddleware only (no userId scoping)
 */

import type { NodeId } from '@noema/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ICkgNodeBatchAuthoringService } from '../../src/application/knowledge-graph/node-authoring/contracts.js';
import { registerCkgNodeRoutes } from '../../src/api/rest/ckg-node.routes.js';
import { NodeNotFoundError } from '../../src/domain/knowledge-graph-service/errors/graph.errors.js';
import { graphNode, resetIdCounter, serviceResult, TEST_DOMAIN } from '../fixtures/index.js';
import { mockKnowledgeGraphService } from '../helpers/mocks.js';
import { buildTestApp, buildUnauthenticatedTestApp } from './test-app.js';

// ============================================================================
// Setup
// ============================================================================

let app: FastifyInstance;
let service: ReturnType<typeof mockKnowledgeGraphService>;
const nodeAuthoringService: ICkgNodeBatchAuthoringService = {
  preview: () =>
    Promise.reject(new Error('CKG node authoring preview not configured for this test')),
};
const registerCkgNodeRoutesForTest = (
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
  registerCkgNodeRoutes(fastify, graphService, nodeAuthoringService, authMiddleware, options);
};

beforeAll(async () => {
  service = mockKnowledgeGraphService();
  app = buildTestApp({ service, registerRoutes: registerCkgNodeRoutesForTest });
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

const BASE = '/api/v1/ckg/nodes';

// ============================================================================
// GET /api/v1/ckg/nodes
// ============================================================================

describe('GET /ckg/nodes', () => {
  it('returns a paginated list of CKG nodes', async () => {
    const nodes = [graphNode({ graphType: 'ckg' }), graphNode({ graphType: 'ckg' })];
    service.listCkgNodes.mockResolvedValue(
      serviceResult({
        items: nodes,
        total: 2,
        hasMore: false,
      })
    );

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}?domain=${TEST_DOMAIN}`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.listCkgNodes).toHaveBeenCalledOnce();
  });

  it('returns 401 without auth', async () => {
    const unauthApp = buildUnauthenticatedTestApp({
      service,
      registerRoutes: registerCkgNodeRoutesForTest,
    });
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'GET',
      url: BASE,
    });

    expect(res.statusCode).toBe(401);
    await unauthApp.close();
  });

  it('passes full-text search params through the CKG node filter', async () => {
    service.listCkgNodes.mockResolvedValue(
      serviceResult({
        items: [],
        total: 0,
        hasMore: false,
      })
    );

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}?search=algbra&searchMode=fulltext&sortBy=relevance&studyMode=knowledge_gaining`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.listCkgNodes).toHaveBeenCalledWith(
      expect.objectContaining({
        labelContains: 'algbra',
        searchMode: 'fulltext',
        sortBy: 'relevance',
        studyMode: 'knowledge_gaining',
      }),
      expect.objectContaining({
        limit: 20,
        offset: 0,
      }),
      expect.any(Object)
    );
  });
});

// ============================================================================
// GET /api/v1/ckg/nodes/:nodeId
// ============================================================================

describe('GET /ckg/nodes/:nodeId', () => {
  it('returns a CKG node by id', async () => {
    const node = graphNode({ graphType: 'ckg' });
    service.getCkgNode.mockResolvedValue(serviceResult(node));

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/${node.nodeId}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toBeDefined();
    expect(service.getCkgNode).toHaveBeenCalledOnce();
  });

  it('returns 404 when node does not exist', async () => {
    const fakeId = 'node_nonexistent' as NodeId;
    service.getCkgNode.mockRejectedValue(new NodeNotFoundError(fakeId));

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/${fakeId}`,
    });

    expect(res.statusCode).toBe(404);
  });
});
