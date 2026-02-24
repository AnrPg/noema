# Phase 2 — Session Invariants (Active Session Policy)

## Goal

Enforce deterministic active-session concurrency policy at session start.

## Why This Phase Exists

The codebase declares active-session constraints, but runtime behavior does not
enforce them consistently.

## Scope

### In Scope

- Enforce active session checks during `startSession`.
- Honor `MAX_CONCURRENT_SESSIONS` policy explicitly.
- Define deterministic behavior when policy > 1.
- Add tests for policy-driven outcomes.

### Out of Scope

- Blueprint hash and strict card-order checks (Phase 3).
- Cohort proposal/commit lifecycle (Phase 4).

## Target Files (Expected)

- `services/session-service/src/domain/session-service/session.service.ts`
- `services/session-service/src/config/index.ts` (if policy plumbing needed)
- `services/session-service/tests/**`

## Implementation Instructions

1. **Policy source of truth**
   - Read effective max concurrent sessions from config/options.
   - Keep default behavior explicit and documented.

2. **Pre-create guard**
   - Before creating a new session, check active sessions for user.
   - If policy is `1`, reject when active session exists.

3. **Policy > 1 semantics**
   - Define one of the following and document it:
     - Hard cap: allow up to N active sessions, reject beyond N.
     - Soft cap with replacement is **not allowed** unless explicitly designed.

4. **Error model**
   - Use existing domain error hierarchy (`BusinessRuleError` or dedicated
     subtype).
   - Return stable error code for orchestration consumers.

5. **Tests**
   - No active session → start succeeds.
   - One active session + policy=1 → start rejected.
   - Policy>1 cases → matches documented behavior.

## Guardrails

- Do not silently abandon/expire existing sessions to make room for new ones.
- Do not create race-prone behavior without optimistic/transactional checks.
- Do not leave behavior undefined for policy > 1.

## Checklist

- [ ] `startSession` performs active-session policy check before writes.
- [ ] Policy behavior is deterministic and documented.
- [ ] Stable error code/message for policy violations.
- [ ] Unit tests cover `policy=1` and `policy>1` cases.
- [ ] Existing tests remain green.

## Exit Conditions

- Active-session invariant is enforced in runtime path.
- Behavior aligns with configured concurrency policy.
- No undocumented side effects on existing active sessions.

## Rollback Plan

- Remove pre-create guard and policy checks.
- Restore previous start behavior.
- Revert newly introduced policy-specific tests.
