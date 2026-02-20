# Noema - AI-Enhanced Learning Platform

## Project Vision

Noema is a **doctoral-level research platform** for metacognitive learning, built as an **agent-first, API-first, microservices architecture**. It combines spaced repetition, knowledge graphs, and LLM agents to create a formal epistemic transformation system with adaptive state transitions.

**This is not a flashcard app. This is a cognitive operating system for learning.**

---

## Core Architectural Principles

### 1. 🤖 **Agent-First**
- **Agents are primary decision-makers and orchestrators**, not features
- Every service exposes agent-friendly APIs (MCP/Function Calling)
- All mutations return `agentHints` for next actions
- Agents coordinate complex multi-service workflows

### 2. 🔌 **API-First**
- API contracts defined BEFORE implementation (OpenAPI/GraphQL)
- Every endpoint designed for both human and agent consumption
- Contract testing ensures compatibility
- Versioned APIs (v1, v2, etc.)

### 3. 🏗️ **Microservices**
- 15+ independently deployable services
- Clear bounded contexts (DDD principles)
- Database per service (no shared databases)
- Event-driven communication via Event Bus

### 4. 📡 **Event-Driven**
- Services communicate via Event Bus (Redis Streams → Kafka)
- Asynchronous operations for eventual consistency
- Event sourcing for auditability
- Publish-subscribe pattern

### 5. 🎯 **Single Responsibility**
- Each service does one thing exceptionally well
- Clean separation of concerns
- Independently scalable
- Isolated failure domains

### 6. 💾 **Offline-First**
- Mobile app functions fully without network
- WatermelonDB for local storage
- Conflict resolution strategies
- Sync queue management

---

## Technology Stack

### Backend Services
- **Runtime**: Node.js + TypeScript
- **HTTP Framework**: Fastify (high-performance)
- **GraphQL**: Mercurius (GraphQL for Fastify)
- **ORM**: Prisma (type-safe database access)
- **Database**: PostgreSQL (per service)
- **Cache/Pub-Sub**: Redis
- **Validation**: Zod (runtime schema validation)

### AI/Agent Layer
- **Runtime**: Python + FastAPI
- **Agent Framework**: LangChain / LlamaIndex
- **LLMs**: OpenAI / Anthropic APIs
- **Embeddings**: sentence-transformers (local)
- **Vector Database**: Qdrant
- **Document Parsing**: PyMuPDF, pytesseract, python-docx, python-pptx

### Mobile Client
- **Framework**: React Native + Expo
- **Navigation**: Expo Router (file-based)
- **State Management**: Zustand (client state), TanStack Query (server state)
- **Styling**: NativeWind (Tailwind for React Native)
- **Offline DB**: WatermelonDB
- **Sync**: Custom sync protocol with conflict resolution

### Data Stores
- **Primary DB**: PostgreSQL (per service)
- **Cache**: Redis (sessions, real-time, pub-sub)
- **Vectors**: Qdrant (semantic search)
- **Files**: MinIO (S3-compatible object storage)
- **Analytics**: TimescaleDB or ClickHouse (time-series data)
- **Graph (optional)**: Neo4j or PostgreSQL with jsonb

### Infrastructure
- **API Gateway**: Kong or Traefik
- **Event Bus**: Redis Streams → Apache Kafka (later)
- **Service Discovery**: DNS-based or Consul
- **Observability**: Prometheus + Grafana + Jaeger + ELK
- **Container Orchestration**: Kubernetes + Helm

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  AGENT ORCHESTRATION LAYER                       │
│              (Primary Intelligence & Coordination)               │
├─────────────────────────────────────────────────────────────────┤
│  Learning Agent | Diagnostic Agent | Strategy Agent             │
│  Content Gen Agent | Ingestion Agent | Knowledge Graph Agent    │
│  Socratic Tutor | Calibration Agent | Governance Agent          │
│                                                                  │
│  • Agents coordinate all services via tool calls                │
│  • MCP/Function Calling interfaces                              │
│  • LangChain/LlamaIndex orchestration                           │
└─────────────────────────────────────────────────────────────────┘
                           ↕ Tool Calls
┌─────────────────────────────────────────────────────────────────┐
│                      API GATEWAY LAYER                           │
│  • Authentication/Authorization (JWT)                            │
│  • Rate Limiting                                                 │
│  • Request Validation                                            │
│  • API Versioning                                                │
│  • Load Balancing                                                │
└─────────────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────────────┐
│                  EVENT BUS (Message Broker)                      │
│                 Redis Streams → Apache Kafka                     │
│                                                                  │
│  Events: card.*, attempt.*, session.*, trace.*, diagnosis.*,    │
│          strategy.*, graph.*, achievement.*, xp.*               │
└─────────────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────────────┐
│                    MICROSERVICES LAYER                           │
│                                                                  │
│  User Service | Content Service | Scheduler Service             │
│  Session Service | Gamification Service                         │
│  Knowledge Graph Service | Metacognition Service                │
│  Strategy Service | Ingestion Service | Analytics Service       │
│  Sync Service | Vector Service | Notification Service           │
│  Media Service | Collaboration Service                          │
│                                                                  │
│  Each service: Independent deployment, own database              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Services (15+ Microservices)

### 1. **User Service**
- **Bounded Context**: Identity & Access Management
- **Database**: PostgreSQL + Redis
- **Owns**: Users, authentication, sessions, profiles, settings
- **Events Publishes**: `user.created`, `user.settings.changed`
- **Agent Tools**: `getUserProfile`, `updateSettings`, `authenticate`

### 2. **Content Service**
- **Bounded Context**: Learning Materials
- **Database**: PostgreSQL + MinIO
- **Owns**: Cards, decks, categories, templates, media references
- **Events Publishes**: `card.created`, `deck.created`, `category.created`
- **Agent Tools**: `createCard`, `searchCards`, `addToCategory`, `updateCard`

### 3. **Scheduler Service**
- **Bounded Context**: Spaced Repetition
- **Database**: PostgreSQL + Redis
- **Owns**: Review schedules, FSRS params, due queues, intervals
- **Events Subscribes**: `attempt.recorded` → update schedule
- **Events Publishes**: `review.due`, `schedule.updated`
- **Agent Tools**: `getReviewQueue`, `updateSchedule`, `predictRetention`

### 4. **Session Service**
- **Bounded Context**: Learning Sessions
- **Database**: PostgreSQL + Redis
- **Owns**: Active sessions, attempts, ratings, session state
- **Events Publishes**: `session.started`, `attempt.recorded`, `session.completed`
- **Agent Tools**: `startSession`, `recordAttempt`, `endSession`, `getSessionState`

### 5. **Gamification Service**
- **Bounded Context**: Motivation & Engagement
- **Database**: PostgreSQL
- **Owns**: XP, levels, streaks, achievements, badges, skill trees
- **Events Subscribes**: `session.completed`, `card.mastered`
- **Events Publishes**: `xp.awarded`, `achievement.unlocked`, `level.up`
- **Agent Tools**: `awardXP`, `unlockAchievement`, `getStreakStatus`

### 6. **Knowledge Graph Service**
- **Bounded Context**: Semantic Structure (PKG + CKG)
- **Database**: Neo4j or PostgreSQL (jsonb)
- **Owns**: Concepts, relations, ontologies, misconceptions
- **Events Publishes**: `graph.mutated`, `misconception.detected`
- **Agent Tools**: `addNode`, `addEdge`, `queryGraph`, `proposeMutation`, `validateProposal`

### 7. **Metacognition Service**
- **Bounded Context**: Diagnostic & Monitoring
- **Database**: PostgreSQL + TimescaleDB
- **Owns**: Telemetry, traces, features, diagnoses, calibration
- **Events Subscribes**: ALL interaction events
- **Events Publishes**: `trace.generated`, `diagnosis.made`
- **Agent Tools**: `queryTelemetry`, `getTrace`, `generateTrace`, `getDiagnosis`

### 8. **Strategy Service**
- **Bounded Context**: Cognitive Control Policies
- **Database**: PostgreSQL
- **Owns**: Loadouts, policies, force levels, budgets, history
- **Events Subscribes**: `diagnosis.made`
- **Events Publishes**: `strategy.changed`, `intervention.triggered`
- **Agent Tools**: `getLoadout`, `applyStrategy`, `evaluateStrategy`, `switchLoadout`

### 9. **Ingestion Service**
- **Bounded Context**: Document Processing
- **Database**: PostgreSQL + MinIO
- **Owns**: Jobs, parsing, IR, transformation, mapping
- **Events Publishes**: `job.created`, `job.completed`
- **Agent Tools**: `createJob`, `parse`, `analyze`, `transform`, `commit`

### 10. **Analytics Service**
- **Bounded Context**: Insights & Reporting
- **Database**: ClickHouse or TimescaleDB
- **Owns**: Aggregated metrics, dashboards, exports
- **Events Subscribes**: ALL events for analytics
- **Agent Tools**: `getInsights`, `generateReport`, `exportData`

### 11. **Sync Service**
- **Bounded Context**: Offline-First Synchronization
- **Database**: PostgreSQL
- **Owns**: Conflict resolution, pending changes, sync logs
- **Agent Tools**: `syncNow`, `resolveConflict`, `getSyncStatus`

### 12. **Vector Service**
- **Bounded Context**: Semantic Search
- **Database**: Qdrant
- **Owns**: Embeddings, similarity search, semantic indexing
- **Events Subscribes**: `card.created` → index card
- **Agent Tools**: `semanticSearch`, `findSimilar`, `indexContent`

### 13. **Notification Service**
- **Bounded Context**: Communications
- **Database**: PostgreSQL + Queue
- **Owns**: Emails, push notifications, in-app alerts, webhooks
- **Events Subscribes**: ALL events that trigger notifications
- **Agent Tools**: `sendEmail`, `sendPush`, `createAlert`

### 14. **Media Service**
- **Bounded Context**: File Processing
- **Database**: MinIO + PostgreSQL
- **Owns**: Image/audio/video processing, transcoding, OCR
- **Agent Tools**: `processImage`, `transcodeAudio`, `extractText`, `generateThumbnail`

### 15. **Collaboration Service**
- **Bounded Context**: Multi-User Features
- **Database**: PostgreSQL + Redis
- **Owns**: Study rooms, real-time presence, chat, sharing
- **Agent Tools**: `createRoom`, `shareContent`, `sendMessage`, `getPresence`

---

## Dual-Graph Knowledge Architecture

### Personal Knowledge Graph (PKG)
**Per Student - Exploratory & Flexible**

**Properties:**
- Typed property graph
- Ontology-aware validation
- Deterministic update API
- **NO mutation DSL gate** (students can experiment)
- Versioned & auditable
- Misconceptions represented explicitly
- Violations generate feedback but don't crash

**Mutation Model:**
- Direct validated updates
- Schema constraints enforced
- Ontology violations checked
- Operations logged
- Rejections with structured explanations

**Purpose:** Pedagogically flexible but not semantically anarchic

---

### Canonical Knowledge Graph (CKG)
**Global Truth - Formally Guarded**

**7-Layer Guardrail Stack:**

1. **Mutation DSL Gate** - All modifications via constrained DSL, no raw writes
2. **Typestate Protocol** - Proposed → Validated → Proven → Committed
3. **Ontology Verification** - Class hierarchy, domain/range, disjointness, acyclicity
4. **UNITY Invariant Framework** - No circular prerequisites, no contradictions
5. **TLA+ Commit Modeling** - Safety (no invariant violations), Liveness (proposals commit)
6. **CRDT Islands (Limited)** - Used ONLY for statistics, NOT semantic structure
7. **Conflict Handling** - Reject + alert, NO silent merge

**Interaction Flow (PKG → CKG):**
1. PKGs generate aggregated signals
2. Aggregation layer proposes mutation candidates
3. DSL mutation proposal generated
4. CKG guardrail pipeline validates
5. If safe → commit; If unsafe → alert

---

### 5-Layer Stratified Reasoning

Both graphs use stratified reasoning (no upward dependencies):

**Layer 0: Structural Base Facts** (ONLY MUTABLE LAYER)
- Nodes, edges, edge weights, types, attributes
- PKG: direct validated updates
- CKG: DSL-gated only

**Layer 1: Deterministic Graph Derivations** (immutable)
- Transitive closure, reachability, cycle detection, path summaries
- Derived from Layer 0 only
- No mutation authority

**Layer 2: Ontology Classification**
- Class membership, subclass relations, domain/range checks
- Uses Description Logic fragment
- Monotonic reasoning

**Layer 3: Aggregated & Statistical Signals**
- Edge confidence (crowdsourced), mastery averages, centrality
- May use CRDT counters (CKG side only)
- No semantic mutation authority

**Layer 4: Pedagogical & Diagnostic Layer**
- Misconception states, belief probabilities, intervention suggestions
- Probabilistic, agent-facing
- May update LearnerMisconceptionState in PKG

**Critical Rule:** Higher layers depend on lower layers. Lower layers NEVER depend on higher layers.

---

## Metacognition System

### Mental Debugger - 7-Frame Cognitive Stack Trace

The Mental Debugger creates a "stack trace of thinking" for each learning attempt:

**Frame 0: Context & Intent**
- Goal, stakes mode, strategy loadout, affective state, environment

**Frame 1: Task Parsing**
- Task type, instruction features, prompt focus, parsing confidence

**Frame 2: Cue Selection**
- What did learner latch onto? Diagnostic vs superficial cues

**Frame 3: Retrieval or Generation**
- Direct recall, reconstruction, elimination, analogy, guessing

**Frame 4: Reasoning & Transformation**
- Applying rules, translating representations, comparing options

**Frame 5: Commitment & Monitoring**
- When did they stop? Too fast (fluency trap) or over-editing?

**Frame 6: Outcome & Attribution**
- Why did this happen? Process-based vs emotional attribution

### 20 Special Remediation Card Types

1. Contrastive Pair Card
2. Minimal Pair Card
3. False Friend Card
4. Old-vs-New Definition Card
5. Boundary Case Card
6. Rule Scope Card
7. Discriminant Feature Card
8. Assumption Check Card
9. Counterexample Card
10. Representation Switch Card
11. Retrieval Cue Card
12. Encoding Repair Card
13. Overwrite Drill Card
14. Availability Bias Disconfirmation Card
15. Self-Check Ritual Card
16. Calibration Training Card
17. Attribution Reframing Card
18. Strategy Reminder Card
19. Confusable Set Drill Card
20. Partial-Knowledge Decomposition Card

### Strategy Loadouts - Cognitive Control Policies

**6 Subsystems Controlled:**
1. **Intent Framing** - What "success" means
2. **Pacing & Time Pressure** - Temporal constraints on cognition
3. **Error Tolerance** - What happens when wrong
4. **Help & Hint Policy** - When/how external cognition allowed
5. **Commitment & Verification** - When answer becomes "real"
6. **Feedback & Reflection** - How system talks back

**5 Canonical Loadout Archetypes:**
1. Fast Recall Build (speed + coverage)
2. Deep Understanding Build (transfer + robustness)
3. Exam Survival Build (accuracy under stress)
4. Calibration Training Build (confidence accuracy)
5. Discrimination Build (confusable control)

**5 Force Levels** (Informational → Suggest → Nudge → Gate → Enforce)

**Scope Dimensions:** Attempt → Item-subset → Cluster → Domain → Session → Profile

**Duration Types:** Time-based, Count-based, Stability-based, Manual, Resolution-based

---

## Core Features

### Card Types (22+ Types)
1. Atomic Cards (basic Q&A)
2. Cloze Deletion (fill-in-blank)
3. Image Occlusion (semantic image masking)
4. Audio Cards (listen & recall)
5. Process/Pipeline Cards (step sequences)
6. Comparison Cards (A vs B vs C)
7. Exception Cards (boundary conditions)
8. Error-Spotting Cards (find the mistake)
9. Confidence-Rated Cards (metacognition)
10. Concept Graph Cards (relation mapping)
11. Case-Based Cards (vignette → decision)
12. Multimodal Cards (text + image + audio)
13. Transfer Cards (novel contexts)
14. Progressive Disclosure (layered complexity)
15. Multiple Choice
16. True/False
17. Matching
18. Ordering
19. Definition
20. Cause-Effect
21. Timeline
22. Diagram

### Scheduling Algorithms (4)
1. **FSRS v6.1.1** (recommended) - Adaptive, 19 parameters, stability/difficulty tracking
2. **HLR (Half-Life Regression)** - Duolingo's algorithm, good for languages
3. **SM-2** - SuperMemo classic, simple and reliable
4. **Leitner System** - Box-based progression

### Learning Modes (4)
1. **Exploration** - Breadth, discovery, high serendipity
2. **Goal-Driven** - Specific targets, prerequisites, deadlines
3. **Exam-Oriented** - Time-pressured, coverage-focused
4. **Synthesis** - Cross-domain connections, bridge cards

### Gamification
- **XP & Levels** with quality multipliers
- **Streaks** with freezes and anti-burnout detection
- **Memory Integrity Score** (unique long-term retention metric)
- **Achievements** (7 categories, 5 rarity levels)
- **Mastery Badges** (90-180+ day retention proof)
- **Skill Trees** with prerequisites

### Progressive Capability Revelation (6 Tiers)
Features unlock based on engagement:
- Tier 1: neighborhood_preview (20 cards, 3 categories)
- Tier 2: lens_selector_advanced (50 cards, 5 categories)
- Tier 3: context_wheel (75 cards, 7 categories, 7 days active)
- Tier 4: territory_map (100 cards, 10 categories, 14 days active)
- Tier 5: learning_modes (150 cards, 50 participations, 21 days active)
- Tier 6: refactor_tools (200 cards, 15 categories, 30 days active)

---

## Epistemic Learning Modes (30 Modes)

### I. Inquiry & Discovery (3)
1. Διερευνητική Μάθηση (Inquiry-Based Learning)
2. Problem-Based Learning
3. Case-Based Learning

### II. Error-Centered (3)
4. Loophole Learning (Spot-the-Mistake)
5. Adversarial Learning
6. Contradiction Exposure

### III. Generative & Constructive (4)
7. Generative Retrieval
8. Reverse Learning
9. Teaching-to-Learn (Feynman)
10. Concept Recombination

### IV. Meta-Cognitive (3)
11. Confidence-Weighted Learning
12. Prediction-Based Learning
13. Error Pattern Reflection

### V. Constraint-Based (3)
14. Minimal Information Learning
15. No-Definition Mode
16. Dimensional Translation

### VI. Game-Theoretic & Dynamic (3)
17. Escalation Mode
18. Time-Pressure Cognitive Mode
19. Ambiguity Tolerance Mode

### VII. Structural Knowledge (3)
20. Graph Completion Learning
21. Hierarchy Reconstruction
22. Causal Chain Completion

### VIII. Dialectical & Philosophical (2)
23. Thesis-Antithesis-Synthesis
24. Counterfactual Learning

### IX. Sensory & Representation (2)
25. Multi-Representation Mode
26. Perturbation Learning

### X. Advanced Experimental (4)
27. Adaptive Misconception Injection
28. Cognitive Drift Detection
29. Knowledge Compression
30. Explain-Your-Algorithm Mode

**Formal Mode Definition:** `Mode = (E, T, R, M, C)`
- E = Epistemic Operation (10 types)
- T = Tension Source (8 types)
- R = Representation Space (5 types)
- M = Metacognitive Activation (5 levels)
- C = Constraint Profile (6 types)

---

## Coding Conventions

### Type System
```typescript
// Branded types for type safety
export type UserId = string & { readonly __brand: "UserId" };
export type CardId = string & { readonly __brand: "CardId" };
export type DeckId = string & { readonly __brand: "DeckId" };
export type CategoryId = string & { readonly __brand: "CategoryId" };

// Discriminated unions
export type CardType = "atomic" | "cloze" | "image_occlusion" | ...;
export type EventType = "attempt" | "session" | "trace" | ...;

// Readonly interfaces for immutability
export interface Card {
  readonly id: CardId;
  readonly type: CardType;
  readonly content: CardContent;
}
```

### Validation
```typescript
import { z } from 'zod';

// Zod for runtime validation at API boundaries
const CardSchema = z.object({
  type: z.enum(['atomic', 'cloze', 'image_occlusion']),
  content: z.object({...})
});
```

### Event Sourcing
```typescript
// All state changes as immutable events
interface Event {
  readonly eventId: string;
  readonly eventType: EventType;
  readonly aggregateId: string;
  readonly timestamp: string;  // ISO UTC
  readonly payload: unknown;
  readonly version: number;
}
```

### Agent Tool Pattern
```typescript
// Every service exposes tools for agents
interface ServiceTools {
  operationName: {
    description: string;
    parameters: ZodSchema;
    returns: {
      data: T;
      agentHints: {
        suggestedNextActions: string[];
        relatedResources: ResourceId[];
        confidence: number;
      }
    }
  }
}
```

### Event Publishing
```typescript
// Publish events to Event Bus
await eventBus.publish('domain.entity.action', {
  entityId,
  data,
  metadata: {
    timestamp: new Date().toISOString(),
    userId,
    version
  }
});
```

---

## Agent System

### Agent Roles

**Online Agents:**
1. **Learning Agent** - Session planning, content selection, mode switching
2. **Diagnostic Agent** - Trace analysis, failure diagnosis, pattern detection
3. **Strategy Agent** - Loadout selection, policy enforcement, adaptation
4. **Content Generation Agent** - Card creation, enhancement, adaptation
5. **Socratic Tutor Agent** - Inquiry dialogue, adversarial questioning
6. **Calibration Agent** - Confidence tracking, metacognitive feedback
7. **Ingestion Agent** - Document parsing, hint generation, transformation
8. **Knowledge Graph Agent** - PKG evolution, CKG proposals

**Offline/Admin Agents:**
9. **Taxonomy Curator Agent** - Failure type evolution, pattern refinement
10. **Governance Agent** - Safety monitoring, budget enforcement, compliance

### Agent Constraints

**Agents MAY:**
- Read PKG/CKG processed summaries
- Propose CKG mutations via DSL
- Mutate PKG (with validation)
- Call other agents
- Use all service tools

**Agents MAY NOT:**
- Mutate CKG directly (must go through DSL + guardrails)
- Bypass validation layers
- Modify invariants or ontology schema
- Alter derived layers (Layer 1-4)

---

## Implementation Phases

### Phase 0: API Contracts & Agent Interfaces (Weeks 1-2)
- Define all agent contracts
- Define OpenAPI/GraphQL schemas for all services
- Define event schemas
- Contract testing framework

### Phase 1: Infrastructure & Foundations (Weeks 3-4)
- Monorepo setup (Turborepo)
- Docker Compose for local dev
- API Gateway + Event Bus setup
- Observability stack (Prometheus, Grafana, Jaeger, ELK)
- Shared libraries (@noema/types, @noema/events, @noema/agent-contracts)

### Phase 2: Core Services (Weeks 5-10)
Build in parallel:
- User Service (auth, profiles, settings)
- Content Service (cards, decks, categories)
- Scheduler Service (FSRS, SM-2, Leitner, queues)
- Session Service (sessions, attempts, ratings)
- Vector Service (Qdrant, embeddings, semantic search)

### Phase 3: Gamification & Analytics (Weeks 11-14)
- Gamification Service (XP, streaks, achievements, MIS)
- Analytics Service (metrics, dashboards, exports)

### Phase 4: Knowledge Graph Service (Weeks 15-20)
- Graph data models (PKG + CKG)
- PKG operations (CRUD with validation)
- CKG guardrails (DSL, typestate, ontology, UNITY, TLA+)
- Stratified reasoning (Layer 0-4)

### Phase 5: Agent Orchestration Layer (Weeks 21-28)
- Agent runtime (LangChain/LlamaIndex)
- Tool registry
- Core agents (Learning, Content Gen, Socratic Tutor)
- Diagnostic agents (Diagnostic, Calibration, Governance)
- Strategic agents (Strategy, KG, Ingestion)

### Phase 6: Metacognition Services (Weeks 29-34)
- Metacognition Service (telemetry, events)
- Trace Service (7-frame traces, features)
- Strategy Service (loadouts, policies)
- Mental Debugger integration

### Phase 7: Ingestion & Media Services (Weeks 35-38)
- Media Service (image, audio, video, OCR)
- Ingestion Service (parsers, IR, transformation)

### Phase 8: Mobile App (Weeks 39-46)
- React Native + Expo foundation
- Core screens (home, review, browse, manage)
- Advanced UI (gamification, graphs, metacognition)
- Offline-first sync (WatermelonDB)

### Phase 9: Collaboration & Social (Weeks 47-50)
- Collaboration Service (rooms, chat, sharing)
- Notification Service (email, push, webhooks)

### Phase 10: Advanced Features (Weeks 51-60)
- Additional card types (22 total)
- Epistemic modes (30 modes)
- Advanced learning features (14 features)

### Phase 11: Production Readiness (Weeks 61-66)
- Testing (unit, integration, E2E, contract, load)
- Security & compliance (audit, pen test, GDPR)
- DevOps (K8s, Helm, IaC, monitoring, DR)

**Total Timeline:** 66 weeks (16.5 months)

---

## Document Ingestion Pipeline

### Mental Model: "Knowledge Refinery"
```
Raw Material (files) → Intake (parse) → Assay (analyze) → 
Refine (transform) → Mold (map) → QC (preview) → Pour (commit)
```

### Pipeline State Machine
```
CREATED → UPLOADING → PARSING → ANALYZED → TRANSFORMING →
MAPPING → PREVIEWING → COMMITTING → COMMITTED
```

### Universal Intermediate Representation
```typescript
interface IngestionDocument {
  contentHash: string;
  source: {
    filename: string;
    format: SourceFormat;
    mimeType: string;
  };
  units: ContentUnit[];  // Atomic chunks
  metadata: {
    title?: string;
    frontmatter: Record<string, unknown>;
  };
}

interface ContentUnit {
  unitId: string;
  unitType: 'heading' | 'paragraph' | 'list_item' | 'table_row' | ...;
  content: { text: string; ... };
  depth: number;
  parentUnitId?: string;
  position: number;
}
```

### Supported Formats (13)
- CSV/TSV (papaparse)
- XLSX (SheetJS)
- JSON/YAML (native)
- Markdown (marked)
- Obsidian MD (custom - preserves [[wikilinks]], #tags)
- HTML (cheerio)
- TXT (heuristic)
- Typst (CLI → HTML)
- PDF (PyMuPDF)
- DOCX (python-docx)
- PPTX (python-pptx)
- Anki (.apkg - SQLite)
- Images (pytesseract OCR)

---

## Categories as Lenses Paradigm

**Core Principle:** Cards exist once; categories define interpretive context.

A card can belong to multiple categories with different:
- **Framing questions** (epistemic prompts)
- **Semantic roles** (foundational, example, edge_case, counterexample)
- **Emphasis rules** and annotations
- **Context-specific scheduling** and mastery tracking

This is NOT "tags" or "folders" - it's orthogonal interpretive contexts.

---

## Settings System (6-Level Hierarchy)

**Scopes (most specific wins):**
1. Global
2. Profile
3. Deck
4. Template
5. Session
6. Device

**10 Setting Categories:**
- Study goals
- Scheduler config
- Display preferences
- Audio/TTS
- Notifications
- Privacy controls
- Sync settings
- Accessibility
- AI preferences
- Plugin config

**LKGC (Last Known Good Configuration):**
- Every config change versioned
- Rollback capability to any previous state
- Safety net for broken configurations

---

## Mathematical Foundations

### Category Theory Interpretation
- Graphs as categories (nodes = objects, edges = morphisms)
- CKG as constrained category with ontological typing
- PKG as freely generated category
- Learning trajectory as functor chain

### Type Theory
- Ontology as type system
- Domain/range constraints as type guards
- Disjointness as logical constraints

### UNITY Invariants
- No circular prerequisites
- No semantic category collapse
- No contradictory classifications
- Monotonic extension of validated relations

### TLA+ Verification
- Safety: no invariant violations
- Liveness: valid proposals eventually commit
- No partial commits
- No inconsistent observable states

### Semilattice CRDT
- Aggregation counters: (ℕ, max)
- Monotonic, commutative, associative, idempotent
- Used ONLY for Layer 3 statistics

### Bayesian Belief Dynamics
- Misconception belief: B_s : M → [0,1]
- Update: B'(m) = P(e|m)B(m) / Σ P(e|mⱼ)B(mⱼ)
- Temporal decay: B^(t+1)(m) = λB^t(m)
- Intervention threshold: B(m) > τ

---

## File Structure

```
noema/
├── services/                  # Microservices
│   ├── user-service/
│   ├── content-service/
│   ├── scheduler-service/
│   ├── session-service/
│   ├── gamification-service/
│   ├── knowledge-graph-service/
│   ├── metacognition-service/
│   ├── strategy-service/
│   ├── ingestion-service/
│   ├── analytics-service/
│   ├── sync-service/
│   ├── vector-service/
│   ├── notification-service/
│   ├── media-service/
│   ├── collaboration-service/
│   └── hlr-sidecar/          # Python FastAPI — HLR algorithm sidecar
│
├── third-party/               # External Algorithm Submodules
│   ├── fsrs4anki/            # Git submodule — FSRS v6.1.1 reference (JS)
│   └── halflife-regression/  # Git submodule — HLR (Python, Duolingo)
│
├── agents/                    # LLM Agents
│   ├── learning-agent/
│   ├── diagnostic-agent/
│   ├── strategy-agent/
│   ├── content-generation-agent/
│   ├── socratic-tutor-agent/
│   ├── calibration-agent/
│   ├── ingestion-agent/
│   ├── knowledge-graph-agent/
│   ├── taxonomy-curator-agent/
│   └── governance-agent/
│
├── packages/                  # Shared Code
│   ├── types/                # Shared TypeScript types
│   ├── events/               # Event schemas
│   ├── contracts/            # API contracts + agent tools
│   ├── validation/           # Zod schemas
│   └── utils/                # Shared utilities
│
├── apps/
│   └── mobile/               # React Native App
│       ├── app/              # Expo Router screens
│       ├── components/       # React components
│       ├── stores/           # Zustand stores
│       ├── services/         # API clients
│       └── db/               # WatermelonDB
│
├── infrastructure/           # Infrastructure as Code
│   ├── kubernetes/           # K8s manifests
│   ├── helm/                 # Helm charts
│   ├── terraform/            # Terraform configs
│   └── docker/               # Dockerfiles
│
└── docs/                     # Documentation
    ├── architecture/         # ADRs, design docs
    ├── api/                  # API documentation
    └── guides/               # Developer guides
```

---

## Current Implementation Status

**⚠️ CRITICAL: NOTHING IS IMPLEMENTED YET**

All documents are design specifications. This is a comprehensive architectural blueprint for a doctoral-level research platform. Implementation will proceed in phases as outlined above.

---

## Next Steps

1. ✅ **Define API Contracts** - OpenAPI/GraphQL schemas for all services
2. ✅ **Define Agent Tool Contracts** - MCP/Function calling interfaces
3. ✅ **Define Event Schemas** - All event types and payloads
4. ⏭️ **Ontologies & Enums** - Complete taxonomy definitions
5. ⏭️ **Database Schema Design** - Prisma schemas for all services
6. ⏭️ **Service Template Creation** - Reusable service scaffolding
7. ⏭️ **Mobile App IA** - Screen hierarchy and navigation flows

---

## Key Differentiators

### What This IS:
- **Formal epistemic transformation system** with adaptive state transitions
- **Cognitive operating system** for learning
- **Research platform** for metacognitive science
- **Agent-orchestrated** intelligent tutoring system
- **Knowledge graph-backed** semantic learning platform

### What This IS NOT:
- A flashcard app with AI features
- A traditional LMS
- A content management system
- A social learning platform (though it has social features)

---

## Design Philosophy

1. **Structure over Content** - Focus on how knowledge is organized and understood
2. **Metacognition over Memorization** - Train thinking, not recall
3. **Agents over Automation** - Intelligent orchestration, not simple automation
4. **Formal Rigor** - Mathematical foundations, not heuristics
5. **Research-Driven** - Every feature is a testable hypothesis
6. **Ethical by Design** - Privacy, consent, fairness built-in
7. **Open Science** - Publishable research, reproducible experiments

---

## Related Documentation

All detailed specifications available in `/mnt/project/`:
- `Noema_v2_0_knowledge_graph.docx` - Dual-graph architecture, guardrails, mathematical foundations
- `Noema_v2_0_mental_debugger.docx` - 7-frame traces, failure taxonomy, remediation cards
- `Noema_v2_0_strategy_loadouts.docx` - Cognitive control policies, force levels
- `Noema_v2_0_metacognition_overview.docx` - 10 training methods, 8 feature layers
- `Noema_v2_0_features.docx` - Complete feature list, tech stack
- `Noema_v2_0_learning_features.docx` - 14 advanced learning features
- `Noema_v2_0_teaching_approach_features.docx` - 30 epistemic modes
- `Noema_v2-0_ingestion-pipeline-design.md` - Document ingestion system
- `Noema_v2_0_other_metacognitive_features.docx` - Systems integration
- `Noema_v2_0_graph_metacognition.docx` - Structural metrics, progression model

---

**Last Updated:** 2024
**Architecture Status:** Design Complete, Implementation Pending
**Contact:** [Project Lead]
