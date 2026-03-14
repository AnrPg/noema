# Phase 10 — Cognitive Copilot (Insula) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Cognitive Copilot sidebar — an ambient, non-intrusive panel that surfaces `agentHints` from every API call, sorted by priority, grouped by category, expired by validity period, with full transparency into the system's reasoning.

**Architecture:** The data pipeline already exists (Phase 3): `useAgentHintsInterceptor` subscribes to TanStack QueryCache and pushes `IAgentHints` into `useCopilotStore` keyed by route. Phase 10 adds the UI layer (7 new component files + 1 barrel export), enhances the store with freshness tracking and fade-expiry state, and wires the copilot into the authenticated layout. The store's `hintsByPage[activePageKey]` is the single source of truth for all sidebar sections. All components read from it — no new API calls in this phase.

**Tech Stack:** Next.js 15, React, TypeScript, Tailwind CSS, Zustand (`@/stores/copilot-store`), `@noema/ui` (NeuralGauge, StateChip, ConfidenceMeter, Button, PulseIndicator), `@noema/contracts` (IAgentHints, ISuggestedAction, IRiskFactor, IAlternative, IWarning — type-only imports), `lucide-react` icons, `next/navigation` (useRouter, usePathname).

---

## Context & Patterns

### Codebase patterns (CRITICAL)

```tsx
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
```
Add only the headers relevant to your file. Files that only use `@noema/contracts` type-only imports (`import type { ... }`) and `@noema/ui` components do NOT need the disable headers — only if accessing `.someField` on `any`-typed values.

### Store shape (READ THIS BEFORE TOUCHING THE STORE)

```ts
// Current (after T10.A enhances it):
interface ICopilotState {
  isOpen: boolean;
  hintsByPage: Record<string, IAgentHints[]>;   // IAgentHints from @noema/contracts
  activePageKey: string;
  lastReceivedAt: Record<string, number>;        // NEW: pageKey → Date.now() timestamp
  expiringPages: Set<string>;                    // NEW: pages currently fading out
}
```

### Reading hints from the store

```tsx
const hintsByPage = useCopilotStore((s) => s.hintsByPage);
const activePageKey = useCopilotStore((s) => s.activePageKey);
const hints: IAgentHints[] = hintsByPage[activePageKey] ?? [];
```

### Flattening + deduplicating actions (used in multiple components)

```tsx
const allActions = hints.flatMap((h) => h.suggestedNextActions);
const seen = new Set<string>();
const uniqueActions = allActions.filter((a) => {
  if (seen.has(a.action)) return false;
  seen.add(a.action);
  return true;
});
uniqueActions.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
```

### Priority ordering constants (shared across T10.2, T10.7)

```ts
const PRIORITY_ORDER: Record<ActionPriority, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
};
const PRIORITY_BORDER: Record<ActionPriority, string> = {
  critical: 'border-l-cortex-400',
  high:     'border-l-myelin-400',
  medium:   'border-l-synapse-400',
  low:      'border-l-axon-400',
};
```

### Numbers in JSX

Always `{String(n)}` for number values in JSX. Never `{n}`.

### Interface naming

Prefix with `I` (e.g. `ICopilotSidebarProps`).

### Typed routes

`href={'/path' as never}` and `router.push('/path' as never)`.

### No Co-Authored-By in commits.

---

## Existing files (DO NOT RECREATE)

- `apps/web/src/stores/copilot-store.ts` — Zustand store (will be MODIFIED in T10.A)
- `apps/web/src/hooks/use-agent-hints-interceptor.ts` — QueryCache subscriber (will be MODIFIED in T10.A)
- `apps/web/src/components/dashboard/copilot-suggestions.tsx` — Dashboard widget (will be MODIFIED in T10.H)
- `apps/web/src/app/(authenticated)/layout.tsx` — Auth layout (will be MODIFIED in T10.H)

---

## Task T10.A — Store Enhancement + Interceptor Update (T10.6)

**Goal:** Add freshness tracking (`lastReceivedAt`), fade-expiry state (`expiringPages`), and an unread high-priority count to the store. Update the interceptor to call `markPageExpiring` before clearing, and add a 30s polling interval to catch orphaned hints.

**Files:**
- Modify: `apps/web/src/stores/copilot-store.ts`
- Modify: `apps/web/src/hooks/use-agent-hints-interceptor.ts`

---

### Step 1: Read both files

Read `apps/web/src/stores/copilot-store.ts` and `apps/web/src/hooks/use-agent-hints-interceptor.ts` in full before touching anything.

---

### Step 2: Update the store

Replace the content of `apps/web/src/stores/copilot-store.ts` with:

```ts
/**
 * Copilot Store — Cognitive Copilot sidebar state.
 *
 * Tracks sidebar open/close (persisted) and per-page hints (ephemeral).
 * Enhanced in Phase 10 with freshness tracking and expiry animation state.
 */

import type { IAgentHints } from '@noema/contracts';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// ============================================================================
// State + Actions
// ============================================================================

interface ICopilotState {
  isOpen: boolean;
  hintsByPage: Record<string, IAgentHints[]>;
  activePageKey: string;
  /** Timestamp (Date.now()) of most recent pushHints call per page */
  lastReceivedAt: Record<string, number>;
  /** Pages currently in expiry fade-out animation (cleared after animation) */
  expiringPages: Set<string>;
  /** Count of unread high-priority (critical/high) actions accumulated while sidebar is closed */
  unreadHighCount: number;
}

interface ICopilotActions {
  toggle: () => void;
  open: () => void;
  close: () => void;
  pushHints: (pageKey: string, hints: IAgentHints) => void;
  clearPage: (pageKey: string) => void;
  setActivePage: (pageKey: string) => void;
  markPageExpiring: (pageKey: string) => void;
  clearUnread: () => void;
}

// ============================================================================
// Store
// ============================================================================

export const useCopilotStore = create<ICopilotState & ICopilotActions>()(
  persist(
    (set, get) => ({
      isOpen: false,
      hintsByPage: {},
      activePageKey: '/',
      lastReceivedAt: {},
      expiringPages: new Set<string>(),
      unreadHighCount: 0,

      toggle: () => set((s) => ({ isOpen: !s.isOpen, unreadHighCount: !s.isOpen ? 0 : s.unreadHighCount })),
      open: () => set({ isOpen: true, unreadHighCount: 0 }),
      close: () => set({ isOpen: false }),

      pushHints: (pageKey, hints) =>
        set((s) => {
          const existing = s.hintsByPage[pageKey] ?? [];
          const existingActionIds = new Set(
            existing.flatMap((h) => h.suggestedNextActions.map((a) => a.action))
          );
          const hasNew = hints.suggestedNextActions.some((a) => !existingActionIds.has(a.action));
          if (!hasNew) return s;

          // Count new critical/high actions for the unread badge
          const newHighCount = !s.isOpen
            ? hints.suggestedNextActions.filter(
                (a) => a.priority === 'critical' || a.priority === 'high'
              ).length
            : 0;

          return {
            hintsByPage: { ...s.hintsByPage, [pageKey]: [...existing, hints] },
            lastReceivedAt: { ...s.lastReceivedAt, [pageKey]: Date.now() },
            unreadHighCount: s.unreadHighCount + newHighCount,
            // Clear expiring state for this page since we just received fresh hints
            expiringPages: new Set([...s.expiringPages].filter((k) => k !== pageKey)),
          };
        }),

      clearPage: (pageKey) =>
        set((s) => {
          const { [pageKey]: _removed, ...restHints } = s.hintsByPage;
          const { [pageKey]: _removedTs, ...restTs } = s.lastReceivedAt;
          const newExpiring = new Set([...s.expiringPages].filter((k) => k !== pageKey));
          return { hintsByPage: restHints, lastReceivedAt: restTs, expiringPages: newExpiring };
        }),

      setActivePage: (pageKey) => set({ activePageKey: pageKey }),

      markPageExpiring: (pageKey) =>
        set((s) => ({ expiringPages: new Set([...s.expiringPages, pageKey]) })),

      clearUnread: () => set({ unreadHighCount: 0 }),
    }),
    {
      name: 'noema-copilot',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ isOpen: state.isOpen }),
    }
  )
);
```

---

### Step 3: Update the interceptor

Replace the content of `apps/web/src/hooks/use-agent-hints-interceptor.ts` with:

```ts
/**
 * Agent Hints Interceptor
 *
 * Subscribes to TanStack Query's QueryCache and automatically extracts
 * agentHints from every IApiResponse<T>, pushing them into useCopilotStore
 * keyed by the current route.
 *
 * Expiry: per-hint setTimeout schedules markPageExpiring → 300ms fade → clearPage.
 * A 30s polling interval catches orphaned hints (e.g. stored hints whose timers
 * were cancelled when the component unmounted and remounted).
 */

'use client';

import type { IAgentHints, ValidityPeriod } from '@noema/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useCopilotStore } from '@/stores/copilot-store';

// ============================================================================
// Validity → expiry ms mapping
// ============================================================================

const VALIDITY_MS: Record<ValidityPeriod, number | null> = {
  immediate: 30_000,
  short: 5 * 60_000,
  medium: 60 * 60_000,
  long: 24 * 60 * 60_000,
  indefinite: null,
};

const FADE_DURATION_MS = 300;

// ============================================================================
// Type guard
// ============================================================================

function hasAgentHints(data: unknown): data is { agentHints: IAgentHints } {
  if (typeof data !== 'object' || data === null) return false;
  const record = data as Record<string, unknown>;
  return (
    'agentHints' in record &&
    typeof record['agentHints'] === 'object' &&
    record['agentHints'] !== null
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useAgentHintsInterceptor(): void {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const pushHints = useCopilotStore((s) => s.pushHints);
  const clearPage = useCopilotStore((s) => s.clearPage);
  const markPageExpiring = useCopilotStore((s) => s.markPageExpiring);
  const setActivePage = useCopilotStore((s) => s.setActivePage);

  useEffect(() => {
    setActivePage(pathname);
  }, [pathname, setActivePage]);

  useEffect(() => {
    const cache = queryClient.getQueryCache();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    // Helper: schedule fade + clear for a page
    const scheduleExpiry = (pageKey: string, expiryMs: number): void => {
      const timerId = setTimeout(() => {
        markPageExpiring(pageKey);
        const clearId = setTimeout(() => {
          clearPage(pageKey);
          timers.delete(clearId);
        }, FADE_DURATION_MS);
        timers.add(clearId);
        timers.delete(timerId);
      }, expiryMs);
      timers.add(timerId);
    };

    // Subscribe to QueryCache for successful query results
    const unsubscribe = cache.subscribe((event) => {
      if (event.type !== 'updated') return;
      if (event.action.type !== 'success') return;

      const data: unknown = event.query.state.data;
      if (!hasAgentHints(data)) return;

      const hints = data.agentHints;
      pushHints(pathname, hints);

      const expiryMs = VALIDITY_MS[hints.validityPeriod];
      if (expiryMs !== null) {
        scheduleExpiry(pathname, expiryMs);
      }
    });

    // 30s polling interval: re-check stored hints against their validity periods.
    // Catches orphaned hints whose original timers were cancelled on unmount.
    const pollId = setInterval(() => {
      const state = useCopilotStore.getState();
      const now = Date.now();
      for (const [pageKey, pageHints] of Object.entries(state.hintsByPage)) {
        const receivedAt = state.lastReceivedAt[pageKey];
        if (receivedAt === undefined) continue;
        // Use the shortest validity period among all hints for this page
        const minExpiry = pageHints.reduce<number | null>((min, h) => {
          const ms = VALIDITY_MS[h.validityPeriod];
          if (ms === null) return min;
          return min === null ? ms : Math.min(min, ms);
        }, null);
        if (minExpiry !== null && now - receivedAt >= minExpiry) {
          if (!state.expiringPages.has(pageKey)) {
            markPageExpiring(pageKey);
            const clearId = setTimeout(() => {
              clearPage(pageKey);
              timers.delete(clearId);
            }, FADE_DURATION_MS);
            timers.add(clearId);
          }
        }
      }
    }, 30_000);

    return () => {
      unsubscribe();
      clearInterval(pollId);
      timers.forEach((id) => { clearTimeout(id); });
      timers.clear();
    };
  }, [queryClient, pathname, pushHints, clearPage, markPageExpiring]);
}
```

---

### Step 4: Verify typecheck

```bash
cd /home/rodochrousbisbiki/MyApps/noema/.worktrees/feat-phase-10-cognitive-copilot
pnpm --filter @noema/web typecheck 2>&1 | grep -v "Cannot find module '@noema"
```

Expected: no new errors from the modified files.

---

### Step 5: Commit

```bash
cd /home/rodochrousbisbiki/MyApps/noema/.worktrees/feat-phase-10-cognitive-copilot
git add apps/web/src/stores/copilot-store.ts apps/web/src/hooks/use-agent-hints-interceptor.ts
git commit -m "feat(web): T10.A — copilot store freshness tracking, fade-expiry, unread count"
```

---

## Task T10.B — CopilotSidebar Shell + CopilotToggle (T10.1 + T10.7)

**Goal:** Create the sidebar shell with header (NeuralGauge + StateChip), slide-in animation, keyboard shortcut, and the floating toggle button with PulseIndicator badge.

**Files:**
- Create: `apps/web/src/components/copilot/copilot-sidebar.tsx`
- Create: `apps/web/src/components/copilot/copilot-toggle.tsx`

**NOTE:** The sidebar sections (T10.2–T10.5) are not created yet. Use placeholder `<div>` sections labeled "Suggested Actions", "Risk Alerts", "Transparency", "Alternatives & Warnings" in the shell for now. They will be replaced in T10.C–T10.F.

---

### Step 1: Create `apps/web/src/components/copilot/copilot-sidebar.tsx`

```tsx
'use client';
/**
 * @noema/web — Copilot / CopilotSidebar
 *
 * Persistent, toggleable right-aligned panel. Surfaces agentHints from all
 * API calls on the current page. Does not push main content — overlays it.
 */
import * as React from 'react';
import type { IAgentHints, ActionPriority, SourceQuality } from '@noema/contracts';
import { NeuralGauge, StateChip, CARD_LEARNING_STATE_MAP } from '@noema/ui';
import { X } from 'lucide-react';
import { useCopilotStore } from '@/stores/copilot-store';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SOURCE_QUALITY_ORDER: Record<SourceQuality, number> = {
  high: 0, medium: 1, low: 2, unknown: 3,
};

function bestSourceQuality(hints: IAgentHints[]): SourceQuality {
  if (hints.length === 0) return 'unknown';
  return hints.reduce<SourceQuality>((best, h) => {
    return SOURCE_QUALITY_ORDER[h.sourceQuality] < SOURCE_QUALITY_ORDER[best]
      ? h.sourceQuality
      : best;
  }, 'unknown');
}

function avgConfidence(hints: IAgentHints[]): number {
  if (hints.length === 0) return 0;
  return hints.reduce((sum, h) => sum + h.confidence, 0) / hints.length;
}

// Source quality → StateChip-compatible state key
// CARD_LEARNING_STATE_MAP keys are NEW/LEARNING/REVIEW/RELEARNING — we'll
// build a custom map for source quality.
const SOURCE_QUALITY_STATE_MAP = {
  HIGH:    { label: 'High Quality',    color: 'text-synapse-400 bg-synapse-400/10' },
  MEDIUM:  { label: 'Medium Quality',  color: 'text-myelin-400  bg-myelin-400/10' },
  LOW:     { label: 'Low Quality',     color: 'text-cortex-400  bg-cortex-400/10' },
  UNKNOWN: { label: 'Unknown Quality', color: 'text-muted-foreground bg-muted' },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function CopilotSidebar(): React.JSX.Element {
  const isOpen = useCopilotStore((s) => s.isOpen);
  const close = useCopilotStore((s) => s.close);
  const toggle = useCopilotStore((s) => s.toggle);
  const hintsByPage = useCopilotStore((s) => s.hintsByPage);
  const activePageKey = useCopilotStore((s) => s.activePageKey);
  const expiringPages = useCopilotStore((s) => s.expiringPages);
  const lastReceivedAt = useCopilotStore((s) => s.lastReceivedAt);

  const hints: IAgentHints[] = hintsByPage[activePageKey] ?? [];
  const isExpiring = expiringPages.has(activePageKey);
  const confidence = avgConfidence(hints);
  const sourceQuality = bestSourceQuality(hints);
  const sourceQualityKey = sourceQuality.toUpperCase() as keyof typeof SOURCE_QUALITY_STATE_MAP;

  // "Last updated X ago"
  const [lastUpdatedLabel, setLastUpdatedLabel] = React.useState<string>('');
  React.useEffect(() => {
    const receivedAt = lastReceivedAt[activePageKey];
    if (receivedAt === undefined) {
      setLastUpdatedLabel('');
      return;
    }
    const update = (): void => {
      const diffSec = Math.floor((Date.now() - receivedAt) / 1000);
      if (diffSec < 60) setLastUpdatedLabel(`${String(diffSec)}s ago`);
      else if (diffSec < 3600) setLastUpdatedLabel(`${String(Math.floor(diffSec / 60))}m ago`);
      else setLastUpdatedLabel(`${String(Math.floor(diffSec / 3600))}h ago`);
    };
    update();
    const id = setInterval(update, 10_000);
    return () => { clearInterval(id); };
  }, [activePageKey, lastReceivedAt]);

  // Cmd+. / Ctrl+. keyboard shortcut
  React.useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === '.' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => { window.removeEventListener('keydown', handler); };
  }, [toggle]);

  const hasHints = hints.length > 0;

  return (
    <>
      {/* Backdrop (only when open, click to close) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        role="complementary"
        aria-label="Cognitive Copilot"
        className={[
          'fixed right-0 top-0 z-40 flex h-full w-[360px] flex-col',
          'border-l border-border bg-card shadow-2xl',
          'transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
          isExpiring ? 'opacity-30' : 'opacity-100',
          'transition-opacity duration-300',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <NeuralGauge value={confidence} size="xs" />
            <div>
              <p className="text-sm font-semibold text-foreground">Cognitive Copilot</p>
              <div className="flex items-center gap-1.5">
                <span
                  className={[
                    'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                    SOURCE_QUALITY_STATE_MAP[sourceQualityKey]?.color ?? 'text-muted-foreground bg-muted',
                  ].join(' ')}
                >
                  {SOURCE_QUALITY_STATE_MAP[sourceQualityKey]?.label ?? 'Unknown Quality'}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close Cognitive Copilot"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex flex-1 flex-col gap-0 overflow-y-auto">
          {!hasHints ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
              <p className="text-sm font-medium text-foreground">No suggestions yet</p>
              <p className="text-xs text-muted-foreground">
                Navigate or study to generate new suggestions
              </p>
            </div>
          ) : (
            <>
              {/* Placeholder sections — replaced by T10.C–T10.F */}
              <div className="px-4 py-3 text-xs text-muted-foreground border-b border-border">
                Suggested Actions section (T10.C)
              </div>
              <div className="px-4 py-3 text-xs text-muted-foreground border-b border-border">
                Risk Alerts section (T10.D)
              </div>
              <div className="px-4 py-3 text-xs text-muted-foreground border-b border-border">
                Transparency section (T10.E)
              </div>
              <div className="px-4 py-3 text-xs text-muted-foreground">
                Alternatives &amp; Warnings section (T10.F)
              </div>
            </>
          )}
        </div>

        {/* Footer — last updated */}
        {lastUpdatedLabel !== '' && (
          <div className="border-t border-border px-4 py-2">
            <p className="text-[10px] text-muted-foreground">
              Last updated {lastUpdatedLabel}
            </p>
          </div>
        )}
      </aside>
    </>
  );
}
```

---

### Step 2: Create `apps/web/src/components/copilot/copilot-toggle.tsx`

```tsx
'use client';
/**
 * @noema/web — Copilot / CopilotToggle
 *
 * Floating circular button — bottom-right corner.
 * Shows PulseIndicator when unread high-priority actions exist.
 * Hides during active sessions (/session/* routes).
 */
import * as React from 'react';
import { usePathname } from 'next/navigation';
import { PulseIndicator } from '@noema/ui';
import { Brain, X } from 'lucide-react';
import { useCopilotStore } from '@/stores/copilot-store';

export function CopilotToggle(): React.JSX.Element | null {
  const isOpen = useCopilotStore((s) => s.isOpen);
  const toggle = useCopilotStore((s) => s.toggle);
  const unreadHighCount = useCopilotStore((s) => s.unreadHighCount);
  const pathname = usePathname();

  // Hide during active sessions
  if (pathname.startsWith('/session/')) return null;

  const hasUnread = unreadHighCount > 0;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Unread badge */}
      {hasUnread && !isOpen && (
        <span className="absolute -top-1 -right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-cortex-400 text-[10px] font-bold text-white">
          {unreadHighCount > 9 ? '9+' : String(unreadHighCount)}
        </span>
      )}

      {/* PulseIndicator ring when unread and closed */}
      {hasUnread && !isOpen && (
        <span className="absolute inset-0 z-0">
          <PulseIndicator active size="lg" />
        </span>
      )}

      <button
        type="button"
        onClick={toggle}
        aria-label={isOpen ? 'Close Cognitive Copilot' : 'Open Cognitive Copilot'}
        aria-expanded={isOpen}
        className={[
          'relative z-10 flex h-12 w-12 items-center justify-center rounded-full shadow-lg',
          'transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          isOpen
            ? 'bg-muted text-foreground hover:bg-muted/80'
            : 'bg-synapse-400 text-white hover:bg-synapse-500',
        ].join(' ')}
      >
        {isOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <Brain className="h-5 w-5" />
        )}
      </button>
    </div>
  );
}
```

---

### Step 3: Verify typecheck

```bash
cd /home/rodochrousbisbiki/MyApps/noema/.worktrees/feat-phase-10-cognitive-copilot
pnpm --filter @noema/web typecheck 2>&1 | grep -v "Cannot find module '@noema"
```

Expected: no new errors from these two files.

---

### Step 4: Commit

```bash
cd /home/rodochrousbisbiki/MyApps/noema/.worktrees/feat-phase-10-cognitive-copilot
git add apps/web/src/components/copilot/
git commit -m "feat(web): T10.B — CopilotSidebar shell, CopilotToggle floating button"
```

---

## Task T10.C — SuggestedActions Section (T10.2)

**Goal:** Build the suggested actions section: grouped by category, sorted by priority, each with a "Do it" button that navigates or executes the action.

**Files:**
- Create: `apps/web/src/components/copilot/suggested-actions.tsx`
- Modify: `apps/web/src/components/copilot/copilot-sidebar.tsx` (replace placeholder with `<SuggestedActions />`)

---

### Step 1: Create `apps/web/src/components/copilot/suggested-actions.tsx`

```tsx
'use client';
/**
 * @noema/web — Copilot / SuggestedActions
 *
 * Groups and renders ISuggestedAction items from agentHints.
 * Sorted: critical > high > medium > low.
 * Grouped by category (Exploration / Optimization / Correction / Learning).
 * "Do it" button navigates to mapped route or executes mapped API call.
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { ISuggestedAction, ActionCategory, ActionPriority } from '@noema/contracts';
import { ConfidenceMeter } from '@noema/ui';
import {
  AlertTriangle, BookOpen, ChevronDown, ChevronRight, Compass, SlidersHorizontal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCopilotStore } from '@/stores/copilot-store';

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<ActionPriority, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
};

const PRIORITY_BORDER: Record<ActionPriority, string> = {
  critical: 'border-l-cortex-400',
  high:     'border-l-myelin-400',
  medium:   'border-l-synapse-400',
  low:      'border-l-axon-400',
};

const PRIORITY_TEXT: Record<ActionPriority, string> = {
  critical: 'text-cortex-400',
  high:     'text-myelin-400',
  medium:   'text-synapse-400',
  low:      'text-axon-400',
};

const CATEGORY_ICON: Record<ActionCategory, LucideIcon> = {
  exploration:  Compass,
  optimization: SlidersHorizontal,
  correction:   AlertTriangle,
  learning:     BookOpen,
};

const CATEGORY_LABEL: Record<ActionCategory, string> = {
  exploration:  'Exploration',
  optimization: 'Optimization',
  correction:   'Correction',
  learning:     'Learning',
};

const CATEGORY_ORDER: ActionCategory[] = ['correction', 'exploration', 'optimization', 'learning'];

/**
 * Maps action identifiers to Next.js routes.
 * Extend this as new pages are added.
 * Unknown actions get no navigation (button is still shown but does nothing visible).
 */
const ACTION_ROUTES: Record<string, string> = {
  'review-cards':            '/reviews',
  'start-review':            '/session/new',
  'view-knowledge-map':      '/knowledge',
  'view-health-dashboard':   '/knowledge/health',
  'view-misconceptions':     '/knowledge/misconceptions',
  'view-comparison':         '/knowledge/comparison',
  'browse-card-library':     '/cards',
  'go-to-goals':             '/goals',
  'start-session':           '/session/new',
  'view-dashboard':          '/dashboard',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function SuggestedActions(): React.JSX.Element {
  const router = useRouter();
  const hintsByPage = useCopilotStore((s) => s.hintsByPage);
  const activePageKey = useCopilotStore((s) => s.activePageKey);
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<ActionCategory>>(new Set());

  const hints = hintsByPage[activePageKey] ?? [];

  // Flatten → deduplicate → sort
  const allActions = hints.flatMap((h) => h.suggestedNextActions);
  const seen = new Set<string>();
  const uniqueActions = allActions.filter((a) => {
    if (seen.has(a.action)) return false;
    seen.add(a.action);
    return true;
  });
  uniqueActions.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  // Group by category
  const grouped = new Map<ActionCategory, ISuggestedAction[]>();
  for (const action of uniqueActions) {
    const cat: ActionCategory = action.category ?? 'learning';
    const list = grouped.get(cat) ?? [];
    list.push(action);
    grouped.set(cat, list);
  }

  const toggleGroup = (cat: ActionCategory): void => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const handleDoIt = (action: ISuggestedAction): void => {
    const route = ACTION_ROUTES[action.action];
    if (route !== undefined) {
      router.push(route as never);
    }
  };

  if (uniqueActions.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-xs text-muted-foreground">
        No suggested actions for this page.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((cat) => {
        const actions = grouped.get(cat) ?? [];
        const Icon = CATEGORY_ICON[cat];
        const isCollapsed = collapsedGroups.has(cat);
        const ChevronIcon = isCollapsed ? ChevronRight : ChevronDown;

        return (
          <div key={cat} className="border-b border-border last:border-0">
            {/* Group header */}
            <button
              type="button"
              onClick={() => { toggleGroup(cat); }}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-muted/50 focus:outline-none"
            >
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {CATEGORY_LABEL[cat]}
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                  {String(actions.length)}
                </span>
              </span>
              <ChevronIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            </button>

            {/* Actions in group */}
            {!isCollapsed && (
              <div className="flex flex-col gap-0">
                {actions.map((action) => {
                  const estimatedMin =
                    action.estimatedTime !== undefined
                      ? Math.ceil(action.estimatedTime / 60_000)
                      : null;

                  return (
                    <div
                      key={action.action}
                      className={[
                        'flex flex-col gap-2 border-l-2 px-4 py-3',
                        'bg-card hover:bg-muted/30 transition-colors',
                        PRIORITY_BORDER[action.priority],
                      ].join(' ')}
                    >
                      {/* Priority label */}
                      <span className={['text-[10px] font-semibold uppercase', PRIORITY_TEXT[action.priority]].join(' ')}>
                        {action.priority}
                      </span>

                      {/* Description */}
                      <p className="text-xs text-foreground leading-snug">
                        {action.description ?? action.action}
                      </p>

                      {/* Meta row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {estimatedMin !== null && (
                            <span className="text-[10px] text-muted-foreground">
                              ~{String(estimatedMin)}m
                            </span>
                          )}
                          {action.confidence !== undefined && (
                            <ConfidenceMeter value={action.confidence} segments={3} size="xs" />
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => { handleDoIt(action); }}
                          className="rounded-sm bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          Do it
                        </button>
                      </div>

                      {/* Prerequisites */}
                      {action.prerequisites !== undefined && action.prerequisites.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {action.prerequisites.map((prereq) => (
                            <span
                              key={prereq}
                              className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                            >
                              requires: {prereq}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

---

### Step 2: Update `copilot-sidebar.tsx` — replace Suggested Actions placeholder

Find the line:
```tsx
<div className="px-4 py-3 text-xs text-muted-foreground border-b border-border">
  Suggested Actions section (T10.C)
</div>
```

Replace with:
```tsx
<SuggestedActions />
```

Add the import at the top:
```tsx
import { SuggestedActions } from '@/components/copilot/suggested-actions';
```

---

### Step 3: Verify typecheck

```bash
cd /home/rodochrousbisbiki/MyApps/noema/.worktrees/feat-phase-10-cognitive-copilot
pnpm --filter @noema/web typecheck 2>&1 | grep -v "Cannot find module '@noema"
```

---

### Step 4: Commit

```bash
cd /home/rodochrousbisbiki/MyApps/noema/.worktrees/feat-phase-10-cognitive-copilot
git add apps/web/src/components/copilot/suggested-actions.tsx apps/web/src/components/copilot/copilot-sidebar.tsx
git commit -m "feat(web): T10.C — SuggestedActions grouped by category with Do-it routing"
```

---

## Task T10.D — RiskAlerts Section (T10.3)

**Goal:** Render `riskFactors` from hints; only show severity ≥ medium.

**Files:**
- Create: `apps/web/src/components/copilot/risk-alerts.tsx`
- Modify: `apps/web/src/components/copilot/copilot-sidebar.tsx` (replace Risk Alerts placeholder)

---

### Step 1: Create `apps/web/src/components/copilot/risk-alerts.tsx`

```tsx
'use client';
/**
 * @noema/web — Copilot / RiskAlerts
 *
 * Surfaces riskFactors from agentHints (severity ≥ medium only).
 * critical/high get prominent cortex treatment; medium gets muted warning card.
 */
import * as React from 'react';
import type { IRiskFactor, RiskSeverity } from '@noema/contracts';
import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCopilotStore } from '@/stores/copilot-store';

// ── Constants ─────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<RiskSeverity, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
};

const SEVERITY_ICON: Record<'critical' | 'high' | 'medium', LucideIcon> = {
  critical: ShieldAlert,
  high: AlertTriangle,
  medium: Info,
};

const SEVERITY_STYLE: Record<'critical' | 'high' | 'medium', string> = {
  critical: 'border-cortex-400/40 bg-cortex-400/5 text-cortex-400',
  high:     'border-cortex-400/20 bg-cortex-400/3 text-cortex-400',
  medium:   'border-border bg-muted/30 text-muted-foreground',
};

const PROBABILITY_LABEL = (p: number): string => {
  if (p >= 0.7) return 'Likely';
  if (p >= 0.4) return 'Possible';
  return 'Unlikely';
};

// ── Component ─────────────────────────────────────────────────────────────────

export function RiskAlerts(): React.JSX.Element {
  const hintsByPage = useCopilotStore((s) => s.hintsByPage);
  const activePageKey = useCopilotStore((s) => s.activePageKey);
  const hints = hintsByPage[activePageKey] ?? [];

  const allRisks: IRiskFactor[] = hints.flatMap((h) => h.riskFactors);
  // Only show medium and above
  const visibleRisks = allRisks
    .filter((r) => r.severity !== 'low')
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  if (visibleRisks.length === 0) return <></>;

  return (
    <div className="flex flex-col border-b border-border">
      <div className="px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Risk Alerts
        </h3>
      </div>
      <div className="flex flex-col gap-2 px-4 pb-4">
        {visibleRisks.map((risk, i) => {
          const sev = risk.severity as 'critical' | 'high' | 'medium';
          const Icon = SEVERITY_ICON[sev] ?? Info;
          const style = SEVERITY_STYLE[sev] ?? SEVERITY_STYLE.medium;

          return (
            <div
              key={`${risk.type}-${String(i)}`}
              className={['rounded-lg border p-3', style].join(' ')}
            >
              <div className="flex items-start gap-2">
                <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold capitalize">{risk.type.replace('-', ' ')}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {PROBABILITY_LABEL(risk.probability)}
                    </span>
                  </div>
                  <p className="text-xs leading-snug">{risk.description}</p>
                  {risk.mitigation !== undefined && (
                    <p className="text-[10px] text-muted-foreground">
                      <span className="font-medium">Mitigation:</span> {risk.mitigation}
                    </p>
                  )}
                </div>
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

### Step 2: Update `copilot-sidebar.tsx` — replace Risk Alerts placeholder

Replace:
```tsx
<div className="px-4 py-3 text-xs text-muted-foreground border-b border-border">
  Risk Alerts section (T10.D)
</div>
```
With:
```tsx
<RiskAlerts />
```
Add import: `import { RiskAlerts } from '@/components/copilot/risk-alerts';`

---

### Step 3: Verify typecheck + commit

```bash
pnpm --filter @noema/web typecheck 2>&1 | grep -v "Cannot find module '@noema"
git add apps/web/src/components/copilot/risk-alerts.tsx apps/web/src/components/copilot/copilot-sidebar.tsx
git commit -m "feat(web): T10.D — RiskAlerts section, severity-filtered, sorted"
```

---

## Task T10.E — TransparencySection + AlternativesWarnings (T10.4 + T10.5)

**Goal:** Render reasoning/assumptions/constraints/context-needed (T10.4) and alternatives/warnings (T10.5) as collapsible subsections.

**Files:**
- Create: `apps/web/src/components/copilot/transparency-section.tsx`
- Create: `apps/web/src/components/copilot/alternatives-warnings.tsx`
- Modify: `apps/web/src/components/copilot/copilot-sidebar.tsx` (replace both remaining placeholders)

---

### Step 1: Create `apps/web/src/components/copilot/transparency-section.tsx`

```tsx
'use client';
/**
 * @noema/web — Copilot / TransparencySection
 *
 * Shows: Reasoning (blockquote), Assumptions (list + dismiss),
 * Context Needed (prompts), Constraints (list).
 * All subsections collapsible.
 */
import * as React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useCopilotStore } from '@/stores/copilot-store';

function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}): React.JSX.Element {
  const [open, setOpen] = React.useState(defaultOpen);
  const ChevronIcon = open ? ChevronDown : ChevronRight;
  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        type="button"
        onClick={() => { setOpen((p) => !p); }}
        className="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-muted/30 focus:outline-none"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        <ChevronIcon className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

export function TransparencySection(): React.JSX.Element {
  const hintsByPage = useCopilotStore((s) => s.hintsByPage);
  const activePageKey = useCopilotStore((s) => s.activePageKey);
  const hints = hintsByPage[activePageKey] ?? [];

  // Aggregate from all hints on this page
  const reasonings = hints.flatMap((h) => (h.reasoning !== undefined ? [h.reasoning] : []));
  const assumptions = [...new Set(hints.flatMap((h) => h.assumptions))];
  const contextNeeded = [...new Set(hints.flatMap((h) => h.contextNeeded))];
  const constraints = [...new Set(hints.flatMap((h) => h.constraints ?? []))];

  const hasAny =
    reasonings.length > 0 ||
    assumptions.length > 0 ||
    contextNeeded.length > 0 ||
    constraints.length > 0;

  if (!hasAny) return <></>;

  return (
    <div className="flex flex-col border-b border-border">
      <div className="px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Transparency
        </h3>
      </div>

      {reasonings.length > 0 && (
        <CollapsibleSection title="Reasoning">
          {reasonings.map((r, i) => (
            <blockquote
              key={i}
              className="border-l-2 border-synapse-400/40 pl-3 text-xs text-foreground/80 italic leading-relaxed"
            >
              {r}
            </blockquote>
          ))}
        </CollapsibleSection>
      )}

      {assumptions.length > 0 && (
        <CollapsibleSection title="Assumptions">
          <ul className="flex flex-col gap-1.5">
            {assumptions.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                <span className="mt-0.5 text-muted-foreground">•</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {contextNeeded.length > 0 && (
        <CollapsibleSection title="Context Needed">
          <ul className="flex flex-col gap-1.5">
            {contextNeeded.map((c, i) => (
              <li key={i} className="text-xs text-amber-600 dark:text-amber-400">
                {c}
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {constraints.length > 0 && (
        <CollapsibleSection title="Constraints" defaultOpen={false}>
          <ul className="flex flex-col gap-1.5">
            {constraints.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="mt-0.5">—</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}
    </div>
  );
}
```

---

### Step 2: Create `apps/web/src/components/copilot/alternatives-warnings.tsx`

```tsx
'use client';
/**
 * @noema/web — Copilot / AlternativesWarnings
 *
 * Alternatives: each with approach, confidence, pros/cons (collapsible).
 * Warnings: with severity, message, optional "Fix" button for auto-fixable.
 */
import * as React from 'react';
import type { IAlternative, IWarning, WarningSeverity } from '@noema/contracts';
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import { useCopilotStore } from '@/stores/copilot-store';

const WARNING_STYLE: Record<WarningSeverity, string> = {
  critical: 'border-cortex-400/40 bg-cortex-400/5 text-cortex-400',
  high:     'border-myelin-400/30 bg-myelin-400/5 text-myelin-400',
  medium:   'border-amber-400/30 bg-amber-400/5 text-amber-500',
  low:      'border-border bg-muted/20 text-muted-foreground',
};

export function AlternativesWarnings(): React.JSX.Element {
  const hintsByPage = useCopilotStore((s) => s.hintsByPage);
  const activePageKey = useCopilotStore((s) => s.activePageKey);
  const hints = hintsByPage[activePageKey] ?? [];

  const alternatives: IAlternative[] = hints.flatMap((h) => h.alternatives ?? []);
  const warnings: IWarning[] = hints.flatMap((h) => h.warnings ?? []);

  const [expandedAlts, setExpandedAlts] = React.useState<Set<number>>(new Set());

  const toggleAlt = (i: number): void => {
    setExpandedAlts((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  if (alternatives.length === 0 && warnings.length === 0) return <></>;

  return (
    <div className="flex flex-col">
      {alternatives.length > 0 && (
        <div className="border-b border-border">
          <div className="px-4 py-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Alternatives
            </h3>
          </div>
          <div className="flex flex-col gap-2 px-4 pb-4">
            {alternatives.map((alt, i) => {
              const expanded = expandedAlts.has(i);
              const ChevronIcon = expanded ? ChevronDown : ChevronRight;
              return (
                <div key={i} className="rounded-lg border border-border bg-muted/20">
                  <button
                    type="button"
                    onClick={() => { toggleAlt(i); }}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left focus:outline-none"
                  >
                    <p className="text-xs text-foreground leading-snug">{alt.approach}</p>
                    <ChevronIcon className="ml-2 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                  {expanded && (
                    <div className="border-t border-border/50 px-3 py-2 text-xs">
                      <p className="mb-2 text-muted-foreground italic">{alt.reasoning}</p>
                      {alt.pros !== undefined && alt.pros.length > 0 && (
                        <div className="mb-1">
                          <span className="font-medium text-synapse-400">Pros:</span>
                          <ul className="mt-0.5 space-y-0.5">
                            {alt.pros.map((p, j) => (
                              <li key={j} className="text-foreground/80">+ {p}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {alt.cons !== undefined && alt.cons.length > 0 && (
                        <div>
                          <span className="font-medium text-cortex-400">Cons:</span>
                          <ul className="mt-0.5 space-y-0.5">
                            {alt.cons.map((c, j) => (
                              <li key={j} className="text-foreground/80">− {c}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div>
          <div className="px-4 py-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Warnings
            </h3>
          </div>
          <div className="flex flex-col gap-2 px-4 pb-4">
            {warnings.map((w, i) => (
              <div
                key={i}
                className={['rounded-lg border p-3', WARNING_STYLE[w.severity]].join(' ')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase">{w.type}</span>
                    <p className="text-xs leading-snug">{w.message}</p>
                    {w.suggestedFix !== undefined && !w.autoFixable && (
                      <p className="text-[10px] text-muted-foreground">{w.suggestedFix}</p>
                    )}
                  </div>
                  {w.autoFixable === true && (
                    <button
                      type="button"
                      className="flex flex-shrink-0 items-center gap-1 rounded-sm bg-background/60 px-2 py-1 text-[10px] font-semibold hover:bg-background/80 transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <Wrench className="h-3 w-3" aria-hidden="true" />
                      Fix
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

---

### Step 3: Update `copilot-sidebar.tsx` — replace both remaining placeholders

Replace:
```tsx
<div className="px-4 py-3 text-xs text-muted-foreground border-b border-border">
  Transparency section (T10.E)
</div>
<div className="px-4 py-3 text-xs text-muted-foreground">
  Alternatives &amp; Warnings section (T10.F)
</div>
```
With:
```tsx
<TransparencySection />
<AlternativesWarnings />
```
Add imports:
```tsx
import { TransparencySection } from '@/components/copilot/transparency-section';
import { AlternativesWarnings } from '@/components/copilot/alternatives-warnings';
```

---

### Step 4: Verify typecheck + commit

```bash
pnpm --filter @noema/web typecheck 2>&1 | grep -v "Cannot find module '@noema"
git add apps/web/src/components/copilot/transparency-section.tsx apps/web/src/components/copilot/alternatives-warnings.tsx apps/web/src/components/copilot/copilot-sidebar.tsx
git commit -m "feat(web): T10.E — TransparencySection, AlternativesWarnings"
```

---

## Task T10.F — Barrel Export + Wire Into Layout (T10.8)

**Goal:** Create the copilot `index.ts` barrel, add `CopilotSidebar` + `CopilotToggle` to the authenticated layout, call `useAgentHintsInterceptor()` in layout, hide toggle on `/session/*`, and wire the "See all" button in `copilot-suggestions.tsx` to open the sidebar.

**Files:**
- Create: `apps/web/src/components/copilot/index.ts`
- Modify: `apps/web/src/app/(authenticated)/layout.tsx`
- Modify: `apps/web/src/components/dashboard/copilot-suggestions.tsx`

---

### Step 1: Create `apps/web/src/components/copilot/index.ts`

```ts
/**
 * @noema/web — Copilot components barrel export
 */
export { CopilotSidebar } from './copilot-sidebar';
export { CopilotToggle } from './copilot-toggle';
export { SuggestedActions } from './suggested-actions';
export { RiskAlerts } from './risk-alerts';
export { TransparencySection } from './transparency-section';
export { AlternativesWarnings } from './alternatives-warnings';
```

---

### Step 2: Update the authenticated layout

Read `apps/web/src/app/(authenticated)/layout.tsx` first. Then:

1. Add these imports near the top:
```tsx
import { useAgentHintsInterceptor } from '@/hooks/use-agent-hints-interceptor';
import { CopilotSidebar, CopilotToggle } from '@/components/copilot';
```

2. Inside the layout component (just before the `return`), call:
```tsx
useAgentHintsInterceptor();
```

3. In the JSX, add `<CopilotSidebar />` and `<CopilotToggle />` as the last children of the outermost layout wrapper (after `{children}`):
```tsx
<main className="...">
  {children}
</main>
<CopilotSidebar />
<CopilotToggle />
```

**NOTE:** The layout is a `'use client'` component (it already uses hooks). If it is currently a Server Component, it needs `'use client'` added. Read it carefully before editing.

---

### Step 3: Update `copilot-suggestions.tsx` — wire "See all" button

Find:
```tsx
onClick={() => {
  // Phase 10: open copilot sidebar
}}
```
Replace with:
```tsx
onClick={() => { open(); }}
```

Add at the top of `CopilotSuggestions`:
```tsx
const open = useCopilotStore((s) => s.open);
```

---

### Step 4: Verify typecheck

```bash
pnpm --filter @noema/web typecheck 2>&1 | grep -v "Cannot find module '@noema"
```

---

### Step 5: Commit

```bash
git add apps/web/src/components/copilot/index.ts apps/web/src/app/(authenticated)/layout.tsx apps/web/src/components/dashboard/copilot-suggestions.tsx
git commit -m "feat(web): T10.F — wire CopilotSidebar+Toggle into layout, barrel export, See-all link"
```

---

## Final Step: Phase 10 Completion

After all tasks pass typecheck:

```bash
# Full typecheck
pnpm --filter @noema/web typecheck 2>&1 | grep -v "Cannot find module '@noema"

# Use finishing-a-development-branch skill
```
