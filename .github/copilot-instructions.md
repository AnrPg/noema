# GitHub Copilot Instructions for Noema

## Project Context

- Read [PROJECT_CONTEXT.md](../.copilot/instructions/PROJECT_CONTEXT.md), then,
  based on the files with respective specifications, help me with the
  implementation. The design process should follow the principles in
  PROJECT_CONTEXT.md (APIs and schema first, follow the microservices pattern,
  expose agent tools and interfaces for agents etc). If there is any design
  decision you must take, first show me options with pros and cons and ask me to
  choose.

- Generate new code strictly in the existing project style and architecture,
  fully conforming to current schemas, APIs, types, models, and patterns;
  maximize reuse of existing implementations, favor additive and minimally
  invasive changes over redesign or refactoring, and if you detect that
  modifying or breaking existing behavior is unavoidable, trigger the harness to
  stop and explicitly ask for my approval before proceeding; after
  implementation, resolve all errors, warnings, and inconsistencies (including
  pre-existing ones), request clarification for any architectural decisions,
  produce an ADR documenting the changes, and commit with clear, structured
  messages.

- I want you to make sure that no errors, or warnings or uncommited changes
  remain in the codebase after your implementation. If you detect any, please
  ask me to approve fixing them before proceeding with new implementations.

- Also, before you begin implementing and writing code, tell me with details
  about the design decisions you have taken, and ask for my approval before
  proceeding. If there are any design decisions that you are not sure about,
  please present me with options and their pros and cons, and ask me to choose
  before proceeding. let's make sure we are on the same page about the design
  before you start implementing. we can do some banter about the design to make
  sure we are aligned. be analytical, detailed, and thorough in your design
  explanations and discussions.

- I generally prefer more complex solutions than simpler ones, given that they
  are more powerful and flexible, and I trust your judgment in finding the right
  balance. I also prefer solutions that are more aligned with the existing
  architecture and patterns of the codebase, even if they require more effort to
  implement, as long as they don't introduce significant technical debt or
  maintenance challenges.

- Do not optimize prematurely, but do consider the long-term implications of
  design choices, especially in terms of scalability, maintainability, and
  extensibility.

- Do not optimize for short-term speed of implementation at the cost of code
  quality, architectural integrity, or alignment with project conventions. I
  value well-designed, robust solutions that fit seamlessly into the existing
  codebase, even if they take more time to implement.

## What is Noema?

Noema is a **doctoral-level research platform** for metacognitive learning—an
**agent-first, API-first microservices architecture** combining spaced
repetition (FSRS), knowledge graphs (dual PKG/CKG), and LLM agents. **This is
not a flashcard app—this is a cognitive operating system for learning.**

---

## Platform Features Overview

### 1. Dual Knowledge Graph Architecture (PKG + CKG)

**Personal Knowledge Graph (PKG)** — Per-student, exploratory:

- Typed property graph with ontology-aware validation
- Direct validated updates (no DSL gate)
- Misconceptions represented explicitly
- Versioned and auditable

**Canonical Knowledge Graph (CKG)** — Global truth, formally guarded:

- 7-Layer Guardrail Stack:
  1. **Mutation DSL Gate** — All modifications via constrained DSL
  2. **Typestate Protocol** — Proposed → Validated → Proven → Committed
  3. **Ontology Verification** — Class hierarchy, domain/range constraints
  4. **UNITY Invariant Framework** — No circular prerequisites, no
     contradictions
  5. **TLA+ Commit Modeling** — Formal safety/liveness verification
  6. **CRDT Islands** — Limited to statistics, not semantic structure
  7. **Conflict Handling** — Reject + alert, no silent merge

**5-Layer Stratified Reasoning** (both graphs):

- Layer 0: Structural facts (ONLY mutable layer)
- Layer 1: Derived graph facts (transitive closure, cycles)
- Layer 2: Ontology classification
- Layer 3: Aggregated statistics
- Layer 4: Pedagogical/diagnostic metadata

### 2. Mental Debugger (7-Frame Cognitive Stack Trace)

Runtime model of learner's mind during one attempt—reconstructs the cognitive
cascade:

| Frame | Name                     | What It Captures                                                  |
| ----- | ------------------------ | ----------------------------------------------------------------- |
| 0     | **Context & Intent**     | Session mode, energy, stakes, strategy loadout                    |
| 1     | **Task Parsing**         | Task type interpretation, negations, constraints                  |
| 2     | **Cue Selection**        | What feature the learner latched onto (diagnostic vs superficial) |
| 3     | **Retrieval/Generation** | Direct recall, reconstruction, elimination, analogy, guess        |
| 4     | **Reasoning**            | Rules applied, representation shifts, comparisons                 |
| 5     | **Commitment**           | Timing, edit count, fluency trap, over-editing detection          |
| 6     | **Attribution**          | Outcome cause (process-based vs emotional)                        |

**Failure Taxonomy** — 10 families: Parsing, Retrieval, Prior Knowledge,
Confusable, Verification, Time Pressure, Monitoring, Commitment, Calibration,
Attribution

**20 Remediation Card Types**: Contrastive pair, minimal pair, false friend,
boundary case, rule scope, discriminant feature, counterexample, retrieval cue,
encoding repair, overwrite drill, etc.

### 3. Strategy Loadouts (Cognitive Control Policies)

Declarative configuration governing **how** the learner interacts with content,
feedback, time, and uncertainty.

**6 Policy Dimensions:**

1. **Intent Framing** — What "success" means (speed, accuracy, transfer,
   calibration)
2. **Pacing & Time Pressure** — Hard caps, adaptive, burst, uncapped
3. **Error Tolerance** — Cost level, visibility (immediate/delayed), retry
   policy
4. **Help & Hint Policy** — Availability, depth, AI assistance level
5. **Commitment & Verification** — Instant/two-step commit, verification gates
6. **Feedback & Reflection** — Tone, focus, attribution framing

**5 Canonical Loadout Archetypes:**

1. **Fast Recall Build** — Speed + coverage, hard time caps, instant commit
2. **Deep Understanding Build** — Transfer + robustness, no timebox
3. **Exam Survival Build** — Accuracy under stress, confidence marking
4. **Calibration Training Build** — Delayed correctness reveal, mandatory
   confidence
5. **Discrimination Build** — Confusable control, contrast emphasis

**Force Levels**: Informational → Suggest → Nudge → Gate → Enforce

### 4. Metacognition Training System

**Core Control Loop:** Intent → Strategy → Action → Signal → Attribution →
Adjustment

**Key Components:**

- **Mental Debugger** — Single source of cognitive truth (attribution hub)
- **Strategy Loadouts** — User's control surface for learning agency
- **Confidence vs Accuracy** — Calibration pressure system (Brier score, ECE)
- **Knowledge Graph** — Risk map, not just content navigator
- **AI Mirror** — Reflects debugger output, questions strategy choices
- **Cognitive State Layer** — Safety governor (fatigue, volatility, error
  cascades)

**Calibration Metrics:**

- Brier Score, Expected Calibration Error (ECE)
- Overconfidence/Underconfidence bias
- Metacognitive sensitivity (gamma, d')
- Dunning-Kruger indicator
- Confidence-accuracy correlation

### 5. Structural Metacognitive Metrics

**Abstraction Metrics:**

- Abstraction Drift (AD) — Mismatch between reasoning depth and target node
  depth
- Depth Calibration Gradient (DCG) — Correlation between confidence and node
  depth

**Boundary & Scope Metrics:**

- Scope Leakage Index (SLI) — Frequency of boundary violations
- Sibling Confusion Entropy (SCE) — Entropy of wrong sibling selection

**Connectivity Metrics:**

- Upward Link Strength (ULS) — Correct parent justification probability
- Traversal Breadth Score (TBS) — Neighbors considered before commit

**Metacognitive Progression Stages:**

1. **System-Guided** — System handles structure implicitly
2. **Structure-Salient** — Structure revealed at failure points
3. **Shared Control** — User participates in structure management
4. **User-Owned** — Expert structural responsibility assumed

### 6. Teaching & Learning Paradigms (30+ Epistemic Modes)

**I. Inquiry & Discovery:**

- Διερευνητική Μάθηση (Inquiry-Based Learning)
- Problem-Based Learning (PBL)
- Case-Based Learning

**II. Error-Centered Learning:**

- Loophole Learning (Spot-the-Mistake)
- Adversarial Learning Mode
- Contradiction Exposure

**III. Generative & Constructive:**

- Generative Retrieval Learning
- Reverse Learning (answer → reconstruct question)
- Teaching-to-Learn (Feynman Mode)
- Concept Recombination Learning

**IV. Meta-Cognitive Modes:**

- Confidence-Weighted Learning
- Prediction-Based Learning
- Error Pattern Reflection Mode

**V. Constraint-Based:**

- Minimal Information Learning
- No-Definition Mode
- Dimensional Translation (equation ↔ diagram ↔ code)

**VI. Game-Theoretic & Dynamic:**

- Escalation Mode (adaptive difficulty)
- Time-Pressure Cognitive Mode
- Ambiguity Tolerance Mode

**VII. Structural Knowledge:**

- Graph Completion Learning
- Hierarchy Reconstruction
- Causal Chain Completion

**VIII. Dialectical & Philosophical:**

- Thesis-Antithesis-Synthesis Mode
- Counterfactual Learning

**Formal Mode Definition:** `Mode = (E, T, R, M, C)` where:

- E = Epistemic Operation (10 types)
- T = Tension Source (8 types)
- R = Representation Space (5 types)
- M = Metacognitive Activation (5 levels)
- C = Constraint Profile (6 types)

### 7. Core Platform Features

| Feature                              | Description                                                         |
| ------------------------------------ | ------------------------------------------------------------------- |
| **Dynamic Concept Adaptation**       | AI restructures modules on-the-fly based on learner context         |
| **Contextual Example Generation**    | Context-rich examples tied to learner's domain and experience       |
| **Progressive Spaced Recall**        | Visual "learning landscapes" with fading/reappearing concepts       |
| **Meaningful Gamification**          | Rewards tied to learning science signals, not superficial wins      |
| **Bi-Directional Socratic Tutor**    | AI asks back, probing understanding with adaptive questioning       |
| **Augmented Memory Anchors**         | AI-assisted mnemonic and metaphor creation                          |
| **Collaborative Learning Ecosystem** | Async/real-time study rooms, peer teaching, social cognition        |
| **ELI5 & Depth Modes**               | Switch between simplicity and depth (ELI5 → Expert → Research)      |
| **Multi-Modal Memory Build**         | Text, voice, visuals, sketches, mini-games aligned with CLT         |
| **AI Document Ingestion**            | Parse PDF/slides/audio → auto-generate cards, quizzes, concept maps |
| **Learning Meteorologist**           | Predictive "weather forecasts" for knowledge fade/reinforcement     |
| **Learning Genome**                  | Lifelong cognitive profile tracking optimal strategies              |
| **Goal-Oriented Narratives**         | Study progress as narrative arcs with quests and milestones         |
| **Multi-Device Continuity**          | Seamless tablet → phone → desktop → wearable transitions            |

### 8. Card Types (22+)

Basic: Atomic, Cloze Deletion, Image Occlusion, Audio, True/False, MCQ,
Matching, Ordering, Definition

Advanced: Process/Pipeline, Comparison, Exception, Error-Spotting,
Confidence-Rated, Concept Graph, Case-Based, Multimodal, Transfer, Progressive
Disclosure, Cause-Effect, Timeline, Diagram

### 9. Scheduling Algorithms (4)

1. **FSRS v6.1.1** — Adaptive, 19 parameters, stability/difficulty tracking
2. **HLR (Half-Life Regression)** — Duolingo's algorithm
3. **SM-2** — SuperMemo classic
4. **Leitner System** — Box-based progression

---

## Architecture Principles (MANDATORY)

1. **Agent-First**: Agents are primary decision-makers. ALL APIs/tools MUST
   return `agentHints` to guide next actions
2. **API-First**: Define contracts BEFORE implementation. Use OpenAPI 3.1 specs
   in `docs/api/`
3. **Event-Driven**: Services communicate via events (Redis Streams). Publish
   events on ALL state changes
4. **Database-per-Service**: Each microservice owns its data. NO shared
   databases
5. **Offline-First**: Mobile client (React Native + WatermelonDB) must function
   without network

## Package Architecture

```
packages/           # Shared foundation (TypeScript)
  types/            # @noema/types - Branded IDs, enums, interfaces (I-prefix)
  validation/       # @noema/validation - Zod schemas for all types
  contracts/        # @noema/contracts - AgentHints, API response wrappers
  events/           # @noema/events - Base event types, schemas
  config/           # @noema/config - Environment configuration
  utils/            # @noema/utils - Shared utilities

services/           # 15 microservices (skeleton - to be implemented)
agents/             # 10 LLM agents (Python + FastAPI)
apps/mobile/        # React Native + Expo client
```

## Critical Conventions

### TypeScript Naming

- **Interfaces**: MUST use `I` prefix (e.g., `IBaseEvent`, `IUserProfile`) per
  ESLint rule
- **Type aliases**: PascalCase without prefix (e.g., `UserId`, `CardType`)
- **Enums**: PascalCase objects with `as const` pattern (NOT TypeScript enum
  keyword)
- **Imports**: Use `type` imports consistently (`import type { IFoo }`)

### Branded IDs (Type Safety)

All entity IDs are branded types in `@noema/types`. Use factory functions:

```typescript
import { createUserId, type UserId } from '@noema/types';
const userId: UserId = createUserId(); // user_abc123...
```

ID prefixes: `user_`, `card_`, `deck_`, `sess_`, `evt_`, `cor_`, `caus_`,
`agent_`

### Event Structure (REQUIRED)

Every event MUST extend `IBaseEvent` with:

- `eventId`, `eventType` (past tense: `card.created`), `aggregateType`,
  `aggregateId`
- `timestamp` (ISO 8601 UTC), `version`, `metadata`, `payload`

Use `@noema/validation` schemas for runtime validation.

### API Response Structure (ALL ENDPOINTS)

Every API response MUST include `agentHints` from `@noema/contracts`:

```typescript
import { type IAgentHints } from '@noema/contracts';
// Response shape: { data, agentHints, metadata }
```

## Implementation Specifications

Use templates in `.copilot/templates/` as MINIMUM structure:

- `SERVICE_CLASS_SPECIFICATION.md` - CRUD, validation, events, auth
- `AGENT_CLASS_SPECIFICATION.md` - ReAct loop, tools, traces
- `API_SPECIFICATION.md` - OpenAPI 3.1, agentHints, error codes
- `EVENT_SCHEMA_SPECIFICATION.md` - Base events, payload patterns
- `MCP_TOOL_SPECIFICATION.md` - Tool definitions for agent execution

## Development Commands

```bash
pnpm install          # Install all dependencies
pnpm build            # Turbo build all packages
pnpm lint             # ESLint check
pnpm lint:fix         # Auto-fix lint issues
pnpm test             # Run vitest tests
pnpm typecheck        # TypeScript type check
```

## Key Design Patterns

See `.copilot/instructions/DESIGN_PATTERNS_FOR_NOEMA.md` for more:

- **CQRS**: Separate read/write models
- **Event Sourcing**: Store state changes as events
- **Saga Pattern**: Distributed transactions across services
- **Repository Pattern**: Abstract data access
- **Factory Pattern**: Create entities (22 card types, 10 agents)

## Knowledge Graph Architecture

- **PKG (Personal)**: Per-student, exploratory, no mutation DSL gate
- **CKG (Canonical)**: Global truth, 7-layer guardrail stack (DSL → Typestate →
  Ontology → UNITY → TLA+ → CRDT → Conflict)

## Services Overview (15 Microservices)

| Service                 | Context                   | Key Events                                   |
| ----------------------- | ------------------------- | -------------------------------------------- |
| user-service            | Identity & IAM            | `user.created`, `user.settings.changed`      |
| content-service         | Cards, Decks              | `card.created`, `deck.created`               |
| scheduler-service       | FSRS Spaced Repetition    | `review.due`, `schedule.updated`             |
| session-service         | Learning Sessions         | `session.started`, `attempt.recorded`        |
| gamification-service    | XP, Streaks, Achievements | `xp.awarded`, `achievement.unlocked`         |
| knowledge-graph-service | PKG/CKG                   | `graph.mutated`, `misconception.detected`    |
| metacognition-service   | Traces, Diagnosis         | `trace.generated`, `diagnosis.made`          |
| strategy-service        | Cognitive Policies        | `strategy.changed`, `intervention.triggered` |

## Agents Overview (10 LLM Agents)

Learning, Diagnostic, Strategy, Content Generation, Socratic Tutor, Calibration,
Ingestion, Knowledge Graph, Taxonomy Curator, Governance

All agents implement ReAct pattern (Reason → Act → Observe) with full reasoning
traces.

## File References

### Architecture & Patterns

- [PROJECT_CONTEXT.md](../.copilot/instructions/PROJECT_CONTEXT.md) — Full
  project context
- [DESIGN_PATTERNS_FOR_NOEMA.md](../.copilot/instructions/DESIGN_PATTERNS_FOR_NOEMA.md)
  — Design patterns
- [ENTITY_PATTERNS_FOR_NOEMA.md](../.copilot/instructions/ENTITY_PATTERNS_FOR_NOEMA.md)
  — Entity patterns
- [SKELETON_FILES_SUMMARY.md](../.copilot/instructions/SKELETON_FILES_SUMMARY.md)
  — Implementation skeletons

### Feature Documentation

- [FEATURE_knowledge_graph.md](../.copilot/instructions/FEATURE_knowledge_graph.md)
  — Dual-graph architecture
- [FEATURE_mental_debugger.md](../.copilot/instructions/FEATURE_mental_debugger.md)
  — 7-frame cognitive stack trace
- [FEATURE_strategy_loadouts.md](../.copilot/instructions/FEATURE_strategy_loadouts.md)
  — Strategy loadout system
- [FEATURE_OVERVIEW_knowledge_graph.md](../.copilot/instructions/FEATURE_OVERVIEW_knowledge_graph.md)
  — Structural metrics
- [FEATURE_metacognition_extra_features.md](../.copilot/instructions/FEATURE_metacognition_extra_features.md)
  — Metacognition ecosystem
- [FEATURE_teaching_approaches.md](../.copilot/instructions/FEATURE_teaching_approaches.md)
  — 30+ epistemic modes
- [FEATURE_extra_features.md](../.copilot/instructions/FEATURE_extra_features.md)
  — Core platform features
- [Metacognitive_features_overview.md](../.copilot/instructions/Metacognitive_features_overview.md)
  — Training methods

### Implementation Status

- [GAPS_TO_FILL.md](../.copilot/instructions/GAPS_TO_FILL.md) — Implementation
  gaps
