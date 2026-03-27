# Mode-Aware Scheduler and Session

## Purpose

This document defines how scheduler and session behavior must change under the
mode-aware architecture.

The key rule is simple:

> shared card identity does not imply shared schedule state.

## Scheduler Model

## Schedule state identity

Scheduler state must be keyed by:

```ts
(userId, cardId, learningMode);
```

This prevents the most serious failure mode in the architecture:

- a review trajectory in one mode incorrectly influencing readiness in another

## Planning inputs

Planner inputs should include:

- `userId`
- `learningMode`
- candidate card IDs or selection filters
- relevant policy/loadout data
- optional graph/mastery context

If planner inputs omit `learningMode`, application services may temporarily
default during migration, but the long-term contract should be explicit.

## Policy routing

The scheduler stays shared, but planning policy becomes mode-aware.

### Knowledge gaining

Preserve:

- conceptual prioritization
- graph-aware ordering
- current conceptual retention behavior

### Language learning

Allow:

- HLR-oriented features for relevant item families
- interference-aware prioritization
- language-specific review heuristics where the scheduler architecture permits

Mode determines policy selection. It should not require separate scheduler
deployments.

## Session Model

## Single-mode session default

A session must have one explicit `learningMode`.

Recommended contract:

```ts
interface CreateSessionInput {
  learningMode: LearningMode;
}
```

Rules:

- every card in the session must be valid in that mode
- every attempt recorded under the session is interpreted in that mode
- the session cannot silently switch modes after creation

## Attempt capture

Attempt records must include:

- `sessionId`
- `cardId`
- `learningMode`
- scoring/review payload

This guarantees that downstream schedule updates and analytics are correctly
scoped.

## Read models and analytics

Scheduler and session read models should support:

- querying by mode
- querying across modes only deliberately
- clear labeling of the active interpretation scope

Typical learner-facing defaults:

- due cards for active mode
- current streaks or progress for active mode
- active session history for active mode

## Compatibility Guidance

Legacy schedule rows and attempts should be treated as `knowledge_gaining` until
explicitly migrated or recreated under the new contracts.

Old clients may rely on application defaults during transition, but repositories
and downstream write paths should move toward explicit mode requirements as soon
as practical.

## Common Failure Modes

### Wrong schedule row loaded

Cause:

- repository lookup by `(userId, cardId)` instead of `(userId, cardId, mode)`

Mitigation:

- composite keys and explicit repository contracts

### Session created in one mode, attempts written in another

Cause:

- missing propagation through client or service boundary

Mitigation:

- validate attempt mode against session mode
- integration tests across the full create-session -> attempt -> schedule-update
  path

### Dashboard or queue mixes modes silently

Cause:

- read model lacking mode filter or default

Mitigation:

- require explicit mode filtering in learner-facing views

## Suggested Test Matrix

### Shared card, separate schedule state

- card belongs to both modes
- review it once in each mode
- verify two schedule trajectories

### Shared card, single-mode session

- include shared card in language session
- include same card later in knowledge session
- verify attempts and subsequent scheduling remain separated

### Legacy fallback

- existing schedule state with no explicit mode
- verify compatibility reads as `knowledge_gaining`

### Planner differentiation

- same card pool under different modes
- verify planner ranking or policy context diverges where intended

## Acceptance Criteria

The scheduler/session architecture is correct when:

- schedule state is mode-scoped
- sessions are single-mode by default
- attempt capture preserves mode context
- planner can vary policy by mode
- dashboards and due queues do not silently merge unlike contexts

## Related Documents

- `docs/architecture/decisions/ADR-0055-mode-scoped-scheduling-sessions-and-mastery.md`
- `docs/backend/mode-aware-learning-core.md`
- `docs/guides/mode-aware-data-migration.md`
