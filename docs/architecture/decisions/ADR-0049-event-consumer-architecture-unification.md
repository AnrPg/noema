# ADR-0049: Event Consumer Architecture Unification (Phase 2)

## Status

Accepted

## Date

2025-07-25

## Context

Before Phase 2 ("Neurotransmission — Event Consumers & Cross-Service Data
Flow"), the event consumer landscape had several inconsistencies:

1. **Two divergent base consumers** — The content-service had its own
   `BaseEventConsumer` (~200 lines) and the scheduler-service had a separate
   monolithic `BaseEventConsumer` (~630 lines with reliability/observability
   baked in). These shared no code despite implementing the same Redis Streams
   XREADGROUP lifecycle.

2. **Inconsistent file layout** — Scheduler consumers lived under
   `src/infrastructure/events/consumers/`, while content-service used
   `src/events/consumers/`. Session-service and knowledge-graph-service had no
   consumers at all.

3. **Missing cross-service event flows** — No service reacted to `user.deleted`
   events. Card lifecycle events (`card.created`, `card.deleted`,
   `card.state.changed`) from content-service were not consumed by the
   scheduler. Session completion/abandonment events were not forwarded for
   scheduler analytics.

4. **No GDPR erasure path** — When a user was deleted, there was no automated
   mechanism to cascade the deletion across service boundaries. Each service's
   data (sessions, scheduler cards, reviews, PKG nodes, operation logs, etc.)
   would remain orphaned.

5. **Inconsistent config shapes** — The scheduler-service config had flat
   `redis.sourceStreamKey`, `redis.consumerGroup`, etc. fields that conflated
   connection config with consumer config. Other services used different shapes
   or had no consumer config at all.

## Decision

### 1) Single Shared Base Consumer in `@noema/events/consumer`

Created `BaseEventConsumer` (~491 lines) in `packages/events/src/consumer/`:

- **Redis Streams lifecycle**: Idempotent `XGROUP CREATE`, `XREADGROUP` poll
  loop, `XAUTOCLAIM` pending message recovery, `XACK` acknowledgement.
- **Retry with backoff**: Exponential backoff (capped at 30s), configurable
  `maxProcessAttempts` before dead-letter routing.
- **Dead-letter queue**: Messages exceeding max attempts are `XADD`'d to a
  per-consumer DLQ stream.
- **In-flight tracking**: Promise set for graceful drain on shutdown.
- **Drain with timeout**: `drain()` waits for in-flight messages with
  configurable timeout.
- **Abstract contract**:
  `handleEvent(envelope: IStreamEventEnvelope): Promise<boolean>`

Published as `@noema/events/consumer` subpath export. All services import from
this single source.

### 2) Service-Specific Subclass Only When Needed

The **scheduler-service** requires additional middleware that no other service
needs:

- **Inbox dedup** via `ISchedulerEventReliabilityRepository.claimInbox()`
- **Session revision guards** (optimistic concurrency on session events)
- **Observability spans** via `schedulerObservability.startSpan()`
- **Idempotency key building** (SHA-256 of event payload)

This middleware is encapsulated in `SchedulerBaseConsumer` (~306 lines) which
extends `BaseEventConsumer` and adds:

- `abstract dispatchEvent(envelope): Promise<void>`
- `setDependencies(deps: ISchedulerConsumerDependencies)` for post-construction
  DI

Other services (content-service, session-service, knowledge-graph-service)
extend `BaseEventConsumer` directly with no service-specific subclass.

### 3) Uniform File Layout

All services now place consumers under:

```
src/events/consumers/
  ├── index.ts                    # barrel export
  ├── <event-name>.consumer.ts    # one file per consumer
  └── <optional-base>.ts          # service-specific subclass (if any)
```

The scheduler-service's old `src/infrastructure/events/consumers/` directory was
deleted entirely.

### 4) Per-Consumer `buildConfig()` Factory

Each consumer exports a `buildConfig({ sourceStreamKey, consumerName })` factory
that returns a complete `IEventConsumerConfig`:

```typescript
function buildConfig(overrides: {
  sourceStreamKey: string;
  consumerName: string;
}): IEventConsumerConfig {
  return {
    sourceStreamKey: overrides.sourceStreamKey,
    consumerGroup: 'scheduler-service:review-recorded',
    consumerName: overrides.consumerName,
    batchSize: 20,
    blockMs: 5000,
    retryBaseDelayMs: 500,
    maxProcessAttempts: 5,
    pendingIdleMs: 60_000,
    pendingBatchSize: 50,
    drainTimeoutMs: 15_000,
    deadLetterStreamKey: 'noema:dlq:scheduler-service:review-recorded',
  };
}
```

This moves tuning constants close to the consumer that owns them, rather than
centralizing everything in config.

### 5) Uniform Config Section for All Services

Every service now has a `consumers` section in its config:

```typescript
consumers: {
  enabled: boolean;
  consumerName: string;
  streams: {
    userService: string;
    sessionService: string;
    contentService: string;
  }
}
```

`enabled` gates consumer initialization. `consumerName` defaults to
`<service-name>-<pid>`. `streams` maps source services to their Redis stream
keys.

### 6) Lane Assignment Heuristic

Card lifecycle events from content-service need to determine whether a newly
created card belongs to the CALIBRATION lane (HLR algorithm) or RETENTION lane
(FSRS algorithm).

The heuristic uses `RemediationCardType` from `@noema/types`:

```typescript
const REMEDIATION_CARD_TYPES = new Set<string>(
  Object.values(RemediationCardType)
);

function assignLane(cardType: string): SchedulerLane {
  return REMEDIATION_CARD_TYPES.has(cardType) ? 'calibration' : 'retention';
}
```

O(1) lookup via Set. All 20 remediation types route to CALIBRATION; all other
card types route to RETENTION.

### 7) GDPR Erasure via `user.deleted` Events

Three services now consume `user.deleted`:

| Service               | Soft Delete Behavior                          | Hard Delete Behavior (GDPR)                         |
| --------------------- | --------------------------------------------- | --------------------------------------------------- |
| **content-service**   | Archive cards, templates, media               | Delete all content + history                        |
| **session-service**   | Abandon active/paused sessions                | Delete sessions, attempts, queue items, handshakes  |
| **scheduler-service** | Suspend all SchedulerCards                    | Delete cards, reviews, calibration data             |
| **KG-service**        | Soft-delete PKG nodes, resolve misconceptions | DETACH DELETE PKG nodes, delete operations, metrics |

Each consumer uses bulk `deleteMany` operations for efficiency rather than
iterating individual records.

### 8) Session Lifecycle Analytics

New `session-lifecycle.consumer.ts` in the scheduler-service handles
`session.completed` and `session.abandoned` events:

- **session.completed**: Fetches all reviews for the session from the
  scheduler's review repository, logs session analytics, and publishes a
  `scheduler.session.analytics` event for downstream consumption.
- **session.abandoned**: Similar but records partial commit data (only reviews
  that were actually recorded before abandonment).

This provides the analytics pipeline with session-level signal quality metrics
without requiring scheduler-to-session direct queries.

## Alternatives Considered

### A. Service-specific base consumers everywhere (status quo)

Each service maintains its own base consumer with duplicated lifecycle code.
**Rejected**: Violated the project's explicit goal of "ONE pattern rather than
parallel paradigms." Made cross-cutting improvements (backoff tuning, DLQ format
changes) require N separate edits.

### B. Shared base via class mixin

Use TypeScript mixins to compose lifecycle + reliability + observability.
**Rejected**: Mixins add complexity with limited TypeScript tooling support
(go-to-definition, type narrowing). A simple `extends` chain is more
discoverable for entry-level developers.

### C. Event bus abstraction (publish/subscribe)

Abstract over Redis Streams with a generic event bus. **Rejected**: Premature
abstraction. The project uses Redis Streams exclusively. The XREADGROUP API
surface is well-understood and doesn't need hiding behind another layer.

### D. Per-consumer process (separate deployments)

Deploy each consumer as an independent process/container. **Rejected**:
Operational overhead is too high for the current team size. In-process consumers
with per-consumer `stop()`/`drain()` provide sufficient independence with
single-deployment simplicity.

## Consequences

### Positive

- **One base consumer** for all services — cross-cutting improvements propagate
  automatically.
- **Consistent file layout** makes it easy to find consumers in any service.
- **GDPR compliance** via automated cascading `user.deleted` handling.
- **Entry-level friendly** — predictable structure, one pattern to learn.
- **Lane assignment** is explicit and auditable via `RemediationCardType` set.

### Negative

- **Scheduler subclass** adds one extra class in the inheritance chain —
  contributors must understand both layers.
- **Neo4j dependency in KG consumer** means integration testing requires a Neo4j
  instance (but the service already requires this).

### Risks

- If Redis Streams are replaced (e.g., with Kafka), the base consumer
  abstraction will need rewriting — but so would any consumer regardless of this
  ADR.
- Bulk `deleteMany` for GDPR erasure may cause lock contention on large
  datasets. Mitigated by the fact that user deletion is a rare, low-QPS
  operation.

## Follow-up Work

- [ ] Add consumer health reporting to each service's `/health` endpoint.
- [ ] Add per-consumer DLQ alerting (monitor DLQ stream length).
- [ ] Consider adding a `card.updated` consumer in scheduler-service for
      metadata changes (difficulty adjustments, tag changes).
- [ ] Evaluate whether session-service needs a `card.deleted` consumer to remove
      queue items for deleted cards from active sessions.
