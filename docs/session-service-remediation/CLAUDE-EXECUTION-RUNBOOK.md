# Claude Execution Runbook

## Purpose

Operational instructions for executing each phase with Claude Code in strict,
low-risk PR slices.

## Standard Operating Loop (Per Phase)

1. Read one phase file only.
2. Implement only in-scope changes.
3. Add/adjust tests for touched behavior.
4. Run service-local tests.
5. Update OpenAPI/contracts when behavior/schema changes.
6. Prepare concise PR summary with checklist and risks.

## Hard Constraints

- Do not combine multiple phases in one PR.
- Do not modify unrelated services unless phase explicitly requires shared
  package changes.
- Do not remove existing behavior without migration notes.
- Do not skip tests.

## Required Verification Commands

- `pnpm --filter @noema/session-service test`
- `pnpm --filter @noema/session-service typecheck`
- `pnpm --filter @noema/session-service lint` (if configured in CI lane)

## Required PR Sections

- Scope implemented
- Files changed
- Test evidence
- Contract/API changes
- Risks and mitigations
- Rollback note

## Prompt Template (Use Per Phase)

```text
Implement ONLY <PHASE_FILE_NAME> from docs/session-service-remediation.

Rules:
- Stay strictly in phase scope.
- Add/adjust tests for all touched behavior.
- Keep OpenAPI and tool contracts in sync with runtime changes.
- Do not include work from other phases.

Deliverables:
1) Code changes
2) Test updates
3) Contract/docs updates (if needed)
4) Short implementation summary with checklist mapping
```

## Phase Completion Gate

A phase is complete only when:

- All items in its checklist are marked done.
- Exit conditions are met.
- Local test suite passes.
- Reviewer can map diff directly to phase scope.
