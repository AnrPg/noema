# ADR-0033: Content Service Phase 1 — Foundation & DRY Cleanup

## Status

Accepted

## Date

2025-07-22

## Context

The content-service had accumulated three independently written route files
(`content.routes.ts`, `template.routes.ts`, `media.routes.ts`), each containing
their own copy of shared helper functions: `buildContext`, `wrapResponse`,
`buildErrorMetadata`, `handleError`, and the `onRequest` start-time hook. This
duplication created a maintenance burden where bug fixes or error-handling
changes had to be replicated across all three files.

Additionally:

- The `auth.middleware.ts` returned ad-hoc `{ error, message }` objects instead
  of the `IApiErrorResponse` contract used by the rest of the API surface.
- Repository write methods (`update`, `softDelete`, `changeState`, etc.) did not
  track which user performed the mutation, leaving `updatedBy` unpopulated in
  the database.

## Decision

### 1) Extract Shared Route Helpers

Created `src/api/shared/route-helpers.ts` containing five functions and two
constants extracted from the route files:

- `SERVICE_NAME`, `SERVICE_VERSION` — single source of truth
- `buildContext(request)` — builds `IExecutionContext` from Fastify request
- `wrapResponse<T>(data, request, startTime)` — wraps data in `IApiResponse<T>`
- `buildErrorMetadata(request)` — builds metadata for error responses
- `handleError(error, request, reply, logger)` — unified error handler with
  exhaustive domain-error matching and granular HTTP status codes
- `attachStartTimeHook(fastify)` — registers the `onRequest` timestamp hook

The unified `handleError` preserves all specific error codes:
`VALIDATION_ERROR`, `CARD_NOT_FOUND`, `TEMPLATE_NOT_FOUND`,
`MEDIA_NOT_FOUND`, `VERSION_CONFLICT`, `AUTHENTICATION_ERROR`,
`AUTHORIZATION_ERROR`, `BATCH_LIMIT_EXCEEDED`, `BUSINESS_RULE_ERROR`,
`DOMAIN_ERROR`, and a 500 fallback for unknown errors.

A barrel export at `src/api/shared/index.ts` re-exports all symbols.

### 2) Fix Auth Middleware Error Format

Updated `src/middleware/auth.middleware.ts` to return responses matching the
`IApiErrorResponse` contract: `{ error: { code, message }, metadata }`. This
ensures clients see a consistent error shape regardless of whether the error
originates from middleware or route handlers.

### 3) Add `updatedBy` Audit Tracking

Added an optional `userId?: UserId` parameter as the last argument to all
repository write methods in both content and template domains:

- `IContentRepository`: `update`, `changeState`, `softDelete`, `updateTags`,
  `updateKnowledgeNodeIds`
- `ITemplateRepository`: `update`, `softDelete`

The Prisma implementations conditionally set `updatedBy` when a userId is
provided. The service layer threads `context.userId` through to all repository
write calls, establishing a non-breaking audit trail without requiring schema
migrations (the `updatedBy` column already existed).

### 4) Update Barrel Exports

The new `src/api/shared/index.ts` barrel was created alongside the helper
extraction. No other barrel changes were needed.

## Consequences

### Positive

- **DRY**: Helper logic exists in exactly one place; route files are pure
  endpoint declarations.
- **Consistent errors**: Auth middleware and route handlers return the same
  `IApiErrorResponse` shape.
- **Audit trail**: All content and template mutations now record the acting
  user in `updatedBy`.
- **Minimal blast radius**: The `userId` parameter is optional and defaults to
  no-op, so no existing callers break.

### Negative

- **Coupling**: All three route files now depend on the shared module. A
  breaking change to a helper signature requires updating all route files
  simultaneously — though this is preferable to fixing the same bug in three
  places.

## Verification

```bash
pnpm typecheck   # 0 errors
pnpm test        # 247 tests passed
pnpm lint        # 0 warnings/errors

# Confirm no duplicate helpers remain in route files:
grep -rn "function buildContext\|function wrapResponse\|function handleError\|function buildErrorMetadata" src/api/rest/
# Expected: no output
```
