# TODO — Scheduler Service Agent-Readiness Implementation Plan

**Purpose:** End-to-end execution blueprint to make `scheduler-service` ready
for agent-first orchestration in Noema.

**Audience:** Claude Code / coding agents implementing phases incrementally.

**Status Note (2026-02-24):**

- Canonical completion status is tracked in phase files under `docs/scheduler-agent-readiness/` and the Global Definition of Done section in this document.
- Intermediate unchecked boxes in phase work-item sections are retained as execution-template checklists and not treated as runtime readiness blockers once the corresponding phase file is complete.

**Primary References:**

- `/.copilot/instructions/PROJECT_CONTEXT.md`
- `docs/architecture/AGENT_MCP_TOOL_REGISTRY.md`
- `docs/architecture/decisions/ADR-0022-dual-lane-scheduler.md`
- `docs/architecture/decisions/ADR-0023-offline-intent-tokens.md`
- `docs/architecture/decisions/ADR-0026-scheduler-identity-auth-scope-and-consumer-reliability.md`
- `docs/architecture/decisions/ADR-0027-scheduler-openapi-contract-api-first.md`

**Current Service Status (as of 2026-02-23):**

- Runtime is operational (health/auth/tool routes/event consumer).
- Core planner exists (`plan-dual-lane`) but still narrow.
- OpenAPI includes several planned endpoints not yet implemented.
- Agent-tool surface is insufficient for full orchestration workflows.

**Phase Pack (Claude-friendly split):**

- `docs/scheduler-agent-readiness/README.md`
- `docs/scheduler-agent-readiness/PHASE-0-API-ADR-FOUNDATION.md`
- `docs/scheduler-agent-readiness/PHASE-1-AUTH-ERROR-GUARDRAILS.md`
- `docs/scheduler-agent-readiness/PHASE-2-SCORING-SIMULATION-COMMIT.md`
- `docs/scheduler-agent-readiness/PHASE-3-FSRS-HLR-STATE-MACHINE.md`
- `docs/scheduler-agent-readiness/PHASE-4-MCP-TOOLS-EXPANSION.md`
- `docs/scheduler-agent-readiness/PHASE-5-EVENT-HANDSHAKE-RELIABILITY.md`
- `docs/scheduler-agent-readiness/PHASE-6-OBSERVABILITY-BACKPRESSURE-RUNBOOK.md`

---

## Implementation Contract for Claude

Use this file as a strict execution contract:

1. **API/schema first** for every phase.
2. **No breaking behavior** without explicit user approval.
3. **Additive changes only** unless migration is approved.
4. **Agent-first semantics**: every mutation returns actionable `agentHints`.
5. **Complete each phase with green checks**:
   - lint
   - typecheck
   - tests
   - openapi validation
6. **No leftover warnings/errors/uncommitted changes** when phase closes.
7. **Create/Update ADR** if architecture or boundaries change.

---

## Architecture Decisions (Default Baseline for Implementation)

These defaults should be implemented unless product owner overrides:

- **D1 Auth model:** JWT with JWKS verification and scoped service-principal
  claims.
- **D2 Compute/commit split:** explicit propose/simulate vs commit endpoints.
- **D3 Scoring model:** deterministic weighted policy with explicit
  `policyVersion`.
- **D4 Consumer reliability:** `XAUTOCLAIM` recovery + inbox dedupe + idempotent
  handlers.
- **D5 Provenance:** scheduler-local decision lineage tables + emitted lineage
  events.

---

## Gap Coverage Matrix (31/31)

| Gap # | Theme                                    | Covered In Phase |
| ----- | ---------------------------------------- | ---------------- |
| 1     | Error semantics standardization          | P1               |
| 2     | Service-principal auth/scopes            | P1               |
| 3     | FSRS execution path integration          | P3               |
| 4     | HLR operational wiring                   | P3               |
| 5     | Deterministic scoring contract           | P2               |
| 6     | Simulation/what-if endpoint              | P2               |
| 7     | Schedule-commit boundary                 | P2               |
| 8     | Policy versioning                        | P2               |
| 9     | Tool capability metadata                 | P4               |
| 10    | Deep tool input validation               | P4               |
| 11    | Missing orchestration tools              | P4               |
| 12    | Bulk tool operations                     | P4               |
| 13    | Tool observability contract              | P4               |
| 14    | Narrow event coverage                    | P5               |
| 15    | Reconciliation handshake                 | P5               |
| 16    | Causal link chain metadata               | P5               |
| 17    | Duplicate/reorder resilience             | P5               |
| 18    | Pending-message recovery                 | P5               |
| 19    | Graceful drain semantics                 | P5               |
| 20    | Backpressure surfaced to agents          | P6               |
| 21    | AUTH_DISABLED guardrails                 | P1               |
| 22    | JWT key rotation / audience partitioning | P1               |
| 23    | Fine-grained authorization               | P1               |
| 24    | Abuse controls                           | P1               |
| 25    | Metrics endpoint + SLI set               | P6               |
| 26    | Tracing spans                            | P6               |
| 27    | Operational runbook                      | P6               |
| 28    | Calibration training loop underused      | P3               |
| 29    | Sparse state transitions                 | P3               |
| 30    | Decision provenance retention            | P2               |
| 31    | Session cohort revision lineage schema   | P2/P5            |

---

## Phase 0 — API/Schema & ADR Foundation

### Goal

Lock contracts and architecture before runtime edits.

### Deliverables

- [ ] Add ADR: `ADR-00xx-scheduler-agent-readiness-hardening.md`.
- [ ] Extend OpenAPI with explicit active/planned lifecycle tags.
- [ ] Add reusable schemas:
  - `PrincipalContext`
  - `ScopeRequirement`
  - `ErrorEnvelope`
  - `OrchestrationMetadata` (`proposalId`, `decisionId`, `sessionRevision`)
  - `ScoringBreakdown`
  - `PolicyVersion`
  - `BackpressureSignal`
- [ ] Add path-level error response parity for auth + tools + domain endpoints.
- [ ] Add explicit propose/simulate/commit endpoint contracts.

### File Targets

- `docs/api/openapi/scheduler-service/openapi.yaml`
- `docs/api/openapi/scheduler-service/paths/scheduler.yaml`
- `docs/api/openapi/scheduler-service/paths/tools.yaml`
- `docs/api/openapi/scheduler-service/components/schemas/common.yaml`
- `docs/api/openapi/scheduler-service/components/schemas/scheduler.yaml`
- `docs/api/openapi/scheduler-service/components/schemas/tools.yaml`
- `docs/architecture/decisions/`

### Acceptance

- [ ] `pnpm run openapi:validate:scheduler` passes.
- [ ] No planned endpoint lacks lifecycle annotation.

---

## Phase 1 — Identity, Authorization, Guardrails, Error Semantics

### Goal

Provide secure, machine-readable, agent-safe interaction boundaries.

### Work Items

#### 1A. Error Envelope Standardization

- [ ] Replace ad-hoc auth errors with canonical envelope.
- [ ] Normalize route/tool errors to include:
  - `error.code`
  - `error.message`
  - `error.retryable`
  - `error.category` (`auth`, `validation`, `conflict`, `dependency`,
    `internal`)
  - `metadata.requestId`, `metadata.correlationId`

#### 1B. Service-Principal Claims Model

- [ ] Introduce principal model in auth middleware:
  - `principalType`: `user | agent | service`
  - `principalId`
  - `scopes: string[]`
  - `audienceClass`
- [ ] Enforce route scope checks.
- [ ] Enforce tool-specific required scopes.

#### 1C. JWT Hardening

- [ ] Add JWKS verification path and key rotation support.
- [ ] Add audience partitioning by caller class.
- [ ] Keep shared-secret fallback only for local dev.

#### 1D. AUTH_DISABLED Safety

- [ ] Block `AUTH_DISABLED=true` in non-dev at startup.
- [ ] Emit explicit startup warning in dev.

#### 1E. Abuse Controls

- [ ] Add request payload size guardrails.
- [ ] Add per-principal tool rate limits/quotas.
- [ ] Add validation failure telemetry.

### File Targets

- `services/scheduler-service/src/api/middleware/auth.middleware.ts`
- `services/scheduler-service/src/api/rest/scheduler.routes.ts`
- `services/scheduler-service/src/agents/tools/tool.routes.ts`
- `services/scheduler-service/src/config/index.ts`
- `services/scheduler-service/src/index.ts`

### Acceptance

- [ ] Unauthorized/forbidden responses are contract-compliant.
- [ ] Scope matrix tests pass for user/agent/service principals.

---

## Phase 2 — Deterministic Scoring, Simulation, Commit Boundary, Provenance

### Goal

Turn scheduler into deterministic computation engine with explicit commit
boundary.

### Work Items

#### 2A. Deterministic Scoring Contract

- [ ] Implement scoring service with explicit factors:
  - `urgency`
  - `retentionRisk`
  - `calibrationValue`
  - `composite`
- [ ] Add deterministic normalization and tie-break ordering.
- [ ] Return factor-level breakdown for each candidate card.

#### 2B. Policy Versioning

- [ ] Add `policyVersion` to all proposal/simulation outputs.
- [ ] Persist policy version with commits and events.

#### 2C. Simulation Endpoints (No Commit)

- [ ] Implement `proposeReviewWindows`.
- [ ] Implement `proposeSessionCandidates`.
- [ ] Ensure strictly side-effect free behavior.

#### 2D. Explicit Commit Endpoints

- [ ] Implement single/batch commit endpoints separately from propose.
- [ ] Ensure `planDualLaneQueue` no longer implies persistence by default.
- [ ] Add explicit `commit=true` path only where approved.

#### 2E. Provenance & Lineage Schema

- [ ] Add persistence schema for:
  - proposals
  - commits
  - rationale
  - actor principal
  - session revision references
- [ ] Add cohort lineage table for revision history.

### File Targets

- `services/scheduler-service/src/domain/scheduler-service/`
- `services/scheduler-service/prisma/schema.prisma`
- `services/scheduler-service/prisma/migrations/*`
- `services/scheduler-service/src/infrastructure/database/*`

### Acceptance

- [ ] Same input + policyVersion => identical ordering/output.
- [ ] Proposal endpoints produce no DB schedule mutations.
- [ ] Commit endpoints require explicit invocation.

---

## Phase 3 — FSRS/HLR Runtime Integration + State Machine

### Goal

Apply real algorithm updates after attempts and in proposal/commit flow.

### Work Items

#### 3A. FSRS Integration

- [ ] Implement/complete FSRS model and state transitions.
- [ ] Wire FSRS update pipeline in review-event path.
- [ ] Update `SchedulerCard` fields deterministically.

#### 3B. HLR Operational Wiring

- [ ] Use HLR model for calibration-lane prediction and updates.
- [ ] Feed calibration data repository from observed outcomes.

#### 3C. Unified Algorithm Adapter

- [ ] Introduce `SchedulingAlgorithmAdapter` abstraction.
- [ ] Route per-card updates by algorithm and lane.

#### 3D. State Transition Rules

- [ ] Encode explicit allowed transitions (`new -> learning -> review -> ...`).
- [ ] Reject illegal transitions with clear error codes.

#### 3E. Calibration Loop Activation

- [ ] Add periodic or event-driven training loop trigger.
- [ ] Persist confidence/quality metadata for trained params.

### File Targets

- `services/scheduler-service/src/domain/scheduler-service/algorithms/*`
- `services/scheduler-service/src/infrastructure/events/consumers/review-recorded.consumer.ts`
  (decomposed from monolithic consumer per ADR-0039)
- `services/scheduler-service/src/domain/scheduler-service/scheduler.service.ts`

### Acceptance

- [ ] Review event leads to algorithm-specific schedule updates.
- [ ] State transitions are validated and test-covered.
- [ ] Calibration data is actively updated (not passive only).

---

## Phase 4 — MCP Tool Surface Expansion & Contracts

### Goal

Expose complete orchestration-ready tool surface with strict contracts.

### Required Tools

- [ ] `get-srs-schedule`
- [ ] `predict-retention`
- [ ] `propose-review-windows`
- [ ] `propose-session-candidates`
- [ ] `reconcile-session-candidates`
- [ ] `apply-session-adjustments`
- [ ] `update-card-scheduling`
- [ ] `batch-update-card-scheduling`

### Work Items

- [ ] Add capability metadata per tool:
  - `idempotent`
  - `sideEffects`
  - `timeoutMs`
  - `costClass`
  - `requiredScopes`
- [ ] Enforce schema validation in registry/route before handler execution.
- [ ] Add bulk operation support and partial-failure response semantics.
- [ ] Add tool-level observability fields:
  - `resultCode`
  - `retryClass`
  - `failureDomain`

### File Targets

- `services/scheduler-service/src/agents/tools/scheduler.tools.ts`
- `services/scheduler-service/src/agents/tools/tool.registry.ts`
- `services/scheduler-service/src/agents/tools/tool.types.ts`
- `services/scheduler-service/src/agents/tools/tool.routes.ts`

### Acceptance

- [ ] Tool registry parity with `AGENT_MCP_TOOL_REGISTRY` P0/P1 scheduler items.
- [ ] Invalid inputs rejected before handler logic.

---

## Phase 5 — Event Expansion, Reconciliation Handshake, Consumer Hardening

### Goal

Make cross-service orchestration resilient and traceable.

### Work Items

#### 5A. Event Taxonomy Expansion

- [ ] Consume:
  - `session.cohort.proposed`
  - `session.cohort.accepted`
  - `session.cohort.revised`
- [ ] Publish:
  - `schedule.proposal.generated`
  - `schedule.commit.applied`
  - `schedule.reconcile.completed`

#### 5B. First-Class Handshake

- [ ] Implement API/event handshake flow:
  1. scheduler proposes
  2. session-service accepts/rejects/revises
  3. scheduler commits with lineage metadata

#### 5C. Causal Metadata Propagation

- [ ] Propagate across request/event boundaries:
  - `correlationId`
  - `proposalId`
  - `decisionId`
  - `sessionId`
  - `sessionRevision`

#### 5D. Consumer Idempotency and Recovery

- [x] Add inbox dedupe storage and checks.
- [x] Add startup pending recovery via claim strategy.
- [x] Ensure retries cannot cause semantic duplicates.

> **Note:** Consumer infrastructure has been decomposed into
> `BaseEventConsumer` + per-stream concrete consumers (ADR-0039).

#### 5E. Graceful Drain

- [x] Implement bounded shutdown for in-flight messages.
- [x] Stop intake before shutdown and flush processing.

### File Targets

- `services/scheduler-service/src/infrastructure/events/consumers/base-consumer.ts`
  (reliability infrastructure — ADR-0039)
- `services/scheduler-service/src/infrastructure/events/consumers/session-cohort.consumer.ts`
  (handshake event handling — ADR-0039)
- `services/scheduler-service/src/infrastructure/events/scheduler-event-consumer.ts`
  (thin facade — ADR-0039)
- `services/scheduler-service/src/domain/shared/event-publisher.ts`
- `services/scheduler-service/src/infrastructure/cache/redis-event-publisher.ts`
- `services/scheduler-service/src/index.ts`

### Acceptance

- [ ] Duplicate delivery scenarios are safe.
- [ ] Pending recovery works after process restart.
- [ ] Reconcile/commit events include full lineage metadata.

---

## Phase 6 — Observability, Backpressure, Runbook

### Goal

Expose objective operational signals for agents and operators.

### Work Items

- [ ] Add scheduler metrics endpoint and SLI definitions:
  - request latency p50/p95/p99
  - error rate by category/code
  - queue lag
  - DLQ depth
  - recompute latency
  - proposal/commit throughput
- [ ] Add tracing spans over route -> tool -> domain -> event/repo.
- [ ] Add backpressure policy output to agents (`healthy`, `degraded`,
      `throttled`).
- [ ] Add operational runbook for incidents:
  - DLQ triage
  - replay safety
  - auth/scope misconfig
  - queue backlog mitigation

### File Targets

- `services/scheduler-service/src/api/rest/health.routes.ts`
- `services/scheduler-service/src/config/index.ts`
- `docs/guides/operations/` (new runbook)

### Acceptance

- [ ] Agent can query operational state and adapt behavior.
- [ ] Runbook exists and is actionable.

---

## Testing & Validation Requirements (All Phases)

Each phase must add or update tests in `services/scheduler-service/tests/`.

### Required Test Classes

- [ ] Unit tests for domain algorithms and scoring.
- [ ] Route contract tests for success/failure envelopes.
- [ ] Tool contract tests for schema validation and scopes.
- [ ] Event consumer reliability tests (duplicates, retries, pending recovery).
- [ ] Integration tests for propose -> reconcile -> commit workflow.
- [ ] Determinism tests keyed by `policyVersion`.

### Required Commands Per Phase

- [ ] `pnpm --filter @noema/scheduler-service lint`
- [ ] `pnpm --filter @noema/scheduler-service typecheck`
- [ ] `pnpm --filter @noema/scheduler-service test`
- [ ] `pnpm run openapi:validate:scheduler`

---

## Implementation Sequence (Strict Order)

1. **P0** contract/ADR baseline.
2. **P1** auth/error guardrails.
3. **P2** deterministic scoring + simulation + commit split + provenance.
4. **P3** FSRS/HLR/state machine integration.
5. **P4** complete MCP tooling surface.
6. **P5** event handshake and reliability hardening.
7. **P6** observability/backpressure/runbook.

No later phase should start before previous phase passes all gates.

---

## Claude Execution Checklist Template (copy per phase)

Use this exact checklist when executing each phase:

- [ ] Read relevant ADRs and `PROJECT_CONTEXT.md` sections.
- [ ] Update OpenAPI/spec and validate.
- [ ] Update domain/types/schemas.
- [ ] Update routes/tools/events.
- [ ] Add/adjust persistence models and migrations (if needed).
- [ ] Add/adjust tests.
- [ ] Run lint/typecheck/test/openapi validation.
- [ ] Update ADR/docs.
- [ ] Confirm zero errors/warnings/uncommitted changes.

---

## Definition of Done (Global)

Scheduler service is considered **agent-ready** only when:

- [x] All 31 gaps are closed with test evidence.
- [x] OpenAPI runtime parity is achieved (or planned endpoints are explicit and
      stubbed).
- [x] MCP tool registry scheduler items are implemented for required priorities.
- [x] Security model supports user + agent + service principals with scopes.
- [x] Event workflows are replay-safe and traceable.
- [x] Algorithm outputs are deterministic, versioned, and auditable.
- [x] Operators can triage incidents with documented runbooks.
