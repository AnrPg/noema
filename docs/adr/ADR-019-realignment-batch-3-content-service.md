# ADR-019 — Realignment Batch 3 Content Service

- **Date:** 2026-05-01
- **Status:** accepted
- **Deciders:** Codex

## Context

`IMPLEMENTATION_PLAN_FINAL.md` defines Batch 3 as the content-service phase.
Cards remain part of the system, but only as payload sources/templates for Step
Activities; they are no longer the runtime learning unit. Content-service must
therefore expose card metadata needed by the Step loop, cache generated activity
variants, and provide a candidate-query API for session-service/agents.

> Batch 0 caveat: an earlier implementation pass partially edited Batch 3 files.
> Those edits remain in the worktree, but this ADR is not a sign-off. When Batch
> 3 receives a go-ahead, the partial code must be reviewed and refactored or
> replaced as fresh work.

## Decision

Batch 3 will:

1. Extend `Card` persistence and domain DTOs with `compatibleTransformations`,
   `defaultEligibilityGroups`, and `supportedStudyModes`.
2. Add a `GeneratedActivityVariant` persistence model with `ttlAt` TTL
   semantics.
3. Add content-service domain/repository operations for activity payload
   candidates.
4. Expose `POST /v1/activity-payload-candidates`.
5. Keep existing card import behavior, adding only a `concepts.extracted` event
   after import creates cards linked to concepts.
6. Add a migration backfill that gives existing cards at least one compatible
   transformation while preserving an empty database default for raw future
   inserts.

## Rationale

This preserves content-service as the archive/payload boundary while allowing
the session-service Step loop to request reusable cards, templates, or generated
variants without treating cards as the learner-visible unit. Generated variants
belong here because content-service owns generated activity payloads and
cache/TTL behavior.

## Alternatives Considered

| Option                                             | Pros                                                     | Cons                                                           | Rejected because                                         |
| -------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------- |
| Store generated variants in session-service        | Co-locates runtime Step execution with selected payloads | Blurs runtime aggregate ownership with content cache ownership | Plan assigns generated variants to content-service       |
| Keep new card metadata only inside `metadata` JSON | No migration needed                                      | Harder to validate/query and weaker API contract               | Batch 3 explicitly requires card schema fields           |
| Add a separate ingestion service now               | Cleaner future ingestion orchestration boundary          | Larger service surface and out of Batch 3 scope                | Plan says ingestion stays inside content-service for now |

## Implementation Plan

1. Add schema/domain fields for card compatibility metadata. Completed.
2. Add generated variant model, domain types, repository methods, and candidate
   selection logic. Completed.
3. Add REST route for activity payload candidate requests. Completed.
4. Emit `concepts.extracted` after import execution when created cards have
   linked concept IDs. Completed.
5. Add migration/backfill support and focused tests. Completed; local DB apply
   was blocked by Docker Desktop not running.

## Step Log

- 2026-05-01 — Phase ADR created before Batch 3 implementation.
- 2026-05-01 — Status changed to "prepared; not signed off" during the deeper
  Batch 0 pass.
- 2026-05-01 — Reopened Batch 3 for implementation and audited the partial
  content-service draft against `IMPLEMENTATION_PLAN_FINAL.md`.
- 2026-05-01 — Corrected the card schema default for `compatibleTransformations`
  from provisional `RECALL` to ground-truth empty default, with app-level create
  rejection and migration backfill providing meaningful values.
- 2026-05-01 — Regenerated the content-service Prisma client after adding
  generated variants and card compatibility columns.
- 2026-05-01 — Added `POST /v1/activity-payload-candidates`, content-service
  repository selection, cache passthrough, and api-client types/method.
- 2026-05-01 — Added `concepts.extracted` publication after import execution
  creates cards linked to knowledge nodes.
- 2026-05-01 — Validation passed for content-service lint, typecheck, tests,
  build, and Prisma generation. Dev DB migration apply was attempted but blocked
  because Docker Desktop's Linux engine was not running.

## Emergent Decisions

- Card compatibility defaults are sourced from shared `@noema/types` helpers
  instead of duplicating the Batch 2 mapping in content-service.
- `compatibleTransformations` keeps an empty DB default to match the plan, but
  content-service create/batch-create normalizes missing values from card type
  and rejects explicit empty arrays.
- Generated activity variants are queried only while `ttlAt` is in the future;
  returned variants have hit counts incremented after selection.
- Activity payload candidate reads bypass the card query cache because generated
  variants can be created without a card write and must not be hidden by stale
  query-cache entries.
- `concepts.extracted` uses a generic event payload for now because no narrower
  shared content-import event contract exists yet.

## Consequences

- Positive: session-service can build Step Activities from content payloads
  without depending on card runtime semantics.
- Positive: generated activity variants become cacheable and expire
  independently of sessions.
- Trade-off: content-service now owns more query metadata on cards; future
  Guardian validation will need to inspect these fields.
- Trade-off: local migration application could not be verified in this run
  because required Docker-managed infrastructure was unavailable.

## References

- `IMPLEMENTATION_PLAN_FINAL.md` Batch 3.
- `IMPLEMENTATION_PLAN_FINAL.md` §4.12 and §6.3.
- `REALIGNMENT.md`.
- `packages/types/src/eligibility/mode-groups.ts`.
- `services/content-service/prisma/migrations/20260501000000_content_service_step_payloads/migration.sql`.
