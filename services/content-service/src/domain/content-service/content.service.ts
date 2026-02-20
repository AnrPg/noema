/**
 * @noema/content-service - Content Service
 *
 * Domain service implementing all card-related business logic.
 * Follows the SERVICE_CLASS_SPECIFICATION pattern.
 *
 * Design: ADR-0010 Decision 5 — pure card archive.
 * Cards link to PKG nodes via nodeIds[]. No Category entity, no Deck entity.
 * Dynamic queries (DeckQuery) replace static deck CRUD.
 */

import type { IAgentHints } from '@noema/contracts';
import type { CardId, CardState, CorrelationId, IPaginatedResponse, UserId } from '@noema/types';
import { ID_PREFIXES } from '@noema/types';
import { nanoid } from 'nanoid';
import type { Logger } from 'pino';
import type {
  IBatchCreateResult,
  ICard,
  ICardSummary,
  IChangeCardStateInput,
  ICreateCardInput,
  IDeckQuery,
  IUpdateCardInput,
} from '../../types/content.types.js';
import type { IEventPublisher } from '../shared/event-publisher.js';
import type { IContentRepository } from './content.repository.js';
import {
  BatchCreateCardInputSchema,
  ChangeCardStateInputSchema,
  CreateCardInputSchema,
  DeckQuerySchema,
  UpdateCardInputSchema,
} from './content.schemas.js';
import {
  AuthorizationError,
  BatchLimitExceededError,
  BusinessRuleError,
  CardNotFoundError,
  InvalidCardStateError,
  ValidationError,
  VersionConflictError,
} from './errors/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Execution context for service operations.
 */
export interface IExecutionContext {
  /** Current user ID (null for anonymous) */
  userId: UserId | null;
  /** Request correlation ID */
  correlationId: CorrelationId;
  /** User roles for authorization */
  roles: string[];
  /** Client IP for audit */
  clientIp?: string;
  /** User agent */
  userAgent?: string;
}

/**
 * Service result wrapper.
 */
export interface IServiceResult<T> {
  /** Result data */
  data: T;
  /** Agent hints for next actions */
  agentHints: IAgentHints;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_BATCH_SIZE = 100;

/** Valid state transitions: from → [allowed targets] */
const STATE_TRANSITIONS: Record<string, string[]> = {
  draft: ['active', 'archived'],
  active: ['suspended', 'archived'],
  suspended: ['active', 'archived'],
  archived: ['draft'],
};

// ============================================================================
// Content Service
// ============================================================================

/**
 * Content service implementation.
 */
export class ContentService {
  private readonly logger: Logger;

  constructor(
    private readonly repository: IContentRepository,
    private readonly eventPublisher: IEventPublisher,
    logger: Logger
  ) {
    this.logger = logger.child({ service: 'ContentService' });
  }

  // ============================================================================
  // Create Operations
  // ============================================================================

  /**
   * Create a new card.
   */
  async create(
    input: ICreateCardInput,
    context: IExecutionContext
  ): Promise<IServiceResult<ICard>> {
    this.requireAuth(context);
    this.logger.info({ cardType: input.cardType }, 'Creating card');

    // Validate input
    const validated = this.validateCreateInput(input);

    // Generate ID
    const id = `${ID_PREFIXES.CardId}${nanoid(21)}` as CardId;

    // Create card
    const card = await this.repository.create({
      id,
      userId: context.userId!,
      ...validated,
    });

    // Publish event
    await this.eventPublisher.publish({
      eventType: 'card.created',
      aggregateType: 'Card',
      aggregateId: id,
      payload: {
        entity: card,
        source: validated.source || 'user',
      },
      metadata: {
        correlationId: context.correlationId,
        userId: context.userId,
      },
    });

    this.logger.info({ cardId: id, cardType: card.cardType }, 'Card created successfully');

    return {
      data: card,
      agentHints: this.createAgentHints('created', card),
    };
  }

  /**
   * Create multiple cards in a batch.
   * Used by Content Generation Agent for bulk imports.
   */
  async createBatch(
    cards: ICreateCardInput[],
    context: IExecutionContext
  ): Promise<IServiceResult<IBatchCreateResult>> {
    this.requireAuth(context);

    // Validate batch size
    if (cards.length > MAX_BATCH_SIZE) {
      throw new BatchLimitExceededError(MAX_BATCH_SIZE, cards.length);
    }

    this.logger.info({ count: cards.length }, 'Creating batch of cards');

    // Validate batch input
    const parseResult = BatchCreateCardInputSchema.safeParse({ cards });
    if (!parseResult.success) {
      const errors = parseResult.error.flatten();
      throw new ValidationError(
        'Batch validation failed',
        errors.fieldErrors as Record<string, string[]>
      );
    }

    // Prepare cards with IDs
    const cardsWithIds = parseResult.data.cards.map((card) => ({
      ...card,
      id: `${ID_PREFIXES.CardId}${nanoid(21)}` as CardId,
      userId: context.userId!,
    })) as (ICreateCardInput & { id: CardId; userId: UserId })[];

    // Batch create
    const result = await this.repository.createBatch(cardsWithIds);

    // Publish events for successfully created cards
    if (result.created.length > 0) {
      const events = result.created.map((card) => ({
        eventType: 'card.created',
        aggregateType: 'Card',
        aggregateId: card.id,
        payload: {
          entity: card,
          source: card.source,
          batchOperation: true,
        },
        metadata: {
          correlationId: context.correlationId,
          userId: context.userId,
        },
      }));

      await this.eventPublisher.publishBatch(events);
    }

    this.logger.info(
      { total: result.total, success: result.successCount, failed: result.failureCount },
      'Batch creation completed'
    );

    return {
      data: result,
      agentHints: this.createBatchAgentHints(result),
    };
  }

  // ============================================================================
  // Read Operations
  // ============================================================================

  /**
   * Find card by ID.
   */
  async findById(id: CardId, context: IExecutionContext): Promise<IServiceResult<ICard>> {
    this.requireAuth(context);
    this.logger.debug({ cardId: id }, 'Finding card by ID');

    const card = await this.repository.findByIdForUser(id, context.userId!);

    if (!card) {
      // Admins can see any card
      if (this.isAdmin(context)) {
        const adminCard = await this.repository.findById(id);
        if (!adminCard) {
          throw new CardNotFoundError(id);
        }
        return {
          data: adminCard,
          agentHints: this.createAgentHints('found', adminCard),
        };
      }
      throw new CardNotFoundError(id);
    }

    return {
      data: card,
      agentHints: this.createAgentHints('found', card),
    };
  }

  /**
   * Query cards using DeckQuery.
   */
  async query(
    queryInput: IDeckQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<IPaginatedResponse<ICardSummary>>> {
    this.requireAuth(context);
    this.logger.debug({ query: queryInput }, 'Querying cards');

    // Validate query
    const parseResult = DeckQuerySchema.safeParse(queryInput);
    if (!parseResult.success) {
      const errors = parseResult.error.flatten();
      throw new ValidationError('Invalid query', errors.fieldErrors as Record<string, string[]>);
    }

    const validated = parseResult.data as IDeckQuery;

    // Non-admins can only query their own cards
    const effectiveUserId =
      this.isAdmin(context) && validated.userId ? (validated.userId as UserId) : context.userId!;

    const result = await this.repository.query(validated, effectiveUserId);

    return {
      data: result,
      agentHints: {
        suggestedNextActions: [
          {
            action: 'refine_query',
            description: 'Refine query with additional filters',
            priority: 'medium',
            category: 'exploration',
          },
          {
            action: 'start_session',
            description: 'Start a review session with these cards',
            priority: 'high',
            category: 'learning',
          },
        ],
        relatedResources: [],
        confidence: 0.9,
        sourceQuality: 'high',
        validityPeriod: 'short',
        contextNeeded: [],
        assumptions: [],
        riskFactors: [],
        dependencies: [],
        estimatedImpact: { benefit: 0.5, effort: 0.2, roi: 2.5 },
        preferenceAlignment: [],
        reasoning: `Query returned ${result.total} cards`,
      },
    };
  }

  // ============================================================================
  // Update Operations
  // ============================================================================

  /**
   * Update a card.
   */
  async update(
    id: CardId,
    input: IUpdateCardInput,
    version: number,
    context: IExecutionContext
  ): Promise<IServiceResult<ICard>> {
    this.requireAuth(context);
    this.logger.info({ cardId: id }, 'Updating card');

    // Validate input
    const parseResult = UpdateCardInputSchema.safeParse(input);
    if (!parseResult.success) {
      const errors = parseResult.error.flatten();
      throw new ValidationError(
        'Invalid update input',
        errors.fieldErrors as Record<string, string[]>
      );
    }

    // Verify ownership
    const existing = await this.requireCardOwnership(id, context);

    // Check card is editable
    if (existing.state === 'archived') {
      throw new InvalidCardStateError(existing.state, 'update');
    }

    let card: ICard;
    try {
      card = await this.repository.update(id, parseResult.data as IUpdateCardInput, version);
    } catch (error) {
      if (error instanceof VersionConflictError) throw error;
      throw error;
    }

    // Publish event
    await this.eventPublisher.publish({
      eventType: 'card.updated',
      aggregateType: 'Card',
      aggregateId: id,
      payload: {
        changes: parseResult.data,
        previousVersion: version,
      },
      metadata: {
        correlationId: context.correlationId,
        userId: context.userId,
      },
    });

    this.logger.info({ cardId: id }, 'Card updated successfully');

    return {
      data: card,
      agentHints: this.createAgentHints('updated', card),
    };
  }

  /**
   * Change card state (draft → active, active → suspended, etc.).
   */
  async changeState(
    id: CardId,
    input: IChangeCardStateInput,
    version: number,
    context: IExecutionContext
  ): Promise<IServiceResult<ICard>> {
    this.requireAuth(context);
    this.logger.info({ cardId: id, newState: input.state }, 'Changing card state');

    // Validate input
    const parseResult = ChangeCardStateInputSchema.safeParse(input);
    if (!parseResult.success) {
      const errors = parseResult.error.flatten();
      throw new ValidationError(
        'Invalid state change',
        errors.fieldErrors as Record<string, string[]>
      );
    }

    // Verify ownership
    const existing = await this.requireCardOwnership(id, context);

    // Validate state transition
    this.validateStateTransition(existing.state, parseResult.data.state as CardState);

    const card = await this.repository.changeState(
      id,
      parseResult.data as IChangeCardStateInput,
      version
    );

    // Publish event
    await this.eventPublisher.publish({
      eventType: 'card.state.changed',
      aggregateType: 'Card',
      aggregateId: id,
      payload: {
        previousState: existing.state,
        newState: card.state,
        reason: parseResult.data.reason,
      },
      metadata: {
        correlationId: context.correlationId,
        userId: context.userId,
      },
    });

    this.logger.info({ cardId: id, state: card.state }, 'Card state changed');

    return {
      data: card,
      agentHints: this.createAgentHints('state_changed', card),
    };
  }

  /**
   * Update tags on a card.
   */
  async updateTags(
    id: CardId,
    tags: string[],
    version: number,
    context: IExecutionContext
  ): Promise<IServiceResult<ICard>> {
    this.requireAuth(context);
    this.logger.info({ cardId: id, tagCount: tags.length }, 'Updating card tags');

    // Verify ownership
    await this.requireCardOwnership(id, context);

    const card = await this.repository.updateTags(id, tags, version);

    // Publish event
    await this.eventPublisher.publish({
      eventType: 'card.tags.updated',
      aggregateType: 'Card',
      aggregateId: id,
      payload: { tags },
      metadata: {
        correlationId: context.correlationId,
        userId: context.userId,
      },
    });

    return {
      data: card,
      agentHints: this.createAgentHints('updated', card),
    };
  }

  // ============================================================================
  // Delete Operations
  // ============================================================================

  /**
   * Delete a card (soft by default, hard for admins).
   */
  async delete(id: CardId, soft: boolean, context: IExecutionContext): Promise<void> {
    this.requireAuth(context);
    this.logger.info({ cardId: id, soft }, 'Deleting card');

    const existing = await this.requireCardOwnership(id, context);

    if (soft) {
      await this.repository.softDelete(id, existing.version);
    } else {
      // Hard delete requires admin
      if (!this.isAdmin(context)) {
        throw new AuthorizationError('Hard delete requires admin role');
      }
      await this.repository.hardDelete(id);
    }

    // Publish event
    await this.eventPublisher.publish({
      eventType: 'card.deleted',
      aggregateType: 'Card',
      aggregateId: id,
      payload: {
        cardType: existing.cardType,
        soft,
      },
      metadata: {
        correlationId: context.correlationId,
        userId: context.userId,
      },
    });

    this.logger.info({ cardId: id, soft }, 'Card deleted');
  }

  // ============================================================================
  // Private Validation Methods
  // ============================================================================

  private validateCreateInput(input: ICreateCardInput): ICreateCardInput {
    const parseResult = CreateCardInputSchema.safeParse(input);
    if (!parseResult.success) {
      const errors = parseResult.error.flatten();
      throw new ValidationError(
        'Invalid card input',
        errors.fieldErrors as Record<string, string[]>
      );
    }
    return parseResult.data as unknown as ICreateCardInput;
  }

  private validateStateTransition(current: CardState, target: CardState): void {
    const allowed = STATE_TRANSITIONS[current];
    if (!allowed || !allowed.includes(target)) {
      throw new BusinessRuleError(
        `Invalid state transition: ${current} → ${target}. Allowed: ${allowed?.join(', ') || 'none'}`,
        { currentState: current, targetState: target, allowedTransitions: allowed }
      );
    }
  }

  // ============================================================================
  // Private Authorization Methods
  // ============================================================================

  private requireAuth(context: IExecutionContext): void {
    if (!context.userId) {
      throw new AuthorizationError('Authentication required');
    }
  }

  private isAdmin(context: IExecutionContext): boolean {
    return context.roles.includes('admin') || context.roles.includes('super_admin');
  }

  private async requireCardOwnership(id: CardId, context: IExecutionContext): Promise<ICard> {
    const card = await this.repository.findById(id);
    if (!card) {
      throw new CardNotFoundError(id);
    }

    // Admins can access any card
    if (this.isAdmin(context)) {
      return card;
    }

    // Non-admins can only access their own cards
    if (card.userId !== context.userId) {
      throw new CardNotFoundError(id); // Don't leak existence
    }

    return card;
  }

  // ============================================================================
  // Private Agent Hints Methods
  // ============================================================================

  private createAgentHints(action: string, card: ICard): IAgentHints {
    const hints: IAgentHints = {
      suggestedNextActions: [],
      relatedResources: [
        {
          type: 'Card',
          id: card.id,
          label: `${card.cardType} card`,
          relevance: 1.0,
        },
      ],
      confidence: 1.0,
      sourceQuality: 'high',
      validityPeriod: 'medium',
      contextNeeded: [],
      assumptions: [],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: { benefit: 0.8, effort: 0.2, roi: 4.0 },
      preferenceAlignment: [],
      reasoning: `${action} operation completed`,
    };

    // Link related KG nodes as resources
    if (card.nodeIds.length > 0) {
      for (const nodeId of card.nodeIds) {
        hints.relatedResources.push({
          type: 'KGNode',
          id: nodeId as string,
          label: `PKG node ${nodeId}`,
          relevance: 0.8,
        });
      }
    }

    switch (action) {
      case 'created':
        hints.suggestedNextActions.push(
          {
            action: 'activate_card',
            description: 'Activate card for review scheduling',
            priority: 'high',
            category: 'optimization',
          },
          {
            action: 'link_nodes',
            description: 'Link card to knowledge graph nodes',
            priority: 'medium',
            category: 'exploration',
          }
        );
        break;
      case 'found':
        hints.suggestedNextActions.push(
          {
            action: 'update_card',
            description: 'Update card content or metadata',
            priority: 'low',
            category: 'optimization',
          },
          {
            action: 'start_review',
            description: 'Start a review session including this card',
            priority: 'high',
            category: 'learning',
          }
        );
        break;
      case 'updated':
        hints.suggestedNextActions.push({
          action: 'verify_content',
          description: 'Verify the updated content is correct',
          priority: 'medium',
          category: 'optimization',
        });
        break;
      case 'state_changed':
        if (card.state === 'active') {
          hints.suggestedNextActions.push({
            action: 'schedule_review',
            description: 'Card is now active — schedule first review',
            priority: 'high',
            category: 'learning',
          });
        }
        break;
    }

    return hints;
  }

  private createBatchAgentHints(result: IBatchCreateResult): IAgentHints {
    return {
      suggestedNextActions: [
        {
          action: 'activate_batch',
          description: `Activate ${result.successCount} created cards`,
          priority: 'high',
          category: 'optimization',
        },
        ...(result.failureCount > 0
          ? [
              {
                action: 'retry_failed' as const,
                description: `Retry ${result.failureCount} failed cards`,
                priority: 'medium' as const,
                category: 'correction' as const,
              },
            ]
          : []),
      ],
      relatedResources: result.created.map((card) => ({
        type: 'Card',
        id: card.id,
        label: `${card.cardType} card`,
        relevance: 0.9,
      })),
      confidence: result.failureCount === 0 ? 1.0 : 0.7,
      sourceQuality: 'high',
      validityPeriod: 'medium',
      contextNeeded: [],
      assumptions: [],
      riskFactors: result.failureCount > 0
        ? [
            {
              type: 'accuracy' as const,
              severity: 'medium' as const,
              description: `${result.failureCount} cards failed to create`,
              probability: 1.0,
              impact: result.failureCount / result.total,
              mitigation: 'Retry the failed cards individually',
            },
          ]
        : [],
      dependencies: [],
      estimatedImpact: {
        benefit: Math.min(result.successCount * 0.1, 1.0),
        effort: 0.3,
        roi: result.successCount > 0 ? (result.successCount * 0.1) / 0.3 : 0,
      },
      preferenceAlignment: [],
      reasoning: `Batch created ${result.successCount}/${result.total} cards`,
    };
  }
}
