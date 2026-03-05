/**
 * @noema/content-service - Cached Content Repository
 *
 * Decorates IContentRepository with read-through caching via Redis.
 * All reads go through cache (get-or-load pattern).
 * All writes delegate to the inner repository then invalidate relevant cache entries.
 *
 * Cache key scheme:
 *   card:{cardId}                — individual card lookups (TTL: cardTtl)
 *   query:{userId}:{queryHash}   — paginated query results (TTL: queryTtl)
 *
 * Invalidation strategy:
 *   On any write mutation, delete the card's cache key + SCAN-delete all
 *   query keys for the affected user.
 */

import type { CardId, IPaginatedResponse, UserId } from '@noema/types';
import { createHash } from 'node:crypto';
import type {
  IBatchSummary,
  IContentRepository,
} from '../../domain/content-service/content.repository.js';
import type {
  IBatchCreateResult,
  ICard,
  ICardStats,
  ICardSummary,
  IChangeCardStateInput,
  ICreateCardInput,
  ICursorPaginatedResponse,
  IDeckQuery,
  IUpdateCardInput,
} from '../../types/content.types.js';
import type { RedisCacheProvider } from './redis-cache.provider.js';

// ============================================================================
// Cached Content Repository
// ============================================================================

export class CachedContentRepository implements IContentRepository {
  constructor(
    private readonly inner: IContentRepository,
    private readonly cache: RedisCacheProvider,
    private readonly cardTtl: number,
    private readonly queryTtl: number
  ) {}

  // ============================================================================
  // Cached Reads
  // ============================================================================

  async findById(id: CardId): Promise<ICard | null> {
    return this.cache.getOrLoad(this.cache.cardKey(id), this.cardTtl, () =>
      this.inner.findById(id)
    );
  }

  async findByIdForUser(id: CardId, userId: UserId): Promise<ICard | null> {
    const card = await this.cache.getOrLoad(this.cache.cardKey(id), this.cardTtl, () =>
      this.inner.findByIdForUser(id, userId)
    );
    // Guard: if the cached card belongs to a different user, treat as miss
    if (card !== null && card.userId !== userId) {
      return null;
    }
    return card;
  }

  async query(query: IDeckQuery, userId: UserId): Promise<IPaginatedResponse<ICardSummary>> {
    const queryHash = createHash('md5').update(JSON.stringify(query)).digest('hex').slice(0, 12);
    return this.cache.getOrLoad(this.cache.queryKey(userId, queryHash), this.queryTtl, () =>
      this.inner.query(query, userId)
    );
  }

  async queryCursor(
    query: IDeckQuery,
    userId: UserId,
    cursor?: string,
    limit?: number,
    direction?: 'forward' | 'backward'
  ): Promise<ICursorPaginatedResponse<ICardSummary>> {
    // Cursor queries are inherently positional — don't cache
    return this.inner.queryCursor(query, userId, cursor, limit, direction);
  }

  async count(query: IDeckQuery, userId: UserId): Promise<number> {
    // Count is cheap, don't cache
    return this.inner.count(query, userId);
  }

  async findByIds(ids: CardId[], userId: UserId): Promise<ICard[]> {
    // Multi-get is not cached for simplicity
    return this.inner.findByIds(ids, userId);
  }

  async findByContentHash(userId: UserId, contentHash: string): Promise<ICard | null> {
    return this.inner.findByContentHash(userId, contentHash);
  }

  async findByContentHashes(userId: UserId, contentHashes: string[]): Promise<ICard[]> {
    return this.inner.findByContentHashes(userId, contentHashes);
  }

  // ============================================================================
  // Writes (Delegate + Invalidate)
  // ============================================================================

  async create(
    input: ICreateCardInput & { id: CardId; userId: UserId; contentHash?: string }
  ): Promise<ICard> {
    const card = await this.inner.create(input);
    await this.invalidateForUser(card.userId);
    return card;
  }

  async createBatch(
    inputs: (ICreateCardInput & { id: CardId; userId: UserId; contentHash?: string })[]
  ): Promise<IBatchCreateResult> {
    const result = await this.inner.createBatch(inputs);
    const userIds = new Set(inputs.map((i) => i.userId));
    await Promise.all([...userIds].map((uid) => this.invalidateForUser(uid)));
    return result;
  }

  async update(
    id: CardId,
    input: IUpdateCardInput,
    version: number,
    userId?: UserId,
    contentHash?: string
  ): Promise<ICard> {
    const card = await this.inner.update(id, input, version, userId, contentHash);
    await this.cache.del(this.cache.cardKey(id));
    await this.invalidateForUser(card.userId);
    return card;
  }

  async changeState(
    id: CardId,
    input: IChangeCardStateInput,
    version: number,
    userId?: UserId
  ): Promise<ICard> {
    const card = await this.inner.changeState(id, input, version, userId);
    await this.cache.del(this.cache.cardKey(id));
    await this.invalidateForUser(card.userId);
    return card;
  }

  async softDelete(id: CardId, version: number, userId?: UserId): Promise<void> {
    const card = await this.inner.findById(id);
    await this.inner.softDelete(id, version, userId);
    await this.cache.del(this.cache.cardKey(id));
    if (card) await this.invalidateForUser(card.userId);
  }

  async hardDelete(id: CardId): Promise<void> {
    const card = await this.inner.findById(id);
    await this.inner.hardDelete(id);
    await this.cache.del(this.cache.cardKey(id));
    if (card) await this.invalidateForUser(card.userId);
  }

  async restore(id: CardId, userId: UserId): Promise<ICard> {
    const card = await this.inner.restore(id, userId);
    await this.cache.del(this.cache.cardKey(id));
    await this.invalidateForUser(card.userId);
    return card;
  }

  async updateTags(id: CardId, tags: string[], version: number, userId?: UserId): Promise<ICard> {
    const card = await this.inner.updateTags(id, tags, version, userId);
    await this.cache.del(this.cache.cardKey(id));
    await this.invalidateForUser(card.userId);
    return card;
  }

  async updateKnowledgeNodeIds(
    id: CardId,
    knowledgeNodeIds: string[],
    version: number,
    userId?: UserId
  ): Promise<ICard> {
    const card = await this.inner.updateKnowledgeNodeIds(id, knowledgeNodeIds, version, userId);
    await this.cache.del(this.cache.cardKey(id));
    await this.invalidateForUser(card.userId);
    return card;
  }

  // ============================================================================
  // Statistics (Cache with short TTL)
  // ============================================================================

  async getStats(userId: UserId): Promise<ICardStats> {
    const statsKey = `stats:${userId}`;
    const STATS_TTL = 60; // 60 seconds
    return this.cache.getOrLoad(statsKey, STATS_TTL, () => this.inner.getStats(userId));
  }

  // ============================================================================
  // Batch Recovery (Pass-Through + Invalidate)
  // ============================================================================

  async findByBatchId(batchId: string, userId: UserId): Promise<ICard[]> {
    return this.inner.findByBatchId(batchId, userId);
  }

  async softDeleteByBatchId(batchId: string, userId: UserId): Promise<number> {
    const count = await this.inner.softDeleteByBatchId(batchId, userId);
    if (count > 0) {
      await this.invalidateForUser(userId);
    }
    return count;
  }

  findRecentBatches(userId: UserId, limit?: number): Promise<IBatchSummary[]> {
    return this.inner.findRecentBatches(userId, limit);
  }

  // ============================================================================
  // Invalidation
  // ============================================================================

  private async invalidateForUser(userId: UserId): Promise<void> {
    await this.cache.delPattern(this.cache.userPattern(userId));
  }
}
