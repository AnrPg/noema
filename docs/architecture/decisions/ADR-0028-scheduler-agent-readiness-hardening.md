# ADR-0028: Scheduler Agent-Readiness Hardening (Phase 0)

## Status

Accepted

## Date

2026-02-23

## Context

Scheduler-service already had a baseline OpenAPI contract and core runtime
endpoints, but Phase 0 readiness gaps remained for agent-first orchestration:

- no reusable contract schemas for principal context, scope requirements,
  orchestration lineage, policy versioning, scoring breakdown, and backpressure;
- inconsistent error envelope semantics across scheduler and tool surfaces;
- planned orchestration endpoints lacked explicit simulate/commit boundary
  contracts;
- lifecycle metadata was not explicit for all active operations.

This caused ambiguity for downstream agent runtimes and reduced confidence in
API-first sequencing for later phases.

## Decision

### 1) Add reusable agent-readiness contract schemas

Extend scheduler OpenAPI common schemas with:

- `PrincipalContext`
- `ScopeRequirement`
- `ErrorEnvelope`
- `OrchestrationMetadata`
- `ScoringBreakdown`
- `PolicyVersion`
- `BackpressureSignal`

Also extend `ErrorInfo` and response metadata to support canonical machine-safe
error semantics (`retryable`, `category`, and `correlationId`).

### 2) Standardize path-level error response parity

Define and reuse envelope-based error responses for scheduler/tool routes:

- `400 BadRequest`
- `401 Unauthorized`
- `403 Forbidden`
- `429 TooManyRequests`
- `500 InternalServerError`
- `501 PlannedNotImplemented` (for planned operations)

`ToolNotFound` is aligned to the same `ErrorEnvelope` contract.

### 3) Make lifecycle explicit for all operations

Use `x-noema-lifecycle` markers for both implemented and planned operations:

- implemented endpoints use `x-noema-lifecycle: active`
- planned endpoints use `x-noema-lifecycle: planned`

This prevents ambiguity during phased implementation and avoids accidental
assumptions about runtime availability.

### 4) Add explicit propose/simulate/commit boundary contracts

Introduce planned API contracts to preserve computation/commit separation:

- propose: existing proposal endpoints remain side-effect free by contract;
- simulate: `POST /v1/scheduler/simulations/session-candidates`;
- commit (single): `PATCH /v1/scheduler/commits/cards/{cardId}/schedule`;
- commit (batch): `POST /v1/scheduler/commits/cards/schedule/batch`.

Related request/response schemas include explicit policy and orchestration
lineage metadata to support deterministic replay and auditability.

## Consequences

### Positive

- Agent callers get stable, machine-readable contracts for auth context,
  deterministic scoring, and commit lineage.
- Error handling becomes uniform across scheduler and tool surfaces.
- Lifecycle visibility is explicit for all operations.
- Future implementation phases can proceed API-first with reduced contract
  churn.

### Tradeoffs

- Contract surface area increases before runtime implementation catches up.
- Planned endpoints require disciplined lifecycle updates during phase
  execution.

## Guardrails

1. Runtime implementations must preserve these Phase 0 contracts unless a
   follow-up ADR approves changes.
2. Any new planned endpoint must include `x-noema-lifecycle: planned` and
   `PlannedNotImplemented` response mapping until implemented.
3. Mutating scheduler operations must preserve explicit commit boundaries.

## References

- `docs/TODO-SCHEDULER-AGENT-READINESS-IMPLEMENTATION.md`
- `docs/scheduler-agent-readiness/PHASE-0-API-ADR-FOUNDATION.md`
- ADR-0022: Dual-Lane Scheduler
- ADR-0023: Offline Intent Tokens
- ADR-0026: Scheduler Identity/Auth Scope and Consumer Reliability
- ADR-0027: Scheduler OpenAPI Contract (API-First)
