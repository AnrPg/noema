# Goals

## Purpose

The goals workspace is the learner-facing planning surface for turning
mode-scoped progress into concrete study intentions.

Phase 6 upgrades this page from placeholder copy to a real consumer of the
explicit mastery read model.

## Current Data Sources

- `useNodeMasterySummary(userId, { studyMode, ... })`
- `usePKGNodes(userId, { studyMode, sortBy: 'masteryLevel', sortOrder: 'asc' })`
- `useSchedulerCardFocusSummary({ studyMode, limit })`
- `useSchedulerStudyGuidanceSummary({ studyMode })`
- `useActiveStudyMode()`

## Behaviour

- The page is always scoped to the active study mode.
- Daily targets use `untrackedNodes` as the simplest new-coverage signal.
- Weekly planning uses `trackedNodes / totalNodes` to show how much of the
  current mode is covered by explicit mastery evidence.
- Mastery campaigns focus on `emergingNodes + developingNodes`.
- Strongest and weakest domains come from the backend summary, not from frontend
  aggregation.
- Focus candidates reuse the standard PKG node listing path, which now honors
  the existing `sortBy` and `sortOrder` contract for mastery-centric ordering.
- The page also shows fragile cards from the scheduler-owned focus summary so
  goals can translate directly into reinforcement work, not only graph insight.
- The page now also shows an ordered list of simple recommendations from the
  scheduler guidance summary so goal setting can stay practical and
  action-oriented.

## Why This Matters

This keeps goals aligned with the same semantics used by:

- review reporting
- mode-aware structural health
- misconceptions
- graph lensing
- future agent planning tools

Without an explicit mastery summary, different screens would drift into
different interpretations of "progress."
