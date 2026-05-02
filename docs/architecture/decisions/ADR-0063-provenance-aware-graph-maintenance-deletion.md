# ADR-0063: Provenance-Aware Graph Maintenance Deletion

## Status

Accepted

## Date

2026-04-19

## Context

Noema already had graph deletion primitives in the knowledge-graph service, but
the operational surfaces were incomplete:

- admins could not selectively purge canonical graph content by ingestion stream
  from the frontend
- learners could not batch-delete selected PKG nodes from the knowledge map
- learners could not fully wipe their PKG from the product UI

At the same time, canonical cleanup cannot be modeled as a naive "delete all
nodes with label X" operation. CKG content is produced by several pipelines:

- ontology imports such as `yago` and `esco`
- user aggregation flows
- agent-authored proposals
- direct admin-authored mutations

Deleting one provenance stream must also clean up dependent operational state
such as:

- attached edges
- mutation records
- aggregation evidence
- ontology import artifacts and checkpoints
- cache entries

## Decision

### 1) Add explicit maintenance APIs for CKG and PKG cleanup

The knowledge-graph service exposes dedicated maintenance routes for:

- full CKG reset
- CKG purge by source/stream
- PKG batch node deletion
- full PKG reset

### 2) Treat canonical cleanup as provenance-aware deletion

Canonical purge operates on stream identity, not only graph shape. The service
matches content using persisted provenance markers from node and edge metadata,
including import-source identifiers and maintenance stream IDs written during
canonical mutation commit.

### 3) Cascade deletions across related graph and operational records

Maintenance deletion must remove the graph content and its directly associated
operational records so the system does not retain orphaned workflow data.

For CKG purge/reset this includes:

- Neo4j nodes and edges
- mutation workflow rows
- aggregation evidence
- ontology import run artifacts/checkpoints/parsed batches
- graph cache entries

For PKG reset this includes:

- user PKG nodes and edges
- operation log entries
- structural metric snapshots
- misconception records
- user-scoped aggregation evidence
- graph cache entries

### 4) Expose destructive actions in role-appropriate frontend workspaces

The admin CKG dashboard exposes full reset and source-specific purge controls.
The learner knowledge map exposes batch node deletion and full PKG wipe inside
its management workspace.

## Rationale

### Why dedicated maintenance APIs

- destructive cleanup should be auditable and explicit
- frontend convenience buttons should call stable use-case endpoints, not ad hoc
  scripts
- role-aware routes are easier to secure and document

### Why provenance-aware matching

- canonical graph data comes from multiple pipelines that can overlap
- stream-level rollback is only safe when cleanup understands origin metadata
- deleting by provenance reduces collateral damage during source rollback

### Why cascade associated records

- graph deletion without workflow cleanup leaves operational drift behind
- reviewers and admins need the graph state and the workflow state to agree
- cache invalidation is mandatory after destructive maintenance

## Alternatives Considered

| Option                                                      | Pros                       | Cons                                                       | Rejected because                     |
| ----------------------------------------------------------- | -------------------------- | ---------------------------------------------------------- | ------------------------------------ |
| Expose only full graph resets                               | Simple implementation      | Too destructive for source rollback and user batch cleanup | Did not satisfy the operational need |
| Run manual DB scripts for source cleanup                    | Flexible for operators     | Not productized, not role-aware, easy to misuse            | Unsafe and undiscoverable            |
| Delete only graph nodes and ignore associated workflow rows | Lower immediate complexity | Leaves orphaned evidence, import records, and stale cache  | Breaks operational consistency       |

## Consequences

### Positive

- admins can now roll back one canonical stream without dropping the entire CKG
- learners can manage or fully reset their PKG from the product UI
- graph deletion semantics are documented and routed through stable APIs

### Negative / trade-offs

- maintenance logic now depends on provenance metadata being written correctly
- source purge remains best-effort for older graph records that predate stream
  stamping
- destructive UI requires strong confirmation text and careful access control

### Follow-up tasks created

- extend maintenance stream stamping to all remaining canonical write paths
- add route/integration coverage for source-targeted CKG purge and PKG reset
- surface operational audit history for destructive maintenance actions

## References

- `C:\Users\anr\Apps\noema\docs\backend\mode-aware-knowledge-graph.md`
- `C:\Users\anr\Apps\noema\docs\frontend\admin-ckg-graph.md`
- `C:\Users\anr\Apps\noema\docs\frontend\knowledge-map.md`
- `C:\Users\anr\Apps\noema\architecture.md`
