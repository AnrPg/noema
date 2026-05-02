# ADR-030: Realignment Medium/Low Semantic Cleanup

- **Date:** 2026-05-02
- **Status:** accepted
- **Deciders:** Codex

## Context

After ADR-029 fixed the critical/high correctness gaps, the remaining medium/low
issues are mostly semantic drift and cleanup debt: web copy still says "mastery"
or "cards" in Step/concept-first places, local component/store names still
preserve old card-attempt vocabulary, and some UI helpers keep compatibility
names even though their runtime data is already realigned.

The implementation plan explicitly says to rename directly and avoid aliases
because the product is unreleased. `REALIGNMENT.md` also requires learner-facing
language to use revocable stability rather than permanent mastery.

## Decision

This remediation phase will clean up medium/low drift without changing public
service contracts:

1. Rename remaining local web Step/session vocabulary from card/attempt wording
   to Step/evaluation wording.
2. Rename the compatibility-named concept schedule inspector component/file.
3. Rename the session mode selector's local `PhilosophicalMode` type to the
   shared `LearningMode` vocabulary.
4. Update learner-facing web copy from "mastery/mastered/cards due" to
   "stability/stable/concepts due" where the realigned data is already concept-
   or Step-scoped.
5. Keep existing backend/API field names such as `masteryLevel` only where they
   are still part of the current knowledge-graph contract; those require a
   larger service-wide contract rename and are not changed in this cleanup.

## Rationale

These changes remove misleading semantics while avoiding unnecessary churn in
backend contracts that are already working and validated. The cleanup focuses on
user-facing and local implementation names, which were the main residual source
of confusion after the critical/high remediation.

## Alternatives Considered

| Option                                  | Pros                     | Cons                                                              | Rejected because                                                   |
| --------------------------------------- | ------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| Rename every `mastery*` API field now   | Fully aligned vocabulary | Broad public contract change across KG, API client, and web       | Too risky for a medium/low cleanup pass without a dedicated KG ADR |
| Leave compatibility names in place      | Minimal churn            | Violates the direct-rename stance and keeps future work confusing | The plan requires stale naming to be removed                       |
| Add aliases from old names to new names | Easy migration           | Reintroduces forbidden compatibility shims                        | The product is unreleased and the plan says no aliases             |

## Consequences

- Positive: web code and copy better reflect Step, Evaluation, and
  concept-schedule semantics.
- Positive: future searches for deleted card queue / attempt concepts produce
  less noise.
- Negative / trade-offs: some KG DTO field names remain `mastery*` until a
  dedicated contract rename handles the full backend surface.
- Follow-up tasks created: consider a dedicated KG stability-contract ADR for
  `masteryLevel`, `masteredNodes`, and related DTO names.

## Implementation Notes

- Renamed the local session mode type from `PhilosophicalMode` to
  `SessionLearningMode` and kept it tied to the shared `LearningMode`
  vocabulary.
- Renamed the compatibility-named review inspector from
  `card-schedule-inspector.tsx` / `CardScheduleInspector` to
  `concept-schedule-inspector.tsx` / `ConceptScheduleInspector`.
- Refactored session summary vitals to be Step-loop native instead of accepting
  card attempt rows.
- Renamed session store working-memory fields from card/attempt terminology
  (`completedCardCount`, `advanceCard`, `pendingAttempt`) to Step/evaluation
  terminology (`completedStepCount`, `advanceStep`, `pendingEvaluation`).
- Updated learner-facing web copy from mastery/card wording to
  stability/concept/Step wording where the underlying data is already realigned.
- Fixed remaining web lint warnings for missing return types in unrelated
  low-severity files touched by the lint pass.
- Validation run on 2026-05-02:
  - `pnpm --filter @noema/api-client typecheck`
  - `pnpm --filter @noema/web typecheck`
  - `pnpm --filter @noema/web lint`

## References

- `IMPLEMENTATION_PLAN_FINAL.md`
- `REALIGNMENT.md`
- `docs/adr/ADR-029-realignment-batches-0-6-critical-high-remediation.md`
