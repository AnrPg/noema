# Gamification Service

`gamification-service` is a derived projection boundary for learner-facing
progression state. It subscribes to closed-loop learning events and materializes
read models for streaks, XP, badges, achievements, capability tiers, and Memory
Integrity Score.

The service does not own learning truth. It consumes:

- `metacognition.evaluation.recorded` for reasoning quality, combined score, and
  Step evidence
- `knowledge_graph.concept_state.changed` for revocable concept stability
- `session.completed` for active-day and session completion signals

REST endpoints:

- `GET /v1/users/:userId/gamification/summary`
- `GET /v1/users/:userId/gamification/streak`
- `GET /v1/users/:userId/gamification/badges`
- `GET /v1/users/:userId/gamification/progression`

Projection semantics:

- Streak days qualify only when at least one evaluation meets
  `R_STREAK_THRESHOLD`.
- Concept-stability badges are revocable and emit `gamification.badge.granted`
  or `gamification.badge.revoked` on state changes only.
- Capability tier and Memory Integrity Score are deterministic functions of
  projection state, not hand-edited user profile fields.
