# ADR-014: Scheduler Is Concept-First

| Field       | Value                                            |
| ----------- | ------------------------------------------------ |
| **Status**  | Accepted                                         |
| **Date**    | 2026-05-01                                       |
| **Phase**   | Realignment                                      |
| **Authors** | Codex (AI), directed by project owner            |
| **Sources** | `IMPLEMENTATION_PLAN_FINAL.md`, `REALIGNMENT.md` |

## Context

The current scheduler is card-centric: scheduler state, reviews, calibration,
and cohort protocols revolve around cards. The realignment keeps cards as
content payloads but schedules concepts and creates transformed Step work for
presentation.

The system must track retention and transformation history by learner/concept,
not by card.

## Decision

`scheduler-service` becomes concept-first.

- Replace `SchedulerCard` with `ConceptScheduleState`.
- Replace card-level review/calibration records with concept evaluation logs and
  concept calibration data.
- Maintain logical queues: `repair`, `reinforcement`, and `new_learning`.
- Consume `metacognition.evaluation.recorded` events.
- Update FSRS, HLR, SM-2, and Leitner inputs to Evaluation-shaped data.
- Track concept transformation history so repetition cycles through all six
  transformations before repeating.
- Public APIs that took `cardId` for scheduling state are removed in the
  replacement batch.

## Rationale

- Concept state is the durable learning target; cards are one possible payload.
- Transformation history cannot be enforced if scheduling is keyed only by card.
- Scheduler math is preserved while its input/output shape aligns with Steps and
  Evaluations.

## Alternatives Considered

| Option                                                | Pros                        | Cons                                                                        | Rejected because                               |
| ----------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------- |
| Keep card scheduling and map concepts on read         | Smaller migration           | Repetition can repeat the same cognitive shape and state remains card-bound | The loop needs concept-first queues            |
| Schedule individual Steps as durable long-lived items | Very explicit               | Steps are generated/superseded runtime units                                | The durable memory trajectory is concept-level |
| Move scheduling into KG                               | Concept proximity is nearby | KG should project stability, not own interval algorithms                    | Scheduler remains the math/state owner         |

## Phase Plan

Batch 6 performs the schema drop/replacement, event subscription, concept due
APIs, transformation history APIs, and algorithm input refactor.

## Preserved Scheduler Capabilities

FSRS, HLR, SM-2, and Leitner remain valid scheduling math. This ADR changes the
domain key and evidence shape, not the existence of those algorithms.

| Old shape                  | New shape                                        |
| -------------------------- | ------------------------------------------------ |
| card schedule state        | concept schedule state                           |
| card review log            | concept evaluation log                           |
| card queue/cohort proposal | repair/reinforcement/new-learning concept queues |
| attempt correctness input  | Evaluation-shaped input                          |
| card repetition            | concept transformation history                   |

## Required Deletes

Batch 6 must remove `SchedulerCard`, `Review`, `CalibrationData`,
`ScheduleProposal`, `ScheduleCommit`, `ScheduleCohortLineage`,
`SchedulerHandshakeState`, `SchedulerEventInbox`, and public APIs that expose
card schedule state.

## Step Log

- 2026-05-01: Decision recorded before implementation.
- 2026-05-01: Expanded preserved capabilities, replacement mapping, and required
  deletes during the deeper Batch 0 pass.

## Emergent Decisions During Implementation

- None yet.

## Consequences

- `knowledge-graph-service` consumes scheduler updates to project concept
  stability.
- `content-service` and agents generate Step Activities for concepts due in
  scheduler queues.
- Existing card-centric scheduler OpenAPI docs and client methods must be
  removed or regenerated.

## References

- `IMPLEMENTATION_PLAN_FINAL.md` sections 11, 12, and 16 Batch 6.
- `REALIGNMENT.md` sections 3 and 7.
