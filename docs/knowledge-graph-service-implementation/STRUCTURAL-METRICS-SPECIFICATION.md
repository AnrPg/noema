# Structural Metrics — Computation Specification

## Overview

This document provides in-depth implementation specifications for all 11
structural metacognitive metrics computed by the `computeMetrics` method of
`KnowledgeGraphService`. Each metric is documented with its mathematical
formula, intuitive explanation, algorithmic steps, edge cases, concerning
thresholds, and output range.

All metrics operate on two inputs:

- **PKG subgraph** — the user's personal knowledge graph for a specific domain
- **CKG subgraph** — the canonical (reference) knowledge graph for the same
  domain
- **IGraphComparison** — the pre-computed alignment between PKG and CKG (node
  mappings, divergences, edge alignment)

The `IGraphComparison` object is computed **once** before all metrics run,
avoiding redundant subgraph fetching and alignment logic.

### Notation Conventions

| Symbol             | Meaning                                                              |
| ------------------ | -------------------------------------------------------------------- |
| $G_P$              | User's PKG subgraph (nodes $V_P$, edges $E_P$)                       |
| $G_C$              | CKG reference subgraph (nodes $V_C$, edges $E_C$)                    |
| $\mathcal{A}$      | Node alignment map: $V_P \to V_C$ (partial, from `IGraphComparison`) |
| $\mathcal{A}^{-1}$ | Inverse alignment: $V_C \to V_P$                                     |
| $w(e)$             | Edge weight (0–1) for edge $e$                                       |
| $\text{type}(e)$   | Edge type (prerequisite, is_a, part_of, etc.)                        |
| $d_P(v)$           | Depth of node $v$ in $G_P$ (longest directed path from any root)     |
| $d_C(v)$           | Depth of the aligned node in $G_C$                                   |
| $\text{dom}(v)$    | Domain label of node $v$                                             |

### Output Range Convention

All metrics are normalized to the **[0, 1]** range except where explicitly
noted. For "badness" metrics (AD, DCG, SLI, SCE), 0 is ideal and 1 is worst. For
"goodness" metrics (ULS, TBS, SDF, SAA), 1 is ideal and 0 is worst. Delta
metrics (SSG, BSI) can be negative (regression), zero (no change), or positive
(improvement), typically in the range [-1, 1]. SSE is in [0, 1] where the
interpretation depends on context (neither extreme is unconditionally good).

---

## Metric 1: Abstraction Drift (AD)

### Category: Abstraction Metrics

### Intuitive Explanation

Abstraction Drift measures **how far the user's understanding of "what is a type
of what" and "what is a part of what" has wandered from the canonical
structure**. Think of the CKG's `is_a` and `part_of` hierarchy as the "textbook"
understanding. The student builds their own hierarchy in their PKG. AD
quantifies how different those two hierarchies are.

For example, if the CKG says "Integral Calculus → is_a → Calculus → is_a →
Mathematics" and the student has "Integral Calculus → is_a → Mathematics"
(skipping the intermediate), that's abstraction drift — the student is reasoning
at the wrong level of abstraction, potentially over-generalizing or missing
intermediate conceptual layers.

**Why it matters cognitively:** Students who over-flatten hierarchies tend to
over-generalize rules. Students who over-deepen hierarchies tend to
over-specialize and struggle with transfer. AD detects both failure modes.

### What It Compares

- **PKG edges** with `type ∈ {is_a, part_of}` (hierarchical edges only)
- **CKG edges** with `type ∈ {is_a, part_of}`
- Only for **aligned node pairs** (nodes that exist in both graphs via
  `nodeAlignment`)

### Computation Algorithm

- [ ] **Step 1 — Extract hierarchical subgraphs.** From both $G_P$ and $G_C$,
      extract only edges of type `is_a` or `part_of`. Call these $H_P$ and
      $H_C$.

- [ ] **Step 2 — Build parent maps.** For each aligned node $v$ in the PKG, find
      its set of parents in $H_P$:
      $\text{parents}_P(v) = \{u \mid (v, u) \in H_P\}$ Similarly for the
      aligned CKG node:
      $\text{parents}_C(\mathcal{A}(v)) = \{u \mid (\mathcal{A}(v), u) \in H_C\}$

- [ ] **Step 3 — Compute per-node parent set divergence.** For each aligned node
      $v$, compute the Jaccard distance between the PKG parent set (mapped to
      CKG via alignment) and the CKG parent set:

  $$\text{drift}(v) = 1 - \frac{|\text{parents}_P^{\mathcal{A}}(v) \cap \text{parents}_C(\mathcal{A}(v))|}{|\text{parents}_P^{\mathcal{A}}(v) \cup \text{parents}_C(\mathcal{A}(v))|}$$

  where $\text{parents}_P^{\mathcal{A}}(v)$ is the PKG parent set mapped through
  alignment to CKG node IDs. If both parent sets are empty,
  $\text{drift}(v) = 0$.

- [ ] **Step 4 — Weight by node importance.** Nodes deeper in the CKG hierarchy
      contribute more to AD (drift in foundational concepts is more severe):

  $$\text{importance}(v) = \frac{1}{1 + d_C(\mathcal{A}(v))}$$

  This gives root-level concepts (depth 0) importance 1.0 and deep leaves less
  weight. Rationale: misunderstanding the top-level taxonomy is worse than
  misunderstanding a leaf's parent.

- [ ] **Step 5 — Aggregate.**

  $$AD = \frac{\sum_{v \in \mathcal{A}} \text{drift}(v) \cdot \text{importance}(v)}{\sum_{v \in \mathcal{A}} \text{importance}(v)}$$

### Edge Cases

- [ ] If the PKG has no `is_a`/`part_of` edges at all → AD = 1.0 (total drift;
      the user hasn't built any abstraction hierarchy)
- [ ] If no nodes are aligned between PKG and CKG → AD = 1.0 (no comparable
      structure)
- [ ] If PKG perfectly matches CKG hierarchy → AD = 0.0
- [ ] If CKG has no hierarchical edges → AD = 0.0 (nothing to drift from; this
      is a degenerate CKG)

### Thresholds

| Range     | Interpretation | Hint                                                               |
| --------- | -------------- | ------------------------------------------------------------------ |
| 0.0–0.15  | Healthy        | Abstraction hierarchy closely matches canonical structure          |
| 0.15–0.35 | Moderate       | Some divergence — review intermediate abstraction levels           |
| 0.35–0.60 | Concerning     | Significant hierarchy mismatch — may cause transfer errors         |
| 0.60–1.0  | Critical       | Fundamental abstraction misframing — structural remediation needed |

### Metacognitive Stage Gate

AD must be **sustained below 0.35** for Stage 3 advancement (Shared Structural
Control).

---

## Metric 2: Depth Calibration Gradient (DCG)

### Category: Abstraction Metrics

### Intuitive Explanation

DCG measures **whether the student builds conceptual chains of the right
depth**. The CKG defines how "deep" each concept should be — how many
prerequisite steps it takes to reach from foundational concepts to advanced
ones. If the student dramatically shortens or lengthens these chains, they're
miscalibrating the granularity of their understanding.

For example, "Linear Algebra" in the CKG might be 5 levels deep (Numbers →
Arithmetic → Algebra → Matrix Operations → Linear Algebra). If a student models
it as 2 levels deep (Math → Linear Algebra), their DCG is high — they're
critically underestimating the prerequisite complexity, which often manifests as
"I know the formula but can't derive it" or "I can't see why this is hard."

**Why it matters cognitively:** Depth miscalibration correlates strongly with
the Dunning-Kruger effect in specific domains. Students who shallow-ify deep
chains overestimate their understanding. Students who over-deepen simple chains
waste cognitive resources on unnecessary micro-steps.

### What It Compares

- **Prerequisite chain depths** in the PKG vs CKG for each aligned node
- Depth = longest directed path from any root to this node following
  `prerequisite` edges

### Computation Algorithm

- [ ] **Step 1 — Compute CKG depths.** For each node in $G_C$, compute the
      longest directed path from any root node (a node with no incoming
      `prerequisite` edges) to this node. Use topological sort + dynamic
      programming (DAG longest path):

  $$d_C(v) = \begin{cases} 0 & \text{if } v \text{ is a root} \\ \max_{(u,v) \in E_C, \text{type}=\text{prereq}} (d_C(u) + 1) & \text{otherwise} \end{cases}$$

- [ ] **Step 2 — Compute PKG depths.** Same algorithm for $G_P$. Note: the PKG
      may have cycles if acyclicity checks were bypassed — if so, break cycles
      at the weakest edge (lowest weight) before computing depth.

- [ ] **Step 3 — Compute per-node depth discrepancy.** For each aligned node:

  $$\delta(v) = \frac{|d_P(v) - d_C(\mathcal{A}(v))|}{\max(d_C(\mathcal{A}(v)), 1)}$$

  This normalizes the absolute depth difference by the expected depth. A
  discrepancy of 2 is more concerning for a concept expected to be at depth 3
  than for one expected at depth 10.

- [ ] **Step 4 — Compute gradient across depth bands.** Group aligned nodes by
      their CKG depth into bands (e.g., shallow: 0–2, mid: 3–5, deep: 6+).
      Compute mean $\delta$ per band. The "gradient" captures whether
      discrepancy _worsens_ at deeper levels (common pattern: students are
      accurate on shallow concepts but increasingly miscalibrated on deeper
      ones):

  $$\text{gradient} = \frac{\bar{\delta}_{\text{deep}} - \bar{\delta}_{\text{shallow}}}{\bar{\delta}_{\text{shallow}} + \epsilon}$$

  where $\epsilon = 0.01$ prevents division by zero.

- [ ] **Step 5 — Combine into DCG.** DCG is the mean discrepancy weighted toward
      deeper nodes (where miscalibration hurts more), clamped to [0, 1]:

  $$DCG = \text{clamp}\left(\frac{\sum_{v \in \mathcal{A}} \delta(v) \cdot (1 + d_C(\mathcal{A}(v)))}{\sum_{v \in \mathcal{A}} (1 + d_C(\mathcal{A}(v)))}, 0, 1\right)$$

  The $(1 + d_C)$ weighting means depth errors in deep concepts contribute more.

### Edge Cases

- [ ] If the CKG has no `prerequisite` edges → all depths are 0, DCG = 0.0
      (nothing to calibrate against)
- [ ] If the PKG has no `prerequisite` edges → all PKG depths are 0; if CKG has
      non-zero depths, DCG will be high (student hasn't built any prerequisite
      chains)
- [ ] If only shallow CKG nodes exist (max depth 1) → DCG is computed but will
      be low even for minor errors (because the denominator normalizes)
- [ ] If cycles exist in PKG (bypassed acyclicity) → break cycles before depth
      computation

### Thresholds

| Range     | Interpretation | Hint                                                          |
| --------- | -------------- | ------------------------------------------------------------- |
| 0.0–0.10  | Healthy        | Concept depth closely matches expected depth                  |
| 0.10–0.25 | Moderate       | Some depth miscalibration — review deep prerequisite chains   |
| 0.25–0.50 | Concerning     | Significant depth distortion — may signal Dunning-Kruger risk |
| 0.50–1.0  | Critical       | Severe depth miscalibration — fundamental prerequisite gaps   |

### Metacognitive Stage Gate

DCG must be **stable** (variance < 0.05 across last 5 snapshots) for Stage 3
advancement. A negative gradient (discrepancy worsening at deeper levels)
specifically blocks advancement.

---

## Metric 3: Scope Leakage Index (SLI)

### Category: Boundary & Scope Metrics

### Intuitive Explanation

SLI measures **how much the student's domain boundaries bleed into other
domains**. When studying physics, does the student correctly keep "force" and
"acceleration" within physics, or do they have edges connecting physics concepts
to chemistry concepts that don't belong?

This is analogous to a student who, when asked about Newton's laws, starts
explaining chemical bonds — not because they're wrong per se, but because their
mental model conflates the boundaries between domains. The CKG defines which
concepts belong to which domain. SLI captures how often the student violates
these canonical boundaries.

**Why it matters cognitively:** Scope leakage indicates **overgeneralization** —
the student applies rules beyond their valid scope. In medicine, this is the
student who treats all chest pain as cardiac; in programming, it's the student
who uses inheritance for every code reuse scenario. Detecting boundary
violations early prevents the formation of incorrect transfer habits.

### What It Compares

- **PKG edges** that cross domain boundaries (source.domain ≠ target.domain)
- **CKG domain assignments** for the same nodes (what domain each concept
  canonically belongs to)

### Computation Algorithm

- [ ] **Step 1 — Identify cross-domain edges in PKG.** For each edge
      $e = (u, v)$ in $G_P$ where $\text{dom}(u)$ is the domain being analyzed:
  - If $\text{dom}(v) \neq \text{dom}(u)$, this is a cross-domain edge
  - But cross-domain edges aren't inherently wrong — check against CKG

- [ ] **Step 2 — Classify cross-domain edges as legitimate or leakage.** A
      cross-domain edge is **legitimate** if the CKG also has a similar
      cross-domain relationship (i.e., the canonical structure acknowledges this
      connection). It's **leakage** if no corresponding CKG cross-domain edge
      exists for this node pair:

  $$\text{leakage}(e) = \begin{cases} 0 & \text{if } \exists e' \in E_C : \mathcal{A}(\text{src}(e)) = \text{src}(e') \wedge \mathcal{A}(\text{tgt}(e)) = \text{tgt}(e') \\ 1 & \text{otherwise} \end{cases}$$

- [ ] **Step 3 — Weight by edge type severity.** Cross-domain `prerequisite` or
      `is_a` edges are more concerning than `related_to` edges (claiming a
      physics concept is prerequisite for a chemistry concept is worse than
      saying they're "related"):

  | Edge Type      | Leakage Weight |
  | -------------- | -------------- |
  | prerequisite   | 1.0            |
  | is_a           | 1.0            |
  | part_of        | 0.8            |
  | enables        | 0.7            |
  | conflicts_with | 0.3            |
  | related_to     | 0.2            |
  | supports       | 0.5            |
  | assessed_by    | 0.4            |

- [ ] **Step 4 — Compute SLI.**

  $$SLI = \frac{\sum_{e \in \text{cross-domain}} \text{leakage}(e) \cdot \text{weight}(\text{type}(e))}{|E_P| + \epsilon}$$

  where $\epsilon = 1$ avoids division by zero when the PKG has no edges.
  Denominator is total edge count (not just cross-domain), so SLI reflects
  leakage as a proportion of the overall graph complexity.

### Edge Cases

- [ ] If the PKG has no edges → SLI = 0.0 (no boundaries to leak)
- [ ] If the PKG is entirely within one domain with no cross-domain edges → SLI
      = 0.0
- [ ] If ALL cross-domain edges match CKG patterns → SLI = 0.0 (all legitimate)
- [ ] If the CKG has no domain assignments → all cross-domain edges are treated
      as leakage (conservative; flag for review)
- [ ] If the domain being analyzed has only 1 node → SLI is technically
      computable but not meaningful (flag in agent hints)

### Thresholds

| Range     | Interpretation | Hint                                                      |
| --------- | -------------- | --------------------------------------------------------- |
| 0.0–0.05  | Healthy        | Domain boundaries are well-maintained                     |
| 0.05–0.15 | Moderate       | Some boundary bleed — review cross-domain connections     |
| 0.15–0.30 | Concerning     | Significant scope leakage — risk of overgeneralization    |
| 0.30–1.0  | Critical       | Severe domain contamination — boundary remediation needed |

### Metacognitive Stage Gate

SLI must be **below 0.15** for Stage 1 → Stage 2 advancement.

---

## Metric 4: Sibling Confusion Entropy (SCE)

### Category: Boundary & Scope Metrics

### Intuitive Explanation

SCE measures **how much the student confuses concepts that share a common
parent**. In a well-organized knowledge graph, sibling concepts (concepts that
are all `part_of` or `is_a` the same parent) should be distinct — the student
should understand what makes each sibling different from the others.

When a student has many cross-edges between siblings (e.g., "force causes mass",
"mass enables velocity" — when force, mass, and velocity are all children of
"Newtonian Mechanics"), it signals they can't discriminate between the siblings.
The "entropy" framing captures the information-theoretic insight: high entropy
in the sibling edge distribution means the student's connections between
siblings are essentially random rather than structured.

**Why it matters cognitively:** Sibling confusion is the structural fingerprint
of the **confusable set** problem. Students who confuse siblings frequently
benefit from contrastive learning (Minimal Pair Cards, Discriminant Feature
Cards). SCE quantifies this confusion structurally, before it manifests as wrong
answers.

### What It Compares

- **Sibling groups** in the CKG: sets of nodes that share a common parent via
  `part_of` or `is_a`
- **Cross-edges between siblings** in the PKG: edges connecting nodes within the
  same sibling group that don't exist in the CKG

### Computation Algorithm

- [ ] **Step 1 — Identify sibling groups from CKG.** For each parent node $p$ in
      $G_C$, collect its children:
      $S_C(p) = \{v \mid (v, p) \in H_C, \text{type} \in \{\text{is\_a}, \text{part\_of}\}\}$
      Only consider groups with $|S_C(p)| \geq 2$ (need at least 2 siblings).

- [ ] **Step 2 — Map sibling groups to PKG.** For each CKG sibling group
      $S_C(p)$, find the corresponding PKG nodes via inverse alignment:
      $S_P(p) = \{\mathcal{A}^{-1}(v) \mid v \in S_C(p), v \in \text{range}(\mathcal{A})\}$
      Only proceed if $|S_P(p)| \geq 2$.

- [ ] **Step 3 — Count cross-sibling edges in PKG.** For each mapped sibling
      group $S_P(p)$, count edges between siblings:
      $\text{cross}(p) = |\{(u, v) \in E_P \mid u \in S_P(p), v \in S_P(p), u \neq v\}|$

- [ ] **Step 4 — Compute maximum possible cross-sibling edges.**
      $\text{max\_cross}(p) = |S_P(p)| \cdot (|S_P(p)| - 1)$ (directed graph, so
      both directions count)

- [ ] **Step 5 — Subtract legitimate cross-sibling edges.** Some cross-sibling
      edges may exist in the CKG (e.g., "addition is_prerequisite subtraction"
      even though both are children of "arithmetic"). These are legitimate and
      should not count as confusion:
      $\text{confusion}(p) = \text{cross}(p) - \text{legitimate}(p)$ where
      $\text{legitimate}(p)$ is the count of cross-sibling edges in $S_P(p)$
      that have a corresponding edge in the CKG sibling group.

- [ ] **Step 6 — Compute per-group confusion ratio.**

  $$r(p) = \frac{\max(\text{confusion}(p), 0)}{\text{max\_cross}(p)}$$

- [ ] **Step 7 — Compute entropy across all sibling groups.** Treat each group's
      confusion ratio as a probability and compute normalized entropy:

  $$SCE = \frac{-\sum_{p} r(p) \log_2(r(p) + \epsilon)}{\log_2(N_{\text{groups}})}$$

  where $N_{\text{groups}}$ is the number of sibling groups and
  $\epsilon = 10^{-10}$. But because we want high confusion = high SCE, and the
  above would give high entropy when confusion is _distributed_ across groups,
  we instead use a simpler weighted mean:

  $$SCE = \frac{\sum_{p} r(p) \cdot |S_P(p)|}{\sum_{p} |S_P(p)|}$$

  This weights larger sibling groups more heavily (confusing 8 siblings is worse
  than confusing 2). The result is in [0, 1].

### Edge Cases

- [ ] If the CKG has no sibling groups (no parent nodes with 2+ children) → SCE
      = 0.0 (nothing to confuse)
- [ ] If none of the CKG siblings have aligned PKG counterparts → SCE = 0.0
      (user hasn't mapped these concepts yet)
- [ ] If all cross-sibling edges match CKG patterns → SCE = 0.0 (all connections
      are legitimate, not confusion)
- [ ] If the user has zero edges between any siblings → SCE = 0.0 (no confusion,
      but also possibly no discrimination — this is captured by other metrics)

### Thresholds

| Range     | Interpretation | Hint                                                          |
| --------- | -------------- | ------------------------------------------------------------- |
| 0.0–0.10  | Healthy        | Good sibling discrimination                                   |
| 0.10–0.25 | Moderate       | Some sibling conflation — consider contrastive exercises      |
| 0.25–0.50 | Concerning     | Significant confusion between related concepts                |
| 0.50–1.0  | Critical       | Unable to discriminate siblings — targeted remediation needed |

### Metacognitive Stage Gate

SCE must be **low** (below 0.25) for Stage 1 → Stage 2 advancement.

---

## Metric 5: Upward Link Strength (ULS)

### Category: Connectivity Metrics

### Intuitive Explanation

ULS measures **how well the student connects specific knowledge to its
abstractions**. In a healthy knowledge graph, specific concepts should have
strong upward connections (via `is_a`, `part_of`) to their parent abstractions.
When a student knows "quicksort" but can't connect it to "sorting algorithms" or
"algorithms," that knowledge is "orphaned" — it exists in isolation without
structural support.

Think of it as the strength of the conceptual scaffolding. A student who knows
many facts but has weak connections to organizing principles will struggle with
transfer, because they can't "climb up" the abstraction ladder to find the
general rule that applies to new situations.

**Why it matters cognitively:** Low ULS is the structural indicator of
**fragmented knowledge**. It predicts difficulty with far transfer, analogical
reasoning, and spontaneous application of known principles in novel contexts.
It's also the structural correlate of the "I know the pieces but can't see the
whole picture" complaint.

### What It Measures

- **Edge weights** on upward (child→parent) `is_a` and `part_of` edges in the
  PKG
- Compares against expected upward connections from the CKG

### Computation Algorithm

- [ ] **Step 1 — Identify upward edges in PKG.** Collect all edges in $G_P$ with
      type `is_a` or `part_of`:
      $E_{\text{up}} = \{e \in E_P \mid \text{type}(e) \in \{\text{is\_a}, \text{part\_of}\}\}$

- [ ] **Step 2 — Identify expected upward edges from CKG.** For each aligned PKG
      node, check whether the CKG expects upward edges that the PKG has:
      $E_{\text{expected}} = \{(v, u) \in H_C \mid v \in \text{range}(\mathcal{A}) \wedge u \in \text{range}(\mathcal{A})\}$

- [ ] **Step 3 — Compute coverage.** What fraction of expected upward edges
      exist in the PKG?
      $\text{coverage} = \frac{|E_{\text{up}} \cap E_{\text{expected}}^{\mathcal{A}^{-1}}|}{|E_{\text{expected}}| + \epsilon}$

  where $E_{\text{expected}}^{\mathcal{A}^{-1}}$ maps CKG expected edges back to
  PKG node IDs through inverse alignment.

- [ ] **Step 4 — Compute weight strength.** For the upward edges that exist, how
      strong are they?
      $\text{strength} = \frac{1}{|E_{\text{up}}|} \sum_{e \in E_{\text{up}}} w(e)$

  Edge weights of 0.0 mean "I added this connection but I'm not confident"; 1.0
  means "I strongly understand this relationship."

- [ ] **Step 5 — Combine coverage and strength.**

  $$ULS = \alpha \cdot \text{coverage} + (1 - \alpha) \cdot \text{strength}$$

  where $\alpha = 0.6$ (coverage matters more than strength — having the
  connection at all is more important than how confident the student feels about
  it).

### Edge Cases

- [ ] If CKG has no hierarchical edges → ULS = 1.0 (no expectations to fail)
- [ ] If PKG has no upward edges and CKG expects some → ULS = 0.0 (completely
      orphaned knowledge structure)
- [ ] If PKG has upward edges but none match CKG expectations → coverage = 0.0
      but strength may be non-zero; ULS reflects the coverage penalty

### Thresholds

| Range     | Interpretation | Hint                                                                      |
| --------- | -------------- | ------------------------------------------------------------------------- |
| 0.70–1.0  | Healthy        | Strong conceptual scaffolding                                             |
| 0.50–0.70 | Moderate       | Some orphaned knowledge areas                                             |
| 0.30–0.50 | Concerning     | Weak scaffolding — knowledge fragmentation risk                           |
| 0.0–0.30  | Critical       | Severely orphaned knowledge — remediation through explicit linking needed |

---

## Metric 6: Traversal Breadth Score (TBS)

### Category: Connectivity Metrics

### Intuitive Explanation

TBS measures **the diversity of relationship types a student employs** in their
knowledge graph. A rich mental model doesn't just have `prerequisite` edges — it
has `is_a` (classification), `part_of` (composition), `enables` (causal),
`conflicts_with` (distinction), `related_to` (association), and more.

A student whose graph is mostly `prerequisite` edges has a linear, sequential
understanding — "learn A before B before C." A student with diverse edge types
understands the _multidimensional_ relationships between concepts — "A is a type
of B, A enables C, A conflicts with D, A is part of E." This breadth of
traversal paths means the student can approach any concept from multiple angles,
which is the structural foundation for flexible retrieval and creative problem
solving.

**Why it matters cognitively:** Low TBS indicates **tunnel thinking** — the
student can only traverse their knowledge in one dimension (usually
"prerequisites"). This predicts poor performance on transfer tasks that require
reasoning via classification, analogy, or contrast rather than sequential
prerequisite chains.

### What It Measures

- **Distribution of edge types** in the PKG
- **Per-node edge type variety** (how many different relationship types does
  each node participate in?)

### Computation Algorithm

- [ ] **Step 1 — Count edge types globally.** Let $T$ be the set of all possible
      edge types (from `GraphEdgeType` enum). For the user's PKG:
      $\text{count}(t) = |\{e \in E_P \mid \text{type}(e) = t\}|$

- [ ] **Step 2 — Compute global type entropy.** Using Shannon entropy normalized
      by maximum possible entropy:

  $$H_{\text{global}} = \frac{-\sum_{t \in T : \text{count}(t) > 0} p(t) \log_2 p(t)}{\log_2 |T|}$$

  where $p(t) = \text{count}(t) / |E_P|$. This is 0 when all edges are the same
  type and 1 when edges are uniformly distributed across all types.

- [ ] **Step 3 — Compute per-node type variety.** For each node $v$ in $G_P$,
      count distinct edge types (both incoming and outgoing):
      $\text{variety}(v) = |\{t \mid \exists e \in E_P : (v = \text{src}(e) \vee v = \text{tgt}(e)) \wedge \text{type}(e) = t\}|$

- [ ] **Step 4 — Compute mean node variety ratio.**

  $$\bar{V} = \frac{1}{|V_P|} \sum_{v \in V_P} \frac{\text{variety}(v)}{|T|}$$

- [ ] **Step 5 — Combine.**

  $$TBS = 0.5 \cdot H_{\text{global}} + 0.5 \cdot \bar{V}$$

  Equal weighting of global distribution and local variety. Global captures
  overall graph-level diversity; local captures whether individual nodes are
  well-connected through multiple relationship types.

### Edge Cases

- [ ] If the PKG has 0 or 1 edges → TBS = 0.0 (no breadth possible)
- [ ] If all edges are the same type → $H_{\text{global}} = 0$, variety will be
      low, TBS ≈ something low
- [ ] If nodes have many edge types but the global distribution is skewed → TBS
      reflects the balance
- [ ] If the graph has only 1 node → TBS = 0.0

### Thresholds

| Range     | Interpretation | Hint                                                                    |
| --------- | -------------- | ----------------------------------------------------------------------- |
| 0.60–1.0  | Healthy        | Rich variety of relationship types                                      |
| 0.40–0.60 | Moderate       | Somewhat limited traversal paths                                        |
| 0.20–0.40 | Concerning     | Narrow relationship vocabulary — consider adding non-prerequisite edges |
| 0.0–0.20  | Critical       | Traversal collapse — knowledge is one-dimensional                       |

### Metacognitive Stage Gate

TBS must be **high** (above 0.50) for Stage 3 advancement.

---

## Metric 7: Strategy-Depth Fit (SDF)

### Category: Strategy–Structure Interaction Metrics

### Intuitive Explanation

SDF measures **whether the student's learning strategy matches the structural
depth of their knowledge graph areas**. Different strategies work best at
different depths:

- **Shallow areas** (few prerequisite layers) → Fast Recall Build is effective
- **Deep areas** (many prerequisite layers) → Deep Understanding Build is needed
- **Moderate depth** → Exam Survival Build works well

When a student uses Fast Recall Build on areas that have deep prerequisite
chains in their PKG, or Deep Understanding Build on shallow factual areas,
there's a strategy-structure mismatch. SDF quantifies this alignment.

**Why it matters cognitively:** Strategy-depth misfit wastes cognitive effort
and can actively harm learning. Deep understanding techniques applied to shallow
content create unnecessary complexity; speed-drilling applied to deep structural
content produces surface-level memorization without genuine comprehension.

### What It Compares

- **PKG structure** — depth profile of the user's graph in each area (how many
  prerequisite levels per subgraph region)
- **User's active strategy** — from the strategy-service (loadout archetype and
  its parameters)
- Requires cross-service data (strategy-service), or uses the user's graph
  structure as a proxy for strategy intent

### Computation Algorithm

- [ ] **Step 1 — Compute depth profile.** Partition the PKG nodes into depth
      bands based on their longest prerequisite chain length:
  - Shallow: depth 0–2
  - Medium: depth 3–5
  - Deep: depth 6+

  Count nodes in each band: $n_s, n_m, n_d$.

- [ ] **Step 2 — Infer structural emphasis.** Compute how much of the graph
      lives at each depth level. This is the "structural signal" of where the
      student is investing effort: $\text{emphasis}(b) = n_b / |V_P|$ for each
      band $b$.

- [ ] **Step 3 — Define strategy-depth alignment target.** Each strategy
      archetype has an ideal depth emphasis distribution:

  | Strategy                   | Shallow | Medium | Deep |
  | -------------------------- | ------- | ------ | ---- |
  | Fast Recall Build          | 0.60    | 0.30   | 0.10 |
  | Deep Understanding Build   | 0.15    | 0.35   | 0.50 |
  | Exam Survival Build        | 0.30    | 0.45   | 0.25 |
  | Calibration Training Build | 0.25    | 0.50   | 0.25 |
  | Discrimination Build       | 0.40    | 0.40   | 0.20 |

  If the user's active strategy is unknown, use a uniform distribution (0.33,
  0.33, 0.33) as the default target.

- [ ] **Step 4 — Compute alignment.** Use 1 minus the Jensen-Shannon divergence
      between the user's emphasis distribution and the target distribution:

  $$SDF = 1 - JSD(\text{emphasis} \| \text{target})$$

  Where $JSD(P \| Q) = \frac{1}{2} D_{KL}(P \| M) + \frac{1}{2} D_{KL}(Q \| M)$,
  $M = \frac{P + Q}{2}$, and $D_{KL}$ is the Kullback-Leibler divergence.

  JSD is bounded in [0, 1] when using $\log_2$, so SDF is also in [0, 1]. SDF =
  1 means perfect alignment; SDF = 0 means maximum misalignment.

### Edge Cases

- [ ] If the PKG has fewer than 5 nodes → SDF = 0.5 (insufficient data to judge;
      return moderate with a hint)
- [ ] If all nodes are at the same depth → emphasis is concentrated in one band;
      SDF depends on strategy alignment
- [ ] If the user's strategy is unknown → use uniform target → SDF reflects how
      balanced the graph depth is
- [ ] If the strategy service is unavailable → fall back to uniform target

### Thresholds

| Range     | Interpretation | Hint                                                                 |
| --------- | -------------- | -------------------------------------------------------------------- |
| 0.75–1.0  | Healthy        | Strategy and graph depth are well-aligned                            |
| 0.50–0.75 | Moderate       | Some misalignment between strategy and structure                     |
| 0.25–0.50 | Concerning     | Strategy may not suit this domain's structure — consider switching   |
| 0.0–0.25  | Critical       | Severe strategy mismatch — current approach likely counterproductive |

---

## Metric 8: Structural Strategy Entropy (SSE)

### Category: Strategy–Structure Interaction Metrics

### Intuitive Explanation

SSE measures **how uniformly the student spreads their learning effort across
different structural regions of the graph**. A student with low SSE either
focuses intensely on one area (uniform depth) or distributes evenly (uniform
breadth). A student with high SSE has some areas deeply developed and others
barely touched, with no clear pattern.

This is not about whether high or low SSE is "good" — the interpretation depends
on context. High SSE might reflect **intentional specialization** (the student
is deep-diving into one area while ignoring others) or **structural neglect**
(the student has forgotten about entire subdomains). Low SSE might reflect
**thoroughness** or **rigidity** (the student mechanically advances all areas at
the same pace regardless of difficulty).

**Why it matters cognitively:** SSE combined with other signals helps
distinguish intentional from unintentional structural unevenness. When the
diagnostic agent sees high SSE + low SAA (the student doesn't understand why
their graph is uneven), it suggests structural neglect. High SSE + high SAA (the
student consciously chose to specialize) is healthy.

### What It Measures

- **Depth variance** across structural regions (subtrees rooted at top-level
  concepts)
- **Effort distribution** (number of nodes per sub-region, normalized)

### Computation Algorithm

- [ ] **Step 1 — Identify structural regions.** Find top-level concept clusters
      in the PKG (nodes with no incoming `is_a` or `part_of` edges — the "roots"
      of sub-hierarchies). Each root and its descendants form a region. If the
      PKG has no clear roots, use connected components.

- [ ] **Step 2 — Compute per-region depth.** For each region, compute the
      maximum prerequisite chain length: $D_r = \max_{v \in R_r} d_P(v)$

- [ ] **Step 3 — Compute per-region size.** Count nodes in each region:
      $N_r = |R_r|$

- [ ] **Step 4 — Compute depth entropy.** Normalize region depths into a
      probability distribution: $p_r = D_r / \sum_r D_r$

  Then compute normalized entropy:

  $$H_D = \frac{-\sum_r p_r \log_2(p_r + \epsilon)}{\log_2(N_{\text{regions}})}$$

- [ ] **Step 5 — Compute size entropy.** Similarly for region sizes:
      $q_r = N_r / |V_P|$

  $$H_N = \frac{-\sum_r q_r \log_2(q_r + \epsilon)}{\log_2(N_{\text{regions}})}$$

- [ ] **Step 6 — Combine.**

  $$SSE = 1 - \frac{H_D + H_N}{2}$$

  High entropy (even distribution) → low SSE (uniform learning). Low entropy
  (concentrated) → high SSE (uneven learning).

  This inversion makes high SSE = uneven = potentially concerning, which aligns
  with the "concerning signal" semantics described in the spec.

### Edge Cases

- [ ] If the PKG has only 1 region → SSE = 0.0 (no variation possible)
- [ ] If all regions have the same depth and size → SSE = 0.0 (perfectly
      uniform)
- [ ] If one region has depth 10 and all others have depth 0 → SSE ≈ 1.0
      (extremely uneven)
- [ ] If the PKG has no hierarchical structure (no roots identifiable) → use
      connected components; if only 1 component, SSE = 0.0

### Thresholds

| Range     | Interpretation | Hint                                                                          |
| --------- | -------------- | ----------------------------------------------------------------------------- |
| 0.0–0.25  | Uniform        | Learning is evenly distributed — check if appropriate for the domain          |
| 0.25–0.50 | Moderate       | Some structural unevenness — may be intentional specialization                |
| 0.50–0.75 | Concerning     | High unevenness — check if structural neglect or intentional                  |
| 0.75–1.0  | Critical       | Extreme learning disparity across regions — review for structural blind spots |

Note: SSE thresholds must be interpreted alongside SAA. High SSE + high SAA is
healthy specialization; high SSE + low SAA signals unintentional neglect.

---

## Metric 9: Structural Attribution Accuracy (SAA)

### Category: Attribution Metrics

### Intuitive Explanation

SAA measures **whether the student understands _why_ their knowledge graph looks
the way it does**. When a student says "I organized these concepts this way
because X," SAA checks whether X actually matches the structural evidence.

For example, a student might say "I put 'derivatives' as a prerequisite for
'integrals' because you need to understand rates of change before accumulation."
SAA would check: does the student's PKG actually have a prerequisite edge from
derivatives to integrals? Does the edge weight suggest genuine understanding, or
is it a weak guess? Does the student's stated rationale (rate of change →
accumulation) match the structural relationship type (prerequisite)?

**Why it matters cognitively:** SAA is a direct measure of **metacognitive
accuracy**. Students who can accurately explain their own knowledge structure
are better at identifying their own gaps, selecting appropriate strategies, and
self-correcting. Low SAA means the student's model of their own model is wrong—
they're not just confused about the domain, they're confused about what they're
confused about.

### What It Compares

- **User's self-reported structural rationales** (stored as annotations or
  metadata on edges/nodes in the PKG)
- **Structural evidence** from the PKG and CKG (edge types, weights, depth
  relationships)

### Computation Algorithm

- [ ] **Step 1 — Collect structural attributions.** Query the PKG for nodes or
      edges that have user-provided rationales stored in `properties.rationale`
      or similar metadata fields. Let $A$ be the set of structural attributions.

  If no attributions exist, SAA cannot be computed → return 0.5 (neutral) with a
  hint explaining that the user hasn't provided enough structural rationale
  data.

- [ ] **Step 2 — For each attribution, extract the claim.** An attribution
      typically claims one of:
  - **Relationship type**: "A is a prerequisite for B" → check if the edge type
    matches
  - **Ordering**: "A comes before B" → check if there's a directed path from A
    to B
  - **Grouping**: "A and B belong together" → check if they share a parent or
    are in the same cluster
  - **Importance**: "A is more important than B" → check if A has higher
    centrality or more connections

- [ ] **Step 3 — Verify each claim against structural evidence.** For each
      attribution $a \in A$:

  $$\text{accuracy}(a) = \begin{cases} 1.0 & \text{if structural evidence fully supports the claim} \\ 0.5 & \text{if structural evidence is ambiguous or insufficient} \\ 0.0 & \text{if structural evidence contradicts the claim} \end{cases}$$

  More granular scoring is possible: if the claim is "A is prerequisite for B"
  and the edge exists but with very low weight (say 0.1), that's partial support
  → accuracy = 0.5.

- [ ] **Step 4 — Aggregate.**

  $$SAA = \frac{1}{|A|} \sum_{a \in A} \text{accuracy}(a)$$

### Implementation Note

SAA is the most **data-dependent** metric — it only produces meaningful results
when users have provided structural attributions. In early stages, most users
won't have any attributions, so SAA should return a neutral default with a hint
encouraging the user to explain their organizational choices. As the system
matures and agents prompt users for structural rationales, SAA becomes more
informative.

### Edge Cases

- [ ] If no attributions exist → SAA = 0.5 (neutral, with explanatory hint)
- [ ] If all attributions are confirmed → SAA = 1.0
- [ ] If all attributions are contradicted → SAA = 0.0
- [ ] If attributions reference nodes that have been deleted → skip those
      attributions, note in hints

### Thresholds

| Range     | Interpretation | Hint                                                                                         |
| --------- | -------------- | -------------------------------------------------------------------------------------------- |
| 0.80–1.0  | Healthy        | Strong metacognitive awareness — user understands their own structure                        |
| 0.60–0.80 | Moderate       | Some metacognitive gaps — consider self-assessment exercises                                 |
| 0.40–0.60 | Concerning     | Significant disconnect between self-model and structural reality                             |
| 0.0–0.40  | Critical       | Metacognitive blind spot — user's understanding of their own structure is largely inaccurate |

### Metacognitive Stage Gate

SAA must **improve** (delta > 0 across 3+ snapshots) for Stage 2 → Stage 3
advancement. The absolute level matters less than the trend — showing the
student is becoming more self-aware.

---

## Metric 10: Structural Stability Gain (SSG)

### Category: Longitudinal Structural Growth Metrics (Delta Metric)

### Intuitive Explanation

SSG measures **how much the graph's structure has settled down since the last
measurement**. In the early stages of learning, a student's knowledge graph
changes rapidly — nodes are added, edges are rewired, hierarchies restructure.
As understanding consolidates, the graph stabilizes. SSG captures this
stabilization.

Think of it like tectonic plates: early learning is seismically active (lots of
structural shifts), while deep understanding is geologically stable (the
foundations don't move). A positive SSG means the graph is stabilizing
(consolidation). A negative SSG means the graph is becoming _more_ volatile
(possible confusion or reorganization).

**Why it matters cognitively:** Stabilization is a signal of **knowledge
consolidation**. When combined with maintained mastery levels, it indicates the
student has moved from active model-building to confident model-using. Sudden
destabilization (negative SSG) after a period of stability may signal a
productive learning crisis (encountering information that requires
restructuring) or a regressive episode that needs attention.

### What It Compares

- **Current structural snapshot** — the full set of nodes, edges, and their
  properties at time $t$
- **Previous structural snapshot** — the same at time $t-1$

### Computation Algorithm

- [ ] **Step 1 — Retrieve previous snapshot.** Get the most recent
      `StructuralMetricSnapshot` from `IMetricsRepository` for this (userId,
      domain). If no previous snapshot exists, SSG = 0.0 (no change to measure).

- [ ] **Step 2 — Compute structural edit distance.** Count the structural
      changes between the two snapshots:
  - $\text{nodes\_added}$: nodes in current but not in previous
  - $\text{nodes\_removed}$: nodes in previous but not in current
  - $\text{edges\_added}$: edges in current but not in previous
  - $\text{edges\_removed}$: edges in previous but not in current
  - $\text{edges\_reweighted}$: edges whose weight changed by more than 0.1
  - $\text{types\_changed}$: nodes whose type changed

- [ ] **Step 3 — Compute churn rate.** The total structural change normalized by
      graph size:

  $$\text{churn}_t = \frac{\text{nodes\_added} + \text{nodes\_removed} + \text{edges\_added} + \text{edges\_removed} + \text{edges\_reweighted} + \text{types\_changed}}{|V_P^t| + |E_P^t| + \epsilon}$$

- [ ] **Step 4 — Compare with previous churn.** If the previous snapshot also
      has a recorded churn rate (stored as part of the snapshot metadata or
      computed from snapshot $t-2$), compute the gain:

  $$SSG = \text{churn}_{t-1} - \text{churn}_t$$

  Positive SSG = churn decreased (stabilizing). Negative SSG = churn increased
  (destabilizing).

  If no previous churn rate exists (first computation), SSG = 0.0.

- [ ] **Step 5 — Weight by node depth.** Deep nodes stabilizing is more
      significant than shallow nodes stabilizing (it means the student has
      consolidated foundational understanding, not just leaf-level facts):

  $$SSG_{\text{weighted}} = \sum_{v \in \text{changed\_nodes}} \frac{\text{stability\_change}(v) \cdot (1 + d_P(v))}{\sum_{v} (1 + d_P(v))}$$

  The final SSG is the mean of the simple churn-based SSG and the depth-weighted
  SSG, clamped to [-1, 1].

### Edge Cases

- [ ] If no previous snapshot exists → SSG = 0.0 (nothing to compare)
- [ ] If the graph is empty in both snapshots → SSG = 0.0
- [ ] If the graph was empty and now has content → churn = 1.0, previous churn =
      0, SSG = -1.0 (maximally destabilizing, which is expected — hint should
      note "Initial graph construction — destabilization is expected")
- [ ] If the graph hasn't changed at all → churn = 0, SSG ≥ 0

### Thresholds

| Range    | Interpretation         | Hint                                                                   |
| -------- | ---------------------- | ---------------------------------------------------------------------- |
| > 0.2    | Strong stabilization   | Knowledge structure is consolidating well                              |
| 0.0–0.2  | Moderate stabilization | Structure is settling — continued learning recommended                 |
| -0.2–0.0 | Mild destabilization   | Some structural reorganization — possibly productive                   |
| < -0.2   | Strong destabilization | Significant structural upheaval — check if regressive or growth crisis |

### Note

SSG is NOT stored as a snapshot field — it's computed from the _difference_
between the last two snapshots' structures. However, the churn rate value should
be persisted in the snapshot metadata to enable the delta computation without
re-fetching and re-diffing the full graph structures.

---

## Metric 11: Boundary Sensitivity Improvement (BSI)

### Category: Longitudinal Structural Growth Metrics (Delta Metric)

### Intuitive Explanation

BSI measures **how much better the student has gotten at distinguishing domain
boundaries over time**. It's the temporal derivative of SLI — if the student's
Scope Leakage Index was 0.25 in the previous snapshot and is now 0.15, the BSI
is +0.10 (improved). If SLI went from 0.10 to 0.20, BSI is -0.10 (regressed).

More specifically, BSI normalizes the SLI improvement by the opportunity for
improvement (you can't improve much if your SLI was already 0.01). This makes
BSI comparable across students with very different starting points.

**Why it matters cognitively:** BSI tracks the learning trajectory for domain
boundary understanding. A student with high SLI but positive BSI is improving
and should be encouraged. A student with moderate SLI but negative BSI is
regressing and may need intervention. The _direction_ of change matters more
than the absolute level for pedagogical decisions.

### What It Compares

- **Current SLI** (just computed for this snapshot)
- **Previous SLI** (from the most recent stored snapshot)

### Computation Algorithm

- [ ] **Step 1 — Retrieve previous SLI.** Get
      `previousMetrics.scopeLeakageIndex` from the most recent
      `StructuralMetricSnapshot`. If no previous snapshot exists, BSI = 0.0.

- [ ] **Step 2 — Compute raw improvement.**
      $\Delta SLI = SLI_{\text{prev}} - SLI_{\text{current}}$ Positive means
      improvement (leakage decreased); negative means regression.

- [ ] **Step 3 — Normalize by improvement opportunity.** The maximum possible
      improvement is $SLI_{\text{prev}}$ (reducing to 0). The maximum possible
      regression is $1 - SLI_{\text{prev}}$ (increasing to 1).

  $$BSI = \begin{cases} \frac{\Delta SLI}{SLI_{\text{prev}} + \epsilon} & \text{if } \Delta SLI \geq 0 \text{ (improvement)} \\ \frac{\Delta SLI}{1 - SLI_{\text{prev}} + \epsilon} & \text{if } \Delta SLI < 0 \text{ (regression)} \end{cases}$$

  This gives BSI = 1.0 when the student completely eliminated leakage, and BSI =
  -1.0 when the student went from perfect boundaries to maximum leakage.

- [ ] **Step 4 — Clamp to [-1, 1].** $BSI = \text{clamp}(BSI, -1, 1)$

### Edge Cases

- [ ] If no previous snapshot → BSI = 0.0 (nothing to compare)
- [ ] If previous SLI was 0.0 and current is 0.0 → BSI = 0.0 (maintained
      perfection, which is technically achievement but not "improvement")
- [ ] If previous SLI was 0.0 and current is > 0 → regression; BSI is negative,
      calculated via the regression formula
- [ ] If previous SLI was 1.0 and current is 0.5 → $\Delta SLI = 0.5$,
      normalized by $SLI_{\text{prev}} = 1.0$ → BSI = 0.5 (improved by 50% of
      possible improvement)

### Thresholds

| Range         | Interpretation       | Hint                                                          |
| ------------- | -------------------- | ------------------------------------------------------------- |
| > 0.30        | Strong improvement   | Boundary sensitivity is rapidly improving                     |
| 0.05–0.30     | Moderate improvement | Steady boundary learning — keep going                         |
| -0.05–0.05    | Stable               | Boundary sensitivity is unchanged — may need new exercises    |
| -0.30–(-0.05) | Mild regression      | Boundary skills slipping — review domain distinctions         |
| < -0.30       | Strong regression    | Significant boundary skill loss — targeted remediation needed |

---

## Cross-Metric Interaction Patterns

Some metrics should be interpreted together, not in isolation:

### Pattern 1: High AD + High DCG

- **Signal**: The student's conceptual hierarchy is wrong _and_ at the wrong
  depth. This is a double misframing — they're not just slightly off, they're
  fundamentally misorganizing the domain.
- **Action**: Scaffolded restructuring from top down. Don't add new content; fix
  the existing hierarchy first.

### Pattern 2: High SLI + Low SCE

- **Signal**: The student crosses domain boundaries but doesn't confuse siblings
  within a domain. This might indicate **creative interdisciplinary thinking**
  rather than confusion. Check whether the cross-domain edges are structurally
  meaningful (e.g., physics→math connections for equations).
- **Action**: Validate; possibly reduce SLI penalty if cross-domain connections
  are pedagogically sound.

### Pattern 3: Low ULS + High TBS

- **Signal**: The student has diverse relationship types (good) but weak
  hierarchical connections (bad). They know "how things relate" but not "what
  things are." This is a structural profile common in experiential learners who
  learn by association rather than classification.
- **Action**: Focus on explicit "is_a" and "part_of" exercises to build
  conceptual scaffolding.

### Pattern 4: High SSE + Low SAA

- **Signal**: The student's graph is structurally uneven AND they don't
  understand why. This is unintentional neglect — some areas are developed and
  others forgotten without the student realizing.
- **Action**: Draw attention to underdeveloped regions. Use a territory-map
  visualization.

### Pattern 5: Positive SSG + Negative BSI

- **Signal**: The graph is stabilizing overall but boundary sensitivity is
  worsening. The student is consolidating _wrong_ boundaries — their structural
  model is settling into an incorrect steady state.
- **Action**: Urgent boundary remediation before the wrong model becomes
  entrenched.

### Pattern 6: High SDF + Low TBS

- **Signal**: Strategy matches depth well but the student uses only one type of
  relationship. The strategy may be effective for depth but is creating
  one-dimensional understanding.
- **Action**: Diversify relationship types; introduce exercises that require
  classification, contrast, or composition reasoning rather than just
  prerequisite chains.

---

## Aggregate Health Score

The `kg_get_structural_health` MCP tool needs a single composite health score.
Compute it as a weighted mean of all 11 metrics, where "badness" metrics are
inverted:

$$\text{health} = \sum_i w_i \cdot s_i$$

where $s_i$ is the "goodness-normalized" value (for badness metrics like AD,
SLI: $s_i = 1 - \text{metric}_i$; for goodness metrics like ULS, TBS:
$s_i =
\text{metric}_i$; for SSE: $s_i = 1 - |SSE - 0.5| \cdot 2$ since both
extremes can be concerning; for delta metrics: $s_i = (\text{metric}_i + 1) / 2$
to map from [-1,1] to [0,1]).

### Suggested Weights

| Metric | Weight | Rationale                                            |
| ------ | ------ | ---------------------------------------------------- |
| AD     | 0.12   | Foundational — hierarchy errors cascade              |
| DCG    | 0.10   | Important for prerequisite accuracy                  |
| SLI    | 0.10   | Boundary violations are visible pedagogical failures |
| SCE    | 0.08   | Sibling confusion is common and treatable            |
| ULS    | 0.12   | Scaffolding is critical for transfer                 |
| TBS    | 0.08   | Important but secondary to hierarchy and scaffolding |
| SDF    | 0.08   | Strategy alignment matters but is adjustable         |
| SSE    | 0.06   | Context-dependent signal                             |
| SAA    | 0.10   | Direct metacognitive measure                         |
| SSG    | 0.08   | Trend signal, not absolute                           |
| BSI    | 0.08   | Trend signal, not absolute                           |

Sum = 1.00

---

## Implementation Checklist (Summary)

- [ ] Implement `IGraphComparison` computation (fetch PKG + CKG, align nodes,
      compute divergences) — prerequisite for metrics 1-4
- [ ] Implement AD: extract hierarchical subgraphs, build parent maps, Jaccard
      distance, importance weighting, aggregate
- [ ] Implement DCG: compute prerequisite chain depths in both graphs, per-node
      depth discrepancy, depth-weighted aggregate
- [ ] Implement SLI: identify cross-domain edges, classify as legitimate vs
      leakage, weight by edge type, normalize
- [ ] Implement SCE: identify CKG sibling groups, map to PKG, count
      cross-sibling edges, subtract legitimate, compute confusion ratio,
      weighted mean
- [ ] Implement ULS: identify upward edges, compute coverage vs CKG
      expectations, compute weight strength, weighted combine
- [ ] Implement TBS: count edge types, compute Shannon entropy, compute per-node
      variety, combine
- [ ] Implement SDF: compute depth profile, infer structural emphasis, compare
      against strategy target via JSD, combine
- [ ] Implement SSE: identify structural regions, compute per-region depth and
      size, compute entropy, invert
- [ ] Implement SAA: collect structural attributions, verify claims against
      evidence, aggregate accuracy
- [ ] Implement SSG: retrieve previous snapshot, compute structural edit
      distance, compute churn rate, compare with previous churn, depth-weight
- [ ] Implement BSI: retrieve previous SLI, compute raw improvement, normalize
      by opportunity, clamp
- [ ] Implement aggregate health score with weighted mean
- [ ] Implement per-metric threshold classification (healthy/warning/critical)
- [ ] Implement per-metric trend detection (improving/stable/declining) from
      historical snapshots
- [ ] Implement cross-metric interaction pattern detection for enriched agent
      hints
- [ ] Store churn rate in snapshot metadata for SSG delta computation
- [ ] Handle all edge cases (empty graphs, no CKG data, no previous snapshot, no
      attributions, etc.)

---

## Dependencies and Data Availability

| Metric | PKG | CKG | Previous Snapshot | Strategy Service | User Attributions |
| ------ | --- | --- | ----------------- | ---------------- | ----------------- |
| AD     | ✅  | ✅  |                   |                  |                   |
| DCG    | ✅  | ✅  |                   |                  |                   |
| SLI    | ✅  | ✅  |                   |                  |                   |
| SCE    | ✅  | ✅  |                   |                  |                   |
| ULS    | ✅  | ✅  |                   |                  |                   |
| TBS    | ✅  |     |                   |                  |                   |
| SDF    | ✅  |     |                   | ✅ (optional)    |                   |
| SSE    | ✅  |     |                   |                  |                   |
| SAA    | ✅  | ✅  |                   |                  | ✅ (optional)     |
| SSG    | ✅  |     | ✅                |                  |                   |
| BSI    | ✅  |     | ✅                |                  |                   |

**Key insight:** TBS, SDF, SSE can be computed from the PKG alone. This means
they're available even when the CKG is empty or the domain has no canonical
structure yet — making them useful early metrics before CKG data is populated.

**SAA and SDF degrade gracefully** when their optional data sources are
unavailable — they return neutral (0.5) values with explanatory hints.
