# ADR-011: Remediation Phase 2 — Contracts & Interfaces

**Status:** Accepted
**Date:** 2026-03-02
**Commit:** `771b345`

## Context

The Phase 6/7 compliance audit (ADR-007) identified 67 findings across the
knowledge-graph-service. Phase 2 of the remediation plan addresses 9 findings
focused on extending repository interfaces, fixing cache security, and adding
proper DI interfaces. These changes provide the foundation that Phase 3+ domain
logic fixes depend on.

Phase 1 (ADR-010) fixed data bugs, type safety, and error handling at the lowest
layers — Phase 2 builds on those corrected types and schemas.

## Decisions

### D1: `countEdges(filter)` on `IEdgeRepository` (Fix 2.1)

Added `countEdges(filter: IEdgeFilter, userId?: string): Promise<number>` to
`IEdgeRepository`. The Neo4j implementation uses `count(r)` with the same filter
clause generation as `findEdges`, ensuring consistency. The cache decorator
passes through without caching (count queries are cheap and shouldn't be stale).

**Rationale:** `listEdges` was faking total counts as `offset + items.length`,
making `hasMore` always `false`. A dedicated count method enables correct
pagination.

### D2: Batch `getEdgesForNodes` on `IEdgeRepository` (Fix 2.2)

Added `getEdgesForNodes(nodeIds: readonly NodeId[], filter?: IEdgeFilter, userId?: string): Promise<IGraphEdge[]>`.
The Neo4j implementation uses a single Cypher query with
`WHERE source.nodeId IN $nodeIds OR target.nodeId IN $nodeIds`, eliminating N+1
queries in `fetchDomainSubgraph`.

**Rationale:** The existing code issued one `getEdgesForNode` call per node in a
subgraph traversal — O(N) round trips to Neo4j. A single batched query reduces
this to O(1).

### D3: `countOperations` on `IPkgOperationLogRepository` (Fix 2.3)

Added `countOperations(userId: UserId, filters?: IOperationLogFilter): Promise<number>`.
The Prisma implementation uses `prisma.pkgOperationLog.count()` with the same
filter translation as `getOperationLog`.

**Rationale:** Same pagination issue as `countEdges` — the operation log was
approximating total counts.

### D4: `ICkgMutationPipeline` interface (Fix 2.4)

Created new file `ckg-mutation-pipeline.interface.ts` with a full DI-friendly
interface for the CKG mutation lifecycle pipeline. The `CkgMutationPipeline`
class now `implements ICkgMutationPipeline`.

Methods: `proposeMutation`, `getMutation`, `listActiveMutations`,
`cancelMutation`, `retryMutation`, `getAuditLog`, `approveMutation`,
`rejectEscalatedMutation`, `proposeFromAggregation`, `getPipelineHealth`,
`runPipelineAsync`, `recoverStuckMutations`.

**Rationale:** The pipeline was a concrete class with no DI interface, making it
impossible to mock in integration tests or swap implementations.

### D5: `IReadOnlyGraphRepository` (Fix 2.5)

Defined `IReadOnlyGraphRepository` extending `ITraversalRepository` and adding
read-only methods from `INodeRepository` and `IEdgeRepository` (getNode,
findNodes, getEdge, findEdges, getEdgesForNode, getEdgesForNodes, getNodesByIds).

**Rationale:** CKG immutability was implicit — any service receiving
`IGraphRepository` could call write methods. `IReadOnlyGraphRepository` enforces
read-only access at the type level.

### D6: `recoveryAttempts` on `ICkgMutation` (Fix 2.6)

Added `recoveryAttempts: number` (readonly, default 0) to `ICkgMutation` and
`incrementRecoveryAttempts(mutationId)` to `IMutationRepository`. Updated Prisma
schema with `recoveryAttempts Int @default(0) @map("recovery_attempts")` column.

**Rationale:** `recoverStuckMutations` had no max retry guard — permanently
failing mutations would retry forever. Phase 3 will add the
`recoveryAttempts >= MAX_RECOVERY` check.

**Note:** The Prisma schema column is added but the migration has not been run.
This will be addressed when deploying to an environment with a live database.

### D7: Cache key scoping by userId (Fix 2.7)

All cache keys in `CachedGraphRepository` are now prefixed with
`${userId ?? 'ckg'}:`. Four private helpers enforce consistent key generation:
- `scopedNodeKey(nodeId, userId?)` → `${uid}:node:${nodeId}`
- `scopedEdgesForNodeKey(nodeId, direction, userId?)` → `${uid}:edges:${nodeId}:${direction}`
- `scopedEdgesForNodePattern(nodeId, userId?)` → `${uid}:edges:${nodeId}:*`
- `scopedNodesByIdsKey(hash, userId?)` → `${uid}:nodes-batch:${hash}`

The fallback `'ckg'` prefix is used for CKG operations where no userId is
provided, ensuring CKG and PKG cache spaces are always separate.

**Rationale:** Cache keys without userId allowed cross-user cache pollution —
User A's PKG nodes could be served to User B from cache. This was a security
vulnerability.

### D8: Cache invalidation verification (Fix 2.8)

Verified all write operations in `CachedGraphRepository` properly invalidate
affected cache entries using the new scoped key helpers:
- `createNode` → invalidates scoped node key
- `updateNode` → invalidates scoped node key + edge patterns
- `deleteNode` → invalidates scoped node key + edge patterns
- `createEdge` / `updateEdge` / `removeEdge` → invalidates source + target edge patterns
- Batch operations → invalidate per-node keys

**Rationale:** Write-through cache was already partially implemented. The fix
ensures all paths use the new scoped keys consistently.

### D9: `ITransactional<T>` mixin (Fix 2.9)

Extracted a generic `ITransactional<T>` interface:
```typescript
interface ITransactional<T> {
  runInTransaction<R>(fn: (txRepo: T) => Promise<R>): Promise<R>;
}
```

`IGraphRepository` now extends `ITransactional<IGraphRepository>` instead of
defining `runInTransaction` inline. This is backward-compatible — existing
callers see the same method signature.

**Rationale:** Transaction support was only on the composite
`IGraphRepository`. The mixin pattern enables future composition where
individual sub-interfaces can also be transactional.

## Alternatives Considered

1. **Separate cache layer per user** — Rejected; too complex. Scoped keys
   achieve the same isolation with minimal change.
2. **Abstract factory for cache keys** — Rejected; the four private helpers are
   simpler and sufficient. An abstract factory adds unnecessary indirection.
3. **`IReadOnlyGraphRepository` as a separate file** — Rejected; it's small
   (~10 methods) and logically part of the repository interface hierarchy in
   `graph.repository.ts`.

## Consequences

- Phase 3 can now use `countEdges`, `getEdgesForNodes`, and `countOperations`
  for correct pagination and batch queries.
- Phase 3 can use `recoveryAttempts` to implement max retry guards.
- All cache operations are now userId-scoped — eliminates cross-user pollution.
- `ICkgMutationPipeline` enables proper DI and testability for integration tests.
- `IReadOnlyGraphRepository` provides type-safe read-only access for CKG consumers.
- Migration for `recoveryAttempts` column needs to be run before deployment.

## Follow-up Work (Deferred to Phase 3+)

- **Phase 3.1:** Use `getEdgesForNodes` in `fetchDomainSubgraph` to eliminate N+1.
- **Phase 3.2:** Use `countEdges` in pagination responses for correct `hasMore`.
- **Phase 3.3:** Use `countOperations` in operation log pagination.
- **Phase 3.8:** Add `recoveryAttempts >= MAX_RECOVERY` guard in `recoverStuckMutations`.
- **Phase 4:** Wire `ICkgMutationPipeline` into route handlers via DI container.
- **Phase 4:** Use `IReadOnlyGraphRepository` for CKG read endpoints.
