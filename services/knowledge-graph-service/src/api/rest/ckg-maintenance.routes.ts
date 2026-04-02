import type { FastifyInstance } from 'fastify';
import type { ICkgMaintenanceApplicationService } from '../../application/knowledge-graph/maintenance/contracts.js';
import type { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { CkgResetRequestSchema } from '../schemas/ckg-maintenance.schemas.js';
import {
  assertAdminOrAgent,
  attachStartTimeHook,
  handleError,
  wrapResponse,
  type IRouteOptions,
} from '../shared/route-helpers.js';

export function registerCkgMaintenanceRoutes(
  fastify: FastifyInstance,
  maintenanceService: ICkgMaintenanceApplicationService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>,
  _options?: IRouteOptions
): void {
  attachStartTimeHook(fastify);

  fastify.post<{ Body: Record<string, unknown> }>(
    '/api/v1/ckg/maintenance/reset',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['CKG Maintenance'],
        summary: 'Delete all canonical graph contents',
        description:
          'Admin-only destructive operation that wipes canonical graph workflow state, canonical Neo4j nodes, related Redis cache entries, and ontology import artifacts.',
        body: {
          type: 'object',
          required: ['confirmation'],
          properties: {
            confirmation: { type: 'string', enum: ['DELETE_ALL_CKG_CONTENTS'] },
            includeSources: { type: 'boolean', default: false },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const parsed = CkgResetRequestSchema.parse(request.body);
        const result = await maintenanceService.resetCkg({
          includeSources: parsed.includeSources,
        });

        reply.send(
          wrapResponse(
            result,
            [
              {
                type: 'system',
                message: 'Canonical knowledge graph reset completed.',
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
