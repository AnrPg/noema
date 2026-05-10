from __future__ import annotations

import pytest

from src.agents.knowledge_graph_agent import KnowledgeGraphAgent, KnowledgeGraphRequest


@pytest.mark.asyncio
async def test_expand_pkg_returns_scope_aware_bundle() -> None:
    agent = KnowledgeGraphAgent()
    result = await agent.propose(
        KnowledgeGraphRequest.model_validate(
            {
                "userId": "user_1",
                "conceptIds": ["Bayes theorem"],
                "selectedNodeIds": ["node_bayestheoremdemo00001"],
                "operationName": "expand_pkg",
                "proposalType": "expand_pkg",
                "studyMode": "knowledge_gaining",
                "domain": "statistics",
                "graphExpansionScope": {
                    "scopeType": "node",
                    "nodeIds": ["node_bayestheoremdemo00001"],
                    "domain": "statistics",
                },
                "finalizedGraphPrompt": {
                    "pedagogicalContext": {
                        "targetConcepts": [
                            {
                                "conceptRef": "Bayes theorem",
                                "label": "Bayes theorem",
                                "description": "",
                                "domain": "statistics",
                                "learnerFacingSummary": "",
                            }
                        ],
                        "relationCandidates": {
                            "prerequisites": [],
                            "related": [],
                            "contrasts": [],
                            "confusables": [],
                            "misconceptionLinks": [],
                        },
                    },
                    "serviceContract": {
                        "identityMap": {
                            "concepts": [
                                {
                                    "conceptRef": "c1",
                                    "inputRef": "Bayes theorem",
                                    "conceptId": "concept_bayestheoremdemo00123",
                                    "pkgNodeId": "node_bayestheoremdemo00001",
                                    "ckgNodeId": "node_ckgbayestheoremdemo01",
                                    "selectedNodeIds": ["node_bayestheoremdemo00001"],
                                    "resolvedGraphType": "both",
                                }
                            ]
                        }
                    },
                },
                "contextPack": {"sections": []},
            }
        )
    )

    assert result["artifactKind"] == "pkg_expansion_proposal_bundle"
    assert result["operationName"] == "expand_pkg"
    assert result["promptProfileVersion"] == "graph-operation-profile.v1"
    assert result["scope"]["scopeType"] == "node"
    assert result["proposals"]
    assert result["summary"]["edgeProposalCount"] > 0
    assert any(
        proposal["category"] == "structural_optimization"
        and any(
            operation.get("type") == "add_edge"
            and operation.get("edgeType") == "prerequisite"
            for operation in proposal.get("pkgOperations", [])
            if isinstance(operation, dict)
        )
        for proposal in result["proposals"]
        if isinstance(proposal, dict)
    )
    assert any(
        any(
            operation.get("type") == "add_node"
            and operation.get("nodeType") == "notion"
            for operation in proposal.get("pkgOperations", [])
            if isinstance(operation, dict)
        )
        for proposal in result["proposals"]
        if isinstance(proposal, dict)
    )


@pytest.mark.asyncio
async def test_finalize_graph_proposals_turns_structural_review_into_prerequisite_edge() -> None:
    agent = KnowledgeGraphAgent()
    result = await agent.finalize_graph_proposals(
        raw_proposals=[
            {
                "conceptId": "microbiology",
                "proposalType": "STRUCTURAL",
                "rationale": (
                    "Microbiology is a specialized field within biology. "
                    "A foundational understanding of general biology is necessary."
                ),
                "confidenceScore": 0.95,
            }
        ],
        request=KnowledgeGraphRequest.model_validate(
            {
                "userId": "user_1",
                "conceptIds": ["microbiology"],
                "selectedNodeIds": ["node_microbiology_existing"],
                "proposalType": "STRUCTURAL",
                "operationName": "STRUCTURAL",
                "domain": "general",
                "contextPack": {"sections": []},
            }
        ),
    )

    assert result["artifactKind"] == "graph_proposals"
    assert result["proposalCount"] == 1
    proposal = result["proposals"][0]
    assert proposal["operation"]["type"] == "add_edge"
    assert proposal["operation"]["edgeType"] == "prerequisite"
    assert proposal["operation"]["sourceNodeId"] == "Biology"
    assert proposal["operation"]["targetNodeId"] == "node_microbiology_existing"


@pytest.mark.asyncio
async def test_finalize_graph_proposals_turns_structural_addition_node_candidate_into_edge() -> None:
    agent = KnowledgeGraphAgent()
    result = await agent.finalize_graph_proposals(
        raw_proposals=[
            {
                "conceptId": "microbiology",
                "candidateLabel": "Biology",
                "proposalType": "STRUCTURAL_ADDITION",
                "rationale": "Biology is a foundational prerequisite for microbiology.",
                "operation": {
                    "type": "add_node",
                    "label": "Biology",
                    "nodeType": "concept",
                    "domain": "general",
                },
                "confidenceScore": 0.95,
            }
        ],
        request=KnowledgeGraphRequest.model_validate(
            {
                "userId": "user_1",
                "conceptIds": ["microbiology"],
                "selectedNodeIds": ["node_microbiology_existing"],
                "proposalType": "STRUCTURAL_ADDITION",
                "operationName": "expand_pkg",
                "domain": "biology",
                "contextPack": {"sections": []},
            }
        ),
    )

    proposal = result["proposals"][0]
    assert proposal["operation"]["type"] == "add_edge"
    assert proposal["operation"]["edgeType"] == "prerequisite"
    assert proposal["operation"]["sourceNodeId"] == "Biology"
    assert proposal["operation"]["targetNodeId"] == "node_microbiology_existing"


@pytest.mark.asyncio
async def test_finalize_graph_proposals_preserves_edge_create_subject_and_target_refs() -> None:
    agent = KnowledgeGraphAgent()
    result = await agent.finalize_graph_proposals(
        raw_proposals=[
            {
                "conceptId": "dog",
                "proposalType": "EDGE_CREATE",
                "rationale": "Dogs and cats are commonly contrasted as domestic pets.",
                "operation": {
                    "type": "add_edge",
                    "relationKind": "contrasts_with",
                    "subjectConceptId": "node_dog_existing",
                    "targetConceptId": "node_cat_existing",
                    "sourceNodeId": None,
                    "targetNodeId": None,
                    "weight": 0.9,
                },
                "confidenceScore": 0.9,
            }
        ],
        request=KnowledgeGraphRequest.model_validate(
            {
                "userId": "user_1",
                "conceptIds": ["dog"],
                "selectedNodeIds": ["node_dog_existing"],
                "proposalType": "EDGE_CREATE",
                "operationName": "expand_pkg",
                "domain": "Pets",
                "contextPack": {"sections": []},
            }
        ),
    )

    proposal = result["proposals"][0]
    assert proposal["operation"]["type"] == "add_edge"
    assert proposal["operation"]["edgeType"] == "contrasts_with"
    assert proposal["operation"]["sourceNodeId"] == "node_dog_existing"
    assert proposal["operation"]["targetNodeId"] == "node_cat_existing"
