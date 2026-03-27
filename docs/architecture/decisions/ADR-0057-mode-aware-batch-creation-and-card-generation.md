# ADR-0057: Mode-Aware Batch Creation and Card Generation

## Status

Accepted

## Date

2026-03-27

## Context

The batch import and card generation pipeline is one of the places where mode
differences become visible immediately.

Today, Noema already has:

- single-card authoring linked to graph nodes
- service-backed card batch preview and execution
- a rich card taxonomy including language-heavy remediation card types
- graph-backed study and concept alignment

What is still missing is a formal rule for how batch creation should adapt when
the user is learning:

- vocabulary
- grammar/syntax
- dialogue/text comprehension
- facts
- concepts
- procedures

If the platform uses one generic batch flow for all of these, it will generate
the wrong defaults, wrong graph links, and wrong card families. But if it splits
into separate feature silos, the architecture becomes fragmented.

## Decision

### 1) Keep one batch creation pipeline, but make it mode-aware

The platform keeps one batch creation subsystem and one set of preview/execute
contracts. Mode influences the strategy used within that pipeline.

### 2) Make the active mode select the default batch profile

The active `LearningMode` selects the default batch profile and generation
strategy.

Default families:

- `language_learning`
  - vocabulary import
  - grammar/construction import
  - text/dialogue target extraction
- `knowledge_gaining`
  - concept/fact import
  - procedure/principle import
  - structured conceptual source extraction

### 3) In language mode, default graph linking centers on lexical and structural targets

Language-mode batch creation will:

- create or resolve lexical/phrase anchors for vocabulary items
- create richer sense/example/form structure only when ambiguity or reuse
  warrants it
- attach grammar/construction nodes where relevant
- generate language-specific card families when appropriate

Typical generated card families:

- recall and production
- audio/listening
- minimal pair
- false friend
- confusable set drill
- rule scope
- boundary case
- transformation

### 4) In knowledge mode, default graph linking centers on concept/procedure/fact structure

Knowledge-mode batch creation will:

- create or resolve concept/procedure/principle/fact nodes
- suggest prerequisite and conceptual relationships where possible
- generate concept-oriented card families

Typical generated card families:

- definition
- comparison
- cause-effect
- ordering
- concept graph
- boundary case
- contrastive pair

### 5) Keep explicit mapping and preview as the governing workflow

Mode-aware behavior must remain visible in preview:

- detected study targets
- proposed graph links
- proposed card families
- warnings and ambiguity flags
- mode-specific defaults

The system should not hide major semantic choices behind silent automation.

## Rationale

### Why one pipeline instead of separate batch tools

- Current architecture already has a unified import pipeline.
- Shared infrastructure keeps rollback, history, tooling, and API clients
  coherent.
- Mode-aware strategy selection is cheaper and cleaner than duplicate pipelines.

### Why language needs different defaults

- Vocabulary and grammar are not the same as concept hierarchies.
- Language learning relies on confusability, form, meaning, and usage contexts.
- Existing card taxonomy already anticipates these needs.

### Why knowledge mode keeps concept-oriented defaults

- It preserves the strengths of the current architecture.
- It avoids demoting sciences/facts into a generic fallback path.
- Conceptual learning remains a first-class authoring strategy.

## Alternatives Considered

| Option                                   | Pros                   | Cons                                            | Rejected because                                       |
| ---------------------------------------- | ---------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| Separate batch pipelines by mode         | Very explicit          | Duplicated infrastructure and UX drift          | Shared pipeline with mode-aware strategies is cleaner  |
| One generic batch strategy for all modes | Simpler implementation | Wrong defaults and weak graph linkage           | It ignores the product requirement                     |
| Hardcode card types per import format    | Easy to reason about   | Overfits file format instead of learning intent | Mode and profile are more meaningful than format alone |

## Consequences

### Positive

- batch creation becomes meaningfully adaptive without architectural duplication
- card generation aligns better with user intent
- graph linking becomes more faithful to the study context
- preview remains the shared transparency mechanism

### Negative / trade-offs

- preview and execute contracts become richer
- content and graph services need tighter coordination
- more policy logic needs explicit documentation and tests

### Follow-up tasks created

- define mode-aware preview DTOs and defaults
- document graph-linking strategy per mode
- extend card generation policy registry by mode
- update frontend batch wizard copy and review surfaces

## References

- `architecture.md`
- `docs/backend/mode-aware-content-and-batch-creation.md`
- `docs/frontend/mode-aware-card-and-batch-flows.md`
- `docs/backend/card-imports.md`
- `docs/frontend/card-creator.md`
