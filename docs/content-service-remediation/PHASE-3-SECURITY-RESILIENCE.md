# Phase 3: Security & Resilience

## Objective

Harden the content-service against abuse and injection attacks: add rate
limiting, request body size limits, content deduplication, and HTML/Markdown
sanitization.

## Prerequisites

- Phase 1 completed (shared route helpers)
- Phase 2 completed (atomic write operations)

## Gaps Fixed

- **Gap #4:** No rate limiting
- **Gap #5:** No request body size limits
- **Gap #9:** No content deduplication
- **Gap #15:** No input sanitization / XSS protection

## Improvements Implemented

- **Improvement #4:** Rate limiting
- **Improvement #9:** Content deduplication
- **Improvement #10:** Content sanitization
- **Improvement #12:** Request body size configuration

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

## Task 1: Add Rate Limiting

### Step 1: Install the dependency

```bash
cd services/content-service
pnpm add @fastify/rate-limit
```

### Step 2: Add rate-limit configuration to `src/config/index.ts`

Add a new `rateLimit` section to `IServiceConfig`:

```typescript
rateLimit: {
  /** Global max requests per window */
  max: number;
  /** Time window in milliseconds */
  timeWindow: number;
  /** Max requests for write endpoints (POST/PUT/PATCH/DELETE) */
  writeMax: number;
  /** Max requests for batch endpoints */
  batchMax: number;
}
```

Add environment variable parsing in `loadConfig()`:

```typescript
rateLimit: {
  max: optionalEnvInt('RATE_LIMIT_MAX', 100),
  timeWindow: optionalEnvInt('RATE_LIMIT_WINDOW_MS', 60000), // 1 minute
  writeMax: optionalEnvInt('RATE_LIMIT_WRITE_MAX', 30),
  batchMax: optionalEnvInt('RATE_LIMIT_BATCH_MAX', 10),
},
```

### Step 3: Register the plugin in `src/index.ts`

Add the import:

```typescript
import rateLimit from '@fastify/rate-limit';
```

Register it **after CORS** and **before routes**:

```typescript
// Register rate limiting
await fastify.register(rateLimit, {
  max: config.rateLimit.max,
  timeWindow: config.rateLimit.timeWindow,
  redis, // Use the existing Redis connection as the store
  keyGenerator: (request) => {
    // Use user ID from auth if available, otherwise IP
    const userId = (request as unknown as { user?: { userId: string } }).user
      ?.userId;
    return userId ?? request.ip;
  },
  errorResponseBuilder: (_request, context) => ({
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Rate limit exceeded. Retry after ${Math.ceil((context.ttl ?? 0) / 1000)} seconds.`,
    },
    metadata: {
      limit: context.max,
      remaining: 0,
      retryAfter: Math.ceil((context.ttl ?? 0) / 1000),
    },
  }),
});
```

### Step 4: Add route-specific rate limits

In `src/api/rest/content.routes.ts`, add tighter limits on write endpoints.

For each `POST`, `PUT`, `PATCH`, `DELETE` route, add a `config` property:

```typescript
config: {
  rateLimit: {
    max: 30,     // or config.rateLimit.writeMax
    timeWindow: 60000,
  },
}
```

For batch endpoints (`POST /v1/cards/batch`, `POST /v1/cards/batch/state`):

```typescript
config: {
  rateLimit: {
    max: 10,     // or config.rateLimit.batchMax
    timeWindow: 60000,
  },
}
```

Since the route registrars don't currently have access to `config`, pass it
along:

**Update `registerContentRoutes` signature:**

```typescript
export function registerContentRoutes(
  fastify: FastifyInstance,
  contentService: ContentService,
  authMiddleware: (
    request: FastifyRequest,
    reply: FastifyReply
  ) => Promise<void>,
  rateLimitConfig?: { writeMax: number; batchMax: number; timeWindow: number }
): void;
```

Then from `src/index.ts`, pass the config:

```typescript
registerContentRoutes(
  fastify as unknown as FastifyInstance,
  contentService,
  authMiddleware,
  {
    writeMax: config.rateLimit.writeMax,
    batchMax: config.rateLimit.batchMax,
    timeWindow: config.rateLimit.timeWindow,
  }
);
```

Do the same for `registerTemplateRoutes` and `registerMediaRoutes`.

---

## Task 2: Add Request Body Size Limits

### Step 1: Add body limit configuration to `src/config/index.ts`

Add to `IServiceConfig.server`:

```typescript
server: {
  host: string;
  port: number;
  /** Default body size limit in bytes (default 1 MB) */
  bodyLimit: number;
  /** Body size limit for media upload metadata (default 256 KB) */
  mediaBodyLimit: number;
  /** Body size limit for batch operations (default 5 MB) */
  batchBodyLimit: number;
}
```

Populate in `loadConfig()`:

```typescript
server: {
  host: optionalEnv('HOST', '0.0.0.0'),
  port: optionalEnvInt('PORT', 3005),
  bodyLimit: optionalEnvInt('BODY_LIMIT', 1_048_576),       // 1 MB
  mediaBodyLimit: optionalEnvInt('MEDIA_BODY_LIMIT', 262_144), // 256 KB
  batchBodyLimit: optionalEnvInt('BATCH_BODY_LIMIT', 5_242_880), // 5 MB
},
```

### Step 2: Set the global body limit in Fastify creation

In `src/index.ts`, add `bodyLimit` to the Fastify constructor:

```typescript
const fastify = Fastify({
  loggerInstance: logger,
  bodyLimit: config.server.bodyLimit,
  requestIdHeader: 'x-correlation-id',
  requestIdLogLabel: 'correlationId',
  genReqId: () => `cor_${Date.now().toString(36)}`,
});
```

### Step 3: Set per-route body limits

For batch endpoints, add `bodyLimit` to the route options:

```typescript
// POST /v1/cards/batch
fastify.post('/v1/cards/batch', {
  preHandler: [authMiddleware],
  bodyLimit: 5_242_880, // 5 MB for batch creates
  // ... rest of schema
});
```

For individual CRUD endpoints, the global limit (1 MB) is sufficient.

**Pass `bodyLimits` to route registrars** similarly to how rate limit config is
passed:

```typescript
export function registerContentRoutes(
  fastify: FastifyInstance,
  contentService: ContentService,
  authMiddleware: (...) => Promise<void>,
  options?: {
    rateLimit?: { writeMax: number; batchMax: number; timeWindow: number };
    bodyLimits?: { batchBodyLimit: number; mediaBodyLimit: number };
  }
): void
```

---

## Task 3: Content Deduplication

### Problem

Users and agents can create duplicate cards (same content, same card type, same
user). No deduplication exists.

### Step 1: Add a content hash utility

Create `src/utils/content-hash.ts`:

```typescript
/**
 * @noema/content-service - Content Hash Utility
 *
 * Generates deterministic content hashes for deduplication.
 * Uses a stable JSON stringification + SHA-256.
 */

import { createHash } from 'node:crypto';
import type { ICardContent } from '../types/content.types.js';

// ============================================================================
// Stable JSON Serialization
// ============================================================================

/**
 * Create a sorted, deterministic JSON string from an object.
 * Handles nested objects and arrays consistently.
 */
function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return '';
  if (typeof obj !== 'object') return String(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  return (
    '{' +
    sorted
      .map(
        (k) =>
          `${JSON.stringify(k)}:${stableStringify((obj as Record<string, unknown>)[k])}`
      )
      .join(',') +
    '}'
  );
}

// ============================================================================
// Content Hash
// ============================================================================

/**
 * Generate a SHA-256 hash of card content for deduplication.
 *
 * @param cardType - The card type (included in hash to prevent cross-type collisions)
 * @param content - The card content object
 * @returns Hex-encoded SHA-256 hash
 */
export function generateContentHash(
  cardType: string,
  content: ICardContent
): string {
  const payload = stableStringify({ cardType, content });
  return createHash('sha256').update(payload).digest('hex');
}
```

### Step 2: Add a `contentHash` column to the Card model

Create a **new Prisma migration**:

```bash
cd services/content-service
npx prisma migrate dev --name add_content_hash --create-only
```

**Migration SQL** (edit the generated migration):

```sql
ALTER TABLE "cards" ADD COLUMN "content_hash" VARCHAR(64);
CREATE INDEX "cards_content_hash_idx" ON "cards"("content_hash");
-- Backfill will be done by the application on next update
```

**Update `prisma/schema.prisma`** — add to the `Card` model:

```prisma
// Deduplication hash (SHA-256 of cardType + content)
contentHash String? @map("content_hash") @db.VarChar(64)

// Add index
@@index([contentHash])
```

Run `npx prisma generate` to regenerate the client.

### Step 3: Add a DuplicateCardError

In `src/domain/content-service/errors/content.errors.ts`:

```typescript
export class DuplicateCardError extends ContentDomainError {
  readonly existingCardId: string;

  constructor(existingCardId: string) {
    super(
      'DUPLICATE_CONTENT',
      `Duplicate content detected. Existing card: ${existingCardId}`,
      409 // Conflict
    );
    this.existingCardId = existingCardId;
  }
}
```

Add a type guard:

```typescript
export function isDuplicateError(error: unknown): error is DuplicateCardError {
  return error instanceof DuplicateCardError;
}
```

### Step 4: Add deduplication to the repository

In `src/infrastructure/database/prisma-content.repository.ts`:

Add a `findByContentHash` method to the repository interface first.

**`src/domain/content-service/content.repository.ts`** — add to
`IContentRepository`:

```typescript
findByContentHash(userId: UserId, contentHash: string): Promise<ICard | null>;
```

**`prisma-content.repository.ts`** — implement:

```typescript
async findByContentHash(userId: UserId, contentHash: string): Promise<ICard | null> {
  const card = await this.prisma.card.findFirst({
    where: { userId, contentHash, deletedAt: null },
  });
  return card ? this.toDomain(card) : null;
}
```

### Step 5: Integrate deduplication into ContentService

In `src/domain/content-service/content.service.ts`:

1. Import the hash utility:

   ```typescript
   import { generateContentHash } from '../../utils/content-hash.js';
   ```

2. In the `create` method, before calling `this.repository.create(...)`:

   ```typescript
   // Deduplication check
   const contentHash = generateContentHash(
     input.cardType,
     input.content as ICardContent
   );
   const existing = await this.repository.findByContentHash(
     context.userId,
     contentHash
   );
   if (existing) {
     throw new DuplicateCardError(existing.id);
   }
   ```

3. Pass the `contentHash` to the create call — add it to the repository create
   method.

4. In the `update` method, recalculate the hash when content changes:
   ```typescript
   if (input.content !== undefined) {
     const contentHash = generateContentHash(
       card.cardType,
       input.content as ICardContent
     );
     // Pass contentHash to the repository update
   }
   ```

### Step 6: Handle DuplicateCardError in routes

In the shared `handleError` helper (from Phase 1's
`src/api/shared/route-helpers.ts`), add:

```typescript
if (isDuplicateError(error)) {
  return reply.status(409).send({
    error: { code: error.code, message: error.message },
    metadata: { existingCardId: error.existingCardId },
  });
}
```

Import `isDuplicateError` from the errors module.

---

## Task 4: Content Sanitization (XSS Protection)

### Problem

Card content often contains user-generated HTML or Markdown with embedded HTML.
Without sanitization, stored XSS is possible.

### Step 1: Install a sanitization library

```bash
cd services/content-service
pnpm add isomorphic-dompurify
pnpm add -D @types/dompurify
```

**Note:** If `isomorphic-dompurify` causes issues in Node.js, use
`sanitize-html` instead:

```bash
pnpm add sanitize-html
pnpm add -D @types/sanitize-html
```

### Step 2: Create a sanitization utility

Create `src/utils/content-sanitizer.ts`:

```typescript
/**
 * @noema/content-service - Content Sanitizer
 *
 * Removes dangerous HTML/script elements from card content strings.
 * Preserves safe formatting tags (strong, em, code, etc.).
 */

import sanitizeHtml from 'sanitize-html';

// ============================================================================
// Allowed Tags Configuration
// ============================================================================

const ALLOWED_TAGS = [
  'b',
  'i',
  'em',
  'strong',
  'u',
  'strike',
  's',
  'del',
  'p',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'a',
  'img',
  'span',
  'div',
  'sub',
  'sup',
  'math',
  'mi',
  'mn',
  'mo',
  'ms',
  'mtext',
  'mfrac',
  'msqrt',
  'mroot',
  'msup',
  'msub',
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'height'],
  code: ['class'], // for syntax highlighting class names
  span: ['class'],
  div: ['class'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
};

// ============================================================================
// Sanitization Functions
// ============================================================================

/**
 * Sanitize a single HTML string, removing scripts and dangerous elements.
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return input;
  return sanitizeHtml(input, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto'],
    // Strip all tags not in allowlist (don't escape them)
    disallowedTagsMode: 'discard',
  });
}

/**
 * Deep-sanitize card content: walk through all string values in the content
 * object and sanitize each one.
 */
export function sanitizeCardContent<T extends Record<string, unknown>>(
  content: T
): T {
  return deepSanitize(content) as T;
}

function deepSanitize(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeString(value);
  }
  if (Array.isArray(value)) {
    return value.map(deepSanitize);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = deepSanitize(val);
    }
    return result;
  }
  return value;
}
```

### Step 3: Integrate sanitization into ContentService

In `src/domain/content-service/content.service.ts`:

Import:

```typescript
import { sanitizeCardContent } from '../../utils/content-sanitizer.js';
```

In the `create` method, sanitize before validation:

```typescript
// Sanitize content before validation
const sanitizedContent = sanitizeCardContent(
  input.content as Record<string, unknown>
);
input = { ...input, content: sanitizedContent };
```

In the `update` method, if `input.content` is defined:

```typescript
if (input.content !== undefined) {
  input = {
    ...input,
    content: sanitizeCardContent(input.content as Record<string, unknown>),
  };
}
```

### Step 4: Also sanitize template content

In `src/domain/content-service/template.service.ts`:

- When creating or updating templates, sanitize `input.content` using the same
  `sanitizeCardContent` function.

---

## Checklist

- [ ] `@fastify/rate-limit` installed and registered globally
- [ ] Rate limit config added to `IServiceConfig` with env var support
- [ ] Global keyGenerator uses `userId` when available, falls back to IP
- [ ] Custom error response follows `IApiErrorResponse` format
- [ ] Write endpoints have tighter limits than reads
- [ ] Batch endpoints have the tightest limits
- [ ] `bodyLimit` set globally in Fastify constructor
- [ ] Batch routes have explicit `bodyLimit: 5_242_880`
- [ ] `src/utils/content-hash.ts` created with `generateContentHash`
- [ ] `contentHash` column added to Card model + migration
- [ ] `DuplicateCardError` added to error hierarchy
- [ ] `findByContentHash` added to repository interface and implementation
- [ ] ContentService.create checks for duplicates before creating
- [ ] Hash recalculated on content update
- [ ] `sanitize-html` installed
- [ ] `src/utils/content-sanitizer.ts` created with `sanitizeCardContent`
- [ ] Content sanitized in `ContentService.create` and `ContentService.update`
- [ ] Template content sanitized in `TemplateService.create` and
      `TemplateService.update`
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (update mocks as needed)
- [ ] `pnpm lint` passes
