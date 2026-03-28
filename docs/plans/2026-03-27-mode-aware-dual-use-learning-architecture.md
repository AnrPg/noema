# 2026-03-27 - Mode-Aware Dual-Use Learning Architecture Plan

## Objective

Implement a detailed, cross-layer architecture that allows Noema to support:

- `language_learning`
- `knowledge_gaining`

as equally important operating modes on top of one shared substrate.

## Rollout Status Snapshot

Current implementation progress from this conversation:

- Phase 1: shared mode substrate, user settings, node/card membership, shell
  toggle
- Phase 2: card creation, batch creation, and knowledge-map query propagation
- Phase 3: legacy card-query/session-entry compatibility paths updated
- Phase 4: mode-scoped analytics and legacy dashboard consumers updated
- Phase 5: mode-aware review reporting and PKG edge filtering
- Phase 6:
  - explicit node mastery summary read model
  - explicit scheduler progress summary read model
  - explicit scheduler card-focus summary read model
  - adoption in dashboard, reviews, goals, and session summary
  - agent-facing scheduler and graph tools for these read models

The remaining work is now less about basic propagation and more about richer
comparative, prescriptive, and campaign-style learner guidance.

This plan turns the approved architecture into an execution-ready work package
for shared packages, backend services, and frontend applications. It is intended
to be specific enough that implementation teams can move with minimal design
ambiguity.

## Primary Outputs

- `C:\Users\anr\Apps\noema\architecture.md`
- `C:\Users\anr\Apps\noema\module-graph.md`
- `C:\Users\anr\Apps\noema\docs\architecture\decisions\ADR-0053-mode-aware-dual-use-learning-core.md`
- `C:\Users\anr\Apps\noema\docs\architecture\decisions\ADR-0054-global-learning-mode-toggle-and-ux-lenses.md`
- `C:\Users\anr\Apps\noema\docs\architecture\decisions\ADR-0055-mode-scoped-scheduling-sessions-and-mastery.md`
- `C:\Users\anr\Apps\noema\docs\architecture\decisions\ADR-0056-domain-lensed-graph-semantics-and-multi-mode-membership.md`
- `C:\Users\anr\Apps\noema\docs\architecture\decisions\ADR-0057-mode-aware-batch-creation-and-card-generation.md`
- `C:\Users\anr\Apps\noema\docs\architecture\decisions\ADR-0058-mode-aware-migration-and-backward-compatibility.md`
- the detailed backend/frontend/guides docs referenced by those ADRs

## Problem to Solve

Noema currently has one shared learning architecture but lacks a first-class way
to distinguish different learning contexts that should not share progress.

The architecture must support:

- one graph substrate
- one content subsystem
- one scheduler/session substrate
- mode-specific semantics, UX lenses, scheduling, and analytics

without:

- duplicating whole services
- fragmenting the app into separate products
- corrupting schedule/mastery state across contexts

## Architecture Baseline

The implementation baseline is:

- shared identity substrate
- shared PKG/CKG substrate
- shared card archive
- shared scheduler/session stack
- explicit `LearningMode`
- global sticky frontend mode toggle
- multi-mode membership for nodes/cards
- mode-scoped progress-bearing state

## Work Breakdown by Subsystem

### Shared packages

Required changes:

- add `LearningMode` to shared types
- add validation schemas for `LearningMode`
- extend event payloads and contract packages so core write/read paths can carry
  mode explicitly
- update generated API-client transport types where mode is now part of the
  contract

Acceptance criteria:

- all relevant packages expose a stable `LearningMode`
- consumers can type mode-aware DTOs without ad hoc string unions
- event surfaces remain backward-compatible during rollout

### Knowledge Graph Service

Required changes:

- add `supportedModes` semantics to nodes
- add mode filters to graph reads and node queries
- define lens-aware relation visibility and ordering rules
- preserve current knowledge-mode behavior
- add additive language-specific graph semantics in a mode-lensed way

Acceptance criteria:

- node queries can filter/annotate by mode
- graph surfaces can serve both lenses from one substrate
- shared node identity remains compatible with separate mastery state elsewhere

### Content Service

Required changes:

- add `supportedModes` to card create/update/query contracts
- make import preview and execute flows mode-aware
- vary default graph-linking and card-generation strategies by mode
- preserve one batch infrastructure and one history/rollback mechanism

Acceptance criteria:

- batch preview reflects the chosen mode clearly
- cards can belong to one or both modes
- card identity remains shared while scheduler state remains external and
  mode-scoped

### Scheduler Service

Required changes:

- add `learningMode` to planning inputs and scheduling persistence
- key schedule state by `(userId, cardId, learningMode)`
- route policy/algorithm decisions by mode where needed
- maintain compatibility with current conceptual planning behavior

Acceptance criteria:

- the same card can have distinct schedule state by mode
- planner outputs are mode-aware
- omitted mode never accidentally reuses the wrong schedule state

### Session Service

Required changes:

- require `learningMode` in session creation contracts
- persist mode on sessions and attempts
- validate mode compatibility between session and included cards
- prevent silent cross-mode session mutation

Acceptance criteria:

- sessions are single-mode by default
- attempt history is queryable by mode
- same card in different modes can produce distinct attempt histories

### Analytics / Metacognition

Required changes:

- default reports to active mode
- store or compute mastery per mode
- ensure misconception/remediation pipelines are mode-aware where they depend on
  study history
- optionally support explicit comparative reporting later

Acceptance criteria:

- dashboard summaries do not merge mode state accidentally
- mastery and readiness are computed with mode scope
- reports can explain their scope clearly

### Frontend / Web App

Required changes:

- add global sticky mode toggle to authenticated shell
- persist active mode in local app state and user preferences
- propagate active mode into API calls and workflow defaults
- add mode-aware lenses in knowledge map
- add mode-aware defaults and review copy in card and batch flows
- show visible active-mode context on study/session screens

Acceptance criteria:

- changing the mode updates all relevant surfaces predictably
- reload preserves mode
- graph, cards, and sessions all reflect the same current context

## Batches

### Batch 1 - Contracts and architecture baseline

Owners:

- Architect
- Project Manager
- Docs Agent

Deliverables:

- root architecture docs
- ADR set
- detailed guides

Why first:

- every later implementation depends on these decisions

### Batch 2 - Shared packages and transport contracts

Owners:

- backend implementer
- docs agent

Deliverables:

- `LearningMode` shared type/schema additions
- event and DTO changes
- API-client contract updates

Dependency:

- Batch 1

### Batch 3 - Persistence and repository mode-scoping

Owners:

- backend implementer
- infra/migration agent
- docs agent

Deliverables:

- schedule/session/mastery persistence changes
- node/card mode membership support
- migration defaults and backfill scripts

Dependency:

- Batch 2

### Batch 4 - Graph and content behavior

Owners:

- backend implementer
- frontend implementer
- docs agent

Deliverables:

- graph lens APIs
- mode-aware content/batch preview behavior
- language and knowledge default strategies

Dependency:

- Batch 3

### Batch 5 - Scheduler, session, and analytics integration

Owners:

- backend implementer
- docs agent

Deliverables:

- mode-aware planning
- mode-aware session creation and attempt capture
- mode-aware reporting defaults

Dependency:

- Batch 3

### Batch 6 - Frontend shell and workflow rollout

Owners:

- frontend implementer
- docs agent

Deliverables:

- shell toggle
- UI propagation
- graph/card/session UX updates

Dependencies:

- Batch 4
- Batch 5

## Cross-Layer Rules

### Rule 1. No hidden mode inference in critical writes

Compatibility defaulting is allowed during migration, but critical write paths
must eventually carry explicit mode.

### Rule 2. No shared schedule/mastery by card/node identity alone

Any implementation shortcut that reuses memory state across modes is invalid.

### Rule 3. One session, one mode

Mixed-mode behavior must not appear accidentally through loose contracts.

### Rule 4. One graph substrate, filtered by lens

Frontend and backend must not introduce parallel graph systems to represent the
same user’s structure.

## Testing Scenarios

### Scenario 1. Shared card, separate schedule

- same card belongs to both modes
- user reviews it in `language_learning`
- user reviews it in `knowledge_gaining`
- schedule state remains separate

### Scenario 2. Shared node, separate mastery

- same node label participates in both modes
- mastery rises in one mode but not the other
- dashboards and graph overlays reflect the difference

### Scenario 3. Mode-aware batch preview

- same source payload is imported in both modes
- preview and default generation differ appropriately

### Scenario 4. Shell toggle persistence

- user switches mode
- navigates across graph/cards/session routes
- reloads the app
- context remains stable and visible

### Scenario 5. Legacy compatibility

- old-mode-less data is read correctly
- old clients remain functional
- defaults resolve to `knowledge_gaining`

## Rollout Notes

### Phase-safe order

1. ship shared contract additions
2. ship persistence support
3. backfill legacy data
4. ship frontend toggle and app-level propagation
5. tighten write-path enforcement
6. add richer mode-specific graph and batch behavior

### Avoided shortcuts

- no “just use tags/domains instead of mode”
- no “duplicate cards per mode to keep it simple”
- no “separate language graph implementation”
- no “shared schedule until later”

## References

- `architecture.md`
- `module-graph.md`
- `docs/backend/mode-aware-learning-core.md`
- `docs/backend/mode-aware-knowledge-graph.md`
- `docs/backend/mode-aware-content-and-batch-creation.md`
- `docs/backend/mode-aware-scheduler-and-session.md`
- `docs/frontend/learning-mode-toggle.md`
- `docs/frontend/mode-aware-knowledge-map.md`
- `docs/frontend/mode-aware-card-and-batch-flows.md`
- `docs/guides/mode-aware-data-migration.md`
