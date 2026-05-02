# ADR-011: Direct Rename and No-Alias Policy

| Field       | Value                                            |
| ----------- | ------------------------------------------------ |
| **Status**  | Accepted                                         |
| **Date**    | 2026-05-01                                       |
| **Phase**   | Realignment                                      |
| **Authors** | Codex (AI), directed by project owner            |
| **Sources** | `IMPLEMENTATION_PLAN_FINAL.md`, `REALIGNMENT.md` |

## Context

The app is unreleased. The realignment intentionally replaces stale vocabulary:
`TeachingApproach` becomes `EpistemicMode`; learner-facing mastery becomes
stability; card attempts and card queue items become Step/evaluation concepts;
and cohort handshakes are removed.

Compatibility shims would preserve stale names and make the refactor harder to
verify.

## Decision

Apply renames and deletes directly, without aliases or long-term compatibility
shims.

- Rename `TeachingApproach` to `EpistemicMode`.
- Rename `TeachingApproachCategory` to `EpistemicModeCategory`.
- Rename `teachingApproach` fields to `epistemicMode`.
- Remove the old `STANDARD` teaching approach value.
- Rename learner-facing "mastery/mastered" language to "stability/stable" or
  `ConceptState` where it refers to current concept status.
- Delete stale APIs, schemas, tables, and UI in the same batch that introduces
  their replacement.

## Rationale

- Direct renames make grep-based acceptance criteria meaningful.
- The unreleased product does not need public compatibility cost.
- Removing stale names prevents later code from quietly reintroducing old
  semantics.

## Alternatives Considered

| Option                                  | Pros                           | Cons                                                     | Rejected because                                   |
| --------------------------------------- | ------------------------------ | -------------------------------------------------------- | -------------------------------------------------- |
| Keep aliases for one or more releases   | Easier external migration      | Doubles contract surface and weakens grep acceptance     | There is no released external contract to preserve |
| Keep old DB columns and add new columns | Lower immediate migration risk | Two sources of truth for the same fact                   | The plan requires one source of truth per fact     |
| Rename only UI copy first               | Low blast radius               | Backend and scheduler would remain card/mastery centered | The implementation needs semantic consistency      |

## Phase Plan

Batch 1 performs shared vocabulary and contract changes. Later batches remove
stale service-specific tables, APIs, and UI surfaces as their replacements land.

## Rename/Delete Scope

| Stale concept                                                      | Target                                                         |
| ------------------------------------------------------------------ | -------------------------------------------------------------- |
| `TeachingApproach`, `teachingApproach`, `TeachingApproachCategory` | `EpistemicMode`, `epistemicMode`, `EpistemicModeCategory`      |
| `STANDARD` mode fallback                                           | explicit real `EpistemicMode` chosen by planner/default        |
| learner-facing `Rating`                                            | `StepSelfRating`; scheduler-only `SchedulerRating` is internal |
| `Attempt` as runtime evidence row                                  | Step answer evidence plus metacognition-owned Evaluation       |
| `SessionQueueItem`                                                 | `StepQueueItem`                                                |
| `UserStreak` in session-service                                    | gamification-service derived projection                        |
| `SchedulerCard` / card-centric `Review`                            | `ConceptScheduleState` / `ConceptEvaluationLog`                |
| mastery/mastered learner state                                     | stability/stable/unstable `ConceptState`                       |

## Enforcement

- Do not introduce compatibility exports for stale names.
- Do not keep old and new DB columns for the same fact after the replacement
  migration lands.
- Grep-based acceptance checks are valid and required for production code.
- Historical docs may mention stale terms only as background or superseded
  vocabulary.

## Step Log

- 2026-05-01: Decision recorded before implementation. A repository grep shows
  production code still contains `TeachingApproach`, `teachingApproach`, card
  queue names, cohort handshake names, and mastery vocabulary.
- 2026-05-01: Expanded rename/delete scope and enforcement rules during the
  deeper Batch 0 pass.

## Emergent Decisions During Implementation

- None yet.

## Consequences

- Batch validation can require zero production-code hits for forbidden stale
  names.
- API client regeneration will be disruptive but clean.
- Docs and OpenAPI specs must be updated in the same batches as source changes.
- Any later-batch code already present in the worktree must still pass these
  no-alias checks before being considered accepted.

## References

- `IMPLEMENTATION_PLAN_FINAL.md` sections 1, 3, 16 Batch 1, and 19.
- `REALIGNMENT.md` sections 3, 6, and 10.
