# ADR-0012: Content Service Testing Strategy

## Status

**Accepted** — 2025-07-22

## Context

The content service (vertical slice committed in `fbaf1b9`, hardened with 42
card content schemas, discriminated validation, and 4 new endpoints) had zero
test coverage. As we prepare for integration with other services and agent
workflows, we need a testing strategy that:

1. Catches regressions across 42 card-type schemas and their discriminated
   validation
2. Verifies the state machine (draft → active → suspended/archived) exhaustively
3. Tests business rules (batch limits, ownership, admin bypass, tag format)
4. Establishes patterns reusable across all other Noema services
5. Runs fast enough for TDD workflows (< 5s)

## Decision

### Framework: Vitest

We chose **Vitest 2.x** with the following configuration:

- **Globals**: `true` (no need to import `describe`/`it`/`expect` in every file)
- **Environment**: `node` (no DOM needed for backend services)
- **Coverage**: V8 provider with **70% thresholds** (statements, branches,
  functions, lines)
- **Shuffle**: Enabled — tests run in random order to catch hidden state
  dependencies
- **Timeout**: 10s per test

### Test Pyramid

```
┌─────────────────────────┐
│  Contract (future)      │  ← API schema snapshots
├─────────────────────────┤
│  Integration (future)   │  ← Fastify.inject() + real validation, mocked DB
├─────────────────────────┤
│  Unit Tests (242 tests) │  ← Pure logic, all deps mocked via vi.fn()
└─────────────────────────┘
```

**Unit tests** are the foundation. They test:

| Layer           | File                         |   Tests | Coverage Focus                                                   |
| --------------- | ---------------------------- | ------: | ---------------------------------------------------------------- |
| Domain Service  | content-service.test.ts      |      46 | CRUD, state machine, batch ops, auth, event publishing           |
| Domain Service  | template-service.test.ts     |      16 | CRUD, visibility, instantiation, usage tracking                  |
| Domain Service  | media-service.test.ts        |      16 | Upload flow, presigned URLs, storage integration, cleanup        |
| Schemas (42)    | card-content-schemas.test.ts |      61 | All card types, registry completeness, discriminated validation  |
| Schemas (input) | content-schemas.test.ts      |      34 | CreateCard superRefine, DeckQuery, node ID format, tag format    |
| Value Objects   | value-objects.test.ts        |      45 | Tag class, CardFront/Back limits, generatePreview markdown strip |
| Error Classes   | errors.test.ts               |      24 | Construction, toJSON serialization, type guards                  |
| **Total**       |                              | **242** |                                                                  |

### Mock Pattern

All repository and infrastructure interfaces are mocked via factory functions:

```typescript
export function mockContentRepository(): {
  [K in keyof IContentRepository]: ReturnType<typeof vi.fn>;
} { ... }
```

Mocks are created fresh in `beforeEach` to prevent cross-test contamination. The
pattern is type-safe — any interface change breaks compilation of the mock
factory.

### Test Directory Structure

```
tests/
├── contract/               # API contract verification (future)
├── e2e/                    # End-to-end tests (future)
├── fixtures/
│   └── index.ts            # Data factories: ID generators, content, entities, contexts
├── helpers/
│   └── mocks.ts            # Mock factories for all interfaces
├── integration/
│   ├── api/                # Fastify route integration tests (future)
│   ├── database/           # Prisma integration tests (future)
│   └── events/             # Redis event integration tests (future)
└── unit/
    └── domain/
        ├── card-content-schemas.test.ts
        ├── content-schemas.test.ts
        ├── content-service.test.ts
        ├── errors.test.ts
        ├── media-service.test.ts
        ├── template-service.test.ts
        └── value-objects.test.ts
```

### State Machine Coverage

The card state machine is tested exhaustively using `it.each`:

- **7 valid transitions**: draft→active, draft→archived, active→suspended,
  active→archived, suspended→active, suspended→archived, archived→draft
- **5 invalid transitions**: draft→suspended, active→draft, suspended→draft,
  archived→active, archived→suspended

### Schema Registry Completeness

A dedicated test verifies the `CardContentSchemaRegistry` has exactly 42 entries
and covers every value from both `CardType` (22) and `RemediationCardType` (20)
enums. This prevents silent regressions when new card types are added.

### Coverage Exclusions

We exclude from coverage metrics:

- `src/index.ts` — Bootstrap/DI wiring (tested via integration tests)
- `src/**/index.ts` — Barrel re-exports
- `*.d.ts` — Type declarations

## Consequences

### Positive

- **242 unit tests** provide immediate regression safety
- **< 5s** total execution time supports TDD workflows
- **Shuffle mode** catches implicit test ordering dependencies
- **Type-safe mocks** break at compile time when interfaces change
- **Factory pattern** makes tests readable and DRY
- **Schema completeness test** prevents missing type registrations (caught 3
  missing MCP tool handlers during this audit)

### Negative

- Integration tests (Fastify routes, Prisma, Redis) are not yet implemented —
  this is planned as follow-up work
- 70% coverage threshold is a starting point; should increase as integration
  tests are added
- Mock-heavy unit tests may not catch Prisma query issues (needs integration
  layer)

### Future Work

1. **Integration tests**: Fastify `inject()` testing for all 12 card endpoints,
   template routes, and media routes
2. **Contract tests**: Snapshot-based API response verification
3. **Database tests**: Prisma repository tests against testcontainers PostgreSQL
4. **Event tests**: Redis Streams integration with testcontainers Redis
5. **Coverage gates**: Increase thresholds to 80%+ once integration layer exists
6. **CI integration**: `pnpm --filter @noema/content-service test:coverage` in
   GitHub Actions

## References

- [ADR-0010: Content Domain](./ADR-0010-content-domain-and-knowledge-graph-integration.md)
  — Domain model and business rules
- [ADR-0011: API Hardening](./ADR-0011-content-service-api-hardening.md) — 42
  schemas, discriminated validation, endpoints
- [Vitest Documentation](https://vitest.dev/)
