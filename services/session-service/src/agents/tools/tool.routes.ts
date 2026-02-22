/**
 * @noema/session-service - Tool Routes
 *
 * MCP tool discovery and execution endpoints.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ToolRegistry } from './tool.registry.js';

export async function registerToolRoutes(
  fastify: FastifyInstance,
  toolRegistry: ToolRegistry,
  authMiddleware?: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
): Promise<void> {
  if (authMiddleware) {
    fastify.addHook('preHandler', authMiddleware);
  }

  // GET /v1/tools — Tool discovery
  fastify.get(
    '/v1/tools',
    {
    },
    async (_request, reply) => {
      const definitions = toolRegistry.listDefinitions();
      reply.send({ data: definitions });
    }
  );

  // POST /v1/tools/execute — Execute a tool
  fastify.post<{
    Body: { tool: string; input: Record<string, unknown> };
  }>(
    '/v1/tools/execute',
    {
    },
    async (request, reply) => {
      const { tool, input } = request.body;
      if (!tool) {
        reply
          .status(400)
          .send({ error: { code: 'VALIDATION_ERROR', message: 'tool is required' } });
        return;
      }

      const user = request.user as { sub?: string } | undefined;
      const userId = user?.sub ?? 'anonymous';

      const result = await toolRegistry.execute(tool, input ?? {}, userId, request.id);

      if (!result.success) {
        reply.status(422).send({ error: { code: 'TOOL_EXECUTION_ERROR', message: result.error } });
        return;
      }

      reply.send({ data: result });
    }
  );
}
