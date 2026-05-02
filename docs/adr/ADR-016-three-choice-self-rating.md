# ADR-016: Three-Choice Self-Rating Replaces Four-Button Grade

| Field       | Value                                            |
| ----------- | ------------------------------------------------ |
| **Status**  | Accepted                                         |
| **Date**    | 2026-05-01                                       |
| **Phase**   | Realignment                                      |
| **Authors** | Codex (AI), directed by project owner            |
| **Sources** | `IMPLEMENTATION_PLAN_FINAL.md`, `REALIGNMENT.md` |

## Context

The learner-facing session UI currently exposes a four-button grade flow tied to
review-card semantics. The realignment requires a simpler self-rating signal
that complements, but does not dominate, 7-frame reasoning quality.

## Decision

Replace the four-button grade UI with three learner self-ratings:

- `KNEW_IT` -> confidence signal `1.0`
- `HESITATED` -> confidence signal `0.5`
- `DIDNT_KNOW` -> confidence signal `0.0`

The scheduler may still derive an internal `SchedulerRating` (`again`, `hard`,
`good`, `easy`) from combined score, but that rating is not a learner-facing
concept.

Delete `response-controls.tsx` and any conflicting pre-answer confidence UI in
the web cutover batch.

## Rationale

- Three choices are less gameable and map directly to confidence.
- Self-rating is evidence, not a grade. Reasoning quality remains dominant.
- Removing grade buttons prevents learners and UI code from treating scheduler
  ratings as the primary evaluation.

## Alternatives Considered

| Option                                     | Pros               | Cons                                                                        | Rejected because                                    |
| ------------------------------------------ | ------------------ | --------------------------------------------------------------------------- | --------------------------------------------------- |
| Keep four buttons and remap them           | Lower UI churn     | Still teaches users to think in scheduler grades                            | The plan explicitly deletes the old grade UI        |
| Add continuous confidence                  | More nuance        | Easier to overfit and harder to interpret                                   | The realignment wants simple confidence evidence    |
| Capture confidence before and after answer | Richer calibration | Conflicts with the required minimal self-rating unless carefully repurposed | Batch 10 can repurpose only if semantics stay clear |

## Phase Plan

Batch 1 adds shared `StepSelfRating`; Batch 5 uses it in Evaluation; Batch 10
cuts over the web session UI to Step view, self-rating controls, trace builder,
and evaluation summary.

## UI and Data Contract

- The learner chooses exactly one of `KNEW_IT`, `HESITATED`, or `DIDNT_KNOW`.
- The choice maps deterministically to confidence signal `1.0`, `0.5`, or `0.0`.
- The UI must not expose `again`, `hard`, `good`, or `easy` as learner choices.
- Pre-answer confidence UI may survive only if repurposed as trace `f0` evidence
  and clearly separated from final self-rating.

## Acceptance Checks

- Old four-button grade controls are unreachable from session routes.
- Evaluation persists `selfRating` and derived `confidenceSignal`.
- Scheduler ratings are derived internally from `combinedScore`.

## Step Log

- 2026-05-01: Decision recorded before implementation.
- 2026-05-01: Expanded UI/data contract and acceptance checks during the deeper
  Batch 0 pass.

## Emergent Decisions During Implementation

- None yet.

## Consequences

- Learner-facing UI no longer displays scheduler grade buttons.
- Evaluation stores `confidenceSignal`, not learner-selected scheduler rating.
- Playwright tests must verify old grade buttons are unreachable.

## References

- `IMPLEMENTATION_PLAN_FINAL.md` sections 4.1, 7, 14, and 16 Batch 10.
- `REALIGNMENT.md` section 6.
