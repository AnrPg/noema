# Session Service Step Loop

Batch 4 realigns `session-service` around the Step-first learning loop.

## Ownership

`session-service` owns:

- `Session.lifecycleState`
- `LessonPlan`
- `LessonPlanGoal`
- `Step`
- `Activity`
- `StepQueueItem`

It no longer owns card-level `Attempt`, `SessionQueueItem`, cohort handshakes,
or streak cache state. Batch 9 adds Strategy/replanning inside the same
aggregate boundary.

## REST Surface

- `POST /v1/sessions` creates a session in `planning`.
- `POST /v1/sessions/:sessionId/lesson-plan` creates and activates one
  LessonPlan for that session.
- `POST /v1/lesson-plans/:lessonPlanId/goals` adds a goal and enforces the
  4-active-goal cap.
- `GET /v1/sessions/:sessionId/next-step` returns the next pending Step.
- `POST /v1/steps/:stepId/present` marks the Step presented and transitions the
  session to `execution` when needed.
- `POST /v1/steps/:stepId/answer` accepts the learner response and marks the
  Step `evaluated`.
- `POST /v1/steps/:stepId/skip` marks the Step skipped.
- `POST /v1/sessions/:sessionId/complete` moves the session to `completion` and
  writes `completedAt`.

## Events

The service writes events through the durable outbox. Batch 4 emits:

- `session.started`
- `session.lifecycle.transitioned`
- `lesson_plan.created`
- `lesson_plan.activated`
- `step.planned`
- `step.presented`
- `step.answered`
- `step.evaluated`
- `strategy.replan.proposed`
- `strategy.replan.committed`

## Factories

`MinimalLessonPlanFactory` is deterministic and creates a structural review plan
with one queued Step. `FullLessonPlanFactory` is an adapter boundary to the
Python LessonPlan Generation Agent and requires `LESSON_PLAN_AGENT_URL`; the
full planner implementation itself belongs to a later realignment batch.

## Strategy Replanning

`src/domain/strategy/` consumes `metacognition.trigger.fired` through
`MetacognitionTriggerConsumer`. Strategy selects the default intervention and
lowest sufficient scope:

- answering a Step transitions the session through `diagnosis` while
  metacognition records the Evaluation, then to `evaluation`
- handling a trigger transitions through `adaptation` while the Strategy module
  commits the replan
- replans insert replacement Steps and mark replaced pending Steps as
  `superseded` with `supersededByStepId`; evaluated Steps are never edited
- if trigger severity requests `full` scope before the generation-agent path is
  available, Strategy commits a structural fallback and logs the requested full
  scope instead of throwing in the event consumer path

- `failure` inserts a repair Step with a different transformation.
- `prerequisite_gap` inserts a structural prerequisite branch.
- calibration/contrast/transfer interventions insert targeted repair Steps.

Before committing, Strategy calls Pedagogy Guardian for the proposed replan and
each inserted Step. Accepted replans are written transactionally with their
StepQueueItem entries and staged through the outbox.
