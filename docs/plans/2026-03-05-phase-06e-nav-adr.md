# Phase 06e — Navigation Update + ADR Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the Card Library into the app navigation and document all Phase 06 architectural decisions in ADR-007.

**Architecture:** Additive change only — a single new nav item is appended to the `Learning` group in the authenticated layout. No routing changes, no layout restructuring.

**Tech Stack:** Next.js 15, lucide-react, Markdown (ADR)

---

## Task T20: Add Card Library to Navigation

**Files:**
- Modify: `apps/web/src/app/(authenticated)/layout.tsx`

### Context

`navItems` is a plain array defined at module scope in `layout.tsx`. The Learning group currently has 3 items (Study Sessions, Knowledge Map, Goals). We add a 4th: Cards → `/cards`, icon `LibraryBig` from lucide-react.

The `LibraryBig` icon was added in lucide-react 0.407. Verify it exists in the installed version before using it; if not, fall back to `CreditCard`.

### Step 1: Write a smoke test for nav presence

```tsx
// apps/web/src/app/(authenticated)/layout.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import AuthenticatedLayout from './layout.js';

vi.mock('@noema/auth', () => ({
  useAuth: () => ({ user: { id: 'u1', displayName: 'Test', email: 't@t.com', avatarUrl: null }, logout: vi.fn() }),
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/cards',
  useRouter: () => ({ push: vi.fn() }),
}));

// Stub CommandPalette, ShortcutReferencePanel, SessionExpiryModal
vi.mock('@/components/command-palette', () => ({ CommandPalette: () => null }));
vi.mock('@/components/session-expiry-modal', () => ({ SessionExpiryModal: () => null }));
vi.mock('@/components/shortcut-reference-panel', () => ({ ShortcutReferencePanel: () => null }));

test('Card Library nav item is present', () => {
  render(<AuthenticatedLayout><div /></AuthenticatedLayout>);
  expect(screen.getByRole('link', { name: /card library/i })).toBeInTheDocument();
});

test('Card Library nav item links to /cards', () => {
  render(<AuthenticatedLayout><div /></AuthenticatedLayout>);
  expect(screen.getByRole('link', { name: /card library/i })).toHaveAttribute('href', '/cards');
});
```

### Step 2: Run to verify failure

```bash
cd apps/web && pnpm test 'authenticated.*layout'
```

Expected: FAIL — "Card Library" link not found.

### Step 3: Implement the nav change

In `apps/web/src/app/(authenticated)/layout.tsx`:

1. Add `LibraryBig` to the lucide-react import (or `CreditCard` as fallback):

```diff
 import {
   BookOpen,
   Brain,
   ChevronDown,
   LayoutDashboard,
+  LibraryBig,
   LogOut,
   Settings,
   Target,
   User,
 } from 'lucide-react';
```

2. Add the new item to the `Learning` group in `navItems`:

```diff
   {
     title: 'Learning',
     items: [
       { href: '/learning', label: 'Study Sessions', icon: BookOpen },
       { href: '/knowledge', label: 'Knowledge Map', icon: Brain },
       { href: '/goals', label: 'Goals', icon: Target },
+      { href: '/cards', label: 'Card Library', icon: LibraryBig },
     ],
   },
```

Full modified file for reference (only the diff above applies — do NOT rewrite the file):

```
apps/web/src/app/(authenticated)/layout.tsx
  line 31: add LibraryBig to lucide-react import
  line 54: add { href: '/cards', label: 'Card Library', icon: LibraryBig } to Learning items
```

### Step 4: Run tests

```bash
cd apps/web && pnpm test 'authenticated.*layout'
```

Expected: PASS (2 tests).

### Step 5: Visual verify (optional)

```bash
# Check no TypeScript errors introduced
cd apps/web && pnpm tsc --noEmit
```

### Step 6: Commit

```bash
git add apps/web/src/app/(authenticated)/layout.tsx \
        apps/web/src/app/(authenticated)/layout.test.tsx
git commit -m "feat(web): add Card Library to Learning nav group"
```

---

## Task T21: Write ADR-007 — Phase 06 Card System Frontend

**Files:**
- Create: `docs/adr/ADR-007-phase06-card-system-frontend.md`

### Step 1: Write the ADR

The ADR must follow the existing ADR format in `docs/adr/`. Read an existing ADR first to match formatting, then create:

```markdown
# ADR-007: Phase 06 Card System Frontend Architecture

**Status:** Accepted
**Date:** 2026-03-05
**Deciders:** Engineering
**Tags:** frontend, cards, api-client, renderers

---

## Context

Phase 06 introduces the full card management UI to the web app. The content-service backend exposes 42 distinct card types across standard and remediation categories. This ADR records the architectural decisions made to surface this system in the Next.js frontend.

---

## Decisions

### D1: One renderer per card type, with a factory

**Decision:** Each of the 42 card types gets its own React component in `apps/web/src/components/cards/renderers/`. A `CardRenderer` factory dispatches to the correct renderer based on `card.cardType`. All 42 types are wired at factory initialization; unimplemented types render a `FallbackRenderer` showing type name and raw content.

**Rationale:** A single switch/dispatch avoids scattered `if` chains across the codebase. Fallback renderer enables incremental implementation — pages work immediately even before all 42 renderers are polished. Isolating renderers allows independent testing and styling.

**Alternatives considered:**
- Dynamic import per type: adds complexity without benefit since the factory is a thin switch.
- Server components for renderers: card content is user-specific, not cacheable at CDN level. Client rendering is simpler.

**Consequences:** 42 files in the renderers directory. Each must export a default-named component matching `I<TypePascalCase>RendererProps`.

---

### D2: Complete rewrite of api-client content types.ts

**Decision:** `packages/api-client/src/content/types.ts` was replaced wholesale. The new file:
- Defines 42 content interfaces (one per card type) derived from the backend Zod schemas
- Uses a `CardContentByType` mapped type for discriminated union narrowing: `if (card.cardType === 'cloze') { card.content.template }` is type-safe
- Corrects `IBatchCreateResult.created` from `number` to `ICardDto[]` (the backend returns full objects)
- Adds `ICardSummaryDto` (list-safe shape without full content blob) and `IBatchSummaryDto`

**Rationale:** The old types were incompatible with the backend (wrong type names, wrong field names). Any incremental patch would leave the types in a contradictory state. A complete rewrite from the backend schemas guarantees correctness.

**Consequences:** Any code that was (incorrectly) using the old type names will get TypeScript compile errors, which is the desired outcome — surfaces implicit bugs.

---

### D3: batchId stored in cards.metadata._batchId — no dedicated batch table

**Decision:** Batch identity is stored as `metadata._batchId` (JSONB) on individual card rows. No dedicated `batches` table. The `GET /v1/cards/batch/recent` endpoint uses raw SQL `GROUP BY metadata->>'_batchId' ORDER BY MAX(created_at) DESC`.

**Rationale:** Avoids schema migration for a lightweight feature. The number of distinct batches per user is small; GROUP BY performance on a JSONB field with a GIN index is adequate.

**Consequences:** Batch queries cannot use standard Prisma query builder (raw SQL required). `findRecentBatches` must be raw SQL in the repository.
**Follow-up:** If batch history grows large (>10k batches/user), add a partial index on `metadata->>'_batchId'` with `NOT NULL` filter.

---

### D4: GET /v1/cards/batch/recent registered before GET /v1/cards/batch/:batchId

**Decision:** The literal route `/batch/recent` is registered **before** the parameterized route `/batch/:batchId` in `content.routes.ts`.

**Rationale:** Fastify (like most routers) matches routes in registration order. If `:batchId` is registered first, the string `"recent"` is captured as a batchId parameter rather than routing to the literal handler.

**Consequences:** Any future literal sub-routes under `/batch/` must also be registered before `:batchId`. This is documented in the routes file with a comment.

---

### D5: Presigned upload — direct PUT bypasses API client auth interceptor

**Decision:** The `MediaUploader` component performs the presigned PUT directly via `fetch()`, not through the `@noema/api-client` HTTP wrapper.

**Rationale:** Presigned URLs (S3/R2) are self-authorizing. Adding an `Authorization` header to a presigned PUT causes the signature verification to fail because the signer included only specific headers in the signed scope. The API client unconditionally adds auth headers.

**Consequences:** The upload step has no retry logic or error normalization from the API client. The component handles its own error state. This is intentional — upload failures should prompt the user, not silently retry.

---

### D6: Wizard uses raw JSON textarea for unimplemented complex types

**Decision:** The Card Creator wizard (Phase 06) presents a raw JSON textarea for card types whose content structures are too complex for a simple form (e.g., matching pairs, ordering sequences, concept graphs). Phase 10 will replace these with rich structured editors.

**Rationale:** Unblocks end-to-end testing of the card system without requiring bespoke editors for all 42 types before Phase 06 ships. Advanced users can still create any card type.

**Consequences:** Poor UX for complex card types in Phase 06. Tracked as Phase 10 work item.

---

### D7: DeckQueryFilter is a controlled component — no internal query state

**Decision:** `DeckQueryFilter` holds no internal query state. All state is owned by the parent page. The component receives `query: IDeckQueryInput` and calls `onChange(q)` on every interaction.

**Rationale:** Controlled components are simpler to test (no need to inspect internal state), easier to serialize to URL params in the future, and avoid double-truth issues when the parent also needs the query for API calls.

**Consequences:** The parent page must manage the query state. For simple pages this is fine; if query state becomes complex it can be moved to a hook (`useCardLibraryState`).

---

## Rejected Alternatives

- **Dedicated `batches` DB table:** Adds schema migration complexity for a feature that can be fully served by JSONB queries at current scale.
- **Zustand store for card selection:** Selection state is ephemeral and page-local; global state store is overkill. Local `useState` in `CardCollection` is sufficient.
- **Dynamic renderer imports (React.lazy):** Adds async complexity. All 42 renderers are small; bundling them together does not meaningfully affect initial load since the card pages are behind auth and already not in the initial bundle.
- **Server Components for card detail:** The card detail page is interactive (edit mode, delete confirmation) and uses mutation hooks. Client component is the correct choice.

---

## Consequences

1. `apps/web/src/components/cards/renderers/` contains 42+ files — acceptable for this feature scope.
2. `packages/api-client/src/content/types.ts` is the authoritative TypeScript representation of content-service card types; it must stay in sync with backend schema changes.
3. Batch rollback is a soft-delete (sets `deletedAt`). Cards can be restored individually via the Card Detail page if needed.
4. Phase 10 work items: rich editors for complex card types, AI-assisted content generation, copilot integration in wizard.

---

## References

- `docs/plans/2026-03-05-phase-06a-backend-api-client.md` — backend endpoint + api-client changes
- `docs/plans/2026-03-05-phase-06b-card-renderers.md` — all 42 renderer implementations
- `docs/plans/2026-03-05-phase-06c-card-components.md` — shared filter/collection/uploader components
- `docs/plans/2026-03-05-phase-06d-pages.md` — 4 app pages
- `services/content-service/src/domain/content-service/card-content.schemas.ts` — authoritative Zod schemas
- `services/content-service/prisma/schema.prisma` — Card model with metadata JSONB field
```

### Step 2: Verify format matches existing ADRs

```bash
ls docs/adr/
# Read one existing ADR to confirm format matches
```

If format differs, adjust headings / status line to match. Do not change content.

### Step 3: Commit

```bash
git add docs/adr/ADR-007-phase06-card-system-frontend.md
git commit -m "docs: add ADR-007 for Phase 06 card system frontend architecture"
```

---

## Summary

After this phase, Phase 06 is fully documented and wired:

- `/cards` appears in the Learning navigation group
- `ADR-007` records all 7 architectural decisions made during Phase 06
- All 5 plan files are complete: 06a (backend/api-client), 06b (renderers), 06c (components), 06d (pages), 06e (nav/ADR)

The full Phase 06 implementation is ready for execution via subagent-driven development, executing plans in order: `06a → 06b → 06c → 06d → 06e`.
