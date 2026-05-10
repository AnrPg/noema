# Knowledge Graph Agent Routing

## Planning workflow

Graph is the first agent family migrated to explicit prompt routing. Its planning followed this order:

1. Inventory all graph duties.
2. Cross-check every feature and service path that calls the graph family.
3. Map inputs, outputs, review paths, and mutation authority for each duty.
4. Decide the wrapper and operation split.
5. Define the prompt layers only after the role map was stable.

This workflow is the template for future agent migrations and should be repeated one agent family at a time.

## Duty inventory

The graph family currently handles these duties:

- content readiness for downstream content generation
- concept anchoring and prerequisite/path proposal
- PKG expansion and optimization proposal generation
- relation-specific proposal flows such as confusable, contrast, and misconception links
- merge and split ambiguity surfacing
- PKG write-plan preparation
- CKG mutation review handoff preparation

## Feature and call-site cross-check

The graph family is involved in:

- knowledge map learner flows
- selected-node graph review flows
- domain-scoped PKG expansion flows
- content creation preflight
- curriculum planning readiness
- ingestion follow-up and mapping repair
- admin graph review and mutation routing
- batch-worker graph proposal finalization

## Role organization

The graph family stays split into two wrappers:

- `graph-intervention-orchestrator`
  - deterministic context building
  - identity resolution
  - ambiguity blocking
  - finalized `GraphAgentPromptV1` assembly
- `knowledge-graph-agent`
  - proposal reasoning from finalized graph context
  - learner-reviewable PKG suggestions
  - canonical review candidates

The graph operations currently formalized in the routing layer are:

- `content_readiness`
- `anchor`
- `expand_pkg`
- existing graph mutation-oriented operations kept as explicit compatibility profiles

## Prompt layers

Each graph run now uses these layers:

1. wrapper-level graph safety and transport rules
2. operation-specific instructions
3. scope-specific instructions for `expand_pkg`
4. structured graph context from the orchestrator
5. typed output schema selection

For `expand_pkg`, scope-specific instruction branches are:

- `whole_pkg`
- `node`
- `domain`

## Output metadata

Prompt metadata now exposes:

- `operationName`
- `promptProfileVersion`
- `promptBuilderId`
- `outputSchemaId`
- `scope`

These fields are visible in the learner agent workbench and admin run detail views so graph prompt selection is inspectable in real runs.
