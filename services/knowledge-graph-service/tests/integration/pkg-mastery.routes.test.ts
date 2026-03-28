/**
 * @noema/knowledge-graph-service — PKG Mastery Routes Integration Tests
 */

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerPkgMasteryRoutes } from '../../src/api/rest/pkg-mastery.routes.js';
import { OTHER_USER_ID, resetIdCounter, serviceResult, TEST_USER_ID } from '../fixtures/index.js';
import { mockKnowledgeGraphService } from '../helpers/mocks.js';
import { buildTestApp, buildUnauthenticatedTestApp } from './test-app.js';

let app: FastifyInstance;
let service: ReturnType<typeof mockKnowledgeGraphService>;

beforeAll(async () => {
  service = mockKnowledgeGraphService();
  app = buildTestApp({ service, registerRoutes: registerPkgMasteryRoutes });
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

const BASE = `/api/v1/users/${TEST_USER_ID}/pkg/mastery/summary`;

describe('GET /users/:userId/pkg/mastery/summary', () => {
  it('returns a mode-scoped mastery summary', async () => {
    service.getNodeMasterySummary.mockResolvedValue(
      serviceResult({
        userId: TEST_USER_ID,
        studyMode: 'knowledge_gaining',
        masteryThreshold: 0.7,
        totalNodes: 12,
        trackedNodes: 9,
        masteredNodes: 4,
        developingNodes: 3,
        emergingNodes: 2,
        untrackedNodes: 3,
        averageMastery: 0.56,
        strongestDomains: [],
        weakestDomains: [],
      })
    );

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}?studyMode=knowledge_gaining`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.masteredNodes).toBe(4);
    expect(service.getNodeMasterySummary).toHaveBeenCalledWith(
      TEST_USER_ID,
      expect.objectContaining({
        userId: TEST_USER_ID,
        graphType: 'pkg',
        studyMode: 'knowledge_gaining',
      }),
      0.7,
      expect.any(Object)
    );
  });

  it('passes the study mode and domain filters through', async () => {
    service.getNodeMasterySummary.mockResolvedValue(
      serviceResult({
        userId: TEST_USER_ID,
        studyMode: 'language_learning',
        domain: 'spanish',
        masteryThreshold: 0.65,
        totalNodes: 3,
        trackedNodes: 2,
        masteredNodes: 1,
        developingNodes: 1,
        emergingNodes: 0,
        untrackedNodes: 1,
        averageMastery: 0.61,
        strongestDomains: [],
        weakestDomains: [],
      })
    );

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}?studyMode=language_learning&domain=spanish&masteryThreshold=0.65`,
    });

    expect(res.statusCode).toBe(200);
    expect(service.getNodeMasterySummary).toHaveBeenCalledWith(
      TEST_USER_ID,
      expect.objectContaining({
        userId: TEST_USER_ID,
        graphType: 'pkg',
        studyMode: 'language_learning',
        domain: 'spanish',
      }),
      0.65,
      expect.any(Object)
    );
  });

  it('returns 400 when studyMode is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: BASE,
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const unauthApp = buildUnauthenticatedTestApp({
      service,
      registerRoutes: registerPkgMasteryRoutes,
    });
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'GET',
      url: `${BASE}?studyMode=knowledge_gaining`,
    });

    expect(res.statusCode).toBe(401);
    await unauthApp.close();
  });

  it('returns 403 when accessing another user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/users/${OTHER_USER_ID}/pkg/mastery/summary?studyMode=knowledge_gaining`,
    });

    expect(res.statusCode).toBe(403);
  });
});
