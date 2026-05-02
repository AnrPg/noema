import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ConceptId, StudyMode } from '@noema/types';

import { requireScopes, sendErrorEnvelope } from '../middleware/auth.middleware.js';
import type { SchedulerService } from '../../domain/scheduler-service/scheduler.service.js';
import type { IExecutionContext } from '../../types/scheduler.types.js';

export async function registerSchedulerRoutes(
  app: FastifyInstance,
  schedulerService: SchedulerService
): Promise<void> {
  await Promise.resolve();
  app.get('/v1/concepts/due', async (request, reply) => {
    if (!(await requireSchedulerRead(request, reply))) return;
    try {
      const concepts = await schedulerService.getDueConcepts(request.query, buildContext(request));
      await reply.send({ data: { concepts }, metadata: { count: concepts.length } });
    } catch (error) {
      await sendFailure(reply, request, error);
    }
  });

  app.get<{
    Params: { conceptId: string };
    Querystring: { studyMode?: string };
  }>('/v1/concepts/:conceptId/schedule', async (request, reply) => {
    if (!(await requireSchedulerRead(request, reply))) return;
    try {
      const state = await schedulerService.getConceptSchedule(
        buildContext(request).userId,
        request.params.conceptId as ConceptId,
        request.query.studyMode as StudyMode | undefined
      );
      if (state === null) {
        await reply.status(404).send({ data: null });
        return;
      }
      await reply.send({ data: state });
    } catch (error) {
      await sendFailure(reply, request, error);
    }
  });

  app.get<{
    Params: { conceptId: string };
  }>('/v1/concepts/:conceptId/transformation-history', async (request, reply) => {
    if (!(await requireSchedulerRead(request, reply))) return;
    try {
      const history = await schedulerService.getTransformationHistory(
        request.query,
        buildContext(request),
        request.params.conceptId as ConceptId
      );
      await reply.send({ data: { history }, metadata: { count: history.length } });
    } catch (error) {
      await sendFailure(reply, request, error);
    }
  });
}

async function requireSchedulerRead(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  return requireScopes(request, reply, {
    requiredScopes: ['scheduler:plan'],
    match: 'any',
  });
}

function buildContext(request: FastifyRequest): IExecutionContext {
  const userId = request.user?.principalId ?? request.user?.sub ?? 'user_devuser00000000000000';
  return {
    userId: userId as IExecutionContext['userId'],
    correlationId: request.id as IExecutionContext['correlationId'],
  };
}

async function sendFailure(
  reply: FastifyReply,
  request: FastifyRequest,
  error: unknown
): Promise<void> {
  await sendErrorEnvelope(reply, request, {
    statusCode: 400,
    code: 'SCHEDULER_REQUEST_FAILED',
    message: error instanceof Error ? error.message : 'Scheduler request failed',
    category: 'validation',
    retryable: false,
  });
}
