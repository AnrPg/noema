# ADR-013: Evaluation Is Owned by Metacognition Service

| Field       | Value                                            |
| ----------- | ------------------------------------------------ |
| **Status**  | Accepted                                         |
| **Date**    | 2026-05-01                                       |
| **Phase**   | Realignment                                      |
| **Authors** | Codex (AI), directed by project owner            |
| **Sources** | `IMPLEMENTATION_PLAN_FINAL.md`, `REALIGNMENT.md` |

## Context

The realignment makes reasoning quality the primary learning signal. A learner
can answer correctly with weak reasoning or answer incorrectly with strong
reasoning, and the system must respond differently in each case.

Evaluation cannot be a side effect of session completion or scheduler review
math. It must be a canonical domain object.

## Decision

`metacognition-service` owns Evaluation.

It persists one canonical Evaluation per completed Step, computes 7-frame
reasoning quality, combines reasoning quality with self-rating confidence, maps
combined score to internal scheduler ratings, maintains per-concept reasoning
rolling averages, and emits Triggers.

The combination formula is config-driven but preserves this invariant:

- as `reasoningQuality` decreases, self-rating weight must also decrease.

Metacognition emits:

- `metacognition.evaluation.recorded`
- `metacognition.trigger.fired`

## Rationale

- Reasoning quality is not scheduler state and not UI state; it is metacognitive
  evidence.
- A single Evaluation owner prevents session-service, scheduler-service, and KG
  from computing competing scores.
- Trigger detection belongs next to the trace/evaluation evidence that produces
  the trigger.

## Alternatives Considered

| Option                                   | Pros                        | Cons                                                              | Rejected because                                    |
| ---------------------------------------- | --------------------------- | ----------------------------------------------------------------- | --------------------------------------------------- |
| Store Evaluation in session-service      | Close to Step lifecycle     | Makes session-service own reasoning science and trigger detection | Violates one-source-of-truth ownership              |
| Let scheduler infer ratings from answers | Reuses existing review path | Correctness dominates and trace evidence is lost                  | The realignment requires reasoning-dominant scoring |
| Keep trace scoring in agents only        | Flexible LLM interpretation | Non-deterministic and hard to audit                               | Deterministic rules must constrain agent outputs    |

## Phase Plan

Batch 5 gives `metacognition-service` a real Prisma schema, scoring domain,
signal-combination domain, trigger rules, REST API, and event emission. Later
batches subscribe scheduler, KG, strategy, and gamification to those events.

## Evaluation Contract

Each completed Step produces exactly one canonical Evaluation with:

- Step/session/lesson/user/concept references
- selected epistemic mode and transformation type
- correctness
- `StepSelfRating`
- derived `confidenceSignal`
- full seven-frame trace
- deterministic `reasoningQuality`
- `combinedScore`
- internal `SchedulerRating`
- trigger references and recommended action

The combined score formula is configurable, but the self-rating weight must not
increase as reasoning quality decreases.

## Non-Ownership

- Session-service does not compute final reasoning quality.
- Scheduler-service does not infer Evaluation from raw correctness.
- Knowledge-graph-service does not recompute the combined score.
- Agents may assist trace generation, but deterministic metacognition rules own
  the persisted score.

## Step Log

- 2026-05-01: Decision recorded before implementation.
- 2026-05-01: Expanded the Evaluation contract and non-ownership rules during
  the deeper Batch 0 pass.

## Emergent Decisions During Implementation

- None yet.

## Consequences

- Session-service records Step answers and delegates canonical scoring to
  metacognition-service.
- Scheduler-service consumes Evaluation-shaped events rather than card attempt
  inputs.
- KG concept state and gamification projections derive from Evaluation evidence
  rather than raw correctness.

## References

- `IMPLEMENTATION_PLAN_FINAL.md` sections 7, 8, 16 Batch 5, and 22.
- `REALIGNMENT.md` section 6.
