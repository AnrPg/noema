# ADR-005: Knowledge-Graph-Service Phase 6 — CKG Mutation Pipeline

## Status

Accepted

## Date

2026-06-04

## Context

Phase 5 (ADR-004, commit `caa1413`) implemented the service layer with PKG
node/edge CRUD, CKG read-only access, edge policy enforcement, operation
logging, and agent hint generation. Phase 6 introduces the **CKG Mutation
Pipeline** — a typestate-governed processing pipeline that allows agents and the
aggregation subsystem to propose, validate, and commit structural changes to the
Canonical Knowledge Graph.

The CKG is a shared, curated knowledge structure. Unlike Personal Knowledge
Graphs (PKGs) which are directly mutable, every CKG change must pass through a
rigorous pipeline: schema validation, structural integrity checks, conflict
detection, evidence sufficiency verification, and formal proof (future).

Before implementation, four design decisions required resolution. Each was
evaluated with multiple options; the user approved one per decision.

---

## Decisions

### D1: State Machine Topology

**Problem:** The Phase 6 spec illustrates a 5-state flow (proposed → validating
→ validated → committing → committed + rejected), but the existing Prisma schema
and `@noema/types` define an 8-state `MutationState` enum with additional
`proving`, `proven`, and `committing` states.

| Option                      | Description                                                       | Trade-off                                                        |
| --------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| **A: Full 8-state machine** | Implement all 8 states; PROVING/PROVEN auto-transition in Phase 6 | Future-proof; matches existing types; no schema migration needed |
| B: Collapse to 5 states     | Remove PROVING/PROVEN/COMMITTING from Prisma; update types        | Simpler now; requires migration when formal proofs are added     |

**Decision:** Option A — Full 8-state typestate machine. The PROVING → PROVEN
transition auto-approves with an audit entry noting "Phase 6: formal
verification not required." This preserves the schema contract and makes TLA+
integration in a future phase a simple replacement of the pass-through logic.

### D2: Pipeline Architecture

**Problem:** Should mutation orchestration logic live inside
`KnowledgeGraphService` methods, or in a separate composed class?

| Option                              | Description                                                              | Trade-off                                                         |
| ----------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| **A: Separate CkgMutationPipeline** | New class injected via constructor DI; service methods are thin wrappers | Clean SRP; testable in isolation; matches content-service pattern |
| B: Inline in service                | Main orchestration logic directly in service methods                     | Fewer files; harder to test pipeline stages independently         |

**Decision:** Option A — Created `CkgMutationPipeline` as a standalone class
composed into `KnowledgeGraphService` via constructor DI. The service layer
handles auth, Zod validation at the boundary, and agent hint generation. The
pipeline handles state transitions, validation orchestration, commit protocol,
and event publishing.

### D3: Async Execution Model

**Problem:** How should `proposeMutation` return to the caller while the
multi-stage pipeline runs?

| Option                  | Description                                              | Trade-off                                  |
| ----------------------- | -------------------------------------------------------- | ------------------------------------------ |
| A: Fire-and-forget only | In-process async; no external tracking                   | Simple; no observability                   |
| B: Event-driven only    | Publish event; separate consumer processes               | Resilient; complex setup                   |
| **C: Hybrid**           | Fire-and-forget in-process + event audit + recovery scan | Best of both; recovery for stuck mutations |

**Decision:** Option C — `proposeMutation` creates the mutation in PROPOSED
state, publishes a `CKG_MUTATION_PROPOSED` event for audit, and fires off
in-process async validation via `void this.runPipelineAsync()`. A recovery
method `recoverStuckMutations()` handles mutations stuck in VALIDATING, PROVING,
or COMMITTING states (e.g., after a process crash) by rejecting them for manual
retry.

### D4: DSL Operation Type Modeling

**Problem:** How should the 7 CKG operation types (add_node, remove_node,
update_node, add_edge, remove_edge, merge_nodes, split_node) be modeled?

| Option                           | Description                                                                | Trade-off                                                     |
| -------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **A: Discriminated union + Zod** | TypeScript interfaces with `type` discriminant + Zod schemas per operation | Full validation; excellent IDE completion; composable schemas |
| B: Type guards only              | Runtime `typeof`/`in` checks without Zod                                   | Lighter; no runtime schema dep; less safety                   |

**Decision:** Option A — Created a discriminated union on the `type` field with
7 operation interfaces (`IAddNodeOperation`, `IRemoveNodeOperation`, etc.). Each
has a corresponding Zod schema, and the composite `CkgMutationOperationSchema`
uses `z.discriminatedUnion('type', ...)` for efficient dispatch. The
`MutationProposalSchema` validates the full proposal (operations array +
rationale + evidence count + priority).

---

## Architecture

### New Files

| File                         | Lines | Purpose                                                                                  |
| ---------------------------- | ----- | ---------------------------------------------------------------------------------------- |
| `ckg-mutation-dsl.ts`        | ~340  | DSL types: 7 operation interfaces, discriminated union, Zod schemas, utility functions   |
| `ckg-typestate.ts`           | ~170  | State transition table, guards, branded state types, happy-path computation              |
| `ckg-validation-stages.ts`   | ~440  | 4 validation stages: Schema, StructuralIntegrity, ConflictDetection, EvidenceSufficiency |
| `ckg-validation-pipeline.ts` | ~100  | `CkgValidationPipeline` implementing `IValidationPipeline` with ordered stage execution  |
| `ckg-mutation-pipeline.ts`   | ~580  | Main orchestrator: propose, validate, prove, commit, cancel, retry, recover              |

### Modified Files

| File                              | Change                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `knowledge-graph.service.ts`      | Added 6 CKG mutation methods to `IKnowledgeGraphService` interface                                   |
| `knowledge-graph.service.impl.ts` | Implemented 6 mutation methods delegating to `CkgMutationPipeline`; added pipeline to constructor DI |
| `index.ts`                        | Added barrel exports for all Phase 6 types, classes, and schemas                                     |

### Pipeline Flow

```
proposeMutation()
  │
  ├─ Create mutation (PROPOSED) in Postgres
  ├─ Publish CKG_MUTATION_PROPOSED event
  └─ Fire async pipeline ─┐
                           │
  runPipeline()            ▼
  │
  ├─ PROPOSED → VALIDATING
  │   ├─ Stage 1: Schema validation (Zod parse)
  │   ├─ Stage 2: Structural integrity (edge policy, acyclicity, orphans, merge/split)
  │   ├─ Stage 3: Conflict detection (overlapping in-flight mutations)
  │   └─ Stage 4: Evidence sufficiency (promotion band threshold)
  │   └─ → VALIDATED or REJECTED
  │
  ├─ VALIDATED → PROVING → PROVEN (auto-approved, Phase 6)
  │
  └─ PROVEN → COMMITTING
      ├─ Apply operations to Neo4j (CKG graph type)
      ├─ Handle merge/split: edge reassignment, node creation/deletion
      └─ → COMMITTED + CKG_MUTATION_COMMITTED event
         or → REJECTED + CKG_MUTATION_REJECTED event
```

### State Transition Table

```
PROPOSED   → [validating, rejected]
VALIDATING → [validated, rejected]
VALIDATED  → [proving, rejected]
PROVING    → [proven, rejected]
PROVEN     → [committing, rejected]
COMMITTING → [committed, rejected]
COMMITTED  → [] (terminal)
REJECTED   → [] (terminal)
```

---

## Consequences

### Positive

- **Type safety:** Discriminated union + Zod ensures invalid operations are
  caught at the service boundary and again at the validation stage level
- **Auditability:** Every state transition creates an immutable audit log entry
  with reason, performer, context, and timestamp
- **Recovery:** Stuck mutations are automatically detected and rejected on
  service startup, allowing proposers to retry
- **Future-proof:** PROVING/PROVEN states are ready for TLA+ formal verification
  without schema changes
- **Testability:** Each validation stage, the pipeline, and the orchestrator are
  independently testable via DI

### Negative

- **Complexity:** 5 new files (~1630 lines) for a pipeline that currently
  auto-approves the proof stage
- **Cross-database risk:** Neo4j commit + Postgres state update are not atomic;
  failure between them requires manual reconciliation
- **Recovery is destructive:** Stuck mutations are rejected rather than resumed;
  the proposer must explicitly retry

### Risks

- **Merge/Split complexity:** The `executeMerge` and `executeSplit` methods
  perform multiple Neo4j operations. Under high load, partial failures could
  leave the CKG in an inconsistent state. A future phase should add batch
  transaction support.
- **Evidence count threshold:** The minimum 3-PKG evidence threshold for the
  `weak` promotion band is a heuristic. Domain-specific tuning may be needed.

---

## Related

- ADR-004: Phase 5 — PKG Operations & Service Layer
- ADR-003: Phase 4 — Repository Implementations
- ADR-010: Remediation Phase 1 (D4 readonly mutation fields, D9 Zod validation)
- PHASE-6-CKG-MUTATION-PIPELINE.md specification
- `@noema/types` MutationState, GraphNodeType, GraphEdgeType, branded IDs
- `@noema/events` CKG event types (CKG_MUTATION_PROPOSED, VALIDATED, COMMITTED,
  REJECTED)

---

## Addendum — Phase 1 Remediation (2026-03-02, ADR-010)

The following changes were applied to the CKG mutation pipeline during
remediation Phase 1:

| Decision                           | Change                                                                                          | Rationale                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| D4 — Readonly mutation fields      | `state`, `version`, `updatedAt` on `ICkgMutation` are now `readonly`                            | Prevents accidental in-place state corruption; mutations must go through pipeline methods |
| D9 — Zod extraction validation     | `extractOperations()` and `extractEvidence()` now validate through Zod schemas before returning | Catches corrupt JSONB payloads at extraction boundaries rather than deep in the pipeline  |
| Fix 1.10 — Serializable ops mapper | Added `toSerializableOperations()` to convert domain operation objects for JSON-safe storage    | Ensures `CkgMutationOperation[]` round-trips cleanly through Prisma JSONB columns         |

## Addendum — Phase 2 Remediation (2026-03-02, ADR-011)

The following changes were applied during remediation Phase 2:

| Decision                            | Change                                                                                                                               | Rationale                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| D4 — ICkgMutationPipeline interface | Created `ckg-mutation-pipeline.interface.ts` with full DI interface; class now `implements ICkgMutationPipeline`                     | Enables mocking the pipeline in integration tests and future DI container wiring |
| D6 — recoveryAttempts field         | Added `recoveryAttempts: number` (readonly, default 0) to `ICkgMutation`; added `incrementRecoveryAttempts` to `IMutationRepository` | Phase 3 will use this to implement max retry guard in `recoverStuckMutations`    |
