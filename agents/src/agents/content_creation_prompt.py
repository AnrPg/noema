"""Canonical ContentCreationPromptV2 assembly.

The builder is intentionally deterministic: it translates prefetched service
facts and finalized preflight-agent artifacts into the prompt contract. The
content creator receives this object as context and never calls tools itself.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any


REASONING_RULE = (
    "Reason only from human-readable pedagogicalContext, groundingReport, and readiness signals. "
    "Treat serviceContract as a transport contract for IDs, schema compliance, and downstream handoff only. "
    "Never derive pedagogy from IDs, mappings, or downstream handoff fields."
)
GRAPH_SOURCE = "graph-intervention-orchestrator"
GRAPH_MAPPER = "GraphAgentPromptV1 -> ContentCreationPromptV2 mapper"


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _pop(mode: str, source: str, notes: str | None = None) -> dict[str, Any]:
    value = {"mode": mode, "source": source}
    if notes:
        value["notes"] = notes
    return value


def _graph_pop() -> dict[str, Any]:
    return _pop("deterministic_prefetch", GRAPH_SOURCE, GRAPH_MAPPER)


def _entry(
    field_path: str,
    *,
    mode: str,
    source: str,
    status: str = "populated",
    tool_or_function: str | None = None,
    agent_name: str | None = None,
    input_value: Any = None,
    error: Any = None,
) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "fieldPath": field_path,
        "mode": mode,
        "source": source,
        "status": status,
    }
    if tool_or_function:
        entry["toolOrFunction"] = tool_or_function
    if agent_name:
        entry["agentName"] = agent_name
    if input_value is not None:
        entry["input"] = input_value
    if error is not None:
        entry["error"] = error
    return entry


def _section_map(sections: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(sections, list):
        return {}
    result: dict[str, dict[str, Any]] = {}
    for section in sections:
        if isinstance(section, dict) and isinstance(section.get("key"), str):
            result[section["key"]] = section
    return result


def _section_value(sections: dict[str, dict[str, Any]], key: str) -> Any:
    section = sections.get(key)
    return None if section is None else section.get("value")


def _items(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        for key in ("items", "nodes", "concepts", "cards", "generatedVariants", "variants"):
            nested = value.get(key)
            if isinstance(nested, list):
                return [item for item in nested if isinstance(item, dict)]
        return [value]
    return []


def _string(value: Any, default: str = "") -> str:
    return value if isinstance(value, str) and value else default


def _nullable_string(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def _strings(value: Any) -> list[str]:
    return [item for item in value if isinstance(item, str)] if isinstance(value, list) else []


def _is_concept_id(value: str) -> bool:
    return value.startswith("concept_")


def _is_node_id(value: str) -> bool:
    return value.startswith("node_")


def _label_from_ref(value: str) -> str:
    for prefix in ("concept_", "node_", "kg_"):
        if value.startswith(prefix):
            tail = value[len(prefix):]
            if any(ch.isupper() for ch in tail):
                return value
            return tail.replace("_", " ").replace("-", " ").title()
    return value.replace("_", " ").replace("-", " ").title()


def _node_label(node: Any, fallback: str) -> str:
    if isinstance(node, dict):
        for key in ("label", "name", "title"):
            value = node.get(key)
            if isinstance(value, str) and value:
                return value
        data = node.get("data")
        if isinstance(data, dict):
            return _node_label(data, fallback)
    return fallback


def _node_description(node: Any) -> str | None:
    if isinstance(node, dict):
        for key in ("description", "summary", "learnerFacingSummary"):
            value = node.get(key)
            if isinstance(value, str) and value:
                return value
        data = node.get("data")
        if isinstance(data, dict):
            return _node_description(data)
    return None


def _node_domain(node: Any) -> str | None:
    if isinstance(node, dict):
        value = node.get("domain")
        if isinstance(value, str) and value:
            return value
        data = node.get("data")
        if isinstance(data, dict):
            return _node_domain(data)
    return None


def _node_aliases(node: Any) -> list[str]:
    if isinstance(node, dict):
        aliases = node.get("aliases")
        if isinstance(aliases, list):
            return [item for item in aliases if isinstance(item, str)]
        data = node.get("data")
        if isinstance(data, dict):
            return _node_aliases(data)
    return []


def _node_id(node: Any) -> str | None:
    if isinstance(node, dict):
        for key in ("nodeId", "id", "pkgNodeId"):
            value = node.get(key)
            if isinstance(value, str) and _is_node_id(value):
                return value
        data = node.get("data")
        if isinstance(data, dict):
            return _node_id(data)
    return None


def _concept_id(node: Any) -> str | None:
    if isinstance(node, dict):
        for key in ("conceptId", "ckgConceptId", "canonicalConceptId"):
            value = node.get(key)
            if isinstance(value, str) and _is_concept_id(value):
                return value
        data = node.get("data")
        if isinstance(data, dict):
            return _concept_id(data)
    return None


def _relation_pack(items: list[dict[str, Any]], relation: str, source: str) -> dict[str, Any]:
    packed = []
    for item in items:
        label = _node_label(item, _string(item.get("label") or item.get("name"), relation))
        packed.append(
            {
                "label": label,
                "relationship": _string(item.get("relationship") or item.get("edgeType"), relation),
                "explanation": _nullable_string(item.get("explanation") or item.get("rationale")),
            }
        )
    return {
        "items": packed,
        "population": _pop("deterministic_prefetch", source),
    }


def _graph_relation_pack(items: list[dict[str, Any]], relation: str) -> dict[str, Any]:
    packed = []
    for item in items:
        label = _string(item.get("sourceLabel") or item.get("label") or item.get("targetLabel"), relation)
        packed.append(
            {
                "label": label,
                "relationship": _string(item.get("relationship"), relation),
                "explanation": _nullable_string(item.get("explanation")),
            }
        )
    return {"items": packed, "population": _graph_pop()}


def _readable_cards(value: Any) -> list[dict[str, Any]]:
    cards = []
    for item in _items(value):
        content = item.get("content") if isinstance(item.get("content"), dict) else {}
        cards.append(
            {
                "cardRef": _string(item.get("id") or item.get("cardId"), "card_unknown"),
                "cardType": _string(item.get("cardType"), "unknown"),
                "front": _string(content.get("front") or item.get("front")),
                "backSummary": _string(content.get("back") or item.get("backSummary")),
                "difficulty": _string(item.get("difficulty"), "intermediate"),
                "tags": _strings(item.get("tags")),
            }
        )
    return cards


def _readable_variants(value: Any) -> list[dict[str, Any]]:
    variants = []
    raw = []
    if isinstance(value, dict):
        raw = value.get("generatedVariants") or value.get("existingActivityVariants") or value.get("items") or []
    elif isinstance(value, list):
        raw = value
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        variants.append(
            {
                "variantRef": _string(item.get("id") or item.get("variantId"), "variant_unknown"),
                "prompt": _string(item.get("prompt")),
                "transformationType": _string(item.get("transformationType"), "explanation"),
                "difficultyBucket": int(item.get("difficultyBucket", 2)),
            }
        )
    return variants


def _document_context(value: Any, document_id: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {
            "documentRef": document_id,
            "title": document_id,
            "outline": None,
            "sourceKind": None,
        }
    return {
        "documentRef": document_id,
        "title": _string(value.get("title") or value.get("fileName"), document_id),
        "outline": value.get("outline") if value.get("outline") is not None else value.get("ir"),
        "sourceKind": _nullable_string(value.get("sourceKind") or value.get("mimeKind")),
    }


def _chunk_evidence(value: Any, document_ref: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    chunks = value.get("chunks") if isinstance(value, dict) else value
    evidence: list[dict[str, Any]] = []
    manifest_chunks: list[dict[str, Any]] = []
    if not isinstance(chunks, list):
        return evidence, manifest_chunks
    for index, item in enumerate(chunks):
        if not isinstance(item, dict):
            continue
        item_evidence, manifest = _chunk_entry(item, document_ref, index)
        evidence.append(item_evidence)
        manifest_chunks.append(manifest)
    return evidence, manifest_chunks


def _normalize_label(value: str) -> str:
    return " ".join(value.casefold().replace("_", " ").replace("-", " ").split())


def _chunk_ref(document_ref: str, index: int) -> str:
    return f"{document_ref}:chunk:{index + 1}"


def _chunk_entry(item: dict[str, Any], document_ref: str, index: int) -> tuple[dict[str, Any], dict[str, Any]]:
    chunk_ref = _chunk_ref(document_ref, index)
    chunk_id = item.get("chunkId") or item.get("id")
    evidence = {
        "documentRef": document_ref,
        "chunkRef": chunk_ref,
        "excerpt": _string(item.get("excerpt") or item.get("text") or item.get("content")),
        "locator": _nullable_string(item.get("locator") or item.get("page")),
        "citationLabel": _string(item.get("citationLabel"), f"{document_ref} #{index + 1}"),
        "confidence": item.get("score") if isinstance(item.get("score"), (int, float)) else None,
    }
    manifest = {
        "chunkRef": chunk_ref,
        "chunkId": chunk_id if isinstance(chunk_id, str) else None,
        "documentRef": document_ref,
    }
    return evidence, manifest


def _rag_evidence_by_label(
    value: Any, document_ref: str
) -> tuple[dict[str, list[dict[str, Any]]], list[dict[str, Any]], list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    manifest_chunks: list[dict[str, Any]] = []
    all_evidence: list[dict[str, Any]] = []
    if not isinstance(value, dict):
        evidence, manifest = _chunk_evidence(value, document_ref)
        return grouped, evidence, manifest

    matches = value.get("matches")
    if not isinstance(matches, list):
        evidence, manifest = _chunk_evidence(value, document_ref)
        return grouped, evidence, manifest

    seen_chunk_keys: set[str] = set()
    for match in matches:
        if not isinstance(match, dict):
            continue
        label = _nullable_string(match.get("conceptLabel") or match.get("query"))
        if label is None:
            continue
        normalized = _normalize_label(label)
        chunks = match.get("chunks")
        if not isinstance(chunks, list):
            continue
        for item in chunks:
            if not isinstance(item, dict):
                continue
            item_evidence, manifest = _chunk_entry(item, document_ref, len(manifest_chunks))
            grouped.setdefault(normalized, []).append(item_evidence)
            manifest_chunks.append(manifest)
            chunk_key = (
                manifest["chunkId"] if isinstance(manifest.get("chunkId"), str) else item_evidence["chunkRef"]
            )
            if chunk_key in seen_chunk_keys:
                continue
            seen_chunk_keys.add(chunk_key)
            all_evidence.append(item_evidence)
    return grouped, all_evidence, manifest_chunks


class ContentCreationPromptBuilder:
    """Build and validate readiness for ContentCreationPromptV2."""

    def build(
        self,
        *,
        request: Any,
        raw_context: dict[str, Any],
        run_id: str | None = None,
        preflight: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload = getattr(request, "payload", {}) or {}
        concept_ids = list(getattr(request, "concept_ids", []) or payload.get("conceptIds", []))
        selected_node_ids = list(getattr(request, "selected_node_ids", []) or payload.get("selectedNodeIds", []))
        document_ids = list(getattr(request, "document_ids", []) or payload.get("documentIds", []))
        study_mode = getattr(request, "study_mode", None) or payload.get("studyMode") or "knowledge_gaining"
        user_id = getattr(request, "user_id", None) or payload.get("userId") or "user_unknown"
        curriculum_id = getattr(request, "curriculum_id", None) or payload.get("curriculumId")
        sections = _section_map(raw_context.get("sections"))
        preflight = preflight or payload.get("preflightArtifacts") or {}

        call_time: list[dict[str, Any]] = []
        deterministic: list[dict[str, Any]] = []
        static_policy: list[dict[str, Any]] = []
        generated: list[dict[str, Any]] = []
        unavailable: list[dict[str, Any]] = []
        uncertainties: list[dict[str, Any]] = []

        def record(entry: dict[str, Any]) -> None:
            mode = entry["mode"]
            if mode == "deterministic_prefetch":
                deterministic.append(entry)
            elif mode == "static_policy":
                static_policy.append(entry)
            elif mode == "call_time":
                call_time.append(entry)
            elif mode == "llm_generated_by_agent":
                generated.append(entry)
            else:
                unavailable.append(entry)

        intent = preflight.get("intent") if isinstance(preflight.get("intent"), dict) else {}
        source_policy = _string(intent.get("sourcePolicy") or payload.get("sourcePolicy"), "rag_allowed")
        prompt_source_policy = {
            "rag_required": "required",
            "rag_allowed": "allowed",
            "autonomous_allowed": "not_used",
        }.get(source_policy, "allowed")
        artifact_scope = _string(
            intent.get("artifactScope") or payload.get("artifactScope"),
            "cards_and_activity_variants",
        )
        variety = preflight.get("pedagogyPlan") if isinstance(preflight.get("pedagogyPlan"), dict) else {}
        min_distinct = int(
            payload.get("varietyMandate", {}).get("minDistinctTypesPerConcept", 3)
            if isinstance(payload.get("varietyMandate"), dict)
            else 3
        )

        concepts = []
        concept_identity = []
        learner_by_ref: dict[str, Any] = {}
        prereqs: dict[str, Any] = {}
        related: dict[str, Any] = {}
        contrasts: dict[str, Any] = {}
        confusables: dict[str, Any] = {}
        misconceptions: dict[str, Any] = {}
        coverage_by_ref: dict[str, Any] = {}
        difficulty_by_ref: dict[str, str] = {}
        evidence_by_ref: dict[str, list[dict[str, Any]]] = {}

        graph_readiness = preflight.get("graphReadiness") if isinstance(preflight.get("graphReadiness"), dict) else {}
        graph_status = graph_readiness.get("status")
        graph_anchoring_policy = _string(payload.get("graphAnchoringPolicy"), "required")
        graph_anchoring_required = graph_anchoring_policy != "unanchored_draft_allowed"
        if graph_anchoring_required and graph_status != "finalized":
            uncertainties.append(
                {
                    "code": "graph_readiness_not_finalized",
                    "message": "Graph-anchored content requires a finalized GraphReadinessReportV1.",
                    "affectedRefs": concept_ids,
                    "source": "partial_data",
                }
            )
        readiness_by_input = {
            str(item.get("inputRef") or item.get("conceptId") or item.get("label")): item
            for item in graph_readiness.get("concepts", [])
            if isinstance(item, dict)
        } if isinstance(graph_readiness.get("concepts"), list) else {}
        graph_identity_by_ref = {}
        graph_prompt = graph_readiness.get("graphPrompt") if isinstance(graph_readiness.get("graphPrompt"), dict) else {}
        graph_service_contract = graph_prompt.get("serviceContract") if isinstance(graph_prompt.get("serviceContract"), dict) else {}
        graph_identity_map = graph_service_contract.get("identityMap") if isinstance(graph_service_contract.get("identityMap"), dict) else {}
        for item in graph_identity_map.get("concepts", []) if isinstance(graph_identity_map.get("concepts"), list) else []:
            if isinstance(item, dict) and isinstance(item.get("inputRef"), str):
                graph_identity_by_ref[item["inputRef"]] = item

        for index, input_ref in enumerate(concept_ids):
            concept_ref = f"c{index + 1}"
            selected_ids = [selected_node_ids[index]] if index < len(selected_node_ids) else []
            resolved = readiness_by_input.get(input_ref, {})
            graph_identity = graph_identity_by_ref.get(input_ref, {})
            label = _string(resolved.get("label"), _label_from_ref(input_ref))
            concept_id = _nullable_string(resolved.get("conceptId") or graph_identity.get("conceptId"))
            pkg_node_id = _nullable_string(resolved.get("pkgNodeId") or graph_identity.get("pkgNodeId"))
            ckg_node_id = _nullable_string(resolved.get("ckgNodeId") or graph_identity.get("ckgNodeId"))
            concepts.append(
                {
                    "conceptRef": concept_ref,
                    "label": label,
                    "description": _nullable_string(resolved.get("description")),
                    "domain": _nullable_string(resolved.get("domain")),
                    "studyMode": study_mode,
                    "aliases": _strings(resolved.get("aliases")),
                    "learnerFacingSummary": _nullable_string(resolved.get("learnerFacingSummary")),
                    "population": _graph_pop(),
                }
            )
            concept_identity.append(
                {
                    "conceptRef": concept_ref,
                    "inputRef": input_ref,
                    "conceptId": concept_id,
                    "pkgNodeId": pkg_node_id,
                    "ckgNodeId": ckg_node_id,
                    "selectedNodeIds": selected_ids,
                }
            )
            if not (pkg_node_id or ckg_node_id):
                uncertainties.append(
                    {
                        "code": "graph_identity_incomplete",
                        "message": f"Concept {input_ref} is missing a graph node ID.",
                        "affectedRefs": [concept_ref],
                        "source": "unresolved_ref",
                    }
                )

            prereqs[concept_ref] = _graph_relation_pack(_items(resolved.get("prerequisites")), "prerequisite")
            related[concept_ref] = _graph_relation_pack(_items(resolved.get("relatedConcepts")), "related")
            contrasts[concept_ref] = _graph_relation_pack(_items(resolved.get("contrasts")), "contrasts_with")
            confusables[concept_ref] = _graph_relation_pack(_items(resolved.get("confusables")), "confusable_with")
            misconceptions[concept_ref] = _graph_relation_pack(_items(resolved.get("misconceptionLinks")), "misconception")

            schedule = _section_value(sections, f"learnerSchedule:{input_ref}")
            reasoning = _section_value(sections, f"learnerReasoning:{input_ref}")
            learner_summary = preflight.get("learnerStateSummary", {})
            by_concept = learner_summary.get("byConceptRef", {}) if isinstance(learner_summary, dict) else {}
            preflight_concept = by_concept.get(concept_ref, {}) if isinstance(by_concept, dict) else {}
            learner_by_ref[concept_ref] = {
                "scheduleState": schedule,
                "stabilityLabel": _nullable_string(preflight_concept.get("stabilityLabel") if isinstance(preflight_concept, dict) else None),
                "reasoningAverage": reasoning,
                "confidenceCalibration": preflight_concept.get("confidenceCalibration") if isinstance(preflight_concept, dict) else None,
                "recentFailureModes": preflight_concept.get("recentFailureModes", []) if isinstance(preflight_concept, dict) else [],
                "misconceptionSignals": preflight_concept.get("misconceptionSignals", []) if isinstance(preflight_concept, dict) else [],
                "recommendedRepairMove": _nullable_string(preflight_concept.get("recommendedRepairMove") if isinstance(preflight_concept, dict) else None),
                "difficultyRecommendation": _nullable_string(preflight_concept.get("difficultyRecommendation") if isinstance(preflight_concept, dict) else None),
                "population": _pop("deterministic_prefetch", "scheduler-service/metacognition-service"),
            }
            coverage = _section_value(sections, f"contentCoverage:{input_ref}") or {}
            existing = _section_value(sections, f"existingContent:{input_ref}") or {}
            generated_variants = _section_value(sections, f"generatedActivityVariants:{input_ref}") or coverage
            coverage_by_ref[concept_ref] = {
                "existingCards": _readable_cards(existing),
                "existingActivityVariants": _readable_variants(generated_variants),
                "coverageSummary": _nullable_string(coverage.get("coverageSummary") if isinstance(coverage, dict) else None),
                "missingCardTypes": _strings(coverage.get("missingCardTypes") if isinstance(coverage, dict) else []),
                "missingActivityTypes": _strings(coverage.get("missingActivityTypes") if isinstance(coverage, dict) else []),
                "duplicateRisks": _strings(coverage.get("duplicateRisks") if isinstance(coverage, dict) else []),
                "population": _pop("deterministic_prefetch", "content-service"),
            }
            difficulty_by_ref[concept_ref] = _string(
                variety.get("difficultyTargetsByConceptRef", {}).get(concept_ref)
                if isinstance(variety.get("difficultyTargetsByConceptRef"), dict)
                else None,
                "intermediate",
            )
            evidence_by_ref[concept_ref] = []

        documents = []
        chunks_manifest = []
        unscoped_evidence: list[dict[str, Any]] = []
        concept_label_by_ref = {
            item["conceptRef"]: _normalize_label(item["label"])
            for item in concepts
            if isinstance(item.get("conceptRef"), str) and isinstance(item.get("label"), str)
        }
        for document_index, document_id in enumerate(document_ids):
            document_ref = f"d{document_index + 1}"
            document_value = _section_value(sections, f"sourceDocument:{document_id}")
            documents.append(_document_context(document_value, document_ref))
            grouped_evidence, evidence, chunk_entries = _rag_evidence_by_label(
                _section_value(sections, f"ragGrounding:{document_id}"), document_ref
            )
            chunks_manifest.extend(chunk_entries)
            if len(evidence_by_ref) == 1 and not grouped_evidence:
                unscoped_evidence.extend(evidence)
            for concept_ref, normalized_label in concept_label_by_ref.items():
                evidence_by_ref[concept_ref].extend(grouped_evidence.get(normalized_label, []))

        if len(evidence_by_ref) == 1 and unscoped_evidence:
            only_ref = next(iter(evidence_by_ref))
            evidence_by_ref[only_ref].extend(unscoped_evidence)

        if prompt_source_policy == "required" and not any(evidence_by_ref.values()):
            uncertainties.append(
                {
                    "code": "rag_evidence_missing",
                    "message": "RAG-required content creation has no retrieved evidence.",
                    "affectedRefs": list(evidence_by_ref),
                    "source": "partial_data",
                }
            )

        learner_summary = preflight.get("learnerStateSummary") if isinstance(preflight.get("learnerStateSummary"), dict) else {}
        learner_global = learner_summary.get("global", {}) if isinstance(learner_summary.get("global"), dict) else {}
        if learner_global.get("currentMood") is None:
            record(
                _entry(
                    "pedagogicalContext.learnerState.global.currentMood",
                    mode="deterministic_prefetch",
                    source="learner-state-summarizer-agent",
                    status="populated",
                    agent_name="learner-state-summarizer-agent",
                )
            )

        for field in (
            "pedagogicalContext.learnerState",
            "pedagogicalContext.curriculumContext",
            "pedagogicalContext.contentCoverageContext",
            "pedagogicalContext.ragContext",
        ):
            record(_entry(field, mode="deterministic_prefetch", source="ContentCreationPromptBuilder"))
        for field in ("pedagogicalContext.targetConcepts", "pedagogicalContext.conceptRelations", "serviceContract.identityMap"):
            record(_entry(field, mode="deterministic_prefetch", source=GRAPH_SOURCE, tool_or_function=GRAPH_MAPPER))
        for field in ("pedagogicalContext.guardianPolicy", "pedagogicalContext.outputPedagogy.responseExpectations", "serviceContract.mappings"):
            record(_entry(field, mode="static_policy", source="ContentCreationPromptBuilder"))
        for field in ("pedagogicalContext.generationIntent", "serviceContract.requestValues"):
            record(_entry(field, mode="call_time", source="caller"))
        record(
            _entry(
                "pedagogicalContext.outputPedagogy.difficultyTargetsByConceptRef",
                mode="llm_generated_by_agent",
                source="content-pedagogy-planner-agent",
                agent_name="content-pedagogy-planner-agent",
            )
        )

        prompt = {
            "schemaVersion": "content_creation_prompt.v2",
            "promptProfileVersion": "content-operation-profile.v1",
            "instructions": {"reasoningRule": REASONING_RULE},
            "pedagogicalContext": {
                "generationIntent": {
                    "operationName": _string(
                        getattr(request, "operation_name", None)
                        or payload.get("operationName")
                        or intent.get("operationName"),
                        "authoring_assistance",
                    ),
                    "trigger": _string(intent.get("trigger") or payload.get("trigger"), "manual_author_request"),
                    "purpose": _string(intent.get("purpose") or payload.get("purpose"), "Create reviewable learning content for the requested concepts."),
                    "pedagogicalMove": _string(intent.get("pedagogicalMove") or payload.get("pedagogicalMove"), "reinforce"),
                    "artifactScope": artifact_scope,
                    "sourcePolicy": source_policy,
                    "personalizationPolicy": _string(intent.get("personalizationPolicy"), "concept_state"),
                    "population": _pop("call_time", "caller/content-intent-normalizer-agent"),
                },
                "targetConcepts": concepts,
                "conceptRelations": {
                    "prerequisitesByConceptRef": prereqs,
                    "relatedConceptsByConceptRef": related,
                    "contrastsByConceptRef": contrasts,
                    "confusablesByConceptRef": confusables,
                    "misconceptionLinksByConceptRef": misconceptions,
                },
                "learnerState": {
                    "global": {
                        "displayName": _nullable_string(learner_global.get("displayName")),
                        "preferredLanguage": _nullable_string(learner_global.get("preferredLanguage")),
                        "currentMood": learner_global.get("currentMood"),
                        "cognitiveLoad": learner_global.get("cognitiveLoad") or {"label": "unknown", "evidence": []},
                        "fatigue": learner_global.get("fatigue") or {"label": "unknown", "evidence": []},
                        "motivation": learner_global.get("motivation"),
                        "population": _pop("deterministic_prefetch", "learner-state-summarizer-agent"),
                    },
                    "byConceptRef": learner_by_ref,
                },
                "curriculumContext": {
                    "curriculumTitle": None,
                    "activeVersionLabel": _nullable_string(
                        (_section_value(sections, "curriculumActiveVersion") or {}).get("label")
                        if isinstance(_section_value(sections, "curriculumActiveVersion"), dict)
                        else None
                    ),
                    "selectedNodes": [
                        {"nodeRef": f"n{index + 1}", "label": node_id, "role": "selected"}
                        for index, node_id in enumerate(selected_node_ids)
                    ],
                    "frontierNodes": [
                        {"nodeRef": f"f{index + 1}", "label": _node_label(item, f"frontier {index + 1}"), "readinessReason": None}
                        for index, item in enumerate(_items(_section_value(sections, "curriculumFrontier")))
                    ],
                    "nearbyCurriculumNodes": [],
                    "population": _pop("deterministic_prefetch", "curriculum-service"),
                },
                "contentCoverageContext": {"byConceptRef": coverage_by_ref},
                "ragContext": {
                    "sourcePolicy": prompt_source_policy,
                    "documents": documents,
                    "evidenceByConceptRef": evidence_by_ref,
                    "citationRules": ["Cite only provided document chunks.", "Do not invent source locators."],
                    "unsupportedClaimPolicy": "reject",
                    "population": _pop("deterministic_prefetch", "ingestion-service/vector-service"),
                },
                "guardianPolicy": {
                    "learnerSafetyRules": ["Use non-shaming learner-facing language.", "Avoid medical or psychological diagnosis."],
                    "factualityRules": ["Reject unsupported factual claims.", "Preserve source uncertainty."],
                    "answerLeakageRules": ["Do not leak answers in prompts.", "Keep hints distinct from solutions."],
                    "malformedArtifactRules": ["Return schema-valid cards and activity variants.", "Every activity must declare response schema."],
                    "reviewRoutingRules": ["Generated artifacts remain proposals until Guardian and content-service accept them."],
                    "population": _pop("static_policy", "pedagogy-guardian-service"),
                },
                "outputPedagogy": {
                    "allowedCardTypes": list(getattr(request, "desired_card_types", []) or payload.get("desiredCardTypes", []) or ["short_answer"]),
                    "allowedActivityTypes": list(payload.get("desiredActivityTypes", []) or ["explanation"]),
                    "difficultyTargetsByConceptRef": difficulty_by_ref,
                    "desiredVariety": {
                        "minDistinctTypesPerConcept": min_distinct,
                        "avoidRepeatingLatestTransformation": True,
                    },
                    "responseExpectations": [
                        {
                            "activityType": "explanation",
                            "expectedResponseType": "short_text",
                            "responseSchemaDescription": "A concise learner-authored explanation.",
                        }
                    ],
                    "tone": "clear, precise, encouraging, and source-aware",
                    "population": _pop("llm_generated_by_agent", "content-pedagogy-planner-agent"),
                },
                "uncertainties": [*raw_context.get("uncertainties", []), *uncertainties],
            },
            "serviceContract": {
                "identityMap": {
                    "concepts": concept_identity,
                    "curriculumNodes": [
                        {"nodeRef": f"n{index + 1}", "curriculumNodeId": node_id, "conceptRef": None}
                        for index, node_id in enumerate(selected_node_ids)
                    ],
                    "documents": [
                        {"documentRef": f"d{index + 1}", "documentId": document_id}
                        for index, document_id in enumerate(document_ids)
                    ],
                    "chunks": chunks_manifest,
                },
                "requestValues": {
                    "userId": user_id,
                    "correlationId": payload.get("correlationId"),
                    "generationJobId": payload.get("generationJobId"),
                    "agentRunId": run_id or payload.get("agentRunId"),
                    "mode": _string(payload.get("mode"), "agent_autonomous"),
                    "conceptIds": [item.get("conceptId") for item in concept_identity if item.get("conceptId")],
                    "documentIds": document_ids,
                    "curriculumContext": {"curriculumId": curriculum_id, "selectedNodeIds": selected_node_ids},
                    "studentContext": {"userId": user_id},
                    "desiredCardTypes": list(getattr(request, "desired_card_types", []) or payload.get("desiredCardTypes", [])),
                    "varietyMandate": {"minDistinctTypesPerConcept": min_distinct},
                    "budget": {
                        "maxCards": int((payload.get("budget") or {}).get("maxCards", 12)) if isinstance(payload.get("budget"), dict) else 12,
                        "timeoutMs": int((payload.get("budget") or {}).get("timeoutMs", 5000)) if isinstance(payload.get("budget"), dict) else 5000,
                    },
                },
                "mappings": _service_mappings(),
            },
            "populationReport": {
                "deterministicPrefetch": deterministic,
                "staticPolicy": static_policy,
                "callTime": call_time,
                "llmGeneratedByAgent": generated,
                "unavailable": unavailable,
            },
            "sourceManifest": [
                _entry(
                    f"sourceManifest.{index}",
                    mode="deterministic_prefetch",
                    source=_string(section.get("sourceService"), "agents-runtime"),
                    tool_or_function=_string(section.get("key"), "section"),
                    status="populated",
                    input_value=section.get("value"),
                )
                for index, section in enumerate(raw_context.get("sections", []))
                if isinstance(section, dict)
            ],
        }
        return prompt

    def readiness_errors(self, prompt: dict[str, Any]) -> list[str]:
        errors = []
        pc = prompt.get("pedagogicalContext", {})
        if pc.get("uncertainties"):
            for item in pc["uncertainties"]:
                if isinstance(item, dict):
                    errors.append(_string(item.get("message"), _string(item.get("code"), "unknown uncertainty")))
        if not pc.get("targetConcepts"):
            errors.append("At least one target concept is required.")
        for concept in prompt.get("serviceContract", {}).get("identityMap", {}).get("concepts", []):
            if not isinstance(concept, dict):
                continue
            if not (concept.get("pkgNodeId") or concept.get("ckgNodeId")):
                errors.append(f"Concept {concept.get('inputRef')} is not graph-ready.")
        rag = pc.get("ragContext", {})
        if rag.get("sourcePolicy") == "required" and not any(rag.get("evidenceByConceptRef", {}).values()):
            errors.append("RAG-required prompt lacks evidence chunks.")
        return errors

    def is_ready(self, prompt: dict[str, Any]) -> bool:
        return len(self.readiness_errors(prompt)) == 0


def _service_mappings() -> dict[str, Any]:
    return {
        "requestMapsTo": {
            "mode": "CreateContentGenerationJobInputSchema.mode",
            "conceptIds": "CreateContentGenerationJobInputSchema.conceptIds",
            "documentIds": "CreateContentGenerationJobInputSchema.documentIds",
            "curriculumContext": "CreateContentGenerationJobInputSchema.curriculumContext",
            "studentContext": "CreateContentGenerationJobInputSchema.studentContext",
            "desiredCardTypes": "CreateContentGenerationJobInputSchema.desiredCardTypes",
            "varietyMandate": "CreateContentGenerationJobInputSchema.varietyMandate",
            "budget": "CreateContentGenerationJobInputSchema.budget",
        },
        "cardOutputMapsTo": {
            "cardType": "CreateCardInputSchema.cardType",
            "content": "CreateCardInputSchema.content",
            "difficulty": "CreateCardInputSchema.difficulty",
            "tags": "CreateCardInputSchema.tags",
            "supportedStudyModes": "CreateCardInputSchema.supportedStudyModes",
            "source": "CreateCardInputSchema.source",
            "originMode": "CreateCardInputSchema.originMode",
            "anchoredCkgNodeIds": "CreateCardInputSchema.anchoredCkgNodeIds",
            "anchoredPkgNodeIds": "CreateCardInputSchema.anchoredPkgNodeIds",
            "knowledgeNodeIds": "CreateCardInputSchema.knowledgeNodeIds",
            "sourceDocumentIds": "CreateCardInputSchema.sourceDocumentIds",
            "sources": "CreateCardInputSchema.sources",
            "factualityScore": "CreateCardInputSchema.factualityScore",
            "reviewState": "CreateCardInputSchema.reviewState",
            "guardianValidationId": "CreateCardInputSchema.guardianValidationId",
            "rationale": "CreateCardInputSchema.metadata.generationRationale",
        },
        "activityVariantOutputMapsTo": {
            "conceptId": "CreateGeneratedActivityVariantInputSchema.conceptId",
            "studyMode": "CreateGeneratedActivityVariantInputSchema.studyMode",
            "transformationType": "CreateGeneratedActivityVariantInputSchema.transformationType",
            "epistemicMode": "CreateGeneratedActivityVariantInputSchema.epistemicMode",
            "difficultyBucket": "CreateGeneratedActivityVariantInputSchema.difficultyBucket",
            "sourceCardIds": "CreateGeneratedActivityVariantInputSchema.sourceCardIds",
            "prompt": "CreateGeneratedActivityVariantInputSchema.prompt",
            "renderPayload": "CreateGeneratedActivityVariantInputSchema.renderPayload",
            "expectedResponseType": "CreateGeneratedActivityVariantInputSchema.expectedResponseType",
            "responseSchema": "CreateGeneratedActivityVariantInputSchema.responseSchema",
            "variantSeed": "CreateGeneratedActivityVariantInputSchema.variantSeed",
            "generatorMetadata": "CreateGeneratedActivityVariantInputSchema.generatorMetadata",
            "ttlAt": "CreateGeneratedActivityVariantInputSchema.ttlAt",
        },
        "importMapsTo": "ImportGeneratedContentBatchInputSchema",
        "guardianValidationMapsTo": "pedagogy-guardian.validate-generated-variant",
    }
