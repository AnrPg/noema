# ADR-004: Admin User Management (Immune System)

| Field       | Value                                                |
| ----------- | ---------------------------------------------------- |
| **Status**  | Accepted                                             |
| **Date**    | 2026-03-03                                           |
| **Phase**   | Phase 04 — Immune System (Admin User Management)     |
| **Authors** | Claude (AI), approved by project owner               |

---

## Context

The user-service already supports user registration, authentication, JWT-scoped
authorization, and self-service account flows (forgot-password, email/username
change). However, it lacks any administrative capabilities:

1. **No user status management** — The `User` model has a `status` field
   (`ACTIVE`, `SUSPENDED`, `DEACTIVATED`, `BANNED`), but no endpoint exists to
   transition between states. An admin cannot suspend or ban a problematic user.

2. **No role management** — The `UserRole` model (`ADMIN`, `MODERATOR`, `USER`)
   exists in Prisma, but roles can only be set via manual database queries.
   There is no endpoint to promote or demote users.

3. **No admin-triggered password reset** — Phase 1's forgot-password flow is
   user-initiated only. When an admin identifies a compromised account, there is
   no mechanism to force a password reset without the admin knowing the password.

4. **No session/login history visibility** — The `UserSession` model tracks
   `createdAt`, `expiresAt`, `ipAddress`, `userAgent`, and `revokedAt`, but no
   endpoint exposes this data. Security investigations are impossible through the
   API.

5. **No audit trail** — Admin actions on user accounts leave no trace in the
   database. There is no accountability mechanism for moderation decisions.

6. **Gateway routing conflict** — The existing Traefik configuration routes
   `PathPrefix(/api/v1/users)` to the knowledge-graph-service (for KG user
   endpoints), which would intercept the user-service's admin endpoints.

---

## Decisions

### D1 — Scope-based authorization via `IExecutionContext`

**Decision:** Enforce admin access using an `admin:users` scope checked within
the service layer, with scopes carried on `IExecutionContext`.

**Rationale:**

- Phase 1 already established the role → scope derivation pattern in
  `token.service.ts` (ADMIN_SCOPES, USER_SCOPES arrays).
- Adding `admin:users` to `ADMIN_SCOPES` is minimal and consistent.
- Checking scopes in the service layer (via `requireAdminScope()`) rather than
  middleware gives the service full control over error messages and allows
  fine-grained per-method authorization if needed.
- `IExecutionContext` already carries `userId` and `roles`; adding `scopes` is
  additive and non-breaking.

**Alternatives considered:**

- Middleware-only guard — rejected because it would require per-route middleware
  registration and doesn't allow the service to differentiate between scope
  checks.
- Role-based checks (check `roles` array directly) — rejected because roles and
  scopes serve different purposes; scopes are the granular permission model.

### D2 — Standalone `AdminUserService`

**Decision:** Create a new `AdminUserService` class rather than adding admin
methods to the existing `UserService` (1,502 LOC).

**Rationale:**

- `UserService` handles self-service operations (register, login, profile
  update). Admin operations have different authorization models and dependencies.
- `AdminUserService` has its own dependency set: `userRepository`,
  `statusChangeRepository`, `sessionRepository`, `eventPublisher`,
  `tokenService`, `logger`.
- Follows the same separation pattern as Phase 3's `SchedulerReadService`.
- Keeps both classes focused and testable.

**Alternatives considered:**

- Extend `UserService` with admin methods — rejected due to the class already
  being 1,502 LOC and mixing self-service with admin concerns.

### D3 — Separate `IUserStatusChangeRepository`

**Decision:** Create a dedicated append-only repository for the
`UserStatusChange` audit log with `create()`, `findByUser()`, `findByAdmin()`,
and `countByUser()` methods.

**Rationale:**

- Audit logs are append-only by design. Having a dedicated repository enforces
  this — it exposes no `update()` or `delete()` methods.
- The `UserStatusChange` model is structurally different from `User` — it stores
  JSONB snapshots of previous/new state, admin actor, reason, and action type.
- Separation keeps `IUserRepository` focused on user CRUD.

### D4 — Separate `ISessionRepository` interface

**Decision:** Create a separate `ISessionRepository` interface for admin session
queries rather than adding session methods to `IUserRepository`.

**Rationale:**

- User chose this option explicitly over the alternative of extending
  `IUserRepository`.
- Session queries (paginated listing, filtering by active/expired/revoked,
  counting, bulk revocation) are a distinct domain concern from user CRUD.
- Methods: `findByUserId()`, `countByUser()`, `endAllByUser()`,
  `getActiveSessions()`.
- Clean interface segregation aligns with hexagonal architecture principles.

### D5 — `initiator`/`initiatedBy` on `PasswordResetToken`

**Decision:** Add `initiator` (enum: `USER`, `ADMIN`) and `initiatedBy`
(optional UUID) columns to the existing `PasswordResetToken` model.

**Rationale:**

- Admin-triggered password resets reuse Phase 1's forgot-password email flow
  (the user receives the same email with a secure token link and sets their own
  password).
- The only difference is attribution: tracking who initiated the reset enables
  audit trail queries.
- `initiator` defaults to `USER` for backward compatibility with existing
  forgot-password tokens.
- `initiatedBy` stores the admin's userId for `ADMIN`-initiated resets.

**Alternatives considered:**

- Separate `AdminPasswordResetToken` model — rejected as unnecessary
  duplication; the flow is identical.

### D6 — Admin-specific domain events

**Decision:** Emit new, purpose-built events for admin actions rather than
reusing existing user events.

**Rationale:**

- Admin actions have different payloads (include `changedBy`, `reason`,
  `previousStatus`) that don't fit existing event schemas.
- Downstream consumers may need to differentiate admin-initiated events from
  user-initiated ones (e.g., notification service sends different messages).
- Events added: `user.suspended`, `user.banned`, `user.reactivated`,
  `user.roles.changed`, `user.admin.password_reset`.

### D7 — Fix gateway routing with `PathRegexp`

**Decision:** Replace the overly broad `PathPrefix(/api/v1/users)` rule for the
knowledge-graph-service's user endpoints with a `PathRegexp` that matches only
KG-specific sub-paths, and add a new `user-v1` router for the user-service.

**Rationale:**

- The `PathPrefix(/api/v1/users)` rule on the `kg-users` router intercepted
  ALL user-service requests — not just the KG-specific ones.
- The KG-service only needs: `/api/v1/users/{id}/pkg`,
  `/api/v1/users/{id}/metrics`, `/api/v1/users/{id}/misconceptions`,
  `/api/v1/users/{id}/health`, `/api/v1/users/{id}/comparison`.
- A `PathRegexp` narrowing the rule to these specific sub-paths resolves the
  conflict.
- A new `user-v1` router with lower priority catches all remaining
  `/api/v1/users/*` traffic and routes it to the user-service.

**Alternatives considered:**

- Move KG user endpoints to a different path — rejected as a breaking change.
- Use routing priority alone — rejected because Traefik's prefix matching is
  greedy; both rules with `/api/v1/users` prefix would conflict.

### D8 — Session and token revocation semantics

**Decision:** When suspending or banning a user:

- Set `revokedAt = now()` on all active `UserSession` records
  (session revocation).
- For bans, this is equivalent to "delete auth tokens" from the spec —
  revoking refresh tokens prevents re-authentication.

**Rationale:**

- The spec calls for "delete auth tokens" on ban. Since JWTs are stateless and
  cannot be revoked (they expire naturally), the meaningful action is revoking
  refresh tokens / sessions so the user cannot obtain new JWTs.
- The existing `UserSession` model's `revokedAt` field provides soft-delete
  semantics that preserve audit data while invalidating the session.
- A status check in the auth middleware (planned in Phase 1's scope validation)
  ensures even unexpired JWTs are rejected for suspended/banned users.

---

## Consequences

### Positive

- 7 new admin endpoints provide comprehensive user management capabilities.
- Append-only audit log ensures all admin actions are traceable and
  tamper-evident.
- Scope-based authorization (`admin:users`) integrates cleanly with existing JWT
  infrastructure.
- Gateway routing fix resolves a conflict that would have blocked both admin
  endpoints and existing user-service routes.
- Admin-triggered password reset follows security best practices (admin never
  sees or sets the password).
- Declarative role replacement prevents race conditions on concurrent role
  changes.
- Self-demotion guard prevents admins from accidentally locking out all
  administrator accounts.

### Negative

- `AdminUserService` shares `IUserRepository` dependency with `UserService` —
  changes to the user repository interface affect both services.
- The gateway `PathRegexp` for KG-specific user paths is coupled to the
  knowledge-graph-service's URL structure; new KG user endpoints require updating
  the regex.

### Risks

- **JWT scope lag:** After a role change, the user's existing JWT still carries
  old scopes until token refresh. For security-critical role removals (e.g.,
  removing admin), consider adding session revocation to force re-login.
- **Soft-delete sessions vs hard-delete tokens:** The spec mentions "delete auth
  tokens" for bans, but the implementation soft-deletes sessions. If a future
  compliance requirement mandates hard deletion, the session repository's
  `endAllByUser()` method would need to be extended.

---

## Follow-up Work

- Add consumer-driven contract tests for admin endpoints.
- Add OpenAPI entries for all 7 new admin endpoints.
- Implement `GET /v1/users/me/sessions` for non-admin session visibility.
- Add rate limiting on admin password reset to prevent abuse.
- Consider event-driven notification to the affected user when their account
  status changes.
- Add the auth middleware status check (reject requests from suspended/banned
  users even with valid JWTs).

---

## Emergent Decisions During Implementation

1. **`exactOptionalPropertyTypes` handling:** TypeScript's strict mode rejects
   assigning `undefined` to optional properties. All Zod-parsed fields that may
   be `undefined` use conditional spreads:
   `...(value !== undefined && { field: value })` to avoid type errors.

2. **Prisma JSONB type compatibility:** The `UserStatusChange` model uses JSONB
   for `previousValue` and `newValue` columns. TypeScript's
   `Record<string, unknown>` doesn't satisfy Prisma's `InputJsonValue` type.
   Values are cast via `as unknown as Prisma.InputJsonValue` at the repository
   boundary.

3. **Manual migration file:** The Prisma schema was modified after Phase 1's
   migration had already been applied. Rather than using `prisma migrate dev`
   (which would attempt to reapply the full migration history), the migration SQL
   was written manually as an idempotent DDL script and `prisma generate` was
   used to regenerate the client.

4. **`IPaginatedResponse.total` optionality:** The shared pagination contract
   defines `total` as optional (`total?: number`). The audit log and session
   list endpoints use `result.total ?? 0` with conditional spreads to satisfy
   strict optional property types.

5. **Gateway `PathRegexp` syntax:** Traefik v3's `PathRegexp` requires a full
   regex (not a glob). The KG-specific user paths are matched with:
   `` PathRegexp(`^/api/v1/users/[^/]+/(pkg|metrics|misconceptions|health|comparison)`) ``
   which precisely scopes the KG router without catching other user-service
   paths.

6. **Prisma enum mapping:** Prisma generates uppercase enum values
   (`SUSPENDED`, `BANNED`) while the domain types use lowercase strings. The
   `PrismaUserStatusChangeRepository` maps between these representations at the
   infrastructure boundary, keeping the domain layer decoupled from Prisma's
   type system.
