# Phase 5 — Event Handshake and Consumer Reliability

## Objective

Make multi-service scheduler orchestration resilient, traceable, and replay-safe.

## Covers Gaps

14, 15, 16, 17, 18, 19, 31 (completion)

## Required Outputs

- Expanded event taxonomy for session cohort orchestration.
- First-class reconciliation handshake between agent/session/scheduler.
- Full causal metadata propagation across API and event boundaries.
- Consumer idempotency protection and stale-pending recovery.
- Graceful drain shutdown behavior.

## Tasks

- [x] Add/consume event types for propose/accept/revise/commit flows.
- [x] Implement handshake orchestration state transitions.
- [x] Propagate and persist linkage IDs:
  - `correlationId`
  - `proposalId`
  - `decisionId`
  - `sessionId`
  - `sessionRevision`
- [x] Add inbox dedupe strategy for consumer processing.
- [x] Add pending-message recovery at startup (claim/replay pattern).
- [x] Add bounded graceful drain for in-flight messages.
- [x] Add reliability tests (duplicate delivery, replay, restart recovery).

## Constraints

- Ensure event handling remains idempotent under reorder and duplication.
- Keep redis-stream implementation compatible with future Kafka migration path.

## Exit Criteria

- [x] Duplicate/reordered events do not corrupt scheduler state.
- [x] Pending message recovery succeeds after restart.
- [x] Reconciliation lineage is queryable end-to-end.
