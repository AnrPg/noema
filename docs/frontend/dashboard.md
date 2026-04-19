# Dashboard

## Purpose

The authenticated dashboard is the learner's mode-scoped operational snapshot.
It should answer two questions quickly:

- what demands attention right now
- how healthy the current learning mode feels overall

## Mode-Aware Progress

The dashboard must not reconstruct progress by stitching together unrelated UI
queries. It should prefer scheduler-owned read models and knowledge-graph-owned
read models.

Current mode-aware dashboard sources:

- scheduler progress summary for deck/readiness state
- scheduler forecast for short-horizon review load
- knowledge structural health for PKG quality
- misconceptions for active error pressure
- session-service streaks for continuity

## Cognitive Vitals

`CognitiveVitals` uses the active study mode to keep each tile scoped to the
same interpretation lens.

The first tile now reads from the scheduler progress summary rather than from a
placeholder progress hook or a queue-only approximation. This keeps the old
`useMyProgress` path aligned with the newer scheduler API.

That tile should communicate:

- `dueNow` as the primary value
- backlog via `overdueCards`
- latent stability via `matureCards`

This is intentionally better than a queue count alone because a learner can
have:

- a small due count but very fragile recall
- a large deck but low tracked coverage
- a stable mature base with only a small urgent backlog

## UX Notes

- All dashboard sections should respect the active global study mode.
- Empty and loading states should stay lightweight because this page is visited
  often.
- Tiles should summarize, not explain. Deeper analysis belongs on dedicated
  reviews, knowledge, and goals surfaces.
- Progress visuals on dashboard session summaries should use the shared
  speedometer-style `NeuralGauge` so mobile layouts and motion stay consistent
  with the rest of the study UI.
