# ADR-0021: Event-Driven Adaptive Session Checkpoints

## Status

**Accepted** — 2026-02-22

## Context

Session runtime lacked a dedicated, event-driven checkpoint decision path for
signals such as confidence drift, latency spikes, and streak breaks.

## Decision

Introduce adaptive checkpoint evaluation in `session-service` with explicit
signal input, directive output, and event publication.

- Add checkpoint signal/directive types and schemas.
- Implement `evaluateAdaptiveCheckpoint` domain method.
- Publish checkpoint events for downstream scheduler/analytics reactions.
- Expose route/tool endpoints for agent orchestration.

## Consequences

### Positive

- Real-time adaptation decisions are now explicit and replayable.
- Event stream enables asynchronous tuning and observability.

### Negative

- More event volume and branching logic in session runtime.

## References

- [services/session-service/src/types/session.types.ts](services/session-service/src/types/session.types.ts)
- [services/session-service/src/domain/session-service/session.schemas.ts](services/session-service/src/domain/session-service/session.schemas.ts)
- [services/session-service/src/domain/session-service/session.service.ts](services/session-service/src/domain/session-service/session.service.ts)
- [services/session-service/src/api/rest/session.routes.ts](services/session-service/src/api/rest/session.routes.ts)
- [services/session-service/src/agents/tools/session.tools.ts](services/session-service/src/agents/tools/session.tools.ts)
