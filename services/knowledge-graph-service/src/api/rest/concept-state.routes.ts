import type { ConceptId, StudyMode, UserId } from '@noema/types';
import type { FastifyInstance } from 'fastify';
import type { ConceptStateService } from '../../domain/knowledge-graph-service/concept-state.service.js';
import type { createAuthMiddleware } from '../middleware/auth.middleware.js';
import {
  ConceptStateHistoryQueryParamsSchema,
  ConceptStateQueryParamsSchema,
  StabilitySummaryQueryParamsSchema,
} from '../schemas/concept-state.schemas.js';
import {
  type IRouteOptions,
  assertUserAccess,
  attachStartTimeHook,
  handleError,
  wrapResponse,
} from '../shared/route-helpers.js';

export function registerConceptStateRoutes(
  fastify: FastifyInstance,
  conceptStateService: ConceptStateService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>,
  _options?: IRouteOptions
): void {
  attachStartTimeHook(fastify);

  fastify.get<{
    Params: { conceptId: string };
    Querystring: Record<string, unknown>;
  }>(
    '/v1/concepts/:conceptId/state',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Concept State'],
        summary: 'Get revocable binary concept state',
        description:
          'Returns the Batch 7 concept-state projection derived from FSRS stability and recent reasoning quality.',
      },
    },
    async (request, reply) => {
      try {
        const parsed = ConceptStateQueryParamsSchema.parse(request.query);
        const userId = parsed.userId as UserId;
        assertUserAccess(request, userId);
        const projection = await conceptStateService.getProjection({
          userId,
          conceptId: request.params.conceptId as ConceptId,
          studyMode: parsed.studyMode as StudyMode,
        });
        if (projection === null) {
          await reply.status(404).send(
            wrapResponse(
              {
                code: 'CONCEPT_STATE_NOT_FOUND',
                conceptId: request.params.conceptId,
              },
              undefined,
              request
            )
          );
          return;
        }
        reply.send(wrapResponse(projection, undefined, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  fastify.get<{
    Params: { conceptId: string };
    Querystring: Record<string, unknown>;
  }>(
    '/v1/concepts/:conceptId/state/history',
    { preHandler: authMiddleware, schema: { tags: ['Concept State'] } },
    async (request, reply) => {
      try {
        const parsed = ConceptStateHistoryQueryParamsSchema.parse(request.query);
        const userId = parsed.userId as UserId;
        assertUserAccess(request, userId);
        const history = await conceptStateService.getHistory({
          userId,
          conceptId: request.params.conceptId as ConceptId,
          studyMode: parsed.studyMode as StudyMode,
          limit: parsed.limit,
        });
        reply.send(wrapResponse({ history }, undefined, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  fastify.get<{
    Params: { conceptId: string };
    Querystring: Record<string, unknown>;
  }>(
    '/v1/concepts/:conceptId/prerequisite-gaps',
    { preHandler: authMiddleware, schema: { tags: ['Concept State'] } },
    async (request, reply) => {
      try {
        const parsed = ConceptStateQueryParamsSchema.parse(request.query);
        const userId = parsed.userId as UserId;
        assertUserAccess(request, userId);
        const gaps = await conceptStateService.getPrerequisiteGaps({
          userId,
          conceptId: request.params.conceptId as ConceptId,
          studyMode: parsed.studyMode as StudyMode,
        });
        reply.send(wrapResponse({ gaps }, undefined, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  fastify.get<{ Params: { userId: string }; Querystring: Record<string, unknown> }>(
    '/v1/users/:userId/stability-summary',
    { preHandler: authMiddleware, schema: { tags: ['Concept State'] } },
    async (request, reply) => {
      try {
        const userId = request.params.userId as UserId;
        assertUserAccess(request, userId);
        const parsed = StabilitySummaryQueryParamsSchema.parse(request.query);
        const summary = await conceptStateService.getStabilitySummary({
          userId,
          studyMode: parsed.studyMode as StudyMode,
        });
        reply.send(wrapResponse(summary, undefined, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );
}
