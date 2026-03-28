# Mode-Aware Card and Batch Flows

## Purpose

This document defines how the card authoring and batch import UX should adapt to
the active learning mode.

The app keeps one card system and one batch workspace, but mode changes the
defaults, hints, and review logic.

## Shared UX Principle

There is still one card authoring model:

- single-card creation
- batch preview
- batch execution
- history and rollback

What changes by mode is the authoring profile.

## Current Implementation Coverage

The current repository now implements the first stable part of this design:

- single-card creation reads the active mode
- batch import preview/execute carries mode membership into created cards
- graph-target lookup in authoring flows respects mode where supported

This means the two-mode architecture now affects creation, not only study and
reporting.

## Single-Card Creation

## Knowledge gaining

Default assumptions:

- user is creating a concept/fact/procedure/principle-oriented card
- graph linking should favor conceptual targets
- card family suggestions should be concept-centric

Typical suggestions:

- definition
- comparison
- cause-effect
- ordering
- concept graph

## Language learning

Default assumptions:

- user is creating a vocabulary, grammar, usage, or discrimination card
- graph linking should favor lexical or grammar targets
- card family suggestions should reflect language learning needs

Typical suggestions:

- recall/production
- audio/listening
- minimal pair
- false friend
- confusable set drill
- rule scope

## Batch Import Wizard

## Shared steps remain

The wizard still supports:

- source family selection
- format-specific preview
- explicit mapping
- execution
- history and rollback

## Mode-aware preview additions

Preview should clearly show:

- active mode
- inferred batch profile
- detected study targets
- proposed graph-link strategy
- proposed card-family distribution
- mode-specific warnings

### Language-mode examples

Helpful preview cues:

- lexical anchors detected
- likely confusable items
- grammar/construction candidates
- examples worth promoting vs keeping as metadata

### Knowledge-mode examples

Helpful preview cues:

- candidate concept or fact nodes
- likely duplicate concepts
- prerequisite-friendly structure hints
- concept-oriented card-family suggestions

## Batch Review Messaging

The review copy should help the user understand why the same source material may
be interpreted differently by mode.

Example:

- in language mode, the system may emphasize lexical targets and contrastive
  drills
- in knowledge mode, the same source may emphasize concepts, facts, and
  explanatory structure

## Multi-Mode Cards

If a card supports both modes:

- authoring UI should make that explicit
- preview should clarify which mode-specific defaults were used for this batch
- schedule state is still separate downstream

The authoring experience should not imply that “shared card” means “shared
memory state.”

## Error and Warning States

### Wrong-mode linking warning

Example:

- user is in language mode
- selected graph node is knowledge-only

UI response:

- explain incompatibility clearly
- offer a mode switch or a different graph target if appropriate

### Ambiguous interpretation warning

Example:

- imported item could be treated as a lexical target or a conceptual target

UI response:

- show the mode-driven default
- explain the ambiguity
- allow explicit override where the workflow supports it

## Acceptance Criteria

- card creation reflects the active mode immediately
- batch preview explains mode-specific interpretation clearly
- batch execution preserves mode membership and intent
- warnings help users recover from mode/target mismatches

## Related Documents

- `docs/frontend/learning-mode-toggle.md`
- `docs/backend/mode-aware-content-and-batch-creation.md`
- `docs/architecture/decisions/ADR-0057-mode-aware-batch-creation-and-card-generation.md`
