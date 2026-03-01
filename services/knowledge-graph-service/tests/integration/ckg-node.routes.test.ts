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

beforeAll(async () => {
  service = mockKnowledgeGraphService();
  app = buildTestApp({ service, registerRoutes: registerCkgNodeRoutes });
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
      registerRoutes: registerCkgNodeRoutes,
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
