import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { registerGraphCrdtRoutes } from '../../src/api/rest/graph-crdt.routes.js';
import { serviceResult } from '../fixtures/index.js';
import { mockKnowledgeGraphService } from '../helpers/mocks.js';
import { buildTestApp, buildUnauthenticatedTestApp } from './test-app.js';

let app: FastifyInstance;
let service: ReturnType<typeof mockKnowledgeGraphService>;

beforeAll(async () => {
  service = mockKnowledgeGraphService();
  app = buildTestApp({
    service,
    registerRoutes: registerGraphCrdtRoutes,
    user: { roles: ['admin'] },
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  for (const fn of Object.values(service)) {
    fn.mockReset();
  }
});

describe('graph crdt routes', () => {
  it('lists graph crdt stats for privileged callers', async () => {
    service.listGraphCrdtStats.mockResolvedValue(
      serviceResult([
        {
          statKey: 'ckg_node:ckg_1:node_match',
          graphType: 'ckg',
          targetKind: 'ckg_node',
          targetNodeId: 'ckg_1',
          proposedLabel: null,
          evidenceType: 'node_match',
          supportCount: 3,
          opposeCount: 0,
          neutralCount: 0,
          totalObservations: 3,
          averageConfidence: 0.82,
          supportCounterByReplica: { replica_a: 3 },
          opposeCounterByReplica: {},
          neutralCounterByReplica: {},
          confidenceCounterByReplica: { replica_a: 2460 },
          metadata: {},
          createdAt: '2026-04-03T10:00:00.000Z',
          updatedAt: '2026-04-03T10:05:00.000Z',
        },
      ])
    );

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/graph-crdt-stats?targetKind=ckg_node&targetNodeId=ckg_1',
    });

    expect(res.statusCode).toBe(200);
    expect(service.listGraphCrdtStats).toHaveBeenCalledWith(
      {
        targetKind: 'ckg_node',
        targetNodeId: 'ckg_1',
      },
      expect.objectContaining({ userId: expect.any(String) })
    );
  });

  it('returns 401 without auth', async () => {
    const unauthApp = buildUnauthenticatedTestApp({
      service,
      registerRoutes: registerGraphCrdtRoutes,
    });
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'GET',
      url: '/api/v1/graph-crdt-stats',
    });

    expect(res.statusCode).toBe(401);
    await unauthApp.close();
  });
});
