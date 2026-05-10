import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { createAuthMiddleware } from '../../middleware/auth.middleware.js';
import type { ToolRegistry } from './tool.registry.js';

interface IScopeUser {
  sub?: string;
  scopes?: string[];
}

function hasRequiredScopes(
  user: IScopeUser | undefined,
  requirement: { match: 'all' | 'any'; requiredScopes: string[] }
): boolean {
  if (process.env['AUTH_DISABLED'] === 'true') return true;
  const granted = new Set(user?.scopes ?? []);
  if (requirement.requiredScopes.length === 0) return true;
  return requirement.match === 'all'
    ? requirement.requiredScopes.every((scope) => granted.has(scope))
    : requirement.requiredScopes.some((scope) => granted.has(scope));
}

export function registerToolRoutes(
  fastify: FastifyInstance,
  toolRegistry: ToolRegistry,
  authMiddleware: ReturnType<typeof createAuthMiddleware>
): void {
  fastify.addHook('onRequest', (request, _reply, done) => {
    (request as FastifyRequest & { startTime: number }).startTime = Date.now();
    done();
  });

  function buildMetadata(request: FastifyRequest): Record<string, unknown> {
    const startTime = (request as FastifyRequest & { startTime?: number }).startTime ?? Date.now();
    return {
      requestId: request.id,
      correlationId: request.id,
      timestamp: new Date().toISOString(),
      serviceName: 'pedagogy-guardian-service',
      serviceVersion: '0.1.0',
      executionTime: Date.now() - startTime,
    };
  }

  fastify.get('/v1/tools', { preHandler: authMiddleware }, async (request, reply) => {
    if (
      !hasRequiredScopes(request.user as IScopeUser | undefined, {
        requiredScopes: ['pedagogy-guardian:read', 'pedagogy-guardian:write'],
        match: 'any',
      })
    ) {
      await reply.status(403).send({
        error: { code: 'FORBIDDEN_MISSING_SCOPE', message: 'Missing required scope for tool discovery' },
        metadata: buildMetadata(request),
      });
      return;
    }

    const definitions = toolRegistry.listDefinitions();
    await reply.send({ data: { tools: definitions, count: definitions.length }, metadata: buildMetadata(request) });
  });

  fastify.post('/v1/tools/execute', { preHandler: authMiddleware }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { tool?: string; input?: unknown } | undefined;
    if (body?.tool === undefined || body.tool === '') {
      await reply.status(400).send({
        error: { code: 'MISSING_TOOL_NAME', message: 'Request body must include "tool" field' },
        metadata: buildMetadata(request),
      });
      return;
    }

    const result = await toolRegistry.execute(body.tool, body.input ?? {}, (request.user as { sub?: string } | undefined)?.sub ?? '', request.id);
    await reply.status(result.success ? 200 : result.error?.code === 'TOOL_NOT_FOUND' ? 404 : 422).send({
      data: result,
      metadata: buildMetadata(request),
    });
  });
}
