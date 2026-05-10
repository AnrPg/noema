# ADR-041 — Graph Agent Prompt Readiness

- **Date:** 2026-05-09
- **Status:** accepted
- **Deciders:** Codex, human request

## Context
The previous knowledge-graph agent could receive partially resolved graph context and emit write-shaped operations before IDs, duplicate risks, and relation packs were finalized. This made content creation depend on stubbed graph readiness and allowed a CKG edge shape mismatch (`fromNodeId`/`toNodeId`) to reach mutation handoff code.

## Decision
`GraphAgentPromptV1` is the graph-agent source of truth. A new graph-intervention orchestrator must run before graph reasoning, content prompt assembly, PKG writes, or CKG mutation proposals. The graph agent reasons only over `pedagogicalContext`; concrete IDs are confined to `serviceContract` for downstream service calls. `ContentCreationPromptV2` receives graph fields only through the finalized readiness mapper, with `serviceContract.identityMap.concepts[*].ckgNodeId` carried through for persistence handoff.

Content creation does not create, merge, split, resolve, or mutate graph nodes. When graph-anchored content is requested and graph readiness is blocked, prompt assembly blocks with a structured readiness error. Unanchored drafts require an explicit caller policy.

PKG writes use `confirm-pkg-write-plan` and require one explicit user confirmation. CKG writes continue through `propose-mutation` and must use the mutation DSL shape, especially `sourceNodeId`, `targetNodeId`, `edgeType`, `weight`, and `rationale` for `add_edge`.

## Rationale
Separating human-readable reasoning from service IDs prevents the model from inventing graph write payloads. It also gives content creation a deterministic blocker when labels, mappings, relation packs, or required evidence are incomplete.

## Alternatives Considered
| Option | Pros | Cons | Rejected because |
| --- | --- | --- | --- |
| Keep graph agent as resolver and reasoner | Fewer files changed | Same ambiguity and ID invention risk | It leaves content readiness partial |
| Make `ContentCreationPromptV2` the source of truth | Reuses an existing schema | Couples content-service requirements to graph mutation review | Graph workflows need a standalone contract |
| Keep legacy edge aliases | Backward compatible | Keeps the CKG DSL mismatch alive | No backward compatibility is required |

## Consequences
- Positive: graph readiness is deterministic, inspectable, and reusable by content creation.
- Positive: content generation no longer calls raw knowledge-graph tools or silently invents fallback graph IDs.
- Positive: CKG mutation handoff shape is normalized at agent and batch boundaries.
- Positive: PKG commits now have a single confirmation tool.
- Trade-off: callers must handle blocked readiness instead of receiving fallback IDs.

## References
- `packages/validation/src/graph-agent-prompt.ts`
- `agents/src/agents/graph_intervention.py`
- `services/knowledge-graph-service/src/agents/tools/kg.tools.ts`
