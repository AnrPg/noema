# Phase 5: PKG Operations & Service Layer Foundation

## Objective

Implement the `KnowledgeGraphService` class — the single orchestrator that ties
repositories, policies, and business rules together. This phase focuses on
establishing the service class and implementing Personal Knowledge Graph (PKG)
operations: creating and managing nodes and edges in a user's individual graph,
traversal queries, and read-only access to the Canonical Knowledge Graph (CKG).

**This phase deliberately excludes structural metrics and misconception
detection**, which are separated into Phase 7 because they depend on CKG data
being available via the mutation pipeline (Phase 6). By implementing PKG CRUD
first, we establish the service class scaffolding and the `IServiceResult<T>`
pattern that Phase 6 extends with mutation methods and Phase 7 extends with
metric computation.

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

The service layer sits between the API routes and the repositories. It contains
ALL business logic: policy enforcement, validation orchestration, event
publishing, and hint generation. Study the content-service's `ContentService`
class (1746 lines) for the canonical pattern — it's a large orchestrator class
with method-per-feature, each returning `IServiceResult<T>` with agent hints.

### Why one service class?

Following content-service convention. The `KnowledgeGraphService` receives all
repository interfaces plus the event publisher via constructor injection.
It has no direct infrastructure dependencies. This makes it testable with mock
repositories.

### Phase dependency map

```
Phase 5 (PKG) ──┐
                 ├──→ Phase 7 (Metrics) ──→ Phase 8 (API) ──→ …
Phase 6 (CKG) ──┘
```

- **Phase 5 (this phase)** and **Phase 6** (CKG Mutation Pipeline) are
  **independent peers** — neither depends on the other. They could be
  implemented in either order. Phase 5 is sequenced first by convention, not
  by necessity.
- **Phase 7** (Structural Metrics & Misconception Detection) **depends on
  both** Phase 5 and Phase 6: `computeMetrics` needs the user's PKG (Phase 5)
  and the CKG reference subgraph (Phase 6) to compute all 11 metrics at full
  accuracy.

---

## Task 1: Implement node operations

### Class establishment

Create the `KnowledgeGraphService` class in
`src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts`:

- Constructor receives all repository interfaces: `IGraphRepository`,
  `IMutationRepository`, `IMetricsRepository`, `IMisconceptionRepository`,
  `IAggregationEvidenceRepository`, `IPkgOperationLogRepository`
- Constructor also receives `IEventPublisher`
- Private helper methods for building `IAgentHints` (deterministic, rule-based,
  no LLM calls — see content-service pattern)
- Class implements the `IKnowledgeGraphService` interface

### createNode

- Validate input using Zod schemas (label required, nodeType must be valid
  `GraphNodeType`, domain required)
- Generate a `NodeId` using the branded ID factory
- Delegate to `IGraphRepository.createNode()`
- Publish `PkgNodeCreated` event via the event publisher
- Set `updatedAt` on the user's PKG domain metrics (mark as stale so next
  metrics request triggers recomputation)
- Return `IServiceResult<IGraphNode>` with agent hints

### Agent hints for createNode

The hints should include:

- **suggestedNextActions**: "Add edges to connect this node to existing
  concepts", "Consider adding prerequisite relationships", "This domain now has
  N nodes — review if the granularity is appropriate"
- **relatedResources**: list the nearest existing nodes (by label similarity or
  domain membership) that the new node might relate to
- **riskFactors**: if the domain already has many nodes, hint about potential
  over-fragmentation; if the node type is rarely used, flag it for review
- **confidence**: high for successful creation, lower if the system suspects
  near-duplicates exist

### getNode, updateNode, deleteNode

Follow the same pattern. updateNode publishes `PkgNodeUpdated`. deleteNode
performs soft-delete and publishes `PkgNodeRemoved`. All return
`IServiceResult<T>` with contextually relevant agent hints.

### listNodes

Accept `NodeFilter` value object and pagination parameters. Delegate to
repository. Return `IPaginatedResponse<IGraphNode>` wrapped in `IServiceResult`.
Agent hints should include statistics about the result set (e.g., "found 47
concept nodes and 12 procedure nodes in this domain").

---

## Task 2: Implement edge operations with policy enforcement

### createEdge

This is the most complex single operation in the service. The flow:

1. **Validate input** — edge type, source/target nodeIds, weight within range
2. **Verify source and target nodes exist** — query the repository (both must be
   in the same graph scope — same userId for PKG, or both CKG)
3. **Look up the EDGE_TYPE_POLICY** for the given edge type
4. **Enforce node type constraints** — check that the source node's type is in
   `allowedSourceTypes` and target node's type is in `allowedTargetTypes`
5. **Run acyclicity check** (if policy requires it AND the caller hasn't
   disabled it via `ValidationOptions`) — query the repository for a path from
   targetNode to sourceNode. If a path exists, adding this edge would create a
   cycle → throw `CyclicEdgeError`
6. **Apply weight constraints** — clamp or validate against the policy's
   maxWeight
7. **Create the edge** in the repository
8. **Publish `PkgEdgeCreated` event**
9. **Mark domain metrics as stale** (edges change structural metrics)
10. **Return `IServiceResult<IGraphEdge>`** with agent hints

### The acyclicity check in detail

The cycle detection query asks: "Can I walk from the target node back to the
source node following edges of the same type?" If yes, adding a source→target
edge would close a cycle.

This uses the repository's cycle detection traversal, which in Neo4j is a
parameterized Cypher query with a depth limit (configurable, default ~20 hops).
The depth limit prevents infinite traversals in large graphs while catching
practically all real cycles.

### ValidationOptions bypass

Agent callers can pass `ValidationOptions` to skip certain checks:

- An agent that has already verified acyclicity before calling (e.g., by
  building the edge set in memory and checking there) can set
  `validateAcyclicity: false`
- A batch import of known-good edges can disable all validation for performance
- This opt-out is audited — the event payload records which validations were
  skipped

### Agent hints for createEdge

- If acyclicity was checked and passed, hint: "Edge is safe. No cycles
  detected."
- If the target node now has many incoming edges of this type, hint: "This
  concept has N prerequisites — consider if all are truly necessary"
- If the edge weight is extreme (very low or very high), hint about it
- Suggest related edges that might also make sense given this new connection
- Flag if the source or target node appears to be becoming a "hub" (very high
  degree)

### getEdge, updateEdge, deleteEdge, listEdges

Implement the full edge CRUD surface:

- **getEdge**: retrieve a single edge by ID, return with hints about the nodes
  it connects and the edge type policy that governs it
- **updateEdge**: modify edge weight or properties, publish `PkgEdgeUpdated`
  event, mark metrics stale
- **deleteEdge**: soft-delete, publish `PkgEdgeRemoved` event, hints about
  connectivity changes (did removing this edge disconnect a subgraph?)
- **listEdges**: accept filters (by type, by source/target node, by weight
  range), return paginated results with statistics hints

---

## Task 3: Implement traversal operations

### getSubgraph

- Accept `TraversalOptions` (maxDepth, edgeTypes filter, direction)
- Delegate to `IGraphRepository.getSubgraph()`
- Return `ISubgraph` (nodes + edges) wrapped in `IServiceResult`
- Agent hints: subgraph statistics (node count, edge count, density, connected
  components), deepest path found, isolated nodes

### getAncestors / getDescendants

- Delegate to repository traversal methods
- Return ordered list of nodes (nearest first)
- Agent hints: depth of the deepest ancestor/descendant, branching factor at
  each level, whether the ancestry chain is "linear" (1 parent per level) or
  "bushy" (multiple parents)

### findPath

- Delegate to repository shortest path
- Return the ordered node list representing the path
- Agent hints: path length, whether alternative paths exist, whether any nodes
  on the path have known issues (low mastery, detected misconceptions)

---

## Task 4: Implement CKG read operations

### getCkgNode, getCkgSubgraph, listCkgNodes

These are simpler than PKG operations — no userId scoping, no mutation pipeline
(reads only, CKG writes go through the mutation pipeline in Phase 6).

- Delegate to the same `IGraphRepository` but with `graphType: 'ckg'`
- Return with agent hints that contextualize the canonical structure (e.g.,
  "this concept has 12 child concepts and is canonical across 340 user PKGs")
- **When CKG has no data** (before Phase 6 seeds it), these methods return empty
  results gracefully — no errors, just empty subgraphs with a hint: "CKG has
  no data for this domain yet"

---

## Checklist

- [ ] KnowledgeGraphService class created with constructor DI (implements
      IKnowledgeGraphService)
- [ ] Private helper methods for building IAgentHints (deterministic, rule-based)
- [ ] Node CRUD operations (create, get, update, delete, list) with events
- [ ] Edge CRUD operations (create, get, update, delete, list) with full
      EDGE_TYPE_POLICIES enforcement
- [ ] Acyclicity check via repository traversal with configurable depth limit
- [ ] ValidationOptions bypass with audit trail
- [ ] Subgraph, ancestors, descendants, findPath traversal operations
- [ ] CKG read operations (getCkgNode, getCkgSubgraph, listCkgNodes) with
      graceful empty-CKG handling
- [ ] Every method returns IServiceResult<T> with contextual IAgentHints
- [ ] Events published for all state-changing operations (PkgNodeCreated,
      PkgNodeUpdated, PkgNodeRemoved, PkgEdgeCreated, PkgEdgeUpdated,
      PkgEdgeRemoved)
- [ ] Domain metrics marked stale on structural changes (for Phase 7
      recomputation)
- [ ] `pnpm typecheck` passes
