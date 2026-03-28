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
- review analytics and scheduler reports for active mode

## Review Reporting and Analytics

Scheduler read models are not only for queue selection. They are also the
backend contract for learner-facing review reporting.

Mode-aware reporting now includes:

- review queue summaries
- scheduler progress/readiness summaries
- forecast projections
- scheduler-generated review windows
- aggregate review stats
- session and streak summaries

This is important architecturally because it keeps reporting close to the domain
that owns schedule semantics.

The frontend should prefer these scheduler/session read models over
reconstructing analytics from loosely coupled UI queries.

### Scheduler progress summary contract

The scheduler now owns a dedicated mode-scoped readiness summary endpoint for
dashboard and legacy progress consumers.

Recommended response fields:

- `studyMode`
- `totalCards`
- `trackedCards`
- `dueNow`
- `dueToday`
- `overdueCards`
- `newCards`
- `learningCards`
- `matureCards`
- `suspendedCards`
- lane breakdowns
- algorithm breakdowns
- `averageRecallProbability`
- `strongRecallCards`
- `fragileCards`

This read model matters because it gives agents and UIs one canonical place to
answer questions like:

- how much active workload exists right now in the current mode
- how much of the learner's deck is still untracked vs meaningfully retained
- whether today's issue is backlog, fragility, or simply a large new queue

The old `useMyProgress` compatibility hook should resolve to this scheduler
summary instead of returning placeholder data or reconstructing progress from
multiple independent service calls.

### Card focus summary contract

The scheduler also owns a card-level focus summary for answering:

- which cards are currently most fragile in this mode
- which cards are strongest and probably not the immediate problem

Recommended response fields:

- `weakestCards`
- `strongestCards`
- each entry including:
  - `cardId`
  - `studyMode`
  - `lane`
  - `schedulingAlgorithm`
  - `nextReviewDate`
  - `dueStatus`
  - `daysUntilDue`
  - `recallProbability`
  - `readinessBand`
  - `focusReason`

This read model is useful because goals and agents usually need actionable
reinforcement targets, not just aggregate counts.

### Study guidance summary contract

The scheduler now also exposes a lightweight prescriptive read model:

- an ordered `recommendations[]` array

Each recommendation should remain simple and composable:

- `action`
- `headline`
- `explanation`
- `suggestedCardCount`
- `relatedCardIds`

This contract is intentionally list-shaped because learner guidance often needs
multiple reasonable next steps rather than one artificially singular answer.

### Agent-first access

The same summary should be exposed through the scheduler tool surface so agents
can ask for the learner's current mode-scoped readiness without scraping UI
pages or composing queue/forecast endpoints themselves.

That tool should be able to answer:

- how much urgent workload exists right now
- whether the deck is mostly new, fragile, or mature
- whether the current issue is coverage, backlog, or retention stability

### Review stats contract guidance

Aggregate review stats should be queryable by:

- `userId`
- `learningMode`
- optional card/session/lane filters
- optional date-range filters

The default learner-facing interpretation remains:

- active mode only
- clearly labeled scope
- no implicit cross-mode aggregation

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

## Current Implementation Notes

The scheduler read layer now exposes three complementary mode-aware read models:

- progress summary
- card focus summary
- study guidance summary

The study guidance summary intentionally exposes an ordered `recommendations[]`
list instead of a single recommendation. Each entry is meant to stay simple
enough for UI chips, agent planning, or future workflow composition.

The current implementation also improved recommendation precision:

- `relatedCardIds` point at the relevant slice of the deck, not a generic weak
  card list
- language mode guidance uses slightly different framing from knowledge mode
- day-boundary calculations read the learner timezone from the API request
  instead of assuming server-local midnight

Session completion and streak writes now use the learner timezone as well, so
readiness, streaks, and daily guidance all align around the same user-local day.

The current client and REST flow propagate timezone through an explicit
`x-user-timezone` request header when available. Invalid or missing values fall
back to `UTC`, keeping the contract backward-compatible while allowing learner-
local day boundaries for due, overdue, streak, and guidance calculations.

## Related Documents

- `docs/architecture/decisions/ADR-0055-mode-scoped-scheduling-sessions-and-mastery.md`
- `docs/backend/mode-aware-learning-core.md`
- `docs/guides/mode-aware-data-migration.md`
