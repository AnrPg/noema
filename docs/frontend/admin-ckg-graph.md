# Admin CKG Graph

The admin CKG graph at `/dashboard/ckg/graph` is now a mutation-first authoring
surface, not just a browser.

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

This keeps graph-native authoring inside the admin canvas while preserving the
existing CKG mutation queue as the only publication path.
