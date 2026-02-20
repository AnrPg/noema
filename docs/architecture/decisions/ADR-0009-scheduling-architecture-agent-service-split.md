# ADR-0009: Scheduling Architecture — Agent-Service Split

## Status

Accepted

## Date

2026-02-20

## Context

Noema supports 4 scheduling algorithms for spaced repetition:

1. **FSRS v6.1.1** — Adaptive, 19 parameters, stability/difficulty tracking
2. **HLR (Half-Life Regression)** — Duolingo's algorithm, good for languages
3. **SM-2** — SuperMemo classic, simple and reliable
4. **Leitner System** — Box-based progression

Two of these algorithms come from external open-source repositories:

- **fsrs4anki** (JavaScript) — FSRS v6.1.1 reference scheduler for Anki
  ([open-spaced-repetition/fsrs4anki](https://github.com/open-spaced-repetition/fsrs4anki))
- **halflife-regression** (Python) — Duolingo's HLR implementation
  ([duolingo/halflife-regression](https://github.com/duolingo/halflife-regression))

The Scheduler Service is a Node.js/TypeScript microservice. HLR is implemented
in Python. The question is:

1. **Where** do the external algorithm implementations live in the monorepo?
2. **Who decides** the final scheduling outcome — the service or the agent?
3. **How** does the Python HLR algorithm integrate with the TypeScript
   scheduler?

Additionally, these external repos must be tracked as **git submodules** to
preserve upstream linkage and enable pulling updates independently.

## Decision

### 1. Third-Party Algorithm Placement

Both external algorithm repositories are added as **git submodules** under a new
`third-party/` directory at the repository root:

```
noema/
├── third-party/
│   ├── fsrs4anki/                # Git submodule — JS FSRS v6.1.1 reference
│   └── halflife-regression/      # Git submodule — Python HLR (Duolingo)
```

**Rationale:**

- `third-party/` clearly signals vendored external code vs. project source
- Root-level placement makes them accessible to multiple consumers (services,
  agents, research scripts) without nesting inside any one service
- Git submodules preserve upstream repo linkage and enable independent version
  tracking
- Follows the convention of `vendor/` or `third-party/` in large monorepos

### 2. Scheduler Service = Raw Computation Engine (~80% of Decision)

The **Scheduler Service** (TypeScript) is a pure algorithmic computation engine.
It:

- Computes raw retention predictions using FSRS, SM-2, and Leitner
- Owns persistence of review schedules, due queues, and interval data
- Exposes `predictRetention` and `getReviewQueue` as agent tools
- Accepts final scheduling decisions via `updateSchedule`
- Has **no awareness** of HLR — it does not call the HLR sidecar

The service produces **predictions**, not final decisions. Its output is the
dominant signal (~80% weight) in the final scheduling outcome.

### 3. HLR Sidecar = Stateless Python Microservice

The **HLR Sidecar** is a thin FastAPI wrapper around the half-life regression
algorithm:

- Runs as a separate Python microservice alongside the agent layer
- Stateless — receives features, returns half-life predictions
- Exposes `predictHalfLife(cardId, features)` as an agent tool
- Does not own any persistence or scheduling state

**Rationale:**

- HLR is Python-native; the original implementation uses numpy/scipy for
  logistic regression
- A sidecar avoids cross-language porting while keeping the algorithm accessible
- Stateless design means it scales independently and has no failure coupling
  with the scheduler

### 4. Agent = Final Decision Authority (~20% Contextual Adjustment)

The **Learning Agent** and **Strategy Agent** make the final scheduling decision
by orchestrating across multiple services:

| Layer                           | Responsibility                                                      | Weight                             |
| ------------------------------- | ------------------------------------------------------------------- | ---------------------------------- |
| **Scheduler Service**           | Raw algorithmic computation (FSRS, SM-2, Leitner intervals)         | ~80% of decision                   |
| **HLR Sidecar**                 | Raw half-life regression output                                     | (alternative/supplementary signal) |
| **Agent (Learning / Strategy)** | Contextual override using diagnostic signals, strategy, graph state | ~20% adjustment                    |

This conforms to Noema's agent-first architecture:

- _"Agents are primary decision-makers and orchestrators"_ — the agent makes the
  **final** call
- _"Each service does one thing exceptionally well"_ — the scheduler service is
  a **pure computation engine** for retention models
- The agent tools `predictRetention` and `getReviewQueue` already imply the
  service produces **predictions**, not final decisions
- The Strategy Agent owns _"Cognitive Control Policies"_ — scheduling overrides
  are exactly that

### 5. What the Agent's ~20% Context Includes

Things no scheduling algorithm can compute alone:

- **Strategy loadout** — exam mode might tighten intervals, exploration mode
  might loosen them
- **Diagnostic signals** — misconception detected → force earlier review
  regardless of FSRS stability
- **Knowledge graph** — prerequisite not mastered → deprioritize dependent cards
- **Session context** — fatigue detected, time remaining, cognitive load
- **Gamification** — streak protection, motivation dip → adjust queue ordering
- **Cross-algorithm blending** — weight FSRS vs HLR differently per card type
  (e.g., HLR for language lexemes, FSRS for conceptual cards)

### 6. Canonical Scheduling Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    AGENT (Learning / Strategy)                   │
│                     Final Decision Authority                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. scheduler.predictRetention(cardId, algorithm='fsrs')         │
│     → raw FSRS output (stability, difficulty, interval)          │
│                                                                  │
│  2. hlr.predictHalfLife(cardId, features)                        │
│     → raw HLR output (half-life estimate)                        │
│                                                                  │
│  3. metacognition.getDiagnosis(userId)                           │
│     → diagnostic context (misconceptions, calibration)           │
│                                                                  │
│  4. strategy.getLoadout(userId)                                  │
│     → current strategy (loadout, policies, force levels)         │
│                                                                  │
│  5. AGENT DECIDES final interval, priority, queue position       │
│     (blends ~80% algorithm + ~20% context)                       │
│                                                                  │
│  6. scheduler.updateSchedule(cardId, finalInterval, ...)         │
│     → persists the final scheduling decision                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

The **Scheduler Service** remains the **system of record** for schedules, but
the **agent is the decision authority**.

### 7. Component Responsibilities

```
┌─────────────────────┐    ┌──────────────────────┐
│  Scheduler Service   │    │    HLR Sidecar        │
│  (TypeScript/Node)   │    │    (Python/FastAPI)    │
├─────────────────────┤    ├──────────────────────┤
│ • FSRS computation   │    │ • Half-life regression│
│ • SM-2 computation   │    │ • Stateless           │
│ • Leitner boxes      │    │ • Feature → half-life │
│ • Schedule storage   │    │ • No persistence      │
│ • Due queue mgmt     │    │                       │
│ • Interval history   │    │                       │
└────────┬────────────┘    └──────────┬───────────┘
         │ predictRetention            │ predictHalfLife
         │ updateSchedule              │
         └──────────┬──────────────────┘
                    │
              ┌─────▼──────┐
              │   Agent     │
              │  (Python)   │
              ├────────────┤
              │ • Blends    │
              │   signals   │
              │ • Applies   │
              │   strategy  │
              │ • Final     │
              │   decision  │
              └─────────────┘
```

## Consequences

### Positive

- **Clean separation of concerns**: algorithms compute, agents decide, services
  persist
- **Algorithm-agnostic agents**: new algorithms can be added without changing
  agent logic — just add a new tool call
- **Cross-algorithm blending**: agents can weight FSRS vs HLR differently per
  card type, user profile, or learning mode
- **Strategy-aware scheduling**: diagnostic and metacognitive signals directly
  influence review timing without polluting the algorithm implementations
- **Independent scaling**: scheduler service, HLR sidecar, and agents scale
  independently
- **Upstream tracking**: git submodules allow pulling algorithm updates from
  upstream repos
- **Research-friendly**: the Python HLR implementation remains runnable for
  dataset experiments and evaluation

### Negative

- **Network latency**: agent must make multiple HTTP calls (scheduler + HLR +
  metacognition + strategy) before deciding. Mitigated by parallel calls and
  caching.
- **Submodule complexity**: contributors must run
  `git submodule update --init --recursive` after cloning. CI/CD must use
  `--recurse-submodules`.
- **Python sidecar overhead**: running a separate Python service for HLR adds
  operational complexity. Acceptable given the agent layer is already Python.
- **Decision opacity**: the agent's blending logic is less transparent than a
  pure algorithm. Mitigated by logging the decision breakdown with each
  `updateSchedule` call.

### Risks

- **Agent latency budget**: if the 4-call orchestration exceeds acceptable
  latency, consider pre-computing and caching algorithm outputs on
  `attempt.recorded` events rather than computing on-demand.
- **HLR feature availability**: HLR requires historical features
  (`history_seen`, `history_correct`, `delta`) that must be maintained by the
  session/scheduler services.

## Implementation Details

### Git Submodule URLs

```bash
git submodule add https://github.com/open-spaced-repetition/fsrs4anki.git third-party/fsrs4anki
git submodule add https://github.com/duolingo/halflife-regression.git third-party/halflife-regression
```

After cloning, contributors must run:

```bash
git submodule update --init --recursive
```

### fsrs4anki (Reference Code)

The fsrs4anki submodule is an **Anki scheduler script** (375 lines of JS), not
an npm package. It serves as the **canonical reference implementation** for
FSRS v6.1.1. The scheduler-service will implement FSRS in TypeScript using this
as the algorithmic source of truth. Key functions to port:

- `forgetting_curve(elapsed_days, stability)` — retention prediction
- `next_interval(stability)` — interval computation
- `next_recall_stability(d, s, r, rating)` — stability update on recall
- `next_forget_stability(d, s, r)` — stability update on lapse
- `next_difficulty(d, rating)` — difficulty update
- `init_stability(rating)` / `init_difficulty(rating)` — new card initialization

### HLR Sidecar

Located at `services/hlr-sidecar/`. A thin FastAPI service (~300 lines) that
exposes:

- `POST /predict` — recall probability + half-life from features
- `POST /train` — online weight update from an observation
- `GET /weights` — inspect current model weights
- `PUT /weights` — load pre-trained weights
- `GET /health` — health check

Port: `8020` (configured via `HLR_PORT` env var)

## Related

- [ADR-0007: User Service Implementation](ADR-0007-user-service-implementation.md)
- [PROJECT_CONTEXT.md — Scheduler Service](../../PROJECT_CONTEXT.md) (Section:
  Core Services §3)
- [PROJECT_CONTEXT.md — Scheduling Algorithms](../../PROJECT_CONTEXT.md)
  (Section: Core Features > Scheduling Algorithms)
- [PROJECT_CONTEXT.md — Agent System](../../PROJECT_CONTEXT.md) (Section: Agent
  System)
