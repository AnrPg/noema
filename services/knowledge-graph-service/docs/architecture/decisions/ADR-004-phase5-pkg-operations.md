# ADR-004: Knowledge-Graph-Service Phase 5 — PKG Operations & Service Layer

## Status

Accepted

## Date

2026-06-03

## Context

Phase 4 (ADR-003, commit `a332eb8`) implemented concrete repository classes
(Neo4j, Prisma, Redis cache) for the domain interfaces defined in Phase 3. Phase
5 introduces the **service layer** — the `KnowledgeGraphService` class that
orchestrates repository calls, validates inputs, enforces edge policies,
publishes domain events, and generates agent hints.

Before implementation, four design decisions required resolution. Each was
evaluated with at least two options; the user approved one per decision.

---

## Decisions

### D1: Scope Reconciliation — Spec vs Interface Mismatch

**Problem:** The Phase 5 spec mandated full edge CRUD (including `getEdge`,
`updateEdge`, `listEdges`) but the `IKnowledgeGraphService` interface from Phase
3 only had `createEdge` and `deleteEdge`.

| Option                  | Description                                      | Trade-off                                    |
| ----------------------- | ------------------------------------------------ | -------------------------------------------- |
| A: Defer to spec limits | Only implement what the interface defines        | Loses edge retrieval/update; spec incomplete |
| **B: Extend interface** | Add `getEdge`, `updateEdge`, `listEdges` + event | More surface area; matches user mental model |

**Decision:** Option B — Extended `IKnowledgeGraphService` with three new edge
methods, added `IUpdateEdgeInput` and `IEdgeFilter` types, and created the
`PKG_EDGE_UPDATED` domain event with full payload schema.

### D2: Input Validation Strategy

| Option             | Description                                    | Trade-off                                        |
| ------------------ | ---------------------------------------------- | ------------------------------------------------ |
| **A: Zod schemas** | Validate at service boundary using `safeParse` | Runtime safety, structured errors, some overhead |
| B: TypeScript-only | Rely on static types, validate at API boundary | No runtime cost, but no runtime safety           |

**Decision:** Option A — Created `knowledge-graph.schemas.ts` with Zod schemas
for all input types (`CreateNodeInputSchema`, `UpdateNodeInputSchema`,
`CreateEdgeInputSchema`, `UpdateEdgeInputSchema`, `EdgeFilterSchema`,
`PaginationSchema`). Follows the content-service pattern where `safeParse`
failures throw `ValidationError` with structured `fieldErrors`.

### D3: Operation Log — Before/After Tracking

| Option                   | Description                                 | Trade-off                            |
| ------------------------ | ------------------------------------------- | ------------------------------------ |
| **A: Full before/after** | Track field name, previous value, new value | Complete audit trail; higher storage |
| B: Field names only      | Track which fields changed; no values       | Smaller log; loses change context    |

**Decision:** Option A — `updateNode` and `updateEdge` fetch the existing entity
before mutation, compute `changedFields` arrays with `{ field, before, after }`
triples, and include them in both the operation log and the domain event
payload.

### D4: Metrics Staleness Mechanism

| Option                        | Description                                    | Trade-off                     |
| ----------------------------- | ---------------------------------------------- | ----------------------------- |
| **A: Prisma staleness table** | Dedicated `MetricsStaleness` model in Postgres | Explicit, queryable, simple   |
| B: Operation log inference    | Derive staleness from log timestamps           | No extra table; complex query |
| C: Redis TTL                  | Cache staleness flag with expiration           | Fast; loses state on restart  |

**Decision:** Option A — Added `MetricsStaleness` Prisma model with
`@@unique([userId, domain])`. Created `IMetricsStalenessRepository` interface
with `markStale`, `isStale`, and `getStalenessRecord` methods. The service layer
calls `markStale` after every mutating operation (non-blocking — failures are
logged but do not propagate).

---

## Implementation

### New Files (4)

| File                               | Purpose                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| `knowledge-graph.service.impl.ts`  | `KnowledgeGraphService` class (~1530 lines) implementing `IKnowledgeGraphService` |
| `knowledge-graph.schemas.ts`       | Zod input validation schemas (6 schemas)                                          |
| `metrics-staleness.repository.ts`  | `IMetricsStalenessRepository` interface + `IMetricsStalenessRecord` type          |
| `domain/shared/event-publisher.ts` | Re-exports `IEventPublisher` from `@noema/events/publisher`                       |

### Modified Files (12)

| File                               | Change                                                           |
| ---------------------------------- | ---------------------------------------------------------------- |
| `knowledge-graph.service.ts`       | Added `getEdge`, `updateEdge`, `listEdges` methods               |
| `graph.repository.ts`              | Added `IUpdateEdgeInput`, `updateEdge` to `IEdgeRepository`      |
| `domain-events.ts`                 | Changed `KnowledgeGraphEventType` from type-only to value export |
| `index.ts` (domain barrel)         | Added exports for new files, schemas, and implementation         |
| `knowledge-graph.events.ts`        | Added `PKG_EDGE_UPDATED` event type, payload, typed alias        |
| `knowledge-graph-event.schemas.ts` | Added `PkgEdgeUpdatedPayloadSchema` + full event schema          |
| `events/src/index.ts`              | Changed `export type *` → `export *` for KG events               |
| `schema.prisma`                    | Added `MetricsStaleness` model                                   |
| `neo4j-graph.repository.ts`        | Added `updateEdge` implementation                                |
| `cached-graph.repository.ts`       | Added `updateEdge` cache-through with invalidation               |
| `neo4j-mapper.ts`                  | Import ordering (prior auto-fix)                                 |
| `ADR-002-phase3-domain-layer.md`   | Prior phase updates                                              |

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    KnowledgeGraphService                     │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────┐ │
│  │  Zod     │  │  Edge    │  │  Op Log   │  │  Event    │ │
│  │  Schemas │  │  Policies│  │  Append   │  │  Publish  │ │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘  └─────┬─────┘ │
│       │              │              │              │        │
│       ▼              ▼              ▼              ▼        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              IGraphRepository (Neo4j)                │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         IMetricsStalenessRepository (Prisma)         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Method Flow (Mutating Operations)

```
1. requireAuth(context)          — Guard: userId present
2. validateInput(ZodSchema)      — Zod safeParse → ValidationError
3. repository.get*()             — Fetch existing for before/after (D3a)
4. enforcePolicy()               — Edge policies, acyclicity, node types
5. repository.create/update/delete() — Execute mutation
6. operationLog.appendOperation()    — Audit trail with changedFields
7. eventPublisher.publish()          — Domain event for downstream consumers
8. staleness.markStale()             — Non-blocking staleness flag (D4a)
9. return { data, agentHints }       — Rich context bundle
```

### Phase 7 Stubs

The following methods throw `Error('Not implemented: ... is Phase 7')`:

- `computeMetrics`, `getMetrics`, `getMetricsHistory`
- `detectMisconceptions`, `getMisconceptions`, `updateMisconceptionStatus`
- `compareWithCkg`

These are declared as non-async (no `await`) to satisfy
`@typescript-eslint/require-await`.

## Consequences

### Positive

- Complete PKG CRUD surface: 5 node methods + 5 edge methods + 4 traversal + 3
  CKG read
- Full auditability via before/after operation logs
- Rich agent hints with contextual next-action suggestions
- Edge policy enforcement at the service layer (acyclicity, node type, weight)
- Clean separation: service → repository → infrastructure
- Metrics staleness decoupled from metrics computation

### Negative

- Service file is large (~1530 lines) — may need extraction in later phases
- `listEdges` performs in-memory pagination (findEdges returns all, then slices)
- Phase 7 stubs exist as dead code until implemented

### Risks

- The `KnowledgeGraphEventType` re-export change (`export type *` → `export *`)
  widens the events package surface; downstream consumers importing it as a
  value are now supported rather than erroring
