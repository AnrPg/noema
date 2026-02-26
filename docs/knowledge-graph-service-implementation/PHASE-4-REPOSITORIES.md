# Phase 4: Neo4j & PostgreSQL Repositories

## Objective

Implement the repository interfaces defined in Phase 3 with concrete
infrastructure code: a Neo4j repository for graph storage, Prisma repositories
for mutation/metrics/misconception workflow data, and a Redis cache decorator
that wraps frequently-read graph queries. After this phase, the service has
working database access for all four repository contracts.

---

## Boilerplate Instructions

Read PROJECT_CONTEXT.md, then,
based on the files with respective specifications, help me with the
implementation. The design process should follow the principles in
PROJECT_CONTEXT.md (APIs and schema first, follow the microservices pattern,
expose agent tools and interfaces for agents etc). If there is any design
decision you must take, first show me options with pros and cons and ask me to
choose.

Generate new code strictly in the existing project style and architecture,
fully conforming to current schemas, APIs, types, models, and patterns;
maximize reuse of existing implementations, favor additive and minimally
invasive changes over redesign or refactoring, and if you detect that
modifying or breaking existing behavior is unavoidable, trigger the harness to
stop and explicitly ask for my approval before proceeding; after
implementation, resolve all errors, warnings, and inconsistencies (including
pre-existing ones), request clarification for any architectural decisions,
produce an ADR documenting the changes, and commit with clear, structured
messages.

I want you to make sure that no errors, or warnings or uncommited changes
remain in the codebase after your implementation. If you detect any, please
ask me to approve fixing them before proceeding with new implementations.

Also, before you begin implementing and writing code, tell me with details
about the design decisions you have taken, and ask for my approval before
proceeding. If there are any design decisions that you are not sure about,
please present me with options and their pros and cons, and ask me to choose
before proceeding. let's make sure we are on the same page about the design
before you start implementing. we can do some banter about the design to make
sure we are aligned. be analytical, detailed, and thorough in your design
explanations and discussions.

I generally prefer more complex solutions than simpler ones, given that they
are more powerful and flexible, and I trust your judgment in finding the right
balance. I also prefer solutions that are more aligned with the existing
architecture and patterns of the codebase, even if they require more effort to
implement, as long as they don't introduce significant technical debt or
maintenance challenges.

Do not optimize prematurely, but do consider the long-term implications of
design choices, especially in terms of scalability, maintainability, and
extensibility.

Do not optimize for short-term speed of implementation at the cost of code
quality, architectural integrity, or alignment with project conventions. I
value well-designed, robust solutions that fit seamlessly into the existing
codebase, even if they take more time to implement.

Always reason about the full system architecture before implementing
anything. Every feature touches multiple services, agents, and graph layers.
Design decisions must account for agent orchestration, event propagation, graph
consistency, and offline sync simultaneously.

---

## Context

Phase 3 defined four repository interfaces with zero infrastructure knowledge.
Now we implement them with Neo4j (graph), Prisma (relational), and Redis
(cache). Study the content-service's `PrismaContentRepository` and
`CachedContentRepository` for the architectural patterns — Prisma mapping,
error translation, and cache-as-decorator.

### Why implementations matter

The repository layer is where the "impedance mismatch gauntlet" lives. Cypher
queries return records of nodes and relationships that need to be mapped into
`IGraphNode`/`IGraphEdge` domain objects. Prisma returns typed models that need
mapping to domain types. Redis serializes domain objects to JSON. Getting these
mappings right — with no data loss, no type coercion surprises, and clean error
translation — is essential for correctness.

---

## Task 1: Implement Neo4jGraphRepository

Create the concrete implementation of `IGraphRepository` using the `neo4j-driver`
package.

### Neo4j driver patterns

The Neo4j JavaScript driver has three key abstractions:
- **Driver** — connection pool, created once at startup
- **Session** — a logical unit of work, corresponds roughly to a database
  connection
- **Transaction** — ACID transaction within a session

The repository should:
- Receive the `Driver` instance via constructor injection (created in bootstrap)
- Create sessions per-operation (not shared across calls)
- Use explicit transactions for write operations
- Use auto-commit transactions or read transactions for read operations

### Node CRUD

**Creating a node**: Map the domain input to Cypher `CREATE` statements.
PKG nodes should be labeled `:PkgNode`, CKG nodes `:CkgNode`. Additionally,
each node gets a secondary label matching its `GraphNodeType` (e.g., `:Concept`,
`:Procedure`). This allows Neo4j index-backed label scans for type-filtered
queries.

Properties should be stored as flat Neo4j properties, not a single JSON blob.
Key properties: nodeId, graphType, nodeType, label, description, domain, userId
(for PKG), masteryLevel (for PKG), createdAt, updatedAt, isDeleted.

**Getting a node**: Match by nodeId, with userId filter for PKG nodes. Map the
Neo4j record back to `IGraphNode`.

**Updating a node**: Use Cypher `SET` with the specific properties that changed.
Always update `updatedAt`.

**Soft-deleting**: Set `isDeleted = true` and `deletedAt = timestamp`. Do not
remove. Soft-delete allows undo and maintains referential integrity for edges
that point to this node.

**Filtering/searching**: Build dynamic Cypher `WHERE` clauses from `NodeFilter`
value objects. Support label substring search using `CONTAINS` or full-text
index search.

### Edge CRUD

**Creating an edge**: Use Cypher `CREATE (a)-[r:EDGE_TYPE]->(b)`. The
relationship type in Neo4j should be the uppercase version of the
`GraphEdgeType` value (e.g., `PREREQUISITE`, `PART_OF`). Store properties on
the relationship: edgeId, edgeType (redundant with rel type but needed for
generic queries), weight, userId (for PKG), createdAt.

**Important**: Edge creation does NOT validate acyclicity — that's the service
layer's job using the `EDGE_TYPE_POLICIES`. The repository is a dumb data store.
This separation is intentional: it keeps the repository testable in isolation
and allows the service layer to skip validation when appropriate (via
`ValidationOptions`).

**Removing an edge**: Use Cypher `DELETE` (hard delete, not soft — edges don't
need undo).

**Querying edges**: Support filtering by type, source/target node, userId.

### Traversal operations

**Ancestors**: `MATCH path = (n)<-[:EDGE_TYPE*1..maxDepth]-(ancestor)` — follow
incoming edges of specified types up to a depth limit. Return all unique
ancestor nodes.

**Descendants**: `MATCH path = (n)-[:EDGE_TYPE*1..maxDepth]->(descendant)` —
follow outgoing edges.

**Shortest path**: `MATCH path = shortestPath((a)-[*]-(b))` — Neo4j's built-in
shortest path algorithm. Optionally filter by edge types.

**Subgraph**: `MATCH path = (root)-[*0..maxDepth]-(connected)` — collect all
nodes and edges within the specified depth. Return as `ISubgraph`.

**Cycle detection**: `MATCH path = (n)-[:EDGE_TYPE*]->(n)` — look for paths
that start and end at the same node. This is used by the service layer during
acyclicity validation. The query should be efficient — use depth limits and
early termination.

### Record mapping

Create a dedicated mapper module (e.g., `neo4j-mapper.ts`) that converts
between Neo4j Records and domain types. This isolates the Neo4j-specific data
format from the rest of the codebase. The mapper must handle:
- Neo4j Integer types (neo4j.int) → JavaScript numbers
- Neo4j DateTime → ISO strings or Date objects
- Null properties → undefined in domain types
- Relationship records → IGraphEdge with source/target nodeIds extracted

### Error translation

Catch Neo4j-specific exceptions and translate them to domain errors:
- `Neo4jError` with code `Neo.ClientError.Schema.ConstraintValidationFailed` →
  `DuplicateNodeError`
- Session/connection errors → wrap in `GraphConsistencyError` with details
- Transaction timeouts → appropriate domain error

---

## Task 2: Implement PrismaMutationRepository

Implement `IMutationRepository` using Prisma against the PostgreSQL CkgMutation
and CkgMutationAuditLog tables.

### Key implementation details

**Optimistic locking on state transitions**: When updating a mutation's state,
include the current `version` in the `WHERE` clause and increment it in the
update. If the update affects 0 rows, throw `MutationConflictError`. This
prevents race conditions when multiple processes try to advance the same
mutation simultaneously.

**Audit log append**: Every state transition creates an audit log entry in the
same database transaction as the state update. The audit log is append-only
(no updates, no deletes). Fields: mutationId, fromState, toState,
timestamp, actor (userId or agentId), reason, metadata (JSON for flexible
context).

**State filtering**: The pipeline processor will query "give me all mutations in
VALIDATING state, ordered by createdAt." This must be efficient — ensure the
appropriate Prisma index is used.

### Mapping

Map between Prisma models (with JSON columns for operation payloads and
validation results) and domain types. Follow the content-service pattern for
handling JSON fields (parse on read, stringify on write, with Zod validation of
the parsed JSON structure).

---

## Task 3: Implement PrismaMetricsRepository

Implement `IMetricsRepository` using Prisma against the
StructuralMetricSnapshot table.

### Key implementation details

- **Snapshot storage**: Each snapshot is a point-in-time capture of all 11
  structural metrics for a user in a domain. Metrics are stored as individual
  numeric columns (not a JSON blob) for efficient querying and aggregation.

- **Latest snapshot**: Query with `orderBy: { computedAt: 'desc' }, take: 1`
  for a given userId+domain combination.

- **History**: Return snapshots in chronological order with pagination support
  (cursor-based for time-series data).

- **Retention**: Delete snapshots older than a configurable threshold (e.g.,
  90 days). This prevents unbounded storage growth. Run as a periodic cleanup,
  not on every write.

---

## Task 4: Implement PrismaMisconceptionRepository

Implement `IMisconceptionRepository` using Prisma against the
MisconceptionPattern, InterventionTemplate, and related tables.

### Key implementation details

- **Pattern definitions** are essentially configuration data — created by
  curriculum designers, read by the detection engine. They change infrequently.
  Cache-friendly.

- **Intervention templates** link to misconception types. A single
  misconception type can have multiple intervention strategies. The repository
  should support querying templates by misconception type with priority ordering.

- **Detection records** link a user, a misconception pattern, affected node IDs,
  and a confidence score. They track the lifecycle: detected → confirmed →
  addressed → resolved → possibly recurring. The repository must support
  status transitions with validation (e.g., you can't go from "resolved" to
  "detected" — only "resolved" to "recurring").

---

## Task 5: Implement CachedGraphRepository (decorator)

Create a cache decorator following the exact same pattern as the
content-service's `CachedContentRepository`. The decorator wraps
`IGraphRepository` and adds Redis caching for read-heavy operations.

### What to cache

- **Single node lookups** — `getNode(userId, nodeId)`: Cache with key
  `kg:node:{graphType}:{nodeId}` (CKG) or `kg:node:{userId}:{nodeId}` (PKG).
  TTL: moderate (5-10 minutes). These are the most frequent reads.

- **Edge lookups by node** — `getEdgesForNode(nodeId)`: Cache the list of
  edges. Invalidate when any edge is added/removed for that node.

- **Subgraph queries** — consider caching for frequently-accessed subgraphs
  (e.g., a user's full PKG for a domain). Use a hash of the query parameters
  as the cache key. Shorter TTL due to larger payloads.

### What NOT to cache

- **Traversal queries** — variable-depth traversals with different parameters
  produce too many cache key permutations. Cache miss rate would be too high
  to justify the overhead.

- **Write operations** — obviously. But writes must invalidate affected cache
  entries.

### Cache invalidation strategy

Follow the content-service pattern:
- On node create/update/delete → invalidate that node's cache entry
- On edge create/delete → invalidate the edge-list cache for both the source
  and target nodes
- Use `UNLINK` (async delete) for bulk invalidation
- Prefix all keys with a configurable cache prefix for namespace isolation

### Decorator pattern

The `CachedGraphRepository` class implements `IGraphRepository`, receives an
inner `IGraphRepository` (the Neo4j implementation) via constructor injection,
and delegates to the inner repository on cache miss. This is the textbook
decorator pattern — the service layer doesn't know or care whether caching is
enabled. Cache can be bypassed entirely by injecting the Neo4j repository
directly.

---

## Task 6: Create the execution context

Following content-service patterns, create an `IExecutionContext` type that
carries per-request metadata through the service layer:

- userId — the authenticated user
- correlationId — for distributed tracing
- causationId — the ID of the event or request that caused this operation
- agentId — if the request came from an agent, which one

This context is threaded through every repository and service call so that
audit logs, events, and error messages always carry tracing information.

---

## Checklist

- [ ] Neo4jGraphRepository implements IGraphRepository
- [ ] Neo4j mapper module converts Records ↔ domain types
- [ ] Neo4j error translation maps driver exceptions to domain errors
- [ ] Cypher queries use parameterized queries ($params, never string concat)
- [ ] PrismaMutationRepository implements IMutationRepository with optimistic locking
- [ ] Audit log appended transactionally with state transitions
- [ ] PrismaMetricsRepository implements IMetricsRepository with snapshots & history
- [ ] PrismaMisconceptionRepository implements IMisconceptionRepository
- [ ] CachedGraphRepository decorator wraps IGraphRepository with Redis layer
- [ ] Cache invalidation on all write operations
- [ ] IExecutionContext created and threaded through repositories
- [ ] All repositories receive dependencies via constructor injection
- [ ] `pnpm typecheck` passes
- [ ] Basic repository unit tests with mocked Neo4j driver and Prisma client
