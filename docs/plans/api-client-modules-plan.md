# API Client Modules Plan

> Generated: 2026-03-04 Scope: Build `@noema/api-client` modules for
> **content-service**, **session-service**, and **knowledge-graph-service**

---

## 1. Existing Pattern

The `packages/api-client/` already has:

- `src/client.ts` — `http.get/post/patch/delete/put` helpers, config, error
  class
- `src/user/` — `api.ts` (endpoint functions), `types.ts` (DTOs), `index.ts`
  (re-exports)
- `src/scheduler/` — same structure

New modules must follow this pattern: `src/<service>/api.ts`,
`src/<service>/types.ts`, `src/<service>/index.ts`.

## 2. Shared Types

| Package            | File                       | Relevant Exports                                                                                    |
| ------------------ | -------------------------- | --------------------------------------------------------------------------------------------------- |
| `@noema/contracts` | `src/responses.ts`         | `IApiResponse<T>`, `IPaginationInfo`, `IApiErrorResponse`                                           |
| `@noema/contracts` | `src/agent-hints.ts`       | `IAgentHints`                                                                                       |
| `@noema/contracts` | `src/health.ts`            | `IHealthCheckResponse`, `ILivenessResponse`, `IReadinessResponse`                                   |
| `@noema/contracts` | `src/session-blueprint.ts` | Session blueprint contracts                                                                         |
| `@noema/types`     | `src/branded-ids/`         | `CardId`, `TemplateId`, `MediaId`, `NodeId`, `EdgeId`, `MutationId`, `UserId`, `CorrelationId`      |
| `@noema/types`     | `src/enums/`               | `CardState`, `CardType`, `DifficultyLevel`, `GraphNodeType`, `GraphEdgeType`, `MutationState`, etc. |
| `@noema/types`     | `src/knowledge-graph/`     | `IGraphNode`, `IGraphEdge`, plus traversal/metrics/misconception types                              |
| `@noema/types`     | `src/branded-numerics/`    | `MasteryLevel`, `EdgeWeight`, `ConfidenceScore`                                                     |

**No OpenAPI specs exist** in `packages/contracts/`. Contracts are currently
defined inline via Fastify JSON Schema on each route.

---

## 3. Content Service — Route Catalog

**File:** `services/content-service/src/api/rest/content.routes.ts` (1020 lines)

All routes require `authMiddleware` (Bearer JWT). No special scopes —
user-scoped by JWT `sub`.

### 3.1 Card CRUD

| #   | Method   | Path                             | Auth | Body / Query                                                                                                | Response                                                 |
| --- | -------- | -------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | `POST`   | `/v1/cards`                      | JWT  | `ICreateCardInput`                                                                                          | `201` → `IApiResponse<ICard>`                            |
| 2   | `POST`   | `/v1/cards/batch`                | JWT  | `{ cards: ICreateCardInput[] }` (max 100)                                                                   | `201` → `IApiResponse<IBatchCreateResult>`               |
| 3   | `GET`    | `/v1/cards/stats`                | JWT  | —                                                                                                           | `IApiResponse<ICardStats>`                               |
| 4   | `GET`    | `/v1/cards/:id`                  | JWT  | params: `id`                                                                                                | `IApiResponse<ICard>`                                    |
| 5   | `POST`   | `/v1/cards/query`                | JWT  | `IDeckQuery`                                                                                                | `IApiResponse<{ items, total, hasMore }>` + `pagination` |
| 6   | `GET`    | `/v1/cards/cursor`               | JWT  | QS: `cursor?, limit?, cardTypes?, states?, difficulties?, tags?, sources?, sortBy?, sortOrder?, direction?` | `IApiResponse<ICursorPaginatedResponse<ICard>>`          |
| 7   | `POST`   | `/v1/cards/session-seed`         | JWT  | `ISessionSeedInput`                                                                                         | `IApiResponse<ISessionSeed>`                             |
| 8   | `PATCH`  | `/v1/cards/:id`                  | JWT  | `{ data: IUpdateCardInput, version: number }`                                                               | `IApiResponse<ICard>`                                    |
| 9   | `PATCH`  | `/v1/cards/:id/state`            | JWT  | `{ state: CardState, reason?: string, version: number }`                                                    | `IApiResponse<ICard>`                                    |
| 10  | `PATCH`  | `/v1/cards/:id/tags`             | JWT  | `{ tags: string[], version: number }`                                                                       | `IApiResponse<ICard>`                                    |
| 11  | `PATCH`  | `/v1/cards/:id/node-links`       | JWT  | `{ knowledgeNodeIds: string[], version: number }`                                                           | `IApiResponse<ICard>`                                    |
| 12  | `POST`   | `/v1/cards/count`                | JWT  | `IDeckQuery` (subset)                                                                                       | `IApiResponse<{ count: number }>`                        |
| 13  | `POST`   | `/v1/cards/validate`             | JWT  | `{ cardType: string, content: unknown }`                                                                    | `IApiResponse<IValidationResult>`                        |
| 14  | `POST`   | `/v1/cards/batch/state`          | JWT  | `{ items: {id,version}[], state: CardState, reason? }` (max 100)                                            | `IApiResponse<IBatchStateResult>`                        |
| 15  | `DELETE` | `/v1/cards/:id`                  | JWT  | QS: `soft?` (default "true")                                                                                | `204`                                                    |
| 16  | `POST`   | `/v1/cards/:id/restore`          | JWT  | —                                                                                                           | `IApiResponse<ICard>`                                    |
| 17  | `GET`    | `/v1/cards/:id/history`          | JWT  | QS: `limit?, offset?`                                                                                       | `IApiResponse<ICardHistory[]>`                           |
| 18  | `GET`    | `/v1/cards/:id/history/:version` | JWT  | —                                                                                                           | `IApiResponse<ICardHistory>`                             |
| 19  | `GET`    | `/v1/cards/batch/:batchId`       | JWT  | —                                                                                                           | `IApiResponse<ICard[]>`                                  |
| 20  | `DELETE` | `/v1/cards/batch/:batchId`       | JWT  | —                                                                                                           | `IApiResponse<IBatchRollbackResult>`                     |

### 3.2 Templates

**File:** `services/content-service/src/api/rest/template.routes.ts`

| #   | Method   | Path                            | Auth | Body / Query                                      | Response                                                 |
| --- | -------- | ------------------------------- | ---- | ------------------------------------------------- | -------------------------------------------------------- |
| 21  | `POST`   | `/v1/templates`                 | JWT  | `ICreateTemplateInput`                            | `201` → `IApiResponse<ITemplate>`                        |
| 22  | `GET`    | `/v1/templates/:id`             | JWT  | —                                                 | `IApiResponse<ITemplate>`                                |
| 23  | `POST`   | `/v1/templates/query`           | JWT  | `ITemplateQuery`                                  | `IApiResponse<{ items, total, hasMore }>` + `pagination` |
| 24  | `PATCH`  | `/v1/templates/:id`             | JWT  | `{ data: IUpdateTemplateInput, version: number }` | `IApiResponse<ITemplate>`                                |
| 25  | `DELETE` | `/v1/templates/:id`             | JWT  | QS: `soft?`                                       | `204`                                                    |
| 26  | `POST`   | `/v1/templates/:id/instantiate` | JWT  | optional overrides object                         | `IApiResponse<ICreateCardInput>`                         |

### 3.3 Media

**File:** `services/content-service/src/api/rest/media.routes.ts`

| #   | Method   | Path                         | Auth | Body / Query          | Response                                    |
| --- | -------- | ---------------------------- | ---- | --------------------- | ------------------------------------------- |
| 27  | `POST`   | `/v1/media/upload-url`       | JWT  | upload request body   | `201` → `IApiResponse<IUploadUrlResult>`    |
| 28  | `POST`   | `/v1/media/:id/confirm`      | JWT  | confirmation body     | `IApiResponse<IMediaFile>`                  |
| 29  | `GET`    | `/v1/media/:id`              | JWT  | —                     | `IApiResponse<IMediaFile>`                  |
| 30  | `GET`    | `/v1/media/:id/download-url` | JWT  | —                     | `IApiResponse<IDownloadUrlResult>`          |
| 31  | `GET`    | `/v1/media`                  | JWT  | QS: `offset?, limit?` | `IApiResponse<IMediaFile[]>` + `pagination` |
| 32  | `DELETE` | `/v1/media/:id`              | JWT  | —                     | `IApiResponse<...>`                         |

### 3.4 Health (unauthenticated)

**File:** `services/content-service/src/api/rest/health.routes.ts`

| #   | Method | Path            | Auth | Response               |
| --- | ------ | --------------- | ---- | ---------------------- |
| 33  | `GET`  | `/health`       | None | `IHealthCheckResponse` |
| 34  | `GET`  | `/health/live`  | None | `ILivenessResponse`    |
| 35  | `GET`  | `/health/ready` | None | `IReadinessResponse`   |

### 3.5 Content Service Types Needed

Local types from `services/content-service/src/types/content.types.ts`:

- `ICard`, `ICardSummary`, `ICardContent`, `ICardContentBase`
- `ICreateCardInput`, `IUpdateCardInput`, `IChangeCardStateInput`
- `IBatchCreateCardInput`, `IBatchChangeStateItem`, `IBatchCreateResult`
- `IDeckQuery`, `ICursorPaginationInput`, `ICursorPaginatedResponse<T>`
- `ISessionSeedInput`, `ISessionSeed`
- `ICardHistory`
- `ICreateTemplateInput`, `IUpdateTemplateInput`, `ITemplateQuery`

These will need to be either:

1. Re-exported from a shared package (preferred long-term), or
2. Mirrored as simplified DTOs in `packages/api-client/src/content/types.ts`

---

## 4. Session Service — Route Catalog

**File:** `services/session-service/src/api/rest/session.routes.ts` (667 lines)

All routes require `authMiddleware` (Bearer JWT). One route requires an
additional scope.

### 4.1 Session Lifecycle

| #   | Method | Path                                      | Auth                                | Body / Query                                                                                                                                               | Response                          |
| --- | ------ | ----------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1   | `POST` | `/v1/sessions`                            | JWT                                 | start session body                                                                                                                                         | `201` → `IApiResponse<ISession>`  |
| 2   | `POST` | `/v1/sessions/blueprint/validate`         | JWT                                 | blueprint body                                                                                                                                             | `IApiResponse<IValidationResult>` |
| 3   | `GET`  | `/v1/sessions`                            | JWT                                 | QS: `state?, learningMode?, createdAfter?, createdBefore?, completedAfter?, completedBefore?, deckId?, minAttempts?, sortBy?, sortOrder?, limit?, offset?` | `IApiResponse<ISessionList>`      |
| 4   | `GET`  | `/v1/sessions/streak`                     | JWT                                 | QS: `days?, timezone?`                                                                                                                                     | `IApiResponse<IStreakResult>`     |
| 5   | `GET`  | `/v1/sessions/:sessionId`                 | JWT                                 | —                                                                                                                                                          | `IApiResponse<ISession>`          |
| 6   | `POST` | `/v1/sessions/:sessionId/pause`           | JWT                                 | `{ reason?: string }`                                                                                                                                      | `IApiResponse<ISession>`          |
| 7   | `POST` | `/v1/sessions/:sessionId/resume`          | JWT                                 | —                                                                                                                                                          | `IApiResponse<ISession>`          |
| 8   | `POST` | `/v1/sessions/:sessionId/complete`        | JWT                                 | —                                                                                                                                                          | `IApiResponse<ISession>`          |
| 9   | `POST` | `/v1/sessions/:sessionId/expire`          | JWT                                 | —                                                                                                                                                          | `IApiResponse<ISession>`          |
| 10  | `POST` | `/v1/internal/sessions/:sessionId/expire` | JWT + `session:system:expire` scope | —                                                                                                                                                          | `IApiResponse<ISession>`          |
| 11  | `POST` | `/v1/sessions/:sessionId/abandon`         | JWT                                 | `{ reason?: string }`                                                                                                                                      | `IApiResponse<ISession>`          |

### 4.2 Attempts

| #   | Method | Path                                               | Auth | Body / Query          | Response                         |
| --- | ------ | -------------------------------------------------- | ---- | --------------------- | -------------------------------- |
| 12  | `POST` | `/v1/sessions/:sessionId/attempts`                 | JWT  | attempt record body   | `201` → `IApiResponse<IAttempt>` |
| 13  | `GET`  | `/v1/sessions/:sessionId/attempts`                 | JWT  | QS: `limit?, offset?` | `IApiResponse<IAttemptList>`     |
| 14  | `POST` | `/v1/sessions/:sessionId/attempts/:attemptId/hint` | JWT  | hint request body     | `IApiResponse<IHintResult>`      |

### 4.3 Queue Management

| #   | Method | Path                                   | Auth | Body / Query    | Response                            |
| --- | ------ | -------------------------------------- | ---- | --------------- | ----------------------------------- |
| 15  | `GET`  | `/v1/sessions/:sessionId/queue`        | JWT  | —               | `IApiResponse<IQueueState>`         |
| 16  | `POST` | `/v1/sessions/:sessionId/queue/inject` | JWT  | queue item body | `201` → `IApiResponse<IQueueState>` |
| 17  | `POST` | `/v1/sessions/:sessionId/queue/remove` | JWT  | removal body    | `IApiResponse<IQueueState>`         |

### 4.4 Checkpoints & Cohort

| #   | Method | Path                                           | Auth | Body / Query         | Response                              |
| --- | ------ | ---------------------------------------------- | ---- | -------------------- | ------------------------------------- |
| 18  | `POST` | `/v1/sessions/:sessionId/checkpoints/evaluate` | JWT  | checkpoint body      | `IApiResponse<ICheckpointResult>`     |
| 19  | `POST` | `/v1/sessions/:sessionId/cohort/propose`       | JWT  | cohort proposal body | `201` → `IApiResponse<ICohortResult>` |
| 20  | `POST` | `/v1/sessions/:sessionId/cohort/accept`        | JWT  | accept body          | `IApiResponse<ICohortResult>`         |
| 21  | `POST` | `/v1/sessions/:sessionId/cohort/revise`        | JWT  | revision body        | `IApiResponse<ICohortResult>`         |
| 22  | `POST` | `/v1/sessions/:sessionId/cohort/commit`        | JWT  | commit body          | `IApiResponse<ICohortResult>`         |

### 4.5 Strategy & Teaching

| #   | Method | Path                               | Auth | Body / Query         | Response                        |
| --- | ------ | ---------------------------------- | ---- | -------------------- | ------------------------------- |
| 23  | `POST` | `/v1/sessions/:sessionId/strategy` | JWT  | strategy update body | `IApiResponse<IStrategyResult>` |
| 24  | `POST` | `/v1/sessions/:sessionId/teaching` | JWT  | teaching change body | `IApiResponse<ITeachingResult>` |

### 4.6 Offline Intent Tokens (ADR-0023)

| #   | Method | Path                         | Auth | Body / Query        | Response                                    |
| --- | ------ | ---------------------------- | ---- | ------------------- | ------------------------------------------- |
| 25  | `POST` | `/v1/offline-intents`        | JWT  | token request body  | `201` → `IApiResponse<IOfflineIntentToken>` |
| 26  | `POST` | `/v1/offline-intents/verify` | JWT  | `{ token: string }` | `IApiResponse<IVerifyResult>`               |

### 4.7 Health (unauthenticated)

| #   | Method | Path            | Auth | Response           |
| --- | ------ | --------------- | ---- | ------------------ |
| 27  | `GET`  | `/health`       | None | `HealthResponse`   |
| 28  | `GET`  | `/health/live`  | None | `{ status: 'ok' }` |
| 29  | `GET`  | `/health/ready` | None | `{ status: 'ok' }` |

### 4.8 Session Service Types Needed

From `services/session-service/src/types/`:

- Session state, attempt, queue, strategy, teaching DTOs
- `SessionState`, `LearningMode`, `SessionSortBy`, `SortOrder`

From `services/session-service/src/domain/session-service/session.schemas.ts`:

- `SessionListQuerySchema`, `AttemptListQuerySchema`, `StreakQuerySchema`

---

## 5. Knowledge Graph Service — Route Catalog

**Files:** 13 route files in `services/knowledge-graph-service/src/api/rest/`

All routes require `authMiddleware` (Bearer JWT). PKG routes also verify
`userId` matches JWT (or agent/admin role). CKG mutation writes require
admin/agent role (`assertAdminOrAgent`).

### 5.1 PKG Nodes (`/api/v1/users/:userId/pkg/nodes`)

| #   | Method   | Path                                      | Auth        | Body / Query                                                             | Response                                               |
| --- | -------- | ----------------------------------------- | ----------- | ------------------------------------------------------------------------ | ------------------------------------------------------ |
| 1   | `POST`   | `/api/v1/users/:userId/pkg/nodes`         | JWT + owner | `{ label, nodeType, domain, description?, properties? }`                 | `201` → `IApiResponse<IGraphNode>`                     |
| 2   | `GET`    | `/api/v1/users/:userId/pkg/nodes`         | JWT + owner | QS: `nodeType?, domain?, search?, page?, pageSize?, sortBy?, sortOrder?` | `IApiResponse<{ items, total, hasMore }>` + pagination |
| 3   | `GET`    | `/api/v1/users/:userId/pkg/nodes/:nodeId` | JWT + owner | —                                                                        | `IApiResponse<IGraphNode>`                             |
| 4   | `PATCH`  | `/api/v1/users/:userId/pkg/nodes/:nodeId` | JWT + owner | `{ label?, description?, properties?, masteryLevel? }`                   | `IApiResponse<IGraphNode>`                             |
| 5   | `DELETE` | `/api/v1/users/:userId/pkg/nodes/:nodeId` | JWT + owner | —                                                                        | `204`                                                  |

### 5.2 PKG Edges (`/api/v1/users/:userId/pkg/edges`)

| #   | Method   | Path                                      | Auth        | Body / Query                                                                           | Response                                               |
| --- | -------- | ----------------------------------------- | ----------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 6   | `POST`   | `/api/v1/users/:userId/pkg/edges`         | JWT + owner | `{ edgeType, sourceNodeId, targetNodeId, weight?, properties?, skipAcyclicityCheck? }` | `201` → `IApiResponse<IGraphEdge>`                     |
| 7   | `GET`    | `/api/v1/users/:userId/pkg/edges`         | JWT + owner | QS: `edgeType?, nodeId?, direction?, page?, pageSize?`                                 | `IApiResponse<{ items, total, hasMore }>` + pagination |
| 8   | `GET`    | `/api/v1/users/:userId/pkg/edges/:edgeId` | JWT + owner | —                                                                                      | `IApiResponse<IGraphEdge>`                             |
| 9   | `PATCH`  | `/api/v1/users/:userId/pkg/edges/:edgeId` | JWT + owner | `{ weight?, properties? }`                                                             | `IApiResponse<IGraphEdge>`                             |
| 10  | `DELETE` | `/api/v1/users/:userId/pkg/edges/:edgeId` | JWT + owner | —                                                                                      | `204`                                                  |

### 5.3 PKG Traversal (`/api/v1/users/:userId/pkg/traversal`)

| #   | Method | Path                                       | Auth        | Query Params                                                                          | Response                                 |
| --- | ------ | ------------------------------------------ | ----------- | ------------------------------------------------------------------------------------- | ---------------------------------------- |
| 11  | `GET`  | `.../traversal/subgraph`                   | JWT + owner | `rootNodeId, maxDepth?, edgeTypes?, direction?`                                       | `IApiResponse<ISubgraph>`                |
| 12  | `GET`  | `.../traversal/ancestors/:nodeId`          | JWT + owner | `maxDepth?, edgeTypes?`                                                               | `IApiResponse<IGraphNode[]>`             |
| 13  | `GET`  | `.../traversal/descendants/:nodeId`        | JWT + owner | `maxDepth?, edgeTypes?`                                                               | `IApiResponse<IGraphNode[]>`             |
| 14  | `GET`  | `.../traversal/path`                       | JWT + owner | `fromNodeId, toNodeId, maxDepth?`                                                     | `IApiResponse<IPath>`                    |
| 15  | `GET`  | `.../traversal/siblings/:nodeId`           | JWT + owner | `edgeType, direction?, includeParentDetails?, maxSiblingsPerGroup?`                   | `IApiResponse<ISiblingsResult>`          |
| 16  | `GET`  | `.../traversal/co-parents/:nodeId`         | JWT + owner | `edgeType, direction?, includeChildDetails?, maxCoParentsPerGroup?`                   | `IApiResponse<ICoParentsResult>`         |
| 17  | `GET`  | `.../traversal/neighborhood/:nodeId`       | JWT + owner | `hops?, edgeTypes?, nodeTypes?, filterMode?, direction?, maxPerGroup?, includeEdges?` | `IApiResponse<INeighborhoodResult>`      |
| 18  | `GET`  | `.../traversal/bridges`                    | JWT + owner | `domain, edgeTypes?, minComponentSize?`                                               | `IApiResponse<IBridgeNodesResult>`       |
| 19  | `GET`  | `.../traversal/frontier`                   | JWT + owner | `domain, masteryThreshold?, maxResults?, sortBy?, includePrerequisites?`              | `IApiResponse<IFrontierResult>`          |
| 20  | `GET`  | `.../traversal/common-ancestors`           | JWT + owner | `nodeIdA, nodeIdB, edgeTypes?, maxDepth?`                                             | `IApiResponse<ICommonAncestorsResult>`   |
| 21  | `GET`  | `.../traversal/prerequisite-chain/:nodeId` | JWT + owner | `domain, maxDepth?, edgeTypes?, includeIndirect?`                                     | `IApiResponse<IPrerequisiteChainResult>` |
| 22  | `GET`  | `.../traversal/centrality`                 | JWT + owner | `domain, algorithm?, edgeTypes?, topK?, normalise?`                                   | `IApiResponse<ICentralityResult>`        |

### 5.4 CKG Nodes (`/api/v1/ckg/nodes`) — Read only

| #   | Method | Path                        | Auth | Query Params                                                         | Response                                               |
| --- | ------ | --------------------------- | ---- | -------------------------------------------------------------------- | ------------------------------------------------------ |
| 23  | `GET`  | `/api/v1/ckg/nodes`         | JWT  | `nodeType?, domain?, search?, page?, pageSize?, sortBy?, sortOrder?` | `IApiResponse<{ items, total, hasMore }>` + pagination |
| 24  | `GET`  | `/api/v1/ckg/nodes/:nodeId` | JWT  | —                                                                    | `IApiResponse<IGraphNode>`                             |

### 5.5 CKG Edges (`/api/v1/ckg/edges`) — Read only

| #   | Method | Path                        | Auth | Query Params                                       | Response                                               |
| --- | ------ | --------------------------- | ---- | -------------------------------------------------- | ------------------------------------------------------ |
| 25  | `GET`  | `/api/v1/ckg/edges`         | JWT  | `edgeType?, nodeId?, direction?, page?, pageSize?` | `IApiResponse<{ items, total, hasMore }>` + pagination |
| 26  | `GET`  | `/api/v1/ckg/edges/:edgeId` | JWT  | —                                                  | `IApiResponse<IGraphEdge>`                             |

### 5.6 CKG Traversal (`/api/v1/ckg/traversal`) — Read only

| #   | Method | Path                                           | Auth | Query Params                                                                          | Response                                 |
| --- | ------ | ---------------------------------------------- | ---- | ------------------------------------------------------------------------------------- | ---------------------------------------- |
| 27  | `GET`  | `.../ckg/traversal/subgraph`                   | JWT  | `rootNodeId, maxDepth?, edgeTypes?, direction?`                                       | `IApiResponse<ISubgraph>`                |
| 28  | `GET`  | `.../ckg/traversal/ancestors/:nodeId`          | JWT  | `maxDepth?, edgeTypes?`                                                               | `IApiResponse<IGraphNode[]>`             |
| 29  | `GET`  | `.../ckg/traversal/descendants/:nodeId`        | JWT  | `maxDepth?, edgeTypes?`                                                               | `IApiResponse<IGraphNode[]>`             |
| 30  | `GET`  | `.../ckg/traversal/path`                       | JWT  | `fromNodeId, toNodeId, maxDepth?`                                                     | `IApiResponse<IPath>`                    |
| 31  | `GET`  | `.../ckg/traversal/siblings/:nodeId`           | JWT  | `edgeType, direction?, includeParentDetails?, maxSiblingsPerGroup?`                   | `IApiResponse<ISiblingsResult>`          |
| 32  | `GET`  | `.../ckg/traversal/co-parents/:nodeId`         | JWT  | `edgeType, direction?, includeChildDetails?, maxCoParentsPerGroup?`                   | `IApiResponse<ICoParentsResult>`         |
| 33  | `GET`  | `.../ckg/traversal/neighborhood/:nodeId`       | JWT  | `hops?, edgeTypes?, nodeTypes?, filterMode?, direction?, maxPerGroup?, includeEdges?` | `IApiResponse<INeighborhoodResult>`      |
| 34  | `GET`  | `.../ckg/traversal/bridges`                    | JWT  | `domain, edgeTypes?, minComponentSize?`                                               | `IApiResponse<IBridgeNodesResult>`       |
| 35  | `GET`  | `.../ckg/traversal/common-ancestors`           | JWT  | `nodeIdA, nodeIdB, edgeTypes?, maxDepth?`                                             | `IApiResponse<ICommonAncestorsResult>`   |
| 36  | `GET`  | `.../ckg/traversal/prerequisite-chain/:nodeId` | JWT  | `domain, maxDepth?, edgeTypes?, includeIndirect?`                                     | `IApiResponse<IPrerequisiteChainResult>` |
| 37  | `GET`  | `.../ckg/traversal/centrality`                 | JWT  | `domain, algorithm?, edgeTypes?, topK?, normalise?`                                   | `IApiResponse<ICentralityResult>`        |

### 5.7 CKG Mutations (`/api/v1/ckg/mutations`)

| #   | Method  | Path                                                 | Auth              | Body / Query                                | Response                                 |
| --- | ------- | ---------------------------------------------------- | ----------------- | ------------------------------------------- | ---------------------------------------- |
| 38  | `POST`  | `/api/v1/ckg/mutations`                              | JWT + admin/agent | `{ operations[], rationale, evidence? }`    | `201` → `IApiResponse<IMutation>`        |
| 39  | `GET`   | `/api/v1/ckg/mutations`                              | JWT               | QS: `state?, proposedBy?, page?, pageSize?` | `IApiResponse<IMutation[]>` + pagination |
| 40  | `GET`   | `/api/v1/ckg/mutations/health`                       | JWT + admin/agent | —                                           | `IApiResponse<IMutationPipelineHealth>`  |
| 41  | `GET`   | `/api/v1/ckg/mutations/:mutationId`                  | JWT               | —                                           | `IApiResponse<IMutation>`                |
| 42  | `GET`   | `/api/v1/ckg/mutations/:mutationId/audit-log`        | JWT               | —                                           | `IApiResponse<IAuditLogEntry[]>`         |
| 43  | `POST`  | `/api/v1/ckg/mutations/:mutationId/cancel`           | JWT + admin/agent | —                                           | `IApiResponse<IMutation>`                |
| 44  | `POST`  | `/api/v1/ckg/mutations/:mutationId/retry`            | JWT + admin/agent | —                                           | `201` → `IApiResponse<IMutation>`        |
| 45  | `POST`  | `/api/v1/ckg/mutations/:mutationId/approve`          | JWT + admin/agent | `{ reason }`                                | `IApiResponse<IMutation>`                |
| 46  | `POST`  | `/api/v1/ckg/mutations/:mutationId/reject`           | JWT + admin/agent | `{ reason }`                                | `IApiResponse<IMutation>`                |
| 47  | `POST`  | `/api/v1/ckg/mutations/:mutationId/request-revision` | JWT + admin/agent | `{ feedback }`                              | `IApiResponse<IMutation>`                |
| 48  | `PATCH` | `/api/v1/ckg/mutations/:mutationId`                  | JWT + admin/agent | `{ operations[] }`                          | `IApiResponse<IMutation>`                |

### 5.8 Comparison (`/api/v1/users/:userId/comparison`)

| #   | Method | Path                               | Auth        | Query    | Response                          |
| --- | ------ | ---------------------------------- | ----------- | -------- | --------------------------------- |
| 49  | `GET`  | `/api/v1/users/:userId/comparison` | JWT + owner | `domain` | `IApiResponse<IComparisonResult>` |

### 5.9 Misconceptions (`/api/v1/users/:userId/misconceptions`)

| #   | Method  | Path                                                       | Auth        | Body / Query           | Response                         |
| --- | ------- | ---------------------------------------------------------- | ----------- | ---------------------- | -------------------------------- |
| 50  | `GET`   | `/api/v1/users/:userId/misconceptions`                     | JWT + owner | QS: `domain?, status?` | `IApiResponse<IMisconception[]>` |
| 51  | `POST`  | `/api/v1/users/:userId/misconceptions/detect`              | JWT + owner | `{ domain }`           | `IApiResponse<IMisconception[]>` |
| 52  | `PATCH` | `/api/v1/users/:userId/misconceptions/:detectionId/status` | JWT + owner | `{ status }`           | `204`                            |

### 5.10 Structural Health (`/api/v1/users/:userId/health`)

| #   | Method | Path                                 | Auth        | Query    | Response                                  |
| --- | ------ | ------------------------------------ | ----------- | -------- | ----------------------------------------- |
| 53  | `GET`  | `/api/v1/users/:userId/health`       | JWT + owner | `domain` | `IApiResponse<IStructuralHealthReport>`   |
| 54  | `GET`  | `/api/v1/users/:userId/health/stage` | JWT + owner | `domain` | `IApiResponse<IMetacognitiveStageResult>` |

### 5.11 Metrics (`/api/v1/users/:userId/metrics`)

| #   | Method | Path                                    | Auth        | Body / Query                     | Response                   |
| --- | ------ | --------------------------------------- | ----------- | -------------------------------- | -------------------------- |
| 55  | `GET`  | `/api/v1/users/:userId/metrics`         | JWT + owner | QS: `domain`                     | `IApiResponse<IMetrics>`   |
| 56  | `POST` | `/api/v1/users/:userId/metrics/compute` | JWT + owner | `{ domain }`                     | `IApiResponse<IMetrics>`   |
| 57  | `GET`  | `/api/v1/users/:userId/metrics/history` | JWT + owner | QS: `domain, from?, to?, limit?` | `IApiResponse<IMetrics[]>` |

### 5.12 PKG Operation Log (`/api/v1/users/:userId/pkg/operations`)

| #   | Method | Path                                   | Auth        | Query                                                            | Response                                               |
| --- | ------ | -------------------------------------- | ----------- | ---------------------------------------------------------------- | ------------------------------------------------------ |
| 58  | `GET`  | `/api/v1/users/:userId/pkg/operations` | JWT + owner | QS: `operationType?, nodeId?, edgeId?, since?, page?, pageSize?` | `IApiResponse<{ items, total, hasMore }>` + pagination |

### 5.13 Health (unauthenticated)

| #   | Method | Path            | Auth | Response               |
| --- | ------ | --------------- | ---- | ---------------------- |
| 59  | `GET`  | `/health`       | None | `IHealthCheckResponse` |
| 60  | `GET`  | `/health/live`  | None | `ILivenessResponse`    |
| 61  | `GET`  | `/health/ready` | None | `IReadinessResponse`   |

### 5.14 KG Service Types Needed

From `@noema/types/knowledge-graph`:

- `IGraphNode`, `IGraphEdge` (already shared)
- `GraphNodeType`, `GraphEdgeType`, `MutationState`, `MetacognitiveStage`, etc.
  (already shared enums)

From `services/knowledge-graph-service/src/types/`:

- Various traversal result shapes, comparison result, metrics DTOs
- Misconception detection DTOs
- Mutation pipeline types

---

## 6. Implementation Plan

### Phase 1: Content Service Client

**Files to create:**

```
packages/api-client/src/content/
  types.ts     — DTO interfaces (mirrored from content-service types)
  api.ts       — contentApi, templateApi, mediaApi objects
  index.ts     — re-exports
```

**Grouping in `api.ts`:**

- `contentApi` — card CRUD, query, cursor, batch, state, tags, node-links,
  history, session-seed, validate, count
- `templateApi` — template CRUD, query, instantiate
- `mediaApi` — upload URL, confirm, get, download URL, list, delete

### Phase 2: Session Service Client

**Files to create:**

```
packages/api-client/src/session/
  types.ts     — session, attempt, queue, streak, cohort, offline intent DTOs
  api.ts       — sessionApi, attemptApi, queueApi, offlineIntentApi objects
  index.ts     — re-exports
```

**Grouping in `api.ts`:**

- `sessionApi` — lifecycle (start, get, list, pause, resume, complete, expire,
  abandon, streak), internal expire
- `attemptApi` — record, list, hint
- `queueApi` — get, inject, remove
- `sessionCheckpointApi` — checkpoint evaluation
- `sessionCohortApi` — propose, accept, revise, commit
- `sessionStrategyApi` — strategy, teaching
- `offlineIntentApi` — issue, verify

### Phase 3: Knowledge Graph Service Client

**Files to create:**

```
packages/api-client/src/knowledge-graph/
  types.ts     — traversal, mutation, comparison, metrics, misconception, health DTOs
  pkg-api.ts   — pkgNodeApi, pkgEdgeApi, pkgTraversalApi, pkgOperationLogApi
  ckg-api.ts   — ckgNodeApi, ckgEdgeApi, ckgTraversalApi, ckgMutationApi
  user-api.ts  — comparisonApi, misconceptionApi, structuralHealthApi, metricsApi
  index.ts     — re-exports
```

Split into multiple api files because the KG service has 58+ endpoints across
very different domains.

### Phase 4: Update Barrel Exports

Update `packages/api-client/src/index.ts` to export new modules.

### Phase 5: React Query Hooks (optional follow-up)

Add hooks in `packages/api-client/src/hooks/` for each service following
existing pattern.

---

## 7. Auth Summary

| Service                 | Auth Pattern                                    | Special Scopes                                                                                                             |
| ----------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| content-service         | JWT (`authMiddleware`) on all non-health routes | None                                                                                                                       |
| session-service         | JWT (`authMiddleware`) on all non-health routes | `session:system:expire` on `/v1/internal/sessions/:sessionId/expire`                                                       |
| knowledge-graph-service | JWT (`authMiddleware`) on all non-health routes | PKG routes: `assertUserAccess(request, userId)` — owner or admin/agent. CKG mutation writes: `assertAdminOrAgent(request)` |

---

## 8. Open Questions

1. **Type sourcing strategy**: Should we move content-service and
   session-service DTOs to `packages/types/` (like KG types already are), or
   keep mirrored DTOs in `api-client/`?
2. **Base URL configuration**: The three services have different base URLs /
   ports. The existing `configureApiClient` sets a single `baseUrl`. We may need
   per-service base URL configuration, or rely on the API gateway to route by
   path prefix.
3. **OpenAPI spec generation**: No OpenAPI specs exist yet — all schemas are
   inline Fastify JSON Schema. Consider auto-generating specs with
   `@fastify/swagger` and then generating client code from specs.
