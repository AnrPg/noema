import type { NodeId } from '@noema/types';
import type { FastifyInstance } from 'fastify';

import type { IKnowledgeGraphService } from '../../domain/knowledge-graph-service/knowledge-graph.service.js';
import type { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { GraphCrdtStatsQueryParamsSchema } from '../schemas/graph-crdt.schemas.js';
import {
  assertAdminOrAgent,
  attachStartTimeHook,
  buildContext,
  handleError,
  wrapResponse,
} from '../shared/route-helpers.js';

export function registerGraphCrdtRoutes(
  fastify: FastifyInstance,
  service: IKnowledgeGraphService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>
): void {
  attachStartTimeHook(fastify);

  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/v1/graph-crdt-stats',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Graph CRDT Stats'],
        summary: 'List Layer 3 graph CRDT statistics',
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const parsed = GraphCrdtStatsQueryParamsSchema.parse(request.query);
        const page = parsed.page;
        const pageSize = parsed.pageSize;
        const result = await service.listGraphCrdtStats(
          {
            ...(parsed.targetKind !== undefined ? { targetKind: parsed.targetKind } : {}),
            ...(parsed.targetNodeId !== undefined
              ? { targetNodeId: parsed.targetNodeId as NodeId }
              : {}),
            ...(parsed.proposedLabel !== undefined ? { proposedLabel: parsed.proposedLabel } : {}),
            ...(parsed.evidenceType !== undefined ? { evidenceType: parsed.evidenceType } : {}),
          },
          {
            limit: pageSize,
            offset: (page - 1) * pageSize,
          },
          buildContext(request)
        );

        reply.send(
          wrapResponse(result.data.items, result.agentHints, request, {
            page,
            pageSize,
            total: result.data.total ?? result.data.items.length,
          })
        );
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );
}
