# ADR-0045: Knowledge Graph Service Phase 8e — Ontological Guardrails

**Status:** Accepted **Date:** 2025-01-28 **Deciders:** Architecture Team
**Relates to:** ADR-0040, ADR-0041, ADR-0042, ADR-0043, ADR-0044,
PHASE-8e-ONTOLOGICAL-GUARDRAILS.md

## Context

Phases 8b–8d shipped traversal, structural analysis, and ordering/ranking
endpoints. The CKG mutation pipeline validates schema, structural integrity,
conflicts, and evidence sufficiency — but lacks **ontological consistency**
checking. Agents can currently propose mutations that create semantically
contradictory edge combinations (e.g., IS_A + PART_OF between the same node
pair), which corrupts the canonical graph's formal semantics.

For PKG (Personal Knowledge Graphs), the same ontological conflicts are
pedagogically valuable signals: a learner confusing IS_A with PART_OF reveals
a conceptual modelling misconception that the tutoring system should surface.

Phase 8e adds ontological guardrails to both the CKG pipeline (blocking with
human-in-the-loop escalation) and the PKG path (non-blocking advisory warnings).

## Decision

### D1: 10 Conflict Pairs — Frozen Lookup Table

Ontological conflicts are defined as a frozen array of `IOntologicalConflictPair`
objects. Each pair specifies two `GraphEdgeType` values that are mutually
incompatible on the same (source, target) node pair, plus a human-readable
reason. The 10 canonical pairs cover:

| # | Edge A           | Edge B            | Category                |
|---|------------------|-------------------|-------------------------|
| 1 | IS_A             | PART_OF           | Taxonomy vs mereology   |
| 2 | IS_A             | CONSTITUTED_BY    | Taxonomy vs constitution|
| 3 | EQUIVALENT_TO    | IS_A              | Identity vs subsumption |
| 4 | EQUIVALENT_TO    | DISJOINT_WITH     | Identity vs disjointness|
| 5 | ENTAILS          | CONTRADICTS       | Logical opposition      |
| 6 | CAUSES           | PRECEDES          | Causation vs temporal   |
| 7 | PREREQUISITE     | DERIVED_FROM      | Dependency direction    |
| 8 | DISJOINT_WITH    | PART_OF           | Disjointness vs part    |
| 9 | CONTRADICTS      | ANALOGOUS_TO      | Opposition vs analogy   |
|10 | EQUIVALENT_TO    | CONTRASTS_WITH    | Identity vs contrast    |

The table is extensible — new pairs can be added without structural changes.

### D2: OntologicalConsistencyStage — Order 250 in Validation Pipeline

A new `OntologicalConsistencyStage` implements the `IValidationStage` interface
at order 250 (after schema=100, structural=200, before conflict=300,
evidence=400). The stage performs two-phase checking:

1. **Intra-mutation scan**: O(n²) pairwise check of ADD_EDGE operations within
   the same mutation that target the same node pair with conflicting edge types.
2. **Graph conflict scan**: For each ADD_EDGE operation, queries Neo4j via
   `findConflictingEdges()` to check whether the target node pair already has
   edges of conflicting types in the graph.

Violations use severity `'error'` with code `'ONTOLOGICAL_CONFLICT'`.

### D3: PENDING_REVIEW State — Escalation for Ontological Conflicts

When a mutation fails validation with **only** `ONTOLOGICAL_CONFLICT` violations
(no other error types), the mutation transitions to `PENDING_REVIEW` instead of
`REJECTED`. This is a new typestate that requires human review:

```
PROPOSED → VALIDATING → PENDING_REVIEW → VALIDATED → PROVEN → COMMITTED
                                       → REJECTED
```

Rationale: Ontological conflicts are often judgment calls (e.g., "Is a wheel
part of a car, or a kind of car component?"). Automatic rejection would be too
aggressive; human review preserves the pedagogical intent while protecting the
canonical graph.

### D4: CKG_MUTATION_ESCALATED Event

A new domain event `CKG_MUTATION_ESCALATED` is published when a mutation enters
`PENDING_REVIEW`. The payload includes:
- `mutationId`, `proposedBy`
- `conflicts[]` with proposed/conflicting edge types, node IDs, and reasons
- `violationCount`, `reason`

This enables downstream systems (notification service, admin dashboard) to alert
reviewers. The current notification mechanism relies on event consumers; push
notification is tracked as tech debt (see ADR-009).

### D5: Approve/Reject API — POST Routes with Reason

Two new REST endpoints allow human reviewers to resolve escalated mutations:

| Route | Method | Effect |
|-------|--------|--------|
| `/api/v1/ckg/mutations/:mutationId/approve` | POST | PENDING_REVIEW → VALIDATED, resumes pipeline |
| `/api/v1/ckg/mutations/:mutationId/reject`  | POST | PENDING_REVIEW → REJECTED |

Both require admin/agent role and a mandatory `reason` string (1–2000 chars).
On approval, the pipeline resumes asynchronously from VALIDATED through
PROVEN → COMMITTED.

### D6: PKG Advisory Mode — Non-Blocking Warnings via IAgentHints

For PKG writes (which bypass the CKG mutation pipeline), the same conflict pairs
table is consulted in advisory mode within `KnowledgeGraphService.createEdge()`.
The check:

1. Looks up conflicting edge types for the new edge via
   `getConflictingEdgeTypesForAdvisory()`
2. Queries Neo4j for existing conflicting edges on the same node pair
3. If found, adds an `IWarning` (type: `'conflict'`, severity: `'medium'`) to
   the response's `agentHints.warnings[]`

The check is wrapped in try/catch and is non-blocking — failures are logged at
WARN level and the edge creation proceeds normally.

### D7: findConflictingEdges — Bidirectional Cypher Query

A new `findConflictingEdges(sourceNodeId, targetNodeId, edgeTypes)` method is
added to `ITraversalRepository`. The Neo4j implementation uses a bidirectional
match pattern `(a)-[r:TYPES]-(b)` to find edges of conflicting types between
the same node pair regardless of direction. The cached repository delegates
pass-through (D4 from Phase 8b).

### D8: Pipeline Health — pendingReviewCount

`IPipelineHealthResult` gains a `pendingReviewCount` field. The health endpoint
now reports pending review mutations alongside committed, rejected, and stuck
counts, giving operators visibility into the escalation backlog.

### D9: createMutationHints — PENDING_REVIEW State Actions

When a mutation is in `pending_review` state, `createMutationHints()` returns
three suggested actions: `approve_escalated_mutation`,
`reject_escalated_mutation`, and `get_mutation_audit_log`. This gives agents
and admin UIs actionable next steps for escalated mutations.

## Consequences

### Positive

- **Formal correctness**: The CKG is now protected against semantically
  contradictory edge combinations
- **Human-in-the-loop**: Ontological judgment calls are escalated rather than
  auto-rejected, preserving agent intent
- **Pedagogical signal**: PKG advisory warnings surface conceptual modelling
  misconceptions as learning opportunities
- **Extensible**: New conflict pairs can be added to the frozen table without
  structural changes to the pipeline
- **Observable**: Structured logging + domain events + pipeline health metrics
  provide full visibility into escalation flow

### Negative

- **Review bottleneck**: PENDING_REVIEW mutations require human action; if
  reviewers are slow, the escalation queue grows. Mitigation: the health
  endpoint reports pending review count for monitoring
- **Additional state complexity**: The typestate machine grows from 8 to 9
  states. Mitigated by reusing the existing typestate infrastructure
- **Graph query overhead**: The `findConflictingEdges` call adds a Neo4j round
  trip per ADD_EDGE operation during validation. Mitigated by only querying for
  edge types that appear in the conflict pairs table

## Files Modified

### Packages
- `packages/types/src/enums/index.ts` — PENDING_REVIEW in MutationState
- `packages/events/src/knowledge-graph/knowledge-graph.events.ts` — CKG_MUTATION_ESCALATED event

### Domain Layer
- `ckg-validation-stages.ts` — OntologicalConsistencyStage + conflict pairs table
- `ckg-typestate.ts` — pending_review state transitions
- `ckg-mutation-pipeline.ts` — 3-way validation outcome, approve/reject, escalation event
- `ckg-mutation-dsl.ts` — pending_review in MutationFilterSchema
- `knowledge-graph.service.ts` — approve/reject interface methods + pendingReviewCount
- `knowledge-graph.service.impl.ts` — approve/reject implementations + PKG advisory
- `graph.repository.ts` — findConflictingEdges on ITraversalRepository
- `domain-events.ts` — re-exports for escalated event types
- `index.ts` — exports for OntologicalConsistencyStage

### Infrastructure Layer
- `neo4j-graph.repository.ts` — findConflictingEdges Cypher implementation
- `cached-graph.repository.ts` — findConflictingEdges pass-through

### API Layer
- `ckg-mutation.schemas.ts` — ApproveMutationRequestSchema, RejectMutationRequestSchema
- `ckg-mutation.routes.ts` — POST approve/reject route handlers

### Bootstrap
- `index.ts` — Updated wiring comment for OntologicalConsistencyStage registration
