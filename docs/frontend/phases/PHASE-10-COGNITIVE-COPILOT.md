# Phase 10 — Cognitive Copilot: The Ambient Guide

> **Codename:** `Insula`  
> **Depends on:** Phase 3 (Copilot Store + Agent Hints Interceptor), Phase 5+
> (needs pages that generate hints)  
> **Unlocks:** Nothing (terminal leaf — integrates with all existing pages)  
> **Estimated effort:** 3–4 days

---

## Philosophy

The insula is the brain's interoception center — it monitors internal states and
surfaces them to awareness. The Cognitive Copilot is Noema's insula: it silently
watches every API response's `agentHints`, aggregates them, and presents them as
an ambient, non-intrusive sidebar guide.

The Copilot is **not a chatbot**. It is a structured readout of machine
intelligence — sorted by priority, expired by validity period, and always
actionable. It should feel like a calm clinical advisor standing nearby, not an
eager assistant trying to start a conversation.

---

## Tasks

### T10.1 — Copilot Sidebar Shell

A persistent, toggleable sidebar anchored to the right edge of the viewport.

**Component:** `apps/web/src/components/copilot/copilot-sidebar.tsx`

**Behavior:**

- Toggle: clicking a floating button (bottom-right corner, styled as a small
  neural icon with `PulseIndicator`) opens/closes the sidebar
- Keyboard: `Cmd+.` / `Ctrl+.` toggles the sidebar
- Width: 360px, slides in from right with `fade-slide-in` animation
- Z-index: above page content, below modals
- Does not push the main content — overlays it (like Figma's inspector panel)
- State managed by `useCopilotStore` from Phase 3 (isOpen persisted to
  localStorage)

**Header:**

- "Cognitive Copilot" title in `text-section-title`
- A small `NeuralGauge` (xs size) showing the aggregate confidence across
  current page hints
- Source quality badge: `StateChip` showing the best `sourceQuality` from
  current hints (high/medium/low/unknown)

### T10.2 — Suggested Actions Section

The primary section of the copilot sidebar — what should the user do next?

**Data source:** `useCopilotStore().hintsByPage[activePage]` → flatten all
`suggestedNextActions` → deduplicate by `action` key → sort by priority
(critical > high > medium > low).

**Visual per action:**

- Priority indicator: left border colored by priority (critical=cortex,
  high=myelin, medium=synapse, low=axon-400)
- Category icon: exploration=compass, optimization=sliders,
  correction=alert-triangle, learning=book-open
- Action description (main text)
- Estimated time (if available), as a muted caption
- Confidence score as a micro `ConfidenceMeter` (3-segment, inline)
- Prerequisites (if any): shown as small prerequisite chips with dependent
  action links
- **"Do it" button**: executes the action:
  - If the action maps to a navigation route → navigate there
  - If it maps to an API call → execute it directly and show a toast
  - If it maps to a session start → navigate to `/session/new` with
    pre-configured parameters

**Grouping:** actions are grouped by `category` (Exploration, Optimization,
Correction, Learning), each group collapsible.

### T10.3 — Risk Alerts Section

Surfaces `riskFactors` from agent hints when risk severity warrants attention.

**Rules:**

- Only show risks with severity ≥ `medium`
- `critical` and `high` risks get a prominent alert treatment (cortex background
  at low opacity)
- `medium` risks are shown as muted warning cards

**Visual per risk:**

- Severity icon: shield-alert (critical), alert-triangle (high), info (medium)
- Risk type label + description
- Probability indicator (if available) — "Likely", "Possible", "Unlikely"
- Impact description
- Mitigation suggestion (if available) — with a "Take action" link

### T10.4 — Transparency Section

Shows `assumptions`, `constraints`, `reasoning`, and `contextNeeded` from agent
hints. This section makes the system's thinking visible — a core Noema
principle.

**Subsections (collapsible):**

- **Reasoning**: plain-English explanation of why the current suggestions were
  generated. Rendered as a blockquote-style paragraph in `text-body`.
- **Assumptions**: bulleted list of assumptions the system is making. If an
  assumption is wrong, the user can dismiss it (which could inform future
  hints).
- **Context needed**: prompts for information the system needs to improve its
  suggestions (e.g., "Your preferred study time is not set — update in Settings
  for better review window proposals"). Each prompt links to the relevant
  action.
- **Constraints**: limitations the system acknowledges (e.g., "Insufficient
  review history to predict optimal intervals with high confidence").

### T10.5 — Alternatives & Warnings Section

- **Alternatives**: from `agentHints.alternatives` — each with a description,
  pros list, cons list. Presented as a compact card with expandable pros/cons
  sections.
- **Warnings**: from `agentHints.warnings` — each with type, severity, message.
  Auto-fixable warnings get a "Fix" button that triggers the fix action.
  Non-fixable warnings are informational.

### T10.6 — Validity & Freshness System

Implement the time-based expiry logic in the agent hints interceptor:

| `validityPeriod` | TTL           |
| ---------------- | ------------- |
| `immediate`      | 30 seconds    |
| `short`          | 5 minutes     |
| `medium`         | 1 hour        |
| `long`           | 24 hours      |
| `indefinite`     | Never expires |

**Behavior:**

- Each hint set is timestamped when received
- A background interval (every 30s) checks for expired hints and removes them
  from the store
- Expired actions fade out with a subtle animation before being removed
- A "Last updated X ago" indicator at the bottom of the sidebar shows when the
  most recent hints were received
- If all hints have expired: show an empty state "Navigate or study to generate
  new suggestions"

### T10.7 — Floating Toggle Button

The persistent entry point for the copilot sidebar.

**Component:** `apps/web/src/components/copilot/copilot-toggle.tsx`

**Visual:**

- A circular floating button (48px) anchored to bottom-right, 16px from edges
- Icon: a stylized brain/neuron icon (from lucide-react or custom SVG) in
  synapse color
- When sidebar is closed: the button has a `PulseIndicator` that pulses when
  there are unread high-priority actions
- When sidebar is open: the button becomes an "×" close icon
- Badge: if there are critical/high-priority unread actions, show a count badge
  in cortex color
- The button does not show during active sessions (Phase 7) to avoid distraction
  — the session page is immersive

### T10.8 — Wire Into App Layout

Integrate the Copilot sidebar and toggle button into the authenticated layout:

- Add `CopilotSidebar` and `CopilotToggle` to
  `apps/web/src/app/(authenticated)/layout.tsx`
- Add the `useAgentHintsInterceptor()` hook call in a layout-level component
- Ensure the sidebar renders above page content but below the command palette
- Hide the copilot toggle on `/session/:sessionId` routes (active session)

---

## Acceptance Criteria

- [ ] Copilot sidebar toggles open/close with button click and Cmd+.
- [ ] Sidebar aggregates agent hints from all API calls on the current page
- [ ] Suggested actions are sorted by priority and grouped by category
- [ ] "Do it" buttons on actions navigate or execute the suggested action
- [ ] Risk alerts surface critical/high risks with appropriate visual severity
- [ ] Transparency section shows reasoning, assumptions, constraints, and
      context needs
- [ ] Hints expire according to their `validityPeriod` and fade out gracefully
- [ ] Floating toggle shows an unread badge for high-priority actions
- [ ] Copilot is hidden during active sessions to maintain focus
- [ ] Sidebar does not push main content (overlay pattern)
- [ ] `isOpen` preference persists across page reloads via localStorage

---

## Files Created / Touched

| File                                                        | Description                                    |
| ----------------------------------------------------------- | ---------------------------------------------- |
| `apps/web/src/components/copilot/copilot-sidebar.tsx`       | **New** — Main sidebar shell                   |
| `apps/web/src/components/copilot/suggested-actions.tsx`     | **New** — Actions section                      |
| `apps/web/src/components/copilot/risk-alerts.tsx`           | **New** — Risk factor alerts                   |
| `apps/web/src/components/copilot/transparency-section.tsx`  | **New** — Reasoning, assumptions, constraints  |
| `apps/web/src/components/copilot/alternatives-warnings.tsx` | **New** — Alternatives + auto-fixable warnings |
| `apps/web/src/components/copilot/copilot-toggle.tsx`        | **New** — Floating entry button                |
| `apps/web/src/components/copilot/index.ts`                  | **New** — Barrel export                        |
| `apps/web/src/hooks/use-agent-hints-interceptor.ts`         | **Updated** — Add expiry logic                 |
| `apps/web/src/app/(authenticated)/layout.tsx`               | **Updated** — Wire copilot into layout         |
