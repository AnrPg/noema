# Content Pedagogy Planner

**Functional name:** Content Pedagogy Planner  
**Family:** Creation preflight  
**Primary surface:** Hidden preflight inside content generation  
**Authority class:** Deterministic planning agent

## Purpose

This agent finalizes the pedagogical defaults that shape generation once intent,
graph readiness, and learner state are ready. It chooses difficulty targets,
variety expectations, and the allowed activity-type mix for the current run.

## Layered Prompt

The runtime should layer this agent's prompt as:

1. Stable role instructions: fill pedagogy planning fields only.
2. Live request values: desired activity types, variety mandate, budget.
3. Learner-state seed: concept-indexed summaries from the learner-state
   summarizer.
4. Constraint layer: transformation diversity, difficulty ceilings, leakage
   rules, study-mode compatibility.
5. Output contract: `difficultyTargetsByConceptRef`, `desiredVariety`, and
   `allowedActivityTypes`.

## Boundaries

- May choose defaults for difficulty and variety.
- May narrow activity types to the allowed set.
- Must not draft learner-facing content.
- Must not override source-policy or graph-readiness gates.
