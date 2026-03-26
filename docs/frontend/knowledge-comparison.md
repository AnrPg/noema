# Knowledge Comparison

## Purpose

The comparison view at `/knowledge/comparison` contrasts the learner's PKG with
only the engaged portion of the CKG.

## Scope Model

- Comparison defaults to `engagement_hops`.
- Seed concepts come from PKG nodes that align to canonical nodes.
- The CKG scope is the induced neighborhood around those seeds, expanded by the
  configured hop count.
- Unrelated canonical regions are excluded, so untouched topics do not appear as
  false deficits.

## API Contract

- The comparison API now returns:
  - `missingFromPkg`
  - `extraInPkg`
  - `alignmentScore`
  - `edgeAlignmentScore`
  - scoped `pkgSubgraph`
  - scoped `ckgSubgraph`
  - `scope` metadata describing seeds, hop count, and bootstrap fallback

## Empty State

- If no aligned seed concepts exist yet, the comparison view stays empty rather
  than projecting the full canonical graph as missing.
