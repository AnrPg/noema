# 2026-03-27 - Phase 1 Plan: CKG Structured Enrichment and Edge Authoring

## Objective

Phase 1 is a documentation and architecture-only phase. It does not modify
runtime behavior, persistence, DTOs, or UI implementation. Its job is to make
later implementation decision-complete by locking:

- the graph-native manual edge-authoring workflow
- the ontology relation-lifting architecture
- the stronger CKG node metadata model
- the field-promotion rubric for ontology-derived enrichment
- the full 17-edge canonical repertoire
- the ontology source audit matrix used to justify node-field promotion and
  relation-lifting strategy

This phase produces two authoritative artifacts:

- `C:\Users\anr\Apps\noema\docs\architecture\decisions\ADR-0051-ckg-structured-enrichment-and-edge-authoring.md`
- `C:\Users\anr\Apps\noema\docs\plans\2026-03-27-phase-1-ckg-structured-enrichment-and-edge-authoring.md`

## Locked Decisions

### 1. Manual edge authoring is graph-native

The canonical reviewer workflow is:

1. select a source node in the CKG graph
2. right-click a target node
3. open a `Create relation` context menu grouped by ontological category
4. display all 17 canonical relations
5. allow only relations that pass policy checks
6. leave disallowed relations visible but blocked with explanations
7. create a normal mutation proposal on confirmation

The workflow does not bypass the mutation-review pipeline.

### 2. Ontology-derived relations are lifted in two steps

The architecture is:

1. source-native relation hint extraction
2. source-specific semantic lifting into an intermediate source-relation
   vocabulary
3. mapping into candidate CKG edge types
4. confidence scoring and blocking
5. reviewer resolution
6. `add_edge` mutation generation

No source is allowed to map metadata directly into canonical CKG relations
without passing through an intermediate source-relation layer.

### 3. Node enrichment is broad but evidence-based

The stronger CKG node shape will promote ontology-derived fields into
first-class graph metadata when they are:

- semantically stable
- queryable and useful
- realistically populated by the ontology set
- meaningful even when only partially filled
- useful for agents or reviewers

All other source detail remains in source-specific structures or in
non-canonical `properties`.

### 4. The canonical repertoire is the full 17-edge ontology

Later implementation must converge on the full existing relation repertoire.
Current import support is treated as partial coverage only.

## Hexagonal Architecture Breakdown

## UI / Frontend Layer

Phase 1 defines UX contracts, not component implementation.

### Manual graph authoring UX contract

The graph canvas must later support these authoring states:

- `idle`
- `source-selected`
- `target-preview`
- `confirm-mutation`

Behavioral contract:

- selecting the source node visually pins it
- hovering or focusing another node exposes relation affordances
- right-clicking the target opens the relation menu
- the relation menu derives its options from shared backend/domain policy data
- blocked relations remain visible and explain why they are unavailable

Blocked reasons that the UI must be able to render:

- invalid source/target type pairing
- acyclicity risk
- duplicate edge
- forbidden for current node statuses
- reviewer-policy restriction or conflict state

The confirmation surface must later include:

- source label
- target label
- selected relation
- rationale input
- optional confidence/comment field
- subgraph preview hint

### Accessibility and fallback contract

The graph-native interaction must later have non-pointer fallbacks:

- keyboard workflow for source selection and target action invocation
- touch workflow via long-press or action sheet

These are contractual requirements even though their final detailed UI can be
refined in implementation phases.

### Ontology-review UX contract

The import run detail experience must later separate:

- `Nodes`
- `Relations`
- `Mappings`

Each relation candidate must expose:

- source relation type
- source evidence
- endpoint resolution status
- candidate CKG edge types
- confidence band
- blocking reasons

Reviewer actions to support:

- approve relation
- reject relation
- remap subject
- remap object
- defer until endpoint promotion

The frontend must treat review hints as structured data from the backend, not as
text parsed from rationale strings.

## Application Layer

Phase 1 defines use-case boundaries and orchestration contracts.

### Manual edge authoring use case

Target contract:

- input:
  - source node id
  - target node id
  - candidate edge type
  - rationale
  - optional reviewer confidence/comment
- behavior:
  - evaluate policy eligibility before mutation creation
  - derive blocked reasons in structured form
  - generate a standard mutation proposal containing `add_edge` when allowed
- output:
  - ready mutation proposal, or
  - blocked result with machine-readable reasons

### Ontology relation-lifting use case

Target contract:

- input:
  - parsed source-truth batch
- output:
  - normalized relation candidates that preserve intermediate source-relation
    semantics
- guarantees:
  - no direct collapse into final CKG relations
  - confidence and blocking are explicit
  - reviewer-visible explanations are carried in structured fields

### Review-state contract

The application layer must later distinguish at least:

- `ready`
- `blocked`
- `reviewer_overridden`
- `endpoint_unresolved`

These states must be explicit in the response contract so the frontend does not
infer workflow semantics from prose.

## Domain Layer

Phase 1 defines the target domain model additions that later phases will
implement.

### Stronger CKG node shape

The target node model is:

Core canonical fields:

- `nodeId`
- `graphType`
- `nodeType`
- `label`
- `description`
- `domain`
- `createdAt`
- `updatedAt`

Structured enrichment fields:

- `aliases: string[]`
- `languages: string[]`
- `tags: string[]`
- `semanticHints: string[]`
- `canonicalExternalRefs: ICanonicalExternalRef[]`
- `ontologyMappings: IOntologyMapping[]`
- `provenance: INodeProvenanceEntry[]`
- `reviewMetadata: INodeReviewMetadata | null`
- `sourceCoverage: ISourceCoverageSummary | null`
- `status: CkgNodeStatus`

Overflow field:

- `properties`

#### Meaning of first-class fields

- `aliases`
  - canonical and imported alternative labels used for search, matching,
    deduplication, and review
- `languages`
  - languages represented in labels and aliases
- `tags`
  - lightweight topical or curator-facing labels
- `semanticHints`
  - source-type descriptors, class names, or ontology cues useful to agents and
    reviewers without making them core graph identity
- `canonicalExternalRefs`
  - authoritative cross-system identifiers such as ESCO URIs, YAGO identifiers,
    WordNet synsets, GeoNames identifiers, OpenAlex identifiers, Getty ids, and
    LoC authority refs
- `ontologyMappings`
  - cross-source exact, close, broad, narrow, or related matches with confidence
    and provenance
- `provenance`
  - lineage from source, version, run, artifact, and harvesting context
- `reviewMetadata`
  - structured reviewer and system trust signals such as confidence, conflict
    flags, reviewer notes, and override state
- `sourceCoverage`
  - summary of which sources currently enrich the node and how strong that
    enrichment is
- `status`
  - lifecycle and trust state, for example:
    - `active`
    - `deprecated`
    - `merged`
    - `split`
    - `disputed`

### Source relation-lifting contracts

The following conceptual contracts are locked for later implementation:

- `ISourceRelationHint`
- `ISourceRelationCandidate`
- `INormalizedOntologyRelationCandidateV2`
- `IEndpointResolutionStatus`
- `IRelationInferenceReason`
- `IRelationBlockingReason`

#### `ISourceRelationHint`

Purpose:

- raw relation-bearing evidence extracted directly from parser output or source
  structures before semantic lifting

Required shape:

- `externalId`
- `sourceId`
- `subjectExternalId`
- `objectExternalId`
- `hintType`
- `rawPredicate`
- `evidence`
- `properties`
- `provenance`

#### `ISourceRelationCandidate`

Purpose:

- source-specific semantic interpretation of one or more relation hints before
  candidate CKG mapping

Required shape:

- `externalId`
- `sourceId`
- `sourceRelationType`
- `subjectExternalId`
- `objectExternalId`
- `confidenceScore`
- `inferenceReasons`
- `properties`
- `provenance`

#### `INormalizedOntologyRelationCandidateV2`

Purpose:

- canonical review-stage relation candidate that still preserves intermediate
  source semantics

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

#### `IEndpointResolutionStatus`

Purpose:

- explicit subject/object canonical resolution state for review and mutation
  generation

Required conceptual fields:

- `subject`
- `object`
- each endpoint reports:
  - `resolutionState`
  - `canonicalNodeId`
  - `matchedLabel`
  - `confidenceScore`
  - `conflictFlags`

#### `IRelationInferenceReason`

Purpose:

- reviewer-visible explanation for why a relation was inferred

Required conceptual fields:

- `kind`
- `message`
- `sourceField`
- `weight`

#### `IRelationBlockingReason`

Purpose:

- machine-readable explanation for why a relation cannot yet become a mutation

Required conceptual fields:

- `kind`
- `message`
- `blocking`
- `suggestedAction`

### Field promotion rubric

A source-derived field becomes first-class only if all of the following are
true:

- semantically stable across sources
- useful in graph querying, resolution, or review workflows
- can be populated without source-specific hacks in at least one backbone source
  and expected follow-on sources
- meaningful even when partially populated
- likely to improve agent or reviewer decisions

If a field does not satisfy the rubric, it remains:

- in a source-specific enrichment structure, or
- in `properties`

This rule prevents top-level schema growth from drifting into a dumping ground.

## Adapters / Infrastructure Layer

Phase 1 does not implement adapters, but it defines their future
responsibilities.

Required adapter families:

- source parsers
  - extract concept, alias, mapping, and raw relation-bearing hints
- source relation-lifting adapters
  - transform raw metadata patterns into intermediate source relations
- persistence adapters
  - later support structured enrichment fields and relation-candidate review
    data
- graph repository adapters
  - later persist and retrieve enriched nodes and extended relation candidate
    metadata
- API mappers
  - later expose enriched node DTOs and structured relation-review DTOs

The source audit matrix below is an infrastructure planning artifact, not an
appendix. Future implementation phases must consult it before promoting fields
or committing relation-lifting scope.

## Promoted-Field Taxonomy

### Immediate first-class promotion candidates

These are promoted because they are broadly useful and likely fillable from the
ontology portfolio:

- `aliases`
- `languages`
- `semanticHints`
- `canonicalExternalRefs`
- `ontologyMappings`
- `provenance`
- `reviewMetadata`
- `sourceCoverage`
- `status`

### Strong candidates, but likely partially populated

- `tags`
  - useful, but may need curation or normalization strategy before they become
    high-signal

### Keep outside first-class schema for now

These stay out until later evidence justifies them:

- large raw source payload fragments
- source-specific link structures
- verbose or unstable classification trees
- weak or source-locked scoring artifacts
- experimental extraction traces that are useful for debugging but not for
  stable graph querying

## Source Audit Matrix

This matrix estimates likely support quality for first-class node enrichment and
automatic relation lifting.

Legend:

- `Strong`
- `Moderate`
- `Weak`
- `Narrow`

| Source     | External refs | Aliases  | Languages | Descriptions | Class/type signals | Hierarchical hints | Associative hints | Logical hints | Causal/temporal hints | Mapping/equivalence hints | Provenance quality | Auto relation-lifting confidence |
| ---------- | ------------- | -------- | --------- | ------------ | ------------------ | ------------------ | ----------------- | ------------- | --------------------- | ------------------------- | ------------------ | -------------------------------- |
| YAGO       | Strong        | Moderate | Weak      | Moderate     | Strong             | Strong             | Moderate          | Moderate      | Weak                  | Moderate                  | Strong             | Moderate                         |
| ConceptNet | Moderate      | Strong   | Strong    | Weak         | Moderate           | Moderate           | Strong            | Moderate      | Weak                  | Moderate                  | Moderate           | Moderate                         |
| ESCO       | Strong        | Strong   | Strong    | Moderate     | Strong             | Strong             | Moderate          | Weak          | Weak                  | Strong                    | Strong             | Strong                           |
| UNESCO     | Strong        | Moderate | Strong    | Moderate     | Strong             | Strong             | Moderate          | Weak          | Weak                  | Moderate                  | Strong             | Moderate                         |
| WordNet    | Strong        | Strong   | Moderate  | Strong       | Strong             | Strong             | Moderate          | Strong        | Weak                  | Strong                    | Strong             | Strong                           |
| Getty      | Strong        | Moderate | Moderate  | Moderate     | Strong             | Strong             | Moderate          | Weak          | Weak                  | Strong                    | Strong             | Moderate                         |
| LoC        | Strong        | Moderate | Moderate  | Moderate     | Strong             | Strong             | Moderate          | Weak          | Weak                  | Strong                    | Strong             | Moderate                         |
| OpenAlex   | Strong        | Weak     | Moderate  | Moderate     | Moderate           | Weak               | Moderate          | Weak          | Weak                  | Moderate                  | Strong             | Weak                             |
| GeoNames   | Strong        | Moderate | Moderate  | Weak         | Moderate           | Strong             | Weak              | Weak          | Weak                  | Moderate                  | Strong             | Moderate                         |

## Source-Specific Expectations

### Backbones

- `ESCO`
  - strong aliases
  - strong external refs
  - strong typed class signals
  - strong link-based relation hints
  - moderate direct mapping quality
  - first proving-ground for relation lifting

- `YAGO`
  - strong ids
  - strong taxonomic and hierarchical signals
  - moderate relation richness
  - strong backbone value for entity typing and linking

- `ConceptNet`
  - strong associative relation coverage
  - weaker canonical precision
  - strong multilingual hints
  - useful for expansion and cross-lingual enrichment, but requires review
    discipline

- `WordNet`
  - strong lexical relations
  - strong synonymy and hypernymy structure
  - strong candidate source for aliases, mappings, and logical/taxonomic hints

- `UNESCO`
  - strong controlled-vocabulary hierarchy
  - good authority metadata
  - useful for domain taxonomy enrichment

### Enhancements

- `Getty`
  - strong authority metadata and vocabulary hierarchy
  - useful for disciplined external refs and mappings

- `LoC`
  - strong authority records and controlled relationships
  - useful for stable external refs and topical hierarchies

- `OpenAlex`
  - strong scholarly entity refs and topical coverage
  - weaker pedagogical relation semantics
  - likely better for node enrichment than for strong automatic edge creation

- `GeoNames`
  - strong geographic identifiers and hierarchy
  - narrow relation repertoire
  - useful where place semantics intersect with canonical nodes

## Frontend UX State Model

The graph-native edge-authoring state machine is locked as:

- `idle`
  - no source selected
- `source-selected`
  - a node is pinned as the relation source
- `target-preview`
  - a second node is hovered, focused, or otherwise staged as the potential
    target
- `confirm-mutation`
  - an allowed relation has been selected and the user is confirming the
    mutation proposal

Required transitions:

- `idle -> source-selected`
  - user selects source node
- `source-selected -> target-preview`
  - user hovers or focuses target candidate
- `source-selected -> confirm-mutation`
  - user right-clicks target and chooses an allowed relation
- `confirm-mutation -> idle`
  - user submits or cancels
- `source-selected -> idle`
  - user clears selection or clicks elsewhere

Required policy rendering behavior:

- menu content comes from shared policy contracts
- blocked relations are visible and explained
- the UI never invents relation availability independently of backend/domain
  policy

## Acceptance Criteria

Phase 1 is complete when the ADR and this phase plan together make later
implementation decision-complete.

Required acceptance criteria:

- the manual edge-authoring UX is fully specified
- the ontology relation-lifting architecture is fully specified
- the full 17-edge repertoire is formally locked as canonical
- the enriched node metadata model is defined with purposes and promotion rules
- the ontology source audit matrix exists for all targeted sources
- the role of each hexagonal layer is explicitly defined
- no implementer must guess:
  - where relation inference lives
  - which node fields are canonical vs overflow
  - which relations are available in authoring and review
  - how manual authoring enters the mutation pipeline

## Assumptions and Defaults

- `ADR-0051` is the next available ADR number.
- Phase 1 is documentation and architecture only.
- Right-click remains the primary expert interaction for graph-native edge
  authoring.
- Keyboard and touch fallbacks are contractual requirements, but their final UI
  details are deferred.
- Node enrichment promotion is intentionally broad, but promotion remains
  evidence-based.
- ESCO is the first proving-ground source for relation lifting because its
  metadata and link structures offer the strongest immediate signal set.
