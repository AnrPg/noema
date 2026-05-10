# Noema Agent Council

**Status:** Product architecture blueprint  
**Audience:** product, design, engineering, agent implementers  
**Scope:** Noema's app/product agents, how they surface, and how they stay
bounded by service-owned truth

Noema's agent system is a council, not a single tutor. Agents can speak,
propose, explain, generate, critique, and repair. They do not own durable truth.

Truth remains owned by services:

| Fact                                              | Owner                       |
| ------------------------------------------------- | --------------------------- |
| LessonPlans, Goals, Steps, Activities, Step queue | `session-service`           |
| Evaluations, reasoning quality, Triggers          | `metacognition-service`     |
| Concept schedule state and transformation history | `scheduler-service`         |
| PKG/CKG graph state and stability projection      | `knowledge-graph-service`   |
| Cards, variants, provenance, review state         | `content-service`           |
| Curriculum DAGs, versions, progress, revisions    | `curriculum-service`        |
| Validation decisions                              | `pedagogy-guardian-service` |

This package documents the product shape of the agent council: who does what,
when each agent appears, what it may read, what it may propose, what it must
never own, and how UI presents its work without turning Noema into chatbot soup.

## Core Principle

Agents act from live context, not generic memory.

Every agent run should be built from:

```text
stable role instructions
+ live user context
+ live artifact context
+ service-owned facts
+ allowed tools/actions
+ authority boundaries
+ UI surfacing rules
+ required output shape
```

The prompt template must clearly separate:

- recorded facts
- deterministic detections
- agent inferences
- user-provided intent
- proposals awaiting review
- validation results

## Agent Families

| Family              | Purpose                                                                | Agents                                                                                                                                                |
| ------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Creation agents     | Turn source, goals, graph gaps, and evidence into reviewable artifacts | Ingestion / Concept Extraction, Knowledge Graph, Curriculum Planner, Content Generation, LessonPlan Generator, Taxonomy Curator, Research / Evaluator |
| Learner-loop agents | Shape live learning, reflection, repair, and calibration               | Socratic Tutor, Mental Debugger, Calibration Coach, Patch Planner, Strategy / Replanning, AI Mirror                                                   |
| Governance agents   | Bound, validate, throttle, audit, and explain agent actions            | Pedagogy Guardian, Watchtower / Governance                                                                                                            |
| Helper agents       | Resolve bounded choices without owning facts                           | Mode Preference Helper                                                                                                                                |

## Current Documentation Focus

This first pass documents the **Creation Agent Council** because these agents
decide what enters Noema's learning universe.

Creation agents follow an epistemic custody chain:

```text
source / goal / graph gap
  -> extract meaning
  -> anchor meaning
  -> structure a learning path
  -> generate practice artifacts
  -> assemble a session plan
  -> validate before learner exposure
  -> evaluate whether creation worked
```

## Folder Map

```text
docs/architecture/agents/
  README.md
  overview/
    creation-loop.md
  shared/
    prompt-context-packs.md
  creation/
    ingestion-concept-extraction-agent.md
    knowledge-graph-agent.md
    curriculum-planner.md
    content-intent-normalizer-agent.md
    learner-state-summarizer-agent.md
    content-pedagogy-planner-agent.md
    content-creation-orchestrator.md
    lesson-plan-generator.md
    taxonomy-curator.md
    research-evaluator-agent.md
```

Future folders should follow the same pattern:

- `learner-loop/` for Socratic Tutor, Mental Debugger, Calibration Coach, Patch
  Planner, Strategy/Replanning, and AI Mirror.
- `governance/` for Pedagogy Guardian, Watchtower/Governance, authority
  boundaries, and audit behavior.
- `helpers/` for bounded helper agents such as Mode Preference Helper.

## Creation Agent Docs

- [Creation Loop](./overview/creation-loop.md)
- [Prompt Context Packs](./shared/prompt-context-packs.md)
- [Ingestion / Concept Extraction Agent](./creation/ingestion-concept-extraction-agent.md)
- [Knowledge Graph Agent](./creation/knowledge-graph-agent.md)
- [Curriculum Planner](./creation/curriculum-planner.md)
- [Content Intent Normalizer](./creation/content-intent-normalizer-agent.md)
- [Learner State Summarizer](./creation/learner-state-summarizer-agent.md)
- [Content Pedagogy Planner](./creation/content-pedagogy-planner-agent.md)
- [Content Creation Orchestrator](./creation/content-creation-orchestrator.md)
- [LessonPlan Generator](./creation/lesson-plan-generator.md)
- [Taxonomy Curator](./creation/taxonomy-curator.md)
- [Research / Evaluator Agent](./creation/research-evaluator-agent.md)

## Product Defaults We Have Locked

- Use functional names plus optional display names.
- Use separate workbenches, not one universal AI inbox.
- Use type-based review routing.
- Keep list views calm with minimal labels.
- Put a friendly "why" one click deeper.
- Put technical provenance below that.
- Let creation agents draft by default.
- Allow configurable auto-commit only by artifact type and only after
  validation.
- Return rejected artifacts to the originating agent for repair.
- Show important milestones in timelines, not noisy internal tool calls.
- Give LessonPlans full pre-session review.

## Related Existing Docs

- [REALIGNMENT.md](../../../REALIGNMENT.md)
- [IMPLEMENTATION_PLAN_FINAL.md](../../../IMPLEMENTATION_PLAN_FINAL.md)
- [architecture.md](../../../architecture.md)
- [module-graph.md](../../../module-graph.md)
- [Agent MCP Tool Registry](../AGENT_MCP_TOOL_REGISTRY.md)
- [Agents Admin Observability](../../backend/agents-admin-observability.md)
- [Admin Agents](../../frontend/admin-agents.md)
- [Agents Admin Observability Runbook](../../ops/agents-admin-observability.md)
- [Pedagogy Guardian Service](../../backend/pedagogy-guardian-service.md)
- [Metacognition Service](../../backend/metacognition-service.md)
- [Curriculum Service](../../backend/curriculum-service.md)
- [Ingestion Service](../../backend/ingestion-service.md)
- [Content Service Batch 11 Plan](../../plans/2026-05-02-batch-11-content-service.md)
- [Curriculum Service Batch 11 Plan](../../plans/2026-05-02-batch-11-curriculum-service.md)
- [Ingestion Service Batch 11 Plan](../../plans/2026-05-02-batch-11-ingestion-service.md)
- [Cognitive Copilot](../../frontend/phases/PHASE-10-COGNITIVE-COPILOT.md)

## Runtime Admin Layer

The shared Python runtime now has a second major UI surface in addition to the
learner-facing workbench:

- learner app: `Agent Workbench`
- admin app: `Agents`

The admin layer is where operators inspect run telemetry, transcript exports,
tool usage, config history, and completed-run monitoring. This does not change
the authority model: agents still produce proposals and explanations, while
durable truth remains service-owned.
