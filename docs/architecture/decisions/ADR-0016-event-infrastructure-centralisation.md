# ADR-0016: Event Infrastructure Centralisation

## Status

**Accepted** — 2025-07-27

## Context

After implementing three services (content-service, user-service,
session-service), a code-health audit revealed six structural issues that
had accumulated organically during rapid, contracts-first development:

| #  | Issue                                      | Severity |
| -- | ------------------------------------------ | -------- |
| 1  | Triplicated event publisher infrastructure | High     |
| 2  | Inconsistent barrel exports                | Medium   |
| 3  | Inconsistent event type locations          | Medium   |
| 4  | Empty schema objects in route options      | Low      |
| 5  | Divergent tool patterns                    | Medium   |
| 6  | Inconsistent auth middleware wiring        | Low      |

Issue 5 was resolved in a prior commit (`d829f6d`). This ADR covers the
resolution of the remaining five issues in a single coordinated change.

### Problem Details

**Triplicated publisher (128 lines × 3 services)**
`IEventPublisher`, `IEventToPublish`, and `RedisEventPublisher` were
copy-pasted across content-service, user-service, and session-service with
near-identical implementations. Minor drift had already appeared (`||` vs
`??` for defaults).

**Inconsistent event locations**
Session events were already centralised in `@noema/events`, but content
events (7 types) and user events (19 types) still lived locally inside
their respective services. User event schemas only covered 4 of 19 events.

**Missing barrel files**
The session-service lacked barrel (`index.ts`) files in 5 of its internal
directories, reducing discoverability and breaking the pattern established
by content-service.

**Empty route option schemas**
All 14 session-service REST routes used `{}` as the Fastify route options
object, losing type-safety for request validation and preventing per-route
auth middleware attachment.

**Auth middleware wiring**
Session-service applied auth middleware via a global `addHook('preHandler')`
rather than per-route `{ preHandler: authMiddleware }`, diverging from the
content-service canonical pattern and making selective unauthenticated
routes impossible.

## Decision

### 1. Expand `@noema/events` with Sub-path Exports

The `@noema/events` package is expanded from 2 modules (session, scheduler)
to 6 sub-path exports optimised for tree-shaking:

```json
{
  "exports": {
    ".":           { "types": "./dist/index.d.ts",               "import": "./dist/index.js" },
    "./session":   { "types": "./dist/session/index.d.ts",       "import": "./dist/session/index.js" },
    "./scheduler": { "types": "./dist/scheduler/index.d.ts",     "import": "./dist/scheduler/index.js" },
    "./content":   { "types": "./dist/content/index.d.ts",       "import": "./dist/content/index.js" },
    "./user":      { "types": "./dist/user/index.d.ts",          "import": "./dist/user/index.js" },
    "./publisher": { "types": "./dist/publisher/index.d.ts",     "import": "./dist/publisher/index.js" }
  }
}
```

Consumers import only the sub-paths they need:
```typescript
import type { ICardCreatedPayload } from '@noema/events/content';
import { RedisEventPublisher } from '@noema/events/publisher';
```

### 2. Centralise Event Publisher Infrastructure

The canonical `RedisEventPublisher`, `IEventPublisher`, and
`IEventToPublish` are extracted into `@noema/events/publisher`:

```
packages/events/src/publisher/
├── types.ts                  # IEventPublisher, IEventToPublish, EVENT_PUBLISHER symbol
├── redis-event-publisher.ts  # RedisEventPublisher + IRedisEventPublisherConfig
└── index.ts                  # Barrel
```

New dependencies added to `@noema/events`: `ioredis ^5.4.2`, `nanoid
^5.0.9`, `pino ^9.6.0`.

### 3. Centralise Content & User Events

**Content events** (7 event types):
- Self-contained inline types (`ICardEntitySnapshot`, `ICardUpdateChanges`)
  replace references to service-local types
- Uses `DifficultyLevel` from `@noema/types` (improves on original's
  `z.string().min(1)`)

**User events** (19 event types):
- All 19 payload interfaces extracted with self-contained types
  (`UserAuthProvider`, `IUserEntitySnapshot`)
- Schema coverage expanded from 4 partial to 19 full payload schemas
  plus 5 envelope schemas

### 4. Thin Re-export Shim Pattern

Service-local files are preserved as thin re-exports so that existing
internal imports continue to work without modification:

```typescript
// services/*/src/domain/shared/event-publisher.ts
export type { IEventPublisher, IEventToPublish } from '@noema/events/publisher';
export { EVENT_PUBLISHER } from '@noema/events/publisher';
```

This approach:
- Zero-cost at runtime (TypeScript resolves through, bundlers tree-shake)
- No import churn in service files that reference the local path
- Services can extend with local-only types if needed

### 5. Session-Service Structural Fixes

**Barrel files** — 6 `index.ts` files created:
- `domain/shared/`, `domain/session-service/`, `infrastructure/cache/`,
  `infrastructure/database/`, `middleware/`, `events/`

**Route auth wiring** — `session.routes.ts` rewritten to match canonical
content-service pattern:
- Global `addHook('preHandler')` → per-route `{ preHandler: authMiddleware }`
- `authMiddleware` parameter changed from optional to required
- Added `onRequest` timing hook and `buildMetadata()` helper
- `handleError` signature changed to include `request` for metadata

### 6. TypeScript Barrel Export Rule

With `verbatimModuleSyntax` enabled, barrels that re-export modules
containing both types and runtime values (e.g., `ContentEventType` as both
a const and a type) **must** use `export *` not `export type *`:

```typescript
// ❌ Breaks: makes ContentEventType type-only, prevents value re-export
export type * from './content.events.js';

// ✅ Works: preserves both type and value semantics
export * from './content.events.js';
```

## Consequences

### Positive

- **384 lines of triplicated publisher code eliminated** — single source of
  truth for event infrastructure
- **Full event coverage** — all 40 domain events (7 content + 19 user + 14
  session) centralised with schemas
- **Tree-shakeable** — sub-path exports ensure services only bundle the
  event domains they consume
- **User event schemas expanded from 4 to 19** — previously only 4 of 19
  user events had Zod schemas
- **Drift prevention** — `??` vs `||` inconsistency and other minor
  divergences are eliminated
- **Session-service structural parity** — barrel files, auth wiring, and
  route patterns now match content-service

### Negative

- **Additional shared package dependency** — `@noema/events` now depends
  on `ioredis`, `nanoid`, and `pino` (publisher needs Redis, ID generation,
  and structured logging)
- **Build ordering** — events package must be built before downstream
  services can typecheck, since `moduleResolution: "NodeNext"` resolves
  through `dist/` declarations

### Risks

- If a service needs a materially different publisher strategy, the shared
  `RedisEventPublisher` must be extended or wrapped — not forked. The thin
  re-export shim gives each service a natural extension point

## References

- ADR-0014: Session & Scheduler Shared Type System (`47af661`)
- ADR-0015: Session Service — Contracts-First Implementation (`b24eb68`)
- `packages/events/package.json` — Sub-path exports configuration
- `packages/events/src/publisher/` — Centralised publisher implementation
