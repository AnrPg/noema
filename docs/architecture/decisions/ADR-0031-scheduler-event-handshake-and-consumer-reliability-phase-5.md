# ADR-0031: Scheduler Event Handshake and Consumer Reliability (Phase 5)

## Status

Accepted

## Date

2026-02-24

## Context

Phase 4 established orchestration-capable MCP tools and enriched metadata, but
cross-service scheduler orchestration still had reliability gaps in event
processing and lineage durability.

The following gaps were unresolved:

- session cohort orchestration events were not explicitly modeled across
  propose/accept/revise/commit transitions;
- event consumers lacked a durable inbox dedupe mechanism for replay/duplication;
- startup pending recovery was not explicitly reclaiming orphaned consumer-group
  pending entries;
- shutdown behavior did not guarantee bounded drain of in-flight event work;
- handshake lineage state for reconciliation was not persisted as a first-class
  read model.

## Decision

### 1) Introduce First-Class Cohort Handshake Event Taxonomy

Expanded domain event contracts in `@noema/events` for session and scheduler
handshake flow:

- Session events:
  - `session.cohort.proposed`
  - `session.cohort.accepted`
  - `session.cohort.revised`
  - `session.cohort.committed`
- Scheduler events:
  - `schedule.handshake.proposed`
  - `schedule.handshake.accepted`
  - `schedule.handshake.revised`
  - `schedule.handshake.committed`

All handshake payloads require linkage identifiers:

- `correlationId`
- `proposalId`
- `decisionId`
- `sessionId`
- `sessionRevision`

### 2) Add Durable Consumer Inbox for Idempotency

Added `scheduler_event_inbox` with unique idempotency key and processing state
(`PROCESSING`, `PROCESSED`, `FAILED`).

Consumer behavior:

- claims an inbox row before dispatch;
- skips acknowledged duplicates deterministically;
- marks processing outcomes for replay diagnostics.

### 3) Add Handshake State Read Model

Added `scheduler_handshake_state` keyed by `(session_id, proposal_id)`.

Consumer applies monotonic state transitions with revision guard:

- transitions are upserted with latest linkage metadata;
- stale revisions are ignored when lower than persisted revision;
- lineage becomes queryable for reconciliation and audit.

### 4) Add Startup Pending Recovery (Claim/Replay)

Consumer startup now runs `XAUTOCLAIM` recovery against the configured stream and
consumer group:

- claims idle pending messages assigned to inactive consumers;
- reprocesses claimed entries through normal idempotency pipeline.

This preserves Redis Streams compatibility while keeping migration path open for
Kafka by preserving explicit claim/ack semantics in consumer logic.

### 5) Add Bounded Graceful Drain

Consumer shutdown now:

- stops intake;
- tracks in-flight processing promises;
- drains up to configurable timeout before final stop.

This reduces partial-processing risk during rolling restarts.

## Consequences

### Positive

- Replay/duplicate handling is deterministic and durable.
- Handshake lineage is queryable end-to-end by linkage IDs.
- Restart resilience improves via explicit pending reclaim.
- Shutdown behavior is operationally safer for in-flight work.
- Contracts are explicit and reusable for future Kafka consumers.

### Negative

- Additional DB tables and migration increase operational footprint.
- Consumer complexity increases with inbox/handshake orchestration logic.

### Neutral

- Existing review/content/session event processing remains intact and is now
  wrapped by stronger reliability guards.

## References

- [ADR-0028: Scheduler Agent Readiness Hardening](./ADR-0028-scheduler-agent-readiness-hardening.md)
- [ADR-0029: Scheduler FSRS/HLR Runtime Integration and State Machine](./ADR-0029-scheduler-fsrs-hlr-runtime-integration-phase-3.md)
- [ADR-0030: Scheduler MCP Tool Surface Expansion (Phase 4)](./ADR-0030-scheduler-mcp-tool-surface-expansion-phase-4.md)
- [MCP_TOOL_CONTRACT_STANDARD](../patterns/MCP_TOOL_CONTRACT_STANDARD.md)
- [Phase 5 — Event Handshake and Consumer Reliability](../../scheduler-agent-readiness/PHASE-5-EVENT-HANDSHAKE-RELIABILITY.md)

## Related Changes

- `packages/events/src/session/session.events.ts`
- `packages/events/src/session/session-event.schemas.ts`
- `packages/events/src/scheduler/scheduler.events.ts`
- `packages/events/src/scheduler/scheduler-event.schemas.ts`
- `services/scheduler-service/prisma/schema.prisma`
- `services/scheduler-service/prisma/migrations/20260224000100_phase5_event_handshake_reliability/migration.sql`
- `services/scheduler-service/src/domain/scheduler-service/scheduler.repository.ts`
- `services/scheduler-service/src/infrastructure/database/prisma-event-reliability.repository.ts`
- `services/scheduler-service/src/infrastructure/events/scheduler-event-consumer.ts`
- `services/scheduler-service/src/config/index.ts`
- `services/scheduler-service/src/index.ts`
- `services/scheduler-service/tests/unit/domain/scheduler-event-consumer-phase5.test.ts`
