# Decisions Log

## Decision Request Resolution - 2026-03-24 - Architect

**Question:** How should the ontology-imports pipeline be scoped for the first
implementation wave?

**Answer:**

1. Keep ontology imports inside `knowledge-graph-service`
2. Use `YAGO + ESCO + ConceptNet` as the first pilot sources
3. Require normalized output to flow through reviewable CKG mutations before
   canonical publish
