# Ingestion Service

`ingestion-service` owns Batch 11 document ingestion state: uploaded documents,
document IR, chunks, concept candidates, and ingestion jobs.

## Boundary

- Domain: document ingestion, parse/chunk/embed orchestration, concept candidate
  lifecycle, and handoff checkpoints.
- Adapters: Prisma persistence, Redis event publishing, format-aware text/media
  parser with Python-backed binary extraction, vector-service HTTP client,
  knowledge-graph/content/curriculum HTTP clients, and the shared Python
  ingestion extraction agent.
- It does not persist generated cards or curriculum DAGs; it requests those from
  `content-service` and `curriculum-service`.

## API

- `POST /v1/documents` creates a document and queued ingestion job.
- `GET /v1/documents` lists user documents.
- `GET /v1/documents/:id` returns document detail with IR, chunks, concepts, and
  jobs.
- `POST /v1/ingestion/jobs` creates an explicit job for an existing document.
- `POST /v1/ingestion/jobs/:id/run` runs parsing through downstream handoffs.
- `POST /v1/ingestion/jobs/:id/retry` requeues and reruns a failed or cancelled
  job.
- `POST /v1/retrieval/query` retrieves grounded chunks through vector-service.

## Pipeline

1. Parse the uploaded payload into normalized IR, separating text-bearing blocks
   from media-bearing blocks before chunking.
2. Build whole-document scan windows with overlap from the normalized text
   blocks. These windows are for concept extraction only.
3. Chunk text-bearing blocks for downstream RAG/vector retrieval.
4. Embed chunks through `vector-service`.
5. Run the ingestion concept extraction agent over the ordered scan windows.
6. Map or propose candidates against the CKG.
7. Optionally request document-derived curriculum generation.
8. Optionally request RAG-grounded content/card generation.

## Text Extraction Contract

The ingestion pipeline now treats concept extraction and RAG as separate
concerns:

- concept extraction reads the whole normalized text through overlapping scan
  windows
- RAG retrieval uses stored chunks and embeddings later, for downstream agents
  such as content creation or lesson planning

The parser can currently separate text and media for textual payloads such as:

- `text/plain`
- `text/markdown`
- `text/html`
- `text/csv`
- `text/tab-separated-values`
- JSON/YAML-like textual payloads

For binary and structured source payloads, ingestion-service now accepts either:

- plain text content for text-native formats
- base64 content with `metadata.contentEncoding = "base64"`
- a `data:<mime>;base64,...` content payload

Native extraction is now handled inside ingestion-service for:

- `application/pdf`
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- `application/epub+zip`

The Python extraction adapter uses:

- `pypdf` for PDF text extraction
- `python-docx` for DOCX paragraph and heading extraction
- `openpyxl` for XLSX workbook and sheet extraction
- standard-library zip/html parsing for EPUB chapter extraction

The parser also infers format from file extension for uploads such as `.md`,
`.typ`, `.csv`, `.tsv`, `.json`, `.yaml`, `.pdf`, `.docx`, `.xlsx`, and
`.epub`, which lets clients keep `mimeKind = text/plain` when a richer MIME
type is unavailable.

Binary extraction still enters the service through the existing string upload
contract, so byte payloads are represented as base64 at the API boundary. Once
uploaded, checksum, byte length, parse warnings, and OCR status are all derived
from the decoded source bytes rather than from the base64 envelope.

## Current Technical Debt

- Extend media separation beyond inline image detection for richer HTML, EPUB,
  and office documents, especially diagrams, captions, and embedded figures.
- Add optional OCR-backed PDF/image extraction for scanned or image-only
  sources; the service now reports `ocrStatus`, but does not yet perform OCR.
- Promote scan-window construction to an explicit ingestion-service API/tool if
  other services need to inspect the extraction pass directly.
- Consider moving the upload contract from string-or-base64 content to a true
  binary/multipart boundary once the wider platform is ready for it.

## Reliability

Jobs are claimed atomically from `queued` before processing. Concurrent run or
retry calls for the same job fail instead of replacing chunks/candidates twice.
Ingestion events publish through the shared Redis event publisher to
`noema:events:ingestion-service` using the canonical event envelope.

If a document yields no text-bearing blocks after extraction, the job now
completes without vector embedding or concept extraction and records a
`skippedExtraction` checkpoint rather than sending an empty payload through the
rest of the pipeline.
