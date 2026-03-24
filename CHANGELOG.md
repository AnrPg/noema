# Changelog

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
