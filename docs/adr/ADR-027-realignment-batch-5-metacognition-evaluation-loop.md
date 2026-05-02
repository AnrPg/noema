# ADR-027 - Realignment Batch 5 Metacognition Evaluation Loop

- **Date:** 2026-05-02
- **Status:** accepted
- **Deciders:** Codex

## Context

`IMPLEMENTATION_PLAN_FINAL.md` makes Batch 5 the point where
`metacognition-service` stops being a type-only placeholder and becomes the
canonical owner of Evaluation persistence, reasoning-quality scoring, combined
score derivation, scheduler rating mapping, rolling concept reasoning averages,
and Trigger emission. Earlier ADR-013 already assigns ownership to
metacognition; this phase defines the concrete implementation plan.

## Decision

Batch 5 will implement `metacognition-service` as a first-class TypeScript
Fastify service with Prisma persistence and pure domain modules:

- `Evaluation`, `Trigger`, and `ConceptReasoningAverage` are persisted in a new
  Prisma schema owned by `services/metacognition-service`.
- `domain/reasoning-quality.ts` deterministically scores the 7-frame trace in
  `[0, 1]`.
- `domain/combine-signals.ts` applies the realignment formula where trace
  quality dominates self-rating.
- `domain/fsrs-rating.ts` maps combined score to the internal scheduler rating.
- `domain/triggers/*.rule.ts` emits first-class Triggers for failure, confusion,
  slow thinking, overconfidence, boredom, and prerequisite gaps.
- `POST /v1/evaluations` computes, persists, updates rolling averages, and emits
  `metacognition.evaluation.recorded` plus `metacognition.trigger.fired`.
- `GET /v1/concepts/:conceptId/reasoning-average` returns the rolling average
  maintained by the service.

The first implementation will keep trigger rules deterministic and
configuration-driven. It will not call LLMs or external scoring APIs.

## Rationale

This keeps the reasoning-dominant loop testable and replayable. Pure scoring and
trigger modules let later scheduler, KG, strategy, and gamification batches
consume the same canonical Evaluation facts without duplicating interpretation
logic.

## Alternatives Considered

| Option                                                 | Pros                        | Cons                                               | Rejected because                                             |
| ------------------------------------------------------ | --------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| Store only raw traces and compute scores downstream    | Simpler persistence         | Reintroduces multiple owners of Evaluation meaning | Violates the one-source-of-truth rule                        |
| Put scoring in session-service when a Step is answered | Shorter request path        | Session would own metacognitive facts              | Conflicts with ADR-013 and Batch 5                           |
| Use LLM scoring for every trace                        | Potentially richer judgment | Cost, latency, nondeterminism, harder tests        | Realignment requires deterministic rules to constrain agents |

## Consequences

- Positive: Evaluation and Trigger facts have one canonical owner.
- Positive: Scheduler and KG can consume a stable
  `metacognition.evaluation.recorded` event.
- Positive: Correct answers with poor traces and wrong answers with strong
  traces behave according to the realignment acceptance criteria.
- Trade-off: Initial per-frame scoring rules are heuristic until empirical data
  exists; they are isolated for later tuning.

## Implementation Notes

- Initial scoring accepts explicit frame scores when present and otherwise
  derives frame scores from structured diagnostic fields. This is a Batch 5
  implementation detail, not a new product rule.
- Reasoning averages are persisted per `(userId, conceptId)` with a configurable
  rolling window so Batch 7 can project concept stability without rescanning all
  evaluations.
- The KG `MisconceptionDetection` bridge is represented as an event-consumer
  extension point in this batch; full KG event wiring can harden in Batch 7 when
  concept-state projection is implemented.

## Implementation Update - 2026-05-02

- Added the `@noema/metacognition-service` workspace package with Fastify,
  Prisma, Redis event publishing, health probes, and authenticated Batch 5 REST
  endpoints.
- Added Prisma persistence for `Evaluation`, `Trigger`, and
  `ConceptReasoningAverage`.
- Added deterministic domain modules for 7-frame trace scoring, signal
  combination, scheduler rating derivation, and trigger rules.
- Added focused unit coverage for low-reasoning/correct and high-reasoning/wrong
  acceptance cases plus trigger emission.
- Updated the root ESLint ignore list because `metacognition-service` is no
  longer a skeleton service.
- Batch 6 follow-up enriched `metacognition.evaluation.recorded` with optional
  `studyMode` and `transformation` metadata from Step evidence so
  scheduler-service can scope concept state and persist transformation history.

## References

- `IMPLEMENTATION_PLAN_FINAL.md` Batch 5
- `REALIGNMENT.md` sections 6 and 8
- ADR-013 - Evaluation owned by metacognition-service
