# Phase 3 — Contract Drift & Blueprint Fidelity

## Goal

Remove schema/tool contract drift and enforce stricter blueprint execution
fidelity.

## Why This Phase Exists

Current tool-level input contracts and domain/OpenAPI semantics are not fully
aligned; blueprint validation is permissive where deterministic execution is
expected.

## Scope

### In Scope

- Align attempt outcome contract across tool schema, domain schema, and API
  docs.
- Enforce ordered blueprint card-list fidelity (execute-as-is contract).
- Optionally add `blueprintHash` integrity check if implemented consistently.
- Add tests for schema parity and blueprint mismatch cases.

### Out of Scope

- New cohort state machine/events (Phase 4).
- Outbox worker reliability redesign (Phase 5).

## Target Files (Expected)

- `services/session-service/src/agents/tools/session.tools.ts`
- `services/session-service/src/domain/session-service/session.schemas.ts`
- `services/session-service/src/domain/session-service/session.service.ts`
- `docs/api/openapi/session-service.yaml`
- `services/session-service/tests/**`

## Implementation Instructions

1. **Resolve outcome enum drift**
   - Choose one canonical outcome set.
   - Recommended minimal fix: remove `timeout` from tool schema if unsupported
     elsewhere.
   - If adding `timeout`, propagate to shared enums/events/OpenAPI and all
     validators.

2. **Blueprint strictness**
   - Replace set-based consistency with ordered list equivalence.
   - Report clear field-level errors indicating index mismatch.

3. **Optional integrity token (`blueprintHash`)**
   - If added, make it deterministic (stable serialization).
   - Validate hash before session creation.

4. **Docs synchronization**
   - Ensure OpenAPI matches runtime validators and tool schema behavior.

5. **Tests**
   - Tool validation accepts only runtime-supported outcomes.
   - Blueprint fails when ordering differs.
   - Blueprint passes when exact order/content matches.

## Guardrails

- Do not introduce partial schema parity (all layers must agree).
- Do not alter behavior in hidden ways without updating OpenAPI.
- If `blueprintHash` is introduced, avoid non-deterministic hashing inputs.

## Checklist

- [ ] Attempt outcome enum is consistent across all layers.
- [ ] Blueprint consistency enforces order and content fidelity.
- [ ] OpenAPI updated to match actual runtime validation.
- [ ] Tests cover positive and negative contract cases.
- [ ] Existing tests remain green.

## Exit Conditions

- No contract drift between tool schema, domain validator, and OpenAPI for
  attempt outcomes.
- Blueprint "execute-as-is" guarantee is technically enforced.

## Rollback Plan

- Revert enum harmonization changes.
- Restore previous blueprint consistency logic.
- Roll back OpenAPI updates and associated tests.
