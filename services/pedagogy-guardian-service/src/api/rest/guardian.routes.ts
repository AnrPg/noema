import { createEmptyAgentHints, type IApiResponse } from '@noema/contracts';
import type { CorrelationId, UserId } from '@noema/types';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  GuardianError,
  GuardianValidationError,
  type IGuardianValidationOutcome,
  type PedagogyGuardianService,
} from '../../domain/pedagogy-guardian-service/index.js';
import type { createAuthMiddleware } from '../../middleware/auth.middleware.js';

export function registerGuardianRoutes(
  fastify: FastifyInstance,
  guardianService: PedagogyGuardianService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>
): void {
  function metadata(request: FastifyRequest): IApiResponse<unknown>['metadata'] {
    return {
      requestId: request.id,
      timestamp: new Date().toISOString(),
      serviceName: 'pedagogy-guardian-service',
      serviceVersion: '0.1.0',
      executionTime: 0,
    };
  }

  function context(request: FastifyRequest): { userId?: UserId; correlationId: CorrelationId } {
    const user = request.user as { sub?: string } | undefined;
    const headerUser = request.headers['x-user-id'];
    const userId =
      user?.sub ??
      (typeof headerUser === 'string'
        ? headerUser
        : Array.isArray(headerUser)
          ? headerUser[0]
          : undefined);
    return {
      ...(userId !== undefined ? { userId: userId as UserId } : {}),
      correlationId: request.id as CorrelationId,
    };
  }

  function wrap(
    data: IGuardianValidationOutcome,
    request: FastifyRequest
  ): IApiResponse<IGuardianValidationOutcome> {
    return {
      data,
      agentHints: createEmptyAgentHints(),
      metadata: metadata(request),
    };
  }

  function handleError(error: unknown, request: FastifyRequest, reply: FastifyReply): void {
    if (error instanceof GuardianValidationError) {
      reply.status(400).send({
        error: { code: error.code, message: error.message, details: error.details },
        metadata: metadata(request),
      });
      return;
    }
    if (error instanceof GuardianError) {
      reply.status(422).send({
        error: { code: error.code, message: error.message, details: error.details },
        metadata: metadata(request),
      });
      return;
    }
    fastify.log.error(error);
    reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      metadata: metadata(request),
    });
  }

  fastify.post<{ Body: unknown }>(
    '/v1/validate/lesson-plan',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const outcome = await guardianService.validateLessonPlan(request.body, context(request));
        reply.status(outcome.blocking ? 422 : 200).send(wrap(outcome, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  fastify.post<{ Body: unknown }>(
    '/v1/validate/step',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const outcome = await guardianService.validateStep(request.body, context(request));
        reply.status(outcome.blocking ? 422 : 200).send(wrap(outcome, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  fastify.post<{ Body: unknown }>(
    '/v1/validate/activity',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const outcome = await guardianService.validateActivity(request.body, context(request));
        reply.status(outcome.blocking ? 422 : 200).send(wrap(outcome, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  fastify.post<{ Body: unknown }>(
    '/v1/validate/replan',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const outcome = await guardianService.validateReplan(request.body, context(request));
        reply.status(outcome.blocking ? 422 : 200).send(wrap(outcome, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  fastify.post<{ Body: unknown }>(
    '/v1/validate/generated-variant',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const outcome = await guardianService.validateGeneratedVariant(
          request.body,
          context(request)
        );
        reply.status(outcome.blocking ? 422 : 200).send(wrap(outcome, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );
}
