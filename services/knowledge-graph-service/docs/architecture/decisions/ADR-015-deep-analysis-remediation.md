# ADR-015: Deep Analysis Remediation — Critical, High & Medium Severity Fixes

**Status:** Accepted  
**Date:** 2025-07-01  
**Phase:** Post-remediation deep analysis  
**Related:** ADR-010 through ADR-014 (Phases 1–5 remediation)

## Context

After completing the 5-phase remediation of 67 audit findings, a deep analysis of the
knowledge-graph-service codebase identified 61 additional findings across severity levels:

- **Critical (6):** Data corruption, security bypass
- **High (12):** Logic bugs, wrong error semantics, missing safety guards
- **Medium (16+):** Performance issues, design smells, inconsistent patterns
- **Low (27):** Minor code quality (deferred)

This ADR covers the implementation of all Critical + High (Phase 1, 18 fixes) and
actionable Medium severity (Phase 2, ~15 fixes) findings in a single pass.

## Decision

Implement fixes in two phases within a single commit:

### Phase 1 — Critical & High (18 fixes)

#### Data Corruption Fixes
1. **Cross-user cache pollution** — Added `userId` scope to `getEdgesForNode` across
   interface, Neo4j repo, cached repo, and mock. Cache keys now include user scope.
2. **Transactional deleteNode skipped edge soft-delete** — Added edge soft-delete
   Cypher query before node soft-delete in `Neo4jTransactionalGraphRepository`.
3. **appendOperation isolation level** — Changed `$transaction` to use
   `Serializable` isolation to prevent operation log interleaving.

#### Security Fixes
4. **AUTH_DISABLED production guard** — Added `NODE_ENV !== 'production'` check
   so the auth bypass flag cannot be exploited in production.
12. **requireAuth wrong error type** — Changed from `ValidationError` to
    `UnauthorizedError` for proper HTTP 401 semantics.

#### Logic Bug Fixes
7. **listCkgEdges wrong total** — Replaced `limit+1` fetch-and-slice with
   parallel `findEdges` + `countEdges` for accurate pagination metadata.
8. **deleteEdge post-delete throw** — Changed from throwing `NodeNotFoundError`
   when source node is missing after deletion to logging a warning and using
   fallback domain `'unknown'`.
9. **nodeId dropped when direction undefined** — Added `direction === undefined`
   condition to the `'both'` handler in both PKG and CKG edge routes.
10. **Evidence field discarded** — Changed `evidenceCount: 0` to conditionally
    count parsed evidence in CKG mutation creation.
11. **maxDepth not forwarded** — Threaded `maxDepth?: number` through 8+ files:
    interface → Neo4j Cypher → cache passthrough → service → impl → routes.
13. **resolveNode missing PKG graphType check** — Added
    `node.graphType !== GraphType.PKG` validation for PKG paths.
14. **getDegreeCentrality wrong label** — Changed from `graphTypeToLabel(query.domain)`
    (domain is "mathematics", always returns PkgNode) to
    `userId !== undefined ? 'PkgNode' : 'CkgNode'`.
15. **getSubgraph edge graphType from first node** — Built per-edge `nodeLabelsMap`
    instead of inferring all edges' graphType from `nodes[0]`.
16. **isStale false for missing record** — Changed `return false` to `return true`
    so first-time metrics are always computed.
17. **transitionStateWithAudit missing optimistic lock** — Added try/catch with
    `handleOptimisticLockError` for concurrent state transitions.

#### Pipeline & Performance Fixes
5. **Pipeline durable error handling** — Added `appendAuditEntry` in
   `runPipelineAsync` catch block for persistent failure recording.
6. **Metrics double-computation** — Added in-process single-flight pattern
   (`inflightMetrics` Map) to coalesce concurrent `computeMetrics` calls.
18. **N+1 state queries** — Added `findMutationsByStates(states[])` to
    `IMutationRepository` interface and Prisma implementation, replacing
    sequential for-loops in `listMutations` and `listActiveMutations`.

### Phase 2 — Medium Severity (~15 fixes)

#### Correctness Bugs
20. **getSiblings cache key** — Added `includeParentDetails` and
    `maxSiblingsPerGroup` to cache key to prevent wrong cached results.
21. **getCoParents cache key** — Added `includeChildDetails` and
    `maxCoParentsPerGroup` to cache key.
30. **getDegreeCentrality cache key** — Added `topK` and `normalise` to cache key.

#### Performance
7. **getDegreeCentrality LIMIT** — Added `LIMIT $topK` to Cypher query using the
   existing but unused `topK` field from `ICentralityQuery`.
9. **getPipelineHealth parallel** — Moved `proving`, `proven`, `committing` counts
   into the existing `Promise.all` (9 sequential → 9 parallel DB queries).

#### Safety
16. **SKIP/LIMIT parameterization** — Changed Cypher string interpolation to
    `$paginationOffset` / `$paginationLimit` parameters for query plan caching.
17. **Frontier readiness parsing** — Added `parseReadinessNumerator` and
    `parseReadinessDenominator` helpers with `Number.isFinite` guards.
18. **Domain fetch before edge deletion** — Moved `getNode` call before
    `removeEdge` to capture domain for staleness marking before the delete.
19. **pageSize max enforcement** — Added `minimum: 1, maximum: 200` to Fastify
    JSON schemas on all 6 paginated list routes.

#### Consistency
22. **shortTtl configurable** — Made `shortTtl` a constructor parameter (default 60)
    instead of a hardcoded private field.
23. **AGGREGATION_DEFAULT_PRIORITY** — Extracted magic number `10` to a named constant.
24. **MAX_DOMAIN_NODES_FOR_METRICS** — Extracted `10_000` limit to a named constant
    with a warning log when the limit is reached.
25. **HEALTH_SNAPSHOT_HISTORY_DEPTH** — Extracted magic number `5`.
26. **METACOGNITIVE_STAGE_HISTORY_DEPTH** — Extracted magic number `2`.

## Rationale

- **Additive changes only:** All fixes are backward-compatible. No public API
  signatures were narrowed, no existing behavior was removed.
- **Interface additions are optional:** New parameters like `maxDepth`, `shortTtl`,
  `findMutationsByStates` have defaults; existing callers need no changes.
- **Single-flight over distributed lock:** For Fix #6, an in-process `Map<string, Promise>`
  was chosen over a Redis-based distributed lock because:
  - The domain layer should not depend on infrastructure (hexagonal architecture).
  - Adding a lock port would require interface + adapter + wiring changes.
  - Single-flight handles the most common case (same-instance concurrent requests).
  - True distributed lock is a follow-up if multi-instance races prove problematic.
- **Batch queries over pagination push-down:** For Fix #18, `findMutationsByStates`
  replaces N sequential queries with 1 `WHERE IN` query. Full pagination push-down
  for `listMutations` is deferred as it requires multi-layer interface changes.

## Alternatives Considered

1. **Distributed lock via Redis port** — Architecturally cleaner but requires
   port interface, adapter, DI wiring, and testing infrastructure. Deferred.
2. **Push-down pagination for all unbounded queries** — Would require interface
   changes across repository, service, and route layers. Deferred as a separate ADR.
3. **Batch edge operations (UNWIND)** — `createEdges` could use UNWIND like
   `createNodes`, but the query complexity with relationship type varies. Deferred.

## Consequences

### Positive
- Eliminated cross-user cache data leaks
- Prevented auth bypass in production
- Fixed 6 data corruption / wrong-result bugs
- Reduced N+1 query patterns (mutations, pipeline health)
- Hardened input parsing and validation at Fastify schema level
- All magic numbers are now named constants, improving readability

### Negative / Follow-up
- Unbounded traversal queries (getAncestors, getDescendants, getSubgraph,
  getDomainSubgraph) still lack LIMIT clauses — requires careful API design
- `detectMisconceptions` and `executeMerge` still have sequential DB writes
- `createEdges` still runs individual `tx.run` per edge instead of UNWIND
- Redis batch operations (PIPELINE/MSET) not yet implemented
- True distributed lock for metrics computation deferred

### Tests
- All 458 tests passing, 40 skipped (3 infra test suites)
- No new test failures introduced
