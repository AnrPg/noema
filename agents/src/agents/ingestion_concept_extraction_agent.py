"""Ingestion concept extraction agent."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

from .ingestion_support import (
    build_chunk_evidence_index,
    build_content_seed_payload,
    build_curriculum_seed_payload,
    build_kg_handoff_payload,
    build_retrieval_seed,
    build_scan_progression,
    build_scan_window_index,
    derive_handoff_recommendations,
    normalize_concept_candidate,
    normalize_mapping_suggestion,
    summarize_document_structure,
)

if TYPE_CHECKING:
    from .guardian_client import GuardianClient


class IngestionConceptExtractionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_id: str = Field(alias="userId")
    document_id: str = Field(alias="documentId")
    ingestion_job_id: str | None = Field(default=None, alias="ingestionJobId")
    intent: Literal["parse_only", "derive_curriculum", "seed_cards", "both"]
    study_mode: str | None = Field(default=None, alias="studyMode")
    curriculum_id: str | None = Field(default=None, alias="curriculumId")
    document: dict[str, Any] = Field(default_factory=dict)
    ir: dict[str, Any] = Field(default_factory=dict)
    chunks: list[dict[str, Any]] = Field(default_factory=list)
    scan_windows: list[dict[str, Any]] = Field(default_factory=list, alias="scanWindows")
    retrieval_seed: list[dict[str, Any]] = Field(default_factory=list, alias="retrievalSeed")
    context_pack: dict[str, Any] = Field(default_factory=dict, alias="contextPack")
    provider: str | None = None
    model: str | None = None
    agent_run_id: str | None = Field(default=None, alias="agentRunId")
    execution_strategy: str = Field(default="realtime", alias="executionStrategy")
    batch_requested: bool = Field(default=False, alias="batchRequested")


class IngestionConceptExtractionAgent:
    def __init__(self, guardian: GuardianClient | None = None) -> None:
        self._guardian = guardian

    async def extract(self, request: IngestionConceptExtractionRequest) -> dict[str, Any]:
        chunk_index = build_chunk_evidence_index(request.chunks)
        scan_window_index = build_scan_window_index(request.scan_windows)
        scan_progression = (
            build_scan_progression(scan_windows=request.scan_windows)
            if request.scan_windows
            else []
        )
        retrieval_seed = (
            request.retrieval_seed
            if request.retrieval_seed
            else build_retrieval_seed(chunks=request.chunks, concept_hints=self._concept_hints(request))
        )
        document_summary = summarize_document_structure(request.ir)
        section_summaries = self._section_summaries(request)
        concept_candidates = self._derive_concept_candidates(
            request,
            scan_progression=scan_progression,
            fallback_seed=retrieval_seed,
        )
        mapping_suggestions = self._derive_mapping_suggestions(request, concept_candidates)
        handoff_recommendations = derive_handoff_recommendations(
            intent=request.intent,
            concept_candidates=concept_candidates,
            mapping_suggestions=mapping_suggestions,
        )
        for item in handoff_recommendations:
            target = item.get("target")
            if target == "knowledge-graph":
                item["payload"] = build_kg_handoff_payload(
                    concepts=concept_candidates,
                    mapping_suggestions=mapping_suggestions,
                    document_id=request.document_id,
                )
            elif target == "curriculum-planner":
                item["payload"] = build_curriculum_seed_payload(
                    concepts=concept_candidates,
                    document_id=request.document_id,
                    document_summary=document_summary,
                )
            elif target == "content-creator-agent":
                item["payload"] = build_content_seed_payload(
                    concepts=concept_candidates,
                    document_id=request.document_id,
                    evidence_index=chunk_index,
                )
        generated = {
            "documentSummary": document_summary,
            "sectionSummaries": section_summaries,
            "conceptCandidates": concept_candidates,
            "mappingSuggestions": mapping_suggestions,
            "handoffRecommendations": handoff_recommendations,
            "parseWarnings": self._parse_warnings(request),
            "groundingReport": self._grounding_report(
                request,
                scan_progression=scan_progression,
                fallback_seed=retrieval_seed,
                scan_window_index=scan_window_index,
            ),
        }
        return await self.finalize_extraction(generated=generated, request=request)

    async def finalize_extraction(
        self,
        *,
        generated: dict[str, Any],
        request: IngestionConceptExtractionRequest,
    ) -> dict[str, Any]:
        run_id = request.agent_run_id or _new_agent_run_id()
        concept_candidates = [
            normalize_concept_candidate(item)
            for item in _as_dict_list(generated.get("conceptCandidates"))
        ]
        mapping_suggestions = [
            normalize_mapping_suggestion(item)
            for item in _as_dict_list(generated.get("mappingSuggestions"))
        ]
        return {
            "agentRunId": run_id,
            "documentSummary": generated.get("documentSummary", summarize_document_structure(request.ir)),
            "sectionSummaries": _as_dict_list(generated.get("sectionSummaries")),
            "conceptCandidates": concept_candidates,
            "mappingSuggestions": mapping_suggestions,
            "handoffRecommendations": _as_dict_list(generated.get("handoffRecommendations")),
            "parseWarnings": _as_dict_list(generated.get("parseWarnings")),
            "groundingReport": generated.get(
                "groundingReport",
                self._grounding_report(
                    request,
                    scan_progression=build_scan_progression(scan_windows=request.scan_windows),
                    fallback_seed=request.retrieval_seed,
                    scan_window_index=build_scan_window_index(request.scan_windows),
                ),
            ),
            "costEstimate": generated.get(
                "costEstimate",
                {
                    "units": len(concept_candidates) + len(mapping_suggestions),
                    "scanWindowCount": len(request.scan_windows),
                    "retrievalSeedCount": len(request.retrieval_seed),
                },
            ),
            "execution": {
                "provider": request.provider,
                "model": request.model,
                "strategy": request.execution_strategy,
                "batchRequested": request.batch_requested,
            },
        }

    async def suggest_graph_actions(
        self,
        *,
        concepts: list[dict[str, Any]],
        request: IngestionConceptExtractionRequest,
    ) -> dict[str, Any]:
        mapping_suggestions = self._derive_mapping_suggestions(request, concepts)
        return {
            "documentId": request.document_id,
            "mappingSuggestions": mapping_suggestions,
            "handoff": build_kg_handoff_payload(
                concepts=concepts,
                mapping_suggestions=mapping_suggestions,
                document_id=request.document_id,
            ),
        }

    def _section_summaries(self, request: IngestionConceptExtractionRequest) -> list[dict[str, Any]]:
        blocks = request.ir.get("blocks", [])
        if not isinstance(blocks, list):
            return []
        summaries: list[dict[str, Any]] = []
        for block in blocks:
            if not isinstance(block, dict):
                continue
            text = block.get("text")
            if not isinstance(text, str) or not text.strip():
                continue
            heading_path = block.get("metadata", {}).get("headingPath", [])
            if not isinstance(heading_path, list):
                heading_path = []
            summaries.append(
                {
                    "sectionPath": [str(item) for item in heading_path],
                    "summary": text[:240],
                }
            )
        return summaries[:24]

    def _derive_concept_candidates(
        self,
        request: IngestionConceptExtractionRequest,
        *,
        scan_progression: list[dict[str, Any]],
        fallback_seed: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        candidates: list[dict[str, Any]] = []
        seen_labels: set[str] = set()
        graph_matches = self._graph_match_lookup(request.context_pack)
        evidence_items = scan_progression if scan_progression else fallback_seed
        for item in evidence_items:
            excerpt = item.get("excerpt")
            if not isinstance(excerpt, str):
                continue
            label = self._label_from_excerpt(excerpt, item.get("headingPath"))
            normalized_label = label.lower()
            if normalized_label in seen_labels:
                continue
            seen_labels.add(normalized_label)
            rationale = (
                "Derived from sequential scan-window evidence across the normalized document text."
                if scan_progression
                else "Derived from fallback chunk evidence because no scan windows were available."
            )
            if normalized_label in graph_matches:
                rationale = (
                    f"{rationale} Existing graph matches were prefetched for '{label}', "
                    "so the candidate can be compared against known concepts."
                )
            evidence_chunk_ids = item.get("chunkIds", [])
            if not isinstance(evidence_chunk_ids, list):
                evidence_chunk_ids = [item.get("chunkId")] if item.get("chunkId") else []
            candidates.append(
                normalize_concept_candidate(
                    {
                        "label": label,
                        "definition": excerpt[:180],
                        "evidenceChunkIds": [
                            chunk_id for chunk_id in evidence_chunk_ids if isinstance(chunk_id, str)
                        ],
                        "salience": min(0.95, 0.45 + (float(item.get("score", 0)) * 0.03)),
                        "confidence": min(0.92, 0.4 + (float(item.get("score", 0)) * 0.025)),
                        "state": "candidate" if float(item.get("score", 0)) >= 2 else "weak_evidence",
                        "rationale": rationale,
                    }
                )
            )
        if not candidates and request.chunks:
            fallback_chunk = request.chunks[0]
            candidates.append(
                normalize_concept_candidate(
                    {
                        "label": self._label_from_excerpt(str(fallback_chunk.get("text", "")), []),
                        "definition": str(fallback_chunk.get("text", ""))[:180],
                        "evidenceChunkIds": [fallback_chunk.get("id")] if fallback_chunk.get("id") else [],
                        "salience": 0.4,
                        "confidence": 0.35,
                        "state": "weak_evidence",
                        "rationale": "Fallback candidate created because no stronger extraction evidence was found.",
                    }
                )
            )
        return candidates

    def _derive_mapping_suggestions(
        self,
        request: IngestionConceptExtractionRequest,
        concept_candidates: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        graph_matches = self._graph_match_lookup(request.context_pack)
        suggestions: list[dict[str, Any]] = []
        for candidate in concept_candidates:
            label = str(candidate.get("label", ""))
            matches = graph_matches.get(label.lower(), [])
            if len(matches) == 1:
                match = matches[0]
                suggestions.append(
                    normalize_mapping_suggestion(
                        {
                            "label": label,
                            "candidateNodeIds": [match.get("nodeId")] if match.get("nodeId") else [],
                            "decision": "matched",
                            "confidence": 0.88,
                            "reason": "Prefetched graph match strongly aligns with the extracted label.",
                            "requiresUserApproval": False,
                        }
                    )
                )
                continue
            if len(matches) > 1:
                suggestions.append(
                    normalize_mapping_suggestion(
                        {
                            "label": label,
                            "candidateNodeIds": [
                                match.get("nodeId")
                                for match in matches
                                if isinstance(match.get("nodeId"), str)
                            ],
                            "decision": "ambiguous",
                            "confidence": 0.52,
                            "reason": "Several prefetched graph matches look plausible for this label.",
                            "requiresUserApproval": True,
                        }
                    )
                )
                continue
            suggestions.append(
                normalize_mapping_suggestion(
                    {
                        "label": label,
                        "candidateNodeIds": [],
                        "decision": "proposal_needed",
                        "confidence": float(candidate.get("confidence", 0.4)),
                        "reason": "No confident graph match was prefetched, so this should become a reviewable proposal.",
                        "requiresUserApproval": True,
                    }
                )
            )
        return suggestions

    def _parse_warnings(self, request: IngestionConceptExtractionRequest) -> list[dict[str, Any]]:
        warnings: list[dict[str, Any]] = []
        document_context = self._section_value(request.context_pack, "documentContext")
        if isinstance(document_context, dict):
            parse_warnings = document_context.get("parseWarnings", [])
            if isinstance(parse_warnings, list):
                warnings.extend(item for item in parse_warnings if isinstance(item, dict))
            ocr_status = document_context.get("ocrStatus")
            if isinstance(ocr_status, str) and ocr_status in {"recommended", "required"}:
                warnings.append(
                    {
                        "code": "OCR_SUGGESTED",
                        "message": "OCR or reparse is recommended before high-confidence handoffs.",
                    }
                )
        if not request.chunks:
            warnings.append(
                {
                    "code": "NO_CHUNKS",
                    "message": "No document chunks were available for extraction.",
                }
            )
        if not request.scan_windows:
            warnings.append(
                {
                    "code": "NO_SCAN_WINDOWS",
                    "message": "Whole-document scan windows were unavailable, so extraction fell back to chunk-level evidence.",
                }
            )
        return warnings

    def _grounding_report(
        self,
        request: IngestionConceptExtractionRequest,
        *,
        scan_progression: list[dict[str, Any]],
        fallback_seed: list[dict[str, Any]],
        scan_window_index: dict[str, dict[str, Any]],
    ) -> dict[str, Any]:
        return {
            "documentId": request.document_id,
            "intent": request.intent,
            "documentTitle": request.document.get("title"),
            "scanWindowCount": len(request.scan_windows),
            "scanProgressionCount": len(scan_progression),
            "retrievalSeedCount": len(fallback_seed),
            "scanCoverage": {
                "windowIds": list(scan_window_index)[:12],
                "chunkBackedWindows": sum(
                    1
                    for window in scan_window_index.values()
                    if isinstance(window.get("chunkIds"), list) and len(window["chunkIds"]) > 0
                ),
            },
            "contextSummary": request.context_pack.get("summary"),
            "prefetchErrors": request.context_pack.get("errors", []),
        }

    def _graph_match_lookup(self, context_pack: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
        section_value = self._section_value(context_pack, "existingGraphMatches")
        if not isinstance(section_value, dict):
            return {}
        items = section_value.get("items", section_value.get("matches", []))
        if not isinstance(items, list):
            return {}
        lookup: dict[str, list[dict[str, Any]]] = {}
        for item in items:
            if not isinstance(item, dict):
                continue
            label = item.get("label")
            if not isinstance(label, str) or not label.strip():
                continue
            lookup.setdefault(label.lower(), []).append(item)
        return lookup

    def _concept_hints(self, request: IngestionConceptExtractionRequest) -> list[str]:
        value = self._section_value(request.context_pack, "existingGraphMatches")
        if not isinstance(value, dict):
            return []
        items = value.get("items", value.get("matches", []))
        if not isinstance(items, list):
            return []
        return [
            item["label"]
            for item in items
            if isinstance(item, dict) and isinstance(item.get("label"), str)
        ]

    def _section_value(self, context_pack: dict[str, Any], key: str) -> Any:
        sections = context_pack.get("sections", [])
        if not isinstance(sections, list):
            return None
        for section in sections:
            if isinstance(section, dict) and section.get("key") == key:
                return section.get("value")
        return None

    def _label_from_excerpt(self, excerpt: str, heading_path: Any) -> str:
        if isinstance(heading_path, list) and heading_path:
            first = heading_path[-1]
            if isinstance(first, str) and first.strip():
                return first.strip()[:120]
        words = [word.strip(".,:;()[]{}") for word in excerpt.split()]
        title_words = [word for word in words[:6] if word]
        return " ".join(title_words)[:120] or "Document concept"


def _as_dict_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _new_agent_run_id() -> str:
    return f"agentrun_{uuid4().hex[:24]}"
