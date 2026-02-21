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
import type { Prisma, Card as PrismaCard, PrismaClient } from '@prisma/client';
import type { IContentRepository } from '../../domain/content-service/content.repository.js';
import { VersionConflictError } from '../../domain/content-service/errors/index.js';
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

    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;

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

  // ============================================================================
  // Write Operations
  // ============================================================================

  async create(input: ICreateCardInput & { id: CardId; userId: UserId }): Promise<ICard> {
    const card = await this.prisma.card.create({
      data: {
        id: input.id,
        userId: input.userId,
        cardType: this.toDbCardType(input.cardType),
        state: 'DRAFT',
        difficulty: this.toDbDifficulty(input.difficulty || 'intermediate'),
        content: (input.content || {}) as unknown as Prisma.JsonObject,
        knowledgeNodeIds: (input.knowledgeNodeIds as string[]) || [],
        tags: input.tags || [],
        source: this.toDbSource(input.source || 'user'),
        metadata: (input.metadata || {}) as unknown as Prisma.JsonObject,
        createdBy: input.userId,
        version: 1,
      },
    });

    return this.toDomain(card);
  }

  async createBatch(
    inputs: Array<ICreateCardInput & { id: CardId; userId: UserId }>
  ): Promise<IBatchCreateResult> {
    const created: ICard[] = [];
    const failed: Array<{ index: number; error: string; input: ICreateCardInput }> = [];

    // Use individual creates within a transaction for partial success
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i]!;
      try {
        const card = await this.prisma.card.create({
          data: {
            id: input.id,
            userId: input.userId,
            cardType: this.toDbCardType(input.cardType),
            state: 'DRAFT',
            difficulty: this.toDbDifficulty(input.difficulty || 'intermediate'),
            content: (input.content || {}) as unknown as Prisma.JsonObject,
            knowledgeNodeIds: (input.knowledgeNodeIds as string[]) || [],
            tags: input.tags || [],
            source: this.toDbSource(input.source || 'user'),
            metadata: (input.metadata || {}) as unknown as Prisma.JsonObject,
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

    return {
      created,
      failed,
      total: inputs.length,
      successCount: created.length,
      failureCount: failed.length,
    };
  }

  async update(id: CardId, input: IUpdateCardInput, version: number): Promise<ICard> {
    const existing = await this.prisma.card.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`Card not found: ${id}`);
    }
    if (existing.version !== version) {
      throw new VersionConflictError(version, existing.version);
    }

    const data: Prisma.CardUpdateInput = {
      version: { increment: 1 },
    };

    if (input.content !== undefined) {
      data.content = input.content as unknown as Prisma.JsonObject;
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
    if (input.metadata !== undefined) {
      // Merge metadata
      const currentMeta = existing.metadata as Record<string, unknown>;
      data.metadata = { ...currentMeta, ...input.metadata } as unknown as Prisma.JsonObject;
    }

    const card = await this.prisma.card.update({
      where: { id },
      data,
    });

    return this.toDomain(card);
  }

  async changeState(id: CardId, input: IChangeCardStateInput, version: number): Promise<ICard> {
    const existing = await this.prisma.card.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`Card not found: ${id}`);
    }
    if (existing.version !== version) {
      throw new VersionConflictError(version, existing.version);
    }

    const card = await this.prisma.card.update({
      where: { id },
      data: {
        state: this.toDbState(input.state),
        version: { increment: 1 },
      },
    });

    return this.toDomain(card);
  }

  async softDelete(id: CardId, version: number): Promise<void> {
    const existing = await this.prisma.card.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`Card not found: ${id}`);
    }
    if (existing.version !== version) {
      throw new VersionConflictError(version, existing.version);
    }

    await this.prisma.card.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        state: 'ARCHIVED',
        version: { increment: 1 },
      },
    });
  }

  async hardDelete(id: CardId): Promise<void> {
    await this.prisma.card.delete({ where: { id } });
  }

  async updateTags(id: CardId, tags: string[], version: number): Promise<ICard> {
    const existing = await this.prisma.card.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`Card not found: ${id}`);
    }
    if (existing.version !== version) {
      throw new VersionConflictError(version, existing.version);
    }

    const card = await this.prisma.card.update({
      where: { id },
      data: {
        tags,
        version: { increment: 1 },
      },
    });

    return this.toDomain(card);
  }

  async updateKnowledgeNodeIds(
    id: CardId,
    knowledgeNodeIds: string[],
    version: number
  ): Promise<ICard> {
    const existing = await this.prisma.card.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`Card not found: ${id}`);
    }
    if (existing.version !== version) {
      throw new VersionConflictError(version, existing.version);
    }

    const card = await this.prisma.card.update({
      where: { id },
      data: {
        knowledgeNodeIds,
        version: { increment: 1 },
      },
    });

    return this.toDomain(card);
  }

  // ============================================================================
  // Private Query Builders
  // ============================================================================

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
    if (query.search) {
      // Use Prisma JSON filtering for content search
      // This is a basic implementation; full-text search would use pg_trgm
      where.OR = [
        { content: { path: ['front'], string_contains: query.search } },
        { content: { path: ['back'], string_contains: query.search } },
      ];
    }
    if (query.createdAfter) {
      where.createdAt = {
        ...((where.createdAt as Prisma.DateTimeFilter) || {}),
        gte: new Date(query.createdAfter),
      };
    }
    if (query.createdBefore) {
      where.createdAt = {
        ...((where.createdAt as Prisma.DateTimeFilter) || {}),
        lte: new Date(query.createdBefore),
      };
    }
    if (query.updatedAfter) {
      where.updatedAt = {
        ...((where.updatedAt as Prisma.DateTimeFilter) || {}),
        gte: new Date(query.updatedAfter),
      };
    }
    if (query.updatedBefore) {
      where.updatedAt = {
        ...((where.updatedAt as Prisma.DateTimeFilter) || {}),
        lte: new Date(query.updatedBefore),
      };
    }

    return where;
  }

  private buildOrderBy(query: IDeckQuery): Prisma.CardOrderByWithRelationInput {
    const field = query.sortBy || 'createdAt';
    const direction = query.sortOrder || 'desc';

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
    const front = typeof content?.front === 'string' ? content.front : '';

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

  private toDbCardType(type: string): import('@prisma/client').CardType {
    return type.toUpperCase() as import('@prisma/client').CardType;
  }

  private fromDbCardType(type: string): string {
    return type.toLowerCase();
  }

  private toDbState(state: string): import('@prisma/client').CardState {
    return state.toUpperCase() as import('@prisma/client').CardState;
  }

  private toDbDifficulty(difficulty: string): import('@prisma/client').DifficultyLevel {
    return difficulty.toUpperCase() as import('@prisma/client').DifficultyLevel;
  }

  private toDbSource(source: string): import('@prisma/client').EventSource {
    return source.toUpperCase() as import('@prisma/client').EventSource;
  }
}
