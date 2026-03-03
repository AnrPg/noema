# ADR-002: JWT Scope Derivation & Account Security Flows

| Field       | Value                                          |
| ----------- | ---------------------------------------------- |
| **Status**  | Accepted                                       |
| **Date**    | 2026-03-03                                     |
| **Phase**   | Phase 01 — Blood-Brain Barrier (Auth & JWT)    |
| **Authors** | Claude (AI), approved by project owner         |

---

## Context

Noema's user-service issues JWTs (via `jose`/HS256) that previously carried only
`{ sub, roles, type }`. Downstream services (scheduler-service, content-service,
session-service) enforce fine-grained permissions using scope strings like
`scheduler:write` and `content:read`. Without scopes in the JWT, each consuming
service either trusts all authenticated requests equally or must re-derive
permissions from roles — duplicating authorization logic and creating drift risk.

Additionally, the codebase lacked several critical account security flows:

- **Forgot/Reset Password** — no self-service password recovery existed.
- **Email Verification** — registration did not verify email ownership.
- **Username/Email Change** — no controlled mutation flow for identity fields.

The Phase 01 spec ("Blood-Brain Barrier") requires:
1. Role-based scope derivation in JWT access tokens.
2. Forgot password with secure token lifecycle.
3. Email verification at registration and on email change.
4. Username change with cooldown; email change with re-verification.

---

## Decision

### 1. JWT Scope Derivation (Server-Side, Stateless)

Scopes are **derived from roles at token generation time** — not stored in the
database. The function `deriveScopesFromRoles(roles: string[]): string[]`
produces a sorted, deduplicated scope array from the user's role set.

**Role → Scope Mapping:**

| Role | Scopes |
| ---- | ------ |
| `user` / `learner` / `premium` / `creator` | `BASE_USER_SCOPES` — `scheduler:plan`, `scheduler:write`, `session:read`, `session:write`, `content:read`, `content:write`, `kg:read`, `kg:write` |
| `admin` | BASE + `admin:read`, `admin:write`, `scheduler:admin`, `session:system:expire`, `kg:admin`, `content:admin` |
| `super_admin` | All ADMIN scopes |
| `agent` | `scheduler:plan`, `scheduler:write`, `content:read`, `kg:read`, `kg:write`, `kg:admin`, `session:read` |
| `service` | All scopes (union of all above) |

**Universal `user` Base Role:**

Every account receives the `user` role alongside its functional role (e.g.,
`["user", "learner"]`). This was chosen over mapping each functional role to
base scopes individually because:
- It provides a single, extensible base permission set.
- It makes scope inheritance explicit (inspect roles to understand permissions).
- Existing users were data-migrated to include `user` in their roles array.

**Dual Claim Format:**

Access tokens emit both:
- `scopes`: `string[]` — for programmatic consumption.
- `scope`: `string` (space-separated) — for OAuth 2.0 / RFC 6749 compatibility.

### 2. Forgot Password (T1.2)

- User submits email → service generates 64-byte `crypto.randomBytes` token.
- Token is SHA-256 hashed before storage (`PasswordResetToken` table).
- Raw token sent in URL; only hash stored (one-way, like password storage).
- Expiry: 15 minutes. Token is single-use (marked `usedAt` on consumption).
- **Anti-enumeration**: endpoint always returns HTTP 200 regardless of email
  existence.
- Rate-limited: 3 requests per email per hour via `@fastify/rate-limit`.

### 3. Email Verification (T1.3)

- On registration, a verification token is generated and "sent" (logged in dev).
- Same SHA-256 hash lifecycle as password reset tokens.
- Expiry: 24 hours. Single-use.
- Verified emails set `emailVerified = true` on the User.
- **Email change flow** reuses the same verification mechanism: `pendingEmail`
  is stored on the User, and upon verification, the actual email is updated
  and `pendingEmail` is cleared.
- Rate-limited: resend-verification capped at 3 requests per hour.

### 4. Username Change (T1.4)

- 30-day cooldown between username changes (`usernameChangedAt` field).
- Admin/super_admin bypass the cooldown.
- Uniqueness enforced at repository layer.
- Old username is logged but not reserved (available for reuse).

### 5. Email Change (T1.4)

- Requires password confirmation (prevents session hijack → email takeover).
- OAuth-only accounts are blocked from this flow.
- New email uniqueness is checked before initiating.
- Two-phase: set `pendingEmail` → send verification → on verify, swap emails.
- The `verifyEmail()` method handles both initial verification and pending
  email confirmation in a single code path.

### 6. Rate Limiting Infrastructure

`@fastify/rate-limit` registered globally with `global: false`, so only routes
with explicit `config.rateLimit` are rate-limited. Redis-backed for distributed
state across instances.

---

## Alternatives Considered

### Scope Storage in Database
Storing scopes per-user in the DB would allow per-user customization but adds a
write on every scope change, requires cache invalidation, and creates a new data
migration surface. Derivation from roles is simpler, deterministic, and
sufficient for Noema's current authorization model.

### Separate Email Verification Service
A standalone verification microservice would over-architect for the current
scale. The verification logic is co-located in user-service since it's
inherently tied to user identity. Can be extracted later if more services need
token-based verification flows.

### Separate `user` Role vs. Mapping Each Functional Role
An alternative was to have `deriveScopesFromRoles` map `learner` → base scopes,
`premium` → base + premium scopes, etc., without an explicit `user` role. The
`user` base role was chosen because it's additive (doesn't require updating the
scope map for every new functional role) and makes the universal permission set
explicit.

### OAuth 2.0 `scope` Claim Only (Space-Separated String)
Some consumers prefer arrays for programmatic use. Emitting both avoids
downstream parsing and satisfies both OAuth tooling and internal service needs.

---

## Consequences

### Positive
- **Stateless authorization**: consuming services can enforce scopes from the
  JWT without calling user-service.
- **Single source of truth**: `deriveScopesFromRoles` is the canonical scope
  derivation function; no duplication across services.
- **Secure token lifecycle**: hashed-at-rest, single-use, time-bounded tokens
  for password reset and email verification.
- **Rate limiting foundation**: per-route rate limiting is now available for
  any user-service endpoint.

### Negative
- **Scope revocation latency**: if a user's role is changed, their active JWTs
  retain old scopes until expiry. Mitigation: short access token TTL (15 min).
- **Universal `user` role migration**: existing users needed a data migration.
  Future users get it by default.

### Follow-Up Work
- Integrate actual email provider (SendGrid, Mailgun, etc.) replacing `logger.info` URLs.
- Add MFA support to password-sensitive flows (reset, email change).
- Consider scope caching / token revocation list for admin role changes.
- Add OpenAPI spec entries for new endpoints (contract-first compliance).
- Consumer-driven contract tests for JWT scope claims.

---

## Implementation Notes (Post-Implementation Update)

### Emergent Decisions
- The `verifyEmail()` method was designed to handle both initial email
  verification and pending email change confirmation in a single code path,
  reducing API surface.
- `sendVerificationEmail()` automatically invalidates previous active tokens
  for the user (at repository level) to prevent replay attacks.
- The `changeEmail()` flow deliberately reuses `sendVerificationEmail()` rather
  than a separate flow, keeping token management unified.

### Deviations from Initial Plan
- None — the implementation followed the spec and design decisions closely.

### New Constraints Discovered
- Prisma's generated client requires rebuild after schema changes; the
  `toDomain()` mapper needed updates to include `pendingEmail` and
  `usernameChangedAt`.
- `@fastify/rate-limit` requires Redis connection for distributed rate state;
  the existing Redis instance was reused.

### Files Modified
- `services/user-service/src/infrastructure/external-apis/token.service.ts` — scope derivation + dual claim emission
- `services/user-service/src/types/user.types.ts` — `USER` role, new DTOs
- `services/user-service/prisma/schema.prisma` — 2 new models, 2 new User fields, default role change
- `services/user-service/src/domain/user-service/user.schemas.ts` — 6 new Zod schemas
- `services/user-service/src/domain/user-service/errors/user.errors.ts` — 4 new error classes
- `services/user-service/src/domain/user-service/user.repository.ts` — 10 new interface methods
- `services/user-service/src/infrastructure/database/prisma-user.repository.ts` — 10 new implementations
- `services/user-service/src/domain/user-service/user.service.ts` — 7 new public methods
- `services/user-service/src/api/rest/user.routes.ts` — 6 new routes
- `services/user-service/src/index.ts` — rate-limit plugin registration
- `services/scheduler-service/src/api/middleware/auth.middleware.ts` — dev fallback scope fix
- `packages/events/src/user/user.events.ts` — 4 new event types + payloads
- `packages/events/src/user/user-event.schemas.ts` — 4 new Zod schemas
- `services/user-service/src/events/user.events.ts` — re-exports for new events
