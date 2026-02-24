# Phase 0 — API/ADR Foundation

## Objective

Lock all scheduler agent-readiness contracts before implementation: OpenAPI
schemas, endpoint lifecycle, and architecture ADR.

## Covers Gaps

1, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 30, 31

## Required Outputs

- New ADR: scheduler agent-readiness hardening.
- OpenAPI schema additions:
  - `PrincipalContext`
  - `ErrorEnvelope`
  - `OrchestrationMetadata` (`proposalId`, `decisionId`, `sessionRevision`)
  - `ScoringBreakdown`
  - `PolicyVersion`
  - `BackpressureSignal`
- Endpoint contracts for:
  - propose/simulate
  - commit single/batch
  - reconcile/apply adjustments
- Lifecycle markers for every non-implemented route.

## Tasks

- [x] Add/update ADR in `docs/architecture/decisions/`.
- [x] Update `docs/api/openapi/scheduler-service/openapi.yaml`.
- [x] Update scheduler and tools path specs.
- [x] Update component schemas in common/scheduler/tools files.
- [x] Ensure auth errors and tool errors share common envelope schema.

## Constraints

- API-first only: do not change runtime behavior in this phase.
- Keep endpoint naming consistent with existing scheduler contract style.

## Exit Criteria

- [x] OpenAPI spec validates cleanly.
- [x] ADR is committed and references concrete changed contracts.
- [x] Every planned endpoint has explicit lifecycle metadata.
