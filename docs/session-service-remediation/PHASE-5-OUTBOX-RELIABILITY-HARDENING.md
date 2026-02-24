# Phase 5 — Outbox Reliability Hardening

## Goal

Make outbox dispatch robust under horizontal scaling and controlled shutdown
scenarios.

## Why This Phase Exists

Current worker uses basic polling over pending events. This is acceptable for
single instance operation but weak for multi-instance claim safety and graceful
draining.

## Scope

### In Scope

- Add claim/lease ownership model for pending outbox items.
- Add bounded graceful drain on shutdown.
- Add retry policy controls and improved failure telemetry.
- Add tests for concurrent workers and retry paths.

### Out of Scope

- Kafka migration.
- Full event-inbox dedupe architecture outside session-service.

## Target Files (Expected)

- `services/session-service/prisma/schema.prisma`
- `services/session-service/prisma/migrations/**`
- `services/session-service/src/infrastructure/database/prisma-outbox.repository.ts`
- `services/session-service/src/infrastructure/events/session-outbox-worker.ts`
- `services/session-service/src/config/index.ts`
- `services/session-service/tests/**`

## Suggested Data Model Enhancements (Outbox)

Add fields (or equivalent):

- `claim_owner` (nullable string)
- `claim_until` (nullable datetime)
- `next_attempt_at` (nullable datetime)
- `attempts` (existing)
- `published_at` (existing)
- `last_error` (existing)

Indexes:

- pending claim query index: (`published_at`, `claim_until`, `next_attempt_at`,
  `created_at`)
- recovery index by (`claim_owner`, `claim_until`)

## Implementation Instructions

1. **Repository claim API**
   - Add method to atomically claim a batch of publishable events:
     - pending
     - claim expired or unclaimed
     - ready by `next_attempt_at`
   - Mark claim owner and lease expiry in same transaction.

2. **Worker concurrency model**
   - Worker identity string per process.
   - Poll by claiming work, not by plain `listPending`.
   - Publish only claimed items.

3. **Retry and backoff**
   - On failure, increment attempts and schedule `next_attempt_at` with bounded
     backoff.
   - Optionally define max attempts and dead-letter marker.

4. **Graceful drain**
   - On shutdown:
     - stop intake
     - await in-flight publishes up to timeout
     - release/expire claims safely

5. **Metrics/logging**
   - Log claim count, publish success/failure, retry delays, drain duration.
   - Keep correlation metadata in logs.

6. **Config knobs**
   - Add env-config for lease ms, drain timeout ms, retry base delay, max
     attempts.

7. **Tests**
   - Two-worker simulation without double-publish.
   - Lease expiry reclaim behavior.
   - Graceful drain timeout behavior.

## Guardrails

- Do not publish events that are not currently claimed by this worker.
- Do not block shutdown indefinitely; always enforce bounded drain timeout.
- Do not discard failed events silently.
- Keep outbox schema backward compatible where feasible.

## Checklist

- [ ] Claim/lease fields added with migration.
- [ ] Atomic claim API implemented.
- [ ] Worker processes claimed items only.
- [ ] Retry scheduling/backoff implemented.
- [ ] Graceful drain logic implemented and tested.
- [ ] Configurable reliability knobs added.
- [ ] Concurrency tests pass.

## Exit Conditions

- Multi-worker execution does not double-publish claimed events.
- Failed publishes are retried predictably with visibility.
- Shutdown drains in-flight work within configured timeout.

## Rollback Plan

- Revert worker to prior sequential polling behavior.
- Roll back claim/lease schema changes.
- Keep telemetry fields optional in rollback migration strategy.
