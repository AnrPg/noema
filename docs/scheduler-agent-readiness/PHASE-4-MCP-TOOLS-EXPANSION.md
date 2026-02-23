# Phase 4 — MCP Tool Surface Expansion

## Objective

Expose an orchestration-ready scheduler MCP tool surface with strict contracts,
capability metadata, deep input validation, and bulk-friendly semantics.

## Covers Gaps

9, 10, 11, 12, 13

## Required Outputs

- New scheduler tools:
  - `get-srs-schedule`
  - `predict-retention`
  - `propose-review-windows`
  - `propose-session-candidates`
  - `reconcile-session-candidates`
  - `apply-session-adjustments`
  - `update-card-scheduling`
  - `batch-update-card-scheduling`
- Capability metadata per tool:
  - `idempotent`
  - `sideEffects`
  - `timeoutMs`
  - `costClass`
  - `requiredScopes`
- Strict schema validation before handler invocation.
- Bulk operations + partial-failure output schema.
- Tool observability fields (`resultCode`, `retryClass`, `failureDomain`).

## Tasks

- [ ] Extend tool definition types and registry behavior.
- [ ] Add route-level and registry-level validation checkpoints.
- [ ] Add/expand handlers in `scheduler.tools.ts`.
- [ ] Add tests for invalid input, scope failures, partial failures.
- [ ] Update tool OpenAPI components and examples.

## Constraints

- Keep tool naming aligned with architecture registry naming conventions.
- Do not bypass route-level auth/scope checks.

## Exit Criteria

- [ ] Tool registry covers required scheduler P0/P1 orchestration tools.
- [ ] Invalid input is rejected before domain execution.
- [ ] Tool responses include machine-usable observability metadata.
