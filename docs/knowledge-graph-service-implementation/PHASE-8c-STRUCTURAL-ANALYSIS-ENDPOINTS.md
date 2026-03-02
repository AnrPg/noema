# Phase 8c: Structural Analysis Endpoints

## Objective

Extend the knowledge-graph-service with three structural analysis operations —
**Bridge Nodes**, **Knowledge Frontier**, and **Common Ancestors** — that answer
questions about the graph's macro-structure: *"Which concepts are structurally
critical?"*, *"What is the learner ready to study next?"*, and *"What
foundational knowledge do two concepts share?"*

These operations go beyond local traversal (Phase 8b) to analyse the graph as a
whole or as a region, identifying structural properties that require
algorithms beyond simple pattern matching.

This phase is the second of three additive phases (8b, 8c, 8d). See Phase 8b
for the full endpoint summary table and shared context.

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

## Endpoint 4: Get Bridge Nodes (Articulation Points)

### Intuition

A **bridge node** (articulation point) is a concept whose removal would
disconnect part of the knowledge graph. These are structurally critical — if a
learner fails to master a bridge concept, entire downstream sub-domains become
inaccessible. Identifying bridges helps agents prioritize remediation and warns
learners about concepts that are gateway prerequisites.

In learning science terms, bridges correspond to **threshold concepts** — ideas
that, once understood, open up previously inaccessible ways of thinking about a
subject.

### Semantics

Bridge detection uses Tarjan's algorithm or a Neo4j equivalent. The operation
returns nodes whose removal increases the number of connected components in the
(sub)graph, optionally filtered by edge type (e.g., bridges in the prerequisite
DAG specifically).

### REST API

**PKG**: `GET /api/v1/users/:userId/pkg/traversal/bridges`
**CKG**: `GET /api/v1/ckg/traversal/bridges`

**Query Parameters**:

| Param | Type | Default | Description |
|---|---|---|---|
| `domain` | `string` | required | Knowledge domain to analyze |
| `edgeTypes` | `string` (csv) | all | Only consider these edge types for connectivity |
| `minComponentSize` | `integer` | `2` | Minimum size of downstream component for a node to qualify as a bridge |

**Response shape** (`IBridgeNodesResult`):

```typescript
interface IBridgeNodesResult {
  /** Total nodes analyzed */
  readonly totalNodesAnalyzed: number;
  /** Identified bridge nodes, ordered by impact (largest downstream component first) */
  readonly bridges: readonly IBridgeNode[];
}

interface IBridgeNode {
  /** The bridge node */
  readonly node: IGraphNode;
  /** Number of connected components that would be created if this node were removed */
  readonly componentsCreated: number;
  /** Sizes of the downstream components that would be disconnected */
  readonly downstreamComponentSizes: readonly number[];
  /** Total nodes that would become unreachable */
  readonly totalAffectedNodes: number;
  /** The edge types through which this node is a bridge */
  readonly bridgeEdgeTypes: readonly GraphEdgeType[];
}
```

**Agent hints**: most critical bridge, whether any bridges have low mastery
(danger zone), bridge density as a graph health indicator.

### Cypher (Neo4j)

Bridge detection is not a single Cypher query — it requires running a
modified DFS (Tarjan's algorithm). Implementation strategy:

1. Fetch the full subgraph for the domain via the existing
   `getSubgraph()` method
2. Run Tarjan's articulation-point algorithm in application code on the
   in-memory adjacency list
3. For each bridge node, compute downstream component sizes via BFS

This is a deliberate design choice: Tarjan's algorithm is O(V+E) and runs
efficiently in-memory for graphs up to ~10K nodes. Pushing it to Cypher would
require APOC procedures (`apoc.algo.articulationPoints`) which introduces an
infrastructure dependency we may prefer to avoid.

**Alternatively**, if the Neo4j instance has APOC or GDS installed:

```cypher
CALL gds.articulationPoints.stream('pkgGraph')
YIELD nodeId
RETURN nodeId
```

The implementation should detect GDS availability and fall back to the
application-code path if it is not present.

### Layer map

| Layer | Artefact | Method / type |
|---|---|---|
| **Value objects** | `graph.value-objects.ts` | `IBridgeQuery`, `IBridgeNodesResult`, `IBridgeNode` |
| **Domain utility** | `graph-analysis.ts` (new) | `findArticulationPoints(subgraph, edgeTypes?): IBridgeNode[]` — Tarjan's algorithm |
| **Repository interface** | (not needed — uses existing `getSubgraph`) | — |
| **Service interface** | `knowledge-graph.service.ts` | `getBridgeNodes(userId, query, ctx): Promise<IServiceResult<IBridgeNodesResult>>` |
| **Service impl** | `knowledge-graph.service.impl.ts` | `getBridgeNodes()` — fetches subgraph, runs Tarjan's, computes component sizes, builds hints |
| **Zod schemas** | `knowledge-graph.schemas.ts` | `BridgeQueryParamsSchema`, `BridgeNodesResponseSchema` |
| **REST route** | `traversal.routes.ts` | `GET /bridges` handler |
| **MCP tool** (Phase 9) | `kg_get_bridge_nodes` | Wraps service method with remediation priority hints |
| **Shared types** | `@noema/types → knowledge-graph/index.ts` | `IBridgeNodesResult`, `IBridgeNode` exports |

---

## Endpoint 5: Get Knowledge Frontier

### Intuition

The **knowledge frontier** is the boundary between what a learner has mastered
and what remains unmastered. Formally, it is the set of nodes where:

- The node itself has **low mastery** (below a threshold), AND
- At least one of its prerequisite parents has **high mastery** (above a
  threshold)

These are the nodes the learner is *ready* to learn next — they have the
foundational knowledge but haven't yet acquired the target concept. This is the
optimal set for scheduling new study material.

Conversely, **deep frontier** nodes are unmastered nodes whose prerequisites are
*also* unmastered — studying these would be premature.

### REST API

**PKG**: `GET /api/v1/users/:userId/pkg/traversal/frontier`
(CKG variant is not applicable — CKG has no mastery levels)

**Query Parameters**:

| Param | Type | Default | Description |
|---|---|---|---|
| `domain` | `string` | required | Knowledge domain |
| `masteryThreshold` | `number` | `0.7` | Mastery level above which a node is considered "mastered" |
| `maxResults` | `integer` | `20` | Maximum frontier nodes to return |
| `sortBy` | `string` | `readiness` | `readiness` (prerequisite mastery avg), `centrality` (degree), `depth` (prerequisite depth) |
| `includePrerequisites` | `boolean` | `false` | Whether to also return each frontier node's mastered prerequisites |

**Response shape** (`IKnowledgeFrontierResult`):

```typescript
interface IKnowledgeFrontierResult {
  /** Knowledge domain analyzed */
  readonly domain: string;
  /** Mastery threshold used */
  readonly masteryThreshold: number;
  /** Frontier nodes — ready to learn next */
  readonly frontier: readonly IFrontierNode[];
  /** Summary statistics */
  readonly summary: {
    readonly totalMastered: number;
    readonly totalUnmastered: number;
    readonly totalFrontier: number;
    readonly totalDeepUnmastered: number; // unmastered with unmastered prereqs
    readonly masteryPercentage: number;   // mastered / total
  };
}

interface IFrontierNode {
  /** The frontier node */
  readonly node: IGraphNode;
  /** Average mastery of its prerequisite parents */
  readonly prerequisiteMasteryAvg: number;
  /** Number of mastered prerequisites / total prerequisites */
  readonly prerequisiteReadiness: string; // e.g. "3/4"
  /** Readiness score (0-1): how prepared the learner is for this concept */
  readonly readinessScore: number;
  /** Mastered prerequisites (if includePrerequisites=true) */
  readonly masteredPrerequisites?: readonly IGraphNode[];
}
```

**Agent hints**: recommended next-study nodes, whether the frontier is broad
(many ready options) or narrow (bottleneck), overall mastery coverage percentage.

### Cypher (Neo4j)

```cypher
// Find unmastered nodes with at least one mastered prerequisite
MATCH (node:PkgNode {userId: $userId, domain: $domain})
WHERE node.isDeleted = false
  AND (node.masteryLevel IS NULL OR node.masteryLevel < $threshold)
OPTIONAL MATCH (node)-[:PREREQUISITE]->(prereq:PkgNode {userId: $userId})
WHERE prereq.isDeleted = false
WITH node,
     collect(prereq) AS prereqs,
     [p IN collect(prereq) WHERE p.masteryLevel >= $threshold] AS masteredPrereqs
WHERE size(masteredPrereqs) > 0 OR size(prereqs) = 0
RETURN node,
       size(masteredPrereqs) AS masteredCount,
       size(prereqs) AS totalPrereqs,
       CASE WHEN size(prereqs) = 0 THEN 1.0
            ELSE toFloat(size(masteredPrereqs)) / size(prereqs)
       END AS readinessScore
ORDER BY readinessScore DESC
LIMIT $maxResults
```

### Layer map

| Layer | Artefact | Method / type |
|---|---|---|
| **Value objects** | `graph.value-objects.ts` | `IFrontierQuery`, `IKnowledgeFrontierResult`, `IFrontierNode` |
| **Repository interface** | `graph.repository.ts → ITraversalRepository` | `getKnowledgeFrontier(query, userId): Promise<IKnowledgeFrontierResult>` |
| **Neo4j repository** | `neo4j-graph.repository.ts` | `getKnowledgeFrontier()` — Cypher prerequisite-mastery join |
| **Cache decorator** | `cached-graph.repository.ts` | Cache key: `frontier:{userId}:{domain}:{threshold}` (short TTL — mastery changes frequently) |
| **Service interface** | `knowledge-graph.service.ts` | `getKnowledgeFrontier(userId, query, ctx): Promise<IServiceResult<IKnowledgeFrontierResult>>` |
| **Service impl** | `knowledge-graph.service.impl.ts` | `getKnowledgeFrontier()` — validates domain, delegates, computes summary stats, builds hints |
| **Zod schemas** | `knowledge-graph.schemas.ts` | `FrontierQueryParamsSchema`, `FrontierResponseSchema` |
| **REST route** | `traversal.routes.ts` | `GET /frontier` handler |
| **MCP tool** (Phase 9) | `kg_get_knowledge_frontier` | Wraps with scheduling-aware agent hints |
| **Shared types** | `@noema/types → knowledge-graph/index.ts` | `IKnowledgeFrontierResult`, `IFrontierNode` exports |

---

## Endpoint 6: Get Common Ancestors

### Intuition

Given two concepts, their **common ancestors** reveal their shared foundational
knowledge. If a learner struggles with both `Fourier Series` and `Laplace
Transform`, finding that both share the ancestor `Complex Analysis` via
prerequisite chains tells the agent to remediate `Complex Analysis` rather than
addressing each concept independently.

This operation is also valuable for content generation: when creating linking
exercises or comparison questions, the common ancestor defines the abstraction
level at which the comparison makes sense.

### Semantics

Common ancestors are found by traversing `PREREQUISITE`, `IS_A`, or `PART_OF`
edges (configurable) from both source nodes and computing the intersection. The
**Lowest Common Ancestor (LCA)** — the ancestor closest to both nodes — is
highlighted as the primary result.

### REST API

**PKG**: `GET /api/v1/users/:userId/pkg/traversal/common-ancestors`
**CKG**: `GET /api/v1/ckg/traversal/common-ancestors`

**Query Parameters**:

| Param | Type | Default | Description |
|---|---|---|---|
| `nodeIdA` | `string` | required | First node |
| `nodeIdB` | `string` | required | Second node |
| `edgeTypes` | `string` (csv) | `prerequisite,is_a,part_of` | Edge types to traverse for ancestry |
| `maxDepth` | `integer` | `10` | Maximum depth for ancestor search |

**Response shape** (`ICommonAncestorsResult`):

```typescript
interface ICommonAncestorsResult {
  /** The two query nodes */
  readonly nodeA: IGraphNode;
  readonly nodeB: IGraphNode;
  /** The Lowest Common Ancestor(s) — closest shared ancestor(s) */
  readonly lowestCommonAncestors: readonly IGraphNode[];
  /** All common ancestors, ordered by depth from nodes (shallowest first) */
  readonly allCommonAncestors: readonly ICommonAncestorEntry[];
  /** Whether the two nodes are directly connected (no common ancestor needed) */
  readonly directlyConnected: boolean;
  /** Path from nodeA to LCA (if exists) */
  readonly pathFromA: readonly IGraphNode[];
  /** Path from nodeB to LCA (if exists) */
  readonly pathFromB: readonly IGraphNode[];
}

interface ICommonAncestorEntry {
  /** The ancestor node */
  readonly node: IGraphNode;
  /** Depth from nodeA to this ancestor */
  readonly depthFromA: number;
  /** Depth from nodeB to this ancestor */
  readonly depthFromB: number;
  /** Sum of depths (lower = closer = more relevant as LCA) */
  readonly combinedDepth: number;
}
```

**Agent hints**: whether the LCA has high mastery (foundational understanding
exists), whether the LCA is a bridge node, suggested study order from LCA to
target nodes.

### Cypher (Neo4j)

```cypher
// Find ancestors of both nodes and compute intersection
MATCH pathA = (a {nodeId: $nodeIdA})-[:PREREQUISITE|IS_A|PART_OF*1..$maxDepth]->(ancestorA)
WHERE ancestorA.isDeleted = false [AND a.userId = $userId]
WITH collect(DISTINCT {node: ancestorA, depth: length(pathA)}) AS ancestorsA

MATCH pathB = (b {nodeId: $nodeIdB})-[:PREREQUISITE|IS_A|PART_OF*1..$maxDepth]->(ancestorB)
WHERE ancestorB.isDeleted = false [AND b.userId = $userId]
WITH ancestorsA, collect(DISTINCT {node: ancestorB, depth: length(pathB)}) AS ancestorsB

// Compute intersection
UNWIND ancestorsA AS entryA
UNWIND ancestorsB AS entryB
WHERE entryA.node.nodeId = entryB.node.nodeId
RETURN entryA.node AS ancestor,
       entryA.depth AS depthFromA,
       entryB.depth AS depthFromB,
       entryA.depth + entryB.depth AS combinedDepth
ORDER BY combinedDepth ASC
```

### Layer map

| Layer | Artefact | Method / type |
|---|---|---|
| **Value objects** | `graph.value-objects.ts` | `ICommonAncestorsQuery`, `ICommonAncestorsResult`, `ICommonAncestorEntry` |
| **Repository interface** | `graph.repository.ts → ITraversalRepository` | `getCommonAncestors(nodeIdA, nodeIdB, query, userId?): Promise<ICommonAncestorsResult>` |
| **Neo4j repository** | `neo4j-graph.repository.ts` | `getCommonAncestors()` — Cypher ancestor intersection + LCA extraction |
| **Cache decorator** | `cached-graph.repository.ts` | Cache key: `common-ancestors:{graphType}:{nodeIdA}:{nodeIdB}:{edgeTypes}` |
| **Service interface** | `knowledge-graph.service.ts` | `getCommonAncestors(userId, nodeIdA, nodeIdB, query, ctx): Promise<IServiceResult<ICommonAncestorsResult>>` |
| **Service impl** | `knowledge-graph.service.impl.ts` | `getCommonAncestors()` — validates both nodes exist, delegates, builds hints |
| **Zod schemas** | `knowledge-graph.schemas.ts` | `CommonAncestorsQueryParamsSchema`, `CommonAncestorsResponseSchema` |
| **REST route** | `traversal.routes.ts` | `GET /common-ancestors` handler |
| **MCP tool** (Phase 9) | `kg_get_common_ancestors` | Wraps with remediation hints |
| **Shared types** | `@noema/types → knowledge-graph/index.ts` | `ICommonAncestorsResult`, `ICommonAncestorEntry` exports |

---

## New Artefact: `graph-analysis.ts` (Partial)

This phase introduces the `graph-analysis.ts` module with its first algorithm.
Phase 8d adds the remaining algorithms.

```typescript
// services/knowledge-graph-service/src/domain/knowledge-graph-service/graph-analysis.ts

export function findArticulationPoints(subgraph, edgeTypes?): IBridgeNode[];
// Tarjan's algorithm for articulation point detection
// O(V+E) — operates on in-memory ISubgraph adjacency list
```

This module has **zero infrastructure imports** — it only depends on
`@noema/types` and the local value objects.

---

## Phase 8c Endpoint × Layer Matrix

| Endpoint | REST route handler | Service method | Repository method | Neo4j Cypher | App-code algorithm | Cache key pattern |
|---|---|---|---|---|---|---|
| **Bridge Nodes** | `traversal.routes.ts → GET /bridges` | `getBridgeNodes()` | (reuses `getSubgraph`) | — | Tarjan's articulation points | `bridges:{gt}:{uid}:{domain}:{et}` |
| **Knowledge Frontier** | `traversal.routes.ts → GET /frontier` | `getKnowledgeFrontier()` | `getKnowledgeFrontier()` | Prerequisite-mastery join | — | `frontier:{uid}:{domain}:{thr}` |
| **Common Ancestors** | `traversal.routes.ts → GET /common-ancestors` | `getCommonAncestors()` | `getCommonAncestors()` | Ancestor intersection + LCA | — | `common-ancestors:{gt}:{a}:{b}:{et}` |

---

## Phase 8c Modifications to Existing Files

| File | Change |
|---|---|
| `graph.value-objects.ts` | Add `IBridgeQuery`, `IBridgeNodesResult`, `IBridgeNode`, `IFrontierQuery`, `IKnowledgeFrontierResult`, `IFrontierNode`, `ICommonAncestorsQuery`, `ICommonAncestorsResult`, `ICommonAncestorEntry` |
| `graph.repository.ts` | Add `getKnowledgeFrontier()`, `getCommonAncestors()` to `ITraversalRepository` |
| `neo4j-graph.repository.ts` | Implement 2 new Cypher-backed methods (frontier, common ancestors) |
| `cached-graph.repository.ts` | Add cache wrappers for 2 new repository methods |
| `knowledge-graph.service.ts` | Add 3 new methods to `IKnowledgeGraphService` |
| `knowledge-graph.service.impl.ts` | Implement 3 methods with validation, delegation, hint builders |
| `knowledge-graph.schemas.ts` | 6 Zod schemas (3 query + 3 response) |
| `traversal.routes.ts` | 3 new PKG route handlers |
| `ckg-traversal.routes.ts` | 2 new CKG route handlers (all except Frontier) |
| `@noema/types knowledge-graph/index.ts` | Export new response types |

### New file

| File | Content |
|---|---|
| `graph-analysis.ts` | `findArticulationPoints()` — Tarjan's algorithm |

---

## Phase 8c Checklist

- [ ] Value objects: `IBridgeQuery`, `IBridgeNodesResult`, `IBridgeNode`
- [ ] Value objects: `IFrontierQuery`, `IKnowledgeFrontierResult`, `IFrontierNode`
- [ ] Value objects: `ICommonAncestorsQuery`, `ICommonAncestorsResult`, `ICommonAncestorEntry`
- [ ] New file: `graph-analysis.ts` with `findArticulationPoints()` (Tarjan's algorithm)
- [ ] `ITraversalRepository`: add `getKnowledgeFrontier()`, `getCommonAncestors()`
- [ ] `neo4j-graph.repository.ts`: implement 2 new Cypher-backed methods
- [ ] `cached-graph.repository.ts`: cache wrappers for 2 new repository methods
- [ ] `IKnowledgeGraphService`: add 3 new methods
- [ ] `KnowledgeGraphService`: implement 3 methods with validation, delegation, hint builders
- [ ] `knowledge-graph.schemas.ts`: 6 Zod schemas (3 query + 3 response)
- [ ] `traversal.routes.ts`: 3 new PKG route handlers
- [ ] `ckg-traversal.routes.ts`: 2 new CKG route handlers (all except Frontier)
- [ ] `@noema/types`: export new response types
- [ ] Agent hints computed for all 3 endpoints
- [ ] Rate limiting: read tier (100/min) for Frontier and Common Ancestors; batch/compute tier (10/min) for Bridge Nodes
- [ ] Auth: PKG owner or agent; CKG any authenticated; Frontier is PKG-only
- [ ] All queries handle soft-deleted nodes (`isDeleted = false`)
- [ ] All queries handle user scoping for PKG (`userId` parameter)
- [ ] Response size bounded by `maxResults`, `minComponentSize` parameters
- [ ] `pnpm typecheck` passes
