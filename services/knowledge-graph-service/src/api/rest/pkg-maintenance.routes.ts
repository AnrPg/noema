import type { FastifyInstance } from 'fastify';
import type { IPkgMaintenanceApplicationService } from '../../application/knowledge-graph/pkg-maintenance/contracts.js';
import type { createAuthMiddleware } from '../middleware/auth.middleware.js';
import {
  PkgBulkDeleteRequestSchema,
  PkgResetRequestSchema,
} from '../schemas/pkg-maintenance.schemas.js';
import {
  type IRouteOptions,
  UserIdParamSchema,
  assertUserAccess,
  attachStartTimeHook,
  buildContext,
  handleError,
  wrapResponse,
} from '../shared/route-helpers.js';

export function registerPkgMaintenanceRoutes(
  fastify: FastifyInstance,
  maintenanceService: IPkgMaintenanceApplicationService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>,
  options?: IRouteOptions
): void {
  attachStartTimeHook(fastify);

  const writeRouteConfig = options?.rateLimit
    ? { rateLimit: { max: options.rateLimit.batchMax, timeWindow: options.rateLimit.timeWindow } }
    : {};

  fastify.post<{ Params: { userId: string }; Body: Record<string, unknown> }>(
    '/api/v1/users/:userId/pkg/maintenance/bulk-delete',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['PKG Maintenance'],
        summary: 'Batch-delete PKG nodes',
      },
    },
    async (request, reply) => {
      try {
        const { userId } = UserIdParamSchema.parse(request.params);
        assertUserAccess(request, userId);

        const parsed = PkgBulkDeleteRequestSchema.parse(request.body);
        const context = buildContext(request);
        const result = await maintenanceService.bulkDeleteNodes({
          userId,
          nodeIds: parsed.nodeIds,
          actorId: context.userId ?? userId,
          correlationId: context.correlationId,
        });

        reply.send(
          wrapResponse(
            result,
            [
              {
                type: 'system',
                message: `Deleted ${String(result.deletedNodeIds.length)} PKG node(s).`,
              },
            ],
            request
          )
        );
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  fastify.post<{ Params: { userId: string }; Body: Record<string, unknown> }>(
    '/api/v1/users/:userId/pkg/maintenance/reset',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['PKG Maintenance'],
        summary: 'Delete all PKG contents',
      },
    },
    async (request, reply) => {
      try {
        const { userId } = UserIdParamSchema.parse(request.params);
        assertUserAccess(request, userId);

        PkgResetRequestSchema.parse(request.body);
        const result = await maintenanceService.resetPkg({ userId });

        reply.send(
          wrapResponse(
            result,
            [
              {
                type: 'system',
                message: 'Personal knowledge graph reset completed.',
              },
            ],
            request
          )
        );
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );
}
