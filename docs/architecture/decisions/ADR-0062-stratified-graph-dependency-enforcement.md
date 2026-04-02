# ADR-0062: Stratified Graph Dependency Enforcement

## Status

Accepted

## Date

2026-04-02

## Context

Noema's graph model is intended to follow a five-layer stratified reasoning
architecture:

- Layer 0: structural base facts
- Layer 1: deterministic graph derivations
- Layer 2: ontology reasoning
- Layer 3: aggregated and statistical signals
- Layer 4: pedagogical and diagnostic logic

The current codebase already trends in this direction, but the dependency rule
is not enforced automatically. Without explicit enforcement, lower-layer graph
modules can drift upward and begin importing:

- metrics
- misconception logic
- probabilistic diagnostics
- higher-layer interpretation helpers

That would weaken the graph's determinism and make formal validation harder.

## Decision

### 1) Lock the five-layer graph dependency model as a code-level contract

The graph subsystem will explicitly use this layer map:

#### Layer 0 - Structural base facts

- graph repository contracts and implementations
- PKG write path
- CKG mutation DSL
- canonical commit application path

#### Layer 1 - Deterministic graph derivations

- traversal
- reachability
- cycle detection
- prerequisite/path summaries

#### Layer 2 - Ontology reasoning

- ontology artifact loading
- ontology reasoning and classification
- canonical relation admissibility reasoning

#### Layer 3 - Aggregated and statistical signals

- aggregation evidence
- centrality
- mastery/statistical rollups
- optional CRDT-managed counters

#### Layer 4 - Pedagogical and diagnostic logic

- misconceptions
- interventions
- graph-health interpretation
- learner-facing and agent-facing diagnostic guidance

### 2) Enforce one-way dependency direction

The rule is:

- higher layers may depend on lower layers
- lower layers must not import higher layers

In practice:

- Layer 0 must not import Layers 1-4
- Layer 1 must not import Layers 2-4
- Layer 2 must not import Layers 3-4
- Layer 3 must not import Layer 4

### 3) Make dependency enforcement a CI concern, not a reviewer-only convention

The graph program will add automated dependency-boundary checks in CI.

Allowed implementation mechanisms include:

- ESLint import-boundary rules
- dependency-cruiser style checks
- custom static dependency validation

The exact tool may be chosen during implementation, but automated failure in CI
is mandatory.

### 4) Keep invariant and proof logic below pedagogical diagnostics

Invariant evaluation and proof preparation remain deterministic service logic,
not agent-facing or pedagogy-facing logic.

They therefore belong below Layer 4 concerns and must not depend on
misconception or intervention modules.

## Rationale

### Why enforce this now

- the graph is becoming more sophisticated and more safety-critical
- ontology, invariant, and proof work become harder if deterministic layers can
  depend on probabilistic interpretation
- reviewers should not be the only line of defense for architectural drift

### Why CI enforcement is necessary

- repo scale makes manual dependency policing brittle
- architecture promises should fail automatically when violated
- later contributors need a mechanical signal, not only documentation

### Why this benefits both PKG and CKG

- PKG flexibility still depends on a deterministic structural core
- CKG guardrails become more trustworthy when lower layers stay pure
- pedagogical systems can evolve faster when they consume stable lower-layer
  outputs

## Alternatives Considered

| Option                                                | Pros                     | Cons                                                    | Rejected because                                 |
| ----------------------------------------------------- | ------------------------ | ------------------------------------------------------- | ------------------------------------------------ |
| Keep stratification as documentation only             | Lowest immediate effort  | Easy architectural drift and reviewer burden            | Not strong enough for a critical graph subsystem |
| Split every layer into separate packages immediately  | Very explicit boundaries | Large refactor cost before the target map is stabilized | Too heavy for this phase                         |
| Allow diagnostic helpers in lower layers case by case | Convenient locally       | Erodes deterministic guarantees over time               | Violates the purpose of stratification           |

## Consequences

### Positive

- the five-layer graph model becomes enforceable rather than aspirational
- ontology, invariant, and proof work can build on cleaner lower layers
- architectural review burden decreases once CI owns the boundary check

### Negative / trade-offs

- some existing imports may need refactoring when enforcement lands
- the team must maintain a layer map as modules evolve
- tooling setup adds CI and lint complexity

### Follow-up tasks created

- document module-to-layer mapping in the graph architecture
- add automated dependency-boundary checks
- add regression coverage so reverse imports fail deterministically

## References

- `C:\Users\anr\Apps\noema\docs\plans\2026-04-02-dual-graph-gap-closure.md`
- `C:\Users\anr\Apps\noema\docs\PROJECT_CONTEXT.md`
- `C:\Users\anr\Apps\noema\architecture.md`
- `C:\Users\anr\Apps\noema\module-graph.md`
