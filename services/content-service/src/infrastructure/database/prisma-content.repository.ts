/**
 * @noema/content-service - Prisma Content Repository
 *
 * Implementation of IContentRepository using Prisma.
 */

import type {
  CardId,
  CardState,
  CardType,
  DifficultyLevel,
  EventSource,
  IPaginatedResponse,
  JsonValue,
  NodeId,
  RemediationCardType,
  UserId,
} from '@noema/types';
import type {
  Prisma,
  Card as PrismaCard,
  CardState as PrismaCardState,
  CardType as PrismaCardType,
  PrismaClient,
  DifficultyLevel as PrismaDifficultyLevel,
  EventSource as PrismaEventSource,
} from '../../../generated/prisma/index.js';
import type { IContentRepository } from '../../domain/content-service/content.repository.js';
import { CardNotFoundError, VersionConflictError } from '../../domain/content-service/errors/index.js';
import { generatePreview } from '../../domain/content-service/value-objects/content.value-objects.js';
import type {
  IBatchCreateResult,
  ICard,
  ICardContent,
  ICardSummary,
  IChangeCardStateInput,
  ICreateCardInput,
  IDeckQuery,
  IUpdateCardInput,
} from '../../types/content.types.js';

// ============================================================================
// Repository Implementation
// ============================================================================

export class PrismaContentRepository implements IContentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ============================================================================
  // Read Operations
  // ============================================================================

  async findById(id: CardId): Promise<ICard | null> {
    const card = await this.prisma.card.findUnique({
      where: { id, deletedAt: null },
    });
    return card ? this.toDomain(card) : null;
  }

  async findByIdForUser(id: CardId, userId: UserId): Promise<ICard | null> {
    const card = await this.prisma.card.findFirst({
      where: { id, userId, deletedAt: null },
    });
    return card ? this.toDomain(card) : null;
  }

  async query(query: IDeckQuery, userId: UserId): Promise<IPaginatedResponse<ICardSummary>> {
    const where = this.buildWhereClause(query, userId);
    const orderBy = this.buildOrderBy(query);
    const isExact = this.isExactNodeMode(query);

    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;

    if (isExact) {
      // For exact mode, we over-fetch then post-filter because Prisma has
      // no native "array set equals" operator. We use hasEvery in the WHERE
      // clause which returns supersets; the post-filter removes those.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by isExactNodeMode()
      const expectedLen = query.knowledgeNodeIds!.length;
      const overfetchMultiplier = 3;
      const overfetchLimit = limit * overfetchMultiplier;

      const [allMatches, rawTotal] = await Promise.all([
        this.prisma.card.findMany({
          where,
          skip: offset,
          take: overfetchLimit,
          orderBy,
        }),
        this.countExactNodeMode(where, expectedLen),
      ]);

      const filtered = allMatches.filter((c) => c.knowledgeNodeIds.length === expectedLen);
      const items = filtered.slice(0, limit);

      return {
        items: items.map((c) => this.toSummary(c)),
        total: rawTotal,
        hasMore: offset + limit < rawTotal,
      };
    }

    const [cards, total] = await Promise.all([
      this.prisma.card.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy,
      }),
      this.prisma.card.count({ where }),
    ]);

    return {
      items: cards.map((c) => this.toSummary(c)),
      total,
      hasMore: offset + limit < total,
    };
  }

  async count(query: IDeckQuery, userId: UserId): Promise<number> {
    const where = this.buildWhereClause(query, userId);
    if (this.isExactNodeMode(query)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by isExactNodeMode()
      return this.countExactNodeMode(where, query.knowledgeNodeIds!.length);
    }
    return this.prisma.card.count({ where });
  }

  async findByIds(ids: CardId[], userId: UserId): Promise<ICard[]> {
    const cards = await this.prisma.card.findMany({
      where: {
        id: { in: ids },
        userId,
        deletedAt: null,
      },
    });
    return cards.map((c) => this.toDomain(c));
  }

  async findByContentHash(userId: UserId, contentHash: string): Promise<ICard | null> {
    const card = await this.prisma.card.findFirst({
      where: { userId, contentHash, deletedAt: null },
    });
    return card ? this.toDomain(card) : null;
  }

  async findByContentHashes(userId: UserId, contentHashes: string[]): Promise<ICard[]> {
    if (contentHashes.length === 0) return [];
    const cards = await this.prisma.card.findMany({
      where: {
        userId,
        contentHash: { in: contentHashes },
        deletedAt: null,
      },
    });
    return cards.map((c) => this.toDomain(c));
  }

  // ============================================================================
  // Write Operations
  // ============================================================================

  async create(input: ICreateCardInput & { id: CardId; userId: UserId; contentHash?: string }): Promise<ICard> {
    const card = await this.prisma.card.create({
      data: {
        id: input.id,
        userId: input.userId,
        cardType: this.toDbCardType(input.cardType),
        state: 'DRAFT',
        difficulty: this.toDbDifficulty(input.difficulty ?? 'intermediate'),
        content: input.content as unknown as Prisma.JsonObject,
        knowledgeNodeIds: input.knowledgeNodeIds as string[],
        tags: input.tags ?? [],
        source: this.toDbSource(input.source ?? 'user'),
        metadata: (input.metadata ?? {}) as unknown as Prisma.JsonObject,
        contentHash: input.contentHash ?? null,
        createdBy: input.userId,
        version: 1,
      },
    });

    return this.toDomain(card);
  }

  async createBatch(
    inputs: (ICreateCardInput & { id: CardId; userId: UserId; contentHash?: string })[]
  ): Promise<IBatchCreateResult> {
    const created: ICard[] = [];
    const failed: { index: number; error: string; input: ICreateCardInput }[] = [];

    // Use an interactive transaction for atomicity per successful create.
    // Each input is attempted individually within the transaction so that
    // individual validation failures don't roll back sibling successes.
    // The batchId is expected to already be injected into each input's
    // metadata by the service layer.
    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < inputs.length; i++) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const input = inputs[i]!;
        try {
          const card = await tx.card.create({
            data: {
              id: input.id,
              userId: input.userId,
              cardType: this.toDbCardType(input.cardType),
              state: 'DRAFT',
              difficulty: this.toDbDifficulty(input.difficulty ?? 'intermediate'),
              content: input.content as unknown as Prisma.JsonObject,
              knowledgeNodeIds: input.knowledgeNodeIds as string[],
              tags: input.tags ?? [],
              source: this.toDbSource(input.source ?? 'user'),
              metadata: (input.metadata ?? {}) as unknown as Prisma.JsonObject,
              contentHash: input.contentHash ?? null,
              createdBy: input.userId,
              version: 1,
            },
          });
          created.push(this.toDomain(card));
        } catch (error) {
          failed.push({
            index: i,
            error: error instanceof Error ? error.message : 'Unknown error',
            input,
          });
        }
      }
    });

    // Extract batchId from first input metadata (injected by service layer)
    const firstMeta = inputs[0]?.metadata as Record<string, unknown> | undefined;
    const batchId = (firstMeta?.['_batchId'] as string | undefined) ?? '';

    return {
      batchId,
      created,
      failed,
      total: inputs.length,
      successCount: created.length,
      failureCount: failed.length,
    };
  }

  async update(id: CardId, input: IUpdateCardInput, version: number, userId?: UserId, contentHash?: string): Promise<ICard> {
    // For metadata merge we need the current record
    let mergedMetadata: Prisma.JsonObject | undefined;
    if (input.metadata !== undefined) {
      const existing = await this.prisma.card.findUnique({ where: { id } });
      if (existing) {
        const currentMeta = existing.metadata as Record<string, unknown>;
        mergedMetadata = { ...currentMeta, ...input.metadata } as unknown as Prisma.JsonObject;
      }
    }

    const data: Prisma.CardUpdateInput = {
      version: { increment: 1 },
    };

    if (userId !== undefined) {
      data.updatedBy = userId;
    }

    if (input.content !== undefined) {
      data.content = input.content as unknown as Prisma.JsonObject;
    }
    if (contentHash !== undefined) {
      data.contentHash = contentHash;
    }
    if (input.difficulty !== undefined) {
      data.difficulty = this.toDbDifficulty(input.difficulty);
    }
    if (input.knowledgeNodeIds !== undefined) {
      data.knowledgeNodeIds = input.knowledgeNodeIds as string[];
    }
    if (input.tags !== undefined) {
      data.tags = input.tags;
    }
    if (mergedMetadata !== undefined) {
      data.metadata = mergedMetadata;
    }

    try {
      const card = await this.prisma.card.update({
        where: { id, version },
        data,
      });
      return this.toDomain(card);
    } catch (error) {
      return this.handleOptimisticLockError(error, id, version);
    }
  }

  async changeState(id: CardId, input: IChangeCardStateInput, version: number, userId?: UserId): Promise<ICard> {
    try {
      const card = await this.prisma.card.update({
        where: { id, version },
        data: {
          state: this.toDbState(input.state),
          version: { increment: 1 },
          ...(userId !== undefined ? { updatedBy: userId } : {}),
        },
      });
      return this.toDomain(card);
    } catch (error) {
      return this.handleOptimisticLockError(error, id, version);
    }
  }

  async softDelete(id: CardId, version: number, userId?: UserId): Promise<void> {
    try {
      await this.prisma.card.update({
        where: { id, version },
        data: {
          deletedAt: new Date(),
          state: 'ARCHIVED',
          version: { increment: 1 },
          ...(userId !== undefined ? { updatedBy: userId } : {}),
        },
      });
    } catch (error) {
      return this.handleOptimisticLockError(error, id, version);
    }
  }

  async hardDelete(id: CardId): Promise<void> {
    await this.prisma.card.delete({ where: { id } });
  }

  async updateTags(id: CardId, tags: string[], version: number, userId?: UserId): Promise<ICard> {
    try {
      const card = await this.prisma.card.update({
        where: { id, version },
        data: {
          tags,
          version: { increment: 1 },
          ...(userId !== undefined ? { updatedBy: userId } : {}),
        },
      });
      return this.toDomain(card);
    } catch (error) {
      return this.handleOptimisticLockError(error, id, version);
    }
  }

  async updateKnowledgeNodeIds(
    id: CardId,
    knowledgeNodeIds: string[],
    version: number,
    userId?: UserId,
  ): Promise<ICard> {
    try {
      const card = await this.prisma.card.update({
        where: { id, version },
        data: {
          knowledgeNodeIds,
          version: { increment: 1 },
          ...(userId !== undefined ? { updatedBy: userId } : {}),
        },
      });
      return this.toDomain(card);
    } catch (error) {
      return this.handleOptimisticLockError(error, id, version);
    }
  }

  // ============================================================================
  // Batch Recovery Operations
  // ============================================================================

  async findByBatchId(batchId: string, userId: UserId): Promise<ICard[]> {
    const cards = await this.prisma.card.findMany({
      where: {
        userId,
        deletedAt: null,
        metadata: {
          path: ['_batchId'],
          equals: batchId,
        },
      },
    });
    return cards.map((c) => this.toDomain(c));
  }

  async softDeleteByBatchId(batchId: string, userId: UserId): Promise<number> {
    const result = await this.prisma.card.updateMany({
      where: {
        userId,
        deletedAt: null,
        metadata: {
          path: ['_batchId'],
          equals: batchId,
        },
      },
      data: {
        deletedAt: new Date(),
        state: 'ARCHIVED',
        updatedBy: userId,
      },
    });
    return result.count;
  }

  // ============================================================================
  // Private Optimistic Lock Error Handler
  // ============================================================================

  /**
   * Handle Prisma P2025 "Record to update not found" errors by distinguishing
   * between a true not-found and a version conflict via a follow-up query.
   * This catch-and-re-query approach keeps the happy path atomic (single UPDATE
   * with WHERE id + version) while providing precise error reporting.
   */
  private async handleOptimisticLockError(error: unknown, id: CardId, expectedVersion: number): Promise<never> {
    if (
      error instanceof Error &&
      (error.message.includes('Record to update not found') ||
        (error as { code?: string }).code === 'P2025')
    ) {
      // Re-query to distinguish not-found from version conflict
      const current = await this.prisma.card.findUnique({ where: { id } });
      if (!current) {
        throw new CardNotFoundError(id);
      }
      throw new VersionConflictError(expectedVersion, current.version);
    }
    throw error;
  }

  // ============================================================================
  // Private Query Builders
  // ============================================================================

  /**
   * Check if a query uses the 'exact' knowledgeNodeIdMode.
   */
  private isExactNodeMode(query: IDeckQuery): boolean {
    return (
      query.knowledgeNodeIdMode === 'exact' &&
      query.knowledgeNodeIds !== undefined &&
      query.knowledgeNodeIds.length > 0
    );
  }

  /**
   * Count cards matching the WHERE clause with an additional array-length
   * constraint for exact knowledgeNodeId matching.
   *
   * Since Prisma has no native array-length filter, we use a pragmatic
   * two-step approach: findMany with select to get candidate IDs from the
   * Prisma WHERE (which includes hasEvery), then post-filter by array length.
   * This is acceptable because exact-mode queries are rare and hasEvery
   * pre-filters the candidate set significantly.
   */
  private async countExactNodeMode(
    where: Prisma.CardWhereInput,
    expectedLength: number,
  ): Promise<number> {
    const candidates = await this.prisma.card.findMany({
      where,
      select: { id: true, knowledgeNodeIds: true },
    });
    return candidates.filter((c) => c.knowledgeNodeIds.length === expectedLength).length;
  }

  private buildWhereClause(query: IDeckQuery, userId: UserId): Prisma.CardWhereInput {
    const where: Prisma.CardWhereInput = {
      userId,
      deletedAt: null,
    };

    if (query.cardTypes && query.cardTypes.length > 0) {
      where.cardType = { in: query.cardTypes.map((t) => this.toDbCardType(t)) };
    }
    if (query.states && query.states.length > 0) {
      where.state = { in: query.states.map((s) => this.toDbState(s)) };
    }
    if (query.difficulties && query.difficulties.length > 0) {
      where.difficulty = { in: query.difficulties.map((d) => this.toDbDifficulty(d)) };
    }
    if (query.knowledgeNodeIds && query.knowledgeNodeIds.length > 0) {
      const mode = query.knowledgeNodeIdMode ?? 'any';
      const ids = query.knowledgeNodeIds as string[];

      switch (mode) {
        case 'any':
          // Card linked to ANY of the given node IDs
          where.knowledgeNodeIds = { hasSome: ids };
          break;
        case 'all':
          // Card linked to ALL of the given node IDs
          where.knowledgeNodeIds = { hasEvery: ids };
          break;
        case 'exact':
          // Card linked to EXACTLY these node IDs (set equality)
          // hasEvery + length check via AND
          where.AND = [
            ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
            { knowledgeNodeIds: { hasEvery: ids } },
            // Prisma doesn't have a native "set equals" so we also
            // check that the array length matches via raw filter.
            // For now, hasEvery is a reasonable approximation — exact set
            // equality will be enforced in post-filter if needed.
          ];
          break;
        case 'subtree':
        case 'prerequisites':
        case 'related':
          // These modes require KG service pre-resolution.
          // The caller (agent or KG service) should expand the node set
          // and pass with mode='any'. For safety, fall back to 'any'.
          where.knowledgeNodeIds = { hasSome: ids };
          break;
      }
    }
    if (query.tags && query.tags.length > 0) {
      where.tags = { hasSome: query.tags };
    }
    if (query.sources && query.sources.length > 0) {
      where.source = { in: query.sources.map((s) => this.toDbSource(s)) };
    }
    if (query.search !== undefined && query.search !== '') {
      // Use Prisma JSON filtering for content search
      // This is a basic implementation; full-text search would use pg_trgm
      where.OR = [
        { content: { path: ['front'], string_contains: query.search } },
        { content: { path: ['back'], string_contains: query.search } },
      ];
    }
    if (query.createdAfter !== undefined && query.createdAfter !== '') {
      const existing = (where.createdAt ?? {}) as Prisma.DateTimeFilter;
      where.createdAt = {
        ...existing,
        gte: new Date(query.createdAfter),
      };
    }
    if (query.createdBefore !== undefined && query.createdBefore !== '') {
      const existing = (where.createdAt ?? {}) as Prisma.DateTimeFilter;
      where.createdAt = {
        ...existing,
        lte: new Date(query.createdBefore),
      };
    }
    if (query.updatedAfter !== undefined && query.updatedAfter !== '') {
      const existing = (where.updatedAt ?? {}) as Prisma.DateTimeFilter;
      where.updatedAt = {
        ...existing,
        gte: new Date(query.updatedAfter),
      };
    }
    if (query.updatedBefore !== undefined && query.updatedBefore !== '') {
      const existing = (where.updatedAt ?? {}) as Prisma.DateTimeFilter;
      where.updatedAt = {
        ...existing,
        lte: new Date(query.updatedBefore),
      };
    }

    return where;
  }

  private buildOrderBy(query: IDeckQuery): Prisma.CardOrderByWithRelationInput {
    const field = query.sortBy ?? 'createdAt';
    const direction = query.sortOrder ?? 'desc';

    return { [field]: direction };
  }

  // ============================================================================
  // Private Mapping Methods
  // ============================================================================

  private toDomain(card: PrismaCard): ICard {
    const content = card.content as unknown as ICardContent;

    return {
      id: card.id as CardId,
      userId: card.userId as UserId,
      cardType: this.fromDbCardType(card.cardType) as CardType | RemediationCardType,
      state: card.state.toLowerCase() as CardState,
      difficulty: card.difficulty.toLowerCase() as DifficultyLevel,
      content,
      knowledgeNodeIds: card.knowledgeNodeIds as NodeId[],
      tags: card.tags,
      source: card.source.toLowerCase() as EventSource,
      metadata: card.metadata as Record<string, JsonValue>,
      contentHash: card.contentHash ?? null,
      createdAt: card.createdAt.toISOString(),
      updatedAt: card.updatedAt.toISOString(),
      deletedAt: card.deletedAt?.toISOString() ?? null,
      createdBy: card.createdBy ?? '',
      updatedBy: card.updatedBy ?? '',
      version: card.version,
    };
  }

  private toSummary(card: PrismaCard): ICardSummary {
    const content = card.content as unknown as ICardContent;
    const front = typeof content.front === 'string' ? content.front : '';

    return {
      id: card.id as CardId,
      userId: card.userId as UserId,
      cardType: this.fromDbCardType(card.cardType) as CardType | RemediationCardType,
      state: card.state.toLowerCase() as CardState,
      difficulty: card.difficulty.toLowerCase() as DifficultyLevel,
      preview: generatePreview(front),
      knowledgeNodeIds: card.knowledgeNodeIds as NodeId[],
      tags: card.tags,
      source: card.source.toLowerCase() as EventSource,
      createdAt: card.createdAt.toISOString(),
      updatedAt: card.updatedAt.toISOString(),
      version: card.version,
    };
  }

  // ============================================================================
  // Enum Mapping (app lowercase ↔ Prisma UPPERCASE)
  // ============================================================================

  private toDbCardType(type: string): PrismaCardType {
    return type.toUpperCase() as PrismaCardType;
  }

  private fromDbCardType(type: string): string {
    return type.toLowerCase();
  }

  private toDbState(state: string): PrismaCardState {
    return state.toUpperCase() as PrismaCardState;
  }

  private toDbDifficulty(difficulty: string): PrismaDifficultyLevel {
    return difficulty.toUpperCase() as PrismaDifficultyLevel;
  }

  private toDbSource(source: string): PrismaEventSource {
    return source.toUpperCase() as PrismaEventSource;
  }
}
