/**
 * @noema/knowledge-graph-service — PKG Edge Routes Integration Tests
 *
 * Tests: POST, GET (list), GET (by id), PATCH, DELETE
 * Prefix: /api/v1/users/:userId/pkg/edges
 */

import type { EdgeId } from '@noema/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerPkgEdgeRoutes } from '../../src/api/rest/pkg-edge.routes.js';
import { EdgeNotFoundError } from '../../src/domain/knowledge-graph-service/errors/graph.errors.js';
import {
  graphEdge,
  OTHER_USER_ID,
  resetIdCounter,
  serviceResult,
  TEST_USER_ID,
  VALID_NODE_ID_A,
  VALID_NODE_ID_B,
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
  app = buildTestApp({ service, registerRoutes: registerPkgEdgeRoutes });
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

const BASE = `/api/v1/users/${TEST_USER_ID}/pkg/edges`;

// ============================================================================
// POST /api/v1/users/:userId/pkg/edges
// ============================================================================

describe('POST /users/:userId/pkg/edges', () => {
  it('creates an edge and returns 201', async () => {
    const edge = graphEdge();
    service.createEdge.mockResolvedValue(serviceResult(edge));

    const res = await app.inject({
      method: 'POST',
      url: BASE,
      payload: {
        edgeType: 'is_a',
        sourceNodeId: VALID_NODE_ID_A,
        targetNodeId: VALID_NODE_ID_B,
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data).toBeDefined();
    expect(service.createEdge).toHaveBeenCalledOnce();
  });

  it('returns 400 for missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: BASE,
      payload: { edgeType: 'is_a' }, // missing sourceNodeId, targetNodeId
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const unauthApp = buildUnauthenticatedTestApp({
      service,
      registerRoutes: registerPkgEdgeRoutes,
    });
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'POST',
      url: BASE,
      payload: {
        edgeType: 'is_a',
        sourceNodeId: 'node_src',
        targetNodeId: 'node_tgt',
      },
    });

    expect(res.statusCode).toBe(401);
    await unauthApp.close();
  });

  it('returns 403 when accessing another users PKG', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/users/${OTHER_USER_ID}/pkg/edges`,
      payload: {
        edgeType: 'is_a',
        sourceNodeId: 'node_src',
        targetNodeId: 'node_tgt',
      },
    });

    expect(res.statusCode).toBe(403);
  });
});

// ============================================================================
// GET /api/v1/users/:userId/pkg/edges
// ============================================================================

describe('GET /users/:userId/pkg/edges', () => {
  it('lists edges with pagination', async () => {
    const edges = [graphEdge(), graphEdge()];
    service.listEdges.mockResolvedValue(serviceResult({ items: edges, total: 2, hasMore: false }));

    const res = await app.inject({ method: 'GET', url: BASE });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toBeDefined();
    expect(service.listEdges).toHaveBeenCalledOnce();
  });

  it('passes studyMode through the edge filter', async () => {
    service.listEdges.mockResolvedValue(
      serviceResult({ items: [graphEdge()], total: 1, hasMore: false })
    );

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}?studyMode=language_learning`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.listEdges).toHaveBeenCalledWith(
      TEST_USER_ID,
      expect.objectContaining({
        userId: TEST_USER_ID,
        studyMode: 'language_learning',
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
// GET /api/v1/users/:userId/pkg/edges/:edgeId
// ============================================================================

describe('GET /users/:userId/pkg/edges/:edgeId', () => {
  it('returns an edge by ID', async () => {
    const edge = graphEdge({ edgeId: 'edge_123' as EdgeId });
    service.getEdge.mockResolvedValue(serviceResult(edge));

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/edge_123`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.edgeId).toBe('edge_123');
  });

  it('returns 404 for non-existent edge', async () => {
    service.getEdge.mockRejectedValue(new EdgeNotFoundError('edge_missing' as EdgeId));

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/edge_missing`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('EDGE_NOT_FOUND');
  });
});

// ============================================================================
// PATCH /api/v1/users/:userId/pkg/edges/:edgeId
// ============================================================================

describe('PATCH /users/:userId/pkg/edges/:edgeId', () => {
  it('updates an edge and returns the updated version', async () => {
    const updated = graphEdge();
    service.updateEdge.mockResolvedValue(serviceResult(updated));

    const res = await app.inject({
      method: 'PATCH',
      url: `${BASE}/edge_123`,
      payload: { weight: 0.5 },
    });

    expect(res.statusCode).toBe(200);
    expect(service.updateEdge).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// DELETE /api/v1/users/:userId/pkg/edges/:edgeId
// ============================================================================

describe('DELETE /users/:userId/pkg/edges/:edgeId', () => {
  it('deletes an edge and returns 204', async () => {
    service.deleteEdge.mockResolvedValue(serviceResult(undefined));

    const res = await app.inject({
      method: 'DELETE',
      url: `${BASE}/edge_123`,
    });

    expect(res.statusCode).toBe(204);
    expect(service.deleteEdge).toHaveBeenCalledOnce();
  });
});
