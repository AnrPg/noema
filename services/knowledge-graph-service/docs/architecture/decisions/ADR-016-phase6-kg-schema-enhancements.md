# ADR-016: Phase 6 — Knowledge Graph & Scheduling Schema Enhancements ("Wernicke's Area")

**Status:** Accepted
**Date:** 2025-07-13
**Phase:** Backend Phase 6 — Wernicke's Area
**Spec:** `docs/backend/phases/PHASE-06-KG-ENHANCEMENTS.md`
**Related:** ADR-005 (CKG mutation pipeline), ADR-006 (structural metrics &
misconception detection), ADR-010–015 (remediation)

## Context

Three isolated but related deficiencies needed fixing:

1. **Misconception detection lacks severity and family** — detections were flat
   objects without semantic richness. The frontend Misconception Center (Phase 8)
   needs severity colour-coding and family grouping for coherent remediation.

2. **CKG mutation pipeline missing "request revision"** — reviewers could only
   approve or reject; there was no "request changes" action. Partially-good
   mutations had to be rejected and re-proposed, destroying context.

3. **Leitner not in scheduler schema** — the Zod enum for `schedulingAlgorithm`
   accepted `fsrs`, `hlr`, and `sm2` but rejected `leitner`, causing validation
   failures for card configurations that reference the Leitner box system.

## Decisions

### D1: 4-level severity (per-detection), weighted scoring formula

**Decision:** Use four severity levels — LOW, MODERATE, HIGH, CRITICAL — instead
of the spec's five (trivial/mild/moderate/severe/critical). Severity is computed
per detection using a weighted formula:

```
severityScore = 0.7 × confidence + 0.3 × min(affectedCount / 20, 1.0)
```

Score-to-band mapping:
- ≥ 0.85 → CRITICAL
- ≥ 0.60 → HIGH
- ≥ 0.35 → MODERATE
- < 0.35 → LOW

**Rationale:** The spec's suggested formula references `conceptCentrality` and
`dependentCount`, which require expensive graph traversals during detection. The
simplified formula uses data already available at detection time (confidence from
the detector, affected node count from graph analysis). Four levels provide
sufficient granularity for front-end UX while avoiding the
trivial-vs-mild ambiguity. Severity is computed per-detection (not per-pattern)
because the same misconception pattern can have different severity in different
contexts.

**Alternatives considered:**
- 5-level severity matching spec — rejected: trivial vs mild distinction is
  unclear to users and would require additional UX design.
- Graph-centrality-based formula — deferred: requires async graph traversal;
  can be added as a refinement without schema changes.

### D2: REVISION_REQUESTED typestate addition

**Decision:** Add `REVISION_REQUESTED` as a new state in the CKG mutation
typestate machine.

Transitions:
- `pending_review → revision_requested` (reviewer requests changes)
- `revision_requested → proposed` (submitter resubmits)
- `revision_requested → rejected` (reviewer/admin gives up)

Added `revisionCount` (Int, default 0) and `revisionFeedback` (String?, max
4000 chars) to the CkgMutation model. On resubmit, the mutation re-enters the
pipeline from PROPOSED and runs through validation again.

**Rationale:** An explicit state makes the review workflow visible in queries
and dashboards. The feedback field preserves reviewer comments through the
revision cycle. Re-entering from PROPOSED ensures revised mutations go through
the full validation pipeline.

**Alternatives considered:**
- Soft overlay on PENDING_REVIEW (use feedback field + stay in same state) —
  rejected: ambiguous whether mutation is awaiting reviewer or submitter; queries
  become complicated.
- Separate MutationReview model — rejected: over-engineered for the current
  scope; the typestate pattern already handles workflow transitions cleanly.

### D3: JSON-like TypeScript config for misconception families

**Decision:** Use a TypeScript configuration file
(`misconception-family.config.ts`) defining an array of `IMisconceptionFamily`
objects, each mapping a set of `MisconceptionType` enum values to a family.

10 families + 1 catch-all (uncategorized):
- graph-structural, overgeneralization, undergeneralization,
  cause-effect-reversal, false-analogy, vocabulary-conflation,
  temporal-ordering, scale-confusion, metacognitive, process-confusion,
  uncategorized.

`resolveFamily(type)` uses first-match semantics. Every `MisconceptionType`
(28 total across 5 categories) is explicitly mapped to exactly one family.

**Rationale:** TypeScript config provides compile-time type safety (the family
mappings reference actual `MisconceptionType` enum values). It ships as code —
no file I/O or config parsing at runtime. The first-match pattern allows
overlapping semantic mappings if future types are ambiguous.

**Alternatives considered:**
- External JSON config file — rejected: loses type safety; requires runtime
  schema validation.
- Database table — rejected: families are stable domain knowledge, not
  user-configurable data. A table adds migration overhead without benefit.
- ML-based classification — deferred: planned as a future enhancement; the
  config-based approach is the reliable baseline.

### D4: Upsert pattern for misconception dedup

**Decision:** Deduplicate detections using an upsert pattern keyed on
`(userId, misconceptionPatternId)` for active (non-resolved) detections.

When a new detection matches an existing active detection:
- Increment `detectionCount`
- Update `lastDetectedAt`
- Take max of old/new confidence
- Union `affectedNodeIds`
- If status was `addressed`, change to `recurring`

Unique constraint: `@@unique([userId, misconceptionPatternId, status])` in
Prisma schema.

**Rationale:** The previous implementation fetched all active misconceptions
and filtered in-memory (O(n) per detection). The upsert uses a targeted
database query (find one active by user + pattern) and atomic update. The unique
constraint prevents duplicate active detections at the database level. Resolved
detections are excluded so a misconception can be re-detected after resolution.

**Alternatives considered:**
- Application-level dedup with Set (previous approach) — replaced: required
  fetching all active misconceptions for every detection batch; didn't persist
  recurrence count.
- Postgres ON CONFLICT upsert — rejected: Prisma doesn't support ON CONFLICT
  with complex conditions (non-resolved status filter); the
  find-then-update-or-create pattern is clearer and works within Prisma's API.

## Implementation Summary

### Files Modified

**Shared packages:**
- `packages/types/src/enums/index.ts` — Added `MisconceptionSeverity` enum (4
  levels) and `REVISION_REQUESTED` to `MutationState`
- `packages/types/src/knowledge-graph/index.ts` — Enriched
  `IMisconceptionDetection` with severity, family, description, detectionCount,
  lastDetectedAt
- `packages/events/src/knowledge-graph/knowledge-graph.events.ts` — Added
  `CKG_MUTATION_REVISION_REQUESTED` event type and payload
- `packages/events/src/knowledge-graph/knowledge-graph-event.schemas.ts` — Added
  Zod schema for revision requested event

**Knowledge-graph-service domain:**
- `ckg-typestate.ts` — Added `revision_requested` state and transitions
- `ckg-mutation-pipeline.ts` — Added `requestRevision()` and
  `resubmitMutation()` methods
- `ckg-mutation-dsl.ts` — Added `revision_requested` to filter state enum
- `metrics-orchestrator.service.ts` — Added severity computation
  (`computeSeverityScore`, `scoreToBand`), switched to `upsertDetection`,
  removed old in-memory dedup
- `misconception-family.config.ts` — NEW: family config with 10 families + 1
  catch-all mapping all 28 MisconceptionType values
- `misconception.repository.ts` — Enriched `IMisconceptionRecord` and
  `IRecordDetectionInput`; added `upsertDetection()` method
- `mutation.repository.ts` — Added `revisionCount`, `revisionFeedback` to
  `ICkgMutation`; added `updateMutationFields()` method
- `knowledge-graph.service.ts` — Added `requestMutationRevision()` and
  `resubmitMutation()` to interface
- `knowledge-graph.service.impl.ts` — Implemented new service methods

**Knowledge-graph-service infrastructure:**
- `prisma/schema.prisma` — Added PENDING_REVIEW/REVISION_REQUESTED to enum;
  added revision and severity fields; added unique constraint and indexes
- `prisma-misconception.repository.ts` — Implemented `upsertDetection()`,
  updated mappers with severity/family helpers
- `prisma-mutation.repository.ts` — Updated `toDomain()`, implemented
  `updateMutationFields()`

**Knowledge-graph-service API:**
- `ckg-mutation.routes.ts` — Added POST `/request-revision` and PATCH
  `/:mutationId` routes
- `ckg-mutation.schemas.ts` — Added `RequestRevisionRequestSchema` and
  `ResubmitMutationRequestSchema`

**Scheduler-service:**
- `scheduler.schemas.ts` — Added `'leitner'` to scheduling algorithm Zod enum

### Emergent Decisions During Implementation

1. **`toSerializableOperations()` reuse** — The existing pipeline helper that
   safely serializes `CkgMutationOperation[]` → `Metadata[]` was reused for the
   resubmit flow. This ensures consistent serialization and prevents
   `Record<string, unknown>` / `JsonValue` type mismatches.

2. **PENDING_REVIEW added to Prisma enum** — The domain layer already used
   `pending_review` as a MutationState value (via string-based state mapping),
   but the Prisma enum lacked the corresponding `PENDING_REVIEW` variant. Added
   alongside `REVISION_REQUESTED` to align Prisma schema with domain reality.

3. **Module-private severity functions** — `computeSeverityScore()` and
   `scoreToBand()` were implemented as module-private functions (not class
   methods) at the bottom of `metrics-orchestrator.service.ts`. This keeps the
   orchestrator class focused on coordination and makes the scoring logic
   independently testable.

## Consequences

- Frontend Misconception Center (Phase 8) can now colour-code detections by
  severity and group by family.
- CKG review workflow supports approve/reject/request-revision triad.
- The `leitner` algorithm value passes scheduler validation.
- **Migration needed:** The Prisma schema changes require a database migration
  before deployment (`prisma migrate dev` / `prisma migrate deploy`).
- **Follow-up work deferred:**
  - Graph-centrality-based severity refinement (requires async traversal)
  - ML-based family classification
  - Consumer-driven contract tests for new endpoints
  - OpenAPI/AsyncAPI spec update for new routes and event
