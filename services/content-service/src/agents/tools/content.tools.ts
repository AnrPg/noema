/**
 * @noema/content-service - Content MCP Tool Handlers
 *
 * 7 MCP tools for the content-service (per AGENT_MCP_TOOL_REGISTRY):
 *
 * P0: create-card, batch-create-cards, validate-card-content, query-cards
 * P1: get-card-by-id, update-card, change-card-state
 *
 * Each handler wraps a ContentService method and returns IToolResult.
 */

import type { CardId, CardState, CorrelationId, UserId } from '@noema/types';
import { CreateCardInputSchema } from '../../domain/content-service/content.schemas.js';
import type {
  ContentService,
  IExecutionContext,
} from '../../domain/content-service/content.service.js';
import { DomainError } from '../../domain/content-service/errors/index.js';
import type { IToolDefinition, IToolResult } from './tool.types.js';

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
 * validate-card-content — Validate content against card type schema.
 * P0 tool — dry-run validation without persisting.
 */
export function createValidateCardContentHandler() {
  return async (input: unknown, _userId: string, _correlationId: string): Promise<IToolResult> => {
    try {
      const parseResult = CreateCardInputSchema.safeParse(input);
      if (!parseResult.success) {
        const fieldErrors = parseResult.error.flatten().fieldErrors;
        return {
          success: true,
          data: { valid: false, errors: fieldErrors },
          agentHints: {
            suggestedNextActions: [
              {
                action: 'fix_validation_errors',
                description: 'Fix the validation errors and try again',
                priority: 'high',
                category: 'correction',
              },
            ],
            relatedResources: [],
            confidence: 1.0,
            sourceQuality: 'high',
            validityPeriod: 'short',
            contextNeeded: [],
            assumptions: [],
            riskFactors: [],
            dependencies: [],
            estimatedImpact: { benefit: 0.3, effort: 0.2, roi: 1.5 },
            preferenceAlignment: [],
            reasoning: `Content validation failed with ${Object.keys(fieldErrors).length} field errors`,
          },
        };
      }
      return {
        success: true,
        data: { valid: true, validated: parseResult.data },
        agentHints: {
          suggestedNextActions: [
            {
              action: 'create_card',
              description: 'Content is valid — proceed with card creation',
              priority: 'high',
              category: 'exploration',
            },
          ],
          relatedResources: [],
          confidence: 1.0,
          sourceQuality: 'high',
          validityPeriod: 'short',
          contextNeeded: [],
          assumptions: [],
          riskFactors: [],
          dependencies: [],
          estimatedImpact: { benefit: 0.5, effort: 0.1, roi: 5.0 },
          preferenceAlignment: [],
          reasoning: 'Content passed validation — ready for creation',
        },
      };
    } catch (error) {
      return errorResult(error);
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
      const body = input as { ids: string[]; state: string; reason?: string; version: number };
      const result = await contentService.batchChangeState(
        body.ids as CardId[],
        body.state as CardState,
        body.reason,
        body.version,
        context
      );
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

// ============================================================================
// Tool Definitions (for registration / discovery)
// ============================================================================

export const CONTENT_TOOL_DEFINITIONS: IToolDefinition[] = [
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
    name: 'validate-card-content',
    description:
      'Validate content against card type schema without creating. Returns validation result.',
    service: 'content-service',
    priority: 'P0',
    inputSchema: {
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
      'Change state of multiple cards at once. Used after batch creation to activate drafts.',
    service: 'content-service',
    priority: 'P1',
    inputSchema: {
      type: 'object',
      required: ['ids', 'state', 'version'],
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Card IDs to update (max 100)',
        },
        state: { type: 'string', enum: ['draft', 'active', 'suspended', 'archived'] },
        reason: { type: 'string' },
        version: { type: 'number' },
      },
    },
  },
];
