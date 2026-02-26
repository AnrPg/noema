# ADR-0039: Scheduler Event Consumer Decomposition

## Status

Accepted

## Date

2026-02-25

## Context

The scheduler-service event consumer (`scheduler-event-consumer.ts`) had grown
to ~1 200 lines, combining six orthogonal responsibilities in a single class:

1. **Redis Streams lifecycle** — XREADGROUP poll loop, consumer group creation,
   XAUTOCLAIM pending recovery, graceful drain.
2. **Reliability infrastructure** — inbox claim/dedup, revision guards,
   idempotency key building, observability spans.
3. **`session.started` handling** — bootstrap SchedulerCard records.
4. **`attempt.recorded` / `review.submitted` handling** — FSRS/HLR algorithm
   invocation, state machine transitions, calibration persistence.
5. **`content.seeded` handling** — card creation with lane assignment.
6. **`session.cohort.*` handling** — propose/accept/revise/commit handshake
   transitions with lineage metadata and event publishing.

This monolithic design made the consumer difficult to navigate, test in
isolation, and extend with new event types. It also diverged from the
content-service, which had already adopted an abstract `BaseEventConsumer` +
per-stream concrete descendant pattern (ADR-0038).

## Decision

### 1) Extract Abstract `BaseEventConsumer`

Created `consumers/base-consumer.ts` (~630 lines) containing all reusable
infrastructure:

- **Redis Streams lifecycle**: `ensureConsumerGroup()`, `pollLoop()`,
  `recoverPendingMessages()` via XAUTOCLAIM, bounded `drainAndStop()`.
- **Reliability repository integration**: `claimInbox()` / dedup,
  `markInboxProcessed()` / `markInboxFailed()`, revision guard via
  `readLatestSessionRevision()`.
- **Observability**: `schedulerObservability.startSpan()` wrapping each message.
- **Helpers**: `extractLinkage()`, `buildIdempotencyKey()`, retry with
  exponential backoff, dead-letter routing.
- **In-flight tracking**: Promise set for graceful drain on shutdown.
- **Abstract contract**: subclasses implement
  `dispatchEvent(envelope, messageId)`.

### 2) Create Per-Stream Concrete Consumers

| Consumer                   | Events handled                                                                 | Lines |
| -------------------------- | ------------------------------------------------------------------------------ | ----- |
| `SessionStartedConsumer`   | `session.started`                                                              | ~93   |
| `ReviewRecordedConsumer`   | `attempt.recorded`, `review.submitted`                                         | ~394  |
| `ContentSeededConsumer`    | `content.seeded`                                                               | ~102  |
| `SessionCohortConsumer`    | `session.cohort.proposed/accepted/revised/committed`                          | ~216  |

Each consumer:

- Extends `BaseEventConsumer`.
- Implements `dispatchEvent()` with event-type filtering and Zod payload
  validation.
- Contains only domain-specific logic for its event stream(s).

### 3) Retain `SchedulerEventConsumer` as Thin Facade

`scheduler-event-consumer.ts` is reduced to ~56 lines. It:

- Instantiates all four concrete consumers.
- Delegates `start()` / `stop()` to them.
- Preserves the original constructor signature so `src/index.ts` and existing
  tests require zero changes.

### 4) File Layout

```
src/infrastructure/events/
├── scheduler-event-consumer.ts          ← facade (56 lines)
├── index.ts                             ← barrel: facade + consumers
└── consumers/
    ├── base-consumer.ts                 ← abstract base (~630 lines)
    ├── session-started.consumer.ts      ← session.started
    ├── review-recorded.consumer.ts      ← attempt.recorded / review.submitted
    ├── content-seeded.consumer.ts       ← content.seeded
    ├── session-cohort.consumer.ts       ← session.cohort.*
    └── index.ts                         ← barrel
```

## Consequences

### Positive

- **Single-responsibility**: Each consumer owns exactly one event domain.
- **Testable in isolation**: Tests can instantiate a specific consumer without
  pulling in unrelated event-handling logic.
- **Extensible**: Adding a new event type means adding a new consumer file and
  registering it in the facade — no modifications to existing consumers.
- **Cross-service consistency**: Scheduler now mirrors the content-service's
  `BaseEventConsumer` pattern (ADR-0038), reducing cognitive load for
  developers moving between services.
- **Preserved API**: The facade keeps the original public interface; no upstream
  changes needed.

### Negative

- **More files**: Six new files instead of one monolithic file. Navigation
  requires familiarity with the consumer hierarchy.
- **Shared base complexity**: `BaseEventConsumer` at ~630 lines is still
  substantial, though it is strictly infrastructure and rarely needs changes.

### Neutral

- All 123 scheduler-service tests continue to pass without modification to
  test assertions (only import paths were updated for phase-5 reliability
  tests).
- The facade pattern ensures backward compatibility for any code that
  constructs `SchedulerEventConsumer` directly.

## References

- [ADR-0029: Scheduler FSRS/HLR Runtime Integration (Phase 3)](./ADR-0029-scheduler-fsrs-hlr-runtime-integration-phase-3.md)
- [ADR-0031: Scheduler Event Handshake and Consumer Reliability (Phase 5)](./ADR-0031-scheduler-event-handshake-and-consumer-reliability-phase-5.md)
- [ADR-0032: Scheduler Observability, Backpressure, and Runbook (Phase 6)](./ADR-0032-scheduler-observability-backpressure-and-runbook-phase-6.md)
- [ADR-0038: Content Service Phase 6 — Event System](./ADR-0038-content-service-phase-6-event-system.md)

## Related Changes

### New Files

- `src/infrastructure/events/consumers/base-consumer.ts`
- `src/infrastructure/events/consumers/session-started.consumer.ts`
- `src/infrastructure/events/consumers/review-recorded.consumer.ts`
- `src/infrastructure/events/consumers/content-seeded.consumer.ts`
- `src/infrastructure/events/consumers/session-cohort.consumer.ts`
- `src/infrastructure/events/consumers/index.ts`

### Modified Files

- `src/infrastructure/events/scheduler-event-consumer.ts` — replaced monolithic
  implementation (~1 200 lines) with thin facade (~56 lines)
- `src/infrastructure/events/index.ts` — extended barrel to re-export consumers
- `tests/unit/domain/scheduler-event-consumer-phase5.test.ts` — updated imports
  to target concrete consumers instead of facade
