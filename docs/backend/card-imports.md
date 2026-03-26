# Card Imports

## Purpose

The card import pipeline turns heterogeneous source files into explicit,
batch-created cards through `content-service`.

## API Surface

- `POST /v1/cards/import/preview` Parses a source payload and returns:
  - normalized records
  - discovered source fields
  - worksheet names for workbook imports
  - inferred starting mappings
  - parsing warnings
- `POST /v1/cards/import/execute` Re-runs the parse, applies the explicit
  mapping, creates cards in a tracked batch, and returns batch results plus
  import warnings.

## Supported Source Families

- JSON
- JSONL
- CSV
- TSV
- XLSX
- TXT
- Markdown
- LaTeX
- Typst

## Mapping Rules

- `front` and `back` are required destinations before execution.
- Every discovered source field must be mapped explicitly.
- Extra source fields can be preserved under `metadata.dump`.
- Shared defaults fill gaps for tags, linked knowledge nodes, difficulty, and
  initial active-vs-draft intent.

## Agent Surface

The same workflow is exposed through content MCP tools:

- `preview-card-import`
- `execute-card-import`

That keeps agent-driven ingestion aligned with the human web workflow instead of
re-implementing format logic in prompts or clients.

## Implementation Notes

- Parsing lives in
  `services/content-service/src/domain/content-service/card-import.ts`.
- Import execution reuses the existing batch-create path, so rollback continues
  to work through batch history and `metadata._batchId`.
- Workbook parsing uses `xlsx` inside `content-service`, keeping spreadsheet
  support in the service layer rather than the browser.
