# Phase 8e: Ontological Guardrails

## Objective

Extend the CKG mutation validation pipeline with an **Ontological Consistency**
stage that detects and escalates conflicts between hierarchical edge types (IS_A
and PART_OF) on the same node pair — enforcing the principle that taxonomic
classification ("is a kind of") and mereological composition ("is a component
of") are semantically incompatible relationships when applied to the same pair
of nodes.

Unlike schema or structural validation errors that warrant immediate rejection,
ontological conflicts are **nuanced cases** that require human or agent
judgement. This phase therefore introduces an **escalation mechanism** rather
than automatic rejection: the mutation is held, the proposer is notified, and
the conflict is surfaced with enough context to make an informed decision.

For PKG (Personal Knowledge Graphs), the same check produces **advisory
warnings** that do not block mutation — pedagogically, a learner's misconception
about whether "X is a kind of Y" vs "X is part of Y" is itself a valuable
signal.

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

## Context & Motivation

### The ontological problem

The CKG uses 17 epistemological edge types organized into 6 ontological
categories (see `EdgeOntologicalCategory`). Several pairs of edge types within
the same category — or across categories — can create ontological
inconsistencies when applied to the same node pair. The most critical conflict
is between the two **mereological** edge types and the **taxonomic** edge type
`IS_A`:

| Edge type          | Ontological frame           | Category     | Semantics                                         | Example                                    |
| ------------------ | --------------------------- | ------------ | ------------------------------------------------- | ------------------------------------------ |
| **IS_A**           | Taxonomic (classification)  | taxonomic    | "X _is a kind of_ Y" — Aristotelian genus–species | `Polynomial IS_A Algebraic_Expression`     |
| **PART_OF**        | Mereological (composition)  | mereological | "X _is a component within_ Y" — whole–part        | `Derivative PART_OF Calculus`              |
| **CONSTITUTED_BY** | Mereological (constitution) | mereological | "X _is made of_ Y" — material constitution        | `Algorithm CONSTITUTED_BY Data_Structures` |

Additional ontological conflict pairs that should be detected:

| Pair                          | Why conflicting on same (A, B)                                |
| ----------------------------- | ------------------------------------------------------------- |
| IS_A + PART_OF                | A can't be a _kind of_ B and a _part of_ B simultaneously     |
| IS_A + CONSTITUTED_BY         | A can't be a _kind of_ B and _constituted by_ B               |
| EQUIVALENT_TO + IS_A          | If A ≡ B, then A is not a _subtype_ of B (they are identical) |
| EQUIVALENT_TO + CONTRADICTS   | A can't be equivalent to and contradict B                     |
| EQUIVALENT_TO + DISJOINT_WITH | A can't be equivalent to and disjoint from B                  |
| ENTAILS + CONTRADICTS         | A can't imply B and contradict B                              |
| DISJOINT_WITH + IS_A          | A can't be disjoint from B and a subtype of B                 |
| CAUSES + CONTRADICTS          | If A causes B, they can't be in contradiction (contextual)    |
| DEPENDS_ON + DISJOINT_WITH    | A can't depend on B if they are mutually exclusive            |
| PREREQUISITE + EQUIVALENT_TO  | If A ≡ B, neither is a prerequisite of the other              |

When both IS_A and PART_OF exist between the **same ordered pair (A, B)**, the
graph simultaneously asserts:

- "A is a kind of B" (A inherits B's properties)
- "A is a component of B" (A is structurally contained in B)

These are **incompatible in most educational ontologies**. If
`Polynomial IS_A Algebraic_Expression`, then Polynomial _inherits_ the defining
properties of Algebraic*Expression as a specialisation. But if
`Polynomial PART_OF Algebraic_Expression`, then Polynomial is a \_component
piece* of something called Algebraic_Expression — which would mean
Algebraic_Expression is a composite structure that has Polynomial as one of its
parts.

The same entity cannot simultaneously _be a kind of_ and _be a part of_ the same
other entity without conflating classification with composition — a well-known
ontological anti-pattern.

### Current pipeline gap

The existing CKG mutation validation pipeline (Phase 6, ADR-005) performs:

| Stage               | Order | What it checks                                                     |
| ------------------- | ----- | ------------------------------------------------------------------ |
| SchemaValidation    | 100   | DSL syntax, operation types, field types                           |
| StructuralIntegrity | 200   | Edge policies (node type compat, acyclicity, weight), orphan edges |
| ConflictDetection   | 300   | Overlap with in-flight mutations on same entities                  |
| EvidenceSufficiency | 400   | Promotion band thresholds for aggregation-originated mutations     |

**None of these stages** check whether adding a hierarchical edge (IS*A or
PART_OF) would create a conflict with an existing hierarchical edge of the
\_other* type on the same node pair. The
`StructuralIntegrityStage.validateAddEdge()` method checks edge type policies
(node type compatibility, acyclicity, weight limits) against the individual
`EDGE_TYPE_POLICIES` configuration but does not query the graph for pre-existing
edges between the same source and target.

### Why escalation, not rejection

Automatic rejection (severity `'error'`) would be too blunt:

1. **Edge cases exist.** In some specialised domains (e.g., biological taxonomy
   vs organ systems), the same pair might legitimately carry both relationships
   when viewed from different ontological frames. A curator should evaluate
   these.

2. **Agent reasoning should be auditable.** When an agent proposes a mutation
   that creates a conflict, the system should record _why_ the agent thought the
   relationship was valid. Silently rejecting loses this signal.

3. **Admin proposers need feedback.** ADR-008 established that admin users can
   propose CKG mutations via `ProposerId = AgentId | UserId`. When an admin's
   mutation triggers a conflict, they should be informed and given the
   opportunity to override with justification — not face an opaque rejection.

### Downstream impacts: metrics

The `metric-computation-context.ts` already treats IS*A and PART_OF as
equivalent for parent map and sibling group computation (via the
`HIERARCHICAL_EDGE_TYPES` set). A node with \_both* edges to the same parent
would be double-counted in `computeParentMap()` and `computeSiblingGroups()`,
producing inflated metrics. The guardrail prevents this at the source.

---

## Specification

### 1. New Validation Stage: `OntologicalConsistencyStage`

A new `IValidationStage` implementation inserted between StructuralIntegrity
(200) and ConflictDetection (300).

```
Stage Name:  ontological_consistency
Order:       250
```

#### 1.1 Trigger condition

For every `add_edge` operation in the mutation where `edgeType` is a member of
the **hierarchical edge type set** `{ IS_A, PART_OF }`:

1. Query the CKG for existing edges between the **same ordered pair**
   `(sourceNodeId, targetNodeId)` whose `edgeType` is the _other_ hierarchical
   type.

2. Also check the **reverse pair** `(targetNodeId, sourceNodeId)` — because
   `A IS_A B` + `B PART_OF A` (reverse direction) is equally problematic (it
   implies A is a kind of B, and B is a component of A).

3. Also check **within the same mutation's operations** — if the mutation
   proposes both `add_edge IS_A (A, B)` and `add_edge PART_OF (A, B)`, the
   conflict is internal.

#### 1.2 Violation output

When a conflict is detected, produce a violation with:

```typescript
{
  code: 'HIERARCHICAL_EDGE_CONFLICT',
  message: `Adding ${proposedEdgeType} edge between '${sourceNodeId}' → ` +
    `'${targetNodeId}' conflicts with existing ${existingEdgeType} edge ` +
    `'${existingEdgeId}'. IS_A (taxonomic) and PART_OF (mereological) ` +
    `relationships on the same node pair indicate an ontological ` +
    `inconsistency. This mutation requires human review.`,
  severity: 'warning',    // ← warning, not error: does NOT auto-reject
  affectedOperationIndex: i,
  metadata: {
    conflictType: 'hierarchical_edge_conflict',
    proposedEdgeType,                  // 'is_a' | 'part_of'
    existingEdgeType,                  // 'part_of' | 'is_a'
    existingEdgeId,                    // EdgeId of the conflicting edge
    sourceNodeId,
    targetNodeId,
    direction: 'same' | 'reverse',    // same = same (A,B); reverse = (B,A)
    sourceLabel: sourceNode.label,     // human-readable node labels
    targetLabel: targetNode.label,
    requiresEscalation: true,         // flag for pipeline escalation logic
  },
}
```

The `requiresEscalation: true` flag in metadata is the signal consumed by the
pipeline's escalation logic (see §2).

#### 1.3 Intra-mutation conflict detection

Before querying Neo4j, scan the mutation's own operation list for pairs of
`add_edge` operations that would create the conflict. This catches cases where a
single mutation introduces both edges simultaneously.

```
For all pairs (op_i, op_j) where i < j:
  If op_i.type === 'add_edge' && op_j.type === 'add_edge'
  && one has edgeType IS_A and the other has edgeType PART_OF
  && they share the same (sourceNodeId, targetNodeId) OR reversed:
    → produce HIERARCHICAL_EDGE_CONFLICT violation for op_j
```

#### 1.4 Neo4j query

```cypher
MATCH (source)-[existing]->(target)
WHERE source.nodeId = $sourceNodeId
  AND target.nodeId = $targetNodeId
  AND type(existing) IN ['IS_A', 'PART_OF']
  AND type(existing) <> $proposedEdgeType
RETURN existing.edgeId AS edgeId, type(existing) AS edgeType

UNION

MATCH (target_rev)-[existing_rev]->(source_rev)
WHERE target_rev.nodeId = $sourceNodeId
  AND source_rev.nodeId = $targetNodeId
  AND type(existing_rev) IN ['IS_A', 'PART_OF']
RETURN existing_rev.edgeId AS edgeId, type(existing_rev) AS edgeType
```

This should be added to the `IGraphRepository` interface as a dedicated method
(e.g.,
`findConflictingHierarchicalEdges(sourceNodeId, targetNodeId, proposedEdgeType)`)
to keep the validation stage independent of Cypher.

#### 1.5 Graph repository method

```typescript
interface IGraphRepository {
  // ... existing methods ...

  /**
   * Find existing hierarchical edges (IS_A, PART_OF) between two nodes
   * that would conflict with a proposed hierarchical edge of a different type.
   *
   * Checks both directions: (source → target) and (target → source).
   *
   * @param sourceNodeId The source node of the proposed edge
   * @param targetNodeId The target node of the proposed edge
   * @param proposedEdgeType The hierarchical edge type being proposed
   * @returns Conflicting edges with their type and direction
   */
  findConflictingHierarchicalEdges(
    sourceNodeId: NodeId,
    targetNodeId: NodeId,
    proposedEdgeType: GraphEdgeType
  ): Promise<
    Array<{
      edgeId: EdgeId;
      edgeType: GraphEdgeType;
      direction: 'same' | 'reverse';
    }>
  >;
}
```

---

### 2. Pipeline Escalation Mechanism

#### 2.1 Escalation semantics

When the `OntologicalConsistencyStage` produces one or more violations with
`metadata.requiresEscalation === true`, the pipeline should NOT auto-reject
(since severity is `'warning'`) but should **hold the mutation for review**:

1. Transition the mutation to the new **`pending_review`** state (see §2.2).
2. Publish a **`CKG_MUTATION_ESCALATED`** event (see §2.3).
3. Record the escalation reason in the audit log.
4. Include escalation details in the `agentHints` of related API responses.

#### 2.2 New mutation state: `pending_review`

Add `pending_review` to the `MutationState` enum and the typestate machine:

```
Current transitions:
  proposed   → validating
  validating → validated | rejected
  validated  → proving
  proving    → proven
  proven     → committing
  committing → committed | rejected

New transitions (additive):
  validating → pending_review          (escalation from validation)
  pending_review → validated           (reviewer approves)
  pending_review → rejected            (reviewer rejects)
```

This is a **minimally invasive** addition: `pending_review` is a new
non-terminal, non-initial state that sits between `validating` and `validated`.
Mutations not requiring review skip it entirely (validating → validated as
before). Only mutations with escalation violations enter this state.

**Cancellation**: `pending_review` should be added to the `CANCELLABLE_STATES`
set — a proposer should be able to withdraw a mutation awaiting review.

#### 2.3 New domain event: `CKG_MUTATION_ESCALATED`

```typescript
// Add to KnowledgeGraphEventType enum
CKG_MUTATION_ESCALATED = 'knowledge-graph.ckg-mutation.escalated';
```

**Event payload:**

```typescript
{
  mutationId: MutationId,
  proposedBy: ProposerId,
  escalationReason: 'hierarchical_edge_conflict',
  conflicts: Array<{
    operationIndex: number,
    proposedEdgeType: GraphEdgeType,
    existingEdgeType: GraphEdgeType,
    existingEdgeId: EdgeId,
    sourceNodeId: NodeId,
    targetNodeId: NodeId,
    sourceLabel: string,
    targetLabel: string,
    direction: 'same' | 'reverse',
  }>,
  /** How the proposer can resolve: approve, reject, or modify */
  availableActions: ['approve', 'reject', 'modify'],
}
```

#### 2.4 Escalation routing by proposer type

The system must handle escalation differently based on who proposed the
mutation:

| Proposer type                                           | Detection                         | Escalation behaviour                                                                                                                                                                                                                                             |
| ------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Admin user** (`ProposerId.isUser()`)                  | `proposedBy` starts with `user_`  | The admin should receive actionable feedback. Immediate channel: the `proposeMutation` REST response already returns `agentHints` — the escalation details should be surfaced there. Long-term channel: push notification (see ADR-009, tech debt).              |
| **Agent** (`ProposerId.isAgent()`)                      | `proposedBy` starts with `agent_` | The agent's reasoning for the mutation should be preserved in the audit log. The `rationale` field already captures this. The `CKG_MUTATION_ESCALATED` event should be published so that monitoring systems can flag agent-initiated conflicts for human review. |
| **Aggregation pipeline** (`agent_aggregation-pipeline`) | Specific agent ID                 | Same as agent, but the evidence context from the `IAggregationEvidenceRepository` should be attached to the escalation metadata for richer review context.                                                                                                       |

#### 2.5 Review API endpoints

Add two endpoints for resolving escalated mutations:

```
POST /api/v1/ckg/mutations/:mutationId/approve
  Authorization: admin role required
  Body: { justification: string }
  Effect: pending_review → validated → continues pipeline

POST /api/v1/ckg/mutations/:mutationId/reject
  Authorization: admin role required
  Body: { reason: string }
  Effect: pending_review → rejected
```

The `approve` action transitions the mutation back into the pipeline
(pending_review → validated), and the normal proof → commit flow continues. The
`justification` is recorded in the audit log as evidence that a human reviewed
and accepted the ontological conflict.

The `reject` action terminates the mutation (pending_review → rejected) with the
reviewer's reason in the audit log.

#### 2.6 Modification flow (future enhancement)

A third action — `modify` — would allow the reviewer to amend the mutation's
operations before re-entering validation. This is a more complex feature that
should be deferred:

- Requires mutation operation diffing
- Needs re-validation from stage 1 (schema)
- Audit trail must show before/after

For Phase 8e, the reviewer who wants to modify should `reject` the current
mutation and `propose` a corrected one. The `retryMutation` endpoint already
supports this pattern.

---

### 3. Pipeline Integration

#### 3.1 Validation stage registration

The `OntologicalConsistencyStage` is registered in the validation pipeline
alongside existing stages. The `CkgValidationPipeline` already accepts stages as
constructor dependencies — no pipeline modifications needed:

```typescript
// In the DI/composition root:
const ontologicalConsistencyStage = new OntologicalConsistencyStage(
  graphRepository
);

const validationPipeline = new CkgValidationPipeline([
  new SchemaValidationStage(), // order 100
  new StructuralIntegrityStage(graphRepository), // order 200
  ontologicalConsistencyStage, // order 250 ← NEW
  new ConflictDetectionStage(mutationRepository), // order 300
  new EvidenceSufficiencyStage(evidenceRepository), // order 400
]);
```

#### 3.2 Escalation detection in `runValidationStage()`

After all stages complete, the pipeline checks whether any violations carry
`metadata.requiresEscalation === true`. If so, instead of transitioning to
`validated`, it transitions to `pending_review`:

```typescript
// In CkgMutationPipeline.runValidationStage()

const hasEscalations = validationResult.stageResults.some((stage) =>
  stage.violations.some((v) => v.metadata?.requiresEscalation === true)
);

if (hasErrors) {
  // → REJECTED (existing behaviour)
} else if (hasEscalations) {
  // → PENDING_REVIEW (new behaviour)
  mutation = await this.transitionState(
    mutation,
    'pending_review',
    'system',
    'Validation passed but ontological conflicts require human review',
    context,
    { escalations: escalationViolations }
  );
  await this.publishEscalationEvent(mutation, escalationViolations, context);
} else {
  // → VALIDATED (existing behaviour)
}
```

#### 3.3 Agent hints for escalated mutations

When a mutation is in `pending_review` state, the `getMutation` response should
include `agentHints` describing the conflict:

```typescript
agentHints: {
  escalation: {
    reason: 'hierarchical_edge_conflict',
    message: 'This mutation proposes an IS_A edge between nodes that already ' +
      'have a PART_OF relationship. This is an ontological conflict that ' +
      'requires review. An admin user can approve or reject this mutation.',
    conflicts: [...],
    actions: {
      approve: `POST /api/v1/ckg/mutations/${mutationId}/approve`,
      reject: `POST /api/v1/ckg/mutations/${mutationId}/reject`,
    },
  },
}
```

---

### 4. PKG Behaviour (Advisory Mode)

For Personal Knowledge Graphs, the same ontological check runs in **advisory
mode** — it produces warnings that are surfaced to the learner/agent but do NOT
block the mutation or require escalation:

- The PKG does not go through the CKG mutation pipeline (PKG writes are direct
  CRUD via `KnowledgeGraphService.addEdge()`).
- Therefore the `OntologicalConsistencyStage` does not run for PKG writes.
- Instead, a **lightweight advisory check** should be added to the
  `KnowledgeGraphService.addEdge()` method for PKG edge creation:

```typescript
// In KnowledgeGraphService.addEdge() — PKG path only
if (HIERARCHICAL_EDGE_TYPES.has(edgeType)) {
  const conflicts = await this.graphRepository.findConflictingHierarchicalEdges(
    sourceNodeId,
    targetNodeId,
    edgeType
  );
  if (conflicts.length > 0) {
    agentHints.ontologicalWarning = {
      message:
        `This ${edgeType} edge conflicts with existing ` +
        `${conflicts[0].edgeType} edge. Consider whether this concept ` +
        `'is a kind of' or 'is part of' the target — these are different ` +
        `relationships.`,
      conflicts,
      pedagogicalNote:
        'Distinguishing taxonomic (IS_A) from mereological ' +
        '(PART_OF) relationships is a key skill in conceptual modelling.',
    };
  }
}
```

This is valuable because:

1. **Pedagogical signal**: If a learner incorrectly classifies a PART_OF as
   IS_A, the system can flag this as a learning opportunity.
2. **SCE metric accuracy**: The Sibling Confusion Entropy metric
   (`computeSiblingGroups()`) treats both edge types as equivalent parents —
   mixed hierarchical types on the same pair will produce misleading sibling
   groups.
3. **PKG→CKG aggregation**: If many PKGs exhibit the same conflict, the
   aggregation pipeline should surface this pattern rather than propagating it
   to the CKG.

---

### 5. Logging & Observability

#### 5.1 Structured logging for agent-proposed conflicts

When an agent proposes a mutation that triggers escalation, the agent's
`rationale` field and the mutation's operation details must be logged at `INFO`
level with structured fields:

```typescript
this.logger.info(
  {
    mutationId: mutation.mutationId,
    proposedBy: mutation.proposedBy,
    proposerType: ProposerId.isAgent(mutation.proposedBy) ? 'agent' : 'user',
    escalationReason: 'hierarchical_edge_conflict',
    conflicts: escalationViolations.map((v) => ({
      operationIndex: v.affectedOperationIndex,
      proposedEdgeType: v.metadata.proposedEdgeType,
      existingEdgeType: v.metadata.existingEdgeType,
      sourceNodeId: v.metadata.sourceNodeId,
      targetNodeId: v.metadata.targetNodeId,
    })),
    agentRationale: mutation.rationale,
  },
  'CKG mutation escalated: hierarchical edge conflict requires review'
);
```

This ensures that **agent reasoning is visible in the logs** without requiring a
push notification mechanism (which is tracked as tech debt in ADR-009).

#### 5.2 Audit log entries

The following audit entries are produced:

| Event               | `fromState`      | `toState`        | `performedBy`    | Context                                            |
| ------------------- | ---------------- | ---------------- | ---------------- | -------------------------------------------------- |
| Escalation detected | `validating`     | `pending_review` | `system`         | Full violation details including conflict metadata |
| Review: approved    | `pending_review` | `validated`      | `user_{adminId}` | Reviewer's justification                           |
| Review: rejected    | `pending_review` | `rejected`       | `user_{adminId}` | Reviewer's rejection reason                        |

#### 5.3 Metrics

Export Prometheus/OpenTelemetry counters:

- `ckg_mutation_escalations_total{reason="hierarchical_edge_conflict"}` — total
  escalations
- `ckg_mutation_review_duration_seconds` — time spent in `pending_review` state
- `ckg_mutation_review_outcome{outcome="approved|rejected"}` — review decisions
- `pkg_ontological_warnings_total` — advisory warnings in PKG path

---

### 6. Test Plan

#### 6.1 Unit tests — `OntologicalConsistencyStage`

| Test case                                         | Setup                                                                   | Expected                                                   |
| ------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| No hierarchical edges in mutation                 | Mutation with `add_edge RELATED_TO`                                     | Pass, 0 violations                                         |
| IS_A proposed, no PART_OF exists                  | Mutation with `add_edge IS_A (A, B)`, no existing edges                 | Pass, 0 violations                                         |
| IS_A proposed, PART_OF exists (same direction)    | Existing `PART_OF (A, B)`, propose `IS_A (A, B)`                        | Warning: `HIERARCHICAL_EDGE_CONFLICT`, direction=`same`    |
| PART_OF proposed, IS_A exists (same direction)    | Existing `IS_A (A, B)`, propose `PART_OF (A, B)`                        | Warning: `HIERARCHICAL_EDGE_CONFLICT`, direction=`same`    |
| IS_A proposed, PART_OF exists (reverse direction) | Existing `PART_OF (B, A)`, propose `IS_A (A, B)`                        | Warning: `HIERARCHICAL_EDGE_CONFLICT`, direction=`reverse` |
| Intra-mutation conflict                           | Mutation with both `add_edge IS_A (A, B)` and `add_edge PART_OF (A, B)` | Warning on op_j                                            |
| Multiple conflicts in one mutation                | Multiple conflicting pairs                                              | One violation per conflict                                 |
| Non-hierarchical edges between same pair          | Existing `RELATED_TO (A, B)`, propose `IS_A (A, B)`                     | Pass, 0 violations (RELATED_TO is not hierarchical)        |

#### 6.2 Integration tests — Pipeline escalation

| Test case                                                              | Expected                                                                    |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Mutation with escalation passes validation but enters `pending_review` | State = `pending_review`, `CKG_MUTATION_ESCALATED` event published          |
| Admin approves escalated mutation                                      | State transitions: `pending_review` → `validated` → ... → `committed`       |
| Admin rejects escalated mutation                                       | State = `rejected`, audit log contains rejection reason                     |
| Mutation without escalation bypasses `pending_review`                  | State transitions directly: `validating` → `validated` (existing behaviour) |
| Agent-proposed escalation has rationale in audit log                   | Audit entry context contains `agentRationale` field                         |

#### 6.3 Integration tests — PKG advisory warnings

| Test case                                  | Expected                                              |
| ------------------------------------------ | ----------------------------------------------------- |
| PKG `addEdge IS_A` with existing `PART_OF` | Edge created, `agentHints.ontologicalWarning` present |
| PKG `addEdge PART_OF` with no conflict     | Edge created, no warning                              |

---

### 7. Implementation Order

| Step | Description                                                            | Files affected                         |
| ---- | ---------------------------------------------------------------------- | -------------------------------------- |
| 1    | Add `findConflictingHierarchicalEdges` to `IGraphRepository` interface | `graph.repository.ts`                  |
| 2    | Implement in Neo4j repository                                          | `neo4j-graph.repository.ts`            |
| 3    | Implement `OntologicalConsistencyStage`                                | `ckg-validation-stages.ts` (new class) |
| 4    | Add `pending_review` to `MutationState`                                | `@noema/types`, Prisma schema          |
| 5    | Update typestate machine transitions                                   | `ckg-typestate.ts`                     |
| 6    | Add `CKG_MUTATION_ESCALATED` event type                                | `domain-events.ts`, `@noema/events`    |
| 7    | Update `runValidationStage()` with escalation logic                    | `ckg-mutation-pipeline.ts`             |
| 8    | Add review endpoints (`approve`, `reject`)                             | `ckg-mutation.routes.ts`, new schemas  |
| 9    | Register new stage in DI/composition root                              | Service bootstrap                      |
| 10   | Add PKG advisory check                                                 | `knowledge-graph.service.ts`           |
| 11   | Unit + integration tests                                               | `*.test.ts` files                      |
| 12   | Update OpenAPI spec                                                    | API schemas                            |
| 13   | Observability (metrics, dashboards)                                    | Metrics registration                   |

---

### 8. Cross-Cutting Concerns

#### 8.1 Proposer notification (tech debt — ADR-009)

The current CKG mutation pipeline has **no push notification mechanism** for
informing proposers about mutation outcomes. When a mutation is rejected or
escalated:

- The state change is recorded in the audit log ✓
- A domain event is published to the event bus ✓
- BUT: the proposer (admin user or agent) must **poll**
  `GET /api/v1/ckg/mutations/:id` to discover the outcome ✗

For Phase 8e, escalation feedback is delivered through:

1. **REST response `agentHints`**: The `proposeMutation` response already
   includes `agentHints`. If the mutation is synchronously escalated (within the
   same request cycle), the hints will contain the escalation details. However,
   due to the fire-and-forget async pipeline (ADR-005 D3), the initial response
   returns before validation completes, so hints will only be available on
   subsequent `getMutation` calls.

2. **Event bus**: `CKG_MUTATION_ESCALATED` events can be consumed by the
   notification-service (when implemented) to push alerts to admin users.

3. **Structured logging**: Agent-initiated escalations are logged at INFO level
   with full conflict context and the agent's rationale.

The **full proposer notification mechanism** (WebSocket push, in-app
notifications, or webhook callbacks) is documented as technical debt in
**ADR-009** (see companion ADR in
`services/knowledge-graph-service/docs/ architecture/decisions/ADR-009-ontological-guardrails-and-proposer-notification.md`).

#### 8.2 Interaction with ConflictDetection stage (order 300)

The `OntologicalConsistencyStage` (order 250) runs _before_ ConflictDetection
(order 300). This is intentional:

- Ontological conflicts are **semantic** (same pair, wrong relationship type)
- Concurrent mutation conflicts are **temporal** (same entities, different
  mutations in flight)

A mutation could trigger both. The pipeline should surface both violation types
independently — ontological conflicts are escalated for review, while concurrent
conflicts are logged as warnings.

#### 8.3 Interaction with metric computation

After the guardrail is in place, `computeParentMap()` and
`computeSiblingGroups()` in `metric-computation-context.ts` should be updated to
**detect and report** (but not crash on) nodes that still have dual hierarchical
edges — e.g., PKG nodes where the warning was surfaced but the learner chose to
proceed. This is a defensive measure, not a blocking change.

#### 8.4 MCP tool surface (Phase 9)

Expose the escalation review actions as MCP tools for agents:

```
kg_review_escalated_mutation(mutationId, action: 'approve'|'reject', justification)
kg_list_escalated_mutations(limit?, domain?)
```

This allows governance agents to participate in the review workflow
programmatically.

---

### 9. Design Decision Summary

| Decision                   | Choice                                                          | Rationale                                                                                  |
| -------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Violation severity         | `warning` (not `error`)                                         | Avoids auto-rejection; enables escalation flow                                             |
| Pipeline ordering          | Order 250 (between Structural Integrity and Conflict Detection) | Ontological checks depend on structural validity but are independent of temporal conflicts |
| New state `pending_review` | Added to typestate machine                                      | Clean separation: mutations needing review are visibly distinct from validated or rejected |
| Escalation event           | `CKG_MUTATION_ESCALATED`                                        | Enables downstream consumers (notification-service, dashboards) to react                   |
| Review API                 | Separate `approve`/`reject` endpoints                           | Follows REST resource pattern; admin-only                                                  |
| PKG behaviour              | Advisory warning in `agentHints`                                | Pedagogically valuable; does not block learner's PKG                                       |
| Reverse direction check    | Yes, check both (A,B) and (B,A)                                 | `A IS_A B` + `B PART_OF A` is equally problematic                                          |
| Proposer notification      | Tech debt (ADR-009)                                             | Full push notification infrastructure is out of scope for 8e                               |
