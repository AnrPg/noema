/**
 * @noema/content-service - Media Routes
 *
 * Fastify route definitions for media file management endpoints.
 * Uses presigned URLs for client-side upload/download via MinIO.
 */

import type { IApiResponse } from '@noema/contracts';
import type { CorrelationId, MediaId, UserId } from '@noema/types';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { IExecutionContext } from '../../domain/content-service/content.service.js';
import {
  AuthorizationError,
  BusinessRuleError,
  DomainError,
  ValidationError,
} from '../../domain/content-service/errors/index.js';
import type { MediaService } from '../../domain/content-service/media.service.js';
import { MediaNotFoundError } from '../../domain/content-service/media.service.js';
import type { createAuthMiddleware } from '../../middleware/auth.middleware.js';

// ============================================================================
// Request Types
// ============================================================================

interface IIdParams {
  id: string;
}

// ============================================================================
// Route Plugin
// ============================================================================

export function registerMediaRoutes(
  fastify: FastifyInstance,
  mediaService: MediaService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>
): void {
  // Attach startTime for executionTime computation
  fastify.addHook('onRequest', (request) => {
    (request as FastifyRequest & { startTime: number }).startTime = Date.now();
  });

  function buildContext(request: FastifyRequest): IExecutionContext {
    const user = request.user as { sub?: string; roles?: string[] } | undefined;
    const userAgent = request.headers['user-agent'];
    const context: IExecutionContext = {
      userId: (user?.sub ?? null) as UserId | null,
      correlationId:
        request.id as CorrelationId,
      roles: user?.roles ?? [],
      clientIp: request.ip,
    };
    if (userAgent !== undefined) context.userAgent = userAgent;
    return context;
  }

  function wrapResponse<T>(data: T, agentHints: unknown, request: FastifyRequest): IApiResponse<T> {
    const startTime = (request as FastifyRequest & { startTime?: number }).startTime ?? Date.now();
    return {
      data,
      agentHints: agentHints as IApiResponse<T>['agentHints'],
      metadata: {
        requestId: request.id,
        timestamp: new Date().toISOString(),
        serviceName: 'content-service',
        serviceVersion: '0.1.0',
        executionTime: Date.now() - startTime,
      },
    };
  }

  function buildErrorMetadata(request: FastifyRequest): Record<string, unknown> {
    const startTime = (request as FastifyRequest & { startTime?: number }).startTime ?? Date.now();
    return {
      requestId: request.id,
      timestamp: new Date().toISOString(),
      serviceName: 'content-service',
      serviceVersion: '0.1.0',
      executionTime: Date.now() - startTime,
    };
  }

  function handleError(error: unknown, request: FastifyRequest, reply: FastifyReply): void {
    const metadata = buildErrorMetadata(request);

    if (error instanceof ValidationError) {
      reply.status(400).send({
        error: { code: error.code, message: error.message, fieldErrors: error.fieldErrors },
        metadata,
      });
    } else if (error instanceof MediaNotFoundError) {
      reply.status(404).send({
        error: { code: 'MEDIA_NOT_FOUND', message: error.message },
        metadata,
      });
    } else if (error instanceof AuthorizationError) {
      reply.status(403).send({
        error: { code: error.code, message: error.message },
        metadata,
      });
    } else if (error instanceof BusinessRuleError) {
      reply.status(422).send({
        error: { code: (error as DomainError).code, message: error.message },
        metadata,
      });
    } else if (error instanceof DomainError) {
      reply.status(400).send({
        error: { code: error.code, message: error.message },
        metadata,
      });
    } else {
      const message = error instanceof Error ? error.message : 'Unknown error';
      reply.status(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' },
        metadata,
      });
      fastify.log.error({ error: message }, 'Unhandled error in media routes');
    }
  }

  // ============================================================================
  // POST /v1/media/upload-url — Request presigned upload URL
  // ============================================================================

  fastify.post(
    '/v1/media/upload-url',
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const context = buildContext(request);
        const result = await mediaService.requestUploadUrl(request.body, context);
        reply.status(201).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  // ============================================================================
  // POST /v1/media/:id/confirm — Confirm upload completed
  // ============================================================================

  fastify.post<{ Params: IIdParams }>(
    '/v1/media/:id/confirm',
    { preHandler: authMiddleware },
    async (request: FastifyRequest<{ Params: IIdParams }>, reply: FastifyReply) => {
      try {
        const context = buildContext(request);
        const mediaId = request.params.id as MediaId;
        const result = await mediaService.confirmUpload(mediaId, request.body, context);
        reply.status(200).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  // ============================================================================
  // GET /v1/media/:id — Get media file metadata
  // ============================================================================

  fastify.get<{ Params: IIdParams }>(
    '/v1/media/:id',
    { preHandler: authMiddleware },
    async (request: FastifyRequest<{ Params: IIdParams }>, reply: FastifyReply) => {
      try {
        const context = buildContext(request);
        const mediaId = request.params.id as MediaId;
        const result = await mediaService.findById(mediaId, context);
        reply.status(200).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  // ============================================================================
  // GET /v1/media/:id/download-url — Get presigned download URL
  // ============================================================================

  fastify.get<{ Params: IIdParams }>(
    '/v1/media/:id/download-url',
    { preHandler: authMiddleware },
    async (request: FastifyRequest<{ Params: IIdParams }>, reply: FastifyReply) => {
      try {
        const context = buildContext(request);
        const mediaId = request.params.id as MediaId;
        const result = await mediaService.getDownloadUrl(mediaId, context);
        reply.status(200).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  // ============================================================================
  // GET /v1/media — List user's media files
  // ============================================================================

  fastify.get(
    '/v1/media',
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const context = buildContext(request);
        const result = await mediaService.listUserMedia(request.query, context);

        const response = wrapResponse(result.data.items, result.agentHints, request);
        const queryParams = request.query as Record<string, string>;
        const offsetVal = queryParams['offset'] !== undefined && queryParams['offset'] !== '' ? parseInt(queryParams['offset'], 10) : 0;
        const limitVal = queryParams['limit'] !== undefined && queryParams['limit'] !== '' ? parseInt(queryParams['limit'], 10) : 20;
        const hasMore = result.data.total > (offsetVal + limitVal);
        (response as IApiResponse<unknown> & { pagination?: unknown }).pagination = {
          total: result.data.total,
          offset: offsetVal,
          limit: limitVal,
          hasMore,
        };
        const metadataAny = response.metadata as unknown as Record<string, unknown>;
        metadataAny['count'] = result.data.items.length;

        reply.status(200).send(response);
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  // ============================================================================
  // DELETE /v1/media/:id — Delete a media file
  // ============================================================================

  fastify.delete<{ Params: IIdParams }>(
    '/v1/media/:id',
    { preHandler: authMiddleware },
    async (request: FastifyRequest<{ Params: IIdParams }>, reply: FastifyReply) => {
      try {
        const context = buildContext(request);
        const mediaId = request.params.id as MediaId;
        const result = await mediaService.delete(mediaId, context);
        reply.status(200).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );
}
