# ADR-033: Realignment Batch 8 Pedagogy Guardian Service

| Field       | Value                                   |
| ----------- | --------------------------------------- |
| **Status**  | Accepted                                |
| **Date**    | 2026-05-02                              |
| **Phase**   | Realignment Batch 8                     |
| **Authors** | Codex (AI), directed by project owner   |
| **Sources** | `IMPLEMENTATION_PLAN_FINAL.md`, ADR-023 |

## Context

ADR-023 established Pedagogy Guardian as the independent policy gate for
LessonPlans, Steps, Activities, replans, and generated variants. Batch 8 needed
to materialize the missing service and connect the producers that already exist
in the codebase.

## Decision

Implement `@noema/pedagogy-guardian-service` as a Fastify/Prisma service with
deterministic validation rules and persisted `GuardianValidation` rows.

`session-service` now calls Guardian before activating a LessonPlan and before
queueing each Step. `content-service` now calls Guardian before storing a
generated activity variant. Guardian emits `pedagogy.validation.rejected` when a
blocking validation occurs, and the realignment event contract now includes
`activity` as a rejected target type.

## Rationale

- Cross-service HTTP ports preserve the hexagonal boundary: producers depend on
  a Guardian port, not on Guardian internals.
- Persisting validation IDs lets runtime artifacts point back to the policy
  decision that admitted them.
- Keeping rules deterministic makes malformed artifacts easy to test and safe
  for agents to retry after repair.

## Alternatives Considered

| Option                                   | Pros                  | Cons                             | Rejected because                            |
| ---------------------------------------- | --------------------- | -------------------------------- | ------------------------------------------- |
| Keep validation local to session/content | Lower latency         | Duplicated rules and bypass risk | ADR-023 requires an independent gate        |
| Share Guardian domain code as a package  | Fast in-process calls | Removes service audit boundary   | Rejections must be persisted and observable |
| Only scaffold Guardian now               | Smaller Batch 8       | Producers could still bypass it  | Batch 8 requires producer clients           |

## Consequences

- Local development can leave `PEDAGOGY_GUARDIAN_ENABLED=false`; production
  deployments should enable the HTTP client and set service tokens.
- Minimal review LessonPlans without concept references will be rejected once
  Guardian is enabled, which is intentional for learner-facing Step queueing.
- Batch 9 strategy replans and Batch 11 agents must use the same Guardian HTTP
  surface before committing replans or generated variants.

## References

- `docs/adr/ADR-023-pedagogy-guardian-independent-validation-gate.md`
- `IMPLEMENTATION_PLAN_FINAL.md` §10 and Batch 8
