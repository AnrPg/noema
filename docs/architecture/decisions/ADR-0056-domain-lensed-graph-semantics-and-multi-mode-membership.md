# ADR-0056: Domain-Lensed Graph Semantics and Multi-Mode Membership

## Status

Accepted

## Date

2026-03-27

## Context

The current graph architecture is a major asset:

- PKG/CKG is already the structural center of the system
- cards link to nodes rather than owning graph structure
- graph operations, comparison, and structural metrics already exist

The challenge is semantic breadth. The current graph is especially well-suited
to conceptual learning and prerequisite-aware structure, but language learning
needs more than that:

- lexical relations
- grammatical/construction relations
- confusable and interference relations
- pedagogical groupings for drill generation

At the same time, sciences and facts must continue to benefit from the current
graph without becoming just one lens over a language-first ontology.

The graph therefore needs a model that supports different semantic emphases
without splitting into separate graph systems.

## Decision

### 1) Keep one shared graph substrate

There remains one PKG/CKG substrate.

We explicitly reject:

- separate language graph database
- separate knowledge graph database
- parallel graph clients or duplicate graph editing stacks

### 2) Introduce mode lenses over the graph

Graph consumers operate through mode lenses:

- `knowledge_gaining` lens
- `language_learning` lens

Lenses affect:

- visible relation families
- ranking and prioritization
- graph authoring affordances
- node summaries and side-panel emphasis
- suggestion systems

### 3) Add `supportedModes` membership to nodes and cards

Nodes and cards may declare:

```ts
supportedModes: LearningMode[];
```

This allows:

- knowledge-only items
- language-only items
- shared items

### 4) Preserve current knowledge semantics as the knowledge-mode baseline

`knowledge_gaining` remains strongly aligned with current graph semantics:

- prerequisite
- derived-from
- part-of
- causes
- contrasts-with
- related structural and canonical-comparison features

### 5) Add language semantics as additive graph capability

Language learning semantics are introduced additively as relation families and
node facets that can be emphasized by the language lens.

Illustrative relation families:

- lexical equivalence/translation
- false-friend/confusable relations
- minimal-pair relations
- collocation relations
- inflection or form relations
- grammar/construction usage relations
- pedagogical drill-group relations

These semantics are additive. They do not replace or invalidate the current
graph model.

### 6) Multi-mode membership does not imply identical lens behavior

A shared node/card may appear differently by mode:

- different visible relations
- different ranking and hints
- different drill suggestions
- different mastery overlays

That is expected and intentional.

## Rationale

### Why lenses instead of subgraphs or separate ontologies

- Lenses preserve one structural substrate.
- The same object can be interpreted through different pedagogical contexts.
- The frontend can remain graph-native rather than opening disconnected tools.

### Why additive language semantics

- Language learning needs graph-native relations, not just metadata.
- Existing knowledge semantics are still highly valuable.
- Additive design keeps both domains first-class.

### Why multi-mode membership matters

- Some items genuinely cross contexts.
- Preventing overlap would force duplication and weaken reuse.
- Shared membership plus mode-scoped progress is more precise than universal
  duplication.

## Alternatives Considered

| Option                                                         | Pros                 | Cons                                                                  | Rejected because                             |
| -------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------- | -------------------------------------------- |
| Separate language and knowledge subgraphs with minimal overlap | Strong local clarity | Duplicate tooling and weaker shared identity                          | It over-separates the platform               |
| One giant undifferentiated ontology                            | Single vocabulary    | Noisy, hard to reason about, weak mode focus                          | Lenses provide better structure              |
| Metadata-only language support                                 | Simpler first step   | Not graph-native; poor reasoning for confusables/collocations/grammar | Important relations would be hidden in blobs |

## Consequences

### Positive

- one graph remains central to the platform
- both product uses get native graph semantics
- authoring, visualization, and analysis can stay unified
- future domain lenses become easier to add

### Negative / trade-offs

- graph contracts and UI behaviors become richer
- query/filter semantics become more complex
- mode-aware graph testing grows in scope

### Follow-up tasks created

- add `supportedModes` to graph and content contracts
- define language-specific relation families and validation paths
- add lens-aware graph APIs and frontend rendering rules
- document batch generation and graph authoring differences by mode

## References

- `architecture.md`
- `docs/backend/mode-aware-knowledge-graph.md`
- `docs/frontend/mode-aware-knowledge-map.md`
- `docs/knowledge-graph-service-implementation/EDGE-TYPE-ONTOLOGY-REFERENCE.md`
