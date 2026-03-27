# Mode-Aware Learning Core

## Purpose

This document defines the shared backend contract for Noema's mode-aware
architecture. It is the cross-service reference for how `LearningMode`,
multi-mode membership, and mode-scoped progress should behave.

This file is intentionally broader than any one service. It exists so
implementers do not invent conflicting semantics in different backends.

## Core Concept

```ts
type LearningMode = 'language_learning' | 'knowledge_gaining';
```

`LearningMode` is a first-class operational context that changes:

- graph interpretation
- card-generation defaults
- scheduling policy
- session semantics
- mastery and analytics meaning

It does **not** create:

- a separate app
- a separate service stack
- a separate graph substrate

## Shared Invariants

### Shared identity, separate progress

Cards and nodes may be shared across modes, but progress-bearing records are
always mode-scoped.

### Explicit beats implicit

Critical write paths should carry `learningMode` explicitly. Compatibility
defaulting is transitional, not the long-term contract ideal.

### Global active mode exists, but backend contracts remain explicit

Frontend shell state may provide the default mode, but backend contracts should
remain able to accept and persist mode independently.

## Entity Semantics

## Nodes

Nodes remain part of the shared PKG/CKG model.

Recommended additive contract:

```ts
interface ModeAwareNode {
  nodeId: NodeId;
  supportedModes: LearningMode[];
}
```

Meaning:

- `supportedModes` defines where the node is eligible and meaningful
- graph lenses may still hide or de-emphasize the node depending on context
- node identity does not imply shared mastery or readiness

## Cards

Cards remain universal content objects.

Recommended additive contract:

```ts
interface ModeAwareCard {
  cardId: CardId;
  supportedModes: LearningMode[];
}
```

Meaning:

- a card can be language-only, knowledge-only, or multi-mode
- content can remain shared while schedule state is separated downstream

## Progress-bearing records

The following records must be mode-scoped:

- scheduler state
- session records
- attempts
- node mastery
- remediation and misconception instances
- analytics rollups that summarize user performance

## Record-Keying Rules

## Scheduler state

Minimum key:

```ts
(userId, cardId, learningMode);
```

Rationale:

- same card can be reviewed under different pedagogical semantics
- spacing and readiness cannot be shared by default

## Node mastery

Minimum key:

```ts
(userId, nodeId, learningMode);
```

Rationale:

- same node label or shared node identity may represent different mastery
  contexts

## Session

Sessions should carry one explicit mode:

```ts
interface SessionContext {
  learningMode: LearningMode;
}
```

Rules:

- session is single-mode by default
- all attempts in the session inherit or explicitly repeat that mode
- mixed-mode sessions are out of scope for the default architecture

## API and Event Guidance

## Read contracts

Read APIs should generally:

- accept explicit `learningMode` filters
- default from active user mode where appropriate
- label responses clearly when mode-scoped

## Write contracts

Write APIs should:

- accept `learningMode` explicitly for critical writes
- reject incompatible operations where mode is missing and cannot be safely
  defaulted
- never silently merge mode-scoped state

## Events

Events describing or mutating mode-scoped state should carry `learningMode`.

Examples:

- card study attempt recorded
- schedule updated
- session created
- mastery updated

Events that only describe mode-neutral identity changes may omit it if the
semantics truly do not depend on mode.

## Compatibility Rules

During migration:

- missing mode should resolve to `knowledge_gaining` when reading legacy state
- old clients may rely on application defaults
- newly written progress-bearing records should converge toward explicit mode

This compatibility rule is transitional and should not become a permanent excuse
for unscoped writes.

## Failure Modes to Avoid

### 1. Hidden cross-mode reuse

Example:

- same `cardId`, no mode filter
- scheduler loads the wrong schedule row

Mitigation:

- composite keys
- explicit repository methods that require mode

### 2. UI defaulting not reflected in write paths

Example:

- frontend shows language mode
- backend write path falls back to knowledge mode silently

Mitigation:

- request contracts should carry mode explicitly where state changes
- integration tests should verify end-to-end propagation

### 3. Analytics rollups merging unlike contexts

Example:

- dashboard summarizes one node across both modes without labeling scope

Mitigation:

- mode-scoped analytics by default
- explicit comparative reports only when deliberately requested

## Suggested Repository Interface Pattern

Use repository signatures that require mode in all progress-bearing contexts.

Example:

```ts
interface SchedulerRepository {
  getState(
    userId: UserId,
    cardId: CardId,
    learningMode: LearningMode
  ): Promise<ScheduleState | null>;
  saveState(
    input: SaveScheduleStateInput & { learningMode: LearningMode }
  ): Promise<void>;
}
```

This is preferable to optional mode arguments, which invite accidental fallback.

## Acceptance Criteria

The mode-aware backend core is correctly implemented when:

- services can store shared nodes/cards without shared memory state
- repositories require mode where progress is stored
- old data still resolves safely as `knowledge_gaining`
- integration tests prove separation of trajectories for shared items

## Related Documents

- `architecture.md`
- `docs/backend/mode-aware-knowledge-graph.md`
- `docs/backend/mode-aware-content-and-batch-creation.md`
- `docs/backend/mode-aware-scheduler-and-session.md`
- `docs/guides/mode-aware-data-migration.md`
