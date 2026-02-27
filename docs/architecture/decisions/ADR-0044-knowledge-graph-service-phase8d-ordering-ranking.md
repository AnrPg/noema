# ADR-0044: Knowledge Graph Service Phase 8d — Ordering & Ranking Endpoints

**Status:** Accepted **Date:** 2025-01-28 **Deciders:** Architecture Team
**Relates to:** ADR-0040, ADR-0041, ADR-0042, ADR-0043,
PHASE-8d-ORDERING-AND-RANKING-ENDPOINTS.md

## Context

Phases 8b–8c shipped relational traversal primitives and structural analysis
endpoints. The graph API still lacks **ordering and ranking** endpoints that
agents need for learning-sequence optimization and concept importance ranking:
prerequisite chain computation and centrality ranking.

Phase 8d adds two new ordering/ranking endpoints, each for both PKG and CKG:

| Endpoint               | PKG Route                                                     | CKG Route                                       |
| ---------------------- | ------------------------------------------------------------- | ----------------------------------------------- |
| **Prerequisite Chain** | `GET /users/:userId/pkg/traversal/prerequisite-chain/:nodeId` | `GET /ckg/traversal/prerequisite-chain/:nodeId` |
| **Centrality Ranking** | `GET /users/:userId/pkg/traversal/centrality`                 | `GET /ckg/traversal/centrality`                 |

4 route handlers total (2 PKG + 2 CKG). This phase completes the advanced
traversal surface started in Phase 8b.

## Decision

### D1: Prerequisite Chain — Kahn's Topological Sort with Critical Path

Prerequisite chain computation uses Kahn's topological sort algorithm on the
in-memory subgraph. The implementation:

1. Fetches the domain subgraph (reusing `getDomainSubgraph()` from Phase 8c)
2. Builds a directed adjacency list from the subgraph edges
3. Runs iterative BFS from the target node to discover reachable prerequisites
4. Applies Kahn's algorithm for topological ordering
5. Identifies the critical path (longest dependency chain) via backtracking
6. Groups nodes into layers by depth from the target
7. Detects gaps — unmastered nodes with no prerequisites (PKG only)

The algorithm runs in `graph-analysis.ts` as a pure domain function
(`computeTopologicalPrerequisiteOrder`) with zero infrastructure imports.

### D2: Centrality Ranking — Three Algorithms with Repository + App-Code Split

Centrality ranking supports three algorithms via the `algorithm` query param:

| Algorithm     | Implementation                | Complexity |
| ------------- | ----------------------------- | ---------- |
| `degree`      | Neo4j Cypher (repository)     | O(V)       |
| `betweenness` | Brandes' algorithm (app-code) | O(V·E)     |
| `pagerank`    | Power iteration (app-code)    | O(k·E)     |

**Degree centrality** dispatches to the repository (`getDegreeCentrality()`) for
a Cypher query that counts in-degree and out-degree per node. This is efficient
and avoids fetching the full subgraph.

**Betweenness and PageRank** fetch the domain subgraph (reusing
`getDomainSubgraph()`) and run in application code via `graph-analysis.ts`. This
allows complex algorithms without Neo4j GDS dependency.

All three paths normalize results through `normaliseCentralityResults()` which
computes statistics (mean, median, standard deviation, skewness, kurtosis, min,
max) and ranks entries by score.

### D3: GRAPH_ANALYSIS_DEFAULTS — Static Constants for Configurable Values

A frozen constants object (`GRAPH_ANALYSIS_DEFAULTS`) centralizes configurable
thresholds used across Phases 8c and 8d:

| Constant                         | Value    | Purpose                                    |
| -------------------------------- | -------- | ------------------------------------------ |
| `MASTERY_THRESHOLD`              | 0.7      | Gap analysis threshold                     |
| `PREREQUISITE_MAX_DEPTH`         | 10       | Max depth for prerequisite chain traversal |
| `CENTRALITY_TOP_K`               | 10       | Default top-K for centrality queries       |
| `PAGERANK_DAMPING_FACTOR`        | 0.85     | PageRank damping factor                    |
| `PAGERANK_MAX_ITERATIONS`        | 20       | PageRank convergence iterations            |
| `PAGERANK_CONVERGENCE_THRESHOLD` | 1e-6     | PageRank L1 norm threshold                 |
| `DEFAULT_EDGE_WEIGHT`            | 1.0      | Default weight when edge has none          |
| `MIN_COMPONENT_SIZE`             | 2        | Min component size for bridge detection    |
| `DEFAULT_ALGORITHM`              | 'degree' | Default centrality algorithm               |

### D4: Extended Statistics — Skewness and Kurtosis

Centrality statistics include skewness and kurtosis alongside mean, median,
standard deviation, min, and max. This enables agents to assess score
distribution shape:

- **Skewness**: positive values indicate a few highly-central hub nodes
- **Kurtosis**: high values indicate heavy tails (extreme outliers)

The `computeStatistics()` helper in `graph-analysis.ts` computes all seven
metrics in a single pass over the score array.

### D5: Repository Layer — 1 New Method on ITraversalRepository

| Method                  | Purpose                                          |
| ----------------------- | ------------------------------------------------ |
| `getDegreeCentrality()` | Cypher in/out degree counts per node in a domain |

Prerequisite chain and betweenness/PageRank centrality reuse the existing
`getDomainSubgraph()` method from Phase 8c.

### D6: Cache Strategy — Degree Centrality with Standard TTL

- **Degree centrality**: Standard `queryTtl` via cache decorator (structural
  data)
- **Betweenness / PageRank**: Computed in application code from cached subgraph
- **Prerequisite chain**: Computed in application code from cached subgraph

Cache key for degree centrality:
`centrality-degree:${userKey}:${domain}:${etKey}`.

### D7: graph-analysis.ts — 5 New Algorithms

Extended with five new exported functions (added to the module created in Phase
8c):

- `buildDirectedAdjacencyList()` — directed edge map builder
- `computeTopologicalPrerequisiteOrder()` — Kahn's topological sort + critical
  path
- `computeDegreeCentrality()` — in-memory degree counting (fallback for non-repo
  path)
- `computeBetweennessCentrality()` — Brandes' algorithm O(V·E)
- `computePageRank()` — power iteration with configurable damping + convergence
- `normaliseCentralityResults()` — score normalization, ranking, statistics
- `computeStatistics()` — mean, median, stddev, skewness, kurtosis, min, max

Internal helper: `buildDirectedAdjacencyList()`.

### D8: Service Layer — 4 Methods + 2 Hint Builders

PKG: `getPrerequisiteChain()`, `getCentralityRanking()` CKG:
`getCkgPrerequisiteChain()`, `getCkgCentralityRanking()`

Each method validates inputs, computes results (via repo or app-code
algorithms), and returns `IServiceResult<T>` with `IAgentHints`. Two new hint
builders provide contextual suggestions:

- `createPrerequisiteChainHints()`: study-order recommendations, gap alerts,
  critical path depth
- `createCentralityHints()`: top-ranked node identification, centrality
  distribution insights, algorithm-specific observations

### D9: Value Objects — 8 Interfaces + 2 Factories

| Type                      | Factory                           | Key Defaults                          |
| ------------------------- | --------------------------------- | ------------------------------------- |
| `IPrerequisiteChainQuery` | `PrerequisiteChainQuery.create()` | `maxDepth: 10, includeIndirect: true` |
| `ICentralityQuery`        | `CentralityQuery.create()`        | `algorithm: degree, topK: 10`         |

Result types: `IPrerequisiteEntry`, `IPrerequisiteLayer`,
`IPrerequisiteChainResult`, `ICentralityEntry`, `ICentralityStatistics`,
`ICentralityResult`.

`CentralityAlgorithm` type: `'degree' | 'betweenness' | 'pagerank'`.

## Consequences

- **4 new route handlers** (2 PKG + 2 CKG) for ordering and ranking
- **1 new repository method** (`getDegreeCentrality`) on `ITraversalRepository`
  - corresponding Neo4j, transactional, and cache implementations
- **7 new algorithms** in `graph-analysis.ts` (~680 lines added)
- **GRAPH_ANALYSIS_DEFAULTS** provides centralized, frozen configuration
  constants for all Phase 8c–8d algorithms
- **Extended statistics** with skewness and kurtosis for distribution analysis
- **@noema/types** exports 7 new interfaces for cross-package use
- **Pre-existing TS errors** (7) unchanged — not related to Phase 8d
- **Phase 8d completes** the advanced traversal surface (Phases 8b–8d)
