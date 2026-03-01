# Phase 3: Domain Layer

## Objective

Build the domain layer — the heart of the knowledge-graph-service. This layer
contains the repository interfaces, service interfaces, domain errors, value
objects, and the critical policy configuration (EDGE_TYPE_POLICIES) that governs
how different edge types are validated. The domain layer has **zero
dependencies** on infrastructure — no Neo4j driver, no Prisma, no Redis. It
defines contracts that infrastructure implements.

---

## Boilerplate Instructions

Read PROJECT_CONTEXT.md, then, based on the files with respective
specifications, help me with the implementation. The design process should
follow the principles in PROJECT_CONTEXT.md (APIs and schema first, follow the
microservices pattern, expose agent tools and interfaces for agents etc). If
there is any design decision you must take, first show me options with pros and
cons and ask me to choose.

Generate new code strictly in the existing project style and architecture, fully
conforming to current schemas, APIs, types, models, and patterns; maximize reuse
of existing implementations, favor additive and minimally invasive changes over
redesign or refactoring, and if you detect that modifying or breaking existing
behavior is unavoidable, trigger the harness to stop and explicitly ask for my
approval before proceeding; after implementation, resolve all errors, warnings,
and inconsistencies (including pre-existing ones), request clarification for any
architectural decisions, produce an ADR documenting the changes, and commit with
clear, structured messages.

I want you to make sure that no errors, or warnings or uncommited changes remain
in the codebase after your implementation. If you detect any, please ask me to
approve fixing them before proceeding with new implementations.

Also, before you begin implementing and writing code, tell me with details about
the design decisions you have taken, and ask for my approval before proceeding.
If there are any design decisions that you are not sure about, please present me
with options and their pros and cons, and ask me to choose before proceeding.
let's make sure we are on the same page about the design before you start
implementing. we can do some banter about the design to make sure we are
aligned. be analytical, detailed, and thorough in your design explanations and
discussions.

I generally prefer more complex solutions than simpler ones, given that they are
more powerful and flexible, and I trust your judgment in finding the right
balance. I also prefer solutions that are more aligned with the existing
architecture and patterns of the codebase, even if they require more effort to
implement, as long as they don't introduce significant technical debt or
maintenance challenges.

Do not optimize prematurely, but do consider the long-term implications of
design choices, especially in terms of scalability, maintainability, and
extensibility.

Do not optimize for short-term speed of implementation at the cost of code
quality, architectural integrity, or alignment with project conventions. I value
well-designed, robust solutions that fit seamlessly into the existing codebase,
even if they take more time to implement.

Always reason about the full system architecture before implementing anything.
Every feature touches multiple services, agents, and graph layers. Design
decisions must account for agent orchestration, event propagation, graph
consistency, and offline sync simultaneously.

---

## Context

The domain layer is infrastructure-agnostic. It defines _what_ the service can
do and _what guarantees_ it provides, without specifying _how_. This separation
is critical because:

- Neo4j repositories implement graph-specific interfaces; they can be swapped
  for test doubles in unit tests
- The CKG mutation pipeline's typestate machine is pure domain logic with no
  database coupling
- Edge-type policies are data-driven configuration, not hardcoded conditionals
- Services depend on repository interfaces, not implementations

Study the content-service domain layer for the patterns: `IContentRepository`
interface, error hierarchy, value objects, and how the service class depends
only on interfaces.

---

## Task 1: Define the graph repository interface

Create `src/domain/knowledge-graph-service/interfaces.ts` (or an equivalent file
structure matching content-service conventions) with the primary repository
interface: `IGraphRepository`.

### IGraphRepository

This is the abstraction over Neo4j for graph CRUD and traversal. It should
declare methods for:

**Node operations:**

- Create a node (returns the full node)
- Get a node by ID (graph-type aware — PKG nodes are scoped by userId)
- Update a node's properties (partial update, returns updated node)
- Soft-delete a node (marks as deleted, does not remove from graph)
- Find nodes by criteria (type, domain, label substring, userId for PKG)
- Count nodes (for pagination and metrics)

**Edge operations:**

- Create an edge between two nodes (with edge type and weight)
- Get an edge by ID
- Remove an edge
- Find edges by criteria (type, source node, target node, userId for PKG)
- Get all edges for a node (inbound, outbound, or both)

**Traversal operations:**

- Get ancestors of a node (following edges of specified types, up to a max
  depth)
- Get descendants of a node (same, reversed direction)
- Find shortest path between two nodes
- Find shortest path between two nodes with edge type filters and node type
  filters (or node contents/text filters)
- Get the full subgraph reachable from a node (within a depth limit)
- Detect cycles involving a given node or edge (critical for acyclicity
  validation)

**Batch operations:**

- Create multiple nodes in a single transaction
- Create multiple edges in a single transaction
- Get multiple nodes by IDs

### Why traversal as a first-class repository concern?

Traversal is what distinguishes a graph database from a relational one. Queries
like "find all prerequisites of concept X" or "find all nodes reachable within 3
hops" are the bread and butter of the knowledge graph. Making these explicit
repository methods (rather than ad-hoc Cypher queries scattered through the
service layer) ensures consistent traversal semantics and makes the service
layer testable with mock traversal results.

---

## Task 2: Define the mutation repository interface

Create `IMutationRepository` — the Prisma/PostgreSQL abstraction for the CKG
mutation pipeline workflow data.

### IMutationRepository

Methods:

- Create a mutation (initial state: PROPOSED)
- Get a mutation by ID
- Update a mutation's state (with optimistic locking via version field)
- Append to audit log (immutable writes only)
- Get audit log for a mutation
- Find mutations by state (for pipeline processing — "give me all VALIDATING
  mutations")
- Find mutations by proposer (agentId)
- Count mutations by state (for monitoring)

### Why a separate repository for mutations?

Mutations live in PostgreSQL, not Neo4j. They represent workflow state
(typestate machine transitions, audit trails, validation results) — classically
relational data with strict ACID requirements. The mutation pipeline reads from
Neo4j to validate proposed changes, but the pipeline's own state is in
PostgreSQL. This clean separation prevents coupling the workflow engine to the
graph database.

---

## Task 3: Define the metrics repository interface

Create `IMetricsRepository` — for structural metric snapshots.

### IMetricsRepository

Methods:

- Save a metric snapshot (userId, domain, full metrics object, timestamp)
- Get the latest snapshot for a user-domain combination
- Get snapshot history for a user-domain (for trend visualization)
- Delete old snapshots (retention policy)

Structural metrics change every time a user's PKG changes. The repository tracks
these over time so the system can detect trends ("your Abstraction Drift has
been worsening over the last week").

---

## Task 4: Define the misconception repository interface

Create `IMisconceptionRepository` — for misconception patterns and
interventions.

### IMisconceptionRepository

Methods:

- Get all active misconception patterns
- Get patterns by misconception type
- Get a pattern by ID
- Create/update a pattern definition
- Get intervention templates by misconception type
- Get an intervention template by ID
- Create/update an intervention template
- Record a misconception detection (linking user, pattern, affected nodes)
- Get active misconceptions for a user
- Update misconception status (detected → confirmed → addressed → resolved)

### Why misconception patterns in PostgreSQL?

Pattern definitions are structured metadata: a misconception type, a detection
algorithm identifier, configuration parameters, and scoring thresholds. They're
read frequently and written rarely (new patterns are authored by curriculum
designers). This is classic relational data. The _detection itself_ runs against
Neo4j (checking graph structure), but the pattern _definitions_ and
_intervention templates_ live in PostgreSQL.

---

## Task 5: Define the domain error hierarchy

Create a structured error hierarchy following the content-service pattern
(extending a base domain error class with error codes).

### Error categories

**Graph errors:**

- NodeNotFoundError — the requested node doesn't exist in the specified graph
- EdgeNotFoundError — the requested edge doesn't exist
- DuplicateNodeError — attempting to create a node with a label that already
  exists in the same scope
- CyclicEdgeError — adding this edge would create a cycle in an edge type that
  requires acyclicity
- OrphanEdgeError — source or target node of the edge doesn't exist
- InvalidEdgeTypeError — the edge type is not allowed between these node types
- MaxDepthExceededError — a traversal query exceeded the configured max depth
- GraphConsistencyError — a general invariant violation in the graph

**Mutation errors:**

- MutationNotFoundError — the requested mutation doesn't exist
- InvalidStateTransitionError — attempting a state change that the typestate
  machine doesn't allow (e.g., PROPOSED → COMMITTED skipping validation)
- MutationConflictError — optimistic locking failure (the mutation was modified
  concurrently)
- ValidationFailedError — the mutation failed one or more validation stages
- MutationAlreadyCommittedError — attempting to modify a mutation that's already
  in a terminal state

**Misconception errors:**

- MisconceptionPatternNotFoundError
- InterventionTemplateNotFoundError
- InvalidMisconceptionStateTransitionError

**General errors:**

- UnauthorizedError — the user doesn't have access to this graph region
- RateLimitExceededError — too many requests

### Why typed errors instead of generic Error?

Typed errors enable the API layer to map domain errors to appropriate HTTP
status codes deterministically (NodeNotFoundError → 404, CyclicEdgeError → 409,
InvalidStateTransitionError → 422). They also make error handling in the service
layer exhaustive — TypeScript can warn when a new error type is added but not
handled.

---

## Task 6: Define value objects

Create value objects for concepts that have validation rules or business
invariants.

### Value objects

- **EdgePolicy** — encapsulates the per-edge-type configuration from
  EDGE_TYPE_POLICIES. Fields: edgeType (GraphEdgeType), requiresAcyclicity
  (boolean), allowedSourceTypes (GraphNodeType[]), allowedTargetTypes
  (GraphNodeType[]), maxWeight (number), defaultWeight (number). This is the
  data-driven dispatch mechanism from ADR-0010 that replaced hardcoded if-else
  chains for acyclic vs. non-acyclic validation.

- **ValidationOptions** — the IValidationOptions from ADR-0010 with per-stage
  toggles. Fields: validateAcyclicity (boolean), validateNodeTypes (boolean),
  validateWeight (boolean), validateCustomRules (boolean), customValidators
  (optional array of validator functions). This parameterizes what validation
  runs during edge creation, allowing callers (particularly agents) to skip
  validation stages they've already guaranteed.

- **TraversalOptions** — options for graph traversal queries. Fields: maxDepth
  (number), edgeTypes (optional filter — only traverse specific edge types),
  direction (`inbound` | `outbound` | `both`), includeProperties (boolean — for
  performance, sometimes you want just node IDs without properties).

- **NodeFilter** — reusable filter criteria for node queries. Fields: nodeType
  (optional), domain (optional), labelContains (optional), userId (optional),
  graphType (optional), includeDeleted (boolean).

---

## Task 7: Create the EDGE_TYPE_POLICIES configuration

Create a central configuration object that maps each `GraphEdgeType` to its
validation rules. This is the cornerstone of the policy-driven edge validation
system described in ADR-0010.

### Why data-driven policies?

The naïve approach is:
`if (edgeType === 'prerequisite') { checkAcyclicity(); } else if (edgeType === 'related_to') { /* no check */ }`.
This scatters business rules across conditionals. EDGE_TYPE_POLICIES centralizes
them:

### Policy definitions

The 17 edge types are organized into 6 ontological categories. Each policy
specifies: ontological category, acyclicity constraint, symmetry, allowed source
and target node types, default weight, and a human-readable description of the
relation's semantics.

#### Taxonomic category

- **is_a** — acyclic: YES. Taxonomic subsumption (genus–species): "A is a kind
  of B". The source inherits the defining properties of the target. Allowed:
  concept → concept. Default weight: 1.0.

- **exemplifies** — acyclic: YES. Type-instance: "A exemplifies B". An example
  can't exemplify itself. Allowed: example/counterexample →
  concept/principle/fact. Default weight: 1.0.

#### Mereological category

- **part_of** — acyclic: YES. Part-whole composition: "A is a component of B".
  Violating this would mean "A is part of B is part of A". Allowed source: all.
  Allowed target: concept, principle.

- **constituted_by** — acyclic: YES. Material constitution without identity: "A
  is constituted by B" (e.g., algorithm constituted by data structures). Not the
  same as part-of — constitution does not imply compositional containment.
  Allowed: concept/procedure/principle → concept/fact/principle. Default weight:
  1.0.

#### Logical category

- **equivalent_to** — acyclic: NO (symmetric). Mutual entailment /
  co-extensionality: "A ≡ B". Use sparingly — most seemingly equivalent concepts
  differ in some framing. Allowed: concept-bearing types ↔ concept-bearing
  types. Default weight: 1.0.

- **entails** — acyclic: YES. Asymmetric logical entailment: "A necessarily
  implies B". If A entails B and B entails A, use equivalent_to instead.
  Allowed: concept-bearing types → concept-bearing types. Default weight: 0.9.

- **disjoint_with** — acyclic: NO (symmetric). Mutual exclusion: "A and B cannot
  both apply to the same entity". Stronger than contradicts. Allowed: concept ↔
  concept. Default weight: 1.0.

- **contradicts** — acyclic: NO (symmetric). Contradiction or tension between
  concepts. Weaker than disjoint_with — contradictions may be context-dependent.
  All node types allowed. Default weight: 1.0.

#### Causal / Temporal category

- **causes** — acyclic: YES. Causal dependence: "A causes B". Causal cycles in a
  pedagogical graph indicate modelling errors. All types → all types. Default
  weight: 0.8.

- **precedes** — acyclic: YES. Temporal or logical ordering: "A precedes B".
  Different from prerequisite — precedes captures domain chronology, not
  learning order. Allowed: concept-bearing types → concept-bearing types.
  Default weight: 0.8.

- **depends_on** — acyclic: YES. Existential or generic dependence: "A depends
  on B for its existence or definition". Not the same as prerequisite (learning
  dependency) or entails (logical implication). All types → all types. Default
  weight: 0.9.

#### Associative category

- **related_to** — acyclic: NO (symmetric). Generic associative link with the
  weakest semantic commitment. Prefer a more specific edge type whenever
  possible. All types → all types. Default weight: 0.5.

- **analogous_to** — acyclic: NO (symmetric). Structural or functional analogy:
  "A is analogous to B" across different domains (e.g., "electric current ~
  water flow"). All types → all types. Default weight: 0.6.

- **contrasts_with** — acyclic: NO (symmetric). Opposition without
  contradiction: gradable antonymy or complementary pairs. Weaker than
  contradicts or disjoint_with. All types → all types. Default weight: 0.7.

#### Structural / Pedagogical category

- **prerequisite** — acyclic: YES. Learning dependency: "A requires B to be
  learned first". A pedagogical ordering, not a logical one. Allowed:
  concept/procedure/principle → concept/procedure/principle/fact. Default
  weight: 1.0.

- **derived_from** — acyclic: YES. Derivation chain: "A is logically or
  mathematically derived from B". Derivation chains must have a foundation.
  Allowed: concept/procedure/principle → any. Default weight: 1.0.

- **has_property** — acyclic: YES. Inherence: "A has property/quality B". A
  quality or attribute inheres in its bearer (e.g., "Bubble Sort has_property
  O(n²) Time Complexity"). Allowed: concept/procedure/principle →
  concept/fact/principle. Default weight: 0.8.

#### Enriched policy metadata

Each `IEdgePolicy` carries three additional metadata fields beyond structural
validation rules:

- **category** (`EdgeOntologicalCategory`) — which of the 6 ontological families
  this edge type belongs to.
- **isSymmetric** (boolean) — whether the edge is semantically symmetric (A→B
  implies B→A conceptually).
- **description** (string) — a human-readable explanation of the relation's
  semantics, disambiguating it from similar edge types.

### Configuration structure

The configuration should be a typed object (not a class) keyed by
`GraphEdgeType` value. Each entry contains the policy fields. The object is
frozen (deeply immutable). A lookup function `getEdgePolicy(edgeType)` retrieves
the policy for a given edge type, throwing `InvalidEdgeTypeError` for unknown
types.

---

## Task 8: Define the service interface

Create `IKnowledgeGraphService` — the interface that the API layer will depend
on. Follow the content-service pattern: every method returns
`IServiceResult<T>`, which includes the data plus `IAgentHints`.

### Method categories

**PKG operations:**

- createNode(userId, input) → IServiceResult<IGraphNode>
- getNode(userId, nodeId) → IServiceResult<IGraphNode>
- updateNode(userId, nodeId, updates) → IServiceResult<IGraphNode>
- deleteNode(userId, nodeId) → IServiceResult<void>
- listNodes(userId, filters, pagination) →
  IServiceResult<IPaginatedResponse<IGraphNode>>
- createEdge(userId, input, validationOptions?) → IServiceResult<IGraphEdge>
- deleteEdge(userId, edgeId) → IServiceResult<void>
- getSubgraph(userId, rootNodeId, traversalOptions) → IServiceResult<ISubgraph>
- getAncestors(userId, nodeId, options) → IServiceResult<IGraphNode[]>
- getDescendants(userId, nodeId, options) → IServiceResult<IGraphNode[]>
- findPath(userId, fromNodeId, toNodeId) → IServiceResult<IGraphNode[]>

**CKG operations:**

- getCkgNode(nodeId) → IServiceResult<IGraphNode>
- getCkgSubgraph(rootNodeId, traversalOptions) → IServiceResult<ISubgraph>
- listCkgNodes(filters, pagination) →
  IServiceResult<IPaginatedResponse<IGraphNode>>

**Structural metrics:**

- computeMetrics(userId, domain) → IServiceResult<IStructuralMetrics>
- getMetrics(userId, domain) → IServiceResult<IStructuralMetrics>
- getMetricsHistory(userId, domain, options) →
  IServiceResult<IStructuralMetrics[]>

**Misconception detection:**

- detectMisconceptions(userId, domain) →
  IServiceResult<IMisconceptionDetection[]>
- getMisconceptions(userId, domain?) → IServiceResult<IMisconceptionDetection[]>
- updateMisconceptionStatus(detectionId, status) → IServiceResult<void>

### Why IServiceResult everywhere?

`IServiceResult<T>` is the content-service pattern that bundles the response
data with `IAgentHints`. Every response carries hints that downstream agents can
use to make smarter decisions. For example, a `createEdge` response might hint
"this node now has 8 prerequisites, which is unusually high — consider reviewing
if all are truly necessary." This agent-hints-on-every-response pattern is a
core architectural principle of Noema.

---

## Task 9: Define the PKG operation log repository interface

Create `IPkgOperationLogRepository` — an append-only changelog of all PKG
mutations, bridging the gap between "no governance for PKG" and the full CKG
mutation pipeline.

### IPkgOperationLogRepository

Methods:

- Append an operation (userId, operation type, affected nodeIds/edgeIds,
  timestamp, metadata)
- Get operation history for a user (with pagination)
- Get operations since a timestamp (for sync reconciliation)
- Get operations by type (for analytics — "how many edges did this user create
  last week?")
- Get operations affecting a specific node or edge (for undo context)

### Why a PKG operation log?

Unlike the CKG, PKG writes are direct — no typestate pipeline, no multi-stage
validation. But PKG changes still need traceability for three critical reasons:

1. **Undo/redo**: Users should be able to reverse accidental changes. The
   operation log provides the history needed to reconstruct previous states
   without full event sourcing overhead.

2. **Aggregation pipeline input**: The PKG→CKG aggregation pipeline (Phase 6,
   ADR-005) needs structured data about what users are doing in their PKGs.
   Rather than parsing domain events after the fact, the operation log provides
   a durable, queryable record of PKG mutations that the aggregation pipeline
   can consume directly.

3. **Offline sync reconciliation**: The mobile app (offline-first architecture)
   must resolve conflicts when reconnecting. The operation log provides the
   server-side mutation history that the sync protocol compares against the
   client's local changelog to detect and resolve conflicts.

### Operation types

The log should capture a discriminated union of PKG operations:

- `PkgNodeCreated` — nodeId, nodeType, label, domain
- `PkgNodeUpdated` — nodeId, changedFields (which properties changed, with
  before/after values for undo support)
- `PkgNodeDeleted` — nodeId (soft-delete)
- `PkgEdgeCreated` — edgeId, edgeType, sourceNodeId, targetNodeId, weight
- `PkgEdgeDeleted` — edgeId
- `PkgBatchImport` — list of sub-operations (for batch node/edge creation)

Each entry is immutable (append-only, no updates, no deletes) and carries a
monotonically increasing sequence number per user for ordering guarantees in
sync scenarios.

### Relationship to domain events

The operation log is _not_ a replacement for domain events (Phase 8). Domain
events are ephemeral messages on Redis Streams consumed by other services. The
operation log is a _durable_ table in PostgreSQL that persists the full history.
Events are fire-and-forget notifications; the log is a queryable audit trail.
Both are produced from the same service-layer write operations — the service
publishes an event AND appends to the log in the same transaction.

---

## Task 10: Define the graph comparison value objects

Create value objects and an interface for PKG↔CKG structural comparison — a
reusable capability needed by multiple subsystems (structural metrics,
misconception detection, aggregation pipeline).

### IGraphComparison

The comparison result captures how a user's PKG aligns (or diverges) from the
CKG for a given domain:

- **pkgSubgraph** (ISubgraph) — the user's PKG nodes and edges for the domain
- **ckgSubgraph** (ISubgraph) — the canonical reference subgraph for the same
  domain
- **nodeAlignment** (Map<NodeId, NodeId>) — mapping of PKG nodes to their CKG
  counterparts (matched by label, semantic similarity, or explicit linking)
- **unmatchedPkgNodes** (NodeId[]) — PKG nodes with no CKG counterpart (novel
  concepts the user added that don't exist canonically)
- **unmatchedCkgNodes** (NodeId[]) — CKG nodes the user hasn't represented in
  their PKG (gaps in understanding)
- **edgeAlignmentScore** (number, 0–1) — how well the user's edge structure
  matches the canonical one for aligned nodes
- **structuralDivergences** (IStructuralDivergence[]) — specific places where
  the PKG and CKG disagree (e.g., the user has an `is_a` edge where the CKG has
  `part_of`, or the user is missing a prerequisite chain)

### IStructuralDivergence

Captures a single point of structural disagreement:

- **divergenceType** — enum: `missing_edge`, `extra_edge`, `wrong_edge_type`,
  `missing_node`, `extra_node`, `depth_mismatch`, `hierarchy_inversion`
- **affectedPkgNodeIds** — which PKG nodes are involved
- **affectedCkgNodeIds** — which CKG nodes are involved
- **severity** — `low` | `medium` | `high` | `critical` (based on how
  foundational the divergence is — a missing prerequisite for a root concept is
  critical; an extra `related_to` edge is low)
- **description** — human-readable explanation

### Why a dedicated comparison capability?

Multiple features require PKG↔CKG comparison:

- **Abstraction Drift (AD)** compares `is_a`/`part_of` hierarchies
- **Depth Calibration Gradient (DCG)** compares prerequisite chain depths
- **Scope Leakage Index (SLI)** compares domain boundaries
- **Sibling Confusion Entropy (SCE)** compares sibling relationships
- **Misconception detection** checks if the user's structure contradicts
  canonical patterns (e.g., circular prerequisites, missing foundational links)
- **Aggregation pipeline** compares many PKGs against each other and against the
  CKG to extract consensus patterns

Without a dedicated comparison abstraction, each of these features would
independently fetch both subgraphs, build its own alignment map, and compute its
own divergence analysis — duplicating expensive graph traversal and alignment
logic. The `IGraphComparison` value object centralizes this, computed once and
reused across all consumers.

### IGraphComparisonService (extension to IKnowledgeGraphService)

Add to the service interface:

- compareWithCkg(userId, domain) → IServiceResult<IGraphComparison>

This method fetches both subgraphs, runs alignment, computes divergences, and
returns the full comparison object. Agent hints should highlight the most
significant divergences and suggest remediation actions.

---

## Task 11: Define domain event types

Create `src/domain/knowledge-graph-service/domain-events.ts` — the enumeration
and payload definitions for all domain events this service produces. Domain
events are a domain-layer concept (they describe what happened in the domain),
even though the publishing _mechanism_ is infrastructure (Phase 8).

### Why domain events in the domain layer?

The event _types_ (what events exist, what data they carry) are part of the
service's contract. Other services and agents depend on these event shapes.
Defining them in the domain layer:

1. Makes the service contract complete — a reader of the domain layer knows both
   the synchronous interface (`IKnowledgeGraphService`) and the asynchronous
   interface (domain events)
2. Allows the service layer to reference event types without importing
   infrastructure
3. Enables compile-time verification that every event type has a corresponding
   publisher wiring in Phase 8

### Event catalog

**PKG lifecycle events:**

- `PkgNodeCreated` — payload: userId, nodeId, nodeType, label, domain
- `PkgNodeUpdated` — payload: userId, nodeId, changedFields
- `PkgNodeRemoved` — payload: userId, nodeId, domain (soft-delete)
- `PkgEdgeCreated` — payload: userId, edgeId, edgeType, sourceNodeId,
  targetNodeId, weight, validationSkipped (which checks were bypassed)
- `PkgEdgeRemoved` — payload: userId, edgeId

**Structural metrics events:**

- `PkgStructuralMetricsUpdated` — payload: userId, domain, metrics snapshot,
  significantChanges (which metrics moved by more than a threshold)

**CKG mutation events:**

- `CkgMutationProposed` — payload: mutationId, proposedBy (agentId or
  adminUserId), operationCount, operationTypes
- `CkgMutationValidated` — payload: mutationId, validationDuration, stageResults
  summary
- `CkgMutationCommitted` — payload: mutationId, affectedNodeIds,
  affectedEdgeIds, operationCount
- `CkgMutationRejected` — payload: mutationId, rejectionReason, failedStage,
  violations

**CKG promotion events:**

- `CkgNodePromoted` — payload: nodeId, promotionBand, evidenceCount,
  originatingPkgCount

**Misconception events:**

- `MisconceptionDetected` — payload: userId, patternId, misconceptionType,
  affectedNodeIds, confidence
- `InterventionTriggered` — payload: userId, detectionId, templateId,
  interventionType
- `MetacognitiveStageTransitioned` — payload: userId, domain, fromStage,
  toStage, triggeringMetrics

### Event metadata contract

Every event includes standard metadata (defined here, populated by
infrastructure):

- eventId (unique, generated)
- eventType (discriminator string matching the event name)
- timestamp (ISO 8601)
- correlationId (from the originating request)
- causationId (the event or request that caused this event)
- serviceName (`knowledge-graph-service`)
- version (event schema version for forward compatibility)

### Relationship to @noema/events

Phase 2 defines event types in the shared `@noema/events` package. This
domain-layer file re-exports the relevant subset and adds service-specific event
payload interfaces. If an event type doesn't exist in `@noema/events` yet, it
should be added there first (Phase 2 prerequisite) and referenced here.

---

## Task 12: Define the validation pipeline interface

Create `IValidationStage` and `IValidationPipeline` — domain-layer abstractions
for the CKG mutation validation pipeline. The validation stages are defined
narratively in Phase 6, but the _interfaces_ belong in the domain layer to
enable extensibility and testability.

### IValidationStage

Each validation stage is a pluggable unit with a consistent interface:

- **name** (string) — human-readable stage identifier (e.g., `schema`,
  `structural_integrity`, `conflict_detection`, `evidence_sufficiency`)
- **order** (number) — execution order (stages run sequentially, lowest first)
- **validate(mutation, context)** → `Promise<IValidationStageResult>` — runs
  this stage's checks against the mutation and returns pass/fail with details

### IValidationStageResult

- **stageName** (string)
- **passed** (boolean)
- **details** (string) — human-readable summary
- **violations** (IValidationViolation[]) — specific issues found
- **duration** (number) — milliseconds taken

### IValidationViolation

- **code** (string) — machine-readable violation code (e.g.,
  `CYCLIC_EDGE_DETECTED`, `UNKNOWN_NODE_TYPE`, `INSUFFICIENT_EVIDENCE`)
- **message** (string) — human-readable description
- **severity** — `error` | `warning` (warnings don't cause rejection but are
  logged in the audit trail)
- **affectedOperationIndex** (number) — which operation in the mutation's
  operation list caused this violation
- **metadata** (Record<string, unknown>) — additional context (e.g., the cycle
  path for a cycle violation)

### IValidationPipeline

The pipeline orchestrates stages:

- **addStage(stage: IValidationStage)** — register a stage (idempotent by stage
  name)
- **removeStage(stageName: string)** — unregister a stage (useful for testing or
  for simplified pipelines in development environments)
- **getStages()** → IValidationStage[] — list registered stages in order
- **validate(mutation, context)** → `Promise<IValidationResult>` — run all
  stages in order, short-circuiting on first `error`-severity failure (warnings
  don't short-circuit)

### IValidationResult

- **passed** (boolean) — all stages passed (no error-severity violations)
- **stageResults** (IValidationStageResult[]) — results from each stage that ran
  (stages after a short-circuit won't appear)
- **totalDuration** (number) — sum of all stage durations
- **violations** (IValidationViolation[]) — aggregated from all stages
- **warnings** (IValidationViolation[]) — aggregated warnings from all stages

### Why an interface for validation?

1. **Extensibility (Open/Closed Principle)**: Adding a new validation stage
   (e.g., a future "semantic coherence" stage using vector-service, or a
   "curriculum alignment" stage checking against learning objectives) requires
   only implementing a new `IValidationStage` and registering it — zero changes
   to existing pipeline or stage code.

2. **Testability**: Each stage can be unit-tested in isolation with mock
   mutations and contexts. The pipeline can be tested with mock stages.

3. **Environment-specific configuration**: Development environments can omit
   expensive stages (e.g., evidence sufficiency) by not registering them.
   Production registers the full pipeline.

4. **Agent-controlled validation**: The `ValidationOptions` bypass mechanism
   (Task 6) can be implemented cleanly — the pipeline checks `ValidationOptions`
   and skips stages whose toggle is `false`.

---

## Task 13: Strengthen value objects with branded types and validation

Enhance the value objects from Task 6 with true value object semantics: factory
methods with invariant validation, branded types for constrained numerics, and
enforced immutability.

### Branded numeric types

Define branded types for values with domain constraints:

- **PositiveDepth** — a positive integer (1+) used for `maxDepth` in traversal
  options. Prevents nonsensical depth values like 0, -1, or 3.7. Factory:
  `PositiveDepth.create(n)` validates and returns the branded type or throws.

- **EdgeWeight** — a number in the range [0.0, 1.0] representing edge strength.
  Factory: `EdgeWeight.create(w)` clamps or rejects out-of-range values
  (configurable: clamp for lenient contexts, reject for strict).

- **MasteryLevel** — a number in [0.0, 1.0] representing concept mastery.
  Semantically distinct from EdgeWeight despite the same numeric range.

- **ConfidenceScore** — a number in [0.0, 1.0] for misconception detection
  confidence, metric confidence, etc.

### Why branded types?

In a system where edge weights, mastery levels, and confidence scores are all
`number`, it's easy to accidentally pass a mastery level where an edge weight is
expected — they're structurally identical but semantically different. Branded
types make this a compile-time error:

```typescript
type EdgeWeight = number & { readonly __brand: 'EdgeWeight' };
type MasteryLevel = number & { readonly __brand: 'MasteryLevel' };

function createEdge(weight: EdgeWeight): void {
  /* ... */
}
const mastery: MasteryLevel = MasteryLevel.create(0.8);
createEdge(mastery); // ← TypeScript compile error
```

This follows the same branded ID pattern already used throughout Noema
(`UserId`, `CardId`, `NodeId`, etc.) but extends it to constrained numeric value
types.

### Value object factory methods

Each value object should have a static `create()` factory that validates
invariants:

- **TraversalOptions.create({ maxDepth: -1 })** → throws `MaxDepthExceededError`
  with details
- **EdgePolicy.create({ maxWeight: 2.0 })** → throws `InvalidEdgeTypeError`
  (weight can't exceed 1.0)
- **NodeFilter.create({ graphType: 'ckg', userId: '...' })** → throws (CKG
  filters must not include userId — CKG is shared)
- **ValidationOptions.create({})** → returns defaults (all validations enabled)

### Immutability enforcement

All value objects should be deeply immutable:

- Use `Readonly<T>` wrapper types
- Factory methods call `Object.freeze()` on the returned object
- Arrays within value objects use `ReadonlyArray<T>`
- Nested objects use recursive `DeepReadonly<T>` utility type

This prevents accidental mutation of shared configuration (e.g., someone
modifying an `EdgePolicy` object retrieved from `EDGE_TYPE_POLICIES` would
corrupt the global policy configuration).

---

## Task 14: Define the aggregation evidence repository interface

Create `IAggregationEvidenceRepository` — the repository for aggregation
evidence records that track which PKG signals contribute to CKG promotion
proposals.

### IAggregationEvidenceRepository

Methods:

- Record evidence (sourceUserId, sourcePkgNodeId, ckgTargetNodeId or proposed
  label, evidenceType, confidence, metadata)
- Get evidence for a CKG node or proposed mutation (all PKG sources that
  contributed)
- Get evidence count by promotion band threshold (how many independent PKGs
  support this claim)
- Get evidence by source user (which of a user's PKG contributions have been
  recorded as evidence)
- Delete stale evidence (for nodes/mutations that were rejected or superseded)
- Get evidence summary for a mutation (aggregated counts, confidence
  distribution, contributing user count)

### Why a separate repository?

Aggregation evidence has distinct access patterns from the other repositories:

- **Append-heavy writes**: as users interact with their PKGs, the aggregation
  pipeline records evidence entries. Write volume scales with active user count.
- **Threshold queries**: the evidence sufficiency validation stage (Phase 6,
  Stage 4) queries "how many independent PKGs support this claim?" — this is a
  count-by-group query with promotion band filtering.
- **Cross-user aggregation**: unlike other repositories (scoped to a single user
  or to the CKG), evidence spans across users — it links multiple users' PKG
  nodes to a single CKG claim.

These patterns justify a dedicated repository with optimized query methods
rather than overloading `IMutationRepository` with evidence-related methods.

### Relationship to the mutation pipeline

The aggregation evidence repository is consumed by:

1. **Evidence sufficiency validation** (Phase 6, Stage 4) — checks promotion
   band thresholds
2. **Aggregation-initiated mutations** (Phase 6, Task 5) — attaches evidence
   references to proposed mutations
3. **Audit and transparency** — agents and admins can inspect which user signals
   led to a CKG change

### PromotionBand value object

Define a `PromotionBand` value object with the threshold tiers:

- `weak`: 3+ independent PKGs
- `moderate`: 10+ PKGs
- `strong`: 25+ PKGs
- `definitive`: 50+ PKGs

Include a factory method `PromotionBand.fromEvidenceCount(count)` that returns
the highest achieved band, and a method
`PromotionBand.meetsThreshold(band, count)` that checks whether a count meets a
specific band's requirement.

---

## Task 15: Consider splitting IGraphRepository by concern

Define sub-interfaces for `IGraphRepository` following the Interface Segregation
Principle (ISP). Rather than a single 18+ method interface, decompose into
focused, cohesive interfaces that can be composed.

### Sub-interfaces

- **INodeRepository** — node CRUD operations only: createNode, getNode,
  updateNode, deleteNode, findNodes, countNodes
- **IEdgeRepository** — edge CRUD operations only: createEdge, getEdge,
  removeEdge, findEdges, getEdgesForNode
- **ITraversalRepository** — graph traversal operations: getAncestors,
  getDescendants, findShortestPath, getSubgraph, detectCycles
- **IBatchGraphRepository** — batch operations: createNodes, createEdges,
  getNodesByIds

### Composite interface

```typescript
interface IGraphRepository
  extends
    INodeRepository,
    IEdgeRepository,
    ITraversalRepository,
    IBatchGraphRepository {}
```

The composite `IGraphRepository` still exists for convenience — services that
need the full graph capability inject `IGraphRepository`. But services or test
suites that only need a subset can depend on the narrower interface.

### Why split?

1. **Testing ergonomics**: When testing edge policy enforcement, you only need
   to mock `INodeRepository` (to verify source/target nodes exist) and
   `ITraversalRepository` (for cycle detection). You don't need to stub 10+
   unrelated methods from a monolithic interface. Narrower interfaces mean
   smaller, more focused mocks.

2. **Interface Segregation Principle**: A client that only traverses (e.g., the
   metrics computation engine) shouldn't depend on write methods it never calls.
   ISP prevents "fat interface" coupling.

3. **Decorator composition**: The `CachedGraphRepository` (Phase 4) might only
   cache reads (node/edge lookups) and not traversals (too many key
   permutations). With split interfaces, you can decorate `INodeRepository` with
   caching and leave `ITraversalRepository` uncached — impossible with a
   monolithic interface without implementing pass-through for every uncached
   method.

4. **Future extensibility**: If a new traversal capability is added (e.g.,
   community detection, centrality computation), it extends
   `ITraversalRepository` without touching `INodeRepository` or
   `IEdgeRepository`.

### Implementation note

The concrete `Neo4jGraphRepository` (Phase 4) still implements the full
composite `IGraphRepository`. The split is at the interface level only — it
doesn't require multiple implementation classes. A single Neo4j repository class
satisfies all four sub-interfaces.

---

## Checklist

- [ ] IGraphRepository interface defined with node, edge, traversal, batch ops
- [ ] IGraphRepository decomposed into INodeRepository, IEdgeRepository,
      ITraversalRepository, IBatchGraphRepository sub-interfaces
- [ ] IMutationRepository interface defined with CRUD, state transitions, audit
- [ ] IMetricsRepository interface defined with snapshots and history
- [ ] IMisconceptionRepository interface defined with patterns, interventions,
      detections
- [ ] IPkgOperationLogRepository interface defined with append-only changelog,
      sync support, and undo context
- [ ] IAggregationEvidenceRepository interface defined with evidence recording,
      threshold queries, and cross-user aggregation
- [ ] Domain error hierarchy created (graph, mutation, misconception, general)
- [ ] Value objects created: EdgePolicy, ValidationOptions, TraversalOptions,
      NodeFilter
- [ ] Value objects strengthened with branded types (EdgeWeight, MasteryLevel,
      PositiveDepth, ConfidenceScore), factory methods, and deep immutability
- [ ] PromotionBand value object defined with threshold tiers and factory
      methods
- [ ] EDGE_TYPE_POLICIES configuration created with per-edge-type rules
- [ ] IKnowledgeGraphService interface defined with PKG, CKG, metrics,
      misconception methods
- [ ] IKnowledgeGraphService extended with compareWithCkg() for PKG↔CKG
      structural comparison
- [ ] IGraphComparison and IStructuralDivergence value objects defined
- [ ] Domain event types cataloged in domain-events.ts with payload interfaces
      and metadata contract
- [ ] IValidationStage, IValidationPipeline, and IValidationResult interfaces
      defined for pluggable CKG mutation validation
- [ ] All methods return IServiceResult<T> with IAgentHints
- [ ] Domain layer has zero infrastructure imports (no neo4j-driver, no Prisma)
- [ ] `pnpm typecheck` passes
