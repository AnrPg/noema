# Agent MCP Tool Dependency Registry

**Status:** Living Document **Last Updated:** 2026-03-02 **Purpose:** Track all
MCP tools that agents need, their implementation status, which service owns
them, and blocking dependencies.

---

## How to Read This Document

- **Status**: `EXISTS` | `BUILDING` | `STUB` | `NOT_BUILT` | `PLANNED`
- **Priority**: `P0` (blocks current slice) | `P1` (needed soon) | `P2` (future
  iteration)
- **Owner**: The service that must expose this tool
- **Consumers**: Agents that call this tool

---

## I. Content Generation Agent

The most tool-hungry agent. Needs context from nearly every service to generate
contextually appropriate, pedagogically sound cards.

### A. Content Service Tools (Building Now)

| Tool                    | Description                                | Owner           | Status   | Priority |
| ----------------------- | ------------------------------------------ | --------------- | -------- | -------- |
| `create-card`           | Create a single card with typed content    | content-service | BUILDING | P0       |
| `batch-create-cards`    | Create multiple cards atomically           | content-service | BUILDING | P0       |
| `validate-card-content` | Validate content against card type schema  | content-service | BUILDING | P0       |
| `query-cards`           | Execute a DeckQuery to find existing cards | content-service | BUILDING | P0       |
| `get-card-by-id`        | Retrieve a specific card                   | content-service | BUILDING | P1       |
| `update-card`           | Update card content, tags, metadata        | content-service | BUILDING | P1       |
| `change-card-state`     | Transition card state (draft→active etc.)  | content-service | BUILDING | P1       |

### B. Knowledge Graph Tools (Phase 9 — Implemented)

| Tool                         | Description                                                           | Owner                   | Status | Priority |
| ---------------------------- | --------------------------------------------------------------------- | ----------------------- | ------ | -------- |
| `get-concept-node`           | Get a PKG concept node with full details and neighborhood hints       | knowledge-graph-service | EXISTS | P0       |
| `get-subgraph`               | Get a subgraph centered on a node within a configurable depth limit   | knowledge-graph-service | EXISTS | P0       |
| `find-prerequisites`         | Get prerequisite chain for a concept (topologically sorted, layered)  | knowledge-graph-service | EXISTS | P0       |
| `find-related-concepts`      | Find concepts related to a topic via edge traversal, ranked           | knowledge-graph-service | EXISTS | P0       |
| `add-concept-node`           | Add a new concept node to a user's PKG                                | knowledge-graph-service | EXISTS | P0       |
| `add-edge`                   | Add an edge between two PKG nodes with EDGE_TYPE_POLICIES validation  | knowledge-graph-service | EXISTS | P0       |
| `update-mastery`             | Update the mastery level of a specific PKG node                       | knowledge-graph-service | EXISTS | P0       |
| `remove-node`                | Soft-delete a node from the user's PKG                                | knowledge-graph-service | EXISTS | P1       |
| `remove-edge`                | Remove an edge between two PKG nodes                                  | knowledge-graph-service | EXISTS | P1       |
| `get-canonical-structure`    | Get CKG structure for a domain or concept area                        | knowledge-graph-service | EXISTS | P0       |
| `propose-mutation`           | Propose a CKG structural change via the mutation pipeline DSL         | knowledge-graph-service | EXISTS | P0       |
| `get-mutation-status`        | Check the current status of a CKG mutation                            | knowledge-graph-service | EXISTS | P1       |
| `compute-structural-metrics` | Trigger computation of all 11 structural metrics for a PKG domain     | knowledge-graph-service | EXISTS | P0       |
| `get-structural-health`      | Get high-level structural health report with per-metric breakdowns    | knowledge-graph-service | EXISTS | P0       |
| `detect-misconceptions`      | Run misconception detection engine against a user's PKG               | knowledge-graph-service | EXISTS | P0       |
| `suggest-intervention`       | Suggest intervention strategy for a detected misconception            | knowledge-graph-service | EXISTS | P1       |
| `get-metacognitive-stage`    | Determine user's metacognitive stage for a domain                     | knowledge-graph-service | EXISTS | P0       |
| `get-learning-path-context`  | Comprehensive context dump (metrics + misconceptions + stage + graph) | knowledge-graph-service | EXISTS | P0       |

### C. Strategy & Metacognition Tools (Partially Built)

| Tool                      | Description                                                                | Owner                   | Status    | Priority |
| ------------------------- | -------------------------------------------------------------------------- | ----------------------- | --------- | -------- |
| `get-active-loadout`      | Get user's current strategy loadout (6 policy dimensions)                  | strategy-service        | NOT_BUILT | P1       |
| `get-loadout-archetype`   | Get canonical archetype (Fast Recall, Deep Understanding, etc.)            | strategy-service        | NOT_BUILT | P1       |
| `get-teaching-approach`   | Get active teaching approach (Socratic, inquiry-based, etc.)               | strategy-service        | NOT_BUILT | P1       |
| `get-metacognitive-stage` | Get user's structural metacognition stage (1-4) per graph region           | knowledge-graph-service | EXISTS    | P1       |
| `get-structural-metrics`  | Get user's AD, DCG, SLI, SCE, ULS, TBS, SDF, SSE, SAA metrics              | knowledge-graph-service | EXISTS    | P2       |
| `get-structural-pressure` | Get current pressure settings (traversal, boundary, abstraction, strategy) | metacognition-service   | NOT_BUILT | P2       |

### D. Mental Debugger / Diagnostic Tools (Partially Built)

| Tool                     | Description                                              | Owner                   | Status    | Priority |
| ------------------------ | -------------------------------------------------------- | ----------------------- | --------- | -------- |
| `get-recent-diagnoses`   | Get latest diagnostic results for a user                 | metacognition-service   | NOT_BUILT | P1       |
| `get-failure-patterns`   | Get recurring failure families (10 families) per user    | metacognition-service   | NOT_BUILT | P1       |
| `get-active-patch-plans` | Get outstanding remediation plans                        | metacognition-service   | NOT_BUILT | P1       |
| `detect-misconceptions`  | Detect misconception patterns from user's PKG            | knowledge-graph-service | EXISTS    | P1       |
| `get-remediation-needs`  | Get list of concepts needing remediation cards (by type) | metacognition-service   | NOT_BUILT | P2       |

### E. Session & Performance Tools (Not Built)

| Tool                           | Description                                         | Owner             | Status    | Priority |
| ------------------------------ | --------------------------------------------------- | ----------------- | --------- | -------- |
| `get-user-performance-summary` | Overall accuracy, retention, calibration            | analytics-service | NOT_BUILT | P1       |
| `get-concept-mastery`          | Mastery level per concept/node                      | analytics-service | NOT_BUILT | P1       |
| `get-card-performance-stats`   | Per-card accuracy, response time, attempt count     | analytics-service | NOT_BUILT | P1       |
| `get-session-history`          | Recent session summaries (mode, duration, outcomes) | session-service   | EXISTS    | P2       |
| `get-calibration-data`         | Brier score, ECE, over/underconfidence              | analytics-service | NOT_BUILT | P2       |
| `get-srs-schedule`             | Due dates, intervals, FSRS params for cards         | scheduler-service | NOT_BUILT | P2       |
| `get-learning-velocity`        | Rate of new concept acquisition                     | analytics-service | NOT_BUILT | P2       |

### F. User Context Tools (Partially Built)

| Tool                       | Description                                       | Owner             | Status    | Priority |
| -------------------------- | ------------------------------------------------- | ----------------- | --------- | -------- |
| `get-user-preferences`     | Learning preferences, difficulty preference, etc. | user-service      | EXISTS    | P2       |
| `get-user-knowledge-level` | Aggregate knowledge level estimate                | analytics-service | NOT_BUILT | P2       |

### G. Vector / Similarity Tools (Not Built)

| Tool                   | Description                                    | Owner          | Status    | Priority |
| ---------------------- | ---------------------------------------------- | -------------- | --------- | -------- |
| `search-similar-cards` | Semantic similarity search to avoid duplicates | vector-service | NOT_BUILT | P1       |
| `embed-content`        | Generate embedding for card content            | vector-service | NOT_BUILT | P2       |

### H. Ingestion Tools (Not Built)

| Tool                  | Description                                | Owner             | Status    | Priority |
| --------------------- | ------------------------------------------ | ----------------- | --------- | -------- |
| `get-source-material` | Get original source content from ingestion | ingestion-service | NOT_BUILT | P2       |
| `get-source-context`  | Get surrounding context of a source chunk  | ingestion-service | NOT_BUILT | P2       |

---

## II. Learning Agent

Selects next card based on learning mode, KG context, and SRS schedule.

| Tool                      | Description                            | Owner                   | Status    | Priority |
| ------------------------- | -------------------------------------- | ----------------------- | --------- | -------- |
| `query-cards`             | Execute DeckQuery to resolve card set  | content-service         | BUILDING  | P0       |
| `get-card-by-id`          | Retrieve specific card                 | content-service         | BUILDING  | P0       |
| `get-srs-schedule`        | Get due queue and scheduling params    | scheduler-service       | NOT_BUILT | P0       |
| `get-concept-node`        | Get concept context for card selection | knowledge-graph-service | EXISTS    | P0       |
| `find-prerequisites`      | Check prerequisite readiness           | knowledge-graph-service | EXISTS    | P0       |
| `get-active-loadout`      | Get strategy loadout for session mode  | strategy-service        | NOT_BUILT | P0       |
| `get-metacognitive-stage` | Adapt card selection to user's stage   | knowledge-graph-service | EXISTS    | P1       |
| `get-concept-mastery`     | Mastery levels to inform selection     | analytics-service       | NOT_BUILT | P1       |
| `get-calibration-data`    | Confidence calibration for card choice | analytics-service       | NOT_BUILT | P2       |
| `record-attempt`          | Record card review result              | session-service         | EXISTS    | P0       |
| `update-card-scheduling`  | Update SRS params after review         | scheduler-service       | NOT_BUILT | P0       |
| `get-teaching-approach`   | Current pedagogical method             | strategy-service        | NOT_BUILT | P1       |

---

## III. Diagnostic Agent (Mental Debugger)

Analyzes 7-frame thinking traces, classifies failures, generates patch plans.

| Tool                         | Description                                 | Owner                    | Status    | Priority |
| ---------------------------- | ------------------------------------------- | ------------------------ | --------- | -------- |
| `get-attempt-history`        | Get recent attempts with thinking traces    | session-service          | EXISTS    | P0       |
| `get-thinking-trace`         | Get full 7-frame trace for an attempt       | session-service          | STUB      | P0       |
| `get-card-by-id`             | Get card content for analysis               | content-service          | BUILDING  | P0       |
| `get-concept-node`           | Get concept context for the card            | knowledge-graph-service  | EXISTS    | P0       |
| `find-related-concepts`      | Get confusable / related siblings           | knowledge-graph-service  | EXISTS    | P0       |
| `get-failure-patterns`       | Get user's historical failure families      | metacognition-service    | NOT_BUILT | P0       |
| `create-diagnosis`           | Persist diagnosis result                    | metacognition-service    | NOT_BUILT | P0       |
| `create-patch-plan`          | Create remediation plan                     | metacognition-service    | NOT_BUILT | P0       |
| `get-card-performance-stats` | Per-card stats for pattern detection        | analytics-service        | NOT_BUILT | P1       |
| `get-structural-metrics`     | Graph structural metrics                    | knowledge-graph-service  | EXISTS    | P1       |
| `request-remediation-cards`  | Ask content gen agent to create remediation | content-generation-agent | NOT_BUILT | P1       |

---

## IV. Calibration Agent

Manages confidence calibration and "Liar Detector" functionality.

| Tool                         | Description                                   | Owner             | Status    | Priority |
| ---------------------------- | --------------------------------------------- | ----------------- | --------- | -------- |
| `get-hlr-parameters`         | Half-life regression parameters               | hlr-sidecar       | EXISTS    | P0       |
| `get-calibration-data`       | Brier score, ECE per user                     | analytics-service | NOT_BUILT | P0       |
| `get-card-performance-stats` | Accuracy vs confidence breakdown              | analytics-service | NOT_BUILT | P0       |
| `update-card-difficulty`     | Adjust card difficulty based on calibration   | content-service   | BUILDING  | P0       |
| `get-concept-mastery`        | Per-concept mastery for segmented calibration | analytics-service | NOT_BUILT | P1       |

---

## V. Knowledge Graph Agent

Proposes CKG mutations via DSL, directly updates PKG.

| Tool                      | Description                              | Owner                   | Status    | Priority |
| ------------------------- | ---------------------------------------- | ----------------------- | --------- | -------- |
| `add-concept-node`        | Add node to user's PKG                   | knowledge-graph-service | EXISTS    | P0       |
| `add-edge`                | Add edge to user's PKG                   | knowledge-graph-service | EXISTS    | P0       |
| `update-mastery`          | Update PKG node mastery level            | knowledge-graph-service | EXISTS    | P0       |
| `remove-node`             | Remove PKG node (soft-delete)            | knowledge-graph-service | EXISTS    | P1       |
| `propose-mutation`        | Submit CKG mutation DSL proposal         | knowledge-graph-service | EXISTS    | P0       |
| `get-canonical-structure` | Read CKG context for proposal            | knowledge-graph-service | EXISTS    | P0       |
| `validate-dsl-proposal`   | Dry-run DSL validation (syntax + guards) | knowledge-graph-service | NOT_BUILT | P1       |
| `merge-pkg-nodes`         | Merge duplicate nodes                    | knowledge-graph-service | NOT_BUILT | P2       |
| `get-aggregated-signals`  | PKG→CKG aggregation data                 | knowledge-graph-service | NOT_BUILT | P1       |

---

## VI. Ingestion Agent

Processes documents into cards with concept extraction.

| Tool                   | Description                             | Owner                   | Status    | Priority |
| ---------------------- | --------------------------------------- | ----------------------- | --------- | -------- |
| `process-document`     | Parse document into IR                  | ingestion-service       | NOT_BUILT | P0       |
| `extract-concepts`     | Identify concepts from document content | knowledge-graph-service | NOT_BUILT | P0       |
| `create-card-drafts`   | Generate card drafts from content units | content-service         | BUILDING  | P1       |
| `batch-create-cards`   | Commit approved card drafts             | content-service         | BUILDING  | P0       |
| `search-similar-cards` | Dedup against existing cards            | vector-service          | NOT_BUILT | P1       |
| `get-concept-node`     | Place new content in graph context      | knowledge-graph-service | EXISTS    | P1       |

---

## VII. Socratic Tutor Agent

Conducts dialogue-based learning sessions.

| Tool                      | Description                               | Owner                   | Status    | Priority |
| ------------------------- | ----------------------------------------- | ----------------------- | --------- | -------- |
| `get-card-by-id`          | Get card for dialogue context             | content-service         | BUILDING  | P0       |
| `get-concept-node`        | Concept context for questions             | knowledge-graph-service | EXISTS    | P0       |
| `find-prerequisites`      | Know what the student should already know | knowledge-graph-service | EXISTS    | P0       |
| `get-teaching-approach`   | Active pedagogy (Socratic, inquiry, etc.) | strategy-service        | NOT_BUILT | P0       |
| `get-metacognitive-stage` | How much scaffolding to provide           | knowledge-graph-service | EXISTS    | P0       |
| `get-student-model`       | Composite student knowledge model         | analytics-service       | NOT_BUILT | P0       |
| `generate-hint`           | Produce progressive hints                 | content-service         | PLANNED   | P1       |
| `record-dialogue-turn`    | Log tutoring interaction                  | session-service         | STUB      | P1       |

---

## VIII. Strategy Agent

Evaluates and recommends strategy loadouts.

| Tool                           | Description                 | Owner                   | Status    | Priority |
| ------------------------------ | --------------------------- | ----------------------- | --------- | -------- |
| `get-active-loadout`           | Current loadout             | strategy-service        | NOT_BUILT | P0       |
| `get-all-archetypes`           | List canonical archetypes   | strategy-service        | NOT_BUILT | P0       |
| `evaluate-loadout-performance` | Stats per loadout           | analytics-service       | NOT_BUILT | P0       |
| `update-loadout`               | Switch/modify loadout       | strategy-service        | NOT_BUILT | P0       |
| `get-session-history`          | Sessions to evaluate        | session-service         | EXISTS    | P1       |
| `get-metacognitive-stage`      | Inform strategy suggestions | knowledge-graph-service | EXISTS    | P1       |

---

## IX. Governance Agent

Content quality control and moderation.

| Tool                         | Description                       | Owner             | Status    | Priority |
| ---------------------------- | --------------------------------- | ----------------- | --------- | -------- |
| `flag-content`               | Flag card for review              | content-service   | PLANNED   | P1       |
| `review-card-quality`        | Score card against quality rubric | content-service   | PLANNED   | P1       |
| `get-card-by-id`             | Get card to review                | content-service   | BUILDING  | P0       |
| `update-card`                | Fix or annotate card              | content-service   | BUILDING  | P1       |
| `get-card-performance-stats` | Detect poorly performing cards    | analytics-service | NOT_BUILT | P1       |
| `search-similar-cards`       | Find near-duplicates              | vector-service    | NOT_BUILT | P2       |

---

## X. Taxonomy Curator Agent

Maintains and improves the knowledge graph structure.

| Tool                      | Description                         | Owner                   | Status    | Priority |
| ------------------------- | ----------------------------------- | ----------------------- | --------- | -------- |
| `get-canonical-structure` | Read CKG structure                  | knowledge-graph-service | EXISTS    | P0       |
| `propose-mutation`        | Propose reorganization              | knowledge-graph-service | EXISTS    | P0       |
| `get-aggregated-signals`  | Cross-PKG patterns                  | knowledge-graph-service | NOT_BUILT | P0       |
| `suggest-merges`          | Find duplicate/overlapping concepts | knowledge-graph-service | NOT_BUILT | P1       |
| `validate-dsl-proposal`   | Dry-run validation                  | knowledge-graph-service | NOT_BUILT | P1       |
| `get-structural-metrics`  | Community-wide graph health         | knowledge-graph-service | EXISTS    | P2       |

---

## Summary: Tool Count by Service

| Service                 | Total Tools | EXISTS | BUILDING | PLANNED | NOT_BUILT |
| ----------------------- | ----------- | ------ | -------- | ------- | --------- |
| content-service         | 10          | 0      | 7        | 2       | 1         |
| knowledge-graph-service | 21          | 18     | 0        | 0       | 3         |
| analytics-service       | 10          | 0      | 0        | 0       | 10        |
| metacognition-service   | 5           | 0      | 0        | 0       | 5         |
| session-service         | 5           | 3      | 0        | 0       | 0         |
| strategy-service        | 6           | 0      | 0        | 0       | 6         |
| scheduler-service       | 3           | 0      | 0        | 0       | 3         |
| vector-service          | 3           | 0      | 0        | 0       | 3         |
| ingestion-service       | 3           | 0      | 0        | 0       | 3         |
| hlr-sidecar             | 1           | 1      | 0        | 0       | 0         |
| user-service            | 1           | 1      | 0        | 0       | 0         |
| **TOTAL**               | **68**      | **23** | **7**    | **2**   | **34**    |

---

## Critical Path for Content Generation Agent

To generate truly contextual cards, the Content Generation Agent needs at
minimum these tools from services NOT yet built:

1. `get-concept-node` (knowledge-graph-service) — without this, cards are
   generated in a vacuum with no concept awareness ✅ **EXISTS**
2. `find-related-concepts` (knowledge-graph-service) — needed to create cards
   that connect concepts ✅ **EXISTS**
3. `get-active-loadout` (strategy-service) — needed to match card difficulty and
   type to learning strategy
4. `get-teaching-approach` (strategy-service) — needed to frame card content
   appropriately for the pedagogical method
5. `search-similar-cards` (vector-service) — needed to avoid duplicates
6. `get-recent-diagnoses` (metacognition-service) — needed to generate
   remediation cards

### Interim Strategy

With Phase 9 complete, agents now have full access to graph context via 18
knowledge-graph-service tools. Remaining gaps are strategy-service,
vector-service, and metacognition-service tools.

---

## Changelog

- 2026-03-02: Phase 9 — 18 knowledge-graph-service MCP tools implemented
  (kebab-case naming, JSON Schema validation, tool registry + discovery/execute
  endpoints). Updated tool names from old `kg_*` / `get-kg-*` conventions to
  standardized kebab-case. Reassigned metacognitive-stage and structural-metrics
  tools from metacognition-service to knowledge-graph-service (where the
  implementation lives).
- 2025-02-20: Initial registry created from architecture analysis
