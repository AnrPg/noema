# Phase 1: Project Bootstrap & Infrastructure

## Objective

Stand up the knowledge-graph-service as a buildable, runnable TypeScript service
with Neo4j and PostgreSQL connectivity, environment configuration, and the
database schemas that will underpin all subsequent phases. By the end of this
phase the service starts, connects to both databases, and responds to health
checks — nothing more.

---

## Boilerplate Instructions

Read PROJECT_CONTEXT.md, then, based on the files with respective
specifications, help me with the implementation. The design process should
follow the principles in PROJECT_CONTEXT.md (APIs and schema first, follow the
microservices pattern, expose agent tools and interfaces for agents etc). If
there is any design decision you must take, first show me options with pros and
cons and ask me to choose.

Generate new code strictly in the existing project style and architecture, fully
conforming to current schemas, APIs, types, models, and patterns; maximize reuse
of existing implementations, favor additive and minimally invasive changes over
redesign or refactoring, and if you detect that modifying or breaking existing
behavior is unavoidable, trigger the harness to stop and explicitly ask for my
approval before proceeding; after implementation, resolve all errors, warnings,
and inconsistencies (including pre-existing ones), request clarification for any
architectural decisions, produce an ADR documenting the changes, and commit with
clear, structured messages.

I want you to make sure that no errors, or warnings or uncommited changes remain
in the codebase after your implementation. If you detect any, please ask me to
approve fixing them before proceeding with new implementations.

Also, before you begin implementing and writing code, tell me with details about
the design decisions you have taken, and ask for my approval before proceeding.
If there are any design decisions that you are not sure about, please present me
with options and their pros and cons, and ask me to choose before proceeding.
let's make sure we are on the same page about the design before you start
implementing. we can do some banter about the design to make sure we are
aligned. be analytical, detailed, and thorough in your design explanations and
discussions.

I generally prefer more complex solutions than simpler ones, given that they are
more powerful and flexible, and I trust your judgment in finding the right
balance. I also prefer solutions that are more aligned with the existing
architecture and patterns of the codebase, even if they require more effort to
implement, as long as they don't introduce significant technical debt or
maintenance challenges.

Do not optimize prematurely, but do consider the long-term implications of
design choices, especially in terms of scalability, maintainability, and
extensibility.

Do not optimize for short-term speed of implementation at the cost of code
quality, architectural integrity, or alignment with project conventions. I value
well-designed, robust solutions that fit seamlessly into the existing codebase,
even if they take more time to implement.

Always reason about the full system architecture before implementing anything.
Every feature touches multiple services, agents, and graph layers. Design
decisions must account for agent orchestration, event propagation, graph
consistency, and offline sync simultaneously.

---

## Context

The knowledge-graph-service directory currently exists as a tree of **empty
directories** with no files whatsoever — no package.json, no tsconfig, no source
files. Before any domain logic can be written, the service needs its build
system, database connections, and schemas.

The content-service is the reference implementation for project conventions.
Study it to understand the patterns for: package.json scripts, tsconfig
references, Prisma setup, Fastify bootstrap, config loading, health checks, and
test infrastructure.

### Why This Phase Exists

Every subsequent phase depends on infrastructure being correct. Getting the
project scaffold, database schemas, and bootstrap wiring right first means later
phases can focus purely on domain logic without fighting tooling issues. This
phase is also where critical storage technology decisions get locked in.

---

## Task 1: Create package.json

Create a package.json for `@noema/knowledge-graph-service` that follows the
identical structure as the content-service's package.json. Key decisions:

### Dependencies

- **Fastify 5** — HTTP framework, same as all other services
- **Prisma** — for PostgreSQL (workflow data: CKG mutations, structural metrics
  cache, misconception patterns)
- **neo4j-driver** — official Neo4j JavaScript driver for graph operations
- **ioredis** — Redis for cache and event bus
- **jose** — JWT verification (tokens issued by user-service)
- **pino** — structured logging
- **zod** — runtime validation
- **nanoid** — ID generation
- Shared workspace packages: `@noema/types`, `@noema/events`,
  `@noema/contracts`, `@noema/validation`
- The same Fastify plugins as content-service: `@fastify/cors`,
  `@fastify/rate-limit`, `@fastify/swagger`, `@fastify/swagger-ui`

### Scripts

Follow the same script names as content-service: `build`, `clean`, `dev`,
`lint`, `lint:fix`, `start`, `test`, `test:coverage`, `test:watch`, `typecheck`,
`db:generate`, `db:migrate`, `db:push`, `db:studio`.

---

## Task 2: Create tsconfig.json

Mirror the content-service's tsconfig.json structure. The same references to
shared packages must be declared. Ensure the generated Prisma output directory
is compatible.

---

## Task 3: Create vitest.config.ts

Follow the content-service vitest.config.ts pattern exactly. Set the same
coverage thresholds (70% branches / 65% functions / 70% lines / 70% statements).
Configure test path aliases if needed for the Neo4j driver mocking.

---

## Task 4: Create .env.example

Define all environment variables the service needs:

- **Service identity** — SERVICE_NAME, PORT, HOST, NODE_ENV, LOG_LEVEL,
  LOG_PRETTY
- **PostgreSQL** — DATABASE_URL (for Prisma, connecting to the
  knowledge-graph-service's own database)
- **Neo4j** — NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, NEO4J_DATABASE (for graph
  storage)
- **Redis** — REDIS_URL
- **JWT** — JWT_SECRET or JWT_PUBLIC_KEY_URL (for verifying tokens from
  user-service)
- **Cache** — CACHE_ENABLED, CACHE_TTL_SECONDS, CACHE_PREFIX
- **Rate limiting** — RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_WRITE_MAX, RATE_LIMIT_BATCH_MAX
- **CORS** — CORS_ORIGIN, CORS_CREDENTIALS
- **Consumers** — EVENT_CONSUMERS_ENABLED, CONSUMER_NAME, plus stream keys for
  services this service consumes events from (content-service, session-service,
  user-service)
- **Body limits** — BODY_LIMIT, BATCH_BODY_LIMIT

### Why separate databases?

Per ADR-0010 Decision 4 and the Database per Service pattern, neo4j handles
graph traversal (PKG/CKG nodes, edges, paths, cycles) while PostgreSQL handles
the structured relational workflow data (CKG mutation pipeline state machine,
audit logs, cached structural metric snapshots, misconception pattern
definitions). This is not duplication — it's polyglot persistence where each
store does what it does best.

---

## Task 5: Add Neo4j to docker-compose.yml

Add a Neo4j 5 service to the root `docker-compose.yml`. This is shared
infrastructure like PostgreSQL and Redis.

### Configuration details

- Use the official `neo4j:5-community` image
- Expose the standard ports: 7474 (HTTP/browser), 7687 (Bolt protocol)
- Persist data in a named volume `neo4j_data`
- Configure via environment variables: NEO4J_AUTH (set a dev password),
  NEO4J_PLUGINS (install APOC for utility procedures)
- Add to the `noema-network` bridge network
- Include a health check against the Bolt port or HTTP status endpoint
- Add the named volume to the volumes section

### Why community edition?

Neo4j Community Edition is free and sufficient for development and single-node
production. Enterprise features (clustering, role-based access, multiple
databases within one instance) are not needed yet. This can be upgraded later.

---

## Task 6: Initialize PostgreSQL database for knowledge-graph-service

Add a `CREATE DATABASE` command to the postgres-init script (located at
`infrastructure/scripts/postgres-init/`) so that the knowledge-graph-service's
database is created automatically when the PostgreSQL container starts. Follow
the existing convention — if an init script already exists for other services'
databases, add to it; otherwise create one. Convention is typically a SQL file
like `02-create-databases.sql`.

---

## Task 7: Create Prisma schema

Create the Prisma schema at
`services/knowledge-graph-service/prisma/schema.prisma`.

### Why Prisma alongside Neo4j?

Neo4j is the primary store for graph data (nodes, edges, traversal queries).
Prisma/PostgreSQL handles the structured workflow and metadata tables that don't
benefit from graph storage:

- **CkgMutation** — the CKG mutation pipeline entries with typestate (Proposed →
  Validated → Proven → Committed / Rejected), audit fields, JSON operation
  payloads, JSON validation results, evidence links
- **CkgMutationAuditLog** — immutable append-only log of every state transition
  in the mutation pipeline
- **StructuralMetricSnapshot** — periodic cached snapshots of per-user
  structural metrics (AD, DCG, SLI, SCE, ULS, TBS, SDF, SSE, SAA) with
  timestamps for longitudinal tracking
- **AggregationEvidence** — records from the PKG → CKG aggregation pipeline
  capturing which PKG signals contributed to which CKG mutation proposals
- **MisconceptionPattern** — the executable pattern definitions that detect
  misconceptions (pattern kind, spec JSON, scoring model)
- **InterventionTemplate** — remediation intervention templates linked to
  misconceptions

### Key design principles

- Use the same Prisma conventions as content-service (generator output path,
  enums as const objects, JSON fields for flexible payloads)
- Every table needs: `id` (text, primary key), `createdAt`, `updatedAt`
- CkgMutation needs optimistic locking via a `version` field
- CkgMutation needs a `state` enum: PROPOSED, VALIDATING, VALIDATED, PROVING,
  PROVEN, COMMITTING, COMMITTED, REJECTED
- Use JSON columns for: operation payloads, validation results, evidence
  references, graph processing results — these are complex nested structures
  that would be unwieldy normalized and are always read/written as a unit
- Index on: `state`, `userId`, `createdAt`, compound indexes for common query
  patterns

---

## Task 8: Design Neo4j schema initialization

Create a Neo4j schema initialization script or module that will run on service
startup to ensure indexes and constraints exist. This is Neo4j's equivalent of
Prisma migrations.

### Required Neo4j indexes and constraints

**Node constraints (uniqueness)**:

- PKG nodes: unique constraint on `(userId, nodeId)` — each node ID is unique
  within a user's PKG
- CKG nodes: unique constraint on `nodeId` — globally unique in the canonical
  graph

**Node indexes (performance)**:

- Full-text index on node `label` and `description` fields for concept search
- Index on node `type` (GraphNodeType enum) for type-filtered queries
- Index on `userId` for PKG partition queries
- Index on `domain` for domain-scoped queries

**Edge indexes**:

- Index on edge `type` (GraphEdgeType enum) for relationship traversal
- Index on `userId` for PKG edge queries

**Labels**:

- PKG nodes should be labeled `:PkgNode`
- CKG nodes should be labeled `:CkgNode`
- Edges should use Neo4j relationship types that map to GraphEdgeType values

### Why not Prisma for graph data?

Prisma is an ORM for relational databases. Graph operations (variable-depth
traversals, path queries, cycle detection, subgraph matching, neighbor
aggregation) are fundamentally relational-hostile. A 5-hop "find all
prerequisites" query in SQL requires 5 self-joins or a recursive CTE; in Cypher
it's `MATCH path = (n)-[:PREREQUISITE*1..5]->(m)`. The impedance mismatch is too
severe to force-fit graph data into PostgreSQL rows.

---

## Task 9: Create configuration loader

Create `src/config/index.ts` following the exact same pattern as
content-service's config loader. The config module reads environment variables
with typed defaults and validates required values at startup.

### Config sections

- **service** — name, version, environment
- **server** — host, port, bodyLimit, batchBodyLimit
- **database** — DATABASE_URL for Prisma
- **neo4j** — uri, user, password, database name, connection pool settings (max
  connections, acquisition timeout)
- **redis** — url
- **jwt** — secret or public key configuration
- **cache** — enabled, TTL, prefix
- **rateLimit** — max, timeWindow, writeMax, batchMax
- **cors** — origin, credentials
- **logging** — level, pretty printing
- **consumers** — enabled, consumerName, stream keys for each upstream service

The convention from content-service uses a `loadConfig()` function with
`requiredEnv()` and `optionalEnv()` / `optionalEnvBool()` / `optionalEnvInt()`
helpers. Follow that pattern exactly.

---

## Task 10: Create minimal bootstrap (src/index.ts)

Create the service entry point following the content-service bootstrap pattern.
At this phase, it should:

- Load config
- Create pino logger (with optional pretty-printing)
- Initialize Prisma and connect to PostgreSQL
- Initialize Neo4j driver and verify connectivity
- Initialize Redis and connect
- Run the Neo4j schema initialization (indexes/constraints)
- Create Fastify instance with standard configuration (CORS, rate limiting,
  Swagger, request ID generation)
- Register health check routes
- Set up graceful shutdown (close Fastify, Redis, Prisma, Neo4j driver)
- Start listening

### Health checks

Follow the same pattern as content-service: `/health` (comprehensive),
`/health/live` (liveness), `/health/ready` (readiness). The readiness check must
verify connectivity to all three stores: PostgreSQL, Neo4j, and Redis.

---

## Task 11: Verify the build

After all files are created:

1. Run `pnpm install` from the repo root to link the new workspace package
2. Run `pnpm typecheck` in the service directory to verify zero type errors
3. Verify the service starts and reaches the health check endpoint (with
   docker-compose databases running)

---

## Checklist

- [ ] `package.json` created with correct dependencies and scripts
- [ ] `tsconfig.json` created with correct references to shared packages
- [ ] `vitest.config.ts` created with coverage thresholds
- [ ] `.env.example` created with all environment variables documented
- [ ] Neo4j added to `docker-compose.yml` with volume, network, health check
- [ ] PostgreSQL init script creates `knowledge_graph_service` database
- [ ] Prisma schema created with CkgMutation, StructuralMetricSnapshot,
      AggregationEvidence, MisconceptionPattern, InterventionTemplate models
- [ ] Neo4j schema initialization module created with indexes and constraints
- [ ] Config loader created following content-service pattern
- [ ] Bootstrap `src/index.ts` created with all three database connections
- [ ] Health check routes registered with PostgreSQL, Neo4j, Redis checks
- [ ] Graceful shutdown closes all connections
- [ ] `pnpm typecheck` passes
- [ ] `pnpm install` succeeds at repo root
