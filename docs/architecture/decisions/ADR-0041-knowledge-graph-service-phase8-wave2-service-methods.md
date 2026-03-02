# ADR-0041: Knowledge Graph Service Phase 8 — REST API Layer (Wave 2)

**Status:** Accepted **Date:** 2025-01-28 **Deciders:** Architecture Team
**Relates to:** ADR-0040, PHASE-8-API-EVENTS.md,
PHASE-8-INFRASTRUCTURE-GAP-ANALYSIS.md

## Context

Wave 1 (ADR-0040) shipped 28 route handlers for service methods that were
already implemented. Seven endpoints were tagged ⚠️ Partial in the
infrastructure gap analysis because they needed **new service-layer methods**
before route handlers could be written:

| Endpoint                                 | Missing Method              |
| ---------------------------------------- | --------------------------- |
| GET `/ckg/edges`                         | `listCkgEdges`              |
| GET `/ckg/edges/:edgeId`                 | `getCkgEdge`                |
| GET `/ckg/traversal/ancestors/:nodeId`   | `getCkgAncestors`           |
| GET `/ckg/traversal/descendants/:nodeId` | `getCkgDescendants`         |
| GET `/ckg/traversal/path`                | `findCkgPath`               |
| GET `/ckg/mutations/health`              | `getMutationPipelineHealth` |
| GET `/users/:userId/pkg/operations`      | `getOperationLog`           |

Wave 2 fills every gap: 7 new service methods, 3 new route files, 1 extended
route file, 3 new Zod schema files, and updated barrels + bootstrap.

## Decision

### D1: CKG Edge Scoping via `graphType` Field

CKG edge queries reuse the existing `findEdges` / `getEdge` repository methods
but scope to the canonical graph by checking `edge.graphType !== GraphType.CKG`
(rejecting non-CKG edges). This is asymmetric with PKG edge methods that scope
via `userId` — a deliberate choice because CKG is a shared, user-agnostic graph.

### D2: CKG Traversal — Omit `userId` Parameter

The underlying `getAncestors`, `getDescendants`, and `findPath` repository
methods accept an optional `userId` parameter; when omitted, the query runs
against CKG nodes. The new CKG wrapper methods (`getCkgAncestors`,
`getCkgDescendants`, `findCkgPath`) simply omit `userId` and validate that the
starting node has `graphType === GraphType.CKG` before delegating.

### D3: Operation Log Smart Dispatch

`getOperationLog` examines the `IOperationLogFilter` fields in priority order
and delegates to the most specific `IPkgOperationLogRepository` method:

1. `nodeId` → `getOperationsForNode(userId, nodeId)`
2. `edgeId` → `getOperationsForEdge(userId, edgeId)`
3. `operationType` → `getOperationsByType(userId, operationType)`
4. `since` → `getOperationsSince(userId, since)`
5. (none) → `getOperationHistory(userId)`

For non-paginated repository returns (arrays), the service applies manual
`offset` / `limit` slicing and synthesizes `total`, `hasMore`, and `items`.

### D4: Pipeline Health Result Shape

`getMutationPipelineHealth` delegates to
`CkgMutationPipeline.getPipelineHealth()` and adds a `totalCount` field (sum of
all per-state counts). If `stuckCount > 0`, the response includes an agent hint
warning about stuck mutations requiring attention — enabling the
governance-agent to act autonomously.

### D5: Route File Organisation (3 New + 1 Extended)

| File                                | Tag            | Endpoints                                  |
| ----------------------------------- | -------------- | ------------------------------------------ |
| `ckg-edge.routes.ts` (NEW)          | CKG Edges      | 2 (list, get)                              |
| `ckg-traversal.routes.ts` (NEW)     | CKG Traversal  | 4 (subgraph, ancestors, descendants, path) |
| `pkg-operation-log.routes.ts` (NEW) | PKG Operations | 1 (list with filters)                      |
| `ckg-mutation.routes.ts` (EXT)      | CKG Mutations  | +1 (GET /health, before `:mutationId`)     |

The health endpoint is registered **before** the `/:mutationId` parameterised
route to prevent Fastify from matching "health" as a mutation ID.

### D6: Schema Design — Self-Contained Enums

`PkgOperationTypeValues` is defined inline in `pkg-operation-log.schemas.ts` as
a `const` array rather than importing from the domain layer. This keeps the API
schema layer self-contained and avoids coupling Zod validation to domain enum
internals.

### D7: Two New Supporting Types

- `IOperationLogFilter` — `{ operationType?, nodeId?, edgeId?, since? }` —
  determines dispatch routing in the service method.
- `IPipelineHealthResult` —
  `{ proposedCount, validatingCount, validatedCount, committedCount, rejectedCount, stuckCount, totalCount }`
  — typed return for the pipeline health endpoint.

Both are exported from the service interface module alongside
`IKnowledgeGraphService` for use by route handlers and tests.

## Consequences

### Positive

- All 35 endpoints (28 Wave 1 + 7 Wave 2) now have route handlers, schema
  validation, and service method implementations.
- Agent-observable: the `/ckg/mutations/health` endpoint enables the
  governance-agent to monitor pipeline health without direct DB access.
- Operation log pagination is consistent with the rest of the API (offset/limit
  envelope) despite the underlying repository methods returning arrays.

### Negative

- Manual pagination in `getOperationLog` for array-returning repository methods
  is less efficient than DB-level pagination. Acceptable for the expected
  cardinalities (~1000s of entries per user).
- 7 new methods increase the interface surface of `IKnowledgeGraphService` (now
  ~25 methods). Partial interface extraction may be warranted in Phase 9.

### Risks

- The `null as unknown as IKnowledgeGraphService` service stub in `src/index.ts`
  still prevents runtime use. Full DI wiring remains tech debt (tracked in
  ADR-0040 TODO).
