# ADR-0015: Session Service — Contracts-First Implementation

## Status

**Accepted** — 2025-07-26

## Context

With the shared type system established (ADR-0014, commit `47af661`), the
session service is the next critical building block. It owns the entire
review-session lifecycle: starting, pausing, resuming, completing, and
abandoning sessions, as well as recording card attempts, managing the
per-session card queue, and handling strategy/teaching changes mid-session.

The service was implemented following a **contracts-first** protocol:

1. OpenAPI 3.1.0 specification written and validated before any code
2. Prisma schema designed to match event payloads exactly
3. Domain types, repository interface, and Zod schemas defined before implementation
4. Domain service, infrastructure, REST routes, and MCP tools built layer-by-layer
5. Each layer was type-checked against the shared packages before proceeding

### Key Design Constraints

| Constraint                      | Detail                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| FSM-based state transitions     | `active → paused → active`, `active → completed/abandoned/expired`                  |
| One active session per user     | Enforced in domain service before session creation                                  |
| Optimistic concurrency control  | `version` column with increment-on-write in repository                              |
| Event-driven architecture       | 12 domain events published to Redis Streams                                         |
| exactOptionalPropertyTypes      | Monorepo uses strict TypeScript; all optional assignments use conditional spread     |
| Branded IDs                     | SessionId, AttemptId, CardId, DeckQueryLogId, etc. — casts required after Zod parse |

## Decision

### 1. Service Architecture

```
session-service/
├── prisma/schema.prisma          # 3 models, 6 enums
├── src/
│   ├── types/session.types.ts    # Domain types (SessionState FSM, ISession, IAttempt, etc.)
│   ├── domain/
│   │   ├── shared/event-publisher.ts      # IEventPublisher interface
│   │   └── session-service/
│   │       ├── errors/                    # Full error hierarchy (10 error classes)
│   │       ├── session.repository.ts      # ISessionRepository interface
│   │       ├── session.schemas.ts         # Zod input validation schemas
│   │       └── session.service.ts         # Core domain service (~850 lines)
│   ├── infrastructure/
│   │   ├── cache/redis-event-publisher.ts # Redis Streams event publishing
│   │   └── database/prisma-session.repository.ts  # Prisma repository (~530 lines)
│   ├── api/rest/
│   │   ├── session.routes.ts              # 15 REST endpoints
│   │   └── health.routes.ts              # Kubernetes probes
│   ├── agents/tools/
│   │   ├── tool.types.ts                  # IToolHandlerResult, IToolResult
│   │   ├── session.tools.ts              # 5 MCP tool handlers
│   │   ├── tool.registry.ts             # Central tool registry
│   │   └── tool.routes.ts               # Tool discovery & execution endpoints
│   ├── middleware/auth.middleware.ts      # JWT verification via jose
│   ├── config/index.ts                   # Service configuration
│   └── index.ts                          # Bootstrap & Fastify setup
└── docs/api/openapi/session-service.yaml # OpenAPI 3.1.0 spec (~900 lines)
```

### 2. Data Model (Prisma)

Three models with PostgreSQL-backed storage:

- **Session** — Main entity with FSM state, config JSON, stats JSON, optimistic locking
- **Attempt** — Individual card review attempts linked to a session
- **SessionQueueItem** — Ordered card queue per session with injection support

Enum mapping between `@noema/types` (lowercase: `active`, `correct`) and Prisma
(UPPERCASE: `ACTIVE`, `CORRECT`) is handled entirely in the repository layer
via `toPrisma*`/`fromPrisma*` helper functions.

### 3. Domain Events (12)

| Event                       | Trigger                              |
| --------------------------- | ------------------------------------ |
| `session.started`           | New session created                  |
| `session.paused`            | User pauses session                  |
| `session.resumed`           | User resumes paused session          |
| `session.completed`         | Session ends (normal/limit/timeout)  |
| `session.abandoned`         | User abandons session                |
| `session.expired`           | Timeout-based expiration             |
| `attempt.recorded`          | Card attempt recorded (most critical)|
| `attempt.hint.requested`    | Hint requested during review         |
| `session.queue.injected`    | Agent injects card into queue        |
| `session.queue.removed`     | Card removed from queue              |
| `session.strategy.updated`  | Learning mode or algorithm changed   |
| `session.teaching.changed`  | Teaching approach changed mid-session|

Events are published as string literals (not imported from `@noema/events`)
because the events index uses `export type *`, making `SessionEventType` const
unavailable as a runtime value.

### 4. MCP Tools (5)

Per `AGENT_MCP_TOOL_REGISTRY.md`:

| Tool                    | Priority | Status   |
| ----------------------- | -------- | -------- |
| `get-session-history`   | P2       | Active   |
| `record-attempt`        | P0       | Active   |
| `get-attempt-history`   | P0       | Active   |
| `get-thinking-trace`    | P0       | **Stub** |
| `record-dialogue-turn`  | P1       | Stub     |

Tool handlers return a simplified `IToolHandlerResult` (`{ success, data, error }`).
The `ToolRegistry.execute()` method enriches this into a full `IToolExecutionResult`
with `agentHints` (via `createEmptyAgentHints()`) and proper error objects.

### 5. REST API (15 endpoints)

Full OpenAPI 3.1.0 specification at `docs/api/openapi/session-service.yaml`.

| Method | Path                                              | Purpose                    |
| ------ | ------------------------------------------------- | -------------------------- |
| POST   | `/v1/sessions`                                    | Start session              |
| GET    | `/v1/sessions`                                    | List sessions              |
| GET    | `/v1/sessions/:id`                                | Get session                |
| POST   | `/v1/sessions/:id/pause`                          | Pause                      |
| POST   | `/v1/sessions/:id/resume`                         | Resume                     |
| POST   | `/v1/sessions/:id/complete`                       | Complete                   |
| POST   | `/v1/sessions/:id/abandon`                        | Abandon                    |
| POST   | `/v1/sessions/:id/attempts`                       | Record attempt             |
| GET    | `/v1/sessions/:id/attempts`                       | List attempts              |
| POST   | `/v1/sessions/:id/attempts/:aid/hints`            | Request hint               |
| GET    | `/v1/sessions/:id/queue`                          | Get queue                  |
| POST   | `/v1/sessions/:id/queue/inject`                   | Inject into queue          |
| POST   | `/v1/sessions/:id/queue/remove`                   | Remove from queue          |
| POST   | `/v1/sessions/:id/strategy`                       | Update strategy            |
| POST   | `/v1/sessions/:id/teaching`                       | Change teaching approach   |

### 6. Deferred: Thinking Traces

The `get-thinking-trace` MCP tool is registered but returns a stub response.
Full thinking-trace capture (recording and retrieving the agent's reasoning
chain during card reviews) is deferred to **Phase 3+** when the metacognition
service and agent orchestration layer are implemented. The tool definition is
in place so that agent protocols can reference it now.

## Consequences

### Positive

- **Type safety end-to-end**: Branded IDs, Zod validation, and strict TypeScript
  ensure data integrity from API input to database to event payload
- **Contracts-first**: OpenAPI spec + Prisma schema + event interfaces were
  defined before implementation, reducing integration risk
- **Event-driven**: All state transitions publish events, enabling downstream
  services to react without coupling
- **FSM enforcement**: Invalid state transitions (e.g., pausing a completed
  session) are caught in the domain layer with descriptive errors
- **MCP-ready**: Tool registry pattern allows agent integration from day one

### Negative

- **Enum mapping overhead**: The toPrisma/fromPrisma layer adds boilerplate
  in the repository. This is the cost of using lowercase in domain types and
  UPPERCASE in Prisma (PostgreSQL convention)
- **exactOptionalPropertyTypes burden**: Many assignments require conditional
  spread patterns (`...(x !== undefined ? { x } : {})`) instead of simple
  assignment. Necessary for correctness but verbose
- **Thinking traces are stubs**: The `get-thinking-trace` tool cannot return
  real data until the metacognition pipeline exists

### Risks

- Session service depends on Redis for event publishing — Redis outage would
  prevent event propagation (mitigated by async event publishing with retry)
- The 1-active-session-per-user constraint may need relaxation for concurrent
  devices (can be revisited based on mobile sync requirements)

## References

- ADR-0014: Session & Scheduler Shared Type System
- ADR-0009: Agent Framework & MCP Integration
- `docs/api/openapi/session-service.yaml` — Full OpenAPI specification
- `docs/architecture/AGENT_MCP_TOOL_REGISTRY.md` — MCP tool registry
