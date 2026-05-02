# ADR-018: Realignment Batch 2 Mode Eligibility and Transformations

| Field       | Value                                            |
| ----------- | ------------------------------------------------ |
| **Status**  | Accepted                                         |
| **Date**    | 2026-05-01                                       |
| **Phase**   | Realignment Batch 2                              |
| **Authors** | Codex (AI), directed by project owner            |
| **Sources** | `IMPLEMENTATION_PLAN_FINAL.md`, `REALIGNMENT.md` |

## Context

The realignment requires deterministic routing from learner/concept state into
eligibility groups over all 30 epistemic modes. It also requires repetition with
transformation: a concept revisit must cycle through recall, explanation,
comparison, application, perturbation, and error detection before repeating.

> Batch 0 caveat: an earlier implementation pass touched Batch 2 files. Those
> edits remain in the worktree, but this ADR is not a sign-off. When Batch 2 is
> reopened, the code must be reviewed as fresh implementation against `ADR-022`
> and `ADR-025`.

## Decision

Implement the routing and cycling rules in `@noema/types` so all services and
agents import the same deterministic behavior.

- `MODE_GROUPS` classifies every EpistemicMode into at least one
  EligibilityGroup.
- `selectEligibleGroup` applies the realignment trigger/concept-state routing
  table.
- `selectModeFromGroup` selects the least-recently-used mode inside a group.
- `selectTransformation` selects the least-recently-used transformation and
  cycles all six before repeating.
- `DEFAULT_CARD_TRANSFORMATIONS` exposes the §6.1 card/remediation-card default
  compatibility table as pure shared data for Batch 3 consumers.

## Rationale

- These rules are pure domain vocabulary and should not be copied into
  individual services.
- Deterministic functions make agent outputs constrainable and testable.
- Keeping routing in `@noema/types` lets later services adopt it without adding
  dependencies or service calls.

## Alternatives Considered

| Option                                         | Pros                   | Cons                                                      | Rejected because                                            |
| ---------------------------------------------- | ---------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| Put routing in session-service                 | Close to Step planning | Agents and content generation would need to duplicate it  | Shared deterministic rules belong in the foundation package |
| Let agents choose groups directly              | Flexible               | Non-deterministic and less auditable                      | The spec requires deterministic eligibility routing         |
| Store transformation cycling only in scheduler | Close to history state | Other generators still need the canonical order and types | Scheduler owns history; shared package owns pure selection  |

## Phase Plan

1. Add eligibility and transformation helpers in `packages/types`.
2. Export them from the package root.
3. Add unit tests proving every mode is assigned, every group has at least three
   modes, trigger routing is deterministic, and transformations cycle.
4. Run `@noema/types` tests and typecheck, then update this ADR.

## Step Log

- 2026-05-01: Phase ADR created before Batch 2 code edits.
- 2026-05-01: Added `MODE_GROUPS`, `selectEligibleGroup`, `selectModeFromGroup`,
  `selectTransformation`, and exports from `@noema/types`.
- 2026-05-01: Added Vitest coverage for all-mode assignment, minimum group
  breadth, deterministic trigger routing, LRU mode selection, and transformation
  cycling.
- 2026-05-01: Ran `pnpm --filter @noema/types test`, typecheck, and build. All
  passed.
- 2026-05-01: Status changed to "prepared; not signed off" during the deeper
  Batch 0 pass. Existing edits must be re-audited before Batch 2 is accepted.
- 2026-05-01: Re-opened Batch 2 with project owner go-ahead. The earlier
  eligibility helper draft is being treated as provisional and reworked against
  the exact §5 mode table and §6 transformation selector from
  `IMPLEMENTATION_PLAN_FINAL.md`.
- 2026-05-01: Replaced the provisional mode grouping with the full §5 mapping,
  including `MODE_TO_ELIGIBILITY_GROUPS` for reverse lookup and invariant
  checks.
- 2026-05-01: Tightened `selectEligibleGroup` to the plan's required input shape
  and priority order: trigger routing, weak reasoning, transfer, new concept,
  then reinforcement fallback.
- 2026-05-01: Added `DEFAULT_CARD_TRANSFORMATIONS` and
  `getDefaultCompatibleTransformations` for the §6.1 card type compatibility
  defaults.
- 2026-05-01: Replaced provisional tests with table-driven coverage for all 30
  modes, every eligibility group, trigger priority, deterministic mode LRU,
  transformation cycling, scheduler-style transformation history entries, and
  every card/remediation-card transformation default.

## Emergent Decisions During Implementation

- Replaced the earlier approximate grouping with the exact source-of-truth §5
  table. No extra eligibility groups or approximate assignments remain.
- Kept transformation tiebreaks in canonical enum order rather than alphabetical
  order. The implementation plan requires deterministic selection, and enum
  order preserves the declared six-step cognitive cycle.
- Added card transformation defaults in Batch 2 as pure data only. Batch 3 still
  owns persistence, backfill, and content-service enforcement.

## Validation Results

- Passed: `pnpm --filter @noema/types lint`
- Passed: `pnpm --filter @noema/types test`
- Passed: `pnpm --filter @noema/types typecheck`
- Passed: `pnpm --filter @noema/types build`
- Not passed: `pnpm typecheck` at repo root. It clears the Batch 2
  `@noema/types` work and still fails in the pre-existing Batch 3
  content-service draft where Prisma generated types do not yet include the
  partially added card compatibility and generated activity variant schema.

## Acceptance

- All 30 epistemic modes are routable.
- Every eligibility group has at least three modes.
- Trigger/concept-state routing is deterministic.
- Transformation selection cycles all six transformations before repeating.
- Every card and remediation-card type has at least one default compatible
  transformation for Batch 3 backfill/enforcement.

## References

- `IMPLEMENTATION_PLAN_FINAL.md` sections 5, 6, 16 Batch 2, and 17.
- `REALIGNMENT.md` sections 4 and 7.
