/**
 * @noema/content-service - Media Routes
 *
 * Fastify route definitions for media file management endpoints.
 * Uses presigned URLs for client-side upload/download via MinIO.
 */

import type { IApiResponse } from '@noema/contracts';
import type { MediaId } from '@noema/types';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { MediaService } from '../../domain/content-service/media.service.js';
import type { createAuthMiddleware } from '../../middleware/auth.middleware.js';
import {
  type IRouteOptions,
  attachStartTimeHook,
  buildContext,
  handleError,
  wrapResponse,
} from '../shared/route-helpers.js';

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
  authMiddleware: ReturnType<typeof createAuthMiddleware>,
  options?: IRouteOptions
): void {
  // Attach startTime for executionTime computation
  attachStartTimeHook(fastify);

  // Per-route rate-limit overrides (@fastify/rate-limit convention)
  const writeRouteConfig = options?.rateLimit
    ? { rateLimit: { max: options.rateLimit.writeMax, timeWindow: options.rateLimit.timeWindow } }
    : {};

  // ============================================================================
  // POST /v1/media/upload-url — Request presigned upload URL
  // ============================================================================

  fastify.post(
    '/v1/media/upload-url',
    { preHandler: authMiddleware, config: writeRouteConfig },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const context = buildContext(request);
        const result = await mediaService.requestUploadUrl(request.body, context);
        reply.status(201).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // POST /v1/media/:id/confirm — Confirm upload completed
  // ============================================================================

  fastify.post<{ Params: IIdParams }>(
    '/v1/media/:id/confirm',
    { preHandler: authMiddleware, config: writeRouteConfig },
    async (request: FastifyRequest<{ Params: IIdParams }>, reply: FastifyReply) => {
      try {
        const context = buildContext(request);
        const mediaId = request.params.id as MediaId;
        const result = await mediaService.confirmUpload(mediaId, request.body, context);
        reply.status(200).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
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
        handleError(error, request, reply, fastify.log);
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
        handleError(error, request, reply, fastify.log);
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
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // DELETE /v1/media/:id — Delete a media file
  // ============================================================================

  fastify.delete<{ Params: IIdParams }>(
    '/v1/media/:id',
    { preHandler: authMiddleware, config: writeRouteConfig },
    async (request: FastifyRequest<{ Params: IIdParams }>, reply: FastifyReply) => {
      try {
        const context = buildContext(request);
        const mediaId = request.params.id as MediaId;
        const result = await mediaService.delete(mediaId, context);
        reply.status(200).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );
}
