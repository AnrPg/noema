-- Phase 5 — Session Enhancements & Study Streak
-- Codename: Basal Ganglia
--
-- Changes:
-- 1. Add index on sessions(user_id, completed_at) for streak queries
-- 2. Backfill completed_at for any COMPLETED sessions missing it
-- 3. Create user_streaks table for materialized streak cache

-- =============================================================================
-- 1. Add composite index for efficient streak/filter queries
-- =============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_user_completed
  ON sessions (user_id, completed_at)
  WHERE completed_at IS NOT NULL;

-- =============================================================================
-- 2. Backfill completed_at from updated_at for legacy COMPLETED sessions
-- =============================================================================
-- The completedAt field existed since schema creation, but if any rows were
-- completed before explicit setting was implemented, backfill from updated_at.

UPDATE sessions
SET completed_at = updated_at
WHERE state = 'COMPLETED'
  AND completed_at IS NULL;

-- =============================================================================
-- 3. Create user_streaks table (materialized streak cache)
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_streaks (
  user_id          VARCHAR(50) PRIMARY KEY,
  current_streak   INTEGER     NOT NULL DEFAULT 0,
  longest_streak   INTEGER     NOT NULL DEFAULT 0,
  last_active_date DATE        NOT NULL,
  timezone         VARCHAR(50) NOT NULL DEFAULT 'UTC',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
