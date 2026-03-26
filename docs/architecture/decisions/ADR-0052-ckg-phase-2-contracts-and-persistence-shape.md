# ADR-0052: CKG Phase 2 Contracts and Persistence Shape

## Status

Accepted

## Date

2026-03-27

## Context

ADR-0051 locked the product and architectural direction for:

- graph-native manual edge authoring
- intermediate source-relation lifting
- stronger first-class CKG node enrichment
- the full 17-edge canonical repertoire

What remains under-specified is the concrete implementation shape for the next
delivery phase. Phase 2 needs to lock how those decisions materialize in
contracts, DTOs, repositories, and API boundaries without yet implementing the
runtime changes.

The current codebase already has several important facts we must build around:

- `@noema/types` exposes a universal `IGraphNode` and `IGraphEdge`
- `knowledge-graph-service` already exposes policy-driven edge validation
- ontology-import contracts already represent parsed graph records, normalized
  concept candidates, mapping candidates, and a simpler normalized relation
  candidate
- mutation proposal routes already accept `add_node`, `update_node`, and
  `add_edge`
- Neo4j mapping currently treats unknown node fields as generic property bag
  data

If Phase 2 does not explicitly define the new contract boundaries, later
implementation risks:

- enriching node metadata inconsistently across packages and services
- encoding review-state semantics only in prose or ad hoc `properties`
- adding new frontend UI that depends on hidden backend inference rules
- diverging persistence models between node enrichment, relation candidates, and
  review workflows

Phase 2 therefore needs a technical, cross-layer contract design that keeps the
hexagonal architecture intact while making later implementation additive and
compatible.

## Decision

### 1) Keep the universal graph node shape, but add a typed CKG enrichment layer

`IGraphNode` remains the top-level shared graph contract, but it gains additive,
typed enrichment fields that are valid for both shared transport and domain
usage.

The Phase 2 target contract is:

- existing fields remain:
  - `nodeId`
  - `graphType`
  - `nodeType`
  - `label`
  - `description`
  - `domain`
  - `userId`
  - `properties`
  - `masteryLevel`
  - `createdAt`
  - `updatedAt`
- additive CKG-oriented enrichment fields are introduced:
  - `status?: CkgNodeStatus`
  - `aliases?: string[]`
  - `languages?: string[]`
  - `tags?: string[]`
  - `semanticHints?: string[]`
  - `canonicalExternalRefs?: ICanonicalExternalRef[]`
  - `ontologyMappings?: IOntologyMapping[]`
  - `provenance?: INodeProvenanceEntry[]`
  - `reviewMetadata?: INodeReviewMetadata | null`
  - `sourceCoverage?: ISourceCoverageSummary | null`

These fields are optional at the transport/type layer during rollout so that
existing PKG and CKG call sites remain compatible.

### 2) Formalize relation-lifting as first-class domain contracts

The simpler normalized ontology relation contract is insufficient for the new
review workflow.

Phase 2 introduces a layered relation contract family:

- `ISourceRelationHint`
- `ISourceRelationCandidate`
- `INormalizedOntologyRelationCandidateV2`
- `IEndpointResolutionStatus`
- `IRelationInferenceReason`
- `IRelationBlockingReason`

These become domain/application contracts, not debug payloads.

Their purpose is to preserve:

- source-native evidence
- semantic lifting decisions
- candidate canonical edge mappings
- blocking reasons
- reviewer-visible explanations

### 3) Make review hints first-class response data

Review state and confidence metadata will no longer be encoded only in mutation
`rationale` text or buried in freeform node properties.

Phase 2 locks explicit DTO-level review fields for:

- mutation preview candidates
- manual edge authoring validation responses
- ontology relation review screens
- enriched node detail surfaces

This applies to both backend response contracts and frontend-facing API-client
DTOs.

### 4) Keep persistence additive and compatibility-first

Phase 2 does not yet choose final migration scripts, but it locks the storage
shape:

- canonical CKG nodes persist first-class enrichment as dedicated Neo4j node
  properties where scalar/array storage is natural
- structured repeatable subdocuments such as external refs, mappings, and
  provenance are stored in an implementation-friendly serialized form at first,
  with repository-layer mapping preserving typed contracts
- existing generic `properties` remain available for overflow and backward
  compatibility
- relation-review and normalization candidate persistence remains outside
  canonical graph writes until mutation review commits changes

The repository layer, not the UI or API layer, is responsible for translating
between stored shape and typed domain objects.

### 5) Introduce dedicated application services instead of expanding unrelated ones

Phase 2 locks the future application service seams:

- `CkgEdgeAuthoringService`
  - validates manual edge authoring intent
  - returns allowed/blocked relation options
  - generates mutation proposals
- `OntologyRelationLiftingService`
  - transforms parser outputs and raw hint records into source-relation
    candidates
- `OntologyRelationNormalizationService`
  - maps source relations into candidate CKG relations with confidence and
    blocking
- `CkgNodeEnrichmentMapper`
  - translates normalized concept data into typed node enrichment payloads for
    mutation generation and review

This preserves clear application-layer use cases instead of embedding the new
logic inside generic route handlers or parser adapters.

## Rationale

### Why keep `IGraphNode` universal instead of creating a separate CKG-only node type

- Existing graph APIs, repositories, and UI components already depend on the
  universal node shape.
- A separate CKG-only node would introduce mapping duplication too early.
- Optional additive enrichment preserves compatibility while still making the
  CKG richer.

### Why formalize relation contracts as domain types

- Relation lifting is not merely adapter glue; it is now part of Noema's graph
  semantics and review workflow.
- Reviewers and agents both need inspectable, typed inference data.
- Domain contracts keep lifting behavior stable across adapters and UI clients.

### Why make review hints explicit in DTOs

- Review surfaces need structured confidence, conflict, and blocking data for
  grouping, filtering, and actioning.
- Encoding these hints only in prose prevents reliable frontend logic.

### Why keep persistence additive

- The current codebase already persists flexible graph data into Neo4j and uses
  generic property mapping.
- An additive approach lowers migration risk and lets the repository absorb
  storage evolution without destabilizing callers.

### Why add dedicated application services

- Manual edge authoring, relation lifting, relation normalization, and node
  enrichment are distinct use cases with different inputs and outputs.
- Clear service seams preserve hexagonal boundaries and make later testing
  tractable.

## Alternatives Considered

| Option                                                                | Pros                   | Cons                                                    | Rejected because                                           |
| --------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| Create a separate `ICkgNode` root type immediately                    | Strong type separation | Large mapping churn across packages and APIs            | Too disruptive for Phase 2; additive enrichment is safer   |
| Keep relation inference data only in `properties` or `rationale`      | Minimal schema work    | Unqueryable, opaque, weak for reviewers                 | It undermines the whole purpose of Phase 2                 |
| Store all enrichment only in Neo4j JSON blobs                         | Flexible storage       | Harder filtering and weaker graph repository ergonomics | It over-optimizes for storage flexibility over typed usage |
| Fold manual edge authoring into existing mutation route handlers only | Fewer services         | Blurs use-case boundaries and UI contract design        | It weakens hexagonal clarity and testing seams             |

## Consequences

### Positive

- later implementation has a stable contract target across packages
- frontend and backend can share structured review data
- node enrichment becomes queryable and inspectable
- relation-lifting becomes explainable and testable
- migration risk is reduced through additive rollout

### Negative / trade-offs

- shared types and DTOs become broader
- repository mapping logic becomes more sophisticated
- more application services and contract files will exist
- implementation will need careful compatibility handling during rollout

### Follow-up tasks created

- update shared graph types and validation schemas
- add enriched CKG node DTOs to API-client and service response shapes
- design Neo4j persistence mapping for first-class enrichment fields
- add manual edge authoring validation and proposal endpoints
- add relation-lifting and relation-review contract implementations

## References

- `C:\Users\anr\Apps\noema\docs\architecture\decisions\ADR-0051-ckg-structured-enrichment-and-edge-authoring.md`
- `C:\Users\anr\Apps\noema\docs\backend\ontology-imports.md`
- `C:\Users\anr\Apps\noema\docs\knowledge-graph-service-implementation\EDGE-TYPE-ONTOLOGY-REFERENCE.md`
- `C:\Users\anr\Apps\noema\packages\types\src\knowledge-graph\index.ts`
- `C:\Users\anr\Apps\noema\services\knowledge-graph-service\src\domain\knowledge-graph-service\ontology-imports.contracts.ts`
