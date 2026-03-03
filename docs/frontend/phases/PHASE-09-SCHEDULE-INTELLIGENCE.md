# Phase 9 — Schedule Intelligence: Reviews & Forecasting

> **Codename:** `Cerebellum`  
> **Depends on:** Phase 1 (UI Primitives), Phase 2 (API Client — Scheduler
> module), Phase 7 (Session Engine — "Start Review" flows into a session)  
> **Unlocks:** Nothing (terminal leaf)  
> **Estimated effort:** 3–4 days

---

## Philosophy

The cerebellum orchestrates timing and motor planning. This phase brings the
scheduler's intelligence to the surface — showing the user _when_ to review,
_what_ to review, and _what would happen if_ they changed their strategy. The
dual-lane architecture (Retention via FSRS + Calibration via HLR) becomes
tangible through visual split-lane metaphors and scheduling simulations.

---

## Tasks

### T9.1 — Reviews Dashboard

The main scheduling intelligence view at `/reviews`.

**Route:** `apps/web/src/app/(authenticated)/reviews/page.tsx`

**Layout:**

**Section 1 — Today's Plan:**

- Dual-lane plan visualization from `useDualLanePlan()`:
  - A horizontal split-bar: left half "Retention" (synapse), right half
    "Calibration" (myelin), proportioned by lane ratio
  - Inside each half: card count, estimated time
  - Below: a "Start Today's Review" button that seeds a new session from this
    plan (navigates to `/session/new` with the plan pre-loaded)
- If no cards are due today: show a celebration empty state ("All caught up!
  Your memory is consolidating.")

**Section 2 — 7-Day Review Forecast:**

- Reuse the `ReviewForecast` component from Phase 5 (Dashboard), but at full
  width and with day-level interactivity:
  - Clicking a day expands it to show the specific cards due that day, grouped
    by retention/calibration lane
  - Each card row: card type icon, preview text, urgency indicator (how overdue
    or how close to forgetting threshold)
  - Color intensity of the bar reflects urgency: bright=many overdue,
    dim=comfortable schedule

**Section 3 — Review Windows:**

- Optimal review time proposals from `useReviewWindows()`:
  - Rendered as a day-planner/calendar view (similar to Google Calendar's day
    view) showing suggested time blocks
  - Each block: time range, recommended card count, expected recall probability
    after review
  - These are suggestions, not appointments — the visual should be soft and
    advisory (dendrite color, dashed borders)

### T9.2 — Card Schedule Inspector

Per-card scheduling detail, accessible from the Reviews Dashboard or Card Detail
page.

**Component:** `apps/web/src/components/reviews/card-schedule-inspector.tsx`

**Triggered by:** clicking a card in the review forecast, or a "View schedule"
action on Card Detail page.

**Content (slide-out panel or modal):**

- **Card identity**: type icon, preview, state chip, card ID
- **Scheduling algorithm**: which algorithm is active for this card (FSRS, HLR,
  SM2, LEITNER) — `StateChip`
- **Learning state**: `StateChip` for `CardLearningState` (NEW, LEARNING,
  REVIEW, RELEARNING)
- **FSRS parameters** (if FSRS-scheduled):
  - Stability, difficulty, interval — each as a labeled value in
    `text-metric-value`
  - Predicted recall probability at current time as `NeuralGauge`
  - Next optimal review date
- **HLR parameters** (via `useHLRPredict()`):
  - Half-life (how long until 50% recall probability)
  - Predicted recall probability as `NeuralGauge`
  - Feature vector summary (lexeme features that influence this card's
    scheduling)
- **Review history**: timeline of past reviews for this card:
  - Each review: date, rating given, response time, confidence levels
  - Plotted as a timeline with dots colored by rating (AGAIN=cortex, HARD=warm,
    GOOD=synapse, EASY=neuron)
- **Calibration data**: how well does the user's confidence predict their actual
  performance on this card?
  - A mini calibration chart (predicted confidence vs actual outcome scatter)

### T9.3 — Scheduling Simulation

A "what-if" tool for exploring how changes affect the review schedule.

**Component:** `apps/web/src/components/reviews/scheduling-simulator.tsx`

**Accessible from:** Reviews Dashboard → "Simulate" button

**Flow:**

1. **Parameter controls** (left panel):
   - Lane mix slider (retention % / calibration %)
   - Max reviews per day slider (10–200)
   - Target retention probability slider (0.7–0.99)
   - Scheduling algorithm selector (FSRS, HLR, SM2, LEITNER)
2. **Run simulation**: calls `useSimulateSession()` with the configured
   parameters
3. **Results** (right panel):
   - Predicted card count per day for the next 30 days (line chart)
   - Predicted recall probability over time (line chart with target threshold as
     a horizontal reference line)
   - Estimated total study time per day (bar chart)
   - "Workload warning" if any day exceeds 2× the user's daily goal
   - Comparison: current parameters (solid line) vs simulated parameters (dashed
     line) on the same chart

### T9.4 — Sidebar Navigation Update

Add the reviews route to the authenticated layout sidebar:

- Add a "Reviews" item under the "Learning" group in
  `apps/web/src/app/(authenticated)/layout.tsx`
- Icon: `CalendarClock` or `RotateCcw` from lucide-react
- Position: between "Study Sessions" and "Knowledge Map"

Also rename existing sidebar items for consistency:

- "Study Sessions" → goes to `/sessions` (Session History from Phase 7)
- "Reviews" → goes to `/reviews` (this phase)
- "Knowledge Map" → goes to `/knowledge` (Phase 8)

---

## Acceptance Criteria

- [ ] Reviews Dashboard loads today's dual-lane plan with correct lane split
      visualization
- [ ] "Start Today's Review" pre-seeds a session with the plan's cards
- [ ] 7-day forecast shows expandable per-day card breakdowns
- [ ] Review Windows renders time-block suggestions in a day-planner style
- [ ] Card Schedule Inspector shows full scheduling parameters (FSRS + HLR) for
      any card
- [ ] HLR prediction integrates with the sidecar service and shows half-life +
      recall gauge
- [ ] Scheduling Simulator runs what-if scenarios and renders comparison charts
- [ ] Sidebar navigation includes "Reviews" between "Sessions" and "Knowledge
      Map"
- [ ] Empty states handle: no cards due, no review history, no simulation
      results

---

## Files Created / Touched

| File                                                          | Description                                |
| ------------------------------------------------------------- | ------------------------------------------ |
| `apps/web/src/app/(authenticated)/reviews/page.tsx`           | **New** — Reviews Dashboard                |
| `apps/web/src/components/reviews/todays-plan.tsx`             | **New** — Dual-lane plan visualization     |
| `apps/web/src/components/reviews/review-forecast-full.tsx`    | **New** — Expanded 7-day forecast          |
| `apps/web/src/components/reviews/review-windows.tsx`          | **New** — Optimal review time planner      |
| `apps/web/src/components/reviews/card-schedule-inspector.tsx` | **New** — Per-card scheduling detail panel |
| `apps/web/src/components/reviews/scheduling-simulator.tsx`    | **New** — What-if simulation tool          |
| `apps/web/src/components/reviews/recall-timeline.tsx`         | **New** — Review history timeline          |
| `apps/web/src/components/reviews/calibration-chart.tsx`       | **New** — Confidence vs accuracy scatter   |
| `apps/web/src/app/(authenticated)/layout.tsx`                 | **Updated** — Add Reviews to sidebar       |
