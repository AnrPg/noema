# ADR-043 — Content Agent Operation Routing

- **Date:** 2026-05-09
- **Status:** Accepted
- **Deciders:** Codex (AI), directed by project owner

## Context

The content family already had a deterministic prompt builder, but its generation contexts were still largely implied by request payload details such as `mode`, `documentIds`, `curriculumId`, `sessionId`, and repair/transformation hints. That made it easy for multiple product duties to collapse into a generic "make content" path even though the system treats source-derived generation, curriculum coverage generation, repair, transformation, and session preparation differently.

The project owner also wants each agent family to be migrated one at a time, beginning with a duty inventory and feature cross-check before prompt-layer design.

## Decision

The content family now uses explicit content operation routing metadata.

- The runtime resolves a content `operationName` before prompt rendering.
- Prompt envelopes now expose `operationName`, `promptProfileVersion`, `promptBuilderId`, and `outputSchemaId` for content runs.
- `ContentCreationPromptV2` now carries `promptProfileVersion` and `pedagogicalContext.generationIntent.operationName`.
- Content result payloads now echo the selected operation for draft and transform flows.

The first formalized content operations are:

- `source_derived_generation`
- `curriculum_coverage_generation`
- `graph_gap_generation`
- `repair_generation`
- `transformation_generation`
- `authoring_assistance`
- `session_preparation`

`content-transform-agent` receives a dedicated `transform_content` profile.

## Rationale

- Content generation context materially changes grounding rules, review posture, and what "good output" means.
- Prompt routing should happen before model invocation rather than being inferred informally from mixed payload hints.
- The content family already had a strong prompt-builder seam, so explicit operation metadata fits naturally without rewriting the builder contract.

## Alternatives Considered

| Option | Pros | Cons | Rejected because |
|--------|------|------|-----------------|
| Keep routing implicit in payload fields | Minimal churn | Duties stay hidden and hard to inspect | It does not make the selected content path explicit |
| One giant content prompt | Centralized instructions | Blurs source-derived, repair, and transformation duties | It weakens determinism and auditability |
| Split every content context into a separate wrapper immediately | Maximal separation | Large rollout with high UI/runtime churn | Current wrappers are still coherent if operations are explicit |

## Consequences

- Content runs now show which generation context was selected.
- New content duties should register operation profiles instead of appending more generic prompt text.
- The builder remains deterministic, but its intent layer is now explicit and inspectable.

## References

- [content-creation-orchestrator.md](/C:/Users/anr/Apps/noema/docs/architecture/agents/creation/content-creation-orchestrator.md)
- [content-creation-routing.md](/C:/Users/anr/Apps/noema/docs/architecture/agents/creation/content-creation-routing.md)
