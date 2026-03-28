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
- Step 3 now uses one shared PKG authoring panel across `/cards/new` and
  `/cards/batch`.
- Search is typo-tolerant and queries both the user's PKG and the canonical CKG.
- Choosing an existing PKG node attaches it directly to the current card.
- Choosing a canonical CKG node copies or upserts that concept into the user's
  PKG, then attaches the local PKG copy to the card.
- If the user keeps typing without choosing a suggestion, the workflow pivots
  into local-node creation inside the PKG.
- The selected card node can also be edited inline and enriched with local
  relation edges without leaving the card flow.
- Local node and edge edits trigger structural analytics refresh so
  metacognitive-stage and graph-health views can react to those changes.
- The resulting card submission still goes through the Content API client with
  the resolved `knowledgeNodeIds`.

## Implementation Notes

- Route: `apps/web/src/app/(authenticated)/cards/new/page.tsx`
- Shared PKG authoring component:
  `apps/web/src/components/cards/pkg-node-authoring-panel.tsx`
- KG search paths: `usePKGNodes(userId, { searchMode: 'fulltext' })` and
  `useCKGNodes({ searchMode: 'fulltext' })`
- KG write paths: `useCreatePKGNode(userId)`,
  `useUpdatePKGNode(userId, nodeId)`, `useCreatePKGEdge(userId)`,
  `pkgEdgesApi.delete(userId, edgeId)`
- KG analytics refresh path: `useRefreshKnowledgeGraphAnalytics(userId)`
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
