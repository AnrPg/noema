import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerSchedulerRoutes } from '../../../src/api/rest/scheduler.routes.js';
import type { SchedulerReadService } from '../../../src/domain/scheduler-service/scheduler-read.service.js';
import type { SchedulerService } from '../../../src/domain/scheduler-service/scheduler.service.js';

type AuthMiddleware = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

function createAuthMiddleware(scopes: string[] = ['scheduler:read']): AuthMiddleware {
  return async (request, _reply) => {
    request.user = {
      sub: 'usr_test',
      principalType: 'user',
      principalId: 'usr_test',
      audienceClass: 'user-client',
      scopes,
    } as never;
  };
}

function createNoAuthMiddleware(): AuthMiddleware {
  return async (_request, reply) => {
    await reply.status(401).send({
      error: {
        code: 'AUTH_UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
        category: 'auth',
      },
      metadata: {},
    });
  };
}

describe('GET /v1/scheduler/progress/summary', () => {
  let app: FastifyInstance;
  let schedulerReadService: Pick<SchedulerReadService, 'getProgressSummary'>;

  beforeAll(async () => {
    schedulerReadService = {
      getProgressSummary: vi.fn(),
    };

    app = Fastify({ logger: false });
    registerSchedulerRoutes(
      app,
      {} as SchedulerService,
      createAuthMiddleware(),
      schedulerReadService as SchedulerReadService
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    schedulerReadService.getProgressSummary = vi.fn().mockResolvedValue({
      data: {
        userId: 'usr_test',
        studyMode: 'knowledge_gaining',
        totalCards: 12,
        trackedCards: 9,
        dueNow: 4,
        dueToday: 6,
        overdueCards: 2,
        newCards: 3,
        learningCards: 2,
        matureCards: 6,
        suspendedCards: 1,
        retentionCards: 8,
        calibrationCards: 4,
        fsrsCards: 8,
        hlrCards: 4,
        sm2Cards: 0,
        averageRecallProbability: 0.71,
        strongRecallCards: 5,
        fragileCards: 2,
      },
      agentHints: {
        suggestedNextActions: [],
        relatedResources: [],
        confidence: 1,
        sourceQuality: 'high',
        validityPeriod: 'short',
        contextNeeded: [],
        assumptions: [],
        riskFactors: [],
        dependencies: [],
        estimatedImpact: { benefit: 0.6, effort: 0.2, roi: 3 },
        preferenceAlignment: [],
        reasoning: 'summary ready',
      },
    });
  });

  it('returns the authenticated learner progress summary', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/scheduler/progress/summary?studyMode=language_learning',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.dueNow).toBe(4);
    expect(schedulerReadService.getProgressSummary).toHaveBeenCalledWith(
      'usr_test',
      'language_learning'
    );
  });

  it('returns 400 for invalid studyMode values', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/scheduler/progress/summary?studyMode=not_a_mode',
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 403 when the caller lacks scheduler scopes', async () => {
    const scopedApp = Fastify({ logger: false });
    registerSchedulerRoutes(
      scopedApp,
      {} as SchedulerService,
      createAuthMiddleware([]),
      schedulerReadService as SchedulerReadService
    );
    await scopedApp.ready();

    const response = await scopedApp.inject({
      method: 'GET',
      url: '/v1/scheduler/progress/summary',
    });

    expect(response.statusCode).toBe(403);
    await scopedApp.close();
  });

  it('returns 401 without authentication', async () => {
    const unauthenticatedApp = Fastify({ logger: false });
    registerSchedulerRoutes(
      unauthenticatedApp,
      {} as SchedulerService,
      createNoAuthMiddleware(),
      schedulerReadService as SchedulerReadService
    );
    await unauthenticatedApp.ready();

    const response = await unauthenticatedApp.inject({
      method: 'GET',
      url: '/v1/scheduler/progress/summary',
    });

    expect(response.statusCode).toBe(401);
    await unauthenticatedApp.close();
  });
});
