# Phase 5 — Dashboard: Cognitive Vitals

> **Codename:** `Thalamus`  
> **Depends on:** Phase 0 (Tokens), Phase 1 (UI Primitives), Phase 2 (API
> Client), Phase 3 (Stores)  
> **Unlocks:** Nothing (terminal leaf — but validates the entire stack)  
> **Estimated effort:** 3–4 days

---

## Philosophy

The dashboard is the thalamus — the relay center. It doesn't do deep work; it
routes attention. A single glance should answer: _"What do I need to do right
now?"_ and _"How healthy is my learning?"_ The dashboard pulls from every
implemented service simultaneously, making it the first real integration test of
the entire frontend stack.

The existing dashboard at `apps/web/src/app/(authenticated)/dashboard/page.tsx`
has 4 hardcoded stat cards and 2 empty card panels. This phase replaces all of
it with live data.

---

## Tasks

### T5.1 — Cognitive Vitals Row

Replace the hardcoded `StatCard` grid with 4 `MetricTile` components (from
Phase 1) wired to real API data:

| Tile                      | Data source                                                                                        | Visual                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Cards Due**             | `useDualLanePlan()` → count of cards in retention + calibration lanes                              | `MetricTile` with synapse color, sparkline of last 7 days' due counts                 |
| **Knowledge Health**      | `useStructuralHealth(userId)` → `overallScore`                                                     | `NeuralGauge` at `md` size inside the tile, with trend arrow from previous score      |
| **Active Misconceptions** | `useMisconceptions(userId)` → filtered by `status !== 'RESOLVED'`                                  | `MetricTile` with cortex color, count + severity breakdown (e.g., "2 major, 1 minor") |
| **Study Streak**          | `useSessions({ state: 'COMPLETED' })` → count consecutive days with at least one completed session | `MetricTile` with myelin color, streak count + flame icon at streak > 7               |

Each tile handles its own loading state (Skeleton from Phase 1) and error state
independently via `SectionErrorBoundary` from Phase 3.

### T5.2 — Review Forecast Timeline

A 7-day horizontal timeline showing the distribution of upcoming reviews.

**Data source:** `useReviewWindows()` for the next 7 days, combined with
`useSessionCandidates()` for today's breakdown.

**Visual spec:**

- A horizontal bar chart (one bar per day) where each bar is segmented:
  - Retention lane cards in `synapse` color
  - Calibration lane cards in `myelin` color
- Today's bar is highlighted with a subtle glow
- Hovering a bar shows a tooltip with: date, retention count, calibration count,
  total
- Below the chart: a summary line like "47 reviews this week · 12 due today"

**Location:** `apps/web/src/components/dashboard/review-forecast.tsx`

### T5.3 — Knowledge Pulse Mini-Graph

A miniature, non-interactive knowledge graph preview showing recent activity.

**Data source:** `usePKGSubgraph(userId, { maxDepth: 2, limit: 50 })` — a local
neighborhood of recently-touched nodes.

**Visual spec:**

- A compact force-directed graph (~300×250px) rendered with a lightweight
  SVG-based approach (no WebGL needed at this size)
- Nodes colored by type (from the Phase 0 palette), sized by mastery level
- Recently-studied nodes pulse gently
- Misconception nodes have a cortex-colored halo
- Clicking the entire panel navigates to `/knowledge` (the full graph explorer
  in Phase 8)
- If the user has no graph data yet, show an `EmptyState` with a "Start learning
  to build your knowledge map" message

**Location:** `apps/web/src/components/dashboard/knowledge-pulse.tsx`

### T5.4 — Recent Sessions Panel

A list of the user's most recent 5 sessions.

**Data source:** `useSessions({ limit: 5, sort: 'createdAt:desc' })`

**Visual spec:**

- Each session row shows:
  - `StateChip` for session state (COMPLETED, ABANDONED, EXPIRED)
  - Learning mode badge (EXPLORATION, GOAL_DRIVEN, EXAM_ORIENTED, SYNTHESIS)
    with the mode's icon
  - Card count (attempted / total)
  - Accuracy rate as a small inline `NeuralGauge` at `sm` size
  - Date/time as relative time ("2 hours ago")
- Clicking a session row navigates to the session summary view (Phase 7)
- Empty state: "No sessions yet — start your first study session!" with a CTA
  button

**Location:** `apps/web/src/components/dashboard/recent-sessions.tsx`

### T5.5 — Copilot Suggestions Preview

A preview of the top 3 agent-suggested actions.

**Data source:** `useCopilotStore()` — reads the aggregated
`suggestedNextActions` from recent API responses.

**Visual spec:**

- 3 suggestion cards in a horizontal row, each showing:
  - Action category icon (exploration=compass, optimization=sliders,
    correction=alert-triangle, learning=book-open)
  - Action description
  - Priority indicator (critical=cortex, high=myelin, medium=synapse, low=axon)
  - Estimated time (if available)
  - A "Do it" button that triggers the action (navigates to the relevant page or
    starts a session)
- If no suggestions yet: a muted state "Interact with Noema to get personalized
  suggestions"
- A "See all" link that opens the Cognitive Copilot sidebar (Phase 10)

**Location:** `apps/web/src/components/dashboard/copilot-suggestions.tsx`

### T5.6 — Dashboard Page Assembly

Rewrite `apps/web/src/app/(authenticated)/dashboard/page.tsx` to compose all 5
sections:

**Layout:**

```
┌─────────────────────────────────────────────┐
│  "Good morning, {name}" + greeting          │
├───────┬───────┬───────┬───────┬─────────────┤
│ Cards │ K.G.  │ Misc. │ Study │  (vitals)   │
│ Due   │Health │ Count │Streak │             │
├───────┴───────┴───────┴───────┴─────────────┤
│  Review Forecast (7-day timeline)           │
├──────────────────────┬──────────────────────┤
│  Knowledge Pulse     │  Recent Sessions     │
│  (mini-graph)        │  (5 latest)          │
├──────────────────────┴──────────────────────┤
│  Copilot Suggestions (3 action cards)       │
└─────────────────────────────────────────────┘
```

- The greeting line is contextual: "Good morning/afternoon/evening, {firstName}"
  based on local time
- Each section is wrapped in `SectionErrorBoundary` for independent failure
  isolation
- Entire page uses `fade-slide-in` staggered animation (each section slides in
  100ms after the previous)

---

## Acceptance Criteria

- [ ] Dashboard loads data from 4 different services (Scheduler, KG, Session,
      Content) in parallel
- [ ] All 4 vitals tiles display real data with loading skeletons
- [ ] Review Forecast renders a 7-day segmented bar chart with dual-lane
      coloring
- [ ] Knowledge Pulse renders a mini force-directed graph (or empty state for
      new users)
- [ ] Recent Sessions shows the 5 latest sessions with state chips and accuracy
      gauges
- [ ] Copilot Suggestions show top 3 agent-recommended actions
- [ ] Each section fails independently — a scheduler outage doesn't break the KG
      health tile
- [ ] Staggered entrance animations play smoothly
- [ ] Page is responsive at tablet (≥768px) and desktop breakpoints

---

## Files Created / Touched

| File                                                        | Action                              |
| ----------------------------------------------------------- | ----------------------------------- |
| `apps/web/src/app/(authenticated)/dashboard/page.tsx`       | Full rewrite — compose all sections |
| `apps/web/src/components/dashboard/review-forecast.tsx`     | **New** — 7-day timeline chart      |
| `apps/web/src/components/dashboard/knowledge-pulse.tsx`     | **New** — mini PKG graph            |
| `apps/web/src/components/dashboard/recent-sessions.tsx`     | **New** — session list              |
| `apps/web/src/components/dashboard/copilot-suggestions.tsx` | **New** — agent action cards        |
| `apps/web/src/components/dashboard/cognitive-vitals.tsx`    | **New** — 4-tile vitals row         |
