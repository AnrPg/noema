/**
 * @noema/knowledge-graph-service — PKG Node Routes Integration Tests
 *
 * Tests: POST, GET (list), GET (by id), PATCH, DELETE
 * Prefix: /api/v1/users/:userId/pkg/nodes
 */

import type { NodeId, UserId } from '@noema/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerPkgNodeRoutes } from '../../src/api/rest/pkg-node.routes.js';
import { NodeNotFoundError } from '../../src/domain/knowledge-graph-service/errors/graph.errors.js';
import {
  graphNode,
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
  app = buildTestApp({ service, registerRoutes: registerPkgNodeRoutes });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  resetIdCounter();
  // Reset all mocks between tests
  for (const fn of Object.values(service)) {
    fn.mockReset();
  }
});

const BASE = `/api/v1/users/${TEST_USER_ID}/pkg/nodes`;

// ============================================================================
// POST /api/v1/users/:userId/pkg/nodes
// ============================================================================

describe('POST /users/:userId/pkg/nodes', () => {
  it('creates a node and returns 201', async () => {
    const node = graphNode({ userId: TEST_USER_ID });
    service.createNode.mockResolvedValue(serviceResult(node));

    const res = await app.inject({
      method: 'POST',
      url: BASE,
      payload: {
        label: 'Calculus',
        nodeType: 'concept',
        domain: TEST_DOMAIN,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.metadata).toBeDefined();
    expect(service.createNode).toHaveBeenCalledOnce();
  });

  it('returns 400 for missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: BASE,
      payload: { label: 'No type' }, // missing nodeType and domain
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const unauthApp = buildUnauthenticatedTestApp({
      service,
      registerRoutes: registerPkgNodeRoutes,
    });
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'POST',
      url: BASE,
      payload: { label: 'Calc', nodeType: 'concept', domain: TEST_DOMAIN },
    });

    expect(res.statusCode).toBe(401);
    await unauthApp.close();
  });

  it('returns 403 when accessing another users PKG', async () => {
    const otherBase = `/api/v1/users/${OTHER_USER_ID}/pkg/nodes`;

    const res = await app.inject({
      method: 'POST',
      url: otherBase,
      payload: { label: 'Calc', nodeType: 'concept', domain: TEST_DOMAIN },
    });

    expect(res.statusCode).toBe(403);
  });
});

// ============================================================================
// GET /api/v1/users/:userId/pkg/nodes
// ============================================================================

describe('GET /users/:userId/pkg/nodes', () => {
  it('lists nodes with pagination', async () => {
    const nodes = [graphNode(), graphNode()];
    service.listNodes.mockResolvedValue(serviceResult({ items: nodes, total: 2, hasMore: false }));

    const res = await app.inject({ method: 'GET', url: BASE });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(service.listNodes).toHaveBeenCalledOnce();
  });

  it('passes query params to the service', async () => {
    service.listNodes.mockResolvedValue(serviceResult({ items: [], total: 0, hasMore: false }));

    await app.inject({
      method: 'GET',
      url: `${BASE}?domain=${TEST_DOMAIN}&page=2&pageSize=5`,
    });

    expect(service.listNodes).toHaveBeenCalledOnce();
    const [userId] = service.listNodes.mock.calls[0] as [UserId];
    expect(userId).toBe(TEST_USER_ID);
  });

  it('passes sort fields through the node filter', async () => {
    service.listNodes.mockResolvedValue(serviceResult({ items: [], total: 0, hasMore: false }));

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}?sortBy=masteryLevel&sortOrder=asc&studyMode=language_learning`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.listNodes).toHaveBeenCalledWith(
      TEST_USER_ID,
      expect.objectContaining({
        sortBy: 'masteryLevel',
        sortOrder: 'asc',
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
// GET /api/v1/users/:userId/pkg/nodes/:nodeId
// ============================================================================

describe('GET /users/:userId/pkg/nodes/:nodeId', () => {
  it('returns a node by ID', async () => {
    const node = graphNode({ nodeId: 'node_123' as NodeId });
    service.getNode.mockResolvedValue(serviceResult(node));

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/node_123`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.nodeId).toBe('node_123');
  });

  it('returns 404 for non-existent node', async () => {
    service.getNode.mockRejectedValue(new NodeNotFoundError('node_missing' as NodeId));

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/node_missing`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NODE_NOT_FOUND');
  });
});

// ============================================================================
// PATCH /api/v1/users/:userId/pkg/nodes/:nodeId
// ============================================================================

describe('PATCH /users/:userId/pkg/nodes/:nodeId', () => {
  it('updates a node and returns the updated version', async () => {
    const updated = graphNode({ label: 'Updated Label' });
    service.updateNode.mockResolvedValue(serviceResult(updated));

    const res = await app.inject({
      method: 'PATCH',
      url: `${BASE}/node_123`,
      payload: { label: 'Updated Label' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.label).toBe('Updated Label');
    expect(service.updateNode).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// DELETE /api/v1/users/:userId/pkg/nodes/:nodeId
// ============================================================================

describe('DELETE /users/:userId/pkg/nodes/:nodeId', () => {
  it('deletes a node and returns 204', async () => {
    service.deleteNode.mockResolvedValue(serviceResult(undefined));

    const res = await app.inject({
      method: 'DELETE',
      url: `${BASE}/node_123`,
    });

    expect(res.statusCode).toBe(204);
    expect(service.deleteNode).toHaveBeenCalledOnce();
  });

  it('returns 404 when deleting non-existent node', async () => {
    service.deleteNode.mockRejectedValue(new NodeNotFoundError('node_missing' as NodeId));

    const res = await app.inject({
      method: 'DELETE',
      url: `${BASE}/node_missing`,
    });

    expect(res.statusCode).toBe(404);
  });
});
