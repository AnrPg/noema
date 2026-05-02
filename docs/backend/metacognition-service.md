# Metacognition Service

`metacognition-service` owns the canonical Step Evaluation loop for the Noema
realignment.

## Ownership

- persists one `Evaluation` per Step
- scores the 7-frame trace into `reasoningQuality`
- derives `confidenceSignal` from 3-choice self-rating
- computes `combinedScore` with reasoning quality dominating self-rating
- maps `combinedScore` to the internal scheduler rating
- maintains rolling reasoning averages per `(userId, conceptId)`
- emits first-class Triggers for strategy replanning

## REST

- `POST /v1/evaluations` computes, persists, and emits evaluation/trigger
  events.
- `GET /v1/concepts/:conceptId/reasoning-average` returns the persisted rolling
  average for the authenticated learner.

## Events

- `metacognition.evaluation.recorded`
- `metacognition.trigger.fired`

## Notes

The first scoring implementation is deterministic. It accepts explicit per-frame
scores when agent/UI traces provide them, and otherwise derives scores from
structured trace fields such as cue diagnosticity, retrieval mode, self-checks,
and error markers.

`metacognition.evaluation.recorded` now carries optional `studyMode` and
`transformation` metadata from the Step evidence payload. Scheduler-service uses
those fields to scope concept state and persist transformation history.
