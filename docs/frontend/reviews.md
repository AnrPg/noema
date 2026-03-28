# Reviews Workspace

## Purpose

The learner-facing `/reviews` workspace is the mode-aware scheduling and review
reporting surface.

It complements the compact dashboard tiles by providing:

- today's queue split
- forecasted review load
- scheduler-generated review windows
- mode-scoped review analytics
- what-if scheduling simulation

## Mode Awareness

The page reads the active study mode from the global authenticated-shell mode
toggle and treats that mode as the reporting scope for the entire workspace.

That means:

- `TodaysPlan` queries the review queue with `studyMode`
- `ReviewForecastFull` queries the forecast endpoint with `studyMode`
- `ReviewWindows` uses the scheduler review-window proposal endpoint with
  `studyMode`
- `ReviewStatsSummary` uses scheduler review stats with `studyMode`
- `ReviewStatsSummary` also reads the scheduler progress summary with
  `studyMode`
- `SchedulingSimulator` submits simulations with `studyMode`

The page copy also labels the current scope so learners understand that review
analytics are mode-scoped rather than global.

## Data Flow

- web page pulls the active mode via `useActiveStudyMode`
- scheduler hooks in `@noema/api-client` send explicit `studyMode`
- scheduler-service read/write contracts keep queue, forecast, stats, and
  simulation aligned to the selected mode

This keeps the reviews workspace API-first: the UI does not derive its own
analytics when a scheduler-native read model already exists.

The important split is:

- review stats explain what happened recently
- scheduler progress summary explains what is currently due, fragile, or still
  untracked

Both belong on the reviews page because planning requires current readiness, not
just historical performance.

## UI Sections

- `Today's Plan`
  - review queue summary for the active mode
- `7-Day Review Forecast`
  - mode-scoped due-load projection
- `Review Analytics`
  - last-30-day summary for the active mode
  - live readiness context from the scheduler progress summary
- `Suggested Review Windows`
  - scheduler proposals, not client-side guesses
- `Scheduling Simulator`
  - mode-scoped what-if lane planning

## Legacy Path Notes

Before the mode-aware rollout, the `/reviews` page behaved like a shared
schedule surface.

The current contract intentionally removes that ambiguity:

- review reporting defaults to the active mode
- forecast and queue counts stay aligned
- simulator inputs match the visible reporting scope

## Boundaries

- scheduler-service owns queueing, forecasting, simulation, review stats, and
  progress/readiness summaries
- api-client owns transport DTOs and TanStack Query hooks
- web owns composition, UX copy, and mode-visible presentation
