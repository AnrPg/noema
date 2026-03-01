/**
 * @noema/knowledge-graph-service — CKG Traversal Routes Integration Tests
 *
 * Tests: subgraph, ancestors, descendants, path, siblings, co-parents,
 * neighborhood, bridges, common-ancestors, prerequisite-chain, centrality
 * Prefix: /api/v1/ckg/traversal
 * Auth: authMiddleware only (no userId scoping)
 */

import type { NodeId } from '@noema/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerCkgTraversalRoutes } from '../../src/api/rest/ckg-traversal.routes.js';
import {
  graphNode,
  resetIdCounter,
  serviceResult,
  subgraph,
  TEST_DOMAIN,
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
  app = buildTestApp({ service, registerRoutes: registerCkgTraversalRoutes });
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

const BASE = '/api/v1/ckg/traversal';

// ============================================================================
// GET .../subgraph
// ============================================================================

describe('GET /ckg/traversal/subgraph', () => {
  it('returns a CKG subgraph', async () => {
    service.getCkgSubgraph.mockResolvedValue(serviceResult(subgraph()));

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/subgraph?rootNodeId=${VALID_NODE_ID_A}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.nodes).toBeDefined();
    expect(service.getCkgSubgraph).toHaveBeenCalledOnce();
  });

  it('returns 401 without auth', async () => {
    const unauthApp = buildUnauthenticatedTestApp({
      service,
      registerRoutes: registerCkgTraversalRoutes,
    });
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'GET',
      url: `${BASE}/subgraph?rootNodeId=${VALID_NODE_ID_A}`,
    });

    expect(res.statusCode).toBe(401);
    await unauthApp.close();
  });
});

// ============================================================================
// GET .../ancestors/:nodeId
// ============================================================================

describe('GET /ckg/traversal/ancestors/:nodeId', () => {
  it('returns ancestors of a CKG node', async () => {
    service.getCkgAncestors.mockResolvedValue(serviceResult([graphNode({ graphType: 'ckg' })]));

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/ancestors/node_1`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.getCkgAncestors).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// GET .../descendants/:nodeId
// ============================================================================

describe('GET /ckg/traversal/descendants/:nodeId', () => {
  it('returns descendants of a CKG node', async () => {
    service.getCkgDescendants.mockResolvedValue(serviceResult([graphNode({ graphType: 'ckg' })]));

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/descendants/node_1`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.getCkgDescendants).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// GET .../path
// ============================================================================

describe('GET /ckg/traversal/path', () => {
  it('finds a path between two CKG nodes', async () => {
    service.findCkgPath.mockResolvedValue(serviceResult([graphNode(), graphNode()]));

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/path?fromNodeId=${VALID_NODE_ID_A}&toNodeId=${VALID_NODE_ID_B}`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.findCkgPath).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// GET .../siblings/:nodeId
// ============================================================================

describe('GET /ckg/traversal/siblings/:nodeId', () => {
  it('returns siblings of a CKG node', async () => {
    service.getCkgSiblings.mockResolvedValue(
      serviceResult({ nodeId: 'node_1' as NodeId, groups: [], totalSiblings: 0 })
    );

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/siblings/node_1?edgeType=is_a`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.getCkgSiblings).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// GET .../co-parents/:nodeId
// ============================================================================

describe('GET /ckg/traversal/co-parents/:nodeId', () => {
  it('returns co-parents of a CKG node', async () => {
    service.getCkgCoParents.mockResolvedValue(
      serviceResult({ nodeId: 'node_1' as NodeId, groups: [], totalCoParents: 0 })
    );

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/co-parents/node_1?edgeType=is_a`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.getCkgCoParents).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// GET .../neighborhood/:nodeId
// ============================================================================

describe('GET /ckg/traversal/neighborhood/:nodeId', () => {
  it('returns neighborhood of a CKG node', async () => {
    service.getCkgNeighborhood.mockResolvedValue(
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
    expect(service.getCkgNeighborhood).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// GET .../bridges
// ============================================================================

describe('GET /ckg/traversal/bridges', () => {
  it('returns CKG bridge nodes', async () => {
    service.getCkgBridgeNodes.mockResolvedValue(
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
    expect(service.getCkgBridgeNodes).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// GET .../common-ancestors
// ============================================================================

describe('GET /ckg/traversal/common-ancestors', () => {
  it('returns common ancestors of two CKG nodes', async () => {
    service.getCkgCommonAncestors.mockResolvedValue(
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
    expect(service.getCkgCommonAncestors).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// GET .../prerequisite-chain/:nodeId
// ============================================================================

describe('GET /ckg/traversal/prerequisite-chain/:nodeId', () => {
  it('returns prerequisite chain for a CKG node', async () => {
    service.getCkgPrerequisiteChain.mockResolvedValue(
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
    expect(service.getCkgPrerequisiteChain).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// GET .../centrality
// ============================================================================

describe('GET /ckg/traversal/centrality', () => {
  it('returns CKG centrality ranking', async () => {
    service.getCkgCentralityRanking.mockResolvedValue(
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
    expect(service.getCkgCentralityRanking).toHaveBeenCalledOnce();
  });
});
