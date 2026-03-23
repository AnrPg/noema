# Card Creator

## Purpose

The card creator at `/cards/new` is the authoring flow for creating a single
card or a batch of cards in the web app.

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
- Card write path: `useCreateCard()` or `useBatchCreateCards()`

This keeps the frontend aligned with the hexagonal split between the Content
service as card archive and the Knowledge Graph service as the owner of PKG
structure.
