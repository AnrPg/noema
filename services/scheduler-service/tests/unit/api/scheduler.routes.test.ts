import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { registerSchedulerRoutes } from '../../../src/api/rest/scheduler.routes.js';
import type { SchedulerService } from '../../../src/domain/scheduler-service/scheduler.service.js';

function buildApp(service: Partial<SchedulerService>) {
  const app = Fastify();
  app.addHook('preHandler', (request, _reply, done) => {
    request.user = {
      sub: 'user_123456789012345678901',
      principalType: 'user',
      principalId: 'user_123456789012345678901',
      scopes: ['scheduler:plan'],
      audienceClass: 'user-client',
    };
    done();
  });
  return registerSchedulerRoutes(app, service as SchedulerService).then(() => app);
}

describe('scheduler concept-first routes', () => {
  it('serves due concepts from the Batch 6 route', async () => {
    const service = {
      getDueConcepts: vi.fn().mockResolvedValue([
        {
          conceptId: 'concept_C',
          queue: 'reinforcement',
        },
      ]),
    };
    const app = await buildApp(service);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/concepts/due?studyMode=knowledge_gaining&limit=5',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: { concepts: [{ conceptId: 'concept_C', queue: 'reinforcement' }] },
      metadata: { count: 1 },
    });
    expect(service.getDueConcepts).toHaveBeenCalledWith(
      { studyMode: 'knowledge_gaining', limit: '5' },
      expect.objectContaining({ userId: 'user_123456789012345678901' })
    );

    await app.close();
  });

  it('serves concept schedule and transformation history routes', async () => {
    const service = {
      getConceptSchedule: vi.fn().mockResolvedValue({
        conceptId: 'concept_C',
        queue: 'repair',
      }),
      getTransformationHistory: vi.fn().mockResolvedValue([
        {
          conceptId: 'concept_C',
          transformation: 'recall',
        },
      ]),
    };
    const app = await buildApp(service);

    const scheduleResponse = await app.inject({
      method: 'GET',
      url: '/v1/concepts/concept_C/schedule?studyMode=knowledge_gaining',
    });
    const historyResponse = await app.inject({
      method: 'GET',
      url: '/v1/concepts/concept_C/transformation-history?limit=2',
    });

    expect(scheduleResponse.statusCode).toBe(200);
    expect(scheduleResponse.json()).toMatchObject({
      data: { conceptId: 'concept_C', queue: 'repair' },
    });
    expect(historyResponse.statusCode).toBe(200);
    expect(historyResponse.json()).toMatchObject({
      data: { history: [{ conceptId: 'concept_C', transformation: 'recall' }] },
      metadata: { count: 1 },
    });

    await app.close();
  });

  it('does not register deleted card-centric scheduler routes', async () => {
    const app = await buildApp({});

    const response = await app.inject({
      method: 'GET',
      url: '/v1/scheduler/cards/card_123/projection',
    });

    expect(response.statusCode).toBe(404);

    await app.close();
  });
});
