# Content Creation Routing

## Planning workflow

The content family is the second agent family migrated to explicit prompt routing. Its planning followed this order:

1. Inventory all content duties.
2. Cross-check every feature and service path that calls the content family.
3. Map inputs, outputs, review paths, and mutation authority for each duty.
4. Decide the wrapper and operation split.
5. Define the prompt layers only after the role map was stable.

This is the required workflow for later agent-family migrations as well.

## Duty inventory

The content family currently handles these duties:

- source-derived generation
- curriculum coverage generation
- graph-gap generation
- repair generation after guardian/debugger/patch signals
- transformation generation from an existing parent artifact
- authoring assistance
- session preparation for candidate payloads
- direct content transform runs

## Feature and call-site cross-check

The content family appears in:

- content jobs and content review learner surfaces
- curriculum vault/detail flows
- lesson/session preparation flows
- ingestion follow-up recommendations
- agent workbench direct execution
- content-service HTTP agent client calls
- guardian repair and review loops

## Role organization

The content family currently stays split across these wrappers:

- `content-creation-orchestrator`
  - preflight coordination
  - graph readiness dependency
  - `ContentCreationPromptV2` assembly
  - model handoff orchestration
- `content-creator-agent`
  - content-family drafting path through the same ready prompt contract
  - proposal finalization and guardian validation
- `content-transform-agent`
  - parent-artifact transformation path

The first explicit content operation profiles are:

- `source_derived_generation`
- `curriculum_coverage_generation`
- `graph_gap_generation`
- `repair_generation`
- `transformation_generation`
- `authoring_assistance`
- `session_preparation`
- `transform_content` for the dedicated transform wrapper

## Prompt layers

Each content run now uses these layers:

1. wrapper-level content safety and transport rules
2. operation-specific instructions
3. deterministic prompt assembly through `ContentCreationPromptBuilder`
4. typed output schema metadata

For content, the main prompt-layer discriminator is generation context rather than graph scope.

## Output metadata

Prompt metadata now exposes:

- `operationName`
- `promptProfileVersion`
- `promptBuilderId`
- `outputSchemaId`

`ContentCreationPromptV2` also records:

- `promptProfileVersion`
- `pedagogicalContext.generationIntent.operationName`

These fields are visible in agent workbench and admin run detail views so the selected content route is inspectable in real runs.
