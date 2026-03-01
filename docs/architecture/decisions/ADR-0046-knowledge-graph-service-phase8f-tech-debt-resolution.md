# ADR-0046: Knowledge Graph Service Phase 8f — Tech Debt Resolution & DI Wiring

**Date:** 2026-03-01 **Relates to:** ADR-0040, ADR-0041, ADR-0042, ADR-0043,
ADR-0044, ADR-0045, ADR-004, ADR-005, ADR-006, ADR-009 **Spec:**
`docs/knowledge-graph-service-implementation/PHASE-8f-TECH-DEBT-RESOLUTION.md`

## Status

Accepted

## Context

Phases 8–8e of the knowledge-graph-service accumulated technical debt as new
features were added iteratively. The service compiled with 7 TypeScript errors,
1 ESLint violation, 30+ additional ESLint style issues, a non-functional
composition root (`null as unknown` stub), a missing repository implementation,
incomplete cache coverage, and no dual-edge detection guards in metric
computation.

The service was in a "compiles-but-crashes" state — all route handlers received
a null service reference and would throw on any request.

## Decision

Resolve all accumulated tech debt in a single consolidation phase with no new
features, no new API surface, and no new domain concepts.

### Changes Made

#### 1. TypeScript Error Fixes (7 errors → 0)

- **`knowledge-graph.service.ts`**: Added missing imports — `EdgeId` from
  `@noema/types`, `IPkgOperationLogEntry` from `./pkg-operation-log.repository`,
  `PkgOperationType` from `./value-objects/operation-log`.

- **`knowledge-graph.service.impl.ts`**: Fixed `ActionCategory` mapping
  (`'investigation'` → `'correction'`), corrected `IRiskFactor` shape with
  proper `type/severity/description/probability/impact/mitigation` fields, and
  imported `IRiskFactor` from `@noema/contracts`.

#### 2. ESLint Error Fixes (37 errors + 2 warnings → 0)

- Replaced `as IGraphEdge` cast with a guarded
  `if (firstConflict !== undefined)` pattern to satisfy both
  `non-nullable-type-assertion-style` and `no-non-null-assertion` rules.
- Fixed `!=` → `!==` (eqeqeq) across route files.
- Fixed nullable string conditionals to use explicit `!== undefined && !== ''`
  checks (strict-boolean-expressions).
- Removed unnecessary optional chains on non-nullish values in the mutation
  pipeline.
- Removed unreachable defensive checks in edge-type-policies.
- Auto-fixed `Array<T>` → `T[]`, unnecessary type assertions, and unused
  eslint-disable directives.

#### 3. DI Composition Root (§3)

Replaced the `null as unknown` stub in `src/index.ts` with a fully wired
dependency tree:

```
Neo4jGraphRepository → [CachedGraphRepository] → KnowledgeGraphService
PrismaMetricsRepository ─────────────────────────┘
PrismaMutationRepository ────────────────────────┘
PrismaMisconceptionRepository ───────────────────┘
PrismaOperationLogRepository ────────────────────┘
PrismaMetricsStalenessRepository (new) ──────────┘
PrismaAggregationEvidenceRepository ─────────────┘
RedisEventPublisher ─────────────────────────────┘
CkgMutationPipeline ─────────────────────────────┘
  └── CkgValidationPipeline
       ├── SchemaValidationStage (100)
       ├── StructuralIntegrityStage (200)
       ├── OntologicalConsistencyStage (250)
       ├── ConflictDetectionStage (300)
       └── EvidenceSufficiencyStage (400)
```

**Cache toggle**: `config.cache.enabled` conditionally wraps
`Neo4jGraphRepository` with `CachedGraphRepository`. Both implement
`IGraphRepository`, making the downstream service agnostic.

#### 4. `PrismaMetricsStalenessRepository` (§4)

Implemented the missing `IMetricsStalenessRepository` concrete class using
Prisma's `upsert` operation on the `(userId, domain)` compound unique key.
Methods: `markStale`, `isStale`, `getStalenessRecord`. Uses `nanoid` with `ms_`
prefix for ID generation. DateTime fields use native `Date` objects per Prisma
convention.

#### 5. Cache Layer Completion (§5)

Implemented cache-through for `getSiblings`, `getCoParents`, and
`getNeighborhood` using the existing `cache.getOrLoad()` pattern (consistent
with `getDomainSubgraph` and other cached methods). TTL-based invalidation only
— no active invalidation for relational queries.

#### 6. Dual-Edge Detection Guard (§6)

Added a diagnostic pass in `computeParentMap()` that detects nodes with both
IS_A and PART_OF edges to the same target. Logs via `console.warn` (non-
blocking) — this is expected in PKGs where the ontological advisory was shown
but the learner chose to proceed. The `Set<NodeId>` naturally deduplicates so
metric computation is unaffected.

### Design Decisions

| Decision                                              | Choice                             | Rationale                                                         |
| ----------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------- |
| `ActionCategory` for stuck mutations                  | `'correction'`                     | Investigation maps to corrective action within existing taxonomy  |
| `IRiskFactor.type` for stuck mutations                | `'performance'`                    | Pipeline throughput concern, not design complexity                |
| `IRiskFactor.probability`                             | `0.8`                              | Deterministic metric — high confidence                            |
| `IRiskFactor.impact`                                  | `0.6`                              | Moderate — blocks CKG progress but not data integrity             |
| Cache toggle                                          | `config.cache.enabled` conditional | Allows disabling in tests/dev without code changes                |
| Cache invalidation for relational queries             | TTL-based only                     | Matches existing `getDomainSubgraph` pattern                      |
| Dual-edge detection severity                          | `console.warn` (non-blocking)      | PKGs legitimately have dual edges; crashing would break metrics   |
| `PrismaMetricsStalenessRepository.markStale` DateTime | `new Date()`                       | Prisma convention; DateTime fields accept `Date` objects natively |

### Out of Scope (Deferred)

| Item                            | Reason                              | Tracked in        |
| ------------------------------- | ----------------------------------- | ----------------- |
| Integration test suite          | Deferred to dedicated testing phase | Phase 8g          |
| Proposer notification           | Requires notification-service       | ADR-009, Phase 9+ |
| Semantic misconception detector | Requires vector-service             | Future phase      |
| MCP tool surface for escalation | Phase 9 concern                     | Phase 9           |

## Consequences

### Positive

- Service is now fully functional at runtime — all routes work end-to-end
- Zero TypeScript errors, zero ESLint errors/warnings
- All 5 CKG validation stages wired (including Phase 8e's ontological stage)
- Redis caching covers all graph read operations including relational queries
- Metrics staleness tracking has a concrete Prisma-backed implementation
- Dual-edge detection provides diagnostic visibility without breaking metrics

### Negative

- No integration tests yet (deferred to Phase 8g)
- `console.warn` in metric computation is less structured than pino logging
  (acceptable tradeoff given pure-function context)

### Risks

- Runtime failures may surface in routes that were previously unreachable (the
  null stub meant no code path was ever exercised)
- Cache key collisions are theoretically possible with adversarial node IDs
  (mitigated by branded ID prefixes)
