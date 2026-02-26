# ADR-002: Knowledge-Graph-Service Phase 3 — Domain Layer

## Status

Accepted

## Date

2026-06-02

## Context

Phase 2 (Prisma schema & migrations — commit `1425719`) established the database
schema. Phase 3 builds the domain layer: the infrastructure-agnostic core that
defines **what** the knowledge-graph-service can do and **what guarantees** it
provides, without specifying **how**. This layer is the dependency-inversion
boundary — services depend on repository interfaces, not implementations.

The content-service was used as the primary reference for architectural patterns
(file organization, error hierarchy, `IServiceResult<T>`, `IExecutionContext`).

Four design decisions were evaluated and approved before implementation began.

---

## Decisions

### D1: Result Pattern — Hybrid Approach

**Options evaluated:**

| Option               | Description                                                    | Trade-off                          |
| -------------------- | -------------------------------------------------------------- | ---------------------------------- |
| A: Exception-only    | Throw `DomainError` subclasses, no result wrapper              | Simple but loses agent hints       |
| B: Result-everywhere | `Result<T, E>` monad on every function                         | Rigorous but heavy for TypeScript  |
| **C: Hybrid**        | `IServiceResult<T>` at service boundary, exceptions internally | Matches content-service, pragmatic |

**Decision:** Option C — `IServiceResult<T>` (with `IAgentHints`) at the
`IKnowledgeGraphService` boundary. Internal domain logic (validation pipeline,
policy enforcement) throws typed `DomainError` subclasses. The service layer
catches and wraps them.

**Rationale:** Aligns with the content-service pattern. Agent hints are only
meaningful at the API boundary; internal code benefits from throw-based control
flow where validation failures should short-circuit immediately.

### D2: File Organization — Function-First

**Options evaluated:**

| Option                | Description                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| **A: Function-first** | One file per concern (`graph.repository.ts`, `mutation.repository.ts`, `knowledge-graph.service.ts`) |
| B: Layer-first        | Nested directories (`repositories/`, `services/`, `errors/`)                                         |

**Decision:** Option A — flat, function-first layout matching the
content-service convention. Errors and value objects get their own
subdirectories because they have many files; repositories and the service
interface live at the domain root.

**Structure:**

```
src/domain/knowledge-graph-service/
├── errors/
│   ├── base.errors.ts        # DomainError abstract, ValidationError, guards
│   ├── graph.errors.ts        # NodeNotFound, CyclicEdge, MaxDepthExceeded, ...
│   ├── mutation.errors.ts     # InvalidStateTransition, MutationConflict, ...
│   ├── misconception.errors.ts
│   └── index.ts
├── value-objects/
│   ├── graph.value-objects.ts # IEdgePolicy, IValidationOptions, ITraversalOptions
│   ├── branded-numerics.ts    # PositiveDepth (KG-local)
│   ├── comparison.ts          # IGraphComparison, IStructuralDivergence
│   ├── operation-log.ts       # PkgOperation discriminated union
│   ├── promotion-band.ts      # PromotionBandUtil
│   └── index.ts
├── policies/
│   ├── edge-type-policies.ts  # EDGE_TYPE_POLICIES frozen config
│   └── index.ts
├── graph.repository.ts        # ISP: INodeRepo + IEdgeRepo + ITraversalRepo + IBatchRepo
├── mutation.repository.ts     # ICkgMutation, IMutationRepository
├── metrics.repository.ts      # IMetricsRepository
├── misconception.repository.ts
├── pkg-operation-log.repository.ts
├── aggregation-evidence.repository.ts
├── knowledge-graph.service.ts # IKnowledgeGraphService (full PKG+CKG+metrics contract)
├── validation.ts              # IValidationPipeline, IValidationStage
├── domain-events.ts           # Re-exports from @noema/events + IEventMetadata
└── index.ts                   # Barrel
```

### D3: PKG Operation Log Representation — Typed Discriminated Union

**Options evaluated:**

| Option                           | Description                                                               |
| -------------------------------- | ------------------------------------------------------------------------- |
| **A: Typed discriminated union** | `PkgOperationType` enum → `IPkgNodeCreatedOp \| IPkgEdgeDeletedOp \| ...` |
| B: Generic op envelope           | `{ type: string; payload: unknown }`                                      |

**Decision:** Option A — each operation type has its own interface with a `type`
discriminator field. The `PkgOperation` union type enables exhaustive `switch`
statements and type-narrowing without casts.

**Operation types:** `node_created`, `node_updated`, `node_deleted`,
`edge_created`, `edge_deleted`, `batch_import`.

### D4: Branded Numerics Location — Cross-Service in @noema/types + KG-Local

**Options evaluated:**

| Option                 | Description                                                    |
| ---------------------- | -------------------------------------------------------------- |
| A: All in the service  | Define EdgeWeight, MasteryLevel, etc. locally                  |
| B: All in @noema/types | Every branded numeric is cross-service                         |
| **C: Split**           | Cross-service numerics in @noema/types, KG-only numerics local |

**Decision:** Option C.

- **@noema/types/branded-numerics:** `EdgeWeight`, `MasteryLevel`,
  `ConfidenceScore` — used by multiple services and agents.
- **Local (value-objects/branded-numerics.ts):** `PositiveDepth` — only used
  within graph traversal configuration in this service.

---

## Design Details

### Error Hierarchy

```
DomainError (abstract)
├── ValidationError          # Field-level validation failures
├── UnauthorizedError         # Access control violations
├── RateLimitExceededError    # Rate limiting
├── NodeNotFoundError         # Graph node lookups
├── EdgeNotFoundError         # Graph edge lookups
├── DuplicateNodeError        # Uniqueness constraint
├── CyclicEdgeError           # DAG policy violation
├── OrphanEdgeError           # Referential integrity
├── InvalidEdgeTypeError      # Edge policy type constraint
├── MaxDepthExceededError     # Traversal depth limit
├── GraphConsistencyError     # General consistency
├── MutationNotFoundError     # CKG mutation lookups
├── InvalidStateTransitionError # Typestate machine violation
├── MutationConflictError     # Optimistic concurrency
├── ValidationFailedError     # Multi-stage validation failure
├── MutationAlreadyCommittedError
├── MisconceptionPatternNotFoundError
├── InterventionTemplateNotFoundError
└── InvalidMisconceptionStateTransitionError
```

All errors carry a `code` string, `timestamp`, optional `details` record, and
`toJSON()` for structured logging. Type guard functions (`isDomainError`,
`isValidationError`, etc.) enable safe instanceof-free narrowing across module
boundaries.

### Repository Interface Segregation

`IGraphRepository` is split into four focused sub-interfaces following ISP:

- **INodeRepository** — CRUD for graph nodes (PKG and CKG)
- **IEdgeRepository** — CRUD for edges with validation support
- **ITraversalRepository** — ancestors, descendants, subgraph, shortest path
- **IBatchGraphRepository** — bulk import/export for seeding and migration

The composite `IGraphRepository` extends all four. Services needing only a
subset (e.g., traversal-only) depend on the narrower interface.

### EDGE_TYPE_POLICIES

Data-driven configuration for all 8 `GraphEdgeType` values. Each policy
specifies:

- `requiresAcyclicity` — whether edges of this type must form a DAG
- `allowedSourceTypes` / `allowedTargetTypes` — structural constraints
- `maxWeight` / `defaultWeight` — weight bounds

The `prerequisite` and `hierarchy` edge types enforce acyclicity; others
(`related`, `misconception`, `analogy`, etc.) allow cycles.

### Validation Pipeline

The `IValidationPipeline` interface defines a composable, multi-stage validation
system. Each `IValidationStage` runs independently and reports violations with
severity levels. The pipeline aggregates results and determines whether the
overall validation passes. This will be implemented concretely in Phase 5.

### Domain Events

All 14 knowledge-graph event types are already defined in `@noema/events`. The
domain layer re-exports them and defines `IEventMetadata` — the metadata
contract that the infrastructure layer (Phase 7) must populate when publishing
events (eventId, correlationId, causationId, service name, version).

---

## Consequences

### Positive

- **Zero infrastructure coupling** — the entire domain layer compiles without
  Neo4j, Prisma, or Redis dependencies
- **Testability** — repository interfaces enable pure unit tests with test
  doubles (Phase 5)
- **Type safety** — branded numerics, discriminated unions, and
  `exactOptionalPropertyTypes` catch misuse at compile time
- **Extensibility** — new edge types require only a policy entry, not code
  changes; new operation types extend the discriminated union
- **Cross-service alignment** — `IServiceResult<T>` + `IAgentHints` pattern
  matches the content-service, enabling consistent API layer code

### Negative

- **More files** — 24+ files for a layer with zero runtime behavior. This is
  intentional: the domain layer is a compile-time contract, not a runtime
  artifact.
- **Branded numerics require discipline** — callers must use factory functions
  (`createEdgeWeight()`, `createPositiveDepth()`); raw number assignment is a
  type error. This is a feature, not a bug.

### Risks

- **Interface drift** — if the Phase 4/5 implementation discovers that an
  interface is missing a method, the domain layer must be updated first. This is
  acceptable: interface changes should be deliberate.

---

## Files Changed

### New files (knowledge-graph-service domain layer)

| File                                   | Purpose                                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `errors/base.errors.ts`                | `DomainError` abstract class, `ValidationError`, `UnauthorizedError`, `RateLimitExceededError`, type guards         |
| `errors/graph.errors.ts`               | Graph-specific errors (8 classes)                                                                                   |
| `errors/mutation.errors.ts`            | CKG mutation errors (5 classes)                                                                                     |
| `errors/misconception.errors.ts`       | Misconception-specific errors (3 classes)                                                                           |
| `errors/index.ts`                      | Barrel export                                                                                                       |
| `value-objects/graph.value-objects.ts` | `IEdgePolicy`, `IValidationOptions`, `ITraversalOptions`, `INodeFilter` + factories                                 |
| `value-objects/branded-numerics.ts`    | `PositiveDepth` branded numeric (KG-local)                                                                          |
| `value-objects/comparison.ts`          | `IGraphComparison`, `IStructuralDivergence`, divergence enums                                                       |
| `value-objects/operation-log.ts`       | `PkgOperation` discriminated union (6 operation types)                                                              |
| `value-objects/promotion-band.ts`      | `PromotionBandUtil` (evidence thresholds)                                                                           |
| `value-objects/index.ts`               | Barrel export                                                                                                       |
| `policies/edge-type-policies.ts`       | `EDGE_TYPE_POLICIES` frozen config (8 edge types)                                                                   |
| `policies/index.ts`                    | Barrel export                                                                                                       |
| `graph.repository.ts`                  | `INodeRepository`, `IEdgeRepository`, `ITraversalRepository`, `IBatchGraphRepository`, composite `IGraphRepository` |
| `mutation.repository.ts`               | `ICkgMutation`, `IMutationRepository`                                                                               |
| `metrics.repository.ts`                | `IMetricsRepository`                                                                                                |
| `misconception.repository.ts`          | `IMisconceptionRepository`                                                                                          |
| `pkg-operation-log.repository.ts`      | `IPkgOperationLogRepository`                                                                                        |
| `aggregation-evidence.repository.ts`   | `IAggregationEvidenceRepository`                                                                                    |
| `knowledge-graph.service.ts`           | `IKnowledgeGraphService` (full service contract)                                                                    |
| `validation.ts`                        | `IValidationPipeline`, `IValidationStage`, violation types                                                          |
| `domain-events.ts`                     | Re-exports from `@noema/events` + `IEventMetadata`                                                                  |
| `index.ts`                             | Domain barrel export                                                                                                |

### Modified files (shared packages)

| File                                           | Change                                               |
| ---------------------------------------------- | ---------------------------------------------------- |
| `packages/types/src/branded-numerics/index.ts` | New: `EdgeWeight`, `MasteryLevel`, `ConfidenceScore` |
| `packages/types/src/base/index.ts`             | Added `DeepReadonly<T>` utility type                 |
| `packages/types/src/index.ts`                  | Barrel export for branded-numerics                   |
