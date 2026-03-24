# ADR-0050: Ontology Imports Pipeline Architecture

## Status

Accepted

## Date

2026-03-24

## Context

Noema's Canonical Knowledge Graph (CKG) currently supports mutation review and
graph browsing, but it does not yet have a dedicated ontology-ingestion
workflow. We want to seed and continuously enrich the CKG from broad,
open-access knowledge sources so the platform can reason over disciplines,
concepts, entities, fields, locations, skills, and commonsense relationships.

The first agreed source set is:

- **Backbones:** YAGO, ConceptNet, ESCO
- **Follow-on sources for later phases:** UNESCO Thesaurus, WordNet, Getty
  Vocabularies, Library of Congress Linked Data, OpenAlex, GeoNames

The team explicitly locked the following decisions before implementation:

1. Ontology imports stay inside the existing `knowledge-graph-service`
2. The first pilot connectors are `YAGO + ESCO + ConceptNet`
3. Normalized output must flow into the existing CKG mutation/review pipeline,
   not directly into canonical graph writes

This work must respect Noema's hexagonal architecture and remain incremental,
observable, and reversible.

## Decision

### 1) Build ontology imports inside `knowledge-graph-service`

The import pipeline will be introduced as a new bounded workflow in
`services/knowledge-graph-service`, rather than creating a separate ingestion
service up front.

The service will gain:

- domain models for ontology sources, import runs, raw artifacts, and parsed
  batches
- application use cases for source registration, run orchestration, retry,
  cancellation, and promotion to normalization
- infrastructure adapters for source fetchers, artifact storage, staging
  persistence, and background execution
- admin-facing API surface for the new import dashboard

### 2) Keep imports, normalization, and canonical publication as separate stages

The architecture is explicitly staged:

1. **Import** - fetch and persist raw upstream payloads
2. **Parse / stage** - convert source-native formats into a shared staging model
3. **Normalize** - map staged records into source-agnostic candidates
4. **Generate mutations** - turn normalized candidates into reviewable CKG
   mutations
5. **Publish** - canonical CKG changes only after existing review/approval rules

This means imports never bypass provenance tracking, guardrails, or human
review.

### 3) Use source-specific adapters behind stable ports

The domain/application layers define stable ports such as:

- `ISourceCatalogRepository`
- `IImportRunRepository`
- `IRawArtifactStore`
- `ISourceFetcher`
- `ISourceParser`
- `IImportScheduler`
- `IChecksumVerifier`
- `INormalizationPublisher`

Each upstream source is handled by an adapter that only knows how to:

- fetch data from the source
- persist raw artifacts plus manifests
- emit parser-ready inputs

Canonicalization, merge policy, and edge semantics belong to later stages, not
the fetch adapter.

### 4) Prefer fully programmatic ingestion, with snapshots where appropriate

The pipeline will be automated end to end. No manual browser downloads should be
required in the steady state.

However, "programmatic" does **not** mean "API-only." The preferred access mode
depends on the source:

- **Snapshot / bulk-first:** YAGO, WordNet, OpenAlex snapshot, GeoNames extracts
- **API / linked-data-first:** ESCO, Getty, Library of Congress, UNESCO
- **Hybrid:** ConceptNet (dataset for large imports, API for targeted lookups)

This preserves reproducibility and avoids brittle full-graph API crawling where
official snapshots are the better source of truth.

### 5) Pilot the pipeline with YAGO, ESCO, and ConceptNet

The first implementation slice must validate three different integration shapes:

- **YAGO** for bulk/snapshot ontology import
- **ESCO** for linked-data / web-service style import
- **ConceptNet** for commonsense graph import and relation diversity

This combination is intentionally broad enough to harden the pipeline before we
add the remaining sources.

### 6) Frontend-first admin workflow ships early

The admin application will expose the imports workflow before the full pipeline
is complete. Early UI phases should provide:

- source catalog
- import-run listing
- import-run detail and status timeline
- artifact/provenance visibility
- placeholders for retry, cancel, and normalization controls

This keeps the surface area visible and avoids 404-driven development.

## Alternatives Considered

### A. Create a dedicated ingestion service immediately

**Pros**

- stronger operational isolation
- easier future horizontal scaling for import workloads

**Cons**

- duplicates service scaffolding too early
- adds cross-service contracts before we know the stable import model
- slows the first end-to-end slice

**Rejected because**

The current need is architectural clarity and fast iteration. A later extraction
remains possible once the workflow and volume patterns are proven.

### B. Write normalized data directly into the canonical graph

**Pros**

- fewer steps
- seemingly faster path to a populated graph

**Cons**

- bypasses provenance review
- makes rollback and audit much harder
- increases the risk of bad merges becoming canonical

**Rejected because**

It conflicts with the existing CKG mutation and guardrail model and creates
avoidable governance risk.

### C. Use only upstream APIs, no bulk snapshots

**Pros**

- smaller connector code surface for some sources
- easier incremental sync in a few cases

**Cons**

- poor reproducibility for large imports
- more rate-limit and schema-drift risk
- often incomplete for full-graph seeding

**Rejected because**

Several chosen sources are better consumed via official snapshots or extracts
for initial seeding and auditability.

## Consequences

### Positive

- keeps imports aligned with the existing KG bounded context
- preserves strict provenance from raw artifact to canonical mutation
- supports gradual rollout across UI, application, domain, and adapters
- lets us automate all chosen sources without requiring manual download steps in
  normal operation
- gives us a reusable import framework for future sources beyond the initial set

### Negative / trade-offs

- `knowledge-graph-service` becomes broader in responsibility
- import orchestration, artifact storage, and staging add operational complexity
- normalization and merge logic remain deferred, so the first phases will not
  immediately populate the canonical graph

### Follow-up tasks created

- ontology import domain/application contract batch
- admin imports dashboard batch
- staging persistence batch
- YAGO / ESCO / ConceptNet adapter batch
- normalization pipeline design batch
- CKG mutation generation integration batch

## References

- `C:\Users\anr\Apps\noema\docs\plans\2026-03-24-ontology-imports-pipeline.md`
- `C:\Users\anr\Apps\noema\docs\architecture\decisions\ADR-0010-content-domain-and-knowledge-graph-integration.md`
- `C:\Users\anr\Apps\noema\docs\knowledge-graph-service-implementation\PHASE-6-CKG-MUTATION-PIPELINE.md`
- `C:\Users\anr\Apps\noema\docs\knowledge-graph-service-implementation\PHASE-8e-ONTOLOGICAL-GUARDRAILS.md`
