# 🎯 Entity-Specific Programming Patterns for Noema

**Comprehensive programming patterns for every entity type in the AI-enhanced
spaced repetition platform**

---

## 📚 Table of Contents

1. [Core Learning Entities](#1-core-learning-entities)
2. [Metacognition Entities](#2-metacognition-entities)
3. [Knowledge Graph Entities](#3-knowledge-graph-entities)
4. [Gamification Entities](#4-gamification-entities)
5. [Agent Entities](#5-agent-entities)
6. [Learning Methods & Modes](#6-learning-methods--modes)
7. [Teaching Approach Entities](#7-teaching-approach-entities)
8. [Ingestion Pipeline Entities](#8-ingestion-pipeline-entities)
9. [Settings Entities](#9-settings-entities)
10. [Telemetry Entities](#10-telemetry-entities)
11. [Collaboration Entities](#11-collaboration-entities)
12. [Media Entities](#12-media-entities)

---

## 1. 🃏 Core Learning Entities

### 1.1 Card Entity

**What:** The fundamental learning unit with 22 different types (atomic, cloze,
image occlusion, process, comparison, exception, error-spotting, etc.)

**Why for Noema:**

- Supports 22 card types with type-specific creation logic
- Shared model across all services (content, scheduler, knowledge graph,
  gamification)
- Each service focuses on different fields but sees the whole card
- Immutable value objects for content and scheduling ensure consistency
- Version tracking enables undo/redo functionality

**Implementation:**

```
Shared Model (packages/types):
  Card {
    id, type, version
    content: CardContent (immutable value object)
    scheduling: SchedulingData (immutable value object)
    knowledgeGraph: KnowledgeGraphData
    gamification: GamificationData
  }

Factory Registry for 22 Types:
  AtomicCardFactory, ClozeCardFactory, ImageOcclusionFactory,
  ProcessCardFactory, ComparisonCardFactory, ExceptionCardFactory,
  ErrorSpottingCardFactory, ConfidenceRatedCardFactory, etc.

Builder Pattern:
  CardBuilder.withType('cloze').withContent(front, back).build()

Patterns: Entity, Value Object, Factory, Builder, Snapshot, Specification
```

---

### 1.2 Deck Entity

**What:** Aggregate root that manages a collection of cards and enforces
deck-level business rules

**Why for Noema:**

- Ensures consistency within deck boundaries (no duplicate cards, max capacity)
- Centralizes deck-level operations (add/remove cards, settings)
- Publishes domain events for other services to react
- Repository pattern for data access abstraction

**Implementation:**

```
Deck manages Cards:
  - addCard(card) → enforces rules → publishes deck.card.added event
  - removeCard(cardId) → publishes deck.card.removed event
  - getCards() → returns readonly copy

Business Rules:
  - No duplicate cards
  - Maximum capacity enforcement
  - Card must be valid for deck type

Patterns: Aggregate, Repository, Domain Events
```

---

### 1.3 Category Entity

**What:** Hierarchical organization using Composite pattern, implementing
"categories as lenses" paradigm

**Why for Noema:**

- Categories are interpretive contexts, not containers
- Same card can have different framing questions per category
- Supports tree structure with unlimited depth
- Fast subtree queries using Nested Set pattern
- Context-specific scheduling and emphasis rules

**Implementation:**

```
Composite Structure:
  CompositeCategory (has children) vs LeafCategory (no children)
  - add(category), remove(category)
  - getCards() → recursively aggregates from all children

Category as Lens:
  CategoryLens { categoryId, cardId, framingQuestion, semanticRole }
  Roles: 'foundational', 'example', 'edge_case', 'counterexample'

Database Storage:
  Adjacency List: parentId for simple hierarchies
  Nested Set: left/right boundaries for fast subtree queries

Patterns: Composite, Adjacency List, Nested Set, Lens
```

---

### 1.4 Session Entity

**What:** Represents a learning session with state machine lifecycle

**Why for Noema:**

- Tracks session state (PLANNED → ACTIVE → PAUSED → COMPLETED → ABANDONED)
- Associates attempts with sessions for analytics
- Applies strategy loadout to session
- Event sourcing enables session replay

**Implementation:**

```
State Machine:
  PLANNED → start() → ACTIVE
  ACTIVE → pause() → PAUSED
  PAUSED → resume() → ACTIVE
  ACTIVE → complete() → COMPLETED
  ANY → abandon() → ABANDONED

Events Published:
  session.started, attempt.recorded, session.paused,
  session.resumed, session.completed

Patterns: State Machine, Event Sourcing, Memento (pause/resume)
```

---

### 1.5 Attempt Entity

**What:** Immutable event capturing a single card review attempt

**Why for Noema:**

- Event sourcing foundation for all learning analytics
- Complete audit trail of learning progress
- CQRS separation (write as event, read as statistics)
- Cannot be modified after creation

**Implementation:**

```
AttemptEvent {
  eventId, eventType: 'attempt', timestamp
  userId, sessionId, cardId

  payload: { rating, responseTime, confidence, strategy, assistsUsed }

  metadata: {
    schedulerAlgorithm, previousDifficulty, newDifficulty,
    previousInterval, newInterval
  }
}

Event Store → append-only log
Read Models: AttemptStatistics (derived from events)

Patterns: Event Sourcing, CQRS, Event Carried State Transfer
```

---

## 2. 🧠 Metacognition Entities

### 2.1 Thinking Trace (7-Frame Stack)

**What:** Cognitive stack trace capturing thinking process across 7 frames
(Mental Debugger)

**Why for Noema:**

- Provides "stack trace of thinking" for each learning attempt
- Enables precise failure diagnosis across cognitive layers
- Each frame captures different aspect of mental process
- Foundation for Mental Debugger's failure taxonomy

**Implementation:**

```
7 Frames:
  Frame 0: Context & Intent (goal, stakes, strategy, affective state)
  Frame 1: Task Parsing (task type, instruction features, confidence)
  Frame 2: Cue Selection (what cues latched, diagnostic vs superficial)
  Frame 3: Retrieval (direct recall, reconstruction, elimination, analogy, guess)
  Frame 4: Reasoning (rules applied, representation shifts, comparisons)
  Frame 5: Commitment (timing, edit count, fluency trap, over-editing)
  Frame 6: Attribution (outcome, user vs system detected cause)

Patterns: Chain of Responsibility, Composite, Visitor, Template Method
```

---

### 2.2 Strategy Loadout Entity

**What:** Configuration object defining learning strategy across 6 policy
dimensions

**Why for Noema:**

- Like RPG builds - users equip different strategies for different goals
- Controls pacing, error handling, hints, feedback, commitment, reflection
- Canonical archetypes (Fast Recall, Deep Understanding, Exam Survival,
  Calibration)
- Evaluated by agents for effectiveness

**Implementation:**

```
6 Policy Dimensions:
  - PacingPolicy: timebox, session target, card target, adaptive speed
  - ErrorPolicy: visibility (immediate/delayed), cost, show answer, retry
  - HintPolicy: enabled, cost (free/xp/time), max per card
  - FeedbackPolicy: timing, tone (neutral/coaching/challenging), focus
  - CommitPolicy: style (instant/two-step), verification gates
  - ReflectionPolicy: frequency, prompts, attribution framing

Canonical Archetypes:
  FAST_RECALL: hard timebox, low error cost, immediate feedback
  DEEP_UNDERSTANDING: no timebox, high error cost, delayed feedback
  EXAM_SURVIVAL: moderate timebox, confidence marking required
  CALIBRATION_TRAINING: delayed correctness reveal, mandatory confidence

Patterns: Strategy, Builder, Prototype (clone archetypes), Composite
```

---

### 2.3 Mental Debugger Diagnosis

**What:** Analysis result from 7-frame trace producing failure taxonomy and
patch plan

**Why for Noema:**

- Categorizes failures into 10 families (Parsing, Retrieval, Prior Knowledge,
  Confusable, etc.)
- Generates targeted patch plans (immediate, optional, escalation)
- Creates 20 special remediation card types
- Separates process errors from content gaps

**Implementation:**

```
Failure Taxonomy:
  10 Families: PARSING, RETRIEVAL, PRIOR_KNOWLEDGE, CONFUSABLE,
               VERIFICATION, TIME_PRESSURE, MONITORING, COMMITMENT,
               CALIBRATION, ATTRIBUTION

Patch Plan:
  Immediate: verification gates, contrast cards, slow-down prompts
  Optional: practice recommendations, strategy suggestions
  Escalation: concept prerequisite learning, strategy override

20 Remediation Card Types:
  contrastive_pair, minimal_pair, false_friend, old_vs_new_definition,
  boundary_case, rule_scope, discriminant_feature, assumption_check,
  counterexample, representation_switch, retrieval_cue, encoding_repair,
  overwrite_drill, availability_bias_disconfirmation, self_check_ritual,
  process_trace, worked_example, error_spotting, confidence_drill,
  metamemory_calibration

Patterns: Visitor (visit frames), Strategy (patch per family), Factory (remediation cards)
```

---

### 2.4 Calibration Data

**What:** Statistical aggregate tracking confidence vs accuracy alignment

**Why for Noema:**

- Trains "Liar Detector" - exposes illusions of knowing
- Calculates Brier score and Expected Calibration Error
- Segments by difficulty, concept, time
- Tracks overconfidence/underconfidence trends

**Implementation:**

```
Metrics:
  brierScore: (confidence - correctness)² averaged
  expectedCalibrationError: |confidence - accuracy| averaged
  overconfidenceRate: confident but wrong
  underconfidenceRate: uncertain but correct

Segmentation:
  byDifficulty, byConcept, byTimeWindow

Patterns: Observer (monitor attempts), Time Series, Aggregate
```

---

## 3. 🕸️ Knowledge Graph Entities

### 3.1 Graph Architecture (PKG + CKG)

**What:** Dual graph model - Personal Knowledge Graph (flexible) + Canonical
Knowledge Graph (formal)

**Why for Noema:**

- PKG: per-user, exploratory, agents can mutate directly
- CKG: global, formally verified, agents propose via DSL
- Stratified 5-layer reasoning (Layer 0 mutable, 1-4 derived)
- Prevents agent corruption of canonical knowledge

**Implementation:**

```
PKG (Personal Knowledge Graph):
  - Per-user nodes and edges
  - Flexible, validated updates
  - Learner misconception states
  - Agents have direct write access (with validation)

CKG (Canonical Knowledge Graph):
  - Global, shared knowledge
  - Formally verified (ontology + TLA+)
  - Agents propose via DSL only
  - Typestate pipeline validates mutations

5-Layer Stratification:
  Layer 0: Structural facts (nodes, edges) - ONLY MUTABLE LAYER
  Layer 1: Graph derivations (transitive closure, cycles) - immutable
  Layer 2: Ontology classification (classes, domain/range) - immutable
  Layer 3: Aggregated statistics (confidence, centrality) - immutable
  Layer 4: Pedagogical/diagnostic (misconceptions, interventions) - immutable

Patterns: Dual Model, Layered Architecture, Graph Database (Neo4j)
```

---

### 3.2 CKG Mutation DSL

**What:** Domain-specific language for proposing canonical graph mutations with
typestate verification

**Why for Noema:**

- Prevents invalid mutations to canonical knowledge
- Typestate machine ensures correct validation sequence
- TLA+ verification proves invariant preservation
- Agents cannot bypass guardrails

**Implementation:**

```
DSL Operations:
  AddNode { nodeId, type, props }
  AddEdge { from, to, type, weight }
  RemoveNode { nodeId }
  RemoveEdge { edgeId }
  UpdateNodeProps { nodeId, props }
  UpdateEdgeWeight { edgeId, weight }

Typestate Pipeline:
  PROPOSED → SYNTAX_VALIDATED → GUARD_CHECKED → ONTOLOGY_CHECKED
  → INVARIANT_CHECKED → TLA_VERIFIED → COMMITTED (or REJECTED)

Validation Layers:
  1. Syntax validation (parse DSL)
  2. Guard checks (preconditions)
  3. Ontology constraints (domain/range)
  4. Invariant checks (UNITY, acyclicity)
  5. TLA+ verification (formal proof)

Patterns: DSL, Typestate, Pipeline, Formal Methods (TLA+)
```

---

### 3.3 Concept Entity

**What:** Graph node representing a concept with ontology classification and
pedagogical metadata

**Why for Noema:**

- Formal ontology typing (superclasses, domain constraints)
- Prerequisite/related/confusable relationships
- Difficulty and centrality metrics
- Misconception tracking

**Implementation:**

```
Concept {
  id, name, domain
  ontologyType, superclasses

  Relationships:
    prerequisites, related, confusableWith, contradicts

  Pedagogical:
    difficulty, centrality, misconceptionProne
}

Patterns: Graph Node, Ontology, Visitor (traversal)
```

---

## 4. 🎮 Gamification Entities

### 4.1 XP (Experience Points)

**What:** Immutable value object calculated from XP events, not stored

**Why for Noema:**

- Event sourcing ensures accurate XP calculation
- CQRS separates write (XPEvent) from read (XPTotal)
- Non-linear level curve (√(XP/100))
- Multiple XP sources (reviews, streaks, achievements, etc.)

**Implementation:**

```
XPEvent {
  eventId, userId, amount, source, timestamp
  metadata: { cardId, sessionId, achievementId }
}

XP Sources:
  card_review, streak_bonus, achievement_unlock, perfect_session,
  mastery_milestone, daily_goal, social_interaction

XP Calculation:
  totalXP = sum of all XPEvents
  level = floor(√(totalXP / 100))

Patterns: Value Object, Event Sourcing, CQRS
```

---

### 4.2 Streak Entity

**What:** Tracks daily/weekly activity streaks with state machine and freeze
protection

**Why for Noema:**

- Encourages consistent learning
- Streak protection (limited freezes)
- Anti-burnout features (rest day suggestions)
- State machine tracks streak status

**Implementation:**

```
Streak States:
  ACTIVE_TODAY (already extended today)
  CAN_EXTEND (yesterday was active, can extend)
  CAN_FREEZE (2 days ago was active, can use freeze)
  BROKEN (too many days missed)

Freeze Mechanism:
  freezesRemaining, freezeUsedDates
  Can freeze once per X days

Patterns: State Machine, Observer (react to session.completed), Strategy (types)
```

---

### 4.3 Achievement Entity

**What:** Unlockable achievements with specification-based requirement checking

**Why for Noema:**

- Multi-category achievements (learning, social, mastery, streak, exploration)
- Tiered progression (Bronze, Silver, Gold)
- Specification pattern validates completion
- Observer pattern monitors user events

**Implementation:**

```
Achievement {
  id, name, description, category
  requirements: [ { type, target, scope } ]
  xpReward, badgeIcon, tiers
}

Requirement Types:
  card_count, streak_length, mastery_level, time_spent,
  perfect_sessions, concepts_mastered, social_interactions

Checking:
  AchievementSpecification.isSatisfiedBy(user, achievement)
  → checks all requirements

Patterns: Specification, Observer, Strategy
```

---

### 4.4 MIS (Moments of Insight Score)

**What:** Calculated metric tracking "aha moments" and pattern recognition
events

**Why for Noema:**

- Quantifies insight quality, not just quantity
- Tracks triggers (aha_moment, pattern_recognition, connection_made)
- Intensity scoring (0-1)
- Links to specific concepts

**Implementation:**

```
MISEvent {
  userId, timestamp
  trigger: 'aha_moment' | 'pattern_recognition' | 'connection_made'
  intensity: 0-1
  concepts: [ConceptId]
}

MISScore:
  total count, avgIntensity, byTrigger distribution, trend

Patterns: Observer (detect moments), Event Sourcing
```

---

## 5. 🤖 Agent Entities

### 5.1 Agent Base Structure

**What:** Template method defining common agent skeleton with ReAct pattern

**Why for Noema:**

- All 10 agents follow consistent structure
- ReAct loop (Reason → Act → Observe) for decision making
- Complete reasoning traces for explainability
- Cost and performance metrics tracking

**Implementation:**

```
Agent Lifecycle:
  1. validateInput(input)
  2. buildSystemPrompt(input, context)
  3. executeAgentLoop() → ReAct iterations
     - Reason: LLM generates thought
     - Act: Execute tool if needed
     - Observe: Process tool result
  4. calculateConfidence(reasoning)
  5. calculateCost(reasoning)
  6. return { result, reasoning, metadata }

ReAct Loop:
  For iteration = 1 to maxIterations:
    thought = LLM.generate()
    if (needsTool) { action = execute(tool); observe(result) }
    if (finalAnswer) break

Metadata:
  executionTime, iterations, toolsUsed, tokenUsage,
  estimatedCost, model, agentVersion

Patterns: Template Method, ReAct, Strategy, Chain of Responsibility
```

---

### 5.2 Learning Agent

**What:** Selects next card based on learning mode, knowledge graph context, and
scheduler

**Why for Noema:**

- Adapts to 4 learning modes (exploration, goal-driven, exam, synthesis)
- Uses knowledge graph to inform selection
- Balances dueness, difficulty, and serendipity
- Strategy pattern for mode-specific selection

**Implementation:**

```
Selection Process:
  1. Get candidate cards (due soon + random exploration)
  2. Get knowledge graph context (prerequisites, relationships)
  3. Get dueness scores from scheduler
  4. Apply mode-specific strategy:
     - Exploration: breadth + serendipity
     - Goal-driven: target optimization
     - Exam: coverage + weak spots
     - Synthesis: cross-domain connections
  5. LLM selects card with reasoning

Patterns: Strategy (modes), Observer (user progress), Planner
```

---

### 5.3 Diagnostic Agent

**What:** Analyzes 7-frame thinking traces to diagnose failures and generate
patch plans

**Why for Noema:**

- Visitor pattern to analyze each frame
- Classifies into 10 failure families
- Generates immediate/optional/escalation patches
- Respects intrusiveness budget

**Implementation:**

```
Analysis Process:
  1. Visit each frame (0-6) with frame-specific analyzers
  2. Extract frame-level features
  3. Load failure taxonomy
  4. LLM synthesizes diagnosis with confidence
  5. Generate patch plan based on failure family
  6. Respect intrusiveness and time budgets

Patterns: Visitor (frames), Strategy (patches), Factory (remediation cards)
```

---

### 5.4 Content Generation Agent

**What:** Generates and enhances cards using knowledge graph context and AI

**Why for Noema:**

- Creates cards from topics with appropriate difficulty
- Enhances existing cards (hints, images, alternatives)
- Uses knowledge graph to ensure coherence
- Factory pattern creates type-specific cards

**Implementation:**

```
Generation Process:
  1. Get concept context from knowledge graph
  2. Get existing cards to avoid duplication
  3. LLM generates card drafts with reasoning
  4. Factory creates actual cards by type
  5. Validate and enhance

Enhancement:
  - Add hints (progressive disclosure)
  - Suggest images/diagrams
  - Generate alternative phrasings
  - Link to related concepts

Patterns: Factory (create cards), Template, Generator
```

---

### 5.5 Knowledge Graph Agent

**What:** Proposes CKG mutations via DSL and directly updates PKG

**Why for Noema:**

- Different authority levels: PKG (direct), CKG (propose only)
- Generates formal DSL proposals for canonical updates
- Justifies mutations with evidence and reasoning
- Cannot bypass validation pipeline

**Implementation:**

```
CKG Proposal Flow:
  1. Analyze evidence and aggregated signals
  2. Generate mutation DSL proposal
  3. Include justification and evidence references
  4. Submit to typestate pipeline
  5. Pipeline validates (syntax, guards, ontology, invariants, TLA+)
  6. Commit or reject

PKG Direct Update:
  1. Generate PKG update from new attempt
  2. Validate against PKG constraints
  3. Apply update directly
  4. No DSL gate needed

Patterns: DSL (generate proposals), Graph, Dual Model Authority
```

---

## 6. 📚 Learning Methods & Modes

### 6.1 Epistemic Modes (30 Modes)

**What:** 30 distinct learning modes defined by 5 dimensions (E, T, R, M, C)

**Why for Noema:**

- Formal taxonomy of cognitive operations
- Mode = (Epistemic Op, Tension Source, Representation, Metacognitive Level,
  Constraints)
- Supports diverse learning styles and goals
- Strategy pattern for mode selection

**Implementation:**

```
5 Dimensions:
  E: Epistemic Operation (10 types)
     recall, generation, discrimination, synthesis, prediction,
     explanation, evaluation, transformation, discovery, verification

  T: Tension Source (8 types)
     time_pressure, ambiguity, contradiction, incompleteness,
     complexity, novelty, error_injection, social_pressure

  R: Representation Space (5 types)
     verbal, visual, symbolic, spatial, multimodal

  M: Metacognitive Level (5 levels)
     none, monitoring, control, reflection, strategic

  C: Constraint Profile (6 types)
     accuracy, speed, completeness, efficiency, creativity, robustness

30 Modes Examples:
  - Active Recall (recall + time_pressure + verbal + monitoring)
  - Generative Elaboration (generation + incompleteness + multimodal + strategic)
  - Contrastive Learning (discrimination + contradiction + visual + control)
  - Socratic Dialogue (explanation + ambiguity + verbal + strategic)
  - Time-Pressure Cognitive (recall + time_pressure + any + none)
  - Thesis-Antithesis-Synthesis (synthesis + contradiction + symbolic + strategic)
  ... 24 more

Patterns: Strategy (mode selection), State (transitions), Template (execution)
```

---

## 7. 🎓 Teaching Approach Entities

### 7.1 Teaching Approach

**What:** Strategy pattern defining different pedagogical approaches (Socratic,
Inquiry-Based, etc.)

**Why for Noema:**

- 7+ distinct teaching methodologies
- Each with unique questioning style and scaffolding level
- Configurable interaction patterns
- Template pattern for dialogue execution

**Implementation:**

```
Approach Categories:
  socratic, inquiry_based, problem_based, discovery,
  direct_instruction, collaborative, case_based

Configuration:
  - questioningStyle: { type, sequence }
  - scaffoldingLevel: 0-1
  - feedbackTiming: immediate | delayed | adaptive
  - turnsPerConcept: number
  - allowedUserInitiatives: [question, challenge, example, hypothesis]

Socratic Method:
  Questioning Sequence:
    1. Clarification
    2. Assumption probe
    3. Evidence probe
    4. Perspective probe
    5. Implication probe
    6. Question about question
  Low scaffolding (0.3), delayed feedback, 8 turns/concept

Inquiry-Based:
  Questioning Sequence:
    1. Observation prompt
    2. Hypothesis generation
    3. Evidence collection
    4. Conclusion drawing
  Medium scaffolding (0.6), adaptive feedback, 12 turns/concept

Patterns: Strategy (approaches), Template (dialogue), Observer, State Machine
```

---

## 8. 📥 Ingestion Pipeline Entities

### 8.1 Ingestion Job

**What:** Long-running saga managing multi-stage document import with state
machine

**Why for Noema:**

- Handles 13 file formats (CSV, XLSX, MD, PDF, DOCX, Anki, etc.)
- State machine tracks progress (CREATED → UPLOADING → PARSING → ... →
  COMMITTED)
- Saga pattern with compensation for failures
- Stores pipeline state as JSON for flexibility

**Implementation:**

```
State Machine:
  CREATED → UPLOADING → PARSING → ANALYZED → TRANSFORMING
  → MAPPING → PREVIEWING → COMMITTING → COMMITTED

Pipeline Stages:
  1. Upload: Multi-file upload with progress
  2. Parse: Format-specific parsers → Intermediate Representation
  3. Analyze: AI analysis of content structure
  4. Transform: ContentUnits → CardDrafts
  5. Map: Resolve entities (decks, categories)
  6. Preview: User review and editing
  7. Commit: Persist to database

Compensation:
  If stage N fails → rollback stages N-1, N-2, ...
  Partial commits supported

Patterns: Saga, State Machine, Pipeline, Compensating Transaction
```

---

### 8.2 Intermediate Representation

**What:** Universal document model with composite tree structure of content
units

**Why for Noema:**

- Format-agnostic representation
- 13 parsers → single IR format
- Visitor pattern for transformation
- Preserves document structure and hierarchy

**Implementation:**

```
IngestionDocument {
  contentHash, source { filename, format, mimeType }
  units: ContentUnit[] (tree structure)
  metadata: { title, frontmatter }
}

ContentUnit {
  unitId, unitType, content, depth, parentUnitId, position
  children: ContentUnit[] (recursive)
}

Unit Types:
  heading, paragraph, list_item, table_row, code_block, blockquote

Transformation:
  CardExtractionVisitor visits units:
    - Heading + children → atomic card
    - Paragraph → definition card
    - List items → cloze cards
    - Table rows → comparison cards

Patterns: Composite (tree), Visitor (transformation), Abstract Factory (parsers)
```

---

### 8.3 Card Draft

**What:** Temporary entity representing proposed card before commit

**Why for Noema:**

- Builder pattern for incremental construction
- AI suggestions for difficulty, categories, tags
- Validation before commit
- Source tracking to original content units

**Implementation:**

```
CardDraft {
  draftId, jobId
  type, content (partial)
  sourceUnits, sourceLines
  suggestedDifficulty, suggestedCategories, suggestedTags
  validated, errors, warnings
}

Builder:
  CardDraftBuilder
    .fromContentUnit(unit)
    .withType('cloze')
    .withContent({ front, back })
    .suggestDifficulty(0.7)
    .build()

Validation:
  - Required fields present
  - Content format valid for type
  - Referenced entities exist

Patterns: Builder, Factory, Specification (validation)
```

---

## 9. ⚙️ Settings Entities

### 9.1 Settings Hierarchy (6 Levels)

**What:** Chain of responsibility for settings resolution across 6 scopes

**Why for Noema:**

- Most specific scope wins (Device > Session > Template > Deck > Profile >
  Global)
- 10 setting categories
- LKGC (Last Known Good Configuration) for rollback
- Memento pattern for configuration snapshots

**Implementation:**

```
6 Scopes (most specific wins):
  1. Device (this device only)
  2. Session (this learning session)
  3. Template (card template settings)
  4. Deck (deck-specific settings)
  5. Profile (user profile)
  6. Global (default settings)

10 Categories:
  study_goals, scheduler_config, display_preferences, audio_tts,
  notifications, privacy, sync, accessibility, ai_preferences, plugin_config

Resolution:
  getSetting(key, context) → check Device → Session → Template → Deck → Profile → Global

LKGC:
  ConfigurationSnapshot { version, timestamp, settings, reason }
  saveSnapshot(), rollback(version)

Patterns: Chain of Responsibility, Composite (hierarchy), Memento, Strategy
```

---

## 10. 📊 Telemetry Entities

### 10.1 Telemetry Events

**What:** Three event streams (Attempt, Assist, UI) for comprehensive behavior
tracking

**Why for Noema:**

- Event sourcing foundation for all analytics
- CQRS separates writes (events) from reads (statistics)
- Observer pattern for multiple processors
- Stream processing for real-time reactions

**Implementation:**

```
Three Event Streams:

AttemptEvent:
  Card review attempts
  { rating, responseTime, confidence, strategy, assistsUsed }
  { schedulerAlgorithm, difficultyChanges, intervalChanges }

AssistEvent:
  Help requests during review
  { assistType: hint_requested | answer_revealed | explanation_requested }

UIEvent:
  User interactions
  { uiAction: card_flipped | answer_edited | confidence_adjusted }

Event Processors (Observer):
  - TraceAssemblerObserver → builds 7-frame traces
  - MetricsObserver → updates dashboards
  - AnalyticsObserver → aggregates statistics

Patterns: Event Sourcing, CQRS, Observer, Stream Processing
```

---

## 11. 👥 Collaboration Entities

### 11.1 Collaboration Room

**What:** Aggregate managing collaborative study groups with shared resources

**Why for Noema:**

- Multi-user study groups and classes
- Shared decks and categories with permissions
- Chat and activity feed
- CQRS for read-heavy activity queries

**Implementation:**

```
Room {
  id, name, type: study_group | class | shared_deck
  members: [ { userId, role, joinedAt, lastActive } ]
  permissions: RoomPermissions
  sharedDecks, sharedCategories
  chat, activities
}

Member Roles:
  owner (all permissions)
  admin (manage members, share resources)
  member (contribute)
  viewer (read-only)

CQRS Models:
  Write: addMember, removeMember, shareDeck, postMessage
  Read: getMembers, getSharedDecks, getChatHistory, getActivityFeed

Patterns: Aggregate, Observer (notifications), CQRS, Event Sourcing
```

---

## 12. 🎨 Media Entities

### 12.1 Media Asset

**What:** Media with strategy pattern processors and proxy for lazy loading

**Why for Noema:**

- 4 media types (image, audio, video, document)
- Format-specific processing (thumbnails, OCR, transcription)
- State machine for processing lifecycle
- Proxy pattern for lazy loading

**Implementation:**

```
Media Types:
  image: resize, compress, thumbnail, OCR
  audio: transcode, waveform, transcription
  video: transcode, thumbnails, subtitles
  document: extract text, metadata

Processing States:
  UPLOADING → PROCESSING → READY (or FAILED)

Processor Strategy:
  ImageProcessor: generateThumbnail(), compress(), extractText()
  AudioProcessor: transcode(), transcribe()
  VideoProcessor: transcode(), generateThumbnails()

Factory:
  MediaProcessorFactory.create(type) → appropriate processor

Proxy:
  MediaAssetProxy.getAsset() → lazy loads on first access

Patterns: Strategy (processors), Factory, Proxy (lazy loading), State (processing)
```

---

## 📊 Summary: Patterns per Entity Category

| Category            | Primary Patterns                                                                                      | Entity Count      |
| ------------------- | ----------------------------------------------------------------------------------------------------- | ----------------- |
| Core Learning       | Entity, Value Object, Aggregate, Repository, Factory, Builder, Specification, Snapshot, State Machine | 5 entities        |
| Metacognition       | Chain of Responsibility, Composite, Visitor, Strategy, Observer, Template Method                      | 4 entities        |
| Knowledge Graph     | Graph, Dual Model, Layered Architecture, DSL, Typestate, Formal Verification                          | 5 entities        |
| Gamification        | Value Object, Event Sourcing, CQRS, Observer, Specification, State Machine                            | 4 entities        |
| Agents              | Template Method, ReAct, Strategy, Chain of Responsibility, Visitor, Factory, Planner                  | 10 agents         |
| Learning Modes      | Strategy, State, Template                                                                             | 30 modes          |
| Teaching Approaches | Strategy, Template, Observer, State Machine                                                           | 7+ approaches     |
| Ingestion           | Saga, State Machine, Pipeline, Composite, Visitor, Builder, Factory                                   | 5 entities        |
| Settings            | Chain of Responsibility, Composite, Memento, Strategy                                                 | 6-level hierarchy |
| Telemetry           | Event Sourcing, CQRS, Observer, Stream Processing                                                     | 3 event types     |
| Collaboration       | Aggregate, Observer, CQRS, Event Sourcing                                                             | 2 entities        |
| Media               | Strategy, Factory, Proxy, State                                                                       | 4 types           |

**Total: 60+ distinct patterns applied across 100+ entity types**

---

## 🎯 Pattern Application Principles

### 1. Consistency First

- Use **shared domain model** (packages/types) - NO bounded contexts
- Same Card entity across all services
- Each service focuses on different fields but sees the whole

### 2. Event-Driven Architecture

- **Event Sourcing** for state changes
- **CQRS** for read/write separation
- **Observer Pattern** for reactions
- **Pub/Sub** for loose coupling

### 3. Agent-First Design

- All tools return **Enhanced AgentHints v2.0.0**
- All APIs include agentHints in responses
- **Template Method** for agent skeleton
- **ReAct Pattern** for agent loops
- **Strategy Pattern** for different agent behaviors

### 4. Formal Correctness Where Critical

- **Typestate Pattern** for CKG mutations
- **DSL Pattern** for safe graph operations
- **Layered Architecture** (5 layers) for knowledge graphs
- **State Machine** for session/job lifecycles

### 5. Performance & Scale

- **Cache-Aside** for frequently accessed data
- **Lazy Loading** for related entities
- **Batch Processing** for bulk operations
- **CQRS** for read-heavy operations

### 6. Flexibility & Extension

- **Factory Pattern** for polymorphic creation (22 card types)
- **Strategy Pattern** for swappable algorithms (4 schedulers, 30 modes)
- **Builder Pattern** for complex construction
- **Decorator Pattern** for capability composition

---

## 🔗 Cross-Cutting Concerns

### Data Consistency

- **Unit of Work** for multi-entity transactions
- **Saga Pattern** for distributed transactions
- **Event Sourcing** for audit trail
- **Optimistic Locking** (version field) for conflicts

### Hierarchy & Composition

- **Composite Pattern** for categories, content units
- **Adjacency List** for parent-child in DB
- **Nested Set** for fast subtree queries

### State Management

- **State Machine** for sessions, ingestion jobs, media processing
- **Memento** for undo/redo, configuration snapshots
- **Event Sourcing** for time travel

### Extensibility

- **Plugin Architecture** for future extensions
- **Strategy Pattern** for swappable components
- **Observer Pattern** for reactive features

---

**This comprehensive pattern catalog ensures architectural consistency across
all 100+ entity types in Noema while maintaining flexibility for future
evolution.** 🚀
