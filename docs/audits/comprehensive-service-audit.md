# Noema Comprehensive Service Audit Report

**Date:** 2025-07-07  
**Scope:** All 6 backend services, shared packages, cross-service integration  
**Coverage:** Phases 1–6 implementation, frontend layer alignment

---

## Executive Summary

Audited **6 services** (user, session, content, knowledge-graph, scheduler, HLR sidecar), **4 shared packages** (`@noema/types`, `@noema/events`, `@noema/contracts`, `@noema/validation`), and cross-service integration points. Found **16 CRITICAL**, **32 HIGH**, **45 MEDIUM**, and **27 LOW** issues across the codebase.

**Top systemic risks:**
1. **Scheduler event pipeline is dead** — `content.seeded` is never published and `lane` missing from `attempt.recorded` silently drops all events
2. **Security gaps** — password hash leakage, MFA bypass, stored XSS vector
3. **Frontend-backend contract drift** — severity enum (4 vs 5 levels), family keys, URL patterns
4. **Non-atomic operations** — read-modify-write races in multiple consumers and streak updates

---

## Priority: CRITICAL (Fix Immediately)

### Cross-Service Integration

| ID | Service | Finding | Impact |
|---|---|---|---|
| **XS-C1** | scheduler ← content | `content.seeded` event is **never published** by any service | Dual-lane card bootstrapping for seeded content is completely inoperative. Scheduler cards only created via `session.started` or `attempt.recorded` paths. |
| **XS-C2** | scheduler ← session | `attempt.recorded` payload has no `lane` field; scheduler's `ReviewRecordedConsumer` returns `null` for lane → **silently drops every event** | FSRS/HLR recalculation from review events is dead. Scheduling state never updates from the event pipeline. |

### User Service

| ID | Finding | File | Impact |
|---|---|---|---|
| **US-C1** | `passwordHash` and `mfaSecret` leaked in ALL API responses | `user.service.ts` — `sanitizeUser()` only used for events, not responses | Password hashes exposed to any authenticated client. Full account takeover risk. |
| **US-C2** | MFA verification code is never actually checked (TOTP validation missing) | `user.service.ts` — `verifyMfa()` | MFA is decorative — any code is accepted. Zero second-factor security. |
| **US-C3** | Admin routes lack scope/permission middleware | `user.routes.ts` | Any authenticated user can call admin endpoints (role management, user listing). |
| **US-C4** | MFA challenge returns `tokens: null as unknown as ITokenPair` | `user.service.ts` — `login()` | Type lie — clients treating tokens as non-null will crash. |
| **US-C5** | Settings endpoint exposes potentially private data from profiles | `user.routes.ts` | Settings leak to any authenticated caller without ownership check. |
| **US-C6** | Admin roles route uses PUT instead of PATCH (replaces entire roles array) | `user.routes.ts` | Dangerous for partial updates — easy to accidentally wipe roles. |

### Session Service

| ID | Finding | File | Impact |
|---|---|---|---|
| **SS-C1** | `removeQueueItem` not atomic — no position recompaction after removal | Queue management | Positions develop gaps, causing ordering bugs in queue display. |
| **SS-C2** | Streak update runs outside Prisma transaction | Streak service | Crash between streak writes leaves inconsistent streak state. |
| **SS-C3** | Streak timezone hardcoded to `'UTC'` | Streak service | Users in UTC-negative timezones can lose/duplicate streaks at day boundaries. |

### Scheduler Service

| ID | Finding | File | Impact |
|---|---|---|---|
| **SC-C1** | Raw SQL `CAST(... AS "Rating")` uses wrong enum casing | Repository SQL | PostgreSQL expects lowercase `rating`, not `"Rating"`. Query will fail at runtime. |

### Knowledge-Graph Service

| ID | Finding | File | Impact |
|---|---|---|---|
| **KG-C1** | `MisconceptionSeverity` has 4 levels; frontend expects 5 (`TRIVIAL`/`MILD`/`MODERATE`/`SEVERE`/`CRITICAL`) | `enums/index.ts` | Frontend receives values it doesn't recognize (`LOW`, `HIGH`). Charts and filters break. |
| **KG-C2** | `revision_requested` missing from `listMutations()` no-filter path | `ckg-mutation-pipeline.ts` | Mutations in revision state become invisible in admin dashboards — data silently disappears. |
| **KG-C3** | Misconception family keys differ between backend and frontend spec (3 mismatches each side) | `misconception-family.config.ts` | Frontend grouping/filtering breaks for 6 of 20 family slots. |

### Shared Packages

| ID | Finding | File | Impact |
|---|---|---|---|
| **PK-C1** | `CkgMutationEscalatedPayloadSchema` missing from Zod schemas | `knowledge-graph-event.schemas.ts` | Runtime validation of escalated mutation events impossible. |
| **PK-C2** | `content.seeded` event consumed but not defined in `@noema/events` | `content.events.ts` | Ghost event — no type safety for producer or consumer. |
| **PK-C3** | Consumer filters for `kg.node.deleted` but shared event is `pkg.node.removed` | `kg-node-deleted.consumer.ts` | Consumer is dead code — event name never matches. Content-service cards never cleaned up when KG nodes are removed. |

### Content Service

| ID | Finding | File | Impact |
|---|---|---|---|
| **CS-C1** | `hint` field excluded from XSS sanitization | `content-sanitizer.ts` | Stored XSS vulnerability via card hint field. |
| **CS-C2** | KG Node Deleted consumer: read-modify-write race loses node links | `kg-node-deleted.consumer.ts` | Concurrent mutations cause silent data loss in `knowledgeNodeIds`. |

---

## Priority: HIGH (Fix Before Frontend Integration)

### Cross-Service Integration

| ID | Service | Finding |
|---|---|---|
| **XS-H1** | knowledge-graph | URL prefix `/api/v1/` while all other services use `/v1/` — gateway routing conflict |
| **XS-H2** | scheduler | `wrapResponse(request, data, hints)` param order differs from all other services (data first elsewhere) |
| **XS-H3** | all | Health check response types: 3 different contracts (shared vs local types, different field names) |
| **XS-H4** | user-service | Error responses missing `metadata` field — breaks `IApiErrorResponse` contract |

### User Service

| ID | Finding |
|---|---|
| **US-H1** | Admin paths prefix mismatch (`/admin/` vs expected) |
| **US-H2** | No `/me/password` endpoint for password changes |
| **US-H3** | No self-service account deletion endpoint |
| **US-H4** | `executionTime` always `0` (never computed) |
| **US-H5** | `emailExists` includes soft-deleted users |
| **US-H6** | `create()` sets `ACTIVE` instead of `PENDING` — bypasses email verification |
| **US-H7** | Missing `USER` base role on creation |
| **US-H8** | Login doesn't create `UserSession` record — admin history always empty |
| **US-H9** | Missing `findByAdmin` repository method |
| **US-H10** | `handleFailedLogin` error messaging reveals whether email exists |

### Session Service

| ID | Finding |
|---|---|
| **SS-H1** | Missing `selfReportedGuess` metacognitive field on attempts |
| **SS-H2** | Route paths use `:sessionId` vs `:id` inconsistently |
| **SS-H3** | App-level sort fetches all queue rows (no DB ORDER BY) |

### Scheduler Service

| ID | Finding |
|---|---|
| **SC-H1** | `leitner` missing from read/filter schemas (only in write schemas) |
| **SC-H2** | No timezone support in forecast queries |
| **SC-H3** | `reviewsByDay` aggregation is timezone-unaware |
| **SC-H4** | `reviewedAt` uses processing timestamp, not original event time |
| **SC-H5** | Inconsistent retention formula (arbitrary `e^(-t/(s*3))` vs correct FSRS/HLR) — **RESOLVED** (`fe2664d`) |
| **SC-H6** | Fragile optional service injection pattern |

### Knowledge-Graph Service

| ID | Finding |
|---|---|
| **KG-H1** | Missing `GET /misconceptions/:detectionId` single-detection endpoint |
| **KG-H2** | No typed payload interface for `CKG_MUTATION_REVISION_REQUESTED` event |
| **KG-H3** | Non-atomic state+fields update in revision flow (crash between steps = stale data) |
| **KG-H4** | CKG traversal missing `frontier` endpoint (PKG has it) |
| **KG-H5** | Structural health route is `/health` not `/structural-health` as frontend expects |

### Shared Packages

| ID | Finding |
|---|---|
| **PK-H1** | `IStreakResponse` not in shared types (session-service local only) |
| **PK-H2** | `ICkgMutation` not in shared types (KG-service local only) |
| **PK-H3** | Scheduler consumers use local `.passthrough()` schemas, not shared canonical schemas |
| **PK-H4** | Content-service consumers skip Zod validation entirely (raw `as` casts) |
| **PK-H5** | `review.submitted` event handled by scheduler but not defined in `@noema/events` |

### Content Service

| ID | Finding |
|---|---|
| **CS-H1** | Route URLs use `/v1/cards/...` not `/v1/users/:userId/cards/...` as in frontend spec |
| **CS-H2** | Missing `GET /v1/cards/types` card type metadata endpoint |
| **CS-H3** | `buildTsQuery` produces invalid PostgreSQL tsquery from special chars → unhandled 500 |
| **CS-H4** | Attempt Recorded consumer: race condition on metadata stats (read-modify-write) |
| **CS-H5** | Missing composite index `(userId, contentHash)` for dedup hot path |
| **CS-H6** | Missing JSONB index for batch `_batchId` queries |

---

## Priority: MEDIUM (Fix During Development)

### Cross-Service

| ID | Finding |
|---|---|
| XS-M1 | Error handler patterns diverge (3 different patterns across 5 services) |
| XS-M2 | Scheduler error responses include `retryable`/`category` — no other service does |
| XS-M3 | `buildContext` implementations diverge (anonymous vs null, different field sets) |
| XS-M4 | User-service `executionTime` hardcoded to 0 with "Set by hook" comment but no hook |
| XS-M5 | KGS uses `:userId` in URL while other services use JWT — cross-reference inconsistency |

### User Service

| ID | Finding |
|---|---|
| US-M1 | Duplicated auth middleware + route helper code |
| US-M2 | Rate limiting only on login, not on registration or password reset |
| US-M3 | `NODE_ENV` checked in domain service (should be infrastructure) |
| US-M4 | Shallow settings merge (loses nested objects) |
| US-M5 | Redundant single-column indexes where composite would be better |
| US-M6 | No foreign key constraints in schema |
| US-M7 | Missing composite indexes for common query patterns |
| US-M8 | Timezone issues in session tracking |
| US-M9 | Email verification incorrectly sets SUSPENDED users to ACTIVE |

### Session Service

| ID | Finding |
|---|---|
| SS-M1 | `newCardsIntroduced` / `lapsedCards` counters never increment (always 0) |
| SS-M2 | Inconsistent ID generation (some UUID, some nanoid) |
| SS-M3 | Fragile timezone parsing in streak calculations |
| SS-M4 | Missing queue position validation |

### Scheduler Service

| ID | Finding |
|---|---|
| SC-M1 | Unbounded card fetch for forecast (no LIMIT) |
| SC-M2 | Missing composite index on `(userId, algorithm)` |
| SC-M3 | NEW card interval inflation (interval grows before first review) |
| SC-M4 | State reset on unsuspend (goes back to `'new'`) |
| SC-M5 | Free-text `algorithm` field vs enum |

### Knowledge-Graph Service

| ID | Finding |
|---|---|
| KG-M1 | Unique constraint allows multiple active detections for same pattern |
| KG-M2 | Traversal route naming divergence (spec vs implementation) |
| KG-M3 | `familyLabel` resolved at read time, not stored |
| KG-M4 | Domain filter on misconceptions uses `startsWith` on misconceptionType — silently returns empty |
| KG-M5 | CKG node/edge routes are read-only (writes via mutations only) |

### Content Service

| ID | Finding |
|---|---|
| CS-M1 | No simple GET list endpoint (requires POST for queries) |
| CS-M2 | Batch state change input not Zod-validated at service layer |
| CS-M3 | `buildContext` doesn't validate JWT payload shape at runtime |
| CS-M4 | `updateKnowledgeNodeIds` skips Zod node ID validation |
| CS-M5 | Double card fetch in `updateTags`/`updateKnowledgeNodeIds` |
| CS-M6 | Event consumers don't validate payloads with Zod schemas |
| CS-M7 | Query cache key uses non-stable `JSON.stringify` (cache misses) |
| CS-M8 | `softDeleteByBatchId` bypasses optimistic locking — **RESOLVED** (`fe2664d`) |
| CS-M9 | Unsafe response mutation/cast in query route |
| CS-M10 | Missing composite index `(userId, deletedAt)` for dominant pattern |
| CS-M11 | Event type strings not using `ContentEventType` enum constants |
| CS-M12 | `decodeCursor` doesn't validate `sortValue` type |
| CS-M13 | `as unknown as` double-casts mask Zod↔domain type mismatches |

### Shared Packages

| ID | Finding |
|---|---|
| PK-M1 | Two incompatible consumer extension patterns (`boolean` vs `void` return) |
| PK-M2 | `KgNodeDeletedConsumer` multi-card update is non-transactional |
| PK-M3 | `SessionStartedConsumer` card-level idempotency fragile |
| PK-M4 | Most defined events (50+) have zero consumers |
| PK-M5 | No Zod schemas for contract types (`IAgentHints`, `ISessionBlueprint`) |

---

## Priority: LOW (Track / Positive Confirmations)

<details>
<summary>Click to expand LOW findings (27 items)</summary>

### Positive Confirmations ✅

- All 27 `MisconceptionType` values mapped to families correctly
- `computeSeverityScore()` formula correct (0.7×confidence + 0.3×normalized)
- CKG typestate transitions correct (including `revision_requested`)
- Prisma `toDomain()` mappers include all Phase 6 fields
- `MisconceptionStatus` lifecycle matches frontend spec
- `user.deleted` cascade correctly implemented across all 4 services
- All routes protected by auth middleware (content-service)
- State machine transitions correctly enforced (content-service)
- Content deduplication via SHA-256 hash correct
- Optimistic locking properly implemented for single-card mutations
- Event consumers have DLQ, retry, and graceful drain
- Full-text search with tsvector + GIN + trigger properly done
- Branded ID types properly imported from `@noema/types` across services
- Event publisher infrastructure consistent (Redis Streams)
- All services use `IApiResponse<T>` from `@noema/contracts`
- Decks/Topics intentionally absent per ADR-0010

### Minor Issues

- Scheduler output events have no consumers (may be future)
- Streak/session summary types not in shared packages
- `executionTime: 0` in user-service responses
- `emailExists` includes soft-deleted accounts

</details>

---

## Systemic Patterns Identified

### Pattern 1: Event Pipeline is Broken
The scheduler's event consumption pipeline has two critical failures:
1. `content.seeded` is never emitted → new cards never get scheduler entries via seeding
2. `lane` is missing from `attempt.recorded` → all review events silently dropped

**Effect:** The scheduler only creates cards through direct API calls or `session.started` events. The primary designed flow (event-driven scheduling) is inoperative.

### Pattern 2: Read-Modify-Write Races
Found in 4 places:
- Content-service `KgNodeDeletedConsumer` (node link array)
- Content-service `AttemptRecordedConsumer` (review stats metadata)
- Session-service streak updates (outside transaction)
- Session-service queue position management (no recompaction)

**Root cause:** Using Prisma's JavaScript-level array/object manipulation instead of atomic DB operations.

### Pattern 3: Consumer Contract Violations
- 3 consumers use raw `as` casts instead of Zod validation (content-service)
- 6 scheduler consumers use local schemas instead of shared canonical schemas
- 1 consumer filters on wrong event name (`kg.node.deleted` vs `pkg.node.removed`)
- 1 consumer handles undefined event type (`review.submitted`)

### Pattern 4: Frontend-Backend Contract Drift
| Area | Frontend Expects | Backend Provides | Gap |
|---|---|---|---|
| Severity levels | 5 (TRIVIAL→CRITICAL) | 4 (LOW→CRITICAL) | 3 mismatched values |
| Family keys | 10 specific keys | 10 keys, 3 differ | 6 slots misaligned |
| Content URL pattern | `/v1/users/:userId/cards` | `/v1/cards` (JWT) | Different routing |
| KG URL prefix | `/v1/...` | `/api/v1/...` | Extra prefix |
| Health responses | Uniform shape | 3 different shapes | No standard |

### Pattern 5: Missing Database Optimizations
- Content-service: 3 missing composite indexes
- User-service: missing composite indexes, redundant single-column indexes
- Scheduler-service: missing composite index on `(userId, algorithm)`
- KG-service: unique constraint doesn't enforce single-active-detection

---

## Recommended Fix Priority

### Phase A: Critical Security & Data Integrity (Do First)
1. **US-C1**: Stop leaking `passwordHash`/`mfaSecret` in API responses
2. **US-C2**: Implement actual TOTP verification
3. **CS-C1**: Add `hint` to sanitization
4. **XS-C2**: Add `lane` field to `attempt.recorded` event payload in session-service
5. **XS-C1**: Publish `content.seeded` event from `buildSessionSeed()` in content-service
6. **SC-C1**: Fix SQL enum casing (`"Rating"` → `rating`)

### Phase B: Event Pipeline Restoration (Do Second)
7. **PK-C2**: Define `content.seeded` in `@noema/events` (type + Zod schema)
8. **PK-C3**: Fix event name in content-service consumer (`kg.node.deleted` → `pkg.node.removed`)
9. **PK-C1**: Add `CkgMutationEscalatedPayloadSchema`
10. **KG-C2**: Add `revision_requested` to `listMutations()` states array
11. **PK-H4**: Add Zod validation to content-service consumers
12. **PK-H3**: Migrate scheduler consumers to shared schemas

### Phase C: Frontend Contract Alignment (Do Third)
13. **KG-C1**: Align severity enum to 5 levels (TRIVIAL/MILD/MODERATE/SEVERE/CRITICAL)
14. **KG-C3**: Align family keys between backend and frontend spec
15. **XS-H1**: Standardize URL prefix across all services
16. **XS-H3**: Standardize health check response contract
17. **CS-H1**: Reconcile content-service URL pattern with frontend spec

### Phase D: Data Integrity Hardening
18. **SS-C1**: Make queue item removal atomic with position recompaction
19. **SS-C2**: Wrap streak update in transaction
20. **CS-C2/CS-H4**: Replace read-modify-write with atomic operations in consumers
21. **KG-H3**: Wrap revision state+fields update in single transaction

### Phase E: Missing Features & Polish
22. **CS-H2**: Add card types metadata endpoint
23. **KG-H1**: Add single misconception detection GET endpoint
24. **US-H2/US-H3**: Add password change and account deletion endpoints
25. **Database indexes**: Add all missing composite indexes
26. **US-H6**: Change default status to PENDING on user creation

---

## Appendix: Service-by-Service Finding Counts

| Service | CRITICAL | HIGH | MEDIUM | LOW |
|---|---|---|---|---|
| User Service | 6 | 10 | 9 | — |
| Session Service | 3 | 3 | 4 | — |
| Content Service | 2 | 6 | 13 | 10 ✅ |
| Knowledge-Graph Service | 3 | 5 | 5 | 7 ✅ |
| Scheduler Service | 1 | 6 | 5 | — |
| Shared Packages | 3 | 5 | 5 | 4 ✅ |
| Cross-Service Integration | 2 | 4 | 5 | 6 ✅ |
| **TOTAL** | **20** | **39** | **46** | **27** |

*Note: Some findings overlap across categories (e.g., PK-C3 is both a package issue and a content-service consumer issue). Totals may differ from deduplicated counts above.*
