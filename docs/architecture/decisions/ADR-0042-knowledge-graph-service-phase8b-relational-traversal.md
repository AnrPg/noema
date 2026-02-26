# ADR-0042: Knowledge Graph Service Phase 8b — Relational Traversal Endpoints

**Status:** Accepted **Date:** 2025-01-28 **Deciders:** Architecture Team
**Relates to:** ADR-0040, ADR-0041, PHASE-8b-RELATIONAL-TRAVERSAL-ENDPOINTS.md

## Context

Phases 8 (ADR-0040) and 8 Wave 2 (ADR-0041) shipped 35 traversal route
handlers covering subgraph, ancestor/descendant, and path queries. However, the
graph API lacks **relational** traversal primitives that agents need for
structural analysis: siblings, co-parents, and N-hop neighborhood exploration.

Phase 8b adds three new relational traversal endpoints, each available for
both PKG (user-scoped) and CKG (shared canonical) graphs — 6 route handlers
total.

| Endpoint         | PKG Route                                                    | CKG Route                                    |
| ---------------- | ------------------------------------------------------------ | --------------------------------------------- |
| **Siblings**     | `GET /users/:userId/pkg/traversal/siblings/:nodeId`          | `GET /ckg/traversal/siblings/:nodeId`          |
| **Co-Parents**   | `GET /users/:userId/pkg/traversal/co-parents/:nodeId`        | `GET /ckg/traversal/co-parents/:nodeId`        |
| **Neighborhood** | `GET /users/:userId/pkg/traversal/neighborhood/:nodeId`      | `GET /ckg/traversal/neighborhood/:nodeId`      |

## Decision

### D1: Value Objects in `graph.value-objects.ts`

New query/result types (`ISiblingsQuery`, `ICoParentsQuery`,
`INeighborhoodQuery` and their result counterparts) are added to the existing
value objects module. Factory methods (`SiblingsQuery.create()`, etc.) enforce
invariants (e.g., hops ∈ [1, 10], maxPerGroup ∈ [1, 100]) and freeze the
resulting objects.

### D2: Repository Signatures — Three New Methods on `ITraversalRepository`

```typescript
getSiblings(nodeId, query: ISiblingsQuery, userId?): Promise<ISiblingsResult>
getCoParents(nodeId, query: ICoParentsQuery, userId?): Promise<ICoParentsResult>
getNeighborhood(nodeId, query: INeighborhoodQuery, userId?): Promise<INeighborhoodResult>
```

Optional `userId` enables the same repository method to serve both PKG
(user-scoped) and CKG (no userId) queries.

### D3: Neo4j Cypher — Direction-Dispatched Rendezvous Patterns

**Siblings** use a 2-hop rendezvous pattern:
- Outbound: `(me)-[e1:TYPE]->(parent)<-[e2:TYPE]-(sibling)`
- Inbound: `(parent)-[e1:TYPE]->(me), (parent)-[e2:TYPE]->(sibling)`

**Co-Parents** mirror siblings with child-oriented grouping.

**Neighborhood** implements two filter modes:
- `full_path`: Variable-length typed path `(origin)-[rels:TYPES*1..hops]-(neighbor)` — all edges on the path must match the specified types.
- `immediate`: First hop filtered by specified types, subsequent hops untyped — allows discovery beyond the initial edge type constraint.

### D4: Cache Decorator — Pass-Through with TODOs

The `CachedGraphRepository` delegates the three new methods directly to the
inner repository. Cache key design for relational results requires further
analysis (tracked as TODO comments) due to the combinatorial query parameters.

### D5: Service Methods — 6 New (3 PKG + 3 CKG)

PKG methods (`getSiblings`, `getCoParents`, `getNeighborhood`) follow the
existing auth → verify node → delegate → hint pattern. CKG counterparts
(`getCkgSiblings`, `getCkgCoParents`, `getCkgNeighborhood`) omit userId and
validate `graphType === GraphType.CKG`.

### D6: Agent Hints — Domain-Aware Pedagogical Hints

Each endpoint produces rich `IAgentHints`:
- **Siblings**: SCE remediation suggestions when large IS_A/PART_OF groups are detected (>20 siblings suggests ontological over-generalization).
- **Co-Parents**: Scope overlap warnings when >5 co-parents share a child (signals concept ambiguity).
- **Neighborhood**: Edge-type diversity analysis and hub detection for neighborhoods exceeding the group cap.

### D7: Zod Schemas — Boolean Transform for Query Strings

Query string booleans use `z.enum(['true', 'false']).transform(v => v === 'true')` rather than `z.coerce.boolean()`, which would coerce any truthy string to `true`. This ensures only literal `"true"` maps to `true`.

A shared `parseNodeTypesFilter()` helper (mirroring existing `parseEdgeTypesFilter()`) validates comma-separated node type strings against `GraphNodeTypeSchema`.

### D8: Neighborhood Filter Mode Default — `full_path`

The default `filterMode` is `full_path` (restrictive) rather than `immediate`
(permissive). This prevents agents from receiving unexpectedly large result sets
when exploring unfamiliar regions of the graph. Agents can explicitly opt into
`immediate` mode when they want broader discovery.

### D9: Route Handlers — Added to Existing Registration Functions

The 6 new routes are appended inside the existing `registerPkgTraversalRoutes`
and `registerCkgTraversalRoutes` functions. No new route files or bootstrap
changes are needed.

## Consequences

### Positive

- Agents gain three powerful relational primitives for structural analysis
  without raw Cypher access.
- The neighborhood endpoint's dual filter modes balance precision (`full_path`)
  and exploration (`immediate`).
- Agent hints encode pedagogical domain knowledge (SCE remediation, scope
  overlap, hub detection) that would otherwise require separate analysis.
- All 41 endpoints (35 prior + 6 new) share the same auth, validation, and
  error-handling patterns.

### Negative

- Three new methods on `IGraphRepository` and `IKnowledgeGraphService` further
  increase interface surface. Partial interface extraction remains deferred.
- `Neo4jTransactionalGraphRepository` gains 3 stub methods that throw — these
  are never called during the commit protocol but are required to satisfy the
  interface contract.

### Risks

- Neighborhood queries with high `hops` values (up to 10) and no edge type
  filter on a dense graph could be expensive. The `maxPerGroup` cap and
  `full_path` default mitigate this, but monitoring is advised once live traffic
  begins.
- Cache pass-through means every relational query hits Neo4j. This is acceptable
  for the current query patterns but should be revisited when usage metrics
  indicate caching ROI.
