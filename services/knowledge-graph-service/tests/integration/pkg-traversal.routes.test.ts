/**
 * @noema/knowledge-graph-service — PKG Traversal Routes Integration Tests
 *
 * Tests: subgraph, ancestors, descendants, path, siblings, co-parents,
 * neighborhood, bridges, frontier, common-ancestors, prerequisite-chain,
 * centrality
 * Prefix: /api/v1/users/:userId/pkg/traversal
 */

import type { NodeId } from '@noema/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerPkgTraversalRoutes } from '../../src/api/rest/pkg-traversal.routes.js';
import {
  graphNode,
  OTHER_USER_ID,
  resetIdCounter,
  serviceResult,
  subgraph,
  TEST_DOMAIN,
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
  app = buildTestApp({ service, registerRoutes: registerPkgTraversalRoutes });
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

const BASE = `/api/v1/users/${TEST_USER_ID}/pkg/traversal`;

// ============================================================================
// GET .../subgraph
// ============================================================================

describe('GET /users/:userId/pkg/traversal/subgraph', () => {
  it('returns a subgraph', async () => {
    service.getSubgraph.mockResolvedValue(serviceResult(subgraph()));

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/subgraph?rootNodeId=${VALID_NODE_ID_A}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.nodes).toBeDefined();
    expect(service.getSubgraph).toHaveBeenCalledOnce();
  });

  it('returns 401 without auth', async () => {
    const unauthApp = buildUnauthenticatedTestApp({
      service,
      registerRoutes: registerPkgTraversalRoutes,
    });
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'GET',
      url: `${BASE}/subgraph?rootNodeId=node_1`,
    });

    expect(res.statusCode).toBe(401);
    await unauthApp.close();
  });

  it('returns 403 when accessing another users PKG', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/users/${OTHER_USER_ID}/pkg/traversal/subgraph?rootNodeId=node_1`,
    });

    expect(res.statusCode).toBe(403);
  });
});

// ============================================================================
// GET .../ancestors/:nodeId
// ============================================================================

describe('GET /users/:userId/pkg/traversal/ancestors/:nodeId', () => {
  it('returns ancestors of a node', async () => {
    const nodes = [graphNode()];
    service.getAncestors.mockResolvedValue(serviceResult(nodes));

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/ancestors/node_1`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.getAncestors).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// GET .../descendants/:nodeId
// ============================================================================

describe('GET /users/:userId/pkg/traversal/descendants/:nodeId', () => {
  it('returns descendants of a node', async () => {
    service.getDescendants.mockResolvedValue(serviceResult([graphNode()]));

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/descendants/node_1`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.getDescendants).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// GET .../path
// ============================================================================

describe('GET /users/:userId/pkg/traversal/path', () => {
  it('finds a path between two nodes', async () => {
    service.findPath.mockResolvedValue(serviceResult([graphNode(), graphNode()]));

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/path?fromNodeId=${VALID_NODE_ID_A}&toNodeId=${VALID_NODE_ID_B}`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.findPath).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// GET .../siblings/:nodeId
// ============================================================================

describe('GET /users/:userId/pkg/traversal/siblings/:nodeId', () => {
  it('returns siblings of a node', async () => {
    service.getSiblings.mockResolvedValue(
      serviceResult({ nodeId: 'node_1' as NodeId, groups: [], totalSiblings: 0 })
    );

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/siblings/node_1?edgeType=is_a`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.getSiblings).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// GET .../co-parents/:nodeId
// ============================================================================

describe('GET /users/:userId/pkg/traversal/co-parents/:nodeId', () => {
  it('returns co-parents of a node', async () => {
    service.getCoParents.mockResolvedValue(
      serviceResult({ nodeId: 'node_1' as NodeId, groups: [], totalCoParents: 0 })
    );

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/co-parents/node_1?edgeType=is_a`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.getCoParents).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// GET .../neighborhood/:nodeId
// ============================================================================

describe('GET /users/:userId/pkg/traversal/neighborhood/:nodeId', () => {
  it('returns neighborhood of a node', async () => {
    service.getNeighborhood.mockResolvedValue(
      serviceResult({
        centerNodeId: 'node_1' as NodeId,
        hops: 1,
        layers: [],
        totalNodes: 0,
        totalEdges: 0,
      })
    );

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/neighborhood/node_1`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.getNeighborhood).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// GET .../bridges
// ============================================================================

describe('GET /users/:userId/pkg/traversal/bridges', () => {
  it('returns bridge nodes', async () => {
    service.getBridgeNodes.mockResolvedValue(
      serviceResult({
        domain: TEST_DOMAIN,
        bridgeNodes: [],
        totalNodes: 0,
        componentCount: 1,
      })
    );

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/bridges?domain=${TEST_DOMAIN}`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.getBridgeNodes).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// GET .../frontier
// ============================================================================

describe('GET /users/:userId/pkg/traversal/frontier', () => {
  it('returns knowledge frontier', async () => {
    service.getKnowledgeFrontier.mockResolvedValue(
      serviceResult({
        domain: TEST_DOMAIN,
        frontierNodes: [],
        totalCandidates: 0,
      })
    );

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/frontier?domain=${TEST_DOMAIN}`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.getKnowledgeFrontier).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// GET .../common-ancestors
// ============================================================================

describe('GET /users/:userId/pkg/traversal/common-ancestors', () => {
  it('returns common ancestors of two nodes', async () => {
    service.getCommonAncestors.mockResolvedValue(
      serviceResult({
        nodeIdA: VALID_NODE_ID_A,
        nodeIdB: VALID_NODE_ID_B,
        commonAncestors: [],
        lowestCommonAncestor: null,
      })
    );

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/common-ancestors?nodeIdA=${VALID_NODE_ID_A}&nodeIdB=${VALID_NODE_ID_B}`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.getCommonAncestors).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// GET .../prerequisite-chain/:nodeId
// ============================================================================

describe('GET /users/:userId/pkg/traversal/prerequisite-chain/:nodeId', () => {
  it('returns prerequisite chain for a node', async () => {
    service.getPrerequisiteChain.mockResolvedValue(
      serviceResult({
        targetNodeId: 'node_1' as NodeId,
        layers: [],
        totalPrerequisites: 0,
        hasCycle: false,
      })
    );

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/prerequisite-chain/node_1?domain=${TEST_DOMAIN}`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.getPrerequisiteChain).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// GET .../centrality
// ============================================================================

describe('GET /users/:userId/pkg/traversal/centrality', () => {
  it('returns centrality ranking', async () => {
    service.getCentralityRanking.mockResolvedValue(
      serviceResult({
        domain: TEST_DOMAIN,
        algorithm: 'degree',
        rankings: [],
        totalNodes: 0,
      })
    );

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/centrality?domain=${TEST_DOMAIN}`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.getCentralityRanking).toHaveBeenCalledOnce();
  });
});
