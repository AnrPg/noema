/**
 * @noema/knowledge-graph-service - PKG↔CKG Comparison Routes
 *
 * Fastify route definitions for comparing a user's PKG against
 * the Canonical Knowledge Graph.
 *
 * Prefix: /api/v1/users/:userId/comparison
 */

import type { UserId } from '@noema/types';
import type { FastifyInstance } from 'fastify';
import {
  toComparisonResponseDto,
  toDomainComparisonRequest,
} from '../../application/knowledge-graph/comparison/mapper.js';
import type { IKnowledgeGraphService } from '../../domain/knowledge-graph-service/knowledge-graph.service.js';
import type { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { ComparisonQueryParamsSchema } from '../schemas/comparison.schemas.js';
import {
  type IRouteOptions,
  UserIdParamSchema,
  assertUserAccess,
  attachStartTimeHook,
  buildContext,
  handleError,
  wrapResponse,
} from '../shared/route-helpers.js';

// ============================================================================
// Route Plugin
// ============================================================================

/**
 * Register PKG↔CKG comparison routes.
 * Prefix: /api/v1/users/:userId/comparison
 */
export function registerComparisonRoutes(
  fastify: FastifyInstance,
  service: IKnowledgeGraphService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>,
  _options?: IRouteOptions
): void {
  attachStartTimeHook(fastify);

  // ============================================================================
  // GET /api/v1/users/:userId/comparison — Compare PKG with CKG
  // ============================================================================

  fastify.get<{ Params: { userId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/users/:userId/comparison',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Comparison'],
        summary: 'Compare PKG with CKG',
        description:
          "Compare the user's Personal Knowledge Graph structure against the Canonical " +
          'Knowledge Graph. Supports both full-domain comparison and engagement-scoped ' +
          "comparison built from the learner's aligned concepts expanded by N hops.",
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: {
            domain: { type: 'string' },
            scopeMode: { type: 'string', enum: ['domain', 'engagement_hops'] },
            hopCount: { type: 'number', minimum: 0, maximum: 5 },
            bootstrapWhenUnseeded: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId } = UserIdParamSchema.parse(request.params);
        assertUserAccess(request, userId);

        const query = ComparisonQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const result = await service.compareWithCkg(
          userId as UserId,
          toDomainComparisonRequest({
            scopeMode: query.scopeMode,
            hopCount: query.hopCount,
            bootstrapWhenUnseeded: query.bootstrapWhenUnseeded,
            ...(query.domain !== undefined ? { domain: query.domain } : {}),
          }),
          context
        );
        reply.send(
          wrapResponse(toComparisonResponseDto(userId as UserId, result.data), result.agentHints, request)
        );
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );
}
