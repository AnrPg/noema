# ADR-005: Session Enhancements & Study Streak (Basal Ganglia)

| Field       | Value                                           |
| ----------- | ----------------------------------------------- |
| **Status**  | Accepted                                        |
| **Date**    | 2026-03-03                                      |
| **Phase**   | Phase 05 — Basal Ganglia (Session Enhancements) |
| **Authors** | Claude (AI), approved by project owner          |

---

## Context

The session-service tracks spaced-repetition study sessions end-to-end (create →
resume → answer → pause → complete). However, it lacked:

1. **Limited listing filters** — `GET /v1/sessions` supported only `state` and
   `pagination` (`limit`/`offset`). Users could not filter by date range, deck,
   minimum attempt count, or sort by completion date, duration, or retention
   rate.

2. **No study streak tracking** — There was no mechanism to compute or cache how
   many consecutive days a user has studied. Streaks are a primary motivation
   lever for spaced-repetition learners.

3. **No heatmap data** — Mobile clients need a GitHub-style contribution heatmap
   showing study intensity per day. Without server-side aggregation, this would
   require fetching all sessions client-side.

4. **Missing `completedAt` index** — The `completedAt` column existed on the
   `Session` model but had no composite index for efficient per-user date-range
   queries. Some completed sessions also had `NULL` `completedAt` values.

5. **Gateway routing** — It was unclear whether the existing Traefik wildcard
   route would cover new endpoints like `/api/v1/sessions/streak`.

---

## Decisions

### D1: Filter Strategy — Extend `ISessionFilters`

**Decision:** Add new optional fields directly to the existing `ISessionFilters`
interface rather than creating a new query type.

**Rationale:**

- The existing `ISessionFilters` is used by a single consumer
  (`findSessionsByUser`), so extension is non-breaking.
- Keeps the repository interface cohesive — one filter type per query method.
- Avoids a parallel abstraction that would require merging logic.

**Alternatives considered:**

- **(B) New `ISessionListQuery` type** — Would separate concerns but adds
  indirection for no practical benefit at this stage.

### D2: Sort Strategy — App-Level Sort for Computed Fields

**Decision:** For `sortBy` values `retentionRate`, `totalAttempts`, and
`durationMs`, the repository fetches all matching sessions, sorts in application
code, and paginates the result. For `createdAt` and `completedAt`, the database
handles sorting natively via `ORDER BY`.

**Rationale:**

- `retentionRate` and `totalAttempts` live in a JSONB `stats` column, making
  native SQL ordering impractical without raw queries or generated columns.
- `durationMs` is computed from
  `lastActivityAt - startedAt - totalPausedDurationMs`, not stored directly.
- App-level sort is acceptable because individual users rarely have more than a
  few thousand sessions.

**Alternatives considered:**

- **(B) Raw SQL with JSON operators** — Fragile, hard to maintain, Prisma escape
  hatch.
- **(C) Skip computed sorts** — Would limit UX; users expect to sort by
  retention rate.

### D3: Streak Architecture — Standalone `StreakService`

**Decision:** Create a separate `StreakService` class rather than adding streak
methods to the existing `SessionService`.

**Rationale:**

- `SessionService` is already ~2700 LOC with 25+ methods. Adding streak logic
  would worsen cohesion.
- A standalone service has its own repository (`IUserStreakRepository`), making
  it independently testable.
- The setter pattern (`setStreakService()`) avoids circular constructor
  dependencies while keeping the inline update in `completeSession()`.

**Alternatives considered:**

- **(A) Methods on SessionService** — Simpler wiring but further bloats an
  already large class.

### D4: Streak Update Trigger — Inline in `completeSession()`

**Decision:** Update the streak cache synchronously inside `completeSession()`
after the session transaction commits. The existing `session.completed` domain
event is still emitted for other consumers (e.g., scheduler-service).

**Rationale:**

- Streak must be current immediately after completion (user sees updated streak
  on the completion screen).
- A self-consuming event would add latency and complexity for no benefit since
  the streak update is fast (single upsert).
- The outbox event is preserved for downstream consumers that need eventual
  consistency.

**Alternatives considered:**

- **(A) Self-consuming `session.completed` event** — Adds a consumer, retry
  logic, and ~200ms latency for a simple upsert.
- **(B) Inline update only, no event** — Would break existing scheduler-service
  consumer that depends on `session.completed`.

---

## Implementation Details

### New Files

| File                                                                         | Purpose                                                               |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/types/streak.types.ts`                                                  | Domain types: `IUserStreak`, `IStreakResponse`, `IHeatmapEntry`, etc. |
| `src/domain/session-service/streak.repository.ts`                            | `IUserStreakRepository` port interface                                |
| `src/domain/session-service/streak.service.ts`                               | Streak computation, lazy-reset, heatmap generation                    |
| `src/infrastructure/repositories/prisma-user-streak.repository.ts`           | Prisma adapter for `UserStreak` model                                 |
| `prisma/migrations/20260303150000_phase5_session_enhancements/migration.sql` | Backfill + index + `user_streaks` table                               |

### Modified Files

| File                                                       | Changes                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `prisma/schema.prisma`                                     | Added `UserStreak` model, composite index on `Session`             |
| `src/types/session.types.ts`                               | Added `SessionSortBy`, `SortOrder`, extended `ISessionFilters`     |
| `src/types/index.ts`                                       | Re-exported streak types                                           |
| `src/domain/session-service/session.schemas.ts`            | Extended `SessionListQuerySchema`, added `StreakQuerySchema`       |
| `src/infrastructure/database/prisma-session.repository.ts` | Rewrote `findSessionsByUser()` for filters + sorting               |
| `src/api/rest/session.routes.ts`                           | Added `GET /v1/sessions/streak`, extended list handler             |
| `src/domain/session-service/session.service.ts`            | Added `streakService` field + inline update in `completeSession()` |
| `src/index.ts`                                             | Wired `StreakService` + `PrismaUserStreakRepository`               |
| `src/events/consumers/user-deleted.consumer.ts`            | Added streak record deletion for GDPR compliance                   |

### Key Patterns

- **Lazy-reset streak** — `currentStreak` is not decremented by a cron job.
  Instead, `getStreak()` checks `lastActiveDate` against today's date in the
  user's timezone. If the gap exceeds 1 day, `currentStreak` is returned as 0
  without mutating the cache. This eliminates the need for a background job.

- **Timezone-aware dates** — `Intl.DateTimeFormat` with `en-CA` locale produces
  `YYYY-MM-DD` strings for any timezone. All streak boundaries are computed in
  the user's local timezone to avoid midnight-edge-case bugs.

- **Route ordering** — `GET /v1/sessions/streak` is registered before
  `GET /v1/sessions/:sessionId` to prevent Fastify from capturing `"streak"` as
  a session ID parameter.

---

## Emergent Decisions During Implementation

1. **T5.3 was already complete** — The `completedAt` field existed in both the
   Prisma schema and `ISession` domain type. Only backfill + index were needed.

2. **`minAttempts` post-fetch filter** — Since `totalAttempts` lives in JSONB
   `stats`, it cannot be filtered at the database level without raw SQL. The
   implementation fetches all matching rows and filters in application code.

3. **`en-CA` locale for date formatting** — Chosen because it's the only
   `Intl.DateTimeFormat` locale that reliably produces `YYYY-MM-DD` without
   requiring manual string assembly.

4. **Setter injection for StreakService** — Used `setStreakService()` instead of
   constructor injection to break a circular dependency: `SessionService` needs
   `StreakService`, but both are constructed in `index.ts` with different
   dependency sets.

---

## Consequences

### Positive

- Users can filter and sort their session history with rich criteria.
- Study streaks provide an immediate motivation signal on session completion.
- Heatmap data enables GitHub-style contribution graphs in mobile clients.
- GDPR compliance maintained — streak records are deleted on user erasure.

### Negative

- App-level sorting for computed fields (D2) fetches all matching sessions into
  memory. For users with >10,000 sessions, this could become slow. Mitigation:
  add a generated column or materialized view if profiling shows issues.
- Lazy-reset means the `user_streaks` table may contain stale `currentStreak`
  values. Consumers reading directly from the DB (not via the API) would see
  incorrect data.

### Follow-Up Work

- Add `timezone` to user preferences so the client doesn't need to pass it on
  every streak request.
- Consider a generated column for `durationMs` if app-level sort becomes a
  bottleneck.
- Add streak-related push notifications ("You're on a 7-day streak!").
- Unit tests for `StreakService` edge cases (timezone transitions, DST changes).
