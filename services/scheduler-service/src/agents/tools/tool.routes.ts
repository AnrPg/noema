import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  buildErrorMetadata,
  requireScopes,
  sendErrorEnvelope,
  type createAuthMiddleware,
} from '../../api/middleware/auth.middleware.js';
import type { ToolRegistry } from './tool.registry.js';

interface IRateWindow {
  startedAt: number;
  count: number;
}

export function registerToolRoutes(
  fastify: FastifyInstance,
  toolRegistry: ToolRegistry,
  authMiddleware: ReturnType<typeof createAuthMiddleware>
): void {
  const toolRateLimitPerMinute = parseInt(process.env['TOOL_RATE_LIMIT_PER_MINUTE'] ?? '120', 10);
  const maxPayloadBytes = parseInt(process.env['REQUEST_MAX_PAYLOAD_BYTES'] ?? '262144', 10);
  const rateWindows = new Map<string, IRateWindow>();
  const authPreHandler = {
    preHandler: (
      request: FastifyRequest,
      reply: FastifyReply,
      done: (error?: Error) => void
    ): void => {
      void authMiddleware(request, reply)
        .then(() => {
          done();
        })
        .catch((error: unknown) => {
          done(error instanceof Error ? error : new Error('Authentication middleware failed'));
        });
    },
  };

  fastify.addHook('onRequest', (request, _reply, done) => {
    (request as FastifyRequest & { startTime: number }).startTime = Date.now();
    done();
  });

  function buildMetadata(request: FastifyRequest): Record<string, unknown> {
    return buildErrorMetadata(request);
  }

  function checkToolRateLimit(principalId: string): boolean {
    const now = Date.now();
    const existing = rateWindows.get(principalId);
    if (!existing || now - existing.startedAt >= 60_000) {
      rateWindows.set(principalId, { startedAt: now, count: 1 });
      return true;
    }

    if (existing.count >= toolRateLimitPerMinute) {
      return false;
    }

    existing.count += 1;
    return true;
  }

  fastify.get(
    '/v1/tools',
    authPreHandler,
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const authorized = await requireScopes(request, reply, {
        requiredScopes: ['scheduler:tools:read'],
        match: 'any',
      });
      if (!authorized) return;

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
      const authorized = await requireScopes(request, reply, {
        requiredScopes: ['scheduler:tools:execute'],
        match: 'any',
      });
      if (!authorized) return;

      const principalId = request.user?.principalId ?? request.user?.sub ?? 'anonymous';
      if (!checkToolRateLimit(principalId)) {
        await sendErrorEnvelope(reply, request, {
          statusCode: 429,
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Per-principal tool rate limit exceeded',
          category: 'dependency',
          retryable: true,
        });
        return;
      }

      const body = request.body as { tool?: string; input?: unknown } | undefined;
      const payloadSize = Buffer.byteLength(JSON.stringify(body ?? {}), 'utf8');
      if (payloadSize > maxPayloadBytes) {
        await sendErrorEnvelope(reply, request, {
          statusCode: 413,
          code: 'PAYLOAD_TOO_LARGE',
          message: `Payload size ${String(payloadSize)} exceeds configured limit ${String(maxPayloadBytes)}`,
          category: 'validation',
          retryable: false,
        });
        return;
      }

      if (body?.tool === undefined || body.tool === '') {
        await sendErrorEnvelope(reply, request, {
          statusCode: 400,
          code: 'MISSING_TOOL_NAME',
          message: 'Request body must include "tool" field',
          category: 'validation',
          retryable: false,
        });
        return;
      }

      const definition = toolRegistry.getDefinition(body.tool);
      if (definition?.scopeRequirement) {
        const hasToolScopes = await requireScopes(request, reply, {
          requiredScopes: definition.scopeRequirement.requiredScopes,
          match: definition.scopeRequirement.match,
        });
        if (!hasToolScopes) return;
      }

      const userId = request.user?.sub ?? '';
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
