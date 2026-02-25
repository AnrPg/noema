# ADR-0036: Content Service Phase 4 — Performance & Search

## Status

Accepted

## Date

2025-06-25

## Context

The content-service query path uses Prisma's `string_contains` for search, which performs case-sensitive substring matching without ranking. Pagination uses offset-based windowing, which degrades on large datasets. No read caching exists, so every request hits PostgreSQL directly, including repeated lookups for the same card within a session.

Phase 4 of the content-service remediation addresses three performance and search concerns:

1. **Search quality** — users and agents need ranked, typo-tolerant, prefix-aware full-text search across card content.
2. **Read latency** — hot-path reads (`findById`, `findByIdForUser`, `query`) would benefit from a cache layer to reduce database load.
3. **Pagination scalability** — offset-based pagination becomes O(N) at depth; cursor-based (keyset/seek) pagination provides constant-time page fetches.

## Decision

### 1. PostgreSQL Full-Text Search with tsvector/GIN

Replace `string_contains` with PostgreSQL-native full-text search:

- **tsvector column**: `search_vector` on the `cards` table, populated by a `BEFORE INSERT OR UPDATE` trigger function that concatenates weighted fields (front=A, back=B, stem=B, explanation=C, context=C, hint=D).
- **GIN index**: `idx_cards_search_vector` for sub-millisecond lookups.
- **tsquery builder**: Strips non-alphanumeric characters (preserving hyphens/apostrophes), applies prefix matching (`:*`) to words ≤3 characters, joins with `&` (AND semantics).
- **Dual query path**: When `query.search` is non-empty, the repository switches from Prisma `findMany` to `$queryRawUnsafe` with parameterised queries, including `ts_rank` for relevance ordering. All existing filters (cardTypes, states, difficulties, tags, sources, knowledgeNodeIds, date ranges) are preserved in the raw SQL path.

**Alternatives considered:**
- *Elasticsearch/Meilisearch*: Higher operational complexity, separate infrastructure; PostgreSQL FTS is sufficient for the current dataset size and query patterns.
- *Prisma-level text search*: PostgreSQL preview feature in Prisma, limited control over ranking and query syntax.

### 2. Redis Read-Through Cache (Decorator Pattern)

Add an opt-in cache layer wrapping the content repository:

- **`RedisCacheProvider`**: Generic cache with `get`/`set`/`del`/`delPattern`/`getOrLoad` operations. All Redis errors are caught and logged — never propagated as request failures (fail-safe).
- **`CachedContentRepository`**: Implements `IContentRepository` via decorator pattern, wrapping the Prisma repository. Caches `findById` (card TTL), `findByIdForUser` (card TTL + userId guard), and `query` (query TTL with MD5 hash key). All writes delegate to the inner repository then invalidate the affected card key and SCAN-delete all user query keys.
- **userId cache guard**: `findByIdForUser` checks that a cached card's `userId` matches the requesting user before returning it, preventing cross-user data leakage.
- **`queryCursor` not cached**: Cursor pagination results are positional and inherently uncacheable.
- **Conditional enable**: Controlled by `CACHE_ENABLED` env var (default `true`). When disabled, the base Prisma repository is used directly.

**Alternatives considered:**
- *Application-level LRU cache*: Doesn't survive process restarts, no shared state across replicas.
- *Prisma middleware*: Tightly coupled to Prisma internals, harder to test.

### 3. Cursor-Based Pagination (Keyset/Seek Method)

Add `queryCursor` alongside existing offset-based `query`:

- **Compound cursor**: `base64url(JSON({ id, sortValue, sortField }))` — opaque to clients, encodes the position in both the sort column and the tiebreaker (id).
- **Keyset conditions**: `WHERE (sortCol < cursorValue) OR (sortCol = cursorValue AND id < cursorId)` for forward/desc traversal, with direction and sort order properly reflected.
- **N+1 fetch pattern**: Fetches `limit + 1` rows to detect `hasMore` without a separate COUNT query.
- **REST endpoint**: `GET /v1/cards/cursor` with query parameters for cursor, limit, direction, and all existing filters.
- **MCP tool**: `cursor-query-cards` tool registered for agent use.

**Alternatives considered:**
- *Replacing offset-based pagination*: Breaking change for existing consumers; both methods coexist.
- *Opaque integer cursors*: Leak ordering information; compound JSON cursors are more flexible across sort fields.

## Consequences

### Positive

- Full-text search returns ranked, relevant results with prefix matching for short terms.
- Cache layer reduces P50 read latency for hot cards and repeated query patterns.
- Cursor pagination provides stable, O(1) page fetches regardless of dataset depth.
- All three features are additive — no existing API contracts were broken.
- 22 new tests (275 total), zero lint/typecheck errors.

### Negative

- Raw SQL path for search queries must be maintained in parallel with the Prisma path; schema changes to the `cards` table require updates in both.
- The trigger function must be updated if new searchable content fields are added.
- Redis becomes a soft dependency — degraded performance (not failure) when unavailable.
- `queryCursor` does not support full-text search (mutual exclusion by design; search uses relevance ranking which conflicts with cursor position stability).

### Risks

- **tsvector trigger maintenance**: Adding/renaming content JSON fields requires updating the `content_search_vector()` migration function.
- **Cache staleness**: TTL-based expiry means cached data can be up to `CACHE_CARD_TTL` seconds stale for reads that bypass the write path (e.g., direct database updates).
- **SCAN-based invalidation**: `delPattern` uses Redis SCAN, which is O(N) over the keyspace. Acceptable at current scale but may need rethinking with millions of query cache entries per user.

## References

- [PHASE-4-PERFORMANCE-SEARCH.md](../../content-service-remediation/PHASE-4-PERFORMANCE-SEARCH.md)
- [ADR-0033 Phase 1](ADR-0033-content-service-phase-1-foundation-dry.md)
- [ADR-0034 Phase 2](ADR-0034-content-service-phase-2-data-integrity.md)
- [ADR-0035 Phase 3](ADR-0035-content-service-phase-3-security-resilience.md)
- [PostgreSQL Full Text Search](https://www.postgresql.org/docs/current/textsearch.html)
