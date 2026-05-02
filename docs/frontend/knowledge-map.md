# Knowledge Map

## Purpose

The Knowledge Map at `/knowledge` is the learner-facing workspace for reviewing,
editing, and managing the Personal Knowledge Graph (PKG).

## System-Guided Mode

- Stage 1 follows the product rule "system builds, user reviews".
- The page shows canonical comparison signals (`missingFromPkg`,
  `alignmentScore`, `extraInPkg`) from an engagement-scoped comparison.
- Canonical suggestions are scoped to the learner's aligned PKG neighborhood and
  expand outward by a small hop radius. When the learner has not engaged with
  any seed concepts yet, the page can bootstrap from the requested domain.
- Learners can apply a single suggestion or let the system scaffold the next
  batch of suggested concepts into the PKG.

## PKG Studio

- Create nodes manually.
- Edit the selected node's label, description, and tags.
- Delete the selected node.
- Batch-delete selected nodes.
- Create outgoing edges from the selected node.
- Remove existing connected edges.
- Reset the entire PKG from the workspace danger zone.
- Controls, node details, and workspace tools now render in dedicated rails
  instead of overlapping the canvas. On wide screens they sit beside the graph;
  on narrower screens they stack while remaining scrollable.

## Destructive actions

The learner-facing workspace now exposes two explicit cleanup tools:

- batch delete for the current multi-selection
- full PKG wipe

### Batch delete

- Available from the manage panel when at least one node is selected
- Deletes every selected PKG node
- Relies on graph-service node deletion semantics so attached edges are removed
  with their deleted nodes
- Reports partial failures without dropping the successful deletions

### Full PKG wipe

- Available from the manage panel danger zone
- Requires typing `DELETE_ALL_PKG_CONTENTS`
- Deletes all PKG nodes plus associated edges for the current user
- Clears user-scoped graph maintenance records and cache entries

## Boundaries

- PKG structure is still owned by the Knowledge Graph service.
- The page uses the KG API client hooks for node and edge CRUD.
- Destructive cleanup still flows through dedicated KG maintenance endpoints.
- Comparison remains a review surface; it no longer requires a preselected
  domain to open.
