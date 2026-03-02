/**
 * @noema/knowledge-graph-service - Metrics Routes
 *
 * Fastify route definitions for structural metrics operations:
 * get latest metrics, compute metrics, and get metrics history.
 *
 * Prefix: /api/v1/users/:userId/metrics
 */

import type { UserId } from '@noema/types';
import type { FastifyInstance } from 'fastify';
import type { IKnowledgeGraphService } from '../../domain/knowledge-graph-service/knowledge-graph.service.js';
import type { IMetricsHistoryOptions } from '../../domain/knowledge-graph-service/metrics.repository.js';
import type { createAuthMiddleware } from '../middleware/auth.middleware.js';
import {
  MetricsComputeRequestSchema,
  MetricsHistoryQueryParamsSchema,
  MetricsQueryParamsSchema,
} from '../schemas/metrics.schemas.js';
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
 * Register structural metrics routes.
 * Prefix: /api/v1/users/:userId/metrics
 */
export function registerMetricsRoutes(
  fastify: FastifyInstance,
  service: IKnowledgeGraphService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>,
  options?: IRouteOptions
): void {
  attachStartTimeHook(fastify);

  const writeRouteConfig = options?.rateLimit
    ? { rateLimit: { max: options.rateLimit.writeMax, timeWindow: options.rateLimit.timeWindow } }
    : {};

  // ============================================================================
  // GET /api/v1/users/:userId/metrics — Get latest metrics
  // ============================================================================

  fastify.get<{ Params: { userId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/users/:userId/metrics',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Metrics'],
        summary: 'Get latest structural metrics',
        description:
          'Return the most recently cached structural metrics snapshot for the user in the given domain.',
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

        const query = MetricsQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const result = await service.getMetrics(userId as UserId, query.domain, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // POST /api/v1/users/:userId/metrics/compute — Trigger recomputation
  // ============================================================================

  fastify.post<{ Params: { userId: string }; Body: unknown }>(
    '/api/v1/users/:userId/metrics/compute',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['Metrics'],
        summary: 'Compute structural metrics',
        description:
          'Trigger a full recomputation of structural metrics for the user in the given domain. ' +
          'This is an expensive operation.',
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
        body: {
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

        const parsed = MetricsComputeRequestSchema.parse(request.body);
        const context = buildContext(request);

        const result = await service.computeMetrics(userId as UserId, parsed.domain, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // GET /api/v1/users/:userId/metrics/history — Get metrics history
  // ============================================================================

  fastify.get<{ Params: { userId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/users/:userId/metrics/history',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Metrics'],
        summary: 'Get structural metrics history',
        description: 'Return a time-series of structural metric snapshots for trend visualization.',
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
            from: { type: 'string', format: 'date-time' },
            to: { type: 'string', format: 'date-time' },
            limit: { type: 'number', minimum: 1, maximum: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId } = request.params;
        assertUserAccess(request, userId);

        const query = MetricsHistoryQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const historyOptions: IMetricsHistoryOptions = {
          limit: query.limit,
          ...(query.from !== undefined ? { since: query.from.toISOString() } : {}),
          ...(query.to !== undefined ? { until: query.to.toISOString() } : {}),
        };

        const result = await service.getMetricsHistory(
          userId as UserId,
          query.domain,
          historyOptions,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );
}
