# ADR-0013: Enhanced Registration UX — Multi-step Wizard with Interactive Timezone Map

## Status

**Accepted** — 2025-07-25

## Context

The learner-facing registration page (`apps/web`) only captured four fields
(email, displayName, password, confirmPassword) despite the backend
`ICreateUserInput` supporting seven fields (username, email, password,
displayName, language, timezone, country). Several issues existed:

1. **Missing fields**: username was silently derived from email; language,
   timezone, and country were never sent.
2. **Validation gap**: the client-side zod schema did not enforce the special-
   character requirement present in the server's `PasswordSchema`, causing
   silent 400 errors at registration.
3. **`RegisterInput` type drift**: the `@noema/api-client` `RegisterInput` type
   was missing the `country` field that the server already accepted.
4. **UX requirement**: Product vision calls for an interactive timezone map with
   hover-based vertical longitude line and snap-to-city markers, plus a
   trie-powered country search dropdown.

## Decision

### Form Layout — Multi-step Wizard (3 steps)

**Chosen over**: single scrollable form, accordion sections.

| Step        | Fields                                     |
| ----------- | ------------------------------------------ |
| 1. Account  | email, username, password, confirmPassword |
| 2. Profile  | displayName, language                      |
| 3. Location | timezone (map + dropdown), country         |

**Rationale**: Progressive disclosure reduces cognitive load. The timezone map
needs dedicated screen width for the SVG to be interactive. Per-step validation
catches errors early.

### Timezone Selection — react-simple-maps + d3-geo

**Chosen over**: custom hand-drawn SVG, Leaflet / MapLibre.

- SVG-based (`react-simple-maps` ≈ 45 KB gzipped) renders a
  `geoEqualEarth`-projected world map.
- 31 `<Marker>` snap-point circles at COMMON_TIMEZONES city coordinates.
- A dynamic `<path>` vertical line follows cursor longitude and snaps to the
  nearest city when within 30 px.
- An `<InfoBar>` below the map shows city name, UTC offset, and live local time
  (`Intl.DateTimeFormat`).
- A sorted `<select>` dropdown (west → east, then alphabetical) sits below the
  map for keyboard / screen-reader users and as a fallback.

**Trade-offs acknowledged**: the map loads a 110 m TopoJSON file from a CDN (~70
KB, cached). If offline support is needed later, the asset can be bundled or
replaced with a simplified inline SVG.

### Country Selector — Custom Trie + Combobox

**Chosen over**: cmdk (⌘K), react-select.

- A generic `Trie<T>` data structure (`apps/web/src/lib/trie.ts`) provides O(k)
  prefix search where k = query length.
- A 195-item ISO 3166-1 alpha-2 dataset (`apps/web/src/lib/countries.ts`) is
  indexed by country name, code, and common aliases (e.g. "USA", "UK",
  "Holland").
- Flag emojis are derived from Unicode Regional Indicator Symbol pairs — zero
  external image assets.
- The combobox UI follows WAI-ARIA listbox patterns: arrow-key navigation, Enter
  to select, Escape to close.
- No new UI-library dependency; uses plain Tailwind + Lucide icons.

### Password Validation Alignment

- Client-side zod schema now mirrors the server's `PasswordSchema` exactly: min
  8, max 128, lowercase, uppercase, number, **and special character**.
- A `<PasswordStrength>` component renders a 5-segment color bar and a
  checklist, using the same scoring algorithm as the server's
  `Password.getStrength()` method.

## Consequences

### Positive

- All `ICreateUserInput` fields are now exposed in the UI.
- Client and server password validations are aligned — no more silent 400s.
- `RegisterInput.country` type gap is closed.
- Timezone selection is visually engaging and accessible (map + dropdown).
- Country search is efficient (trie) and inclusive (aliases).
- `Trie<T>` and country/timezone data modules are reusable across apps.

### Negative

- Two new runtime dependencies in `@noema/web`: `react-simple-maps`, `d3-geo` (+
  types). These add ≈80 KB gzipped to the register page bundle (address later
  via `next/dynamic` lazy loading if needed).
- The TopoJSON map asset is fetched from `cdn.jsdelivr.net` at render time; a
  network failure degrades the timezone step (the dropdown still works).

### Neutral

- The 195-country array is ~6 KB — negligible.
- The trie is built once per mount (lazy `useMemo`); memory is ~20 KB.

## New / Modified Files

| File                                            | Type                                                   |
| ----------------------------------------------- | ------------------------------------------------------ |
| `packages/api-client/src/user/types.ts`         | Modified — added `country?: string` to `RegisterInput` |
| `apps/web/src/app/(public)/register/page.tsx`   | Rewritten — 3-step wizard                              |
| `apps/web/src/components/timezone-map.tsx`      | New — interactive SVG timezone map                     |
| `apps/web/src/components/country-selector.tsx`  | New — trie-powered country combobox                    |
| `apps/web/src/components/password-strength.tsx` | New — password strength indicator                      |
| `apps/web/src/lib/trie.ts`                      | New — generic Trie data structure                      |
| `apps/web/src/lib/countries.ts`                 | New — ISO 3166-1 country data                          |
| `apps/web/src/lib/timezone-data.ts`             | New — COMMON_TIMEZONES with coordinates                |
