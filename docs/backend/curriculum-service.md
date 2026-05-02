# Curriculum Service

`@noema/curriculum-service` owns durable learner curricula as versioned DAGs. It
is separate from the CKG/PKG: nodes reference CKG concept IDs or carry proposed
concepts that must go through the CKG mutation DSL before anchoring.

## Responsibilities

- Store curricula, versions, nodes, edges, progress, realignment evidence, and
  revision proposals.
- Validate DAG invariants before activation.
- Compute deterministic frontiers from active version plus progress.
- Return session slices to `session-service` before LessonPlan generation.
- Accumulate durable metacognition triggers across sessions before proposing
  structural revisions.

## Contracts

- Normal user routes require `curriculum:read` or `curriculum:write`.
- Agent write routes use `curriculum:agent` when expanded beyond the initial
  service skeleton.
- Progress identity is `(curriculumId, userId, stableNodeKey)`.
- Completed progress does not regress when scheduler retention decays.

## Validation

Run:

```bash
pnpm --filter @noema/curriculum-service lint
pnpm --filter @noema/curriculum-service typecheck
pnpm --filter @noema/curriculum-service test
pnpm --filter @noema/curriculum-service db:generate
```
