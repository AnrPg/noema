# MCP Tool Contract Standard (Cross-Service)

## Status

Mandatory Standard (required for all service-owned MCP tool surfaces)

## Purpose

Define a uniform, enforceable contract for MCP tools across all services so
agent orchestration, policy enforcement, retries, observability, and OpenAPI
artifacts behave consistently.

This standard generalizes the scheduler Phase 4 contract from
`ADR-0030-scheduler-mcp-tool-surface-expansion-phase-4.md` into a reusable
cross-service specification.

## Scope

Applies to any service that exposes MCP tool definitions and execution routes.

## Normative Language

The key words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are to be
interpreted as normative requirements.

---

## 1) Canonical Tool Definition Contract

Every registered MCP tool **MUST** conform to the canonical `IToolDefinition`
shape below (or language-equivalent representation).

```ts
interface IScopeRequirement {
  match: 'all' | 'any';
  requiredScopes: string[];
}

interface IToolCapabilities {
  idempotent: boolean;
  sideEffects: boolean;
  timeoutMs: number;
  costClass: 'low' | 'medium' | 'high';
}

interface IToolDefinition {
  name: string; // kebab-case, unique per service
  description: string;
  service: string; // owning service identifier
  priority: 'P0' | 'P1' | 'P2';
  scopeRequirement: IScopeRequirement;
  capabilities: IToolCapabilities;
  inputSchema: Record<string, unknown>; // JSON-schema-compatible payload shape
}
```

### Required Semantics

- `name` **MUST** be stable and unique within a service registry.
- `priority` **MUST** classify orchestration criticality.
- `scopeRequirement` **MUST** define authorization policy per tool:
  - `match='all'`: caller must have all scopes in `requiredScopes`.
  - `match='any'`: caller must have at least one listed scope.
- `capabilities` **MUST** be provided for planner/runtime policy:
  - `idempotent` drives retry safety and dedup policy.
  - `sideEffects` drives dry-run and guarded execution policy.
  - `timeoutMs` drives execution budgets and cancellation thresholds.
  - `costClass` drives budgeting/rate policies.
- `inputSchema` **MUST** be declared for every tool.

---

## 2) Mandatory Registry Behavior

A service tool registry **MUST** implement all behaviors below.

### 2.1 Registration

- Registry **MUST** maintain `{ definition, handler }` pairs.
- Registry **MUST** expose a `listDefinitions()` equivalent for discovery.
- Registry **SHOULD** expose `getDefinition(name)` for route-time auth checks.

### 2.2 Execution Contract

On `execute(toolName, input, userId, correlationId)`:

1. Tool resolution:
   - If tool is missing, registry **MUST** return:
     - `success: false`
     - `error.code: TOOL_NOT_FOUND`
     - metadata classification (see Section 4)
2. Input validation:
   - Registry **MUST** validate `input` against `inputSchema` **before**
     invoking handlers.
   - Validation failures **MUST** return:
     - `success: false`
     - `error.code: TOOL_INPUT_VALIDATION_FAILED`
     - metadata classification:
       - `resultCode=TOOL_INPUT_VALIDATION_FAILED`
       - `retryClass=permanent`
       - `failureDomain=validation`
3. Handler errors:
   - Thrown exceptions **MUST** be converted to structured tool failures
     (`success: false`) and classified by metadata rules (Section 4).
4. Metadata attachment:
   - Every execution result **MUST** include metadata with timing and
     classification fields (Section 4).

### 2.3 Fail-Fast Rule

- Registry validation **MUST** happen before domain/service handlers.
- Invalid payloads **MUST NOT** reach handler logic.

---

## 3) Mandatory Route Authorization Behavior

Tool execution routes **MUST** evaluate authorization dynamically using each
resolved tool's `scopeRequirement`.

- Route-level generic scope checks (e.g., `tools:execute`) **MAY** be applied as
  a baseline.
- Tool-specific checks **MUST** then be enforced using:
  - `requiredScopes`
  - `match`
- Fixed all-scopes authorization for every tool **MUST NOT** be used.

This ensures policy behavior matches each tool contract.

---

## 4) Mandatory Observability Classification

Tool result metadata **MUST** include:

```ts
type RetryClass = 'transient' | 'permanent' | 'unknown';
type FailureDomain =
  | 'network'
  | 'validation'
  | 'auth'
  | 'internal'
  | 'dependency';

interface IToolResultMetadataExtended {
  resultCode?: string;
  retryClass?: RetryClass;
  failureDomain?: FailureDomain;
  // plus existing base metadata fields
}
```

### Classification Rules

- Success:
  - `resultCode=SUCCESS` (or service-specific success code)
  - `retryClass=unknown` (or omitted if your base schema allows)
- Validation-like errors (e.g., contains `VALIDATION` / `INVALID`):
  - `retryClass=permanent`, `failureDomain=validation`
- Auth-like errors (e.g., `AUTH`, `FORBIDDEN`, `UNAUTHORIZED`):
  - `retryClass=permanent`, `failureDomain=auth`
- Availability/timeouts (e.g., `TIMEOUT`, `UNAVAILABLE`):
  - `retryClass=transient`, `failureDomain=network`
- Dependency/external failures:
  - `retryClass=transient`, `failureDomain=dependency`
- Unknown/uncategorized failures:
  - `retryClass=unknown`, `failureDomain=internal`

### Minimum Base Metadata

All tool results **MUST** carry base metadata fields equivalent to:

- `toolVersion`
- `serviceVersion`
- `timestamp`
- `executionTime`
- `correlationId`

---

## 5) Tool Surface Completeness Requirement

Each service that advertises MCP capability **MUST** register a complete,
versioned tool set for its orchestration-critical workflows.

- Critical tools **MUST** be present in runtime registry and discovery output.
- Tool inventory **MUST** declare `priority` for planning and incident triage.
- Services **SHOULD** enforce expected inventory size/content in startup checks
  or tests to prevent silent regressions.

---

## 6) OpenAPI / Contract Publication Requirement

- Tool definitions and result metadata **MUST** be reflected in OpenAPI
  components and paths for each service.
- `scopeRequirement`, `capabilities`, and observability classification fields
  **MUST** be documented in schema artifacts.
- Runtime behavior and published OpenAPI **MUST** stay in sync.

---

## 7) Conformance Checklist (Service Owner)

A service is conformant only if all answers are "Yes":

1. Are all tools registered with full `IToolDefinition` metadata?
2. Does route authorization enforce per-tool `scopeRequirement` dynamically?
3. Does registry validate `input` against `inputSchema` before handlers?
4. Do validation failures return `TOOL_INPUT_VALIDATION_FAILED` + permanent
   validation classification?
5. Are thrown handler exceptions converted into structured failures?
6. Does every result include extended classification metadata?
7. Are discovery (`list tools`) and execution routes aligned with same
   definitions?
8. Are OpenAPI schemas aligned with runtime contract fields and semantics?

---

## 8) Adoption Guidance

For existing services with partial MCP implementations:

1. Introduce/upgrade local `IToolDefinition` to this canonical shape.
2. Add registry pre-handler input validation.
3. Add metadata classification mapping in registry execute path.
4. Switch route auth to per-tool scope evaluation.
5. Backfill OpenAPI and tests to verify required behavior.

---

## 9) Enforcement and Governance

- New MCP tools **MUST NOT** be merged unless they conform to Sections 1–7.
- Service owners **MUST** include conformance checks in CI (tests and/or
  contract validation).
- Architecture review **MUST** reject ADRs or PRs that introduce tool-contract
  divergence without an approved exception ADR.
- Temporary exceptions **MUST** include:
  - explicit scope and rationale,
  - expiry date,
  - remediation plan to rejoin this standard.

---

## 10) Reference Origin

- `docs/architecture/decisions/ADR-0030-scheduler-mcp-tool-surface-expansion-phase-4.md`
- `services/scheduler-service/src/agents/tools/tool.types.ts`
- `services/scheduler-service/src/agents/tools/tool.registry.ts`
- `services/scheduler-service/src/agents/tools/tool.routes.ts`
