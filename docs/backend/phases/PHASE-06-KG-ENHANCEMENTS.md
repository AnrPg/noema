# Phase 6 — Knowledge Graph & Scheduling Schema Enhancements

> **Codename:** `Wernicke's Area` **Depends on:** Phase 0 (API Gateway — for
> unified routing), Phase 1 (Auth — for scope checks) **Unlocks:** Frontend
> Phase 8 (Misconception Center), Frontend Phase 9 (Schedule Intelligence —
> algorithm labels), Frontend Phase 11 (Admin — CKG Mutation Pipeline)
> **Estimated effort:** 2–3 days

---

## Why This Exists

Wernicke's Area is the brain region responsible for language comprehension —
taking raw signals and extracting meaning from them. This phase is about
enriching existing data models so they carry richer semantic meaning.

Three isolated but related deficiencies need fixing:

### 1. Misconception Detection Lacks Severity and Family

The knowledge-graph-service's `POST /v1/knowledge-graph/misconceptions/detect`
endpoint returns detected misconceptions, but each result is a flat object
without:

- **Severity** — How harmful is this misconception? A minor confusion about
  terminology is different from a fundamental misunderstanding that will corrupt
  all downstream learning. The frontend's Misconception Center (Phase 8) needs
  to color-code and priority-sort misconceptions.

- **Family** — Misconceptions cluster into families (e.g., "confusion between
  correlation and causation" encompasses many specific instances). The
  Misconception Center needs to group related misconceptions for coherent
  remediation.

Without these fields, the Misconception Center can only show a flat,
unstructured list — which is exactly the kind of information overload that
Noema's design philosophy rejects.

### 2. CKG Mutation Pipeline Missing "Request Revision"

The Collaborative Knowledge Graph allows users to propose mutations to shared
knowledge. The knowledge-graph-service has endpoints for creating mutations
(`POST /v1/ckg/mutations`) and approving/rejecting them
(`POST /v1/ckg/mutations/:id/approve`, `POST /v1/ckg/mutations/:id/reject`). But
there's no "request revision" action.

In any review workflow, the three basic actions are: approve, reject, and
**request changes**. Without "request revision," a reviewer who finds a
partially-good mutation must either:

- Approve something that's not ready (lowering quality)
- Reject and hope the submitter re-submits (destroying context)

Neither is acceptable. "Request revision" preserves the mutation, adds reviewer
feedback, and returns it to the submitter for rework.

### 3. LEITNER Not in Scheduler Schema

The scheduler's Zod schema for `schedulingAlgorithm` accepts `fsrs` and `hlr`
(and possibly `sm2`), but the Leitner box system is sometimes referenced in the
broader codebase (card types, session configs, agent hints). If any card or
session configuration specifies `leitner` as an algorithm, the scheduler rejects
it at validation.

The Leitner system won't have a full implementation in the scheduler (it's
handled differently — more as a card-organization metaphor than a scheduling
algorithm), but the schema should accept it to prevent validation failures. This
is a tiny change with outsized impact on forward compatibility.

---

## Tasks

### T6.1 — Add Severity and Family to Misconception Detection

**Enhancement to:** `POST /v1/knowledge-graph/misconceptions/detect`

**Current response shape per misconception:**

```
{
  "misconceptionId": "uuid",
  "description": "Confusing osmosis with diffusion",
  "confidence": 0.85,
  "relatedConcepts": ["osmosis", "diffusion"]
}
```

**Enhanced response shape:**

```
{
  "misconceptionId": "uuid",
  "description": "Confusing osmosis with diffusion",
  "confidence": 0.85,
  "relatedConcepts": ["osmosis", "diffusion"],
  "severity": "moderate",
  "severityScore": 0.6,
  "family": "process-confusion",
  "familyLabel": "Process Confusion",
  "familyDescription": "Misconceptions arising from confusing similar biological processes"
}
```

**Severity levels and their meaning:**

| Level      | Score range | Visual indicator | Description                                                                                  |
| ---------- | ----------- | ---------------- | -------------------------------------------------------------------------------------------- |
| `trivial`  | 0.0–0.2     | Gray             | Minor terminological confusion; self-corrects with exposure                                  |
| `mild`     | 0.2–0.4     | Blue             | Partial understanding; correct concept but wrong nuance                                      |
| `moderate` | 0.4–0.6     | Yellow           | Significant gap; will cause errors on related material                                       |
| `severe`   | 0.6–0.8     | Orange           | Fundamental misunderstanding; blocks learning in this topic                                  |
| `critical` | 0.8–1.0     | Red              | Deeply entrenched; requires targeted intervention and will propagate to neighboring concepts |

**How severity is determined:**

Severity is a function of:

1. **Centrality of the concept** — misconceptions about foundational concepts
   are more severe than misconceptions about peripheral details. The knowledge
   graph's node centrality metrics can inform this.
2. **Number of dependent concepts** — if the misconceived concept is a
   prerequisite for many other concepts (high out-degree in the prerequisite
   graph), the severity is higher.
3. **Persistence** — if the misconception has been detected multiple times
   across different sessions, it's more severe (entrenched).
4. **Confidence of detection** — higher confidence in the detection correlates
   with higher severity (the misconception is clear and unambiguous).

For the initial implementation, severity can be computed as:

```
severityScore = (conceptCentrality * 0.3) + (dependentCount / maxDependents * 0.3)
                + (detectionCount / 5 * 0.2) + (confidence * 0.2)
```

Cap at 1.0 and map to the level labels above.

**Misconception families:**

Families are pre-defined categories that group misconceptions by their cognitive
origin. Suggested initial families:

| Family key              | Label                 | Description                                                 |
| ----------------------- | --------------------- | ----------------------------------------------------------- |
| `process-confusion`     | Process Confusion     | Mixing up similar processes or procedures                   |
| `cause-effect-reversal` | Cause-Effect Reversal | Swapping cause and effect                                   |
| `overgeneralization`    | Overgeneralization    | Applying a rule too broadly                                 |
| `undergeneralization`   | Undergeneralization   | Failing to apply a rule where it applies                    |
| `false-analogy`         | False Analogy         | Incorrect mapping between domains                           |
| `threshold-error`       | Threshold Error       | Misunderstanding when/where a rule starts or stops applying |
| `vocabulary-conflation` | Vocabulary Conflation | Using two terms interchangeably when they differ            |
| `scale-confusion`       | Scale Confusion       | Confusing micro/macro, local/global, or magnitudes          |
| `temporal-ordering`     | Temporal Ordering     | Getting the sequence of events/steps wrong                  |
| `null-model`            | Missing Mental Model  | No existing model — the misconception fills a vacuum        |

Family assignment can be rule-based (keyword matching in the misconception
description), graph-based (the relationship type between confused concepts), or
ML-based (LLM classification). Start with rule-based for reliability; add ML
classification as a future enhancement.

**Storage:** Families should be stored in a `MisconceptionFamily` lookup table
(or a JSON config file) so they can be extended without code changes. The
detection endpoint joins against this table to return the family details.

### T6.2 — CKG "Request Revision" Endpoint

**New endpoint:**

| Method | Path                                     | Auth                      | Description                                               |
| ------ | ---------------------------------------- | ------------------------- | --------------------------------------------------------- |
| `POST` | `/v1/ckg/mutations/:id/request-revision` | Bearer JWT + `ckg:review` | Return a mutation to the submitter with reviewer feedback |

**Request body:**

- `feedback` (required) — free-text explanation of what needs to change
- `suggestedChanges` (optional) — structured object mirroring the mutation's
  `proposedChanges` field, showing what the reviewer suggests

**Behavior:**

1. Validate that the mutation exists and is in `PENDING` state
2. Validate that the requester is not the original submitter (reviewers can't
   review their own mutations)
3. Set mutation status to `REVISION_REQUESTED`
4. Create a `MutationReview` record:
   - `mutationId`
   - `reviewerId`
   - `action`: `REVISION_REQUESTED`
   - `feedback`
   - `suggestedChanges`
   - `createdAt`
5. Emit a `CKGMutationRevisionRequested` event (for notification-service to
   notify the submitter)

**New mutation status:** The mutation status enum currently has: `PENDING`,
`APPROVED`, `REJECTED`. Add `REVISION_REQUESTED`.

**Resubmission flow:** After receiving a revision request, the submitter can
update the mutation via `PATCH /v1/ckg/mutations/:id`. The update should:

- Only be allowed when status is `REVISION_REQUESTED`
- Reset status back to `PENDING`
- Preserve the review history (the original `MutationReview` records remain)
- Increment a `revisionCount` field on the mutation

**Why this preserves context:** Unlike reject-and-resubmit, revision-request
keeps the original mutation ID, its discussion thread, and the full
review/revision history. This is essential for:

- Audit trails (who said what, when)
- Reviewer efficiency (they see the delta, not a new submission)
- Contributor morale (their work isn't discarded, just refined)

### T6.3 — Add LEITNER to Scheduler Algorithm Schema

**Current Zod schema** (approximate):

```
const schedulingAlgorithmSchema = z.enum(['fsrs', 'hlr', 'sm2']);
```

**Change to:**

```
const schedulingAlgorithmSchema = z.enum(['fsrs', 'hlr', 'sm2', 'leitner']);
```

**Why this is needed:** Several areas of the system reference scheduling
algorithms generically — the `cognitivePolicy` in user settings, the session
config, agent hints. If any of these pass `leitner` to the scheduler's
validation layer, it gets rejected with a Zod error. The scheduler doesn't need
to implement Leitner scheduling logic — it just needs to accept `leitner` as a
valid value and treat it as an alias for the appropriate behavior (which in
practice means using FSRS with box-style organization, or simply passing through
without scheduling).

**Impact radius:** Tiny. One line in one schema file. But it unblocks any
frontend or agent code that references a Leitner-organized deck.

**Additional type changes:**

- Update `packages/types` shared type definitions to include `leitner` in any
  `SchedulingAlgorithm` union type
- Update `packages/contracts` if there's an OpenAPI spec referencing the
  algorithm enum

### T6.4 — Misconception Persistence Model Enhancement

The misconception detection endpoint currently returns real-time analysis but
doesn't persist detected misconceptions in a queryable way. For the
Misconception Center to show historical misconceptions, their status (active,
resolved, recurring), and remediation progress, the knowledge-graph-service
needs a storage model.

**New model:** `DetectedMisconception`

| Column              | Type     | Description                                         |
| ------------------- | -------- | --------------------------------------------------- |
| `id`                | UUID     | Primary key                                         |
| `userId`            | UUID     | The user who holds this misconception               |
| `misconceptionId`   | UUID     | Reference to the misconception pattern              |
| `description`       | String   | Human-readable description                          |
| `severity`          | Enum     | `TRIVIAL`, `MILD`, `MODERATE`, `SEVERE`, `CRITICAL` |
| `severityScore`     | Float    | 0.0–1.0                                             |
| `family`            | String   | Family key (e.g., `process-confusion`)              |
| `confidence`        | Float    | Detection confidence                                |
| `status`            | Enum     | `ACTIVE`, `RESOLVING`, `RESOLVED`, `RECURRING`      |
| `detectionCount`    | Integer  | How many times this misconception has been detected |
| `firstDetectedAt`   | DateTime | First occurrence                                    |
| `lastDetectedAt`    | DateTime | Most recent occurrence                              |
| `resolvedAt`        | DateTime | When it was marked as resolved (nullable)           |
| `relatedConceptIds` | UUID[]   | Knowledge graph node IDs of related concepts        |
| `relatedCardIds`    | UUID[]   | Cards where this misconception manifests            |
| `createdAt`         | DateTime | Record creation                                     |
| `updatedAt`         | DateTime | Last update                                         |

**Lifecycle:**

1. Detection → create or update `DetectedMisconception` (increment
   `detectionCount`, update `lastDetectedAt`, raise severity if recurring)
2. Remediation → user reviews targeted cards successfully → status changes to
   `RESOLVING`
3. Sustained success → after N consecutive correct reviews on related cards →
   status changes to `RESOLVED`
4. Relapse → if detected again after resolution → status changes to `RECURRING`
   (more aggressive remediation needed)

**New read endpoints:**

| Method | Path                                     | Auth       | Description                             |
| ------ | ---------------------------------------- | ---------- | --------------------------------------- |
| `GET`  | `/v1/knowledge-graph/misconceptions`     | Bearer JWT | List user's detected misconceptions     |
| `GET`  | `/v1/knowledge-graph/misconceptions/:id` | Bearer JWT | Get details of a specific misconception |

Query parameters for the list:

- `status` — filter by status
- `severity` — filter by severity level
- `family` — filter by family key
- `sortBy` — `severityScore`, `detectionCount`, `lastDetectedAt`
- `sortOrder` — `asc` or `desc`
- `limit`, `offset`

---

## Acceptance Criteria

- [ ] Misconception detection response includes `severity`, `severityScore`,
      `family`, `familyLabel`, and `familyDescription` per misconception
- [ ] Severity is computed from concept centrality, dependent count,
      persistence, and detection confidence
- [ ] At least 10 misconception families are defined and documented
- [ ] `POST /v1/ckg/mutations/:id/request-revision` transitions mutation to
      `REVISION_REQUESTED` with reviewer feedback
- [ ] Mutation can be updated (resubmitted) only when in `REVISION_REQUESTED`
      state; update resets to `PENDING`
- [ ] Review history is preserved across revision cycles
- [ ] `CKGMutationRevisionRequested` event is emitted
- [ ] Scheduler Zod schema accepts `leitner` as a valid algorithm value
- [ ] Shared type packages updated to include `leitner` in algorithm unions
- [ ] `DetectedMisconception` model persists misconceptions with status
      lifecycle (ACTIVE → RESOLVING → RESOLVED, or → RECURRING)
- [ ] `GET /misconceptions` and `GET /misconceptions/:id` endpoints return
      persisted misconception data with filtering and sorting
- [ ] All new endpoints validated with Zod schemas

---

## Files Created / Touched

| File                                                                                                    | Action                                                                                     |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `services/knowledge-graph-service/src/api/rest/misconception.routes.ts`                                 | Extend detection response, add GET list/detail routes                                      |
| `services/knowledge-graph-service/src/domain/misconception/misconception-detection.service.ts`          | Add severity computation, family assignment                                                |
| `services/knowledge-graph-service/src/domain/misconception/misconception-family.config.ts`              | **New** — family definitions and rules                                                     |
| `services/knowledge-graph-service/src/infrastructure/repositories/detected-misconception.repository.ts` | **New** — CRUD for DetectedMisconception                                                   |
| `services/knowledge-graph-service/prisma/schema.prisma`                                                 | Add `DetectedMisconception` model, `MisconceptionSeverity` and `MisconceptionStatus` enums |
| `services/knowledge-graph-service/src/api/rest/ckg.routes.ts`                                           | Add request-revision route                                                                 |
| `services/knowledge-graph-service/src/domain/ckg/ckg-mutation.service.ts`                               | Add revision request logic, resubmission flow                                              |
| `services/knowledge-graph-service/prisma/schema.prisma`                                                 | Add `REVISION_REQUESTED` to mutation status enum, `revisionCount` field                    |
| `services/scheduler-service/src/api/schemas/scheduler.schemas.ts`                                       | Add `leitner` to algorithm enum                                                            |
| `packages/types/src/scheduling.ts`                                                                      | Add `leitner` to `SchedulingAlgorithm` type                                                |
| `packages/contracts/src/scheduler.ts`                                                                   | Update algorithm enum in contract                                                          |
