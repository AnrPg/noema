# Knowledge-Graph-Service Remediation Plan

**Date:** 2026-03-02 **Scope:** All 67 findings from the comprehensive audit
**Format:** 5 dependency-ordered phases

---

## Dependency Rationale

The phases are ordered to respect the following dependency chains:

```
Phase 1 (Foundation)
  └─ Fix data bugs, type safety, error handling at the lowest layers
  └─ These are leaf-node fixes: no other work depends on them,
     but ALL higher-layer code benefits from correct infrastructure

Phase 2 (Contracts & Interfaces)
  └─ Extend/fix repository interfaces, add missing methods
  └─ DEPENDS ON Phase 1: correct types/schemas must exist first
  └─ Phase 3-5 code will call these new/fixed interfaces

Phase 3 (Domain Logic & Hardening)
  └─ Fix semantic errors, validation gaps, algorithms, comparison logic
  └─ DEPENDS ON Phase 2: new repo methods (countEdges, getEdgesForNodes, etc.)
  └─ DEPENDS ON Phase 1: correct type casts, Zod schemas

Phase 4 (Architecture & Refactoring)
  └─ Split God object, extract AgentHintsBuilder, deduplicate PKG/CKG,
     add observability, implement outbox pattern
  └─ DEPENDS ON Phase 3: domain logic must be correct before restructuring
  └─ DEPENDS ON Phase 2: new interfaces must be stable

Phase 5 (API, Config, Polish)
  └─ Route-layer fixes, config/DI cleanup, dead code removal
  └─ DEPENDS ON Phase 4: refactored service shape determines route wiring
  └─ DEPENDS ON Phase 3: correct domain errors for proper HTTP mapping
```

---

## Phase 1 — Foundation: Data Bugs, Type Safety & Error Handling ✅ COMPLETED

> **Status:** All 22 fixes implemented and passing (458 tests). **Commit:**
> `103f246` (code) · `04ee0aa` (formatter). **ADR:**
> ADR-010-remediation-phase1-foundation.md

**Goal:** Fix all silent data corruption bugs, unsafe casts, and error handling
defects at the infrastructure and domain utility layers. These are the building
blocks everything else depends on.

**Estimated scope:** ~25 targeted fixes across 15 files

### 1.1 — Critical: Sync `ALL_REL_TYPES` with `RELATIONSHIP_TYPES` (C1)

| Audit Ref | Domain Audit: B5.3 / Infra Audit: C1                                                                                                                                                                                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File      | `src/infrastructure/database/neo4j-graph.repository.ts` L82-92                                                                                                                                                                                                                           |
| Problem   | `ALL_REL_TYPES` has 8 entries; `neo4j-schema.ts` defines 17. Nine relationship types (`EQUIVALENT_TO`, `ENTAILS`, `DISJOINT_WITH`, `ANALOGOUS_TO`, `CONTRASTS_WITH`, `DEPENDS_ON`, `CONSTITUTED_BY`, `PRECEDES`, `HAS_PROPERTY`) are invisible to all queries using the default pattern. |
| Fix       | Import `RELATIONSHIP_TYPES` from `neo4j-schema.ts` and use it as the single source of truth. Delete the `ALL_REL_TYPES` constant.                                                                                                                                                        |
| Tests     | Add a unit test asserting `ALL_REL_TYPES` matches `RELATIONSHIP_TYPES`.                                                                                                                                                                                                                  |

### 1.2 — Critical: Fix `nodeId` → `nodeIds` parameter name (C2)

| Audit Ref | Infra Audit: C2                                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| File      | `src/infrastructure/database/neo4j-graph.repository.ts` L2212                                                                 |
| Problem   | `getNodesByIds` passes `{ nodeId: [...nodeIds] }` but Cypher uses `$nodeIds`. Results in empty results for every batch-fetch. |
| Fix       | Rename parameter to `{ nodeIds: [...nodeIds] }`.                                                                              |

### 1.3 — Critical: Add Zod runtime validation for mutation operations (C3)

| Audit Ref | Domain Audit: 5.1                                                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Files     | `src/domain/knowledge-graph-service/ckg-mutation-pipeline.ts` (~4 locations)                                                                                              |
| Problem   | `mutation.operations as unknown as CkgMutationOperation[]` bypasses type system. If DB returns malformed data post-migration, pipeline operates on garbage.               |
| Fix       | Create `CkgMutationOperationSchema` in `ckg-mutation-dsl.ts` and validate with `z.array(CkgMutationOperationSchema).parse(mutation.operations)` at each extraction point. |

### 1.4 — Critical: Metric computation failure — replace silent default-to-0 (C4)

| Audit Ref | Domain Audit: 6.1                                                                                                                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File      | `src/domain/knowledge-graph-service/metrics/structural-metrics-engine.ts` L95-102                                                                                                                                       |
| Problem   | Failed computers default to `0`, which is indistinguishable from a valid result. Downstream health/stage assessments make wrong decisions.                                                                              |
| Fix       | Return `{ metrics: IStructuralMetrics, partialFailures: Array<{ field: string, error: string }> }`. Propagate `partialFailures` to callers so they can flag partial data. Replace `console.error` with injected logger. |

### 1.5 — Critical: Replace `as unknown as IStructuralMetrics` cast (C5)

| Audit Ref | Domain Audit: 4.3                                                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| File      | `src/domain/knowledge-graph-service/metrics/structural-metrics-engine.ts` L90-91                                                         |
| Problem   | `Record<string, number>` → `as unknown as IStructuralMetrics`. Missing fields silently become `undefined`.                               |
| Fix       | Build result as a typed `IStructuralMetrics` object with explicit field assignment. Validate all 11 fields are present before returning. |

### 1.6 — High: Fix `CachedGraphRepository.findEdges` dropping pagination (H1)

| Audit Ref | Infra Audit: H1                                                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File      | `src/infrastructure/cache/cached-graph.repository.ts`                                                                                                    |
| Problem   | Interface accepts `limit?, offset?` but cache wrapper only accepts `filter: IEdgeFilter` — pagination params are silently dropped.                       |
| Fix       | Forward `limit` and `offset` to the inner repository. Do not cache paginated results (only cache full-filter results or skip cache for paginated calls). |

### 1.7 — High: Fix `direction: 'both'` dropping nodeId filter (H2)

| Audit Ref | API Audit: H11                                                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Files     | `src/api/rest/pkg-edge.routes.ts`, `src/api/rest/ckg-edge.routes.ts`                                                                                                   |
| Problem   | When `direction` is `'both'`, the route queries edges without scoping to the nodeId — returns ALL edges in the graph instead of edges connected to the specified node. |
| Fix       | Ensure nodeId is always passed to the filter regardless of direction.                                                                                                  |

### 1.8 — High: Replace `console.error`/`console.warn` in domain layer (H3)

| Audit Ref | Domain Audit: 2.4                                                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Files     | `metrics/structural-metrics-engine.ts`, `misconception/misconception-detection-engine.ts`, `metrics/metric-computation-context.ts`                                  |
| Problem   | Domain code uses `console.*` directly, bypassing structured logging, correlation IDs, and log-level control.                                                        |
| Fix       | Inject a `Logger` via constructor DI into `StructuralMetricsEngine`, `MisconceptionDetectionEngine`, and `MetricComputationContext`. Replace all `console.*` calls. |

### 1.9 — High: Misconception detector failure silently swallowed (H4)

| Audit Ref | Domain Audit: 6.2                                                                                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| File      | `src/domain/knowledge-graph-service/misconception/misconception-detection-engine.ts`                                                    |
| Problem   | Individual detector failures are caught and logged to `console.error`, results omitted. Callers have no idea semantic detection failed. |
| Fix       | Return `{ results: IMisconceptionDetectionResult[], detectorStatuses: Array<{ kind: string, status: 'success'                           | 'error', error?: string }> }`. |

### 1.10 — High: `as unknown as Metadata[]` cast for event operations (H5)

| Audit Ref | Domain Audit: 5.2                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| File      | `src/domain/knowledge-graph-service/ckg-mutation-pipeline.ts` ~L250                                                                  |
| Problem   | Operations cast to `Metadata[]` (`Record<string, unknown>[]`) for events — loses type info, could serialize non-serializable values. |
| Fix       | Create `toSerializableOperations(ops)` mapper that explicitly picks serializable fields.                                             |

### 1.11 — High: `edgeId` typed as `string` in delete/update but `EdgeId` elsewhere (H6)

| Audit Ref | Domain Audit: B4.2                                                                          |
| --------- | ------------------------------------------------------------------------------------------- |
| File      | `src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts`                        |
| Problem   | `deleteEdge(edgeId: string)` vs `getEdge(edgeId: EdgeId)`. Inconsistent branded type usage. |
| Fix       | Make all edge methods accept `EdgeId`. Remove inline casts.                                 |

### 1.12 — High: Inconsistent null checks in get/update/delete edge (H7)

| Audit Ref | Domain Audit: 6.3                                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| File      | `src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts`                                                   |
| Problem   | `updateEdge`/`deleteEdge` use unscoped `getEdge(edgeId)` then check `userId`, conflating "not found" with "not owned". |
| Fix       | Use userId-scoped repo call consistently. Differentiate `EdgeNotFoundError` from `UnauthorizedError`.                  |

### 1.13 — Medium: `MutationFilterSchema` uses loose Zod types (M1)

| Audit Ref | Domain Audit: 5.3                                                                 |
| --------- | --------------------------------------------------------------------------------- |
| File      | `src/domain/knowledge-graph-service/ckg-mutation-dsl.ts` ~L390-420                |
| Problem   | `z.string()` for `state` field — `state: 'totally_invalid'` passes validation.    |
| Fix       | Use `z.enum([...MutationState values])` for `state`. Add `.min(1)` for ID fields. |

### 1.14 — Medium: `pattern.config` unsafe cast in detectors (M2)

| Audit Ref | Domain Audit: 5.4                                                           |
| --------- | --------------------------------------------------------------------------- | ----------------------------------------------------- |
| Files     | `misconception/detectors/structural-detector.ts`, `statistical-detector.ts` |
| Problem   | `config['detectionType'] as string                                          | undefined` — non-string values fall through silently. |
| Fix       | Define Zod schemas per detector kind, validate config at detection time.    |

### 1.15 — Medium: `FIELD_TO_METRIC_TYPE` uses `as StructuralMetricType` casts (M3)

| Audit Ref | Domain Audit: 5.5                                                              |
| --------- | ------------------------------------------------------------------------------ |
| Files     | `metrics/health/structural-health.ts`, `metrics/health/metacognitive-stage.ts` |
| Problem   | String literal casts — silent breakage if enum renames.                        |
| Fix       | Import `StructuralMetricType` enum values directly instead of casting strings. |

### 1.16 — Medium: `ICkgMutation` has mutable fields on repository return (M4)

| Audit Ref | Domain Audit: 2.6                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| File      | `src/domain/knowledge-graph-service/mutation.repository.ts`                                                                     |
| Problem   | `state`, `version`, `updatedAt` are mutable. Pipeline mutates them in-place after fetch, violating immutable-return convention. |
| Fix       | Make all fields `readonly`. Pipeline creates new objects: `{ ...mutation, state: newState }`.                                   |

### 1.17 — Medium: `computeNodeChangedFields` records no-op changes (M5)

| Audit Ref | Domain Audit: 4.1                                                                                        |
| --------- | -------------------------------------------------------------------------------------------------------- |
| File      | `src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts` ~L2680-2695                         |
| Problem   | Reference equality (`!==`) on objects — new object with same content triggers "change". Pollutes op log. |
| Fix       | Use deep equality for object comparison (JSON.stringify for shallow JSONB or `deepEqual` util).          |

### 1.18 — Medium: `buildEdgeMap` silently drops duplicate edges (M6)

| Audit Ref | Domain Audit: 3.6                                                                 |
| --------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------- |
| File      | `src/domain/knowledge-graph-service/metrics/graph-comparison-builder.ts` L344-351 |
| Problem   | Key is `sourceNodeId                                                              | targetNodeId` — second edge between same pair (different type) is dropped. |
| Fix       | Include `edgeType` in key: `${sourceNodeId}                                       | ${targetNodeId}                                                            | ${edgeType}`. |

### 1.19 — Medium: `StructuralMisconceptionDetector` DFS captures only 2 cycle nodes (M7)

| Audit Ref | Domain Audit: 4.5                                                                               |
| --------- | ----------------------------------------------------------------------------------------------- |
| File      | `src/domain/knowledge-graph-service/misconception/detectors/structural-detector.ts` L89-100     |
| Problem   | Only current node + back-edge neighbour recorded; intermediate cycle nodes missed.              |
| Fix       | Walk the recursion stack from current node back to neighbour to collect all cycle participants. |

### 1.20 — Medium: `detectDivergences` assigns fixed severity without context (M8)

| Audit Ref | Domain Audit: 4.4                                                                       |
| --------- | --------------------------------------------------------------------------------------- |
| File      | `src/domain/knowledge-graph-service/metrics/graph-comparison-builder.ts` L255-285       |
| Problem   | All `MISSING_NODE` → `MEDIUM`, all `EXTRA_NODE` → `LOW` regardless of centrality/depth. |
| Fix       | Factor in CKG depth or centrality when assigning severity.                              |

### 1.21 — Low: `PromotionBandUtil.meetsThreshold` vacuously true for unknown bands (L1)

| Audit Ref | Domain Audit: 1.4                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| File      | `src/domain/knowledge-graph-service/value-objects/promotion-band.ts` L73-80                                |
| Problem   | Any typo in band string (e.g. `'stronng'`) passes silently.                                                |
| Fix       | Explicitly check `band === 'none'` and throw on unknown bands. Or use `Record<PromotionBandEnum, number>`. |

### 1.22 — Low: `IMetricSnapshot.metrics` typed as `Record<string, number>` (L2)

| Audit Ref | Domain Audit: 7.3                                                                                        |
| --------- | -------------------------------------------------------------------------------------------------------- |
| File      | `src/domain/knowledge-graph-service/metrics.repository.ts` L10-20                                        |
| Problem   | Loose bag type instead of `IStructuralMetrics`. Older snapshots missing new fields → silent `undefined`. |
| Fix       | Type `metrics` as `IStructuralMetrics`. Add version field for migration.                                 |

### 1.23 — Low: `IMisconceptionDetectionResult.confidence` → `number` vs `ConfidenceScore` (L3)

| Audit Ref | Domain Audit: 7.5                                                                |
| --------- | -------------------------------------------------------------------------------- |
| File      | `src/domain/knowledge-graph-service/misconception/types.ts`                      |
| Problem   | Plain `number` where branded `ConfidenceScore` should be used. Cast at boundary. |
| Fix       | Use `ConfidenceScore` in `IMisconceptionDetectionResult`.                        |

### 1.24 — Low: `validateTraversalDepth` doesn't reject `depth <= 0` (L4)

| Audit Ref | Domain Audit: 1.3                                                           |
| --------- | --------------------------------------------------------------------------- | --- | ------------------------------------------- |
| File      | `src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts` ~L2665 |
| Problem   | `NaN`, `0`, `-1` all pass.                                                  |
| Fix       | Add `if (!Number.isInteger(depth)                                           |     | depth < 1) throw new ValidationError(...)`. |

---

## Phase 2 — Contracts & Interfaces: Repository Extensions & Port Refinement

**Goal:** Extend repository interfaces with missing methods, fix cache contract,
add proper DI interfaces. Phase 3+ code will consume these new methods.

**Estimated scope:** ~10 interface changes across 8 files

### 2.1 — High: Add `countEdges(filter)` to `IEdgeRepository` (H8)

| Audit Ref | Domain Audit: 2.5                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Files     | `graph.repository.ts` (interface), `neo4j-graph.repository.ts` (impl), `cached-graph.repository.ts` (decorator)                            |
| Problem   | `listEdges` fakes total as `offset + items.length` → `hasMore` is always `false`, pagination broken.                                       |
| Fix       | Add `countEdges(filter: IEdgeFilter, userId?: string): Promise<number>` to `IEdgeRepository`. Implement in Neo4j repo and cache decorator. |

### 2.2 — High: Add batch `getEdgesForNodes(nodeIds[])` to `IEdgeRepository` (H9)

| Audit Ref | Domain Audit: 3.3                                                                                                                                                                      |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Files     | `graph.repository.ts` (interface), `neo4j-graph.repository.ts` (impl), `cached-graph.repository.ts` (decorator)                                                                        |
| Problem   | `fetchDomainSubgraph` does N+1 queries (one per node).                                                                                                                                 |
| Fix       | Add `getEdgesForNodes(nodeIds: NodeId[], filter?: IEdgeFilter, userId?: string): Promise<IGraphEdge[]>`. Implement with single Cypher: `MATCH (n)-[r]-(m) WHERE n.nodeId IN $nodeIds`. |

### 2.3 — High: Add `countOperations(userId, filters)` to operation log repo (H10)

| Audit Ref | Domain Audit: 7.1                                                                          |
| --------- | ------------------------------------------------------------------------------------------ |
| Files     | `pkg-operation-log.repository.ts` (interface), `prisma-operation-log.repository.ts` (impl) |
| Problem   | `getOperationLog` returns approximate `total: offset + items.length`.                      |
| Fix       | Add `countOperations(userId: string, filters?: IOperationLogFilter): Promise<number>`.     |

### 2.4 — Medium: Define `ICkgMutationPipeline` interface (M9)

| Audit Ref | Domain Audit: 7.4                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| File      | New: `src/domain/knowledge-graph-service/ckg-mutation-pipeline.interface.ts`                                                         |
| Problem   | Pipeline has no DI interface — hard to mock in tests.                                                                                |
| Fix       | Define interface with public methods (`proposeMutation`, `approveMutation`, etc.). Service depends on interface, not concrete class. |

### 2.5 — Medium: Define `IReadOnlyGraphRepository` for CKG (M10)

| Audit Ref | Domain Audit: B7.5                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------ | ----------- | -------------------------------------- | ----------- | -------------------------------------------- |
| File      | `src/domain/knowledge-graph-service/graph.repository.ts`                                                     |
| Problem   | CKG immutability is implicit — `IGraphRepository` exposes write methods that CKG should never call.          |
| Fix       | Extract read-only subset: `IReadOnlyGraphRepository = ITraversalRepository & Pick<INodeRepository, 'getNode' | 'findNodes' | ...> & Pick<IEdgeRepository, 'getEdge' | 'findEdges' | ...>`. CKG read operations accept this type. |

### 2.6 — Medium: Add `recoveryAttempts` to `ICkgMutation` (M11)

| Audit Ref | Domain Audit: 6.5                                                                              |
| --------- | ---------------------------------------------------------------------------------------------- |
| Files     | `mutation.repository.ts` (interface), Prisma migration, `prisma-mutation.repository.ts` (impl) |
| Problem   | `recoverStuckMutations` has no max retry — permanently failing mutations retry forever.        |
| Fix       | Add `recoveryAttempts: number` field. After N attempts → transition to `rejected`.             |

### 2.7 — Medium: Cache key scoping by userId (M12)

| Audit Ref | Infra Audit: H3                                                                 |
| --------- | ------------------------------------------------------------------------------- |
| File      | `src/infrastructure/cache/cached-graph.repository.ts`                           |
| Problem   | Cache keys don't include userId — User A's PKG nodes could be served to User B. |
| Fix       | Include `userId` in all cache key generation.                                   |

### 2.8 — Medium: Cache invalidation on writes (M13)

| Audit Ref | Infra Audit: H4                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| File      | `src/infrastructure/cache/cached-graph.repository.ts`                                                                              |
| Problem   | Write operations delegate to inner repo but don't invalidate related cache entries.                                                |
| Fix       | After `createNode`/`updateNode`/`deleteNode`/`createEdge`/`updateEdge`/`deleteEdge`, invalidate affected node and edge cache keys. |

### 2.9 — Low: `IGraphRepository.runInTransaction` — add `ITransactional` mixin (L5)

| Audit Ref | Domain Audit: 7.2                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| File      | `src/domain/knowledge-graph-service/graph.repository.ts`                                                                                                                                   |
| Problem   | `runInTransaction` only on composite interface. Code receiving `INodeRepository` can't use transactions.                                                                                   |
| Fix       | Define `ITransactional<T>` mixin. Compose: `IGraphRepository extends INodeRepository & IEdgeRepository & ITraversalRepository & IBatchGraphRepository & ITransactional<IGraphRepository>`. |

---

## Phase 3 — Domain Logic: Validation, Algorithms & Semantic Correctness

**Goal:** Fix semantic/logical errors in domain services, validation gaps,
algorithm correctness, and business rule hardening. Uses the new interfaces from
Phase 2.

**Estimated scope:** ~15 fixes across 10 files

### 3.1 — High: Fix `fetchDomainSubgraph` N+1 → batch query (H11)

| Audit Ref | Domain Audit: 3.3                                                                      |
| --------- | -------------------------------------------------------------------------------------- |
| File      | `src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts` ~L2695-2720       |
| Depends   | Phase 2.2 (`getEdgesForNodes` method)                                                  |
| Problem   | N sequential queries for N nodes.                                                      |
| Fix       | Replace loop with single `this.graphRepository.getEdgesForNodes(nodeIds, {}, userId)`. |

### 3.2 — High: Fix `listEdges` approximate total → exact count (H12)

| Audit Ref | Domain Audit: 2.5                                                              |
| --------- | ------------------------------------------------------------------------------ |
| File      | `src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts` ~L700-730 |
| Depends   | Phase 2.1 (`countEdges` method)                                                |
| Problem   | `total: offset + items.length` — pagination broken.                            |
| Fix       | Call `countEdges(filter, userId)` for exact total.                             |

### 3.3 — High: Fix `getOperationLog` approximate total → exact count (H13)

| Audit Ref | Domain Audit: 7.1                                                                |
| --------- | -------------------------------------------------------------------------------- |
| File      | `src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts` ~L2450-2500 |
| Depends   | Phase 2.3 (`countOperations` method)                                             |
| Fix       | Call `countOperations(userId, filters)` for exact total.                         |

### 3.4 — High: Fix cycle detection — ensure source→target reachability check + self-loop guard (H14)

| Audit Ref | Domain Audit: 4.2                                                                                                                                                                      |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File      | `src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts` ~L497-505                                                                                                         |
| Problem   | `detectCycles(targetNodeId)` checks if target can reach _any_ node, not specifically the source. Self-loop not guarded.                                                                |
| Fix       | 1) Add explicit self-loop check: `if (sourceNodeId === targetNodeId) throw new CyclicEdgeError(...)`. 2) Ensure `detectCycles` checks reachability from target to source specifically. |

### 3.5 — High: Edge divergence detection O(n²) → O(E) (H15)

| Audit Ref | Domain Audit: 3.5                                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| File      | `src/domain/knowledge-graph-service/metrics/graph-comparison-builder.ts` ~L272-310                                     |
| Problem   | Nested iteration over all aligned pairs is O(n²).                                                                      |
| Fix       | Iterate over CKG edges (O(E)), checking whether each edge's endpoints are aligned and whether PKG has a matching edge. |

### 3.6 — Medium: `executeSplit` — pass domain directly to createNode (M14)

| Audit Ref | Domain Audit: 3.4                                                          |
| --------- | -------------------------------------------------------------------------- |
| File      | `src/domain/knowledge-graph-service/ckg-mutation-pipeline.ts` ~L860-920    |
| Problem   | Creates CKG nodes with `domain: ''` then immediately updates — non-atomic. |
| Fix       | Pass source node's domain directly into `createNode`.                      |

### 3.7 — Medium: `recoverStuckMutations` — enforce max recovery attempts (M15)

| Audit Ref | Domain Audit: 6.5                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------------------------- |
| File      | `src/domain/knowledge-graph-service/ckg-mutation-pipeline.ts` ~L1100-1180                                         |
| Depends   | Phase 2.6 (`recoveryAttempts` field)                                                                              |
| Problem   | No max retry — permanently failing mutations retry forever.                                                       |
| Fix       | Check `mutation.recoveryAttempts >= MAX_RECOVERY` → transition to `rejected`. Increment counter on each recovery. |

### 3.8 — Medium: `SemanticMisconceptionDetector` — gate behind feature flag (M16)

| Audit Ref | Domain Audit: 1.1                                                                                                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File      | `src/domain/knowledge-graph-service/misconception/detectors/semantic-detector.ts`                                                                                                        |
| Problem   | Returns `[]` unconditionally. Deceptively reports zero semantic misconceptions.                                                                                                          |
| Fix       | Gate registration behind config flag `vectorServiceEnabled`. When disabled, skip entirely. When enabled but unimplemented, throw `NotImplementedError` if semantic patterns are present. |

### 3.9 — Medium: `IValidationOptions.customValidators` — implement or remove (M17)

| Audit Ref | Domain Audit: 1.2                                                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Files     | `value-objects/graph.value-objects.ts`, `knowledge-graph.service.impl.ts`                                                                |
| Problem   | `customValidators` accepted but never invoked even when `validateCustomRules: true`.                                                     |
| Fix       | Implement the custom validator invocation loop in `createEdge`, or remove `customValidators` + `validateCustomRules` from the interface. |

### 3.10 — Medium: `sourceDomain` fallback `'unknown'` magic string (M18)

| Audit Ref | Domain Audit: B4.3                                                                          |
| --------- | ------------------------------------------------------------------------------------------- |
| File      | `src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts` ~L796                  |
| Problem   | `'unknown'` written to staleness table → pollutes metrics.                                  |
| Fix       | If source node not found, throw `NodeNotFoundError` instead of proceeding with `'unknown'`. |

### 3.11 — Low: Remove or populate `domain/shared/errors/` and `domain/shared/value-objects/` (L6)

| Audit Ref | Domain Audit: 1.5                                                                       |
| --------- | --------------------------------------------------------------------------------------- |
| Dirs      | `src/domain/shared/errors/`, `src/domain/shared/value-objects/`                         |
| Problem   | Empty directories creating misleading scaffolding.                                      |
| Fix       | Populate with shared domain primitives (`DomainError` base, `CorrelationId`) or remove. |

### 3.12 — Low: `_filters` unused parameter in `createMutationListHints` (L7)

| Audit Ref | Domain Audit: B5.1                                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| File      | `src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts` ~L3801                                                         |
| Problem   | `_filters` is never used but hints could leverage it.                                                                               |
| Fix       | Either use `_filters` to provide contextual hints (e.g., "showing rejected mutations — consider cleanup"), or remove the parameter. |

---

## Phase 4 — Architecture: Refactoring, Observability & Consistency

**Goal:** Split the God object, extract duplicated logic, add observability
(OpenTelemetry), and implement the outbox pattern for cross-DB consistency.
These are structural changes that require stable, correct domain logic (Phase
3).

**Estimated scope:** ~8 major refactors across 20+ files (high-effort phase)

### 4.1 — Critical: Implement outbox pattern for Neo4j + Postgres dual-write (C6)

| Audit Ref | Domain Audit: 3.1 / Analysis Report: B2                                                                                                                                                                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Files     | `ckg-mutation-pipeline.ts`, new: `outbox-processor.ts`, Prisma migration                                                                                                                                                                                                                                                                   |
| Problem   | Neo4j commits but Postgres fails → permanent inconsistency. Only mitigation is an ERROR log.                                                                                                                                                                                                                                               |
| Fix       | **Step 1 (Immediate):** Add Postgres state-update retry with exponential backoff (3 attempts). Add a periodic reconciliation sweep for mutations stuck in `committing` > 5 minutes. **Step 2 (Full outbox):** Write operations to a Postgres outbox table in the same transaction as the state update, then asynchronously apply to Neo4j. |

### 4.2 — Critical: Wrap PKG write non-atomic sequence (C7)

| Audit Ref | Analysis Report: B2, Finding 2                                                                                                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File      | `knowledge-graph.service.impl.ts` L197-260                                                                                                                                                                            |
| Problem   | `Neo4j write → op log → event → staleness` — if op log fails after Neo4j, audit trail misses the mutation.                                                                                                            |
| Fix       | Wrap `operationLogRepository.appendOperation` in try-catch (like `markMetricsStale`). Log warning for eventual consistency. Parallelize independent operations: `await Promise.all([appendLog, publish, markStale])`. |

### 4.3 — Critical: Split God object into focused sub-services (C8)

| Audit Ref | Domain Audit: 2.1 / Analysis Report: B1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File      | `knowledge-graph.service.impl.ts` (4,149 lines)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Problem   | 55+ public methods, 30+ private helpers, 9+ responsibilities, 4,149 lines.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Fix       | Split into: 1) `PkgNodeEdgeService` — PKG CRUD (responsibilities 1-2), 2) `PkgTraversalService` — traversals + structural analysis (3-4), 3) `CkgReadService` — CKG read-only operations (5), 4) `MetricsOrchestrator` — metrics, health, metacognitive stage (6-8), 5) `MisconceptionOrchestrator` — detection + lifecycle (7), 6) `AgentHintsFactory` — all `createXxxHints` methods (~800+ lines). Current `KnowledgeGraphService` becomes a thin facade delegating to these, keeping `IKnowledgeGraphService` interface stable. |

### 4.4 — High: Deduplicate PKG/CKG traversal & analysis methods (H16)

| Audit Ref | Domain Audit: 2.2                                                                             |
| --------- | --------------------------------------------------------------------------------------------- |
| File      | After split: `PkgTraversalService`, `CkgReadService`                                          |
| Depends   | Phase 4.3 (split must happen first)                                                           |
| Problem   | 6+ method pairs differ only in `GraphType.PKG` vs `GraphType.CKG` + user-scoping.             |
| Fix       | Extract `executeAnalysis(graphType, userId?, ...)` template method or shared private helpers. |

### 4.5 — High: Extract `AgentHintsBuilder` with fluent API (H17)

| Audit Ref | Domain Audit: 2.3                                                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| File      | New: `src/domain/knowledge-graph-service/agent-hints.factory.ts`                                                                                    |
| Depends   | Phase 4.3 (extraction during split)                                                                                                                 |
| Problem   | ~800 lines of mechanical `createXxxHints` methods with identical boilerplate.                                                                       |
| Fix       | Fluent builder: `AgentHintsBuilder.new().withActions(actions).withResources(resources).withReasoning(reasoning).build()`. Move all hint logic here. |

### 4.6 — High: Extract business-rule thresholds from hint generators (H18)

| Audit Ref | Analysis Report: B7.2                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| File      | New: `src/domain/knowledge-graph-service/policies/analysis-thresholds.ts`                                    |
| Depends   | Phase 4.5 (hints builder must exist)                                                                         |
| Problem   | Magic numbers like `density < 0.1 = "sparse"`, `siblings > 10 = "high confusion"` hardcoded in hint methods. |
| Fix       | Extract to a typed `AnalysisThresholds` policy object that can be configured/tested independently.           |

### 4.7 — High: Add OpenTelemetry tracing to critical paths (H19)

| Audit Ref | Analysis Report: B3                                                                                                                                                                                                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Files     | All sub-services from 4.3, `ckg-mutation-pipeline.ts`, `neo4j-graph.repository.ts`                                                                                                                                                                        |
| Problem   | No trace spans, no timing, no correlation across Neo4j↔Postgres↔Redis.                                                                                                                                                                                    |
| Fix       | Add OTel `tracer.startActiveSpan()` around: repo calls, validation pipeline stages, commit protocol steps, metrics computation. Add Prometheus counters for: operations by type, staleness-mark failures, hint generation time, cross-DB inconsistencies. |

### 4.8 — High: Fire-and-forget pipeline → job-based execution (H20)

| Audit Ref | Domain Audit: 3.2                                                                                                                                                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File      | `ckg-mutation-pipeline.ts` ~L155                                                                                                                                                                                                                                          |
| Problem   | `void this.runPipelineAsync(mutation)` — if it throws, error is only logged. No retry, no dead-letter, no alerting.                                                                                                                                                       |
| Fix       | **Immediate:** Add structured error handling with metric counters for pipeline failures. **Medium-term:** Replace fire-and-forget with a job queue (use the project's Oban pattern adapted for TypeScript, or BullMQ) giving automatic retry, dead-letter, and telemetry. |

---

## Phase 5 — API, Config & Polish: Routes, DI, Process Lifecycle

**Goal:** Fix all route-layer issues (error mapping, Zod validation, response
format), config/DI wiring, process lifecycle, and cleanup remaining low-severity
items.

**Estimated scope:** ~15 fixes across 12 files

### 5.1 — Critical: Add `ZodError` handler in `handleError` (C9)

| Audit Ref | API Audit: C4                                                                                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File      | `src/api/shared/route-helpers.ts`                                                                                                                                                      |
| Problem   | `ZodError` is not caught in the error handler → bubbles as 500.                                                                                                                        |
| Fix       | Add: `if (error instanceof ZodError) { return reply.status(400).send({ error: 'Validation Error', message: error.errors.map(...), statusCode: 400 }) }`. Import `ZodError` from `zod`. |

### 5.2 — High: URL params never validated with Zod (H21)

| Audit Ref | API Audit: H6                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Files     | All 14 route files in `src/api/rest/`                                                                                          |
| Problem   | Path params (`nodeId`, `edgeId`, `mutationId`) extracted as raw strings, never validated with Zod schemas.                     |
| Fix       | Create param schemas (e.g., `NodeIdParamSchema = z.object({ nodeId: z.string().min(1) })`) and validate in each route handler. |

### 5.3 — High: Ancestors/Descendants bypass Zod validation (H22)

| Audit Ref | API Audit: H7                                                                            |
| --------- | ---------------------------------------------------------------------------------------- |
| Files     | `pkg-traversal.routes.ts`, `ckg-traversal.routes.ts`                                     |
| Problem   | Query params for ancestors/descendants are extracted raw without Zod parsing.            |
| Fix       | Add Zod schemas for traversal query params (`maxDepth`, `edgeTypes`, etc.) and validate. |

### 5.4 — High: 204 responses with body (H23)

| Audit Ref | API Audit: H3                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------- |
| Files     | Multiple route files (DELETE handlers)                                                                        |
| Problem   | Some DELETE routes return `204 No Content` with a JSON body — violates HTTP spec.                             |
| Fix       | Either return 200 with body, or 204 without body. Choose 200 for consistency with the `wrapResponse` pattern. |

### 5.5 — Medium: Mutation pagination parsed but never forwarded (M19)

| Audit Ref | API Audit: M5                                                                          |
| --------- | -------------------------------------------------------------------------------------- |
| File      | `src/api/rest/ckg-mutation.routes.ts`                                                  |
| Problem   | Pagination params are parsed from query string but never passed to the service method. |
| Fix       | Forward `limit` and `offset` to the service's `listMutations` method.                  |

### 5.6 — Medium: `maxDepth` parsed but not forwarded (M20)

| Audit Ref | API Audit: M6                                                                |
| --------- | ---------------------------------------------------------------------------- |
| File      | Traversal route files                                                        |
| Problem   | `maxDepth` extracted from query but not passed to service traversal methods. |
| Fix       | Forward `maxDepth` to service calls.                                         |

### 5.7 — Medium: Health check returns 200 when unhealthy (M21)

| Audit Ref | API Audit: M8                                               |
| --------- | ----------------------------------------------------------- |
| File      | `src/api/rest/health.routes.ts`                             |
| Problem   | Always returns 200 regardless of underlying service health. |
| Fix       | Return 503 when Neo4j or Postgres is unreachable.           |

### 5.8 — Medium: Audit-log accessible without elevated privileges (M22)

| Audit Ref | API Audit: M9                                                            |
| --------- | ------------------------------------------------------------------------ |
| File      | `src/api/rest/pkg-operation-log.routes.ts`                               |
| Problem   | Operation log endpoint doesn't enforce admin role for cross-user access. |
| Fix       | Enforce that users can only access their own operation log unless admin. |

### 5.9 — Medium: Duplicate `SERVICE_VERSION` constants (M23)

| Audit Ref | Config Audit: M3                                    |
| --------- | --------------------------------------------------- |
| Files     | `route-helpers.ts`, `index.ts`                      |
| Problem   | Version defined in two places — drift risk.         |
| Fix       | Single source from `package.json` or config module. |

### 5.10 — Medium: `AUTH_DISABLED` env var bypass (M24)

| Audit Ref | Config Audit: H5                                                                              |
| --------- | --------------------------------------------------------------------------------------------- |
| File      | `src/api/middleware/auth.middleware.ts`                                                       |
| Problem   | `AUTH_DISABLED=true` skips all auth — should only work in `NODE_ENV=development`.             |
| Fix       | Guard: `if (process.env.AUTH_DISABLED === 'true' && process.env.NODE_ENV === 'development')`. |

### 5.11 — High: No `unhandledRejection`/`uncaughtException` handlers (H24)

| Audit Ref | Config Audit: H2                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| File      | `src/index.ts`                                                                                                                        |
| Problem   | Unhandled errors crash the process without logging.                                                                                   |
| Fix       | Add `process.on('unhandledRejection', ...)` and `process.on('uncaughtException', ...)` with structured logging and graceful shutdown. |

### 5.12 — High: Graceful shutdown can hang (H25)

| Audit Ref | Config Audit: H3                                                                        |
| --------- | --------------------------------------------------------------------------------------- |
| File      | `src/index.ts`                                                                          |
| Problem   | SIGTERM handler awaits close but no timeout — can hang if Neo4j/Redis don't disconnect. |
| Fix       | Add `setTimeout(() => process.exit(1), 10_000)` as a safety net.                        |

### 5.13 — High: Event consumers configured but never wired (H26)

| Audit Ref | Config Audit: C1                                                                                                                   |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| File      | `src/index.ts`, `src/events/`                                                                                                      |
| Problem   | Event consumer infrastructure exists but is never started in the bootstrap. Events published by other services are never consumed. |
| Fix       | Wire event consumers in bootstrap. If intentionally deferred, document with a feature flag and TODO.                               |

### 5.14 — Medium: Unsafe tool input `as` casts (M25)

| Audit Ref | Config Audit: H6                                                                        |
| --------- | --------------------------------------------------------------------------------------- |
| File      | `src/agents/tools/kg.tools.ts`                                                          |
| Problem   | Tool inputs cast with `as` without runtime validation.                                  |
| Fix       | Validate tool inputs with the Zod schemas already defined in each tool's `inputSchema`. |

### 5.15 — Low: Proof stage is entirely no-op (L8)

| Audit Ref | Domain Audit: B5.4                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| File      | `src/domain/knowledge-graph-service/ckg-mutation-pipeline.ts` L660-680                                                                      |
| Problem   | `VALIDATED→PROVING→PROVEN` adds latency and audit noise for zero functional benefit until TLA+ is implemented.                              |
| Fix       | Document explicitly as "Phase 6 placeholder" in code comment. Add config flag `proofStageEnabled: false` to skip the two no-op transitions. |

### 5.16 — Low: Cypher injection via label interpolation (L9)

| Audit Ref | Infra Audit: H8                                                                                                                                |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| File      | `src/infrastructure/database/neo4j-graph.repository.ts`                                                                                        |
| Problem   | Node labels and relationship types are interpolated into Cypher strings. If a domain value contains special characters, injection is possible. |
| Fix       | Validate/sanitize all labels against a whitelist of allowed characters (`/^[A-Za-z_][A-Za-z0-9_]*$/`).                                         |

### 5.17 — Low: Neo4j `deleteNode` doesn't handle orphaned edges (L10)

| Audit Ref | Infra Audit: H5                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| File      | `src/infrastructure/database/neo4j-graph.repository.ts`                                                                              |
| Problem   | Deleting a node that has edges leaves orphaned relationships (Neo4j `DELETE` requires `DETACH DELETE` for nodes with relationships). |
| Fix       | Use `DETACH DELETE` or explicitly delete edges first.                                                                                |

### 5.18 — Low: Null-caching bug in cache provider (L11)

| Audit Ref | Infra Audit: M7                                                                          |
| --------- | ---------------------------------------------------------------------------------------- |
| File      | `src/infrastructure/cache/kg-redis-cache.provider.ts`                                    |
| Problem   | `null` results are cached — a deleted node stays "not found" in cache until TTL expires. |
| Fix       | Don't cache `null` results, or use a short TTL (e.g., 30s) for negative caches.          |

### 5.19 — Low: Properties lose fidelity through JSON roundtrip (L12)

| Audit Ref | Infra Audit: M8                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------- |
| File      | `src/infrastructure/database/neo4j-mapper.ts`                                                            |
| Problem   | Neo4j Integer and DateTime types may lose precision through JSON serialization.                          |
| Fix       | Add explicit type converters for Neo4j's `Integer` → `number` and `DateTime` → ISO string in the mapper. |

---

## Summary

| Phase     | Focus                                                 | Fixes  | Critical | High   | Medium | Low    |
| --------- | ----------------------------------------------------- | ------ | -------- | ------ | ------ | ------ |
| **1**     | Foundation: Data bugs, type safety, error handling    | 24     | 5        | 7      | 8      | 4      |
| **2**     | Contracts: Repository extensions, interfaces          | 9      | 0        | 3      | 5      | 1      |
| **3**     | Domain logic: Validation, algorithms, semantics       | 12     | 0        | 5      | 5      | 2      |
| **4**     | Architecture: Refactoring, observability, consistency | 8      | 3        | 5      | 0      | 0      |
| **5**     | API, config, polish: Routes, DI, cleanup              | 19     | 1        | 6      | 7      | 5      |
| **Total** |                                                       | **72** | **9**    | **26** | **25** | **12** |

> **Note:** Some original findings were split into multiple actionable items or
> combined where they had the same fix. The total exceeds 67 because several
> audit findings required multiple code changes (e.g., the "approximate total"
> finding affects both `listEdges` and `getOperationLog`).

### Phase Dependency Graph

```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5
  │             │           │           │
  │             │           │           └── 5.* (routes consume refactored services)
  │             │           └── 3.1-3.3 (uses new repo methods from P2)
  │             └── 2.* (extends types/schemas fixed in P1)
  └── 1.* (no external deps, foundational fixes)
```

### Estimated Effort

| Phase     | Effort     | Duration (1 developer) |
| --------- | ---------- | ---------------------- |
| 1         | Medium     | 2-3 days               |
| 2         | Low-Medium | 1-2 days               |
| 3         | Medium     | 2-3 days               |
| 4         | High       | 4-6 days               |
| 5         | Medium     | 2-3 days               |
| **Total** |            | **11-17 days**         |

Phase 4 is the most effort-intensive due to the God-object split (4.3) and
outbox pattern (4.1), both of which touch many files and require careful
interface preservation.
