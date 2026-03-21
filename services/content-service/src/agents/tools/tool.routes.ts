/**
 * @noema/content-service - MCP Tool Routes
 *
 * HTTP endpoints for MCP tool execution.
 * Agents call these endpoints to invoke tools via the tool registry.
 *
 * Endpoints:
 *   GET  /v1/tools          — List available tools (discovery)
 *   POST /v1/tools/execute  — Execute a tool by name
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { createAuthMiddleware } from '../../middleware/auth.middleware.js';
import type { ToolRegistry } from './tool.registry.js';

interface IScopeUser {
  sub?: string;
  roles?: string[];
  scopes?: string[];
}

function hasRequiredScopes(
  user: IScopeUser | undefined,
  requirement: { match: 'all' | 'any'; requiredScopes: string[] }
): boolean {
  if (process.env['AUTH_DISABLED'] === 'true') return true;
  const granted = new Set(user?.scopes ?? []);
  if (user?.roles?.includes('admin') === true) return true;
  if (requirement.requiredScopes.length === 0) return true;
  if (requirement.match === 'all') {
    return requirement.requiredScopes.every((scope) => granted.has(scope));
  }
  return requirement.requiredScopes.some((scope) => granted.has(scope));
}

// ============================================================================
// Route Plugin
// ============================================================================

export function registerToolRoutes(
  fastify: FastifyInstance,
  toolRegistry: ToolRegistry,
  authMiddleware: ReturnType<typeof createAuthMiddleware>
): void {
  // Attach startTime
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
      serviceName: 'content-service',
      serviceVersion: '0.1.0',
      executionTime: Date.now() - startTime,
    };
  }

  // ============================================================================
  // GET /v1/tools — List available tools
  // ============================================================================

   
  fastify.get(
    '/v1/tools',
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const readAuthorized = hasRequiredScopes(request.user as IScopeUser | undefined, {
        requiredScopes: ['content:tools:read'],
        match: 'any',
      });
      if (!readAuthorized) {
        await reply.status(403).send({
          error: {
            code: 'FORBIDDEN_MISSING_SCOPE',
            message: 'Missing required scope for tool discovery',
          },
          metadata: buildMetadata(request),
        });
        return;
      }

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

  // ============================================================================
  // POST /v1/tools/execute — Execute a tool
  // ============================================================================

   
  fastify.post(
    '/v1/tools/execute',
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const executeAuthorized = hasRequiredScopes(request.user as IScopeUser | undefined, {
        requiredScopes: ['content:tools:execute'],
        match: 'any',
      });
      if (!executeAuthorized) {
        await reply.status(403).send({
          error: {
            code: 'FORBIDDEN_MISSING_SCOPE',
            message: 'Missing required scope for tool execution',
          },
          metadata: buildMetadata(request),
        });
        return;
      }

      const body = request.body as { tool: string; input?: unknown } | undefined;

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

      const definition = toolRegistry.getDefinition(body.tool);
      if (definition !== undefined) {
        const authUser = request.user as IScopeUser | undefined;
        const authorized = hasRequiredScopes(authUser, definition.scopeRequirement);
        if (!authorized) {
          await reply.status(403).send({
            error: {
              code: 'FORBIDDEN_MISSING_SCOPE',
              message: 'Missing required scope for tool execution',
            },
            metadata: buildMetadata(request),
          });
          return;
        }
      }

      const result = await toolRegistry.execute(body.tool, body.input ?? {}, userId, correlationId);

      const statusCode = result.success ? 200 : result.error?.code === 'TOOL_NOT_FOUND' ? 404 : 422;

      await reply.status(statusCode).send({
        data: result,
        metadata: buildMetadata(request),
      });
    }
  );
}
