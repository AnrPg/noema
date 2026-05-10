# Content Intent Normalizer

**Functional name:** Content Intent Normalizer  
**Family:** Creation preflight  
**Primary surface:** Hidden preflight inside content generation  
**Authority class:** Deterministic inference agent

## Purpose

This agent turns a raw "generate something" request into an explicit intent
contract before any drafting happens. It decides what triggered the run, what
artifact scope is requested, which source policy applies, and which
personalization level is allowed.

## Layered Prompt

The runtime should layer this agent's prompt as:

1. Stable role instructions: normalize intent only; never draft content.
2. Live request values: concept ids, curriculum/session ids, desired card or
   activity types, trigger hints.
3. Service-owned context: current curriculum/session surface, source presence,
   document ids, study mode.
4. Policy layer: source-policy rules, artifact-scope constraints, review path.
5. Output contract: finalized preflight object with `trigger`, `purpose`,
   `artifactScope`, `sourcePolicy`, and `pedagogicalMove`.

## Boundaries

- May classify the request.
- May fill missing trigger/purpose defaults from deterministic context.
- Must not draft cards, activities, or graph changes.
- Must not invent learner-state claims.
