# ADR-025: Deterministic Eligibility Groups Own Mode Routing

| Field       | Value                                            |
| ----------- | ------------------------------------------------ |
| **Status**  | Accepted                                         |
| **Date**    | 2026-05-01                                       |
| **Phase**   | Realignment Batch 0 - ADR baseline               |
| **Authors** | Codex (AI), directed by project owner            |
| **Sources** | `IMPLEMENTATION_PLAN_FINAL.md`, `REALIGNMENT.md` |

## Context

Noema already has 30 epistemic modes. The realignment does not add another mode
layer above them. It routes learner/concept state into eligibility groups, then
selects a concrete mode from the eligible group.

## Decision

Mode routing is deterministic and shared.

- All 30 `EpistemicMode` values must be assigned to at least one
  `EligibilityGroup`.
- Trigger state takes priority over general concept state when selecting a
  group.
- Mode choice inside a group uses least-recently-used selection with
  deterministic tiebreaks.
- Agents may help with optional tiebreaking only when the deterministic rule
  explicitly asks for help; they do not own routing.

## Rationale

- Deterministic routing makes trigger behavior auditable.
- Keeping all 30 modes preserves product capability while avoiding an opaque
  "mode engine" above the canonical modes.
- Shared pure helpers prevent services and agents from drifting.

## Alternatives Considered

| Option                                         | Pros                  | Cons                                                         | Rejected because                                    |
| ---------------------------------------------- | --------------------- | ------------------------------------------------------------ | --------------------------------------------------- |
| Let agents choose any mode                     | Flexible              | Hard to validate, non-deterministic, and can ignore triggers | The plan requires deterministic eligibility routing |
| Create a new high-level teaching-strategy enum | Simplifies UI wording | Adds abstraction above the 30 modes                          | The realignment says modes operate directly         |
| Keep old `TeachingApproach.STANDARD` fallback  | Easy default          | Reintroduces stale vocabulary and no cognitive intent        | `STANDARD` is explicitly removed                    |

## Implementation Boundary

Batch 1 supplies shared vocabulary. Batch 2 implements group membership and pure
selection helpers. Later services persist and use recent-mode histories where
needed.

## Acceptance Checks

- Every mode appears in at least one group.
- Every group has at least three modes.
- `confusion`, `overconfidence`, and `slow_thinking` triggers route before
  general concept-state logic.
- No production code imports `TeachingApproach`, `teachingApproach`, or
  `STANDARD`.

## Consequences

- The mode-aware dual-use substrate remains active, but pedagogical mode routing
  uses `EpistemicMode` and `EligibilityGroup`, not old TeachingApproach names.
- Existing fallback defaults must become explicit real modes.

## References

- `IMPLEMENTATION_PLAN_FINAL.md` sections 3, 4.1, 5, 16 Batches 1-2, and 19.
- `REALIGNMENT.md` section 4.
- `docs/adr/ADR-011-direct-rename-no-alias-policy.md`
