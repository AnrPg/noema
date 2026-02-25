# Phase 8: Comprehensive Testing

## Objective

Fill all empty test directories with meaningful tests: API integration tests,
database repository tests, event integration tests, contract tests, and
end-to-end tests. Also update existing unit test mocks to match the new method
signatures introduced in Phases 1–7.

## Prerequisites

- Phases 1–7 completed (all features implemented)
- Existing unit tests passing

## Gaps Fixed

- **Gap #1 (partial):** Empty `tests/integration/`, `tests/contract/`,
  `tests/e2e/` directories

## Improvements Implemented

- **Improvement #20:** Integration + contract tests

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
> - Test framework is **Vitest** (`vitest` 2.x) — use `describe`, `it`,
>   `expect`, `beforeEach`, `afterEach`, `beforeAll`, `afterAll`.
> - Use the existing fixture factories from `tests/fixtures/index.ts` and mock
>   factories from `tests/helpers/mocks.ts`.
> - For integration tests needing a real database, use Prisma with a
>   test-specific `DATABASE_URL` or `@testcontainers/postgresql`.
> - For integration tests needing Redis, use `@testcontainers/redis` or a
>   test-specific `REDIS_URL`.
> - Never modify files in `generated/`, `node_modules/`, or `dist/`.
> - After completing ALL tasks, run `pnpm typecheck && pnpm test && pnpm lint`.

---

## Task 1: Update Existing Mocks for New Signatures

### Problem

Phases 1–7 added new methods to repositories and services:

- `IContentRepository`: `findByContentHash`, `restore`, `getStats`,
  `queryCursor`
- `IHistoryRepository`: `createSnapshot`, `getHistory`, `getVersion`
- `CachedContentRepository` (decorator)
- Changed `batchChangeState` signature (accepts `IBatchChangeStateItem[]`)

### Step 1: Update `tests/helpers/mocks.ts`

Add the new methods to `mockContentRepository()`:

```typescript
export function mockContentRepository(): {
  [K in keyof IContentRepository]: ReturnType<typeof vi.fn>;
} {
  return {
    // Existing methods...
    findById: vi.fn(),
    findByIdForUser: vi.fn(),
    query: vi.fn(),
    count: vi.fn(),
    findByIds: vi.fn(),
    create: vi.fn(),
    createBatch: vi.fn(),
    update: vi.fn(),
    changeState: vi.fn(),
    softDelete: vi.fn(),
    hardDelete: vi.fn(),
    updateTags: vi.fn(),
    updateKnowledgeNodeIds: vi.fn(),
    // New methods from Phases 2-5:
    findByContentHash: vi.fn(),
    restore: vi.fn(),
    getStats: vi.fn(),
    queryCursor: vi.fn(),
  };
}
```

Add a `mockHistoryRepository()`:

```typescript
export function mockHistoryRepository() {
  return {
    createSnapshot: vi.fn().mockResolvedValue({
      id: 'hist_test',
      cardId: 'card_test',
      userId: 'user_test',
      version: 1,
      content: {},
      difficulty: 'intermediate',
      state: 'draft',
      changeType: 'content_update',
      changedBy: 'user_test',
      createdAt: new Date().toISOString(),
    }),
    getHistory: vi.fn().mockResolvedValue([]),
    getVersion: vi.fn().mockResolvedValue(null),
  };
}
```

Add a `mockCacheProvider()`:

```typescript
export function mockCacheProvider() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
    delPattern: vi.fn().mockResolvedValue(undefined),
    getOrLoad: vi
      .fn()
      .mockImplementation(
        async (_key: string, _ttl: number, loader: () => Promise<unknown>) =>
          loader()
      ),
    cardKey: vi.fn().mockImplementation((id: string) => `card:${id}`),
    queryKey: vi
      .fn()
      .mockImplementation(
        (userId: string, hash: string) => `query:${userId}:${hash}`
      ),
    userPattern: vi
      .fn()
      .mockImplementation((userId: string) => `query:${userId}:*`),
  };
}
```

### Step 2: Update existing unit tests

Review each test file in `tests/unit/domain/` to ensure they use the correct
signatures:

- `content-service.test.ts`: Update `batchChangeState` tests to use
  `IBatchChangeStateItem[]` format
- Update any `update`, `changeState`, `softDelete` tests if the mock assertions
  changed due to `userId` parameter added

---

## Task 2: API Integration Tests

These tests start a real Fastify server with mocked services and exercise the
HTTP layer.

### Step 1: Create test helper for Fastify server

Create `tests/helpers/test-server.ts`:

```typescript
/**
 * @noema/content-service — Test Server Helper
 *
 * Creates a real Fastify instance with mocked services for API integration testing.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { registerContentRoutes } from '../../src/api/rest/content.routes.js';
import { registerTemplateRoutes } from '../../src/api/rest/template.routes.js';
import { registerMediaRoutes } from '../../src/api/rest/media.routes.js';
import { registerHealthRoutes } from '../../src/api/rest/health.routes.js';
import type { ContentService } from '../../src/domain/content-service/content.service.js';
import type { TemplateService } from '../../src/domain/content-service/template.service.js';
import type { MediaService } from '../../src/domain/content-service/media.service.js';

// ============================================================================
// Types
// ============================================================================

export interface ITestServerOptions {
  contentService: ContentService;
  templateService?: TemplateService;
  mediaService?: MediaService;
}

// ============================================================================
// Server Factory
// ============================================================================

export async function createTestServer(
  options: ITestServerOptions
): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: false, // Disable logging in tests
  });

  // Mock auth middleware that always passes
  const authMiddleware = async (request: any) => {
    request.user = {
      userId: 'user_test_123',
      email: 'test@noema.app',
      roles: ['user'],
    };
  };

  // Register routes
  registerContentRoutes(fastify, options.contentService, authMiddleware);

  if (options.templateService) {
    registerTemplateRoutes(fastify, options.templateService, authMiddleware);
  }

  if (options.mediaService) {
    registerMediaRoutes(fastify, options.mediaService, authMiddleware);
  }

  await fastify.ready();
  return fastify;
}
```

### Step 2: Create integration test for card routes

Create `tests/integration/api/content-routes.test.ts`:

```typescript
/**
 * @noema/content-service — Content Routes Integration Tests
 *
 * Tests the HTTP layer with a real Fastify server and mocked service layer.
 * Validates request parsing, response formatting, status codes, and error handling.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestServer } from '../../helpers/test-server.js';
import {
  mockContentRepository,
  mockEventPublisher,
  mockLogger,
} from '../../helpers/mocks.js';
import { ContentService } from '../../../src/domain/content-service/content.service.js';
import {
  atomicContent,
  card,
  cardId,
  cardSummary,
  executionContext,
  resetIdCounter,
} from '../../fixtures/index.js';

describe('Content Routes Integration', () => {
  let fastify: FastifyInstance;
  let repo: ReturnType<typeof mockContentRepository>;
  let events: ReturnType<typeof mockEventPublisher>;
  let service: ContentService;

  beforeAll(async () => {
    repo = mockContentRepository();
    events = mockEventPublisher();
    service = new ContentService(repo, events, mockLogger());
    fastify = await createTestServer({ contentService: service });
  });

  afterAll(async () => {
    await fastify.close();
  });

  beforeEach(() => {
    resetIdCounter();
    // Reset all mocks before each test
    Object.values(repo).forEach((fn) => fn.mockReset());
    Object.values(events).forEach((fn) => fn.mockReset());
    events.publish.mockResolvedValue(undefined);
    events.publishBatch.mockResolvedValue(undefined);
  });

  // ==========================================================================
  // GET /v1/cards/:id
  // ==========================================================================

  describe('GET /v1/cards/:id', () => {
    it('returns 200 with card data', async () => {
      const testCard = card();
      repo.findByIdForUser.mockResolvedValue(testCard);

      const response = await fastify.inject({
        method: 'GET',
        url: `/v1/cards/${testCard.id}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.id).toBe(testCard.id);
    });

    it('returns 404 when card not found', async () => {
      repo.findByIdForUser.mockResolvedValue(null);

      const response = await fastify.inject({
        method: 'GET',
        url: '/v1/cards/card_nonexistent',
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ==========================================================================
  // POST /v1/cards
  // ==========================================================================

  describe('POST /v1/cards', () => {
    it('creates a card and returns 201', async () => {
      const testCard = card();
      repo.create.mockResolvedValue(testCard);
      // If deduplication is active, findByContentHash returns null
      repo.findByContentHash?.mockResolvedValue(null);

      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/cards',
        headers: {
          authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
        payload: {
          cardType: 'atomic',
          content: atomicContent(),
          knowledgeNodeIds: ['node_1'],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
    });

    it('returns 400 for missing required fields', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/cards',
        headers: {
          authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
        payload: {
          // Missing cardType and content
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ==========================================================================
  // GET /v1/cards (query)
  // ==========================================================================

  describe('GET /v1/cards', () => {
    it('returns paginated results', async () => {
      const summaries = [cardSummary(), cardSummary()];
      repo.query.mockResolvedValue({
        items: summaries,
        total: 2,
        hasMore: false,
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/v1/cards?limit=20&offset=0',
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.items).toHaveLength(2);
      expect(body.data.total).toBe(2);
    });
  });

  // ==========================================================================
  // PUT /v1/cards/:id
  // ==========================================================================

  describe('PUT /v1/cards/:id', () => {
    it('updates a card and returns 200', async () => {
      const testCard = card();
      repo.findByIdForUser.mockResolvedValue(testCard);
      repo.update.mockResolvedValue({
        ...testCard,
        version: testCard.version + 1,
      });
      repo.findByContentHash?.mockResolvedValue(null);

      const response = await fastify.inject({
        method: 'PUT',
        url: `/v1/cards/${testCard.id}`,
        headers: {
          authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
        payload: {
          content: atomicContent({ front: 'Updated question' }),
          version: testCard.version,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ==========================================================================
  // PATCH /v1/cards/:id/state
  // ==========================================================================

  describe('PATCH /v1/cards/:id/state', () => {
    it('changes card state', async () => {
      const testCard = card({ state: 'draft' as any });
      repo.findByIdForUser.mockResolvedValue(testCard);
      repo.changeState.mockResolvedValue({ ...testCard, state: 'active' });

      const response = await fastify.inject({
        method: 'PATCH',
        url: `/v1/cards/${testCard.id}/state`,
        headers: {
          authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
        payload: {
          state: 'active',
          version: testCard.version,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ==========================================================================
  // DELETE /v1/cards/:id
  // ==========================================================================

  describe('DELETE /v1/cards/:id', () => {
    it('soft-deletes a card', async () => {
      const testCard = card();
      repo.findByIdForUser.mockResolvedValue(testCard);
      repo.softDelete.mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: 'DELETE',
        url: `/v1/cards/${testCard.id}?version=${testCard.version}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(204);
    });
  });

  // ==========================================================================
  // POST /v1/cards/:id/restore
  // ==========================================================================

  describe('POST /v1/cards/:id/restore', () => {
    it('restores a deleted card', async () => {
      const testCard = card({ state: 'draft' as any });
      repo.restore.mockResolvedValue(testCard);

      const response = await fastify.inject({
        method: 'POST',
        url: `/v1/cards/${testCard.id}/restore`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ==========================================================================
  // GET /v1/cards/stats
  // ==========================================================================

  describe('GET /v1/cards/stats', () => {
    it('returns aggregate statistics', async () => {
      repo.getStats.mockResolvedValue({
        totalCards: 42,
        byState: { draft: 10, active: 30, suspended: 2 },
        byCardType: { atomic: 25, cloze: 17 },
        byDifficulty: { intermediate: 42 },
        recentlyCreated: 5,
        recentlyUpdated: 8,
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/v1/cards/stats',
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.totalCards).toBe(42);
    });
  });

  // ==========================================================================
  // GET /v1/cards/:id/history
  // ==========================================================================

  describe('GET /v1/cards/:id/history', () => {
    it('returns card version history', async () => {
      const testCard = card();
      repo.findByIdForUser.mockResolvedValue(testCard);
      // The history repository is separate — this tests route connectivity

      const response = await fastify.inject({
        method: 'GET',
        url: `/v1/cards/${testCard.id}/history`,
        headers: { authorization: 'Bearer test-token' },
      });

      // Should return 200 (even if history is empty)
      expect(response.statusCode).toBe(200);
    });
  });
});
```

**Important:** Adjust test expectations to match the actual route registration
from earlier phases. The above is a template — adapt handler arguments, response
shapes, and mock calls to match the actual implementation.

---

## Task 3: Database Repository Integration Tests

These tests use a real PostgreSQL instance (via testcontainers or a local test
DB) and verify Prisma repository correct behavior.

### Step 1: Create test database helper

Create `tests/helpers/test-database.ts`:

```typescript
/**
 * @noema/content-service — Test Database Helper
 *
 * Manages a test PostgreSQL database for integration testing.
 * Uses a separate DATABASE_URL with test-specific schema.
 */

import { PrismaClient } from '../../generated/prisma/index.js';
import { execSync } from 'node:child_process';

let prisma: PrismaClient | null = null;

/**
 * Get or create a PrismaClient for tests.
 * Requires DATABASE_URL to be set to a test database.
 */
export function getTestPrisma(): PrismaClient {
  if (!prisma) {
    const testUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!testUrl) {
      throw new Error(
        'TEST_DATABASE_URL or DATABASE_URL must be set for integration tests'
      );
    }
    prisma = new PrismaClient({ datasourceUrl: testUrl });
  }
  return prisma;
}

/**
 * Run Prisma migrations against the test database.
 */
export function migrateTestDatabase(): void {
  const testUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!testUrl) throw new Error('TEST_DATABASE_URL must be set');
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'pipe',
  });
}

/**
 * Clean all test data from the database.
 */
export async function cleanTestDatabase(): Promise<void> {
  const p = getTestPrisma();
  // Delete in correct order (no FK constraints currently, but be safe)
  await p.cardHistory?.deleteMany({});
  await p.card.deleteMany({});
  await p.template.deleteMany({});
  await p.mediaFile.deleteMany({});
}

/**
 * Disconnect the test Prisma client.
 */
export async function disconnectTestDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
```

### Step 2: Create repository integration test

Create `tests/integration/database/content-repository.test.ts`:

```typescript
/**
 * @noema/content-service — Content Repository Integration Tests
 *
 * Tests PrismaContentRepository with a real PostgreSQL database.
 * Requires TEST_DATABASE_URL to be set.
 *
 * Run with: DATABASE_URL="postgresql://..." pnpm test -- tests/integration/database/
 */

import type { CardId, UserId } from '@noema/types';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaContentRepository } from '../../../src/infrastructure/database/prisma-content.repository.js';
import {
  cleanTestDatabase,
  disconnectTestDatabase,
  getTestPrisma,
  migrateTestDatabase,
} from '../../helpers/test-database.js';

// Skip if no test database URL is set
const hasDb = !!process.env.TEST_DATABASE_URL || !!process.env.DATABASE_URL;
const describeIf = hasDb ? describe : describe.skip;

describeIf('PrismaContentRepository (integration)', () => {
  let repository: PrismaContentRepository;

  beforeAll(() => {
    migrateTestDatabase();
    const prisma = getTestPrisma();
    repository = new PrismaContentRepository(prisma);
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  afterEach(async () => {
    await cleanTestDatabase();
  });

  // ==========================================================================
  // create + findById
  // ==========================================================================

  it('creates a card and retrieves it by ID', async () => {
    const input = {
      id: 'card_integration_1' as CardId,
      userId: 'user_integration_1' as UserId,
      cardType: 'atomic' as any,
      content: { front: 'Q', back: 'A' },
      knowledgeNodeIds: ['node_1'],
      tags: ['test'],
      source: 'user' as any,
      difficulty: 'intermediate' as any,
    };

    const created = await repository.create(input);
    expect(created.id).toBe(input.id);
    expect(created.version).toBe(1);

    const found = await repository.findById(input.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(input.id);
    expect(found!.content).toEqual(input.content);
  });

  // ==========================================================================
  // update with optimistic locking
  // ==========================================================================

  it('updates a card with correct version', async () => {
    const input = {
      id: 'card_int_update_1' as CardId,
      userId: 'user_int_1' as UserId,
      cardType: 'atomic' as any,
      content: { front: 'Q', back: 'A' },
      knowledgeNodeIds: [],
      tags: [],
      source: 'user' as any,
      difficulty: 'intermediate' as any,
    };

    await repository.create(input);

    const updated = await repository.update(
      input.id,
      { content: { front: 'Updated Q', back: 'Updated A' } },
      1 // correct version
    );

    expect(updated.version).toBe(2);
    expect((updated.content as any).front).toBe('Updated Q');
  });

  it('throws VersionConflictError on wrong version', async () => {
    const input = {
      id: 'card_int_update_2' as CardId,
      userId: 'user_int_1' as UserId,
      cardType: 'atomic' as any,
      content: { front: 'Q', back: 'A' },
      knowledgeNodeIds: [],
      tags: [],
      source: 'user' as any,
      difficulty: 'intermediate' as any,
    };

    await repository.create(input);

    await expect(
      repository.update(input.id, { content: { front: 'X', back: 'Y' } }, 999)
    ).rejects.toThrow(/version/i);
  });

  // ==========================================================================
  // query
  // ==========================================================================

  it('queries cards with filters', async () => {
    const userId = 'user_int_query' as UserId;
    await repository.create({
      id: 'card_int_q1' as CardId,
      userId,
      cardType: 'atomic' as any,
      content: { front: 'Q1', back: 'A1' },
      knowledgeNodeIds: [],
      tags: ['math'],
      source: 'user' as any,
      difficulty: 'beginner' as any,
    });
    await repository.create({
      id: 'card_int_q2' as CardId,
      userId,
      cardType: 'cloze' as any,
      content: { front: 'Q2 {{c1::answer}}', back: '' },
      knowledgeNodeIds: [],
      tags: ['science'],
      source: 'user' as any,
      difficulty: 'advanced' as any,
    });

    const result = await repository.query(
      { cardTypes: ['atomic' as any], limit: 10 },
      userId
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.cardType).toBe('atomic');
  });

  // ==========================================================================
  // softDelete + restore
  // ==========================================================================

  it('soft-deletes and restores a card', async () => {
    const input = {
      id: 'card_int_del_1' as CardId,
      userId: 'user_int_1' as UserId,
      cardType: 'atomic' as any,
      content: { front: 'Q', back: 'A' },
      knowledgeNodeIds: [],
      tags: [],
      source: 'user' as any,
      difficulty: 'intermediate' as any,
    };

    await repository.create(input);
    await repository.softDelete(input.id, 1);

    // Card should not be found via normal findById
    const notFound = await repository.findById(input.id);
    expect(notFound).toBeNull();

    // Restore
    const restored = await repository.restore(input.id, input.userId);
    expect(restored.state).toBe('draft');
    expect(restored.deletedAt).toBeNull();

    // Now findable again
    const found = await repository.findById(input.id);
    expect(found).not.toBeNull();
  });

  // ==========================================================================
  // batch create
  // ==========================================================================

  it('creates a batch of cards transactionally', async () => {
    const userId = 'user_int_batch' as UserId;
    const inputs = Array.from({ length: 5 }, (_, i) => ({
      id: `card_int_batch_${i}` as CardId,
      userId,
      cardType: 'atomic' as any,
      content: { front: `Q${i}`, back: `A${i}` },
      knowledgeNodeIds: [],
      tags: [],
      source: 'user' as any,
      difficulty: 'intermediate' as any,
    }));

    const result = await repository.createBatch(inputs);

    expect(result.successCount).toBe(5);
    expect(result.failureCount).toBe(0);
    expect(result.created).toHaveLength(5);
  });

  // ==========================================================================
  // stats
  // ==========================================================================

  it('returns card aggregate statistics', async () => {
    const userId = 'user_int_stats' as UserId;
    await repository.create({
      id: 'card_int_stats_1' as CardId,
      userId,
      cardType: 'atomic' as any,
      content: { front: 'Q', back: 'A' },
      knowledgeNodeIds: [],
      tags: [],
      source: 'user' as any,
      difficulty: 'intermediate' as any,
    });

    const stats = await repository.getStats(userId);
    expect(stats.totalCards).toBe(1);
    expect(stats.byState.draft).toBe(1);
  });
});
```

---

## Task 4: Event Consumer Integration Tests

Create `tests/integration/events/consumers.test.ts`:

```typescript
/**
 * @noema/content-service — Event Consumer Integration Tests
 *
 * Tests event consumers with mocked Prisma and a real or mocked Redis.
 * Verifies that consumers correctly process domain events.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserDeletedConsumer } from '../../../src/events/consumers/user-deleted.consumer.js';
import { KgNodeDeletedConsumer } from '../../../src/events/consumers/kg-node-deleted.consumer.js';
import { mockLogger } from '../../helpers/mocks.js';

describe('Event Consumers (unit)', () => {
  // These are closer to unit tests since they mock Prisma
  // True integration tests would use testcontainers

  describe('UserDeletedConsumer', () => {
    it('archives all user content on user.deleted event', async () => {
      const mockPrisma = {
        card: { updateMany: vi.fn().mockResolvedValue({ count: 5 }) },
        template: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
        mediaFile: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      };

      // We need to test the handleEvent method directly
      // Since it's protected, we can create a test subclass
      class TestableUserDeletedConsumer extends UserDeletedConsumer {
        public async testHandleEvent(event: any): Promise<boolean> {
          return this.handleEvent(event);
        }
      }

      const mockRedis = {} as any;
      const consumer = new TestableUserDeletedConsumer(
        mockRedis,
        mockPrisma as any,
        mockLogger(),
        'test-consumer'
      );

      const result = await consumer.testHandleEvent({
        id: '1-0',
        type: 'user.deleted',
        data: { userId: 'user_to_delete' },
        metadata: {},
      });

      expect(result).toBe(true);
      expect(mockPrisma.card.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user_to_delete' }),
        })
      );
    });

    it('acknowledges non-matching events', async () => {
      class TestableUserDeletedConsumer extends UserDeletedConsumer {
        public async testHandleEvent(event: any): Promise<boolean> {
          return this.handleEvent(event);
        }
      }

      const mockRedis = {} as any;
      const mockPrisma = {
        card: { updateMany: vi.fn() },
        template: { updateMany: vi.fn() },
        mediaFile: { updateMany: vi.fn() },
      };
      const consumer = new TestableUserDeletedConsumer(
        mockRedis,
        mockPrisma as any,
        mockLogger(),
        'test-consumer'
      );

      const result = await consumer.testHandleEvent({
        id: '1-0',
        type: 'user.updated',
        data: {},
        metadata: {},
      });

      expect(result).toBe(true);
      expect(mockPrisma.card.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('KgNodeDeletedConsumer', () => {
    it('removes node references from linked cards', async () => {
      class TestableKgConsumer extends KgNodeDeletedConsumer {
        public async testHandleEvent(event: any): Promise<boolean> {
          return this.handleEvent(event);
        }
      }

      const mockPrisma = {
        card: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'card_1',
              knowledgeNodeIds: ['node_A', 'node_B'],
              version: 1,
            },
            { id: 'card_2', knowledgeNodeIds: ['node_A'], version: 3 },
          ]),
          update: vi.fn().mockResolvedValue({}),
        },
      };

      const consumer = new TestableKgConsumer(
        {} as any,
        mockPrisma as any,
        mockLogger(),
        'test-consumer'
      );

      const result = await consumer.testHandleEvent({
        id: '1-0',
        type: 'kg.node.deleted',
        data: { nodeId: 'node_A' },
        metadata: {},
      });

      expect(result).toBe(true);
      expect(mockPrisma.card.update).toHaveBeenCalledTimes(2);
      expect(mockPrisma.card.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'card_1' },
          data: expect.objectContaining({
            knowledgeNodeIds: ['node_B'],
          }),
        })
      );
    });
  });
});
```

---

## Task 5: Contract Tests

Contract tests verify that the API responses match the expected schema contracts
defined in `@noema/contracts`.

Create `tests/contract/api-contract.test.ts`:

```typescript
/**
 * @noema/content-service — API Contract Tests
 *
 * Validates that API response shapes match the shared contract schemas.
 * Uses Zod schemas from @noema/contracts for validation.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// ============================================================================
// Contract Schemas (define locally if not in @noema/contracts)
// ============================================================================

const CardSchema = z.object({
  id: z.string(),
  userId: z.string(),
  cardType: z.string(),
  state: z.enum(['draft', 'active', 'suspended', 'archived']),
  difficulty: z.enum([
    'beginner',
    'elementary',
    'intermediate',
    'advanced',
    'expert',
  ]),
  content: z.record(z.unknown()),
  knowledgeNodeIds: z.array(z.string()),
  tags: z.array(z.string()),
  source: z.enum(['user', 'agent', 'system', 'import']),
  metadata: z.record(z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
  createdBy: z.string(),
  updatedBy: z.string(),
  version: z.number().int().positive(),
});

const ApiSuccessSchema = z.object({
  data: z.unknown(),
});

const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

const PaginatedResponseSchema = z.object({
  data: z.object({
    items: z.array(z.unknown()),
    total: z.number(),
    hasMore: z.boolean(),
  }),
});

// ============================================================================
// Contract Tests
// ============================================================================

describe('API Response Contracts', () => {
  it('Card entity matches contract schema', () => {
    const card = {
      id: 'card_test',
      userId: 'user_test',
      cardType: 'atomic',
      state: 'draft',
      difficulty: 'intermediate',
      content: { front: 'Q', back: 'A' },
      knowledgeNodeIds: ['node_1'],
      tags: ['test'],
      source: 'user',
      metadata: {},
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      deletedAt: null,
      createdBy: 'user_test',
      updatedBy: '',
      version: 1,
    };

    expect(() => CardSchema.parse(card)).not.toThrow();
  });

  it('Success response matches contract schema', () => {
    const response = { data: { id: 'card_test' } };
    expect(() => ApiSuccessSchema.parse(response)).not.toThrow();
  });

  it('Error response matches contract schema', () => {
    const response = {
      error: { code: 'NOT_FOUND', message: 'Card not found' },
    };
    expect(() => ApiErrorSchema.parse(response)).not.toThrow();
  });

  it('Paginated response matches contract schema', () => {
    const response = {
      data: { items: [{ id: 'card_1' }], total: 1, hasMore: false },
    };
    expect(() => PaginatedResponseSchema.parse(response)).not.toThrow();
  });

  it('All card states are valid enum values', () => {
    const states = ['draft', 'active', 'suspended', 'archived'];
    for (const state of states) {
      expect(() =>
        z.enum(['draft', 'active', 'suspended', 'archived']).parse(state)
      ).not.toThrow();
    }
  });

  it('All difficulty levels are valid enum values', () => {
    const levels = [
      'beginner',
      'elementary',
      'intermediate',
      'advanced',
      'expert',
    ];
    for (const level of levels) {
      expect(() =>
        z
          .enum([
            'beginner',
            'elementary',
            'intermediate',
            'advanced',
            'expert',
          ])
          .parse(level)
      ).not.toThrow();
    }
  });
});
```

---

## Task 6: Utility Tests

Create `tests/unit/utils/content-hash.test.ts`:

```typescript
/**
 * @noema/content-service — Content Hash Tests
 */

import { describe, expect, it } from 'vitest';
import { generateContentHash } from '../../../src/utils/content-hash.js';

describe('generateContentHash', () => {
  it('produces consistent hash for same input', () => {
    const content = { front: 'Q', back: 'A' };
    const hash1 = generateContentHash('atomic', content as any);
    const hash2 = generateContentHash('atomic', content as any);
    expect(hash1).toBe(hash2);
  });

  it('produces different hash for different content', () => {
    const hash1 = generateContentHash('atomic', {
      front: 'Q1',
      back: 'A1',
    } as any);
    const hash2 = generateContentHash('atomic', {
      front: 'Q2',
      back: 'A2',
    } as any);
    expect(hash1).not.toBe(hash2);
  });

  it('produces different hash for different card types', () => {
    const content = { front: 'Q', back: 'A' };
    const hash1 = generateContentHash('atomic', content as any);
    const hash2 = generateContentHash('cloze', content as any);
    expect(hash1).not.toBe(hash2);
  });

  it('is stable regardless of key order', () => {
    const content1 = { front: 'Q', back: 'A', hint: 'H' };
    const content2 = { hint: 'H', back: 'A', front: 'Q' };
    const hash1 = generateContentHash('atomic', content1 as any);
    const hash2 = generateContentHash('atomic', content2 as any);
    expect(hash1).toBe(hash2);
  });

  it('returns a 64-character hex string (SHA-256)', () => {
    const hash = generateContentHash('atomic', {
      front: 'Q',
      back: 'A',
    } as any);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
```

Create `tests/unit/utils/cursor.test.ts`:

```typescript
/**
 * @noema/content-service — Cursor Utility Tests
 */

import { describe, expect, it } from 'vitest';
import { encodeCursor, decodeCursor } from '../../../src/utils/cursor.js';

describe('cursor utilities', () => {
  it('encodes and decodes a cursor round-trip', () => {
    const data = {
      id: 'card_123',
      sortValue: '2024-01-01T00:00:00.000Z',
      sortField: 'createdAt',
    };
    const encoded = encodeCursor(data);
    const decoded = decodeCursor(encoded);
    expect(decoded).toEqual(data);
  });

  it('returns null for invalid cursor', () => {
    expect(decodeCursor('not-valid')).toBeNull();
    expect(decodeCursor('')).toBeNull();
  });

  it('produces a base64url-encoded string', () => {
    const data = {
      id: 'card_123',
      sortValue: '2024-01-01',
      sortField: 'createdAt',
    };
    const encoded = encodeCursor(data);
    // base64url uses only these characters
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
```

Create `tests/unit/utils/content-sanitizer.test.ts`:

```typescript
/**
 * @noema/content-service — Content Sanitizer Tests
 */

import { describe, expect, it } from 'vitest';
import {
  sanitizeString,
  sanitizeCardContent,
} from '../../../src/utils/content-sanitizer.js';

describe('sanitizeString', () => {
  it('removes script tags', () => {
    const result = sanitizeString('<p>Hello</p><script>alert("xss")</script>');
    expect(result).toBe('<p>Hello</p>');
    expect(result).not.toContain('script');
  });

  it('preserves safe HTML tags', () => {
    const result = sanitizeString('<strong>Bold</strong> and <em>italic</em>');
    expect(result).toContain('<strong>');
    expect(result).toContain('<em>');
  });

  it('removes event handlers', () => {
    const result = sanitizeString('<p onclick="alert(1)">Click me</p>');
    expect(result).not.toContain('onclick');
  });

  it('returns non-string values unchanged', () => {
    expect(sanitizeString(42 as any)).toBe(42);
  });
});

describe('sanitizeCardContent', () => {
  it('deep-sanitizes all string values in content', () => {
    const content = {
      front: '<p>Question <script>evil()</script></p>',
      back: '<strong>Answer</strong>',
      options: [
        { text: '<img onerror="alert(1)" src="x">' },
        { text: 'Normal text' },
      ],
    };

    const sanitized = sanitizeCardContent(content);
    expect(sanitized.front).not.toContain('script');
    expect(sanitized.back).toContain('<strong>');
    expect((sanitized.options as any[])[0].text).not.toContain('onerror');
  });
});
```

---

## Task 7: Update Vitest Config for Test Paths

Ensure the Vitest config includes all test directories. Check `vitest.config.ts`
or `vite.config.ts` for the `include` pattern:

```typescript
// vitest.config.ts
export default {
  test: {
    include: ['tests/**/*.test.ts'],
    // Optionally separate integration tests
    // Can use test.pool: 'forks' for isolation
  },
};
```

Consider adding custom test scripts to `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run tests/unit/",
    "test:integration": "vitest run tests/integration/",
    "test:contract": "vitest run tests/contract/",
    "test:e2e": "vitest run tests/e2e/",
    "test:all": "vitest run tests/"
  }
}
```

---

## Checklist

- [ ] `tests/helpers/mocks.ts` updated with `findByContentHash`, `restore`,
      `getStats`, `queryCursor` methods
- [ ] `mockHistoryRepository()` and `mockCacheProvider()` added
- [ ] Existing unit tests updated for new signatures (especially
      `batchChangeState`)
- [ ] `tests/helpers/test-server.ts` created for API integration tests
- [ ] `tests/integration/api/content-routes.test.ts` covers GET, POST, PUT,
      PATCH, DELETE, restore, stats, history
- [ ] `tests/helpers/test-database.ts` created for repository integration tests
- [ ] `tests/integration/database/content-repository.test.ts` covers CRUD,
      version conflict, query, stats, batch
- [ ] `tests/integration/events/consumers.test.ts` covers all 3 consumers
- [ ] `tests/contract/api-contract.test.ts` validates response shapes against
      schemas
- [ ] `tests/unit/utils/content-hash.test.ts` covers hash consistency and
      uniqueness
- [ ] `tests/unit/utils/cursor.test.ts` covers encode/decode round-trip
- [ ] `tests/unit/utils/content-sanitizer.test.ts` covers XSS removal and safe
      tag preservation
- [ ] `package.json` scripts updated for `test:unit`, `test:integration`,
      `test:contract`
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (unit tests)
- [ ] `pnpm lint` passes
