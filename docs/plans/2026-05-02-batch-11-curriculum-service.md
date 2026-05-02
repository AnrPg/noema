# Batch 11 — Curriculum Service Implementation Plan

**Status:** Draft **Date:** 2026-05-02 **Scope:** New
`@noema/curriculum-service` introduced by Batch 11 of
`IMPLEMENTATION_PLAN_FINAL.md` **Depends on:**

- Batch 4 (session-service Step loop, ADR-026)
- Batch 5 (metacognition Evaluation/Trigger loop, ADR-027)
- Batch 6 (concept-first scheduler, ADR-028)
- Batch 8 (pedagogy-guardian-service, ADR-033)
- Batch 9 (session-service strategy replanning, ADR-034)
- Batch 10 (step-focused web cutover, ADR-035)

---

## 1. Purpose & Service Boundary

The curriculum-service owns **durable, user-vault learning paths** as versioned
DAGs of concepts. A curriculum is the agreed long-run plan for what a learner
will learn and in what order; sessions advance against the curriculum's
traversal frontier.

The curriculum DAG is **a separate persisted entity from the CKG/PKG**. It
references CKG concept IDs as external anchors but is never derived from or
stored inside the knowledge-graph-service. Curriculum nodes can also carry
agent-proposed concepts that do not yet exist in the CKG, surfaced as concept
proposals for KG ingestion.

This service is created because:

- Curricula outlive sessions; session-service owns the per-session aggregate
  only.
- The Curriculum Design Agent produces multi-month artifacts that must be
  persisted, versioned, and revised independently of any single session.
- Cross-session evidence accumulation for revision proposals belongs neither in
  session-service (per-session aggregate) nor in metacognition-service
  (per-evaluation facts).
- The vault and revision-proposal UX surfaces deserve a dedicated API.

The curriculum-service does not own:

- The CKG/PKG structural graph (knowledge-graph-service)
- ConceptScheduleState, FSRS stability, due queues (scheduler-service)
- Cards/Activities/Steps content payloads (content-service)
- LessonPlans or Steps (session-service)
- Evaluation persistence or trigger emission (metacognition-service)

---

## 2. Core Domain Model

### 2.1 Branded IDs and Enums (added to `@noema/types`)

```typescript
type CurriculumId = Brand<string, 'CurriculumId'>;
type CurriculumVersionId = Brand<string, 'CurriculumVersionId'>;
type CurriculumNodeId = Brand<string, 'CurriculumNodeId'>;
type CurriculumEdgeId = Brand<string, 'CurriculumEdgeId'>;
type RevisionProposalId = Brand<string, 'RevisionProposalId'>;
type RevisionChangeId = Brand<string, 'RevisionChangeId'>;

enum CurriculumState {
  Draft,
  Finalized,
  Archived,
}
enum CurriculumVersionState {
  Draft,
  Validated,
  Active,
  Superseded,
}
enum CurriculumNodeRuntimeState {
  Locked, // prerequisites unmet
  Unlocked, // ready for traversal but not yet touched
  InProgress, // touched in ≥1 session, not yet completed
  Completed, // mastery + curriculum-evidence requirements met
  Blocked, // explicitly blocked by a pending revision
  Skipped, // user-waived
}
enum CurriculumEdgeType {
  Prerequisite, // hard: target locked until source completed
  RecommendedBefore, // soft: ordering hint, not a lock
  Reinforces, // parallel: completion of either helps the other
}
enum CurriculumOriginMode {
  AgentGenerated,
  UserAuthored,
  DocumentDerived,
}
enum CurriculumRevisionReason {
  PrerequisiteGap,
  Misconception,
  Confusion,
  StructuralInvalidation,
  UserEdit,
  ZeroRetention,
}
enum RevisionChangeKind {
  InsertPrerequisite,
  Reorder,
  AddNode,
  RemoveEdge,
  RetargetEdge,
  RelabelNode,
  AdjustThreshold,
  AddRemediationPath,
  SplitNode,
  FlagForSkip,
}
enum RevisionChangeState {
  Pending,
  Approved,
  Rejected,
  Applied,
}
```

### 2.2 Persistent Entities (Prisma schema, curriculum-service-owned DB)

```prisma
model Curriculum {
  id              String              @id
  userId          String
  title           String
  description     String?
  goal            String?             // free-form learner intention
  domain          String?             // optional taxonomy tag (e.g. "math", "language")
  originMode      CurriculumOriginMode
  state           CurriculumState     @default(Draft)
  activeVersionId String?             @unique
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
  versions        CurriculumVersion[]
  progress        CurriculumProgress[]
  proposals       CurriculumRevisionProposal[]
  @@index([userId, state])
}

model CurriculumVersion {
  id                 String                  @id
  curriculumId       String
  versionNumber      Int                     // monotonic, scoped to curriculumId
  state              CurriculumVersionState  @default(Draft)
  parentVersionId    String?                 // version this was revised from
  agentRunId         String?                 // ContentGenerationAgent / CurriculumDesignAgent run trace
  guardianValidationId String?               // pedagogy-guardian-service decision id
  createdAt          DateTime                @default(now())
  finalizedAt        DateTime?
  supersededAt       DateTime?
  nodes              CurriculumNode[]
  edges              CurriculumEdge[]
  @@unique([curriculumId, versionNumber])
}

model CurriculumNode {
  id                  String                  @id
  curriculumVersionId String
  ckgConceptId        String?                 // null if proposed concept not yet in CKG
  proposedConcept     Json?                   // concept proposal payload pending KG acceptance
  label               String
  learningObjective   String?
  masteryThreshold    Float                   // FSRS stability threshold for completion
  estimatedSessions   Int
  traversalWeight     Float                   @default(1.0)
  metadata            Json?
  // structural position (stable across versions where possible)
  stableNodeKey       String                  // identity that survives revisions
  @@index([curriculumVersionId])
  @@index([stableNodeKey])
}

model CurriculumEdge {
  id                  String                  @id
  curriculumVersionId String
  fromNodeId          String
  toNodeId            String
  type                CurriculumEdgeType
  rationale           String?                 // why agent placed this edge
  orderingWeight      Float                   @default(0)
  @@index([curriculumVersionId])
}

model CurriculumProgress {
  id                String                    @id
  curriculumId      String
  userId            String
  stableNodeKey     String                    // joins to whichever version is active
  runtimeState      CurriculumNodeRuntimeState
  firstTouchedAt    DateTime?
  completedAt       DateTime?
  lastSessionId     String?
  evaluationCount   Int                       @default(0)
  correctStreak     Int                       @default(0)
  stabilitySnapshot Float?                    // last read from scheduler
  @@unique([curriculumId, userId, stableNodeKey])
  @@index([userId, runtimeState])
}

model CurriculumRevisionProposal {
  id              String                       @id
  curriculumId    String
  proposedFromVersionId String
  reason          CurriculumRevisionReason
  evidence        Json                         // structured pointer into accumulated evidence
  rationale       String                       // agent's plain-language explanation
  expiresAt       DateTime
  createdAt       DateTime                     @default(now())
  appliedVersionId String?                     // version produced if any approved changes apply
  changes         RevisionChange[]
  @@index([curriculumId])
}

model RevisionChange {
  id          String                @id
  proposalId  String
  kind        RevisionChangeKind
  payload     Json                  // discriminated by kind, validated server-side
  rationale   String?
  state       RevisionChangeState   @default(Pending)
  decidedAt   DateTime?
  @@index([proposalId])
}

model RealignmentEvidence {
  id                  String                   @id
  curriculumId        String
  stableNodeKey       String
  triggerType         String                   // mirrors metacognition trigger types
  sessionIds          String[]
  accumulatedWeight   Float
  threshold           Float
  firstSeenAt         DateTime                 @default(now())
  lastSeenAt          DateTime                 @updatedAt
  consumedByProposalId String?
  @@unique([curriculumId, stableNodeKey, triggerType])
}
```

### 2.3 Stable Node Identity Across Versions

The `stableNodeKey` is the canonical identity that survives revisions. When a
revision adds/reorders/relabels nodes, every node that semantically corresponds
to a node in the previous version retains the same `stableNodeKey`. This is what
allows `CurriculumProgress` to remain valid across versions: progress is keyed
by `(curriculumId, userId, stableNodeKey)`, never by node id.

New nodes inserted by a revision get fresh stable keys. A `RemoveEdge` or
`RetargetEdge` change does not invalidate progress; an `InsertPrerequisite`
change re-locks downstream nodes if the new ancestor is not already completed.

---

## 3. DAG Invariants (enforced on validate)

1. **Acyclic.** Reject cycles regardless of edge type.
2. **Connected entry.** ≥1 root node (no incoming `Prerequisite` edge).
3. **Connected exit.** ≥1 terminal node.
4. **Concept anchoring.** Every node has either a valid `ckgConceptId` (verified
   against knowledge-graph-service) or a `proposedConcept` pending KG
   acceptance.
5. **No self-edges.**
6. **Deterministic frontier.** Given the same progress state, the frontier
   algorithm returns the same set in the same order.
7. **Threshold sanity.** `0 < masteryThreshold ≤ 1`.
8. **Edge consistency.** No duplicate `(from, to, type)` edges.

Validation is cached on the version row as `guardianValidationId` referencing
the pedagogy-guardian-service decision.

---

## 4. Traversal & Frontier

The frontier of an active version under a user's progress is the set of nodes
whose runtime state is `Unlocked` or `InProgress`. A node becomes `Unlocked`
when every incoming `Prerequisite` edge's source node is `Completed` or
`Skipped`.

`RecommendedBefore` edges do not gate unlocking; they only influence ordering
when the agent picks the session slice.

`Reinforces` edges do not gate unlocking; they signal that completing one node
contributes evidence toward the other (handled as cross-node reinforcement
weight in the session slice composer, not as a lock relation).

### 4.1 Session Slice Composition

`POST /v1/curricula/:id/session-slice` returns a slice for the next session:

1. Read frontier under active version + user progress.
2. Read `ConceptScheduleState` for every frontier node's `ckgConceptId` from
   scheduler-service.
3. Apply slice policy (configurable per curriculum, defaults below):
   - **InProgress first.** Prefer `InProgress` nodes over `Unlocked` ones.
   - **Maintenance before new.** Within `InProgress`, due-by-FSRS ordering.
   - **Bounded novelty.** Cap new (`Unlocked`) introductions per session
     (default: 2).
   - **Parallel branch interleaving.** Round-robin across independent branches
     when multiple are eligible.
4. Return `{ curriculumVersionId, selectedNodeIds, conceptIds, rationale }` to
   session-service for LessonPlan generation.

### 4.2 Completion Rules

A `CurriculumProgress` row transitions to `Completed` when **all** of:

- `stabilitySnapshot ≥ node.masteryThreshold` (read from scheduler-service)
- `evaluationCount ≥ masteryPolicy.minExposureSessions` (default 3)
- `correctStreak ≥ masteryPolicy.minCorrectStreak` (default 2)

Nodes only advance forward. FSRS retention decay re-queues the underlying
concept in the scheduler's due queue but does not regress curriculum node state.
The session slice composer still serves due reinforcements; they're a
maintenance overlay on top of frontier traversal.

---

## 5. Curriculum Realignment

### 5.1 Trigger Eligibility

Curriculum revisions are driven only by **durable, structural** triggers. The
full classification:

| Trigger (from metacognition-service)                     | Curriculum-eligible | Routing                    |
| -------------------------------------------------------- | ------------------- | -------------------------- |
| `prerequisite_gap`                                       | Yes                 | RealignmentEvidence        |
| `persistent_misconception`                               | Yes                 | RealignmentEvidence        |
| `concept_confusion`                                      | Yes                 | RealignmentEvidence        |
| `zero_retention`                                         | Yes                 | RealignmentEvidence        |
| `structural_invalidation` (planFundamentallyInvalidated) | Yes                 | Immediate proposal         |
| `failure` (single)                                       | No                  | Strategy local replan      |
| `slow_thinking`                                          | No                  | Strategy local replan      |
| `overconfidence`                                         | No                  | Strategy local replan      |
| `boredom`                                                | No                  | Strategy structural replan |
| `fatigue_detected`                                       | No                  | Strategy local replan      |
| `flow_disruption`                                        | No                  | Strategy local replan      |
| `time_pressure`                                          | No                  | Strategy local replan      |

Eligibility is enforced as a config-driven allowlist in
`domain/triggers/policy.ts` so future trigger types must be explicitly
classified.

### 5.2 Evidence Accumulation

Curriculum-service consumes `metacognition.trigger.fired`. For
curriculum-eligible triggers, the consumer:

1. Resolves the trigger's concept to one or more `stableNodeKey`s under the
   user's active curriculum.
2. Upserts `RealignmentEvidence` for that
   `(curriculumId, stableNodeKey, triggerType)`, appending the session id and
   incrementing `accumulatedWeight` by a per-trigger weight.
3. Updates `lastSeenAt`.
4. If `accumulatedWeight ≥ threshold` and the user has at least 2 distinct
   sessions in `sessionIds` (the cross-session rule), enqueues a proposal
   generation job.

Single-session evidence never produces a proposal regardless of weight, ensuring
the "long-run, structural" boundary is structural and testable.

### 5.3 Proposal Generation

A proposal is produced by the Curriculum Design Agent (Python, called via HTTP
adapter), not by curriculum-service in TypeScript. The agent receives:

- The active curriculum version
- The accumulated evidence rows
- The relevant CKG subgraph
- The user's CurriculumProgress
- Recent metacognition trigger history

The agent returns a proposal containing one or more `RevisionChange` entries.
The service persists the proposal and emits `curriculum.revision.proposed`.

### 5.4 Per-Change Approval (Hard Requirement)

Proposals are not applied wholesale. The user reviews each `RevisionChange`
independently:

- `PATCH /v1/curricula/:id/revision-proposals/:pid/changes/:cid` with
  `{ state: 'approved' | 'rejected' }`.
- Rejected changes are dropped; approved changes accumulate.
- `POST /v1/curricula/:id/revision-proposals/:pid/apply` composes the new draft
  version from the approved subset only.
- The new draft is validated through pedagogy-guardian-service; on success the
  prior active version is `Superseded` and the draft is `Active`.
- Frozen nodes (`Curriculum.metadata.frozenStableNodeKeys`) are excluded — any
  change touching a frozen key auto-rejects with reason `node_frozen`.

### 5.5 Preferred Structural Response

Per the Codex output: when the agent has a choice between a side-repair branch
and a main-path reorder for prerequisite gaps, it must prefer **main-path
reorder**. This is enforced as part of the agent prompt contract and validated
by Guardian: proposals containing only `AddRemediationPath` changes for
`PrerequisiteGap` evidence are rejected unless the agent explicitly justifies
why reorder is unsuitable.

---

## 6. Session Integration

### 6.1 Required Curriculum Binding

`StartSessionInput` (session-service) gains required `curriculumId` and optional
`curriculumVersionId` (defaults to the curriculum's active version).
Session-service calls curriculum-service's `session-slice` endpoint before
invoking the LessonPlan factory.

Freeform "ad-hoc" review sessions are removed from the normal learning path.
Pure spaced-repetition maintenance (no curriculum) becomes a system-managed
"Maintenance" curriculum auto-generated per user containing all concepts the
user has progress on; this preserves the constraint that every session has a
curriculum binding while supporting unstructured review.

### 6.2 LessonPlan Linkage

Session-service adds:

```
LessonPlan.curriculumId           : CurriculumId
LessonPlan.curriculumVersionId    : CurriculumVersionId
LessonPlan.selectedNodeIds        : CurriculumNodeId[]
```

Steps generated for the session must serve at least one of `selectedNodeIds`.
This is validated by pedagogy-guardian-service at LessonPlan activation.

### 6.3 Progress Update Loop

On `metacognition.evaluation.recorded` for an evaluation tied to a session bound
to a curriculum, curriculum-service:

1. Resolves the evaluation's `conceptId` to `stableNodeKey`(s) under the active
   version.
2. Increments `evaluationCount` and updates `correctStreak`.
3. Reads scheduler stability for the concept and updates `stabilitySnapshot`.
4. If completion rules are met → transitions to `Completed`, emits
   `curriculum.node.completed`, recomputes the frontier, emits
   `curriculum.frontier.updated`.

Strategy replans within session-service that supersede Steps update curriculum
progress only via the resulting Evaluations; superseded Steps that never
produced an Evaluation do not contribute progress.

---

## 7. Curriculum Design Agent Contract

The agent runs out-of-process (Python). curriculum-service depends only on its
HTTP contract.

### 7.1 Generation

```
POST {AGENT_URL}/v1/curriculum/generate
Body: {
  userId: UserId
  goal: string
  domain?: string
  depth?: 'survey' | 'foundational' | 'deep'
  studyMode?: StudyMode
  ckgSubgraph: { rootConceptIds: NodeId[]; maxRadius: number }
  knownStability: { conceptId: NodeId; stability: number }[]
  constraints: {
    maxNodes?: number
    maxDepth?: number
    excludeConceptIds?: NodeId[]
  }
}
Response: {
  agentRunId: string
  draft: {
    nodes: { stableNodeKey, ckgConceptId?, proposedConcept?, label, objective, masteryThreshold, estimatedSessions }[]
    edges: { fromKey, toKey, type, rationale }[]
  }
  rationale: string
  confidence: number
}
```

The agent does **not** finalize. Curriculum-service persists the draft as a new
`CurriculumVersion(state=Draft)`, calls Pedagogy Guardian for validation,
surfaces validation errors to the user, and only finalizes on explicit user
finalization action.

### 7.2 Revision Proposal

```
POST {AGENT_URL}/v1/curriculum/propose-revision
Body: {
  curriculumId: CurriculumId
  activeVersion: CurriculumVersion (with nodes/edges)
  evidence: RealignmentEvidence[]
  ckgSubgraph: ...
  progress: CurriculumProgress[]
  recentTriggers: TriggerSnapshot[]
}
Response: {
  agentRunId: string
  reason: CurriculumRevisionReason
  rationale: string
  changes: RevisionChange[]   // each independently approvable
}
```

### 7.3 Determinism Constraints

- Agent must be reproducible enough that the same inputs produce equivalent
  semantic outputs (rationale strings may differ).
- Each `RevisionChange` carries an explicit `rationale` mappable to evidence
  ids.
- Proposed changes are minimal: agent is prompted to prefer the smallest set of
  changes that addresses the evidence.

---

## 8. Public API Surface

```
# Vault
GET    /v1/curricula                         # list user vault
POST   /v1/curricula                         # create empty draft
POST   /v1/curricula/generate                # agent-generate draft from goal
GET    /v1/curricula/:id                     # full curriculum incl. active version
PATCH  /v1/curricula/:id                     # title/description/archive
DELETE /v1/curricula/:id                     # archive only (no hard delete)

# Versions
GET    /v1/curricula/:id/versions
GET    /v1/curricula/:id/versions/:vid
PATCH  /v1/curricula/:id/versions/:vid       # edit draft only
POST   /v1/curricula/:id/versions/:vid/validate    # call Pedagogy Guardian
POST   /v1/curricula/:id/versions/:vid/finalize    # supersede prior, activate

# Traversal & sessions
GET    /v1/curricula/:id/frontier            # current frontier under active version
GET    /v1/curricula/:id/progress            # all CurriculumProgress for user
POST   /v1/curricula/:id/session-slice       # called by session-service

# Revisions
GET    /v1/curricula/:id/revision-proposals
GET    /v1/curricula/:id/revision-proposals/:pid
PATCH  /v1/curricula/:id/revision-proposals/:pid/changes/:cid
POST   /v1/curricula/:id/revision-proposals/:pid/apply
DELETE /v1/curricula/:id/revision-proposals/:pid    # discard

# Freeze controls
POST   /v1/curricula/:id/freeze-node         # add stableNodeKey to frozen set
POST   /v1/curricula/:id/unfreeze-node
```

All routes require `curriculum:read` or `curriculum:write` scopes; agent-only
routes require `curriculum:agent`.

---

## 9. Events

Published:

```
curriculum.created
curriculum.draft.updated
curriculum.version.validated
curriculum.version.activated
curriculum.version.superseded
curriculum.archived
curriculum.frontier.updated
curriculum.node.unlocked
curriculum.node.in_progress
curriculum.node.completed
curriculum.node.blocked
curriculum.progress.updated
curriculum.realignment.evidence_accumulated
curriculum.revision.proposed
curriculum.revision.change.approved
curriculum.revision.change.rejected
curriculum.revision.applied
curriculum.revision.expired
session.curriculum_slice.selected           # when session-service requests a slice
```

Consumed:

```
metacognition.evaluation.recorded           # update progress, stability, streak
metacognition.trigger.fired                 # accumulate evidence (filtered by allowlist)
session.lifecycle.transitioned              # finalize progress on session completion
scheduler.concept_state.updated             # refresh stabilitySnapshot
graph.mutated                               # invalidate concept anchors when CKG changes
```

---

## 10. MCP Tool Surface (Agent-Facing)

Exposed for the Curriculum Design Agent and downstream agents:

```
get-curriculum-by-id        (read)
get-active-version          (read)
get-frontier                (read)
get-progress                (read)
list-revision-proposals     (read)
get-realignment-evidence    (read)
propose-curriculum-draft    (write, agent only)
propose-revision            (write, agent only)
```

All write tools route through Pedagogy Guardian for activation paths.

---

## 11. Phase Plan

1. ADR — service boundary and "curriculum DAG separate from CKG" decision.
2. `@noema/curriculum-service` package scaffold (Fastify + Prisma + Redis
   publisher).
3. Prisma schema + initial migration; branded IDs and enums in `@noema/types`.
4. Domain layer: `Curriculum`, `Version`, `Node`, `Edge`, `Progress` aggregates;
   DAG invariant validators; frontier computer; slice composer.
5. Trigger consumer + evidence accumulator with policy allowlist.
6. Curriculum Design Agent HTTP adapter with config-gated URL.
7. REST routes (vault, versions, frontier, slice, revisions).
8. Pedagogy Guardian integration for version validation and post-revision
   re-validation.
9. session-service contract changes: `curriculumId` required on
   `StartSessionInput`; LessonPlan linkage fields; slice request before plan
   factory.
10. Web app: `/curricula` vault, `/curricula/new`, `/curricula/[id]`
    graph+outline editor, revision proposal inbox, session-start curriculum
    picker.
11. MCP tool registry entries.
12. Integration tests covering the trigger classification, single-session
    evidence blocking, per-change approval, and progress survival across
    versions.

---

## 12. Tests

### Domain

- Reject cyclic DAGs.
- Reject finalized version without root or terminal.
- Frontier computation determinism under fixed progress.
- Stable-node-key preservation across revisions.
- Completed progress survives `Reorder`, `RetargetEdge`, `RelabelNode` changes.
- `InsertPrerequisite` re-locks downstream nodes when ancestor not yet
  completed.
- Frozen node rejects every kind of change touching it.

### Trigger Policy

- Curriculum-eligible triggers from ≥2 sessions cross threshold → proposal.
- Same triggers from 1 session never produce a proposal regardless of weight.
- Momentary triggers (`fatigue`, `flow_disruption`, `boredom`, `slow_thinking`,
  `time_pressure`, `overconfidence`) never accumulate evidence.

### API

- Generate → validate → finalize → start session flow.
- `curriculumId` required on session creation; rejection contract.
- Per-change approval applies only approved changes.
- Apply with zero approved changes → no version created.
- Concurrent proposal application contention handled.

### Frontend

- Vault list renders states correctly.
- Graph + outline editor stays synchronized.
- Active version is read-only outside revision proposals.
- Revision proposal inbox supports per-change approval.
- Session start blocks until a curriculum is selected.

### Integration

- Recurring `prerequisite_gap` produces main-path reorder, not side branch.
- Recurring `persistent_misconception` produces structural change.
- `fatigue_detected` produces strategy local replan only; no curriculum
  proposal.
- New active version affects future sessions; already-evaluated Steps remain
  immutable.

---

## 13. Open Questions

1. **Maintenance curriculum** — auto-generated per user to cover non-curriculum
   review, or keep freeform sessions as a separate code path? Plan:
   auto-generate, named `"Maintenance"`, hidden from vault by default.
2. **Multi-curriculum sessions** — one session per curriculum is the rule. A
   user with two active curricula runs them in separate sessions. Confirmed.
3. **Concept proposal flow** — when the agent proposes a curriculum node
   referencing a concept not yet in the CKG, how is the KG ingestion gated?
   Suggestion: reuse the knowledge-graph-service's CKG mutation DSL gate;
   proposed concept becomes a `Proposed → Validated → Committed` typestate
   transition initiated by the curriculum agent and approved by Guardian.
4. **Freeze granularity** — node-level only, or also edge-level? Plan:
   node-level for v1; revisit if revision UX shows demand.
5. **Proposal expiry default** — 14 days. Expired proposals stay in history for
   audit but cannot be applied.
