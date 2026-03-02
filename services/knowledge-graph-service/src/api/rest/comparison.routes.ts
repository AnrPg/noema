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
import type { IKnowledgeGraphService } from '../../domain/knowledge-graph-service/knowledge-graph.service.js';
import type { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { ComparisonQueryParamsSchema } from '../schemas/comparison.schemas.js';
import {
    type IRouteOptions,
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
          'Compare the user\'s Personal Knowledge Graph structure against the Canonical ' +
          'Knowledge Graph for the specified domain. Returns alignment scores, divergences, ' +
          'and remediation suggestions.',
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          required: ['domain'],
          properties: {
            domain: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId } = request.params;
        assertUserAccess(request, userId);

        const query = ComparisonQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const result = await service.compareWithCkg(userId as UserId, query.domain, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );
}
