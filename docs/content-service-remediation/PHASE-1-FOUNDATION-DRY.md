# Phase 1: Foundation & DRY Cleanup

## Objective

Eliminate code duplication across route files, fix auth middleware error format
to match the API contract, populate the empty `src/utils/` directory, and add
`updatedBy` tracking to all write operations. This phase touches no external
APIs and has zero risk of breaking behavior — it's pure structural improvement.

## Gaps Fixed

- **Gap #1 (partial):** Empty `src/utils/` directory
- **Gap #13:** Auth middleware error responses don't follow `IApiErrorResponse`
  contract
- **Gap #14:** Repeated `buildContext`, `wrapResponse`, `handleError` across
  route files

## Improvements Implemented

- **Improvement #5:** Extract shared route helpers
- **Improvement #15:** Fix auth middleware error format
- **Improvement #22:** Add `updatedBy` tracking

---

## Global Instructions for Claude

> **IMPORTANT CONSTRAINTS — follow these in every phase:**
>
> - This is a TypeScript project using ESM (`"type": "module"`) — all local
>   imports must use `.js` extensions.
> - Use `import type` for type-only imports per the project convention.
> - Preserve the existing JSDoc/comment banner style:
>   `/** @noema/content-service - <File Name> */` at the top of every file.
> - Preserve the existing
>   `// ============================================================================`
>   section separator style.
> - Do not rename existing public API types or interfaces — only add new ones.
> - Run `pnpm typecheck` after each task to verify zero type errors.
> - Never modify files in `generated/`, `node_modules/`, or `dist/`.
> - All new files must be created inside `services/content-service/src/`.
> - Use the existing error class hierarchy from
>   `src/domain/content-service/errors/content.errors.ts`.
> - Use `pino` Logger (never `console.log`).
> - When editing existing files, change only what is required — do not reformat
>   or restructure code beyond the scope of the task.

---

## Task 1: Create Shared Route Helpers

### What

Create `src/api/shared/route-helpers.ts` containing the four helper functions
currently duplicated across `content.routes.ts`, `template.routes.ts`, and
`media.routes.ts`.

### File to create: `src/api/shared/route-helpers.ts`

```typescript
/**
 * @noema/content-service - Shared Route Helpers
 *
 * Common utilities shared across all REST route modules.
 * Eliminates duplication of buildContext, wrapResponse, handleError.
 */
```

### Functions to extract

1. **`buildContext(request: FastifyRequest): IExecutionContext`**
   - Reads `request.user` (typed as `{ sub?: string; roles?: string[] }`)
   - Reads `request.headers['user-agent']`
   - Returns `IExecutionContext` with userId, correlationId, roles, clientIp,
     userAgent

2. **`wrapResponse<T>(data: T, agentHints: unknown, request: FastifyRequest): IApiResponse<T>`**
   - Reads `startTime` from request (added by hook)
   - Returns
     `{ data, agentHints, metadata: { requestId, timestamp, serviceName, serviceVersion, executionTime } }`
   - Make `serviceName` and `serviceVersion` configurable via parameters or
     constants.

3. **`buildErrorMetadata(request: FastifyRequest): Record<string, unknown>`**
   - Same as wrapResponse metadata but for error responses.

4. **`handleError(error: unknown, request: FastifyRequest, reply: FastifyReply, logger: Logger): void`**
   - Consolidate ALL error mapping from all three route files. The content
     routes has the most comprehensive mapping (handles `ValidationError`,
     `CardNotFoundError`, `VersionConflictError`, `AuthenticationError`,
     `AuthorizationError`, `BatchLimitExceededError`, `BusinessRuleError`,
     `DomainError`).
   - Template routes also handle `TemplateNotFoundError`.
   - Media routes also handle `MediaNotFoundError`.
   - The unified handler must handle all of these. Import the not-found errors
     from their respective services.
   - Add a general `NotFoundError` pattern: check if the error has a known 404
     code pattern (`CARD_NOT_FOUND`, `TEMPLATE_NOT_FOUND`, `MEDIA_NOT_FOUND`) OR
     check `instanceof` for `CardNotFoundError`, `TemplateNotFoundError`,
     `MediaNotFoundError`.
   - Pass `logger` so the 500 fallback can log the error.

5. **`attachStartTimeHook(fastify: FastifyInstance): void`**
   - Registers the `onRequest` hook that sets `request.startTime = Date.now()`.

### Create barrel export: `src/api/shared/index.ts`

```typescript
export * from './route-helpers.js';
```

### How to update existing route files

For each of `content.routes.ts`, `template.routes.ts`, `media.routes.ts`:

1. Add import:
   `import { buildContext, wrapResponse, handleError, buildErrorMetadata, attachStartTimeHook } from '../shared/route-helpers.js';`
2. Remove the local `buildContext`, `wrapResponse`, `buildErrorMetadata`,
   `handleError` function definitions.
3. Remove the local `fastify.addHook('onRequest', ...)` for startTime — instead
   call `attachStartTimeHook(fastify)` once at the top of each register
   function.
4. Update every `handleError(error, request, reply)` call to
   `handleError(error, request, reply, fastify.log)` (passing the logger).
5. Verify no local copies of these helpers remain.

### Verification

After changes, `pnpm typecheck && pnpm test` must pass. Grep for duplicate
function names:

```bash
grep -rn "function buildContext\|function wrapResponse\|function handleError\|function buildErrorMetadata" src/api/rest/
# Should return zero matches — they now live in src/api/shared/
```

---

## Task 2: Fix Auth Middleware Error Format

### What

The auth middleware at `src/middleware/auth.middleware.ts` currently returns:

```json
{
  "error": "Unauthorized",
  "message": "Missing or invalid authorization header"
}
```

But the API contract (used by all route error handlers) expects:

```json
{
  "error": { "code": "AUTHENTICATION_ERROR", "message": "..." },
  "metadata": {
    "requestId": "...",
    "timestamp": "...",
    "serviceName": "content-service",
    "serviceVersion": "0.1.0"
  }
}
```

### File to modify: `src/middleware/auth.middleware.ts`

### Changes

1. Import `buildErrorMetadata` from `../api/shared/route-helpers.js`.
2. Change the "missing header" response to:
   ```typescript
   const metadata = buildErrorMetadata(request);
   return reply.status(401).send({
     error: {
       code: 'AUTHENTICATION_ERROR',
       message: 'Missing or invalid authorization header',
     },
     metadata,
   });
   ```
3. Change the "invalid token" catch response to:
   ```typescript
   const metadata = buildErrorMetadata(request);
   return reply.status(401).send({
     error: {
       code: 'AUTHENTICATION_ERROR',
       message: 'Invalid or expired token',
     },
     metadata,
   });
   ```

### Verification

Run existing tests. No existing tests directly test the auth middleware's
response shape, but typecheck should pass.

---

## Task 3: Add `updatedBy` Tracking

### What

The Prisma schema has `updatedBy` column but it's never populated on update
operations.

### Files to modify

1. **`src/infrastructure/database/prisma-content.repository.ts`**
   - In the `update()` method, after building the `data` object, add:
     `data.updatedBy = userId;`
   - Problem: the `update` method doesn't receive `userId`. We need to thread it
     through.
   - **Solution A (preferred):** Add `userId` parameter to the repository
     `update` method signature:
     ```typescript
     update(id: CardId, input: IUpdateCardInput, version: number, userId?: UserId): Promise<ICard>;
     ```
   - Same for `changeState`, `updateTags`, `updateKnowledgeNodeIds`,
     `softDelete`.
   - **Repository interface** at
     `src/domain/content-service/content.repository.ts`: add optional
     `userId?: UserId` as last parameter to each write method. This is
     backward-compatible.

2. **`src/domain/content-service/content.service.ts`**
   - Pass `context.userId` to all repository write calls:
     ```typescript
     // In update():
     card = await this.repository.update(
       id,
       parseResult.data,
       version,
       context.userId ?? undefined
     );
     // In changeState():
     const card = await this.repository.changeState(
       id,
       parseResult.data,
       version,
       context.userId ?? undefined
     );
     // In updateTags():
     const card = await this.repository.updateTags(
       id,
       tags,
       version,
       context.userId ?? undefined
     );
     // In updateKnowledgeNodeIds():
     const card = await this.repository.updateKnowledgeNodeIds(
       id,
       knowledgeNodeIds,
       version,
       context.userId ?? undefined
     );
     // In delete() soft branch:
     await this.repository.softDelete(
       id,
       existing.version,
       context.userId ?? undefined
     );
     ```

3. **`src/infrastructure/database/prisma-content.repository.ts`**
   - In each write method, if `userId` is provided, include `updatedBy: userId`
     in the Prisma update data.

4. **Repeat for template repository:**
   - `src/domain/content-service/template.repository.ts` — add `userId?: UserId`
     to write method signatures.
   - `src/infrastructure/database/prisma-template.repository.ts` — populate
     `updatedBy`.
   - `src/domain/content-service/template.service.ts` — pass `context.userId`.

### Verification

```bash
pnpm typecheck
pnpm test
```

Existing tests use mocked repositories, so they should still pass. Search for
any `updatedBy` assertions and update if needed.

---

## Task 4: Update Barrel Exports

### File to create: `src/api/shared/index.ts`

Barrel export for the new shared module.

### File to update: `src/api/rest/index.ts` (if needed)

No change needed here — it already re-exports route registrars, not helpers.

### Verification

```bash
pnpm typecheck
```

---

## Checklist

- [ ] `src/api/shared/route-helpers.ts` created with 5 extracted functions
- [ ] `src/api/shared/index.ts` barrel export created
- [ ] `content.routes.ts` — local helpers removed, imports updated
- [ ] `template.routes.ts` — local helpers removed, imports updated
- [ ] `media.routes.ts` — local helpers removed, imports updated
- [ ] `auth.middleware.ts` — error format matches `IApiErrorResponse`
- [ ] `content.repository.ts` — `userId?` added to write method signatures
- [ ] `prisma-content.repository.ts` — `updatedBy` populated in all write
      methods
- [ ] `template.repository.ts` — `userId?` added to write method signatures
- [ ] `prisma-template.repository.ts` — `updatedBy` populated in all write
      methods
- [ ] `content.service.ts` — passes `context.userId` to repository writes
- [ ] `template.service.ts` — passes `context.userId` to repository writes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm lint` passes (run `pnpm lint:fix` if needed)
