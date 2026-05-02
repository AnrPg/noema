# ADR-021: Concept Stability Is Revocable and Reasoning-Dominant

| Field       | Value                                            |
| ----------- | ------------------------------------------------ |
| **Status**  | Accepted                                         |
| **Date**    | 2026-05-01                                       |
| **Phase**   | Realignment Batch 0 - ADR baseline               |
| **Authors** | Codex (AI), directed by project owner            |
| **Sources** | `IMPLEMENTATION_PLAN_FINAL.md`, `REALIGNMENT.md` |

## Context

The realignment rejects permanent learner-facing mastery. A concept can be
stable now and unstable later. Correctness alone is not enough: a learner who
answers correctly with weak reasoning should not be treated as having durable
understanding.

## Decision

Concept state is binary and revocable:

- `ConceptState = stable | unstable`
- A concept is `stable` only when retention and reasoning conditions both pass.
- Retention is scheduler-owned continuous stability against `S_RET`.
- Reasoning is metacognition-owned rolling average against `R_REAS`.
- Knowledge-graph-service owns the `ConceptStateProjection` and state history.
- Learner-facing "mastery/mastered" copy and APIs are replaced by
  "stability/stable/unstable" vocabulary.

## Rationale

- Stability describes a current evidence-backed state, not a permanent
  achievement.
- Splitting retention and reasoning keeps scheduling math intact while making
  reasoning quality decisive.
- KG is the right projection owner because concept state is graph-visible and
  prerequisite-sensitive.

## Alternatives Considered

| Option                                      | Pros                      | Cons                                                                     | Rejected because                                                 |
| ------------------------------------------- | ------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Keep continuous mastery percentage          | Familiar dashboard metric | Encourages permanent mastery semantics and correctness dominance         | The realignment requires binary revocable state                  |
| Let scheduler expose concept state directly | Close to retention math   | Scheduler would own graph-visible learner state and reasoning projection | KG owns concept state projection                                 |
| Smooth state flips with hysteresis now      | Reduces UI churn          | Hides current evidence and diverges from the spec                        | The plan explicitly allows a single bad evaluation to flip state |

## Implementation Boundary

This ADR governs later Batch 7 and UI copy work. Batch 0 does not implement the
projection. Batch 1 must provide the shared `ConceptState` vocabulary.

## Acceptance Checks

- Correct answer plus `reasoningQuality < 0.3` does not stabilize a concept.
- Stable-to-unstable flips are possible when reasoning average drops below
  threshold.
- No learner-facing UI copy treats "mastery" as the current concept-state term.
- Derived badges revoke when concept state flips to `unstable`.

## Consequences

- Historical mastery docs remain background only where they describe useful
  patterns, not active vocabulary.
- Analytics surfaces must report reasoning quality and stability together.

## References

- `IMPLEMENTATION_PLAN_FINAL.md` sections 4.11, 7, 12, 13, 16 Batch 7, and 19.
- `REALIGNMENT.md` sections 3, 6, 10, and 14.
- `docs/adr/ADR-013-evaluation-owned-by-metacognition-service.md`
- `docs/adr/ADR-014-scheduler-is-concept-first.md`
