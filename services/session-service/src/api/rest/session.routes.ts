/**
 * @noema/session-service - REST API Routes
 *
 * Fastify route definitions for session, attempt, and queue endpoints.
 * Follows canonical pattern from content-service routes.
 */

import type { IApiResponse } from '@noema/contracts';
import type { CorrelationId, LearningMode, StudyMode, UserId } from '@noema/types';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  AttemptNotFoundError,
  AuthorizationError,
  BusinessRuleError,
  DomainError,
  InvalidSessionStateError,
  QueueError,
  SessionNotFoundError,
  ValidationError,
  VersionConflictError,
} from '../../domain/session-service/errors/index.js';
import {
  AttemptListQuerySchema,
  SessionListQuerySchema,
  StreakQuerySchema,
} from '../../domain/session-service/session.schemas.js';
import type {
  IExecutionContext,
  SessionService,
} from '../../domain/session-service/session.service.js';
import type { StreakService } from '../../domain/session-service/streak.service.js';
import type { createAuthMiddleware } from '../../middleware/auth.middleware.js';
import type { SessionSortBy, SessionState, SortOrder } from '../../types/index.js';

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

export function registerSessionRoutes(
  fastify: FastifyInstance,
  sessionService: SessionService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>,
  streakService?: StreakService
): void {
  // ==========================================================================
  // Timing Hook
  // ==========================================================================

  fastify.addHook('onRequest', (request, _reply, done) => {
    (request as FastifyRequest & { startTime: number }).startTime = Date.now();
    done();
  });

  // ==========================================================================
  // Helpers
  // ==========================================================================

  function readUserTimezone(request: FastifyRequest): string | undefined {
    const raw = request.headers['x-user-timezone'];
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      return undefined;
    }
    try {
      Intl.DateTimeFormat(undefined, { timeZone: raw });
      return raw;
    } catch {
      return undefined;
    }
  }

  function buildContext(request: FastifyRequest): IExecutionContext {
    const user = request.user as { sub?: string } | undefined;
    const ua = request.headers['user-agent'];
    const timezone = readUserTimezone(request);
    return {
      userId: (user?.sub ?? 'anonymous') as UserId,
      correlationId:
        (request.id as CorrelationId) || (`correlation_${Date.now()}` as CorrelationId),
      clientIp: request.ip,
      ...(ua !== undefined ? { userAgent: ua } : {}),
      ...(timezone !== undefined ? { timezone } : {}),
    };
  }

  function buildMetadata(request: FastifyRequest): Record<string, unknown> {
    const startTime = (request as FastifyRequest & { startTime?: number }).startTime ?? Date.now();
    return {
      requestId: request.id,
      timestamp: new Date().toISOString(),
      serviceName: 'session-service',
      serviceVersion: '0.1.0',
      executionTime: Date.now() - startTime,
    };
  }

  function wrapResponse<T>(data: T, agentHints: unknown, request: FastifyRequest): IApiResponse<T> {
    const startTime = (request as FastifyRequest & { startTime?: number }).startTime ?? Date.now();
    return {
      data,
      agentHints: agentHints as IApiResponse<T>['agentHints'],
      metadata: {
        requestId: request.id,
        timestamp: new Date().toISOString(),
        serviceName: 'session-service',
        serviceVersion: '0.1.0',
        executionTime: Date.now() - startTime,
      },
    };
  }

  function handleError(error: unknown, request: FastifyRequest, reply: FastifyReply): void {
    const metadata = buildMetadata(request);

    if (error instanceof ValidationError) {
      reply.status(400).send({
        error: { code: error.code, message: error.message, fieldErrors: error.fieldErrors },
        metadata,
      });
    } else if (error instanceof SessionNotFoundError || error instanceof AttemptNotFoundError) {
      reply.status(404).send({
        error: { code: error.code, message: error.message },
        metadata,
      });
    } else if (error instanceof VersionConflictError) {
      reply.status(409).send({
        error: {
          code: error.code,
          message: error.message,
          details: { expectedVersion: error.expectedVersion, actualVersion: error.actualVersion },
        },
        metadata,
      });
    } else if (error instanceof InvalidSessionStateError) {
      reply.status(422).send({
        error: {
          code: error.code,
          message: error.message,
          details: { currentState: error.currentState, attemptedAction: error.attemptedAction },
        },
        metadata,
      });
    } else if (error instanceof QueueError) {
      reply.status(422).send({
        error: { code: error.code, message: error.message },
        metadata,
      });
    } else if (error instanceof AuthorizationError) {
      reply.status(403).send({
        error: { code: (error as DomainError).code, message: error.message },
        metadata,
      });
    } else if (error instanceof BusinessRuleError) {
      reply.status(422).send({
        error: { code: (error as DomainError).code, message: error.message },
        metadata,
      });
    } else if (error instanceof DomainError) {
      reply.status(400).send({
        error: { code: error.code, message: error.message },
        metadata,
      });
    } else {
      fastify.log.error(error);
      reply.status(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
        metadata,
      });
    }
  }

  // ==========================================================================
  // Session Lifecycle
  // ==========================================================================

  // POST /v1/sessions — Start session
  fastify.post<{ Body: unknown }>(
    '/v1/sessions',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const result = await sessionService.startSession(request.body, ctx);
        reply.status(201).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  // POST /v1/sessions/blueprint/validate — Validate agent-orchestrated blueprint
  fastify.post<{ Body: unknown }>(
    '/v1/sessions/blueprint/validate',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const result = await sessionService.validateSessionBlueprint(request.body, ctx);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  // GET /v1/sessions — List sessions
  fastify.get<{ Querystring: Record<string, string> }>(
    '/v1/sessions',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const query = SessionListQuerySchema.parse(request.query);
        const result = await sessionService.listSessions(
          {
            ...(query.state !== undefined ? { state: query.state as SessionState } : {}),
            ...(query.learningMode !== undefined
              ? { learningMode: query.learningMode as LearningMode }
              : {}),
            ...(query.studyMode !== undefined ? { studyMode: query.studyMode as StudyMode } : {}),
            ...(query.createdAfter !== undefined ? { createdAfter: query.createdAfter } : {}),
            ...(query.createdBefore !== undefined ? { createdBefore: query.createdBefore } : {}),
            ...(query.completedAfter !== undefined ? { completedAfter: query.completedAfter } : {}),
            ...(query.completedBefore !== undefined
              ? { completedBefore: query.completedBefore }
              : {}),
            ...(query.deckId !== undefined ? { deckId: query.deckId } : {}),
            ...(query.minAttempts !== undefined ? { minAttempts: query.minAttempts } : {}),
            ...(query.sortBy !== undefined ? { sortBy: query.sortBy as SessionSortBy } : {}),
            ...(query.sortOrder !== undefined ? { sortOrder: query.sortOrder as SortOrder } : {}),
          },
          query.limit,
          query.offset,
          ctx
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  // ==========================================================================
  // Streak (Phase 5, T5.2)
  // ==========================================================================

  // GET /v1/sessions/streak — Get study streak and heatmap
  // MUST be registered BEFORE /v1/sessions/:sessionId to avoid param capture.
  if (streakService) {
    fastify.get<{ Querystring: Record<string, string> }>(
      '/v1/sessions/streak',
      { preHandler: authMiddleware },
      async (request, reply) => {
        try {
          const ctx = buildContext(request);
          const query = StreakQuerySchema.parse(request.query);
          const result = await streakService.getStreak(
            {
              days: query.days,
              timezone: query.timezone,
              studyMode: query.studyMode as import('@noema/types').StudyMode,
            },
            { userId: ctx.userId }
          );
          reply.send(wrapResponse(result.data, result.agentHints, request));
        } catch (error) {
          handleError(error, request, reply);
        }
      }
    );
  }

  // GET /v1/sessions/:sessionId — Get session
  fastify.get<{ Params: SessionIdParams }>(
    '/v1/sessions/:sessionId',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const result = await sessionService.getSession(request.params.sessionId, ctx);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  // POST /v1/sessions/:sessionId/pause
  fastify.post<{ Params: SessionIdParams; Body: { reason?: string } }>(
    '/v1/sessions/:sessionId/pause',
    { preHandler: authMiddleware },
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
        handleError(error, request, reply);
      }
    }
  );

  // POST /v1/sessions/:sessionId/resume
  fastify.post<{ Params: SessionIdParams }>(
    '/v1/sessions/:sessionId/resume',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const result = await sessionService.resumeSession(request.params.sessionId, ctx);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  // POST /v1/sessions/:sessionId/complete
  fastify.post<{ Params: SessionIdParams }>(
    '/v1/sessions/:sessionId/complete',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const result = await sessionService.completeSession(request.params.sessionId, ctx);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  // POST /v1/sessions/:sessionId/expire
  fastify.post<{ Params: SessionIdParams }>(
    '/v1/sessions/:sessionId/expire',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const result = await sessionService.expireSession(request.params.sessionId, ctx);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  // POST /v1/internal/sessions/:sessionId/expire — System-level expiration
  // Used by background jobs / HLR sidecar; requires session:system:expire scope.
  fastify.post<{ Params: SessionIdParams }>(
    '/v1/internal/sessions/:sessionId/expire',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const scopes = (request.user as { scopes?: string[] } | undefined)?.scopes ?? [];
        if (!scopes.includes('session:system:expire')) {
          return reply.status(403).send({
            error: {
              code: 'FORBIDDEN',
              message: 'Missing required scope: session:system:expire',
            },
            metadata: buildMetadata(request),
          });
        }
        const ctx = buildContext(request);
        const result = await sessionService.expireSessionSystem(request.params.sessionId, ctx);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  // POST /v1/sessions/:sessionId/abandon
  fastify.post<{ Params: SessionIdParams; Body: { reason?: string } }>(
    '/v1/sessions/:sessionId/abandon',
    { preHandler: authMiddleware },
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
        handleError(error, request, reply);
      }
    }
  );

  // ==========================================================================
  // Attempts
  // ==========================================================================

  // POST /v1/sessions/:sessionId/attempts — Record attempt
  fastify.post<{ Params: SessionIdParams; Body: unknown }>(
    '/v1/sessions/:sessionId/attempts',
    { preHandler: authMiddleware },
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
        handleError(error, request, reply);
      }
    }
  );

  // GET /v1/sessions/:sessionId/attempts — List attempts
  fastify.get<{ Params: SessionIdParams; Querystring: Record<string, string> }>(
    '/v1/sessions/:sessionId/attempts',
    { preHandler: authMiddleware },
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
        handleError(error, request, reply);
      }
    }
  );

  // POST /v1/sessions/:sessionId/attempts/:attemptId/hint — Request hint
  fastify.post<{
    Params: AttemptParams;
    Body: unknown;
  }>(
    '/v1/sessions/:sessionId/attempts/:attemptId/hint',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const result = await sessionService.requestHint(
          request.params.sessionId,
          request.params.attemptId,
          request.body,
          ctx
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  // ==========================================================================
  // Queue Management
  // ==========================================================================

  // GET /v1/sessions/:sessionId/queue — Get queue
  fastify.get<{ Params: SessionIdParams }>(
    '/v1/sessions/:sessionId/queue',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const result = await sessionService.getQueue(request.params.sessionId, ctx);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  // POST /v1/sessions/:sessionId/queue/inject — Inject queue item
  fastify.post<{ Params: SessionIdParams; Body: unknown }>(
    '/v1/sessions/:sessionId/queue/inject',
    { preHandler: authMiddleware },
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
        handleError(error, request, reply);
      }
    }
  );

  // POST /v1/sessions/:sessionId/queue/remove — Remove queue item
  fastify.post<{ Params: SessionIdParams; Body: unknown }>(
    '/v1/sessions/:sessionId/queue/remove',
    { preHandler: authMiddleware },
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
        handleError(error, request, reply);
      }
    }
  );

  // POST /v1/sessions/:sessionId/checkpoints/evaluate — Evaluate adaptive checkpoint signal
  fastify.post<{ Params: SessionIdParams; Body: unknown }>(
    '/v1/sessions/:sessionId/checkpoints/evaluate',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const result = await sessionService.evaluateAdaptiveCheckpoint(
          request.params.sessionId,
          request.body,
          ctx
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  // POST /v1/sessions/:sessionId/cohort/propose
  fastify.post<{ Params: SessionIdParams; Body: unknown }>(
    '/v1/sessions/:sessionId/cohort/propose',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const result = await sessionService.proposeCohort(
          request.params.sessionId,
          request.body,
          ctx
        );
        reply.status(201).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  // POST /v1/sessions/:sessionId/cohort/accept
  fastify.post<{ Params: SessionIdParams; Body: unknown }>(
    '/v1/sessions/:sessionId/cohort/accept',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const result = await sessionService.acceptCohort(
          request.params.sessionId,
          request.body,
          ctx
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  // POST /v1/sessions/:sessionId/cohort/revise
  fastify.post<{ Params: SessionIdParams; Body: unknown }>(
    '/v1/sessions/:sessionId/cohort/revise',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const result = await sessionService.reviseCohort(
          request.params.sessionId,
          request.body,
          ctx
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  // POST /v1/sessions/:sessionId/cohort/commit
  fastify.post<{ Params: SessionIdParams; Body: unknown }>(
    '/v1/sessions/:sessionId/cohort/commit',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const result = await sessionService.commitCohort(
          request.params.sessionId,
          request.body,
          ctx
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  // ==========================================================================
  // Strategy & Teaching
  // ==========================================================================

  // POST /v1/sessions/:sessionId/strategy
  fastify.post<{ Params: SessionIdParams; Body: unknown }>(
    '/v1/sessions/:sessionId/strategy',
    { preHandler: authMiddleware },
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
        handleError(error, request, reply);
      }
    }
  );

  // POST /v1/sessions/:sessionId/teaching
  fastify.post<{ Params: SessionIdParams; Body: unknown }>(
    '/v1/sessions/:sessionId/teaching',
    { preHandler: authMiddleware },
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
        handleError(error, request, reply);
      }
    }
  );

  // ==========================================================================
  // Offline Intent Tokens (ADR-0023 — session-service is the single authority)
  // ==========================================================================

  // POST /v1/offline-intents — Issue a signed offline intent token
  fastify.post<{ Body: unknown }>(
    '/v1/offline-intents',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const result = await sessionService.issueOfflineIntentToken(request.body, ctx);
        reply.status(201).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  // POST /v1/offline-intents/verify — Verify a signed offline intent token
  fastify.post<{ Body: unknown }>(
    '/v1/offline-intents/verify',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const ctx = buildContext(request);
        const result = await sessionService.verifyOfflineIntentTokenPublic(request.body, ctx);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );
}
