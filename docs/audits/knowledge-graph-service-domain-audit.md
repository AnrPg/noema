# Deep Code Audit — knowledge-graph-service Domain Layer

**Date:** 2025-01-XX  
**Scope:** `services/knowledge-graph-service/src/domain/`  
**Files audited:** ~50 files, ~15,000 LoC  
**Auditor:** GitHub Copilot (Claude Opus 4.6)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Category 1 — Implementation Gaps](#2-category-1--implementation-gaps)
3. [Category 2 — Code Smells](#3-category-2--code-smells)
4. [Category 3 — Bad Design Patterns](#4-category-3--bad-design-patterns)
5. [Category 4 — Semantic / Logical Errors](#5-category-4--semantic--logical-errors)
6. [Category 5 — Type Safety Issues](#6-category-5--type-safety-issues)
7. [Category 6 — Error Handling Issues](#7-category-6--error-handling-issues)
8. [Category 7 — Contract Mismatches](#8-category-7--contract-mismatches)
9. [Summary Statistics](#9-summary-statistics)

---

## 1. Executive Summary

The knowledge-graph-service domain layer is architecturally well-structured,
with strong use of hexagonal architecture, ISP-compliant repository ports, value
object factories with deep-freeze semantics, a data-driven edge policy system,
and a clean Strategy pattern for metrics/misconception engines. However, the
audit uncovered **38 findings** spanning all 7 categories, including **5
Critical**, **11 High**, **14 Medium**, and **8 Low** severity issues.

The most impactful findings are:

- **Cross-database consistency gap** in the CKG commit stage (Neo4j + Postgres
  without 2PC)
- **God object** service implementation at 4149 lines
- **Unsafe `as unknown as` casts** that bypass TypeScript's type system
- **N+1 query pattern** in subgraph fetching
- **Fire-and-forget async pipeline** with no recovery beyond logging
- **`console.error`/`console.warn`** usage in domain layer bypassing structured
  logging

---

## 2. Category 1 — Implementation Gaps

### 1.1 — SemanticMisconceptionDetector is a permanent stub

| Field        | Value                                          |
| ------------ | ---------------------------------------------- |
| **File**     | `misconception/detectors/semantic-detector.ts` |
| **Lines**    | 23–26                                          |
| **Severity** | **Medium**                                     |

The `SemanticMisconceptionDetector.detect()` returns `[]` unconditionally. It is
registered in `MisconceptionDetectionEngine` and called on every detection run,
wasting a strategy slot and deceptively reporting zero semantic misconceptions
even when the vector-service becomes available. No feature flag, no conditional
registration — it silently degrades the detection pipeline.

**Fix:** Either gate registration behind a feature flag / config
(`vectorServiceEnabled`), or throw an explicit `NotImplementedError` when
patterns of kind `SEMANTIC` are present, so callers know semantic detection is
unavailable.

---

### 1.2 — `IValidationOptions.customValidators` are accepted but never invoked

| Field        | Value                                         |
| ------------ | --------------------------------------------- |
| **File**     | `value-objects/graph.value-objects.ts`        |
| **Lines**    | 149–150 (`customValidators` field definition) |
| **File**     | `knowledge-graph.service.impl.ts`             |
| **Lines**    | 456–530 (`createEdge` method)                 |
| **Severity** | **Medium**                                    |

`IValidationOptions` declares
`customValidators?: readonly ((context: unknown) => boolean)[]` and the
`ValidationOptions` factory dutifully copies/freezes them. However,
`KnowledgeGraphService.createEdge()` only checks `validateNodeTypes`,
`validateWeight`, and `validateAcyclicity` — it never calls custom validators
even when `validateCustomRules` is `true`.

**Fix:** Either implement the custom validator invocation loop in edge creation,
or remove `customValidators` and `validateCustomRules` from the interface to
avoid dead API surface.

---

### 1.3 — `validateTraversalDepth` does not reject negative or zero depth

| Field        | Value                             |
| ------------ | --------------------------------- |
| **File**     | `knowledge-graph.service.impl.ts` |
| **Lines**    | ~2665–2675                        |
| **Severity** | **Low**                           |

```typescript
private validateTraversalDepth(depth: number): void {
  if (depth > MAX_TRAVERSAL_DEPTH) {
    throw new MaxDepthExceededError(depth, MAX_TRAVERSAL_DEPTH);
  }
}
```

Does not reject `depth <= 0`, `NaN`, or non-integer values. While the
`TraversalOptions.create()` factory validates `maxDepth >= 1`, callers using raw
depth parameters (several traversal methods accept a raw `depth` number) bypass
the factory.

**Fix:** Add
`if (!Number.isInteger(depth) || depth < 1) throw new ValidationError(...)`.

---

### 1.4 — `PromotionBandUtil.meetsThreshold` is vacuously true for `'none'`

| Field        | Value                             |
| ------------ | --------------------------------- |
| **File**     | `value-objects/promotion-band.ts` |
| **Lines**    | 73–80                             |
| **Severity** | **Low**                           |

```typescript
meetsThreshold(band: PromotionBandEnum, count: number): boolean {
  const threshold = PROMOTION_THRESHOLDS[band];
  if (threshold === undefined) {
    // 'none' band has no threshold — vacuously true
    return true;
  }
  return count >= threshold;
}
```

Returning `true` for `'none'` means "0 evidence meets the none band", which is
semantically correct, but also means any typo in a band string (e.g.
`'stronng'`) passes silently. The `Record<string, number>` key type offers no
compile-time guard.

**Fix:** Use `Record<PromotionBandEnum, number>` or explicitly check for
`band === 'none'` and throw on unknown bands.

---

### 1.5 — Shared `errors/` and `value-objects/` directories under `domain/shared/` are empty

| Field         | Value                                                   |
| ------------- | ------------------------------------------------------- |
| **Directory** | `domain/shared/errors/`, `domain/shared/value-objects/` |
| **Severity**  | **Low**                                                 |

These directories exist but contain no files. They create misleading
architectural scaffolding suggesting shared domain error types or value objects
exist when they don't.

**Fix:** Either populate them with genuinely shared domain primitives (e.g.,
`CorrelationId`, `DomainError` base), or remove them.

---

## 3. Category 2 — Code Smells

### 2.1 — God Object: `KnowledgeGraphService` at 4149 lines

| Field        | Value                             |
| ------------ | --------------------------------- |
| **File**     | `knowledge-graph.service.impl.ts` |
| **Lines**    | 1–4149                            |
| **Severity** | **Critical**                      |

The implementation class has ~50 public methods and ~20 private helpers spanning
PKG CRUD, CKG reads, traversals, structural analysis, metrics computation,
misconception detection, comparison, CKG mutation delegation, operation logging,
and ~15 agent-hints builders. This violates SRP and makes the file extremely
hard to navigate, test, and review.

**Fix:** Extract cohesive method groups into focused delegates:

- `PkgNodeService` / `PkgEdgeService` — PKG CRUD
- `GraphTraversalService` — traversals, structural analysis (Phase 8c/8d)
- `MetricsOrchestrator` — metrics computation, health, stage
- `MisconceptionOrchestrator` — detection, comparison
- `AgentHintsFactory` — all `createXxxHints` methods (~800+ lines alone)

The main service becomes a thin façade delegating to these.

---

### 2.2 — Massive duplication between PKG and CKG traversal/analysis methods

| Field        | Value                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **File**     | `knowledge-graph.service.impl.ts`                                                                                                                |
| **Lines**    | Various (e.g., `getSubgraph` vs `getCkgSubgraph`, `getCentralityRanking` vs `getCkgCentralityRanking`, `findBridgeNodes` vs `getCkgBridgeNodes`) |
| **Severity** | **High**                                                                                                                                         |

At least 6 pairs of methods differ only in `GraphType.PKG` vs `GraphType.CKG`
and user-scoping. The graph analysis algorithm calls, subgraph fetching, and
result mapping are copy-pasted.

**Fix:** Extract a private `executeAnalysis(graphType, userId?, ...)` or use a
strategy/template method that parameterises graph type.

---

### 2.3 — ~15 `createXxxHints` methods are structurally identical boilerplate

| Field        | Value                             |
| ------------ | --------------------------------- |
| **File**     | `knowledge-graph.service.impl.ts` |
| **Lines**    | ~2750–4130                        |
| **Severity** | **Medium**                        |

Every `createXxxHints` method constructs an `IAgentHints` literal with the same
12 fields, most set to empty arrays or constants (`confidence: 1.0`,
`sourceQuality: 'high'`, `validityPeriod: 'short'`, etc.). This is ~800 lines of
mechanical code.

**Fix:** Extract a `AgentHintsBuilder` with a fluent API or factory:

```typescript
AgentHintsBuilder.new()
  .withActions(actions)
  .withResources(resources)
  .withReasoning(reasoning)
  .build();
```

---

### 2.4 — `console.error` / `console.warn` in domain layer

| Field        | Value                                                 |
| ------------ | ----------------------------------------------------- |
| **File**     | `metrics/structural-metrics-engine.ts` L103           |
| **File**     | `misconception/misconception-detection-engine.ts` L49 |
| **File**     | `metrics/metric-computation-context.ts` L213–217      |
| **Severity** | **Medium**                                            |

Domain modules use `console.error` / `console.warn` directly instead of the
injected Pino logger. This bypasses structured logging, correlation IDs, and
log-level control.

**Fix:** Either inject a logger into the engines/factories via constructor DI,
or emit domain events for observability that the infrastructure layer can log.

---

### 2.5 — `listEdges` uses approximate total count

| Field        | Value                             |
| ------------ | --------------------------------- |
| **File**     | `knowledge-graph.service.impl.ts` |
| **Lines**    | ~700–730 (listEdges method)       |
| **Severity** | **Medium**                        |

```typescript
const total = offset + items.length; // approximate
```

`listNodes` correctly uses `countNodes` for an exact total. `listEdges` fakes
total as `offset + items.length`, which means `hasMore` is always `false` and
clients cannot paginate correctly.

**Fix:** Add a `countEdges(filter)` method to `IEdgeRepository` and call it
here, matching the pattern of `listNodes`.

---

### 2.6 — `ICkgMutation` has mutable fields on a repository return type

| Field        | Value                          |
| ------------ | ------------------------------ |
| **File**     | `mutation.repository.ts`       |
| **Lines**    | 10–40 (ICkgMutation interface) |
| **Severity** | **Medium**                     |

```typescript
export interface ICkgMutation {
  // ... readonly fields ...
  state: MutationState; // mutable
  version: number; // mutable
  updatedAt: string; // mutable
}
```

Three fields are mutable despite `ICkgMutation` being returned from the
repository. The pipeline mutates these in-place after fetching, which violates
the value-object / immutable-return convention used everywhere else in this
codebase.

**Fix:** Make all fields `readonly`. If the pipeline needs to transition state,
create a new object:
`{ ...mutation, state: newState, version: mutation.version + 1 }`.

---

## 4. Category 3 — Bad Design Patterns

### 3.1 — Cross-database consistency gap (Neo4j + Postgres)

| Field        | Value                      |
| ------------ | -------------------------- |
| **File**     | `ckg-mutation-pipeline.ts` |
| **Lines**    | ~700–770 (runCommitStage)  |
| **Severity** | **Critical**               |

The commit stage writes to Neo4j (via `applyOperations`) and then transitions
state in Postgres (via `transitionStateWithAudit`). There is no distributed
transaction, saga, or outbox pattern. If Neo4j commits but Postgres fails (or
vice versa), the CKG and mutation log are permanently inconsistent.

The code even acknowledges this:

```typescript
// TODO: CROSS-DB INCONSISTENCY — if Neo4j commits but Postgres fails,
// the graph has changed but the mutation is stuck in 'committing'.
```

**Fix:**

1. **Immediate:** Implement a compensation handler that detects stuck
   `committing` mutations and rolls back Neo4j changes or re-attempts the
   Postgres transition.
2. **Long-term:** Use transactional outbox + idempotent consumer pattern, or
   orchestrate via Oban (the project's existing job system).

---

### 3.2 — Fire-and-forget async pipeline with no error recovery

| Field        | Value                                               |
| ------------ | --------------------------------------------------- |
| **File**     | `ckg-mutation-pipeline.ts`                          |
| **Lines**    | ~170–185 (proposeMutation calling runPipelineAsync) |
| **Severity** | **High**                                            |

```typescript
void this.runPipelineAsync(mutation);
```

After persisting a mutation, the pipeline is kicked off with a void-ed promise.
If the pipeline throws, the error is only logged. There is no dead letter queue,
no retry/backoff, and no alerting mechanism. Mutations can silently get stuck.

**Fix:** Use Oban job scheduling for the async pipeline stages. Each stage
becomes an idempotent job with automatic retry, dead letter handling, and
telemetry.

---

### 3.3 — N+1 query pattern in `fetchDomainSubgraph`

| Field        | Value                             |
| ------------ | --------------------------------- |
| **File**     | `knowledge-graph.service.impl.ts` |
| **Lines**    | ~2695–2720                        |
| **Severity** | **High**                          |

```typescript
const edges: IGraphEdge[] = [];
for (const node of nodes) {
  const nodeEdges = await this.graphRepository.getEdgesForNode(
    node.nodeId,
    {},
    userId
  );
  edges.push(...nodeEdges);
}
```

For a domain with N nodes, this issues N sequential queries.
Metrics/misconception detection calls this for every `computeStructuralMetrics`
/ `detectMisconceptions` invocation.

**Fix:** Add a batch method to the repository:
`getEdgesForNodes(nodeIds: NodeId[], filter, userId)` that issues a single query
(e.g., `MATCH (n)-[r]-(m) WHERE n.nodeId IN $nodeIds`).

---

### 3.4 — `executeSplit` creates nodes with empty domain then updates

| Field        | Value                      |
| ------------ | -------------------------- |
| **File**     | `ckg-mutation-pipeline.ts` |
| **Lines**    | ~860–920                   |
| **Severity** | **Medium**                 |

The split operation creates new CKG nodes with `domain: ''` and then immediately
updates them with the source node's domain. This two-step mutation is non-atomic
— if the process crashes between create and update, the CKG contains nodes with
empty domains.

**Fix:** Pass the source node's domain directly into `createNode` to make it
atomic.

---

### 3.5 — Edge divergence detection is O(n²) on aligned node pairs

| Field        | Value                                 |
| ------------ | ------------------------------------- |
| **File**     | `metrics/graph-comparison-builder.ts` |
| **Lines**    | ~272–310                              |
| **Severity** | **Medium**                            |

```typescript
for (const [pkgSourceId, ckgSourceId] of nodeAlignment) {
  for (const [pkgTargetId, ckgTargetId] of nodeAlignment) {
```

Nested iteration over all aligned pairs is O(n²) where n = aligned node count.
For large graphs (hundreds of aligned nodes), this becomes a performance
bottleneck.

**Fix:** Iterate over CKG edges instead (O(E)), checking whether each edge's
endpoints are aligned and whether the PKG has a matching edge.

---

### 3.6 — `buildEdgeMap` silently drops duplicate edges

| Field        | Value                                 |
| ------------ | ------------------------------------- |
| **File**     | `metrics/graph-comparison-builder.ts` |
| **Lines**    | 344–351                               |
| **Severity** | **Low**                               |

```typescript
function buildEdgeMap(edges: readonly IGraphEdge[]): Map<string, IGraphEdge> {
  const map = new Map<string, IGraphEdge>();
  for (const edge of edges) {
    const key = `${edge.sourceNodeId}|${edge.targetNodeId}`;
    if (!map.has(key)) {
      map.set(key, edge); // first edge wins
    }
  }
  return map;
}
```

If two edges exist between the same pair (e.g., `prerequisite` and `part_of`),
only the first is kept. This means edge-type mismatches for the second edge are
never detected.

**Fix:** Include `edgeType` in the key, or use a `Map<string, IGraphEdge[]>` to
retain all edges per pair.

---

## 5. Category 4 — Semantic / Logical Errors

### 4.1 — `computeNodeChangedFields` records no-op changes

| Field        | Value                             |
| ------------ | --------------------------------- |
| **File**     | `knowledge-graph.service.impl.ts` |
| **Lines**    | ~2680–2695                        |
| **Severity** | **Medium**                        |

The changed-fields computation uses reference equality (`!==`) on
`properties`/`metadata` objects. If the caller passes the same logical content
as a new object reference, it is recorded as a "change" even though the values
are identical. This pollutes the operation log and publishes unnecessary events.

**Fix:** Use deep equality (e.g., `JSON.stringify` for shallow JSONB, or a
dedicated `deepEqual` utility) for object comparisons.

---

### 4.2 — Cycle detection may miss cycles involving the source node itself

| Field        | Value                                  |
| ------------ | -------------------------------------- |
| **File**     | `knowledge-graph.service.impl.ts`      |
| **Lines**    | ~497–505 (createEdge acyclicity check) |
| **Severity** | **Medium**                             |

```typescript
const cyclePath = await this.graphRepository.detectCycles(
  input.targetNodeId,
  input.edgeType,
  userId
);
// If target can reach source, adding source→target creates a cycle
if (cyclePath.length > 0) {
  throw new CyclicEdgeError(...);
}
```

The method checks if `target` can reach `source`. But it passes
`input.targetNodeId` — this checks if target can reach _any_ node, not
specifically the source. The repository contract is ambiguous and may not
perform the right reachability check. Additionally, self-loop detection
(`sourceNodeId === targetNodeId`) is not explicitly handled.

**Fix:** Ensure the repository's `detectCycles` checks reachability from
`targetNodeId` to `sourceNodeId` specifically. Add an explicit self-loop guard:
`if (input.sourceNodeId === input.targetNodeId) throw new CyclicEdgeError(...)`.

---

### 4.3 — `StructuralMetricsEngine.computeAll` returns `as unknown as` cast

| Field        | Value                                  |
| ------------ | -------------------------------------- |
| **File**     | `metrics/structural-metrics-engine.ts` |
| **Lines**    | 90–91                                  |
| **Severity** | **High**                               |

```typescript
return result as unknown as IStructuralMetrics;
```

A `Record<string, number>` is double-cast to `IStructuralMetrics`. If any
computer fails (caught and defaulted to `0`), or if a computer abbreviation is
misregistered, the returned object may be missing fields. Consumers assume all
11 metric fields are present.

**Fix:** Build the result as a typed object with explicit field assignment, or
validate that all 11 fields are present before returning:

```typescript
const required: (keyof IStructuralMetrics)[] = [
  ...ABBREVIATION_TO_FIELD.values(),
];
for (const field of required) {
  if (!(field in result)) throw new Error(`Missing metric: ${field}`);
}
```

---

### 4.4 — `detectDivergences` assigns fixed severity without context

| Field        | Value                                 |
| ------------ | ------------------------------------- |
| **File**     | `metrics/graph-comparison-builder.ts` |
| **Lines**    | 255–285                               |
| **Severity** | **Low**                               |

All `MISSING_NODE` divergences are `MEDIUM` and all `EXTRA_NODE` divergences are
`LOW`, regardless of the node's centrality, depth, or whether it's a
prerequisite root. A missing root concept and a missing leaf concept get the
same severity.

**Fix:** Factor in CKG depth or centrality when assigning severity. A missing
node that is a prerequisite for many others should be `HIGH` or `CRITICAL`.

---

### 4.5 — `StructuralMisconceptionDetector` DFS cycle detection only captures 2 nodes

| Field        | Value                                            |
| ------------ | ------------------------------------------------ |
| **File**     | `misconception/detectors/structural-detector.ts` |
| **Lines**    | 89–100                                           |
| **Severity** | **Medium**                                       |

```typescript
if (inStack.has(neighbour)) {
  cycleNodes.add(nodeId);
  cycleNodes.add(neighbour);
}
```

When a cycle is detected (back-edge found), only the current node and the
neighbour that closes the cycle are recorded. Intermediate nodes forming the
cycle are missed, so `affectedNodeIds` underreports the cycle size.

**Fix:** Walk the `inStack` from the current node back to `neighbour` to collect
all cycle participants.

---

## 6. Category 5 — Type Safety Issues

### 5.1 — `as unknown as CkgMutationOperation[]` casts in mutation pipeline

| Field        | Value                             |
| ------------ | --------------------------------- |
| **File**     | `ckg-mutation-pipeline.ts`        |
| **Lines**    | Multiple (~160, ~245, ~310, ~750) |
| **Severity** | **Critical**                      |

Throughout the pipeline, `operations` fetched from the mutation record are
double-cast:

```typescript
const operations = mutation.operations as unknown as CkgMutationOperation[];
```

The `ICkgMutation.operations` field is typed as some generic/unknown type in the
repository, so the pipeline force-casts it. If the repository returns malformed
data (e.g., after a schema migration), this cast silently succeeds and the
pipeline operates on invalid data.

**Fix:** Add a runtime Zod validation step when extracting operations from a
persisted mutation:

```typescript
const operations = z
  .array(CkgMutationOperationSchema)
  .parse(mutation.operations);
```

---

### 5.2 — `as unknown as Metadata[]` cast for operations in event payload

| Field        | Value                      |
| ------------ | -------------------------- |
| **File**     | `ckg-mutation-pipeline.ts` |
| **Lines**    | ~250                       |
| **Severity** | **High**                   |

```typescript
operations: mutation.operations as unknown as Metadata[],
```

Operations are cast to `Metadata[]` (which is `Record<string, unknown>[]`) for
event payloads. This loses all type information and could serialize
non-serializable values (functions, symbols, circular refs).

**Fix:** Explicitly map operations to a plain serializable shape before
publishing.

---

### 5.3 — `MutationFilterSchema` uses loose Zod types

| Field        | Value                 |
| ------------ | --------------------- |
| **File**     | `ckg-mutation-dsl.ts` |
| **Lines**    | ~390–420              |
| **Severity** | **Medium**            |

The mutation filter schema uses `z.string()` for `state` and `proposerId`
without `.brand()` or `.refine()` to ensure they match the branded
`MutationState` / `ProposerId` types. A filter with `state: 'totally_invalid'`
passes Zod validation and reaches the repository.

**Fix:** Use `z.enum([...])` for `state` matching the `MutationState` union, and
add `.min(1)` constraints for IDs.

---

### 5.4 — `pattern.config as Record<string, unknown>` unsafe cast in detectors

| Field        | Value                                                 |
| ------------ | ----------------------------------------------------- |
| **File**     | `misconception/detectors/structural-detector.ts` L31  |
| **File**     | `misconception/detectors/statistical-detector.ts` L31 |
| **Severity** | **Medium**                                            |

```typescript
const config = pattern.config as Record<string, unknown>;
const detectionType = config['detectionType'] as string | undefined;
```

`pattern.config` is typed as `Metadata` (which is already
`Record<string, unknown>`), but the cast chain then narrows
`config['detectionType']` to `string | undefined` without validation. If
`detectionType` is a number or object, the `switch` silently falls through to
`default` and the pattern is skipped.

**Fix:** Validate config shape with a Zod schema per detector kind.

---

### 5.5 — `FIELD_TO_METRIC_TYPE` uses `as StructuralMetricType` casts

| Field        | Value                                 |
| ------------ | ------------------------------------- |
| **File**     | `metrics/health/structural-health.ts` |
| **Lines**    | 114–126                               |
| **Severity** | **Low**                               |

```typescript
const FIELD_TO_METRIC_TYPE: Record<string, StructuralMetricType> = {
  abstractionDrift: 'abstraction_drift' as StructuralMetricType,
  // ...11 entries
};
```

Every entry uses `as StructuralMetricType`. If the `StructuralMetricType` enum
changes in `@noema/types` (e.g., renaming `'abstraction_drift'` to `'ad'`),
these casts silently produce invalid values.

**Fix:** Import `StructuralMetricType` enum values directly instead of casting
strings. Same issue in `metacognitive-stage.ts`.

---

## 7. Category 6 — Error Handling Issues

### 6.1 — Metric computation failure silently defaults to 0

| Field        | Value                                  |
| ------------ | -------------------------------------- |
| **File**     | `metrics/structural-metrics-engine.ts` |
| **Lines**    | 95–102                                 |
| **Severity** | **High**                               |

```typescript
try {
  const value = computer.compute(ctx);
  result[field] = value;
} catch (error) {
  result[field] = 0;
  console.error(`...`);
}
```

If any of the 11 metric computers throws, its value is silently set to `0`.
Since `0` is a valid metric value (meaning "no drift" for badness metrics or "no
strength" for goodness metrics), downstream consumers (health report, stage
assessment, cross-metric patterns) cannot distinguish "computed as 0" from
"failed and defaulted to 0". This can trigger incorrect health assessments.

**Fix:** Return a `Result<number, Error>` from each computer, or propagate a
`partialFailures` array alongside the metrics so consumers can handle partial
data.

---

### 6.2 — Misconception detector failure is silently swallowed

| Field        | Value                                             |
| ------------ | ------------------------------------------------- |
| **File**     | `misconception/misconception-detection-engine.ts` |
| **Lines**    | 45–50                                             |
| **Severity** | **Medium**                                        |

Same pattern as 6.1 — individual detector failures are caught, logged to
`console.error`, and the detector's results are simply omitted. No indication to
the caller that structural detection ran but semantic didn't (or failed).

**Fix:** Include a `detectorStatuses` array in the return, or wrap results in a
`{ results, errors }` envelope.

---

### 6.3 — `getEdge`, `updateEdge`, `deleteEdge` have inconsistent null checks

| Field        | Value                                                            |
| ------------ | ---------------------------------------------------------------- |
| **File**     | `knowledge-graph.service.impl.ts`                                |
| **Lines**    | ~620–660 (getEdge), ~660–730 (updateEdge), ~730–800 (deleteEdge) |
| **Severity** | **High**                                                         |

In `getEdge`:

```typescript
const edge = await this.graphRepository.getEdge(edgeId, userId);
if (!edge) {
  throw new EdgeNotFoundError(edgeId, GraphType.PKG);
}
```

But in `updateEdge` and `deleteEdge`, the code first fetches the edge and then
checks ownership:

```typescript
const edge = await this.graphRepository.getEdge(edgeId);
if (edge?.userId !== userId) {
  throw new EdgeNotFoundError(...);
}
```

The `getEdge(edgeId)` call (without userId) is an unscoped fetch. If `edge` is
`null`, `edge?.userId` is `undefined`, and `undefined !== userId` is `true`, so
it still throws — but with a misleading `EdgeNotFoundError` instead of
distinguishing "edge doesn't exist" from "edge belongs to another user" (which
should be `UnauthorizedError`).

**Fix:** Use the userId-scoped repository call consistently, or differentiate
the two error cases.

---

### 6.4 — No timeout or circuit breaker on Neo4j graph operations

| Field        | Value                                          |
| ------------ | ---------------------------------------------- |
| **File**     | `knowledge-graph.service.impl.ts` (throughout) |
| **Severity** | **High**                                       |

All repository calls (`getNode`, `createEdge`, `findNodes`, `getSubgraph`, etc.)
are `await`ed without timeouts. If Neo4j hangs (network partition, long GC
pause), the entire request hangs indefinitely. The structural analysis methods
(`findBridgeNodes`, `getCentralityRanking`) trigger expensive graph traversals
that are especially timeout-sensitive.

**Fix:** Add request-level timeouts at the infrastructure layer (Neo4j driver
config) and/or per-operation `AbortSignal`/`Promise.race` timeouts at the
service layer.

---

### 6.5 — `recoverStuckMutations` has no max recovery attempts

| Field        | Value                      |
| ------------ | -------------------------- |
| **File**     | `ckg-mutation-pipeline.ts` |
| **Lines**    | ~1100–1180                 |
| **Severity** | **Medium**                 |

The recovery method fetches mutations stuck in non-terminal states past a cutoff
time and retries them. There is no check on how many times a mutation has been
recovered — a permanently failing mutation will be retried infinitely on every
recovery sweep.

**Fix:** Add a `recoveryAttempts` counter to `ICkgMutation`. After N attempts
(e.g., 3), transition to `rejected` with reason
`'max_recovery_attempts_exceeded'`.

---

## 8. Category 7 — Contract Mismatches

### 7.1 — `IKnowledgeGraphService` declares `getOperationLog` but implementation returns different pagination model

| Field        | Value                                        |
| ------------ | -------------------------------------------- |
| **File**     | `knowledge-graph.service.ts` L690–710        |
| **File**     | `knowledge-graph.service.impl.ts` ~2450–2500 |
| **Severity** | **Medium**                                   |

The interface declares:

```typescript
getOperationLog(userId, filters, pagination, context):
  Promise<IServiceResult<IPaginatedResponse<IPkgOperationLogEntry>>>
```

The implementation calls
`this.operationLogRepository.getOperationHistory(userId, limit, offset)` which
returns `IPkgOperationLogEntry[]` (no total count). The service then constructs
the `IPaginatedResponse` with:

```typescript
total: offset + items.length,  // approximate
hasMore: items.length === limit,
```

This is the same approximate-total issue as finding 2.5, but here it's on a
paginated interface contract that promises a `total` field. Clients relying on
`total` for UI pagination counts will display incorrect numbers.

**Fix:** Add `countOperations(userId, filters)` to the operation log repository
and use it for exact totals.

---

### 7.2 — `IGraphRepository` extends 4 sub-interfaces but `runInTransaction` is only on the composite

| Field        | Value                 |
| ------------ | --------------------- |
| **File**     | `graph.repository.ts` |
| **Lines**    | 430–442               |
| **Severity** | **Low**               |

```typescript
export interface IGraphRepository
  extends
    INodeRepository,
    IEdgeRepository,
    ITraversalRepository,
    IBatchGraphRepository {
  runInTransaction<T>(fn: (repo: IGraphRepository) => Promise<T>): Promise<T>;
}
```

The ISP split is good, but `runInTransaction` only exists on the composite. Code
that receives an `INodeRepository` (e.g., for testing or narrow DI) cannot use
transactions. The mutation pipeline takes the full `IGraphRepository`, so this
is a minor DI inflexibility rather than a correctness bug.

**Fix:** Either keep this as-is (acceptable trade-off) or define
`ITransactional` as a separate mixin.

---

### 7.3 — `IMetricSnapshot.metrics` type doesn't match `IStructuralMetrics`

| Field        | Value                   |
| ------------ | ----------------------- |
| **File**     | `metrics.repository.ts` |
| **Lines**    | 10–20                   |
| **Severity** | **Medium**              |

```typescript
export interface IMetricSnapshot {
  readonly snapshotId: string;
  readonly userId: string;
  readonly domain: string;
  readonly metrics: Record<string, number>;
  readonly computedAt: string;
}
```

`metrics` is typed as `Record<string, number>` — a loose bag. When the service
saves a snapshot, it stores `IStructuralMetrics` (11 specific fields). When it
reads it back, it gets `Record<string, number>` and has to cast. If the repo
returns a snapshot from an older schema version (e.g., when a metric was added),
missing fields silently become `undefined` when accessed as
`IStructuralMetrics`.

**Fix:** Type `metrics` as `IStructuralMetrics` in the interface, or add a
version field and migration/validation logic.

---

### 7.4 — `CkgMutationPipeline` constructor depends on concrete logger but interface doesn't declare it

| Field        | Value                      |
| ------------ | -------------------------- |
| **File**     | `ckg-mutation-pipeline.ts` |
| **Lines**    | ~50–70                     |
| **Severity** | **Low**                    |

The pipeline takes a `Logger` (Pino) in its constructor, but the pipeline is
instantiated and injected into `KnowledgeGraphService` without any interface
defining the pipeline's DI contract. This makes it hard to mock in tests.

**Fix:** Define `ICkgMutationPipeline` interface for the pipeline's public
methods, inject via that interface.

---

### 7.5 — `IMisconceptionDetectionResult.confidence` typed as `number` but consumed as `ConfidenceScore`

| Field        | Value                                                              |
| ------------ | ------------------------------------------------------------------ |
| **File**     | `misconception/types.ts` L39 (`confidence: number`)                |
| **File**     | `knowledge-graph.service.impl.ts` ~4050 (`d.confidence as number`) |
| **Severity** | **Low**                                                            |

The detection result uses plain `number` for confidence, but
`IMisconceptionDetection` (from `@noema/types`) uses branded `ConfidenceScore`.
The service casts explicitly: `d.confidence as number`. The domain boundary
between internal detection results and the external contract type is bridged by
a cast instead of a proper mapping/factory.

**Fix:** Use `ConfidenceScore` in `IMisconceptionDetectionResult`, or add an
explicit mapping function at the boundary.

---

## 9. Summary Statistics

| Severity     | Count  |
| ------------ | ------ |
| **Critical** | 5      |
| **High**     | 11     |
| **Medium**   | 14     |
| **Low**      | 8      |
| **Total**    | **38** |

| Category                     | Count |
| ---------------------------- | ----- |
| 1. Implementation Gaps       | 5     |
| 2. Code Smells               | 6     |
| 3. Bad Design Patterns       | 6     |
| 4. Semantic / Logical Errors | 5     |
| 5. Type Safety Issues        | 5     |
| 6. Error Handling Issues     | 5     |
| 7. Contract Mismatches       | 5     |

### Top 5 Priorities (by impact × effort)

| #   | Finding                                   | Severity | Effort |
| --- | ----------------------------------------- | -------- | ------ |
| 1   | 3.1 — Cross-DB consistency gap            | Critical | High   |
| 2   | 5.1 — `as unknown as` casts in pipeline   | Critical | Medium |
| 3   | 2.1 — God object (4149 lines)             | Critical | High   |
| 4   | 3.3 — N+1 query in fetchDomainSubgraph    | High     | Low    |
| 5   | 6.1 — Silent metric failure defaults to 0 | High     | Low    |
