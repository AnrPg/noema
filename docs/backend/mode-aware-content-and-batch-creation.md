# Mode-Aware Content and Batch Creation

## Purpose

This document defines how card authoring and batch import should behave when
Noema operates in different learning modes.

The core principle is:

- one content subsystem
- one batch pipeline
- different strategy defaults by mode

## Shared Content Contract

Cards keep one identity model, but can participate in one or both modes.

Recommended additive contract:

```ts
supportedModes: LearningMode[];
```

This field answers:

- where the card may appear
- where it may be scheduled
- which session contexts may include it

It does not itself store scheduling or mastery state.

## Mode-Aware Authoring Defaults

## Knowledge gaining

Default targets:

- concepts
- facts
- procedures
- principles

Default graph-linking behavior:

- resolve or create concept-centric PKG nodes
- attach cards to concept/procedure/principle/fact nodes
- suggest conceptual structure where appropriate

Typical card families:

- definition
- comparison
- cause-effect
- ordering
- concept graph
- contrastive pair
- boundary case

## Language learning

Default targets:

- vocabulary items
- multiword expressions
- grammar/construction targets
- dialogue/text-derived study targets

Default graph-linking behavior:

- resolve or create lexical or structural language targets
- attach cards to lexical anchors, grammar nodes, or reusable examples when
  appropriate
- prioritize language-specific drill and interference structures

Typical card families:

- recall
- production
- listening/audio
- minimal pair
- false friend
- confusable set drill
- rule scope
- boundary case
- transformation

## Batch Import Pipeline

## Shared pipeline remains

The service-level import workflow remains:

- preview
- explicit mapping
- execute
- batch history / rollback

Mode changes:

- target extraction defaults
- inferred card families
- graph-link suggestions
- validation warnings

## Preview behavior

Preview should be mode-aware and explicit.

Recommended preview sections:

- detected source family and parsed records
- active mode
- detected study targets
- proposed graph links
- proposed card families
- ambiguity warnings
- unmapped or overflow fields

### Knowledge-mode preview emphasis

- candidate concept/fact/procedure targets
- missing conceptual labels or duplicate concepts
- likely conceptual card families

### Language-mode preview emphasis

- lexical anchors and phrases
- grammar/construction candidates
- confusable or ambiguity signals
- likely language-specific card families

## Execution behavior

Execution should:

- preserve the selected mode in created cards
- preserve mode-aware graph link decisions
- store enough metadata for later inspection of how the batch was interpreted

Recommended batch metadata:

- `learningMode`
- selected batch profile
- inferred target strategy
- graph-linking strategy summary
- unresolved warnings

## Graph-Linking Guidance by Batch Type

## Vocabulary import

Default behavior:

- create or resolve lexical anchors
- create richer sense/example/form structure only when ambiguity or reuse
  warrants it

Avoid:

- creating a heavy graph node for every token in raw source text
- assuming every imported string is a conceptual prerequisite target

## Grammar / construction import

Default behavior:

- create or resolve rule/construction nodes
- attach examples when they are reusable and pedagogically important
- generate structure-sensitive card families

## Text / dialogue import

Default behavior:

- parse source material
- propose candidate study targets
- promote selected targets into graph-linked content
- keep the rest as supporting metadata or example material

## Concept / fact import

Default behavior:

- resolve concept/fact/procedure/principle targets
- create concept-oriented graph links
- generate concept-driven cards

## Validation Rules

### Shared validation

- explicit field mapping remains required
- supported modes must be coherent with selected mode
- graph-linked nodes must support the target mode or be explicitly upgraded

### Language-specific validation

- warn when a raw import would create excessive graph fragmentation
- warn when a source item looks polysemous or confusable but is treated too
  simplistically

### Knowledge-specific validation

- warn when concept labels are too broad, ambiguous, or duplicate likely
  existing structure

## Acceptance Criteria

The content and batch architecture is correct when:

- the same import pipeline can support both modes
- preview surfaces explain mode-specific decisions
- created cards preserve mode membership cleanly
- graph-linking defaults differ appropriately by mode
- rollback/history still work through the shared batch infrastructure

## Related Documents

- `docs/architecture/decisions/ADR-0057-mode-aware-batch-creation-and-card-generation.md`
- `docs/backend/card-imports.md`
- `docs/frontend/mode-aware-card-and-batch-flows.md`
