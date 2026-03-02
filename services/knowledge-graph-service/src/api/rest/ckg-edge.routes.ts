/**
 * @noema/knowledge-graph-service - CKG Edge Routes
 *
 * Fastify route definitions for Canonical Knowledge Graph edge operations.
 * CKG is shared; no userId scoping in URLs. Auth required for read access.
 *
 * Prefix: /api/v1/ckg/edges
 */

import type { EdgeId, GraphEdgeType, NodeId } from '@noema/types';
import type { FastifyInstance } from 'fastify';
import type { IEdgeFilter } from '../../domain/knowledge-graph-service/graph.repository.js';
import type { IKnowledgeGraphService } from '../../domain/knowledge-graph-service/knowledge-graph.service.js';
import type { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { CkgEdgeQueryParamsSchema } from '../schemas/ckg-edge.schemas.js';
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
 * Register CKG edge routes.
 * Prefix: /api/v1/ckg/edges
 */
export function registerCkgEdgeRoutes(
  fastify: FastifyInstance,
  service: IKnowledgeGraphService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>,
  _options?: IRouteOptions
): void {
  attachStartTimeHook(fastify);

  // ============================================================================
  // GET /api/v1/ckg/edges — List CKG edges
  // ============================================================================

  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/v1/ckg/edges',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['CKG Edges'],
        summary: 'List CKG edges',
        description: 'List edges in the Canonical Knowledge Graph with filtering and pagination.',
        querystring: {
          type: 'object',
          properties: {
            edgeType: { type: 'string' },
            nodeId: { type: 'string', description: 'Filter to edges connected to this node' },
            direction: { type: 'string', enum: ['inbound', 'outbound', 'both'] },
            page: { type: 'number' },
            pageSize: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const query = CkgEdgeQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        // Map query params to edge filter — direction determines which field gets the nodeId
        const filter: IEdgeFilter = {
          ...(query.edgeType !== undefined ? { edgeType: query.edgeType as GraphEdgeType } : {}),
          ...(query.nodeId !== undefined && query.direction === 'outbound'
            ? { sourceNodeId: query.nodeId as NodeId }
            : {}),
          ...(query.nodeId !== undefined && query.direction === 'inbound'
            ? { targetNodeId: query.nodeId as NodeId }
            : {}),
          ...(query.nodeId !== undefined && query.direction === 'both'
            ? { nodeId: query.nodeId as NodeId }
            : {}),
        };

        const pagination = {
          limit: query.pageSize,
          offset: (query.page - 1) * query.pageSize,
        };

        const result = await service.listCkgEdges(filter, pagination, context);

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
  // GET /api/v1/ckg/edges/:edgeId — Get a CKG edge
  // ============================================================================

  fastify.get<{ Params: { edgeId: string } }>(
    '/api/v1/ckg/edges/:edgeId',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['CKG Edges'],
        summary: 'Get a CKG edge by ID',
        params: {
          type: 'object',
          required: ['edgeId'],
          properties: {
            edgeId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { edgeId } = request.params;
        const context = buildContext(request);

        const result = await service.getCkgEdge(edgeId as EdgeId, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );
}
