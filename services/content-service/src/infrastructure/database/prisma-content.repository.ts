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
import { Prisma } from '../../../generated/prisma/index.js';
import type {
  Card as PrismaCard,
  CardState as PrismaCardState,
  CardType as PrismaCardType,
  PrismaClient,
  DifficultyLevel as PrismaDifficultyLevel,
  EventSource as PrismaEventSource,
} from '../../../generated/prisma/index.js';
import type {
  IBatchSummary,
  IContentRepository,
} from '../../domain/content-service/content.repository.js';
import {
  CardNotFoundError,
  VersionConflictError,
} from '../../domain/content-service/errors/index.js';
import { generatePreview } from '../../domain/content-service/value-objects/content.value-objects.js';
import type {
  IBatchCreateResult,
  ICard,
  ICardContent,
  ICardStats,
  ICardSummary,
  IChangeCardStateInput,
  ICreateCardInput,
  ICursorPaginatedResponse,
  IDeckQuery,
  IUpdateCardInput,
} from '../../types/content.types.js';
import { decodeCursor, encodeCursor } from '../../utils/cursor.js';

// ============================================================================
// Raw SQL Row Type (for full-text search queries)
// ============================================================================

/**
 * Shape of a raw SQL row from the cards table.
 * Column names use snake_case (PostgreSQL convention).
 */
interface IRawCardRow {
  id: string;
  user_id: string;
  card_type: string;
  state: string;
  difficulty: string;
  content: unknown;
  knowledge_node_ids: string[];
  tags: string[];
  source: string;
  metadata: unknown;
  content_hash: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  created_by: string | null;
  updated_by: string | null;
  version: number;
  rank?: number;
}

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
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;

    // If search is active, use full-text search with raw SQL
    if (query.search !== undefined && query.search.trim() !== '') {
      return this.queryWithSearch(query, userId, query.search, offset, limit);
    }

    const where = this.buildWhereClause(query, userId);
    const orderBy = this.buildOrderBy(query);
    const isExact = this.isExactNodeMode(query);

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

  async create(
    input: ICreateCardInput & { id: CardId; userId: UserId; contentHash?: string }
  ): Promise<ICard> {
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

  async update(
    id: CardId,
    input: IUpdateCardInput,
    version: number,
    userId?: UserId,
    contentHash?: string
  ): Promise<ICard> {
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

  async changeState(
    id: CardId,
    input: IChangeCardStateInput,
    version: number,
    userId?: UserId
  ): Promise<ICard> {
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

  async restore(id: CardId, userId: UserId): Promise<ICard> {
    // Find the card including soft-deleted
    const existing = await this.prisma.card.findUnique({ where: { id } });
    if (!existing) {
      throw new CardNotFoundError(id);
    }
    if (existing.userId !== userId) {
      throw new CardNotFoundError(id); // Don't leak existence
    }
    if (existing.deletedAt === null) {
      throw new CardNotFoundError(id); // Not deleted — nothing to restore
    }

    const card = await this.prisma.card.update({
      where: { id },
      data: {
        deletedAt: null,
        state: 'DRAFT',
        version: { increment: 1 },
        updatedBy: userId,
      },
    });

    return this.toDomain(card);
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
    userId?: UserId
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
  // Statistics
  // ============================================================================

  async getStats(userId: UserId): Promise<ICardStats> {
    // Run all aggregate queries in parallel
    const [
      totalCards,
      totalDeleted,
      byStateResult,
      byDifficultyResult,
      byCardTypeResult,
      bySourceResult,
      dateRange,
      recentlyUpdated,
    ] = await Promise.all([
      // Total active cards
      this.prisma.card.count({
        where: { userId, deletedAt: null },
      }),
      // Total soft-deleted cards
      this.prisma.card.count({
        where: { userId, deletedAt: { not: null } },
      }),
      // By state
      this.prisma.card.groupBy({
        by: ['state'],
        where: { userId, deletedAt: null },
        _count: true,
      }),
      // By difficulty
      this.prisma.card.groupBy({
        by: ['difficulty'],
        where: { userId, deletedAt: null },
        _count: true,
      }),
      // By card type
      this.prisma.card.groupBy({
        by: ['cardType'],
        where: { userId, deletedAt: null },
        _count: true,
      }),
      // By source
      this.prisma.card.groupBy({
        by: ['source'],
        where: { userId, deletedAt: null },
        _count: true,
      }),
      // Date range (oldest/newest)
      this.prisma.card.aggregate({
        where: { userId, deletedAt: null },
        _min: { createdAt: true },
        _max: { createdAt: true },
      }),
      // Recently updated (last 7 days)
      this.prisma.card.count({
        where: {
          userId,
          deletedAt: null,
          updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    const byState: Record<string, number> = {};
    for (const row of byStateResult) {
      byState[row.state.toLowerCase()] = row._count;
    }

    const byDifficulty: Record<string, number> = {};
    for (const row of byDifficultyResult) {
      byDifficulty[row.difficulty.toLowerCase()] = row._count;
    }

    const byCardType: Record<string, number> = {};
    for (const row of byCardTypeResult) {
      byCardType[row.cardType.toLowerCase()] = row._count;
    }

    const bySource: Record<string, number> = {};
    for (const row of bySourceResult) {
      bySource[row.source.toLowerCase()] = row._count;
    }

    return {
      totalCards,
      totalDeleted,
      byState,
      byDifficulty,
      byCardType,
      bySource,
      oldestCard: dateRange._min.createdAt?.toISOString() ?? null,
      newestCard: dateRange._max.createdAt?.toISOString() ?? null,
      recentlyUpdated,
    };
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
    // Use $transaction with $executeRaw to atomically soft-delete AND increment
    // version. Prisma's updateMany doesn't support `{ increment: 1 }`, so we
    // use raw SQL for the version bump to preserve optimistic locking semantics.
    const count = await this.prisma.$transaction(async (tx) => {
      const result = await tx.$executeRaw`
        UPDATE "cards"
        SET "deleted_at" = NOW(),
            "state" = 'ARCHIVED',
            "updated_by" = ${userId}::varchar,
            "updated_at" = NOW(),
            "version" = "version" + 1
        WHERE "user_id" = ${userId}::varchar
          AND "deleted_at" IS NULL
          AND "metadata" @> ${`{"_batchId":"${batchId}"}`}::jsonb
      `;
      return result;
    });
    return count;
  }

  async findRecentBatches(userId: UserId, limit = 20): Promise<IBatchSummary[]> {
    interface IRawBatchRow {
      batch_id: string;
      count: bigint;
      created_at: Date | string;
    }

    const effectiveLimit = Math.min(limit, 100);

    const rows = await this.prisma.$queryRaw<IRawBatchRow[]>(Prisma.sql`
      SELECT
        metadata->>'_batchId' as batch_id,
        COUNT(*) as count,
        MAX(created_at) as created_at
      FROM cards
      WHERE
        user_id = ${userId}
        AND deleted_at IS NULL
        AND metadata->>'_batchId' IS NOT NULL
      GROUP BY metadata->>'_batchId'
      ORDER BY MAX(created_at) DESC
      LIMIT ${effectiveLimit}
    `);

    return rows.map((row) => ({
      batchId: row.batch_id,
      count: Number(row.count),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    }));
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
  private async handleOptimisticLockError(
    error: unknown,
    id: CardId,
    expectedVersion: number
  ): Promise<never> {
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
    expectedLength: number
  ): Promise<number> {
    const candidates = await this.prisma.card.findMany({
      where,
      select: { id: true, knowledgeNodeIds: true },
    });
    return candidates.filter((c) => c.knowledgeNodeIds.length === expectedLength).length;
  }

  // ============================================================================
  // Full-Text Search (Raw SQL)
  // ============================================================================

  /**
   * Build a PostgreSQL tsquery from a user's search string.
   *
   * Features:
   * - Multi-word AND: "neural network" → "neural & network"
   * - Prefix matching for short terms (≤ 3 chars): "neu" → "neu:*"
   * - Strips non-alphanumeric chars (preserves hyphens and apostrophes)
   */
  private buildTsQuery(searchTerm: string): string {
    const words = searchTerm
      .trim()
      .split(/\s+/)
      .map((word) => word.replace(/[^a-zA-Z0-9'-]/g, ''))
      .filter(Boolean);

    if (words.length === 0) return '';

    return words.map((word) => (word.length <= 3 ? `${word}:*` : word)).join(' & ');
  }

  /**
   * Execute a full-text search query using raw SQL with ts_rank ranking.
   * Falls back to empty results when the tsquery is empty.
   */
  private async queryWithSearch(
    query: IDeckQuery,
    userId: UserId,
    searchTerm: string,
    offset: number,
    limit: number
  ): Promise<IPaginatedResponse<ICardSummary>> {
    const tsQuery = this.buildTsQuery(searchTerm);
    if (tsQuery === '') {
      return { items: [], total: 0, hasMore: false };
    }

    // Build WHERE conditions and parameterized values
    const conditions: string[] = [
      `"user_id" = $1`,
      `"deleted_at" IS NULL`,
      `"search_vector" @@ to_tsquery('english', $2)`,
    ];
    const params: unknown[] = [userId, tsQuery];
    let paramIdx = 3;

    if (query.cardTypes && query.cardTypes.length > 0) {
      const dbTypes = query.cardTypes.map((t) => t.toUpperCase());
      conditions.push(`"card_type"::text = ANY($${paramIdx.toString()}::text[])`);
      params.push(dbTypes);
      paramIdx++;
    }
    if (query.states && query.states.length > 0) {
      const dbStates = query.states.map((s) => s.toUpperCase());
      conditions.push(`"state"::text = ANY($${paramIdx.toString()}::text[])`);
      params.push(dbStates);
      paramIdx++;
    }
    if (query.difficulties && query.difficulties.length > 0) {
      const dbDiffs = query.difficulties.map((d) => d.toUpperCase());
      conditions.push(`"difficulty"::text = ANY($${paramIdx.toString()}::text[])`);
      params.push(dbDiffs);
      paramIdx++;
    }
    if (query.tags && query.tags.length > 0) {
      conditions.push(`"tags" && $${paramIdx.toString()}::text[]`);
      params.push(query.tags);
      paramIdx++;
    }
    if (query.sources && query.sources.length > 0) {
      const dbSources = query.sources.map((s) => s.toUpperCase());
      conditions.push(`"source"::text = ANY($${paramIdx.toString()}::text[])`);
      params.push(dbSources);
      paramIdx++;
    }
    if (query.knowledgeNodeIds && query.knowledgeNodeIds.length > 0) {
      const mode = query.knowledgeNodeIdMode ?? 'any';
      if (mode === 'any' || mode === 'subtree' || mode === 'prerequisites' || mode === 'related') {
        conditions.push(`"knowledge_node_ids" && $${paramIdx.toString()}::text[]`);
        params.push(query.knowledgeNodeIds);
        paramIdx++;
      } else {
        conditions.push(`"knowledge_node_ids" @> $${paramIdx.toString()}::text[]`);
        params.push(query.knowledgeNodeIds);
        paramIdx++;
      }
    }
    if (query.createdAfter !== undefined && query.createdAfter !== '') {
      conditions.push(`"created_at" >= $${paramIdx.toString()}::timestamptz`);
      params.push(new Date(query.createdAfter));
      paramIdx++;
    }
    if (query.createdBefore !== undefined && query.createdBefore !== '') {
      conditions.push(`"created_at" <= $${paramIdx.toString()}::timestamptz`);
      params.push(new Date(query.createdBefore));
      paramIdx++;
    }
    if (query.updatedAfter !== undefined && query.updatedAfter !== '') {
      conditions.push(`"updated_at" >= $${paramIdx.toString()}::timestamptz`);
      params.push(new Date(query.updatedAfter));
      paramIdx++;
    }
    if (query.updatedBefore !== undefined && query.updatedBefore !== '') {
      conditions.push(`"updated_at" <= $${paramIdx.toString()}::timestamptz`);
      params.push(new Date(query.updatedBefore));
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');
    const isExact = this.isExactNodeMode(query);

    // Count query
    const countResult = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) as count FROM "cards" WHERE ${whereClause}`,
      ...params
    );
    let total = Number(countResult[0]?.count ?? 0);

    // For exact mode, the count from raw SQL includes supersets — we must
    // post-filter. For simplicity, fetch all candidates and count accurate matches.
    if (isExact) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by isExactNodeMode()
      const expectedLen = query.knowledgeNodeIds!.length;
      const allRows = await this.prisma.$queryRawUnsafe<IRawCardRow[]>(
        `SELECT *, ts_rank("search_vector", to_tsquery('english', $2)) AS rank
         FROM "cards"
         WHERE ${whereClause}
         ORDER BY rank DESC, "created_at" DESC`,
        ...params
      );
      const filtered = allRows.filter((r) => {
        return r.knowledge_node_ids.length === expectedLen;
      });
      total = filtered.length;
      const items = filtered.slice(offset, offset + limit);
      return {
        items: items.map((r) => this.rawRowToSummary(r)),
        total,
        hasMore: offset + limit < total,
      };
    }

    // Ranked results query
    const rows = await this.prisma.$queryRawUnsafe<IRawCardRow[]>(
      `SELECT *, ts_rank("search_vector", to_tsquery('english', $2)) AS rank
       FROM "cards"
       WHERE ${whereClause}
       ORDER BY rank DESC, "created_at" DESC
       OFFSET $${paramIdx.toString()} LIMIT $${(paramIdx + 1).toString()}`,
      ...params,
      offset,
      limit
    );

    return {
      items: rows.map((r) => this.rawRowToSummary(r)),
      total,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Map a raw SQL row to ICardSummary.
   */
  private rawRowToSummary(row: IRawCardRow): ICardSummary {
    const content = (
      typeof row.content === 'string' ? JSON.parse(row.content) : row.content
    ) as ICardContent;
    const front = typeof content.front === 'string' ? content.front : '';

    return {
      id: row.id as CardId,
      userId: row.user_id as UserId,
      cardType: row.card_type.toLowerCase() as CardType | RemediationCardType,
      state: row.state.toLowerCase() as CardState,
      difficulty: row.difficulty.toLowerCase() as DifficultyLevel,
      preview: generatePreview(front),
      knowledgeNodeIds: row.knowledge_node_ids as NodeId[],
      tags: row.tags,
      source: row.source.toLowerCase() as EventSource,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
      version: row.version,
    };
  }

  // ============================================================================
  // Cursor-Based Pagination
  // ============================================================================

  async queryCursor(
    query: IDeckQuery,
    userId: UserId,
    cursor?: string,
    limit = 20,
    direction: 'forward' | 'backward' = 'forward'
  ): Promise<ICursorPaginatedResponse<ICardSummary>> {
    const where = this.buildWhereClause(query, userId);
    const sortField = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    // Map domain sort field to Prisma column name
    const dbSortField =
      sortField === 'createdAt'
        ? 'createdAt'
        : sortField === 'updatedAt'
          ? 'updatedAt'
          : 'difficulty';

    // Parse cursor if provided
    if (cursor !== undefined && cursor !== '') {
      const cursorData = decodeCursor(cursor);
      if (cursorData) {
        const comparison =
          direction === 'forward'
            ? sortOrder === 'desc'
              ? 'lt'
              : 'gt'
            : sortOrder === 'desc'
              ? 'gt'
              : 'lt';

        const cursorSortValue =
          dbSortField === 'createdAt' || dbSortField === 'updatedAt'
            ? new Date(cursorData.sortValue)
            : cursorData.sortValue;

        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
          {
            OR: [
              { [dbSortField]: { [comparison]: cursorSortValue } },
              {
                [dbSortField]: cursorSortValue,
                id: { [comparison]: cursorData.id },
              },
            ],
          },
        ];
      }
    }

    // Fetch one extra to detect hasMore
    const fetchLimit = limit + 1;
    const cards = await this.prisma.card.findMany({
      where,
      take: fetchLimit,
      orderBy: [{ [dbSortField]: sortOrder }, { id: sortOrder }],
    });

    const hasMore = cards.length > limit;
    const pageCards = hasMore ? cards.slice(0, limit) : cards;

    // Build cursors
    const firstCard = pageCards[0];
    const lastCard = pageCards[pageCards.length - 1];

    const getSortValue = (card: PrismaCard): string => {
      if (dbSortField === 'difficulty') {
        return card.difficulty;
      }
      return (card[dbSortField] as unknown as Date).toISOString();
    };

    return {
      items: pageCards.map((c) => this.toSummary(c)),
      nextCursor:
        hasMore && lastCard
          ? encodeCursor({
              id: lastCard.id,
              sortValue: getSortValue(lastCard),
              sortField,
            })
          : null,
      prevCursor:
        cursor !== undefined && cursor !== '' && firstCard
          ? encodeCursor({
              id: firstCard.id,
              sortValue: getSortValue(firstCard),
              sortField,
            })
          : null,
      hasMore,
    };
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
    // Full-text search is handled by queryWithSearch() via raw SQL.
    // No search filter in the Prisma WHERE clause.
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
