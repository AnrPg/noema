import type { UserId } from '@noema/types';
import type { FastifyInstance } from 'fastify';

import type { IKnowledgeGraphService } from '../../domain/knowledge-graph-service/knowledge-graph.service.js';
import type { createAuthMiddleware } from '../middleware/auth.middleware.js';
import {
  GraphSnapshotCreateRequestSchema,
  GraphSnapshotQueryParamsSchema,
} from '../schemas/graph-snapshot.schemas.js';
import {
  type IRouteOptions,
  SnapshotIdParamSchema,
  assertAdminOrAgent,
  attachStartTimeHook,
  buildContext,
  handleError,
  wrapResponse,
} from '../shared/route-helpers.js';

export function registerGraphSnapshotRoutes(
  fastify: FastifyInstance,
  service: IKnowledgeGraphService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>,
  options?: IRouteOptions
): void {
  attachStartTimeHook(fastify);

  const writeRouteConfig = options?.rateLimit
    ? { rateLimit: { max: options.rateLimit.writeMax, timeWindow: options.rateLimit.timeWindow } }
    : {};

  fastify.post<{ Body: unknown }>(
    '/api/v1/graph-snapshots',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['Graph Snapshots'],
        summary: 'Create a graph snapshot',
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const parsed = GraphSnapshotCreateRequestSchema.parse(request.body);
        const context = buildContext(request);
        const result = await service.createGraphSnapshot(
          parsed.graphType === 'pkg'
            ? {
                graphType: 'pkg',
                userId: parsed.userId as UserId,
                ...(parsed.domain !== undefined ? { domain: parsed.domain } : {}),
                ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
              }
            : {
                graphType: 'ckg',
                ...(parsed.domain !== undefined ? { domain: parsed.domain } : {}),
                ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
              },
          context
        );
        reply.status(201).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/v1/graph-snapshots',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Graph Snapshots'],
        summary: 'List graph snapshots',
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const parsed = GraphSnapshotQueryParamsSchema.parse(request.query);
        const context = buildContext(request);
        const page = parsed.page;
        const pageSize = parsed.pageSize;
        const pagination = {
          limit: pageSize,
          offset: (page - 1) * pageSize,
        };
        const result = await service.listGraphSnapshots(
          {
            ...(parsed.graphType !== undefined ? { graphType: parsed.graphType } : {}),
            ...(parsed.userId !== undefined ? { userId: parsed.userId as UserId } : {}),
            ...(parsed.domain !== undefined ? { domain: parsed.domain } : {}),
          },
          pagination,
          context
        );
        const total = result.data.total ?? result.data.items.length;

        reply.send(
          wrapResponse(result.data.items, result.agentHints, request, {
            page,
            pageSize,
            total,
          })
        );
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  fastify.post<{ Params: { snapshotId: string } }>(
    '/api/v1/graph-snapshots/:snapshotId/preview-restore',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['Graph Snapshots'],
        summary: 'Preview a graph restore',
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const { snapshotId } = SnapshotIdParamSchema.parse(request.params);
        const result = await service.previewGraphRestore(snapshotId, buildContext(request));
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  fastify.post<{ Params: { snapshotId: string } }>(
    '/api/v1/graph-snapshots/:snapshotId/restore',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['Graph Snapshots'],
        summary: 'Restore a graph snapshot',
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const { snapshotId } = SnapshotIdParamSchema.parse(request.params);
        const result = await service.executeGraphRestore(snapshotId, buildContext(request));
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );
}
