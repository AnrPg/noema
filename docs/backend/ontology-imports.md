# Ontology Imports Backend

## Purpose

Ontology imports are introduced as a new bounded workflow inside
`knowledge-graph-service`.

Batch 1 focuses on contracts only:

- domain contracts for sources, runs, artifacts, checkpoints, and parsed batches
- application contracts for source registration, run lifecycle, and
  normalization handoff
- typed API client contracts so the admin app can evolve against stable shapes

## Batch 1 contract files

- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\domain\knowledge-graph-service\ontology-imports.contracts.ts`
- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\contracts.ts`

## Batch 2 persistence and orchestration

Batch 2 introduces the first real adapters around those contracts:

- Prisma-backed repositories for:
  - ontology sources
  - ontology import runs
  - import artifacts
  - checkpoints
  - parsed staging batches
- admin-only REST routes for:
  - listing sources
  - listing runs
  - reading run detail
  - creating runs
  - starting, cancelling, and retrying runs
- a local raw-artifact storage adapter stub that mirrors persisted artifact
  metadata to disk until real fetchers start writing payloads in Batch 3

### Batch 2 backend files

- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\service.ts`
- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\api\rest\ontology-import.routes.ts`
- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\api\schemas\ontology-import.schemas.ts`
- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\database\repositories\prisma-ontology-source.repository.ts`
- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\database\repositories\prisma-ontology-import-run.repository.ts`
- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\database\repositories\prisma-ontology-import-metadata.repository.ts`
- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\storage\local-raw-artifact.store.ts`
- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\prisma\migrations\20260324110000_add_ontology_imports\migration.sql`

## Current architectural boundary

- **domain** defines source/run/artifact models and ports
- **application** defines use-case contracts and run-detail composition
- **adapters** are deferred to later batches
- **canonical publish** remains outside the import workflow until normalization
  emits reviewable CKG mutations

### Shared staged graph contracts

The pipeline now has a shared source-truth staging contract for ontology and
knowledge-graph data:

- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\domain\knowledge-graph-service\ontology-imports.contracts.ts`
- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\tests\unit\domain\ontology-imports.contracts.test.ts`

These contracts define:

- concept records
- relation records
- alias records
- cross-source mapping records
- provenance envelopes tying every staged record back to a run and artifact
- a parsed ontology graph batch schema for parser output

This gives parsers a stable target before normalization begins and keeps
source-native semantics explicit instead of prematurely canonicalizing them.

## Programmatic ingestion stance

The pipeline is designed so all supported sources can be automated.

- YAGO: bulk snapshot fetcher
- ESCO: linked-data/API fetcher
- ConceptNet: hybrid fetcher with explicit full-import and targeted-import modes

Manual browser downloads are not part of the steady-state design.

## Batch 3 pilot source adapters

Batch 3 starts by turning the source-fetcher port into real adapter code.

### YAGO fetcher

The first concrete adapter is the YAGO bulk snapshot fetcher:

- implementation:
  `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\fetchers\yago\yago-source.fetcher.ts`
- unit coverage:
  `C:\Users\anr\Apps\noema\services\knowledge-graph-service\tests\unit\infrastructure\yago-source.fetcher.test.ts`

Current behavior:

- resolves the YAGO release version from the import run or a configured default
- builds the official snapshot URL programmatically
- performs a metadata `HEAD` request before downloading the artifact
- streams the zip payload to local raw-artifact storage
- computes a SHA-256 checksum during download
- emits an immutable manifest artifact with upstream URL, release version,
  variant, content length, checksum, and response metadata

This adapter stays strictly inside the infrastructure layer and does not parse,
normalize, or publish anything into the canonical CKG.

The application service now also invokes the YAGO fetcher end-to-end when a YAGO
import run is started:

- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\service.ts`
- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\tests\unit\application\ontology-imports.service.test.ts`

### ESCO fetcher

The second concrete adapter is the ESCO web-service / linked-data fetcher:

- implementation:
  `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\fetchers\esco\esco-source.fetcher.ts`
- unit coverage:
  `C:\Users\anr\Apps\noema\services\knowledge-graph-service\tests\unit\infrastructure\esco-source.fetcher.test.ts`

Current behavior:

- calls the official ESCO REST API programmatically
- pages through source-native ESCO collections by concept scheme
- currently fetches occupations, skills, and qualifications
- persists every returned page as an immutable raw payload artifact
- emits a manifest artifact with selected version, language, page inventory,
  record counts, request URLs, and checksums

This means ESCO does not require manual browser downloads for the import
pipeline. The fetch adapter is built around the official web-service API and its
`selectedVersion` parameter instead.

### ConceptNet fetcher

The third concrete adapter is the ConceptNet hybrid fetcher:

- implementation:
  `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\fetchers\conceptnet\conceptnet-source.fetcher.ts`
- unit coverage:
  `C:\Users\anr\Apps\noema\services\knowledge-graph-service\tests\unit\infrastructure\conceptnet-source.fetcher.test.ts`

Current behavior:

- supports `full` mode for reproducible snapshot-style downloads
- supports `targeted` mode for seed-node API imports
- emits immutable raw payload artifacts in both modes
- writes a manifest that records whether the run used full or targeted fetches

This gives ConceptNet the explicit full-vs-targeted import split we wanted
before parsers and normalizers start consuming it.

## Batch 4 parser layer

Batch 4 has now started with a shared parser layer and staged graph-record
targets:

- parsing service:
  `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\parsing\service.ts`
- parser adapters:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\parsers\yago\yago-source.parser.ts`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\parsers\esco\esco-source.parser.ts`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\parsers\conceptnet\conceptnet-source.parser.ts`
- parser coverage:
  `C:\Users\anr\Apps\noema\services\knowledge-graph-service\tests\unit\infrastructure\ontology-parsers.test.ts`

Current parser behavior:

- YAGO parser converts extracted line-based triples into staged concept and
  relation records
- ESCO parser converts paged JSON payloads into concept and alias records
- ConceptNet parser converts targeted JSON payloads and gzip-compressed
  assertion rows into concept and relation records

Important current limitation:

- YAGO fetches still arrive as `.zip` snapshots, but the import pipeline now
  extracts those archives into run-scoped raw payload artifacts before parsing
- the YAGO parser therefore prefers extracted text artifacts automatically and
  only raises on `.zip` input when extraction artifacts are missing

## Fetch -> parse -> normalize orchestration

Started import runs now progress through real pipeline stages inside the
application service:

- `fetch` via the registered source fetcher
- `parse` via the shared parsing service and source-specific parser
- `stage` via the new normalization service and source-specific normalizer

Key files:

- application orchestration:
  `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\service.ts`
- normalization application service:
  `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\normalization\service.ts`
- YAGO extraction support:
  `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\fetchers\yago\yago-source.fetcher.ts`

Parsed and normalized output are persisted as immutable artifacts per run:

- parsed output: `parsed_batch`
- normalized output: `normalized_batch`

The run status now advances to `ready_for_normalization` once the first
normalization handoff finishes successfully.

## Batch 5 normalization handoff

The first normalization layer has started. It does not yet generate reviewable
CKG mutations, but it now consolidates staged source-truth records into
candidate batches that are easier for later mutation generation to consume.

### Mutation-preview handoff

The import pipeline now produces mutation-ready preview payloads immediately
after normalization:

- generation service:
  `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\mutation-generation\service.ts`
- run orchestration:
  `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\service.ts`

Current behavior:

- normalized concept candidates become ready `add_node` mutation proposals with
  preserved source provenance embedded in the operation properties
- normalized relation candidates are kept as blocked preview items when they
  cannot yet resolve to canonical CKG node ids
- each run now emits a `mutation_preview` artifact alongside the
  `normalized_batch`
- run detail responses expose:
  - parsed batch summary
  - normalized batch summary
  - mutation preview summary with ready vs deferred candidate counts

This keeps the ontology-import pipeline aligned with the mutation-review
architecture: imports still do not write directly into the canonical CKG, but
the next reviewable payload is now visible and inspectable.

### Submission and canonical resolution

The mutation-preview stage is now wired one step further into the existing CKG
review flow.

Key files:

- run orchestration:
  `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\service.ts`
- canonical node resolution:
  `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\mutation-generation\canonical-node-resolver.ts`
- REST route:
  `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\api\rest\ontology-import.routes.ts`

Current behavior:

- import runs can now submit their ready mutation-preview candidates into the
  CKG review queue via `POST /api/v1/ckg/imports/runs/:runId/submit`
- the submission step creates a validation checkpoint and advances the run to
  `staging_validated`
- canonical node resolution now runs during mutation-preview generation
- concept candidates that match existing canonical nodes become `update_node`
  proposals instead of duplicate `add_node` proposals
- relation candidates whose endpoints both resolve can now become real
  `add_edge` proposals instead of staying deferred

### Run configuration

Ontology import runs now carry configuration as first-class workflow state.

Current configuration fields:

- `mode`
- `language`
- `seedNodes`

These values are persisted on the run record and consumed by the source
adapters:

- ConceptNet reads `mode` and `seedNodes`
- ESCO reads `mode` and `language`
- YAGO currently relies on `sourceVersion` and snapshot defaults, but now shares
  the same run-configuration model

## Mapping-aware normalization and resolution

The next normalization pass has started to make cross-source mappings useful
before final canonical publish.

Key files:

- YAGO mapping extraction:
  `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\parsers\yago\yago-source.parser.ts`
- shared mapping normalization:
  `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\normalizers\helpers.ts`
- canonical resolution:
  `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\mutation-generation\canonical-node-resolver.ts`

Current behavior:

- YAGO now promotes mapping-like predicates such as `sameAs` / `exactMatch` into
  staged `mapping` records instead of flattening them into generic relations
- normalization now expands exact/close mappings symmetrically so later stages
  can traverse them from either endpoint
- canonical resolution now goes beyond exact external-id matching:
  - exact external-id match
  - exact IRI match
  - alias match from stored ontology import aliases
  - normalized label match that tolerates punctuation/format differences
  - mapping-assisted match through normalized exact/close mappings
- mutation-preview generation now propagates canonical resolutions through
  exact/close mappings so relation candidates can become real `add_edge`
  proposals more often

Normalization files:

- shared service:
  `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\normalization\service.ts`
- shared helpers:
  `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\normalizers\helpers.ts`
- source-aware normalizers:
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\normalizers\yago\yago-source.normalizer.ts`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\normalizers\esco\esco-source.normalizer.ts`
  - `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\normalizers\conceptnet\conceptnet-source.normalizer.ts`

Current normalization behavior:

- folds alias records back into concept candidates
- deduplicates concepts, relations, and mappings within a parsed batch
- preserves provenance as provenance arrays on normalized candidates
- emits normalized predicate keys for relation candidates
- remains source-aware and does not write to the canonical CKG directly

## Submitted mutation persistence and richer mapping extraction

The latest ontology-import slice tightens the handoff between import runs,
mapping extraction, and human review.

### Import-run submission persistence

- ontology import runs now persist the exact mutation ids that were submitted
  into the CKG review queue
- the run repository stores those ids directly on the run record so the admin
  detail page can link to exact reviewed mutations instead of only falling back
  to a queue filter

Key files:

- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\domain\knowledge-graph-service\ontology-imports.contracts.ts`
- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\database\repositories\prisma-ontology-import-run.repository.ts`
- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\service.ts`
- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\prisma\migrations\20260324184500_add_ontology_import_submitted_mutations\migration.sql`

### ESCO and ConceptNet mapping extraction

Parser coverage now goes beyond YAGO equivalence predicates:

- ESCO parser now extracts explicit mapping fields such as `sameAs`,
  `exactMatch`, `closeMatch`, `broadMatch`, `narrowMatch`, and `relatedMatch`,
  plus supported link-based equivalents when they are exposed in `_links`
- ESCO now also promotes trusted external-classification references into staged
  `close_match` mappings when the payload exposes classification-oriented keys
- ConceptNet now emits staged mapping records for `/r/ExternalURL` assertions,
  promoting trusted external knowledge-base URLs to `close_match` instead of
  leaving all of them as generic related links

Key files:

- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\parsers\esco\esco-source.parser.ts`
- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\parsers\conceptnet\conceptnet-source.parser.ts`
- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\tests\unit\infrastructure\ontology-parsers.test.ts`

## Backend mutation queue aggregation and the next normalization pass

The mutation queue backend now understands ontology-import grouping directly,
and the normalization layer propagates richer mappings further before review.

### Backend queue filtering and aggregation

- `GET /api/v1/ckg/mutations` now accepts `importRunId`
- the route can also emit `metadata.additional.importRunGroups` for large
  reviewer batches
- ontology-import grouping is derived from the structured import marker already
  embedded in mutation rationale strings, so the response contract stays
  additive rather than being replaced with a new queue-specific payload

Key files:

- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\api\schemas\ckg-mutation.schemas.ts`
- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\api\rest\ckg-mutation.routes.ts`
- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\mutation-generation\ontology-import-mutation-context.ts`

### Stronger mapping-aware normalization

The next normalization pass now does more than reverse exact/close mappings:

- exact-match components are closed transitively
- close matches are propagated across exact-match neighborhoods
- canonical resolution walks those expanded exact/close mapping neighborhoods
  instead of only checking direct one-hop links

This means newly extracted ESCO and ConceptNet mappings have a better chance of
resolving deferred relation endpoints into real `add_edge` proposals.

Key files:

- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\infrastructure\ontology-imports\normalizers\helpers.ts`
- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\ontology-imports\mutation-generation\canonical-node-resolver.ts`
