import type { IApiResponse } from '@noema/contracts';
import type { CorrelationId, UserId } from '@noema/types';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  buildExecutionContext,
  type SchedulerService,
} from '../../domain/scheduler-service/scheduler.service.js';
import {
  buildErrorMetadata,
  requireScopes,
  sendErrorEnvelope,
  type createAuthMiddleware,
} from '../middleware/auth.middleware.js';

function metadata(request: FastifyRequest): IApiResponse<unknown>['metadata'] {
  return buildErrorMetadata(request);
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
  void sendErrorEnvelope(reply, request, {
    statusCode: 400,
    code: 'SCHEDULER_ERROR',
    message,
    category: 'validation',
    retryable: false,
  });
}

export function registerSchedulerRoutes(
  fastify: FastifyInstance,
  schedulerService: SchedulerService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>
): void {
  const maxPayloadBytes = parseInt(process.env['REQUEST_MAX_PAYLOAD_BYTES'] ?? '262144', 10);
  const authPreHandler = {
    preHandler: (
      request: FastifyRequest,
      reply: FastifyReply,
      done: (error?: Error) => void
    ): void => {
      void authMiddleware(request, reply)
        .then(() => {
          done();
        })
        .catch((error: unknown) => {
          done(error instanceof Error ? error : new Error('Authentication middleware failed'));
        });
    },
  };

  fastify.addHook('onRequest', (request) => {
    (request as FastifyRequest & { startTime: number }).startTime = Date.now();
  });

  const planDualLaneHandler = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const authorized = await requireScopes(request, reply, {
      requiredScopes: ['scheduler:plan', 'scheduler:write'],
      match: 'any',
    });
    if (!authorized) return;

    const payloadSize = Buffer.byteLength(JSON.stringify(request.body ?? {}), 'utf8');
    if (payloadSize > maxPayloadBytes) {
      await sendErrorEnvelope(reply, request, {
        statusCode: 413,
        code: 'PAYLOAD_TOO_LARGE',
        message: `Payload size ${String(payloadSize)} exceeds configured limit ${String(maxPayloadBytes)}`,
        category: 'validation',
        retryable: false,
      });
      return;
    }

    try {
      const userId = (request.user?.sub ?? 'anonymous') as UserId;
      const ctx = buildExecutionContext(userId, request.id as CorrelationId);
      const result = await schedulerService.planDualLaneQueue(request.body, ctx);
      reply.send(wrapResponse(request, result.data, result.agentHints));
    } catch (error) {
      handleError(error, request, reply);
    }
  };

  const withPayloadGuard = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<boolean> => {
    const payloadSize = Buffer.byteLength(JSON.stringify(request.body ?? {}), 'utf8');
    if (payloadSize <= maxPayloadBytes) {
      return true;
    }

    await sendErrorEnvelope(reply, request, {
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: `Payload size ${String(payloadSize)} exceeds configured limit ${String(maxPayloadBytes)}`,
      category: 'validation',
      retryable: false,
    });
    return false;
  };

  const proposeReviewWindowsHandler = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const authorized = await requireScopes(request, reply, {
      requiredScopes: ['scheduler:plan'],
      match: 'all',
    });
    if (!authorized) return;
    if (!(await withPayloadGuard(request, reply))) return;

    try {
      const userId = (request.user?.sub ?? 'anonymous') as UserId;
      const ctx = buildExecutionContext(userId, request.id as CorrelationId);
      const result = await schedulerService.proposeReviewWindows(request.body, ctx);
      reply.send(wrapResponse(request, result.data, result.agentHints));
    } catch (error) {
      handleError(error, request, reply);
    }
  };

  const proposeSessionCandidatesHandler = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const authorized = await requireScopes(request, reply, {
      requiredScopes: ['scheduler:plan'],
      match: 'all',
    });
    if (!authorized) return;
    if (!(await withPayloadGuard(request, reply))) return;

    try {
      const userId = (request.user?.sub ?? 'anonymous') as UserId;
      const ctx = buildExecutionContext(userId, request.id as CorrelationId);
      const result = await schedulerService.proposeSessionCandidates(request.body, ctx);
      reply.send(wrapResponse(request, result.data, result.agentHints));
    } catch (error) {
      handleError(error, request, reply);
    }
  };

  const simulateSessionCandidatesHandler = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const authorized = await requireScopes(request, reply, {
      requiredScopes: ['scheduler:plan'],
      match: 'all',
    });
    if (!authorized) return;
    if (!(await withPayloadGuard(request, reply))) return;

    try {
      const userId = (request.user?.sub ?? 'anonymous') as UserId;
      const ctx = buildExecutionContext(userId, request.id as CorrelationId);
      const result = await schedulerService.simulateSessionCandidates(request.body, ctx);
      reply.send(wrapResponse(request, result.data, result.agentHints));
    } catch (error) {
      handleError(error, request, reply);
    }
  };

  const commitSingleScheduleHandler = async (
    request: FastifyRequest<{ Params: { cardId: string }; Body: unknown }>,
    reply: FastifyReply
  ): Promise<void> => {
    const authorized = await requireScopes(request, reply, {
      requiredScopes: ['scheduler:write'],
      match: 'all',
    });
    if (!authorized) return;
    if (!(await withPayloadGuard(request, reply))) return;

    try {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const decision = (body['decision'] ?? {}) as Record<string, unknown>;
      const normalizedBody = {
        ...body,
        decision: {
          ...decision,
          cardId: request.params.cardId,
        },
      };

      const userId = (request.user?.sub ?? 'anonymous') as UserId;
      const ctx = buildExecutionContext(userId, request.id as CorrelationId);
      const result = await schedulerService.commitCardSchedule(normalizedBody, ctx);
      reply.send(wrapResponse(request, result.data, result.agentHints));
    } catch (error) {
      handleError(error, request, reply);
    }
  };

  const commitBatchScheduleHandler = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const authorized = await requireScopes(request, reply, {
      requiredScopes: ['scheduler:write'],
      match: 'all',
    });
    if (!authorized) return;
    if (!(await withPayloadGuard(request, reply))) return;

    try {
      const userId = (request.user?.sub ?? 'anonymous') as UserId;
      const ctx = buildExecutionContext(userId, request.id as CorrelationId);
      const result = await schedulerService.commitCardScheduleBatch(request.body, ctx);
      reply.send(wrapResponse(request, result.data, result.agentHints));
    } catch (error) {
      handleError(error, request, reply);
    }
  };

  fastify.post<{ Body: unknown }>(
    '/v1/scheduler/dual-lane/plan',
    authPreHandler,
    planDualLaneHandler
  );
  fastify.post<{ Body: unknown }>(
    '/v1/schedule/dual-lane-plan',
    authPreHandler,
    planDualLaneHandler
  );

  fastify.post<{ Body: unknown }>(
    '/v1/scheduler/proposals/review-windows',
    authPreHandler,
    proposeReviewWindowsHandler
  );
  fastify.post<{ Body: unknown }>(
    '/v1/scheduler/proposals/session-candidates',
    authPreHandler,
    proposeSessionCandidatesHandler
  );
  fastify.post<{ Body: unknown }>(
    '/v1/scheduler/simulations/session-candidates',
    authPreHandler,
    simulateSessionCandidatesHandler
  );
  fastify.post<{ Params: { cardId: string }; Body: unknown }>(
    '/v1/scheduler/commits/cards/:cardId/schedule',
    authPreHandler,
    commitSingleScheduleHandler
  );
  fastify.post<{ Body: unknown }>(
    '/v1/scheduler/commits/cards/schedule/batch',
    authPreHandler,
    commitBatchScheduleHandler
  );
}
