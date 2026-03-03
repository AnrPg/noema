# Phase 0 — Design Tokens & Neuroscience Palette

> **Codename:** `Synapse` **Depends on:** Nothing (foundation layer)
> **Unlocks:** Every subsequent phase **Estimated effort:** 2–3 days

---

## Philosophy

Noema's visual identity is **Minimalist Scholar meets Neuroscience-Futuristic**:
clean, Notion-like content surfaces — spacious, typographically confident,
distraction-free — but when data appears (graphs, metrics, scores, state
indicators), the interface shifts to an organic, bioluminescent,
neural-network-inspired aesthetic. Think: a crisp white-paper reading experience
punctuated by living brain scans.

**Dark mode is the primary mode.** Neuroscience aesthetics shine (literally) on
dark backgrounds. Light mode is secondary but fully supported via CSS custom
property toggling.

---

## Tasks

### T0.1 — Neuroscience Color Palette

Extend the existing CSS custom properties in
`packages/ui/src/styles/globals.css` to define semantic color tokens grounded in
the neural metaphor. The current file uses shadcn/ui's generic HSL variables
(`--primary`, `--secondary`, etc.). Keep backwards compatibility with those —
but **add** a domain-specific palette layer on top.

**Semantic color families (dark mode first, derive light counterparts):**

| Token family | Metaphor        | Usage                                                                       |
| ------------ | --------------- | --------------------------------------------------------------------------- |
| `--synapse`  | Synaptic Blue   | Primary actions, active connections, interactive elements, the brand accent |
| `--dendrite` | Dendrite Violet | Knowledge graph nodes, deep learning states, abstract concepts              |
| `--myelin`   | Myelin Gold     | Mastery, confidence, review readiness, correct predictions, warmth          |
| `--neuron`   | Neural Green    | Correct answers, healthy states, resolved misconceptions, success           |
| `--cortex`   | Cortex Rose     | Errors, misconceptions, risk alerts, destructive actions, warnings          |
| `--axon`     | Axon Gray       | Neutral surfaces, text hierarchy, borders, dividers, muted states           |

Each family needs 6 shades (50, 100, 200, 400, 600, 900) defined as HSL channels
so they compose with Tailwind's opacity utilities (`bg-synapse-400/50`).

**Map the existing generic tokens** (`--primary`, `--destructive`, etc.) to the
new palette to keep all current components working without changes:

- `--primary` → `--synapse-400`
- `--destructive` → `--cortex-400`
- `--accent` → `--dendrite-200`
- `--ring` → `--synapse-600`

### T0.2 — Typography Scale

Define a typographic scale that supports the dual personality: scholarly content
and clinical data. The current font is `Inter`.

**Add a monospace / technical font** (e.g., `JetBrains Mono` or `IBM Plex Mono`)
for:

- Metric values and scores
- Card ID displays
- Debug/trace information
- Knowledge graph node IDs

**Define named typography tokens as Tailwind utilities:**

| Token                | Usage                                                     |
| -------------------- | --------------------------------------------------------- |
| `text-page-title`    | Page-level headings (`text-3xl font-bold tracking-tight`) |
| `text-section-title` | Section headings within a page                            |
| `text-card-title`    | Titles inside card containers                             |
| `text-metric-value`  | Large numeric displays (scores, counts) — uses mono font  |
| `text-metric-label`  | Labels below metric values                                |
| `text-body`          | Standard paragraph text                                   |
| `text-caption`       | Small metadata, timestamps, secondary info                |

### T0.3 — Spacing & Layout Tokens

Define consistent spacing primitives as Tailwind theme extensions:

| Token              | Value    | Usage                                   |
| ------------------ | -------- | --------------------------------------- |
| `--space-section`  | `1.5rem` | Between major page sections             |
| `--space-card-gap` | `1rem`   | Between card-grid items                 |
| `--space-inset`    | `1.5rem` | Inner padding for card/panel containers |
| `--space-tight`    | `0.5rem` | Compact inner spacing for metric tiles  |

### T0.4 — Animation Tokens

Define CSS custom properties and Tailwind keyframes for the bioluminescent /
neural-pulse aesthetic. These are the building blocks that later components will
reference.

| Animation name  | Description                                                             | Duration                 | Usage                                                  |
| --------------- | ----------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------ |
| `pulse-glow`    | Soft breathing glow that expands/contracts opacity on a radial gradient | ~2s ease-in-out infinite | Active session indicator, live node pulse, sync status |
| `fade-slide-in` | Combined fade + slight upward translate for panel/card entrance         | ~300ms ease-out          | Page transitions, panel reveals, card flips            |
| `ring-fill`     | Clockwise arc fill from 0° to target angle                              | ~800ms ease-out          | Mastery rings, progress rings, health gauges           |
| `particle-flow` | Translate small dots along a path (SVG or CSS offset-path)              | ~3s linear infinite      | Graph edge particles showing causal/prerequisite flow  |
| `shimmer`       | Gradient sweep for skeleton loading states                              | ~1.5s linear infinite    | Loading placeholders                                   |

### T0.5 — Dark/Light Mode Toggle Infrastructure

Add a theme provider mechanism that:

- Reads user preference from `<html class="dark">` (already supported by
  Tailwind `darkMode: ['class']`)
- Persists preference to `localStorage`
- Syncs with the user's `settings.theme` from the API (`useMySettings` hook
  exists)
- Defaults to `dark` for new users
- Exposes a `useTheme()` hook returning `{ theme, setTheme, toggleTheme }`

The existing `globals.css` already has `:root` and `.dark` blocks — extend both
with the new palette tokens.

### T0.6 — Tailwind Config Extension

Update `packages/ui/tailwind.config.cjs` to:

- Register all new color families (`synapse`, `dendrite`, `myelin`, `neuron`,
  `cortex`, `axon`) referencing the CSS custom properties
- Register all new keyframes and animation utilities
- Register the typography plugin extensions
- Ensure the config remains a CJS preset consumed by both `apps/web` and
  `apps/web-admin`

---

## Acceptance Criteria

- [ ] Both `apps/web` and `apps/web-admin` resolve all new
      color/animation/typography tokens without build errors
- [ ] `dark` class on `<html>` activates the dark palette; removing it activates
      the light palette
- [ ] All existing components (Button, Card, Alert, Input, etc.) render
      identically — no visual regressions
- [ ] A simple test page demonstrating all 6 color families × 6 shades, all
      animations playing, both themes toggling, is viewable at `/dev/tokens`
      (dev-only route, excluded from production)
- [ ] `pnpm build` succeeds across `@noema/ui`, `@noema/web`, and
      `@noema/web-admin`

---

## Files Touched

| File                                                   | Action                                        |
| ------------------------------------------------------ | --------------------------------------------- |
| `packages/ui/src/styles/globals.css`                   | Extend with neuroscience palette + animations |
| `packages/ui/tailwind.config.cjs`                      | Extend colors, keyframes, typography          |
| `packages/ui/src/lib/theme.ts`                         | **New** — `useTheme` hook + ThemeProvider     |
| `packages/ui/src/index.ts`                             | Export theme utilities                        |
| `apps/web/src/app/layout.tsx`                          | Wire ThemeProvider, default to dark           |
| `apps/web/src/app/(authenticated)/dev/tokens/page.tsx` | **New** — token gallery (dev only)            |
