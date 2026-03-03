/**
 * @noema/session-service - Prisma User Streak Repository (Phase 5, T5.4)
 *
 * Prisma-backed implementation of IUserStreakRepository.
 * Manages the user_streaks materialized cache and completed-session queries.
 */

import type { UserId } from '@noema/types';
import type { Logger } from 'pino';
import type { Prisma, PrismaClient } from '../../../generated/prisma/index.js';

import type { IUserStreakRepository } from '../../domain/session-service/streak.repository.js';
import type { ICompletedSessionSummary, IUserStreak } from '../../types/index.js';

// ============================================================================
// Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toStreakDomain(row: any): IUserStreak {
  return {
    userId: row.userId as string,
    currentStreak: row.currentStreak,
    longestStreak: row.longestStreak,
    lastActiveDate: formatDate(row.lastActiveDate),
    timezone: row.timezone,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Format a Date object to YYYY-MM-DD string.
 * The date is stored as a `@db.Date` in Prisma, which returns a JS Date
 * at midnight UTC. We format it without timezone conversion.
 */
function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse a YYYY-MM-DD string to a Date at midnight UTC.
 */
function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

// ============================================================================
// Repository
// ============================================================================

export class PrismaUserStreakRepository implements IUserStreakRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger
  ) {}

  private db(tx?: Prisma.TransactionClient): PrismaClient | Prisma.TransactionClient {
    return tx ?? this.prisma;
  }

  async findByUserId(userId: UserId): Promise<IUserStreak | null> {
    const row = await this.prisma.userStreak.findUnique({
      where: { userId },
    });
    return row ? toStreakDomain(row) : null;
  }

  async upsert(
    userId: UserId,
    data: {
      currentStreak: number;
      longestStreak: number;
      lastActiveDate: string;
      timezone: string;
    },
    tx?: Prisma.TransactionClient
  ): Promise<IUserStreak> {
    const lastActiveDate = parseDate(data.lastActiveDate);

    const row = await this.db(tx).userStreak.upsert({
      where: { userId },
      create: {
        userId,
        currentStreak: data.currentStreak,
        longestStreak: data.longestStreak,
        lastActiveDate,
        timezone: data.timezone,
      },
      update: {
        currentStreak: data.currentStreak,
        longestStreak: data.longestStreak,
        lastActiveDate,
        timezone: data.timezone,
      },
    });

    return toStreakDomain(row);
  }

  async findCompletedSessionsInRange(
    userId: UserId,
    afterDate: string,
    beforeDate: string
  ): Promise<ICompletedSessionSummary[]> {
    const rows = await this.prisma.session.findMany({
      where: {
        userId,
        state: 'COMPLETED',
        completedAt: {
          gte: new Date(afterDate),
          lt: new Date(beforeDate),
        },
      },
      select: {
        id: true,
        completedAt: true,
        stats: true,
        startedAt: true,
        lastActivityAt: true,
        totalPausedDurationMs: true,
      },
      orderBy: { completedAt: 'asc' },
    });

    return rows.map((row) => {
      const stats = (row.stats ?? {}) as Record<string, unknown>;
      const totalAttempts =
        typeof stats['totalAttempts'] === 'number' ? stats['totalAttempts'] : 0;

      // Duration = lastActivityAt - startedAt - totalPausedDurationMs
      const startMs = row.startedAt.getTime();
      const endMs = row.completedAt
        ? row.completedAt.getTime()
        : row.lastActivityAt.getTime();
      const durationMs = Math.max(0, endMs - startMs - row.totalPausedDurationMs);

      return {
        id: row.id,
        completedAt: row.completedAt?.toISOString() ?? row.lastActivityAt.toISOString(),
        totalAttempts,
        durationMs,
      };
    });
  }

  async deleteByUserId(userId: UserId, tx?: Prisma.TransactionClient): Promise<void> {
    try {
      await this.db(tx).userStreak.delete({ where: { userId } });
    } catch {
      // Row may not exist — that's fine
      this.logger.debug({ userId }, 'No streak record to delete');
    }
  }
}
