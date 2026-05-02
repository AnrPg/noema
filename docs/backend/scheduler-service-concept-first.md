# Scheduler Service Concept-First Runtime

Batch 6 replaces card scheduling with concept scheduling.

## Ownership

- stores one `ConceptScheduleState` per `(userId, conceptId, studyMode)`
- records `ConceptEvaluationLog` entries from canonical Evaluations
- records `ConceptTransformationHistory` when evaluation events include
  transformation metadata
- derives internal scheduler ratings from Evaluation signals
- emits `scheduler.concept_state.updated` after state changes

## REST

- `GET /v1/concepts/:conceptId/schedule`
- `GET /v1/concepts/due`
- `GET /v1/concepts/:conceptId/transformation-history`

All routes are learner-scoped by authenticated principal context. Public
card-centric scheduler APIs were removed for Batch 6.

## Events

- consumes `metacognition.evaluation.recorded`
- emits `scheduler.concept_state.updated`

## Algorithms

FSRS, HLR, SM-2, and Leitner are preserved as internal math adapters that accept
Evaluation-shaped inputs. FSRS remains the default algorithm for new concept
state. The §4.10 schema stores FSRS stability/difficulty directly; SM-2 uses
`difficulty` for ease factor and Leitner uses `halfLife` as the box index if a
future calibration switches an existing concept to those algorithms.
