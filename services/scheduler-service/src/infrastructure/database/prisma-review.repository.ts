/**
 * @noema/scheduler-service - Prisma Review Repository
 */

import type { CardId, UserId } from '@noema/types';
import {
  Prisma,
  type PrismaClient,
  type Rating as PrismaRating,
  type Review as PrismaReview,
  type SchedulerLane as PrismaSchedulerLane,
} from '../../../generated/prisma/index.js';
import type { IReviewRepository } from '../../domain/scheduler-service/scheduler.repository.js';
import type {
  IPaginationParams,
  IReview,
  IReviewExtendedFilters,
  IReviewFilters,
  IReviewStatsResponse,
  ISortParams,
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

  // ---------- Phase 3: Paginated Read + Aggregation ----------

  async findByUserPaginated(
    userId: UserId,
    filters: IReviewExtendedFilters,
    pagination: IPaginationParams,
    sort: ISortParams<'reviewedAt' | 'responseTime' | 'rating'>
  ): Promise<IReview[]> {
    const where = this.buildExtendedWhere(userId, filters);
    const orderBy = this.buildOrderBy(sort);

    const reviews = await this.prisma.review.findMany({
      where,
      orderBy,
      take: pagination.limit,
      skip: pagination.offset,
    });

    return reviews.map(toDomain);
  }

  async countByUserFiltered(userId: UserId, filters: IReviewExtendedFilters): Promise<number> {
    const where = this.buildExtendedWhere(userId, filters);
    return this.prisma.review.count({ where });
  }

  async aggregateStats(
    userId: UserId,
    filters: IReviewExtendedFilters
  ): Promise<Omit<IReviewStatsResponse, 'reviewsByDay'>> {
    const where = this.buildExtendedWhere(userId, filters);

    // Run aggregate + groupBy queries in parallel
    const [aggregate, ratingGroups, outcomeGroups] = await Promise.all([
      this.prisma.review.aggregate({
        where,
        _count: { id: true },
        _avg: { responseTime: true, deltaDays: true },
      }),
      this.prisma.review.groupBy({
        by: ['rating'],
        where,
        _count: { id: true },
      }),
      this.prisma.review.groupBy({
        by: ['outcome'],
        where,
        _count: { id: true },
      }),
    ]);

    const ratingDist = { again: 0, hard: 0, good: 0, easy: 0 };
    for (const group of ratingGroups) {
      const key = group.rating.toLowerCase() as keyof typeof ratingDist;
      if (key in ratingDist) {
        ratingDist[key] = group._count.id;
      }
    }

    const outcomeDist = { correct: 0, incorrect: 0, partial: 0, skipped: 0 };
    for (const group of outcomeGroups) {
      const key = group.outcome.toLowerCase() as keyof typeof outcomeDist;
      if (key in outcomeDist) {
        outcomeDist[key] = group._count.id;
      }
    }

    // Compute average calibration delta from reviews that have both confidence values
    let averageCalibrationDelta: number | null = null;
    const calibrationAgg = await this.prisma.review.aggregate({
      where: {
        ...where,
        confidenceBefore: { not: null },
        confidenceAfter: { not: null },
      },
      _avg: { confidenceBefore: true, confidenceAfter: true },
      _count: { id: true },
    });
    if (
      calibrationAgg._count.id > 0 &&
      calibrationAgg._avg.confidenceAfter !== null &&
      calibrationAgg._avg.confidenceBefore !== null
    ) {
      averageCalibrationDelta =
        calibrationAgg._avg.confidenceAfter - calibrationAgg._avg.confidenceBefore;
    }

    return {
      totalReviews: aggregate._count.id,
      averageResponseTimeMs: aggregate._avg.responseTime ?? null,
      ratingDistribution: ratingDist,
      outcomeDistribution: outcomeDist,
      averageCalibrationDelta,
      averageInterval: aggregate._avg.deltaDays ?? null,
    };
  }

  async reviewsByDay(
    userId: UserId,
    filters: IReviewExtendedFilters
  ): Promise<Array<{ date: string; count: number }>> {
    // Use raw query for date truncation grouping (Prisma doesn't support groupBy on date parts)
    const results = await this.prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
      SELECT DATE_TRUNC('day', reviewed_at) AS date, COUNT(*)::bigint AS count
      FROM reviews
      WHERE user_id = ${userId}
        ${filters.startDate !== undefined ? Prisma.sql`AND reviewed_at >= ${filters.startDate}` : Prisma.empty}
        ${filters.endDate !== undefined ? Prisma.sql`AND reviewed_at <= ${filters.endDate}` : Prisma.empty}
        ${filters.cardId !== undefined ? Prisma.sql`AND card_id = ${filters.cardId}` : Prisma.empty}
        ${filters.lane !== undefined ? Prisma.sql`AND lane = CAST(${filters.lane.toUpperCase()} AS "scheduler_lane")` : Prisma.empty}
        ${filters.rating !== undefined ? Prisma.sql`AND rating = CAST(${filters.rating.toUpperCase()} AS "Rating")` : Prisma.empty}
        ${filters.outcome !== undefined ? Prisma.sql`AND outcome = ${filters.outcome}` : Prisma.empty}
        ${filters.sessionId !== undefined ? Prisma.sql`AND session_id = ${filters.sessionId}` : Prisma.empty}
        ${filters.schedulingAlgorithm !== undefined ? Prisma.sql`AND scheduling_algorithm = ${filters.schedulingAlgorithm}` : Prisma.empty}
      GROUP BY DATE_TRUNC('day', reviewed_at)
      ORDER BY date ASC
    `;

    return results.map((row) => ({
      date: new Date(row.date).toISOString().split('T')[0] ?? new Date(row.date).toISOString(),
      count: Number(row.count),
    }));
  }

  // ---------- Private Helpers ----------

  private buildExtendedWhere(
    userId: string,
    filters: IReviewExtendedFilters
  ): Prisma.ReviewWhereInput {
    const where: Prisma.ReviewWhereInput = { userId };

    if (filters.cardId !== undefined) {
      where.cardId = filters.cardId;
    }
    if (filters.sessionId !== undefined && filters.sessionId !== '') {
      where.sessionId = filters.sessionId;
    }
    if (filters.lane !== undefined) {
      where.lane = toPrismaLane(filters.lane);
    }
    if (filters.schedulingAlgorithm !== undefined && filters.schedulingAlgorithm !== '') {
      where.schedulingAlgorithm = filters.schedulingAlgorithm;
    }
    if (filters.rating !== undefined) {
      where.rating = toPrismaRating(filters.rating);
    }
    if (filters.outcome !== undefined && filters.outcome !== '') {
      where.outcome = filters.outcome;
    }
    if (filters.startDate !== undefined || filters.endDate !== undefined) {
      where.reviewedAt = {};
      if (filters.startDate !== undefined) {
        (where.reviewedAt as { gte?: Date; lte?: Date }).gte = filters.startDate;
      }
      if (filters.endDate !== undefined) {
        (where.reviewedAt as { gte?: Date; lte?: Date }).lte = filters.endDate;
      }
    }

    return where;
  }

  private buildOrderBy(
    sort: ISortParams<'reviewedAt' | 'responseTime' | 'rating'>
  ): Record<string, 'asc' | 'desc'> {
    const fieldMap: Record<string, string> = {
      reviewedAt: 'reviewedAt',
      responseTime: 'responseTime',
      rating: 'ratingValue',
    };

    const field = fieldMap[sort.sortBy] ?? 'reviewedAt';
    return { [field]: sort.sortOrder };
  }
}
