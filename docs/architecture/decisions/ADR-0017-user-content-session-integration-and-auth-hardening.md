# ADR-0017: User/Auth Hardening and Content→Session Seed Integration

## Status

**Accepted** — 2026-02-22

## Context

After landing `session-service` and `scheduler-service`, two cross-service gaps
remained in production-critical paths:

1. **User auth/session security gap**
   - `user-service` exposed refresh-token flows but did not persist/revoke
     refresh tokens effectively.
   - `POST /auth/logout` existed in API docs/README but not in route
     implementation.
   - Refresh token rotation and replay protection were incomplete.

2. **Content→Session orchestration gap**
   - `content-service` could query cards, but lacked a first-class API/tool to
     produce `initialCardIds` for `session-service.startSession`.
   - Agent orchestration had to compose this manually without a canonical,
     auditable seed contract.

The selected design had to preserve existing bounded contexts, avoid breaking
existing APIs, and provide stronger guarantees for session lifecycle
consistency.

## Decision

### 1. Hybrid refresh-token revocation (Redis + PostgreSQL)

`user-service` now uses a hybrid model:

- **PostgreSQL (`refresh_tokens`)** is the source of truth for issued/revoked
  refresh tokens.
- **Redis denylist** (`noema:auth:revoked:refresh:{jti}`) accelerates revocation
  checks and blocks replay quickly.

Implemented behavior:

- New refresh tokens are persisted with expiry on issuance.
- Refresh token verification checks JWT validity + Redis revocation + DB row
  integrity.
- Token refresh now performs **rotation** (old refresh token revoked before
  issuing new pair).
- Password change now revokes **all** active refresh tokens for that user.

### 2. Strict logout orchestration with session-service pause

Logout flows are strict and session-aware:

- `POST /auth/logout` revokes the provided refresh token.
- `POST /auth/logout-all` revokes all active refresh tokens.
- Before either flow succeeds, `user-service` synchronously calls
  `session-service`:
  - Query active session for the user
  - Pause it (if present)
  - If pause/query fails, logout fails with external-service error

This enforces the selected policy: active learning session is paused before
logout; auto-expiry remains governed by `session-service` timeout
(`sessionTimeoutHours`, default 24h).

### 3. Content session-seed contract (REST + MCP)

`content-service` now exposes canonical session bootstrap primitives:

- REST: `POST /v1/cards/session-seed`
- MCP tool: `build-session-seed`

Input:

- `DeckQuery`
- selection strategy (`query_order`, `randomized`, `difficulty_balanced`)
- `maxCards`

Output:

- `initialCardIds`
- `selectedCount`
- `totalMatched`
- `recommendedSessionConfig` (includes timeout baseline)
- optional selected card summaries

This provides a reusable contract for agents/services to start sessions
deterministically with provenance.

## Consequences

### Positive

- Strong replay resistance for refresh tokens.
- API/docs parity restored for logout capabilities.
- Logout semantics now coordinate auth and learning-session lifecycle
  explicitly.
- Session bootstrap becomes first-class and reusable across agents and
  orchestration services.

### Negative

- `user-service` is now synchronously dependent on `session-service`
  availability during logout.
- Additional integration configuration is required (`SESSION_SERVICE_URL`,
  timeout).

### Risks

- Strict pause-on-logout may reduce logout availability during session-service
  outages.
- Mitigation is operational: monitor session-service SLOs and integration
  timeout.

## References

- [services/user-service/src/infrastructure/external-apis/token.service.ts](services/user-service/src/infrastructure/external-apis/token.service.ts)
- [services/user-service/src/infrastructure/external-apis/session-orchestration.service.ts](services/user-service/src/infrastructure/external-apis/session-orchestration.service.ts)
- [services/user-service/src/domain/user-service/user.service.ts](services/user-service/src/domain/user-service/user.service.ts)
- [services/content-service/src/domain/content-service/content.service.ts](services/content-service/src/domain/content-service/content.service.ts)
- [services/content-service/src/api/rest/content.routes.ts](services/content-service/src/api/rest/content.routes.ts)
- [services/content-service/src/agents/tools/content.tools.ts](services/content-service/src/agents/tools/content.tools.ts)
