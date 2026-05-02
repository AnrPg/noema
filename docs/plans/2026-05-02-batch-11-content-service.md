# Batch 11 — Content Service Implementation Plan

**Status:** Draft **Date:** 2026-05-02 **Scope:** Content-service additions for
Batch 11 of `IMPLEMENTATION_PLAN_FINAL.md` covering the three card-creation
modes, transformation persistence, and the Content Generation Agent contract.
**Depends on:**

- Existing content-service (ADRs 0010, 0033–0038)
- Batch 4 (session-service Step loop, ADR-026)
- Batch 5 (metacognition Evaluation/Trigger loop, ADR-027)
- Batch 8 (pedagogy-guardian-service, ADR-033)
- Batch 11 curriculum-service (parallel plan)
- Batch 11 ingestion-service (parallel plan)

---

## 1. Purpose & Scope

Batch 11 introduces agent-driven content creation alongside human authoring.
After this batch, every card/activity in the system has a recorded provenance
and one of three origin modes — and any card may be transformed by an agent into
another representation, with the transformation persisted as a new card linked
to its parent.

The content-service remains the authoritative store for card payloads (per
ADR-0010). It does **not** become an LLM service; the Content Generation Agent
is a separate Python process. Content-service exposes the persistence,
provenance, validation, and transformation surface the agent calls into.

### Three origin modes

| Mode               | Author | Truth source                               | Validation                             |
| ------------------ | ------ | ------------------------------------------ | -------------------------------------- |
| `AUTHORED`         | User   | User input                                 | Forced metadata gate                   |
| `RAG_GROUNDED`     | Agent  | Uploaded documents (via ingestion-service) | Source citations required              |
| `AGENT_AUTONOMOUS` | Agent  | CKG + metacognition + optional web search  | CKG anchor required + factuality score |

All three modes can co-exist within a single session deck.

---

## 2. Card Provenance — Schema Additions

### 2.1 New fields on the existing card payload

```prisma
model Card {
  // existing fields ...

  originMode            CardOriginMode      // AUTHORED | RAG_GROUNDED | AGENT_AUTONOMOUS
  originAgentRunId      String?             // back-reference to ContentGenerationAgent run
  authorUserId          String?             // user id when AUTHORED, null otherwise
  sourceDocumentIds     String[]            // RAG: ingestion document ids
  sources               Json?               // [{ url, title, retrievedAt, snippet }]
  anchoredCkgNodeIds    String[]            // REQUIRED for all modes; ≥1 entry
  anchoredPkgNodeIds    String[]            // optional, populated as user organizes
  factualityScore       Float?              // 0..1, computed by agent self-critique
  reviewState           CardReviewState     @default(Active)
  // transformation lineage
  parentCardId          String?
  transformationKind    CardTransformKind?
  transformationAgentRunId String?
  // generation metadata
  generationJobId       String?             // FK into ContentGenerationJob
  guardianValidationId  String?             // pedagogy-guardian-service decision

  parent                Card?               @relation("CardTransformLineage", fields: [parentCardId], references: [id])
  variants              Card[]              @relation("CardTransformLineage")

  @@index([originMode])
  @@index([parentCardId])
  @@index([reviewState])
  @@index([authorUserId])
}

enum CardOriginMode      { AUTHORED, RAG_GROUNDED, AGENT_AUTONOMOUS }
enum CardReviewState     { Active, PendingReview, Rejected, MetadataIncomplete, Archived }
enum CardTransformKind   {
  ToCloze,
  ToMultipleChoice,
  ToTrueFalse,
  ToShortAnswer,
  ToDefinition,
  ToConceptMap,
  ToCaseStudy,
  ToSocraticDialogue,
  Translate,                // language transform
  Simplify,                 // ELI5
  Deepen,                   // expert depth
  Rephrase,                 // structural rephrase
  Reanchor                  // re-link to different CKG node
}
```

### 2.2 Generation Job Tracking

```prisma
model ContentGenerationJob {
  id              String                @id
  userId          String
  agentRunId      String                @unique
  mode            CardOriginMode
  request         Json                  // original generation request payload
  conceptIds      String[]              // CKG nodes the job was scoped to
  documentIds     String[]              // RAG documents scoped to (optional)
  curriculumNodeKeys String[]           // optional curriculum binding
  status          GenerationJobStatus
  startedAt       DateTime              @default(now())
  finishedAt      DateTime?
  cardsProduced   Int                   @default(0)
  cardsRejected   Int                   @default(0)
  errorMessage    String?
  cards           Card[]                @relation("JobCards")
  @@index([userId, status])
  @@index([agentRunId])
}

enum GenerationJobStatus { Pending, Running, Succeeded, PartiallyFailed, Failed, Cancelled }
```

### 2.3 Type Coverage Tracking

To enforce the variety mandate (multiple card types per concept) in the Content
Generation Agent, content-service maintains a derived view per (user, concept):

```prisma
model ConceptCardCoverage {
  id            String  @id
  userId        String
  ckgNodeId     String
  cardTypes     String[]            // distinct card types active for this concept
  totalActive   Int
  totalArchived Int
  lastUpdatedAt DateTime @updatedAt
  @@unique([userId, ckgNodeId])
}
```

Maintained by an internal projection on `card.created` / `card.archived` /
`card.review_state.changed`.

---

## 3. Mode 1: AUTHORED — Forced Metadata Gate

### 3.1 Server-Enforced Required Metadata

The existing `create-card` MCP tool and REST `POST /v1/cards` are extended to
require:

- `cardType` (already required)
- `anchoredCkgNodeIds.length ≥ 1`
- `tags.length ≥ 1`
- `difficulty: DifficultyLevel`
- Type-specific structured payload validated by Zod (already exists per type)

If any required metadata is missing, the card is persisted with
`reviewState = MetadataIncomplete`. Cards in this state are:

- Not eligible for session inclusion
- Not indexed by the vector-service
- Visible in the user's vault with a "complete metadata to use" badge

A separate route `PATCH /v1/cards/:id/complete-metadata` lifts the state once
all fields are present.

### 3.2 Agent Copilot for Authoring

The agent assists during authoring via dedicated MCP tools that do **not**
create cards but return suggestions:

```
suggest-card-metadata    # given draft content, suggests CKG nodes, tags, difficulty
suggest-card-variants    # given a draft card, proposes possible transformations
```

User accepts suggestions through the wizard UI; on save, the card is created
with `originMode = AUTHORED` regardless of how much agent assistance was used.

---

## 4. Mode 2: RAG_GROUNDED — Document-Anchored Cards

Cards generated from uploaded documents (ingestion-service hands off to the
Content Generation Agent, which calls content-service). Required fields:

- `sourceDocumentIds.length ≥ 1`
- `sources` array with at least one entry per source document referenced
- `anchoredCkgNodeIds.length ≥ 1` (still required — RAG mode anchors to CKG via
  ingestion's concept extraction)
- `originMode = RAG_GROUNDED`

If the agent cannot map a chunk to any CKG node, the card cannot be
RAG_GROUNDED; the agent must either propose a new CKG node (via
knowledge-graph-service) or generate as `AGENT_AUTONOMOUS`.

---

## 5. Mode 3: AGENT_AUTONOMOUS

Used when no document is provided, typically for filling gaps detected by the
Learning/Curriculum agents. Required:

- `anchoredCkgNodeIds.length ≥ 1` — the constraint that prevents content drift
- `factualityScore` populated (mandatory for this mode)
- `sources` populated when web search was used
- If `factualityScore < FACTUALITY_REVIEW_THRESHOLD` (default 0.7) →
  `reviewState = PendingReview`. Cards in this state are excluded from sessions
  until either user approves them or the threshold-promotion job promotes them
  after the cooldown.

The agent's variety mandate applies: a single agent run targeting a concept must
produce cards across at least `MIN_DISTINCT_TYPES_PER_CONCEPT` (default 3) when
the existing `ConceptCardCoverage` shows < 3 distinct types for that concept.

---

## 6. Card Transformations as First-Class Operations

Transformations create a **new card** linked to its parent; the parent is never
mutated. This preserves immutability of authored content and enables the
scheduler to serve any variant.

### 6.1 Transformation Tool

```
transform-card
Body: {
  parentCardId: CardId
  transformationKind: CardTransformKind
  agentRunId: string
  outputs: ICreateCardInput[]    // ≥1 new cards
}
```

Server-side rules:

1. Parent must exist and be `Active`.
2. Each new card carries `parentCardId`, `transformationKind`,
   `transformationAgentRunId`.
3. `originMode` of the new card matches the parent's `originMode` for `AUTHORED`
   parents (a transformation of an authored card is still considered authored
   content). For `RAG_GROUNDED`/`AGENT_AUTONOMOUS` parents, the variant carries
   the parent's source provenance.
4. `anchoredCkgNodeIds` of the new card must be a subset of the parent's
   anchored set unless `transformationKind = Reanchor`.
5. Pedagogy Guardian validates each new variant before persistence (per
   ADR-0033, content-service already calls Guardian for generated activities).

### 6.2 Transformation DAG

The parent → variant relationship is a DAG (a variant can itself be
transformed). Cycles are prevented by the `parentCardId` chain (no node may
reference an ancestor).

### 6.3 PKG Linkage

Both parent and variant cards link to the same CKG/PKG node(s) via existing
`anchoredCkgNodeIds`. The knowledge-graph-service additionally tracks a
`has_representation` relation between the two card nodes when both are added to
a PKG, surfaced in the knowledge map UI as a single "concept exercised by N
variants" group.

---

## 7. Pedagogy Guardian Integration

ADR-0033 already requires content-service to call Pedagogy Guardian before
storing a generated activity variant. Batch 11 extends the integration:

| Path                                       | Guardian called? | Block on failure |
| ------------------------------------------ | ---------------- | ---------------- |
| `AUTHORED` create                          | No               | n/a              |
| `RAG_GROUNDED` create                      | Yes              | Yes              |
| `AGENT_AUTONOMOUS` create                  | Yes              | Yes              |
| Transformation create                      | Yes              | Yes              |
| `PATCH /complete-metadata`                 | No               | n/a              |
| Promotion from `PendingReview` to `Active` | Yes              | Yes              |

When Guardian rejects, the card is persisted with `reviewState = Rejected` and
`guardianValidationId` set. Rejected cards are inspectable but not
session-eligible.

---

## 8. Content Generation Agent Contract

The agent runs out-of-process (Python). Content-service depends only on its HTTP
contract.

### 8.1 Generation Request

```
POST {AGENT_URL}/v1/content/generate
Body: {
  userId: UserId
  mode: CardOriginMode             // RAG_GROUNDED or AGENT_AUTONOMOUS
  conceptIds: NodeId[]             // CKG anchors — required ≥1
  documentIds?: string[]           // required when mode = RAG_GROUNDED
  curriculumContext?: {
    curriculumId: CurriculumId
    versionId: CurriculumVersionId
    nodeKeys: string[]
  }
  studentContext: {
    metacognitiveStage: 1 | 2 | 3 | 4
    masteryByConcept: { conceptId, stability }[]
    recentMisconceptions: string[]
  }
  desiredCardTypes: CardType[]     // hint, agent may produce others
  varietyMandate: {
    minDistinctTypes: number
    excludeTypes?: CardType[]
  }
  budget: {
    maxCards: number
    timeoutMs: number
  }
}
Response: {
  agentRunId: string
  cards: ICreateCardInput[]        // each carries provenance + factualityScore
  rejectedDrafts: { reason, draft }[]
  costEstimate: { tokens, durationMs }
}
```

### 8.2 Transformation Request

```
POST {AGENT_URL}/v1/content/transform
Body: {
  parentCardId: CardId
  transformationKind: CardTransformKind
  studentContext: ...
}
Response: {
  agentRunId: string
  cards: ICreateCardInput[]
}
```

### 8.3 Self-Critique / Factuality

The agent is required to self-critique generated cards for factuality and
produce a `factualityScore` per card. Cards below threshold land in
`PendingReview` per section 5. Content-service does not re-score; it trusts the
agent and surfaces review UX.

---

## 9. Session Pool & Gap Filling

The Learning Agent's `query-cards` tool already exists. Batch 11 adds:

- `query-cards` accepts `conceptIds`, `originModes` (filter), `studyMode`, and
  `excludeReviewStates` (defaults to excluding `PendingReview`,
  `MetadataIncomplete`, `Rejected`, `Archived`).
- A new tool `gap-fill-concepts` returns `{ conceptId → cardCount }` so the
  Learning Agent can detect gaps before invoking the Content Generation Agent.
- A new tool `request-generation` triggers a generation job asynchronously and
  returns the `agentRunId`. The Learning Agent polls or subscribes to
  `content.generation.completed`.

In-session injection (Strategy local replan needs a remediation card that
doesn't exist) uses a tight 5s budget. If the agent doesn't return in time,
session-service falls back to a deterministic remediation Step using the
existing card pool — the generation continues asynchronously and the produced
card lands in the pool for the next session.

---

## 10. Public API Surface (additions)

```
# Provenance + variants
GET    /v1/cards/:id/lineage              # parent + descendant transformations
GET    /v1/cards/:id/sources              # source documents + URLs
PATCH  /v1/cards/:id/complete-metadata
POST   /v1/cards/:id/promote-from-review  # admin/user override of factuality gate

# Transformations
POST   /v1/cards/:id/transform            # request a transformation (sync or async)
GET    /v1/cards/:id/variants

# Generation jobs
POST   /v1/content/generation-jobs
GET    /v1/content/generation-jobs/:id
GET    /v1/content/generation-jobs?status=&userId=

# Coverage
GET    /v1/coverage/concept/:conceptId
GET    /v1/coverage/user/:userId
```

---

## 11. MCP Tool Surface (additions)

```
suggest-card-metadata          # P1, side-effect=false
suggest-card-variants          # P1, side-effect=false
gap-fill-concepts              # P0, side-effect=false
request-generation             # P0, side-effect=true, async
transform-card                 # P0, side-effect=true
get-card-lineage               # P1, side-effect=false
get-coverage                   # P1, side-effect=false
```

All write tools route through Pedagogy Guardian per section 7.

---

## 12. Events

Published:

```
card.created                        # already exists, gains originMode in payload
card.transformation.created
card.review_state.changed
card.metadata.completed
content.generation.requested
content.generation.completed
content.generation.failed
content.coverage.updated
```

Consumed:

```
ingestion.document.processed         # opportunity to seed RAG generation
graph.mutated                        # invalidate anchoredCkgNodeIds when CKG concepts merge/split
curriculum.frontier.updated          # opportunity to gap-fill ahead of next session
```

---

## 13. Phase Plan

1. ADR — three origin modes, transformation as first-class, factuality gating.
2. Prisma migration adding provenance fields, `ContentGenerationJob`,
   `ConceptCardCoverage`, and the `CardReviewState` enum.
3. Domain layer changes: card validation gate for forced metadata;
   transformation service; coverage projection; review-state lifecycle.
4. Pedagogy Guardian integration extended to all generation/transformation
   paths.
5. Content Generation Agent HTTP adapter under `LESSON_PLAN_AGENT_URL` style env
   var (separate `CONTENT_GENERATION_AGENT_URL`).
6. New REST routes per section 10.
7. New MCP tools per section 11.
8. Event publishing additions.
9. Web app: complete-metadata flow in card wizard; lineage view; review queue
   for `PendingReview` cards; coverage widget on concept pages.
10. Integration tests — see section 14.

---

## 14. Tests

### Domain

- `AUTHORED` create with missing required metadata → `MetadataIncomplete`.
- `AUTHORED` complete-metadata transition is idempotent.
- `RAG_GROUNDED` create without `sourceDocumentIds` rejected.
- `AGENT_AUTONOMOUS` create without `anchoredCkgNodeIds` rejected.
- `factualityScore < threshold` lands in `PendingReview`.
- Transformation never mutates parent; lineage chain has no cycles.
- Coverage projection updates on every state-change event.

### Pedagogy Guardian

- Generated cards rejected by Guardian land in `Rejected` with validation id.
- Transformation rejection blocks variant persistence.
- Promotion from `PendingReview` re-validates.

### Agent contract

- Agent timeout falls back to deterministic remediation; generation continues
  async and lands in pool on completion.
- Variety mandate enforced when coverage < threshold.
- Self-critique scores propagated correctly.

### API

- `query-cards` excludes non-active review states by default.
- `gap-fill-concepts` returns counts respecting active filter.
- `transform-card` end-to-end produces variant linked to parent.
- Lineage endpoint returns full DAG.

### Frontend

- Wizard cannot save without required metadata; agent suggestions surface
  inline.
- Review queue shows PendingReview cards with factuality score and sources.
- Lineage view renders parent + variants.
- Coverage widget on concept page reflects type distribution.

---

## 15. Open Questions

1. **Web search authority for AGENT_AUTONOMOUS** — which sources are allowed
   (Wikipedia, arXiv, official docs only?)? Plan: configurable per-domain
   allowlist owned by content-service config; agent enforces.
2. **Promotion cooldown** — after how long does an unreviewed `PendingReview`
   card auto-promote? Plan: never auto-promote; explicit user action required.
   Revisit after pilot data.
3. **Translation/localization transformations** — `CardTransformKind.Translate`
   exists in the enum but locale handling is out of scope for this batch.
4. **Streaming generation** — async via job + event. No streaming for v1.
5. **Coverage projection materialization strategy** — eager on event vs. lazy on
   read. Plan: eager on event because read traffic from agents is high.
