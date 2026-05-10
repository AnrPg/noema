# Agent Input Readiness Phase 3

Phase 3 adds deterministic longitudinal context before any Mental Debugger or
Calibration Coach schema refactor. The principle is that services summarize
bounded history and expose explicit empty states; agents do not inspect raw,
unbounded learner history.

## Session-Service Ownership

Session-service now owns learner feedback actions and agent surface exposure
events.

- `record-learner-feedback-action` persists dismissals, corrections, show-more,
  show-less, temporary hides, calibration note actions, and drill actions.
- `get-learner-feedback-history` returns recent dismissals, corrections,
  feedback-depth preference, temporary hide state, correction themes, and an
  explicit empty-state summary.
- `get-learner-load-state` projects session-local overload/frustration signals
  from pauses, skipped steps, and pending answered steps. It uses event-scoped
  language only.
- `record-agent-surface-exposure` records when a reflective surface is shown.
- `get-exposure-budget-state` returns debugger/calibration exposure counts,
  remaining per-session budget, and whether the UI should fall back to a quiet
  surface.

## Metacognition-Service Ownership

Metacognition-service now owns evaluation-derived longitudinal summaries.

- `get-repeated-pattern-history` summarizes repeated fragile trace frames over
  a bounded recent window.
- `get-calibration-trend-summary` summarizes confidence/evidence alignment,
  overconfidence, underconfidence, and hesitation-with-quality counts.
- `get-concept-mismatch-history` summarizes concept-specific confidence versus
  reasoning mismatch examples.

## Scheduler-Service Ownership

Scheduler-service now exposes calibration-oriented scheduling context.

- `get-concept-calibration-projection` converts concept schedule state into a
  prompt-safe calibration projection.
- `get-prior-calibration-drill-history` currently returns scheduler evidence
  plus an explicit "no prior calibration drills recorded" empty state until
  durable drill records are introduced.
- `get-intervention-cadence-state` exposes deterministic cadence policy text.
  Session-service exposure budget remains the session-local authority.

## Composite Prefetch

`get-mental-debugger-context` now receives:

- `repeatedPatternHistory`
- `learnerFeedbackHistory`
- `learnerLoadState`
- `exposureBudgetState`

`get-calibration-context` now receives:

- `learnerFeedbackHistory`
- `learnerLoadState`
- `exposureBudgetState`
- `calibrationTrendSummary`
- `priorCalibrationDrillHistory`
- `interventionCadenceState`
- `conceptCalibrationProjection:<conceptId>`
- `conceptMismatchHistory:<conceptId>`

All sections keep IDs inside `serviceReferences` or service-owned payloads for
handoff/audit use; reasoning text remains human-readable and minimized.
