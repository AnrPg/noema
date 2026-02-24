/**
 * @noema/content-service - Template Routes
 *
 * Fastify route definitions for template CRUD and instantiation endpoints.
 */

import type { TemplateId } from '@noema/types';
import type { FastifyInstance } from 'fastify';
import type { TemplateService } from '../../domain/content-service/template.service.js';
import type { createAuthMiddleware } from '../../middleware/auth.middleware.js';
import type {
  ICreateTemplateInput,
  ITemplateQuery,
  IUpdateTemplateInput,
} from '../../types/content.types.js';
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

interface IUpdateBody<T> {
  data: T;
  version: number;
}

interface IDeleteQuery {
  soft?: string;
}

// ============================================================================
// Route Plugin
// ============================================================================

export function registerTemplateRoutes(
  fastify: FastifyInstance,
  templateService: TemplateService,
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
  // Template CRUD Routes
  // ============================================================================

  /** POST /v1/templates - Create a template */
  fastify.post<{ Body: ICreateTemplateInput }>(
    '/v1/templates',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['Templates'],
        summary: 'Create a card template',
        body: {
          type: 'object',
          required: ['name', 'cardType', 'content'],
          properties: {
            name: { type: 'string', maxLength: 200 },
            description: { type: 'string', maxLength: 2000 },
            cardType: { type: 'string' },
            content: { type: 'object', required: ['front', 'back'] },
            difficulty: { type: 'string' },
            knowledgeNodeIds: { type: 'array', items: { type: 'string' } },
            tags: { type: 'array', items: { type: 'string' } },
            metadata: { type: 'object' },
            visibility: { type: 'string', enum: ['private', 'public', 'shared'] },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await templateService.create(request.body, context);
        reply.status(201).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  /** GET /v1/templates/:id - Get a template by ID */
  fastify.get<{ Params: IIdParams }>(
    '/v1/templates/:id',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Templates'],
        summary: 'Get a template by ID',
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await templateService.findById(request.params.id as TemplateId, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  /** POST /v1/templates/query - Query templates */
  fastify.post<{ Body: ITemplateQuery }>(
    '/v1/templates/query',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Templates'],
        summary: 'Query templates',
        body: {
          type: 'object',
          properties: {
            cardTypes: { type: 'array', items: { type: 'string' } },
            visibility: { type: 'string', enum: ['private', 'public', 'shared'] },
            tags: { type: 'array', items: { type: 'string' } },
            search: { type: 'string' },
            sortBy: { type: 'string', enum: ['createdAt', 'updatedAt', 'usageCount', 'name'] },
            sortOrder: { type: 'string', enum: ['asc', 'desc'] },
            offset: { type: 'number', minimum: 0 },
            limit: { type: 'number', minimum: 1, maximum: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await templateService.query(request.body, context);
        const response = wrapResponse(result.data, result.agentHints, request);
        response.pagination = {
          offset: request.body.offset ?? 0,
          limit: request.body.limit ?? 20,
          total: result.data.total ?? 0,
          hasMore: result.data.hasMore,
        };
        (response.metadata as { count?: number }).count = result.data.items.length;
        reply.send(response);
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  /** PATCH /v1/templates/:id - Update a template */
  fastify.patch<{ Params: IIdParams; Body: IUpdateBody<IUpdateTemplateInput> }>(
    '/v1/templates/:id',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['Templates'],
        summary: 'Update a template',
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          required: ['data', 'version'],
          properties: {
            data: { type: 'object' },
            version: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await templateService.update(
          request.params.id as TemplateId,
          request.body.data,
          request.body.version,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  /** DELETE /v1/templates/:id - Delete a template */
  fastify.delete<{ Params: IIdParams; Querystring: IDeleteQuery }>(
    '/v1/templates/:id',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['Templates'],
        summary: 'Delete a template',
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        querystring: { type: 'object', properties: { soft: { type: 'string', default: 'true' } } },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const soft = request.query.soft !== 'false';
        await templateService.delete(request.params.id as TemplateId, soft, context);
        reply.status(204).send();
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  /** POST /v1/templates/:id/instantiate - Create card input from template */
  fastify.post<{ Params: IIdParams; Body: Record<string, unknown> }>(
    '/v1/templates/:id/instantiate',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Templates'],
        summary: 'Instantiate a template into a card creation input',
        description:
          'Returns a CreateCardInput object derived from the template. Optionally accepts overrides.',
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          description: 'Optional overrides for the template fields',
          properties: {
            cardType: { type: 'string' },
            content: { type: 'object' },
            difficulty: { type: 'string' },
            knowledgeNodeIds: { type: 'array', items: { type: 'string' } },
            tags: { type: 'array', items: { type: 'string' } },
            source: { type: 'string' },
            metadata: { type: 'object' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await templateService.instantiate(
          request.params.id as TemplateId,
          request.body,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );
}
