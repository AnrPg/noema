/**
 * @noema/content-service - History Repository Interface
 *
 * Abstract repository interface for card version history.
 * Stores point-in-time snapshots captured before each mutation.
 */

import type { CardId, UserId } from '@noema/types';
import type { CardHistoryChangeType, ICard, ICardHistory } from '../../types/content.types.js';

// ============================================================================
// History Repository Interface
// ============================================================================

export interface IHistoryRepository {
  /**
   * Create a history snapshot from the current card state.
   * @param card - The card state BEFORE the mutation
   * @param changeType - What kind of change is about to happen
   * @param changedBy - User ID performing the change
   * @returns Created history entry
   */
  createSnapshot(
    card: ICard,
    changeType: CardHistoryChangeType,
    changedBy: UserId
  ): Promise<ICardHistory>;

  /**
   * Get version history for a card, ordered newest first.
   * @param cardId - Card ID to get history for
   * @param userId - Owner user ID (authorization)
   * @param limit - Max entries to return (default: 50)
   * @param offset - Pagination offset (default: 0)
   * @returns History entries
   */
  getHistory(
    cardId: CardId,
    userId: UserId,
    limit?: number,
    offset?: number
  ): Promise<{ entries: ICardHistory[]; total: number }>;

  /**
   * Get a specific version snapshot.
   * @param cardId - Card ID
   * @param version - Version number to retrieve
   * @param userId - Owner user ID (authorization)
   * @returns History entry or null
   */
  getVersion(cardId: CardId, version: number, userId: UserId): Promise<ICardHistory | null>;
}
