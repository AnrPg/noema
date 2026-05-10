# Agent MCP Tool Registry

**Status:** Living Document  
**Last Updated:** 2026-05-04  
**Purpose:** Track the current MCP tool surface for the realigned Noema
architecture, grouped by source-of-truth service ownership rather than legacy
agent names.

---

## Realignment Baseline

This registry follows the 2026-05-01 realignment baseline in
[`architecture.md`](C:/Users/anr/Apps/noema/architecture.md).

The governing runtime vocabulary is:

- `Step` is the atomic learner-visible unit.
- `LessonPlan` is the session-owned plan boundary.
- `Evaluation` is the canonical metacognition fact.
- `Trigger` is the canonical adaptive signal.
- Concept state is learner-facing `stable` or `unstable`, not "mastered".
- `EpistemicMode` replaces `TeachingApproach`.
- `Pedagogy Guardian` is the independent validation gate.

The old standalone "Learning Agent", broad "Governance Agent", and card-first
runtime framing are no longer the primary way to understand tool ownership.

---

## How to Read This Document

- **Status**: `EXISTS` | `BUILDING` | `STUB` | `NOT_BUILT` | `PLANNED`
- **Priority**: `P0` blocks the current realigned loop, `P1` is needed soon,
  `P2` is later/future-facing
- **Owner**: the service or bounded context that owns the fact surfaced by the
  tool
- **Primary Consumers**: runtime services, agents, or learner/admin surfaces
  that depend on the tool

Tool ownership follows the architecture rule that facts have one owner. If a
tool appears useful in multiple places, the owner listed here is still the
canonical source.

---

## Runtime Loop Summary

The closed loop this registry supports is:

1. `session-service` creates and advances a `LessonPlan` and `Step` queue.
2. The learner answers a `Step` and provides a three-choice self-rating.
3. `metacognition-service` records the canonical `Evaluation` and emits
   `Trigger` facts.
4. `scheduler-service` updates concept-first schedule state from Evaluations.
5. `knowledge-graph-service` projects learner-facing concept stability.
6. Strategy inside `session-service` commits the minimum-sufficient replan.
7. `pedagogy-guardian-service` validates plans, Steps, replans, and generated
   variants.

---

## I. Session and LessonPlan Tools

`session-service` owns the learner runtime unit: Session, LessonPlan, Step,
Activity, and Step queue state.

| Tool                   | Description                                                   | Owner           | Status   | Priority | Primary Consumers       |
| ---------------------- | ------------------------------------------------------------- | --------------- | -------- | -------- | ----------------------- |
| `create-session`       | Create a learner session in planning state                    | session-service | EXISTS   | P0       | web app, agents         |
| `create-lesson-plan`   | Create and activate the session's LessonPlan                  | session-service | EXISTS   | P0       | web app, agents         |
| `add-lesson-plan-goal` | Add a goal to a LessonPlan                                    | session-service | EXISTS   | P1       | web app, agents         |
| `list-sessions`        | List learner sessions                                           | session-service | EXISTS   | P0       | web app, agents         |
| `get-session`          | Fetch one learner session                                       | session-service | EXISTS   | P0       | web app, agents         |
| `get-next-step`        | Return canonical `{ session, lessonPlan, nextStep }` snapshot   | session-service | EXISTS   | P0       | web app                 |
| `get-step-loop-snapshot` | Inspect the active step-loop snapshot                         | session-service | EXISTS   | P0       | web app, agents         |
| `present-step`         | Mark a Step presented                                         | session-service | EXISTS   | P0       | web app                 |
| `answer-step`          | Record learner Step answer and enqueue evaluation             | session-service | EXISTS   | P0       | web app                 |
| `skip-step`            | Skip a Step in the queue                                      | session-service | EXISTS   | P1       | web app                 |
| `complete-session`     | Complete the active session                                   | session-service | EXISTS   | P1       | web app                 |

### Notes

- Session tools are Step-first. They are not card-attempt tools.
- `record-attempt` is legacy vocabulary and should not be used for new runtime
  contracts.

---

## II. Metacognition and Evaluation Tools

`metacognition-service` owns canonical Evaluation facts, reasoning scoring, and
Trigger emission.

| Tool                     | Description                                                                          | Owner                 | Status    | Priority | Primary Consumers                                 |
| ------------------------ | ------------------------------------------------------------------------------------ | --------------------- | --------- | -------- | ------------------------------------------------- |
| `record-evaluation`      | Compute and persist canonical Evaluation for a Step                                  | metacognition-service | EXISTS    | P0       | session-service, scheduler-service, KG, analytics |
| `get-thinking-trace`     | Return trace summary or read model for a Step                                        | metacognition-service | STUB      | P0       | web app, diagnostic surfaces                      |
| `get-reasoning-average`  | Return persisted reasoning average for a concept and study mode                      | metacognition-service | EXISTS    | P1       | web app, agents                                   |
| `get-calibration-data`   | Return confidence-signal and calibration evidence                                    | metacognition-service | NOT_BUILT | P1       | calibration coach, analytics                      |
| `get-failure-patterns`   | Return recurring learner failure families                                            | metacognition-service | NOT_BUILT | P1       | diagnostic surfaces, agents                       |
| `get-recent-diagnoses`   | Return latest diagnosis summaries derived from Evaluation/Trigger history            | metacognition-service | NOT_BUILT | P1       | diagnostic surfaces                               |
| `get-active-patch-plans` | Return outstanding remediation plans if this becomes a durable metacognition concern | metacognition-service | NOT_BUILT | P2       | agents                                            |

### Notes

- `Evaluation` is canonical here and must not be duplicated elsewhere.
- Three-choice self-rating is evidence, not the primary score.
- Any future diagnostic surfaces should explain metacognition facts rather than
  owning independent truth.

---

## III. Scheduler and Readiness Tools

`scheduler-service` owns concept-first schedule state and readiness logic.

| Tool                         | Description                                                            | Owner             | Status    | Priority | Primary Consumers                |
| ---------------------------- | ---------------------------------------------------------------------- | ----------------- | --------- | -------- | -------------------------------- |
| `get-concept-schedule`       | Return schedule state for one concept                                  | scheduler-service | EXISTS    | P0       | web app, session-service, agents |
| `get-due-concepts`           | Return learner-scoped due concept queue                                | scheduler-service | EXISTS    | P0       | web app, session-service         |
| `get-transformation-history` | Return concept transformation history for repetition control           | scheduler-service | EXISTS    | P0       | session-service, agents          |
| `get-srs-schedule`           | Legacy card-first naming; do not use for new contracts                 | scheduler-service | NOT_BUILT | P2       | legacy only                      |
| `update-card-scheduling`     | Legacy card-centric scheduling path retired by concept-first scheduler | scheduler-service | NOT_BUILT | P2       | legacy only                      |

### Notes

- Scheduler inputs are Evaluation-shaped, not card-review-shaped.
- New tools should expose concept readiness, backlog, and transformation
  constraints rather than card due-state.

---

## IV. Knowledge Graph and Stability Tools

`knowledge-graph-service` owns PKG/CKG graph state, prerequisite reads, and
learner-facing concept stability projections.

| Tool                         | Description                                                                                      | Owner                   | Status    | Priority | Primary Consumers                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------- | --------- | -------- | ------------------------------------ |
| `get-concept-node`           | Get PKG concept node with details and neighborhood hints                                         | knowledge-graph-service | EXISTS    | P0       | agents, web app                      |
| `get-subgraph`               | Return bounded graph neighborhood around a node                                                  | knowledge-graph-service | EXISTS    | P0       | web app, agents                      |
| `find-prerequisites`         | Return layered prerequisite chain                                                                | knowledge-graph-service | EXISTS    | P0       | session-service, agents              |
| `find-related-concepts`      | Return ranked related or confusable concepts                                                     | knowledge-graph-service | EXISTS    | P0       | agents, web app                      |
| `add-concept-node`           | Add a PKG node                                                                                   | knowledge-graph-service | EXISTS    | P0       | admin tools, agents                  |
| `add-edge`                   | Add a PKG edge under graph policies                                                              | knowledge-graph-service | EXISTS    | P0       | admin tools, agents                  |
| `update-mastery`             | Legacy naming for PKG evidence updates; learner-facing contract should prefer stability language | knowledge-graph-service | EXISTS    | P2       | compatibility only                   |
| `remove-node`                | Soft-delete PKG node                                                                             | knowledge-graph-service | EXISTS    | P1       | admin tools                          |
| `remove-edge`                | Remove PKG edge                                                                                  | knowledge-graph-service | EXISTS    | P1       | admin tools                          |
| `get-canonical-structure`    | Return CKG domain structure                                                                      | knowledge-graph-service | EXISTS    | P0       | admin tools, agents                  |
| `propose-mutation`           | Submit CKG mutation DSL proposal                                                                 | knowledge-graph-service | EXISTS    | P0       | taxonomy workflows, ontology imports |
| `get-mutation-status`        | Return mutation proposal status                                                                  | knowledge-graph-service | EXISTS    | P1       | admin tools                          |
| `compute-structural-metrics` | Compute graph structural metrics                                                                 | knowledge-graph-service | EXISTS    | P0       | admin tools, agents                  |
| `get-structural-health`      | Return structural health report                                                                  | knowledge-graph-service | EXISTS    | P0       | admin tools, agents                  |
| `detect-misconceptions`      | Run misconception detection on learner graph                                                     | knowledge-graph-service | EXISTS    | P0       | learner/admin surfaces, agents       |
| `suggest-intervention`       | Suggest intervention strategy for detected misconception                                         | knowledge-graph-service | EXISTS    | P1       | agents                               |
| `get-metacognitive-stage`    | Return structural metacognitive stage for a graph region                                         | knowledge-graph-service | EXISTS    | P1       | learner/admin surfaces, agents       |
| `get-learning-path-context`  | Return combined graph, metric, misconception, and stage context                                  | knowledge-graph-service | EXISTS    | P0       | agents                               |
| `get-stability-summary`      | Return explicit learner-facing stable/unstable summary read model                                | knowledge-graph-service | EXISTS    | P0       | web app, agents                      |
| `get-concept-state-history`  | Return state-change history for stable/unstable projections                                      | knowledge-graph-service | BUILDING  | P1       | web app, analytics                   |
| `get-aggregated-signals`     | Return PKG to CKG aggregation evidence                                                           | knowledge-graph-service | NOT_BUILT | P1       | taxonomy workflows                   |
| `validate-dsl-proposal`      | Dry-run mutation validation                                                                      | knowledge-graph-service | NOT_BUILT | P1       | admin tools                          |

### Notes

- New learner-facing language should use `stable` and `unstable`.
- This service owns concept-state projection, not canonical Evaluation facts.

---

## V. Content, Variant, and Provenance Tools

`content-service` owns cards, templates, media, generated variants, provenance,
review state, and payload candidate retrieval for Step activities.

| Tool                      | Description                                                                          | Owner           | Status   | Priority | Primary Consumers           |
| ------------------------- | ------------------------------------------------------------------------------------ | --------------- | -------- | -------- | --------------------------- |
| `create-card`             | Create one card payload record                                                       | content-service | BUILDING | P1       | admin tools, agents         |
| `batch-create-cards`      | Create multiple cards atomically                                                     | content-service | BUILDING | P1       | admin tools, agents         |
| `validate-card-content`   | Validate card payload against schema                                                 | content-service | BUILDING | P1       | admin tools, agents         |
| `query-cards`             | Query candidate payloads for Step activity selection                                 | content-service | BUILDING | P0       | session-service, agents     |
| `get-card-by-id`          | Return card payload details                                                          | content-service | BUILDING | P1       | web app, agents             |
| `update-card`             | Update content metadata and review state                                             | content-service | BUILDING | P1       | admin tools                 |
| `change-card-state`       | Transition content lifecycle state                                                   | content-service | BUILDING | P1       | admin tools                 |
| `create-card-drafts`      | Generate or persist card drafts from source material                                 | content-service | BUILDING | P1       | ingestion-service, agents   |
| `generate-hint`           | Produce progressive hint payload                                                     | content-service | PLANNED  | P2       | tutoring/activity surfaces  |
| `get-generated-variant`   | Return generated activity variant with provenance and Guardian validation references | content-service | BUILDING | P0       | session-service, agents     |
| `list-generation-jobs`    | Return generation job history and status                                             | content-service | BUILDING | P1       | admin tools, agents         |
| `get-coverage-projection` | Return concept-card coverage projection                                              | content-service | BUILDING | P1       | curriculum/content planning |

### Notes

- Public content contracts should prefer `originMode`, `reviewState`,
  `anchoredCkgNodeIds`, and `anchoredPkgNodeIds`.
- Cards remain content payloads/templates, not the learner runtime unit.

---

## VI. Curriculum Tools

`curriculum-service` owns durable curricula, curriculum DAG versions, progress,
and session-slice context.

| Tool                          | Description                                                  | Owner              | Status   | Priority | Primary Consumers        |
| ----------------------------- | ------------------------------------------------------------ | ------------------ | -------- | -------- | ------------------------ |
| `list-curricula`              | Return learner curriculum vault list                         | curriculum-service | EXISTS   | P0       | web app                  |
| `get-curriculum-by-id`        | Return a curriculum by id                                   | curriculum-service | EXISTS   | P0       | web app, session-service |
| `get-active-version`          | Return active curriculum DAG version                        | curriculum-service | EXISTS   | P0       | web app, session-service |
| `get-frontier`                | Return deterministic next frontier from progress            | curriculum-service | EXISTS   | P0       | web app, agents          |
| `get-session-slice`           | Return curriculum slice for LessonPlan generation            | curriculum-service | EXISTS   | P0       | session-service, agents  |
| `get-progress`                | Return curriculum progress records                           | curriculum-service | EXISTS   | P0       | web app, agents          |
| `list-revision-proposals`     | Return stored curriculum revision proposals                  | curriculum-service | EXISTS   | P1       | agents, admin tools      |
| `get-realignment-evidence`    | Return realignment evidence linked to a curriculum           | curriculum-service | EXISTS   | P1       | agents, admin tools      |

### Notes

- Curriculum DAGs are separate from PKG/CKG.
- Learner progress is curriculum-scoped and does not regress simply because
  retention later decays.

---

## VII. Pedagogy Guardian Tools

`pedagogy-guardian-service` is the independent validation gate for realigned
learning artifacts.

| Tool                         | Description                                                             | Owner                     | Status | Priority | Primary Consumers                |
| ---------------------------- | ----------------------------------------------------------------------- | ------------------------- | ------ | -------- | -------------------------------- |
| `validate-lesson-plan`       | Validate LessonPlan structure and pedagogical integrity                 | pedagogy-guardian-service | EXISTS | P0       | session-service, agents          |
| `validate-step`              | Validate Step structure and repair-step minimum change                  | pedagogy-guardian-service | EXISTS | P0       | session-service, agents          |
| `validate-activity`          | Validate activity payload shape and source compatibility                | pedagogy-guardian-service | EXISTS | P0       | session-service, content-service |
| `validate-replan`            | Validate minimum-sufficient replan proposal                             | pedagogy-guardian-service | EXISTS | P0       | session-service                  |
| `validate-generated-variant` | Validate generated instructional variant before persistence or exposure | pedagogy-guardian-service | EXISTS | P0       | content-service, agents          |

### Notes

- Guardian validates pedagogical artifacts but does not own content provenance,
  curriculum state, graph state, scheduling, or Evaluation truth.

---

## VIII. Ingestion and Vector Tools

These services support document-derived curriculum/content flows and RAG
grounding.

### A. Ingestion

| Tool                  | Description                                | Owner             | Status    | Priority | Primary Consumers   |
| --------------------- | ------------------------------------------ | ----------------- | --------- | -------- | ------------------- |
| `process-document`    | Parse uploaded document into normalized IR | ingestion-service | NOT_BUILT | P0       | admin tools, agents |
| `get-source-material` | Return original source material            | ingestion-service | NOT_BUILT | P2       | agents              |
| `get-source-context`  | Return surrounding source chunk context    | ingestion-service | NOT_BUILT | P2       | agents              |
| `get-ingestion-job`   | Return ingestion job status and artifacts  | ingestion-service | BUILDING  | P1       | admin tools         |

### B. Vector

| Tool                       | Description                                   | Owner          | Status    | Priority | Primary Consumers                          |
| -------------------------- | --------------------------------------------- | -------------- | --------- | -------- | ------------------------------------------ |
| `search-similar-cards`     | Semantic duplicate or neighbor search         | vector-service | NOT_BUILT | P1       | content-service, agents                    |
| `embed-content`            | Generate embeddings for content or chunks     | vector-service | NOT_BUILT | P2       | ingestion-service, content-service         |
| `retrieve-document-chunks` | Return vector-grounded chunks for RAG support | vector-service | BUILDING  | P1       | ingestion-service, content-service, agents |

---

## IX. Analytics and Gamification Tools

These are downstream projections and must not redefine source-of-truth facts.

### A. Analytics

| Tool                           | Description                                                                  | Owner             | Status    | Priority | Primary Consumers      |
| ------------------------------ | ---------------------------------------------------------------------------- | ----------------- | --------- | -------- | ---------------------- |
| `get-user-performance-summary` | Return learner accuracy, retention, and calibration summary                  | analytics-service | NOT_BUILT | P1       | learner/admin surfaces |
| `get-concept-mastery`          | Legacy reporting name; should converge toward stability-oriented read models | analytics-service | NOT_BUILT | P2       | legacy dashboards      |
| `get-card-performance-stats`   | Return per-card performance summary                                          | analytics-service | NOT_BUILT | P1       | admin tools            |
| `get-learning-velocity`        | Return concept acquisition velocity                                          | analytics-service | NOT_BUILT | P2       | learner/admin surfaces |
| `get-student-model`            | Return composite learner model for tutoring or planning                      | analytics-service | NOT_BUILT | P1       | agents                 |
| `evaluate-loadout-performance` | Legacy future-facing naming retained only for transitional planning docs     | analytics-service | NOT_BUILT | P2       | legacy/future planning |

### B. Gamification

| Tool                         | Description                                        | Owner                | Status   | Priority | Primary Consumers |
| ---------------------------- | -------------------------------------------------- | -------------------- | -------- | -------- | ----------------- |
| `get-gamification-summary`   | Return derived XP, streak, badge, and tier summary | gamification-service | BUILDING | P1       | web app           |
| `get-memory-integrity-score` | Return derived Memory Integrity Score projection   | gamification-service | BUILDING | P1       | web app           |

### Notes

- Gamification is a derived projection and must never become the owner of
  learning truth.

---

## X. User and Preference Tools

| Tool                    | Description                                   | Owner        | Status   | Priority | Primary Consumers |
| ----------------------- | --------------------------------------------- | ------------ | -------- | -------- | ----------------- |
| `get-user-preferences`  | Return learner preferences and shell defaults | user-service | EXISTS   | P1       | web app, agents   |
| `get-active-study-mode` | Return sticky shell-level active study mode   | user-service | BUILDING | P1       | web app           |
| `set-active-study-mode` | Persist shell-level active study mode         | user-service | BUILDING | P1       | web app           |

### Notes

- Active study mode is still separate from `EpistemicMode`.
- Preference tools should not be framed as runtime strategy ownership.

---

## XI. Explicitly Future or Unsettled Surfaces

These terms still appear in older plans but are not current runtime owners:

| Term / Tool Family                      | Current Position                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `strategy-service` loadout tools        | Future product/planning concept only; runtime Strategy lives inside `session-service`            |
| `get-active-loadout` / `update-loadout` | Keep out of critical-path runtime docs until a concrete durable owner exists                     |
| `get-teaching-approach`                 | Superseded by `EpistemicMode` language                                                           |
| standalone Learning Agent               | Superseded by Step-first session runtime plus agents                                             |
| broad Governance Agent                  | Split across Pedagogy Guardian, Watchtower, KG workflows, content review, and analytics/research |

`Watchtower` remains part of the architecture vocabulary for privacy,
intrusiveness, and audit surfacing, but it is not listed here as a tool-owning
service until concrete MCP contracts are documented.

---

## Critical Path for the Realigned Runtime

The minimum viable realigned tool path is:

1. `create-session`
2. `create-lesson-plan`
3. `validate-lesson-plan`
4. `get-next-step`
5. `present-step`
6. `answer-step`
7. `record-evaluation`
8. `get-concept-schedule`
9. `get-stability-summary`
10. strategy inside `session-service` commits the minimum-sufficient replan
11. `validate-replan`

If any of those surfaces are missing or misowned, the closed loop is incomplete.

---

## Legacy Vocabulary to Retire

The following names may still exist for compatibility, but they should not be
used as the main architecture language in new docs or contracts:

- `TeachingApproach`
- `mastery` / `mastered` as learner-facing canonical state
- `record-attempt` as the primary runtime unit
- `update-card-scheduling`
- standalone `Learning Agent`
- broad `Governance Agent`
- strategy `loadout` as if it already owns runtime replanning

Where compatibility is unavoidable, annotate the legacy term and point to the
realigned replacement.

---

## Changelog

- 2026-05-04: Rewrote the registry around the 2026-05-01 realignment baseline.
  Replaced legacy agent-centered framing with service-owned tool surfaces for
  Step, LessonPlan, Evaluation, Trigger, stability, Guardian, provenance, and
  curriculum flows. Demoted legacy terminology to an explicit retirement
  appendix.
- 2026-03-02: Phase 9 knowledge-graph MCP tool expansion and initial realignment
  notes.
- 2025-02-20: Initial registry created from architecture analysis.
