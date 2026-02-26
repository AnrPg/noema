# ADR-007: Knowledge-Graph-Service Phase 5–7 Compliance Audit & Remediation

## Status

Accepted

## Date

2025-07-09

## Context

After the Phase 7 implementation (ADR-006, commit `f1611bf`), a comprehensive
compliance audit was conducted against the three specification documents:

- **PHASE-5-PKG-OPERATIONS.md** — PKG Service Layer Foundation
- **PHASE-6-CKG-MUTATION-PIPELINE.md** — CKG Mutation Pipeline
- **PHASE-7-STRUCTURAL-METRICS.md** + **STRUCTURAL-METRICS-SPECIFICATION.md** —
  Structural Metrics & Misconception Detection

The audit verified every method, formula, event, error path, and edge case
listed in the specifications against the implementation code. This ADR documents
the findings and the corrective actions taken.

---

## Audit Summary

| Phase   | Verdict             | Gaps Found | Improvements Applied |
| ------- | ------------------- | ---------- | -------------------- |
| Phase 5 | **Fully Compliant** | 0          | 0                    |
| Phase 6 | **Exceeds Spec**    | 0          | 0                    |
| Phase 7 | **7 Gaps Fixed**    | 7          | 3                    |

---

## Phase 5 — PKG Operations (No Gaps)

All 18 service methods, 6 PKG event types, Zod validation at the service
boundary, `EDGE_TYPE_POLICY` enforcement, 20-hop acyclicity check,
`ValidationOptions` audit-logged bypass, CKG graceful empty handling, and
`IServiceResult<T>` with `IAgentHints` were verified present and correct.

## Phase 6 — CKG Mutation Pipeline (No Gaps)

All 7 DSL operation types, the typestate machine (implementation provides 8
states versus the spec's minimum 5), 4 validation stages, `PromotionBand`
thresholds, atomic Neo4j commit, 5 service methods, and 4 events were verified
present. The implementation exceeds the specification in state machine
granularity.

## Phase 7 — Structural Metrics & Misconception Detection (7 Gaps + 3 Improvements)

### Gap P7-1/P7-2/P7-3: Aggregate Health Score Normalization (CRITICAL)

**Spec requirement (STRUCTURAL-METRICS-SPECIFICATION L1114-1145):**

| Metric         | Normalisation to Goodness `s`              |
| -------------- | ------------------------------------------ | --------- | ------------------ |
| SSE            | `s = 1 −                                   | SSE − 0.5 | × 2` (best at 0.5) |
| SSG            | `s = (SSG + 1) / 2` (range [−1,1] → [0,1]) |
| BSI            | `s = (BSI + 1) / 2` (range [−1,1] → [0,1]) |
| Other badness  | `s = 1 − raw`                              |
| Other goodness | `s = raw`                                  |

**Problem:** The implementation used a simple `isBadness ? 1 - raw : raw` for
all metrics, with no special cases. SSE at 0.0 or 1.0 (both bad extremes) would
incorrectly score as 1.0 or 0.0 respectively instead of 0.0 for both. SSG/BSI at
−0.5 would clamp to 0 instead of mapping to 0.25.

**Fix:** Replaced `computeOverallScore` with `normaliseToGoodness` function
implementing all three special cases per the spec formula table.

**File:** `metrics/health/structural-health.ts`

---

### Gap P7-4: CKG Unavailability Handling (CRITICAL)

**Spec requirement:** When the CKG subgraph is empty (no canonical graph for the
domain), CKG-dependent metrics (AD, DCG, SLI, SCE, ULS) should default to 0.0,
and the response should include an agent hint warning of partial results.

**Problem:** `computeMetrics` fetched the CKG subgraph and passed it through
without checking emptiness. Comparison and metric computation would run on empty
data without signalling the limitation.

**Fix:** Added a `ckgUnavailable` guard after fetching subgraphs. When the CKG
is empty, a warning is logged and the agent hints include a risk factor with
`type: 'accuracy'` and an assumption explaining the limitation.

**File:** `knowledge-graph.service.impl.ts` → `computeMetrics`

---

### Gap P7-5: Significant Change Detection for Events (CRITICAL)

**Spec requirement (Phase 7 L78-79):** The `PkgStructuralMetricsUpdated` event
should only be published when metrics change significantly (>0.05 absolute delta
on any metric) or on first computation.

**Problem:** The event was published unconditionally on every `computeMetrics`
call, potentially flooding downstream consumers with no-op events.

**Fix:** Added `detectSignificantMetricChange(current, previous)` private method
that compares all 11 fields against a `SIGNIFICANT_CHANGE_THRESHOLD` of 0.05.
The event is now published only when the check returns true (including first
computation where no previous exists).

**File:** `knowledge-graph.service.impl.ts` → `computeMetrics` +
`detectSignificantMetricChange`

---

### Gap P7-6: MisconceptionDetected Event Not Published (MODERATE)

**Spec requirement:** A `misconception.detected` domain event should be
published for each newly detected misconception so downstream services
(notification, learning agent) can react.

**Problem:** `detectMisconceptions` persisted detections via the repository but
never published events. The `MisconceptionDetectedEvent` schema and type existed
in `@noema/events` but were unused.

**Fix:** Added event publishing inside the detection loop, using
`KnowledgeGraphEventType.MISCONCEPTION_DETECTED` with the full payload (userId,
misconceptionType, affectedNodeIds, confidence, patternId, evidence).

**File:** `knowledge-graph.service.impl.ts` → `detectMisconceptions`

---

### Gap P7-7: Cross-Metric Patterns Misaligned with Spec (MODERATE)

**Spec requirement (STRUCTURAL-METRICS-SPECIFICATION L1048-1107):** Six specific
patterns:

1. High AD + High DCG → Double Misframing
2. High SLI + Low SCE → Interdisciplinary Thinking
3. Low ULS + High TBS → Weak Hierarchy
4. High SSE + Low SAA → Structural Neglect
5. Positive SSG + Negative BSI → Consolidating Wrong Boundaries
6. High SDF + Low TBS → One-Dimensional Depth

**Problem:** The implementation had 6 patterns but they used different metric
combinations: orphaned_depth (DCG+ULS), shallow_breadth (TBS+SDF),
structural_confusion (SCE+AD), accurate_but_leaking (SLI+SAA),
productive_instability (SSG+SAA), structural_plateau (ULS+AD+SSG+BSI).

**Fix:** Rewrote all 6 patterns to match the spec exactly. Added
`suggestedAction` field to capture the spec's recommended remediation.

**File:** `metrics/health/cross-metric-patterns.ts`

---

### Gap P7-8: Optimistic Locking on Metric Snapshots (MINOR — NOT APPLICABLE)

**Analysis:** The metrics repository uses append-only semantics — `saveSnapshot`
always creates a new record. Optimistic locking applies to concurrent updates of
a single record, which does not occur in an append-only model. No change needed.

---

### Improvement I-1: Staleness Guard in computeMetrics

**Rationale:** The spec describes staleness tracking so that metrics are only
recomputed when structural changes have occurred. `computeMetrics` always
recomputed, ignoring staleness entirely.

**Change:** Added a staleness check at the start of `computeMetrics` using
`metricsStalenessRepository.isStale()`. If metrics are fresh and no structural
changes have occurred since the last snapshot, the cached metrics are returned
directly, avoiding unnecessary subgraph fetches and computation.

**File:** `knowledge-graph.service.impl.ts` → `computeMetrics`

---

### Improvement I-2: Cross-Metric Patterns in Health Report

**Rationale:** The structural health report is the primary coordination point
for agent-facing health data, but it did not include detected cross-metric
interaction patterns despite the spec defining them as part of the health
assessment.

**Change:**

- Added `ICrossMetricPatternEntry` interface and optional `crossMetricPatterns`
  field to `IStructuralHealthReport` in `@noema/types`.
- Updated `buildStructuralHealthReport` to call `detectCrossMetricPatterns` and
  include the results in the report.

**Files:** `packages/types/src/knowledge-graph/index.ts`,
`metrics/health/structural-health.ts`

---

### Improvement I-3: Misconception Detection Deduplication

**Rationale:** Without deduplication, calling `detectMisconceptions` multiple
times on the same data would create duplicate active records for the same
pattern, inflating the active misconception count and generating redundant
events.

**Change:** Before persisting new detections, the method now fetches active
misconceptions via `getActiveMisconceptions(userId, domain)` and skips any
result whose `patternId` already has an active detection.

**File:** `knowledge-graph.service.impl.ts` → `detectMisconceptions`

---

## Consequences

### Positive

- All 11 structural metrics and the aggregate health score now match the
  specification formulas exactly
- Domain events are published correctly and only when meaningful (significant
  change guard, misconception detection event)
- Cross-metric patterns align 1:1 with the spec's six interaction patterns
- Staleness guard prevents unnecessary recomputation, improving performance
- Misconception deduplication prevents duplicate active records
- Health reports include cross-metric pattern data for richer agent hints

### Negative

- The `ICrossMetricPattern` interface gained a `suggestedAction` field and
  `IStructuralHealthReport` gained an optional `crossMetricPatterns` field —
  both additive, backward-compatible changes to the types package
- Staleness guard adds one extra repository call per `computeMetrics` invocation
  (offset by skipping full computation when metrics are fresh)

### Risks

- The significant change threshold (0.05) is a heuristic — future tuning may be
  needed if downstream consumers miss important but small metric shifts
- Cross-metric pattern thresholds are initial values that should be calibrated
  against real student data
