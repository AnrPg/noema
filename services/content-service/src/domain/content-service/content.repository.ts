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
  ICardSummary,
  IChangeCardStateInput,
  ICreateCardInput,
  IDeckQuery,
  IUpdateCardInput,
} from '../../types/content.types.js';

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
   * Count cards matching a DeckQuery.
   */
  count(query: IDeckQuery, userId: UserId): Promise<number>;

  /**
   * Find multiple cards by IDs.
   * @returns Found cards (may be fewer than requested if some don't exist)
   */
  findByIds(ids: CardId[], userId: UserId): Promise<ICard[]>;

  // ============================================================================
  // Write Operations
  // ============================================================================

  /**
   * Create a new card.
   * @returns Created card
   */
  create(input: ICreateCardInput & { id: CardId; userId: UserId }): Promise<ICard>;

  /**
   * Create multiple cards in a batch.
   * Uses a transaction; individual failures don't roll back the entire batch.
   */
  createBatch(
    inputs: Array<ICreateCardInput & { id: CardId; userId: UserId }>
  ): Promise<IBatchCreateResult>;

  /**
   * Update a card.
   * Uses optimistic locking.
   * @returns Updated card
   */
  update(id: CardId, input: IUpdateCardInput, version: number): Promise<ICard>;

  /**
   * Change card state.
   * Uses optimistic locking.
   * @returns Updated card
   */
  changeState(id: CardId, input: IChangeCardStateInput, version: number): Promise<ICard>;

  /**
   * Soft-delete a card.
   */
  softDelete(id: CardId, version: number): Promise<void>;

  /**
   * Hard-delete a card (permanent, admin only).
   */
  hardDelete(id: CardId): Promise<void>;

  /**
   * Update tags on a card.
   * Uses optimistic locking.
   * @returns Updated card
   */
  updateTags(id: CardId, tags: string[], version: number): Promise<ICard>;

  /**
   * Update node linkage on a card.
   * Uses optimistic locking.
   * @returns Updated card
   */
  updateNodeIds(id: CardId, nodeIds: string[], version: number): Promise<ICard>;
}
