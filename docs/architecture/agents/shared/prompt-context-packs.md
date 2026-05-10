# Agent Prompt Context Packs

Every agent acts from a live, templated context pack. This is a core
architecture principle, not a prompt-engineering detail.

Agents should never make decisions from generic instructions alone. They must
receive the relevant live user state, artifact state, service-owned facts,
constraints, allowed actions, and UI context for the current run.

## Context Pack Shape

```text
AgentContextPack
  role
  runContext
  userContext
  learningContext
  artifactContext
  serviceFacts
  detectedSignals
  userIntent
  constraints
  allowedActions
  forbiddenActions
  uiSurface
  outputContract
  provenance
```

This shape is conceptual. Individual services may encode it differently, but the
semantic separation should be preserved.

## Authority Labels

Prompt templates must label context by authority.

| Label                | Meaning                                   | Example                                              |
| -------------------- | ----------------------------------------- | ---------------------------------------------------- |
| Recorded facts       | Persisted service-owned facts             | Current curriculum version from `curriculum-service` |
| Detected signals     | Deterministic or rule-based observations  | Parse quality low, concept unstable, trigger fired   |
| Agent inferences     | Model interpretation or synthesis         | Likely prerequisite gap                              |
| User-provided intent | User goal, preference, override, or input | "I need this for an exam"                            |
| Proposals            | Drafts not yet accepted                   | Proposed graph edge, curriculum revision             |
| Validation results   | Guardian/guardrail/review decisions       | `Guardian blocked: answer leakage`                   |

## Creation Agent Context Needs

| Agent                          | Live context to inject                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ingestion / Concept Extraction | user id, study mode, upload intent, document metadata, parse quality, language, source structure, active curricula, relevant PKG/CKG summary, privacy/storage constraints |
| Knowledge Graph Agent          | bounded PKG slice, candidate CKG matches, proposed concepts, evidence chunks, concept stability, graph guardrails, curator policy                                         |
| Curriculum Planner             | user goal, active curricula, candidate concepts, CKG anchors, schedule/readiness summaries, difficulty preference, study mode, target horizon                             |
| Content Intent Normalizer      | caller trigger, requested artifact scope, source policy, personalization policy, desired card/activity types, curriculum/session surface                                  |
| Learner State Summarizer       | explicit learner check-ins, concept-indexed stability/calibration summaries, allowed affect fields, privacy limits, current workload hints                                |
| Content Pedagogy Planner       | target concepts, learner-state summary, allowed transformations, desired variety, difficulty ceilings, answer-leakage constraints                                         |
| Content Creation Orchestrator  | curriculum node, concept anchors, source chunks, existing cards, desired transformations, supported card types, review constraints, provenance requirements               |
| LessonPlan Generator           | selected curriculum slice, due concepts, learner state summaries, card/Activity candidates, mode eligibility, assessment requirements, Guardian rules                     |
| Calibration Coach              | completed-session or concept-level calibration facts, confidence-vs-reasoning deltas, safe coaching budget, learner-facing wording constraints                            |
| Taxonomy Curator               | taxonomy version history, failure/misconception clusters, curator decisions, affected artifacts, compatibility constraints                                                |
| Research / Evaluator           | agent run logs, Guardian rejection rates, outcome deltas, intervention success, user override patterns, prompt/version metadata                                           |

## Output Discipline

Every agent output should distinguish:

- what it knows
- what it inferred
- what it proposes
- what must be reviewed
- what validation gate applies next

Recommended language:

- `Recorded`: service-owned fact.
- `Detected`: deterministic rule result.
- `Suggested`: agent recommendation.
- `Proposed`: artifact or change awaiting review.
- `Blocked`: validation or policy rejection.
- `Needs review`: human/curator decision required.

## Prompt Template Requirements

Each agent prompt template should include:

- stable role and purpose
- current UI surface and audience
- authority boundaries
- live context pack
- allowed tools/actions
- forbidden actions
- required output format
- uncertainty language expectations
- validation/review path

## Failure Modes

- Mixing service facts and agent inference.
- Omitting user intent from generation.
- Giving the agent raw unbounded context instead of bounded summaries.
- Letting generated rationale hide missing evidence.
- Asking an agent to make a decision outside its authority.
- Reusing stale context after artifact or session state changes.
