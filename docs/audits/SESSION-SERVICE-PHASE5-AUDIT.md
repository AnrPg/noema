# Session Service — Phase 5 Audit Report

> **Auditor:** GitHub Copilot  
> **Date:** 2026-03-04  
> **Scope:** `services/session-service/src/**` — Session enhancements & study streak (Phase 5)  
> **Compiler:** `npx tsc --noEmit` — **6 errors in 3 files** (pre-existing)

---

## Summary

| Severity | Count |
| -------- | ----- |
| CRITICAL | 2     |
| HIGH     | 7     |
| MEDIUM   | 9     |
| LOW      | 7     |
| **Total**| **25**|

---

## CRITICAL

### C-1 · Streak update uses hardcoded `'UTC'` timezone — breaks streak for non-UTC users

**File:** `services/session-service/src/domain/session-service/session.service.ts` L1113  
**Spec ref:** T5.4 — "Convert session.completedAt to user's timezone → sessionDate"

```typescript
// Line 1113
if (this.streakService) {
  await this.streakService.updateStreakOnCompletion(ctx.userId, now, 'UTC');
  //                                                              ^^^^^^
}
```

`completeSession()` always passes `'UTC'` as the timezone. The spec explicitly requires converting
`completedAt` to the **user's local timezone** before determining the session date. A user in UTC+3
who completes a session at 23:30 local time (20:30 UTC) will have it counted as **the correct UTC date**
but the **wrong local date** (today vs yesterday) depending on direction. This silently corrupts
`currentStreak`, `longestStreak`, and `lastActiveDate` for every non-UTC user.

**Fix:** Retrieve user timezone from the `UserStreak` record (or from the user profile) and pass it.
The `UserStreak` model already stores `timezone`. The initial completion (when no streak record exists)
should use a default from user profile settings or accept it as a parameter.

---

### C-2 · `getNextSequenceNumber` called outside transaction — race condition on concurrent attempts

**File:** `services/session-service/src/domain/session-service/session.service.ts` L1395  
**File:** `services/session-service/src/infrastructure/database/prisma-session.repository.ts` L545

```typescript
// session.service.ts L1395 — OUTSIDE transaction
const sequenceNumber = await this.repository.getNextSequenceNumber(session.id);
// ...
const attempt = await this.runInTransaction(async (tx) => {
  const createdAttempt = await this.repository.createAttempt(attemptInput, tx);
  // attemptInput already has `sequenceNumber` baked in
```

`getNextSequenceNumber` uses `MAX(sequence_number)` without any lock. If two concurrent
`recordAttempt` calls run for the same session:

1. Both read `MAX = 5`
2. Both compute `sequenceNumber = 6`
3. Both create an attempt with `sequenceNumber = 6` — duplicate

The `Attempt` model has no unique constraint on `(sessionId, sequenceNumber)`, so both inserts succeed.
This corrupts attempt ordering and session stats.

**Fix:** Move `getNextSequenceNumber` inside the transaction and/or add `@@unique([sessionId, sequenceNumber])` to the Prisma schema. Alternatively, use `SELECT ... FOR UPDATE` inside the transaction.

---

## HIGH

### H-1 · `deckId` filter maps to `deckQueryId` column — semantic mismatch

**File:** `services/session-service/src/infrastructure/database/prisma-session.repository.ts` L257–258  
**Spec ref:** T5.1 — "deckId: UUID — Filter to sessions for a specific deck"

```typescript
if (filters?.deckId) {
  where['deckQueryId'] = filters.deckId;
}
```

The spec defines `deckId` as a **deck UUID** (the deck the user studied). The code maps it to
`deckQueryId` (a DeckQueryLog reference — the query that *resolved* the deck into cards). These are
different entities. Users would need to supply a `DeckQueryLogId` to use this filter, which the
frontend doesn't have and the spec doesn't intend. The filter is functionally broken for its intended
purpose.

**Fix:** Either:
- Add a `deckId` column to the Session model (denormalized from the deck query), or
- Rename the filter to `deckQueryId` to match the actual column, and document the semantic difference.

---

### H-2 · GDPR gap: `OfflineIntentTokenReplayGuard` records not deleted on hard user deletion

**File:** `services/session-service/src/events/consumers/user-deleted.consumer.ts` L119–175  
**Prisma model:** `OfflineIntentTokenReplayGuard` has `userId` column

The `hardDeleteUserData()` method deletes sessions, attempts, queue items, cohort handshakes, outbox
entries, and streak records. It does **not** delete `OfflineIntentTokenReplayGuard` records, which
contain `userId`, `issuedAt`, `expiresAt`, and `consumedAt` — all personally identifiable metadata.

**Fix:** Add to `hardDeleteUserData`:
```typescript
await this.prisma.offlineIntentTokenReplayGuard.deleteMany({ where: { userId } });
```

---

### H-3 · `computeUpdatedStats` doesn't count `partial` outcome — stats drift

**File:** `services/session-service/src/domain/session-service/session.service.ts` L2668–2671

```typescript
const correctCount = current.correctCount + (attempt.outcome === 'correct' ? 1 : 0);
const incorrectCount = current.incorrectCount + (attempt.outcome === 'incorrect' ? 1 : 0);
const skippedCount = current.skippedCount + (attempt.outcome === 'skipped' ? 1 : 0);
```

The `AttemptOutcome` enum includes `PARTIAL` but the stats computation only increments counters for
`correct`, `incorrect`, and `skipped`. Partial outcomes increment `totalAttempts` but none of the
subcounters, causing an invariant violation:
`totalAttempts > correctCount + incorrectCount + skippedCount`

This breaks `retentionRate` (which is `correctCount / totalAttempts`) and any downstream analytics.

**Fix:** Add a `partialCount` field to `ISessionStats` or count partial as incorrect for retention calculation purposes.

---

### H-4 · `findAttemptsByCard` called outside transaction in `recordAttempt`

**File:** `services/session-service/src/domain/session-service/session.service.ts` L1438–1441

```typescript
const attempt = await this.runInTransaction(async (tx) => {
  const createdAttempt = await this.repository.createAttempt(attemptInput, tx);
  const attemptsForCard = await this.repository.findAttemptsByCard(
    session.id, data.cardId as CardId
  );
  // ^^^^ findAttemptsByCard uses `this.prisma` not `tx`
```

`findAttemptsByCard` is called inside the transaction callback but the repository method uses
`this.prisma` (the default client) not the transaction client `tx`. It doesn't accept a `tx` param.
This means it reads from outside the transaction boundary — the just-created attempt may or may not be
visible depending on transaction isolation level.

The result: `isFirstAttemptForCard` could be wrong, leading to incorrect `uniqueCardsReviewed` stats.

**Fix:** Add `tx` parameter to `findAttemptsByCard` in the repository interface and implementation.

---

### H-5 · No IANA timezone validation — unhandled `RangeError` on invalid timezone

**File:** `services/session-service/src/domain/session-service/streak.service.ts` L74–82

```typescript
function toLocalDate(isoTimestamp: string, timezone: string): string {
  const date = new Date(isoTimestamp);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, // <— throws RangeError for invalid timezone
```

The `StreakQuerySchema` accepts any string 1–50 chars as timezone with no IANA validation. An invalid
timezone (e.g., `"foo/bar"`, `"UTC+5"`) causes `Intl.DateTimeFormat` to throw an unhandled
`RangeError`, which bubbles up as a 500 Internal Server Error instead of a 400.

**Fix:** Either validate the timezone in the Zod schema with a custom refine, or wrap the formatter
creation in a try-catch that throws a `ValidationError`.

---

### H-6 · `toTimezoneStartOfDay` DST offset calculation is fragile

**File:** `services/session-service/src/domain/session-service/streak.service.ts` L337–350

```typescript
private toTimezoneStartOfDay(dateStr: string, timezone: string): string {
  const refDate = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0)); // noon UTC
  const utcStr = refDate.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr = refDate.toLocaleString('en-US', { timeZone: timezone });
  const utcDate = new Date(utcStr);
  const tzDate = new Date(tzStr);
  const offsetMs = utcDate.getTime() - tzDate.getTime();
  // Midnight in the timezone = midnight UTC + offset
  const midnightUtc = new Date(Date.UTC(y!, m! - 1, d!, 0, 0, 0));
  return new Date(midnightUtc.getTime() + offsetMs).toISOString();
}
```

This calculates the timezone offset at **noon** and applies it to **midnight**. During DST "spring
forward" transitions (e.g., clocks skip 2 AM → 3 AM), the UTC offset at midnight can differ from the
offset at noon by 1 hour. This produces a start-of-day that is off by 1 hour, potentially including
or excluding sessions from the wrong date boundary.

**Fix:** Use a library like `Temporal` (tc39 proposal, available via polyfill) or `luxon`/`date-fns-tz`
for reliable timezone-aware date operations, or compute the offset at midnight specifically.

---

### H-7 · Pre-existing type error: `Environment` type excludes `'test'`

**File:** `services/session-service/src/index.ts` L57  
**Type def:** `packages/types/src/enums/index.ts` L178–185

```typescript
const isDevLikeEnvironment =
  config.service.environment === 'development' || config.service.environment === 'test';
//                                                                              ^^^^^^
// TS2367: types '"staging" | "production"' and '"test"' have no overlap.
```

The `Environment` enum is `'development' | 'staging' | 'production'` — it has no `'test'` variant.
This comparison is always `false` in the type system, meaning `AUTH_DISABLED=true` guard only matches
`'development'`, not `'test'`. In a test environment (where `NODE_ENV=test`), `loadConfig()` would cast
it to `Environment` type but the comparison still evaluates at runtime. However, the static analysis
flags it and it's semantically wrong.

**Fix:** Add `TEST: 'test'` to the `Environment` enum in `@noema/types`, or change the check to
`!== 'production' && !== 'staging'`.

---

## MEDIUM

### M-1 · No event consumer for streak updates — inline-only update is fragile

**File:** `services/session-service/src/domain/session-service/session.service.ts` L1113  
**Spec ref:** T5.4 — "updated every time a session is completed (via the SessionCompleted event consumer from Phase 2)"

The spec recommends updating the streak cache via an **event consumer** for `session.completed`. The
implementation does it inline in `completeSession()`. This means:

- If the inline call fails (network, transient error), the streak update is silently lost (caught and logged)
- System-level session expiration (`expireSessionSystem`) doesn't trigger a streak update — acceptable for expired sessions, but the inline approach means no reprocessing path exists
- No replay capability from the event stream

**Remediation:** Consider adding a `SessionCompletedStreakConsumer` that reads `session.completed` events
from the stream, providing at-least-once delivery guarantees.

---

### M-2 · App-level sort fetches all matching sessions into memory

**File:** `services/session-service/src/infrastructure/database/prisma-session.repository.ts` L303–330

When `sortBy` is `retentionRate`, `totalAttempts`, or `durationMs`, the repository fetches **all**
matching sessions, maps them to domain objects, sorts in memory, then paginates. For a user with
thousands of sessions, this is O(N) memory and CPU.

Combined with `minAttempts` (also post-fetch), a request like
`GET /v1/sessions?sortBy=retentionRate&minAttempts=10` fetches the entire session history.

**Remediation:** For `totalAttempts`, consider using Prisma raw queries with JSONB path sorting
(`ORDER BY (stats->>'totalAttempts')::int`). Alternatively, denormalize these fields out of JSONB.

---

### M-3 · `minAttempts` filter with DB-level sort also fetches all rows

**File:** `services/session-service/src/infrastructure/database/prisma-session.repository.ts` L340–350

```typescript
if (filters?.minAttempts !== undefined) {
  const [allRows] = await Promise.all([
    this.prisma.session.findMany({ where, orderBy }),
  ]);
  let sessions = allRows.map(toSessionDomain);
  sessions = sessions.filter((s) => s.stats.totalAttempts >= filters.minAttempts!);
```

Even when using DB-level sort (`createdAt`, `completedAt`), `minAttempts` forces a full table scan
into memory. The `Promise.all` around a single promise is also redundant.

---

### M-4 · `streak_break` checkpoint signal has no implementation

**File:** `services/session-service/src/domain/session-service/session.service.ts` L489–530

The `evaluateAdaptiveCheckpoint` method handles `error_cascade`, `latency_spike`, and
`confidence_drift` but has no specific logic for `streak_break` or `manual`. Both fall through to the
default "no intervention needed" directive. The signals are defined in the enum but have no behavioral
effect.

---

### M-5 · `completedAfter`/`completedBefore` implicitly forces `state = COMPLETED`

**File:** `services/session-service/src/infrastructure/database/prisma-session.repository.ts` L275–278

```typescript
if (!filters.state) {
  where['state'] = 'COMPLETED' as PrismaSessionState;
}
```

When `completedAfter`/`completedBefore` filters are used without an explicit `state` filter, the code
forces `state = COMPLETED`. This means you can't query "sessions that were abandoned during a date
range" using the `completedAt` field (abandoned sessions also have `completedAt` set). This may be
intentional but is undocumented and differs from the spec which says "Only COMPLETED sessions completed
on or after this ISO timestamp" in the type definition but the actual repo code override is implicit.

---

### M-6 · Missing composite index for streak query pattern

**Prisma:** `services/session-service/prisma/schema.prisma`

The `findCompletedSessionsInRange` query filters on `(userId, state='COMPLETED', completedAt range)`.
The existing indexes are:
- `@@index([userId])` — too broad
- `@@index([userId, state])` — missing `completedAt`
- `@@index([userId, completedAt])` — missing `state`

A composite index `@@index([userId, state, completedAt])` would make streak queries more efficient,
especially for users with many non-completed sessions.

---

### M-7 · `publishThroughOutbox` throws after successful enqueue — confusing error semantics

**File:** `services/session-service/src/domain/session-service/session.service.ts` L2688–2710

When called without a transaction, the method:
1. Enqueues the event (success — it's durably stored)
2. Eagerly tries to publish to Redis
3. If Redis publish fails, marks the event as failed in outbox AND throws `OutboxDispatchError`

The event will be delivered by the outbox worker eventually (that's the whole point of the outbox
pattern). But throwing an error here makes the calling operation appear to have failed. For
non-critical notifications like `session.teaching.changed`, this turns a transient Redis issue into a
user-facing error.

**Remediation:** When not in a transaction, consider logging the eager-publish failure and returning
success, since the outbox worker guarantees eventual delivery.

---

### M-8 · No rate limiting on `GET /v1/sessions/streak`

The streak endpoint is designed for dashboard page loads (spec says <50ms response). Without rate
limiting, it can be abused. The endpoint hits the database for both the streak cache and the session
history query.

---

### M-9 · No validation of date range sanity in list filters

**File:** `services/session-service/src/domain/session-service/session.schemas.ts` L335–341

If a client passes `createdAfter > createdBefore` or `completedAfter > completedBefore`, the query
returns 0 results silently. A Zod `.refine()` to validate that `after < before` would provide better
developer experience.

---

## LOW

### L-1 · Pre-existing type errors: Prisma JSON null assignment (2 errors)

**File:** `services/session-service/src/infrastructure/database/prisma-session.repository.ts` L789–790

```typescript
acceptedCardIds: null,  // TS2322: null not assignable to InputJsonValue
rejectedCardIds: null,  // TS2322: null not assignable to InputJsonValue
```

**Fix:** Use `Prisma.JsonNull` or `Prisma.DbNull` instead of bare `null`.

---

### L-2 · Pre-existing type error: union type property access without narrowing

**File:** `services/session-service/src/infrastructure/database/prisma-session.repository.ts` L816

```typescript
acceptedCardIds: input.acceptedCardIds as unknown as object,
// TS2339: 'acceptedCardIds' doesn't exist on ICommitCohortInput
```

`updateCohortHandshake` receives `IAcceptCohortInput | ICommitCohortInput` but `ICommitCohortInput`
has `committedCardIds`, not `acceptedCardIds`.

**Fix:** Narrow the type: `'acceptedCardIds' in input ? input.acceptedCardIds : input.committedCardIds`.

---

### L-3 · Pre-existing type errors: `claims` narrowed to `never` (2 errors)

**File:** `services/session-service/src/domain/session-service/session.service.ts` L2225, L2230

```typescript
let claims: IOfflineIntentTokenClaims | null = null;
let token: string | null = null;
await this.runInTransaction(async (tx) => { /* assigns claims and token */ });
if (claims === null || token === null) { throw ... }
// After this guard, TS narrows claims to `never` because it doesn't track
// mutations inside async callbacks
claims.expiresAt; // TS2339: Property 'expiresAt' does not exist on type 'never'
```

**Fix:** Use a non-null assertion (`claims!.expiresAt`) or restructure to return values from the
transaction instead of mutating outer variables.

---

### L-4 · `get-session-history` MCP tool doesn't support Phase 5 filters

**File:** `services/session-service/src/agents/tools/session.tools.ts` L147–164

The tool handler only extracts `state`, `limit`, `offset` from input. It doesn't pass through
`createdAfter`, `createdBefore`, `completedAfter`, `completedBefore`, `deckId`, `minAttempts`,
`sortBy`, or `sortOrder` — meaning agents can't use enhanced filtering.

---

### L-5 · `SessionAlreadyActiveError` is deprecated dead code

**File:** `services/session-service/src/domain/session-service/errors/session.errors.ts` L143–155

The error class is marked `@deprecated` and is never thrown anywhere. `BusinessRuleError` is used
instead for concurrent session enforcement. This is dead code that should be removed.

---

### L-6 · Hardcoded service version `'0.1.0'` in route metadata

**Files:**
- `services/session-service/src/api/rest/session.routes.ts` L91, L96
- `services/session-service/src/agents/tools/tool.routes.ts` L67

Service version is hardcoded as `'0.1.0'` in response metadata instead of reading from config
(`config.service.version`). This means version bumps won't be reflected in API responses.

---

### L-7 · `buildContext` falls back to `'anonymous'` userId

**File:** `services/session-service/src/api/rest/session.routes.ts` L77

```typescript
userId: (user?.sub ?? 'anonymous') as UserId,
```

If auth middleware somehow allows a request without `sub`, all operations would execute under
`'anonymous'` as a real user ID. This shouldn't happen in practice but is a defense-in-depth gap.

---

## Type Error Summary (6 pre-existing errors)

| # | File | Line | Error | Root Cause |
|---|------|------|-------|------------|
| 1 | `session.service.ts` | 2225 | `TS2339` expiresAt on never | Async callback mutation not tracked by TS (L-3) |
| 2 | `session.service.ts` | 2230 | `TS2339` expiresAt on never | Same as #1 (L-3) |
| 3 | `index.ts` | 57 | `TS2367` unintentional comparison | `Environment` type has no `'test'` variant (H-7) |
| 4 | `prisma-session.repository.ts` | 789 | `TS2322` null → JSON | Use `Prisma.JsonNull` (L-1) |
| 5 | `prisma-session.repository.ts` | 790 | `TS2322` null → JSON | Same as #4 (L-1) |
| 6 | `prisma-session.repository.ts` | 816 | `TS2339` acceptedCardIds | Union type not narrowed (L-2) |

---

## Spec Compliance Checklist

| Acceptance Criterion | Status | Notes |
|---------------------|--------|-------|
| `GET /v1/sessions` supports enhanced filters | ✅ Implemented | `deckId` has semantic mismatch (H-1) |
| Session list includes inline `stats` object | ✅ Implemented | Stats returned from JSONB |
| `GET /v1/sessions/streak` returns full response | ✅ Implemented | |
| Streak respects user timezone | ❌ **Broken** | Hardcoded `'UTC'` (C-1) |
| Heatmap intensity 0–4 | ✅ Implemented | |
| `completedAt` field on Session model | ✅ Implemented | Was already in schema |
| `UserStreak` model caches streak | ✅ Implemented | |
| Lazy streak reset on read | ✅ Implemented | |
| Zod validation for all query params | ✅ Implemented | Missing IANA timezone validation (H-5) |
| Performance <50ms for cached streak | ⚠️ Untested | No rate limiting (M-8), no caching layer |
