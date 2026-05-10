# ADR-042 — Graph Agent Operation Routing

- **Date:** 2026-05-09
- **Status:** Accepted
- **Deciders:** Codex (AI), directed by project owner

## Context

The graph family already had a useful split between `graph-intervention-orchestrator` and `knowledge-graph-agent`, but operation choice still depended mostly on `proposalType` branches and implicit caller behavior. That made it harder to see which graph prompt path was selected, harder to test scope-aware expansion behavior, and easier for graph responsibilities to drift into one large prompt surface.

The project owner also wants prompt planning to happen one agent at a time, starting by inventorying every duty, checking every feature where the agent appears, and only then designing prompt layers.

## Decision

The graph family now uses explicit operation routing metadata.

- The runtime resolves a graph `operationName` before rendering the prompt.
- Prompt envelopes now expose `operationName`, `promptProfileVersion`, `promptBuilderId`, `outputSchemaId`, and `scope`.
- Graph prompt instructions are layered:
  - wrapper-level base instructions
  - operation-specific instructions
  - scope-specific instructions for `expand_pkg`
- Graph orchestration and graph proposal remain separate wrappers:
  - `graph-intervention-orchestrator`
  - `knowledge-graph-agent`
- The first formalized graph operations are:
  - `content_readiness`
  - `anchor`
  - `expand_pkg`
  - existing graph mutation-oriented operations continue to route through explicit profiles for compatibility

## Rationale

- The runtime should choose the graph role deterministically before model invocation.
- Prompt metadata should make the chosen graph path inspectable in the learner workbench and admin run detail views.
- Scope-aware expansion needs distinct instructions for `whole_pkg`, `node`, and `domain`.
- Graph already had the cleanest orchestrator/reasoner split, so it is the safest first agent family for this routing pattern.

## Alternatives Considered

| Option | Pros | Cons | Rejected because |
|--------|------|------|-----------------|
| Keep only `proposalType` branches | Smallest code change | Still hides the real prompt path and keeps role selection implicit | It does not solve prompt routing visibility |
| One giant graph prompt | Fewer routing structures | Hard to reason about, test, and constrain by operation | It increases drift across graph duties |
| Split every graph duty into its own wrapper immediately | Maximum isolation | Too much churn for current graph call sites | Graph already has a good two-stage family shape |

## Consequences

- Graph runs are easier to inspect and test because the selected operation profile is explicit.
- New graph duties should register an operation profile instead of extending generic graph instructions ad hoc.
- The same rollout pattern can now be applied incrementally to other agents, one family at a time.

## References

- [knowledge-graph-agent.md](/C:/Users/anr/Apps/noema/docs/architecture/agents/creation/knowledge-graph-agent.md)
- [graph-agent-readiness.md](/C:/Users/anr/Apps/noema/docs/backend/graph-agent-readiness.md)
