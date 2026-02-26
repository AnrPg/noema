# Knowledge Graph Service — Implementation Plan

## Overview

This directory contains 10 sequential implementation phases to build the
**knowledge-graph-service** from its current empty scaffold into a
production-grade microservice managing the dual-graph architecture (PKG + CKG)
at the heart of Noema's metacognitive learning platform.

**Execute phases in order.** Each phase depends on artifacts from previous
phases.

## Architecture Summary

The knowledge-graph-service is the structural intelligence backbone of Noema. It
owns:

- **Personal Knowledge Graphs (PKGs)** — per-user typed property graphs
  representing each student's mental model of a domain
- **Canonical Knowledge Graph (CKG)** — the formally guarded, crowdsourced
  semantic backbone with a mutation DSL and typestate commit protocol
- **Structural Metrics** — metacognitive signals (AD, DCG, SLI, SCE, ULS, TBS,
  SDF, SSE, SAA, SSG, BSI) computed from graph structure
- **Misconception Ontology** — misconception patterns, detection, PKG-local
  misconception state, interventions
- **PKG → CKG Aggregation Pipeline** — signal extraction and promotion into
  canonical knowledge

### Storage Architecture

| Store       | Purpose                                                       |
| ----------- | ------------------------------------------------------------- |
| **Neo4j 5** | Graph data — PKG/CKG nodes, edges, properties, traversals    |
| **PostgreSQL** | Relational workflow data — CKG mutations, structural metrics cache, misconception patterns, aggregation evidence |
| **Redis**   | Cache, event bus (Redis Streams), rate limiting               |

### Why Two Databases?

Neo4j excels at graph traversal, path queries, cycle detection, and
neighborhood operations — the bread and butter of a knowledge graph. PostgreSQL
excels at relational workflow data: the CKG mutation typestate pipeline (with
its audit log, state machine, and structured query needs), cached structural
metrics, and the relational misconception pattern/intervention tables.

This is the **Database per Service** pattern from DESIGN_PATTERNS — each
service picks the optimal store(s) for its domain.

### Implementation Order Rationale

```
Phase 5 (PKG) ──┐
                 ├──→ Phase 7 (Metrics) ──→ Phase 8 (API) ──→ …
Phase 6 (CKG) ──┘
```

- **Phase 5** (PKG Operations) and **Phase 6** (CKG Mutation Pipeline) are
  **independent peers** — neither depends on the other. They are sequenced
  5 → 6 by convention, not by necessity.
- **Phase 7** (Structural Metrics) **depends on both**: 7 of 11 metrics
  require PKG↔CKG comparison, so both graph types must be operational.
  Placing metrics after both eliminates the need for graceful degradation —
  every metric computes at full accuracy from day one.

## Phase Summary

| Phase | Focus                                       | Key Deliverables                                       |
| ----- | ------------------------------------------- | ------------------------------------------------------ |
| 1     | Project Bootstrap & Infrastructure          | package.json, tsconfig, Neo4j in docker-compose, Prisma schema, Neo4j schema, config |
| 2     | Shared Types & Events                       | New branded IDs, enums, event types in @noema/types and @noema/events |
| 3     | Domain Layer                                | Interfaces, error hierarchy, value objects, edge type policies, validation options |
| 4     | Neo4j Repository & PostgreSQL Repository    | Neo4j graph repositories, Prisma repositories, cache decorator |
| 5     | PKG Operations & Service Layer Foundation   | KnowledgeGraphService with PKG CRUD, edge policy dispatch, traversal, CKG reads |
| 6     | CKG Mutation Pipeline                       | Mutation DSL, typestate machine, validation stages, commit protocol |
| 7     | Structural Metrics & Misconception Detection | All 11 structural metrics (per STRUCTURAL-METRICS-SPECIFICATION.md), misconception engine, PKG↔CKG comparison, health score |
| 8     | REST API & Event System                     | Fastify routes, health checks, event publishers/consumers, bootstrap |
| 9     | MCP Tool Surface                            | Tool definitions, registry, handlers, routes for 19+ agent tools |
| 10    | Testing & Integration                       | Unit tests, integration tests, contract tests, fixtures, mocks |

## Validation

After each phase, run:

```bash
cd services/knowledge-graph-service
pnpm typecheck
pnpm test
pnpm lint
```

## Key References

| Document                                          | Description                                    |
| ------------------------------------------------- | ---------------------------------------------- |
| `FEATURE_knowledge_graph.md`                      | 7000-line spec with 17 ADRs (ADR-001 to ADR-018) |
| `FEATURE_OVERVIEW_knowledge_graph.md`             | Structural metrics + metacognitive progression model |
| `ADR-0010-content-domain-and-knowledge-graph-integration.md` | Integration with content service, 7 decisions |
| `ENTITY_PATTERNS_FOR_NOEMA.md`                    | Entity patterns including KG entities           |
| `DESIGN_PATTERNS_FOR_NOEMA.md`                    | Database per service, circuit breaker           |
| `AGENT_MCP_TOOL_REGISTRY.md`                      | 19 tools owned by knowledge-graph-service       |
| `MCP_TOOL_CONTRACT_STANDARD.md`                   | Mandatory tool contract standard                |
| `PROJECT_CONTEXT.md`                              | Overall architecture and principles             |
