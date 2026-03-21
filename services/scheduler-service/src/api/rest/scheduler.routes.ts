import type { IApiResponse } from '@noema/contracts';
import type { CardId, CorrelationId, UserId } from '@noema/types';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  ForecastInputSchema,
  ReviewListQuerySchema,
  ReviewStatsQuerySchema,
  SchedulerCardListQuerySchema,
  SchedulerCardParamsSchema,
} from '../../domain/scheduler-service/scheduler-read.schemas.js';
import type { SchedulerReadService } from '../../domain/scheduler-service/scheduler-read.service.js';
import {
  buildExecutionContext,
  type SchedulerService,
} from '../../domain/scheduler-service/scheduler.service.js';
import type {
  IReviewExtendedFilters,
  ISchedulerCardExtendedFilters,
} from '../../types/scheduler.types.js';
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
  authMiddleware: ReturnType<typeof createAuthMiddleware>,
  schedulerReadService?: SchedulerReadService
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

  fastify.addHook('onRequest', (request, _reply, done) => {
    (request as FastifyRequest & { startTime: number }).startTime = Date.now();
    done();
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

  // ==========================================================================
  // Phase 3 — Read API (GET endpoints + POST forecast)
  // ==========================================================================

  if (schedulerReadService === undefined) {
    return;
  }

  // T3.1 — GET /v1/scheduler/cards/:cardId
  const getCardHandler = async (
    request: FastifyRequest<{ Params: { cardId: string } }>,
    reply: FastifyReply
  ): Promise<void> => {
    const authorized = await requireScopes(request, reply, {
      requiredScopes: ['scheduler:plan'],
      match: 'all',
    });
    if (!authorized) return;

    try {
      const paramsParsed = SchedulerCardParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        await sendErrorEnvelope(reply, request, {
          statusCode: 400,
          code: 'INVALID_PARAMS',
          message: `Invalid path params: ${paramsParsed.error.message}`,
          category: 'validation',
          retryable: false,
        });
        return;
      }

      const userId = (request.user?.sub ?? 'anonymous') as UserId;
      const result = await schedulerReadService.getSchedulerCard(
        userId,
        paramsParsed.data.cardId as CardId
      );
      reply.send(wrapResponse(request, result.data, result.agentHints));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      void sendErrorEnvelope(reply, request, {
        statusCode: 400,
        code: message.includes('not found') ? 'CARD_NOT_FOUND' : 'SCHEDULER_ERROR',
        message,
        category: 'validation',
        retryable: false,
      });
    }
  };

  // T3.1 — GET /v1/scheduler/cards
  const listCardsHandler = async (
    request: FastifyRequest<{ Querystring: Record<string, string> }>,
    reply: FastifyReply
  ): Promise<void> => {
    const authorized = await requireScopes(request, reply, {
      requiredScopes: ['scheduler:plan'],
      match: 'all',
    });
    if (!authorized) return;

    try {
      const parsed = SchedulerCardListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        await sendErrorEnvelope(reply, request, {
          statusCode: 400,
          code: 'INVALID_QUERY',
          message: `Invalid query params: ${parsed.error.message}`,
          category: 'validation',
          retryable: false,
        });
        return;
      }

      const q = parsed.data;
      const userId = q.userId as UserId;

      const filters: ISchedulerCardExtendedFilters = {
        ...(q.lane !== undefined && { lane: q.lane }),
        ...(q.state !== undefined && { state: q.state }),
        ...(q.algorithm !== undefined && { schedulingAlgorithm: q.algorithm }),
        ...(q.dueBefore !== undefined && { dueBefore: new Date(q.dueBefore) }),
        ...(q.dueAfter !== undefined && { dueAfter: new Date(q.dueAfter) }),
      };

      const result = await schedulerReadService.listSchedulerCards(
        userId,
        filters,
        { limit: q.limit, offset: q.offset },
        { sortBy: q.sortBy, sortOrder: q.sortOrder }
      );

      reply.send({
        ...wrapResponse(request, result.data.cards, result.agentHints),
        pagination: {
          offset: q.offset,
          limit: q.limit,
          total: result.data.total,
          hasMore: q.offset + q.limit < result.data.total,
        },
      });
    } catch (error) {
      handleError(error, request, reply);
    }
  };

  // T3.2 — GET /v1/scheduler/reviews
  const listReviewsHandler = async (
    request: FastifyRequest<{ Querystring: Record<string, string> }>,
    reply: FastifyReply
  ): Promise<void> => {
    const authorized = await requireScopes(request, reply, {
      requiredScopes: ['scheduler:plan'],
      match: 'all',
    });
    if (!authorized) return;

    try {
      const parsed = ReviewListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        await sendErrorEnvelope(reply, request, {
          statusCode: 400,
          code: 'INVALID_QUERY',
          message: `Invalid query params: ${parsed.error.message}`,
          category: 'validation',
          retryable: false,
        });
        return;
      }

      const q = parsed.data;
      const userId = q.userId as UserId;

      const filters: IReviewExtendedFilters = {
        ...(q.cardId !== undefined && { cardId: q.cardId as CardId }),
        ...(q.sessionId !== undefined && { sessionId: q.sessionId }),
        ...(q.lane !== undefined && { lane: q.lane }),
        ...(q.algorithm !== undefined && { schedulingAlgorithm: q.algorithm }),
        ...(q.rating !== undefined && { rating: q.rating }),
        ...(q.outcome !== undefined && { outcome: q.outcome }),
        ...(q.reviewedAfter !== undefined && { startDate: new Date(q.reviewedAfter) }),
        ...(q.reviewedBefore !== undefined && { endDate: new Date(q.reviewedBefore) }),
      };

      const result = await schedulerReadService.listReviews(
        userId,
        filters,
        { limit: q.limit, offset: q.offset },
        { sortBy: q.sortBy, sortOrder: q.sortOrder }
      );

      reply.send({
        ...wrapResponse(request, result.data.reviews, result.agentHints),
        pagination: {
          offset: q.offset,
          limit: q.limit,
          total: result.data.total,
          hasMore: q.offset + q.limit < result.data.total,
        },
      });
    } catch (error) {
      handleError(error, request, reply);
    }
  };

  // T3.2 — GET /v1/scheduler/reviews/stats
  const reviewStatsHandler = async (
    request: FastifyRequest<{ Querystring: Record<string, string> }>,
    reply: FastifyReply
  ): Promise<void> => {
    const authorized = await requireScopes(request, reply, {
      requiredScopes: ['scheduler:plan'],
      match: 'all',
    });
    if (!authorized) return;

    try {
      const parsed = ReviewStatsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        await sendErrorEnvelope(reply, request, {
          statusCode: 400,
          code: 'INVALID_QUERY',
          message: `Invalid query params: ${parsed.error.message}`,
          category: 'validation',
          retryable: false,
        });
        return;
      }

      const q = parsed.data;
      const userId = q.userId as UserId;

      const filters: IReviewExtendedFilters = {
        ...(q.cardId !== undefined && { cardId: q.cardId as CardId }),
        ...(q.sessionId !== undefined && { sessionId: q.sessionId }),
        ...(q.lane !== undefined && { lane: q.lane }),
        ...(q.algorithm !== undefined && { schedulingAlgorithm: q.algorithm }),
        ...(q.rating !== undefined && { rating: q.rating }),
        ...(q.outcome !== undefined && { outcome: q.outcome }),
        ...(q.reviewedAfter !== undefined && { startDate: new Date(q.reviewedAfter) }),
        ...(q.reviewedBefore !== undefined && { endDate: new Date(q.reviewedBefore) }),
      };

      const result = await schedulerReadService.getReviewStats(userId, filters);
      reply.send(wrapResponse(request, result.data, result.agentHints));
    } catch (error) {
      handleError(error, request, reply);
    }
  };

  // T3.3 — POST /v1/scheduler/forecast
  const forecastHandler = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const authorized = await requireScopes(request, reply, {
      requiredScopes: ['scheduler:plan'],
      match: 'all',
    });
    if (!authorized) return;
    if (!(await withPayloadGuard(request, reply))) return;

    try {
      const parsed = ForecastInputSchema.safeParse(request.body);
      if (!parsed.success) {
        await sendErrorEnvelope(reply, request, {
          statusCode: 400,
          code: 'INVALID_BODY',
          message: `Invalid forecast input: ${parsed.error.message}`,
          category: 'validation',
          retryable: false,
        });
        return;
      }

      const result = await schedulerReadService.generateForecast({
        ...parsed.data,
        userId: parsed.data.userId as UserId,
      });
      reply.send(wrapResponse(request, result.data, result.agentHints));
    } catch (error) {
      handleError(error, request, reply);
    }
  };

  // Register Phase 3 routes
  fastify.get<{ Params: { cardId: string } }>(
    '/v1/scheduler/cards/:cardId',
    authPreHandler,
    getCardHandler
  );
  fastify.get<{ Querystring: Record<string, string> }>(
    '/v1/scheduler/cards',
    authPreHandler,
    listCardsHandler
  );
  fastify.get<{ Querystring: Record<string, string> }>(
    '/v1/scheduler/reviews',
    authPreHandler,
    listReviewsHandler
  );
  fastify.get<{ Querystring: Record<string, string> }>(
    '/v1/scheduler/reviews/stats',
    authPreHandler,
    reviewStatsHandler
  );
  fastify.post<{ Body: unknown }>('/v1/scheduler/forecast', authPreHandler, forecastHandler);

  // ==========================================================================
  // Phase 4 — Review Queue & Retention Prediction (H5/H6)
  // ==========================================================================

  // H5 — GET /v1/scheduler/review-queue
  const getReviewQueueHandler = async (
    request: FastifyRequest<{ Querystring: Record<string, string> }>,
    reply: FastifyReply
  ): Promise<void> => {
    const authorized = await requireScopes(request, reply, {
      requiredScopes: ['scheduler:plan'],
      match: 'all',
    });
    if (!authorized) return;

    try {
      const userId = (request.user?.sub ?? 'anonymous') as UserId;
      const query = request.query;

      const input = {
        userId,
        lane: query['lane'],
        limit: query['limit'] !== undefined ? parseInt(query['limit'], 10) : undefined,
        asOf: query['asOf'],
      };

      const ctx = buildExecutionContext(userId, request.id as CorrelationId);
      const result = await schedulerService.getReviewQueue(input, ctx);
      reply.send(wrapResponse(request, result.data, result.agentHints));
    } catch (error) {
      handleError(error, request, reply);
    }
  };

  // H6 — POST /v1/scheduler/retention/predict
  const predictRetentionHandler = async (
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
      const result = await schedulerService.predictRetention(request.body, ctx);
      reply.send(wrapResponse(request, result.data, result.agentHints));
    } catch (error) {
      handleError(error, request, reply);
    }
  };

  fastify.get<{ Querystring: Record<string, string> }>(
    '/v1/scheduler/review-queue',
    authPreHandler,
    getReviewQueueHandler
  );
  fastify.post<{ Body: unknown }>(
    '/v1/scheduler/retention/predict',
    authPreHandler,
    predictRetentionHandler
  );

  // H7 — GET /v1/scheduler/cards/:cardId/projection
  const getCardProjectionHandler = async (
    request: FastifyRequest<{ Params: { cardId: string }; Querystring: Record<string, string> }>,
    reply: FastifyReply
  ): Promise<void> => {
    const authorized = await requireScopes(request, reply, {
      requiredScopes: ['scheduler:plan'],
      match: 'all',
    });
    if (!authorized) return;

    try {
      const userId = (request.user?.sub ?? 'anonymous') as UserId;
      const { cardId } = request.params;
      const { asOf } = request.query;

      const input = {
        userId,
        cardId,
        ...(asOf !== undefined && { asOf }),
      };

      const ctx = buildExecutionContext(userId, request.id as CorrelationId);
      const result = await schedulerService.getCardProjection(input, ctx);
      reply.send(wrapResponse(request, result.data, result.agentHints));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      void sendErrorEnvelope(reply, request, {
        statusCode: 400,
        code: message.includes('not found') ? 'CARD_NOT_FOUND' : 'SCHEDULER_ERROR',
        message,
        category: 'validation',
        retryable: false,
      });
    }
  };

  fastify.get<{ Params: { cardId: string }; Querystring: Record<string, string> }>(
    '/v1/scheduler/cards/:cardId/projection',
    authPreHandler,
    getCardProjectionHandler
  );
}
