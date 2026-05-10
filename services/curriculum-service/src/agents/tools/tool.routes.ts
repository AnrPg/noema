import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createAuthMiddleware } from '../../middleware/auth.middleware.js';
import type { ToolRegistry } from './tool.registry.js';

export function registerToolRoutes(fastify: FastifyInstance, toolRegistry: ToolRegistry): void {
  const agentAuth = createAuthMiddleware('curriculum:agent');

  fastify.get('/v1/tools', { preHandler: agentAuth }, async (request, reply) => {
    await reply.send({
      data: { tools: toolRegistry.listDefinitions(), count: toolRegistry.listDefinitions().length },
      metadata: {
        requestId: request.id,
        correlationId: request.id,
        timestamp: new Date().toISOString(),
        serviceName: 'curriculum-service',
        serviceVersion: '0.1.0',
        executionTime: 0,
      },
    });
  });

  fastify.post('/v1/tools/execute', { preHandler: agentAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { tool?: string; input?: unknown } | undefined;
    if (body?.tool === undefined || body.tool === '') {
      await reply.status(400).send({
        error: { code: 'MISSING_TOOL_NAME', message: 'Request body must include "tool" field' },
      });
      return;
    }

    const result = await toolRegistry.execute(body.tool, body.input ?? {}, request.user?.sub ?? '', request.id);
    await reply.status(result.success ? 200 : result.error?.code === 'TOOL_NOT_FOUND' ? 404 : 422).send({
      data: result,
      metadata: {
        requestId: request.id,
        correlationId: request.id,
        timestamp: new Date().toISOString(),
        serviceName: 'curriculum-service',
        serviceVersion: '0.1.0',
        executionTime: 0,
      },
    });
  });
}
