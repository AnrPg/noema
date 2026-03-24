# Ontology Imports Roadmap

## Current initiative

Ontology Imports Pipeline for the Canonical Knowledge Graph

## Locked decisions

- imports live inside `knowledge-graph-service`
- pilot sources: `YAGO + ESCO + ConceptNet`
- normalized outputs must become reviewable CKG mutations before canonical
  publish

## Milestones

### M1 - Import workflow foundation

- Batch 1: contracts and admin workflow shell
- Batch 2: persistence, artifacts, and run orchestration

## Current progress

- `web-admin` typecheck is green again after cleaning the pre-existing session
  detail query errors.
- `knowledge-graph-service` is now green end-to-end again:
  - pre-existing contract and domain test failures were reconciled with the
    current value-object, event, and typestate implementations
  - `pnpm --filter @noema/knowledge-graph-service test` now passes again
- Batch 2 is functionally complete and validated:
  - Prisma persistence models and repositories exist for sources, runs,
    artifacts, checkpoints, and parsed batches
  - admin orchestration routes exist for list/create/start/cancel/retry/get
  - admin imports pages now consume live API hooks and fall back gracefully to
    seeded pilot data
- Batch 3 has started with the first real YAGO adapter slice:
  - the new YAGO fetcher downloads official release snapshots programmatically,
    records checksums, and emits immutable manifests
  - the ESCO fetcher now pages through the official ESCO web-service API and
    stores source-native payload pages plus an immutable manifest
  - the ConceptNet fetcher now supports both full snapshot downloads and
    targeted API seed-node fetches
  - started runs can now execute registered source fetchers end-to-end instead
    of staying as placeholders
- Batch 4 has begun at the contract level:
  - shared staged graph contracts now exist for concepts, relations, aliases,
    mappings, and provenance-aware parsed batches
  - parser adapters now exist for YAGO, ESCO, and ConceptNet
  - a shared parsing service can route fetched artifacts into the staged graph
    schema by source id
  - started import runs now progress from fetch into parse automatically,
    persisting parsed batch artifacts and metadata per run
  - YAGO zip snapshots are now extracted into run-scoped text artifacts for the
    parser layer
- Batch 5 has started with the first normalization handoff:
  - parsed staged records can now be normalized into source-aware candidate
    batches
  - normalized batch artifacts are emitted per run without bypassing the later
    CKG mutation-review flow
  - normalized candidate batches now generate mutation-preview payloads
  - canonical node resolution now upgrades resolvable concepts into
    `update_node` proposals and resolvable relations into `add_edge` proposals
  - import runs can now submit ready mutation-preview candidates into the CKG
    review queue and advance to `staging_validated`
  - admin import-run detail now exposes parsed, normalized, and mutation-preview
    summaries for inspection and submission
  - admin imports dashboard now includes source version, source mode, language,
    and seed-node controls for create-run flows
  - submitted ontology-import proposals can now be reviewed from the CKG
    mutation queue with an import-run filter
  - mapping-aware normalization and canonical resolution now use YAGO
    equivalence predicates plus normalized exact/close mappings to improve edge
    proposal readiness
  - import runs now persist the exact submitted mutation ids so reviewers can
    jump from a run directly into the reviewed mutations
  - ESCO and ConceptNet now emit richer staged mapping records, not only YAGO
    equivalence mappings
  - the mutation queue now groups ontology-import proposals by import run to
    make large review batches easier to triage
  - the mutation queue backend now supports ontology-import filtering by
    `importRunId` plus import-run aggregation metadata for larger reviewer
    batches
  - the next normalization pass now closes exact-match components and propagates
    close matches across those components so ESCO and ConceptNet mappings
    improve canonical edge resolution more often

### M2 - Pilot connector coverage

- Batch 3: YAGO, ESCO, and ConceptNet source adapters
- Batch 4: shared parsing and staging schema

### M3 - Canonical handoff

- Batch 5: normalization handoff and mutation generation

### M4 - Review throughput and cross-source merge quality

- Batch 6: reviewer bulk workflows, merge confidence, and next-source mapping
  depth

## Exit criteria

- admin can register and run ontology imports without 404s
- raw artifacts and manifests are persisted per run with provenance and
  checksums
- staged outputs exist for YAGO, ESCO, and ConceptNet
- normalization produces reviewable CKG mutations
- no import stage bypasses the mutation review flow

## Next batch

Batch 6 is planned to improve operational review throughput and the quality of
cross-source canonical merge decisions.

- reviewer-side bulk actions and import-run scoped approval workflows
- richer mapping extraction for the next locked sources, starting with OpenAlex
  and GeoNames parsing targets
- confidence scoring and conflict policies for merge candidates so the review
  queue can surface higher-trust proposals first
