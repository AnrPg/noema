# ADR-015: Cohort Handshake Protocol Removed

| Field       | Value                                            |
| ----------- | ------------------------------------------------ |
| **Status**  | Accepted                                         |
| **Date**    | 2026-05-01                                       |
| **Phase**   | Realignment                                      |
| **Authors** | Codex (AI), directed by project owner            |
| **Sources** | `IMPLEMENTATION_PLAN_FINAL.md`, `REALIGNMENT.md` |

## Context

The existing scheduler/session protocol negotiates card cohorts through
proposal, accept, revise, commit, lineage, and inbox state. That protocol
belongs to the old card-cohort model.

The realignment loop is event-driven around Steps, Evaluations, Triggers,
Strategy replans, Guardian validation, concept schedule updates, KG state
projection, and gamification projections.

## Decision

Remove the cohort handshake protocol.

Deleted concepts include:

- `SessionCohortHandshake`
- `ScheduleProposal`
- `ScheduleCommit`
- `ScheduleCohortLineage`
- `SchedulerHandshakeState`
- old cohort/inbox tables used only for the card-cohort protocol
- `session.cohort.*` and `scheduler.cohort.*` event types

They are replaced by the closed-loop realignment events and Step queue updates.

## Rationale

- The old handshake negotiates card cohorts; the new loop responds to concept
  evidence and Step-level interventions.
- Keeping both protocols would create two orchestration paths for the same
  learner state.
- Event reliability can be reused, but cohort lineage itself is stale.

## Alternatives Considered

| Option                                | Pros                     | Cons                                                      | Rejected because                                                        |
| ------------------------------------- | ------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| Adapt cohort handshakes to Steps      | Reuses existing protocol | Retains negotiation shape that no longer maps to the loop | Strategy replans and Guardian validation are the new orchestration unit |
| Keep cohort tables for audit only     | Historical trace         | More persistence to maintain with no new writes           | Dev data loss is acceptable and the app is unreleased                   |
| Delete only service code, keep events | Smaller event migration  | Old event names invite accidental reuse                   | The plan requires removing cohort event types                           |

## Phase Plan

Batches 1, 4, and 6 remove the event contracts, session-side schema/code, and
scheduler-side schema/code respectively. Batch 13 proves replay convergence
through the new loop.

## Replacement Protocol

The old proposal/accept/revise/commit lineage is replaced by:

1. session-service presents a Step from its Step queue.
2. metacognition-service records Evaluation and emits Triggers.
3. scheduler-service updates concept schedule state from Evaluation evidence.
4. knowledge-graph-service recomputes concept stability projection.
5. session-service strategy module commits minimum-sufficient replans.
6. Pedagogy Guardian validates learner-facing artifacts before they are exposed.

Event consumer reliability patterns may be reused, but old event names and old
cohort lineage state must not be reused.

## Required Grep Checks

Later deletion batches must eliminate production-code references to:

- `session.cohort.`
- `scheduler.cohort.`
- `SessionCohortHandshake`
- `ScheduleProposal`
- `ScheduleCommit`
- `ScheduleCohortLineage`
- `SchedulerHandshakeState`

## Step Log

- 2026-05-01: Decision recorded before implementation.
- 2026-05-01: Expanded replacement protocol and grep checks during the deeper
  Batch 0 pass.

## Emergent Decisions During Implementation

- None yet.

## Consequences

- Existing ADRs that introduced scheduler/session cohort handshakes are
  superseded for orchestration design.
- Any future cohort negotiation must be redesigned against the Step/concept loop
  and cannot restore the old card-centric tables.

## References

- `IMPLEMENTATION_PLAN_FINAL.md` sections 15 and 16 Batches 1, 4, 6, and 13.
- `REALIGNMENT.md` section 8.
