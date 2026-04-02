# ADR-0059: Dual-Graph Gap Closure Program

## Status

Accepted

## Date

2026-04-02

## Context

Noema's dual-graph architecture is already materially implemented:

- PKG writes are direct, user-scoped, and auditable
- CKG writes are routed through the mutation DSL, typestate, and validation
  pipeline
- misconception, metrics, traversal, and comparison systems already depend on
  the graph as a core differentiator

However, the graph subsystem is not yet fully anchored against the intended
target architecture. The largest remaining gaps are:

- missing always-on PKG -> CKG aggregation runtime
- ontology validation that is narrower than the intended semantic contract
- no executable UNITY invariant layer yet
- proof stage still behaving as a pass-through
- partial PKG advisory-vs-blocking semantics
- no enforced stratified dependency boundaries in CI
- no restorable graph-state history beyond logs and audit trails

The system needs a single closure program that strengthens the graph without
weakening the already-correct PKG/CKG split.

## Decision

### 1) Run one staged gap-closure program inside `knowledge-graph-service`

All dual-graph gap closure work stays inside the existing
`knowledge-graph-service`.

We explicitly reject:

- introducing a separate graph-hardening service
- splitting aggregation, proof, or ontology ownership into parallel services at
  this stage
- replacing the current PKG/CKG architecture with a new graph model

The canonical implementation plan is:

- `C:\Users\anr\Apps\noema\docs\plans\2026-04-02-dual-graph-gap-closure.md`

### 2) Preserve the existing mutation-authority split

The program locks the existing authority model:

- PKG keeps direct validated writes
- CKG keeps DSL-only writes through the mutation pipeline

No direct canonical write CRUD API is introduced as part of this program.

### 3) Treat graph hardening as phased infrastructure, not one ticket

The program is implemented in ordered phases:

1. architecture locks and ADRs
2. aggregation runtime
3. ontology reasoner stage
4. UNITY invariant stage
5. PKG advisory-vs-blocking refactor
6. proof-stage integration
7. graph snapshots and restore workflows
8. stratified-boundary enforcement
9. optional CRDT islands

Each phase must leave the graph service green and shippable.

### 4) Lock the target dual-graph contract now

The target contract is:

- PKG is exploratory, typed, ontology-aware, auditable, and pedagogically
  flexible
- CKG is canonical, DSL-gated, validation-governed, and formally guarded
- PKG events can feed CKG evolution only through aggregation evidence and
  mutation proposals
- higher graph reasoning layers may depend on lower layers, never the reverse

### 5) Keep Neo4j and PostgreSQL ownership boundaries unchanged

This program does not change core storage ownership:

- Neo4j remains the operational graph store
- PostgreSQL via Prisma remains the workflow, evidence, audit, and metadata
  store

## Rationale

### Why one closure program

- The remaining graph gaps are tightly coupled.
- Aggregation, ontology reasoning, invariants, proof, and restoration all touch
  the same bounded context.
- One staged program avoids fragmented partial fixes that leave the graph in an
  ambiguous state.

### Why keep the current PKG/CKG split

- The current split is one of the strongest parts of the implementation.
- The missing work is mostly about operational anchoring and guardrail depth,
  not architectural replacement.
- Reopening the split itself would add risk without solving the real gaps.

### Why keep storage boundaries stable

- Changing storage responsibilities would create migration work unrelated to the
  actual graph-hardening problem.
- The current split already fits the workflow-vs-graph model well.

## Alternatives Considered

| Option                                      | Pros                           | Cons                                                                     | Rejected because                                            |
| ------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Create a separate graph-hardening service   | Operational isolation          | New cross-service contracts and duplicated orchestration                 | It adds coordination cost before the target model is stable |
| Treat each gap as an unrelated backlog item | Smaller local scopes           | No single anchored graph target and easier drift between implementations | The gaps interact too strongly                              |
| Redesign PKG/CKG split before closing gaps  | Chance to rethink fundamentals | Large migration risk and weakens already-solid architecture              | The split itself is not the core problem                    |

## Consequences

### Positive

- dual-graph hardening now has one accepted program and target contract
- implementation phases can proceed without re-litigating foundational choices
- graph ownership remains clear across runtime, validation, and storage

### Negative / trade-offs

- `knowledge-graph-service` becomes the clear center of several advanced
  responsibilities
- the program spans multiple phases and will take longer than a narrow patch
- some graph aspirations remain intentionally deferred until later phases

### Follow-up tasks created

- implement Phase B aggregation runtime
- implement Phase C ontology reasoner stage
- implement Phase D UNITY invariant stage
- implement Phase F proof-stage rollout and enforcement
- implement Phase H stratified dependency checks

## References

- `C:\Users\anr\Apps\noema\docs\plans\2026-04-02-dual-graph-gap-closure.md`
- `C:\Users\anr\Apps\noema\architecture.md`
- `C:\Users\anr\Apps\noema\module-graph.md`
- `C:\Users\anr\Apps\noema\docs\PROJECT_CONTEXT.md`
- `C:\Users\anr\Apps\noema\docs\architecture\decisions\ADR-0045-knowledge-graph-service-phase8e-ontological-guardrails.md`
- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\docs\architecture\decisions\ADR-005-phase6-ckg-mutation-pipeline.md`
