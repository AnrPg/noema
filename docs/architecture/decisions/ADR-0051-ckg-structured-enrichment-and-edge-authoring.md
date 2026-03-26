# ADR-0051: CKG Structured Enrichment and Edge Authoring

## Status

Accepted

## Date

2026-03-27

## Context

Noema's Canonical Knowledge Graph (CKG) currently has a stable core mutation
pipeline, a policy-driven edge validation model, and an ontology-import workflow
that can fetch, parse, normalize, and stage reviewable mutation previews. That
foundation is useful, but it is still too lossy and too narrow for the next
stage of graph authoring and ontology integration.

The current gaps are now architectural, not just implementation detail:

1. The current canonical node model is too lossy.
   - Canonical nodes are structurally small and consistent, but too much
     ontology-derived value is buried in generic `properties`.
   - Agents and reviewers cannot reliably distinguish canonical semantics from
     source-specific overflow.
   - Review and search workflows lose leverage because aliases, external
     references, mappings, provenance, and confidence information are not
     promoted to first-class graph concepts.

2. The ontology relation-import path is under-specified.
   - The current import pipeline can stage relation candidates and generate
     blocked or ready mutation previews, but it does not yet define a strong
     architecture for lifting relation hints from heterogeneous ontology
     metadata.
   - Sources such as ESCO, YAGO, ConceptNet, WordNet, UNESCO, Getty, LoC,
     OpenAlex, and GeoNames express relation semantics differently. Some use
     explicit predicates, others rely on hierarchical fields, classification
     links, typed `_links`, lexical relations, or authority metadata.
   - Directly mapping those source-native signals into final CKG edge types is
     too brittle and hides inference uncertainty from reviewers.

3. Manual edge creation lacks a graph-native authoring workflow.
   - The mutation API supports `add_edge`, but there is no locked architecture
     for expert graph-native edge authoring in the admin graph UI.
   - We need a workflow that keeps users inside the graph, teaches them the
     policy repertoire, and routes all writes through the existing mutation
     pipeline.

4. The edge repertoire is broader than current import support.
   - The domain model and ontology reference already define a 17-edge canonical
     repertoire.
   - Current ontology-import support only covers a subset of those edges during
     normalization and mutation preview generation.
   - Without an explicit architectural decision, later work risks narrowing the
     canonical graph around current implementation coverage instead of the full
     spec.

At the same time, Noema has already made several durable architectural
commitments that this work must respect:

- ontology imports stay inside `knowledge-graph-service`
- CKG publication always flows through the mutation/review pipeline
- edge validation remains policy-driven
- hexagonal architecture boundaries remain strict
- source provenance must remain inspectable and auditable

Phase 1 is therefore a documentation and architecture-only phase whose job is to
remove ambiguity before any schema, UX, or adapter implementation begins.

## Decision

### 1) Adopt graph-native manual edge authoring as the canonical admin workflow

Manual CKG edge creation will use the graph canvas as the primary authoring
surface.

The canonical interaction model is:

1. the reviewer selects a source node in the graph
2. the reviewer right-clicks a target node
3. the system opens a `Create relation` context menu grouped by ontological
   category
4. all 17 canonical relations are shown
5. allowed relations are active
6. disallowed relations remain visible but greyed out with blocked reasons
7. confirmation creates a standard CKG mutation proposal containing `add_edge`

This workflow is authoritative for expert users because it:

- keeps authoring inside graph context
- teaches the relation repertoire instead of hiding it
- exposes policy constraints at the point of action
- preserves mutation-pipeline governance instead of bypassing it

Accessibility and platform fallbacks are also part of the contract:

- keyboard fallback: select source, focus target, invoke command/action menu
- touch fallback: long-press or node action sheet
- right-click remains the primary expert interaction, but not the only path

### 2) Introduce an intermediate source-relation layer for ontology-derived edges

Ontology metadata will not map directly to final CKG edge types.

Instead, every source must pass through this relation-lifting pipeline:

1. source-native relation hint extraction
2. source-specific semantic lifting into an intermediate source-relation
   vocabulary
3. candidate CKG edge-type mapping
4. confidence scoring and blocking
5. reviewer resolution or override
6. `add_edge` mutation generation

This is a hard architectural boundary.

Responsibilities are split as follows:

- parser adapters may extract relation hints from raw source structures
- source-specific lifting adapters interpret those hints into source relations
- normalization maps source relations into candidate canonical edges
- mutation generation only consumes normalized relation candidates

This preserves source semantics, makes inference inspectable, and prevents
premature canonicalization.

### 3) Strengthen the CKG node model with typed enrichment fields

The canonical node model will remain small at its core but gain a structured
enrichment layer.

The core remains:

- `nodeId`
- `graphType`
- `nodeType`
- `label`
- `description`
- `domain`
- `createdAt`
- `updatedAt`

The first-class enrichment layer to introduce is:

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

The generic `properties` bag remains, but it is explicitly demoted to:

- raw source overflow
- source-specific enrichment that is not semantically stable across sources
- low-confidence or experimental metadata that should not yet become part of the
  canonical graph contract

This gives agents and reviewers better first-class signals without forcing every
source-specific nuance into the canonical node shape.

### 4) Promote ontology-derived fields aggressively, but only when evidence-based

Noema will promote as many ontology-derived fields as possible into the
first-class node model, but field promotion is not automatic.

A source-derived field becomes first-class only if it satisfies all of:

- semantically stable across sources
- useful in graph querying, search, matching, or review UX
- can be populated without source-specific parsing hacks in at least one
  backbone source and expected follow-on sources
- meaningful even when only partially populated
- likely to improve agent or reviewer decisions

If a field fails this test, it remains in:

- source-specific enrichment structures, or
- `properties`

This rule exists to avoid top-level schema inflation with fields that look rich
but are empty, noisy, or source-locked in practice.

### 5) Lock the full 17-edge repertoire as the canonical relation vocabulary

All future work on manual authoring, validation, ontology normalization,
mutation review, and graph UI will use the full 17-edge repertoire already
defined in Noema's shared ontology reference:

- `is_a`
- `exemplifies`
- `part_of`
- `constituted_by`
- `equivalent_to`
- `entails`
- `disjoint_with`
- `contradicts`
- `causes`
- `precedes`
- `depends_on`
- `related_to`
- `analogous_to`
- `contrasts_with`
- `prerequisite`
- `derived_from`
- `has_property`

Current ontology-import support is explicitly recognized as partial coverage,
not as a new canonical subset.

That means:

- manual authoring must expose all 17, filtered by policy
- normalization and import review must target the full set over time
- backend policy, DTOs, and reviewer UX must assume the full repertoire as the
  stable vocabulary

## Rationale

### Why graph-native edge authoring

- It matches how reviewers think about graph structure: node-to-node, in
  context, not via detached forms.
- It gives immediate feedback on allowed vs blocked relations.
- It routes all authoring through the existing mutation-review discipline.
- It creates a natural place to teach ontology constraints through the UI.

### Why an intermediate source-relation layer

- Source-native relation semantics are heterogeneous and often ambiguous.
- Direct mapping from source metadata to CKG edges would be opaque and brittle.
- Reviewers need to see why a relation was proposed, not just the final guess.
- Intermediate source relations preserve source truth while still allowing a
  canonical graph vocabulary downstream.

### Why a typed enrichment layer

- The current `properties` bag is too unconstrained to support strong reviewer
  and agent workflows.
- Search, deduplication, matching, and ontology review benefit from aliases,
  provenance, mappings, and authoritative external references being explicit.
- The canonical node must remain stable, but stability does not require
  minimalism to the point of semantic loss.

### Why evidence-based promotion instead of "everything top-level"

- Not every source field is portable or meaningful across ontologies.
- A field that is sparsely populated or source-locked adds long-term API and
  persistence complexity without enough decision value.
- Promotion should be aggressive where fields improve graph reasoning, but it
  must remain disciplined.

### Why lock the full edge repertoire now

- The relation ontology is already defined.
- Narrowing the graph to current import coverage would encode accidental
  implementation limits into the domain model.
- A stable full repertoire makes later source adapters, UI menus, and policy
  work converge on the same canonical target.

## Alternatives Considered

| Option                                                              | Pros                          | Cons                                                           | Rejected because                                                             |
| ------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Modal-only manual edge creation                                     | Simpler to implement at first | Breaks graph context, hides relation semantics, teaches less   | It weakens expert review flow and disconnects authoring from graph structure |
| Direct source-to-CKG relation mapping                               | Faster initial implementation | Opaque, brittle, hides inference uncertainty, overfits sources | It collapses source semantics too early and makes reviewer trust worse       |
| Keep most ontology metadata in `properties`                         | Minimal schema churn          | Too lossy for agents, reviewers, and query surfaces            | It preserves technical flexibility at the cost of semantic usability         |
| Restrict canonical repertoire to currently implemented import edges | Easier short-term scope       | Makes current implementation limits look canonical             | The existing ontology reference already defines a richer stable target       |

## Consequences

### Positive

- reviewer and agent decision quality improves through better structured graph
  metadata
- ontology relation inference becomes inspectable and explainable
- manual edge authoring gains a native expert workflow
- future source adapters have clearer contracts
- the graph model becomes more interoperable across ontology families

### Negative / trade-offs

- domain contracts become more complex
- persistence and API DTOs will grow in later phases
- source audits become a required step before schema promotion
- relation normalization will require more explicit modeling than direct mapping

### Follow-up tasks created

- Phase 2: contract, DTO, and repository design for enriched nodes and relation
  candidates
- Phase 2: frontend contract implementation for graph-native edge authoring
- Phase 2: relation-lifting contracts and review DTOs
- Phase 3: ESCO-first implementation rollout
- Phase 3: YAGO and ConceptNet relation-lifting rollout
- Phase 3: follow-on source adoption for UNESCO, WordNet, Getty, LoC, OpenAlex,
  and GeoNames

## References

- `C:\Users\anr\Apps\noema\docs\architecture\decisions\ADR-0010-content-domain-and-knowledge-graph-integration.md`
- `C:\Users\anr\Apps\noema\docs\architecture\decisions\ADR-0045-knowledge-graph-service-phase8e-ontological-guardrails.md`
- `C:\Users\anr\Apps\noema\docs\architecture\decisions\ADR-0050-ontology-imports-pipeline-architecture.md`
- `C:\Users\anr\Apps\noema\docs\knowledge-graph-service-implementation\EDGE-TYPE-ONTOLOGY-REFERENCE.md`
- `C:\Users\anr\Apps\noema\docs\backend\ontology-imports.md`
