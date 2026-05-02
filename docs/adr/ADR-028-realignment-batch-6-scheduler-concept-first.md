# ADR-028 — Realignment Batch 6 Scheduler Concept-First Refactor

- **Date:** 2026-05-02
- **Status:** accepted
- **Deciders:** Codex

## Context

`IMPLEMENTATION_PLAN_FINAL.md` defines Batch 6 as a destructive
scheduler-service refactor. Cards remain content payloads elsewhere, but
scheduling must be keyed by `(userId, conceptId, studyMode)` and driven by
canonical `metacognition.evaluation.recorded` events.

The existing scheduler-service is card/cohort oriented: `SchedulerCard`,
`Review`, proposal/commit/cohort lineage tables, event inbox reliability tables,
card REST APIs, and card-based consumers. Keeping compatibility routes would
violate the Batch 6 delete requirement.

## Decision

Batch 6 replaces the scheduler-service public and persistence model with
concept-first scheduling:

- Drop the old scheduler tables: `SchedulerCard`, `Review`, `CalibrationData`,
  `ScheduleProposal`, `ScheduleCommit`, `ScheduleCohortLineage`,
  `SchedulerHandshakeState`, and `SchedulerEventInbox`.
- Create the §4.10 models: `ConceptScheduleState`, `ConceptEvaluationLog`,
  `ConceptCalibrationData`, and `ConceptTransformationHistory`.
- Subscribe to `metacognition.evaluation.recorded`, update one schedule state
  per concept reference, write an evaluation log, write transformation history
  when transformation metadata is present, and emit
  `scheduler.concept_state.updated`.
- Replace card-centric REST with:
  - `GET /v1/concepts/:conceptId/schedule`
  - `GET /v1/concepts/due`
  - `GET /v1/concepts/:conceptId/transformation-history`
- Refactor scheduling algorithms so FSRS, HLR, SM-2, and Leitner all consume
  Evaluation-shaped inputs rather than card review inputs.
- Remove card-centric scheduling code paths from the runtime bootstrap.

## Rationale

Concept-first scheduling matches the new learning loop: Steps produce
Evaluations, Evaluations update concept state, and later batches consume
scheduler concept events for knowledge-graph stability and strategy replanning.

The destructive cutover is acceptable because the implementation plan explicitly
requires removal rather than deprecation and identifies dev-data loss as an
accepted realignment risk.

## Alternatives Considered

| Option                                                           | Pros                                                      | Cons                                                             | Rejected because                                                                 |
| ---------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Keep card APIs and add concept APIs beside them                  | Lower short-term churn                                    | Keeps stale public contracts and card-centric code paths         | Batch 6 explicitly deletes all card-centric scheduling paths                     |
| Migrate old card state into concept state                        | Preserves dev data                                        | Requires lossy card-to-concept mapping not specified in the plan | Ground truth plan calls for dropping old scheduler tables                        |
| Require transformation metadata on evaluation events immediately | Guarantees every evaluation writes transformation history | Batch 5 event payload does not yet include it                    | Would break current producer; scheduler records history when metadata is present |

## Implementation Plan

1. Replace the Prisma schema and add a destructive migration for the §4.10
   concept scheduler models.
2. Replace scheduler domain types, repository ports, service logic, and REST
   routes with concept-first equivalents.
3. Add Evaluation-shaped FSRS, HLR, SM-2, and Leitner adapters.
4. Add a `metacognition.evaluation.recorded` consumer and
   `scheduler.concept_state.updated` event contract.
5. Remove runtime wiring for old card/cohort/tool surfaces.
6. Add tests for the required three-Evaluation transition and transformation
   history.
7. Update architecture docs, module graph, changelog, and this ADR with
   implementation notes.

## Consequences

- Positive: Scheduler state is aligned with the realignment loop and can feed
  Batch 7 knowledge-graph stability projection.
- Positive: Public scheduler APIs no longer expose `cardId`.
- Negative / trade-offs: Existing scheduler dev data is discarded by migration.
- Negative / trade-offs: Transformation history is complete only for events that
  include transformation metadata until upstream publishers enrich
  `metacognition.evaluation.recorded`.
- Follow-up tasks created: Batch 7 consumes `scheduler.concept_state.updated`.

## Implementation Updates

- Step 1 replaced the scheduler Prisma schema and added destructive migration
  `20260502010000_scheduler_concept_first`. `ConceptCalibrationData` uses a
  surrogate `id` plus a unique constraint on
  `(userId, studyMode, algorithm, conceptId)` because Prisma cannot model
  nullable `conceptId` in a compound primary key as written in the source plan.
- Step 2 replaced the domain service, repository port, Prisma adapter, and REST
  routes with concept-first equivalents. Runtime bootstrap now wires only the
  concept scheduler repository, the concept scheduler service, and the
  metacognition evaluation consumer.
- Step 3 kept FSRS/HLR math and added Evaluation-shaped adapters for FSRS, HLR,
  SM-2, and Leitner. FSRS is the default for new concept state.
- Step 4 fixed the Batch 5 edge by enriching `metacognition.evaluation.recorded`
  with optional `studyMode` and `transformation`. Scheduler persists
  transformation history whenever `transformation` is present.
- Step 5 removed card/cohort/tool scheduler runtime code paths from
  `services/scheduler-service/src`.
- Step 6 added focused coverage for the required sequence:
  `NEW_LEARNING -> REINFORCEMENT -> REPAIR` after a failure.
- End state: `pnpm --filter @noema/scheduler-service test`, typecheck, lint,
  build, and Prisma generation pass.

## References

- `IMPLEMENTATION_PLAN_FINAL.md` §4.10, §16 Batch 6.
- `REALIGNMENT.md`
- ADR-027 — Realignment Batch 5 Metacognition Evaluation Loop
