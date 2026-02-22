# ADR-0014: Session & Scheduler Shared Type System — Phase 1 Foundation

## Status

**Accepted** — 2025-07-26

## Context

Step 4 of the implementation roadmap introduces two critical services:

1. **Session Service** — manages review sessions, card queues, attempt
   recording, and session lifecycle with FSM-based state transitions.
2. **Scheduler Service** — pure computation engine for spaced repetition
   scheduling across four algorithms (FSRS v6.1.1, SM-2, Leitner, HLR).

Both services produce events consumed by multiple downstream services
(metacognition, gamification, analytics, strategy, and each other). The
`attempt.recorded` event alone is consumed by 5+ services and represents the
most critical data flow in the platform.

Before implementing either service, we need shared types, enums, branded IDs,
validation schemas, and event contracts in the monorepo's shared packages. This
ensures all producers and consumers operate on identical, Zod-validated schemas
from day one.

### Key Design Decisions Referenced

| Decision                | Choice                                                               | Source            |
| ----------------------- | -------------------------------------------------------------------- | ----------------- |
| S1: Session FSM         | Event-emitting FSM as primary state manager                          | Design discussion |
| S4: Session scope       | One session wraps one DeckQueryLogId with dynamic queue              | Design discussion |
| R1: Algorithm selection | Strategy pattern with pluggable adapters                             | ADR-0009          |
| R2: Per-deck config     | Per-deck algorithm choice with user default                          | Design discussion |
| R4: Schedule storage    | Hybrid Redis (hot) + PostgreSQL (durable)                            | Design discussion |
| R6: Agent authority     | Agent is final decision authority; scheduler computes raw suggestion | ADR-0009          |

### Teaching Approaches

The platform supports 31 distinct epistemic modes of engagement (30 pedagogical
modes + 1 standard baseline). These are formally defined as:

**Mode = (E, T, R, M, C)** where E = Epistemic Operation, T = Tension Source, R
= Representation Space, M = Metacognitive Activation, C = Constraint Profile.

The 10 categories are: Inquiry & Discovery, Error-Centered, Generative &
Constructive, Meta-Cognitive, Constraint-Based, Game-Theoretic & Dynamic,
Structural Knowledge, Dialectical & Philosophical, Sensory & Representation, and
Advanced Experimental.

## Decision

### 1. New Domain Enumerations (`@noema/types`)

Added 11 new enums and 1 lookup constant:

| Enum                       | Values                                                                                      | Purpose                                     |
| -------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `Rating`                   | again, hard, good, easy                                                                     | Canonical recall quality (maps to FSRS 1-4) |
| `RATING_VALUES`            | Record<Rating, number>                                                                      | Numeric mapping for algorithm adapters      |
| `CardLearningState`        | new, learning, review, relearning                                                           | SRS lifecycle states                        |
| `CardQueueStatus`          | pending, presented, completed, skipped, injected                                            | In-session queue tracking                   |
| `SessionTerminationReason` | completed_normally, time_limit_reached, card_limit_reached, user_ended, auto_expired, error | Why a session ended                         |
| `CognitiveLoadLevel`       | low, moderate, high, overloaded                                                             | Inferred cognitive load                     |
| `FatigueLevel`             | fresh, mild, moderate, fatigued, exhausted                                                  | Time-decay fatigue                          |
| `MotivationSignal`         | high, normal, declining, low                                                                | Gamification-derived motivation             |
| `HintDepth`                | none, cue, partial, full_explanation                                                        | Progressive hint levels                     |
| `TeachingApproach`         | 31 values across 10 categories                                                              | All epistemic modes                         |
| `TeachingApproachCategory` | 10 pedagogical family categories                                                            | Grouping for TeachingApproach               |

**Rationale**: Centralizing all enums in `@noema/types` ensures every service
imports canonical values. The `as const` + type union pattern provides both
runtime values and compile-time type safety.

### 2. New Branded Identifiers (`@noema/types`)

| ID Type             | Prefix    | Purpose                                   |
| ------------------- | --------- | ----------------------------------------- |
| `ScheduleId`        | `sched_`  | Card schedule entity identifier           |
| `ReviewLogId`       | `rlog_`   | Immutable review log entry identifier     |
| `AlgorithmConfigId` | `algcfg_` | Per-user/deck algorithm config identifier |

**Rationale**: Each scheduler entity needs its own branded ID for type-safe
references in events, APIs, and database keys. Follows the existing
`prefix_nanoid21` convention.

### 3. Validation Schemas (`@noema/validation`)

All new enums and branded IDs received corresponding Zod schemas via
`createEnumSchema()` and `createIdSchema()` factories. Additionally filled a
pre-existing gap: added `DifficultyLevelSchema` which existed in types but had
no validation schema.

### 4. Session Domain Events (`@noema/events`)

12 event types with full TypeScript interfaces and Zod schemas:

| Event Type                 | Aggregate | Description                                 |
| -------------------------- | --------- | ------------------------------------------- |
| `session.started`          | Session   | Session created and first card queued       |
| `session.paused`           | Session   | User paused the session                     |
| `session.resumed`          | Session   | User resumed from pause                     |
| `session.completed`        | Session   | Session ended (any reason)                  |
| `session.abandoned`        | Session   | Session abandoned by user                   |
| `session.expired`          | Session   | Auto-terminated after timeout (default 24h) |
| `session.queue.injected`   | Session   | Learning agent injected a card              |
| `session.queue.removed`    | Session   | Card removed from queue                     |
| `session.strategy.updated` | Session   | Loadout/strategy changed mid-session        |
| `session.teaching.changed` | Session   | Teaching approach changed mid-session       |
| `attempt.recorded`         | Attempt   | **Most critical event** — full attempt data |
| `attempt.hint.requested`   | Attempt   | Progressive hint requested                  |

The `attempt.recorded` payload is the richest event in the system, carrying:
response data, timing, metacognitive signals (confidence, calibration, revision
count), context snapshot (learning mode, teaching approach, cognitive load,
fatigue, interventions), and prior scheduling state for the reviewed card.

Shared sub-schemas: `SessionStatsSnapshotSchema`,
`AttemptContextSnapshotSchema`, `PriorSchedulingStateSchema`.

### 5. Scheduler Domain Events (`@noema/events`)

11 event types with full TypeScript interfaces and Zod schemas:

| Event Type                      | Aggregate | Description                         |
| ------------------------------- | --------- | ----------------------------------- |
| `schedule.created`              | Schedule  | First-time card schedule            |
| `schedule.updated`              | Schedule  | Schedule recomputed after review    |
| `schedule.overridden`           | Schedule  | Agent overrode algorithm output     |
| `schedule.due`                  | Schedule  | Single card became due              |
| `schedule.due.batch`            | Schedule  | Batch due notification              |
| `schedule.lapsed`               | Schedule  | Card forgotten, moved to relearning |
| `schedule.graduated`            | Schedule  | Card graduated learning → review    |
| `schedule.matured`              | Schedule  | Card reached maturity threshold     |
| `schedule.retention.predicted`  | Schedule  | Retention prediction computed       |
| `schedule.config.updated`       | Schedule  | Algorithm config changed            |
| `schedule.weights.personalized` | Schedule  | FSRS weights personalized (future)  |

The `schedule.updated` event includes the agent override fields
(`wasAgentOverridden`, `agentFinalIntervalDays`, `overrideReason`) reflecting
the dual-path model where the scheduler computes raw suggestions and the agent
has final authority.

### 6. Event Schema Location Decision

**Chosen**: Shared event schemas in `@noema/events` (not inside individual
services).

**Alternatives considered**:

- Events defined inside each service (existing content-service pattern) —
  creates coupling when multiple consumers need the schema.
- Dedicated `@noema/event-contracts` package — additional package overhead.

**Rationale**: Session and scheduler events are consumed by 5+ services each.
Defining schemas in `@noema/events` makes them a shared contract accessible via
a single import path. The existing content-service events can migrate later if
needed.

## Technical Debt

| ID           | Description                                                                           | Priority |
| ------------ | ------------------------------------------------------------------------------------- | -------- |
| TD-SCHED-001 | FSRS Optimizer as separate Python microservice for weight personalization             | Medium   |
| TD-SCHED-002 | `schedule.weights.personalized` event schema defined but not yet produced             | Low      |
| TD-TYPE-001  | Teaching approach → category mapping constant (TEACHING_APPROACH_CATEGORIES) deferred | Low      |

## Consequences

### Positive

- All session and scheduler event payloads are Zod-validated at compile time and
  runtime
- Consumer services can import typed event schemas from `@noema/events`
- Teaching approaches are enumerated programmatically (no magic strings)
- Type-safe branded IDs prevent cross-entity ID confusion
- Zero breaking changes to existing packages

### Negative

- `@noema/events` now has domain-specific modules (session/, scheduler/) — may
  need sub-path exports in package.json for tree-shaking
- The 31 teaching approaches create a large enum; some modes may be experimental
  and rarely used initially

## Files Changed

### Modified (additive only)

- `packages/types/src/enums/index.ts` — 11 new enums
- `packages/types/src/branded-ids/index.ts` — 3 new branded IDs
- `packages/validation/src/enums.ts` — 12 new Zod schemas + DifficultyLevel gap
  fill
- `packages/validation/src/ids.ts` — 3 new ID schemas + IdSchemas registry
- `packages/events/src/index.ts` — re-exports for session/ and scheduler/

### Created

- `packages/events/src/session/session.events.ts` — 12 event type definitions
- `packages/events/src/session/session-event.schemas.ts` — 12 Zod event schemas
- `packages/events/src/session/index.ts` — barrel re-export
- `packages/events/src/scheduler/scheduler.events.ts` — 11 event type
  definitions
- `packages/events/src/scheduler/scheduler-event.schemas.ts` — 11 Zod event
  schemas
- `packages/events/src/scheduler/index.ts` — barrel re-export
