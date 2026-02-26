# Phase 8: REST API & Event System

## Objective

Build the HTTP API layer (Fastify routes) and the event system (Redis Streams
publishers and consumers). After this phase, the knowledge-graph-service has a
full REST API that external clients and other services can call, and an event
bus integration that lets it publish domain events and react to events from
upstream services (content-service, session-service, user-service).

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

The API layer is the service's external interface. It translates HTTP requests
into service calls and service responses into HTTP responses. The event system
is the service's asynchronous interface — it publishes events when things happen
and consumes events from other services to react.

Study the content-service patterns:

- Route registration:
  `registerXxxRoutes(fastify, service, authMiddleware, routeOptions)`
- Request validation: Zod schemas for request bodies and query parameters
- Response format: consistent JSON envelopes with data, metadata, agentHints
- Error mapping: domain errors → HTTP status codes
- Event publisher: `RedisEventPublisher` wrapping ioredis XADD
- Event consumer: `BaseEventConsumer` with XREADGROUP, XAUTOCLAIM, dead-letter

---

## Task 1: Create request/response schemas

Define Zod validation schemas for all API inputs and outputs. These serve as
both runtime validation and as documentation (they generate OpenAPI schemas via
Fastify's Swagger integration).

### Node schemas

- **CreateNodeRequest**: label (string, min 1, max 200), nodeType (GraphNodeType
  enum), domain (string), description (optional string), properties (typed
  key-value pairs)
- **UpdateNodeRequest**: label (optional), description (optional), properties
  (optional partial update), masteryLevel (optional number 0-1)
- **NodeQueryParams**: nodeType (optional filter), domain (optional), search
  (optional label substring), page, pageSize, sortBy, sortOrder
- **NodeResponse**: the full IGraphNode plus metadata

### Edge schemas

- **CreateEdgeRequest**: edgeType (GraphEdgeType enum), sourceNodeId (NodeId),
  targetNodeId (NodeId), weight (optional number 0-1, defaults per policy),
  skipAcyclicityCheck (optional boolean, defaults to false)
- **UpdateEdgeRequest**: weight (optional number 0-1), properties (optional
  partial update). Validates weight against EDGE_TYPE_POLICIES max weight.
- **EdgeResponse**: the full IGraphEdge
- **EdgeQueryParams**: edgeType (optional), nodeId (optional, for "edges
  connected to this node"), direction (optional)

### Traversal schemas

- **SubgraphQueryParams**: rootNodeId (required), maxDepth (optional, default 3,
  max 10), edgeTypes (optional comma-separated filter), direction (optional)
- **PathQueryParams**: fromNodeId, toNodeId, maxDepth (optional)
- **SubgraphResponse**: nodes array, edges array, metadata (node count, edge
  count, depth)

### Mutation schemas

- **ProposeMutationRequest**: operations (array of operation objects with
  discriminated union on type), rationale (string), evidence (optional
  aggregation evidence reference)
- **MutationQueryParams**: state (optional filter), proposedBy (optional), page,
  pageSize
- **MutationResponse**: mutationId, state, operations, rationale,
  validationResults (if available), audit log entries

### Metrics schemas

- **MetricsQueryParams**: domain (required)
- **MetricsHistoryQueryParams**: domain (required), from (optional date), to
  (optional date), limit (optional)
- **MetricsResponse**: the full IStructuralMetrics plus computedAt timestamp

### Misconception schemas

- **MisconceptionQueryParams**: domain (optional), status (optional filter)
- **UpdateMisconceptionStatusRequest**: status (MisconceptionStatus enum)

### Structural health schemas

- **HealthQueryParams**: domain (required)
- **HealthResponse**: the full IStructuralHealthReport — per-metric status
  entries, weighted overall score, health classification (healthy / concerning /
  critical), cross-metric patterns, and trend indicators

### Metacognitive stage schemas

- **StageQueryParams**: domain (required)
- **StageResponse**: the full IMetacognitiveStageAssessment — current stage,
  evidence for the stage, gate criteria and readiness for the next stage,
  regression detection, and recommended actions

### PKG↔CKG comparison schemas

- **ComparisonQueryParams**: domain (required)
- **ComparisonResponse**: the full IGraphComparison — divergences (missing
  nodes, extra nodes, wrong edge type, missing edges, extra edges, wrong
  hierarchy, wrong classification), divergence severities, summary statistics,
  alignment score, and remediation suggestions

### Batch operation schemas

- **BatchCreateNodesRequest**: nodes (array of CreateNodeRequest, max 100)
- **BatchCreateNodesResponse**: created (IGraphNode[]), failed ({index,
  error}[])
- **BatchCreateEdgesRequest**: edges (array of CreateEdgeInput, max 200),
  skipAcyclicityCheck (optional boolean, defaults to false)
- **BatchCreateEdgesResponse**: created (IGraphEdge[]), failed ({index,
  error}[])

### Operation log schemas

- **OperationLogQueryParams**: operationType (optional filter from
  PkgOperationType enum), nodeId (optional), edgeId (optional), since (optional
  ISO datetime), page, pageSize
- **OperationLogResponse**: the IPkgOperation entries with pagination metadata

### Pipeline health schemas

- **PipelineHealthResponse**: count of mutations per state (proposed,
  validating, validated, proving, proven, committing, committed, rejected),
  total count, oldest stuck mutation timestamp (if any)

### Mutation audit log schemas

- **AuditLogResponse**: array of IMutationAuditEntry — state transition,
  timestamp, actor, detail message, and optional validation/proof results

---

## Task 2: Implement REST routes

Create route modules following the content-service pattern:
`registerXxxRoutes(fastify, service, authMiddleware, routeOptions)`.

### Route groups

**PKG Node routes** — prefix `/api/v1/users/:userId/pkg/nodes`

- `POST /` — create a node in the user's PKG
- `GET /` — list nodes with filtering and pagination
- `GET /:nodeId` — get a single node
- `PATCH /:nodeId` — update a node
- `DELETE /:nodeId` — soft-delete a node

**PKG Edge routes** — prefix `/api/v1/users/:userId/pkg/edges`

- `POST /` — create an edge (triggers EDGE_TYPE_POLICIES validation)
- `GET /` — list edges with filtering
- `GET /:edgeId` — get a single edge
- `PATCH /:edgeId` — update an edge (weight and/or properties; re-validates
  against EDGE_TYPE_POLICIES for weight bounds)
- `DELETE /:edgeId` — remove an edge

**PKG Batch routes** — prefix `/api/v1/users/:userId/pkg/batch`

- `POST /nodes` — batch-create up to 100 nodes in a single transaction
- `POST /edges` — batch-create up to 200 edges in a single transaction
  (validates each against EDGE_TYPE_POLICIES; reports per-item failures)

**PKG Traversal routes** — prefix `/api/v1/users/:userId/pkg/traversal`

- `GET /subgraph` — get a subgraph from a root node
- `GET /ancestors/:nodeId` — get ancestors
- `GET /descendants/:nodeId` — get descendants
- `GET /path` — find shortest path between two nodes

**CKG Node routes** — prefix `/api/v1/ckg/nodes`

- `GET /` — list CKG nodes with filtering
- `GET /:nodeId` — get a single CKG node

**CKG Edge routes** — prefix `/api/v1/ckg/edges`

- `GET /` — list CKG edges with filtering (by edgeType, nodeId, direction)
- `GET /:edgeId` — get a single CKG edge

**CKG Traversal routes** — prefix `/api/v1/ckg/traversal`

- `GET /subgraph` — get a subgraph from a root CKG node (same semantics as PKG
  subgraph, but scoped to the canonical graph)
- `GET /ancestors/:nodeId` — get ancestors in CKG
- `GET /descendants/:nodeId` — get descendants in CKG
- `GET /path` — find shortest path between two CKG nodes

> **Note**: Phase 8b adds 6 advanced CKG traversal endpoints (siblings,
> neighborhood, bridges, common-ancestors, prerequisite-chain, centrality) under
> the same `/api/v1/ckg/traversal/` prefix. Knowledge Frontier is PKG-only.

**CKG Mutation routes** — prefix `/api/v1/ckg/mutations`

- `POST /` — propose a new mutation (operations use the CKG mutation DSL:
  ADD_NODE, REMOVE_NODE, UPDATE_NODE, ADD_EDGE, REMOVE_EDGE, UPDATE_EDGE,
  MERGE_NODES, SPLIT_NODE)
- `GET /` — list mutations with filtering
- `GET /health` — pipeline health summary (mutations count per state, stuck
  mutation detection)
- `GET /:mutationId` — get mutation status and details
- `GET /:mutationId/audit-log` — get the full audit trail for a mutation (state
  transitions, validation results, proof outcomes)
- `POST /:mutationId/cancel` — cancel a pending mutation
- `POST /:mutationId/retry` — retry a rejected mutation

**Metrics routes** — prefix `/api/v1/users/:userId/metrics`

- `GET /` — get latest structural metrics for a domain
- `POST /compute` — trigger metrics recomputation
- `GET /history` — get metrics history for trend analysis

**Misconception routes** — prefix `/api/v1/users/:userId/misconceptions`

- `GET /` — get active misconceptions
- `POST /detect` — trigger misconception detection
- `PATCH /:detectionId/status` — update misconception status

**Structural Health routes** — prefix `/api/v1/users/:userId/health`

- `GET /` — get a comprehensive structural health report for a domain.
  Synthesizes the latest structural metrics, per-metric status classifications
  (healthy / concerning / critical), cross-metric pattern analysis, and trend
  indicators into a single assessment.
- `GET /stage` — assess the user's metacognitive stage for a domain. Returns the
  current stage, evidence, gate criteria for the next stage, gaps to close, and
  regression detection.

**PKG↔CKG Comparison routes** — prefix `/api/v1/users/:userId/comparison`

- `GET /` — compare the user's PKG structure against the CKG for a domain.
  Returns structural divergences (missing nodes, extra nodes, wrong edge types,
  missing edges, hierarchy mismatches, classification errors), divergence
  severities, an alignment score, and remediation suggestions.

**PKG Operation Log routes** — prefix `/api/v1/users/:userId/pkg/operations`

- `GET /` — get the operation history for the user's PKG with filtering (by
  operation type, node ID, edge ID, time range) and pagination. Returns the
  ordered list of atomic PKG operations (node created, node updated, node
  removed, edge created, edge updated, edge removed, mastery updated).

### URL design rationale

**Why `/users/:userId/pkg/...`?** PKG operations are scoped to a specific user's
personal graph. The userId in the URL makes the ownership explicit and enables
authorization checks ("is the authenticated user accessing their own PKG?").

**Why `/ckg/...` without userId?** The CKG is shared. All authenticated users
can read it. Agents and users with the `admin` role can write to it (via the
mutation pipeline).

**Why CKG edge routes separate from CKG node routes?** Edges are first-class
entities in a graph database. Consumers frequently need to query edges
independently — e.g., "find all prerequisite relationships in the graph" or "get
the edge connecting two specific nodes." Separating edge routes mirrors the PKG
pattern and makes the API symmetrical.

**Why CKG traversal routes?** Even though the CKG is read-only for most users,
traversal queries are essential for agents comparing a user's PKG against the
CKG, for content-service resolving knowledge node references, and for the
strategy agent analyzing prerequisite structures. The CKG traversal prefix
mirrors the PKG traversal prefix for API symmetry.

**Why batch routes?** Import pipelines, agent-driven graph construction, and
initial PKG scaffolding require creating many nodes and edges atomically.
Without batch endpoints, clients must make N sequential HTTP requests, which is
slow and lacks transactional guarantees. Batch routes wrap
`IBatchGraphRepository` operations in a single Neo4j transaction.

**Why operation log routes?** The PKG operation log captures every atomic
mutation to a user's graph, enabling audit trails, undo functionality, and
offline sync conflict resolution. Exposing it lets agents and the front-end show
change history and replay operations.

**Why separate `/traversal/` prefix?** Traversal operations return different
data shapes (subgraphs, paths) and have different performance characteristics
than CRUD. Separating them makes rate limiting and monitoring easier.

### Authentication and authorization

- All routes require authentication (JWT verification via `authMiddleware`)
- PKG routes: the authenticated user must match the `:userId` parameter (users
  can only access their own PKG) — or the requester is an agent with appropriate
  permissions
- CKG read routes: any authenticated user
- CKG read routes (nodes, edges, traversal): any authenticated user
- CKG mutation routes: restricted to agent identities or users with the `admin`
  role (not regular end users)
- CKG mutation pipeline health: restricted to agents and admin users
- Metrics, misconception, health, stage, comparison, and operation log routes:
  same as PKG (user's own data)
- Batch routes: same as PKG (user's own data)

### Response format

Every successful response includes:

- `data` — the response payload
- `metadata` — request timing, pagination info, correlation ID
- `agentHints` — the IAgentHints from the service result

Error responses include:

- `error` — error code, message, details
- `metadata` — request timing, correlation ID

### Rate limiting

Follow content-service patterns. Three tiers:

- **Read operations**: standard rate limit (e.g., 100/minute)
- **Write operations**: lower rate limit (e.g., 30/minute)
- **Batch/compute operations**: lowest rate limit (e.g., 10/minute for metrics
  computation, mutation proposals)

---

## Task 3: Implement the event publisher

Create `RedisEventPublisher` following the content-service pattern. It wraps
ioredis and publishes events to Redis Streams using `XADD`.

### Stream naming

Follow the existing convention. The knowledge-graph-service publishes to its own
stream (e.g., `knowledge-graph-service:events`). Each event includes:

- Event type (discriminator for consumers)
- Event payload (JSON serialized)
- Event metadata (correlation ID, causation ID, timestamp, service name)

### Events to publish

Wire the publisher into all the service methods that produce events:

- PKG operations → PkgNodeCreated, PkgNodeUpdated, PkgNodeRemoved,
  PkgEdgeCreated, PkgEdgeUpdated, PkgEdgeRemoved
- Structural metrics → PkgStructuralMetricsUpdated
- CKG mutations → CkgMutationProposed, CkgMutationValidated,
  CkgMutationCommitted, CkgMutationRejected
- CKG promotions → CkgNodePromoted
- Misconceptions → MisconceptionDetected, InterventionTriggered,
  MetacognitiveStageTransitioned

---

## Task 4: Implement event consumers

Create event consumers that listen to upstream service streams and react. Follow
the content-service's `BaseEventConsumer` pattern (XREADGROUP with consumer
groups, XAUTOCLAIM for stuck messages, dead-letter for repeatedly failing
messages, graceful shutdown via a stop flag).

### Content-service events to consume

- **ContentCreated / ContentUpdated** — when new content is created or updated,
  the knowledge-graph-service may need to create or update node references. For
  example, if a new card is created about "thermodynamics," and the CKG has a
  "thermodynamics" concept node, a reference link could be created.

- **ContentDeleted** — if content is removed, dangling references in the graph
  should be cleaned up.

### Session-service events to consume

- **SessionCompleted** — when a learning session completes, the PKG may need
  updating (e.g., mastery levels on nodes, new connections the user
  demonstrated).

- **LearningProgressUpdated** — triggers structural metrics recalculation if the
  user's learning patterns suggest graph changes.

### User-service events to consume

- **UserCreated** — initialize the user's PKG (may be a no-op if PKG nodes are
  created lazily).

- **UserDeleted** — soft-delete or archive the user's entire PKG.

### Consumer design

Each consumer handles a specific event type or group of related event types. The
consumer:

1. Reads the event from the stream
2. Deserializes and validates the payload (Zod)
3. Calls the appropriate service method
4. Acknowledges the message (XACK)

If processing fails after retries, the message goes to the dead-letter stream.
The consumer must be idempotent — processing the same event twice should produce
the same result.

---

## Task 5: Update bootstrap to register routes and consumers

Update `src/index.ts` to:

1. Register all route groups with the Fastify instance
2. Create and start event consumers (if `EVENT_CONSUMERS_ENABLED` is true)
3. Include consumer shutdown in the graceful shutdown sequence (stop consumers
   before closing database connections)

Follow the content-service bootstrap pattern exactly — the order of operations
matters (database connections first, then routes, then consumers, then listen).

---

## Task 6: Add Swagger/OpenAPI documentation

Configure `@fastify/swagger` and `@fastify/swagger-ui` to generate API
documentation from the Zod schemas. Follow the content-service's Swagger
configuration pattern.

The documentation should include:

- Service description and version
- All route groups with descriptions
- Request/response schemas generated from Zod
- Authentication requirements
- Error response formats
- Rate limiting information

---

## Checklist

### Schemas

- [ ] Zod request/response schemas for all endpoints
- [ ] UpdateEdgeRequest schema (weight, properties)
- [ ] Health, Stage, Comparison response schemas
- [ ] Batch create nodes/edges request and response schemas
- [ ] Operation log query/response schemas
- [ ] Pipeline health response schema
- [ ] Mutation audit log response schema

### PKG routes

- [ ] PKG node routes (CRUD + list with filtering)
- [ ] PKG edge routes (create, list, **get**, **update**, delete)
- [ ] PKG traversal routes (subgraph, ancestors, descendants, path)
- [ ] PKG batch routes (batch create nodes, batch create edges)
- [ ] PKG operation log routes (list with filtering)

### CKG routes

- [ ] CKG node routes (read-only: list, get)
- [ ] CKG edge routes (read-only: list, get)
- [ ] CKG traversal routes (subgraph, ancestors, descendants, path)
- [ ] CKG mutation routes (propose, get, list, cancel, retry, **audit-log**,
      **pipeline health**)

### Analysis routes

- [ ] Metrics routes (get, compute, history)
- [ ] Misconception routes (get, detect, update status)
- [ ] Structural health routes (health report, metacognitive stage)
- [ ] PKG↔CKG comparison route

### Cross-cutting

- [ ] Authentication middleware on all routes
- [ ] Authorization checks (user owns PKG, agent or admin for CKG writes, admin
      or agent for pipeline health)
- [ ] Rate limiting configured (read/write/batch tiers)
- [ ] Domain errors mapped to HTTP status codes
- [ ] Response envelopes include data, metadata, agentHints

### Events

- [ ] RedisEventPublisher wired to all state-changing service operations
      (including PkgEdgeUpdated)
- [ ] Event consumers for content, session, user service events
- [ ] Consumers are idempotent with dead-letter handling

### Infrastructure

- [ ] Bootstrap updated to register routes and start consumers
- [ ] Swagger/OpenAPI documentation configured
- [ ] `pnpm typecheck` passes
