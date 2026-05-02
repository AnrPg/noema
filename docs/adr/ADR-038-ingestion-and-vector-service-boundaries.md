# ADR-038 - Ingestion and Vector Service Boundaries

- **Date:** 2026-05-02
- **Status:** accepted
- **Deciders:** Codex

## Context

Batch 11 requires document upload, parsing, chunking, retrieval grounding, CKG
mapping, curriculum generation handoff, and card generation handoff. ADR-012
kept ingestion inside content-service until ingestion became full document
orchestration. The Batch 11 ingestion plan crosses that threshold.

## Decision

Create `ingestion-service` as the durable owner of uploaded documents,
normalized document IR, chunks, concept candidates, ingestion jobs, and handoff
orchestration. Create `vector-service` as the owner of embedding and vector
retrieval operations over document chunks.

`content-service` remains the provenance boundary for persisted generated
activities and cards. `curriculum-service` remains the durable curriculum DAG
boundary and exposes `/v1/curricula/generate` for document-derived curricula.

## Rationale

Document orchestration would make content-service a mixed ingestion, retrieval,
and content persistence module. Splitting ingestion and vector work keeps Batch
11 aligned with hexagonal boundaries: ingestion coordinates ports,
vector-service owns retrieval infrastructure, and downstream services persist
their own domain outputs.

## Alternatives Considered

| Option                                 | Pros               | Cons                                                                    | Rejected because                                      |
| -------------------------------------- | ------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| Keep ingestion inside content-service  | Fewer services     | Content-service would own parsing, chunks, retrieval, and orchestration | Violates ADR-012's split condition and Batch 11 scope |
| Let agents own ingestion state         | Fast prototype     | No durable service boundary or idempotent job model                     | Agents must not bypass service persistence            |
| Put Qdrant access in ingestion-service | Simpler call graph | Couples ingestion to vector infrastructure                              | Retrieval should be reusable beyond ingestion         |

## Consequences

- Positive: document ingestion is replayable, inspectable, and independent from
  content persistence.
- Positive: vector retrieval can serve ingestion, RAG generation, and future
  search workflows through one service.
- Trade-off: Batch 11 now has two new deployable services and a
  service-to-service handoff path to validate.
- Follow-up: add richer parsers for PDF/DOCX/HTML and replace deterministic
  concept extraction with the agent sidecar once its API is stable.
