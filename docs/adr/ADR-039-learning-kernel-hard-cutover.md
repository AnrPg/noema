# ADR-039 — Learning Kernel Hard Cutover

- **Date:** 2026-05-04
- **Status:** accepted
- **Deciders:** Codex

## Context

The closed-loop runtime had overlapping ownership for branded learning IDs,
Step/Evaluation/Trigger/Curriculum event payloads, and event topology across
`@noema/events`, `@noema/contracts`, and `@noema/validation`. That made it too
easy for services to drift semantically, especially around `ConceptId` versus
`CurriculumNodeId`, optional `studyMode`, and legacy content node fields.

## Decision

Create `@noema/learning-kernel` as the canonical owner for closed-loop branded
ID schemas, mode enums, payload schemas, event schemas, event topology, envelope
builders, validators, and golden fixtures. Shared packages may import kernel
schemas for remaining package surfaces, but they must not define independent
closed-loop ID/event semantics.

The cutover is hard: no compatibility aliases, fallback `knowledgeNodeIds` reads
for Step/activity selection, optional `studyMode` learning-state events, or
`CurriculumNodeId` values in `conceptRefs`.

## Rationale

One kernel gives the loop a single semantic contract that can be validated at
runtime and tested with golden fixtures. The system is unreleased, so retaining
legacy compatibility would preserve the exact ambiguity this refactor removes.

## Alternatives Considered

| Option                                  | Pros                 | Cons                                  | Rejected because                           |
| --------------------------------------- | -------------------- | ------------------------------------- | ------------------------------------------ |
| Keep contracts split across packages    | Smaller diff         | Continued semantic drift              | The current bugs come from split ownership |
| Add transitional aliases                | Easier migration     | Leaves stale API paths alive          | The product is unreleased and can hard cut |
| Generate all packages from OpenAPI only | Familiar client flow | Does not cover internal event streams | Closed-loop semantics are event-first      |

## Consequences

- Positive: Services validate against one learning event registry and branded ID
  boundary.
- Positive: `studyMode` and `ConceptId`/`CurriculumNodeId` boundaries become
  testable kernel invariants.
- Negative: Internal callers must send canonical fields now; legacy payloads
  fail validation.
- Follow-up: expand service event manifests into CI enforcement for every
  service bootstrap.

## References

- `packages/learning-kernel`
- `architecture.md`
- `module-graph.md`
