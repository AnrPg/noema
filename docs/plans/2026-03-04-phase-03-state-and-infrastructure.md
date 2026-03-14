# Phase 3 — State Management & Global Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the four Zustand stores, agent-hints interceptor, command palette, keyboard shortcut system, error boundary, and toast manager that all subsequent feature phases depend on.

**Architecture:** Zustand stores live in `apps/web/src/stores/` (app-local, not a shared package) following the same pattern as `@noema/auth`'s `useAuthStore` with `create<T>()` and `persist` only where specified. The `useAgentHintsInterceptor` subscribes to TanStack Query's `QueryCache` to extract `agentHints` from every `IApiResponse<T>` automatically. All global UI pieces (command palette, error boundary, toast) slot into the existing `Providers` tree in `apps/web/src/app/providers.tsx`.

**Tech Stack:** Zustand 5, TanStack Query v5 QueryCache subscription, Radix UI Dialog (direct import), `@noema/ui` Toast primitives, Next.js `usePathname`, React class component for error boundary (hooks cannot be error boundaries), lucide-react icons.

---

## Pre-flight

### Task 0: Add missing dependencies

**Files:**
- Modify: `apps/web/package.json`

**Step 1: Add `zustand` and `@radix-ui/react-dialog` to web app**

```json
// In "dependencies" block of apps/web/package.json, add:
"@radix-ui/react-dialog": "^1.1.2",
"zustand": "^5.0.0"
```

**Step 2: Install**

```bash
pnpm install
```

Expected: lock file updated, no errors.

**Step 3: Verify typecheck still passes**

```bash
pnpm --filter @noema/web typecheck
```

Expected: zero errors.

**Step 4: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): add zustand and radix dialog deps for phase 03"
```

---

## T3.1 — Zustand Stores

### Task 1: `useSessionStore` — Active learning session state

**Files:**
- Create: `apps/web/src/stores/session-store.ts`

**Context:** This store holds the in-memory state of a live review session — which card is active, the queue, and metacognitive signals the user provides before/after each answer. It is **not** persisted (sessions are server-managed; the store is ephemeral working memory).

The auth store pattern (`packages/auth/src/store.ts`) is the model. Key differences: no `persist` middleware, and the state shape is domain-specific to session.

**Step 1: Write the store**

```typescript
// apps/web/src/stores/session-store.ts
/**
 * Session Store — Active learning session working memory.
 *
 * Holds ephemeral state for a single review session.
 * Not persisted — cleared when the user navigates away.
 */

import type { IAttemptInput, ISessionDto, ISessionQueueDto } from '@noema/api-client/session';
import { create } from 'zustand';

// ============================================================================
// State Shape
// ============================================================================

interface ISessionState {
  activeSession: ISessionDto | null;
  currentCardIndex: number;
  queue: ISessionQueueDto | null;
  pendingAttempt: Partial<IAttemptInput> | null;
  elapsedTime: number;
  isPaused: boolean;
}

// ============================================================================
// Actions
// ============================================================================

interface ISessionActions {
  setSession: (session: ISessionDto) => void;
  advanceCard: () => void;
  setConfidenceBefore: (confidence: number) => void;
  setConfidenceAfter: (confidence: number) => void;
  recordDwellTime: (ms: number) => void;
  resetAttempt: () => void;
  clear: () => void;
}

// ============================================================================
// Store
// ============================================================================

const initialState: ISessionState = {
  activeSession: null,
  currentCardIndex: 0,
  queue: null,
  pendingAttempt: null,
  elapsedTime: 0,
  isPaused: false,
};

export const useSessionStore = create<ISessionState & ISessionActions>()((set) => ({
  ...initialState,

  setSession: (session) => set({ activeSession: session, currentCardIndex: session.currentCardIndex }),

  advanceCard: () =>
    set((s) => ({
      currentCardIndex: s.currentCardIndex + 1,
      pendingAttempt: null,
      elapsedTime: 0,
    })),

  setConfidenceBefore: (confidence) =>
    set((s) => ({
      pendingAttempt: { ...s.pendingAttempt, confidenceBefore: confidence },
    })),

  setConfidenceAfter: (confidence) =>
    set((s) => ({
      pendingAttempt: { ...s.pendingAttempt, confidenceAfter: confidence },
    })),

  recordDwellTime: (ms) =>
    set((s) => ({
      pendingAttempt: { ...s.pendingAttempt, dwellTimeMs: ms },
    })),

  resetAttempt: () => set({ pendingAttempt: null, elapsedTime: 0 }),

  clear: () => set(initialState),
}));
```

**Step 2: Verify typecheck**

```bash
pnpm --filter @noema/web typecheck
```

Expected: zero errors.

---

### Task 2: `useGraphStore` — Knowledge graph viewport state

**Files:**
- Create: `apps/web/src/stores/graph-store.ts`

**Context:** Controls which node is selected, camera position, zoom level, and which data-overlay layers are visible. The `OverlayType` union is defined locally — there are no existing shared types for it yet.

**Step 1: Write the store**

```typescript
// apps/web/src/stores/graph-store.ts
/**
 * Graph Store — Knowledge graph viewport state.
 *
 * Controls camera, selection, overlays, and layout mode.
 * Not persisted — viewport resets on navigation.
 */

import { create } from 'zustand';

// ============================================================================
// Domain Types
// ============================================================================

export type OverlayType = 'centrality' | 'frontier' | 'misconceptions' | 'bridges' | 'prerequisites';

export type LayoutMode = 'force' | 'hierarchical' | 'radial';

interface IViewportCenter {
  x: number;
  y: number;
}

// ============================================================================
// State Shape
// ============================================================================

interface IGraphState {
  viewportCenter: IViewportCenter;
  zoom: number;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  activeOverlays: Set<OverlayType>;
  layoutMode: LayoutMode;
}

// ============================================================================
// Actions
// ============================================================================

interface IGraphActions {
  selectNode: (nodeId: string) => void;
  deselectNode: () => void;
  toggleOverlay: (overlay: OverlayType) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  resetViewport: () => void;
  setHoveredNode: (nodeId: string | null) => void;
}

// ============================================================================
// Store
// ============================================================================

const initialState: IGraphState = {
  viewportCenter: { x: 0, y: 0 },
  zoom: 1,
  selectedNodeId: null,
  hoveredNodeId: null,
  activeOverlays: new Set(),
  layoutMode: 'force',
};

export const useGraphStore = create<IGraphState & IGraphActions>()((set) => ({
  ...initialState,

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

  deselectNode: () => set({ selectedNodeId: null }),

  toggleOverlay: (overlay) =>
    set((s) => {
      const next = new Set(s.activeOverlays);
      if (next.has(overlay)) {
        next.delete(overlay);
      } else {
        next.add(overlay);
      }
      return { activeOverlays: next };
    }),

  setLayoutMode: (mode) => set({ layoutMode: mode }),

  resetViewport: () =>
    set({ viewportCenter: { x: 0, y: 0 }, zoom: 1, selectedNodeId: null, hoveredNodeId: null }),

  setHoveredNode: (nodeId) => set({ hoveredNodeId: nodeId }),
}));
```

**Step 2: Verify typecheck**

```bash
pnpm --filter @noema/web typecheck
```

Expected: zero errors.

---

### Task 3: `useScheduleStore` — Cached scheduling plan

**Files:**
- Create: `apps/web/src/stores/schedule-store.ts`

**Context:** Caches the most recently fetched `IDualLanePlanResult` from the scheduler service so multiple UI widgets can read it without re-fetching. Not persisted — always fresh from the API.

**Step 1: Write the store**

```typescript
// apps/web/src/stores/schedule-store.ts
/**
 * Schedule Store — Cached scheduling intelligence.
 *
 * Holds the latest dual-lane plan from the scheduler service.
 * Not persisted — always fetched fresh on page load.
 */

import type { IDualLanePlanResult } from '@noema/api-client/scheduler';
import { create } from 'zustand';

// ============================================================================
// State + Actions
// ============================================================================

interface IScheduleState {
  currentPlan: IDualLanePlanResult | null;
  lastPlanTime: number | null;
}

interface IScheduleActions {
  setPlan: (plan: IDualLanePlanResult) => void;
  clearPlan: () => void;
}

// ============================================================================
// Store
// ============================================================================

export const useScheduleStore = create<IScheduleState & IScheduleActions>()((set) => ({
  currentPlan: null,
  lastPlanTime: null,

  setPlan: (plan) => set({ currentPlan: plan, lastPlanTime: Date.now() }),

  clearPlan: () => set({ currentPlan: null, lastPlanTime: null }),
}));
```

**Step 2: Verify typecheck**

```bash
pnpm --filter @noema/web typecheck
```

Expected: zero errors.

---

### Task 4: `useCopilotStore` — Cognitive Copilot sidebar state

**Files:**
- Create: `apps/web/src/stores/copilot-store.ts`

**Context:** The Cognitive Copilot sidebar shows AI-generated hints from `agentHints` fields. This store tracks whether the sidebar is open (persisted to localStorage) and the current hint set per page route (not persisted — hints expire or change per page visit).

Use `partialize` to persist only `isOpen` — same pattern as `useAuthStore`.

**Step 1: Write the store**

```typescript
// apps/web/src/stores/copilot-store.ts
/**
 * Copilot Store — Cognitive Copilot sidebar state.
 *
 * Tracks sidebar open/close (persisted) and per-page hints (ephemeral).
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
}

interface ICopilotActions {
  toggle: () => void;
  open: () => void;
  close: () => void;
  pushHints: (pageKey: string, hints: IAgentHints) => void;
  clearPage: (pageKey: string) => void;
  setActivePage: (pageKey: string) => void;
}

// ============================================================================
// Store
// ============================================================================

export const useCopilotStore = create<ICopilotState & ICopilotActions>()(
  persist(
    (set) => ({
      isOpen: false,
      hintsByPage: {},
      activePageKey: '/',

      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),

      pushHints: (pageKey, hints) =>
        set((s) => {
          const existing = s.hintsByPage[pageKey] ?? [];
          // Deduplicate: skip if all action IDs from incoming hints are already present
          const existingActionIds = new Set(
            existing.flatMap((h) => h.suggestedNextActions.map((a) => a.action))
          );
          const hasNew = hints.suggestedNextActions.some((a) => !existingActionIds.has(a.action));
          if (!hasNew) return s;
          return { hintsByPage: { ...s.hintsByPage, [pageKey]: [...existing, hints] } };
        }),

      clearPage: (pageKey) =>
        set((s) => {
          const next = { ...s.hintsByPage };
          delete next[pageKey];
          return { hintsByPage: next };
        }),

      setActivePage: (pageKey) => set({ activePageKey: pageKey }),
    }),
    {
      name: 'noema-copilot',
      storage: createJSONStorage(() => localStorage),
      // Only persist sidebar open/close preference
      partialize: (state) => ({ isOpen: state.isOpen }),
    }
  )
);
```

**Step 2: Verify typecheck**

```bash
pnpm --filter @noema/web typecheck
```

Expected: zero errors.

---

### Task 5: Stores barrel export

**Files:**
- Create: `apps/web/src/stores/index.ts`

**Step 1: Write barrel**

```typescript
// apps/web/src/stores/index.ts
export { useSessionStore } from './session-store.js';
export { useGraphStore } from './graph-store.js';
export type { LayoutMode, OverlayType } from './graph-store.js';
export { useScheduleStore } from './schedule-store.js';
export { useCopilotStore } from './copilot-store.js';
```

**Step 2: Verify typecheck + commit**

```bash
pnpm --filter @noema/web typecheck
```

```bash
git add apps/web/src/stores/
git commit -m "feat(web): add T3.1 Zustand stores (session, graph, schedule, copilot)"
```

---

## T3.2 — Agent Hints Interceptor

### Task 6: `useAgentHintsInterceptor`

**Files:**
- Create: `apps/web/src/hooks/use-agent-hints-interceptor.ts`

**Context:** Every `IApiResponse<T>` contains an `agentHints: IAgentHints` field. This hook subscribes to TanStack Query's `QueryCache` and automatically pushes hints into `useCopilotStore` whenever a query succeeds. It:
1. Runs once at the app root (inside `Providers`)
2. Inspects `event.query.state.data` for `agentHints`
3. Keys hints by the current `pathname`
4. Deduplicates (handled in the store's `pushHints`)
5. Schedules expiry via `setTimeout` based on `validityPeriod`

The validity period mapping:
- `immediate` → 30 seconds
- `short` → 5 minutes
- `medium` → 1 hour
- `long` → 24 hours
- `indefinite` → never expires

**Important:** This hook must be called inside a component that has access to both `useQueryClient` and `usePathname`. It uses `useEffect` to set up and tear down the subscription.

**Step 1: Write the hook**

```typescript
// apps/web/src/hooks/use-agent-hints-interceptor.ts
/**
 * Agent Hints Interceptor
 *
 * Subscribes to TanStack Query's QueryCache and automatically extracts
 * agentHints from every IApiResponse<T>, pushing them into useCopilotStore
 * keyed by the current route.
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

// ============================================================================
// Type guard: check if data is IApiResponse-shaped
// ============================================================================

function hasAgentHints(data: unknown): data is { agentHints: IAgentHints } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'agentHints' in data &&
    typeof (data as Record<string, unknown>)['agentHints'] === 'object'
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
  const setActivePage = useCopilotStore((s) => s.setActivePage);

  // Update active page key when route changes
  useEffect(() => {
    setActivePage(pathname);
  }, [pathname, setActivePage]);

  // Subscribe to QueryCache for successful query results
  useEffect(() => {
    const cache = queryClient.getQueryCache();

    const unsubscribe = cache.subscribe((event) => {
      if (event.type !== 'updated') return;
      if (event.action.type !== 'success') return;

      const data: unknown = event.query.state.data;
      if (!hasAgentHints(data)) return;

      const hints = data.agentHints;
      pushHints(pathname, hints);

      // Schedule expiry
      const expiryMs = VALIDITY_MS[hints.validityPeriod];
      if (expiryMs !== null) {
        const timerId = window.setTimeout(() => {
          clearPage(pathname);
        }, expiryMs);

        // Cleanup is handled by the unsubscribe / re-render cycle;
        // this timer fires once and is not cancellable here by design
        // (hints naturally expire, a new fetch will push fresh ones).
        return () => {
          window.clearTimeout(timerId);
        };
      }

      return undefined;
    });

    return () => {
      unsubscribe();
    };
  }, [queryClient, pathname, pushHints, clearPage]);
}
```

**Step 2: Verify typecheck**

```bash
pnpm --filter @noema/web typecheck
```

Expected: zero errors.

**Step 3: Wire into Providers**

Modify `apps/web/src/app/providers.tsx` to call the interceptor inside a child component (it needs to be inside `QueryClientProvider`):

```typescript
// apps/web/src/app/providers.tsx
'use client';

import { configureApiClient } from '@noema/api-client';
import { AuthProvider, useAuthStore } from '@noema/auth';
import { ThemeProvider } from '@noema/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { useAgentHintsInterceptor } from '@/hooks/use-agent-hints-interceptor';

configureApiClient({
  baseUrl: process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:8080/api',
  getAccessToken: () => useAuthStore.getState().accessToken,
});

// Inner component so it has access to QueryClientProvider context
function QueryCacheWatcher(): null {
  useAgentHintsInterceptor();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60 * 1000, refetchOnWindowFocus: false },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <QueryCacheWatcher />
      <ThemeProvider defaultTheme="dark">
        <AuthProvider>{children}</AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
```

**Step 4: Verify typecheck + commit**

```bash
pnpm --filter @noema/web typecheck
```

```bash
git add apps/web/src/hooks/use-agent-hints-interceptor.ts apps/web/src/app/providers.tsx
git commit -m "feat(web): add T3.2 agent hints interceptor wired into providers"
```

---

## T3.3 — Command Palette

### Task 7: `CommandPalette` component

**Files:**
- Create: `apps/web/src/components/command-palette.tsx`

**Context:** Cmd+K launcher. Uses `@radix-ui/react-dialog` directly (not the non-existent `@noema/ui` Dialog wrapper). Commands are grouped by category. Fuzzy search filters by label + keywords. Arrow keys navigate; Enter executes.

The component manages its own open state via the global keyboard shortcut `Cmd/Ctrl+K`. It is rendered once at the app root.

**Step 1: Write the component**

```tsx
// apps/web/src/components/command-palette.tsx
/**
 * Command Palette — Cmd+K quick-action launcher.
 *
 * Global keyboard shortcut opens a modal with fuzzy-matched commands
 * grouped by category. Arrow keys navigate; Enter executes.
 */

'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

// ============================================================================
// Types
// ============================================================================

export interface ICommand {
  id: string;
  label: string;
  keywords: string[];
  icon?: React.ReactNode;
  category: string;
  action: () => void;
}

// ============================================================================
// Fuzzy match helper
// ============================================================================

function matches(cmd: ICommand, query: string): boolean {
  if (query === '') return true;
  const q = query.toLowerCase();
  return (
    cmd.label.toLowerCase().includes(q) ||
    cmd.keywords.some((k) => k.toLowerCase().includes(q))
  );
}

// ============================================================================
// Component
// ============================================================================

interface ICommandPaletteProps {
  extraCommands?: ICommand[];
}

export function CommandPalette({ extraCommands = [] }: ICommandPaletteProps): React.JSX.Element {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // ---- Built-in command registry ----
  const builtInCommands = useMemo<ICommand[]>(
    () => [
      // Navigation
      {
        id: 'nav-dashboard',
        label: 'Go to Dashboard',
        keywords: ['home', 'overview'],
        category: 'Navigation',
        action: () => { router.push('/dashboard'); },
      },
      {
        id: 'nav-knowledge-map',
        label: 'Go to Knowledge Map',
        keywords: ['graph', 'kg', 'knowledge'],
        category: 'Navigation',
        action: () => { router.push('/knowledge'); },
      },
      {
        id: 'nav-reviews',
        label: 'Go to Reviews',
        keywords: ['study', 'session', 'cards'],
        category: 'Navigation',
        action: () => { router.push('/learning'); },
      },
      {
        id: 'nav-cards',
        label: 'Go to Cards',
        keywords: ['flashcard', 'deck'],
        category: 'Navigation',
        action: () => { router.push('/cards'); },
      },
      {
        id: 'nav-settings',
        label: 'Go to Settings',
        keywords: ['preferences', 'config'],
        category: 'Navigation',
        action: () => { router.push('/settings'); },
      },
      {
        id: 'nav-profile',
        label: 'Go to Profile',
        keywords: ['account', 'user'],
        category: 'Navigation',
        action: () => { router.push('/profile'); },
      },
      // Actions
      {
        id: 'action-new-session',
        label: 'Start a New Session',
        keywords: ['review', 'study', 'start', 'begin'],
        category: 'Actions',
        action: () => { router.push('/learning/new'); },
      },
      {
        id: 'action-create-card',
        label: 'Create a Card',
        keywords: ['add', 'new card', 'flashcard'],
        category: 'Actions',
        action: () => { router.push('/cards/new'); },
      },
      {
        id: 'action-misconceptions',
        label: 'Scan for Misconceptions',
        keywords: ['analyze', 'check', 'detect'],
        category: 'Actions',
        action: () => { router.push('/knowledge/misconceptions'); },
      },
    ],
    [router]
  );

  const allCommands = useMemo(
    () => [...builtInCommands, ...extraCommands],
    [builtInCommands, extraCommands]
  );

  const filtered = useMemo(
    () => allCommands.filter((cmd) => matches(cmd, query)),
    [allCommands, query]
  );

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, ICommand[]>();
    for (const cmd of filtered) {
      const existing = map.get(cmd.category) ?? [];
      map.set(cmd.category, [...existing, cmd]);
    }
    return map;
  }, [filtered]);

  // Reset selection when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); };
  }, []);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => { inputRef.current?.focus(); });
    }
  }, [open]);

  const execute = useCallback(
    (cmd: ICommand) => {
      setOpen(false);
      cmd.action();
    },
    []
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        const cmd = filtered[selectedIndex];
        if (cmd !== undefined) execute(cmd);
      }
    },
    [filtered, selectedIndex, execute]
  );

  // Flat index tracker for grouped rendering
  let flatIndex = 0;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fade-slide-in" />
        <Dialog.Content
          className="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-full max-w-xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
          aria-label="Command palette"
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); }}
              onKeyDown={handleKeyDown}
              placeholder="Search commands..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
              Esc
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto py-2">
            {filtered.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No commands found.
              </p>
            )}
            {[...grouped.entries()].map(([category, commands]) => (
              <div key={category}>
                <p className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {category}
                </p>
                {commands.map((cmd) => {
                  const currentIndex = flatIndex;
                  flatIndex += 1;
                  const isSelected = currentIndex === selectedIndex;
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      className={[
                        'flex w-full items-center gap-3 px-4 py-2 text-sm transition-colors',
                        isSelected
                          ? 'bg-primary/10 text-primary'
                          : 'text-foreground hover:bg-muted',
                      ].join(' ')}
                      onClick={() => { execute(cmd); }}
                      onMouseEnter={() => { setSelectedIndex(currentIndex); }}
                    >
                      {cmd.icon !== undefined && (
                        <span className="shrink-0 text-muted-foreground">{cmd.icon}</span>
                      )}
                      {cmd.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <Dialog.Title className="sr-only">Command Palette</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search and execute commands. Use arrow keys to navigate and Enter to execute.
          </Dialog.Description>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

**Step 2: Verify typecheck**

```bash
pnpm --filter @noema/web typecheck
```

Expected: zero errors.

**Step 3: Mount in authenticated layout**

Modify `apps/web/src/app/(authenticated)/layout.tsx` — add `<CommandPalette />` inside `AuthGuard` (it needs router access):

```tsx
// In the import block, add:
import { CommandPalette } from '@/components/command-palette';

// In AuthenticatedLayout return, wrap with a fragment:
return (
  <AuthGuard onUnauthenticated={() => { router.push('/login'); }}>
    <CommandPalette />
    <DashboardLayout>
      {/* ... rest unchanged ... */}
    </DashboardLayout>
  </AuthGuard>
);
```

**Step 4: Verify typecheck + commit**

```bash
pnpm --filter @noema/web typecheck
```

```bash
git add apps/web/src/components/command-palette.tsx apps/web/src/app/\(authenticated\)/layout.tsx
git commit -m "feat(web): add T3.3 command palette with Cmd+K global shortcut"
```

---

## T3.4 — Keyboard Shortcut System

### Task 8: `useKeyboardShortcuts` hook

**Files:**
- Create: `apps/web/src/hooks/use-keyboard-shortcuts.ts`

**Context:** A hook that registers page-scoped keyboard shortcuts. Shortcuts do not fire when focus is in an input/textarea/select/contenteditable (unless `ignoreInputs: true`). Platform detection maps `mod` to `metaKey` on macOS and `ctrlKey` elsewhere.

Also creates a shortcut reference panel: pressing `Shift+?` opens a modal listing all currently registered shortcuts. The modal state is managed by a module-level atom so any number of pages can register shortcuts and the panel shows all of them.

**Step 1: Write the hook**

```typescript
// apps/web/src/hooks/use-keyboard-shortcuts.ts
/**
 * Keyboard Shortcut System
 *
 * useKeyboardShortcuts() registers page-scoped shortcuts. Shortcuts do not
 * fire when focus is in an input field unless ignoreInputs is set.
 *
 * Pressing Shift+? opens a reference panel listing all active shortcuts.
 */

'use client';

import { useEffect } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface IShortcutDef {
  /** The key to listen for (e.g. 'k', 'ArrowDown', 'Enter') */
  key: string;
  /** Optional modifier key */
  mod?: 'cmd' | 'ctrl' | 'shift' | 'alt';
  /** Whether to fire in input fields (default: false) */
  ignoreInputs?: boolean;
  /** Human-readable label for the reference panel */
  label: string;
  /** Handler to call when shortcut fires */
  handler: () => void;
  /** Optional condition — shortcut only fires when this returns true */
  when?: () => boolean;
}

// ============================================================================
// Platform detection
// ============================================================================

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /mac/i.test(navigator.platform);
}

function modPressed(e: KeyboardEvent, mod: IShortcutDef['mod']): boolean {
  if (mod === undefined) return true;
  if (mod === 'cmd') return isMac() ? e.metaKey : e.ctrlKey;
  if (mod === 'ctrl') return e.ctrlKey;
  if (mod === 'shift') return e.shiftKey;
  if (mod === 'alt') return e.altKey;
  return false;
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (el === null) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return false;
}

// ============================================================================
// Global shortcut registry (module-level for the reference panel)
// ============================================================================

const _registry = new Map<string, IShortcutDef[]>();

export function getRegisteredShortcuts(): IShortcutDef[] {
  return [..._registry.values()].flat();
}

// ============================================================================
// Hook
// ============================================================================

let _idCounter = 0;

export function useKeyboardShortcuts(shortcuts: IShortcutDef[]): void {
  useEffect(() => {
    const id = String(++_idCounter);
    _registry.set(id, shortcuts);

    const handler = (e: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        if (e.key !== shortcut.key) continue;
        if (!modPressed(e, shortcut.mod)) continue;
        if (!(shortcut.ignoreInputs === true) && isInputFocused()) continue;
        if (shortcut.when !== undefined && !shortcut.when()) continue;
        e.preventDefault();
        shortcut.handler();
        break;
      }
    };

    window.addEventListener('keydown', handler);

    return () => {
      window.removeEventListener('keydown', handler);
      _registry.delete(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // shortcuts are registered once per mount
}
```

**Step 2: Create the shortcut reference panel**

```tsx
// apps/web/src/components/shortcut-reference-panel.tsx
/**
 * Shortcut Reference Panel — Shift+? opens a modal listing all active shortcuts.
 */

'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getRegisteredShortcuts, type IShortcutDef } from '@/hooks/use-keyboard-shortcuts';

function formatShortcut(s: IShortcutDef): string {
  const parts: string[] = [];
  if (s.mod === 'cmd') parts.push('⌘');
  else if (s.mod === 'ctrl') parts.push('Ctrl');
  else if (s.mod === 'shift') parts.push('Shift');
  else if (s.mod === 'alt') parts.push('Alt');
  parts.push(s.key.length === 1 ? s.key.toUpperCase() : s.key);
  return parts.join('+');
}

export function ShortcutReferencePanel(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState<IShortcutDef[]>([]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && e.shiftKey && !(document.activeElement instanceof HTMLInputElement)) {
        e.preventDefault();
        setShortcuts(getRegisteredShortcuts());
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); };
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-card border border-border rounded-xl shadow-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-base font-semibold">Keyboard Shortcuts</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            All active keyboard shortcuts on the current page.
          </Dialog.Description>
          <ul className="space-y-2">
            {shortcuts.map((s, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{s.label}</span>
                <kbd className="inline-flex items-center rounded border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {formatShortcut(s)}
                </kbd>
              </li>
            ))}
            {shortcuts.length === 0 && (
              <li className="text-sm text-muted-foreground text-center py-4">
                No shortcuts registered on this page.
              </li>
            )}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

**Step 3: Mount `ShortcutReferencePanel` in layout**

Add to `apps/web/src/app/(authenticated)/layout.tsx` alongside `<CommandPalette />`:

```tsx
import { ShortcutReferencePanel } from '@/components/shortcut-reference-panel';

// Inside AuthenticatedLayout return:
<AuthGuard ...>
  <CommandPalette />
  <ShortcutReferencePanel />
  <DashboardLayout>...</DashboardLayout>
</AuthGuard>
```

**Step 4: Verify typecheck + commit**

```bash
pnpm --filter @noema/web typecheck
```

```bash
git add apps/web/src/hooks/use-keyboard-shortcuts.ts apps/web/src/components/shortcut-reference-panel.tsx apps/web/src/app/\(authenticated\)/layout.tsx
git commit -m "feat(web): add T3.4 keyboard shortcut system with Shift+? reference panel"
```

---

## T3.5 — Error Boundary

### Task 9: `SectionErrorBoundary`

**Files:**
- Create: `apps/web/src/components/section-error-boundary.tsx`

**Context:** React error boundaries must be class components — hooks cannot catch render errors. This wraps any page section and catches failures, rendering an inline error card with a Retry button and a Report link.

Uses `EmptyState` from `@noema/ui` for the visual treatment.

**Step 1: Write the component**

```tsx
// apps/web/src/components/section-error-boundary.tsx
/**
 * Section Error Boundary
 *
 * Wraps a page section. Catches render errors and shows an inline error card
 * instead of crashing the whole page.
 */

import { EmptyState } from '@noema/ui';
import { AlertTriangle } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

// ============================================================================
// Types
// ============================================================================

interface IProps {
  children: ReactNode;
  /** Optional custom fallback — overrides the default EmptyState */
  fallback?: ReactNode;
}

interface IState {
  hasError: boolean;
  error: Error | null;
}

// ============================================================================
// Component
// ============================================================================

export class SectionErrorBoundary extends Component<IProps, IState> {
  constructor(props: IProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): IState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Structured logging — provides context for debugging
    console.error('[SectionErrorBoundary]', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback !== undefined) {
      return this.props.fallback;
    }

    const message = this.state.error?.message ?? 'An unexpected error occurred.';

    return (
      <EmptyState
        icon={<AlertTriangle className="h-8 w-8 text-destructive" />}
        title="Something went wrong"
        description={message}
        action={{
          label: 'Retry',
          onClick: this.handleRetry,
        }}
        className="rounded-lg border border-destructive/30 bg-destructive/5"
      />
    );
  }
}
```

**Step 2: Verify typecheck**

```bash
pnpm --filter @noema/web typecheck
```

Expected: zero errors.

**Step 3: Commit**

```bash
git add apps/web/src/components/section-error-boundary.tsx
git commit -m "feat(web): add T3.5 SectionErrorBoundary component"
```

---

## T3.6 — Toast Manager

### Task 10: `useToast` hook and `ToastProvider` component

**Files:**
- Create: `apps/web/src/hooks/use-toast.ts`
- Create: `apps/web/src/components/toast-provider.tsx`

**Context:** The `@noema/ui` Toast system uses Radix UI Toast primitives (`ToastProvider`, `ToastViewport`, `Toast`, etc.) which require both a `<ToastProvider>` in the tree and a `<ToastViewport>` that renders the actual toast elements.

The pattern: a `useToast()` hook returns `{ toast }` where `toast.success()`, `toast.error()`, `toast.info()`, `toast.warning()` add items to a store. `<ToastProvider>` in the tree renders each item using the Radix primitives.

Since `@noema/ui` exports `ToastProvider` (the Radix wrapper, **not** the viewport/list), we need to also render `<ToastViewport />` in `toast-provider.tsx`.

Auto-dismiss timings: success=3s, error=5s, info=3s, warning=4s.

**Step 1: Write `use-toast.ts`**

```typescript
// apps/web/src/hooks/use-toast.ts
/**
 * Toast Manager Hook
 *
 * Provides toast.success/error/info/warning() helpers that push items into
 * a module-level store. Consumed by ToastProvider to render the toasts.
 */

'use client';

import { useState, useCallback, useEffect } from 'react';

// ============================================================================
// Types
// ============================================================================

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface IToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  durationMs: number;
}

// ============================================================================
// Module-level pub/sub (avoids React Context overhead for a simple manager)
// ============================================================================

type Listener = (toasts: IToastItem[]) => void;
const _listeners = new Set<Listener>();
let _toasts: IToastItem[] = [];
let _idCounter = 0;

const DURATIONS: Record<ToastVariant, number> = {
  success: 3000,
  error: 5000,
  info: 3000,
  warning: 4000,
};

function addToast(message: string, variant: ToastVariant): void {
  const id = String(++_idCounter);
  const item: IToastItem = { id, message, variant, durationMs: DURATIONS[variant] };
  _toasts = [..._toasts, item];
  _listeners.forEach((l) => { l(_toasts); });
}

function removeToast(id: string): void {
  _toasts = _toasts.filter((t) => t.id !== id);
  _listeners.forEach((l) => { l(_toasts); });
}

// ============================================================================
// Public toast API (callable outside React)
// ============================================================================

export const toast = {
  success: (message: string) => { addToast(message, 'success'); },
  error: (message: string) => { addToast(message, 'error'); },
  info: (message: string) => { addToast(message, 'info'); },
  warning: (message: string) => { addToast(message, 'warning'); },
};

// ============================================================================
// Hook (used by ToastProvider to read the live list)
// ============================================================================

export function useToastList(): { toasts: IToastItem[]; dismiss: (id: string) => void } {
  const [toasts, setToasts] = useState<IToastItem[]>(_toasts);

  useEffect(() => {
    const listener: Listener = (items) => { setToasts(items); };
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }, []);

  const dismiss = useCallback((id: string) => { removeToast(id); }, []);

  return { toasts, dismiss };
}

// ============================================================================
// useToast — convenience hook that returns the toast action object
// ============================================================================

export function useToast(): { toast: typeof toast } {
  return { toast };
}
```

**Step 2: Write `toast-provider.tsx`**

```tsx
// apps/web/src/components/toast-provider.tsx
/**
 * Toast Provider
 *
 * Renders active toasts in the bottom-right corner using @noema/ui
 * Toast primitives. Mount once at the app root (inside Providers).
 */

'use client';

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider as RadixToastProvider,
  ToastViewport,
} from '@noema/ui';
import { useEffect } from 'react';
import { useToastList, type ToastVariant } from '@/hooks/use-toast';

// Variant → Radix variant mapping
const VARIANT_MAP: Record<ToastVariant, 'default' | 'destructive' | 'success'> = {
  success: 'success',
  error: 'destructive',
  info: 'default',
  warning: 'default',
};

function ToastList(): React.JSX.Element {
  const { toasts, dismiss } = useToastList();

  return (
    <>
      {toasts.map((item) => (
        <Toast
          key={item.id}
          variant={VARIANT_MAP[item.variant]}
          duration={item.durationMs}
          onOpenChange={(open) => {
            if (!open) dismiss(item.id);
          }}
        >
          <ToastDescription>{item.message}</ToastDescription>
          <ToastClose />
        </Toast>
      ))}
    </>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <RadixToastProvider>
      {children}
      <ToastList />
      <ToastViewport className="fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:max-w-[420px]" />
    </RadixToastProvider>
  );
}
```

**Step 3: Wire `ToastProvider` into `Providers`**

Modify `apps/web/src/app/providers.tsx`:

```typescript
// Add import
import { ToastProvider } from '@/components/toast-provider';

// Wrap children:
return (
  <QueryClientProvider client={queryClient}>
    <QueryCacheWatcher />
    <ThemeProvider defaultTheme="dark">
      <AuthProvider>
        <ToastProvider>
          {children}
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);
```

**Step 4: Verify typecheck + commit**

```bash
pnpm --filter @noema/web typecheck
```

```bash
git add apps/web/src/hooks/use-toast.ts apps/web/src/components/toast-provider.tsx apps/web/src/app/providers.tsx
git commit -m "feat(web): add T3.6 toast manager with success/error/info/warning variants"
```

---

## Final Verification

### Task 11: Full build and typecheck

**Step 1: Run full typecheck**

```bash
pnpm --filter @noema/web typecheck
```

Expected: zero errors.

**Step 2: Run build**

```bash
pnpm --filter @noema/web build
```

Expected: successful Next.js build, zero errors.

**Step 3: Final commit if any files were auto-modified**

```bash
git status
# If anything is staged/modified:
git add -p
git commit -m "chore(web): phase 03 build verification cleanup"
```

---

## Acceptance Checklist

- [ ] `apps/web/src/stores/session-store.ts` — `useSessionStore` exported
- [ ] `apps/web/src/stores/graph-store.ts` — `useGraphStore` exported
- [ ] `apps/web/src/stores/schedule-store.ts` — `useScheduleStore` exported
- [ ] `apps/web/src/stores/copilot-store.ts` — `useCopilotStore` exported, `isOpen` persists
- [ ] `apps/web/src/stores/index.ts` — barrel re-exports all four stores
- [ ] `apps/web/src/hooks/use-agent-hints-interceptor.ts` — auto-pushes hints from API responses
- [ ] `apps/web/src/hooks/use-keyboard-shortcuts.ts` — `useKeyboardShortcuts` + `getRegisteredShortcuts`
- [ ] `apps/web/src/hooks/use-toast.ts` — `toast.success/error/info/warning` + `useToast`
- [ ] `apps/web/src/components/command-palette.tsx` — Cmd+K opens, Escape closes, arrow+Enter nav
- [ ] `apps/web/src/components/shortcut-reference-panel.tsx` — Shift+? reference panel
- [ ] `apps/web/src/components/section-error-boundary.tsx` — class component, Retry button
- [ ] `apps/web/src/components/toast-provider.tsx` — stacks in bottom-right, auto-dismiss
- [ ] `pnpm --filter @noema/web typecheck` → zero errors
- [ ] `pnpm --filter @noema/web build` → successful
