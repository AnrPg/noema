# Curriculum Service

`@noema/curriculum-service` owns durable learner curricula as versioned DAGs. It
is separate from the CKG/PKG: nodes reference CKG concept IDs or carry proposed
concepts that must go through the CKG mutation DSL before anchoring.

## Responsibilities

- Store curricula, versions, nodes, edges, progress, realignment evidence, and
  revision proposals.
- Validate DAG invariants before activation.
- Require Pedagogy Guardian validation before generated curriculum versions are
  finalized and published.
- Compute deterministic frontiers from active version plus progress.
- Return non-empty session slices to `session-service` before LessonPlan
  generation.
- Accumulate durable metacognition triggers across sessions before proposing
  structural revisions.
- Invoke the curriculum planner/revision agent with prompt-ready service facts:
  active curriculum version, stable-node progress, accumulated realignment
  evidence, scheduler state, reasoning averages, and KG prerequisite context.
- Persist returned revision-agent changes as durable
  `CurriculumRevisionProposal` records; agents never activate a curriculum
  version directly.

## Contracts

- Normal user routes require `curriculum:read` or `curriculum:write`.
- Agent write routes use `curriculum:agent` when expanded beyond the initial
  service skeleton.
- Progress identity is `(curriculumId, userId, stableNodeKey)`.
- Session slice requests include `sessionId`; the emitted
  `session.curriculum_slice.selected` event is a Session aggregate event whose
  aggregate id is that Session id.
- Completed progress does not regress when scheduler retention decays.
- Curriculum nodes use `stabilityThreshold`; legacy learner-facing "mastery"
  vocabulary is not part of the public or domain contract.
- `knowledge-graph.propose-mutation` is downstream of the knowledge-graph agent:
  metacognition/curriculum/ingestion provide evidence, the graph agent emits CKG
  DSL, and knowledge-graph-service owns validation/review/commit.
- Batch agent results are imported through
  `POST /v1/curricula/agent-results/import`. Curriculum drafts become durable
  draft versions; curriculum revisions become reviewable revision proposals.

## Validation

Run:

```bash
pnpm --filter @noema/curriculum-service lint
pnpm --filter @noema/curriculum-service typecheck
pnpm --filter @noema/curriculum-service test
pnpm --filter @noema/curriculum-service db:generate
```
