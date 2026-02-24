# Session Service Remediation — Master Checklist

Use this file as a single progress tracker across all six PR phases.

## Global Preconditions

- [ ] Branch created from latest `main`.
- [ ] Local `session-service` tests passing before changes.
- [ ] Phase scope read and acknowledged.
- [ ] Out-of-scope constraints acknowledged.

## Phase 1 (Security & Ownership)

- [ ] Ownership enforced on user expiration path.
- [ ] Internal/system expiration path scope-gated (if present).
- [ ] Auth bootstrap fails fast when auth enabled and secret invalid.
- [ ] New tests added and passing.
- [ ] OpenAPI/docs updated if route behavior changed.

## Phase 2 (Session Invariants)

- [ ] `startSession` enforces active-session policy.
- [ ] `MAX_CONCURRENT_SESSIONS` behavior deterministic and documented.
- [ ] Stable domain error for policy violations.
- [ ] Tests added for policy=1 and policy>1.

## Phase 3 (Contracts & Blueprint Fidelity)

- [ ] Attempt outcome enum aligned across tool/domain/OpenAPI.
- [ ] Blueprint validation enforces ordered equivalence.
- [ ] Optional `blueprintHash` (if added) deterministic and validated.
- [ ] Contract tests added and passing.

## Phase 4 (Cohort Handshake Lifecycle)

- [ ] Schema migration for cohort persistence added.
- [ ] Propose/accept/revise/commit methods implemented.
- [ ] Revision conflict guards implemented.
- [ ] Session cohort events emitted via outbox.
- [ ] REST + MCP surface added and scope-gated.
- [ ] Lifecycle tests added and passing.

## Phase 5 (Outbox Reliability)

- [ ] Claim/lease model implemented.
- [ ] Retry/backoff scheduling implemented.
- [ ] Graceful drain with timeout implemented.
- [ ] Concurrency and shutdown tests added.
- [ ] Reliability config knobs documented.

## Phase 6 (Offline Replay Protection)

- [ ] Replay guard persistence added.
- [ ] Issue-time record + verify-time atomic consume implemented.
- [ ] Replay attempts deterministically rejected.
- [ ] Rotation compatibility preserved.
- [ ] Replay tests added and passing.

## Global Exit Criteria

- [ ] All six phase exit conditions satisfied.
- [ ] `pnpm --filter @noema/session-service test` passes after each phase.
- [ ] OpenAPI/tool contract sync validated for changed phases.
- [ ] No unresolved security-critical findings remain.
