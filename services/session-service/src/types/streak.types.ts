/**
 * @noema/session-service - Streak Types (Phase 5, T5.2/T5.4)
 *
 * Domain types for study streak computation and caching.
 */

import type { StudyMode } from '@noema/types';

// ============================================================================
// User Streak (materialized cache row)
// ============================================================================

export interface IUserStreak {
  userId: string;
  studyMode: StudyMode;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string; // YYYY-MM-DD
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Streak History Entry (per-date summary)
// ============================================================================

export interface IStreakHistoryEntry {
  sessionsCompleted: number;
  totalAttempts: number;
  totalMinutes: number;
}

// ============================================================================
// Heatmap Entry
// ============================================================================

export interface IHeatmapEntry {
  date: string; // YYYY-MM-DD
  intensity: 0 | 1 | 2 | 3 | 4;
}

// ============================================================================
// Streak Response (full API response shape)
// ============================================================================

export interface IStreakResponse {
  studyMode: StudyMode;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null; // YYYY-MM-DD or null if never studied
  isActiveToday: boolean;
  streakHistory: Record<string, IStreakHistoryEntry>;
  heatmapData: IHeatmapEntry[];
}

// ============================================================================
// Streak Query Params
// ============================================================================

export interface IStreakQuery {
  days: number;
  timezone: string;
  studyMode: StudyMode;
}

// ============================================================================
// Completed Session Summary (for streak computation)
// ============================================================================

export interface ICompletedSessionSummary {
  id: string;
  completedAt: string; // ISO timestamp
  totalAttempts: number;
  durationMs: number;
}
