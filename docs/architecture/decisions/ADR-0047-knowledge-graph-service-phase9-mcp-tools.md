# ADR-0047: Knowledge Graph Service Phase 9 — MCP Tool Surface

**Date:** 2026-03-02 **Relates to:** ADR-0040 through ADR-0046, ADR-009
**Spec:** `docs/knowledge-graph-service-implementation/PHASE-9-MCP-TOOLS.md`

## Status

Accepted

## Context

The knowledge-graph-service reached operational completeness after Phases 8–8f
(API layer, service methods, relational traversal, structural analysis, ordering
& ranking, ontological guardrails, and tech debt resolution). However, agents
had no programmatic access to the service's 56+ methods.

The MCP (Model Context Protocol) tool standard defines how agent-facing tools
are registered, discovered, and executed. The content-service already had a
reference implementation of this pattern with 7 tools. Phase 9 needed to expose
18 tools across 4 task groups covering PKG operations, CKG operations,
structural analysis, and metacognitive assessment.

## Decision

### 1. Tool Naming Convention — Kebab-Case Without Prefix

Adopted kebab-case without a `kg-` prefix (e.g., `get-concept-node`, not
`kg_get_concept_node`). The Phase 9 spec used underscores while the registry doc
used different kebab-case names. Kebab-case aligns with the content-service
precedent and MCP convention; the service name in tool metadata disambiguates
ownership, making a prefix redundant.

### 2. Input Validation — JSON Schema (Not Zod)

Used JSON Schema objects for `inputSchema` validation, matching the
content-service reference. The spec mentioned Zod but the existing contract
standard and reference implementation both use JSON Schema. This avoids
introducing a Zod dependency solely for tool input validation while the rest of
the codebase uses JSON Schema.

### 3. Tool Count — 18 (Not 19)

The spec title mentions "19 tools" but the checklist enumerates 9 + 3 + 4 + 2
= 18. All 18 were implemented. The factory includes an integrity check
(`EXPECTED_KG_TOOL_NAMES`) that fails if the count deviates.

### 4. File Structure — 4 Files + Barrel

Following the content-service pattern exactly:

| File               | Purpose                                    |
| ------------------ | ------------------------------------------ |
| `tool.types.ts`    | Service-generic MCP type definitions       |
| `kg.tools.ts`      | 18 tool definitions + 18 handler factories |
| `tool.registry.ts` | ToolRegistry class + createToolRegistry    |
| `tool.routes.ts`   | GET /v1/tools + POST /v1/tools/execute     |
| `index.ts`         | Barrel re-exports                          |

### 5. Scope Model — `kg:tools:read` / `kg:tools:execute`

Two scopes following the content-service `content:tools:*` pattern.
`kg:tools:read` for tool discovery (listing definitions), `kg:tools:execute` for
tool invocation. Auth bypass is supported via `AUTH_DISABLED=true` for
development.

### 6. Composite Tools

Two tools compose multiple service calls in parallel:

- **`suggest-intervention`**: `getMisconceptions()` + `getMetacognitiveStage()`
  in parallel, then filters/ranks matching misconceptions. No dedicated service
  method exists for intervention suggestion; the tool provides agent-level
  composition.

- **`get-learning-path-context`**: 5 parallel calls (`getMetrics`,
  `getMisconceptions`, `getMetacognitiveStage`, `getStructuralHealth`,
  optionally `getSubgraph`). Merges all agent hints into a unified response.
  Timeout set to 15s (vs 5s default) to accommodate the parallel fan-out.

### 7. `update-mastery` Wraps `updateNode()`

No dedicated `updateMastery()` service method exists. The tool wraps
`updateNode()` passing `masteryLevel` and metadata properties
(`lastMasterySource`, `lastMasteryUpdate`). This keeps the service API generic
while giving agents a purpose-specific tool.

### 8. Value Object Factory Usage

Handlers use domain value object factories (`TraversalOptions.create()`,
`NeighborhoodQuery.create()`, `PrerequisiteChainQuery.create()`,
`NodeFilter.create()`) instead of raw object literals. This ensures invariant
validation and avoids `exactOptionalPropertyTypes` issues.

## Alternatives Considered

1. **Extract ToolRegistry to a shared package** — Rejected for now. Both
   content-service and KG service have identical `tool.types.ts`; extraction is
   warranted when a third service adds tools. Tracked as future work.

2. **Use Zod for input validation** — Would add a dependency for one use case.
   The JSON Schema approach is proven in the content-service reference.

3. **Prefix all tools with `kg-`** — Would diverge from content-service naming
   and add unnecessary verbosity. The `service` field in tool metadata already
   identifies ownership.

4. **Create dedicated service methods for every tool** — `suggest-intervention`
   and `update-mastery` could have dedicated service methods. However, the tool
   layer's composition is more appropriate: the service should stay generic
   while tools provide agent-specific ergonomics.

## Consequences

### Positive

- Agents can discover and invoke all 18 KG tools via a uniform MCP interface.
- Tool definitions include rich JSON Schema input validation and agent hints.
- Factory integrity check ensures definition/handler alignment at startup.
- Value object factory usage ensures domain invariant validation.

### Negative

- `tool.types.ts` is duplicated between content-service and this service.
  Technical debt tracked for extraction.
- Composite tools have higher latency (up to 15s for
  `get-learning-path-context`) due to parallel fan-out.

### Follow-up Work

- Extract `tool.types.ts` and `ToolRegistry` base class to a shared package when
  a third service adopts the pattern.
- Add integration tests for tool discovery and execution endpoints.
- Add rate limiting per-tool (currently inherits service-level rate limiting).
- Wire tool execution metrics into the observability pipeline (execution time,
  success/failure rates per tool).

## Implementation Notes (Post-Implementation Update)

### Emergent Decisions

- **`IValidationOptions` inline construction**: The `ValidationOptions.create()`
  factory produces a `DeepReadonly` type whose `customValidators` optional field
  types are incompatible with `IValidationOptions` under
  `exactOptionalPropertyTypes`. Resolved by constructing `IValidationOptions`
  inline for the `add-edge` handler's acyclicity bypass.

- **Domain reassignment in registry**: `get-metacognitive-stage` and
  `compute-structural-metrics` were listed under `metacognition-service` in the
  original AGENT_MCP_TOOL_REGISTRY.md. Updated to `knowledge-graph-service`
  since the implementation lives here.

### Deviations from Spec

- Spec used underscore naming (`kg_get_concept_node`); adopted kebab-case per
  approved design decision.
- `find-prerequisites` input schema adds a required `domain` field not in the
  original spec, because `IPrerequisiteChainQuery` requires it.

### Constraints Discovered

- `exactOptionalPropertyTypes` (strict TypeScript) requires conditional spread
  (`...(val !== undefined ? { key: val } : {})`) for optional properties on
  `ICreateNodeInput` and `ICreateEdgeInput`.
- `strict-boolean-expressions` ESLint rule requires explicit
  `!== undefined && !== ''` checks for nullable string conditionals.
