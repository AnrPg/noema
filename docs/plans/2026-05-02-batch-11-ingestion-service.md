# Batch 11 — Ingestion Service Implementation Plan

**Status:** Draft **Date:** 2026-05-02 **Scope:** `@noema/ingestion-service` —
document upload pipeline that produces intermediate representations, concept
extractions, RAG indexes, and seeds for the Content Creation Orchestrator and the
Curriculum Design Agent. **Depends on:**

- knowledge-graph-service (CKG concept lookup, node proposals)
- vector-service (chunk embedding + similarity search)
- Batch 8 (pedagogy-guardian-service, ADR-033)
- Batch 11 content-service (parallel plan)
- Batch 11 curriculum-service (parallel plan)

---

## 1. Purpose & Scope

The ingestion-service owns document processing end-to-end: upload, parse, IR
extraction, concept extraction, CKG mapping, chunking + embedding, and handoffs
to the Content Creation Orchestrator (for RAG-grounded cards) and the Curriculum
Design Agent (for document-derived curricula).

It does **not** own the cards or the curricula it seeds — those live in
content-service and curriculum-service respectively. Ingestion-service is a
transformation pipeline; its long-term persistence is limited to documents,
their IR, their chunks/embeddings, and the audit trail of jobs.

### Supported document types (v1)

- PDF (text + scanned via OCR)
- DOCX
- PPTX
- Plain text / Markdown
- HTML / web pages (single URL fetch)
- Audio (transcription via media-service)
- Video (audio track transcription via media-service)
- Image with text content (OCR via media-service)

### Out of scope for v1

- Live web crawling beyond a single URL fetch
- Real-time collaborative document editing
- Citation graph extraction beyond per-chunk source URLs

---

## 2. Pipeline Stages

```
[Upload] → [Parse] → [IR] → [Chunk] → [Embed]
                              ↓
                       [Concept Extract]
                              ↓
                     [CKG Map / Propose]
                              ↓
        ┌──────────────────────────────────────┐
        ↓                                      ↓
[Curriculum Seed Hand-off]         [Card Seed Hand-off]
        ↓                                      ↓
 curriculum-service                     content-service
 (Curriculum Design Agent)              (Content Creation Orchestrator)
```

Each stage is a step in a job state machine with idempotent retries and explicit
checkpoints stored in `IngestionJob`.

---

## 3. Core Domain Model

### 3.1 Branded IDs and Enums

```typescript
type DocumentId = Brand<string, 'DocumentId'>;
type IngestionJobId = Brand<string, 'IngestionJobId'>;
type ChunkId = Brand<string, 'ChunkId'>;
type ConceptCandidateId = Brand<string, 'ConceptCandidateId'>;

enum DocumentSourceKind {
  Upload,
  URL,
  EmailIngest,
  ApiPush,
}
enum DocumentMimeKind {
  Pdf,
  Docx,
  Pptx,
  Txt,
  Markdown,
  Html,
  Audio,
  Video,
  Image,
}
enum IngestionJobStage {
  Queued,
  Parsing,
  IRBuilding,
  Chunking,
  Embedding,
  ConceptExtracting,
  CkgMapping,
  CurriculumHandoff,
  CardHandoff,
  Completed,
  Failed,
  Cancelled,
}
enum ConceptCandidateState {
  Extracted,
  MappedToCkg,
  ProposedToCkg,
  AcceptedByCkg,
  RejectedByCkg,
}
```

### 3.2 Persistent Entities (Prisma schema)

```prisma
model Document {
  id              String          @id
  userId          String
  title           String
  sourceKind      DocumentSourceKind
  mimeKind        DocumentMimeKind
  storageUri      String          // MinIO key
  byteSize        Int
  pageCount       Int?
  durationMs      Int?            // audio/video
  uploadedAt      DateTime        @default(now())
  ir              DocumentIR?
  chunks          DocumentChunk[]
  concepts        ConceptCandidate[]
  jobs            IngestionJob[]
  @@index([userId, uploadedAt])
}

model DocumentIR {
  documentId      String          @id
  schemaVersion   String          // semver of IR shape
  structure       Json            // sections, headings, ordered blocks
  rawText         String?         // optional consolidated text for downstream agents
  language        String?
  extractedAt     DateTime        @default(now())
}

model DocumentChunk {
  id              String          @id
  documentId      String
  ordinal         Int             // position within doc
  sectionPath     String[]        // breadcrumb of section headings
  content         String
  tokenCount      Int
  embeddingId     String?         // vector-service reference
  pageRef         String?         // human-readable citation, e.g. "p. 12"
  @@index([documentId, ordinal])
}

model ConceptCandidate {
  id                String                   @id
  documentId        String
  label             String
  definition        String?
  evidenceChunkIds  String[]                 // chunks supporting this concept
  state             ConceptCandidateState
  ckgNodeId         String?                  // populated when MappedToCkg or AcceptedByCkg
  ckgProposalId     String?                  // populated when ProposedToCkg
  confidence        Float
  @@index([documentId, state])
}

model IngestionJob {
  id              String              @id
  documentId      String
  userId          String
  stage           IngestionJobStage
  startedAt       DateTime            @default(now())
  finishedAt      DateTime?
  checkpoints     Json                // per-stage timestamps + counts
  errorMessage    String?
  curriculumSeedRequestId String?     // FK into curriculum-service generation
  contentSeedRequestId    String?     // FK into content-service generation
  @@index([userId, stage])
  @@index([documentId])
}
```

---

## 4. Stage Implementations

### 4.1 Parse

Multi-format adapters under `domain/parsers/`. Each adapter outputs structured
blocks (heading / paragraph / list / table / image / code / equation) preserving
order and section nesting. Audio/video routes through media-service for
transcription, then text parsing applies.

OCR is invoked only when the PDF parser detects no extractable text on a page or
when the input is an image MIME. OCR work is delegated to media-service (per
ADR-0010 / existing media-service ownership).

### 4.2 IR Building

The IR (`DocumentIR`) is the authoritative consolidated representation. Schema
is versioned via `schemaVersion` so downstream agents can refuse incompatible
versions cleanly. The IR captures:

- Section tree (ordered, nested)
- Block stream (ordered, typed)
- Cross-references when detectable (e.g. "see Section 3.2")
- Language detection
- Optional consolidated `rawText` for agents that prefer flat text

### 4.3 Chunking

Chunks are produced from the IR with awareness of section boundaries and
semantic units (don't split mid-paragraph; respect equation/table atomicity).
Default targets: 400–600 tokens per chunk with 80-token overlap. Chunk
breadcrumb (`sectionPath`) is preserved for citation.

### 4.4 Embedding

Embeddings are produced by vector-service. ingestion-service stores only the
returned `embeddingId` reference; the vector remains in Qdrant. Index naming:
one Qdrant collection per `userId` to enforce isolation.

### 4.5 Concept Extraction

LLM-driven extraction over the IR. Extraction prompt is constrained to:

- Produce concept candidates with `label`, optional `definition`, and a list of
  evidence chunk ids.
- Each candidate carries `confidence ∈ [0, 1]`.
- Reject candidates lacking ≥1 evidence chunk.

Concept extraction is the only LLM step in the pipeline that ingestion-service
runs in-process (Python sidecar via HTTP). All other LLM-driven work (card
generation, curriculum generation) is delegated to dedicated agents.

### 4.6 CKG Mapping

For each concept candidate:

1. Query knowledge-graph-service `findCkgNodeByLabel` with the candidate label,
   plus a vector similarity search via vector-service against existing CKG node
   embeddings.
2. If a confident match exists (configurable threshold, default 0.85) →
   `MappedToCkg`, store `ckgNodeId`.
3. Otherwise → emit a CKG node proposal through the knowledge-graph-service's
   DSL gate (per the existing 7-layer guardrail stack); state becomes
   `ProposedToCkg`. Acceptance moves the candidate to `AcceptedByCkg` via a
   `graph.proposal.committed` event consumer.
4. Rejected proposals → `RejectedByCkg`; the candidate is still usable for RAG
   retrieval but cannot anchor cards or curriculum nodes until reanchored
   manually.

---

## 5. Hand-offs

### 5.1 Curriculum Seed Hand-off

When the upload session declares intent `derive_curriculum`, ingestion-service
calls curriculum-service `/v1/curricula/generate` with:

- Concept candidates that reached `MappedToCkg` or `AcceptedByCkg`
- Concept ordering hints derived from document structure (section order,
  cross-references, prerequisite phrasing detection)
- Source `documentIds`

Curriculum-service generates a draft curriculum (origin mode `DocumentDerived`),
which the user reviews and finalizes. The hand-off is fire-and-forget on the
ingestion side; status is observable via `curriculum.created` events linked back
to the originating `IngestionJob` via `curriculumSeedRequestId`.

### 5.2 Card Seed Hand-off

When the upload session declares intent `seed_cards`, ingestion-service calls
content-service `/v1/content/generation-jobs` with:

- `mode: RAG_GROUNDED`
- `conceptIds` from accepted candidates
- `documentIds` for source attribution
- Optional `curriculumContext` if the curriculum hand-off has already produced a
  finalized curriculum

Content-service spawns the Content Creation Orchestrator which uses chunks (via
vector-service, scoped to the documents) for retrieval and produces RAG-grounded
cards.

### 5.3 Combined Hand-off

A single upload can declare both intents. Curriculum seed runs first; once a
draft curriculum exists, card seed runs scoped per curriculum node so generated
cards are immediately bound to curriculum context.

---

## 6. RAG Retrieval Surface

The agents that consume ingested documents need a retrieval interface.
ingestion- service exposes:

```
POST /v1/retrieval/query
Body: {
  userId: UserId
  documentIds?: DocumentId[]    // scope to specific docs; omit = all user docs
  conceptIds?: NodeId[]         // additional CKG-anchored filter
  query: string
  topK: number
  minScore?: number
}
Response: {
  chunks: { chunkId, documentId, sectionPath, content, score, pageRef }[]
}
```

Internally this delegates to vector-service for ANN search and re-ranks by a
combination of similarity score and concept overlap. The interface stays in
ingestion-service so source citations (page refs, section paths) are surfaced
without forcing every agent to know vector-service internals.

---

## 7. Pedagogy Guardian Integration

Ingestion itself does not produce learner-facing artifacts; the artifacts it
seeds (cards, curriculum drafts) flow through their respective services'
Guardian integration. Ingestion-service does call Guardian for one purpose:

- **CKG node proposals** — when an extracted concept is proposed to the CKG,
  Guardian validates the proposal payload before it enters the CKG mutation DSL
  pipeline. Rejection blocks the proposal and the candidate stays `Extracted`
  (with a recorded rejection rationale).

This is dual control, not transferred ownership. Guardian hard-gates the
pedagogical/safety shape of the extracted concept proposal; the
knowledge-graph-service still owns CKG guardrails, mutation typestate, graph
acceptance/rejection, and canonical graph state. Ingestion-service owns
documents, IR, chunks, concept-candidate state, and job audit history.

---

## 8. Public API Surface

```
# Documents
POST   /v1/documents                          # multipart upload, init job
GET    /v1/documents                          # list user documents
GET    /v1/documents/:id                      # metadata + IR + chunks summary
DELETE /v1/documents/:id                      # archive (preserves audit trail)

# Jobs
POST   /v1/ingestion/jobs                     # explicit job creation w/ stage targets
GET    /v1/ingestion/jobs/:id
GET    /v1/ingestion/jobs?documentId=&status=
POST   /v1/ingestion/jobs/:id/cancel
POST   /v1/ingestion/jobs/:id/retry           # resume from last checkpoint

# Concept candidates
GET    /v1/documents/:id/concepts
PATCH  /v1/concepts/:cid                       # user override of mapping decision
POST   /v1/concepts/:cid/propose-to-ckg        # manually trigger proposal

# Retrieval
POST   /v1/retrieval/query                     # RAG retrieval surface
```

Upload endpoint accepts multipart with metadata fields:
`{ title, intent: ('parse_only' | 'derive_curriculum' | 'seed_cards' | 'both'), curriculumId? }`.

---

## 9. MCP Tool Surface

Exposed for the Curriculum Design Agent and Content Creation Orchestrator:

```
list-documents              (read)
get-document-ir             (read)
get-document-chunks         (read)
list-concept-candidates     (read)
retrieval-query             (read)
trigger-card-seed           (write, agent only) # idempotent on agentRunId
trigger-curriculum-seed     (write, agent only) # idempotent on agentRunId
```

---

## 10. Events

Published:

```
ingestion.document.uploaded
ingestion.document.parsed
ingestion.ir.built
ingestion.chunks.embedded
ingestion.concepts.extracted
ingestion.concepts.mapped
ingestion.concepts.proposed         # CKG proposal emitted
ingestion.document.processed         # terminal: pipeline reached Completed
ingestion.document.failed
ingestion.curriculum_seed.requested
ingestion.card_seed.requested
```

Consumed:

```
graph.proposal.committed             # update ConceptCandidate → AcceptedByCkg
graph.proposal.rejected              # update ConceptCandidate → RejectedByCkg
curriculum.created                   # link curriculumSeedRequestId
content.generation.completed         # link contentSeedRequestId
```

---

## 11. Observability & SLOs

- Per-stage duration histograms; alert on p95 stage duration > 5× baseline.
- Concept extraction precision/recall instrumented via user override counters
  (`PATCH /v1/concepts/:cid` is treated as a correction signal).
- CKG-mapping confidence distribution tracked to tune the 0.85 threshold over
  time.
- Per-user storage quota tracked at upload-time; reject uploads that would
  exceed quota with a clear error rather than mid-pipeline failure.

---

## 12. Phase Plan

1. ADR — service boundary, IR schema versioning, CKG proposal flow.
2. `@noema/ingestion-service` package scaffold.
3. Prisma schema + initial migration; branded IDs in `@noema/types`.
4. Storage integration with MinIO; per-user collection naming for
   vector-service.
5. Parser adapters in order: Markdown/Txt → PDF → DOCX → PPTX → HTML →
   Audio/Video → Image.
6. IR builder + chunker + embedder pipeline with checkpointing.
7. Concept extraction Python sidecar; HTTP adapter from TypeScript.
8. CKG mapping flow including proposal generation and acceptance event consumer.
9. Hand-off endpoints to content-service and curriculum-service.
10. Retrieval surface.
11. REST routes per section 8; MCP tools per section 9.
12. Web app: upload UI, document detail (IR + chunks + concepts), retry/cancel
    controls, concept-mapping override.
13. Integration tests — see section 13.

---

## 13. Tests

### Domain

- IR schema versioning rejects incompatible versions on read.
- Chunker preserves section atomicity; no chunk crosses a section boundary
  unless explicitly merged.
- CKG mapping promotion happens on `graph.proposal.committed`.
- Job retry resumes from last checkpoint; idempotency holds across retries.

### Pipeline

- Parse failure halts the pipeline at `Parsing` stage with diagnostic.
- OCR fallback engages only when text extraction yields zero content.
- Embedding failure marks chunks unembedded but does not fail the job; retrieval
  falls back to keyword search until embeddings exist.

### Hand-offs

- `parse_only` intent never triggers curriculum or card seed.
- `seed_cards` intent without confident concepts → no card seed (job marks
  partial completion with reason).
- `both` intent runs curriculum seed before card seed; card seed receives
  `curriculumContext` if curriculum finalized in time.

### API

- Multipart upload size limits enforced.
- Quota enforcement returns 413 with quota details before pipeline starts.
- Retrieval query without `documentIds` searches across all user docs; with
  `documentIds` is strictly scoped.
- Concept override flow updates `ConceptCandidate.state` and re-emits
  `ingestion.concepts.mapped`.

### Frontend

- Upload UI shows per-stage progress.
- Document detail page renders IR sections, chunks with citations, concept
  candidates with state badges.
- User can override a `MappedToCkg` decision and re-trigger downstream
  generation.

---

## 14. Open Questions

1. **Concept extraction model placement** — Python sidecar inside
   ingestion-service vs. delegated to a shared agents/_ runtime? Plan: sidecar
   for v1 because extraction is tightly coupled to IR shape; revisit when
   agents/_ runtime stabilizes.
2. **Multi-document curricula** — can a single curriculum seed span multiple
   uploads? Plan: yes via `IngestionJob.documentIds[]`; the first upload creates
   the curriculum draft, subsequent uploads with the same curriculum target
   trigger a merge (curriculum-service handles the merge as a revision proposal,
   not silent merge).
3. **Quota policy** — per-user storage and embedding-cost quotas need product
   sign-off before launch defaults are baked in.
4. **OCR language coverage** — start with English; extend per media-service
   capability roadmap.
5. **Re-ingestion** — when the IR schema bumps, do existing documents auto-re-IR
   or only on demand? Plan: on-demand via explicit `POST /jobs/:id/retry` from
   the user; auto-re-IR is opt-in per document to avoid surprise compute costs.
