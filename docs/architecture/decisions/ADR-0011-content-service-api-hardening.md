# ADR-0011: Content Service API Hardening & Type-Specific Validation

**Status:** Accepted  
**Date:** 2025-01-24  
**Deciders:** Architecture Team  
**Relates to:** ADR-0010 (Content Domain & Knowledge Graph Integration)

## Context

The content service vertical slice (ADR-0010) established the foundational architecture:
config → domain → infrastructure → API → bootstrap. After the initial build,
a design review identified several gaps for production-readiness and agent-first
operation:

1. **Card content was unvalidated** — `CardContentSchema` used `.passthrough()`,
   accepting any JSON blob regardless of card type. With 42 card types
   (22 standard + 20 remediation), this means agents could create malformed
   cards that would fail at render time.

2. **`nodeIds` was too generic** — The field linking cards to the Personal
   Knowledge Graph was named `nodeIds`, which is ambiguous in a system with
   multiple graph types. ADR-0010 Decision 1 established that "categories ARE
   the PKG", so the field name should explicitly reference knowledge nodes.

3. **DeckQuery lacked node matching modes** — Cards could only be filtered
   by `hasSome` (any match) on node IDs. For agent workflows, we need `all`,
   `exact`, and extensibility hooks for future KG-aware modes.

4. **Missing API endpoints** — Four operations existed in the repository
   but weren't exposed via REST: node link updates, count queries, content
   validation, and batch state transitions.

5. **CORS only covered 3 ports** — The service only allowed `localhost:3000`,
   `3003`, and `3004`. Inter-service communication requires all 16 service
   ports, and development needs wildcard support.

## Decision

### D1: Type-Specific Content Schemas (42 Zod schemas)

Created `card-content.schemas.ts` with a Zod schema for every card type:

- **22 standard types:** Atomic, Cloze, ImageOcclusion, Audio, Process,
  Comparison, Exception, ErrorSpotting, ConfidenceRated, ConceptGraph,
  CaseBased, Multimodal, Transfer, ProgressiveDisclosure, MultipleChoice,
  TrueFalse, Matching, Ordering, Definition, CauseEffect, Timeline, Diagram

- **20 remediation types:** ContrastivePair, MinimalPair, FalseFriend,
  OldVsNewDefinition, BoundaryCase, RuleScope, DiscriminantFeature,
  AssumptionCheck, Counterexample, RepresentationSwitch, RetrievalCue,
  EncodingRepair, OverwriteDrill, AvailabilityBiasDisconfirmation,
  SelfCheckRitual, CalibrationTraining, AttributionReframing,
  StrategyReminder, ConfusableSetDrill, PartialKnowledgeDecomposition

Every schema extends `CardContentBaseSchema` (front, back, hint?, explanation?,
media?) with type-specific required and optional fields.

A `CardContentSchemaRegistry` maps card type strings to schemas.
`validateCardContent()` performs discriminated dispatch.

**Validation points:**
- **Create:** `CreateCardInputSchema.superRefine()` validates content against
  the type-specific schema on every card creation.
- **Update:** The service layer calls `validateCardContent()` using the
  existing card's `cardType` when content is modified.
- **Validate endpoint:** `POST /v1/cards/validate` allows agents to pre-check
  content before batch operations.

### D2: Rename `nodeIds` → `knowledgeNodeIds`

Renamed across all layers:
- TypeScript interfaces (7 type definitions)
- Zod schemas (3 schemas)
- Prisma schema (field + column mapping)
- Database migration SQL (column names + index names)
- Repository implementations (Prisma mappings)
- Service methods (updateNodeIds → updateKnowledgeNodeIds)
- Route definitions (JSON schema descriptions)
- Event payloads
- MCP tool definitions

The Prisma column maps to `knowledge_node_ids` in PostgreSQL, with a GIN
index `cards_knowledge_node_ids_idx`.

### D3: `knowledgeNodeIdMode` for DeckQuery

Added an optional `knowledgeNodeIdMode` field to `IDeckQuery`:

| Mode | Implementation | Description |
|------|---------------|-------------|
| `any` (default) | `hasSome` | Card linked to ANY given node |
| `all` | `hasEvery` | Card linked to ALL given nodes |
| `exact` | `hasEvery` + length check | Card linked to EXACTLY these nodes |
| `subtree` | Deferred to KG service | Nodes + their descendants |
| `prerequisites` | Deferred to KG service | Prerequisite nodes |
| `related` | Deferred to KG service | Semantically related nodes |

The `subtree`, `prerequisites`, and `related` modes are extensibility hooks.
When the knowledge-graph-service is built, it will expand node sets and pass
the resolved IDs with `mode='any'` to the content service.

### D4: New API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `PATCH` | `/v1/cards/:id/node-links` | Update knowledge node linkage |
| `POST` | `/v1/cards/count` | Count matching cards (DeckQuery) |
| `POST` | `/v1/cards/validate` | Validate content against type schema |
| `POST` | `/v1/cards/batch/state` | Batch state transitions |

All endpoints include corresponding MCP tool definitions for agent access.

### D5: CORS Configuration Update

- **Default origins:** All 16 service ports (`localhost:3000`–`3015`)
- **Wildcard mode:** `CORS_ORIGIN=*` enables reflect-origin mode for development
- **Production:** Wildcard disables credentials (per CORS spec)
- **Helper function:** `parseCorsOrigin()` handles both modes

## Consequences

### Positive
- Agents get schema-level validation before creating cards, reducing garbage-in
- Content structure is enforced per card type, ensuring rendering correctness
- `knowledgeNodeIds` is self-documenting and grep-friendly
- DeckQuery extensibility hooks prepare for KG integration without premature complexity
- All repository methods are now exposed via REST + MCP tools
- Services can communicate cross-origin in development

### Negative
- The 42-schema file is ~700 lines; evolving field schemas requires touching it
- `exact` mode approximation (hasEvery without array length check) may over-match
- Card type schema evolution needs migration strategy for existing cards

### Risks
- Schema changes for existing card types require backward-compatible evolution
  (add optional fields, don't remove required ones)
- The `exact` mode should be refined with a raw SQL query for true set equality
  once there's a performance-justified need

## Files Changed

| File | Change |
|------|--------|
| `card-content.schemas.ts` | **NEW** — 42 type-specific Zod schemas + registry + validator |
| `content.types.ts` | Renamed `nodeIds`→`knowledgeNodeIds`, added `knowledgeNodeIdMode` to IDeckQuery |
| `content.schemas.ts` | Added superRefine for discriminated content validation, `knowledgeNodeIdMode` |
| `content.service.ts` | Added 4 new service methods, content validation on update |
| `content.routes.ts` | Added 4 new endpoints, `knowledgeNodeIdMode` in DeckQuery schema |
| `content.tools.ts` | Added 4 new MCP tools, `knowledgeNodeIdMode` in query-cards |
| `content.repository.ts` | Renamed `updateNodeIds`→`updateKnowledgeNodeIds` |
| `prisma-content.repository.ts` | Renamed fields, implemented `knowledgeNodeIdMode` query logic |
| `prisma-template.repository.ts` | Renamed fields |
| `template.schemas.ts` | Renamed `knowledgeNodeIds` |
| `template.service.ts` | Renamed references |
| `content.events.ts` | Renamed event payload fields |
| `prisma/schema.prisma` | Renamed fields + column mappings |
| `migration.sql` | Renamed columns + index |
| `config/index.ts` | Updated CORS defaults + wildcard support |
| `index.ts` | CORS wildcard handling |
