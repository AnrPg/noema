# Knowledge Map

## Purpose

The Knowledge Map at `/knowledge` is the learner-facing workspace for reviewing,
editing, and managing the Personal Knowledge Graph (PKG).

## System-Guided Mode

- Stage 1 follows the product rule "system builds, user reviews".
- The page shows canonical comparison signals (`missingFromPkg`,
  `alignmentScore`, `extraInPkg`) and surfaces the next suggested concepts.
- Learners can apply a single suggestion or let the system scaffold the next
  batch of suggested concepts into the PKG.

## PKG Studio

- Create nodes manually.
- Edit the selected node's label, description, and tags.
- Delete the selected node.
- Create outgoing edges from the selected node.
- Remove existing connected edges.

## Boundaries

- PKG structure is still owned by the Knowledge Graph service.
- The page uses the KG API client hooks for node and edge CRUD.
- Comparison remains a review surface; it no longer requires a preselected
  domain to open.
