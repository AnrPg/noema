# Changelog

## 2026-05-02 - Realignment Batch 10 Step-Focused Web Cutover

- accepted ADR-035 for the concept-oriented, Step-focused learner web cutover
- added reusable three-choice self-rating controls plus a learner-visible
  seven-frame trace builder and evaluation summary on the active session page
- updated dashboard vitals to show concept stability and reasoning trend
- moved navigation, command palette, session setup, content list/detail,
  creation, and batch import copy from card-first language to concept payload
  language while preserving backend payload contracts
- added focused session-page coverage for Step rendering, self-rating, trace,
  and answer payload shape

## 2026-05-02 - Realignment Batch 9 Session Strategy Replanning

- accepted ADR-034 for keeping deterministic Strategy inside `session-service`
- added `domain/strategy` with trigger-to-intervention mapping,
  lowest-sufficient scope selection, loadout prompt modifiers, and
  Guardian-gated replan commits
- added `metacognition.trigger.fired` consumption in `session-service`
- added repository support for Strategy-owned Step insertion, StepQueueItem
  injection, and supersession bookkeeping
- covered failure repair insertion, prerequisite branch insertion, and full
  scope selection with focused tests

## 2026-05-02 - Realignment Batch 8 Pedagogy Guardian Service

- accepted ADR-033 for materializing the Pedagogy Guardian validation gate
- added `@noema/pedagogy-guardian-service` with Fastify REST, Prisma
  `GuardianValidation` persistence, health routes, and deterministic Batch 8
  validation rules
- wired `session-service` to call Guardian before LessonPlan activation and Step
  queueing
- wired `content-service` to call Guardian before storing generated activity
  variants
- expanded realignment validation events so Guardian can publish rejected
  Activity decisions

## 2026-05-02 - Realignment Batch 7 Knowledge Graph Stability Projection

- accepted ADR-032 for knowledge-graph-service owned, revocable concept
  stability projection
- added concept-state projection/history/evidence/inbox persistence and KG
  recomputation around FSRS stability plus recent reasoning evidence
- wired metacognition and scheduler event consumption to update KG stability,
  maintain Neo4j concept state, and emit concept-state flip events
- exposed concept state, state history, prerequisite gaps, and user stability
  summary through KG REST and `@noema/api-client`
- removed active source references to the legacy mastery-summary contract and
  refreshed active docs around stable/unstable vocabulary

## 2026-05-02 - Realignment Batch 6 Scheduler Concept-First Refactor

- accepted ADR-028 for the destructive scheduler-service concept-first cutover
- replaced card/cohort scheduler persistence with `ConceptScheduleState`,
  `ConceptEvaluationLog`, `ConceptCalibrationData`, and
  `ConceptTransformationHistory`
- added `metacognition.evaluation.recorded` consumption and
  `scheduler.concept_state.updated` emission
- replaced card-centric scheduler REST/tool surfaces with concept schedule, due
  concept, and transformation-history endpoints
- refactored FSRS/HLR and added SM-2/Leitner adapters over Evaluation-shaped
  inputs
- enriched Batch 5 metacognition events with optional `studyMode` and
  `transformation` metadata so scheduler can persist transformation history

## 2026-05-02 - Realignment Batch 5 Metacognition Service

- accepted ADR-027 for the metacognition Evaluation and Trigger loop
- added `@noema/metacognition-service` as a real workspace service with Fastify,
  Prisma, Redis event publishing, health routes, and Batch 5 REST endpoints
- added Evaluation, Trigger, and concept reasoning-average persistence
- implemented deterministic 7-frame trace scoring, reasoning-dominant signal
  combination, scheduler rating mapping, and trigger rules
- added focused tests for the Batch 5 acceptance cases and trigger routing

## 2026-05-02 - Realignment Batch 4 Session Service

- accepted ADR-026 for the Step-first session-service cutover
- replaced the legacy card-attempt/session-queue/cohort/streak Prisma model with
  LessonPlan, Goal, Step, Activity, StepQueueItem, and session lifecycle state
- added the destructive session-service migration and applied it to the local
  dev database
- replaced legacy attempt and card queue REST routes with the Batch 4 Step-loop
  endpoints
- added lifecycle transition event emission and focused coverage for session
  start -> minimal LessonPlan -> present Step -> answer Step -> EVALUATED

## 2026-05-01 - Realignment Batch 3 Content Service

- accepted ADR-019 for content-service as the Step Activity payload source
  boundary
- added card compatibility metadata, generated activity variant persistence, and
  candidate selection for cards/templates/generated variants
- exposed `POST /v1/activity-payload-candidates` through content-service and
  `@noema/api-client`
- moved transformation/default eligibility derivation into shared `@noema/types`
  helpers and made card creation reject explicit empty transformations while
  filling defaults from card type
- added `concepts.extracted` emission after import creates graph-linked cards
  and regenerated the content-service Prisma client

## 2026-05-01 - Realignment Batch 2 Eligibility Rules

- accepted ADR-018 for deterministic epistemic-mode eligibility and
  transformation selection
- replaced provisional mode groups with the full source-of-truth §5 mapping over
  all 30 epistemic modes
- added pure shared helpers for group selection, LRU mode selection,
  transformation cycling, reverse mode lookups, and card-type transformation
  defaults
- expanded `@noema/types` tests to cover every mode, every group, trigger
  routing priority, transformation cycling, scheduler-style history entries, and
  every card/remediation-card default transformation

## 2026-05-01 - Realignment Batch 1 Shared Contracts

- accepted ADR-017 for the shared Step-first vocabulary, DTO contracts, event
  contracts, and config defaults
- removed shared cohort/handshake event contracts from `@noema/events` while
  preserving service-local legacy types until the later deletion batches
- split learning-loop event constants into domain-specific event maps and added
  focused tests for validation vocabulary, learning-loop DTOs, event schemas,
  and realignment config defaults
- verified the five touched shared packages with package tests, typechecks, and
  builds; repo-level typecheck is still blocked by the pre-existing Batch 3
  content-service draft edits

## 2026-04-19 - Graph Maintenance Controls

- added admin CKG danger-zone controls for full canonical reset and
  source-targeted purge by stream identifiers such as `yago`, `esco`,
  `users_aggregation`, `agents`, and `admin_manual`
- extended `knowledge-graph-service` with dedicated PKG maintenance endpoints
  for batch node deletion and full personal graph reset
- made canonical cleanup provenance-aware so matching CKG nodes, edges, mutation
  rows, aggregation evidence, ontology-import artifacts, and cache entries are
  deleted together
- exposed learner-facing knowledge-map actions for deleting selected PKG nodes
  and wiping the full PKG with explicit confirmation text
- documented the new deletion model in frontend/backend docs and accepted
  `ADR-0063` for provenance-aware graph maintenance

## 2026-03-28 - Navbar Pomodoro Timer

- added a configurable pomodoro timer to the authenticated header beside the
  user dropdown so focus blocks stay visible across the app shell
- introduced an animated configuration dialog with presets, cadence controls,
  auto-start behavior, daily target guidance, and phase-specific instructions
- added a browser-native ambient soundscape picker for optional rain, cafe,
  deep-focus, and night-owl background audio
- extended `user-service` and `@noema/api-client` with durable
  `settings.pomodoro` persistence and response/update coverage
- added frontend and backend docs describing the new timer runtime and settings
  model

## 2026-03-28 - Mode-Aware Authoring and Guidance Rollout

- unified the authenticated shell and Settings page around one shared study-mode
  controller with centralized local-storage and settings hydration
- expanded card authoring and batch metadata review with a shared PKG/CKG node
  authoring panel, typo-tolerant search, canonical-node copy/upsert, local node
  creation, local edge editing, and structural analytics refresh
- added per-record `recordMetadata` overrides to the content import execution
  path so reviewed batch cards can keep independent metadata without losing
  import-time inference
- extended the knowledge graph stack with richer node payload aliases, full-text
  search support, canonical lookup pathways, and route/integration coverage for
  the new authoring behavior
- expanded the graph relation set with an initial language-edge pack and taught
  structural/metacognitive tooling to accept a `studyMode` lens
- improved scheduler and session behavior with timezone-aware day boundaries and
  richer ordered study-guidance recommendations that return card-specific
  follow-up targets
- refreshed architecture and frontend/backend docs to reflect the current
  rollout instead of treating it as purely aspirational

## 2026-03-26 - API-First Card Import Wizard

- added an API-first card import pipeline to `content-service` with preview and
  execute endpoints for multi-format imports
- exposed the same import workflow to agents through new content MCP tools for
  previewing and executing imports
- added service-side support for `JSON`, `JSONL`, `CSV`, `TSV`, `XLSX`, `TXT`,
  `Markdown`, `LaTeX`, and `Typst` source payloads
- rebuilt `/cards/batch` as a multi-step import wizard with file-type selection,
  format selection, explicit field mapping, workbook sheet switching, and shared
  defaults
- documented the new import architecture in ADR-008 plus frontend and backend
  import docs

## 2026-03-24 - Batch 1 - Ontology Imports Foundation

- added ontology-import architecture ADR and phased execution plan
- added Batch 1 task board, roadmap, and agent-comms planning artifacts
- introduced domain/application contracts for ontology import sources, runs,
  artifacts, checkpoints, and normalization handoff
- extended `@noema/api-client` with typed ontology-import DTOs, API methods, and
  React Query hooks
- added frontend-first admin ontology-import routes, components, and placeholder
  pilot data for YAGO, ESCO, and ConceptNet

## 2026-03-24 - Batch 2 - Ontology Import Persistence and Orchestration

- cleaned the pre-existing `apps/web-admin` typecheck blocker in the admin
  session detail page so the admin app is green again
- added Prisma persistence models for ontology sources, runs, artifacts,
  checkpoints, and parsed staging batches
- introduced admin ontology-import REST routes in `knowledge-graph-service` for
  list/create/start/cancel/retry/get workflows
- wired the admin imports pages to the real API client hooks while preserving
  graceful fallback states instead of 404s
- added a first local raw-artifact storage adapter stub and a manual Prisma
  migration for the ontology-import tables

## 2026-03-24 - Batch 2 Stabilization and Batch 3 YAGO Fetcher

- fixed the pre-existing `knowledge-graph-service` test failures by aligning the
  value-object, event-contract, and typestate expectations with the current
  domain implementation
- restored a fully green `knowledge-graph-service` validation path with lint,
  typecheck, and tests passing together
- added the first real ontology source adapter for YAGO bulk snapshot imports
- implemented immutable YAGO payload + manifest emission with release metadata,
  upstream URL tracking, and SHA-256 checksums
- added the first ESCO source adapter using the official ESCO web-service API
- implemented paged ESCO raw payload capture for occupations, skills, and
  qualifications with manifest provenance and per-page checksums
- added shared staged ontology/knowledge-graph contracts for concept, relation,
  alias, mapping, and provenance-aware parsed batches
- wired registered source fetchers into ontology import start-run orchestration
  so YAGO/ESCO/ConceptNet runs can execute real fetches end-to-end
- added the ConceptNet hybrid fetch adapter with explicit `full` and `targeted`
  fetch modes
- added the first shared parser layer plus YAGO/ESCO/ConceptNet parser adapters
- added parser-focused unit coverage for staged graph-record generation and
  parser service routing

## 2026-03-24 - Batch 4 Orchestration and Batch 5 Normalization Handoff

- wired ontology import runs to execute fetch -> parse -> normalize handoffs
  inside `knowledge-graph-service`
- added persisted `parsed_batch` and `normalized_batch` artifacts to the local
  ontology import storage flow
- added YAGO zip extraction support so fetched archives can feed the parser
  pipeline directly
- started the normalization layer with source-aware normalizers for YAGO, ESCO,
  and ConceptNet
- added mutation-preview generation so normalized concept candidates become
  mutation-ready `add_node` proposals while unresolved relation candidates stay
  deferred with explicit reasons
- added persisted `mutation_preview` artifacts plus run-detail API fields for
  normalized batch summaries and mutation-preview summaries
- updated the admin ontology-import run detail UI to surface parsed, normalized,
  and mutation-preview state without dropping back to placeholder copy

## 2026-03-24 - Batch 5 Review Queue Submission and Run Configuration Controls

- added ontology-import run configuration as persisted workflow state for source
  mode, language, and seed nodes
- wired mutation-preview submission from ontology import runs into the CKG
  review queue
- added canonical node resolution so resolvable concept candidates become
  `update_node` proposals and resolvable relation candidates can become real
  `add_edge` proposals
- added admin create-run controls for source version, source mode, ESCO
  language, and ConceptNet targeted seed nodes
- hardened ESCO and ConceptNet fetchers so legacy runs without configuration do
  not break fetch execution or tests

## 2026-03-24 - Batch 5 Mapping-Aware Review Flow

- linked ontology import runs to the admin CKG mutation queue with import-run
  filtering and mutation-detail back-links to the originating import workflow
- stamped ontology import mutation proposals with structured run/source metadata
  so the admin queue can detect and filter imported proposals without a new API
  contract
- strengthened canonical node resolution with IRI, alias, normalized-label, and
  mapping-aware matching
- taught the YAGO parser to emit mapping records for equivalence predicates such
  as `sameAs`, and expanded exact/close mappings symmetrically during
  normalization
- propagated exact/close mapping resolutions into mutation-preview generation so
  more deferred ontology relations can become real `add_edge` review proposals

## 2026-03-24 - Batch 5 Reviewer Triage and Import Submission Traceability

- persisted submitted mutation ids back onto ontology import runs so run detail
  can show exact reviewed mutations instead of only an import-run filter
- enriched the ESCO parser with explicit mapping extraction for source-native
  match fields and supported linked mapping references
- enriched the ConceptNet parser with explicit mapping extraction for
  `/r/ExternalURL` assertions
- grouped ontology-import proposals by import run inside the admin mutation
  queue so large import batches are easier to triage

## 2026-03-24 - Batch 5 Backend Queue Filtering and Mapping Propagation

- added backend-side mutation queue filtering by `importRunId` and optional
  import-run aggregation metadata in the CKG mutation list route
- wired the admin CKG mutation queue to use the backend import-run filter
  instead of narrowing only in the browser
- promoted trusted ESCO external-classification references into staged
  `close_match` mappings
- promoted trusted ConceptNet `/r/ExternalURL` targets into `close_match`
  mappings when they point at structured external knowledge bases
- expanded normalization so exact-match components close transitively and
  close-match links propagate across those exact components
- taught canonical node resolution to traverse those expanded mapping
  neighborhoods, improving edge proposal readiness for deferred ontology
  relations

## 2026-03-24 - Batch 6 Reviewer Bulk Triage Kickoff

- added a backend bulk-review workflow for ontology-import mutations with
  explicit `approve`, `reject`, and `request_revision` actions
- added a bulk review REST endpoint that supports both explicit mutation ids and
  import-run scoped selection
- wired `@noema/api-client` with bulk review DTOs, API helpers, and React Query
  mutation hooks
- added admin mutation-queue bulk selection controls for ontology-import
  proposals, including import-run group selection and shared review notes
- kept direct-review mutations outside the bulk selection path so the ontology
  import workflow remains distinct from manual review

## 2026-03-29 - Admin CKG Graph Edge Authoring

- added graph-native canonical edge authoring to the admin CKG browser so
  reviewers can choose a source node and right-click a target node to open a
  relation popup
- wired the popup into the existing `authoring-preview -> mutation proposal`
  flow, with allowed edge types active and blocked ones greyed out with
  guardrail reasons
- added pair-aware "existing relations" controls in the same popup so admins can
  submit edge removals from the selected node pair without leaving the graph

## 2026-03-24 - Batch 6 Merge Confidence and Conflict Policies

- added confidence scoring for normalized ontology mappings, including
  confidence bands and conflict flags
- taught canonical node resolution to block ambiguous matches and propagate only
  safer mapping-based resolutions
- stamped ontology-import mutation rationales with structured review metadata so
  admin reviewers can see confidence and conflict hints in the queue
- added future-ready OpenAlex and GeoNames mapping extractors to prepare the
  next source-adapter batch

## 2026-03-24 - Ontology Imports Health and Run Workspace Hardening

- added `GET /api/v1/ckg/imports/health` so the admin UI can detect degraded
  ontology-import capability before probing live source/run routes
- hardened ontology-import bootstrap so missing import tables no longer crash
  service startup during default-source registration
- turned the admin imports landing route into a proper import-run registry with
  source/status/version/mode filters and bulk start/cancel/retry actions
- added checkpoint and artifact viewers to ontology import run detail, alongside
  structured mutation-preview review metadata
- switched the admin imports fallback experience to explicit demo mode so seeded
  data no longer looks like live actionable data

## 2026-03-24 - Ontology Imports Operator Controls and Review Triage

- added live source-registry actions for register, enable/disable, and metadata
  sync workflows
- added an artifact-content API route plus admin raw-artifact preview/download
  support on import-run detail
- added two-run comparison to the admin import-run workspace for side-by-side
  status and batch-metric checks
- added mutation-queue confidence and conflict filters, inline import-run
  dashboard cards, and ready-only / conflicted-only bulk review shortcuts
- refined canonical node resolution to prefer namespace-aware and source-aware
  candidates before broader label heuristics

## 2026-03-24 - Ontology Imports Mature Operator UX

- replaced preset-only source onboarding with a full source registration form,
  while keeping OpenAlex and GeoNames preset loaders for faster setup
- added per-source management feedback for enable/disable and metadata-sync
  actions in the source registry
- turned the import-run workspace into a live monitor that auto-refreshes while
  active runs are still progressing
- expanded run detail with pipeline-progress status, quick artifact jumps, and
  mutation-preview candidate filters for ready, blocked, and conflicted items

## 2026-03-27 - Web Error Pages

- added a custom full-screen `404` route for the learner app with animated
  neural-graph visuals and recovery links back into Noema
- added shared runtime failure screens for both segment-level and root-level app
  errors, including a retry action and safe digest/message handling
- kept the effect dependency-free by implementing the motion layer with CSS and
  SVG instead of introducing a new animation package
- replaced the right-side incident visual with a cognitive recovery panel that
  offers retry plus two panel-native mini-games: `Neural Timing` and
  `Brain Maze`

# 2026-05-02 — Batch 11 Curriculum Service

- Added shared curriculum IDs, enums, validation schemas, contracts, and event
  schemas.
- Introduced `@noema/curriculum-service` with Prisma schema, REST routes, domain
  DAG/frontier/slice/progress/revision policy logic, and unit tests.
- Added session curriculum binding fields and initial learner curriculum pages.
- Recorded ADR-036 for the curriculum-service boundary and CKG proposal gate.

# 2026-05-02 — Batch 11 Curriculum + Content Completion Pass

- Added curriculum operational surfaces for active versions, progress
  evaluation, realignment evidence, revision proposal apply, and curriculum MCP
  tool registry entries.
- Extended content generation orchestration with a content-agent HTTP port and
  explicit generation-job runner.
- Added curriculum API-client hooks for vault, frontier, progress, session
  slices, evidence, freeze controls, and revision workflows.
- Validated shared packages, content-service, and curriculum-service
  lint/typecheck/test/Prisma generation suites.
