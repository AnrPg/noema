# Phase 4 — Admin User Management

> **Codename:** `Immune System` **Depends on:** Phase 1 (Auth & JWT — admin
> scopes must exist) **Unlocks:** Frontend Phase 11 (Admin App — User Management
> panel) **Estimated effort:** 2–3 days

---

## Why This Exists

The immune system protects the body by identifying threats and mounting a
response. Admin user management is Noema's immune system — it protects the
platform by giving administrators the ability to identify problematic accounts
and act on them.

The user-service already has admin endpoints for _listing_ users (`GET /users`
with `status`, `emailVerified`, `search` filters) and viewing a user's profile.
But it is missing every _action_ an admin needs to take:

- **Cannot suspend or ban a user.** The `User` model has a `status` field
  (`ACTIVE`, `SUSPENDED`, `DEACTIVATED`, `BANNED`), but there's no endpoint for
  an admin to change it. If a user violates community guidelines, there is no
  mechanism to shut down their account.

- **Cannot manage roles.** The `UserRole` model and `roles` relation exist in
  Prisma — `ADMIN`, `MODERATOR`, `USER` — but there's no endpoint to promote or
  demote users. Every admin account must be set via manual database queries.

- **Cannot force a password reset.** If an admin needs to trigger a password
  reset for a compromised account, there's no endpoint for it. (Phase 1's
  forgot-password flow is user-initiated; this is admin-initiated.)

- **Cannot view login history.** The `UserSession` model tracks `createdAt`,
  `expiresAt`, `ipAddress`, `userAgent`, and `revokedAt`. But no endpoint
  exposes this data. For security investigations (suspicious login patterns,
  credential stuffing detection), admins need access to this.

These four capabilities are the minimum viable admin toolkit. Without them, the
admin dashboard's User Management panel has nothing to manage.

---

## Tasks

### T4.1 — Suspend / Unsuspend / Ban Users

An admin-only endpoint to change a user's account status.

**New endpoint:**

| Method  | Path                   | Auth                       | Description                |
| ------- | ---------------------- | -------------------------- | -------------------------- |
| `PATCH` | `/v1/users/:id/status` | Bearer JWT + `admin:users` | Change user account status |

**Request body:**

- `status` (required) — one of: `ACTIVE`, `SUSPENDED`, `BANNED`
- `reason` (required for `SUSPENDED` and `BANNED`) — free-text explanation for
  audit trail
- `expiresAt` (optional, for `SUSPENDED` only) — ISO timestamp for temporary
  suspension; if omitted, suspension is indefinite

**Behavior:**

| Transition           | Allowed? | Side effects                                                             |
| -------------------- | -------- | ------------------------------------------------------------------------ |
| `ACTIVE → SUSPENDED` | ✅       | Revoke all active sessions. Emit `UserSuspended` event.                  |
| `ACTIVE → BANNED`    | ✅       | Revoke all active sessions. Emit `UserBanned` event. Delete auth tokens. |
| `SUSPENDED → ACTIVE` | ✅       | Emit `UserReactivated` event.                                            |
| `BANNED → ACTIVE`    | ✅       | Emit `UserReactivated` event.                                            |
| `DEACTIVATED → any`  | ❌       | User-initiated deactivation is permanent. Admins cannot override.        |
| Same → same          | ❌       | No-op. Return 400.                                                       |

**Why `reason` is required:** Every moderation action must be auditable. The
reason is stored in a `UserStatusChange` record (see T4.5 below) and can be
reviewed in disputes.

**Session revocation:** When a user is suspended or banned, all their active
`UserSession` records must have `revokedAt` set to `now()`. This ensures the
user is immediately logged out everywhere. Their JWT may still be valid until
expiry (JWTs are stateless), but any authenticated request should check the
user's `status` field and reject requests from suspended/banned accounts. This
means adding a status check to the auth middleware — which is already planned in
Phase 1's scope validation.

**What about the user's data?** Suspending or banning does NOT delete data. The
user's decks, cards, sessions, reviews, and knowledge graph contributions all
remain intact. Only their ability to authenticate and use the platform is
affected. Data deletion is a separate concern handled by account deactivation
(which already exists) and the GDPR deletion cascade (Phase 2, T2.3).

### T4.2 — Role Management

An admin-only endpoint to assign or remove roles.

**New endpoint:**

| Method  | Path                  | Auth                       | Description    |
| ------- | --------------------- | -------------------------- | -------------- |
| `PATCH` | `/v1/users/:id/roles` | Bearer JWT + `admin:users` | Set user roles |

**Request body:**

- `roles` (required) — array of roles to assign, e.g., `["ADMIN", "USER"]`

**Behavior:**

- The provided array _replaces_ the user's current roles (declarative, not
  additive). This prevents race conditions from concurrent add/remove calls.
- Every user must have at least the `USER` role. If the request omits `USER`,
  add it implicitly.
- An admin cannot remove their own `ADMIN` role (self-demotion guard). This
  prevents accidentally locking out all admins. Return 403 with a clear error
  message.
- Emit a `UserRolesChanged` event with
  `{ userId, oldRoles, newRoles, changedBy }`.

**Why declarative over additive?** An additive approach (`POST /roles/add`,
`POST /roles/remove`) creates race conditions: two admins could simultaneously
add and remove roles with unpredictable results. A single declarative `PATCH`
with the full desired role set is idempotent and conflict-free.

**Role impact on JWT scopes:** After roles change, the user's existing JWT still
carries the old scopes. The role change takes effect on next token refresh.
Optionally, the endpoint could revoke all active sessions to force a re-login,
but this is aggressive — a better approach is to let the next refresh pick up
the new scopes. Document this behavior clearly in the API response.

### T4.3 — Admin-Triggered Password Reset

An endpoint for admins to force a password reset for a user.

**New endpoint:**

| Method | Path                           | Auth                       | Description                         |
| ------ | ------------------------------ | -------------------------- | ----------------------------------- |
| `POST` | `/v1/users/:id/reset-password` | Bearer JWT + `admin:users` | Trigger a password reset for a user |

**Behavior:**

This endpoint does NOT set a new password. Instead, it:

1. Invalidates the user's current password hash (or sets a flag requiring
   password change on next login)
2. Sends a password reset email to the user (reusing the forgot-password flow
   from Phase 1)
3. Revokes all active sessions for the user
4. Returns `{ success: true, message: "Password reset email sent" }`

**Why not set the password directly?** An admin should never know a user's
password. By reusing the forgot-password email flow, the user sets their own new
password via a secure token link. This follows security best practices:

- Admins can't impersonate users
- Password is always chosen by the user
- No plaintext passwords in API requests
- Full audit trail (reset was admin-triggered, not user-triggered)

**Audit:** Store who triggered the reset (`triggeredBy: adminUserId`) in the
`PasswordResetToken` model alongside the user-initiated forgot-password tokens.
Add an `initiator` field: `USER` or `ADMIN`.

### T4.4 — Login History

An endpoint for admins to view a user's login history.

**New endpoint:**

| Method | Path                     | Auth                       | Description                         |
| ------ | ------------------------ | -------------------------- | ----------------------------------- |
| `GET`  | `/v1/users/:id/sessions` | Bearer JWT + `admin:users` | View a user's session/login history |

**Query parameters:**

- `status` — `active`, `expired`, `revoked`, or `all` (default: `all`)
- `sortBy` — `createdAt`, `expiresAt` (default: `createdAt`)
- `sortOrder` — `asc` or `desc` (default: `desc`)
- `limit` — default 50, max 200
- `offset` — default 0

**Response per session:**

- `id` — session ID
- `createdAt` — when the session was created (i.e., login time)
- `expiresAt` — when the session token expires
- `revokedAt` — when the session was revoked (null if still active)
- `lastActiveAt` — last activity timestamp (if tracked; otherwise same as
  `createdAt`)
- `ipAddress` — the IP address of the login
- `userAgent` — the browser/device user agent string
- `status` — derived: `active` (not expired, not revoked), `expired`, `revoked`

**Privacy note:** This endpoint exposes sensitive data (IP addresses, device
info). It must be restricted to the `admin:users` scope. All access should be
logged for compliance. Consider adding a `GET /v1/users/me/sessions` endpoint
(non-admin) so users can view their own login history — but that's a separate
enhancement, not required for this phase.

**Why this information matters:** Security investigations require knowing:

- Was the account accessed from an unusual IP?
- How many concurrent sessions exist?
- Was a session active during a reported incident?
- Is there a pattern of credential stuffing (many failed logins from different
  IPs)?

The current session model stores this data; it just needs an API surface.

### T4.5 — Status Change Audit Log

Create an in-database audit trail for all admin actions on user accounts.

**New model:** `UserStatusChange`

| Column          | Type     | Description                                                                            |
| --------------- | -------- | -------------------------------------------------------------------------------------- |
| `id`            | UUID     | Primary key                                                                            |
| `userId`        | UUID     | The affected user                                                                      |
| `changedBy`     | UUID     | The admin who made the change                                                          |
| `action`        | Enum     | `STATUS_CHANGE`, `ROLE_CHANGE`, `PASSWORD_RESET`, `SESSION_REVOCATION`                 |
| `previousValue` | JSONB    | Snapshot of the previous state (e.g., `{ status: "ACTIVE" }` or `{ roles: ["USER"] }`) |
| `newValue`      | JSONB    | Snapshot of the new state                                                              |
| `reason`        | String   | Admin-provided reason (required for status changes)                                    |
| `createdAt`     | DateTime | When the action occurred                                                               |

**Why a separate audit model?** Audit logs must be append-only and
tamper-evident. Storing them in the same table as the mutable user record would
make them deletable or editable. A separate `UserStatusChange` table is
immutable by convention — the application never issues `UPDATE` or `DELETE`
against it.

**Admin audit read endpoint:**

| Method | Path                      | Auth                       | Description                      |
| ------ | ------------------------- | -------------------------- | -------------------------------- |
| `GET`  | `/v1/users/:id/audit-log` | Bearer JWT + `admin:users` | View all admin actions on a user |

Returns paginated `UserStatusChange` records with the admin's display name
resolved (not just UUID).

---

## Auth Middleware Enhancement

All endpoints in this phase require a new `admin:users` scope. This scope should
be:

- Automatically assigned to the `ADMIN` role in Phase 1's role→scope mapping
- NOT assigned to `MODERATOR` (moderators should have a separate
  `moderate:content` scope for content actions, but not user account control)
- Checked before any handler runs (fail fast with 403)

Additionally, every admin endpoint should validate that the target `userId`
exists and is not the same as the requesting admin (where applicable — e.g., an
admin can view their own login history but cannot suspend themselves).

---

## Acceptance Criteria

- [ ] `PATCH /v1/users/:id/status` transitions users between ACTIVE, SUSPENDED,
      and BANNED with required reason and audit trail
- [ ] Suspending/banning revokes all active sessions immediately
- [ ] `PATCH /v1/users/:id/roles` replaces user roles declaratively; self-
      demotion is prevented
- [ ] `POST /v1/users/:id/reset-password` sends a password reset email without
      the admin ever seeing or setting the password
- [ ] `GET /v1/users/:id/sessions` returns paginated login history with IP, user
      agent, and status
- [ ] `GET /v1/users/:id/audit-log` returns all admin actions on the user
- [ ] All endpoints require `admin:users` scope
- [ ] All inputs are validated via Zod schemas
- [ ] `UserStatusChange` audit log is append-only (no update/delete operations)
- [ ] Events emitted: `UserSuspended`, `UserBanned`, `UserReactivated`,
      `UserRolesChanged`

---

## Files Created / Touched

| File                                                                                            | Action                                                               |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `services/user-service/prisma/schema.prisma`                                                    | Add `UserStatusChange` model, `StatusChangeAction` enum              |
| `services/user-service/prisma/migrations/...`                                                   | Migration for `UserStatusChange` table                               |
| `services/user-service/src/api/rest/admin.routes.ts`                                            | Add status, roles, reset-password, sessions, audit-log routes        |
| `services/user-service/src/domain/admin/admin-user.service.ts`                                  | **New** — admin user management service                              |
| `services/user-service/src/infrastructure/repositories/prisma-user-status-change.repository.ts` | **New** — audit log repository                                       |
| `services/user-service/src/api/schemas/admin.schemas.ts`                                        | **New** — Zod schemas for all admin request/query params             |
| `services/user-service/src/types/admin.types.ts`                                                | **New** — `IUserStatusChangeResponse`, `ILoginHistoryResponse` types |
