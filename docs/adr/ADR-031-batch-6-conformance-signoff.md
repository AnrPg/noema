# ADR-031: Batch 6 Conformance Sign-off

- **Date:** 2026-05-02
- **Status:** accepted
- **Deciders:** Codex

## Context

Batch 6 is the largest realignment refactor because it destructively replaces
scheduler-service's card/cohort model with concept-first scheduling. ADR-028
implemented the initial refactor, ADR-029 fixed critical/high loop correctness
gaps, and ADR-030 cleaned medium/low semantic drift. A final sign-off phase is
needed to prove the Batch 6 requirements against the implementation plan,
excluding the knowledge-graph Batch 7 scope.

## Decision

This phase will produce a traceable Batch 6 conformance report and close non-KG
gaps discovered during the proof pass:

1. Map every Batch 6 requirement from `IMPLEMENTATION_PLAN_FINAL.md` to source,
   tests, docs, and validation commands.
2. Audit scheduler-service routes, schema, migrations, event consumers, runtime
   bootstrap, and public API client exports for concept-first compliance.
3. Add tests that guard against old scheduler APIs/exports returning and that
   cover replay, multi-concept evaluation, missing transformation metadata, and
   route behavior where current test coverage is thin.
4. Update OpenAPI/docs/architecture/ADR notes if the implementation and
   documentation diverge.
5. Run scheduler, API client, and web validation commands and record results.

## Rationale

Passing typecheck and unit tests is not enough for a destructive refactor. A
sign-off needs explicit evidence that deleted APIs stayed deleted, new routes
are present, the event loop is replay-safe, and documentation does not advertise
stale card-centric scheduler behavior.

## Alternatives Considered

| Option                               | Pros                               | Cons                                      | Rejected because                                  |
| ------------------------------------ | ---------------------------------- | ----------------------------------------- | ------------------------------------------------- |
| Rely on current green tests          | Fast                               | Does not prove spec completeness          | The user asked for sign-off confidence            |
| Do full KG stability contract too    | More complete realignment          | User excluded KG from this sign-off scope | Batch 7 should own KG stability rename/projection |
| Add compatibility tests for old APIs | Can prove old behavior still works | Violates direct-delete policy             | Old APIs must stay removed                        |

## Consequences

- Positive: Batch 6 can be signed off with a durable conformance artifact.
- Positive: Future regressions against deleted card-centric surfaces become
  easier to catch.
- Negative / trade-offs: This may add tests/docs without changing runtime
  behavior if the implementation already conforms.
- Follow-up tasks created: none.

## Implementation Notes

- Confirmed the scope boundary before final sign-off. KG stability projection,
  Guardian, strategy/replanning, web cutover, content agents, gamification, and
  closed-loop stress/E2E checks are later-batch work and were intentionally not
  implemented here.
- Replaced stale scheduler OpenAPI docs so they advertise only the Batch 6
  concept-first routes.
- Added route/API-client/domain regression coverage for deleted card APIs,
  concept-first routes, multi-concept evaluations, replay idempotency, and
  missing transformation metadata.
- Removed stale `scheduler:tools:*` dev-auth scopes after the runtime tool/card
  API removal.
- Produced the conformance report at
  `agent-comms/review/batch-6-realignment-signoff-2026-05-02.md`.
- Validation passed: scheduler-service
  test/typecheck/lint/build/db-generate/prisma-validate, api-client
  test/typecheck/build, and web typecheck/lint.
- Did not run `prisma migrate deploy` locally because the Batch 6 migration is
  intentionally destructive; schema validation and client generation passed
  instead.

## References

- `IMPLEMENTATION_PLAN_FINAL.md` §4.10, §11, §15, §16 Batch 6.
- `docs/adr/ADR-028-realignment-batch-6-scheduler-concept-first.md`
- `docs/adr/ADR-029-realignment-batches-0-6-critical-high-remediation.md`
