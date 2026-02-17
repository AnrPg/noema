# Phase 0: API Contracts & Agent Interfaces - Complete Checklist

**Duration:** Weeks 1-2  
**Goal:** Define all contracts before any implementation begins  
**Philosophy:** Design APIs before writing code. Contracts are the source of
truth.

---

## 📋 Overview Checklist

- [ ] **Week 1: Agent Contracts & Core Event Schemas**
- [ ] **Week 2: Service API Contracts & Testing Framework**
- [ ] **Documentation Review & Sign-off**

---

## 🤖 1. Agent Contracts (10 Agents)

**Location:** `packages/contracts/src/agents/`

### 1.1 Learning Agent Contract

**File:** `packages/contracts/src/agents/learning-agent.contract.ts`

- [ ] **Define Input Interface**
  - [ ] `SelectNextCardInput` with userId, mode, sessionContext
  - [ ] `PlanSessionInput` with goals, duration, constraints
  - [ ] `AdaptModeInput` with performance data
- [ ] **Define Output Interface**
  - [ ] `SelectNextCardOutput` with selectedCard, reasoning, alternatives
  - [ ] `SessionPlanOutput` with cardSequence, estimatedDuration, strategy
  - [ ] All outputs include AgentHints v2.0.0 (8 required fields)

- [ ] **Define Tool Requirements**
  - [ ] List of required tools: `get-candidate-cards`,
        `get-knowledge-graph-context`, `get-dueness-scores`
  - [ ] Tool input/output schemas for each
- [ ] **Define Configuration Schema**
  - [ ] LLM config (model, temperature, maxTokens)
  - [ ] Behavior config (maxIterations, timeoutMs)
  - [ ] Mode strategies (exploration, goal-driven, exam, synthesis)

- [ ] **Define Reasoning Trace Schema**
  - [ ] Steps array with thought/action/observation
  - [ ] Decision summary
  - [ ] Confidence calculation method
  - [ ] Alternatives considered

- [ ] **Define Metadata Schema**
  - [ ] executionTime, iterations, toolsUsed
  - [ ] tokenUsage (prompt, completion, total)
  - [ ] estimatedCost, model, agentVersion

- [ ] **Write Contract Documentation**
  - [ ] Purpose and responsibilities
  - [ ] When to use this agent
  - [ ] Example usage scenarios
  - [ ] Error handling patterns

---

### 1.2 Diagnostic Agent Contract

**File:** `packages/contracts/src/agents/diagnostic-agent.contract.ts`

- [ ] **Define Input Interface**
  - [ ] `AnalyzeTraceInput` with thinkingTrace (7 frames)
  - [ ] `GeneratePatchPlanInput` with diagnosis, constraints
  - [ ] `DetectPatternsInput` with multiple traces

- [ ] **Define Output Interface**
  - [ ] `FailureDiagnosis` with family, subtype, confidence, evidence
  - [ ] `PatchPlan` with immediate/optional/escalation patches
  - [ ] `PatternDetection` with recurring patterns, frequency

- [ ] **Define Tool Requirements**
  - [ ] `query-telemetry`, `get-failure-taxonomy`, `get-remediation-cards`
  - [ ] Tool schemas for each

- [ ] **Define Failure Taxonomy Schema**
  - [ ] 10 failure families (PARSING, RETRIEVAL, PRIOR_KNOWLEDGE, etc.)
  - [ ] Subtypes for each family
  - [ ] Evidence requirements per type

- [ ] **Define Patch Plan Schema**
  - [ ] ImmediatePatch (verification gates, contrast cards, slow-down)
  - [ ] OptionalPatch (practice recommendations, strategy suggestions)
  - [ ] EscalationPatch (prerequisite learning, strategy override)

- [ ] **Define Configuration Schema**
  - [ ] Intrusiveness budget settings
  - [ ] Confidence thresholds per failure family
  - [ ] Patch selection strategies

- [ ] **Write Contract Documentation**

---

### 1.3 Strategy Agent Contract

**File:** `packages/contracts/src/agents/strategy-agent.contract.ts`

- [ ] **Define Input Interface**
  - [ ] `SelectLoadoutInput` with userState, goals, history
  - [ ] `EvaluateStrategyInput` with loadout, sessionResults, metrics
  - [ ] `AdaptStrategyInput` with diagnosis, performance

- [ ] **Define Output Interface**
  - [ ] `SelectedLoadout` with archetype, customizations, reasoning
  - [ ] `StrategyEvaluation` with metrics, effectiveness, recommendations
  - [ ] `StrategyAdaptation` with adjustments, justification

- [ ] **Define Tool Requirements**
  - [ ] `get-loadout`, `get-user-history`, `get-performance-metrics`
  - [ ] Tool schemas

- [ ] **Define Loadout Schema**
  - [ ] 6 policy dimensions (pacing, error, hint, feedback, commit, reflection)
  - [ ] Canonical archetypes (FAST_RECALL, DEEP_UNDERSTANDING, EXAM_SURVIVAL,
        CALIBRATION)
  - [ ] Custom loadout parameters

- [ ] **Define Configuration Schema**
  - [ ] Evaluation criteria weights
  - [ ] Adaptation sensitivity
  - [ ] Override conditions

- [ ] **Write Contract Documentation**

---

### 1.4 Content Generation Agent Contract

**File:** `packages/contracts/src/agents/content-generation-agent.contract.ts`

- [ ] **Define Input Interface**
  - [ ] `GenerateCardsInput` with topic, count, cardType, difficulty
  - [ ] `EnhanceCardInput` with card, enhancementTypes
  - [ ] `CreateRemediationCardInput` with diagnosis, targetConcepts

- [ ] **Define Output Interface**
  - [ ] `GeneratedCards` with cards array, metadata
  - [ ] `EnhancedCard` with original, enhanced, changes
  - [ ] `RemediationCard` with specialized card type

- [ ] **Define Tool Requirements**
  - [ ] `get-knowledge-graph-context`, `get-existing-cards`, `create-card`
  - [ ] Tool schemas

- [ ] **Define Card Type Schemas**
  - [ ] All 22 card types with type-specific fields
  - [ ] Validation rules per type
  - [ ] Default values per type

- [ ] **Define Configuration Schema**
  - [ ] Generation parameters per card type
  - [ ] Quality thresholds
  - [ ] Content safety filters

- [ ] **Write Contract Documentation**

---

### 1.5 Socratic Tutor Agent Contract

**File:** `packages/contracts/src/agents/socratic-tutor-agent.contract.ts`

- [ ] **Define Input Interface**
  - [ ] `ConductDialogueInput` with concept, userUnderstanding, approach
  - [ ] `GenerateQuestionInput` with questionType, context, history

- [ ] **Define Output Interface**
  - [ ] `DialogueSession` with turns, outcome, insights
  - [ ] `SocraticQuestion` with question, type, expectedResponse

- [ ] **Define Tool Requirements**
  - [ ] `get-concept-context`, `analyze-response`, `track-understanding`
  - [ ] Tool schemas

- [ ] **Define Dialogue Schema**
  - [ ] Turn structure (question, response, analysis)
  - [ ] Question types (clarification, assumption, evidence, perspective,
        implication)
  - [ ] Assessment criteria

- [ ] **Define Teaching Approach Schema**
  - [ ] Socratic method parameters
  - [ ] Inquiry-based parameters
  - [ ] Scaffolding levels

- [ ] **Define Configuration Schema**
  - [ ] Turns per concept
  - [ ] Scaffolding adaptation rules
  - [ ] Feedback timing

- [ ] **Write Contract Documentation**

---

### 1.6 Calibration Agent Contract

**File:** `packages/contracts/src/agents/calibration-agent.contract.ts`

- [ ] **Define Input Interface**
  - [ ] `AnalyzeCalibrationInput` with attempts, timeWindow
  - [ ] `GenerateFeedbackInput` with calibrationScore, patterns

- [ ] **Define Output Interface**
  - [ ] `CalibrationAnalysis` with brierScore, ECE, segments
  - [ ] `CalibrationFeedback` with insights, recommendations

- [ ] **Define Tool Requirements**
  - [ ] `query-attempts`, `calculate-calibration-metrics`, `get-trends`
  - [ ] Tool schemas

- [ ] **Define Metrics Schema**
  - [ ] Brier score calculation
  - [ ] Expected Calibration Error
  - [ ] Overconfidence/underconfidence rates
  - [ ] Segmentation (by difficulty, concept, time)

- [ ] **Define Configuration Schema**
  - [ ] Time windows for analysis
  - [ ] Threshold values
  - [ ] Intervention triggers

- [ ] **Write Contract Documentation**

---

### 1.7 Ingestion Agent Contract

**File:** `packages/contracts/src/agents/ingestion-agent.contract.ts`

- [ ] **Define Input Interface**
  - [ ] `AnalyzeDocumentInput` with IR document, parseConfig
  - [ ] `TransformToCardsInput` with contentUnits, transformConfig
  - [ ] `GenerateHintsInput` with drafts, context

- [ ] **Define Output Interface**
  - [ ] `AnalysisResult` with structure, suggestions, warnings
  - [ ] `CardDrafts` with drafts array, validation
  - [ ] `IngestionHints` with mapping suggestions, category recommendations

- [ ] **Define Tool Requirements**
  - [ ] `parse-document`, `extract-structure`, `suggest-card-types`
  - [ ] Tool schemas

- [ ] **Define IR Schema**
  - [ ] IngestionDocument structure
  - [ ] ContentUnit structure
  - [ ] Unit types and transformations

- [ ] **Define Configuration Schema**
  - [ ] Parser settings per format (13 formats)
  - [ ] Transformation rules
  - [ ] Quality thresholds

- [ ] **Write Contract Documentation**

---

### 1.8 Knowledge Graph Agent Contract

**File:** `packages/contracts/src/agents/knowledge-graph-agent.contract.ts`

- [ ] **Define Input Interface**
  - [ ] `ProposeCKGMutationInput` with evidence, signal, justification
  - [ ] `EvolvePKGInput` with userId, newAttempt
  - [ ] `QueryGraphInput` with nodeId, featureSet, depth

- [ ] **Define Output Interface**
  - [ ] `MutationDSL` with operation, validation status
  - [ ] `PKGUpdateResult` with changes, newVersion
  - [ ] `ProcessedGraphSummary` with neighbors, features, metrics

- [ ] **Define Tool Requirements**
  - [ ] `get-ckg-snapshot`, `get-ontology`, `validate-mutation`, `update-pkg`
  - [ ] Tool schemas

- [ ] **Define DSL Schema**
  - [ ] Mutation operations (AddNode, AddEdge, RemoveNode, RemoveEdge,
        UpdateProps)
  - [ ] Validation pipeline states
  - [ ] Typestate transitions

- [ ] **Define Graph Schema**
  - [ ] PKG node/edge structure
  - [ ] CKG node/edge structure
  - [ ] Layer 0-4 structures

- [ ] **Define Configuration Schema**
  - [ ] Mutation proposal parameters
  - [ ] Validation strictness
  - [ ] Authority boundaries

- [ ] **Write Contract Documentation**

---

### 1.9 Taxonomy Curator Agent Contract

**File:** `packages/contracts/src/agents/taxonomy-curator-agent.contract.ts`

- [ ] **Define Input Interface**
  - [ ] `AnalyzeTaxonomyInput` with usage patterns, misclassifications
  - [ ] `ProposeEvolutionInput` with newSubtype, merge, split

- [ ] **Define Output Interface**
  - [ ] `TaxonomyAnalysis` with gaps, redundancies, confusions
  - [ ] `EvolutionProposal` with changes, migration plan, impact

- [ ] **Define Tool Requirements**
  - [ ] `get-taxonomy-version`, `get-usage-stats`, `validate-proposal`
  - [ ] Tool schemas

- [ ] **Define Taxonomy Schema**
  - [ ] Failure family structure
  - [ ] Subtype definitions
  - [ ] Version management

- [ ] **Define Configuration Schema**
  - [ ] Evolution thresholds
  - [ ] Approval requirements
  - [ ] Migration strategies

- [ ] **Write Contract Documentation**

---

### 1.10 Governance Agent Contract

**File:** `packages/contracts/src/agents/governance-agent.contract.ts`

- [ ] **Define Input Interface**
  - [ ] `MonitorAgentInput` with agentId, actions, budget
  - [ ] `EnforcePolicyInput` with violations, severity

- [ ] **Define Output Interface**
  - [ ] `GovernanceReport` with violations, recommendations, actions
  - [ ] `PolicyEnforcement` with blocked actions, warnings, overrides

- [ ] **Define Tool Requirements**
  - [ ] `get-agent-audit-log`, `check-budget`, `enforce-limits`
  - [ ] Tool schemas

- [ ] **Define Policy Schema**
  - [ ] Budget limits (cost, time, intrusions)
  - [ ] Safety constraints
  - [ ] Compliance rules

- [ ] **Define Configuration Schema**
  - [ ] Monitoring frequency
  - [ ] Violation thresholds
  - [ ] Enforcement levels

- [ ] **Write Contract Documentation**

---

## 📡 2. Event Schemas (All Event Types)

**Location:** `packages/events/src/schemas/`

### 2.1 Core Event Base Schema

**File:** `packages/events/src/schemas/base-event.schema.ts`

- [ ] **Define BaseEvent Interface**
  - [ ] eventId (UUID v4)
  - [ ] eventType (format: aggregate.action)
  - [ ] aggregateType (PascalCase)
  - [ ] aggregateId (entity ID)
  - [ ] version (schema version, starts at 1)
  - [ ] timestamp (ISO 8601 UTC)
  - [ ] metadata (EventMetadata)
  - [ ] payload (unknown - specific to event type)

- [ ] **Define EventMetadata Interface**
  - [ ] serviceName, serviceVersion, environment
  - [ ] userId (optional), sessionId (optional)
  - [ ] correlationId, causationId
  - [ ] agentId (optional)
  - [ ] clientIp, userAgent
  - [ ] additional (flexible object)

- [ ] **Define Zod Validation Schema**
  - [ ] eventId validation (UUID v4 format)
  - [ ] eventType validation (aggregate.action pattern)
  - [ ] timestamp validation (ISO 8601)
  - [ ] Required vs optional fields

- [ ] **Write Event Naming Conventions**
  - [ ] Format: `{aggregate}.{action}` (lowercase, dots)
  - [ ] Action must be past tense
  - [ ] Good examples: card.created, user.settings.changed
  - [ ] Bad examples: createCard, CARD_CREATED, card.create

---

### 2.2 User Events

**File:** `packages/events/src/schemas/user-events.schema.ts`

- [ ] **user.created**
  - [ ] Payload: { userId, email, profile, source }
  - [ ] Metadata requirements
  - [ ] Zod schema

- [ ] **user.updated**
  - [ ] Payload: { userId, changes, previousValues, reason }
  - [ ] Zod schema

- [ ] **user.deleted**
  - [ ] Payload: { userId, soft, reason, snapshot }
  - [ ] Zod schema

- [ ] **user.settings.changed**
  - [ ] Payload: { userId, settingKey, oldValue, newValue, scope }
  - [ ] Zod schema

- [ ] **user.authenticated**
  - [ ] Payload: { userId, method, sessionId, deviceInfo }
  - [ ] Zod schema

- [ ] **user.logout**
  - [ ] Payload: { userId, sessionId, reason }
  - [ ] Zod schema

---

### 2.3 Card Events

**File:** `packages/events/src/schemas/card-events.schema.ts`

- [ ] **card.created**
  - [ ] Payload: { cardId, type, content, deckId, source, parentId }
  - [ ] Zod schema

- [ ] **card.updated**
  - [ ] Payload: { cardId, changes, previousValues, version, reason }
  - [ ] Zod schema

- [ ] **card.deleted**
  - [ ] Payload: { cardId, soft, reason, snapshot }
  - [ ] Zod schema

- [ ] **card.moved**
  - [ ] Payload: { cardId, fromDeckId, toDeckId, reason }
  - [ ] Zod schema

- [ ] **card.categorized**
  - [ ] Payload: { cardId, categoryIds, lensConfig }
  - [ ] Zod schema

---

### 2.4 Deck Events

**File:** `packages/events/src/schemas/deck-events.schema.ts`

- [ ] **deck.created**
  - [ ] Payload schema
  - [ ] Zod schema

- [ ] **deck.updated**
  - [ ] Payload schema
  - [ ] Zod schema

- [ ] **deck.deleted**
  - [ ] Payload schema
  - [ ] Zod schema

- [ ] **deck.card.added**
  - [ ] Payload: { deckId, cardId, position }
  - [ ] Zod schema

- [ ] **deck.card.removed**
  - [ ] Payload: { deckId, cardId, reason }
  - [ ] Zod schema

---

### 2.5 Session Events

**File:** `packages/events/src/schemas/session-events.schema.ts`

- [ ] **session.started**
  - [ ] Payload: { sessionId, userId, loadoutId, goal, estimatedDuration }
  - [ ] Zod schema

- [ ] **session.paused**
  - [ ] Payload: { sessionId, reason, state }
  - [ ] Zod schema

- [ ] **session.resumed**
  - [ ] Payload: { sessionId }
  - [ ] Zod schema

- [ ] **session.completed**
  - [ ] Payload: { sessionId, duration, cardsReviewed, metrics }
  - [ ] Zod schema

- [ ] **session.abandoned**
  - [ ] Payload: { sessionId, reason, partialState }
  - [ ] Zod schema

---

### 2.6 Attempt Events

**File:** `packages/events/src/schemas/attempt-events.schema.ts`

- [ ] **attempt.recorded**
  - [ ] Payload: { sessionId, cardId, rating, responseTime, confidence,
        strategy, assistsUsed }
  - [ ] Metadata: { schedulerAlgorithm, difficultyChanges, intervalChanges }
  - [ ] Zod schema with constraints (rating 1-5, confidence 0-1,
        responseTime > 0)

---

### 2.7 Assist Events

**File:** `packages/events/src/schemas/assist-events.schema.ts`

- [ ] **assist.hint.requested**
  - [ ] Payload: { cardId, hintNumber, context }
  - [ ] Zod schema

- [ ] **assist.answer.revealed**
  - [ ] Payload: { cardId, reason }
  - [ ] Zod schema

- [ ] **assist.explanation.requested**
  - [ ] Payload: { cardId, explanationType }
  - [ ] Zod schema

---

### 2.8 UI Telemetry Events

**File:** `packages/events/src/schemas/ui-events.schema.ts`

- [ ] **ui.card.flipped**
  - [ ] Payload: { cardId, flipDuration }
  - [ ] Zod schema

- [ ] **ui.answer.edited**
  - [ ] Payload: { cardId, editCount, editTime }
  - [ ] Zod schema

- [ ] **ui.confidence.adjusted**
  - [ ] Payload: { cardId, fromConfidence, toConfidence }
  - [ ] Zod schema

- [ ] **ui.strategy.switched**
  - [ ] Payload: { fromLoadoutId, toLoadoutId, reason }
  - [ ] Zod schema

---

### 2.9 Trace Events

**File:** `packages/events/src/schemas/trace-events.schema.ts`

- [ ] **trace.generated**
  - [ ] Payload: { traceId, attemptId, frames (7-frame structure) }
  - [ ] Zod schema for each frame

- [ ] **diagnosis.made**
  - [ ] Payload: { traceId, diagnosis, confidence, evidence }
  - [ ] Zod schema

- [ ] **patch.planned**
  - [ ] Payload: { diagnosisId, patchPlan }
  - [ ] Zod schema

---

### 2.10 Knowledge Graph Events

**File:** `packages/events/src/schemas/graph-events.schema.ts`

- [ ] **graph.pkg.node.added**
  - [ ] Payload: { userId, nodeId, nodeType, properties }
  - [ ] Zod schema

- [ ] **graph.pkg.edge.added**
  - [ ] Payload: { userId, edgeId, fromNode, toNode, edgeType }
  - [ ] Zod schema

- [ ] **graph.ckg.mutation.proposed**
  - [ ] Payload: { proposalId, dsl, evidence, justification, proposedBy }
  - [ ] Zod schema

- [ ] **graph.ckg.mutation.committed**
  - [ ] Payload: { proposalId, mutations, version }
  - [ ] Zod schema

- [ ] **graph.ckg.mutation.rejected**
  - [ ] Payload: { proposalId, reason, validationErrors }
  - [ ] Zod schema

- [ ] **misconception.detected**
  - [ ] Payload: { userId, misconceptionId, concepts, probability }
  - [ ] Zod schema

---

### 2.11 Gamification Events

**File:** `packages/events/src/schemas/gamification-events.schema.ts`

- [ ] **xp.awarded**
  - [ ] Payload: { userId, amount, source, metadata }
  - [ ] Zod schema

- [ ] **achievement.unlocked**
  - [ ] Payload: { userId, achievementId, tier, progress }
  - [ ] Zod schema

- [ ] **level.up**
  - [ ] Payload: { userId, fromLevel, toLevel, totalXP }
  - [ ] Zod schema

- [ ] **streak.extended**
  - [ ] Payload: { userId, streakType, newLength, longestStreak }
  - [ ] Zod schema

- [ ] **streak.broken**
  - [ ] Payload: { userId, streakType, length, reason }
  - [ ] Zod schema

- [ ] **streak.frozen**
  - [ ] Payload: { userId, streakType, freezesRemaining }
  - [ ] Zod schema

---

### 2.12 Strategy Events

**File:** `packages/events/src/schemas/strategy-events.schema.ts`

- [ ] **strategy.loadout.changed**
  - [ ] Payload: { userId, fromLoadoutId, toLoadoutId, reason, trigger }
  - [ ] Zod schema

- [ ] **strategy.evaluated**
  - [ ] Payload: { loadoutId, metrics, effectiveness, recommendations }
  - [ ] Zod schema

- [ ] **intervention.triggered**
  - [ ] Payload: { userId, interventionType, trigger, severity }
  - [ ] Zod schema

---

### 2.13 Ingestion Events

**File:** `packages/events/src/schemas/ingestion-events.schema.ts`

- [ ] **ingestion.job.created**
  - [ ] Payload: { jobId, userId, mode, filesCount }
  - [ ] Zod schema

- [ ] **ingestion.parsing.started**
  - [ ] Payload: { jobId, format }
  - [ ] Zod schema

- [ ] **ingestion.parsing.completed**
  - [ ] Payload: { jobId, unitsExtracted, warnings }
  - [ ] Zod schema

- [ ] **ingestion.transformation.completed**
  - [ ] Payload: { jobId, draftsGenerated, validated }
  - [ ] Zod schema

- [ ] **ingestion.committed**
  - [ ] Payload: { jobId, cardsCreated, decksCreated, categoriesCreated }
  - [ ] Zod schema

- [ ] **ingestion.failed**
  - [ ] Payload: { jobId, stage, error, partialResult }
  - [ ] Zod schema

---

### 2.14 Event Stream Naming

**File:** `packages/events/src/config/streams.config.ts`

- [ ] **Define Stream Naming Convention**
  - [ ] Format: `noema:events:{event-type}`
  - [ ] Examples: `noema:events:card.created`, `noema:events:attempt.recorded`

- [ ] **Define Consumer Groups**
  - [ ] analytics-consumer: all events
  - [ ] gamification-consumer: session._, achievement._, xp.\*
  - [ ] graph-consumer: card._, attempt._, misconception.\*
  - [ ] metacognition-consumer: attempt._, assist._, ui.\*

- [ ] **Define Retention Policies**
  - [ ] Hot: 7 days (fast access)
  - [ ] Warm: 90 days (normal access)
  - [ ] Cold: 2 years (archive, slow access)

---

## 🔌 3. Service API Contracts (15 Services)

**Location:** `docs/api/` (OpenAPI 3.1 specs)

### 3.1 User Service API

**File:** `docs/api/user-service.openapi.yaml`

- [ ] **Info Section**
  - [ ] title: "Noema User Service API"
  - [ ] version: "1.0.0"
  - [ ] description (>100 chars)
  - [ ] contact, license

- [ ] **Servers**
  - [ ] Production, Staging, Local URLs

- [ ] **Security**
  - [ ] BearerAuth (JWT)

- [ ] **Tags**
  - [ ] Users, Profiles, Settings, Health

- [ ] **Components/Schemas**
  - [ ] UserId (branded type)
  - [ ] User (full entity)
  - [ ] UserProfile, UserSettings
  - [ ] UserResponse, UserListResponse
  - [ ] AgentHints (v2.0.0 - all 11 required fields)
  - [ ] Error, Pagination, ResponseMetadata

- [ ] **CRUD Endpoints**
  - [ ] POST /users (create)
  - [ ] GET /users (list with pagination)
  - [ ] GET /users/{id} (get single)
  - [ ] PATCH /users/{id} (update with version)
  - [ ] DELETE /users/{id} (soft delete)

- [ ] **Custom Endpoints**
  - [ ] POST /users/authenticate
  - [ ] POST /users/logout
  - [ ] GET /users/{id}/settings
  - [ ] PATCH /users/{id}/settings/{key}

- [ ] **Health Endpoints**
  - [ ] GET /health (no auth)
  - [ ] GET /ready (no auth)

- [ ] **Response Examples**
  - [ ] Success responses (200, 201)
  - [ ] Error responses (400, 401, 403, 404, 409, 422, 429, 500)

- [ ] **Rate Limiting Headers**
  - [ ] X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset

---

### 3.2 Content Service API

**File:** `docs/api/content-service.openapi.yaml`

- [ ] **Info Section** (complete as above)
- [ ] **Servers** (3 environments)
- [ ] **Security** (BearerAuth)
- [ ] **Tags** (Cards, Decks, Categories, Templates, Health)

- [ ] **Components/Schemas**
  - [ ] CardId, DeckId, CategoryId (branded types)
  - [ ] Card (all 22 types), Deck, Category
  - [ ] CardContent, SchedulingData, KnowledgeGraphData
  - [ ] CardResponse, CardListResponse
  - [ ] DeckResponse, CategoryResponse
  - [ ] AgentHints v2.0.0
  - [ ] Error, Pagination, ResponseMetadata

- [ ] **Card Endpoints (CRUD + Custom)**
  - [ ] POST /cards
  - [ ] GET /cards
  - [ ] GET /cards/{id}
  - [ ] PATCH /cards/{id}
  - [ ] DELETE /cards/{id}
  - [ ] POST /cards/search (advanced search)
  - [ ] POST /cards/batch (batch operations)

- [ ] **Deck Endpoints**
  - [ ] POST /decks
  - [ ] GET /decks
  - [ ] GET /decks/{id}
  - [ ] PATCH /decks/{id}
  - [ ] DELETE /decks/{id}
  - [ ] POST /decks/{id}/cards (add card to deck)
  - [ ] DELETE /decks/{id}/cards/{cardId}

- [ ] **Category Endpoints**
  - [ ] POST /categories
  - [ ] GET /categories
  - [ ] GET /categories/{id}
  - [ ] GET /categories/{id}/tree (hierarchy)
  - [ ] PATCH /categories/{id}
  - [ ] DELETE /categories/{id}

- [ ] **Health Endpoints**
  - [ ] GET /health
  - [ ] GET /ready

- [ ] **Response Examples** (all endpoints)

---

### 3.3 Scheduler Service API

**File:** `docs/api/scheduler-service.openapi.yaml`

- [ ] **Info Section**
- [ ] **Components/Schemas**
  - [ ] SchedulingData, ReviewQueue
  - [ ] FSRSParams, SM2Params, LeitnerParams
  - [ ] ReviewQueueResponse
  - [ ] AgentHints v2.0.0

- [ ] **Endpoints**
  - [ ] GET /review-queue (get due cards)
  - [ ] POST /schedule/update (after review)
  - [ ] GET /schedule/predict (retention prediction)
  - [ ] GET /stats (scheduling statistics)

- [ ] **Health Endpoints**

- [ ] **Response Examples**

---

### 3.4 Session Service API

**File:** `docs/api/session-service.openapi.yaml`

- [ ] **Info Section**
- [ ] **Components/Schemas**
  - [ ] SessionId, Session, Attempt
  - [ ] SessionState enum
  - [ ] SessionResponse, AttemptResponse
  - [ ] AgentHints v2.0.0

- [ ] **Endpoints**
  - [ ] POST /sessions (start)
  - [ ] GET /sessions/{id}
  - [ ] PATCH /sessions/{id}/pause
  - [ ] PATCH /sessions/{id}/resume
  - [ ] POST /sessions/{id}/complete
  - [ ] POST /sessions/{id}/attempts (record attempt)
  - [ ] GET /sessions/{id}/attempts

- [ ] **Health Endpoints**

- [ ] **Response Examples**

---

### 3.5 Gamification Service API

**File:** `docs/api/gamification-service.openapi.yaml`

- [ ] **Info Section**
- [ ] **Components/Schemas**
  - [ ] XPEvent, Streak, Achievement
  - [ ] XPResponse, StreakResponse, AchievementResponse
  - [ ] AgentHints v2.0.0

- [ ] **Endpoints**
  - [ ] GET /xp (user's total XP)
  - [ ] GET /level (current level)
  - [ ] GET /streaks
  - [ ] POST /streaks/freeze
  - [ ] GET /achievements
  - [ ] GET /achievements/{id}
  - [ ] GET /leaderboard

- [ ] **Health Endpoints**

- [ ] **Response Examples**

---

### 3.6 Knowledge Graph Service API

**File:** `docs/api/knowledge-graph-service.openapi.yaml`

- [ ] **Info Section**
- [ ] **Components/Schemas**
  - [ ] NodeId, PKGNode, CKGNode
  - [ ] PKGEdge, CKGEdge
  - [ ] MutationDSL, MutationProposal
  - [ ] GraphQueryResponse
  - [ ] AgentHints v2.0.0

- [ ] **PKG Endpoints**
  - [ ] POST /pkg/nodes
  - [ ] POST /pkg/edges
  - [ ] GET /pkg/query
  - [ ] PATCH /pkg/nodes/{id}

- [ ] **CKG Endpoints**
  - [ ] POST /ckg/proposals (submit DSL)
  - [ ] GET /ckg/proposals/{id}
  - [ ] GET /ckg/query
  - [ ] GET /ckg/ontology

- [ ] **Health Endpoints**

- [ ] **Response Examples**

---

### 3.7 Metacognition Service API

**File:** `docs/api/metacognition-service.openapi.yaml`

- [ ] **Info Section**
- [ ] **Components/Schemas**
  - [ ] ThinkingTrace (7 frames)
  - [ ] FailureDiagnosis, PatchPlan
  - [ ] CalibrationMetrics
  - [ ] TraceResponse, DiagnosisResponse
  - [ ] AgentHints v2.0.0

- [ ] **Endpoints**
  - [ ] GET /telemetry
  - [ ] GET /traces/{id}
  - [ ] GET /diagnoses/{id}
  - [ ] GET /calibration

- [ ] **Health Endpoints**

- [ ] **Response Examples**

---

### 3.8 Strategy Service API

**File:** `docs/api/strategy-service.openapi.yaml`

- [ ] **Info Section**
- [ ] **Components/Schemas**
  - [ ] StrategyLoadout (6 policies)
  - [ ] LoadoutArchetype
  - [ ] StrategyEvaluation
  - [ ] LoadoutResponse
  - [ ] AgentHints v2.0.0

- [ ] **Endpoints**
  - [ ] GET /loadouts
  - [ ] GET /loadouts/{id}
  - [ ] POST /loadouts (create custom)
  - [ ] GET /archetypes (canonical loadouts)
  - [ ] POST /evaluate
  - [ ] POST /switch

- [ ] **Health Endpoints**

- [ ] **Response Examples**

---

### 3.9 Ingestion Service API

**File:** `docs/api/ingestion-service.openapi.yaml`

- [ ] **Info Section**
- [ ] **Components/Schemas**
  - [ ] IngestionJob, IngestionState
  - [ ] IngestionDocument, ContentUnit
  - [ ] CardDraft
  - [ ] JobResponse, DraftsResponse
  - [ ] AgentHints v2.0.0

- [ ] **Endpoints**
  - [ ] POST /jobs
  - [ ] GET /jobs/{id}
  - [ ] POST /jobs/{id}/upload
  - [ ] POST /jobs/{id}/parse
  - [ ] POST /jobs/{id}/transform
  - [ ] GET /jobs/{id}/drafts
  - [ ] POST /jobs/{id}/commit

- [ ] **Health Endpoints**

- [ ] **Response Examples**

---

### 3.10 Analytics Service API

**File:** `docs/api/analytics-service.openapi.yaml`

- [ ] **Info Section**
- [ ] **Components/Schemas**
  - [ ] Metrics, Dashboard, Report
  - [ ] InsightsResponse
  - [ ] AgentHints v2.0.0

- [ ] **Endpoints**
  - [ ] GET /metrics
  - [ ] GET /insights
  - [ ] POST /reports
  - [ ] GET /dashboards/{id}

- [ ] **Health Endpoints**

- [ ] **Response Examples**

---

### 3.11 Sync Service API

**File:** `docs/api/sync-service.openapi.yaml`

- [ ] **Info Section**
- [ ] **Components/Schemas**
  - [ ] SyncStatus, PendingChanges
  - [ ] ConflictResolution
  - [ ] SyncResponse
  - [ ] AgentHints v2.0.0

- [ ] **Endpoints**
  - [ ] POST /sync
  - [ ] GET /status
  - [ ] POST /resolve-conflict

- [ ] **Health Endpoints**

- [ ] **Response Examples**

---

### 3.12 Vector Service API

**File:** `docs/api/vector-service.openapi.yaml`

- [ ] **Info Section**
- [ ] **Components/Schemas**
  - [ ] Embedding, SearchResult
  - [ ] SearchResponse
  - [ ] AgentHints v2.0.0

- [ ] **Endpoints**
  - [ ] POST /search/semantic
  - [ ] POST /search/similar
  - [ ] POST /index

- [ ] **Health Endpoints**

- [ ] **Response Examples**

---

### 3.13 Notification Service API

**File:** `docs/api/notification-service.openapi.yaml`

- [ ] **Info Section**
- [ ] **Components/Schemas**
  - [ ] Notification, NotificationPreferences
  - [ ] NotificationResponse
  - [ ] AgentHints v2.0.0

- [ ] **Endpoints**
  - [ ] GET /notifications
  - [ ] PATCH /notifications/{id}/read
  - [ ] GET /preferences
  - [ ] PATCH /preferences

- [ ] **Health Endpoints**

- [ ] **Response Examples**

---

### 3.14 Media Service API

**File:** `docs/api/media-service.openapi.yaml`

- [ ] **Info Section**
- [ ] **Components/Schemas**
  - [ ] MediaAsset, ProcessingState
  - [ ] MediaResponse
  - [ ] AgentHints v2.0.0

- [ ] **Endpoints**
  - [ ] POST /upload
  - [ ] GET /assets/{id}
  - [ ] GET /assets/{id}/thumbnail
  - [ ] GET /assets/{id}/transcription
  - [ ] GET /assets/{id}/ocr

- [ ] **Health Endpoints**

- [ ] **Response Examples**

---

### 3.15 Collaboration Service API

**File:** `docs/api/collaboration-service.openapi.yaml`

- [ ] **Info Section**
- [ ] **Components/Schemas**
  - [ ] CollaborationRoom, Member
  - [ ] ChatMessage
  - [ ] RoomResponse
  - [ ] AgentHints v2.0.0

- [ ] **Endpoints**
  - [ ] POST /rooms
  - [ ] GET /rooms/{id}
  - [ ] POST /rooms/{id}/members
  - [ ] POST /rooms/{id}/messages
  - [ ] POST /rooms/{id}/share-deck

- [ ] **Health Endpoints**

- [ ] **Response Examples**

---

## 🧪 4. Contract Testing Framework

**Location:** `packages/contracts/tests/`

### 4.1 Contract Testing Setup

- [ ] **Install Pact or Similar**
  - [ ] Add @pact-foundation/pact to devDependencies
  - [ ] Configure pact broker URL
  - [ ] Setup CI/CD integration

- [ ] **Create Test Utilities**
  - [ ] File: `packages/contracts/tests/utils/pact-setup.ts`
  - [ ] Provider state setup
  - [ ] Mock data generators
  - [ ] Common matchers

---

### 4.2 Agent Contract Tests

**File:** `packages/contracts/tests/agents/`

For each agent (10 tests):

- [ ] **Learning Agent Contract Test**
  - [ ] Test selectNextCard contract
  - [ ] Test planSession contract
  - [ ] Verify AgentHints v2.0.0 structure
  - [ ] Verify required tools are called correctly

- [ ] **Diagnostic Agent Contract Test**
  - [ ] Test analyzeTrace contract
  - [ ] Test generatePatchPlan contract
  - [ ] Verify diagnosis structure
  - [ ] Verify patch plan structure

- [ ] **Strategy Agent Contract Test**
- [ ] **Content Generation Agent Contract Test**
- [ ] **Socratic Tutor Agent Contract Test**
- [ ] **Calibration Agent Contract Test**
- [ ] **Ingestion Agent Contract Test**
- [ ] **Knowledge Graph Agent Contract Test**
- [ ] **Taxonomy Curator Agent Contract Test**
- [ ] **Governance Agent Contract Test**

---

### 4.3 Service API Contract Tests

**File:** `packages/contracts/tests/services/`

For each service (15 tests):

- [ ] **User Service Contract Test**
  - [ ] Test POST /users (provider)
  - [ ] Test GET /users/{id} (provider)
  - [ ] Test PATCH /users/{id} (provider)
  - [ ] Verify response includes AgentHints v2.0.0
  - [ ] Verify response metadata structure
  - [ ] Verify pagination structure (list endpoints)
  - [ ] Verify error responses

- [ ] **Content Service Contract Test**
  - [ ] Test all CRUD endpoints
  - [ ] Test custom endpoints (search, batch)
  - [ ] Verify AgentHints in all 2xx responses

- [ ] **Scheduler Service Contract Test**
- [ ] **Session Service Contract Test**
- [ ] **Gamification Service Contract Test**
- [ ] **Knowledge Graph Service Contract Test**
- [ ] **Metacognition Service Contract Test**
- [ ] **Strategy Service Contract Test**
- [ ] **Ingestion Service Contract Test**
- [ ] **Analytics Service Contract Test**
- [ ] **Sync Service Contract Test**
- [ ] **Vector Service Contract Test**
- [ ] **Notification Service Contract Test**
- [ ] **Media Service Contract Test**
- [ ] **Collaboration Service Contract Test**

---

### 4.4 Event Contract Tests

**File:** `packages/contracts/tests/events/`

- [ ] **Event Schema Validation Tests**
  - [ ] Test all event types against Zod schemas
  - [ ] Test required fields validation
  - [ ] Test optional fields validation
  - [ ] Test field format validation (UUID, ISO 8601, etc.)

- [ ] **Event Naming Convention Tests**
  - [ ] Test aggregate.action pattern
  - [ ] Test lowercase enforcement
  - [ ] Test past tense enforcement

- [ ] **Event Metadata Tests**
  - [ ] Test required metadata fields
  - [ ] Test tracing fields (correlationId, causationId)
  - [ ] Test service information

- [ ] **Event Stream Tests**
  - [ ] Test stream naming convention
  - [ ] Test consumer group configuration
  - [ ] Test retention policies

---

### 4.5 AgentHints v2.0.0 Validation Tests

**File:** `packages/contracts/tests/agent-hints/`

- [ ] **Required Core Fields Tests**
  - [ ] suggestedNextActions (array, can be empty)
  - [ ] relatedResources (array, can be empty)
  - [ ] confidence (number, 0-1)

- [ ] **Enhanced Fields Tests (8 new required)**
  - [ ] sourceQuality (enum validation)
  - [ ] validityPeriod (enum validation)
  - [ ] contextNeeded (array)
  - [ ] assumptions (array)
  - [ ] riskFactors (array with proper structure)
  - [ ] dependencies (array with proper structure)
  - [ ] estimatedImpact (object with benefit/effort/roi)
  - [ ] preferenceAlignment (array with proper structure)

- [ ] **Optional Fields Tests**
  - [ ] reasoning (string)
  - [ ] warnings (array)
  - [ ] alternatives (array)
  - [ ] constraints (array)
  - [ ] metadata (object)

- [ ] **Validation Helper Tests**
  - [ ] Test validateAgentHints function
  - [ ] Test error messages
  - [ ] Test warning messages

---

## 📝 5. Documentation & Shared Types

### 5.1 Shared TypeScript Types

**Location:** `packages/types/src/`

- [ ] **Create Entity Types**
  - [ ] File: `packages/types/src/entities/`
  - [ ] card.ts (Card interface with all 22 types)
  - [ ] deck.ts, category.ts, user.ts
  - [ ] session.ts, attempt.ts
  - [ ] All entities with complete types

- [ ] **Create Branded ID Types**
  - [ ] File: `packages/types/src/ids.ts`
  - [ ] UserId, CardId, DeckId, CategoryId, etc.
  - [ ] Type branding helper functions

- [ ] **Create Enum Types**
  - [ ] File: `packages/types/src/enums.ts`
  - [ ] CardType, SessionState, FailureFamily, etc.
  - [ ] All domain enums

- [ ] **Create Value Object Types**
  - [ ] File: `packages/types/src/value-objects/`
  - [ ] CardContent, SchedulingData, KnowledgeGraphData
  - [ ] All immutable value objects

- [ ] **Export Everything**
  - [ ] File: `packages/types/src/index.ts`
  - [ ] Clean barrel exports
  - [ ] Organized by category

---

### 5.2 Contract Documentation

**Location:** `docs/contracts/`

- [ ] **Create Agent Contracts Guide**
  - [ ] File: `docs/contracts/AGENT_CONTRACTS_GUIDE.md`
  - [ ] Overview of all 10 agents
  - [ ] How to use each contract
  - [ ] Example usage for each
  - [ ] Common patterns

- [ ] **Create API Contracts Guide**
  - [ ] File: `docs/contracts/API_CONTRACTS_GUIDE.md`
  - [ ] Overview of all 15 services
  - [ ] How to read OpenAPI specs
  - [ ] How to generate clients
  - [ ] How to mock services

- [ ] **Create Event Contracts Guide**
  - [ ] File: `docs/contracts/EVENT_CONTRACTS_GUIDE.md`
  - [ ] Event sourcing patterns
  - [ ] Event naming conventions
  - [ ] Stream configuration
  - [ ] Consumer patterns

- [ ] **Create Contract Testing Guide**
  - [ ] File: `docs/contracts/CONTRACT_TESTING_GUIDE.md`
  - [ ] How to write contract tests
  - [ ] How to run contract tests
  - [ ] How to publish contracts
  - [ ] CI/CD integration

---

### 5.3 Generate Documentation

- [ ] **Generate API Docs from OpenAPI**
  - [ ] Setup Swagger UI for all 15 services
  - [ ] Setup Redoc for pretty documentation
  - [ ] Host at docs.noema.app/api/

- [ ] **Generate TypeScript Clients**
  - [ ] Setup openapi-generator
  - [ ] Generate TypeScript client for each service
  - [ ] Publish to `packages/clients/`

- [ ] **Generate Postman Collections**
  - [ ] Convert OpenAPI specs to Postman
  - [ ] Organize by service
  - [ ] Include examples and auth

---

## ✅ 6. Validation & Sign-off

### 6.1 Contract Validation

- [ ] **Validate All Agent Contracts**
  - [ ] All 10 agents have complete contracts
  - [ ] All required fields documented
  - [ ] All tool requirements specified
  - [ ] All examples provided

- [ ] **Validate All API Contracts**
  - [ ] All 15 services have OpenAPI specs
  - [ ] All specs are valid OpenAPI 3.1
  - [ ] All responses include AgentHints v2.0.0
  - [ ] All CRUD endpoints present
  - [ ] All health checks present

- [ ] **Validate All Event Schemas**
  - [ ] All event types documented
  - [ ] All Zod schemas created
  - [ ] All naming conventions followed
  - [ ] All stream configurations defined

- [ ] **Validate Contract Tests**
  - [ ] All contract tests written
  - [ ] All tests passing
  - [ ] Coverage >90% for contracts

---

### 6.2 Cross-Reference Check

- [ ] **Agent ↔ Service Contract Alignment**
  - [ ] Learning Agent uses correct Content Service endpoints
  - [ ] Diagnostic Agent uses correct Metacognition Service endpoints
  - [ ] All agent tool requirements match service capabilities

- [ ] **Event ↔ Service Contract Alignment**
  - [ ] Services publish events they claim to publish
  - [ ] Services subscribe to events they claim to consume
  - [ ] Event schemas match service expectations

- [ ] **Type Consistency Check**
  - [ ] All IDs are branded types
  - [ ] All enums match across contracts
  - [ ] All entities match shared types package

---

### 6.3 Documentation Review

- [ ] **Technical Review**
  - [ ] All contracts are technically sound
  - [ ] All schemas are complete
  - [ ] All examples work

- [ ] **Usability Review**
  - [ ] Documentation is clear
  - [ ] Examples are helpful
  - [ ] Guides are comprehensive

- [ ] **Consistency Review**
  - [ ] Naming is consistent
  - [ ] Patterns are consistent
  - [ ] Structure is consistent

---

### 6.4 Final Sign-off

- [ ] **Architecture Lead Approval**
  - [ ] All contracts align with architecture
  - [ ] All patterns are sound
  - [ ] Ready for implementation

- [ ] **Team Approval**
  - [ ] All team members understand contracts
  - [ ] All questions answered
  - [ ] Ready to begin Phase 1

- [ ] **Documentation Published**
  - [ ] All specs published to docs site
  - [ ] All clients generated
  - [ ] All teams have access

---

## 📊 Success Criteria

Phase 0 is complete when:

✅ **All 10 agent contracts** are fully defined with inputs, outputs, tools, and
examples  
✅ **All 15 service OpenAPI specs** are complete with all CRUD endpoints and
AgentHints v2.0.0  
✅ **All event schemas** are defined with Zod validation  
✅ **Contract testing framework** is setup and all tests pass  
✅ **Shared types package** exports all entities, IDs, and value objects  
✅ **Documentation** is complete and published  
✅ **Team sign-off** received

---

## 🎯 Deliverables

At the end of Phase 0, we have:

1. **10 Agent Contract Files** in `packages/contracts/src/agents/`
2. **15 OpenAPI Spec Files** in `docs/api/`
3. **14 Event Schema Files** in `packages/events/src/schemas/`
4. **Shared Types Package** in `packages/types/`
5. **Contract Test Suite** in `packages/contracts/tests/`
6. **Complete Documentation** in `docs/contracts/`
7. **Generated Clients** for all services
8. **Postman Collections** for manual testing

---

**NOTHING gets implemented until ALL contracts are defined and approved.**

This is the foundation. Get it right. 🎯
