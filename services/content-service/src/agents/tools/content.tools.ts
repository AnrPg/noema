/**
 * @noema/content-service - Content MCP Tool Handlers
 *
 * 8+ MCP tools for the content-service (per AGENT_MCP_TOOL_REGISTRY):
 *
 * P0: create-card, batch-create-cards, validate-card-content, query-cards, build-session-seed
 * P1: get-card-by-id, update-card, change-card-state
 *
 * Each handler wraps a ContentService method and returns IToolResult.
 */

import type { CardId, CardState, CorrelationId, UserId } from '@noema/types';
import type {
  ContentService,
  IExecutionContext,
} from '../../domain/content-service/content.service.js';
import { DomainError } from '../../domain/content-service/errors/index.js';
import type { IBatchChangeStateItem } from '../../types/content.types.js';
import type { IToolDefinition, IToolResult } from './tool.types.js';

type IBaseToolDefinition = Omit<IToolDefinition, 'version' | 'scopeRequirement' | 'capabilities'>;

function inferSideEffects(name: string): boolean {
  return (
    name.startsWith('create-') ||
    name.startsWith('batch-create-') ||
    name.startsWith('update-') ||
    name.startsWith('change-') ||
    name.startsWith('batch-change-') ||
    name.startsWith('restore-')
  );
}

function inferCostClass(priority: 'P0' | 'P1' | 'P2'): 'low' | 'medium' | 'high' {
  if (priority === 'P0') return 'medium';
  if (priority === 'P1') return 'low';
  return 'low';
}

function withContractDefaults(definition: IBaseToolDefinition): IToolDefinition {
  const sideEffects = inferSideEffects(definition.name);
  return {
    ...definition,
    version: '1.0.0',
    scopeRequirement: {
      match: 'any',
      requiredScopes: ['content:tools:execute'],
    },
    capabilities: {
      idempotent: !sideEffects,
      sideEffects,
      timeoutMs: 5000,
      costClass: inferCostClass(definition.priority),
      supportsDryRun: definition.name === 'validate-card-content',
      supportsAsync: false,
      supportsStreaming: false,
      ...(definition.name === 'batch-create-cards' || definition.name === 'batch-change-card-state'
        ? { maxBatchSize: 100 }
        : {}),
      consistency: sideEffects ? 'strong' : 'eventual',
    },
  };
}

// ============================================================================
// Helper
// ============================================================================

function buildContext(userId: string, correlationId: string): IExecutionContext {
  return {
    userId: userId as UserId,
    correlationId: correlationId as CorrelationId,
    roles: ['agent'],
  };
}

function errorResult(error: unknown): IToolResult {
  if (error instanceof DomainError) {
    return {
      success: false,
      error: { code: error.code, message: error.message, details: error.details },
      agentHints: {
        suggestedNextActions: [],
        relatedResources: [],
        confidence: 0.9,
        sourceQuality: 'high',
        validityPeriod: 'short',
        contextNeeded: [],
        assumptions: [],
        riskFactors: [
          {
            type: 'accuracy',
            severity: 'medium',
            description: error.message,
            probability: 1.0,
            impact: 0.5,
            mitigation: error.message,
          },
        ],
        dependencies: [],
        estimatedImpact: { benefit: 0, effort: 0.1, roi: 0 },
        preferenceAlignment: [],
        reasoning: `Tool failed: ${error.message}`,
      },
    };
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  return {
    success: false,
    error: { code: 'INTERNAL_ERROR', message },
    agentHints: {
      suggestedNextActions: [],
      relatedResources: [],
      confidence: 0.5,
      sourceQuality: 'low',
      validityPeriod: 'short',
      contextNeeded: [],
      assumptions: [],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: { benefit: 0, effort: 0.1, roi: 0 },
      preferenceAlignment: [],
      reasoning: `Tool failed unexpectedly: ${message}`,
    },
  };
}

// ============================================================================
// Tool Handlers
// ============================================================================

/**
 * create-card — Create a single card with typed content.
 * P0 tool used by Content Generation Agent.
 */
export function createCreateCardHandler(contentService: ContentService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const result = await contentService.create(
        input as Parameters<typeof contentService.create>[0],
        context
      );
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * batch-create-cards — Create multiple cards atomically.
 * P0 tool used by Content Generation Agent for bulk imports.
 */
export function createBatchCreateCardsHandler(contentService: ContentService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as { cards: unknown[] };
      const result = await contentService.createBatch(
        body.cards as Parameters<typeof contentService.createBatch>[0],
        context
      );
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * preview-card-import — Parse an import payload and infer field mappings.
 */
export function createPreviewCardImportHandler(contentService: ContentService) {
  return (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const result = contentService.previewImport(
        input as Parameters<typeof contentService.previewImport>[0],
        context
      );
      return Promise.resolve({ success: true, data: result.data, agentHints: result.agentHints });
    } catch (error) {
      return Promise.resolve(errorResult(error));
    }
  };
}

/**
 * execute-card-import — Parse, map, and create cards from an import payload.
 */
export function createExecuteCardImportHandler(contentService: ContentService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const result = await contentService.executeImport(
        input as Parameters<typeof contentService.executeImport>[0],
        context
      );
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * validate-card-content — Validate content against card type schema.
 * P0 tool — dry-run validation without persisting.
 *
 * Delegates to {@link ContentService.validateContent} so behaviour
 * matches the REST endpoint: same schemas, auth, logging, error format.
 */
export function createValidateCardContentHandler(contentService: ContentService) {
  return (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const { cardType, content } = input as { cardType: string; content: unknown };
      const result = contentService.validateContent(cardType, content, context);
      return Promise.resolve({ success: true, data: result.data, agentHints: result.agentHints });
    } catch (error) {
      return Promise.resolve(errorResult(error));
    }
  };
}

/**
 * query-cards — Execute a DeckQuery to find existing cards.
 * P0 tool used by Session Service, Strategy Agent, and others.
 */
export function createQueryCardsHandler(contentService: ContentService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const result = await contentService.query(
        input as Parameters<typeof contentService.query>[0],
        context
      );
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * build-session-seed — Build initialCardIds for session-service startSession.
 * P0 tool used by Session Service and strategy orchestration.
 */
export function createBuildSessionSeedHandler(contentService: ContentService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const result = await contentService.buildSessionSeed(
        input as Parameters<typeof contentService.buildSessionSeed>[0],
        context
      );
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * get-card-by-id — Retrieve a specific card.
 * P1 tool used by multiple consumers.
 */
export function createGetCardByIdHandler(contentService: ContentService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as { cardId: string };
      const result = await contentService.findById(body.cardId as CardId, context);
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * update-card — Update card content, tags, metadata.
 * P1 tool used by Content Generation Agent.
 */
export function createUpdateCardHandler(contentService: ContentService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as { cardId: string; data: unknown; version: number };
      const result = await contentService.update(
        body.cardId as CardId,
        body.data as Parameters<typeof contentService.update>[1],
        body.version,
        context
      );
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * change-card-state — Transition card state (draft→active etc.).
 * P1 tool used by Governance Agent.
 */
export function createChangeCardStateHandler(contentService: ContentService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as { cardId: string; state: string; reason?: string; version: number };
      const result = await contentService.changeState(
        body.cardId as CardId,
        { state: body.state, reason: body.reason } as Parameters<
          typeof contentService.changeState
        >[1],
        body.version,
        context
      );
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * count-cards — Count cards matching a DeckQuery.
 * P1 tool used for planning and pagination.
 */
export function createCountCardsHandler(contentService: ContentService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const result = await contentService.count(
        input as Parameters<typeof contentService.count>[0],
        context
      );
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * update-card-node-links — Update knowledge node linkage on a card.
 * P1 tool used by Knowledge Graph Agent.
 */
export function createUpdateCardNodeLinksHandler(contentService: ContentService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as { cardId: string; knowledgeNodeIds: string[]; version: number };
      const result = await contentService.updateKnowledgeNodeIds(
        body.cardId as CardId,
        body.knowledgeNodeIds,
        body.version,
        context
      );
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * batch-change-card-state — Change state of multiple cards at once.
 * P1 tool used after batch creation to activate drafts.
 */
export function createBatchChangeCardStateHandler(contentService: ContentService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as {
        items: { id: string; version: number }[];
        state: string;
        reason?: string;
      };
      const result = await contentService.batchChangeState(
        body.items as IBatchChangeStateItem[],
        body.state as CardState,
        body.reason,
        context
      );
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * recover-batch — Find all cards created in a specific batch.
 */
export function createRecoverBatchHandler(contentService: ContentService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as { batchId: string };
      const result = await contentService.findByBatchId(body.batchId, context);
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * rollback-batch — Soft-delete all cards created in a specific batch.
 */
export function createRollbackBatchHandler(contentService: ContentService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as { batchId: string };
      const result = await contentService.rollbackBatch(body.batchId, context);
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}
/**
 * cursor-query-cards — Query cards with cursor-based pagination.
 * P1 tool for efficient large-result navigation.
 */
export function createCursorQueryCardsHandler(contentService: ContentService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as {
        query?: Record<string, unknown>;
        cursor?: string;
        limit?: number;
        direction?: 'forward' | 'backward';
      };
      const result = await contentService.queryCursor(
        (body.query ?? {}) as Parameters<typeof contentService.queryCursor>[0],
        context,
        body.cursor,
        body.limit,
        body.direction
      );
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * restore-card — Restore a soft-deleted card.
 * P1 tool for undoing deletions.
 */
export function createRestoreCardHandler(contentService: ContentService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as { cardId: string };
      const result = await contentService.restore(body.cardId as CardId, context);
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * get-card-history — Retrieve version history for a card.
 * P1 tool for auditing and version comparison.
 */
export function createGetCardHistoryHandler(contentService: ContentService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as { cardId: string; limit?: number; offset?: number };
      const result = await contentService.getHistory(
        body.cardId as CardId,
        context,
        body.limit,
        body.offset
      );
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * get-card-stats — Get aggregate statistics for a user's card collection.
 * P1 tool for planning and reporting.
 */
export function createGetCardStatsHandler(contentService: ContentService) {
  return async (_input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const result = await contentService.getStats(context);
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}
// ============================================================================
// Tool Definitions (for registration / discovery)
// ============================================================================

const CONTENT_TOOL_DEFINITIONS_BASE: IBaseToolDefinition[] = [
  {
    name: 'create-card',
    description:
      'Create a single card with typed content (polymorphic JSONB). Returns the created card with ID.',
    service: 'content-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      required: ['cardType', 'content'],
      properties: {
        cardType: { type: 'string', description: 'Card type discriminator' },
        content: {
          type: 'object',
          description: 'Card content (front, back, hint, explanation, media)',
        },
        difficulty: {
          type: 'string',
          enum: ['beginner', 'elementary', 'intermediate', 'advanced', 'expert'],
        },
        knowledgeNodeIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'PKG node IDs to link',
        },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string', enum: ['user', 'agent', 'system', 'import'] },
        metadata: { type: 'object' },
      },
    },
  },
  {
    name: 'batch-create-cards',
    description:
      'Create multiple cards atomically. Used for bulk content generation. Max 100 cards per batch.',
    service: 'content-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      required: ['cards'],
      properties: {
        cards: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of card creation inputs',
        },
      },
    },
  },
  {
    name: 'preview-card-import',
    description:
      'Parse a candidate import file, infer field mappings, and return a preview of the records that would become cards.',
    service: 'content-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      required: ['fileName', 'fileType', 'formatId', 'payload'],
      properties: {
        fileName: { type: 'string' },
        fileType: {
          type: 'string',
          enum: ['json', 'jsonl', 'csv', 'tsv', 'xlsx', 'txt', 'markdown', 'latex', 'typst'],
        },
        formatId: { type: 'string' },
        sheetName: { type: 'string' },
        payload: {
          type: 'object',
          required: ['encoding', 'content'],
          properties: {
            encoding: { type: 'string', enum: ['text', 'base64'] },
            content: { type: 'string' },
          },
        },
      },
    },
  },
  {
    name: 'execute-card-import',
    description:
      'Run the import pipeline end-to-end from a source payload plus explicit field mappings, then create tracked batch cards.',
    service: 'content-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      required: ['fileName', 'fileType', 'formatId', 'payload', 'mappings'],
      properties: {
        fileName: { type: 'string' },
        fileType: {
          type: 'string',
          enum: ['json', 'jsonl', 'csv', 'tsv', 'xlsx', 'txt', 'markdown', 'latex', 'typst'],
        },
        formatId: { type: 'string' },
        sheetName: { type: 'string' },
        sharedTags: { type: 'array', items: { type: 'string' } },
        sharedKnowledgeNodeIds: { type: 'array', items: { type: 'string' } },
        sharedDifficulty: {
          type: 'string',
          enum: ['beginner', 'elementary', 'intermediate', 'advanced', 'expert'],
        },
        sharedState: { type: 'string', enum: ['draft', 'active'] },
        recordMetadata: {
          type: 'array',
          items: {
            type: 'object',
            required: ['index'],
            properties: {
              index: { type: 'integer', minimum: 0 },
              tags: { type: 'array', items: { type: 'string' } },
              knowledgeNodeIds: { type: 'array', items: { type: 'string' } },
              difficulty: {
                type: 'string',
                enum: ['beginner', 'elementary', 'intermediate', 'advanced', 'expert'],
              },
              state: { type: 'string', enum: ['draft', 'active'] },
            },
          },
        },
        mappings: {
          type: 'array',
          items: {
            type: 'object',
            required: ['sourceKey', 'targetFieldId'],
            properties: {
              sourceKey: { type: 'string' },
              targetFieldId: {
                type: 'string',
                enum: [
                  'front',
                  'back',
                  'hint',
                  'explanation',
                  'tags',
                  'knowledgeNodeIds',
                  'difficulty',
                  'state',
                  'dump',
                ],
              },
              dumpKey: { type: 'string' },
            },
          },
        },
        payload: {
          type: 'object',
          required: ['encoding', 'content'],
          properties: {
            encoding: { type: 'string', enum: ['text', 'base64'] },
            content: { type: 'string' },
          },
        },
      },
    },
  },
  {
    name: 'validate-card-content',
    description:
      'Validate content against a card type schema without creating. Returns {valid, errors?}.',
    service: 'content-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      required: ['cardType', 'content'],
      properties: {
        cardType: {
          type: 'string',
          description: 'Card type discriminator (e.g. multiple_choice, cloze_deletion)',
        },
        content: {
          type: 'object',
          description: 'Content blob to validate against the type-specific schema',
        },
      },
    },
  },
  {
    name: 'query-cards',
    description:
      'Execute a DeckQuery to find existing cards. Supports filtering by type, state, difficulty, nodes, tags, date ranges.',
    service: 'content-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      properties: {
        cardTypes: { type: 'array', items: { type: 'string' } },
        states: { type: 'array', items: { type: 'string' } },
        difficulties: { type: 'array', items: { type: 'string' } },
        knowledgeNodeIds: { type: 'array', items: { type: 'string' } },
        knowledgeNodeIdMode: {
          type: 'string',
          enum: ['any', 'all', 'exact', 'subtree', 'prerequisites', 'related'],
          description:
            'How to match knowledgeNodeIds: any (default), all, exact, subtree/prerequisites/related (require KG)',
        },
        tags: { type: 'array', items: { type: 'string' } },
        search: { type: 'string' },
        sortBy: { type: 'string', enum: ['createdAt', 'updatedAt', 'difficulty'] },
        sortOrder: { type: 'string', enum: ['asc', 'desc'] },
        offset: { type: 'number' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'build-session-seed',
    description:
      'Generate initialCardIds for session-service startSession from a DeckQuery, including strategy-aware card ordering.',
    service: 'content-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'object', description: 'DeckQuery filter object' },
        strategy: {
          type: 'string',
          enum: ['query_order', 'randomized', 'difficulty_balanced'],
          description: 'Card selection strategy',
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
  {
    name: 'get-card-by-id',
    description: 'Retrieve a specific card by its ID. Returns full card content and metadata.',
    service: 'content-service',
    priority: 'P1',
    inputSchema: {
      type: 'object',
      required: ['cardId'],
      properties: {
        cardId: { type: 'string', description: 'Card ID (card_<nanoid>)' },
      },
    },
  },
  {
    name: 'update-card',
    description: 'Update card content, tags, metadata. Uses optimistic locking via version field.',
    service: 'content-service',
    priority: 'P1',
    inputSchema: {
      type: 'object',
      required: ['cardId', 'data', 'version'],
      properties: {
        cardId: { type: 'string' },
        data: {
          type: 'object',
          description: 'Fields to update (content, difficulty, knowledgeNodeIds, tags, metadata)',
        },
        version: { type: 'number', description: 'Current version for optimistic locking' },
      },
    },
  },
  {
    name: 'change-card-state',
    description:
      'Transition card state (draft→active, active→suspended, etc.). Enforces state machine rules.',
    service: 'content-service',
    priority: 'P1',
    inputSchema: {
      type: 'object',
      required: ['cardId', 'state', 'version'],
      properties: {
        cardId: { type: 'string' },
        state: { type: 'string', enum: ['draft', 'active', 'suspended', 'archived'] },
        reason: { type: 'string', description: 'Optional reason for state change (audit trail)' },
        version: { type: 'number' },
      },
    },
  },
  {
    name: 'count-cards',
    description:
      'Count cards matching a DeckQuery without fetching them. Useful for planning batch operations and pagination.',
    service: 'content-service',
    priority: 'P1',
    inputSchema: {
      type: 'object',
      properties: {
        cardTypes: { type: 'array', items: { type: 'string' } },
        states: { type: 'array', items: { type: 'string' } },
        difficulties: { type: 'array', items: { type: 'string' } },
        knowledgeNodeIds: { type: 'array', items: { type: 'string' } },
        knowledgeNodeIdMode: { type: 'string', enum: ['any', 'all', 'exact'] },
        tags: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'update-card-node-links',
    description: 'Update knowledge node linkage on a card. Replaces the knowledgeNodeIds array.',
    service: 'content-service',
    priority: 'P1',
    inputSchema: {
      type: 'object',
      required: ['cardId', 'knowledgeNodeIds', 'version'],
      properties: {
        cardId: { type: 'string' },
        knowledgeNodeIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'PKG node IDs to link (replaces current set)',
        },
        version: { type: 'number' },
      },
    },
  },
  {
    name: 'batch-change-card-state',
    description:
      'Change state of multiple cards at once. Each item carries its own version for per-card optimistic locking.',
    service: 'content-service',
    priority: 'P1',
    inputSchema: {
      type: 'object',
      required: ['items', 'state'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'version'],
            properties: {
              id: { type: 'string', description: 'Card ID' },
              version: { type: 'number', description: 'Expected version for optimistic locking' },
            },
          },
          description: 'Cards to update with per-card versions (max 100)',
        },
        state: { type: 'string', enum: ['draft', 'active', 'suspended', 'archived'] },
        reason: { type: 'string' },
      },
    },
  },
  {
    name: 'recover-batch',
    description:
      'Find all cards created in a specific batch. Used for orphan recovery after partial failures.',
    service: 'content-service',
    priority: 'P2',
    inputSchema: {
      type: 'object',
      required: ['batchId'],
      properties: {
        batchId: {
          type: 'string',
          description: 'Batch correlation ID from batch-create-cards result',
        },
      },
    },
  },
  {
    name: 'rollback-batch',
    description:
      'Soft-delete all cards created in a batch. Provides undo capability for batch creates.',
    service: 'content-service',
    priority: 'P2',
    inputSchema: {
      type: 'object',
      required: ['batchId'],
      properties: {
        batchId: { type: 'string', description: 'Batch correlation ID to rollback' },
      },
    },
  },
  {
    name: 'cursor-query-cards',
    description:
      'Query cards with cursor-based pagination. More efficient than offset for large datasets. Returns nextCursor/prevCursor for page navigation.',
    service: 'content-service',
    priority: 'P1',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'object',
          description:
            'DeckQuery filter object (cardTypes, states, difficulties, tags, sortBy, sortOrder)',
        },
        cursor: { type: 'string', description: 'Opaque cursor from previous response' },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          description: 'Items per page (default: 20)',
        },
        direction: {
          type: 'string',
          enum: ['forward', 'backward'],
          description: 'Pagination direction (default: forward)',
        },
      },
    },
  },
  {
    name: 'restore-card',
    description: 'Restore a soft-deleted card back to DRAFT state. Reverses a previous deletion.',
    service: 'content-service',
    priority: 'P1',
    inputSchema: {
      type: 'object',
      required: ['cardId'],
      properties: {
        cardId: { type: 'string', description: 'ID of the soft-deleted card to restore' },
      },
    },
  },
  {
    name: 'get-card-history',
    description:
      'Retrieve the version history of a card. Returns snapshots of the card at each version, ordered newest first.',
    service: 'content-service',
    priority: 'P1',
    inputSchema: {
      type: 'object',
      required: ['cardId'],
      properties: {
        cardId: { type: 'string', description: 'ID of the card to get history for' },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          description: 'Max entries to return (default: 20)',
        },
        offset: {
          type: 'number',
          minimum: 0,
          description: 'Number of entries to skip (default: 0)',
        },
      },
    },
  },
  {
    name: 'get-card-stats',
    description:
      "Get aggregate statistics for the user's card collection. Returns counts by state, difficulty, card type, source, plus date ranges.",
    service: 'content-service',
    priority: 'P1',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

export const CONTENT_TOOL_DEFINITIONS: IToolDefinition[] =
  CONTENT_TOOL_DEFINITIONS_BASE.map(withContractDefaults);
