from __future__ import annotations

import pytest

from src.agents.calibration_coach import CalibrationCoachAgent, CalibrationCoachRequest
from src.agents.cognitive_copilot import CognitiveCopilotAgent, CognitiveCopilotRequest
from src.agents.content_creator import ContentCreatorAgent, ContentCreatorRequest
from src.agents.curriculum_planner import (
    CurriculumDraftRequest,
    CurriculumPlannerAgent,
    CurriculumRevisionRequest,
)
from src.agents.guardian_client import GuardianOutcome
from src.agents.ingestion_concept_extraction_agent import (
    IngestionConceptExtractionAgent,
    IngestionConceptExtractionRequest,
)
from src.agents.knowledge_graph_agent import KnowledgeGraphAgent, KnowledgeGraphRequest
from src.agents.lesson_planner import LessonPlanGenerator, LessonPlanRequest
from src.agents.mental_debugger import MentalDebuggerAgent, MentalDebuggerRequest
from src.agents.mode_preference_helper import ModePreferenceHelperAgent, ModePreferenceRequest
from src.agents.patch_planner_remediation import PatchPlannerAgent, PatchPlannerRequest
from src.agents.pedagogy_guardian import PedagogyGuardianAgent, PedagogyGuardianRequest
from src.agents.strategy_replanning import StrategyReplanningAgent, StrategyReplanningRequest
from src.agents.taxonomy_curator import TaxonomyCuratorAgent, TaxonomyCuratorRequest
from src.agents.watchtower_governance import WatchtowerGovernanceAgent, WatchtowerGovernanceRequest


class AcceptingGuardian:
    async def validate_activity(self, payload: object) -> GuardianOutcome:
        return GuardianOutcome(accepted=True, validationId="guardian_activity_test", reasons=[])

    async def validate_lesson_plan(self, payload: object) -> GuardianOutcome:
        return GuardianOutcome(accepted=True, validationId="guardian_plan_test", reasons=[])

    async def validate_coaching_artifact(self, payload: object) -> GuardianOutcome:
        return GuardianOutcome(accepted=True, validationId="guardian_coach_test", reasons=[])

    async def validate_replan(self, payload: object) -> GuardianOutcome:
        return GuardianOutcome(accepted=True, validationId="guardian_replan_test", reasons=[])


class RejectingGuardian:
    async def validate_lesson_plan(self, payload: object) -> GuardianOutcome:
        return GuardianOutcome(accepted=False, validationId="guardian_plan_blocked", reasons=["missing concept reference"])


@pytest.mark.asyncio
async def test_content_creation_calls_guardian() -> None:
    agent = ContentCreatorAgent(AcceptingGuardian())
    result = await agent.create(
        ContentCreatorRequest(
            userId="user_1",
            mode="agent_autonomous",
            conceptIds=["concept_linear_equations"],
            desiredCardTypes=["definition"],
        )
    )

    assert result["cards"][0]["guardianValidationId"] == "guardian_activity_test"
    assert result["cards"][0]["conceptIds"] == ["concept_linear_equations"]
    assert result["activityVariants"][0]["guardianValidationId"] == "guardian_activity_test"
    assert result["execution"]["strategy"] == "realtime"


@pytest.mark.asyncio
async def test_content_creation_accepts_unanchored_generated_cards() -> None:
    agent = ContentCreatorAgent(AcceptingGuardian())
    result = await agent.create(
        ContentCreatorRequest(
            userId="user_1",
            mode="agent_autonomous",
            conceptIds=["Family"],
            desiredCardTypes=["explanation"],
        )
    )

    assert result["cards"][0]["guardianValidationId"] == "guardian_activity_test"
    assert result["cards"][0]["anchoredCkgNodeIds"] == []
    assert result["cards"][0]["anchoredPkgNodeIds"] == []


@pytest.mark.asyncio
async def test_content_creation_normalizes_concept_refs_to_graph_ids() -> None:
    agent = ContentCreatorAgent(AcceptingGuardian())
    request = ContentCreatorRequest(
        userId="user_1",
        mode="agent_autonomous",
        conceptIds=["concept_real_123456789012345678901"],
        desiredCardTypes=["explanation"],
        contextPack={
            "schemaVersion": "content_creation_prompt.v2",
            "pedagogicalContext": {
                "targetConcepts": [
                    {
                        "conceptRef": "c1",
                        "label": "a7 NAchR",
                        "description": "a nicotinic acetylcholine receptor subunit involved in cholinergic signaling",
                        "domain": "neuroscience",
                    }
                ]
            },
            "serviceContract": {
                "identityMap": {
                    "concepts": [
                        {
                            "conceptRef": "c1",
                            "inputRef": "a7 NAchR",
                            "conceptId": "concept_real_123456789012345678901",
                            "pkgNodeId": "node_123456789012345678901",
                            "ckgNodeId": "node_abcdefghijklmnopqrstu",
                        }
                    ]
                }
            },
        },
    )

    result = await agent.finalize_created_content(
        generated={
            "cards": [
                {
                    "cardType": "explanation",
                    "originMode": "agent_autonomous",
                    "conceptIds": ["c1"],
                    "anchoredCkgNodeIds": [],
                    "anchoredPkgNodeIds": [],
                    "sourceDocumentIds": [],
                    "sources": [],
                    "factualityScore": 0.8,
                    "content": {"front": "What is a7 NAchR?", "back": "It is a receptor."},
                    "tags": ["generated"],
                    "difficulty": "intermediate",
                    "rationale": "Model output.",
                }
            ],
            "activityVariants": [],
        },
        request=request,
    )

    card = result["cards"][0]
    assert card["conceptIds"] == ["concept_real_123456789012345678901"]
    assert card["anchoredCkgNodeIds"] == ["node_abcdefghijklmnopqrstu"]
    assert card["anchoredPkgNodeIds"] == ["node_123456789012345678901"]


@pytest.mark.asyncio
async def test_content_creation_replaces_vacuous_back_from_graph_context() -> None:
    agent = ContentCreatorAgent(AcceptingGuardian())
    request = ContentCreatorRequest(
        userId="user_1",
        mode="agent_autonomous",
        conceptIds=["concept_real_123456789012345678901"],
        desiredCardTypes=["explanation"],
        contextPack={
            "schemaVersion": "content_creation_prompt.v2",
            "pedagogicalContext": {
                "targetConcepts": [
                    {
                        "conceptRef": "c1",
                        "label": "a7 NAchR",
                        "description": "a nicotinic acetylcholine receptor subunit involved in cholinergic signaling",
                        "domain": "neuroscience",
                    }
                ],
                "conceptRelations": {
                    "relatedConceptsByConceptRef": {
                        "c1": {"items": [{"label": "acetylcholine", "relationship": "related"}]}
                    }
                },
            },
            "serviceContract": {
                "identityMap": {
                    "concepts": [
                        {
                            "conceptRef": "c1",
                            "inputRef": "a7 NAchR",
                            "conceptId": "concept_real_123456789012345678901",
                            "pkgNodeId": "node_123456789012345678901",
                            "ckgNodeId": "node_abcdefghijklmnopqrstu",
                        }
                    ]
                }
            },
        },
    )

    result = await agent.finalize_created_content(
        generated={
            "cards": [
                {
                    "cardType": "explanation",
                    "originMode": "agent_autonomous",
                    "conceptIds": ["c1"],
                    "anchoredCkgNodeIds": [],
                    "anchoredPkgNodeIds": [],
                    "sourceDocumentIds": [],
                    "sources": [],
                    "factualityScore": 0.5,
                    "content": {
                        "front": "What is a7 NAchR?",
                        "back": "a7 NAchR refers to a specific entity or concept known as 'a7 NAchR'. Without further context or information, its precise definition and significance cannot be elaborated.",
                    },
                    "tags": ["generated"],
                    "difficulty": "intermediate",
                    "rationale": "Model output.",
                }
            ],
            "activityVariants": [],
        },
        request=request,
    )

    assert "nicotinic acetylcholine receptor subunit involved in cholinergic signaling" in result["cards"][0]["content"]["back"]
    assert "deterministic graph-context fallback" in result["cards"][0]["rationale"]


@pytest.mark.asyncio
async def test_content_creation_rejects_vacuous_back_without_semantic_context() -> None:
    agent = ContentCreatorAgent(AcceptingGuardian())
    request = ContentCreatorRequest(
        userId="user_1",
        mode="agent_autonomous",
        conceptIds=["concept_real_123456789012345678901"],
        desiredCardTypes=["explanation"],
        contextPack={
            "schemaVersion": "content_creation_prompt.v2",
            "pedagogicalContext": {
                "targetConcepts": [{"conceptRef": "c1", "label": "a7 NAchR"}],
                "conceptRelations": {},
            },
            "serviceContract": {
                "identityMap": {
                    "concepts": [
                        {
                            "conceptRef": "c1",
                            "inputRef": "a7 NAchR",
                            "conceptId": "concept_real_123456789012345678901",
                            "pkgNodeId": "node_123456789012345678901",
                            "ckgNodeId": "node_abcdefghijklmnopqrstu",
                        }
                    ]
                }
            },
        },
    )

    result = await agent.finalize_created_content(
        generated={
            "cards": [
                {
                    "cardType": "explanation",
                    "originMode": "agent_autonomous",
                    "conceptIds": ["c1"],
                    "anchoredCkgNodeIds": [],
                    "anchoredPkgNodeIds": [],
                    "sourceDocumentIds": [],
                    "sources": [],
                    "factualityScore": 0.5,
                    "content": {
                        "front": "What is a7 NAchR?",
                        "back": "Without further context or information, its precise definition and significance cannot be elaborated.",
                    },
                    "tags": ["generated"],
                    "difficulty": "intermediate",
                    "rationale": "Model output.",
                }
            ],
            "activityVariants": [],
        },
        request=request,
    )

    assert result["cards"] == []
    assert "Missing semantic grounding for a safe fallback" in result["rejectedDrafts"][0]["reasons"][0]


@pytest.mark.asyncio
async def test_ingestion_concept_extraction_returns_reviewable_candidates() -> None:
    agent = IngestionConceptExtractionAgent()
    result = await agent.extract(
        IngestionConceptExtractionRequest.model_validate(
            {
                "userId": "user_1",
                "documentId": "doc_1",
                "intent": "both",
                "document": {"id": "doc_1", "title": "Source One"},
                "ir": {
                    "title": "Source One",
                    "language": "en",
                    "blocks": [
                        {
                            "id": "block_1",
                            "kind": "paragraph",
                            "text": "Bayes theorem updates probabilities using evidence.",
                            "metadata": {"headingPath": ["Bayes Theorem"]},
                        }
                    ],
                    "outline": [{"id": "block_h1", "kind": "heading", "text": "Bayes Theorem"}],
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
            }
        )
    )

    assert result["conceptCandidates"][0]["evidenceChunkIds"] == ["chunk_1"]
    assert result["mappingSuggestions"][0]["decision"] == "proposal_needed"
    assert any(item["target"] == "knowledge-graph" for item in result["handoffRecommendations"])


@pytest.mark.asyncio
async def test_lesson_plan_requires_selected_curriculum_node() -> None:
    agent = LessonPlanGenerator(AcceptingGuardian())

    with pytest.raises(ValueError, match="selected node"):
        await agent.generate(
            LessonPlanRequest(
                sessionId="session_1",
                userId="usr_1",
                curriculumId="curr_1",
                selectedNodeIds=[],
                selectedCardIds=["card_1"],
            )
        )


@pytest.mark.asyncio
async def test_lesson_plan_validates_with_guardian() -> None:
    agent = LessonPlanGenerator(AcceptingGuardian())
    plan = await agent.generate(
        LessonPlanRequest(
            sessionId="session_1",
            userId="usr_1",
            curriculumId="curr_1",
            selectedNodeIds=["cnode_1"],
            selectedCardIds=["card_1"],
        )
    )

    assert plan["guardianValidationId"] == "guardian_plan_test"
    assert plan["selectedNodeIds"] == ["cnode_1"]
    assert plan["execution"]["strategy"] == "realtime"
    assert plan["steps"][0]["conceptRefs"]
    assert plan["steps"][0]["activities"][0]["prompt"]
    assert plan["metadata"]["artifactState"] == "guardian_accepted"


@pytest.mark.asyncio
async def test_lesson_plan_normalizes_generated_output_to_session_contract() -> None:
    agent = LessonPlanGenerator(AcceptingGuardian())
    plan = await agent.finalize_generated_plan(
        generated_plan={
            "topic": "Bayes theorem",
            "selectedNodeIds": ["cnode_1"],
            "conceptRefs": ["concept_bayes"],
            "goals": [
                {
                    "title": "Understand Bayes",
                    "targetNodeIds": ["concept_bayes"],
                    "source": "system_proposed",
                }
            ],
            "steps": [
                {
                    "objective": "Explain Bayes theorem.",
                    "conceptRefs": ["concept_bayes"],
                    "expectedOutcome": "Learner explains prior, likelihood, and posterior.",
                    "activity": {
                        "contentSourceType": "generated",
                        "prompt": "Explain Bayes theorem using one example.",
                    },
                }
            ],
            "assessmentStrategy": "Check explanation quality.",
            "adaptationRules": "Repair prerequisite probability gaps.",
        },
        request=LessonPlanRequest(
            sessionId="session_1",
            userId="usr_1",
            curriculumId="curr_1",
            curriculumVersionId="cver_1",
            selectedNodeIds=["cnode_1"],
            studyMode="knowledge_gaining",
        ),
    )

    assert plan["goals"][0]["description"] == "Understand Bayes"
    assert plan["goals"][0]["conceptRefs"] == ["concept_bayes"]
    assert plan["steps"][0]["activities"][0]["contentSourceType"] == "generated"
    assert plan["assessmentStrategy"] == "Check explanation quality."
    assert plan["technicalProvenance"]["curriculumVersionId"] == "cver_1"


@pytest.mark.asyncio
async def test_lesson_plan_enforces_max_goal_cap() -> None:
    agent = LessonPlanGenerator(AcceptingGuardian())

    with pytest.raises(ValueError, match="at most 4"):
        await agent.finalize_generated_plan(
            generated_plan={
                "selectedNodeIds": ["cnode_1"],
                "conceptRefs": ["concept_1"],
                "goals": [
                    {"description": f"Goal {index}", "type": "acquisition", "conceptRefs": ["concept_1"]}
                    for index in range(5)
                ],
                "steps": [
                    {
                        "objective": "Practice concept.",
                        "conceptRefs": ["concept_1"],
                        "expectedOutcome": "Explain it.",
                        "activities": [{"contentSourceType": "generated", "prompt": "Explain it."}],
                    }
                ],
            },
            request=LessonPlanRequest(
                sessionId="session_1",
                userId="usr_1",
                curriculumId="curr_1",
                selectedNodeIds=["cnode_1"],
            ),
        )


@pytest.mark.asyncio
async def test_lesson_plan_surfaces_guardian_block() -> None:
    agent = LessonPlanGenerator(RejectingGuardian())

    with pytest.raises(ValueError, match="Guardian rejected"):
        await agent.generate(
            LessonPlanRequest(
                sessionId="session_1",
                userId="usr_1",
                curriculumId="curr_1",
                selectedNodeIds=["cnode_1"],
                guardianBlockReasons=["Previous draft leaked answer"],
            )
        )


@pytest.mark.asyncio
async def test_knowledge_graph_agent_outputs_ckg_mutation_dsl() -> None:
    result = await KnowledgeGraphAgent().propose(
        KnowledgeGraphRequest.model_validate(
            {
                "userId": "user_1",
                "conceptIds": ["concept_bayes"],
                "candidateLabels": ["Bayes theorem"],
                "domain": "statistics",
            }
        )
    )

    operation = result["proposals"][0]["operation"]
    assert operation["type"] == "add_node"
    assert operation["nodeType"] == "concept"
    assert operation["label"] == "Bayes theorem"
    assert operation["domain"] == "statistics"


@pytest.mark.asyncio
async def test_knowledge_graph_agent_expands_recursive_neighborhood_for_new_nodes() -> None:
    result = await KnowledgeGraphAgent().propose(
        KnowledgeGraphRequest.model_validate(
            {
                "userId": "user_1",
                "conceptIds": ["concept_bayes"],
                "candidateLabels": ["Bayes theorem"],
                "domain": "statistics",
            }
        )
    )

    node_labels = {
        proposal["candidateLabel"]
        for proposal in result["proposals"]
        if proposal["operation"]["type"] == "add_node"
    }
    edge_keys = {
        (
            proposal["operation"]["edgeType"],
            proposal["operation"]["sourceNodeId"],
            proposal["operation"]["targetNodeId"],
        )
        for proposal in result["proposals"]
        if proposal["operation"]["type"] == "add_edge"
    }

    assert "Bayes theorem" in node_labels
    assert "Probability Theory" in node_labels
    assert "Conditional Probability" in node_labels
    assert "Set Theory" in node_labels
    assert "Combinatorics" in node_labels
    assert len(edge_keys) == len(
        [proposal for proposal in result["proposals"] if proposal["operation"]["type"] == "add_edge"]
    )


@pytest.mark.asyncio
async def test_knowledge_graph_agent_reuses_existing_equivalent_nodes_instead_of_rephrasing() -> None:
    result = await KnowledgeGraphAgent().propose(
        KnowledgeGraphRequest.model_validate(
            {
                "userId": "user_1",
                "conceptIds": ["concept_bayes"],
                "candidateLabels": ["Bayes theorem"],
                "domain": "statistics",
                "contextPack": {
                    "sections": [
                        {
                            "key": "relatedConcepts:concept_bayes",
                            "value": {
                                "nodes": [
                                    {
                                        "conceptId": "concept_bayes_existing",
                                        "nodeId": "node_bayes_existing",
                                        "label": "Bayes Theorem",
                                        "aliases": ["Bayes rule"],
                                    },
                                    {
                                        "conceptId": "concept_conditional_probability",
                                        "nodeId": "node_conditional_probability",
                                        "label": "Conditional probability",
                                    },
                                ]
                            },
                        }
                    ]
                },
            }
        )
    )

    anchor_labels = [proposal["candidateLabel"] for proposal in result["anchorProposals"]]
    prerequisite_node_labels = [
        proposal["candidateLabel"] for proposal in result["prerequisiteNodeProposals"]
    ]

    assert anchor_labels == []
    assert "Conditional Probability" not in prerequisite_node_labels
    assert result["resolvedTargets"][0]["effectiveConceptId"] == "concept_bayes_existing"
    assert result["resolvedTargets"][0]["existing"] == "true"


@pytest.mark.asyncio
async def test_curriculum_revision_agent_turns_evidence_into_reviewable_change() -> None:
    result = await CurriculumPlannerAgent().revise(
        CurriculumRevisionRequest.model_validate(
            {
                "userId": "user_1",
                "curriculumId": "curr_1",
                "curriculumVersionId": "cver_1",
                "currentNodes": [{"stableNodeKey": "node_bayes"}],
                "revisionReason": "prerequisite_gap",
                "evidence": {
                    "stableNodeKey": "node_bayes",
                    "triggerType": "prerequisite_gap",
                },
            }
        )
    )

    assert result["changes"][0]["kind"] == "insert_diversion_path"
    assert result["changes"][0]["state"] == "pending"
    assert result["changes"][0]["expectedEffect"]
    assert result["changes"][0]["riskLevel"] == "medium"
    assert result["changeStrategySummary"]["prerequisiteReturnPolicy"] == "short_detour_then_return"


@pytest.mark.asyncio
async def test_curriculum_draft_agent_creates_branch_aware_fallback_graph() -> None:
    result = await CurriculumPlannerAgent().draft(
        CurriculumDraftRequest.model_validate(
            {
                "userId": "user_1",
                "goal": "Learn applied statistics",
                "conceptIds": ["concept_algebra", "concept_probability", "concept_inference"],
                "focusAreas": ["probability", "inference"],
                "contextPack": {
                    "sections": [
                        {
                            "key": "blockedPrerequisites",
                            "value": {
                                "items": [{"label": "Fractions"}]
                            },
                        }
                    ]
                },
            }
        )
    )

    edge_types = {edge["type"] for edge in result["edges"]}
    branch_nodes = [node for node in result["nodes"] if isinstance(node.get("branchInfo"), dict)]

    assert "branch_option" in edge_types
    assert "diversion_to" in edge_types
    assert any(node["branchInfo"]["pathRole"] == "focus_area" for node in branch_nodes)
    assert any(node["branchInfo"]["pathRole"] == "diversion" for node in branch_nodes)
    assert result["pathExplanation"]["mainPath"]
    assert result["learnerModelSummary"]["prerequisiteStrictness"] == "strict_return_to_prerequisites"
    assert "adaptive_short_detours" in result["planningSignalsUsed"]


@pytest.mark.asyncio
async def test_curriculum_draft_normalization_preserves_unanchored_branch_metadata() -> None:
    agent = CurriculumPlannerAgent()
    result = await agent.finalize_curriculum_draft(
        generated_draft={
            "goal": "Learn applied statistics",
            "nodes": [
                {
                    "label": "Bridge: Fractions",
                    "stableNodeKey": "node_diversion_fraction",
                    "proposedConcept": {"label": "Fractions"},
                    "estimatedSessions": 2,
                    "traversalWeight": 1,
                    "branchInfo": {
                        "pathRole": "diversion",
                        "branchGroupKey": "branch_remediation",
                        "branchEntryStrategy": "evidence_triggered",
                        "branchExitTargets": ["node_concept_probability"],
                        "focusTags": ["prerequisite_repair"],
                        "isMainPath": False,
                    },
                },
                {
                    "label": "Probability",
                    "stableNodeKey": "node_concept_probability",
                    "ckgConceptId": "concept_probability",
                    "estimatedSessions": 2,
                    "traversalWeight": 2,
                    "branchInfo": {
                        "pathRole": "foundation",
                        "isMainPath": True,
                    },
                },
            ],
            "edges": [
                {
                    "fromNodeId": "cnode_0",
                    "toNodeId": "cnode_1",
                    "type": "recommended_before",
                }
            ],
            "rationale": "Repair fractions first, then return to probability.",
            "pathExplanation": {"mainPath": "Return to probability after a short fraction bridge."},
            "branchDecisionPoints": [{"branchGroupKey": "branch_remediation", "reason": "Prerequisite repair."}],
            "learnerModelSummary": {"knownGaps": [{"label": "Fractions"}]},
            "planningSignalsUsed": ["blocked_prerequisites"],
        },
        request=CurriculumDraftRequest.model_validate(
            {
                "userId": "user_1",
                "goal": "Learn applied statistics",
            }
        ),
    )

    assert result["nodes"][0]["proposedConcept"]["label"] == "Fractions"
    assert "ckgConceptId" not in result["nodes"][0]
    assert result["nodes"][0]["branchInfo"]["branchExitTargets"] == ["node_concept_probability"]
    assert result["planningSignalsUsed"] == ["blocked_prerequisites"]


@pytest.mark.asyncio
async def test_calibration_coach_normalizes_and_validates_learner_copy() -> None:
    context_pack = {
        "sections": [
            {
                "key": "evaluation",
                "sourceService": "metacognition-service",
                "authorityLabel": "recorded_fact",
                "value": {
                    "stepId": "step_1",
                    "selfRating": "knew_it",
                    "reasoningQuality": 0.35,
                    "confidenceSignal": 0.9,
                },
            }
        ]
    }

    result = await CalibrationCoachAgent(AcceptingGuardian()).coach(
        CalibrationCoachRequest.model_validate(
            {"userId": "user_1", "stepId": "step_1", "conceptIds": ["concept_1"], "contextPack": context_pack}
        )
    )

    assert result["pattern"] == "overconfident_signal"
    assert result["guardianValidationId"] == "guardian_coach_test"
    assert result["reviewRouting"]["statusLabel"] == "Confidence ahead of trace"
    assert result["provenance"]["sourceServiceReferences"][0]["sourceService"] == "metacognition-service"


@pytest.mark.asyncio
async def test_calibration_coach_blocks_shaming_language_before_guardian() -> None:
    result = await CalibrationCoachAgent(AcceptingGuardian()).finalize_coaching(
        generated={
            "summary": "Bad calibration",
            "learnerFacingText": "You are always dishonest about confidence.",
            "recommendations": [],
        },
        request=CalibrationCoachRequest.model_validate({"userId": "user_1"}),
    )

    assert result["state"] == "reflection_blocked"
    assert result["validation"]["state"] == "rejected"
    assert result["rejectedArtifacts"][0]["repairReasons"]


@pytest.mark.asyncio
async def test_mental_debugger_normalizes_validates_and_routes_reflection() -> None:
    context_pack = {
        "sections": [
            {
                "key": "evaluation",
                "sourceService": "metacognition-service",
                "authorityLabel": "recorded_fact",
                "value": {"stepId": "step_1", "reasoningQuality": 0.32, "confidenceSignal": 0.7},
            },
            {
                "key": "diagnosticBrief",
                "sourceService": "metacognition-service",
                "authorityLabel": "detected_signal",
                "value": {"taxonomyLabels": ["cue_mismatch"]},
            },
        ]
    }

    result = await MentalDebuggerAgent(AcceptingGuardian()).debug(
        MentalDebuggerRequest.model_validate(
            {"userId": "user_1", "stepId": "step_1", "conceptIds": ["concept_1"], "contextPack": context_pack}
        )
    )

    assert result["artifactKind"] == "debugger_reflection"
    assert result["pattern"] == "cue_mismatch"
    assert result["guardianValidationId"] == "guardian_coach_test"
    assert result["reviewRouting"]["surface"] == "post-step-reflection"
    assert result["reviewRouting"]["hideInternalToolCalls"] is True
    assert result["provenance"]["sourceServiceReferences"][0]["sourceService"] == "metacognition-service"


@pytest.mark.asyncio
async def test_mental_debugger_blocks_trait_language_locally() -> None:
    result = await MentalDebuggerAgent(AcceptingGuardian()).finalize_reflection(
        generated={
            "summary": "Bad pattern",
            "learnerFacingText": "This proves you are always bad at checking.",
            "whatWorked": "None",
            "whereItSlipped": "Everything",
            "repairRecommendation": "Practice",
        },
        request=MentalDebuggerRequest.model_validate({"userId": "user_1"}),
    )

    assert result["state"] == "reflection_blocked"
    assert result["validation"]["state"] == "rejected"


@pytest.mark.asyncio
async def test_patch_planner_outputs_reviewable_owner_routed_proposal() -> None:
    context_pack = {
        "sections": [
            {
                "key": "remediationBrief",
                "sourceService": "metacognition-service",
                "authorityLabel": "detected_signal",
                "value": {
                    "stepId": "step_1",
                    "conceptRefs": ["concept_1"],
                    "recommendedAction": "insert_repair_step",
                },
            }
        ]
    }

    result = await PatchPlannerAgent(AcceptingGuardian()).plan(
        PatchPlannerRequest.model_validate(
            {"userId": "user_1", "sessionId": "session_1", "stepId": "step_1", "conceptIds": ["concept_1"], "contextPack": context_pack}
        )
    )

    assert result["artifactKind"] == "repair_proposal"
    assert result["guardianValidationId"] == "guardian_coach_test"
    assert result["proposals"][0]["ownerService"] == "session-service"
    assert result["reviewRouting"]["surface"] == "session-plan-review"
    assert result["reviewRouting"]["hideInternalToolCalls"] is True


@pytest.mark.asyncio
async def test_strategy_replanning_outputs_session_owned_reviewable_proposal() -> None:
    context_pack = {
        "sections": [
            {
                "key": "remediationBrief",
                "sourceService": "metacognition-service",
                "authorityLabel": "detected_signal",
                "value": {
                    "stepId": "step_1",
                    "conceptRefs": ["concept_1"],
                    "recommendedAction": "insert_repair_step",
                },
            }
        ]
    }

    result = await StrategyReplanningAgent(AcceptingGuardian()).replan(
        StrategyReplanningRequest.model_validate(
            {
                "userId": "user_1",
                "sessionId": "session_1",
                "stepId": "step_1",
                "conceptIds": ["concept_1"],
                "contextPack": context_pack,
            }
        )
    )

    assert result["artifactKind"] == "strategy_replan_proposal"
    assert result["guardianValidationId"] == "guardian_replan_test"
    assert result["changes"][0]["ownerService"] == "session-service"
    assert result["reviewRouting"]["surface"] == "session-plan-review"
    assert result["reviewRouting"]["hideInternalToolCalls"] is True


@pytest.mark.asyncio
async def test_strategy_replanning_blocks_evaluated_step_rewrites() -> None:
    result = await StrategyReplanningAgent(AcceptingGuardian()).finalize_replan(
        generated={
            "scope": "local_step",
            "interventionType": "replace_step",
            "learnerFacingNotice": "A repair is proposed.",
            "changes": [
                {
                    "kind": "replace_step",
                    "ownerService": "session-service",
                    "supersedesEvaluatedSteps": True,
                    "state": "needs_guardian_validation",
                }
            ],
        },
        request=StrategyReplanningRequest.model_validate(
            {"userId": "user_1", "sessionId": "session_1", "stepId": "step_1"}
        ),
    )

    assert result["state"] == "guardian_blocked"
    assert result["validation"]["state"] == "rejected"
    assert "evaluated Steps" in result["rejectedArtifacts"][0]["repairReasons"][0]


@pytest.mark.asyncio
async def test_cognitive_copilot_groups_source_bound_hints_and_validates() -> None:
    context_pack = {
        "sections": [
            {
                "key": "strategySummary",
                "sourceService": "agents-runtime",
                "authorityLabel": "proposal",
                "value": {"statusLabel": "Repair inserted"},
            },
            {
                "key": "remediationBrief",
                "sourceService": "metacognition-service",
                "authorityLabel": "detected_signal",
                "value": {"conceptRefs": ["concept_1"]},
            },
        ]
    }

    result = await CognitiveCopilotAgent(AcceptingGuardian()).reflect(
        CognitiveCopilotRequest.model_validate(
            {
                "userId": "user_1",
                "sessionId": "session_1",
                "stepId": "step_1",
                "conceptIds": ["concept_1"],
                "surface": "sidebar",
                "contextPack": context_pack,
            }
        )
    )

    assert result["artifactKind"] == "copilot_readout"
    assert result["guardianValidationId"] == "guardian_coach_test"
    assert result["hintGroups"][0]["source"] in {"session-service", "metacognition-service"}
    assert result["reviewRouting"]["surface"] == "cognitive-copilot-sidebar"
    assert result["reviewRouting"]["hideInternalToolCalls"] is True


@pytest.mark.asyncio
async def test_watchtower_hides_sensitive_trace_and_routes_governance() -> None:
    result = await WatchtowerGovernanceAgent().govern(
        WatchtowerGovernanceRequest.model_validate(
            {
                "userId": "user_1",
                "sessionId": "session_1",
                "surface": "copilot",
                "proposedAction": {"requestedDataClasses": ["raw_trace"]},
                "contextPack": {"sections": [{"key": "policyContext", "sourceService": "agents-runtime", "authorityLabel": "recorded_fact", "value": {}}]},
            }
        )
    )

    assert result["artifactKind"] == "governance_decision"
    assert result["state"] == "hidden_by_policy"
    assert result["reviewRouting"]["surface"] == "governance-dashboard"
    assert result["reviewRouting"]["hideInternalToolCalls"] is True
    assert result["validation"]["validator"] == "watchtower-local-policy"


@pytest.mark.asyncio
async def test_mode_preference_helper_selects_only_eligible_modes() -> None:
    result = await ModePreferenceHelperAgent().choose(
        ModePreferenceRequest.model_validate(
            {
                "userId": "user_1",
                "candidateModes": ["recall", "comparison"],
                "deterministicFallback": "recall",
                "recentModes": ["recall"],
            }
        )
    )

    assert result["artifactKind"] == "mode_preference_choice"
    assert result["selectedMode"] == "comparison"
    assert result["state"] == "repeat_avoided"
    assert result["validation"]["validator"] == "deterministic-mode-routing"


@pytest.mark.asyncio
async def test_mode_preference_helper_blocks_ineligible_llm_choice() -> None:
    result = await ModePreferenceHelperAgent().finalize_choice(
        generated={
            "state": "selected",
            "selectedMode": "socratic",
            "statusLabel": "Mode selected",
            "friendlyWhy": "Looks useful.",
            "rationale": "Looks useful.",
        },
        request=ModePreferenceRequest.model_validate(
            {"userId": "user_1", "candidateModes": ["recall"], "deterministicFallback": "recall"}
        ),
    )

    assert result["state"] == "no_valid_mode"
    assert result["validation"]["state"] == "rejected"
    assert "outside" in result["rejectedArtifacts"][0]["repairReasons"][0]


@pytest.mark.asyncio
async def test_taxonomy_curator_outputs_reviewable_owner_routed_proposal() -> None:
    result = await TaxonomyCuratorAgent().curate(
        TaxonomyCuratorRequest.model_validate(
            {
                "userId": "user_1",
                "taxonomyDomain": "failure",
                "labelIds": ["boundary_confusion", "category_confusion"],
                "contextPack": {"sections": [{"key": "evidenceClusters", "sourceService": "metacognition-service", "authorityLabel": "detected_signal", "value": [{"id": str(i)} for i in range(6)]}]},
            }
        )
    )

    assert result["artifactKind"] == "taxonomy_proposal"
    assert result["proposal"]["ownerService"] == "metacognition-service"
    assert result["reviewRouting"]["surface"] == "taxonomy-workbench"
    assert result["reviewRouting"]["hideInternalToolCalls"] is True
    assert result["validation"]["validator"] == "taxonomy-curator-local-schema"


@pytest.mark.asyncio
async def test_pedagogy_guardian_agent_returns_reviewable_validation() -> None:
    result = await PedagogyGuardianAgent(AcceptingGuardian()).validate(
        PedagogyGuardianRequest.model_validate(
            {
                "userId": "user_1",
                "artifactType": "coaching_artifact",
                "producerService": "metacognition-service",
                "producerAgent": "calibration-coach",
                "artifact": {
                    "artifactId": "coach_1",
                    "learnerFacingText": "Your confidence was high, but the trace skipped a check step.",
                },
            }
        )
    )

    assert result["decision"] == "accepted"
    assert result["validationId"] == "guardian_coach_test"
    assert result["reviewRouting"]["surface"] == "post-step-reflection"
