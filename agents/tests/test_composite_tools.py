from __future__ import annotations

import pytest

from src.agents.composite_tools import CompositeToolRegistry


class FakeInvoker:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict[str, object], str | None]] = []

    async def execute(
        self,
        service: str,
        tool: str,
        payload: dict[str, object],
        *,
        user_id: str | None = None,
    ) -> dict[str, object]:
        self.calls.append((service, tool, payload, user_id))

        fixtures: dict[tuple[str, str], dict[str, object]] = {
            ("session", "get-session"): {
                "id": "session_1",
                "curriculumId": "curr_1",
                "status": "active",
            },
            ("session", "get-step-loop-snapshot"): {
                "currentStep": {"id": "step_1"},
                "status": "awaiting_answer",
            },
            ("session", "get-step-evidence-record"): {
                "stepId": "step_1",
                "stepObjectiveText": "Use the distributive property.",
                "learnerAnswerSummaryText": "The learner distributed to the first term only.",
                "rubricSummary": {"rubricSummaryText": "Distribute to every term."},
                "evidenceCompleteness": {"state": "complete", "missingRequiredFields": []},
            },
            ("session", "get-step-rubric-summary"): {
                "stepId": "step_1",
                "rubricSummaryText": "Distribute to every term.",
                "successCriteriaText": ["Apply the factor to both terms."],
            },
            ("session", "get-step-activity-context"): {
                "stepId": "step_1",
                "activityPromptText": "Simplify 3(x + 2).",
                "activityTypeText": "self_explanation / free_text",
                "contentAnchorSummaries": [
                    {
                        "anchorLabelText": "Distributive property generated activity",
                        "sourceKind": "generated",
                        "promptExcerptText": "Simplify 3(x + 2).",
                        "expectedUseText": "Practice distribution.",
                        "coverageStatusText": "Step activity anchor.",
                        "serviceReferences": {"activityId": "activity_1", "generatedVariantId": "variant_1"},
                    }
                ],
                "serviceReferences": {"activityIds": ["activity_1"], "generatedVariantIds": ["variant_1"]},
            },
            ("session", "get-step-curriculum-anchor"): {
                "stepId": "step_1",
                "curriculumAnchorText": "This Step belongs to algebra foundations.",
                "selectedNodeIds": ["cnode_1"],
                "topicText": "Distributive property",
                "serviceReferences": {"curriculumNodeIds": ["cnode_1"]},
            },
            ("session", "get-learner-feedback-history"): {
                "userId": "user_1",
                "surface": payload.get("surface", "mental_debugger"),
                "windowLabelText": "Last 30 days",
                "recentDismissals": [],
                "recentCorrections": [],
                "feedbackDepthPreference": "standard",
                "temporaryHideState": {"hidden": False},
                "correctionThemesText": ["No corrections or dismissals recorded for this surface."],
                "summaryText": "No corrections or dismissals recorded for this surface.",
                "serviceReferences": {"actionIds": []},
            },
            ("session", "get-learner-load-state"): {
                "userId": "user_1",
                "sessionId": "session_1",
                "frustrationSignalText": "No session-local overload signal is currently detected.",
                "overloadRiskLevel": "low",
                "fatigueIndicatorsText": ["No fatigue indicators detected in the recent session window."],
                "recommendedToneText": "Standard reflective tone is acceptable.",
                "shouldDeferReflectiveAgent": False,
                "evidenceWindowText": "Recent 1 Step(s) in this session.",
                "serviceReferences": {"sessionId": "session_1", "stepIds": ["step_1"]},
            },
            ("session", "get-exposure-budget-state"): {
                "userId": "user_1",
                "sessionId": "session_1",
                "debuggerExposureCountInSession": 0,
                "calibrationExposureCountInSession": 0,
                "lastDebuggerShownAtText": "No debugger reflection has been shown in this session.",
                "lastCalibrationShownAtText": "No calibration coaching has been shown in this session.",
                "debuggerExposureBudgetText": "At most 2 prominent Mental Debugger reflections per session.",
                "coachingFrequencyBudgetText": "At most 2 prominent Calibration Coach notes per session.",
                "remainingBudget": {"mentalDebugger": 2, "calibrationCoach": 2},
                "mustUseQuietSurface": False,
                "serviceReferences": {"exposureIds": []},
            },
            ("metacognition", "get-agent-safe-diagnostic-brief"): {
                "stepId": "step_1",
                "conceptRefs": ["concept_1"],
                "combinedScore": 0.42,
            },
            ("metacognition", "get-remediation-brief"): {
                "stepId": "step_1",
                "conceptRefs": ["concept_1"],
                "recommendedAction": "insert_repair_step",
                "triggersFired": ["trigger_1"],
            },
            ("metacognition", "get-evaluation-by-step"): {
                "id": "eval_1",
                "stepId": "step_1",
                "selfRating": "knew_it",
                "reasoningQuality": 0.42,
                "confidenceSignal": 0.9,
                "combinedScore": 0.49,
            },
            ("metacognition", "get-trace-evidence-pack"): {
                "stepId": "step_1",
                "evaluationId": "eval_1",
                "traceSummaryText": "Cue selection and monitoring were fragile.",
                "frameEvidence": [
                    {"frameKey": "f1", "frameLabel": "Cue selection", "signalLabel": "fragile"},
                    {"frameKey": "f5", "frameLabel": "Monitoring", "signalLabel": "fragile"},
                ],
                "traceCompleteness": {"state": "complete", "missingRequiredFields": []},
            },
            ("metacognition", "get-reasoning-average"): {
                "conceptId": "concept_1",
                "averageReasoning": 0.51,
                "sampleCount": 4,
            },
            ("metacognition", "get-repeated-pattern-history"): {
                "userId": "user_1",
                "conceptIds": ["concept_1"],
                "patternSummaries": [],
                "singleSignalWarningText": "No prior similar Step evidence yet.",
                "mostRecentSimilarStepsText": ["No prior similar Step evidence yet."],
            },
            ("metacognition", "get-calibration-trend-summary"): {
                "userId": "user_1",
                "conceptIds": ["concept_1"],
                "recentCalibrationTrendText": "No recent calibration trend recorded yet.",
                "alignmentRate": 0,
                "overconfidenceCount": 0,
                "underconfidenceCount": 0,
                "hesitationWithQualityCount": 0,
            },
            ("metacognition", "get-concept-mismatch-history"): {
                "userId": "user_1",
                "conceptId": "concept_1",
                "conceptLabelText": "Concept One",
                "mismatchPatternText": "No concept-specific confidence/reasoning mismatch history recorded yet.",
                "recentExamplesText": ["No recent concept-specific mismatch examples recorded yet."],
            },
            ("scheduler", "explain-schedule-state"): {
                "conceptId": "concept_1",
                "queue": "repair",
                "explanation": "Concept needs repair before forward progress.",
            },
            ("scheduler", "get-concept-schedule"): {
                "conceptId": "concept_1",
                "queue": "repair",
                "dueAt": "2026-05-04T12:00:00+00:00",
            },
            ("scheduler", "get-transformation-history"): {
                "conceptId": "concept_1",
                "items": [{"transformationType": "recall"}],
            },
            ("scheduler", "get-prior-calibration-drill-history"): {
                "userId": "user_1",
                "conceptIds": ["concept_1"],
                "priorDrillsText": ["No prior calibration drills recorded."],
                "lastDrillOutcomeText": "No prior calibration drills recorded.",
            },
            ("scheduler", "get-concept-calibration-projection"): {
                "conceptId": "concept_1",
                "scheduleProjectionText": "Concept is in repair queue.",
                "recommendedCalibrationMoveText": "Use a short evidence-alignment check.",
            },
            ("scheduler", "get-intervention-cadence-state"): {
                "userId": "user_1",
                "conceptIds": ["concept_1"],
                "surfaces": ["calibration_coach"],
                "shouldDeferText": "No global cadence block.",
            },
            ("scheduler", "get-due-summary"): {
                "total": 3,
                "byQueue": {"repair": 1, "reinforcement": 2},
            },
            ("knowledge-graph", "get-concept-node"): {
                "nodeId": "concept_1",
                "label": "Concept One",
                "domain": "statistics",
                "description": "A concept used in the current Step.",
            },
            ("knowledge-graph", "find-prerequisites"): {
                "conceptId": "concept_1",
                "layers": [[{"nodeId": "concept_pre_1", "label": "Prerequisite One"}]],
            },
            ("knowledge-graph", "find-confusables"): {
                "items": [{"nodeId": "concept_confuse_1", "label": "Confusable One"}],
            },
            ("knowledge-graph", "find-contrasts"): {
                "items": [{"nodeId": "concept_contrast_1", "label": "Contrast One"}],
            },
            ("knowledge-graph", "find-misconception-links"): {
                "items": [{"nodeId": "misconception_1", "label": "Distributes to first term only"}],
            },
            ("knowledge-graph", "find-related-concepts"): {
                "conceptId": "concept_1",
                "related": [],
            },
            ("knowledge-graph", "get-structural-health"): {
                "status": "ok",
                "warnings": [],
            },
            ("knowledge-graph", "detect-misconceptions"): {
                "items": [{"label": "boundary confusion"}],
            },
            ("knowledge-graph", "get-canonical-structure"): {
                "version": "ckg_v1",
                "relations": [],
            },
            ("content", "get-card-stats"): {
                "cardId": "card_1",
                "usageCount": 4,
            },
            ("content", "get-coverage"): {
                "conceptId": "concept_1",
                "activeCardCount": 1,
                "distinctActiveCardTypes": 1,
            },
            ("content", "get-card-history"): {
                "cardId": "card_1",
                "items": [],
            },
            ("content", "count-cards"): {
                "count": 12,
            },
            ("content", "query-cards"): {
                "items": [
                    {
                        "id": "card_1",
                        "title": "Distributive property example",
                        "content": {"prompt": "Expand 3(x + 2)."},
                    }
                ],
                "total": 1,
            },
            ("content", "get-coverage"): {
                "conceptId": "concept_1",
                "activeCardCount": 1,
                "distinctActiveCardTypes": 1,
            },
            ("curriculum", "get-frontier"): [{"id": "cnode_1", "ckgConceptId": "concept_1"}],
            ("curriculum", "get-active-version"): {
                "id": "cver_1",
                "nodes": [{"id": "cnode_1", "stableNodeKey": "node_1", "ckgConceptId": "concept_1"}],
                "edges": [],
            },
            ("curriculum", "get-progress"): [
                {"stableNodeKey": "node_1", "runtimeState": "in_progress"}
            ],
            ("curriculum", "get-curriculum"): {
                "id": "curr_1",
                "metadata": {
                    "branchStates": [
                        {
                            "branchGroupKey": "branch_probability",
                            "selectedPathRole": "focus_area",
                            "selectedNodeKey": "node_probability",
                            "selectionSource": "system_selected",
                            "selectedAt": "2026-05-09T10:00:00+00:00",
                            "lastConfirmedAt": "2026-05-09T10:00:00+00:00",
                            "driftState": "on_path",
                        }
                    ]
                },
            },
            ("curriculum", "get-curriculum-by-id"): {
                "id": "curr_1",
                "metadata": {
                    "branchStates": [
                        {
                            "branchGroupKey": "branch_probability",
                            "selectedPathRole": "focus_area",
                            "selectedNodeKey": "node_probability",
                            "selectionSource": "system_selected",
                            "selectedAt": "2026-05-09T10:00:00+00:00",
                            "lastConfirmedAt": "2026-05-09T10:00:00+00:00",
                            "driftState": "on_path",
                        }
                    ]
                },
            },
            ("curriculum", "get-session-slice"): {
                "selectedNodeIds": ["cnode_1"],
                "conceptIds": ["concept_1"],
                "rationale": ["frontier priority"],
            },
            ("curriculum", "get-realignment-evidence"): [{"id": "evidence_1"}],
            ("curriculum", "list-revision-proposals"): [{"id": "rev_1"}],
        }
        return fixtures[(service, tool)]


class PartiallyFailingInvoker(FakeInvoker):
    async def execute(
        self,
        service: str,
        tool: str,
        payload: dict[str, object],
        *,
        user_id: str | None = None,
    ) -> dict[str, object]:
        if service == "metacognition" and tool == "get-agent-safe-diagnostic-brief":
            raise RuntimeError("diagnostic brief unavailable")

        return await super().execute(service, tool, payload, user_id=user_id)


class ContentCreatorCkgInvoker(FakeInvoker):
    def __init__(self) -> None:
        super().__init__()
        self.fixtures: dict[tuple[str, str], dict[str, object]] = {
            ("knowledge-graph", "resolve-concept-reference"): {
                "requestedRef": "Family",
                "resolved": True,
                "match": {
                    "nodeId": "node_ckgfamilyaaaaaaaaaaaa",
                    "graphType": "ckg",
                    "label": "Family",
                    "domain": "relationships",
                    "conceptId": "concept_ckgfamilyaaaaaaaaaaaa",
                },
                "matches": [],
            },
            ("knowledge-graph", "get-structural-health"): {"status": "ok"},
            ("content", "query-cards"): {"items": [], "total": 0, "hasMore": False},
        }

    async def execute(
        self,
        service: str,
        tool: str,
        payload: dict[str, object],
        *,
        user_id: str | None = None,
    ) -> dict[str, object]:
        self.calls.append((service, tool, payload, user_id))
        fixture = self.fixtures.get((service, tool))
        if fixture is not None:
            return fixture
        if (service, tool) == ("content", "get-coverage"):
            return {"conceptId": payload["conceptId"], "activeCardCount": 0}
        if (service, tool) == ("content", "gap-fill-concepts"):
            return {"conceptId": payload["conceptId"], "missingTypes": ["definition"]}
        if (service, tool) == ("scheduler", "get-concept-schedule"):
            return {"conceptId": payload["conceptId"], "queue": "new"}
        if (service, tool) == ("metacognition", "get-reasoning-average"):
            return {"conceptId": payload["conceptId"], "averageReasoning": None, "sampleCount": 0}
        raise AssertionError(f"Unexpected call: {(service, tool)}")


class ContentCreatorSelectedNodeInvoker(FakeInvoker):
    async def execute(
        self,
        service: str,
        tool: str,
        payload: dict[str, object],
        *,
        user_id: str | None = None,
    ) -> dict[str, object]:
        self.calls.append((service, tool, payload, user_id))
        if (service, tool) == ("knowledge-graph", "resolve-concept-reference"):
            return {
                "requestedRef": "Family",
                "resolved": False,
                "match": None,
                "matches": [],
            }
        if (service, tool) == ("knowledge-graph", "get-concept-node"):
            return {
                "nodeId": payload["nodeId"],
                "graphType": "pkg",
                "nodeType": "concept",
                "label": "Family",
                "domain": "general",
                "supportedStudyModes": ["knowledge_gaining"],
            }
        if (service, tool) == ("knowledge-graph", "find-prerequisites"):
            return {"targetNode": {"nodeId": payload["nodeId"]}, "layers": []}
        if (service, tool) == ("knowledge-graph", "get-structural-health"):
            return {"status": "ok"}
        if (service, tool) == ("content", "query-cards"):
            return {"items": [], "total": 0, "hasMore": False}
        raise AssertionError(f"Unexpected call: {(service, tool)}")


class ContentCreatorGroundingInvoker(FakeInvoker):
    async def execute(
        self,
        service: str,
        tool: str,
        payload: dict[str, object],
        *,
        user_id: str | None = None,
    ) -> dict[str, object]:
        self.calls.append((service, tool, payload, user_id))
        if (service, tool) == ("content", "get-coverage"):
            return {"conceptId": payload["conceptId"], "activeCardCount": 0}
        if (service, tool) == ("content", "list-generated-activity-variants"):
            return []
        if (service, tool) == ("content", "query-cards"):
            return {"items": [], "total": 0, "hasMore": False}
        if (service, tool) == ("scheduler", "get-concept-schedule"):
            return {"conceptId": payload["conceptId"], "queue": "new"}
        if (service, tool) == ("metacognition", "get-reasoning-average"):
            return {"conceptId": payload["conceptId"], "averageReasoning": 0.6, "sampleCount": 4}
        if (service, tool) == ("ingestion", "get-document-context"):
            return {"documentId": payload["documentId"], "title": "Stats Source", "parseWarnings": []}
        if (service, tool) == ("vector", "retrieve-document-chunks"):
            return {
                "documentId": payload["documentId"],
                "queryPlan": {"mode": "per_concept_label", "queries": payload["conceptLabels"]},
                "matches": [],
                "chunks": [],
            }
        raise AssertionError(f"Unexpected call: {(service, tool)}")


@pytest.mark.asyncio
async def test_active_learning_context_aggregates_session_and_diagnostics() -> None:
    registry = CompositeToolRegistry(FakeInvoker())

    result = await registry.execute(
        "get-active-learning-context",
        {"sessionId": "session_1", "curriculumId": "curr_1"},
        "user_1",
    )

    keys = [section["key"] for section in result["sections"]]
    assert "sessionState" in keys
    assert "stepLoopSnapshot" in keys
    assert "diagnosticBrief" in keys
    assert "curriculumFrontier" in keys


@pytest.mark.asyncio
async def test_step_repair_context_pulls_remediation_and_schedule_explanation() -> None:
    registry = CompositeToolRegistry(FakeInvoker())

    result = await registry.execute(
        "get-step-repair-context",
        {"sessionId": "session_1"},
        "user_1",
    )

    keys = [section["key"] for section in result["sections"]]
    assert "remediationBrief" in keys
    assert "scheduleState:concept_1" in keys


@pytest.mark.asyncio
async def test_strategy_replanning_context_prefetches_live_facts_and_labels() -> None:
    invoker = FakeInvoker()
    registry = CompositeToolRegistry(invoker)

    result = await registry.execute(
        "get-strategy-replanning-context",
        {
            "sessionId": "session_1",
            "stepId": "step_1",
            "conceptIds": ["concept_1"],
            "studyMode": "knowledge_gaining",
            "trigger": {"type": "prerequisite_gap"},
            "patchProposal": {"scope": "local_step"},
            "previousValidation": {"state": "accepted"},
        },
        "user_1",
    )

    keys = [section["key"] for section in result["sections"]]
    assert "evaluation" in keys
    assert "remediationBrief" in keys
    assert "conceptLabel:concept_1" in keys
    assert "trigger" in keys
    assert "patchProposal" in keys
    assert "validationResults" in keys
    assert "constraints" in keys
    assert result["outputContract"]["schema"] == "strategy_replanning_result"
    assert any(call[0] == "knowledge-graph" and call[1] == "get-concept-node" for call in invoker.calls)
    assert any(item["service"] == "session-service" for item in result["serviceInputManifest"])


@pytest.mark.asyncio
async def test_cognitive_copilot_context_stuffs_hints_events_and_labels() -> None:
    invoker = FakeInvoker()
    registry = CompositeToolRegistry(invoker)

    result = await registry.execute(
        "get-cognitive-copilot-context",
        {
            "sessionId": "session_1",
            "curriculumId": "curr_1",
            "conceptIds": ["concept_1"],
            "agentHints": [{"summary": "Repair is available", "source": "patch-planner"}],
            "timelineEvents": [{"kind": "step_answered", "label": "Answered Step"}],
            "surface": "sidebar",
        },
        "user_1",
    )

    keys = [section["key"] for section in result["sections"]]
    assert "agentHints" in keys
    assert "timelineEvents" in keys
    assert "visibilityPolicy" in keys
    assert "conceptLabel:concept_1" in keys
    assert result["outputContract"]["schema"] == "cognitive_copilot_result"
    assert any(item["tool"] == "get-concept-node" for item in result["serviceInputManifest"])


@pytest.mark.asyncio
async def test_watchtower_context_prefetches_policy_bounded_live_facts() -> None:
    invoker = FakeInvoker()
    registry = CompositeToolRegistry(invoker)

    result = await registry.execute(
        "get-watchtower-governance-context",
        {
            "sessionId": "session_1",
            "stepId": "step_1",
            "surface": "copilot",
            "proposedAction": {"requestedDataClasses": ["trace_summary"]},
            "agentHints": [{"category": "repair"}],
            "policyContext": {"privacyPolicyVersion": "wt.v1"},
        },
        "user_1",
    )

    keys = [section["key"] for section in result["sections"]]
    assert "surfaceContext" in keys
    assert "diagnosticBrief" in keys
    assert "proposedAction" in keys
    assert "policyConstraints" in keys
    assert result["outputContract"]["schema"] == "watchtower_governance_result"
    assert any(item["tool"] == "get-step-loop-snapshot" for item in result["serviceInputManifest"])


@pytest.mark.asyncio
async def test_mode_preference_context_includes_eligibility_history_and_labels() -> None:
    invoker = FakeInvoker()
    registry = CompositeToolRegistry(invoker)

    result = await registry.execute(
        "get-mode-preference-context",
        {
            "sessionId": "session_1",
            "conceptIds": ["concept_1"],
            "candidateModes": ["recall", "comparison"],
            "deterministicFallback": "recall",
            "recentModes": ["recall"],
            "learnerPreferences": {"preferredMode": "comparison"},
        },
        "user_1",
    )

    keys = [section["key"] for section in result["sections"]]
    assert "candidateModes" in keys
    assert "deterministicFallback" in keys
    assert "conceptLabel:concept_1" in keys
    assert "policyConstraints" in keys
    assert result["outputContract"]["schema"] == "mode_preference_result"
    assert any(item["tool"] == "get-transformation-history" for item in result["serviceInputManifest"])


@pytest.mark.asyncio
async def test_taxonomy_curator_context_uses_minimized_evidence_and_owner_reads() -> None:
    invoker = FakeInvoker()
    registry = CompositeToolRegistry(invoker)

    result = await registry.execute(
        "get-taxonomy-curator-context",
        {
            "taxonomyDomain": "misconception",
            "conceptIds": ["concept_1"],
            "stepId": "step_1",
            "taxonomySnapshot": {"version": "v1", "labels": ["boundary_confusion"]},
            "evidenceClusters": [{"id": "cluster_1", "count": 8}],
            "impactContext": {"affectedRecordCount": 8},
        },
        "user_1",
    )

    keys = [section["key"] for section in result["sections"]]
    assert "taxonomySnapshot" in keys
    assert "evidenceClusters" in keys
    assert "diagnosticBrief" in keys
    assert "structuralHealth" in keys
    assert "policyConstraints" in keys
    assert result["outputContract"]["schema"] == "taxonomy_curator_result"
    assert any(item["service"] == "knowledge-graph-service" for item in result["serviceInputManifest"])


@pytest.mark.asyncio
async def test_stability_and_reasoning_pack_pairs_scheduler_with_metacognition() -> None:
    registry = CompositeToolRegistry(FakeInvoker())

    result = await registry.execute(
        "get-stability-and-reasoning-pack",
        {"conceptIds": ["concept_1"]},
        "user_1",
    )

    keys = [section["key"] for section in result["sections"]]
    assert "schedule:concept_1" in keys
    assert "reasoning:concept_1" in keys


@pytest.mark.asyncio
async def test_calibration_context_prefetches_evaluation_projection_and_schedule() -> None:
    invoker = FakeInvoker()
    registry = CompositeToolRegistry(invoker)

    result = await registry.execute(
        "get-calibration-context",
        {"sessionId": "session_1", "stepId": "step_1", "conceptIds": ["concept_1"], "studyMode": "knowledge_gaining"},
        "user_1",
    )

    keys = [section["key"] for section in result["sections"]]
    assert "stepLoopSnapshot" in keys
    assert "stepEvidenceRecord" in keys
    assert "rubricSummary" in keys
    assert "evaluation" in keys
    assert "traceEvidencePack" in keys
    assert "diagnosticBrief" in keys
    assert "conceptLearningContext" in keys
    assert "contentAnchorSummaries" in keys
    assert "calibrationProjection:concept_1" in keys
    assert "learnerFeedbackHistory" in keys
    assert "learnerLoadState" in keys
    assert "exposureBudgetState" in keys
    assert "calibrationTrendSummary" in keys
    assert "priorCalibrationDrillHistory" in keys
    assert "interventionCadenceState" in keys
    assert "conceptCalibrationProjection:concept_1" in keys
    assert "conceptMismatchHistory:concept_1" in keys
    assert any(item["tool"] == "get-concept-schedule" and item["input"]["studyMode"] == "knowledge_gaining" for item in result["serviceInputManifest"])


@pytest.mark.asyncio
async def test_step_concept_context_separates_reasoning_from_service_references() -> None:
    invoker = FakeInvoker()
    registry = CompositeToolRegistry(invoker)

    result = await registry.execute(
        "get-step-concept-context",
        {
            "sessionId": "session_1",
            "stepId": "step_1",
            "conceptIds": ["concept_1"],
            "studyMode": "knowledge_gaining",
        },
        "user_1",
    )

    keys = [section["key"] for section in result["sections"]]
    assert "conceptLearningContext" in keys
    assert "contentAnchorSummaries" in keys
    assert "curriculumAnchorSummary" in keys
    item = result["conceptLearningContext"][0]
    assert item["reasoning"]["conceptLabelText"] == "Concept One"
    assert item["reasoning"]["prerequisiteSummaries"][0]["labelText"] == "Prerequisite One"
    assert item["reasoning"]["confusableConceptSummaries"][0]["labelText"] == "Confusable One"
    assert item["reasoning"]["contentAnchorSummaries"]
    assert item["serviceReferences"]["conceptId"] == "concept_1"
    assert "conceptId" not in item["reasoning"]
    assert result["readiness"]["rules"]["idsStayInServiceReferences"] is True
    assert any(call[0] == "content" and call[1] == "query-cards" for call in invoker.calls)


@pytest.mark.asyncio
async def test_mental_debugger_context_stuffs_authority_labeled_live_facts() -> None:
    invoker = FakeInvoker()
    registry = CompositeToolRegistry(invoker)

    result = await registry.execute(
        "get-mental-debugger-context",
        {
            "sessionId": "session_1",
            "stepId": "step_1",
            "conceptIds": ["concept_1"],
            "studyMode": "knowledge_gaining",
            "userIntent": {"depth": "brief"},
        },
        "user_1",
    )

    keys = [section["key"] for section in result["sections"]]
    assert "evaluation" in keys
    assert "stepEvidenceRecord" in keys
    assert "rubricSummary" in keys
    assert "traceEvidencePack" in keys
    assert "conceptLearningContext" in keys
    assert "contentAnchorSummaries" in keys
    assert "diagnosticBrief" in keys
    assert "remediationBrief" in keys
    assert "repeatedPatternHistory" in keys
    assert "learnerFeedbackHistory" in keys
    assert "learnerLoadState" in keys
    assert "exposureBudgetState" in keys
    assert "userIntent" in keys
    assert "constraints" in keys
    assert any(section["authorityLabel"] == "user_provided_intent" for section in result["sections"])
    assert any(item["tool"] == "get-transformation-history" and item["input"]["studyMode"] == "knowledge_gaining" for item in result["serviceInputManifest"])


@pytest.mark.asyncio
async def test_learner_facing_readiness_context_reports_prefetch_and_prerequisites() -> None:
    registry = CompositeToolRegistry(FakeInvoker())

    result = await registry.execute(
        "get-mental-debugger-readiness-context",
        {
            "sessionId": "session_1",
            "stepId": "step_1",
            "conceptIds": ["concept_1"],
            "studyMode": "knowledge_gaining",
            "userIntent": {"depth": "brief"},
        },
        "user_1",
    )

    readiness = result["agentInputReadinessReport"]
    keys = [section["key"] for section in result["sections"]]
    assert result["compositeTool"] == "get-mental-debugger-readiness-context"
    assert "agentInputReadinessReport" in keys
    assert readiness["readinessState"] in {"ready", "ready_with_empty_history"}
    assert {field["fieldName"] for field in readiness["prefetchedFields"]} >= {
        "stepEvidenceRecord",
        "rubricSummary",
        "traceEvidencePack",
    }
    assert {field["fieldName"] for field in readiness["prerequisiteAgentFields"]} == {
        "patchPlannerHandoffContext",
        "strategyHandoffContext",
    }
    assert readiness["missingFields"] == []


@pytest.mark.asyncio
async def test_patch_planner_context_routes_validation_and_owner_boundaries() -> None:
    registry = CompositeToolRegistry(FakeInvoker())

    result = await registry.execute(
        "get-patch-planner-context",
        {
            "sessionId": "session_1",
            "stepId": "step_1",
            "conceptIds": ["concept_1"],
            "studyMode": "knowledge_gaining",
            "previousValidation": {"validationId": "guardian_1", "state": "blocked"},
        },
        "user_1",
    )

    keys = [section["key"] for section in result["sections"]]
    assert "remediationBrief" in keys
    assert "validationResults" in keys
    assert "constraints" in keys
    assert result["outputContract"]["persistenceBoundary"] == "owning-service-review-surface"
    assert any(item["tool"] == "get-concept-schedule" and item["input"]["studyMode"] == "knowledge_gaining" for item in result["serviceInputManifest"])


@pytest.mark.asyncio
async def test_active_learning_context_records_partial_failures_for_followup() -> None:
    registry = CompositeToolRegistry(PartiallyFailingInvoker())

    result = await registry.execute(
        "get-active-learning-context",
        {"sessionId": "session_1", "curriculumId": "curr_1"},
        "user_1",
    )

    assert result["errors"]
    assert result["errors"][0]["tool"] == "get-agent-safe-diagnostic-brief"
    assert result["openQuestions"] == [
        "Do we need to refresh missing sections live before prompting the agent?"
    ]


@pytest.mark.asyncio
async def test_content_creator_brief_blocks_without_graph_readiness() -> None:
    invoker = ContentCreatorCkgInvoker()
    registry = CompositeToolRegistry(invoker)

    result = await registry.execute(
        "get-content-creator-brief",
        {"conceptIds": ["Family"], "studyMode": "knowledge_gaining"},
        "user_1",
    )

    assert result["missingConceptRefs"] == ["Family"]
    assert result["resolvedConceptIds"] == []
    assert result["readiness"]["ready"] is False
    assert not any(
        call[0] == "knowledge-graph"
        for call in invoker.calls
    )
    assert any("Graph readiness" in question for question in result["openQuestions"])


@pytest.mark.asyncio
async def test_content_creator_brief_does_not_use_selected_node_to_resolve_graph() -> None:
    invoker = ContentCreatorSelectedNodeInvoker()
    registry = CompositeToolRegistry(invoker)

    result = await registry.execute(
        "get-content-creator-brief",
        {
            "conceptIds": ["Family"],
            "selectedNodeIds": ["node_mJyb6wA8u-Ig_m3ysGgNW"],
            "studyMode": "knowledge_gaining",
        },
        "user_1",
    )

    assert result["missingConceptRefs"] == ["Family"]
    assert result["readiness"]["ready"] is False
    assert not any(call[0] == "knowledge-graph" for call in invoker.calls)
    assert any("Graph readiness" in question for question in result["openQuestions"])


@pytest.mark.asyncio
async def test_content_creator_brief_uses_semantic_labels_for_rag_queries() -> None:
    invoker = ContentCreatorGroundingInvoker()
    registry = CompositeToolRegistry(invoker)

    result = await registry.execute(
        "get-content-creator-brief",
        {
            "conceptIds": ["concept_1", "concept_2"],
            "documentIds": ["doc_1"],
            "studyMode": "knowledge_gaining",
            "preflightArtifacts": {
                "graphReadiness": {
                    "status": "finalized",
                    "concepts": [
                        {
                            "inputRef": "concept_1",
                            "label": "Bayes theorem",
                            "conceptId": "concept_123456789012345678901",
                            "pkgNodeId": "node_123456789012345678901",
                            "ckgNodeId": "node_ckg_123456789012345678",
                        },
                        {
                            "inputRef": "concept_2",
                            "label": "Conditional probability",
                            "conceptId": "concept_223456789012345678901",
                            "pkgNodeId": "node_223456789012345678901",
                            "ckgNodeId": "node_ckg_223456789012345678",
                        },
                    ],
                }
            },
        },
        "user_1",
    )

    vector_calls = [call for call in invoker.calls if call[0] == "vector" and call[1] == "retrieve-document-chunks"]
    assert len(vector_calls) == 1
    assert vector_calls[0][2]["conceptLabels"] == ["Bayes theorem", "Conditional probability"]
    assert result["readiness"]["ready"] is True


@pytest.mark.asyncio
async def test_curriculum_draft_context_includes_branching_sections() -> None:
    registry = CompositeToolRegistry(FakeInvoker())

    result = await registry.execute(
        "get-curriculum-draft-context",
        {
            "curriculumId": "curr_1",
            "conceptIds": ["concept_1"],
            "studyMode": "knowledge_gaining",
            "domain": "statistics",
        },
        "user_1",
    )

    keys = [section["key"] for section in result["sections"]]
    assert "curriculum" in keys
    assert "branchCandidates" in keys
    assert "blockedPrerequisites" in keys
    assert "focusAreaOptions" in keys
    assert "coverageGapsByBranch" in keys
    assert "branchStateSummary" in keys
