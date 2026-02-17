# GitHub Copilot Instructions for Noema

## Project Context

Read [PROJECT_CONTEXT.md](../.copilot/instructions/PROJECT_CONTEXT.md), then,
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

## What is Noema?

Noema is a **doctoral-level research platform** for metacognitive learning—an
**agent-first, API-first microservices architecture** combining spaced
repetition (FSRS), knowledge graphs (dual PKG/CKG), and LLM agents. **This is
not a flashcard app—this is a cognitive operating system for learning.**

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

See `.copilot/instructions/DESIGN_PATTERNS_FOR_NOEMA.md`:

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

- Project Context:
  [PROJECT_CONTEXT.md](../.copilot/instructions/PROJECT_CONTEXT.md)
- Design Patterns:
  [DESIGN_PATTERNS_FOR_NOEMA.md](../.copilot/instructions/DESIGN_PATTERNS_FOR_NOEMA.md)
- Entity Patterns:
  [ENTITY_PATTERNS_FOR_NOEMA.md](../.copilot/instructions/ENTITY_PATTERNS_FOR_NOEMA.md)
- Implementation Gaps:
  [GAPS_TO_FILL.md](../.copilot/instructions/GAPS_TO_FILL.md)
- Skeleton Summary:
  [SKELETON_FILES_SUMMARY.md](../.copilot/instructions/SKELETON_FILES_SUMMARY.md)
