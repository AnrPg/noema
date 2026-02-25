# ADR-0038: Content Service Phase 6 — Event System

## Status

Accepted

## Date

2026-02-25

## Context

The content-service is a pure card archive that publishes events but does not
consume them. Cross-service reactivity is needed so that:

1. **User deletion** cascades to content — when user-service emits
   `user.deleted`, all cards, templates, and media for that user must be
   soft-deleted (or hard-deleted for GDPR erasure).
2. **Knowledge graph node deletion** unlinks cards — when
   knowledge-graph-service emits `kg.node.deleted`, the deleted node ID must be
   removed from all cards' `knowledgeNodeIds` arrays.
3. **Review attempt recording** enriches cards — when session-service emits
   `attempt.recorded`, the reviewed card's metadata should be updated with
   rolling review statistics (accuracy, review count, response time).

The Phase 6 specification (`PHASE-6-EVENT-SYSTEM.md`) prescribed a
`SessionCompletedConsumer` to capture per-card review results from
`session.completed` events. However, analysis of the `@noema/events` package
revealed that `ISessionCompletedPayload` contains only aggregate session
statistics — **not** per-card results. Per-card data is carried by
`IAttemptRecordedPayload` in `attempt.recorded` events.

## Decision

### 1. Replace SessionCompletedConsumer with AttemptRecordedConsumer

We replace the spec's `SessionCompletedConsumer` with an
`AttemptRecordedConsumer` that listens for `attempt.recorded` events. This
gives per-card granularity: `cardId`, `rating`, `outcome`, `responseTimeMs`.

### 2. Production-grade consumer infrastructure (scheduler-aligned)

We build a `BaseEventConsumer` abstract class modelled on the
scheduler-service's `SchedulerEventConsumer`, providing:

- **Redis Streams XREADGROUP** with consumer groups
- **Idempotent group creation** (handles `BUSYGROUP`)
- **XAUTOCLAIM** pending message recovery for crash resilience
- **Exponential backoff retry** with configurable base delay, capped at 30 s
- **Dead-letter queue** after max retry attempts (default: 5)
- **In-flight tracking** with drain timeout for graceful shutdown
- **Single `event` field parsing** aligned with `RedisEventPublisher`

### 3. Configurable stream keys via environment variables

Stream keys default to the Noema convention (`noema:events:{service-name}`) but
can be overridden via `EVENT_STREAM_USER`, `EVENT_STREAM_KG`, and
`EVENT_STREAM_SESSION` environment variables.

### 4. Agent hints module

A hint generator module (`src/agents/hints/`) produces structured `IContentHint`
objects for state transitions and card quality signals, giving downstream AI
agents actionable metadata.

## Spec Corrections

Two corrections were made to the Phase 6 specification:

1. **Event field format mismatch**: The spec's `parseStreamMessage` assumed flat
   `type`/`data`/`metadata` Redis fields. The actual `RedisEventPublisher` uses
   a single `event` field containing the full JSON envelope. The base consumer
   uses `getFieldValue(fields, 'event')` to extract and parse it.

2. **`session.completed` lacks per-card data**: The spec assumed
   `ISessionCompletedPayload` carries per-card `cardResults[]`. It does not —
   it only contains aggregate `stats: ISessionStatsSnapshot`. Per-card data
   lives in `IAttemptRecordedPayload`.

## Consequences

### Positive

- Content-service now reacts to cross-service events (user deletion, KG node
  deletion, review attempts) automatically.
- Consumer infrastructure is production-grade — crash-safe, retryable, with
  dead-letter queues for operator visibility.
- Card metadata is enriched with review statistics, enabling agents and UIs to
  display learning progress without querying the session-service.
- Consumer groups ensure at-least-once delivery and horizontal scaling.
- Agent hints module provides structured guidance for AI agents.

### Negative

- Three long-running background loops increase memory and connection footprint.
- Dead-letter queues require operational monitoring.
- Per-attempt metadata updates create write amplification on high-frequency
  review sessions.

### Neutral

- Consumers are disabled via `EVENT_CONSUMERS_ENABLED=false` for testing and
  development isolation.
- Stream keys are configurable for multi-tenant or staging deployments.

## Files Changed

### New Files

- `src/events/consumers/base-consumer.ts` — Abstract `BaseEventConsumer`
- `src/events/consumers/user-deleted.consumer.ts` — `UserDeletedConsumer`
- `src/events/consumers/kg-node-deleted.consumer.ts` — `KgNodeDeletedConsumer`
- `src/events/consumers/attempt-recorded.consumer.ts` — `AttemptRecordedConsumer`
- `src/events/consumers/index.ts` — Barrel export
- `src/agents/hints/content.hints.ts` — Hint generators
- `src/agents/hints/index.ts` — Barrel export
- `tests/unit/events/event-consumers.test.ts` — 14 consumer tests
- `tests/unit/agents/content-hints.test.ts` — 9 hint generator tests

### Modified Files

- `src/config/index.ts` — Added `consumers` config section
- `src/index.ts` — Consumer initialization, start, graceful shutdown
- `src/events/index.ts` — Added consumers barrel re-export
