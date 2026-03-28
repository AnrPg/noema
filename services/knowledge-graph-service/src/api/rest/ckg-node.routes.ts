/**
 * @noema/knowledge-graph-service - CKG Node Routes
 *
 * Fastify route definitions for Canonical Knowledge Graph node operations.
 * CKG is shared; no userId scoping in URLs. Auth required for read access.
 *
 * Prefix: /api/v1/ckg/nodes
 */

import type { GraphNodeType, NodeId, StudyMode } from '@noema/types';
import type { FastifyInstance } from 'fastify';
import type { ICkgNodeBatchAuthoringService } from '../../application/knowledge-graph/node-authoring/index.js';
import type { IKnowledgeGraphService } from '../../domain/knowledge-graph-service/knowledge-graph.service.js';
import { NodeFilter } from '../../domain/knowledge-graph-service/value-objects/graph.value-objects.js';
import type { createAuthMiddleware } from '../middleware/auth.middleware.js';
import {
  CkgNodeBatchAuthoringPreviewRequestSchema,
  CkgNodeQueryParamsSchema,
} from '../schemas/ckg-node.schemas.js';
import {
  type IRouteOptions,
  NodeIdParamSchema,
  assertAdminOrAgent,
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
  nodeAuthoringService: ICkgNodeBatchAuthoringService,
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
            studyMode: { type: 'string', enum: ['language_learning', 'knowledge_gaining'] },
            page: { type: 'number' },
            pageSize: { type: 'number', minimum: 1, maximum: 200 },
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
          ...(query.studyMode !== undefined ? { studyMode: query.studyMode as StudyMode } : {}),
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
        const { nodeId } = NodeIdParamSchema.parse(request.params);
        const context = buildContext(request);

        const result = await service.getCkgNode(nodeId as NodeId, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  fastify.post<{ Body: unknown }>(
    '/api/v1/ckg/nodes/batch-authoring-preview',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['CKG Nodes'],
        summary: 'Preview batch CKG node changes',
        description:
          'Preview node deletion or batch metadata updates, including re-typing validation against attached edges.',
        body: {
          type: 'object',
          required: ['nodeIds', 'action'],
          properties: {
            nodeIds: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 100 },
            action: { type: 'string', enum: ['delete', 'update'] },
            updates: {
              type: 'object',
              properties: {
                nodeType: { type: 'string' },
                domain: { type: 'string' },
                tags: { type: 'array', items: { type: 'string' } },
              },
            },
            rationale: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const parsed = CkgNodeBatchAuthoringPreviewRequestSchema.parse(request.body);
        const preview = await nodeAuthoringService.preview({
          nodeIds: parsed.nodeIds as NodeId[],
          action: parsed.action,
          ...(parsed.updates !== undefined
            ? {
                updates: {
                  ...(parsed.updates.nodeType !== undefined
                    ? { nodeType: parsed.updates.nodeType as GraphNodeType }
                    : {}),
                  ...(parsed.updates.domain !== undefined ? { domain: parsed.updates.domain } : {}),
                  ...(parsed.updates.tags !== undefined ? { tags: parsed.updates.tags } : {}),
                },
              }
            : {}),
          ...(parsed.rationale !== undefined ? { rationale: parsed.rationale } : {}),
        });
        reply.send(wrapResponse(preview, undefined, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );
}
