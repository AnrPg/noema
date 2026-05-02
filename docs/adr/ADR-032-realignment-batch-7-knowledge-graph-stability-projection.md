# ADR-032: Realignment Batch 7 Knowledge Graph Stability Projection

- **Date:** 2026-05-02
- **Status:** accepted
- **Deciders:** Codex

## Context

Realignment Batch 7 moves learner-facing concept state into
knowledge-graph-service. `REALIGNMENT.md` §3 requires every concept to be either
`stable` or `unstable`, derived from both FSRS stability and recent reasoning
quality. `IMPLEMENTATION_PLAN_FINAL.md` Batch 7 requires
`ConceptStateProjection`, `ConceptStateHistory`, recomputation on metacognition
and scheduler events, concept-state read APIs, prerequisite-gap APIs, user
stability summaries, Neo4j PKG state maintenance, and deletion/replacement of
mastery-summary contracts.

## Decision

Implement Batch 7 inside knowledge-graph-service as a derived projection:

1. Add Prisma models and migrations for `ConceptStateProjection`,
   `ConceptStateHistory`, and a compact event inbox for idempotent KG state
   recomputation.
2. Add a domain/application service that computes
   `ConceptState = STABLE | UNSTABLE` from FSRS stability and a rolling
   reasoning average using config thresholds `S_RET`, `R_REAS`, and
   `N_REASONING_WINDOW`.
3. Subscribe knowledge-graph-service to `metacognition.evaluation.recorded` and
   `scheduler.concept_state.updated`, recompute affected projections, write
   history on flips, maintain the Neo4j PKG concept `state` property, and emit
   `knowledge_graph.concept_state.changed` on flips.
4. Add REST APIs for concept state, concept state history, prerequisite gaps,
   and user stability summary.
5. Remove or replace mastery-summary public contracts and learner-facing
   "mastery" vocabulary in the affected KG/API-client surface.

## Rationale

The binary state is a derived view layered on top of scheduler FSRS math, not a
replacement for scheduling. Keeping the projection in knowledge-graph-service
lets graph traversal, prerequisite gaps, dashboard summaries, and downstream
gamification use one source of truth while the scheduler remains focused on due
dates and queues.

## Alternatives Considered

| Option                                   | Pros                 | Cons                                                        | Rejected because                                      |
| ---------------------------------------- | -------------------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| Store binary state in scheduler-service  | Close to FSRS data   | Makes KG graph APIs depend on scheduler internals           | Batch 7 explicitly assigns projection ownership to KG |
| Compute state on every REST request only | No projection tables | Cannot emit flip events or maintain Neo4j state efficiently | Spec requires history and events                      |
| Keep mastery endpoints as aliases        | Easier compatibility | Violates direct-delete/rename policy                        | Batch 7 says replace mastery summary contracts        |

## Consequences

- Positive: KG exposes revocable, binary stability state per concept.
- Positive: prerequisite-gap and stability-summary APIs use current projection
  state.
- Negative / trade-offs: The projection depends on scheduler and metacognition
  event availability; incomplete event delivery leaves projections stale until
  replay/recompute.
- Follow-up tasks created: none yet.

## Implementation Notes

- `knowledge-graph-service` now owns the concept-state projection service,
  Prisma repository, Neo4j state port, REST routes, event consumer, and focused
  tests.
- `@noema/api-client` now exposes stability-summary, concept-state,
  concept-state history, and prerequisite-gap helpers.
- Active backend and frontend docs now use stability vocabulary; the old
  mastery-summary route is no longer present in active source.

## References

- `REALIGNMENT.md` §3.
- `IMPLEMENTATION_PLAN_FINAL.md` §4.11, §12, §16 Batch 7.
- `docs/adr/ADR-021-revocable-concept-stability.md`
- `docs/adr/ADR-031-batch-6-conformance-signoff.md`
