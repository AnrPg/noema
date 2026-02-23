# ADR-0027: Scheduler Service OpenAPI Contract (API-First)

## Status

Accepted

## Date

2026-02-23

## Context

`docs/api/openapi/` contained no scheduler-service contract while runtime
implementation already exposed REST and tool endpoints. This violated the
project API-first requirement and created drift risk for:

- client/service integration,
- agent tool orchestration,
- route evolution planning.

Additionally, scheduler roadmap endpoints existed conceptually in architecture
artifacts (review queue retrieval, schedule updates, retention prediction,
agent-facing proposal flows, and in-session cohort reconciliation) but had no
canonical HTTP contract representation.

## Decision

### 1) Introduce split scheduler-service OpenAPI specification

Add a modular OpenAPI 3.1 specification under:

- `docs/api/openapi/scheduler-service/openapi.yaml`
- `docs/api/openapi/scheduler-service/paths/*.yaml`
- `docs/api/openapi/scheduler-service/components/schemas/*.yaml`

The contract covers currently implemented runtime endpoints:

- `GET /health`
- `GET /health/live`
- `GET /health/ready`
- `POST /v1/scheduler/dual-lane/plan`
- `POST /v1/schedule/dual-lane-plan` (deprecated alias)
- `GET /v1/tools`
- `POST /v1/tools/execute`

### 2) Include planned scheduler API endpoints in-contract

Add planned endpoints to establish stable future contracts:

- `GET /v1/scheduler/review-queue`
- `PATCH /v1/scheduler/cards/{cardId}/schedule`
- `POST /v1/scheduler/cards/schedule/batch`
- `GET /v1/scheduler/cards/{cardId}/projection`
- `POST /v1/scheduler/retention/predict`
- `POST /v1/scheduler/proposals/review-windows`
- `POST /v1/scheduler/proposals/session-candidates`
- `POST /v1/scheduler/sessions/{sessionId}/reconcile`
- `POST /v1/scheduler/sessions/{sessionId}/apply-adjustments`

These are explicitly marked with `x-noema-lifecycle: planned` and `501`
placeholder responses to avoid runtime ambiguity.

The added operations model scheduler responsibility as a raw-calculation service
for agents and session-service orchestration:

- Scheduler computes proposals and scoring, but does not own final card cohort
   decisions.
- Agents can reconcile and adjust card cohorts during active sessions.
- Session-service remains execution authority for accepted session cohorts.

### 3) Add contract validation check

Add root scripts:

- `openapi:validate:scheduler`
- `openapi:validate`

Validation uses Redocly bundling to verify OpenAPI structure and `$ref`
resolution in CI/local workflows.

## Consequences

### Positive

- Scheduler API is now documented in a machine-verifiable contract.
- Runtime and planned endpoint surfaces are explicit and discoverable.
- Agent/session orchestration boundaries are now explicit in contract form.
- Split specification structure improves maintainability and future extension.
- Contract checks reduce silent drift risk across service, clients, and agents.

### Tradeoffs

- Planned endpoints require lifecycle discipline to prevent false assumptions.
- Additional docs maintenance overhead when route payloads evolve.

## Guardrails

1. Runtime route changes must update scheduler OpenAPI in the same PR.
2. Planned endpoints must remain marked `x-noema-lifecycle: planned` until
   implemented.
3. Validation script should run in CI for contract integrity.

## References

- ADR-0022 Dual-Lane Scheduler Planning
- ADR-0024 Scheduler Service Phase 1 Operational Scaffolding
- ADR-0025 Scheduler Service Phase 3 Persistence
- ADR-0026 Scheduler Identity Model, Auth Scope Enforcement, and Consumer
  Reliability
