"""Deterministic support helpers for ingestion concept extraction."""

from __future__ import annotations

from collections import Counter
from typing import Any


def summarize_document_structure(ir: dict[str, Any]) -> dict[str, Any]:
    blocks = ir.get("blocks", [])
    outline = ir.get("outline", [])
    if not isinstance(blocks, list):
        blocks = []
    if not isinstance(outline, list):
        outline = []
    block_kinds = Counter(
        block.get("kind", "unknown") for block in blocks if isinstance(block, dict)
    )
    heading_titles = [
        str(block.get("text"))
        for block in outline
        if isinstance(block, dict) and isinstance(block.get("text"), str)
    ]
    return {
        "title": ir.get("title"),
        "language": ir.get("language", "und"),
        "blockCount": len(blocks),
        "sectionCount": len(outline),
        "headingTitles": heading_titles[:12],
        "blockKinds": dict(block_kinds),
        "schemaVersion": ir.get("metadata", {}).get("schemaVersion")
        if isinstance(ir.get("metadata"), dict)
        else None,
    }


def build_chunk_evidence_index(chunks: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for chunk in chunks:
        chunk_id = chunk.get("id")
        if not isinstance(chunk_id, str) or not chunk_id:
            continue
        index[chunk_id] = {
            "chunkId": chunk_id,
            "documentId": chunk.get("documentId"),
            "ordinal": chunk.get("ordinal"),
            "text": chunk.get("text"),
            "headingPath": chunk.get("headingPath", []),
            "pageRef": chunk.get("pageRef"),
            "vectorId": chunk.get("vectorId"),
            "metadata": chunk.get("metadata", {}),
        }
    return index


def build_scan_window_index(
    scan_windows: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for window in scan_windows:
        window_id = window.get("windowId")
        if not isinstance(window_id, str) or not window_id:
            continue
        index[window_id] = {
            "windowId": window_id,
            "ordinal": window.get("ordinal"),
            "text": window.get("text"),
            "headingPath": window.get("headingPath", []),
            "blockIds": window.get("blockIds", []),
            "chunkIds": window.get("chunkIds", []),
            "metadata": window.get("metadata", {}),
        }
    return index


def build_retrieval_seed(
    *,
    chunks: list[dict[str, Any]],
    concept_hints: list[str] | None = None,
    max_items: int = 12,
) -> list[dict[str, Any]]:
    hints = [hint.lower() for hint in (concept_hints or []) if isinstance(hint, str) and hint.strip()]
    scored: list[tuple[int, dict[str, Any]]] = []
    for chunk in chunks:
        text = str(chunk.get("text", ""))
        lowered = text.lower()
        heading_path = chunk.get("headingPath", [])
        score = len(text.split()) // 20
        if isinstance(heading_path, list) and heading_path:
            score += 2
        for hint in hints:
            if hint in lowered:
                score += 6
        scored.append(
            (
                score,
                {
                    "chunkId": chunk.get("id"),
                    "documentId": chunk.get("documentId"),
                    "headingPath": heading_path if isinstance(heading_path, list) else [],
                    "pageRef": chunk.get("pageRef"),
                    "excerpt": text[:480],
                    "score": score,
                },
            )
        )
    scored.sort(key=lambda item: item[0], reverse=True)
    return [item for _score, item in scored[:max_items]]


def build_scan_progression(
    *,
    scan_windows: list[dict[str, Any]],
    max_items: int = 16,
) -> list[dict[str, Any]]:
    progression: list[dict[str, Any]] = []
    for window in scan_windows[:max_items]:
        text = str(window.get("text", "")).strip()
        if not text:
            continue
        progression.append(
            {
                "windowId": window.get("windowId"),
                "ordinal": window.get("ordinal"),
                "headingPath": window.get("headingPath", []),
                "chunkIds": window.get("chunkIds", []),
                "excerpt": text[:640],
                "score": max(1, len(text.split()) // 40),
            }
        )
    return progression


def normalize_concept_candidate(raw: dict[str, Any]) -> dict[str, Any]:
    evidence_chunk_ids = raw.get("evidenceChunkIds", [])
    if not isinstance(evidence_chunk_ids, list):
        evidence_chunk_ids = []
    confidence = _clamp_float(raw.get("confidence", raw.get("salience", 0.55)), 0.0, 1.0)
    salience = _clamp_float(raw.get("salience", confidence), 0.0, 1.0)
    state = raw.get("state")
    if not isinstance(state, str) or not state:
        state = "candidate" if confidence >= 0.45 else "weak_evidence"
    return {
        "label": str(raw.get("label", "Untitled concept")).strip() or "Untitled concept",
        "definition": str(raw.get("definition", "")).strip() or None,
        "evidenceChunkIds": [item for item in evidence_chunk_ids if isinstance(item, str)],
        "salience": salience,
        "confidence": confidence,
        "state": state,
        "rationale": str(raw.get("rationale", "Derived from document sections and chunk evidence.")),
    }


def normalize_mapping_suggestion(raw: dict[str, Any]) -> dict[str, Any]:
    candidate_node_ids = raw.get("candidateNodeIds", [])
    if not isinstance(candidate_node_ids, list):
        candidate_node_ids = []
    decision = raw.get("decision")
    if not isinstance(decision, str) or not decision:
        decision = "proposal_needed"
    return {
        "label": str(raw.get("label", "Untitled concept")).strip() or "Untitled concept",
        "candidateNodeIds": [item for item in candidate_node_ids if isinstance(item, str)],
        "decision": decision,
        "confidence": _clamp_float(raw.get("confidence", 0.5), 0.0, 1.0),
        "reason": str(raw.get("reason", "No mapping rationale provided.")),
        "requiresUserApproval": bool(raw.get("requiresUserApproval", decision != "matched")),
    }


def derive_handoff_recommendations(
    *,
    intent: str,
    concept_candidates: list[dict[str, Any]],
    mapping_suggestions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    strong_concepts = [
        concept
        for concept in concept_candidates
        if float(concept.get("confidence", 0.0)) >= 0.5 and concept.get("state") != "weak_evidence"
    ]
    mapped_labels = {
        str(item.get("label"))
        for item in mapping_suggestions
        if item.get("decision") == "matched"
    }
    cards_payload = {
        "eligibleConceptLabels": [str(item.get("label")) for item in strong_concepts if item.get("label")],
        "mappedConceptLabels": sorted(mapped_labels),
    }
    curriculum_payload = {
        "eligibleConceptLabels": [str(item.get("label")) for item in strong_concepts],
        "recommendedOrdering": [str(item.get("label")) for item in strong_concepts],
    }
    recommendations: list[dict[str, Any]] = [
        {
            "target": "knowledge-graph",
            "allowed": True,
            "reason": "Graph mapping suggestions are always reviewable outputs of extraction.",
            "payload": {"mappingSuggestions": mapping_suggestions},
        }
    ]
    if intent in {"derive_curriculum", "both"}:
        recommendations.append(
            {
                "target": "curriculum-planner",
                "allowed": len(strong_concepts) > 0,
                "reason": "Curriculum seeding requires at least one sufficiently grounded concept.",
                "payload": curriculum_payload,
            }
        )
    if intent in {"seed_cards", "both"}:
        recommendations.append(
            {
                "target": "content-creator-agent",
                "allowed": len(mapped_labels) > 0,
                "reason": "RAG-grounded content should start from mapped or reviewable concepts.",
                "payload": cards_payload,
            }
        )
    if intent == "parse_only":
        recommendations.extend(
            [
                {
                    "target": "curriculum-planner",
                    "allowed": False,
                    "reason": "Upload intent parse_only blocks downstream curriculum handoff.",
                    "payload": {},
                },
                {
                    "target": "content-creator-agent",
                    "allowed": False,
                    "reason": "Upload intent parse_only blocks downstream content handoff.",
                    "payload": {},
                },
            ]
        )
    return recommendations


def build_kg_handoff_payload(
    *,
    concepts: list[dict[str, Any]],
    mapping_suggestions: list[dict[str, Any]],
    document_id: str,
) -> dict[str, Any]:
    return {
        "documentId": document_id,
        "conceptCandidates": concepts,
        "mappingSuggestions": mapping_suggestions,
    }


def build_curriculum_seed_payload(
    *,
    concepts: list[dict[str, Any]],
    document_id: str,
    document_summary: dict[str, Any],
) -> dict[str, Any]:
    return {
        "documentId": document_id,
        "conceptLabels": [str(item.get("label")) for item in concepts],
        "documentSummary": document_summary,
    }


def build_content_seed_payload(
    *,
    concepts: list[dict[str, Any]],
    document_id: str,
    evidence_index: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    concept_payloads: list[dict[str, Any]] = []
    for concept in concepts:
        evidence = [
            evidence_index[chunk_id]
            for chunk_id in concept.get("evidenceChunkIds", [])
            if isinstance(chunk_id, str) and chunk_id in evidence_index
        ]
        concept_payloads.append(
            {
                "label": concept.get("label"),
                "evidence": evidence,
            }
        )
    return {"documentId": document_id, "concepts": concept_payloads}


def _clamp_float(value: Any, minimum: float, maximum: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        parsed = minimum
    return max(minimum, min(maximum, parsed))
