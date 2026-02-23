# TODO — Learning Agent Implementation

**Purpose:** Track all tasks required to implement the Learning Agent, the
primary session orchestrator that calls scheduler-service for raw computation
and blends contextual signals to produce the final session deck.

**Architecture reference:** ADR-0009, ADR-0022, PROJECT_CONTEXT.md §Agent System

---

## Phase 0: Agent Skeleton & Runtime

- [ ] Choose runtime framework (LangChain vs LlamaIndex) — scaffolding exists
      under `agents/shared/runtime/` for both
- [ ] Implement base agent class in `agents/learning-agent/src/` with tool
      registry bootstrap, prompt loading, and state management
- [ ] Define `LearningAgentConfig` (model, temperature, max tokens, tool
      timeout, retry policy)
- [ ] Wire shared observability (`agents/shared/observability/`) — tracing,
      metrics, structured logging for every tool call

## Phase 1: Core MCP Tool Integration

- [ ] Integrate `plan-dual-lane` tool (scheduler-service, P0) — call raw
      dual-lane planner with retention + calibration card pools
- [ ] Integrate `query-cards` tool (content-service, P0) — resolve DeckQuery
      to get candidate card IDs for each lane
- [ ] Integrate `get-card-by-id` tool (content-service, P0) — fetch card
      content for context-aware reranking
- [ ] Integrate `get-srs-schedule` tool (scheduler-service, P0) — get due
      queue, intervals, FSRS params for priority scoring
- [ ] Integrate `record-attempt` tool (session-service, P0) — persist review
      results after each card
- [ ] Integrate `update-card-scheduling` tool (scheduler-service, P0) — write
      back the final scheduling decision after agent blending

## Phase 2: HLR + Strategy Context

- [ ] Integrate `predictHalfLife` tool (hlr-sidecar, P0) — get HLR half-life
      predictions for calibration-lane cards
- [ ] Integrate `get-active-loadout` tool (strategy-service, P0) — current
      strategy loadout (exam, exploration, balanced, etc.)
- [ ] Integrate `get-teaching-approach` tool (strategy-service, P1) — active
      pedagogical method (Socratic, inquiry-based, etc.)
- [ ] Implement cross-algorithm blending logic — weight FSRS vs HLR per card
      type (e.g. HLR for language lexemes, FSRS for conceptual cards)
- [ ] Implement strategy override application — tighten/loosen intervals based
      on loadout policies

## Phase 3: Knowledge Graph + Metacognition Context

- [ ] Integrate `get-kg-node-context` tool (knowledge-graph-service, P0) —
      concept context for prerequisite-aware card ordering
- [ ] Integrate `get-concept-prerequisites` tool (knowledge-graph-service, P0)
      — deprioritize cards whose prerequisites are unmastered
- [ ] Integrate `get-metacognitive-stage` tool (metacognition-service, P1) —
      adapt card selection complexity to learner's structural stage (1–4)
- [ ] Integrate `get-concept-mastery` tool (analytics-service, P1) — per-node
      mastery levels to inform selection and interleaving

## Phase 4: Session Orchestration Workflow

- [ ] Implement session initiation workflow: receive session request →
      resolve card pools → call `plan-dual-lane` → enrich with contextual
      signals → produce final immutable deck → deliver to session-service
- [ ] Implement session delivery: call session-service to create session with
      the final deck (card order, lane assignments, expected durations)
- [ ] Implement mid-session injection: dynamically add remediation/calibration
      cards based on real-time diagnostic signals
- [ ] Implement mode switching: detect when to switch from retention to
      exploration or vice-versa based on session performance

## Phase 5: Agent-to-Agent Communication

- [ ] Implement Diagnostic Agent handoff: after N consecutive failures on a
      concept, invoke Diagnostic Agent for trace analysis + patch plan
- [ ] Implement Strategy Agent consultation: before finalizing deck, query
      Strategy Agent for policy overrides and cognitive control adjustments
- [ ] Implement Content Generation Agent request: when gap analysis reveals
      concepts with no cards, request card generation
- [ ] Define inter-agent protocol (event-based vs direct tool call vs message
      passing)

## Phase 6: Offline Intent Token Flow

- [ ] When session-service issues an offline intent token (per ADR-0023),
      include Learning Agent's deck plan as token context so offline reviews
      can proceed without re-planning
- [ ] On reconnection, reconcile offline reviews against the planned deck and
      trigger re-planning if deck was exhausted or deviated significantly

## Phase 7: Testing & Evaluation

- [ ] Unit tests for blending logic (80/20 algorithm/context weighting)
- [ ] Integration tests with mock MCP tool responses
- [ ] Evaluation harness: measure deck quality (coverage, prerequisite
      ordering, lane balance, interleaving effectiveness)
- [ ] A/B test framework for comparing agent strategies vs pure algorithmic
      scheduling

---

**Depends on:** scheduler-service (dual-lane planner), session-service (session
lifecycle + token authority), content-service (card queries), strategy-service,
metacognition-service, knowledge-graph-service, hlr-sidecar, analytics-service.
