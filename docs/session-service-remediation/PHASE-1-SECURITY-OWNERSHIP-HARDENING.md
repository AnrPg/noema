# Phase 1 — Security & Ownership Hardening

## Goal

Eliminate unauthorized session expiration paths and enforce secure auth
bootstrap behavior.

## Why This Phase Exists

Current behavior allows an ownership bypass on session expiration and permits
weak startup auth configuration. This is a P0 safety issue.

## Scope

### In Scope

- Enforce ownership checks for user-facing expiration flows.
- Add explicit internal/system expiration pathway if required.
- Fail fast on invalid auth secret configuration (when auth is enabled).
- Add/adjust unit tests and route-level tests for authorization behavior.

### Out of Scope

- Cohort handshake lifecycle.
- Session concurrency policies.
- Outbox reliability model redesign.

## Target Files (Expected)

- `services/session-service/src/domain/session-service/session.service.ts`
- `services/session-service/src/api/rest/session.routes.ts`
- `services/session-service/src/middleware/auth.middleware.ts`
- `services/session-service/src/index.ts`
- `services/session-service/tests/**`

## Implementation Instructions

1. **Separate expiration entry points**
   - Keep one user-facing method that always verifies session ownership.
   - Add an internal/system method for infrastructure-triggered expiry if
     needed.

2. **Route policy split**
   - User route must map to ownership-enforced method.
   - Internal/system route (if introduced) must require stronger scope/admin
     role.

3. **Auth bootstrap hardening**
   - If `AUTH_DISABLED` is not `true`, require non-empty signing key material.
   - Allow `AUTH_DISABLED=true` only in `development` or `test`.
   - Fail service startup with clear error message when misconfigured.

## Operational Notes

- `AUTH_DISABLED=true` is intended for local/test workflows only and must not be
  used in production-like environments.
- In production-like environments, set either `JWT_SECRET` or
  `ACCESS_TOKEN_SECRET`.
- Recommended deployment policy:
  - `NODE_ENV=production` + `AUTH_DISABLED=false` + non-empty signing secret
  - health checks should fail fast if auth preflight fails

4. **Error semantics**
   - Preserve current domain error classes and HTTP status conventions.
   - Do not leak sensitive auth diagnostics in external responses.

5. **Tests**
   - Add tests proving non-owner cannot expire another user’s session.
   - Add config/bootstrap tests proving invalid auth setup fails fast.

## Guardrails

- Do not widen route access while adding internal expiration support.
- Do not introduce implicit trust in request headers for ownership.
- Do not silently fallback to insecure defaults when secrets are absent.
- Keep behavior deterministic and explicit.

## Checklist

- [ ] User-facing expiration path calls ownership-enforced session lookup.
- [ ] Non-owner expiration attempt returns authorization failure.
- [ ] Internal/system expiration path (if present) is scope-gated.
- [ ] Startup fails when auth is enabled and secret is missing/invalid.
- [ ] Existing tests remain green.
- [ ] New tests cover owner/non-owner and config failure behavior.

## Exit Conditions

- Unauthorized cross-user expiration is impossible via public API.
- Service cannot boot in insecure auth-enabled misconfiguration state.
- CI tests for `session-service` pass.

## Rollback Plan

- Revert route wiring and method split.
- Restore previous startup auth checks.
- Keep any added tests disabled/removed with rollback commit.
