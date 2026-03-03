# Phase 2 — Event Consumers & Cross-Service Data Flow

> **Codename:** `Neurotransmission` **Depends on:** Phase 0 (API Gateway), Phase
> 1 (JWT — so services can auth each other) **Unlocks:** Phase 3 (Scheduler Read
> API — needs SchedulerCard data to exist), Frontend Phase 5 (Dashboard),
> Frontend Phase 7 (Session Engine), Frontend Phase 9 (Schedule Intelligence)
> **Estimated effort:** 4–5 days

---

## Why This Exists

Neurons fire. Neurotransmitters cross the synapse. The target neuron responds.
This is how the brain works — through chemical signaling between discrete cells.

Noema's backend has the neurons (6 services) and the vesicles (Redis Streams
event publishing via `@noema/events`). Every service publishes domain events:
`CardCreated`, `UserLoggedIn`, `SessionCompleted`, etc. But **every single
`events/consumers/` directory is empty**. Events are being shouted into the
void.

This means:

- **The scheduler has no data.** When a user creates a card in the
  content-service, no `SchedulerCard` row is created in the scheduler-service.
  The dual-lane plan, review windows, and session candidates all query the
  `scheduler_cards` table — if it's empty, they return nothing. The entire
  scheduling system is inert.

- **Deletion doesn't cascade.** When a user is deleted, their sessions, cards,
  PKG nodes, and scheduler entries remain as orphans. When a card is deleted,
  its scheduler entry still shows up in review plans.

- **Sessions don't produce reviews.** When a session attempt is recorded, the
  scheduler doesn't know about it. No `Review` rows are created. The review
  history that the frontend's Card Schedule Inspector (Phase 9) needs is never
  populated.

This phase implements the minimum viable set of event consumers that wire the
services together into a functioning system.

---

## Background: How the Event System Works

All 5 TypeScript services use `RedisEventPublisher` from
`@noema/events/publisher`. Events are published to Redis Streams as JSON
payloads with a type discriminator. Each service's `events/consumers/` directory
is intended to hold consumer implementations that subscribe to these streams.

The `@noema/events` package already defines typed event schemas for all 5
services. The infrastructure for reading streams likely follows the
[Redis Streams consumer group pattern](https://redis.io/docs/data-types/streams-tutorial/#consumer-groups):
each consuming service belongs to a consumer group and receives each event
exactly once (at-least-once delivery with the existing idempotent inbox pattern
in scheduler-service).

The scheduler-service already has a `SchedulerEventInbox` model for idempotent
processing — the infrastructure is ready, just no consumers are wired up.

---

## Tasks

### T2.1 — Card Lifecycle Consumer in Scheduler-Service

**Purpose:** When the content-service creates, deletes, or changes the state of
a card, the scheduler-service must mirror that lifecycle in its own
`scheduler_cards` table. Without this, the scheduler literally has nothing to
schedule.

**Events consumed:**

| Event              | Action                                                                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CardCreated`      | Create a new `SchedulerCard` row with default FSRS parameters, lane assignment (`RETENTION` by default for new cards), state `NEW`, `schedulingAlgorithm: 'fsrs'`, and `nextReviewDate` set to now (immediately available for first study) |
| `CardDeleted`      | Soft-delete: set `SchedulerCard.state = 'SUSPENDED'`. Do not hard-delete — the scheduler may need the historical data for analytics. If `hardDelete=true` in the event payload, then actually delete the row.                              |
| `CardStateChanged` | If card transitions to `SUSPENDED` or `ARCHIVED` → set `SchedulerCard.state = 'SUSPENDED'`. If card transitions back to `ACTIVE` → restore `SchedulerCard.state` to its previous learning state (or `REVIEW` if unknown).                  |

**Default FSRS initialization parameters** (for newly created `SchedulerCard`):

- `stability`: from the FSRS default initial stability (typically ~1.0 for easy,
  ~0.5 for harder — but since we don't know the card's content yet, use a
  neutral default like 1.0)
- `difficultyParameter`: 0.5 (mid-range)
- `halfLife`: null (HLR predictions are computed on-demand, not stored at
  creation)
- `interval`: 0 (not yet reviewed)
- `nextReviewDate`: creation timestamp (available immediately)
- `reviewCount`: 0
- `lapseCount`: 0
- `consecutiveCorrect`: 0
- `lane`: determined by a lane assignment heuristic: new cards default to
  `RETENTION`; if the card's type is a remediation type (the 20 remediation card
  types from the enum), default to `CALIBRATION`

**Idempotency:** Use the `SchedulerEventInbox` model. Before processing any
event, check if the event ID has already been processed. If so, skip. After
processing, record the event ID. This prevents duplicate `SchedulerCard` rows if
an event is delivered more than once.

**Consumer location:**
`services/scheduler-service/src/events/consumers/card-lifecycle.consumer.ts`

### T2.2 — Session Attempt Consumer in Scheduler-Service

**Purpose:** When the session-service records an attempt, the scheduler-service
needs to create a `Review` row and update the `SchedulerCard`'s scheduling
parameters. This is how the scheduler learns from the user's performance.

**Events consumed:**

| Event             | Action                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `AttemptRecorded` | Create a `Review` row with all attempt data, then run the scheduling algorithm to update the `SchedulerCard` |

**What happens on `AttemptRecorded`:**

1. **Validate the event:** Ensure the `cardId` has a corresponding
   `SchedulerCard`. If not (shouldn't happen if T2.1 works, but defensive
   coding), create the `SchedulerCard` with defaults first.

2. **Create a Review row** in `scheduler_service.reviews`:
   - `cardId`, `userId`, `sessionId`, `attemptId` — from the event
   - `rating` and `ratingValue` — from the attempt's rating (AGAIN=1, HARD=2,
     GOOD=3, EASY=4)
   - `outcome` — from the attempt's outcome (CORRECT, INCORRECT, PARTIAL,
     SKIPPED)
   - `deltaDays` — computed as the number of days since the card's last review
     (`now - SchedulerCard.lastReviewedAt`)
   - `responseTime` — from the attempt's `responseTimeMs`
   - `reviewedAt` — the event's timestamp
   - `priorState` — snapshot of the `SchedulerCard`'s current parameters before
     update
   - `newState` — the computed new parameters after update (filled after step 3)
   - `algorithm`, `lane` — from the `SchedulerCard`
   - Metacognitive signals: `confidenceBefore`, `confidenceAfter`,
     `calibrationDelta`, `hintDepthReached` — all from the event

3. **Run the scheduling algorithm:**
   - If `SchedulerCard.schedulingAlgorithm === 'fsrs'`:
     - Apply the FSRS update formula to compute new `stability`, `difficulty`,
       and `interval` based on the rating
     - Follow the FSRS-4.5 or FSRS-5 algorithm specification
   - If `schedulingAlgorithm === 'hlr'`:
     - Call the HLR sidecar's `POST /train` endpoint with the observation data
     - The sidecar updates its internal model weights
     - Compute the new half-life from the updated model
   - Update `SchedulerCard`: `nextReviewDate`, `interval`, `reviewCount += 1`,
     `lapseCount` (increment if rating was AGAIN), `consecutiveCorrect` (reset
     if incorrect, increment if correct), `state` transition (NEW → LEARNING →
     REVIEW → RELEARNING based on FSRS state machine)

4. **Update the Review row's `newState`** with the computed parameters

**Why this consumer is critical:** Without it, the scheduler never learns. The
dual-lane plan will keep recommending the same cards forever because no reviews
are recorded and no scheduling parameters change.

**Consumer location:**
`services/scheduler-service/src/events/consumers/attempt-review.consumer.ts`

### T2.3 — User Deletion Cascade Consumer

**Purpose:** When a user is deleted, clean up their data across all services.
Without this, orphaned rows accumulate forever.

**Events consumed:**

| Event         | Service                 | Action                                                                                                                          |
| ------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `UserDeleted` | content-service         | Soft-delete all cards + templates owned by the user. Delete media files (queue for async cleanup).                              |
| `UserDeleted` | session-service         | Abandon all active sessions for the user. Mark historical sessions as belonging to a deleted user (don't delete — audit trail). |
| `UserDeleted` | scheduler-service       | Delete all `SchedulerCard` and `Review` rows for the user.                                                                      |
| `UserDeleted` | knowledge-graph-service | Delete the user's entire PKG (all nodes, edges, operation log). Delete metric snapshots and misconception detections.           |

**Cascade order does not matter** since each consumer operates on its own
database independently. They can all process in parallel.

**Soft vs hard:** Follow the event's `hardDelete` flag. If
`hardDelete === true`, permanently delete rows. If `false` (soft delete), mark
records as belonging to a deleted user but preserve them for a grace period
(admin undo capability).

**Consumer locations:**

- `services/content-service/src/events/consumers/user-deleted.consumer.ts`
- `services/session-service/src/events/consumers/user-deleted.consumer.ts`
- `services/scheduler-service/src/events/consumers/user-deleted.consumer.ts`
- `services/knowledge-graph-service/src/events/consumers/user-deleted.consumer.ts`

### T2.4 — Session Lifecycle Consumers

**Purpose:** Other services need to react to session lifecycle events.

**Events consumed:**

| Event              | Service           | Action                                                                                                                                                                                                                                                                               |
| ------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SessionCompleted` | scheduler-service | Commit the session's scheduling decisions: batch-update all `SchedulerCard` records for cards in the session with their final computed `nextReviewDate` and updated parameters. This is the "schedule commit" that makes the next dual-lane plan reflect what the user just studied. |
| `SessionAbandoned` | scheduler-service | Partial commit: update scheduling parameters for cards that _were_ attempted, but don't penalize cards that were in the queue but never seen.                                                                                                                                        |

**Why session lifecycle events matter:** The dual-lane plan queries
`SchedulerCard.nextReviewDate` to determine what's due. If session completion
doesn't update `nextReviewDate`, the same cards will appear in every plan
forever.

**Consumer location:**
`services/scheduler-service/src/events/consumers/session-lifecycle.consumer.ts`

### T2.5 — Consumer Infrastructure & Registration

Each service needs a consumer registration mechanism that:

1. **Starts on service boot:** After the service starts and connects to Redis,
   begin consuming from the relevant streams
2. **Uses consumer groups:** Each service has its own consumer group name (e.g.,
   `scheduler-service`, `content-service`). This ensures each service gets every
   event exactly once (within its group)
3. **Acknowledges processed events:** After successful processing, ACK the
   message so it isn't redelivered
4. **Handles failures gracefully:** If processing fails, NACK the message and
   retry (with exponential backoff). After N retries, move to a dead-letter
   stream for manual investigation
5. **Uses idempotent processing:** Every consumer must be idempotent. This is
   already patterned in the scheduler-service via `SchedulerEventInbox`. Extend
   this pattern to all consuming services.

**Implementation approach:**

- Create a `ConsumerRegistry` utility in `@noema/events` (or per-service) that
  registers handler functions for event types
- Each consumer file exports a handler:
  `async function handleCardCreated(event: CardCreatedEvent): Promise<void>`
- The registry maps event types to handlers and manages the Redis Streams
  subscription

---

## Acceptance Criteria

- [ ] Creating a card in content-service automatically creates a `SchedulerCard`
      row in scheduler-service within 5 seconds
- [ ] Deleting a card suspends the corresponding `SchedulerCard`
- [ ] Archiving/suspending a card suspends the `SchedulerCard`; reactivating
      restores it
- [ ] Recording a session attempt creates a `Review` row in scheduler-service
- [ ] The FSRS algorithm updates `SchedulerCard` parameters correctly after a
      review
- [ ] After completing a session, `nextReviewDate` is updated for all attempted
      cards
- [ ] Deleting a user cascades to content-service, session-service,
      scheduler-service, and knowledge-graph-service
- [ ] All consumers are idempotent — processing the same event twice produces
      the same result
- [ ] Failed events are retried with backoff and eventually moved to a
      dead-letter stream
- [ ] Consumer groups are correctly registered — each service receives each
      event exactly once
- [ ] A full end-to-end test works: create card → start session → record attempt
      → verify Review row exists and SchedulerCard is updated → complete session
      → verify nextReviewDate changed

---

## Files Created / Touched

| File                                                                             | Action                                                                    |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `services/scheduler-service/src/events/consumers/card-lifecycle.consumer.ts`     | **New** — handles CardCreated, CardDeleted, CardStateChanged              |
| `services/scheduler-service/src/events/consumers/attempt-review.consumer.ts`     | **New** — handles AttemptRecorded, creates Review + updates SchedulerCard |
| `services/scheduler-service/src/events/consumers/session-lifecycle.consumer.ts`  | **New** — handles SessionCompleted, SessionAbandoned                      |
| `services/scheduler-service/src/events/consumers/user-deleted.consumer.ts`       | **New** — handles UserDeleted cascade                                     |
| `services/content-service/src/events/consumers/user-deleted.consumer.ts`         | **New** — handles UserDeleted cascade                                     |
| `services/session-service/src/events/consumers/user-deleted.consumer.ts`         | **New** — handles UserDeleted cascade                                     |
| `services/knowledge-graph-service/src/events/consumers/user-deleted.consumer.ts` | **New** — handles UserDeleted cascade                                     |
| `packages/events/src/consumer.ts`                                                | **New** or **Updated** — consumer group infrastructure                    |
| `services/*/src/index.ts` or `server.ts`                                         | Updated — register consumers on boot                                      |
