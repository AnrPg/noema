# Phase 4: Performance & Search

## Objective

Replace rudimentary JSONB `string_contains` search with PostgreSQL full-text
search, add a Redis read-through cache layer, and implement cursor-based
pagination for efficient large-result navigation.

## Prerequisites

- Phase 1 completed (shared route helpers)
- Phase 2 completed (atomic writes, repository changes)
- Phase 3 completed (content hash utility exists)

## Gaps Fixed

- **Gap #2:** Search is rudimentary (`string_contains` on JSONB)
- **Gap #7:** No caching layer
- **Gap #8:** No cursor-based pagination support

## Improvements Implemented

- **Improvement #1:** PostgreSQL full-text search
- **Improvement #3:** Redis read-through caching
- **Improvement #8:** Cursor-based pagination

---

## Global Instructions for Claude

> **IMPORTANT CONSTRAINTS — follow these in every phase:**
>
> - This is a TypeScript project using ESM (`"type": "module"`) — all local
>   imports must use `.js` extensions.
> - Use `import type` for type-only imports per the project convention.
> - Preserve the existing JSDoc/comment banner style at top of every file.
> - Preserve the
>   `// ============================================================================`
>   section separator style.
> - Do not rename existing public types or interfaces — only add new ones or
>   extend with optional fields.
> - Run `pnpm typecheck` after each task to verify zero type errors.
> - Never modify files in `generated/`, `node_modules/`, or `dist/`.
> - Use the existing error class hierarchy from
>   `src/domain/content-service/errors/content.errors.ts`.
> - When editing existing files, change only what is required — do not reformat
>   unrelated code.
> - After completing ALL tasks, run `pnpm typecheck && pnpm test && pnpm lint`.

---

## Task 1: PostgreSQL Full-Text Search

### Problem

The current search uses
`content: { path: ['front'], string_contains: query.search }` which:

1. Only searches `front` and `back` string fields — misses other content fields
2. Does no stemming, ranking, or accent-insensitive matching
3. Can't leverage indexes — performs sequential scans

### Step 1: Create a migration for `tsvector` column and GIN index

```bash
cd services/content-service
npx prisma migrate dev --name add_fulltext_search --create-only
```

Edit the generated migration SQL:

```sql
-- Add a generated tsvector column for full-text search
-- We extract searchable text from the JSONB content column
ALTER TABLE "cards" ADD COLUMN "search_vector" tsvector;

-- Create a GIN index on the search vector
CREATE INDEX "cards_search_vector_idx" ON "cards" USING gin("search_vector");

-- Create a function to build the search vector from JSONB content
CREATE OR REPLACE FUNCTION content_search_vector(content jsonb) RETURNS tsvector AS $$
BEGIN
  RETURN
    setweight(to_tsvector('english', coalesce(content->>'front', '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content->>'back', '')), 'B') ||
    setweight(to_tsvector('english', coalesce(content->>'explanation', '')), 'C') ||
    setweight(to_tsvector('english', coalesce(content->>'hint', '')), 'D') ||
    setweight(to_tsvector('english', coalesce(content->>'stem', '')), 'B') ||
    setweight(to_tsvector('english', coalesce(content->>'context', '')), 'C');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create a trigger to auto-update the search vector on INSERT/UPDATE
CREATE OR REPLACE FUNCTION update_card_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := content_search_vector(NEW.content);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cards_search_vector_trigger
  BEFORE INSERT OR UPDATE OF content ON "cards"
  FOR EACH ROW
  EXECUTE FUNCTION update_card_search_vector();

-- Backfill existing rows
UPDATE "cards" SET search_vector = content_search_vector(content);
```

### Step 2: Update `prisma/schema.prisma`

Add to the `Card` model (Prisma doesn't natively support `tsvector`, so mark it
as `Unsupported`):

```prisma
// Full-text search vector (auto-populated by trigger)
searchVector Unsupported("tsvector")? @map("search_vector")
```

Run `npx prisma generate`.

### Step 3: Update the repository to use full-text search

In `src/infrastructure/database/prisma-content.repository.ts`, modify
`buildWhereClause`:

**Replace** the current `query.search` block:

```typescript
// BEFORE (remove this):
if (query.search !== undefined && query.search !== '') {
  where.OR = [
    { content: { path: ['front'], string_contains: query.search } },
    { content: { path: ['back'], string_contains: query.search } },
  ];
}
```

The full-text search can't be done via Prisma's standard `where` clause since
`tsvector` is `Unsupported`. Instead, use `$queryRaw` or `$queryRawUnsafe` for
the search portion.

**Strategy:** When `query.search` is set, switch the entire query to raw SQL.
When no search, keep using Prisma.

Add a new method `queryWithSearch`:

```typescript
private async queryWithSearch(
  query: IDeckQuery,
  userId: UserId,
  searchTerm: string,
  offset: number,
  limit: number
): Promise<{ items: ICardSummary[]; total: number; hasMore: boolean }> {
  // Convert search term to tsquery format
  const tsQuery = searchTerm
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean)
    .join(' & ');

  if (!tsQuery) {
    return { items: [], total: 0, hasMore: false };
  }

  // Build WHERE conditions from the query parameters
  const conditions: string[] = [
    `user_id = $1`,
    `deleted_at IS NULL`,
    `search_vector @@ to_tsquery('english', $2)`,
  ];
  const params: unknown[] = [userId, tsQuery];
  let paramIdx = 3;

  if (query.cardTypes && query.cardTypes.length > 0) {
    const dbTypes = query.cardTypes.map((t) => t.toUpperCase());
    conditions.push(`card_type = ANY($${paramIdx}::card_type[])`);
    params.push(dbTypes);
    paramIdx++;
  }
  if (query.states && query.states.length > 0) {
    const dbStates = query.states.map((s) => s.toUpperCase());
    conditions.push(`state = ANY($${paramIdx}::card_state[])`);
    params.push(dbStates);
    paramIdx++;
  }
  if (query.tags && query.tags.length > 0) {
    conditions.push(`tags && $${paramIdx}::text[]`);
    params.push(query.tags);
    paramIdx++;
  }

  const whereClause = conditions.join(' AND ');

  // Count query
  const countResult = await this.prisma.$queryRawUnsafe<[{ count: bigint }]>(
    `SELECT COUNT(*) as count FROM cards WHERE ${whereClause}`,
    ...params
  );
  const total = Number(countResult[0]?.count ?? 0);

  // Ranked results query
  const rows = await this.prisma.$queryRawUnsafe<PrismaCard[]>(
    `SELECT *, ts_rank(search_vector, to_tsquery('english', $2)) AS rank
     FROM cards
     WHERE ${whereClause}
     ORDER BY rank DESC, created_at DESC
     OFFSET $${paramIdx} LIMIT $${paramIdx + 1}`,
    ...params,
    offset,
    limit
  );

  return {
    items: rows.map((c) => this.toSummary(c as unknown as PrismaCard)),
    total,
    hasMore: offset + limit < total,
  };
}
```

**Update the `query` method** to delegate when search is active:

```typescript
async query(query: IDeckQuery, userId: UserId): Promise<IPaginatedResponse<ICardSummary>> {
  const offset = query.offset ?? 0;
  const limit = query.limit ?? 20;

  // If search is active, use full-text search with raw SQL
  if (query.search !== undefined && query.search.trim() !== '') {
    return this.queryWithSearch(query, userId, query.search, offset, limit);
  }

  // Standard Prisma query (no search)
  const where = this.buildWhereClause(query, userId);
  const orderBy = this.buildOrderBy(query);
  // ... rest of existing logic (including exact-mode post-filter from Phase 2)
}
```

**Remove** the `query.search` handling from `buildWhereClause` since it's now
handled separately.

---

## Task 2: Redis Read-Through Cache

### Problem

Every `findById` call hits the database. High-traffic card views (e.g., during
review sessions) cause unnecessary DB load.

### Step 1: Create a cache provider

Create `src/infrastructure/cache/redis-cache.provider.ts`:

```typescript
/**
 * @noema/content-service - Redis Cache Provider
 *
 * Read-through cache implementation for frequently accessed data.
 * Uses Redis with TTL-based expiry and cache-aside pattern.
 */

import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

// ============================================================================
// Cache Configuration
// ============================================================================

export interface ICacheConfig {
  /** TTL for individual card lookups (seconds) */
  cardTtl: number;
  /** TTL for query result pages (seconds) */
  queryTtl: number;
  /** Key prefix for namespacing */
  prefix: string;
}

// ============================================================================
// Cache Provider
// ============================================================================

export class RedisCacheProvider {
  private readonly redis: Redis;
  private readonly config: ICacheConfig;
  private readonly logger: Logger;

  constructor(redis: Redis, config: ICacheConfig, logger: Logger) {
    this.redis = redis;
    this.config = config;
    this.logger = logger.child({ component: 'RedisCacheProvider' });
  }

  // ============================================================================
  // Generic Cache Operations
  // ============================================================================

  /**
   * Get a value from cache. Returns null on miss or error.
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(this.prefixedKey(key));
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.warn({ error, key }, 'Cache get error — treating as miss');
      return null;
    }
  }

  /**
   * Set a value in cache with TTL.
   */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(
        this.prefixedKey(key),
        JSON.stringify(value),
        'EX',
        ttlSeconds
      );
    } catch (error) {
      this.logger.warn({ error, key }, 'Cache set error — ignoring');
    }
  }

  /**
   * Delete a key from cache.
   */
  async del(key: string): Promise<void> {
    try {
      await this.redis.del(this.prefixedKey(key));
    } catch (error) {
      this.logger.warn({ error, key }, 'Cache del error — ignoring');
    }
  }

  /**
   * Delete all keys matching a pattern (e.g. invalidate all queries for a user).
   * Use with caution — SCAN is O(N).
   */
  async delPattern(pattern: string): Promise<void> {
    try {
      const fullPattern = this.prefixedKey(pattern);
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          fullPattern,
          'COUNT',
          100
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } while (cursor !== '0');
    } catch (error) {
      this.logger.warn({ error, pattern }, 'Cache delPattern error — ignoring');
    }
  }

  // ============================================================================
  // Read-Through Helper
  // ============================================================================

  /**
   * Read-through cache: get from cache, on miss call loader, cache result.
   */
  async getOrLoad<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await loader();
    // Don't cache null values to avoid caching "not found" results
    if (value !== null && value !== undefined) {
      await this.set(key, value, ttlSeconds);
    }
    return value;
  }

  // ============================================================================
  // Key Helpers
  // ============================================================================

  private prefixedKey(key: string): string {
    return `${this.config.prefix}:${key}`;
  }

  /**
   * Build a card cache key.
   */
  cardKey(cardId: string): string {
    return `card:${cardId}`;
  }

  /**
   * Build a query result cache key.
   */
  queryKey(userId: string, queryHash: string): string {
    return `query:${userId}:${queryHash}`;
  }

  /**
   * Build a user-scoped pattern for invalidation.
   */
  userPattern(userId: string): string {
    return `query:${userId}:*`;
  }
}
```

### Step 2: Add cache configuration to `src/config/index.ts`

Add to `IServiceConfig`:

```typescript
cache: {
  /** TTL for individual card lookups in seconds */
  cardTtl: number;
  /** TTL for query result pages in seconds */
  queryTtl: number;
  /** Cache key prefix */
  prefix: string;
  /** Whether caching is enabled */
  enabled: boolean;
}
```

In `loadConfig()`:

```typescript
cache: {
  cardTtl: optionalEnvInt('CACHE_CARD_TTL', 300),      // 5 minutes
  queryTtl: optionalEnvInt('CACHE_QUERY_TTL', 60),      // 1 minute
  prefix: optionalEnv('CACHE_PREFIX', 'cs'),             // content-service
  enabled: optionalEnvBool('CACHE_ENABLED', true),
},
```

### Step 3: Wire the cache into the service layer

**Option A (Preferred): Decorate the repository with a caching wrapper.**

Create `src/infrastructure/cache/cached-content.repository.ts`:

```typescript
/**
 * @noema/content-service - Cached Content Repository
 *
 * Decorates IContentRepository with read-through caching.
 * All writes invalidate relevant cache entries.
 */

import type { CardId, IPaginatedResponse, UserId } from '@noema/types';
import type { IContentRepository } from '../../domain/content-service/content.repository.js';
import type { RedisCacheProvider } from './redis-cache.provider.js';
import type {
  IBatchCreateResult,
  ICard,
  ICardSummary,
  IChangeCardStateInput,
  ICreateCardInput,
  IDeckQuery,
  IUpdateCardInput,
} from '../../types/content.types.js';
import { createHash } from 'node:crypto';

export class CachedContentRepository implements IContentRepository {
  constructor(
    private readonly inner: IContentRepository,
    private readonly cache: RedisCacheProvider,
    private readonly cardTtl: number,
    private readonly queryTtl: number
  ) {}

  // ============================================================================
  // Cached Reads
  // ============================================================================

  async findById(id: CardId): Promise<ICard | null> {
    return this.cache.getOrLoad(this.cache.cardKey(id), this.cardTtl, () =>
      this.inner.findById(id)
    );
  }

  async findByIdForUser(id: CardId, userId: UserId): Promise<ICard | null> {
    return this.cache.getOrLoad(this.cache.cardKey(id), this.cardTtl, () =>
      this.inner.findByIdForUser(id, userId)
    );
  }

  async query(
    query: IDeckQuery,
    userId: UserId
  ): Promise<IPaginatedResponse<ICardSummary>> {
    const queryHash = createHash('md5')
      .update(JSON.stringify(query))
      .digest('hex')
      .slice(0, 12);
    return this.cache.getOrLoad(
      this.cache.queryKey(userId, queryHash),
      this.queryTtl,
      () => this.inner.query(query, userId)
    );
  }

  async count(query: IDeckQuery, userId: UserId): Promise<number> {
    // Count is cheap, don't cache
    return this.inner.count(query, userId);
  }

  async findByIds(ids: CardId[], userId: UserId): Promise<ICard[]> {
    // Multi-get is not cached for simplicity
    return this.inner.findByIds(ids, userId);
  }

  // ============================================================================
  // Writes (Delegate + Invalidate)
  // ============================================================================

  async create(
    input: ICreateCardInput & { id: CardId; userId: UserId }
  ): Promise<ICard> {
    const card = await this.inner.create(input);
    await this.invalidateForUser(card.userId);
    return card;
  }

  async createBatch(
    inputs: (ICreateCardInput & { id: CardId; userId: UserId })[]
  ): Promise<IBatchCreateResult> {
    const result = await this.inner.createBatch(inputs);
    // Invalidate for all users in the batch
    const userIds = new Set(inputs.map((i) => i.userId));
    await Promise.all([...userIds].map((uid) => this.invalidateForUser(uid)));
    return result;
  }

  async update(
    id: CardId,
    input: IUpdateCardInput,
    version: number,
    userId?: UserId
  ): Promise<ICard> {
    const card = await this.inner.update(id, input, version, userId);
    await this.cache.del(this.cache.cardKey(id));
    await this.invalidateForUser(card.userId);
    return card;
  }

  async changeState(
    id: CardId,
    input: IChangeCardStateInput,
    version: number,
    userId?: UserId
  ): Promise<ICard> {
    const card = await this.inner.changeState(id, input, version, userId);
    await this.cache.del(this.cache.cardKey(id));
    await this.invalidateForUser(card.userId);
    return card;
  }

  async softDelete(
    id: CardId,
    version: number,
    userId?: UserId
  ): Promise<void> {
    // Get userId before delete for invalidation
    const card = await this.inner.findById(id);
    await this.inner.softDelete(id, version, userId);
    await this.cache.del(this.cache.cardKey(id));
    if (card) await this.invalidateForUser(card.userId);
  }

  async hardDelete(id: CardId): Promise<void> {
    const card = await this.inner.findById(id);
    await this.inner.hardDelete(id);
    await this.cache.del(this.cache.cardKey(id));
    if (card) await this.invalidateForUser(card.userId);
  }

  async updateTags(
    id: CardId,
    tags: string[],
    version: number,
    userId?: UserId
  ): Promise<ICard> {
    const card = await this.inner.updateTags(id, tags, version, userId);
    await this.cache.del(this.cache.cardKey(id));
    await this.invalidateForUser(card.userId);
    return card;
  }

  async updateKnowledgeNodeIds(
    id: CardId,
    knowledgeNodeIds: string[],
    version: number,
    userId?: UserId
  ): Promise<ICard> {
    const card = await this.inner.updateKnowledgeNodeIds(
      id,
      knowledgeNodeIds,
      version,
      userId
    );
    await this.cache.del(this.cache.cardKey(id));
    await this.invalidateForUser(card.userId);
    return card;
  }

  // Pass through any methods added by Phase 3 (deduplication)
  async findByContentHash(
    userId: UserId,
    contentHash: string
  ): Promise<ICard | null> {
    return this.inner.findByContentHash(userId, contentHash);
  }

  // ============================================================================
  // Invalidation
  // ============================================================================

  private async invalidateForUser(userId: UserId): Promise<void> {
    await this.cache.delPattern(this.cache.userPattern(userId));
  }
}
```

### Step 4: Wire in `src/index.ts`

```typescript
import { RedisCacheProvider } from './infrastructure/cache/redis-cache.provider.js';
import { CachedContentRepository } from './infrastructure/cache/cached-content.repository.js';

// After creating PrismaContentRepository:
const baseContentRepository = new PrismaContentRepository(prisma);
const cacheProvider = new RedisCacheProvider(
  redis,
  {
    cardTtl: config.cache.cardTtl,
    queryTtl: config.cache.queryTtl,
    prefix: config.cache.prefix,
  },
  logger
);
const contentRepository = config.cache.enabled
  ? new CachedContentRepository(
      baseContentRepository,
      cacheProvider,
      config.cache.cardTtl,
      config.cache.queryTtl
    )
  : baseContentRepository;
```

---

## Task 3: Cursor-Based Pagination

### Problem

Offset-based pagination (`OFFSET/LIMIT`) becomes slow for large datasets due to
PostgreSQL scanning and discarding rows. Cursor-based pagination uses a
`WHERE id > cursor ORDER BY id LIMIT N` pattern that's O(1).

### Step 1: Add cursor types to `src/types/content.types.ts`

```typescript
/**
 * Cursor-based pagination input.
 */
export interface ICursorPaginationInput {
  /** Cursor string (opaque to client, typically a base64-encoded compound key) */
  cursor?: string;
  /** Number of items to return */
  limit?: number;
  /** Direction: 'forward' (next page) or 'backward' (prev page) */
  direction?: 'forward' | 'backward';
}

/**
 * Cursor-based pagination result.
 */
export interface ICursorPaginatedResponse<T> {
  items: T[];
  /** Cursor for the next page (null if no more pages) */
  nextCursor: string | null;
  /** Cursor for the previous page (null if on first page) */
  prevCursor: string | null;
  /** Whether there are more items */
  hasMore: boolean;
}
```

### Step 2: Add cursor encode/decode utility

Create `src/utils/cursor.ts`:

```typescript
/**
 * @noema/content-service - Cursor Pagination Utilities
 *
 * Encodes and decodes opaque cursor strings for cursor-based pagination.
 * Cursor format: base64(JSON({ id, sortValue, sortField }))
 */

// ============================================================================
// Cursor Types
// ============================================================================

export interface ICursorData {
  /** Card ID (primary sort tiebreaker) */
  id: string;
  /** Value of the sort field */
  sortValue: string;
  /** Name of the sort field */
  sortField: string;
}

// ============================================================================
// Encode / Decode
// ============================================================================

export function encodeCursor(data: ICursorData): string {
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

export function decodeCursor(cursor: string): ICursorData | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf-8');
    const parsed = JSON.parse(raw) as ICursorData;
    if (!parsed.id || !parsed.sortField) return null;
    return parsed;
  } catch {
    return null;
  }
}
```

### Step 3: Add cursor query to the repository

**`src/domain/content-service/content.repository.ts`** — add a new method:

```typescript
queryCursor(
  query: IDeckQuery,
  userId: UserId,
  cursor?: string,
  limit?: number,
  direction?: 'forward' | 'backward'
): Promise<ICursorPaginatedResponse<ICardSummary>>;
```

**`prisma-content.repository.ts`** — implement:

```typescript
async queryCursor(
  query: IDeckQuery,
  userId: UserId,
  cursor?: string,
  limit: number = 20,
  direction: 'forward' | 'backward' = 'forward'
): Promise<ICursorPaginatedResponse<ICardSummary>> {
  const where = this.buildWhereClause(query, userId);
  const sortField = query.sortBy ?? 'createdAt';
  const sortOrder = query.sortOrder ?? 'desc';

  // Parse cursor if provided
  if (cursor) {
    const cursorData = decodeCursor(cursor);
    if (cursorData) {
      const comparison = (direction === 'forward')
        ? (sortOrder === 'desc' ? 'lt' : 'gt')
        : (sortOrder === 'desc' ? 'gt' : 'lt');

      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { [sortField]: { [comparison]: new Date(cursorData.sortValue) } },
            {
              [sortField]: new Date(cursorData.sortValue),
              id: { [comparison]: cursorData.id },
            },
          ],
        },
      ];
    }
  }

  // Fetch one extra to detect hasMore
  const fetchLimit = limit + 1;
  const cards = await this.prisma.card.findMany({
    where,
    take: fetchLimit,
    orderBy: [
      { [sortField]: sortOrder },
      { id: sortOrder },
    ],
  });

  const hasMore = cards.length > limit;
  const pageCards = hasMore ? cards.slice(0, limit) : cards;

  // Build cursors
  const firstCard = pageCards[0];
  const lastCard = pageCards[pageCards.length - 1];

  return {
    items: pageCards.map((c) => this.toSummary(c)),
    nextCursor: hasMore && lastCard
      ? encodeCursor({
          id: lastCard.id,
          sortValue: (lastCard[sortField as keyof PrismaCard] as Date).toISOString(),
          sortField,
        })
      : null,
    prevCursor: cursor && firstCard
      ? encodeCursor({
          id: firstCard.id,
          sortValue: (firstCard[sortField as keyof PrismaCard] as Date).toISOString(),
          sortField,
        })
      : null,
    hasMore,
  };
}
```

Import `encodeCursor`, `decodeCursor` from `../../utils/cursor.js`.

### Step 4: Add a cursor query endpoint

**`src/api/rest/content.routes.ts`** — add `GET /v1/cards/cursor`:

```typescript
fastify.get<{
  Querystring: {
    cursor?: string;
    limit?: number;
    cardTypes?: string;
    states?: string;
    tags?: string;
    sortBy?: string;
    sortOrder?: string;
    direction?: string;
  };
}>(
  '/v1/cards/cursor',
  {
    preHandler: [authMiddleware],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          cursor: { type: 'string' },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          cardTypes: { type: 'string' },
          states: { type: 'string' },
          tags: { type: 'string' },
          sortBy: { type: 'string', default: 'createdAt' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          direction: {
            type: 'string',
            enum: ['forward', 'backward'],
            default: 'forward',
          },
        },
      },
    },
  },
  async (request, reply) => {
    const context = buildContext(request);
    const { cursor, limit, direction, ...queryParams } = request.query;

    const deckQuery: IDeckQuery = {
      cardTypes: queryParams.cardTypes?.split(',') as CardType[],
      states: queryParams.states?.split(',') as CardState[],
      tags: queryParams.tags?.split(','),
      sortBy: queryParams.sortBy as IDeckQuery['sortBy'],
      sortOrder: queryParams.sortOrder as IDeckQuery['sortOrder'],
    };

    const result = await contentService.queryCursor(
      deckQuery,
      context,
      cursor,
      limit,
      direction as 'forward' | 'backward'
    );
    return wrapResponse(reply, result);
  }
);
```

### Step 5: Add `queryCursor` to ContentService

In `src/domain/content-service/content.service.ts`:

```typescript
async queryCursor(
  query: IDeckQuery,
  context: IExecutionContext,
  cursor?: string,
  limit?: number,
  direction?: 'forward' | 'backward'
): Promise<IServiceResult<ICursorPaginatedResponse<ICardSummary>>> {
  this.logger.info({ query, cursor, limit, direction, correlationId: context.correlationId }, 'Cursor query cards');

  const result = await this.repository.queryCursor(query, context.userId, cursor, limit, direction);

  return {
    data: result,
    agentHints: {
      totalReturned: result.items.length,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    },
  };
}
```

### Step 6: Add cursor query to the MCP tool

In `src/agents/tools/content.tools.ts`, add a `cursor-query-cards` tool that
wraps `contentService.queryCursor`.

---

## Checklist

- [ ] Migration created with `tsvector` column, GIN index, trigger function
- [ ] Backfill SQL updates existing rows
- [ ] `prisma/schema.prisma` updated with `searchVector` as
      `Unsupported("tsvector")?`
- [ ] `queryWithSearch` method uses `ts_rank` for relevance ordering
- [ ] `query` delegates to `queryWithSearch` when `query.search` is set
- [ ] Old `string_contains` search removed from `buildWhereClause`
- [ ] `RedisCacheProvider` created with get/set/del/getOrLoad/delPattern
- [ ] `CachedContentRepository` decorates `IContentRepository` with cache-aside
      pattern
- [ ] All write methods invalidate relevant caches (card key + user query keys)
- [ ] Cache is configurable and can be disabled via `CACHE_ENABLED=false`
- [ ] Cache wired in `src/index.ts` with conditional wrapping
- [ ] `ICursorPaginatedResponse` and `ICursorPaginationInput` types added
- [ ] `encodeCursor`/`decodeCursor` utilities created
- [ ] `queryCursor` method added to repository interface and implementation
- [ ] `GET /v1/cards/cursor` endpoint created
- [ ] `queryCursor` method added to ContentService
- [ ] MCP tool for cursor query added
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm lint` passes
