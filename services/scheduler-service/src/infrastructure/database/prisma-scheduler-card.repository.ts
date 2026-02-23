/**
 * @noema/scheduler-service - Prisma Scheduler Card Repository
 *
 * PostgreSQL implementation of ISchedulerCardRepository using Prisma.
 * Handles mapping between Prisma enum values (UPPERCASE) and domain enum values (lowercase).
 */

import type { CardId, UserId } from '@noema/types';
import { randomUUID } from 'node:crypto';
import type {
  PrismaClient,
  SchedulerCard as PrismaSchedulerCard,
  SchedulerCardState as PrismaSchedulerCardState,
  SchedulerLane as PrismaSchedulerLane,
} from '../../../generated/prisma/index.js';
import type { ISchedulerCardRepository } from '../../domain/scheduler-service/scheduler.repository.js';
import type {
  ISchedulerCard,
  ISchedulerCardFilters,
  SchedulerCardState,
  SchedulerLane,
} from '../../types/scheduler.types.js';

// ============================================================================
// Enum Mapping Helpers
// ============================================================================

function toPrismaLane(lane: string): PrismaSchedulerLane {
  return lane.toUpperCase() as PrismaSchedulerLane;
}

function fromPrismaLane(lane: PrismaSchedulerLane): SchedulerLane {
  return lane.toLowerCase() as SchedulerLane;
}

function toPrismaState(state: string): PrismaSchedulerCardState {
  return state.toUpperCase() as PrismaSchedulerCardState;
}

function fromPrismaState(state: PrismaSchedulerCardState): SchedulerCardState {
  return state.toLowerCase() as SchedulerCardState;
}

// ============================================================================
// Domain Mapping
// ============================================================================

function toDomain(row: PrismaSchedulerCard): ISchedulerCard {
  return {
    id: row.id,
    cardId: row.cardId as CardId,
    userId: row.userId as UserId,
    lane: fromPrismaLane(row.lane),
    stability: row.stability,
    difficultyParameter: row.difficultyParameter,
    halfLife: row.halfLife,
    interval: row.interval,
    nextReviewDate: row.nextReviewDate.toISOString(),
    lastReviewedAt: row.lastReviewedAt?.toISOString() ?? null,
    reviewCount: row.reviewCount,
    lapseCount: row.lapseCount,
    consecutiveCorrect: row.consecutiveCorrect,
    schedulingAlgorithm: row.schedulingAlgorithm,
    cardType: row.cardType,
    difficulty: row.difficulty,
    knowledgeNodeIds: row.knowledgeNodeIds,
    state: fromPrismaState(row.state),
    suspendedUntil: row.suspendedUntil?.toISOString() ?? null,
    suspendedReason: row.suspendedReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}

// ============================================================================
// Repository Implementation
// ============================================================================

export class PrismaSchedulerCardRepository implements ISchedulerCardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByCard(userId: UserId, cardId: CardId): Promise<ISchedulerCard | null> {
    const card = await this.prisma.schedulerCard.findUnique({
      where: { userId_cardId: { userId, cardId } },
    });
    return card ? toDomain(card) : null;
  }

  async getByCard(userId: UserId, cardId: CardId): Promise<ISchedulerCard> {
    const card = await this.findByCard(userId, cardId);
    if (!card) {
      throw new Error(`SchedulerCard not found: user=${userId}, card=${cardId}`);
    }
    return card;
  }

  async findByUser(userId: UserId, filters?: ISchedulerCardFilters): Promise<ISchedulerCard[]> {
    const where: {
      userId: string;
      lane?: PrismaSchedulerLane;
      state?: PrismaSchedulerCardState;
      nextReviewDate?: { lte: Date };
      schedulingAlgorithm?: string;
    } = { userId };

    if (filters?.lane !== undefined) {
      where.lane = toPrismaLane(filters.lane);
    }
    if (filters?.state !== undefined) {
      where.state = toPrismaState(filters.state);
    }
    if (filters?.dueBefore !== undefined) {
      where.nextReviewDate = { lte: filters.dueBefore };
    }
    if (filters?.schedulingAlgorithm !== undefined && filters.schedulingAlgorithm !== '') {
      where.schedulingAlgorithm = filters.schedulingAlgorithm;
    }

    const cards = await this.prisma.schedulerCard.findMany({ where });
    return cards.map(toDomain);
  }

  async findDueCards(
    userId: UserId,
    beforeDate: Date,
    limit?: number,
    lane?: SchedulerLane
  ): Promise<ISchedulerCard[]> {
    const where: {
      userId: string;
      nextReviewDate: { lte: Date };
      state: { not: PrismaSchedulerCardState };
      lane?: PrismaSchedulerLane;
    } = {
      userId,
      nextReviewDate: { lte: beforeDate },
      state: { not: 'SUSPENDED' },
    };

    if (lane !== undefined) {
      where.lane = toPrismaLane(lane);
    }

    const cards = await this.prisma.schedulerCard.findMany({
      where,
      orderBy: { nextReviewDate: 'asc' },
      ...(limit !== undefined && { take: limit }),
    });

    return cards.map(toDomain);
  }

  async findByLane(userId: UserId, lane: SchedulerLane, limit?: number): Promise<ISchedulerCard[]> {
    const cards = await this.prisma.schedulerCard.findMany({
      where: { userId, lane: toPrismaLane(lane) },
      orderBy: { nextReviewDate: 'asc' },
      ...(limit !== undefined && { take: limit }),
    });
    return cards.map(toDomain);
  }

  async findByState(
    userId: UserId,
    state: SchedulerCardState,
    limit?: number
  ): Promise<ISchedulerCard[]> {
    const cards = await this.prisma.schedulerCard.findMany({
      where: { userId, state: toPrismaState(state) },
      ...(limit !== undefined && { take: limit }),
    });
    return cards.map(toDomain);
  }

  async count(userId: UserId, filters?: ISchedulerCardFilters): Promise<number> {
    const where: {
      userId: string;
      lane?: PrismaSchedulerLane;
      state?: PrismaSchedulerCardState;
      nextReviewDate?: { lte: Date };
      schedulingAlgorithm?: string;
    } = { userId };

    if (filters?.lane !== undefined) {
      where.lane = toPrismaLane(filters.lane);
    }
    if (filters?.state !== undefined) {
      where.state = toPrismaState(filters.state);
    }
    if (filters?.dueBefore !== undefined) {
      where.nextReviewDate = { lte: filters.dueBefore };
    }
    if (filters?.schedulingAlgorithm !== undefined && filters.schedulingAlgorithm !== '') {
      where.schedulingAlgorithm = filters.schedulingAlgorithm;
    }

    return this.prisma.schedulerCard.count({ where });
  }

  async countDue(userId: UserId, beforeDate: Date, lane?: SchedulerLane): Promise<number> {
    const where: {
      userId: string;
      nextReviewDate: { lte: Date };
      state: { not: PrismaSchedulerCardState };
      lane?: PrismaSchedulerLane;
    } = {
      userId,
      nextReviewDate: { lte: beforeDate },
      state: { not: 'SUSPENDED' },
    };

    if (lane !== undefined) {
      where.lane = toPrismaLane(lane);
    }

    return this.prisma.schedulerCard.count({ where });
  }

  async create(card: Omit<ISchedulerCard, 'createdAt' | 'updatedAt'>): Promise<ISchedulerCard> {
    const created = await this.prisma.schedulerCard.create({
      data: {
        id: card.id !== '' ? card.id : `sc_${randomUUID()}`,
        cardId: card.cardId,
        userId: card.userId,
        lane: toPrismaLane(card.lane),
        stability: card.stability,
        difficultyParameter: card.difficultyParameter,
        halfLife: card.halfLife,
        interval: card.interval,
        nextReviewDate: new Date(card.nextReviewDate),
        lastReviewedAt:
          card.lastReviewedAt !== null && card.lastReviewedAt !== ''
            ? new Date(card.lastReviewedAt)
            : null,
        reviewCount: card.reviewCount,
        lapseCount: card.lapseCount,
        consecutiveCorrect: card.consecutiveCorrect,
        schedulingAlgorithm: card.schedulingAlgorithm,
        cardType: card.cardType,
        difficulty: card.difficulty,
        knowledgeNodeIds: card.knowledgeNodeIds,
        state: toPrismaState(card.state),
        suspendedUntil:
          card.suspendedUntil !== null && card.suspendedUntil !== ''
            ? new Date(card.suspendedUntil)
            : null,
        suspendedReason: card.suspendedReason,
        version: card.version,
      },
    });

    return toDomain(created);
  }

  async update(
    userId: UserId,
    cardId: CardId,
    data: Partial<
      Pick<
        ISchedulerCard,
        | 'lane'
        | 'stability'
        | 'difficultyParameter'
        | 'halfLife'
        | 'interval'
        | 'nextReviewDate'
        | 'lastReviewedAt'
        | 'reviewCount'
        | 'lapseCount'
        | 'consecutiveCorrect'
        | 'schedulingAlgorithm'
        | 'state'
        | 'suspendedUntil'
        | 'suspendedReason'
      >
    >,
    expectedVersion: number
  ): Promise<ISchedulerCard> {
    // First check version
    const existing = await this.prisma.schedulerCard.findUnique({
      where: { userId_cardId: { userId, cardId } },
    });

    if (!existing) {
      throw new Error(`SchedulerCard not found: user=${userId}, card=${cardId}`);
    }

    if (existing.version !== expectedVersion) {
      throw new Error(
        `Version conflict: expected ${String(expectedVersion)}, found ${String(existing.version)}`
      );
    }

    // Build update data
    const updateData: {
      lane?: PrismaSchedulerLane;
      stability?: number | null;
      difficultyParameter?: number | null;
      halfLife?: number | null;
      interval?: number;
      nextReviewDate?: Date;
      lastReviewedAt?: Date | null;
      reviewCount?: number;
      lapseCount?: number;
      consecutiveCorrect?: number;
      schedulingAlgorithm?: string;
      state?: PrismaSchedulerCardState;
      suspendedUntil?: Date | null;
      suspendedReason?: string | null;
      version: { increment: number };
    } = {
      version: { increment: 1 },
    };

    if (data.lane !== undefined) {
      updateData.lane = toPrismaLane(data.lane);
    }
    if (data.stability !== undefined) {
      updateData.stability = data.stability;
    }
    if (data.difficultyParameter !== undefined) {
      updateData.difficultyParameter = data.difficultyParameter;
    }
    if (data.halfLife !== undefined) {
      updateData.halfLife = data.halfLife;
    }
    if (data.interval !== undefined) {
      updateData.interval = data.interval;
    }
    if (data.nextReviewDate !== undefined) {
      updateData.nextReviewDate = new Date(data.nextReviewDate);
    }
    if (data.lastReviewedAt !== undefined) {
      updateData.lastReviewedAt =
        data.lastReviewedAt !== null && data.lastReviewedAt !== ''
          ? new Date(data.lastReviewedAt)
          : null;
    }
    if (data.reviewCount !== undefined) {
      updateData.reviewCount = data.reviewCount;
    }
    if (data.lapseCount !== undefined) {
      updateData.lapseCount = data.lapseCount;
    }
    if (data.consecutiveCorrect !== undefined) {
      updateData.consecutiveCorrect = data.consecutiveCorrect;
    }
    if (data.schedulingAlgorithm !== undefined) {
      updateData.schedulingAlgorithm = data.schedulingAlgorithm;
    }
    if (data.state !== undefined) {
      updateData.state = toPrismaState(data.state);
    }
    if (data.suspendedUntil !== undefined) {
      updateData.suspendedUntil =
        data.suspendedUntil !== null && data.suspendedUntil !== ''
          ? new Date(data.suspendedUntil)
          : null;
    }
    if (data.suspendedReason !== undefined) {
      updateData.suspendedReason = data.suspendedReason;
    }

    const updated = await this.prisma.schedulerCard.update({
      where: { id: existing.id },
      data: updateData,
    });

    return toDomain(updated);
  }

  async delete(userId: UserId, cardId: CardId): Promise<void> {
    const existing = await this.prisma.schedulerCard.findUnique({
      where: { userId_cardId: { userId, cardId } },
      select: { id: true },
    });
    if (!existing) {
      return;
    }

    await this.prisma.schedulerCard.delete({
      where: { id: existing.id },
    });
  }

  async createBatch(
    cards: Omit<ISchedulerCard, 'createdAt' | 'updatedAt'>[]
  ): Promise<ISchedulerCard[]> {
    const created = await Promise.all(cards.map((card) => this.create(card)));
    return created;
  }
}
