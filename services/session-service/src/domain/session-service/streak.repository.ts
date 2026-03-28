/**
 * @noema/session-service - Streak Repository Interface (Phase 5, T5.4)
 *
 * Abstract repository for the UserStreak materialized cache
 * and completed-session queries needed for streak computation.
 */

import type { StudyMode, UserId } from '@noema/types';
import type { Prisma } from '../../../generated/prisma/index.js';

import type { ICompletedSessionSummary, IUserStreak } from '../../types/index.js';

// ============================================================================
// Streak Repository
// ============================================================================

export interface IUserStreakRepository {
  /**
   * Find the streak record for a user. Returns null if the user
   * has never completed a session (no row in user_streaks).
   */
  findByUserId(userId: UserId, studyMode: StudyMode): Promise<IUserStreak | null>;

  /**
   * Create or update the streak record for a user (upsert).
   * Used by the inline streak update in completeSession().
   */
  upsert(
    userId: UserId,
    studyMode: StudyMode,
    data: {
      currentStreak: number;
      longestStreak: number;
      lastActiveDate: string; // YYYY-MM-DD
      timezone: string;
    },
    tx?: Prisma.TransactionClient
  ): Promise<IUserStreak>;

  /**
   * Fetch completed sessions for a user within a date range.
   * Used for streak history and heatmap computation.
   *
   * @param userId - The user
   * @param afterDate - ISO timestamp (inclusive lower bound on completedAt)
   * @param beforeDate - ISO timestamp (exclusive upper bound on completedAt)
   */
  findCompletedSessionsInRange(
    userId: UserId,
    studyMode: StudyMode,
    afterDate: string,
    beforeDate: string
  ): Promise<ICompletedSessionSummary[]>;

  /**
   * Delete the streak record for a user (for GDPR erasure).
   */
  deleteByUserId(userId: UserId, tx?: Prisma.TransactionClient): Promise<void>;
}

export const USER_STREAK_REPOSITORY = Symbol.for('IUserStreakRepository');
