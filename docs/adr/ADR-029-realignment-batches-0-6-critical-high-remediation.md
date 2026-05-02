# ADR-029: Realignment Batches 0-6 Critical/High Remediation

- **Date:** 2026-05-02
- **Status:** accepted
- **Deciders:** Codex

## Context

The audit of realignment batches 0 through 6 found critical and high-severity
gaps in the closed learning loop. The service implementations largely moved
toward Step-first, metacognition-owned Evaluation, and concept-first scheduling,
but several supporting contracts and persistence paths still reflected deleted
card-centric APIs or allowed partial event processing.

The affected requirements come from `IMPLEMENTATION_PLAN_FINAL.md` and
`REALIGNMENT.md`:

- Public card-centric scheduler APIs must be removed after Batch 6.
- Session card Attempt and legacy queue APIs must be removed after Batch 4.
- Evaluation lives in metacognition-service and carries `studyMode` plus
  transformation metadata.
- Scheduler consumes canonical metacognition evaluations and updates concept
  schedule state reliably.
- Knowledge-graph `misconception.detected` events bridge into the metacognition
  trigger loop.

## Decision

This remediation phase will make the critical/high fixes as one cohesive
consistency pass:

1. Align scheduler Prisma enum mappings with the destructive Batch 6 migration.
2. Replace scheduler state/log/history writes with one repository-level
   idempotent transaction.
3. Persist metacognition `studyMode` and `transformation` metadata in Evaluation
   rows.
4. Add a metacognition KG misconception consumer that records canonical bridge
   evaluations/triggers rather than leaving the event unhandled.
5. Make session `answerStep` submit the canonical Evaluation to
   metacognition-service before marking the Step evaluated.
6. Replace stale public API client scheduler/session surfaces with Step-first
   and concept-first contracts.

## Rationale

These fixes are coupled by one invariant: a Step answer must become exactly one
canonical Evaluation, and that Evaluation must be replay-safe into concept
scheduling. Fixing only the enum or only the client surface would still leave
the loop semantically broken.

## Alternatives Considered

| Option                                                            | Pros                         | Cons                                                                | Rejected because                                                      |
| ----------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Patch only the two critical findings                              | Smallest change              | Leaves session and metacognition unable to feed scheduler correctly | The user explicitly asked to fix critical and high items systemically |
| Reintroduce compatibility aliases for old client APIs             | Less downstream churn        | Violates the clean-refactor/no-alias policy                         | The implementation plan requires direct deletion                      |
| Add a scheduler inbox table back                                  | Familiar idempotency pattern | Recreates a table explicitly dropped by Batch 6                     | The concept evaluation log unique key can be the idempotency boundary |
| Make session publish `metacognition.evaluation.recorded` directly | Simple local change          | Duplicates Evaluation ownership in session-service                  | ADR-013 says metacognition-service owns Evaluation                    |

## Consequences

- Positive: the closed loop becomes durable across session, metacognition, and
  scheduler.
- Positive: API client contracts stop advertising deleted endpoints.
- Negative / trade-offs: session-service now depends on metacognition-service
  availability for Step evaluation.
- Negative / trade-offs: KG misconception bridge evaluations are synthetic but
  traceable, because KG events do not contain a learner response.
- Follow-up tasks created: none yet.

## Implementation Notes

- Scheduler Prisma `StudyMode` enum mappings were corrected to match the
  uppercase migration values, and scheduler concept evaluation processing now
  goes through `recordEvaluationTransition`, a repository-level Prisma
  transaction that uses the evaluation/concept/mode unique key as the replay
  boundary.
- Scheduler duplicate evaluation replays now return the existing schedule/log
  snapshot without advancing state a second time; publication remains
  at-least-once.
- Metacognition Evaluation persistence now stores `studyMode` and
  `transformation`, accepts deterministic `evaluationId` values from upstream
  ports, and treats repeated `stepId` submissions idempotently.
- Metacognition now consumes KG `misconception.detected` events and records
  traceable synthetic evaluations with error-detection transformation metadata,
  misconception references, and prerequisite gap concept references.
- Session `answerStep` now requires canonical evaluation inputs (`correct`,
  `selfRating`, `trace`) and delegates Evaluation creation to a metacognition
  port before marking a Step evaluated.
- The public API client was rebuilt around concept scheduler and step-loop
  session contracts; card queue, card attempt, scheduler card, review
  stats/window/simulation, forecast, streak, and progress-summary client
  surfaces were removed rather than aliased.
- Web consumers were updated to use due concepts, concept schedules,
  transformation history, and step-loop submission. Components that are still
  compatibility-named now render concept-first data while keeping their local
  component names to avoid unrelated routing/layout churn.
- Validation run on 2026-05-02:
  - `pnpm --filter @noema/api-client build`
  - `pnpm --filter @noema/api-client typecheck`
  - `pnpm --filter @noema/api-client test`
  - `pnpm --filter @noema/web typecheck`
  - `pnpm --filter @noema/web lint` (passes with 5 pre-existing warnings in
    unrelated files)
  - `pnpm --filter @noema/scheduler-service typecheck`
  - `pnpm --filter @noema/scheduler-service test`
  - `pnpm --filter @noema/session-service typecheck`
  - `pnpm --filter @noema/session-service test`
  - `pnpm --filter @noema/metacognition-service typecheck`
  - `pnpm --filter @noema/metacognition-service test`

## References

- `IMPLEMENTATION_PLAN_FINAL.md`
- `REALIGNMENT.md`
- `docs/adr/ADR-013-evaluation-owned-by-metacognition-service.md`
- `docs/adr/ADR-014-scheduler-is-concept-first.md`
- `docs/adr/ADR-026-realignment-batch-4-session-service-step-loop.md`
- `docs/adr/ADR-027-realignment-batch-5-metacognition-evaluation-loop.md`
- `docs/adr/ADR-028-realignment-batch-6-scheduler-concept-first.md`
