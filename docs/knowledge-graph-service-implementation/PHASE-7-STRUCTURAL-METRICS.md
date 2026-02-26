# Phase 7: Structural Metrics & Misconception Detection

## Objective

Implement the structural metrics computation engine and misconception detection
system. This phase extends the `KnowledgeGraphService` with `computeMetrics`,
`compareWithCkg`, and `detectMisconceptions` — the analytical methods that
transform raw graph structure into metacognitive signals.

This phase is deliberately placed **after** Phase 6 (CKG Mutation Pipeline)
because 7 of the 11 structural metrics require CKG data for computation, and
`compareWithCkg` and misconception detection also depend on CKG structure. By
this point, the CKG mutation pipeline is functional and CKG data can exist,
so all metrics compute at full accuracy from day one — no graceful degradation
needed.

---

## Boilerplate Instructions

Read PROJECT_CONTEXT.md, then, based on the files with respective
specifications, help me with the implementation. The design process should
follow the principles in PROJECT_CONTEXT.md (APIs and schema first, follow the
microservices pattern, expose agent tools and interfaces for agents etc). If
there is any design decision you must take, first show me options with pros and
cons and ask me to choose.

Generate new code strictly in the existing project style and architecture, fully
conforming to current schemas, APIs, types, models, and patterns; maximize reuse
of existing implementations, favor additive and minimally invasive changes over
redesign or refactoring, and if you detect that modifying or breaking existing
behavior is unavoidable, trigger the harness to stop and explicitly ask for my
approval before proceeding; after implementation, resolve all errors, warnings,
and inconsistencies (including pre-existing ones), request clarification for any
architectural decisions, produce an ADR documenting the changes, and commit with
clear, structured messages.

I want you to make sure that no errors, or warnings or uncommited changes remain
in the codebase after your implementation. If you detect any, please ask me to
approve fixing them before proceeding with new implementations.

Also, before you begin implementing and writing code, tell me with details about
the design decisions you have taken, and ask for my approval before proceeding.
If there are any design decisions that you are not sure about, please present me
with options and their pros and cons, and ask me to choose before proceeding.
let's make sure we are on the same page about the design before you start
implementing. we can do some banter about the design to make sure we are
aligned. be analytical, detailed, and thorough in your design explanations and
discussions.

I generally prefer more complex solutions than simpler ones, given that they are
more powerful and flexible, and I trust your judgment in finding the right
balance. I also prefer solutions that are more aligned with the existing
architecture and patterns of the codebase, even if they require more effort to
implement, as long as they don't introduce significant technical debt or
maintenance challenges.

Do not optimize prematurely, but do consider the long-term implications of
design choices, especially in terms of scalability, maintainability, and
extensibility.

Do not optimize for short-term speed of implementation at the cost of code
quality, architectural integrity, or alignment with project conventions. I value
well-designed, robust solutions that fit seamlessly into the existing codebase,
even if they take more time to implement.

Always reason about the full system architecture before implementing anything.
Every feature touches multiple services, agents, and graph layers. Design
decisions must account for agent orchestration, event propagation, graph
consistency, and offline sync simultaneously.

---

## Context

### Prerequisites (both required)

- **Phase 5** (PKG Operations): `KnowledgeGraphService` class exists with
  node/edge CRUD, traversal, CKG reads, and the `IServiceResult<T>` pattern
- **Phase 6** (CKG Mutation Pipeline): CKG mutation methods wired into the
  service, typestate machine operational, CKG data can be created/modified

Phases 5 and 6 are independent peers — this phase depends on **both** of them.

### Why a separate phase for metrics?

Structural metrics and misconception detection are the most analytically complex
parts of the knowledge-graph-service. They involve:

- Comparing two graph structures (PKG and CKG) with node alignment
- Computing 11 independent metrics with different mathematical formulas
- Cross-metric interaction patterns (6 patterns documented in the specification)
- An aggregate health score that synthesizes all metrics
- A misconception detection engine that matches PKG topology against patterns
- Metacognitive stage gate logic based on metric thresholds

Separating this into its own phase gives it the attention it deserves and avoids
making Phase 5 excessively large.

### Key reference: STRUCTURAL-METRICS-SPECIFICATION.md

The companion document `STRUCTURAL-METRICS-SPECIFICATION.md` (in this same
directory) contains the **complete computation specification** for all 11
metrics. It includes:

- Mathematical formulas with notation conventions
- Step-by-step algorithmic checklists for implementation
- Edge cases and how to handle them
- Concerning threshold tables per metacognitive stage
- Cross-metric interaction patterns and composite health score
- Dependency matrix showing which metrics need CKG data

**Use `STRUCTURAL-METRICS-SPECIFICATION.md` as the primary implementation
guide for Task 1.** This phase file provides the software engineering context
(service integration, events, hints, concurrency); the specification file
provides the mathematics and algorithms.

---

## Task 1: Implement structural metrics computation

### computeMetrics

Compute all 11 structural metrics for a user in a domain. Add this method to the
`KnowledgeGraphService` class.

### Computation pipeline

1. **Fetch the user's PKG** for the domain (nodes + edges, full subgraph via
   `IGraphRepository`)
2. **Fetch the CKG reference subgraph** for the same domain (via the CKG read
   methods implemented in Phase 5)
3. **Compute `IGraphComparison`** between PKG and CKG — this is the alignment
   object that maps PKG nodes to CKG nodes. Compute it **once** and pass it to
   all metrics that need it. See the `IGraphComparison` value object in
   `src/domain/knowledge-graph-service/value-objects/comparison.ts`
4. **Compute each metric** using the formulas and algorithms in
   `STRUCTURAL-METRICS-SPECIFICATION.md`:

   | # | Metric | Abbr | CKG Required? |
   |---|--------|------|---------------|
   | 1 | Abstraction Drift | AD | Yes |
   | 2 | Depth Calibration Gradient | DCG | Yes |
   | 3 | Scope Leakage Index | SLI | Yes |
   | 4 | Sibling Confusion Entropy | SCE | Yes |
   | 5 | Upward Link Strength | ULS | Yes |
   | 6 | Traversal Breadth Score | TBS | No (PKG-only) |
   | 7 | Strategy-Depth Fit | SDF | No (PKG-only) |
   | 8 | Structural Strategy Entropy | SSE | No (PKG-only) |
   | 9 | Structural Attribution Accuracy | SAA | Partial (PKG attributions) |
   | 10 | Structural Stability Gain | SSG | No (delta metric, PKG snapshots) |
   | 11 | Boundary Sensitivity Improvement | BSI | No (delta metric, PKG snapshots) |

5. **Save the snapshot** via `IMetricsRepository.saveSnapshot()`
6. **Compare with previous snapshot** (from `IMetricsRepository.getLatest()`)
   to compute deltas
7. **Publish `PkgStructuralMetricsUpdated` event** if metrics changed
   significantly (threshold: any metric changed by >0.05 or crossed a
   concerning threshold boundary)
8. **Return `IServiceResult<IStructuralMetrics>`** with agent hints

### CKG unavailability handling

Even though CKG data should be available by Phase 7, the implementation must
still handle the case where CKG has no data for a specific domain (not all
domains will have canonical structures). In this case:

- CKG-dependent metrics (AD, DCG, SLI, SCE, ULS) → return 0.0 with a hint:
  "CKG has no data for domain '{domain}' — these metrics are not meaningful
  without a canonical reference"
- PKG-only metrics (TBS, SDF, SSE, SAA, SSG, BSI) → compute normally
- Agent hints should include `contextNeeded`: "CKG data for domain '{domain}'
  is empty — 5 CKG-dependent metrics cannot be computed"

### Concurrency and locking

Metric computation is read-heavy but the snapshot save is a write. Use
optimistic locking on the metrics snapshot (version field) to prevent concurrent
computations from overwriting each other. If a conflict is detected, retry the
snapshot save with the latest version.

### Performance considerations

For large PKGs (500+ nodes), metric computation may be expensive. Consider:

- Computing PKG-only metrics in parallel with CKG-dependent metrics (after the
  IGraphComparison is computed)
- Caching the IGraphComparison if the same domain is requested multiple times
  within a short window
- Setting a staleness threshold: if the last snapshot is <5 minutes old and no
  structural changes occurred, return the cached snapshot with a hint indicating
  it was cached

### Agent hints for computeMetrics

- Highlight the 3–4 metrics that changed most since last computation (with
  delta values for all metrics in parentheses)
- Flag any metric in the "concerning" range (see threshold tables in
  `STRUCTURAL-METRICS-SPECIFICATION.md`)
- Suggest specific actions for the worst-performing metric (e.g., "Your Scope
  Leakage Index is high in 'thermodynamics' — consider reviewing which concepts
  belong in this domain vs. adjacent domains")
- Include the metacognitive stage implication: if metrics suggest a stage
  transition, hint about it
- Cross-metric interaction warnings (e.g., "High AD + Low ULS suggests
  abstraction drift is worsened by weak upward linking")

---

## Task 2: Implement PKG↔CKG comparison

### compareWithCkg

Compare a user's PKG subgraph against the CKG for a given domain. This method
uses the `IGraphComparison` value object to produce a detailed alignment
analysis.

### Computation steps

1. **Fetch PKG subgraph** for the domain
2. **Fetch CKG subgraph** for the domain
3. **Compute `IGraphComparison`**:
   - **Node alignment**: match PKG nodes to CKG nodes by label, domain, and
     type. Produce matched pairs, unmatched PKG nodes (student-specific
     concepts), and unmatched CKG nodes (canonical concepts the student hasn't
     covered)
   - **Edge alignment**: for matched node pairs, compare edges. Produce
     matched edges, PKG-only edges (structural divergences), and CKG-only edges
     (missing canonical relationships)
   - **Edge alignment score**: fraction of CKG edges that have a PKG
     counterpart (weighted by edge importance)
   - **Coverage metrics**: what fraction of the CKG is "covered" by the PKG
   - **Divergence details**: specific nodes/edges where PKG diverges from CKG,
     with severity classification
4. **Return `IServiceResult<IGraphComparison>`** with agent hints

### Agent hints for compareWithCkg

- Coverage summary: "You've covered 67% of the canonical concepts in
  'thermodynamics'"
- Most significant gaps: "Missing canonical concepts: [list top 5 unmatched
  CKG nodes]"
- Structural divergences: "Your graph has 3 edges that contradict canonical
  relationships — review these"
- Strengths: "Your prerequisite chain for 'entropy' matches the canonical
  structure perfectly"
- Suggestions: "Adding a 'part_of' edge from X to Y would better align your
  graph with the canonical structure"

---

## Task 3: Implement misconception detection

### detectMisconceptions

Run all active misconception patterns against a user's PKG for a domain.

### Detection pipeline

1. **Fetch active patterns** from `IMisconceptionRepository`
2. **For each pattern**, run the detection logic against the user's PKG subgraph
   and CKG comparison:

   - **Structural patterns** — analyze graph topology:
     - `circular_dependency`: detect cycles in edge types that should be acyclic
       (same cycle detection as edge creation, but scanning the entire subgraph)
     - `orphan_concept`: nodes with zero edges (completely disconnected from the
       knowledge structure)
     - `premature_abstraction`: high-level `is_a` or `part_of` parent nodes that
       have no concrete children or examples
     - `missing_prerequisites`: concepts with high mastery but missing
       prerequisite edges to foundational concepts that exist in the CKG
     - `over_generalization`: a node with >N incoming prerequisite edges,
       suggesting the user is funneling too many concepts through a single
       point
     - `fragmented_knowledge`: disconnected subgraph components within the same
       domain (knowledge islands that should be connected)

   - **Statistical patterns** — compare user metrics against thresholds:
     - `high_scope_leakage`: SLI above the concerning threshold for the user's
       metacognitive stage
     - `abstraction_drift`: AD above the concerning threshold
     - `shallow_structure`: low depth across the graph compared to CKG depth

   - **Semantic patterns** (future: vector similarity via vector-service):
     - For now, stub with label-based heuristics: detect nodes with very similar
       labels that might be duplicates, or nodes whose labels suggest they
       belong in a different domain

3. **Aggregate detection results**, deduplicating across patterns
4. **Record new detections** in `IMisconceptionRepository` (with affected
   nodeIds, confidence, pattern reference)
5. **Publish `MisconceptionDetected` events** for new detections
6. **Return `IServiceResult<IMisconceptionDetection[]>`** with agent hints

### Why run detection as an explicit operation?

Misconception detection is computationally expensive (it traverses the full PKG
subgraph for a domain, potentially running cycle detection and metric
comparisons). It should NOT run on every graph mutation. Instead, it's triggered
periodically by the diagnostic agent or on-demand when a user requests a
"learning health check."

### Agent hints for detectMisconceptions

- Priority ordering: which misconception to address first based on impact on
  learning outcomes
- Intervention suggestions: for each detected misconception, reference the
  intervention templates from `IMisconceptionRepository`
- Metacognitive stage awareness: frame interventions appropriately for the
  user's current stage (e.g., novice users get more scaffolded interventions,
  advanced users get Socratic questioning)
- Trend: if the same misconception was detected previously, indicate whether
  it's improving, stable, or worsening
- Related misconceptions: flag if multiple detections suggest a common root
  cause (e.g., "Both `circular_dependency` and `over_generalization` in the
  same subregion suggest confusion about the hierarchy in [topic]")

---

## Task 4: Implement metacognitive stage assessment

### getMetacognitiveStage

Determine the user's current metacognitive stage for a domain based on their
structural metrics. The metacognitive progression model defines stage boundaries
based on metric thresholds (documented in `STRUCTURAL-METRICS-SPECIFICATION.md`
threshold tables).

### Stage computation

1. **Get latest metrics snapshot** (or compute if stale)
2. **Evaluate against stage gate criteria**:
   - Each metacognitive stage has minimum thresholds for key metrics
   - The user is at the highest stage where ALL gate criteria are met
   - If metrics are mixed (some suggest a higher stage, others lower), report
     the lower stage with hints about what's holding the user back
3. **Compute proximity to next stage**: for each gate criterion not yet met,
   what's the gap?
4. **Return `IServiceResult<MetacognitiveStageAssessment>`** with agent hints

### Agent hints for getMetacognitiveStage

- Current stage with evidence (which metrics support this assessment)
- Distance to next stage: "You need to improve SLI from 0.35 to <0.20 and
  AD from 0.42 to <0.30 to reach Stage 3"
- Regression warning: if metrics have declined since last assessment, flag
  potential stage regression
- Recommended focus areas: which metrics to work on for stage progression

---

## Task 5: Implement aggregate health score

### getStructuralHealth

Compute a composite health score that synthesizes all 11 metrics into a single
"structural health" rating for a domain.

### Computation

1. **Get latest metrics snapshot** (or compute if stale)
2. **Apply the composite health score formula** from
   `STRUCTURAL-METRICS-SPECIFICATION.md` — weighted combination of all metrics,
   with "badness" metrics inverted so higher is always better
3. **Classify per-metric status**: healthy / warning / critical (based on
   threshold tables per metacognitive stage)
4. **Compute trend direction**: improving / stable / declining (based on
   last 3–5 snapshots)
5. **Return `IServiceResult<IStructuralHealthReport>`** including:
   - Overall health score (0–1, higher is better)
   - Per-metric status breakdown
   - Trend direction
   - Active misconceptions count
   - Metacognitive stage assessment

### Agent hints for getStructuralHealth

- High-level summary: "Your knowledge graph in 'thermodynamics' is in good
  structural health (0.72/1.0), improving (+0.04 since last week)"
- Priority actions: top 2–3 most impactful improvements the user can make
- Celebration: if the user crossed a health milestone, acknowledge it
- Warning: if health is declining, call it out with specific metrics causing
  the decline

---

## Checklist

- [ ] `computeMetrics` implemented per STRUCTURAL-METRICS-SPECIFICATION.md
      (all 11 metrics computed with correct formulas)
- [ ] IGraphComparison computed once and shared across CKG-dependent metrics
- [ ] Metric snapshots saved via IMetricsRepository
- [ ] Delta computation against previous snapshot
- [ ] PkgStructuralMetricsUpdated events published on significant changes
- [ ] CKG unavailability handled gracefully (empty domain → 0.0 for
      CKG-dependent metrics with explanatory hints)
- [ ] Concurrency control for snapshot saves (optimistic locking)
- [ ] `compareWithCkg` implemented with full PKG↔CKG alignment analysis
- [ ] `detectMisconceptions` implemented with structural, statistical, and
      semantic (stub) pattern types
- [ ] New detections recorded in IMisconceptionRepository
- [ ] MisconceptionDetected events published
- [ ] `getMetacognitiveStage` implemented with stage gate evaluation
- [ ] `getStructuralHealth` composite score and per-metric health breakdown
- [ ] Cross-metric interaction patterns checked (per specification)
- [ ] All methods return IServiceResult<T> with contextual IAgentHints
- [ ] `pnpm typecheck` passes
