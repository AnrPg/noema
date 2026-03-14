# Knowledge Graph Service — Comprehensive Audit Report

**Date:** 2025-01-XX  
**Scope:** `services/knowledge-graph-service` (153 files)  
**TypeScript Compilation:** ✅ CLEAN (`npx tsc --noEmit` = 0 errors)

---

## CRITICAL Findings

### C1. Soft-Deleted Edges Returned by Neo4j Edge Queries

**Files:**
- `src/infrastructure/database/neo4j-graph.repository.ts` — lines 370–384 (`getEdge`), 532–575 (`getEdgesForNode`), 470–530 (`findEdges`), 600–615 (`countEdges`), 644–680 (`getEdgesForNodes`)

**Description:**  
`deleteNode()` soft-deletes connected edges by setting `r.isDeleted = true`. However, **none of the edge read methods** (`getEdge`, `getEdgesForNode`, `findEdges`, `countEdges`, `getEdgesForNodes`) filter out `isDeleted = true` edges. This means:
- After deleting a node, its formerly connected edges are still returned by all edge queries.
- Edge counts include ghost edges.
- Structural metrics are computed over stale edges.
- Agent tools receive deleted edges as live data.

`removeEdge()` hard-deletes (Cypher `DELETE r`), but `deleteNode()` only soft-deletes connected edges. So the system has **two inconsistent deletion semantics for edges** — soft-delete (node cascade) and hard-delete (direct edge removal).

**Impact:** Data integrity violation. Users see phantom edges. Structural metrics are wrong.

**Fix:** Add `r.isDeleted = false` (or `WHERE NOT EXISTS(r.isDeleted) OR r.isDeleted = false`) to all edge read Cypher queries. Alternatively, align on a single deletion strategy (hard-delete edges in `deleteNode` cascade too, since `removeEdge` already hard-deletes).

---

### C2. `getEdgesForNode` Ignores `userId` Parameter

**File:** `src/infrastructure/database/neo4j-graph.repository.ts` — line 532

**Description:**  
The method signature is `getEdgesForNode(nodeId, direction, _userId?)` — the `_userId` parameter is prefixed with `_`, indicating it is **intentionally unused**. The Cypher queries inside never filter by `userId`. This means:
- In a multi-tenant Neo4j database, **any user's edges are returned for any node query** regardless of the calling user.
- PKG edge listing (user-scoped) passes `userId` from the service layer, but the repository ignores it.

**Impact:** Data leakage across users. A user could see edges belonging to other users' PKGs if nodes share IDs across graphs (unlikely with prefixed IDs but architecturally unsound).

**Fix:** Add `AND r.userId = $userId` (or `AND n.userId = $userId`) to the Cypher queries when `userId` is provided.

---

### C3. Misconception Domain Filtering Uses Semantically Wrong Predicate

**Files:**
- `src/infrastructure/database/repositories/prisma-misconception.repository.ts` — line 285
- Called from `src/domain/knowledge-graph-service/metrics-orchestrator.service.ts` — `getActiveMisconceptions`

**Description:**  
`getActiveMisconceptions(userId, domain)` filters misconceptions by:
```typescript
misconceptionPattern: {
  misconceptionType: { startsWith: domain },
}
```
`misconceptionType` values are detection-type identifiers like `'circular_dependency'`, `'orphan_concept'`, `'broken_chain'`, etc. The `domain` parameter is a knowledge domain like `'mathematics'` or `'biology'`. These are completely different taxonomies — `'mathematics'.startsWith('circular_dependency')` is always `false`.

**Impact:** Domain-filtered misconception queries **always return zero results**. The MCP tool `detect-misconceptions` with a domain filter returns nothing. `suggest-intervention` fetches all misconceptions instead of domain-scoped ones.

**Fix:** The `MisconceptionDetection` Prisma model doesn't have a `domain` field — detections are linked to patterns, not domains. Either:
1. Add a `domain` field to `MisconceptionDetection` and populate it during detection, OR
2. Join through the source data (the subgraph domain used during detection), OR  
3. Store `domain` in the detection metadata and filter on it.

---

## HIGH Findings

### H1. `toDomain()` Mapping Drops ~10 Prisma CkgMutation Fields

**File:** `src/infrastructure/database/repositories/prisma-mutation.repository.ts` — line 340

**Description:**  
The `toDomain()` mapper only maps: `id`, `state`, `createdBy→proposedBy`, `version`, `operation→operations`, `rationale`, `evidenceCount`, `recoveryAttempts`, `revisionCount`, `revisionFeedback`, `createdAt`, `updatedAt`.

Unmapped Prisma fields (written but never surfaced to the domain):
- `targetNodeIds` — which CKG nodes the mutation affects  
- `targetEdgeIds` — which CKG edges the mutation affects  
- `proofResult` — result of the proof stage  
- `commitResult` — result of the commit stage  
- `rejectionReason` — why the mutation was rejected  
- `validationResult` — detailed validation output  
- `evidenceRefs` — references to supporting evidence  
- `metadata` — arbitrary metadata  
- `mutationType` — hardcoded to `'standard'`  
- `priority` — ordering priority  
- `userId` — actual user ID (vs `createdBy` used as `proposedBy`)  

**Impact:** Domain consumers (service, pipeline, routes, MCP tools) cannot access rejection reasons, validation results, proof results, or evidence references — making the pipeline opaque. The REST API returns mutations without debug/audit data that exists in the database.

**Fix:** Extend the `ICkgMutation` domain interface with the missing fields and map them in `toDomain()`.

---

### H2. `listMutations` and `listActiveMutations` Missing `revision_requested` State

**File:** `src/domain/knowledge-graph-service/ckg-mutation-pipeline.ts` — lines 278 and 298

**Description:**  
The typestate machine defines 10 states including `revision_requested`. However:

`listMutations` (no filter) builds an explicit states array:
```typescript
['proposed', 'validating', 'validated', 'pending_review', 'proving', 'proven', 'committing', 'committed', 'rejected']
```
Missing: `revision_requested`

`listActiveMutations` builds:
```typescript
['proposed', 'validating', 'validated', 'pending_review', 'proving', 'proven', 'committing']
```
Missing: `revision_requested`

**Impact:** Mutations awaiting resubmission after reviewer feedback are **invisible** in both unfiltered listings and active-mutation listings. Agents polling for "all mutations" or "all active mutations" will never see revision-requested mutations. The pipeline health dashboard would show these mutations as vanished.

**Fix:** Add `'revision_requested'` to both arrays.

---

### H3. `createMutation` Hardcodes `mutationType` and Ignores `priority`

**File:** `src/infrastructure/database/repositories/prisma-mutation.repository.ts` — `createMutation()`

**Description:**  
```typescript
mutationType: 'standard',  // hardcoded
// priority is never set from input
```
The Prisma schema has `mutationType String @default("standard")` and `priority Int @default(0)`, but the repository ignores the `ICreateMutationInput` — it never reads `priority` from the input. The MCP tool `propose-mutation` accepts a `priority` field, but it's silently discarded.

**Impact:** All mutations have the same priority regardless of input. The mutation processing order cannot be influenced by agents.

**Fix:** Add `priority` to `ICreateMutationInput` and map it in `createMutation()`.

---

### H4. Semantic Misconception Detector Throws if Enabled

**File:** `src/domain/knowledge-graph-service/misconception/detectors/semantic-detector.ts` — line 39

**Description:**  
```typescript
if (!this.config.vectorServiceEnabled) {
  return [];
}
throw new Error('SemanticMisconceptionDetector: vector service is enabled but semantic detection is not yet implemented.');
```
If the config flag `vectorServiceEnabled` is set to `true` (e.g., by misconfiguration), the detector **throws an unhandled error** instead of gracefully degrading. While the detection engine catches per-detector errors, this is a latent crash risk.

**Impact:** Configuration error could crash the misconception detection pipeline.

**Fix:** Return empty results with a warning log instead of throwing when unimplemented.

---

## MEDIUM Findings

### M1. Edge Deletion Semantics Inconsistency: Soft vs. Hard Delete

**File:** `src/infrastructure/database/neo4j-graph.repository.ts`
- `deleteNode()` (line 220): Soft-deletes connected edges (`SET r.isDeleted = true`)
- `removeEdge()` (line 441): Hard-deletes the relationship (`DELETE r`)

**Description:**  
Two different deletion strategies for edges creates operational inconsistency:
- Edges orphaned by node deletion remain in the graph (queryable, as shown in C1).
- Edges explicitly removed are gone permanently.
- There's no cleanup job that hard-deletes soft-deleted edges.

**Impact:** Gradual accumulation of ghost edges. Potential confusion in audit trails (edge exists in Neo4j but node is "deleted").

**Fix:** Choose one strategy. Recommendation: hard-delete edges in `deleteNode` cascade (consistent with `removeEdge` behavior), since edges don't have independent audit trail needs.

---

### M2. `getEdge` / `updateEdge` Missing `isDeleted` Checks

**File:** `src/infrastructure/database/neo4j-graph.repository.ts` — lines 370, 395

**Description:**  
`getEdge()` and `updateEdge()` match edges by `r.edgeId = $edgeId` without checking `r.isDeleted = false` or verifying the connected nodes are not deleted. This means:
- A soft-deleted edge (from node deletion cascade) can be fetched.
- A soft-deleted edge can be updated.

**Impact:** Operations on zombie edges succeed silently.

---

### M3. `findEdges` / `countEdges` Missing `isDeleted` Filter for Nodes and Edges

**File:** `src/infrastructure/database/neo4j-graph.repository.ts` — lines 470–530, 600–640

**Description:**  
Neither method filters for `source.isDeleted = false AND target.isDeleted = false` or `r.isDeleted = false`. Queries across soft-deleted nodes/edges return stale data.

---

### M4. CKG Edge Listing Missing Graph Type Filter

**File:** `src/domain/knowledge-graph-service/graph-read.service.ts` — `listCkgEdges()` (around line 900)

**Description:**  
```typescript
const ckgFilter: IEdgeFilter = {
  ...(filters.edgeType !== undefined ? { edgeType: filters.edgeType } : {}),
  ...(filters.sourceNodeId !== undefined ? { sourceNodeId: filters.sourceNodeId } : {}),
  ...(filters.targetNodeId !== undefined ? { targetNodeId: filters.targetNodeId } : {}),
};
```
Unlike `listCkgNodes` which adds `graphType: GraphType.CKG` to the filter, `listCkgEdges` does **not** filter by graph type. This means CKG edge listings could return PKG edges if no source/target/type filter is provided.

**Impact:** CKG edge endpoints may return PKG edges.

**Fix:** Add a `graphType` filter to the edge query, or validate that returned edges belong to the CKG.

---

### M5. `getEdgesForNode` in Transactional Repository Also Ignores `_userId`

**File:** `src/infrastructure/database/neo4j-graph.repository.ts` — `Neo4jTransactionalGraphRepository.getEdgesForNode()` (line ~2270)

**Description:**  
Same `_userId` ignore pattern as the main repository. During CKG commit transactions, this is less critical (CKG doesn't have user scoping), but it's a consistency issue.

---

### M6. Validation Stage `validateAddEdge` Performs Cycle Detection on `targetNodeId` Only

**File:** `src/domain/knowledge-graph-service/ckg-validation-stages.ts` — `validateAddEdge()` (around line 260)

**Description:**  
```typescript
const cyclePath = await this.graphRepository.detectCycles(
  op.targetNodeId as NodeId,
  op.edgeType
);
```
Cycle detection is only run starting from the **target** node. This checks if there's already a path from target back to target via the edge type. However, to check if adding `source→target` creates a cycle, you need to check if there's an existing path from `target` back to `source`. The `detectCycles` method looks for cycles at a single node, not for a path between two specific nodes.

**Impact:** May miss cycles that the new edge would introduce. The edge might create a cycle detectable only by checking `findShortestPath(targetNodeId → sourceNodeId)`.

**Fix:** Use `findShortestPath(targetNodeId, sourceNodeId)` with the specific edge type instead of generic cycle detection.

---

### M7. Subgraph Cypher Query Deduplication May Lose Edges

**File:** `src/infrastructure/database/neo4j-graph.repository.ts` — `getSubgraph()` (around line 810)

**Description:**  
```cypher
WITH collect(DISTINCT connected) AS allNodes,
     [r IN collect(DISTINCT relationships(path)) | head(r)] AS allRels
```
The `head(r)` takes only the **first** relationship from each path's relationship list. For multi-hop paths, inner edges (not the first hop) may be dropped.

**Impact:** Subgraphs may be missing interior edges for paths longer than 1 hop.

**Fix:** Use `UNWIND relationships(path) AS r` to collect all relationships from all paths.

---

### M8. Cached Graph Repository Does Not Invalidate on `updateEdge`/`removeEdge` Correctly When `userId` Is Unknown

**File:** `src/infrastructure/cache/cached-graph.repository.ts` — lines 178–200

**Description:**  
`updateEdge` and `removeEdge` pre-fetch the edge to get node IDs and determine the user scope: `const scope = edge.userId ?? undefined`. If the edge doesn't have a `userId` property, the scope is `undefined` (treated as CKG). This is correct for CKG edges but incorrect for PKG edges that might not have `userId` stored on the relationship (depends on `buildEdgeProperties`).

**Impact:** Potential cache staleness if edge userId is not consistently stored on Neo4j relationships.

---

## LOW Findings

### L1. `observability.ts` Counter Names May Not Be Standardized

Not yet audited in detail, but metric counter naming should follow OpenTelemetry conventions.

### L2. `SemanticMisconceptionDetector` Constructor Default Could Be Injected via DI

**File:** `src/domain/knowledge-graph-service/misconception/detectors/semantic-detector.ts`

**Description:**  
Default config `{ vectorServiceEnabled: false }` is fine for now but should be wired through DI for environment-specific configuration rather than hardcoded defaults.

### L3. Statistical Detector Confidence Clamping May Produce High Scores for Small Anomaly Counts

**File:** `src/domain/knowledge-graph-service/misconception/detectors/statistical-detector.ts`

**Description:**  
Weight anomaly confidence: `0.5 + anomalousEdges.length * 0.1`. With 5 anomalous edges, confidence = 1.0 (clamped). For small subgraphs where 5 is "all edges", this may overstate confidence.

### L4. `buildBatchRelTypePattern` Optimization Missing — Repeated `ALL_REL_TYPES.join('|')` Calls

**File:** `src/infrastructure/database/neo4j-graph.repository.ts`

**Description:**  
The pattern `ALL_REL_TYPES.join('|')` is evaluated on every method call. Should be precomputed as a constant.

### L5. MCP Tool `remove-node` Passes `reason` via Context Spreading Hack

**File:** `src/agents/tools/kg.tools.ts` — line ~453

**Description:**  
```typescript
{ ...context, reason: body.reason } as IExecutionContext & { reason: string }
```
The `reason` is spread into the execution context with a type assertion. The service's `deleteNode` method doesn't read `reason` from context — it's lost.

**Impact:** The deletion reason provided by agents is never persisted to the operation log.

**Fix:** Add `reason` to `deleteNode`'s parameters or include it in the operation log explicitly.

### L6. Batch Node Creation Secondary Labels Use Sequential Cypher Calls

**File:** `src/infrastructure/database/neo4j-graph.repository.ts` — `createNodes()` (around line 1780)

**Description:**  
After batch-creating nodes via `UNWIND`, secondary labels are applied in a separate `executeWrite` with sequential `tx.run` calls per node. For large batches, this is N+1 round trips.

**Fix:** Use `APOC.create.addLabels` or `CALL { ... } IN TRANSACTIONS` for batch label application.

### L7. `listCkgEdges` Filter Omits `nodeId` and `userId` From Input Filters

**File:** `src/domain/knowledge-graph-service/graph-read.service.ts` — `listCkgEdges()` (around line 900)

**Description:**  
The CKG edge filter construction explicitly only passes `edgeType`, `sourceNodeId`, `targetNodeId`, dropping any other filter fields the caller might have set.

---

## Structural Observations (Non-Bugs)

### S1. Neo4j Transactional Repository Correctly Stubs Unsupported Operations
The `Neo4jTransactionalGraphRepository` throws clear errors for traversal/analysis methods not needed during CKG commit. This is architecturally sound.

### S2. Validation Pipeline Is Correctly Pluggable
The 4-stage validation pipeline (schema → structural_integrity → conflict_detection → evidence_sufficiency) uses the Strategy pattern correctly with ordered stages and short-circuit support.

### S3. MCP Tools Comprehensive Coverage
18 tools covering PKG CRUD (9), CKG read + mutation (3), structural analysis (4), metacognition (2). All use Zod input validation. Error handling is consistent with `errorResult()`. The `get-learning-path-context` aggregation tool efficiently parallelizes 5 service calls.

### S4. Edge Policy Enforcement Is Thorough
`pkg-write.service.ts` validates: node type compatibility, weight bounds, custom validators, acyclicity check. Non-blocking ontological conflict advisory is a nice touch.

### S5. Agent Hints Pattern Is Well-Implemented
Every service result includes structured `agentHints` with `suggestedNextActions`, `riskFactors`, `reasoning`, etc. — consistent across all operations.

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| CRITICAL | 3 | Soft-deleted edges returned, userId ignored, misconception domain filter broken |
| HIGH     | 4 | Prisma→domain mapping gaps, missing state in listings, hardcoded fields, detector crash |
| MEDIUM   | 8 | Deletion inconsistency, missing isDeleted checks, CKG edge type filter, cycle detection correctness, subgraph edge loss, cache invalidation |
| LOW      | 7 | Confidence scoring, context spreading hack, batch perf, counter naming |

**Recommended Priority Order:**
1. **C1 + M1 + M2 + M3** — Fix soft-delete consistency and add isDeleted filters (biggest data integrity risk)
2. **C2** — Add userId filtering to getEdgesForNode 
3. **C3** — Fix misconception domain filtering (feature completely broken)
4. **H2** — Add revision_requested to state arrays (data visibility)
5. **H1** — Extend ICkgMutation domain type with missing fields
6. **M4** — Add graph type filter to CKG edge listing
7. **M6** — Fix cycle detection in CKG validation stage
8. **H3** — Wire priority through to mutation creation
9. **Remaining** in order of impact
