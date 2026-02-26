# Phase 2: Shared Types & Events

## Objective

Extend the shared workspace packages (`@noema/types` and `@noema/events`) with
the branded IDs, enums, interfaces, and domain events that the
knowledge-graph-service needs. Every other service and agent that interacts with
the knowledge graph will depend on these shared types, so they must be designed
for longevity.

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

The shared packages are the connective tissue of Noema. Any type defined here is
used by multiple services and agents. Changes are additive — existing types must
not break. The existing `packages/types/src/branded-ids/index.ts` already has 26
branded ID types (including `NodeId` and `EdgeId`), and
`packages/types/src/enums/index.ts` already has `GraphNodeType`,
`GraphEdgeType`, and `MutationState` enums.

### Why this phase before the domain layer?

Because Phase 3 (domain layer) and Phase 4 (repositories) both import from
`@noema/types` and `@noema/events`. If the types don't exist in the shared
packages first, the domain layer can't compile. Shared types also serve as the
API contract — they define what knowledge-graph concepts look like to every
other service in the system.

---

## Task 1: Add new branded ID types

Add the following branded IDs to `packages/types/src/branded-ids/index.ts`,
following the exact same pattern used for `NodeId`, `EdgeId`, `ContentId`, etc.
Each needs a branded type, a prefix constant, factory `create()` method, and
`isValid()` predicate.

### New IDs

- **MutationId** — prefix `mut_` — identifies a CKG mutation lifecycle instance.
  Mutations are the core unit of work in the CKG pipeline: an agent or an admin
  user proposes a structural change, it passes through validation stages, and
  eventually gets committed or rejected. Each mutation needs a stable ID for
  tracking, auditing and idempotency.

- **MisconceptionPatternId** — prefix `mpat_` — identifies a misconception
  detection pattern definition. The misconception ontology (ADR-004) defines 27
  misconception types, each of which can have multiple detection patterns. These
  need stable IDs because they're referenced from diagnostic results and
  intervention records.

- **InterventionId** — prefix `intv_` — identifies a remediation intervention
  triggered by a detected misconception. Interventions are the system's response
  to misconceptions (e.g., "generate a counterexample card", "create a
  disambiguation exercise"). They need IDs for tracking outcomes and measuring
  intervention effectiveness.

### Also register

Add all three new prefixes to the `ID_PREFIXES` registry that the existing
validation infrastructure uses, and update the barrel exports.

---

## Task 2: Add new enums

Add the following enums to `packages/types/src/enums/index.ts`, following the
existing enum-as-const-object pattern used throughout the file (e.g.,
`export const GraphNodeType = { ... } as const`).

### New enums

- **GraphType** — `pkg` | `ckg` — distinguishes which graph a node or edge lives
  in. The PKG (Personal Knowledge Graph) is per-user; the CKG (Canonical
  Knowledge Graph) is the shared "ground truth." Many queries need to specify
  which graph they're targeting.

- **MisconceptionType** — the 27 misconception types from ADR-004. These are
  organized into 5 families:
  - **Structural**: `circular_dependency`, `orphan_concept`,
    `over_generalization`, `under_specification`, `false_hierarchy`,
    `missing_prerequisite`, `phantom_link`
  - **Relational**: `false_equivalence`, `inverted_dependency`, `conflation`,
    `missing_distinction`, `spurious_analogy`, `scope_confusion`,
    `boundary_error`
  - **Temporal**: `anachronistic_ordering`, `premature_abstraction`,
    `delayed_integration`, `revision_resistance`
  - **Semantic**: `label_fixation`, `surface_similarity_bias`,
    `definitional_drift`, `context_collapse`, `polysemy_blindness`
  - **Metacognitive**: `illusory_mastery`, `calibration_failure`,
    `strategy_mismatch`, `transfer_blindness`

  This taxonomy matters because different misconception families are detected by
  different mechanisms (structural patterns analyze the graph topology, semantic
  patterns analyze node content, temporal patterns analyze learning sequence).
  The classification drives which detection engine runs.

- **MisconceptionPatternKind** — `structural` | `statistical` | `semantic` |
  `hybrid` — categories of detection patterns. Structural patterns look at graph
  shape (cycles, orphans). Statistical patterns look at learning metrics across
  a population. Semantic patterns use vector similarity. Hybrid combines
  multiple signals.

- **InterventionType** — `counterexample_card` | `disambiguation_exercise` |
  `prerequisite_review` | `structural_visualization` | `guided_comparison` |
  `corrective_feedback` | `reorganization_prompt` | `metacognitive_prompt` — the
  kinds of remediation actions the system can take. Each maps to a content
  generation strategy.

- **MisconceptionStatus** — `detected` | `confirmed` | `addressed` | `resolved`
  | `recurring` — lifecycle of a misconception instance from first detection
  through remediation to resolution. The `recurring` state handles the common
  case where a misconception was resolved but re-emerges.

- **PromotionBand** — `none` | `weak` | `moderate` | `strong` | `definitive` —
  the confidence levels used in the PKG→CKG aggregation pipeline (ADR-005). When
  enough users independently form the same conceptual structure, it gets
  "promoted" from individual PKGs to the canonical CKG. The band determines how
  much evidence is required.

- **MetacognitiveStage** — `system_guided` | `structure_salient` |
  `shared_control` | `user_owned` — the 4-stage metacognitive progression model
  from FEATURE_OVERVIEW. Each user in each graph region is at one of these
  stages, which determines how much structural scaffolding the system provides
  vs. how much autonomy the user gets. This is core to Noema's adaptive
  pedagogical model.

- **AggregationStage** — `signal_collection` | `pattern_extraction` |
  `consensus_detection` | `conflict_resolution` | `mutation_proposal` |
  `validation` | `commitment` — the 7 stages of the PKG→CKG aggregation
  pipeline. These track where in the pipeline an aggregation run currently is.

- **StructuralMetricType** — `abstraction_drift` | `depth_calibration_gradient`
  | `scope_leakage_index` | `sibling_confusion_entropy` | `upward_link_strength`
  | `traversal_breadth_score` | `strategy_depth_fit` |
  `structural_strategy_entropy` | `structural_attribution_accuracy` |
  `structural_stability_gain` | `boundary_sensitivity_improvement` — the 11
  structural metrics that measure different facets of a user's knowledge graph
  health. These are the diagnostics that feed the metacognitive engine.

---

## Task 3: Add knowledge-graph domain event types

Create a new `packages/events/src/knowledge-graph/` module following the exact
same structure as the existing `content/`, `session/`, `user/` event modules.
Register it in the barrel export.

### Why domain events?

The knowledge-graph-service is event-driven. When a node is created, edges are
added, or a mutation commits, other services need to react. The session-service
needs to know about graph changes to update learning paths. The
analytics-service needs events for reporting. The agents need events to trigger
downstream work. All of this flows through Redis Streams.

### PKG Events (Personal Knowledge Graph)

These fire when individual users' graphs change:

- **PkgNodeCreated** — a node was added to a user's PKG. Payload: nodeId,
  userId, nodeType, label, domain, metadata. Downstream: analytics, agents
  tracking user progress.

- **PkgNodeUpdated** — a node's attributes changed (label, properties, mastery
  level). Payload: nodeId, userId, changedFields, previousValues, newValues.
  Downstream: triggers structural metric recalculation.

- **PkgNodeRemoved** — a node was soft-deleted from a user's PKG. Payload:
  nodeId, userId, reason. Downstream: cascade checks (orphan edges).

- **PkgEdgeCreated** — an edge was added between two nodes in a user's PKG.
  Payload: edgeId, userId, sourceNodeId, targetNodeId, edgeType, weight,
  metadata. Downstream: acyclicity validation, structural metric update.

- **PkgEdgeRemoved** — an edge was removed. Payload: edgeId, userId, reason.
  Downstream: connectivity analysis.

- **PkgStructuralMetricsUpdated** — structural metrics for a user were
  recalculated. Payload: userId, domain, metrics (the full set of structural
  metric values), previousMetrics, computedAt. Downstream: metacognitive stage
  transitions, analytics dashboards.

### CKG Events (Canonical Knowledge Graph)

These fire when the shared canonical graph changes:

- **CkgMutationProposed** — an agent or admin user proposed a structural change
  to the CKG. Payload: mutationId, proposedBy (agentId or adminUserId),
  operations (the mutation DSL operations), rationale, evidenceCount.
  Downstream: triggers validation pipeline.

- **CkgMutationValidated** — a mutation passed all validation stages. Payload:
  mutationId, validationResults (per-stage pass/fail). Downstream: triggers
  commit.

- **CkgMutationCommitted** — a mutation was applied to the CKG. Payload:
  mutationId, appliedOperations, affectedNodeIds, affectedEdgeIds. Downstream:
  PKG propagation (users who reference affected CKG nodes get notified).

- **CkgMutationRejected** — a mutation failed validation or was manually
  rejected. Payload: mutationId, reason, failedStage, rejectedBy. Downstream:
  audit logging.

- **CkgNodePromoted** — a concept pattern was promoted from PKGs to the CKG via
  the aggregation pipeline. Payload: nodeId, promotionBand, evidenceCount,
  contributingUserCount, aggregationRunId. Downstream: analytics, user
  notifications.

### Metacognitive Events

These fire when the system's understanding of a user's learning state changes:

- **MisconceptionDetected** — a misconception pattern matched against a user's
  PKG. Payload: userId, misconceptionType, affectedNodeIds, confidence,
  patternId, evidence. Downstream: triggers intervention selection.

- **InterventionTriggered** — a remediation intervention was initiated. Payload:
  interventionId, userId, misconceptionType, interventionType, targetNodeIds,
  content (if applicable). Downstream: content-generation-agent, session
  scheduling.

- **MetacognitiveStageTransitioned** — a user progressed (or regressed) in the
  metacognitive stages for a graph region. Payload: userId, domain,
  previousStage, newStage, triggeringMetrics, rationale. Downstream: UI
  scaffolding changes, agent behavior adaptation.

### Event naming and metadata

All events must use `IBaseEvent<TPayload>` from `@noema/events/types`, include
`IEventMetadata`, and follow the naming convention of the other domain event
modules. The aggregate type for PKG events is `knowledge-graph`, the aggregate
ID is the `userId`. For CKG events, the aggregate type is
`canonical-knowledge-graph`, the aggregate ID is the `mutationId` or `nodeId` as
appropriate.

---

## Task 4: Add knowledge-graph-related interfaces to @noema/types

Add the following shared interfaces. These will be used by both the
knowledge-graph-service and by agents/other services that consume graph data.

### Graph data interfaces

- **IGraphNode** — the universal representation of a graph node. Fields: nodeId
  (NodeId), graphType (GraphType), nodeType (GraphNodeType), label (string),
  description (optional string), domain (string), userId (optional — present for
  PKG, absent for CKG), properties (typed key-value pairs, not a JSON blob),
  masteryLevel (optional number 0-1 for PKG nodes), createdAt, updatedAt.

- **IGraphEdge** — the universal representation of a graph edge. Fields: edgeId
  (EdgeId), graphType (GraphType), edgeType (GraphEdgeType), sourceNodeId
  (NodeId), targetNodeId (NodeId), userId (optional), weight (number 0-1),
  properties (typed key-value pairs), createdAt.

- **ISubgraph** — a self-contained fragment of a graph returned by traversal
  queries. Fields: nodes (IGraphNode[]), edges (IGraphEdge[]), rootNodeId
  (optional NodeId).

### Structural metrics interface

- **IStructuralMetrics** — the complete set of structural health metrics for a
  user in a domain. One field per metric: abstractionDrift,
  depthCalibrationGradient, scopeLeakageIndex, siblingConfusionEntropy,
  upwardLinkStrength, traversalBreadthScore, strategyDepthFit,
  structuralStrategyEntropy, structuralAttributionAccuracy,
  structuralStabilityGain, boundarySensitivityImprovement. All numbers. This is
  a "snapshot in time" of graph health.

### Misconception interfaces

- **IMisconceptionDetection** — a detected misconception instance. Fields:
  userId, misconceptionType (MisconceptionType), status (MisconceptionStatus),
  affectedNodeIds (NodeId[]), confidence (number 0-1), patternId
  (MisconceptionPatternId), detectedAt, resolvedAt (optional).

---

## Task 5: Update barrel exports

Ensure all new types are properly exported from the shared packages' index
files. Run `pnpm typecheck` on the affected packages to confirm no type errors.
Then run `pnpm typecheck` on the knowledge-graph-service to confirm it can
consume all the new types.

---

## Checklist

- [ ] MutationId, MisconceptionPatternId, InterventionId branded IDs added
- [ ] ID_PREFIXES registry updated with new prefixes
- [ ] All new enums added (GraphType, MisconceptionType,
      MisconceptionPatternKind, InterventionType, MisconceptionStatus,
      PromotionBand, MetacognitiveStage, AggregationStage, StructuralMetricType)
- [ ] knowledge-graph domain events module created with PKG, CKG, and
      metacognitive events
- [ ] Events barrel export updated
- [ ] IGraphNode, IGraphEdge, ISubgraph interfaces added
- [ ] IStructuralMetrics interface added
- [ ] IMisconceptionDetection interface added
- [ ] `pnpm typecheck` passes on all affected packages
- [ ] No existing types broken
