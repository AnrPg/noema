# ADR-0025: Scheduler Service Phase 3 - Persistence and Idempotent Event Ingestion

**Status:** ✅ Accepted  
**Date:** 2026-02-22  
**Deciders:** Architecture Team  
**Related:** [ADR-0024](./ADR-0024-scheduler-service-phase-1-operational-scaffolding.md), [ADR-0022](./ADR-0022-dual-lane-scheduler.md), [ADR-0023](./ADR-0023-offline-intent-tokens.md), [ADR-0016](./ADR-0016-event-infrastructure-centralisation.md)

---

## Context

Phase 1 made scheduler-service operational (HTTP/auth/health/tools), and Phase 2 introduced event-consumer scaffolding. Phase 3 requires durable scheduling state with explicit persistence for per-card review history and calibration parameters.

Without persistence, the scheduler cannot:

- maintain longitudinal FSRS/HLR card state,
- safely process replayed/duplicated events,
- support resilient restarts and eventual consistency in a microservices environment.

## Decision

### 1) Introduce scheduler-service persistence model (Prisma + PostgreSQL)

A service-local Prisma schema is introduced under `services/scheduler-service/prisma/schema.prisma` with three core entities:

- `SchedulerCard` (per-user/per-card scheduling state)
- `Review` (immutable review events for algorithm training)
- `CalibrationData` (JSON parameter store for FSRS/HLR calibration state)

This preserves DB-per-service boundaries and aligns with Noema’s event-driven, bounded-context architecture.

### 2) Persist both algorithm-ready primitives and flexible calibration payloads

To support current and future algorithms:

- `SchedulerCard` stores explicit scalar fields (`stability`, `difficultyParameter`, `halfLife`, `interval`, `nextReviewDate`, counters/state),
- `CalibrationData.parameters` stores extensible JSON algorithm parameters.

This balances queryability (scalar fields) with evolution flexibility (JSON calibration blob).

### 3) Adopt idempotent ingestion semantics for review events

`Review.attemptId` is made **unique** (`@@unique([attemptId])` + SQL constraint), and ingestion uses:

- application-level pre-check (`findByAttemptId`), and
- database-level uniqueness guarantee.

This prevents duplicate review rows on replay/retry and supports at-least-once delivery from Redis Streams.

### 4) Implement repository abstraction with Prisma implementations

Repository interfaces are defined in:

- `src/domain/scheduler-service/scheduler.repository.ts`

Implementations are provided in:

- `src/infrastructure/database/prisma-scheduler-card.repository.ts`
- `src/infrastructure/database/prisma-review.repository.ts`
- `src/infrastructure/database/prisma-calibration-data.repository.ts`

This keeps domain logic persistence-agnostic and testable.

### 5) Wire persistence into runtime and health checks

Bootstrap now initializes Prisma and repositories, injects them into `SchedulerService`, and extends readiness probes to verify DB connectivity.

Event consumer ingestion is connected to repositories for durable updates.

## Consequences

### Positive

- Durable per-card scheduling state across restarts
- Durable review history for model updates and diagnostics
- Extensible calibration persistence for future FSRS/HLR tuning
- Strong idempotency on review ingestion (`attemptId` uniqueness)
- Improved operational readiness (`/health/ready` includes DB check)

### Tradeoffs

- Additional operational dependency (PostgreSQL now mandatory)
- Slightly higher write complexity due to idempotency and mapping layers
- Need migration/version management discipline per service

### Explicitly Deferred

- Full FSRS weight training pipeline and parameter fitting loop
- Backfill/reconciliation jobs for historical session attempts
- Advanced dead-letter/retry strategy for poison events
- Cross-service transactional guarantees (remain eventual consistency)

## Implementation Notes

### Added/Updated Artifacts

- Prisma schema and migration:
  - `services/scheduler-service/prisma/schema.prisma`
  - `services/scheduler-service/prisma/migrations/20260222000000_init/migration.sql`
- Repository contracts and implementations:
  - `src/domain/scheduler-service/scheduler.repository.ts`
  - `src/infrastructure/database/*.repository.ts`
- Event consumer hardening:
  - `src/infrastructure/events/scheduler-event-consumer.ts` (now a thin facade;
    event handling decomposed into per-stream consumers per ADR-0039)
- Runtime/config integration:
  - `src/index.ts`, `src/config/index.ts`, `.env.example`

### Invariants

- `reviews.attempt_id` is globally unique for dedupe safety
- `scheduler_cards.id` aligns with cross-service `CardId`
- Event ingestion is safe under replay/retry

## Architectural Clarifications Needed

To reduce ambiguity in future phases:

1. Canonical source stream strategy: single shared service stream (`noema:events:session-service`) vs event-type streams.
2. Whether `session.started` should include `initialCardIds` in payload contract for immediate card bootstrap.
3. Whether scheduler should consume `attempt.recorded` exclusively, or keep `review.submitted` as compatible alias.

These do not block current Phase 3 delivery but should be normalized in the next ADR/update cycle.

## References

- [ADR-0024](./ADR-0024-scheduler-service-phase-1-operational-scaffolding.md)
- [ADR-0022](./ADR-0022-dual-lane-scheduler.md)
- [ADR-0023](./ADR-0023-offline-intent-tokens.md)
- [ADR-0016](./ADR-0016-event-infrastructure-centralisation.md)
