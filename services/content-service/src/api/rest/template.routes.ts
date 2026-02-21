/**
 * @noema/content-service - Template Routes
 *
 * Fastify route definitions for template CRUD and instantiation endpoints.
 */

import type { IApiResponse } from '@noema/contracts';
import type { CorrelationId, TemplateId, UserId } from '@noema/types';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
    AuthorizationError,
    BusinessRuleError,
    DomainError,
    ValidationError,
    VersionConflictError,
} from '../../domain/content-service/errors/index.js';
import type { TemplateService } from '../../domain/content-service/template.service.js';
import { TemplateNotFoundError } from '../../domain/content-service/template.service.js';
import type {
    ICreateTemplateInput,
    ITemplateQuery,
    IUpdateTemplateInput,
} from '../../types/content.types.js';

// ============================================================================
// Request Types
// ============================================================================

interface IdParams {
  id: string;
}

interface UpdateBody<T> {
  data: T;
  version: number;
}

interface DeleteQuery {
  soft?: string;
}

// ============================================================================
// Route Plugin
// ============================================================================

export async function registerTemplateRoutes(
  fastify: FastifyInstance,
  templateService: TemplateService,
  authMiddleware: ReturnType<
    typeof import('../../middleware/auth.middleware.js').createAuthMiddleware
  >
): Promise<void> {
  // Attach startTime for executionTime computation
  fastify.addHook('onRequest', async (request) => {
    (request as FastifyRequest & { startTime: number }).startTime = Date.now();
  });

  function buildContext(request: FastifyRequest) {
    const user = request.user as { sub?: string; roles?: string[] } | undefined;
    const userAgent = request.headers['user-agent'];
    const context: import('../../domain/content-service/content.service.js').IExecutionContext = {
      userId: (user?.sub as UserId) || null,
      correlationId:
        (request.id as CorrelationId) || (`correlation_${Date.now()}` as CorrelationId),
      roles: user?.roles || [],
      clientIp: request.ip,
    };
    if (userAgent) context.userAgent = userAgent;
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

  function buildErrorMetadata(request: FastifyRequest) {
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
      reply
        .status(400)
        .send({
          error: { code: error.code, message: error.message, fieldErrors: error.fieldErrors },
          metadata,
        });
    } else if (error instanceof TemplateNotFoundError) {
      reply
        .status(404)
        .send({ error: { code: 'TEMPLATE_NOT_FOUND', message: error.message }, metadata });
    } else if (error instanceof VersionConflictError) {
      reply.status(409).send({ error: { code: error.code, message: error.message }, metadata });
    } else if (error instanceof AuthorizationError) {
      reply.status(403).send({ error: { code: error.code, message: error.message }, metadata });
    } else if (error instanceof BusinessRuleError) {
      reply
        .status(422)
        .send({ error: { code: (error as DomainError).code, message: error.message }, metadata });
    } else if (error instanceof DomainError) {
      reply.status(400).send({ error: { code: error.code, message: error.message }, metadata });
    } else {
      fastify.log.error(error);
      reply
        .status(500)
        .send({
          error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
          metadata,
        });
    }
  }

  // ============================================================================
  // Template CRUD Routes
  // ============================================================================

  /** POST /v1/templates - Create a template */
  fastify.post<{ Body: ICreateTemplateInput }>(
    '/v1/templates',
    {
      preHandler: authMiddleware,
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
        handleError(error, request, reply);
      }
    }
  );

  /** GET /v1/templates/:id - Get a template by ID */
  fastify.get<{ Params: IdParams }>(
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
        handleError(error, request, reply);
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
        handleError(error, request, reply);
      }
    }
  );

  /** PATCH /v1/templates/:id - Update a template */
  fastify.patch<{ Params: IdParams; Body: UpdateBody<IUpdateTemplateInput> }>(
    '/v1/templates/:id',
    {
      preHandler: authMiddleware,
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
        handleError(error, request, reply);
      }
    }
  );

  /** DELETE /v1/templates/:id - Delete a template */
  fastify.delete<{ Params: IdParams; Querystring: DeleteQuery }>(
    '/v1/templates/:id',
    {
      preHandler: authMiddleware,
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
        handleError(error, request, reply);
      }
    }
  );

  /** POST /v1/templates/:id/instantiate - Create card input from template */
  fastify.post<{ Params: IdParams; Body: Record<string, unknown> }>(
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
          request.body as Record<string, unknown>,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );
}
