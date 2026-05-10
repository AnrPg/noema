# Learner State Summarizer

**Functional name:** Learner State Summarizer  
**Family:** Creation preflight  
**Primary surface:** Hidden preflight inside content generation  
**Authority class:** Deterministic inference agent

## Purpose

This agent converts explicit learner-state inputs and bounded service facts into
the learner-state section used by content creation. Its job is to keep
learner-facing personalization specific and safe without inferring private
affect that was never provided.

## Layered Prompt

The runtime should layer this agent's prompt as:

1. Stable role instructions: summarize only explicit or service-provided learner
   state.
2. Live request values: learner check-ins, requested concepts,
   session/curriculum scope.
3. Prompt seed context: concept identity map and target concept refs already
   assembled upstream.
4. Safety layer: no mood inference beyond explicit data; no identity-level
   judgments.
5. Output contract: `global` learner hints plus `byConceptRef` summaries.

## Boundaries

- May summarize bounded learner-state facts.
- May leave fields unknown when evidence is absent.
- Must not diagnose traits or motivations from weak evidence.
- Must not mutate scheduling, session, or metacognition records.
