# Phase 7 — Session Engine: The Learning Experience

> **Codename:** `Prefrontal`  
> **Depends on:** Phase 2 (API Client — Session module), Phase 3 (Session
> Store), Phase 6 (Card Renderers)  
> **Unlocks:** Phase 9 (Schedule Intelligence — uses session data)  
> **Estimated effort:** 5–6 days

---

## Philosophy

This is the heart of Noema. The session engine is where learning happens — where
a user's attention meets a card, where confidence is measured before and after,
where the failure taxonomy's 78 subtypes manifest as real cognitive events, and
where the dual-lane scheduler proves its worth.

The session flow has three stages: **Start** (configure), **Active** (learn),
**Summary** (reflect). Each is a distinct page/view. The active session is the
most performance-critical and interaction-dense screen in the entire platform —
it must feel instantaneous, focused, and calm.

---

## Tasks

### T7.1 — Session Start Page

The session configuration experience at `/session/new`.

**Route:** `apps/web/src/app/(authenticated)/session/new/page.tsx`

**Layout — three sections stacked vertically:**

**Section 1 — Learning Mode Selection:**

- 4 mode cards laid out in a 2×2 grid, each with:
  - A distinctive icon and color (EXPLORATION=compass/dendrite,
    GOAL_DRIVEN=target/myelin, EXAM_ORIENTED=clock/cortex,
    SYNTHESIS=git-merge/synapse)
  - Mode name and a 2-sentence description of its learning philosophy
  - Selecting a mode highlights it with the mode's color family + a subtle glow
- Default selected: infer from `agentHints.suggestedNextActions` if available,
  otherwise EXPLORATION

**Section 2 — Card Source Configuration:**

- **Quick start**: "Use recommended plan" → fetches the dual-lane plan from
  `useDualLanePlan()` and auto-fills everything. One-click path for returning
  users.
- **Custom build**: expandable panel with the DeckQuery filter interface (reuse
  the `DeckQueryFilter` component from Phase 6):
  - Card type, state, tags, node links, text search
  - "Preview candidates" button → `useSessionCandidates()` → shows a list of
    cards that would be in the session
- **Lane mix slider**: a dual-handle range slider for retention % vs calibration
  %. Default 80/20. Shows estimated card counts per lane in real-time.
- **Session size**: number input for max cards (default 20, range 5–100)

**Section 3 — Policy Snapshot (advanced, collapsed by default):**

- If the user expands "Advanced settings":
  - Pacing: target seconds per card (slider 10–120s), hard cap (slider 30–300s),
    slowdown on error toggle
  - Hints: max hints per card (1–5), progressive hints only toggle, allow answer
    reveal toggle
  - Reflection: post-attempt reflection toggle, post-session reflection toggle
- These controls map to `ICognitivePolicySnapshot` fields

**Start button**: validates configuration → calls `useStartSession()` →
navigates to `/session/:sessionId`

**Offline toggle**: switch that calls `useOfflineIntentToken()` and caches the
blueprint locally for offline-first session start.

### T7.2 — Active Session View

The core learning interaction at `/session/:sessionId`.

**Route:** `apps/web/src/app/(authenticated)/session/[sessionId]/page.tsx`

**Full-viewport layout, designed for focus:**

```
┌─────────────────────────────────────────────┐
│  Session Bar (thin, sticky top)             │
├─────────────────────────────────────────────┤
│                                             │
│                                             │
│         Card Renderer Area                  │
│         (center, max-w-2xl)                 │
│                                             │
│                                             │
├─────────────────────────────────────────────┤
│  Response Controls (bottom)                 │
└─────────────────────────────────────────────┘
```

**Session Bar** (top, ~48px):

- Left: `ProgressRing` (compact, 32px) showing cards completed / total
- Center: timer (elapsed in `mm:ss` format, `text-metric-value` mono font),
  `PulseIndicator` showing session is active
- Right: lane badge (`StateChip` — "Retention" in synapse or "Calibration" in
  myelin), pause button, more menu (abandon, change settings)
- The bar is deliberately minimal — attention should be on the card

**Card Area** (center):

- Loads the current card from `useSessionQueue(sessionId)`
- Renders via the `CardRenderer` factory from Phase 6 in `interactive` mode
- **Pre-answer confidence capture**: before the user interacts with the card, a
  floating `ConfidenceMeter` slides in from the bottom: "How confident are you?"
  — this maps to `confidenceBefore` in the attempt payload
- Card interaction follows the renderer's pattern (flip, fill blanks, drag,
  select, etc.)
- After the user answers/reveals, the card transitions to a "revealed" state
  showing the correct answer

**Response Controls** (bottom bar, ~80px):

- **Post-answer confidence**: another `ConfidenceMeter` — "How confident are you
  now?" → maps to `confidenceAfter`
- **Rating buttons**: 4 buttons in a row: AGAIN (1, cortex), HARD (2, warm
  cortex), GOOD (3, synapse), EASY (4, neuron). Large touch targets, keyboard
  shortcuts 1/2/3/4.
- **Hint button**: pill button showing current hint depth ("Hint 0/3"). Clicking
  escalates: `useRequestHint()` → updates the card area to show the hint inline
  (CUE → PARTIAL → FULL_EXPLANATION)
- **Self-report toggle**: small "I guessed" checkbox → sets
  `selfReportedGuess: true`

**Attempt recording**: when the user clicks a rating button:

1. Collect all metacognitive signals (`confidenceBefore`, `confidenceAfter`,
   computed `calibrationDelta`, `hintDepthUsed`, `dwellTimeMs` from timer,
   `selfReportedGuess`)
2. Call `useRecordAttempt(sessionId)` with the full attempt payload
3. Animate the card out (slide left) and the next card in (slide right from the
   right edge)
4. Reset confidence meters, timer, hint state for the next card

**Pause state**: when paused, overlay a semi-transparent panel with "Session
Paused" + elapsed time + resume button. Timer stops.

**Adaptive checkpoint**: when `useEvaluateCheckpoint(sessionId)` returns a
directive:

- Show a gentle intervention overlay (not a blocking modal — a floating panel
  that pushes the card area down)
- Display the directive type and reasoning (e.g., "Your confidence has been
  drifting — adjusting to slower pacing")
- "Understood" dismiss button
- If directive is `rebalance_queue`, `switch_teaching_approach`, or
  `increase_support`, apply the change automatically and show a brief
  notification

**Keyboard shortcuts** (registered via `useKeyboardShortcuts` from Phase 3):

- `Space`: flip card / reveal answer
- `1/2/3/4`: rate AGAIN/HARD/GOOD/EASY
- `H`: request hint
- `P`: pause/resume
- `Escape`: open abandon confirmation

### T7.3 — Session Summary Page

Post-session reflection at `/session/:sessionId/summary`.

**Route:**
`apps/web/src/app/(authenticated)/session/[sessionId]/summary/page.tsx`

**Layout — stacked sections:**

**Section 1 — Session Vitals:**

- Large hero area with key stats in `MetricTile` row:
  - Total cards attempted
  - Accuracy rate (% correct) as `NeuralGauge`
  - Time spent (formatted as `Xh Ym`)
  - Learning mode badge

**Section 2 — Lane Breakdown:**

- Side-by-side comparison of retention lane vs calibration lane:
  - Cards attempted per lane
  - Accuracy per lane
  - Average confidence calibration per lane (how well did confidence predict
    accuracy?)
- Visualized as two `NeuralGauge` pairs: one for accuracy, one for calibration

**Section 3 — Card Results Table:**

- Scrollable table of every card attempted in this session:
  - Card type icon, card preview (truncated front text), rating given,
    confidence before/after, hints used, dwell time
  - Color-coded: correct=neuron, incorrect=cortex, partial=myelin
  - Clickable: navigate to card detail (`/cards/:id`)

**Section 4 — Post-Session Reflection (conditional):**

- Only shown when `policySnapshot.reflectionPolicy.postSessionReflection` is
  true
- Guided reflection prompts:
  - "What was the hardest concept?" → free-text input
  - "Did any misconceptions surprise you?" → free-text input
  - "What would you do differently?" → free-text input
- These are stored locally (or as session metadata) — not yet persisted to a
  specific API endpoint

**Section 5 — Next Actions:**

- Agent-suggested next steps from the session's final
  `agentHints.suggestedNextActions`
- Prominent CTA buttons: "Start Another Session", "Review Misconceptions",
  "Explore Knowledge Graph"
- "Back to Dashboard" link

### T7.4 — Session History Page

Browse past sessions at `/sessions`.

**Route:** `apps/web/src/app/(authenticated)/sessions/page.tsx`

**Functionality:**

- Filterable list via `useSessions(filters)`:
  - Filter by state (COMPLETED, ABANDONED, EXPIRED)
  - Filter by learning mode
  - Filter by date range
  - Sort by date, card count, accuracy
- Each row: date, learning mode badge, state chip, cards (attempted/total),
  accuracy gauge, duration
- Clicking a row → navigates to `/session/:sessionId/summary`
- Empty state: "No sessions yet" with CTA to start one

---

## Acceptance Criteria

- [ ] Session Start page lets user choose mode, configure card source (quick or
      custom), set lane mix, and start
- [ ] Active Session renders cards from the queue using Phase 6 renderers in
      interactive mode
- [ ] Confidence meters capture before/after confidence for every card
- [ ] Rating buttons (1–4) record full metacognitive attempt payloads
- [ ] Hints escalate correctly (CUE → PARTIAL → FULL_EXPLANATION) and display
      inline
- [ ] Timer tracks dwell time per card accurately
- [ ] Session bar shows progress, timer, lane, and pause controls
- [ ] Keyboard shortcuts work (Space, 1-4, H, P, Escape)
- [ ] Pause overlay stops the timer and blocks interaction
- [ ] Adaptive checkpoint interventions display non-intrusively
- [ ] Session Summary shows vitals, lane breakdown, card results, and
      conditional reflection
- [ ] Session History lists past sessions with filters
- [ ] All session lifecycle mutations work: start, pause, resume, complete,
      abandon

---

## Files Created

| File                                                                    | Description                               |
| ----------------------------------------------------------------------- | ----------------------------------------- |
| `apps/web/src/app/(authenticated)/session/new/page.tsx`                 | Session configuration                     |
| `apps/web/src/app/(authenticated)/session/[sessionId]/page.tsx`         | Active session                            |
| `apps/web/src/app/(authenticated)/session/[sessionId]/summary/page.tsx` | Post-session review                       |
| `apps/web/src/app/(authenticated)/sessions/page.tsx`                    | Session history list                      |
| `apps/web/src/components/session/session-bar.tsx`                       | Top bar with progress, timer, controls    |
| `apps/web/src/components/session/response-controls.tsx`                 | Bottom bar with rating, confidence, hints |
| `apps/web/src/components/session/pre-answer-confidence.tsx`             | Pre-answer confidence capture             |
| `apps/web/src/components/session/adaptive-checkpoint.tsx`               | Checkpoint intervention overlay           |
| `apps/web/src/components/session/pause-overlay.tsx`                     | Pause state overlay                       |
| `apps/web/src/components/session/mode-selector.tsx`                     | Learning mode 2×2 grid                    |
| `apps/web/src/components/session/lane-mix-slider.tsx`                   | Dual-lane ratio slider                    |
| `apps/web/src/components/session/session-summary-vitals.tsx`            | Summary stats                             |
| `apps/web/src/components/session/card-results-table.tsx`                | Per-card results                          |
| `apps/web/src/components/session/post-session-reflection.tsx`           | Guided reflection form                    |
