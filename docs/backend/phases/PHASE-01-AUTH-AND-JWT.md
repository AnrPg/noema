# Phase 1 — Authentication, JWT Scopes & Account Flows

> **Codename:** `Blood-Brain Barrier` **Depends on:** Phase 0 (API Gateway — so
> endpoints are reachable) **Unlocks:** Phase 3 (Scheduler — needs scopes to
> authorize), Phase 4 (Admin — needs role management), Frontend Phase 4 (Auth &
> Onboarding) **Estimated effort:** 3–4 days

---

## Why This Exists

The blood-brain barrier is the body's most selective gatekeeper — it decides
what enters the brain and what doesn't. Noema's authentication layer serves the
same role, but it has three holes:

1. **JWT tokens carry no `scopes` claim.** The scheduler-service requires
   `scheduler:plan` and `scheduler:write` scopes on every request. The
   user-service signs JWTs with `{ sub, roles, type }` only — no scopes. In
   production, every scheduler call will return 403. In dev mode, the scheduler
   hard-codes fallback scopes that are incomplete (missing `scheduler:write`),
   so even dev-mode schedule commits fail.

2. **No password reset flow.** The `User` model has `emailVerified` and the
   Prisma schema is ready, but there are no routes for forgot-password, reset-
   password, or email verification. The frontend's Phase 4 (Auth & Onboarding)
   includes a forgot-password page that currently has no backend to call.

3. **No username or email change.** The profile update endpoint accepts
   `displayName`, `bio`, `avatarUrl`, `timezone`, `language`, `country` — but
   not `username` or `email`. Users who mistype their email at registration are
   stuck.

These aren't nice-to-haves. Without scopes, the entire scheduling system is
unreachable. Without password reset, the platform has no account recovery. These
are authentication fundamentals.

---

## Tasks

### T1.1 — Add `scopes` Claim to JWT Payload

**Current state:** The user-service `TokenService` signs JWTs with:

```
{ sub: userId, roles: ['user'], type: 'access' }
```

The scheduler-service `requireScopes()` middleware reads `payload['scopes']`
(array) or `payload['scope']` (space-delimited string). It finds neither, so
scopes resolve to `[]`, and every guarded endpoint returns 403.

**What to build:**

A scope derivation function that maps roles to scopes. When the user-service
generates an access token, it should include a `scopes` claim computed from the
user's roles.

**Scope mapping rules:**

| Role      | Granted Scopes                                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `user`    | `scheduler:plan`, `scheduler:write`, `session:read`, `session:write`, `content:read`, `content:write`, `kg:read`, `kg:write` |
| `admin`   | All `user` scopes + `admin:read`, `admin:write`, `scheduler:admin`, `session:system:expire`, `kg:admin`, `content:admin`     |
| `agent`   | `scheduler:plan`, `scheduler:write`, `session:write`, `kg:read`, `kg:write`, `kg:admin`, `content:read`                      |
| `service` | All scopes (internal service-to-service calls)                                                                               |

**Implementation requirements:**

- The scope derivation logic should live in a dedicated function (e.g.,
  `deriveScopesFromRoles(roles: string[]): string[]`) for testability
- Scopes should be an array in the JWT payload:
  `scopes: ['scheduler:plan', ...]`
- The function must be deterministic: same roles → same scopes, always
- Maximum token size: the JWT must stay under 8KB with all scopes included
  (should be fine — a dozen scope strings are ~200 bytes)
- Update the `ITokenPayload` type to include `scopes: string[]`

**Also fix the dev fallback:** The scheduler-service's dev-mode auth bypass
hard-codes
`['scheduler:plan', 'scheduler:tools:read', 'scheduler:tools:execute']` but
omits `scheduler:write`. Add `scheduler:write` to the dev fallback so schedule
commits work in development.

**Testing:** After this change, a logged-in user should be able to call
`POST /api/v1/scheduler/dual-lane/plan` through the gateway and receive a 200
instead of 403.

### T1.2 — Forgot Password Flow

Build the complete password reset lifecycle: request → email → token → reset.

**New endpoints:**

| Method | Path                    | Auth | Description                                                                  |
| ------ | ----------------------- | ---- | ---------------------------------------------------------------------------- |
| `POST` | `/auth/forgot-password` | None | Accepts `{ email }`, generates a reset token, sends a reset email            |
| `POST` | `/auth/reset-password`  | None | Accepts `{ token, newPassword }`, validates the token, sets the new password |

**How it works:**

1. User submits their email to `POST /auth/forgot-password`
2. The service looks up the user by email. **Always return 200** regardless of
   whether the email exists (prevents email enumeration attacks)
3. If the user exists:
   - Generate a cryptographically secure token (e.g., 64 random bytes,
     hex-encoded)
   - Store the token hash (not the raw token) in a new `password_reset_tokens`
     table with: `userId`, `tokenHash`, `expiresAt` (15 minutes from now),
     `usedAt` (null)
   - Send an email containing a link:
     `{FRONTEND_URL}/auth/reset-password?token={rawToken}`
4. User clicks the link, the frontend presents a "new password" form
5. Frontend submits `POST /auth/reset-password` with the raw token + new
   password
6. Backend hashes the incoming token, finds the matching row, validates it
   hasn't expired or been used, sets the new password hash, marks the token as
   used, and revokes all existing refresh tokens for that user

**New Prisma model:**

| Model                | Table                   | Fields                                                                     |
| -------------------- | ----------------------- | -------------------------------------------------------------------------- |
| `PasswordResetToken` | `password_reset_tokens` | id (UUID), userId → User, tokenHash (unique), expiresAt, usedAt, createdAt |

**Email sending:** For now, log the reset URL to the console (stdout) in
development. Integrate with a real email provider later. The important thing is
the token lifecycle and security — email delivery is a pluggable concern.

**Security requirements:**

- Tokens expire after 15 minutes
- Tokens are single-use (mark `usedAt` on consumption)
- Store only the hash of the token, not the raw value
- Rate-limit `POST /auth/forgot-password` to 3 requests per email per hour
- After successful reset, invalidate all refresh tokens (force re-login on all
  devices)

### T1.3 — Email Verification Flow

Enable email verification for new accounts.

**New endpoints:**

| Method | Path                        | Auth       | Description                                         |
| ------ | --------------------------- | ---------- | --------------------------------------------------- |
| `POST` | `/auth/verify-email`        | None       | Accepts `{ token }`, marks user email as verified   |
| `POST` | `/auth/resend-verification` | Bearer JWT | Resends the verification email for the current user |

**How it works:**

1. During `POST /auth/register`, after user creation: generate a verification
   token, store its hash in a new `email_verification_tokens` table, and "send"
   an email with a link: `{FRONTEND_URL}/auth/verify-email?token={rawToken}`
2. User clicks the link → fronted calls `POST /auth/verify-email` with the token
3. Backend validates the token, sets `user.emailVerified = true`
4. If the token expired (24 hours), user can request a new one via
   `POST /auth/resend-verification` (requires being logged in)

**New Prisma model:**

| Model                    | Table                       | Fields                                                                     |
| ------------------------ | --------------------------- | -------------------------------------------------------------------------- |
| `EmailVerificationToken` | `email_verification_tokens` | id (UUID), userId → User, tokenHash (unique), expiresAt, usedAt, createdAt |

**Token lifecycle:**

- Verification tokens expire after 24 hours (longer than password reset because
  users may not check email immediately)
- Single-use: mark `usedAt` on consumption
- One active token per user at a time — generating a new one invalidates the
  previous
- `POST /auth/resend-verification` is rate-limited to 3 requests per hour

**Impact on existing behavior:**

- Registration should still work without verification — `emailVerified` defaults
  to `false` and the user can still log in. Verification is not a blocker for
  access (initially). This can be made stricter later via a feature flag.

### T1.4 — Username and Email Change Endpoints

Users need the ability to update their username and email. These are separate
from the profile update because they have unique validation requirements and
side effects.

**New endpoints:**

| Method  | Path                  | Auth                        | Description                |
| ------- | --------------------- | --------------------------- | -------------------------- |
| `PATCH` | `/users/:id/username` | Bearer JWT (owner or admin) | Change username            |
| `PATCH` | `/users/:id/email`    | Bearer JWT (owner or admin) | Start email change process |

**Username change:**

- Accepts `{ username, version }` (optimistic locking, same pattern as profile
  update)
- Validates: unique, 3–30 characters, alphanumeric + underscores only
- Rate-limited: once per 30 days per user (prevent abuse)
- Publishes `UserUsernameChanged` event

**Email change:**

- Accepts `{ newEmail, password }` (requires password confirmation for security)
- Does NOT immediately change the email
- Instead:
  1. Validates the new email is unique
  2. Generates a verification token for the new email
  3. Sends a verification email to the new address
  4. When the user verifies the new email (via `POST /auth/verify-email`), the
     email is actually updated
- This prevents hijacking someone's account by changing the email to an
  attacker-controlled address without verification
- Publishes `UserEmailChanged` event after successful verification

**Why this is important for the frontend:** Phase 4 Settings page includes
account management. Without these endpoints, users can never change their email
or username, which is a basic expectation for any account system.

---

## Acceptance Criteria

- [ ] JWT access tokens include a `scopes` claim derived from user roles
- [ ] A regular user's token includes at least `scheduler:plan` and
      `scheduler:write`
- [ ] An admin user's token includes admin-scoped permissions
- [ ] `POST /api/v1/scheduler/dual-lane/plan` returns 200 (not 403) for a
      logged-in user with default `user` role
- [ ] Scheduler dev fallback scopes include `scheduler:write`
- [ ] `POST /auth/forgot-password` generates a token and logs the reset URL
- [ ] `POST /auth/reset-password` validates and consumes the token, sets new
      password, revokes all refresh tokens
- [ ] Expired or already-used reset tokens return a clear error
- [ ] Registration sends a verification email (logged to console in dev)
- [ ] `POST /auth/verify-email` sets `emailVerified = true`
- [ ] `POST /auth/resend-verification` generates a new token and invalidates the
      previous
- [ ] `PATCH /users/:id/username` changes username with uniqueness check
- [ ] `PATCH /users/:id/email` starts a verified email change flow
- [ ] All new endpoints have Zod request validation schemas
- [ ] All new endpoints are rate-limited appropriately
- [ ] `pnpm test` passes in user-service with new test cases

---

## Files Created / Touched

| File                                                                      | Action                                                                        |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `services/user-service/src/infrastructure/external-apis/token.service.ts` | Add `scopes` to JWT payload + `deriveScopesFromRoles()`                       |
| `services/user-service/src/types/user.types.ts`                           | Update `ITokenPayload` with `scopes`                                          |
| `services/user-service/prisma/schema.prisma`                              | Add `PasswordResetToken` + `EmailVerificationToken` models                    |
| `services/user-service/src/api/rest/auth.routes.ts`                       | Add forgot-password, reset-password, verify-email, resend-verification routes |
| `services/user-service/src/api/rest/user.routes.ts`                       | Add username and email change routes                                          |
| `services/user-service/src/domain/user-service/*.ts`                      | New service methods for password reset, verification, username/email change   |
| `services/scheduler-service/src/api/middleware/auth.middleware.ts`        | Fix dev fallback to include `scheduler:write`                                 |
| `packages/types/src/enums/index.ts`                                       | Add scope enum values if needed                                               |
| `packages/events/src/events/*.ts`                                         | Add `UserUsernameChanged`, `UserEmailChanged` event types                     |
