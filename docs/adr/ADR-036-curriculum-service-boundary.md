# ADR-036 — Curriculum Service Boundary

- **Date:** 2026-05-02
- **Status:** accepted
- **Deciders:** Architect, Codex, human

## Context

Batch 11 introduces durable, user-vault learning paths that outlive any single
session. Existing Batch 0-10 architecture assigns LessonPlans and Steps to
`session-service`, concept schedule state to `scheduler-service`, canonical
evaluations/triggers to `metacognition-service`, and graph structure to
`knowledge-graph-service`.

## Decision

Create `@noema/curriculum-service` as a separate bounded context. It owns
curricula as versioned DAGs, stable node identity across versions, per-user
curriculum progress, deterministic traversal frontiers, session-slice selection,
realignment evidence, and per-change revision proposals.

Curriculum DAGs are persisted separately from the CKG. Curriculum nodes may
reference CKG concept IDs as anchors, or carry proposed concept payloads that
must pass through the existing CKG mutation DSL and Guardian path before they
become canonical graph concepts.

## Rationale

The curriculum artifact is neither graph truth nor session runtime state.
Keeping it separate prevents session-service from becoming a multi-month
planning store, and prevents knowledge-graph-service from storing user-specific
traversal plans inside the canonical graph.

## Alternatives Considered

| Option                                     | Pros                                        | Cons                                                     | Rejected because                                   |
| ------------------------------------------ | ------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| Store curricula in session-service         | Reuses session persistence                  | Blurs per-session aggregate and long-run plan ownership  | Curricula outlive sessions                         |
| Store curricula in knowledge-graph-service | Reuses graph concepts and edges             | Mixes user traversal plans with PKG/CKG structural truth | Curriculum DAGs are product plans, not graph facts |
| New curriculum-service                     | Clear ownership and independent revision UX | New service/API surface                                  | Matches Batch 11 durable curriculum boundary       |

## Consequences

- Positive: session creation can require curriculum binding without making
  session-service own curriculum traversal.
- Positive: curriculum revisions can be proposed, approved per change, and
  versioned independently.
- Trade-off: service orchestration now includes curriculum-service calls before
  LessonPlan generation.
- Follow-up: frontend and agent tooling should move from scaffolded v1 surfaces
  to live data wiring once the service is deployed behind the gateway.

## References

- `docs/plans/2026-05-02-batch-11-curriculum-service.md`
- `architecture.md`
- `module-graph.md`
