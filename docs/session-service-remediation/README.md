# Session Service Remediation Plan (Claude Handoff)

## Purpose

This folder contains an execution-ready remediation program for
`session-service`. Each phase is isolated, testable, and designed for safe
incremental delivery.

This plan aligns with:

- Agent-first orchestration model (scheduler computes raw signals, agents decide
  cohort, session-service executes/tracks)
- Event-driven architecture and outbox reliability goals
- Current ADR direction for cohort lineage and MCP tool standardization

## How to Use This Pack with Claude Code

1. Run phases in order (`Phase 1` → `Phase 6`).
2. Treat each phase as a separate PR.
3. Do not mix scope across phases.
4. For each phase, require:
   - Code changes
   - Tests
   - OpenAPI/tool contract updates (if applicable)
   - Short implementation notes in PR description

## Global Guardrails (Apply to Every Phase)

- Keep changes local to `services/session-service` unless shared contracts
  explicitly require package updates.
- Do not redesign architecture beyond what the phase asks.
- Preserve existing event names and payload semantics unless the phase
  explicitly changes them.
- Avoid silent behavior changes; document breaking changes.
- Keep backward compatibility where feasible; if not feasible, provide migration
  notes.
- Never skip tests for touched behavior.
- `AUTH_DISABLED=true` is allowed only in development/test workflows.
- Production-like deployments must provide `JWT_SECRET` or
  `ACCESS_TOKEN_SECRET`.

## Phase Files

1. [PHASE-1-SECURITY-OWNERSHIP-HARDENING.md](./PHASE-1-SECURITY-OWNERSHIP-HARDENING.md)
2. [PHASE-2-SESSION-INVARIANTS.md](./PHASE-2-SESSION-INVARIANTS.md)
3. [PHASE-3-CONTRACT-DRIFT-BLUEPRINT-FIDELITY.md](./PHASE-3-CONTRACT-DRIFT-BLUEPRINT-FIDELITY.md)
4. [PHASE-4-COHORT-HANDSHAKE-LIFECYCLE.md](./PHASE-4-COHORT-HANDSHAKE-LIFECYCLE.md)
5. [PHASE-5-OUTBOX-RELIABILITY-HARDENING.md](./PHASE-5-OUTBOX-RELIABILITY-HARDENING.md)
6. [PHASE-6-OFFLINE-TOKEN-REPLAY-PROTECTION.md](./PHASE-6-OFFLINE-TOKEN-REPLAY-PROTECTION.md)

## Supporting Handoff Files

1. [PHASE-CHECKLIST-MASTER.md](./PHASE-CHECKLIST-MASTER.md)
2. [CLAUDE-EXECUTION-RUNBOOK.md](./CLAUDE-EXECUTION-RUNBOOK.md)
3. [PR-TEMPLATE-PHASE.md](./PR-TEMPLATE-PHASE.md)

## Suggested PR Sequence

- PR-1: Phase 1 only
- PR-2: Phase 2 only
- PR-3: Phase 3 only
- PR-4: Phase 4 only
- PR-5: Phase 5 only
- PR-6: Phase 6 only

## Definition of Program Completion

Program is complete only when all phase exit conditions are met and all phase
checklists are checked in merged PRs.
