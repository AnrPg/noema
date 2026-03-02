# ADR-003: Knowledge-Graph-Service Phase 4 — Repository Implementations

## Status

Accepted

## Date

2026-06-02

## Context

Phase 3 (ADR-002, commit `c32b4f8`) defined four repository interfaces with zero
infrastructure knowledge. Phase 4 implements them with concrete infrastructure
code: Neo4j for graph storage, Prisma for relational workflow data, and Redis
for caching hot-path reads. The content-service's `PrismaContentRepository`,
`CachedContentRepository`, and `RedisCacheProvider` served as architectural
references for patterns (optimistic locking, enum mapping, error translation,
cache-as-decorator).

During implementation, four schema-domain mismatches were discovered and
resolved before coding began. All design decisions were presented with options
and approved individually.

---

## Decisions

### D1: Neo4j Relationship Type Strategy — Type-Specific

**Options evaluated:**

| Option               | Description                                               | Trade-off                                |
| -------------------- | --------------------------------------------------------- | ---------------------------------------- |
| A: Generic `:EDGE`   | All edges use a single `:EDGE` type, with `edgeType` prop | Simpler Cypher, but loses Neo4j indexing |
| **B: Type-specific** | Each `GraphEdgeType` maps to an uppercase Neo4j rel type  | Full index leverage, idiomatic Neo4j     |

**Decision:** Option B — Type-specific relationship types. Each `GraphEdgeType`
maps to an uppercase Neo4j relationship type. Schema generates per-type indexes
(edgeId + userId per type). Traversal queries use `[:TYPE1|TYPE2|...]` union
patterns.

> **Addendum (2026-03-02, ADR-010 / Fix 1.1):** The original implementation
> defined only 8 relationship types in a local `ALL_REL_TYPES` constant. The
> canonical `RELATIONSHIP_TYPES` in `neo4j-schema.ts` defines 17 types (adding
> `EQUIVALENT_TO`, `ENTAILS`, `DISJOINT_WITH`, `ANALOGOUS_TO`, `CONTRASTS_WITH`,
> `DEPENDS_ON`, `CONSTITUTED_BY`, `PRECEDES`, `HAS_PROPERTY`). The local
> constant was replaced with a direct import from `neo4j-schema.ts` as the
> single source of truth.

### D2: Schema Evolution (4 additive changes)

Four schema-domain mismatches were discovered during implementation. All are
additive (new columns/tables, no breaking changes).

#### D2a: MisconceptionDetection Table

The domain interface `IMisconceptionRepository.recordDetection()` returns
`IMisconceptionRecord` objects, but no Prisma model existed for detection
instances. Added a `MisconceptionDetection` model with userId, patternId FK,
misconceptionType, affectedNodeIds (String[]), confidence, status, metadata,
timestamps, and 7 indexes including GIN on affectedNodeIds.

#### D2b: CkgMutation — rationale & evidenceCount

`ICkgMutation` has `rationale?: string` and `evidenceCount: number`, but the
Prisma model lacked them. Added `rationale String?` and
`evidenceCount Int @default(0)`.

#### D2c: MisconceptionPattern — misconceptionType & threshold

`IMisconceptionPattern` has `misconceptionType` and `threshold`, but the Prisma
model lacked them. Added `misconceptionType String @db.VarChar(100)`,
`threshold Float @default(0.5)`, and an index on misconceptionType.

#### D2d: AggregationEvidence — optional mutationId & new fields

`IAggregationEvidence` has optional `ckgTargetNodeId`, `proposedLabel`,
`confidence`, and mutationId should be optional (evidence can exist before a
mutation is created). Made `mutationId String?`, added the three new columns
with appropriate defaults and indexes.

### D3: IExecutionContext Extraction

**Decision:** Extract `IExecutionContext` and `IServiceResult<T>` from
`knowledge-graph.service.ts` into a dedicated `execution-context.ts` file. The
service file re-exports both types so the barrel chain remains intact. This
allows infrastructure code to depend on execution context types without pulling
in the full service interface.

### D4: Cache Strategy — Hot-Path Reads Only

**Options evaluated:**

| Option               | Description                                            | Trade-off                                    |
| -------------------- | ------------------------------------------------------ | -------------------------------------------- |
| A: Cache everything  | Cache all reads including traversals                   | High memory, complex invalidation            |
| **B: Hot-path only** | Cache node lookups and edges-for-node, pass traversals | Simple invalidation, covers 80% of reads     |
| C: No caching        | All reads hit Neo4j directly                           | Simplest but poor latency for repeated reads |

**Decision:** Option B — Cache `getNode`, `getEdgesForNode`, `getNodesByIds`.
Traversals (`getAncestors`, `getDescendants`, `getSubgraph`, shortest paths,
cycle detection) pass through to Neo4j directly since they involve graph
algorithms that are expensive to cache and invalidate. Write operations
invalidate affected cache entries; `createNode` pre-populates the cache.

---

## Implementation

### Files Created

| File                                                                                 | Description                                                                    |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `src/infrastructure/database/neo4j-mapper.ts`                                        | 14 exported functions for Neo4j ↔ domain type mapping                          |
| `src/infrastructure/database/neo4j-graph.repository.ts`                              | `Neo4jGraphRepository` implementing all 4 ISP sub-interfaces (~930 lines)      |
| `src/infrastructure/database/repositories/prisma-mutation.repository.ts`             | `PrismaMutationRepository` — optimistic locking, 8-state typestate, audit log  |
| `src/infrastructure/database/repositories/prisma-metrics.repository.ts`              | `PrismaMetricsRepository` — snapshot CRUD with history & retention             |
| `src/infrastructure/database/repositories/prisma-misconception.repository.ts`        | `PrismaMisconceptionRepository` — pattern/template/detection lifecycle         |
| `src/infrastructure/database/repositories/prisma-operation-log.repository.ts`        | `PrismaOperationLogRepository` — append-only with sequence numbers             |
| `src/infrastructure/database/repositories/prisma-aggregation-evidence.repository.ts` | `PrismaAggregationEvidenceRepository` — evidence with PromotionBand            |
| `src/infrastructure/database/repositories/index.ts`                                  | Barrel export for all 5 Prisma repositories                                    |
| `src/infrastructure/database/index.ts`                                               | Barrel export for database layer (Neo4j + Prisma)                              |
| `src/infrastructure/cache/kg-redis-cache.provider.ts`                                | `KgRedisCacheProvider` — fail-safe Redis wrapper with KG-specific key builders |
| `src/infrastructure/cache/cached-graph.repository.ts`                                | `CachedGraphRepository` — decorator implementing `IGraphRepository`            |
| `src/infrastructure/cache/index.ts`                                                  | Barrel export for cache layer                                                  |
| `src/domain/knowledge-graph-service/execution-context.ts`                            | Extracted `IExecutionContext` and `IServiceResult<T>` (D3)                     |

### Files Modified

| File                                                            | Change                                                |
| --------------------------------------------------------------- | ----------------------------------------------------- |
| `prisma/schema.prisma`                                          | D2a–D2d: new model, new columns, optional FK, indexes |
| `src/infrastructure/database/neo4j-schema.ts`                   | D1: type-specific relationship indexes                |
| `src/domain/knowledge-graph-service/knowledge-graph.service.ts` | D3: import + re-export from execution-context.ts      |

### Key Patterns Replicated from Content-Service

1. **Optimistic locking**: `where: { id, version }` → P2025 catch → re-query →
   throw `MutationConflictError` or `MutationNotFoundError`
2. **Enum mapping**: Domain lowercase ↔ Prisma UPPERCASE via `toUpperCase()`/
   `toLowerCase()` with dedicated `toDbState`/`fromDbState` helpers
3. **JSON double-cast**: `data as unknown as Prisma.JsonObject` for metadata
4. **Branded ID generation**: `nanoid()` with service-specific prefixes
   (`node_`, `edge_`, `mut_`, `mpat_`, `intv_`, `snap_`, `oplog_`, `evid_`)
5. **Error translation**: Neo4j constraint violations → `DuplicateNodeError`,
   transient errors → `GraphConsistencyError`; Prisma P2025 → domain errors
6. **Cache-as-decorator**: `CachedGraphRepository` wraps `IGraphRepository`,
   write-through invalidation, fail-safe Redis (never throws)
7. **Per-operation sessions**: Neo4j sessions created and closed within each
   method, not shared across calls

### Neo4j Driver Notes

- `ManagedTransaction` type used for `executeRead`/`executeWrite` callbacks (not
  `Transaction`, which is the full session-level type)
- `neo4j.int()` used for Integer coercion (static import, not dynamic)
- Variable-length path patterns for traversals: `*1..{maxDepth}`
- `shortestPath()` built-in for path finding
- UNWIND for batch node creation with follow-up SET for secondary labels

---

## Consequences

### Positive

- All 4 Phase 3 repository interfaces now have working implementations
- Type-specific Neo4j relationships enable per-type index scans
- Fail-safe cache layer prevents Redis failures from cascading
- Schema additions are backward-compatible (additive only)
- `exactOptionalPropertyTypes` compliance maintained throughout

### Negative

- Neo4j batch edge creation uses a loop within a single transaction (no UNWIND
  for heterogeneous relationship types) — acceptable for typical batch sizes
- SCAN-based cache pattern deletion (`delPattern`) is O(n) — acceptable for
  moderate key counts, may need optimization at scale
- Secondary label SET after UNWIND batch create requires a follow-up transaction
  — a Neo4j limitation for dynamic labels

### Risks

- Prisma generate must be run before typechecking (generated client is outside
  `src/` at `generated/prisma/`)
- Neo4j connection pool settings need tuning for production workloads
- Cache TTL values need empirical tuning based on read/write ratios

---

## References

- Phase 3 domain layer: ADR-002 (commit `c32b4f8`)
- Content-service patterns: `PrismaContentRepository`, `CachedContentRepository`
- Phase 4 spec:
  `docs/knowledge-graph-service-implementation/PHASE-4-REPOSITORIES.md`
- ADR-010: Remediation Phase 1 (D1 relationship type sync)
- ADR-011: Remediation Phase 2 (repository extensions, cache key scoping)

## Addendum — Phase 2 Remediation (2026-03-02, ADR-011)

The following repository changes were applied during remediation Phase 2:

| Decision                      | Change                                                                                                      | Rationale                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| D1 — countEdges               | Added `countEdges(filter, userId?)` to `IEdgeRepository`; Neo4j uses `count(r)` with same filter clauses    | `listEdges` was faking totals; dedicated count enables correct pagination |
| D2 — getEdgesForNodes batch   | Added `getEdgesForNodes(nodeIds[], filter?, userId?)` to `IEdgeRepository`; single batched Cypher query     | Eliminates N+1 queries in `fetchDomainSubgraph`                           |
| D5 — IReadOnlyGraphRepository | New `IReadOnlyGraphRepository` extending `ITraversalRepository` with read-only node/edge methods            | CKG immutability enforced at type level                                   |
| D7 — Cache key scoping        | All cache keys prefixed with `${userId ?? 'ckg'}:` via 4 private key helpers                                | Eliminates cross-user cache pollution (security fix)                      |
| D9 — ITransactional mixin     | Extracted `ITransactional<T>` generic interface; `IGraphRepository` uses `ITransactional<IGraphRepository>` | Enables future transactional composition on sub-interfaces                |
