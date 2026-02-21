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

// ============================================================================
// Route Plugin
// ============================================================================

export function registerToolRoutes(
  fastify: FastifyInstance,
  toolRegistry: ToolRegistry,
  authMiddleware: ReturnType<typeof createAuthMiddleware>
): void {
  // Attach startTime
  fastify.addHook('onRequest', (request) => {
    (request as FastifyRequest & { startTime: number }).startTime = Date.now();
  });

  function buildMetadata(request: FastifyRequest): Record<string, unknown> {
    const startTime = (request as FastifyRequest & { startTime?: number }).startTime ?? Date.now();
    return {
      requestId: request.id,
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

      const result = await toolRegistry.execute(body.tool, body.input ?? {}, userId, correlationId);

      const statusCode = result.success ? 200 : result.error?.code === 'TOOL_NOT_FOUND' ? 404 : 422;

      await reply.status(statusCode).send({
        data: result,
        metadata: buildMetadata(request),
      });
    }
  );
}
