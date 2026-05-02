# Admin CKG Graph

The admin CKG graph at `/dashboard/ckg/graph` is now a mutation-first authoring
surface, not just a browser.

The admin CKG workspace home at `/dashboard/ckg` also exposes destructive
maintenance controls for canonical cleanup.

## Relation authoring

- Left-click a node, or right-click a node once, to choose the source concept.
- Right-click a second node to open the canonical edge authoring popup.
- The popup requests a CKG edge-authoring preview before showing actions.
- All candidate edge types remain visible.
- Allowed edge types are active and submit a standard CKG mutation proposal.
- Blocked edge types stay greyed out and list their guardrail reasons inline.

## Existing edge edits

- When the selected node pair already has canonical relations, the popup shows
  them in an "Existing relations" section.
- Each existing relation can be submitted as a `remove_edge` mutation directly
  from that popup.
- Replacements still go through the same review path: propose removal, then
  propose the new allowed relation.

## Review model

- The admin graph never writes directly to the CKG.
- Node edits still submit `update_node` mutations.
- Edge additions are created from `authoring-preview -> proposal -> mutation`.
- Edge removals submit `remove_edge` mutations.
- Canvas rendering only includes relations whose source and target nodes are
  present in the current visible node set. This keeps type filters and stale
  maintenance cleanup edges from crashing the force-graph simulation.

This keeps graph-native authoring inside the admin canvas while preserving the
existing CKG mutation queue as the only publication path.

## Maintenance controls

The admin workspace now includes two destructive maintenance actions in its
"Danger Zone" panel:

- full CKG reset
- provenance-targeted source purge

### Full reset

- Requires typing `DELETE_ALL_CKG_CONTENTS`
- Deletes canonical Neo4j graph contents
- Clears CKG workflow tables and cache entries
- Removes ontology import artifacts
- Can optionally remove registered ontology sources as part of the reset

### Source purge

- Requires typing `DELETE_SELECTED_CKG_STREAM`
- Accepts a stream/source identifier such as `yago`, `esco`,
  `users_aggregation`, `agents`, or `admin_manual`
- Deletes matching canonical nodes and their associated edges
- Removes related mutation records, aggregation evidence, and ontology-import
  staging artifacts associated with that stream
- Can optionally delete the source registration entry for imported ontology
  sources

These controls are intended for operational cleanup and rollback scenarios. They
perform immediate backend deletion rather than opening a moderation proposal.
