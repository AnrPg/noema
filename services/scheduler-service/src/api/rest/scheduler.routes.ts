import type { IApiResponse } from '@noema/contracts';
import type { CorrelationId, UserId } from '@noema/types';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  buildExecutionContext,
  type SchedulerService,
} from '../../domain/scheduler-service/scheduler.service.js';

interface IRequestWithUser extends FastifyRequest {
  user?: { sub?: string };
}

function metadata(request: FastifyRequest): IApiResponse<unknown>['metadata'] {
  const startTime = (request as FastifyRequest & { startTime?: number }).startTime ?? Date.now();
  return {
    requestId: request.id,
    timestamp: new Date().toISOString(),
    serviceName: 'scheduler-service',
    serviceVersion: '0.1.0',
    executionTime: Date.now() - startTime,
  };
}

function wrapResponse<T>(request: FastifyRequest, data: T, agentHints: unknown): IApiResponse<T> {
  return {
    data,
    agentHints: agentHints as IApiResponse<T>['agentHints'],
    metadata: metadata(request),
  };
}

function handleError(error: unknown, request: FastifyRequest, reply: FastifyReply): void {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  reply.status(400).send({
    error: {
      code: 'SCHEDULER_ERROR',
      message,
    },
    metadata: metadata(request),
  });
}

export function registerSchedulerRoutes(
  fastify: FastifyInstance,
  schedulerService: SchedulerService,
  authMiddleware: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
): void {
  fastify.addHook('onRequest', (request) => {
    (request as FastifyRequest & { startTime: number }).startTime = Date.now();
  });

  fastify.post<{ Body: unknown }>(
    '/v1/scheduler/dual-lane/plan',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const req = request as IRequestWithUser;
        const userId = (req.user?.sub ?? 'anonymous') as UserId;
        const ctx = buildExecutionContext(userId, request.id as CorrelationId);
        const result = await schedulerService.planDualLaneQueue(request.body, ctx);
        reply.send(wrapResponse(request, result.data, result.agentHints));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  fastify.post<{ Body: unknown }>(
    '/v1/scheduler/offline-intent/issue',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const req = request as IRequestWithUser;
        const userId = (req.user?.sub ?? 'anonymous') as UserId;
        const ctx = buildExecutionContext(userId, request.id as CorrelationId);
        const result = await schedulerService.issueOfflineIntentToken(request.body, ctx);
        reply.send(wrapResponse(request, result.data, result.agentHints));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  fastify.post<{ Body: unknown }>(
    '/v1/scheduler/offline-intent/verify',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const req = request as IRequestWithUser;
        const userId = (req.user?.sub ?? 'anonymous') as UserId;
        const ctx = buildExecutionContext(userId, request.id as CorrelationId);
        const result = await schedulerService.verifyOfflineIntentToken(request.body, ctx);
        reply.send(wrapResponse(request, result.data, result.agentHints));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );
}
