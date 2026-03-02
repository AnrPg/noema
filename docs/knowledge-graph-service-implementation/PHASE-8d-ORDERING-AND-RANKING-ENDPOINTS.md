# Phase 8d: Ordering & Ranking Endpoints

## Objective

Extend the knowledge-graph-service with two ordering and ranking operations —
**Prerequisite Chain** and **Centrality Ranking** — that answer questions about
optimal learning sequences and structural importance: *"In what order should I
study the prerequisites of X?"* and *"Which concepts are the most structurally
important in this domain?"*

These endpoints complete the advanced traversal surface started in Phase 8b.
This phase also introduces the remaining `graph-analysis.ts` algorithms
(topological sort, betweenness centrality, PageRank) and documents the
cross-cutting concerns (rate limiting, auth, consumer matrix, MCP tool impact)
for all eight endpoints across Phases 8b–8d.

This phase is the third and final of three additive phases (8b, 8c, 8d). See
Phase 8b for the full endpoint summary table and shared context.

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

## Endpoint 7: Get Prerequisite Chain (Topological Order)

### Intuition

Before studying `Taylor Series`, a learner must understand `Power Series`,
`Derivatives`, and `Limits` — in that order. The prerequisite chain endpoint
returns the **topologically sorted** sequence of all prerequisites for a concept,
ordered so that no concept appears before its own prerequisites. This is the
optimal study sequence.

Unlike the existing `getAncestors()` which returns a flat, unordered list, this
endpoint returns **layers** (nodes at each depth level), respects topological
ordering, and annotates each node with its mastery level so agents can identify
gaps in the prerequisite chain.

### REST API

**PKG**: `GET /api/v1/users/:userId/pkg/traversal/prerequisite-chain/:nodeId`
**CKG**: `GET /api/v1/ckg/traversal/prerequisite-chain/:nodeId`

**Query Parameters**:

| Param | Type | Default | Description |
|---|---|---|---|
| `maxDepth` | `integer` | `10` | Maximum depth of the prerequisite DAG to traverse |
| `includeIndirect` | `boolean` | `true` | Whether to include transitive prerequisites (prerequisites of prerequisites) |

**Response shape** (`IPrerequisiteChainResult`):

```typescript
interface IPrerequisiteChainResult {
  /** The target node */
  readonly targetNode: IGraphNode;
  /** Prerequisite layers, index 0 = direct prerequisites, 1 = their prerequisites, etc. */
  readonly layers: readonly IPrerequisiteLayer[];
  /** Topologically sorted flat list (study this in order) */
  readonly topologicalOrder: readonly IPrerequisiteEntry[];
  /** Total prerequisite count */
  readonly totalPrerequisites: number;
  /** Maximum chain depth */
  readonly maxChainDepth: number;
  /** Prerequisite nodes that have low mastery (gaps) — PKG only */
  readonly gaps: readonly IPrerequisiteEntry[];
}

interface IPrerequisiteLayer {
  /** Depth level (0 = direct prerequisites of target) */
  readonly depth: number;
  /** Nodes at this depth */
  readonly nodes: readonly IPrerequisiteEntry[];
}

interface IPrerequisiteEntry {
  /** The prerequisite node */
  readonly node: IGraphNode;
  /** Depth from the target node */
  readonly depth: number;
  /** Weight of the prerequisite edge (strength of dependency) */
  readonly weight: number;
  /** Whether this is a critical path node (on the longest prerequisite chain) */
  readonly isCriticalPath: boolean;
}
```

**Agent hints**: chain quality assessment (are there gaps?), whether the chain
is abnormally long (complexity warning), unmastered prerequisites sorted by
depth (study these first), critical path identification.

### Implementation approach

Uses the existing `getAncestors()` repository method with
`edgeTypes: ['prerequisite']` plus `getSubgraph()` to get the prerequisite
sub-DAG. Topological sort is performed in application code using Kahn's
algorithm (reusing the pattern from `computeDepthMap()` in
`metric-computation-context.ts`).

For the CKG variant, mastery fields and gap analysis are omitted.

### Layer map

| Layer | Artefact | Method / type |
|---|---|---|
| **Value objects** | `graph.value-objects.ts` | `IPrerequisiteChainQuery`, `IPrerequisiteChainResult`, `IPrerequisiteLayer`, `IPrerequisiteEntry` |
| **Domain utility** | `graph-analysis.ts` | `computeTopologicalPrerequisiteOrder(subgraph, targetNodeId): IPrerequisiteChainResult` |
| **Repository interface** | (reuses `getSubgraph` with `edgeTypes: [PREREQUISITE]`) | — |
| **Service interface** | `knowledge-graph.service.ts` | `getPrerequisiteChain(userId, nodeId, query, ctx): Promise<IServiceResult<IPrerequisiteChainResult>>` |
| **Service impl** | `knowledge-graph.service.impl.ts` | `getPrerequisiteChain()` — fetches prerequisite subgraph, runs topological sort, layers, gap analysis, builds hints |
| **Zod schemas** | `knowledge-graph.schemas.ts` | `PrerequisiteChainQueryParamsSchema`, `PrerequisiteChainResponseSchema` |
| **REST route** | `traversal.routes.ts` | `GET /prerequisite-chain/:nodeId` handler |
| **MCP tool** (Phase 9) | `kg_get_prerequisite_chain` | Wraps with study-order and gap-remediation hints |
| **Shared types** | `@noema/types → knowledge-graph/index.ts` | `IPrerequisiteChainResult`, `IPrerequisiteLayer`, `IPrerequisiteEntry` exports |

---

## Endpoint 8: Get Centrality Ranking

### Intuition

Some concepts are more **structurally important** than others — they are
connected to more neighbors, lie on more shortest paths, or propagate influence
more broadly. Centrality ranking surfaces these "hub" concepts, which are
valuable for:

- **Prioritized study**: high-centrality concepts provide the most learning
  leverage — mastering them unlocks the most downstream knowledge
- **Content creation**: agents should ensure high-centrality concepts have
  rich, well-curated content
- **Misconception triage**: misconceptions about high-centrality concepts have
  higher blast radius and should be remediated first
- **Graph health monitoring**: a graph with too few high-centrality nodes is
  fragmented; too many suggests a tangled structure

### Centrality algorithms

Three algorithms are supported, selectable via query parameter:

| Algorithm | What it measures | Best for |
|---|---|---|
| `degree` | Number of connections (in + out) | Finding the most connected concepts |
| `betweenness` | How often a node lies on shortest paths between others | Finding gateway/bottleneck concepts |
| `pagerank` | Recursive importance (important if connected to other important nodes) | Finding concepts with broad influence |

### REST API

**PKG**: `GET /api/v1/users/:userId/pkg/traversal/centrality`
**CKG**: `GET /api/v1/ckg/traversal/centrality`

**Query Parameters**:

| Param | Type | Default | Description |
|---|---|---|---|
| `domain` | `string` | required | Knowledge domain |
| `algorithm` | `string` | `degree` | `degree`, `betweenness`, `pagerank` |
| `edgeTypes` | `string` (csv) | all | Only consider these edge types |
| `topK` | `integer` | `10` | Number of top-ranked nodes to return |
| `normalise` | `boolean` | `true` | Whether to normalise scores to [0, 1] |

**Response shape** (`ICentralityResult`):

```typescript
interface ICentralityResult {
  /** Algorithm used */
  readonly algorithm: 'degree' | 'betweenness' | 'pagerank';
  /** Domain analyzed */
  readonly domain: string;
  /** Total nodes in the graph */
  readonly totalNodes: number;
  /** Top-K ranked nodes */
  readonly ranking: readonly ICentralityEntry[];
  /** Distribution statistics */
  readonly statistics: {
    readonly mean: number;
    readonly median: number;
    readonly standardDeviation: number;
    readonly maxScore: number;
    readonly minScore: number;
  };
}

interface ICentralityEntry {
  /** The node */
  readonly node: IGraphNode;
  /** Centrality score (normalised to [0, 1] if normalise=true) */
  readonly score: number;
  /** Rank (1-based) */
  readonly rank: number;
  /** For degree: inDegree and outDegree breakdown */
  readonly degreeBreakdown?: {
    readonly inDegree: number;
    readonly outDegree: number;
  };
}
```

**Agent hints**: hub distribution (clustered or spread?), top hub's mastery
level, whether the highest-centrality node has adequate content, recommended
priority study/content creation targets.

### Implementation approach

- **Degree centrality**: computed in a single Cypher query counting
  relationships per node — no GDS dependency
- **Betweenness centrality**: computed in application code using Brandes'
  algorithm on the in-memory subgraph (fetched via `getSubgraph`). Falls back
  to GDS `gds.betweenness.stream` if available.
- **PageRank**: computed in application code using the power iteration method
  on the in-memory adjacency matrix. Falls back to GDS `gds.pageRank.stream`
  if available.

### Cypher (Neo4j) — degree centrality

```cypher
MATCH (n:PkgNode {userId: $userId, domain: $domain})
WHERE n.isDeleted = false
OPTIONAL MATCH (n)-[rOut]->(outNeighbor)
WHERE type(rOut) IN $relTypes AND outNeighbor.isDeleted = false
OPTIONAL MATCH (inNeighbor)-[rIn]->(n)
WHERE type(rIn) IN $relTypes AND inNeighbor.isDeleted = false
WITH n,
     count(DISTINCT outNeighbor) AS outDegree,
     count(DISTINCT inNeighbor) AS inDegree,
     count(DISTINCT outNeighbor) + count(DISTINCT inNeighbor) AS totalDegree
RETURN n, totalDegree, inDegree, outDegree
ORDER BY totalDegree DESC
LIMIT $topK
```

### Layer map

| Layer | Artefact | Method / type |
|---|---|---|
| **Value objects** | `graph.value-objects.ts` | `ICentralityQuery`, `ICentralityResult`, `ICentralityEntry`, `CentralityAlgorithm` type |
| **Domain utility** | `graph-analysis.ts` | `computeDegreeCentrality(subgraph)`, `computeBetweennessCentrality(subgraph)`, `computePageRank(subgraph)` |
| **Repository interface** | `graph.repository.ts → ITraversalRepository` | `getDegreeCentrality(query, userId?): Promise<ICentralityEntry[]>` (Cypher-optimised degree path) |
| **Service interface** | `knowledge-graph.service.ts` | `getCentralityRanking(userId, query, ctx): Promise<IServiceResult<ICentralityResult>>` |
| **Service impl** | `knowledge-graph.service.impl.ts` | `getCentralityRanking()` — dispatches to Cypher (degree) or app-code (betweenness/pagerank), computes statistics, builds hints |
| **Zod schemas** | `knowledge-graph.schemas.ts` | `CentralityQueryParamsSchema`, `CentralityResponseSchema` |
| **REST route** | `traversal.routes.ts` | `GET /centrality` handler |
| **MCP tool** (Phase 9) | `kg_get_centrality_ranking` | Wraps with priority/importance-aware hints |
| **Shared types** | `@noema/types → knowledge-graph/index.ts` | `ICentralityResult`, `ICentralityEntry` exports |

---

## `graph-analysis.ts` — Complete Module Summary

A pure domain utility module (no infrastructure dependencies) containing graph
algorithms that operate on in-memory `ISubgraph` data. Phase 8c introduces the
first function; this phase adds the remaining four.

```typescript
// services/knowledge-graph-service/src/domain/knowledge-graph-service/graph-analysis.ts

// Phase 8c
export function findArticulationPoints(subgraph, edgeTypes?): IBridgeNode[];

// Phase 8d
export function computeTopologicalPrerequisiteOrder(subgraph, targetNodeId): IPrerequisiteChainResult;
export function computeDegreeCentrality(subgraph, edgeTypes?): ICentralityEntry[];
export function computeBetweennessCentrality(subgraph, edgeTypes?): ICentralityEntry[];
export function computePageRank(subgraph, edgeTypes?, iterations?, dampingFactor?): ICentralityEntry[];
```

This module has **zero infrastructure imports** — it only depends on
`@noema/types` and the local value objects. All algorithms are O(V+E) or
O(V²) at worst, operating on subgraphs that are already bounded by domain
scope and depth limits.

---

## Phase 8d Endpoint × Layer Matrix

| Endpoint | REST route handler | Service method | Repository method | Neo4j Cypher | App-code algorithm | Cache key pattern |
|---|---|---|---|---|---|---|
| **Prerequisite Chain** | `traversal.routes.ts → GET /prerequisite-chain/:nodeId` | `getPrerequisiteChain()` | (reuses `getSubgraph`) | — | Kahn's topological sort | `prereq-chain:{gt}:{nid}:{d}` |
| **Centrality** | `traversal.routes.ts → GET /centrality` | `getCentralityRanking()` | `getDegreeCentrality()` | Degree count query | Brandes / PageRank for non-degree | `centrality:{gt}:{uid}:{domain}:{algo}:{et}` |

---

## Phase 8d Modifications to Existing Files

| File | Change |
|---|---|
| `graph.value-objects.ts` | Add `IPrerequisiteChainQuery`, `IPrerequisiteChainResult`, `IPrerequisiteLayer`, `IPrerequisiteEntry`, `ICentralityQuery`, `ICentralityResult`, `ICentralityEntry`, `CentralityAlgorithm` |
| `graph.repository.ts` | Add `getDegreeCentrality()` to `ITraversalRepository` |
| `neo4j-graph.repository.ts` | Implement 1 new Cypher-backed method (degree centrality) |
| `cached-graph.repository.ts` | Add cache wrapper for 1 new repository method |
| `graph-analysis.ts` | Add `computeTopologicalPrerequisiteOrder()`, `computeDegreeCentrality()`, `computeBetweennessCentrality()`, `computePageRank()` |
| `knowledge-graph.service.ts` | Add 2 new methods to `IKnowledgeGraphService` |
| `knowledge-graph.service.impl.ts` | Implement 2 methods with validation, delegation, hint builders |
| `knowledge-graph.schemas.ts` | 4 Zod schemas (2 query + 2 response) |
| `traversal.routes.ts` | 2 new PKG route handlers |
| `ckg-traversal.routes.ts` | 2 new CKG route handlers |
| `@noema/types knowledge-graph/index.ts` | Export new response types |

---

## Cross-Cutting Concerns (All Phases 8b–8d)

### Complete Endpoint × Layer Matrix

| Endpoint | REST route handler | Service method | Repository method | Neo4j Cypher | App-code algorithm | Cache key pattern |
|---|---|---|---|---|---|---|
| **Siblings** | `GET /siblings/:nodeId` | `getSiblings()` | `getSiblings()` | Direction-dispatched 2-hop rendezvous | — | `siblings:{gt}:{nid}:{et}:{dir}` |
| **Co-Parents** | `GET /co-parents/:nodeId` | `getCoParents()` | `getCoParents()` | Direction-dispatched 2-hop rendezvous (inverse) | — | `co-parents:{gt}:{nid}:{et}:{dir}` |
| **Neighborhood** | `GET /neighborhood/:nodeId` | `getNeighborhood()` | `getNeighborhood()` | Variable-length path + filter dispatch | — | `neighborhood:{gt}:{nid}:{h}:{et}:{nt}:{fm}:{d}` |
| **Bridge Nodes** | `GET /bridges` | `getBridgeNodes()` | (reuses `getSubgraph`) | — | Tarjan's articulation points | `bridges:{gt}:{uid}:{domain}:{et}` |
| **Knowledge Frontier** | `GET /frontier` | `getKnowledgeFrontier()` | `getKnowledgeFrontier()` | Prerequisite-mastery join | — | `frontier:{uid}:{domain}:{thr}` |
| **Common Ancestors** | `GET /common-ancestors` | `getCommonAncestors()` | `getCommonAncestors()` | Ancestor intersection + LCA | — | `common-ancestors:{gt}:{a}:{b}:{et}` |
| **Prerequisite Chain** | `GET /prerequisite-chain/:nodeId` | `getPrerequisiteChain()` | (reuses `getSubgraph`) | — | Kahn's topological sort | `prereq-chain:{gt}:{nid}:{d}` |
| **Centrality** | `GET /centrality` | `getCentralityRanking()` | `getDegreeCentrality()` | Degree count query | Brandes / PageRank for non-degree | `centrality:{gt}:{uid}:{domain}:{algo}:{et}` |

### Rate Limiting

All eight endpoints are **read operations** on the graph. They follow the
Phase 8 read-tier rate limit (100/minute) with two exceptions:

| Endpoint | Tier | Reason |
|---|---|---|
| Bridge Nodes | batch/compute (10/min) | Requires full subgraph fetch + O(V+E) algorithm |
| Centrality (betweenness/pagerank) | batch/compute (10/min) | O(V²) or O(V·E) algorithms |
| Centrality (degree) | read (100/min) | Single Cypher query |

All other endpoints (Siblings, Co-Parents, Neighborhood, Frontier, Common
Ancestors, Prerequisite Chain) use the standard read tier (100/min).

### Authentication & Authorization

All endpoints follow Phase 8 patterns:

- **PKG endpoints**: authenticated user must match `:userId` or be an agent
  with appropriate permissions
- **CKG endpoints**: any authenticated user (read-only)
- **Knowledge Frontier**: PKG-only (no CKG variant — CKG has no mastery levels)

### Consumer Use-Case Matrix

| Consumer | Siblings | Co-Parents | Neighborhood | Bridges | Frontier | Ancestors | Prereq Chain | Centrality |
|---|---|---|---|---|---|---|---|---|
| **Learning Agent** | Comparative study sessions | Identify overlapping scope for integrated lessons | Rich study context, prerequisite gap detection | Identify critical concepts to prioritize | Select next concepts to study | — | Build optimal study sequence | Prioritize study by importance |
| **Socratic Tutor** | Compare/contrast questions, misconception candidates | Identify parallel parent perspectives for richer questioning | Expand questioning context | Emphasize bridge concepts in questioning | Focus questions on frontier concepts | Find shared foundations for linking questions | Sequence questions along prerequisite chain | Focus on high-centrality topics |
| **Strategy Agent** | Interleaved scheduling for discrimination | Detect curriculum overlaps, merge or split study tracks | Analyze knowledge frontier breadth | Warn about unmasterable bridge gaps | Drive scheduling algorithm | Remediate shared ancestor | Validate learning path feasibility | Allocate time to highest-impact concepts |
| **Content Service** | Resolve `knowledgeNodeIdMode: 'related'` | Detect redundant content coverage | Resolve `'subtree'` and `'prerequisites'` modes | Flag bridge concepts needing richer content | Match new content to frontier gaps | — | Content prerequisite ordering | Prioritize content creation |
| **Scheduler Service** | Interleave sibling cards (desirable difficulty) | Avoid scheduling co-parented children redundantly | PKG-aware scheduling scope | Prioritize bridge-concept card reviews | Schedule frontier cards first | — | Order card reviews by prerequisite chain | Weight review priority by centrality |
| **Calibration Agent** | Calibrate difficulty across sibling concepts | Calibrate difficulty across co-parent concepts | Calibrate across neighborhoods | — | — | Calibrate shared-ancestry concepts together | — | — |
| **Knowledge Graph Agent** | Graph quality: are siblings properly distinguished? | Detect over-parenting or redundant taxonomy | Validate neighborhood connectivity | Identify structural fragility | — | Validate hierarchical consistency | Detect over-long chains | Detect hub-monopoly or fragmentation |
| **Diagnostic Agent** | SCE remediation | Scope-overlap diagnostics | Broad structural diagnostics | Fragility assessment | Learning readiness assessment | Root-cause analysis for paired struggles | Chain quality assessment | Graph health: centrality distribution |
| **Mobile/Web App** | "Related concepts" panels | "Also covered by" panels | Interactive concept map exploration | Highlight critical path concepts in UI | "Ready to learn" recommendation | Visual common-ancestor paths | Study path visualization | "Most important" concept badges |

### Impact on MCP Tools (Phase 9)

Eight new MCP tools to add to the Phase 9 tool registry:

| Tool name | Category | Wraps endpoint | Phase | Added context vs. REST |
|---|---|---|---|---|
| `kg_get_siblings` | pkg | Siblings | 8b | SCE correlation, discrimination-learning recommendations |
| `kg_get_co_parents` | pkg | Co-Parents | 8b | Overlap-detection, curriculum-design recommendations |
| `kg_get_neighborhood` | pkg | Neighborhood | 8b | Edge-type significance weighting, exploration strategy suggestions |
| `kg_get_bridge_nodes` | pkg | Bridge Nodes | 8c | Remediation priority ordering, blast-radius analysis |
| `kg_get_knowledge_frontier` | pkg | Knowledge Frontier | 8c | Scheduling recommendations, Zone of Proximal Development alignment |
| `kg_get_common_ancestors` | pkg | Common Ancestors | 8c | Shared-foundation remediation strategy |
| `kg_get_prerequisite_chain` | pkg | Prerequisite Chain | 8d | Gap-aware study plan generation |
| `kg_get_centrality_ranking` | pkg | Centrality | 8d | Importance-weighted content/study recommendations |

Total MCP tools after Phase 9: 19 (original) + 8 (Phases 8b–8d) = **27 tools**.

---

## Complete Modifications Summary (All Phases 8b–8d)

| File | Change |
|---|---|
| `graph.repository.ts` | Add `getSiblings()`, `getCoParents()`, `getNeighborhood()`, `getKnowledgeFrontier()`, `getCommonAncestors()`, `getDegreeCentrality()` to `ITraversalRepository` |
| `neo4j-graph.repository.ts` | Implement 6 new Cypher-backed repository methods |
| `cached-graph.repository.ts` | Add cache wrappers for 6 new repository methods |
| `knowledge-graph.service.ts` | Add 8 new methods to `IKnowledgeGraphService` |
| `knowledge-graph.service.impl.ts` | Implement 8 new methods + hint builders |
| `knowledge-graph.schemas.ts` | Add 16 Zod schemas (8 query + 8 response) |
| `graph.value-objects.ts` | Add new query/result/entry interfaces and factory methods |
| `@noema/types knowledge-graph/index.ts` | Export new response types |

### New file

| File | Content |
|---|---|
| `graph-analysis.ts` | `findArticulationPoints()`, `computeTopologicalPrerequisiteOrder()`, `computeDegreeCentrality()`, `computeBetweennessCentrality()`, `computePageRank()` |

---

## Phase 8d Checklist

- [ ] Value objects: `IPrerequisiteChainQuery`, `IPrerequisiteChainResult`, `IPrerequisiteLayer`, `IPrerequisiteEntry`
- [ ] Value objects: `ICentralityQuery`, `ICentralityResult`, `ICentralityEntry`, `CentralityAlgorithm`
- [ ] `graph-analysis.ts`: add `computeTopologicalPrerequisiteOrder()`, `computeDegreeCentrality()`, `computeBetweennessCentrality()`, `computePageRank()`
- [ ] `ITraversalRepository`: add `getDegreeCentrality()`
- [ ] `neo4j-graph.repository.ts`: implement 1 new Cypher-backed method (degree centrality)
- [ ] `cached-graph.repository.ts`: cache wrapper for 1 new repository method
- [ ] `IKnowledgeGraphService`: add 2 new methods
- [ ] `KnowledgeGraphService`: implement 2 methods with validation, delegation, hint builders
- [ ] `knowledge-graph.schemas.ts`: 4 Zod schemas (2 query + 2 response)
- [ ] `traversal.routes.ts`: 2 new PKG route handlers
- [ ] `ckg-traversal.routes.ts`: 2 new CKG route handlers
- [ ] `@noema/types`: export new response types
- [ ] Agent hints computed for both endpoints
- [ ] Rate limiting: read tier (100/min) for Prerequisite Chain and degree centrality; batch/compute tier (10/min) for betweenness/pagerank centrality
- [ ] Auth: PKG owner or agent; CKG any authenticated
- [ ] All queries handle soft-deleted nodes (`isDeleted = false`)
- [ ] All queries handle user scoping for PKG (`userId` parameter)
- [ ] Response size bounded by `maxDepth`, `topK` parameters
- [ ] ADR documenting the 8 new traversal operations (covers all of 8b–8d)
- [ ] `pnpm typecheck` passes
