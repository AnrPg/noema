# ADR-0022: Dual-Lane Scheduler Planning

## Status

**Accepted** — 2026-02-22

## Context

Scheduler orchestration needed a first-class planner that balances retention and
calibration lanes under agent guidance and constrained card budgets.

## Decision

Implement dual-lane queue planning in `scheduler-service` as a dedicated domain
operation and expose it through API and tool interfaces.

- Add planner input/output schemas and types.
- Normalize requested lane mix and select cards accordingly.
- Publish planning event for downstream observability and audit.

## Consequences

### Positive

- Lane balancing becomes deterministic and centrally maintained.
- Agent authority is preserved while scheduler provides strong planning
  primitives.

### Negative

- Initial planner uses heuristic slicing and may need future policy tuning.

## References

- [services/scheduler-service/src/domain/scheduler-service/scheduler.service.ts](services/scheduler-service/src/domain/scheduler-service/scheduler.service.ts)
- [services/scheduler-service/src/domain/scheduler-service/scheduler.schemas.ts](services/scheduler-service/src/domain/scheduler-service/scheduler.schemas.ts)
- [services/scheduler-service/src/api/rest/scheduler.routes.ts](services/scheduler-service/src/api/rest/scheduler.routes.ts)
- [services/scheduler-service/src/agents/tools/scheduler.tools.ts](services/scheduler-service/src/agents/tools/scheduler.tools.ts)
