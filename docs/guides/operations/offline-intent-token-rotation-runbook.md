# Offline Intent Token Rotation Runbook

## Scope

This runbook covers secret rotation for signed offline intent tokens.

`session-service` is the **single authority** for the entire offline intent
token lifecycle: issuance, verification, and rotation (see ADR-0023).
`scheduler-service` is a pure computation engine and is **not involved** in
token operations.

## Required Environment Variables (session-service)

- `OFFLINE_INTENT_TOKEN_KEYS`
  - Format: comma-separated `kid:secret` pairs
  - Example: `v1:old-32+-char-secret,v2:new-32+-char-secret`
- `OFFLINE_INTENT_TOKEN_ACTIVE_KID`
  - The key id used by `session-service` for new token signing
- `OFFLINE_INTENT_TOKEN_ISSUER` (default: `noema.session`)
- `OFFLINE_INTENT_TOKEN_AUDIENCE` (default: `noema.mobile`)

Legacy fallback remains supported with `OFFLINE_INTENT_TOKEN_SECRET`, but
key-ring configuration is recommended for rotation.

## Pre-Checks

1. Generate new secret material (minimum 32 characters).
2. Confirm `session-service` will receive the updated key ring.
3. Confirm deployment order can be controlled.
4. Confirm observability dashboards are available for token verification
   failures.

## Rotation Procedure

### Phase 1: Introduce New Key (No Cutover)

1. Keep current key as active.
2. Add new key to `OFFLINE_INTENT_TOKEN_KEYS` alongside current key.
3. Set `OFFLINE_INTENT_TOKEN_ACTIVE_KID` to current key id.
4. Deploy `session-service`.
5. Verify error rates remain stable.

Outcome: session-service verifies tokens signed by both old and new keys, while
new tokens still use old key.

### Phase 2: Cut Over Signing Key

1. Change `OFFLINE_INTENT_TOKEN_ACTIVE_KID` to the new key id.
2. Deploy `session-service`.
3. Verify newly issued tokens carry new `kid` and pass verification.

Outcome: new tokens are signed with new key; old tokens remain verifiable during
grace period.

### Phase 3: Retire Old Key

1. Wait for grace period >= maximum offline intent token lifetime.
2. Remove old key from `OFFLINE_INTENT_TOKEN_KEYS`.
3. Keep `OFFLINE_INTENT_TOKEN_ACTIVE_KID` on new key.
4. Deploy `session-service`.
5. Confirm no spike in offline intent token verification failures.

Outcome: only new key remains trusted.

## Recommended Grace Period

Use at least the maximum `expiresInSeconds` allowed for offline intent tokens
plus a safety margin for delayed client replay.

## Rollback

If verification failures spike after cutover:

1. Re-add old key to `OFFLINE_INTENT_TOKEN_KEYS`.
2. Set `OFFLINE_INTENT_TOKEN_ACTIVE_KID` back to old key.
3. Redeploy `session-service`.
4. Re-run pre-checks before retrying.

## Operational Checklist

- [ ] New key generated and stored securely.
- [ ] Key ring configured for `session-service`.
- [ ] Phase 1 deployed and verified.
- [ ] Phase 2 deployed and verified.
- [ ] Grace period elapsed.
- [ ] Old key removed.
- [ ] Post-rotation monitoring clean.
