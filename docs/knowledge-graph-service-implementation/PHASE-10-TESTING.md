# Phase 10: Testing & Integration

## Objective

Build out the full testing infrastructure — unit tests, integration tests,
contract tests, and end-to-end smoke tests. After this phase, the
knowledge-graph-service has comprehensive test coverage that validates every
layer in isolation and as an integrated whole. The tests serve as living
documentation and a safety net for future changes.

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

The knowledge-graph-service has unique testing challenges compared to other
services in Noema:

- **Neo4j testing**: unlike PostgreSQL (where Prisma offers test containers and
  migrations), Neo4j requires a running instance or an embedded test driver.
  The test strategy must handle this.
- **Dual database**: integration tests need both Neo4j and PostgreSQL.
- **Graph invariants**: tests must verify structural properties (acyclicity,
  connectivity, traversal correctness) that are harder to assert than simple
  CRUD.
- **Typestate machine**: the mutation pipeline has complex state transitions
  that need exhaustive testing.

Study the content-service's test infrastructure for patterns: test fixtures,
helper utilities, mock factories, integration test setup/teardown.

---

## Task 1: Create test fixtures and factories

### Graph test fixtures

Create fixture files that define standard graph structures for testing:

- **Simple linear graph**: A → B → C → D (linear prerequisite chain). Tests
  basic traversal, path finding, and descendant queries.

- **Diamond graph**: A → B, A → C, B → D, C → D (diamond dependency). Tests
  traversal that handles shared descendants (don't double-count D).

- **Cyclic graph**: A → B → C → A (intentional cycle in `related_to` edges).
  Tests that cycle detection works and that acyclic edge types correctly
  reject this structure.

- **Multi-domain graph**: nodes in "mathematics", "physics", "computer_science"
  domains with cross-domain edges. Tests domain-scoped queries and SLI
  (Scope Leakage Index) computation.

- **Deep hierarchy**: 10-level `part_of` hierarchy. Tests depth-limited
  traversal and performance.

- **Hub graph**: one central node connected to 20+ peripheral nodes. Tests
  high-degree node handling and hub detection hints.

- **CKG reference graph**: a small canonical structure with nodes and edges
  that user PKGs can be compared against. Tests structural metrics that
  require CKG comparison.

### Factory functions

Create factory functions (following a builder or factory pattern) that generate
domain objects for testing:

- `createTestNode(overrides?)` → IGraphNode with sensible defaults
- `createTestEdge(overrides?)` → IGraphEdge with sensible defaults
- `createTestMutation(overrides?)` → mutation domain object
- `createTestMetrics(overrides?)` → IStructuralMetrics with baseline values
- `createTestMisconceptionDetection(overrides?)` → IMisconceptionDetection
- `createTestExecutionContext(overrides?)` → IExecutionContext

Each factory should accept partial overrides so tests can specify only the
fields they care about, with everything else filled in with realistic defaults.

### Mock repositories

Create mock implementations of all repository interfaces for unit testing:

- `MockGraphRepository` — in-memory graph stored as Maps. Supports all read
  and write operations including traversal (using BFS/DFS on the in-memory
  structure). This is the most complex mock — it needs to faithfully simulate
  graph traversal behavior.

- `MockMutationRepository` — in-memory store for mutations. Simulates optimistic
  locking (version checks on state transitions).

- `MockMetricsRepository` — in-memory store for metric snapshots.

- `MockMisconceptionRepository` — in-memory store for patterns, templates,
  and detections.

- `MockEventPublisher` — captures published events in an array for assertion.

### Why in-memory graph mocks?

Testing the service layer's business logic (edge policy enforcement, acyclicity
checks, metric computation) requires a graph that actually supports traversal.
A simple spy/stub that returns canned responses can't test "does creating this
edge actually create a cycle?" — you need a working graph. The in-memory mock
provides this without requiring a Neo4j instance.

---

## Task 2: Write unit tests for the domain layer

### Edge policy tests

- Test each of the 8 edge types in EDGE_TYPE_POLICIES:
  - Verify `requiresAcyclicity` is correct
  - Verify `allowedSourceTypes` permits valid combinations
  - Verify `allowedSourceTypes` rejects invalid combinations
  - Verify `allowedTargetTypes` permits and rejects correctly
  - Verify `defaultWeight` is within valid range

- Test `getEdgePolicy()` returns the correct policy for each edge type
- Test `getEdgePolicy()` throws for unknown edge types

### Typestate machine tests

- Test every valid state transition: PROPOSED→VALIDATING, VALIDATING→VALIDATED,
  VALIDATING→REJECTED, VALIDATED→COMMITTED, VALIDATED→REJECTED
- Test every invalid transition is rejected: PROPOSED→COMMITTED,
  PROPOSED→REJECTED (without going through VALIDATING), COMMITTED→anything,
  REJECTED→anything
- Test that each transition produces the expected audit log entry
- Test optimistic locking (concurrent state transitions → conflict error)

### Value object tests

- Test ValidationOptions toggles (each validation stage can be independently
  enabled/disabled)
- Test TraversalOptions (maxDepth boundaries, edge type filtering)
- Test NodeFilter combinations

### Branded ID tests

- Verify new branded IDs (MutationId, MisconceptionPatternId, InterventionId)
  generate with correct prefixes
- Verify isValid() accepts valid IDs and rejects malformed ones

---

## Task 3: Write unit tests for the service layer

### Node operation tests

- Create node → verify node returned, event published, correct hints
- Create duplicate node → verify behavior (depends on design — either error or
  warning hint)
- Get node → found case and not-found case
- Update node → verify partial update, event published
- Delete node → verify soft delete, event published, hints about orphaned edges
- List nodes with various filters → verify filtering logic

### Edge operation tests (most critical)

- Create valid edge with acyclic edge type → success
- Create edge that would form a cycle with acyclic edge type → CyclicEdgeError
- Create edge with non-acyclic edge type that forms a cycle → success (cycles
  allowed)
- Create edge with invalid source/target node types → error
- Create edge with ValidationOptions.validateAcyclicity = false → skips cycle
  check (audit trail records the skip)
- Create edge where source node doesn't exist → error
- Create edge where target node doesn't exist → error
- Verify event published with correct payload on success
- Verify agent hints mention edge count, structural impact

### Traversal tests

- Get subgraph from root → correct nodes and edges within depth
- Get ancestors → correct traversal following edges backwards
- Get descendants → correct traversal following edges forwards
- Find path between connected nodes → shortest path found
- Find path between disconnected nodes → empty result
- Depth-limited traversal respects the limit

### Structural metrics tests

- Compute metrics on a known graph structure → verify expected metric values
- Metrics delta event published when values change significantly
- Metrics snapshot saved to repository
- Agent hints highlight relevant changes

### Misconception detection tests

- Circular dependency detection on a cyclic graph → misconception found
- Orphan concept detection on a graph with disconnected nodes → found
- Detection on a healthy graph → no misconceptions
- New detection recorded in repository, event published

---

## Task 4: Write integration tests

Integration tests verify the actual database interactions using real Neo4j and
PostgreSQL instances (via Docker containers or test-specific instances).

### Neo4j integration tests

- Create a node in Neo4j → verify it's retrievable
- Create edges → verify traversal returns correct results
- Verify indexes are created on service startup
- Verify constraints prevent duplicate nodeIds
- Test concurrent edge creation (race condition handling)
- Test large-ish graph traversal performance (100 nodes, 300 edges — should
  complete in <100ms)
- Test full-text search on node labels

### Prisma/PostgreSQL integration tests

- Create a mutation → verify state transitions through the pipeline
- Optimistic locking → verify conflict detection
- Audit log → verify immutable append behavior
- Metric snapshots → verify latest retrieval and history query
- Misconception patterns → verify CRUD and status transitions

### Cross-database integration tests

- Full mutation commit flow: create mutation in PostgreSQL → validate (reads
  Neo4j for structural checks) → commit (writes to Neo4j, updates PostgreSQL
  state). Verify both databases are consistent.
- Metrics computation: read graph from Neo4j → compute metrics → save snapshot
  to PostgreSQL. Verify the full pipeline.

### Event integration tests

- Verify events are published to Redis Streams on graph mutations
- Verify event consumers correctly process upstream events
- Verify dead-letter behavior for failed event processing

---

## Task 5: Write API integration tests

### Route tests

Test each route group with a running Fastify instance (using Fastify's
injection API — no real HTTP, just simulated requests):

- **Node routes**: POST creates, GET retrieves, PATCH updates, DELETE removes.
  Verify Zod validation rejects malformed inputs. Verify auth requirements.
- **Edge routes**: POST with valid/invalid edge types, acyclicity violations.
  Verify error response format.
- **Traversal routes**: subgraph, ancestors, descendants with various
  parameters. Verify response shape includes nodes, edges, metadata.
- **Mutation routes**: propose, get status, cancel. Verify state transitions
  in responses.
- **Metrics routes**: get, compute, history. Verify response includes all 11
  metrics.
- **Tool routes**: execute each of the 19 MCP tools via the tool endpoint.
  Verify IToolResult format.

### Error response tests

- Verify NodeNotFoundError → 404
- Verify CyclicEdgeError → 409
- Verify InvalidStateTransitionError → 422
- Verify Zod validation failure → 400
- Verify UnauthorizedError → 403

### Rate limiting tests

- Verify rate limits are enforced per tier (read, write, batch)
- Verify rate limit headers in responses

---

## Task 6: Write contract tests

Contract tests verify that the knowledge-graph-service's API matches what
consuming services and agents expect.

### Event contract tests

- Verify that published event payloads conform to the schemas defined in
  `@noema/events`
- Verify event metadata includes all required fields (serviceName,
  serviceVersion, correlationId, etc.)
- Verify event type strings match the enum values consumers use

### Tool contract tests

- Verify each MCP tool's IToolDefinition conforms to the
  MCP_TOOL_CONTRACT_STANDARD
- Verify tool input schemas match what agents will send
- Verify tool output matches IToolResult format

### API contract tests

- Verify response shapes match OpenAPI spec (if generated)
- Verify pagination parameters and response format match the IPaginatedResponse
  contract from @noema/types

---

## Task 7: Set up CI pipeline considerations

Document (not implement — this is a specification, not CI configuration) the
testing strategy for CI:

### Test tiers

- **Tier 1: Unit tests** — run on every commit, no external dependencies,
  sub-second execution. Uses mock repositories.
- **Tier 2: Integration tests** — run on PR, require Neo4j + PostgreSQL + Redis
  Docker containers. 10-30 second execution.
- **Tier 3: Contract tests** — run on PR, verify cross-service compatibility.
  Lightweight, no database required.
- **Tier 4: E2E smoke tests** — run post-deploy, verify the service is alive
  and healthy in the deployed environment.

### Coverage thresholds

Per vitest.config.ts: 70% branches, 65% functions, 70% lines, 70% statements.
These thresholds match the content-service.

### Neo4j test container

Document the recommended approach for Neo4j in CI:
- Use the official `neo4j:5-community` Docker image
- Start with `NEO4J_AUTH=none` for CI simplicity
- Prefix test databases/nodes with test-run IDs for isolation
- Clean up after each test suite

---

## Task 8: Final integration verification

The absolute last step of the entire implementation:

1. Start all docker-compose services (PostgreSQL, Redis, Neo4j)
2. Run Prisma migrations
3. Start the knowledge-graph-service
4. Verify health check endpoint responds with all-green status
5. Run the full test suite: `pnpm test`
6. Run coverage: `pnpm test:coverage` — verify thresholds met
7. Run typecheck: `pnpm typecheck` — zero errors
8. Run lint: `pnpm lint` — zero warnings
9. Verify Swagger docs are accessible at the service URL

---

## Checklist

- [ ] Graph test fixtures created (linear, diamond, cyclic, multi-domain, deep,
      hub, CKG reference)
- [ ] Factory functions for all domain types (nodes, edges, mutations, metrics,
      misconceptions, context)
- [ ] Mock repositories (graph, mutation, metrics, misconception, event publisher)
- [ ] MockGraphRepository supports in-memory traversal
- [ ] Domain layer unit tests (edge policies, typestate machine, value objects,
      branded IDs)
- [ ] Service layer unit tests (node CRUD, edge creation with policy
      enforcement, traversal, metrics, misconceptions)
- [ ] Neo4j integration tests (CRUD, traversal, constraints, performance)
- [ ] Prisma integration tests (mutation pipeline, metrics, misconceptions)
- [ ] Cross-database integration tests (mutation commit, metrics computation)
- [ ] Event integration tests (publish, consume, dead-letter)
- [ ] API route tests for all route groups
- [ ] Error response mapping tests
- [ ] Contract tests for events, tools, API
- [ ] Coverage thresholds met (70/65/70/70)
- [ ] `pnpm typecheck` zero errors
- [ ] `pnpm lint` zero warnings
- [ ] Health check all-green with all databases connected
- [ ] Swagger docs accessible
