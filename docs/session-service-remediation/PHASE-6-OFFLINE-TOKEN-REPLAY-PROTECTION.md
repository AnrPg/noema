# Phase 6 — Offline Intent Token Replay Protection

## Goal

Add durable replay protection for offline intent tokens while preserving
key-rotation support.

## Why This Phase Exists

Token claims include nonce/JTI but there is no stateful replay-consumption
guard. Valid signed tokens can be replayed until expiration.

## Scope

### In Scope

- Persist token nonce/JTI usage state with TTL-aware lifecycle.
- Reject replay of previously consumed tokens.
- Keep issuer/audience/signature and key-rotation flow unchanged.
- Add tests for first-use success and replay rejection.

### Out of Scope

- Changes to scheduler-service responsibilities.
- Replacing JWT with different token format.

## Target Files (Expected)

- `services/session-service/prisma/schema.prisma`
- `services/session-service/prisma/migrations/**`
- `services/session-service/src/domain/session-service/session.service.ts`
- `services/session-service/src/infrastructure/database/**` (new repository if
  needed)
- `services/session-service/src/domain/session-service/session.repository.ts`
  (if interface extension needed)
- `services/session-service/tests/**`

## Suggested Persistence Model

- `offline_intent_token_replay_guard` (or equivalent)
  - `jti` / `nonce` (unique)
  - `user_id`
  - `issued_at`
  - `expires_at`
  - `consumed_at` (nullable)
  - `status` (`issued|consumed|expired`)
  - `created_at`, `updated_at`

## Implementation Instructions

1. **Issue-time registration**
   - On token issuance, insert nonce/jti record with expiry metadata.

2. **Verify-time + consume flow**
   - Verify signature/claims as today.
   - Perform atomic consume operation:
     - token exists
     - not expired
     - not consumed
   - Mark consumed at first successful replay path.

3. **Replay rejection**
   - If token already consumed, return deterministic invalid result
     (`valid=false`, replay reason).

4. **Cleanup strategy**
   - Add lightweight cleanup policy for expired records (job/TTL-style
     maintenance).

5. **Key rotation compatibility**
   - Keep existing KID-based verification behavior unchanged.

6. **Tests**
   - First valid use succeeds.
   - Second use of same token fails as replay.
   - Expired token fails.
   - Rotation tests remain green.

## Guardrails

- Do not rely on in-memory replay cache; replay guard must be durable.
- Do not break existing key-rotation and legacy fallback behavior without
  migration notes.
- Do not consume token before signature/issuer/audience checks pass.

## Checklist

- [ ] Replay guard table + migration added.
- [ ] Issue flow stores nonce/jti record.
- [ ] Verify/reconcile flow atomically consumes token once.
- [ ] Replay attempts are rejected with stable response semantics.
- [ ] Expired token handling is consistent.
- [ ] Existing rotation tests still pass.
- [ ] New replay tests added and passing.

## Exit Conditions

- A valid offline intent token is single-use for replay-sensitive flow.
- Replay attacks with reused token are blocked deterministically.
- Token key rotation and verification behavior remains intact.

## Rollback Plan

- Remove consume-on-verify flow and replay table checks.
- Keep signature verification path unchanged.
- Roll back replay table migration if needed.
