/**
 * @noema/content-service - Content Service
 *
 * Domain service implementing all card-related business logic.
 * Follows the SERVICE_CLASS_SPECIFICATION pattern.
 *
 * Design: ADR-0010 Decision 5 — pure card archive.
 * Cards link to PKG nodes via knowledgeNodeIds[]. No Category entity, no Deck entity.
 * Dynamic queries (DeckQuery) replace static deck CRUD.
 */

import type { IAgentHints } from '@noema/contracts';
import type { CardId, CardState, CorrelationId, IPaginatedResponse, UserId } from '@noema/types';
import { ID_PREFIXES } from '@noema/types';
import { nanoid } from 'nanoid';
import type { Logger } from 'pino';
import { z } from 'zod';
import type {
  CardHistoryChangeType,
  IBatchChangeStateItem,
  IBatchCreateResult,
  ICard,
  ICardHistory,
  ICardStats,
  ICardSummary,
  IChangeCardStateInput,
  ICreateCardInput,
  ICursorPaginatedResponse,
  IDeckQuery,
  ISessionSeed,
  ISessionSeedInput,
  IUpdateCardInput,
} from '../../types/content.types.js';
import { generateContentHash } from '../../utils/content-hash.js';
import { sanitizeCardContent } from '../../utils/content-sanitizer.js';
import type { IEventPublisher } from '../shared/event-publisher.js';
import { validateCardContent } from './card-content.schemas.js';
import type { IContentRepository } from './content.repository.js';
import {
  BatchCreateCardInputSchema,
  ChangeCardStateInputSchema,
  CreateCardInputSchema,
  DeckQuerySchema,
  SessionSeedInputSchema,
  UpdateCardInputSchema,
} from './content.schemas.js';
import {
  AuthorizationError,
  BatchLimitExceededError,
  BusinessRuleError,
  CardNotFoundError,
  DuplicateCardError,
  InvalidCardStateError,
  ValidationError,
  VersionConflictError,
} from './errors/index.js';
import type { IHistoryRepository } from './history.repository.js';

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
    logger: Logger,
    private readonly historyRepository?: IHistoryRepository
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

    // Sanitize content (XSS prevention)
    const sanitizedInput = {
      ...input,
      content: sanitizeCardContent(input.content),
    };

    // Validate input
    const validated = this.validateCreateInput(sanitizedInput);

    // Content deduplication (per-user, SHA-256)
    const contentHash = generateContentHash(validated.cardType, validated.content);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const existingCard = await this.repository.findByContentHash(context.userId!, contentHash);
    if (existingCard) {
      throw new DuplicateCardError(existingCard.id, existingCard as unknown as Record<string, unknown>);
    }

    // Generate ID
    const id = `${ID_PREFIXES.CardId}${nanoid(21)}` as CardId;

    // Create card
    const card = await this.repository.create({
      id,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      userId: context.userId!,
      contentHash,
      ...validated,
    });

    // Publish event
    await this.eventPublisher.publish({
      eventType: 'card.created',
      aggregateType: 'Card',
      aggregateId: id,
      payload: {
        entity: card,
        source: validated.source ?? 'user',
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
   *
   * Each card gets tagged with a batchId in metadata._batchId for:
   * - Batch correlation tracking (easier to reason about state)
   * - Orphan recovery (find cards from a partially-failed batch)
   * - Batch rollback (undo an entire batch via rollbackBatch)
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

    // Sanitize content for each card (XSS prevention)
    const sanitizedCards = parseResult.data.cards.map((card) => ({
      ...card,
      content: sanitizeCardContent(card.content),
    }));

    // Generate batch correlation ID
    const batchId = `batch_${nanoid(21)}`;

    // Compute content hashes for deduplication
    const cardHashes = sanitizedCards.map((card) =>
      generateContentHash(card.cardType, card.content)
    );

    // Batch dedup check — find all hashes that already exist for this user
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const existingCards = await this.repository.findByContentHashes(context.userId!, cardHashes);
    const existingHashSet = new Set(
      existingCards
        .map((c) => c.contentHash)
        .filter((h): h is string => h !== null && h !== undefined)
    );

    // Also detect intra-batch duplicates (first occurrence wins)
    const seenHashes = new Set<string>();
    const duplicateIndices = new Set<number>();

    for (let i = 0; i < cardHashes.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const hash = cardHashes[i]!;
      if (existingHashSet.has(hash) || seenHashes.has(hash)) {
        duplicateIndices.add(i);
      } else {
        seenHashes.add(hash);
      }
    }

    // Build failed array for duplicates detected pre-create
    const preFailed: { index: number; error: string; input: ICreateCardInput }[] = [];
    for (const idx of duplicateIndices) {
      preFailed.push({
        index: idx,
        error: `Duplicate content detected (contentHash: ${String(cardHashes[idx])})`,
        input: sanitizedCards[idx] as unknown as ICreateCardInput,
      });
    }

    // Prepare non-duplicate cards with IDs, batchId, and contentHash
    const cardsToCreate = sanitizedCards
      .map((card, i) => ({ card, index: i }))
      .filter(({ index }) => !duplicateIndices.has(index))
      .map(({ card, index }) => ({
        ...card,
        id: `${ID_PREFIXES.CardId}${nanoid(21)}` as CardId,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        userId: context.userId!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        contentHash: cardHashes[index]!,
        metadata: {
          ...card.metadata,
          _batchId: batchId,
        },
      })) as unknown as (ICreateCardInput & { id: CardId; userId: UserId; contentHash?: string })[];

    // Batch create within a transaction (handled by repository)
    let result: IBatchCreateResult;
    if (cardsToCreate.length > 0) {
      result = await this.repository.createBatch(cardsToCreate);
      // Merge pre-create duplicate failures with repo failures
      result = {
        ...result,
        failed: [...preFailed, ...result.failed],
        total: cards.length,
        failureCount: preFailed.length + result.failureCount,
      };
    } else {
      result = {
        batchId,
        created: [],
        failed: preFailed,
        total: cards.length,
        successCount: 0,
        failureCount: preFailed.length,
      };
    }

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
          batchId,
        },
        metadata: {
          correlationId: context.correlationId,
          userId: context.userId,
        },
      }));

      await this.eventPublisher.publishBatch(events);
    }

    this.logger.info(
      { total: result.total, success: result.successCount, failed: result.failureCount, batchId },
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

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
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
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.isAdmin(context) && validated.userId ? validated.userId : context.userId!;

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
        reasoning: `Query returned ${String(result.total)} cards`,
      },
    };
  }

  /**
   * Query cards using cursor-based pagination.
   * More efficient than offset for large result sets.
   */
  async queryCursor(
    queryInput: IDeckQuery,
    context: IExecutionContext,
    cursor?: string,
    limit?: number,
    direction?: 'forward' | 'backward',
  ): Promise<IServiceResult<ICursorPaginatedResponse<ICardSummary>>> {
    this.requireAuth(context);
    this.logger.debug({ query: queryInput, cursor, limit, direction }, 'Cursor query cards');

    // Validate query
    const parseResult = DeckQuerySchema.safeParse(queryInput);
    if (!parseResult.success) {
      const errors = parseResult.error.flatten();
      throw new ValidationError('Invalid query', errors.fieldErrors as Record<string, string[]>);
    }

    const validated = parseResult.data as IDeckQuery;

    // Non-admins can only query their own cards
    const effectiveUserId =
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.isAdmin(context) && validated.userId ? validated.userId : context.userId!;

    const result = await this.repository.queryCursor(validated, effectiveUserId, cursor, limit, direction);

    return {
      data: result,
      agentHints: {
        suggestedNextActions: [
          {
            action: 'next_page',
            description: result.hasMore ? 'Fetch next page with nextCursor' : 'No more pages',
            priority: result.hasMore ? 'medium' : 'low',
            category: 'exploration',
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
        reasoning: `Cursor query returned ${String(result.items.length)} cards, hasMore: ${String(result.hasMore)}`,
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

    // Sanitize content if present (XSS prevention)
    const sanitizedInput = input.content
      ? { ...input, content: sanitizeCardContent(input.content) }
      : input;

    // Validate input
    const parseResult = UpdateCardInputSchema.safeParse(sanitizedInput);
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

    // Type-specific content validation (uses existing card's cardType)
    if (parseResult.data.content) {
      const contentResult = validateCardContent(existing.cardType, parseResult.data.content);
      if (!contentResult.success) {
        const errors = contentResult.error.flatten();
        throw new ValidationError(
          `Content does not match ${existing.cardType} schema`,
          errors.fieldErrors as Record<string, string[]>
        );
      }
    }

    // Recompute content hash when content changes
    const contentHash = parseResult.data.content
      ? generateContentHash(existing.cardType, parseResult.data.content)
      : undefined;

    // Snapshot before mutation (version history)
    await this.snapshotBeforeChange(existing, 'update', context);

    let card: ICard;
    try {
      card = await this.repository.update(id, parseResult.data as IUpdateCardInput, version, context.userId ?? undefined, contentHash);
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

    // Snapshot before mutation (version history)
    await this.snapshotBeforeChange(existing, 'state_change', context);

    const card = await this.repository.changeState(
      id,
      parseResult.data as IChangeCardStateInput,
      version,
      context.userId ?? undefined,
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

    // Validate tags
    const TagArraySchema = z
      .array(
        z
          .string()
          .min(1)
          .max(50)
          .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/, 'Invalid tag format')
      )
      .max(30);
    const tagResult = TagArraySchema.safeParse(tags);
    if (!tagResult.success) {
      const errors = tagResult.error.flatten();
      throw new ValidationError('Invalid tags', errors.fieldErrors as Record<string, string[]>);
    }

    // Verify ownership
    await this.requireCardOwnership(id, context);

    // Snapshot before mutation (version history)
    const existingForTags = await this.repository.findById(id);
    if (existingForTags) {
      await this.snapshotBeforeChange(existingForTags, 'tags_update', context);
    }

    const card = await this.repository.updateTags(id, tags, version, context.userId ?? undefined);

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
  // Knowledge Node Operations
  // ============================================================================

  /**
   * Update knowledge node linkage on a card.
   */
  async updateKnowledgeNodeIds(
    id: CardId,
    knowledgeNodeIds: string[],
    version: number,
    context: IExecutionContext
  ): Promise<IServiceResult<ICard>> {
    this.requireAuth(context);
    this.logger.info(
      { cardId: id, nodeCount: knowledgeNodeIds.length },
      'Updating card knowledge node links'
    );

    // Verify ownership
    await this.requireCardOwnership(id, context);

    // Snapshot before mutation (version history)
    const existingForNodes = await this.repository.findById(id);
    if (existingForNodes) {
      await this.snapshotBeforeChange(existingForNodes, 'node_links_update', context);
    }

    const card = await this.repository.updateKnowledgeNodeIds(id, knowledgeNodeIds, version, context.userId ?? undefined);

    // Publish event
    await this.eventPublisher.publish({
      eventType: 'card.knowledge-nodes.updated',
      aggregateType: 'Card',
      aggregateId: id,
      payload: { knowledgeNodeIds },
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
  // Count & Validation Operations
  // ============================================================================

  /**
   * Count cards matching a DeckQuery without fetching them.
   */
  async count(
    query: IDeckQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<{ count: number }>> {
    this.requireAuth(context);
    this.logger.info('Counting cards');

    const parseResult = DeckQuerySchema.safeParse(query);
    if (!parseResult.success) {
      const errors = parseResult.error.flatten();
      throw new ValidationError('Invalid query', errors.fieldErrors as Record<string, string[]>);
    }

    const count = await this.repository.count(
      parseResult.data as unknown as IDeckQuery,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      context.userId!
    );

    return {
      data: { count },
      agentHints: {
        suggestedNextActions: [
          {
            action: 'query_cards',
            description: `Fetch the ${String(count)} matching cards`,
            priority: 'medium',
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
        estimatedImpact: { benefit: 0.3, effort: 0.1, roi: 3.0 },
        preferenceAlignment: [],
        reasoning: `Count query returned ${String(count)} cards`,
      },
    };
  }

  /**
   * Build an initial session seed (ordered card IDs) from a DeckQuery.
   * This bridges content-service card selection with session-service startSession.
   */
  async buildSessionSeed(
    input: ISessionSeedInput,
    context: IExecutionContext
  ): Promise<IServiceResult<ISessionSeed>> {
    this.requireAuth(context);
    this.logger.info('Building session seed');

    const parseResult = SessionSeedInputSchema.safeParse(input);
    if (!parseResult.success) {
      const errors = parseResult.error.flatten();
      throw new ValidationError(
        'Invalid session seed input',
        errors.fieldErrors as Record<string, string[]>
      );
    }

    const validated = parseResult.data;
    const query = {
      ...validated.query,
      offset: 0,
      limit: Math.min(validated.maxCards, 200),
    } as IDeckQuery;

    const effectiveUserId =
      this.isAdmin(context) && query.userId
        ? query.userId
        : // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          context.userId!;

    const result = await this.repository.query(query, effectiveUserId);
    const selectedCards = this.selectCardsForSession(
      result.items,
      validated.strategy,
      validated.maxCards
    );
    const initialCardIds = selectedCards.map((card) => card.id);
    const laneMixApplied = validated.strategyContext?.targetLaneMix ?? {
      retention: 0.8,
      calibration: 0.2,
    };
    const checkpointRecommendations = validated.strategyContext?.checkpointSignals ?? [
      'confidence_drift',
      'latency_spike',
    ];

    return {
      data: {
        initialCardIds,
        selectedCount: initialCardIds.length,
        totalMatched: result.total ?? 0,
        strategy: validated.strategy,
        seedVersion: 'v2',
        recommendedSessionConfig: {
          sessionTimeoutHours: 24,
        },
        laneMixApplied,
        checkpointRecommendations,
        selectionRationale:
          validated.strategy === 'difficulty_balanced'
            ? 'Balanced difficulty distribution with policy-aware lane targeting'
            : `Selected using ${validated.strategy} strategy`,
        ...(validated.includeCardSummaries ? { selectedCards } : {}),
      },
      agentHints: {
        suggestedNextActions: [
          {
            action: 'start_session',
            description: 'Start session-service with the generated initialCardIds',
            priority: 'high',
            category: 'learning',
          },
          {
            action: 'record_deck_query_log',
            description: 'Persist DeckQuery provenance alongside the started session',
            priority: 'medium',
            category: 'optimization',
          },
        ],
        relatedResources: selectedCards.slice(0, 10).map((card) => ({
          type: 'Card',
          id: card.id,
          label: card.preview,
          relevance: 0.9,
        })),
        confidence: 1.0,
        sourceQuality: 'high',
        validityPeriod: 'short',
        contextNeeded: [],
        assumptions: ['Session timeout defaults to 24h unless the caller overrides session config'],
        riskFactors: [],
        dependencies: [
          {
            action: 'start_session',
            dependsOn: ['build_session_seed'],
            type: 'required',
            reason: 'session-service requires initialCardIds generated from content query',
          },
        ],
        estimatedImpact: { benefit: 0.8, effort: 0.2, roi: 4.0 },
        preferenceAlignment: [],
        reasoning: `Session seed prepared with ${String(initialCardIds.length)} cards from ${String(result.total)} matches`,
      },
    };
  }

  /**
   * Validate card content against the type-specific schema without creating.
   * Returns validation result with detailed error messages.
   */
  validateContent(
    cardType: string,
    content: unknown,
    _context: IExecutionContext
  ): IServiceResult<{ valid: boolean; errors?: { path: string; message: string }[] }> {
    this.requireAuth(_context);
    this.logger.info({ cardType }, 'Validating card content');

    const result = validateCardContent(cardType, content);

    if (result.success) {
      return {
        data: { valid: true },
        agentHints: {
          suggestedNextActions: [
            {
              action: 'create_card',
              description: 'Content is valid — create the card',
              priority: 'high',
              category: 'optimization',
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
          reasoning: `Content validates against ${cardType} schema`,
        },
      };
    }

    return {
      data: {
        valid: false,
        errors: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      agentHints: {
        suggestedNextActions: [
          {
            action: 'fix_content',
            description: `Fix ${String(result.error.issues.length)} validation error(s) and retry`,
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
        riskFactors: [
          {
            type: 'accuracy',
            severity: 'medium',
            description: `${String(result.error.issues.length)} validation error(s) found`,
            probability: 1.0,
            impact: 0.5,
            mitigation: 'Review error details and fix content structure',
          },
        ],
        dependencies: [],
        estimatedImpact: { benefit: 0.5, effort: 0.3, roi: 1.7 },
        preferenceAlignment: [],
        reasoning: `Content does not match ${cardType} schema: ${String(result.error.issues.length)} error(s)`,
      },
    };
  }

  /**
   * Batch state transition — change state of multiple cards at once.
   * Each item carries its own version for per-card optimistic locking.
   */
  async batchChangeState(
    items: IBatchChangeStateItem[],
    state: CardState,
    reason: string | undefined,
    context: IExecutionContext
  ): Promise<IServiceResult<{ succeeded: CardId[]; failed: { id: CardId; error: string }[] }>> {
    this.requireAuth(context);
    this.logger.info({ count: items.length, targetState: state }, 'Batch changing card state');

    if (items.length > 100) {
      throw new BatchLimitExceededError(100, items.length);
    }

    const succeeded: CardId[] = [];
    const failed: { id: CardId; error: string }[] = [];

    for (const item of items) {
      try {
        const stateInput: IChangeCardStateInput = { state };
        if (reason !== undefined) {
          stateInput.reason = reason;
        }
        await this.changeState(item.id, stateInput, item.version, context);
        succeeded.push(item.id);
      } catch (error) {
        failed.push({
          id: item.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      data: { succeeded, failed },
      agentHints: {
        suggestedNextActions:
          failed.length > 0
            ? [
                {
                  action: 'retry_failed',
                  description: `Retry ${String(failed.length)} failed state transitions`,
                  priority: 'medium',
                  category: 'correction',
                },
              ]
            : [],
        relatedResources: succeeded.map((id) => ({
          type: 'Card',
          id: id as string,
          label: `Card ${id}`,
          relevance: 0.9,
        })),
        confidence: failed.length === 0 ? 1.0 : succeeded.length / items.length,
        sourceQuality: 'high',
        validityPeriod: 'medium',
        contextNeeded: [],
        assumptions: [],
        riskFactors:
          failed.length > 0
            ? [
                {
                  type: 'accuracy' as const,
                  severity: 'medium' as const,
                  description: `${String(failed.length)} state transitions failed`,
                  probability: 1.0,
                  impact: failed.length / items.length,
                  mitigation: 'Review errors and retry individually',
                },
              ]
            : [],
        dependencies: [],
        estimatedImpact: {
          benefit: succeeded.length * 0.1,
          effort: 0.2,
          roi: succeeded.length > 0 ? (succeeded.length * 0.1) / 0.2 : 0,
        },
        preferenceAlignment: [],
        reasoning: `Batch state change: ${String(succeeded.length)}/${String(items.length)} succeeded`,
      },
    };
  }

  // ============================================================================
  // Restore Operations
  // ============================================================================

  /**
   * Restore a soft-deleted card (clear deletedAt, set state to DRAFT).
   */
  async restore(
    id: CardId,
    context: IExecutionContext
  ): Promise<IServiceResult<ICard>> {
    this.requireAuth(context);
    this.logger.info({ cardId: id }, 'Restoring card');

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const card = await this.repository.restore(id, context.userId!);

    // Publish event
    await this.eventPublisher.publish({
      eventType: 'card.restored',
      aggregateType: 'Card',
      aggregateId: id,
      payload: {
        cardType: card.cardType,
      },
      metadata: {
        correlationId: context.correlationId,
        userId: context.userId,
      },
    });

    this.logger.info({ cardId: id }, 'Card restored successfully');

    return {
      data: card,
      agentHints: this.createAgentHints('restored', card),
    };
  }

  // ============================================================================
  // Version History Operations
  // ============================================================================

  /**
   * Get version history for a card.
   */
  async getHistory(
    id: CardId,
    context: IExecutionContext,
    limit?: number,
    offset?: number
  ): Promise<IServiceResult<{ entries: ICardHistory[]; total: number }>> {
    this.requireAuth(context);
    this.logger.info({ cardId: id }, 'Getting card history');

    // Verify ownership
    await this.requireCardOwnership(id, context);

    if (!this.historyRepository) {
      return {
        data: { entries: [], total: 0 },
        agentHints: {
          suggestedNextActions: [],
          relatedResources: [],
          confidence: 1.0,
          sourceQuality: 'high',
          validityPeriod: 'medium',
          contextNeeded: [],
          assumptions: ['Version history is not enabled'],
          riskFactors: [],
          dependencies: [],
          estimatedImpact: { benefit: 0, effort: 0, roi: 0 },
          preferenceAlignment: [],
          reasoning: 'History repository not configured',
        },
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const result = await this.historyRepository.getHistory(id, context.userId!, limit, offset);

    return {
      data: result,
      agentHints: {
        suggestedNextActions: result.entries.length > 0
          ? [{
              action: 'compare_versions',
              description: 'Compare version snapshots to see what changed',
              priority: 'low',
              category: 'exploration',
            }]
          : [],
        relatedResources: [{
          type: 'Card',
          id: id as string,
          label: `Card ${id} history`,
          relevance: 1.0,
        }],
        confidence: 1.0,
        sourceQuality: 'high',
        validityPeriod: 'medium',
        contextNeeded: [],
        assumptions: [],
        riskFactors: [],
        dependencies: [],
        estimatedImpact: { benefit: 0.3, effort: 0.1, roi: 3.0 },
        preferenceAlignment: [],
        reasoning: `Found ${String(result.total)} history entries for card ${id}`,
      },
    };
  }

  /**
   * Get a specific version snapshot of a card.
   */
  async getVersion(
    id: CardId,
    version: number,
    context: IExecutionContext
  ): Promise<IServiceResult<ICardHistory>> {
    this.requireAuth(context);
    this.logger.info({ cardId: id, version }, 'Getting card version');

    // Verify ownership
    await this.requireCardOwnership(id, context);

    if (!this.historyRepository) {
      throw new CardNotFoundError(id);
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const entry = await this.historyRepository.getVersion(id, version, context.userId!);
    if (!entry) {
      throw new CardNotFoundError(`${id}@v${String(version)}`);
    }

    return {
      data: entry,
      agentHints: {
        suggestedNextActions: [{
          action: 'restore_version',
          description: `Restore card to version ${String(version)}`,
          priority: 'low',
          category: 'correction',
        }],
        relatedResources: [{
          type: 'Card',
          id: id as string,
          label: `Card ${id} v${String(version)}`,
          relevance: 1.0,
        }],
        confidence: 1.0,
        sourceQuality: 'high',
        validityPeriod: 'long',
        contextNeeded: [],
        assumptions: [],
        riskFactors: [],
        dependencies: [],
        estimatedImpact: { benefit: 0.3, effort: 0.1, roi: 3.0 },
        preferenceAlignment: [],
        reasoning: `Retrieved version ${String(version)} snapshot for card ${id}`,
      },
    };
  }

  // ============================================================================
  // Statistics Operations
  // ============================================================================

  /**
   * Get aggregate statistics for a user's card collection.
   */
  async getStats(
    context: IExecutionContext
  ): Promise<IServiceResult<ICardStats>> {
    this.requireAuth(context);
    this.logger.info('Getting card statistics');

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const stats = await this.repository.getStats(context.userId!);

    return {
      data: stats,
      agentHints: {
        suggestedNextActions: [
          ...(stats.totalCards === 0
            ? [{
                action: 'create_cards',
                description: 'No cards found — start by creating cards',
                priority: 'high' as const,
                category: 'learning' as const,
              }]
            : []),
          ...(stats.byState['draft'] !== undefined && stats.byState['draft'] > 0
            ? [{
                action: 'activate_drafts',
                description: `${String(stats.byState['draft'])} draft cards can be activated`,
                priority: 'medium' as const,
                category: 'optimization' as const,
              }]
            : []),
        ],
        relatedResources: [],
        confidence: 1.0,
        sourceQuality: 'high',
        validityPeriod: 'short',
        contextNeeded: [],
        assumptions: [],
        riskFactors: [],
        dependencies: [],
        estimatedImpact: { benefit: 0.2, effort: 0.1, roi: 2.0 },
        preferenceAlignment: [],
        reasoning: `Card collection has ${String(stats.totalCards)} active cards across ${String(Object.keys(stats.byCardType).length)} types`,
      },
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
      await this.repository.softDelete(id, existing.version, context.userId ?? undefined);
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
  // Batch Recovery & Rollback
  // ============================================================================

  /**
   * Find all cards created in a specific batch.
   * Used for orphan recovery — discover what was created in a partially-failed batch.
   */
  async findByBatchId(
    batchId: string,
    context: IExecutionContext
  ): Promise<IServiceResult<ICard[]>> {
    this.requireAuth(context);
    this.logger.info({ batchId }, 'Finding cards by batch ID');

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const cards = await this.repository.findByBatchId(batchId, context.userId!);

    return {
      data: cards,
      agentHints: {
        suggestedNextActions: cards.length > 0
          ? [
              {
                action: 'rollback_batch',
                description: `Rollback batch ${batchId} (${String(cards.length)} cards)`,
                priority: 'low',
                category: 'correction',
              },
            ]
          : [],
        relatedResources: cards.map((c) => ({
          type: 'Card',
          id: c.id as string,
          label: `Card ${c.id}`,
          relevance: 0.9,
        })),
        confidence: 1.0,
        sourceQuality: 'high',
        validityPeriod: 'medium',
        contextNeeded: [],
        assumptions: [],
        riskFactors: [],
        dependencies: [],
        estimatedImpact: { benefit: 0.2, effort: 0.1, roi: 2.0 },
        preferenceAlignment: [],
        reasoning: `Found ${String(cards.length)} cards in batch ${batchId}`,
      },
    };
  }

  /**
   * Rollback an entire batch — soft-delete all cards created in the batch.
   * Provides batch-level undo capability to mitigate the "no rollback path" risk
   * of partial-success batch creates.
   */
  async rollbackBatch(
    batchId: string,
    context: IExecutionContext
  ): Promise<IServiceResult<{ batchId: string; deletedCount: number }>> {
    this.requireAuth(context);
    this.logger.info({ batchId }, 'Rolling back batch');

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const deletedCount = await this.repository.softDeleteByBatchId(batchId, context.userId!);

    // Publish rollback event
    await this.eventPublisher.publish({
      eventType: 'card.batch.rolledback',
      aggregateType: 'Card',
      aggregateId: batchId,
      payload: {
        batchId,
        deletedCount,
      },
      metadata: {
        correlationId: context.correlationId,
        userId: context.userId,
      },
    });

    this.logger.info({ batchId, deletedCount }, 'Batch rolled back');

    return {
      data: { batchId, deletedCount },
      agentHints: {
        suggestedNextActions: [],
        relatedResources: [],
        confidence: 1.0,
        sourceQuality: 'high',
        validityPeriod: 'medium',
        contextNeeded: [],
        assumptions: [],
        riskFactors: [],
        dependencies: [],
        estimatedImpact: {
          benefit: deletedCount * 0.1,
          effort: 0.1,
          roi: deletedCount > 0 ? (deletedCount * 0.1) / 0.1 : 0,
        },
        preferenceAlignment: [],
        reasoning: `Rolled back batch ${batchId}: ${String(deletedCount)} cards soft-deleted`,
      },
    };
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
    if (allowed?.includes(target) !== true) {
      throw new BusinessRuleError(
        `Invalid state transition: ${current} → ${target}. Allowed: ${allowed?.join(', ') ?? 'none'}`,
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
  // Private History Methods
  // ============================================================================

  /**
   * Capture a point-in-time snapshot of a card before a mutation.
   * No-op if history repository is not configured.
   */
  private async snapshotBeforeChange(
    card: ICard,
    changeType: CardHistoryChangeType,
    context: IExecutionContext
  ): Promise<void> {
    if (!this.historyRepository) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await this.historyRepository.createSnapshot(card, changeType, context.userId!);
      this.logger.debug(
        { cardId: card.id, version: card.version, changeType },
        'History snapshot created'
      );
    } catch (error) {
      // History snapshot failure should not block the mutation
      this.logger.warn(
        { error, cardId: card.id, changeType },
        'Failed to create history snapshot — continuing without it'
      );
    }
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
    if (card.knowledgeNodeIds.length > 0) {
      for (const nodeId of card.knowledgeNodeIds) {
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
      case 'restored':
        hints.suggestedNextActions.push({
          action: 'activate_card',
          description: 'Restored card is in draft state — activate it for reviews',
          priority: 'high',
          category: 'optimization',
        });
        break;
    }

    return hints;
  }

  private createBatchAgentHints(result: IBatchCreateResult): IAgentHints {
    return {
      suggestedNextActions: [
        {
          action: 'activate_batch',
          description: `Activate ${String(result.successCount)} created cards`,
          priority: 'high',
          category: 'optimization',
        },
        ...(result.failureCount > 0
          ? [
              {
                action: 'retry_failed' as const,
                description: `Retry ${String(result.failureCount)} failed cards`,
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
      riskFactors:
        result.failureCount > 0
          ? [
              {
                type: 'accuracy' as const,
                severity: 'medium' as const,
                description: `${String(result.failureCount)} cards failed to create`,
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
      reasoning: `Batch created ${String(result.successCount)}/${String(result.total)} cards`,
    };
  }

  private selectCardsForSession(
    items: ICardSummary[],
    strategy: 'query_order' | 'randomized' | 'difficulty_balanced',
    maxCards: number
  ): ICardSummary[] {
    if (items.length <= maxCards) {
      return items;
    }

    switch (strategy) {
      case 'randomized': {
        const copy = [...items];
        for (let i = copy.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          const current = copy[i];
          const target = copy[j];
          if (current !== undefined && target !== undefined) {
            copy[i] = target;
            copy[j] = current;
          }
        }
        return copy.slice(0, maxCards);
      }
      case 'difficulty_balanced': {
        const buckets = new Map<string, ICardSummary[]>();
        for (const card of items) {
          const key = card.difficulty;
          const existing = buckets.get(key);
          if (existing) {
            existing.push(card);
          } else {
            buckets.set(key, [card]);
          }
        }

        const priorities = ['beginner', 'elementary', 'intermediate', 'advanced', 'expert'];
        const orderedBuckets = priorities
          .map((level) => buckets.get(level) ?? [])
          .filter((bucket) => bucket.length > 0);

        const selected: ICardSummary[] = [];
        let bucketIndex = 0;
        while (selected.length < maxCards && orderedBuckets.some((bucket) => bucket.length > 0)) {
          const bucket = orderedBuckets[bucketIndex % orderedBuckets.length];
          if (!bucket) {
            break;
          }
          const card = bucket.shift();
          if (card) {
            selected.push(card);
          }
          bucketIndex += 1;
        }
        return selected;
      }
      case 'query_order':
      default:
        return items.slice(0, maxCards);
    }
  }
}
