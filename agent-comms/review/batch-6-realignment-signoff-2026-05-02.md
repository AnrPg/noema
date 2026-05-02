# Review Report - Realignment Batch 6 Sign-off - 2026-05-02

## Summary

PASS for the non-KG Batch 6 scheduler-service scope.

This sign-off explicitly excludes work that `IMPLEMENTATION_PLAN_FINAL.md`
assigns to later batches:

- Batch 7: knowledge-graph stability projection, KG state/history APIs, Neo4j
  concept-state projection, stability-summary replacement.
- Batch 8: Pedagogy Guardian.
- Batch 9: strategy/replanning.
- Batch 10: web app cutover and Playwright Step-flow acceptance.
- Batch 11: content generation agents and ingestion hook.
- Batch 12: gamification-service.
- Batch 13: full closed-loop E2E, load, and chaos tests.

## Batch 6 Requirement Trace

| Requirement                                                                                                                                                                              | Evidence                                                                                                                                                                                                                                                                                                                | Status | Notes                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drop old scheduler tables: `SchedulerCard`, `Review`, `CalibrationData`, `ScheduleProposal`, `ScheduleCommit`, `ScheduleCohortLineage`, `SchedulerHandshakeState`, `SchedulerEventInbox` | `services/scheduler-service/prisma/migrations/20260502010000_scheduler_concept_first/migration.sql`; `services/scheduler-service/prisma/schema.prisma`                                                                                                                                                                  | PASS   | Prisma schema now exposes concept-first scheduler models only. `migrate deploy` was not run locally because the migration is destructive.                                 |
| Add new §4.10 concept scheduler tables                                                                                                                                                   | `services/scheduler-service/prisma/schema.prisma`; `services/scheduler-service/src/infrastructure/database/prisma-concept-schedule.repository.ts`                                                                                                                                                                       | PASS   | Repository persists schedule state, evaluation logs, transformation history, event inbox, and event outbox for the new loop.                                              |
| Consume `metacognition.evaluation.recorded`                                                                                                                                              | `services/scheduler-service/src/events/consumers/metacognition-evaluation-recorded.consumer.ts`; `services/scheduler-service/src/index.ts`                                                                                                                                                                              | PASS   | Runtime bootstrap subscribes the concept scheduler consumer and calls the concept-first scheduling service.                                                               |
| Update `ConceptScheduleState`, write `ConceptEvaluationLog`, write `ConceptTransformationHistory`, emit `scheduler.concept_state.updated`                                                | `services/scheduler-service/src/domain/scheduler-service/scheduler.service.ts`; `services/scheduler-service/tests/unit/domain/concept-scheduler.test.ts`                                                                                                                                                                | PASS   | Tests cover the required state sequence, replay idempotency, multi-concept evaluation handling, and the no-transformation-metadata edge.                                  |
| REST routes: `GET /v1/concepts/:conceptId/schedule`, `GET /v1/concepts/due`, `GET /v1/concepts/:conceptId/transformation-history`                                                        | `services/scheduler-service/src/api/rest/scheduler.routes.ts`; `services/scheduler-service/tests/unit/api/scheduler.routes.test.ts`; `docs/api/openapi/scheduler-service/openapi.yaml`                                                                                                                                  | PASS   | OpenAPI and route tests now describe only the concept-first surface.                                                                                                      |
| Refactor algorithms to consume evaluation-shaped input                                                                                                                                   | `services/scheduler-service/src/domain/scheduler-service/algorithms/fsrs.ts`; `services/scheduler-service/src/domain/scheduler-service/algorithms/hlr.ts`; `services/scheduler-service/src/domain/scheduler-service/algorithms/sm2.ts`; `services/scheduler-service/src/domain/scheduler-service/algorithms/leitner.ts` | PASS   | Scheduler tests exercise the concept-evaluation planning path.                                                                                                            |
| Remove every card-centric scheduling code path/public API that took `cardId`                                                                                                             | Deleted scheduler tool/card/cohort runtime files; `packages/api-client/src/scheduler/api.test.ts`; `services/scheduler-service/tests/unit/api/scheduler.routes.test.ts`                                                                                                                                                 | PASS   | Static search in scheduler runtime, API client scheduler source, and scheduler OpenAPI has no card/cohort/tool remnants. Remaining terms are only regression-test labels. |
| Acceptance: three evaluations transition `NEW_LEARNING -> REINFORCEMENT -> REPAIR`                                                                                                       | `services/scheduler-service/tests/unit/domain/concept-scheduler.test.ts`                                                                                                                                                                                                                                                | PASS   | Covered by the state-transition test.                                                                                                                                     |

## Additional Fixes From This Sign-off

- Removed stale `scheduler:tools:*` dev-auth scopes from
  `services/scheduler-service/src/api/middleware/auth.middleware.ts`.
- Replaced auth middleware tests with surviving scheduler scopes
  (`scheduler:plan`, `scheduler:write`).
- Replaced stale scheduler OpenAPI docs that still advertised
  dual-lane/card/tool-era endpoints.
- Added scheduler API-client regression tests to keep deleted exports from
  returning.
- Added scheduler route tests to prove the concept-first routes and old card
  projection 404 behavior.
- Added concept scheduler domain coverage for multi-concept evaluations and
  missing transformation metadata.

## Validation Evidence

- `pnpm --filter @noema/scheduler-service test` - PASS, 5 files / 66 tests.
- `pnpm --filter @noema/scheduler-service typecheck` - PASS.
- `pnpm --filter @noema/scheduler-service lint` - PASS.
- `pnpm --filter @noema/scheduler-service build` - PASS.
- `pnpm --filter @noema/scheduler-service db:generate` - PASS.
- `pnpm --filter @noema/scheduler-service exec prisma validate --schema prisma/schema.prisma` -
  PASS.
- `pnpm --filter @noema/api-client test` - PASS, 3 files / 8 tests.
- `pnpm --filter @noema/api-client typecheck` - PASS.
- `pnpm --filter @noema/api-client build` - PASS.
- `pnpm --filter @noema/web typecheck` - PASS.
- `pnpm --filter @noema/web lint` - PASS.

## Static Audit Evidence

Focused static search across:

- `services/scheduler-service/src`
- `packages/api-client/src/scheduler`
- `docs/api/openapi/scheduler-service`

Searched for deleted scheduler concepts:

- `scheduler:tools`, `tools:read`, `tools:execute`
- `SchedulerCard`, `cardId`, `CardId`, `/cards`
- `cohort`, `DualLane`, `dual-lane`
- `ScheduleProposal`, `ScheduleCommit`, `CalibrationData`
- `SchedulerEventInbox`, `SchedulerHandshake`

Result: no runtime/client/docs hits. The only remaining card/cohort text is in
regression tests that assert deleted APIs/exports stay deleted.

## Residual Risk

- `prisma migrate deploy` was not executed locally because the Batch 6 migration
  intentionally drops old scheduler tables and could destroy local dev data. The
  migration SQL and Prisma schema were validated without applying the
  destructive migration.
- Real Redis broker delivery is represented by unit-level consumer/service
  tests, not a full broker integration run in this sign-off.
- KG projection and downstream stability vocabulary are intentionally deferred
  to Batch 7 per the implementation plan.

## Required Changes Before Next Batch

- None for non-KG Batch 6.
