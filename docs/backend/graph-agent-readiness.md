# Graph Agent Readiness Backend

`GraphAgentPromptV1` is populated by `agents/src/agents/graph_intervention.py` before graph reasoning, content creation, PKG writes, or CKG mutation proposals.

The graph runtime now resolves an explicit `operationName` before prompt rendering. Prompt metadata exposes:

- `operationName`
- `promptProfileVersion`
- `promptBuilderId`
- `outputSchemaId`
- `scope`

For `expand_pkg`, scope-specific prompt layers exist for `whole_pkg`, `node`, and `domain`.

## Deterministic Population

- Call-time fields: user, concept refs, requested operation, domain, study mode, source policy.
- Resolver fields: label, summary, aliases, concept ID, PKG node ID, CKG node ID, and resolution confidence.
- Duplicate scanner fields: same-label duplicates, close matches, alias/candidate collisions.
- Relation context: prerequisites, related concepts, contrasts, confusables, misconception links, learner signals, source evidence, static write policy.
- Service contract: identity map, PKG confirmation plan, CKG mutation plan, tool-call inputs, review routing, idempotency keys.

Missing graph identity or duplicate blocking risks produce `GraphReadinessReportV1.status = blocked`. Required evidence can also block graph mutation workflows; content-readiness graph checks do not use RAG evidence as a graph blocker because RAG evidence is fetched later by the content prompt mapper.

## Write Paths

- PKG: `knowledge-graph.confirm-pkg-write-plan` executes `add_node` and `add_edge` only after `confirmed: true`.
- CKG: `knowledge-graph.propose-mutation` receives DSL operations. `add_edge` uses `sourceNodeId`, `targetNodeId`, `edgeType`, `weight`, and `rationale`.

## Content Mapping

`content-creation-orchestrator` calls the graph intervention orchestrator before building `ContentCreationPromptV2`. The content composite does not call raw knowledge-graph tools; after graph readiness is finalized it fetches only non-graph content, scheduler, metacognition, curriculum, ingestion, vector, and guardian-policy context. The content prompt maps graph readiness into:

- `serviceContract.identityMap.concepts`
- `pedagogicalContext.conceptRelations.prerequisites`
- `pedagogicalContext.conceptRelations.related`
- `pedagogicalContext.conceptRelations.contrasts`
- `pedagogicalContext.conceptRelations.confusables`
- `pedagogicalContext.conceptRelations.misconceptionLinks`

Content generation blocks when graph readiness is incomplete unless the caller explicitly opts into an unanchored draft policy.

### Prompt identity and fallback contract

- `pedagogicalContext.targetConcepts[*].conceptRef` values such as `c1` are transport refs only. If a model echoes them back in `conceptIds`, the agents runtime must remap them through `serviceContract.identityMap.concepts` before persisting cards.
- `anchoredPkgNodeIds` and `anchoredCkgNodeIds` must be recovered from the same identity map when the model omits them but graph readiness is finalized.
- Autonomous explanation cards with vacuous backs like "without further context" are not acceptable success cases. The runtime now either:
  - replaces the vacuous text with a deterministic graph-context fallback when semantic fields like description, learner-facing summary, or meaningful relations are present
  - rejects the draft with an explicit insufficiency reason listing the missing semantic grounding fields required for a safe fallback

## Mock Verification User

Focused tests use `user_graph_agent_demo`, `user_content_schema_demo_0001`, and `user_1` with Bayes/Concept One graph fixtures in `agents/tests/test_agent_runtime.py`. The fixture includes resolved `conceptId`, `pkgNodeId`, and `ckgNodeId` values sufficient to populate `GraphAgentPromptV1` and map it into `ContentCreationPromptV2`.
