import {
  createEmptyAgentHints,
  type IApiResponse,
  type IBadgeProjectionDto,
  type ICapabilityTierProgressDto,
  type IGamificationSummaryDto,
  type IStreakStatusDto,
} from '@noema/contracts';
import { StudyMode, type UserId } from '@noema/types';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  ProjectionNotFoundError,
  type GamificationService,
} from '../../domain/gamification-service/index.js';
import type { createAuthMiddleware } from '../../middleware/auth.middleware.js';

interface IUserParams {
  userId: string;
}

interface IGamificationQuerystring {
  studyMode?: StudyMode;
}

export function registerGamificationRoutes(
  fastify: FastifyInstance,
  gamificationService: GamificationService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>
): void {
  function buildMetadata(request: FastifyRequest): IApiResponse<unknown>['metadata'] {
    return {
      requestId: request.id,
      timestamp: new Date().toISOString(),
      serviceName: 'gamification-service',
      serviceVersion: '0.1.0',
      executionTime: 0,
    };
  }

  function wrapResponse<T>(data: T, request: FastifyRequest): IApiResponse<T> {
    return {
      data,
      agentHints: createEmptyAgentHints(),
      metadata: buildMetadata(request),
    };
  }

  function handleError(error: unknown, request: FastifyRequest, reply: FastifyReply): void {
    if (error instanceof ProjectionNotFoundError) {
      reply.status(404).send({
        error: { code: error.code, message: error.message, details: error.details },
        metadata: buildMetadata(request),
      });
      return;
    }

    fastify.log.error(error);
    reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      metadata: buildMetadata(request),
    });
  }

  function getStudyMode(query: IGamificationQuerystring): StudyMode {
    return query.studyMode ?? StudyMode.KNOWLEDGE_GAINING;
  }

  fastify.get<{ Params: IUserParams; Querystring: IGamificationQuerystring }>(
    '/v1/users/:userId/gamification/summary',

    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const data: IGamificationSummaryDto = await gamificationService.getSummary(
          request.params.userId as UserId,
          getStudyMode(request.query)
        );
        reply.send(wrapResponse(data, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  fastify.get<{ Params: IUserParams; Querystring: IGamificationQuerystring }>(
    '/v1/users/:userId/gamification/streak',

    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const data: IStreakStatusDto = await gamificationService.getStreak(
          request.params.userId as UserId,
          getStudyMode(request.query)
        );
        reply.send(wrapResponse(data, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  fastify.get<{ Params: IUserParams; Querystring: IGamificationQuerystring }>(
    '/v1/users/:userId/gamification/badges',

    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const badges: IBadgeProjectionDto[] = await gamificationService.getBadges(
          request.params.userId as UserId,
          getStudyMode(request.query)
        );
        reply.send(wrapResponse({ badges }, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  fastify.get<{ Params: IUserParams; Querystring: IGamificationQuerystring }>(
    '/v1/users/:userId/gamification/progression',

    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const data: ICapabilityTierProgressDto = await gamificationService.getProgression(
          request.params.userId as UserId,
          getStudyMode(request.query)
        );
        reply.send(wrapResponse(data, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );
}
