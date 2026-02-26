# ADR-006: Knowledge-Graph-Service Phase 7 — Structural Metrics & Misconception Detection

## Status

Accepted

## Date

2025-07-07

## Context

Phase 6 (ADR-005) implemented the CKG Mutation Pipeline with typestate-governed
processing for Canonical Knowledge Graph changes. Phase 7 introduces
**Structural Metrics** — an 11-metric system that quantifies divergences between
a student's Personal Knowledge Graph (PKG) and the Canonical Knowledge Graph
(CKG) — together with a **Misconception Detection** engine that detects and
tracks structural, statistical, and semantic misconceptions.

The structural metrics provide the numerical foundation for metacognitive stage
assessment, health reporting, and adaptive scaffolding decisions. Each metric
captures a distinct facet of graph quality: abstraction alignment, depth
calibration, scope containment, sibling discrimination, hierarchical link
fidelity, traversal coverage, strategy-depth fit, structural entropy,
attribution accuracy, stability across sessions, and boundary sensitivity.

Before implementation, seven design decisions required resolution. Each was
evaluated with multiple options; the user approved one per decision.

---

## Decisions

### D1: Metric Computer Architecture

**Problem:** How should the 11 structural metric formulas be organized?

| Option                             | Description                                                         | Trade-off                                              |
| ---------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| A: Monolithic function             | One large function with all formulas inline                         | Simple; hard to test or extend individual metrics      |
| **B: Strategy pattern per metric** | `IMetricComputer` interface with one class per metric, orchestrated | Clean SRP; independently testable; easy to add metrics |
| C: Plugin/registry with hot-reload | Dynamic loading of metric plugins at runtime                        | Over-engineered for a fixed set of 11 domain metrics   |

**Decision:** Option B — Strategy pattern with `IMetricComputer` interface. Each
metric has its own class file in `metrics/computers/`. A
`StructuralMetricsEngine` orchestrates all computers and maps abbreviations to
`IStructuralMetrics` fields via an `ABBREVIATION_TO_FIELD` lookup.

### D2: Type System Placement

**Problem:** Where should structural metric types, health report types, and
metacognitive stage types be defined?

| Option                                | Description                                                                 | Trade-off                                   |
| ------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------- |
| A: Local types only                   | All types in the service's own `types.ts`                                   | Simple; other services can't consume them   |
| B: All in `@noema/types`              | Types remain local, enums in shared package                                 | Intermediate; partial sharing               |
| **C: Shared types + local internals** | Public interfaces/enums in `@noema/types`; internal computation types local | Cross-service readability; clean public API |

**Decision:** Option C — Added `MetricHealthStatus`, `TrendDirection`,
`MetacognitiveStage`, and `StructuralMetricType` enums to `@noema/types/enums`.
Added `IStructuralMetrics` (11-field flat interface), `IStructuralHealthReport`,
`IMetacognitiveStageAssessment`, `IMetricStatusEntry`, `IStageGateCriterion`,
and `IStageGateGap` to `@noema/types/knowledge-graph`. Internal types
(`IMetricComputationContext`, `ISiblingGroup`, `IStructuralRegion`,
`IMisconceptionDetectionContext`, `IMisconceptionDetector`) remain local.

### D3: Misconception Detection Architecture

**Problem:** How should misconception detection be structured across the three
pattern kinds (structural, statistical, semantic)?

| Option                   | Description                                                | Trade-off                                              |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------ |
| A: Single detector class | One class handles all three kinds via switch               | Compact; low SRP; grows unwieldy as detectors evolve   |
| B: Pattern-per-function  | Top-level functions per detection type                     | Flat; hard to inject or configure per kind             |
| **C: Strategy per-kind** | `IMisconceptionDetector` interface with one class per kind | Consistent with D1; independently testable; extensible |

**Decision:** Option C — Strategy pattern with `IMisconceptionDetector`
interface per pattern kind. `StructuralMisconceptionDetector` detects circular
dependencies, orphaned subgraphs, inverted hierarchies, missing prerequisites,
duplicate concepts, and broken chains. `StatisticalMisconceptionDetector`
detects weight anomalies, degree outliers, and clustering gaps.
`SemanticMisconceptionDetector` is stubbed for future NLP integration. A
`MisconceptionDetectionEngine` orchestrates all detectors.

### D4: Computation Context Strategy

**Problem:** Metric formulas share expensive graph traversals (depth maps,
parent maps, sibling groups, edge distributions). How should this shared context
be provided?

| Option                              | Description                                                               | Trade-off                                             |
| ----------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| A: Lazy per-metric                  | Each computer traverses what it needs                                     | Redundant traversals; O(n²) worst case                |
| **B: Eagerly pre-computed context** | Single `buildMetricComputationContext()` factory computes all shared data | One traversal pass; immutable context; deterministic  |
| C: Memoized cache                   | Shared cache with lazy-init per field                                     | Moderate complexity; harder to reason about freshness |

**Decision:** Option B — A `buildMetricComputationContext()` factory eagerly
computes `IMetricComputationContext` containing PKG/CKG subgraphs, depth maps,
parent maps, sibling groups, edge distributions, node type maps, structural
regions, graph comparison, and active strategy. This immutable record is passed
to all 11 metric computers, ensuring each formula operates on the same snapshot
with zero redundant traversals.

### D5: Health Report & Stage Assessment Design

**Problem:** How should the health report and metacognitive stage assessment be
computed?

| Option                                  | Description                                                                | Trade-off                                                  |
| --------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **A: Weighted aggregate + stage gates** | Config-driven per-metric weights for health; ordered gate rules for stages | Tunable; transparent; matches cognitive scaffolding theory |
| B: ML-based classification              | Train a model on metric vectors                                            | Adaptive; requires training data we don't have yet         |

**Decision:** Option A — The health report uses a `METRIC_CONFIGS` record with
per-metric weights (summing to 1.0), healthy/critical thresholds, and
badness/goodness polarity to compute a weighted `overallScore` in [0, 1]. Trend
is computed from the last 3 snapshots. The metacognitive stage assessment uses
ordered `STAGE_GATES` — from `USER_OWNED` (highest) down to `SYSTEM_GUIDED`
(baseline) — where each gate specifies a metric field, operator
(`below`/`above`/`stable`/`improving`), and threshold. The first stage whose
gates are ALL satisfied becomes the current stage.

### D6: Constructor Injection Order

**Problem:** Two new repositories (`IMetricsRepository`,
`IMisconceptionRepository`) must be injected into `KnowledgeGraphService`. Where
should they go?

| Option                                  | Description                                                  | Trade-off                                                |
| --------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| A: Append after eventPublisher          | Positions 6 and 7, after position 5 (eventPublisher)         | Disrupts the repository–service boundary                 |
| **B: After metricsStalenessRepository** | Positions 4 and 5, after the existing staleness repo (pos 3) | Groups all metric-related repos together; clean DI order |

**Decision:** Option B — `metricsRepository` at position 4 and
`misconceptionRepository` at position 5, immediately after
`metricsStalenessRepository` (position 3). This groups all metrics-related
dependencies together. The constructor now has 8 parameters: `graphRepository`,
`operationLogRepository`, `metricsStalenessRepository`, `metricsRepository`,
`misconceptionRepository`, `eventPublisher`, `mutationPipeline`, `logger`.

### D7: File Organisation

**Problem:** Phase 7 introduces ~20 new files. How should they be organized?

| Option                      | Description                                    | Trade-off                                              |
| --------------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| A: Flat in domain directory | All files alongside existing service files     | Simple; cluttered at 30+ files                         |
| **B: Subdirectories**       | `metrics/` and `misconception/` subdirectories | Clean separation; discoverable; consistent with domain |

**Decision:** Option B — Created `metrics/` subdirectory containing `computers/`
(11 metric files + barrel), `health/` (`structural-health.ts`,
`metacognitive-stage.ts`, `cross-metric-patterns.ts` + barrel), `types.ts`,
`metric-computation-context.ts`, `graph-comparison-builder.ts`,
`structural-metrics-engine.ts`, and barrel `index.ts`. Created `misconception/`
subdirectory containing `detectors/` (3 detector files + barrel), `types.ts`,
`misconception-detection-engine.ts`, and barrel `index.ts`.

---

## Architecture

### Metric Computation Flow

```
Service.computeMetrics(userId, domain)
  │
  ├─ Staleness check: isStale(userId, domain, lastComputedAt)?
  │   └─ No → return cached snapshot
  │
  ├─ fetchDomainSubgraph(userId, domain, PKG)  → pkgSubgraph
  ├─ fetchDomainSubgraph(userId, domain, CKG)  → ckgSubgraph
  │
  ├─ buildMetricComputationContext(pkg, ckg, strategy)
  │   ├─ Depth maps (Kahn's algorithm + DP longest path)
  │   ├─ Parent maps (is_a / part_of edges)
  │   ├─ Sibling groups
  │   ├─ Edge distributions
  │   ├─ Node-type maps
  │   ├─ Structural regions (BFS from hierarchy roots)
  │   └─ Graph comparison (label-based node alignment)
  │
  ├─ StructuralMetricsEngine.computeAll(ctx) → IStructuralMetrics
  │   ├─ AD  – Abstraction Drift
  │   ├─ DCG – Depth Calibration Gradient
  │   ├─ SLI – Scope Leakage Index
  │   ├─ SCE – Sibling Confusion Entropy
  │   ├─ ULS – Upward Link Strength
  │   ├─ TBS – Traversal Breadth Score
  │   ├─ SDF – Strategy-Depth Fit
  │   ├─ SSE – Structural Strategy Entropy
  │   ├─ SAA – Structural Attribution Accuracy
  │   ├─ SSG – Structural Stability Gain
  │   └─ BSI – Boundary Sensitivity Improvement
  │
  ├─ metricsRepository.saveSnapshot(userId, domain, metrics)
  └─ Publish STRUCTURAL_METRICS_COMPUTED event
```

### Misconception Detection Flow

```
Service.detectMisconceptions(userId, domain)
  │
  ├─ Build context: { pkgSubgraph, ckgSubgraph, comparison, patterns }
  │
  ├─ MisconceptionDetectionEngine.detectAll(ctx)
  │   ├─ StructuralMisconceptionDetector
  │   │   ├─ Circular dependencies (DFS cycle detection)
  │   │   ├─ Orphaned subgraphs (connected components)
  │   │   ├─ Inverted hierarchies (CKG reverse-edge check)
  │   │   ├─ Missing prerequisites (CKG prerequisite coverage)
  │   │   ├─ Duplicate concepts (normalised label matching)
  │   │   └─ Broken chains (in-degree gap analysis)
  │   │
  │   ├─ StatisticalMisconceptionDetector
  │   │   ├─ Weight anomalies (z-score outlier detection)
  │   │   ├─ Degree outliers (z-score on degree centrality)
  │   │   └─ Clustering gaps (local clustering coefficient)
  │   │
  │   └─ SemanticMisconceptionDetector (stub)
  │
  ├─ misconceptionRepository.recordDetection(...)
  └─ Publish MISCONCEPTION_DETECTED event
```

### Health & Stage Assessment

```
Service.getStructuralHealth(userId, domain)
  │
  ├─ Latest metrics + snapshot history
  ├─ Active misconception count
  ├─ assessMetacognitiveStage(metrics, previousMetrics, domain)
  │   ├─ Evaluate STAGE_GATES: USER_OWNED → SHARED_CONTROL → STRUCTURE_SALIENT → SYSTEM_GUIDED
  │   ├─ Compute nextStageGaps
  │   └─ Detect stage regression
  │
  └─ buildStructuralHealthReport(metrics, snapshots, misconceptionCount, stage, domain)
      ├─ Per-metric health classification (HEALTHY / WARNING / CRITICAL)
      ├─ Weighted overall score
      └─ Trend analysis (IMPROVING / STABLE / DECLINING)
```

---

## File Inventory

### New files (22 total)

| Directory                  | File                                  | Lines | Purpose                                             |
| -------------------------- | ------------------------------------- | ----- | --------------------------------------------------- |
| `metrics/`                 | `types.ts`                            | ~145  | Internal interfaces: IMetricComputer, context, etc. |
| `metrics/`                 | `metric-computation-context.ts`       | ~392  | Eagerly pre-computed shared context factory         |
| `metrics/`                 | `graph-comparison-builder.ts`         | ~351  | PKG↔CKG node alignment and structural comparison    |
| `metrics/`                 | `structural-metrics-engine.ts`        | ~122  | Orchestrates all 11 metric computers                |
| `metrics/`                 | `index.ts`                            | ~12   | Barrel export                                       |
| `metrics/computers/`       | `abstraction-drift.ts`                | ~80   | AD metric: depth-distribution divergence            |
| `metrics/computers/`       | `depth-calibration-gradient.ts`       | ~70   | DCG metric: parent-depth ordering violations        |
| `metrics/computers/`       | `scope-leakage-index.ts`              | ~55   | SLI metric: out-of-domain edge ratio                |
| `metrics/computers/`       | `sibling-confusion-entropy.ts`        | ~55   | SCE metric: intra-sibling edge entropy              |
| `metrics/computers/`       | `upward-link-strength.ts`             | ~82   | ULS metric: hierarchical edge coverage & weight     |
| `metrics/computers/`       | `traversal-breadth-score.ts`          | ~55   | TBS metric: fraction of CKG nodes visited           |
| `metrics/computers/`       | `strategy-depth-fit.ts`               | ~106  | SDF metric: Jensen-Shannon divergence from strategy |
| `metrics/computers/`       | `structural-strategy-entropy.ts`      | ~50   | SSE metric: edge-type Shannon entropy               |
| `metrics/computers/`       | `structural-attribution-accuracy.ts`  | ~70   | SAA metric: aligned edge match fraction             |
| `metrics/computers/`       | `structural-stability-gain.ts`        | ~50   | SSG metric: session-over-session stability          |
| `metrics/computers/`       | `boundary-sensitivity-improvement.ts` | ~60   | BSI metric: scope leakage improvement rate          |
| `metrics/computers/`       | `index.ts`                            | ~12   | Barrel export                                       |
| `metrics/health/`          | `structural-health.ts`                | ~266  | Weighted health report builder                      |
| `metrics/health/`          | `metacognitive-stage.ts`              | ~315  | Stage gate evaluation                               |
| `metrics/health/`          | `cross-metric-patterns.ts`            | ~150  | Compound cross-metric pattern detection             |
| `metrics/health/`          | `index.ts`                            | ~4    | Barrel export                                       |
| `misconception/`           | `types.ts`                            | ~75   | Detection context, result, detector interfaces      |
| `misconception/`           | `misconception-detection-engine.ts`   | ~60   | Orchestrates all misconception detectors            |
| `misconception/`           | `index.ts`                            | ~5    | Barrel export                                       |
| `misconception/detectors/` | `structural-detector.ts`              | ~371  | 6 structural pattern detectors                      |
| `misconception/detectors/` | `statistical-detector.ts`             | ~205  | 3 statistical anomaly detectors                     |
| `misconception/detectors/` | `semantic-detector.ts`                | ~25   | Stub for future NLP integration                     |
| `misconception/detectors/` | `index.ts`                            | ~4    | Barrel export                                       |

### Modified files

| File                                          | Changes                                                                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/types/src/enums/index.ts`           | Added 4 enums (MetricHealthStatus, TrendDirection, MetacognitiveStage, StructuralMetricType)                                                            |
| `packages/types/src/knowledge-graph/index.ts` | Added 6 interfaces (IStructuralMetrics, IStructuralHealthReport, IMetacognitiveStageAssessment, IMetricStatusEntry, IStageGateCriterion, IStageGateGap) |
| `knowledge-graph.service.ts`                  | Added `getStructuralHealth()` and `getMetacognitiveStage()` to service interface                                                                        |
| `knowledge-graph.service.impl.ts`             | Implemented 9 Phase 7 methods, added constructor params, hint generators, fetchDomainSubgraph helper                                                    |
| `index.ts` (domain barrel)                    | Added metrics/ and misconception/ module exports                                                                                                        |

---

## Consequences

### Positive

- **Comprehensive diagnostics:** 11 metrics cover all facets of graph quality,
  from abstraction alignment to boundary sensitivity
- **Independently testable:** Each metric computer, detector, and engine is a
  standalone unit with pure-function computation
- **Eagerly computed context:** Single graph traversal pass eliminates redundant
  computation across metrics
- **Extensible:** Adding a 12th metric requires only a new `IMetricComputer`
  class and one entry in `ABBREVIATION_TO_FIELD`
- **Metacognitive scaffolding:** Stage gates provide data-driven scaffolding
  transitions from SYSTEM_GUIDED to USER_OWNED
- **Configuration-driven health:** Metric weights and thresholds are tunable
  without code changes

### Negative

- **Code volume:** ~28 new files add ~3,500 lines to the service domain
- **Semantic detection deferred:** The `SemanticMisconceptionDetector` is a
  stub; NLP-based detection requires embedding infrastructure not yet available
- **No persistence for health/stage:** Health reports and stage assessments are
  computed on-the-fly; caching may be needed under high load
- **Threshold heuristics:** Stage gate thresholds and metric weights are initial
  best estimates; empirical tuning with real student data is required

### Risks

- **Context factory cost:** `buildMetricComputationContext()` performs full
  graph traversal. For very large graphs (>10k nodes), this may need pagination
  or sampling strategies
- **Cross-metric coupling:** Some metrics (e.g., SSG, BSI) depend on historical
  snapshots; if snapshot retention is too short, these metrics degrade silently
- **Stage gate monotonicity:** The current gate evaluation assumes stages are
  strictly ordered; non-linear progression patterns may require stage-specific
  rules in a future iteration

---

## Related

- ADR-005: Phase 6 — CKG Mutation Pipeline
- ADR-004: Phase 5 — PKG Operations & Service Layer
- PHASE-7-STRUCTURAL-METRICS.md specification
- STRUCTURAL-METRICS-SPECIFICATION.md (11-metric formulas)
- `@noema/types` MetricHealthStatus, TrendDirection, MetacognitiveStage,
  StructuralMetricType, IStructuralMetrics, IStructuralHealthReport,
  IMetacognitiveStageAssessment
