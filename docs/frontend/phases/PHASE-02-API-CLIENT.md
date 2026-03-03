# Phase 2 — API Client: Service Modules & React Query Hooks

> **Codename:** `Axon`  
> **Depends on:** Nothing (can run in parallel with Phases 0/1)  
> **Unlocks:** Phase 3 (Stores), Phase 5 (Dashboard), and every feature phase  
> **Estimated effort:** 4–5 days

---

## Philosophy

The API client is the **nervous system** of the frontend — every piece of data
flowing from backend to UI passes through it. The existing `@noema/api-client`
package has an excellent HTTP client and a complete User service module. This
phase replicates that pattern for the remaining 5 implemented services: Content,
Scheduler, Session, Knowledge Graph, and HLR Sidecar.

All modules follow the same architecture:

1. **Types file** — request/response DTOs aligned with backend contracts
2. **API file** — thin wrappers around `http.get/post/patch/delete` calls
3. **Hooks file** — React Query `useQuery` / `useMutation` hooks with proper
   cache keys, stale times, and optimistic updates
4. **Index file** — barrel export

---

## Tasks

### T2.1 — Content Service Module

**API surface to cover** (all under `/v1`):

| Function group  | Endpoints                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| Card CRUD       | `POST /cards`, `GET /cards/:id`, `PATCH /cards/:id`, `DELETE /cards/:id`, `POST /cards/:id/restore`               |
| Card queries    | `POST /cards/query` (DeckQuery), `GET /cards/cursor` (cursor pagination), `POST /cards/count`, `GET /cards/stats` |
| Card state      | `PATCH /cards/:id/state`, `POST /cards/batch/state`                                                               |
| Card metadata   | `PATCH /cards/:id/tags`, `PATCH /cards/:id/node-links`                                                            |
| Card validation | `POST /cards/validate`                                                                                            |
| Card history    | `GET /cards/:id/history`, `GET /cards/:id/history/:version`                                                       |
| Batch ops       | `POST /cards/batch`, `GET /cards/batch/:batchId`, `DELETE /cards/batch/:batchId`                                  |
| Templates       | `POST /templates`, `GET /templates/:id`, `PATCH /templates/:id`, `DELETE /templates/:id`                          |
| Media           | `POST /media/upload-url`, `POST /media/:id/confirm`, `GET /media/:id`, `DELETE /media/:id`                        |
| Session seed    | `POST /cards/session-seed`                                                                                        |

**Types to define:**  
`CardDto`, `CardContentDto` (polymorphic by `CardType`), `DeckQueryInput`,
`CardStatsDto`, `TemplateDto`, `MediaFileDto`, `CardHistoryDto`,
`CardVersionSnapshot`, `BatchCreateInput`, `BatchCreateResult`.

**Query key factory:**  
`contentKeys.cards.all`, `.list(query)`, `.detail(id)`, `.stats()`,
`.history(id)`, `.batch(batchId)`, `contentKeys.templates.all`, `.detail(id)`,
`contentKeys.media.detail(id)`.

**Critical hooks:**

- `useCards(query)` — paginated card query
- `useCardsCursor(query)` — infinite scroll via cursor pagination
- `useCard(id)` — single card with stale time 5min
- `useCardStats()` — aggregate statistics
- `useCreateCard()` — mutation, invalidates card lists
- `useBatchCreateCards()` — mutation for batch creation
- `useUpdateCard(id)` — mutation with optimistic update
- `useCardStateTransition(id)` — mutation for FSM state change
- `useCardHistory(id)` — version history
- `useValidateCardContent()` — validation without persistence
- `useSessionSeed(query)` — builds session seed from DeckQuery
- `useTemplates()`, `useTemplate(id)`, `useCreateTemplate()`,
  `useUpdateTemplate(id)`
- `useRequestUploadUrl()`, `useConfirmUpload(id)`

**Files:**

- `packages/api-client/src/content/types.ts`
- `packages/api-client/src/content/api.ts`
- `packages/api-client/src/content/hooks.ts`
- `packages/api-client/src/content/index.ts`

### T2.2 — Scheduler Service Module

**API surface** (all under `/v1/scheduler`):

| Function group     | Endpoints                                                                    |
| ------------------ | ---------------------------------------------------------------------------- |
| Dual-lane planning | `POST /dual-lane/plan`                                                       |
| Proposals          | `POST /proposals/review-windows`, `POST /proposals/session-candidates`       |
| Simulations        | `POST /simulations/session-candidates`                                       |
| Commits            | `POST /commits/cards/:cardId/schedule`, `POST /commits/cards/schedule/batch` |

**Types to define:**  
`DualLanePlanInput`, `DualLanePlanResult`, `ReviewWindowDto`,
`SessionCandidateDto`, `SimulationInput`, `SimulationResult`,
`ScheduleCommitInput`, `SchedulerCardDto`.

**Critical hooks:**

- `useDualLanePlan(input)` — fetches the current review plan
- `useReviewWindows(input)` — optimal review time proposals
- `useSessionCandidates(input)` — card candidates for a potential session
- `useSimulateSession(input)` — "what if" scheduling simulation
- `useCommitSchedule()` — mutation to commit a single card's schedule
- `useBatchCommitSchedule()` — mutation for batch schedule commit

**Files:**

- `packages/api-client/src/scheduler/types.ts`
- `packages/api-client/src/scheduler/api.ts`
- `packages/api-client/src/scheduler/hooks.ts`
- `packages/api-client/src/scheduler/index.ts`

### T2.3 — Session Service Module

**API surface** (all under `/v1/sessions`):

| Function group      | Endpoints                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Session lifecycle   | `POST /` (start), `GET /`, `GET /:id`, `POST /:id/pause`, `POST /:id/resume`, `POST /:id/complete`, `POST /:id/expire`, `POST /:id/abandon` |
| Attempts            | `POST /:id/attempts`, `GET /:id/attempts`, `POST /:id/attempts/:attemptId/hint`                                                             |
| Queue               | `GET /:id/queue`, `POST /:id/queue/inject`, `POST /:id/queue/remove`                                                                        |
| Checkpoints         | `POST /:id/checkpoints/evaluate`                                                                                                            |
| Cohort handshake    | `POST /:id/cohort/propose`, `POST /:id/cohort/accept`, `POST /:id/cohort/revise`, `POST /:id/cohort/commit`                                 |
| Mid-session updates | `POST /:id/strategy`, `POST /:id/teaching`                                                                                                  |
| Blueprint           | `POST /blueprint/validate`                                                                                                                  |
| Offline intents     | `POST /offline-intents`, `POST /offline-intents/verify`                                                                                     |

**Types to define:**  
`SessionDto`, `AttemptDto`, `AttemptInput` (with metacognitive signals:
`confidenceBefore`, `confidenceAfter`, `calibrationDelta`, `hintDepthUsed`,
`dwellTimeMs`, `selfReportedGuess`), `SessionQueueDto`, `HintResponseDto`,
`CheckpointDirectiveDto`, `CohortHandshakeDto`, `BlueprintValidationResult`,
`OfflineIntentTokenDto`.

**Critical hooks:**

- `useSessions(filters)` — list with state/mode filters
- `useSession(id)` — single session detail
- `useStartSession()` — mutation
- `usePauseSession(id)`, `useResumeSession(id)`, `useCompleteSession(id)`,
  `useAbandonSession(id)` — lifecycle mutations
- `useRecordAttempt(sessionId)` — mutation for recording an attempt
- `useRequestHint(sessionId, attemptId)` — mutation for hint escalation
- `useSessionQueue(sessionId)` — query for current card queue
- `useEvaluateCheckpoint(sessionId)` — mutation for adaptive checkpoint
- `useValidateBlueprint()` — mutation for agent blueprint validation
- `useOfflineIntentToken()` — mutation to get offline token
- `useUpdateSessionStrategy(sessionId)` — mid-session strategy change
- `useUpdateTeachingApproach(sessionId)` — mid-session teaching change

**Files:**

- `packages/api-client/src/session/types.ts`
- `packages/api-client/src/session/api.ts`
- `packages/api-client/src/session/hooks.ts`
- `packages/api-client/src/session/index.ts`

### T2.4 — Knowledge Graph Service Module

**API surface** (under `/api/v1`):

| Function group | Endpoints                                                                                                                                                                                                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PKG Nodes      | `POST /users/:userId/pkg/nodes`, `GET .../nodes`, `GET .../nodes/:id`, `PATCH .../nodes/:id`, `DELETE .../nodes/:id`                                                                                                                                                                                              |
| PKG Edges      | `POST /users/:userId/pkg/edges`, `GET .../edges`, `GET .../edges/:id`, `DELETE .../edges/:id`                                                                                                                                                                                                                     |
| PKG Traversal  | `.../traversal/subgraph`, `.../traversal/prerequisites/:nodeId`, `.../traversal/related/:nodeId`, `.../traversal/topology`, `.../traversal/frontier`, `.../traversal/bridges`, `.../traversal/centrality`, `.../traversal/siblings/:nodeId`, `.../traversal/co-parents/:nodeId`, `.../traversal/common-ancestors` |
| PKG Operations | `.../operations` — operation log                                                                                                                                                                                                                                                                                  |
| CKG Read       | `/ckg/nodes`, `/ckg/nodes/:id`, `/ckg/edges`, `/ckg/edges/:id`                                                                                                                                                                                                                                                    |
| CKG Mutations  | `/ckg/mutations` (CRUD + approve/reject/cancel/retry)                                                                                                                                                                                                                                                             |
| CKG Traversal  | `/ckg/traversal/...`                                                                                                                                                                                                                                                                                              |
| Metrics        | `/users/:userId/metrics`, `/users/:userId/metrics/compute`, `/users/:userId/metrics/history`                                                                                                                                                                                                                      |
| Misconceptions | `/users/:userId/misconceptions` (list/detect/update status)                                                                                                                                                                                                                                                       |
| Health         | `/users/:userId/structural-health`                                                                                                                                                                                                                                                                                |
| Comparison     | `/users/:userId/comparison`                                                                                                                                                                                                                                                                                       |

**Types to define:**  
`GraphNodeDto`, `GraphEdgeDto`, `SubgraphDto`, `PrerequisiteChainDto`,
`KnowledgeFrontierDto`, `BridgeNodesDto`, `CentralityDto`,
`StructuralMetricsDto`, `StructuralHealthReportDto`, `MisconceptionDto`,
`MisconceptionDetectionResult`, `CkgMutationDto`, `PkgCkgComparisonDto`,
`MetricHistoryDto`.

**Critical hooks:**

- `usePKGNodes(userId)`, `usePKGNode(userId, nodeId)`,
  `useCreatePKGNode(userId)`, `useUpdatePKGNode(userId, nodeId)`,
  `useDeletePKGNode(userId, nodeId)`
- `usePKGEdges(userId)`, `useCreatePKGEdge(userId)`,
  `useDeletePKGEdge(userId, edgeId)`
- `usePKGSubgraph(userId, params)` — traversal query
- `usePKGPrerequisites(userId, nodeId)` — prerequisite chain
- `useKnowledgeFrontier(userId)` — ready-to-learn nodes
- `useBridgeNodes(userId)` — articulation points
- `useCentrality(userId)` — centrality ranking
- `useStructuralHealth(userId)` — overall health report
- `useStructuralMetrics(userId)` — detailed metrics
- `useMetricHistory(userId)` — historical trend data
- `useMisconceptions(userId)` — active misconceptions list
- `useDetectMisconceptions(userId)` — trigger detection
- `useCKGNodes()`, `useCKGEdges()`, `useCKGMutations(filters)`,
  `useCKGMutation(id)`
- `useApproveMutation(id)`, `useRejectMutation(id)` — admin actions
- `usePKGCKGComparison(userId)` — personal vs canonical comparison

**Files:**

- `packages/api-client/src/knowledge-graph/types.ts`
- `packages/api-client/src/knowledge-graph/api.ts`
- `packages/api-client/src/knowledge-graph/hooks.ts`
- `packages/api-client/src/knowledge-graph/index.ts`

### T2.5 — HLR Sidecar Module

**API surface** (separate base URL for the Python sidecar):

| Function group | Endpoints                                        |
| -------------- | ------------------------------------------------ |
| Health         | `GET /health`                                    |
| Prediction     | `POST /predict` — recall probability + half-life |
| Training       | `POST /train` — online weight update             |
| Weights        | `GET /weights`, `PUT /weights`                   |

**Types to define:**  
`HLRPredictionInput`, `HLRPredictionResult`, `HLRTrainInput`, `HLRWeights`.

**Critical hooks:**

- `useHLRPredict(input)` — predict recall probability
- `useHLRHealth()` — health check

Note: The HLR sidecar runs on a different port (likely `3005` or similar). The
API client must support a second base URL. Add a
`configureServiceUrl(service, url)` utility or accept `baseUrl` overrides
per-module.

**Files:**

- `packages/api-client/src/hlr/types.ts`
- `packages/api-client/src/hlr/api.ts`
- `packages/api-client/src/hlr/hooks.ts`
- `packages/api-client/src/hlr/index.ts`

### T2.6 — Package Wiring

- Update `packages/api-client/src/index.ts` to re-export all 5 new modules
- Add sub-path exports to `packages/api-client/package.json`:
  ```
  "./content": { ... }
  "./scheduler": { ... }
  "./session": { ... }
  "./knowledge-graph": { ... }
  "./hlr": { ... }
  ```
- Ensure all query key factories follow the established pattern from `userKeys`

---

## Acceptance Criteria

- [ ] `pnpm build` succeeds for `@noema/api-client`
- [ ] `pnpm typecheck` passes with zero errors
- [ ] All hooks are exported and importable from `@noema/api-client`
- [ ] All types align with backend Prisma models and API response shapes
- [ ] Query key factories produce deterministic, serializable keys
- [ ] Mutations properly invalidate related query caches (e.g., creating a card
      invalidates card lists)
- [ ] HLR module supports a separate base URL configuration
- [ ] Every response type is wrapped in `IApiResponse<T>` from
      `@noema/contracts`

---

## Files Created

| File                                               | Description                      |
| -------------------------------------------------- | -------------------------------- |
| `packages/api-client/src/content/types.ts`         | Card, template, media DTOs       |
| `packages/api-client/src/content/api.ts`           | Content service HTTP calls       |
| `packages/api-client/src/content/hooks.ts`         | React Query hooks for content    |
| `packages/api-client/src/content/index.ts`         | Barrel export                    |
| `packages/api-client/src/scheduler/types.ts`       | Scheduler DTOs                   |
| `packages/api-client/src/scheduler/api.ts`         | Scheduler HTTP calls             |
| `packages/api-client/src/scheduler/hooks.ts`       | React Query hooks for scheduling |
| `packages/api-client/src/scheduler/index.ts`       | Barrel export                    |
| `packages/api-client/src/session/types.ts`         | Session, attempt, queue DTOs     |
| `packages/api-client/src/session/api.ts`           | Session HTTP calls               |
| `packages/api-client/src/session/hooks.ts`         | React Query hooks for sessions   |
| `packages/api-client/src/session/index.ts`         | Barrel export                    |
| `packages/api-client/src/knowledge-graph/types.ts` | Graph node/edge/metric DTOs      |
| `packages/api-client/src/knowledge-graph/api.ts`   | KG HTTP calls                    |
| `packages/api-client/src/knowledge-graph/hooks.ts` | React Query hooks for KG         |
| `packages/api-client/src/knowledge-graph/index.ts` | Barrel export                    |
| `packages/api-client/src/hlr/types.ts`             | HLR prediction/weight DTOs       |
| `packages/api-client/src/hlr/api.ts`               | HLR sidecar HTTP calls           |
| `packages/api-client/src/hlr/hooks.ts`             | React Query hooks for HLR        |
| `packages/api-client/src/hlr/index.ts`             | Barrel export                    |
