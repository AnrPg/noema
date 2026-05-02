# ADR-035: Realignment Batch 10 Step-Focused Web Cutover

| Field       | Value                                   |
| ----------- | --------------------------------------- |
| **Status**  | Accepted                                |
| **Date**    | 2026-05-02                              |
| **Phase**   | Realignment Batch 10                    |
| **Authors** | Codex (AI), directed by project owner   |
| **Sources** | `IMPLEMENTATION_PLAN_FINAL.md`, ADR-016 |

## Context

Batch 10 requires the web app to stop presenting the old review-grade and
card-first runtime model. Batches 4-9 already moved the backend loop to
LessonPlan, Step, Evaluation, Trigger, Guardian, and Strategy, but the learner
shell still exposed legacy card vocabulary and did not show the trace/evaluation
payload it was sending.

## Decision

The learner runtime surface is now Step-first:

- Active sessions render a Step view with objective, prompt, mode,
  transformation, response capture, and a three-choice self-rating.
- The learner-facing trace builder and evaluation summary are visible before
  submission and produce the same seven-frame trace sent to the Step answer API.
- Dashboard vitals use concept stability and reasoning trend vocabulary.
- Content management routes retain `/cards` and card API identifiers only as
  implementation payload terminology, while the UI labels them as concept
  payloads.
- The deleted four-button response controls remain deleted; new session tests
  cover the three-choice Step path.

## Rationale

- Step is the atomic learner-visible unit in ADR-010.
- The three-choice self-rating is the learner signal in ADR-016; the old
  scheduler grade labels are internal derivations only.
- Keeping card API identifiers avoids an unnecessary public contract change in
  Batch 10 while still removing card-first learner language.
- Showing the trace/evaluation preview makes the closed loop inspectable before
  Batch 13 E2E work.

## Alternatives Considered

| Option                              | Pros                      | Cons                                  | Rejected because                                  |
| ----------------------------------- | ------------------------- | ------------------------------------- | ------------------------------------------------- |
| Rename `/cards` routes immediately  | Cleaner URL vocabulary    | Larger route migration and link churn | Batch 10 only requires UI and runtime cutover     |
| Hide trace details until after save | Simpler page              | Learner cannot inspect submitted data | Batch 10 explicitly asks for a trace builder      |
| Preserve old card library labels    | Less authoring copy churn | Violates concept-oriented requirement | User requested a broader frontend concept cutover |

## Consequences

- Some TypeScript symbols still include `Card` where the backend API owns
  content payload records.
- Future content batches can rename routes and API resources after the Step loop
  is fully closed.
- The web package still lacks a runnable Vitest or Playwright package script;
  lint and typecheck are the enforceable web validations for this batch.

## References

- `IMPLEMENTATION_PLAN_FINAL.md` §14, §16 Batch 10, §19
- `docs/adr/ADR-010-step-is-the-atomic-learning-unit.md`
- `docs/adr/ADR-016-three-choice-self-rating.md`
