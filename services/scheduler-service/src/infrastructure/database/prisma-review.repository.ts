/**
 * @noema/scheduler-service - Prisma Review Repository
 */

import type { CardId, UserId } from '@noema/types';
import type {
  Prisma,
  PrismaClient,
  Rating as PrismaRating,
  Review as PrismaReview,
  SchedulerLane as PrismaSchedulerLane,
} from '../../../generated/prisma/index.js';
import type { IReviewRepository } from '../../domain/scheduler-service/scheduler.repository.js';
import type {
  IReview,
  IReviewFilters,
  Rating,
  SchedulerLane,
} from '../../types/scheduler.types.js';

function toPrismaRating(rating: string): PrismaRating {
  return rating.toUpperCase() as PrismaRating;
}

function fromPrismaRating(rating: PrismaRating): Rating {
  return rating.toLowerCase() as Rating;
}

function toPrismaLane(lane: string): PrismaSchedulerLane {
  return lane.toUpperCase() as PrismaSchedulerLane;
}

function fromPrismaLane(lane: PrismaSchedulerLane): SchedulerLane {
  return lane.toLowerCase() as SchedulerLane;
}

function toDomain(row: PrismaReview): IReview {
  return {
    id: row.id,
    cardId: row.cardId as CardId,
    userId: row.userId as UserId,
    sessionId: row.sessionId,
    attemptId: row.attemptId,
    rating: fromPrismaRating(row.rating),
    ratingValue: row.ratingValue,
    outcome: row.outcome,
    deltaDays: row.deltaDays,
    responseTime: row.responseTime,
    reviewedAt: row.reviewedAt.toISOString(),
    priorState: row.priorState as Record<string, unknown>,
    newState: row.newState as Record<string, unknown>,
    schedulingAlgorithm: row.schedulingAlgorithm,
    lane: fromPrismaLane(row.lane),
    confidenceBefore: row.confidenceBefore,
    confidenceAfter: row.confidenceAfter,
    hintRequestCount: row.hintRequestCount,
    createdAt: row.createdAt.toISOString(),
  };
}

export class PrismaReviewRepository implements IReviewRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<IReview | null> {
    const review = await this.prisma.review.findUnique({ where: { id } });
    return review ? toDomain(review) : null;
  }

  async findByCard(cardId: CardId, limit?: number): Promise<IReview[]> {
    const reviews = await this.prisma.review.findMany({
      where: { cardId },
      orderBy: { reviewedAt: 'desc' },
      ...(limit !== undefined && { take: limit }),
    });
    return reviews.map(toDomain);
  }

  async findByUser(userId: UserId, filters?: IReviewFilters): Promise<IReview[]> {
    const where: {
      userId: string;
      reviewedAt?: { gte?: Date; lte?: Date };
      lane?: PrismaSchedulerLane;
      rating?: PrismaRating;
      sessionId?: string;
    } = { userId };

    if (filters?.startDate !== undefined || filters?.endDate !== undefined) {
      where.reviewedAt = {};
      if (filters.startDate !== undefined) {
        where.reviewedAt.gte = filters.startDate;
      }
      if (filters.endDate !== undefined) {
        where.reviewedAt.lte = filters.endDate;
      }
    }
    if (filters?.lane !== undefined) {
      where.lane = toPrismaLane(filters.lane);
    }
    if (filters?.rating !== undefined) {
      where.rating = toPrismaRating(filters.rating);
    }
    if (filters?.sessionId !== undefined && filters.sessionId !== '') {
      where.sessionId = filters.sessionId;
    }

    const reviews = await this.prisma.review.findMany({ where, orderBy: { reviewedAt: 'desc' } });
    return reviews.map(toDomain);
  }

  async findBySession(sessionId: string): Promise<IReview[]> {
    const reviews = await this.prisma.review.findMany({
      where: { sessionId },
      orderBy: { reviewedAt: 'asc' },
    });
    return reviews.map(toDomain);
  }

  async findByAttemptId(attemptId: string): Promise<IReview | null> {
    const review = await this.prisma.review.findUnique({ where: { attemptId } });
    return review ? toDomain(review) : null;
  }

  async countByCard(cardId: CardId): Promise<number> {
    return this.prisma.review.count({ where: { cardId } });
  }

  async countByUser(userId: UserId, startDate?: Date, endDate?: Date): Promise<number> {
    const where: { userId: string; reviewedAt?: { gte?: Date; lte?: Date } } = { userId };
    if (startDate !== undefined || endDate !== undefined) {
      where.reviewedAt = {};
      if (startDate !== undefined) {
        where.reviewedAt.gte = startDate;
      }
      if (endDate !== undefined) {
        where.reviewedAt.lte = endDate;
      }
    }
    return this.prisma.review.count({ where });
  }

  async create(review: Omit<IReview, 'createdAt'>): Promise<IReview> {
    const created = await this.prisma.review.create({
      data: {
        id: review.id,
        cardId: review.cardId,
        userId: review.userId,
        sessionId: review.sessionId,
        attemptId: review.attemptId,
        rating: toPrismaRating(review.rating),
        ratingValue: review.ratingValue,
        outcome: review.outcome,
        deltaDays: review.deltaDays,
        responseTime: review.responseTime,
        reviewedAt: new Date(review.reviewedAt),
        priorState: review.priorState as Prisma.InputJsonValue,
        newState: review.newState as Prisma.InputJsonValue,
        schedulingAlgorithm: review.schedulingAlgorithm,
        lane: toPrismaLane(review.lane),
        confidenceBefore: review.confidenceBefore,
        confidenceAfter: review.confidenceAfter,
        hintRequestCount: review.hintRequestCount,
      },
    });
    return toDomain(created);
  }

  async createBatch(reviews: Omit<IReview, 'createdAt'>[]): Promise<IReview[]> {
    const created = await Promise.all(reviews.map((review) => this.create(review)));
    return created;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.review.delete({ where: { id } }).catch(() => {
      // Silently ignore if already deleted
    });
  }

  async deleteByUser(userId: UserId): Promise<number> {
    const result = await this.prisma.review.deleteMany({
      where: { userId },
    });
    return result.count;
  }
}
