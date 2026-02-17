# ADR-001: Phase 0 Foundation Layer Type System

## Status

Accepted

## Date

2025-01-20

## Context

Noema requires a robust foundation layer to support:
- 15 microservices with consistent communication patterns
- 10 LLM agents that need structured guidance via AgentHints
- Event-driven architecture (Redis Streams → Kafka migration path)
- Mental Debugger trace service with rich failure taxonomy

We needed to make decisions about:
1. How to handle type-safe IDs across the system
2. Where to place types vs. validation schemas
3. How to structure the AgentHints contract for agent guidance

## Decision

### Decision 1B: Branded Types with Factory Functions

**Chosen:** Branded ID types with prefix validation and factory functions

```typescript
// Example: UserId branded type
const userId = UserId.create('user_abc123');
if (UserId.isValid(input)) { /* type-safe */ }
```

**Rationale:**
- Runtime validation catches API boundary errors
- Type-safe within TypeScript (cannot mix UserId with CardId)
- Prefix convention provides human-readable debugging
- Factory pattern ensures consistent ID creation

**Alternatives considered:**
- 1A: Nominal types only (no runtime safety)
- 1C: Class-based IDs (more overhead)

### Decision 2C: Types Pure, Validation Separate

**Chosen:** Types in `@noema/types` (pure interfaces), Zod schemas in `@noema/validation`

```typescript
// @noema/types - pure TypeScript interfaces
export interface User extends AuditedEntity { ... }

// @noema/validation - Zod runtime schemas
export const UserSchema = z.object({ ... });
```

**Rationale:**
- Types package has zero runtime dependencies
- Validation can be tree-shaken where not needed
- Clear separation of compile-time vs. runtime concerns
- Validation package can depend on types, not vice versa

**Alternatives considered:**
- 2A: Co-located types and schemas (coupling concerns)
- 2B: Types inferred from Zod (type system limitations)

### Decision 3A: AgentHints in @noema/contracts

**Chosen:** Full AgentHints v2.0.0 specification in `@noema/contracts`

```typescript
export interface AgentHints {
  suggestedNextActions: SuggestedAction[];
  relatedResources: RelatedResource[];
  confidence: number;
  sourceQuality: SourceQuality;
  // ... 11 required + 5 optional fields
}
```

**Rationale:**
- All APIs and tools MUST return AgentHints to guide agents
- Centralized contract ensures consistency across 15 services
- Provides rich context for agent decision-making
- Includes risk assessment, dependencies, impact estimation

**Alternatives considered:**
- 3B: Minimal hints (insufficient for complex scenarios)
- 3C: Per-service hints (inconsistency risk)

## Implementation

### Package Structure

```
packages/
├── types/           # Pure TypeScript types (no runtime deps)
│   ├── branded-ids/ # 23 branded ID types with factories
│   ├── enums/       # Domain enumerations
│   │   ├── index.ts          # General domain enums
│   │   └── mental-debugger.ts # 10 failure families, 7 trace frames
│   └── base/        # Common interfaces (Timestamps, Auditable, etc.)
│
├── validation/      # Zod runtime schemas
│   ├── ids.ts       # ID validation schemas
│   ├── base.ts      # Base entity schemas
│   ├── enums.ts     # Enum validation
│   └── mental-debugger.ts # Failure taxonomy schemas
│
├── events/          # Event-driven architecture
│   ├── types.ts     # BaseEvent, EventMetadata
│   ├── payloads.ts  # Standard payload patterns
│   ├── schemas.ts   # Event validation
│   └── factory.ts   # Event creation helpers
│
└── contracts/       # API contracts
    ├── agent-hints.ts  # AgentHints v2.0.0
    └── responses.ts    # ApiResponse, ToolResult wrappers
```

### Dependency Graph

```
@noema/types (no deps)
    ↓
@noema/validation (depends: types, zod)
    ↓
@noema/events (depends: types, validation, zod)

@noema/contracts (depends: types, zod)
```

### Key Types Created

**Branded IDs (23 types):**
- UserId, CardId, DeckId, SessionId, TraceId
- EventId, SpanId, ErrorId, AchievementId, BadgeId
- StreakId, RewardId, ChallengeId, LeaderboardId
- ContentId, RevisionId, CommentId, AttachmentId
- NotificationId, SubscriptionId, GraphId, NodeId, EdgeId

**Mental Debugger Taxonomy:**
- 7 Trace Frames (F0-F6): Reading → Encoding → Storage → Retrieval → Reasoning → Output → Metacognition
- 10 Failure Families: Parsing, Encoding, Attention, Storage, Retrieval, Reasoning, Expression, Bias, Metacognition, External

**AgentHints v2.0.0:**
- 11 Required fields for comprehensive agent guidance
- 5 Optional fields for advanced scenarios
- Rich typing for actions, resources, risks, dependencies

## Consequences

### Positive
- Type-safe IDs prevent mixing different entity types
- Runtime validation catches errors at API boundaries
- Consistent AgentHints format across all 15 services
- Event schemas enable reliable event-driven communication
- Mental Debugger taxonomy supports 10 failure families

### Negative
- Additional complexity vs. plain string types
- Validation package adds bundle size where used
- AgentHints requires all services to populate many fields

### Mitigations
- Factory functions abstract complexity
- Validation is tree-shakeable
- `createEmptyAgentHints()` provides sensible defaults

## References

- [MCP Tool Specification - AgentHints v2.0.0](../../../MCP_TOOL_SPECIFICATION.md)
- [Noema Architecture Overview](../diagrams/system-overview.md)
- [Event-Driven Architecture Guide](../../guides/development/events.md)
