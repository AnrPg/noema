# ADR-010: Knowledge-Graph-Service Remediation Phase 1 — Foundation

## Status

Accepted

## Date

2026-03-02

## Context

A comprehensive full-service audit (documented in
`KNOWLEDGE-GRAPH-SERVICE-ANALYSIS-REPORT.md`) produced 67 findings across the
knowledge-graph-service: 8 Critical, 20 High, 25 Medium, and 14 Low. A 5-phase
dependency-ordered remediation plan (`REMEDIATION-PLAN.md`) was created to
address all findings systematically.

Phase 1 ("Foundation: Data Bugs, Type Safety & Error Handling") targeted the
lowest-layer defects that all higher-layer code depends on. These fixes are
leaf-node corrections: no other work depends on them, but ALL higher-layer code
benefits from correct infrastructure.

---

## Decisions

### D1: StructuralMetricsEngine Return Type

**Problem:** `computeAll()` returned `IStructuralMetrics` directly, defaulting
failed metric computations to `0` — indistinguishable from valid results.

**Decision:** Return
`IMetricsComputationResult = { metrics: IStructuralMetrics, partialFailures: Array<{ field: string, error: string }> }`.
This makes partial computation failures visible to callers without breaking the
happy path.

**Consequences:** All call sites must destructure the new return type. ADR-006
D1 updated — the engine no longer silently swallows failures.

### D2: MisconceptionDetectionEngine Return Type

**Problem:** Individual detector failures were caught and logged to
`console.error`; callers had no idea semantic/statistical detection failed.

**Decision:** Return
`{ results: IMisconceptionDetectionResult[], detectorStatuses: Array<{ kind: string, status: 'success' | 'error', error?: string }> }`.

**Consequences:** Callers can report partial detection failures in health
reports. ADR-006 D3 updated.

### D3: Logger Dependency Injection

**Problem:** Domain-layer code (`StructuralMetricsEngine`,
`MisconceptionDetectionEngine`, `MetricComputationContext`) used `console.*`
directly, bypassing structured logging.

**Decision:** Inject `Logger` via constructor DI in all three classes. Replace
all `console.error/warn` calls with `this.logger.error/warn`.

**Consequences:** Domain code now participates in structured logging with
correlation IDs and log-level control.

### D4: ICkgMutation Readonly Fields

**Problem:** `state`, `version`, and `updatedAt` on `ICkgMutation` were mutable,
allowing pipeline code to mutate state in-place.

**Decision:** Made all three fields `readonly`. Pipeline must create new objects
via spread syntax `{ ...mutation, state: newState }`.

**Consequences:** Immutability enforced at compile time. Pipeline code that
mutated in-place would fail to compile. ADR-005 D1 updated.

### D5: ConfidenceScore Branded Type in Misconception Detection

**Problem:** `IMisconceptionDetectionResult.confidence` was typed as plain
`number`. Detectors constructed confidence values without validation.

**Decision:** Changed to branded `ConfidenceScore` type. All detector confidence
values now go through `ConfidenceScoreFactory.create()` or `.clamp()`.

**Consequences:** Type safety prevents passing unvalidated numbers as confidence
scores. Consistent with other branded numerics in the codebase.

### D6: StructuralMetricType Enum Usage

**Problem:** 26 occurrences of `'...' as StructuralMetricType` string casts in
`structural-health.ts` and `metacognitive-stage.ts`.

**Decision:** Import the const-object as a value (`StructuralMetricType as SMT`)
and use member access (`SMT.ABSTRACTION_DRIFT`) instead of unsafe casts.

**Consequences:** Typos in metric type names are now caught at compile time. No
runtime behaviour change.

### D7: Context-Aware Divergence Severity

**Problem:** `MISSING_NODE` divergences were always `MEDIUM` and `EXTRA_NODE`
always `LOW`, regardless of the node's importance in the graph.

**Decision:** Severity now depends on node connectivity (edge count):

- Missing nodes: ≥4 edges → HIGH, ≥2 → MEDIUM, else LOW
- Extra nodes: ≥4 edges → MEDIUM, else LOW

**Consequences:** High-connectivity missing nodes (central concepts) are
surfaced more prominently in health reports.

### D8: Full Cycle Path Extraction in DFS

**Problem:** Cycle detection only recorded the 2 endpoints of a back-edge, not
all nodes participating in the cycle.

**Decision:** Track the full DFS stack path. When a back-edge is detected, walk
the stack backwards from the current node to the cycle entry point to collect
all participants.

**Consequences:** Cycle-related misconception results now include all affected
nodes, improving remediation quality.

### D9: Detector Config Zod Validation

**Problem:** Detector config was accessed via
`config as Record<string, unknown>` with
`config['detectionType'] as string | undefined` — unsafe cast chain.

**Decision:** Define per-detector Zod schemas (`StructuralDetectorConfigSchema`,
`StatisticalDetectorConfigSchema`) and use `safeParse()` to extract config
fields safely.

**Consequences:** Malformed config data is handled gracefully instead of
producing runtime type errors.

---

## Changes Applied (22 files, 458 tests passing)

| Fix     | Summary                                                  | Files Modified                                |
| ------- | -------------------------------------------------------- | --------------------------------------------- |
| 1.1     | Sync ALL_REL_TYPES → RELATIONSHIP_TYPES (8→17)           | neo4j-graph.repository.ts, neo4j-schema.ts    |
| 1.2     | Fix nodeId → nodeIds Cypher parameter                    | neo4j-graph.repository.ts                     |
| 1.3     | Zod runtime validation for mutation operations           | ckg-mutation-pipeline.ts                      |
| 1.4+5   | Typed metrics result + partial failures                  | structural-metrics-engine.ts, metrics/index   |
| 1.6     | Forward pagination in CachedGraphRepository.findEdges    | cached-graph.repository.ts                    |
| 1.7     | Fix direction 'both' nodeId filter                       | graph.repository.ts, neo4j-graph.repo, routes |
| 1.8+9   | Logger DI + detector status tracking                     | misconception-detection-engine.ts, context    |
| 1.10    | Serializable operations mapper                           | ckg-mutation-pipeline.ts                      |
| 1.11+12 | EdgeId branded types + userId ownership checks           | knowledge-graph.service.impl.ts, routes       |
| 1.13    | proposedBy .min(1) validation                            | ckg-mutation-dsl.ts                           |
| 1.14    | Detector config Zod schemas                              | structural-detector.ts, statistical-detector  |
| 1.15    | StructuralMetricType enum imports (26 casts removed)     | structural-health.ts, metacognitive-stage.ts  |
| 1.16    | ICkgMutation readonly fields                             | mutation.repository.ts                        |
| 1.17    | Deep equality for properties in change detection         | knowledge-graph.service.impl.ts               |
| 1.18    | Multi-edge map for divergence detection                  | graph-comparison-builder.ts                   |
| 1.19    | Full cycle path in DFS                                   | structural-detector.ts                        |
| 1.20    | Context-aware divergence severity                        | graph-comparison-builder.ts                   |
| 1.21    | Unknown promotion band validation                        | promotion-band.ts                             |
| 1.23    | ConfidenceScore branded type in misconception types      | misconception/types.ts, detectors             |
| 1.24    | Traversal depth validation (reject ≤0, NaN, non-integer) | knowledge-graph.service.impl.ts               |

---

## ADR Cross-References Updated

- **ADR-003 D1:** Relationship type count updated from 8 → 17 (Fix 1.1)
- **ADR-005 D4:** Pipeline operations now validated with Zod at extraction (Fix
  1.3); ICkgMutation state/version/updatedAt now readonly (Fix 1.16)
- **ADR-006 D1:** StructuralMetricsEngine returns `IMetricsComputationResult`
  with partial failures (Fix 1.4+1.5); console.error replaced with injected
  logger (Fix 1.8)
- **ADR-006 D3:** MisconceptionDetectionEngine returns detector statuses (Fix
  1.9); detectors use Zod config schemas (Fix 1.14); confidence is branded (Fix
  1.23)

---

## Related

- KNOWLEDGE-GRAPH-SERVICE-ANALYSIS-REPORT.md (67 findings)
- REMEDIATION-PLAN.md (5-phase plan)
- ADR-003, ADR-005, ADR-006 (updated with addendums)
