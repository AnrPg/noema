/**
 * @noema/knowledge-graph-service - PKG Edge Routes
 *
 * Fastify route definitions for Personal Knowledge Graph edge operations.
 * Prefix: /api/v1/users/:userId/pkg/edges
 */

import type { EdgeId, GraphEdgeType, NodeId, StudyMode, UserId } from '@noema/types';
import { EdgeWeight } from '@noema/types';
import type { FastifyInstance } from 'fastify';
import type { IEdgeFilter } from '../../domain/knowledge-graph-service/graph.repository.js';
import type { IKnowledgeGraphService } from '../../domain/knowledge-graph-service/knowledge-graph.service.js';
import type { IValidationOptions } from '../../domain/knowledge-graph-service/value-objects/graph.value-objects.js';
import { ValidationOptions } from '../../domain/knowledge-graph-service/value-objects/graph.value-objects.js';
import type { createAuthMiddleware } from '../middleware/auth.middleware.js';
import {
  CreateEdgeRequestSchema,
  EdgeQueryParamsSchema,
  UpdateEdgeRequestSchema,
} from '../schemas/pkg-edge.schemas.js';
import {
  type IRouteOptions,
  UserEdgeParamSchema,
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
 * Register PKG edge routes.
 * Prefix: /api/v1/users/:userId/pkg/edges
 */
export function registerPkgEdgeRoutes(
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
  // POST /api/v1/users/:userId/pkg/edges — Create an edge
  // ============================================================================

  fastify.post<{ Params: { userId: string }; Body: unknown }>(
    '/api/v1/users/:userId/pkg/edges',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['PKG Edges'],
        summary: 'Create a new PKG edge',
        description:
          "Create an edge between two nodes in the user's PKG. " +
          'Validates edge type policies and checks for cycles unless skipAcyclicityCheck is true.',
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['edgeType', 'sourceNodeId', 'targetNodeId'],
          properties: {
            edgeType: { type: 'string' },
            sourceNodeId: { type: 'string' },
            targetNodeId: { type: 'string' },
            weight: { type: 'number', minimum: 0, maximum: 1 },
            properties: { type: 'object' },
            skipAcyclicityCheck: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId } = UserIdParamSchema.parse(request.params);
        assertUserAccess(request, userId);

        const parsed = CreateEdgeRequestSchema.parse(request.body);
        const context = buildContext(request);

        // Map skipAcyclicityCheck to validation options
        const validationOptions: IValidationOptions | undefined = parsed.skipAcyclicityCheck
          ? (ValidationOptions.create({ validateAcyclicity: false }) as IValidationOptions)
          : undefined;

        const edgeInput = {
          edgeType: parsed.edgeType as GraphEdgeType,
          sourceNodeId: parsed.sourceNodeId as NodeId,
          targetNodeId: parsed.targetNodeId as NodeId,
          ...(parsed.weight !== undefined ? { weight: EdgeWeight.create(parsed.weight) } : {}),
          ...(parsed.properties !== undefined ? { properties: parsed.properties } : {}),
        };

        const result = await service.createEdge(
          userId as UserId,
          edgeInput,
          context,
          validationOptions
        );
        reply.status(201).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // GET /api/v1/users/:userId/pkg/edges — List edges
  // ============================================================================

  fastify.get<{ Params: { userId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/users/:userId/pkg/edges',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['PKG Edges'],
        summary: 'List PKG edges',
        description: "List edges in the user's PKG with optional filtering and pagination.",
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: {
            edgeType: { type: 'string' },
            nodeId: { type: 'string' },
            studyMode: { type: 'string', enum: ['language_learning', 'knowledge_gaining'] },
            direction: { type: 'string', enum: ['inbound', 'outbound', 'both'] },
            page: { type: 'number' },
            pageSize: { type: 'number', minimum: 1, maximum: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId } = UserIdParamSchema.parse(request.params);
        assertUserAccess(request, userId);

        const query = EdgeQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const filter: IEdgeFilter = {
          ...(query.edgeType !== undefined ? { edgeType: query.edgeType as GraphEdgeType } : {}),
          userId,
          ...(query.studyMode !== undefined ? { studyMode: query.studyMode as StudyMode } : {}),
          ...(query.nodeId !== undefined && query.nodeId !== '' && query.direction === 'outbound'
            ? { sourceNodeId: query.nodeId as NodeId }
            : {}),
          ...(query.nodeId !== undefined && query.nodeId !== '' && query.direction === 'inbound'
            ? { targetNodeId: query.nodeId as NodeId }
            : {}),
          ...(query.nodeId !== undefined &&
          query.nodeId !== '' &&
          (query.direction === 'both' || query.direction === undefined)
            ? { nodeId: query.nodeId as NodeId }
            : {}),
        };

        const pagination = {
          limit: query.pageSize,
          offset: (query.page - 1) * query.pageSize,
        };

        const result = await service.listEdges(userId as UserId, filter, pagination, context);

        const response = wrapResponse(result.data, result.agentHints, request);
        response.pagination = {
          offset: pagination.offset,
          limit: pagination.limit,
          total: result.data.total ?? 0,
          hasMore: result.data.hasMore,
        };
        reply.send(response);
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // GET /api/v1/users/:userId/pkg/edges/:edgeId — Get an edge
  // ============================================================================

  fastify.get<{ Params: { userId: string; edgeId: string } }>(
    '/api/v1/users/:userId/pkg/edges/:edgeId',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['PKG Edges'],
        summary: 'Get a PKG edge by ID',
        params: {
          type: 'object',
          required: ['userId', 'edgeId'],
          properties: {
            userId: { type: 'string' },
            edgeId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId, edgeId } = UserEdgeParamSchema.parse(request.params);
        assertUserAccess(request, userId);

        const context = buildContext(request);
        const result = await service.getEdge(userId as UserId, edgeId as EdgeId, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // PATCH /api/v1/users/:userId/pkg/edges/:edgeId — Update an edge
  // ============================================================================

  fastify.patch<{ Params: { userId: string; edgeId: string }; Body: unknown }>(
    '/api/v1/users/:userId/pkg/edges/:edgeId',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['PKG Edges'],
        summary: 'Update a PKG edge',
        description: "Partial update of an edge in the user's PKG (weight and/or properties).",
        params: {
          type: 'object',
          required: ['userId', 'edgeId'],
          properties: {
            userId: { type: 'string' },
            edgeId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            weight: { type: 'number', minimum: 0, maximum: 1 },
            properties: { type: 'object' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId, edgeId } = UserEdgeParamSchema.parse(request.params);
        assertUserAccess(request, userId);

        const parsed = UpdateEdgeRequestSchema.parse(request.body);
        const context = buildContext(request);

        const updates = {
          ...(parsed.weight !== undefined ? { weight: EdgeWeight.create(parsed.weight) } : {}),
          ...(parsed.properties !== undefined ? { properties: parsed.properties } : {}),
        };

        const result = await service.updateEdge(
          userId as UserId,
          edgeId as EdgeId,
          updates,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // DELETE /api/v1/users/:userId/pkg/edges/:edgeId — Delete an edge
  // ============================================================================

  fastify.delete<{ Params: { userId: string; edgeId: string } }>(
    '/api/v1/users/:userId/pkg/edges/:edgeId',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['PKG Edges'],
        summary: 'Delete a PKG edge',
        params: {
          type: 'object',
          required: ['userId', 'edgeId'],
          properties: {
            userId: { type: 'string' },
            edgeId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId, edgeId } = UserEdgeParamSchema.parse(request.params);
        assertUserAccess(request, userId);

        const context = buildContext(request);
        await service.deleteEdge(userId as UserId, edgeId as EdgeId, context);
        reply.status(204).send();
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );
}
