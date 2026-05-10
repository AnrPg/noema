/**
 * @noema/session-service - Step-loop REST API routes.
 */

import type { IApiResponse } from '@noema/contracts';
import type { CorrelationId, UserId } from '@noema/types';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  AuthorizationError,
  BusinessRuleError,
  DomainError,
  SessionNotFoundError,
  ValidationError,
  VersionConflictError,
} from '../../domain/session-service/errors/index.js';
import type {
  IExecutionContext,
  SessionService,
} from '../../domain/session-service/session.service.js';
import type { createAuthMiddleware } from '../../middleware/auth.middleware.js';

interface SessionIdParams {
  sessionId: string;
}

interface LessonPlanIdParams {
  lessonPlanId: string;
}

interface StepIdParams {
  stepId: string;
}

export function registerSessionRoutes(
  fastify: FastifyInstance,
  sessionService: SessionService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>
): void {
  fastify.addHook('onRequest', (request, _reply, done) => {
    (request as FastifyRequest & { startTime: number }).startTime = Date.now();
    done();
  });

  function readUserTimezone(request: FastifyRequest): string | undefined {
    const raw = request.headers['x-user-timezone'];
    if (typeof raw !== 'string' || raw.trim().length === 0) return undefined;
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
    const correlationHeader = request.headers['x-correlation-id'];
    const idempotencyHeader = request.headers['x-idempotency-key'];
    return {
      userId: (user?.sub ?? 'anonymous') as UserId,
      correlationId:
        ((typeof correlationHeader === 'string' && correlationHeader.trim().length > 0
          ? correlationHeader
          : request.id) as CorrelationId) ||
        (`correlation_${Date.now()}` as CorrelationId),
      ...(typeof idempotencyHeader === 'string' && idempotencyHeader.trim().length > 0
        ? { idempotencyKey: idempotencyHeader.trim() }
        : {}),
      clientIp: request.ip,
      ...(ua !== undefined ? { userAgent: ua } : {}),
      ...(timezone !== undefined ? { timezone } : {}),
    };
  }

  function buildMetadata(request: FastifyRequest): IApiResponse<unknown>['metadata'] {
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
    return {
      data,
      agentHints: agentHints as IApiResponse<T>['agentHints'],
      metadata: buildMetadata(request),
    };
  }

  function handleError(error: unknown, request: FastifyRequest, reply: FastifyReply): void {
    const metadata = buildMetadata(request);
    if (error instanceof ValidationError) {
      reply.status(400).send({
        error: { code: error.code, message: error.message, fieldErrors: error.fieldErrors },
        metadata,
      });
      return;
    }
    if (error instanceof SessionNotFoundError) {
      reply.status(404).send({ error: { code: error.code, message: error.message }, metadata });
      return;
    }
    if (error instanceof VersionConflictError) {
      reply.status(409).send({ error: { code: error.code, message: error.message }, metadata });
      return;
    }
    if (error instanceof AuthorizationError) {
      reply.status(403).send({ error: { code: error.code, message: error.message }, metadata });
      return;
    }
    if (error instanceof BusinessRuleError || error instanceof DomainError) {
      reply.status(422).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        metadata,
      });
      return;
    }
    fastify.log.error(error);
    reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      metadata,
    });
  }

  fastify.post<{ Body: unknown }>(
    '/v1/sessions',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const result = await sessionService.startSession(request.body, buildContext(request));
        reply.status(201).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  fastify.get<{ Querystring: Record<string, string> }>(
    '/v1/sessions',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const result = await sessionService.listSessions(
          request.query,
          undefined,
          undefined,
          buildContext(request)
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  fastify.get<{ Params: SessionIdParams }>(
    '/v1/sessions/:sessionId',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const result = await sessionService.getSession(
          request.params.sessionId,
          buildContext(request)
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  fastify.post<{ Params: SessionIdParams; Body: unknown }>(
    '/v1/sessions/:sessionId/lesson-plan',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const result = await sessionService.createLessonPlan(
          request.params.sessionId,
          request.body,
          buildContext(request)
        );
        reply.status(201).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  fastify.post<{ Params: LessonPlanIdParams; Body: unknown }>(
    '/v1/lesson-plans/:lessonPlanId/goals',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const result = await sessionService.createGoal(
          request.params.lessonPlanId,
          request.body,
          buildContext(request)
        );
        reply.status(201).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  fastify.get<{ Params: SessionIdParams }>(
    '/v1/sessions/:sessionId/next-step',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const result = await sessionService.getStepLoopSnapshot(
          request.params.sessionId,
          buildContext(request)
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  fastify.post<{ Params: StepIdParams }>(
    '/v1/steps/:stepId/present',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const result = await sessionService.presentStep(
          request.params.stepId,
          buildContext(request)
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  fastify.post<{ Params: StepIdParams; Body: unknown }>(
    '/v1/steps/:stepId/answer',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const result = await sessionService.answerStep(
          request.params.stepId,
          request.body,
          buildContext(request)
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  fastify.post<{ Params: StepIdParams; Body: unknown }>(
    '/v1/steps/:stepId/skip',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const result = await sessionService.skipStep(
          request.params.stepId,
          request.body,
          buildContext(request)
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  fastify.post<{ Params: SessionIdParams; Body: unknown }>(
    '/v1/sessions/:sessionId/complete',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const result = await sessionService.completeSession(
          request.params.sessionId,
          request.body,
          buildContext(request)
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  fastify.post<{ Body: unknown }>(
    '/v1/learner-feedback-actions',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const result = await sessionService.recordLearnerFeedbackAction(
          request.body,
          buildContext(request)
        );
        reply.status(201).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  fastify.get<{ Querystring: Record<string, string> }>(
    '/v1/learner-feedback-history',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const result = await sessionService.getLearnerFeedbackHistory(
          request.query,
          buildContext(request)
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  fastify.get<{ Params: SessionIdParams }>(
    '/v1/sessions/:sessionId/learner-load-state',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const result = await sessionService.getLearnerLoadState(
          { sessionId: request.params.sessionId },
          buildContext(request)
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  fastify.get<{ Params: SessionIdParams }>(
    '/v1/sessions/:sessionId/exposure-budget-state',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const result = await sessionService.getExposureBudgetState(
          { sessionId: request.params.sessionId },
          buildContext(request)
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  fastify.post<{ Body: unknown }>(
    '/v1/agent-surface-exposures',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const result = await sessionService.recordAgentSurfaceExposure(
          request.body,
          buildContext(request)
        );
        reply.status(201).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  fastify.post<{ Body: unknown }>(
    '/v1/offline-intents',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const result = await sessionService.issueOfflineIntentToken(
          request.body,
          buildContext(request)
        );
        reply.status(201).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  fastify.post<{ Body: unknown }>(
    '/v1/offline-intents/verify',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const result = await sessionService.verifyOfflineIntentTokenPublic(
          request.body,
          buildContext(request)
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );
}
