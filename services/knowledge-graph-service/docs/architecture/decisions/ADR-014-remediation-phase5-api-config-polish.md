# ADR-014: Remediation Phase 5 — API, Config & Polish

**Status:** Accepted  
**Date:** 2025-06-01  
**Phase:** 5 of 5 (Final)  
**Supersedes:** None  
**Related:** ADR-010 (Phase 1), ADR-011 (Phase 2), ADR-012 (Phase 3), ADR-013 (Phase 4)

## Context

Phase 5 of the 5-phase remediation plan addresses 19 audit findings covering:
- HTTP semantics and API correctness
- Input validation hardening (Zod schemas for URL params, query params, tool inputs)
- Process lifecycle (crash handlers, graceful shutdown timeout)
- Configuration deduplication
- Infrastructure safety (Cypher injection prevention, null caching, timestamp correctness)
- Mutation pipeline controls (pagination, proof stage config flag)

This is the final phase, completing the remediation of all 67 original audit findings.

## Decision

Implement all 19 Phase 5 fixes. Three findings (5.7, 5.8, 5.10) required no changes
as the code already complied. The remaining 16 fixes were applied.

### Fixes Implemented

#### API Layer — Input Validation (5.1, 5.2, 5.3, 5.6)

- **5.1 ZodError handler:** Added ZodError catch block in `handleError()` before
  ValidationError, returning 400 with structured `fieldErrors` array.
- **5.2 URL param validation:** Created 7 Zod param schemas (`UserIdParamSchema`,
  `NodeIdParamSchema`, `EdgeIdParamSchema`, `MutationIdParamSchema`, `UserNodeParamSchema`,
  `UserEdgeParamSchema`, `UserDetectionParamSchema`) in route-helpers.ts. Replaced all
  46 `request.params` destructuring sites across 12 route files with `.parse()` calls.
- **5.3 Traversal query param validation:** Created `TraversalDirectionQueryParamsSchema`
  with `z.coerce.number().int().min(1).max(10).default(3)` for maxDepth.
- **5.6 Forward maxDepth:** ancestors/descendants routes now use parsed schema values
  instead of raw `Number(queryMap['maxDepth'] ?? 3)`.

#### API Layer — HTTP Semantics (5.4, 5.5)

- **5.4 Fix 204 responses:** Removed response bodies from three DELETE/update routes
  (`pkg-node`, `pkg-edge`, `misconception`). HTTP 204 No Content per RFC 9110.
- **5.5 Forward mutation pagination:** Applied client-side pagination (page/pageSize)
  to `listMutations` route. Extended `wrapResponse()` with optional `IPaginationInfo`
  using the `@noema/contracts` pagination interface. Fixed test mock to use correct
  array format matching `IServiceResult<ICkgMutation[]>`.

#### Configuration (5.9, 5.15)

- **5.9 Deduplicate SERVICE_VERSION:** Exported `SERVICE_NAME` and `SERVICE_VERSION`
  from route-helpers.ts; health.routes.ts and index.ts now import instead of
  redeclaring.
- **5.15 Proof stage config flag:** Added `mutation.proofStageEnabled` to
  `IServiceConfig` (env: `MUTATION_PROOF_STAGE_ENABLED`, default: false). Pipeline
  constructor now receives the flag and uses it to gate proof-stage behavior.

#### Process Lifecycle (5.11, 5.12)

- **5.11 Crash handlers:** Added `process.on('unhandledRejection')` and
  `process.on('uncaughtException')` handlers that log fatal and trigger shutdown.
- **5.12 Graceful shutdown timeout:** Added 10-second `setTimeout` safety net with
  `unref()`. Added double-shutdown guard (`isShuttingDown` flag). Wrapped shutdown
  in try/catch to log errors without crashing.

#### Event Consumers (5.13)

- **5.13 Event consumers:** Added startup log + TODO documenting that consumer
  implementations are intentionally deferred until source services publish events.
  Config is fully wired (`consumers.enabled`, `consumers.streams`).

#### Tool Input Validation (5.14)

- **5.14 Tool input Zod validation:** Replaced all 18 `input as {...}` unsafe casts
  in kg.tools.ts with Zod schema `.parse()` calls. Created 15 input schemas
  (3 tools share `DomainInputSchema`). For `propose-mutation`, reused the existing
  `MutationProposalSchema` from the domain layer.

#### Infrastructure Safety (5.16, 5.17, 5.18, 5.19)

- **5.16 Cypher label sanitization:** Added `SAFE_LABEL_PATTERN` regex validation
  (`/^[A-Za-z_][A-Za-z0-9_]*$/`) to both `nodeTypeToLabel()` and `edgeTypeToRelType()`.
  Throws on unsafe input to prevent Cypher injection via dynamic labels.
- **5.17 deleteNode edge handling:** Extended `deleteNode` to soft-delete connected
  edges (`SET r.isDeleted = true`) in the same Neo4j write transaction before
  soft-deleting the node. Prevents orphaned edge references.
- **5.18 Null caching fix:** `getOrLoad()` now skips caching when loader returns
  null/undefined, preventing negative caching of missing entities.
- **5.19 Timestamp fallback:** `toIsoString()` now returns epoch fallback
  (`1970-01-01T00:00:00.000Z`) instead of fabricating `new Date().toISOString()`
  for null/unrecognized values. Makes data inconsistencies detectable.

### Findings Already Compliant (No Changes Needed)

- **5.7:** Health endpoint already returns 503 when dependencies are unhealthy.
- **5.8:** Audit-log route already uses `assertUserAccess` for authorization.
- **5.10:** No `AUTH_DISABLED` bypass exists in the codebase.

## Rationale

- **Zod over Fastify JSON Schema:** Zod provides richer validation (min length,
  integer checks, coercion) and type inference. Fastify's JSON Schema still handles
  basic route-level validation; Zod adds defense-in-depth at the handler level.
- **Route-level pagination for mutations:** Adding pagination to the repository/service
  layer would require significant changes to `findMutations` and the pipeline. Since
  mutation lists are small (typically <1000), in-memory slicing at the route layer is
  pragmatic and safe.
- **Epoch fallback over throwing:** Domain types require `createdAt: string` (non-optional).
  Throwing would crash the mapper; epoch makes the inconsistency visible and detectable
  downstream without breaking the API.
- **Soft-delete edges on node delete:** Consistent with the existing soft-delete pattern.
  Connected edges referencing a soft-deleted node would be invisible to traversals
  (which filter `isDeleted: false`) but could cause confusion in admin tools.

## Consequences

### Positive
- All 67 audit findings from the comprehensive review are now resolved
- Input validation is defense-in-depth: Fastify JSON Schema + Zod at handler level
- Process lifecycle is production-ready with crash handlers and shutdown timeout
- Infrastructure layer is hardened against injection, stale cache, and data corruption
- Configuration is centralized with no duplicate constants

### Negative
- 15 new Zod schemas in kg.tools.ts add ~80 lines of schema definitions
- Route-level pagination for mutations is not ideal for very large result sets
  (acceptable given current scale)

### Deferred Work
- Event consumer implementations (waiting for source services)
- TLA+ proof-stage integration (feature flag is ready)
- Repository-level pagination for mutation queries (if scale requires it)

## Files Changed

### Source (21 files)
- `src/api/shared/route-helpers.ts` — ZodError handler, param schemas, wrapResponse pagination, exported SERVICE_NAME/VERSION
- `src/api/rest/pkg-node.routes.ts` — Param validation, 204 fix
- `src/api/rest/pkg-edge.routes.ts` — Param validation, 204 fix
- `src/api/rest/pkg-traversal.routes.ts` — Param validation, traversal query schema
- `src/api/rest/ckg-node.routes.ts` — Param validation
- `src/api/rest/ckg-edge.routes.ts` — Param validation
- `src/api/rest/ckg-traversal.routes.ts` — Param validation, traversal query schema
- `src/api/rest/ckg-mutation.routes.ts` — Param validation, pagination
- `src/api/rest/metrics.routes.ts` — Param validation
- `src/api/rest/structural-health.routes.ts` — Param validation
- `src/api/rest/comparison.routes.ts` — Param validation
- `src/api/rest/misconception.routes.ts` — Param validation, 204 fix
- `src/api/rest/pkg-operation-log.routes.ts` — Param validation
- `src/api/rest/health.routes.ts` — Deduplicated SERVICE_NAME/VERSION
- `src/api/schemas/pkg-traversal.schemas.ts` — TraversalDirectionQueryParamsSchema
- `src/agents/tools/kg.tools.ts` — 18 Zod input schemas replacing unsafe casts
- `src/config/index.ts` — mutation.proofStageEnabled config
- `src/domain/knowledge-graph-service/ckg-mutation-pipeline.ts` — proofStageEnabled flag
- `src/index.ts` — Shutdown timeout, crash handlers, event consumer TODO, config forwarding
- `src/infrastructure/database/neo4j-mapper.ts` — Label sanitization, timestamp fallback
- `src/infrastructure/database/neo4j-graph.repository.ts` — Edge soft-delete on node delete
- `src/infrastructure/cache/kg-redis-cache.provider.ts` — Skip caching null

### Tests (1 file)
- `tests/integration/ckg-mutation.routes.test.ts` — Fixed mock data shape

### Documentation (1 file)
- `docs/architecture/decisions/ADR-014-remediation-phase5-api-config-polish.md`
