# ADR-0029: Scheduler FSRS/HLR Runtime Integration and State Machine (Phase 3)

## Status

Accepted

## Date

2026-02-23

## Context

Following Phase 2's completion of scoring, simulation, commit boundaries, and
provenance/lineage tracking, Phase 3 addresses the core scheduling algorithm
runtime gaps:

- FSRS (Free Spaced Repetition Scheduler) algorithm was referenced but not
  implemented in the retention lane;
- HLR (Half-Life Regression) algorithm existed but was not integrated into
  active review flows;
- SchedulerCard state transitions were implicit and lacked validation;
- Calibration training loop was planned but not wired into runtime review
  processing;
- Event consumer (scheduler-event-consumer.ts) updated counters but did not
  invoke algorithm computations.

This prevented the scheduler from producing deterministic, algorithm-driven
scheduling decisions based on actual review outcomes.

## Decision

### 1) Implement FSRS Algorithm Module

Created `algorithms/fsrs.ts` with:

- **FSRSModel** class supporting FSRS-5 parameter set (21 weights: w[0]..w[20])
- Core methods:
  - `initDifficulty()` / `initStability()`: Initialize new card parameters
  - `forgettingCurve()`: Compute retrievability given elapsed time
  - `nextDifficulty()`: Update difficulty after review with linear damping and
    mean reversion
  - `nextRecallStability()`: Stability after successful recall (hard/good/easy)
  - `nextForgetStability()`: Stability after failed recall (again)
  - `nextShortTermStability()`: For learning/relearning transitions
  - `nextInterval()`: Compute next review interval from stability
  - `predictReviewState()`: Full prediction for review cards
  - `predictLearningState()`: Prediction for learning/relearning cards
- Configurable parameters:
  - `weights`: 21-element FSRS weight array
  - `requestRetention`: Target recall probability (default 0.9)
  - `maximumInterval`: Maximum interval cap (default 36500 days)
  - `enableFuzz`: Optional interval randomization
- All computations constrain outputs to valid ranges (difficulty [1,10],
  stability >= 0.1)

Reference implementation based on open-spaced-repetition/fsrs4anki (FSRS v5).

### 2) Implement State Transition Guard Module

Created `state-machine.ts` with strict transition whitelist:

- **Transition map** (fromState → rating → toState):
  - `new` → any rating → `learning` (except `easy` → `review`)
  - `learning` → `again`/`hard` → `learning`; `good`/`easy` → `review`
  - `review` → `again` → `relearning`; others → `review`
  - `relearning` → `again`/`hard` → `relearning`; `good`/`easy` → `review`
  - `graduated` → `again` → `relearning`; others → `graduated`/`review`
  - `suspended` → no rating transitions allowed (manual unsuspend only)
- **Suspension/unsuspension**:
  - Any suspendable state → `suspend: true` → `suspended`
  - `suspended` → `unsuspend: true` + `previousState` → restore previous state
- **Graduation threshold**: 3 consecutive correct reviews (configurable)
- **Error codes** for illegal transitions:
  - `ILLEGAL_TRANSITION`: Transition not in whitelist
  - `INVALID_STATE`: Unrecognized state value
  - `MISSING_RATING`: Rating required but not provided
  - `INVALID_RATING`: Rating value not in ['again', 'hard', 'good', 'easy']
- Functions:
  - `validateStateTransition()`: Returns `{ valid, state, error? }`
  - `computeNextState()`: Throws on invalid transition
  - `isValidTransition()`: Boolean check without error
  - `getValidTransitions()`: Query allowed transitions from a state

**Design choice**: Strict transition map (reject illegal transitions with
machine-readable errors) per user requirements.

### 3) Integrate FSRS and HLR in Event Consumer

Updated `scheduler-event-consumer.ts` `handleReviewRecorded()`:

- **New card initialization**:
  - Retention lane: Invoke `FSRSModel.initState(rating)` to compute initial
    stability and difficulty
  - Calibration lane: Invoke `HLRModel.halflife(features)` to compute initial
    half-life
  - Both: Compute initial interval and apply state transition (new → learning)
- **Existing card updates**:
  - Compute `deltaDays` from last review
  - **Retention lane (FSRS)**:
    - Load current stability/difficulty from SchedulerCard
    - Invoke `predictReviewState()` or `predictLearningState()` based on state
    - Extract new stability, difficulty, interval
  - **Calibration lane (HLR)**:
    - Extract HLR features (bias, reviews, lapses, correct_streak, card type)
    - Invoke `HLRModel.trainUpdate()` with actual recall outcome
    - Invoke `HLRModel.predict()` to get updated half-life
    - Compute interval from half-life
    - Persist updated parameters to CalibrationDataRepository via `upsert()`
  - Apply state transition via `computeNextState()` with rating and
    consecutiveCorrect
  - Update SchedulerCard with new parameters, state, and nextReviewDate
- **Per-review calibration updates**: User choice of "per-review incremental
  update" (not threshold-based) implemented by calling `upsert()` on every
  calibration-lane review

### 4) Lane-Algorithm Routing

Hardcoded semantic binding (already established in codebase, now enforced):

- `lane: 'retention'` → `schedulingAlgorithm: 'fsrs'`
- `lane: 'calibration'` → `schedulingAlgorithm: 'hlr'`

This mapping is applied in event consumer when creating or updating
SchedulerCard.

### 5) Helper Methods in Event Consumer

Added:

- `extractHLRFeatures()`: Build HLR feature vector from card metadata
- `computeDeltaDays()`: Calculate elapsed days since last review

### 6) Unit Test Coverage

Created three test suites:

- **fsrs.test.ts**: 27 tests covering FSRS algorithm computations
  - Constructor validation
  - Initial difficulty/stability
  - Forgetting curve
  - Difficulty updates
  - Stability updates (recall, forget, short-term)
  - Interval computation
  - State predictions
  - Helper functions
- **state-machine.test.ts**: 31 tests covering state transitions
  - Legal transitions for all states
  - Illegal transition rejection
  - Suspension/unsuspension
  - Graduation logic
  - Transition matrix coverage (all fromState × rating combinations)
  - Error code validation
- **scheduler-phase3-integration.test.ts**: 15 tests covering integration
  - FSRS integration scenarios
  - HLR integration scenarios
  - State machine integration with review flow
  - Lane-algorithm routing
  - Incremental calibration updates
  - Edge cases (zero elapsed days, large elapsed days, etc.)

All tests pass (115 total tests in scheduler-service).

## Consequences

### Positive

- **Algorithm-driven scheduling**: Reviews now produce deterministic scheduling
  parameters based on FSRS (retention) or HLR (calibration) algorithms.
- **Explicit state machine**: State transitions are validated and documented,
  preventing illegal state changes.
- **Active calibration loop**: HLR parameters update per-review, continuously
  improving predictions.
- **Type-safe algorithms**: FSRS and HLR implementations are fully typed,
  tested, and maintain parameter constraints.
- **Clear error semantics**: Illegal transitions return structured errors with
  machine-readable codes.
- **Testable**: 73 new unit tests provide regression protection for algorithm
  logic and state transitions.

### Negative

- **Fixed lane-algorithm coupling**: Retention lane is hardcoded to FSRS,
  calibration to HLR. Future algorithm alternatives require code changes.
- **No weight persistence**: FSRS uses default weights; calibration uses empty
  initial weights. Optimized weights must be provided at initialization or
  loaded from external storage.
- **No graduation auto-trigger**: Graduation threshold (3 consecutive correct)
  is checked but not automatically promoted to `graduated` state; requires
  explicit logic.
- **State explosion risk**: As more states are added, transition map grows
  quadratically. Future extensions may need hierarchical state modeling.

### Neutral

- **Algorithm references**: FSRS based on open-spaced-repetition/fsrs4anki v5;
  HLR based on Duolingo's halflife-regression (Settles & Meeder, 2016).
- **No fuzzing by default**: FSRS interval fuzzing is disabled
  (`enableFuzz: false`) to maintain determinism.
- **Calibration granularity**: Per-card or per-card-type calibration determined
  by presence of `cardType` field.

## References

- [PHASE-3-FSRS-HLR-STATE-MACHINE.md](../scheduler-agent-readiness/PHASE-3-FSRS-HLR-STATE-MACHINE.md)
- [ADR-0022: Dual-Lane Scheduler](./ADR-0022-dual-lane-scheduler.md)
- [ADR-0025: Scheduler Phase 3 Persistence](./ADR-0025-scheduler-service-phase-3-persistence.md)
- FSRS Paper: Jarrett Ye et al., "A Stochastic Shortest Path Algorithm for
  Optimizing Spaced Repetition Scheduling" (KDD 2024)
- HLR Paper: Settles & Meeder, "A Trainable Spaced Repetition Model for Language
  Learning" (ACL 2016)

## Related Changes

- `src/domain/scheduler-service/algorithms/fsrs.ts`: New FSRS implementation
  (428 lines)
- `src/domain/scheduler-service/state-machine.ts`: New state transition guard
  (313 lines)
- `src/infrastructure/events/scheduler-event-consumer.ts`: Integrated algorithms
  in handleReviewRecorded (193 lines modified)
- `tests/unit/domain/fsrs.test.ts`: New test suite (343 lines, 27 tests)
- `tests/unit/domain/state-machine.test.ts`: New test suite (428 lines, 31
  tests)
- `tests/unit/domain/scheduler-phase3-integration.test.ts`: New test suite (261
  lines, 15 tests)

## Implementation Notes

### FSRS Weight Management

Default weights are provided via `DEFAULT_FSRS_WEIGHTS` constant. For production
use, weights should be:

1. Optimized per-deck or per-user using FSRS optimizer
2. Loaded from configuration or database at service initialization
3. Updated periodically based on user review history

### HLR Feature Engineering

Current features: `['bias', 'reviews', 'lapses', 'correct_streak', 'type_*']`

Future enhancements may include:

- Temporal features (time of day, day of week)
- Content features (difficulty tags, knowledge graph depth)
- User features (mastery level, learning velocity)

### State Transition Extensions

Current states cover basic SRS flow. Future states might include:

- `buried`: Temporarily hidden but not suspended
- `leeched`: Cards requiring intervention due to repeated failures
- `mature`: Variant of review for very stable cards

Each new state requires explicit whitelist updates in `STATE_TRANSITION_MAP`.

### Calibration Persistence Strategy

Current per-review upsert may cause database contention at scale. Consider:

- Batching calibration updates (e.g., every N reviews)
- Async write-behind cache for calibration parameters
- Separate calibration write stream with conflict resolution

## Timeline

- **Phase 0**: OpenAPI contracts, auth hardening, lifecycle markers
- **Phase 1**: Operational scaffolding, health/tool endpoints
- **Phase 2**: Scoring, simulation, commit, provenance/lineage
- **Phase 3**: FSRS/HLR runtime integration, state machine (current)
- **Phase 4** (planned): Policy versioning, agent orchestration integration

## Approval

Approved by: [Agent implementation based on Phase 3 specification]

Date: 2026-02-23
