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
  // Attach startTime for executionTime computation
  fastify.addHook('onRequest', async (request) => {
    (request as FastifyRequest & { startTime: number }).startTime = Date.now();
  });

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

  /**
   * Build response metadata for error responses.
   */
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

  /**
   * Error handler — maps domain errors to HTTP status codes.
   * Includes metadata per IApiErrorResponse contract.
   */
  function handleError(error: unknown, request: FastifyRequest, reply: FastifyReply): void {
    const metadata = buildErrorMetadata(request);

    if (error instanceof ValidationError) {
      reply.status(400).send({
        error: {
          code: error.code,
          message: error.message,
          fieldErrors: error.fieldErrors,
        },
        metadata,
      });
    } else if (error instanceof CardNotFoundError) {
      reply.status(404).send({
        error: {
          code: error.code,
          message: error.message,
        },
        metadata,
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
        metadata,
      });
    } else if (error instanceof AuthenticationError) {
      reply.status(401).send({
        error: {
          code: (error as DomainError).code,
          message: error.message,
        },
        metadata,
      });
    } else if (error instanceof AuthorizationError) {
      reply.status(403).send({
        error: {
          code: error.code,
          message: error.message,
        },
        metadata,
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
        metadata,
      });
    } else if (error instanceof BusinessRuleError) {
      reply.status(422).send({
        error: {
          code: (error as DomainError).code,
          message: error.message,
        },
        metadata,
      });
    } else if (error instanceof DomainError) {
      reply.status(400).send({
        error: {
          code: error.code,
          message: error.message,
        },
        metadata,
      });
    } else {
      fastify.log.error(error);
      reply.status(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
        metadata,
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
        const result = await contentService.create(request.body, context);
        reply.status(201).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
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
                  knowledgeNodeIds: { type: 'array', items: { type: 'string' } },
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
        handleError(error, request, reply);
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
        handleError(error, request, reply);
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
            knowledgeNodeIds: { type: 'array', items: { type: 'string' } },
            knowledgeNodeIdMode: { type: 'string', enum: ['any', 'all', 'exact', 'subtree', 'prerequisites', 'related'] },
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
        const response = wrapResponse(result.data, result.agentHints, request);
        // Populate top-level pagination per IApiResponse contract
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
                knowledgeNodeIds: { type: 'array', items: { type: 'string' } },
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
        handleError(error, request, reply);
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
        handleError(error, request, reply);
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
        handleError(error, request, reply);
      }
    }
  );

  // ============================================================================
  // Knowledge Node Link Routes
  // ============================================================================

  /**
   * PATCH /v1/cards/:id/node-links - Update card knowledge node links
   */
  fastify.patch<{ Params: IdParams; Body: { knowledgeNodeIds: string[]; version: number } }>(
    '/v1/cards/:id/node-links',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Cards'],
        summary: 'Update card knowledge node links',
        description: 'Replace the knowledgeNodeIds array on a card. Used to link/unlink cards from PKG nodes.',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['knowledgeNodeIds', 'version'],
          properties: {
            knowledgeNodeIds: {
              type: 'array',
              items: { type: 'string', pattern: '^node_[a-zA-Z0-9]{21}$' },
              maxItems: 50,
            },
            version: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await contentService.updateKnowledgeNodeIds(
          request.params.id as CardId,
          request.body.knowledgeNodeIds,
          request.body.version,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  // ============================================================================
  // Count & Validation Routes
  // ============================================================================

  /**
   * POST /v1/cards/count - Count cards matching a DeckQuery
   */
  fastify.post<{ Body: IDeckQuery }>(
    '/v1/cards/count',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Cards'],
        summary: 'Count cards matching a DeckQuery',
        description: 'Returns the count of matching cards without fetching them. Useful for pagination UIs and agent planning.',
        body: {
          type: 'object',
          properties: {
            cardTypes: { type: 'array', items: { type: 'string' } },
            states: { type: 'array', items: { type: 'string' } },
            difficulties: { type: 'array', items: { type: 'string' } },
            knowledgeNodeIds: { type: 'array', items: { type: 'string' } },
            knowledgeNodeIdMode: { type: 'string', enum: ['any', 'all', 'exact', 'subtree', 'prerequisites', 'related'] },
            tags: { type: 'array', items: { type: 'string' } },
            sources: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await contentService.count(request.body, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  /**
   * POST /v1/cards/validate - Validate card content against type-specific schema
   */
  fastify.post<{ Body: { cardType: string; content: unknown } }>(
    '/v1/cards/validate',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Cards'],
        summary: 'Validate card content',
        description: 'Validate content against the schema for a specific card type without creating a card. Used by agents before batch creation.',
        body: {
          type: 'object',
          required: ['cardType', 'content'],
          properties: {
            cardType: { type: 'string' },
            content: { type: 'object' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await contentService.validateContent(
          request.body.cardType,
          request.body.content,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  /**
   * POST /v1/cards/batch/state - Batch state transition
   */
  fastify.post<{
    Body: { ids: string[]; state: string; reason?: string; version: number };
  }>(
    '/v1/cards/batch/state',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Cards'],
        summary: 'Batch change card state',
        description: 'Change state of multiple cards at once. Used after batch creation to activate drafts.',
        body: {
          type: 'object',
          required: ['ids', 'state', 'version'],
          properties: {
            ids: {
              type: 'array',
              items: { type: 'string' },
              maxItems: 100,
            },
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
        const result = await contentService.batchChangeState(
          request.body.ids as CardId[],
          request.body.state as import('@noema/types').CardState,
          request.body.reason,
          request.body.version,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply);
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
        handleError(error, request, reply);
      }
    }
  );
}
