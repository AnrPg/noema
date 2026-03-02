# Phase 8b: Relational Traversal Endpoints

## Objective

Extend the knowledge-graph-service with three relational traversal operations —
**Siblings**, **Co-Parents**, and **Neighborhood** — that answer the most common
structural relationship questions: *"What is at the same level as X?"*, *"What
shares children with X?"*, and *"What is nearby X, grouped by semantic
relationship type?"*

These endpoints close the gap between what Neo4j can express natively and what
the Phase 8 API surface currently offers, enabling agents, the scheduler,
content-service, and front-end clients to obtain semantically grouped,
filtered graph data without multiple round-trips or application-layer
post-processing.

This phase is the first of three additive phases (8b, 8c, 8d) that together
deliver eight new traversal and graph-analysis operations on top of Phase 8.

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

## Context & Motivation

### Current traversal surface (Phase 8)

Phase 8 exposes four traversal endpoints under
`/api/v1/users/:userId/pkg/traversal`:

| Endpoint | Shape returned | Limitation |
|---|---|---|
| `GET /subgraph` | `ISubgraph` (flat nodes + edges) | No filtering by node type; no grouping by edge semantic; returns raw graph without structure |
| `GET /ancestors/:nodeId` | `IGraphNode[]` | Flat list; no relationship metadata; follows edges inbound only |
| `GET /descendants/:nodeId` | `IGraphNode[]` | Flat list; follows edges outbound only |
| `GET /path` | `IGraphNode[]` | Shortest path only; edge/node-type filters exist at repo level but not exposed |

### What is computed internally but NOT exposed

| Internal computation | Location | Why exposing it matters |
|---|---|---|
| **Sibling groups** | `computeSiblingGroups()` in `metric-computation-context.ts` | SCE metric measures sibling confusion but the learner/agent has no way to *explore* the sibling space to resolve it |
| **Parent maps** | `computeParentMap()` in `metric-computation-context.ts` | Hierarchical structure is used solely for metrics, not available for navigation |
| **Depth maps** | `computeDepthMap()` in `metric-computation-context.ts` | Prerequisite chain depth is computed for metrics but agents cannot query topological ordering |
| **Node edge-type distribution** | `computeNodeEdgeTypes()` in `metric-computation-context.ts` | Per-node edge-type diversity is computed internally but cannot be queried |

### Gap analysis

Agents and consumers repeatedly need to:

1. Find **sibling concepts** (taxonomic peers) for discrimination learning
2. Find **co-parent concepts** that share children (overlapping scope detection)
3. Explore **filtered multi-hop neighborhoods** grouped by edge-type semantics
4. Identify **bridge nodes** whose removal fragments the graph (critical concepts) *(Phase 8c)*
5. Discover the **knowledge frontier** (boundary between mastered and unmastered) *(Phase 8c)*
6. Find **common ancestors** of two concepts (shared prerequisites/foundations) *(Phase 8c)*
7. Get the **topological prerequisite order** to study a concept correctly *(Phase 8d)*
8. Rank nodes by **structural centrality** (most connected = most important) *(Phase 8d)*

Each of these currently requires either multiple round-trips, application-layer
post-processing, or agent-side graph traversal in LLM token space — all of
which are slow, error-prone, and should be pushed to the database layer where
Neo4j can handle them natively.

---

## Full Endpoint Summary (Phases 8b–8d)

Eight new operations across three phases. Each operates on both PKG (user-scoped)
and CKG (global) graphs unless noted otherwise.

| # | Endpoint | HTTP | Path | Phase |
|---|---|---|---|---|
| 1 | **Get Siblings** | `GET` | `/traversal/siblings/:nodeId` | 8b |
| 2 | **Get Co-Parents** | `GET` | `/traversal/co-parents/:nodeId` | 8b |
| 3 | **Get Neighborhood** | `GET` | `/traversal/neighborhood/:nodeId` | 8b |
| 4 | **Get Bridge Nodes** | `GET` | `/traversal/bridges` | 8c |
| 5 | **Get Knowledge Frontier** | `GET` | `/traversal/frontier` | 8c |
| 6 | **Get Common Ancestors** | `GET` | `/traversal/common-ancestors` | 8c |
| 7 | **Get Prerequisite Chain** | `GET` | `/traversal/prerequisite-chain/:nodeId` | 8d |
| 8 | **Get Centrality Ranking** | `GET` | `/traversal/centrality` | 8d |

All PKG variants live under `/api/v1/users/:userId/pkg/traversal/...`
All CKG variants live under `/api/v1/ckg/traversal/...`

---

## Endpoint 1: Get Siblings (Co-Children)

### Intuition

In a knowledge graph, **siblings** are nodes that share a common parent via the
**same edge type and direction**. If `Calculus` has children `Differential
Calculus` and `Integral Calculus` via `PART_OF`, those are siblings. But
siblings are not limited to taxonomic hierarchies — two concepts that share the
same prerequisite parent via `PREREQUISITE`, or two examples that exemplify the
same principle via `EXEMPLIFIES`, are also siblings in their respective semantic
dimension.

This is a generalised relationship query: *"What nodes stand in the same
structural relation to the same parent as X, via a given edge type?"*

The edge type is a **required parameter** — the caller explicitly chooses the
semantic dimension along which sibling-hood is evaluated. This prevents
accidental conflation of unrelated structural relationships (e.g., taxonomic
siblings vs. prerequisite co-dependents are fundamentally different groups).

### Semantics

Siblings are defined as nodes sharing a common parent via a specified edge type
and direction. Because a node can have multiple parents (e.g., `Sorting` is
`PART_OF` both `Algorithms` and `Data Processing`), results are **grouped by
parent**.

#### The `direction` parameter

Different edge types encode the parent→child relationship in different
directions within the Neo4j graph:

| Edge type | Arrow direction | Parent is... | Child is... | `direction` value |
|---|---|---|---|---|
| `IS_A` | child → parent | target | source | `outbound` |
| `PART_OF` | child → parent | target | source | `outbound` |
| `DERIVED_FROM` | child → parent | target | source | `outbound` |
| `EXEMPLIFIES` | example → concept | target | source | `outbound` |
| `PREREQUISITE` | prerequisite → dependent | source | target | `inbound` |
| `CAUSES` | cause → effect | source | target | `inbound` |
| `RELATED_TO` | symmetric | either | either | `outbound` or `inbound` |
| `CONTRADICTS` | symmetric | either | either | `outbound` or `inbound` |

The `direction` parameter specifies the direction of the edge **from the
queried node toward its parent**:

- **`outbound`**: the edge goes `me → parent` (I am the source, parent is the
  target). Used for IS_A, PART_OF, DERIVED_FROM, EXEMPLIFIES.
- **`inbound`**: the edge goes `parent → me` (parent is the source, I am the
  target). Used for PREREQUISITE, CAUSES.

### REST API

**PKG**: `GET /api/v1/users/:userId/pkg/traversal/siblings/:nodeId`
**CKG**: `GET /api/v1/ckg/traversal/siblings/:nodeId`

**Query Parameters**:

| Param | Type | Default | Description |
|---|---|---|---|
| `edgeType` | `string` | **required** | The edge type defining the parent-child relationship (any `GraphEdgeType` value) |
| `direction` | `string` | `outbound` | Direction of the edge from the queried node to its parent: `outbound` (me→parent) or `inbound` (parent→me) |
| `includeParentDetails` | `boolean` | `true` | Whether to return full parent node data or just the parent ID |
| `maxSiblingsPerGroup` | `integer` | `50` | Cap per parent group to prevent response explosion |

**Response shape** (`ISiblingsResult`):

```typescript
interface ISiblingsResult {
  /** The node whose siblings were queried */
  readonly originNodeId: NodeId;
  /** The origin node (full data) */
  readonly originNode: IGraphNode;
  /** The edge type used for the sibling query */
  readonly edgeType: GraphEdgeType;
  /** The direction used (outbound or inbound) */
  readonly direction: 'outbound' | 'inbound';
  /** Sibling groups, one per shared parent */
  readonly groups: readonly ISiblingGroupResult[];
  /** Total number of unique sibling nodes across all groups */
  readonly totalSiblingCount: number;
}

interface ISiblingGroupResult {
  /** The common parent node (full or ID-only per includeParentDetails) */
  readonly parent: IGraphNode;
  /** The edge type connecting origin to parent */
  readonly edgeType: GraphEdgeType;
  /** The sibling nodes under this parent (excluding the origin) */
  readonly siblings: readonly IGraphNode[];
  /** Total sibling count under this parent (may exceed returned if capped) */
  readonly totalInGroup: number;
}
```

**Agent hints**: number of sibling groups, largest group size, whether any SCE
remediation is relevant (when edgeType is IS_A or PART_OF), suggested
comparative study pairs.

### Cypher (Neo4j)

#### When `direction = 'outbound'` (me → parent)

```cypher
// Pattern: (me)-[:EDGE_TYPE]->(parent)<-[:EDGE_TYPE]-(sibling)
// Used for IS_A, PART_OF, DERIVED_FROM, EXEMPLIFIES
MATCH (me {nodeId: $nodeId})-[e1]->(parent)
      <-[e2]-(sibling)
WHERE type(e1) = $edgeType
  AND type(e2) = $edgeType
  AND me.isDeleted = false
  AND parent.isDeleted = false
  AND sibling.isDeleted = false
  AND sibling.nodeId <> $nodeId
  [AND me.userId = $userId]  // PKG only
RETURN parent,
       collect(DISTINCT sibling)[0..$maxPerGroup] AS siblings,
       count(DISTINCT sibling) AS totalInGroup
ORDER BY totalInGroup DESC
```

#### When `direction = 'inbound'` (parent → me)

```cypher
// Pattern: (me)<-[:EDGE_TYPE]-(parent)-[:EDGE_TYPE]->(sibling)
// Used for PREREQUISITE, CAUSES
MATCH (me {nodeId: $nodeId})<-[e1]-(parent)
      -[e2]->(sibling)
WHERE type(e1) = $edgeType
  AND type(e2) = $edgeType
  AND me.isDeleted = false
  AND parent.isDeleted = false
  AND sibling.isDeleted = false
  AND sibling.nodeId <> $nodeId
  [AND me.userId = $userId]  // PKG only
RETURN parent,
       collect(DISTINCT sibling)[0..$maxPerGroup] AS siblings,
       count(DISTINCT sibling) AS totalInGroup
ORDER BY totalInGroup DESC
```

### Layer map

| Layer | Artefact | Method / type |
|---|---|---|
| **Value objects** | `graph.value-objects.ts` | `ISiblingsQuery`, `ISiblingsResult`, `ISiblingGroupResult` |
| **Repository interface** | `graph.repository.ts → ITraversalRepository` | `getSiblings(nodeId, query, userId?): Promise<ISiblingsResult>` |
| **Neo4j repository** | `neo4j-graph.repository.ts` | `getSiblings()` — direction-dispatched 2-hop rendezvous Cypher |
| **Cache decorator** | `cached-graph.repository.ts` | Cache key: `siblings:{graphType}:{nodeId}:{edgeType}:{direction}` |
| **Service interface** | `knowledge-graph.service.ts` | `getSiblings(userId, nodeId, query, ctx): Promise<IServiceResult<ISiblingsResult>>` |
| **Service impl** | `knowledge-graph.service.impl.ts` | `getSiblings()` — validates node exists, validates edgeType, delegates to repo, builds agent hints |
| **Zod schemas** | `knowledge-graph.schemas.ts` | `SiblingsQueryParamsSchema`, `SiblingsResponseSchema` |
| **REST route** | `traversal.routes.ts` | `GET /siblings/:nodeId` handler |
| **MCP tool** (Phase 9) | `kg_get_siblings` | Wraps service method with richer agent hints |
| **Shared types** | `@noema/types → knowledge-graph/index.ts` | `ISiblingsResult`, `ISiblingGroupResult` exports |

---

## Endpoint 2: Get Co-Parents (Co-Ancestors)

### Intuition

**Co-parents** are nodes that share a common child via the same edge type and
direction. This is the symmetric counterpart of the siblings query: where
siblings asks *"What else has the same parent as me?"*, co-parents asks *"What
else has the same child as me?"*

If both `Real Analysis` and `Linear Algebra` are prerequisites for
`Functional Analysis`, then `Real Analysis` and `Linear Algebra` are co-parents
of `Functional Analysis` via the `PREREQUISITE` edge type. Similarly, if both
`Algorithms` and `Data Processing` have `Sorting` as a `PART_OF` child, they
are co-parents of `Sorting`.

Co-parent detection is valuable for:

- **Scope overlap detection**: discovering concepts that cover overlapping
  territory (they parent the same children)
- **Curriculum design**: identifying natural groupings or course boundaries
  (co-parents often belong to parallel learning tracks)
- **Graph quality analysis**: excessive co-parenting may indicate redundancy or
  poor ontological modelling
- **Agent remediation**: if multiple parents share weak children, the parents
  may share an underlying deficit

### Semantics

Co-parents are defined as nodes sharing a common child via a specified edge type
and direction. Results are **grouped by shared child**. A node may be a
co-parent via multiple shared children; each group represents one shared child.

#### The `direction` parameter

The `direction` parameter specifies the direction of the edge **from the queried
node toward its child**:

- **`outbound`**: the edge goes `me → child` (I am the source, child is the
  target). Used when I point to my dependents — e.g., as a PREREQUISITE
  (`me -[:PREREQUISITE]-> child`) or as a CAUSE (`me -[:CAUSES]-> child`).
- **`inbound`**: the edge goes `child → me` (child is the source, I am the
  target). Used when my children point to me — e.g., via IS_A
  (`child -[:IS_A]-> me`) or PART_OF (`child -[:PART_OF]-> me`).

| Edge type | `direction` for Co-Parents | Rationale |
|---|---|---|
| `IS_A` | `inbound` | My children have outgoing IS_A edges to me |
| `PART_OF` | `inbound` | My children have outgoing PART_OF edges to me |
| `DERIVED_FROM` | `inbound` | My children have outgoing DERIVED_FROM edges to me |
| `EXEMPLIFIES` | `inbound` | My examples have outgoing EXEMPLIFIES edges to me |
| `PREREQUISITE` | `outbound` | I have outgoing PREREQUISITE edges to my dependents |
| `CAUSES` | `outbound` | I have outgoing CAUSES edges to my effects |
| `RELATED_TO` | `outbound` or `inbound` | Symmetric |
| `CONTRADICTS` | `outbound` or `inbound` | Symmetric |

> **Note**: For a given edge type, the `direction` value for co-parents is
> always the **inverse** of the `direction` value for siblings. If siblings
> uses `direction = 'outbound'` (IS_A), co-parents uses `direction = 'inbound'`.

### REST API

**PKG**: `GET /api/v1/users/:userId/pkg/traversal/co-parents/:nodeId`
**CKG**: `GET /api/v1/ckg/traversal/co-parents/:nodeId`

**Query Parameters**:

| Param | Type | Default | Description |
|---|---|---|---|
| `edgeType` | `string` | **required** | The edge type defining the parent-child relationship (any `GraphEdgeType` value) |
| `direction` | `string` | `inbound` | Direction of the edge from the queried node to its child: `outbound` (me→child) or `inbound` (child→me) |
| `includeChildDetails` | `boolean` | `true` | Whether to return full child node data or just the child ID |
| `maxCoParentsPerGroup` | `integer` | `50` | Cap per child group to prevent response explosion |

**Response shape** (`ICoParentsResult`):

```typescript
interface ICoParentsResult {
  /** The node whose co-parents were queried */
  readonly originNodeId: NodeId;
  /** The origin node (full data) */
  readonly originNode: IGraphNode;
  /** The edge type used for the co-parent query */
  readonly edgeType: GraphEdgeType;
  /** The direction used (outbound or inbound) */
  readonly direction: 'outbound' | 'inbound';
  /** Co-parent groups, one per shared child */
  readonly groups: readonly ICoParentGroupResult[];
  /** Total number of unique co-parent nodes across all groups */
  readonly totalCoParentCount: number;
}

interface ICoParentGroupResult {
  /** The shared child node (full or ID-only per includeChildDetails) */
  readonly child: IGraphNode;
  /** The edge type connecting origin to child */
  readonly edgeType: GraphEdgeType;
  /** The co-parent nodes for this child (excluding the origin) */
  readonly coParents: readonly IGraphNode[];
  /** Total co-parent count for this child (may exceed returned if capped) */
  readonly totalInGroup: number;
}
```

**Agent hints**: number of co-parent groups, largest group size, overlap ratio
(how many children are shared vs. total children), potential scope-overlap
warnings.

### Cypher (Neo4j)

#### When `direction = 'outbound'` (me → child)

```cypher
// Pattern: (me)-[:EDGE_TYPE]->(child)<-[:EDGE_TYPE]-(coParent)
// Used for PREREQUISITE, CAUSES
MATCH (me {nodeId: $nodeId})-[e1]->(child)
      <-[e2]-(coParent)
WHERE type(e1) = $edgeType
  AND type(e2) = $edgeType
  AND me.isDeleted = false
  AND child.isDeleted = false
  AND coParent.isDeleted = false
  AND coParent.nodeId <> $nodeId
  [AND me.userId = $userId]  // PKG only
RETURN child,
       collect(DISTINCT coParent)[0..$maxPerGroup] AS coParents,
       count(DISTINCT coParent) AS totalInGroup
ORDER BY totalInGroup DESC
```

#### When `direction = 'inbound'` (child → me)

```cypher
// Pattern: (me)<-[:EDGE_TYPE]-(child)-[:EDGE_TYPE]->(coParent)
// Used for IS_A, PART_OF, DERIVED_FROM, EXEMPLIFIES
MATCH (me {nodeId: $nodeId})<-[e1]-(child)
      -[e2]->(coParent)
WHERE type(e1) = $edgeType
  AND type(e2) = $edgeType
  AND me.isDeleted = false
  AND child.isDeleted = false
  AND coParent.isDeleted = false
  AND coParent.nodeId <> $nodeId
  [AND me.userId = $userId]  // PKG only
RETURN child,
       collect(DISTINCT coParent)[0..$maxPerGroup] AS coParents,
       count(DISTINCT coParent) AS totalInGroup
ORDER BY totalInGroup DESC
```

### Layer map

| Layer | Artefact | Method / type |
|---|---|---|
| **Value objects** | `graph.value-objects.ts` | `ICoParentsQuery`, `ICoParentsResult`, `ICoParentGroupResult` |
| **Repository interface** | `graph.repository.ts → ITraversalRepository` | `getCoParents(nodeId, query, userId?): Promise<ICoParentsResult>` |
| **Neo4j repository** | `neo4j-graph.repository.ts` | `getCoParents()` — direction-dispatched 2-hop rendezvous Cypher |
| **Cache decorator** | `cached-graph.repository.ts` | Cache key: `co-parents:{graphType}:{nodeId}:{edgeType}:{direction}` |
| **Service interface** | `knowledge-graph.service.ts` | `getCoParents(userId, nodeId, query, ctx): Promise<IServiceResult<ICoParentsResult>>` |
| **Service impl** | `knowledge-graph.service.impl.ts` | `getCoParents()` — validates node exists, validates edgeType, delegates to repo, builds agent hints |
| **Zod schemas** | `knowledge-graph.schemas.ts` | `CoParentsQueryParamsSchema`, `CoParentsResponseSchema` |
| **REST route** | `traversal.routes.ts` | `GET /co-parents/:nodeId` handler |
| **MCP tool** (Phase 9) | `kg_get_co_parents` | Wraps service method with overlap-detection agent hints |
| **Shared types** | `@noema/types → knowledge-graph/index.ts` | `ICoParentsResult`, `ICoParentGroupResult` exports |

---

## Endpoint 3: Get Neighborhood (N-Hop with Filters)

### Intuition

The N-hop query answers: *"What is reachable within N relationship steps from X,
and how is it connected?"* Different edge types carry radically different
semantics — `PREREQUISITE` neighbors are what you need to know first, `PART_OF`
neighbors are sub-topics, `EXEMPLIFIES` neighbors are concrete examples,
`CONTRADICTS` neighbors are conflicting understandings. Returning them in a flat
list loses this semantic structure.

### Edge-type grouping

Results are **grouped by the edge type connecting to the origin node**. For
`hops = 1` this is unambiguous. For `hops > 1`, a node may be reachable via
multiple paths with different first-hop edge types — it is placed in the group
of its *shortest* path's first edge.

### Dual filter modes

| Mode | Semantics | Use case |
|---|---|---|
| `full_path` | Every edge in the path from origin to the N-th hop must match the edge-type filter | Tight, semantically coherent results (e.g., "only follow prerequisite chains") |
| `immediate` | Only the first hop must match the edge-type filter; subsequent hops follow any edge type | Broader context with a semantic anchor (e.g., "what's around my prerequisites?") |

### REST API

**PKG**: `GET /api/v1/users/:userId/pkg/traversal/neighborhood/:nodeId`
**CKG**: `GET /api/v1/ckg/traversal/neighborhood/:nodeId`

**Query Parameters**:

| Param | Type | Default | Range | Description |
|---|---|---|---|---|
| `hops` | `integer` | `1` | 1–10 | Number of relationship hops |
| `edgeTypes` | `string` (csv) | all | Any `GraphEdgeType` values | Edge-type filter |
| `nodeTypes` | `string` (csv) | all | Any `GraphNodeType` values | Node-type filter |
| `filterMode` | `string` | `full_path` | `full_path`, `immediate` | How edge/node filters apply |
| `direction` | `string` | `both` | `inbound`, `outbound`, `both` | Traversal direction |
| `maxPerGroup` | `integer` | `25` | 1–100 | Max neighbors returned per edge-type group |
| `includeEdges` | `boolean` | `true` | — | Whether to return the connecting edges |

**Response shape** (`INeighborhoodResult`):

```typescript
interface INeighborhoodResult {
  /** The origin node */
  readonly originNodeId: NodeId;
  readonly originNode: IGraphNode;
  /** Results grouped by the connecting edge type */
  readonly groups: readonly IEdgeTypeNeighborGroup[];
  /** All edges in the neighborhood (for visualization), if includeEdges=true */
  readonly edges: readonly IGraphEdge[];
  /** Total unique neighbor count across all groups */
  readonly totalNeighborCount: number;
}

interface IEdgeTypeNeighborGroup {
  /** The edge type from origin (for hops=1) or the first-hop edge type */
  readonly edgeType: GraphEdgeType;
  /** Direction of this edge type relative to origin */
  readonly direction: 'inbound' | 'outbound';
  /** Neighbor nodes reachable via this edge type */
  readonly neighbors: readonly IGraphNode[];
  /** Total count (may exceed returned if capped by maxPerGroup) */
  readonly totalInGroup: number;
}
```

**Agent hints**: per-group counts, dominant edge types, hub nodes within the
neighborhood, edge-type diversity score, suggested exploration directions.

### Cypher (Neo4j) — full_path mode

```cypher
MATCH path = (origin {nodeId: $nodeId})-[rels:PREREQUISITE|PART_OF*1..$hops]-(neighbor)
WHERE all(n IN nodes(path) WHERE n.isDeleted = false)
  [AND all(n IN nodes(path)[1..] WHERE n.nodeType IN $nodeTypes)]
  [AND origin.userId = $userId]
WITH origin, neighbor, relationships(path) AS pathRels, length(path) AS dist
WITH origin, neighbor, head(pathRels) AS firstRel, dist
ORDER BY dist ASC
WITH origin, type(firstRel) AS edgeType,
     CASE WHEN startNode(firstRel) = origin THEN 'outbound' ELSE 'inbound' END AS dir,
     collect(DISTINCT neighbor)[0..$maxPerGroup] AS neighbors,
     count(DISTINCT neighbor) AS totalInGroup
RETURN edgeType, dir, neighbors, totalInGroup
```

### Cypher (Neo4j) — immediate mode

```cypher
// First hop: filtered
MATCH (origin {nodeId: $nodeId})-[r1:PREREQUISITE|PART_OF]-(hop1)
WHERE hop1.isDeleted = false [AND origin.userId = $userId]
WITH origin, hop1, r1, type(r1) AS firstEdgeType,
     CASE WHEN startNode(r1) = origin THEN 'outbound' ELSE 'inbound' END AS dir
// Subsequent hops: any edge type
OPTIONAL MATCH path = (hop1)-[*1..$remainingHops]-(further)
WHERE all(n IN nodes(path) WHERE n.isDeleted = false)
  [AND all(n IN nodes(path) WHERE n.nodeType IN $nodeTypes)]
WITH firstEdgeType, dir,
     collect(DISTINCT hop1) + collect(DISTINCT further) AS allNeighbors
UNWIND allNeighbors AS neighbor
WHERE neighbor.nodeId <> $nodeId
WITH firstEdgeType, dir,
     collect(DISTINCT neighbor)[0..$maxPerGroup] AS neighbors,
     count(DISTINCT neighbor) AS totalInGroup
RETURN firstEdgeType AS edgeType, dir, neighbors, totalInGroup
```

### Layer map

| Layer | Artefact | Method / type |
|---|---|---|
| **Value objects** | `graph.value-objects.ts` | `INeighborhoodQuery`, `INeighborhoodResult`, `IEdgeTypeNeighborGroup`, `NeighborhoodFilterMode` type |
| **Repository interface** | `graph.repository.ts → ITraversalRepository` | `getNeighborhood(nodeId, query, userId?): Promise<INeighborhoodResult>` |
| **Neo4j repository** | `neo4j-graph.repository.ts` | `getNeighborhood()` — dispatches to `full_path` or `immediate` Cypher |
| **Cache decorator** | `cached-graph.repository.ts` | Cache key: `neighborhood:{graphType}:{nodeId}:{hops}:{edgeTypes}:{nodeTypes}:{filterMode}:{direction}` |
| **Service interface** | `knowledge-graph.service.ts` | `getNeighborhood(userId, nodeId, query, ctx): Promise<IServiceResult<INeighborhoodResult>>` |
| **Service impl** | `knowledge-graph.service.impl.ts` | `getNeighborhood()` — validates node, depth bounds, delegates, builds hints |
| **Zod schemas** | `knowledge-graph.schemas.ts` | `NeighborhoodQueryParamsSchema`, `NeighborhoodResponseSchema` |
| **REST route** | `traversal.routes.ts` | `GET /neighborhood/:nodeId` handler |
| **MCP tool** (Phase 9) | `kg_get_neighborhood` | Wraps service method with richer agent hints |
| **Shared types** | `@noema/types → knowledge-graph/index.ts` | `INeighborhoodResult`, `IEdgeTypeNeighborGroup` exports |

---

## Phase 8b Endpoint × Layer Matrix

| Endpoint | REST route handler | Service method | Repository method | Neo4j Cypher | Cache key pattern |
|---|---|---|---|---|---|
| **Siblings** | `traversal.routes.ts → GET /siblings/:nodeId` | `getSiblings()` | `getSiblings()` | Direction-dispatched 2-hop rendezvous | `siblings:{gt}:{nid}:{et}:{dir}` |
| **Co-Parents** | `traversal.routes.ts → GET /co-parents/:nodeId` | `getCoParents()` | `getCoParents()` | Direction-dispatched 2-hop rendezvous (inverse) | `co-parents:{gt}:{nid}:{et}:{dir}` |
| **Neighborhood** | `traversal.routes.ts → GET /neighborhood/:nodeId` | `getNeighborhood()` | `getNeighborhood()` | Variable-length path + filter dispatch | `neighborhood:{gt}:{nid}:{h}:{et}:{nt}:{fm}:{d}` |

---

## Phase 8b Modifications to Existing Files

| File | Change |
|---|---|
| `graph.value-objects.ts` | Add `ISiblingsQuery`, `ISiblingsResult`, `ISiblingGroupResult`, `ICoParentsQuery`, `ICoParentsResult`, `ICoParentGroupResult`, `INeighborhoodQuery`, `INeighborhoodResult`, `IEdgeTypeNeighborGroup`, `NeighborhoodFilterMode` |
| `graph.repository.ts` | Add `getSiblings()`, `getCoParents()`, `getNeighborhood()` to `ITraversalRepository` |
| `neo4j-graph.repository.ts` | Implement 3 new Cypher-backed methods |
| `cached-graph.repository.ts` | Add cache wrappers for 3 new repository methods |
| `knowledge-graph.service.ts` | Add 3 new methods to `IKnowledgeGraphService` |
| `knowledge-graph.service.impl.ts` | Implement 3 methods with validation, delegation, hint builders |
| `knowledge-graph.schemas.ts` | 6 Zod schemas (3 query + 3 response) |
| `traversal.routes.ts` | 3 new PKG route handlers |
| `ckg-traversal.routes.ts` | 3 new CKG route handlers |
| `@noema/types knowledge-graph/index.ts` | Export new response types |

---

## Phase 8b Checklist

- [ ] Value objects: `ISiblingsQuery`, `ISiblingsResult`, `ISiblingGroupResult`
- [ ] Value objects: `ICoParentsQuery`, `ICoParentsResult`, `ICoParentGroupResult`
- [ ] Value objects: `INeighborhoodQuery`, `INeighborhoodResult`, `IEdgeTypeNeighborGroup`, `NeighborhoodFilterMode`
- [ ] `ITraversalRepository`: add `getSiblings()`, `getCoParents()`, `getNeighborhood()`
- [ ] `neo4j-graph.repository.ts`: implement 3 new Cypher-backed methods (direction-dispatched)
- [ ] `cached-graph.repository.ts`: cache wrappers for 3 new repository methods
- [ ] `IKnowledgeGraphService`: add 3 new methods
- [ ] `KnowledgeGraphService`: implement 3 methods with validation, delegation, hint builders
- [ ] `knowledge-graph.schemas.ts`: 6 Zod schemas (3 query + 3 response)
- [ ] `traversal.routes.ts`: 3 new PKG route handlers
- [ ] `ckg-traversal.routes.ts`: 3 new CKG route handlers
- [ ] `@noema/types`: export new response types
- [ ] Agent hints computed for all 3 endpoints
- [ ] Rate limiting: read tier (100/min) for all 3 endpoints
- [ ] Auth: PKG owner or agent; CKG any authenticated
- [ ] All queries handle soft-deleted nodes (`isDeleted = false`)
- [ ] All queries handle user scoping for PKG (`userId` parameter)
- [ ] Response size bounded by `maxSiblingsPerGroup`, `maxCoParentsPerGroup`, `maxPerGroup` parameters
- [ ] `pnpm typecheck` passes
