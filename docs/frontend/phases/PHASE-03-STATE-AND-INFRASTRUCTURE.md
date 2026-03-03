# Phase 3 — State Management & Global Infrastructure

> **Codename:** `Hippocampus`  
> **Depends on:** Phase 2 (API Client)  
> **Unlocks:** Phase 5 (Dashboard) and all feature phases  
> **Estimated effort:** 2–3 days

---

## Philosophy

The hippocampus orchestrates memory formation — this phase sets up the
**short-term and working memory** of the frontend. All state management uses
Zustand (per ADR-0008 and the existing `@noema/auth` pattern). Stores are
modular, single-responsibility, and live in the web app (not a shared package)
since they contain app-specific orchestration logic.

Additionally, this phase builds the **global infrastructure** components that
every page needs: command palette, keyboard shortcuts, error boundaries, and
toast orchestration.

---

## Tasks

### T3.1 — Zustand Store Architecture

Create the following Zustand stores in `apps/web/src/stores/`:

**`useSessionStore`** — Active learning session working memory

- State: `activeSession: SessionDto | null`, `currentCardIndex: number`,
  `queue: SessionQueueDto | null`,
  `pendingAttempt: Partial<AttemptInput> | null`, `elapsedTime: number`,
  `isPaused: boolean`
- Actions: `setSession()`, `advanceCard()`, `setConfidenceBefore()`,
  `setConfidenceAfter()`, `recordDwellTime()`, `resetAttempt()`, `clear()`
- **Not** persisted — active sessions are ephemeral

**`useGraphStore`** — Knowledge graph viewport state

- State: `viewportCenter: { x, y }`, `zoom: number`,
  `selectedNodeId: string | null`, `activeOverlays: Set<OverlayType>`,
  `layoutMode: 'force' | 'hierarchical' | 'radial'`,
  `hoveredNodeId: string | null`
- Actions: `selectNode()`, `deselectNode()`, `toggleOverlay()`,
  `setLayoutMode()`, `resetViewport()`
- **Not** persisted — viewport resets on navigation

**`useScheduleStore`** — Cached scheduling intelligence

- State: `currentPlan: DualLanePlanResult | null`, `lastPlanTime: number | null`
- Actions: `setPlan()`, `clearPlan()`
- **Not** persisted — always fresh from API

**`useCopilotStore`** — Cognitive Copilot sidebar state

- State: `isOpen: boolean`, `hintsByPage: Record<string, IAgentHints[]>`,
  `activePageKey: string`
- Actions: `toggle()`, `open()`, `close()`, `pushHints(pageKey, hints)`,
  `clearPage(pageKey)`, `setActivePage(pageKey)`
- **Persisted** to localStorage (sidebar open/close preference only)

### T3.2 — Agent Hints Interceptor

Create a React Query global `onSuccess` handler or custom middleware that
automatically extracts `agentHints` from every `IApiResponse<T>` and pushes them
into `useCopilotStore`.

This should:

- Be a small wrapper/hook (`useAgentHintsInterceptor`) called once at the app
  root
- Detect the current route (via Next.js `usePathname`) and key hints by route
- Deduplicate hints — don't push identical `suggestedNextActions` multiple times
- Expire hints based on `validityPeriod` (immediate → expire after 30s, short →
  5min, medium → 1hr, long → 24hr, indefinite → never)

**Location:** `apps/web/src/hooks/use-agent-hints-interceptor.ts`

### T3.3 — Command Palette

A global Cmd+K (or Ctrl+K) quick-action launcher — the Spotlight/Raycast of
Noema.

**Behavior:**

- Global keyboard shortcut: `Cmd+K` / `Ctrl+K` to open, `Escape` to close
- Renders as a centered modal with a search input at the top and a scrollable
  results list below
- Uses Radix `Dialog` as the base (already a dependency)
- Results are fuzzy-matched against a registry of commands

**Command registry (initial set):**

- Navigation: "Go to Dashboard", "Go to Knowledge Map", "Go to Reviews", "Go to
  Cards", "Go to Settings", "Go to Profile"
- Actions: "Start a New Session", "Create a Card", "Scan for Misconceptions"
- Quick data: "Search cards by title..." (transitions to card search), "Find
  concept in graph..." (transitions to graph search)

**Props/interface:**

- Each command:
  `{ id, label, keywords: string[], icon, category: string, action: () => void }`
- The palette groups commands by category
- Keyboard navigation: arrow keys to move selection, Enter to execute

**Location:** `apps/web/src/components/command-palette.tsx`

### T3.4 — Keyboard Shortcut System

A global keyboard shortcut manager that other pages can register shortcuts into.

**Architecture:**

- A `useKeyboardShortcuts(shortcuts: ShortcutDef[])` hook that registers
  `keydown` handlers
- `ShortcutDef: { key: string, mod?: 'cmd' | 'ctrl' | 'shift' | 'alt', handler: () => void, when?: () => boolean }`
- Automatic platform detection: `Cmd` on macOS, `Ctrl` on Windows/Linux
- Respects input focus — shortcuts do not fire when the user is typing in an
  `<input>` or `<textarea>` (unless explicitly opted in)
- A shortcut reference panel (accessible via `Shift+?`) that lists all active
  shortcuts on the current page

**Location:** `apps/web/src/hooks/use-keyboard-shortcuts.ts`

### T3.5 — Error Boundary Wrapper

A reusable error boundary component for sectioned layouts. Any section can fail
independently without crashing the entire page.

**Behavior:**

- Wraps a page section and catches render errors
- Renders an inline error card with: error message, "Retry" button, and "Report"
  link
- Logged to console with structured context (current route, component stack)
- Uses the Phase 1 `EmptyState` component as the visual treatment (with
  error-themed icon and color)

**Location:** `apps/web/src/components/section-error-boundary.tsx`

### T3.6 — Toast Manager Enhancement

Wire the existing `@noema/ui` Toast system into a global toast manager:

- A `useToast()` hook that provides `toast.success(message)`,
  `toast.error(message)`, `toast.info(message)`, `toast.warning(message)`
- Auto-dismiss times: success=3s, error=5s, info=3s, warning=4s
- Toasts stack in the bottom-right corner
- API error toast integration: any `ApiRequestError` from the HTTP client can
  optionally trigger an error toast automatically

**Location:** `apps/web/src/hooks/use-toast.ts`,
`apps/web/src/components/toast-provider.tsx`

---

## Acceptance Criteria

- [ ] All 4 Zustand stores are created, typed, and importable
- [ ] `useCopilotStore`'s `isOpen` preference persists across page reloads
- [ ] Agent hints interceptor automatically populates copilot store from API
      responses
- [ ] Cmd+K opens the command palette from any page; Escape closes it
- [ ] Keyboard shortcuts fire correctly and do not interfere with input fields
- [ ] Error boundaries catch failures and render inline error states (not
      full-page crashes)
- [ ] Toast manager works for success/error/info/warning variants
- [ ] `pnpm build` and `pnpm typecheck` pass for `@noema/web`

---

## Files Created

| File                                                 | Description                     |
| ---------------------------------------------------- | ------------------------------- |
| `apps/web/src/stores/session-store.ts`               | Active session state            |
| `apps/web/src/stores/graph-store.ts`                 | Knowledge graph viewport state  |
| `apps/web/src/stores/schedule-store.ts`              | Cached scheduling plan          |
| `apps/web/src/stores/copilot-store.ts`               | Cognitive Copilot sidebar state |
| `apps/web/src/stores/index.ts`                       | Barrel export                   |
| `apps/web/src/hooks/use-agent-hints-interceptor.ts`  | Global agent hints extractor    |
| `apps/web/src/hooks/use-keyboard-shortcuts.ts`       | Keyboard shortcut manager       |
| `apps/web/src/hooks/use-toast.ts`                    | Toast manager hook              |
| `apps/web/src/components/command-palette.tsx`        | Cmd+K command launcher          |
| `apps/web/src/components/section-error-boundary.tsx` | Per-section error boundary      |
| `apps/web/src/components/toast-provider.tsx`         | Toast viewport + provider       |
