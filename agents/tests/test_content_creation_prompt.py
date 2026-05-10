from __future__ import annotations

from types import SimpleNamespace

from src.agents.content_creation_prompt import ContentCreationPromptBuilder


def _section(key: str, value: object) -> dict[str, object]:
    return {"key": key, "value": value}


def test_builder_scopes_rag_evidence_to_matching_concepts() -> None:
    builder = ContentCreationPromptBuilder()
    request = SimpleNamespace(
        payload={"sourcePolicy": "rag_required"},
        concept_ids=["Bayes theorem", "Conditional probability"],
        selected_node_ids=[],
        document_ids=["doc_1"],
        study_mode="knowledge_gaining",
        user_id="user_1",
        curriculum_id=None,
        desired_card_types=["short_answer"],
    )
    raw_context = {
        "sections": [
            _section("sourceDocument:doc_1", {"title": "Stats Source"}),
            _section(
                "ragGrounding:doc_1",
                {
                    "documentId": "doc_1",
                    "matches": [
                        {
                            "query": "Bayes theorem",
                            "conceptLabel": "Bayes theorem",
                            "chunks": [{"chunkId": "chunk_1", "text": "Bayes theorem updates prior beliefs."}],
                        },
                        {
                            "query": "Conditional probability",
                            "conceptLabel": "Conditional probability",
                            "chunks": [{"chunkId": "chunk_2", "text": "Conditional probability measures P(A|B)."}],
                        },
                    ],
                    "chunks": [
                        {"chunkId": "chunk_1", "text": "Bayes theorem updates prior beliefs."},
                        {"chunkId": "chunk_2", "text": "Conditional probability measures P(A|B)."},
                    ],
                },
            ),
        ]
    }
    preflight = {
        "intent": {"sourcePolicy": "rag_required"},
        "graphReadiness": {
            "status": "finalized",
            "concepts": [
                {
                    "inputRef": "Bayes theorem",
                    "label": "Bayes theorem",
                    "conceptId": "concept_123456789012345678901",
                    "pkgNodeId": "node_123456789012345678901",
                    "ckgNodeId": "node_ckg_123456789012345678",
                },
                {
                    "inputRef": "Conditional probability",
                    "label": "Conditional probability",
                    "conceptId": "concept_223456789012345678901",
                    "pkgNodeId": "node_223456789012345678901",
                    "ckgNodeId": "node_ckg_223456789012345678",
                },
            ],
            "graphPrompt": {
                "serviceContract": {
                    "identityMap": {
                        "concepts": [
                            {
                                "inputRef": "Bayes theorem",
                                "conceptId": "concept_123456789012345678901",
                                "pkgNodeId": "node_123456789012345678901",
                                "ckgNodeId": "node_ckg_123456789012345678",
                            },
                            {
                                "inputRef": "Conditional probability",
                                "conceptId": "concept_223456789012345678901",
                                "pkgNodeId": "node_223456789012345678901",
                                "ckgNodeId": "node_ckg_223456789012345678",
                            },
                        ]
                    }
                }
            },
        },
    }

    result = builder.build(request=request, raw_context=raw_context, preflight=preflight)
    evidence = result["pedagogicalContext"]["ragContext"]["evidenceByConceptRef"]

    assert [item["excerpt"] for item in evidence["c1"]] == ["Bayes theorem updates prior beliefs."]
    assert [item["excerpt"] for item in evidence["c2"]] == [
        "Conditional probability measures P(A|B)."
    ]
