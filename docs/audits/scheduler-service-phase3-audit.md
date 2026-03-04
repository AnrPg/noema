# Scheduler-Service Audit Report — Phase 3

**Date:** 2026-03-04  
**Scope:** `services/scheduler-service/src/**` — all 38 TypeScript source files, Prisma schema, Phase 3 spec  
**TypeScript check:** `npx tsc --noEmit` — **0 errors**

---

## CRITICAL

### C1 — State machine graduation path is dead code; cards can never reach `GRADUATED` state

**Files:**  
- `services/scheduler-service/src/domain/scheduler-service/state-machine.ts` L110–115 (review transitions), L268–275 (graduation check)

**Description:**  
The `STATE_TRANSITION_MAP` for the `review` state maps all ratings to `'review'`:

```ts
review: {
  again: 'relearning',
  hard: 'review',
  good: 'review',
  easy: 'review',   // ← should be 'graduated' when consecutiveCorrect >= threshold
}
```

The graduation guard at L268 checks `if (toState === 'graduated' && fromState === 'review')` — but `toState` will **never** be `'graduated'` when coming from `review` because the map doesn't include that value. The `GRADUATION_THRESHOLD` (3) is defined but the transition is unreachable.

**Impact:** The `GRADUATED` state in the `SchedulerCardState` Prisma enum and the state machine is dead. Cards with long review streaks stay in `review` forever, defeating the purpose of the graduated state.

**Fix:** Change `review.easy` (and possibly `review.good`) to map to `'graduated'`, and let the graduation guard downgrade to `'review'` when `consecutiveCorrect < GRADUATION_THRESHOLD`. Alternatively, apply the graduation check **after** looking up the base transition, overriding the target state.

---

### C2 — `predictRetention` uses incorrect, ad-hoc forgetting curve formula instead of FSRS/HLR models — **RESOLVED** (`fe2664d`)

**Files:**  
- `services/scheduler-service/src/domain/scheduler-service/scheduler.service.ts` L782–783

**Status**: Resolved — `predictRetention` now uses algorithm-specific formulas:
- FSRS: `fsrs.forgettingCurve(intervalDays, stability)` (proper FSRS power-law curve)
- HLR: `Math.pow(2, -intervalDays / stability)` (correct half-life formula)
- SM2: falls back to simplified exponential with reduced confidence (0.5)

Consistent with `proposeReviewWindows` and `computeRecallProbability` in
`SchedulerReadService`.

**Description (original):**  
The `predictRetention` method computes:

```ts
const retentionProbability = Math.exp(-intervalDays / (stability * 3));
```

This is a simple exponential decay with an arbitrary scaling factor of 3 — it is **not** the FSRS forgetting curve (`(1 + factor * t / S) ^ decay`) nor the HLR formula (`2^(-t / halfLife)`). The same codebase has correct implementations:
- `FSRSModel.forgettingCurve()` in `algorithms/fsrs.ts` L205
- `2^(-t / halfLife)` used in `scheduler-read.service.ts` L337

It also uses `intervalDays` (the scheduled interval) instead of `elapsedDays` (time since last review), which computes the wrong thing semantically — retention should measure recall probability **now**, not at the scheduled interval.

**Impact:** The `predict-retention` agent tool returns inaccurate retention probabilities. For FSRS cards the formula diverges significantly from the correct curve (off by 10–30%+ depending on parameters). For HLR cards the formula is entirely wrong.

**Fix:** Use `FSRSModel.forgettingCurve(elapsedDays, stability)` for FSRS cards and `2^(-elapsedDays / halfLife)` for HLR cards, consistent with `SchedulerReadService.computeRecallProbability()`.

---

### C3 — Review-recorded consumer silently drops events when `lane` is missing from payload

**Files:**  
- `services/scheduler-service/src/events/consumers/review-recorded.consumer.ts` L140–145

**Description:**  
If the incoming `attempt.recorded` event has no `lane` field (which is defined as `z.string().optional()` in the payload schema — L72), `readLane()` returns `null`, and the entire event is silently skipped:

```ts
const lane = this.readLane(parsed.data.lane);
if (lane === null) {
  this.logger.warn({ eventType: envelope.eventType }, 'Skipping payload with invalid lane');
  spanSuccess = true;
  return;
}
```

**Impact:** Session-service or content-service events that omit the `lane` field cause review data loss. The consumer should look up the card's existing lane from the SchedulerCard record (which was created by `card-lifecycle.consumer`) instead of requiring a lane in the event payload.

**Fix:** Fall back to `existing.lane` (from the SchedulerCard lookup done later at L154) when `lane` is null. Restructure to look up the card **before** checking lane, and use the card's lane as the default.

---

## HIGH

### H1 — Leitner algorithm accepted by schema validation but completely unimplemented

**Files:**  
- `services/scheduler-service/src/domain/scheduler-service/scheduler.schemas.ts` L20 — accepts `'leitner'`
- `services/scheduler-service/src/domain/scheduler-service/scheduler.service.ts` L926 — `deriveIntervalDays` has no `leitner` branch
- `services/scheduler-service/src/types/scheduler.types.ts` — all algorithm type unions use `'fsrs' | 'hlr' | 'sm2'` (no `leitner`)

**Description:**  
The Zod schema `SchedulerAlgorithmSchema` accepts `'leitner'` as a valid algorithm, but:
1. The TypeScript type union `'fsrs' | 'hlr' | 'sm2'` doesn't include `'leitner'` — type narrowing will miss it.
2. No algorithm implementation class (like `FSRSModel`, `HLRModel`) exists for Leitner.
3. `deriveIntervalDays()` falls through to the FSRS default for unknown algorithms.
4. Recall probability computation returns `null` for non-FSRS/HLR algorithms.
5. The Phase 3 read schemas (`scheduler-read.schemas.ts` L24) use `z.enum(['fsrs', 'hlr', 'sm2'])` **without** `'leitner'`, creating a schema mismatch.

**Impact:** A card committed with `algorithm: 'leitner'` will be silently treated as FSRS with wrong scheduling parameters. The schema mismatch means cards stored as `leitner` can't be queried via the Phase 3 read API.

**Fix:** Either remove `'leitner'` from `SchedulerAlgorithmSchema` until it's implemented, or implement a Leitner scheduling algorithm and add it to all type unions and read schemas.

---

### H2 — `GET /v1/scheduler/cards/:cardId` returns HTTP 400 for not-found instead of 404

**Files:**  
- `services/scheduler-service/src/api/rest/scheduler.routes.ts` L319–327

**Description:**  
When `getSchedulerCard()` throws "not found", the catch block sends `statusCode: 400` regardless:

```ts
void sendErrorEnvelope(reply, request, {
  statusCode: 400,
  code: message.includes('not found') ? 'CARD_NOT_FOUND' : 'SCHEDULER_ERROR',
  ...
});
```

The error code is set to `'CARD_NOT_FOUND'`, but the HTTP status code is always 400.

**Impact:** Clients receive 400 (Bad Request) instead of 404 (Not Found). This breaks standard REST semantics and confuses frontend error handling.

**Fix:** Use `statusCode: message.includes('not found') ? 404 : 400`.

---

### H3 — Raw SQL `reviewsByDay` query uses wrong PostgreSQL enum type name `"Rating"` instead of `"rating"`

**Files:**  
- `services/scheduler-service/src/infrastructure/database/prisma-review.repository.ts` L299

**Description:**  
The raw query casts rating values to the PostgreSQL enum type `"Rating"`:

```sql
AND rating = CAST(${filters.rating.toUpperCase()} AS "Rating")
```

But the Prisma schema maps the enum to `@@map("rating")` (lowercase). The actual PostgreSQL type name is `rating`, not `Rating`. PostgreSQL enum type names are case-sensitive when quoted.

**Impact:** The `reviewsByDay` query will fail with a runtime error (`type "Rating" does not exist`) whenever the `rating` filter is provided.

**Fix:** Change `"Rating"` to `"rating"` (matching the `@@map` value in the schema).

---

### H4 — `handleError` in scheduler routes always returns 400, even for internal server errors

**Files:**  
- `services/scheduler-service/src/api/rest/scheduler.routes.ts` L44–52

**Description:**  
The generic `handleError()` function always sends `statusCode: 400`:

```ts
function handleError(error: unknown, request: FastifyRequest, reply: FastifyReply): void {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  void sendErrorEnvelope(reply, request, {
    statusCode: 400,
    code: 'SCHEDULER_ERROR',
    message,
    category: 'validation',
    retryable: false,
  });
}
```

Prisma connection failures, unexpected exceptions, or OOM conditions will appear as 400 validation errors to clients.

**Impact:** Retryable server errors are presented as client errors, breaking retry logic and masking infrastructure issues from monitoring.

**Fix:** Classify errors — Prisma/DB errors → 500 (retryable), validation → 400, not found → 404. At minimum, unexpected errors should return 500.

---

### H5 — Forecast `findReviewableByUser` excludes only SUSPENDED but includes GRADUATED cards

**Files:**  
- `services/scheduler-service/src/infrastructure/database/prisma-scheduler-card.repository.ts` L432–439

**Description:**

```ts
async findReviewableByUser(userId: UserId): Promise<ISchedulerCard[]> {
  const cards = await this.prisma.schedulerCard.findMany({
    where: {
      userId,
      state: { not: 'SUSPENDED' as PrismaSchedulerCardState },
    },
    orderBy: { nextReviewDate: 'asc' },
  });
  return cards.map(toDomain);
}
```

`GRADUATED` cards are "reviewable" but should arguably not appear in the daily forecast since they've mastered the material. `NEW` cards (never reviewed, `interval = 0`) will also inflate the forecast's day-0 count with every unstarted card.

**Impact:** Forecast overstates workload by including graduated cards and all unstarted new cards.

**Fix:** Filter to `state: { in: ['LEARNING', 'REVIEW', 'RELEARNING'] }` or at least exclude `NEW` and `GRADUATED`.

---

### H6 — No validation that `userId` in query params matches authenticated user on GET list endpoints

**Files:**  
- [scheduler.routes.ts](services/scheduler-service/src/api/rest/scheduler.routes.ts#L356) — `listCardsHandler`
- [scheduler.routes.ts](services/scheduler-service/src/api/rest/scheduler.routes.ts#L412) — `listReviewsHandler`
- [scheduler.routes.ts](services/scheduler-service/src/api/rest/scheduler.routes.ts#L473) — `reviewStatsHandler`

**Description:**  
POST endpoints validate `data.userId !== ctx.userId`. But the GET card list, review list, and review stats handlers take `userId` from the **query string** without comparing it to `request.user?.sub`. A user could query another user's scheduling data.

The single-card GET handler correctly uses `request.user?.sub`, but the list endpoints use the query param directly.

**Impact:** Authorization bypass — any authenticated user can read any other user's scheduler cards, reviews, and stats by supplying a different `userId` query parameter.

**Fix:** Add `if (userId !== request.user?.sub) { reply 403 }` guard (or use a middleware that enforces `userId === authenticatedUser`), consistent with the POST endpoints.

---

## MEDIUM

### M1 — `content-seeded` consumer requires `lane` in the event payload but defaults are better

**Files:**  
- `services/scheduler-service/src/events/consumers/content-seeded.consumer.ts` L89–94

**Description:**  
The consumer calls `readLane(parsed.data.lane)` and skips the entire event if lane is null. Unlike `card-lifecycle.consumer.ts` which uses a `RemediationCardType`-based heuristic to assign lane, `content-seeded` requires the lane to be explicitly provided in the event payload. Many content-seeding flows may not include lane.

**Fix:** Use the same `assignLane(cardType)` heuristic from `card-lifecycle.consumer.ts`, or default to `'retention'` when lane is missing.

---

### M2 — SM2 algorithm type accepted in types/schemas but has no implementation or scheduling logic

**Files:**  
- `services/scheduler-service/src/types/scheduler.types.ts` L84, L96, L241, L258, L318, L353 — `'sm2'` in all unions
- `services/scheduler-service/src/domain/scheduler-service/scheduler.service.ts` L930 — `deriveIntervalDays` has a trivial branch

**Description:**  
SM2 is referenced throughout the type system and schemas. `deriveIntervalDays` has a single line: `return Math.max(1, Math.round(stability ?? 2))`. No actual SM2 algorithm (2.5 EF-based) is implemented. `computeRecallProbability` returns `null` for SM2 cards.

**Impact:** SM2 cards get a rough interval estimate but no real scheduling intelligence, no recall probability, and no state updates during review.

---

### M3 — `persistDecision` creates new cards in `'review'` state, skipping `'new'` → `'learning'` transition

**Files:**  
- `services/scheduler-service/src/domain/scheduler-service/scheduler.service.ts` L1103–1122

**Description:**  
When `persistDecision` creates a new SchedulerCard (no existing record), it sets `state: 'review'` immediately:

```ts
await this.repositories.schedulerCardRepository.create({
  ...
  state: 'review',
  ...
});
```

This violates the state machine's contract — new cards should start in `'new'` state.

**Impact:** Cards created through the commit flow bypass the learning phase entirely, inflating stability estimates.

---

### M4 — `deriveAverageSecondsPerCard` in SchedulerReadService uses `responseTimeMs` but the DB stores it as `Float`

**Files:**  
- `services/scheduler-service/src/domain/scheduler-service/scheduler-read.service.ts` L376–385
- `services/scheduler-service/prisma/schema.prisma` L89 — `responseTime Float?` (no unit documented)

**Description:**  
`deriveAverageSecondsPerCard` divides `averageResponseTimeMs` by 1000 to get seconds. But both the domain type `IReview.responseTime` and Prisma `Review.responseTime` are `Float?` with no unit enforcement. The `review-recorded.consumer.ts` stores `responseTimeMs` directly:

```ts
responseTime: parsed.data.responseTimeMs ?? null,
```

If the upstream value is already in milliseconds, the math is correct. But the field name in the schema (`responseTime`, not `responseTimeMs`) doesn't clarify units. This is a latent ambiguity that could cause a 1000x error if any producer sends seconds.

---

### M5 — Optimistic locking in `update()` has TOCTOU race condition

**Files:**  
- `services/scheduler-service/src/infrastructure/database/prisma-scheduler-card.repository.ts` L282–310

**Description:**  
The update method performs a `findUnique` → check version → `update` in two separate queries:

```ts
const existing = await this.prisma.schedulerCard.findUnique({ ... });
if (existing.version !== expectedVersion) { throw ... }
const updated = await this.prisma.schedulerCard.update({ ... });
```

Between the find and the update, another process could increment the version. The proper fix is an atomic `WHERE id = ? AND version = ?` update.

**Impact:** Under concurrent writes, two updates can both pass the version check and both succeed, silently losing one update.

**Fix:** Use `prisma.schedulerCard.updateMany({ where: { id, version: expectedVersion }, data: {...} })` and check `count === 0` to detect conflicts atomically.

---

### M6 — Forecast consumed-card model uses `dayEnd` as the projected "reviewed at" time, causing cards to bunch

**Files:**  
- `services/scheduler-service/src/domain/scheduler-service/scheduler-read.service.ts` L235

**Description:**  
After "consuming" a card, the next due date is computed from `dayEnd`:

```ts
const nextDue = new Date(dayEnd.getTime() + entry.interval * 86_400_000);
```

Using `dayEnd` (23:59:59.999 of the day) means all consumed cards project their next review to `dayEnd + interval`, which clusters future reviews at the very end of future days. Using the card's actual due time or mid-day would distribute reviews more evenly.

---

### M7 — `card.state.changed` consumer resets unsuspended cards to `'new'` instead of preserving prior state

**Files:**  
- `services/scheduler-service/src/events/consumers/card-lifecycle.consumer.ts` L289–293

**Description:**  
When content state changes to `'active'` and the scheduler card is `'suspended'`:

```ts
stateUpdate['state'] = 'new';
stateUpdate['suspendedUntil'] = null;
stateUpdate['suspendedReason'] = null;
```

This resets the card to `'new'` regardless of what state it was in before suspension. The state machine supports `previousState` for proper unsuspend, but the consumer doesn't track or use it. A card that was in `'review'` gets reset to `'new'`, losing all scheduling progress.

---

## LOW

### L1 — `ratingValue` defaults to 3 ("good") when missing from the event payload

**Files:**  
- `services/scheduler-service/src/events/consumers/review-recorded.consumer.ts` L167

**Description:**  
`ratingValue: parsed.data.ratingValue ?? 3` — if the event payload lacks `ratingValue`, it defaults to 3 regardless of the actual `rating`. A rating of `'again'` should have `ratingValue: 1`, not 3.

**Fix:** Derive `ratingValue` from the `rating` string: `{ again: 1, hard: 2, good: 3, easy: 4 }[rating]`.

---

### L2 — `outcome` defaults to `'correct'` when missing, which is misleading for `'again'` ratings

**Files:**  
- `services/scheduler-service/src/events/consumers/review-recorded.consumer.ts` L168

**Description:**  
`outcome: parsed.data.outcome ?? 'correct'` — if the event omits `outcome`, every review is recorded as "correct" even for `again` (failure) ratings. This corrupts the `outcomeDistribution` stats.

---

### L3 — `calibrationDelta` and `hintDepthReached` in `IReviewResponse` type are never populated

**Files:**  
- `services/scheduler-service/src/types/scheduler.types.ts` L385–386

**Description:**  
The `IReviewResponse` type includes `calibrationDelta: number | null` and `hintDepthReached: number | null`, matching the Phase 3 spec. However, the `IReview` domain type (what the repository returns) only has `confidenceBefore`, `confidenceAfter`, and `hintRequestCount`. No mapping computes `calibrationDelta` (should be `confidenceAfter - confidenceBefore`) or converts `hintRequestCount` to `hintDepthReached`. The list endpoint returns `IReview[]` directly, not `IReviewResponse[]`.

---

### L4 — `deleteByUser` in UserDeletedConsumer deletes reviews before cards, risking FK violation

**Files:**  
- `services/scheduler-service/src/events/consumers/user-deleted.consumer.ts` L152–155

**Description:**  
The GDPR erasure calls:
```ts
const deletedCardCount = await this.dependencies.schedulerCardRepository.deleteByUser(userId);
const deletedReviewCount = await this.dependencies.reviewRepository.deleteByUser(userId);
```

`SchedulerCard` is the parent; `Review` references it via FK. Deleting cards first will cascade-fail if FK constraints are enforced (Prisma `onDelete` is not set, so it defaults to `Restrict`). Order should be: reviews → calibration → cards.

---

### L5 — No rate limiting on the forecast endpoint

**Files:**  
- `services/scheduler-service/src/api/rest/scheduler.routes.ts` L499–527

**Description:**  
`POST /v1/scheduler/forecast` with `days=90` fetches **all** reviewable cards for a user, then iterates days × cards. For users with thousands of cards, this is O(90 × N) computation. No rate limiting prevents abuse.

---

### L6 — `SchedulerReadService.toCardResponse` maps `difficultyParameter` to response field `difficulty`

**Files:**  
- `services/scheduler-service/src/domain/scheduler-service/scheduler-read.service.ts` L305–307

**Description:**  
The Prisma schema has two fields: `difficultyParameter Float?` (FSRS difficulty 1–10) and `difficulty String?` (content-level difficulty label). The `toCardResponse` maps `card.difficultyParameter` to `response.difficulty`, but the Phase 3 spec defines `difficulty` as "how hard the card is for this user (0–1)". The FSRS range is [1–10], not [0–1]. This is either a naming issue or a missing normalization.

---

### L7 — Agent tool schemas define `algorithm` enum without `'leitner'` inconsistently with write schemas

**Files:**  
- `services/scheduler-service/src/agents/tools/scheduler.tools.ts` L349, L581 — `enum: ['fsrs', 'hlr', 'sm2']`
- `services/scheduler-service/src/domain/scheduler-service/scheduler.schemas.ts` L20 — includes `'leitner'`

**Description:**  
The write-path Zod schema accepts `'leitner'`, but the agent tool JSON Schema definitions don't include it. This inconsistency means agent-driven workflows can't specify Leitner even if it were implemented.

---

## Summary

| Severity | Count | Resolved | Key Themes |
|----------|-------|----------|-----------|
| CRITICAL | 3 | 1 | Dead graduation state machine path, ~~wrong retention formula~~ (RESOLVED), event data loss |
| HIGH     | 6 | 0 | Missing Leitner impl, wrong HTTP codes, SQL enum mismatch, error classification, forecast accuracy, auth bypass on GET lists |
| MEDIUM   | 7 | 0 | State bypass, TOCTOU race, unit ambiguity, consumed-card model, unsuspend logic |
| LOW      | 7 | 0 | Default value bugs, FK ordering, missing field mapping, rate limiting |
