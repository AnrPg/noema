# ADR-0020: Strategy-Aware Session Seeding v2

## Status

**Partially superseded by
`docs/adr/ADR-010-step-is-the-atomic-learning-unit.md`,
`docs/adr/ADR-020-every-session-has-a-lesson-plan.md`, and
`docs/adr/ADR-022-repetition-uses-transformation-cycling.md`** — 2026-05-01

The idea that content-service can provide strategy-aware handoff metadata
remains useful. The specific card-ID session seed contract is superseded by
LessonPlan/Step creation and Activity payload candidate selection.

## Context

Session seed generation exposed initial card IDs but lacked first-class strategy
context for scheduler lane mix, checkpoint recommendations, and policy-aware
handoff to `session-service`.

## Decision

Upgrade content seeding contract/output to v2 semantics with strategy-aware
fields consumed by session orchestration.

- Extend seed input/output types and schemas in `content-service`.
- Return lane mix and checkpoint recommendation metadata.
- Expose the enriched contract in REST and MCP tool surfaces.

## Consequences

### Positive

- Content→Session handoff carries richer intent and adaptation context.
- Agent orchestration gains stronger grounding for start-session decisions.

### Negative

- Seed output schema is broader and requires consumer awareness of new fields.

## References

- [services/content-service/src/types/content.types.ts](services/content-service/src/types/content.types.ts)
- [services/content-service/src/domain/content-service/content.schemas.ts](services/content-service/src/domain/content-service/content.schemas.ts)
- [services/content-service/src/domain/content-service/content.service.ts](services/content-service/src/domain/content-service/content.service.ts)
- [services/content-service/src/api/rest/content.routes.ts](services/content-service/src/api/rest/content.routes.ts)
- [services/content-service/src/agents/tools/content.tools.ts](services/content-service/src/agents/tools/content.tools.ts)
