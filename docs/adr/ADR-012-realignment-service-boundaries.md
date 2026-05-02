# ADR-012: Realignment Service Boundaries

| Field       | Value                                            |
| ----------- | ------------------------------------------------ |
| **Status**  | Accepted                                         |
| **Date**    | 2026-05-01                                       |
| **Phase**   | Realignment                                      |
| **Authors** | Codex (AI), directed by project owner            |
| **Sources** | `IMPLEMENTATION_PLAN_FINAL.md`, `REALIGNMENT.md` |

## Context

The realignment loop touches session planning, content generation, evaluation,
scheduling, knowledge graph state, guardian validation, strategy/replanning, and
gamification. Several facts currently have overlapping owners, especially
attempts, mastery summaries, streaks, and schedule handshakes.

The implementation plan establishes one owner per fact.

## Decision

Adopt the following service boundaries for the realignment:

- `content-service`: cards, templates, media, generated activity variants, and
  payload candidate queries. Cards are content payloads, not runtime units.
- `session-service`: LessonPlans, Goals, Steps, Activities, Step queue, session
  lifecycle FSM, and strategy/replanning module.
- `metacognition-service`: canonical Evaluation persistence, 7-frame trace
  scoring, combined score, reasoning rolling averages, and Trigger emission.
- `scheduler-service`: concept-first scheduling state, queues, scheduling
  algorithms, concept evaluation logs, and transformation history.
- `knowledge-graph-service`: PKG/CKG, prerequisite gaps, and concept stability
  projection/state-change history.
- `pedagogy-guardian-service`: independent validation gate for LessonPlans,
  Steps, replans, and generated variants.
- `gamification-service`: derived projection/cache for XP, streaks, badges,
  capability tiers, and Memory Integrity Score.
- `hlr-sidecar`: HLR math support, unchanged.
- `agents/`: LLM-heavy LessonPlan generation, content variant generation, and
  optional mode tiebreaking only.

Strategy stays inside `session-service`; ingestion stays inside
`content-service`.

## Rationale

- Strategy mutates LessonPlan and Step state transactionally, so keeping it in
  session-service avoids distributed writes for one aggregate.
- Pedagogy Guardian must be independent so no producer can bypass validation.
- Gamification is derived and should not own learning truth.
- Metacognition is the only canonical owner of Evaluation because reasoning
  quality is the realignment's primary signal.

## Alternatives Considered

| Option                                      | Pros                         | Cons                                                                          | Rejected because                                     |
| ------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| Split Strategy into a separate service now  | Strong conceptual separation | Forces network/distributed transaction boundaries around LessonPlan mutations | Strategy has no independent durable state yet        |
| Keep Guardian as a library in each producer | Simple deployment            | Validation can drift or be bypassed                                           | The spec requires an independent policy gate         |
| Keep streaks in session-service             | Immediate UI freshness       | Makes reward state look source-of-truth                                       | Streaks are derived and quality-gated by evaluations |
| Create ingestion-service now                | Clear future pipeline owner  | Adds service surface for one new event and hook                               | Current scope fits content-service                   |

## Phase Plan

Boundaries are implemented across Batches 3 through 12. Any later need to split
Strategy or ingestion requires a new ADR because it changes ownership and
transaction boundaries.

## Ownership Rules

- A service may cache or project another service's fact, but must not become a
  second source of truth for it.
- UI calls application/BFF/API surfaces; it does not reach into persistence.
- Adapters implement ports and do not import UI code.
- Domain code does not import adapters.
- Cross-service writes happen through public APIs, events, or explicit clients,
  never shared database access.

## Boundary Escalations

The following require a new ADR and human review:

- moving Strategy out of session-service
- creating a standalone ingestion-service
- making gamification own non-derived reward truth
- letting scheduler own concept stability projection
- letting content-service own runtime Step state
- letting metacognition or agents bypass Guardian for learner-facing artifacts

## Step Log

- 2026-05-01: Decision recorded before implementation.
- 2026-05-01: Expanded ownership rules and escalation triggers during the deeper
  Batch 0 pass.

## Emergent Decisions During Implementation

- None yet.

## Consequences

- Cross-service APIs and events must reflect fact ownership, not convenience.
- Session-service drops session-owned UserStreak and becomes the Step lifecycle
  owner.
- New service scaffolds are required for Pedagogy Guardian and Gamification
  because the architecture already assumes those behaviors.
- The "no new microservices" note in `REALIGNMENT.md` is resolved by
  `IMPLEMENTATION_PLAN_FINAL.md`: Guardian and Gamification are materialized
  because the target architecture already assumes them.

## References

- `IMPLEMENTATION_PLAN_FINAL.md` sections 2, 10, 13, 16 Batches 8-12, and 21.1.
- `REALIGNMENT.md` sections 8, 9, 10, and 12.
