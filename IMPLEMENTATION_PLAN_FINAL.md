# Noema Realignment — Final Implementation Plan

- **Date:** 2026-05-01
- **Source of truth:** `REALIGNMENT.md`
- **Supersedes:** `IMPLEMENTATION_PLAN.md` (Agent A draft) and
  `docs/plans/2026-05-01-noema-realignment-implementation-plan.md` (Agent B
  draft)
- **Posture:** Clean refactor. The app is unreleased. Stale APIs, enums,
  schemas, and UI are renamed or deleted directly. No long-term compatibility
  shims.
- **Repository root:** `C:\Users\anr\Apps\noema`

---

## 0. How to read this plan

Every section below is implementation work, written so the work can begin
top-to-bottom without further design rounds.

- **§1–§3** declare policy: what we keep, what we rename, what we delete.
- **§4** declares the canonical domain model with field-level detail and
  explicit ownership.
- **§5–§13** declare per-capability designs (eligibility, transformations,
  evaluation, triggers, strategy, guardian, scheduler, KG, gamification, web).
- **§14** assigns work to the Python `agents/` project.
- **§15** disposes of stale orchestration (cohort handshakes, schedule
  proposals).
- **§16** is the implementation order, batch by batch, with explicit acceptance
  tests and explicit deletes.
- **§17–§20** are tests, validation commands, success criteria, and risk
  register.

Wherever this plan and `REALIGNMENT.md` disagree, the spec wins. Wherever this
plan and the two prior drafts disagree, this plan wins.

---

## 1. Refactor stance

The product is still under development. Therefore:

- **Rename, don't alias.** When a concept changes, the old name is removed in
  the same change set as the new name lands.
- **Delete, don't deprecate.** Code paths that don't fit the target architecture
  are removed immediately, not left behind a flag.
- **Refactor schemas in place.** Where a Prisma model or column changes meaning,
  the migration replaces the field rather than adding a parallel one. Loss of
  historical dev data is acceptable.
- **No fallback UI.** The new 3-choice self-rating replaces the old 4-button
  grade UI in one shot. Old components are deleted.
- **Preserve product capabilities, not implementation shape.** The §11
  preservation list of `REALIGNMENT.md` is honored at the capability level
  (cards, modes, FSRS/HLR/SM-2/Leitner math, dual graphs, edge ontology,
  offline-first, settings, decks, categories, skill trees, badges) — not at the
  API/schema-shape level.
- **One source of truth per fact.** Evaluation lives in metacognition-service.
  Concept stability lives in knowledge-graph-service. Concept scheduling state
  lives in scheduler-service. Step queue lives in session-service. Validation
  lives in pedagogy-guardian-service. No fact has two owners.

---

## 2. Final service architecture

### 2.1 Existing services — kept and refactored

| Service                   | New responsibility                                                                                                                                                 |
| :------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `content-service`         | Cards, templates, media, **generated activity variants**, payload candidate query for Steps. Cards are no longer the runtime unit.                                 |
| `session-service`         | LessonPlans, Goals, Steps, Activities, Step queue, session lifecycle FSM, **strategy / replanning module**.                                                        |
| `metacognition-service`   | **Canonical Evaluation persistence**, 7-frame trace scoring, reasoning rolling averages, **Trigger emission**. Was empty (types only); now becomes a real service. |
| `scheduler-service`       | **Concept-first scheduling.** `ConceptScheduleState`, `ConceptQueueItem`, `ConceptTransformationHistory`. FSRS/HLR/SM-2/Leitner math kept internally.              |
| `knowledge-graph-service` | PKG/CKG, prerequisite gaps, **concept stability projection** (`stable                                                                                              | unstable`), state-change events. |
| `user-service`            | Identity, settings, learner profile inputs (thresholds: `S_RET`, `R_REAS`, etc.).                                                                                  |
| `hlr-sidecar`             | HLR math support — unchanged.                                                                                                                                      |

### 2.2 New services

| New service                 | Why it exists                                                                                                                                                                                                             |
| :-------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pedagogy-guardian-service` | Independent policy gate. Validates LessonPlans, Steps, Activities, replans, and generated variants from multiple producers (session, content, agents). Cannot live inside any of those because then it could be bypassed. |
| `gamification-service`      | Pure projection layer (XP, streaks, badges, capability tiers, Memory Integrity Score). **No source-of-truth state.** The existing `UserStreak` table is removed from session-service and re-derived here.                 |

### 2.3 Strategy stays inside session-service

Strategy mutates `LessonPlan` and `Step` in the same transaction as session
lifecycle. Splitting it forces network calls and distributed transactions for a
single aggregate. Implement under
`services/session-service/src/domain/strategy/`. Promote to its own service
later only if it gains independent durable state or independent scaling needs
(write an ADR if so).

### 2.4 Ingestion stays inside content-service for now

The realignment-mandated change is one event (`concepts.extracted`) and a
post-ingestion auto-curriculum hook. Both fit in
`services/content-service/src/domain/content-service/card-import.ts`. A
standalone `services/ingestion-service` is created only if a follow-up brings
full source-document orchestration (parsing, concept extraction, KG handoff).
This plan does not create one.

### 2.5 Agents (`agents/` Python project)

Hosts LLM-heavy components only:

- LessonPlan generator (proposes goals + Steps from a topic).
- Content Generation Agent (generates Activity variants per §6.6 of this plan).
- Mode preference helper (selects one mode from an eligible set when the
  deterministic rule needs an LLM tiebreaker — optional).

Everything else stays deterministic TypeScript:

- Eligibility-group routing
- Transformation cycling
- Combination formula
- Trigger detection rules
- Replanning level selector
- Pedagogy Guardian validation

---

## 3. Canonical rename / delete table

Every entry below is applied in **Batch 1** and is permanent. There are no
aliases.

### 3.1 Renames

| Stale name                                         | Target name                                                              |
| :------------------------------------------------- | :----------------------------------------------------------------------- |
| `TeachingApproach` (TS enum + types)               | `EpistemicMode`                                                          |
| `teachingApproach` (every field, schema, payload)  | `epistemicMode`                                                          |
| `TeachingApproachCategory`                         | `EpistemicModeCategory`                                                  |
| graph-service `InterventionType`                   | `MisconceptionInterventionType`                                          |
| (new) trigger-loop intervention enum               | `LearningInterventionType`                                               |
| `Card`-keyed `SchedulerCard` model                 | `ConceptScheduleState` (new schema, see §11)                             |
| Session card queue (`SessionQueueItem`)            | Step queue (`StepQueueItem`, see §4.4)                                   |
| `Attempt` (card-level row in session-service)      | Folded into `Step` + `Evaluation`. The `Attempt` table is dropped (§15). |
| `UserStreak` (in session-service)                  | `UserGamificationProjection` (in new gamification-service)               |
| Learner-facing "mastered" / "mastery" copy & types | "stable" / "stability" / `ConceptState`                                  |
| `loadout` UI surface (if it survives §10.4)        | `delivery_style` modifier under Strategy module                          |

### 3.2 Deletes (in the same change sets that introduce replacements)

| Deleted                                                                                                                                                                                | Replaced by                                                               |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------ |
| `apps/web/src/components/session/response-controls.tsx` (4-button grade UI)                                                                                                            | New `apps/web/src/components/session/self-rating-controls.tsx` (3-choice) |
| `apps/web/src/components/session/pre-answer-confidence.tsx` (if it conflicts with self-rating semantics)                                                                               | Remove unless re-purposed for trace `f0` capture                          |
| `services/session-service/prisma` `Attempt` model + table                                                                                                                              | Step + Evaluation pipeline                                                |
| `services/session-service/prisma` `SessionQueueItem`                                                                                                                                   | `StepQueueItem` keyed on `stepId`                                         |
| `services/session-service/prisma` `UserStreak`                                                                                                                                         | Gamification projection table                                             |
| `services/scheduler-service/prisma` `SchedulerCard`, `Review`, `CalibrationData` (card-centric)                                                                                        | `ConceptScheduleState`, `ConceptEvaluationLog`, `ConceptCalibrationData`  |
| `services/scheduler-service/prisma` `SessionCohortHandshake` / `ScheduleProposal` / `ScheduleCommit` / `ScheduleCohortLineage` / `SchedulerHandshakeState` (card-cohort orchestration) | The new closed loop replaces this protocol; see §15                       |
| `STANDARD` value in old `TeachingApproach` enum                                                                                                                                        | Removed; never imported in new code                                       |
| `Rating` enum **as a learner-facing concept**                                                                                                                                          | Kept as an internal scheduler value derived from `combinedScore`          |

### 3.3 Capabilities preserved (per spec §11) — implementation-shape may change

- All 22+ card types ✓ (renamed only where the rename clarifies)
- All 30 epistemic modes ✓ (renamed enum, dropped `STANDARD`)
- All 20 remediation card types ✓
- FSRS, HLR, SM-2, Leitner math ✓ (kept inside scheduler-service)
- 7-frame Mental Debugger ✓ (becomes the primary evaluator)
- Dual graphs (PKG/CKG), 7-layer guardrail stack, 5-layer reasoning ✓
- Decks and Categories ✓ (become `LessonPlan.sourceDecks`/`sourceCategories`)
- Skill trees, badges, achievements, Memory Integrity Score ✓ (become derived in
  gamification-service)
- Settings hierarchy, Last Known Good Configuration ✓
- CRDT islands, Bayesian belief dynamics, TLA+ verification ✓
- Microservice boundaries, event-driven architecture, offline-first sync ✓
- Strategy Loadouts ✓ (subordinated to Strategy module per §10.4 of spec)

---

## 4. Canonical domain model

All shapes below are the final shapes, implemented directly. All IDs are branded
strings (`@noema/types/branded-ids/`).

### 4.1 Shared enums (in `@noema/types`)

```ts
export const StudyMode = {
  LANGUAGE_LEARNING: 'language_learning',
  KNOWLEDGE_GAINING: 'knowledge_gaining',
} as const;

export const LearningMode = {
  EXPLORATION: 'exploration',
  GOAL_DRIVEN: 'goal_driven',
  EXAM_ORIENTED: 'exam_oriented',
  SYNTHESIS: 'synthesis',
} as const;

export const RigorLevel = { MINIMAL: 'minimal', FULL: 'full' } as const;

export const GoalType = {
  DISCRIMINATION: 'discrimination',
  REASONING: 'reasoning',
  TRANSFER: 'transfer',
  ACQUISITION: 'acquisition',
  REINFORCEMENT: 'reinforcement',
} as const;

export const GoalState = {
  PENDING: 'pending',
  ACTIVE: 'active',
  STABLE: 'stable',
  UNSTABLE: 'unstable',
} as const;

export const GoalSource = {
  SYSTEM_PROPOSED: 'system_proposed',
  USER_ACCEPTED: 'user_accepted',
  USER_EDITED: 'user_edited',
} as const;

export const EpistemicMode = {
  // I. Inquiry & Discovery
  INQUIRY_BASED: 'inquiry_based',
  PROBLEM_BASED: 'problem_based',
  CASE_BASED: 'case_based',
  // II. Error-Centered & Contradiction-Based
  LOOPHOLE_LEARNING: 'loophole_learning',
  ADVERSARIAL: 'adversarial',
  CONTRADICTION_EXPOSURE: 'contradiction_exposure',
  // III. Generative & Constructive
  GENERATIVE_RETRIEVAL: 'generative_retrieval',
  REVERSE_LEARNING: 'reverse_learning',
  TEACHING_TO_LEARN: 'teaching_to_learn',
  CONCEPT_RECOMBINATION: 'concept_recombination',
  // IV. Meta-Cognitive
  CONFIDENCE_WEIGHTED: 'confidence_weighted',
  PREDICTION_BASED: 'prediction_based',
  ERROR_PATTERN_REFLECTION: 'error_pattern_reflection',
  // V. Constraint-Based
  MINIMAL_INFORMATION: 'minimal_information',
  NO_DEFINITION: 'no_definition',
  DIMENSIONAL_TRANSLATION: 'dimensional_translation',
  // VI. Game-Theoretic & Dynamic
  ESCALATION: 'escalation',
  TIME_PRESSURE: 'time_pressure',
  AMBIGUITY_TOLERANCE: 'ambiguity_tolerance',
  // VII. Structural Knowledge
  GRAPH_COMPLETION: 'graph_completion',
  HIERARCHY_RECONSTRUCTION: 'hierarchy_reconstruction',
  CAUSAL_CHAIN_COMPLETION: 'causal_chain_completion',
  // VIII. Dialectical & Philosophical
  THESIS_ANTITHESIS_SYNTHESIS: 'thesis_antithesis_synthesis',
  COUNTERFACTUAL: 'counterfactual',
  // IX. Sensory & Representation
  MULTI_REPRESENTATION: 'multi_representation',
  PERTURBATION: 'perturbation',
  // X. Advanced Experimental
  ADAPTIVE_MISCONCEPTION_INJECTION: 'adaptive_misconception_injection',
  COGNITIVE_DRIFT_DETECTION: 'cognitive_drift_detection',
  KNOWLEDGE_COMPRESSION: 'knowledge_compression',
  EXPLAIN_YOUR_ALGORITHM: 'explain_your_algorithm',
} as const;
export type EpistemicMode = (typeof EpistemicMode)[keyof typeof EpistemicMode];
// 30 modes exactly. STANDARD is removed.

export const EligibilityGroup = {
  NEW_CONCEPT: 'new_concept',
  REINFORCEMENT: 'reinforcement',
  CONFUSION: 'confusion',
  WEAK_REASONING: 'weak_reasoning',
  TRANSFER: 'transfer',
  META: 'meta',
  PRESSURE: 'pressure',
} as const;

export const TransformationType = {
  RECALL: 'recall',
  EXPLANATION: 'explanation',
  COMPARISON: 'comparison',
  APPLICATION: 'application',
  PERTURBATION: 'perturbation',
  ERROR_DETECTION: 'error_detection',
} as const;

export const StepStatus = {
  PLANNED: 'planned',
  QUEUED: 'queued',
  PRESENTED: 'presented',
  ANSWERED: 'answered',
  EVALUATED: 'evaluated',
  SUPERSEDED: 'superseded',
  SKIPPED: 'skipped',
} as const;

export const StepSelfRating = {
  KNEW_IT: 'knew_it',
  HESITATED: 'hesitated',
  DIDNT_KNOW: 'didnt_know',
} as const;
export const SELF_RATING_TO_CONFIDENCE: Record<StepSelfRating, number> = {
  knew_it: 1.0,
  hesitated: 0.5,
  didnt_know: 0.0,
};

export const ConceptState = { STABLE: 'stable', UNSTABLE: 'unstable' } as const;

export const SessionLifecycleState = {
  PLANNING: 'planning',
  EXECUTION: 'execution',
  DIAGNOSIS: 'diagnosis',
  ADAPTATION: 'adaptation',
  EVALUATION: 'evaluation',
  COMPLETION: 'completion',
} as const;

export const TriggerType = {
  FAILURE: 'failure',
  CONFUSION: 'confusion',
  SLOW_THINKING: 'slow_thinking',
  OVERCONFIDENCE: 'overconfidence',
  BOREDOM: 'boredom',
  PREREQUISITE_GAP: 'prerequisite_gap',
} as const;

export const TriggerStatus = {
  OPEN: 'open',
  ADDRESSED: 'addressed',
  RECURRING: 'recurring',
} as const;

export const LearningInterventionType = {
  INSERT_REPAIR_STEP: 'insert_repair_step',
  INSERT_CONTRASTIVE_STEP: 'insert_contrastive_step',
  INSERT_CALIBRATION_STEP: 'insert_calibration_step',
  SWITCH_EPISTEMIC_MODE: 'switch_epistemic_mode',
  SWITCH_TRANSFORMATION: 'switch_transformation',
  CHANGE_ACTIVITY: 'change_activity',
  REDUCE_DIFFICULTY: 'reduce_difficulty',
  INCREASE_DIFFICULTY: 'increase_difficulty',
  TRANSITION_TO_TRANSFER: 'transition_to_transfer',
  BRANCH_TO_PREREQUISITE: 'branch_to_prerequisite',
} as const;

export const ReplanScope = {
  LOCAL: 'local',
  STRUCTURAL: 'structural',
  FULL: 'full',
} as const;

export const SchedulerQueue = {
  REPAIR: 'repair',
  REINFORCEMENT: 'reinforcement',
  NEW_LEARNING: 'new_learning',
} as const;

export const SchedulingAlgorithm = {
  FSRS: 'fsrs',
  HLR: 'hlr',
  SM2: 'sm2',
  LEITNER: 'leitner',
} as const;

// Internal scheduler rating. NOT a learner-facing UI value.
export const SchedulerRating = {
  AGAIN: 'again',
  HARD: 'hard',
  GOOD: 'good',
  EASY: 'easy',
} as const;
```

Branded IDs added: `LessonPlanId`, `GoalId`, `StepId`, `ActivityId`,
`EvaluationId`, `TriggerId`, `ConceptId`, `GeneratedVariantId`.

### 4.2 LessonPlan (owner: session-service)

```prisma
model LessonPlan {
  id                  String           @id @db.VarChar(50)
  sessionId           String           @unique @map("session_id") @db.VarChar(50)
  userId              String           @map("user_id") @db.VarChar(50)
  studyMode           StudyMode        @map("study_mode")
  learningMode        LearningMode     @map("learning_mode")
  rigorLevel          RigorLevel       @map("rigor_level")
  topic               String           @db.VarChar(500)
  prerequisites       Json             @default("[]")           // ConceptRef[]
  sourceDecks         Json             @default("[]") @map("source_decks")
  sourceCategories    Json             @default("[]") @map("source_categories")
  assessmentStrategy  String?          @map("assessment_strategy") @db.VarChar(2000)
  adaptationRules    String?           @map("adaptation_rules") @db.VarChar(2000)
  guardianValidationId String?         @map("guardian_validation_id") @db.VarChar(50)
  state               LessonPlanState  @default(DRAFT)
  createdAt           DateTime         @default(now()) @map("created_at")
  updatedAt           DateTime         @updatedAt @map("updated_at")
  version             Int              @default(1)

  goals               LessonPlanGoal[]
  steps               Step[]
  session             Session          @relation(fields: [sessionId], references: [id])

  @@index([userId, state])
  @@map("lesson_plans")
}
enum LessonPlanState { DRAFT VALIDATED ACTIVE COMPLETED ABANDONED @@map("lesson_plan_state") }
```

Rules:

- Exactly one LessonPlan per session.
- Review sessions get `rigorLevel = MINIMAL` and `goals = []`.
- Goal-driven sessions get `rigorLevel = FULL`. The Pedagogy Guardian validates
  these before activation (§10).
- Maximum 4 active goals enforced at the API boundary.

### 4.3 LessonPlanGoal (owner: session-service)

```prisma
model LessonPlanGoal {
  id            String     @id @db.VarChar(50)
  lessonPlanId  String     @map("lesson_plan_id") @db.VarChar(50)
  description   String     @db.VarChar(1000)
  type          GoalType
  parentGoalId  String?    @map("parent_goal_id") @db.VarChar(50)
  state         GoalState  @default(PENDING)
  source        GoalSource @default(SYSTEM_PROPOSED)
  conceptRefs   String[]   @map("concept_refs")
  createdAt     DateTime   @default(now()) @map("created_at")
  updatedAt     DateTime   @updatedAt @map("updated_at")
  lessonPlan    LessonPlan @relation(fields: [lessonPlanId], references: [id])
  @@index([lessonPlanId, state])
  @@map("lesson_plan_goals")
}
```

A Goal becomes `STABLE` only when **every** concept in `conceptRefs` is
currently `stable` per the KG projection (§12). It flips to `UNSTABLE` if any
concept regresses.

### 4.4 Step (owner: session-service)

```prisma
model Step {
  id                  String              @id @db.VarChar(50)
  lessonPlanId        String              @map("lesson_plan_id") @db.VarChar(50)
  sessionId           String              @map("session_id") @db.VarChar(50)
  userId              String              @map("user_id") @db.VarChar(50)
  studyMode           StudyMode           @map("study_mode")
  position            Int
  objective           String              @db.VarChar(1000)
  servesGoalIds       String[]            @map("serves_goal_ids")
  eligibleModes       String[]            @map("eligible_modes")    // EpistemicMode[]
  selectedMode        String              @map("selected_mode") @db.VarChar(100)  // EpistemicMode
  transformationType  TransformationType  @map("transformation_type")
  expectedOutcome     String              @db.VarChar(2000)
  evaluationType      String              @map("evaluation_type") @db.VarChar(100)
  difficulty          Float
  isRepair            Boolean             @default(false) @map("is_repair")
  conceptRefs         String[]            @map("concept_refs")
  variantSeed         String              @map("variant_seed") @db.VarChar(100)
  status              StepStatus          @default(PLANNED)
  evaluationId        String?             @unique @map("evaluation_id") @db.VarChar(50)
  guardianValidationId String?            @map("guardian_validation_id") @db.VarChar(50)
  presentedAt         DateTime?           @map("presented_at")
  answeredAt          DateTime?           @map("answered_at")
  evaluatedAt         DateTime?           @map("evaluated_at")
  supersededByStepId  String?             @map("superseded_by_step_id") @db.VarChar(50)
  createdAt           DateTime            @default(now()) @map("created_at")
  updatedAt           DateTime            @updatedAt @map("updated_at")
  version             Int                 @default(1)

  lessonPlan          LessonPlan          @relation(fields: [lessonPlanId], references: [id])
  activities          Activity[]
  queueItem           StepQueueItem?

  @@index([sessionId, position])
  @@index([userId, evaluatedAt])
  @@index([conceptRefs], type: Gin)
  @@map("steps")
}
```

Rules:

- Once `EVALUATED`, a Step is immutable. Replans **supersede** (set
  `supersededByStepId`) and insert new Steps, never edit completed ones.
- A repair Step **must** differ from the failed Step on at least one of:
  `selectedMode`, `transformationType`, `activities[*].contentSource`,
  `difficulty`, or it must be on a prerequisite concept. Pedagogy Guardian
  enforces.

### 4.5 StepQueueItem (owner: session-service)

```prisma
model StepQueueItem {
  id        String           @id @db.VarChar(50)
  sessionId String           @map("session_id") @db.VarChar(50)
  stepId    String           @unique @map("step_id") @db.VarChar(50)
  position  Int
  status    StepQueueStatus  @default(PENDING)
  injectedBy String?         @map("injected_by") @db.VarChar(100)
  reason    String?          @db.VarChar(500)
  createdAt DateTime         @default(now()) @map("created_at")
  updatedAt DateTime         @updatedAt @map("updated_at")
  step      Step             @relation(fields: [stepId], references: [id])
  @@index([sessionId, position])
  @@index([sessionId, status])
  @@map("step_queue_items")
}
enum StepQueueStatus { PENDING PRESENTED COMPLETED SKIPPED INJECTED @@map("step_queue_status") }
```

Replaces the legacy `SessionQueueItem`.

### 4.6 Activity (owner: session-service for runtime; content-service owns payload sources)

```prisma
model Activity {
  id                  String   @id @db.VarChar(50)
  stepId              String   @map("step_id") @db.VarChar(50)
  position            Int
  contentSourceType   ActivityContentSourceType @map("content_source_type")
  cardId              String?  @map("card_id") @db.VarChar(50)
  templateId          String?  @map("template_id") @db.VarChar(50)
  generatedVariantId  String?  @map("generated_variant_id") @db.VarChar(50)
  prompt              String   @db.VarChar(8000)
  renderPayload       Json     @default("{}") @map("render_payload")
  expectedResponseType String  @map("expected_response_type") @db.VarChar(100)
  responseSchema      Json     @default("{}") @map("response_schema")
  variantSeed         String   @map("variant_seed") @db.VarChar(100)
  generationFallbackReason String? @map("generation_fallback_reason") @db.VarChar(500)
  step                Step     @relation(fields: [stepId], references: [id])
  @@index([stepId, position])
  @@map("activities")
}
enum ActivityContentSourceType { CARD TEMPLATE GENERATED @@map("activity_content_source_type") }
```

There is no `Step.fallbackCardId`. Direct card presentation is just an Activity
with `contentSourceType=CARD`.

### 4.7 Session (owner: session-service) — refactored

```prisma
model Session {
  id              String                 @id @db.VarChar(50)
  userId          String                 @map("user_id") @db.VarChar(50)
  studyMode       StudyMode              @map("study_mode")
  learningMode    LearningMode           @map("learning_mode")
  lifecycleState  SessionLifecycleState  @default(PLANNING) @map("lifecycle_state")
  config          Json                   @default("{}")
  stats           Json                   @default("{}")
  pauseCount      Int                    @default(0) @map("pause_count")
  totalPausedMs   Int                    @default(0) @map("total_paused_ms")
  startedAt       DateTime               @default(now()) @map("started_at")
  lastActivityAt  DateTime               @default(now()) @map("last_activity_at")
  completedAt     DateTime?              @map("completed_at")
  terminationReason String?              @map("termination_reason") @db.VarChar(50)
  createdAt       DateTime               @default(now()) @map("created_at")
  updatedAt       DateTime               @updatedAt @map("updated_at")
  version         Int                    @default(1)

  lessonPlan      LessonPlan?
  queueItems      StepQueueItem[]

  @@index([userId, lifecycleState])
  @@index([userId, studyMode, completedAt])
  @@map("sessions")
}
```

The legacy `state SessionState` field is removed in the same migration. The
legacy `Attempt`, `SessionQueueItem`, `SessionCohortHandshake`, and `UserStreak`
tables are dropped (§15).

### 4.8 Evaluation (owner: metacognition-service)

```prisma
model Evaluation {
  id                 String   @id @db.VarChar(50)
  stepId             String   @unique @map("step_id") @db.VarChar(50)
  sessionId          String   @map("session_id") @db.VarChar(50)
  lessonPlanId       String   @map("lesson_plan_id") @db.VarChar(50)
  userId             String   @map("user_id") @db.VarChar(50)
  studyMode          StudyMode @map("study_mode")
  conceptRefs        String[] @map("concept_refs")
  epistemicMode      String   @map("epistemic_mode") @db.VarChar(100)
  transformationType String   @map("transformation_type") @db.VarChar(50)
  correct            Boolean
  correctnessScore   Float    @map("correctness_score")     // [0,1]
  selfRating         StepSelfRating @map("self_rating")
  confidenceSignal   Float    @map("confidence_signal")     // 0.0 / 0.5 / 1.0
  trace              Json                                    // SevenFrameTrace
  reasoningQuality   Float    @map("reasoning_quality")     // [0,1]
  combinedScore      Float    @map("combined_score")        // [0,1]
  schedulerRating    SchedulerRating @map("scheduler_rating")
  responseTimeMs     Int      @map("response_time_ms")
  hintRequestCount   Int      @default(0) @map("hint_request_count")
  revisionCount      Int      @default(0) @map("revision_count")
  errorType          String?  @map("error_type") @db.VarChar(100)
  misconceptionRef   String?  @map("misconception_ref") @db.VarChar(50)
  triggerIds         String[] @map("trigger_ids")
  recommendedAction  String?  @map("recommended_action") @db.VarChar(2000)
  createdAt          DateTime @default(now()) @map("created_at")
  @@index([userId, createdAt])
  @@index([userId, conceptRefs], type: Gin)
  @@map("evaluations")
}
```

Session-service does **not** persist Evaluation. It stores only
`Step.evaluationId` and a small denormalized view (`reasoningQuality`,
`combinedScore`, `correct`) for offline replay and session history rendering.

### 4.9 MetacognitiveTrigger (owner: metacognition-service)

```prisma
model MetacognitiveTrigger {
  id                       String       @id @db.VarChar(50)
  userId                   String       @map("user_id") @db.VarChar(50)
  sessionId                String?      @map("session_id") @db.VarChar(50)
  stepId                   String?      @map("step_id") @db.VarChar(50)
  evaluationId             String?      @map("evaluation_id") @db.VarChar(50)
  type                     TriggerType
  severity                 Float
  detectedFromFrames       String[]     @map("detected_from_frames")
  conceptRefs              String[]     @map("concept_refs")
  recommendedIntervention  LearningInterventionType @map("recommended_intervention")
  status                   TriggerStatus @default(OPEN)
  misconceptionRef         String?      @map("misconception_ref") @db.VarChar(50)
  createdAt                DateTime     @default(now()) @map("created_at")
  updatedAt                DateTime     @updatedAt @map("updated_at")
  @@index([userId, status])
  @@index([sessionId])
  @@map("metacognitive_triggers")
}

model ConceptReasoningRollup {
  userId              String   @map("user_id") @db.VarChar(50)
  conceptId           String   @map("concept_id") @db.VarChar(50)
  studyMode           StudyMode @map("study_mode")
  windowSize          Int      @default(10) @map("window_size")
  averageReasoning    Float    @map("average_reasoning")
  sampleCount         Int      @default(0) @map("sample_count")
  lastEvaluationAt    DateTime @map("last_evaluation_at")
  recentEvaluationIds String[] @map("recent_evaluation_ids")
  updatedAt           DateTime @updatedAt @map("updated_at")
  @@id([userId, conceptId, studyMode])
  @@map("concept_reasoning_rollups")
}
```

### 4.10 ConceptScheduleState (owner: scheduler-service)

```prisma
model ConceptScheduleState {
  userId             String              @map("user_id") @db.VarChar(50)
  conceptId          String              @map("concept_id") @db.VarChar(50)
  studyMode          StudyMode           @map("study_mode")
  algorithm          SchedulingAlgorithm @default(FSRS)
  queue              SchedulerQueue      @default(NEW_LEARNING)
  dueAt              DateTime            @map("due_at")
  stability          Float?
  difficulty         Float?
  halfLife           Float?              @map("half_life")
  intervalDays       Float               @default(0) @map("interval_days")
  reviewCount        Int                 @default(0) @map("review_count")
  lapseCount         Int                 @default(0) @map("lapse_count")
  consecutiveCorrect Int                 @default(0) @map("consecutive_correct")
  lastEvaluationId   String?             @map("last_evaluation_id") @db.VarChar(50)
  lastStepId         String?             @map("last_step_id") @db.VarChar(50)
  suspendedUntil     DateTime?           @map("suspended_until")
  suspendedReason    String?             @map("suspended_reason") @db.VarChar(255)
  createdAt          DateTime            @default(now()) @map("created_at")
  updatedAt          DateTime            @updatedAt @map("updated_at")
  version            Int                 @default(1)
  @@id([userId, conceptId, studyMode])
  @@index([userId, dueAt])
  @@index([userId, studyMode, queue, dueAt])
  @@map("concept_schedule_state")
}

model ConceptEvaluationLog {
  id                 String   @id @db.VarChar(50)
  userId             String   @map("user_id") @db.VarChar(50)
  conceptId          String   @map("concept_id") @db.VarChar(50)
  studyMode          StudyMode @map("study_mode")
  evaluationId       String   @map("evaluation_id") @db.VarChar(50)
  stepId             String   @map("step_id") @db.VarChar(50)
  algorithm          SchedulingAlgorithm
  schedulerRating    SchedulerRating @map("scheduler_rating")
  combinedScore      Float    @map("combined_score")
  priorState         Json     @map("prior_state")
  newState           Json     @map("new_state")
  reviewedAt         DateTime @map("reviewed_at")
  createdAt          DateTime @default(now()) @map("created_at")
  @@unique([evaluationId])
  @@index([userId, conceptId, reviewedAt])
  @@map("concept_evaluation_log")
}

model ConceptCalibrationData {
  userId       String              @map("user_id") @db.VarChar(50)
  studyMode    StudyMode           @map("study_mode")
  conceptId    String?             @map("concept_id") @db.VarChar(50)
  algorithm    SchedulingAlgorithm
  parameters   Json
  sampleCount  Int                 @default(0) @map("sample_count")
  confidence   Float               @default(0.5)
  lastTrainedAt DateTime?          @map("last_trained_at")
  createdAt    DateTime            @default(now()) @map("created_at")
  updatedAt    DateTime            @updatedAt @map("updated_at")
  @@id([userId, studyMode, algorithm, conceptId])
  @@map("concept_calibration_data")
}

model ConceptTransformationHistory {
  userId         String              @map("user_id") @db.VarChar(50)
  conceptId      String              @map("concept_id") @db.VarChar(50)
  studyMode      StudyMode           @map("study_mode")
  transformation TransformationType
  usedAt         DateTime            @map("used_at")
  evaluationId   String              @map("evaluation_id") @db.VarChar(50)
  @@id([userId, conceptId, studyMode, transformation, usedAt])
  @@index([userId, conceptId, studyMode, usedAt])
  @@map("concept_transformation_history")
}
```

The legacy `SchedulerCard`, `Review`, `CalibrationData`, `ScheduleProposal`,
`ScheduleCommit`, `ScheduleCohortLineage`, `SchedulerHandshakeState`,
`SchedulerEventInbox` tables are dropped in the same migration that creates the
above. See §15.

### 4.11 ConceptStateProjection (owner: knowledge-graph-service)

```prisma
model ConceptStateProjection {
  userId             String       @map("user_id") @db.VarChar(50)
  conceptId          String       @map("concept_id") @db.VarChar(50)
  studyMode          StudyMode    @map("study_mode")
  state              ConceptState @default(UNSTABLE)
  fsrsStability      Float?       @map("fsrs_stability")
  reasoningAverage   Float?       @map("reasoning_average")
  evidenceWindow     Int          @default(10) @map("evidence_window")
  lastEvaluationId   String?      @map("last_evaluation_id") @db.VarChar(50)
  lastChangedAt      DateTime?    @map("last_changed_at")
  attemptsSinceStable Int         @default(0) @map("attempts_since_stable")
  computedAt         DateTime     @default(now()) @map("computed_at")
  updatedAt          DateTime     @updatedAt @map("updated_at")
  @@id([userId, conceptId, studyMode])
  @@index([userId, state])
  @@map("concept_state_projection")
}

model ConceptStateHistory {
  id          String       @id @db.VarChar(50)
  userId      String       @map("user_id") @db.VarChar(50)
  conceptId   String       @map("concept_id") @db.VarChar(50)
  studyMode   StudyMode    @map("study_mode")
  fromState   ConceptState @map("from_state")
  toState     ConceptState @map("to_state")
  triggeredBy String       @map("triggered_by") @db.VarChar(100)  // 'evaluation' | 'recompute' | 'manual'
  evaluationId String?     @map("evaluation_id") @db.VarChar(50)
  createdAt   DateTime     @default(now()) @map("created_at")
  @@index([userId, conceptId, createdAt])
  @@map("concept_state_history")
}
```

The PKG concept node in Neo4j also gets a `state` property maintained by the
same recompute job.

### 4.12 GeneratedActivityVariant (owner: content-service)

```prisma
model GeneratedActivityVariant {
  id                   String              @id @db.VarChar(50)
  conceptId            String              @map("concept_id") @db.VarChar(50)
  studyMode            StudyMode           @map("study_mode")
  transformationType   TransformationType  @map("transformation_type")
  epistemicMode        String              @map("epistemic_mode") @db.VarChar(100)
  difficultyBucket     Int                 @map("difficulty_bucket")    // 0..4
  sourceCardIds        String[]            @map("source_card_ids")
  prompt               String              @db.VarChar(8000)
  renderPayload        Json                @map("render_payload")
  expectedResponseType String              @map("expected_response_type") @db.VarChar(100)
  responseSchema       Json                @map("response_schema")
  variantSeed          String              @map("variant_seed") @db.VarChar(100)
  generatorMetadata    Json                @map("generator_metadata")    // model, prompt rev, tokens, cost
  guardianValidationId String              @map("guardian_validation_id") @db.VarChar(50)
  ttlAt                DateTime            @map("ttl_at")
  hitCount             Int                 @default(0) @map("hit_count")
  createdAt            DateTime            @default(now()) @map("created_at")
  @@unique([conceptId, transformationType, epistemicMode, difficultyBucket, variantSeed])
  @@index([ttlAt])
  @@map("generated_activity_variants")
}
```

### 4.13 Card additions (owner: content-service)

```prisma
model Card {
  // existing fields ...
  compatibleTransformations  TransformationType[] @default([]) @map("compatible_transformations")
  defaultEligibilityGroups   String[]             @default([]) @map("default_eligibility_groups")
  supportedStudyModes        StudyMode[]          @default([KNOWLEDGE_GAINING]) @map("supported_study_modes")
}
```

A backfill script seeds `compatibleTransformations` from `cardType` (mapping in
§6.1). Cards without transformation compatibility are rejected at create-time
after Batch 3 lands.

### 4.14 GuardianValidation (owner: pedagogy-guardian-service)

```prisma
model GuardianValidation {
  id            String              @id @db.VarChar(50)
  artifactType  GuardianArtifactType @map("artifact_type")
  artifactId    String              @map("artifact_id") @db.VarChar(50)
  artifactHash  String              @map("artifact_hash") @db.VarChar(128)
  result        GuardianResult
  reasonCodes   String[]            @map("reason_codes")
  blocking      Boolean             @default(false)
  evaluatedRules Json               @map("evaluated_rules")
  triggeredBy   String              @map("triggered_by") @db.VarChar(100)
  createdAt     DateTime            @default(now()) @map("created_at")
  @@index([artifactType, artifactId, createdAt])
  @@map("guardian_validations")
}
enum GuardianArtifactType { LESSON_PLAN STEP ACTIVITY REPLAN GENERATED_VARIANT @@map("guardian_artifact_type") }
enum GuardianResult { ACCEPTED WARNING REJECTED @@map("guardian_result") }
```

### 4.15 UserGamificationProjection (owner: gamification-service)

```prisma
model UserGamificationProjection {
  userId           String   @id @map("user_id") @db.VarChar(50)
  studyMode        StudyMode @map("study_mode")
  xp               Int      @default(0)
  level            Int      @default(1)
  currentStreak    Int      @default(0) @map("current_streak")
  longestStreak    Int      @default(0) @map("longest_streak")
  lastStreakDate   DateTime? @map("last_streak_date") @db.Date
  capabilityTier   Int      @default(1) @map("capability_tier")
  memoryIntegrity  Float    @default(0) @map("memory_integrity_score")
  lastComputedAt   DateTime @map("last_computed_at")
  @@map("user_gamification_projection")
}

model AchievementCache {
  userId        String   @map("user_id") @db.VarChar(50)
  achievementId String   @map("achievement_id") @db.VarChar(100)
  conceptRef    String?  @map("concept_ref") @db.VarChar(50)   // for stability badges
  earnedAt      DateTime @map("earned_at")
  revokedAt     DateTime? @map("revoked_at")
  @@id([userId, achievementId, conceptRef])
  @@map("achievement_cache")
}
```

These are projections only. Every value is recomputable from event replay. No
"permanent achievement" rows exist anywhere.

---

## 5. Epistemic mode eligibility (full 30-mode mapping)

`packages/types/src/eligibility/mode-groups.ts`. Modes may belong to multiple
groups, per spec §4.1.

| Mode                               | Groups                                |
| :--------------------------------- | :------------------------------------ |
| `inquiry_based`                    | NEW_CONCEPT, TRANSFER                 |
| `problem_based`                    | NEW_CONCEPT, TRANSFER                 |
| `case_based`                       | NEW_CONCEPT, TRANSFER                 |
| `loophole_learning`                | CONFUSION, WEAK_REASONING             |
| `adversarial`                      | CONFUSION, WEAK_REASONING, PRESSURE   |
| `contradiction_exposure`           | CONFUSION, WEAK_REASONING             |
| `generative_retrieval`             | REINFORCEMENT, WEAK_REASONING         |
| `reverse_learning`                 | WEAK_REASONING, META                  |
| `teaching_to_learn`                | WEAK_REASONING, META                  |
| `concept_recombination`            | TRANSFER, WEAK_REASONING              |
| `confidence_weighted`              | REINFORCEMENT, META                   |
| `prediction_based`                 | REINFORCEMENT, META                   |
| `error_pattern_reflection`         | CONFUSION, WEAK_REASONING, META       |
| `minimal_information`              | NEW_CONCEPT, WEAK_REASONING           |
| `no_definition`                    | NEW_CONCEPT, WEAK_REASONING           |
| `dimensional_translation`          | TRANSFER, WEAK_REASONING              |
| `escalation`                       | PRESSURE, REINFORCEMENT               |
| `time_pressure`                    | PRESSURE, REINFORCEMENT               |
| `ambiguity_tolerance`              | META, TRANSFER                        |
| `graph_completion`                 | TRANSFER, WEAK_REASONING              |
| `hierarchy_reconstruction`         | TRANSFER, WEAK_REASONING, CONFUSION   |
| `causal_chain_completion`          | TRANSFER, WEAK_REASONING, CONFUSION   |
| `thesis_antithesis_synthesis`      | TRANSFER, META                        |
| `counterfactual`                   | TRANSFER, CONFUSION                   |
| `multi_representation`             | NEW_CONCEPT, TRANSFER, WEAK_REASONING |
| `perturbation`                     | TRANSFER, CONFUSION                   |
| `adaptive_misconception_injection` | CONFUSION, WEAK_REASONING             |
| `cognitive_drift_detection`        | META, WEAK_REASONING                  |
| `knowledge_compression`            | REINFORCEMENT, META, WEAK_REASONING   |
| `explain_your_algorithm`           | META, WEAK_REASONING                  |

Coverage: every group has ≥3 modes; every mode has ≥1 group. A unit test fails
if either invariant breaks.

Selection rule (`packages/types/src/eligibility/select.ts`):

```ts
export function selectEligibleGroup(s: {
  conceptIsNew: boolean;
  conceptState: ConceptState;
  reasoningQualityRecent: number;
  attemptsSinceStable: number;
  lastTriggerType?: TriggerType;
  thresholds: { R_REAS: number; N_TRANSFER: number };
}): EligibilityGroup {
  if (s.lastTriggerType === 'confusion') return 'confusion';
  if (s.lastTriggerType === 'overconfidence') return 'meta';
  if (s.lastTriggerType === 'slow_thinking') return 'meta';
  if (
    s.conceptState === 'unstable' &&
    s.reasoningQualityRecent < s.thresholds.R_REAS
  )
    return 'weak_reasoning';
  if (
    s.conceptState === 'stable' &&
    s.attemptsSinceStable > s.thresholds.N_TRANSFER
  )
    return 'transfer';
  if (s.conceptIsNew) return 'new_concept';
  return 'reinforcement';
}
```

Mode pick (within a group): least-recently-used for the (concept, learner) pair,
with deterministic tiebreak by mode key.

---

## 6. Transformation cycling

### 6.1 Card type → default `compatibleTransformations`

| Card type group                                                                                                                                              | Transformations            |
| :----------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------- |
| `ATOMIC, CLOZE, DEFINITION, MULTIPLE_CHOICE, TRUE_FALSE, MATCHING, ORDERING, DIAGRAM, IMAGE_OCCLUSION, AUDIO, MULTIMODAL`                                    | `RECALL`                   |
| `PROCESS, CASE_BASED, TRANSFER, PROGRESSIVE_DISCLOSURE`                                                                                                      | `APPLICATION`              |
| `COMPARISON, CONTRASTIVE_PAIR, MINIMAL_PAIR, FALSE_FRIEND, OLD_VS_NEW_DEFINITION, DISCRIMINANT_FEATURE, CONFUSABLE_SET_DRILL`                                | `COMPARISON`               |
| `EXCEPTION, BOUNDARY_CASE, RULE_SCOPE, COUNTEREXAMPLE, ASSUMPTION_CHECK`                                                                                     | `PERTURBATION`             |
| `ERROR_SPOTTING, AVAILABILITY_BIAS_DISCONFIRMATION, OVERWRITE_DRILL, PARTIAL_KNOWLEDGE_DECOMPOSITION`                                                        | `ERROR_DETECTION`          |
| `CONFIDENCE_RATED, CALIBRATION_TRAINING, SELF_CHECK_RITUAL, ATTRIBUTION_REFRAMING, STRATEGY_REMINDER, RETRIEVAL_CUE, ENCODING_REPAIR, REPRESENTATION_SWITCH` | `EXPLANATION`              |
| `CAUSE_EFFECT, CONCEPT_GRAPH, TIMELINE`                                                                                                                      | `EXPLANATION + COMPARISON` |

### 6.2 Selector

```ts
function selectTransformation(
  history: ConceptTransformationHistory[]
): TransformationType {
  const usedRecently = lastK(history, 3).map((h) => h.transformation);
  let eligible = ALL_TRANSFORMATIONS.filter((t) => !usedRecently.includes(t));
  if (eligible.length === 0) eligible = ALL_TRANSFORMATIONS;
  return leastRecentlyUsed(eligible, history); // deterministic tiebreak
}
```

A repair Step **must** pick a transformation different from the failed Step's.
Pedagogy Guardian enforces.

### 6.3 Generation flow

1. Scheduler picks concept C due for learner L, returns recommended
   `transformationType T`.
2. Eligibility group selected per §5.
3. Mode `M` picked from the eligible set (LRU per concept per learner).
4. Content Generation Agent (Python) calls
   `content-service.getActivityPayloadCandidates({conceptId: C, transformation: T, eligibilityGroup, epistemicMode: M, difficulty})`.
5. Variant is constructed (LLM prompt) with
   `variantSeed = sha256(C|T|M|difficultyBucket|nonce)`.
6. Variant is cached in `GeneratedActivityVariant` with TTL (default 30 days).
7. Step + Activities are written by session-service.
8. Pedagogy Guardian validates Step **and** Activity (calls `validateStep` and
   `validateGeneratedVariant`).
9. Step enters Step queue.

### 6.4 Fallback

- If generation fails or `cost_today > NOEMA_GENERATION_DAILY_USD_CAP`: fall
  back to direct card presentation. Activity is written with
  `contentSourceType=CARD` and `generationFallbackReason` populated.
- If no compatible card exists for `(conceptId, transformation)`: fall back to a
  different transformation (next best per LRU) and emit
  `content.generation.transformation_substituted`.

---

## 7. Evaluation algorithm

All implemented in `services/metacognition-service/src/domain/`.

### 7.1 Self-rating → confidence signal

| `selfRating` | `confidenceSignal` |
| :----------- | :----------------: |
| `KNEW_IT`    |        1.0         |
| `HESITATED`  |        0.5         |
| `DIDNT_KNOW` |        0.0         |

### 7.2 7-frame trace contract

Every Step answer must include a structured trace with all seven frames. The
frames are the existing ones in
`services/metacognition-service/src/types/mental-debugger.ts`:

`f0 context_intent | f1 task_parsing | f2 cue_selection | f3 retrieval_generation | f4 reasoning_transformation | f5 commitment_monitoring | f6 outcome_attribution`.

Frames the learner cannot fill (e.g., `f6`) are filled by deterministic post-hoc
inference (using outcome and timing) and marked `inferred: true`.

### 7.3 Per-frame reasoning scoring (deterministic, configurable)

| Frame | Default weight | Signals                                                                                                                                                                                            |
| :---- | :------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `f0`  |      0.05      | goal_type vs prompt_focus alignment; stakes_mode appropriateness                                                                                                                                   |
| `f1`  |      0.10      | presence-handling of negation/quantifier/conditional; multi-step decomposition                                                                                                                     |
| `f2`  |      0.15      | cue diagnosticity (DIAGNOSTIC=1.0, SEMI=0.6, SUPERFICIAL=0.2, UNKNOWN=0.4)                                                                                                                         |
| `f3`  |      0.15      | retrieval mode (DIRECT_RECALL=1.0, RECONSTRUCT=0.8, RECOGNITION=0.6, ELIMINATION=0.5, ANALOGY=0.6, GUESS=0.0, COMPUTE=0.9, TRANSLATE=0.8, SEARCH_MEMORY_PATH=0.7), penalty if interference != NONE |
| `f4`  |      0.30      | operation chain length, representation richness, explanation depth                                                                                                                                 |
| `f5`  |      0.15      | decision policy (BEST_MATCH=1.0, ELIMINATION_THEN_PICK=0.8, FAMILIARITY=0.5, SPEED=0.4, RANDOM_GUESS=0.0, RISK_AVERSE=0.7, RISK_SEEKING=0.5)                                                       |
| `f6`  |      0.10      | self-check coverage (count of distinct SelfCheckType present), presence of disconfirmation attempt                                                                                                 |

`reasoningQuality = clamp01(Σ weight_i · score_i)`. Weights live in
`@noema/config`. Per-frame mappings live in
`metacognition-service/src/domain/reasoning-quality.ts`. A docs file
`docs/backend/metacognition/reasoning-quality.md` documents the per-frame rules
(newly created).

### 7.4 `combineSignals`

```ts
export function combineSignals(
  reasoningQuality: number,
  confidenceSignal: number
): number {
  if (reasoningQuality > 0.7)
    return 0.85 * reasoningQuality + 0.15 * confidenceSignal;
  else if (reasoningQuality >= 0.3)
    return 0.6 * reasoningQuality + 0.4 * confidenceSignal;
  else return 0.95 * reasoningQuality + 0.05 * confidenceSignal;
}
```

Invariant: `wSelf` is monotonically non-increasing as `reasoningQuality`
decreases. Property test enforces.

### 7.5 Scheduler rating mapping

```ts
export function ratingFromCombinedScore(s: number): SchedulerRating {
  if (s < 0.3) return 'again';
  if (s < 0.5) return 'hard';
  if (s < 0.8) return 'good';
  return 'easy';
}
```

### 7.6 Correctness vs reasoning

- `correct=true && reasoningQuality < 0.3` → `combinedScore` ≤ 0.3 → `again` →
  does NOT stabilize the concept (per §3.3 of spec).
- `correct=false && reasoningQuality > 0.7 && confidenceSignal=0.0` →
  `combinedScore` ≥ 0.6 → `good` → keeps concept stable if reasoning average
  remains healthy (per §6.6 of spec).

Property tests enforce both behaviors.

### 7.7 Rolling reasoning average

Maintained in `ConceptReasoningRollup`. Window size `N` defaults to 10
(configurable). On every Evaluation:

```ts
rollup.recentEvaluationIds = takeLast(N, [...rollup.recentEvaluationIds, evaluation.id]);
rollup.averageReasoning = avg(reasoningQuality of those evaluations);
rollup.sampleCount = rollup.recentEvaluationIds.length;
rollup.lastEvaluationAt = evaluation.createdAt;
```

Emits `metacognition.reasoning_average.updated`.

---

## 8. Trigger detection

Detector lives in `services/metacognition-service/src/domain/triggers/`. One
rule file per type.

| Trigger            | Rule                                                                                                                                                                     |
| :----------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `failure`          | ≥ N consecutive incorrect evaluations on same concept (N default 3); or one critical failure with `reasoningQuality < 0.2` and `responseTime` short.                     |
| `confusion`        | The wrong answer references a concept connected to the target by a `confusable_with` edge in PKG, OR a `MisconceptionDetection` of family `relational` was just emitted. |
| `slow_thinking`    | `responseTime > μ + 2σ` of the learner's rolling baseline.                                                                                                               |
| `overconfidence`   | `selfRating = KNEW_IT && correct = false`, OR `selfRating = KNEW_IT && reasoningQuality < 0.3`.                                                                          |
| `boredom`          | Last 5 evaluations all `combinedScore > 0.8` AND `dwellTime` declining > 30%.                                                                                            |
| `prerequisite_gap` | Failure pattern + `kg.getPrerequisiteGaps(user, concept)` returns ≥ 1 unstable prerequisite.                                                                             |

Each emits `metacognition.trigger.fired` with the payload from §4.9. Triggers
are persisted before emission.

### 8.1 Misconception ↔ Trigger relationship

The existing `MisconceptionDetection` table stays. Misconceptions are facts
about the PKG. Triggers are events about the learner.

Bridge: when a `MisconceptionDetection` of severity `MODERATE+` is created,
metacognition-service receives an event and decides whether to emit a Trigger
(typically `confusion` or `prerequisite_gap`). The Trigger carries
`misconceptionRef` pointing to the detection. The detection lifecycle
(`detected → confirmed → addressed → resolved → recurring`) is not duplicated by
the Trigger lifecycle.

---

## 9. Strategy / replanning (in session-service `domain/strategy/`)

### 9.1 Trigger → intervention map

| Trigger            | Default `LearningInterventionType`                | Notes                                                                                   |
| :----------------- | :------------------------------------------------ | :-------------------------------------------------------------------------------------- |
| `failure`          | `INSERT_REPAIR_STEP`                              | Repair Step uses `EXPLANATION` or `ERROR_DETECTION` transformation.                     |
| `confusion`        | `INSERT_CONTRASTIVE_STEP`                         | Step picks mode from `MODE_GROUPS.confusion`, typically `CONTRASTIVE_PAIR` card source. |
| `slow_thinking`    | `REDUCE_DIFFICULTY` + `INSERT_CALIBRATION_STEP`   | Two ops chained.                                                                        |
| `overconfidence`   | `INSERT_CALIBRATION_STEP`                         | Picks from `MODE_GROUPS.meta`.                                                          |
| `boredom`          | `INCREASE_DIFFICULTY` or `TRANSITION_TO_TRANSFER` | Selector picks based on `attemptsSinceStable`.                                          |
| `prerequisite_gap` | `BRANCH_TO_PREREQUISITE`                          | Inserts a sub-sequence on the missing prerequisite concept.                             |

### 9.2 Replan scope selector

```ts
type ReplanScope = 'local' | 'structural' | 'full';

function chooseScope(trigger: Trigger, plan: LessonPlan): ReplanScope {
  if (trigger.type === 'prerequisite_gap') return 'structural';
  if (trigger.type === 'failure' && severity > 0.8) return 'structural';
  if (trigger.type === 'confusion' && plan.steps.length > 3) return 'local';
  if (planFundamentallyInvalidated(trigger, plan)) return 'full';
  return 'local';
}
```

Always pick the lowest scope that addresses the trigger. Pedagogy Guardian
rejects unnecessary escalation.

### 9.3 Operations

- **Local:** insert one Step before the next pending Step; or swap the next
  Step's `selectedMode` / `transformationType`; or adjust `difficulty` ±0.1.
- **Structural:** reorder pending Steps; insert a repair branch (sub-sequence of
  2–4 Steps); change `eligibleModes` for upcoming Steps.
- **Full:** mark the LessonPlan `ABANDONED`; create a new LessonPlan in `DRAFT`;
  validate by Guardian; activate.

### 9.4 Loadouts (per spec §4.3)

Loadouts survive as a **delivery-style modifier** applied **after** mode +
transformation are picked. Implemented as
`services/session-service/src/domain/strategy/loadout.ts`. A Loadout may modify:

- `Activity.prompt` tone,
- `Activity.expectedResponseType` strictness,
- `Step.evaluationType` weighting (within Pedagogy Guardian's rules).

A Loadout may **not** override mode eligibility, transformation selection,
concept state, trigger response, or Guardian decisions. Existing
`loadoutId`/`loadoutArchetype` columns on `Session` are kept.

---

## 10. Pedagogy Guardian Service

`services/pedagogy-guardian-service/`. New TS service (mirrors the structure of
other TS services).

### 10.1 API

```ts
POST /v1/validate/lesson-plan       body: LessonPlan
POST /v1/validate/step              body: Step
POST /v1/validate/activity          body: Activity (with Step context)
POST /v1/validate/replan            body: { current, proposed, trigger, scope }
POST /v1/validate/generated-variant body: GeneratedActivityVariant
```

Each returns
`{ result: 'accepted' | 'warning' | 'rejected', reasonCodes: string[], blocking: boolean, validationId }`
and persists a `GuardianValidation` row.

### 10.2 Rules (deterministic; no LLM)

LessonPlan (full rigor):

- `goals.length <= 4` active.
- No two goals contradict (heuristic table per `GoalType` pair).
- Every `Step.servesGoalIds` non-empty.
- Every `Step.evaluationType` can measure ≥1 of its goals (lookup
  `evaluationCanMeasure(GoalType): EvaluationType[]`).
- Every prerequisite either resolves to a stable PKG concept OR is added to a
  repair branch.

LessonPlan (minimal rigor):

- Structural only: entity refs resolve; no orphan steps; goal cap respected.

Step (always):

- `objective` non-empty; `evaluationType` defined.
- `selectedMode ∈ eligibleModes ⊆ EpistemicMode`.
- `transformationType ∈ Card.compatibleTransformations` for any `CARD`-sourced
  Activity.
- If `isRepair=true`: differs from preceding failed Step on at least one of
  (mode, transformation, activity, difficulty, prereq concept).
- `conceptRefs` non-empty.

Activity:

- `contentSourceType` is one of {CARD, TEMPLATE, GENERATED} and the
  corresponding ID is non-null.
- `responseSchema` is a valid JSON-Schema fragment.

Replan:

- `scope` is the lowest sufficient (heuristic).
- Does not mutate any `EVALUATED` Step.
- Resulting plan still satisfies LessonPlan rules.

Generated variant:

- Output passes content-safety filter (placeholder; integration with existing
  safety stack).
- Prompt does not leak the answer.
- `responseSchema` matches `expectedResponseType`.

### 10.3 Integration

- **session-service** calls the Guardian before activating a LessonPlan, before
  queueing a Step, and before applying a replan.
- **content-service** calls the Guardian before storing a
  `GeneratedActivityVariant`.
- **agents/** call the Guardian via the same HTTP API.
- A failure to validate emits `pedagogy.validation.rejected` with reason codes.

---

## 11. Scheduler — concept-first

### 11.1 Behavior

- Scheduler operates on `ConceptScheduleState` keyed
  `(userId, conceptId, studyMode)`. Cards are content payloads only and never
  appear in scheduler logic.
- Three queues per `ConceptScheduleState`: `repair`, `reinforcement`,
  `new_learning`.
- Algorithm choice (`fsrs | hlr | sm2 | leitner`) is per row, configurable per
  learner profile and per study mode.
- Scheduler subscribes to `metacognition.evaluation.recorded`, applies the math,
  writes to `ConceptEvaluationLog`, updates `ConceptScheduleState`, and emits
  `scheduler.concept_state.updated` (NOT to be confused with KG concept
  stability).
- Transformation history is consulted by the scheduler to recommend the next
  transformation.

### 11.2 Read APIs

- `GET /v1/concepts/:conceptId/schedule?userId&studyMode` →
  `ConceptScheduleState`.
- `GET /v1/concepts/due?userId&studyMode&limit&queue?` → list of due concepts
  (the planner uses this).
- `GET /v1/concepts/:conceptId/transformation-history?userId&studyMode` → for
  the transformation selector.

### 11.3 Migration disposition

Drop card-centric tables in the same migration: `SchedulerCard`, `Review`,
`CalibrationData`, `ScheduleProposal`, `ScheduleCommit`,
`ScheduleCohortLineage`, `SchedulerHandshakeState`, `SchedulerEventInbox`. The
new closed loop replaces this protocol (§15).

---

## 12. Knowledge graph — concept stability

### 12.1 Recompute job

`services/knowledge-graph-service/src/domain/knowledge-graph-service/concept-state-recompute.ts`:

```ts
async function recompute(
  userId,
  conceptId,
  studyMode
): {
  newState: ConceptState;
  flipped: boolean;
} {
  const sched = await schedulerClient.getState(userId, conceptId, studyMode);
  const reas = await metacogClient.getReasoningAverage(
    userId,
    conceptId,
    studyMode
  );
  const thr = await profileClient.getThresholds(userId);
  const stable =
    (sched.stability ?? 0) >= thr.S_RET &&
    (reas?.averageReasoning ?? 0) >= thr.R_REAS;
  // upsert ConceptStateProjection, write Neo4j `state` property,
  // append ConceptStateHistory, emit `knowledge_graph.concept_state.changed` if flipped
}
```

Triggered synchronously after every Evaluation (subscribes to
`metacognition.evaluation.recorded`) and on `scheduler.concept_state.updated`.

### 12.2 Thresholds (in `@noema/config`, overridable per learner profile)

```ts
defaults = {
  S_RET: 21, // FSRS stability days
  R_REAS: 0.6, // reasoning average to be stable
  N_TRANSFER: 5, // attempts after stable to consider transfer
  R_STREAK_THRESHOLD: 0.5,
  K_TRANSFORMATION_RECENCY: 3,
  N_REASONING_WINDOW: 10,
};
```

### 12.3 APIs

- `GET /v1/concepts/:conceptId/state?userId&studyMode` →
  `ConceptStateProjection`.
- `GET /v1/concepts/:conceptId/state/history?userId&studyMode&limit`.
- `GET /v1/concepts/:conceptId/prerequisite-gaps?userId&studyMode` → list of
  unstable prerequisite concepts.
- `GET /v1/users/:userId/stability-summary?studyMode` → per-domain stability
  rollup (replaces "mastery summary").

All learner-facing language is `stable`/`unstable`. The string "mastery" is
removed from learner-facing API contracts and UI copy.

---

## 13. Gamification — derived projection service

`services/gamification-service/`. Subscribes to:

- `metacognition.evaluation.recorded`
- `knowledge_graph.concept_state.changed`
- `session.completed`

### 13.1 Derivation rules

| Surface                    | Function                                                                      |
| :------------------------- | :---------------------------------------------------------------------------- |
| XP                         | `Σ combinedScore for completed Steps · decay(t)`                              |
| Level                      | `f(xp)`, thresholds in config                                                 |
| Streak                     | days with ≥1 Evaluation where `reasoningQuality > R_STREAK_THRESHOLD`         |
| Streak freeze              | UI-only mechanic, no derivation impact                                        |
| Achievements               | predicate evaluation against learning state                                   |
| Stability badges           | `state == 'stable'` for concept; duration computed from `ConceptStateHistory` |
| Memory Integrity Score     | `g(stable_concept_count, avg_reasoning_quality, days_since_last_flip)`        |
| Skill tree node "unlocked" | `all(prerequisites.state == 'stable')`                                        |
| Capability tier            | thresholds in §13.2                                                           |

### 13.2 Capability tier thresholds (Step-based, per spec §10.5)

```ts
capabilityTiers = [
  { tier: 1, steps: 20, categories: 3 },
  { tier: 2, steps: 50, categories: 5 },
  { tier: 3, steps: 75, categories: 7, daysActive: 7, avgReasoning: 0.5 },
  { tier: 4, steps: 100, categories: 10, daysActive: 14, avgReasoning: 0.55 },
  {
    tier: 5,
    steps: 150,
    categories: 12,
    daysActive: 21,
    avgReasoning: 0.6,
    sessions: 50,
  },
  { tier: 6, steps: 200, categories: 15, daysActive: 30, avgReasoning: 0.65 },
];
```

### 13.3 Streak quality gate (the only enforced rule)

When `metacognition.evaluation.recorded` arrives:

- If `reasoningQuality > R_STREAK_THRESHOLD` and the day not yet counted →
  increment `currentStreak`.
- Otherwise → no-op.

### 13.4 Revocation

On `knowledge_graph.concept_state.changed { to: 'unstable' }`:

- Re-evaluate badges depending on the concept.
- Set `AchievementCache.revokedAt`.
- Emit `gamification.badge.revoked`.

### 13.5 Existing `UserStreak` disposition

Dropped from session-service in the same migration that creates
`UserGamificationProjection` (§15).

---

## 14. Web app cutover (`apps/web`)

Implemented in Batch 10, with deletes happening in the same change set as the
new components.

### 14.1 New / modified

- `apps/web/src/app/(authenticated)/session/page.tsx` → renders **Steps**, not
  card queue.
- `apps/web/src/components/session/step-card-view.tsx` (renamed from
  `session-card-view.tsx`).
- `apps/web/src/components/session/self-rating-controls.tsx` — three buttons,
  `KNEW_IT / HESITATED / DIDN'T KNOW`.
- `apps/web/src/components/session/trace-builder.tsx` — captures the structured
  7-frame trace alongside the answer (collapsed by default; auto-fills inferable
  frames).
- `apps/web/src/components/session/evaluation-summary.tsx` — shows
  `reasoningQuality`, `combinedScore`, error type, recommended action.
- `apps/web/src/components/dashboard/stability-overview.tsx` — replaces
  "mastery" widgets.
- `apps/web/src/components/dashboard/reasoning-trend.tsx` — per-concept
  reasoning over time.

### 14.2 Deleted

- `apps/web/src/components/session/response-controls.tsx` (4-button grade UI).
- `apps/web/src/components/session/pre-answer-confidence.tsx` and
  `post-session-reflection.tsx` if they conflict; otherwise repurposed for trace
  `f0` capture.
- Any dashboard / KG / reviews components using "mastery" / "mastered" copy or
  props — renamed to stability vocabulary.
- Any review components that assume a card queue (`reviews/todays-plan.tsx`,
  `reviews/review-windows.tsx`) — refactored to Step-based projections.

### 14.3 API client

`packages/api-client` regenerates against the new REST contracts. All
`attempts`/`session/queue` endpoints removed. `steps`, `evaluations`,
`triggers`, `concepts/state` endpoints added.

---

## 15. Disposing of stale orchestration

The current scheduler ↔ session protocol uses cohort handshakes
(`SessionCohortHandshake`, `ScheduleProposal`, `ScheduleCommit`,
`ScheduleCohortLineage`, `SchedulerHandshakeState`, `SchedulerEventInbox`) to
negotiate card cohorts. In the new architecture this protocol is replaced by:

- The closed-loop orchestration in §16 Batch 13.
- `metacognition.evaluation.recorded` → scheduler updates `ConceptScheduleState`
  → KG recompute → if Trigger fired, Strategy module replans inside
  session-service → Pedagogy Guardian validates → Step queue updates.

Therefore:

- All cohort/proposal/commit/lineage/inbox tables in scheduler-service are
  **dropped**.
- All cohort handshake tables in session-service are **dropped**.
- All event types `session.cohort.*` and `scheduler.cohort.*` are **removed**
  from `@noema/events`.

If a future use case re-introduces cohort negotiation, it can be designed
against the new model. Bringing it back via the old card-centric tables is
forbidden.

---

## 16. Implementation order — 13 batches

Each batch is independently shippable, ends with passing tests, and includes the
explicit deletes that go with it.

### Batch 0 — ADRs

Write ADRs (in `docs/adr/`):

- ADR: Step is the atomic learning unit
- ADR: Direct rename / no-alias policy
- ADR: Service boundaries (Pedagogy Guardian as service; Strategy in
  session-service; Gamification as projection service; Ingestion stays in
  content-service)
- ADR: Evaluation owned by metacognition-service
- ADR: Scheduler is concept-first
- ADR: Cohort handshake protocol removed
- ADR: 3-choice self-rating replaces 4-button grade

Update `architecture.md` and `module-graph.md`.

**Acceptance:** all decisions in this plan have a referenced ADR; stale ADRs
that conflict with the realignment are marked "Superseded by ADR-XXXX".

### Batch 1 — Shared vocabulary, contracts, events, config

- `packages/types`: rename `TeachingApproach` → `EpistemicMode`; remove
  `STANDARD`; add `TransformationType`, `ConceptState`, `StepSelfRating`,
  `TriggerType`, `LearningInterventionType`, `EligibilityGroup`, `RigorLevel`,
  `GoalType/State/Source`, `SessionLifecycleState`, `StepStatus`,
  `SchedulerQueue`, `ReplanScope`, branded IDs.
- `packages/validation`: Zod schemas for all the above.
- `packages/contracts`: add LessonPlan / Step / Activity / Evaluation / Trigger
  / Replan DTOs.
- `packages/events`: add `lesson_plan.*`, `step.*`,
  `metacognition.evaluation.recorded`, `metacognition.trigger.fired`,
  `strategy.replan.proposed`, `strategy.replan.committed`,
  `pedagogy.validation.rejected`, `knowledge_graph.concept_state.changed`,
  `gamification.badge.*`. Remove `session.cohort.*`, `scheduler.cohort.*`.
- `@noema/config`: add `metacognition`, `gamification`, `eligibility` config
  sections with the defaults from §7, §12, §13.

**Deletes:** `TeachingApproach` enum and every import; cohort event types.

**Acceptance:** repo compiles; `pnpm test` for shared packages passes; grep for
`TeachingApproach`, `teachingApproach`, `STANDARD` returns 0 hits in production
code.

### Batch 2 — Mode eligibility & transformation rules

- `packages/types/src/eligibility/mode-groups.ts` with the §5 table.
- `selectEligibleGroup` + `selectModeFromGroup(LRU)` + `selectTransformation`
  per §6.
- Tests: every mode in ≥1 group; every group has ≥3 modes; routing is
  deterministic.

**Acceptance:** `pnpm --filter @noema/types test` covers all 30 modes.

### Batch 3 — Content service

- Card schema: add `compatibleTransformations`, `defaultEligibilityGroups`,
  `supportedStudyModes`.
- Backfill script applied to dev DB; future `Card.create` rejects empty
  `compatibleTransformations`.
- New entity `GeneratedActivityVariant` with TTL.
- New API `POST /v1/activity-payload-candidates` returning candidate
  cards/templates/variants per §6.3 input.
- Old `card import` still works; only adds `concepts.extracted` event emission.

**Deletes:** none structural (Card stays).

**Acceptance:** `pnpm --filter @noema/content-service test` passes; backfill
produces ≥1 transformation per active card.

### Batch 4 — Session-service: LessonPlan, Goal, Step, Activity, lifecycle

- New tables (§4.2–4.7), migration that **drops** `Attempt`, `SessionQueueItem`,
  `SessionCohortHandshake`, `UserStreak`, and the legacy `Session.state` field.
- New REST: `POST /v1/sessions` (creates Session in `PLANNING`),
  `POST /v1/sessions/:id/lesson-plan`, `POST /v1/lesson-plans/:id/goals` (4-cap
  enforced), `GET /v1/sessions/:id/next-step`, `POST /v1/steps/:id/present`,
  `POST /v1/steps/:id/answer`, `POST /v1/steps/:id/skip`.
- Lifecycle FSM transitions as event emissions
  (`session.lifecycle.transitioned`).
- `MinimalLessonPlanFactory` for review sessions.
- `FullLessonPlanFactory` calls the LessonPlan Generation Agent (Python, §14).

**Deletes:** all card-attempt REST endpoints; the entire legacy queue REST
surface.

**Acceptance:** `pnpm --filter @noema/session-service test`; an integration test
seeds a session, activates a minimal plan, presents a Step, accepts an answer,
and reaches `EVALUATED` state for that Step.

### Batch 5 — Metacognition-service: Evaluation, scoring, rolling avg, triggers

- New `prisma/schema.prisma` (was empty).
- `domain/reasoning-quality.ts` with per-frame scoring (§7.3).
- `domain/combine-signals.ts` (§7.4).
- `domain/fsrs-rating.ts` (§7.5).
- `domain/triggers/*.rule.ts` (§8).
- REST: `POST /v1/evaluations` (computes + persists + emits
  `evaluation.recorded` and any triggers),
  `GET /v1/concepts/:conceptId/reasoning-average`.
- Subscribe to `MisconceptionDetection`-creation events from KG service to
  bridge (§8.1).

**Acceptance:** property tests pass; a synthetic trace with low reasoning +
correct=true does NOT produce a `good` rating; a synthetic trace with high
reasoning + correct=false produces ≥ `good`.

### Batch 6 — Scheduler-service: concept-first refactor

- Migration that **drops** `SchedulerCard`, `Review`, `CalibrationData`,
  `ScheduleProposal`, `ScheduleCommit`, `ScheduleCohortLineage`,
  `SchedulerHandshakeState`, `SchedulerEventInbox`.
- New tables (§4.10).
- Subscribe to `metacognition.evaluation.recorded` → update
  `ConceptScheduleState` + write `ConceptEvaluationLog` + write
  `ConceptTransformationHistory` + emit `scheduler.concept_state.updated`.
- REST: `GET /v1/concepts/:conceptId/schedule`, `GET /v1/concepts/due`,
  `GET /v1/concepts/:conceptId/transformation-history`.
- Algorithms (`fsrs.ts`, `hlr.ts`, `sm2.ts`, `leitner.ts`) refactored to consume
  `Evaluation`-shaped input rather than card-shaped input.

**Deletes:** every "card-centric scheduling" code path. Public APIs that took
`cardId` are removed.

**Acceptance:** `pnpm --filter @noema/scheduler-service test`; a sequence of
three Evaluations on concept C correctly transitions C through
`NEW_LEARNING → REINFORCEMENT` and (on a failure) into `REPAIR`.

### Batch 7 — Knowledge-graph-service: stability projection

- New table `ConceptStateProjection`, `ConceptStateHistory`.
- Recompute job per §12; subscribed to `metacognition.evaluation.recorded` and
  `scheduler.concept_state.updated`.
- REST: `GET /v1/concepts/:conceptId/state`, `/state/history`,
  `/prerequisite-gaps`, `/v1/users/:userId/stability-summary`.
- Neo4j PKG concept node gets `state` property maintained by the same job.
- Replace any "mastery summary" REST/UI contracts with stability summary.

**Deletes:** mastery summary endpoints, types, and UI strings.

**Acceptance:** flipping reasoning_average across `R_REAS` causes a `state`
flip; `prerequisite-gaps` returns the right set on a synthetic graph.

### Batch 8 — Pedagogy Guardian Service

- **Status 2026-05-02:** implemented in source for service, Session/Content
  producer gates, persistence migration, and focused unit coverage.

- New service scaffold matching other TS services.
- `prisma/schema.prisma` with `GuardianValidation`.
- Validation rules per §10.2.
- REST per §10.1.
- Clients in session-service, content-service, agents call Guardian before
  publishing.

**Acceptance:** every E2E test of malformed LessonPlan / Step / replan /
generated variant returns the right `reasonCodes` and is rejected.

### Batch 9 — Strategy / replanning module (in session-service)

- **Status 2026-05-02:** implemented in source for deterministic intervention
  selection, scope selection, trigger consumption, Guardian-gated Step
  insertion, and focused unit coverage.

- `services/session-service/src/domain/strategy/` with subscriber to
  `metacognition.trigger.fired`.
- Intervention map and scope selector per §9.
- Atomic replan: write new Steps, set `supersededByStepId` on replaced Steps,
  push to `StepQueueItem`, call Guardian, emit `strategy.replan.committed`.
- Loadout modifier as the post-mode-selection layer (§9.4).

**Acceptance:** failure trigger inserts a repair Step with a different
transformation; prerequisite_gap trigger inserts a structural prerequisite
branch; full replan only when `planFundamentallyInvalidated`.

### Batch 10 — Web app cutover

- **Status 2026-05-02:** implemented in source for the active Step view,
  three-choice self-rating controls, trace builder, evaluation summary,
  stability dashboard vitals, and broad concept-payload frontend language pass.

Per §14. Delete the 4-button UI; ship Step view + 3-choice self-rating + trace
builder + evaluation summary + stability dashboard widgets.

**Acceptance:** Playwright test: a learner starts a session, sees a Step, picks
a self-rating, sees the evaluation summary, sees stability vocabulary in the
dashboard. Old grade buttons do not appear in any test.

### Batch 11 — Content generation agent + ingestion hook

- `agents/src/agents/lesson_planner.py` (LessonPlan generator) and
  `agents/src/agents/content_generator.py` (variant generator) — both call
  Pedagogy Guardian.
- Add `concepts.extracted` event in content-service ingestion path.
- Activity rendering uses card renderers when `contentSourceType=CARD`; uses
  `renderPayload` directly for `GENERATED`.

**Acceptance:** an integration test seeds a topic, the planner produces a valid
LessonPlan, the variant generator produces a valid Step Activity, both pass
Guardian.

### Batch 12 — Gamification-service

- New service scaffold; tables per §4.15.
- Derivation rules per §13; streak quality gate.
- Subscribe to `metacognition.evaluation.recorded`,
  `knowledge_graph.concept_state.changed`, `session.completed`.
- Web dashboard reads from gamification-service.

**Deletes:** `UserStreak` table from session-service (already done in Batch 4
migration); any "Mastered" badge copy.

**Acceptance:** a low-reasoning day does NOT extend the streak; a
`stable → unstable` flip revokes the corresponding badge.

### Batch 13 — Closed-loop E2E

- End-to-end orchestrator test: start session → LessonPlan → Step → answer →
  evaluation → trigger → replan → guardian → next Step → scheduler update → KG
  state change → gamification update.
- Load test with 1k concurrent sessions.
- Chaos test: kill metacognition-service mid-evaluation; replay should converge.

**Acceptance:** all of spec §14 success criteria pass.

---

## 17. Required tests

### Unit

- `selectEligibleGroup` over the full §4.2 truth table.
- `selectTransformation` cycles all six before repeating.
- `combineSignals` monotonic invariant + threshold property tests.
- `ratingFromCombinedScore` boundary tests.
- Per-frame reasoning scoring rules — table-driven.
- Trigger detection per rule.
- Pedagogy Guardian per rule (positive + negative).
- Replan scope selector per trigger type.
- Gamification derivations and revocation.

### Integration

- LessonPlan creation → Step queue → Step presentation → Step evaluation → state
  update.
- Evaluation → scheduler `ConceptScheduleState` update → KG
  `ConceptStateProjection` update.
- Trigger → Strategy → Guardian → new Step inserted.
- Content generation → Activity → presentation; with cache hit path.
- Prerequisite gap → repair branch.

### E2E (Playwright)

- Complete a Step with `KNEW_IT` and see `evaluation.recorded`.
- Fail a Step with `DIDNT_KNOW` and see a transformed repair Step.
- Correct + low reasoning does not stabilize concept (verify dashboard).
- Stable concept regresses → corresponding badge disappears in the UI.
- Dashboard shows stability + reasoning trend (no "mastery" copy anywhere).

---

## 18. Validation commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm playwright

pnpm --filter @noema/types test
pnpm --filter @noema/validation test
pnpm --filter @noema/contracts test
pnpm --filter @noema/events test
pnpm --filter @noema/content-service test
pnpm --filter @noema/session-service test
pnpm --filter @noema/scheduler-service test
pnpm --filter @noema/knowledge-graph-service test
pnpm --filter @noema/metacognition-service test
pnpm --filter @noema/pedagogy-guardian-service test
pnpm --filter @noema/gamification-service test
pnpm --filter @noema/web test
```

Use the actual filter names if the package names differ from the path names.

---

## 19. Definition of done

The realignment is complete when **all** of the following are true (mirrors spec
§14, expanded):

- [ ] Every session has a LessonPlan (minimal or full).
- [ ] Every learner-visible learning unit is a Step. The word "card" never
      appears in a learner-facing surface.
- [ ] Every Step has objective, eligible modes, selected mode, transformation,
      activity, expected outcome, and evaluation type.
- [ ] Every Step completion records exactly one canonical Evaluation in
      metacognition-service.
- [ ] `reasoningQuality` dominates correctness in `combinedScore` per the §7.4
      formula.
- [ ] A correct answer with `reasoningQuality < 0.3` does **not** stabilize a
      concept.
- [ ] A wrong answer with `reasoningQuality > 0.7` does **not** necessarily
      destabilize.
- [ ] All 30 epistemic modes are routable; no mode is unassigned; `STANDARD` is
      gone.
- [ ] Repetition uses transformations and never repeats the most recent
      transformation for a concept.
- [ ] A `confusion` trigger routes the next Step to a mode in
      `MODE_GROUPS.confusion`.
- [ ] A `failure` trigger lands the concept in the `repair` queue and
      re-presents with a different transformation.
- [ ] A `stable → unstable` flip revokes derived badges in real time.
- [ ] A streak day is not counted unless ≥1 Step had
      `reasoningQuality > R_STREAK_THRESHOLD`.
- [ ] Pedagogy Guardian rejects malformed LessonPlans, Steps, replans, generated
      variants — exercised by tests.
- [ ] Cards remain functional as content payloads/templates only.
- [ ] All preserved capabilities in §3.3 still work end-to-end.
- [ ] No production code imports `TeachingApproach`, `Attempt`,
      `SessionQueueItem`, `UserStreak`, or `SchedulerCard`.
- [ ] No learner-facing UI copy contains "mastered" / "mastery".
- [ ] No 4-button grade UI is reachable from any route.
- [ ] All cohort handshake tables, types, and events are removed.

---

## 20. Risk register

| Risk                                                                     | Mitigation                                                                                                                                      |
| :----------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| Reasoning-quality scoring rules turn out to be wrong empirically         | Per-frame weights and per-signal mappings are config-driven; can be retuned without code changes. Measurement dashboard from Batch 13.          |
| Generation cost blows up                                                 | Daily cost cap + cache + card fallback (§6.4).                                                                                                  |
| Closed-loop latency too high for snappy UX                               | Each loop step is an event-driven async; UI shows the next Step optimistically while validation completes; rollback path on Guardian rejection. |
| KG recompute job overloaded                                              | Debounce per `(userId, conceptId)` for 1s; batch recompute on `MisconceptionDetection` bursts.                                                  |
| Migration drops dev data                                                 | Document explicitly in the migration changelog. The app is unreleased; this is acceptable. Snapshot dev DB before each destructive migration.   |
| Pedagogy Guardian becomes a bottleneck                                   | Stateless; horizontally scalable. The validation surface is small.                                                                              |
| Strategy module gains independent state and grows out of session-service | Reassessed every quarter; ADR threshold to split.                                                                                               |
| Loadouts conflict with new Step semantics                                | Loadouts are post-mode-selection only; Guardian rejects any loadout that overrides mode/transformation/concept-state/trigger response.          |
| Concept stability oscillates due to single bad evaluation                | Spec §3.4 explicitly demands no smoothing. Documented behavior. Optional future toggle: hysteresis on `R_REAS` (out of scope here).             |

---

## 21. Non-goals (mirrors spec §15)

This realignment is explicitly **not** about:

- Adding new card types.
- Adding new epistemic modes (the 30 are renamed and grouped, not extended).
- Changing the dual-graph (PKG/CKG) architecture or the 7-layer guardrail stack.
- Changing offline-first sync semantics.
- Changing the settings hierarchy or Last Known Good Configuration.
- UI/UX redesign **beyond** the 3-choice self-rating, the Step view, the trace
  builder, the evaluation summary, the stability dashboard widgets, and the
  deletion of mastery copy. (These are the spec-mandated UI changes, not
  redesigns.)
- Mobile app architecture changes.

Any task that requires one of these is **out of scope**. A separate ADR is
required to expand scope.

### 21.1 Note on the spec's "no new microservices" item

Spec §12 explicitly lists a `Pedagogy Guardian` (renamed from
`Governance Agent`) and a `Gamification Service` as services with new behavior.
Neither exists in code today. This plan **materializes them as services**
because:

- `Governance Agent` is missing from the codebase, so the rename is a creation.
  The spec mandates its existence.
- `Gamification Service` is implicitly assumed by spec §10 (XP, streaks, badges,
  capability tiers). Today, `UserStreak` lives in session-service and
  achievements are scattered. Consolidating into a derived projection service is
  the cleanest implementation of §10.

Both are therefore consistent with §15 — they are not "new" microservices added
on top of the architecture; they are services the architecture already assumes
but the codebase has not yet realized.

---

## 22. Analytics (per spec §12 "Other services")

The spec requires one analytics addition: a "Reasoning Quality Over Time"
dashboard per learner per concept.

Implementation:

- Backend: `metacognition-service` exposes
  `GET /v1/analytics/reasoning-quality?userId&conceptId&studyMode&from&to&bucket=day|week`
  returning a time series from `Evaluation.reasoningQuality` and
  `Evaluation.combinedScore`.
- Frontend: `apps/web/src/components/dashboard/reasoning-trend.tsx` renders the
  series alongside the stability flips from `ConceptStateHistory`.

No new analytics service is created. No other analytics surfaces change.

---

## 23. End

This plan is the consolidated, post-review, clean-refactor implementation plan.
It supersedes both prior drafts. If the reviewer agrees, implementation begins
at Batch 0.
