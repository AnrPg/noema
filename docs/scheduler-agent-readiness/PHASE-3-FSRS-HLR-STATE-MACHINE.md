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

- [ ] Add/complete FSRS algorithm module and tests.
- [ ] Integrate FSRS updates in event consumer review handling.
- [ ] Integrate HLR prediction/update in proposal and review paths.
- [ ] Implement state transition guard module for `SchedulerCard.state`.
- [ ] Add calibration loop trigger(s) and persistence updates.
- [ ] Add tests for illegal transitions and algorithm-specific updates.

## Constraints

- Keep algorithm adapter isolated from transport concerns.
- Preserve lane semantics already documented in ADRs.

## Exit Criteria

- [ ] Review events produce deterministic algorithm-specific schedule updates.
- [ ] Illegal transitions are rejected with clear machine-readable errors.
- [ ] Calibration data is actively refreshed from runtime outcomes.
