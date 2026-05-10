# Pedagogy Guardian Service

`@noema/pedagogy-guardian-service` is the independent validation gate for
realignment learning artifacts. It accepts proposed artifacts, evaluates
deterministic rules, persists a `GuardianValidation`, and returns:

```ts
{
  result: 'accepted' | 'warning' | 'rejected';
  reasonCodes: string[];
  blocking: boolean;
  validationId: string;
}
```

## REST Surface

- `POST /v1/validate/lesson-plan`
- `POST /v1/validate/step`
- `POST /v1/validate/activity`
- `POST /v1/validate/replan`
- `POST /v1/validate/generated-variant`

Blocking responses use HTTP 422 and also emit `pedagogy.validation.rejected`.

Warning responses are non-blocking and are selected only when all reason codes
belong to the explicit Guardian warning set. Mixed warning/blocking reason-code
sets are rejected.

## Producer Integration

`session-service` owns a `IPedagogyGuardianPort` and calls Guardian before
LessonPlan activation and before Step queueing. The returned validation ID is
stored on the LessonPlan or Step record.

`content-service` owns its own `IPedagogyGuardianPort` and calls Guardian before
persisting a generated activity variant. The returned validation ID is stored on
the variant.

Both producers use HTTP adapters only when `PEDAGOGY_GUARDIAN_ENABLED=true`;
otherwise they use a no-op adapter for local batch-by-batch development.

## Authority Boundary

Guardian is a broad hard validation gate, not a generic business-rule owner. It
may accept, warn, or veto learner-facing pedagogical artifacts and creation
pipeline proposals, but it does not own graph state, curriculum state, content
provenance, scheduling, Evaluation facts, or session runtime. Producing
services must still enforce their own schemas, domain invariants,
authorization, provenance, typestate, and persistence rules.

## Validation Families

- LessonPlan structure: active-goal limit, duplicate Step IDs, contradictory
  goal pairs, orphan Steps, full-rigor goal coverage, evaluation alignment, and
  prerequisite stability.
- Step structure: non-empty objective/evaluation type, selected mode
  eligibility, concept references, activity presence, source compatibility, and
  repair-step minimum change.
- Activity payloads: source discriminator consistency and response schema shape.
- Replans: minimum sufficient scope and no mutation of already evaluated Steps.
- Generated variants: no answer leakage, schema compatibility, and basic content
  safety placeholders.
