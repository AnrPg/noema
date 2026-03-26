# Knowledge Graph Comparison

## Overview

PKG↔CKG comparison is now engagement-scoped instead of purely domain-wide.

## Flow

1. Fetch the requested PKG and CKG candidate subgraphs.
2. Align PKG nodes to CKG nodes by normalized label, node type, and domain.
3. Use the aligned canonical nodes as engagement seeds.
4. Expand the canonical graph by `hopCount` undirected hops.
5. Re-run structural comparison against that scoped canonical subgraph.
6. Map the domain result into an API DTO with scope metadata and scoped
   subgraphs for the frontend.

## Request Parameters

- `domain` is optional for comparison.
- `scopeMode` supports `engagement_hops` and `domain`.
- `hopCount` controls the neighborhood radius.
- `bootstrapWhenUnseeded` allows onboarding surfaces to fall back to a broader
  canonical scope when no seeds exist yet.

## Notes

- Metrics and structural health remain domain-based.
- The comparison route now performs an explicit domain-to-API mapping so the
  frontend receives flattened `missingFromPkg` and `extraInPkg` arrays instead
  of the raw domain comparison object.
