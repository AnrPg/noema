/**
 * @noema/knowledge-graph-service - PKG Operation Log Routes
 *
 * Fastify route definitions for PKG operation log queries.
 * The operation log provides an append-only audit trail of all
 * PKG mutations (node/edge CRUD), supporting undo/redo, aggregation
 * pipeline input, and offline sync reconciliation.
 *
 * Prefix: /api/v1/users/:userId/pkg/operations
 */

import type { EdgeId, NodeId, UserId } from '@noema/types';
import type { FastifyInstance } from 'fastify';
import type {
  IKnowledgeGraphService,
  IOperationLogFilter,
} from '../../domain/knowledge-graph-service/knowledge-graph.service.js';
import type { PkgOperationType } from '../../domain/knowledge-graph-service/value-objects/operation-log.js';
import type { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { OperationLogQueryParamsSchema } from '../schemas/pkg-operation-log.schemas.js';
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
 * Register PKG operation log routes.
 * Prefix: /api/v1/users/:userId/pkg/operations
 */
export function registerPkgOperationLogRoutes(
  fastify: FastifyInstance,
  service: IKnowledgeGraphService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>,
  _options?: IRouteOptions
): void {
  attachStartTimeHook(fastify);

  // ============================================================================
  // GET /api/v1/users/:userId/pkg/operations — List PKG operations
  // ============================================================================

  fastify.get<{ Params: { userId: string }; Querystring: Record<string, unknown> }>(
    '/api/v1/users/:userId/pkg/operations',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['PKG Operations'],
        summary: 'Get the PKG operation log',
        description:
          "Retrieve the operation history for a user's PKG with filtering " +
          'by operation type, node ID, edge ID, and time range. Supports pagination.',
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: {
            operationType: {
              type: 'string',
              enum: [
                'PkgNodeCreated',
                'PkgNodeUpdated',
                'PkgNodeDeleted',
                'PkgEdgeCreated',
                'PkgEdgeUpdated',
                'PkgEdgeDeleted',
                'PkgBatchImport',
              ],
            },
            nodeId: { type: 'string' },
            edgeId: { type: 'string' },
            since: { type: 'string', format: 'date-time' },
            page: { type: 'number' },
            pageSize: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId } = UserIdParamSchema.parse(request.params);
        assertUserAccess(request, userId);

        const query = OperationLogQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const filter: IOperationLogFilter = {
          ...(query.operationType !== undefined
            ? { operationType: query.operationType as PkgOperationType }
            : {}),
          ...(query.nodeId !== undefined ? { nodeId: query.nodeId as NodeId } : {}),
          ...(query.edgeId !== undefined ? { edgeId: query.edgeId as EdgeId } : {}),
          ...(query.since !== undefined ? { since: query.since } : {}),
        };

        const pagination = {
          limit: query.pageSize,
          offset: (query.page - 1) * query.pageSize,
        };

        const result = await service.getOperationLog(userId as UserId, filter, pagination, context);

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
}
