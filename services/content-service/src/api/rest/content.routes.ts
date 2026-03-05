/**
 * @noema/content-service - Content Routes
 *
 * Fastify route definitions for card CRUD and query endpoints.
 * Follows the same patterns as user-service routes.
 */

import type { CardId, CardState } from '@noema/types';
import type { FastifyInstance } from 'fastify';
import type { ContentService } from '../../domain/content-service/content.service.js';
import type { createAuthMiddleware } from '../../middleware/auth.middleware.js';
import type { IBatchSummary } from '../../domain/content-service/content.repository.js';
import type {
  IBatchChangeStateItem,
  IChangeCardStateInput,
  ICreateCardInput,
  IDeckQuery,
  ISessionSeedInput,
  IUpdateCardInput,
} from '../../types/content.types.js';
import {
  type IRouteOptions,
  attachStartTimeHook,
  buildContext,
  handleError,
  wrapResponse,
} from '../shared/route-helpers.js';

// ============================================================================
// Request/Response Types
// ============================================================================

interface IIdParams {
  id: string;
}

interface IUpdateBody<T> {
  data: T;
  version: number;
}

interface ITagsBody {
  tags: string[];
  version: number;
}

interface IDeleteQuery {
  soft?: string;
}

// ============================================================================
// Route Plugin
// ============================================================================

/**
 * Register content routes.
 */
export function registerContentRoutes(
  fastify: FastifyInstance,
  contentService: ContentService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>,
  options?: IRouteOptions
): void {
  // Attach startTime for executionTime computation
  attachStartTimeHook(fastify);

  // Per-route rate-limit overrides (@fastify/rate-limit convention)
  const writeRouteConfig = options?.rateLimit
    ? { rateLimit: { max: options.rateLimit.writeMax, timeWindow: options.rateLimit.timeWindow } }
    : {};
  const batchRouteConfig = options?.rateLimit
    ? { rateLimit: { max: options.rateLimit.batchMax, timeWindow: options.rateLimit.timeWindow } }
    : {};

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
      config: writeRouteConfig,
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
        handleError(error, request, reply, fastify.log);
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
      bodyLimit: options?.bodyLimits?.batchLimit ?? 5_242_880,
      config: batchRouteConfig,
      schema: {
        tags: ['Cards'],
        summary: 'Batch create cards',
        description:
          'Create up to 100 cards in a single request. Used by content generation agents for bulk import.',
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
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  /**
   * GET /v1/cards/stats - Get aggregate card statistics
   */
  fastify.get(
    '/v1/cards/stats',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Cards'],
        summary: 'Get aggregate card statistics',
        description:
          "Returns aggregate statistics for the authenticated user's card collection, including counts by state, difficulty, type, and source.",
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await contentService.getStats(context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  /**
   * GET /v1/cards/:id - Get card by ID
   */
  fastify.get<{ Params: IIdParams }>(
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
        handleError(error, request, reply, fastify.log);
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
        description:
          'Dynamic card query replacing static deck CRUD. Supports filtering, sorting, and pagination.',
        body: {
          type: 'object',
          properties: {
            cardTypes: { type: 'array', items: { type: 'string' } },
            states: { type: 'array', items: { type: 'string' } },
            difficulties: { type: 'array', items: { type: 'string' } },
            knowledgeNodeIds: { type: 'array', items: { type: 'string' } },
            knowledgeNodeIdMode: {
              type: 'string',
              enum: ['any', 'all', 'exact', 'subtree', 'prerequisites', 'related'],
            },
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
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  /**
   * GET /v1/cards/cursor - Cursor-based paginated card query.
   * More efficient than offset pagination for large result sets.
   */
  fastify.get<{
    Querystring: {
      cursor?: string;
      limit?: number;
      cardTypes?: string;
      states?: string;
      difficulties?: string;
      tags?: string;
      sources?: string;
      sortBy?: string;
      sortOrder?: string;
      direction?: string;
    };
  }>(
    '/v1/cards/cursor',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Cards'],
        summary: 'Query cards with cursor-based pagination',
        description:
          'Cursor-based pagination using keyset (seek) method. More efficient than offset for large datasets.',
        querystring: {
          type: 'object',
          properties: {
            cursor: { type: 'string', description: 'Opaque cursor string from previous response' },
            limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
            cardTypes: { type: 'string', description: 'Comma-separated card types' },
            states: { type: 'string', description: 'Comma-separated states' },
            difficulties: { type: 'string', description: 'Comma-separated difficulties' },
            tags: { type: 'string', description: 'Comma-separated tags' },
            sources: { type: 'string', description: 'Comma-separated sources' },
            sortBy: {
              type: 'string',
              enum: ['createdAt', 'updatedAt', 'difficulty'],
              default: 'createdAt',
            },
            sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
            direction: { type: 'string', enum: ['forward', 'backward'], default: 'forward' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const { cursor, limit, direction, ...queryParams } = request.query;

        const deckQuery: IDeckQuery = {};
        if (queryParams.cardTypes !== undefined && queryParams.cardTypes !== '') {
          deckQuery.cardTypes = queryParams.cardTypes.split(',') as NonNullable<
            IDeckQuery['cardTypes']
          >;
        }
        if (queryParams.states !== undefined && queryParams.states !== '') {
          deckQuery.states = queryParams.states.split(',') as NonNullable<IDeckQuery['states']>;
        }
        if (queryParams.difficulties !== undefined && queryParams.difficulties !== '') {
          deckQuery.difficulties = queryParams.difficulties.split(',') as NonNullable<
            IDeckQuery['difficulties']
          >;
        }
        if (queryParams.tags !== undefined && queryParams.tags !== '') {
          deckQuery.tags = queryParams.tags.split(',');
        }
        if (queryParams.sources !== undefined && queryParams.sources !== '') {
          deckQuery.sources = queryParams.sources.split(',') as NonNullable<IDeckQuery['sources']>;
        }
        if (queryParams.sortBy !== undefined && queryParams.sortBy !== '') {
          deckQuery.sortBy = queryParams.sortBy as NonNullable<IDeckQuery['sortBy']>;
        }
        if (queryParams.sortOrder !== undefined && queryParams.sortOrder !== '') {
          deckQuery.sortOrder = queryParams.sortOrder as NonNullable<IDeckQuery['sortOrder']>;
        }

        const result = await contentService.queryCursor(
          deckQuery,
          context,
          cursor,
          limit,
          direction as 'forward' | 'backward' | undefined
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  /**
   * POST /v1/cards/session-seed - Build initial card IDs for session start.
   */
  fastify.post<{ Body: ISessionSeedInput }>(
    '/v1/cards/session-seed',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Cards'],
        summary: 'Build session seed from DeckQuery',
        description:
          'Generates deterministic initialCardIds for session-service startSession, with optional card summaries.',
        body: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'object' },
            strategy: {
              type: 'string',
              enum: ['query_order', 'randomized', 'difficulty_balanced'],
            },
            maxCards: { type: 'number', minimum: 1, maximum: 200 },
            includeCardSummaries: { type: 'boolean' },
            strategyContext: {
              type: 'object',
              properties: {
                loadoutArchetype: { type: 'string' },
                forceLevel: { type: 'string' },
                targetLaneMix: {
                  type: 'object',
                  properties: {
                    retention: { type: 'number', minimum: 0, maximum: 1 },
                    calibration: { type: 'number', minimum: 0, maximum: 1 },
                  },
                },
                checkpointSignals: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: [
                      'confidence_drift',
                      'latency_spike',
                      'error_cascade',
                      'streak_break',
                      'manual',
                    ],
                  },
                },
              },
            },
            policySnapshot: { type: 'object' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await contentService.buildSessionSeed(request.body, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // Card Update Routes
  // ============================================================================

  /**
   * PATCH /v1/cards/:id - Update a card
   */
  fastify.patch<{ Params: IIdParams; Body: IUpdateBody<IUpdateCardInput> }>(
    '/v1/cards/:id',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
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
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  /**
   * PATCH /v1/cards/:id/state - Change card state
   */
  fastify.patch<{ Params: IIdParams; Body: IChangeCardStateInput & { version: number } }>(
    '/v1/cards/:id/state',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['Cards'],
        summary: 'Change card state',
        description:
          'Valid transitions: draft→active/archived, active→suspended/archived, suspended→active/archived, archived→draft',
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
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  /**
   * PATCH /v1/cards/:id/tags - Update card tags
   */
  fastify.patch<{ Params: IIdParams; Body: ITagsBody }>(
    '/v1/cards/:id/tags',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
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
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // Knowledge Node Link Routes
  // ============================================================================

  /**
   * PATCH /v1/cards/:id/node-links - Update card knowledge node links
   */
  fastify.patch<{ Params: IIdParams; Body: { knowledgeNodeIds: string[]; version: number } }>(
    '/v1/cards/:id/node-links',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['Cards'],
        summary: 'Update card knowledge node links',
        description:
          'Replace the knowledgeNodeIds array on a card. Used to link/unlink cards from PKG nodes.',
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
        handleError(error, request, reply, fastify.log);
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
        description:
          'Returns the count of matching cards without fetching them. Useful for pagination UIs and agent planning.',
        body: {
          type: 'object',
          properties: {
            cardTypes: { type: 'array', items: { type: 'string' } },
            states: { type: 'array', items: { type: 'string' } },
            difficulties: { type: 'array', items: { type: 'string' } },
            knowledgeNodeIds: { type: 'array', items: { type: 'string' } },
            knowledgeNodeIdMode: {
              type: 'string',
              enum: ['any', 'all', 'exact', 'subtree', 'prerequisites', 'related'],
            },
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
        handleError(error, request, reply, fastify.log);
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
        description:
          'Validate content against the schema for a specific card type without creating a card. Used by agents before batch creation.',
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
        const result = contentService.validateContent(
          request.body.cardType,
          request.body.content,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  /**
   * POST /v1/cards/batch/state - Batch state transition
   */
  fastify.post<{
    Body: {
      items: { id: string; version: number }[];
      state: string;
      reason?: string;
    };
  }>(
    '/v1/cards/batch/state',
    {
      preHandler: authMiddleware,
      config: batchRouteConfig,
      schema: {
        tags: ['Cards'],
        summary: 'Batch change card state',
        description:
          'Change state of multiple cards at once. Each item carries its own version for per-card optimistic locking.',
        body: {
          type: 'object',
          required: ['items', 'state'],
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'version'],
                properties: {
                  id: { type: 'string' },
                  version: { type: 'number' },
                },
              },
              maxItems: 100,
            },
            state: { type: 'string', enum: ['draft', 'active', 'suspended', 'archived'] },
            reason: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await contentService.batchChangeState(
          request.body.items as IBatchChangeStateItem[],
          request.body.state as CardState,
          request.body.reason,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // Delete Route
  // ============================================================================

  /**
   * DELETE /v1/cards/:id - Delete a card
   */
  fastify.delete<{ Params: IIdParams; Querystring: IDeleteQuery }>(
    '/v1/cards/:id',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
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
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // Restore Route
  // ============================================================================

  /**
   * POST /v1/cards/:id/restore - Restore a soft-deleted card
   */
  fastify.post<{ Params: IIdParams }>(
    '/v1/cards/:id/restore',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['Cards'],
        summary: 'Restore a soft-deleted card',
        description:
          'Restores a soft-deleted card by clearing deletedAt and setting state to DRAFT. Returns the restored card.',
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
        const result = await contentService.restore(request.params.id as CardId, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // Version History Routes
  // ============================================================================

  /**
   * GET /v1/cards/:id/history - Get version history for a card
   */
  fastify.get<{ Params: IIdParams; Querystring: { limit?: number; offset?: number } }>(
    '/v1/cards/:id/history',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Cards'],
        summary: 'Get card version history',
        description:
          'Returns point-in-time snapshots captured before each mutation. Ordered newest first.',
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
            limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
            offset: { type: 'number', minimum: 0, default: 0 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await contentService.getHistory(
          request.params.id as CardId,
          context,
          request.query.limit,
          request.query.offset
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  /**
   * GET /v1/cards/:id/history/:version - Get a specific version snapshot
   */
  fastify.get<{ Params: { id: string; version: string } }>(
    '/v1/cards/:id/history/:version',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Cards'],
        summary: 'Get specific card version',
        description: 'Returns the full card snapshot at the specified version number.',
        params: {
          type: 'object',
          required: ['id', 'version'],
          properties: {
            id: { type: 'string' },
            version: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const versionNum = parseInt(request.params.version, 10);
        if (isNaN(versionNum) || versionNum < 1) {
          reply.status(400).send({
            error: { code: 'VALIDATION_ERROR', message: 'Version must be a positive integer' },
          });
          return;
        }
        const result = await contentService.getVersion(
          request.params.id as CardId,
          versionNum,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // Batch Recovery & Rollback Routes
  // ============================================================================

  // NOTE: /recent must be registered before /:batchId to prevent Fastify matching "recent" as a batchId parameter
  /**
   * GET /v1/cards/batch/recent - List recent batches for the authenticated user
   */
  fastify.get<{ Querystring: { limit?: number } }>(
    '/v1/cards/batch/recent',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Cards'],
        summary: 'List recent batches',
        description:
          'Returns a summary of the most recent batch creates for the authenticated user, grouped by batchId.',
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const limit = request.query.limit ?? 20;
        const result = await contentService.findRecentBatches(context, limit);
        reply.send(wrapResponse<IBatchSummary[]>(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  /**
   * GET /v1/cards/batch/:batchId - Recover/discover batch cards
   */
  fastify.get<{ Params: { batchId: string } }>(
    '/v1/cards/batch/:batchId',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Cards'],
        summary: 'Find cards by batch ID',
        description:
          'Discover all cards created in a specific batch. Used for orphan recovery after partial failures.',
        params: {
          type: 'object',
          required: ['batchId'],
          properties: {
            batchId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await contentService.findByBatchId(request.params.batchId, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  /**
   * DELETE /v1/cards/batch/:batchId - Rollback an entire batch
   */
  fastify.delete<{ Params: { batchId: string } }>(
    '/v1/cards/batch/:batchId',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['Cards'],
        summary: 'Rollback a batch',
        description:
          'Soft-delete all cards created in a batch. Provides undo capability for batch creates.',
        params: {
          type: 'object',
          required: ['batchId'],
          properties: {
            batchId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await contentService.rollbackBatch(request.params.batchId, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );
}
