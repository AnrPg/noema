# Phase 5 — Session Enhancements & Study Streak

> **Codename:** `Basal Ganglia` **Depends on:** Phase 2 (Event Consumers —
> session lifecycle events must be consumed for streak computation) **Unlocks:**
> Frontend Phase 5 (Dashboard — Study Streak heatmap), Frontend Phase 7 (Session
> History — filtered list with date ranges) **Estimated effort:** 2–3 days

---

## Why This Exists

The basal ganglia are the brain's habit-forming circuitry — they convert
repeated actions into automatic routines. Study streaks are Noema's
habit-formation mechanism — they give users a visceral, visual signal of
consistency.

Two capabilities are missing from the session-service:

### 1. Session List Filtering Is Limited

The existing `GET /v1/sessions` supports only basic pagination (`limit`,
`offset`) and a `status` filter. The frontend's Session History page (Phase 7)
needs:

- **Date range filtering:** "Show me sessions from last week" or "Show me
  sessions in June 2025"
- **Sorting options:** Sort by creation date, completion date, total attempts,
  duration, or performance metrics
- **Sort direction control:** Ascending or descending

Without these, the Session History page can only show "most recent N sessions" —
it can't answer questions like "How did my sessions look during exam prep last
month?" or "Which session had the most attempts?"

### 2. No Daily Study Streak

The Dashboard needs a study streak — the count of consecutive calendar days on
which the user completed at least one session. This is one of the most powerful
habit reinforcement mechanisms in spaced repetition systems:

- Duolingo's streak is its primary retention driver
- Anki users track streaks manually
- Research shows that visual streak indicators increase adherence by 23–38%
  (Consolvo et al., 2009; Hamari et al., 2014)

The session-service tracks sessions with `status: COMPLETED` and timestamps. All
the raw data exists. But there's no computation or endpoint that transforms this
data into a streak.

---

## Tasks

### T5.1 — Enhanced Session List Filters

Extend the existing `GET /v1/sessions` endpoint with additional query
parameters.

**New query parameters:**

| Parameter         | Type          | Description                                                                        |
| ----------------- | ------------- | ---------------------------------------------------------------------------------- |
| `createdAfter`    | ISO timestamp | Only sessions created after this date                                              |
| `createdBefore`   | ISO timestamp | Only sessions created before this date                                             |
| `completedAfter`  | ISO timestamp | Only sessions completed after this date                                            |
| `completedBefore` | ISO timestamp | Only sessions completed before this date                                           |
| `deckId`          | UUID          | Filter to sessions for a specific deck                                             |
| `minAttempts`     | integer       | Minimum total attempts                                                             |
| `sortBy`          | string        | One of: `createdAt`, `completedAt`, `totalAttempts`, `durationMs`, `retentionRate` |
| `sortOrder`       | string        | `asc` or `desc` (default: `desc`)                                                  |

**Existing parameters preserved:**

- `status` — `ACTIVE`, `COMPLETED`, `ABANDONED`, `PAUSED`
- `limit` — default 20, max 100
- `offset` — default 0

**Implementation notes:**

- The Prisma query should compose filters dynamically, not through multiple
  conditional branches. Use Prisma's `where` object composition:

  ```
  where: {
    userId,
    ...(status && { status }),
    ...(deckId && { deckId }),
    ...(createdAfter && { createdAt: { gte: createdAfter } }),
    ...(createdBefore && { createdAt: { lte: createdBefore } }),
    // etc.
  }
  ```

- For `completedAfter`/`completedBefore`, query against `updatedAt` where
  `status = COMPLETED` (or add a dedicated `completedAt` field — see T5.3
  below).

- For `sortBy: retentionRate`, this requires sorting by a computed stat. Since
  `ISessionStats` is stored as a JSONB field on the session, Prisma can sort by
  a nested JSONB path if using raw queries, or the service can fetch + sort in
  memory for reasonable result sets. Start with `createdAt` and `totalAttempts`
  as database-level sorts, and add `retentionRate` as an application-level sort
  (fetch all matching, sort, paginate).

**Response enhancement:** Each session in the list should include a summary
`stats` object inline (the same shape as `ISessionStats`) so the frontend
doesn't need a separate call per session. This data is already stored — it just
needs to be included in the list serialization.

### T5.2 — Study Streak Computation

A new endpoint that computes the user's current study streak and streak history.

**New endpoints:**

| Method | Path                  | Auth       | Description                               |
| ------ | --------------------- | ---------- | ----------------------------------------- |
| `GET`  | `/v1/sessions/streak` | Bearer JWT | Get current study streak and heatmap data |

**Response shape:**

```
{
  "currentStreak": 12,
  "longestStreak": 34,
  "lastActiveDate": "2025-07-15",
  "isActiveToday": true,
  "streakHistory": {
    "2025-07-15": { "sessionsCompleted": 2, "totalAttempts": 47, "totalMinutes": 38 },
    "2025-07-14": { "sessionsCompleted": 1, "totalAttempts": 22, "totalMinutes": 18 },
    ...
  },
  "heatmapData": [
    { "date": "2025-07-15", "intensity": 3 },
    { "date": "2025-07-14", "intensity": 1 },
    ...
  ]
}
```

**Computation logic:**

1. **Current streak:** Starting from today (or yesterday if the user hasn't
   studied today yet), count backwards through consecutive calendar days where
   the user completed at least one session. A "calendar day" is determined by
   the user's timezone (from their profile settings).

2. **Longest streak:** The maximum consecutive-day streak ever achieved. This
   can be computed from the full session history, but for performance, it should
   be cached — see T5.4.

3. **Streak history:** A map of dates to activity summaries for the last N days
   (default 90, max 365). Each date entry shows how many sessions were
   completed, total attempts, and total time spent.

4. **Heatmap data:** Same dates as streak history but simplified for rendering.
   The `intensity` field is 0–4 (like GitHub's contribution graph):
   - 0 = no activity
   - 1 = 1 session
   - 2 = 2 sessions
   - 3 = 3–4 sessions
   - 4 = 5+ sessions

**Query parameters:**

- `days` — how many days of history to return (default 90, max 365)
- `timezone` — IANA timezone string (default: UTC; should be auto-populated from
  user profile)

**Timezone handling is critical.** A user in UTC+3 who studies at 11 PM on July
15 should have that session counted as July 15, not July 16 (which it would be
in UTC). The streak computation must convert `session.completedAt` to the user's
local timezone before grouping by date.

Implementation approach:

1. Fetch all completed sessions for the user in the requested date range
2. Convert each `completedAt` timestamp to the user's timezone
3. Group by local date
4. Walk backwards from today counting consecutive active days
5. Generate heatmap intensity values

### T5.3 — Add `completedAt` Field to Session Model

The session model currently lacks a dedicated `completedAt` timestamp. Sessions
have `createdAt` and `updatedAt`, and `updatedAt` happens to reflect when the
session was completed (because the status change to `COMPLETED` is the last
update). But this is semantically fragile — any future update to a completed
session would overwrite `updatedAt`.

**Schema change:** Add `completedAt` (nullable DateTime) to the `Session` model.

**Migration behavior:**

- New column `completedAt` (nullable)
- Backfill:
  `UPDATE sessions SET completed_at = updated_at WHERE status = 'COMPLETED'`
- Going forward, the session completion logic sets `completedAt` explicitly

**Why this matters for T5.1 and T5.2:** The `completedAfter`/`completedBefore`
filters and the streak computation both need to know exactly when a session was
completed. Using `updatedAt` as a proxy works today but is a ticking time bomb.
A dedicated field makes the intent explicit and prevents future bugs.

### T5.4 — Streak Cache for Performance

Computing a streak from raw session data is an O(N) scan over all completed
sessions. For a user with thousands of sessions over years of use, this query
gets expensive — especially since the Dashboard calls it on every page load.

**Caching strategy:**

Option A — **Materialized streak record** (recommended):

Add a `UserStreak` model:

| Column           | Type     | Description                                   |
| ---------------- | -------- | --------------------------------------------- |
| `userId`         | UUID     | Primary key, foreign key to User              |
| `currentStreak`  | integer  | Consecutive days including today              |
| `longestStreak`  | integer  | All-time maximum                              |
| `lastActiveDate` | Date     | The most recent date with a completed session |
| `updatedAt`      | DateTime | Last computation time                         |

This record is updated every time a session is completed (via the
`SessionCompleted` event consumer from Phase 2). The update logic:

1. Convert `session.completedAt` to user's timezone → `sessionDate`
2. If `sessionDate == lastActiveDate`: no-op (already counted)
3. If `sessionDate == lastActiveDate + 1`: increment `currentStreak`
4. If `sessionDate > lastActiveDate + 1`: reset `currentStreak = 1`
5. Update `longestStreak = max(longestStreak, currentStreak)`
6. Set `lastActiveDate = sessionDate`

Option B — **Redis cache:** Store the streak as a Redis key with TTL. Simpler
but less durable — cache misses require full recomputation.

**Recommendation:** Option A. The `UserStreak` model is tiny (one row per user),
updated incrementally, and survives restarts. Redis cache can be layered on top
for the heatmap data (which is larger and less critical).

**Streak decay:** If a user doesn't study today and it's past midnight in their
timezone, their streak doesn't reset until someone queries it. The `GET`
endpoint should check: if `lastActiveDate < today - 1`, set `currentStreak = 0`
before returning. This is a "lazy reset" pattern — the streak is only reset on
read, not on a cron job.

### T5.5 — Gateway Routing

Add the new session endpoints to the API gateway routing table:

- `GET /api/v1/sessions/streak` → session-service

This follows the existing `/api/v1/sessions/*` prefix, so the gateway's wildcard
rule from Phase 0 should cover it. Verify that the streak endpoint doesn't
conflict with existing routes (e.g., `GET /sessions/:id` should not match
`GET /sessions/streak` — the streak route must be registered before the `:id`
param route).

---

## Acceptance Criteria

- [ ] `GET /v1/sessions` supports `createdAfter`, `createdBefore`,
      `completedAfter`, `completedBefore`, `deckId`, `sortBy`, `sortOrder` query
      parameters
- [ ] Session list response includes inline `stats` object per session
- [ ] `GET /v1/sessions/streak` returns `currentStreak`, `longestStreak`,
      `lastActiveDate`, `isActiveToday`, `streakHistory`, and `heatmapData`
- [ ] Streak computation respects user timezone
- [ ] Heatmap intensity levels are 0–4 matching GitHub-style contribution graph
- [ ] `completedAt` field added to Session model with backfill migration
- [ ] `UserStreak` model caches current/longest streak; updated incrementally on
      session completion events
- [ ] Lazy streak reset on read: if `lastActiveDate` is more than 1 day ago,
      `currentStreak` returns 0
- [ ] All new query parameters validated via Zod schemas
- [ ] Performance: streak endpoint responds in <50ms for cached data

---

## Files Created / Touched

| File                                                                                        | Action                                                              |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `services/session-service/prisma/schema.prisma`                                             | Add `completedAt` to Session, add `UserStreak` model                |
| `services/session-service/prisma/migrations/...`                                            | Migration + backfill for `completedAt` and `UserStreak` table       |
| `services/session-service/src/api/rest/session.routes.ts`                                   | Add streak route, extend session list filters                       |
| `services/session-service/src/domain/session-service/streak.service.ts`                     | **New** — streak computation, heatmap generation, timezone handling |
| `services/session-service/src/infrastructure/repositories/prisma-user-streak.repository.ts` | **New** — UserStreak CRUD                                           |
| `services/session-service/src/api/schemas/session.schemas.ts`                               | Extend existing schemas with new filter/sort params                 |
| `services/session-service/src/types/streak.types.ts`                                        | **New** — `IStreakResponse`, `IHeatmapEntry`, `IUserStreak` types   |
