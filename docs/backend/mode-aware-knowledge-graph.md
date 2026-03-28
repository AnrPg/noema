# Mode-Aware Knowledge Graph

## Purpose

This document defines how the shared PKG/CKG substrate supports two different
operating modes without splitting into separate graph systems.

It covers:

- node membership
- graph lenses
- relation-family emphasis
- authoring implications
- query semantics

## Current Implementation Coverage

The knowledge-graph side of the mode-aware architecture is now partially live.

Implemented today:

- node mode membership metadata
- PKG node filtering by active study mode
- knowledge-map mode propagation
- explicit PKG mastery summary read model
- legacy learner-facing consumers such as goals and session summary using that
  explicit summary instead of inventing their own graph mastery aggregation

Still to expand later:

- richer language-specific relation families at scale
- more advanced comparative graph read models
- deeper campaign/recommendation logic that combines graph and scheduler state

## Architectural Position

The graph remains one shared substrate.

This is a hard rule:

- one PKG/CKG substrate per user/canonical system
- no dedicated language-only graph service
- no dedicated knowledge-only graph service

Mode is expressed through:

- `supportedModes`
- node facets and metadata
- relation families
- query filters
- lens-aware frontend rendering

## Node Membership

Each node may support one or both modes.

Recommended additive field:

```ts
supportedModes: LearningMode[];
```

Examples:

- `Mitochondrion` -> `['knowledge_gaining']`
- `embarazada` -> `['language_learning']`
- `Democracy` in a bilingual civics curriculum -> potentially both

## Lens Model

## Knowledge-gaining lens

Primary focus:

- conceptual structure
- factual grounding
- procedural and principle relationships
- canonical comparison and structural guidance

Primary edge emphasis:

- `prerequisite`
- `derived_from`
- `part_of`
- `causes`
- `contrasts_with`
- `has_property`

Typical UX goals:

- identify missing conceptual structure
- explore canonical neighborhoods
- refine prerequisite and conceptual alignment

## Language-learning lens

Primary focus:

- lexical targets
- grammar/construction structure
- usage and interference patterns
- drill grouping and confusable resolution

Illustrative additive edge families:

- `translation_equivalent`
- `false_friend_of`
- `minimal_pair_with`
- `collocates_with`
- `governs`
- `inflected_form_of`
- `used_in_construction`
- `practice_together`

Typical UX goals:

- find confusable items
- visualize grammar neighborhoods
- inspect reusable examples and collocations
- support targeted remediation and drill generation

## Shared Nodes Across Modes

A node shared across modes may:

- have different neighboring relations emphasized
- have different side-panel summaries
- have different readiness/mastery overlays
- participate in different card-generation strategies

This is expected. The lens changes interpretation, not identity.

## Query Semantics

## Basic node reads

Node reads should support:

- `learningMode`
- optional `supportedModes` filter
- optional lens configuration
- stable mode-scoped mastery reads

Behavior:

- if mode is specified, nodes that do not support that mode are excluded unless
  the API is explicitly a neutral admin surface
- if mode is omitted in learner-facing flows, application defaults should
  provide the active mode

## Subgraph and traversal reads

Traversal APIs should be able to:

- filter to nodes relevant in the active mode
- filter or rank visible edges by relation family
- preserve neutral admin/audit access when needed

## Mastery Semantics

The PKG graph now exposes explicit mastery reporting in addition to raw node
reads.

### Stored state

- node-local `masteryLevel` remains the current persisted mastery signal
- learner-facing reads must still be scoped by `studyMode`

### Explicit summary read model

The graph service exposes:

- `GET /api/v1/users/:userId/pkg/mastery/summary`

Required query parameter:

- `studyMode`

Optional query parameters:

- `domain`
- `masteryThreshold`

The summary is intentionally backend-owned so that:

- goals pages
- dashboards
- agent tools
- future campaign planning flows

all consume the same interpretation of mastery bands and domain rollups.

### Mastery bands

The current summary bands are:

- `untracked`
- `emerging`
- `developing`
- `mastered`

These bands are stable read-model concepts. They are not a license for each
frontend surface to invent new thresholds silently.

The same physical graph can therefore yield different learner-facing subgraphs
depending on the active mode.

## Suggestion and comparison reads

Mode affects:

- which candidate relations are surfaced
- which missing-node suggestions matter
- which graph neighborhoods count as educationally relevant

For example:

- in knowledge mode, missing conceptual prerequisites are prominent
- in language mode, confusable clusters and construction relations may be more
  valuable than prerequisite chains

## Authoring Implications

## Knowledge mode authoring

The graph should continue supporting:

- conceptual nodes
- PKG node editing
- conceptual edges and canonical suggestions

## Language mode authoring

The graph should support additive language structure such as:

- lexical anchors
- grammar/construction nodes
- reusable examples where appropriate
- language-specific relation authoring

The UI should not expose every possible language relation at once if that would
overwhelm users. Lenses may prioritize a practical subset while keeping the
underlying ontology richer.

## Data Modeling Guidance

Language support should not live only in generic `properties`. Real graph-native
relations should remain first-class where they matter for:

- queryability
- drill generation
- graph visualization
- reviewer/admin understanding

Facets are still useful for node-local language metadata:

- language code
- lemma
- part of speech
- CEFR or frequency signals
- script, register, pronunciation references

But relation-heavy semantics belong in edges, not only in bags of metadata.

## Risks

### Overloading one lens with the other's semantics

Risk:

- knowledge surfaces become noisy with language-only relations
- language surfaces become distorted by concept-only assumptions

Mitigation:

- explicit lens filtering and prioritization
- mode-specific side-panel summaries

### Using metadata where graph structure is required

Risk:

- false-friend or minimal-pair structures become hidden and unqueryable

Mitigation:

- keep genuinely relational semantics as edges

### Splitting the graph informally through duplicated nodes

Risk:

- same learning object copied into disconnected graph islands just to handle
  mode differences

Mitigation:

- prefer shared identity + supportedModes + mode-scoped progress

## Acceptance Criteria

This graph architecture is behaving correctly when:

- one substrate can power both lenses
- nodes can support one or both modes
- language-specific relations are additive and queryable
- learner-facing graph reads change meaningfully by mode
- admin or neutral surfaces can still inspect the full structure

## Related Documents

- `architecture.md`
- `docs/architecture/decisions/ADR-0056-domain-lensed-graph-semantics-and-multi-mode-membership.md`
- `docs/frontend/mode-aware-knowledge-map.md`
