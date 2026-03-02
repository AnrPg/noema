# Knowledge Graph Service — CI Testing Strategy

> Specification document for the knowledge-graph-service testing pipeline. This
> documents the strategy — it does not implement CI configuration.

## Test Tiers

### Tier 1: Unit Tests

| Property         | Value                                       |
| ---------------- | ------------------------------------------- |
| **Trigger**      | Every commit, every CI run                  |
| **Dependencies** | None — pure JavaScript/TypeScript execution |
| **Execution**    | Sub-second (< 2s for full suite)            |
| **Runner**       | `vitest run tests/unit/`                    |

Coverage:

- Domain logic: edge-type policies, CKG typestate machine, value objects
- Branded ID creation and validation
- Schema validation (Zod) for input/output contracts
- Pure function behavior (no I/O)

Uses: Mock repositories, `MockGraphRepository` (in-memory graph with real
BFS/DFS), mock event publisher.

### Tier 2: Integration Tests — API Routes

| Property         | Value                                                    |
| ---------------- | -------------------------------------------------------- |
| **Trigger**      | Every commit, every CI run                               |
| **Dependencies** | None — uses Fastify injection (no real HTTP or database) |
| **Execution**    | 2-10 seconds                                             |
| **Runner**       | `vitest run tests/integration/*.routes.test.ts`          |

Coverage:

- All route groups (nodes, edges, traversal, mutations, metrics, misconceptions,
  health, tools, comparison, operation log)
- Zod request validation → 400 on malformed input
- Auth middleware → 401/403 on missing/invalid tokens
- Error mapping → 404 (NotFound), 409 (Conflict), 422 (InvalidTransition)
- Response shape verification

### Tier 3: Contract Tests

| Property         | Value                                              |
| ---------------- | -------------------------------------------------- |
| **Trigger**      | Every PR                                           |
| **Dependencies** | None — imports definitions and validates structure |
| **Execution**    | Sub-second                                         |
| **Runner**       | `vitest run tests/contract/`                       |

Coverage:

- Event type registry completeness (16 types)
- Event payload structure matches `@noema/events` definitions
- MCP tool definition contract (18 tools, naming, schemas, capabilities)
- Tool side-effect classification consistency
- Scope requirement compliance

### Tier 4: Database Integration Tests (Future)

| Property         | Value                                          |
| ---------------- | ---------------------------------------------- |
| **Trigger**      | PR (with infrastructure label) or nightly      |
| **Dependencies** | Neo4j, PostgreSQL, Redis via Docker containers |
| **Execution**    | 10-60 seconds                                  |
| **Runner**       | `vitest run tests/integration/database/`       |

Coverage:

- Neo4j graph repository CRUD, traversal, constraints, batch operations
- Prisma repositories: mutations, metrics, misconceptions, operation log
- Cross-database consistency (Neo4j + Prisma together)
- Event publishing through Redis Streams

Currently: Test stubs with `describe.skip()`; implemented when real adapters are
built (Phase 11+).

### Tier 5: E2E Smoke Tests (Future)

| Property         | Value                                     |
| ---------------- | ----------------------------------------- |
| **Trigger**      | Post-deploy                               |
| **Dependencies** | Full runtime environment (Fly.io staging) |
| **Execution**    | 5-15 seconds                              |
| **Runner**       | `vitest run tests/e2e/` or external probe |

Coverage:

- Health check endpoint returns HTTP 200 with all dependencies green
- Swagger/OpenAPI docs accessible
- Basic API roundtrip (create node → get node → delete node)

## Coverage Thresholds

As configured in `vitest.config.ts`:

| Metric     | Threshold |
| ---------- | --------- |
| Statements | 70%       |
| Branches   | 65%       |
| Functions  | 70%       |
| Lines      | 70%       |

Provider: `v8` (Istanbul-compatible, built into Vitest).

## Neo4j Test Container Strategy

For Tier 4 tests:

1. **Image**: `neo4j:5-community`
2. **Auth**: `NEO4J_AUTH=none` (CI simplicity; no credential management)
3. **Isolation**: Prefix all test nodes/relationships with a unique `testRunId`
   (UUID), or use separate databases per test suite.
4. **Cleanup**: `MATCH (n) DETACH DELETE n` after each `describe` block, or
   per-test transaction rollback if Neo4j driver supports it.
5. **Startup**: Use Testcontainers (Node.js) or docker-compose service
   dependency. Wait for bolt port readiness before running tests.

## PostgreSQL Test Container Strategy

For Tier 4 tests:

1. **Image**: `postgres:16-alpine`
2. **Schema**: Apply Prisma migrations (`prisma migrate deploy`) on container
   start.
3. **Isolation**: Each test suite runs in a transaction that is rolled back.
4. **Cleanup**: `TRUNCATE` tables between test suites if transaction isolation
   is insufficient.
5. **Startup**: Use Testcontainers or docker-compose. Wait for port 5432.

## Redis Test Container Strategy

For Tier 4 event integration tests:

1. **Image**: `redis:7-alpine`
2. **Isolation**: Unique stream names per test run.
3. **Cleanup**: `FLUSHDB` between test suites.
4. **Startup**: Use Testcontainers or docker-compose. Wait for PING response.

## Vitest Configuration Notes

- `globals: true` — `describe`, `it`, `expect` available without import
- `environment: 'node'` — Node.js runtime (not jsdom)
- `sequence.shuffle: true` — randomize test order to catch order-dependent bugs
- `testTimeout: 10_000` — 10s timeout per test
- Reporters: default (terminal)
- Coverage excludes: test files, config files, type-only files

## Running Tests Locally

```bash
# Unit tests only (fast, no deps)
pnpm --filter @noema/knowledge-graph-service test

# With coverage report
pnpm --filter @noema/knowledge-graph-service test:coverage

# Specific test file
pnpm --filter @noema/knowledge-graph-service vitest run tests/unit/domain/edge-type-policies.test.ts

# Watch mode during development
pnpm --filter @noema/knowledge-graph-service vitest tests/unit/
```

## Future Improvements

- [ ] Add service-layer unit tests (node CRUD, edge policy enforcement,
      traversal delegation, metrics computation, misconception detection)
- [ ] Implement Neo4j integration tests when `Neo4jGraphRepository` lands
- [ ] Implement Prisma integration tests when adapters land
- [ ] Add mutation pipeline integration test (propose → validate → commit flow)
- [ ] Add performance benchmarks for traversal operations
- [ ] Consumer-driven contract tests with mobile client schemas
