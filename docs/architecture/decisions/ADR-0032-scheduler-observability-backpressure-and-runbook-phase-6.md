# ADR-0032: Scheduler Observability, Backpressure, and Operations Runbook (Phase 6)

## Status

Accepted

## Date

2026-02-24

## Context

Phase 5 completed event handshake reliability, but operational visibility
remained insufficient for agents and operators to react deterministically under
stress.

Outstanding gaps:

- no dedicated scheduler SLI surface for latency, error rates, lag, and
  throughput;
- no machine-readable backpressure state for agent orchestration decisions;
- no end-to-end structured span coverage across
  route/tool/domain/event/repository;
- no consolidated runbook for DLQ, replay safety, queue lag, and auth incidents.

## Decision

### 1) Add Scheduler Operations State Endpoint

Added `GET /v1/scheduler/operations/state` that returns:

- backpressure signal (`healthy | degraded | throttled`)
- SLI snapshot (latency p50/p95/p99, error rates, queue lag, DLQ depth,
  proposal/commit throughput, recompute latency)
- recent trace span summary
- `agentHints` for orchestration response actions

### 2) Add Prometheus Metrics Export

Added `GET /metrics` with scheduler-specific metrics:

- request latency quantiles
- recompute latency quantiles
- queue lag
- DLQ depth
- proposal/commit throughput
- error rate by category and code
- backpressure state as gauges

### 3) Add Structured Span Instrumentation (No New Dependencies)

Implemented structured span timing with explicit naming convention and trace IDs
using existing platform primitives:

- `route.request`
- `tool.registry.execute`
- `domain.scheduler.*`
- `event.consumer.*`
- `repository.prisma.*`

This satisfies end-to-end traceability while remaining compatible with future
OpenTelemetry adoption.

### 4) Compute Backpressure from SLI Thresholds

Backpressure state is computed from queue lag, DLQ depth, p95 latency, and
aggregate error rate thresholds, with retry guidance (`retryAfterMs`).

### 5) Publish Operations Runbook

Added scheduler incident runbook covering:

- DLQ triage flow
- replay safety checklist
- queue-lag response playbook
- auth/scope incident response

## Consequences

### Positive

- Agents can query and adapt behavior to scheduler operational pressure.
- Operators get actionable and consistent incident response guidance.
- Trace lineage and latency visibility improve diagnostics.
- Redis Streams implementation remains compatible with Kafka migration path.

### Negative

- In-memory observability windows reset on service restart.
- Quantile approximations are sample-window based, not full-histogram exact.

### Neutral

- No external observability dependency was introduced in this phase.

## References

- [ADR-0031: Scheduler Event Handshake and Consumer Reliability (Phase 5)](./ADR-0031-scheduler-event-handshake-and-consumer-reliability-phase-5.md)
- [ADR-0039: Scheduler Event Consumer Decomposition](./ADR-0039-scheduler-event-consumer-decomposition.md)
- [Phase 6 — Observability, Backpressure, and Operations Runbook](../../scheduler-agent-readiness/PHASE-6-OBSERVABILITY-BACKPRESSURE-RUNBOOK.md)
- [Scheduler Incident Runbook](../../guides/operations/scheduler-incident-runbook.md)

## Related Changes

- `services/scheduler-service/src/infrastructure/observability/scheduler-observability.ts`
- `services/scheduler-service/src/index.ts`
- `services/scheduler-service/src/api/rest/health.routes.ts`
- `services/scheduler-service/src/api/middleware/auth.middleware.ts`
- `services/scheduler-service/src/agents/tools/scheduler.tools.ts`
- `services/scheduler-service/src/agents/tools/tool.registry.ts`
- `services/scheduler-service/src/infrastructure/events/scheduler-event-consumer.ts`
  (now a thin facade — span instrumentation lives in `consumers/base-consumer.ts`
  per ADR-0039)
- `services/scheduler-service/src/infrastructure/database/prisma-event-reliability.repository.ts`
- `docs/api/openapi/scheduler-service/openapi.yaml`
- `docs/api/openapi/scheduler-service/paths/health.yaml`
- `docs/api/openapi/scheduler-service/components/schemas/common.yaml`
- `docs/guides/operations/scheduler-incident-runbook.md`
