# ADR-010: Step Is the Atomic Learning Unit

| Field       | Value                                            |
| ----------- | ------------------------------------------------ |
| **Status**  | Accepted                                         |
| **Date**    | 2026-05-01                                       |
| **Phase**   | Realignment                                      |
| **Authors** | Codex (AI), directed by project owner            |
| **Sources** | `IMPLEMENTATION_PLAN_FINAL.md`, `REALIGNMENT.md` |

## Context

The current system presents and schedules cards and records card-level attempts.
That loses the reason a piece of content was shown: the objective, served goal,
epistemic mode, transformation, expected outcome, and evaluation strategy are
not the runtime unit.

The realignment requires Noema to prioritize how a learner thinks, not merely
whether they answered a card correctly.

## Decision

`Step` becomes the atomic learner-visible unit.

- Cards remain in `content-service` as payloads, templates, and media-bearing
  content sources.
- A Step owns cognitive intent: objective, served goals, eligible modes,
  selected epistemic mode, transformation type, activities, expected outcome,
  evaluation type, difficulty, repair flag, and concept refs.
- `Activity` is the renderable work inside a Step and references either a card
  payload or a generated variant.
- Every session has exactly one LessonPlan. Review sessions receive a minimal
  plan; goal-driven sessions receive a full Guardian-validated plan.
- Once a Step is evaluated, it is immutable. Replanning supersedes Steps and
  inserts new ones instead of editing completed evidence.

## Rationale

- Step-level evidence is the first data model that can align objective,
  activity, and assessment.
- Cards can be reused across multiple cognitive contexts without pretending the
  card itself is the learning event.
- Step immutability keeps metacognitive evidence auditable and prevents replans
  from rewriting learner history.

## Alternatives Considered

| Option                                                                        | Pros                     | Cons                                                           | Rejected because                                       |
| ----------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------- | ------------------------------------------------------ |
| Keep Card as the runtime unit                                                 | Minimal migration        | No place for cognitive intent, mode, or transformation history | It cannot express the realignment loop                 |
| Add intent metadata to Card attempts                                          | Smaller schema change    | Still centers historical attempts and card queue semantics     | Attempts are evidence, not planned learning units      |
| Create a separate workflow entity above cards but keep queue items card-keyed | Partial planning support | Splits scheduling and presentation state                       | The scheduler and evaluator need Step/concept evidence |

## Phase Plan

Batch 4 will introduce LessonPlan, Goal, Step, Activity, and StepQueueItem in
`session-service`; drop Attempt, SessionQueueItem, session cohort handshake, and
session-owned UserStreak; and replace card-attempt REST surfaces with Step
surfaces.

## Architectural Invariants

- A learner-visible learning interaction is always a Step, never a naked Card.
- A Step has objective, served goals, selected epistemic mode, transformation
  type, expected outcome, evaluation type, difficulty, concept refs, and at
  least one Activity.
- Activities may reference Cards, templates, or generated variants, but they do
  not make those payloads the runtime unit.
- Completed/Evaluated Steps are immutable evidence. Repair and adaptation create
  superseding Steps.
- Step history is not rewritten when strategy replans.

## Cross-Batch Contract

| Batch | Obligation                                                                                |
| ----- | ----------------------------------------------------------------------------------------- |
| 1     | Shared DTOs/types can express LessonPlan, Step, Activity, Evaluation, Trigger, and Replan |
| 3     | Content-service can provide Activity payload candidates without owning runtime Steps      |
| 4     | Session-service owns the Step aggregate and deletes card-attempt runtime paths            |
| 5     | Metacognition-service records exactly one canonical Evaluation per completed Step         |
| 8     | Guardian validates Step alignment before learner exposure                                 |
| 10    | Web UI renders Step view rather than card queue UI                                        |

## Acceptance Checks

- No new production path presents a Card directly to the learner as the runtime
  unit.
- `Attempt` and `SessionQueueItem` are removed when Step replacements land.
- Step answers flow to metacognition-service for Evaluation rather than being
  finalized inside session-service.

## Step Log

- 2026-05-01: Decision recorded before implementation.
- 2026-05-01: Expanded with invariants, cross-batch obligations, and acceptance
  checks during the deeper Batch 0 pass.

## Emergent Decisions During Implementation

- None yet.

## Consequences

- Session-service becomes the owner of LessonPlans, Goals, Steps, Activities,
  lifecycle state, and the Step queue.
- Content-service keeps cards but adds generation-facing metadata in later
  batches.
- Scheduler-service schedules concept state and instantiates Step work rather
  than owning card queues.
- UI must render Steps and remove learner-facing card queue assumptions.
- Existing code that still talks about attempts, card queues, or card runtime
  presentation must be treated as stale until its batch refactors or deletes it.

## References

- `IMPLEMENTATION_PLAN_FINAL.md` sections 4, 5, 14, and 16 Batch 4.
- `REALIGNMENT.md` section 2.
