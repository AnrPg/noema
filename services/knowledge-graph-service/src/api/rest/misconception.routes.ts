/**
 * @noema/knowledge-graph-service - Misconception Routes
 *
 * Fastify route definitions for misconception detection and lifecycle:
 * get misconceptions, detect misconceptions, and update misconception status.
 *
 * Prefix: /api/v1/users/:userId/misconceptions
 */

import type { StudyMode, UserId } from '@noema/types';
import type { FastifyInstance } from 'fastify';
import type { IKnowledgeGraphService } from '../../domain/knowledge-graph-service/knowledge-graph.service.js';
import type { createAuthMiddleware } from '../middleware/auth.middleware.js';
import {
  DetectMisconceptionsRequestSchema,
  MisconceptionQueryParamsSchema,
  UpdateMisconceptionStatusRequestSchema,
} from '../schemas/misconception.schemas.js';
import {
  type IRouteOptions,
  UserDetectionParamSchema,
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
 * Register misconception routes.
 * Prefix: /api/v1/users/:userId/misconceptions
 */
export function registerMisconceptionRoutes(
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
  // GET /api/v1/users/:userId/misconceptions — List misconceptions
  // ============================================================================

  fastify.get<{ Params: { userId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/users/:userId/misconceptions',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Misconceptions'],
        summary: 'List misconceptions for a user',
        description:
          'Return existing misconception detections for the user, optionally filtered by domain and status.',
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: {
            domain: { type: 'string' },
            status: { type: 'string' },
            studyMode: { type: 'string', enum: ['language_learning', 'knowledge_gaining'] },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId } = UserIdParamSchema.parse(request.params);
        assertUserAccess(request, userId);

        const query = MisconceptionQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const result = await service.getMisconceptions(
          userId as UserId,
          query.domain,
          query.studyMode as StudyMode,
          context
        );

        // Client-side status filtering (service returns all for domain)
        const data =
          query.status !== undefined && query.status !== ''
            ? result.data.filter((d) => d.status === query.status)
            : result.data;

        reply.send(wrapResponse(data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // POST /api/v1/users/:userId/misconceptions/detect — Detect misconceptions
  // ============================================================================

  fastify.post<{ Params: { userId: string }; Body: unknown }>(
    '/api/v1/users/:userId/misconceptions/detect',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['Misconceptions'],
        summary: "Detect misconceptions in a user's PKG",
        description:
          "Run all active misconception detection patterns against the user's PKG " +
          'in the specified domain. Returns newly detected misconceptions.',
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
            studyMode: { type: 'string', enum: ['language_learning', 'knowledge_gaining'] },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId } = UserIdParamSchema.parse(request.params);
        assertUserAccess(request, userId);

        const parsed = DetectMisconceptionsRequestSchema.parse(request.body);
        const context = buildContext(request);

        const result = await service.detectMisconceptions(
          userId as UserId,
          parsed.domain,
          parsed.studyMode as StudyMode,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // PATCH /api/v1/users/:userId/misconceptions/:detectionId/status — Update status
  // ============================================================================

  fastify.patch<{ Params: { userId: string; detectionId: string }; Body: unknown }>(
    '/api/v1/users/:userId/misconceptions/:detectionId/status',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['Misconceptions'],
        summary: "Update a misconception's lifecycle status",
        description:
          'Transition a misconception detection to a new status. ' +
          'Valid transitions: detected→confirmed→addressed→resolved, detected→recurring.',
        params: {
          type: 'object',
          required: ['userId', 'detectionId'],
          properties: {
            userId: { type: 'string' },
            detectionId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: {
              type: 'string',
              enum: ['detected', 'confirmed', 'addressed', 'resolved', 'recurring'],
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId, detectionId } = UserDetectionParamSchema.parse(request.params);
        assertUserAccess(request, userId);

        const parsed = UpdateMisconceptionStatusRequestSchema.parse(request.body);
        const context = buildContext(request);

        await service.updateMisconceptionStatus(detectionId, parsed.status, context);
        reply.status(204).send();
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );
}
