# ADR-0043: Knowledge Graph Service Phase 8c — Structural Analysis Endpoints

**Status:** Accepted **Date:** 2025-01-28 **Deciders:** Architecture Team
**Relates to:** ADR-0040, ADR-0041, ADR-0042,
PHASE-8c-STRUCTURAL-ANALYSIS-ENDPOINTS.md

## Context

Phases 8–8b shipped relational traversal primitives (subgraph, path, siblings,
co-parents, neighborhood). The graph API still lacks **structural analysis**
endpoints that agents need for curriculum planning and graph health assessment:
bridge node detection, knowledge frontier identification, and common ancestor
computation.

Phase 8c adds three new structural analysis endpoints:

| Endpoint               | PKG Route                                           | CKG Route                             |
| ---------------------- | --------------------------------------------------- | ------------------------------------- |
| **Bridge Nodes**       | `GET /users/:userId/pkg/traversal/bridges`          | `GET /ckg/traversal/bridges`          |
| **Knowledge Frontier** | `GET /users/:userId/pkg/traversal/frontier`         | _(PKG-only — CKG has no mastery)_     |
| **Common Ancestors**   | `GET /users/:userId/pkg/traversal/common-ancestors` | `GET /ckg/traversal/common-ancestors` |

5 route handlers total (3 PKG + 2 CKG).

## Decision

### D1: Bridge Nodes — GDS Detection with Tarjan Fallback

Bridge detection uses a two-tier strategy:

1. **GDS path**: `findArticulationPointsNative()` on `ITraversalRepository`
   checks Neo4j GDS availability (cached boolean via `gds.version()`). If
   available, projects a domain subgraph into GDS and runs
   `gds.articulationPoints.stream()`. Returns `NodeId[]` or `null`.

2. **Fallback path**: `findArticulationPoints()` in the new `graph-analysis.ts`
   module runs iterative Tarjan's algorithm O(V+E) on the in-memory subgraph.
   Uses a stack-based iterative DFS to avoid call-stack overflow on large
   graphs.

Both paths require `getDomainSubgraph()` — a new repo method that fetches ALL
nodes and edges in a domain (not rooted at a single node like `getSubgraph()`).
This is needed for component-size analysis after virtual node removal.

Domain is **required** — analyzing the entire graph is unbounded and the results
are less actionable for learning science.

### D2: Knowledge Frontier — Cypher with Application-Code Re-Sort

The frontier query runs in Cypher: join prerequisite edges with mastery levels,
filter for unmastered nodes with mastered prerequisites, compute readiness
scores. The Cypher always sorts by `readiness` (default).

Alternative sort modes (`centrality`, `depth`) are implemented as application-
code re-sorts on the Cypher result set. This keeps the Cypher simple while
supporting all three `FrontierSortBy` modes.

Frontier is PKG-only — the CKG has no mastery levels.

### D3: Common Ancestors — Cypher Variable-Length Paths

Common ancestor detection uses Cypher `MATCH (n)-[:TYPE*1..maxDepth]->(a)` for
both nodes, collects ancestor sets, intersects them, and identifies the LCA
(minimum combined depth). Path reconstruction uses `shortestPath()`.

### D4: Repository Layer — 4 New Methods on ITraversalRepository

| Method                           | Purpose                                            |
| -------------------------------- | -------------------------------------------------- |
| `getDomainSubgraph()`            | Fetch all nodes + edges in a domain (for Tarjan's) |
| `findArticulationPointsNative()` | GDS articulation points (returns null if no GDS)   |
| `getKnowledgeFrontier()`         | Cypher frontier detection + summary stats          |
| `getCommonAncestors()`           | Cypher ancestor intersection + LCA + paths         |

### D5: Cache Strategy — Real Caching with Short TTL for Frontier

- **Frontier**: 60-second TTL (mastery changes frequently)
- **Domain subgraph, Common ancestors**: Standard `queryTtl` (structural data)
- **GDS articulation points**: Pass-through (GDS availability cached internally)

Cache keys include user ID, domain, edge types (sorted), and query parameters.
Node IDs in common-ancestor cache keys are sorted for consistency.

### D6: graph-analysis.ts — Pure Domain Algorithm Module

New module with zero infrastructure imports. Contains:

- `findArticulationPoints(subgraph, edgeTypes?, minComponentSize)` — Tarjan's +
  BFS component sizing
- `buildBridgeNodesFromIds(subgraph, apIds, edgeTypes?, minComponentSize)` —
  compute metrics from GDS-provided AP IDs

Internal helpers: `buildAdjacencyList()`, `tarjanArticulationPoints()`,
`computeComponentSizesWithout()`, `findBridgeEdgeTypes()`, `countComponents()`.

### D7: Service Layer — 5 Methods + 3 Hint Builders

PKG: `getBridgeNodes()`, `getKnowledgeFrontier()`, `getCommonAncestors()` CKG:
`getCkgBridgeNodes()`, `getCkgCommonAncestors()`

Each method validates inputs, delegates to the repository, and returns
`IServiceResult<T>` with `IAgentHints`. Three new hint builders provide
contextual suggestions (reinforce bridges, study next frontier concept, explore
common ancestors).

### D8: Value Objects — 9 Interfaces + 3 Factories

| Type                    | Factory                         | Key Defaults                                             |
| ----------------------- | ------------------------------- | -------------------------------------------------------- |
| `IBridgeQuery`          | `BridgeQuery.create()`          | `minComponentSize: 2`                                    |
| `IFrontierQuery`        | `FrontierQuery.create()`        | `threshold: 0.7, maxResults: 20`                         |
| `ICommonAncestorsQuery` | `CommonAncestorsQuery.create()` | `maxDepth: 10, edgeTypes: [prerequisite, is_a, part_of]` |

Result types: `IBridgeNode`, `IBridgeNodesResult`, `IFrontierNode`,
`IFrontierSummary`, `IKnowledgeFrontierResult`, `ICommonAncestorEntry`,
`ICommonAncestorsResult`.

## Consequences

- **5 new route handlers** (3 PKG + 2 CKG) for structural analysis
- **4 new repository methods** on `ITraversalRepository` + corresponding Neo4j,
  transactional, and cache implementations
- **New `graph-analysis.ts`** module with Tarjan's algorithm (452 lines)
- **GDS-aware**: automatically uses Neo4j GDS if available, degrades gracefully
- **@noema/types** exports 7 new interfaces for cross-package use
- **Pre-existing TS errors** (7) unchanged — not related to Phase 8c
