# Phase 3 — FSRS/HLR Runtime Integration and State Machine

## Objective

Operationalize both scheduling algorithms in runtime execution paths and encode
explicit scheduler card state transitions.

## Covers Gaps

3, 4, 28, 29

## Required Outputs

- FSRS update path applied to retention-lane reviews.
- HLR update path applied to calibration-lane reviews/proposals.
- Unified algorithm adapter layer to route by card algorithm.
- Explicit card state transition rules with validation errors.
- Active calibration training loop writing back to calibration repository.

## Tasks

- [x] Add/complete FSRS algorithm module and tests.
- [x] Integrate FSRS updates in event consumer review handling.
      *(now in `ReviewRecordedConsumer` — see ADR-0039)*
- [x] Integrate HLR prediction/update in proposal and review paths.
- [x] Implement state transition guard module for `SchedulerCard.state`.
- [x] Add calibration loop trigger(s) and persistence updates.
- [x] Add tests for illegal transitions and algorithm-specific updates.

## Constraints

- Keep algorithm adapter isolated from transport concerns.
- Preserve lane semantics already documented in ADRs.

## Exit Criteria

- [x] Review events produce deterministic algorithm-specific schedule updates.
- [x] Illegal transitions are rejected with clear machine-readable errors.
- [x] Calibration data is actively refreshed from runtime outcomes.
