/**
 * @noema/session-service - Streak Service (Phase 5, T5.2/T5.4)
 *
 * Standalone service for study streak computation, heatmap generation,
 * and timezone-aware date grouping.
 *
 * The UserStreak table is a materialized cache that is incrementally
 * updated inline when a session completes (see SessionService.completeSession).
 * This service reads the cache and computes the full streak response
 * including history and heatmap data.
 *
 * Follows the spec's lazy-reset pattern: if lastActiveDate is more than
 * 1 day ago, currentStreak returns 0 (but the DB row is NOT updated —
 * that only happens on the next session completion).
 */

import type { IAgentHints, ISuggestedAction } from '@noema/contracts';
import { createEmptyAgentHints } from '@noema/contracts';
import type { StudyMode, UserId } from '@noema/types';
import type { Logger } from 'pino';

import type {
  IHeatmapEntry,
  IStreakHistoryEntry,
  IStreakQuery,
  IStreakResponse,
} from '../../types/index.js';
import type { IUserStreakRepository } from './streak.repository.js';

// ============================================================================
// Types
// ============================================================================

export interface IStreakExecutionContext {
  userId: UserId;
}

export interface IStreakServiceResult<T> {
  data: T;
  agentHints: IAgentHints;
}

// ============================================================================
// Helpers
// ============================================================================

function buildHints(
  actions: Array<{ action: string; description: string; priority?: ISuggestedAction['priority'] }>,
  reasoning?: string
): IAgentHints {
  return {
    ...createEmptyAgentHints(),
    suggestedNextActions: actions.map((a) => ({
      action: a.action,
      description: a.description,
      priority: a.priority ?? 'medium',
    })),
    confidence: 1.0,
    sourceQuality: 'high',
    validityPeriod: 'short',
    ...(reasoning !== undefined ? { reasoning } : {}),
  };
}

/**
 * Convert a UTC ISO timestamp to a local date string (YYYY-MM-DD)
 * in the given IANA timezone.
 */
function toLocalDate(isoTimestamp: string, timezone: string): string {
  const date = new Date(isoTimestamp);
  // Use Intl.DateTimeFormat to get timezone-aware date parts
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA produces YYYY-MM-DD format
  return formatter.format(date);
}

/**
 * Get today's date string in the given timezone.
 */
function getTodayInTimezone(timezone: string): string {
  return toLocalDate(new Date().toISOString(), timezone);
}

/**
 * Subtract N days from a date string and return a new date string.
 */
function subtractDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() - days);
  const ry = date.getUTCFullYear();
  const rm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const rd = String(date.getUTCDate()).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
}

/**
 * Compute the difference in calendar days between two YYYY-MM-DD strings.
 * Returns a positive number if dateA is after dateB.
 */
function daysBetween(dateA: string, dateB: string): number {
  const [ay, am, ad] = dateA.split('-').map(Number);
  const [by, bm, bd] = dateB.split('-').map(Number);
  const a = Date.UTC(ay!, am! - 1, ad!);
  const b = Date.UTC(by!, bm! - 1, bd!);
  return Math.round((a - b) / 86_400_000);
}

/**
 * Convert session count to heatmap intensity (0–4, GitHub-style).
 */
function toIntensity(sessionCount: number): 0 | 1 | 2 | 3 | 4 {
  if (sessionCount === 0) return 0;
  if (sessionCount === 1) return 1;
  if (sessionCount === 2) return 2;
  if (sessionCount <= 4) return 3;
  return 4;
}

// ============================================================================
// Service
// ============================================================================

export class StreakService {
  constructor(
    private readonly streakRepository: IUserStreakRepository,
    private readonly logger: Logger
  ) {}

  /**
   * Get the full streak response for a user.
   *
   * 1. Read the materialized UserStreak cache for currentStreak/longestStreak
   * 2. Apply lazy-reset if lastActiveDate is stale
   * 3. Fetch completed sessions in date range for history + heatmap
   * 4. Group by local date, compute heatmap intensities
   */
  async getStreak(
    query: IStreakQuery,
    ctx: IStreakExecutionContext
  ): Promise<IStreakServiceResult<IStreakResponse>> {
    const { days, timezone } = query;
    const today = getTodayInTimezone(timezone);

    // 1. Read cached streak
    const cached = await this.streakRepository.findByUserId(ctx.userId, query.studyMode);

    let currentStreak = 0;
    let longestStreak = 0;
    let lastActiveDate: string | null = null;
    let isActiveToday = false;

    if (cached) {
      lastActiveDate = cached.lastActiveDate;
      longestStreak = cached.longestStreak;

      // Lazy-reset: if lastActiveDate is more than 1 day ago, streak is 0
      const gap = daysBetween(today, cached.lastActiveDate);
      if (gap <= 0) {
        // lastActiveDate is today or in the future (clock skew)
        currentStreak = cached.currentStreak;
        isActiveToday = gap === 0;
      } else if (gap === 1) {
        // Yesterday — streak is still alive, user just hasn't studied today
        currentStreak = cached.currentStreak;
        isActiveToday = false;
      } else {
        // Gap > 1 day — streak is broken
        currentStreak = 0;
        isActiveToday = false;
      }
    }

    // 2. Fetch completed sessions for streak history
    const rangeStart = subtractDays(today, days - 1);
    // Convert rangeStart (YYYY-MM-DD) to start-of-day in the user's timezone
    // and today to end-of-day for the DB query
    const afterDate = this.toTimezoneStartOfDay(rangeStart, timezone);
    const beforeDate = this.toTimezoneEndOfDay(today, timezone);

    const completedSessions = await this.streakRepository.findCompletedSessionsInRange(
      ctx.userId,
      query.studyMode,
      afterDate,
      beforeDate
    );

    // 3. Group by local date
    const dateMap = new Map<string, { sessions: number; attempts: number; durationMs: number }>();

    for (const session of completedSessions) {
      const localDate = toLocalDate(session.completedAt, timezone);
      const existing = dateMap.get(localDate);
      if (existing) {
        existing.sessions += 1;
        existing.attempts += session.totalAttempts;
        existing.durationMs += session.durationMs;
      } else {
        dateMap.set(localDate, {
          sessions: 1,
          attempts: session.totalAttempts,
          durationMs: session.durationMs,
        });
      }
    }

    // 4. Build streak history and heatmap
    const streakHistory: Record<string, IStreakHistoryEntry> = {};
    const heatmapData: IHeatmapEntry[] = [];

    for (let i = 0; i < days; i++) {
      const date = subtractDays(today, i);
      const entry = dateMap.get(date);

      if (entry) {
        streakHistory[date] = {
          sessionsCompleted: entry.sessions,
          totalAttempts: entry.attempts,
          totalMinutes: Math.round(entry.durationMs / 60_000),
        };
      }

      heatmapData.push({
        date,
        intensity: toIntensity(entry?.sessions ?? 0),
      });
    }

    // Reverse heatmap so oldest date is first (chronological order)
    heatmapData.reverse();

    const streakHint =
      currentStreak > 0 ? `${currentStreak}-day streak active` : 'No active streak';

    return {
      data: {
        studyMode: query.studyMode,
        currentStreak,
        longestStreak,
        lastActiveDate,
        isActiveToday,
        streakHistory,
        heatmapData,
      },
      agentHints: buildHints(
        [
          {
            action: 'start_session',
            description: 'Start a study session to maintain streak',
            priority: 'high',
          },
        ],
        streakHint
      ),
    };
  }

  /**
   * Compute and update streak for a session that just completed.
   * Called inline from SessionService.completeSession().
   *
   * @param userId - The user who completed the session
   * @param completedAt - ISO timestamp of session completion
   * @param timezone - User's IANA timezone (default: 'UTC')
   * @param tx - Optional Prisma transaction client
   */
  async updateStreakOnCompletion(
    userId: UserId,
    completedAt: string,
    timezone: string,
    studyMode: StudyMode,
    tx?: unknown // Prisma.TransactionClient
  ): Promise<void> {
    try {
      const sessionDate = toLocalDate(completedAt, timezone);
      const cached = await this.streakRepository.findByUserId(userId, studyMode);

      let newCurrentStreak: number;
      let newLongestStreak: number;

      if (!cached) {
        // First ever session completion
        newCurrentStreak = 1;
        newLongestStreak = 1;
      } else {
        const gap = daysBetween(sessionDate, cached.lastActiveDate);

        if (gap === 0) {
          // Same day — no change to streak count
          return; // No-op, already counted
        } else if (gap === 1) {
          // Consecutive day — increment streak
          newCurrentStreak = cached.currentStreak + 1;
          newLongestStreak = Math.max(cached.longestStreak, newCurrentStreak);
        } else if (gap > 1) {
          // Gap — streak broken, restart at 1
          newCurrentStreak = 1;
          newLongestStreak = Math.max(cached.longestStreak, 1);
        } else {
          // Negative gap (session in the past) — don't change
          this.logger.warn(
            { userId, sessionDate, lastActiveDate: cached.lastActiveDate },
            'Session completedAt is before lastActiveDate; skipping streak update'
          );
          return;
        }
      }

      await this.streakRepository.upsert(
        userId,
        studyMode,
        {
          currentStreak: newCurrentStreak,
          longestStreak: newLongestStreak,
          lastActiveDate: sessionDate,
          timezone,
        },
        tx as import('../../../generated/prisma/index.js').Prisma.TransactionClient | undefined
      );

      this.logger.debug(
        { userId, sessionDate, currentStreak: newCurrentStreak, longestStreak: newLongestStreak },
        'Streak updated on session completion'
      );
    } catch (error) {
      // Streak update is non-critical — log and continue
      this.logger.error({ error, userId }, 'Failed to update streak on session completion');
    }
  }

  // ========================================================================
  // Private Helpers
  // ========================================================================

  /**
   * Get the start of a given date (YYYY-MM-DD) in a timezone, as an ISO string.
   * e.g., "2025-07-15" in "America/New_York" → "2025-07-15T04:00:00.000Z"
   */
  private toTimezoneStartOfDay(dateStr: string, timezone: string): string {
    // Create a date at midnight in the given timezone
    const [y, m, d] = dateStr.split('-').map(Number);
    // Use a reference date and extract offset using Intl
    const refDate = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
    const utcStr = refDate.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = refDate.toLocaleString('en-US', { timeZone: timezone });
    const utcDate = new Date(utcStr);
    const tzDate = new Date(tzStr);
    const offsetMs = utcDate.getTime() - tzDate.getTime();

    // Midnight in the timezone = midnight UTC + offset
    const midnightUtc = new Date(Date.UTC(y!, m! - 1, d!, 0, 0, 0));
    return new Date(midnightUtc.getTime() + offsetMs).toISOString();
  }

  /**
   * Get end of a given date in a timezone (start of next day), as ISO string.
   */
  private toTimezoneEndOfDay(dateStr: string, timezone: string): string {
    const nextDay = subtractDays(dateStr, -1);
    return this.toTimezoneStartOfDay(nextDay, timezone);
  }
}
