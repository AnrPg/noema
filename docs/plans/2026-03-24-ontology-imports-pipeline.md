# 2026-03-24 - Ontology Imports Pipeline Plan

## Goal

Build an ontology-imports pipeline for the Canonical Knowledge Graph (CKG) that
can ingest broad, non-biomedical open knowledge sources in a way that respects
Noema's existing hexagonal architecture and current CKG mutation workflow.

This plan treats the chosen source stack as:

- Backbones: YAGO, ConceptNet, ESCO, UNESCO Thesaurus, WordNet
- Enhancements: Getty Vocabularies, Library of Congress Linked Data, OpenAlex,
  GeoNames

The ontology-imports pipeline comes first. Normalization and canonical merge
happen after we have a stable ingestion and staging system.

---

## Locked decisions

- Service placement: keep ontology imports inside `knowledge-graph-service`
- First pilot connectors: `YAGO + ESCO + ConceptNet`
- Publication gate: normalized output must become reviewable CKG mutations
  before canonical publish

---

## Architectural stance

### Why imports first

Before we normalize or merge anything, we need a reliable ingestion layer that
can:

1. register a source and its version
2. fetch data reproducibly
3. store raw payloads and manifests
4. parse source-native formats into a staging model
5. produce an auditable import run
6. feed later normalization and mutation-generation steps

### Hexagonal placement

#### UI / Frontend

- Admin imports dashboard
- Source catalog page
- Import-run detail page
- Parse/validation status views
- Manual retry / cancel / re-run controls

#### Application layer

- Create import source
- Schedule import run
- Start import run
- Retry failed step
- Approve parsed batch for normalization
- Generate CKG mutations from normalized output

#### Domain layer

- Import source aggregate
- Import run aggregate
- Import artifact manifest
- Parser / fetcher / normalizer ports
- Import state machine
- Provenance, licensing, checksum, and version policies

#### Adapters / Infrastructure

- HTTP / API clients for upstream sources
- Bulk file download adapters
- Raw artifact storage adapter
- Staging database repositories
- Queue / job runner adapter
- Observability adapter

---

## Phases

## Phase 0 - Discovery, licensing, and source contracts

Objective: lock the source list, access mode, update cadence, and provenance
rules before writing the pipeline.

Deliverables:

- source registry spec
- per-source access matrix
- licensing/provenance rules
- import-run state machine draft
- ADR for imports architecture

Open questions to settle here:

- do we support both snapshot imports and incremental sync from day one?
- do we store raw upstream files in object storage, filesystem, or both?
- do we allow direct-to-CKG admin imports, or must everything pass through
  normalization + mutation generation?

## Phase 1 - Domain model and application contracts

Objective: define the import pipeline as a first-class bounded workflow inside
the knowledge-graph-service.

Add domain concepts such as:

- OntologySource
- OntologyImportRun
- OntologyImportArtifact
- OntologyImportCheckpoint
- ParsedOntologyBatch
- SourceRelease

Add ports such as:

- ISourceCatalogRepository
- IImportRunRepository
- IRawArtifactStore
- ISourceFetcher
- ISourceParser
- IImportScheduler
- IChecksumVerifier

Application use cases:

- registerSource
- listSources
- createImportRun
- startImportRun
- cancelImportRun
- retryImportStep
- listImportRuns
- getImportRun
- publishParsedBatchForNormalization

## Phase 2 - Persistence and staging model

Objective: persist sources, runs, artifacts, checkpoints, and parsed records
without touching canonical graph writes yet.

Recommended storage split:

- relational store for source metadata, runs, statuses, provenance, metrics
- object/blob storage for raw artifacts and parser outputs
- staging tables or document collections for parsed records

Key rule:

- raw source data is immutable per run
- parsed outputs are versioned by source + release + run

## Phase 3 - Source adapters and fetchers

Objective: build fetch adapters per source without normalization logic mixed in.

Adapter families:

- snapshot downloader adapters: YAGO, WordNet, OpenAlex snapshot, GeoNames
  extracts
- API / linked-data adapters: ESCO web-service, Getty LOD, LoC Linked Data,
  UNESCO API
- hybrid adapters: sources where we prefer snapshots for full loads and APIs for
  deltas
- commonsense graph adapters: ConceptNet with explicit full-import and
  targeted-import modes

Each adapter should only do:

- authenticate if needed
- download or query upstream data
- write raw artifacts
- emit manifest metadata

It should not decide canonical labels, merges, or edge semantics.

## Phase 4 - Parsers into a common staging schema

Objective: convert source-native formats into a shared intermediate import
schema.

Input formats expected:

- Turtle / RDF
- RDF/XML
- JSON / JSON-LD
- CSV / TSV
- plain text extract formats

Initial staging schema should preserve:

- source id
- source release/version
- original iri / uri / external id
- preferred label
- alt labels / synonyms
- description / definition
- relation type as source-native value
- subject / predicate / object
- language
- broader / narrower / exact-match / close-match links
- provenance and license fields
- raw payload pointer

Important:

- this is still not the final CKG schema
- preserve source truth even if it looks messy

## Phase 5 - Admin imports UI

Objective: expose the full imports workflow before normalization is built.

Admin pages:

- /dashboard/ckg/imports
- /dashboard/ckg/imports/sources
- /dashboard/ckg/imports/runs/[id]
- /dashboard/ckg/imports/catalog/[source]

UI capabilities in this phase:

- register configured source adapters
- trigger a run manually
- view run progress and artifacts
- inspect parser failures
- retry failed runs
- review release/version info
- inspect provenance and license warnings

This keeps the frontend ahead of the backend instead of hiding the workflow
behind 404s.

## Phase 6 - Orchestration, jobs, and observability

Objective: make imports operationally reliable.

Needed:

- background job runner per import stage
- resumable checkpoints
- rate-limit aware backoff
- source-specific concurrency caps
- checksums and duplicate-run protection
- metrics for run duration, throughput, failure rates, parse errors
- alerts for upstream schema drift

Suggested run stages:

- queued
- fetching
- fetched
- parsing
- parsed
- staging_validated
- ready_for_normalization
- failed
- cancelled

## Phase 7 - Normalization pipeline

Objective: turn staged records into a source-agnostic normalized graph candidate
model.

This phase is intentionally separate from imports.

Outputs should include:

- canonical candidate nodes
- canonical candidate edges
- alias/synonym records
- crosswalks between external ids
- source confidence metadata
- conflict sets for human review

## Phase 8 - Mutation generation into the existing CKG pipeline

Objective: preserve the current CKG quality gate.

Normalized candidates should not write directly to Neo4j. They should generate
CKG mutations that enter the existing validation + review pipeline.

This preserves:

- auditability
- rollback safety
- human review for conflicts
- provenance on every structural claim

## Phase 9 - Multi-source merge and policy engine

Objective: combine YAGO + ConceptNet + ESCO + UNESCO + WordNet + enhancements
into a coherent canonical graph.

Needed later:

- source priority policy
- namespace policy
- relation mapping policy
- merge confidence policy
- disambiguation rules
- contradiction escalation rules

---

## Source access strategy

| Source              | Best access mode                          | Programmatic? | Notes                                                |
| ------------------- | ----------------------------------------- | ------------: | ---------------------------------------------------- |
| YAGO                | bulk snapshot download                    |           yes | best as scheduled snapshot imports                   |
| ConceptNet          | API plus bulk data/build pipeline         |           yes | API is useful for slices; bulk better for full loads |
| ESCO                | web-service API or local downloadable API |           yes | very good machine-access story                       |
| UNESCO Thesaurus    | API/data export                           |           yes | good for subject hierarchy and multilingual labels   |
| WordNet             | release download                          |           yes | stable lexical backbone                              |
| Getty               | LOD/SPARQL/download/API                   |           yes | strong cultural heritage and art vocabularies        |
| Library of Congress | linked-data API/URIs                      |           yes | great controlled vocabularies                        |
| OpenAlex            | API or free snapshot                      |           yes | snapshot preferred for large-scale ingest            |
| GeoNames            | daily extracts or web services            |           yes | extract preferred for backbone location data         |

Working assumption: we do not need manual clicking and hand-downloads for the
steady-state pipeline. We can do this programmatically. For a few sources, bulk
snapshots are still better than live APIs for reproducibility and completeness.

---

## Recommended implementation order

1. Phase 0 + Phase 1
2. Phase 2 persistence/staging
3. Phase 3 adapters for three pilot sources:
   - YAGO
   - ESCO
   - ConceptNet
4. Phase 5 admin imports UI
5. Phase 6 orchestration
6. Phase 7 normalization
7. Phase 8 mutation generation
8. add remaining sources incrementally

Why these pilots:

- YAGO gives broad world-knowledge backbone
- ESCO gives skills/competencies taxonomy
- ConceptNet gives commonsense relation diversity

Together they force us to handle three very different source shapes early.

---

## First implementation slice

The first real slice I recommend building is:

- domain/application contracts for OntologySource and OntologyImportRun
- persistence for sources + runs + artifacts
- a single manual admin page for imports
- one bulk downloader adapter
- one API-based adapter
- one run detail page with statuses

Concretely:

- bulk pilot: YAGO
- API pilot: ESCO
- hybrid/commonsense pilot: ConceptNet

---

## Decisions to confirm before implementation

1. Service placement

- Option A: keep ontology imports inside knowledge-graph-service
- Option B: create a dedicated ingestion-service that feeds
  knowledge-graph-service

Recommendation: Option A first, because the current mutation pipeline, graph
repositories, and admin workflow already live there. We can extract later if
imports become their own platform subsystem.

2. Raw artifact storage

- Option A: filesystem/object storage outside Prisma
- Option B: store artifacts in the database

Recommendation: Option A. Raw ontology artifacts will get large quickly,
especially with YAGO and OpenAlex.

3. Publication gate

- Option A: normalization writes directly to CKG
- Option B: normalization emits CKG mutations only

Recommendation: Option B. This aligns best with the current CKG mutation
architecture and keeps imports auditable and reversible.

4. Initial source pilot set

- Option A: start with YAGO + ESCO + ConceptNet
- Option B: start with YAGO + ESCO + GeoNames

Locked decision: Option A.
