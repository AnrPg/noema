# ADR-037 — Content Generation Provenance Boundary

- **Date:** 2026-05-02
- **Status:** accepted
- **Deciders:** Architect, Codex

## Context

Batch 11 was previously framed as agent generation work, but the May 2
content-service plan makes content provenance, review eligibility, generation
jobs, and curriculum-aware selection durable platform responsibilities. The
existing `source` and `knowledgeNodeIds` fields are too loose to distinguish
authored, RAG-grounded, and autonomous generated content safely.

## Decision

Content-service owns durable card provenance, review state, transformation
lineage, async generation jobs, and concept coverage. Cards use `originMode`,
`reviewState`, `anchoredCkgNodeIds`, and `anchoredPkgNodeIds` as canonical
fields. Generated or transformed instructional output must pass Pedagogy
Guardian before activation or session use. Session-service must bind LessonPlans
to selected curriculum nodes and reject plans that do not serve at least one
selected node.

## Rationale

This keeps LLM drafting outside content-service while making persistence,
eligibility, and lineage deterministic. It also prevents legacy authored cards
with incomplete metadata from silently entering sessions.

## Alternatives Considered

| Option                                                       | Pros                         | Cons                                                          | Rejected because                      |
| ------------------------------------------------------------ | ---------------------------- | ------------------------------------------------------------- | ------------------------------------- |
| Keep `source` and `knowledgeNodeIds` as public provenance    | Smallest migration           | Cannot encode review gates, citations, or CKG/PKG distinction | It preserves the unsafe legacy design |
| Let agents persist cards directly                            | Fast agent iteration         | Bypasses Guardian, review, and coverage invariants            | Violates service boundary ownership   |
| Content-service owns generation orchestration and provenance | Durable, auditable, testable | Requires schema/API migration                                 | Accepted                              |

## Consequences

- Positive: session selection can exclude unsafe or incomplete content by
  default.
- Positive: variants have durable lineage and never mutate parent cards.
- Trade-off: existing cards missing anchors/tags must be repaired before use.
- Follow-up: remove transitional legacy `source`/`knowledgeNodeIds` response
  usage once all clients consume canonical fields.
