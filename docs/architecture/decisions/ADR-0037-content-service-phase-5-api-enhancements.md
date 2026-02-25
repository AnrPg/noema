# ADR-0037: Content Service Phase 5 — API Enhancements

## Status

Accepted

## Date

2025-06-25

## Context

The content-service has matured through four remediation phases (foundation, data integrity, security, performance). Several developer-experience and operational gaps remain:

1. **No API documentation** — consumers discover endpoints only through source code or MCP tool definitions. No interactive documentation exists.
2. **No soft-delete recovery** — cards can be soft-deleted but never restored, forcing re-creation.
3. **No content version history** — mutations overwrite card state in place with no audit trail or rollback capability.
4. **No aggregate statistics** — agents and dashboards must query and count cards themselves, which is inefficient and inconsistent.
5. **Incomplete health checks** — MinIO (object storage) is not probed in the `/health` and `/health/ready` endpoints, so storage outages go undetected.

## Decision

### 1. OpenAPI/Swagger Documentation

Register `@fastify/swagger` (v9.7.0) and `@fastify/swagger-ui` (v5.2.5) in the bootstrap to auto-generate OpenAPI 3.1.0 documentation from route schemas:

- **Endpoint**: `/docs` serves the Swagger-UI explorer.
- **Tags**: Cards, Templates, Media, Health, MCP Tools.
- **Security**: Bearer authentication scheme defined globally.
- **Module augmentation**: Extended `FastifySchema` to support `tags`, `summary`, `description`, `deprecated`, `operationId` properties for use in per-route schema annotations.

**Alternatives considered:**
- *Manual OpenAPI YAML*: High maintenance burden, drifts from code quickly.
- *Redoc*: Read-only; Swagger-UI allows interactive testing.

### 2. Soft-Delete Restore

Add `restore()` across the full stack:

- **Repository**: `PrismaContentRepository.restore()` finds the card (including soft-deleted records), validates ownership, clears `deletedAt`, sets state to `DRAFT`, and increments the version.
- **Cache**: `CachedContentRepository.restore()` delegates then invalidates the card key and all user query cache entries.
- **Service**: `ContentService.restore()` publishes a `card.restored` event with agent hints suggesting `activate_card` as next action.
- **REST**: `POST /v1/cards/:id/restore`.
- **MCP**: `restore-card` tool (P1, side-effects=true).

**Alternatives considered:**
- *Restore to previous state*: More complex; restoring to DRAFT is simpler and consistent — the user can then transition the card.

### 3. Content Version History

Full-snapshot history model — every mutation is preceded by a snapshot of the card's current state:

- **Prisma model**: `CardHistory` with fields for full card state (content, tags, knowledgeNodeIds, metadata), change type, version number, and the user who initiated the change. Four indexes for efficient queries.
- **Repository**: `IHistoryRepository` interface with `createSnapshot()`, `getHistory()`, `getVersion()` methods; `PrismaHistoryRepository` implementation with `hist_<nanoid>` IDs.
- **Service-layer snapshotting**: `ContentService.snapshotBeforeChange()` private helper is called before `update()`, `changeState()`, `updateTags()`, and `updateKnowledgeNodeIds()`. Errors are caught and logged — snapshot failures never block mutations.
- **REST**: `GET /v1/cards/:id/history` (paginated, limit/offset), `GET /v1/cards/:id/history/:version`.
- **MCP**: `get-card-history` tool (P1, read-only).

**Alternatives considered:**
- *Diff-based history*: Smaller storage but complex reconstruction; full snapshots are simpler and enable direct version comparison.
- *Repository-layer snapshotting*: Would need the history repository injected at the Prisma layer, breaking separation of concerns.
- *Selective snapshotting*: Only on major mutations; decided on all mutations for complete audit trail.

### 4. Aggregate Statistics

Extended statistics endpoint with Redis caching:

- **Repository**: `PrismaContentRepository.getStats()` runs 8 parallel aggregate queries — total cards, total deleted, group-by state/difficulty/cardType/source, min/max createdAt, recently updated count (last 7 days).
- **Cache**: `CachedContentRepository.getStats()` wraps with `getOrLoad` using a 60-second TTL (`stats:{userId}` key).
- **Service**: `ContentService.getStats()` delegates to the repository.
- **REST**: `GET /v1/cards/stats` (placed before `/:id` to avoid parameter conflict).
- **MCP**: `get-card-stats` tool (P1, read-only).

**Alternatives considered:**
- *Basic counts only*: Insufficient for dashboard and agent planning use cases.
- *No caching*: 8 aggregate queries per request is expensive; 60s TTL balances freshness with performance.

### 5. MinIO Health Check

Added `healthCheck()` to `MinioStorageProvider`:

- Calls `bucketExists(bucket)` to verify connectivity and bucket availability.
- Returns `{ status: 'up' | 'down', latencyMs, error? }`.
- Integrated into `/health` (liveness) and `/health/ready` (readiness) endpoints as an optional dependency.
- Conditional: only checked when `storageProvider` is provided to the health routes.

## Consequences

### Positive

- Interactive API documentation at `/docs` — consumers can explore and test endpoints without reading source.
- Soft-deleted cards are recoverable, reducing data-loss risk from accidental deletions.
- Complete audit trail for card mutations enables version comparison, debugging, and potential rollback.
- Aggregate statistics support dashboard views and agent planning without per-card enumeration.
- MinIO outages are detected in health checks, enabling proper load balancer and orchestrator responses.
- 3 new MCP tools (17 total), 4 new REST endpoints, 4 new tests (279 total), zero lint/typecheck errors.

### Negative

- Full-snapshot history grows linearly with mutations; may need retention policies or archival for high-mutation cards.
- Stats cache (60s TTL) means dashboard data can be slightly stale after rapid mutations.
- `@fastify/swagger` adds ~200KB to the bundle and minor startup latency for schema generation.

### Risks

- **History table growth**: High-frequency batch operations could generate large numbers of history entries. Mitigated by the non-blocking snapshot design (failures are logged, not propagated).
- **Stats query cost**: 8 parallel aggregate queries are efficient but could become expensive with millions of cards per user. The 60s cache mitigates this.
- **MinIO health dependency**: If MinIO is down, `/health/ready` will report degraded status, which may trigger unnecessary pod restarts if liveness probes are misconfigured.

## References

- [PHASE-5-API-ENHANCEMENTS.md](../../content-service-remediation/PHASE-5-API-ENHANCEMENTS.md)
- [ADR-0033 Phase 1](ADR-0033-content-service-phase-1-foundation-dry.md)
- [ADR-0034 Phase 2](ADR-0034-content-service-phase-2-data-integrity.md)
- [ADR-0035 Phase 3](ADR-0035-content-service-phase-3-security-resilience.md)
- [ADR-0036 Phase 4](ADR-0036-content-service-phase-4-performance-search.md)
- [@fastify/swagger](https://github.com/fastify/fastify-swagger)
