# GitHub Copilot Instructions for Noema

## What is Noema?

Noema is a **doctoral-level research platform** for metacognitive learning — an
**agent-first, API-first microservices architecture** combining spaced
repetition (FSRS), dual knowledge graphs (PKG/CKG), and LLM agents. **This is
not a flashcard app — it is a cognitive operating system for learning.**

Always reason about the **full system architecture** before implementing
anything. Every feature touches multiple services, agents, and graph layers.
Design decisions must account for agent orchestration, event propagation, graph
consistency, and offline sync simultaneously.

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

## Critical Conventions

**TypeScript Naming**:

- Interfaces: `I` prefix required (`IBaseEvent`, `IUserProfile`) — enforced by
  ESLint
- Type aliases: PascalCase (`UserId`, `CardType`)
- Enums: `as const` objects (NOT TypeScript `enum` keyword)
- Imports: always use `import type { IFoo }`

**Branded IDs** — use factory functions from `@noema/types`:

```typescript
import { createUserId, type UserId } from '@noema/types';
const userId: UserId = createUserId(); // prefix: user_, card_, deck_, sess_, evt_, cor_, caus_, agent_
```

**Event Structure** — every event extends `IBaseEvent`:

- Required: `eventId`, `eventType` (past tense: `card.created`),
  `aggregateType`, `aggregateId`, `timestamp` (ISO 8601 UTC), `version`,
  `metadata`, `payload`
- Validate with `@noema/validation` schemas at runtime.

**API Response** — every endpoint must return:

```typescript
import { type IAgentHints } from '@noema/contracts';
// Shape: { data, agentHints, metadata }
```

**Design Patterns**: CQRS (separate read/write models), Event Sourcing (state as
events), Saga (distributed transactions), Repository (abstract data access),
Factory (22 card types, 10 agents) — see `DESIGN_PATTERNS_FOR_NOEMA.md`.

**Templates** (mandatory minimum structure in `.copilot/templates/`):
`SERVICE_CLASS_SPECIFICATION.md`, `AGENT_CLASS_SPECIFICATION.md`,
`API_SPECIFICATION.md`, `EVENT_SCHEMA_SPECIFICATION.md`,
`MCP_TOOL_SPECIFICATION.md`.

---

## File References

| File                                                                                                          | Purpose                                  |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| [`PROJECT_CONTEXT.md`](../.copilot/instructions/PROJECT_CONTEXT.md)                                           | Full project context — **read first**    |
| [`DESIGN_PATTERNS_FOR_NOEMA.md`](../.copilot/instructions/DESIGN_PATTERNS_FOR_NOEMA.md)                       | CQRS, Saga, Repository, Factory patterns |
| [`ENTITY_PATTERNS_FOR_NOEMA.md`](../.copilot/instructions/ENTITY_PATTERNS_FOR_NOEMA.md)                       | Entity and aggregate patterns            |
| [`SKELETON_FILES_SUMMARY.md`](../.copilot/instructions/SKELETON_FILES_SUMMARY.md)                             | Implementation skeletons                 |
| [`FEATURE_knowledge_graph.md`](../.copilot/instructions/FEATURE_knowledge_graph.md)                           | Dual-graph architecture detail           |
| [`FEATURE_mental_debugger.md`](../.copilot/instructions/FEATURE_mental_debugger.md)                           | 7-frame cognitive stack trace detail     |
| [`FEATURE_strategy_loadouts.md`](../.copilot/instructions/FEATURE_strategy_loadouts.md)                       | Strategy loadout system detail           |
| [`FEATURE_metacognition_extra_features.md`](../.copilot/instructions/FEATURE_metacognition_extra_features.md) | Metacognition ecosystem                  |
| [`FEATURE_teaching_approaches.md`](../.copilot/instructions/FEATURE_teaching_approaches.md)                   | 30+ epistemic mode definitions           |
| [`FEATURE_extra_features.md`](../.copilot/instructions/FEATURE_extra_features.md)                             | Core platform features                   |
| [`Metacognitive_features_overview.md`](../.copilot/instructions/Metacognitive_features_overview.md)           | Training methods overview                |

---

## Implementation Protocol (Follow Every Time)

1. **Read context first**: Start with `PROJECT_CONTEXT.md`, then relevant
   feature docs.
2. **Design before code**: Present design decisions with options + pros/cons.
   Get approval before writing a single line. Discuss architecture openly — be
   analytical and thorough.
3. **Schema/contract first**: Define OpenAPI spec and event schemas before any
   implementation.
4. **Prefer complex + correct over simple + wrong**: Do not optimize for
   short-term speed of implementation at the cost of code quality, architectural
   integrity, or alignment with project conventions. I value well-designed,
   robust solutions that fit seamlessly into the existing codebase, even if they
   take more time to implement.
5. **Additive changes only**: Maximize reuse. Minimally invasive. If breaking
   existing behavior is unavoidable, stop and get explicit approval. Always
   apply minimal changes to the existing code but extend it freely. In other
   words, do not change things that are irrelevant to the task given and do not
   change things that are already correct. Also when you spot something that can
   be optimised, stop, ask me (telling me the detailed pros/cons) and then
   implement only if I approve.
6. **Zero residue**: After implementation, resolve ALL errors, warnings, and
   uncommitted changes, no matter where they came from or if they are from
   previous prompts. Do not proceed with new implementations without fixing all
   and commit.
7. **Produce an ADR**: Document all architectural decisions. Commit with clear
   structured messages, in the dependency-preserving order of changes.
