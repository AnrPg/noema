/**
 * @noema/knowledge-graph-service - PKG Mastery Routes
 *
 * Explicit mastery read-model endpoints for learner-facing and agent-facing
 * mode-scoped progress summaries.
 */

import type { StudyMode, UserId } from '@noema/types';
import type { FastifyInstance } from 'fastify';
import type { IKnowledgeGraphService } from '../../domain/knowledge-graph-service/knowledge-graph.service.js';
import { NodeFilter } from '../../domain/knowledge-graph-service/value-objects/graph.value-objects.js';
import type { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { MasterySummaryQueryParamsSchema } from '../schemas/pkg-mastery.schemas.js';
import {
  type IRouteOptions,
  UserIdParamSchema,
  assertUserAccess,
  attachStartTimeHook,
  buildContext,
  handleError,
  wrapResponse,
} from '../shared/route-helpers.js';

export function registerPkgMasteryRoutes(
  fastify: FastifyInstance,
  service: IKnowledgeGraphService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>,
  _options?: IRouteOptions
): void {
  attachStartTimeHook(fastify);

  fastify.get<{ Params: { userId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/users/:userId/pkg/mastery/summary',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['PKG Mastery'],
        summary: 'Get a mode-scoped mastery summary for PKG nodes',
        description:
          'Returns an explicit mastery read model for the user in the requested study mode.',
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          required: ['studyMode'],
          properties: {
            studyMode: { type: 'string', enum: ['language_learning', 'knowledge_gaining'] },
            domain: { type: 'string' },
            masteryThreshold: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId } = UserIdParamSchema.parse(request.params);
        assertUserAccess(request, userId);

        const parsed = MasterySummaryQueryParamsSchema.parse(request.query);
        const context = buildContext(request);
        const filters = NodeFilter.create({
          userId,
          graphType: 'pkg',
          studyMode: parsed.studyMode as StudyMode,
          ...(parsed.domain !== undefined ? { domain: parsed.domain } : {}),
        });

        const result = await service.getNodeMasterySummary(
          userId as UserId,
          filters,
          parsed.masteryThreshold,
          context
        );

        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );
}
