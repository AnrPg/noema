# Agent Input Readiness Phase 4

Phase 4 adds the orchestration gate that sits in front of `mental-debugger` and `calibration-coach`. The gate does not rewrite the final agent prompt schemas yet; that is Phase 5. Its job is to make sure learner-facing reflective agents are not called with silent gaps, hidden policy fields, or missing prerequisite artifacts.

## Workflow

1. The runtime fetches deterministic context through the existing composite tool for the target agent.
2. The runtime builds `WatchtowerPolicyContext` from the Watchtower agent plus learner load, feedback, and exposure-budget sections.
3. The runtime derives `LessonPlanHandoffContext` from step evidence, curriculum anchors, and activity anchors.
4. If remediation or calibration signals require an intervention, the runtime runs Patch Planner first and stuffs `PatchPlannerHandoffContext`.
5. If the intervention may affect session flow, overload, or routing, the runtime runs Strategy/Replanning and stuffs `StrategyHandoffContext`.
6. Calibration Coach receives a deterministic `DebuggerSummaryForCalibration` projection when trace explanation is needed but Phase 5 has not yet made Mental Debugger the authoring prerequisite.
7. The runtime appends `AgentInputReadinessReport` and blocks execution when required fields, policy, or prerequisite artifacts are not ready.

## Readiness States

- `ready`: Required deterministic context, policy, and handoff sections are present.
- `ready_with_empty_history`: Required current-Step context is present, but history sections explicitly say the learner has no prior pattern, drills, corrections, or trend data.
- `deferred_missing_deterministic_context`: Required prefetched fields such as step objective, learner answer summary, rubric summary, or frame evidence are absent or incomplete.
- `deferred_waiting_for_prerequisite_agent`: A required prerequisite artifact is blocked or not finalized.
- `hidden_by_policy`: Watchtower hides or defers the surface due to privacy, trace sensitivity, or overload/intrusion risk.
- `blocked_by_validation`: Composite/service calls returned errors while assembling required context.

## Contract

`AgentInputReadinessReport` records:

- `missingFields`: Required deterministic fields that are absent or incomplete.
- `policyHiddenFields`: Fields Watchtower prevented from surfacing, currently trace evidence for sensitive raw-trace requests.
- `prefetchedFields`: Sections fetched before the model call, with source service and authority label.
- `callableToolFields`: Provider tool catalog entries available only at provider/runtime call time.
- `prerequisiteAgentFields`: Patch Planner, Strategy/Replanning, or debugger-summary prerequisites and their status.
- `inferredFallbackFields`: Deterministic fallback projections used until a stronger owner exists.
- `humanReadableReasoningSections`: Sections safe for agent reasoning.
- `serviceContractSections`: Sections needed for routing, audit, persistence, and downstream handoff.

## No-Call Rules

`mental-debugger` and `calibration-coach` are blocked before execution when:

- `stepEvidenceRecord.stepObjectiveText` is missing.
- `stepEvidenceRecord.learnerAnswerSummaryText` is missing.
- `rubricSummary.rubricSummaryText` is missing.
- `traceEvidencePack.frameEvidence` is missing or malformed.
- Watchtower hides or defers the target learner-facing surface.
- Prerequisite Patch Planner or Strategy artifacts are blocked.
- Context assembly returned service errors for required fields.

## Composite Readiness Tools

The composite registry now exposes:

- `get-learner-facing-agent-foundation-context`
- `get-mental-debugger-readiness-context`
- `get-calibration-coach-readiness-context`

These tools assemble the deterministic foundation context and include a composite-level readiness report. The runtime still owns final Watchtower gating and prerequisite-agent sequencing, because it has access to wrapper metadata, execution mode, provider tool catalogs, and Guardian-capable collaborating agents.

## Phase 5 Boundary

Phase 4 makes the workflow safe and inspectable. Phase 5 should restructure the actual `mental-debugger` and `calibration-coach` schemas so model reasoning receives only human-readable context while IDs remain isolated in service references and downstream handoff fields.
