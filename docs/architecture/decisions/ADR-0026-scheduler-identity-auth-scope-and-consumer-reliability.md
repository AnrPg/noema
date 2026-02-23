# ADR-0026: Scheduler Identity Model, Auth Scope Enforcement, and Consumer Reliability

## Status

Accepted

## Date

2026-02-23

## Context

An architecture audit identified four high-priority issues in
`scheduler-service`:

1. `scheduler_cards` identity keyed by `card_id` alone, which is unsafe for
   multi-user data isolation.
2. Service methods trusted payload `userId` without enforcing equality with
   authenticated principal.
3. Redis consumer acknowledged failed messages immediately, causing data loss on
   transient failures.
4. Route wiring diverged from canonical per-route `preHandler` style.

## Decision

### 1) Identity model refactor for scheduler card state

Refactor `scheduler_cards` to use:

- Surrogate key: `id` (PK)
- Domain identity: unique (`user_id`, `card_id`)

And rewire dependent tables:

- `reviews` foreign key -> (`user_id`, `card_id`)
- `calibration_data` foreign key -> (`user_id`, `card_id`)

Repository APIs are updated to identify cards by (`userId`, `cardId`) for
reads/updates/deletes.

### 2) Enforce authenticated scope now

For `planDualLaneQueue` and `issueOfflineIntentToken`, enforce:

- `data.userId === ctx.userId`

For `verifyOfflineIntentToken`, enforce:

- `claims.userId === ctx.userId`

### 3) Harden event consumer semantics

Consumer behavior is changed to:

- Retry failed processing with exponential backoff and attempt metadata.
- Move terminally failed messages to dead-letter stream.
- Acknowledge only after successful durable processing, requeue, or dead-letter
  persistence.
- Guard null result from `XREADGROUP` polling.

### 4) Normalize route auth wiring

Switch scheduler REST and tool routes to canonical per-route auth style:

- Use `{ preHandler: authMiddleware }`
- Remove manual in-handler `authMiddleware` invocation.

## Consequences

### Positive

- Correct per-user schedule isolation for shared card IDs.
- Better authorization safety and fewer cross-user data leaks.
- Improved event-delivery reliability and observability on failures.
- Better consistency with project route templates.

### Tradeoffs

- Additional migration and repository complexity.
- Slight latency increase on retries due to backoff.
- Dead-letter stream requires operational monitoring.

## TODOs

1. **Dependent/sub-tenant authorization model**
   - Replace strict equality checks with policy:
   - `payload.userId` must be in the authenticated user’s permitted
     dependant/sub-tenant set.
   - This requires a dedicated policy source (user-service/tenant-service) and
     cached authorization checks.

2. **Service principal / service-to-service identity**
   - Standardize machine-to-machine calls using service principals (JWT client
     credentials or workload identity), including actor metadata in
     event/command payloads.
   - Target uniform rule set where user-level calls enforce
     `claims.userId === ctx.userId`, while service-level calls enforce explicit
     service claims and delegated scope.
   - Not implemented in this slice to avoid introducing cross-service auth
     contract drift without platform-wide alignment.

## References

- ADR-0016 Event Infrastructure Centralisation
- ADR-0024 Scheduler Service Phase 1 Operational Scaffolding
- ADR-0025 Scheduler Service Phase 3 Persistence
