/**
 * @noema/content-service - Prisma History Repository
 *
 * Implementation of IHistoryRepository using Prisma.
 * Stores full card snapshots before each mutation.
 */

import type {
    CardId,
    CardState,
    CardType,
    DifficultyLevel,
    JsonValue,
    NodeId,
    RemediationCardType,
    UserId,
} from '@noema/types';
import { nanoid } from 'nanoid';
import type { Prisma, PrismaClient } from '../../../generated/prisma/index.js';
import type { IHistoryRepository } from '../../domain/content-service/history.repository.js';
import type {
    CardHistoryChangeType,
    ICard,
    ICardContent,
    ICardHistory,
} from '../../types/content.types.js';

// ============================================================================
// Prisma History Repository
// ============================================================================

export class PrismaHistoryRepository implements IHistoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createSnapshot(
    card: ICard,
    changeType: CardHistoryChangeType,
    changedBy: UserId
  ): Promise<ICardHistory> {
    const id = `hist_${nanoid(21)}`;

    const entry = await this.prisma.cardHistory.create({
      data: {
        id,
        cardId: card.id,
        userId: card.userId,
        version: card.version,
        cardType: card.cardType.toUpperCase() as Parameters<
          typeof this.prisma.cardHistory.create
        >[0]['data']['cardType'],
        state: card.state.toUpperCase() as Parameters<
          typeof this.prisma.cardHistory.create
        >[0]['data']['state'],
        difficulty: card.difficulty.toUpperCase() as Parameters<
          typeof this.prisma.cardHistory.create
        >[0]['data']['difficulty'],
        content: card.content as unknown as Prisma.JsonObject,
        tags: card.tags,
        knowledgeNodeIds: card.knowledgeNodeIds as string[],
        metadata: card.metadata as unknown as Prisma.JsonObject,
        changeType,
        changedBy,
      },
    });

    return this.toDomain(entry);
  }

  async getHistory(
    cardId: CardId,
    userId: UserId,
    limit = 50,
    offset = 0
  ): Promise<{ entries: ICardHistory[]; total: number }> {
    const [entries, total] = await Promise.all([
      this.prisma.cardHistory.findMany({
        where: { cardId, userId },
        orderBy: { version: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.cardHistory.count({
        where: { cardId, userId },
      }),
    ]);

    return {
      entries: entries.map((e) => this.toDomain(e)),
      total,
    };
  }

  async getVersion(
    cardId: CardId,
    version: number,
    userId: UserId
  ): Promise<ICardHistory | null> {
    const entry = await this.prisma.cardHistory.findFirst({
      where: { cardId, version, userId },
    });

    return entry !== null ? this.toDomain(entry) : null;
  }

  // ============================================================================
  // Private Mapping
  // ============================================================================

  private toDomain(entry: {
    id: string;
    cardId: string;
    userId: string;
    version: number;
    cardType: string;
    state: string;
    difficulty: string;
    content: unknown;
    tags: string[];
    knowledgeNodeIds: string[];
    metadata: unknown;
    changeType: string;
    changedBy: string;
    createdAt: Date;
  }): ICardHistory {
    return {
      id: entry.id,
      cardId: entry.cardId as CardId,
      userId: entry.userId as UserId,
      version: entry.version,
      cardType: entry.cardType.toLowerCase() as CardType | RemediationCardType,
      state: entry.state.toLowerCase() as CardState,
      difficulty: entry.difficulty.toLowerCase() as DifficultyLevel,
      content: entry.content as ICardContent,
      tags: entry.tags,
      knowledgeNodeIds: entry.knowledgeNodeIds as NodeId[],
      metadata: entry.metadata as Record<string, JsonValue>,
      changeType: entry.changeType as CardHistoryChangeType,
      changedBy: entry.changedBy,
      createdAt: entry.createdAt.toISOString(),
    };
  }
}
