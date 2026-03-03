# Phase 1 — UI Primitives: Data Visualization Components

> **Codename:** `Cortex` **Depends on:** Phase 0 (Design Tokens) **Unlocks:**
> Phase 5 (Dashboard), Phase 8 (Knowledge Graph), Phase 9 (Schedule
> Intelligence) **Estimated effort:** 4–5 days

---

## Philosophy

Noema's data surfaces are not charts — they are **neural readouts**. Every
gauge, ring, and indicator should feel like it's reporting live telemetry from a
brain scan. Components in this phase are headless-first (logic separated from
presentation), composable, and animated using the tokens defined in Phase 0.

All new components live in `packages/ui/src/` alongside existing primitives.
They must be exported from the package barrel and usable by both `@noema/web`
and `@noema/web-admin`.

---

## Tasks

### T1.1 — `NeuralGauge`

A circular arc gauge for displaying 0–1 scores. Think: a brain vital sign
monitor.

**Props interface:**

- `value: number` (0–1)
- `label?: string` — caption beneath
- `size?: 'sm' | 'md' | 'lg'`
- `colorFamily?: 'synapse' | 'dendrite' | 'myelin' | 'neuron' | 'cortex'` —
  determines the arc's glow color
- `showValue?: boolean` — render the numeric value centered inside
- `animate?: boolean` — use `ring-fill` animation on mount

**Visual spec:**

- SVG-based arc (not canvas) for SSR compatibility
- Background arc in `axon-200`, filled arc in the chosen color family
- At high values (>0.8), add a subtle `pulse-glow` on the filled end
- The center displays the percentage or a custom label
- The outer ring has a faint bioluminescent glow (box-shadow with color-family
  at low opacity)

**Location:** `packages/ui/src/data-display/neural-gauge.tsx`

### T1.2 — `MetricTile`

A compact stat card for at-a-glance numbers. Used extensively on the Dashboard.

**Props interface:**

- `label: string`
- `value: string | number`
- `trend?: { direction: 'up' | 'down' | 'flat'; delta?: string }` —
  micro-indicator
- `icon?: React.ReactNode`
- `colorFamily?: ColorFamily`
- `sparklineData?: number[]` — optional array of recent values to render as a
  micro-sparkline beneath the value

**Visual spec:**

- Extends existing `Card` primitive with a compact layout
- The value renders in `text-metric-value` (mono font, large)
- The trend arrow is a tiny colored chevron (neuron for up, cortex for down,
  axon for flat)
- The optional sparkline is a 48×16px SVG polyline, no axes, just the shape —
  using the color family

**Location:** `packages/ui/src/data-display/metric-tile.tsx`

### T1.3 — `StateChip`

A pill-shaped badge for FSM states across the entire platform (sessions, cards,
mutations, misconceptions).

**Props interface:**

- `state: string` — the raw state value
- `stateMap: Record<string, { label: string; color: ColorFamily; icon?: React.ReactNode }>`
  — maps backend enum values to display configuration
- `size?: 'sm' | 'md'`
- `pulse?: boolean` — if `true`, adds `pulse-glow` for active/live states

**Visual spec:**

- Rounded-full pill with subtle background tint from the mapped color family
- Prefix icon (optional) + text label
- `pulse` variant adds a breathing glow ring around the pill

**Usage patterns (define default state maps):**

- `SESSION_STATE_MAP` — maps `ACTIVE`, `PAUSED`, `COMPLETED`, `ABANDONED`,
  `EXPIRED`
- `CARD_STATE_MAP` — maps `DRAFT`, `ACTIVE`, `SUSPENDED`, `ARCHIVED`
- `CARD_LEARNING_STATE_MAP` — maps `NEW`, `LEARNING`, `REVIEW`, `RELEARNING`
- `MUTATION_STATE_MAP` — maps the CKG typestate pipeline
- `MISCONCEPTION_STATUS_MAP` — maps `DETECTED` → `RESOLVED`

**Location:** `packages/ui/src/data-display/state-chip.tsx`

### T1.4 — `ConfidenceMeter`

A horizontal segmented bar for confidence levels (0–1 scale).

**Props interface:**

- `value: number` (0–1)
- `onChange?: (value: number) => void` — if provided, becomes an interactive
  slider
- `segments?: number` (default 5)
- `showLabel?: boolean`

**Visual spec:**

- A horizontal bar divided into `segments` equal sections
- Filled segments use a gradient from cortex (low confidence) → myelin (high
  confidence)
- In interactive mode, clicking a segment sets the value; a thumb indicator
  follows
- The label shows qualitative text: "Guessing" / "Uncertain" / "Somewhat sure" /
  "Confident" / "Certain"

**Location:** `packages/ui/src/data-display/confidence-meter.tsx`

### T1.5 — `ProgressRing`

Concentric ring progress indicator for multi-dimensional progress.

**Props interface:**

- `rings: Array<{ value: number; max: number; color: ColorFamily; label: string }>`
- `size?: 'sm' | 'md' | 'lg'`
- `centerContent?: React.ReactNode`

**Visual spec:**

- SVG concentric arcs, each ring representing a different dimension
- Rings animate in with `ring-fill` on mount, staggered by 100ms per ring
- The center can show custom content (e.g., overall percentage, icon)
- Each ring has a faint background track at 10% opacity of its color

**Location:** `packages/ui/src/data-display/progress-ring.tsx`

### T1.6 — `Skeleton` & `EmptyState`

Loading and zero-state components — consistent across every data surface.

**`Skeleton`:**

- `variant: 'text' | 'circle' | 'rect' | 'metric-tile' | 'card' | 'graph-node'`
- `width? / height?` overrides
- Uses `shimmer` animation from Phase 0 tokens

**`EmptyState`:**

- `icon?: React.ReactNode`
- `title: string`
- `description?: string`
- `action?: { label: string; onClick: () => void }` — primary CTA button

**Visual spec:**

- Skeletons match their target component's exact dimensions and shape
- EmptyState is centered in its container with a large muted icon, title,
  description, and an optional action button
- EmptyState uses `fade-slide-in` animation on mount

**Location:** `packages/ui/src/feedback/skeleton.tsx`,
`packages/ui/src/feedback/empty-state.tsx`

### T1.7 — `PulseIndicator`

A tiny breathing-light dot for signaling live/active state.

**Props interface:**

- `status: 'active' | 'idle' | 'error' | 'offline'`
- `size?: 'xs' | 'sm'`
- `label?: string` — optional text next to the dot

**Visual spec:**

- A circle (6–10px) with color mapped: active=neuron, idle=axon-400,
  error=cortex, offline=axon-200
- `active` status uses `pulse-glow` animation
- Optional label is `text-caption` size, muted

**Location:** `packages/ui/src/data-display/pulse-indicator.tsx`

---

## Barrel Exports

Add a new barrel file at `packages/ui/src/data-display/index.ts` exporting all
data-display components, and a `packages/ui/src/feedback/index.ts` for feedback
components. Wire both into the main `packages/ui/src/index.ts`.

Also add a new export path in `packages/ui/package.json`:

```
"./data-display": { "types": "...", "import": "..." }
"./feedback": { "types": "...", "import": "..." }
```

---

## Acceptance Criteria

- [ ] All 7 components render correctly in both dark and light mode
- [ ] All animations play smoothly (60fps) — no janky transitions
- [ ] `NeuralGauge` and `ProgressRing` are pure SVG (no `<canvas>`) for SSR
- [ ] `ConfidenceMeter` works in both display and interactive mode
- [ ] `StateChip` renders correctly for all 5 default state maps
- [ ] `Skeleton` variants match their target component dimensions precisely
- [ ] `pnpm build` succeeds for `@noema/ui`, `@noema/web`, `@noema/web-admin`
- [ ] All components are exported from the package barrel and consumable by apps

---

## Files Created

| File                                                | Description                   |
| --------------------------------------------------- | ----------------------------- |
| `packages/ui/src/data-display/neural-gauge.tsx`     | Arc gauge component           |
| `packages/ui/src/data-display/metric-tile.tsx`      | Stat card with sparkline      |
| `packages/ui/src/data-display/state-chip.tsx`       | FSM state pill + default maps |
| `packages/ui/src/data-display/confidence-meter.tsx` | Segmented confidence bar      |
| `packages/ui/src/data-display/progress-ring.tsx`    | Concentric ring progress      |
| `packages/ui/src/data-display/pulse-indicator.tsx`  | Breathing status dot          |
| `packages/ui/src/data-display/index.ts`             | Barrel export                 |
| `packages/ui/src/feedback/skeleton.tsx`             | Loading skeletons             |
| `packages/ui/src/feedback/empty-state.tsx`          | Zero-state placeholder        |
| `packages/ui/src/feedback/index.ts`                 | Barrel export                 |
