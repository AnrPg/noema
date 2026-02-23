# TODO — Dual-Lane Planner Improvements (Implement Now)

**Purpose:** Upgrade `selectByLaneMix` from naive array.slice to a
priority-aware, interleaved selection algorithm. These are improvements to the
scheduler-service's pure computation layer — no agent code required.

**File:**
`services/scheduler-service/src/domain/scheduler-service/scheduler.service.ts`
**Reference:** ADR-0022 (Dual-Lane Scheduler Planning)

---

## Weakness Analysis (from ADR-0022 elaboration)

1. **No priority within lanes** — `retention.slice(0, N)` takes the first N
   cards with no awareness of urgency, overdueness, or stability.
2. **Naive normalization** — if both values are 0 it falls back to 80/20, but
   the 80/20 default is arbitrary with no evidence backing.
3. **FIFO spillover** — when one lane is short, leftovers fill from the other
   lane's remainder in insertion order, not priority order.
4. **No interleaving** — retention cards come first, then calibration cards,
   producing predictable blocks instead of mixed practice.
5. **No selection metadata** — the plan output lacks per-card scores, reasons,
   or lane-assignment detail for downstream consumers.

---

## Implementation Tasks

### 1. Priority-Based Selection Within Lanes ✅

- [x] Accept optional `cardPriorityScores` map (`Record<CardId, number>`) in
      `IDualLanePlanInput` — the agent (or service) can precompute urgency
      scores (e.g. overdueness ratio = daysSinceDue / interval)
- [x] In `selectByLaneMix`, sort each pool by priority score (descending) before
      slicing, so the most urgent cards are selected first
- [x] If no scores are provided, fall back to the original insertion order
      (backward compatible)

### 2. Urgency-Aware Spillover ✅

- [x] When one lane is exhausted and slots remain, fill from the OTHER lane's
      remaining cards — but sorted by priority, not FIFO
- [x] Track how many spillover cards came from each lane in the plan output

### 3. Interleaving Strategy ✅

- [x] Accept optional `interleave` boolean (default `true`) in plan input
- [x] When enabled, interleave retention and calibration cards using a
      round-robin-by-ratio approach: for an 80/20 mix, produce sequences like R
      R R R C R R R R C instead of RRRRRRRR CC
- [x] When disabled, keep the current block ordering (retention then
      calibration)

### 4. Selection Metadata in Plan Output ✅

- [x] Add `cardDetails` array to `IDualLanePlan`: per-card lane assignment,
      priority score used, position in final sequence, spillover flag
- [x] Add `retentionSpillover` and `calibrationSpillover` counts to plan

### 5. Schema & Type Updates ✅

- [x] Update `IDualLanePlanInput` with `cardPriorityScores` and `interleave`
- [x] Update `IDualLanePlan` with `cardDetails`, spillover counts
- [x] Add `ICardDetail` type (cardId, lane, score, position, isSpillover)
- [x] Update `DualLanePlanInputSchema` Zod schema
- [x] Update MCP tool `inputSchema` in `scheduler.tools.ts`

### 6. Tests ✅

- [x] Test: priority-based selection picks highest-scored cards first
- [x] Test: no scores provided → original insertion order (backward compat)
- [x] Test: spillover fills from priority-sorted remainder
- [x] Test: interleaving produces correct R/C pattern for various mixes
- [x] Test: interleave=false preserves block ordering
- [x] Test: plan output includes correct cardDetails metadata
- [x] Test: edge cases (empty pools, single lane, maxCards=1, all spillover)

---

**Status:** ✅ All tasks implemented.
