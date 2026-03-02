/**
 * @noema/knowledge-graph-service - Structural Health Routes
 *
 * Fastify route definitions for structural health and metacognitive
 * stage assessment endpoints.
 *
 * Prefix: /api/v1/users/:userId/health
 */

import type { UserId } from '@noema/types';
import type { FastifyInstance } from 'fastify';
import type { IKnowledgeGraphService } from '../../domain/knowledge-graph-service/knowledge-graph.service.js';
import type { createAuthMiddleware } from '../middleware/auth.middleware.js';
import {
    HealthQueryParamsSchema,
    StageQueryParamsSchema,
} from '../schemas/structural-health.schemas.js';
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
 * Register structural health routes.
 * Prefix: /api/v1/users/:userId/health
 */
export function registerStructuralHealthRoutes(
  fastify: FastifyInstance,
  service: IKnowledgeGraphService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>,
  _options?: IRouteOptions
): void {
  attachStartTimeHook(fastify);

  // ============================================================================
  // GET /api/v1/users/:userId/health — Get structural health report
  // ============================================================================

  fastify.get<{ Params: { userId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/users/:userId/health',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Structural Health'],
        summary: 'Get structural health report',
        description:
          'Return a comprehensive structural health assessment synthesizing metrics, ' +
          'misconceptions, and metacognitive stage for the user in the given domain.',
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

        const query = HealthQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const result = await service.getStructuralHealth(
          userId as UserId,
          query.domain,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // GET /api/v1/users/:userId/health/stage — Get metacognitive stage
  // ============================================================================

  fastify.get<{ Params: { userId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/users/:userId/health/stage',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Structural Health'],
        summary: 'Get metacognitive stage assessment',
        description:
          'Assess the user\'s metacognitive stage for the given domain based on ' +
          'structural metrics, stage gate criteria, and regression detection.',
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

        const query = StageQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const result = await service.getMetacognitiveStage(
          userId as UserId,
          query.domain,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );
}
