import type { FastifyReply, FastifyRequest, FastifyInstance } from 'fastify';
import type { createAuthMiddleware } from '../../middleware/auth.middleware.js';
import type { ToolRegistry } from './tool.registry.js';

export function registerToolRoutes(
  fastify: FastifyInstance,
  toolRegistry: ToolRegistry,
  authMiddleware: ReturnType<typeof createAuthMiddleware>
): void {
  fastify.get('/v1/tools', { preHandler: authMiddleware }, async (_request, reply) => {
    await reply.send({
      data: { tools: toolRegistry.listDefinitions(), count: toolRegistry.listDefinitions().length },
    });
  });

  fastify.post(
    '/v1/tools/execute',
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { tool?: string; input?: unknown } | undefined;
      if (body?.tool === undefined || body.tool === '') {
        await reply.status(400).send({
          data: {
            success: false,
            error: { code: 'MISSING_TOOL_NAME', message: 'Request body must include "tool"' },
          },
        });
        return;
      }
      const userId = request.user?.sub ?? 'user_devuser00000000000000';
      const result = await toolRegistry.execute(body.tool, body.input ?? {}, userId, request.id);
      await reply.status(result.success ? 200 : 422).send({ data: result });
    }
  );
}
