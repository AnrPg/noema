# ADR-0035: Content Service Phase 3 — Security & Resilience

**Status:** Accepted  
**Date:** 2025-02-25  
**Author:** AI Pair  
**Phase:** Phase 3 of content-service hardening  
**Predecessors:** ADR-0033 (Phase 1 Foundation DRY), ADR-0034 (Phase 2 Data
Integrity)

## Context

Phase 2 (ADR-0034) established atomic optimistic locking, per-card batch
versioning, and transactional batch create with full mitigations. Phase 3
addresses the remaining security and resilience gaps needed before production
readiness:

1. **No rate limiting** — MCP agents and REST clients can overwhelm the service
   with unbounded requests.
2. **No request body size limits** — large payloads (especially batch endpoints)
   can exhaust memory.
3. **No content deduplication** — agents can create identical cards, wasting
   storage and confusing learners.
4. **No content sanitization** — user/agent-submitted HTML content can carry
   stored XSS payloads.

## Decisions

### Task 1: Rate Limiting (`@fastify/rate-limit`)

Registered `@fastify/rate-limit` globally with three tiers:

| Tier   | Scope           | Default     | Applies to                                       |
| ------ | --------------- | ----------- | ------------------------------------------------ |
| Global | All routes      | 100 req/min | Read endpoints                                   |
| Write  | Mutating routes | 30 req/min  | POST create, PATCH update, DELETE                |
| Batch  | Batch routes    | 10 req/min  | POST /v1/cards/batch, POST /v1/cards/batch/state |

**Key generator:** Extracts `sub` from JWT via fast base64url decode (no crypto
verification) for user-scoped buckets. Falls back to IP for unauthenticated
requests. This is safe — we're bucketing, not authenticating.

**Error response:** Returns structured `IApiErrorResponse` with code
`RATE_LIMIT_EXCEEDED`, retry-after details, and remaining count.

**Backing store:** Redis (shared with existing infrastructure) for distributed
rate limiting across replicas.

### Task 2: Request Body Size Limits

- **Global body limit:** 1 MB (Fastify constructor option).
- **Batch body limit:** 5 MB (per-route `bodyLimit` on batch endpoints).
- Both configurable via environment variables: `BODY_LIMIT`, `BATCH_BODY_LIMIT`.

### Task 3: Content Deduplication

**Scope:** Per-user (same content can exist for different users).

**Mechanism:** SHA-256 hash of `stableStringify({ cardType, content })` stored
as `contentHash` column on the `cards` table with a B-tree index.

**Behavior:**

- **Single create:** Hard reject with 409 Conflict. Error response includes the
  full existing card in `details.existingCard`, enabling single-roundtrip dedup
  for agents.
- **Batch create:** Duplicates (both against DB and intra-batch) are added to
  `failed[]` array with descriptive error. Non-duplicate cards proceed normally.
- **Update:** Content hash is recomputed when content changes and stored
  alongside the update.

**Migration:** `ALTER TABLE "cards" ADD COLUMN "content_hash" VARCHAR(64)` +
`CREATE INDEX "cards_content_hash_idx"`. Existing cards have `NULL` contentHash
(backfill is optional).

**Determinism:** Custom `stableStringify()` sorts keys recursively, ensuring
identical logical content always produces the same hash regardless of property
insertion order.

### Task 4: Content Sanitization (`sanitize-html`)

**Approach:** Deep-walk all string fields in card/template content objects
before validation.

**Allow list:** Curated set of safe HTML tags covering:

- Inline formatting (b, i, em, strong, u, s, mark, sub, sup)
- Block structure (p, br, hr, blockquote, div, span, headings)
- Lists, tables, code/pre, links, images, audio
- Ruby annotations (CJK), MathML subset (KaTeX output)

**Skip fields:** Fields in `SKIP_SANITIZATION_FIELDS` set bypass sanitization:

- `code`, `codeSnippet`, `sourceCode` — code content with HTML-like syntax
- `pre` — preformatted text
- `hint` — plain text hints
- `formula`, `latex` — mathematical notation

**Integration points:**

- `ContentService.create()` — sanitize before validation
- `ContentService.createBatch()` — sanitize each card before validation
- `ContentService.update()` — sanitize when content is present
- `TemplateService.create()` / `update()` — sanitize template content

## Architecture

### IRouteOptions Pattern

Route registrars accept an optional `IRouteOptions` parameter containing rate
limit and body limit configuration. This keeps route files agnostic to config
loading while allowing the bootstrap to inject environment-specific settings:

```typescript
interface IRouteOptions {
  rateLimit?: { writeMax: number; batchMax: number; timeWindow: number };
  bodyLimits?: { defaultLimit: number; batchLimit: number };
}
```

### Data Flow

```
Request → Rate Limit (onRequest) → Auth (preHandler) → Handler
  → Sanitize content
  → Validate (Zod)
  → Compute contentHash
  → Dedup check (findByContentHash)
  → Repository create/update (with contentHash)
  → Event publish
  → Response
```

## Files Changed

### New Files

- `src/utils/content-hash.ts` — `stableStringify()` + `generateContentHash()`
- `src/utils/content-sanitizer.ts` — `SKIP_SANITIZATION_FIELDS`,
  `sanitizeString()`, `sanitizeCardContent()`, `deepSanitize()`
- `prisma/migrations/20260225000000_add_content_hash/migration.sql` — Schema
  migration

### Modified Files

- `prisma/schema.prisma` — Added `contentHash` field + index to Card model
- `src/config/index.ts` — Rate limit and body limit configuration
- `src/types/content.types.ts` — `contentHash` on `ICard`
- `src/domain/content-service/errors/content.errors.ts` — `DuplicateCardError`
  with `existingCard`
- `src/domain/content-service/content.repository.ts` — `findByContentHash`,
  `findByContentHashes`, `contentHash` in create/update signatures
- `src/infrastructure/database/prisma-content.repository.ts` — Implementation of
  new methods + contentHash mapping
- `src/domain/content-service/content.service.ts` — Sanitization, hashing, dedup
  in create/createBatch/update
- `src/domain/content-service/template.service.ts` — Sanitization in
  create/update
- `src/api/shared/route-helpers.ts` — `IRouteOptions` interface,
  `DuplicateCardError` 409 handler
- `src/api/rest/content.routes.ts` — Per-route rate limits + batch body limit
- `src/api/rest/template.routes.ts` — Per-route rate limits
- `src/api/rest/media.routes.ts` — Per-route rate limits
- `src/index.ts` — Rate limit plugin registration, bodyLimit, routeOptions
  pass-through
- `tests/helpers/mocks.ts` — New mock methods
- `tests/fixtures/index.ts` — `contentHash` in card fixture
- `tests/unit/domain/content-service.test.ts` — Dedup + sanitization tests

## Trade-offs

| Decision                   | Pro                                                                      | Con                                                             |
| -------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Per-user dedup scope       | Users get independent content spaces                                     | Same global content can be duplicated across users              |
| Hard 409 reject            | Clear, deterministic behavior; agents get existing card in one roundtrip | No merge/auto-update capability                                 |
| SHA-256 hash               | Fast, collision-resistant, 64-char hex                                   | Hash column adds 64 bytes per row                               |
| Deep-walk sanitization     | Catches nested XSS in any content field                                  | Small overhead on every write; skip-list needed for code fields |
| Redis-backed rate limiting | Distributed across replicas                                              | Requires Redis availability                                     |

## Consequences

- All write endpoints are now rate-limited (30/min write, 10/min batch)
- MCP agents must handle 429 responses with retry-after headers
- Duplicate card creation returns the existing card — agents can reuse it
  directly
- Content is sanitized on input — existing stored content is not retroactively
  cleaned
- Batch body limit prevents memory exhaustion from large agent bulk imports

## References

- [ADR-0033](./ADR-0033-content-service-phase-1-foundation-dry.md) — Phase 1
  Foundation DRY
- [ADR-0034](./ADR-0034-content-service-phase-2-data-integrity.md) — Phase 2
  Data Integrity
- [@fastify/rate-limit](https://github.com/fastify/fastify-rate-limit)
- [sanitize-html](https://github.com/apostrophecms/sanitize-html)
