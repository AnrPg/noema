# Phase 8f: Tech Debt Resolution & DI Wiring

## Objective

Resolve **all accumulated technical debt** from Phases 8–8e of the
knowledge-graph-service, bringing the service from its current compile-but-crash
state to a **fully wired, type-safe, runtime-functional** service. After this
phase, the service must:

1. Compile with zero TypeScript errors (`tsc --noEmit` clean)
2. Pass ESLint with zero errors
3. Boot successfully and serve requests end-to-end (all routes functional)
4. Have all repository interfaces backed by concrete implementations
5. Have Redis caching active for graph reads
6. Have the CKG mutation pipeline fully assembled with all 5 validation stages
7. Have integration tests covering every route group

This is a **consolidation phase** — no new features, no new API surface, no new
domain concepts. Every change is either a fix for an existing defect or the
completion of deferred wiring that was explicitly documented as tech debt.

---

## Boilerplate Instructions

Read PROJECT_CONTEXT.md, then, based on the files with respective
specifications, help me with the implementation. The design process should
follow the principles in PROJECT_CONTEXT.md (APIs and schema first, follow the
microservices pattern, expose agent tools and interfaces for agents etc). If
there is any design decision you must take, first show me options with pros and
cons and ask me to choose.

Generate new code strictly in the existing project style and architecture, fully
conforming to current schemas, APIs, types, models, and patterns; maximize reuse
of existing implementations, favor additive and minimally invasive changes over
redesign or refactoring, and if you detect that modifying or breaking existing
behavior is unavoidable, trigger the harness to stop and explicitly ask for my
approval before proceeding; after implementation, resolve all errors, warnings,
and inconsistencies (including pre-existing ones), request clarification for any
architectural decisions, produce an ADR documenting the changes, and commit with
clear, structured messages.

I want you to make sure that no errors, or warnings or uncommited changes remain
in the codebase after your implementation. If you detect any, please ask me to
approve fixing them before proceeding with new implementations.

Also, before you begin implementing and writing code, tell me with details about
the design decisions you have taken, and ask for my approval before proceeding.
If there are any design decisions that you are not sure about, please present me
with options and their pros and cons, and ask me to choose before proceeding.
let's make sure we are on the same page about the design before you start
implementing. we can do some banter about the design to make sure we are
aligned. be analytical, detailed, and thorough in your design explanations and
discussions.

I generally prefer more complex solutions than simpler ones, given that they are
more powerful and flexible, and I trust your judgment in finding the right
balance. I also prefer solutions that are more aligned with the existing
architecture and patterns of the codebase, even if they require more effort to
implement, as long as they don't introduce significant technical debt or
maintenance challenges.

Do not optimize prematurely, but do consider the long-term implications of
design choices, especially in terms of scalability, maintainability, and
extensibility.

Do not optimize for short-term speed of implementation at the cost of code
quality, architectural integrity, or alignment with project conventions. I value
well-designed, robust solutions that fit seamlessly into the existing codebase,
even if they take more time to implement.

Always reason about the full system architecture before implementing anything.
Every feature touches multiple services, agents, and graph layers. Design
decisions must account for agent orchestration, event propagation, graph
consistency, and offline sync simultaneously.

---

## Scope & Constraints

### In scope

| #   | Category                 | Description                                                                         |
| --- | ------------------------ | ----------------------------------------------------------------------------------- |
| 1   | TypeScript errors        | Fix all 7 compile errors across 2 files                                             |
| 2   | ESLint errors            | Fix 1 ESLint violation                                                              |
| 3   | DI composition root      | Wire all dependencies in `src/index.ts`, replacing the `null as unknown` stub       |
| 4   | Missing repository impl  | Implement `PrismaMetricsStalenessRepository`                                        |
| 5   | Cache layer completion   | Implement cache keys for `getSiblings`, `getCoParents`, `getNeighborhood`           |
| 6   | Metric computation guard | Add dual-hierarchical-edge detection in `computeParentMap` / `computeSiblingGroups` |
| 7   | Integration tests        | Fastify `.inject()` tests for all route groups                                      |

### Out of scope (explicitly deferred)

| Item                            | Reason                                                  | Tracked in        |
| ------------------------------- | ------------------------------------------------------- | ----------------- |
| Proposer notification (push/WS) | Requires notification-service integration               | ADR-009, Phase 9+ |
| Semantic misconception detector | Requires vector-service integration (not yet available) | Future phase      |
| MCP tool surface for escalation | Phase 9 concern per §8.4 of Phase 8e spec               | Phase 9           |
| Agent callback registration     | Phase 3 of ADR-009 notification roadmap                 | Phase 9+          |

---

## Section 1: Fix TypeScript Errors (7 errors, 2 files)

### 1.1 Missing imports in `knowledge-graph.service.ts`

**File**: `src/domain/knowledge-graph-service/knowledge-graph.service.ts`

**Errors** (4):

| Line | Error    | Code                    | Description                                   |
| ---- | -------- | ----------------------- | --------------------------------------------- |
| 355  | `TS2304` | `EdgeId`                | Cannot find name `EdgeId`                     |
| 693  | `TS2304` | `IPkgOperationLogEntry` | Cannot find name `IPkgOperationLogEntry`      |
| 705  | `TS2304` | `PkgOperationType`      | Cannot find name `PkgOperationType`           |
| 707  | `TS2304` | `EdgeId`                | Cannot find name `EdgeId` (second occurrence) |

**Root cause**: The service interface file uses branded IDs and operation log
types but does not import them. `EdgeId` is in `@noema/types` (branded IDs).
`IPkgOperationLogEntry` and `PkgOperationType` are defined locally in the domain
layer at `./pkg-operation-log.repository.ts` and
`./value-objects/operation-log.ts` respectively.

**Fix**: Add missing imports to the existing import block:

```typescript
// Add to the @noema/types import (line ~25):
import type {
  EdgeId, // ← ADD
  IGraphEdge,
  IGraphNode,
  IMetacognitiveStageAssessment,
  IMisconceptionDetection,
  IPaginatedResponse,
  IStructuralHealthReport,
  IStructuralMetrics,
  ISubgraph,
  MutationId,
  NodeId,
  UserId,
} from '@noema/types';

// Add new import for domain types (after the existing local imports):
import type { IPkgOperationLogEntry } from './pkg-operation-log.repository.js';
import { PkgOperationType } from './value-objects/operation-log.js';
```

**Verification**: After adding these imports, lines 355, 693, 705, and 707 will
resolve. `EdgeId` is a branded type exported from
`packages/types/src/branded-ids/index.ts`. `IPkgOperationLogEntry` is the
interface at `pkg-operation-log.repository.ts:31`. `PkgOperationType` is the
const+type at `value-objects/operation-log.ts:19–29`.

Note: The barrel export at `./index.ts` already re-exports
`IPkgOperationLogEntry` and `PkgOperationType`, but do NOT import from the
barrel (`./index.ts`) inside the same domain directory — that creates circular
dependencies. Import directly from the source modules.

---

### 1.2 Invalid `ActionCategory` values in `knowledge-graph.service.impl.ts`

**File**: `src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts`

**Errors** (2):

| Line | Error    | Code                          | Description                                                    |
| ---- | -------- | ----------------------------- | -------------------------------------------------------------- |
| 2444 | `TS2322` | `"investigation"` not in type | `category: 'investigation'` not assignable to `ActionCategory` |
| 2458 | `TS2322` | `"investigation"` not in type | Union includes `"investigation"` which is invalid              |

**Root cause**: The `ActionCategory` const object in `@noema/contracts` defines
exactly four values:

```typescript
export const ActionCategory = {
  EXPLORATION: 'exploration',
  OPTIMIZATION: 'optimization',
  CORRECTION: 'correction',
  LEARNING: 'learning',
} as const;
```

The code at line 2444 uses `'investigation'` as a category for the
`list_stuck_mutations` suggested action, which is not a valid member. The intent
(investigating stuck mutations) maps semantically to `'correction'` — the agent
is being guided to fix a problem.

**Fix**: Replace `'investigation'` with `'correction'` at line 2444:

```typescript
// Before (line ~2444):
category: 'investigation' as const,

// After:
category: 'correction' as const,
```

This also resolves the error at line 2458, which is a union of the two category
values used within the `suggestedNextActions` array spread — once
`'investigation'` becomes `'correction'`, the union becomes
`'exploration' | 'correction'` which is valid.

**Design note**: Do NOT extend `ActionCategory` to include `'investigation'`.
The four categories (`exploration`, `optimization`, `correction`, `learning`)
are intentionally aligned with the agent hint taxonomy in `@noema/contracts` and
are used across all services. Adding a new category is a cross-cutting change
that would need to be justified across the entire platform.

---

### 1.3 Invalid `IRiskFactor` shape in `knowledge-graph.service.impl.ts`

**File**: `src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts`

**Error** (1):

| Line | Error    | Code                                                   | Description                      |
| ---- | -------- | ------------------------------------------------------ | -------------------------------- |
| 2467 | `TS2322` | Missing `type`, `description`, `probability`, `impact` | `IRiskFactor` interface mismatch |

**Root cause**: The `stuckWarning` array at line ~2430 creates risk factor
objects with `{ factor, severity, mitigation }` but the `IRiskFactor` interface
(`@noema/contracts`) requires:

```typescript
export interface IRiskFactor {
  type: RiskType; // 'performance' | 'accuracy' | 'cost' | 'complexity' | 'user-experience'
  severity: RiskSeverity; // 'critical' | 'high' | 'medium' | 'low'
  description: string;
  probability: number; // 0.0 to 1.0
  impact: number; // 0.0 to 1.0
  mitigation?: string;
}
```

**Fix**: Rewrite the `stuckWarning` array to conform to `IRiskFactor`:

```typescript
// Before (line ~2430):
const stuckWarning =
  health.stuckCount > 0
    ? [
        {
          factor: `${String(health.stuckCount)} mutation(s) appear stuck in non-terminal state`,
          severity: 'medium' as const,
          mitigation:
            'Check pipeline logs — stuck mutations may need manual retry or cancellation',
        },
      ]
    : [];

// After:
const stuckWarning: IRiskFactor[] =
  health.stuckCount > 0
    ? [
        {
          type: 'performance' as const,
          severity: 'medium' as const,
          description: `${String(health.stuckCount)} mutation(s) appear stuck in non-terminal state`,
          probability: 0.8,
          impact: 0.6,
          mitigation:
            'Check pipeline logs — stuck mutations may need manual retry or cancellation',
        },
      ]
    : [];
```

**Field mapping choices**:

- `type: 'performance'` — Stuck mutations are a pipeline throughput concern.
  `'complexity'` was considered but stuck mutations are a runtime issue, not a
  design complexity issue.
- `probability: 0.8` — If the system reports stuck mutations, the probability of
  them actually being stuck is high (the metric is deterministic, not
  speculative).
- `impact: 0.6` — Moderate impact: stuck mutations block CKG progress but do not
  compromise data integrity or user experience directly.

**Import needed**: Add `import type { IRiskFactor } from '@noema/contracts';`
or, if the file already imports from `@noema/contracts`, add `IRiskFactor` to
that import statement. Check whether the existing imports in the file already
cover `@noema/contracts` — if so, just extend the import. The file imports
`IServiceResult` and `IAgentHints` from `@noema/contracts` at its top, so
`IRiskFactor` should be added there.

---

## Section 2: Fix ESLint Error (1 error)

**File**: `src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts`

**Error**:

```
Line 596:33 — @typescript-eslint/non-nullable-type-assertion-style
              "Use a ! assertion to more succinctly remove null and undefined from the type"
```

**Root cause**: Phase 8e introduced code at line 596 that casts `conflicts[0]`
to `IGraphEdge` using `as IGraphEdge`. The ESLint rule
`non-nullable-type-assertion-style` requires `!` (non-null assertion) when the
only purpose of `as` is to narrow away `undefined`.

**Fix**:

```typescript
// Before (line 596):
const firstConflict = conflicts[0] as IGraphEdge;

// After:
const firstConflict = conflicts[0]!;
```

The surrounding `if (conflicts.length > 0)` guard makes the `!` semantically
safe. The type of `conflicts[0]` is already `IGraphEdge | undefined` (from array
indexing with `noUncheckedIndexedAccess`), so `!` narrows it to `IGraphEdge`.

---

## Section 3: DI Composition Root — Full Service Wiring

**File**: `src/index.ts`

**Current state** (lines 224–237):

```typescript
// TODO [TECH-DEBT]: Replace stub service with full DI-wired KnowledgeGraphService.
// ...
const service = null as unknown as Parameters<typeof registerPkgNodeRoutes>[1];
```

This is the **most critical tech debt item**: the entire service is
non-functional at runtime. Every route handler receives `null` as the service
and will throw on the first method call.

### 3.1 Dependencies to construct

The full dependency tree, in construction order:

```
1. Neo4jGraphRepository(neo4jClient, logger)
      ↑ already have neo4jClient and logger from bootstrap
2. KgRedisCacheProvider(redis, cacheConfig, logger)
      ↑ already have redis and logger; cacheConfig from config.cache
3. CachedGraphRepository(neo4jGraphRepo, cacheProvider, entityTtl, queryTtl)
      ↑ wraps Neo4jGraphRepository with Redis caching
4. PrismaMetricsRepository(prisma)
5. PrismaMutationRepository(prisma)
6. PrismaMisconceptionRepository(prisma)
7. PrismaOperationLogRepository(prisma)
8. PrismaMetricsStalenessRepository(prisma)          ← NEW (Section 4)
9. RedisEventPublisher(redis, eventPublisherConfig, logger)
      ↑ eventPublisherConfig from config.redis.*
10. CkgValidationPipeline()                           ← then register stages
      10a. SchemaValidationStage()                     — order 100
      10b. StructuralIntegrityStage(graphRepository)   — order 200
      10c. OntologicalConsistencyStage(graphRepository)— order 250 (Phase 8e)
      10d. ConflictDetectionStage(mutationRepository)  — order 300
      10e. EvidenceSufficiencyStage()                   — order 400
11. CkgMutationPipeline(mutationRepo, graphRepo, validationPipeline, eventPublisher, logger)
12. KnowledgeGraphService(
        graphRepo,               — CachedGraphRepository
        operationLogRepo,        — PrismaOperationLogRepository
        metricsStalenessRepo,    — PrismaMetricsStalenessRepository
        metricsRepo,             — PrismaMetricsRepository
        misconceptionRepo,       — PrismaMisconceptionRepository
        eventPublisher,          — RedisEventPublisher
        mutationPipeline,        — CkgMutationPipeline
        logger
    )
```

### 3.2 New imports required in `src/index.ts`

```typescript
// Infrastructure — repositories
import { Neo4jGraphRepository } from './infrastructure/database/neo4j-graph.repository.js';
import {
  PrismaMetricsRepository,
  PrismaMisconceptionRepository,
  PrismaMutationRepository,
  PrismaOperationLogRepository,
} from './infrastructure/database/repositories/index.js';
import { PrismaMetricsStalenessRepository } from './infrastructure/database/repositories/prisma-metrics-staleness.repository.js';

// Infrastructure — cache
import { CachedGraphRepository } from './infrastructure/cache/cached-graph.repository.js';
import { KgRedisCacheProvider } from './infrastructure/cache/kg-redis-cache.provider.js';

// Domain — pipeline & stages
import { CkgMutationPipeline } from './domain/knowledge-graph-service/ckg-mutation-pipeline.js';
import { CkgValidationPipeline } from './domain/knowledge-graph-service/ckg-validation-pipeline.js';
import {
  ConflictDetectionStage,
  EvidenceSufficiencyStage,
  OntologicalConsistencyStage,
  SchemaValidationStage,
  StructuralIntegrityStage,
} from './domain/knowledge-graph-service/ckg-validation-stages.js';

// Domain — service
import { KnowledgeGraphService } from './domain/knowledge-graph-service/knowledge-graph.service.impl.js';

// Events
import { RedisEventPublisher } from '@noema/events/publisher';
```

### 3.3 Replacement code for the `null` stub

Replace the `TODO [TECH-DEBT]` block (lines ~222–237) with:

```typescript
// --------------------------------------------------------------------------
// Dependency Injection — Composition Root
// --------------------------------------------------------------------------

// 1. Graph repository (Neo4j) with Redis cache decorator
const neo4jGraphRepository = new Neo4jGraphRepository(neo4jClient, logger);

const cacheProvider = new KgRedisCacheProvider(
  redis,
  {
    entityTtl: config.cache.ttl,
    queryTtl: config.cache.ttl,
    prefix: config.cache.prefix,
  },
  logger
);

const graphRepository = config.cache.enabled
  ? new CachedGraphRepository(
      neo4jGraphRepository,
      cacheProvider,
      config.cache.ttl,
      config.cache.ttl
    )
  : neo4jGraphRepository;

// 2. Prisma repositories (PostgreSQL)
const metricsRepository = new PrismaMetricsRepository(prisma);
const mutationRepository = new PrismaMutationRepository(prisma);
const misconceptionRepository = new PrismaMisconceptionRepository(prisma);
const operationLogRepository = new PrismaOperationLogRepository(prisma);
const metricsStalenessRepository = new PrismaMetricsStalenessRepository(prisma);

// 3. Event publisher (Redis Streams)
const eventPublisher = new RedisEventPublisher(
  redis,
  {
    streamKey: config.redis.eventStreamKey,
    maxLen: config.redis.maxStreamLen,
    serviceName: config.service.name,
    serviceVersion: config.service.version,
    environment: config.service.environment,
  },
  logger
);

// 4. CKG validation pipeline (5 stages, ordered)
const validationPipeline = new CkgValidationPipeline();
validationPipeline.addStage(new SchemaValidationStage()); // order 100
validationPipeline.addStage(new StructuralIntegrityStage(graphRepository)); // order 200
validationPipeline.addStage(new OntologicalConsistencyStage(graphRepository)); // order 250
validationPipeline.addStage(new ConflictDetectionStage(mutationRepository)); // order 300
validationPipeline.addStage(new EvidenceSufficiencyStage()); // order 400

// 5. CKG mutation pipeline (orchestrates lifecycle + validation)
const mutationPipeline = new CkgMutationPipeline(
  mutationRepository,
  graphRepository,
  validationPipeline,
  eventPublisher,
  logger
);

// 6. Knowledge Graph Service (domain service)
const service = new KnowledgeGraphService(
  graphRepository,
  operationLogRepository,
  metricsStalenessRepository,
  metricsRepository,
  misconceptionRepository,
  eventPublisher,
  mutationPipeline,
  logger
);
```

### 3.4 Config validation

Verify that the `IRedisEventPublisherConfig` fields map correctly from the
existing config:

| `IRedisEventPublisherConfig` field | Config source                 | Value (default)                        |
| ---------------------------------- | ----------------------------- | -------------------------------------- |
| `streamKey`                        | `config.redis.eventStreamKey` | `noema:events:knowledge-graph-service` |
| `maxLen`                           | `config.redis.maxStreamLen`   | `10_000`                               |
| `serviceName`                      | `config.service.name`         | `knowledge-graph-service`              |
| `serviceVersion`                   | `config.service.version`      | `0.1.0`                                |
| `environment`                      | `config.service.environment`  | `development`                          |

Verify that `config.service.name`, `config.service.version`, and
`config.service.environment` exist on the config object — check
`src/config/index.ts`. The `Environment` type used by
`IRedisEventPublisherConfig` comes from `@noema/events` and must match the
service's environment string.

### 3.5 Conditional cache

The cache is toggled by `config.cache.enabled`. When disabled,
`neo4jGraphRepository` is used directly (it implements `IGraphRepository`). When
enabled, `CachedGraphRepository` wraps it. Both implement `IGraphRepository`, so
the downstream consumer (`KnowledgeGraphService`) is agnostic.

### 3.6 Graceful shutdown additions

The existing shutdown handler disconnects Prisma, Neo4j, and Redis. No changes
needed — `RedisEventPublisher` shares the same Redis instance and does not
require separate cleanup. The validation pipeline and mutation pipeline are
stateless — no resources to release.

---

## Section 4: Implement `PrismaMetricsStalenessRepository`

**New file**:
`src/infrastructure/database/repositories/prisma-metrics-staleness.repository.ts`

**Interface**: `IMetricsStalenessRepository` from
`src/domain/knowledge-graph-service/metrics-staleness.repository.ts`

**Prisma model**: `MetricsStaleness` (already defined in
`prisma/schema.prisma`:437)

### 4.1 Required methods

| Method               | Prisma operation                      | Notes                                                                         |
| -------------------- | ------------------------------------- | ----------------------------------------------------------------------------- |
| `markStale`          | `upsert` on `(userId, domain)` unique | Updates `lastStructuralChangeAt` and `lastMutationType`                       |
| `isStale`            | `findUnique` → compare timestamps     | Returns `true` if record exists and `lastStructuralChangeAt > lastComputedAt` |
| `getStalenessRecord` | `findUnique` on `(userId, domain)`    | Returns null if no record                                                     |

### 4.2 Implementation pattern

Follow the exact pattern of the existing Prisma repositories in the same
directory. Reference `prisma-metrics.repository.ts` for style:

```typescript
/**
 * @noema/knowledge-graph-service — Prisma Metrics Staleness Repository
 *
 * Implements IMetricsStalenessRepository using PostgreSQL via Prisma.
 * Tracks when user+domain structural metrics need recomputation.
 */

import type { PrismaClient } from '../../../../generated/prisma/index.js';
import type { UserId } from '@noema/types';
import type {
  IMetricsStalenessRecord,
  IMetricsStalenessRepository,
} from '../../../domain/knowledge-graph-service/metrics-staleness.repository.js';

export class PrismaMetricsStalenessRepository implements IMetricsStalenessRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async markStale(
    userId: UserId,
    domain: string,
    mutationType: string
  ): Promise<void> {
    await this.prisma.metricsStaleness.upsert({
      where: {
        userId_domain: { userId: String(userId), domain },
      },
      update: {
        lastStructuralChangeAt: new Date().toISOString(),
        lastMutationType: mutationType,
      },
      create: {
        userId: String(userId),
        domain,
        lastStructuralChangeAt: new Date().toISOString(),
        lastMutationType: mutationType,
      },
    });
  }

  async isStale(
    userId: UserId,
    domain: string,
    lastComputedAt: string
  ): Promise<boolean> {
    const record = await this.prisma.metricsStaleness.findUnique({
      where: {
        userId_domain: { userId: String(userId), domain },
      },
    });
    if (!record) return false;
    return (
      new Date(record.lastStructuralChangeAt).getTime() >
      new Date(lastComputedAt).getTime()
    );
  }

  async getStalenessRecord(
    userId: UserId,
    domain: string
  ): Promise<IMetricsStalenessRecord | null> {
    const record = await this.prisma.metricsStaleness.findUnique({
      where: {
        userId_domain: { userId: String(userId), domain },
      },
    });
    if (!record) return null;
    return {
      id: record.id,
      userId: record.userId as UserId,
      domain: record.domain,
      lastStructuralChangeAt: record.lastStructuralChangeAt.toISOString(),
      lastMutationType: record.lastMutationType,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
```

### 4.3 Register in barrel export

Add to `src/infrastructure/database/repositories/index.ts`:

```typescript
export { PrismaMetricsStalenessRepository } from './prisma-metrics-staleness.repository.js';
```

### 4.4 Prisma schema check

Verify the `MetricsStaleness` model has:

- `@@unique([userId, domain])` compound constraint (needed for the `upsert`
  `.where.userId_domain` key)
- `lastStructuralChangeAt` as `DateTime` (the repo converts to/from ISO strings)
- `lastMutationType` as `String`

If the `@@unique` compound generates a different accessor name than
`userId_domain`, adjust the `where` clause accordingly. Check the generated
Prisma client types after `npx prisma generate`.

---

## Section 5: Cache Layer Completion

**File**: `src/infrastructure/cache/cached-graph.repository.ts`

**Current state**: Three TODO comments at lines 227, 236, 245 — the
`getSiblings`, `getCoParents`, and `getNeighborhood` methods pass through to the
inner repository without caching.

### 5.1 Cache key patterns

Follow the existing caching patterns in the same file (e.g.,
`getDomainSubgraph`, `getSubgraph`, `getAncestors`). Each method should:

1. Construct a deterministic cache key
2. Try `cache.get(key)` first
3. On miss, call `this.inner.*()`, then `cache.set(key, result, ttl)`
4. Return the result

**Cache key formats** (matching the comments already in the file):

| Method            | Cache key pattern                                                                                                                           | TTL        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `getSiblings`     | `siblings:{query.graphType}:{nodeId}:{query.edgeType ?? 'all'}:{query.direction ?? 'any'}`                                                  | `queryTtl` |
| `getCoParents`    | `co-parents:{query.graphType}:{nodeId}:{query.edgeType ?? 'all'}:{query.direction ?? 'any'}`                                                | `queryTtl` |
| `getNeighborhood` | `neighborhood:{query.graphType}:{nodeId}:{query.hops}:{edgeTypesKey}:{nodeTypesKey}:{query.filterMode ?? 'any'}:{query.direction ?? 'any'}` | `queryTtl` |

For `getNeighborhood`, `edgeTypesKey` and `nodeTypesKey` should be sorted arrays
joined with commas (or `'all'` if undefined/empty), following the exact pattern
used by `getDomainSubgraph`:

```typescript
const etKey =
  edgeTypes !== undefined && edgeTypes.length > 0
    ? [...edgeTypes].sort().join(',')
    : 'all';
```

### 5.2 Implementation for `getSiblings`

```typescript
async getSiblings(
  nodeId: NodeId,
  query: ISiblingsQuery,
  userId?: string
): Promise<ISiblingsResult> {
  const key = `siblings:${query.graphType}:${nodeId}:${query.edgeType ?? 'all'}:${query.direction ?? 'any'}`;
  const cached = await this.cache.get(key);
  if (cached !== null) return cached as ISiblingsResult;

  const result = await this.inner.getSiblings(nodeId, query, userId);
  await this.cache.set(key, result, this.queryTtl);
  return result;
}
```

### 5.3 Implementation for `getCoParents`

Same pattern with `co-parents:` prefix.

### 5.4 Implementation for `getNeighborhood`

```typescript
async getNeighborhood(
  nodeId: NodeId,
  query: INeighborhoodQuery,
  userId?: string
): Promise<INeighborhoodResult> {
  const etKey = query.edgeTypes !== undefined && query.edgeTypes.length > 0
    ? [...query.edgeTypes].sort().join(',')
    : 'all';
  const ntKey = query.nodeTypes !== undefined && query.nodeTypes.length > 0
    ? [...query.nodeTypes].sort().join(',')
    : 'all';
  const key = `neighborhood:${query.graphType}:${nodeId}:${String(query.hops)}:${etKey}:${ntKey}:${query.filterMode ?? 'any'}:${query.direction ?? 'any'}`;
  const cached = await this.cache.get(key);
  if (cached !== null) return cached as INeighborhoodResult;

  const result = await this.inner.getNeighborhood(nodeId, query, userId);
  await this.cache.set(key, result, this.queryTtl);
  return result;
}
```

### 5.5 Cache invalidation

The existing `CachedGraphRepository` already invalidates node/edge caches on
mutations (`createNode`, `updateNode`, `deleteNode`, `createEdge`, `updateEdge`,
`deleteEdge`). The relational query caches (`siblings`, `co-parents`,
`neighborhood`) are invalidated implicitly by their short TTL — the `queryTtl`
(defaulting to `config.cache.ttl`) ensures stale structural data expires.

If more aggressive invalidation is desired (e.g., invalidating `siblings` when
an edge is created), that can be added later. For now, TTL-based expiry is
sufficient and matches the existing pattern for `getDomainSubgraph`.

---

## Section 6: Metric Computation Defensive Guards

**File**:
`src/domain/knowledge-graph-service/metrics/metric-computation-context.ts`

**Motivation**: Phase 8e §8.3 recommends that `computeParentMap()` and
`computeSiblingGroups()` detect (but not crash on) nodes that have **both** IS_A
and PART_OF edges to the same target — which can occur in PKGs where the
ontological warning was advisory and the learner chose to proceed.

### 6.1 Update `computeParentMap` (line ~177)

After building the parent map, add a diagnostic pass that detects dual
hierarchical edges:

```typescript
function computeParentMap(subgraph: ISubgraph): Map<NodeId, Set<NodeId>> {
  const parentMap = new Map<NodeId, Set<NodeId>>();
  const nodeIds = new Set(subgraph.nodes.map((n) => n.nodeId));

  for (const node of subgraph.nodes) {
    parentMap.set(node.nodeId, new Set());
  }

  // Track which edge type(s) connect each (source, target) pair
  const edgePairTypes = new Map<string, Set<string>>();

  for (const edge of subgraph.edges) {
    if (
      HIERARCHICAL_EDGE_TYPES.has(edge.edgeType) &&
      nodeIds.has(edge.sourceNodeId) &&
      nodeIds.has(edge.targetNodeId)
    ) {
      parentMap.get(edge.sourceNodeId)?.add(edge.targetNodeId);

      // Track for dual-edge detection
      const pairKey = `${edge.sourceNodeId}→${edge.targetNodeId}`;
      if (!edgePairTypes.has(pairKey)) {
        edgePairTypes.set(pairKey, new Set());
      }
      edgePairTypes.get(pairKey)!.add(edge.edgeType);
    }
  }

  // Diagnostic: report dual hierarchical edges (non-blocking)
  for (const [pairKey, types] of edgePairTypes) {
    if (types.size > 1) {
      // This is a known scenario in PKGs — the ontological advisory
      // was shown but the learner chose to keep both edge types.
      // Log but do not crash.
      console.warn(
        `[metric-computation] Dual hierarchical edges detected: ${pairKey} has types [${[...types].join(', ')}]`
      );
    }
  }

  return parentMap;
}
```

**Decision**: Use `console.warn` (not `throw`) because:

1. PKG nodes legitimately have dual edges post-advisory
2. Metric computation should be resilient — a crash here would prevent all
   metrics from rendering
3. The warning is diagnostic, visible in structured logs for monitoring

If a pino `Logger` is available in the metric computation context, prefer
`logger.warn(...)` over `console.warn(...)`. Check if the
`createMetricComputationContext` function or the calling service passes a logger
— if so, thread it through. If not, use `console.warn` as a pragmatic fallback.

### 6.2 No change needed for `computeSiblingGroups`

`computeSiblingGroups` consumes the output of `computeParentMap` — it operates
on the parent→children inversion and does not distinguish edge types. The dual-
edge detection in `computeParentMap` is sufficient; by the time
`computeSiblingGroups` runs, the parent map is already in a clean
`NodeId → Set<NodeId>` form where duplicate edges to the same parent are
naturally deduplicated by the `Set`.

---

## Section 7: Integration Tests

**New directory**: `src/__tests__/integration/`

**Strategy**: Use Fastify's `inject()` method to send HTTP requests to the
application without starting a real server. This is the standard Fastify testing
approach and is recommended by ADR-0040 Wave 2.

### 7.1 Test infrastructure

Create a shared test helper that:

1. Constructs a Fastify instance with the same plugins (cors, rate-limit,
   swagger) as `src/index.ts`
2. Injects **mocked** repository implementations (in-memory or Jest/Vitest
   mocks)
3. Registers all routes using the same `register*Routes` functions
4. Provides a typed `inject()` helper with JWT generation

```typescript
// src/__tests__/integration/test-helpers.ts
// Provides: buildTestApp(), createTestToken(userId), injectAs(app, userId, method, url, body?)
```

### 7.2 Test files (one per route group)

| Test file                          | Route group                      | Key scenarios                                     |
| ---------------------------------- | -------------------------------- | ------------------------------------------------- |
| `pkg-node.routes.test.ts`          | `registerPkgNodeRoutes`          | CRUD, validation errors, 401/403, pagination      |
| `pkg-edge.routes.test.ts`          | `registerPkgEdgeRoutes`          | CRUD, orphan edge rejection, policy enforcement   |
| `pkg-traversal.routes.test.ts`     | `registerPkgTraversalRoutes`     | Subgraph, ancestors, descendants, path, siblings  |
| `ckg-node.routes.test.ts`          | `registerCkgNodeRoutes`          | Read-only, pagination, filtering                  |
| `ckg-edge.routes.test.ts`          | `registerCkgEdgeRoutes`          | Read-only, filtering, edge type validation        |
| `ckg-mutation.routes.test.ts`      | `registerCkgMutationRoutes`      | Propose, cancel, retry, health, escalation review |
| `ckg-traversal.routes.test.ts`     | `registerCkgTraversalRoutes`     | Same as PKG traversal but CKG-scoped              |
| `metrics.routes.test.ts`           | `registerMetricsRoutes`          | Compute metrics, get snapshots, history           |
| `misconception.routes.test.ts`     | `registerMisconceptionRoutes`    | Detect, list, lifecycle transitions               |
| `structural-health.routes.test.ts` | `registerStructuralHealthRoutes` | Health report, metacognitive stage                |
| `operation-log.routes.test.ts`     | `registerPkgOperationLogRoutes`  | Query log, filter by type/node/edge/since         |
| `comparison.routes.test.ts`        | `registerComparisonRoutes`       | PKG↔CKG comparison, divergence detection          |

### 7.3 Minimum coverage per route

Each test file must cover:

- **Happy path**: Valid request → expected response structure & status code
- **Auth**: Missing/invalid JWT → 401; wrong user accessing another's PKG → 403
- **Validation**: Invalid body/params → 400 with structured error
- **Not found**: Valid request for non-existent resource → 404
- **Rate limiting**: (optional) Verify rate limit headers are present

### 7.4 Test runner

Use `vitest` (already configured in the project). Run with:

```bash
cd services/knowledge-graph-service
npx vitest run src/__tests__/integration/
```

### 7.5 Mock repository implementations

Create lightweight in-memory implementations of each repository interface:

```
src/__tests__/mocks/
  mock-graph.repository.ts       → IGraphRepository (in-memory node/edge store)
  mock-mutation.repository.ts    → IMutationRepository (in-memory mutation store)
  mock-metrics.repository.ts     → IMetricsRepository
  mock-misconception.repository.ts → IMisconceptionRepository
  mock-operation-log.repository.ts → IPkgOperationLogRepository
  mock-metrics-staleness.repository.ts → IMetricsStalenessRepository
  mock-event-publisher.ts        → IEventPublisher (captures published events)
```

The mock event publisher should capture events in an array for assertion:

```typescript
export class MockEventPublisher implements IEventPublisher {
  readonly published: IEventToPublish[] = [];
  async publish(event: IEventToPublish): Promise<void> {
    this.published.push(event);
  }
}
```

---

## Section 8: Validation Checklist

After all changes, the following must pass:

### 8.1 TypeScript compilation

```bash
cd services/knowledge-graph-service
npx tsc --noEmit
# Expected: 0 errors
```

### 8.2 ESLint

```bash
npx eslint src/ --ext .ts
# Expected: 0 errors, 0 warnings
```

### 8.3 Unit tests

```bash
npx vitest run
# Expected: all existing tests pass
```

### 8.4 Integration tests

```bash
npx vitest run src/__tests__/integration/
# Expected: all new integration tests pass
```

### 8.5 Service boots

```bash
# With Docker infrastructure running (postgres, neo4j, redis):
docker compose -f docker-compose.local.yml up -d
npx tsx src/index.ts
# Expected: Logs show successful connection to all three databases,
# all routes registered, service listening on configured port.
# Verify: curl http://localhost:${PORT}/health returns 200
```

### 8.6 Smoke test (manual)

```bash
# 1. Health check
curl -s http://localhost:3006/health | jq .
# → { status: 'ok', ... }

# 2. Create a PKG node (requires valid JWT)
curl -s -X POST http://localhost:3006/api/v1/pkg/nodes \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{ "nodeType": "concept", "label": "Test Node", "domain": "test" }' | jq .
# → 201 with node data

# 3. Pipeline health
curl -s http://localhost:3006/api/v1/ckg/mutations/health \
  -H "Authorization: Bearer ${TOKEN}" | jq .
# → 200 with pipeline statistics
```

---

## Implementation Order

| Step | Description                                                   | Section | Files affected                                        |
| ---- | ------------------------------------------------------------- | ------- | ----------------------------------------------------- |
| 1    | Fix missing imports in `knowledge-graph.service.ts`           | §1.1    | `knowledge-graph.service.ts`                          |
| 2    | Fix `ActionCategory` in `knowledge-graph.service.impl.ts`     | §1.2    | `knowledge-graph.service.impl.ts`                     |
| 3    | Fix `IRiskFactor` shape in `knowledge-graph.service.impl.ts`  | §1.3    | `knowledge-graph.service.impl.ts`                     |
| 4    | Fix ESLint `!` assertion in `knowledge-graph.service.impl.ts` | §2      | `knowledge-graph.service.impl.ts`                     |
| 5    | Implement `PrismaMetricsStalenessRepository`                  | §4      | New: `prisma-metrics-staleness.repository.ts`, barrel |
| 6    | Wire DI composition root in `index.ts`                        | §3      | `index.ts`                                            |
| 7    | Implement cache keys for relational queries                   | §5      | `cached-graph.repository.ts`                          |
| 8    | Add dual-edge detection in metric computation                 | §6      | `metric-computation-context.ts`                       |
| 9    | Create test infrastructure and mock repositories              | §7.1,5  | New: `__tests__/` directory                           |
| 10   | Write integration tests for all route groups                  | §7.2-4  | New: 12 test files                                    |
| 11   | Run full validation checklist                                 | §8      | —                                                     |
| 12   | Write ADR documenting the changes                             | —       | New: `ADR-010-phase8f-tech-debt-resolution.md`        |
| 13   | Commit with structured message                                | —       | All changed files                                     |

---

## File Modification Summary

### Modified files

| File                                                                       | Changes                                                                             |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/domain/knowledge-graph-service/knowledge-graph.service.ts`            | Add 3 missing imports (`EdgeId`, `IPkgOperationLogEntry`, `PkgOperationType`)       |
| `src/domain/knowledge-graph-service/knowledge-graph.service.impl.ts`       | Fix `ActionCategory`, `IRiskFactor`, ESLint `!` assertion; add `IRiskFactor` import |
| `src/index.ts`                                                             | Replace `null` stub with full DI wiring; add imports                                |
| `src/infrastructure/cache/cached-graph.repository.ts`                      | Implement cached `getSiblings`, `getCoParents`, `getNeighborhood`                   |
| `src/infrastructure/database/repositories/index.ts`                        | Add barrel export for `PrismaMetricsStalenessRepository`                            |
| `src/domain/knowledge-graph-service/metrics/metric-computation-context.ts` | Add dual-edge detection in `computeParentMap`                                       |

### New files

| File                                                                              | Purpose                                 |
| --------------------------------------------------------------------------------- | --------------------------------------- |
| `src/infrastructure/database/repositories/prisma-metrics-staleness.repository.ts` | `IMetricsStalenessRepository` impl      |
| `src/__tests__/integration/test-helpers.ts`                                       | Shared Fastify test app builder         |
| `src/__tests__/mocks/mock-graph.repository.ts`                                    | In-memory `IGraphRepository`            |
| `src/__tests__/mocks/mock-mutation.repository.ts`                                 | In-memory `IMutationRepository`         |
| `src/__tests__/mocks/mock-metrics.repository.ts`                                  | In-memory `IMetricsRepository`          |
| `src/__tests__/mocks/mock-misconception.repository.ts`                            | In-memory `IMisconceptionRepository`    |
| `src/__tests__/mocks/mock-operation-log.repository.ts`                            | In-memory `IPkgOperationLogRepository`  |
| `src/__tests__/mocks/mock-metrics-staleness.repository.ts`                        | In-memory `IMetricsStalenessRepository` |
| `src/__tests__/mocks/mock-event-publisher.ts`                                     | Event capture mock                      |
| `src/__tests__/integration/pkg-node.routes.test.ts`                               | PKG node integration tests              |
| `src/__tests__/integration/pkg-edge.routes.test.ts`                               | PKG edge integration tests              |
| `src/__tests__/integration/pkg-traversal.routes.test.ts`                          | PKG traversal integration tests         |
| `src/__tests__/integration/ckg-node.routes.test.ts`                               | CKG node integration tests              |
| `src/__tests__/integration/ckg-edge.routes.test.ts`                               | CKG edge integration tests              |
| `src/__tests__/integration/ckg-mutation.routes.test.ts`                           | CKG mutation integration tests          |
| `src/__tests__/integration/ckg-traversal.routes.test.ts`                          | CKG traversal integration tests         |
| `src/__tests__/integration/metrics.routes.test.ts`                                | Metrics integration tests               |
| `src/__tests__/integration/misconception.routes.test.ts`                          | Misconception integration tests         |
| `src/__tests__/integration/structural-health.routes.test.ts`                      | Structural health integration tests     |
| `src/__tests__/integration/operation-log.routes.test.ts`                          | Operation log integration tests         |
| `src/__tests__/integration/comparison.routes.test.ts`                             | Comparison integration tests            |
| `docs/architecture/decisions/ADR-010-phase8f-tech-debt-resolution.md`             | Phase 8f decision record                |

---

## Design Decision Summary

| Decision                                    | Choice                                               | Rationale                                                                  |
| ------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| `ActionCategory` for stuck mutations        | `'correction'` (not new category)                    | Aligns with existing taxonomy; investigation maps to corrective action     |
| `IRiskFactor.type` for stuck mutations      | `'performance'`                                      | Pipeline throughput concern, not design complexity                         |
| Cache toggle for graph repository           | `config.cache.enabled` conditional                   | Allows disabling cache in tests/dev without code changes                   |
| `PrismaMetricsStalenessRepository` location | Same `repositories/` directory as other Prisma repos | Follows existing infrastructure layer convention                           |
| Dual-edge detection severity                | `console.warn` (non-blocking)                        | PKGs legitimately have dual edges; crashing would break metric computation |
| Integration test strategy                   | Fastify `.inject()` with mock repositories           | Fast, no external dependencies, recommended by ADR-0040                    |
| Cache invalidation for relational queries   | TTL-based only (no active invalidation)              | Matches existing `getDomainSubgraph` pattern; active invalidation deferred |
| Semantic misconception detector             | Out of scope                                         | Requires vector-service which doesn't exist yet                            |
| Proposer notification                       | Out of scope (ADR-009)                               | Requires notification-service integration — deferred to Phase 9+           |
