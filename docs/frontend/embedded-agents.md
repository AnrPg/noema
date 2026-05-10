# Embedded Agents

Noema's learner app now treats agents as contextual workflow affordances rather
than a permanent agent panel.

## User-facing model

- Agents surface as small buttons, inline cards, or modal prompts inside the
  screen that has enough context for them to help.
- Copilot remains the only persistent agent-like surface.
- The raw wrapper workbench is available at `/agents/debug` for development and
  contract inspection, but it is not primary learner navigation.

## Integrated surfaces

- Dashboard: Copilot, calibration, and repair nudges.
- Active session: Mental Debugger and Strategy Replanner actions beside the
  current Step.
- Session summary: Mental Debugger, Calibration Coach, and Patch Planner
  actions after completion.
- Curriculum vault/detail/setup: Curriculum Planner, Knowledge Graph Agent,
  Content Orchestrator, and LessonPlan Generator entry points.
- Content jobs/review: Content Orchestrator, Content Creator, and Patch Planner
  actions.
- Knowledge map: Knowledge Graph Agent proposals from selected nodes, search,
  or missing PKG suggestions.

## Frontend implementation

The shared integration layer lives in `apps/web/src/features/agents/`:

- `agent-capabilities.ts` maps agent names to surfaces, context requirements,
  review routes, and default execution modes.
- `use-contextual-agent.ts` wraps preflight, realtime run, async run, polling,
  cancellation, and proposal normalization.
- `components.tsx` provides shared buttons, modal review panels, status badges,
  timelines, errors, and provenance drawers.

The normal UI should show friendly labels and recommended actions first.
Technical provenance remains one click deeper.
