/**
 * @noema/content-service - Content Repository Interface
 *
 * Abstract repository interface for card data access.
 * Implementations can use Prisma, in-memory, or other storage.
 */

import type { CardId, IPaginatedResponse, UserId } from '@noema/types';
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

// ============================================================================
// Batch Summary
// ============================================================================

/**
 * Summary of a batch of cards, grouped by batchId.
 * Used by GET /v1/cards/batch/recent.
 */
export interface IBatchSummary {
  batchId: string;
  count: number;
  createdAt: string; // ISO string of MAX(created_at) for the batch
}

// ============================================================================
// Repository Interface
// ============================================================================

/**
 * Content repository interface.
 * All card data access goes through this interface.
 */
export interface IContentRepository {
  // ============================================================================
  // Read Operations
  // ============================================================================

  /**
   * Find card by ID.
   * @returns Card or null if not found (excludes soft-deleted)
   */
  findById(id: CardId): Promise<ICard | null>;

  /**
   * Find card by ID, scoped to a user.
   * @returns Card or null if not found
   */
  findByIdForUser(id: CardId, userId: UserId): Promise<ICard | null>;

  /**
   * Query cards using DeckQuery filters with pagination.
   * Returns lightweight summaries for list views.
   */
  query(query: IDeckQuery, userId: UserId): Promise<IPaginatedResponse<ICardSummary>>;

  /**
   * Query cards using cursor-based pagination.
   * More efficient than offset for large result sets (seek method, O(log n)).
   */
  queryCursor(
    query: IDeckQuery,
    userId: UserId,
    cursor?: string,
    limit?: number,
    direction?: 'forward' | 'backward'
  ): Promise<ICursorPaginatedResponse<ICardSummary>>;

  /**
   * Count cards matching a DeckQuery.
   */
  count(query: IDeckQuery, userId: UserId): Promise<number>;

  /**
   * Find multiple cards by IDs.
   * @returns Found cards (may be fewer than requested if some don't exist)
   */
  findByIds(ids: CardId[], userId: UserId): Promise<ICard[]>;

  /**
   * Find a card by its content hash (per-user deduplication).
   * @returns Card or null if no card matches
   */
  findByContentHash(userId: UserId, contentHash: string): Promise<ICard | null>;

  /**
   * Find cards matching any of the given content hashes (per-user).
   * Used for efficient batch deduplication.
   * @returns Cards matching any of the hashes
   */
  findByContentHashes(userId: UserId, contentHashes: string[]): Promise<ICard[]>;

  // ============================================================================
  // Write Operations
  // ============================================================================

  /**
   * Create a new card.
   * @returns Created card
   */
  create(
    input: ICreateCardInput & { id: CardId; userId: UserId; contentHash?: string }
  ): Promise<ICard>;

  /**
   * Create multiple cards in a batch.
   * Uses a transaction; individual failures don't roll back the entire batch.
   */
  createBatch(
    inputs: (ICreateCardInput & { id: CardId; userId: UserId; contentHash?: string })[]
  ): Promise<IBatchCreateResult>;

  /**
   * Update a card.
   * Uses optimistic locking.
   * @returns Updated card
   */
  update(
    id: CardId,
    input: IUpdateCardInput,
    version: number,
    userId?: UserId,
    contentHash?: string
  ): Promise<ICard>;

  /**
   * Change card state.
   * Uses optimistic locking.
   * @returns Updated card
   */
  changeState(
    id: CardId,
    input: IChangeCardStateInput,
    version: number,
    userId?: UserId
  ): Promise<ICard>;

  /**
   * Soft-delete a card.
   */
  softDelete(id: CardId, version: number, userId?: UserId): Promise<void>;

  /**
   * Restore a soft-deleted card (clear deletedAt, set state to DRAFT).
   * @returns Restored card
   */
  restore(id: CardId, userId: UserId): Promise<ICard>;

  /**
   * Hard-delete a card (permanent, admin only).
   */
  hardDelete(id: CardId): Promise<void>;

  /**
   * Update tags on a card.
   * Uses optimistic locking.
   * @returns Updated card
   */
  updateTags(id: CardId, tags: string[], version: number, userId?: UserId): Promise<ICard>;

  /**
   * Update node linkage on a card.
   * Uses optimistic locking.
   * @returns Updated card
   */
  updateKnowledgeNodeIds(
    id: CardId,
    knowledgeNodeIds: string[],
    version: number,
    userId?: UserId
  ): Promise<ICard>;

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get aggregate statistics for a user's card collection.
   */
  getStats(userId: UserId): Promise<ICardStats>;

  // ============================================================================
  // Batch Recovery Operations
  // ============================================================================

  /**
   * Find all cards created in a specific batch.
   * @param batchId - The batch correlation ID stored in metadata._batchId
   * @param userId - Owner user ID
   * @returns Cards belonging to the batch
   */
  findByBatchId(batchId: string, userId: UserId): Promise<ICard[]>;

  /**
   * Soft-delete all cards created in a specific batch.
   * Used for batch rollback when a client needs to undo a batch create.
   * @param batchId - The batch correlation ID
   * @param userId - Owner user ID
   * @returns Number of cards soft-deleted
   */
  softDeleteByBatchId(batchId: string, userId: UserId): Promise<number>;

  /**
   * Find recent batches for a user, grouped by batchId.
   * Returns a summary (batchId, count, newest createdAt) for each batch.
   * @param userId - Owner user ID
   * @param limit - Maximum number of batches to return (default 20)
   */
  findRecentBatches(userId: string, limit?: number): Promise<IBatchSummary[]>;
}
