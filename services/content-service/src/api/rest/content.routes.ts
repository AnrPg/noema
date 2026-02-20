/**
 * @noema/content-service - Content Routes
 *
 * Fastify route definitions for card CRUD and query endpoints.
 * Follows the same patterns as user-service routes.
 */

import type { IApiResponse } from '@noema/contracts';
import type { CardId, CorrelationId, UserId } from '@noema/types';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ContentService, IExecutionContext } from '../../domain/content-service/content.service.js';
import {
  AuthenticationError,
  AuthorizationError,
  BatchLimitExceededError,
  BusinessRuleError,
  CardNotFoundError,
  DomainError,
  ValidationError,
  VersionConflictError,
} from '../../domain/content-service/errors/index.js';
import type {
  IChangeCardStateInput,
  ICreateCardInput,
  IDeckQuery,
  IUpdateCardInput,
} from '../../types/content.types.js';

// ============================================================================
// Request/Response Types
// ============================================================================

interface IdParams {
  id: string;
}

interface UpdateBody<T> {
  data: T;
  version: number;
}

interface TagsBody {
  tags: string[];
  version: number;
}

interface DeleteQuery {
  soft?: string;
}

// ============================================================================
// Route Plugin
// ============================================================================

/**
 * Register content routes.
 */
export async function registerContentRoutes(
  fastify: FastifyInstance,
  contentService: ContentService,
  authMiddleware: ReturnType<typeof import('../../middleware/auth.middleware.js').createAuthMiddleware>
): Promise<void> {
  // ============================================================================
  // Helper Functions
  // ============================================================================

  /**
   * Build execution context from request.
   */
  function buildContext(request: FastifyRequest): IExecutionContext {
    const user = request.user as { sub?: string; roles?: string[] } | undefined;
    const userAgent = request.headers['user-agent'];
    const context: IExecutionContext = {
      userId: (user?.sub as UserId) || null,
      correlationId:
        (request.id as CorrelationId) || (`correlation_${Date.now()}` as CorrelationId),
      roles: user?.roles || [],
      clientIp: request.ip,
    };
    if (userAgent) {
      context.userAgent = userAgent;
    }
    return context;
  }

  /**
   * Standard response wrapper.
   */
  function wrapResponse<T>(data: T, agentHints: unknown, request: FastifyRequest): IApiResponse<T> {
    return {
      data,
      agentHints: agentHints as IApiResponse<T>['agentHints'],
      metadata: {
        requestId: request.id,
        timestamp: new Date().toISOString(),
        serviceName: 'content-service',
        serviceVersion: '0.1.0',
        executionTime: 0,
      },
    };
  }

  /**
   * Error handler — maps domain errors to HTTP status codes.
   */
  function handleError(error: unknown, reply: FastifyReply): void {
    if (error instanceof ValidationError) {
      reply.status(400).send({
        error: {
          code: error.code,
          message: error.message,
          fieldErrors: error.fieldErrors,
        },
      });
    } else if (error instanceof CardNotFoundError) {
      reply.status(404).send({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    } else if (error instanceof VersionConflictError) {
      reply.status(409).send({
        error: {
          code: error.code,
          message: error.message,
          details: {
            expectedVersion: error.expectedVersion,
            actualVersion: error.actualVersion,
          },
        },
      });
    } else if (error instanceof AuthenticationError) {
      reply.status(401).send({
        error: {
          code: (error as DomainError).code,
          message: error.message,
        },
      });
    } else if (error instanceof AuthorizationError) {
      reply.status(403).send({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    } else if (error instanceof BatchLimitExceededError) {
      reply.status(422).send({
        error: {
          code: error.code,
          message: error.message,
          details: {
            limit: error.limit,
            requested: error.requested,
          },
        },
      });
    } else if (error instanceof BusinessRuleError) {
      reply.status(422).send({
        error: {
          code: (error as DomainError).code,
          message: error.message,
        },
      });
    } else if (error instanceof DomainError) {
      reply.status(400).send({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    } else {
      fastify.log.error(error);
      reply.status(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      });
    }
  }

  // ============================================================================
  // Card CRUD Routes
  // ============================================================================

  /**
   * POST /v1/cards - Create a new card
   */
  fastify.post<{ Body: ICreateCardInput }>(
    '/v1/cards',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Cards'],
        summary: 'Create a new card',
        body: {
          type: 'object',
          required: ['cardType', 'content'],
          properties: {
            cardType: { type: 'string' },
            content: {
              type: 'object',
              required: ['front', 'back'],
              properties: {
                front: { type: 'string' },
                back: { type: 'string' },
                hint: { type: 'string' },
                explanation: { type: 'string' },
              },
            },
            difficulty: { type: 'string' },
            nodeIds: { type: 'array', items: { type: 'string' } },
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
        const result = await contentService.create(request.body, context);
        reply.status(201).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  /**
   * POST /v1/cards/batch - Batch create cards (agent bulk import)
   */
  fastify.post<{ Body: { cards: ICreateCardInput[] } }>(
    '/v1/cards/batch',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Cards'],
        summary: 'Batch create cards',
        description: 'Create up to 100 cards in a single request. Used by content generation agents for bulk import.',
        body: {
          type: 'object',
          required: ['cards'],
          properties: {
            cards: {
              type: 'array',
              items: {
                type: 'object',
                required: ['cardType', 'content'],
                properties: {
                  cardType: { type: 'string' },
                  content: { type: 'object' },
                  difficulty: { type: 'string' },
                  nodeIds: { type: 'array', items: { type: 'string' } },
                  tags: { type: 'array', items: { type: 'string' } },
                  source: { type: 'string' },
                  metadata: { type: 'object' },
                },
              },
              maxItems: 100,
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await contentService.createBatch(request.body.cards, context);
        reply.status(201).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  /**
   * GET /v1/cards/:id - Get card by ID
   */
  fastify.get<{ Params: IdParams }>(
    '/v1/cards/:id',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Cards'],
        summary: 'Get a card by ID',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await contentService.findById(request.params.id as CardId, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  /**
   * POST /v1/cards/query - Query cards using DeckQuery
   */
  fastify.post<{ Body: IDeckQuery }>(
    '/v1/cards/query',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Cards'],
        summary: 'Query cards using DeckQuery',
        description: 'Dynamic card query replacing static deck CRUD. Supports filtering, sorting, and pagination.',
        body: {
          type: 'object',
          properties: {
            cardTypes: { type: 'array', items: { type: 'string' } },
            states: { type: 'array', items: { type: 'string' } },
            difficulties: { type: 'array', items: { type: 'string' } },
            nodeIds: { type: 'array', items: { type: 'string' } },
            tags: { type: 'array', items: { type: 'string' } },
            sources: { type: 'array', items: { type: 'string' } },
            userId: { type: 'string' },
            search: { type: 'string' },
            createdAfter: { type: 'string', format: 'date-time' },
            createdBefore: { type: 'string', format: 'date-time' },
            updatedAfter: { type: 'string', format: 'date-time' },
            updatedBefore: { type: 'string', format: 'date-time' },
            sortBy: { type: 'string', enum: ['createdAt', 'updatedAt', 'difficulty'] },
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
        const result = await contentService.query(request.body, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  // ============================================================================
  // Card Update Routes
  // ============================================================================

  /**
   * PATCH /v1/cards/:id - Update a card
   */
  fastify.patch<{ Params: IdParams; Body: UpdateBody<IUpdateCardInput> }>(
    '/v1/cards/:id',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Cards'],
        summary: 'Update a card',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['data', 'version'],
          properties: {
            data: {
              type: 'object',
              properties: {
                content: { type: 'object' },
                difficulty: { type: 'string' },
                nodeIds: { type: 'array', items: { type: 'string' } },
                tags: { type: 'array', items: { type: 'string' } },
                metadata: { type: 'object' },
              },
            },
            version: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await contentService.update(
          request.params.id as CardId,
          request.body.data,
          request.body.version,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  /**
   * PATCH /v1/cards/:id/state - Change card state
   */
  fastify.patch<{ Params: IdParams; Body: IChangeCardStateInput & { version: number } }>(
    '/v1/cards/:id/state',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Cards'],
        summary: 'Change card state',
        description: 'Valid transitions: draft→active/archived, active→suspended/archived, suspended→active/archived, archived→draft',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['state', 'version'],
          properties: {
            state: { type: 'string', enum: ['draft', 'active', 'suspended', 'archived'] },
            reason: { type: 'string' },
            version: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const { version, ...stateInput } = request.body;
        const result = await contentService.changeState(
          request.params.id as CardId,
          stateInput,
          version,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  /**
   * PATCH /v1/cards/:id/tags - Update card tags
   */
  fastify.patch<{ Params: IdParams; Body: TagsBody }>(
    '/v1/cards/:id/tags',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Cards'],
        summary: 'Update card tags',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['tags', 'version'],
          properties: {
            tags: { type: 'array', items: { type: 'string' } },
            version: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await contentService.updateTags(
          request.params.id as CardId,
          request.body.tags,
          request.body.version,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, reply);
      }
    }
  );

  // ============================================================================
  // Delete Route
  // ============================================================================

  /**
   * DELETE /v1/cards/:id - Delete a card
   */
  fastify.delete<{ Params: IdParams; Querystring: DeleteQuery }>(
    '/v1/cards/:id',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Cards'],
        summary: 'Delete a card',
        description: 'Soft delete by default. Use ?soft=false for hard delete (admin only).',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            soft: { type: 'string', default: 'true' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const soft = request.query.soft !== 'false';
        await contentService.delete(request.params.id as CardId, soft, context);
        reply.status(204).send();
      } catch (error) {
        handleError(error, reply);
      }
    }
  );
}
