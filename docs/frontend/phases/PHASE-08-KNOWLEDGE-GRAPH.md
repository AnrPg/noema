# Phase 8 — Knowledge Graph: The Neural Map

> **Codename:** `Connectome`  
> **Depends on:** Phase 0 (Tokens), Phase 1 (UI Primitives), Phase 2 (API Client
> — KG module)  
> **Unlocks:** Phase 10 (Cognitive Copilot — uses misconception/health data)  
> **Estimated effort:** 6–7 days

---

## Philosophy

The knowledge graph is Noema's crown jewel — the visual embodiment of everything
the user knows, doesn't know, and misunderstands. This is where the
neuroscience-futuristic aesthetic reaches its full expression. The graph should
feel like peering into a living brain: nodes glow with mastery, edges pulse with
causal flow, misconceptions burn in cortex pink, and the knowledge frontier
shimmers at the edge of the known.

This phase uses WebGL (via `react-force-graph-3d` or equivalent) for rendering
at scale. A user's PKG may grow to 5,000+ nodes — SVG won't scale. The 2D
force-directed layout is the default; 3D is an optional mode for spatial
exploration.

---

## Tasks

### T8.1 — Graph Renderer Component

A reusable, full-viewport graph visualization engine at
`apps/web/src/components/graph/`.

**Core component: `GraphCanvas`**

**Props:**

- `nodes: GraphNodeDto[]`
- `edges: GraphEdgeDto[]`
- `selectedNodeId?: string`
- `hoveredNodeId?: string`
- `activeOverlays?: OverlayType[]`
- `layoutMode?: 'force' | 'hierarchical' | 'radial'`
- `onNodeClick?: (node) => void`
- `onNodeHover?: (node | null) => void`
- `onNodeRightClick?: (node, event) => void`
- `onBackgroundClick?: () => void`

**Visual encoding (node):**

- **Shape**: circle for all types (consistent, clean)
- **Size**: mapped to degree centrality (min 8px, max 32px)
- **Fill color**: mapped to node type using the Phase 0 palette:
  - `CONCEPT` → synapse-400
  - `FACT` → axon-100
  - `PROCEDURE` → neuron-400
  - `PRINCIPLE` → dendrite-400
  - `EXAMPLE` → myelin-400
  - `COUNTEREXAMPLE` → axon-400
  - `MISCONCEPTION` → cortex-400
- **Outer ring**: mastery level (0→1 fills a border ring clockwise). Color
  intensity increases with mastery — low mastery is dim, high mastery glows
  bright
- **Glow effect**: nodes with mastery > 0.8 have a soft radial glow
  (bioluminescent effect) in their type color
- **Pulse animation**: nodes touched in the current session or last 24 hours
  pulse gently
- **Selection**: selected node has a prominent bright ring + enlarged size

**Visual encoding (edge):**

- **Weight**: mapped to edge thickness (thin=0.1, thick=1.0)
- **Color**: subtle, desaturated — edges should not dominate the visual field
- **Style by ontological category**:
  - Taxonomic (IS_A, EXEMPLIFIES) → solid line
  - Mereological (PART_OF, CONSTITUTED_BY) → solid with dot endpoints
  - Logical (EQUIVALENT_TO, ENTAILS, DISJOINT_WITH, CONTRADICTS) → dashed
  - Causal/Temporal (CAUSES, PRECEDES, DEPENDS_ON) → animated particles flowing
    source→target
  - Associative (RELATED_TO, ANALOGOUS_TO, CONTRASTS_WITH) → dotted
  - Structural/Pedagogical (PREREQUISITE, DERIVED_FROM, HAS_PROPERTY) → solid
    with arrow → animated particles for PREREQUISITE
- **Hover**: hovering an edge highlights both connected nodes and shows the edge
  type label

**Layout modes:**

- `force`: spring physics simulation — default, good for exploration
- `hierarchical`: top-down DAG layout — good for viewing prerequisite chains
- `radial`: ego-centric layout — selected node at center, neighborhoods in
  concentric rings

### T8.2 — Interactive PKG Explorer Page

The full knowledge graph experience at `/knowledge`.

**Route:** `apps/web/src/app/(authenticated)/knowledge/page.tsx`

**Layout:**

```
┌──────────────────┬────────────────────────────┬──────────────────┐
│  Control Panel   │                            │  PKG Studio      │
│  (left, 280px)   │    GraphCanvas             │  (right sidebar) │
│                  │    (full remaining space)  │                  │
│  - Search bar    │                            │  - System-guided │
│  - Layout toggle │                            │    suggestions   │
│  - Overlays      │                            │  - Create node   │
│  - Legend        │                            │  - Edit node     │
│  - Node list     │                            │  - Manage edges  │
│                  │                            │                  │
├──────────────────┤                            │                  │
│  Node Detail     │                            │                  │
│  (bottom-left)   │                            │                  │
│  (when selected) │                            │                  │
└──────────────────┴────────────────────────────┴──────────────────┘
```

**Control Panel (left sidebar):**

- **Search**: type-ahead search across PKG node labels → highlights matching
  node, zooms to it
- **Layout toggle**: three buttons for force/hierarchical/radial (use
  `useGraphStore` from Phase 3)
- **Overlay toggles** (checkbox list):
  - _Prerequisites_ — highlight prerequisite chains for selected node (via
    `usePKGPrerequisites()`)
  - _Knowledge Frontier_ — highlight ready-to-learn nodes (via
    `useKnowledgeFrontier()`)
  - _Bridge Nodes_ — highlight articulation points (via `useBridgeNodes()`)
  - _Misconceptions_ — overlay cortex halos on nodes with active misconceptions
  - _Mastery Heat_ — gradient coloring all nodes by mastery level (dim→bright)
- **Legend**: filterable by node type — toggling a type hides/shows those nodes
- **Node list**: scrollable list of all nodes, sorted by label. Clicking scrolls
  the graph to that node.
- **System-guided review**: canonical comparison signals (`missingFromPkg`,
  alignment score, personal-only nodes) plus actions to apply the next suggested
  concepts into the PKG.
- **PKG Studio**: manual node creation, selected-node editing, node deletion,
  edge creation, and connected-edge removal.

**Node Detail Panel** (appears when a node is selected):

- Node type icon + label
- Description (if available)
- Domain tag
- Mastery level as `NeuralGauge`
- **Connected edges**: grouped by edge type, each showing target/source node
  label + weight
- **Linked cards**: list of cards linked to this node → clickable → navigate to
  `/cards/:id`
- **Actions**: "View prerequisites", "Find related concepts", "View in CKG
  comparison"
- **Quick add**: "Create connected node" button → inline form to add a new PKG
  node with an edge to the selected node

**Context menu (right-click node):**

- "View card linked to this concept"
- "Show prerequisite chain"
- "Show neighborhood (2 hops)"
- "Check for misconceptions"
- "Compare with CKG"

**Data loading**: initial load via `usePKGNodes()` + `usePKGEdges()`. For large
graphs, use `usePKGSubgraph()` with progressive loading — start with ego-graph
around the most-mastered node, load more as the user pans.

### T8.3 — Structural Health Dashboard

PKG health analytics at `/knowledge/health`.

**Route:** `apps/web/src/app/(authenticated)/knowledge/health/page.tsx`

**Layout:**

**Hero section:**

- Large `NeuralGauge` (lg size) showing overall health score from
  `useStructuralHealth(userId)`
- `MetacognitiveStage` indicator bar: 4 stages (SYSTEM_GUIDED →
  STRUCTURE_SALIENT → SHARED_CONTROL → USER_OWNED) with current stage
  highlighted and a description of what it means for scaffolding level

**Metrics radar chart** (center):

- 11 structural metrics plotted as a radar/spider chart: `abstractionDrift`,
  `depthCalibrationGradient`, `scopeLeakageIndex`, `siblingConfusionEntropy`,
  `upwardLinkStrength`, `traversalBreadthScore`, `strategyDepthFit`,
  `structuralStrategyEntropy`, `structuralAttributionAccuracy`,
  `structuralStabilityGain`, `boundarySensitivityImprovement`
- Each axis labeled with abbreviated name
- Current values plotted as a filled polygon in synapse color with axon-200 fill
- A second polygon overlay showing "ideal" baseline (if available) in dendrite
  at low opacity
- Clicking any axis → expands a detail panel below showing:
  - Full metric name and plain-English explanation of what it measures
  - Current value as `NeuralGauge`
  - Trend sparkline from `useMetricHistory()` — last 30 days
  - Status color: healthy (neuron), warning (myelin), critical (cortex)
  - Contributing graph regions (which nodes/edges drive this metric)

**Cross-metric patterns** (bottom):

- If `healthReport.crossMetricPatterns` contains entries, render them as insight
  cards:
  - Each pattern: title, description, affected metrics (as linked pills),
    suggested action
- Styled as alert cards with dendrite accent

**Implemented note**

- The frontend now consumes the full health report and separate stage assessment
  through the Knowledge Graph API client.
- `/knowledge/health` renders the hero score, metacognitive stage progression,
  stage evidence/gaps, the metric radar, typed drill-down status/hints, and
  cross-metric pattern insight cards.

### T8.4 — Misconception Center

Misconception management at `/knowledge/misconceptions`.

**Route:** `apps/web/src/app/(authenticated)/knowledge/misconceptions/page.tsx`

**Layout:**

**Summary header:**

- Count of active misconceptions by status: DETECTED, CONFIRMED, ADDRESSED,
  RECURRING (each as a small `MetricTile` with cortex color)
- Breakdown by family (structural, relational, temporal, semantic,
  metacognitive) as a horizontal bar

**Misconception list:**

- Sortable/filterable table via `useMisconceptions(userId)`:
  - Type (from 27 misconception types) with family grouping
  - Severity badge
  - Status lifecycle indicator: a horizontal 5-step pipeline (DETECTED →
    CONFIRMED → ADDRESSED → RESOLVED → RECURRING) with current step highlighted
  - Affected graph nodes (clickable pills → navigate to graph)
  - Detection confidence as inline `ConfidenceMeter`
  - Detection date

**Misconception detail** (expandable row or side panel):

- Full description of the misconception type
- Graph subview: a mini `GraphCanvas` showing the affected node(s) and their
  immediate neighbors, with the misconception relationship highlighted
- Linked intervention templates (if any)
- Detection evidence and pattern that triggered it
- "Mark as addressed" / "Mark as resolved" / "Flag as recurring" action buttons

**Scan trigger:**

- "Scan for new misconceptions" button → `useDetectMisconceptions(userId)` →
  loading spinner → results shown in the list

**Implemented note**

- The frontend now consumes richer misconception records from the API client,
  including family, severity, affected node IDs, and full lifecycle status.
- `/knowledge/misconceptions` renders status summary tiles, family breakdown,
  sort controls, a five-stage misconception pipeline, subgraph review, and
  lifecycle actions for confirm, address, resolve, and recurring escalation.

### T8.5 — PKG/CKG Comparison View

Personal vs canonical knowledge comparison at `/knowledge/comparison`.

**Route:** `apps/web/src/app/(authenticated)/knowledge/comparison/page.tsx`

**Layout:**

- Side-by-side dual `GraphCanvas` panels: left=PKG, right=CKG
- Synchronized viewport: panning/zooming one panel pans/zooms the other
- **Highlights via `usePKGCKGComparison(userId)`:**
  - Nodes in CKG but not PKG → shown as ghost nodes (dashed outline, dimmed) in
    the PKG panel with a "+" badge → click to add
  - Nodes in PKG but not CKG → shown with a special "personal" badge
  - Divergent edges: edges that exist in one graph but not the other →
    highlighted in myelin
  - Strength differences: if an edge exists in both but with different weights →
    shown with split coloring
- **Action panel** (bottom): for selected discrepancies, show resolution
  actions:
  - "Add missing concept to your graph" → `useCreatePKGNode()`
  - "Review this divergent relationship" → starts a targeted session
  - "Propose CKG correction" (if user has evidence) → link to CKG mutation flow
    (Phase 11)

---

## Acceptance Criteria

- [ ] `GraphCanvas` renders 50+ nodes smoothly with correct visual encoding
      (colors, sizes, rings, glows)
- [ ] `GraphCanvas` renders 1000+ nodes without frame drops (WebGL)
- [ ] All 6 edge ontological categories have distinct visual styles
- [ ] PKG Explorer loads graph data and supports search, layout switching, and
      overlay toggles
- [ ] Node selection shows detail panel with edges, linked cards, and actions
- [ ] Structural Health radar chart renders all 11 metrics with
      click-to-drill-down
- [ ] Metric history sparklines load from the API
- [ ] Misconception Center lists misconceptions with status pipeline and
      severity
- [ ] Misconception detail shows a mini subgraph with affected nodes
- [ ] PKG/CKG comparison renders synchronized side-by-side graphs with
      discrepancy highlights
- [ ] All pages handle empty graphs (new users) with appropriate empty states

---

## Files Created

| File                                                                 | Description                    |
| -------------------------------------------------------------------- | ------------------------------ |
| `apps/web/src/components/graph/graph-canvas.tsx`                     | WebGL graph renderer           |
| `apps/web/src/components/graph/graph-node.tsx`                       | Custom node visual encoding    |
| `apps/web/src/components/graph/graph-edge.tsx`                       | Custom edge visual encoding    |
| `apps/web/src/components/graph/graph-legend.tsx`                     | Filterable type legend         |
| `apps/web/src/components/graph/graph-minimap.tsx`                    | Zoomed-out overview            |
| `apps/web/src/components/graph/node-detail-panel.tsx`                | Selected node details          |
| `apps/web/src/components/graph/graph-controls.tsx`                   | Layout/overlay/search controls |
| `apps/web/src/app/(authenticated)/knowledge/page.tsx`                | PKG Explorer                   |
| `apps/web/src/app/(authenticated)/knowledge/health/page.tsx`         | Structural Health Dashboard    |
| `apps/web/src/app/(authenticated)/knowledge/misconceptions/page.tsx` | Misconception Center           |
| `apps/web/src/app/(authenticated)/knowledge/comparison/page.tsx`     | PKG/CKG Comparison             |
| `apps/web/src/components/knowledge/radar-chart.tsx`                  | 11-axis radar chart            |
| `apps/web/src/components/knowledge/metric-drill-down.tsx`            | Metric detail panel            |
| `apps/web/src/components/knowledge/misconception-pipeline.tsx`       | Status lifecycle indicator     |
| `apps/web/src/components/knowledge/misconception-subgraph.tsx`       | Mini graph for misconception   |
