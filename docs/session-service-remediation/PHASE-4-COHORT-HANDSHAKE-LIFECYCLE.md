# Phase 4 — Cohort Handshake Lifecycle (Propose → Accept/Revise → Commit)

## Goal

Implement a first-class cohort handshake lifecycle in `session-service` to match
scheduler-agent/session orchestration requirements and lineage expectations.

## Why This Phase Exists

Queue-level operations (`inject/remove`) are not enough for auditable,
revision-aware cohort orchestration. The architecture requires explicit
proposal/decision lineage.

## Scope

### In Scope

- Add explicit cohort lifecycle operations:
  - propose
  - accept
  - revise
  - commit
- Persist handshake lineage state/read model (proposalId, decisionId, revision).
- Emit session cohort events:
  - `session.cohort.proposed`
  - `session.cohort.accepted`
  - `session.cohort.revised`
  - `session.cohort.committed`
- Add REST and MCP tool surface for cohort lifecycle.
- Add optimistic revision guards.

### Out of Scope

- Advanced outbox multi-worker claim logic (Phase 5).
- Offline token nonce replay table (Phase 6).

## Target Files (Expected)

- `services/session-service/prisma/schema.prisma`
- `services/session-service/prisma/migrations/**`
- `services/session-service/src/domain/session-service/session.service.ts`
- `services/session-service/src/domain/session-service/session.schemas.ts`
- `services/session-service/src/infrastructure/database/prisma-session.repository.ts`
- `services/session-service/src/api/rest/session.routes.ts`
- `services/session-service/src/agents/tools/session.tools.ts`
- `services/session-service/src/agents/tools/tool.registry.ts`
- `docs/api/openapi/session-service.yaml`
- `services/session-service/tests/**`

## Suggested Data Model Additions

- `session_cohort_handshakes` (or equivalent)
  - `id`
  - `session_id`
  - `proposal_id`
  - `decision_id`
  - `revision`
  - `status` (`proposed|accepted|revised|committed|cancelled`)
  - `candidate_card_ids` (json)
  - `accepted_card_ids` (json nullable)
  - `rejected_card_ids` (json nullable)
  - `metadata` (json)
  - `created_at`, `updated_at`
- Unique/index strategy:
  - unique (`session_id`, `proposal_id`, `revision`)
  - index (`session_id`, `status`)

## Implementation Instructions

1. **Define command schemas**
   - Add Zod schemas for propose/accept/revise/commit payloads.
   - Require linkage IDs and revision values.

2. **Domain methods**
   - Add service methods:
     - `proposeCohort(...)`
     - `acceptCohort(...)`
     - `reviseCohort(...)`
     - `commitCohort(...)`
   - Validate allowed transition graph and enforce monotonic revision.

3. **Persistence + revision guard**
   - Add repository methods for upsert/transition with expected revision checks.
   - Reject stale transitions with clear conflict errors.

4. **Event publication**
   - Publish through existing outbox mechanism.
   - Payloads must match shared event contract in `@noema/events/session`.

5. **Queue integration policy**
   - Define when queue mutation is allowed:
     - Recommended: queue is materialized from committed cohort.
   - Keep legacy inject/remove behavior only if compatibility needed and clearly
     documented.

6. **REST + MCP surface**
   - Add routes and tools for each lifecycle operation.
   - Enforce per-tool scope requirements.

7. **OpenAPI sync**
   - Add new paths/schemas and update tool definitions.

8. **Tests**
   - Transition happy paths.
   - Stale revision rejections.
   - Invalid transition attempts.
   - Event payload conformance.

## Guardrails

- Do not bypass revision checks for convenience.
- Do not publish cohort events without durable state transition persistence.
- Do not mutate committed cohort without an explicit revise flow.
- Keep existing session lifecycle APIs backward compatible unless explicitly
  versioned.

## Checklist

- [ ] Handshake persistence schema + migration created.
- [ ] Service methods for propose/accept/revise/commit implemented.
- [ ] Revision conflict protection added and tested.
- [ ] Cohort events emitted via outbox with correct payloads.
- [ ] REST endpoints + MCP tools added and scope-gated.
- [ ] OpenAPI updated and consistent.
- [ ] Unit/integration tests cover lifecycle and conflicts.

## Exit Conditions

- End-to-end cohort lifecycle is executable and auditable.
- Every transition produces durable lineage and event output.
- Stale or out-of-order transitions are rejected deterministically.

## Rollback Plan

- Disable new cohort routes/tools.
- Roll back migration and repository/service changes.
- Keep legacy queue operations as temporary fallback.
