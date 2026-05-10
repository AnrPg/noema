from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from src.agents import app as agents_app_module
from src.agents.agent_runtime import (
    AgentRunRequest,
    AgentRuntime,
    UserFacingAgentError,
    _wrappers,
)
from src.agents.batch_jobs import TemporarySQLiteBatchJobStore
from src.agents.composite_tools import CompositeToolRegistry
from src.agents.guardian_client import GuardianOutcome
from src.agents.llm_router import (
    LLMRouter,
    ProviderBatchItemResult,
    ProviderBatchRequest,
    response_schema_for_wrapper,
)


class FakeInvoker:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict[str, object], str | None]] = []

    async def list_tools(
        self,
        service: str,
        *,
        user_id: str | None = None,
    ) -> list[dict[str, object]]:
        service_name = f"{service}-service"
        names_by_service = {
            "session": [
                "get-session",
                "get-step-loop-snapshot",
                "get-step-evidence-record",
                "get-step-rubric-summary",
                "get-step-activity-context",
                "get-step-curriculum-anchor",
                "get-learner-feedback-history",
                "get-learner-load-state",
                "get-exposure-budget-state",
                "record-agent-surface-exposure",
                "record-learner-feedback-action",
                "create-lesson-plan",
                "answer-step",
                "complete-session",
            ],
            "curriculum": ["get-session-slice", "get-frontier", "get-progress", "get-curriculum", "get-active-version", "list-revision-proposals", "get-realignment-evidence", "create-draft-version"],
            "scheduler": [
                "get-due-concepts",
                "get-concept-schedule",
                "get-transformation-history",
                "get-prior-calibration-drill-history",
                "get-concept-calibration-projection",
                "get-intervention-cadence-state",
            ],
            "metacognition": [
                "get-evaluation-by-step",
                "get-trace-evidence-pack",
                "get-agent-safe-diagnostic-brief",
                "get-remediation-brief",
                "get-reasoning-average",
                "get-repeated-pattern-history",
                "get-calibration-trend-summary",
                "get-concept-mismatch-history",
            ],
            "content": ["build-session-seed", "query-cards", "get-coverage", "get-card-history", "get-card-stats", "count-cards", "create-card", "update-card", "request-generation", "list-generated-activity-variants"],
            "knowledge-graph": [
                "resolve-concept-reference",
                "get-concept-node",
                "get-canonical-structure",
                "find-prerequisites",
                "find-related-concepts",
                "find-contrasts",
                "find-confusables",
                "find-misconception-links",
                "ensure-content-readiness-subgraph",
                "get-structural-health",
                "detect-misconceptions",
                "get-canonical-structure",
                "add-concept-node",
                "add-edge",
                "confirm-pkg-write-plan",
                "propose-mutation",
            ],
            "pedagogy-guardian": [
                "validate-lesson-plan",
                "validate-step",
                "validate-activity",
                "validate-replan",
                "validate-coaching-artifact",
            ],
        }
        return [
            {
                "name": name,
                "service": service_name,
                "description": f"{name} test definition",
                "inputSchema": {"type": "object"},
                "capabilities": {"sideEffects": name.startswith("validate-") or name == "create-lesson-plan"},
            }
            for name in names_by_service.get(service, [])
        ]

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
            ("session", "get-session"): {"id": "session_1", "status": "active"},
            ("curriculum", "get-session-slice"): {
                "selectedNodeIds": ["cnode_1"],
                "conceptIds": ["concept_1"],
                "rationale": ["frontier priority"],
            },
            ("session", "get-step-loop-snapshot"): {"currentStep": {"id": "step_1"}},
            ("session", "get-step-evidence-record"): {
                "stepId": "step_1",
                "stepObjectiveText": "Use the distributive property.",
                "learnerAnswerSummaryText": "The learner distributed to the first term only.",
                "rubricSummary": {"rubricSummaryText": "Distribute to every term."},
                "evidenceCompleteness": {"state": "complete", "missingRequiredFields": []},
                "serviceReferences": {"stepId": "step_1", "answerArtifactId": "answer_1"},
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
                "combinedScore": 0.5,
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
            ("scheduler", "explain-schedule-state"): {
                "conceptId": "concept_1",
                "queue": "repair",
                "explanation": "Concept needs repair before forward progress.",
            },
            ("curriculum", "get-frontier"): [{"id": "cnode_1", "ckgConceptId": "concept_1"}],
            ("scheduler", "get-due-summary"): {"total": 2, "byQueue": {"repair": 1}},
            ("metacognition", "get-reasoning-average"): {
                "conceptId": "concept_1",
                "averageReasoning": 0.61,
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
                "conceptLabelText": "Concept One",
                "nextCalibrationOpportunityText": "Use a quick confidence-before-evidence check if overconfidence repeats.",
                "recommendedCalibrationMoveText": "No calibration drill is required yet.",
            },
            ("scheduler", "get-intervention-cadence-state"): {
                "userId": "user_1",
                "surfaces": ["calibration_coach"],
                "coachingFrequencyBudgetText": "No more than two prominent coaching notes per session.",
                "shouldThrottle": False,
                "serviceReferences": {"cadenceWindow": "session"},
            },
            ("scheduler", "get-due-concepts"): {
                "conceptIds": ["concept_1"],
                "queue": "repair",
            },
            ("knowledge-graph", "get-structural-health"): {
                "status": "ok",
                "weakAreas": ["prerequisites"],
            },
            ("knowledge-graph", "find-prerequisites"): {
                "conceptId": "concept_123456789012345678901",
                "layers": [],
            },
            ("knowledge-graph", "find-related-concepts"): {
                "conceptId": "concept_1",
                "related": [
                    {
                        "label": "Conditional probability",
                        "sourceNodeId": "node_ckg_source_1234567890",
                        "relationship": "related_to",
                        "weight": 0.7,
                    }
                ],
            },
            ("knowledge-graph", "find-contrasts"): {
                "items": [],
            },
            ("knowledge-graph", "find-confusables"): {
                "items": [],
            },
            ("knowledge-graph", "find-misconception-links"): {
                "items": [],
            },
            ("knowledge-graph", "detect-misconceptions"): {
                "items": [],
            },
            ("curriculum", "get-active-version"): {
                "id": "cver_1",
                "nodes": [{"id": "cnode_1", "stableNodeKey": "node_1"}],
                "edges": [],
            },
            ("curriculum", "get-curriculum"): {
                "id": "curr_1",
                "metadata": {
                    "branchStates": [
                        {
                            "branchGroupKey": "branch_probability",
                            "selectedPathRole": "focus_area",
                            "selectedNodeKey": "node_1",
                            "selectionSource": "learner_progress",
                            "selectedAt": "2026-05-09T10:00:00+00:00",
                            "lastConfirmedAt": "2026-05-09T10:00:00+00:00",
                            "driftState": "on_path",
                        }
                    ]
                },
            },
            ("curriculum", "get-progress"): [
                {"stableNodeKey": "node_1", "runtimeState": "in_progress"}
            ],
            ("curriculum", "get-realignment-evidence"): [
                {
                    "stableNodeKey": "node_1",
                    "triggerType": "prerequisite_gap",
                    "accumulatedWeight": 2,
                }
            ],
            ("content", "get-coverage"): {
                "conceptId": "concept_123456789012345678901",
                "activeCardCount": 1,
                "distinctActiveCardTypes": 1,
            },
            ("content", "get-coverage-document"): {
                "documentId": "doc_1",
                "activeCardCount": 1,
            },
            ("content", "query-cards"): {"items": [], "total": 0, "hasMore": False},
            ("content", "get-card-history"): {"items": []},
            ("content", "get-card-stats"): {"usageCount": 4},
            ("content", "list-generated-activity-variants"): {"items": [], "total": 0, "hasMore": False},
            ("content", "count-cards"): {"count": 12},
            ("content", "build-session-seed"): {
                "conceptIds": ["concept_1"],
                "candidates": [{"id": "card_1", "conceptIds": ["concept_1"]}],
            },
            ("content", "gap-fill-concepts"): {"conceptId": "concept_123456789012345678901", "missingTypes": ["application"]},
            ("ingestion", "get-document-context"): {
                "documentId": "doc_1",
                "title": "Source One",
                "parseWarnings": [],
                "ocrStatus": "not_requested",
            },
            ("ingestion", "get-document-ir"): {
                "documentId": "doc_1",
                "title": "Source One",
                "language": "en",
                "blocks": [
                    {"id": "block_1", "kind": "heading", "text": "Bayes Theorem", "metadata": {"headingPath": ["Bayes Theorem"]}},
                    {"id": "block_2", "kind": "paragraph", "text": "Bayes theorem updates probabilities using evidence.", "metadata": {"headingPath": ["Bayes Theorem"]}},
                ],
                "outline": [{"id": "block_1", "kind": "heading", "text": "Bayes Theorem"}],
            },
            ("ingestion", "get-document-chunks"): [
                {
                    "id": "chunk_1",
                    "documentId": "doc_1",
                    "text": "Bayes theorem updates probabilities using evidence.",
                    "headingPath": ["Bayes Theorem"],
                    "metadata": {},
                }
            ],
            ("vector", "retrieve-document-chunks"): {
                "documentId": "doc_1",
                "queryPlan": {"mode": "per_concept_label", "queries": ["Concept One"]},
                "matches": [
                    {
                        "query": "Concept One",
                        "conceptLabel": "Concept One",
                        "chunks": [{"chunkId": "chunk_1", "text": "Grounding text."}],
                    }
                ],
                "chunks": [{"chunkId": "chunk_1", "text": "Grounding text."}],
            },
        }
        if (service, tool) == ("knowledge-graph", "get-concept-node"):
            node_id = payload.get("nodeId")
            return {
                "id": node_id if isinstance(node_id, str) else "node_123456789012345678901",
                "nodeId": node_id if isinstance(node_id, str) else "node_123456789012345678901",
                "label": "Concept One",
                "domain": "statistics",
            }
        if (service, tool) == ("knowledge-graph", "resolve-concept-reference"):
            ref = payload.get("ref")
            requested_ref = ref if isinstance(ref, str) else "concept_1"
            if requested_ref == "Unmapped concept":
                return {
                    "requestedRef": requested_ref,
                    "resolved": False,
                    "match": None,
                    "matches": [],
                }
            label = "Bayes theorem" if requested_ref == "Bayes theorem" else "Concept One"
            return {
                "requestedRef": requested_ref,
                "resolved": True,
                "match": {
                    "nodeId": "node_123456789012345678901",
                    "ckgNodeId": "node_ckg_target_1234567890",
                    "label": label,
                    "domain": "statistics",
                    "graphType": "pkg",
                    "conceptId": "concept_123456789012345678901",
                    "learnerFacingSummary": f"{label} summary.",
                },
                "matches": [],
            }
        if (service, tool) == ("content", "get-coverage") and "documentId" in payload:
            return fixtures[("content", "get-coverage-document")]
        return fixtures[(service, tool)]


class AcceptingGuardian:
    async def validate_activity(self, payload: object) -> GuardianOutcome:
        return GuardianOutcome(accepted=True, validationId="guardian_activity_test", reasons=[])

    async def validate_lesson_plan(self, payload: object) -> GuardianOutcome:
        return GuardianOutcome(accepted=True, validationId="guardian_plan_test", reasons=[])

    async def validate_coaching_artifact(self, payload: object) -> GuardianOutcome:
        return GuardianOutcome(accepted=True, validationId="guardian_coach_test", reasons=[])

    async def validate_replan(self, payload: object) -> GuardianOutcome:
        return GuardianOutcome(accepted=True, validationId="guardian_replan_test", reasons=[])


class UnavailableGoogleAdapter:
    provider_name = "google"

    async def generate(self, request: ProviderBatchRequest) -> ProviderBatchItemResult:
        response = httpx.Response(
            503,
            json={"error": {"message": "high demand"}},
            request=httpx.Request("POST", "https://generativelanguage.googleapis.com/v1beta/models/test"),
        )
        raise httpx.HTTPStatusError("provider unavailable", request=response.request, response=response)


class FlakyGoogleAdapter:
    provider_name = "google"

    def __init__(self) -> None:
        self.requests: list[ProviderBatchRequest] = []

    async def generate(self, request: ProviderBatchRequest) -> ProviderBatchItemResult:
        self.requests.append(request)
        if len(self.requests) == 1:
            response = httpx.Response(
                503,
                json={"error": {"message": "high demand"}},
                request=httpx.Request(
                    "POST", "https://generativelanguage.googleapis.com/v1beta/models/test"
                ),
            )
            raise httpx.HTTPStatusError(
                "provider unavailable", request=response.request, response=response
            )
        return await SuccessfulOpenAIAdapter().generate(request)


class SuccessfulOpenAIAdapter:
    provider_name = "openai"

    def __init__(self) -> None:
        self.requests: list[ProviderBatchRequest] = []

    async def generate(self, request: ProviderBatchRequest) -> ProviderBatchItemResult:
        self.requests.append(request)
        if request.agent_name == "content-transform-agent":
            return ProviderBatchItemResult(
                custom_id=request.custom_id,
                status="completed",
                output_text=None,
                output_json={
                    "cards": [
                        {
                            "cardType": "comparison",
                            "parentCardId": "card_parent_1",
                            "transformationKind": "change_card_type",
                            "conceptIds": ["concept_1"],
                            "anchoredCkgNodeIds": ["concept_1"],
                            "anchoredPkgNodeIds": ["node_123456789012345678901"],
                            "content": {
                                "front": "Compare Concept One with nearby ideas.",
                                "back": "Concept One differs in mechanism and use.",
                                "items": [
                                    {
                                        "label": "Concept One",
                                        "attributes": {
                                            "role": "target",
                                            "mechanism": "primary mechanism",
                                        },
                                    },
                                    {
                                        "label": "Concept Two",
                                        "attributes": {
                                            "role": "contrast",
                                            "mechanism": "different mechanism",
                                        },
                                    },
                                ],
                                "comparisonCriteria": ["role", "mechanism"],
                            },
                            "tags": ["generated", "comparison"],
                            "difficulty": "intermediate",
                            "factualityScore": 0.9,
                            "rationale": "Transforms the parent card into a comparison format.",
                        }
                    ]
                },
                raw_response={},
                usage=None,
                error=None,
            )
        return ProviderBatchItemResult(
            custom_id=request.custom_id,
            status="completed",
            output_text=None,
            output_json={
                "cards": [
                    {
                        "cardType": "explanation",
                        "originMode": "agent_autonomous",
                        "anchoredCkgNodeIds": ["concept_1"],
                        "conceptIds": ["concept_1"],
                        "sourceDocumentIds": [],
                        "sources": [],
                        "factualityScore": 0.9,
                        "content": {
                            "front": "What is Concept One?",
                            "back": "Concept One is explained from the supplied context.",
                        },
                        "tags": ["generated"],
                        "difficulty": "intermediate",
                        "rationale": "Fallback generated content.",
                    }
                ],
                "activityVariants": [],
                "groundingReport": {},
                "coveragePlan": {},
            },
            raw_response={},
            usage=None,
            error=None,
        )


class IncompleteOpenAIAdapter:
    provider_name = "openai"

    async def generate(self, request: ProviderBatchRequest) -> ProviderBatchItemResult:
        if request.agent_name == "content-transform-agent":
            return ProviderBatchItemResult(
                custom_id=request.custom_id,
                status="completed",
                output_text="Model returned partial transform text only.",
                output_json=None,
                raw_response={"note": "missing transformed card array"},
                usage=None,
                error=None,
            )
        return ProviderBatchItemResult(
            custom_id=request.custom_id,
            status="completed",
            output_text="Partial provider text without usable JSON.",
            output_json=None,
            raw_response={"note": "missing structured result"},
            usage=None,
            error=None,
        )


class ExplodingRuntime:
    async def run(self, agent_name: str, request: AgentRunRequest) -> dict[str, object]:
        raise RuntimeError("simulated agent failure")


class ProviderUnavailableRuntime:
    async def run(self, agent_name: str, request: AgentRunRequest) -> dict[str, object]:
        response = httpx.Response(
            503,
            json={
                "error": {
                    "message": "This model is currently experiencing high demand.",
                }
            },
            request=httpx.Request("POST", "https://generativelanguage.googleapis.com/v1beta/models/test"),
        )
        raise httpx.HTTPStatusError("provider unavailable", request=response.request, response=response)


def exploding_runtime() -> ExplodingRuntime:
    return ExplodingRuntime()


def provider_unavailable_runtime() -> ProviderUnavailableRuntime:
    return ProviderUnavailableRuntime()


class UserFacingErrorRuntime:
    async def run(self, agent_name: str, request: AgentRunRequest) -> dict[str, object]:
        raise UserFacingAgentError(
            message="We couldn't generate content right now because the AI service is unavailable. Please try again in a moment.",
            reason_code="content_generation_provider_unavailable",
            detail="Provider 'google' returned HTTP 503.",
            retryable=True,
            status_code=503,
        )


def user_facing_error_runtime() -> UserFacingErrorRuntime:
    return UserFacingErrorRuntime()


@pytest.fixture
async def sqlite_batch_store() -> TemporarySQLiteBatchJobStore:
    store = TemporarySQLiteBatchJobStore()
    await store.initialize()
    return store


def test_agent_app_adds_cors_headers_to_unhandled_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(agents_app_module, "agent_runtime", exploding_runtime)
    client = TestClient(agents_app_module.app, raise_server_exceptions=False)

    response = client.post(
        "/v1/agents/content-creator-agent/run",
        headers={"Origin": "http://localhost:3000"},
        json={
            "userId": "user_1",
            "conceptIds": ["concept_1"],
            "executionPreference": "realtime",
        },
    )

    assert response.status_code == 500
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_agent_app_maps_provider_http_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(agents_app_module, "agent_runtime", provider_unavailable_runtime)
    client = TestClient(agents_app_module.app, raise_server_exceptions=False)

    response = client.post(
        "/v1/agents/content-creator-agent/run",
        headers={"Origin": "http://localhost:3000"},
        json={
            "userId": "user_1",
            "conceptIds": ["concept_1"],
            "executionPreference": "realtime",
        },
    )

    assert response.status_code == 503
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "high demand" in response.json()["detail"]


def test_agent_app_maps_user_facing_generation_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(agents_app_module, "agent_runtime", user_facing_error_runtime)
    client = TestClient(agents_app_module.app, raise_server_exceptions=False)

    response = client.post(
        "/v1/agents/content-creator-agent/run",
        headers={"Origin": "http://localhost:3000"},
        json={
            "userId": "user_1",
            "conceptIds": ["concept_1"],
            "executionPreference": "realtime",
        },
    )

    assert response.status_code == 503
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    body = response.json()["detail"]
    assert body["message"] == "We couldn't generate content right now because the AI service is unavailable. Please try again in a moment."
    assert body["reasonCode"] == "content_generation_provider_unavailable"
    assert body["retryable"] is True


@pytest.mark.asyncio
async def test_runtime_lists_wrappers_with_tool_belts() -> None:
    runtime = AgentRuntime(CompositeToolRegistry(FakeInvoker()), AcceptingGuardian())

    wrappers = runtime.list_wrappers()

    assert any(wrapper["name"] == "ingestion-concept-extraction-agent" for wrapper in wrappers)
    assert any(wrapper["name"] == "content-creation-orchestrator" for wrapper in wrappers)
    assert any(wrapper["name"] == "content-creator-agent" for wrapper in wrappers)
    assert any(wrapper["toolBelt"]["id"] == "lesson-plan-belt" for wrapper in wrappers)


@pytest.mark.asyncio
async def test_content_creation_orchestrator_finalizes_preflight_before_creator(
    sqlite_batch_store: TemporarySQLiteBatchJobStore,
) -> None:
    runtime = AgentRuntime(
        CompositeToolRegistry(FakeInvoker()),
        AcceptingGuardian(),
        batch_store=sqlite_batch_store,
        llm_router=LLMRouter(
            batch_store=sqlite_batch_store,
            batch_adapters={},
            realtime_adapters={"google": SuccessfulOpenAIAdapter()},
        ),
    )

    result = await runtime.run(
        "content-creation-orchestrator",
        AgentRunRequest.model_validate(
            {
                "userId": "user_content_schema_demo_0001",
                "conceptIds": ["Bayes theorem"],
                "desiredCardTypes": ["explanation"],
                "studyMode": "knowledge_gaining",
                "executionPreference": "realtime",
                "operationName": "authoring_assistance",
                "payload": {
                    "operationName": "authoring_assistance",
                    "mode": "agent_autonomous",
                    "sourcePolicy": "autonomous_allowed",
                    "desiredActivityTypes": ["explanation"],
                },
            }
        ),
    )

    execution = result["execution"]
    prompt = execution["contentCreationPrompt"]
    preflight = execution["preflightArtifacts"]

    assert execution["mode"] == "content_creation_orchestrator"
    assert result["prompt"]["operationName"] == "authoring_assistance"
    assert result["prompt"]["promptProfileVersion"] == "content-operation-profile.v1"
    assert result["prompt"]["promptBuilderId"] == "content-creation-orchestrator.authoring_assistance.v1"
    assert result["prompt"]["outputSchemaId"] == "content_creator_result.v1"
    assert prompt["pedagogicalContext"]["generationIntent"]["operationName"] == "authoring_assistance"
    assert prompt["schemaVersion"] == "content_creation_prompt.v2"
    assert prompt["pedagogicalContext"]["uncertainties"] == []
    assert prompt["serviceContract"]["identityMap"]["concepts"][0]["pkgNodeId"].startswith("node_")
    assert prompt["serviceContract"]["identityMap"]["concepts"][0]["ckgNodeId"].startswith("node_")
    assert prompt["pedagogicalContext"]["targetConcepts"][0]["learnerFacingSummary"]
    assert set(prompt["pedagogicalContext"]["conceptRelations"]) == {
        "prerequisitesByConceptRef",
        "relatedConceptsByConceptRef",
        "contrastsByConceptRef",
        "confusablesByConceptRef",
        "misconceptionLinksByConceptRef",
    }
    graph_entries = [
        entry for entry in prompt["populationReport"]["deterministicPrefetch"]
        if entry["fieldPath"] in {"pedagogicalContext.targetConcepts", "pedagogicalContext.conceptRelations", "serviceContract.identityMap"}
    ]
    assert len(graph_entries) == 3
    assert all(entry["source"] == "graph-intervention-orchestrator" for entry in graph_entries)
    assert all(entry["toolOrFunction"] == "GraphAgentPromptV1 -> ContentCreationPromptV2 mapper" for entry in graph_entries)
    assert preflight["graphReadiness"]["status"] == "finalized"
    assert preflight["intent"]["status"] == "finalized"
    assert preflight["learnerStateSummary"]["status"] == "finalized"
    assert preflight["pedagogyPlan"]["status"] == "finalized"


@pytest.mark.asyncio
async def test_graph_intervention_orchestrator_builds_prompt_and_ckg_edge_shape() -> None:
    runtime = AgentRuntime(CompositeToolRegistry(FakeInvoker()), AcceptingGuardian())

    result = await runtime.run(
        "graph-intervention-orchestrator",
        AgentRunRequest.model_validate(
            {
                "userId": "user_graph_agent_demo",
                "conceptIds": ["concept_1"],
                "studyMode": "knowledge_gaining",
                "executionPreference": "realtime",
                "payload": {
                    "proposalType": "content_readiness",
                    "domain": "statistics",
                },
            }
        ),
    )

    readiness = result["execution"]["result"]
    prompt = readiness["graphPrompt"]

    assert readiness["status"] == "finalized"
    assert prompt["schemaVersion"] == "graph_agent_prompt.v1"
    assert prompt["pedagogicalContext"]["targetConcepts"][0]["label"] == "Concept One"
    assert prompt["serviceContract"]["identityMap"]["concepts"][0]["pkgNodeId"].startswith("node_")
    assert prompt["serviceContract"]["identityMap"]["concepts"][0]["ckgNodeId"].startswith("node_")
    for operation in prompt["serviceContract"]["ckgMutationPlan"]["operations"]:
        assert "fromNodeId" not in operation
        assert "toNodeId" not in operation
        assert "sourceNodeId" in operation
        assert "targetNodeId" in operation


@pytest.mark.asyncio
async def test_content_creator_prompt_is_prefetched_from_services(
    sqlite_batch_store: TemporarySQLiteBatchJobStore,
) -> None:
    runtime = AgentRuntime(
        CompositeToolRegistry(FakeInvoker()),
        AcceptingGuardian(),
        batch_store=sqlite_batch_store,
        llm_router=LLMRouter(
            batch_store=sqlite_batch_store,
            batch_adapters={},
            realtime_adapters={"google": SuccessfulOpenAIAdapter()},
        ),
    )

    result = await runtime.run(
        "content-creator-agent",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "conceptIds": ["Bayes theorem"],
                "documentIds": ["doc_1"],
                "studyMode": "knowledge_gaining",
                "executionPreference": "realtime",
                "operationName": "source_derived_generation",
                "payload": {
                    "operationName": "source_derived_generation",
                    "mode": "agent_autonomous",
                    "desiredActivityTypes": ["explanation"],
                },
            }
        ),
    )

    slots = result["prompt"]["slots"]
    manifest = slots["serviceInputManifest"]
    assert slots["prefetch"]["strategy"] == "orchestrated_preflight_before_model_call"
    assert slots["prefetch"]["compositeTool"] == "get-content-creator-brief"
    assert result["prompt"]["operationName"] == "source_derived_generation"
    assert result["prompt"]["promptBuilderId"] == "content-creator-agent.source_derived_generation.v1"
    assert slots["promptRouting"]["operationName"] == "source_derived_generation"
    assert any(item["service"] == "content-service" and item["tool"] == "query-cards" for item in manifest)
    assert any(item["service"] == "vector-service" for item in manifest)
    assert not any(item["service"] == "knowledge-graph-service" for item in manifest)
    content_prompt = slots["contentCreationPrompt"]
    assert content_prompt["serviceContract"]["identityMap"]["concepts"][0]["ckgNodeId"].startswith("node_")
    assert content_prompt["populationReport"]["deterministicPrefetch"]
    graph_entries = [
        entry for entry in content_prompt["populationReport"]["deterministicPrefetch"]
        if entry["fieldPath"] in {"pedagogicalContext.targetConcepts", "pedagogicalContext.conceptRelations", "serviceContract.identityMap"}
    ]
    assert graph_entries
    assert all(entry["source"] == "graph-intervention-orchestrator" for entry in graph_entries)
    assert all(entry["toolOrFunction"] == "GraphAgentPromptV1 -> ContentCreationPromptV2 mapper" for entry in graph_entries)
    instructions = " ".join(result["prompt"]["systemInstructions"]).lower()
    assert "before drafting anything, inspect the full input" in instructions
    assert "pedagogicalcontext is for reasoning and decisions" in instructions
    assert "servicecontract is only for ids" in instructions
    assert "resolve conflicts in this order" in instructions
    assert "if source evidence is missing or weak, narrow the claim" in instructions
    assert "avoid these failure modes" in instructions
    assert result["execution"]["mode"] == "content_creation_orchestrator"
    assert result["execution"]["operationName"] == "source_derived_generation"
    assert result["execution"]["result"]["cards"]


@pytest.mark.asyncio
async def test_content_creator_returns_graph_confirmation_when_graph_readiness_is_blocked() -> None:
    runtime = AgentRuntime(CompositeToolRegistry(FakeInvoker()), AcceptingGuardian())

    result = await runtime.run(
        "content-creation-orchestrator",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "conceptIds": ["Unmapped concept"],
                "studyMode": "knowledge_gaining",
                "executionPreference": "realtime",
                "payload": {"mode": "agent_autonomous"},
            }
        )
    )

    execution = result["execution"]
    assert execution["mode"] == "content_creation_orchestrator"
    assert execution["result"]["status"] == "awaiting_graph_confirmation"
    assert execution["result"]["graphGeneration"]["pkgWritePlan"]["requiresUserConfirmation"] is True
    assert execution["result"]["graphGeneration"]["pkgWritePlan"]["operations"]
    assert execution["result"]["graphGeneration"]["confirmationTool"]["tool"] == "confirm-pkg-write-plan"


@pytest.mark.asyncio
async def test_content_creation_orchestrator_uses_selected_pkg_node_after_confirmation(
    sqlite_batch_store: TemporarySQLiteBatchJobStore,
) -> None:
    runtime = AgentRuntime(
        CompositeToolRegistry(FakeInvoker()),
        AcceptingGuardian(),
        batch_store=sqlite_batch_store,
        llm_router=LLMRouter(
            batch_store=sqlite_batch_store,
            batch_adapters={},
            realtime_adapters={"google": SuccessfulOpenAIAdapter()},
        ),
    )

    result = await runtime.run(
        "content-creation-orchestrator",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "conceptIds": ["Unmapped concept"],
                "selectedNodeIds": ["node_confirmed_graph_anchor_0001"],
                "desiredCardTypes": ["explanation"],
                "studyMode": "knowledge_gaining",
                "executionPreference": "realtime",
                "payload": {
                    "mode": "agent_autonomous",
                    "sourcePolicy": "autonomous_allowed",
                    "desiredActivityTypes": ["explanation"],
                },
            }
        ),
    )

    execution = result["execution"]
    assert execution["preflightArtifacts"]["graphReadiness"]["status"] == "finalized"
    concept_identity = execution["contentCreationPrompt"]["serviceContract"]["identityMap"]["concepts"][0]
    assert concept_identity["pkgNodeId"] == "node_confirmed_graph_anchor_0001"
    assert "status" not in execution["result"] or execution["result"]["status"] != "awaiting_graph_confirmation"
    assert (
        execution["result"].get("cards")
        or execution["result"].get("graphProposals")
    )

@pytest.mark.asyncio
async def test_content_creator_realtime_falls_back_when_primary_provider_is_unavailable(
    sqlite_batch_store: TemporarySQLiteBatchJobStore,
) -> None:
    google_adapter = FlakyGoogleAdapter()
    runtime = AgentRuntime(
        CompositeToolRegistry(FakeInvoker()),
        AcceptingGuardian(),
        batch_store=sqlite_batch_store,
        llm_router=LLMRouter(
            batch_store=sqlite_batch_store,
            batch_adapters={},
            realtime_adapters={
                "google": google_adapter,
            },
        ),
    )

    result = await runtime.run(
        "content-creator-agent",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "conceptIds": ["Bayes theorem"],
                "studyMode": "knowledge_gaining",
                "executionPreference": "realtime",
                "payload": {"mode": "agent_autonomous"},
            }
        ),
    )

    assert result["execution"]["result"]["cards"]
    assert len(google_adapter.requests) == 2
    assert google_adapter.requests[1].provider == "google"
    assert google_adapter.requests[1].model == "gemini-2.5-pro"
    assert google_adapter.requests[1].metadata["fallbackFromProvider"] == "google"


@pytest.mark.asyncio
async def test_content_creator_realtime_fails_loudly_when_model_output_is_incomplete(
    sqlite_batch_store: TemporarySQLiteBatchJobStore,
) -> None:
    runtime = AgentRuntime(
        CompositeToolRegistry(FakeInvoker()),
        AcceptingGuardian(),
        batch_store=sqlite_batch_store,
        llm_router=LLMRouter(
            batch_store=sqlite_batch_store,
            batch_adapters={},
            realtime_adapters={
                "google": IncompleteOpenAIAdapter(),
            },
        ),
    )

    with pytest.raises(UserFacingAgentError) as error:
        await runtime.run(
            "content-creator-agent",
            AgentRunRequest.model_validate(
                {
                    "userId": "user_1",
                    "conceptIds": ["Bayes theorem"],
                    "studyMode": "knowledge_gaining",
                    "executionPreference": "realtime",
                    "payload": {"mode": "agent_autonomous"},
                }
            ),
        )

    assert error.value.status_code == 502
    assert error.value.payload["reasonCode"] == "content_generation_incomplete_result"
    assert error.value.payload["message"] == "We couldn't generate content for this concept just now. The model responded, but the result was incomplete. Please try again."


@pytest.mark.asyncio
async def test_content_creator_realtime_fails_loudly_when_not_configured() -> None:
    runtime = AgentRuntime(CompositeToolRegistry(FakeInvoker()), AcceptingGuardian())

    with pytest.raises(UserFacingAgentError) as error:
        await runtime.run(
            "content-creator-agent",
            AgentRunRequest.model_validate(
                {
                    "userId": "user_1",
                    "conceptIds": ["Bayes theorem"],
                    "studyMode": "knowledge_gaining",
                    "executionPreference": "realtime",
                    "payload": {"mode": "agent_autonomous"},
                }
            ),
        )

    assert error.value.status_code == 500
    assert error.value.payload["reasonCode"] == "content_generation_not_configured"
    assert error.value.payload["retryable"] is False


@pytest.mark.asyncio
async def test_ingestion_extraction_prompt_is_prefetched_from_services() -> None:
    runtime = AgentRuntime(CompositeToolRegistry(FakeInvoker()), AcceptingGuardian())

    result = await runtime.run(
        "ingestion-concept-extraction-agent",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "documentIds": ["doc_1"],
                "studyMode": "knowledge_gaining",
                "executionPreference": "realtime",
                "payload": {
                    "documentId": "doc_1",
                    "intent": "both",
                    "document": {"id": "doc_1", "title": "Source One"},
                    "ir": {
                        "documentId": "doc_1",
                        "blocks": [
                            {
                                "id": "block_1",
                                "kind": "paragraph",
                                "text": "Bayes theorem updates probabilities using evidence.",
                                "metadata": {"headingPath": ["Bayes Theorem"]},
                            }
                        ],
                        "outline": [],
                    },
                    "chunks": [
                        {
                            "id": "chunk_1",
                            "documentId": "doc_1",
                            "text": "Bayes theorem updates probabilities using evidence.",
                            "headingPath": ["Bayes Theorem"],
                            "metadata": {},
                        }
                    ],
                    "scanWindows": [
                        {
                            "windowId": "window_0",
                            "ordinal": 0,
                            "text": "[Section: Bayes Theorem]\nBayes theorem updates probabilities using evidence.",
                            "headingPath": ["Bayes Theorem"],
                            "blockIds": ["block_1"],
                            "chunkIds": ["chunk_1"],
                            "metadata": {},
                        }
                    ],
                },
            }
        ),
    )

    slots = result["prompt"]["slots"]
    manifest = slots["serviceInputManifest"]
    assert slots["prefetch"]["strategy"] == "context_stuffed_before_model_call"
    assert slots["prefetch"]["compositeTool"] == "get-ingestion-concept-extraction-brief"
    assert any(item["service"] == "ingestion-service" and item["tool"] == "get-document-ir" for item in manifest)
    assert any(section["key"] == "documentScanWindows" for section in slots["contextSections"])
    assert result["execution"]["mode"] == "ingestion_concept_extraction"
    assert result["execution"]["result"]["conceptCandidates"]
    assert result["execution"]["result"]["mappingSuggestions"]


@pytest.mark.asyncio
async def test_runtime_prepares_preview_agent_with_prompt_slots() -> None:
    store = TemporarySQLiteBatchJobStore()
    await store.initialize()
    runtime = AgentRuntime(
        CompositeToolRegistry(FakeInvoker()),
        AcceptingGuardian(),
        batch_store=store,
        llm_router=LLMRouter(batch_store=store, batch_adapters={}),
    )

    result = await runtime.run(
        "cognitive-copilot",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "sessionId": "session_1",
                "curriculumId": "curr_1",
            }
        ),
    )

    assert result["agent"]["name"] == "cognitive-copilot"
    assert result["execution"]["mode"] == "batch_submission"
    assert result["preflight"]["riskLevel"] == "low"
    assert result["preflight"]["requiresReview"] is False
    assert result["executionPlan"]["strategy"] == "batch"
    assert result["prompt"]["templateId"] == "cognitive-copilot.v1"
    assert result["prompt"]["slots"]["prefetch"]["compositeTool"] == "get-cognitive-copilot-context"
    assert result["contextPack"]["sections"]
    assert result["prompt"]["slots"]["serviceInputManifest"]
    assert result["status"] == "queued"
    assert result["jobId"] is not None


@pytest.mark.asyncio
async def test_calibration_coach_prefetches_structured_tools_and_validates_output() -> None:
    runtime = AgentRuntime(CompositeToolRegistry(FakeInvoker()), AcceptingGuardian())

    result = await runtime.run(
        "calibration-coach",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "sessionId": "session_1",
                "stepId": "step_1",
                "conceptIds": ["concept_1"],
                "studyMode": "knowledge_gaining",
                "executionPreference": "realtime",
            }
        ),
    )

    slots = result["prompt"]["slots"]
    assert slots["prefetch"]["compositeTool"] == "get-calibration-context"
    assert any(item["tool"] == "get-evaluation-by-step" for item in slots["serviceInputManifest"])
    assert any(tool["name"] == "pedagogy_guardian__validate_coaching_artifact" for tool in slots["providerTools"])
    reflection = result["execution"]["result"]
    assert reflection["guardianValidationId"] == "guardian_coach_test"
    assert reflection["reviewRouting"]["surface"] == "post-step-reflection"
    assert reflection["provenance"]["contextManifest"]


@pytest.mark.asyncio
async def test_mental_debugger_prefetches_structured_tools_and_preserves_authority() -> None:
    runtime = AgentRuntime(CompositeToolRegistry(FakeInvoker()), AcceptingGuardian())

    result = await runtime.run(
        "mental-debugger",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "sessionId": "session_1",
                "stepId": "step_1",
                "conceptIds": ["concept_1"],
                "studyMode": "knowledge_gaining",
                "executionPreference": "realtime",
                "payload": {"userIntent": {"depth": "brief"}},
            }
        ),
    )

    slots = result["prompt"]["slots"]
    assert slots["prefetch"]["compositeTool"] == "get-mental-debugger-context"
    assert any(item["tool"] == "get-evaluation-by-step" for item in slots["serviceInputManifest"])
    assert any(tool["name"] == "pedagogy_guardian__validate_coaching_artifact" for tool in slots["providerTools"])
    assert not any(tool["tool"] == "answer-step" for tool in slots["providerTools"])
    reflection = result["execution"]["result"]
    assert reflection["artifactKind"] == "debugger_reflection"
    assert reflection["guardianValidationId"] == "guardian_coach_test"
    assert reflection["reviewRouting"]["hideInternalToolCalls"] is True


class MissingStepEvidenceInvoker(FakeInvoker):
    async def execute(
        self,
        service: str,
        tool: str,
        payload: dict[str, object],
        *,
        user_id: str | None = None,
    ) -> dict[str, object]:
        if (service, tool) == ("session", "get-step-evidence-record"):
            self.calls.append((service, tool, payload, user_id))
            return {
                "stepId": "step_1",
                "stepObjectiveText": "",
                "learnerAnswerSummaryText": "",
                "evidenceCompleteness": {"state": "missing_required", "missingRequiredFields": ["stepObjectiveText"]},
            }
        return await super().execute(service, tool, payload, user_id=user_id)


@pytest.mark.asyncio
async def test_learner_facing_readiness_blocks_when_step_evidence_is_missing() -> None:
    runtime = AgentRuntime(CompositeToolRegistry(MissingStepEvidenceInvoker()), AcceptingGuardian())

    with pytest.raises(UserFacingAgentError) as exc:
        await runtime.run(
            "mental-debugger",
            AgentRunRequest.model_validate(
                {
                    "userId": "user_1",
                    "sessionId": "session_1",
                    "stepId": "step_1",
                    "conceptIds": ["concept_1"],
                    "studyMode": "knowledge_gaining",
                    "executionPreference": "realtime",
                }
            ),
        )

    assert exc.value.payload["reasonCode"] == "deferred_missing_deterministic_context"
    assert "Step evidence record reports missing required fields" in exc.value.payload["detail"]


@pytest.mark.asyncio
async def test_learner_facing_readiness_blocks_when_watchtower_hides_trace_detail() -> None:
    runtime = AgentRuntime(CompositeToolRegistry(FakeInvoker()), AcceptingGuardian())

    with pytest.raises(UserFacingAgentError) as exc:
        await runtime.run(
            "mental-debugger",
            AgentRunRequest.model_validate(
                {
                    "userId": "user_1",
                    "sessionId": "session_1",
                    "stepId": "step_1",
                    "conceptIds": ["concept_1"],
                    "studyMode": "knowledge_gaining",
                    "executionPreference": "realtime",
                    "payload": {"requestedDataClasses": ["raw_trace"]},
                }
            ),
        )

    assert exc.value.payload["reasonCode"] == "hidden_by_policy"
    assert "traceEvidencePack" in exc.value.payload["detail"]


@pytest.mark.asyncio
async def test_mental_debugger_readiness_runs_patch_and_strategy_before_agent() -> None:
    runtime = AgentRuntime(CompositeToolRegistry(FakeInvoker()), AcceptingGuardian())

    result = await runtime.run(
        "mental-debugger",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "sessionId": "session_1",
                "stepId": "step_1",
                "conceptIds": ["concept_1"],
                "studyMode": "knowledge_gaining",
                "executionPreference": "realtime",
            }
        ),
    )

    section_keys = {section["key"] for section in result["contextPack"]["sections"]}
    readiness = result["contextPack"]["agentInputReadinessReport"]
    prerequisite_fields = {field["fieldName"] for field in readiness["prerequisiteAgentFields"]}
    assert "patchPlannerHandoffContext" in section_keys
    assert "strategyHandoffContext" in section_keys
    assert {"patchPlannerHandoffContext", "strategyHandoffContext"} <= prerequisite_fields


@pytest.mark.asyncio
async def test_learner_facing_readiness_gate_is_shared_by_batch_and_realtime(
    sqlite_batch_store: TemporarySQLiteBatchJobStore,
) -> None:
    runtime = AgentRuntime(
        CompositeToolRegistry(FakeInvoker()),
        AcceptingGuardian(),
        batch_store=sqlite_batch_store,
        llm_router=LLMRouter(batch_store=sqlite_batch_store, batch_adapters={}),
    )
    base_request = {
        "userId": "user_1",
        "sessionId": "session_1",
        "stepId": "step_1",
        "conceptIds": ["concept_1"],
        "studyMode": "knowledge_gaining",
        "payload": {"requestedDataClasses": ["raw_trace"]},
    }

    with pytest.raises(UserFacingAgentError) as realtime_exc:
        await runtime.run(
            "mental-debugger",
            AgentRunRequest.model_validate({**base_request, "executionPreference": "realtime"}),
        )
    with pytest.raises(UserFacingAgentError) as batch_exc:
        await runtime.run(
            "mental-debugger",
            AgentRunRequest.model_validate({**base_request, "executionPreference": "batch"}),
        )

    assert realtime_exc.value.payload["reasonCode"] == batch_exc.value.payload["reasonCode"] == "hidden_by_policy"


@pytest.mark.asyncio
async def test_patch_planner_prefetches_tools_and_returns_review_routed_proposal() -> None:
    runtime = AgentRuntime(CompositeToolRegistry(FakeInvoker()), AcceptingGuardian())

    result = await runtime.run(
        "patch-planner-remediation-agent",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "sessionId": "session_1",
                "stepId": "step_1",
                "conceptIds": ["concept_1"],
                "studyMode": "knowledge_gaining",
                "executionPreference": "realtime",
                "payload": {"triggerType": "cue_mismatch"},
            }
        ),
    )

    slots = result["prompt"]["slots"]
    assert slots["prefetch"]["compositeTool"] == "get-patch-planner-context"
    assert any(tool["name"] == "pedagogy_guardian__validate_replan" for tool in slots["providerTools"])
    assert not any(tool["tool"] == "create-lesson-plan" for tool in slots["providerTools"])
    proposal = result["execution"]["result"]
    assert proposal["artifactKind"] == "repair_proposal"
    assert proposal["proposals"][0]["ownerService"] == "session-service"
    assert proposal["reviewRouting"]["surface"] == "session-plan-review"


@pytest.mark.asyncio
async def test_strategy_replanning_prefetches_tools_and_returns_session_replan() -> None:
    runtime = AgentRuntime(CompositeToolRegistry(FakeInvoker()), AcceptingGuardian())

    result = await runtime.run(
        "strategy-replanning-agent",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "sessionId": "session_1",
                "stepId": "step_1",
                "conceptIds": ["concept_1"],
                "studyMode": "knowledge_gaining",
                "executionPreference": "realtime",
                "payload": {"trigger": {"type": "prerequisite_gap"}, "patchProposal": {"scope": "local_step"}},
            }
        ),
    )

    slots = result["prompt"]["slots"]
    assert slots["prefetch"]["compositeTool"] == "get-strategy-replanning-context"
    assert any(item["tool"] == "get-concept-node" for item in slots["serviceInputManifest"])
    assert any(tool["name"] == "pedagogy_guardian__validate_replan" for tool in slots["providerTools"])
    assert not any(tool["tool"] == "answer-step" for tool in slots["providerTools"])
    replan = result["execution"]["result"]
    assert replan["artifactKind"] == "strategy_replan_proposal"
    assert replan["guardianValidationId"] == "guardian_replan_test"
    assert replan["changes"][0]["ownerService"] == "session-service"
    assert replan["reviewRouting"]["hideInternalToolCalls"] is True


@pytest.mark.asyncio
async def test_cognitive_copilot_realtime_prefetches_validated_sidebar_readout() -> None:
    runtime = AgentRuntime(CompositeToolRegistry(FakeInvoker()), AcceptingGuardian())

    result = await runtime.run(
        "cognitive-copilot",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "sessionId": "session_1",
                "curriculumId": "curr_1",
                "stepId": "step_1",
                "conceptIds": ["concept_1"],
                "executionPreference": "realtime",
                "payload": {"surface": "sidebar", "agentHints": [{"summary": "Repair is available"}]},
            }
        ),
    )

    slots = result["prompt"]["slots"]
    assert slots["prefetch"]["compositeTool"] == "get-cognitive-copilot-context"
    assert any(section["key"] == "agentHints" for section in slots["contextSections"])
    assert any(tool["name"] == "pedagogy_guardian__validate_coaching_artifact" for tool in slots["providerTools"])
    assert not any(tool["tool"] == "complete-session" for tool in slots["providerTools"])
    readout = result["execution"]["result"]
    assert readout["artifactKind"] == "copilot_readout"
    assert readout["guardianValidationId"] == "guardian_coach_test"
    assert readout["reviewRouting"]["surface"] == "cognitive-copilot-sidebar"
    assert readout["reviewRouting"]["hideInternalToolCalls"] is True


@pytest.mark.asyncio
async def test_watchtower_runtime_uses_policy_context_and_filtered_tools() -> None:
    runtime = AgentRuntime(CompositeToolRegistry(FakeInvoker()), AcceptingGuardian())

    result = await runtime.run(
        "watchtower-governance-layer",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "sessionId": "session_1",
                "stepId": "step_1",
                "executionPreference": "realtime",
                "payload": {
                    "surface": "copilot",
                    "proposedAction": {"requestedDataClasses": ["raw_trace"]},
                    "policyContext": {"privacyPolicyVersion": "wt.v1"},
                },
            }
        ),
    )

    slots = result["prompt"]["slots"]
    assert slots["prefetch"]["compositeTool"] == "get-watchtower-governance-context"
    assert any(section["key"] == "policyConstraints" for section in slots["contextSections"])
    assert any(tool["name"] == "pedagogy_guardian__validate_coaching_artifact" for tool in slots["providerTools"])
    assert not any(tool["tool"] == "propose-mutation" for tool in slots["providerTools"])
    decision = result["execution"]["result"]
    assert decision["artifactKind"] == "governance_decision"
    assert decision["state"] == "hidden_by_policy"
    assert decision["reviewRouting"]["surface"] == "governance-dashboard"


@pytest.mark.asyncio
async def test_mode_preference_runtime_keeps_choice_inside_candidates() -> None:
    runtime = AgentRuntime(CompositeToolRegistry(FakeInvoker()), AcceptingGuardian())

    result = await runtime.run(
        "mode-preference-helper",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "sessionId": "session_1",
                "conceptIds": ["concept_1"],
                "executionPreference": "realtime",
                "payload": {
                    "candidateModes": ["recall", "comparison"],
                    "deterministicFallback": "recall",
                    "recentModes": ["recall"],
                },
            }
        ),
    )

    slots = result["prompt"]["slots"]
    assert slots["prefetch"]["compositeTool"] == "get-mode-preference-context"
    assert any(section["key"] == "candidateModes" for section in slots["contextSections"])
    assert not any(tool["tool"] == "answer-step" for tool in slots["providerTools"])
    choice = result["execution"]["result"]
    assert choice["artifactKind"] == "mode_preference_choice"
    assert choice["selectedMode"] == "comparison"


@pytest.mark.asyncio
async def test_taxonomy_curator_runtime_routes_proposal_to_workbench() -> None:
    runtime = AgentRuntime(CompositeToolRegistry(FakeInvoker()), AcceptingGuardian())

    result = await runtime.run(
        "taxonomy-curator",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "stepId": "step_1",
                "conceptIds": ["concept_1"],
                "executionPreference": "realtime",
                "payload": {
                    "taxonomyDomain": "misconception",
                    "labelIds": ["boundary_confusion", "category_confusion"],
                    "evidenceClusters": [{"id": "cluster_1", "count": 8}],
                    "taxonomySnapshot": {"version": "v1"},
                },
            }
        ),
    )

    slots = result["prompt"]["slots"]
    assert slots["prefetch"]["compositeTool"] == "get-taxonomy-curator-context"
    assert any(item["tool"] == "get-structural-health" for item in slots["serviceInputManifest"])
    assert not any(tool["tool"] == "propose-mutation" for tool in slots["providerTools"])
    proposal = result["execution"]["result"]
    assert proposal["artifactKind"] == "taxonomy_proposal"
    assert proposal["proposal"]["ownerService"] == "knowledge-graph-service"
    assert proposal["reviewRouting"]["surface"] == "taxonomy-workbench"


@pytest.mark.asyncio
async def test_pedagogy_guardian_wrapper_preserves_authority_boundary() -> None:
    runtime = AgentRuntime(CompositeToolRegistry(FakeInvoker()), AcceptingGuardian())

    result = await runtime.run(
        "pedagogy-guardian",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "executionPreference": "realtime",
                "payload": {
                    "artifactType": "coaching_artifact",
                    "producerService": "metacognition-service",
                    "producerAgent": "calibration-coach",
                    "artifact": {
                        "artifactId": "coach_1",
                        "learnerFacingText": "Your confidence was high, but the trace skipped a check step.",
                    },
                },
            }
        ),
    )

    validation = result["execution"]["result"]
    assert validation["decision"] == "accepted"
    assert validation["producerService"] == "metacognition-service"
    assert validation["validationId"] == "guardian_coach_test"
    assert validation["reviewRouting"]["hideInternalToolCalls"] is True


@pytest.mark.asyncio
async def test_graph_agent_prompt_is_prefetched_from_services() -> None:
    runtime = AgentRuntime(CompositeToolRegistry(FakeInvoker()), AcceptingGuardian())

    result = await runtime.run(
        "knowledge-graph-agent",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "conceptIds": ["concept_1"],
                "studyMode": "knowledge_gaining",
                "executionPreference": "realtime",
                "operationName": "anchor",
                "payload": {"domain": "statistics", "operationName": "anchor", "proposalType": "anchor"},
            }
        ),
    )

    prompt_slots = result["prompt"]["slots"]
    manifest = prompt_slots["serviceInputManifest"]
    assert prompt_slots["prefetch"]["compositeTool"] == "get-graph-proposal-context"
    assert result["prompt"]["operationName"] == "anchor"
    assert result["prompt"]["promptProfileVersion"] == "graph-operation-profile.v1"
    assert result["prompt"]["promptBuilderId"] == "knowledge-graph-agent.anchor.v1"
    assert result["prompt"]["outputSchemaId"] == "graph_proposals.v1"
    assert prompt_slots["promptRouting"]["operationName"] == "anchor"
    assert any(item["sourceService"] == "knowledge-graph-service" for item in manifest)
    assert any(item["sourceService"] == "metacognition-service" for item in manifest)
    graph_prompt = result["execution"]["graphReadiness"]["graphPrompt"]
    reasoning_rule = graph_prompt["instructions"]["reasoningRule"].lower()
    domain_rule = graph_prompt["instructions"]["domainAssignmentRule"].lower()
    domain_discovery_rule = graph_prompt["instructions"]["domainDiscoveryRule"].lower()
    edge_guidance = graph_prompt["instructions"]["edgeTypeGuidance"].lower()
    node_guidance = graph_prompt["instructions"]["nodeTypeGuidance"].lower()
    instructions = " ".join(result["prompt"]["systemInstructions"]).lower()
    assert "never derive graph semantics from ids" in reasoning_rule
    assert "do not default to 'general'" in domain_rule
    assert "actively infer plausible domain candidates" in domain_discovery_rule
    assert "not forced to choose only from the existing-domain list" in domain_discovery_rule
    assert "use related_to only as a last-resort fallback" in edge_guidance
    assert "use notion for general concepts" in node_guidance
    assert graph_prompt["pedagogicalContext"]["policyContext"]["existingDomains"]
    assert "before generating anything, inspect the full input" in instructions
    assert "optimize for this priority order" in instructions
    assert "read pedagogicalcontext.requestedoperation" in instructions
    assert "use servicecontract only for ids, mutation compatibility, routing, and idempotency" in instructions
    assert "if ambiguity is blocking, do not produce confident mutation proposals" in instructions
    assert "never emit fromnodeid/tonodeid" in instructions
    assert result["execution"]["result"]["proposals"][0]["operation"]["type"] == "add_node"


def test_graph_wrapper_instructions_are_explicit_about_prefetch_and_transport_boundaries() -> None:
    wrappers = _wrappers()
    orchestrator_instructions = " ".join(
        wrappers["graph-intervention-orchestrator"].instructions
    ).lower()
    graph_agent_instructions = " ".join(
        wrappers["knowledge-graph-agent"].instructions
    ).lower()

    assert "before finalizing readiness, inspect the full input" in orchestrator_instructions
    assert "populationreport distinguishes prefetched facts" in orchestrator_instructions
    assert "block unresolved identities and duplicate ambiguities" in orchestrator_instructions
    assert "before generating anything, inspect the full input" in graph_agent_instructions
    assert "read-before-write protocol" in graph_agent_instructions
    assert "optimize for this priority order" in graph_agent_instructions
    assert "never reason from ids" in graph_agent_instructions


@pytest.mark.asyncio
async def test_graph_expand_pkg_prompt_uses_scope_aware_operation_profile() -> None:
    runtime = AgentRuntime(CompositeToolRegistry(FakeInvoker()), AcceptingGuardian())

    result = await runtime.run(
        "knowledge-graph-agent",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "conceptIds": ["Bayes theorem"],
                "selectedNodeIds": ["node_bayestheoremdemo00001"],
                "graphExpansionScope": {
                    "scopeType": "node",
                    "nodeIds": ["node_bayestheoremdemo00001"],
                    "domain": "statistics",
                },
                "studyMode": "knowledge_gaining",
                "executionPreference": "realtime",
                "operationName": "expand_pkg",
                "payload": {
                    "domain": "statistics",
                    "operationName": "expand_pkg",
                    "proposalType": "expand_pkg",
                },
            }
        ),
    )

    assert result["prompt"]["operationName"] == "expand_pkg"
    assert result["prompt"]["promptBuilderId"] == "knowledge-graph-agent.expand_pkg.v1"
    assert result["prompt"]["outputSchemaId"] == "pkg_expansion_proposal_bundle.v1"
    assert result["prompt"]["scope"]["scopeType"] == "node"
    instructions = " ".join(result["prompt"]["systemInstructions"]).lower()
    assert "pkg expansion review flow" in instructions
    assert "node-scoped expansion run" in instructions
    assert "avoid defaulting to 'general'" in instructions
    assert "prefer a matching existing graph domain" in instructions
    assert "choose the most specific edge type available" in instructions
    assert "use notion for general concepts" in instructions


@pytest.mark.asyncio
async def test_curriculum_revision_prompt_is_prefetched_from_services() -> None:
    runtime = AgentRuntime(CompositeToolRegistry(FakeInvoker()), AcceptingGuardian())

    result = await runtime.run(
        "curriculum-revision-agent",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "curriculumId": "curr_1",
                "conceptIds": ["concept_1"],
                "executionPreference": "realtime",
                "payload": {
                    "curriculumVersionId": "cver_1",
                    "currentNodes": [{"stableNodeKey": "node_1"}],
                    "revisionReason": "prerequisite_gap",
                    "evidence": {
                        "stableNodeKey": "node_1",
                        "triggerType": "prerequisite_gap",
                    },
                },
            }
        ),
    )

    prompt_slots = result["prompt"]["slots"]
    manifest = prompt_slots["serviceInputManifest"]
    assert prompt_slots["prefetch"]["compositeTool"] == "get-curriculum-draft-context"
    assert any(item["key"] == "activeVersion" for item in manifest)
    assert any(item["key"] == "realignmentEvidence" for item in manifest)
    assert any(item["key"] == "triggeringEvidence" for item in manifest)
    assert any(item["key"] == "learnerStateSummary" for item in manifest)
    assert any(item["key"] == "graphReadiness" for item in manifest)
    assert prompt_slots["curriculumPlannerBrief"]["selectedPolicies"]["detourRule"]
    assert "curriculum systems planner" in " ".join(result["prompt"]["systemInstructions"]).lower()
    assert result["contextPack"]["collaboratorArtifacts"]["learnerStateSummary"]["agentName"] == "learner-state-summarizer-agent"
    assert result["execution"]["result"]["changes"][0]["state"] == "pending"


def test_curriculum_response_schemas_are_strict_and_distinct() -> None:
    wrappers = _wrappers()
    draft_name, draft_schema = response_schema_for_wrapper(wrappers["curriculum-planner"])
    revision_name, revision_schema = response_schema_for_wrapper(
        wrappers["curriculum-revision-agent"]
    )

    assert draft_name == "curriculum_draft_result"
    assert revision_name == "curriculum_revision_result"
    assert "pathExplanation" in draft_schema["properties"]
    assert "branchDecisionPoints" in draft_schema["properties"]
    assert draft_schema["properties"]["edges"]["items"]["properties"]["type"]["enum"] == [
        "prerequisite",
        "recommended_before",
        "reinforces",
        "branch_option",
        "diversion_to",
    ]
    assert "changeStrategySummary" in revision_schema["properties"]
    assert "changes" in revision_schema["required"]
    assert "insert_diversion_path" in revision_schema["properties"]["changes"]["items"]["properties"]["kind"]["enum"]


@pytest.mark.asyncio
async def test_runtime_executes_lesson_plan_wrapper() -> None:
    runtime = AgentRuntime(CompositeToolRegistry(FakeInvoker()), AcceptingGuardian())

    result = await runtime.run(
        "lesson-plan-generator",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "sessionId": "session_1",
                "curriculumId": "curr_1",
                "selectedNodeIds": ["cnode_1"],
                "selectedCardIds": ["card_1"],
            }
        ),
    )

    assert result["execution"] is not None
    assert result["execution"]["mode"] == "lesson_plan"
    assert result["execution"]["strategy"] == "realtime"
    assert result["preflight"]["requiresReview"] is True
    assert result["preflight"]["reviewQueue"] == "pedagogy-guardian"
    assert result["execution"]["result"]["guardianValidationId"] == "guardian_plan_test"
    assert result["execution"]["result"]["execution"]["model"] == "gemini-2.5-pro"
    assert result["execution"]["result"]["steps"][0]["objective"]
    assert result["execution"]["result"]["steps"][0]["activities"][0]["prompt"]
    assert result["execution"]["result"]["metadata"]["requiresLearnerReview"] is True


@pytest.mark.asyncio
async def test_content_transform_prompt_contains_explicit_card_type_catalogue() -> None:
    store = TemporarySQLiteBatchJobStore()
    await store.initialize()
    runtime = AgentRuntime(
        CompositeToolRegistry(FakeInvoker()),
        AcceptingGuardian(),
        llm_router=LLMRouter(
            batch_store=store,
            batch_adapters={},
            realtime_adapters={"google": SuccessfulOpenAIAdapter()},
        ),
    )

    result = await runtime.run(
        "content-transform-agent",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "selectedCardIds": ["card_parent_1"],
                "desiredCardTypes": ["comparison"],
                "executionPreference": "realtime",
                "allowFallback": False,
                "payload": {
                    "parentCardId": "card_parent_1",
                    "transformationKind": "change_card_type",
                    "targetCardTypes": ["comparison", "cloze"],
                    "count": 2,
                    "card": {
                        "cardType": "atomic",
                        "conceptIds": ["concept_1"],
                        "anchoredCkgNodeIds": ["concept_1"],
                        "anchoredPkgNodeIds": ["node_123456789012345678901"],
                        "content": {"front": "What is Concept One?", "back": "Answer."},
                        "tags": ["source"],
                    },
                },
            }
        ),
    )

    instructions = " ".join(result["prompt"]["systemInstructions"]).lower()
    catalogue = result["prompt"]["slots"]["transformCardTypeCatalogue"]
    assert "transformcardtypecatalogue" in instructions
    assert isinstance(catalogue, list)
    assert len(catalogue) >= 40
    assert any(str(item).startswith("comparison:") for item in catalogue)
    assert any(str(item).startswith("cloze:") for item in catalogue)
    assert result["execution"]["result"]["cards"][0]["cardType"] == "comparison"
    assert "items" in result["execution"]["result"]["cards"][0]["content"]


@pytest.mark.asyncio
async def test_content_transform_realtime_fails_loudly_when_model_output_is_incomplete() -> None:
    store = TemporarySQLiteBatchJobStore()
    await store.initialize()
    runtime = AgentRuntime(
        CompositeToolRegistry(FakeInvoker()),
        AcceptingGuardian(),
        llm_router=LLMRouter(
            batch_store=store,
            batch_adapters={},
            realtime_adapters={"google": IncompleteOpenAIAdapter()},
        ),
    )

    with pytest.raises(UserFacingAgentError) as error:
        await runtime.run(
            "content-transform-agent",
            AgentRunRequest.model_validate(
                {
                    "userId": "user_1",
                    "selectedCardIds": ["card_parent_1"],
                    "executionPreference": "realtime",
                    "allowFallback": False,
                    "payload": {
                        "parentCardId": "card_parent_1",
                        "transformationKind": "change_card_type",
                        "count": 1,
                        "card": {
                            "cardType": "atomic",
                            "conceptIds": ["concept_1"],
                            "anchoredCkgNodeIds": ["concept_1"],
                            "content": {"front": "What is Concept One?", "back": "Answer."},
                            "tags": ["source"],
                        },
                    },
                }
            ),
        )

    assert error.value.payload["reasonCode"] == "content_transform_incomplete_result"


@pytest.mark.asyncio
async def test_lesson_plan_prompt_context_pack_includes_authority_sections_and_tools() -> None:
    runtime = AgentRuntime(CompositeToolRegistry(FakeInvoker()), AcceptingGuardian())

    result = await runtime.run(
        "lesson-plan-generator",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "sessionId": "session_1",
                "curriculumId": "curr_1",
                "selectedNodeIds": ["cnode_1"],
                "studyMode": "knowledge_gaining",
                "payload": {"topic": "Bayes theorem", "maxSteps": 3},
            }
        ),
    )

    slots = result["prompt"]["slots"]
    section_keys = {section["key"] for section in slots["contextSections"]}
    manifest = slots["serviceInputManifest"]
    provider_tools = slots["providerTools"]

    assert slots["prefetch"]["strategy"] == "context_stuffed_before_model_call"
    assert "role" in section_keys
    assert "runContext" in section_keys
    assert "serviceFacts" in section_keys
    assert "detectedSignals" in section_keys
    assert "constraints" in section_keys
    assert "provenance" in section_keys
    assert any(item["service"] == "session-service" and item["tool"] == "get-session" for item in manifest)
    assert any(item["service"] == "scheduler-service" for item in manifest)
    assert any(item["service"] == "metacognition-service" for item in manifest)
    assert any(item["service"] == "content-service" for item in manifest)
    assert any(item["service"] == "knowledge-graph-service" for item in manifest)
    assert any(tool["name"] == "session__get_session" for tool in provider_tools)
    assert any(tool["name"] == "pedagogy_guardian__validate_lesson_plan" for tool in provider_tools)


@pytest.mark.asyncio
async def test_runtime_run_async_rejects_realtime_only_agent() -> None:
    store = TemporarySQLiteBatchJobStore()
    await store.initialize()
    runtime = AgentRuntime(
        CompositeToolRegistry(FakeInvoker()),
        AcceptingGuardian(),
        batch_store=store,
        llm_router=LLMRouter(batch_store=store, batch_adapters={}),
    )

    with pytest.raises(ValueError, match="run-async"):
        await runtime.run_async(
            "strategy-replanning-agent",
            AgentRunRequest.model_validate(
                {
                    "userId": "user_1",
                    "sessionId": "session_1",
                }
            ),
        )


@pytest.mark.asyncio
async def test_runtime_run_async_accepts_goal_only_curriculum_outline_request() -> None:
    store = TemporarySQLiteBatchJobStore()
    await store.initialize()
    runtime = AgentRuntime(
        CompositeToolRegistry(FakeInvoker()),
        AcceptingGuardian(),
        batch_store=store,
        llm_router=LLMRouter(batch_store=store, batch_adapters={}),
    )

    result = await runtime.run_async(
        "curriculum-outline-planner",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "executionPreference": "batch",
                "payload": {
                    "goal": "Learn enough linear algebra to understand PCA.",
                    "surface": "curriculum-new",
                },
            }
        ),
    )

    assert result["status"] in {"submitted", "queued"}
    assert result["jobId"]


@pytest.mark.asyncio
async def test_runtime_run_async_rejects_goal_only_durable_curriculum_planner_request() -> None:
    store = TemporarySQLiteBatchJobStore()
    await store.initialize()
    runtime = AgentRuntime(
        CompositeToolRegistry(FakeInvoker()),
        AcceptingGuardian(),
        batch_store=store,
        llm_router=LLMRouter(batch_store=store, batch_adapters={}),
    )

    with pytest.raises(ValueError, match="Missing required fields for curriculum-planner: conceptIds"):
        await runtime.run_async(
            "curriculum-planner",
            AgentRunRequest.model_validate(
                {
                    "userId": "user_1",
                    "executionPreference": "batch",
                    "payload": {
                        "goal": "Learn enough linear algebra to understand PCA.",
                        "surface": "curriculum-new",
                    },
                }
            ),
        )


def test_runtime_preflight_blocks_forbidden_tools() -> None:
    runtime = AgentRuntime(CompositeToolRegistry(FakeInvoker()), AcceptingGuardian())

    result = runtime.preflight(
        "cognitive-copilot",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "sessionId": "session_1",
                "requestedTools": ["session.complete-session"],
            }
        ),
    )

    assert result["decision"]["allowed"] is False
    assert "session.complete-session" in result["decision"]["blockedReasons"][0]


def test_runtime_high_risk_replan_routes_through_full_review_chain() -> None:
    runtime = AgentRuntime(CompositeToolRegistry(FakeInvoker()), AcceptingGuardian())

    result = runtime.preflight(
        "strategy-replanning-agent",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "sessionId": "session_1",
                "payload": {"forceFullReplan": True},
            }
        ),
    )

    assert result["decision"]["allowed"] is True
    assert result["decision"]["riskLevel"] == "high"
    assert result["decision"]["requiresReview"] is True
    assert result["decision"]["reviewPath"] == [
        "pedagogy-guardian",
        "session-plan-review",
        "active-session-timeline",
    ]
    assert result["executionPlan"]["strategy"] == "realtime"
