# ADR-020: Every Session Has a LessonPlan

| Field       | Value                                            |
| ----------- | ------------------------------------------------ |
| **Status**  | Accepted                                         |
| **Date**    | 2026-05-01                                       |
| **Phase**   | Realignment Batch 0 - ADR baseline               |
| **Authors** | Codex (AI), directed by project owner            |
| **Sources** | `IMPLEMENTATION_PLAN_FINAL.md`, `REALIGNMENT.md` |

## Context

Noema's previous session model could start from a card queue without a durable
plan that explains why the learner is seeing each item. The realignment requires
every learner-visible Step to align objective, activity, and assessment. That
alignment needs a parent plan even for lightweight review sessions.

## Decision

Every session has exactly one `LessonPlan`.

- Review sessions receive an automatically generated minimal LessonPlan.
- Goal-driven sessions receive a full LessonPlan.
- Full LessonPlans are validated by Pedagogy Guardian before activation.
- A LessonPlan may have at most four active goals.
- Decks and Categories remain product capabilities, but they become
  `LessonPlan.sourceDecks` and `LessonPlan.sourceCategories`, not runtime
  session composition units.

## Rationale

- A uniform LessonPlan model avoids separate review-vs-goal runtime paths.
- The four-goal cap prevents broad, unfocused plans that cannot be assessed.
- Preserving Decks and Categories as sources retains existing product value
  while moving runtime semantics to Steps.

## Alternatives Considered

| Option                                     | Pros                         | Cons                                                      | Rejected because                                      |
| ------------------------------------------ | ---------------------------- | --------------------------------------------------------- | ----------------------------------------------------- |
| Keep review sessions planless              | Lower migration effort       | Review Steps lack explicit objective and adaptation rules | The realignment requires every session to have a plan |
| Create plans only for goal-driven sessions | Simpler full-plan generation | Splits session lifecycle and API semantics                | One uniform lifecycle is safer for later replanning   |
| Allow unlimited goals                      | Flexible for ambitious users | Dilutes objective/activity/assessment alignment           | The plan explicitly caps active goals at four         |

## Implementation Boundary

This ADR is preparatory Batch 0 architecture work. Implementation belongs to
Batch 4 in `session-service`, with DTO support from Batch 1 and validation from
Batch 8.

## Acceptance Checks

- `Session` creation always creates or attaches a LessonPlan.
- Review sessions get `rigorLevel = minimal`.
- Goal-driven sessions get `rigorLevel = full` and require Guardian validation.
- A fifth active goal is rejected at the API boundary.

## Consequences

- Session-service owns LessonPlan, Goal, Step, Activity, StepQueueItem, and the
  lifecycle FSM.
- Planner agents propose full plans, but deterministic validation constrains
  them before activation.

## References

- `IMPLEMENTATION_PLAN_FINAL.md` sections 4.2, 4.3, 5, 10, and 16 Batch 4.
- `REALIGNMENT.md` section 5.
- `docs/adr/ADR-010-step-is-the-atomic-learning-unit.md`
- `docs/adr/ADR-023-pedagogy-guardian-independent-validation-gate.md`
