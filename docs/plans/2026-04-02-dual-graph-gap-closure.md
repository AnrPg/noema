# 2026-04-02 - Dual-Graph Gap Closure Plan

## Goal

Close the currently known implementation gaps in Noema's dual-graph knowledge
architecture without weakening the already-solid separation between the
Personal Knowledge Graph (PKG) and the Canonical Knowledge Graph (CKG).

This plan defines the implementation program required to make the graph layer
decision-complete and operationally anchored across:

- PKG→CKG aggregation runtime
- richer ontology reasoning in canonical validation
- executable UNITY invariant enforcement
- formal proof-stage integration
- PKG advisory-vs-blocking validation policy
- CRDT-island scoping for statistical layers only
- graph-state versioning and restoration
- stratified-reasoning boundary enforcement

The work remains centered in `knowledge-graph-service`. No new graph service is
introduced.

---

## Current State

### Already solid

- The PKG/CKG split is real and implemented:
  - PKG writes flow through direct service methods in `pkg-write.service.ts`
  - CKG writes flow through the mutation DSL, typestate, and canonical mutation
    pipeline
- Canonical graph raw writes are not exposed as standard REST CRUD mutation
  endpoints.
- Mutation workflow state and audit logs are explicitly persisted in PostgreSQL.
- PKG operations are append-only and auditable.
- Misconceptions are first-class entities with repository, route, and
  orchestration support.
- Traversal, structural analysis, metrics, mastery, metacognitive stage, and
  comparison logic are materially implemented.

### Known gaps this plan closes

1. The CKG proof stage is still a pass-through and does not perform real
   formal verification.
2. The PKG→CKG aggregation runtime is only partially implemented. The evidence
   and proposal plumbing exists, but no always-on consumer currently converts
   PKG mutations into evidence-backed canonical proposals.
3. The current ontology validation stage is narrower than the intended
   architecture. It mostly enforces edge-type compatibility and ontological
   conflict-pair checks.
4. PKG validation is only partially advisory today. Several semantic issues
   still hard-fail instead of surfacing as structured feedback.
5. CRDT islands are described architecturally but not implemented.
6. Versioning is strong at the workflow and audit-log level, but not yet at the
   graph-state reconstruction and restoration level.
7. The five-layer stratified reasoning model is largely reflected by current
   module boundaries, but not yet enforced automatically in CI.

---

## Locked Decisions

- Service ownership: all gap-closure work remains in
  `knowledge-graph-service`.
- Plan location: `docs/plans/2026-04-02-dual-graph-gap-closure.md`.
- Delivery format: one master plan with internal phases and workstreams.
- Mutation authority:
  - PKG keeps direct validated writes
  - CKG keeps DSL-only writes through the mutation pipeline
- CKG raw write policy: no direct canonical write CRUD endpoints are added.
- Proof policy: formal verification becomes a real blocking stage once the
  proof runner is enabled in blocking mode.
- CRDT scope: CRDTs are allowed only for Layer 3 statistical signals and are
  forbidden for Layer 0 semantic structure.
- Stratification rule: lower layers must not import higher-layer modules; this
  becomes CI-enforced.
- PKG flexibility policy:
  - structural integrity failures remain blocking
  - semantic and pedagogical modeling issues become advisory by default unless
    they would corrupt graph integrity
- Storage model:
  - Neo4j remains the operational graph store
  - Prisma/PostgreSQL remains the workflow, audit, metrics, misconception, and
    evidence store
- Existing graph routes, mutation DSL, typestate model, misconceptions,
  traversal, and metrics are evolved in place rather than replaced wholesale.

---

## Target Architecture

### PKG

PKG remains a typed, ontology-aware, student-owned graph optimized for learning
and experimentation.

Target PKG behavior:

- direct write API remains available
- structural corruption is blocked deterministically
- semantic and pedagogical issues return structured advisory warnings
- all writes remain auditable
- misconception and intervention state remain attachable to the learner graph
- snapshots and replay support allow reconstruction and restoration

### CKG

CKG remains a formally guarded canonical graph with no raw semantic writes
outside the mutation pipeline.

Target CKG mutation flow:

1. proposal created through DSL only
2. schema validation
3. structural integrity validation
4. ontology reasoning validation
5. UNITY invariant validation
6. conflict detection
7. evidence sufficiency validation when applicable
8. proof stage
9. commit stage
10. audit/event publication

Target outcomes:

- safe mutations commit deterministically
- unsafe mutations are rejected or escalated
- proof-stage results are persisted and inspectable
- graph-state history is reconstructable and restorable

### Stratified reasoning target

Layer 0: structural base facts

- graph repository models
- PKG write path
- CKG mutation DSL
- canonical commit application

Layer 1: deterministic graph derivations

- traversal
- reachability
- cycle detection
- prerequisite chain and path summaries

Layer 2: ontology reasoning

- class membership
- subclass/superclass resolution
- domain/range admissibility
- disjointness checks
- canonical relation admissibility reasoning

Layer 3: aggregated and statistical signals

- evidence aggregation
- centrality
- mastery rollups
- optional CRDT-managed counters

Layer 4: pedagogical and diagnostic logic

- misconceptions
- intervention suggestions
- graph-health interpretation
- learner-facing modeling guidance

Critical rule:

- higher layers may depend on lower layers
- lower layers must never depend on higher layers

---

## Workstreams

## Workstream 1 - PKG→CKG Aggregation Runtime

### Objective

Implement an always-on aggregation pipeline that turns PKG mutation events into
deduplicated evidence and, when thresholds are met, canonical mutation
proposals.

### Scope

- add graph event consumers under
  `services/knowledge-graph-service/src/events/consumers/`
- consume PKG node and edge mutation events already emitted by
  `PkgWriteService`
- normalize raw PKG events into evidence records
- threshold evidence into candidate mutation proposals
- call `proposeFromAggregation()` for eligible candidates
- publish explicit aggregation lifecycle events

### Required components

#### Event consumers

Implement consumers for at least:

- `PKG_NODE_CREATED`
- `PKG_NODE_UPDATED`
- `PKG_NODE_REMOVED`
- `PKG_EDGE_CREATED`
- `PKG_EDGE_UPDATED`
- `PKG_EDGE_REMOVED`

Consumers must:

- parse and validate payloads
- perform idempotency checks using event identity plus semantic dedupe keys
- resolve whether the signal is evidence-bearing or ignorable
- write aggregation evidence records
- evaluate thresholds
- create mutation proposals only when threshold and eligibility conditions are
  satisfied

#### Evidence normalization

Normalize PKG signals into a canonical evidence model with:

- source event identity
- source user
- source PKG object id
- inferred target CKG node or proposed label
- evidence type
- confidence
- direction: support, oppose, or neutral
- evidence payload pointer or serialized context
- dedupe fingerprint

#### Candidate-generation rules

Implement deterministic rules for:

- candidate canonical node creation when multiple PKGs converge on the same
  stable concept absent from CKG
- candidate canonical node enrichment when multiple PKGs reinforce an existing
  canonical concept
- candidate canonical relation creation when multiple PKGs support the same
  stable semantic relation
- suppression of local, noisy, private, or obviously learner-specific
  structures

Suppression rules must reject or ignore:

- one-off personal mnemonics
- unsupported local category edges
- low-confidence transient structures
- edits that do not meet normalization preconditions

#### Dedupe and idempotency

Use two layers:

- transport idempotency:
  event id or stream id
- semantic dedupe:
  source user + source graph object + target candidate + evidence type +
  normalized payload fingerprint

Proposal dedupe must prevent multiple open mutations representing the same
semantic candidate in the same canonical scope.

#### Thresholding

Threshold policy:

- use distinct-user count, not raw evidence count, as the primary gate
- preserve existing promotion-band semantics where possible
- allow per-evidence-type confidence weighting
- store why a candidate was accepted, deferred, or suppressed

#### Events published

Add explicit graph-domain events for:

- aggregation evidence recorded
- aggregation threshold reached
- aggregation proposal created
- aggregation proposal suppressed
- aggregation proposal rejected

### Dependencies

- existing `AggregationEvidence` repository
- existing `proposeFromAggregation()` pipeline entrypoint
- mutation dedupe and health inspection support

### Acceptance criteria

- PKG mutation events automatically produce evidence records when relevant
- duplicate events do not duplicate evidence or proposals
- qualifying signals create canonical mutation proposals automatically
- suppressed signals are auditable with a machine-readable reason

---

## Workstream 2 - Ontology Reasoning Upgrade

### Objective

Replace the current narrow ontological conflict check with a fuller ontology
reasoner stage aligned with the intended CKG contract.

### Scope

- add a distinct ontology validation stage after structural integrity and
  before conflict detection
- retain the current structural stage for edge-type compatibility and
  acyclicity
- either narrow the existing `OntologicalConsistencyStage` to pairwise
  compatibility checks or fold it into the richer reasoner

### Reasoning responsibilities

The ontology stage must answer:

- subclass and superclass membership
- domain/range admissibility of canonical relations
- disjointness conflicts
- illegal type promotion or kind-crossing assertions
- canonical edge admissibility beyond simple conflict-pair lookup
- ontology-backed classification or inference needed to explain why a proposed
  relation is legal or illegal

### Ontology source of truth

Add a graph-owned ontology artifact model with:

- ontology version identifier
- artifact source and provenance
- serialized class hierarchy
- serialized domain/range rules
- serialized disjointness constraints
- optional canonical relation admissibility matrix derived from ontology facts

Ontology artifacts may be stored in PostgreSQL, object storage, or both, but
the graph service must expose one deterministic in-process ontology view for
validation.

### Result model

Ontology validation output must include:

- blocking violations
- advisory notes
- inferred classifications
- machine-readable explanation payloads
- ontology artifact version used for evaluation

### Escalation behavior

- keep the existing `pending_review` route for overrideable ontology conflicts
- require every escalated conflict to include structured evidence and reasoner
  output
- do not silently downgrade ontology failures into warnings

### Acceptance criteria

- ontology validation reasons about more than edge-pair conflict tables
- canonical validation can reject or escalate based on class/domain/disjointness
  logic
- every failure contains machine-readable evidence for agent/admin review

---

## Workstream 3 - UNITY Invariants as Executable Validators

### Objective

Implement deterministic invariant validators for canonical graph safety.

### Scope

- add a new invariant validation stage after ontology reasoning and before the
  proof stage
- evaluate projected post-mutation graph state rather than only current state

### Initial invariant catalog

Implement these first:

- no circular prerequisite chains
- no contradiction pairs in prerequisite/dependency semantics
- no mutually exclusive canonical relations on the same node pair unless
  explicitly marked as allowed
- no merge or split commit that leaves dangling required canonical structure

### Projection model

Add graph-state projection helpers that:

- apply a mutation to an in-memory canonical subgraph representation
- evaluate invariants against the projected result
- report the exact offending nodes, edges, paths, or subgraph fragments

### Result model

Every invariant failure must report:

- invariant name
- blocking or escalatable class
- offending node ids
- offending edge ids
- projected subgraph/path details
- human-readable explanation

### Acceptance criteria

- invariant evaluation is deterministic and service-owned
- canonical mutations can be blocked by projected-state invariant failures
- results are inspectable in validation and audit payloads

---

## Workstream 4 - Real Proof Stage / TLA+ Integration

### Objective

Replace the current proof-stage stub with real formal verification support.

### Scope

- preserve typestate:
  `validated -> proving -> proven -> committing`
- add mutation-to-model translation
- add proof runner integration
- persist proof artifacts and outcomes
- stop auto-approving canonical commits in the target state

### Proof architecture

#### Mutation-to-model translation

Add a translator that emits a compact formal model for:

- affected canonical subgraph
- operation payload
- derived invariant assumptions
- mutation pre-state and candidate post-state

#### TLA+ spec package

Create a spec bundle covering:

- mutation application safety
- preservation of graph invariants
- liveness of valid proposals through the canonical pipeline

#### Proof runner adapter

Implement a proof-runner abstraction that:

- accepts the translated model payload
- invokes the configured formal verification backend
- returns pass/fail plus structured diagnostics

#### Persistence

Extend mutation workflow state to capture:

- proof status
- proof engine version
- checked invariants/spec ids
- artifact or log reference
- failure explanation
- rollout mode used at evaluation time

### Rollout modes

Implement config-gated proof modes:

- `disabled`
- `observe_only`
- `soft_block`
- `hard_block`

Mode semantics:

- `disabled`: no proof call, current behavior preserved temporarily
- `observe_only`: proof runs but cannot block
- `soft_block`: flagged proof failures escalate or reject by configured class
- `hard_block`: all failing proofs block commit

### Failure behavior

If proof fails:

- never continue silently to commit
- transition to `rejected` or `pending_review` based on failure class
- publish proof-failure outcome event
- persist diagnostics for operator review

### Acceptance criteria

- proof stage performs real work in at least observe-only mode
- proof artifacts are persisted and inspectable
- canonical commits no longer rely on silent auto-approval in the target state

---

## Workstream 5 - PKG Validation Policy Refactor

### Objective

Clarify and enforce which PKG write violations are blocking and which are
advisory.

### Validation classes

#### Blocking structural integrity failures

Keep these blocking:

- orphan source or target references
- invalid graph object references
- impossible writes that would corrupt graph integrity
- cycle creation for relation types that must remain acyclic
- impossible mutation shapes not representable in the graph model

#### Advisory semantic or ontological issues

Make these advisory by default:

- ontology conflict pairs
- taxonomic vs mereological confusion
- concept modeling quality issues
- canonical-semantic ambiguity that does not corrupt learner graph integrity

#### Advisory pedagogical or diagnostic issues

Return warnings for:

- concept granularity mismatch
- structurally odd but learner-salvageable graph patterns
- likely misconception-shaped edits

### API and event behavior

- return structured advisory warnings in PKG write responses
- include warning codes, severity, explanation, related ids, and suggested fix
- emit advisory outcomes in graph-domain events where useful
- do not rely on logs alone for learner- or agent-facing feedback

### Acceptance criteria

- PKG remains flexible without allowing structural corruption
- semantic issues surface as structured feedback instead of broad hard-fail
  behavior
- clients and agents can consume warnings programmatically

---

## Workstream 6 - CRDT Islands Decision and Limited Implementation

### Objective

Implement CRDT support only if still required, and only for Layer 3 statistical
signals.

### Decision

This workstream is optional and must not block semantic correctness.

The plan default is:

- do not treat CRDT support as required for graph semantic completion
- implement it only if multi-writer replicated stats are still a real product
  need after the earlier phases land

### Allowed CRDT scope

If implemented, CRDT-managed data may include:

- edge-confidence counters
- aggregate support and oppose counts
- crowd-signal accumulation
- popularity or frequency statistics

### Forbidden CRDT scope

CRDTs must never mutate:

- node types
- edge types
- canonical relation existence
- prerequisite semantics
- ontology facts
- mutation workflow state

### Storage separation

Store CRDT-managed values outside canonical semantic structure tables or node
labels. Layer 3 stats must remain clearly non-authoritative.

### Acceptance criteria

- no CRDT-managed field can change Layer 0 semantics
- optional CRDT stats are clearly separated from canonical graph truth

---

## Workstream 7 - Graph-State Versioning and Restoration

### Objective

Extend current auditability into recoverable, operator-safe graph-state
reconstruction and restoration.

### Scope

- preserve existing append-only mutation and operation logs
- add snapshot support
- add replay and restore workflows

### PKG capabilities

Implement:

- point-in-time reconstruction from operation log
- optional periodic snapshots for expensive scopes
- dry-run restore preview for user/domain scope
- operator-approved restoration path

### CKG capabilities

Implement:

- canonical replay from mutation history
- domain-scoped snapshots for expensive recovery paths
- dry-run restoration preview
- operator-approved restoration path

### Metadata requirements

Every snapshot or replay unit must include:

- source operations or mutations
- graph domain and scope
- schema version
- snapshot or replay timestamp
- creator and approval metadata where applicable

### Operator workflows

Support:

- audit-only reconstruction
- preview-only restoration
- approved execution
- restoration event/audit publication

### Acceptance criteria

- graph history is reconstructable from persisted records
- expensive scopes can use snapshots instead of pure replay
- restoration is auditable and never silent

---

## Workstream 8 - Stratified Reasoning Enforcement

### Objective

Turn the five-layer reasoning model into enforceable dependency boundaries in
code and CI.

### Scope

- document module-to-layer mapping
- add CI enforcement for forbidden imports
- add regression tests or lint checks preventing reverse dependencies

### Layer mapping to lock

Layer 0:

- graph repository models
- PKG write path
- CKG mutation DSL
- canonical commit path

Layer 1:

- traversal
- reachability
- cycle detection
- prerequisite chains
- deterministic path summaries

Layer 2:

- ontology reasoning
- ontology classification

Layer 3:

- metrics
- centrality
- aggregation evidence
- optional CRDT stats

Layer 4:

- misconceptions
- interventions
- diagnostic and pedagogical guidance
- graph-health interpretation

### CI enforcement

Implement one of:

- ESLint import boundary rules
- dependency-cruiser style checks
- custom static dependency validator

The chosen approach must fail CI when lower-layer modules import higher-layer
modules.

### Acceptance criteria

- layer boundaries are explicit and automated
- reverse dependencies fail CI deterministically

---

## Cross-Workstream Dependencies

- Aggregation runtime depends on stable evidence semantics and mutation dedupe
  policy.
- Ontology reasoning depends on an ontology artifact source of truth.
- UNITY invariant evaluation depends on graph-state projection helpers.
- Proof-stage integration depends on invariant definitions and mutation-to-model
  translation.
- PKG advisory refactor depends on agreed validation-class taxonomy.
- Versioning and restore workflows depend on stable mutation and operation-log
  semantics.
- Stratified-boundary enforcement depends on the final module-to-layer mapping.
- Optional CRDT work must not begin until Layer 3 boundaries are explicit.

---

## Delivery Phases

## Phase A - Architecture Locks and ADRs

Deliver:

- ADR for dual-graph gap-closure program
- ADR for canonical ontology artifact ownership
- ADR for proof-stage rollout modes
- ADR for stratified dependency enforcement

Exit condition:

- all implementation-critical decisions above are documented and locked

## Phase B - Aggregation Runtime and Evidence Plumbing

Deliver:

- PKG event consumers
- evidence normalization
- candidate generation rules
- thresholding and proposal creation
- aggregation events and observability

Exit condition:

- PKG events can automatically create evidence-backed mutation proposals

## Phase C - Ontology Reasoner Stage

Deliver:

- ontology artifact model
- ontology reasoning service
- validation-stage integration
- structured ontology findings

Exit condition:

- canonical validation uses richer ontology reasoning than conflict-pair checks

## Phase D - UNITY Invariant Stage

Deliver:

- invariant catalog
- projected graph-state evaluator
- invariant validation stage

Exit condition:

- canonical mutations can be blocked by projected-state invariant failures

## Phase E - PKG Advisory-vs-Blocking Refactor

Deliver:

- validation taxonomy
- advisory response payloads
- PKG warning event/reporting path

Exit condition:

- PKG semantic issues surface as structured warnings without compromising
  integrity

## Phase F - Proof-Stage / TLA+ Integration

Deliver:

- model translation layer
- proof-runner adapter
- proof persistence fields
- rollout-mode config

Exit condition:

- proof stage performs real verification work and can block according to mode

## Phase G - Graph Snapshots and Restore Workflows

Deliver:

- snapshot metadata model
- replay/reconstruction service
- restore preview and restore execution workflows

Exit condition:

- PKG and CKG can be reconstructed and restored in an auditable way

## Phase H - Stratified-Boundary Enforcement

Deliver:

- documented layer mapping
- CI dependency-boundary enforcement
- regression tests/rules

Exit condition:

- lower-layer imports from higher layers fail automatically

## Phase I - Optional CRDT Islands

Deliver only if still required:

- Layer 3 CRDT stat storage
- merge semantics
- observability

Exit condition:

- replicated stats work without affecting semantic structure

---

## Public Interface Changes

Expected additions and changes:

- new internal event consumers for PKG graph events
- new graph-service interfaces for:
  - aggregation evidence intake
  - aggregation candidate generation
  - ontology reasoning evaluation
  - invariant evaluation
  - proof execution
  - snapshot creation
  - replay and restore preview/execution
- expanded mutation validation payload with:
  - ontology findings
  - invariant findings
  - proof findings
- expanded PKG write response payloads with structured advisory warnings
- new operator/admin APIs for:
  - aggregation queue and health inspection
  - snapshot listing and inspection
  - restore preview
  - restore execution
  - proof artifact inspection

No new public direct-write canonical CRUD APIs are introduced.

---

## Data Model Changes

Expected schema/storage evolution:

- extend `AggregationEvidence` with linkage and idempotency metadata
- extend `CkgMutation` with richer proof metadata and validation payload
  references
- add snapshot and replay metadata entities for PKG and CKG restoration
- add ontology artifact/version storage or references
- add optional CRDT-stat storage for Layer 3 signals only if that phase is
  approved

Do not over-specify final column-level schema until implementation ADRs are
accepted, but the data ownership boundaries above are fixed by this plan.

---

## Validation and Test Strategy

## Unit tests

Add or extend unit coverage for:

- aggregation candidate generation
- aggregation dedupe and thresholding
- ontology reasoner evaluation
- invariant evaluation
- proof-stage result handling
- PKG advisory classification
- snapshot and replay logic

## Integration tests

Add or extend integration coverage for:

- PKG event -> evidence -> mutation proposal pipeline
- ontology conflict escalation to `pending_review`
- invariant-blocked mutation rejection
- proof-failed mutation non-commit behavior
- PKG advisory warnings returned without crashing write
- restore preview and restore execution

## Contract tests

Add or extend contract coverage for:

- expanded mutation validation payloads
- new operator/admin endpoints
- aggregation and proof outcome events

## Regression tests

Protect existing behavior for:

- CKG mutation routes
- PKG node routes
- PKG edge routes
- misconception routes
- metrics and structural health routes

## CI checks

Require:

- typecheck
- lint
- unit tests
- integration tests
- dependency-boundary enforcement
- proof-runner mock/spec validation in CI mode

---

## Rollout and Operational Controls

### Feature flags

Add rollout controls for:

- aggregation auto-proposal enablement
- ontology-reasoner hard blocking
- invariant-stage hard blocking
- proof-stage enforcement mode
- restore APIs
- optional CRDT stats

### Observability

Track:

- evidence ingestion count
- aggregation proposal rate
- proposal suppression rate
- validation rejection and escalation rates
- proof pass/fail counts
- restore attempts and outcomes
- advisory warning frequency in PKG writes
- stuck mutation backlog and stage distribution

### Operator workflows

Provide dashboard and inspection support for:

- mutation backlog
- pending review queue
- stuck mutation diagnosis
- proof failures
- restore previews and executions
- aggregation pipeline health

---

## Acceptance Criteria

This program is complete when:

- PKG writes remain direct and flexible, while returning structured advisory
  feedback for semantic modeling issues
- CKG writes are impossible outside the mutation DSL, typestate, validation,
  and proof pipeline
- PKG events automatically generate evidence and, when thresholds are met,
  canonical mutation proposals
- CKG validation includes structural checks, ontology reasoning, invariant
  evaluation, and proof evaluation
- proof is no longer a silent pass-through in the target state
- canonical graph safety failures block or escalate deterministically
- graph history is auditable, reconstructable, and restorable
- Layer 0-4 dependency rules are enforced in CI
- optional CRDT stats, if implemented, cannot affect semantic structure

---

## Explicit Non-Goals

- introducing a new standalone graph service
- adding direct-write canonical CRUD endpoints
- moving graph workflow state out of PostgreSQL
- replacing Neo4j as the operational graph store in this program
- making CRDT support a prerequisite for semantic graph correctness
- delegating canonical invariant enforcement to agents
- replacing the existing mutation DSL instead of evolving it

