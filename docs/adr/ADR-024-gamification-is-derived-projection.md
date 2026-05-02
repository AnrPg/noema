# ADR-024: Gamification Is a Derived Projection

| Field       | Value                                            |
| ----------- | ------------------------------------------------ |
| **Status**  | Accepted                                         |
| **Date**    | 2026-05-01                                       |
| **Phase**   | Realignment Batch 0 - ADR baseline               |
| **Authors** | Codex (AI), directed by project owner            |
| **Sources** | `IMPLEMENTATION_PLAN_FINAL.md`, `REALIGNMENT.md` |

## Context

The previous implementation stored some reward-like state near sessions, such as
streak state, and older product language could imply permanent mastery.
Realignment requires gamification to reflect current learning evidence rather
than create independent truth.

## Decision

`gamification-service` is a derived projection/cache layer.

- It does not own source-of-truth learning state.
- XP, streaks, badges, achievements, Memory Integrity Score, and capability
  tiers derive from Step completions, Evaluations, scheduler state, KG
  stability, and session completion events.
- Streak days require at least one Step above `R_STREAK_THRESHOLD`.
- Badges tied to stability revoke when concept state flips to `unstable`.

## Rationale

- Rewards should represent current learning truth, not independent counters.
- Quality-gated streaks avoid rewarding low-reasoning repetition.
- Revocable badges align motivation with stability rather than permanent mastery
  claims.

## Alternatives Considered

| Option                                | Pros                  | Cons                                                           | Rejected because                                        |
| ------------------------------------- | --------------------- | -------------------------------------------------------------- | ------------------------------------------------------- |
| Keep streaks in session-service       | Simple and existing   | Makes reward state source-of-truth and correctness/card driven | Streak quality depends on Evaluation evidence           |
| Store permanent earned badges         | Familiar gamification | Contradicts revocable concept stability                        | Badges must reflect current truth                       |
| Compute everything live with no cache | Always fresh          | Expensive and fragile for dashboard reads                      | Projection cache is acceptable when not source-of-truth |

## Implementation Boundary

Batch 12 creates the gamification service. Batch 4 removes session-owned
`UserStreak`. Batch 7 emits concept-state changes. Batch 5 emits Evaluation
events required for quality-gated derivation.

## Acceptance Checks

- A low-reasoning day does not extend the streak.
- A stable-to-unstable concept flip revokes the relevant derived badge.
- No learner-facing copy claims permanent mastery.

## Consequences

- Gamification APIs must explain derived status and may lag briefly if backed by
  projection cache.
- Tests need event-driven projection scenarios, not only direct repository
  reads.

## References

- `IMPLEMENTATION_PLAN_FINAL.md` sections 2.2, 4.15, 13, 16 Batch 12, 19, and
  21.1.
- `REALIGNMENT.md` section 10.
- `docs/adr/ADR-021-revocable-concept-stability.md`
