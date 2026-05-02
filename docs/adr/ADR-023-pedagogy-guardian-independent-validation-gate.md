# ADR-023: Pedagogy Guardian Is an Independent Validation Gate

| Field       | Value                                            |
| ----------- | ------------------------------------------------ |
| **Status**  | Accepted                                         |
| **Date**    | 2026-05-01                                       |
| **Phase**   | Realignment Batch 0 - ADR baseline               |
| **Authors** | Codex (AI), directed by project owner            |
| **Sources** | `IMPLEMENTATION_PLAN_FINAL.md`, `REALIGNMENT.md` |

## Context

Agents and services will propose LessonPlans, Steps, generated variants, and
replans. The realignment principle is "agents propose, rules constrain." A
validation library embedded in each producer can drift or be bypassed.

## Decision

Create `pedagogy-guardian-service` as an independent policy gate.

It validates:

- full-rigor LessonPlans before activation
- Steps before presentation
- Activities and generated variants before learner exposure
- replans before commit
- minimum-sufficient-change constraints for strategy interventions

Guardian decisions are persisted as `GuardianValidation` records and referenced
by validated artifacts.

## Rationale

- Independent validation makes policy bypass visible.
- A persisted validation result gives auditability for agent-produced artifacts.
- Guardian is stateless enough to scale horizontally while still owning policy
  decisions.

## Alternatives Considered

| Option                                | Pros                            | Cons                                          | Rejected because                             |
| ------------------------------------- | ------------------------------- | --------------------------------------------- | -------------------------------------------- |
| Shared validation package only        | Easy to call locally            | Producers can skip, fork, or stale-lock rules | The plan requires an independent policy gate |
| Put validation inside session-service | Close to LessonPlan/Step writes | Content variants and agents could bypass it   | Guardian must validate multiple producers    |
| Let agents self-validate              | Flexible and cheap              | Non-deterministic and unauditable             | Rules must constrain agent outputs           |

## Implementation Boundary

Batch 8 creates the service and tests. Batch 4, Batch 9, Batch 11, and agents
must call it before committing or publishing learner-facing artifacts.

## Acceptance Checks

- Malformed LessonPlans, Steps, replans, and generated variants are rejected
  with reason codes.
- Replans that escalate beyond minimum sufficient change are rejected.
- Producers persist or reference the Guardian validation ID.

## Consequences

- The architecture intentionally introduces this service even though
  `REALIGNMENT.md` says "no new microservices"; `IMPLEMENTATION_PLAN_FINAL.md`
  resolves that conflict by treating Guardian as an assumed but missing service.
- Local validation may exist for fast feedback, but it is not authoritative.

## References

- `IMPLEMENTATION_PLAN_FINAL.md` sections 2.2, 4.14, 10, 16 Batch 8, and 21.1.
- `REALIGNMENT.md` sections 1, 5.4, 7.4, 9, and 12.
- `docs/adr/ADR-012-realignment-service-boundaries.md`
