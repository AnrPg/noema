# ADR-0055: Mode-Scoped Scheduling, Sessions, and Mastery

## Status

Accepted

## Date

2026-03-27

## Context

The most dangerous failure in a dual-use learning platform is not UI confusion;
it is progress contamination.

If the same node or card identity automatically shares:

- schedule state
- review history
- mastery
- remediation history

across `language_learning` and `knowledge_gaining`, the system will make deeply
misleading decisions.

Example:

- a user studies `cell` intensively as a German lexical item
- the same label or linked content is barely studied as a biology concept
- a shared schedule/mastery state would make one context inherit confidence from
  the other

That would corrupt planning, reporting, and remediation.

At the same time, the system should not duplicate every card or node just to
avoid contamination. The architecture therefore needs a precise separation of
identity and progress.

## Decision

### 1) Make all progress-bearing state mode-scoped

The following state is mode-scoped:

- scheduler state
- session records
- attempt records
- node mastery
- readiness/frontier computations
- remediation and misconception history
- analytics summaries by default

### 2) Keep item identity separate from progress identity

Card and node identity remain stable and shared where appropriate, but progress
identity includes mode.

Examples:

- schedule key: `(userId, cardId, learningMode)`
- node mastery key: `(userId, nodeId, learningMode)`
- attempt record includes `learningMode`
- session record includes `learningMode`

### 3) Require mode in session creation and study execution

Every session has exactly one `learningMode`.

Rules:

- a session cannot silently change mode mid-flight
- all cards and attempts inside the session are interpreted in that mode
- the session planner must validate that items included are compatible with the
  chosen mode

### 4) Make scheduler policy mode-aware

The scheduler remains a shared system, but planning policy becomes mode-aware.

Implications:

- `language_learning` may route relevant item families through HLR-oriented or
  language-specific planning features
- `knowledge_gaining` preserves current conceptual/graph-aware planning behavior
- algorithm choice or weighting is a policy decision informed by mode rather
  than a separate scheduler stack

### 5) Analytics must default to mode-scoped reporting

Dashboards and insights default to the active mode.

Cross-mode reporting is allowed only when explicitly requested. It must present
itself as comparative or aggregated analysis, not the default meaning of
mastery.

## Rationale

### Why scope progress rather than duplicate items

- Shared identity keeps authoring and graph management tractable.
- Duplicating cards/nodes eagerly would create unnecessary divergence and
  synchronization burden.
- The true semantic difference is memory state, not always object identity.

### Why make sessions single-mode

- Session coherence matters for pedagogy, analytics, and debugging.
- A single-mode session makes it obvious how to interpret mistakes and spacing
  signals.
- Mixed-mode sessions can still be modeled later deliberately, but not by
  default and not through silent state mixing.

### Why mode-aware scheduler policy instead of separate schedulers

- The architecture already has one scheduler service with multiple algorithmic
  capabilities.
- A policy-routing approach preserves shared infrastructure while allowing
  differentiated behavior.
- It aligns with the existing direction of using HLR for language-oriented cases
  and FSRS/conceptual planning elsewhere.

## Alternatives Considered

| Option                               | Pros                        | Cons                                                    | Rejected because                            |
| ------------------------------------ | --------------------------- | ------------------------------------------------------- | ------------------------------------------- |
| Shared progress across modes         | Simpler persistence         | Semantically incorrect, corrupts planning               | It breaks the central product requirement   |
| Duplicate items per mode             | Strong isolation            | Data duplication, authoring drift, poor maintainability | Too expensive and blunt                     |
| Mixed-mode sessions by default       | Flexible                    | Ambiguous analytics and schedule semantics              | Too risky as a default model                |
| Separate scheduler services per mode | Strong local specialization | Duplicate infrastructure and policy drift               | Unnecessary given the shared scheduler core |

## Consequences

### Positive

- schedule and mastery signals remain trustworthy
- graph/content identity stays unified
- sessions become easier to reason about
- future policy routing can evolve without architectural forks

### Negative / trade-offs

- persistence keys and queries become more complex
- analytics must be more explicit about scope
- migration requires careful backfill and validation

### Follow-up tasks created

- add `learningMode` to session and attempt contracts
- key scheduler state by mode
- key node mastery by mode
- add mode-aware analytics defaults
- add validation to prevent cross-mode session contamination

## References

- `architecture.md`
- `docs/backend/mode-aware-scheduler-and-session.md`
- `docs/architecture/decisions/ADR-0022-dual-lane-scheduler.md`
- `docs/architecture/decisions/ADR-0029-scheduler-fsrs-hlr-runtime-integration-phase-3.md`
