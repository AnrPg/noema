/**
 * @noema/knowledge-graph-service - CKG Node Routes
 *
 * Fastify route definitions for Canonical Knowledge Graph node operations.
 * CKG is shared; no userId scoping in URLs. Auth required for read access.
 *
 * Prefix: /api/v1/ckg/nodes
 */

import type { GraphNodeType, NodeId } from '@noema/types';
import type { FastifyInstance } from 'fastify';
import type { IKnowledgeGraphService } from '../../domain/knowledge-graph-service/knowledge-graph.service.js';
import { NodeFilter } from '../../domain/knowledge-graph-service/value-objects/graph.value-objects.js';
import type { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { CkgNodeQueryParamsSchema } from '../schemas/ckg-node.schemas.js';
import {
  type IRouteOptions,
  attachStartTimeHook,
  buildContext,
  handleError,
  wrapResponse,
} from '../shared/route-helpers.js';

// ============================================================================
// Route Plugin
// ============================================================================

/**
 * Register CKG node routes.
 * Prefix: /api/v1/ckg/nodes
 */
export function registerCkgNodeRoutes(
  fastify: FastifyInstance,
  service: IKnowledgeGraphService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>,
  _options?: IRouteOptions
): void {
  attachStartTimeHook(fastify);

  // ============================================================================
  // GET /api/v1/ckg/nodes — List CKG nodes
  // ============================================================================

  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/v1/ckg/nodes',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['CKG Nodes'],
        summary: 'List CKG nodes',
        description: 'List nodes in the Canonical Knowledge Graph with filtering and pagination.',
        querystring: {
          type: 'object',
          properties: {
            nodeType: { type: 'string' },
            domain: { type: 'string' },
            search: { type: 'string' },
            page: { type: 'number' },
            pageSize: { type: 'number' },
            sortBy: { type: 'string', enum: ['label', 'createdAt', 'updatedAt'] },
            sortOrder: { type: 'string', enum: ['asc', 'desc'] },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const query = CkgNodeQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const filter = NodeFilter.create({
          ...(query.nodeType !== undefined ? { nodeType: query.nodeType as GraphNodeType } : {}),
          ...(query.domain !== undefined ? { domain: query.domain } : {}),
          ...(query.search !== undefined ? { labelContains: query.search } : {}),
          graphType: 'ckg',
        });

        const pagination = {
          limit: query.pageSize,
          offset: (query.page - 1) * query.pageSize,
        };

        const result = await service.listCkgNodes(filter, pagination, context);

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
  // GET /api/v1/ckg/nodes/:nodeId — Get a CKG node
  // ============================================================================

  fastify.get<{ Params: { nodeId: string } }>(
    '/api/v1/ckg/nodes/:nodeId',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['CKG Nodes'],
        summary: 'Get a CKG node by ID',
        params: {
          type: 'object',
          required: ['nodeId'],
          properties: {
            nodeId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { nodeId } = request.params;
        const context = buildContext(request);

        const result = await service.getCkgNode(nodeId as NodeId, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );
}
