import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { registerGraphSnapshotRoutes } from '../../src/api/rest/graph-snapshot.routes.js';
import { serviceResult } from '../fixtures/index.js';
import { mockKnowledgeGraphService } from '../helpers/mocks.js';
import { buildTestApp, buildUnauthenticatedTestApp } from './test-app.js';

let app: FastifyInstance;
let service: ReturnType<typeof mockKnowledgeGraphService>;

beforeAll(async () => {
  service = mockKnowledgeGraphService();
  app = buildTestApp({
    service,
    registerRoutes: registerGraphSnapshotRoutes,
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

describe('graph snapshot routes', () => {
  it('creates snapshots for privileged callers', async () => {
    service.createGraphSnapshot.mockResolvedValue(
      serviceResult({
        snapshotId: 'gsnap_1',
        graphType: 'pkg',
        scope: { graphType: 'pkg', userId: 'user_123', domain: 'biology' },
        nodeCount: 1,
        edgeCount: 0,
        schemaVersion: 1,
        reason: 'checkpoint',
        createdAt: '2026-04-02T12:00:00.000Z',
        createdBy: 'admin_1',
        sourceCursor: 'oplog_1',
      })
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/graph-snapshots',
      payload: {
        graphType: 'pkg',
        userId: 'user_123',
        domain: 'biology',
        reason: 'checkpoint',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(service.createGraphSnapshot).toHaveBeenCalledOnce();
  });

  it('lists snapshots', async () => {
    service.listGraphSnapshots.mockResolvedValue(
      serviceResult({
        items: [],
        total: 0,
        hasMore: false,
      })
    );

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/graph-snapshots?page=1&pageSize=20&graphType=ckg',
    });

    expect(res.statusCode).toBe(200);
    expect(service.listGraphSnapshots).toHaveBeenCalledOnce();
  });

  it('previews restore', async () => {
    service.previewGraphRestore.mockResolvedValue(
      serviceResult({
        snapshot: {
          snapshotId: 'gsnap_2',
          graphType: 'ckg',
          scope: { graphType: 'ckg', domain: 'biology' },
          nodeCount: 10,
          edgeCount: 12,
          schemaVersion: 1,
          reason: null,
          createdAt: '2026-04-02T12:00:00.000Z',
          createdBy: 'admin_1',
          sourceCursor: 'mut_1',
        },
        summary: {
          scope: { graphType: 'ckg', domain: 'biology' },
          currentNodeCount: 9,
          currentEdgeCount: 12,
          snapshotNodeCount: 10,
          snapshotEdgeCount: 12,
          nodesToCreate: 1,
          nodesToUpdate: 0,
          nodesToDelete: 0,
          edgesToCreate: 0,
          edgesToUpdate: 0,
          edgesToDelete: 0,
        },
        confirmationToken: '4fe7f0fb35e37c7f2f8289b2b49250f8267b95c2e29c39c4f4d349adb45bf8f6',
        requiresDestructiveChanges: false,
        reasoning: 'Safe preview',
      })
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/graph-snapshots/gsnap_2/preview-restore',
    });

    expect(res.statusCode).toBe(200);
    expect(service.previewGraphRestore).toHaveBeenCalledWith(
      'gsnap_2',
      expect.objectContaining({ userId: expect.any(String) })
    );
  });

  it('executes restore only with an explicit confirmation token payload', async () => {
    service.executeGraphRestore.mockResolvedValue(
      serviceResult({
        snapshot: {
          snapshotId: 'gsnap_2',
          graphType: 'ckg',
          scope: { graphType: 'ckg', domain: 'biology' },
          nodeCount: 10,
          edgeCount: 12,
          schemaVersion: 1,
          reason: null,
          createdAt: '2026-04-02T12:00:00.000Z',
          createdBy: 'admin_1',
          sourceCursor: 'mut_1',
        },
        summary: {
          scope: { graphType: 'ckg', domain: 'biology' },
          currentNodeCount: 9,
          currentEdgeCount: 12,
          snapshotNodeCount: 10,
          snapshotEdgeCount: 12,
          nodesToCreate: 1,
          nodesToUpdate: 0,
          nodesToDelete: 0,
          edgesToCreate: 0,
          edgesToUpdate: 0,
          edgesToDelete: 0,
        },
        confirmationToken: '4fe7f0fb35e37c7f2f8289b2b49250f8267b95c2e29c39c4f4d349adb45bf8f6',
        requiresDestructiveChanges: false,
        reasoning: 'Safe preview',
      })
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/graph-snapshots/gsnap_2/restore',
      payload: {
        confirmationToken: '4fe7f0fb35e37c7f2f8289b2b49250f8267b95c2e29c39c4f4d349adb45bf8f6',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(service.executeGraphRestore).toHaveBeenCalledWith(
      'gsnap_2',
      {
        confirmationToken: '4fe7f0fb35e37c7f2f8289b2b49250f8267b95c2e29c39c4f4d349adb45bf8f6',
      },
      expect.objectContaining({ userId: expect.any(String) })
    );
  });

  it('returns 401 without auth', async () => {
    const unauthApp = buildUnauthenticatedTestApp({
      service,
      registerRoutes: registerGraphSnapshotRoutes,
    });
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'GET',
      url: '/api/v1/graph-snapshots',
    });

    expect(res.statusCode).toBe(401);
    await unauthApp.close();
  });
});
