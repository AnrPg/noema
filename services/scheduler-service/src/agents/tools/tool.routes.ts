import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { createAuthMiddleware } from '../../api/middleware/auth.middleware.js';
import type { ToolRegistry } from './tool.registry.js';

export function registerToolRoutes(
  fastify: FastifyInstance,
  toolRegistry: ToolRegistry,
  authMiddleware: ReturnType<typeof createAuthMiddleware>
): void {
  fastify.addHook('onRequest', (request) => {
    (request as FastifyRequest & { startTime: number }).startTime = Date.now();
  });

  function buildMetadata(request: FastifyRequest): Record<string, unknown> {
    const startTime = (request as FastifyRequest & { startTime?: number }).startTime ?? Date.now();
    return {
      requestId: request.id,
      timestamp: new Date().toISOString(),
      serviceName: 'scheduler-service',
      serviceVersion: '0.1.0',
      executionTime: Date.now() - startTime,
    };
  }

  const authPreHandler = {
    preHandler: (
      request: FastifyRequest,
      reply: FastifyReply,
      done: (error?: Error) => void
    ): void => {
      authMiddleware(request, reply)
        .then(() => {
          done();
        })
        .catch((error: unknown) => {
          done(error instanceof Error ? error : new Error('Authentication middleware failed'));
        });
    },
  };

  fastify.get(
    '/v1/tools',
    authPreHandler,
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const definitions = toolRegistry.listDefinitions();

      await reply.status(200).send({
        data: {
          tools: definitions,
          count: definitions.length,
        },
        metadata: buildMetadata(request),
      });
    }
  );

  fastify.post(
    '/v1/tools/execute',
    authPreHandler,
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const body = request.body as { tool?: string; input?: unknown } | undefined;

      if (body?.tool === undefined || body.tool === '') {
        await reply.status(400).send({
          error: { code: 'MISSING_TOOL_NAME', message: 'Request body must include "tool" field' },
          metadata: buildMetadata(request),
        });
        return;
      }

      const user = request.user as { sub?: string } | undefined;
      const userId = user?.sub ?? '';
      const correlationId = request.id;
      const result = await toolRegistry.execute(body.tool, body.input ?? {}, userId, correlationId);

      const statusCode = result.success ? 200 : result.error?.code === 'TOOL_NOT_FOUND' ? 404 : 422;

      await reply.status(statusCode).send({
        data: result,
        metadata: buildMetadata(request),
      });
    }
  );
}
