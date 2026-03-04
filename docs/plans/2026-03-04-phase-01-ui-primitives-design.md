# Phase 01 — UI Primitives (Cortex) Design

**Date:** 2026-03-04 **Status:** Approved **Implements:**
`docs/frontend/phases/PHASE-01-UI-PRIMITIVES.md` **Depends on:** Phase 00
(Synapse) ✅

---

## What We're Building

7 data-display and feedback components for `packages/ui`. These are the building
blocks for Dashboard (Phase 05), Card System (Phase 06), Knowledge Graph (Phase
08), and Schedule Intelligence (Phase 09).

Components:

- `NeuralGauge` — SVG circular arc gauge (0–1)
- `MetricTile` — stat card with optional sparkline, extends `Card`
- `StateChip` — FSM state pill with 5 default state maps
- `ConfidenceMeter` — segmented confidence bar, display + interactive
- `ProgressRing` — concentric SVG rings for multi-dimensional progress
- `Skeleton` / `EmptyState` — loading and zero-state placeholders
- `PulseIndicator` — breathing status dot

All live under `packages/ui/src/data-display/` and `packages/ui/src/feedback/`.

---

## Design Decisions

### D1: SVG Arc Technique (NeuralGauge + ProgressRing)

**Decision:** `stroke-dasharray` / `stroke-dashoffset` on `<circle>` elements.

**Rationale:** The Phase 00 `ring-fill` keyframe already animates via
`stroke-dashoffset`, so this is the natural pairing. The arc math is:
`circumference = 2π × r`; filled arc = `circumference × value`. NeuralGauge uses
a 270° sweep (visually a gauge shape, not a full circle). ProgressRing uses full
360° arcs, staggered with a gap between rings.

**Rejected:** Path-based `d` attribute arcs — more flexible for complex shapes
but unnecessary here and harder to animate with the existing token.

---

### D2: Shared `ColorFamily` Type

**Decision:** Define `ColorFamily` in `packages/ui/src/lib/types.ts`:

```ts
export type ColorFamily =
  | 'synapse'
  | 'dendrite'
  | 'myelin'
  | 'neuron'
  | 'cortex'
  | 'axon';
```

Export from the main barrel. Four components reference this type — define once,
import everywhere.

---

### D3: ConfidenceMeter Interactive Mode

**Decision:** Native `<input type="range">` as the invisible backing control,
overlaid behind the visual segmented bar.

**Rationale:** Keyboard accessibility and screen reader support come for free.
The visual presentation (segmented colored bar) is fully custom but the
interaction logic is delegated to the browser's built-in range input. No manual
keyboard handler needed.

---

### D4: MetricTile Sparkline

**Decision:** Hand-rolled SVG `<polyline>` at 48×16px.

**Rationale:** Simple min/max normalization + coordinate mapping. D3 is already
a dependency in `apps/web` (for maps), but pulling it into `packages/ui` for a
48px sparkline is disproportionate. The SVG path is ~10 lines of math.

---

### D5: Testing Scope

**Decision:** Unit tests for logic-bearing components only.

**Tested:**

- `ConfidenceMeter` — segment calculation, controlled/uncontrolled mode, value
  clamping
- `StateChip` — all 5 default state maps, fallback for unknown state
- `PulseIndicator` — status → color class mapping

**Not unit-tested:** `NeuralGauge`, `ProgressRing`, `MetricTile`, `Skeleton`,
`EmptyState` — pure display components where unit tests would assert
implementation details rather than behavior. These are validated by the token
gallery (Phase 00) and visually by the app.

---

## File Map

```
packages/ui/src/
  lib/
    types.ts                        ← NEW: ColorFamily + other shared types
  data-display/
    neural-gauge.tsx                ← NEW
    metric-tile.tsx                 ← NEW
    state-chip.tsx                  ← NEW
    confidence-meter.tsx            ← NEW
    confidence-meter.test.ts        ← NEW
    progress-ring.tsx               ← NEW
    pulse-indicator.tsx             ← NEW
    pulse-indicator.test.ts         ← NEW
    state-chip.test.ts              ← NEW
    index.ts                        ← NEW
  feedback/
    skeleton.tsx                    ← NEW
    empty-state.tsx                 ← NEW
    index.ts                        ← NEW
  index.ts                          ← MODIFY: add data-display + feedback + types exports
packages/ui/package.json            ← MODIFY: add ./data-display + ./feedback sub-paths
```

---

## Token Consumption

All components consume Phase 00 tokens exclusively:

| Token                                                    | Used by                                           |
| -------------------------------------------------------- | ------------------------------------------------- |
| `--synapse-*` / `--dendrite-*` / etc.                    | NeuralGauge, ProgressRing, StateChip, MetricTile  |
| `animate-pulse-glow`                                     | NeuralGauge (high value), PulseIndicator (active) |
| `animate-ring-fill`                                      | NeuralGauge, ProgressRing mount animation         |
| `animate-fade-slide-in`                                  | EmptyState mount                                  |
| `.shimmer`                                               | All Skeleton variants                             |
| `text-metric-value`, `text-caption`, `text-metric-label` | MetricTile                                        |
| `--space-*`                                              | MetricTile, EmptyState padding                    |

---

## Architectural Constraints

- All SVG components are server-renderable (no canvas, no `useEffect`-only logic
  for initial render). Animation uses CSS classes from Phase 00, not JS.
- `packages/ui` remains decoupled from `@noema/api-client` and backend types.
  State maps in `StateChip` are plain `Record` objects — no service coupling.
- `ConfidenceMeter` is a controlled component when `onChange` is provided;
  uncontrolled (display-only) otherwise. No internal state in controlled mode.

---

## Implementation Notes (Emergent — discovered during Task 1)

### N1: animate-pulse-glow on SVG elements — transform-origin limitation

The `pulse-glow` keyframe includes `transform: scale(1.05)`. On SVG elements,
`transform-origin` defaults to the SVG viewport origin `(0, 0)`, not the element
center. This causes scale animations to visually shift toward the top-left
rather than pulsing in place. The fix — adding
`transform-box: fill-box; transform-origin: center;` to the
`.animate-pulse-glow` class — belongs in the Phase 00 token stylesheet, not in
individual components. Tracked as a Phase 00 follow-up.

### N2: animate-ring-fill produces a slide-reveal, not a fill-from-zero

D1 chose `stroke-dasharray` (not `stroke-dashoffset`) to control arc length. The
`ring-fill` token animates `stroke-dashoffset`, so when combined with a fixed
`stroke-dasharray`, the result is a 100px slide-reveal, not a progressive fill
from 0. A true fill animation requires animating `stroke-dashoffset` from
`circumference` to `circumference - filledArc` using per-instance CSS custom
properties (`--ring-fill-target`). This is an accepted limitation of D1's design
— the visual result is a slide-in rather than a fill-in. Revisit in a future
phase if needed.
