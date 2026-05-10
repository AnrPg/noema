import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { buildErrorMetadata, requireScopes } from '../../api/middleware/auth.middleware.js';
import type { ToolRegistry } from './tool.registry.js';

export function registerToolRoutes(fastify: FastifyInstance, toolRegistry: ToolRegistry): void {
  fastify.get('/v1/tools', async (request, reply) => {
    if (
      !(await requireScopes(request, reply, {
        requiredScopes: ['scheduler:plan'],
        match: 'any',
      }))
    ) {
      return;
    }

    const definitions = toolRegistry.listDefinitions();
    await reply.send({
      data: { tools: definitions, count: definitions.length },
      metadata: buildErrorMetadata(request),
    });
  });

  fastify.post('/v1/tools/execute', async (request: FastifyRequest, reply: FastifyReply) => {
    if (
      !(await requireScopes(request, reply, {
        requiredScopes: ['scheduler:plan'],
        match: 'any',
      }))
    ) {
      return;
    }

    const body = request.body as { tool?: string; input?: unknown } | undefined;
    if (body?.tool === undefined || body.tool === '') {
      await reply.status(400).send({
        error: { code: 'MISSING_TOOL_NAME', message: 'Request body must include "tool" field' },
        metadata: buildErrorMetadata(request),
      });
      return;
    }

    const result = await toolRegistry.execute(
      body.tool,
      body.input ?? {},
      request.user?.principalId ?? request.user?.sub ?? '',
      request.id
    );
    await reply.status(result.success ? 200 : result.error?.code === 'TOOL_NOT_FOUND' ? 404 : 422).send({
      data: result,
      metadata: buildErrorMetadata(request),
    });
  });
}
