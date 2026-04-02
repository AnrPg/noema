# ADR-0060: Canonical Ontology Artifact Ownership

## Status

Accepted

## Date

2026-04-02

## Context

The current graph service already performs structural validation and a narrower
form of ontological conflict detection, and it now includes an ontology-imports
pipeline. The next graph-hardening phase requires a richer ontology reasoner
capable of evaluating:

- subclass/superclass relationships
- domain/range admissibility
- disjointness constraints
- canonical relation admissibility
- machine-readable explanations for rejection or escalation

That reasoning needs one deterministic source of truth. Right now the repo has
ontology import workflows and canonical graph data, but it does not yet lock
where the runtime ontology artifact lives, how it is versioned, or which service
owns the in-process ontology view used during validation.

## Decision

### 1) `knowledge-graph-service` owns the canonical ontology artifact

The graph service is the sole owner of the ontology artifact used for CKG
validation.

Ownership includes:

- ontology artifact versioning
- provenance and source tracking
- the deterministic in-process ontology view
- adapter code that loads the artifact into the validator

No external service becomes the runtime authority for canonical ontology
validation during this program.

### 2) Separate ontology artifact ownership from live canonical graph structure

The ontology artifact is graph-owned but not identical to the live CKG itself.

The artifact is a validation resource that may be derived from:

- imported ontology sources
- curated canonical graph semantics
- hand-authored rule overlays

It must expose a stable runtime view for validation even when the graph itself
is changing.

### 3) Store ontology artifact metadata in PostgreSQL and artifact payloads in graph-owned storage

The program locks this ownership split:

- PostgreSQL stores ontology artifact identity, version, provenance, and
  activation metadata
- the serialized ontology payload may live in PostgreSQL, object storage, or
  filesystem-backed graph-owned storage
- `knowledge-graph-service` resolves that payload into one deterministic runtime
  view

### 4) Validation must reference an ontology artifact version explicitly

Every ontology-backed validation outcome must be traceable to the artifact
version used at evaluation time.

This applies to:

- validation results
- escalation payloads
- proof inputs when proof depends on ontology assumptions
- operator/admin inspection surfaces

### 5) Imported ontologies do not automatically become active validation truth

Ontology-import outputs are inputs to curation, not instant runtime truth.

Activation of a new ontology artifact must be an explicit workflow step so the
validator never silently changes semantics because a new source batch landed.

## Rationale

### Why graph service ownership is necessary

- ontology reasoning is part of canonical mutation validation
- validation must remain deterministic and local to the canonical bounded
  context
- externalizing ontology truth now would add network and consistency risks to a
  safety-critical path

### Why artifact and graph structure must stay distinct

- the graph can contain contested or in-flight semantics
- the validator needs a frozen, versioned view it can explain and reproduce
- import pipelines and curation workflows are easier to manage when they do not
  instantly alter runtime semantics

### Why explicit activation matters

- semantic drift in validation rules is dangerous
- reviewers and operators need reproducibility
- proof and invariant systems need a stable semantic base

## Alternatives Considered

| Option                                                      | Pros              | Cons                                                                    | Rejected because                                |
| ----------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------- | ----------------------------------------------- |
| Use live CKG structure itself as the ontology source        | Fewer artifacts   | Validation semantics drift with graph edits and are harder to reproduce | The validator needs a stable versioned artifact |
| Move ontology runtime truth to a dedicated ontology service | Strong separation | New service boundary on a critical validation path                      | Too much operational complexity for this phase  |
| Auto-activate every imported ontology batch                 | Fast iteration    | Silent semantic changes and poor reproducibility                        | Unsafe for canonical validation                 |

## Consequences

### Positive

- ontology reasoning now has a clearly owned source of truth
- validation, escalation, and proof can all reference a stable ontology version
- ontology imports have a clean handoff into curated validation semantics

### Negative / trade-offs

- ontology artifact lifecycle adds new metadata and activation workflows
- curation overhead increases compared with direct import usage
- the graph service must own more semantic infrastructure

### Follow-up tasks created

- add ontology artifact/version persistence
- add artifact activation and loading infrastructure
- implement ontology reasoner stage against the active artifact
- include artifact version in validation and escalation payloads

## References

- `C:\Users\anr\Apps\noema\docs\plans\2026-04-02-dual-graph-gap-closure.md`
- `C:\Users\anr\Apps\noema\docs\plans\2026-03-24-ontology-imports-pipeline.md`
- `C:\Users\anr\Apps\noema\docs\architecture\decisions\ADR-0050-ontology-imports-pipeline-architecture.md`
- `C:\Users\anr\Apps\noema\docs\architecture\decisions\ADR-0045-knowledge-graph-service-phase8e-ontological-guardrails.md`
