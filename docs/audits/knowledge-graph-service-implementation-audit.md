# Knowledge Graph Service — Implementation Audit Report

**Date**: 2025-01-27  
**Scope**: `services/knowledge-graph-service/src/`  
**Status**: Research-only audit — no code changes applied  
**Auditor**: AI-assisted code review

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Layer Completeness](#1-layer-completeness)
3. [Repository Layer](#2-repository-layer)
4. [CKG Mutation Pipeline](#3-ckg-mutation-pipeline)
5. [Misconception Detection](#4-misconception-detection)
6. [Prisma Schema Alignment](#5-prisma-schema-alignment)
7. [Error Handling](#6-error-handling)
8. [Import / Export Issues](#7-import--export-issues)

---

## Executive Summary

The knowledge-graph-service is a well-structured, feature-rich implementation
following hexagonal architecture with clear separation between API, domain, and
infrastructure layers. The codebase demonstrates strong patterns: resilient
post-write operations, optimistic locking, cross-DB consistency reconciliation,
and comprehensive audit logging.

However, this audit identified **3 CRITICAL**, **4 HIGH**, **6 MEDIUM**, and **5
LOW** findings — mostly concentrated in the CKG mutation pipeline's state
enumeration blind spots and Prisma schema alignment gaps.

| Severity | Count | Category                                                             |
| -------- | ----- | -------------------------------------------------------------------- |
| CRITICAL | 3     | Missing `revision_requested` state in 3 key enumeration methods      |
| HIGH     | 4     | In-memory pagination, non-atomic side effects, incorrect audit entry |
| MEDIUM   | 6     | Schema→domain mapping gaps, dead fields, semantic HTTP code issues   |
| LOW      | 5     | Dead code, unused error classes, config dead-ends                    |

---

## 1. Layer Completeness

### Architecture Overview

```
API Layer (Fastify REST)
  └── 14 route modules → handleError() → IApiResponse envelope
Domain Layer
  └── IKnowledgeGraphService (interface, ~45 methods)
      └── KnowledgeGraphService (facade)
          ├── PkgWriteService (node/edge CRUD + oplog + events + staleness)
          ├── GraphReadService (traversal + analysis for PKG + CKG)
          ├── MetricsOrchestrator (metrics + misconceptions + health + comparison)
          └── CkgMutationPipeline (typestate machine + validation + commit)
Infrastructure Layer
  └── 6 Prisma repositories + Neo4j IGraphRepository
```

### Complete Route Catalog (all verified)

All 12 registered route modules expose endpoints, and every route handler
delegates to a corresponding `IKnowledgeGraphService` method. No orphan routes,
no missing service methods.

### Service Interface Coverage: **COMPLETE**

All ~45 `IKnowledgeGraphService` interface methods are implemented in
`KnowledgeGraphService` via delegation to sub-services. No stub methods found.

### Finding 1.1: No Issues — Clean Layer Separation

The facade pattern cleanly divides responsibilities:

- `PkgWriteService`: All PKG CRUD with resilient post-write (log, publish, mark
  stale)
- `GraphReadService`: All traversal/analysis with PKG/CKG deduplication via
  template methods
- `MetricsOrchestrator`: Metrics computation, misconception detection, health
  assessment
- `CkgMutationPipeline`: Full typestate lifecycle with audit trail

**Verdict**: Layer completeness is solid.

---

## 2. Repository Layer

### Interface Coverage

| Repository Interface                         | Prisma Implementation                 | Methods Matched            |
| -------------------------------------------- | ------------------------------------- | -------------------------- |
| `IMutationRepository` (12 methods)           | `PrismaMutationRepository`            | ✅ All 12                  |
| `IMetricsRepository` (4 methods)             | `PrismaMetricsRepository`             | ✅ All 4                   |
| `IMisconceptionRepository` (11 methods)      | `PrismaMisconceptionRepository`       | ✅ All 11                  |
| `IPkgOperationLogRepository` (7 methods)     | `PrismaOperationLogRepository`        | ✅ All 7                   |
| `IAggregationEvidenceRepository` (6 methods) | `PrismaAggregationEvidenceRepository` | ✅ All 6                   |
| `IMetricsStalenessRepository` (3 methods)    | `PrismaMetricsStalenessRepository`    | ✅ All 3                   |
| `IGraphRepository` (~36 methods)             | `Neo4jGraphRepository`                | Not audited (Neo4j driver) |

### Finding 2.1 [MEDIUM] — Operation Log Unbounded Queries

**File**:
`src/infrastructure/database/repositories/prisma-operation-log.repository.ts`  
**Lines**: 152–176 (`getOperationsForNode`, `getOperationsForEdge`,
`getOperationsSince`)

These three repository methods return **all matching results without limit**.
The consumer (`KnowledgeGraphService.getOperationLog`) applies in-memory
pagination after the unbounded fetch.

```typescript
// getOperationsForNode — no limit/take clause
async getOperationsForNode(userId: UserId, nodeId: NodeId): Promise<IPkgOperationLogEntry[]> {
  const records = await this.prisma.pkgOperationLog.findMany({
    where: {
      userId: userId as string,
      affectedNodeIds: { has: nodeId as string },
    },
    orderBy: { sequenceNumber: 'desc' },
    // ⚠️ No take/skip — fetches entire history for this node
  });
  return records.map((r) => this.toDomain(r));
}
```

The caller in `knowledge-graph.service.impl.ts` at lines 930–960 then slices
in-memory:

```typescript
// Manual pagination over the full list
total = entries.length;
paginatedEntries = entries.slice(offset, offset + limit);
```

**Impact**: For power users with hundreds of node operations, this fetches the
entire log into memory just to return a page.

**Recommendation**: Add `limit`/`offset` parameters to `getOperationsForNode`,
`getOperationsForEdge`, and `getOperationsSince` in both the interface and
implementation, or return `IPaginatedResponse` like the other methods.

---

### Finding 2.2 [MEDIUM] — Operation Log `toDomain()` Drops Schema Fields

**File**:
`src/infrastructure/database/repositories/prisma-operation-log.repository.ts`  
**Lines**: 216–225

The `toDomain()` mapper only maps `id`, `userId`, `operation`, and `createdAt`.
The Prisma schema also stores:

- `sequenceNumber` (Int) — useful for sync ordering
- `operationType` (String) — useful for filtering without deserializing JSON
- `affectedNodeIds` (String[]) — useful for client-side filtering
- `affectedEdgeIds` (String[])

However, the domain interface `IPkgOperationLogEntry` (lines 31–44 of
`pkg-operation-log.repository.ts`) intentionally only defines `id`, `userId`,
`operation`, `createdAt`. So the data is stored for query indices but not
returned to the domain layer. **This is deliberate** — the operation payload
contains all the information. The indexed columns are for DB-level query
performance only.

**Verdict**: Not a bug — architectural choice. Documented for awareness.

---

## 3. CKG Mutation Pipeline

### Finding 3.1 [CRITICAL] — `listMutations` Omits `revision_requested` State — **FIXED** (`39db93c`)

**File**: `src/domain/knowledge-graph-service/ckg-mutation-pipeline.ts`  
**Lines**: 275–287

**Status**: Fixed — `'revision_requested'` added to the states array.

```typescript
// No filters — return all (via all states in a single query)
const states: MutationState[] = [
  'proposed',
  'validating',
  'validated',
  'pending_review',
  'proving',
  'proven',
  'committing',
  'committed',
  'rejected',
  // ⚠️ MISSING: 'revision_requested'
];
return this.mutationRepository.findMutationsByStates(states);
```

The CKG typestate defines 10 states (confirmed in `ckg-typestate.ts`):

```
proposed, validating, validated, pending_review, revision_requested,
proving, proven, committing, committed, rejected
```

**Impact**: Any mutation in `revision_requested` state **silently disappears**
from the unfiltered mutation list. Admins cannot see mutations awaiting
resubmission.

**Fix**: Add `'revision_requested'` to the states array.

---

### Finding 3.2 [CRITICAL] — `listActiveMutations` Omits `revision_requested` State — **FIXED** (`39db93c`)

**File**: `src/domain/knowledge-graph-service/ckg-mutation-pipeline.ts`  
**Lines**: 296–305

**Status**: Fixed — `'revision_requested'` added to the active states array.

```typescript
async listActiveMutations(): Promise<ICkgMutation[]> {
  const activeStates: MutationState[] = [
    'proposed',
    'validating',
    'validated',
    'pending_review',
    'proving',
    'proven',
    'committing',
    // ⚠️ MISSING: 'revision_requested'
  ];
  return this.mutationRepository.findMutationsByStates(activeStates);
}
```

**Impact**: Mutations awaiting revision feedback are invisible to the active
mutations view. If used by monitoring dashboards, this creates a blind spot.

**Fix**: Add `'revision_requested'` to the active states list.

---

### Finding 3.3 [CRITICAL] — `getPipelineHealth` Has No `revision_requested` Counter — **FIXED** (`39db93c`)

**File**: `src/domain/knowledge-graph-service/ckg-mutation-pipeline.ts`  
**Lines**: 663–708

**Status**: Fixed — Added `countMutationsByState('revision_requested')` and
`revisionRequestedCount` to the return type, interface
(`ICkgMutationPipeline`), service type (`IPipelineHealthResult`), and service
implementation (`KnowledgeGraphServiceImpl`).

```typescript
const [
  proposed,
  validating,
  validated,
  pendingReview,
  committed,
  rejected,
  proving,
  proven,
  committing,
] = await Promise.all([
  this.mutationRepository.countMutationsByState('proposed'),
  this.mutationRepository.countMutationsByState('validating'),
  this.mutationRepository.countMutationsByState('validated'),
  this.mutationRepository.countMutationsByState('pending_review'),
  this.mutationRepository.countMutationsByState('committed'),
  this.mutationRepository.countMutationsByState('rejected'),
  this.mutationRepository.countMutationsByState('proving'),
  this.mutationRepository.countMutationsByState('proven'),
  this.mutationRepository.countMutationsByState('committing'),
  // ⚠️ MISSING: countMutationsByState('revision_requested')
]);
```

The return type (`IPipelineHealthResult` in `knowledge-graph.service.ts`) also
lacks a `revisionRequestedCount` field.

**Impact**: Monitoring and alerting has zero visibility into mutations waiting
for revision. The `/mutations/health` endpoint cannot report this state.

**Fix**: Add `countMutationsByState('revision_requested')`, add
`revisionRequestedCount` to the return type and the interface.

---

### Finding 3.4 [HIGH] — `listMutations` Uses In-Memory Pagination

**File**: `src/api/rest/ckg-mutation.routes.ts`  
**Lines**: 153–160

The API route fetches **all** mutations matching the filter, then slices
in-memory:

```typescript
const result = await service.listMutations(filter, context);

// Apply pagination at the API layer
const { page, pageSize } = query;
const start = (page - 1) * pageSize;
const paginatedData = result.data.slice(start, start + pageSize);
```

The underlying `findMutations` and `findMutationsByStates` repo methods also
lack `limit`/`offset`:

```typescript
// prisma-mutation.repository.ts line 221
const records = await this.prisma.ckgMutation.findMany({
  where,
  orderBy: { createdAt: 'desc' },
  // ⚠️ No take/skip
});
```

**Impact**: As the mutation table grows, this fetches the entire table for every
paginated request. With thousands of historical mutations, this degrades
performance and wastes memory.

**Recommendation**: Add `limit`/`offset` (or cursor-based pagination) to
`findMutations`, `findMutationsByStates`, and `listMutations` at the domain
level. Remove API-layer slicing.

---

### Finding 3.5 [HIGH] — `runPipelineAsync` Hardcodes `fromState: 'proposed'` in Failure Audit

**File**: `src/domain/knowledge-graph-service/ckg-mutation-pipeline.ts`  
**Lines**: 745–764

When the fire-and-forget pipeline fails, the error handler appends an audit
entry with hardcoded `fromState: 'proposed'`:

```typescript
// Durable audit: persist failure so it survives process restarts
try {
  await this.mutationRepository.appendAuditEntry({
    mutationId,
    fromState: 'proposed' as MutationState,  // ⚠️ WRONG — could be validating/proving/committing
    toState: 'rejected' as MutationState,
    performedBy: 'system',
    context: {
      action: 'pipeline_failure',
      error: message,
      correlationId: context.correlationId,
    },
  });
```

The mutation could be in `validating`, `proving`, or `committing` when the error
occurs. The audit entry should record `fromState` as the mutation's actual
current state, not assume `proposed`.

**Impact**: Audit trail records incorrect state transitions. Forensic
investigation of pipeline failures will show wrong `fromState`.

**Fix**: Fetch the current mutation state before appending the audit entry, or
capture the state from the last known good transition. Alternatively,
restructure to catch-per-stage with accurate state tracking.

---

### Finding 3.6 [HIGH] — `requestRevision` Has Non-Atomic Side Effects

**File**: `src/domain/knowledge-graph-service/ckg-mutation-pipeline.ts`  
**Lines**: 499–556

`requestRevision` performs two sequential operations that are **not wrapped in a
transaction**:

1. `transitionState()` — atomically updates state + audit via Prisma
   `$transaction`
2. `updateMutationFields()` — separate `prisma.ckgMutation.update()` call

```typescript
// Step 1: PENDING_REVIEW → REVISION_REQUESTED (atomic with audit)
mutation = await this.transitionState(
  mutation,
  'revision_requested',
  performedBy,
  reason,
  context,
  snapshot
);

// Step 2: Persist feedback (separate DB call — NOT atomic with step 1)
mutation = await this.mutationRepository.updateMutationFields(
  mutation.mutationId,
  { revisionFeedback: feedback, revisionCount: mutation.revisionCount + 1 }
);
```

If the process crashes between step 1 and step 2, the mutation will be in
`revision_requested` state but without the revision feedback — leaving the
proposer unable to know what to fix.

**Impact**: Partial state on crash — mutation transitions to
`revision_requested` but feedback is lost.

**Recommendation**: Either wrap both operations in a single Prisma
`$transaction`, or add a new `transitionStateWithFields` repo method that
combines state transition + field update atomically.

The same pattern applies to `resubmitMutation` (lines 572–620):

```typescript
// Step 1: REVISION_REQUESTED → PROPOSED
mutation = await this.transitionState(...);
// Step 2: Update operations (separate call)
mutation = await this.mutationRepository.updateMutationFields(
  mutation.mutationId, { operations: validatedOps, revisionFeedback: null, ... }
);
```

---

### Finding 3.7 [HIGH] — `getPipelineHealth` Stale Mutations Incomplete

**File**: `src/domain/knowledge-graph-service/ckg-mutation-pipeline.ts`  
**Lines**: 702–706

The `stuckCount` computation only considers in-process states:

```typescript
const stuckCount = validating + proving + proven + committing;
```

This is reasonable for detecting pipeline processing failures (stuck
mid-pipeline). However, combined with Finding 3.3, mutations in
`revision_requested` that are abandoned (proposer never resubmits) are invisible
to health monitoring.

**Recommendation**: Consider adding a separate `awaitingRevisionCount` metric,
and potentially a time-based threshold for "stale revision requests" similar to
`reconcileStuckCommitting`.

---

## 4. Misconception Detection

### Finding 4.1: No Issues — Clean Detection Pipeline

The misconception detection system is well-designed:

- **3 detector types**: `StructuralMisconceptionDetector`,
  `StatisticalMisconceptionDetector`, `SemanticMisconceptionDetector`
- **Engine**: `MisconceptionDetectionEngine` registers all 3 detectors, runs in
  parallel, catches individual detector errors gracefully
- **11 misconception families**: Properly configured in
  `misconception-family.config.ts` with 27 mapped misconception types
- **Severity scoring**: `computeSeverityScore(confidence, affectedCount)` →
  `0.7 * confidence + 0.3 * min(affectedCount / 20, 1.0)` — reasonable weighted
  formula
- **Severity bands**: ≥0.85 CRITICAL, ≥0.6 HIGH, ≥0.35 MODERATE, else LOW
- **Upsert semantics**: `upsertDetection` correctly deduplicates by
  user+pattern, bumps counter, merges affected nodes, re-detects previously
  addressed misconceptions
- **Confidence filtering**: Results below 0.3 are filtered out before
  persistence

**Verdict**: Misconception detection is solid. No issues found.

---

## 5. Prisma Schema Alignment

### Finding 5.1 [MEDIUM] — `StructuralMetricSnapshot` Write-Only Fields

**File**: `prisma/schema.prisma` — `StructuralMetricSnapshot` model  
**File**: `src/infrastructure/database/repositories/prisma-metrics.repository.ts`
— `toDomain()`

The Prisma schema defines:

```prisma
model StructuralMetricSnapshot {
  ...
  graphRegion       String?
  metacognitiveStage String?
  nodeCount         Int       @default(0)
  ...
}
```

The `toDomain()` mapper ignores these fields:

```typescript
private toDomain(record: { ... }): IMetricSnapshot {
  return {
    id: record.id,
    userId: record.userId as UserId,
    domain: record.domain,
    metrics: fromPrismaJson<IStructuralMetrics>(record.metrics),
    computedAt: record.createdAt.toISOString(),
    schemaVersion: record.schemaVersion,
    // ⚠️ graphRegion, metacognitiveStage, nodeCount not mapped
  };
}
```

**Impact**: Data is stored in the DB but never surfaced to domain consumers.
Either the fields are vestigial (from future schema planning) or there's a
missing feature to expose them.

**Recommendation**: If these are intended for future use, add a code comment
documenting the intent. If they should be exposed, add them to `IMetricSnapshot`
and `toDomain()`.

---

### Finding 5.2 [MEDIUM] — `CkgMutation` Schema Has Unmapped Fields

**File**: `prisma/schema.prisma` — `CkgMutation` model

The Prisma schema defines fields that don't appear in `toDomain()` or
`createMutation`:

| Schema Field      | Domain Mapping             | Status                    |
| ----------------- | -------------------------- | ------------------------- |
| `mutationType`    | Not in `toDomain()` output | ⚠️ Written but never read |
| `targetNodeIds`   | Not in `toDomain()` output | ⚠️ Written but never read |
| `targetEdgeIds`   | Not in `toDomain()` output | ⚠️ Written but never read |
| `proofResult`     | Not in `toDomain()` output | ⚠️ Written but never read |
| `commitResult`    | Not in `toDomain()` output | ⚠️ Written but never read |
| `rejectionReason` | Not in `toDomain()` output | ⚠️ Written but never read |
| `priority`        | Not in `toDomain()` output | ⚠️ Written but never read |

These appear to be write-only columns — written during `createMutation` or state
transitions but never included in the `ICkgMutation` domain object returned to
consumers.

**Impact**: Data exists in the DB but is invisible to the API and service layer.
This might be intentional (for DB-level queries or future admin UI), but it
means:

- `mutationType` is lost after write
- `proofResult` and `commitResult` are stored in transitions but not returned in
  `getMutation`
- `rejectionReason` is stored but the audit log is the only way to see rejection
  details

**Recommendation**: Either add these to `ICkgMutation` and `toDomain()`, or
document them as DB-only indexed columns with a code comment.

---

### Finding 5.3 [MEDIUM] — Column Name Mismatch: `operation` (singular) vs `operations` (plural)

**File**: `prisma/schema.prisma` — `CkgMutation.operation Json`  
**File**: `src/infrastructure/database/repositories/prisma-mutation.repository.ts`
— `toDomain()`

The Prisma column is `operation` (singular `Json`), but the domain interface
uses `operations` (plural `Metadata[]`):

```typescript
// Schema
operation Json @default("[]")

// toDomain():
operations: fromPrismaJson<Metadata[]>(record.operation),

// updateMutationFields():
if (fields.operations !== undefined) {
  data['operation'] = toPrismaJsonArray(fields.operations);
}
```

**Impact**: No functional bug — the deserialization works correctly. But the
naming inconsistency is confusing and increases onboarding friction.

**Recommendation**: Rename the Prisma column via a migration: `operation` →
`operations`, update the `@map` if needed.

---

### Finding 5.4 [LOW] — `InterventionTemplate` Has Usage Tracking Fields Not in Domain

**File**: `prisma/schema.prisma` — `InterventionTemplate` model

```prisma
model InterventionTemplate {
  ...
  useCount    Int     @default(0)
  successRate Float   @default(0.0)
  ...
}
```

Neither `useCount` nor `successRate` appear in the domain
`IInterventionTemplate` interface or in the `templateToDomainWithType()` mapper.
These appear to be reserved for future A/B testing or intervention effectiveness
tracking.

**Impact**: None currently — fields have defaults and aren't blocking.

**Recommendation**: Document the intended future use in a comment.

---

### Finding 5.5 [LOW] — `MisconceptionPattern.scoringModel` and `domains[]` Not in Domain

**File**: `prisma/schema.prisma` — `MisconceptionPattern` model

```prisma
model MisconceptionPattern {
  ...
  scoringModel String   @default("default")
  domains      String[] @default([])
  ...
}
```

These fields don't appear in `IMisconceptionPattern` or `patternToDomain()`.
Appears reserved for future per-pattern scoring customization and domain
scoping.

**Impact**: None currently.

---

## 6. Error Handling

### Finding 6.1: Error Hierarchy — Well Structured

The error system follows a clean hierarchy:

```
DomainError (abstract base)
├── ValidationError (400)
├── UnauthorizedError (403)
├── RateLimitExceededError (429)
├── NodeNotFoundError (404)
├── EdgeNotFoundError (404)
├── DuplicateNodeError (409)
├── CyclicEdgeError (409)
├── OrphanEdgeError (422)
├── InvalidEdgeTypeError (422)
├── MaxDepthExceededError (422)
├── GraphConsistencyError (409)
├── MutationNotFoundError (404)
├── InvalidStateTransitionError (422)
├── MutationConflictError (409)
├── ValidationFailedError (422)
├── MutationAlreadyCommittedError (422)
└── InvalidMisconceptionStateTransitionError (422)
```

All domain errors carry `code`, `message`, `timestamp`, and optional `details`.
The `handleError()` in `route-helpers.ts` checks specific subclasses before the
generic `DomainError` catch-all — correct ordering.

### Finding 6.2: Resilient Post-Write Pattern — Well Implemented

Both `PkgWriteService` and `CkgMutationPipeline` use resilient, non-propagating
side effects:

```typescript
// PkgWriteService pattern:
await Promise.all([
  this.safeAppendOperation(userId, operation),  // catches + logs on failure
  this.safePublish({ ... }),                     // catches + logs on failure
  this.markMetricsStale(userId, domain, type),   // catches + logs on failure
]);
```

Each `safe*` method wraps the call in try/catch, logs failures with counters,
and continues. This ensures primary CRUD operations succeed even if
logging/eventing infrastructure is down.

### Finding 6.3 [LOW] — Dead Type Guards in `base.errors.ts`

**File**: `src/domain/knowledge-graph-service/errors/base.errors.ts`  
**Lines**: 104–121

```typescript
/**
 * @internal Not yet consumed — retained for API-layer error mapping.
 */
export function isDomainError(error: unknown): error is DomainError { ... }

/**
 * @internal Not yet consumed — retained for API-layer error mapping.
 */
export function isValidationError(error: unknown): error is ValidationError { ... }
```

These are exported but unused. The `handleError()` function uses `instanceof`
checks directly.

**Impact**: Minor dead code. The `@internal` annotation correctly flags this.

---

### Finding 6.4 [LOW] — `MaxDepthExceededError` Never Thrown

**File**: `src/domain/knowledge-graph-service/errors/graph.errors.ts`  
**Lines**: 156–172

`MaxDepthExceededError` is defined but never instantiated anywhere. The actual
max-depth validation in `service-helpers.ts` throws `ValidationError` instead:

```typescript
// service-helpers.ts:
export function validateTraversalDepth(depth: number): void {
  if (depth > MAX_TRAVERSAL_DEPTH) {
    throw new ValidationError( // ⚠️ Not MaxDepthExceededError
      `Traversal depth ${depth} exceeds maximum allowed ${MAX_TRAVERSAL_DEPTH}`,
      { maxDepth: [`Must be ≤ ${MAX_TRAVERSAL_DEPTH}`] }
    );
  }
}
```

Meanwhile, `handleError()` in `route-helpers.ts` imports and checks for
`MaxDepthExceededError` (line 487), which will never match.

**Impact**: The 422 response for max-depth exceeded will come from the
`ValidationError` branch (status 400) instead of the intended
`MaxDepthExceededError` branch (status 422). Users get status **400** instead of
**422** for depth violations.

**Recommendation**: Either use `MaxDepthExceededError` in
`validateTraversalDepth`, or remove the dead error class and its handler.

---

### Finding 6.5 [MEDIUM] — `MutationAlreadyCommittedError` Mapped as 422

**File**: `src/api/shared/route-helpers.ts`  
**Lines**: 463–473

`MutationAlreadyCommittedError` is mapped to HTTP 422 (Unprocessable Entity):

```typescript
if (error instanceof MutationAlreadyCommittedError) {
  reply.status(422).send({ ... });
}
```

HTTP 409 (Conflict) is more semantically appropriate — the resource exists in a
state that conflicts with the requested operation. The error code is already
`MUTATION_ALREADY_COMMITTED`, which implies a conflict, not a validation
failure.

**Impact**: Low — clients can still use the error code. But REST API semantics
are imprecise.

---

## 7. Import / Export Issues

### Finding 7.1: No Circular Dependencies Detected

A search for deep relative imports (`../../../` or deeper crossing layer
boundaries) found no violations. The codebase follows clean import patterns:

- API layer imports from domain (errors, execution context)
- Domain layer imports from `@noema/types`, `@noema/events`
- Infrastructure imports from domain (interfaces, value objects)
- No infrastructure→API or API→infrastructure direct imports

### Finding 7.2: Domain Events Properly Wired

**File**: `src/domain/knowledge-graph-service/domain-events.ts`

All 16 event types from `@noema/events` are re-exported:

- 7 PKG events (node created/updated/removed, edge created/updated/removed,
  metrics updated)
- 6 CKG events (mutation
  proposed/validated/committed/rejected/escalated/revision_requested, node
  promoted)
- 3 Metacognitive events (misconception detected, intervention triggered, stage
  transitioned)

Cross-referenced with
`@noema/events/src/knowledge-graph/knowledge-graph.events.ts` — all 16 entries
in `KnowledgeGraphEventType` are accounted for.

### Finding 7.3: No Issues — Barrel Exports Clean

The route index (`src/api/rest/index.ts`) exports all 12 route registrars. The
domain index exports all error classes, type guards, interfaces, and value
objects. No missing exports detected.

---

## Summary of Findings

### CRITICAL (Fix Immediately)

| #   | Finding                                                                        | File                       | Line(s) | Status  |
| --- | ------------------------------------------------------------------------------ | -------------------------- | ------- | ------- |
| 3.1 | `listMutations` omits `revision_requested` — mutations silently invisible      | `ckg-mutation-pipeline.ts` | 275–287 | **FIXED** |
| 3.2 | `listActiveMutations` omits `revision_requested` — active mutations incomplete | `ckg-mutation-pipeline.ts` | 296–305 | **FIXED** |
| 3.3 | `getPipelineHealth` omits `revision_requested` — monitoring blind spot         | `ckg-mutation-pipeline.ts` | 663–708 | **FIXED** |

### HIGH (Fix Before Next Release)

| #   | Finding                                                               | File                                                  | Line(s)          |
| --- | --------------------------------------------------------------------- | ----------------------------------------------------- | ---------------- |
| 3.4 | `listMutations` uses in-memory pagination — O(n) DB fetch per request | `ckg-mutation.routes.ts` + `ckg-mutation-pipeline.ts` | 153–160, 258–287 |
| 3.5 | `runPipelineAsync` hardcodes `fromState: 'proposed'` in failure audit | `ckg-mutation-pipeline.ts`                            | 753              |
| 3.6 | `requestRevision` / `resubmitMutation` non-atomic (state + fields)    | `ckg-mutation-pipeline.ts`                            | 499–556, 572–620 |
| 3.7 | `getPipelineHealth` stuckCount incomplete (no revision visibility)    | `ckg-mutation-pipeline.ts`                            | 702–706          |

### MEDIUM (Address in Sprint)

| #   | Finding                                                               | File                                    | Line(s)      |
| --- | --------------------------------------------------------------------- | --------------------------------------- | ------------ |
| 2.1 | Operation log unbounded queries for node/edge/since filters           | `prisma-operation-log.repository.ts`    | 152–176      |
| 5.1 | `StructuralMetricSnapshot` write-only fields                          | `prisma-metrics.repository.ts`          | `toDomain()` |
| 5.2 | `CkgMutation` schema has 7 unmapped fields                            | `prisma-mutation.repository.ts`         | `toDomain()` |
| 5.3 | Column naming: `operation` (singular) vs `operations` (plural)        | `prisma-mutation.repository.ts`         | 345, 328     |
| 6.4 | `MaxDepthExceededError` never thrown — wrong HTTP status (400 vs 422) | `service-helpers.ts`, `graph.errors.ts` | 82, 156      |
| 6.5 | `MutationAlreadyCommittedError` mapped as 422 instead of 409          | `route-helpers.ts`                      | 463          |

### LOW (Backlog)

| #         | Finding                                                       | File                       | Line(s) |
| --------- | ------------------------------------------------------------- | -------------------------- | ------- |
| 5.4       | `InterventionTemplate.useCount`/`successRate` not in domain   | `schema.prisma`            | —       |
| 5.5       | `MisconceptionPattern.scoringModel`/`domains[]` not in domain | `schema.prisma`            | —       |
| 6.3       | Dead type guards (`isDomainError`, `isValidationError`)       | `base.errors.ts`           | 104–121 |
| 6.4 (alt) | `MaxDepthExceededError` class is dead code                    | `graph.errors.ts`          | 156–172 |
| —         | `proofStageEnabled` config exists but TLA+ not implemented    | `ckg-mutation-pipeline.ts` | ~990    |

---

## Positive Observations

1. **Resilient side effects** — `safe*` wrappers with counters prevent secondary
   failures from blocking primary operations
2. **Cross-DB reconciliation** — `reconcileStuckCommitting` and
   `recoverStuckMutations` handle crash recovery properly
3. **Optimistic locking** — `transitionStateWithAudit` uses version-based OCC
   with proper re-query to distinguish not-found from conflict
4. **PKG/CKG deduplication** — `GraphReadService` uses template method pattern
   to share traversal logic between PKG (user-scoped) and CKG (shared)
5. **Edge policy system** — `getEdgePolicy()` enforces node type constraints,
   weight limits, and acyclicity per edge type
6. **Observability** — OpenTelemetry spans (`withSpan`) and counters
   (`kgCounters`) instrument every pipeline stage
7. **Event publishing** — All 16 event types in `@noema/events` have
   corresponding publish calls in the correct locations
8. **Single-flight deduplication** — `MetricsOrchestrator` prevents concurrent
   metrics computation for the same user+domain
