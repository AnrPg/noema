# ADR-034: Realignment Batch 9 Session Strategy Replanning

| Field       | Value                                            |
| ----------- | ------------------------------------------------ |
| **Status**  | Accepted                                         |
| **Date**    | 2026-05-02                                       |
| **Phase**   | Realignment Batch 9                              |
| **Authors** | Codex (AI), directed by project owner            |
| **Sources** | `IMPLEMENTATION_PLAN_FINAL.md`, ADR-023, ADR-026 |

## Context

Batch 5 introduced `metacognition.trigger.fired`, Batch 8 introduced Guardian,
and Batch 4 made `session-service` the owner of LessonPlan and Step mutations.
The remaining gap was the deterministic Strategy layer that reacts to triggers
without reviving the deleted cohort/schedule proposal protocol.

## Decision

Implement Strategy inside `session-service` under `src/domain/strategy/`.

Strategy consumes `metacognition.trigger.fired`, selects the default
intervention and lowest sufficient replan scope, validates the proposed replan
and inserted Steps through Pedagogy Guardian, writes new Steps and StepQueueItem
rows transactionally, and stages `strategy.replan.proposed` plus
`strategy.replan.committed` through the session outbox.

Loadouts remain delivery-style modifiers only. They may alter prompt tone or
evaluation wording, but they do not override trigger response, mode eligibility,
transformations, concept state, or Guardian decisions.

## Rationale

- Replans mutate the Session aggregate, so Strategy belongs in
  `session-service`.
- Trigger handling is deterministic and small enough to keep in TypeScript.
- The durable outbox preserves the existing event reliability model.
- Guardian remains the admission gate before new learner-facing Steps are
  queued.

## Alternatives Considered

| Option                                   | Pros                         | Cons                                           | Rejected because                                       |
| ---------------------------------------- | ---------------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| New strategy service                     | Independent scaling          | Distributed transaction for a single aggregate | The plan says Strategy stays inside session-service    |
| Reuse scheduler proposal/cohort protocol | Existing orchestration shape | Reintroduces deleted legacy concepts           | Batch 6 removed cohort handshakes                      |
| Let metacognition write repair Steps     | Fewer moving parts           | Metacognition would mutate Session state       | Evaluation and Step mutation must have separate owners |

## Consequences

- Full LessonPlan replacement is reserved for the explicit
  `planFundamentallyInvalidated` heuristic and still requires the future
  LessonPlan generation agent.
- Local and structural replans are implemented now through injected repair Steps
  and prerequisite branches.
- Batch 13 can build its closed-loop E2E over the committed event path.

## References

- `IMPLEMENTATION_PLAN_FINAL.md` §9 and Batch 9
- `docs/adr/ADR-026-realignment-batch-4-session-service-step-loop.md`
- `docs/adr/ADR-033-realignment-batch-8-pedagogy-guardian-service.md`
