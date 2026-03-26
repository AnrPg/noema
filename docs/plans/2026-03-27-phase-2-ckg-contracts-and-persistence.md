# 2026-03-27 - Phase 2 Plan: CKG Contracts, DTOs, and Persistence Shape

## Objective

Phase 2 turns the Phase 1 architecture into implementation-ready technical
contracts across all layers of Noema's hexagonal architecture. This phase still
does not implement the runtime feature set, but it locks the exact shapes,
service seams, DTOs, repository responsibilities, and compatibility rules that
later implementation will follow.

Primary outputs of this phase:

- `C:\Users\anr\Apps\noema\docs\architecture\decisions\ADR-0052-ckg-phase-2-contracts-and-persistence-shape.md`
- `C:\Users\anr\Apps\noema\docs\plans\2026-03-27-phase-2-ckg-contracts-and-persistence.md`

## What Phase 2 Must Lock

- the exact additive enrichment shape of shared graph nodes
- the domain contracts for source relation hints, candidates, and normalized
  relation review items
- the backend DTO and API surfaces that expose review hints as structured data
- the repository and mapper responsibilities for enriched CKG nodes
- the application service seams for manual edge authoring and ontology relation
  lifting
- the compatibility strategy for existing graph APIs and ontology-import flows

## Hexagonal Architecture Plan

## UI / Frontend Layer

Phase 2 defines the exact frontend-facing data contracts and interaction
boundaries needed by later implementation.

### Shared frontend-facing node DTO expectations

The admin frontend will later consume enriched CKG node data through the
existing graph fetch surfaces rather than a parallel node model.

Target DTO additions for CKG node responses:

- `status`
- `aliases`
- `languages`
- `tags`
- `semanticHints`
- `canonicalExternalRefs`
- `ontologyMappings`
- `provenance`
- `reviewMetadata`
- `sourceCoverage`

Required UI behaviors these DTOs must support later:

- node detail panels can render canonical aliases separately from raw overflow
- graph review screens can filter by source coverage and review confidence
- import review screens can show why a node is enriched from a given ontology
- reviewer-facing node panels can distinguish trusted canonical fields from raw
  source payload remnants

### Manual edge authoring frontend contract

The frontend must later call a dedicated validation/proposal path instead of
constructing relation legality itself.

Required request contract:

- `sourceNodeId`
- `targetNodeId`
- optional `proposedEdgeType`
- optional `rationale`
- optional `comment`

Required response contract:

- `sourceNode`
- `targetNode`
- `allowedEdgeTypes`
- `blockedEdgeOptions`
- `policyChecks`
- `duplicateEdgeWarnings`
- `acyclicityWarnings`
- `nodeStatusWarnings`
- optional `proposalPreview`

`blockedEdgeOptions` must be structured as:

- `edgeType`
- `blockingReasons[]`

The graph canvas and context menu must later render from this response, not from
duplicated local policy tables.

### Ontology relation-review frontend contract

The import run detail screen must later consume relation candidate DTOs with
review-ready structure.

Required relation candidate DTO shape:

- `candidateId`
- `sourceId`
- `sourceRelationType`
- `subjectExternalId`
- `objectExternalId`
- `subjectResolution`
- `objectResolution`
- `candidateEdgeTypes`
- `selectedEdgeType`
- `confidenceScore`
- `confidenceBand`
- `inferenceReasons`
- `blockingReasons`
- `evidenceSummary`
- `reviewState`
- `provenance`

Required reviewer actions the DTO must support:

- approve as selected edge type
- reject with reason
- remap subject endpoint
- remap object endpoint
- defer
- override selected edge type

## Application Layer

Phase 2 locks service seams and request/response contracts.

### `CkgEdgeAuthoringService`

Purpose:

- validate graph-native manual edge intent before mutation proposal creation

Input contract:

- `sourceNodeId`
- `targetNodeId`
- optional `proposedEdgeType`
- optional `rationale`
- optional `comment`
- execution context

Output contract:

- `sourceNodeSummary`
- `targetNodeSummary`
- `allowedEdgeOptions`
- `blockedEdgeOptions`
- `validationSummary`
- optional `proposalPreview`

Rules:

- no direct graph write
- no UI-only duplication of policy logic
- all blocked reasons must be structured and stable

### `OntologyRelationLiftingService`

Purpose:

- convert parsed source-truth data and raw relation-bearing metadata into
  source-relation candidates

Input contract:

- parsed ontology graph batch
- optional source-specific lifting configuration

Output contract:

- `sourceRelationHints[]`
- `sourceRelationCandidates[]`
- source-level extraction summary

Rules:

- parser adapters may extract hints, but the service owns semantic lifting
- lifting decisions must preserve source-specific evidence
- extraction summary must support observability and reviewer debugging later

### `OntologyRelationNormalizationService`

Purpose:

- map intermediate source relations into candidate canonical relations with
  confidence and blocking

Input contract:

- `sourceRelationCandidates[]`
- node resolution context
- policy registry

Output contract:

- `normalizedRelationCandidates[]`
- aggregate counts by:
  - ready
  - blocked
  - endpoint unresolved
  - reviewer required

Rules:

- no direct mutation generation inside normalization
- all candidate edge types must be policy compatible with the full 17-edge
  repertoire
- selected edge type may be null when the reviewer must choose

### `CkgNodeEnrichmentMapper`

Purpose:

- transform normalized concept data and ontology source material into typed node
  enrichment payloads

Input contract:

- normalized concept candidate
- source metadata
- optional canonical resolution context

Output contract:

- partial enriched node payload containing:
  - aliases
  - languages
  - semanticHints
  - canonicalExternalRefs
  - ontologyMappings
  - provenance
  - sourceCoverage
  - reviewMetadata
  - overflow properties

Rules:

- field-promotion rubric from Phase 1 is authoritative
- mapper must be able to emit both:
  - add-node enrichment payloads
  - update-node enrichment payloads

## Domain Layer

Phase 2 makes the domain shape explicit enough for coding.

### Shared node enrichment contracts

Target additive domain types:

- `CkgNodeStatus`
- `ICanonicalExternalRef`
- `IOntologyMapping`
- `INodeProvenanceEntry`
- `INodeReviewMetadata`
- `ISourceCoverageSummary`

#### `CkgNodeStatus`

Allowed values:

- `active`
- `deprecated`
- `merged`
- `split`
- `disputed`

#### `ICanonicalExternalRef`

Required fields:

- `sourceId`
- `externalId`
- `iri`
- `label`
- `sourceVersion`
- `confidenceScore`
- `isPrimary`

#### `IOntologyMapping`

Required fields:

- `sourceId`
- `sourceExternalId`
- `targetExternalId`
- `mappingKind`
- `confidenceScore`
- `confidenceBand`
- `conflictFlags`
- `provenance`

#### `INodeProvenanceEntry`

Required fields:

- `sourceId`
- `sourceVersion`
- `runId`
- `artifactId`
- `harvestedAt`
- `license`
- `requestUrl`
- `contributionKind`

`contributionKind` later distinguishes:

- `seed`
- `enrichment`
- `mapping`
- `review_override`

#### `INodeReviewMetadata`

Required fields:

- `confidenceScore`
- `confidenceBand`
- `conflictFlags`
- `overrideState`
- `lastReviewedAt`
- `lastReviewedBy`
- `notes`

#### `ISourceCoverageSummary`

Required fields:

- `coveredSourceIds`
- `primarySourceId`
- `coverageCount`
- `hasCrossSourceAgreement`
- `hasConflicts`

### Enriched `IGraphNode` contract

Phase 2 locks the additive shape of `IGraphNode` for later code changes.

The future shared interface will be additive, not replacement-based:

- all existing fields remain
- new enrichment fields are optional during rollout
- PKG compatibility is preserved by keeping enrichment optional for non-CKG
  consumers

This means the type package remains the single source of truth for graph node
transport contracts.

### Relation-lifting domain contracts

#### `ISourceRelationHint`

Required fields:

- `externalId`
- `sourceId`
- `subjectExternalId`
- `objectExternalId`
- `hintType`
- `rawPredicate`
- `evidence`
- `properties`
- `provenance`

`hintType` examples:

- `predicate`
- `hierarchy_link`
- `classification_link`
- `typed_link`
- `lexical_relation`
- `authority_relation`

#### `ISourceRelationCandidate`

Required fields:

- `externalId`
- `sourceId`
- `sourceRelationType`
- `subjectExternalId`
- `objectExternalId`
- `confidenceScore`
- `confidenceBand`
- `inferenceReasons`
- `properties`
- `provenance`

#### `IRelationInferenceReason`

Required fields:

- `kind`
- `message`
- `sourceField`
- `weight`
- `evidenceSnippet`

#### `IRelationBlockingReason`

Required fields:

- `kind`
- `message`
- `blocking`
- `suggestedAction`

`kind` examples:

- `endpoint_unresolved`
- `policy_incompatible`
- `mapping_conflict`
- `acyclicity_risk`
- `insufficient_confidence`
- `review_required`

#### `IEndpointResolutionStatus`

Required fields:

- `subject`
- `object`

Each endpoint contains:

- `resolutionState`
- `canonicalNodeId`
- `matchedLabel`
- `confidenceScore`
- `confidenceBand`
- `conflictFlags`

`resolutionState` values:

- `resolved`
- `unresolved`
- `ambiguous`
- `blocked`

#### `INormalizedOntologyRelationCandidateV2`

Required fields:

- `externalId`
- `sourceId`
- `sourceRelationType`
- `subjectExternalId`
- `objectExternalId`
- `candidateEdgeTypes`
- `selectedEdgeType`
- `confidenceScore`
- `confidenceBand`
- `inferenceReasons`
- `blockingReasons`
- `endpointResolution`
- `properties`
- `provenance`

## Adapters / Infrastructure Layer

Phase 2 locks repository and mapper responsibilities.

### Graph repository responsibilities

The Neo4j-backed graph repository must later be responsible for:

- persisting scalar and array node enrichment fields as dedicated node
  properties
- loading those fields back into typed `IGraphNode` responses
- preserving `properties` as overflow without losing typed enrichment fidelity
- keeping PKG and CKG mapping behavior compatible during rollout

Repository mapping must not leak raw Neo4j storage shape to callers.

### Persistence shape for enriched nodes

Phase 2 locks this storage strategy:

- scalar and array enrichment fields are persisted as first-class Neo4j node
  properties
- structured repeatable documents are persisted in a repository-managed encoded
  form that still round-trips to typed contracts
- overflow source payloads remain in `properties`

Initial first-class Neo4j property candidates:

- `status`
- `aliases`
- `languages`
- `tags`
- `semanticHints`

Initial encoded structured fields:

- `canonicalExternalRefs`
- `ontologyMappings`
- `provenance`
- `reviewMetadata`
- `sourceCoverage`

Exact encoding format is implementation-owned by the repository layer so long as
typed contracts round-trip cleanly.

### Relation candidate persistence

Phase 2 locks that relation-lifting and normalized review candidates remain
outside canonical graph writes until mutation approval.

They must later persist in the ontology-import staging layer with explicit
artifacts or repository records for:

- source relation hints
- source relation candidates
- normalized relation candidates
- review decisions

The canonical graph repository does not own staged relation-candidate storage.

### API mapper responsibilities

API mappers must later:

- expose enriched node DTOs without leaking repository encoding details
- expose structured relation review DTOs
- preserve backward compatibility for existing graph consumers where new fields
  are additive

## Public Interface Changes to Implement Later

### Shared types package

Planned additions:

- enrich `IGraphNode`
- add node enrichment sub-interfaces
- add relation-lifting interfaces and enums

Likely file targets:

- `C:\Users\anr\Apps\noema\packages\types\src\knowledge-graph\index.ts`
- `C:\Users\anr\Apps\noema\packages\types\src\enums\index.ts`

### Knowledge graph service domain/application

Planned additions:

- enriched ontology-import relation contracts
- dedicated application service seams
- manual edge authoring validation contract

Likely file targets:

- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\domain\knowledge-graph-service\ontology-imports.contracts.ts`
- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\application\knowledge-graph\...`

### API-client and frontend DTOs

Planned additions:

- enriched node DTO fields
- structured relation review DTOs
- manual edge authoring validation/proposal DTOs

Likely file targets:

- `C:\Users\anr\Apps\noema\packages\api-client\src\knowledge-graph\types.ts`
- `C:\Users\anr\Apps\noema\packages\api-client\src\knowledge-graph\hooks.ts`

## Compatibility Rules

- all new node enrichment fields are additive and optional at first
- existing PKG flows must continue to compile without populating CKG-only
  enrichment
- existing ontology-import flows remain valid until V2 relation contracts are
  adopted
- frontend code may begin rendering structured fields incrementally without
  requiring all services to populate them immediately

## Test and Validation Plan for Later Implementation

### Shared types and schema tests

- enriched `IGraphNode` compiles in both PKG and CKG contexts
- relation-lifting interfaces remain serializable and DTO-friendly
- enums and discriminated shapes preserve backward compatibility

### Domain and application tests

- manual edge authoring service returns stable allowed/blocked results
- source relation lifting preserves evidence and provenance
- normalized relation candidates carry candidate edge types, blocking reasons,
  and endpoint resolution
- node enrichment mapping correctly separates first-class fields from overflow

### Repository and mapper tests

- enriched node fields round-trip through repository mapping
- encoded structured fields deserialize without loss
- overflow `properties` remain untouched
- staged relation candidate persistence does not leak into canonical writes

### Frontend contract tests

- API-client DTOs expose structured review fields
- graph UI can render blocked edge options without local policy duplication
- import review surfaces can group/filter by confidence and blocking state

## Acceptance Criteria

Phase 2 is complete when later implementers can start coding without deciding:

- the exact enriched node contract shape
- where review metadata lives
- how relation-lifting contracts are layered
- which service owns manual edge authoring validation
- which repository owns canonical enrichment vs staged relation candidates
- how frontend DTOs receive structured review and policy data

Specifically, completion requires:

- a locked additive `IGraphNode` enrichment model
- a locked family of relation-lifting contracts
- explicit application service seams
- explicit repository and API-mapper responsibilities
- compatibility rules for additive rollout
- test expectations across all layers

## Assumptions and Defaults

- Phase 2 remains architecture and contract design only; no production code is
  changed in this phase.
- `IGraphNode` stays universal and additive rather than being split into a new
  CKG-only root type.
- Structured repeatable enrichment fields will initially be repository-encoded
  rather than forcing a more radical graph persistence redesign.
- Staged ontology relation candidates remain outside canonical graph writes
  until mutation approval.
- The application layer, not the UI, is the source of truth for edge-authoring
  legality and ontology relation-review semantics.
