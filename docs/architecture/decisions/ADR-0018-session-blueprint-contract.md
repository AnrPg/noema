# ADR-0018: Session Blueprint Contract for Agent-Orchestrated Start

## Status

**Accepted** — 2026-02-22

## Context

Session startup previously accepted only local session input and had no canonical
cross-service object to encode pre-session intent, card-lane assumptions,
checkpoint triggers, and policy snapshots. This created weak provenance between
content selection, user policy, and session execution.

## Decision

Define and adopt a shared `ISessionBlueprint` contract in
`@noema/contracts` and validate it explicitly in `session-service` before
session startup.

- Add blueprint-related contracts in `packages/contracts`.
- Add `validateSessionBlueprint` in `session-service` with API/tool exposure.
- Enforce blueprint consistency checks when starting a session.

## Consequences

### Positive

- Session startup gains an auditable, deterministic orchestration envelope.
- Agent-first orchestration becomes explicit and testable.
- Blueprint schema can evolve versioned (`v1`) without route redesign.

### Negative

- Additional validation path increases startup complexity.
- Producers must now emit valid blueprint shape.

## References

- [packages/contracts/src/session-blueprint.ts](packages/contracts/src/session-blueprint.ts)
- [services/session-service/src/domain/session-service/session.service.ts](services/session-service/src/domain/session-service/session.service.ts)
- [services/session-service/src/domain/session-service/session.schemas.ts](services/session-service/src/domain/session-service/session.schemas.ts)
- [services/session-service/src/api/rest/session.routes.ts](services/session-service/src/api/rest/session.routes.ts)
- [services/session-service/src/agents/tools/session.tools.ts](services/session-service/src/agents/tools/session.tools.ts)
