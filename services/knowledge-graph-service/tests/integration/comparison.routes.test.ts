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
  graphNode,
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
    const pkgNode = graphNode({ graphType: 'pkg', label: 'Algebra', domain: TEST_DOMAIN });
    const ckgNode = graphNode({
      graphType: 'ckg',
      label: 'Algebra',
      domain: TEST_DOMAIN,
      nodeId: 'node_ckg_0001' as typeof pkgNode.nodeId,
    });

    service.compareWithCkg.mockResolvedValue(
      serviceResult({
        pkgSubgraph: {
          nodes: [pkgNode],
          edges: [],
          rootNodeId: pkgNode.nodeId,
        },
        ckgSubgraph: {
          nodes: [ckgNode],
          edges: [],
          rootNodeId: ckgNode.nodeId,
        },
        nodeAlignment: new Map([[pkgNode.nodeId, ckgNode.nodeId]]),
        unmatchedPkgNodes: [],
        unmatchedCkgNodes: [],
        edgeAlignmentScore: 1,
        structuralDivergences: [],
        scope: {
          mode: 'engagement_hops',
          hopCount: 2,
          requestedDomain: TEST_DOMAIN,
          bootstrapApplied: false,
          seedNodeCount: 1,
          scopedCkgNodeCount: 1,
          totalCkgNodeCount: 1,
        },
      })
    );

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}?domain=${TEST_DOMAIN}&scopeMode=engagement_hops&hopCount=2`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.missingFromPkg).toEqual([]);
    expect(res.json().data.scope.mode).toBe('engagement_hops');
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
