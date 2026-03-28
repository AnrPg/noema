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

describe('GET /v1/scheduler/progress/guidance', () => {
  let app: FastifyInstance;
  let schedulerReadService: Pick<
    SchedulerReadService,
    'getStudyGuidanceSummary' | 'getProgressSummary'
  >;

  beforeAll(async () => {
    schedulerReadService = {
      getStudyGuidanceSummary: vi.fn(),
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
    schedulerReadService.getStudyGuidanceSummary = vi.fn().mockResolvedValue({
      data: {
        userId: 'usr_test',
        studyMode: 'language_learning',
        recommendations: [],
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
        reasoning: 'guidance ready',
      },
    });
  });

  it('returns the authenticated learner study guidance summary', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/scheduler/progress/guidance?studyMode=language_learning',
    });

    expect(response.statusCode).toBe(200);
    expect(schedulerReadService.getStudyGuidanceSummary).toHaveBeenCalledWith(
      'usr_test',
      'language_learning'
    );
  });

  it('returns 400 for invalid studyMode values', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/scheduler/progress/guidance?studyMode=bad_mode',
    });

    expect(response.statusCode).toBe(400);
  });
});
