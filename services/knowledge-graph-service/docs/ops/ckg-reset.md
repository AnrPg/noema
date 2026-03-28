# CKG Reset

Use the reset command when you want a clean canonical graph before re-importing
ontologies.

## Command

```bash
pnpm --filter @noema/knowledge-graph-service ckg:reset -- --force
```

This wipes:

- Neo4j `:CkgNode` nodes and their relationships
- PostgreSQL CKG workflow/import tables:
  - `aggregation_evidence`
  - `ckg_mutation_audit_log`
  - `ckg_mutations`
  - `ontology_parsed_batches`
  - `ontology_import_checkpoints`
  - `ontology_import_artifacts`
  - `ontology_import_runs`
- Redis cache entries scoped to CKG graph reads
- local ontology-import artifacts under
  `.data/knowledge-graph-service/ontology-imports`

## Optional Full Registry Wipe

```bash
pnpm --filter @noema/knowledge-graph-service ckg:reset -- --force --include-sources
```

Add `--include-sources` only if you also want to delete
`ontology_import_sources`.

## Why This Is Not A Prisma Migration

The reset spans PostgreSQL, Neo4j, Redis, and local artifacts. Making it an
explicit command keeps the destructive step manual and prevents accidental wipes
during normal schema deploys.
