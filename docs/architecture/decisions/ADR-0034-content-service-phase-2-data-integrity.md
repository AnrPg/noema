# ADR-0034: Content Service Phase 2 — Data Integrity & Correctness

## Status

Accepted

## Date

2025-07-22

## Context

Four data-integrity issues were identified in the content-service during Phase 2
remediation:

1. **TOCTOU race in optimistic locking** — Write methods (`update`, `softDelete`,
   `changeState`, `updateTags`, `updateKnowledgeNodeIds`) performed a two-step
   read-then-check followed by a separate UPDATE. Between the version check and
   the UPDATE, another request could modify the card, producing silent data loss
   instead of a `VersionConflictError`.

2. **Exact knowledgeNodeIdMode returned supersets** — The `query()` method used
   Prisma's `hasEvery` operator, which matches any card whose
   `knowledgeNodeIds` *contains* all requested IDs, including cards with
   additional IDs. Cards tagged with `[A, B, C]` would incorrectly match a
   query for exactly `[A, B]`.

3. **Single version in `batchChangeState`** — The batch-change-state endpoint
   accepted a single version number applied to all cards, making it impossible
   to safely transition a batch where cards have divergent versions.

4. **Non-transactional batch create** — `createBatch` iterated over inputs
   without a database transaction, meaning a failure partway through left
   orphaned cards with no correlation ID and no rollback capability.

## Decision

### Task 1: Atomic Optimistic Locking with Catch-and-Re-query

Replaced the two-step pattern with an atomic `WHERE { id, version }` clause in
the Prisma `update` call. If the row does not match, Prisma throws P2025
("Record to update not found").

A private `handleOptimisticLockError(error, id, expectedVersion): Promise<never>`
method catches P2025, then re-queries `findUnique({ where: { id } })` to
distinguish between:

- **Card truly deleted** → throws `CardNotFoundError(id)`
- **Version mismatch** → throws `VersionConflictError(expected, actual)`

Applied identically to all five content-repository write methods and both
template-repository write methods (`update`, `softDelete`).

Additionally introduced `TemplateNotFoundError` (extending `DomainError` with
code `TEMPLATE_NOT_FOUND`) so the template repository can produce equally
precise error messages.

### Task 2: Exact Node Mode Post-Filter

Added an `isExactNodeMode(query)` guard that checks
`knowledgeNodeIdMode === 'exact'` with non-empty `knowledgeNodeIds`.

When active:

- **`query()`**: Over-fetches by a 3× multiplier, then post-filters with
  `knowledgeNodeIds.length === expectedLen` to exclude supersets. The page is
  sliced from the filtered results.
- **`count()`**: Delegates to `countExactNodeMode(where, expectedLength)`, which
  uses `findMany` with `select: { knowledgeNodeIds: true }` and applies the
  same length filter in-memory.

**Trade-off**: Post-filtering is necessary because Prisma has no native
"array length equals" filter. The 3× over-fetch keeps the common case efficient;
worst-case under-count is acceptable for discovery queries and self-corrects on
the next page.

### Task 3: Per-Card Versioning in `batchChangeState`

Introduced `IBatchChangeStateItem { id: CardId; version: number }` in
`content.types.ts`. Changed the method signature from
`(ids: CardId[], state, reason, version, context)` to
`(items: IBatchChangeStateItem[], state, reason, context)`.

Updated correspondingly:

- REST route: body changed from `{ ids, state, version }` to
  `{ items: [{ id, version }], state }`
- MCP tool: `batch-change-card-state` input schema and handler
- Service layer: iterates items with per-card `item.version`

Each card in the batch is now independently version-checked, preventing the
single-version-for-all bug.

### Task 4: Transactional Batch Create with Full Mitigation

Wrapped `createBatch` in `this.prisma.$transaction(async (tx) => { ... })` so
all individual card creates share a single database transaction.

Added batch correlation and recovery:

- **Batch ID**: Service generates `batch_${nanoid(21)}` and injects it into
  each card's `metadata._batchId` before passing to the repository.
  `IBatchCreateResult` now includes `batchId: string`.

- **Orphan recovery**: Added `findByBatchId(batchId, userId)` to the repository
  interface (Prisma JSON path filter on `metadata._batchId`). Exposed as
  `GET /v1/cards/batch/:batchId` and MCP tool `recover-batch`.

- **Batch rollback**: Added `softDeleteByBatchId(batchId, userId)` to the
  repository interface (`updateMany` with the same JSON path filter). Exposed
  as `DELETE /v1/cards/batch/:batchId` and MCP tool `rollback-batch`.

Both new tools are registered as P2 priority in the tool registry.

## Files Changed

| File | Changes |
|------|---------|
| `src/infrastructure/database/prisma-content.repository.ts` | Atomic WHERE in 5 write methods, `handleOptimisticLockError`, `isExactNodeMode`, `countExactNodeMode`, `$transaction` in `createBatch`, `findByBatchId`, `softDeleteByBatchId` |
| `src/infrastructure/database/prisma-template.repository.ts` | Atomic WHERE in 2 write methods, `handleOptimisticLockError` |
| `src/domain/content-service/content.service.ts` | `batchChangeState` per-card items, `createBatch` batchId injection, `findByBatchId`, `rollbackBatch` |
| `src/domain/content-service/content.repository.ts` | Added `findByBatchId`, `softDeleteByBatchId` to interface |
| `src/domain/content-service/errors/content.errors.ts` | Added `TemplateNotFoundError` |
| `src/domain/content-service/template.service.ts` | Import `TemplateNotFoundError` from errors module |
| `src/types/content.types.ts` | Added `IBatchChangeStateItem`, `batchId` in `IBatchCreateResult` |
| `src/api/rest/content.routes.ts` | Updated batch-state route body, added batch recovery/rollback routes |
| `src/agents/tools/content.tools.ts` | Updated batch-state handler, added `recover-batch` and `rollback-batch` tool definitions and handlers |
| `src/agents/tools/tool.registry.ts` | Registered 2 new tools, updated expected count to 13 |
| `tests/helpers/mocks.ts` | Added `findByBatchId`, `softDeleteByBatchId` mocks |
| `tests/unit/domain/content-service.test.ts` | Updated `batchChangeState` tests for new signature, `createBatch` mock includes `batchId` |
| `tests/unit/domain/tool-registry-contract.test.ts` | Updated expected tool count and names |

## Consequences

### Positive

- **Race-free writes**: All content and template mutations use atomic version
  checks; no window for concurrent overwrites.
- **Precise errors**: Callers always receive either `CardNotFoundError` /
  `TemplateNotFoundError` or `VersionConflictError` with the actual version —
  never a generic "not found".
- **Correct exact-mode queries**: Cards with superset node IDs are excluded,
  producing accurate results for curriculum-aligned queries.
- **Safe batch operations**: Per-card versioning prevents silent version
  mismatches; transactional batch with correlation ID enables full auditability
  and rollback.

### Negative

- **Over-fetch cost**: Exact-mode queries fetch 3× the requested limit. This is
  bounded and acceptable for the expected cardinality of knowledge-node filters.
- **Post-filter count**: `countExactNodeMode` loads IDs into memory. For very
  large datasets, a raw SQL count with `array_length()` may be preferable in
  a future phase.
- **Double assertion in batch create**: The `as unknown as` cast for Zod-parsed
  batch input is needed because Zod strips branded types. This is type-safe at
  runtime but obscures the type relationship.

## Verification

```bash
pnpm typecheck   # 0 errors
pnpm test        # 247 tests passed
pnpm lint        # 0 warnings/errors
```
