# ADR-007: Phase 06 Card System Frontend Architecture

| Field       | Value                                  |
| ----------- | -------------------------------------- |
| **Status**  | Accepted                               |
| **Date**    | 2026-03-05                             |
| **Phase**   | Phase 06 — Cortex (Card System)        |
| **Authors** | Claude (AI), approved by project owner |
| **Tags**    | frontend, cards, api-client, renderers |

---

## Context

Phase 06 introduces the full card management UI to the web app. The
content-service backend exposes 42 distinct card types across standard and
remediation categories. This ADR records the architectural decisions made to
surface this system in the Next.js frontend.

---

## Decisions

### D1: One renderer per card type, with a factory

**Decision:** Each of the 42 card types gets its own React component in
`apps/web/src/components/card-renderers/`. A `CardRenderer` factory dispatches
to the correct renderer based on `card.cardType`. All 42 types are wired at
factory initialization; unimplemented types render a `FallbackRenderer` showing
type name and raw content.

**Rationale:** A single switch/dispatch avoids scattered `if` chains across the
codebase. Fallback renderer enables incremental implementation — pages work
immediately even before all 42 renderers are polished. Isolating renderers
allows independent testing and styling.

**Alternatives considered:**

- Dynamic import per type: adds complexity without benefit since the factory is
  a thin switch.
- Server components for renderers: card content is user-specific, not cacheable
  at CDN level. Client rendering is simpler.

**Consequences:** 42 files in the renderers directory. Each must export a
default-named component matching `ICardRendererProps`.

---

### D2: Complete rewrite of api-client content types.ts

**Decision:** `packages/api-client/src/content/types.ts` was replaced wholesale.
The new file:

- Defines 42 content interfaces (one per card type) derived from the backend Zod
  schemas
- Uses a `CardContentByType` mapped type for discriminated union narrowing
- Corrects `IBatchCreateResult.created` from `number` to `ICardDto[]`
- Adds `ICardSummaryDto` (list-safe shape without full content blob) and
  `IBatchSummaryDto`

**Rationale:** The old types were incompatible with the backend. Any incremental
patch would leave the types in a contradictory state. A complete rewrite from
the backend schemas guarantees correctness.

**Consequences:** Any code using the old type names gets TypeScript compile
errors, surfacing implicit bugs.

---

### D3: batchId stored in cards.metadata.\_batchId — no dedicated batch table

**Decision:** Batch identity is stored as `metadata._batchId` (JSONB) on
individual card rows. No dedicated `batches` table. The
`GET /v1/cards/batch/recent` endpoint uses raw SQL
`GROUP BY metadata->>'_batchId' ORDER BY MAX(created_at) DESC`.

**Rationale:** Avoids schema migration for a lightweight feature. The number of
distinct batches per user is small; GROUP BY performance on a JSONB field with a
GIN index is adequate.

**Consequences:** Batch queries cannot use standard Prisma query builder (raw
SQL required).

**Follow-up:** If batch history grows large (>10k batches/user), add a partial
index on `metadata->>'_batchId'` with `NOT NULL` filter.

---

### D4: GET /v1/cards/batch/recent registered before GET /v1/cards/batch/:batchId

**Decision:** The literal route `/batch/recent` is registered **before** the
parameterized route `/batch/:batchId` in `content.routes.ts`.

**Rationale:** Fastify matches routes in registration order. If `:batchId` is
registered first, the string `"recent"` is captured as a batchId parameter
rather than routing to the literal handler.

**Consequences:** Any future literal sub-routes under `/batch/` must also be
registered before `:batchId`.

---

### D5: Presigned upload — direct PUT bypasses API client auth interceptor

**Decision:** The `MediaUploader` component performs the presigned PUT directly
via `XMLHttpRequest`, not through the `@noema/api-client` HTTP wrapper.

**Rationale:** Presigned URLs (S3/R2) are self-authorizing. Adding an
`Authorization` header to a presigned PUT causes the signature verification to
fail because the signer included only specific headers in the signed scope.

**Consequences:** The upload step has its own error handling. This is
intentional — upload failures prompt the user, not silent retry.

---

### D6: Wizard uses raw JSON textarea for unimplemented complex types

**Decision:** The Card Creator wizard presents a raw JSON textarea for card
types whose content structures are too complex for a simple form. Phase 10 will
replace these with rich structured editors.

**Rationale:** Unblocks end-to-end testing of the card system without requiring
bespoke editors for all 42 types before Phase 06 ships.

**Consequences:** Poor UX for complex card types in Phase 06. Tracked as Phase
10 work item.

---

### D7: DeckQueryFilter is a controlled component — no internal query state

**Decision:** `DeckQueryFilter` holds no internal query state. All state is
owned by the parent page. The component receives `query: IDeckQueryInput` and
calls `onChange(q)` on every interaction.

**Rationale:** Controlled components are simpler to test, easier to serialize to
URL params in the future, and avoid double-truth issues when the parent also
needs the query for API calls.

**Consequences:** The parent page must manage the query state.

---

### D8: CardShell uses dual slots — actions (pre-reveal) and children (post-reveal)

**Decision:** `CardShell` exposes two content slots: `actions` (rendered before
the reveal boundary, always visible in interactive mode) and `children`
(rendered after reveal, gated by `isRevealed`). The "Show Answer" button only
renders when `actions` is absent.

**Rationale:** Interactive answer cards (true/false, MCQ, confidence scale) need
their buttons visible before the card is flipped. Display-only cards (atomic,
definition) need the answer hidden until reveal. One slot cannot satisfy both
contracts.

**Consequences:** Renderer authors must choose the correct slot. Interactive
controls go in `actions`; answer content goes in `children`.

---

## Alternatives Considered

- **Dedicated `batches` DB table:** Adds schema migration complexity for a
  feature fully served by JSONB queries at current scale.
- **Zustand store for card selection:** Selection state is ephemeral and
  page-local; global store is overkill. Local `useState` in `CardCollection` is
  sufficient.
- **Dynamic renderer imports (React.lazy):** All 42 renderers are small;
  bundling them together does not meaningfully affect initial load since card
  pages are behind auth.
- **Server Components for card detail:** The card detail page is interactive
  (edit mode, delete confirmation) and uses mutation hooks. Client component is
  the correct choice.
- **Single `children` slot in CardShell:** Insufficient — interactive cards need
  pre-reveal buttons visible; a single post-reveal slot would hide the answer
  controls until the user clicks "Show Answer".

---

## Consequences

1. `apps/web/src/components/card-renderers/` contains 42+ renderer files plus
   the `remediation/` subdirectory — acceptable for this feature scope.
2. `packages/api-client/src/content/types.ts` is the authoritative TypeScript
   representation of content-service card types; it must stay in sync with
   backend schema changes.
3. Batch rollback is a soft-delete (sets `deletedAt`). Cards can be restored
   individually via the Card Detail page if needed.
4. Phase 10 work items: rich editors for complex card types, AI-assisted content
   generation, copilot integration in wizard.

---

## References

- `docs/plans/2026-03-05-phase-06a-backend-api-client.md` — backend endpoint +
  api-client changes
- `docs/plans/2026-03-05-phase-06b-card-renderers.md` — all 42 renderer
  implementations
- `docs/plans/2026-03-05-phase-06c-card-components.md` — shared
  filter/collection/uploader components
- `docs/plans/2026-03-05-phase-06d-pages.md` — 4 app pages
- `docs/plans/2026-03-05-phase-06e-nav-adr.md` — navigation + this ADR
- `services/content-service/src/domain/content-service/card-content.schemas.ts`
  — authoritative Zod schemas
- `services/content-service/prisma/schema.prisma` — Card model with metadata
  JSONB field
