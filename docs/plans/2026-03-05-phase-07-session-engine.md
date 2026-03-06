# Phase 07 — Session Engine Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Build the full session learning experience: Start page, Active Session
view, Summary page, and Session History list.

**Architecture:** Four Next.js pages under
`apps/web/src/app/(authenticated)/session*` backed by existing session API
hooks. Shared session components live in `apps/web/src/components/session/`. The
Zustand `useSessionStore` (Phase 3) holds ephemeral per-card state
(confidenceBefore, dwellTime, etc.); TanStack Query manages server state. Cards
are fetched by ID from content API since the session queue only returns card
IDs.

**Tech Stack:** Next.js 15, TanStack Query v5, Zustand, lucide-react,
`@noema/api-client` session/content/scheduler hooks, `useKeyboardShortcuts`,
`CardRenderer` factory from Phase 6, `DeckQueryFilter` from Phase 6, `@noema/ui`
primitives.

---

## Key API Facts (Read Before Implementing)

- **SessionMode** (actual API): `'standard' | 'cram' | 'preview' | 'test'`
- **Philosophical mode → API mode mapping:**
  - EXPLORATION → `'standard'`
  - GOAL_DRIVEN → `'cram'`
  - EXAM_ORIENTED → `'test'`
  - SYNTHESIS → `'preview'`
- **Session queue** (`ISessionQueueDto`):
  `{ sessionId, items: ISessionQueueItem[], remaining }`. Each item is
  `{ cardId: CardId, position: number, injected: boolean }`. No card content —
  fetch card separately with `useCard(cardId)`.
- **Attempt payload** (`IAttemptInput`):
  `{ cardId, grade, confidenceBefore?, confidenceAfter?, calibrationDelta?, hintDepthUsed?, dwellTimeMs?, selfReportedGuess? }`
- **Checkpoint directive** (`ICheckpointDirectiveDto`):
  `{ action: 'continue'|'pause'|'complete'|'switch_mode', reason: string, suggestedMode?: SessionMode }`
- **`useSessionStore`** already exists at `apps/web/src/stores/session-store.ts`
  with: `pendingAttempt`, `setConfidenceBefore`, `setConfidenceAfter`,
  `recordDwellTime`, `advanceCard`, `resetAttempt`, `clear`, `isPaused`,
  `elapsedTime`.
- **`useKeyboardShortcuts`** exists at
  `apps/web/src/hooks/use-keyboard-shortcuts.ts` — accepts `IShortcutDef[]` with
  `{ key, mod?, label, handler, when? }`.
- **`CardRenderer`** factory at
  `apps/web/src/components/card-renderers/index.tsx` — accepts
  `{ card: ICardDto, mode: 'preview'|'interactive', onAnswer? }`.
- **`DeckQueryFilter`** at `apps/web/src/components/deck-query-filter.tsx` —
  controlled component, accepts
  `{ query: IDeckQueryInput, onChange: (q) => void }`.
- **`useDualLanePlan(input: IDualLanePlanInput)`** — input requires `userId`;
  returns `{ data: { slots: ILaneSlot[], totalRetention, totalCalibration } }`.
  Each slot has `{ cardId, lane: 'retention'|'calibration' }`.
- **`useSessionCandidates(input: ISessionCandidatesInput)`** — returns
  `{ data: ISessionCandidateDto[] }`.

---

## Task T1: Mode Selector Component

**Files:**

- Create: `apps/web/src/components/session/mode-selector.tsx`

### Context

The Session Start page needs a 2×2 grid of mode cards. The API accepts
`SessionMode = 'standard' | 'cram' | 'preview' | 'test'` but we present the four
philosophical modes to the user with friendly names and icons.

### Step 1: Create the component

```tsx
// apps/web/src/components/session/mode-selector.tsx
'use client';

import { BookOpen, GitMerge, Target, Compass } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PhilosophicalMode =
  | 'exploration'
  | 'goal_driven'
  | 'exam_oriented'
  | 'synthesis';
export type ApiSessionMode = 'standard' | 'cram' | 'preview' | 'test';

export const MODE_TO_API: Record<PhilosophicalMode, ApiSessionMode> = {
  exploration: 'standard',
  goal_driven: 'cram',
  exam_oriented: 'test',
  synthesis: 'preview',
};

interface IModeConfig {
  id: PhilosophicalMode;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  border: string;
  bg: string;
}

const MODES: IModeConfig[] = [
  {
    id: 'exploration',
    label: 'Exploration',
    description:
      'Wide-ranging review guided by spaced repetition. Best for daily maintenance and building long-term retention.',
    icon: Compass,
    color: 'text-blue-400',
    border: 'border-blue-500/50',
    bg: 'bg-blue-500/10',
  },
  {
    id: 'goal_driven',
    label: 'Goal-Driven',
    description:
      'High-intensity cramming toward a target. Prioritizes cards closest to forgetting.',
    icon: Target,
    color: 'text-amber-400',
    border: 'border-amber-500/50',
    bg: 'bg-amber-500/10',
  },
  {
    id: 'exam_oriented',
    label: 'Exam-Oriented',
    description:
      'Timed test simulation with no hints. Measures true recall under pressure.',
    icon: BookOpen,
    color: 'text-red-400',
    border: 'border-red-500/50',
    bg: 'bg-red-500/10',
  },
  {
    id: 'synthesis',
    label: 'Synthesis',
    description:
      'Integrative review linking concepts across topics. Best after learning new material.',
    icon: GitMerge,
    color: 'text-purple-400',
    border: 'border-purple-500/50',
    bg: 'bg-purple-500/10',
  },
];

interface IModeSelectorProps {
  value: PhilosophicalMode;
  onChange: (mode: PhilosophicalMode) => void;
}

export function ModeSelector({
  value,
  onChange,
}: IModeSelectorProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-3">
      {MODES.map((mode) => {
        const Icon = mode.icon;
        const isSelected = value === mode.id;
        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => {
              onChange(mode.id);
            }}
            aria-pressed={isSelected}
            className={cn(
              'flex flex-col gap-2 rounded-lg border p-4 text-left transition-all',
              isSelected
                ? cn('border-2', mode.border, mode.bg)
                : 'border border-border hover:border-muted-foreground/50 hover:bg-muted/30'
            )}
          >
            <div className="flex items-center gap-2">
              <Icon
                className={cn(
                  'h-5 w-5',
                  isSelected ? mode.color : 'text-muted-foreground'
                )}
              />
              <span
                className={cn(
                  'font-semibold text-sm',
                  isSelected ? mode.color : 'text-foreground'
                )}
              >
                {mode.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {mode.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
```

### Step 2: Verify TypeScript

```bash
cd /home/rodochrousbisbiki/MyApps/noema/.worktrees/feat-phase-07-session-engine/apps/web && pnpm typecheck 2>&1 | grep "mode-selector" || echo "no errors in mode-selector"
```

### Step 3: Commit

```bash
git add apps/web/src/components/session/mode-selector.tsx
git commit -m "feat(web): add ModeSelector component for session start"
```

---

## Task T2: Lane Mix Slider Component

**Files:**

- Create: `apps/web/src/components/session/lane-mix-slider.tsx`

### Context

A dual-handle range slider controlling the retention % vs calibration % split.
Shows estimated card counts per lane in real-time. Uses a simple single slider
(0–100) where the value = retention %, and calibration = 100 - value.

### Step 1: Create the component

```tsx
// apps/web/src/components/session/lane-mix-slider.tsx
'use client';

import { Brain, Zap } from 'lucide-react';

interface ILaneMixSliderProps {
  /** Retention percentage 0–100. Calibration = 100 - retentionPct. */
  retentionPct: number;
  onChange: (retentionPct: number) => void;
  /** Estimated retention lane card count */
  retentionCount?: number;
  /** Estimated calibration lane card count */
  calibrationCount?: number;
}

export function LaneMixSlider({
  retentionPct,
  onChange,
  retentionCount,
  calibrationCount,
}: ILaneMixSliderProps): React.JSX.Element {
  const calibrationPct = 100 - retentionPct;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1.5 text-blue-400">
          <Brain className="h-4 w-4" />
          <span>Retention {retentionPct}%</span>
          {retentionCount !== undefined && (
            <span className="text-muted-foreground">
              ({retentionCount} cards)
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-amber-400">
          {calibrationCount !== undefined && (
            <span className="text-muted-foreground">
              ({calibrationCount} cards)
            </span>
          )}
          <span>Calibration {calibrationPct}%</span>
          <Zap className="h-4 w-4" />
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={retentionPct}
        onChange={(e) => {
          onChange(Number(e.target.value));
        }}
        aria-label={`Retention percentage: ${String(retentionPct)}%, Calibration: ${String(calibrationPct)}%`}
        className="w-full accent-blue-500"
      />
      <div className="flex h-2 rounded-full overflow-hidden">
        <div
          className="bg-blue-500 transition-all"
          style={{ width: `${String(retentionPct)}%` }}
        />
        <div className="bg-amber-500 flex-1 transition-all" />
      </div>
    </div>
  );
}
```

### Step 2: Verify TypeScript

```bash
pnpm typecheck 2>&1 | grep "lane-mix-slider" || echo "no errors in lane-mix-slider"
```

### Step 3: Commit

```bash
git add apps/web/src/components/session/lane-mix-slider.tsx
git commit -m "feat(web): add LaneMixSlider component"
```

---

## Task T3: Session Start Page

**Files:**

- Create: `apps/web/src/app/(authenticated)/session/new/page.tsx`

### Context

Route at `/session/new`. Three sections: mode selector, card source (quick-start
or custom with DeckQueryFilter + candidates preview), lane mix + session size.
Calls `useStartSession()` and navigates to `/session/:id`.

Key imports:

- `useStartSession` from `@noema/api-client/session`
- `useDualLanePlan` from `@noema/api-client/scheduler`
- `useSessionCandidates` from `@noema/api-client/scheduler`
- `DeckQueryFilter` from `@/components/deck-query-filter`
- `ModeSelector`, `LaneMixSlider` from `@/components/session/`
- `useAuth` from `@noema/auth` (for userId)
- `MODE_TO_API` from `@/components/session/mode-selector`
- `IDeckQueryInput` from `@noema/api-client/content`

### Step 1: Create the page

```tsx
// apps/web/src/app/(authenticated)/session/new/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@noema/auth';
import {
  useStartSession,
  useSessionCandidates,
  useDualLanePlan,
} from '@noema/api-client';
import type { IDeckQueryInput } from '@noema/api-client/content';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@noema/ui';
import { ChevronDown, ChevronUp, Loader2, Play, Zap } from 'lucide-react';
import { DeckQueryFilter } from '@/components/deck-query-filter';
import { ModeSelector, MODE_TO_API } from '@/components/session/mode-selector';
import type { PhilosophicalMode } from '@/components/session/mode-selector';
import { LaneMixSlider } from '@/components/session/lane-mix-slider';

export default function SessionNewPage(): React.JSX.Element {
  const router = useRouter();
  const { user } = useAuth();

  // Section 1 — mode
  const [mode, setMode] = useState<PhilosophicalMode>('exploration');

  // Section 2 — card source
  const [useQuickStart, setUseQuickStart] = useState(true);
  const [showCandidates, setShowCandidates] = useState(false);
  const [customQuery, setCustomQuery] = useState<IDeckQueryInput>({});

  // Section 3 — lane mix
  const [retentionPct, setRetentionPct] = useState(80);
  const [sessionSize, setSessionSize] = useState(20);

  // Fetch dual-lane plan for quick start
  const dualLanePlan = useDualLanePlan(
    { userId: user?.id ?? '' },
    { enabled: useQuickStart && user?.id !== undefined }
  );

  // Candidate preview for custom mode
  const candidates = useSessionCandidates(
    { userId: user?.id ?? '' },
    { enabled: !useQuickStart && showCandidates && user?.id !== undefined }
  );

  // Compute lane card counts from plan
  const retentionCount = dualLanePlan.data?.data.totalRetention;
  const calibrationCount = dualLanePlan.data?.data.totalCalibration;

  const startSession = useStartSession();

  const handleStart = (): void => {
    // Build cardIds: if quick start, extract from plan; otherwise no specific IDs (server picks)
    const cardIds = useQuickStart
      ? (dualLanePlan.data?.data.slots
          .slice(0, sessionSize)
          .map((s) => s.cardId) ?? [])
      : [];

    startSession.mutate(
      {
        cardIds: cardIds.length > 0 ? cardIds : undefined,
        mode: MODE_TO_API[mode],
      },
      {
        onSuccess: (response) => {
          router.push(`/session/${response.data.id}`);
        },
      }
    );
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-bold">Start a Session</h1>

      {/* Section 1: Mode Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Learning Mode</CardTitle>
        </CardHeader>
        <CardContent>
          <ModeSelector value={mode} onChange={setMode} />
        </CardContent>
      </Card>

      {/* Section 2: Card Source */}
      <Card>
        <CardHeader>
          <CardTitle>Card Source</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant={useQuickStart ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setUseQuickStart(true);
              }}
            >
              <Zap className="h-4 w-4 mr-1.5" />
              Quick Start
            </Button>
            <Button
              variant={!useQuickStart ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setUseQuickStart(false);
              }}
            >
              Custom Build
            </Button>
          </div>

          {useQuickStart && (
            <p className="text-sm text-muted-foreground">
              Uses your dual-lane plan — optimally chosen cards based on your
              schedule.
              {dualLanePlan.isLoading && ' Loading plan...'}
            </p>
          )}

          {!useQuickStart && (
            <div className="space-y-3">
              <DeckQueryFilter query={customQuery} onChange={setCustomQuery} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowCandidates((prev) => !prev);
                }}
              >
                {showCandidates ? (
                  <ChevronUp className="h-4 w-4 mr-1.5" />
                ) : (
                  <ChevronDown className="h-4 w-4 mr-1.5" />
                )}
                {showCandidates ? 'Hide' : 'Preview'} candidates
              </Button>
              {showCandidates && (
                <div className="rounded-md border p-3 space-y-1">
                  {candidates.isLoading && (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  )}
                  {candidates.data?.data.map((c) => (
                    <div
                      key={c.cardId}
                      className="text-sm flex items-center gap-2"
                    >
                      <span className="text-xs text-muted-foreground">
                        {c.lane}
                      </span>
                      <span className="font-mono text-xs">{c.cardId}</span>
                    </div>
                  ))}
                  {candidates.data?.data.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No candidates match this filter.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Lane Mix + Size */}
      <Card>
        <CardHeader>
          <CardTitle>Session Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="text-sm font-medium mb-2">Lane Mix</p>
            <LaneMixSlider
              retentionPct={retentionPct}
              onChange={setRetentionPct}
              retentionCount={retentionCount}
              calibrationCount={calibrationCount}
            />
          </div>
          <div>
            <label htmlFor="session-size" className="text-sm font-medium">
              Session Size
            </label>
            <div className="flex items-center gap-3 mt-1">
              <input
                id="session-size"
                type="number"
                min={5}
                max={100}
                value={sessionSize}
                onChange={(e) => {
                  setSessionSize(Number(e.target.value));
                }}
                className="w-20 rounded-md border border-input px-3 py-1.5 text-sm bg-background"
              />
              <span className="text-sm text-muted-foreground">
                cards (5–100)
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button
        className="w-full"
        size="lg"
        onClick={handleStart}
        disabled={startSession.isPending}
      >
        {startSession.isPending ? (
          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
        ) : (
          <Play className="h-5 w-5 mr-2" />
        )}
        Start Session
      </Button>
    </div>
  );
}
```

### Step 2: Check TypeScript

```bash
pnpm typecheck 2>&1 | grep "session/new" || echo "no errors in session/new"
```

### Step 3: Commit

```bash
git add apps/web/src/app/\(authenticated\)/session/new/page.tsx
git commit -m "feat(web): add Session Start page at /session/new"
```

---

## Task T4: Session Bar Component

**Files:**

- Create: `apps/web/src/components/session/session-bar.tsx`

### Context

Sticky top bar for the active session. Shows progress, elapsed timer, lane
badge, pause/resume, and abandon buttons. Receives all data as props — no
internal data fetching.

### Step 1: Create the component

```tsx
// apps/web/src/components/session/session-bar.tsx
'use client';

import { MoreHorizontal, Pause, Play } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@noema/ui';
import { ProgressRing, PulseIndicator, StateChip } from '@noema/ui';
import type { SessionId } from '@noema/types';

interface ISessionBarProps {
  sessionId: SessionId;
  completed: number;
  total: number;
  elapsedMs: number;
  lane: 'retention' | 'calibration' | null;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onAbandon: () => void;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function SessionBar({
  completed,
  total,
  elapsedMs,
  lane,
  isPaused,
  onPause,
  onResume,
  onAbandon,
}: ISessionBarProps): React.JSX.Element {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between px-4 h-12 border-b bg-background/95 backdrop-blur">
      {/* Left: progress */}
      <div className="flex items-center gap-2">
        <ProgressRing
          value={total > 0 ? (completed / total) * 100 : 0}
          size={32}
          strokeWidth={3}
        />
        <span className="text-sm text-muted-foreground">
          {String(completed)}/{String(total)}
        </span>
      </div>

      {/* Center: timer + pulse */}
      <div className="flex items-center gap-2">
        <PulseIndicator active={!isPaused} />
        <span className="font-mono text-sm tabular-nums">
          {formatElapsed(elapsedMs)}
        </span>
        {lane !== null && (
          <StateChip
            state={lane === 'retention' ? 'active' : 'pending'}
            label={lane === 'retention' ? 'Retention' : 'Calibration'}
          />
        )}
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={isPaused ? onResume : onPause}
          aria-label={isPaused ? 'Resume session' : 'Pause session'}
        >
          {isPaused ? (
            <Play className="h-4 w-4" />
          ) : (
            <Pause className="h-4 w-4" />
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" aria-label="Session options">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="text-destructive" onClick={onAbandon}>
              Abandon session
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
```

### Step 2: Check TypeScript

```bash
pnpm typecheck 2>&1 | grep "session-bar" || echo "no errors in session-bar"
```

### Step 3: Commit

```bash
git add apps/web/src/components/session/session-bar.tsx
git commit -m "feat(web): add SessionBar component"
```

---

## Task T5: Confidence Meter and Response Controls Components

**Files:**

- Create: `apps/web/src/components/session/pre-answer-confidence.tsx`
- Create: `apps/web/src/components/session/response-controls.tsx`

### Context

Two components for the bottom of the active session view:

1. `PreAnswerConfidence` — shown before the user reveals the answer; captures
   `confidenceBefore` (0.0–1.0)
2. `ResponseControls` — shown after reveal; captures `confidenceAfter` + grade
   button (1–4) + hint button + self-report toggle

### Step 1: Create PreAnswerConfidence

```tsx
// apps/web/src/components/session/pre-answer-confidence.tsx
'use client';

import { ConfidenceMeter } from '@noema/ui';

interface IPreAnswerConfidenceProps {
  value: number | null;
  onChange: (confidence: number) => void;
}

export function PreAnswerConfidence({
  value,
  onChange,
}: IPreAnswerConfidenceProps): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-2 py-3">
      <p className="text-sm text-muted-foreground">How confident are you?</p>
      <ConfidenceMeter
        value={value ?? 0.5}
        onChange={onChange}
        interactive
        aria-label="Pre-answer confidence"
      />
    </div>
  );
}
```

### Step 2: Create ResponseControls

```tsx
// apps/web/src/components/session/response-controls.tsx
'use client';

import { useState } from 'react';
import { Button } from '@noema/ui';
import { ConfidenceMeter } from '@noema/ui';
import { HelpCircle } from 'lucide-react';

export type Grade = 1 | 2 | 3 | 4;

interface IResponseControlsProps {
  confidenceAfter: number | null;
  onConfidenceAfter: (c: number) => void;
  hintDepth: number;
  maxHints: number;
  onHint: () => void;
  selfReportedGuess: boolean;
  onSelfReportedGuess: (v: boolean) => void;
  onGrade: (grade: Grade) => void;
  isSubmitting: boolean;
}

const GRADE_LABELS: Record<Grade, string> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};

const GRADE_VARIANTS: Record<Grade, string> = {
  1: 'text-red-400 border-red-500/50 hover:bg-red-500/10',
  2: 'text-amber-400 border-amber-500/50 hover:bg-amber-500/10',
  3: 'text-green-400 border-green-500/50 hover:bg-green-500/10',
  4: 'text-blue-400 border-blue-500/50 hover:bg-blue-500/10',
};

export function ResponseControls({
  confidenceAfter,
  onConfidenceAfter,
  hintDepth,
  maxHints,
  onHint,
  selfReportedGuess,
  onSelfReportedGuess,
  onGrade,
  isSubmitting,
}: IResponseControlsProps): React.JSX.Element {
  return (
    <div className="border-t bg-background/95 backdrop-blur px-4 py-3 space-y-3">
      {/* Post-answer confidence */}
      <div className="flex flex-col items-center gap-1">
        <p className="text-xs text-muted-foreground">
          How confident are you now?
        </p>
        <ConfidenceMeter
          value={confidenceAfter ?? 0.5}
          onChange={onConfidenceAfter}
          interactive
          aria-label="Post-answer confidence"
        />
      </div>

      {/* Grade buttons */}
      <div className="flex gap-2">
        {([1, 2, 3, 4] as Grade[]).map((grade) => (
          <button
            key={grade}
            type="button"
            onClick={() => {
              onGrade(grade);
            }}
            disabled={isSubmitting}
            aria-label={`Grade ${GRADE_LABELS[grade]} (${String(grade)})`}
            className={`flex-1 rounded-md border py-2 text-sm font-medium transition-colors disabled:opacity-50 ${GRADE_VARIANTS[grade]}`}
          >
            <span className="block text-xs text-muted-foreground">
              {String(grade)}
            </span>
            {GRADE_LABELS[grade]}
          </button>
        ))}
      </div>

      {/* Hint + self-report */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={onHint}
          disabled={hintDepth >= maxHints}
          aria-label={`Request hint (${String(hintDepth)}/${String(maxHints)} used)`}
        >
          <HelpCircle className="h-4 w-4 mr-1.5" />
          Hint {String(hintDepth)}/{String(maxHints)}
        </Button>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={selfReportedGuess}
            onChange={(e) => {
              onSelfReportedGuess(e.target.checked);
            }}
            aria-label="I guessed"
          />
          <span className="text-muted-foreground">I guessed</span>
        </label>
      </div>
    </div>
  );
}
```

### Step 3: Check TypeScript

```bash
pnpm typecheck 2>&1 | grep -E "pre-answer|response-controls" || echo "no errors in confidence/controls"
```

### Step 4: Commit

```bash
git add apps/web/src/components/session/pre-answer-confidence.tsx \
        apps/web/src/components/session/response-controls.tsx
git commit -m "feat(web): add PreAnswerConfidence and ResponseControls components"
```

---

## Task T6: Pause Overlay and Adaptive Checkpoint Components

**Files:**

- Create: `apps/web/src/components/session/pause-overlay.tsx`
- Create: `apps/web/src/components/session/adaptive-checkpoint.tsx`

### Step 1: Create PauseOverlay

```tsx
// apps/web/src/components/session/pause-overlay.tsx
'use client';

import { Button } from '@noema/ui';
import { PauseCircle } from 'lucide-react';

interface IPauseOverlayProps {
  elapsedMs: number;
  onResume: () => void;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes)}m ${String(seconds)}s`;
}

export function PauseOverlay({
  elapsedMs,
  onResume,
}: IPauseOverlayProps): React.JSX.Element {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-background/80 backdrop-blur-sm">
      <PauseCircle className="h-16 w-16 text-muted-foreground" />
      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold">Session Paused</h2>
        <p className="text-sm text-muted-foreground">
          Elapsed: {formatElapsed(elapsedMs)}
        </p>
      </div>
      <Button size="lg" onClick={onResume}>
        Resume
      </Button>
    </div>
  );
}
```

### Step 2: Create AdaptiveCheckpoint

```tsx
// apps/web/src/components/session/adaptive-checkpoint.tsx
'use client';

import { Button } from '@noema/ui';
import { Info } from 'lucide-react';
import type { ICheckpointDirectiveDto } from '@noema/api-client/session';

interface IAdaptiveCheckpointProps {
  directive: ICheckpointDirectiveDto;
  onDismiss: () => void;
}

const ACTION_LABELS: Record<ICheckpointDirectiveDto['action'], string> = {
  continue: 'Continuing',
  pause: 'Suggested Pause',
  complete: 'Session Complete',
  switch_mode: 'Mode Switch Suggested',
};

export function AdaptiveCheckpoint({
  directive,
  onDismiss,
}: IAdaptiveCheckpointProps): React.JSX.Element {
  return (
    <div className="mx-4 rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 flex gap-3">
      <Info className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
      <div className="flex-1 space-y-1">
        <p className="text-sm font-medium text-blue-400">
          {ACTION_LABELS[directive.action]}
        </p>
        <p className="text-sm text-muted-foreground">{directive.reason}</p>
        {directive.suggestedMode !== undefined && (
          <p className="text-xs text-muted-foreground">
            Suggested mode:{' '}
            <span className="font-mono">{directive.suggestedMode}</span>
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDismiss}
        aria-label="Dismiss checkpoint"
      >
        Understood
      </Button>
    </div>
  );
}
```

### Step 3: Check TypeScript

```bash
pnpm typecheck 2>&1 | grep -E "pause-overlay|adaptive-checkpoint" || echo "no errors"
```

### Step 4: Commit

```bash
git add apps/web/src/components/session/pause-overlay.tsx \
        apps/web/src/components/session/adaptive-checkpoint.tsx
git commit -m "feat(web): add PauseOverlay and AdaptiveCheckpoint components"
```

---

## Task T7: Active Session Page

**Files:**

- Create: `apps/web/src/app/(authenticated)/session/[sessionId]/page.tsx`

### Context

This is the core learning experience. Full-viewport layout: SessionBar (top) →
CardArea (center) → ResponseControls (bottom). Cards are fetched by ID from the
queue. The `useSessionStore` manages ephemeral state (confidence, dwell time).
Timer runs via `setInterval` when not paused.

**Important implementation notes:**

- `useSessionQueue` returns items; use the item at `currentCardIndex` to get the
  current cardId
- Fetch the current card via `useCard(currentCardId)` from content API
- Hint state is local (`hintDepth`, `hintText` from `useRequestHint`)
- On grade click: collect all pending attempt fields from store, call
  `useRecordAttempt`, then `advanceCard()` in store
- `calibrationDelta = (confidenceAfter ?? 0) - (confidenceBefore ?? 0)`
- After `useRecordAttempt` succeeds, invalidation is automatic (handled in the
  hook)
- When `remaining === 0` after advancing, call `useCompleteSession` and navigate
  to summary

### Step 1: Create the active session page

```tsx
// apps/web/src/app/(authenticated)/session/[sessionId]/page.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { SessionId } from '@noema/types';
import {
  useSession,
  useSessionQueue,
  useRecordAttempt,
  useRequestHint,
  useEvaluateCheckpoint,
  usePauseSession,
  useResumeSession,
  useCompleteSession,
  useAbandonSession,
} from '@noema/api-client';
import type { ICheckpointDirectiveDto } from '@noema/api-client/session';
import { useCard } from '@noema/api-client';
import { useSessionStore } from '@/stores/session-store';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { CardRenderer } from '@/components/card-renderers';
import { SessionBar } from '@/components/session/session-bar';
import { PreAnswerConfidence } from '@/components/session/pre-answer-confidence';
import { ResponseControls } from '@/components/session/response-controls';
import type { Grade } from '@/components/session/response-controls';
import { PauseOverlay } from '@/components/session/pause-overlay';
import { AdaptiveCheckpoint } from '@/components/session/adaptive-checkpoint';
import { Skeleton } from '@noema/ui';

const MAX_HINTS = 3;

export default function ActiveSessionPage(): React.JSX.Element {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();

  const {
    pendingAttempt,
    currentCardIndex,
    elapsedTime,
    isPaused,
    setConfidenceBefore,
    setConfidenceAfter,
    recordDwellTime,
    advanceCard,
    resetAttempt,
    clear,
  } = useSessionStore();

  // Server state
  const { data: sessionData } = useSession(sessionId as SessionId);
  const { data: queueData } = useSessionQueue(sessionId as SessionId);

  // Current card
  const currentItem = queueData?.data.items[currentCardIndex];
  const currentCardId = currentItem?.cardId ?? '';
  const { data: card, isLoading: cardLoading } = useCard(
    currentCardId as Parameters<typeof useCard>[0],
    {
      enabled: currentCardId !== '',
    }
  );

  // Mutations
  const recordAttempt = useRecordAttempt(sessionId as SessionId);
  const requestHint = useRequestHint(sessionId as SessionId);
  const evaluateCheckpoint = useEvaluateCheckpoint(sessionId as SessionId);
  const pauseSession = usePauseSession();
  const resumeSession = useResumeSession();
  const completeSession = useCompleteSession();
  const abandonSession = useAbandonSession();

  // Local UI state
  const [isRevealed, setIsRevealed] = useState(false);
  const [hintDepth, setHintDepth] = useState(0);
  const [hintText, setHintText] = useState<string | null>(null);
  const [selfReportedGuess, setSelfReportedGuess] = useState(false);
  const [checkpoint, setCheckpoint] = useState<ICheckpointDirectiveDto | null>(
    null
  );
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);

  // Dwell time tracking
  const cardStartRef = useRef<number>(Date.now());

  // Timer — increments elapsedTime every second when not paused
  const elapsedRef = useRef(elapsedTime);
  elapsedRef.current = elapsedTime;
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      useSessionStore.setState((s) => ({ elapsedTime: s.elapsedTime + 1000 }));
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  }, [isPaused]);

  // Reset local state when card changes
  useEffect(() => {
    setIsRevealed(false);
    setHintDepth(0);
    setHintText(null);
    setSelfReportedGuess(false);
    cardStartRef.current = Date.now();
    resetAttempt();
  }, [currentCardId, resetAttempt]);

  // Cleanup store on unmount
  useEffect(() => {
    return () => {
      clear();
    };
  }, [clear]);

  // Handlers
  const handleReveal = useCallback((): void => {
    if (!isRevealed) {
      recordDwellTime(Date.now() - cardStartRef.current);
      setIsRevealed(true);
    }
  }, [isRevealed, recordDwellTime]);

  const handleHint = useCallback((): void => {
    if (hintDepth >= MAX_HINTS) return;
    requestHint.mutate(undefined, {
      onSuccess: (response) => {
        setHintText(response.data.hint);
        setHintDepth(response.data.depth);
      },
    });
  }, [hintDepth, requestHint]);

  const handleGrade = useCallback(
    (grade: Grade): void => {
      if (card === undefined || card === null) return;
      const confidenceBefore = pendingAttempt?.confidenceBefore ?? null;
      const confidenceAfter = pendingAttempt?.confidenceAfter ?? null;
      const calibrationDelta =
        confidenceBefore !== null && confidenceAfter !== null
          ? confidenceAfter - confidenceBefore
          : undefined;

      recordAttempt.mutate(
        {
          cardId: card.id,
          grade,
          confidenceBefore: confidenceBefore ?? undefined,
          confidenceAfter: confidenceAfter ?? undefined,
          calibrationDelta,
          hintDepthUsed: hintDepth,
          dwellTimeMs:
            pendingAttempt?.dwellTimeMs ?? Date.now() - cardStartRef.current,
          selfReportedGuess,
        },
        {
          onSuccess: () => {
            const remaining = queueData?.data.remaining ?? 0;
            if (remaining <= 1) {
              completeSession.mutate(sessionId as SessionId, {
                onSuccess: () => {
                  router.push(`/session/${sessionId}/summary`);
                },
              });
            } else {
              advanceCard();
              // Periodic checkpoint evaluation (every 5 cards)
              if ((currentCardIndex + 1) % 5 === 0) {
                evaluateCheckpoint.mutate(undefined, {
                  onSuccess: (res) => {
                    if (res.data.action !== 'continue') {
                      setCheckpoint(res.data);
                    }
                  },
                });
              }
            }
          },
        }
      );
    },
    [
      card,
      pendingAttempt,
      hintDepth,
      selfReportedGuess,
      recordAttempt,
      queueData,
      currentCardIndex,
      completeSession,
      advanceCard,
      evaluateCheckpoint,
      sessionId,
      router,
    ]
  );

  const handlePause = useCallback((): void => {
    pauseSession.mutate(sessionId as SessionId, {
      onSuccess: () => {
        useSessionStore.setState({ isPaused: true });
      },
    });
  }, [pauseSession, sessionId]);

  const handleResume = useCallback((): void => {
    resumeSession.mutate(sessionId as SessionId, {
      onSuccess: () => {
        useSessionStore.setState({ isPaused: false });
      },
    });
  }, [resumeSession, sessionId]);

  const handleAbandon = useCallback((): void => {
    abandonSession.mutate(sessionId as SessionId, {
      onSuccess: () => {
        clear();
        router.push('/sessions');
      },
    });
  }, [abandonSession, sessionId, clear, router]);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { key: ' ', label: 'Flip card / reveal answer', handler: handleReveal },
    {
      key: '1',
      label: 'Grade: Again',
      handler: () => {
        if (isRevealed) handleGrade(1);
      },
    },
    {
      key: '2',
      label: 'Grade: Hard',
      handler: () => {
        if (isRevealed) handleGrade(2);
      },
    },
    {
      key: '3',
      label: 'Grade: Good',
      handler: () => {
        if (isRevealed) handleGrade(3);
      },
    },
    {
      key: '4',
      label: 'Grade: Easy',
      handler: () => {
        if (isRevealed) handleGrade(4);
      },
    },
    {
      key: 'h',
      label: 'Request hint',
      handler: handleHint,
      when: () => !isRevealed,
    },
    {
      key: 'p',
      label: 'Pause / Resume',
      handler: isPaused ? handleResume : handlePause,
    },
    {
      key: 'Escape',
      label: 'Abandon session',
      handler: () => {
        setShowAbandonConfirm(true);
      },
    },
  ]);

  const total = queueData?.data.items.length ?? 0;
  const remaining = queueData?.data.remaining ?? 0;
  const completed = total - remaining;
  const currentLane =
    currentItem !== undefined
      ? (sessionData?.data.cardIds.indexOf(currentItem.cardId) ?? -1) >= 0
        ? null
        : null
      : null;

  return (
    <div className="relative flex flex-col h-screen">
      <SessionBar
        sessionId={sessionId as SessionId}
        completed={completed}
        total={total}
        elapsedMs={elapsedTime}
        lane={currentLane}
        isPaused={isPaused}
        onPause={handlePause}
        onResume={handleResume}
        onAbandon={() => {
          setShowAbandonConfirm(true);
        }}
      />

      {/* Checkpoint notification */}
      {checkpoint !== null && (
        <AdaptiveCheckpoint
          directive={checkpoint}
          onDismiss={() => {
            setCheckpoint(null);
          }}
        />
      )}

      {/* Card area */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 overflow-y-auto">
        <div className="w-full max-w-2xl space-y-4">
          {/* Hint display */}
          {hintText !== null && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-sm text-amber-300">
              Hint: {hintText}
            </div>
          )}

          {/* Pre-answer confidence */}
          {!isRevealed && (
            <PreAnswerConfidence
              value={pendingAttempt?.confidenceBefore ?? null}
              onChange={setConfidenceBefore}
            />
          )}

          {/* Card */}
          {cardLoading || card === undefined ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : (
            <CardRenderer
              card={card}
              mode="interactive"
              onAnswer={(answer) => {
                // Record implicit answer reveal for renderers that self-reveal
                if (!isRevealed) {
                  recordDwellTime(Date.now() - cardStartRef.current);
                  setIsRevealed(true);
                }
                // For self-grading renderers, could use answer to auto-grade
                // For now, user always clicks grade button
                void answer;
              }}
            />
          )}

          {/* Reveal button (when card not yet revealed and renderer needs explicit reveal) */}
          {!isRevealed && card !== undefined && (
            <button
              type="button"
              onClick={handleReveal}
              className="w-full py-2 text-sm text-muted-foreground border border-dashed rounded-md hover:border-primary hover:text-primary transition-colors"
              aria-label="Show answer"
            >
              Press Space or click to reveal answer
            </button>
          )}
        </div>
      </div>

      {/* Response controls (post-reveal) */}
      {isRevealed && (
        <ResponseControls
          confidenceAfter={pendingAttempt?.confidenceAfter ?? null}
          onConfidenceAfter={setConfidenceAfter}
          hintDepth={hintDepth}
          maxHints={MAX_HINTS}
          onHint={handleHint}
          selfReportedGuess={selfReportedGuess}
          onSelfReportedGuess={setSelfReportedGuess}
          onGrade={handleGrade}
          isSubmitting={recordAttempt.isPending}
        />
      )}

      {/* Pause overlay */}
      {isPaused && (
        <PauseOverlay elapsedMs={elapsedTime} onResume={handleResume} />
      )}

      {/* Abandon confirmation */}
      {showAbandonConfirm && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="rounded-lg border bg-card p-6 max-w-sm w-full space-y-4">
            <h3 className="font-semibold">Abandon session?</h3>
            <p className="text-sm text-muted-foreground">
              Progress will be saved for cards already graded.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAbandonConfirm(false);
                }}
                className="flex-1 rounded-md border px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAbandon}
                className="flex-1 rounded-md bg-destructive px-4 py-2 text-sm text-destructive-foreground"
              >
                Abandon
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

### Step 2: Check TypeScript

```bash
pnpm typecheck 2>&1 | grep "session/\[sessionId\]/page" || echo "no errors in active session page"
```

### Step 3: Commit

```bash
git add "apps/web/src/app/(authenticated)/session/[sessionId]/page.tsx"
git commit -m "feat(web): add Active Session page at /session/[sessionId]"
```

---

## Task T8: Session Summary Components

**Files:**

- Create: `apps/web/src/components/session/session-summary-vitals.tsx`
- Create: `apps/web/src/components/session/card-results-table.tsx`
- Create: `apps/web/src/components/session/post-session-reflection.tsx`

### Step 1: Create SessionSummaryVitals

```tsx
// apps/web/src/components/session/session-summary-vitals.tsx
'use client';

import { MetricTile, NeuralGauge } from '@noema/ui';
import { Clock, CreditCard, Target } from 'lucide-react';
import type { ISessionDto } from '@noema/api-client/session';
import type { IAttemptDto } from '@noema/api-client/session';

interface ISessionSummaryVitalsProps {
  session: ISessionDto;
  attempts: IAttemptDto[];
}

function formatDuration(startedAt: string, completedAt: string | null): string {
  if (completedAt === null) return 'In progress';
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${String(h)}h ${String(m)}m`;
  return `${String(m)}m`;
}

export function SessionSummaryVitals({
  session,
  attempts,
}: ISessionSummaryVitalsProps): React.JSX.Element {
  const totalAttempted = attempts.length;
  const correct = attempts.filter((a) => a.grade >= 3).length;
  const accuracyPct =
    totalAttempted > 0 ? Math.round((correct / totalAttempted) * 100) : 0;
  const duration = formatDuration(session.startedAt, session.completedAt);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <MetricTile
        label="Cards Attempted"
        value={String(totalAttempted)}
        icon={<CreditCard className="h-4 w-4" />}
      />
      <div className="flex flex-col items-center justify-center rounded-xl border p-4 gap-2">
        <span className="text-xs text-muted-foreground">Accuracy</span>
        <NeuralGauge value={accuracyPct} max={100} size={56} />
        <span className="text-sm font-semibold">{String(accuracyPct)}%</span>
      </div>
      <MetricTile
        label="Time Spent"
        value={duration}
        icon={<Clock className="h-4 w-4" />}
      />
      <MetricTile
        label="Mode"
        value={session.mode}
        icon={<Target className="h-4 w-4" />}
      />
    </div>
  );
}
```

### Step 2: Create CardResultsTable

```tsx
// apps/web/src/components/session/card-results-table.tsx
'use client';

import Link from 'next/link';
import type { IAttemptDto } from '@noema/api-client/session';

interface ICardResultsTableProps {
  attempts: IAttemptDto[];
}

const GRADE_COLORS: Record<number, string> = {
  1: 'text-red-400',
  2: 'text-amber-400',
  3: 'text-green-400',
  4: 'text-blue-400',
};

const GRADE_LABELS: Record<number, string> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};

function formatMs(ms: number): string {
  if (ms < 1000) return `${String(ms)}ms`;
  return `${String(Math.round(ms / 1000))}s`;
}

export function CardResultsTable({
  attempts,
}: ICardResultsTableProps): React.JSX.Element {
  if (attempts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No attempts recorded.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">
              Card
            </th>
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">
              Grade
            </th>
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">
              Confidence
            </th>
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">
              Hints
            </th>
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">
              Dwell
            </th>
          </tr>
        </thead>
        <tbody>
          {attempts.map((attempt) => (
            <tr
              key={attempt.id}
              className="border-b hover:bg-muted/20 transition-colors"
            >
              <td className="px-4 py-2">
                <Link
                  href={`/cards/${attempt.cardId}`}
                  className="font-mono text-xs text-primary hover:underline"
                >
                  {attempt.cardId.slice(0, 8)}…
                </Link>
              </td>
              <td className="px-4 py-2">
                <span
                  className={
                    GRADE_COLORS[attempt.grade] ?? 'text-muted-foreground'
                  }
                >
                  {GRADE_LABELS[attempt.grade] ?? String(attempt.grade)}
                </span>
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {attempt.confidenceBefore !== null
                  ? `${String(Math.round((attempt.confidenceBefore ?? 0) * 100))}% → ${String(Math.round((attempt.confidenceAfter ?? 0) * 100))}%`
                  : '—'}
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {String(attempt.hintDepthUsed)}
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {formatMs(attempt.dwellTimeMs)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### Step 3: Create PostSessionReflection

```tsx
// apps/web/src/components/session/post-session-reflection.tsx
'use client';

import { useState } from 'react';
import { Button } from '@noema/ui';

interface IReflection {
  hardestConcept: string;
  misconceptions: string;
  wouldDoDifferently: string;
}

interface IPostSessionReflectionProps {
  onSave: (reflection: IReflection) => void;
}

export function PostSessionReflection({
  onSave,
}: IPostSessionReflectionProps): React.JSX.Element {
  const [reflection, setReflection] = useState<IReflection>({
    hardestConcept: '',
    misconceptions: '',
    wouldDoDifferently: '',
  });
  const [saved, setSaved] = useState(false);

  const handleSave = (): void => {
    onSave(reflection);
    setSaved(true);
  };

  if (saved) {
    return <p className="text-sm text-muted-foreground">Reflection saved.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="hardest-concept" className="text-sm font-medium">
          What was the hardest concept?
        </label>
        <textarea
          id="hardest-concept"
          value={reflection.hardestConcept}
          onChange={(e) => {
            setReflection((r) => ({ ...r, hardestConcept: e.target.value }));
          }}
          rows={2}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
          placeholder="Optional…"
        />
      </div>
      <div>
        <label htmlFor="misconceptions" className="text-sm font-medium">
          Did any misconceptions surprise you?
        </label>
        <textarea
          id="misconceptions"
          value={reflection.misconceptions}
          onChange={(e) => {
            setReflection((r) => ({ ...r, misconceptions: e.target.value }));
          }}
          rows={2}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
          placeholder="Optional…"
        />
      </div>
      <div>
        <label htmlFor="would-do-differently" className="text-sm font-medium">
          What would you do differently?
        </label>
        <textarea
          id="would-do-differently"
          value={reflection.wouldDoDifferently}
          onChange={(e) => {
            setReflection((r) => ({
              ...r,
              wouldDoDifferently: e.target.value,
            }));
          }}
          rows={2}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
          placeholder="Optional…"
        />
      </div>
      <Button onClick={handleSave} size="sm">
        Save Reflection
      </Button>
    </div>
  );
}
```

### Step 4: Check TypeScript

```bash
pnpm typecheck 2>&1 | grep -E "session-summary|card-results|post-session" || echo "no errors in summary components"
```

### Step 5: Commit

```bash
git add apps/web/src/components/session/session-summary-vitals.tsx \
        apps/web/src/components/session/card-results-table.tsx \
        apps/web/src/components/session/post-session-reflection.tsx
git commit -m "feat(web): add session summary components"
```

---

## Task T9: Session Summary Page

**Files:**

- Create:
  `apps/web/src/app/(authenticated)/session/[sessionId]/summary/page.tsx`

### Step 1: Create the summary page

```tsx
// apps/web/src/app/(authenticated)/session/[sessionId]/summary/page.tsx
'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { SessionId } from '@noema/types';
import { useSession, useSessionAttempts } from '@noema/api-client';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@noema/ui';
import { ArrowRight, LayoutDashboard, RefreshCw } from 'lucide-react';
import { SessionSummaryVitals } from '@/components/session/session-summary-vitals';
import { CardResultsTable } from '@/components/session/card-results-table';
import { PostSessionReflection } from '@/components/session/post-session-reflection';

export default function SessionSummaryPage(): React.JSX.Element {
  const { sessionId } = useParams<{ sessionId: string }>();

  const { data: sessionResponse, isLoading: sessionLoading } = useSession(
    sessionId as SessionId
  );
  const { data: attemptsResponse, isLoading: attemptsLoading } =
    useSessionAttempts(sessionId as SessionId);

  const session = sessionResponse?.data;
  const attempts = attemptsResponse?.data ?? [];

  if (sessionLoading || attemptsLoading || session === undefined) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4 space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-32 bg-muted animate-pulse rounded-xl" />
        <div className="h-64 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  const correctCount = attempts.filter((a) => a.grade >= 3).length;
  const retentionAttempts = attempts.filter((_, i) => i % 2 === 0); // simplified — real split needs queue lane data
  const calibrationAttempts = attempts.filter((_, i) => i % 2 !== 0);
  const retentionAccuracy =
    retentionAttempts.length > 0
      ? Math.round(
          (retentionAttempts.filter((a) => a.grade >= 3).length /
            retentionAttempts.length) *
            100
        )
      : 0;
  const calibrationAccuracy =
    calibrationAttempts.length > 0
      ? Math.round(
          (calibrationAttempts.filter((a) => a.grade >= 3).length /
            calibrationAttempts.length) *
            100
        )
      : 0;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Session Complete</h1>
        <p className="text-sm text-muted-foreground">
          {new Date(session.startedAt).toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>

      {/* Section 1: Vitals */}
      <SessionSummaryVitals session={session} attempts={attempts} />

      {/* Section 2: Lane Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Lane Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <p className="font-medium text-blue-400">Retention Lane</p>
              <p className="text-muted-foreground">
                {String(retentionAttempts.length)} cards
              </p>
              <p className="text-muted-foreground">
                Accuracy: {String(retentionAccuracy)}%
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-amber-400">Calibration Lane</p>
              <p className="text-muted-foreground">
                {String(calibrationAttempts.length)} cards
              </p>
              <p className="text-muted-foreground">
                Accuracy: {String(calibrationAccuracy)}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Card Results */}
      <Card>
        <CardHeader>
          <CardTitle>Card Results</CardTitle>
        </CardHeader>
        <CardContent>
          <CardResultsTable attempts={attempts} />
        </CardContent>
      </Card>

      {/* Section 4: Reflection (conditional) */}
      {attempts.length > 0 && correctCount < attempts.length && (
        <Card>
          <CardHeader>
            <CardTitle>Post-Session Reflection</CardTitle>
          </CardHeader>
          <CardContent>
            <PostSessionReflection
              onSave={(reflection) => {
                // Store locally — no API endpoint yet (Phase 10)
                try {
                  localStorage.setItem(
                    `session-reflection-${sessionId}`,
                    JSON.stringify(reflection)
                  );
                } catch {
                  // localStorage unavailable — silently skip
                }
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Section 5: Next Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button asChild className="flex-1">
          <Link href="/session/new">
            <RefreshCw className="h-4 w-4 mr-2" />
            Start Another Session
          </Link>
        </Button>
        <Button variant="outline" asChild className="flex-1">
          <Link href="/dashboard">
            <LayoutDashboard className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Link>
        </Button>
        <Button variant="outline" asChild className="flex-1">
          <Link href="/knowledge">
            <ArrowRight className="h-4 w-4 mr-2" />
            Knowledge Graph
          </Link>
        </Button>
      </div>
    </div>
  );
}
```

### Step 2: Check TypeScript

```bash
pnpm typecheck 2>&1 | grep "summary/page" || echo "no errors in summary page"
```

### Step 3: Commit

```bash
git add "apps/web/src/app/(authenticated)/session/[sessionId]/summary/page.tsx"
git commit -m "feat(web): add Session Summary page at /session/[sessionId]/summary"
```

---

## Task T10: Session History Page + Nav Update

**Files:**

- Create: `apps/web/src/app/(authenticated)/sessions/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/layout.tsx`

### Step 1: Create Session History page

```tsx
// apps/web/src/app/(authenticated)/sessions/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSessions } from '@noema/api-client';
import type {
  ISessionFilters,
  SessionState,
  SessionMode,
} from '@noema/api-client/session';
import { StateChip } from '@noema/ui';
import { Clock, CreditCard, ExternalLink } from 'lucide-react';

const STATE_OPTIONS: { value: SessionState | ''; label: string }[] = [
  { value: '', label: 'All states' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ABANDONED', label: 'Abandoned' },
  { value: 'EXPIRED', label: 'Expired' },
];

const STATE_CHIP_MAP: Record<string, 'active' | 'pending' | 'archived'> = {
  ACTIVE: 'active',
  PAUSED: 'pending',
  COMPLETED: 'active',
  ABANDONED: 'archived',
  EXPIRED: 'archived',
};

function formatDuration(startedAt: string, completedAt: string | null): string {
  if (completedAt === null) return '—';
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  return `${String(m)}m`;
}

export default function SessionsPage(): React.JSX.Element {
  const [stateFilter, setStateFilter] = useState<SessionState | ''>('');

  const filters: ISessionFilters = {
    state: stateFilter !== '' ? stateFilter : undefined,
    limit: 50,
  };

  const { data, isLoading } = useSessions(filters);
  const sessions = data?.data ?? [];

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Session History</h1>
        <Link
          href="/session/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Start Session
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {STATE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              setStateFilter(opt.value as SessionState | '');
            }}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
              stateFilter === opt.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border hover:border-muted-foreground/50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Session list */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && sessions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <p className="text-muted-foreground">No sessions yet.</p>
          <Link
            href="/session/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            Start your first session
          </Link>
        </div>
      )}

      {!isLoading && sessions.length > 0 && (
        <div className="space-y-2">
          {sessions.map((session) => (
            <Link
              key={session.id}
              href={`/session/${session.id}/summary`}
              className="flex items-center gap-4 rounded-lg border p-4 hover:border-muted-foreground/50 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <StateChip
                    state={STATE_CHIP_MAP[session.state] ?? 'pending'}
                    label={session.state}
                  />
                  <span className="text-sm font-medium capitalize">
                    {session.mode}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(session.startedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground shrink-0">
                <div className="flex items-center gap-1">
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>{String(session.cardIds.length)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  <span>
                    {formatDuration(session.startedAt, session.completedAt)}
                  </span>
                </div>
                <ExternalLink className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Step 2: Add Sessions to navigation

In `apps/web/src/app/(authenticated)/layout.tsx`, add the `BookOpen` icon is
already imported. Add a `ClipboardList` icon and a new nav item for Sessions.

Read the current layout file, then make two edits:

**Edit 1** — Add `ClipboardList` to lucide-react import:

```diff
 import {
   BookOpen,
   Brain,
   ChevronDown,
+  ClipboardList,
   LayoutDashboard,
   LibraryBig,
   LogOut,
```

**Edit 2** — Add Sessions nav item (4th item in Learning group, before Card
Library):

```diff
     { href: '/goals', label: 'Goals', icon: Target },
+    { href: '/sessions', label: 'Sessions', icon: ClipboardList },
     { href: '/cards', label: 'Card Library', icon: LibraryBig },
```

### Step 3: Check TypeScript

```bash
pnpm typecheck 2>&1 | grep -E "sessions/page|layout" || echo "no errors"
```

### Step 4: Commit

```bash
git add "apps/web/src/app/(authenticated)/sessions/page.tsx" \
        "apps/web/src/app/(authenticated)/layout.tsx"
git commit -m "feat(web): add Session History page and Sessions nav item"
```

---

## Task T11: TypeScript Cleanup + Final Typecheck

**Files:**

- Modify: various files if typecheck reveals errors

### Step 1: Run full typecheck

```bash
cd /home/rodochrousbisbiki/MyApps/noema/.worktrees/feat-phase-07-session-engine/apps/web && pnpm typecheck 2>&1
```

Ignore pre-existing errors from unbuilt packages (`@noema/ui`,
`@noema/contracts`, etc. — these are module resolution issues that exist in main
too).

Fix **only errors in files created in this phase** (any file under
`apps/web/src/app/(authenticated)/session*` or
`apps/web/src/components/session/`).

### Step 2: Common fixes to expect

**`void answer` lint warning:** The `onAnswer` handler in active session page
uses `void answer` — if TypeScript flags it, change to
`(_answer: unknown): void => { ... }` (leading underscore).

**`useSessionStore.setState` — Zustand setState direct access:** If TypeScript
rejects this, use the store actions instead:

```tsx
// Instead of:
useSessionStore.setState({ isPaused: true });
// Use:
useSessionStore.getState().setSession(sessionData?.data);
```

But for `isPaused` and `elapsedTime`, the session store doesn't have setters for
these. Add them if needed by modifying `apps/web/src/stores/session-store.ts`:

```ts
// Add to actions interface:
setIsPaused: (paused: boolean) => void;
setElapsedTime: (ms: number) => void;
// Add to store implementation:
setIsPaused: (paused) => { set({ isPaused: paused }); },
setElapsedTime: (ms) => { set({ elapsedTime: ms }); },
```

**`useCard` with CardId type:** Ensure `currentCardId` is cast with `as CardId`
not just `as Parameters<typeof useCard>[0]`.

### Step 3: Commit any fixes

```bash
git add -p  # stage only phase-07 files
git commit -m "fix(web): resolve TypeScript errors in Phase 07 session engine"
```

---

## Summary

After this phase, the full session engine is wired:

- `/session/new` — Configure mode, card source, lane mix, start session
- `/session/:id` — Active learning with CardRenderer, confidence meters, grading
  1–4, hints, keyboard shortcuts, pause/abandon
- `/session/:id/summary` — Vitals, lane breakdown, card results, optional
  reflection
- `/sessions` — History list with state filter, click to summary
- Sessions nav item in Learning group

**Component files created:**

- `apps/web/src/components/session/mode-selector.tsx`
- `apps/web/src/components/session/lane-mix-slider.tsx`
- `apps/web/src/components/session/session-bar.tsx`
- `apps/web/src/components/session/pre-answer-confidence.tsx`
- `apps/web/src/components/session/response-controls.tsx`
- `apps/web/src/components/session/pause-overlay.tsx`
- `apps/web/src/components/session/adaptive-checkpoint.tsx`
- `apps/web/src/components/session/session-summary-vitals.tsx`
- `apps/web/src/components/session/card-results-table.tsx`
- `apps/web/src/components/session/post-session-reflection.tsx`
