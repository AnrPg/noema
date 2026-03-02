# ADR-013: Remediation Phase 4 — Architecture, Refactoring, Observability & Consistency

**Status:** Accepted  
**Date:** 2025-07-01  
**Deciders:** Engineering (automated remediation)  
**Phase:** 4 of 5  

## Context

The comprehensive audit (67 findings) identified Phase 4 as the "high-effort" phase
requiring 8 major architectural refactors across 20+ files. This phase addresses
structural debt, code duplication, observability gaps, and consistency issues in
the knowledge-graph-service domain layer.

Prior phases had resolved foundation issues (Phase 1), contract/interface gaps
(Phase 2), and domain logic bugs (Phase 3). Phase 4 targets the architecture itself.

## Decision

Implement all 8 Phase 4 fixes in a single commit:

### Fix 4.1 — Outbox Retry + Reconciliation
- Added `retryPostgresStateUpdate()` with exponential backoff (3 attempts, 200ms base)
- Added `reconcileStuckCommitting()` to find mutations stuck in COMMITTING > 5m
- Cross-DB inconsistency path: Neo4j commits → Postgres retries → reconciliation sweep

### Fix 4.2 — PKG Write Resilience
- Extracted `safeAppendOperation()`, `safePublish()`, `markMetricsStale()` as
  non-propagating wrappers around operation-log, event, and staleness writes
- Post-write failures are logged but do not fail the primary CRUD operation
- Parallel execution via `Promise.all()` for independent post-write operations

### Fix 4.3 — Split God Object into Sub-Services
- Decomposed 2,963-line `KnowledgeGraphService` into 4 focused modules:
  - **`service-helpers.ts`** (~195 lines): Pure utility functions and constants
  - **`PkgWriteService`** (~850 lines): All PKG node/edge CRUD operations
  - **`GraphReadService`** (~740 lines): All read-only graph operations (PKG + CKG)
  - **`MetricsOrchestrator`** (~570 lines): Phase 7 metrics/misconception/health
- Thin facade (`KnowledgeGraphService`, ~950 lines) delegates to sub-services
- Tests unaffected: all mock `IKnowledgeGraphService` interface, not the concrete class
- Total reduction: 2,963 → 950 lines in the facade (68% reduction)

### Fix 4.4 — Deduplicate PKG/CKG Traversal
- Unified 10 method pairs via private template methods in `GraphReadService`
- Each public PKG/CKG method is now a one-liner delegation to a shared helper
- `getCkgSubgraph` kept unique due to divergent error handling (returns empty subgraph)
- Line reduction: 1,070 → 740 lines (30% reduction)

### Fix 4.5 — Extract AgentHintsBuilder + DI Wiring
- Extracted ~1,100-line `AgentHintsFactory` from the service class
- Factory injected via constructor DI (9th parameter)
- Builder pattern: `.createNodeHints()`, `.createMetricsHints()`, etc.

### Fix 4.6 — Extract Analysis Thresholds
- Created `policies/analysis-thresholds.ts` with named constants
- Replaced 15+ magic numbers across metrics and misconception detection
- Constants: `METRIC_CHANGE_THRESHOLD`, `MIN_CONFIDENCE_THRESHOLD`, etc.

### Fix 4.7 — OpenTelemetry Tracing + Prometheus Counters
- Added `@opentelemetry/api@^1.9.0` (thin API — no-op without SDK)
- Created `observability.ts`:
  - `kgTracer`: Named tracer for the service
  - `withSpan()`: Async span wrapper with auto error recording
  - `ServiceCounters`: In-memory Prometheus-compatible counter system
  - 10 well-known counters (`PKG_OPERATIONS`, `CKG_MUTATIONS`, etc.)
- Instrumented hotspots:
  - CKG mutation pipeline: `proposeMutation`, `runValidationStage`, `runCommitStage`
  - Cross-DB inconsistency detection: counter increment on all Postgres retry exhaustion
  - PkgWriteService: counter increments on all 6 write operations + 3 failure paths
  - MetricsOrchestrator: `computeMetrics` and `detectMisconceptions` wrapped in spans
- Jaeger backend already in docker-compose.local.yml (OTLP on 4317/4318)

### Fix 4.8 — Pipeline Structured Error Handling
- Added `IPipelineErrorMetrics` interface with success/failure counts
- `runPipelineAsync()` catches all pipeline errors, increments failure count
- `getPipelineHealth()` exposes aggregated pipeline metrics for diagnostics

## Rationale

- **Sub-service extraction (4.3)** follows the "break the God object" pattern.
  Sub-services are internal (not exposed via DI) — the facade owns composition.
  This preserves the single `IKnowledgeGraphService` contract while making the
  internals testable and maintainable.

- **PKG/CKG deduplication (4.4)** eliminates a major source of copy-paste bugs.
  The unified helpers use `graphType` and optional `userId` parameters to handle
  PKG vs CKG dispatch, avoiding template method inheritance complexity.

- **OTel API-only (4.7)** was chosen over a full SDK to keep the dependency minimal.
  In tests, all spans are no-ops (zero overhead). In production, registering an
  SDK (via `@opentelemetry/sdk-trace-node`) activates tracing without code changes.

- **In-memory counters (4.7)** were chosen over prom-client to avoid adding
  another dependency. The `ServiceCounters` class can render Prometheus text format
  for a `/metrics` endpoint. Migration to prom-client is additive if needed.

## Alternatives Considered

1. **Full OTel SDK in this phase**: Rejected — adds 5+ dependencies, requires
   OTLP exporter configuration, and complicates test setup. API-only is zero-cost.

2. **Separate test suites per sub-service**: Rejected — existing tests mock the
   interface, not the implementation. Adding sub-service unit tests is a future
   enhancement (Phase 5 testing improvements).

3. **Inheritance for PKG/CKG unification**: Rejected — template method pattern
   via inheritance would add class hierarchy complexity. Private helpers with
   `graphType` parameter achieve the same deduplication without inheritance.

## Consequences

### Positive
- God object eliminated: 2,963 → 950 lines (facade), 4 focused sub-services
- 30% line reduction in graph reads via deduplication
- Full OTel tracing on critical paths (pipeline, metrics, writes)
- Prometheus counters for all failure modes (staleness, log, event, cross-DB)
- All 458 tests pass unchanged (zero test modifications needed)

### Negative
- `@opentelemetry/api` is a new dependency (minimal — 67KB, zero transitive deps)
- Sub-services require careful import ordering (observability → helpers → sub-services → facade)

### Risks
- In-memory counters reset on process restart (acceptable for dev, needs persistence for prod)
- OTel API traces are no-ops until an SDK is registered in the entrypoint

## Emergent Decisions During Implementation
- ESLint composite interface resolution limits required `eslint-disable` comments
  on 4 methods where the type system couldn't resolve deeply composed interfaces
- `getCkgSubgraph` could not be unified with `getSubgraph` due to fundamentally
  different error handling semantics (throw vs return empty subgraph with hints)
- Counter labels use string discriminators (e.g., `{operation: 'node_created'}`)
  rather than separate counter names, for better Prometheus label cardinality

## Follow-Up Work (Deferred to Phase 5)
- Register OTel SDK in `src/index.ts` for production tracing
- Add `/metrics` Fastify route exposing `kgCounters.toPrometheusText()`
- Add sub-service unit tests for `PkgWriteService`, `GraphReadService`, `MetricsOrchestrator`
- Consider prom-client migration for histogram/gauge support
