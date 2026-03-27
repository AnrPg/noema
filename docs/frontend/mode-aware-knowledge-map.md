# Mode-Aware Knowledge Map

## Purpose

This document defines how the learner-facing Knowledge Map should behave once
Noema supports mode-aware graph semantics.

The map remains one shared graph workspace, but its presentation and action
model become lens-based.

## Shared Workspace Principle

There is still one `/knowledge` workspace.

The page does not split into:

- a separate language graph page
- a separate knowledge graph page

Instead, the active `LearningMode` selects the graph lens.

## Lens Behavior

## Knowledge-gaining lens

Priorities:

- conceptual structure
- canonical comparison
- missing prerequisite and conceptual suggestions
- part/whole and causal structure

UI emphasis:

- current PKG/CKG comparison affordances
- concept-oriented side panels
- structural suggestions that improve conceptual coherence

## Language-learning lens

Priorities:

- lexical targets
- grammar/construction neighborhoods
- confusable and false-friend clusters
- collocations and usage relations

UI emphasis:

- language-specific relation groups
- example/usage context where relevant
- drill-oriented neighborhoods such as confusable or practice-together groups

## Node Presentation

Side panels and badges should adapt by mode.

### Shared node/card support

If a node supports both modes:

- show that explicitly when relevant
- keep progress overlays scoped to the active mode

### Language-oriented metadata

Where present, language lens may foreground:

- language code
- lemma
- part of speech
- pronunciation or register cues
- example usage summaries

### Knowledge-oriented metadata

Knowledge lens may foreground:

- concept classification
- canonical alignment signals
- structural role
- prerequisite and dependency context

## Edge Visibility

Mode changes which relation families are visually emphasized.

### Knowledge-gaining lens

Favor:

- `prerequisite`
- `derived_from`
- `part_of`
- `causes`
- `contrasts_with`

### Language-learning lens

Favor:

- `translation_equivalent`
- `false_friend_of`
- `minimal_pair_with`
- `collocates_with`
- `governs`
- `inflected_form_of`

The implementation may still allow advanced users to reveal more relations, but
the default lens should keep the graph legible and purposeful.

## Authoring Differences

## Knowledge mode authoring

Common actions:

- create/edit conceptual nodes
- add conceptual or pedagogical edges
- review canonical structural suggestions

## Language mode authoring

Common actions:

- create/edit lexical or structural language nodes
- add language-specific relations
- work with drill-oriented neighborhoods and grammar structures

Authoring must still go through the same backend ownership boundaries.

## Empty and Transitional States

### Empty graph in language mode

Explain that the learner can:

- import vocabulary
- add grammar/construction targets
- start from text/dialogue material

### Empty graph in knowledge mode

Explain that the learner can:

- scaffold concept nodes
- import fact/concept material
- use canonical suggestions

## Acceptance Criteria

- the same page supports both modes through clear lenses
- relation emphasis changes meaningfully by mode
- node details surface the right context per mode
- multi-mode items remain understandable
- the page does not feel like two disconnected products

## Related Documents

- `docs/architecture/decisions/ADR-0056-domain-lensed-graph-semantics-and-multi-mode-membership.md`
- `docs/frontend/learning-mode-toggle.md`
- `docs/backend/mode-aware-knowledge-graph.md`
