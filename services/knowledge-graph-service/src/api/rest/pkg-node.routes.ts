/**
 * @noema/knowledge-graph-service - PKG Node Routes
 *
 * Fastify route definitions for Personal Knowledge Graph node operations.
 * Prefix: /api/v1/users/:userId/pkg/nodes
 *
 * All routes require authentication and verify that the authenticated
 * user matches the :userId parameter (or has agent/admin role).
 */

import type { GraphNodeType, NodeId, UserId } from '@noema/types';
import { MasteryLevel } from '@noema/types';
import type { FastifyInstance } from 'fastify';
import type { IKnowledgeGraphService } from '../../domain/knowledge-graph-service/knowledge-graph.service.js';
import { NodeFilter } from '../../domain/knowledge-graph-service/value-objects/graph.value-objects.js';
import type { createAuthMiddleware } from '../middleware/auth.middleware.js';
import {
  CreateNodeRequestSchema,
  NodeQueryParamsSchema,
  UpdateNodeRequestSchema,
} from '../schemas/pkg-node.schemas.js';
import {
  type IRouteOptions,
  UserIdParamSchema,
  UserNodeParamSchema,
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
 * Register PKG node routes.
 * Prefix: /api/v1/users/:userId/pkg/nodes
 */
export function registerPkgNodeRoutes(
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
  // POST /api/v1/users/:userId/pkg/nodes — Create a node
  // ============================================================================

  fastify.post<{ Params: { userId: string }; Body: unknown }>(
    '/api/v1/users/:userId/pkg/nodes',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['PKG Nodes'],
        summary: 'Create a new PKG node',
        description: "Create a node in the user's Personal Knowledge Graph.",
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['label', 'nodeType', 'domain'],
          properties: {
            label: { type: 'string', minLength: 1, maxLength: 200 },
            nodeType: { type: 'string' },
            domain: { type: 'string', minLength: 1, maxLength: 200 },
            description: { type: 'string', maxLength: 2000 },
            properties: { type: 'object' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId } = UserIdParamSchema.parse(request.params);
        assertUserAccess(request, userId);

        const parsed = CreateNodeRequestSchema.parse(request.body);
        const context = buildContext(request);

        const input = {
          label: parsed.label,
          nodeType: parsed.nodeType,
          domain: parsed.domain,
          ...(parsed.description !== undefined ? { description: parsed.description } : {}),
          ...(parsed.properties !== undefined ? { properties: parsed.properties } : {}),
        };

        const result = await service.createNode(userId as UserId, input, context);
        reply.status(201).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // GET /api/v1/users/:userId/pkg/nodes — List nodes
  // ============================================================================

  fastify.get<{ Params: { userId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/users/:userId/pkg/nodes',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['PKG Nodes'],
        summary: 'List PKG nodes',
        description: "List nodes in the user's PKG with filtering and pagination.",
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: {
            nodeType: { type: 'string' },
            domain: { type: 'string' },
            search: { type: 'string' },
            page: { type: 'number' },
            pageSize: { type: 'number', minimum: 1, maximum: 200 },
            sortBy: { type: 'string', enum: ['label', 'createdAt', 'updatedAt', 'masteryLevel'] },
            sortOrder: { type: 'string', enum: ['asc', 'desc'] },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId } = UserIdParamSchema.parse(request.params);
        assertUserAccess(request, userId);

        const query = NodeQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const filter = NodeFilter.create({
          ...(query.nodeType !== undefined ? { nodeType: query.nodeType as GraphNodeType } : {}),
          ...(query.domain !== undefined ? { domain: query.domain } : {}),
          ...(query.search !== undefined ? { labelContains: query.search } : {}),
          userId,
          graphType: 'pkg',
        });

        const pagination = {
          limit: query.pageSize,
          offset: (query.page - 1) * query.pageSize,
        };

        const result = await service.listNodes(userId as UserId, filter, pagination, context);

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
  // GET /api/v1/users/:userId/pkg/nodes/:nodeId — Get a node
  // ============================================================================

  fastify.get<{ Params: { userId: string; nodeId: string } }>(
    '/api/v1/users/:userId/pkg/nodes/:nodeId',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['PKG Nodes'],
        summary: 'Get a PKG node by ID',
        params: {
          type: 'object',
          required: ['userId', 'nodeId'],
          properties: {
            userId: { type: 'string' },
            nodeId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId, nodeId } = UserNodeParamSchema.parse(request.params);
        assertUserAccess(request, userId);

        const context = buildContext(request);
        const result = await service.getNode(userId as UserId, nodeId as NodeId, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // PATCH /api/v1/users/:userId/pkg/nodes/:nodeId — Update a node
  // ============================================================================

  fastify.patch<{ Params: { userId: string; nodeId: string }; Body: unknown }>(
    '/api/v1/users/:userId/pkg/nodes/:nodeId',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['PKG Nodes'],
        summary: 'Update a PKG node',
        description: "Partial update of a node in the user's PKG.",
        params: {
          type: 'object',
          required: ['userId', 'nodeId'],
          properties: {
            userId: { type: 'string' },
            nodeId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            label: { type: 'string', minLength: 1, maxLength: 200 },
            description: { type: 'string', maxLength: 2000 },
            properties: { type: 'object' },
            masteryLevel: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId, nodeId } = UserNodeParamSchema.parse(request.params);
        assertUserAccess(request, userId);

        const parsed = UpdateNodeRequestSchema.parse(request.body);
        const context = buildContext(request);

        const updates = {
          ...(parsed.label !== undefined ? { label: parsed.label } : {}),
          ...(parsed.description !== undefined ? { description: parsed.description } : {}),
          ...(parsed.properties !== undefined ? { properties: parsed.properties } : {}),
          ...(parsed.masteryLevel !== undefined
            ? { masteryLevel: MasteryLevel.create(parsed.masteryLevel) }
            : {}),
        };

        const result = await service.updateNode(
          userId as UserId,
          nodeId as NodeId,
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
  // DELETE /api/v1/users/:userId/pkg/nodes/:nodeId — Soft-delete a node
  // ============================================================================

  fastify.delete<{ Params: { userId: string; nodeId: string } }>(
    '/api/v1/users/:userId/pkg/nodes/:nodeId',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['PKG Nodes'],
        summary: 'Delete a PKG node',
        description: "Soft-delete a node from the user's PKG.",
        params: {
          type: 'object',
          required: ['userId', 'nodeId'],
          properties: {
            userId: { type: 'string' },
            nodeId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId, nodeId } = UserNodeParamSchema.parse(request.params);
        assertUserAccess(request, userId);

        const context = buildContext(request);
        await service.deleteNode(userId as UserId, nodeId as NodeId, context);
        reply.status(204).send();
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );
}
