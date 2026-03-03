# Phase 3 — Scheduler Read API & Review Forecast

> **Codename:** `Circadian Rhythm` **Depends on:** Phase 2 (Event Consumers — so
> `SchedulerCard` and `Review` data actually exists) **Unlocks:** Frontend Phase
> 5 (Dashboard — "Cards Due" tile, Review Forecast), Frontend Phase 9 (Schedule
> Intelligence — Card Schedule Inspector, Scheduling Simulator) **Estimated
> effort:** 3–4 days

---

## Why This Exists

The circadian rhythm governs when the body should sleep, wake, eat, and recover.
The scheduler is Noema's circadian rhythm — it governs when each card should be
reviewed. But while the scheduler _can compute_ scheduling decisions (the
existing plan/commit endpoints), it **cannot tell you what it knows**.

Three fundamental read capabilities are missing:

1. **No per-card scheduling state.** The `scheduler_cards` table has everything:
   FSRS stability, difficulty, interval, half-life, lane assignment, learning
   state, next review date. But there is no endpoint to read this data. The
   frontend's Card Schedule Inspector (Phase 9) needs to show users how each
   card is scheduled — and it can't.

2. **No review history.** The `reviews` table will be populated by Phase 2's
   event consumers. But there is no endpoint to query it. The frontend needs
   per-card review timelines, calibration scatter plots, and rating
   distributions — all of which require reading review history.

3. **No multi-day forecast.** The existing `POST /v1/scheduler/dual-lane/plan`
   returns a single-session plan — "here are the cards to study right now." But
   the Dashboard's Review Forecast Timeline (Frontend Phase 5) and the Reviews
   Dashboard (Frontend Phase 9) need a 7-day or 30-day forecast: "how many cards
   are due each day, split by lane?" This is a fundamentally different query —
   it's about time distribution, not card selection.

These are all read-only, low-risk additions with no side effects on existing
functionality.

---

## Tasks

### T3.1 — Get Scheduler Card State

A read endpoint for per-card scheduling parameters.

**New endpoints:**

| Method | Path                          | Auth                          | Description                                             |
| ------ | ----------------------------- | ----------------------------- | ------------------------------------------------------- |
| `GET`  | `/v1/scheduler/cards/:cardId` | Bearer JWT + `scheduler:plan` | Get scheduling state for a single card                  |
| `GET`  | `/v1/scheduler/cards`         | Bearer JWT + `scheduler:plan` | List scheduling state for multiple cards (with filters) |

**Single card response shape (`GET /cards/:cardId`):**

The response should include everything needed to render the Card Schedule
Inspector:

- `cardId` — the content-service card ID
- `userId`
- `lane` — `RETENTION` or `CALIBRATION`
- `state` — `NEW`, `LEARNING`, `REVIEW`, `RELEARNING`, `SUSPENDED`, `GRADUATED`
- `schedulingAlgorithm` — `fsrs`, `hlr`, or `sm2`
- **FSRS parameters:**
  - `stability` — how resilient the memory is (days)
  - `difficulty` — how hard the card is for this user (0–1)
  - `interval` — current inter-review interval (days)
- **HLR parameters:**
  - `halfLife` — days until recall probability drops to 50%
  - (Note: HLR recall probability is computed on-demand via the sidecar, not
    stored. The response should include a `recallProbability` field computed by
    calling `POST /predict` on the sidecar inline.)
- `nextReviewDate` — ISO timestamp of when this card is next due
- `lastReviewedAt` — ISO timestamp of the most recent review (null if never
  reviewed)
- `reviewCount` — total reviews
- `lapseCount` — total lapses (times the user forgot)
- `consecutiveCorrect` — current streak of correct answers
- `createdAt`, `updatedAt`

**Why include inline HLR prediction?** The HLR sidecar computes recall
probability from features + elapsed time. Since the `halfLife` alone doesn't
tell you the current recall probability (which depends on how many days have
passed since the last review), the scheduler should call the sidecar's
`POST /predict` and include `currentRecallProbability` in the response. This
saves the frontend from making a separate sidecar call.

**List endpoint response (`GET /cards`):**

Query parameters:

- `userId` (required)
- `lane` — filter by lane
- `state` — filter by learning state
- `algorithm` — filter by scheduling algorithm
- `dueBefore` — ISO timestamp; return only cards due before this time
- `dueAfter` — ISO timestamp; return only cards due after this time
- `sortBy` — `nextReviewDate`, `stability`, `difficulty`, `reviewCount`,
  `createdAt`
- `sortOrder` — `asc` or `desc`
- `limit` — default 50, max 200
- `offset` — default 0

Returns an array of the same shape as the single-card response (but without
inline HLR calls for performance — `currentRecallProbability` is only populated
on the single-card endpoint).

### T3.2 — Review History Endpoint

A read endpoint for per-card and per-user review history.

**New endpoints:**

| Method | Path                    | Auth                          | Description                       |
| ------ | ----------------------- | ----------------------------- | --------------------------------- |
| `GET`  | `/v1/scheduler/reviews` | Bearer JWT + `scheduler:plan` | Query review history with filters |

**Query parameters:**

- `userId` (required)
- `cardId` — filter to a specific card's reviews
- `sessionId` — filter to a specific session's reviews
- `lane` — filter by lane
- `algorithm` — filter by scheduling algorithm
- `rating` — filter by rating (AGAIN, HARD, GOOD, EASY)
- `outcome` — filter by outcome (CORRECT, INCORRECT, PARTIAL, SKIPPED)
- `reviewedAfter` — ISO timestamp
- `reviewedBefore` — ISO timestamp
- `sortBy` — `reviewedAt`, `responseTime`, `rating`
- `sortOrder` — `asc` or `desc`
- `limit` — default 50, max 200
- `offset` — default 0

**Response per review:**

- `id`
- `cardId`, `userId`, `sessionId`, `attemptId`
- `rating` (AGAIN/HARD/GOOD/EASY) + `ratingValue` (1–4)
- `outcome` (CORRECT/INCORRECT/PARTIAL/SKIPPED)
- `deltaDays` — days since the previous review of this card
- `responseTime` — milliseconds
- `reviewedAt` — ISO timestamp
- `lane`, `algorithm`
- `priorState` — scheduling parameters before this review (stability,
  difficulty, interval, state)
- `newState` — scheduling parameters after this review
- **Metacognitive signals:** `confidenceBefore`, `confidenceAfter`,
  `calibrationDelta`, `hintDepthReached`

**Why prior/new state matters:** The Card Schedule Inspector's review timeline
shows how scheduling parameters evolved over time. By returning both
`priorState` and `newState` with each review, the frontend can render a
progression chart: "Your stability went from 2.1 → 3.5 → 5.8 → 4.2 (lapse) → 6.1
days."

**Aggregation sub-endpoint (optional but useful):**

| Method | Path                          | Auth                          | Description                  |
| ------ | ----------------------------- | ----------------------------- | ---------------------------- |
| `GET`  | `/v1/scheduler/reviews/stats` | Bearer JWT + `scheduler:plan` | Aggregated review statistics |

Query parameters: same filters as above.

Response:

- `totalReviews`
- `averageResponseTimeMs`
- `ratingDistribution` — `{ again: N, hard: N, good: N, easy: N }`
- `outcomeDistribution` — `{ correct: N, incorrect: N, partial: N, skipped: N }`
- `averageCalibrationDelta` — how well confidence predicts performance
- `averageInterval` — mean inter-review interval across all reviews
- `reviewsByDay` — array of `{ date: ISO, count: number }` for the queried
  period

### T3.3 — Multi-Day Review Forecast

A forecast endpoint that projects how many cards will be due over the coming
days.

**New endpoint:**

| Method | Path                     | Auth                          | Description                                 |
| ------ | ------------------------ | ----------------------------- | ------------------------------------------- |
| `POST` | `/v1/scheduler/forecast` | Bearer JWT + `scheduler:plan` | Project review workload for the next N days |

**Request body:**

- `userId` (required)
- `days` — number of days to forecast (default 7, max 90)
- `includeOverdue` — whether to include already-overdue cards in day 0 (default:
  true)

**Response:**

An array of daily projections:

```
[
  {
    "date": "2025-07-16",
    "retention": { "newDue": 8, "overdue": 2, "total": 10 },
    "calibration": { "newDue": 3, "overdue": 0, "total": 3 },
    "combined": { "newDue": 11, "overdue": 2, "total": 13 },
    "estimatedMinutes": 22
  },
  ...
]
```

**How the forecast is computed:**

For each day in the forecast window:

1. Query all `SchedulerCard` rows for the user where
   `nextReviewDate <= endOfDay(date)` and `state` is reviewable
2. Exclude cards that would have been "consumed" by prior days (i.e., if a card
   is due on day 1, assume it gets reviewed on day 1 and compute its projected
   next review using its current `interval`)
3. Split by lane
4. Estimate time: `totalCards × averageSecondsPerCard` (use 90 seconds as
   default, or derive from the user's actual average from review stats)

**Why "consumed" modeling matters:** A naive forecast would just query
`nextReviewDate` for each day. But if 50 cards are overdue on day 0, and the
user reviews all 50, those 50 cards won't also appear on day 1. The forecast
needs to model the user actually reviewing — otherwise it would show a growing
backlog that's misleading.

**Simplification:** For the first implementation, a simpler version can skip
consumed-card modeling and just count `nextReviewDate <= endOfDay(date)` per
day. This will slightly overcount for users with backlogs but is much simpler to
implement. A `"note": "Counts include overdue cards from prior days"` in the
response can signal this to the frontend.

### T3.4 — Enhance Review Windows Response

The existing `POST /v1/scheduler/proposals/review-windows` returns per-card
`nextReviewAt` and `intervalDays` but no recall probability or time-block
structure. The frontend's Reviews Dashboard (Phase 9) expects a day-planner with
time blocks.

**Enhancement:** Add a `retentionProbability` field to each decision in the
`IReviewWindowProposal` response. This value is already available in the
`SessionCandidateCard` schema (used by the session-candidates endpoint) — it
just needs to be included in review-window decisions too.

**Also add a `suggestedTimeBlocks` array** to the response:

```
suggestedTimeBlocks: [
  { startTime: "09:00", endTime: "09:30", cardCount: 12, description: "Morning retention review" },
  { startTime: "14:00", endTime: "14:15", cardCount: 5, description: "Afternoon calibration session" }
]
```

This can be computed from the user's settings (`dailyReminderTime`,
`defaultReviewCardsPerDay`) and the total cards due, split into reasonable
blocks.

### T3.5 — Gateway Routing for New Endpoints

Add the new scheduler endpoints to the API gateway routing table:

- `GET /api/v1/scheduler/cards/*` → scheduler-service
- `GET /api/v1/scheduler/reviews/*` → scheduler-service
- `POST /api/v1/scheduler/forecast` → scheduler-service

These follow the existing `/api/v1/scheduler/*` prefix pattern, so they should
already be covered by the gateway's wildcard rule from Phase 0. Verify this
works.

---

## Acceptance Criteria

- [ ] `GET /v1/scheduler/cards/:cardId` returns full scheduling state including
      FSRS params, lane, state, next review date
- [ ] The single-card endpoint includes `currentRecallProbability` computed from
      the HLR sidecar (for HLR-lane cards) or FSRS formula (for FSRS-lane cards)
- [ ] `GET /v1/scheduler/cards?userId=X&dueBefore=Y` returns paginated list with
      lane/state/algorithm filters
- [ ] `GET /v1/scheduler/reviews?userId=X&cardId=Y` returns review history with
      prior/new state and metacognitive signals
- [ ] `GET /v1/scheduler/reviews/stats?userId=X` returns aggregated review
      statistics including rating distribution and reviews-by-day
- [ ] `POST /v1/scheduler/forecast` returns per-day due counts split by lane for
      the next 7 days (default)
- [ ] Review windows response includes `retentionProbability` per decision
- [ ] All new endpoints are protected by `scheduler:plan` scope
- [ ] All new endpoints validate query parameters via Zod schemas
- [ ] Endpoints return correct data after the Phase 2 event consumers have
      populated `scheduler_cards` and `reviews` tables

---

## Files Created / Touched

| File                                                                                             | Action                                                                |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `services/scheduler-service/src/api/rest/scheduler.routes.ts`                                    | Add GET card, GET reviews, POST forecast routes                       |
| `services/scheduler-service/src/domain/scheduler-service/scheduler-read.service.ts`              | **New** — read-only service for card state, review history, forecast  |
| `services/scheduler-service/src/infrastructure/repositories/prisma-scheduler-card.repository.ts` | Add `findByCardId()`, `findByUserId()` with filters                   |
| `services/scheduler-service/src/infrastructure/repositories/prisma-review.repository.ts`         | Add `findByCardId()`, `findByUserId()`, `aggregate()` with filters    |
| `services/scheduler-service/src/types/scheduler.types.ts`                                        | Add `ISchedulerCardResponse`, `IReviewResponse`, `IForecastDay` types |
| `services/scheduler-service/src/api/schemas/scheduler-read.schemas.ts`                           | **New** — Zod schemas for all new query parameters                    |
