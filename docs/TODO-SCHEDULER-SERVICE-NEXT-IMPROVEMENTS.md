# TODO — Scheduler Service: Next Improvements

**Purpose:** Roadmap for scheduler-service enhancements beyond dual-lane v2.
Tracks work across domain logic, MCP tools, REST endpoints, event consumers,
FSRS integration, testing, and observability.

**Architecture reference:**
ADR-0022 (Dual-Lane), ADR-0024 (Phase 1), ADR-0025 (Phase 3 Persistence),
ADR-0026 (Identity & Auth), ADR-0027 (OpenAPI Contract),
ADR-0039 (Event Consumer Decomposition)

**Current state:** Phase 1 (HTTP+Auth+Health+Tools) ✅, Phase 2 (Event
Consumer) ✅, Phase 3 (Prisma persistence) ✅, Dual-Lane v2
(priority/interleave/spillover/metadata) ✅

---

## Phase 4 — Core Scheduling Domain Methods

These are the methods `SchedulerService` needs to become a real scheduling
engine instead of just a dual-lane card selector. Each maps to a planned
OpenAPI endpoint (ADR-0027) and to MCP tools agents need (Tool Registry).

### 4A. Review Queue Retrieval (`get-srs-schedule` MCP tool)

The Learning Agent's P0 dependency. Must query `SchedulerCard` records due
before a cutoff date and return them ranked by urgency.

- [ ] Add `getReviewQueue(userId, options)` method to `SchedulerService`
  - Query `schedulerCardRepository.findDueCards(userId, beforeDate, limit, lane)`
  - Sort results by urgency score: `daysSinceDue / interval` (higher = more
    overdue)
  - Return `{ cards: ISchedulerCard[], dueCount: number, asOf: string }`
- [ ] Add types: `IReviewQueueInput`, `IReviewQueueResult` in
      `scheduler.types.ts`
- [ ] Add Zod schema: `ReviewQueueInputSchema` in `scheduler.schemas.ts`
- [ ] Add REST route: `GET /v1/scheduler/review-queue` in
      `scheduler.routes.ts`
  - Auth: enforce `query.userId === ctx.userId`
  - Remove `501` placeholder from OpenAPI
- [ ] Add MCP tool definition: `get-srs-schedule` in `scheduler.tools.ts`
  - Input: `{ userId, dueBefore?, lane?, limit? }`
  - Output: queue with urgency-ranked cards
- [ ] Publish event: `schedule.review_queue.queried`
- [ ] Unit tests: dueBefore filtering, lane filtering, urgency ordering,
      empty queue, limit enforcement
- [ ] Update OpenAPI `x-noema-lifecycle` from `planned` to `active`

### 4B. Single Card Schedule Update (`update-card-scheduling` MCP tool)

The Learning Agent's P0 tool for persisting post-review scheduling state.
After a review is recorded (attempt.recorded), the agent calls this to update
FSRS/HLR parameters.

- [ ] Add `updateCardSchedule(input, ctx)` method to `SchedulerService`
  - Validate input via Zod
  - Fetch existing `SchedulerCard` (fail if not found)
  - Apply algorithm-specific parameter updates (stability, difficulty, halfLife,
    interval, nextReviewDate)
  - Persist with optimistic locking (version check)
  - Emit `schedule.card.updated` event
- [ ] Add types: `ICardScheduleUpdateInput`, `ICardScheduleUpdateResult`
- [ ] Add Zod schema: `CardScheduleUpdateInputSchema`
- [ ] Add REST route: `PATCH /v1/scheduler/cards/:cardId/schedule`
  - Auth: enforce `body.userId === ctx.userId`
- [ ] Add MCP tool: `update-card-scheduling`
  - Input: `{ userId, cardId, nextReviewDate, interval, stability?,
    difficulty?, halfLife?, schedulingAlgorithm, rationale }`
- [ ] Unit tests: happy path, version conflict (optimistic lock failure),
      card not found, algorithm parameter mapping
- [ ] Update OpenAPI lifecycle

### 4C. Batch Schedule Update

Batch variant of 4B for post-session bulk commits when the agent approves
multiple schedule decisions at once.

- [ ] Add `batchUpdateCardSchedules(input, ctx)` to `SchedulerService`
  - Iterate decisions, apply each via updateCardSchedule logic
  - Collect accepted/rejected counts
  - Emit single `schedule.batch.updated` event with summary
- [ ] Add types: `IBatchScheduleUpdateInput`, `IBatchScheduleUpdateResult`
- [ ] Add Zod schema: `BatchScheduleUpdateInputSchema`
- [ ] Add REST route: `POST /v1/scheduler/cards/schedule/batch`
- [ ] Add MCP tool: `batch-update-card-scheduling`
- [ ] Unit tests: partial failure (some succeed, some version-conflict),
      all-succeed, empty batch
- [ ] Update OpenAPI lifecycle

### 4D. Retention Prediction (`predict-retention` MCP tool)

Stateless computation: given card parameters + time delta, compute
P(recall). Used by agents for urgency scoring and by the UI for
"forgetting risk" indicators.

- [ ] Add `predictRetention(input, ctx)` to `SchedulerService`
  - For FSRS cards: `P(recall) = (1 + deltaDays / (9 * stability))^(-1)`
    (FSRS-5 formula)
  - For HLR cards: delegate to `HLRModel.predict(features, deltaDays)`
  - Return per-card `{ cardId, algorithm, retentionProbability, halfLifeDays?,
    asOf }`
- [ ] Add types: `IRetentionPredictionInput`, `IRetentionPredictionResult`
- [ ] Add Zod schema
- [ ] Add REST route: `POST /v1/scheduler/retention/predict`
- [ ] Add MCP tool: `predict-retention`
- [ ] Unit tests: FSRS prediction, HLR prediction, mixed-algorithm batch,
      edge cases (0 stability, huge deltaDays)
- [ ] Update OpenAPI lifecycle

### 4E. Card Projection

Combine retention prediction + scheduling state to produce a full projection
for a single card (next review date, forgetting risk, recommended lane).

- [ ] Add `getCardProjection(userId, cardId, asOf?, ctx)` to
      `SchedulerService`
  - Fetch SchedulerCard, compute retention probability, derive
    forgettingRisk = 1 - retentionProbability
  - Return `ICardProjection`
- [ ] Add REST route: `GET /v1/scheduler/cards/:cardId/projection`
- [ ] Add MCP tool: `get-card-projection`
- [ ] Unit tests
- [ ] Update OpenAPI lifecycle

---

## Phase 5 — Session Proposal & Reconciliation

These endpoints power the Learning Agent's session-creation and mid-session
adaptation flows. The scheduler computes proposals; the agent decides.

### 5A. Session Candidate Proposal

Score and rank a pool of candidate cards for a new session. The agent sends
candidates, scheduler scores them (urgency, forgetting risk, calibration
value), and returns a proposed selection.

- [ ] Add `proposeSessionCandidates(input, ctx)` to `SchedulerService`
  - For each candidate: compute composite score from:
    - `urgency` = daysSinceDue / interval (clamped to 0..1)
    - `forgettingRisk` = 1 - predictedRetention
    - `calibrationValue` = (for calibration-lane cards) confidence gap
    - `composite` = weighted combination based on strategy loadout or defaults
  - Sort by composite score, select top N per constraints
  - Apply lane mix via `selectByLaneMix` (reuse dual-lane v2)
  - Return selected/excluded card IDs + per-card scores + rationale
- [ ] Add types: `ISessionCandidateProposalInput`,
      `ISessionCandidateProposal`, `ICandidateScore`
- [ ] Add Zod schema
- [ ] Add REST route: `POST /v1/scheduler/proposals/session-candidates`
- [ ] Add MCP tool: `propose-session-candidates`
- [ ] Publish event: `schedule.session.proposed`
- [ ] Unit tests: scoring, selection respects constraints, lane mix applied,
      empty pool handling
- [ ] Update OpenAPI lifecycle

### 5B. Review Window Proposal

Compute raw schedule decisions for a card pool without committing. Used by
agents before session creation to preview what the scheduler would recommend.

- [ ] Add `proposeReviewWindows(input, ctx)` to `SchedulerService`
  - For each card: determine algorithm, compute next review window using
    FSRS or HLR parameters
  - Return array of `CardScheduleDecision` (cardId, nextReviewAt,
    intervalDays, lane, algorithm, rationale)
- [ ] Add REST route: `POST /v1/scheduler/proposals/review-windows`
- [ ] Add MCP tool: `propose-review-windows`
- [ ] Unit tests
- [ ] Update OpenAPI lifecycle

### 5C. In-Session Reconciliation

Mid-session: recompute keep/add/drop recommendations using live telemetry
(rolling accuracy, latency, cards completed/remaining) + updated candidate
pools from collaborating agents.

- [ ] Add `reconcileSessionCandidates(sessionId, input, ctx)` to
      `SchedulerService`
  - Evaluate current cards against telemetry-adjusted thresholds
  - Identify cards to drop (too easy, already reviewed) and add (from
    candidate pool, by urgency)
  - Return `{ keepCardIds, addCardIds, dropCardIds, rationale }`
- [ ] Add types: `ISessionReconcileInput`, `ISessionReconcileResult`,
      `ISessionTelemetrySnapshot`
- [ ] Add Zod schema
- [ ] Add REST route:
      `POST /v1/scheduler/sessions/:sessionId/reconcile`
- [ ] Add MCP tool: `reconcile-session-candidates`
- [ ] Publish event: `schedule.session.reconciled`
- [ ] Unit tests: no changes needed, drop underperforming, add from pool,
      respect constraints
- [ ] Update OpenAPI lifecycle

### 5D. Session Adjustments

Apply explicit agent-approved add/remove/keep adjustments to a session's
card cohort.

- [ ] Add `applySessionAdjustments(sessionId, input, ctx)` to
      `SchedulerService`
  - Process each adjustment (add/remove/keep)
  - Track applied/skipped counts
  - Return resulting card set
- [ ] Add REST route:
      `POST /v1/scheduler/sessions/:sessionId/apply-adjustments`
- [ ] Add MCP tool: `apply-session-adjustments`
- [ ] Publish event: `schedule.session.adjusted`
- [ ] Unit tests
- [ ] Update OpenAPI lifecycle

---

## Phase 6 — FSRS Integration

Currently only HLR is implemented as a domain algorithm. FSRS (Free Spaced
Repetition Scheduler) is the retention-lane algorithm and has no in-service
implementation yet — card state updates rely on agent-provided values.

### 6A. FSRS Core Algorithm

- [ ] Implement `FSRSModel` class in
      `src/domain/scheduler-service/algorithms/fsrs.ts`
  - FSRS-5 parameter set (19 weights: w0..w18)
  - `computeStability(rating, prevStability, prevDifficulty, retrievability)`
  - `computeDifficulty(rating, prevDifficulty)`
  - `computeInterval(stability, desiredRetention)` → days
  - `computeRetention(stability, deltaDays)` → probability
  - Formulas from open-spaced-repetition/fsrs4anki (already in
    `third-party/fsrs4anki/`)
- [ ] Unit tests: verify against reference Python implementation outputs
      for known input vectors

### 6B. FSRS-Aware Card State Machine

- [ ] Implement `FSRSCardStateMachine` in
      `src/domain/scheduler-service/algorithms/fsrs-state-machine.ts`
  - State transitions: new → learning → review → relearning → graduated
  - On review: compute new stability, difficulty, interval via FSRSModel
  - Learning steps: 1m, 10m (configurable)
  - Re-learning steps: 10m
  - Graduating interval and easy interval
- [ ] Wire into `updateCardSchedule` (Phase 4B) so scheduler can compute
      schedule autonomously when algorithm=fsrs

### 6C. FSRS Parameter Optimization

- [ ] Add `optimizeFSRSParameters(userId, ctx)` to `SchedulerService`
  - Query review history from `reviewRepository`
  - Run FSRS weight optimization (minimize RMSE of recall predictions)
  - Persist optimized weights in `CalibrationData`
- [ ] Add MCP tool: `optimize-fsrs-parameters`
- [ ] This is a longer-running operation — consider async execution with
      status polling

---

## Phase 7 — Event Consumer Hardening

The event consumer has been decomposed into per-stream concrete consumers
(ADR-0039): `SessionStartedConsumer`, `ReviewRecordedConsumer`,
`ContentSeededConsumer`, and `SessionCohortConsumer`, all extending
`BaseEventConsumer`. The original `SchedulerEventConsumer` class is now a thin
facade that delegates to these consumers.

### 7A. Post-Review Scheduling via Event Consumer

Currently `handleReviewRecorded` stores the review and updates basic card
counters. It does NOT compute new scheduling parameters.

- [ ] After persisting the review, run the appropriate algorithm:
  - FSRS cards: compute new stability, difficulty, interval, nextReviewDate
    via FSRSModel (Phase 6A)
  - HLR cards: run `HLRModel.trainUpdate` + `HLRModel.predict` to update
    halfLife and nextReviewDate
- [ ] Persist the computed schedule update on the SchedulerCard
- [ ] Emit `schedule.card.updated` event with before/after state
- [ ] Unit tests with mocked repositories

### 7B. Adaptive Checkpoint Processing (ADR-0021)

Session-service publishes `session.checkpoint.evaluated` events. The
scheduler should react to checkpoint directives.

- [ ] Add `AdaptiveCheckpointPayloadSchema` in event consumer
- [ ] Handle `session.checkpoint.evaluated` events:
  - On `pause_session` directive: suspend active session cards temporarily
  - On `adjust_difficulty` directive: flag cards for recalibration
  - On `switch_lane` directive: update lane preference for remaining session
    cards
- [ ] Publish `schedule.checkpoint.processed` event
- [ ] Unit tests for each directive type

### 7C. Strategy Change Processing

When strategy-service emits `strategy.loadout.changed`, the scheduler may
need to adjust default lane mix or scheduling parameters.

- [ ] Add handler for `strategy.loadout.changed` event
- [ ] Update user-level scheduling preferences (lane mix defaults, target
      retention)
- [ ] This requires a user-level preferences store in scheduler (or rely on
      strategy-service as source of truth via MCP tool call)
- [ ] Deferred until strategy-service exists

---

## Phase 8 — MCP Tool Expansion

Currently only 1 tool exists (`plan-dual-lane`). The MCP Tool Registry
lists 3 scheduler-service tools as NOT_BUILT. With Phases 4-6, we fill the
gap.

### Summary of new MCP tools to register in `scheduler.tools.ts`:

| Tool Name                      | Phase | Priority |
| ------------------------------ | ----- | -------- |
| `get-srs-schedule`             | 4A    | P0       |
| `update-card-scheduling`       | 4B    | P0       |
| `batch-update-card-scheduling` | 4C    | P1       |
| `predict-retention`            | 4D    | P1       |
| `get-card-projection`          | 4E    | P2       |
| `propose-session-candidates`   | 5A    | P1       |
| `propose-review-windows`       | 5B    | P2       |
| `reconcile-session-candidates` | 5C    | P2       |
| `apply-session-adjustments`    | 5D    | P2       |
| `optimize-fsrs-parameters`     | 6C    | P2       |

- [ ] For each tool: register `IToolDefinition` + `ToolHandler` in
      `scheduler.tools.ts`
- [ ] Update MCP Tool Registry doc with status changes
      (`NOT_BUILT` → `BUILDING` → `EXISTS`)

---

## Phase 9 — Testing Gaps

### 9A. HLR Algorithm Unit Tests

`algorithms/hlr.ts` has 203 lines of HLR implementation with zero unit
tests. Critical to validate against the reference Python implementation.

- [ ] `tests/unit/domain/hlr.test.ts`
  - `predict()` with known feature vectors and delta values
  - `halflife()` boundary conditions (MIN_HALF_LIFE, MAX_HALF_LIFE)
  - `trainUpdate()` weight convergence direction
  - `pclip()` and `hclip()` boundary clamping
  - `getWeights()` / `loadWeights()` serialization round-trip
  - Compare outputs against Python reference (`third-party/halflife-regression/`)

### 9B. Event Consumer Unit Tests

The monolithic `scheduler-event-consumer.ts` (formerly 1 200 lines) has been
decomposed into `BaseEventConsumer` + 4 concrete consumers (ADR-0039). Phase-5
reliability tests (`scheduler-event-consumer-phase5.test.ts`, 3 tests) now
target the concrete consumers directly. Additional per-consumer test coverage
is recommended.

- [ ] `tests/unit/events/session-started.consumer.test.ts`
  - `handleSessionStarted` — creates SchedulerCard records for initial cards
- [ ] `tests/unit/events/review-recorded.consumer.test.ts`
  - `handleReviewRecorded` — creates Review + updates card counters
  - `handleReviewRecorded` — idempotency (duplicate attemptId ignored)
- [ ] `tests/unit/events/content-seeded.consumer.test.ts`
  - `handleContentSeeded` — creates SchedulerCard for new cards
  - Invalid payload rejection
- [ ] `tests/unit/events/session-cohort.consumer.test.ts`
  - `handleCohort*` — handshake state transitions
  - Stale revision guard
- [ ] `tests/unit/events/base-consumer.test.ts`
  - Retry logic: backoff timing, requeue to source stream
  - Dead-letter: moves to DL stream after max attempts
  - `ensureConsumerGroup` BUSYGROUP handling

### 9C. Repository Integration Tests

Three Prisma repositories have zero integration tests.

- [ ] `tests/integration/database/prisma-scheduler-card.repository.test.ts`
  - CRUD operations, findDueCards, findByLane, findByState, count, countDue
  - Optimistic locking (version conflict), batch create
  - Unique constraint on (userId, cardId)
- [ ] `tests/integration/database/prisma-review.repository.test.ts`
  - Create, findByAttemptId (idempotency), findByCard, findBySession
  - Unique constraint on attemptId
- [ ] `tests/integration/database/prisma-calibration-data.repository.test.ts`
  - CRUD + upsert, unique constraint on (userId, cardId)

### 9D. API Route Integration Tests

- [ ] `tests/integration/api/scheduler.routes.test.ts`
  - `POST /v1/scheduler/dual-lane/plan` — success, auth failure, validation
    error
  - Auth enforcement: userId mismatch → 400
  - Legacy alias endpoint forwards correctly
- [ ] `tests/integration/api/health.routes.test.ts`
  - `/health`, `/health/live`, `/health/ready`

### 9E. MCP Tool Route Tests

- [ ] `tests/integration/api/tool.routes.test.ts`
  - `GET /v1/tools` — returns tool definitions
  - `POST /v1/tools/execute` — tool execution, unknown tool, auth

---

## Phase 10 — Observability & Operational Hardening

### 10A. OpenTelemetry Tracing

- [ ] Add `@opentelemetry/sdk-node` + `@opentelemetry/auto-instrumentations`
- [ ] Instrument key spans: `planDualLaneQueue`, `updateCardSchedule`,
      `predictRetention`, `getReviewQueue`
- [ ] Propagate trace context through Redis event consumer
- [ ] Export to OTLP collector (configurable endpoint)

### 10B. Prometheus Metrics

- [ ] Add `prom-client` and Fastify metrics plugin
- [ ] Expose `GET /metrics` endpoint
- [ ] Key counters: `scheduler_plans_total`, `scheduler_reviews_processed`,
      `scheduler_events_dead_lettered`
- [ ] Key histograms: `scheduler_plan_duration_seconds`,
      `scheduler_prediction_duration_seconds`
- [ ] Key gauges: `scheduler_due_cards` (per-user, sampled)

### 10C. Rate Limiting

- [ ] Add per-user rate limits on tool execution routes
- [ ] Add global rate limits on scheduler REST endpoints
- [ ] Return `429 Too Many Requests` with `Retry-After` header

### 10D. OpenAPI Contract Sync

- [ ] Update `DualLanePlan` schema from `v1` to `v2` (add
      `cardPriorityScores`, `interleave`, `cardDetails`, spillover counts)
- [ ] Add `cardPriorityScores` + `interleave` to `DualLanePlanRequest` schema
- [ ] Validate contract on CI with `openapi:validate:scheduler` script

---

## Suggested Implementation Order

**Priority 1 — Learning Agent unblocks (do first):**
1. Phase 4A (Review Queue) — Learning Agent P0 dependency
2. Phase 4B (Card Schedule Update) — Learning Agent P0 dependency
3. Phase 9A (HLR unit tests) — de-risk existing algorithm code
4. Phase 9B (Per-consumer unit tests) — cover decomposed consumers (ADR-0039)

**Priority 2 — Scheduling engine completeness:**
5. Phase 4D (Retention Prediction) — stateless, self-contained
6. Phase 4E (Card Projection) — builds on 4D
7. Phase 6A (FSRS Core Algorithm) — enables autonomous scheduling
8. Phase 6B (FSRS State Machine) — wires FSRS into card updates

**Priority 3 — Session orchestration:**
9. Phase 5A (Session Candidate Proposal) — agent session-creation flow
10. Phase 4C (Batch Schedule Update) — post-session bulk commit
11. Phase 5B (Review Window Proposal)
12. Phase 5C (In-Session Reconciliation)
13. Phase 5D (Session Adjustments)

**Priority 4 — Operational maturity:**
14. Phase 7A (Post-Review Scheduling in Consumer) — needs FSRS (Phase 6)
15. Phase 10D (OpenAPI Contract Sync) — keep contract accurate
16. Phase 9C-E (Integration & route tests)
17. Phase 10A-C (Observability)
18. Phase 7B-C (Checkpoint & strategy event handling)
19. Phase 6C (FSRS Parameter Optimization)

---

**Status:** ⬜ Not started — plan documented
