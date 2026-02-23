# Scheduler Agent-Readiness — Phase Pack

This folder splits scheduler agent-readiness work into small, execution-ready
phase documents for Claude Code.

## How to Use

1. Execute phases **in order**.
2. For each phase, complete all tasks and pass all validation gates.
3. Do not begin the next phase before the current phase is green.
4. Keep changes additive and architecture-aligned.

## Phase Order

1. [PHASE-0-API-ADR-FOUNDATION.md](./PHASE-0-API-ADR-FOUNDATION.md)
2. [PHASE-1-AUTH-ERROR-GUARDRAILS.md](./PHASE-1-AUTH-ERROR-GUARDRAILS.md)
3. [PHASE-2-SCORING-SIMULATION-COMMIT.md](./PHASE-2-SCORING-SIMULATION-COMMIT.md)
4. [PHASE-3-FSRS-HLR-STATE-MACHINE.md](./PHASE-3-FSRS-HLR-STATE-MACHINE.md)
5. [PHASE-4-MCP-TOOLS-EXPANSION.md](./PHASE-4-MCP-TOOLS-EXPANSION.md)
6. [PHASE-5-EVENT-HANDSHAKE-RELIABILITY.md](./PHASE-5-EVENT-HANDSHAKE-RELIABILITY.md)
7. [PHASE-6-OBSERVABILITY-BACKPRESSURE-RUNBOOK.md](./PHASE-6-OBSERVABILITY-BACKPRESSURE-RUNBOOK.md)

## Inputs (read before Phase 0)

- `/.copilot/instructions/PROJECT_CONTEXT.md`
- `docs/TODO-SCHEDULER-AGENT-READINESS-IMPLEMENTATION.md`
- `docs/architecture/AGENT_MCP_TOOL_REGISTRY.md`
- ADR-0022, ADR-0023, ADR-0026, ADR-0027

## Global Validation Gates (apply every phase)

- `pnpm --filter @noema/scheduler-service lint`
- `pnpm --filter @noema/scheduler-service typecheck`
- `pnpm --filter @noema/scheduler-service test`
- `pnpm run openapi:validate:scheduler`

## Definition of Done (Global)

- All 31 identified gaps are closed with test evidence.
- OpenAPI and runtime behavior are aligned.
- Scheduler MCP tools cover required orchestration use-cases.
- Security model supports user/agent/service principals with scoped authorization.
- Event workflows are replay-safe and traceable.
