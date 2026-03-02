# Knowledge-Graph-Service: Comprehensive Analysis Report

**Date:** 2026-03-02 **Scope:** Test coverage gaps + cross-cutting architectural
concerns

---

## PART A: Test Coverage Gap Analysis

### A1. Source Modules With NO Tests (Prioritized by Risk/Complexity)

The test suite has **20 test files** covering 3 unit, 15 integration, and 2
contract test categories.  
The source tree has **~115 non-barrel `.ts` files** across `src/`.

| #   | Source Module                                                | Lines         | Risk         | Why It Matters                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------ | ------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `knowledge-graph.service.impl.ts`                            | 4,149         | **Critical** | The central orchestrator — zero unit tests for business logic. All interaction testing goes through integration route tests that mock the entire service. No direct unit coverage of edge-policy enforcement, staleness logic, cycle detection delegation, agent-hint generation, or changed-field tracking.              |
| 2   | `ckg-mutation-pipeline.ts`                                   | 1,212         | **Critical** | The typestate-governed async pipeline (propose→validate→prove→commit). Only the typestate machine has unit tests. The pipeline orchestration — stage sequencing, fire-and-forget behaviour, error-to-REJECTED fallback, cross-DB commit protocol, escalation flow — is completely untested at the unit/integration level. |
| 3   | `neo4j-graph.repository.ts`                                  | 2,293         | **Critical** | The only IGraphRepository implementation. The integration test file exists but **all tests are `describe.skip`** — placeholder stubs with TODO comments. No Cypher query correctness, parameterization, or mapping verification.                                                                                          |
| 4   | `graph-analysis.ts`                                          | 1,142         | **High**     | Pure algorithmic module: articulation points (Tarjan's), betweenness centrality, PageRank, topological order. Ideal for unit testing yet has zero tests. Algorithmic bugs here silently corrupt metrics, bridge-node detection, and learning-path ordering.                                                               |
| 5   | `ckg-validation-stages.ts`                                   | 973           | **High**     | All validation stage implementations (graph schema, node/edge existence, ontological consistency). No unit tests for individual stage logic.                                                                                                                                                                              |
| 6   | `ckg-validation-pipeline.ts`                                 | 101           | **Medium**   | Pipeline orchestrator for validation stages — short-circuit, ordering, composability.                                                                                                                                                                                                                                     |
| 7   | `metrics/structural-metrics-engine.ts`                       | 121           | **High**     | Routes computation to 11 metric computers. No tests for the engine dispatcher.                                                                                                                                                                                                                                            |
| 8   | `metrics/computers/*.ts` (11 files)                          | ~100-180 each | **High**     | Abstraction Drift, DCG, SLI, SCE, ULS, TBS, SDF, SSE, SAA, SSG, BSI — all pure functions with zero tests. These are the measurement basis for agent decisions.                                                                                                                                                            |
| 9   | `metrics/health/structural-health.ts`                        | 294           | **Medium**   | Health report builder.                                                                                                                                                                                                                                                                                                    |
| 10  | `metrics/health/metacognitive-stage.ts`                      | 315           | **Medium**   | Stage assessment logic.                                                                                                                                                                                                                                                                                                   |
| 11  | `metrics/health/cross-metric-patterns.ts`                    | —             | **Medium**   | Cross-metric heuristic patterns.                                                                                                                                                                                                                                                                                          |
| 12  | `metrics/graph-comparison-builder.ts`                        | 350           | **Medium**   | PKG↔CKG comparison logic.                                                                                                                                                                                                                                                                                                 |
| 13  | `misconception/misconception-detection-engine.ts`            | 54            | **Medium**   | Dispatcher to detectors.                                                                                                                                                                                                                                                                                                  |
| 14  | `misconception/detectors/structural-detector.ts`             | 371           | **High**     | Core misconception detection via graph patterns.                                                                                                                                                                                                                                                                          |
| 15  | `misconception/detectors/statistical-detector.ts`            | —             | **Medium**   | Statistical misconception detection.                                                                                                                                                                                                                                                                                      |
| 16  | `misconception/detectors/semantic-detector.ts`               | —             | **Medium**   | Semantic misconception detection.                                                                                                                                                                                                                                                                                         |
| 17  | `infrastructure/cache/cached-graph.repository.ts`            | 398           | **Medium**   | Cache decorator — invalidation correctness untested.                                                                                                                                                                                                                                                                      |
| 18  | `infrastructure/cache/kg-redis-cache.provider.ts`            | —             | **Medium**   | Redis cache operations.                                                                                                                                                                                                                                                                                                   |
| 19  | `infrastructure/database/neo4j-mapper.ts`                    | 388           | **Medium**   | All Neo4j↔domain mapping logic.                                                                                                                                                                                                                                                                                           |
| 20  | `infrastructure/database/neo4j-client.ts`                    | —             | **Low**      | Driver wrapper.                                                                                                                                                                                                                                                                                                           |
| 21  | `infrastructure/database/repositories/prisma-*.ts` (5 files) | ~150-320 each | **High**     | All Prisma repository implementations — tests are **`describe.skip`** stubs.                                                                                                                                                                                                                                              |
| 22  | `agents/tools/kg.tools.ts`                                   | 1,134         | **Medium**   | Tool definitions — contract tests exist but no execution path testing.                                                                                                                                                                                                                                                    |
| 23  | `agents/tools/tool.registry.ts`                              | 522           | **Medium**   | Tool registration and dispatch.                                                                                                                                                                                                                                                                                           |
| 24  | `api/middleware/auth.middleware.ts`                          | —             | **Medium**   | Auth middleware (partially tested via route integration tests).                                                                                                                                                                                                                                                           |
| 25  | `api/shared/route-helpers.ts`                                | 491           | **Low**      | Route helper utilities.                                                                                                                                                                                                                                                                                                   |

### A2. Tested Modules With Low Coverage / Missing Test Cases

#### Unit Tests

**`ckg-typestate.test.ts`** (370 lines) — **Good coverage** of the state machine
itself.

- ✅ Exhaustive valid/invalid transitions, terminal states, cancellable states
- ❌ Missing: `pending_review` combined flows (approve then continue, reject
  after approval attempt)

**`edge-type-policies.test.ts`** (290 lines) — **Good coverage** of policy
definitions.

- ✅ Completeness, frozen, lookup
- ❌ Missing: Policy constraint enforcement edge cases (weight boundaries at
  exact limits, source/target type combos per policy)

**`value-objects.test.ts`** (425 lines) — **Good coverage** of Zod schemas.

- ✅ Valid/invalid for CreateNode, CreateEdge, Update, Pagination schemas
- ❌ Missing: EdgeFilterSchema, branded-ID roundtrip
  (serialization/deserialization), boundary values for masteryLevel

#### Integration Tests (Route-Level)

All 13 route test files follow the same pattern: inject HTTP requests against
Fastify with a fully-mocked service.

**Systematic gaps across all route tests:**

- ❌ **Error mapping completeness**: Most tests only check one error class
  (e.g., NodeNotFoundError→404). Missing: ValidationError→400,
  CyclicEdgeError→409, OrphanEdgeError→422, InvalidEdgeTypeError→422, etc.
- ❌ **Pagination boundary tests**: No tests for `offset > total`, `limit = 0`,
  `limit > MAX_PAGE_SIZE`
- ❌ **Agent hints in response**: Most tests assert `body.metadata` is defined
  but never verify the `agentHints` structure
- ❌ **Concurrent request behaviour**: No concurrency/race-condition testing
- ❌ **CKG edge routes vs PKG edge routes distinction**: CKG routes lack
  auth-boundary tests matching PKG

**`metrics.routes.test.ts`** — 4 tests:

- ✅ GET returns metrics, POST triggers compute, 401 without auth, GET history
- ❌ Missing: 403 for wrong user on compute, staleness behaviour, error response
  format

**`misconception.routes.test.ts`** — Likely thin (not fully read but follows
pattern):

- ❌ Missing: Detection with empty pattern set, confidence threshold filtering,
  status lifecycle transitions

#### Contract Tests

**`event-contracts.test.ts`** (248 lines) — **Good structural coverage**:

- ✅ Registry completeness, naming convention, type grouping
- ❌ Missing: Payload schema validation per event type (only verifies enum
  values, not actual payload shapes)

**`tool-contracts.test.ts`** (256 lines) — **Good structural coverage**:

- ✅ Registry completeness, naming convention, required fields
- ❌ Missing: Input schema validation (tool inputs are never validated against
  actual Zod schemas), execution contract (IToolExecutionResult shape verified
  structurally, not functionally)

#### Database Integration Tests

- `neo4j-graph.repository.test.ts` — **All 6+ describes are `describe.skip`**.
  Zero actual coverage.
- `prisma-repositories.test.ts` — **All 4+ describes are `describe.skip`**. Zero
  actual coverage.
- `event-publishing.test.ts` — **All 3 describes are `describe.skip`**. Zero
  actual coverage.

### A3. Test Anti-Patterns

| #   | Anti-Pattern                                  | Location                                                                                    | Severity     | Description                                                                                                                                                                                                                                                                                                                                      |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Over-mocking / opaque service mock**        | All integration route tests                                                                 | **High**     | Every route test mocks the entire `IKnowledgeGraphService` (40+ methods). Tests verify "service was called" but not "service did the right thing." This means **zero integration of service→repository→validation chains**. A full-stack integration test with real validation + mock DB is absent.                                              |
| 2   | **Skeleton tests counted as coverage**        | `neo4j-graph.repository.test.ts`, `prisma-repositories.test.ts`, `event-publishing.test.ts` | **Critical** | Three test files with `describe.skip` blocks containing only comments. These inflate test-file count without providing any coverage. CI will report "3 test suites passed" with 0 actual assertions.                                                                                                                                             |
| 3   | **Missing assertions on response structure**  | All route tests                                                                             | **Medium**   | Most tests assert `res.statusCode` and `body.data` existence but never verify the full response envelope `{ data, metadata: { agentHints, ... } }` structure. Agent hints—a core product feature—are never validated.                                                                                                                            |
| 4   | **`Mock not configured` default pattern**     | `tests/helpers/mocks.ts`                                                                    | **Low**      | All mock methods reject with "Mock not configured" by default. This is good practice for catching missing setups, but combined with the exclusive mock-everything approach, it means any test that doesn't explicitly configure every touched method gets a confusing rejection error rather than a clear "this code path needs a mock" message. |
| 5   | **No negative-path tests for business rules** | All integration tests                                                                       | **High**     | No test verifies: cycle detection rejection, edge policy violation, weight limit enforcement, node type constraint violation, traversal depth limit, CKG immutability (no write through PKG routes).                                                                                                                                             |
| 6   | **No test isolation verification**            | `vitest.config.ts` — `shuffle: true`                                                        | **Low**      | Shuffle is enabled which is good, but without `--isolate` there's a risk of shared state between tests (particularly with `beforeAll` Fastify app setup in integration tests).                                                                                                                                                                   |
| 7   | **Flimsy fixture factories**                  | `tests/fixtures/`                                                                           | **Low**      | `resetIdCounter()` in `beforeEach` suggests fixtures use sequential IDs — acceptable but can cause test coupling if tests rely on specific ID values.                                                                                                                                                                                            |

### A4. Missing Integration/Contract Test Areas

| #   | Missing Area                          | Priority     | Description                                                                                                                                                                               |
| --- | ------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Service-layer unit tests**          | **Critical** | `KnowledgeGraphService` needs unit tests with mocked repositories testing: validation→execution→log→publish→stale flow; error propagation; agent hint correctness; changed-field diffing. |
| 2   | **CKG mutation pipeline integration** | **Critical** | End-to-end pipeline: propose→validate→prove→commit with mock repos, verifying state transitions, audit log entries, events published, and cross-DB commit handling.                       |
| 3   | **Graph algorithm unit tests**        | **High**     | `graph-analysis.ts` pure functions: PageRank convergence, betweenness with known topologies, Tarjan's on biconnected components, topological sort on DAGs with cycles.                    |
| 4   | **Metric computer unit tests**        | **High**     | Each of the 11 structural metric computers should have tests with known graph structures verifying expected metric values.                                                                |
| 5   | **Misconception detector tests**      | **High**     | Structural, statistical, and semantic detectors with known PKG↔CKG comparisons.                                                                                                           |
| 6   | **Neo4j Cypher correctness tests**    | **High**     | Testcontainers-based integration tests. Currently all stubs.                                                                                                                              |
| 7   | **Prisma repository tests**           | **High**     | Testcontainers-based. Currently all stubs.                                                                                                                                                |
| 8   | **Cache invalidation tests**          | **Medium**   | CachedGraphRepository: verify that writes invalidate the correct cache keys and reads populate cache.                                                                                     |
| 9   | **Event publishing integration**      | **Medium**   | Redis Streams integration with Testcontainers.                                                                                                                                            |
| 10  | **Cross-DB consistency tests**        | **High**     | Simulate Neo4j success + Postgres failure in commit stage; verify logged error and recoverable state.                                                                                     |
| 11  | **E2E tests**                         | **Medium**   | `tests/e2e/` is empty. No end-to-end tests exist.                                                                                                                                         |
| 12  | **Auth boundary contract tests**      | **Medium**   | Verify all CKG routes are read-only, all PKG routes enforce userId ownership, admin-only routes require admin role.                                                                       |
| 13  | **Load/performance tests**            | **Low**      | No test validates that `fetchDomainSubgraph` (which fetches 10,000 nodes) performs acceptably under load.                                                                                 |

---

## PART B: Cross-Cutting Architectural Concerns

### B1. God-Object Analysis

**File:**
[knowledge-graph.service.impl.ts](src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts)  
**Size:**
4,149 lines  
**Public methods:** 55 (`async` public methods)  
**Private methods:** ~30 (helpers, hint generators, validators)  
**Total methods:** ~85  
**Severity:** **Critical**

**Identified Responsibilities (at least 9 distinct concerns):**

| #   | Responsibility                             | Line Range (approx.) | Method Count |
| --- | ------------------------------------------ | -------------------- | ------------ |
| 1   | PKG Node CRUD                              | 197-440              | 5            |
| 2   | PKG Edge CRUD                              | 452-840              | 5            |
| 3   | PKG Traversal                              | 845-1010             | 7            |
| 4   | PKG Structural Analysis                    | 1036-1300            | 5            |
| 5   | CKG Read Operations (mirror of PKG)        | 1313-1720            | 15           |
| 6   | Structural Metrics (compute, get, history) | 1836-1985            | 3            |
| 7   | Misconception Detection & Lifecycle        | 1990-2155            | 3            |
| 8   | Structural Health & Metacognitive Stage    | 2158-2225            | 2            |
| 9   | CKG Mutation Pipeline Delegation           | 2249-2540            | 8            |
| 10  | PKG Operation Log                          | 2542-2612            | 1            |
| 11  | Agent Hint Generation                      | 2808-4149            | ~25          |
| 12  | Input Validation                           | 2630-2670            | 2            |
| 13  | Change Detection                           | 2675-2735            | 2            |
| 14  | Domain Subgraph Fetching                   | 2738-2785            | 1            |
| 15  | Metrics Staleness                          | 2786-2805            | 1            |

**Concrete fix suggestion:**

Split into at minimum **6 focused services** with a thin facade:

1. **`PkgNodeEdgeService`** — PKG CRUD operations (responsibilities 1-2)
2. **`PkgTraversalService`** — PKG traversals and structural analysis (3-4)
3. **`CkgReadService`** — CKG read-only operations (5)
4. **`MetricsService`** — Metrics computation, health, metacognitive stage (6-8)
5. **`MisconceptionService`** — Detection and lifecycle (7)
6. **`AgentHintFactory`** — Extract all `create*Hints` methods into a standalone
   class

The current `KnowledgeGraphService` would become a thin facade delegating to
these sub-services, keeping the `IKnowledgeGraphService` interface stable.

### B2. Consistency Model Issues — Dual-Write Without Transactional Guarantees

**Severity:** **Critical**

#### Finding 1: CKG Commit — Neo4j + Postgres Dual Write

**File:**
[ckg-mutation-pipeline.ts](src/domain/knowledge-graph-service/ckg-mutation-pipeline.ts#L688-L730)

The commit stage applies operations to Neo4j first, then updates Postgres state:

```
Neo4j commit → Postgres state update → Event publish
```

Lines 700-718 explicitly acknowledge the problem:

> _"CRITICAL: If this fails after Neo4j committed, we have a cross-DB
> inconsistency (Neo4j has the data, Postgres still says 'committing'). Manual
> reconciliation required."_

The only mitigation is an `ERROR` log. There is:

- No retry mechanism for the Postgres update
- No compensating transaction to roll back Neo4j
- No dead-letter queue for failed state transitions
- No reconciliation job to detect and fix inconsistencies

**Fix suggestion:** Implement an outbox pattern: write the mutation operations
to a Postgres outbox table in the same transaction as the state update, then
asynchronously apply to Neo4j. Alternatively, add: (a) Postgres state update
retry with exponential backoff, (b) a periodic reconciliation job scanning for
`committing` state mutations older than X minutes, and (c) a compensating Neo4j
rollback on Postgres failure.

#### Finding 2: PKG Write — Neo4j + Prisma (operation log + staleness) Non-Atomic

**File:**
[knowledge-graph.service.impl.ts](src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts#L197-L260)

Every PKG mutation follows:

```
Neo4j write → Prisma operation log append → Event publish → Prisma staleness mark
```

If the Prisma operation-log append fails after Neo4j succeeds, the graph has a
node/edge that the audit trail doesn't know about. The `markMetricsStale`
failure is already handled (caught and logged), but
`operationLogRepository.appendOperation` failures propagate and could leave
Neo4j in an inconsistent state vs the audit log.

**Fix suggestion:** (a) Wrap operation-log writes in try-catch like
`markMetricsStale`, with a logged warning and an eventual-consistency
reconciliation path. Or (b) adopt the outbox pattern to make all writes atomic
via Postgres first.

### B3. Observability Gaps

**Severity:** **High**

| #   | Gap                                               | Location                                                                                              | Description                                                                                                                                                                            |
| --- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **No structured error logging with correlation**  | Service impl, all error paths                                                                         | Errors are thrown but never logged with `correlationId` before propagation. The route layer presumably logs, but the domain layer loses context.                                       |
| 2   | **Missing operation duration metrics**            | Service impl, all methods                                                                             | No timing instrumentation. `computeMetrics()` (L1836-1940) fetches two subgraphs, runs 11 metric computers, saves a snapshot, and publishes events — total duration is never measured. |
| 3   | **No OpenTelemetry spans**                        | Entire service                                                                                        | No trace spans for repository calls, validation pipeline, commit protocol. Distributed tracing across Neo4j↔Postgres↔Redis is impossible.                                              |
| 4   | **Agent hint generation is opaque**               | Lines 2808-4149                                                                                       | ~1,300 lines of hint generation with no logging, no metrics on hint quality or usage, no tracing of hint computation time.                                                             |
| 5   | **Staleness mark failure silently swallowed**     | [Line 2792-2800](src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts#L2792)            | Correct that it doesn't propagate, but `logger.warn` is insufficient — should emit a metric counter for monitoring dashboards.                                                         |
| 6   | **No structured logging for CKG commit protocol** | [ckg-mutation-pipeline.ts L688-730](src/domain/knowledge-graph-service/ckg-mutation-pipeline.ts#L688) | The cross-DB inconsistency ERROR log (L707-716) doesn't include `correlationId` from the execution context.                                                                            |
| 7   | **`fetchDomainSubgraph` lacks query metrics**     | [Lines 2738-2785](src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts#L2738)           | Fetches up to 10,000 nodes and N edge queries (one per node). No logging of total node/edge count, no timing, no warning when approaching the 10K limit.                               |

**Fix suggestion:** Add OpenTelemetry tracing integration at the service layer.
Instrument repository calls, validation pipeline stages, and commit protocol
steps. Add Prometheus-style counters for: operations by type, staleness-mark
failures, hint generation time, cross-DB inconsistencies.

### B4. Naming Inconsistencies

**Severity:** **Medium**

| #   | Inconsistency                                                                                  | Location                                                                                                                                                                                                       | Details                                                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Prisma `snake_case` ↔ Domain `camelCase` implicit mapping**                                  | Prisma schema vs domain types                                                                                                                                                                                  | Prisma maps: `mutation_type` → `mutationType`, `evidence_refs` → `evidenceRefs`, etc. This is standard Prisma practice, but the mapping is implicit. No explicit mapper layer validates the transformation.                                     |
| 2   | **`edgeId` typed as `string` in delete methods but `EdgeId` elsewhere**                        | [Line 746](src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts#L746): `edgeId: string` vs [Line 639](src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts#L639): `edgeId: EdgeId` | `deleteEdge` takes `edgeId: string` and casts inline, while `getEdge` takes `EdgeId`. Should be consistent.                                                                                                                                     |
| 3   | **`sourceDomain` fallback to `'unknown'`**                                                     | [Line 796](src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts#L796)                                                                                                                            | `const sourceDomain = sourceNode?.domain ?? 'unknown'` — uses `'unknown'` as a magic string domain. This domain value will be written to the staleness table and potentially pollute metrics.                                                   |
| 4   | **CKG methods prefix vs PKG methods**                                                          | Throughout service impl                                                                                                                                                                                        | PKG: `createNode`, `getNode`, etc. CKG: `getCkgNode`, `getCkgSubgraph`, etc. This is consistent naming, but the 15 CKG methods are near-identical copies of PKG methods with `userId` removed. This is a duplicate-code smell, not just naming. |
| 5   | **`EventType` naming: `KnowledgeGraphEventType` in service, re-exported from `@noema/events`** | [Line 33](src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts#L33) vs domain-events.ts                                                                                                          | The event type enum is imported from `@noema/events` and also defined locally in `domain-events.ts`. Potential for divergence.                                                                                                                  |

### B5. Dead Code

**Severity:** **Low**

| #   | Finding                                             | Location                                                                                                                                                                       | Description                                                                                                                                                                                                                                                         |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **`_filters` unused parameter**                     | [Line 3801](src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts#L3801): `private createMutationListHints(mutations: ICkgMutation[], _filters: IMutationFilter)` | Parameter `_filters` is prefixed with underscore indicating intentional disuse, but the hints method could leverage filters to provide more contextual hints.                                                                                                       |
| 2   | **`MAX_PAGE_SIZE` not enforced on CKG list routes** | [Lines 1444-1480](src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts#L1444)                                                                                    | `listCkgEdges` applies pagination but constructs `ckgFilter` manually without enforcing `MAX_PAGE_SIZE` on the inner query — it applies via `Math.min`, so this is technically fine, but the CKG filter construction differs from PKG, suggesting copy-paste drift. |
| 3   | **`ALL_REL_TYPES` constant has only 8 types**       | [neo4j-graph.repository.ts](src/infrastructure/database/neo4j-graph.repository.ts#L87-L96)                                                                                     | The domain defines 17 edge types (per policy tests), but Neo4j only maps 8 relationship types. This may be intentional (grouping) but is undocumented and could hide missing relationship type mappings.                                                            |
| 4   | **Proof stage is entirely no-op**                   | [ckg-mutation-pipeline.ts L660-680](src/domain/knowledge-graph-service/ckg-mutation-pipeline.ts#L660)                                                                          | The PROVING→PROVEN transition auto-approves. This is documented as Phase 6 behaviour, but the two transitions (VALIDATED→PROVING→PROVEN) add latency and audit noise for zero functional benefit until TLA+ is implemented.                                         |

### B6. Performance Anti-Patterns

**Severity:** **High**

| #   | Anti-Pattern                                             | Location                                                                                                 | Impact                                                                                                                                                                                                                                                                                                                                                   |
| --- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **O(N) edge queries in `fetchDomainSubgraph`**           | [Lines 2765-2777](src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts#L2765)              | Fetches up to 10,000 nodes, then calls `getEdgesForNode()` **per node** via `Promise.all`. For a domain with 5,000 nodes this is 5,000 separate Neo4j queries. Should use a single Cypher query: `MATCH (n)-[r]->(m) WHERE n.domain = $domain`.                                                                                                          |
| 2   | **BFS-style algorithms run in application code**         | `graph-analysis.ts` (1,142 lines)                                                                        | Betweenness centrality and PageRank are O(V·E) and O(V²) algorithms running on Node.js after loading full subgraphs into memory. Should be delegated to Neo4j GDS (Graph Data Science) library which has native, parallelized implementations. The code already has a `findArticulationPointsNative()` hook but doesn't use GDS for centrality/PageRank. |
| 3   | **No pagination on `fetchDomainSubgraph`**               | [Line 2762](src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts#L2762)                    | Hardcoded `10_000` limit. For large domains, this could fetch tens of thousands of nodes and OOM the service. No circuit breaker, no streaming, no cursor-based pagination.                                                                                                                                                                              |
| 4   | **Sequential staleness + log + event after every write** | [Lines 197-260](src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts#L197-L260)            | Every PKG write does: `Neo4j write → operationLog append → event publish → staleness mark` — all sequentially `await`ed. The log/event/staleness could be parallelized: `await Promise.all([appendLog, publish, markStale])`.                                                                                                                            |
| 5   | **getPipelineHealth makes 8 sequential count queries**   | [ckg-mutation-pipeline.ts L430-445](src/domain/knowledge-graph-service/ckg-mutation-pipeline.ts#L430)    | First 6 counts run in parallel, then 3 more sequential counts for `proving`, `proven`, `committing`. Should all be in one `Promise.all` or a single SQL query with `GROUP BY state`.                                                                                                                                                                     |
| 6   | **Sort in application code for knowledge frontier**      | [Lines 1114-1148](src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts#L1114)              | After getting frontier results from Cypher (already sorted by readiness), re-sorts the entire array in JS for `centrality` or `depth` sort modes. The sort criterion (`prerequisiteReadiness`) is parsed from a string ("3/5") via `split('/')`. Should be separate fields or sorted in Cypher.                                                          |
| 7   | **No connection pooling visibility**                     | `neo4j-graph.repository.ts`                                                                              | Sessions created per-operation (documented in header), but no pool-size configuration, no connection-exhaustion guard, no metrics on pool utilization.                                                                                                                                                                                                   |
| 8   | **CKG centrality duplicates PKG centrality code**        | [Lines 1223-1300 vs 1751-1830](src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts#L1223) | Near-identical centrality computation code copy-pasted for CKG. Should be a shared `_computeCentrality(graphType, query, userId?)` private method.                                                                                                                                                                                                       |

### B7. Domain Model Issues

**Severity:** **High**

| #   | Issue                                                        | Location                                                                                                                                                                           | Description                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Anemic domain model**                                      | Entire domain layer                                                                                                                                                                | `IGraphNode` and `IGraphEdge` are data structures (interfaces) with no behaviour. All business logic (validation, policy enforcement, staleness tracking, change detection) lives in the service layer, not on the domain objects. For example, edge weight validation against policy happens in the service, not on an `Edge` entity. |
| 2   | **Business logic in hint generation**                        | [Lines 3045-3095](src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts#L3045)                                                                                        | Hint generators contain business rules (e.g., density < 0.1 means "sparse," sibling group > 10 means "high confusion entropy"). These thresholds are domain rules that should be defined in a configuration/policy layer, not hardcoded in presentation-adjacent hint methods.                                                         |
| 3   | **Service does change detection instead of domain entities** | [Lines 2675-2735](src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts#L2675)                                                                                        | `computeNodeChangedFields` and `computeEdgeChangedFields` are imperative diff functions. In a rich domain model, the entity would know its own dirty state or use a Changeset pattern.                                                                                                                                                 |
| 4   | **Validation at service boundary but not in domain**         | Throughout service impl                                                                                                                                                            | Zod schemas validate input shapes at the service entry point, but domain invariants (e.g., "mastery level must be 0-1," "edge weight must respect policy") are checked procedurally in the service method body. These should be enforced by value objects or entity constructors.                                                      |
| 5   | **CKG immutability is implicit**                             | CKG read operations                                                                                                                                                                | CKG is described as "canonical" and "read-only" in comments, but there's no type-system enforcement. The `IGraphRepository` exposes write methods, and the service simply never calls them for CKG. A separate `IReadOnlyGraphRepository` interface would make immutability explicit.                                                  |
| 6   | **Operation log entries built inline**                       | [Lines 220-236](src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts#L220), [553-567](src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts#L553), etc. | Every CRUD method manually constructs operation log objects with `sequenceNumber: 0` and `timestamp: new Date().toISOString()`. This is repeated ~8 times. Should use a factory method on a domain entity.                                                                                                                             |
| 7   | **Event publishing mixed with business logic**               | Every mutating method                                                                                                                                                              | Domain events should be raised by domain entities/aggregates, not by the application service directly. The current approach makes it impossible to guarantee that a domain event is published if and only if the business operation succeeds.                                                                                          |

---

## Summary Table

| Category            | Critical | High   | Medium | Low   |
| ------------------- | -------- | ------ | ------ | ----- |
| **A: Test Gaps**    | 4        | 6      | 4      | 2     |
| **B: Architecture** | 2        | 6      | 2      | 1     |
| **Total**           | **6**    | **12** | **6**  | **3** |

## Recommended Priority Order

1. **[Critical]** Add unit tests for `KnowledgeGraphService` — mock
   repositories, test validate→execute→log→publish→stale pipeline for each CRUD
   method
2. **[Critical]** Add unit tests for `CkgMutationPipeline` — test full pipeline
   with mock repos, especially cross-DB commit error handling
3. **[Critical]** Add unit tests for `graph-analysis.ts` — pure algorithmic
   functions with known topologies
4. **[Critical]** Address dual-write Neo4j+Postgres with outbox pattern or at
   minimum retry+reconciliation
5. **[High]** Split `KnowledgeGraphService` god-object into focused sub-services
6. **[High]** Fix `fetchDomainSubgraph` O(N) query pattern — single Cypher query
   for edges
7. **[High]** Add unit tests for all 11 metric computers
8. **[High]** Enable Neo4j/Prisma integration tests (Testcontainers) — currently
   all stubs
9. **[High]** Add OpenTelemetry tracing to critical paths
10. **[High]** Delegate centrality/PageRank computation to Neo4j GDS
