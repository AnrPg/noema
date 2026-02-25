# Phase 2: Data Integrity & Correctness

## Objective

Fix all data correctness bugs: optimistic locking race conditions, incomplete
`exact` node mode, single-version batch state changes, and non-transactional
batch creates. These are **correctness bugs** that can cause silent data
corruption in production.

## Prerequisites

- Phase 1 completed (shared route helpers, `updatedBy` threading)

## Gaps Fixed

- **Gap #3:** `exact` knowledgeNodeIdMode incomplete (only uses `hasEvery`, no
  length check)
- **Gap #6:** Batch operations not transactional
- **Gap #10:** Optimistic locking has race conditions (read-then-write instead
  of atomic)
- **Gap #16:** `batchChangeState` uses same version for all cards

## Improvements Implemented

- **Improvement #2:** Fix optimistic locking atomicity
- **Improvement #7:** Fix `exact` knowledgeNodeIdMode
- **Improvement #11:** Fix `batchChangeState` versioning
- **Improvement #13:** Batch `createBatch` with `$transaction`

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

## Task 1: Fix Optimistic Locking Atomicity

### Problem

In `src/infrastructure/database/prisma-content.repository.ts`, ALL write methods
use a two-step read-check-write pattern:

```typescript
const existing = await this.prisma.card.findUnique({ where: { id } });
if (existing.version !== version) throw new VersionConflictError(...);
const card = await this.prisma.card.update({ where: { id }, data: { ... } });
```

Between the `findUnique` and `update`, a concurrent request could update the
record, causing a silent lost update.

### Fix

Replace the two-step pattern with an atomic `where` clause that includes the
version:

```typescript
// WRONG (current):
const existing = await this.prisma.card.findUnique({ where: { id } });
if (!existing) throw new Error(`Card not found: ${id}`);
if (existing.version !== version) throw new VersionConflictError(version, existing.version);
const card = await this.prisma.card.update({ where: { id }, data: { ... } });

// CORRECT (atomic):
try {
  const card = await this.prisma.card.update({
    where: { id, version },  // Atomic version check
    data: {
      ...updateFields,
      version: { increment: 1 },
      ...(userId ? { updatedBy: userId } : {}),
    },
  });
  return this.toDomain(card);
} catch (error) {
  // Prisma throws P2025 when no record matches the where clause
  if (this.isPrismaNotFound(error)) {
    // Determine if it's truly not found or a version conflict
    const existing = await this.prisma.card.findUnique({ where: { id } });
    if (!existing) throw new Error(`Card not found: ${id}`);
    throw new VersionConflictError(version, existing.version);
  }
  throw error;
}
```

### Files to modify

**`src/infrastructure/database/prisma-content.repository.ts`:**

1. Add a private helper method:

   ```typescript
   /**
    * Check if a Prisma error is a "record not found" error (P2025).
    */
   private isPrismaNotFound(error: unknown): boolean {
     return (
       error instanceof Error &&
       'code' in error &&
       (error as { code: string }).code === 'P2025'
     );
   }
   ```

2. Refactor these methods to use atomic `where: { id, version }`:
   - `update(id, input, version, userId?)` — add `version` to the where clause
   - `changeState(id, input, version, userId?)` — add `version` to the where
     clause
   - `softDelete(id, version, userId?)` — add `version` to the where clause
   - `updateTags(id, tags, version, userId?)` — add `version` to the where
     clause
   - `updateKnowledgeNodeIds(id, knowledgeNodeIds, version, userId?)` — add
     `version` to the where clause

3. Each refactored method should follow this pattern:

   ```typescript
   async update(id: CardId, input: IUpdateCardInput, version: number, userId?: UserId): Promise<ICard> {
     const data: Prisma.CardUpdateInput = { version: { increment: 1 } };
     // ... build data fields from input ...
     if (userId) data.updatedBy = userId;

     try {
       const card = await this.prisma.card.update({
         where: { id, version },
         data,
       });
       return this.toDomain(card);
     } catch (error) {
       if (this.isPrismaNotFound(error)) {
         const existing = await this.prisma.card.findUnique({ where: { id, deletedAt: null } });
         if (!existing) throw new Error(`Card not found: ${id}`);
         throw new VersionConflictError(version, existing.version);
       }
       throw error;
     }
   }
   ```

**Repeat for `src/infrastructure/database/prisma-template.repository.ts`** —
apply the same atomic pattern to `update`, `softDelete`.

### Important Prisma Note

Prisma's `update` accepts compound where conditions. With our schema `Card` has
`id` as `@id`, and `version` is a regular field. We need to use a slightly
different approach since Prisma's `update` `where` only accepts unique fields.
Use `updateMany` with `where: { id, version }` and then fetch the updated
record:

```typescript
async update(id: CardId, input: IUpdateCardInput, version: number, userId?: UserId): Promise<ICard> {
  const data: Record<string, unknown> = {};
  // ... build data fields ...

  const result = await this.prisma.card.updateMany({
    where: { id, version, deletedAt: null },
    data: {
      ...data,
      version: version + 1,
      updatedAt: new Date(),
      ...(userId ? { updatedBy: userId } : {}),
    },
  });

  if (result.count === 0) {
    const existing = await this.prisma.card.findUnique({ where: { id } });
    if (!existing || existing.deletedAt !== null) {
      throw new Error(`Card not found: ${id}`);
    }
    throw new VersionConflictError(version, existing.version);
  }

  // Fetch the updated card
  const card = await this.prisma.card.findUniqueOrThrow({ where: { id } });
  return this.toDomain(card);
}
```

**Choose this `updateMany` approach** since Prisma `update` only accepts
`@id`/`@unique` fields in `where`. The `updateMany` approach is atomic at the
database level — PostgreSQL will only update rows matching ALL where conditions.

**Note:** `updateMany` doesn't return the updated record, so we need a follow-up
`findUnique`. This is safe because the version has been atomically incremented,
preventing stale reads.

**Note:** With `updateMany`, you cannot use `{ increment: 1 }` syntax. Instead
compute `version + 1` directly in the data.

---

## Task 2: Fix `exact` knowledgeNodeIdMode

### Problem

In `src/infrastructure/database/prisma-content.repository.ts`,
`buildWhereClause`, the `exact` mode only uses `hasEvery` which matches
supersets:

```typescript
case 'exact':
  where.AND = [
    { knowledgeNodeIds: { hasEvery: ids } },
    // Missing: length check
  ];
  break;
```

A card with `[A, B, C]` incorrectly matches `exact: [A, B]`.

### Fix

Use Prisma `$queryRawUnsafe` or add a raw filter. Since Prisma doesn't natively
support array length checks, use a `$queryRaw` or post-filter approach.

**Preferred approach: Use `$queryRaw` for the count/length check:**

In `buildWhereClause`, for the `exact` case:

```typescript
case 'exact':
  // hasEvery ensures all requested IDs exist in the card
  // We also need to ensure the card has EXACTLY the same set (no extras)
  where.AND = [
    ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
    { knowledgeNodeIds: { hasEvery: ids } },
    // Check array length equals the requested set size
    // Use raw SQL filter via Prisma's JsonFilter
  ];
  // Since Prisma lacks native array length filter, we add a post-filter flag
  break;
```

**Better approach — add a post-filter in the repository `query` method:**

1. Add a private flag/parameter to `buildWhereClause` that indicates whether
   post-filtering is needed.
2. If `knowledgeNodeIdMode === 'exact'`, after Prisma returns results, filter
   out cards whose `knowledgeNodeIds` length doesn't match.

**Implementation:**

```typescript
async query(query: IDeckQuery, userId: UserId): Promise<IPaginatedResponse<ICardSummary>> {
  const where = this.buildWhereClause(query, userId);
  const orderBy = this.buildOrderBy(query);
  const needsExactPostFilter = query.knowledgeNodeIdMode === 'exact' && query.knowledgeNodeIds && query.knowledgeNodeIds.length > 0;
  const exactNodeCount = query.knowledgeNodeIds?.length ?? 0;

  const offset = query.offset ?? 0;
  const limit = query.limit ?? 20;

  if (needsExactPostFilter) {
    // Fetch extra rows to account for post-filter exclusions
    const overFetchLimit = limit * 3;
    const [cards, total] = await Promise.all([
      this.prisma.card.findMany({ where, skip: 0, take: overFetchLimit + offset, orderBy }),
      this.prisma.card.count({ where }),
    ]);

    // Post-filter: exact set equality
    const filtered = cards.filter(c => c.knowledgeNodeIds.length === exactNodeCount);
    const filteredTotal = filtered.length; // Approximate — for exact counts use raw SQL
    const page = filtered.slice(offset, offset + limit);

    return {
      items: page.map(c => this.toSummary(c)),
      total: filteredTotal,
      hasMore: offset + limit < filteredTotal,
    };
  }

  const [cards, total] = await Promise.all([
    this.prisma.card.findMany({ where, skip: offset, take: limit, orderBy }),
    this.prisma.card.count({ where }),
  ]);

  return {
    items: cards.map(c => this.toSummary(c)),
    total,
    hasMore: offset + limit < total,
  };
}
```

Also apply the same fix to the `count` method — if `exact` mode is active, count
with raw SQL or use the post-filter approach.

For `count` with `exact` mode:

```typescript
async count(query: IDeckQuery, userId: UserId): Promise<number> {
  const where = this.buildWhereClause(query, userId);
  const needsExactPostFilter = query.knowledgeNodeIdMode === 'exact' && query.knowledgeNodeIds && query.knowledgeNodeIds.length > 0;

  if (needsExactPostFilter) {
    const exactNodeCount = query.knowledgeNodeIds!.length;
    // Use raw count for exact matching
    const baseCount = await this.prisma.card.count({ where });
    // For exact total, we need raw SQL since Prisma can't filter by array length
    // This is an approximation — for production, use a raw SQL query
    const cards = await this.prisma.card.findMany({ where, select: { knowledgeNodeIds: true } });
    return cards.filter(c => c.knowledgeNodeIds.length === exactNodeCount).length;
  }

  return this.prisma.card.count({ where });
}
```

---

## Task 3: Fix `batchChangeState` Versioning

### Problem

In `src/domain/content-service/content.service.ts`, `batchChangeState` accepts a
single `version: number` for ALL cards:

```typescript
async batchChangeState(
  ids: CardId[],
  state: CardState,
  reason: string | undefined,
  version: number,  // <-- single version for all cards
  context: IExecutionContext
)
```

In practice, cards in a batch have different versions.

### Fix

#### Step 1: Update the type signature and interface

**`src/types/content.types.ts`** — add a new interface:

```typescript
/**
 * Input for batch state change — each card specifies its own version.
 */
export interface IBatchChangeStateItem {
  id: CardId;
  version: number;
}
```

#### Step 2: Update `content.service.ts`

Change the method signature:

```typescript
async batchChangeState(
  items: IBatchChangeStateItem[],
  state: CardState,
  reason: string | undefined,
  context: IExecutionContext
): Promise<IServiceResult<{ succeeded: CardId[]; failed: { id: CardId; error: string }[] }>>
```

Update the implementation loop:

```typescript
for (const item of items) {
  try {
    const stateInput: IChangeCardStateInput = { state };
    if (reason !== undefined) stateInput.reason = reason;
    await this.changeState(item.id, stateInput, item.version, context);
    succeeded.push(item.id);
  } catch (error) {
    failed.push({
      id: item.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
```

Validate batch size against `items.length` instead of `ids.length`.

#### Step 3: Update the REST route

**`src/api/rest/content.routes.ts`** — update `POST /v1/cards/batch/state`:

Change the body type:

```typescript
Body: {
  items: { id: string; version: number }[];
  state: string;
  reason?: string;
}
```

Update the schema:

```typescript
body: {
  type: 'object',
  required: ['items', 'state'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'version'],
        properties: {
          id: { type: 'string' },
          version: { type: 'number' },
        },
      },
      maxItems: 100,
    },
    state: { type: 'string', enum: ['draft', 'active', 'suspended', 'archived'] },
    reason: { type: 'string' },
  },
}
```

Update the handler:

```typescript
const result = await contentService.batchChangeState(
  request.body.items.map((i) => ({ id: i.id as CardId, version: i.version })),
  request.body.state as CardState,
  request.body.reason,
  context
);
```

#### Step 4: Update MCP tool handler

**`src/agents/tools/content.tools.ts`** — update
`createBatchChangeCardStateHandler`:

```typescript
const body = input as {
  items: { id: string; version: number }[];
  state: string;
  reason?: string;
};
const result = await contentService.batchChangeState(
  body.items.map((i) => ({ id: i.id as CardId, version: i.version })),
  body.state as CardState,
  body.reason,
  context
);
```

Update the tool definition `inputSchema` accordingly — replace `ids` + `version`
with `items`:

```typescript
{
  name: 'batch-change-card-state',
  // ...
  inputSchema: {
    type: 'object',
    required: ['items', 'state'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'version'],
          properties: {
            id: { type: 'string' },
            version: { type: 'number' },
          },
        },
        description: 'Card ID + version pairs (max 100)',
      },
      state: { type: 'string', enum: ['draft', 'active', 'suspended', 'archived'] },
      reason: { type: 'string' },
    },
  },
}
```

---

## Task 4: Make Batch Create Transactional

### Problem

In `src/infrastructure/database/prisma-content.repository.ts`, `createBatch`
uses individual `create` calls in a loop — no transaction wrapping.

### Fix

Wrap the batch in a Prisma interactive transaction for better atomicity and
performance:

```typescript
async createBatch(
  inputs: (ICreateCardInput & { id: CardId; userId: UserId })[]
): Promise<IBatchCreateResult> {
  const created: ICard[] = [];
  const failed: { index: number; error: string; input: ICreateCardInput }[] = [];

  // Use interactive transaction for partial success tracking
  await this.prisma.$transaction(async (tx) => {
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i]!;
      try {
        const card = await tx.card.create({
          data: {
            id: input.id,
            userId: input.userId,
            cardType: this.toDbCardType(input.cardType),
            state: 'DRAFT',
            difficulty: this.toDbDifficulty(input.difficulty ?? 'intermediate'),
            content: input.content as unknown as Prisma.JsonObject,
            knowledgeNodeIds: input.knowledgeNodeIds as string[],
            tags: input.tags ?? [],
            source: this.toDbSource(input.source ?? 'user'),
            metadata: (input.metadata ?? {}) as unknown as Prisma.JsonObject,
            createdBy: input.userId,
            version: 1,
          },
        });
        created.push(this.toDomain(card));
      } catch (error) {
        failed.push({
          index: i,
          error: error instanceof Error ? error.message : 'Unknown error',
          input,
        });
      }
    }
  }, {
    maxWait: 10000,  // 10s max wait for transaction slot
    timeout: 30000,  // 30s total transaction timeout
  });

  return {
    created,
    failed,
    total: inputs.length,
    successCount: created.length,
    failureCount: failed.length,
  };
}
```

**Important note:** Prisma interactive transactions roll back on thrown errors.
Since we're catching individual errors and continuing, the transaction will
commit with partial success. This is the intended behavior — individual failures
don't abort the entire batch.

If the requirement is "all or nothing", use `Promise.allSettled` pattern or
remove the try/catch inside the loop. Keep the current "partial success"
semantic since the comment says so.

---

## Checklist

- [ ] All 5 write methods in `prisma-content.repository.ts` use atomic
      `where: { id, version }` via `updateMany`
- [ ] `isPrismaNotFound` helper added to the repository
- [ ] Template repository updated similarly
- [ ] `buildWhereClause` `exact` mode includes post-filter for array length
      equality
- [ ] `query` and `count` methods handle `exact` post-filter
- [ ] `batchChangeState` accepts `IBatchChangeStateItem[]` instead of `ids[]` +
      single `version`
- [ ] REST route `POST /v1/cards/batch/state` schema updated
- [ ] MCP tool `batch-change-card-state` input schema updated
- [ ] `createBatch` wrapped in Prisma `$transaction`
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (update mocks in test files for new signatures)
- [ ] `pnpm lint` passes
