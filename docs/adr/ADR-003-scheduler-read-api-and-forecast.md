# ADR-003: Scheduler Read API & Review Forecast (Circadian Rhythm)

| Field       | Value                                                       |
| ----------- | ----------------------------------------------------------- |
| **Status**  | Accepted                                                    |
| **Date**    | 2026-03-04                                                  |
| **Phase**   | Phase 03 — Circadian Rhythm (Scheduler Read API & Forecast) |
| **Authors** | Claude (AI), approved by project owner                      |

---

## Context

The scheduler-service can compute scheduling decisions (plan/commit/propose
workflows) but cannot expose what it knows. Three read capabilities were
missing:

1. **Per-card scheduling state** — the `scheduler_cards` table contains FSRS
   stability, difficulty, interval, HLR half-life, lane, state, and next review
   date, but no endpoint existed to read this data.
2. **Review history** — the `reviews` table is populated by Phase 2 event
   consumers but lacked a query endpoint for timelines, scatter plots, and
   rating distributions.
3. **Multi-day forecast** — the existing `dual-lane/plan` returns a
   single-session plan; the frontend needs 7–90 day projections of daily
   workload split by lane.

Additionally, the existing `proposeReviewWindows` response lacked per-card
recall probability and time-block suggestions needed by the frontend's Reviews
Dashboard.

---

## Decisions

### D1 — Separate `SchedulerReadService` class

**Decision:** Create a new `SchedulerReadService` class rather than extending
the existing `SchedulerService` (1,373 LOC).

**Rationale:**

- The existing service is write-oriented (plan, commit, propose, simulate) with
  an `IEventPublisher` dependency.
- Read endpoints have no side effects — they do not publish events, commit
  schedules, or record provenance.
- Separation keeps the dependency graph narrow: `SchedulerReadService` takes
  only `{ schedulerCardRepository, reviewRepository }`.
- Follows the CQRS-lite pattern already emerging in the codebase.

**Alternatives considered:**

- Add methods to `SchedulerService` — rejected because it would grow the class
  beyond 1,500 LOC and add read-only methods alongside write-heavy ones.
- Separate read microservice — rejected as over-engineering for 5 endpoints.

### D2 — Recall probability computation

**Decision:** Use `FSRSModel.forgettingCurve(elapsedDays, stability)` for FSRS
cards and the simplified `2^(-elapsedDays / halfLife)` formula for HLR cards.

**Rationale:**

- The `FSRSModel.forgettingCurve()` method already exists in the codebase and
  computes `(1 + factor × elapsed / stability) ^ decay`.
- For HLR, the full `HLRModel.predict()` requires feature vectors. The
  simplified formula is mathematically equivalent given a known half-life and
  avoids the complexity of constructing features for a read-only endpoint.
- SM2 cards return `null` for recall probability (no closed-form formula
  available with stored parameters).

**Alternatives considered:**

- Call the HLR sidecar HTTP endpoint — rejected because the sidecar is not
  always available and adds latency for a read endpoint.

### D3 — Pagination pattern

**Decision:** Offset-based pagination with local Zod schemas using `z.coerce`
for GET query strings. Return `IPaginationInfo` from `@noema/contracts`.

**Rationale:**

- GET query strings arrive as strings; `z.coerce.number()` handles conversion.
- Offset pagination with `limit` (default 50, max 200) and `offset` (default 0)
  is simple, understood, and sufficient for the expected data volumes.
- `IPaginationInfo { offset, limit, total, hasMore }` is the existing contract.

**Alternatives considered:**

- Cursor-based pagination — rejected for Phase 3; can be added later if datasets
  grow large enough to cause offset performance issues.

### D4 — Additive repository methods

**Decision:** Add new methods to existing repository interfaces rather than
creating new repository classes.

**Rationale:**

- `ISchedulerCardRepository` and `IReviewRepository` are the canonical data
  access interfaces. Adding `findByUserPaginated()`, `countByUserFiltered()`,
  `findReviewableByUser()`, `aggregateStats()`, and `reviewsByDay()` is additive
  and non-breaking.
- No parallel abstractions.

### D5 — Consumed-card forecast model

**Decision:** Implement the "consumed-card" simulation model for the forecast
endpoint rather than the simpler naive count.

**Rationale:**

- A naive forecast (`nextReviewDate <= endOfDay(date)`) overcounts because
  overdue cards from day 0 would also appear in subsequent days.
- The consumed model simulates the user reviewing all due cards each day and
  projects each card's next review forward by its interval.
- This produces realistic workload distribution without misleading backlog
  accumulation.
- Performance is acceptable: the simulation iterates once per card per forecast
  day, and cards are loaded once in a single query.

### D6 — Review windows enhancement (T3.4)

**Decision:** Add both `retentionProbability` per decision and
`suggestedTimeBlocks` array to the review windows response.

**Rationale:**

- `retentionProbability` is computed inline using the same FSRS/HLR formulas as
  the single-card endpoint. The `ICardScheduleInput` already carries `stability`
  and `lastReviewAt`, so no additional data fetch is needed.
- `suggestedTimeBlocks` splits decisions into lane-based study blocks (morning
  retention, afternoon calibration) with sensible defaults (90s/card).
- Both are backward-compatible: `IEnhancedCardScheduleDecision` extends
  `ICardScheduleDecision`, and `IEnhancedReviewWindowProposal` extends the base
  proposal type with additional fields.

### D7 — Zod schemas for query params

**Decision:** Create `scheduler-read.schemas.ts` with `z.coerce` for numeric
fields and enums for categorical fields.

**Rationale:**

- Matches the existing `scheduler.schemas.ts` pattern.
- GET query strings require coercion; POST bodies do not.
- Centralized schemas enable reuse in tests and OpenAPI generation.

### D8 — File organization

**Decision:** Follow the spec's file layout:

- `scheduler-read.schemas.ts` — Zod schemas for all new query/body params
- `scheduler-read.service.ts` — read-only service class
- Existing files receive additive changes (types, repos, routes, bootstrap)

---

## Consequences

### Positive

- 5 new endpoints provide full read access to scheduling state and review data.
- Consumed-card forecast gives realistic workload projections.
- Review windows response now includes recall probability and time blocks.
- Clean separation between read and write service classes.
- All endpoints protected by `scheduler:plan` scope and Zod validation.
- Gateway already covers all paths via the existing `/api/v1/scheduler/*`
  wildcard — no gateway changes needed (T3.5 verified).

### Negative

- `SchedulerReadService` and `SchedulerService` share some repository
  dependencies — a future refactor could extract a shared ReadModel.
- The `reviewsByDay` aggregation uses a raw SQL query for date truncation
  grouping (Prisma lacks native `groupBy` on date parts).

### Risks

- The consumed-card forecast assumes all due cards are reviewed each day. For
  users who skip reviews, the forecast will underestimate future workload. A
  configurable "review probability" could address this in a later phase.

---

## Follow-up Work

- Add consumer-driven contract tests for endpoints used by mobile clients.
- Add OpenAPI entries for all 5 new endpoints.
- Consider cursor pagination for large review histories.
- Derive `suggestedTimeBlocks` from user preferences (`dailyReminderTime`,
  `defaultReviewCardsPerDay`) when profile service integration is available.

---

## Emergent Decisions During Implementation

1. **`Prisma` value import:** The review repository's `reviewsByDay` method uses
   `Prisma.sql` and `Prisma.empty` for conditional raw query fragments, which
   required changing the `Prisma` import from type-only to value import.

2. **`exactOptionalPropertyTypes` handling:** Route handlers use conditional
   spreads (`...(q.lane !== undefined && { lane: q.lane })`) to avoid assigning
   `undefined` to optional properties, which TypeScript's strict mode rejects.

3. **404 status code unavailable in error envelope:** The `sendErrorEnvelope`
   function's `statusCode` union does not include `404`. The single-card "not
   found" error uses `400` with a descriptive message instead of introducing a
   new status code to the shared envelope contract.

4. **Raw SQL for reviewsByDay:** Prisma's `groupBy` API doesn't support date
   truncation functions. A tagged-template raw query with `Prisma.sql` was used
   for type-safe parameterized SQL with conditional WHERE clauses.
