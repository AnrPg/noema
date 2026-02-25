# Phase 5: API Enhancements

## Objective

Add OpenAPI documentation, soft-delete restore endpoint, content version
history, aggregate statistics, and MinIO health check.

## Prerequisites

- Phases 1–4 completed

## Gaps Fixed

- **Gap #12:** No OpenAPI/Swagger documentation
- **Gap #17:** No soft-delete restore endpoint

## Improvements Implemented

- **Improvement #14:** `@fastify/swagger`
- **Improvement #17:** Soft-delete restore endpoint
- **Improvement #18:** Content versioning / history
- **Improvement #19:** Aggregate statistics endpoint
- **Improvement #21:** MinIO health check

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

## Task 1: OpenAPI / Swagger Documentation

### Step 1: Install dependencies

```bash
cd services/content-service
pnpm add @fastify/swagger @fastify/swagger-ui
```

### Step 2: Register Swagger in `src/index.ts`

Add imports:

```typescript
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
```

Register **before any routes** (after CORS and rate-limit):

```typescript
// Register OpenAPI documentation
await fastify.register(swagger, {
  openapi: {
    info: {
      title: 'Noema Content Service API',
      description:
        'Card archive and content management service. Manages flashcards, templates, and media assets.',
      version: config.service.version,
    },
    servers: [
      {
        url: `http://${config.server.host}:${config.server.port}`,
        description: `${config.service.environment} server`,
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT access token issued by user-service',
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Cards', description: 'Card CRUD and query operations' },
      { name: 'Templates', description: 'Template management' },
      { name: 'Media', description: 'Media file management (MinIO)' },
      { name: 'Tools', description: 'MCP Agent Tool endpoints' },
      { name: 'Health', description: 'Health and readiness checks' },
    ],
  },
});

await fastify.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true,
  },
});
```

### Step 3: Add OpenAPI schema annotations to all routes

For each route in `content.routes.ts`, `template.routes.ts`, `media.routes.ts`,
and `health.routes.ts`, add `schema` definitions with proper OpenAPI tags,
descriptions, and response schemas.

**Pattern for each route:**

```typescript
fastify.get(
  '/v1/cards/:id',
  {
    preHandler: [authMiddleware],
    schema: {
      tags: ['Cards'],
      summary: 'Get card by ID',
      description:
        'Retrieve a single card by its unique identifier. Only returns cards owned by the authenticated user.',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', description: 'Card ID' } },
      },
      response: {
        200: {
          description: 'Card found',
          type: 'object',
          properties: {
            data: { $ref: '#/components/schemas/Card' },
          },
        },
        404: { description: 'Card not found' },
        401: { description: 'Unauthorized' },
      },
    },
  },
  handler
);
```

### Step 4: Define reusable OpenAPI component schemas

Create `src/api/rest/openapi-schemas.ts`:

```typescript
/**
 * @noema/content-service - OpenAPI Component Schemas
 *
 * Shared JSON Schema definitions for OpenAPI documentation.
 * Referenced via $ref in route schemas.
 */

export const openApiSchemas = {
  Card: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      userId: { type: 'string' },
      cardType: {
        type: 'string',
        enum: [
          /* all 42 card types */
        ],
      },
      state: {
        type: 'string',
        enum: ['draft', 'active', 'suspended', 'archived'],
      },
      difficulty: {
        type: 'string',
        enum: ['beginner', 'elementary', 'intermediate', 'advanced', 'expert'],
      },
      content: {
        type: 'object',
        description: 'Polymorphic card content (varies by cardType)',
      },
      knowledgeNodeIds: { type: 'array', items: { type: 'string' } },
      tags: { type: 'array', items: { type: 'string' } },
      source: { type: 'string', enum: ['user', 'agent', 'system', 'import'] },
      metadata: { type: 'object' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
      deletedAt: { type: 'string', format: 'date-time', nullable: true },
      version: { type: 'integer' },
    },
  },
  CardSummary: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      userId: { type: 'string' },
      cardType: { type: 'string' },
      state: { type: 'string' },
      difficulty: { type: 'string' },
      preview: { type: 'string' },
      knowledgeNodeIds: { type: 'array', items: { type: 'string' } },
      tags: { type: 'array', items: { type: 'string' } },
      source: { type: 'string' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
      version: { type: 'integer' },
    },
  },
  PaginatedCards: {
    type: 'object',
    properties: {
      data: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/CardSummary' },
          },
          total: { type: 'integer' },
          hasMore: { type: 'boolean' },
        },
      },
    },
  },
  ApiError: {
    type: 'object',
    properties: {
      error: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
  },
  Template: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      userId: { type: 'string' },
      name: { type: 'string' },
      description: { type: 'string', nullable: true },
      cardType: { type: 'string' },
      content: { type: 'object' },
      difficulty: { type: 'string' },
      knowledgeNodeIds: { type: 'array', items: { type: 'string' } },
      tags: { type: 'array', items: { type: 'string' } },
      visibility: { type: 'string', enum: ['private', 'public', 'shared'] },
      usageCount: { type: 'integer' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
      version: { type: 'integer' },
    },
  },
  MediaFile: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      userId: { type: 'string' },
      filename: { type: 'string' },
      originalFilename: { type: 'string' },
      mimeType: { type: 'string' },
      sizeBytes: { type: 'integer' },
      bucket: { type: 'string' },
      objectKey: { type: 'string' },
      alt: { type: 'string', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
} as const;
```

Register these schemas with Swagger in `src/index.ts`:

```typescript
import { openApiSchemas } from './api/rest/openapi-schemas.js';

// After swagger registration, add component schemas:
for (const [name, schema] of Object.entries(openApiSchemas)) {
  fastify.addSchema({ $id: name, ...schema });
}
```

---

## Task 2: Soft-Delete Restore Endpoint

### Step 1: Add `restore` to repository interface

**`src/domain/content-service/content.repository.ts`:**

```typescript
restore(id: CardId, userId: UserId): Promise<ICard>;
```

### Step 2: Implement in Prisma repository

**`src/infrastructure/database/prisma-content.repository.ts`:**

```typescript
async restore(id: CardId, userId: UserId): Promise<ICard> {
  // Find the deleted card
  const existing = await this.prisma.card.findFirst({
    where: { id, userId, deletedAt: { not: null } },
  });

  if (!existing) {
    throw new Error(`Deleted card not found: ${id}`);
  }

  const card = await this.prisma.card.update({
    where: { id },
    data: {
      deletedAt: null,
      state: 'DRAFT',   // Restore always sets state to DRAFT for safety
      updatedBy: userId,
      version: { increment: 1 },
    },
  });

  return this.toDomain(card);
}
```

### Step 3: Add `restore` to ContentService

**`src/domain/content-service/content.service.ts`:**

```typescript
async restore(
  id: CardId,
  context: IExecutionContext
): Promise<IServiceResult<ICard>> {
  this.logger.info({ cardId: id, correlationId: context.correlationId }, 'Restoring deleted card');

  const card = await this.repository.restore(id, context.userId);

  // Publish event
  await this.eventPublisher.publish({
    type: 'card.restored',
    data: {
      cardId: card.id,
      userId: card.userId,
    },
  });

  return {
    data: card,
    agentHints: {
      restoredCardId: card.id,
      newState: card.state,
    },
  };
}
```

### Step 4: Add REST endpoint

**`src/api/rest/content.routes.ts`:** Add `POST /v1/cards/:id/restore`:

```typescript
fastify.post<{ Params: { id: string } }>(
  '/v1/cards/:id/restore',
  {
    preHandler: [authMiddleware],
    schema: {
      tags: ['Cards'],
      summary: 'Restore a soft-deleted card',
      description: 'Restores a previously deleted card. Sets state to DRAFT.',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  },
  async (request, reply) => {
    const context = buildContext(request);
    const result = await contentService.restore(
      request.params.id as CardId,
      context
    );
    return wrapResponse(reply, result, 200);
  }
);
```

### Step 5: Add MCP tool for restore

In `src/agents/tools/content.tools.ts`, add a `restore-card` tool.

---

## Task 3: Content Version History

### Problem

When a card is updated, the previous content version is lost. For agents that
iteratively improve cards, history is valuable.

### Step 1: Create a new Prisma model

**`prisma/schema.prisma`:**

```prisma
// ============================================================================
// CardHistory — Content version snapshots
// ============================================================================

model CardHistory {
    id     String @id @db.VarChar(50)
    cardId String @map("card_id") @db.VarChar(50)
    userId String @map("user_id") @db.VarChar(50)

    // Version at time of snapshot
    version Int

    // Snapshot of the card at this version
    content    Json            @default("{}")
    difficulty DifficultyLevel @default(INTERMEDIATE)
    state      CardState       @default(DRAFT)

    // What changed
    changeType String @map("change_type") @db.VarChar(50) // 'content_update', 'state_change', etc.
    changedBy  String @map("changed_by") @db.VarChar(50)

    // Audit
    createdAt DateTime @default(now()) @map("created_at")

    @@index([cardId])
    @@index([cardId, version])
    @@index([createdAt])
    @@map("card_history")
}
```

### Step 2: Create migration

```bash
npx prisma migrate dev --name add_card_history
npx prisma generate
```

### Step 3: Create history repository

Create `src/infrastructure/database/prisma-history.repository.ts`:

```typescript
/**
 * @noema/content-service - Card History Repository
 *
 * Stores card content snapshots for version history tracking.
 */

import type { PrismaClient } from '../../../generated/prisma/index.js';
import type { CardId, UserId } from '@noema/types';
import { nanoid } from 'nanoid';

// ============================================================================
// Types
// ============================================================================

export interface ICardHistoryEntry {
  id: string;
  cardId: string;
  userId: string;
  version: number;
  content: Record<string, unknown>;
  difficulty: string;
  state: string;
  changeType: string;
  changedBy: string;
  createdAt: string;
}

export interface IHistoryRepository {
  createSnapshot(params: {
    cardId: CardId;
    userId: UserId;
    version: number;
    content: Record<string, unknown>;
    difficulty: string;
    state: string;
    changeType: string;
    changedBy: string;
  }): Promise<ICardHistoryEntry>;

  getHistory(
    cardId: CardId,
    limit?: number,
    offset?: number
  ): Promise<ICardHistoryEntry[]>;

  getVersion(
    cardId: CardId,
    version: number
  ): Promise<ICardHistoryEntry | null>;
}

// ============================================================================
// Implementation
// ============================================================================

export class PrismaHistoryRepository implements IHistoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createSnapshot(params: {
    cardId: CardId;
    userId: UserId;
    version: number;
    content: Record<string, unknown>;
    difficulty: string;
    state: string;
    changeType: string;
    changedBy: string;
  }): Promise<ICardHistoryEntry> {
    const id = `hist_${nanoid()}`;
    const entry = await this.prisma.cardHistory.create({
      data: {
        id,
        cardId: params.cardId,
        userId: params.userId,
        version: params.version,
        content: params.content,
        difficulty: params.difficulty.toUpperCase() as any,
        state: params.state.toUpperCase() as any,
        changeType: params.changeType,
        changedBy: params.changedBy,
      },
    });

    return {
      id: entry.id,
      cardId: entry.cardId,
      userId: entry.userId,
      version: entry.version,
      content: entry.content as Record<string, unknown>,
      difficulty: entry.difficulty.toLowerCase(),
      state: entry.state.toLowerCase(),
      changeType: entry.changeType,
      changedBy: entry.changedBy,
      createdAt: entry.createdAt.toISOString(),
    };
  }

  async getHistory(
    cardId: CardId,
    limit = 20,
    offset = 0
  ): Promise<ICardHistoryEntry[]> {
    const entries = await this.prisma.cardHistory.findMany({
      where: { cardId },
      orderBy: { version: 'desc' },
      take: limit,
      skip: offset,
    });

    return entries.map((e) => ({
      id: e.id,
      cardId: e.cardId,
      userId: e.userId,
      version: e.version,
      content: e.content as Record<string, unknown>,
      difficulty: e.difficulty.toLowerCase(),
      state: e.state.toLowerCase(),
      changeType: e.changeType,
      changedBy: e.changedBy,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  async getVersion(
    cardId: CardId,
    version: number
  ): Promise<ICardHistoryEntry | null> {
    const entry = await this.prisma.cardHistory.findFirst({
      where: { cardId, version },
    });

    if (!entry) return null;

    return {
      id: entry.id,
      cardId: entry.cardId,
      userId: entry.userId,
      version: entry.version,
      content: entry.content as Record<string, unknown>,
      difficulty: entry.difficulty.toLowerCase(),
      state: entry.state.toLowerCase(),
      changeType: entry.changeType,
      changedBy: entry.changedBy,
      createdAt: entry.createdAt.toISOString(),
    };
  }
}
```

### Step 4: Integrate history snapshotting into ContentService

In `src/domain/content-service/content.service.ts`:

1. Accept `IHistoryRepository` as a constructor dependency (optional via `?`)
2. Before any mutation (update, changeState, updateTags,
   updateKnowledgeNodeIds), snapshot the **current** state:

```typescript
private async snapshotBeforeChange(card: ICard, changeType: string, changedBy: string): Promise<void> {
  if (!this.historyRepository) return;
  await this.historyRepository.createSnapshot({
    cardId: card.id,
    userId: card.userId,
    version: card.version,
    content: card.content as Record<string, unknown>,
    difficulty: card.difficulty,
    state: card.state,
    changeType,
    changedBy,
  });
}
```

Call `snapshotBeforeChange(existingCard, 'content_update', context.userId)` at
the beginning of `update`, `changeState`, `updateTags`,
`updateKnowledgeNodeIds`.

3. Add `getHistory` and `getVersion` methods:

```typescript
async getHistory(
  cardId: CardId,
  context: IExecutionContext,
  limit?: number,
  offset?: number
): Promise<IServiceResult<ICardHistoryEntry[]>> {
  // Verify user owns the card
  const card = await this.repository.findByIdForUser(cardId, context.userId);
  if (!card) throw new Error(`Card not found: ${cardId}`);

  const entries = await this.historyRepository!.getHistory(cardId, limit, offset);
  return { data: entries, agentHints: { count: entries.length } };
}
```

### Step 5: Add REST endpoints

**`src/api/rest/content.routes.ts`:**

```typescript
// GET /v1/cards/:id/history
fastify.get<{
  Params: { id: string };
  Querystring: { limit?: number; offset?: number };
}>(
  '/v1/cards/:id/history',
  {
    preHandler: [authMiddleware],
    schema: { tags: ['Cards'], summary: 'Get card version history' },
  },
  async (request, reply) => {
    const context = buildContext(request);
    const result = await contentService.getHistory(
      request.params.id as CardId,
      context,
      request.query.limit,
      request.query.offset
    );
    return wrapResponse(reply, result);
  }
);

// GET /v1/cards/:id/history/:version
fastify.get<{ Params: { id: string; version: string } }>(
  '/v1/cards/:id/history/:version',
  {
    preHandler: [authMiddleware],
    schema: { tags: ['Cards'], summary: 'Get specific card version' },
  },
  async (request, reply) => {
    const context = buildContext(request);
    const result = await contentService.getVersion(
      request.params.id as CardId,
      parseInt(request.params.version, 10),
      context
    );
    return wrapResponse(reply, result);
  }
);
```

---

## Task 4: Aggregate Statistics Endpoint

### Step 1: Add stats method to repository

**`src/domain/content-service/content.repository.ts`:**

```typescript
getStats(userId: UserId): Promise<ICardStats>;
```

**Types in `src/types/content.types.ts`:**

```typescript
export interface ICardStats {
  totalCards: number;
  byState: Record<string, number>;
  byCardType: Record<string, number>;
  byDifficulty: Record<string, number>;
  recentlyCreated: number; // last 7 days
  recentlyUpdated: number; // last 7 days
}
```

### Step 2: Implement in Prisma repository

```typescript
async getStats(userId: UserId): Promise<ICardStats> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [total, byState, byCardType, byDifficulty, recentCreated, recentUpdated] = await Promise.all([
    this.prisma.card.count({ where: { userId, deletedAt: null } }),
    this.prisma.card.groupBy({ by: ['state'], where: { userId, deletedAt: null }, _count: true }),
    this.prisma.card.groupBy({ by: ['cardType'], where: { userId, deletedAt: null }, _count: true }),
    this.prisma.card.groupBy({ by: ['difficulty'], where: { userId, deletedAt: null }, _count: true }),
    this.prisma.card.count({ where: { userId, deletedAt: null, createdAt: { gte: sevenDaysAgo } } }),
    this.prisma.card.count({ where: { userId, deletedAt: null, updatedAt: { gte: sevenDaysAgo } } }),
  ]);

  return {
    totalCards: total,
    byState: Object.fromEntries(byState.map((g) => [g.state.toLowerCase(), g._count])),
    byCardType: Object.fromEntries(byCardType.map((g) => [this.fromDbCardType(g.cardType), g._count])),
    byDifficulty: Object.fromEntries(byDifficulty.map((g) => [g.difficulty.toLowerCase(), g._count])),
    recentlyCreated: recentCreated,
    recentlyUpdated: recentUpdated,
  };
}
```

### Step 3: Add to ContentService + REST route

**ContentService:**

```typescript
async getStats(context: IExecutionContext): Promise<IServiceResult<ICardStats>> {
  const stats = await this.repository.getStats(context.userId);
  return { data: stats, agentHints: { totalCards: stats.totalCards } };
}
```

**REST:** `GET /v1/cards/stats` (register **before** `/v1/cards/:id` to avoid
parameter collision):

```typescript
fastify.get(
  '/v1/cards/stats',
  {
    preHandler: [authMiddleware],
    schema: { tags: ['Cards'], summary: 'Get card aggregate statistics' },
  },
  async (request, reply) => {
    const context = buildContext(request);
    const result = await contentService.getStats(context);
    return wrapResponse(reply, result);
  }
);
```

---

## Task 5: MinIO Health Check

### Step 1: Add `healthCheck` method to MinioStorageProvider

**`src/infrastructure/storage/minio-storage.provider.ts`:**

```typescript
/**
 * Check if MinIO is reachable and the bucket exists.
 */
async healthCheck(): Promise<{ status: 'ok' | 'error'; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    await this.client.bucketExists(this.bucket);
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (error) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

### Step 2: Include MinIO in the health route

**`src/api/rest/health.routes.ts`** — the health route currently checks Prisma
and Redis. Add MinIO:

Pass `storageProvider` to `registerHealthRoutes` and include its check:

```typescript
export function registerHealthRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  redis: Redis,
  storageProvider?: MinioStorageProvider
): void;
```

In the readiness check:

```typescript
const minioHealth = storageProvider
  ? await storageProvider.healthCheck()
  : { status: 'ok' as const, latencyMs: 0 };
```

Include in the response:

```typescript
return reply.status(allHealthy ? 200 : 503).send({
  status: allHealthy ? 'ok' : 'degraded',
  dependencies: {
    database: dbHealth,
    redis: redisHealth,
    objectStorage: minioHealth,
  },
});
```

Update the call in `src/index.ts`:

```typescript
registerHealthRoutes(
  fastify as unknown as FastifyInstance,
  prisma,
  redis,
  storageProvider
);
```

---

## Checklist

- [ ] `@fastify/swagger` and `@fastify/swagger-ui` installed
- [ ] Swagger registered in `src/index.ts` with full OpenAPI spec
- [ ] Component schemas defined in `src/api/rest/openapi-schemas.ts`
- [ ] All route files have `schema.tags`, `summary`, `description`, response
      types
- [ ] `/docs` UI is accessible in browser
- [ ] `restore` method added to repository interface and implementation
- [ ] `POST /v1/cards/:id/restore` endpoint works (sets state to DRAFT)
- [ ] Restore event published
- [ ] `CardHistory` model added to Prisma schema
- [ ] Migration created and generated
- [ ] `PrismaHistoryRepository` created
- [ ] History snapshots taken before all mutations (update, changeState,
      updateTags, updateKnowledgeNodeIds)
- [ ] `GET /v1/cards/:id/history` endpoint returns version history
- [ ] `GET /v1/cards/:id/history/:version` returns a specific version
- [ ] `ICardStats` type defined
- [ ] `getStats` method in repository and service
- [ ] `GET /v1/cards/stats` route registered before `/v1/cards/:id`
- [ ] `healthCheck()` added to MinioStorageProvider
- [ ] MinIO included in readiness check response
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm lint` passes
