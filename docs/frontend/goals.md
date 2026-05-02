# Goals

## Purpose

The goals workspace is the learner-facing planning surface for turning
mode-scoped progress into concrete study intentions.

Batch 7 upgrades this page from placeholder copy to a real consumer of the
explicit stability read model.

## Current Data Sources

- `useStabilitySummary(userId, { studyMode, ... })`
- `usePKGNodes(userId, { studyMode })`
- `useSchedulerCardFocusSummary({ studyMode, limit })`
- `useSchedulerStudyGuidanceSummary({ studyMode })`
- `useActiveStudyMode()`

## Behaviour

- The page is always scoped to the active study mode.
- Daily targets use `unstableConcepts` as the simplest repair signal.
- Weekly planning uses `stableConcepts / totalConcepts` to show how much of the
  current mode is currently stable.
- Stability campaigns focus on unstable prerequisites and low-reasoning domains.
- Strongest and weakest domains come from the backend summary, not from frontend
  aggregation.
- Focus candidates reuse the standard PKG node listing path while concept-state
  summaries carry the stability evidence.
- The page also shows fragile cards from the scheduler-owned focus summary so
  goals can translate directly into reinforcement work, not only graph insight.
- The page now also shows an ordered list of simple recommendations from the
  scheduler guidance summary so goal setting can stay practical and
  action-oriented.
- Missing scheduler guidance falls back to an empty recommendation list instead
  of breaking the goals surface while the query is still unresolved.

## Why This Matters

This keeps goals aligned with the same semantics used by:

- review reporting
- mode-aware structural health
- misconceptions
- graph lensing
- future agent planning tools

Without an explicit stability summary, different screens would drift into
different interpretations of "progress."
