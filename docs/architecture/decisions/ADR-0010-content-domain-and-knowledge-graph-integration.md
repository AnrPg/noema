````markdown
# ADR-0010: Content Domain Architecture and Knowledge Graph Integration

## Status

Accepted

## Date

2026-02-20

## Context

Noema's content layer is the vertical slice connecting the **Content Service**
(card persistence), the **Knowledge Graph Service** (PKG/CKG structural
storage), and the **Content Generation Agent** (LLM-powered card authoring).

During the design of this vertical slice, several fundamental questions arose:

1. **What is a "category"?** Should it be a standalone entity, a tree, a DAG, or
   part of the knowledge graph?
2. **What is a "deck"?** Should decks be persistent entities or something else?
3. **What graph topology is allowed?** Trees, DAGs, or general directed graphs?
4. **How does the Content Service store cards without owning the graph?**
5. **How does the graph layer handle reads and writes efficiently?**
6. **What does the Content Generation Agent need, and what exists today?**

These questions are interconnected — the answers to each constrain the others.
This ADR documents the decisions made, their rationale, and their consequences
for the knowledge graph architecture established in ADR-001 through ADR-003.

---

## Decisions

### Decision 1: Categories ARE the Personal Knowledge Graph

**Categories are not a separate entity.** When a user organizes their cards into
"folders" or "topics", they are building their PKG. What the UI calls
"categories" is a user-facing projection of the PKG node structure.

```
User sees:              System stores:
┌─────────────┐         ┌────────────────────────────────────┐
│ Mathematics  │         │ PKG Node { id: node_xyz,           │
│ ├─ Algebra   │   ===   │   type: 'concept',                 │
│ │  └─ Groups │         │   label: 'Mathematics',            │
│ └─ Calculus  │         │   edges: [...],                    │
└─────────────┘         │   mastery: 0.72 }                  │
                        └────────────────────────────────────┘
```

**Rationale:**

- A "category tree" is already a knowledge graph — adding a separate entity
  duplicates structure and creates synchronization problems.
- Users organizing their material _is_ them building their mental model. This is
  the core pedagogical insight of Noema: structure IS understanding.
- PKG nodes already carry typed edges, mastery metadata, and ontology
  alignment — everything a "category" would need.
- The 4-stage structural metacognition progression (see Decision 6) depends on
  students directly engaging with graph structure, not a separate category
  system.

**Consequences:**

- No `Category` entity, no `CategoryId` branded type, no `categories` table.
- The Content Service holds a `nodeIds: NodeId[]` array on each card, linking it
  to PKG/CKG nodes.
- The Knowledge Graph Service owns all structural relationships between
  concepts.
- UI "category views" are read-model projections from the Knowledge Graph
  Service.
- The CKG provides canonical category structure; students can diverge in their
  PKG.

---

### Decision 2: Decks Are Dynamic Queries, Not Persistent Entities

**There is no `Deck` entity.** A "deck" is a `DeckQuery` value object — a set
of filters applied to the card archive and knowledge graph at query time.

```typescript
// DeckQuery is a value object, not a persisted entity
interface DeckQuery {
  nodeIds?: NodeId[];           // Cards linked to these KG nodes
  cardTypes?: CardType[];       // Filter by card type
  states?: CardState[];         // e.g., ACTIVE, SUSPENDED
  tags?: string[];              // Freeform tag filters
  dueBefore?: Date;             // Scheduling constraint
  masteryRange?: [number, number]; // Mastery band filter
  difficulty?: DifficultyLevel; // Optional difficulty filter
}

// Resolution: POST /v1/cards/query with DeckQuery body
// Returns: paginated CardSummary[] matching all criteria
```

**Rationale:**

- Decks emerge naturally from KG structure. "All cards under Algebra" = query
  for cards linked to the "Algebra" subtree. "Due today" = scheduling filter.
  "Weak areas" = mastery threshold filter.
- Persistent deck entities create a synchronization burden — when a card's tags
  or KG links change, every deck containing it must update.
- Dynamic queries compose. Users can combine structural filters (KG subtree) +
  state filters (due cards) + mastery filters (weak spots) without a
  combinatorial explosion of saved decks.
- No deck entity means no deck CRUD, no deck membership management, no deck
  versioning.

**DeckQueryLogId reservation:**

The branded type `DeckQueryLogId` (renamed from `DeckId` in this session) is
reserved for _future_ logging of deck query executions — tracking what users
queried, not what decks exist. It is not currently used.

**Consequences:**

- `DeckId` renamed to `DeckQueryLogId` across `@noema/types` and
  `@noema/validation` (already committed: `1e4888a`).
- Card retrieval endpoint: `POST /v1/cards/query` accepts a `DeckQuery` body.
- No deck membership table, no deck-card junction table.
- Shareable decks (future) would be serialized `DeckQuery` objects, not entity
  references.

---

### Decision 3: Directed Graph with Cycles — Acyclicity per Edge Type

**The knowledge graph is a directed graph that allows cycles at the graph level.
Acyclicity is enforced _only_ on specific edge types, per ADR-001's
`DeclareAcyclic` DSL primitive.**

```
Allowed:                        Forbidden:
A ──relates-to──► B             A ──prerequisite──► B
B ──relates-to──► A             B ──prerequisite──► C
(cycle on relates-to: OK)       C ──prerequisite──► A
                                (cycle on prerequisite: REJECTED)
```

**Rationale:**

- Knowledge is not a tree. Concepts relate bidirectionally: "Algebra relates-to
  Geometry" and "Geometry relates-to Algebra" are both valid.
- Only _prerequisite_ edges (and similar ordering relations) require acyclicity
  — you cannot require A before B before C before A.
- ADR-001 already defines `DeclareAcyclic(relation_type)` in the CKG mutation
  DSL. This decision applies the same principle to PKGs.
- The FEATURE_knowledge_graph spec explicitly states: "Acyclicity in specific
  subcategories (e.g. prerequisite DAG)" — the graph as a whole is not
  constrained to be acyclic.

**Acyclic edge types (enforced):**

| Edge Type         | Acyclicity | Rationale                       |
| ----------------- | ---------- | ------------------------------- |
| `is-prerequisite` | Enforced   | Ordering must be a DAG          |
| `is-part-of`      | Enforced   | Composition must be a DAG       |
| `is-subclass-of`  | Enforced   | Type hierarchy must be a DAG    |

**Non-acyclic edge types (cycles allowed):**

| Edge Type       | Cycles   | Rationale                          |
| --------------- | -------- | ---------------------------------- |
| `relates-to`    | Allowed  | Bidirectional associations         |
| `explains`      | Allowed  | Mutual explanation is valid        |
| `contrasts`     | Allowed  | Symmetric by nature                |
| `causes`        | Allowed  | Feedback loops exist in reality    |
| `example-of`    | Allowed  | Cross-referencing examples         |

**Consequences:**

- Cycle detection is per-edge-type, not global — more efficient than whole-graph
  cycle detection.
- The `NoCycleWouldBeIntroduced(relation_type, src, dst)` guard (ADR-003) is
  the enforcement mechanism.
- UI must handle cycles in visualization — tree views are only valid for acyclic
  subgraphs (e.g., prerequisite chains).
- UNITY invariant I1 ("Acyclic prerequisite relation") remains valid and is now
  understood as edge-type-scoped.

---

### Decision 4: CQRS for Graph Storage — Adjacency Writes, Closure Reads

**The Knowledge Graph Service uses CQRS internally: an adjacency list for writes
and a materialized closure table for reads, synchronized asynchronously via
domain events.**

```
Write Model (adjacency list):       Read Model (closure table):
┌────────┬──────────┬────────┐      ┌──────────┬────────────┬───────┐
│ src_id │ relation │ dst_id │      │ ancestor │ descendant │ depth │
├────────┼──────────┼────────┤      ├──────────┼────────────┼───────┤
│ A      │ prereq   │ B      │  ──► │ A        │ B          │ 1     │
│ B      │ prereq   │ C      │      │ A        │ C          │ 2     │
└────────┴──────────┴────────┘      │ B        │ C          │ 1     │
                                    └──────────┴────────────┴───────┘
Fast writes.                        Fast reads: "all descendants of A"
                                    Updated async via events.
```

**Rationale:**

- Graph writes (adding edges, nodes) must be fast — single row inserts in the
  adjacency list, O(1).
- Graph reads ("find all cards under this subtree", "compute reachability")
  require transitive closure, which is O(n³) on raw adjacency lists.
- The closure table pre-computes transitive paths, making subtree queries O(1)
  lookups.
- Async event-driven updates mean writes are never blocked by read model
  recomputation.
- This is a **knowledge-graph-service internal implementation detail** — no
  other service knows about it.

**Sync mechanism:**

1. Edge written to adjacency list → `edge.created` event emitted.
2. Knowledge Graph Service consumer picks up the event.
3. Closure table incrementally updated (insert ancestor-descendant rows).
4. For deletions: affected closure rows recomputed from adjacency source.

**Consistency model:**

- Write model is the source of truth.
- Read model is eventually consistent (typically <100ms lag).
- For operations requiring strong consistency (e.g., cycle detection during
  `DeclareAcyclic` enforcement), the write model is queried directly.

**Consequences:**

- Two PostgreSQL tables per graph instance: `edges` (adjacency) and
  `edge_closure` (materialized).
- Layer 1 derivations (ADR-002) map naturally to the closure table — transitive
  closure, reachability, path summaries are pre-computed.
- Storage overhead: closure table can be large for dense graphs. Mitigated by
  bounding closure depth per relation type (e.g., prerequisite max depth = 50).
- This pattern is invisible to consumers — they query a single GraphQL/REST API.

---

### Decision 5: Content Service = Pure Card Archive

**The Content Service is a card storage engine. It does not own or replicate
graph structure. Cards link to KG nodes via `nodeIds: NodeId[]`.**

```
Content Service                Knowledge Graph Service
┌──────────────────┐           ┌──────────────────────┐
│ Card              │           │ Node                  │
│ ├─ id: CardId     │           │ ├─ id: NodeId         │
│ ├─ cardType       │  links    │ ├─ label              │
│ ├─ nodeIds ───────┼──────────►│ ├─ type               │
│ ├─ content (JSON) │           │ ├─ edges[]            │
│ ├─ tags[]         │           │ └─ mastery            │
│ ├─ state          │           └──────────────────────┘
│ └─ metadata       │
└──────────────────┘
```

**Card content is polymorphic JSON — a discriminated union on `cardType`:**

```typescript
// Each of the 42 card types (22 standard + 20 remediation) has
// a fully typed content schema, discriminated by cardType.
type CardContent =
  | { cardType: 'BASIC_QA'; question: string; answer: string }
  | { cardType: 'CLOZE'; template: string; clozes: Cloze[] }
  | { cardType: 'CONCEPT_MAP'; nodes: MapNode[]; edges: MapEdge[] }
  // ... 39 more
```

**Key endpoints:**

| Method | Path               | Purpose                               |
| ------ | ------------------ | ------------------------------------- |
| POST   | `/v1/cards`        | Create single card                    |
| POST   | `/v1/cards/batch`  | Bulk create (agent-optimized)         |
| POST   | `/v1/cards/query`  | Resolve deck query → card list        |
| GET    | `/v1/cards/:id`    | Get single card                       |
| PATCH  | `/v1/cards/:id`    | Update card content/metadata          |
| DELETE | `/v1/cards/:id`    | Soft-delete card                      |

**Rationale:**

- Single responsibility: cards are documents, graphs are structure.
- The Content Service never needs to understand graph topology — it stores
  `nodeIds` as opaque foreign references.
- Bulk creation (`POST /v1/cards/batch`) is essential for the Content Generation
  Agent, which produces cards in batches of 10–50.
- `POST /v1/cards/query` replaces deck CRUD — it accepts a `DeckQuery` value
  object and resolves cards matching the criteria.

**Events emitted:**

| Event                | Trigger                        |
| -------------------- | ------------------------------ |
| `card.created`       | New card persisted             |
| `card.updated`       | Card content or metadata       |
| `card.deleted`       | Soft-delete                    |
| `card.state.changed` | State transition (e.g., ACTIVE → SUSPENDED) |
| `card.tags.updated`  | Tag list modified              |

**Consequences:**

- No graph queries in the Content Service — "get all cards in this subtree"
  requires first asking the Knowledge Graph Service for descendant `NodeId`s,
  then querying cards by `nodeIds`.
- This two-step resolution happens in the API gateway or client, not in the
  Content Service itself.
- Card search by KG subtree can be optimized with a denormalized index later,
  but the source of truth remains the KG.

---

### Decision 6: PKG Mutations Emit Structural Metacognition Events

**When a student modifies their PKG (adds/removes/reorganizes nodes and edges),
the system computes structural metrics and emits metacognitive events. These
drive the 4-stage structural metacognition progression.**

**Structural metrics (computed from PKG on every mutation):**

| Metric | Name                            | What It Measures                         |
| ------ | ------------------------------- | ---------------------------------------- |
| AD     | Articulation Density            | Nodes per concept area (graph density)   |
| DCG    | Depth of Conceptual Grounding   | Max prerequisite chain depth             |
| SLI    | Structural Linking Index        | Cross-domain edge ratio                  |
| SCE    | Structural Coherence Estimate   | PKG-to-CKG alignment score              |
| ULS    | User-Led Structuring            | % of edges created by user vs. system    |
| TBS    | Taxonomy Building Score         | Quality of hierarchical organization     |

**4-stage metacognitive progression:**

| Stage | Name             | Trigger                                | System Behavior                        |
| ----- | ---------------- | -------------------------------------- | -------------------------------------- |
| 0     | System-Guided    | User is new or ULS < 10%               | System builds PKG, user reviews        |
| 1     | Structure-Salient| ULS ≥ 10%, SCE improving               | System highlights structure, user edits |
| 2     | Shared Control   | ULS ≥ 40%, SLI above threshold         | User and system co-author structure    |
| 3     | User-Owned       | ULS ≥ 70%, all metrics above threshold | User drives, system validates          |

**Rationale:**

- Since categories ARE the PKG (Decision 1), every "categorization" act is a
  graph mutation that reveals the student's structural understanding.
- Structural metacognition — the awareness of how one organizes knowledge — is a
  core learning outcome. The system must track it.
- The 4-stage progression scaffolds students from passive consumption to active
  knowledge architecture.

**Events emitted on PKG mutation:**

```typescript
// Emitted after every PKG structural change
interface PkgStructureChanged {
  userId: UserId;
  nodeId: NodeId;
  mutationType: 'node.added' | 'node.removed' | 'edge.added' | 'edge.removed' | 'node.moved';
  metrics: {
    AD: number;
    DCG: number;
    SLI: number;
    SCE: number;
    ULS: number;
    TBS: number;
  };
  currentStage: MetacognitiveStage; // 0–3
  stageTransition?: {
    from: MetacognitiveStage;
    to: MetacognitiveStage;
  };
}
```

**Consequences:**

- The Knowledge Graph Service must compute structural metrics after each PKG
  mutation (can be async).
- The Metacognition Service consumes `pkg.structure.changed` events and manages
  the stage progression state machine.
- UI adapts based on current stage — Stage 0 hides graph editing, Stage 3
  surfaces full graph tools.
- The Content Generation Agent adjusts card generation strategy based on
  metacognitive stage (more structural cards at Stage 1–2, more autonomous
  prompts at Stage 3).

---

### Decision 7: Content Generation Agent Tool Contract

**The Content Generation Agent requires 34 MCP tools from 9 services. Most
depend on services not yet built. The interim strategy generates cards from
minimal inputs with text-based deduplication.**

**Interim contract (buildable now):**

| Tool                      | Source Service   | Status     |
| ------------------------- | ---------------- | ---------- |
| `createCard`              | Content Service  | BUILDING   |
| `createCardBatch`         | Content Service  | BUILDING   |
| `queryCards`              | Content Service  | BUILDING   |
| `getCardById`             | Content Service  | BUILDING   |
| `updateCard`              | Content Service  | BUILDING   |
| `searchSimilarContent`    | Vector Service   | PLANNED    |

**Interim generation strategy:**

```
Input:  topic + cardType + difficulty + (optional) sourceText
Output: Card[] with generated content, auto-assigned tags

Deduplication: text similarity via Vector Service (when available),
               falls back to exact-match title comparison
```

**Full contract (requires KG, Session, User services):**

The complete 34-tool manifest is documented in
[AGENT_MCP_TOOL_REGISTRY.md](../AGENT_MCP_TOOL_REGISTRY.md). The Content
Generation Agent's full capabilities — context-aware generation, KG-aligned
content, misconception-targeted remediation cards — depend on services that are
not yet implemented.

**Consequences:**

- The agent can be built incrementally: basic generation first, then enriched
  with KG context as services come online.
- All tool stubs are defined in the agent contract with full input/output types,
  even for unbuilt services.
- The agent MUST degrade gracefully when optional tools are unavailable.

---

## Implementation Notes

### Package Changes Already Made

- `DeckId` → `DeckQueryLogId` in `@noema/types` and `@noema/validation`
  (commit `1e4888a`)
- MCP tool registry created at
  `docs/architecture/AGENT_MCP_TOOL_REGISTRY.md` (commit `ca37642`)

### Entities NOT Created (by design)

| Avoided Entity | Reason                                      | Replaced By                        |
| -------------- | ------------------------------------------- | ---------------------------------- |
| `Category`     | Categories = PKG nodes (Decision 1)         | `NodeId` references on cards       |
| `Deck`         | Decks = dynamic queries (Decision 2)        | `DeckQuery` value object           |
| `DeckCard`     | No deck entity → no junction table          | `POST /v1/cards/query`             |
| `CategoryTree` | No separate tree structure                  | PKG subgraph traversal             |

### Service Boundaries

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│ Content Service  │     │ Knowledge Graph Svc   │     │ Content Gen     │
│                  │     │                       │     │ Agent           │
│ Cards (CRUD)     │◄────│ Nodes, Edges, PKG/CKG │────►│ Card generation │
│ Card queries     │     │ Structural metrics    │     │ KG enrichment   │
│ Bulk operations  │     │ Closure table (CQRS)  │     │ Dedup           │
│                  │     │ Metacognitive events  │     │                 │
└────────┬─────────┘     └──────────┬────────────┘     └─────────────────┘
         │                          │
         │     card.created         │   pkg.structure.changed
         │     card.updated         │   metacognitive.stage.transition
         └──────────────────────────┘
              Event Bus (Redis Streams)
```

---

## Consequences

### Positive

- **No entity duplication** — categories and decks don't duplicate KG structure.
- **Composable queries** — deck resolution via `DeckQuery` supports arbitrary
  filter composition without combinatorial entity management.
- **Graph-native design** — the system's data model matches its pedagogical
  model: structure IS understanding.
- **Incremental buildability** — Content Service and basic agent work without
  the full KG stack.
- **Metacognitive integration** — every structural action feeds the learning
  model (no bolt-on analytics).
- **Formal consistency** — cycle policy per edge type aligns with ADR-001's
  `DeclareAcyclic` mechanism and UNITY invariants.

### Negative

- **Two-hop card-by-subtree queries** — finding "all cards under Mathematics"
  requires KG traversal first, then card lookup. More complex than a simple
  `WHERE category_id = X`.
- **Eventual consistency on reads** — closure table updates are async; rare edge
  cases where a just-added edge isn't reflected in subtree queries.
- **No offline deck snapshots** — dynamic queries require service availability.
  Offline/mobile may need cached query results.
- **Agent degradation** — Content Generation Agent works at reduced capability
  until KG and Vector services are built.

### Mitigations

- Two-hop queries: API gateway can compose the calls; a denormalized
  `card_node_index` can optimize hot paths later.
- Eventual consistency: <100ms typical lag; cycle-detection reads use write model
  directly for strong consistency.
- Offline decks: mobile client caches last query result + cards locally;
  re-syncs on reconnect.
- Agent degradation: tool stubs return structured "unavailable" responses; agent
  falls back to text-only generation.

---

## References

- [ADR-001: Dual-Graph Architecture](../../.copilot/instructions/FEATURE_knowledge_graph.md) — PKG/CKG separation, CKG guardrails
- [ADR-002: Stratified Reasoning Policy](../../.copilot/instructions/FEATURE_knowledge_graph.md) — 5-layer reasoning model
- [ADR-003: Canonical Mutation DSL](../../.copilot/instructions/FEATURE_knowledge_graph.md) — `DeclareAcyclic`, typestate protocol
- [ADR-001 (Foundation Types)](ADR-001-foundation-layer-type-system.md) — Branded IDs, `NodeId`, `CardId`, `DeckQueryLogId`
- [ADR-0009: Scheduling Architecture](ADR-0009-scheduling-architecture-agent-service-split.md) — Agent-service split pattern
- [Agent MCP Tool Registry](../AGENT_MCP_TOOL_REGISTRY.md) — 70 tools across 10 agents

````
