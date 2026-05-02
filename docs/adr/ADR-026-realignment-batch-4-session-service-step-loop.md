# ADR-026 — Realignment Batch 4 Session-Service Step Loop

- **Date:** 2026-05-02
- **Status:** accepted
- **Deciders:** Codex

## Context

Batch 4 of `IMPLEMENTATION_PLAN_FINAL.md` moves `session-service` from the
legacy card-attempt loop to the realignment Step loop. The existing service
still owns `Attempt`, card queue, cohort handshake, session `state`, and
`UserStreak`, but the realignment makes `LessonPlan`, `Goal`, `Step`,
`Activity`, `StepQueueItem`, and `Session.lifecycleState` the session aggregate.

The app is unreleased and the implementation plan explicitly requires direct
deletion rather than compatibility shims.

## Decision

Implement Batch 4 as a clean session-service cutover:

- Replace legacy session persistence with `LessonPlan`, `LessonPlanGoal`,
  `Step`, `Activity`, and `StepQueueItem`.
- Drop `Attempt`, `SessionQueueItem`, `SessionCohortHandshake`, `UserStreak`,
  and `Session.state` from the session-service Prisma schema and migration.
- Replace card-attempt and legacy queue REST routes with the Step-loop routes
  required by Batch 4.
- Emit `session.lifecycle.transitioned` whenever session lifecycle changes, plus
  the existing realignment events for lesson-plan and step lifecycle.
- Generate minimal review plans deterministically in session-service.
- Keep the full LessonPlan generation as an adapter boundary that calls the
  Python LessonPlan Generation Agent when configured, because the agent
  implementation belongs to a later batch.

## Rationale

The realignment requires one runtime unit for learning intent. Keeping card
attempts or card queues in parallel would keep two sources of truth for
learner-visible progress and would violate ADR-010 and ADR-015. A direct cutover
also avoids persisting development history in production-facing APIs.

## Alternatives Considered

| Option                                                         | Pros                  | Cons                                                                        | Rejected because                               |
| -------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------- | ---------------------------------------------- |
| Add Step tables but keep legacy attempts/queues temporarily    | Lower immediate churn | Two runtime loops, ambiguous source of truth, more stale API surface        | Batch 4 explicitly requires deletes            |
| Wrap old card queue rows as synthetic Step rows during runtime | Preserves dev data    | Keeps card-first semantics alive and complicates lifecycle invariants       | The plan allows destructive dev-data migration |
| Implement full planner locally in TypeScript                   | Easier local tests    | Duplicates the Python agent boundary and would be stale once Batch 11 lands | The spec assigns full generation to agents     |
| Require Python planner for all lesson plans now                | Strict boundary       | Blocks minimal review loop acceptance and couples Batch 4 to Batch 11       | Minimal plans are deterministic by spec        |

## Phase Plan

1. Update Prisma schema and migration for the new aggregate and destructive
   legacy drops.
2. Replace session-service types, Zod schemas, repository interface, and Prisma
   repository with Step-loop equivalents.
3. Replace domain service methods with session creation, lesson-plan creation,
   goal creation, next-step, present, answer, and skip.
4. Replace REST routes with the new Batch 4 surface and remove legacy
   attempt/queue/cohort routes.
5. Remove stale streak/tool wiring that depends on deleted tables or APIs.
6. Add focused integration coverage for start session → minimal plan → present
   Step → answer Step → `EVALUATED`.
7. Validate with Prisma generate, migration, typecheck, and
   `pnpm --filter @noema/session-service test`.

## Step Log

- 2026-05-02: ADR opened before Batch 4 implementation.
- 2026-05-02: Replaced the session-service Prisma model with the Step-first
  aggregate and removed legacy `Attempt`, `SessionQueueItem`,
  `SessionCohortHandshake`, `UserStreak`, and `Session.state` from the service
  model.
- 2026-05-02: Added the destructive Batch 4 migration that drops card-attempt,
  card-queue, cohort-handshake, and streak tables before creating LessonPlan,
  Goal, Step, Activity, and StepQueueItem tables.
- 2026-05-02: Replaced session-service domain types, validation schemas,
  repository interface, Prisma repository, application service, and REST routes
  with the Batch 4 Step-loop surface.
- 2026-05-02: Removed streak service/repository wiring from session-service
  because streaks move to the derived gamification projection.
- 2026-05-02: Removed legacy card-attempt/cohort MCP tool registrations; the
  registry remains empty until Step-loop agent tools are specified in a later
  batch.
- 2026-05-02: Added focused Step-loop test coverage for session creation,
  minimal LessonPlan activation, next Step lookup, Step presentation, Step
  answer acceptance, and `EVALUATED` Step status.
- 2026-05-02: Generated the Prisma client, applied the migration to the local
  dev DB, ran session-service typecheck/build/test, and ran root
  `pnpm typecheck`.

## Emergent Decisions

- Added `LessonPlanState` to `@noema/types` because Batch 1 shared vocabulary
  had omitted it while the Batch 4 canonical model depends on it.
- Kept `/v1/offline-intents` and `/v1/offline-intents/verify` in place because
  offline-first semantics are explicitly preserved by `REALIGNMENT.md`; their
  payload remains independent of the deleted card-attempt loop.
- Left `FullLessonPlanFactory` behind an HTTP adapter boundary to
  `LESSON_PLAN_AGENT_URL` and made missing configuration a domain error, because
  the Python planner is assigned to a later batch.
- Kept the tool route shell but removed stale tool definitions rather than
  exposing tools that still describe deleted card-attempt/cohort behavior.

## Consequences

- Positive: session-service owns one Step-first session aggregate.
- Positive: legacy card-attempt and cohort handshake REST surfaces are gone from
  session-service.
- Negative / trade-offs: development data in legacy session tables is
  intentionally dropped.
- Follow-up tasks created: Batch 5 must persist canonical Evaluations in
  metacognition-service; Batch 11 must provide the Python LessonPlan Generation
  Agent.

## References

- `IMPLEMENTATION_PLAN_FINAL.md` §4.2–§4.7 and §16 Batch 4
- `REALIGNMENT.md` §2 and §5
- ADR-010 — Step is the atomic learning unit
- ADR-015 — Cohort handshake protocol removed
- ADR-020 — Every session has a LessonPlan
