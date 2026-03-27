# ADR-0058: Mode-Aware Migration and Backward Compatibility

## Status

Accepted

## Date

2026-03-27

## Context

The mode-aware architecture affects almost every major surface:

- shared types
- graph/content DTOs
- scheduler/session persistence
- attempt capture
- analytics
- frontend app state

This breadth makes migration strategy a first-class architectural decision. If
Noema rolls out mode awareness without a compatibility plan, likely failures
include:

- old clients failing on required mode fields
- existing schedule and mastery data becoming unreadable
- implicit reclassification of legacy content causing bad learning behavior
- analytics mixing old and new semantics without clear scope boundaries

The migration must therefore preserve product continuity while moving the
platform to the new contract model.

## Decision

### 1) Use additive rollout first

Initial rollout is additive:

- add `LearningMode` to shared contracts
- add new persistence fields and indexes
- keep old clients functioning through defaults and compatibility logic

No immediate breaking change is allowed in the first rollout phase.

### 2) Default legacy data to `knowledge_gaining`

Existing records are backfilled or interpreted as:

- `knowledge_gaining`

This applies to:

- cards unless explicitly reclassified later
- existing scheduler state
- legacy sessions and attempts where needed for interpretation
- graph-related progress state

### 3) Do not auto-classify legacy records into language mode in v1

The system will not attempt heuristic migration of old records into
`language_learning`.

Reasons:

- false classification would be worse than temporary incompleteness
- historical data may lack enough signal for safe classification
- explicit reassignment is safer and audit-friendly

### 4) Allow application-layer defaults for omitted mode fields

During transition:

- application services may infer mode from active user preference
- if no active preference is available, compatibility fallback is
  `knowledge_gaining`

This rule exists only for compatibility and shell-defaulting. It is not a
replacement for explicit mode in critical write paths forever.

### 5) Tighten enforcement only after all core consumers are upgraded

The rollout order is:

1. shared contracts
2. persistence support
3. API support
4. frontend shell toggle and propagation
5. service-level enforcement in critical write paths

This avoids breaking clients or corrupting state during transition.

## Rationale

### Why default to `knowledge_gaining`

- It is the safest interpretation of existing system behavior.
- The current graph/card/scheduler semantics are more aligned with that mode.
- It preserves continuity for the majority of current flows.

### Why avoid auto-classification into language mode

- Migration mistakes in progress-bearing systems are highly damaging.
- Historical data rarely captures enough intent to classify safely.
- Explicit user or author reassignment can happen later with better UX and
  auditing.

### Why additive rollout matters

- The architecture touches too many services for a big-bang switch.
- Backward compatibility reduces risk during cross-service propagation.
- The repo already follows staged, contract-first remediation patterns.

## Alternatives Considered

| Option                                                        | Pros                      | Cons                                           | Rejected because                               |
| ------------------------------------------------------------- | ------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| Big-bang required-mode rollout                                | Cleaner end state quickly | Very high coordination and outage risk         | Too risky across the current service landscape |
| Auto-classify legacy records into language mode heuristically | Faster enrichment         | High false-positive risk and state corruption  | Unsafe for study and schedule semantics        |
| Keep old records mode-less permanently                        | Minimal migration work    | Long-term ambiguity and inconsistent semantics | It defeats the architecture                    |

## Consequences

### Positive

- rollout can proceed safely across services
- old clients continue to function during transition
- historical continuity is preserved
- future explicit reassignment remains possible

### Negative / trade-offs

- temporary dual semantics exist during migration
- application-layer compatibility code increases short-term complexity
- some early reports may need clear labeling around migrated defaults

### Follow-up tasks created

- add migration docs and rollout checklist
- add backfill scripts and validation queries
- add compatibility tests for omitted mode fields
- add UI affordances for explicit reclassification of items later

## References

- `architecture.md`
- `docs/guides/mode-aware-data-migration.md`
- `docs/plans/2026-03-27-mode-aware-dual-use-learning-architecture.md`
