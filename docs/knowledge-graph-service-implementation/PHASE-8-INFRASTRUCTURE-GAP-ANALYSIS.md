# Phase 8: Infrastructure Gap Analysis

Comparative analysis of every endpoint in the updated Phase 8 (and Phase 8b)
specification against the existing domain, service, and repository layers.
Endpoints are classified as **Ready** (infrastructure fully exists, only the
route handler is missing), **Partial** (some infrastructure exists but
supplements are needed), or **Missing** (significant new infrastructure
required).

---

## Summary

| Status     | Count | Description                                    |
| ---------- | ----- | ---------------------------------------------- |
| ✅ Ready   | 28    | Route handler is the only missing piece        |
| ⚠️ Partial | 11    | Some service or repository methods need adding |
| ❌ Missing | 3     | Requires new domain infrastructure             |

---

## Per-Endpoint Analysis

### PKG Node Routes — `/api/v1/users/:userId/pkg/nodes`

| Endpoint          | Status   | Service Method | Repository Method                              | Event              | Notes |
| ----------------- | -------- | -------------- | ---------------------------------------------- | ------------------ | ----- |
| `POST /`          | ✅ Ready | `createNode()` | `INodeRepository.createNode()`                 | `PKG_NODE_CREATED` | —     |
| `GET /`           | ✅ Ready | `listNodes()`  | `INodeRepository.findNodes()` + `countNodes()` | —                  | —     |
| `GET /:nodeId`    | ✅ Ready | `getNode()`    | `INodeRepository.getNode()`                    | —                  | —     |
| `PATCH /:nodeId`  | ✅ Ready | `updateNode()` | `INodeRepository.updateNode()`                 | `PKG_NODE_UPDATED` | —     |
| `DELETE /:nodeId` | ✅ Ready | `deleteNode()` | `INodeRepository.deleteNode()`                 | `PKG_NODE_REMOVED` | —     |

### PKG Edge Routes — `/api/v1/users/:userId/pkg/edges`

| Endpoint          | Status   | Service Method | Repository Method              | Event              | Notes                                           |
| ----------------- | -------- | -------------- | ------------------------------ | ------------------ | ----------------------------------------------- |
| `POST /`          | ✅ Ready | `createEdge()` | `IEdgeRepository.createEdge()` | `PKG_EDGE_CREATED` | Validates via `EDGE_TYPE_POLICIES`              |
| `GET /`           | ✅ Ready | `listEdges()`  | `IEdgeRepository.findEdges()`  | —                  | —                                               |
| `GET /:edgeId`    | ✅ Ready | `getEdge()`    | `IEdgeRepository.getEdge()`    | —                  | —                                               |
| `PATCH /:edgeId`  | ✅ Ready | `updateEdge()` | `IEdgeRepository.updateEdge()` | `PKG_EDGE_UPDATED` | `IUpdateEdgeInput` exists (weight + properties) |
| `DELETE /:edgeId` | ✅ Ready | `deleteEdge()` | `IEdgeRepository.removeEdge()` | `PKG_EDGE_REMOVED` | —                                               |

### PKG Batch Routes — `/api/v1/users/:userId/pkg/batch`

| Endpoint      | Status     | Service Method | Repository Method                     | Event                       | Notes                                                                        |
| ------------- | ---------- | -------------- | ------------------------------------- | --------------------------- | ---------------------------------------------------------------------------- |
| `POST /nodes` | ⚠️ Partial | **MISSING**    | `IBatchGraphRepository.createNodes()` | Multiple `PKG_NODE_CREATED` | Need new `batchCreateNodes()` service method                                 |
| `POST /edges` | ⚠️ Partial | **MISSING**    | `IBatchGraphRepository.createEdges()` | Multiple `PKG_EDGE_CREATED` | Need new `batchCreateEdges()` service method with per-edge policy validation |

**Implementation plan:**

1. Add `batchCreateNodes(userId, inputs[], ctx)` to `IKnowledgeGraphService`
   - Validate each input via `CreateNodeInputSchema`
   - Call `IBatchGraphRepository.createNodes()` in a single transaction
   - Log operations and emit events for each created node
   - Return `{ created: IGraphNode[], failed: { index, error }[] }`

2. Add `batchCreateEdges(userId, inputs[], ctx)` to `IKnowledgeGraphService`
   - Validate each input's edge type against `EDGE_TYPE_POLICIES`
   - Optionally skip acyclicity check per request flag
   - Call `IBatchGraphRepository.createEdges()` in a single transaction
   - Log operations and emit events for each created edge
   - Return `{ created: IGraphEdge[], failed: { index, error }[] }`

3. Add Zod schemas: `BatchCreateNodesRequestSchema`,
   `BatchCreateEdgesRequestSchema`

**Estimated effort:** Small — wraps existing `IBatchGraphRepository` methods
with validation and event emission.

---

### PKG Traversal Routes — `/api/v1/users/:userId/pkg/traversal`

| Endpoint                   | Status   | Service Method     | Repository Method                         | Notes                                                            |
| -------------------------- | -------- | ------------------ | ----------------------------------------- | ---------------------------------------------------------------- |
| `GET /subgraph`            | ✅ Ready | `getSubgraph()`    | `ITraversalRepository.getSubgraph()`      | —                                                                |
| `GET /ancestors/:nodeId`   | ✅ Ready | `getAncestors()`   | `ITraversalRepository.getAncestors()`     | —                                                                |
| `GET /descendants/:nodeId` | ✅ Ready | `getDescendants()` | `ITraversalRepository.getDescendants()`   | —                                                                |
| `GET /path`                | ✅ Ready | `findPath()`       | `ITraversalRepository.findShortestPath()` | Also has `findFilteredShortestPath()` for edge/node type filters |

### CKG Node Routes — `/api/v1/ckg/nodes`

| Endpoint       | Status   | Service Method   | Repository Method             | Notes                         |
| -------------- | -------- | ---------------- | ----------------------------- | ----------------------------- |
| `GET /`        | ✅ Ready | `listCkgNodes()` | `INodeRepository.findNodes()` | Uses `graphType='ckg'` filter |
| `GET /:nodeId` | ✅ Ready | `getCkgNode()`   | `INodeRepository.getNode()`   | —                             |

### CKG Edge Routes — `/api/v1/ckg/edges`

| Endpoint       | Status     | Service Method | Repository Method             | Notes                                                                          |
| -------------- | ---------- | -------------- | ----------------------------- | ------------------------------------------------------------------------------ |
| `GET /`        | ⚠️ Partial | **MISSING**    | `IEdgeRepository.findEdges()` | Need `listCkgEdges()` service method (delegates to `findEdges` without userId) |
| `GET /:edgeId` | ⚠️ Partial | **MISSING**    | `IEdgeRepository.getEdge()`   | Need `getCkgEdge()` service method (delegates to `getEdge`)                    |

**Implementation plan:**

1. Add `listCkgEdges(filters, pagination, ctx)` to `IKnowledgeGraphService`
   - Delegates to `IEdgeRepository.findEdges()` with CKG-scoped filter
   - Builds `IAgentHints` with edge-type distribution info
   - Return type: `IServiceResult<IPaginatedResponse<IGraphEdge>>`

2. Add `getCkgEdge(edgeId, ctx)` to `IKnowledgeGraphService`
   - Delegates to `IEdgeRepository.getEdge()`
   - Validates that the edge belongs to CKG (not PKG)
   - Return type: `IServiceResult<IGraphEdge>`

**Estimated effort:** Trivial — same pattern as `listCkgNodes()`/`getCkgNode()`.

---

### CKG Traversal Routes — `/api/v1/ckg/traversal`

| Endpoint                   | Status     | Service Method     | Repository Method                         | Notes                                     |
| -------------------------- | ---------- | ------------------ | ----------------------------------------- | ----------------------------------------- |
| `GET /subgraph`            | ✅ Ready   | `getCkgSubgraph()` | `ITraversalRepository.getSubgraph()`      | —                                         |
| `GET /ancestors/:nodeId`   | ⚠️ Partial | **MISSING**        | `ITraversalRepository.getAncestors()`     | Need `getCkgAncestors()` service method   |
| `GET /descendants/:nodeId` | ⚠️ Partial | **MISSING**        | `ITraversalRepository.getDescendants()`   | Need `getCkgDescendants()` service method |
| `GET /path`                | ⚠️ Partial | **MISSING**        | `ITraversalRepository.findShortestPath()` | Need `findCkgPath()` service method       |

**Implementation plan:**

1. Add 3 CKG traversal methods to `IKnowledgeGraphService`:
   - `getCkgAncestors(nodeId, options, ctx)` → delegates to repo with no userId
   - `getCkgDescendants(nodeId, options, ctx)` → delegates to repo with no
     userId
   - `findCkgPath(fromNodeId, toNodeId, ctx)` → delegates to repo with no userId

2. Each follows the same pattern as `getCkgSubgraph()` — validates node exists,
   delegates to repository (omitting userId for CKG scope), builds agent hints.

**Estimated effort:** Trivial — mirror of existing PKG methods minus userId
scoping.

**Note:** The repository methods already support CKG queries via the optional
`userId` parameter. When `userId` is omitted, the query runs against CKG nodes.

---

### CKG Mutation Routes — `/api/v1/ckg/mutations`

| Endpoint                     | Status     | Service Method          | Repository/Pipeline Method                | Notes                                              |
| ---------------------------- | ---------- | ----------------------- | ----------------------------------------- | -------------------------------------------------- |
| `POST /`                     | ✅ Ready   | `proposeMutation()`     | `CkgMutationPipeline.proposeMutation()`   | Supports all 7 DSL operation types                 |
| `GET /`                      | ✅ Ready   | `listMutations()`       | `CkgMutationPipeline.listMutations()`     | —                                                  |
| `GET /health`                | ⚠️ Partial | **MISSING**             | `CkgMutationPipeline.getPipelineHealth()` | Need `getMutationPipelineHealth()` service wrapper |
| `GET /:mutationId`           | ✅ Ready   | `getMutation()`         | `CkgMutationPipeline.getMutation()`       | —                                                  |
| `GET /:mutationId/audit-log` | ✅ Ready   | `getMutationAuditLog()` | `CkgMutationPipeline.getAuditLog()`       | —                                                  |
| `POST /:mutationId/cancel`   | ✅ Ready   | `cancelMutation()`      | `CkgMutationPipeline.cancelMutation()`    | —                                                  |
| `POST /:mutationId/retry`    | ✅ Ready   | `retryMutation()`       | `CkgMutationPipeline.retryMutation()`     | —                                                  |

**Implementation plan:**

1. Add `getMutationPipelineHealth(ctx)` to `IKnowledgeGraphService`
   - Delegates to `CkgMutationPipeline.getPipelineHealth()`
   - Wraps in `IServiceResult` with agent hints (stuck mutation warnings, queue
     depth assessment)

**Estimated effort:** Trivial — one-liner delegation.

**Note on `UPDATE_EDGE` CKG DSL operation:** The current `CkgOperationType` enum
has 7 entries: `ADD_NODE`, `REMOVE_NODE`, `UPDATE_NODE`, `ADD_EDGE`,
`REMOVE_EDGE`, `MERGE_NODES`, `SPLIT_NODE`. There is no `UPDATE_EDGE` operation.
The Phase 8 doc lists it in the mutation route description. This requires new
infrastructure — see the "Missing Infrastructure" section below.

---

### Metrics Routes — `/api/v1/users/:userId/metrics`

| Endpoint        | Status   | Service Method        | Repository Method                         | Notes |
| --------------- | -------- | --------------------- | ----------------------------------------- | ----- |
| `GET /`         | ✅ Ready | `getMetrics()`        | `IMetricsRepository.getLatestSnapshot()`  | —     |
| `POST /compute` | ✅ Ready | `computeMetrics()`    | Full metrics engine stack                 | —     |
| `GET /history`  | ✅ Ready | `getMetricsHistory()` | `IMetricsRepository.getSnapshotHistory()` | —     |

### Misconception Routes — `/api/v1/users/:userId/misconceptions`

| Endpoint                     | Status   | Service Method                | Repository Method                                      | Notes |
| ---------------------------- | -------- | ----------------------------- | ------------------------------------------------------ | ----- |
| `GET /`                      | ✅ Ready | `getMisconceptions()`         | `IMisconceptionRepository.getActiveMisconceptions()`   | —     |
| `POST /detect`               | ✅ Ready | `detectMisconceptions()`      | `IMisconceptionDetectionEngine + repository`           | —     |
| `PATCH /:detectionId/status` | ✅ Ready | `updateMisconceptionStatus()` | `IMisconceptionRepository.updateMisconceptionStatus()` | —     |

### Structural Health Routes — `/api/v1/users/:userId/health`

| Endpoint     | Status   | Service Method            | Notes                                         |
| ------------ | -------- | ------------------------- | --------------------------------------------- |
| `GET /`      | ✅ Ready | `getStructuralHealth()`   | Full health report with per-metric breakdowns |
| `GET /stage` | ✅ Ready | `getMetacognitiveStage()` | Stage assessment with gate criteria           |

### PKG↔CKG Comparison Routes — `/api/v1/users/:userId/comparison`

| Endpoint | Status   | Service Method     | Notes                                    |
| -------- | -------- | ------------------ | ---------------------------------------- |
| `GET /`  | ✅ Ready | `compareWithCkg()` | Full comparison with divergence analysis |

### PKG Operation Log Routes — `/api/v1/users/:userId/pkg/operations`

| Endpoint | Status     | Service Method | Repository Method                                                                                                                                             | Notes                                   |
| -------- | ---------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `GET /`  | ⚠️ Partial | **MISSING**    | `IPkgOperationLogRepository` has `getOperationHistory()`, `getOperationsSince()`, `getOperationsByType()`, `getOperationsForNode()`, `getOperationsForEdge()` | Need `getOperationLog()` service method |

**Implementation plan:**

1. Add `getOperationLog(userId, filters, pagination, ctx)` to
   `IKnowledgeGraphService`
   - Accept filter object: `{ operationType?, nodeId?, edgeId?, since? }`
   - Dispatch to the appropriate `IPkgOperationLogRepository` method based on
     which filters are present
   - Return paginated `IServiceResult<IPaginatedResponse<PkgOperation>>`

**Estimated effort:** Small — the repository layer is complete, just needs a
service method that routes to the right repository query.

---

## Phase 8b Advanced Traversal Endpoints

| Endpoint                                    | Status     | Service     | Repository                                       | Algorithm                       | Notes                                          |
| ------------------------------------------- | ---------- | ----------- | ------------------------------------------------ | ------------------------------- | ---------------------------------------------- |
| `GET /traversal/siblings/:nodeId`           | ❌ Missing | **MISSING** | **MISSING** (`getSiblings()`)                    | —                               | New Cypher query needed                        |
| `GET /traversal/neighborhood/:nodeId`       | ❌ Missing | **MISSING** | **MISSING** (`getNeighborhood()`)                | —                               | 2 Cypher queries (full_path + immediate modes) |
| `GET /traversal/bridges`                    | ⚠️ Partial | **MISSING** | Reuses `getSubgraph()`                           | **MISSING** (Tarjan's)          | New `graph-analysis.ts` file                   |
| `GET /traversal/frontier`                   | ❌ Missing | **MISSING** | **MISSING** (`getKnowledgeFrontier()`)           | —                               | New Cypher query needed                        |
| `GET /traversal/common-ancestors`           | ❌ Missing | **MISSING** | **MISSING** (`getCommonAncestors()`)             | —                               | New Cypher query needed                        |
| `GET /traversal/prerequisite-chain/:nodeId` | ⚠️ Partial | **MISSING** | Reuses `getSubgraph()`                           | **MISSING** (Kahn's topo sort)  | New `graph-analysis.ts` utils                  |
| `GET /traversal/centrality`                 | ⚠️ Partial | **MISSING** | **MISSING** (`getDegreeCentrality()` for degree) | **MISSING** (Brandes, PageRank) | New `graph-analysis.ts` utils + 1 Cypher query |

The PHASE-8b doc provides a complete specification with layer maps, Cypher
queries, type definitions, and implementation strategies. No further planning is
needed — implementation can follow that doc directly.

---

## Missing Infrastructure — New Artefacts Needed

### 1. `UPDATE_EDGE` CKG Mutation DSL Operation (NEW)

**What:** Add a new `UPDATE_EDGE` operation type to the CKG mutation DSL,
allowing CKG mutations to update an edge's weight and/or properties (analogous
to `UPDATE_NODE` for nodes).

**Why:** Currently the only way to change a CKG edge's weight is to remove it
and re-add it (REMOVE_EDGE + ADD_EDGE), which loses the edge's identity and
audit trail. An atomic `UPDATE_EDGE` preserves identity and is more semantically
correct.

**Files to modify:**

| File                       | Change                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `ckg-mutation-dsl.ts`      | Add `UPDATE_EDGE = 'UPDATE_EDGE'` to `CkgOperationType` enum                         |
| `ckg-mutation-dsl.ts`      | Define `IUpdateEdgeOperation` interface (`type`, `edgeId`, `weight?`, `properties?`) |
| `ckg-mutation-dsl.ts`      | Add `UpdateEdgeOperationSchema` Zod schema                                           |
| `ckg-mutation-dsl.ts`      | Add to `CkgMutationOperationSchema` discriminated union                              |
| `ckg-mutation-dsl.ts`      | Update `extractAffectedEdgeIds()` to include UPDATE_EDGE                             |
| `ckg-mutation-pipeline.ts` | Add `executeUpdateEdge()` private method (calls `graphRepository.updateEdge()`)      |
| `ckg-mutation-pipeline.ts` | Add case in `applyOperations()` switch                                               |

**Estimated effort:** Small — follows the exact same pattern as `UPDATE_NODE`.

### 2. Batch Service Methods (NEW)

Already described per-endpoint above. Two new service methods wrapping existing
`IBatchGraphRepository` methods.

### 3. CKG Read Service Methods (NEW)

Already described per-endpoint above. Five new service methods:

- `listCkgEdges()` — mirrors `listCkgNodes()`
- `getCkgEdge()` — mirrors `getCkgNode()`
- `getCkgAncestors()` — mirrors PKG `getAncestors()` without userId
- `getCkgDescendants()` — mirrors PKG `getDescendants()` without userId
- `findCkgPath()` — mirrors PKG `findPath()` without userId

### 4. Supplementary Service Methods (NEW)

- `getMutationPipelineHealth()` — wraps
  `CkgMutationPipeline.getPipelineHealth()`
- `getOperationLog()` — wraps `IPkgOperationLogRepository` queries

### 5. Phase 8b Infrastructure (NEW)

Per the PHASE-8b specification (fully documented):

- New value objects (7 query types, 7 result types, ~15 sub-types)
- 5 new `ITraversalRepository` methods with Cypher implementations
- 7 new `IKnowledgeGraphService` methods
- 1 new file: `graph-analysis.ts` (Tarjan's, Kahn's, Brandes, PageRank)
- 14 new Zod schemas
- Cache key patterns for all 7 endpoints
- Shared type exports in `@noema/types`

---

## Implementation Order

The recommended implementation order minimises dependencies and allows
incremental validation:

### Wave 1: Foundations (no new infrastructure needed)

All ✅ Ready endpoints — they only need route handlers, Zod schemas, and wiring.
Estimated: **28 route handlers**.

1. PKG Node routes (5 handlers)
2. PKG Edge routes (5 handlers, including the newly-documented GET and PATCH)
3. PKG Traversal routes (4 handlers)
4. CKG Node routes (2 handlers)
5. CKG Mutation routes — existing 5 (propose, list, get, cancel, retry)
6. CKG Mutation audit-log route (1 handler)
7. Metrics routes (3 handlers)
8. Misconception routes (3 handlers)
9. Structural Health routes (2 handlers)
10. Comparison route (1 handler)

### Wave 2: Trivial service methods (thin wrappers) ✅ COMPLETED

Added the missing service methods that are trivial delegations to existing
repository/pipeline methods. See ADR-0041 for design decisions.

1. ✅ `listCkgEdges()` + `getCkgEdge()` → CKG Edge routes (2 handlers)
2. ✅ `getCkgAncestors()` + `getCkgDescendants()` + `findCkgPath()` → CKG Traversal
   routes (4 handlers incl. subgraph)
3. ✅ `getMutationPipelineHealth()` → Mutation health route (1 handler)
4. ✅ `getOperationLog()` → Operation Log route (1 handler)

### Wave 3: Batch operations and DSL extension

1. `batchCreateNodes()` + `batchCreateEdges()` service methods
2. Batch route handlers (2 handlers)
3. `UPDATE_EDGE` CKG mutation DSL operation

### Wave 4: Phase 8b advanced traversal

Follow the PHASE-8b spec in order:

1. Value objects and shared types
2. `graph-analysis.ts` (algorithms)
3. Repository methods + Cypher queries
4. Cache decorator wrappers
5. Service methods + agent hints
6. Zod schemas
7. Route handlers (7 PKG + 6 CKG = 13 handlers)

### Wave 5: Event system

1. `RedisEventPublisher` implementation
2. Event consumers (content, session, user service)
3. Bootstrap registration

---

## Total New Artefacts Count

| Category                          | Count                                                             |
| --------------------------------- | ----------------------------------------------------------------- |
| New service interface methods     | 14 (Wave 2: 6, Wave 3: 2, Wave 4: 7 – some overlap with Phase 8b) |
| New route handlers (Phase 8)      | 35                                                                |
| New route handlers (Phase 8b)     | 13                                                                |
| New Zod schemas (Phase 8)         | ~20                                                               |
| New Zod schemas (Phase 8b)        | 14                                                                |
| New value object types (Phase 8b) | ~22                                                               |
| New repository methods (Phase 8b) | 5                                                                 |
| New domain utility file           | 1 (`graph-analysis.ts`)                                           |
| New DSL operation type            | 1 (`UPDATE_EDGE`)                                                 |
| New shared type exports           | ~7 (Phase 8b response types)                                      |
