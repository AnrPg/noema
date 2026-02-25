# ADR: Knowledge-Graph-Service Phase 1 — Project Bootstrap & Infrastructure

## Status

Accepted

## Date

2026-02-25

## Context

The knowledge-graph-service directory existed as a tree of empty directories with
no files — no package.json, no tsconfig, no source code. Phase 1 establishes the
project scaffold, database connections (PostgreSQL via Prisma + Neo4j), and
bootstrap wiring so that subsequent phases can focus on domain logic.

The content-service was used as the reference implementation for all project
conventions: package.json structure, tsconfig references, Fastify bootstrap,
config loading, health checks, and test infrastructure.

## Decisions

### 1. Polyglot Persistence (Neo4j + PostgreSQL)

**Neo4j** (graph database) handles graph traversal — PKG/CKG nodes, edges,
paths, cycle detection, subgraph matching, neighbor aggregation. These are
fundamentally relational-hostile operations.

**PostgreSQL** (via Prisma) handles structured workflow data — CKG mutation
pipeline state machine, audit logs, cached structural metric snapshots,
misconception pattern definitions, intervention templates. This data is
inherently relational and benefits from ACID transactions, indexing, and Prisma's
type-safe ORM.

This follows ADR-0010 Decision 4 (Database per Service) and the polyglot
persistence pattern.

### 2. Neo4j Community Edition

Using `neo4j:5-community` Docker image. Community Edition is free and sufficient
for development and single-node production. Enterprise features (clustering,
role-based access) are not yet needed. Upgradeable later.

### 3. Neo4j Client Wrapper

A thin `Neo4jClient` class wraps the raw neo4j-driver to centralize connection
management, session creation, pool configuration, and health checks. This:
- Avoids leaking raw driver instances throughout the codebase
- Provides a single class to mock in tests
- Encapsulates the `getServerInfo()` connectivity check (non-deprecated)

### 4. Schema Initialization Strategy

Neo4j schema (indexes + constraints) is initialized via idempotent Cypher
statements (`CREATE ... IF NOT EXISTS`) that run on every service startup. This
is the Neo4j equivalent of Prisma migrations.

### 5. Health Check Contract Extension

Added optional `graphDatabase` field to `IHealthCheckResponse.checks` in
`@noema/contracts`. This is a backward-compatible additive change — existing
services that don't use Neo4j simply omit the field.

### 6. Port Assignment

Knowledge-graph-service uses port 3006, consistent with the CORS configuration
comments already present in the content-service.

## Consequences

### Positive
- Service compiles, builds, lints, and typechecks with zero errors
- Three-store health checks (PostgreSQL, Neo4j, Redis) ensure readiness
- Prisma schema captures all workflow tables needed for subsequent phases
- Neo4j indexes/constraints are created idempotently on startup
- Full alignment with existing project conventions

### Negative
- Session-service has pre-existing type errors (unrelated to this work)
- Neo4j adds operational complexity (another database to manage)

## Files Created/Modified

### New Files
- `services/knowledge-graph-service/package.json`
- `services/knowledge-graph-service/tsconfig.json`
- `services/knowledge-graph-service/vitest.config.ts`
- `services/knowledge-graph-service/.env.example`
- `services/knowledge-graph-service/prisma/schema.prisma`
- `services/knowledge-graph-service/src/config/index.ts`
- `services/knowledge-graph-service/src/index.ts`
- `services/knowledge-graph-service/src/api/rest/health.routes.ts`
- `services/knowledge-graph-service/src/infrastructure/database/neo4j-client.ts`
- `services/knowledge-graph-service/src/infrastructure/database/neo4j-schema.ts`

### Modified Files
- `docker-compose.yml` — Added Neo4j service + volume
- `eslint.config.mjs` — Removed knowledge-graph-service from skeleton ignores
- `packages/contracts/src/health.ts` — Added `graphDatabase` optional field
