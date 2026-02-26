# ADR-008: ProposerId — Allowing Admin Users to Propose CKG Mutations

## Status

Accepted

## Date

2026-02-26

## Context

The CKG mutation pipeline (ADR-005, Phase 6) was originally designed so that
only AI agents could propose structural changes to the Canonical Knowledge
Graph. The `proposedBy` field on `ICkgMutation`, `ICreateMutationInput`, and
throughout the pipeline was typed as `AgentId` (branded string with `agent_`
prefix).

In practice, platform administrators also need the ability to propose CKG
mutations — for example, to correct ontological errors, seed initial domain
structures, or respond to curriculum changes that don't originate from the
aggregation pipeline. Restricting CKG writes to agents alone created an
unnecessary bottleneck: admins had to either hack around the type system or
trigger agent-mediated mutations for simple corrections.

The updated design requirement (reflected in PHASE-8-API-EVENTS.md and related
specification documents) states that CKG mutations can be proposed by **agents
or users with the `admin` role**.

### Design Decision: ProposerId Union Type

**Problem:** The `proposedBy` field is typed as `AgentId` throughout the
mutation pipeline. Changing it to accept admin user IDs requires a type-safe
approach that preserves the branded ID semantics and doesn't break existing
agent-initiated flows.

| Option                                             | Description                                         | Trade-off                                                  |
| -------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| A: Widen to `string`                               | Remove branding from `proposedBy`                   | Loses type safety; any string is accepted                  |
| **B: Union type `ProposerId = AgentId \| UserId`** | New union type with runtime discriminator utilities | Type-safe; prefix-based discrimination; additive change    |
| C: New branded type `ProposerId` with own prefix   | Separate `proposer_` prefix, new factory            | Extra ID type to maintain; doesn't reuse existing prefixes |

**Decision:** Option B — `ProposerId = AgentId | UserId` union type.

A `ProposerId` is either an `agent_`-prefixed `AgentId` or a `user_`-prefixed
`UserId`. The `ProposerId` companion object provides `isAgent()`, `isUser()`,
and `isValid()` utilities for runtime discrimination. This is maximally
additive: existing agent-initiated flows pass `AgentId` values unchanged (since
`AgentId` is a subtype of `ProposerId`), and admin flows pass `UserId` values.

## Changes

### `@noema/types` — `packages/types/src/branded-ids/index.ts`

- Added `ProposerId` type alias: `AgentId | UserId`
- Added `ProposerId` companion object with `isAgent()`, `isUser()`, `isValid()`

### `mutation.repository.ts` — Domain interface

- `ICkgMutation.proposedBy`: `AgentId` → `ProposerId`
- `ICreateMutationInput.proposedBy`: `AgentId` → `ProposerId`
- `findMutationsByProposer(proposerId: ProposerId)`: parameter renamed & retyped
- `findMutations(filters)`: `proposedBy` filter field retyped to `ProposerId`

### `ckg-mutation-pipeline.ts` — Pipeline orchestrator

- `proposeMutation(proposerId: ProposerId, ...)`: parameter renamed from
  `agentId` to `proposerId`, retyped. All internal references updated.
- `listMutations(filters)`: `proposedBy` filter retyped to `ProposerId`
- `proposeFromAggregation()`: unchanged — still uses `AgentId` literal
  (`agent_aggregation-pipeline`), which is a valid `ProposerId` subtype.

### `knowledge-graph.service.impl.ts` — Service layer

- `proposeMutation()`: derives `proposerId` from `context.userId` as
  `ProposerId` (was casting to `AgentId`). Admin users authenticated with
  `user_` prefix IDs are now naturally accepted.
- `listMutations()`: filter cast updated from `AgentId` to `ProposerId`.
- Removed unused `AgentId` import.

### `prisma-mutation.repository.ts` — Infrastructure

- Import changed from `AgentId` to `ProposerId`
- `toDomain()`: casts `createdBy` to `ProposerId` (was `AgentId`)
- `findMutationsByProposer()`: parameter retyped
- `findMutations()`: filter parameter retyped

### `ckg-mutation-dsl.ts` — DSL schemas

- `MutationProposalSchema` doc comment updated
- `MutationFilterSchema.proposedBy` doc comment updated

## Consequences

### Positive

- Admin users can now propose CKG mutations through the same pipeline as agents,
  with the same validation, typestate enforcement, and audit trail guarantees.
- The change is fully additive — all existing agent-initiated flows continue to
  work without modification because `AgentId` is a subtype of `ProposerId`.
- Runtime discrimination is available via `ProposerId.isAgent()` / `.isUser()`
  for any future authorization or audit filtering needs.
- The `proposedBy` field in audit logs and events now faithfully records whether
  a mutation was proposed by an agent or a human admin.

### Negative

- Authorization enforcement (verifying the authenticated user actually has
  `admin` role) is deferred to Phase 8's route-level middleware — the service
  layer currently accepts any authenticated identity. This is consistent with
  the existing pattern where `requireAuth(context)` checks authentication but
  not authorization.

### Neutral

- The Prisma schema's `createdBy` column is already `String` — no database
  migration is needed.
- The `proposeFromAggregation()` pipeline method continues to use a hardcoded
  `AgentId` — this is intentional since the aggregation pipeline is always an
  agent.

## References

- ADR-005: Phase 6 — CKG Mutation Pipeline
- PHASE-8-API-EVENTS.md: Updated authorization rules (agents or admin role)
- PHASE-2-SHARED-TYPES-EVENTS.md: Updated `proposedBy` event payload
- PHASE-6-CKG-MUTATION-PIPELINE.md: Updated proposer description
