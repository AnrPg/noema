# Ingestion Service

`ingestion-service` owns Batch 11 document ingestion state: uploaded documents,
document IR, chunks, concept candidates, and ingestion jobs.

## Boundary

- Domain: document ingestion, parse/chunk/embed orchestration, concept candidate
  lifecycle, and handoff checkpoints.
- Adapters: Prisma persistence, Redis event publishing, plain text/Markdown
  parser, vector-service HTTP client, knowledge-graph/content/curriculum HTTP
  clients.
- It does not persist generated cards or curriculum DAGs; it requests those from
  `content-service` and `curriculum-service`.

## API

- `POST /v1/documents` creates a document and queued ingestion job.
- `GET /v1/documents` lists user documents.
- `GET /v1/documents/:id` returns document detail with IR, chunks, concepts, and
  jobs.
- `POST /v1/ingestion/jobs` creates an explicit job for an existing document.
- `POST /v1/ingestion/jobs/:id/run` runs parsing through downstream handoffs.
- `POST /v1/ingestion/jobs/:id/retry` requeues and reruns a failed job.
- `POST /v1/retrieval/query` retrieves grounded chunks through vector-service.

## Pipeline

1. Parse uploaded text into normalized IR.
2. Chunk non-heading blocks with heading path metadata.
3. Embed chunks through `vector-service`.
4. Extract concept candidates.
5. Map or propose candidates against the CKG.
6. Optionally request document-derived curriculum generation.
7. Optionally request RAG-grounded content/card generation.
