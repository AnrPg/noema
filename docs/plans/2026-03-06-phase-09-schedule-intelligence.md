# Phase 09 — Schedule Intelligence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Schedule Intelligence (Cerebellum) phase — a Reviews Dashboard at `/reviews` with today's dual-lane plan, 7-day forecast, review windows, per-card schedule inspector, and a scheduling simulator.

**Architecture:** Four tasks mirror the spec's four deliverables. `TodaysPlan`, `ReviewForecastFull`, and `ReviewWindows` compose the Reviews Dashboard page. `CardScheduleInspector` (with sub-components `RecallTimeline` and `CalibrationChart`) is a reusable slide-out panel. `SchedulingSimulator` is an inline what-if tool on the dashboard. T9.4 updates the sidebar nav. All use the same codebase patterns as Phases 07–08: `'use client'`, file-level eslint-disable headers for unbuilt packages, `(data as any) ?? []` extraction, `String(n)` for numbers in templates, `I` prefix on interfaces.

**Tech Stack:** Next.js 15, React, TypeScript, Tailwind CSS, `@noema/api-client` (useDualLanePlan, useReviewWindows, useSimulateSession, useSchedulerCard, useHLRPredict), `@noema/ui` (NeuralGauge, StateChip, ConfidenceMeter, Button, Card), lucide-react icons.

---

## Context & Patterns

### ESLint disable headers (required for all files importing @noema/* packages)
```tsx
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
```

### API data extraction pattern
```tsx
const { data: rawData, isLoading } = useSomeHook(input);
const items: IMyType[] = (rawData as any)?.data ?? [];
// For hooks WITH select: (r) => r.data:
const items: IMyType[] = (rawData as any) ?? [];
```

Check each hook — if it has `select: (r) => r.data` in its implementation, the data is already unwrapped. For scheduler hooks WITHOUT select, use `.data` accessor. `useDualLanePlan` does NOT have a select, so access via `(rawData as any)?.data`.

### Typed routes
```tsx
href={'/some/path' as never}
router.push('/some/path' as never)
```

### Numbers in templates
```tsx
{String(count)} cards   // NOT {count} cards
```

### Strict boolean expressions
```tsx
disabled={mutation.isPending === true}
if (isLoading === true) { ... }
```

### exactOptionalPropertyTypes — conditional spreads
```tsx
...(value !== undefined ? { prop: value } : {})
...(value !== null ? { prop: value } : {})
```

### Existing ReviewForecast component (Phase 5)
Already at `apps/web/src/components/dashboard/review-forecast.tsx`. It renders a compact 7-day bar chart. The full version (`ReviewForecastFull`) will be a new component that adds day-click expansion.

### Scheduler hook response shapes

`useDualLanePlan({ userId })` — NO select, raw `DualLanePlanResponse = IApiResponse<IDualLanePlanResult>`
- Access: `(rawData as any)?.data` → `IDualLanePlanResult`
- Fields: `slots: ILaneSlot[]`, `totalRetention: number`, `totalCalibration: number`

`useReviewWindows({ userId })` — NO select, raw `ReviewWindowsResponse = IApiResponse<IReviewWindowDto[]>`
- Access: `(rawData as any)?.data ?? []` → `IReviewWindowDto[]`
- Fields per window: `startAt: string, endAt: string, cardsDue: number, lane: 'retention'|'calibration', loadScore: number`

`useSimulateSession()` — mutation, takes `SimulationInput = { userId, sessionDurationMinutes, lane? }`
- Returns `SimulationResponse = IApiResponse<ISimulationResult>`
- Access: `(result as any)?.data` → `ISimulationResult`
- Fields: `simulatedCards: ISessionCandidateDto[], projectedRetentionGain: number, estimatedDurationMinutes: number`

`useSchedulerCard(cardId)` — NO select, raw `SchedulerCardResponse = { card: IReviewQueueCard }`
- Access: `(rawData as any)?.card` → `IReviewQueueCard`
- Fields: `cardId, userId, lane, schedulingAlgorithm, stability, difficulty, nextReviewDate, lastReviewedAt, reviewCount, lapseCount, state`

`useHLRPredict({ userId, cardId })` — NO select, raw `IHLRPredictionResult`
- Access: `(rawData as any)` directly → `IHLRPredictionResult`
- Fields: `recallProbability: number, halfLifeDays: number, predictedAt: string`

### Typecheck command
```bash
pnpm --filter @noema/web typecheck 2>&1 | grep -v "Cannot find module '@noema"
```
Expected output: pre-existing errors only (cards/*, settings/*, dashboard/knowledge-pulse.tsx — all TS7006 implicit any). No new errors from Phase 09 files.

---

## Task T9.1 — Reviews Dashboard

**Goal:** Build `/reviews` with three sections: Today's Plan (dual-lane split), 7-Day Forecast (expandable days), Review Windows (day-planner blocks). Plus three component files.

**Files:**
- Create: `apps/web/src/components/reviews/todays-plan.tsx`
- Create: `apps/web/src/components/reviews/review-forecast-full.tsx`
- Create: `apps/web/src/components/reviews/review-windows.tsx`
- Create: `apps/web/src/app/(authenticated)/reviews/page.tsx`

---

### Step 1: Create `apps/web/src/components/reviews/todays-plan.tsx`

```tsx
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
'use client';
/**
 * @noema/web — Reviews / TodaysPlan
 *
 * Dual-lane plan visualization for today's review session.
 * Shows retention vs calibration counts as a split bar + "Start" CTA.
 */
import * as React from 'react';
import Link from 'next/link';
import { useDualLanePlan } from '@noema/api-client';
import type { UserId } from '@noema/types';
import { Button } from '@noema/ui';
import { Loader2, PlayCircle } from 'lucide-react';

export interface ITodaysPlanProps {
  userId: UserId;
}

export function TodaysPlan({ userId }: ITodaysPlanProps): React.JSX.Element {
  const { data: planData, isLoading } = useDualLanePlan(
    { userId },
    { enabled: userId !== '' }
  );

  const plan: any = (planData as any)?.data ?? null;
  const totalRetention: number = (plan?.totalRetention as number | undefined) ?? 0;
  const totalCalibration: number = (plan?.totalCalibration as number | undefined) ?? 0;
  const total = totalRetention + totalCalibration;

  if (isLoading === true) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        Loading today's plan…
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-12 text-center">
        <span className="text-4xl" role="img" aria-label="Celebration">🎉</span>
        <h3 className="text-lg font-semibold text-foreground">All caught up!</h3>
        <p className="text-sm text-muted-foreground">
          Your memory is consolidating. No reviews due today.
        </p>
      </div>
    );
  }

  const retentionPct = total > 0 ? Math.round((totalRetention / total) * 100) : 50;
  const calibrationPct = 100 - retentionPct;

  // Estimate: ~2 min per card average
  const estimatedMinutes = Math.round(total * 2);
  const estimatedLabel =
    estimatedMinutes < 60
      ? `~${String(estimatedMinutes)}m`
      : `~${String(Math.floor(estimatedMinutes / 60))}h ${String(estimatedMinutes % 60)}m`;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card px-6 py-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Today's Review Plan</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {String(total)} cards · {estimatedLabel}
          </p>
        </div>
        <Button asChild size="sm" className="gap-1.5">
          <Link href={'/session/new' as never}>
            <PlayCircle className="h-4 w-4" aria-hidden="true" />
            Start Today's Review
          </Link>
        </Button>
      </div>

      {/* Split bar */}
      <div className="flex overflow-hidden rounded-lg" style={{ height: '40px' }}>
        <div
          className="flex flex-col items-center justify-center bg-synapse-400/80 transition-all"
          style={{ width: `${String(retentionPct)}%` }}
        >
          <span className="text-xs font-semibold text-white">{String(totalRetention)}</span>
          <span className="text-[10px] text-white/80">Retention</span>
        </div>
        <div
          className="flex flex-col items-center justify-center bg-myelin-400/80 transition-all"
          style={{ width: `${String(calibrationPct)}%` }}
        >
          <span className="text-xs font-semibold text-white">{String(totalCalibration)}</span>
          <span className="text-[10px] text-white/80">Calibration</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-synapse-400" />
          Retention (FSRS)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-myelin-400" />
          Calibration (HLR)
        </span>
      </div>
    </div>
  );
}
```

---

### Step 2: Create `apps/web/src/components/reviews/review-forecast-full.tsx`

Full-width 7-day forecast with expandable day rows showing cards due.

```tsx
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
'use client';
/**
 * @noema/web — Reviews / ReviewForecastFull
 *
 * Full-width 7-day forecast with day-click expansion.
 * Extends the compact ReviewForecast from the Dashboard.
 */
import * as React from 'react';
import { useReviewWindows } from '@noema/api-client';
import type { UserId } from '@noema/types';
import { Loader2, ChevronDown } from 'lucide-react';

// ── Helpers ─────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const BAR_MAX_H = 72; // px

function localDateStr(d: Date): string {
  const y = String(d.getFullYear());
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface IDayData {
  label: string;
  date: string;
  isToday: boolean;
  retention: number;
  calibration: number;
  windows: { startAt: string; endAt: string; lane: 'retention' | 'calibration'; cardsDue: number }[];
}

function buildDays(
  windowData: { startAt: string; endAt: string; cardsDue: number; lane: string }[]
): IDayData[] {
  const today = localDateStr(new Date());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = localDateStr(d);
    const dayWindows = windowData.filter(
      (w) => localDateStr(new Date(w.startAt)) === dateStr
    ) as { startAt: string; endAt: string; lane: 'retention' | 'calibration'; cardsDue: number }[];
    return {
      label: DAY_LABELS[d.getDay()] ?? 'Day',
      date: dateStr,
      isToday: dateStr === today,
      retention: dayWindows.filter((w) => w.lane === 'retention').reduce((s, w) => s + w.cardsDue, 0),
      calibration: dayWindows.filter((w) => w.lane === 'calibration').reduce((s, w) => s + w.cardsDue, 0),
      windows: dayWindows,
    };
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface IReviewForecastFullProps {
  userId: UserId;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ReviewForecastFull({ userId }: IReviewForecastFullProps): React.JSX.Element {
  const { data: windowsData, isLoading } = useReviewWindows(
    { userId },
    { enabled: userId !== '' }
  );

  const [expandedDate, setExpandedDate] = React.useState<string | null>(null);

  const rawWindows: any[] = (windowsData as any)?.data ?? [];
  const days = React.useMemo(() => buildDays(rawWindows), [rawWindows]);
  const maxTotal = Math.max(...days.map((d) => d.retention + d.calibration), 1);

  if (isLoading === true) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        Loading forecast…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card px-6 py-6">
      <h3 className="text-base font-semibold text-foreground">7-Day Review Forecast</h3>

      {/* Bar chart */}
      <div className="flex items-end gap-2" style={{ height: `${String(BAR_MAX_H + 24)}px` }}>
        {days.map((day) => {
          const total = day.retention + day.calibration;
          const barH = total > 0 ? Math.max(4, Math.round((total / maxTotal) * BAR_MAX_H)) : 2;
          const retH = total > 0 ? Math.round((day.retention / total) * barH) : 0;
          const calH = barH - retH;
          const isExpanded = expandedDate === day.date;

          return (
            <button
              key={day.date}
              type="button"
              onClick={() => {
                setExpandedDate((prev) => (prev === day.date ? null : day.date));
              }}
              className={[
                'flex flex-1 flex-col items-center gap-1 focus:outline-none focus:ring-2 focus:ring-ring rounded-sm',
                day.isToday ? 'ring-1 ring-synapse-400/50' : '',
              ].join(' ')}
            >
              <div
                className="flex w-full flex-col justify-end overflow-hidden rounded-sm"
                style={{ height: `${String(BAR_MAX_H)}px` }}
              >
                {retH > 0 && (
                  <div
                    className={['w-full bg-synapse-400/80 transition-all', isExpanded ? 'bg-synapse-400' : ''].join(' ')}
                    style={{ height: `${String(retH)}px` }}
                  />
                )}
                {calH > 0 && (
                  <div
                    className={['w-full bg-myelin-400/80 transition-all', isExpanded ? 'bg-myelin-400' : ''].join(' ')}
                    style={{ height: `${String(calH)}px` }}
                  />
                )}
                {total === 0 && (
                  <div className="w-full rounded-sm bg-muted" style={{ height: '2px' }} />
                )}
              </div>
              <span
                className={[
                  'text-[10px] font-medium',
                  day.isToday ? 'text-synapse-400' : 'text-muted-foreground',
                ].join(' ')}
              >
                {day.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-synapse-400" />
          Retention
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-myelin-400" />
          Calibration
        </span>
      </div>

      {/* Expanded day detail */}
      {expandedDate !== null && (() => {
        const day = days.find((d) => d.date === expandedDate);
        if (day === undefined) return null;
        return (
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">
                {formatShortDate(day.date)}{day.isToday ? ' — Today' : ''}
              </p>
              <button
                type="button"
                onClick={() => { setExpandedDate(null); }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
            {day.windows.length === 0 ? (
              <p className="text-xs text-muted-foreground">No cards due this day.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {day.windows.map((w, i) => (
                  <div
                    key={`${w.startAt}-${String(i)}`}
                    className="flex items-center justify-between rounded border border-border bg-card px-3 py-1.5 text-xs"
                  >
                    <span className="text-muted-foreground">
                      {formatTime(w.startAt)} – {formatTime(w.endAt)}
                    </span>
                    <span
                      className={[
                        'font-medium',
                        w.lane === 'retention' ? 'text-synapse-400' : 'text-myelin-400',
                      ].join(' ')}
                    >
                      {w.lane}
                    </span>
                    <span className="tabular-nums text-foreground">{String(w.cardsDue)} cards</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
```

---

### Step 3: Create `apps/web/src/components/reviews/review-windows.tsx`

Day-planner style time blocks for review window suggestions.

```tsx
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
'use client';
/**
 * @noema/web — Reviews / ReviewWindows
 *
 * Day-planner style view of today's suggested review time blocks.
 * Each block shows time range, card count, and lane.
 */
import * as React from 'react';
import { useReviewWindows } from '@noema/api-client';
import type { UserId } from '@noema/types';
import { Loader2 } from 'lucide-react';

export interface IReviewWindowsProps {
  userId: UserId;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(startAt: string, endAt: string): string {
  const diffMs = new Date(endAt).getTime() - new Date(startAt).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${String(mins)}m`;
  return `${String(Math.floor(mins / 60))}h ${String(mins % 60)}m`;
}

export function ReviewWindows({ userId }: IReviewWindowsProps): React.JSX.Element {
  const { data: windowsData, isLoading } = useReviewWindows(
    { userId },
    { enabled: userId !== '' }
  );

  const allWindows: any[] = (windowsData as any)?.data ?? [];

  // Only show today's windows
  const today = new Date();
  const todayStr = [
    String(today.getFullYear()),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');

  const todayWindows = React.useMemo(
    () =>
      allWindows.filter((w) => {
        const d = new Date(String(w.startAt));
        const ds = [
          String(d.getFullYear()),
          String(d.getMonth() + 1).padStart(2, '0'),
          String(d.getDate()).padStart(2, '0'),
        ].join('-');
        return ds === todayStr;
      }),
    [allWindows, todayStr]
  );

  if (isLoading === true) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        Loading review windows…
      </div>
    );
  }

  if (todayWindows.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-8 text-sm text-muted-foreground">
        No review windows suggested for today.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card px-6 py-6">
      <div>
        <h3 className="text-base font-semibold text-foreground">Suggested Review Windows</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Advisory time blocks — suggestions, not appointments.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {todayWindows.map((w, i) => {
          const lane = String(w.lane) as 'retention' | 'calibration';
          const loadScore: number = (w.loadScore as number | undefined) ?? 0;
          const cardsDue: number = (w.cardsDue as number | undefined) ?? 0;

          return (
            <div
              key={`${String(w.startAt)}-${String(i)}`}
              className={[
                'flex items-center gap-4 rounded-lg border border-dashed px-4 py-3',
                lane === 'retention'
                  ? 'border-synapse-400/40 bg-synapse-400/5'
                  : 'border-myelin-400/40 bg-myelin-400/5',
              ].join(' ')}
            >
              {/* Time range */}
              <div className="min-w-[90px]">
                <p className="text-sm font-medium text-foreground tabular-nums">
                  {formatTime(String(w.startAt))}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDuration(String(w.startAt), String(w.endAt))}
                </p>
              </div>

              {/* Lane badge */}
              <span
                className={[
                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                  lane === 'retention'
                    ? 'bg-synapse-400/15 text-synapse-400'
                    : 'bg-myelin-400/15 text-myelin-400',
                ].join(' ')}
              >
                {lane}
              </span>

              {/* Card count */}
              <span className="flex-1 text-sm text-muted-foreground">
                {String(cardsDue)} {cardsDue === 1 ? 'card' : 'cards'}
              </span>

              {/* Load indicator */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                  <div
                    className={[
                      'h-full rounded-full transition-all',
                      lane === 'retention' ? 'bg-synapse-400' : 'bg-myelin-400',
                    ].join(' ')}
                    style={{ width: `${String(Math.round(loadScore * 100))}%` }}
                  />
                </div>
                <span>{String(Math.round(loadScore * 100))}% load</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

---

### Step 4: Create `apps/web/src/app/(authenticated)/reviews/page.tsx`

```tsx
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
'use client';
/**
 * @noema/web — /reviews
 *
 * Reviews Dashboard (Schedule Intelligence):
 *   1. Today's Plan — dual-lane split bar + Start CTA
 *   2. 7-Day Review Forecast — expandable bar chart
 *   3. Review Windows — day-planner time blocks
 *   4. Scheduling Simulator trigger button
 */
import * as React from 'react';
import { useAuth } from '@noema/auth';
import type { UserId } from '@noema/types';
import { TodaysPlan } from '@/components/reviews/todays-plan';
import { ReviewForecastFull } from '@/components/reviews/review-forecast-full';
import { ReviewWindows } from '@/components/reviews/review-windows';
import { SchedulingSimulator } from '@/components/reviews/scheduling-simulator';

export default function ReviewsPage(): React.JSX.Element {
  const { user } = useAuth();
  const userId = (user?.id ?? '') as UserId;
  const [showSimulator, setShowSimulator] = React.useState(false);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Reviews</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your personalized review schedule and forecasts.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setShowSimulator((prev) => !prev); }}
          className={[
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-ring',
            showSimulator
              ? 'bg-primary text-primary-foreground'
              : 'border border-border bg-background text-foreground hover:bg-muted',
          ].join(' ')}
        >
          {showSimulator ? 'Hide Simulator' : 'Simulate'}
        </button>
      </div>

      {/* Section 1 — Today's Plan */}
      <section aria-label="Today's plan">
        <TodaysPlan userId={userId} />
      </section>

      {/* Section 2 — 7-Day Forecast */}
      <section aria-label="7-day review forecast">
        <ReviewForecastFull userId={userId} />
      </section>

      {/* Section 3 — Review Windows */}
      <section aria-label="Suggested review windows">
        <ReviewWindows userId={userId} />
      </section>

      {/* Section 4 — Scheduling Simulator (toggle) */}
      {showSimulator && (
        <section aria-label="Scheduling simulator">
          <SchedulingSimulator userId={userId} />
        </section>
      )}
    </div>
  );
}
```

---

### Step 5: Verify typecheck

```bash
pnpm --filter @noema/web typecheck 2>&1 | grep -v "Cannot find module '@noema"
```

Expected: no new errors from reviews/ or components/reviews/ files.

---

### Step 6: Commit

```bash
git add "apps/web/src/app/(authenticated)/reviews/" apps/web/src/components/reviews/todays-plan.tsx apps/web/src/components/reviews/review-forecast-full.tsx apps/web/src/components/reviews/review-windows.tsx
git commit -m "feat(web): T9.1 — Reviews Dashboard, TodaysPlan, ReviewForecastFull, ReviewWindows"
```

---

## Task T9.2 — Card Schedule Inspector

**Goal:** Build a reusable `CardScheduleInspector` slide-out panel showing FSRS parameters, HLR prediction, review history timeline, and calibration data for any card.

**Files:**
- Create: `apps/web/src/components/reviews/recall-timeline.tsx`
- Create: `apps/web/src/components/reviews/calibration-chart.tsx`
- Create: `apps/web/src/components/reviews/card-schedule-inspector.tsx`

---

### Step 1: Create `apps/web/src/components/reviews/recall-timeline.tsx`

```tsx
'use client';
/**
 * @noema/web — Reviews / RecallTimeline
 *
 * Timeline of past reviews for a card.
 * Each dot: date, grade, colored by result.
 */
import * as React from 'react';

export interface IReviewEvent {
  date: string;
  grade: number;     // 1=Again, 2=Hard, 3=Good, 4=Easy
  responseTimeMs?: number | null;
}

export interface IRecallTimelineProps {
  events: IReviewEvent[];
}

const GRADE_COLOR: Record<number, string> = {
  1: 'bg-cortex-400',
  2: 'bg-amber-400',
  3: 'bg-synapse-400',
  4: 'bg-neuron-400',
};

const GRADE_LABEL: Record<number, string> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function RecallTimeline({ events }: IRecallTimelineProps): React.JSX.Element {
  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-6 text-xs text-muted-foreground">
        No review history yet.
      </div>
    );
  }

  return (
    <div className="relative" aria-label="Review history timeline">
      {/* Connector line */}
      <div className="absolute left-2 top-3 bottom-3 w-px bg-border" aria-hidden="true" />

      <ol className="flex flex-col gap-2.5">
        {events.map((ev, i) => {
          const dotColor = GRADE_COLOR[ev.grade] ?? 'bg-muted';
          const gradeLabel = GRADE_LABEL[ev.grade] ?? String(ev.grade);

          return (
            <li key={`${ev.date}-${String(i)}`} className="flex items-start gap-3 pl-1">
              {/* Dot */}
              <span
                className={['mt-1 h-3 w-3 flex-shrink-0 rounded-full border-2 border-background', dotColor].join(' ')}
                title={gradeLabel}
              />
              {/* Content */}
              <div className="flex flex-1 items-center justify-between text-xs">
                <span className="text-muted-foreground">{formatDate(ev.date)}</span>
                <span
                  className={[
                    'font-medium',
                    ev.grade <= 1
                      ? 'text-cortex-400'
                      : ev.grade === 2
                        ? 'text-amber-500'
                        : ev.grade === 3
                          ? 'text-synapse-400'
                          : 'text-neuron-400',
                  ].join(' ')}
                >
                  {gradeLabel}
                </span>
                {ev.responseTimeMs !== null && ev.responseTimeMs !== undefined && (
                  <span className="text-muted-foreground tabular-nums">
                    {String(Math.round(ev.responseTimeMs / 1000))}s
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
```

---

### Step 2: Create `apps/web/src/components/reviews/calibration-chart.tsx`

Mini scatter plot: predicted confidence vs actual grade outcome.

```tsx
'use client';
/**
 * @noema/web — Reviews / CalibrationChart
 *
 * Scatter plot: predicted confidence (x) vs actual grade outcome (y).
 * Pure SVG, no external charting library.
 */
import * as React from 'react';

export interface ICalibrationPoint {
  predictedConfidence: number;  // 0–1
  actualGrade: number;           // 1–4
}

export interface ICalibrationChartProps {
  points: ICalibrationPoint[];
  size?: number;
}

export function CalibrationChart({
  points,
  size = 200,
}: ICalibrationChartProps): React.JSX.Element {
  const PAD = 28;
  const innerSize = size - PAD * 2;

  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground"
        style={{ width: `${String(size)}px`, height: `${String(size)}px` }}
      >
        No calibration data
      </div>
    );
  }

  // Grade 1–4 mapped to y 0–1 (inverted: 4=top)
  const gradeToY = (grade: number): number =>
    PAD + innerSize - ((grade - 1) / 3) * innerSize;

  const confidenceToX = (conf: number): number => PAD + conf * innerSize;

  return (
    <svg
      width={size}
      height={size}
      aria-label="Calibration chart: predicted confidence vs actual grade"
      role="img"
      overflow="visible"
    >
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line
            x1={confidenceToX(v)}
            y1={PAD}
            x2={confidenceToX(v)}
            y2={PAD + innerSize}
            stroke="currentColor"
            strokeOpacity={0.1}
            strokeWidth={1}
            className="text-muted-foreground"
          />
          <text
            x={confidenceToX(v)}
            y={PAD + innerSize + 14}
            textAnchor="middle"
            fontSize={9}
            fill="currentColor"
            className="text-muted-foreground"
          >
            {String(Math.round(v * 100))}%
          </text>
        </g>
      ))}
      {[1, 2, 3, 4].map((grade) => (
        <g key={grade}>
          <line
            x1={PAD}
            y1={gradeToY(grade)}
            x2={PAD + innerSize}
            y2={gradeToY(grade)}
            stroke="currentColor"
            strokeOpacity={0.1}
            strokeWidth={1}
            className="text-muted-foreground"
          />
          <text
            x={PAD - 4}
            y={gradeToY(grade) + 3}
            textAnchor="end"
            fontSize={9}
            fill="currentColor"
            className="text-muted-foreground"
          >
            {grade === 1 ? 'Again' : grade === 2 ? 'Hard' : grade === 3 ? 'Good' : 'Easy'}
          </text>
        </g>
      ))}

      {/* Ideal diagonal reference line */}
      <line
        x1={confidenceToX(0)}
        y1={gradeToY(1)}
        x2={confidenceToX(1)}
        y2={gradeToY(4)}
        stroke="currentColor"
        strokeOpacity={0.2}
        strokeWidth={1}
        strokeDasharray="4 3"
        className="text-muted-foreground"
      />

      {/* Points */}
      {points.map((pt, i) => (
        <circle
          key={i}
          cx={confidenceToX(pt.predictedConfidence)}
          cy={gradeToY(pt.actualGrade)}
          r={4}
          className={
            pt.actualGrade >= 3
              ? 'fill-synapse-400/70 stroke-synapse-400'
              : 'fill-cortex-400/70 stroke-cortex-400'
          }
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}
```

---

### Step 3: Create `apps/web/src/components/reviews/card-schedule-inspector.tsx`

```tsx
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
'use client';
/**
 * @noema/web — Reviews / CardScheduleInspector
 *
 * Slide-out panel showing per-card scheduling details:
 *   - Algorithm + learning state chips
 *   - FSRS: stability, difficulty, interval, recall probability (NeuralGauge)
 *   - HLR: half-life, recall probability (NeuralGauge)
 *   - Review history timeline
 *   - Calibration scatter chart
 */
import * as React from 'react';
import { useAuth } from '@noema/auth';
import { useSchedulerCard, useHLRPredict } from '@noema/api-client';
import type { UserId, CardId } from '@noema/types';
import { NeuralGauge, StateChip } from '@noema/ui';
import { Loader2, X } from 'lucide-react';
import { RecallTimeline } from '@/components/reviews/recall-timeline';
import type { IReviewEvent } from '@/components/reviews/recall-timeline';
import { CalibrationChart } from '@/components/reviews/calibration-chart';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ICardScheduleInspectorProps {
  cardId: string;
  onClose: () => void;
}

// ── Algorithm state chip colors ──────────────────────────────────────────────

const ALGO_COLORS: Record<string, string> = {
  fsrs: 'bg-synapse-400/15 text-synapse-400',
  hlr: 'bg-myelin-400/15 text-myelin-400',
  sm2: 'bg-neuron-400/15 text-neuron-400',
};

const STATE_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  learning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  review: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  relearning: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
};

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Component ────────────────────────────────────────────────────────────────

export function CardScheduleInspector({
  cardId,
  onClose,
}: ICardScheduleInspectorProps): React.JSX.Element {
  const { user } = useAuth();
  const userId = (user?.id ?? '') as UserId;

  const { data: cardData, isLoading: cardLoading } = useSchedulerCard(
    cardId as CardId,
    { enabled: cardId !== '' }
  );

  const { data: hlrData, isLoading: hlrLoading } = useHLRPredict(
    { userId, cardId },
    { enabled: userId !== '' && cardId !== '' }
  );

  const card: any = (cardData as any)?.card ?? null;
  const hlr: any = hlrData ?? null;

  const algorithm: string = String(card?.schedulingAlgorithm ?? '—');
  const state: string = String(card?.state ?? '').toLowerCase();
  const stability: number | null = (card?.stability as number | null) ?? null;
  const difficulty: number | null = (card?.difficulty as number | null) ?? null;
  const nextReviewDate: string | null = (card?.nextReviewDate as string | null) ?? null;
  const reviewCount: number = (card?.reviewCount as number | undefined) ?? 0;
  const lapseCount: number = (card?.lapseCount as number | undefined) ?? 0;

  const hlrRecall: number = (hlr?.recallProbability as number | undefined) ?? 0;
  const hlrHalfLife: number = (hlr?.halfLifeDays as number | undefined) ?? 0;

  // Mock review history from reviewCount — real data would come from a per-card attempts API
  // For now, show count and a placeholder empty timeline
  const reviewEvents: IReviewEvent[] = [];

  // Escape key closes
  React.useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => { window.removeEventListener('keydown', handler); };
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col overflow-y-auto border-l border-border bg-card shadow-2xl"
        aria-label="Card schedule inspector"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Card Schedule</p>
            <p className="font-mono text-xs text-muted-foreground">{cardId.slice(0, 12)}…</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close inspector"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Loading */}
        {(cardLoading === true || hlrLoading === true) && (
          <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Loading schedule data…
          </div>
        )}

        {/* Content */}
        {cardLoading !== true && (
          <div className="flex flex-col gap-6 p-4">

            {/* Algorithm + State chips */}
            <div className="flex flex-wrap gap-2">
              {algorithm !== '—' && (
                <span
                  className={[
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide',
                    ALGO_COLORS[algorithm] ?? 'bg-muted text-muted-foreground',
                  ].join(' ')}
                >
                  {algorithm}
                </span>
              )}
              {state !== '' && state !== '—' && (
                <span
                  className={[
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                    STATE_COLORS[state] ?? 'bg-muted text-muted-foreground',
                  ].join(' ')}
                >
                  {state}
                </span>
              )}
            </div>

            {/* FSRS Parameters */}
            {(algorithm === 'fsrs' || algorithm === 'sm2') && (
              <div className="flex flex-col gap-3">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  FSRS Parameters
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Stability</p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
                      {stability !== null ? stability.toFixed(1) : '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">days</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Difficulty</p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
                      {difficulty !== null ? difficulty.toFixed(2) : '—'}
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Next Review</p>
                  <p className="mt-0.5 text-sm font-medium text-foreground">
                    {formatDate(nextReviewDate)}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <p className="mb-1 text-xs text-muted-foreground">Review Count</p>
                    <p className="text-sm font-semibold text-foreground">{String(reviewCount)}</p>
                  </div>
                  <div className="flex-1">
                    <p className="mb-1 text-xs text-muted-foreground">Lapses</p>
                    <p className="text-sm font-semibold text-foreground">{String(lapseCount)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* HLR Parameters */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                HLR Prediction
              </h3>
              {hlrLoading === true ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Loading HLR…
                </div>
              ) : (
                <div className="flex items-center gap-6">
                  <NeuralGauge value={hlrRecall} size="md" />
                  <div>
                    <p className="text-xs text-muted-foreground">Recall probability</p>
                    <p className="text-2xl font-bold tabular-nums text-foreground">
                      {String(Math.round(hlrRecall * 100))}%
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Half-life:{' '}
                      <span className="font-medium text-foreground">
                        {hlrHalfLife > 0 ? `${hlrHalfLife.toFixed(1)} days` : '—'}
                      </span>
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Review History */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Review History ({String(reviewCount)} reviews)
              </h3>
              <RecallTimeline events={reviewEvents} />
            </div>

            {/* Calibration chart */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Calibration
              </h3>
              <p className="text-xs text-muted-foreground">
                Predicted confidence vs actual grade outcome.
              </p>
              <CalibrationChart points={[]} />
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
```

---

### Step 4: Verify typecheck

```bash
pnpm --filter @noema/web typecheck 2>&1 | grep -v "Cannot find module '@noema"
```

Expected: no new errors from `recall-timeline.tsx`, `calibration-chart.tsx`, or `card-schedule-inspector.tsx`.

---

### Step 5: Commit

```bash
git add apps/web/src/components/reviews/recall-timeline.tsx apps/web/src/components/reviews/calibration-chart.tsx apps/web/src/components/reviews/card-schedule-inspector.tsx
git commit -m "feat(web): T9.2 — CardScheduleInspector, RecallTimeline, CalibrationChart"
```

---

## Task T9.3 — Scheduling Simulator

**Goal:** Build `SchedulingSimulator` — a what-if tool that accepts session duration + lane filter, calls `useSimulateSession()`, and renders the simulated results.

**Note on API alignment:** The spec describes complex parameter controls (lane mix %, max reviews, target retention, algorithm selector) but the actual API (`ISimulationInput`) accepts `sessionDurationMinutes` + optional `lane`. The simulator is designed around the real API surface.

**Files:**
- Create: `apps/web/src/components/reviews/scheduling-simulator.tsx`

---

### Step 1: Create `apps/web/src/components/reviews/scheduling-simulator.tsx`

```tsx
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
'use client';
/**
 * @noema/web — Reviews / SchedulingSimulator
 *
 * What-if simulation tool.
 * Controls: session duration (min), lane filter.
 * Results: simulated card list, projected retention gain, estimated duration.
 */
import * as React from 'react';
import { useSimulateSession } from '@noema/api-client';
import type { UserId } from '@noema/types';
import { Button } from '@noema/ui';
import { Loader2, FlaskConical } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ISchedulingSimulatorProps {
  userId: UserId;
}

type LaneFilter = 'all' | 'retention' | 'calibration';

const DURATION_OPTIONS = [15, 30, 45, 60, 90] as const;

// ── Component ────────────────────────────────────────────────────────────────

export function SchedulingSimulator({ userId }: ISchedulingSimulatorProps): React.JSX.Element {
  const [durationMinutes, setDurationMinutes] = React.useState<number>(30);
  const [lane, setLane] = React.useState<LaneFilter>('all');
  const [result, setResult] = React.useState<any>(null);

  const simulate = useSimulateSession();

  const handleRun = React.useCallback(async (): Promise<void> => {
    const response: any = await simulate.mutateAsync({
      userId,
      sessionDurationMinutes: durationMinutes,
      ...(lane !== 'all' ? { lane } : {}),
    });
    setResult((response as any)?.data ?? null);
  }, [simulate, userId, durationMinutes, lane]);

  const simulatedCards: any[] = (result?.simulatedCards as any[] | undefined) ?? [];
  const retentionGain: number = (result?.projectedRetentionGain as number | undefined) ?? 0;
  const estimatedMinutes: number = (result?.estimatedDurationMinutes as number | undefined) ?? 0;

  const retentionCards = simulatedCards.filter((c) => String(c.lane) === 'retention');
  const calibrationCards = simulatedCards.filter((c) => String(c.lane) === 'calibration');

  return (
    <div className="flex flex-col gap-6 rounded-xl border border-border bg-card px-6 py-6">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-base font-semibold text-foreground">Scheduling Simulator</h3>
        <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
          What-if
        </span>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        {/* Duration */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Session Duration</label>
          <div className="flex gap-1">
            {DURATION_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => { setDurationMinutes(d); }}
                className={[
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-ring',
                  durationMinutes === d
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-background text-foreground hover:bg-muted',
                ].join(' ')}
              >
                {String(d)}m
              </button>
            ))}
          </div>
        </div>

        {/* Lane filter */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Lane</label>
          <div className="flex gap-1">
            {(['all', 'retention', 'calibration'] as LaneFilter[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => { setLane(l); }}
                className={[
                  'rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-ring',
                  lane === l
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-background text-foreground hover:bg-muted',
                ].join(' ')}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Run button */}
        <Button
          onClick={() => { void handleRun(); }}
          disabled={simulate.isPending === true || userId === ''}
          className="gap-1.5"
        >
          {simulate.isPending === true ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <FlaskConical className="h-4 w-4" aria-hidden="true" />
          )}
          Run Simulation
        </Button>
      </div>

      {/* Results */}
      {result !== null && (
        <div className="flex flex-col gap-4">
          <div className="h-px bg-border" />

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
              <p className="text-xs text-muted-foreground">Total Cards</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground">
                {String(simulatedCards.length)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
              <p className="text-xs text-muted-foreground">Retention Gain</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-synapse-400">
                +{String(Math.round(retentionGain * 100))}%
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
              <p className="text-xs text-muted-foreground">Est. Duration</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground">
                {String(estimatedMinutes)}m
              </p>
            </div>
          </div>

          {/* Lane breakdown */}
          {simulatedCards.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Lane Breakdown
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-lg border border-synapse-400/20 bg-synapse-400/5 px-3 py-2">
                  <span className="text-xs text-synapse-400 font-medium">Retention</span>
                  <span className="text-sm font-bold tabular-nums text-foreground">
                    {String(retentionCards.length)} cards
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-myelin-400/20 bg-myelin-400/5 px-3 py-2">
                  <span className="text-xs text-myelin-400 font-medium">Calibration</span>
                  <span className="text-sm font-bold tabular-nums text-foreground">
                    {String(calibrationCards.length)} cards
                  </span>
                </div>
              </div>
            </div>
          )}

          {simulatedCards.length === 0 && (
            <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-8 text-sm text-muted-foreground">
              No cards would be reviewed with these parameters.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

---

### Step 2: Verify typecheck

```bash
pnpm --filter @noema/web typecheck 2>&1 | grep -v "Cannot find module '@noema"
```

Expected: no new errors from `scheduling-simulator.tsx`.

---

### Step 3: Commit

```bash
git add apps/web/src/components/reviews/scheduling-simulator.tsx
git commit -m "feat(web): T9.3 — SchedulingSimulator what-if tool"
```

---

## Task T9.4 — Sidebar Navigation Update

**Goal:** Add "Reviews" to the Learning nav group in the authenticated layout, positioned between "Study Sessions" and "Knowledge Map".

**Files:**
- Modify: `apps/web/src/app/(authenticated)/layout.tsx`

---

### Step 1: Read current layout

Read `apps/web/src/app/(authenticated)/layout.tsx` to see the current nav items.

Current Learning group (as of Phase 08 merge):
```tsx
{ href: '/learning', label: 'Study Sessions', icon: BookOpen },
{ href: '/knowledge', label: 'Knowledge Map', icon: Brain },
{ href: '/knowledge/health', label: 'KG Health', icon: Activity },
{ href: '/knowledge/misconceptions', label: 'Misconceptions', icon: AlertTriangle },
{ href: '/knowledge/comparison', label: 'KG Comparison', icon: GitCompare },
{ href: '/goals', label: 'Goals', icon: Target },
{ href: '/sessions', label: 'Sessions', icon: ClipboardList },
{ href: '/cards', label: 'Card Library', icon: LibraryBig },
```

---

### Step 2: Add `CalendarClock` to lucide imports

In the lucide-react import block, add `CalendarClock`.

---

### Step 3: Insert Reviews nav item

Add `{ href: '/reviews', label: 'Reviews', icon: CalendarClock }` between `Study Sessions` and `Knowledge Map`:

```tsx
{ href: '/learning', label: 'Study Sessions', icon: BookOpen },
{ href: '/reviews', label: 'Reviews', icon: CalendarClock },
{ href: '/knowledge', label: 'Knowledge Map', icon: Brain },
```

---

### Step 4: Verify typecheck

```bash
pnpm --filter @noema/web typecheck 2>&1 | grep -v "Cannot find module '@noema"
```

Expected: no new errors.

---

### Step 5: Commit

```bash
git add "apps/web/src/app/(authenticated)/layout.tsx"
git commit -m "feat(web): T9.4 — add Reviews to sidebar nav"
```

---

## Final Step: Phase 09 Completion

After all 4 tasks pass typecheck:

```bash
# Full typecheck
pnpm --filter @noema/web typecheck 2>&1 | grep -v "Cannot find module '@noema"

# Use finishing-a-development-branch skill
```
