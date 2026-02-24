# Phase 6 — Observability, Backpressure, and Operations Runbook

## Objective

Expose operational state that agents can consume and operators can act on.

## Covers Gaps

20, 25, 26, 27

## Required Outputs

- Scheduler metrics endpoint and SLI set.
- Tracing spans across route/tool/domain/event/repository chain.
- Backpressure state surfaced to agents (`healthy | degraded | throttled`).
- Runbook for scheduler incidents (DLQ/replay/auth/lag scenarios).

## Tasks

- [x] Define and emit core scheduler metrics:
  - request latency (p50/p95/p99)
  - error rates by category and code
  - queue lag and DLQ depth
  - proposal/commit throughput
  - recompute latency
- [x] Add trace propagation and span naming convention.
- [x] Add backpressure signal computation and API exposure.
- [x] Add operational guide in `docs/guides/operations/`:
  - DLQ triage flow
  - replay safety checklist
  - queue-lag response playbook
  - auth/scope incident response

## Constraints

- Prefer existing platform observability primitives and conventions.
- Keep agent-facing backpressure contract stable and machine-readable.

## Exit Criteria

- [x] Agents can query and react to scheduler health/backpressure signals.
- [x] Traces show end-to-end orchestration chains with linkage IDs.
- [x] Runbook is complete and actionable.
