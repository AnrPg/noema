# Phase 2 — Deterministic Scoring, Simulation, Commit Boundary

## Objective

Turn scheduler into a deterministic computation engine with explicit
propose/simulate vs commit behavior and persistent decision provenance.

## Covers Gaps

5, 6, 7, 8, 30, 31 (partial)

## Required Outputs

- Deterministic scoring model with explicit factors:
  - `urgency`
  - `retentionRisk`
  - `calibrationValue`
  - `composite`
- Stable tie-break and normalization strategy.
- Explicit `policyVersion` in outputs/events/persistence.
- Side-effect-free simulation/proposal endpoints.
- Commit endpoints that persist only accepted decisions.
- Decision provenance persistence and session cohort lineage tables.

## Tasks

- [ ] Implement scoring service and scoring breakdown DTOs.
- [ ] Add simulation endpoint handlers:
  - review-window proposal
  - session-candidate proposal
- [ ] Add explicit schedule commit handlers (single + batch).
- [ ] Refactor `planDualLaneQueue` so persistence is not implicit by default.
- [ ] Add Prisma models + migrations for decision/commit/lineage history.
- [ ] Emit lineage metadata with all schedule proposal/commit outputs.
- [ ] Add determinism tests (same input + same policyVersion => same result).

## Constraints

- Preserve backward compatibility where possible.
- If changing current implicit commit behavior is breaking, require approval.

## Exit Criteria

- [ ] Proposal endpoints produce no state mutation.
- [ ] Commit endpoints are explicit and auditable.
- [ ] Every proposal/commit stores policy and provenance metadata.
