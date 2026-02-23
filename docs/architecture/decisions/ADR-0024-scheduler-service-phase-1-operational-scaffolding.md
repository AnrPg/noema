# ADR-0024: Scheduler Service Phase 1 - Operational Scaffolding

**Status:** ✅ Accepted  
**Date:** 2026-02-22  
**Deciders:** Architecture Team  
**Related:** [ADR-0022](./ADR-0022-dual-lane-scheduler.md),
[ADR-0023](./ADR-0023-offline-intent-tokens.md),
[ADR-0009](./ADR-0009-scheduling-architecture-agent-service-split.md)

---

## Context

The scheduler-service was defined in ADR-0022 (dual-lane planning) and ADR-0023
(offline intent tokens) but lacked operational scaffolding. The service existed
as a domain module with core algorithms (FSRS, HLR) but had no HTTP surface, no
authentication, no health checks, and no integration with the runtime event
infrastructure.

This ADR documents **Phase 1** of scheduler-service operationalization:
establishing minimal production-ready scaffolding without database persistence,
enabling the service to receive HTTP requests, execute agent tools via MCP, and
publish events to the broader system.

## Decision

### Phase 1 Scope

Implement minimal operational surface for scheduler-service with:

1. **HTTP Bootstrap** - Fastify server with CORS, request correlation,
   structured logging
2. **Health Endpoints** - Kubernetes-compatible liveness/readiness probes with
   Redis connectivity checks
3. **Authentication Middleware** - JWT verification with optional dev bypass,
   mirroring session-service pattern
4. **REST API Routes** - Contract-aligned endpoints for dual-lane planning
5. **MCP Tool Execution** - HTTP routes for agent consumption of scheduler tools
   (list, execute)
6. **Event Publishing** - RedisEventPublisher integration for domain event
   emission
7. **Configuration Management** - Environment-based config for server, Redis,
   CORS, logging, security

### Explicitly Deferred (Phase 2+)

- **Event Consumers** - No listeners for SessionStarted, ReviewSubmitted,
  ContentSeeded yet
- **Database Persistence** - No PostgreSQL, no card state storage, no review
  history
- **Advanced Calibration** - No Bayesian parameter tuning, no confidence
  estimation
- **Adaptive Checkpoints** - No checkpoint signal processing (see ADR-0021)

### Key Implementation Details

#### Bootstrap Pattern (`src/index.ts`)

```typescript
async function bootstrap(): Promise<void> {
  // 1. Load config from environment
  // 2. Initialize structured logger (pino with optional pretty-printing)
  // 3. Connect to Redis
  // 4. Create RedisEventPublisher
  // 5. Instantiate SchedulerService with config
  // 6. Create ToolRegistry
  // 7. Setup Fastify with CORS, request ID, logger injection
  // 8. Create JWT auth middleware
  // 9. Register routes: health, scheduler REST, tool MCP
  // 10. Handle graceful shutdown (SIGTERM/SIGINT)
  // 11. Start listening on configured host/port
}
```

#### Auth Middleware (`src/api/middleware/auth.middleware.ts`)

- Uses `jose` library for JWT verification (matches session-service)
- Validates issuer, audience, signature
- Extracts `userId` and `roles` from token claims
- Augments FastifyRequest with authenticated user context
- Dev bypass via `AUTH_DISABLED=true` for local development
- Returns 401 Unauthorized on invalid tokens

#### Route Organization

**Health Routes** (`src/api/rest/health.routes.ts`):

- `GET /health` - Detailed health including Redis connectivity
- `GET /health/live` - Simple liveness probe
- `GET /health/ready` - Readiness probe with Redis ping

**Scheduler Routes** (`src/api/rest/scheduler.routes.ts`):

- `POST /v1/scheduler/plan-dual-lane` - Core dual-lane planning (contract
  endpoint)
- `POST /v1/schedule/plan` - Alias for backward compatibility
- Offline intent token issuance/verification is handled by `session-service`
  (see [ADR-0023](./ADR-0023-offline-intent-tokens.md))

**Tool Routes** (`src/agents/tools/tool.routes.ts`):

- `GET /v1/tools` - List available MCP tools
- `POST /v1/tools/execute` - Execute tool by name with payload

All endpoints authenticated via inline auth middleware calls (prevents Fastify
preHandler lint false positives).

#### Type System Alignment

- Re-exported branded types from `@noema/types`: `UserId`, `CorrelationId`,
  `CardId`
- Updated `IEventPublisher` interface to align with `@noema/events` package
- Ensured scheduler.service.ts uses nominal types throughout (no raw strings for
  IDs)

#### Configuration

Environment variables (see `.env.example`):

- `REDIS_URL` - Redis connection string
- `PORT` - HTTP server port (default: 3004)
- `HOST` - HTTP server host (default: 0.0.0.0)
- `CORS_ORIGIN` - CORS allowed origins
- `JWT_SECRET` / `ACCESS_TOKEN_SECRET` - JWT verification secret
- `JWT_ISSUER`, `JWT_AUDIENCE` - Token validation claims
- `LOG_LEVEL` - Pino log level (default: info)
- `LOG_PRETTY` - Enable pretty-printed logs for development
- `AUTH_DISABLED` - Bypass auth for local testing

### Dependencies Added

Runtime:

- `@fastify/cors` - CORS middleware
- `fastify` - HTTP framework
- `ioredis` - Redis client
- `pino`, `pino-pretty` - Structured logging
- `jose` - JWT operations
- `@noema/events` - Event type definitions and publisher interface

Scripts added to `package.json`:

- `dev` - Development server with watch mode
- `start` - Production server
- `lint` - ESLint with flat config

### Code Quality Enforcement

All Phase 1 code:

- ✅ Passes `tsc --noEmit` typecheck with zero errors
- ✅ Passes ESLint with strict TypeScript rules (no errors, no warnings)
- ✅ Uses explicit return type annotations for public functions
- ✅ No non-null assertions, no unnecessary type assertions
- ✅ Interfaces prefixed with `I` (naming convention)
- ✅ Catch callbacks typed as `unknown` (safe error handling)

Pre-existing HLR algorithm code also remediated for lint compliance (interface
naming, unnecessary conditionals, inferrable types).

## Consequences

### Positive

1. **Production-Ready Foundation** - Scheduler-service can now deploy to
   Kubernetes with proper health checks, graceful shutdown, structured logging
2. **Agent Integration** - MCP tool routes enable agents to invoke scheduling
   logic without direct service coupling
3. **Event-Driven Ready** - RedisEventPublisher wired up, ready for Phase 2
   event consumers
4. **Auth Consistency** - JWT middleware matches session-service, enabling
   unified authentication strategy
5. **Zero Technical Debt** - All Phase 1 code passes strict linting, no
   warnings, no type errors
6. **Developer Experience** - `.env.example` documents all required config,
   `dev` script enables rapid iteration

### Negative

1. **Stateless (Phase 1)** - No persistence means no review history, no card
   state durability (acceptable for Phase 1)
2. **No Event Consumption** - Service can publish events but not react to them
   yet (Phase 2 requirement)
3. **Dual Config Management** - Environment variables mirrored in IServiceConfig
   (will consolidate in Phase 3)

### Risks & Mitigations

| Risk                                                                           | Mitigation                                                                        |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **JWT Secret Mismatch** - Scheduler uses different secret than session-service | Document shared secret requirement in deployment guides, consider secrets manager |
| **CORS Misconfiguration** - Production origins not whitelisted                 | Default to strict CORS, require explicit `CORS_ORIGIN` in production              |
| **Redis Unavailable** - Scheduler cannot publish events                        | Health readiness probe fails → Kubernetes stops routing traffic                   |
| **No Rate Limiting** - Tool endpoints could be abused                          | Add rate limiting middleware in Phase 2                                           |

## Future Work (Phase 2+)

1. **Event Consumers** - Subscribe to `SessionStarted`, `ReviewSubmitted`,
   `ContentSeeded` for stateful scheduling
2. **Database Integration** - PostgreSQL schema for cards, reviews, calibrations
3. **Adaptive Checkpoints** - Process `AdaptiveCheckpointSignal` events
   (ADR-0021)
4. **Advanced Calibration** - Bayesian parameter tuning, confidence intervals
5. **Observability** - OpenTelemetry tracing, Prometheus metrics
6. **Rate Limiting** - Per-user, per-tool request throttling
7. **Tool Authorization** - Role-based access control for sensitive tools

## References

- [ADR-0022: Dual-Lane Scheduler](./ADR-0022-dual-lane-scheduler.md)
- [ADR-0023: Offline Intent Tokens](./ADR-0023-offline-intent-tokens.md)
- [ADR-0009: Scheduling Architecture - Agent/Service Split](./ADR-0009-scheduling-architecture-agent-service-split.md)
- [Fastify Documentation](https://fastify.dev/)
- [MCP Specification](https://modelcontextprotocol.io/)
- [`@noema/events` Package](../../packages/events/)
