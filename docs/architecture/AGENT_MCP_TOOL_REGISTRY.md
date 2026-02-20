# Agent MCP Tool Dependency Registry

**Status:** Living Document **Last Updated:** 2025-02-20 **Purpose:** Track all
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

### B. Knowledge Graph Tools (Not Built)

| Tool                        | Description                                                          | Owner                   | Status    | Priority |
| --------------------------- | -------------------------------------------------------------------- | ----------------------- | --------- | -------- |
| `get-kg-node-context`       | Get a PKG/CKG node with its immediate neighbors, edges, and metadata | knowledge-graph-service | NOT_BUILT | P0       |
| `find-related-concepts`     | Find concepts related to a topic via edge traversal                  | knowledge-graph-service | NOT_BUILT | P0       |
| `get-concept-prerequisites` | Get prerequisite chain for a concept                                 | knowledge-graph-service | NOT_BUILT | P0       |
| `get-concept-descendants`   | Get all concepts downstream of a node                                | knowledge-graph-service | NOT_BUILT | P1       |
| `get-gap-analysis`          | Find concepts with no/few cards                                      | knowledge-graph-service | NOT_BUILT | P1       |
| `get-confusable-concepts`   | Get concepts frequently confused with target                         | knowledge-graph-service | NOT_BUILT | P1       |
| `get-boundary-conditions`   | Get edge cases and scope limits for a concept                        | knowledge-graph-service | NOT_BUILT | P2       |
| `get-concept-depth`         | Get depth/abstraction level of a concept                             | knowledge-graph-service | NOT_BUILT | P2       |
| `get-sibling-concepts`      | Get concepts at the same level under same parent                     | knowledge-graph-service | NOT_BUILT | P2       |

### C. Strategy & Metacognition Tools (Not Built)

| Tool                      | Description                                                                | Owner                 | Status    | Priority |
| ------------------------- | -------------------------------------------------------------------------- | --------------------- | --------- | -------- |
| `get-active-loadout`      | Get user's current strategy loadout (6 policy dimensions)                  | strategy-service      | NOT_BUILT | P1       |
| `get-loadout-archetype`   | Get canonical archetype (Fast Recall, Deep Understanding, etc.)            | strategy-service      | NOT_BUILT | P1       |
| `get-teaching-approach`   | Get active teaching approach (Socratic, inquiry-based, etc.)               | strategy-service      | NOT_BUILT | P1       |
| `get-metacognitive-stage` | Get user's structural metacognition stage (1-4) per graph region           | metacognition-service | NOT_BUILT | P1       |
| `get-structural-metrics`  | Get user's AD, DCG, SLI, SCE, ULS, TBS, SDF, SSE, SAA metrics              | metacognition-service | NOT_BUILT | P2       |
| `get-structural-pressure` | Get current pressure settings (traversal, boundary, abstraction, strategy) | metacognition-service | NOT_BUILT | P2       |

### D. Mental Debugger / Diagnostic Tools (Not Built)

| Tool                       | Description                                              | Owner                   | Status    | Priority |
| -------------------------- | -------------------------------------------------------- | ----------------------- | --------- | -------- |
| `get-recent-diagnoses`     | Get latest diagnostic results for a user                 | metacognition-service   | NOT_BUILT | P1       |
| `get-failure-patterns`     | Get recurring failure families (10 families) per user    | metacognition-service   | NOT_BUILT | P1       |
| `get-active-patch-plans`   | Get outstanding remediation plans                        | metacognition-service   | NOT_BUILT | P1       |
| `get-misconception-states` | Get active misconception nodes from user's PKG           | knowledge-graph-service | NOT_BUILT | P1       |
| `get-remediation-needs`    | Get list of concepts needing remediation cards (by type) | metacognition-service   | NOT_BUILT | P2       |

### E. Session & Performance Tools (Not Built)

| Tool                           | Description                                         | Owner             | Status    | Priority |
| ------------------------------ | --------------------------------------------------- | ----------------- | --------- | -------- |
| `get-user-performance-summary` | Overall accuracy, retention, calibration            | analytics-service | NOT_BUILT | P1       |
| `get-concept-mastery`          | Mastery level per concept/node                      | analytics-service | NOT_BUILT | P1       |
| `get-card-performance-stats`   | Per-card accuracy, response time, attempt count     | analytics-service | NOT_BUILT | P1       |
| `get-session-history`          | Recent session summaries (mode, duration, outcomes) | session-service   | NOT_BUILT | P2       |
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

| Tool                        | Description                            | Owner                   | Status    | Priority |
| --------------------------- | -------------------------------------- | ----------------------- | --------- | -------- |
| `query-cards`               | Execute DeckQuery to resolve card set  | content-service         | BUILDING  | P0       |
| `get-card-by-id`            | Retrieve specific card                 | content-service         | BUILDING  | P0       |
| `get-srs-schedule`          | Get due queue and scheduling params    | scheduler-service       | NOT_BUILT | P0       |
| `get-kg-node-context`       | Get concept context for card selection | knowledge-graph-service | NOT_BUILT | P0       |
| `get-concept-prerequisites` | Check prerequisite readiness           | knowledge-graph-service | NOT_BUILT | P0       |
| `get-active-loadout`        | Get strategy loadout for session mode  | strategy-service        | NOT_BUILT | P0       |
| `get-metacognitive-stage`   | Adapt card selection to user's stage   | metacognition-service   | NOT_BUILT | P1       |
| `get-concept-mastery`       | Mastery levels to inform selection     | analytics-service       | NOT_BUILT | P1       |
| `get-calibration-data`      | Confidence calibration for card choice | analytics-service       | NOT_BUILT | P2       |
| `record-attempt`            | Record card review result              | session-service         | NOT_BUILT | P0       |
| `update-card-scheduling`    | Update SRS params after review         | scheduler-service       | NOT_BUILT | P0       |
| `get-teaching-approach`     | Current pedagogical method             | strategy-service        | NOT_BUILT | P1       |

---

## III. Diagnostic Agent (Mental Debugger)

Analyzes 7-frame thinking traces, classifies failures, generates patch plans.

| Tool                         | Description                                 | Owner                    | Status    | Priority |
| ---------------------------- | ------------------------------------------- | ------------------------ | --------- | -------- |
| `get-attempt-history`        | Get recent attempts with thinking traces    | session-service          | NOT_BUILT | P0       |
| `get-thinking-trace`         | Get full 7-frame trace for an attempt       | session-service          | NOT_BUILT | P0       |
| `get-card-by-id`             | Get card content for analysis               | content-service          | BUILDING  | P0       |
| `get-kg-node-context`        | Get concept context for the card            | knowledge-graph-service  | NOT_BUILT | P0       |
| `get-confusable-concepts`    | Get confusable siblings                     | knowledge-graph-service  | NOT_BUILT | P0       |
| `get-failure-patterns`       | Get user's historical failure families      | metacognition-service    | NOT_BUILT | P0       |
| `create-diagnosis`           | Persist diagnosis result                    | metacognition-service    | NOT_BUILT | P0       |
| `create-patch-plan`          | Create remediation plan                     | metacognition-service    | NOT_BUILT | P0       |
| `get-card-performance-stats` | Per-card stats for pattern detection        | analytics-service        | NOT_BUILT | P1       |
| `get-structural-metrics`     | Graph structural metrics                    | metacognition-service    | NOT_BUILT | P1       |
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

| Tool                     | Description                              | Owner                   | Status    | Priority |
| ------------------------ | ---------------------------------------- | ----------------------- | --------- | -------- |
| `create-pkg-node`        | Add node to user's PKG                   | knowledge-graph-service | NOT_BUILT | P0       |
| `create-pkg-edge`        | Add edge to user's PKG                   | knowledge-graph-service | NOT_BUILT | P0       |
| `update-pkg-node`        | Update PKG node properties               | knowledge-graph-service | NOT_BUILT | P0       |
| `delete-pkg-node`        | Remove PKG node                          | knowledge-graph-service | NOT_BUILT | P1       |
| `propose-ckg-mutation`   | Submit CKG mutation DSL proposal         | knowledge-graph-service | NOT_BUILT | P0       |
| `get-ckg-node-context`   | Read CKG context for proposal            | knowledge-graph-service | NOT_BUILT | P0       |
| `validate-dsl-proposal`  | Dry-run DSL validation (syntax + guards) | knowledge-graph-service | NOT_BUILT | P1       |
| `merge-pkg-nodes`        | Merge duplicate nodes                    | knowledge-graph-service | NOT_BUILT | P2       |
| `get-aggregated-signals` | PKG→CKG aggregation data                 | knowledge-graph-service | NOT_BUILT | P1       |

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
| `get-kg-node-context`  | Place new content in graph context      | knowledge-graph-service | NOT_BUILT | P1       |

---

## VII. Socratic Tutor Agent

Conducts dialogue-based learning sessions.

| Tool                        | Description                               | Owner                   | Status    | Priority |
| --------------------------- | ----------------------------------------- | ----------------------- | --------- | -------- |
| `get-card-by-id`            | Get card for dialogue context             | content-service         | BUILDING  | P0       |
| `get-kg-node-context`       | Concept context for questions             | knowledge-graph-service | NOT_BUILT | P0       |
| `get-concept-prerequisites` | Know what the student should already know | knowledge-graph-service | NOT_BUILT | P0       |
| `get-teaching-approach`     | Active pedagogy (Socratic, inquiry, etc.) | strategy-service        | NOT_BUILT | P0       |
| `get-metacognitive-stage`   | How much scaffolding to provide           | metacognition-service   | NOT_BUILT | P0       |
| `get-student-model`         | Composite student knowledge model         | analytics-service       | NOT_BUILT | P0       |
| `generate-hint`             | Produce progressive hints                 | content-service         | PLANNED   | P1       |
| `record-dialogue-turn`      | Log tutoring interaction                  | session-service         | NOT_BUILT | P1       |

---

## VIII. Strategy Agent

Evaluates and recommends strategy loadouts.

| Tool                           | Description                 | Owner                 | Status    | Priority |
| ------------------------------ | --------------------------- | --------------------- | --------- | -------- |
| `get-active-loadout`           | Current loadout             | strategy-service      | NOT_BUILT | P0       |
| `get-all-archetypes`           | List canonical archetypes   | strategy-service      | NOT_BUILT | P0       |
| `evaluate-loadout-performance` | Stats per loadout           | analytics-service     | NOT_BUILT | P0       |
| `update-loadout`               | Switch/modify loadout       | strategy-service      | NOT_BUILT | P0       |
| `get-session-history`          | Sessions to evaluate        | session-service       | NOT_BUILT | P1       |
| `get-metacognitive-stage`      | Inform strategy suggestions | metacognition-service | NOT_BUILT | P1       |

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

| Tool                     | Description                         | Owner                   | Status    | Priority |
| ------------------------ | ----------------------------------- | ----------------------- | --------- | -------- |
| `get-ckg-node-context`   | Read CKG structure                  | knowledge-graph-service | NOT_BUILT | P0       |
| `propose-ckg-mutation`   | Propose reorganization              | knowledge-graph-service | NOT_BUILT | P0       |
| `get-aggregated-signals` | Cross-PKG patterns                  | knowledge-graph-service | NOT_BUILT | P0       |
| `suggest-merges`         | Find duplicate/overlapping concepts | knowledge-graph-service | NOT_BUILT | P1       |
| `validate-dsl-proposal`  | Dry-run validation                  | knowledge-graph-service | NOT_BUILT | P1       |
| `get-structural-metrics` | Community-wide graph health         | metacognition-service   | NOT_BUILT | P2       |

---

## Summary: Tool Count by Service

| Service                 | Total Tools | EXISTS | BUILDING | PLANNED | NOT_BUILT |
| ----------------------- | ----------- | ------ | -------- | ------- | --------- |
| content-service         | 10          | 0      | 7        | 2       | 1         |
| knowledge-graph-service | 19          | 0      | 0        | 0       | 19        |
| analytics-service       | 10          | 0      | 0        | 0       | 10        |
| metacognition-service   | 9           | 0      | 0        | 0       | 9         |
| session-service         | 5           | 0      | 0        | 0       | 5         |
| strategy-service        | 6           | 0      | 0        | 0       | 6         |
| scheduler-service       | 3           | 0      | 0        | 0       | 3         |
| vector-service          | 3           | 0      | 0        | 0       | 3         |
| ingestion-service       | 3           | 0      | 0        | 0       | 3         |
| hlr-sidecar             | 1           | 1      | 0        | 0       | 0         |
| user-service            | 1           | 1      | 0        | 0       | 0         |
| **TOTAL**               | **70**      | **2**  | **7**    | **2**   | **59**    |

---

## Critical Path for Content Generation Agent

To generate truly contextual cards, the Content Generation Agent needs at
minimum these tools from services NOT yet built:

1. `get-kg-node-context` (knowledge-graph-service) — without this, cards are
   generated in a vacuum with no concept awareness
2. `find-related-concepts` (knowledge-graph-service) — needed to create cards
   that connect concepts
3. `get-active-loadout` (strategy-service) — needed to match card difficulty and
   type to learning strategy
4. `get-teaching-approach` (strategy-service) — needed to frame card content
   appropriately for the pedagogical method
5. `search-similar-cards` (vector-service) — needed to avoid duplicates
6. `get-recent-diagnoses` (metacognition-service) — needed to generate
   remediation cards

### Interim Strategy

Until these services exist, the Content Generation Agent can:

- Generate cards from **topic strings** (no graph awareness)
- Use **card type + difficulty** as primary inputs
- Rely on **Zod schema validation** to ensure structural correctness
- Search existing cards via **text query** (content-service) for basic dedup
- Accept optional **context blobs** from the orchestration layer

As each service comes online, the agent gains richer context and produces better
cards. The contract should define all tool interfaces now (as stubs) so the
agent code doesn't need restructuring later.

---

## Changelog

- 2025-02-20: Initial registry created from architecture analysis
