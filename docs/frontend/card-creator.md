# Card Creator

## Purpose

The card creator at `/cards/new` is the authoring flow for creating a single
card in the web app.

Batch authoring now lives at `/cards/batch`, which provides a dedicated,
API-backed import wizard with:

- Step 1: file-type selection with format-aware descriptions
- Step 2: format selection within the chosen file family
- Step 3: server-built preview plus explicit source-to-card mapping
- Batch history and rollback controls in the same workspace

## PKG Linking Flow

- Cards do not own knowledge-graph structure. They link to PKG nodes through
  `knowledgeNodeIds`.
- Step 3 lets users search and attach existing PKG nodes.
- When the searched label does not already exist, the page can now create a new
  PKG node inline through the Knowledge Graph API client and immediately attach
  it to the card draft.
- The resulting card submission still goes through the Content API client with
  the resolved `knowledgeNodeIds`.

## Implementation Notes

- Route: `apps/web/src/app/(authenticated)/cards/new/page.tsx`
- KG read path: `usePKGNodes(userId)`
- KG write path: `useCreatePKGNode(userId)`
- Single-card write path: `useCreateCard()`
- Batch import read path: `usePreviewCardImport()` from
  `apps/web/src/app/(authenticated)/cards/batch/page.tsx`
- Batch import write path: `useExecuteCardImport()` from
  `apps/web/src/app/(authenticated)/cards/batch/page.tsx`

## Batch Import Notes

- The browser no longer owns file parsing. It sends the selected source payload
  to `content-service` for preview and execution.
- The import wizard supports `JSON`, `JSONL`, `CSV`, `TSV`, `XLSX`, `TXT`,
  `Markdown`, `LaTeX`, and `Typst`.
- Mapping is explicit and exhaustive: every detected source field must be mapped
  either to a card field or to `metadata.dump`.
- Workbook imports can switch sheets after preview without leaving the wizard.

This keeps the frontend aligned with the hexagonal split between the Content
service as card archive and the Knowledge Graph service as the owner of PKG
structure.
