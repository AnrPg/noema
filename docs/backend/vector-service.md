# Vector Service

`vector-service` owns document chunk embeddings and retrieval for ingestion and
RAG-grounded workflows.

## Boundary

- Domain: embedding model abstraction, chunk embedding, vector search request
  handling.
- Adapter: Qdrant collection management, upsert, and search with an in-process
  fallback for local development resilience.
- It does not parse documents, extract concepts, or create content.

## API

- `POST /v1/embeddings/text` returns a deterministic embedding for text.
- `POST /v1/embeddings/chunks` embeds and stores document chunks.
- `POST /v1/search` retrieves matching document chunks for a query.

The default embedding implementation is deterministic hash embedding so the
service is usable without an external model dependency. The repository boundary
allows replacing it with a production embedding provider without changing
ingestion-service.
