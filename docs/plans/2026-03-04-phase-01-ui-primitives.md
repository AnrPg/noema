# Phase 01 — UI Primitives (Cortex) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Build 7 data-display and feedback components in `packages/ui` that
serve as the neural readout layer for Dashboard, Knowledge Graph, and Schedule
Intelligence phases.

**Architecture:** All components live under `packages/ui/src/data-display/` or
`packages/ui/src/feedback/`, export from typed barrels, and consume only Phase
00 CSS tokens. SVG components are server-renderable (no canvas, no JS-only
initial render). Animations use CSS classes from Phase 00.

**Tech Stack:** React 18, TypeScript strict, Tailwind CSS (Phase 00 tokens),
Vitest + @testing-library/react, `class-variance-authority` + `cn()` already in
`packages/ui`.

---

## Context

- **Repo:** `/home/rodochrousbisbiki/MyApps/noema`
- **Package under edit:** `packages/ui/`
- **Run tests:** `pnpm --filter @noema/ui test` (or
  `cd packages/ui && pnpm test`)
- **Run lint:** `pnpm --filter @noema/ui lint`
- **Run build:** `pnpm --filter @noema/ui build`
- **Spec doc:** `docs/frontend/phases/PHASE-01-UI-PRIMITIVES.md`
- **Design decisions:** `docs/plans/2026-03-04-phase-01-ui-primitives-design.md`

### ESLint rules to be aware of (strict)

- `strict-boolean-expressions`: No string/number in boolean contexts — use
  explicit comparisons (`!== undefined`, `!== ''`)
- `restrict-template-expressions`: No raw numbers/booleans in template literals
  — use `String(n)`
- `no-non-null-assertion`: No `!` operator
- `consistent-type-imports`: Always `import type { ... }` for type-only imports
- All import paths inside `packages/ui/src/` must end in `.js` (ESM convention)

### Test file pattern

Tests live alongside source: `src/data-display/foo.test.ts`. They use `.ts`
extension (not `.tsx`). Render components via
`React.createElement(Component, props)` — no JSX needed in test files. The
`allowDefaultProject` in `eslint.config.mjs` currently only covers
`packages/ui/src/lib/*.test.ts`. **Task 0 extends it to cover `data-display/`
tests.**

---

## Task 0 — Foundation: types.ts + ESLint config

**Files:**

- Create: `packages/ui/src/lib/types.ts`
- Modify: `eslint.config.mjs` (root)

### Step 1: Create the shared types file

```typescript
// packages/ui/src/lib/types.ts
export type ColorFamily =
  | 'synapse'
  | 'dendrite'
  | 'myelin'
  | 'neuron'
  | 'cortex'
  | 'axon';
```

### Step 2: Extend ESLint allowDefaultProject

In `eslint.config.mjs`, find `allowDefaultProject` array and add two entries:

```javascript
// BEFORE (existing entries):
allowDefaultProject: [
  '*.config.cjs',
  '*.config.mjs',
  'packages/*/tailwind.config.cjs',
  'packages/ui/src/lib/*.test.ts',
  'packages/ui/src/lib/*.test.tsx',
],

// AFTER (add the two new data-display entries):
allowDefaultProject: [
  '*.config.cjs',
  '*.config.mjs',
  'packages/*/tailwind.config.cjs',
  'packages/ui/src/lib/*.test.ts',
  'packages/ui/src/lib/*.test.tsx',
  'packages/ui/src/data-display/*.test.ts',
  'packages/ui/src/data-display/*.test.tsx',
],
```

### Step 3: Verify lint passes

Run: `pnpm --filter @noema/ui lint` Expected: no errors

### Step 4: Commit

```bash
git add packages/ui/src/lib/types.ts eslint.config.mjs
git commit -m "feat(ui): add shared ColorFamily type and extend eslint test coverage"
```

---

## Task 1 — NeuralGauge

**Files:**

- Create: `packages/ui/src/data-display/neural-gauge.tsx`

**No unit tests** (pure display — validated visually and by type-checker).

### Step 1: Create the component

```tsx
// packages/ui/src/data-display/neural-gauge.tsx
import type { JSX } from 'react';
import { cn } from '../lib/utils.js';
import type { ColorFamily } from '../lib/types.js';

const SIZE_MAP = {
  sm: { svgSize: 80, r: 30, strokeWidth: 6, cx: 40, cy: 40 },
  md: { svgSize: 112, r: 42, strokeWidth: 8, cx: 56, cy: 56 },
  lg: { svgSize: 160, r: 60, strokeWidth: 10, cx: 80, cy: 80 },
} as const;

// Static class lookup — dynamic Tailwind class strings are JIT-unsafe
const STROKE_COLOR: Record<ColorFamily, string> = {
  synapse: 'stroke-synapse-400',
  dendrite: 'stroke-dendrite-400',
  myelin: 'stroke-myelin-400',
  neuron: 'stroke-neuron-400',
  cortex: 'stroke-cortex-400',
  axon: 'stroke-axon-400',
};

interface NeuralGaugeProps {
  value: number; // 0–1
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  colorFamily?: ColorFamily;
  showValue?: boolean;
  animate?: boolean;
  className?: string;
}

export function NeuralGauge({
  value,
  label,
  size = 'md',
  colorFamily = 'synapse',
  showValue = true,
  animate = true,
  className,
}: NeuralGaugeProps): JSX.Element {
  const clamped = Math.min(1, Math.max(0, value));
  const { svgSize, r, strokeWidth, cx, cy } = SIZE_MAP[size];
  const circumference = 2 * Math.PI * r;
  const gaugeArc = circumference * 0.75; // 270° sweep
  const filledArc = gaugeArc * clamped;
  const isHighValue = clamped > 0.8;

  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      <svg
        width={svgSize}
        height={svgSize}
        viewBox={`0 0 ${String(svgSize)} ${String(svgSize)}`}
        aria-label={`${label ?? 'Gauge'}: ${String(Math.round(clamped * 100))}%`}
        role="img"
      >
        {/* Background track — 270° arc in axon-200 */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-axon-200"
          strokeDasharray={`${String(gaugeArc)} ${String(circumference - gaugeArc)}`}
          strokeLinecap="round"
          transform={`rotate(135, ${String(cx)}, ${String(cy)})`}
        />
        {/* Filled arc — value portion */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          className={cn(
            STROKE_COLOR[colorFamily],
            animate && 'animate-ring-fill',
            isHighValue && 'animate-pulse-glow'
          )}
          strokeDasharray={`${String(filledArc)} ${String(circumference - filledArc)}`}
          strokeLinecap="round"
          transform={`rotate(135, ${String(cx)}, ${String(cy)})`}
        />
        {showValue && (
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            className="font-mono font-semibold text-sm"
            style={{ fill: `hsl(var(--${colorFamily}-400))` }}
          >
            {String(Math.round(clamped * 100))}%
          </text>
        )}
      </svg>
      {label !== undefined && (
        <span className="text-caption text-axon-400">{label}</span>
      )}
    </div>
  );
}
```

**SVG arc math:** `stroke-dasharray` splits the circle stroke into a colored
portion (filled arc length) and a transparent remainder. `rotate(135, cx, cy)`
positions the gap at the bottom, giving the classic gauge shape. The 270° gauge
arc = `circumference × 0.75`.

### Step 2: Lint check

Run: `pnpm --filter @noema/ui lint` Expected: no new errors

### Step 3: Commit

```bash
git add packages/ui/src/data-display/neural-gauge.tsx
git commit -m "feat(ui): add NeuralGauge SVG arc component (Phase 01)"
```

---

## Task 2 — MetricTile

**Files:**

- Create: `packages/ui/src/data-display/metric-tile.tsx`

**No unit tests** (pure display).

### Step 1: Create the component

```tsx
// packages/ui/src/data-display/metric-tile.tsx
import type { JSX } from 'react';
import { cn } from '../lib/utils.js';
import { Card, CardContent } from '../primitives/card.js';
import type { ColorFamily } from '../lib/types.js';

// Static color lookups — never construct Tailwind class strings dynamically
const TEXT_COLOR: Record<ColorFamily, string> = {
  synapse: 'text-synapse-400',
  dendrite: 'text-dendrite-400',
  myelin: 'text-myelin-400',
  neuron: 'text-neuron-400',
  cortex: 'text-cortex-400',
  axon: 'text-axon-400',
};

const STROKE_COLOR: Record<ColorFamily, string> = {
  synapse: 'stroke-synapse-400',
  dendrite: 'stroke-dendrite-400',
  myelin: 'stroke-myelin-400',
  neuron: 'stroke-neuron-400',
  cortex: 'stroke-cortex-400',
  axon: 'stroke-axon-400',
};

interface Trend {
  direction: 'up' | 'down' | 'flat';
  delta?: string;
}

interface MetricTileProps {
  label: string;
  value: string | number;
  trend?: Trend;
  icon?: React.ReactNode;
  colorFamily?: ColorFamily;
  sparklineData?: number[];
  className?: string;
}

function Sparkline({
  data,
  colorFamily,
}: {
  data: number[];
  colorFamily: ColorFamily;
}): JSX.Element | null {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;
  const W = 48;
  const H = 16;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = range === 0 ? H / 2 : H - ((v - min) / range) * H;
      return `${String(x)},${String(y)}`;
    })
    .join(' ');

  return (
    <svg width={W} height={H} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={STROKE_COLOR[colorFamily]}
      />
    </svg>
  );
}

const TREND_ICON: Record<Trend['direction'], string> = {
  up: '↑',
  down: '↓',
  flat: '→',
};

const TREND_COLOR: Record<Trend['direction'], string> = {
  up: 'text-neuron-400',
  down: 'text-cortex-400',
  flat: 'text-axon-400',
};

export function MetricTile({
  label,
  value,
  trend,
  icon,
  colorFamily = 'synapse',
  sparklineData,
  className,
}: MetricTileProps): JSX.Element {
  return (
    <Card className={cn('min-w-[120px]', className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="text-metric-label text-axon-400">{label}</span>
          {icon !== undefined && <span className="text-axon-400">{icon}</span>}
        </div>
        <div className="mt-1 flex items-end gap-2">
          <span className={cn('text-metric-value', TEXT_COLOR[colorFamily])}>
            {String(value)}
          </span>
          {trend !== undefined && (
            <span
              className={cn(
                'text-caption mb-0.5',
                TREND_COLOR[trend.direction]
              )}
            >
              {TREND_ICON[trend.direction]}
              {trend.delta !== undefined && ` ${trend.delta}`}
            </span>
          )}
        </div>
        {sparklineData !== undefined && (
          <div className="mt-2">
            <Sparkline data={sparklineData} colorFamily={colorFamily} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

### Step 2: Lint and commit

Run: `pnpm --filter @noema/ui lint` Expected: no errors

```bash
git add packages/ui/src/data-display/metric-tile.tsx
git commit -m "feat(ui): add MetricTile stat card with sparkline (Phase 01)"
```

---

## Task 3 — StateChip + Tests

**Files:**

- Create: `packages/ui/src/data-display/state-chip.tsx`
- Create: `packages/ui/src/data-display/state-chip.test.ts`

### Step 1: Write the failing test

```typescript
// packages/ui/src/data-display/state-chip.test.ts
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, it, expect } from 'vitest';
import {
  StateChip,
  SESSION_STATE_MAP,
  CARD_STATE_MAP,
  CARD_LEARNING_STATE_MAP,
  MUTATION_STATE_MAP,
  MISCONCEPTION_STATUS_MAP,
} from './state-chip.js';

describe('StateChip', () => {
  it('renders label from SESSION_STATE_MAP for ACTIVE', () => {
    render(
      React.createElement(StateChip, {
        state: 'ACTIVE',
        stateMap: SESSION_STATE_MAP,
      })
    );
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('renders all 5 SESSION states', () => {
    const expected: Record<string, string> = {
      ACTIVE: 'Active',
      PAUSED: 'Paused',
      COMPLETED: 'Completed',
      ABANDONED: 'Abandoned',
      EXPIRED: 'Expired',
    };
    Object.entries(expected).forEach(([state, label]) => {
      const { unmount } = render(
        React.createElement(StateChip, { state, stateMap: SESSION_STATE_MAP })
      );
      expect(screen.getByText(label)).toBeTruthy();
      unmount();
    });
  });

  it('falls back to raw state string for unknown state', () => {
    render(
      React.createElement(StateChip, {
        state: 'TOTALLY_UNKNOWN',
        stateMap: SESSION_STATE_MAP,
      })
    );
    expect(screen.getByText('TOTALLY_UNKNOWN')).toBeTruthy();
  });

  it('renders CARD states', () => {
    const expected: Record<string, string> = {
      DRAFT: 'Draft',
      ACTIVE: 'Active',
      SUSPENDED: 'Suspended',
      ARCHIVED: 'Archived',
    };
    Object.entries(expected).forEach(([state, label]) => {
      const { unmount } = render(
        React.createElement(StateChip, { state, stateMap: CARD_STATE_MAP })
      );
      expect(screen.getByText(label)).toBeTruthy();
      unmount();
    });
  });

  it('renders CARD_LEARNING states', () => {
    ['NEW', 'LEARNING', 'REVIEW', 'RELEARNING'].forEach((state) => {
      const { unmount } = render(
        React.createElement(StateChip, {
          state,
          stateMap: CARD_LEARNING_STATE_MAP,
        })
      );
      expect(screen.getByRole('status')).toBeTruthy();
      unmount();
    });
  });

  it('renders MUTATION and MISCONCEPTION states without crashing', () => {
    render(
      React.createElement(StateChip, {
        state: 'PENDING',
        stateMap: MUTATION_STATE_MAP,
      })
    );
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('renders MISCONCEPTION DETECTED state', () => {
    render(
      React.createElement(StateChip, {
        state: 'DETECTED',
        stateMap: MISCONCEPTION_STATUS_MAP,
      })
    );
    expect(screen.getByText('Detected')).toBeTruthy();
  });
});
```

### Step 2: Run test — expect FAIL

Run: `pnpm --filter @noema/ui test -- --reporter=verbose state-chip` Expected:
FAIL — `state-chip.js` not found

### Step 3: Implement StateChip

```tsx
// packages/ui/src/data-display/state-chip.tsx
import type { JSX } from 'react';
import { cn } from '../lib/utils.js';
import type { ColorFamily } from '../lib/types.js';

// BG tint and ring color lookups — static for Tailwind JIT
const BG_TINT: Record<ColorFamily, string> = {
  synapse: 'bg-synapse-400/15 text-synapse-400',
  dendrite: 'bg-dendrite-400/15 text-dendrite-400',
  myelin: 'bg-myelin-400/15 text-myelin-400',
  neuron: 'bg-neuron-400/15 text-neuron-400',
  cortex: 'bg-cortex-400/15 text-cortex-400',
  axon: 'bg-axon-400/15 text-axon-400',
};

const RING_COLOR: Record<ColorFamily, string> = {
  synapse: 'ring-synapse-400/40',
  dendrite: 'ring-dendrite-400/40',
  myelin: 'ring-myelin-400/40',
  neuron: 'ring-neuron-400/40',
  cortex: 'ring-cortex-400/40',
  axon: 'ring-axon-400/40',
};

export interface StateConfig {
  label: string;
  color: ColorFamily;
  icon?: React.ReactNode;
}

interface StateChipProps {
  state: string;
  stateMap: Record<string, StateConfig>;
  size?: 'sm' | 'md';
  pulse?: boolean;
  className?: string;
}

// ── Default state maps ────────────────────────────────────────────────────────

export const SESSION_STATE_MAP: Record<string, StateConfig> = {
  ACTIVE: { label: 'Active', color: 'synapse' },
  PAUSED: { label: 'Paused', color: 'myelin' },
  COMPLETED: { label: 'Completed', color: 'neuron' },
  ABANDONED: { label: 'Abandoned', color: 'cortex' },
  EXPIRED: { label: 'Expired', color: 'axon' },
};

export const CARD_STATE_MAP: Record<string, StateConfig> = {
  DRAFT: { label: 'Draft', color: 'axon' },
  ACTIVE: { label: 'Active', color: 'synapse' },
  SUSPENDED: { label: 'Suspended', color: 'myelin' },
  ARCHIVED: { label: 'Archived', color: 'axon' },
};

export const CARD_LEARNING_STATE_MAP: Record<string, StateConfig> = {
  NEW: { label: 'New', color: 'dendrite' },
  LEARNING: { label: 'Learning', color: 'synapse' },
  REVIEW: { label: 'Review', color: 'myelin' },
  RELEARNING: { label: 'Relearning', color: 'cortex' },
};

export const MUTATION_STATE_MAP: Record<string, StateConfig> = {
  PENDING: { label: 'Pending', color: 'axon' },
  IN_FLIGHT: { label: 'In Flight', color: 'synapse' },
  COMMITTED: { label: 'Committed', color: 'neuron' },
  REJECTED: { label: 'Rejected', color: 'cortex' },
  ROLLED_BACK: { label: 'Rolled Back', color: 'myelin' },
};

export const MISCONCEPTION_STATUS_MAP: Record<string, StateConfig> = {
  DETECTED: { label: 'Detected', color: 'cortex' },
  ACKNOWLEDGED: { label: 'Acknowledged', color: 'myelin' },
  RESOLVING: { label: 'Resolving', color: 'synapse' },
  RESOLVED: { label: 'Resolved', color: 'neuron' },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function StateChip({
  state,
  stateMap,
  size = 'md',
  pulse = false,
  className,
}: StateChipProps): JSX.Element {
  const config: StateConfig = stateMap[state] ?? {
    label: state,
    color: 'axon',
  };
  const sizeClass =
    size === 'sm' ? 'px-2 py-0.5 text-xs gap-1' : 'px-2.5 py-1 text-xs gap-1.5';

  return (
    <span
      role="status"
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        BG_TINT[config.color],
        sizeClass,
        pulse &&
          `ring-1 ring-offset-0 animate-pulse-glow ${RING_COLOR[config.color]}`,
        className
      )}
    >
      {config.icon !== undefined && config.icon}
      {config.label}
    </span>
  );
}
```

### Step 4: Run test — expect PASS

Run: `pnpm --filter @noema/ui test -- --reporter=verbose state-chip` Expected:
7/7 PASS

### Step 5: Lint and commit

```bash
git add packages/ui/src/data-display/state-chip.tsx packages/ui/src/data-display/state-chip.test.ts
git commit -m "feat(ui): add StateChip with 5 default state maps (Phase 01)"
```

---

## Task 4 — ConfidenceMeter + Tests

**Files:**

- Create: `packages/ui/src/data-display/confidence-meter.tsx`
- Create: `packages/ui/src/data-display/confidence-meter.test.ts`

### Step 1: Write the failing tests

```typescript
// packages/ui/src/data-display/confidence-meter.test.ts
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { ConfidenceMeter } from './confidence-meter.js';

describe('ConfidenceMeter — segment calculation', () => {
  it('fills 3 of 5 segments at value 0.6', () => {
    render(React.createElement(ConfidenceMeter, { value: 0.6, segments: 5 }));
    const all = screen.getAllByTestId('cm-segment');
    const filled = all.filter((el) => el.dataset['filled'] === 'true');
    expect(filled).toHaveLength(3);
  });

  it('fills 0 segments at value 0', () => {
    render(React.createElement(ConfidenceMeter, { value: 0, segments: 5 }));
    const filled = screen
      .getAllByTestId('cm-segment')
      .filter((el) => el.dataset['filled'] === 'true');
    expect(filled).toHaveLength(0);
  });

  it('fills all segments at value 1', () => {
    render(React.createElement(ConfidenceMeter, { value: 1, segments: 5 }));
    const filled = screen
      .getAllByTestId('cm-segment')
      .filter((el) => el.dataset['filled'] === 'true');
    expect(filled).toHaveLength(5);
  });

  it('renders custom segment count', () => {
    render(React.createElement(ConfidenceMeter, { value: 0.5, segments: 10 }));
    expect(screen.getAllByTestId('cm-segment')).toHaveLength(10);
  });
});

describe('ConfidenceMeter — value clamping', () => {
  it('clamps value above 1', () => {
    render(React.createElement(ConfidenceMeter, { value: 2, segments: 5 }));
    const filled = screen
      .getAllByTestId('cm-segment')
      .filter((el) => el.dataset['filled'] === 'true');
    expect(filled).toHaveLength(5);
  });

  it('clamps value below 0', () => {
    render(React.createElement(ConfidenceMeter, { value: -1, segments: 5 }));
    const filled = screen
      .getAllByTestId('cm-segment')
      .filter((el) => el.dataset['filled'] === 'true');
    expect(filled).toHaveLength(0);
  });
});

describe('ConfidenceMeter — controlled / uncontrolled mode', () => {
  it('renders a slider in controlled (interactive) mode', () => {
    const onChange = vi.fn();
    render(React.createElement(ConfidenceMeter, { value: 0.5, onChange }));
    expect(screen.getByRole('slider')).toBeTruthy();
  });

  it('does not render a slider in display-only mode', () => {
    render(React.createElement(ConfidenceMeter, { value: 0.5 }));
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('calls onChange with parsed float when slider changes', () => {
    const onChange = vi.fn();
    render(React.createElement(ConfidenceMeter, { value: 0.5, onChange }));
    fireEvent.change(screen.getByRole('slider'), { target: { value: '0.8' } });
    expect(onChange).toHaveBeenCalledWith(0.8);
  });
});
```

### Step 2: Run test — expect FAIL

Run: `pnpm --filter @noema/ui test -- --reporter=verbose confidence-meter`
Expected: FAIL — module not found

### Step 3: Implement ConfidenceMeter

```tsx
// packages/ui/src/data-display/confidence-meter.tsx
import type { JSX } from 'react';
import { cn } from '../lib/utils.js';

// Qualitative label array — index maps to quintile (0 = lowest)
const CONFIDENCE_LABELS = [
  'Guessing',
  'Uncertain',
  'Somewhat sure',
  'Confident',
  'Certain',
] as const;

// Segment fill colors (5 positions, cortex → myelin gradient)
// Static strings for Tailwind JIT safety
const SEGMENT_FILL = [
  'bg-cortex-400',
  'bg-cortex-200',
  'bg-axon-400',
  'bg-myelin-200',
  'bg-myelin-400',
] as const;

// Default fill for non-standard segment counts
const DEFAULT_FILL = 'bg-myelin-400';

function getFilledCount(value: number, segments: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * segments);
}

function getLabel(value: number): string {
  const clamped = Math.min(1, Math.max(0, value));
  const index = Math.min(4, Math.floor(clamped * 5));
  return CONFIDENCE_LABELS[index] ?? CONFIDENCE_LABELS[4];
}

interface ConfidenceMeterProps {
  value: number; // 0–1
  onChange?: (value: number) => void;
  segments?: number;
  showLabel?: boolean;
  className?: string;
}

export function ConfidenceMeter({
  value,
  onChange,
  segments = 5,
  showLabel = false,
  className,
}: ConfidenceMeterProps): JSX.Element {
  const filledCount = getFilledCount(value, segments);

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="relative h-3">
        {/* Visual segmented bar */}
        <div className="absolute inset-0 flex gap-0.5">
          {Array.from({ length: segments }, (_, i) => {
            const isFilled = i < filledCount;
            const fillClass =
              segments === 5
                ? isFilled
                  ? (SEGMENT_FILL[i] ?? DEFAULT_FILL)
                  : 'bg-axon-100'
                : isFilled
                  ? DEFAULT_FILL
                  : 'bg-axon-100';
            return (
              <div
                key={i}
                data-testid="cm-segment"
                data-filled={isFilled}
                className={cn('flex-1 rounded-sm', fillClass)}
              />
            );
          })}
        </div>
        {/* Invisible range input backing (interactive mode only) */}
        {onChange !== undefined && (
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={value}
            onChange={(e) => {
              onChange(parseFloat(e.target.value));
            }}
            aria-label="Confidence level"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        )}
      </div>
      {showLabel && (
        <span className="text-caption text-axon-400">{getLabel(value)}</span>
      )}
    </div>
  );
}
```

### Step 4: Run test — expect PASS

Run: `pnpm --filter @noema/ui test -- --reporter=verbose confidence-meter`
Expected: 9/9 PASS

### Step 5: Lint and commit

```bash
git add packages/ui/src/data-display/confidence-meter.tsx packages/ui/src/data-display/confidence-meter.test.ts
git commit -m "feat(ui): add ConfidenceMeter with controlled/display modes (Phase 01)"
```

---

## Task 5 — ProgressRing

**Files:**

- Create: `packages/ui/src/data-display/progress-ring.tsx`

**No unit tests** (pure SVG display).

### Step 1: Create the component

```tsx
// packages/ui/src/data-display/progress-ring.tsx
import type { JSX } from 'react';
import { cn } from '../lib/utils.js';
import type { ColorFamily } from '../lib/types.js';

const SIZE_MAP = {
  sm: { svgSize: 80, baseR: 28, strokeWidth: 6, gap: 4, cx: 40, cy: 40 },
  md: { svgSize: 120, baseR: 44, strokeWidth: 8, gap: 5, cx: 60, cy: 60 },
  lg: { svgSize: 160, baseR: 60, strokeWidth: 9, gap: 6, cx: 80, cy: 80 },
} as const;

// Static lookup maps for JIT safety
const STROKE_COLOR: Record<ColorFamily, string> = {
  synapse: 'stroke-synapse-400',
  dendrite: 'stroke-dendrite-400',
  myelin: 'stroke-myelin-400',
  neuron: 'stroke-neuron-400',
  cortex: 'stroke-cortex-400',
  axon: 'stroke-axon-400',
};

interface Ring {
  value: number;
  max: number;
  color: ColorFamily;
  label: string;
}

interface ProgressRingProps {
  rings: Ring[];
  size?: 'sm' | 'md' | 'lg';
  centerContent?: React.ReactNode;
  className?: string;
}

export function ProgressRing({
  rings,
  size = 'md',
  centerContent,
  className,
}: ProgressRingProps): JSX.Element {
  const { svgSize, baseR, strokeWidth, gap, cx, cy } = SIZE_MAP[size];
  const ringStep = strokeWidth + gap;

  return (
    <div
      className={cn(
        'relative inline-flex items-center justify-center',
        className
      )}
    >
      <svg
        width={svgSize}
        height={svgSize}
        viewBox={`0 0 ${String(svgSize)} ${String(svgSize)}`}
        aria-label="Progress rings"
        role="img"
      >
        {rings.map((ring, i) => {
          const r = baseR - i * ringStep;
          if (r <= 0) return null;
          const circumference = 2 * Math.PI * r;
          const ratio = Math.min(1, Math.max(0, ring.value / ring.max));
          const filled = circumference * ratio;

          return (
            <g key={ring.label}>
              {/* Background track */}
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                strokeWidth={strokeWidth}
                className={cn(STROKE_COLOR[ring.color], 'opacity-10')}
              />
              {/* Filled arc */}
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                strokeWidth={strokeWidth}
                className={cn(STROKE_COLOR[ring.color], 'animate-ring-fill')}
                strokeDasharray={`${String(filled)} ${String(circumference)}`}
                strokeLinecap="round"
                transform={`rotate(-90, ${String(cx)}, ${String(cy)})`}
                style={{ animationDelay: `${String(i * 100)}ms` }}
              />
            </g>
          );
        })}
      </svg>
      {centerContent !== undefined && (
        <div className="absolute inset-0 flex items-center justify-center">
          {centerContent}
        </div>
      )}
    </div>
  );
}
```

### Step 2: Lint and commit

```bash
git add packages/ui/src/data-display/progress-ring.tsx
git commit -m "feat(ui): add ProgressRing concentric SVG rings (Phase 01)"
```

---

## Task 6 — Skeleton & EmptyState

**Files:**

- Create: `packages/ui/src/feedback/skeleton.tsx`
- Create: `packages/ui/src/feedback/empty-state.tsx`

**No unit tests** (pure display).

### Step 1: Create Skeleton

```tsx
// packages/ui/src/feedback/skeleton.tsx
import type { JSX } from 'react';
import { cn } from '../lib/utils.js';

type SkeletonVariant =
  | 'text'
  | 'circle'
  | 'rect'
  | 'metric-tile'
  | 'card'
  | 'graph-node';

const VARIANT_BASE: Record<SkeletonVariant, string> = {
  text: 'h-4 w-full rounded',
  circle: 'rounded-full',
  rect: 'rounded-lg',
  'metric-tile': 'h-20 w-32 rounded-lg',
  card: 'h-40 w-full rounded-lg',
  'graph-node': 'h-8 w-8 rounded-full',
};

interface SkeletonProps {
  variant: SkeletonVariant;
  width?: string;
  height?: string;
  className?: string;
}

export function Skeleton({
  variant,
  width,
  height,
  className,
}: SkeletonProps): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={cn('shimmer bg-axon-100', VARIANT_BASE[variant], className)}
      style={{
        width: width,
        height: height,
      }}
    />
  );
}
```

### Step 2: Create EmptyState

```tsx
// packages/ui/src/feedback/empty-state.tsx
import type { JSX } from 'react';
import { cn } from '../lib/utils.js';
import { Button } from '../primitives/button.js';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 p-8 animate-fade-slide-in',
        className
      )}
    >
      {icon !== undefined && (
        <div className="text-axon-200 text-4xl">{icon}</div>
      )}
      <div className="flex flex-col items-center gap-2 text-center">
        <h3 className="text-card-title text-foreground">{title}</h3>
        {description !== undefined && (
          <p className="text-body text-axon-400 max-w-sm">{description}</p>
        )}
      </div>
      {action !== undefined && (
        <Button onClick={action.onClick} variant="default">
          {action.label}
        </Button>
      )}
    </div>
  );
}
```

### Step 3: Lint and commit

```bash
git add packages/ui/src/feedback/skeleton.tsx packages/ui/src/feedback/empty-state.tsx
git commit -m "feat(ui): add Skeleton and EmptyState feedback components (Phase 01)"
```

---

## Task 7 — PulseIndicator + Tests

**Files:**

- Create: `packages/ui/src/data-display/pulse-indicator.tsx`
- Create: `packages/ui/src/data-display/pulse-indicator.test.ts`

### Step 1: Write the failing tests

```typescript
// packages/ui/src/data-display/pulse-indicator.test.ts
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, it, expect } from 'vitest';
import { PulseIndicator } from './pulse-indicator.js';

describe('PulseIndicator — status → color mapping', () => {
  it('active → bg-neuron-400', () => {
    const { container } = render(
      React.createElement(PulseIndicator, { status: 'active' })
    );
    expect(container.querySelector('.bg-neuron-400')).not.toBeNull();
  });

  it('idle → bg-axon-400', () => {
    const { container } = render(
      React.createElement(PulseIndicator, { status: 'idle' })
    );
    expect(container.querySelector('.bg-axon-400')).not.toBeNull();
  });

  it('error → bg-cortex-400', () => {
    const { container } = render(
      React.createElement(PulseIndicator, { status: 'error' })
    );
    expect(container.querySelector('.bg-cortex-400')).not.toBeNull();
  });

  it('offline → bg-axon-200', () => {
    const { container } = render(
      React.createElement(PulseIndicator, { status: 'offline' })
    );
    expect(container.querySelector('.bg-axon-200')).not.toBeNull();
  });
});

describe('PulseIndicator — active animation', () => {
  it('adds animate-pulse-glow to active dot', () => {
    const { container } = render(
      React.createElement(PulseIndicator, { status: 'active' })
    );
    expect(container.querySelector('.animate-pulse-glow')).not.toBeNull();
  });

  it('does not add animate-pulse-glow to idle dot', () => {
    const { container } = render(
      React.createElement(PulseIndicator, { status: 'idle' })
    );
    expect(container.querySelector('.animate-pulse-glow')).toBeNull();
  });
});

describe('PulseIndicator — label', () => {
  it('renders optional label text', () => {
    render(
      React.createElement(PulseIndicator, {
        status: 'active',
        label: 'Live session',
      })
    );
    expect(screen.getByText('Live session')).toBeTruthy();
  });

  it('renders without label by default', () => {
    const { container } = render(
      React.createElement(PulseIndicator, { status: 'idle' })
    );
    expect(container.querySelector('span + span')).toBeNull();
  });
});
```

### Step 2: Run test — expect FAIL

Run: `pnpm --filter @noema/ui test -- --reporter=verbose pulse-indicator`
Expected: FAIL — module not found

### Step 3: Implement PulseIndicator

```tsx
// packages/ui/src/data-display/pulse-indicator.tsx
import type { JSX } from 'react';
import { cn } from '../lib/utils.js';

type Status = 'active' | 'idle' | 'error' | 'offline';

// Static lookups — JIT-safe
const STATUS_COLOR: Record<Status, string> = {
  active: 'bg-neuron-400',
  idle: 'bg-axon-400',
  error: 'bg-cortex-400',
  offline: 'bg-axon-200',
};

const SIZE_CLASS: Record<'xs' | 'sm', string> = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2.5 w-2.5',
};

interface PulseIndicatorProps {
  status: Status;
  size?: 'xs' | 'sm';
  label?: string;
  className?: string;
}

export function PulseIndicator({
  status,
  size = 'sm',
  label,
  className,
}: PulseIndicatorProps): JSX.Element {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className={cn(
          'rounded-full flex-shrink-0',
          STATUS_COLOR[status],
          SIZE_CLASS[size],
          status === 'active' && 'animate-pulse-glow'
        )}
      />
      {label !== undefined && (
        <span className="text-caption text-axon-400">{label}</span>
      )}
    </span>
  );
}
```

### Step 4: Run test — expect PASS

Run: `pnpm --filter @noema/ui test -- --reporter=verbose pulse-indicator`
Expected: 8/8 PASS

### Step 5: Full test suite

Run: `pnpm --filter @noema/ui test` Expected: all tests PASS (theme tests +
state-chip + confidence-meter + pulse-indicator)

### Step 6: Lint and commit

```bash
git add packages/ui/src/data-display/pulse-indicator.tsx packages/ui/src/data-display/pulse-indicator.test.ts
git commit -m "feat(ui): add PulseIndicator breathing status dot (Phase 01)"
```

---

## Task 8 — Barrel Exports + Package Sub-paths

**Files:**

- Create: `packages/ui/src/data-display/index.ts`
- Create: `packages/ui/src/feedback/index.ts`
- Modify: `packages/ui/src/index.ts`
- Modify: `packages/ui/package.json`

### Step 1: Create data-display barrel

```typescript
// packages/ui/src/data-display/index.ts
export { NeuralGauge } from './neural-gauge.js';
export { MetricTile } from './metric-tile.js';
export {
  StateChip,
  SESSION_STATE_MAP,
  CARD_STATE_MAP,
  CARD_LEARNING_STATE_MAP,
  MUTATION_STATE_MAP,
  MISCONCEPTION_STATUS_MAP,
} from './state-chip.js';
export type { StateConfig } from './state-chip.js';
export { ConfidenceMeter } from './confidence-meter.js';
export { ProgressRing } from './progress-ring.js';
export { PulseIndicator } from './pulse-indicator.js';
```

### Step 2: Create feedback barrel

```typescript
// packages/ui/src/feedback/index.ts
export { Skeleton } from './skeleton.js';
export { EmptyState } from './empty-state.js';
```

### Step 3: Update main index.ts

Add these exports after the existing exports in `packages/ui/src/index.ts`:

```typescript
// Data Display
export * from './data-display/index.js';

// Feedback
export * from './feedback/index.js';

// Shared types
export type { ColorFamily } from './lib/types.js';
```

The full updated file:

```typescript
// packages/ui/src/index.ts
/**
 * @noema/ui
 *
 * Shared UI components for Noema web applications.
 */

// Utilities
export { cn } from './lib/utils.js';

// Primitives
export * from './primitives/index.js';

// Forms
export * from './forms/index.js';

// Layouts
export * from './layouts/index.js';

// Theme
export { ThemeProvider, useTheme } from './lib/theme.js';
export type {
  Theme,
  ResolvedTheme,
  IThemeContextValue,
  IThemeProviderProps,
  ThemeContextValue,
  ThemeProviderProps,
} from './lib/theme.js';

// Data Display
export * from './data-display/index.js';

// Feedback
export * from './feedback/index.js';

// Shared types
export type { ColorFamily } from './lib/types.js';
```

### Step 4: Update package.json exports

In `packages/ui/package.json`, add `./data-display` and `./feedback` export
paths after `./layouts`:

```json
"./data-display": {
  "types": "./dist/data-display/index.d.ts",
  "import": "./dist/data-display/index.js"
},
"./feedback": {
  "types": "./dist/feedback/index.d.ts",
  "import": "./dist/feedback/index.js"
},
```

### Step 5: Lint and commit

```bash
git add packages/ui/src/data-display/index.ts packages/ui/src/feedback/index.ts packages/ui/src/index.ts packages/ui/package.json
git commit -m "feat(ui): wire barrel exports and package.json sub-paths (Phase 01)"
```

---

## Task 9 — Final Build & Test Verification

### Step 1: Run all tests

Run: `pnpm --filter @noema/ui test` Expected: all PASS (theme + state-chip +
confidence-meter + pulse-indicator)

### Step 2: Run lint

Run: `pnpm --filter @noema/ui lint` Expected: 0 errors, 0 warnings

### Step 3: Run build

Run: `pnpm --filter @noema/ui build` Expected: exits 0;
`dist/data-display/index.js` and `dist/feedback/index.js` exist

### Step 4: TypeScript typecheck

Run: `pnpm --filter @noema/ui typecheck` Expected: no errors

### Step 5: Smoke-check the barrel from consumer

Verify imports resolve from `@noema/ui` in a consumer like `apps/web`. This is
done by running:

Run: `pnpm --filter @noema/web typecheck` Expected: no new errors (pre-existing
`@noema/api-client` ESM issue is out of scope — do not attempt to fix it here)

### Step 6: Commit verification evidence

```bash
git add -A  # only if any lint-auto-fixes occurred
git commit -m "chore(ui): Phase 01 Cortex complete — all 7 components, tests, exports verified"
```

---

## Acceptance Checklist

- [ ] All 7 components render in both dark and light mode (visual check via
      token gallery)
- [ ] `NeuralGauge` and `ProgressRing`: pure SVG, no canvas, no `useEffect`-only
      render logic
- [ ] `ConfidenceMeter`: controlled mode calls `onChange`; display mode has no
      slider
- [ ] `StateChip`: all 5 default maps correct; unknown state falls back to raw
      string
- [ ] `Skeleton` variants: `shimmer` class present on all
- [ ] `EmptyState`: `animate-fade-slide-in` class present on wrapper
- [ ] `PulseIndicator`: `animate-pulse-glow` only on `active` status
- [ ] `pnpm --filter @noema/ui test` → all green
- [ ] `pnpm --filter @noema/ui build` → exits 0
- [ ] `pnpm --filter @noema/ui lint` → 0 errors
- [ ] All components importable from `@noema/ui` root barrel
- [ ] All components importable from `@noema/ui/data-display` and
      `@noema/ui/feedback` sub-paths
- [ ] `ColorFamily` type exported from `@noema/ui`
