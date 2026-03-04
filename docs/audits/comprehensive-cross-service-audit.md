# Comprehensive Cross-Service Audit

**Date:** 2025-01-XX (updated 2026-03-04) **Scope:** All services, shared
packages, frontend apps **Methodology:** Automated sub-agent audits per service +
manual cross-reference

---

## Executive Summary

| Service                   | CRITICAL | HIGH   | MEDIUM | LOW    |
| ------------------------- | -------- | ------ | ------ | ------ |
| @noema/types & events     | 2        | 2      | 4      | 2      |
| knowledge-graph-service   | 3        | 4      | 6      | 5      |
| session-service           | 1        | 4      | 5      | 7      |
| scheduler-service         | 1        | 4      | 4      | 6      |
| user-service              | 2        | 4      | 8      | 5      |
| content-service           | 1        | 1      | 4      | 3      |
| **Frontend / API client** | **0**    | **3**  | **3**  | **0**  |
| **TOTAL**                 | **10**   | **22** | **34** | **28** |

---

## CRITICAL Findings (10)

### C1 — @noema/types: `TemplateId` Missing Factory Object — **RESOLVED** (`39db93c`)

- **File:** `packages/types/src/branded-ids/index.ts`
- **Impact:** No runtime `TemplateId.create()` / `TemplateId.isValid()` /
  `TemplateId.prefix` — consumers must cast manually
- **Fix:** Add factory object after `AgentId` factory

### C2 — @noema/types: `TemplateId` Missing From `AnyBrandedId` Union — **RESOLVED** (`39db93c`)

- **File:** `packages/types/src/branded-ids/index.ts` L474-507
- **Impact:** Generic ID handling (serialization, validation) silently skips
  TemplateId
- **Fix:** Add `| TemplateId` to union

### C3–C5 — KG-Service: `revision_requested` Omitted From 3 Query Methods — **RESOLVED** (`39db93c`)

- **File:**
  `services/knowledge-graph-service/src/domain/knowledge-graph-service/ckg-mutation-pipeline.ts`
- **Methods:** `listMutations` (L277), `listActiveMutations` (L298),
  `getPipelineHealth` (L680)
- **Impact:** Mutations in `revision_requested` state silently disappear from
  all queries and health metrics
- **Fix:** Add `'revision_requested'` to state arrays; add count in health
  metrics

### C6 — Session-Service: `expiresAt` on `never` — Closure Mutation Not Narrowed — **RESOLVED** (`39db93c`)

- **File:**
  `services/session-service/src/domain/session-service/session.service.ts`
  ~L2225
- **Impact:** TypeScript control flow cannot narrow `claims` (let-declared,
  mutated inside async closure) after null-check throw guard. Property access
  `claims.expiresAt` remains `never` type internally.
- **Fix:** Extract to const after null guard: `const validClaims = claims;`

### C7 — Scheduler-Service: `'leitner'` Accepted With Zero Implementation — **RESOLVED** (`39db93c`)

- **File:**
  `services/scheduler-service/src/domain/scheduler-service/scheduler.schemas.ts`
  L20
- **Impact:** API accepts `algorithm: 'leitner'` but no scheduling logic exists
  — silently falls through to FSRS; `deriveIntervalDays` type-excludes
  `'leitner'`
- **Fix:** Remove `'leitner'` from `SchedulerAlgorithmSchema`

### C8 — User-Service: No GDPR Data Export Endpoint

- **Impact:** GDPR Article 20 data portability not implemented
- **Status:** Deferred (requires design decision — out of scope for this fix
  pass)

### C9 — User-Service: Auth Middleware Conditionally Applied via Runtime Check

- **File:** `services/user-service/src/api/rest/user.routes.ts` ~L343
- **Impact:** `authMiddleware !== undefined` pattern on ~15 routes — if
  injection fails silently, routes become unauthenticated
- **Status:** Architectural pattern — acceptable if constructor validates
  middleware presence

### C10 — Content-Service: `fromDbCardType` Returns Hyphens Instead of Underscores — **RESOLVED** (`39db93c`)

- **File:**
  `services/content-service/src/infrastructure/database/prisma-template.repository.ts`
  L47-48
- **Impact:** `IMAGE_OCCLUSION` → `'image-occlusion'` instead of
  `'image_occlusion'`. Breaks template instantiation for all 30+ multi-word card
  types.
- **Fix:** Remove `.replace(/_/g, '-')` from `fromDbCardType`; remove
  `.replace(/-/g, '_')` from `toDbCardType`

---

## HIGH Findings (22) — Actionable Subset

### H1 — @noema/types: `Environment` Enum Missing `'test'` — **RESOLVED** (`39db93c`)

- **File:** `packages/types/src/enums/index.ts` L179-185
- **Impact:** Session-service `config.service.environment === 'test'` always
  false; comparison flagged by TS strict
- **Fix:** Add `TEST: 'test'` to Environment enum

### H2 — User-Service: `TooManyLoginAttemptsError` Returns 422, Should Be 429 — **RESOLVED** (`39db93c`)

- **File:** `services/user-service/src/api/rest/user.routes.ts` ~L210
- **Impact:** Rate limiting semantics lost — HTTP 429 triggers retry-after
  behavior in clients
- **Fix:** Add specific `instanceof TooManyLoginAttemptsError` check before
  BusinessRuleError

### H3 — User-Service: `ExternalServiceError` Returns 400, Should Be 502 — **RESOLVED** (`39db93c`)

- **File:** `services/user-service/src/api/rest/user.routes.ts`
- **Impact:** Client cannot distinguish user error from upstream failure
- **Fix:** Add `instanceof ExternalServiceError` check mapping to 502

### H4 — Content-Service: `ExternalServiceError` Returns 400, Should Be 502 — **RESOLVED** (`39db93c`)

- **File:** `services/content-service/src/api/shared/route-helpers.ts`
- **Impact:** Same as H3
- **Fix:** Add `instanceof ExternalServiceError` check mapping to 502

### H5 — Scheduler-Service: `getReviewQueue()` Has No REST Route

- **Impact:** Frontend cannot fetch due-card queue — blocks core review flow
- **Fix:** Add `GET /v1/scheduler/review-queue` route

### H6 — Scheduler-Service: `predictRetention()` Has No REST Route

- **Impact:** Frontend cannot display retention predictions
- **Fix:** Add `POST /v1/scheduler/retention/predict` route

### H7 — Scheduler-Service: Dual Retention Formulas

- **File:** `scheduler.service.ts`
- **Impact:** `computeRecallProbability()` uses FSRS forgettingCurve,
  `review-window-proposals` uses simplified `Math.exp(-t/(s*3))`
- **Status:** Documented inconsistency — both are valid approximations for
  different contexts

### H8 — Session-Service: `null` Not Assignable to Prisma Nullable JSON (Needs `Prisma.DbNull`) — **RESOLVED** (`39db93c`)

- **File:**
  `services/session-service/src/infrastructure/database/prisma-session.repository.ts`
  L789
- **Impact:** `acceptedCardIds: null` means "don't update" in Prisma — field is
  never cleared
- **Fix:** Use `Prisma.DbNull` for JSON null semantics

### H9 — Frontend: `version: 0` Hardcoded in 3 Mutation Hooks — **RESOLVED** (`39db93c`)

- **File:** `packages/api-client/src/hooks/index.ts` L140, L153, L167
- **Impact:** Optimistic locking silently bypassed — concurrent edits can
  overwrite
- **Fix:** Accept version as part of mutation input

### H10 — Frontend: `getPublicProfile` Calls Non-Existent Route — **RESOLVED** (`39db93c`)

- **File:** `packages/api-client/src/user/api.ts` L67-68
- **Impact:** Runtime 404 if called
- **Fix:** Remove or mark as TODO

### H11 — Content-Service: `softDeleteByBatchId` Doesn't Increment Version

- **File:**
  `services/content-service/src/infrastructure/database/prisma-content.repository.ts`
  L556-569
- **Impact:** Optimistic locking gap for batch soft-deletes
- **Status:** `updateMany` doesn't support `{ increment: 1 }` — needs raw SQL or
  individual updates

---

## Fix Plan (This Commit)

Fixes applied in this pass:

- C1, C2: TemplateId factory + AnyBrandedId union
- C3–C5: revision_requested in KG-service (3 methods)
- C6: Session-service expiresAt narrowing
- C7: Remove 'leitner' from scheduler schema
- C10: Content-service enum mapping fix
- H1: Environment enum add 'test'
- H2, H3: User-service error mappings (TooManyLoginAttemptsError → 429,
  ExternalServiceError → 502)
- H4: Content-service ExternalServiceError → 502
- H8: Session-service Prisma.DbNull
- H9: Frontend version hardcoding
- H10: Frontend phantom route

Deferred (require design decisions or new features):

- C8, C9: GDPR endpoints, auth middleware pattern
- H5, H6: New scheduler REST routes (requires ADR)
- H7: Dual retention formula alignment
- H11: Batch soft-delete version increment
