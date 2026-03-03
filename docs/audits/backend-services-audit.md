# Noema Backend Services — Exhaustive Audit Report

**Generated:** 2025-07-15 **Scope:** All 6 implemented backend services
**Status:** Every route file, Prisma schema, middleware, and cross-service call
has been read.

---

## Table of Contents

1. [User Service](#1-user-service)
2. [Content Service](#2-content-service)
3. [Scheduler Service](#3-scheduler-service)
4. [Session Service](#4-session-service)
5. [Knowledge Graph Service](#5-knowledge-graph-service)
6. [HLR Sidecar](#6-hlr-sidecar)
7. [Cross-Service Communication](#7-cross-service-communication)
8. [Admin-Scoped Endpoints](#8-admin-scoped-endpoints)
9. [Missing / Stubbed Functionality](#9-missing--stubbed-functionality)
10. [Summary Statistics](#10-summary-statistics)

---

## 1. User Service

**Path:** `services/user-service/` **Framework:** Fastify (TypeScript)
**Database:** PostgreSQL (Prisma) **Cache/Events:** Redis (ioredis)

### 1.1 Prisma Models (3 tables)

| Model          | Table            | Key Fields                                                                                                                                                                                                                                                                  |
| -------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`         | `users`          | id (UUID), username, email, passwordHash, status (PENDING/ACTIVE/SUSPENDED/BANNED/DEACTIVATED), emailVerified, roles[], authProviders[], profile (JSON), settings (JSON), lastLoginAt, loginCount, failedLoginAttempts, mfaEnabled, mfaSecret, version (optimistic locking) |
| `RefreshToken` | `refresh_tokens` | id (UUID), userId → User, token (unique), expiresAt, revokedAt, deviceId, deviceName, ipAddress                                                                                                                                                                             |
| `UserSession`  | `user_sessions`  | id (UUID), userId → User, deviceId, deviceName, ipAddress, userAgent, lastActiveAt                                                                                                                                                                                          |

### 1.2 Endpoints

#### Auth Routes

| Method | Path               | Handler                                 | Auth       | Status         |
| ------ | ------------------ | --------------------------------------- | ---------- | -------------- |
| `POST` | `/auth/register`   | Create user + optional token generation | None       | ✅ Implemented |
| `POST` | `/auth/login`      | Authenticate by identifier + password   | None       | ✅ Implemented |
| `POST` | `/auth/refresh`    | Refresh access token via refresh token  | None       | ✅ Implemented |
| `POST` | `/auth/logout`     | Logout, revoke refresh token            | Bearer JWT | ✅ Implemented |
| `POST` | `/auth/logout-all` | Logout all devices, revoke all tokens   | Bearer JWT | ✅ Implemented |

#### User Routes

| Method   | Path                  | Handler                                | Auth       | Status         |
| -------- | --------------------- | -------------------------------------- | ---------- | -------------- |
| `GET`    | `/users/:id`          | Get user by ID                         | Bearer JWT | ✅ Implemented |
| `GET`    | `/users`              | List users (admin)                     | Bearer JWT | ✅ Implemented |
| `PATCH`  | `/users/:id/profile`  | Update user profile (optimistic lock)  | Bearer JWT | ✅ Implemented |
| `PATCH`  | `/users/:id/settings` | Update user settings (optimistic lock) | Bearer JWT | ✅ Implemented |
| `POST`   | `/users/:id/password` | Change password                        | Bearer JWT | ✅ Implemented |
| `DELETE` | `/users/:id`          | Soft-delete user                       | Bearer JWT | ✅ Implemented |

#### Me Routes

| Method  | Path           | Handler                        | Auth       | Status         |
| ------- | -------------- | ------------------------------ | ---------- | -------------- |
| `GET`   | `/me`          | Get current authenticated user | Bearer JWT | ✅ Implemented |
| `PATCH` | `/me/profile`  | Update own profile             | Bearer JWT | ✅ Implemented |
| `GET`   | `/me/settings` | Get own settings               | Bearer JWT | ✅ Implemented |
| `PATCH` | `/me/settings` | Update own settings            | Bearer JWT | ✅ Implemented |

#### Health Routes

| Method | Path            | Handler                      | Auth | Status         |
| ------ | --------------- | ---------------------------- | ---- | -------------- |
| `GET`  | `/health`       | Combined health (DB + Redis) | None | ✅ Implemented |
| `GET`  | `/health/live`  | Liveness probe               | None | ✅ Implemented |
| `GET`  | `/health/ready` | Readiness probe (DB + Redis) | None | ✅ Implemented |

**Total: 18 endpoints**

### 1.3 Events Published

Via `RedisEventPublisher` from `@noema/events/publisher`:

- `UserCreated`
- `UserProfileUpdated`
- `UserSettingsUpdated`
- `UserLoggedIn`
- `UserLoggedOut`
- `UserPasswordChanged`
- `UserDeleted`

### 1.4 Cross-Service Calls

- `SessionOrchestrationService` (HTTP `fetch()`) → calls session-service to
  pause active sessions during logout.

---

## 2. Content Service

**Path:** `services/content-service/` **Framework:** Fastify (TypeScript)
**Database:** PostgreSQL (Prisma) **Cache/Events:** Redis (ioredis) **Storage:**
MinIO (S3-compatible)

### 2.1 Prisma Models (4 tables)

| Model         | Table          | Key Fields                                                                                                                                                                                                                                                                                                                     |
| ------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Card`        | `cards`        | id (UUID), userId, cardType (40+ enum: ATOMIC, CLOZE, IMAGE_OCCLUSION, AUDIO, PROCESS, COMPARISON, etc.), state (DRAFT/ACTIVE/SUSPENDED/ARCHIVED), difficulty (BEGINNER→EXPERT), content (JSON), knowledgeNodeIds[], tags[], source (USER/AGENT/SYSTEM/IMPORT), metadata (JSON), contentHash, searchVector (tsvector), version |
| `Template`    | `templates`    | id (UUID), userId, name, description, cardType, content (JSON), difficulty, knowledgeNodeIds[], tags[], metadata, visibility (PRIVATE/PUBLIC/SHARED), usageCount, version                                                                                                                                                      |
| `MediaFile`   | `media_files`  | id (UUID), userId, filename, originalFilename, mimeType, sizeBytes, bucket, objectKey, alt, metadata (JSON)                                                                                                                                                                                                                    |
| `CardHistory` | `card_history` | id (UUID), cardId → Card, userId, version, snapshot (JSON), changeType, changedBy                                                                                                                                                                                                                                              |

### 2.2 Endpoints

#### Card CRUD Routes

| Method   | Path                             | Handler                               | Auth                             | Status         |
| -------- | -------------------------------- | ------------------------------------- | -------------------------------- | -------------- |
| `POST`   | `/v1/cards`                      | Create card                           | Bearer JWT, rate-limited (write) | ✅ Implemented |
| `POST`   | `/v1/cards/batch`                | Batch create (≤100 cards, 5 MB limit) | Bearer JWT                       | ✅ Implemented |
| `GET`    | `/v1/cards/stats`                | Aggregate card statistics             | Bearer JWT                       | ✅ Implemented |
| `GET`    | `/v1/cards/:id`                  | Get card by ID                        | Bearer JWT                       | ✅ Implemented |
| `POST`   | `/v1/cards/query`                | DeckQuery (offset pagination)         | Bearer JWT                       | ✅ Implemented |
| `GET`    | `/v1/cards/cursor`               | Cursor-based pagination               | Bearer JWT                       | ✅ Implemented |
| `POST`   | `/v1/cards/session-seed`         | Build session seed from DeckQuery     | Bearer JWT                       | ✅ Implemented |
| `PATCH`  | `/v1/cards/:id`                  | Update card                           | Bearer JWT                       | ✅ Implemented |
| `PATCH`  | `/v1/cards/:id/state`            | Change card state                     | Bearer JWT                       | ✅ Implemented |
| `PATCH`  | `/v1/cards/:id/tags`             | Update tags                           | Bearer JWT                       | ✅ Implemented |
| `PATCH`  | `/v1/cards/:id/node-links`       | Update knowledge-node links           | Bearer JWT                       | ✅ Implemented |
| `POST`   | `/v1/cards/count`                | Count matching cards                  | Bearer JWT                       | ✅ Implemented |
| `POST`   | `/v1/cards/validate`             | Validate card content                 | Bearer JWT                       | ✅ Implemented |
| `POST`   | `/v1/cards/batch/state`          | Batch state transition                | Bearer JWT                       | ✅ Implemented |
| `DELETE` | `/v1/cards/:id`                  | Delete card (soft/hard)               | Bearer JWT                       | ✅ Implemented |
| `POST`   | `/v1/cards/:id/restore`          | Restore soft-deleted card             | Bearer JWT                       | ✅ Implemented |
| `GET`    | `/v1/cards/:id/history`          | Version history                       | Bearer JWT                       | ✅ Implemented |
| `GET`    | `/v1/cards/:id/history/:version` | Specific version snapshot             | Bearer JWT                       | ✅ Implemented |
| `GET`    | `/v1/cards/batch/:batchId`       | Find cards by batch ID                | Bearer JWT                       | ✅ Implemented |
| `DELETE` | `/v1/cards/batch/:batchId`       | Rollback batch                        | Bearer JWT                       | ✅ Implemented |

#### Media Routes

| Method   | Path                         | Handler                    | Auth       | Status         |
| -------- | ---------------------------- | -------------------------- | ---------- | -------------- |
| `POST`   | `/v1/media/upload-url`       | Get presigned upload URL   | Bearer JWT | ✅ Implemented |
| `POST`   | `/v1/media/:id/confirm`      | Confirm upload completion  | Bearer JWT | ✅ Implemented |
| `GET`    | `/v1/media/:id`              | Get media metadata         | Bearer JWT | ✅ Implemented |
| `GET`    | `/v1/media/:id/download-url` | Get presigned download URL | Bearer JWT | ✅ Implemented |
| `GET`    | `/v1/media`                  | List user media            | Bearer JWT | ✅ Implemented |
| `DELETE` | `/v1/media/:id`              | Delete media file          | Bearer JWT | ✅ Implemented |

#### Template Routes

| Method   | Path                            | Handler                         | Auth       | Status         |
| -------- | ------------------------------- | ------------------------------- | ---------- | -------------- |
| `POST`   | `/v1/templates`                 | Create template                 | Bearer JWT | ✅ Implemented |
| `GET`    | `/v1/templates/:id`             | Get template                    | Bearer JWT | ✅ Implemented |
| `POST`   | `/v1/templates/query`           | Query templates                 | Bearer JWT | ✅ Implemented |
| `PATCH`  | `/v1/templates/:id`             | Update template                 | Bearer JWT | ✅ Implemented |
| `DELETE` | `/v1/templates/:id`             | Delete template                 | Bearer JWT | ✅ Implemented |
| `POST`   | `/v1/templates/:id/instantiate` | Create card input from template | Bearer JWT | ✅ Implemented |

#### Health Routes

| Method | Path            | Handler                              | Auth | Status         |
| ------ | --------------- | ------------------------------------ | ---- | -------------- |
| `GET`  | `/health`       | Combined health (DB + Redis + MinIO) | None | ✅ Implemented |
| `GET`  | `/health/live`  | Liveness probe                       | None | ✅ Implemented |
| `GET`  | `/health/ready` | Readiness probe (DB + Redis + MinIO) | None | ✅ Implemented |

**Total: 35 endpoints**

### 2.3 Events Published

Via `RedisEventPublisher`:

- `CardCreated`
- `CardUpdated`
- `CardDeleted`
- `CardStateChanged`
- `CardTagsUpdated`
- `CardNodesUpdated`
- `BatchCreated`

---

## 3. Scheduler Service

**Path:** `services/scheduler-service/` **Framework:** Fastify (TypeScript)
**Database:** PostgreSQL (Prisma) **Cache/Events:** Redis (ioredis) **Auth
Model:** Scope-based (`requireScopes()`)

### 3.1 Prisma Models (8 tables)

| Model                     | Table                       | Key Fields                                                                                                                                                                                                                                                                                    |
| ------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SchedulerCard`           | `scheduler_cards`           | id (UUID), cardId, userId, lane (RETENTION/CALIBRATION), FSRS params (stability, difficultyParameter), HLR params (halfLife), interval, nextReviewDate, reviewCount, lapseCount, consecutiveCorrect, schedulingAlgorithm, state (NEW/LEARNING/REVIEW/RELEARNING/SUSPENDED/GRADUATED), version |
| `Review`                  | `reviews`                   | id (UUID), cardId, userId, sessionId, attemptId, rating (AGAIN/HARD/GOOD/EASY), ratingValue, outcome, deltaDays, responseTime, reviewedAt, priorState (JSON), newState (JSON), algorithm, lane, metacognitive signals                                                                         |
| `CalibrationData`         | `calibration_data`          | id (UUID), userId, cardId (optional), cardType, parameters (JSON), sampleCount, confidenceScore, lastTrainedAt                                                                                                                                                                                |
| `ScheduleProposal`        | `schedule_proposals`        | decisionId, userId, policyVersion, correlationId, sessionId, sessionRevision, kind, payload (JSON)                                                                                                                                                                                            |
| `ScheduleCommit`          | `schedule_commits`          | proposalId, decisionId, userId, policyVersion, accepted/rejected counts, payload (JSON)                                                                                                                                                                                                       |
| `ScheduleCohortLineage`   | `schedule_cohort_lineage`   | userId, proposalId, decisionId, sessionId, selectedCardIds[], excludedCardIds[], metadata (JSON)                                                                                                                                                                                              |
| `SchedulerEventInbox`     | `scheduler_event_inbox`     | Idempotent event processing inbox                                                                                                                                                                                                                                                             |
| `SchedulerHandshakeState` | `scheduler_handshake_state` | Proposal handshake FSM tracking                                                                                                                                                                                                                                                               |

### 3.2 Endpoints

| Method | Path                                           | Handler                           | Auth       | Scopes                                | Status         |
| ------ | ---------------------------------------------- | --------------------------------- | ---------- | ------------------------------------- | -------------- |
| `POST` | `/v1/scheduler/dual-lane/plan`                 | Plan dual-lane queue (FSRS + HLR) | Bearer JWT | `scheduler:plan` OR `scheduler:write` | ✅ Implemented |
| `POST` | `/v1/schedule/dual-lane-plan`                  | _Alias for above_                 | Bearer JWT | `scheduler:plan` OR `scheduler:write` | ✅ Implemented |
| `POST` | `/v1/scheduler/proposals/review-windows`       | Propose review windows            | Bearer JWT | `scheduler:plan`                      | ✅ Implemented |
| `POST` | `/v1/scheduler/proposals/session-candidates`   | Propose session candidates        | Bearer JWT | `scheduler:plan`                      | ✅ Implemented |
| `POST` | `/v1/scheduler/simulations/session-candidates` | Simulate session candidates       | Bearer JWT | `scheduler:plan`                      | ✅ Implemented |
| `POST` | `/v1/scheduler/commits/cards/:cardId/schedule` | Commit single card schedule       | Bearer JWT | `scheduler:write`                     | ✅ Implemented |
| `POST` | `/v1/scheduler/commits/cards/schedule/batch`   | Commit batch card schedules       | Bearer JWT | `scheduler:write`                     | ✅ Implemented |

#### Health Routes

| Method | Path            | Handler         | Auth | Status         |
| ------ | --------------- | --------------- | ---- | -------------- |
| `GET`  | `/health`       | Combined health | None | ✅ Implemented |
| `GET`  | `/health/live`  | Liveness probe  | None | ✅ Implemented |
| `GET`  | `/health/ready` | Readiness probe | None | ✅ Implemented |

**Total: 10 endpoints (including alias)**

### 3.3 Auth Model

Scope-based authorization via `requireScopes()` middleware:

- Reads `scopes` (array) or `scope` (space-delimited string) from JWT payload.
- Plan endpoints require `scheduler:plan`.
- Write/commit endpoints require `scheduler:write`.
- Dual-lane plan accepts either scope.

### 3.4 Events

- Publishes via `RedisEventPublisher`.
- Consumes events idempotently via `SchedulerEventInbox`.

---

## 4. Session Service

**Path:** `services/session-service/` **Framework:** Fastify (TypeScript)
**Database:** PostgreSQL (Prisma) **Cache/Events:** Redis (ioredis)

### 4.1 Prisma Models (6 tables)

| Model                           | Table                               | Key Fields                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Session`                       | `sessions`                          | id (UUID), userId, deckQueryId, state (ACTIVE/PAUSED/COMPLETED/ABANDONED/EXPIRED), learningMode (EXPLORATION/GOAL_DRIVEN/EXAM_ORIENTED/SYNTHESIS), teachingApproach, schedulingAlgorithm, loadout fields, config (JSON), stats (JSON), pauseReason, pausedAt, lifecycle timestamps, version                                                                              |
| `Attempt`                       | `attempts`                          | id (UUID), sessionId → Session, cardId, userId, sequenceNumber, outcome (CORRECT/INCORRECT/PARTIAL/SKIPPED), rating (AGAIN/HARD/GOOD/EASY), responseTimeMs, dwellTimeMs, timeToFirstInteractionMs, confidenceBefore/After, calibrationDelta, hintRequestCount, hintDepthReached (NONE/CUE/PARTIAL/FULL_EXPLANATION), contextSnapshot (JSON), priorSchedulingState (JSON) |
| `SessionQueueItem`              | `session_queue_items`               | id (UUID), sessionId → Session, cardId, position, status (PENDING/PRESENTED/COMPLETED/SKIPPED/INJECTED), injection metadata                                                                                                                                                                                                                                              |
| `SessionCohortHandshake`        | `session_cohort_handshakes`         | id (UUID), sessionId → Session, proposalId, decisionId, revision, status (PROPOSED/ACCEPTED/REVISED/COMMITTED/CANCELLED), candidateCardIds[], acceptedCardIds[], rejectedCardIds[]                                                                                                                                                                                       |
| `EventOutbox`                   | `event_outbox`                      | Transactional outbox pattern for reliable event publishing                                                                                                                                                                                                                                                                                                               |
| `OfflineIntentTokenReplayGuard` | `offline_intent_token_replay_guard` | Single-use offline intent token protection                                                                                                                                                                                                                                                                                                                               |

### 4.2 Endpoints

#### Session Lifecycle

| Method | Path                                      | Handler                               | Auth                                       | Status         |
| ------ | ----------------------------------------- | ------------------------------------- | ------------------------------------------ | -------------- |
| `POST` | `/v1/sessions`                            | Start session                         | Bearer JWT                                 | ✅ Implemented |
| `POST` | `/v1/sessions/blueprint/validate`         | Validate agent-orchestrated blueprint | Bearer JWT                                 | ✅ Implemented |
| `GET`  | `/v1/sessions`                            | List sessions (filter + pagination)   | Bearer JWT                                 | ✅ Implemented |
| `GET`  | `/v1/sessions/:sessionId`                 | Get session                           | Bearer JWT                                 | ✅ Implemented |
| `POST` | `/v1/sessions/:sessionId/pause`           | Pause session                         | Bearer JWT                                 | ✅ Implemented |
| `POST` | `/v1/sessions/:sessionId/resume`          | Resume session                        | Bearer JWT                                 | ✅ Implemented |
| `POST` | `/v1/sessions/:sessionId/complete`        | Complete session                      | Bearer JWT                                 | ✅ Implemented |
| `POST` | `/v1/sessions/:sessionId/expire`          | Expire session (user-level)           | Bearer JWT                                 | ✅ Implemented |
| `POST` | `/v1/internal/sessions/:sessionId/expire` | **System-level expiration**           | Bearer JWT + `session:system:expire` scope | ✅ Implemented |
| `POST` | `/v1/sessions/:sessionId/abandon`         | Abandon session                       | Bearer JWT                                 | ✅ Implemented |

#### Attempts

| Method | Path                                               | Handler                                  | Auth       | Status         |
| ------ | -------------------------------------------------- | ---------------------------------------- | ---------- | -------------- |
| `POST` | `/v1/sessions/:sessionId/attempts`                 | Record attempt                           | Bearer JWT | ✅ Implemented |
| `GET`  | `/v1/sessions/:sessionId/attempts`                 | List attempts (Zod-validated pagination) | Bearer JWT | ✅ Implemented |
| `POST` | `/v1/sessions/:sessionId/attempts/:attemptId/hint` | Request hint                             | Bearer JWT | ✅ Implemented |

#### Queue

| Method | Path                                   | Handler           | Auth       | Status         |
| ------ | -------------------------------------- | ----------------- | ---------- | -------------- |
| `GET`  | `/v1/sessions/:sessionId/queue`        | Get queue         | Bearer JWT | ✅ Implemented |
| `POST` | `/v1/sessions/:sessionId/queue/inject` | Inject queue item | Bearer JWT | ✅ Implemented |
| `POST` | `/v1/sessions/:sessionId/queue/remove` | Remove queue item | Bearer JWT | ✅ Implemented |

#### Cohort Handshake

| Method | Path                                     | Handler        | Auth       | Status         |
| ------ | ---------------------------------------- | -------------- | ---------- | -------------- |
| `POST` | `/v1/sessions/:sessionId/cohort/propose` | Propose cohort | Bearer JWT | ✅ Implemented |
| `POST` | `/v1/sessions/:sessionId/cohort/accept`  | Accept cohort  | Bearer JWT | ✅ Implemented |
| `POST` | `/v1/sessions/:sessionId/cohort/revise`  | Revise cohort  | Bearer JWT | ✅ Implemented |
| `POST` | `/v1/sessions/:sessionId/cohort/commit`  | Commit cohort  | Bearer JWT | ✅ Implemented |

#### Checkpoints + Strategy

| Method | Path                                           | Handler                      | Auth       | Status         |
| ------ | ---------------------------------------------- | ---------------------------- | ---------- | -------------- |
| `POST` | `/v1/sessions/:sessionId/checkpoints/evaluate` | Evaluate adaptive checkpoint | Bearer JWT | ✅ Implemented |
| `POST` | `/v1/sessions/:sessionId/strategy`             | Update strategy mid-session  | Bearer JWT | ✅ Implemented |
| `POST` | `/v1/sessions/:sessionId/teaching`             | Change teaching approach     | Bearer JWT | ✅ Implemented |

#### Offline Intent Tokens (ADR-0023)

| Method | Path                         | Handler                           | Auth       | Status         |
| ------ | ---------------------------- | --------------------------------- | ---------- | -------------- |
| `POST` | `/v1/offline-intents`        | Issue signed offline intent token | Bearer JWT | ✅ Implemented |
| `POST` | `/v1/offline-intents/verify` | Verify offline intent token       | Bearer JWT | ✅ Implemented |

#### Health Routes

| Method | Path            | Handler                      | Auth | Status         |
| ------ | --------------- | ---------------------------- | ---- | -------------- |
| `GET`  | `/health`       | Combined health (DB + Redis) | None | ✅ Implemented |
| `GET`  | `/health/live`  | Liveness probe               | None | ✅ Implemented |
| `GET`  | `/health/ready` | Readiness probe (DB + Redis) | None | ✅ Implemented |

**Total: 28 endpoints**

---

## 5. Knowledge Graph Service

**Path:** `services/knowledge-graph-service/` **Framework:** Fastify
(TypeScript) **Databases:** PostgreSQL (Prisma) + Neo4j (graph data)
**Cache/Events:** Redis (ioredis) **Auth Models:** `assertUserAccess()` (PKG
routes), `assertAdminOrAgent()` (CKG mutations)

### 5.1 Prisma Models (9 tables — PostgreSQL only; all graph data lives in Neo4j)

| Model                      | Table                         | Key Fields                                                                                                                                                                                                                                                                              |
| -------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CkgMutation`              | `ckg_mutations`               | id (UUID), state (PROPOSED→VALIDATING→VALIDATED→PROVING→PROVEN→COMMITTING→COMMITTED or REJECTED), mutationType, operation (JSON DSL), validationResult, evidenceRefs, targetNodeIds[], targetEdgeIds[], proofResult, commitResult, rejectionReason, priority, recoveryAttempts, version |
| `CkgMutationAuditLog`      | `ckg_mutation_audit_log`      | mutationId → CkgMutation, fromState, toState, actor, reason, metadata (JSON). Append-only.                                                                                                                                                                                              |
| `StructuralMetricSnapshot` | `structural_metric_snapshots` | userId, domain, metrics (AD, DCG, SLI, SCE, ULS, TBS, SDF, SSE, SAA, SSG, BSI), raw (JSON)                                                                                                                                                                                              |
| `AggregationEvidence`      | `aggregation_evidence`        | PKG → CKG aggregation pipeline records                                                                                                                                                                                                                                                  |
| `MisconceptionPattern`     | `misconception_patterns`      | Executable detection patterns                                                                                                                                                                                                                                                           |
| `InterventionTemplate`     | `intervention_templates`      | Remediation strategies linked to misconceptions                                                                                                                                                                                                                                         |
| `MisconceptionDetection`   | `misconception_detections`    | Runtime detection instances: detected → confirmed → addressed → resolved → recurring                                                                                                                                                                                                    |
| `PkgOperationLog`          | `pkg_operation_log`           | Append-only per-user PKG mutation changelog                                                                                                                                                                                                                                             |
| `MetricsStaleness`         | `metrics_staleness`           | Tracks when user + domain metrics need recomputation                                                                                                                                                                                                                                    |

### 5.2 Endpoints

#### PKG Nodes (`/api/v1/users/:userId/pkg/nodes`)

| Method   | Path                                      | Handler                           | Auth                     | Status         |
| -------- | ----------------------------------------- | --------------------------------- | ------------------------ | -------------- |
| `POST`   | `/api/v1/users/:userId/pkg/nodes`         | Create PKG node                   | JWT + `assertUserAccess` | ✅ Implemented |
| `GET`    | `/api/v1/users/:userId/pkg/nodes`         | List PKG nodes (filter, paginate) | JWT + `assertUserAccess` | ✅ Implemented |
| `GET`    | `/api/v1/users/:userId/pkg/nodes/:nodeId` | Get node                          | JWT + `assertUserAccess` | ✅ Implemented |
| `PATCH`  | `/api/v1/users/:userId/pkg/nodes/:nodeId` | Update node                       | JWT + `assertUserAccess` | ✅ Implemented |
| `DELETE` | `/api/v1/users/:userId/pkg/nodes/:nodeId` | Soft-delete node                  | JWT + `assertUserAccess` | ✅ Implemented |

#### PKG Edges (`/api/v1/users/:userId/pkg/edges`)

| Method   | Path                                      | Handler                       | Auth                     | Status         |
| -------- | ----------------------------------------- | ----------------------------- | ------------------------ | -------------- |
| `POST`   | `/api/v1/users/:userId/pkg/edges`         | Create edge (cycle detection) | JWT + `assertUserAccess` | ✅ Implemented |
| `GET`    | `/api/v1/users/:userId/pkg/edges`         | List edges                    | JWT + `assertUserAccess` | ✅ Implemented |
| `GET`    | `/api/v1/users/:userId/pkg/edges/:edgeId` | Get edge                      | JWT + `assertUserAccess` | ✅ Implemented |
| `PATCH`  | `/api/v1/users/:userId/pkg/edges/:edgeId` | Update edge                   | JWT + `assertUserAccess` | ✅ Implemented |
| `DELETE` | `/api/v1/users/:userId/pkg/edges/:edgeId` | Delete edge                   | JWT + `assertUserAccess` | ✅ Implemented |

#### PKG Traversal (`/api/v1/users/:userId/pkg/traversal`)

| Method | Path                                       | Handler                                              | Auth                     | Status         |
| ------ | ------------------------------------------ | ---------------------------------------------------- | ------------------------ | -------------- |
| `GET`  | `.../traversal/subgraph`                   | Extract subgraph                                     | JWT + `assertUserAccess` | ✅ Implemented |
| `GET`  | `.../traversal/ancestors/:nodeId`          | Get ancestors                                        | JWT + `assertUserAccess` | ✅ Implemented |
| `GET`  | `.../traversal/descendants/:nodeId`        | Get descendants                                      | JWT + `assertUserAccess` | ✅ Implemented |
| `GET`  | `.../traversal/path`                       | Shortest path                                        | JWT + `assertUserAccess` | ✅ Implemented |
| `GET`  | `.../traversal/siblings/:nodeId`           | Co-children (siblings)                               | JWT + `assertUserAccess` | ✅ Implemented |
| `GET`  | `.../traversal/co-parents/:nodeId`         | Co-parents                                           | JWT + `assertUserAccess` | ✅ Implemented |
| `GET`  | `.../traversal/neighborhood/:nodeId`       | N-hop neighborhood                                   | JWT + `assertUserAccess` | ✅ Implemented |
| `GET`  | `.../traversal/bridges`                    | Bridge/articulation points                           | JWT + `assertUserAccess` | ✅ Implemented |
| `GET`  | `.../traversal/frontier`                   | Knowledge frontier                                   | JWT + `assertUserAccess` | ✅ Implemented |
| `GET`  | `.../traversal/common-ancestors`           | Common ancestors / LCA                               | JWT + `assertUserAccess` | ✅ Implemented |
| `GET`  | `.../traversal/prerequisite-chain/:nodeId` | Topo-sorted prerequisites                            | JWT + `assertUserAccess` | ✅ Implemented |
| `GET`  | `.../traversal/centrality`                 | Centrality ranking (degree / betweenness / PageRank) | JWT + `assertUserAccess` | ✅ Implemented |

#### CKG Nodes (`/api/v1/ckg/nodes`) — Shared canonical graph, no userId scoping

| Method | Path                        | Handler        | Auth       | Status         |
| ------ | --------------------------- | -------------- | ---------- | -------------- |
| `GET`  | `/api/v1/ckg/nodes`         | List CKG nodes | Bearer JWT | ✅ Implemented |
| `GET`  | `/api/v1/ckg/nodes/:nodeId` | Get CKG node   | Bearer JWT | ✅ Implemented |

#### CKG Edges (`/api/v1/ckg/edges`)

| Method | Path                        | Handler        | Auth       | Status         |
| ------ | --------------------------- | -------------- | ---------- | -------------- |
| `GET`  | `/api/v1/ckg/edges`         | List CKG edges | Bearer JWT | ✅ Implemented |
| `GET`  | `/api/v1/ckg/edges/:edgeId` | Get CKG edge   | Bearer JWT | ✅ Implemented |

#### CKG Traversal (`/api/v1/ckg/traversal`)

| Method | Path                                               | Handler                | Auth       | Status         |
| ------ | -------------------------------------------------- | ---------------------- | ---------- | -------------- |
| `GET`  | `/api/v1/ckg/traversal/subgraph`                   | CKG subgraph           | Bearer JWT | ✅ Implemented |
| `GET`  | `/api/v1/ckg/traversal/ancestors/:nodeId`          | CKG ancestors          | Bearer JWT | ✅ Implemented |
| `GET`  | `/api/v1/ckg/traversal/descendants/:nodeId`        | CKG descendants        | Bearer JWT | ✅ Implemented |
| `GET`  | `/api/v1/ckg/traversal/path`                       | CKG shortest path      | Bearer JWT | ✅ Implemented |
| `GET`  | `/api/v1/ckg/traversal/siblings/:nodeId`           | CKG siblings           | Bearer JWT | ✅ Implemented |
| `GET`  | `/api/v1/ckg/traversal/co-parents/:nodeId`         | CKG co-parents         | Bearer JWT | ✅ Implemented |
| `GET`  | `/api/v1/ckg/traversal/neighborhood/:nodeId`       | CKG neighborhood       | Bearer JWT | ✅ Implemented |
| `GET`  | `/api/v1/ckg/traversal/bridges`                    | CKG bridge nodes       | Bearer JWT | ✅ Implemented |
| `GET`  | `/api/v1/ckg/traversal/common-ancestors`           | CKG common ancestors   | Bearer JWT | ✅ Implemented |
| `GET`  | `/api/v1/ckg/traversal/prerequisite-chain/:nodeId` | CKG prerequisite chain | Bearer JWT | ✅ Implemented |
| `GET`  | `/api/v1/ckg/traversal/centrality`                 | CKG centrality ranking | Bearer JWT | ✅ Implemented |

#### CKG Mutations (`/api/v1/ckg/mutations`) — Admin/Agent only

| Method | Path                                          | Handler                    | Auth                       | Status         |
| ------ | --------------------------------------------- | -------------------------- | -------------------------- | -------------- |
| `POST` | `/api/v1/ckg/mutations`                       | Propose mutation           | JWT + `assertAdminOrAgent` | ✅ Implemented |
| `GET`  | `/api/v1/ckg/mutations`                       | List mutations             | Bearer JWT                 | ✅ Implemented |
| `GET`  | `/api/v1/ckg/mutations/health`                | Pipeline health dashboard  | JWT + `assertAdminOrAgent` | ✅ Implemented |
| `GET`  | `/api/v1/ckg/mutations/:mutationId`           | Get mutation               | Bearer JWT                 | ✅ Implemented |
| `GET`  | `/api/v1/ckg/mutations/:mutationId/audit-log` | Get audit log              | Bearer JWT                 | ✅ Implemented |
| `POST` | `/api/v1/ckg/mutations/:mutationId/cancel`    | Cancel mutation            | JWT + `assertAdminOrAgent` | ✅ Implemented |
| `POST` | `/api/v1/ckg/mutations/:mutationId/retry`     | Retry rejected mutation    | JWT + `assertAdminOrAgent` | ✅ Implemented |
| `POST` | `/api/v1/ckg/mutations/:mutationId/approve`   | Approve escalated mutation | JWT + `assertAdminOrAgent` | ✅ Implemented |
| `POST` | `/api/v1/ckg/mutations/:mutationId/reject`    | Reject escalated mutation  | JWT + `assertAdminOrAgent` | ✅ Implemented |

#### Metrics (`/api/v1/users/:userId/metrics`)

| Method | Path                                    | Handler                       | Auth                     | Status         |
| ------ | --------------------------------------- | ----------------------------- | ------------------------ | -------------- |
| `GET`  | `/api/v1/users/:userId/metrics`         | Get latest structural metrics | JWT + `assertUserAccess` | ✅ Implemented |
| `POST` | `/api/v1/users/:userId/metrics/compute` | Trigger recomputation         | JWT + `assertUserAccess` | ✅ Implemented |
| `GET`  | `/api/v1/users/:userId/metrics/history` | Metrics time-series history   | JWT + `assertUserAccess` | ✅ Implemented |

#### Misconceptions (`/api/v1/users/:userId/misconceptions`)

| Method  | Path                                                       | Handler               | Auth                     | Status         |
| ------- | ---------------------------------------------------------- | --------------------- | ------------------------ | -------------- |
| `GET`   | `/api/v1/users/:userId/misconceptions`                     | List misconceptions   | JWT + `assertUserAccess` | ✅ Implemented |
| `POST`  | `/api/v1/users/:userId/misconceptions/detect`              | Detect misconceptions | JWT + `assertUserAccess` | ✅ Implemented |
| `PATCH` | `/api/v1/users/:userId/misconceptions/:detectionId/status` | Update status         | JWT + `assertUserAccess` | ✅ Implemented |

#### Structural Health (`/api/v1/users/:userId/health`)

| Method | Path                                 | Handler                        | Auth                     | Status         |
| ------ | ------------------------------------ | ------------------------------ | ------------------------ | -------------- |
| `GET`  | `/api/v1/users/:userId/health`       | Structural health report       | JWT + `assertUserAccess` | ✅ Implemented |
| `GET`  | `/api/v1/users/:userId/health/stage` | Metacognitive stage assessment | JWT + `assertUserAccess` | ✅ Implemented |

#### Comparison (`/api/v1/users/:userId/comparison`)

| Method | Path                               | Handler              | Auth                     | Status         |
| ------ | ---------------------------------- | -------------------- | ------------------------ | -------------- |
| `GET`  | `/api/v1/users/:userId/comparison` | Compare PKG with CKG | JWT + `assertUserAccess` | ✅ Implemented |

#### PKG Operations (`/api/v1/users/:userId/pkg/operations`)

| Method | Path                                   | Handler                | Auth                     | Status         |
| ------ | -------------------------------------- | ---------------------- | ------------------------ | -------------- |
| `GET`  | `/api/v1/users/:userId/pkg/operations` | List PKG operation log | JWT + `assertUserAccess` | ✅ Implemented |

#### Health Routes

| Method | Path            | Handler         | Auth | Status         |
| ------ | --------------- | --------------- | ---- | -------------- |
| `GET`  | `/health`       | Combined health | None | ✅ Implemented |
| `GET`  | `/health/live`  | Liveness probe  | None | ✅ Implemented |
| `GET`  | `/health/ready` | Readiness probe | None | ✅ Implemented |

**Total: 58 endpoints**

---

## 6. HLR Sidecar

**Path:** `services/hlr-sidecar/` **Framework:** FastAPI (Python) **Database:**
None (stateless, in-memory model) **Algorithm:** Settles & Meeder (2016)
Half-Life Regression

### 6.1 Endpoints

| Method | Path       | Handler                                                           | Auth                    | Status         |
| ------ | ---------- | ----------------------------------------------------------------- | ----------------------- | -------------- |
| `GET`  | `/health`  | Health check                                                      | None (internal service) | ✅ Implemented |
| `POST` | `/predict` | Predict recall probability + half-life from features + delta_days | None                    | ✅ Implemented |
| `POST` | `/train`   | Online weight update from observation                             | None                    | ✅ Implemented |
| `GET`  | `/weights` | Get current model weights (debug/inspection)                      | None                    | ✅ Implemented |
| `PUT`  | `/weights` | Load model weights                                                | None                    | ✅ Implemented |

**Total: 5 endpoints**

### 6.2 Notes

- No authentication — designed as an internal sidecar only.
- Global in-memory model with optional persistence.
- Configurable via `HLR_*` environment variables (learning rate, regularization,
  etc.).

---

## 7. Cross-Service Communication

### 7.1 Synchronous (HTTP)

| Source       | Target          | Mechanism                                   | Purpose                             |
| ------------ | --------------- | ------------------------------------------- | ----------------------------------- |
| user-service | session-service | `fetch()` via `SessionOrchestrationService` | Pause active session on user logout |

This is the **only** synchronous cross-service call found in the codebase.

### 7.2 Asynchronous (Redis Events)

All 5 TypeScript services integrate `RedisEventPublisher` from
`@noema/events/publisher` for publishing domain events to Redis Streams.

| Service                 | Event Types Published                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| user-service            | UserCreated, UserProfileUpdated, UserSettingsUpdated, UserLoggedIn, UserLoggedOut, UserPasswordChanged, UserDeleted |
| content-service         | CardCreated, CardUpdated, CardDeleted, CardStateChanged, CardTagsUpdated, CardNodesUpdated, BatchCreated            |
| scheduler-service       | (scheduler domain events)                                                                                           |
| session-service         | (session domain events via EventOutbox)                                                                             |
| knowledge-graph-service | (KG domain events)                                                                                                  |

### 7.3 Event Consumers

**All `events/consumers/` directories are empty across every service.** Event
publishing infrastructure is wired up, but no consumers are implemented yet.
This means event-driven cross-service sagas (e.g., "when a card is created,
auto-create a scheduler entry") are not yet active.

### 7.4 Scheduler ↔ HLR Sidecar

The scheduler-service calls the HLR sidecar (POST `/predict`, POST `/train`)
internally for the HLR lane of the dual-lane scheduling algorithm. This is not
routed through the public API.

---

## 8. Admin-Scoped Endpoints

### By Service

| Service                 | Endpoint                                         | Guard                                                                 |
| ----------------------- | ------------------------------------------------ | --------------------------------------------------------------------- |
| user-service            | `GET /users`                                     | Tagged as "admin only" in JSON schema                                 |
| session-service         | `POST /v1/internal/sessions/:sessionId/expire`   | Requires `session:system:expire` scope                                |
| knowledge-graph-service | `POST /api/v1/ckg/mutations`                     | `assertAdminOrAgent()` — requires `admin`, `agent`, or `service` role |
| knowledge-graph-service | `GET /api/v1/ckg/mutations/health`               | `assertAdminOrAgent()`                                                |
| knowledge-graph-service | `POST /api/v1/ckg/mutations/:mutationId/cancel`  | `assertAdminOrAgent()`                                                |
| knowledge-graph-service | `POST /api/v1/ckg/mutations/:mutationId/retry`   | `assertAdminOrAgent()`                                                |
| knowledge-graph-service | `POST /api/v1/ckg/mutations/:mutationId/approve` | `assertAdminOrAgent()`                                                |
| knowledge-graph-service | `POST /api/v1/ckg/mutations/:mutationId/reject`  | `assertAdminOrAgent()`                                                |

### Auth Guard Implementations

- **`assertUserAccess(request, userId)`** — PKG routes: checks JWT `sub` matches
  URL `:userId`, OR requester has `admin`/`agent`/`service` role.
- **`assertAdminOrAgent(request)`** — CKG mutations: requires `admin`, `agent`,
  or `service` role in JWT `roles` claim.
- **`requireScopes(...scopes)`** — Scheduler: middleware that reads `scopes`
  (array) or `scope` (space-delimited string) from JWT payload.

---

## 9. Missing / Stubbed Functionality

### 9.1 No Stubs Found

Every registered route handler across all 6 services contains full
implementation logic (validation, business logic, error handling, response
formatting). No `501 Not Implemented` or `TODO` stubs were found in route files.

### 9.2 Scaffolded but Not Implemented

| Area                     | Detail                                                                                                                                                                                                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Event consumers**      | All `events/consumers/` directories are empty across every service. Events are published but never consumed.                                                                                                                                                                                             |
| **Event-driven sagas**   | No cross-service workflows are wired through events (e.g., card creation → auto-schedule, user deletion → cascade cleanup).                                                                                                                                                                              |
| **Remaining 9 services** | `analytics-service`, `collaboration-service`, `gamification-service`, `ingestion-service`, `media-service`, `metacognition-service`, `notification-service`, `strategy-service`, `sync-service`, `vector-service` exist as directories but were not audited (outside scope of "6 implemented services"). |

### 9.3 Notable Gaps

| Gap                                                | Impact                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| No `PATCH` or `DELETE` for CKG nodes/edges via API | CKG is read-only through REST; mutations only go through the typestate mutation pipeline            |
| No `POST /v1/scheduler/reviews` endpoint           | Reviews appear to be created as a side-effect of schedule commits, not through a dedicated endpoint |
| No user search endpoint                            | `GET /users` lists all users; no text-search / filter-by-email endpoint exists                      |
| No email verification endpoint                     | User has `emailVerified` field but no `POST /auth/verify-email` route                               |
| No password reset flow                             | No `POST /auth/forgot-password` or `POST /auth/reset-password` routes                               |
| No MFA enrollment endpoints                        | User has `mfaEnabled`/`mfaSecret` fields but no MFA setup/verify endpoints                          |
| PKG `frontier` endpoint missing from CKG traversal | PKG has `GET .../traversal/frontier`, CKG traversal does not                                        |

---

## 10. Summary Statistics

| Service                 | Prisma Models | Endpoints | Admin Endpoints | Events Published | Cross-Service Calls   |
| ----------------------- | ------------- | --------- | --------------- | ---------------- | --------------------- |
| user-service            | 3             | 18        | 1               | 7 types          | 1 (→ session-service) |
| content-service         | 4             | 35        | 0               | 7 types          | 0                     |
| scheduler-service       | 8             | 10        | 0               | yes (types TBD)  | 1 (→ hlr-sidecar)     |
| session-service         | 6             | 28        | 1               | yes (via outbox) | 0                     |
| knowledge-graph-service | 9             | 58        | 6               | yes              | 0                     |
| hlr-sidecar             | 0             | 5         | 0               | 0                | 0                     |
| **TOTAL**               | **30**        | **154**   | **8**           | —                | **2**                 |

### Technology Matrix

| Concern        | Implementation                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| Framework      | Fastify (TS) × 5, FastAPI (Python) × 1                                                                                |
| Database       | PostgreSQL (Prisma) × 5, Neo4j × 1 (KG), none × 1 (HLR)                                                               |
| Cache          | Redis (ioredis) × 5                                                                                                   |
| Object Storage | MinIO × 1 (content-service)                                                                                           |
| Auth           | JWT (jose) — bearer token validation in all TS services                                                               |
| Validation     | Zod schemas + Fastify JSON Schema validation                                                                          |
| Events         | Redis Streams via `@noema/events` publisher (no consumers yet)                                                        |
| Reliability    | Transactional outbox (session-service), idempotent inbox (scheduler-service), optimistic concurrency (version fields) |
