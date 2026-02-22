/**
 * @noema/session-service - REST API Routes
 *
 * Fastify route definitions for session, attempt, and queue endpoints.
 */

import type { IApiResponse } from '@noema/contracts';
import type { CorrelationId, LearningMode, UserId } from '@noema/types';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  AttemptNotFoundError,
  AuthorizationError,
  BusinessRuleError,
  DomainError,
  InvalidSessionStateError,
  QueueError,
  SessionAlreadyActiveError,
  SessionNotFoundError,
  ValidationError,
  VersionConflictError,
} from '../../domain/session-service/errors/index.js';
import {
  AttemptListQuerySchema,
  SessionListQuerySchema,
} from '../../domain/session-service/session.schemas.js';
import type {
  IExecutionContext,
  SessionService,
} from '../../domain/session-service/session.service.js';
import type { SessionState } from '../../types/index.js';

// ============================================================================
// Request types
// ============================================================================

interface SessionIdParams {
  sessionId: string;
}

interface AttemptParams extends SessionIdParams {
  attemptId: string;
}

// ============================================================================
// Route Plugin
// ============================================================================

export async function registerSessionRoutes(
  fastify: FastifyInstance,
  sessionService: SessionService,
  authMiddleware?: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
): Promise<void> {
  // ==========================================================================
  // Helpers
  // ==========================================================================

  function buildContext(request: FastifyRequest): IExecutionContext {
    const user = request.user as { sub?: string } | undefined;
    const ua = request.headers['user-agent'];
    return {
      userId: (user?.sub ?? 'anonymous') as UserId,
      correlationId:
        (request.id as CorrelationId) || (`correlation_${Date.now()}` as CorrelationId),
      clientIp: request.ip,
      ...(ua !== undefined ? { userAgent: ua } : {}),
    };
  }

  function wrapResponse<T>(data: T, agentHints: unknown, request: FastifyRequest): IApiResponse<T> {
    return {
      data,
      agentHints: agentHints as IApiResponse<T>['agentHints'],
      metadata: {
        requestId: request.id,
        timestamp: new Date().toISOString(),
        serviceName: 'session-service',
        serviceVersion: '0.1.0',
        executionTime: 0,
      },
    };
  }

  function handleError(error: unknown, reply: FastifyReply): void {
    if (error instanceof ValidationError) {
      reply.status(400).send({
        error: { code: error.code, message: error.message, fieldErrors: error.fieldErrors },
      });
    } else if (error instanceof SessionNotFoundError || error instanceof AttemptNotFoundError) {
      reply.status(404).send({
        error: { code: error.code, message: error.message },
      });
    } else if (error instanceof SessionAlreadyActiveError) {
      reply.status(409).send({
        error: { code: error.code, message: error.message },
      });
    } else if (error instanceof VersionConflictError) {
      reply.status(409).send({
        error: {
          code: error.code,
          message: error.message,
          details: { expectedVersion: error.expectedVersion, actualVersion: error.actualVersion },
        },
      });
    } else if (error instanceof InvalidSessionStateError) {
      reply.status(422).send({
        error: {
          code: error.code,
          message: error.message,
          details: { currentState: error.currentState, attemptedAction: error.attemptedAction },
        },
      });
    } else if (error instanceof QueueError) {
      reply.status(422).send({
        error: { code: error.code, message: error.message },
      });
    } else if (error instanceof AuthorizationError) {
      reply.status(403).send({
        error: { code: (error as DomainError).code, message: error.message },
      });
    } else if (error instanceof BusinessRuleError) {
      reply.status(422).send({
        error: { code: (error as DomainError).code, message: error.message },
      });
    } else if (error instanceof DomainError) {
      reply.status(400).send({
        error: { code: error.code, message: error.message },
      });
    } else {
      fastify.log.error(error);
      reply.status(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      });
    }
  }

  // ==========================================================================
  // Auth Hook
  // ==========================================================================

  if (authMiddleware) {
    fastify.addHook('preHandler', authMiddleware);
  }

  // ==========================================================================
  // Session Lifecycle
  // ==========================================================================

  // POST /v1/sessions — Start session
  fastify.post<{ Body: unknown }>(
    '/v1/sessions',
    {
    },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const result = await sessionService.startSession(request.body, ctx);
        reply.status(201).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  // GET /v1/sessions — List sessions
  fastify.get<{ Querystring: Record<string, string> }>(
    '/v1/sessions',
    {
    },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const query = SessionListQuerySchema.parse(request.query);
        const result = await sessionService.listSessions(
          {
            ...(query.state !== undefined ? { state: query.state as SessionState } : {}),
            ...(query.learningMode !== undefined ? { learningMode: query.learningMode as LearningMode } : {}),
          },
          query.limit,
          query.offset,
          ctx
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  // GET /v1/sessions/:sessionId — Get session
  fastify.get<{ Params: SessionIdParams }>(
    '/v1/sessions/:sessionId',
    {
    },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const result = await sessionService.getSession(request.params.sessionId, ctx);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  // POST /v1/sessions/:sessionId/pause
  fastify.post<{ Params: SessionIdParams; Body: { reason?: string } }>(
    '/v1/sessions/:sessionId/pause',
    {
    },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const body = (request.body ?? {}) as { reason?: string };
        const result = await sessionService.pauseSession(
          request.params.sessionId,
          body.reason,
          ctx
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  // POST /v1/sessions/:sessionId/resume
  fastify.post<{ Params: SessionIdParams }>(
    '/v1/sessions/:sessionId/resume',
    {
    },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const result = await sessionService.resumeSession(request.params.sessionId, ctx);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  // POST /v1/sessions/:sessionId/complete
  fastify.post<{ Params: SessionIdParams }>(
    '/v1/sessions/:sessionId/complete',
    {
    },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const result = await sessionService.completeSession(request.params.sessionId, ctx);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  // POST /v1/sessions/:sessionId/abandon
  fastify.post<{ Params: SessionIdParams; Body: { reason?: string } }>(
    '/v1/sessions/:sessionId/abandon',
    {
    },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const body = (request.body ?? {}) as { reason?: string };
        const result = await sessionService.abandonSession(
          request.params.sessionId,
          body.reason,
          ctx
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  // ==========================================================================
  // Attempts
  // ==========================================================================

  // POST /v1/sessions/:sessionId/attempts — Record attempt
  fastify.post<{ Params: SessionIdParams; Body: unknown }>(
    '/v1/sessions/:sessionId/attempts',
    {
    },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const result = await sessionService.recordAttempt(
          request.params.sessionId,
          request.body,
          ctx
        );
        reply.status(201).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  // GET /v1/sessions/:sessionId/attempts — List attempts
  fastify.get<{ Params: SessionIdParams; Querystring: Record<string, string> }>(
    '/v1/sessions/:sessionId/attempts',
    {
    },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const query = AttemptListQuerySchema.parse(request.query);
        const result = await sessionService.listAttempts(
          request.params.sessionId,
          query.limit,
          query.offset,
          ctx
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  // POST /v1/sessions/:sessionId/attempts/:attemptId/hint — Request hint
  fastify.post<{
    Params: AttemptParams & { cardId?: string };
    Body: unknown;
  }>(
    '/v1/sessions/:sessionId/hint',
    {
    },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const body = request.body as { attemptId?: string; cardId?: string };
        const result = await sessionService.requestHint(
          request.params.sessionId,
          body.attemptId ?? '',
          body.cardId ?? '',
          request.body,
          ctx
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  // ==========================================================================
  // Queue Management
  // ==========================================================================

  // GET /v1/sessions/:sessionId/queue — Get queue
  fastify.get<{ Params: SessionIdParams }>(
    '/v1/sessions/:sessionId/queue',
    {
    },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const result = await sessionService.getQueue(request.params.sessionId, ctx);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  // POST /v1/sessions/:sessionId/queue/inject — Inject queue item
  fastify.post<{ Params: SessionIdParams; Body: unknown }>(
    '/v1/sessions/:sessionId/queue/inject',
    {
    },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const result = await sessionService.injectQueueItem(
          request.params.sessionId,
          request.body,
          ctx
        );
        reply.status(201).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  // POST /v1/sessions/:sessionId/queue/remove — Remove queue item
  fastify.post<{ Params: SessionIdParams; Body: unknown }>(
    '/v1/sessions/:sessionId/queue/remove',
    {
    },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const result = await sessionService.removeQueueItem(
          request.params.sessionId,
          request.body,
          ctx
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  // ==========================================================================
  // Strategy & Teaching
  // ==========================================================================

  // POST /v1/sessions/:sessionId/strategy
  fastify.post<{ Params: SessionIdParams; Body: unknown }>(
    '/v1/sessions/:sessionId/strategy',
    {
    },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const result = await sessionService.updateStrategy(
          request.params.sessionId,
          request.body,
          ctx
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  // POST /v1/sessions/:sessionId/teaching
  fastify.post<{ Params: SessionIdParams; Body: unknown }>(
    '/v1/sessions/:sessionId/teaching',
    {
    },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const result = await sessionService.changeTeaching(
          request.params.sessionId,
          request.body,
          ctx
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );
}
