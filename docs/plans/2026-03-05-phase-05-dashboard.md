# Phase 05 — Dashboard: Cognitive Vitals Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the hardcoded dashboard with a fully-live "Cognitive Vitals" dashboard pulling from 4 services in parallel, with independent failure isolation per section.

**Architecture:** Six independently-wrapped sections using `SectionErrorBoundary` for fault isolation. Each section owns its data-fetching (TanStack Query deduplicates shared queries). Pure SVG for the mini-graph (no external graph lib). Staggered CSS animation for entrance.

**Tech Stack:** Next.js 14 + React 18, TanStack Query v5, `@noema/api-client` (scheduler + session + knowledge-graph + user hooks), `@noema/ui` (MetricTile, NeuralGauge, StateChip, Skeleton, EmptyState), Zustand (`useCopilotStore`), Tailwind CSS, Lucide React.

---

## Design Decisions & Deviations from Spec

1. **`usePKGSubgraph` bypassed** — The hook requires a `rootNodeId` we don't have at dashboard load. Instead: `usePKGNodes(userId)` + `usePKGEdges(userId)`, limited to 50 most-recently-updated nodes. Layout computed with a pure-TS iterative force simulation in `useMemo`.
2. **Session mode label mismatch** — `ISessionDto.mode` is `'standard' | 'cram' | 'preview' | 'test'`, not the spec's `EXPLORATION / GOAL_DRIVEN / EXAM_ORIENTED / SYNTHESIS`. Use a local `SESSION_MODE_LABEL` map.
3. **Session accuracy** — `ISessionDto` has no accuracy field. Use `currentCardIndex / cardIds.length` as a progress proxy for the small `NeuralGauge`.
4. **Cards Due sparkline** — Spec requests "last 7 days" due counts (retrospective). No history API exists; use `useReviewWindows` (forward-looking) aggregated by day as the sparkline data.
5. **`IMisconceptionDto` has no severity** — Severity breakdown (`major/minor`) doesn't exist in the schema. Show count + status breakdown (`detected` / `confirmed`).

---

## Files Created / Modified

| File | Action |
|------|--------|
| `apps/web/src/styles/globals.css` | Add `fade-slide-in` animation keyframe |
| `apps/web/src/components/dashboard/cognitive-vitals.tsx` | **New** — 4-tile vitals row |
| `apps/web/src/components/dashboard/review-forecast.tsx` | **New** — 7-day SVG bar chart |
| `apps/web/src/components/dashboard/knowledge-pulse.tsx` | **New** — mini PKG force graph |
| `apps/web/src/components/dashboard/recent-sessions.tsx` | **New** — recent sessions list |
| `apps/web/src/components/dashboard/copilot-suggestions.tsx` | **New** — agent action cards |
| `apps/web/src/app/(authenticated)/dashboard/page.tsx` | **Full rewrite** — compose all sections |

---

## Task 1: Add `fade-slide-in` Animation to globals.css

**Files:**
- Modify: `apps/web/src/styles/globals.css`

**Step 1: Add the keyframe**

Open `apps/web/src/styles/globals.css` and append to the `@layer utilities` block:

```css
  .animate-fade-slide-in {
    animation: fade-slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  @keyframes fade-slide-in {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
```

**Step 2: Verify it appears before proceeding**

Run: `grep -n "fade-slide-in" apps/web/src/styles/globals.css`
Expected: 2 lines matching (the class and the keyframe name).

**Step 3: Commit**

```bash
git add apps/web/src/styles/globals.css
git commit -m "feat(web): add fade-slide-in animation for dashboard stagger"
```

---

## Task 2: Cognitive Vitals Row

**Files:**
- Create: `apps/web/src/components/dashboard/cognitive-vitals.tsx`

**Step 1: Write the component**

```tsx
/**
 * Cognitive Vitals Row
 *
 * Four MetricTile widgets wired to live data from 4 services.
 * Each tile is independently error-isolated.
 */

'use client';

import {
  useDualLanePlan,
  useMisconceptions,
  useReviewWindows,
  useSessions,
  useStructuralHealth,
} from '@noema/api-client';
import type { UserId } from '@noema/types';
import { MetricTile, NeuralGauge, Skeleton } from '@noema/ui';
import { Flame } from 'lucide-react';
import { SectionErrorBoundary } from '@/components/section-error-boundary';

// ============================================================================
// Sub-tile: Cards Due
// ============================================================================

function CardsDueTile({ userId }: { userId: UserId }): React.JSX.Element {
  const today = new Date().toISOString().slice(0, 10);
  const plan = useDualLanePlan({ userId });
  const windows = useReviewWindows({ userId });

  if (plan.isLoading || windows.isLoading) {
    return <Skeleton variant="metric-tile" className="h-32" />;
  }

  const planData = plan.data?.data;
  const total = (planData?.totalRetention ?? 0) + (planData?.totalCalibration ?? 0);

  // Build 7-day sparkline from review windows (forward-looking approximation)
  const windowData = windows.data?.data ?? [];
  const byDay = new Map<string, number>();
  for (const w of windowData) {
    const day = w.startAt.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + w.cardsDue);
  }
  const sparklineData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return byDay.get(d.toISOString().slice(0, 10)) ?? 0;
  });

  return (
    <MetricTile
      label="Cards Due"
      value={total}
      colorFamily="synapse"
      sparklineData={sparklineData}
    />
  );
}

// ============================================================================
// Sub-tile: Knowledge Health
// ============================================================================

function KnowledgeHealthTile({ userId }: { userId: UserId }): React.JSX.Element {
  const health = useStructuralHealth(userId);

  if (health.isLoading) {
    return <Skeleton variant="metric-tile" className="h-32" />;
  }

  const data = health.data?.data;
  const score = data?.score ?? 0;
  const grade = data?.grade ?? '—';

  return (
    <MetricTile
      label="Knowledge Health"
      value={grade.charAt(0).toUpperCase() + grade.slice(1)}
      colorFamily="dendrite"
      icon={<NeuralGauge value={score} size="sm" showLabel={false} />}
    />
  );
}

// ============================================================================
// Sub-tile: Active Misconceptions
// ============================================================================

function MisconceptionsTile({ userId }: { userId: UserId }): React.JSX.Element {
  const misc = useMisconceptions(userId);

  if (misc.isLoading) {
    return <Skeleton variant="metric-tile" className="h-32" />;
  }

  const all = misc.data?.data ?? [];
  const active = all.filter((m) => m.status !== 'resolved' && m.status !== 'dismissed');
  const detected = active.filter((m) => m.status === 'detected').length;
  const confirmed = active.filter((m) => m.status === 'confirmed').length;

  const subtitle =
    active.length > 0
      ? `${String(confirmed)} confirmed · ${String(detected)} detected`
      : 'None active';

  return (
    <MetricTile
      label="Misconceptions"
      value={active.length}
      colorFamily="cortex"
      trend={
        active.length > 0
          ? { direction: 'down', delta: subtitle }
          : { direction: 'flat', delta: 'Clean' }
      }
    />
  );
}

// ============================================================================
// Sub-tile: Study Streak
// ============================================================================

function StudyStreakTile({ userId }: { userId: UserId }): React.JSX.Element {
  const sessions = useSessions({ state: 'COMPLETED', limit: 30 });

  if (sessions.isLoading) {
    return <Skeleton variant="metric-tile" className="h-32" />;
  }

  const list = sessions.data?.data ?? [];

  // Compute consecutive days with at least one completed session
  const completedDays = new Set(
    list.map((s) => new Date(s.startedAt).toISOString().slice(0, 10))
  );
  let streak = 0;
  const check = new Date();
  while (completedDays.has(check.toISOString().slice(0, 10))) {
    streak += 1;
    check.setDate(check.getDate() - 1);
  }

  return (
    <MetricTile
      label="Study Streak"
      value={`${String(streak)}d`}
      colorFamily="myelin"
      icon={streak > 7 ? <Flame className="h-4 w-4 text-myelin-400" /> : undefined}
      trend={streak > 0 ? { direction: 'up', delta: 'Keep it up!' } : { direction: 'flat' }}
    />
  );
}

// ============================================================================
// Exported Row
// ============================================================================

export function CognitiveVitals({ userId }: { userId: UserId }): React.JSX.Element {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <SectionErrorBoundary>
        <CardsDueTile userId={userId} />
      </SectionErrorBoundary>
      <SectionErrorBoundary>
        <KnowledgeHealthTile userId={userId} />
      </SectionErrorBoundary>
      <SectionErrorBoundary>
        <MisconceptionsTile userId={userId} />
      </SectionErrorBoundary>
      <SectionErrorBoundary>
        <StudyStreakTile userId={userId} />
      </SectionErrorBoundary>
    </div>
  );
}
```

**Step 2: Run typecheck (web app only)**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "dashboard/cognitive"
```
Expected: no output (zero errors in this file).

**Step 3: Commit**

```bash
git add apps/web/src/components/dashboard/cognitive-vitals.tsx
git commit -m "feat(web): add CognitiveVitals row with live data from 4 services"
```

---

## Task 3: Review Forecast Timeline

**Files:**
- Create: `apps/web/src/components/dashboard/review-forecast.tsx`

**Step 1: Write the component**

```tsx
/**
 * Review Forecast Timeline
 *
 * 7-day horizontal segmented bar chart (retention=synapse, calibration=myelin).
 * Data from useReviewWindows aggregated per day × lane.
 */

'use client';

import { useReviewWindows } from '@noema/api-client';
import type { UserId } from '@noema/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@noema/ui';
import { useState } from 'react';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const BAR_HEIGHT = 80;
const MAX_DISPLAY_VALUE = 50; // cap for visual scale

interface IDayData {
  label: string;
  date: string;
  retention: number;
  calibration: number;
  isToday: boolean;
}

function buildDayData(windowData: Array<{ startAt: string; lane: string; cardsDue: number }>): IDayData[] {
  const today = new Date().toISOString().slice(0, 10);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayWindows = windowData.filter((w) => w.startAt.slice(0, 10) === dateStr);
    return {
      label: DAY_LABELS[d.getDay()] ?? 'Day',
      date: dateStr,
      retention: dayWindows.filter((w) => w.lane === 'retention').reduce((s, w) => s + w.cardsDue, 0),
      calibration: dayWindows.filter((w) => w.lane === 'calibration').reduce((s, w) => s + w.cardsDue, 0),
      isToday: dateStr === today,
    };
  });
}

export function ReviewForecast({ userId }: { userId: UserId }): React.JSX.Element {
  const windows = useReviewWindows({ userId });
  const [hoveredDay, setHoveredDay] = useState<IDayData | null>(null);

  if (windows.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Review Forecast</CardTitle>
          <CardDescription>Next 7 days</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton variant="rect" className="h-28 w-full" />
        </CardContent>
      </Card>
    );
  }

  const windowData = windows.data?.data ?? [];
  const days = buildDayData(windowData);
  const totalWeek = days.reduce((s, d) => s + d.retention + d.calibration, 0);
  const todayTotal = days[0]?.retention + (days[0]?.calibration ?? 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review Forecast</CardTitle>
        <CardDescription>Next 7 days</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Bar chart */}
          <div className="flex items-end gap-1.5" style={{ height: `${String(BAR_HEIGHT)}px` }}>
            {days.map((day) => {
              const total = day.retention + day.calibration;
              const cappedTotal = Math.min(total, MAX_DISPLAY_VALUE);
              const retH = total > 0 ? Math.round((day.retention / total) * cappedTotal * (BAR_HEIGHT / MAX_DISPLAY_VALUE) * BAR_HEIGHT) : 0;
              const calH = total > 0 ? Math.round((day.calibration / total) * cappedTotal * (BAR_HEIGHT / MAX_DISPLAY_VALUE) * BAR_HEIGHT) : 0;
              const barH = Math.max(retH + calH, total > 0 ? 4 : 2);

              return (
                <div
                  key={day.date}
                  className="flex flex-1 flex-col items-center gap-0.5 cursor-pointer group"
                  onMouseEnter={() => { setHoveredDay(day); }}
                  onMouseLeave={() => { setHoveredDay(null); }}
                >
                  <div
                    className={`flex w-full flex-col justify-end overflow-hidden rounded-sm transition-opacity ${
                      day.isToday ? 'ring-1 ring-synapse-400/50 shadow-[0_0_8px] shadow-synapse-400/20' : ''
                    } ${hoveredDay !== null && hoveredDay.date !== day.date ? 'opacity-50' : 'opacity-100'}`}
                    style={{ height: `${String(BAR_HEIGHT - 20)}px` }}
                  >
                    <div
                      className="w-full bg-synapse-400/80 rounded-t-sm transition-all"
                      style={{ height: `${String(retH)}px` }}
                    />
                    <div
                      className="w-full bg-myelin-400/80"
                      style={{ height: `${String(calH)}px` }}
                    />
                    {total === 0 && (
                      <div className="w-full bg-muted rounded-sm" style={{ height: '2px' }} />
                    )}
                  </div>
                  <span className={`text-[10px] font-medium ${day.isToday ? 'text-synapse-400' : 'text-muted-foreground'}`}>
                    {day.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Tooltip */}
          {hoveredDay !== null && (
            <div className="absolute -top-16 left-1/2 -translate-x-1/2 rounded-md border bg-popover px-3 py-1.5 text-xs shadow-md pointer-events-none z-10 min-w-[140px]">
              <p className="font-semibold">{hoveredDay.date}</p>
              <p className="text-synapse-400">Retention: {hoveredDay.retention}</p>
              <p className="text-myelin-400">Calibration: {hoveredDay.calibration}</p>
              <p className="text-muted-foreground">Total: {hoveredDay.retention + hoveredDay.calibration}</p>
            </div>
          )}
        </div>

        {/* Legend + summary */}
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-synapse-400" />
              Retention
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-myelin-400" />
              Calibration
            </span>
          </div>
          <span>
            {String(totalWeek)} reviews this week · {String(todayTotal)} due today
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Run typecheck**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "dashboard/review"
```
Expected: no output.

**Step 3: Commit**

```bash
git add apps/web/src/components/dashboard/review-forecast.tsx
git commit -m "feat(web): add ReviewForecast 7-day segmented bar chart"
```

---

## Task 4: Knowledge Pulse Mini-Graph

**Files:**
- Create: `apps/web/src/components/dashboard/knowledge-pulse.tsx`

**Step 1: Write the force layout utility (inside the component file)**

The force simulation runs synchronously in `useMemo` — no animation loop, no external lib.

```tsx
/**
 * Knowledge Pulse Mini-Graph
 *
 * Compact force-directed SVG preview of the user's PKG.
 * Uses usePKGNodes + usePKGEdges (not usePKGSubgraph which requires a rootNodeId).
 * Force layout computed synchronously in useMemo (~100 iterations of repulsion + spring).
 */

'use client';

import { useMisconceptions, usePKGEdges, usePKGNodes } from '@noema/api-client';
import type { UserId } from '@noema/types';
import type { IGraphEdgeDto, IGraphNodeDto } from '@noema/api-client/knowledge-graph';
import { Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton } from '@noema/ui';
import { Network } from 'lucide-react';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';

// ============================================================================
// Constants
// ============================================================================

const W = 300;
const H = 250;
const MAX_NODES = 50;
const ITERATIONS = 100;
const REPULSION = 800;
const SPRING_K = 0.05;
const SPRING_LEN = 60;
const GRAVITY = 0.02;

// Node color by type — static lookup for Tailwind JIT safety
const NODE_FILL: Record<string, string> = {
  concept: 'fill-synapse-400',
  skill: 'fill-myelin-400',
  fact: 'fill-dendrite-400',
  procedure: 'fill-axon-400',
  principle: 'fill-cortex-400',
  example: 'fill-neuron-400',
};
const NODE_FILL_FALLBACK = 'fill-muted-foreground';

// ============================================================================
// Force layout
// ============================================================================

interface INodePos {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function computeForceLayout(
  nodes: IGraphNodeDto[],
  edges: IGraphEdgeDto[]
): Map<string, { x: number; y: number }> {
  const positions: INodePos[] = nodes.map((n, i) => ({
    id: n.id,
    // Scatter initial positions in a circle
    x: W / 2 + Math.cos((i / nodes.length) * Math.PI * 2) * (W / 3),
    y: H / 2 + Math.sin((i / nodes.length) * Math.PI * 2) * (H / 3),
    vx: 0,
    vy: 0,
  }));

  const posMap = new Map(positions.map((p) => [p.id, p]));

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const alpha = 1 - iter / ITERATIONS;

    // Repulsion between all pairs
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i];
        const b = positions[j];
        if (a === undefined || b === undefined) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (REPULSION / (dist * dist)) * alpha;
        a.vx -= (dx / dist) * force;
        a.vy -= (dy / dist) * force;
        b.vx += (dx / dist) * force;
        b.vy += (dy / dist) * force;
      }
    }

    // Spring attraction along edges
    for (const edge of edges) {
      const a = posMap.get(edge.sourceId);
      const b = posMap.get(edge.targetId);
      if (a === undefined || b === undefined) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const disp = (dist - SPRING_LEN) * SPRING_K;
      a.vx += (dx / dist) * disp;
      a.vy += (dy / dist) * disp;
      b.vx -= (dx / dist) * disp;
      b.vy -= (dy / dist) * disp;
    }

    // Gravity toward center
    for (const p of positions) {
      p.vx += (W / 2 - p.x) * GRAVITY;
      p.vy += (H / 2 - p.y) * GRAVITY;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.85; // damping
      p.vy *= 0.85;
      // Clamp to bounds
      p.x = Math.max(8, Math.min(W - 8, p.x));
      p.y = Math.max(8, Math.min(H - 8, p.y));
    }
  }

  return new Map(positions.map((p) => [p.id, { x: p.x, y: p.y }]));
}

// ============================================================================
// Component
// ============================================================================

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function KnowledgePulse({ userId }: { userId: UserId }): React.JSX.Element {
  const router = useRouter();
  const nodes = usePKGNodes(userId);
  const edges = usePKGEdges(userId);
  const misc = useMisconceptions(userId);

  const isLoading = nodes.isLoading || edges.isLoading;

  // Limit to 50 most recently updated nodes
  const visibleNodes = useMemo(() => {
    const all = nodes.data ?? [];
    return [...all]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, MAX_NODES);
  }, [nodes.data]);

  // Only keep edges between visible nodes
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);
  const visibleEdges = useMemo(
    () => (edges.data ?? []).filter((e) => visibleNodeIds.has(e.sourceId) && visibleNodeIds.has(e.targetId)),
    [edges.data, visibleNodeIds]
  );

  // Node positions from force simulation
  const layout = useMemo(
    () => computeForceLayout(visibleNodes, visibleEdges),
    [visibleNodes, visibleEdges]
  );

  // Misconception node IDs (active)
  const misconceptionNodeIds = useMemo(() => {
    const active = (misc.data?.data ?? []).filter(
      (m) => m.status !== 'resolved' && m.status !== 'dismissed'
    );
    return new Set(active.map((m) => m.nodeId));
  }, [misc.data]);

  // Recently-studied = updated within last 7 days
  const now = Date.now();
  const recentNodeIds = useMemo(
    () =>
      new Set(
        visibleNodes
          .filter((n) => now - new Date(n.updatedAt).getTime() < SEVEN_DAYS_MS)
          .map((n) => n.id)
      ),
    [visibleNodes, now]
  );

  if (isLoading) {
    return (
      <Card className="cursor-pointer">
        <CardHeader>
          <CardTitle className="text-sm">Knowledge Map</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton variant="graph-node" className="h-[250px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (visibleNodes.length === 0) {
    return (
      <Card className="cursor-pointer" onClick={() => { router.push('/knowledge'); }}>
        <CardContent className="pt-6">
          <EmptyState
            icon={<Network className="h-8 w-8 text-muted-foreground" />}
            title="No knowledge map yet"
            description="Start learning to build your knowledge map"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="cursor-pointer transition-colors hover:border-synapse-400/50"
      onClick={() => { router.push('/knowledge'); }}
    >
      <CardHeader className="pb-1">
        <CardTitle className="text-sm">Knowledge Map</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${String(W)} ${String(H)}`}
          className="w-full"
          overflow="visible"
        >
          {/* Edges */}
          {visibleEdges.map((edge) => {
            const src = layout.get(edge.sourceId);
            const tgt = layout.get(edge.targetId);
            if (src === undefined || tgt === undefined) return null;
            return (
              <line
                key={edge.id}
                x1={src.x}
                y1={src.y}
                x2={tgt.x}
                y2={tgt.y}
                className="stroke-border"
                strokeWidth={1}
                strokeOpacity={0.5}
              />
            );
          })}

          {/* Nodes */}
          {visibleNodes.map((node) => {
            const pos = layout.get(node.id);
            if (pos === undefined) return null;
            const fillClass = NODE_FILL[node.type] ?? NODE_FILL_FALLBACK;
            const isMisc = misconceptionNodeIds.has(node.id);
            const isRecent = recentNodeIds.has(node.id);
            const r = 5;

            return (
              <g key={node.id}>
                {/* Misconception halo */}
                {isMisc && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={r + 4}
                    className="fill-cortex-400/20 stroke-cortex-400"
                    strokeWidth={1}
                  />
                )}
                {/* Recently-studied pulse ring */}
                {isRecent && !isMisc && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={r + 3}
                    className="fill-none stroke-synapse-400/40"
                    strokeWidth={1.5}
                    style={{ animation: 'pulse 2s ease-in-out infinite' }}
                  />
                )}
                {/* Node */}
                <circle cx={pos.x} cy={pos.y} r={r} className={fillClass} />
              </g>
            );
          })}
        </svg>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Run typecheck**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "dashboard/knowledge"
```
Expected: no output.

**Step 3: Commit**

```bash
git add apps/web/src/components/dashboard/knowledge-pulse.tsx
git commit -m "feat(web): add KnowledgePulse mini force-directed SVG graph"
```

---

## Task 5: Recent Sessions Panel

**Files:**
- Create: `apps/web/src/components/dashboard/recent-sessions.tsx`

**Step 1: Write the component**

```tsx
/**
 * Recent Sessions Panel
 *
 * Shows the 5 most recent sessions with state chip, mode, progress, and
 * a small NeuralGauge using currentCardIndex/cardIds.length as a progress proxy
 * (ISessionDto has no accuracy field).
 */

'use client';

import { useSessions } from '@noema/api-client';
import type { ISessionDto } from '@noema/api-client/session';
import type { UserId } from '@noema/types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  NeuralGauge,
  SESSION_STATE_MAP,
  Skeleton,
  StateChip,
} from '@noema/ui';
import {
  BookOpen,
  FlaskConical,
  Layers,
  Target,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import type { SessionMode } from '@noema/api-client/session';

// ============================================================================
// Helpers
// ============================================================================

const SESSION_MODE_LABEL: Record<SessionMode, string> = {
  standard: 'Standard',
  cram: 'Cram',
  preview: 'Preview',
  test: 'Test',
};

const SESSION_MODE_ICON: Record<SessionMode, LucideIcon> = {
  standard: BookOpen,
  cram: Layers,
  preview: FlaskConical,
  test: Target,
};

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${String(minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}h ago`;
  const days = Math.floor(hours / 24);
  return `${String(days)}d ago`;
}

// ============================================================================
// Session Row
// ============================================================================

function SessionRow({
  session,
  onClick,
}: {
  session: ISessionDto;
  onClick: () => void;
}): React.JSX.Element {
  const ModeIcon = SESSION_MODE_ICON[session.mode] ?? BookOpen;
  const modeLabel = SESSION_MODE_LABEL[session.mode] ?? session.mode;
  const progress =
    session.cardIds.length > 0
      ? Math.round((session.currentCardIndex / session.cardIds.length) * 100)
      : 0;

  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onClick}
    >
      {/* State chip */}
      <StateChip stateMap={SESSION_STATE_MAP} value={session.state} size="sm" />

      {/* Mode badge */}
      <span className="flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        <ModeIcon className="h-2.5 w-2.5" />
        {modeLabel}
      </span>

      {/* Card counts */}
      <span className="text-xs text-muted-foreground">
        {session.currentCardIndex}/{session.cardIds.length}
      </span>

      {/* Progress gauge */}
      <NeuralGauge value={progress} size="sm" showLabel={false} className="flex-shrink-0" />

      {/* Relative time */}
      <span className="ml-auto text-xs text-muted-foreground">
        {relativeTime(session.startedAt)}
      </span>
    </button>
  );
}

// ============================================================================
// Exported Panel
// ============================================================================

export function RecentSessions({ userId }: { userId: UserId }): React.JSX.Element {
  const router = useRouter();
  const sessions = useSessions({ limit: 5 });

  if (sessions.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Sessions</CardTitle>
          <CardDescription>Your latest study sessions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} variant="text" className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const list = (sessions.data?.data ?? [])
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Sessions</CardTitle>
        <CardDescription>Your latest study sessions</CardDescription>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <EmptyState
            title="No sessions yet"
            description="Start your first study session!"
            action={{ label: 'Start studying', onClick: () => { router.push('/study'); } }}
          />
        ) : (
          <div className="space-y-1">
            {list.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                onClick={() => { router.push(`/sessions/${session.id}`); }}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 2: Run typecheck**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "dashboard/recent"
```
Expected: no output.

**Step 3: Commit**

```bash
git add apps/web/src/components/dashboard/recent-sessions.tsx
git commit -m "feat(web): add RecentSessions panel with state chips and progress gauge"
```

---

## Task 6: Copilot Suggestions Preview

**Files:**
- Create: `apps/web/src/components/dashboard/copilot-suggestions.tsx`

**Step 1: Write the component**

```tsx
/**
 * Copilot Suggestions Preview
 *
 * Top 3 agent-recommended actions from useCopilotStore().
 * Actions are drawn from hintsByPage, flattened, deduplicated, sorted by priority.
 */

'use client';

import type { ActionCategory, ActionPriority } from '@noema/contracts';
import { Card, CardContent, CardHeader, CardTitle } from '@noema/ui';
import { AlertTriangle, BookOpen, Compass, ExternalLink, SlidersHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCopilotStore } from '@/stores/copilot-store';

// ============================================================================
// Constants
// ============================================================================

const CATEGORY_ICON: Record<ActionCategory, LucideIcon> = {
  exploration: Compass,
  optimization: SlidersHorizontal,
  correction: AlertTriangle,
  learning: BookOpen,
};

const PRIORITY_COLOR: Record<ActionPriority, string> = {
  critical: 'text-cortex-400 border-cortex-400/30 bg-cortex-400/5',
  high: 'text-myelin-400 border-myelin-400/30 bg-myelin-400/5',
  medium: 'text-synapse-400 border-synapse-400/30 bg-synapse-400/5',
  low: 'text-axon-400 border-axon-400/30 bg-axon-400/5',
};

const PRIORITY_ORDER: Record<ActionPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ============================================================================
// Component
// ============================================================================

export function CopilotSuggestions(): React.JSX.Element {
  const hintsByPage = useCopilotStore((s) => s.hintsByPage);

  // Flatten all actions across all pages, deduplicate, sort by priority, take top 3
  const allActions = Object.values(hintsByPage).flatMap((hints) =>
    hints.flatMap((h) => h.suggestedNextActions)
  );
  const seen = new Set<string>();
  const deduplicated = allActions.filter((a) => {
    if (seen.has(a.action)) return false;
    seen.add(a.action);
    return true;
  });
  const top3 = deduplicated
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3))
    .slice(0, 3);

  if (top3.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Copilot Suggestions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Interact with Noema to get personalized suggestions
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm">Copilot Suggestions</CardTitle>
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => {
            // Phase 10: open copilot sidebar
          }}
        >
          See all
          <ExternalLink className="h-3 w-3" />
        </button>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          {top3.map((action) => {
            const category = (action.category ?? 'learning') as ActionCategory;
            const Icon = CATEGORY_ICON[category] ?? BookOpen;
            const colorClass = PRIORITY_COLOR[action.priority] ?? PRIORITY_COLOR.low;

            return (
              <div
                key={action.action}
                className={`rounded-lg border p-3 ${colorClass} flex flex-col gap-2`}
              >
                <div className="flex items-start gap-2">
                  <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <p className="text-xs font-medium leading-tight line-clamp-2">
                    {action.description ?? action.action}
                  </p>
                </div>
                {action.estimatedTime !== undefined && (
                  <p className="text-[10px] text-muted-foreground">
                    ~{Math.ceil(action.estimatedTime / 60_000)}m
                  </p>
                )}
                <button
                  type="button"
                  className="mt-auto rounded-sm bg-background/60 px-2 py-1 text-[10px] font-semibold hover:bg-background/80 transition-colors"
                  onClick={() => {
                    // Phase 10: trigger action
                  }}
                >
                  Do it
                </button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Run typecheck**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "dashboard/copilot"
```
Expected: no output.

**Step 3: Commit**

```bash
git add apps/web/src/components/dashboard/copilot-suggestions.tsx
git commit -m "feat(web): add CopilotSuggestions preview from Zustand store"
```

---

## Task 7: Dashboard Page Assembly

**Files:**
- Modify: `apps/web/src/app/(authenticated)/dashboard/page.tsx`

**Step 1: Rewrite the page**

```tsx
/**
 * Dashboard Page — Cognitive Vitals
 *
 * Codename: Thalamus
 * Composes all 5 dashboard sections with staggered entrance animation.
 * Each section is independently isolated via SectionErrorBoundary.
 */

'use client';

import { useAuth } from '@noema/auth';
import { SectionErrorBoundary } from '@/components/section-error-boundary';
import { CognitiveVitals } from '@/components/dashboard/cognitive-vitals';
import { CopilotSuggestions } from '@/components/dashboard/copilot-suggestions';
import { KnowledgePulse } from '@/components/dashboard/knowledge-pulse';
import { RecentSessions } from '@/components/dashboard/recent-sessions';
import { ReviewForecast } from '@/components/dashboard/review-forecast';

// ============================================================================
// Helpers
// ============================================================================

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

// ============================================================================
// Page
// ============================================================================

export default function DashboardPage(): React.JSX.Element {
  const { user } = useAuth();
  const firstName = user?.displayName?.split(' ')[0] ?? 'there';

  if (user === null) return <></>;
  const userId = user.id;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className="animate-fade-slide-in"
        style={{ animationDelay: '0ms' }}
      >
        <h1 className="text-3xl font-bold">
          {getGreeting()}, {firstName}
        </h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s your cognitive health at a glance.
        </p>
      </div>

      {/* Vitals row */}
      <div className="animate-fade-slide-in" style={{ animationDelay: '100ms' }}>
        <SectionErrorBoundary>
          <CognitiveVitals userId={userId} />
        </SectionErrorBoundary>
      </div>

      {/* Review Forecast */}
      <div className="animate-fade-slide-in" style={{ animationDelay: '200ms' }}>
        <SectionErrorBoundary>
          <ReviewForecast userId={userId} />
        </SectionErrorBoundary>
      </div>

      {/* Knowledge Pulse + Recent Sessions (side-by-side on desktop) */}
      <div
        className="grid gap-6 animate-fade-slide-in md:grid-cols-2"
        style={{ animationDelay: '300ms' }}
      >
        <SectionErrorBoundary>
          <KnowledgePulse userId={userId} />
        </SectionErrorBoundary>
        <SectionErrorBoundary>
          <RecentSessions userId={userId} />
        </SectionErrorBoundary>
      </div>

      {/* Copilot Suggestions */}
      <div className="animate-fade-slide-in" style={{ animationDelay: '400ms' }}>
        <SectionErrorBoundary>
          <CopilotSuggestions />
        </SectionErrorBoundary>
      </div>
    </div>
  );
}
```

**Step 2: Run full typecheck**

```bash
cd apps/web && npx tsc --noEmit 2>&1
```
Expected: zero errors.

**Step 3: Run lint on all new files**

```bash
cd apps/web && npx eslint \
  src/components/dashboard/cognitive-vitals.tsx \
  src/components/dashboard/review-forecast.tsx \
  src/components/dashboard/knowledge-pulse.tsx \
  src/components/dashboard/recent-sessions.tsx \
  src/components/dashboard/copilot-suggestions.tsx \
  src/app/\(authenticated\)/dashboard/page.tsx \
  --max-warnings 0 2>&1
```
Expected: zero warnings/errors.

**Step 4: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/dashboard/page.tsx
git commit -m "feat(web): compose Phase 05 Cognitive Vitals dashboard (Thalamus)"
```

---

## Acceptance Criteria Check

After Task 7, verify all spec requirements:

- [ ] **4 services in parallel** — `useDualLanePlan` (scheduler) + `useStructuralHealth` (KG) + `useMisconceptions` (KG) + `useSessions` (session) all called on mount
- [ ] **All 4 vitals tiles** — Cards Due, Knowledge Health, Misconceptions, Streak render with Skeleton loading states
- [ ] **7-day segmented bar chart** — dual-lane (synapse/myelin) with hover tooltip and summary line
- [ ] **Mini force-directed graph** — or empty state for new users
- [ ] **5 recent sessions** — StateChip + mode badge + progress gauge + relative time
- [ ] **Top 3 copilot actions** — from Zustand store, with priority color, category icon, Do it button
- [ ] **Independent failure isolation** — SectionErrorBoundary on every section
- [ ] **Staggered animation** — fade-slide-in at 0/100/200/300/400ms
- [ ] **Responsive** — `sm:grid-cols-2 lg:grid-cols-4` for vitals, `md:grid-cols-2` for pulse+sessions

---

## Notes for Implementer

- `@noema/api-client/knowledge-graph` and `@noema/api-client/session` are deep import paths — check that the package exports these sub-paths. If they cause resolution errors, import from `@noema/api-client` directly and type-cast or use `import type` from the source.
- The `useSessions` hook in `RecentSessions` doesn't need `userId` passed — the API client uses the auth token. But `KnowledgePulse` and `CognitiveVitals` need `userId` passed explicitly to the KG and scheduler hooks.
- `ISessionDto.mode` is `SessionMode = 'standard' | 'cram' | 'preview' | 'test'`. The spec's `EXPLORATION / GOAL_DRIVEN / EXAM_ORIENTED / SYNTHESIS` naming was aspirational and doesn't match current service types.
- The `NeuralGauge` requires a `value` prop (0–100). Pass `progress` (0–100) computed as `currentCardIndex / cardIds.length * 100`.
- The force simulation runs in O(n²) per iteration. With MAX_NODES=50 and ITERATIONS=100, this is ~250k operations — under 2ms in V8. Safe in `useMemo`.
