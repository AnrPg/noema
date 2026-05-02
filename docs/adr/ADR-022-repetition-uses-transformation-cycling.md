# ADR-022: Repetition Uses Transformation Cycling

| Field       | Value                                            |
| ----------- | ------------------------------------------------ |
| **Status**  | Accepted                                         |
| **Date**    | 2026-05-01                                       |
| **Phase**   | Realignment Batch 0 - ADR baseline               |
| **Authors** | Codex (AI), directed by project owner            |
| **Sources** | `IMPLEMENTATION_PLAN_FINAL.md`, `REALIGNMENT.md` |

## Context

The realignment requires repetition without identical re-presentation. A concept
coming due must be practiced through a transformed Step, not by replaying the
same card shape.

## Decision

Repetition cycles through six transformation types:

- `recall`
- `explanation`
- `comparison`
- `application`
- `perturbation`
- `error_detection`

Scheduler-service owns durable concept transformation history. Shared pure
helpers may expose the deterministic selection algorithm, but history lives with
concept-first scheduling state. Content-service exposes cards/templates/variants
compatible with requested transformations. Pedagogy Guardian rejects repair
Steps that do not differ meaningfully from the failed Step.

## Rationale

- Transformation history is concept/learner evidence and belongs with schedule
  state.
- Shared selection helpers keep agents and services aligned without owning
  persistence.
- Guarding repair Steps prevents superficial "new" content that repeats the same
  cognitive shape.

## Alternatives Considered

| Option                                          | Pros                        | Cons                                                        | Rejected because                          |
| ----------------------------------------------- | --------------------------- | ----------------------------------------------------------- | ----------------------------------------- |
| Randomize transformations                       | Simple variety              | Can repeat too soon and is hard to audit                    | The plan requires deterministic cycling   |
| Store transformation history in content-service | Close to generated variants | Content-service does not own learner/concept schedule state | Scheduler owns due-state and history      |
| Let agents decide transformation novelty        | Flexible                    | Non-deterministic and bypass-prone                          | Deterministic rules must constrain agents |

## Implementation Boundary

Batch 1 provides `TransformationType`. Batch 2 provides pure helpers. Batch 3
adds card/variant compatibility. Batch 6 persists concept transformation
history. Batch 8 validates no-repeat repair semantics.

## Acceptance Checks

- Every concept revisit selects a transformation not used in the recent cycle
  while alternatives remain.
- All six transformations are used before the cycle resets.
- Direct card presentation is allowed only as an Activity payload fallback, not
  as a return to card-as-runtime-unit semantics.

## Consequences

- Content generation cost and latency are real risks; generated variants must be
  cached with TTL.
- Scheduler tests must include transformation-history boundary cases.

## References

- `IMPLEMENTATION_PLAN_FINAL.md` sections 4.12, 4.13, 6, 16 Batches 2, 3, 6, 8,
  and 19.
- `REALIGNMENT.md` section 7.
- `docs/adr/ADR-014-scheduler-is-concept-first.md`
