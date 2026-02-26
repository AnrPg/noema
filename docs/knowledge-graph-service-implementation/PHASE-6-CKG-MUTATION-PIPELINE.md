# Phase 6: CKG Mutation Pipeline

## Objective

Implement the Canonical Knowledge Graph (CKG) mutation pipeline — the
typestate-governed process through which proposed structural changes to the
shared canonical graph are validated, proven, and committed (or rejected). This
is the most architecturally complex component of the knowledge-graph-service,
implementing a disciplined state machine that ensures the CKG never contains
unvalidated structural claims.

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

### Phase dependency map

```
Phase 5 (PKG) ──┐
                 ├──→ Phase 7 (Metrics) ──→ Phase 8 (API) ──→ …
Phase 6 (CKG) ──┘
```

**This phase is independent of Phase 5.** Phase 5 (PKG Operations) and Phase 6
(this phase) are peers — neither depends on the other. They are sequenced 5 → 6
by convention. If Phase 5 has already been implemented, the
`KnowledgeGraphService` class exists and this phase adds mutation methods to it.
If this phase is implemented first, it creates the class and Phase 5 adds PKG
methods to it.

**Phase 7 depends on both.** Structural metrics require PKG data (Phase 5) and
CKG reference data (this phase) for full-accuracy computation.

### What is the CKG?

The CKG is the shared "ground truth" graph that all users' PKGs are compared
against. Unlike the PKG, where any authenticated user can add nodes and edges
freely, the CKG requires a formal mutation pipeline:

1. An agent or an admin user (typically the knowledge-graph-agent, the
   aggregation pipeline, or a platform administrator) **proposes** a change
2. The change passes through **validation stages** (structural integrity,
   conflict detection, evidence sufficiency)
3. If validated, the change is **committed** to the CKG
4. If validation fails, the change is **rejected** with detailed reasons

This pipeline is governed by a **typestate machine** — the mutation object can
only transition through specific states in a specific order, and each state
transition is guarded by preconditions. The typestate pattern (from ADR-003)
ensures at the type level that you can't accidentally commit an unvalidated
mutation.

### Why a formal pipeline and not direct writes?

The CKG influences every user's learning experience. A malformed or incorrect
structural claim in the CKG can cascade into bad learning paths for thousands of
users. The mutation pipeline is the quality gate that prevents this. It's
analogous to a code review process — proposed changes get validated before
merging.

---

## Task 1: Define the Mutation DSL operations

The mutation DSL (Domain Specific Language) is the vocabulary of possible
structural changes to the CKG. Each mutation contains one or more operations
that describe what structural change is being proposed.

### Operation types

- **AddNode** — add a new concept node to the CKG. Requires: nodeType, label,
  description, domain, properties. This is how new canonical concepts enter the
  system.

- **RemoveNode** — propose removing a node from the CKG (soft delete). Requires:
  nodeId, rationale. Rarely used — usually only when a concept is determined to
  be a duplicate or out of scope.

- **UpdateNode** — modify a node's properties (label, description, etc.).
  Requires: nodeId, updates, rationale.

- **AddEdge** — add a structural relationship between two CKG nodes. Requires:
  edgeType, sourceNodeId, targetNodeId, weight, rationale. Subject to the same
  EDGE_TYPE_POLICIES as PKG edges.

- **RemoveEdge** — remove a structural relationship. Requires: edgeId,
  rationale.

- **MergeNodes** — merge two nodes into one (for deduplication). Requires:
  sourceNodeId, targetNodeId, mergedProperties, rationale. Complex operation:
  all edges from the source are redirected to the target, the source is
  soft-deleted, and downstream PKGs are notified.

- **SplitNode** — split one node into two (when a concept is determined to be
  conflating two distinct ideas). Requires: nodeId, newNodeA properties,
  newNodeB properties, edgeReassignmentRules. This is the inverse of merge and
  equally complex.

### Operation composition

A single mutation can contain multiple operations that form a logical unit. For
example, "Add concept X, add concept Y, add PREREQUISITE edge from X to Y"
should be a single atomic mutation — either all operations succeed or none do.
The mutation DSL must support this atomicity.

### Why a DSL and not direct service calls?

The DSL serves multiple purposes:

1. **Auditability**: every proposed change is captured as a data structure that
   can be logged, reviewed, and replayed
2. **Atomicity**: multi-operation mutations commit or rollback as a unit
3. **Validation**: the pipeline can analyze the complete set of operations
   before applying any of them (detecting conflicts within the mutation itself)
4. **Agent interface**: agents compose mutations programmatically and submit
   them — the DSL is their API to the CKG

---

## Task 2: Implement the typestate machine

The mutation state machine governs the lifecycle of every CKG mutation.

### States

```
PROPOSED → VALIDATING → VALIDATED → COMMITTED
              ↓             ↓
           REJECTED      REJECTED
```

- **PROPOSED** — initial state. The mutation has been submitted by an agent with
  its operations and rationale.
- **VALIDATING** — the mutation is currently being validated. Validation runs
  asynchronously.
- **VALIDATED** — all validation stages passed. The mutation is approved for
  commit.
- **COMMITTED** — the mutation's operations have been applied to the CKG graph
  in Neo4j. Terminal state.
- **REJECTED** — the mutation failed validation or was manually rejected.
  Terminal state. Records the failure reason and stage.

### State transition rules

The typestate machine must enforce:

- PROPOSED can only transition to VALIDATING
- VALIDATING can transition to VALIDATED or REJECTED
- VALIDATED can only transition to COMMITTED or REJECTED
- COMMITTED and REJECTED are terminal — no further transitions allowed
- Every transition produces an audit log entry
- Every transition publishes the corresponding domain event
- State transitions use optimistic locking (version field) to prevent race
  conditions

### Typestate enforcement approach

The typestate pattern means the _type system_ should prevent illegal
transitions. While TypeScript can't fully enforce typestate at the type level
(it's not Rust), the implementation should use discriminated unions and guard
functions that narrow the type:

- Functions like
  `startValidation(mutation: ProposedMutation): ValidatingMutation` accept only
  mutations in the PROPOSED state and return a mutation in the VALIDATING state
- The service layer can only call `commitMutation` on a `ValidatedMutation`, not
  on a `ProposedMutation`

This makes illegal state transitions a compile-time error when used correctly.

---

## Task 3: Implement validation stages

Validation is a multi-stage pipeline that checks whether the proposed mutation
is safe to apply to the CKG. Each stage independently produces a pass/fail
result with details.

### Validation stages

**Stage 1: Schema validation**

- Are all operation types recognized?
- Do all referenced nodeIds/edgeIds exist in the CKG?
- Are required fields present?
- Are node/edge types valid enum values?
- This is quick syntactic validation.

**Stage 2: Structural integrity**

- For AddEdge operations: run the EDGE_TYPE_POLICIES validation (node type
  compatibility, acyclicity check if required)
- For RemoveNode: check if removing this node would orphan edges (edges whose
  other endpoint is only reachable through this node)
- For MergeNodes: validate that the merge target exists and the edge
  reassignment is consistent
- For SplitNode: validate that the split produces two valid concept structures

**Stage 3: Conflict detection**

- Check for conflicts with other in-flight mutations (two mutations both trying
  to modify the same node, or one adding an edge that another is removing).
  Query `IMutationRepository` for VALIDATING/VALIDATED mutations that touch
  overlapping nodeIds/edgeIds.
- Conflicts don't automatically cause rejection — they're flagged for the
  proposing agent to resolve (possibly by retrying after the conflicting
  mutation completes or is rejected).

**Stage 4: Evidence sufficiency (for aggregation-originated mutations)**

- If the mutation was proposed by the aggregation pipeline (PKG→CKG promotion),
  check that sufficient PKG evidence exists. The `PromotionBand` determines the
  threshold:
  - `weak`: 3+ independent PKGs
  - `moderate`: 10+ PKGs
  - `strong`: 25+ PKGs
  - `definitive`: 50+ PKGs
- The evidence count is stored in the `AggregationEvidence` table.
- Agent-initiated mutations (from curriculum designers) bypass this stage.

### Validation result structure

Each stage produces a result with: stageName, passed (boolean), details
(human-readable diagnostics), violations (array of specific issues found),
duration (how long the stage took). The aggregate validation result includes all
stage results plus an overall pass/fail.

### Validation is non-blocking

Validation stages run in sequence (each stage depends on the previous — no point
running structural integrity if schema validation fails). But the validation
pipeline itself runs asynchronously relative to the mutation proposal. The
proposing agent gets back the `MutationId` immediately and can poll for status
or subscribe to the `CkgMutationValidated`/`CkgMutationRejected` events.

---

## Task 4: Implement the commit protocol

When a mutation reaches VALIDATED state, the commit protocol applies its
operations to the CKG.

### Commit steps

1. **Begin Neo4j transaction** — all CKG graph mutations happen in a single
   transaction for atomicity
2. **Apply operations** in order:
   - AddNode → `IGraphRepository.createNode()` with `graphType: 'ckg'`
   - RemoveNode → `IGraphRepository.deleteNode()` in CKG scope
   - UpdateNode → `IGraphRepository.updateNode()` in CKG scope
   - AddEdge → `IGraphRepository.createEdge()` in CKG scope (with validation
     already done — `ValidationOptions` can skip re-validation)
   - RemoveEdge → `IGraphRepository.deleteEdge()` in CKG scope
   - MergeNodes → complex: redirect edges, soft-delete source, update target
   - SplitNode → complex: create two new nodes, reassign edges, soft-delete
     original
3. **Commit Neo4j transaction** — if any operation fails, rollback entire
   transaction
4. **Update mutation state** in PostgreSQL → COMMITTED (with optimistic lock)
5. **Publish `CkgMutationCommitted` event** with the list of affected nodeIds
   and edgeIds
6. **Invalidate caches** for affected CKG nodes and edges

### Failure handling

- If the Neo4j transaction fails (constraint violation, timeout, connectivity),
  the mutation transitions to REJECTED with the failure details
- If the PostgreSQL state update fails (optimistic lock conflict), the Neo4j
  changes have already committed — this is a consistency issue. Log at ERROR
  level with correlation ID for manual reconciliation. This scenario is rare (it
  means two processes tried to commit the same mutation simultaneously) but must
  be handled gracefully.

### Post-commit effects

After a mutation commits, downstream systems may need to react:

- PKGs that reference affected CKG nodes may need to update their local copies
  (handled via events, not direct calls)
- Structural metrics that use CKG as a reference may need recomputation
- The analytics service needs the event for dashboards

All of this happens via the `CkgMutationCommitted` event — the commit protocol
itself doesn't call other services.

---

## Task 5: Implement the aggregation pipeline integration

The PKG→CKG aggregation pipeline (ADR-005) is a 7-stage process that identifies
patterns across many users' PKGs and proposes them as CKG mutations when enough
evidence accumulates. While the full aggregation pipeline may eventually be its
own service or scheduled job, the knowledge-graph-service needs the mutation
entry point.

### What this phase implements

- **Aggregation evidence recording**: methods to record which PKG signals
  contributed to an aggregation analysis, stored in the `AggregationEvidence`
  table
- **Aggregation-initiated mutation proposals**: a method that accepts
  aggregation results (pattern + evidence summary + promotion band) and creates
  a CKG mutation with the appropriate evidence metadata
- **Evidence sufficiency validation** (Stage 4 above): checking that the
  promotion band threshold is met

### What this phase does NOT implement

- The actual aggregation _computation_ (analyzing PKG patterns across users) —
  this will be a separate service/job or agent capability
- The signal collection and pattern extraction stages — these require analytics
  and statistical processing

The service provides the "intake" and "output" of the aggregation pipeline
(propose mutations based on aggregation results, record evidence) while the
middle stages are external.

---

## Task 6: Wire mutation operations into KnowledgeGraphService

Add mutation pipeline methods to the `KnowledgeGraphService`:

- **proposeMutation(agentId, operations, rationale, evidence?)** → creates the
  mutation in PROPOSED state, starts async validation. Returns MutationId.

- **getMutation(mutationId)** → returns current mutation state with all details.

- **listMutations(filters)** → query by state, proposer, timeRange. Returns
  paginated results.

- **cancelMutation(mutationId)** → only allowed for PROPOSED or VALIDATING
  mutations. Transitions to REJECTED with reason "cancelled by proposer."

- **retryMutation(mutationId)** → for REJECTED mutations, creates a new mutation
  with the same operations (new MutationId, fresh state). Original stays
  REJECTED for audit.

Each returns `IServiceResult<T>` with agent hints:

- proposeMutation hints: estimated validation time, similar mutations in flight,
  potential conflicts
- getMutation hints: time in current state, average pipeline throughput
- listMutations hints: pipeline health metrics (how many stuck in VALIDATING,
  rejection rate)

---

## Checklist

- [ ] Mutation DSL operation types defined (AddNode, RemoveNode, UpdateNode,
      AddEdge, RemoveEdge, MergeNodes, SplitNode)
- [ ] Typestate machine implemented with discriminated union types
- [ ] State transition rules enforced (illegal transitions are compile errors
      where possible, runtime errors otherwise)
- [ ] Every state transition produces audit log entry
- [ ] 4-stage validation pipeline implemented (schema, structural, conflict,
      evidence)
- [ ] Validation runs asynchronously (non-blocking proposal)
- [ ] Commit protocol applies operations atomically in Neo4j transaction
- [ ] Failure handling for cross-database consistency
- [ ] Aggregation evidence recording and promotion-band threshold checking
- [ ] Service methods wired: proposeMutation, getMutation, listMutations,
      cancelMutation, retryMutation
- [ ] Domain events published: CkgMutationProposed, CkgMutationValidated,
      CkgMutationCommitted, CkgMutationRejected
- [ ] All methods return IServiceResult<T> with contextual IAgentHints
- [ ] `pnpm typecheck` passes
