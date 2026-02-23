# ADR-0030: Scheduler MCP Tool Surface Expansion (Phase 4)

## Status

Accepted

## Date

2026-02-24

## Context

Phase 3 delivered algorithm runtime integration (FSRS/HLR) and deterministic
state transitions, but the scheduler MCP surface remained incomplete for
agent-orchestrated workflows.

The following gaps blocked full orchestration:

- tool definitions lacked explicit capability metadata for planning and
  budgeting;
- per-tool authorization required a richer scope contract (`match` + required
  scopes);
- input validation at tool registry boundary was not strict enough;
- observability metadata did not include machine-classified result and retry
  semantics;
- orchestration-critical scheduler tools were missing from the registered tool
  surface.

## Decision

### 1) Expand Tool Contract Metadata

`IToolDefinition` is extended with:

- `scopeRequirement`: `{ match: 'all' | 'any', requiredScopes: string[] }`
- `capabilities`: `{ idempotent, sideEffects, timeoutMs, costClass }`

This provides a stable control-plane contract for agent runtimes and policy
engines.

### 2) Register Full Scheduler Tool Surface

The scheduler registry now exposes nine tools:

1. `plan-dual-lane`
2. `get-srs-schedule`
3. `predict-retention`
4. `propose-review-windows`
5. `propose-session-candidates`
6. `reconcile-session-candidates`
7. `apply-session-adjustments`
8. `update-card-scheduling`
9. `batch-update-card-scheduling`

All tools carry explicit priority tiers and capabilities metadata.

### 3) Add Registry-Level Input Validation

`ToolRegistry.execute()` now validates `input` against the tool's declared
`inputSchema` before invoking handlers.

Validation failures return:

- `success: false`
- `error.code: TOOL_INPUT_VALIDATION_FAILED`
- observability metadata with `resultCode`, `retryClass=permanent`, and
  `failureDomain=validation`

This enforces fail-fast behavior and prevents invalid payloads from reaching
service handlers.

### 4) Add Tool Observability Classification

Tool result metadata is extended with:

- `resultCode`
- `retryClass` (`transient` | `permanent` | `unknown`)
- `failureDomain` (`network` | `validation` | `auth` | `internal` |
  `dependency`)

The registry classifies both handler-returned failures and thrown exceptions.

### 5) Align Route Authorization with Scope Requirements

Tool execution routes now evaluate per-tool `scopeRequirement` dynamically
instead of a fixed all-scopes behavior.

## Consequences

### Positive

- Scheduler tooling is now orchestration-ready for multi-agent flows.
- Tool behavior is explicit for retries, budgets, and side-effect policies.
- Invalid requests fail early with deterministic machine-readable semantics.
- Tool-level authorization is policy-complete and matches contract definitions.
- OpenAPI artifacts now reflect runtime metadata semantics.

### Negative

- Registry validation uses a minimal JSON-schema subset and may require future
  extension for advanced schema keywords.
- Metadata classification relies on error-code conventions and may need
  centralization across services for perfect consistency.

### Neutral

- Existing handler-level validation remains in place; registry validation is an
  additional guardrail, not a replacement.

## References

- [ADR-0028: Scheduler Agent Readiness Hardening](./ADR-0028-scheduler-agent-readiness-hardening.md)
- [ADR-0029: Scheduler FSRS/HLR Runtime Integration and State Machine](./ADR-0029-scheduler-fsrs-hlr-runtime-integration-phase-3.md)
- [AGENT_MCP_TOOL_REGISTRY](../AGENT_MCP_TOOL_REGISTRY.md)

## Related Changes

- `services/scheduler-service/src/agents/tools/tool.types.ts`
- `services/scheduler-service/src/agents/tools/scheduler.tools.ts`
- `services/scheduler-service/src/agents/tools/tool.registry.ts`
- `services/scheduler-service/src/agents/tools/tool.routes.ts`
- `services/scheduler-service/src/domain/scheduler-service/scheduler.service.ts`
- `services/scheduler-service/src/domain/scheduler-service/scheduler.schemas.ts`
- `services/scheduler-service/src/types/scheduler.types.ts`
- `docs/api/openapi/scheduler-service/components/schemas/tools.yaml`
- `docs/api/openapi/scheduler-service/paths/tools.yaml`
- `services/scheduler-service/tests/unit/domain/tool-registry-phase4.test.ts`
