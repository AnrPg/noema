# ADR-017: Realignment Batch 1 Shared Vocabulary, Contracts, Events, and Config

| Field       | Value                                            |
| ----------- | ------------------------------------------------ |
| **Status**  | Accepted                                         |
| **Date**    | 2026-05-01                                       |
| **Phase**   | Realignment Batch 1                              |
| **Authors** | Codex (AI), directed by project owner            |
| **Sources** | `IMPLEMENTATION_PLAN_FINAL.md`, `REALIGNMENT.md` |

## Context

Batch 1 establishes the shared language that later service migrations depend on.
The codebase still contains stale shared vocabulary such as `TeachingApproach`,
`teachingApproach`, card-centric scheduler/session events, and learner-facing
scheduler ratings. Later destructive service migrations should not start until
shared packages expose the canonical Step-first, reasoning-dominant vocabulary.

> Batch 0 caveat: an earlier implementation pass touched Batch 1 files before
> the project owner clarified that deeper ADR preparation must happen first.
> Those edits remain in the worktree, but this ADR is not a sign-off. When Batch
> 1 receives a go-ahead, the implementation must be reviewed and refactored as
> fresh work against the Batch 0 ADR set.

## Decision

Implement Batch 1 across shared packages:

- `packages/types`: replace `TeachingApproach` with `EpistemicMode`, remove
  `STANDARD`, add Step, Goal, Trigger, SchedulerQueue, ConceptState,
  TransformationType, ReplanScope, RigorLevel, lifecycle, self-rating, and
  branded IDs.
- `packages/validation`: expose Zod schemas for the new vocabulary and DTO
  primitives.
- `packages/contracts`: add LessonPlan, Step, Activity, Evaluation, Trigger, and
  Replan DTO contracts.
- `packages/events`: add realignment event families and remove stale cohort
  event types from the exported production surface.
- `@noema/config`: add metacognition, gamification, and eligibility defaults
  from the implementation plan.

## Rationale

- Later service batches need one canonical import path for the new names.
- Removing aliases immediately makes the Batch 1 grep acceptance meaningful.
- Keeping configuration defaults shared prevents scoring thresholds and
  eligibility settings from being hardcoded into individual services.

## Alternatives Considered

| Option                                     | Pros                           | Cons                                                 | Rejected because                                   |
| ------------------------------------------ | ------------------------------ | ---------------------------------------------------- | -------------------------------------------------- |
| Add new names beside old names temporarily | Lower migration shock          | Leaves aliases and makes stale imports valid         | The project owner required no-alias clean refactor |
| Update service-local types first           | Smaller shared-package change  | Services would drift and duplicate domain vocabulary | Shared packages are the contract boundary          |
| Delay event removal until service batches  | Fewer immediate compile errors | Old events remain available and can be reused        | Batch 1 explicitly removes cohort event types      |

## Phase Plan

1. Inspect package structure and existing enum/schema/export conventions.
2. Implement new shared types and branded IDs.
3. Update validation schemas and contracts to reference canonical types.
4. Update event exports to include realignment events and remove cohort exports.
5. Add shared config defaults.
6. Run package-level tests/typechecks, then update this ADR with any emergent
   decisions.

## Step Log

- 2026-05-01: Phase ADR created before Batch 1 code edits.
- 2026-05-01: Added shared realignment vocabulary to `@noema/types`, including
  Step, Goal, Trigger, ConceptState, SchedulerQueue, SchedulerRating,
  ReplanScope, EligibilityGroup, TransformationType, RigorLevel, and
  StepSelfRating.
- 2026-05-01: Renamed `TeachingApproach` to `EpistemicMode` in production code
  touched by Batch 1 and removed the `STANDARD` enum value.
- 2026-05-01: Added realignment branded IDs and mirrored Zod schemas in
  `@noema/validation`.
- 2026-05-01: Added `learning-loop` DTO contracts, a realignment event family,
  and shared metacognition/gamification/eligibility config defaults.
- 2026-05-01: Ran typechecks for `@noema/types`, `@noema/validation`,
  `@noema/contracts`, `@noema/events`, `@noema/config`, `@noema/api-client`, and
  `@noema/session-service`. All passed.
- 2026-05-01: Ran package test scripts for the five touched shared packages. All
  exited with Vitest's "No test files found" code 1; no package currently has
  local test files for those scripts.
- 2026-05-01: Status changed to "prepared; not signed off" during the deeper
  Batch 0 pass. Existing edits must be re-audited before Batch 1 is accepted.
- 2026-05-01: Re-opened Batch 1 with project owner go-ahead. The existing
  shared-package edits are being treated as draft work and re-audited against
  Batch 1 acceptance.
- 2026-05-01: Removed shared `session.cohort.*` and `schedule.handshake.*` event
  constants, payload types, Zod payload schemas, event schemas, and domain-event
  union members from `@noema/events`.
- 2026-05-01: Split the temporary all-in-one event type map into domain-specific
  runtime event maps: `LessonPlanEventType`, `StepEventType`,
  `MetacognitionEventType`, `StrategyEventType`, `PedagogyEventType`,
  `KnowledgeGraphLearningEventType`, and `GamificationEventType`.
- 2026-05-01: Added focused Batch 1 tests for validation vocabulary, learning
  loop DTOs, realignment event schemas, and shared config defaults so package
  test scripts exercise the new contract surface.
- 2026-05-01: Moved the remaining session-service cohort payload type dependency
  off `@noema/events` and into service-local types. This preserves the
  later-batch legacy workflow temporarily while keeping the shared event package
  free of deleted cohort contracts.

## Emergent Decisions During Implementation

- Used `generative_retrieval` as the temporary fallback epistemic mode when
  replacing old `standard` fallback values. It is an existing reinforcement mode
  and keeps old default review behavior closest to retrieval practice until the
  Step planner takes over mode selection.
- Kept the existing legacy `Rating` export for now because current
  session/scheduler code still compiles against it. Added `SchedulerRating` as
  the new internal scheduler-facing value; removing old learner-facing rating
  usage remains part of the service/UI cutover batches.
- Removed the stale cohort/handshake event contracts from the shared
  `@noema/events` production surface now, while leaving service-local legacy
  cohort workflow code in place for the later deletion batches. Any code that
  still needs those payload shapes before deletion must define them locally and
  must not re-export them as shared contracts.
- Rejected a temporary all-in-one event map name because it described the
  implementation history instead of the product domain. The exported event maps
  now follow domain language and can be imported independently by services that
  publish or consume a specific event family.

## Validation Results

- Passed: `pnpm --filter @noema/types test`
- Passed: `pnpm --filter @noema/validation test`
- Passed: `pnpm --filter @noema/contracts test`
- Passed: `pnpm --filter @noema/events test`
- Passed: `pnpm --filter @noema/config test`
- Passed: `pnpm --filter @noema/types typecheck`
- Passed: `pnpm --filter @noema/validation typecheck`
- Passed: `pnpm --filter @noema/contracts typecheck`
- Passed: `pnpm --filter @noema/events typecheck`
- Passed: `pnpm --filter @noema/config typecheck`
- Passed: `pnpm --filter @noema/types build`
- Passed: `pnpm --filter @noema/validation build`
- Passed: `pnpm --filter @noema/contracts build`
- Passed: `pnpm --filter @noema/events build`
- Passed: `pnpm --filter @noema/config build`
- Passed: `pnpm --filter @noema/session-service typecheck`
- Passed: case-sensitive production grep for `TeachingApproach`,
  `teachingApproach`, and `STANDARD` in `packages`, `services`, `apps`, and
  `docs/api`.
- Passed: production grep for shared `SessionCohort`, `session.cohort`,
  `ScheduleHandshake`, `schedule.handshake`, and `scheduler.cohort` in
  `packages/events/src`, excluding test-only negative assertions.
- Not passed: `pnpm typecheck` at repo root. It now clears the Batch 1 shared
  package and session-service fallout, then fails in the pre-existing Batch 3
  draft content-service edits because Prisma generated types do not include the
  partially added generated activity variant/card compatibility schema.

## Acceptance

- Shared packages compile and tests pass.
- `pnpm test` for affected shared packages passes where package scripts exist.
- Production code no longer imports `TeachingApproach`, `teachingApproach`, or
  `STANDARD` after the full Batch 1 migration.
- Shared `@noema/events` production exports no longer expose `session.cohort.*`,
  `schedule.handshake.*`, or `scheduler.cohort.*` contracts.

## References

- `IMPLEMENTATION_PLAN_FINAL.md` sections 3, 4.1, 16 Batch 1, and 18.
- `REALIGNMENT.md` sections 4, 6, 7, and 8.
- `docs/adr/ADR-011-direct-rename-no-alias-policy.md`
