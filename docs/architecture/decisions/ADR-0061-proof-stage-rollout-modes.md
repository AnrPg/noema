# ADR-0061: Proof-Stage Rollout Modes

## Status

Accepted

## Date

2026-04-02

## Context

The current CKG mutation pipeline already models:

- `validated -> proving -> proven -> committing`

but the proof stage is still effectively a pass-through. The dual-graph target
architecture requires real proof work for canonical commits, including
formal/invariant-aware verification. At the same time, proof integration is
high-risk because it sits directly on the commit path of the canonical graph.

The program therefore needs a rollout model that allows:

- shipping proof infrastructure incrementally
- collecting diagnostics before hard enforcement
- preserving safety once proof becomes trustworthy

## Decision

### 1) Keep proof as a first-class stage in the canonical typestate

The canonical mutation lifecycle remains:

- `validated -> proving -> proven -> committing`

The program will not collapse or remove the proof states.

### 2) Introduce explicit proof rollout modes

The proof stage will support four runtime modes:

- `disabled`
- `observe_only`
- `soft_block`
- `hard_block`

These modes are configuration-controlled and must be persisted or otherwise
visible in proof-result inspection surfaces.

### 3) Define exact semantics for each mode

#### `disabled`

- no proof backend call is required
- current transitional behavior is preserved temporarily
- this mode is acceptable only before proof implementation is fully landed

#### `observe_only`

- proof runs and records diagnostics
- failures cannot block canonical commit
- proof output must still be persisted and inspectable

#### `soft_block`

- proof runs on every eligible mutation
- configured failure classes reject or escalate
- non-blocking classes may still commit while emitting operator-visible proof
  findings

#### `hard_block`

- proof failure blocks commit
- no failing mutation may silently proceed
- the target anchored state of the program is hard-blocking canonical proof

### 4) Remove silent auto-approval from the target end state

The current pass-through proof behavior is explicitly transitional.

The target architecture after this program is:

- proof performs real evaluation work
- proof failures never silently continue to commit

### 5) Persist proof outcomes as first-class mutation metadata

The mutation workflow must capture:

- proof mode used
- proof engine version
- artifact/log reference
- structured diagnostics
- pass/fail outcome and failure explanation

## Rationale

### Why phased proof rollout is necessary

- proof infrastructure is safety-critical and harder to validate than ordinary
  business logic
- observe-first rollout reduces the risk of false negatives blocking all
  canonical work
- operators need real diagnostics before hard enforcement

### Why hard-block is still the target

- canonical graph correctness is one of Noema's core differentiators
- a pass-through proof stage creates false confidence
- the point of the proof layer is to become an actual semantic safety barrier

### Why proof metadata must be persisted

- operators need inspectability
- reviewers need to understand why a mutation failed or escalated
- proof behavior must be auditable across rollout modes

## Alternatives Considered

| Option                                            | Pros                     | Cons                                               | Rejected because                                        |
| ------------------------------------------------- | ------------------------ | -------------------------------------------------- | ------------------------------------------------------- |
| Switch directly from disabled to hard-block       | Simplest contract        | High rollout risk and no diagnostic learning phase | Too brittle for a canonical commit path                 |
| Keep proof permanently advisory                   | Lower operational risk   | Proof never becomes a real guardrail               | Conflicts with the target graph contract                |
| Remove proof states until implementation is ready | Simpler current pipeline | Requires later schema and typestate churn          | The current pipeline already models the right lifecycle |

## Consequences

### Positive

- proof integration can ship incrementally without losing the final target
- rollout behavior becomes explicit and operator-visible
- the pipeline preserves a stable long-term typestate

### Negative / trade-offs

- configuration complexity increases
- proof-result handling must support multiple enforcement semantics
- some temporary modes intentionally allow commits after proof failure

### Follow-up tasks created

- add proof mode configuration and persistence fields
- implement proof-runner adapter and result model
- wire proof outcomes into mutation lifecycle and operator inspection
- remove silent pass-through behavior from the final target state

## References

- `C:\Users\anr\Apps\noema\docs\plans\2026-04-02-dual-graph-gap-closure.md`
- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\docs\architecture\decisions\ADR-005-phase6-ckg-mutation-pipeline.md`
- `C:\Users\anr\Apps\noema\docs\PROJECT_CONTEXT.md`
