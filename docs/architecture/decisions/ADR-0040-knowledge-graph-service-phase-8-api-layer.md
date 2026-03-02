# ADR-0040: Knowledge Graph Service Phase 8 — REST API Layer (Wave 1)

**Status:** Accepted **Date:** 2025-01-27 **Deciders:** Architecture Team
**Relates to:** PHASE-8-API-EVENTS.md, PHASE-8-INFRASTRUCTURE-GAP-ANALYSIS.md

## Context

The knowledge-graph-service has a fully implemented domain layer (Phases 1–7)
covering PKG/CKG CRUD, structural metrics, misconception detection,
metacognitive stage assessment, PKG↔CKG comparison, and the CKG mutation
pipeline. However, it has **no REST API layer** — only a health check endpoint
is registered.

Phase 8, Wave 1 adds **28 route handlers** covering all service methods that are
ready for HTTP exposure without new service-layer work.

## Decision

### D1: One Route File per Functional Group

Routes are split into 9 files aligned to the Swagger tag groupings:

| File                          | Tag               | Endpoints                                        |
| ----------------------------- | ----------------- | ------------------------------------------------ |
| `pkg-node.routes.ts`          | PKG Nodes         | 5 (CRUD + list)                                  |
| `pkg-edge.routes.ts`          | PKG Edges         | 5 (CRUD + list)                                  |
| `pkg-traversal.routes.ts`     | PKG Traversal     | 4 (subgraph, ancestors, descendants, path)       |
| `ckg-node.routes.ts`          | CKG Nodes         | 2 (list, get)                                    |
| `ckg-mutation.routes.ts`      | CKG Mutations     | 6 (propose, list, get, audit-log, cancel, retry) |
| `metrics.routes.ts`           | Metrics           | 3 (get, compute, history)                        |
| `misconception.routes.ts`     | Misconceptions    | 3 (list, detect, update status)                  |
| `structural-health.routes.ts` | Structural Health | 2 (health report, metacognitive stage)           |
| `comparison.routes.ts`        | Comparison        | 1 (compare PKG↔CKG)                              |

**Rationale:** Aligns with the content-service's proven pattern, keeps files
navigable (~200–300 LOC each), and maps cleanly to Swagger tags.

### D2: Shared Route Helpers (Ported from Content Service)

Created `api/shared/route-helpers.ts` containing:

- `buildContext(request)` → `IExecutionContext`
- `wrapResponse(data, agentHints, request)` → `IApiResponse<T>`
- `handleError(error, request, reply, logger)` with 15+ domain error → HTTP
  status mappings
- `assertUserAccess(request, userId)` for PKG user-scoping
- `assertAdminOrAgent(request)` for CKG mutation authorization
- `attachStartTimeHook(fastify)` for execution time tracking

### D3: Auth Middleware & Token Verifier

Ported the content-service's JWT verification pattern:

- `JwtTokenVerifier` in `infrastructure/external-apis/token-verifier.ts`
- `createAuthMiddleware(tokenVerifier)` in `api/middleware/auth.middleware.ts`
- Augments `FastifyRequest` with `user?: ITokenPayload`

### D4: Split Schemas per Route Group

Zod validation schemas are co-located per route group in `api/schemas/`:

- URL parameter schemas (params)
- Query parameter schemas (querystring)
- Request body schemas

Each schema file exports typed inferences for downstream consumption.

### D5: Route Registration Pattern

Each route file exports a
`registerXxxRoutes(fastify, service, authMiddleware, routeOptions?)` function
that:

1. Attaches the start-time hook
2. Defines each route with inline Swagger schema
3. Validates requests with Zod (parse inside handler, not via Fastify schema
   compiler)
4. Maps domain value objects with conditional spread to satisfy
   `exactOptionalPropertyTypes`
5. Uses branded type factories (`EdgeWeight.create()`, `MasteryLevel.create()`)
   for type safety
6. Delegates to the service interface method
7. Wraps responses in the standard `IApiResponse<T>` envelope

### D6: Authorization Model

| Route Group                                 | Authorization                                                                          |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| PKG (nodes, edges, traversal)               | `assertUserAccess` — JWT subject must match `:userId` or have admin/agent/service role |
| CKG reads (nodes)                           | Standard auth (any authenticated user)                                                 |
| CKG mutations (propose, cancel, retry)      | `assertAdminOrAgent` — requires admin/agent/service role                               |
| CKG mutations (list, get, audit-log)        | Standard auth                                                                          |
| Metrics, misconceptions, health, comparison | `assertUserAccess` — user-scoped                                                       |

### D7: Deferred DI Wiring (Tech Debt)

**Current state:** Routes are registered in `src/index.ts` but the service is
`null as unknown as IKnowledgeGraphService`. Routes will throw at runtime until
the service is properly constructed.

**Why deferred:** Constructing the full `KnowledgeGraphService` requires wiring
together 7+ dependencies (repositories, event publisher, pipeline, detection
engine). This is Wave 2 work and should be done as a focused DI bootstrap task.

**Required for Wave 2:**

```typescript
// Dependencies to construct:
const graphRepository = new Neo4jGraphRepository(neo4jClient);
const metricsRepository = new PrismaMetricsRepository(prisma);
const mutationRepository = new PrismaMutationRepository(prisma);
const misconceptionRepository = new PrismaMisconceptionRepository(prisma);
const eventPublisher = new RedisEventPublisher(
  redis,
  getEventPublisherConfig(config)
);
const mutationPipeline = new CkgMutationPipeline(/* ... */);
const detectionEngine = new MisconceptionDetectionEngine(/* ... */);

const service = new KnowledgeGraphService(
  graphRepository,
  metricsRepository,
  mutationRepository,
  misconceptionRepository,
  eventPublisher,
  mutationPipeline,
  detectionEngine
);
```

## Consequences

### Positive

- All 28 Wave 1 endpoints are defined, typed, and schema-validated
- Swagger/OpenAPI documentation auto-generated with 10 tag groups
- Error handling covers all 15+ domain error types with correct HTTP status
  codes
- Pattern is consistent with the content-service's proven approach
- `exactOptionalPropertyTypes` compliance achieved throughout (no `undefined`
  leaks)

### Negative / Tech Debt

- **Service is not wired** — routes crash at runtime until DI is completed
  (Wave 2)
- **No integration tests** — Wave 2 should add Fastify `.inject()` tests
- **No event emission** — Event publishing for graph mutations deferred to Phase
  8 Wave 3
- **Rate limiting is per-route-group** — may need per-endpoint tuning later

### Neutral

- Swagger tags updated from 6 to 10 to reflect the expanded API surface
- Health route registration remains separate (it doesn't depend on the service)

## Files Created

### Infrastructure

- `src/infrastructure/external-apis/token-verifier.ts`
- `src/api/middleware/auth.middleware.ts`
- `src/api/shared/route-helpers.ts`
- `src/api/shared/index.ts`

### Schemas (9 files + barrel)

- `src/api/schemas/pkg-node.schemas.ts`
- `src/api/schemas/pkg-edge.schemas.ts`
- `src/api/schemas/pkg-traversal.schemas.ts`
- `src/api/schemas/ckg-node.schemas.ts`
- `src/api/schemas/ckg-mutation.schemas.ts`
- `src/api/schemas/metrics.schemas.ts`
- `src/api/schemas/misconception.schemas.ts`
- `src/api/schemas/structural-health.schemas.ts`
- `src/api/schemas/comparison.schemas.ts`
- `src/api/schemas/index.ts`

### Route Handlers (9 files + barrel)

- `src/api/rest/pkg-node.routes.ts`
- `src/api/rest/pkg-edge.routes.ts`
- `src/api/rest/pkg-traversal.routes.ts`
- `src/api/rest/ckg-node.routes.ts`
- `src/api/rest/ckg-mutation.routes.ts`
- `src/api/rest/metrics.routes.ts`
- `src/api/rest/misconception.routes.ts`
- `src/api/rest/structural-health.routes.ts`
- `src/api/rest/comparison.routes.ts`
- `src/api/rest/index.ts`

### Modified

- `src/index.ts` — bootstrap updated with route registration and tech debt TODO
