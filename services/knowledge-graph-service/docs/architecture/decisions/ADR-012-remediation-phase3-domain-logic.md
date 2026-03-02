# ADR-012: Remediation Phase 3 — Domain Logic: Validation, Algorithms & Semantic Correctness

**Status:** Accepted **Date:** 2026-03-02 **Commit:** `9f1ad76`

## Context

The Phase 6/7 compliance audit (ADR-007) identified 67 findings across the
knowledge-graph-service. Phase 3 of the remediation plan addresses 12 findings
focused on fixing semantic/logical errors in domain services, validation gaps,
algorithm correctness, and business rule hardening. These fixes depend on the
repository interfaces and DI contracts added in Phase 2 (ADR-011).

Phase 1 (ADR-010) fixed data bugs and type safety. Phase 2 (ADR-011) added
repository methods and interfaces. Phase 3 consumes those new methods to fix the
domain logic layer.

## Decisions

### D1: Batch `fetchDomainSubgraph` (Fix 3.1)

Replaced N sequential `getEdgesForNode` calls with a single
`getEdgesForNodes(nodeIds, {}, userId)` call. Edge filtering now requires both
`sourceNodeId` and `targetNodeId` to be in the node set (intra-domain only).

**Rationale:** O(N) round trips to Neo4j for N nodes was the most impactful
performance issue in subgraph assembly.

### D2: Exact counts for `listEdges` (Fix 3.2)

Replaced `findEdges(limit + 1)` plus slice trick with parallel
`[findEdges(limit, offset), countEdges(scopedFilter)]`. `hasMore` now uses
`offset + edges.length < total` with an exact total.

**Rationale:** The limit+1 trick produced incorrect `total` and `hasMore` values
for agent consumers relying on pagination metadata.

### D3: Exact counts for `getOperationLog` (Fix 3.3)

Replaced approximate `total = offset + entries.length + (len === limit ? 1 : 0)`
with `countOperations(userId, countFilter)` for exact total.

**Rationale:** Same pagination correctness issue as D2, in the operation log
context.

### D4: Cycle detection semantics (Fix 3.4)

Added explicit self-loop guard (`sourceNodeId === targetNodeId` → throw
`CyclicEdgeError`). Replaced `detectCycles(targetNodeId)` with
`findFilteredShortestPath(targetNodeId, sourceNodeId, [edgeType])`.

**Rationale:** The old `detectCycles` checked if the target was _already_ in a
cycle — it did not check whether adding `source→target` would _create_ one. The
reachability check (can target reach source via this edge type?) correctly
detects that adding `source→target` closes the loop.

### D5: Edge divergence O(E) rewrite (Fix 3.5)

Replaced O(n²) nested iteration over all aligned node pairs with O(E) iteration
over edges. Uses `Set<string>` keyed by `source|target|edgeType` for O(1)
lookups.

**Rationale:** For graphs with K aligned pairs and average degree D, the old
approach was O(K² · D²). The new approach is O(E_ckg + E_pkg) with set-based
lookups.

### D6: Atomic domain in `executeSplit` (Fix 3.6)

Moved original node lookup before `createNode` calls. Passes `domain` directly
to both `createNode` invocations. Removed post-creation `updateNode` calls.

**Rationale:** The old approach created nodes with `domain: ''` then immediately
updated them — a non-atomic two-step that left a window for inconsistency.

### D7: Max recovery attempts (Fix 3.7)

Added `MAX_RECOVERY_ATTEMPTS = 3` constant. Before each rejection,
`incrementRecoveryAttempts` is called. If `recoveryAttempts >= 3`, the mutation
is permanently rejected with `permanentlyRejected: true` metadata instead of
being retried.

**Rationale:** Without a cap, permanently failing mutations would retry
indefinitely, consuming resources and polluting the audit log.

### D8: Semantic detector config gate (Fix 3.8)

Added `ISemanticDetectorConfig` interface with `vectorServiceEnabled` boolean.
When disabled (default), returns `[]`. When enabled, throws `Error` documenting
that the implementation is pending. Config propagates from
`MisconceptionDetectionEngine` constructor.

**Rationale:** The old detector silently returned `[]`, deceptively reporting
zero semantic misconceptions. The gate makes the disabled state explicit and
prevents silent failure when the feature is expected to work.

### D9: Custom validator invocation (Fix 3.9)

Implemented the custom validator invocation loop in `createEdge` between weight
validation and acyclicity check. When `validateCustomRules !== false` and
`customValidators` are provided, each validator receives a context object
(`sourceNode`, `targetNode`, `edgeType`, `weight`, `policy`) and must return
`true` to pass.

**Rationale:** The `IValidationOptions` interface declared `customValidators`
and `validateCustomRules` but never invoked them — dead contract.

**Alternative considered:** Removing the fields entirely. Rejected because the
`ValidationOptions.create()` factory already handles them and the interface
provides a useful extension point.

### D10: `sourceDomain` strict lookup (Fix 3.10)

Replaced `sourceNode?.domain ?? 'unknown'` with throwing `NodeNotFoundError` if
the source node doesn't exist in `deleteEdge`.

**Rationale:** Writing `'unknown'` to the staleness table pollutes domain
metrics.

### D11: Remove empty shared directories (Fix 3.11)

Removed empty `src/domain/shared/errors/` and `src/domain/shared/value-objects/`
directories. The `src/domain/shared/` directory retains `event-publisher.ts`.

**Rationale:** Empty directories create misleading scaffolding suggesting shared
domain primitives exist when they don't.

### D12: Contextual mutation list hints (Fix 3.12)

Renamed `_filters` parameter to `filters` in `createMutationListHints`. Added
contextual `suggestedNextActions` — `retry_mutation` for `rejected` state,
`approve_mutation` for `pending_review` state. Added filter description to
reasoning string.

**Rationale:** The parameter was accepted but unused, and agents benefit from
state-aware suggestions.

## Emergent Decisions During Implementation

### E1: `countEdges` signature alignment

The `countEdges` interface accepts only `(filter: IEdgeFilter)` — the `userId`
is embedded in `scopedFilter` via `{ ...filters, userId }`. Initial
implementation incorrectly passed `userId` as a second argument. Corrected to
pass only the scoped filter.

### E2: `escalated` → `pending_review` state mapping

The remediation plan mentioned `escalated` state but the `MutationState` type
only includes `pending_review`. Mapped `escalated` to `pending_review` as the
semantic equivalent.

## Consequences

### Positive

- Pagination now returns exact totals across all paginated endpoints
- Cycle detection correctly prevents all forms of cycles including self-loops
- Edge divergence detection scales linearly with graph size
- CKG mutations have a finite retry budget preventing infinite loops
- Custom validators are now functional, completing the validation contract
- All error paths throw proper domain errors instead of defaulting to magic
  strings

### Negative

- `SemanticMisconceptionDetector` will throw if enabled without implementation —
  intentional, forces explicit attention when vector service is deployed
- Custom validator context type is `unknown` in the interface — callers must
  cast, but this preserves the existing interface contract

### Follow-up

- Phase 4 will address God object splitting, observability, and the outbox
  pattern
- Vector service integration should implement the semantic detector body before
  enabling `vectorServiceEnabled`

## Test Results

All 458 existing tests pass. No new tests added (all changes are internal logic
corrections that existing integration tests cover).
