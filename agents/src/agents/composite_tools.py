"""Composite context and explanation tools for the agent runtime."""

from __future__ import annotations

import re
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any, cast

from pydantic import BaseModel, Field

from .content_creation_prompt import ContentCreationPromptBuilder
from .service_clients import ServiceError
from .telemetry import get_current_run_recorder

if TYPE_CHECKING:
    from .agent_runtime import ToolBeltDefinition
    from .service_clients import ToolInvoker


class CompositeToolDefinition(BaseModel):
    name: str
    version: str = "1.0.0"
    description: str
    priority: str = "P1"
    tags: list[str] = Field(default_factory=list)
    input_schema: dict[str, Any] = Field(default_factory=dict, alias="inputSchema")


CompositeHandler = Callable[[dict[str, Any], str | None], Awaitable[dict[str, Any]]]


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _section(
    *,
    key: str,
    title: str,
    source_service: str,
    value: Any,
    authority_label: str = "recorded_fact",
    ttl_ms: int = 30000,
) -> dict[str, Any]:
    return {
        "key": key,
        "title": title,
        "authorityLabel": authority_label,
        "sourceService": source_service,
        "value": value,
        "freshness": {
            "fetchedAt": _now_iso(),
            "ttlMs": ttl_ms,
            "replayable": False,
            "mayRefreshLive": True,
        },
    }


def _first_step_id(snapshot: dict[str, Any]) -> str | None:
    for key in ("currentStep", "nextStep", "step"):
        step = snapshot.get(key)
        if isinstance(step, dict):
            step_id = step.get("id")
            if isinstance(step_id, str) and step_id:
                return step_id
    queue = snapshot.get("steps") or snapshot.get("queue")
    if isinstance(queue, list) and queue:
        first = queue[0]
        if isinstance(first, dict):
            step_id = first.get("id")
            if isinstance(step_id, str) and step_id:
                return step_id
    return None


def _concept_ids_from_diagnostic(diagnostic: dict[str, Any]) -> list[str]:
    concept_ids = diagnostic.get("conceptRefs", [])
    if isinstance(concept_ids, list):
        return [value for value in concept_ids if isinstance(value, str)]
    return []


def _concept_ids_from_lesson_sections(
    sections: list[dict[str, Any]], payload: dict[str, Any]
) -> list[str]:
    concept_ids: list[str] = [
        value for value in payload.get("conceptIds", []) if isinstance(value, str)
    ]
    for section in sections:
        value = section.get("value")
        if isinstance(value, dict):
            concept_ids.extend(
                item for item in value.get("conceptIds", []) if isinstance(item, str)
            )
            selected_node_concepts = value.get("selectedNodeConceptIds", [])
            if isinstance(selected_node_concepts, list):
                concept_ids.extend(item for item in selected_node_concepts if isinstance(item, str))
            for item_key in ("nodes", "items", "frontier"):
                items = value.get(item_key)
                if isinstance(items, list):
                    for item in items:
                        if not isinstance(item, dict):
                            continue
                        concept_id = item.get("conceptId") or item.get("ckgConceptId")
                        if isinstance(concept_id, str):
                            concept_ids.append(concept_id)
        elif isinstance(value, list):
            for item in value:
                if not isinstance(item, dict):
                    continue
                concept_id = item.get("conceptId") or item.get("ckgConceptId")
                if isinstance(concept_id, str):
                    concept_ids.append(concept_id)
    seen: set[str] = set()
    deduped: list[str] = []
    for concept_id in concept_ids:
        if concept_id in seen:
            continue
        seen.add(concept_id)
        deduped.append(concept_id)
    return deduped


def _concept_ids_from_sections(sections: list[dict[str, Any]]) -> list[str]:
    concept_ids: list[str] = []
    for section in sections:
        value = section.get("value")
        if not isinstance(value, dict):
            continue
        for key in ("conceptId", "targetConceptId", "ckgConceptId"):
            candidate = value.get(key)
            if isinstance(candidate, str):
                concept_ids.append(candidate)
        for key in ("conceptIds", "conceptRefs", "selectedNodeConceptIds"):
            values = value.get(key)
            if isinstance(values, list):
                concept_ids.extend(item for item in values if isinstance(item, str))
    return _dedupe_strings(concept_ids)


def _provider_tool_name(service_name: str, tool_name: str) -> str:
    return f"{service_name.replace('-service', '').replace('-', '_')}__{tool_name.replace('-', '_')}"


_CANONICAL_CONCEPT_ID_RE = re.compile(r"^concept_[A-Za-z0-9_-]{21}$")
_GRAPH_NODE_ID_RE = re.compile(r"^node_[A-Za-z0-9_-]{21}$")


def _is_canonical_concept_id(value: str) -> bool:
    return bool(_CANONICAL_CONCEPT_ID_RE.match(value))


def _is_graph_node_id(value: str) -> bool:
    return bool(_GRAPH_NODE_ID_RE.match(value))


def _slug_to_label(value: str) -> str:
    cleaned = re.sub(r"^concept[_:-]+", "", value.strip(), flags=re.IGNORECASE)
    return re.sub(r"[_-]+", " ", cleaned).strip()


def _dedupe_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        deduped.append(value)
    return deduped


def _extract_node_label(node: dict[str, Any]) -> str | None:
    """Extract a human-readable label from a KG node or resolution match."""
    for key in ("label", "name", "title"):
        value = node.get(key)
        if isinstance(value, str) and value:
            return value
    data = node.get("data")
    if isinstance(data, dict):
        for key in ("label", "name", "title"):
            value = data.get(key)
            if isinstance(value, str) and value:
                return value
    return None


def _label_for_concept(concept_id: str, labels: dict[str, str]) -> str:
    """Return a human-readable label for display in section titles and messages.

    Prefers entries in the labels dict built from fetched KG node data. Falls back
    to slug heuristics: all-lowercase tails are title-cased, opaque nanoid tails
    (containing uppercase) are returned as the full formal ID rather than stripped.
    """
    if concept_id in labels:
        return labels[concept_id]
    for prefix in ("concept_", "node_", "kg_"):
        if concept_id.startswith(prefix):
            tail = concept_id[len(prefix):]
            if re.search(r"[A-Z]", tail):
                return concept_id  # opaque nanoid — formal ID is better than a misleading substring
            return tail.replace("_", " ").title()
    if concept_id == concept_id.lower():
        return concept_id.replace("_", " ").title()
    return concept_id


def _short_text(value: Any, fallback: str, limit: int = 420) -> str:
    if isinstance(value, str) and value.strip():
        text = value.strip()
        return text if len(text) <= limit else f"{text[:limit - 3]}..."
    return fallback


def _node_id_from(value: dict[str, Any], fallback: str | None = None) -> str | None:
    for key in ("nodeId", "id", "conceptId", "ckgConceptId"):
        candidate = value.get(key)
        if isinstance(candidate, str) and candidate:
            return candidate
    node = value.get("node")
    if isinstance(node, dict):
        return _node_id_from(node, fallback)
    return fallback


def _node_description(node: dict[str, Any], label: str) -> str:
    for key in ("description", "summary", "definition", "shortDescription"):
        value = node.get(key)
        if isinstance(value, str) and value.strip():
            return _short_text(value, f"{label} is the target concept for this Step.")
    data = node.get("data")
    if isinstance(data, dict):
        for key in ("description", "summary", "definition", "shortDescription"):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                return _short_text(value, f"{label} is the target concept for this Step.")
    return f"{label} is the target concept for this Step."


def _relation_items(value: Any) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if not isinstance(value, dict):
        return items
    for key in ("items", "nodes", "results", "related", "concepts", "edges", "misconceptions"):
        container = value.get(key)
        if isinstance(container, list):
            items.extend(item for item in container if isinstance(item, dict))
    layers = value.get("layers")
    if isinstance(layers, list):
        for layer in layers:
            if isinstance(layer, dict):
                for key in ("items", "nodes", "concepts"):
                    container = layer.get(key)
                    if isinstance(container, list):
                        items.extend(item for item in container if isinstance(item, dict))
            elif isinstance(layer, list):
                items.extend(item for item in layer if isinstance(item, dict))
    if not items and any(key in value for key in ("id", "nodeId", "conceptId", "label", "name")):
        items.append(value)
    return items


def _relation_summary(item: dict[str, Any], *, fallback_label: str, relationship: str) -> dict[str, Any]:
    label = _extract_node_label(item) or fallback_label
    node_id = _node_id_from(item)
    reason = item.get("reason") or item.get("description") or item.get("relationship") or item.get("edgeType")
    return {
        "labelText": label,
        "relationshipText": _short_text(reason, relationship),
        "riskIfWeakText": (
            f"If {label} is weak, the learner may struggle to use {fallback_label} reliably."
            if relationship == "prerequisite"
            else None
        ),
        "disambiguatingCueText": (
            _short_text(item.get("cue"), f"Compare the diagnostic cue for {fallback_label} against {label}.")
            if relationship in {"confusable", "contrast"}
            else None
        ),
        "serviceReferences": {
            **({"nodeId": node_id} if node_id else {}),
            **({"conceptId": node_id} if isinstance(node_id, str) and node_id.startswith("concept_") else {}),
        },
    }


def _content_anchor_from_activity(activity: dict[str, Any]) -> list[dict[str, Any]]:
    anchors = activity.get("contentAnchorSummaries")
    if isinstance(anchors, list):
        return [anchor for anchor in anchors if isinstance(anchor, dict)]
    return []


def _content_anchor_from_cards(cards: Any, concept_id: str) -> list[dict[str, Any]]:
    anchors: list[dict[str, Any]] = []
    for item in _relation_items(cards):
        card_id = item.get("id") or item.get("cardId")
        title = item.get("title") or item.get("name") or item.get("front")
        content = item.get("content")
        prompt = ""
        if isinstance(content, dict):
            prompt = _short_text(content.get("prompt") or content.get("front") or content.get("question"), "", 360)
        if not prompt:
            prompt = _short_text(item.get("prompt") or item.get("summary"), "No prompt excerpt available.", 360)
        anchors.append(
            {
                "anchorLabelText": _short_text(title, f"Content anchor for {_slug_to_label(concept_id)}", 120),
                "sourceKind": "card",
                "promptExcerptText": prompt,
                "expectedUseText": "Existing content connected to this concept.",
                "coverageStatusText": "Content-service returned this card as a concept anchor candidate.",
                "serviceReferences": {
                    **({"cardId": card_id} if isinstance(card_id, str) else {}),
                    "conceptIds": [concept_id],
                },
            }
        )
    return anchors[:5]


def _semantic_retrieval_labels(
    concept_refs: list[str], resolved_concept_ids: list[str], labels: dict[str, str]
) -> list[str]:
    semantic: list[str] = []
    for concept_ref in concept_refs:
        label = labels.get(concept_ref)
        if isinstance(label, str) and label.strip():
            semantic.append(label.strip())
    for concept_id in resolved_concept_ids:
        label = labels.get(concept_id)
        if isinstance(label, str) and label.strip():
            semantic.append(label.strip())
    return _dedupe_strings(semantic)


def _string_from_mapping(value: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        candidate = value.get(key)
        if isinstance(candidate, str) and candidate:
            return candidate
    return None


class CompositeToolRegistry:
    def __init__(self, invoker: ToolInvoker) -> None:
        self._invoker = invoker
        self._definitions = [
            CompositeToolDefinition(
                name="get-active-learning-context",
                description="Assemble the active learning context for a session.",
                priority="P0",
                tags=["aggregate", "plan", "surface"],
                inputSchema={
                    "type": "object",
                    "required": ["sessionId"],
                    "properties": {
                        "sessionId": {"type": "string"},
                        "curriculumId": {"type": "string"},
                    },
                },
            ),
            CompositeToolDefinition(
                name="get-step-repair-context",
                description="Assemble a repair-focused context pack for the current or provided step.",
                priority="P0",
                tags=["aggregate", "repair", "explain"],
                inputSchema={
                    "type": "object",
                    "required": ["sessionId"],
                    "properties": {
                        "sessionId": {"type": "string"},
                        "stepId": {"type": "string"},
                    },
                },
            ),
            CompositeToolDefinition(
                name="get-step-concept-context",
                description=(
                    "Assemble prompt-safe concept, graph, curriculum, and content-anchor context "
                    "for a Step while keeping service IDs under serviceReferences."
                ),
                priority="P0",
                tags=["aggregate", "graph", "content", "prefetch"],
                inputSchema={
                    "type": "object",
                    "properties": {
                        "sessionId": {"type": "string"},
                        "stepId": {"type": "string"},
                        "conceptIds": {"type": "array", "items": {"type": "string"}},
                        "studyMode": {"type": "string"},
                        "domain": {"type": "string"},
                    },
                },
            ),
            CompositeToolDefinition(
                name="get-calibration-context",
                description="Assemble calibration and reasoning context for one or more concepts.",
                priority="P1",
                tags=["aggregate", "explain", "compare"],
                inputSchema={
                    "type": "object",
                    "properties": {
                        "conceptIds": {"type": "array"},
                        "stepId": {"type": "string"},
                        "studyMode": {"type": "string"},
                    },
                },
            ),
            CompositeToolDefinition(
                name="get-mental-debugger-context",
                description="Assemble learner-safe diagnostic context for a post-Step Mental Debugger reflection.",
                priority="P0",
                tags=["aggregate", "diagnostic", "reflection", "prefetch"],
                inputSchema={
                    "type": "object",
                    "properties": {
                        "sessionId": {"type": "string"},
                        "stepId": {"type": "string"},
                        "conceptIds": {"type": "array"},
                        "studyMode": {"type": "string"},
                        "userIntent": {"type": "object"},
                    },
                },
            ),
            CompositeToolDefinition(
                name="get-learner-facing-agent-foundation-context",
                description="Assemble shared deterministic foundation context plus a readiness report for learner-facing reflection agents.",
                priority="P0",
                tags=["aggregate", "readiness", "prefetch", "learner-facing"],
                inputSchema={
                    "type": "object",
                    "properties": {
                        "targetAgent": {"type": "string"},
                        "sessionId": {"type": "string"},
                        "stepId": {"type": "string"},
                        "conceptIds": {"type": "array"},
                        "studyMode": {"type": "string"},
                    },
                },
            ),
            CompositeToolDefinition(
                name="get-mental-debugger-readiness-context",
                description="Assemble Mental Debugger deterministic context with a composite readiness report.",
                priority="P0",
                tags=["aggregate", "diagnostic", "readiness", "prefetch"],
                inputSchema={
                    "type": "object",
                    "properties": {
                        "sessionId": {"type": "string"},
                        "stepId": {"type": "string"},
                        "conceptIds": {"type": "array"},
                        "studyMode": {"type": "string"},
                        "userIntent": {"type": "object"},
                    },
                },
            ),
            CompositeToolDefinition(
                name="get-calibration-coach-readiness-context",
                description="Assemble Calibration Coach deterministic context with a composite readiness report.",
                priority="P0",
                tags=["aggregate", "calibration", "readiness", "prefetch"],
                inputSchema={
                    "type": "object",
                    "properties": {
                        "sessionId": {"type": "string"},
                        "stepId": {"type": "string"},
                        "conceptIds": {"type": "array"},
                        "studyMode": {"type": "string"},
                    },
                },
            ),
            CompositeToolDefinition(
                name="get-patch-planner-context",
                description="Assemble repair-planning context for minimum-sufficient remediation proposals.",
                priority="P0",
                tags=["aggregate", "repair", "remediation", "prefetch"],
                inputSchema={
                    "type": "object",
                    "properties": {
                        "sessionId": {"type": "string"},
                        "stepId": {"type": "string"},
                        "conceptIds": {"type": "array"},
                        "studyMode": {"type": "string"},
                        "triggerType": {"type": "string"},
                    },
                },
            ),
            CompositeToolDefinition(
                name="get-strategy-replanning-context",
                description="Assemble session-owned Strategy/Replanning context with trigger, repair, and queue facts.",
                priority="P0",
                tags=["aggregate", "strategy", "replan", "prefetch"],
                inputSchema={
                    "type": "object",
                    "required": ["sessionId"],
                    "properties": {
                        "sessionId": {"type": "string"},
                        "stepId": {"type": "string"},
                        "conceptIds": {"type": "array"},
                        "studyMode": {"type": "string"},
                        "trigger": {"type": "object"},
                        "patchProposal": {"type": "object"},
                        "calibrationSignal": {"type": "object"},
                        "previousValidation": {"type": "object"},
                    },
                },
            ),
            CompositeToolDefinition(
                name="get-cognitive-copilot-context",
                description="Assemble a source-bound readout context for Cognitive Copilot surfaces.",
                priority="P1",
                tags=["aggregate", "copilot", "surface", "prefetch"],
                inputSchema={
                    "type": "object",
                    "properties": {
                        "sessionId": {"type": "string"},
                        "stepId": {"type": "string"},
                        "curriculumId": {"type": "string"},
                        "conceptIds": {"type": "array"},
                        "studyMode": {"type": "string"},
                        "agentHints": {"type": "array"},
                        "timelineEvents": {"type": "array"},
                        "surface": {"type": "string"},
                    },
                },
            ),
            CompositeToolDefinition(
                name="get-watchtower-governance-context",
                description="Assemble bounded Watchtower policy context for visibility, privacy, review, and audit decisions.",
                priority="P1",
                tags=["aggregate", "governance", "policy", "prefetch"],
                inputSchema={
                    "type": "object",
                    "properties": {
                        "sessionId": {"type": "string"},
                        "stepId": {"type": "string"},
                        "proposedAction": {"type": "object"},
                        "agentHints": {"type": "array"},
                        "policyContext": {"type": "object"},
                        "surface": {"type": "string"},
                    },
                },
            ),
            CompositeToolDefinition(
                name="get-mode-preference-context",
                description="Assemble eligibility, recent-history, preference, and policy context for mode tie-breaking.",
                priority="P1",
                tags=["aggregate", "mode", "helper", "prefetch"],
                inputSchema={
                    "type": "object",
                    "properties": {
                        "sessionId": {"type": "string"},
                        "stepId": {"type": "string"},
                        "conceptIds": {"type": "array"},
                        "candidateModes": {"type": "array"},
                        "deterministicFallback": {"type": "string"},
                        "forbiddenModes": {"type": "array"},
                        "recentModes": {"type": "array"},
                        "learnerPreferences": {"type": "object"},
                    },
                },
            ),
            CompositeToolDefinition(
                name="get-taxonomy-curator-context",
                description="Assemble taxonomy, evidence, impact, and policy context for reviewable taxonomy proposals.",
                priority="P1",
                tags=["aggregate", "taxonomy", "curation", "prefetch"],
                inputSchema={
                    "type": "object",
                    "properties": {
                        "taxonomyDomain": {"type": "string"},
                        "taxonomyId": {"type": "string"},
                        "currentVersion": {"type": "string"},
                        "labelIds": {"type": "array"},
                        "conceptIds": {"type": "array"},
                        "stepId": {"type": "string"},
                        "curriculumId": {"type": "string"},
                        "taxonomySnapshot": {"type": "object"},
                        "evidenceClusters": {"type": "array"},
                        "impactContext": {"type": "object"},
                    },
                },
            ),
            CompositeToolDefinition(
                name="get-session-explanation-pack",
                description="Assemble a narrative explanation pack for a session's current state.",
                priority="P1",
                tags=["aggregate", "explain", "surface"],
                inputSchema={
                    "type": "object",
                    "required": ["sessionId"],
                    "properties": {
                        "sessionId": {"type": "string"},
                        "curriculumId": {"type": "string"},
                    },
                },
            ),
            CompositeToolDefinition(
                name="get-stability-and-reasoning-pack",
                description="Combine schedule stability and reasoning quality for provided concepts.",
                priority="P1",
                tags=["aggregate", "compare", "forecast"],
                inputSchema={
                    "type": "object",
                    "required": ["conceptIds"],
                    "properties": {
                        "conceptIds": {"type": "array"},
                        "studyMode": {"type": "string"},
                    },
                },
            ),
            CompositeToolDefinition(
                name="get-ingestion-concept-extraction-brief",
                description=(
                    "Build a prompt-ready ingestion extraction brief from document, IR, chunk, "
                    "retrieval, graph, curriculum, coverage, and policy context."
                ),
                priority="P0",
                tags=["aggregate", "ingestion", "extract", "prefetch"],
                inputSchema={
                    "type": "object",
                    "properties": {
                        "documentId": {"type": "string"},
                        "documentIds": {"type": "array"},
                        "curriculumId": {"type": "string"},
                        "studyMode": {"type": "string"},
                        "intent": {"type": "string"},
                    },
                },
            ),
            CompositeToolDefinition(
                name="get-content-creator-brief",
                description=(
                    "Build the canonical ContentCreationPromptV2 from content coverage, existing content, "
                    "curriculum, graph, learner, source, and Guardian policy context."
                ),
                priority="P0",
                tags=["aggregate", "content", "create", "prefetch"],
                inputSchema={
                    "type": "object",
                    "properties": {
                        "curriculumId": {"type": "string"},
                        "sessionId": {"type": "string"},
                        "conceptIds": {"type": "array"},
                        "documentIds": {"type": "array"},
                        "studyMode": {"type": "string"},
                    },
                },
            ),
            CompositeToolDefinition(
                name="get-lesson-plan-assembly-brief",
                description="Build a prompt-ready lesson-plan assembly brief from session and curriculum context.",
                priority="P1",
                tags=["aggregate", "plan", "recommend"],
                inputSchema={
                    "type": "object",
                    "required": ["sessionId"],
                    "properties": {
                        "sessionId": {"type": "string"},
                        "curriculumId": {"type": "string"},
                    },
                },
            ),
            CompositeToolDefinition(
                name="get-graph-proposal-context",
                description=(
                    "Build a rich context pack for the knowledge-graph agent: graph neighbourhood, "
                    "structural health, prerequisites, related concepts, and misconception signals."
                ),
                priority="P1",
                tags=["aggregate", "graph", "propose"],
                inputSchema={
                    "type": "object",
                    "required": ["conceptIds"],
                    "properties": {
                        "conceptIds": {"type": "array", "items": {"type": "string"}},
                        "studyMode": {"type": "string"},
                        "proposalType": {"type": "string"},
                    },
                },
            ),
            CompositeToolDefinition(
                name="get-curriculum-draft-context",
                description=(
                    "Build a rich context pack for the curriculum planner: due concepts, per-concept "
                    "schedule, prerequisites, reasoning averages, and existing curriculum state."
                ),
                priority="P1",
                tags=["aggregate", "curriculum", "plan"],
                inputSchema={
                    "type": "object",
                    "properties": {
                        "conceptIds": {"type": "array", "items": {"type": "string"}},
                        "curriculumId": {"type": "string"},
                        "studyMode": {"type": "string"},
                    },
                },
            ),
        ]
        self._handlers: dict[str, CompositeHandler] = {
            "get-active-learning-context": self._get_active_learning_context,
            "get-step-repair-context": self._get_step_repair_context,
            "get-step-concept-context": self._get_step_concept_context,
            "get-calibration-context": self._get_calibration_context,
            "get-mental-debugger-context": self._get_mental_debugger_context,
            "get-learner-facing-agent-foundation-context": self._get_learner_facing_agent_foundation_context,
            "get-mental-debugger-readiness-context": self._get_mental_debugger_readiness_context,
            "get-calibration-coach-readiness-context": self._get_calibration_coach_readiness_context,
            "get-patch-planner-context": self._get_patch_planner_context,
            "get-strategy-replanning-context": self._get_strategy_replanning_context,
            "get-cognitive-copilot-context": self._get_cognitive_copilot_context,
            "get-watchtower-governance-context": self._get_watchtower_governance_context,
            "get-mode-preference-context": self._get_mode_preference_context,
            "get-taxonomy-curator-context": self._get_taxonomy_curator_context,
            "get-session-explanation-pack": self._get_session_explanation_pack,
            "get-stability-and-reasoning-pack": self._get_stability_and_reasoning_pack,
            "get-ingestion-concept-extraction-brief": self._get_ingestion_concept_extraction_brief,
            "get-content-creator-brief": self._get_content_creator_brief,
            "get-lesson-plan-assembly-brief": self._get_lesson_plan_assembly_brief,
            "get-graph-proposal-context": self._get_graph_proposal_context,
            "get-curriculum-draft-context": self._get_curriculum_draft_context,
        }

    def list_definitions(self) -> list[dict[str, Any]]:
        return [definition.model_dump(by_alias=True) for definition in self._definitions]

    async def provider_tools_for_belt(self, tool_belt: ToolBeltDefinition) -> list[dict[str, Any]]:
        catalog_provider = getattr(self._invoker, "list_tools", None)
        if not callable(catalog_provider):
            return []

        allowed = set(tool_belt.read_tools) | set(tool_belt.write_tools)
        forbidden = set(tool_belt.forbidden_tools)
        services = sorted({name.split(".", 1)[0] for name in allowed | forbidden if "." in name})
        provider_tools: list[dict[str, Any]] = []
        for service in services:
            try:
                tools = await catalog_provider(service)
            except Exception:
                continue
            for tool in tools:
                name = tool.get("name")
                source_service = tool.get("service", f"{service}-service")
                if not isinstance(name, str):
                    continue
                qualified = f"{service}.{name}"
                if qualified not in allowed or qualified in forbidden:
                    continue
                capabilities = tool.get("capabilities", {})
                provider_tools.append(
                    {
                        "name": _provider_tool_name(str(source_service), name),
                        "tool": name,
                        "description": str(tool.get("description", "")),
                        "inputSchema": tool.get("inputSchema") if isinstance(tool.get("inputSchema"), dict) else {},
                        "service": str(source_service),
                        "sideEffects": bool(cast("dict[str, Any]", capabilities).get("sideEffects"))
                        if isinstance(capabilities, dict)
                        else qualified in tool_belt.write_tools,
                    }
                )
        return provider_tools

    async def execute(self, tool_name: str, payload: dict[str, Any], user_id: str | None) -> dict[str, Any]:
        handler = self._handlers.get(tool_name)
        if handler is None:
            raise ValueError(f"Unknown composite tool: {tool_name}")
        started_ms = time.perf_counter()
        try:
            result = await handler(payload, user_id)
        except Exception as error:
            latency_ms = int((time.perf_counter() - started_ms) * 1000)
            recorder = get_current_run_recorder()
            if recorder is not None:
                recorder.record_tool_call(
                    source_kind="composite",
                    service="agents-runtime",
                    tool_name=tool_name,
                    latency_ms=latency_ms,
                    success=False,
                    request_payload=payload,
                    error_message=str(error),
                )
            raise
        latency_ms = int((time.perf_counter() - started_ms) * 1000)
        recorder = get_current_run_recorder()
        if recorder is not None:
            recorder.record_tool_call(
                source_kind="composite",
                service="agents-runtime",
                tool_name=tool_name,
                latency_ms=latency_ms,
                success=True,
                request_payload=payload,
                response_payload=result,
            )
        return result

    async def _safe_tool_call(
        self,
        *,
        service: str,
        tool: str,
        payload: dict[str, Any],
        user_id: str | None,
        errors: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        try:
            return await self._invoker.execute(service, tool, payload, user_id=user_id)
        except ServiceError as error:
            errors.append({
                "service": service,
                "tool": tool,
                "message": str(error),
                "kind": error.kind,
                **({"statusCode": error.status_code} if error.status_code is not None else {}),
            })
            return None
        except Exception as error:  # pragma: no cover - exercised via registry tests
            errors.append({"service": service, "tool": tool, "message": str(error), "kind": "unknown"})
            return None

    async def _safe_tool_list(
        self,
        *,
        service: str,
        user_id: str | None,
        errors: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        list_tools = getattr(self._invoker, "list_tools", None)
        if list_tools is None:
            return []
        try:
            result = await list_tools(service, user_id=user_id)
        except Exception as error:
            errors.append({
                "service": service,
                "tool": "list-tools",
                "message": str(error),
                "kind": "tool_discovery",
            })
            return []
        return result if isinstance(result, list) else []

    async def _manifested_tool_call(
        self,
        *,
        service: str,
        tool: str,
        payload: dict[str, Any],
        user_id: str | None,
        errors: list[dict[str, Any]],
        manifest: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        manifest.append({"service": f"{service}-service", "tool": tool, "input": payload})
        return await self._safe_tool_call(
            service=service,
            tool=tool,
            payload=payload,
            user_id=user_id,
            errors=errors,
        )

    async def _safe_kg_concept_call(
        self,
        *,
        tool: str,
        payload: dict[str, Any],
        user_id: str | None,
        errors: list[dict[str, Any]],
        manifest: list[dict[str, Any]],
    ) -> tuple[dict[str, Any] | None, bool]:
        """Call a knowledge-graph concept resolution tool.

        Returns (result, confirmed_missing) where confirmed_missing=True means the KG
        definitively reported the entity as absent (404 or 422 reclassified as not_found
        in service_clients). This is distinct from auth errors or connection failures,
        which leave the concept's existence unknown.
        """
        before = len(errors)
        manifest.append({"service": "knowledge-graph-service", "tool": tool, "input": payload})
        result = await self._safe_tool_call(
            service="knowledge-graph",
            tool=tool,
            payload=payload,
            user_id=user_id,
            errors=errors,
        )
        confirmed_missing = (
            result is None
            and len(errors) > before
            and errors[-1].get("kind") == "not_found"
        )
        return result, confirmed_missing

    async def _get_active_learning_context(
        self, payload: dict[str, Any], user_id: str | None
    ) -> dict[str, Any]:
        session_id_value = payload.get("sessionId")
        session_id = str(session_id_value) if isinstance(session_id_value, str) and session_id_value else ""
        curriculum_id = payload.get("curriculumId")
        errors: list[dict[str, Any]] = []
        sections: list[dict[str, Any]] = []

        session = await self._safe_tool_call(
            service="session",
            tool="get-session",
            payload={"sessionId": session_id},
            user_id=user_id,
            errors=errors,
        )
        snapshot = await self._safe_tool_call(
            service="session",
            tool="get-step-loop-snapshot",
            payload={"sessionId": session_id},
            user_id=user_id,
            errors=errors,
        )
        if session is not None:
            sections.append(
                _section(
                    key="sessionState",
                    title="Session State",
                    source_service="session-service",
                    value=session,
                )
            )
        if snapshot is not None:
            sections.append(
                _section(
                    key="stepLoopSnapshot",
                    title="Step Loop Snapshot",
                    source_service="session-service",
                    value=snapshot,
                )
            )

        step_id = _first_step_id(snapshot or {})
        if step_id is not None:
            diagnostic = await self._safe_tool_call(
                service="metacognition",
                tool="get-agent-safe-diagnostic-brief",
                payload={"stepId": step_id},
                user_id=user_id,
                errors=errors,
            )
            if diagnostic is not None:
                sections.append(
                    _section(
                        key="diagnosticBrief",
                        title="Diagnostic Brief",
                        source_service="metacognition-service",
                        value=diagnostic,
                        authority_label="detected_signal",
                    )
                )

        if isinstance(curriculum_id, str) and curriculum_id:
            frontier = await self._safe_tool_call(
                service="curriculum",
                tool="get-frontier",
                payload={"curriculumId": curriculum_id},
                user_id=user_id,
                errors=errors,
            )
            if frontier is not None:
                sections.append(
                    _section(
                        key="curriculumFrontier",
                        title="Curriculum Frontier",
                        source_service="curriculum-service",
                        value=frontier,
                    )
                )

        return {
            "compositeTool": "get-active-learning-context",
            "generatedAt": _now_iso(),
            "summary": f"Assembled {len(sections)} active-learning sections for session {session_id}.",
            "sections": sections,
            "errors": errors,
            "openQuestions": [
                "Do we need to refresh missing sections live before prompting the agent?"
                if errors
                else "None"
            ],
        }

    async def _get_step_concept_context(
        self, payload: dict[str, Any], user_id: str | None
    ) -> dict[str, Any]:
        errors: list[dict[str, Any]] = []
        sections: list[dict[str, Any]] = []
        manifest: list[dict[str, Any]] = []
        study_mode = payload.get("studyMode") if isinstance(payload.get("studyMode"), str) else "knowledge_gaining"
        longitudinal_concept_ids = [
            value for value in payload.get("conceptIds", []) if isinstance(value, str)
        ]
        domain = payload.get("domain") if isinstance(payload.get("domain"), str) else "general"
        concept_ids = [value for value in payload.get("conceptIds", []) if isinstance(value, str)]

        session_id = payload.get("sessionId")
        step_id = payload.get("stepId")
        if not isinstance(step_id, str) or not step_id:
            if isinstance(session_id, str) and session_id:
                snapshot = await self._manifested_tool_call(
                    service="session",
                    tool="get-step-loop-snapshot",
                    payload={"sessionId": session_id},
                    user_id=user_id,
                    errors=errors,
                    manifest=manifest,
                )
                if isinstance(snapshot, dict):
                    step_id = _first_step_id(snapshot)
                    for key in ("currentStep", "nextStep", "step"):
                        step = snapshot.get(key)
                        if isinstance(step, dict):
                            values = step.get("conceptRefs") or step.get("conceptIds")
                            if isinstance(values, list):
                                concept_ids.extend(value for value in values if isinstance(value, str))

        activity_context: dict[str, Any] | None = None
        curriculum_anchor: dict[str, Any] | None = None
        if isinstance(step_id, str) and step_id:
            activity_context = await self._manifested_tool_call(
                service="session",
                tool="get-step-activity-context",
                payload={"stepId": step_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if activity_context is not None:
                sections.append(
                    _section(
                        key="stepActivityContext",
                        title="Step Activity Context",
                        source_service="session-service",
                        value=activity_context,
                        authority_label="recorded_fact",
                    )
                )
            curriculum_anchor = await self._manifested_tool_call(
                service="session",
                tool="get-step-curriculum-anchor",
                payload={"stepId": step_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if curriculum_anchor is not None:
                sections.append(
                    _section(
                        key="curriculumAnchorSummary",
                        title="Curriculum Anchor Summary",
                        source_service="session-service",
                        value=curriculum_anchor,
                        authority_label="recorded_fact",
                    )
                )

        concept_ids = _dedupe_strings(concept_ids)
        activity_anchors = _content_anchor_from_activity(activity_context or {})
        contexts: list[dict[str, Any]] = []
        all_content_anchors: list[dict[str, Any]] = list(activity_anchors)
        readiness_items: list[dict[str, Any]] = []

        for concept_id in concept_ids:
            node = await self._manifested_tool_call(
                service="knowledge-graph",
                tool="get-concept-node",
                payload={"nodeId": concept_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            node_value = node.get("node", node) if isinstance(node, dict) else {}
            node_dict = node_value if isinstance(node_value, dict) else {}
            label = _extract_node_label(node_dict) or _label_for_concept(concept_id, {})
            node_id = _node_id_from(node_dict, concept_id)
            graph_state = "resolved" if node is not None else "fallback_label"

            prereqs = await self._manifested_tool_call(
                service="knowledge-graph",
                tool="find-prerequisites",
                payload={"nodeId": node_id or concept_id, "domain": domain, "maxDepth": 3},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            confusables = await self._manifested_tool_call(
                service="knowledge-graph",
                tool="find-confusables",
                payload={"nodeId": node_id or concept_id, "limit": 5},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            contrasts = await self._manifested_tool_call(
                service="knowledge-graph",
                tool="find-contrasts",
                payload={"nodeId": node_id or concept_id, "limit": 5},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            misconception_links = await self._manifested_tool_call(
                service="knowledge-graph",
                tool="find-misconception-links",
                payload={"nodeId": node_id or concept_id, "limit": 5},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            cards = await self._manifested_tool_call(
                service="content",
                tool="query-cards",
                payload={"knowledgeNodeIds": [concept_id], "knowledgeNodeIdMode": "any", "limit": 5},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            card_anchors = _content_anchor_from_cards(cards, concept_id)
            all_content_anchors.extend(card_anchors)

            prerequisite_summaries = [
                _relation_summary(item, fallback_label=label, relationship="prerequisite")
                for item in _relation_items(prereqs)
            ]
            confusable_summaries = [
                _relation_summary(item, fallback_label=label, relationship="confusable")
                for item in _relation_items(confusables)
            ]
            contrast_summaries = [
                _relation_summary(item, fallback_label=label, relationship="contrast")
                for item in _relation_items(contrasts)
            ]
            misconception_summaries = [
                _relation_summary(item, fallback_label=label, relationship="misconception")
                for item in _relation_items(misconception_links)
            ]
            concept_context = {
                "reasoning": {
                    "conceptLabelText": label,
                    "conceptShortDescriptionText": _node_description(node_dict, label),
                    "conceptAliasesText": [
                        value for value in node_dict.get("aliases", []) if isinstance(value, str)
                    ] if isinstance(node_dict.get("aliases"), list) else [],
                    "whyThisConceptMattersText": (
                        f"This concept is targeted by the current Step in {study_mode} mode."
                    ),
                    "prerequisiteSummaries": prerequisite_summaries,
                    "confusableConceptSummaries": confusable_summaries,
                    "contrastSummaries": contrast_summaries,
                    "misconceptionLinkSummaries": misconception_summaries,
                    "contentAnchorSummaries": [*activity_anchors, *card_anchors],
                    "curriculumAnchorText": (
                        _short_text(curriculum_anchor.get("curriculumAnchorText"), "")
                        if isinstance(curriculum_anchor, dict)
                        else ""
                    ),
                    "graphAnchorStatus": {
                        "state": graph_state,
                        "notes": [
                            "KG concept node resolved."
                            if graph_state == "resolved"
                            else "KG concept node was not available; label was derived from the concept reference."
                        ],
                    },
                },
                "serviceReferences": {
                    "conceptId": concept_id,
                    **({"nodeId": node_id} if node_id else {}),
                    "prerequisiteConceptIds": [
                        ref
                        for summary in prerequisite_summaries
                        for ref in [summary.get("serviceReferences", {}).get("conceptId")]
                        if isinstance(ref, str)
                    ],
                    "confusableConceptIds": [
                        ref
                        for summary in confusable_summaries
                        for ref in [summary.get("serviceReferences", {}).get("conceptId")]
                        if isinstance(ref, str)
                    ],
                    "contentCardIds": [
                        ref
                        for anchor in card_anchors
                        for ref in [anchor.get("serviceReferences", {}).get("cardId")]
                        if isinstance(ref, str)
                    ],
                    "generatedVariantIds": [
                        ref
                        for anchor in activity_anchors
                        for ref in [anchor.get("serviceReferences", {}).get("generatedVariantId")]
                        if isinstance(ref, str)
                    ],
                    "curriculumNodeIds": (
                        [
                            value
                            for value in curriculum_anchor.get("selectedNodeIds", [])
                            if isinstance(value, str)
                        ]
                        if isinstance(curriculum_anchor, dict)
                        else []
                    ),
                },
            }
            contexts.append(concept_context)
            readiness_items.append(
                {
                    "conceptId": concept_id,
                    "state": "ready" if graph_state == "resolved" else "degraded",
                    "missing": [] if graph_state == "resolved" else ["conceptNode"],
                    "emptyStates": [
                        key
                        for key, values in (
                            ("prerequisiteSummaries", prerequisite_summaries),
                            ("confusableConceptSummaries", confusable_summaries),
                            ("contentAnchorSummaries", [*activity_anchors, *card_anchors]),
                        )
                        if not values
                    ],
                }
            )

        if contexts:
            sections.append(
                _section(
                    key="conceptLearningContext",
                    title="Concept Learning Context",
                    source_service="agents-runtime",
                    value={"items": contexts},
                    authority_label="recorded_fact",
                )
            )
        sections.append(
            _section(
                key="contentAnchorSummaries",
                title="Content Anchor Summaries",
                source_service="agents-runtime",
                value={"items": all_content_anchors},
                authority_label="recorded_fact",
            )
        )
        readiness = {
            "state": "ready" if contexts and all(item["state"] == "ready" for item in readiness_items) else "degraded",
            "items": readiness_items,
            "rules": {
                "humanReadableReasoningOnly": True,
                "idsStayInServiceReferences": True,
            },
        }
        return {
            "compositeTool": "get-step-concept-context",
            "generatedAt": _now_iso(),
            "summary": f"Assembled concept context for {len(contexts)} concept(s).",
            "conceptLearningContext": contexts,
            "contentAnchorSummaries": all_content_anchors,
            "curriculumAnchorSummary": curriculum_anchor or {},
            "readiness": readiness,
            "sections": sections,
            "serviceInputManifest": manifest,
            "errors": errors,
            "outputContract": {
                "schema": "step_concept_context_v1",
                "artifacts": ["conceptLearningContext", "contentAnchorSummaries", "curriculumAnchorSummary"],
                "persistenceBoundary": "prompt-prefetch-only",
                "validator": "deterministic-context-shape",
            },
        }

    async def _get_step_repair_context(
        self, payload: dict[str, Any], user_id: str | None
    ) -> dict[str, Any]:
        session_id_value = payload.get("sessionId")
        session_id = str(session_id_value) if isinstance(session_id_value, str) and session_id_value else ""
        errors: list[dict[str, Any]] = []
        sections: list[dict[str, Any]] = []
        manifest: list[dict[str, Any]] = []
        study_mode = payload.get("studyMode") if isinstance(payload.get("studyMode"), str) else "knowledge_gaining"
        longitudinal_concept_ids = [
            value for value in payload.get("conceptIds", []) if isinstance(value, str)
        ]

        snapshot: dict[str, Any] | None = None
        if session_id:
            snapshot = await self._manifested_tool_call(
                service="session",
                tool="get-step-loop-snapshot",
                payload={"sessionId": session_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if snapshot is not None:
                sections.append(
                    _section(
                        key="stepLoopSnapshot",
                        title="Step Loop Snapshot",
                        source_service="session-service",
                        value=snapshot,
                    )
                )

        step_id = payload.get("stepId")
        if not isinstance(step_id, str) or not step_id:
            step_id = _first_step_id(snapshot or {})

        if isinstance(step_id, str) and step_id:
            step_evidence = await self._manifested_tool_call(
                service="session",
                tool="get-step-evidence-record",
                payload={"stepId": step_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if step_evidence is not None:
                sections.append(
                    _section(
                        key="stepEvidenceRecord",
                        title="Step Evidence Record",
                        source_service="session-service",
                        value=step_evidence,
                        authority_label="recorded_fact",
                    )
                )

            rubric_summary = await self._manifested_tool_call(
                service="session",
                tool="get-step-rubric-summary",
                payload={"stepId": step_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if rubric_summary is not None:
                sections.append(
                    _section(
                        key="rubricSummary",
                        title="Rubric Summary",
                        source_service="session-service",
                        value=rubric_summary,
                        authority_label="deterministic_projection",
                    )
                )

            evaluation = await self._manifested_tool_call(
                service="metacognition",
                tool="get-evaluation-by-step",
                payload={"stepId": step_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if evaluation is not None:
                sections.append(
                    _section(
                        key="evaluation",
                        title="Evaluation",
                        source_service="metacognition-service",
                        value=evaluation,
                    )
                )

            trace_evidence = await self._manifested_tool_call(
                service="metacognition",
                tool="get-trace-evidence-pack",
                payload={"stepId": step_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if trace_evidence is not None:
                sections.append(
                    _section(
                        key="traceEvidencePack",
                        title="Trace Evidence Pack",
                        source_service="metacognition-service",
                        value=trace_evidence,
                        authority_label="detected_signal",
                    )
                )

            diagnostic = await self._manifested_tool_call(
                service="metacognition",
                tool="get-agent-safe-diagnostic-brief",
                payload={"stepId": step_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if diagnostic is not None:
                sections.append(
                    _section(
                        key="diagnosticBrief",
                        title="Diagnostic Brief",
                        source_service="metacognition-service",
                        value=diagnostic,
                        authority_label="detected_signal",
                    )
                )

            remediation = await self._manifested_tool_call(
                service="metacognition",
                tool="get-remediation-brief",
                payload={"stepId": step_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            repair_concept_ids = [
                value for value in payload.get("conceptIds", []) if isinstance(value, str)
            ]
            if remediation is not None:
                sections.append(
                    _section(
                        key="remediationBrief",
                        title="Remediation Brief",
                        source_service="metacognition-service",
                        value=remediation,
                        authority_label="detected_signal",
                    )
                )
                repair_concept_ids.extend(
                    value for value in remediation.get("conceptRefs", []) if isinstance(value, str)
                )
                longitudinal_concept_ids.extend(repair_concept_ids)
            for concept_id in _dedupe_strings(repair_concept_ids):
                    explanation = await self._manifested_tool_call(
                        service="scheduler",
                        tool="get-concept-schedule",
                        payload={"conceptId": concept_id, "studyMode": study_mode},
                        user_id=user_id,
                        errors=errors,
                        manifest=manifest,
                    )
                    if explanation is not None:
                        concept_label = _label_for_concept(concept_id, {})
                        sections.append(
                            _section(
                                key=f"scheduleState:{concept_id}",
                                title=f"Schedule State: {concept_label}",
                                source_service="scheduler-service",
                                value=explanation,
                            )
                        )
                    history = await self._manifested_tool_call(
                        service="scheduler",
                        tool="get-transformation-history",
                        payload={"conceptId": concept_id, "studyMode": study_mode, "limit": 6},
                        user_id=user_id,
                        errors=errors,
                        manifest=manifest,
                    )
                    if history is not None:
                        concept_label = _label_for_concept(concept_id, {})
                        sections.append(
                            _section(
                                key=f"transformationHistory:{concept_id}",
                                title=f"Transformation History: {concept_label}",
                                source_service="scheduler-service",
                                value=history,
                            )
                        )

        longitudinal_concept_ids = _dedupe_strings(longitudinal_concept_ids)
        if longitudinal_concept_ids:
            repeated_patterns = await self._manifested_tool_call(
                service="metacognition",
                tool="get-repeated-pattern-history",
                payload={"conceptIds": longitudinal_concept_ids, "studyMode": study_mode, "windowDays": 30},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if repeated_patterns is not None:
                sections.append(
                    _section(
                        key="repeatedPatternHistory",
                        title="Repeated Pattern History",
                        source_service="metacognition-service",
                        value=repeated_patterns,
                        authority_label="detected_signal",
                    )
                )

        feedback = await self._manifested_tool_call(
            service="session",
            tool="get-learner-feedback-history",
            payload={"surface": "mental_debugger", "windowDays": 30},
            user_id=user_id,
            errors=errors,
            manifest=manifest,
        )
        if feedback is not None:
            sections.append(
                _section(
                    key="learnerFeedbackHistory",
                    title="Learner Feedback History",
                    source_service="session-service",
                    value=feedback,
                    authority_label="recorded_fact",
                )
            )

        if session_id:
            for key, title, tool_name, authority in (
                ("learnerLoadState", "Learner Load State", "get-learner-load-state", "detected_signal"),
                ("exposureBudgetState", "Exposure Budget State", "get-exposure-budget-state", "validation_result"),
            ):
                value = await self._manifested_tool_call(
                    service="session",
                    tool=tool_name,
                    payload={"sessionId": session_id},
                    user_id=user_id,
                    errors=errors,
                    manifest=manifest,
                )
                if value is not None:
                    sections.append(
                        _section(
                            key=key,
                            title=title,
                            source_service="session-service",
                            value=value,
                            authority_label=authority,
                        )
                    )

        return {
            "compositeTool": "get-step-repair-context",
            "generatedAt": _now_iso(),
            "summary": f"Assembled {len(sections)} repair sections for session {session_id}.",
            "sections": sections,
            "serviceInputManifest": manifest,
            "errors": errors,
            "outputContract": {
                "schema": "patch_planner_result",
                "artifacts": ["repairProposal", "reviewRouting"],
                "persistenceBoundary": "owning-service-review-surface",
                "validator": "pedagogy-guardian-service",
            },
            "openQuestions": [
                "Which remediation path should the agent prioritize if several concepts are unstable?"
            ],
        }

    async def _get_mental_debugger_context(
        self, payload: dict[str, Any], user_id: str | None
    ) -> dict[str, Any]:
        context = await self._get_step_repair_context(payload, user_id)
        sections = context.get("sections", [])
        manifest = context.setdefault("serviceInputManifest", [])
        errors = context.setdefault("errors", [])
        if isinstance(sections, list):
            concept_context = await self._get_step_concept_context(payload, user_id)
            if isinstance(manifest, list):
                manifest.extend(concept_context.get("serviceInputManifest", []))
            if isinstance(errors, list):
                errors.extend(concept_context.get("errors", []))
            for section in concept_context.get("sections", []):
                if isinstance(section, dict) and section.get("key") in {
                    "conceptLearningContext",
                    "contentAnchorSummaries",
                    "curriculumAnchorSummary",
                }:
                    sections.append(section)
            intent = payload.get("userIntent", {})
            if isinstance(intent, dict) and intent:
                sections.append(
                    _section(
                        key="userIntent",
                        title="User-Provided Intent",
                        source_service="agents-runtime",
                        value=intent,
                        authority_label="user_provided_intent",
                    )
                )
            sections.append(
                _section(
                    key="constraints",
                    title="Diagnostic Language Constraints",
                    source_service="agents-runtime",
                    value={
                        "mustUseProvisionalLanguage": True,
                        "mustNotDiagnoseStableTraits": True,
                        "mustNotMutateEvaluationOrSessionState": True,
                        "learnerTimelineDisclosure": "hide_internal_tool_calls",
                    },
                    authority_label="policy",
                    ttl_ms=300000,
                )
            )
        context["compositeTool"] = "get-mental-debugger-context"
        context["summary"] = "Mental Debugger AgentContextPack assembled from Step, Evaluation, diagnostic, remediation, and schedule facts."
        context["outputContract"] = {
            "schema": "mental_debugger_result",
            "artifacts": ["debuggerReflection", "repairRecommendation", "handoffNote"],
            "persistenceBoundary": "metacognition-read-model-ui-projection",
            "validator": "pedagogy-guardian-service",
        }
        return context

    async def _get_learner_facing_agent_foundation_context(
        self, payload: dict[str, Any], user_id: str | None
    ) -> dict[str, Any]:
        target = str(payload.get("targetAgent") or "mental-debugger")
        if target == "calibration-coach":
            context = await self._get_calibration_context(payload, user_id)
        else:
            context = await self._get_mental_debugger_context(payload, user_id)
            target = "mental-debugger"
        return _with_composite_readiness_report(
            context,
            target_agent=target,
            composite_tool="get-learner-facing-agent-foundation-context",
        )

    async def _get_mental_debugger_readiness_context(
        self, payload: dict[str, Any], user_id: str | None
    ) -> dict[str, Any]:
        context = await self._get_mental_debugger_context(payload, user_id)
        return _with_composite_readiness_report(
            context,
            target_agent="mental-debugger",
            composite_tool="get-mental-debugger-readiness-context",
        )

    async def _get_calibration_coach_readiness_context(
        self, payload: dict[str, Any], user_id: str | None
    ) -> dict[str, Any]:
        context = await self._get_calibration_context(payload, user_id)
        return _with_composite_readiness_report(
            context,
            target_agent="calibration-coach",
            composite_tool="get-calibration-coach-readiness-context",
        )

    async def _get_patch_planner_context(
        self, payload: dict[str, Any], user_id: str | None
    ) -> dict[str, Any]:
        context = await self._get_step_repair_context(payload, user_id)
        sections = context.get("sections", [])
        if isinstance(sections, list):
            debugger_reflection = payload.get("mentalDebuggerReflection")
            if isinstance(debugger_reflection, dict) and debugger_reflection:
                sections.append(
                    _section(
                        key="debuggerReflection",
                        title="Mental Debugger Reflection",
                        source_service="agents-runtime",
                        value=debugger_reflection,
                        authority_label="agent_inference",
                    )
                )
            sections.append(
                _section(
                    key="constraints",
                    title="Repair Planning Constraints",
                    source_service="agents-runtime",
                    value={
                        "minimumSufficientIntervention": True,
                        "mustNotInsertStepsDirectly": True,
                        "mustNotCreateActiveContentDirectly": True,
                        "mustRouteByOwnerService": [
                            "session-service",
                            "content-service",
                            "curriculum-service",
                            "metacognition-service",
                        ],
                    },
                    authority_label="policy",
                    ttl_ms=300000,
                )
            )
            if isinstance(payload.get("previousValidation"), dict):
                sections.append(
                    _section(
                        key="validationResults",
                        title="Validation Results",
                        source_service="pedagogy-guardian-service",
                        value=payload["previousValidation"],
                        authority_label="validation_result",
                    )
                )
        context["compositeTool"] = "get-patch-planner-context"
        context["summary"] = "Patch Planner AgentContextPack assembled from Step, remediation, scheduler, and repair-policy context."
        context["outputContract"] = {
            "schema": "patch_planner_result",
            "artifacts": ["repairProposal", "reviewRouting", "ownerServiceHandoff"],
            "persistenceBoundary": "owning-service-review-surface",
            "validator": "pedagogy-guardian-service",
        }
        return context

    async def _get_strategy_replanning_context(
        self, payload: dict[str, Any], user_id: str | None
    ) -> dict[str, Any]:
        context = await self._get_step_repair_context(payload, user_id)
        sections = context.get("sections", [])
        manifest = context.setdefault("serviceInputManifest", [])
        errors = context.setdefault("errors", [])
        if not isinstance(sections, list):
            sections = []
            context["sections"] = sections
        if not isinstance(manifest, list):
            manifest = []
            context["serviceInputManifest"] = manifest
        if not isinstance(errors, list):
            errors = []
            context["errors"] = errors

        study_mode = (
            payload.get("studyMode")
            if isinstance(payload.get("studyMode"), str)
            else "knowledge_gaining"
        )
        concept_ids = _dedupe_strings(
            [value for value in payload.get("conceptIds", []) if isinstance(value, str)]
            + _concept_ids_from_sections(sections)
        )
        labels: dict[str, str] = {}
        for concept_id in concept_ids:
            node = await self._manifested_tool_call(
                service="knowledge-graph",
                tool="get-concept-node",
                payload={"nodeId": concept_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if node is not None:
                label = _extract_node_label(node.get("node", node) if isinstance(node, dict) else {})
                if label:
                    labels[concept_id] = label
                sections.append(
                    _section(
                        key=f"conceptLabel:{concept_id}",
                        title=f"Concept Label: {_label_for_concept(concept_id, labels)}",
                        source_service="knowledge-graph-service",
                        value={
                            "conceptId": concept_id,
                            "label": _label_for_concept(concept_id, labels),
                            "node": node,
                        },
                    )
                )
            prerequisites = await self._manifested_tool_call(
                service="knowledge-graph",
                tool="find-prerequisites",
                payload={"conceptId": concept_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if prerequisites is not None:
                sections.append(
                    _section(
                        key=f"prerequisites:{concept_id}",
                        title=f"Prerequisites: {_label_for_concept(concept_id, labels)}",
                        source_service="knowledge-graph-service",
                        value=prerequisites,
                    )
                )
            related = await self._manifested_tool_call(
                service="knowledge-graph",
                tool="find-related-concepts",
                payload={"conceptId": concept_id, "studyMode": study_mode},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if related is not None:
                sections.append(
                    _section(
                        key=f"relatedConcepts:{concept_id}",
                        title=f"Related Concepts: {_label_for_concept(concept_id, labels)}",
                        source_service="knowledge-graph-service",
                        value=related,
                    )
                )

        for key, title, authority_label in (
            ("trigger", "User-Provided Trigger", "user_provided_intent"),
            ("calibrationSignal", "Calibration Signal", "detected_signal"),
            ("patchProposal", "Patch Planner Proposal", "proposal"),
        ):
            value = payload.get(key)
            if isinstance(value, dict) and value:
                sections.append(
                    _section(
                        key=key,
                        title=title,
                        source_service="agents-runtime",
                        value=value,
                        authority_label=authority_label,
                    )
                )
        if isinstance(payload.get("previousValidation"), dict):
            sections.append(
                _section(
                    key="validationResults",
                    title="Validation Results",
                    source_service="pedagogy-guardian-service",
                    value=payload["previousValidation"],
                    authority_label="validation_result",
                )
            )
        sections.append(
            _section(
                key="constraints",
                title="Strategy Replanning Constraints",
                source_service="agents-runtime",
                value={
                    "agentMayOnlyPropose": True,
                    "durableOwner": "session-service",
                    "mustNotRewriteEvaluatedSteps": True,
                    "minimumSufficientScopeOrder": ["none", "micro", "local_step", "structural", "full", "defer"],
                    "reviewSurfaces": ["session-plan-review", "active-session-timeline"],
                    "learnerTimelineDisclosure": "hide_internal_tool_calls",
                },
                authority_label="policy",
                ttl_ms=300000,
            )
        )
        context["compositeTool"] = "get-strategy-replanning-context"
        context["summary"] = "Strategy Replanning AgentContextPack assembled from session, metacognition, scheduler, KG label, proposal, and validation facts."
        context["outputContract"] = {
            "schema": "strategy_replanning_result",
            "artifacts": ["strategyReplanProposal", "reviewRouting", "ownerServiceHandoff"],
            "persistenceBoundary": "session-service-review-import",
            "validator": "pedagogy-guardian-service",
        }
        return context

    async def _get_cognitive_copilot_context(
        self, payload: dict[str, Any], user_id: str | None
    ) -> dict[str, Any]:
        session_id = payload.get("sessionId")
        if isinstance(session_id, str) and session_id:
            context = await self._get_session_explanation_pack(payload, user_id)
        else:
            context = {
                "compositeTool": "get-cognitive-copilot-context",
                "generatedAt": _now_iso(),
                "summary": "Cognitive Copilot context assembled without an active session.",
                "sections": [],
                "errors": [],
                "openQuestions": [],
            }
        sections = context.get("sections", [])
        manifest = context.setdefault("serviceInputManifest", [])
        errors = context.setdefault("errors", [])
        if not isinstance(sections, list):
            sections = []
            context["sections"] = sections
        if not isinstance(manifest, list):
            manifest = []
            context["serviceInputManifest"] = manifest
        if not isinstance(errors, list):
            errors = []
            context["errors"] = errors

        concept_ids = _dedupe_strings(
            [value for value in payload.get("conceptIds", []) if isinstance(value, str)]
            + _concept_ids_from_sections(sections)
        )
        labels: dict[str, str] = {}
        for concept_id in concept_ids:
            node = await self._manifested_tool_call(
                service="knowledge-graph",
                tool="get-concept-node",
                payload={"nodeId": concept_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if node is not None:
                label = _extract_node_label(node.get("node", node) if isinstance(node, dict) else {})
                if label:
                    labels[concept_id] = label
                sections.append(
                    _section(
                        key=f"conceptLabel:{concept_id}",
                        title=f"Concept Label: {_label_for_concept(concept_id, labels)}",
                        source_service="knowledge-graph-service",
                        value={
                            "conceptId": concept_id,
                            "label": _label_for_concept(concept_id, labels),
                            "node": node,
                        },
                    )
                )

        for key, title, authority_label in (
            ("agentHints", "Agent Hints", "agent_inference"),
            ("timelineEvents", "Timeline Events", "recorded_fact"),
            ("strategySummary", "Strategy Summary", "proposal"),
            ("patchProposal", "Patch Planner Summary", "proposal"),
            ("mentalDebuggerSummary", "Mental Debugger Summary", "agent_inference"),
            ("calibrationSignal", "Calibration Summary", "detected_signal"),
        ):
            value = payload.get(key)
            if isinstance(value, (dict, list)) and value:
                sections.append(
                    _section(
                        key=key,
                        title=title,
                        source_service="agents-runtime",
                        value=value,
                        authority_label=authority_label,
                    )
                )
        sections.append(
            _section(
                key="visibilityPolicy",
                title="Visibility And Freshness Policy",
                source_service="agents-runtime",
                value={
                    "defaultSurface": "cognitive-copilot-sidebar",
                    "quietSidebarDefault": True,
                    "hideInternalToolCalls": True,
                    "markStaleHints": True,
                    "technicalProvenanceBelowFold": True,
                },
                authority_label="policy",
                ttl_ms=300000,
            )
        )
        context["compositeTool"] = "get-cognitive-copilot-context"
        context["summary"] = "Cognitive Copilot AgentContextPack assembled from service facts, validated agent hints, timeline events, and visibility policy."
        context["outputContract"] = {
            "schema": "cognitive_copilot_result",
            "artifacts": ["copilotReadout", "hintGroups", "reviewRouting"],
            "persistenceBoundary": "ui-read-model-or-agent-batch-result",
            "validator": "pedagogy-guardian-service",
        }
        return context

    async def _get_watchtower_governance_context(
        self, payload: dict[str, Any], user_id: str | None
    ) -> dict[str, Any]:
        errors: list[dict[str, Any]] = []
        sections: list[dict[str, Any]] = []
        manifest: list[dict[str, Any]] = []
        session_id = payload.get("sessionId")
        if isinstance(session_id, str) and session_id:
            snapshot = await self._manifested_tool_call(
                service="session",
                tool="get-step-loop-snapshot",
                payload={"sessionId": session_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if snapshot is not None:
                sections.append(_section(key="surfaceContext", title="Session And Surface Context", source_service="session-service", value={**snapshot, "surface": payload.get("surface")}))
        step_id = payload.get("stepId")
        if isinstance(step_id, str) and step_id:
            diagnostic = await self._manifested_tool_call(
                service="metacognition",
                tool="get-agent-safe-diagnostic-brief",
                payload={"stepId": step_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if diagnostic is not None:
                sections.append(_section(key="diagnosticBrief", title="Diagnostic Brief", source_service="metacognition-service", value=diagnostic, authority_label="detected_signal"))
        for key, title, label in (
            ("proposedAction", "Proposed Agent Action", "proposal"),
            ("agentHints", "Agent Hints", "agent_inference"),
            ("policyContext", "Policy Context", "recorded_fact"),
        ):
            value = payload.get(key)
            if isinstance(value, (dict, list)) and value:
                sections.append(_section(key=key, title=title, source_service="agents-runtime", value=value, authority_label=label))
        sections.append(
            _section(
                key="policyConstraints",
                title="Watchtower Policy Constraints",
                source_service="agents-runtime",
                value={
                    "notBroadGovernanceAgent": True,
                    "mustNotDuplicateGuardian": True,
                    "mustMinimizeSensitiveTraceData": True,
                    "mustHideInternalToolCalls": True,
                    "governanceStates": ["allowed", "deferred", "hidden_by_policy", "needs_review", "expired", "audit_required"],
                },
                authority_label="policy",
                ttl_ms=300000,
            )
        )
        return {
            "compositeTool": "get-watchtower-governance-context",
            "generatedAt": _now_iso(),
            "summary": f"Assembled {len(sections)} Watchtower governance sections.",
            "sections": sections,
            "serviceInputManifest": manifest,
            "errors": errors,
            "outputContract": {
                "schema": "watchtower_governance_result",
                "artifacts": ["governanceDecision", "visibilityFilter", "reviewRouting"],
                "persistenceBoundary": "governance-dashboard-or-agent-batch-result",
                "validator": "watchtower-local-policy",
            },
        }

    async def _get_mode_preference_context(
        self, payload: dict[str, Any], user_id: str | None
    ) -> dict[str, Any]:
        errors: list[dict[str, Any]] = []
        sections: list[dict[str, Any]] = []
        manifest: list[dict[str, Any]] = []
        study_mode = payload.get("studyMode") if isinstance(payload.get("studyMode"), str) else "knowledge_gaining"
        session_id = payload.get("sessionId")
        if isinstance(session_id, str) and session_id:
            snapshot = await self._manifested_tool_call(
                service="session",
                tool="get-step-loop-snapshot",
                payload={"sessionId": session_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if snapshot is not None:
                sections.append(_section(key="stepLoopSnapshot", title="Step Loop Snapshot", source_service="session-service", value=snapshot))
        concept_ids = [value for value in payload.get("conceptIds", []) if isinstance(value, str)]
        labels: dict[str, str] = {}
        for concept_id in concept_ids:
            node = await self._manifested_tool_call(service="knowledge-graph", tool="get-concept-node", payload={"nodeId": concept_id}, user_id=user_id, errors=errors, manifest=manifest)
            if node is not None:
                label = _extract_node_label(node.get("node", node) if isinstance(node, dict) else {})
                if label:
                    labels[concept_id] = label
                sections.append(_section(key=f"conceptLabel:{concept_id}", title=f"Concept Label: {_label_for_concept(concept_id, labels)}", source_service="knowledge-graph-service", value={"conceptId": concept_id, "label": _label_for_concept(concept_id, labels), "node": node}))
            history = await self._manifested_tool_call(service="scheduler", tool="get-transformation-history", payload={"conceptId": concept_id, "studyMode": study_mode, "limit": 8}, user_id=user_id, errors=errors, manifest=manifest)
            if history is not None:
                sections.append(_section(key=f"transformationHistory:{concept_id}", title=f"Transformation History: {_label_for_concept(concept_id, labels)}", source_service="scheduler-service", value=history))
        for key, title, label in (
            ("candidateModes", "Eligible Candidate Modes", "recorded_fact"),
            ("deterministicFallback", "Deterministic Fallback", "recorded_fact"),
            ("forbiddenModes", "Forbidden Modes", "recorded_fact"),
            ("recentModes", "Recent Mode History", "recorded_fact"),
            ("learnerPreferences", "Learner Preferences", "recorded_fact"),
            ("trigger", "Trigger Summary", "detected_signal"),
        ):
            value = payload.get(key)
            if isinstance(value, (dict, list, str)) and value:
                sections.append(_section(key=key, title=title, source_service="agents-runtime", value=value, authority_label=label))
        sections.append(_section(key="policyConstraints", title="Mode Preference Constraints", source_service="agents-runtime", value={"tieBreakOnly": True, "mustRespectCandidateModes": True, "mustUseFallbackWhenEquivalent": True, "mustNotSelectForbiddenModes": True}, authority_label="policy", ttl_ms=300000))
        return {
            "compositeTool": "get-mode-preference-context",
            "generatedAt": _now_iso(),
            "summary": f"Assembled {len(sections)} mode preference sections.",
            "sections": sections,
            "serviceInputManifest": manifest,
            "errors": errors,
            "outputContract": {
                "schema": "mode_preference_result",
                "artifacts": ["modeChoice", "tieBreakRationale"],
                "persistenceBoundary": "invoking-service-review-import",
                "validator": "deterministic-mode-routing",
            },
        }

    async def _get_taxonomy_curator_context(
        self, payload: dict[str, Any], user_id: str | None
    ) -> dict[str, Any]:
        errors: list[dict[str, Any]] = []
        sections: list[dict[str, Any]] = []
        manifest: list[dict[str, Any]] = []
        domain = payload.get("taxonomyDomain") if isinstance(payload.get("taxonomyDomain"), str) else "failure"
        for key, title, label in (
            ("taxonomySnapshot", "Current Taxonomy Snapshot", "recorded_fact"),
            ("evidenceClusters", "Evidence Clusters", "detected_signal"),
            ("impactContext", "Impact Context", "recorded_fact"),
            ("labelIds", "Target Label IDs", "recorded_fact"),
        ):
            value = payload.get(key)
            if isinstance(value, (dict, list)) and value:
                sections.append(_section(key=key, title=title, source_service="agents-runtime", value=value, authority_label=label))
        step_id = payload.get("stepId")
        if isinstance(step_id, str) and step_id and domain in {"failure", "misconception"}:
            diagnostic = await self._manifested_tool_call(service="metacognition", tool="get-agent-safe-diagnostic-brief", payload={"stepId": step_id}, user_id=user_id, errors=errors, manifest=manifest)
            if diagnostic is not None:
                sections.append(_section(key="diagnosticBrief", title="Diagnostic Brief", source_service="metacognition-service", value=diagnostic, authority_label="detected_signal"))
        concept_ids = [value for value in payload.get("conceptIds", []) if isinstance(value, str)]
        for concept_id in concept_ids:
            node = await self._manifested_tool_call(service="knowledge-graph", tool="get-concept-node", payload={"nodeId": concept_id}, user_id=user_id, errors=errors, manifest=manifest)
            if node is not None:
                label = _extract_node_label(node.get("node", node) if isinstance(node, dict) else {}) or _label_for_concept(concept_id, {})
                sections.append(_section(key=f"conceptLabel:{concept_id}", title=f"Concept Label: {label}", source_service="knowledge-graph-service", value={"conceptId": concept_id, "label": label, "node": node}))
            if domain in {"misconception", "graph_relation"}:
                related = await self._manifested_tool_call(service="knowledge-graph", tool="find-related-concepts", payload={"conceptId": concept_id}, user_id=user_id, errors=errors, manifest=manifest)
                if related is not None:
                    sections.append(_section(key=f"relatedConcepts:{concept_id}", title=f"Related Concepts: {_label_for_concept(concept_id, {})}", source_service="knowledge-graph-service", value=related))
        if domain in {"misconception", "graph_relation"}:
            health = await self._manifested_tool_call(service="knowledge-graph", tool="get-structural-health", payload={}, user_id=user_id, errors=errors, manifest=manifest)
            if health is not None:
                sections.append(_section(key="structuralHealth", title="Structural Health", source_service="knowledge-graph-service", value=health, authority_label="detected_signal"))
        curriculum_id = payload.get("curriculumId")
        if isinstance(curriculum_id, str) and curriculum_id and domain == "curriculum":
            evidence = await self._manifested_tool_call(service="curriculum", tool="get-realignment-evidence", payload={"curriculumId": curriculum_id}, user_id=user_id, errors=errors, manifest=manifest)
            if evidence is not None:
                sections.append(_section(key="realignmentEvidence", title="Curriculum Realignment Evidence", source_service="curriculum-service", value=evidence, authority_label="detected_signal"))
        sections.append(_section(key="policyConstraints", title="Taxonomy Curation Constraints", source_service="agents-runtime", value={"proposalsOnly": True, "mustPreserveHistoricalMeaning": True, "requiresCuratorReview": True, "mustUseMinimizedEvidence": True, "mustRouteByOwnerService": True}, authority_label="policy", ttl_ms=300000))
        return {
            "compositeTool": "get-taxonomy-curator-context",
            "generatedAt": _now_iso(),
            "summary": f"Assembled {len(sections)} taxonomy curator sections for {domain}.",
            "sections": sections,
            "serviceInputManifest": manifest,
            "errors": errors,
            "outputContract": {
                "schema": "taxonomy_curator_result",
                "artifacts": ["taxonomyProposal", "versionDiff", "migrationGuidance", "impactSummary"],
                "persistenceBoundary": "taxonomy-workbench-review",
                "validator": "taxonomy-curator-local-schema",
            },
        }

    async def _get_calibration_context(
        self, payload: dict[str, Any], user_id: str | None
    ) -> dict[str, Any]:
        errors: list[dict[str, Any]] = []
        sections: list[dict[str, Any]] = []
        study_mode = payload.get("studyMode") if isinstance(payload.get("studyMode"), str) else "knowledge_gaining"
        concept_ids = payload.get("conceptIds", [])
        if not isinstance(concept_ids, list):
            concept_ids = []
        manifest: list[dict[str, Any]] = []

        session_id = payload.get("sessionId")
        if isinstance(session_id, str) and session_id:
            snapshot = await self._manifested_tool_call(
                service="session",
                tool="get-step-loop-snapshot",
                payload={"sessionId": session_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if snapshot is not None:
                sections.append(
                    _section(
                        key="stepLoopSnapshot",
                        title="Step Loop Snapshot",
                        source_service="session-service",
                        value=snapshot,
                    )
                )
                if not isinstance(payload.get("stepId"), str):
                    derived_step_id = _first_step_id(snapshot)
                    if derived_step_id is not None:
                        payload = {**payload, "stepId": derived_step_id}

        step_id = payload.get("stepId")
        if isinstance(step_id, str) and step_id:
            step_evidence = await self._manifested_tool_call(
                service="session",
                tool="get-step-evidence-record",
                payload={"stepId": step_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if step_evidence is not None:
                sections.append(
                    _section(
                        key="stepEvidenceRecord",
                        title="Step Evidence Record",
                        source_service="session-service",
                        value=step_evidence,
                        authority_label="recorded_fact",
                    )
                )

            rubric_summary = await self._manifested_tool_call(
                service="session",
                tool="get-step-rubric-summary",
                payload={"stepId": step_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if rubric_summary is not None:
                sections.append(
                    _section(
                        key="rubricSummary",
                        title="Rubric Summary",
                        source_service="session-service",
                        value=rubric_summary,
                        authority_label="deterministic_projection",
                    )
                )

            evaluation = await self._manifested_tool_call(
                service="metacognition",
                tool="get-evaluation-by-step",
                payload={"stepId": step_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if evaluation is not None:
                sections.append(
                    _section(
                        key="evaluation",
                        title="Evaluation",
                        source_service="metacognition-service",
                        value=evaluation,
                    )
                )

            trace_evidence = await self._manifested_tool_call(
                service="metacognition",
                tool="get-trace-evidence-pack",
                payload={"stepId": step_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if trace_evidence is not None:
                sections.append(
                    _section(
                        key="traceEvidencePack",
                        title="Trace Evidence Pack",
                        source_service="metacognition-service",
                        value=trace_evidence,
                        authority_label="detected_signal",
                    )
                )

            diagnostic = await self._manifested_tool_call(
                service="metacognition",
                tool="get-agent-safe-diagnostic-brief",
                payload={"stepId": step_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if diagnostic is not None:
                sections.append(
                    _section(
                        key="diagnosticBrief",
                        title="Diagnostic Brief",
                        source_service="metacognition-service",
                        value=diagnostic,
                        authority_label="detected_signal",
                    )
                )
                concept_ids = concept_ids or _concept_ids_from_diagnostic(diagnostic)

        concept_context = await self._get_step_concept_context(
            {**payload, "conceptIds": concept_ids},
            user_id,
        )
        manifest.extend(concept_context.get("serviceInputManifest", []))
        errors.extend(concept_context.get("errors", []))
        for section in concept_context.get("sections", []):
            if isinstance(section, dict) and section.get("key") in {
                "conceptLearningContext",
                "contentAnchorSummaries",
                "curriculumAnchorSummary",
            }:
                sections.append(section)

        normalized_concept_ids = [value for value in concept_ids if isinstance(value, str)]
        feedback = await self._manifested_tool_call(
            service="session",
            tool="get-learner-feedback-history",
            payload={"surface": "calibration_coach", "windowDays": 30},
            user_id=user_id,
            errors=errors,
            manifest=manifest,
        )
        if feedback is not None:
            sections.append(
                _section(
                    key="learnerFeedbackHistory",
                    title="Learner Feedback History",
                    source_service="session-service",
                    value=feedback,
                    authority_label="recorded_fact",
                )
            )

        if isinstance(session_id, str) and session_id:
            for key, title, tool_name, authority in (
                ("learnerLoadState", "Learner Load State", "get-learner-load-state", "detected_signal"),
                ("exposureBudgetState", "Exposure Budget State", "get-exposure-budget-state", "validation_result"),
            ):
                value = await self._manifested_tool_call(
                    service="session",
                    tool=tool_name,
                    payload={"sessionId": session_id},
                    user_id=user_id,
                    errors=errors,
                    manifest=manifest,
                )
                if value is not None:
                    sections.append(
                        _section(
                            key=key,
                            title=title,
                            source_service="session-service",
                            value=value,
                            authority_label=authority,
                        )
                    )

        trend = await self._manifested_tool_call(
            service="metacognition",
            tool="get-calibration-trend-summary",
            payload={"conceptIds": normalized_concept_ids, "studyMode": study_mode, "windowDays": 30},
            user_id=user_id,
            errors=errors,
            manifest=manifest,
        )
        if trend is not None:
            sections.append(
                _section(
                    key="calibrationTrendSummary",
                    title="Calibration Trend Summary",
                    source_service="metacognition-service",
                    value=trend,
                    authority_label="detected_signal",
                )
            )

        prior_drills = await self._manifested_tool_call(
            service="scheduler",
            tool="get-prior-calibration-drill-history",
            payload={"conceptIds": normalized_concept_ids, "studyMode": study_mode, "limit": 10},
            user_id=user_id,
            errors=errors,
            manifest=manifest,
        )
        if prior_drills is not None:
            sections.append(
                _section(
                    key="priorCalibrationDrillHistory",
                    title="Prior Calibration Drill History",
                    source_service="scheduler-service",
                    value=prior_drills,
                    authority_label="recorded_fact",
                )
            )

        cadence = await self._manifested_tool_call(
            service="scheduler",
            tool="get-intervention-cadence-state",
            payload={"conceptIds": normalized_concept_ids, "surfaces": ["calibration_coach"]},
            user_id=user_id,
            errors=errors,
            manifest=manifest,
        )
        if cadence is not None:
            sections.append(
                _section(
                    key="interventionCadenceState",
                    title="Intervention Cadence State",
                    source_service="scheduler-service",
                    value=cadence,
                    authority_label="policy",
                )
            )

        for concept_id in normalized_concept_ids:
            concept_label = _label_for_concept(concept_id, {})
            average = await self._manifested_tool_call(
                service="metacognition",
                tool="get-reasoning-average",
                payload={"conceptId": concept_id, "studyMode": study_mode},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if average is not None:
                sections.append(
                    _section(
                        key=f"reasoningAverage:{concept_id}",
                        title=f"Reasoning Average: {concept_label}",
                        source_service="metacognition-service",
                        value=average,
                        authority_label="detected_signal",
                    )
                )
            schedule = await self._manifested_tool_call(
                service="scheduler",
                tool="get-concept-schedule",
                payload={"conceptId": concept_id, "studyMode": study_mode},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if schedule is not None:
                sections.append(
                    _section(
                        key=f"calibrationProjection:{concept_id}",
                        title=f"Calibration Projection: {concept_label}",
                        source_service="scheduler-service",
                        value=schedule,
                    )
                )
            projection = await self._manifested_tool_call(
                service="scheduler",
                tool="get-concept-calibration-projection",
                payload={"conceptId": concept_id, "studyMode": study_mode},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if projection is not None:
                sections.append(
                    _section(
                        key=f"conceptCalibrationProjection:{concept_id}",
                        title=f"Concept Calibration Projection: {concept_label}",
                        source_service="scheduler-service",
                        value=projection,
                        authority_label="detected_signal",
                    )
                )
            mismatch = await self._manifested_tool_call(
                service="metacognition",
                tool="get-concept-mismatch-history",
                payload={"conceptId": concept_id, "studyMode": study_mode, "windowDays": 30},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if mismatch is not None:
                sections.append(
                    _section(
                        key=f"conceptMismatchHistory:{concept_id}",
                        title=f"Concept Mismatch History: {concept_label}",
                        source_service="metacognition-service",
                        value=mismatch,
                        authority_label="detected_signal",
                    )
                )

        return {
            "compositeTool": "get-calibration-context",
            "generatedAt": _now_iso(),
            "summary": f"Assembled {len(sections)} calibration sections.",
            "sections": sections,
            "serviceInputManifest": manifest,
            "errors": errors,
            "outputContract": {
                "schema": "calibration_coaching_result",
                "artifacts": ["calibrationReflection", "recommendations", "reviewRouting"],
                "persistenceBoundary": "metacognition-read-model-ui-projection",
                "validator": "pedagogy-guardian-service",
            },
            "openQuestions": ["Does the agent need additional learner-safe wording before surfacing this?"],
        }

    async def _get_session_explanation_pack(
        self, payload: dict[str, Any], user_id: str | None
    ) -> dict[str, Any]:
        active_context = await self._get_active_learning_context(payload, user_id)
        active_context["compositeTool"] = "get-session-explanation-pack"
        active_context["summary"] = "Narrative-ready session explanation pack assembled from active context."
        return active_context

    async def _get_stability_and_reasoning_pack(
        self, payload: dict[str, Any], user_id: str | None
    ) -> dict[str, Any]:
        errors: list[dict[str, Any]] = []
        sections: list[dict[str, Any]] = []
        study_mode = payload.get("studyMode") if isinstance(payload.get("studyMode"), str) else "knowledge_gaining"
        concept_ids = [value for value in payload.get("conceptIds", []) if isinstance(value, str)]

        for concept_id in concept_ids:
            concept_label = _label_for_concept(concept_id, {})
            schedule = await self._safe_tool_call(
                service="scheduler",
                tool="get-concept-schedule",
                payload={"conceptId": concept_id, "studyMode": study_mode},
                user_id=user_id,
                errors=errors,
            )
            if schedule is not None:
                sections.append(
                    _section(
                        key=f"schedule:{concept_id}",
                        title=f"Schedule: {concept_label}",
                        source_service="scheduler-service",
                        value=schedule,
                    )
                )

            average = await self._safe_tool_call(
                service="metacognition",
                tool="get-reasoning-average",
                payload={"conceptId": concept_id, "studyMode": study_mode},
                user_id=user_id,
                errors=errors,
            )
            if average is not None:
                sections.append(
                    _section(
                        key=f"reasoning:{concept_id}",
                        title=f"Reasoning: {concept_label}",
                        source_service="metacognition-service",
                        value=average,
                        authority_label="detected_signal",
                    )
                )

        return {
            "compositeTool": "get-stability-and-reasoning-pack",
            "generatedAt": _now_iso(),
            "summary": f"Assembled {len(sections)} stability and reasoning sections for {len(concept_ids)} concepts.",
            "sections": sections,
            "errors": errors,
            "openQuestions": ["Which concepts should be prioritized for repair vs reinforcement?"],
        }

    async def _get_content_creator_brief(
        self, payload: dict[str, Any], user_id: str | None
    ) -> dict[str, Any]:
        errors: list[dict[str, Any]] = []
        sections: list[dict[str, Any]] = []
        manifest: list[dict[str, Any]] = []
        curriculum_id = payload.get("curriculumId")
        session_id = payload.get("sessionId")
        study_mode = payload.get("studyMode")
        concept_ids = [value for value in payload.get("conceptIds", []) if isinstance(value, str)]
        selected_node_ids = [
            value for value in payload.get("selectedNodeIds", []) if isinstance(value, str)
        ]
        document_ids = [value for value in payload.get("documentIds", []) if isinstance(value, str)]
        preflight_artifacts = payload.get("preflightArtifacts") if isinstance(payload.get("preflightArtifacts"), dict) else {}
        graph_readiness = preflight_artifacts.get("graphReadiness") if isinstance(preflight_artifacts.get("graphReadiness"), dict) else {}
        if graph_readiness.get("status") != "finalized":
            raw_context = {
                "compositeTool": "get-content-creator-brief",
                "generatedAt": _now_iso(),
                "summary": "Content creator brief blocked until graph-intervention-orchestrator returns finalized readiness.",
                "sections": [],
                "serviceInputManifest": [],
                "errors": [],
                "resolvedConceptIds": [],
                "missingConceptRefs": concept_ids,
                "confirmedMissingConceptNodeIds": [],
                "providerTools": [],
                "outputContract": {
                    "schema": "content_creator_result",
                    "artifacts": ["cards", "activityVariants"],
                    "persistenceBoundary": "content-service",
                    "validator": "pedagogy-guardian-service",
                },
                "openQuestions": ["Graph readiness must be finalized before graph-anchored content generation."],
            }
            request_like = SimpleNamespace(
                user_id=user_id or payload.get("userId") or "user_unknown",
                curriculum_id=curriculum_id,
                session_id=session_id,
                concept_ids=concept_ids,
                selected_node_ids=selected_node_ids,
                document_ids=document_ids,
                desired_card_types=[value for value in payload.get("desiredCardTypes", []) if isinstance(value, str)],
                study_mode=study_mode,
                payload=payload,
            )
            prompt = ContentCreationPromptBuilder().build(
                request=request_like,
                raw_context=raw_context,
                run_id=payload.get("agentRunId") if isinstance(payload.get("agentRunId"), str) else None,
                preflight=preflight_artifacts,
            )
            return {
                **prompt,
                "compositeTool": "get-content-creator-brief",
                "generatedAt": raw_context["generatedAt"],
                "summary": raw_context["summary"],
                "sections": [],
                "serviceInputManifest": [],
                "errors": [],
                "resolvedConceptIds": [],
                "missingConceptRefs": concept_ids,
                "confirmedMissingConceptNodeIds": [],
                "openQuestions": raw_context["openQuestions"],
                "outputContract": raw_context["outputContract"],
                "rawContext": raw_context,
                "readiness": {
                    "ready": ContentCreationPromptBuilder().is_ready(prompt),
                    "errors": ContentCreationPromptBuilder().readiness_errors(prompt),
                },
            }
        graph_concepts = [item for item in graph_readiness.get("concepts", []) if isinstance(item, dict)]
        resolved_content_concept_ids: list[str] = []
        labels: dict[str, str] = {
            str(item.get("inputRef")): str(item.get("label"))
            for item in graph_concepts
            if isinstance(item.get("inputRef"), str) and isinstance(item.get("label"), str)
        }
        for item in graph_concepts:
            input_ref = str(item.get("inputRef") or item.get("conceptId") or item.get("conceptRef"))
            content_concept_id = item.get("conceptId")
            if not isinstance(content_concept_id, str) or not content_concept_id:
                continue
            resolved_content_concept_ids.append(content_concept_id)
            coverage = await self._manifested_tool_call(
                service="content",
                tool="get-coverage",
                payload={"conceptId": content_concept_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if coverage is not None:
                sections.append(_section(key=f"contentCoverage:{input_ref}", title=f"Content Coverage: {_label_for_concept(input_ref, labels)}", source_service="content-service", value=coverage))
            variants = await self._manifested_tool_call(
                service="content",
                tool="list-generated-activity-variants",
                payload={"conceptId": content_concept_id, **({"studyMode": study_mode} if isinstance(study_mode, str) else {}), "limit": 20},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if variants is not None:
                sections.append(_section(key=f"generatedActivityVariants:{input_ref}", title=f"Generated Activity Variants: {_label_for_concept(input_ref, labels)}", source_service="content-service", value={"generatedVariants": variants if isinstance(variants, list) else []}))
            existing = await self._manifested_tool_call(
                service="content",
                tool="query-cards",
                payload={"anchoredCkgNodeIds": [content_concept_id], "states": ["active", "draft"], "limit": 20, **({"supportedStudyModes": [study_mode]} if isinstance(study_mode, str) else {})},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if existing is not None:
                sections.append(_section(key=f"existingContent:{input_ref}", title=f"Existing Content: {_label_for_concept(input_ref, labels)}", source_service="content-service", value=existing))
            schedule = await self._manifested_tool_call(
                service="scheduler",
                tool="get-concept-schedule",
                payload={"conceptId": content_concept_id, **({"studyMode": study_mode} if isinstance(study_mode, str) else {})},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if schedule is not None:
                sections.append(_section(key=f"learnerSchedule:{input_ref}", title=f"Learner Schedule: {_label_for_concept(input_ref, labels)}", source_service="scheduler-service", value=schedule))
            reasoning = await self._manifested_tool_call(
                service="metacognition",
                tool="get-reasoning-average",
                payload={"conceptId": content_concept_id, **({"studyMode": study_mode} if isinstance(study_mode, str) else {})},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if reasoning is not None:
                sections.append(_section(key=f"learnerReasoning:{input_ref}", title=f"Learner Reasoning: {_label_for_concept(input_ref, labels)}", source_service="metacognition-service", value=reasoning, authority_label="detected_signal"))
        resolved_content_concept_ids = _dedupe_strings(resolved_content_concept_ids)
        if isinstance(curriculum_id, str) and curriculum_id:
            for tool, key, title in (("get-active-version", "curriculumActiveVersion", "Curriculum Active Version"), ("get-frontier", "curriculumFrontier", "Curriculum Frontier")):
                value = await self._manifested_tool_call(service="curriculum", tool=tool, payload={"curriculumId": curriculum_id}, user_id=user_id, errors=errors, manifest=manifest)
                if value is not None:
                    sections.append(_section(key=key, title=title, source_service="curriculum-service", value=value))
        if isinstance(session_id, str) and session_id:
            remediation = await self._manifested_tool_call(service="metacognition", tool="get-remediation-brief", payload={"sessionId": session_id}, user_id=user_id, errors=errors, manifest=manifest)
            if remediation is not None:
                sections.append(_section(key="repairSignals", title="Repair Signals", source_service="metacognition-service", value=remediation, authority_label="detected_signal"))
        for document_id in document_ids:
            document_context = await self._manifested_tool_call(service="ingestion", tool="get-document-context", payload={"documentId": document_id}, user_id=user_id, errors=errors, manifest=manifest)
            if document_context is not None:
                sections.append(_section(key=f"sourceDocument:{document_id}", title=f"Source Document {document_id}", source_service="ingestion-service", value=document_context))
            chunks = await self._manifested_tool_call(service="vector", tool="retrieve-document-chunks", payload={"documentId": document_id, "conceptLabels": _semantic_retrieval_labels(concept_ids, resolved_content_concept_ids, labels), "conceptIds": resolved_content_concept_ids or concept_ids, "limit": 8}, user_id=user_id, errors=errors, manifest=manifest)
            if chunks is not None:
                sections.append(_section(key=f"ragGrounding:{document_id}", title=f"RAG Grounding {document_id}", source_service="vector-service", value=chunks))
        sections.append(_section(key="guardianConstraints", title="Guardian Constraints", source_service="pedagogy-guardian-service", value={"owner": "pedagogy-guardian-service", "rules": ["Reject answer leakage.", "Reject unsupported factual claims.", "Reject wrong target concept or malformed response schema.", "Generated artifacts remain proposals until content-service persists them."]}, authority_label="policy"))
        raw_context = {
            "compositeTool": "get-content-creator-brief",
            "generatedAt": _now_iso(),
            "summary": f"Content creator brief assembled from finalized graph readiness for {len(graph_concepts)} concept(s), {len(document_ids)} document(s), {len(sections)} section(s).",
            "sections": sections,
            "serviceInputManifest": manifest,
            "errors": errors,
            "resolvedConceptIds": resolved_content_concept_ids,
            "missingConceptRefs": [],
            "confirmedMissingConceptNodeIds": [],
            "providerTools": [],
            "outputContract": {"schema": "content_creator_result", "artifacts": ["cards", "activityVariants"], "persistenceBoundary": "content-service", "validator": "pedagogy-guardian-service"},
            "openQuestions": ["Which generated items need human review before session eligibility?"],
        }
        request_like = SimpleNamespace(user_id=user_id or payload.get("userId") or "user_unknown", curriculum_id=curriculum_id, session_id=session_id, concept_ids=concept_ids, selected_node_ids=selected_node_ids, document_ids=document_ids, desired_card_types=[value for value in payload.get("desiredCardTypes", []) if isinstance(value, str)], study_mode=study_mode, payload=payload)
        prompt = ContentCreationPromptBuilder().build(request=request_like, raw_context=raw_context, run_id=payload.get("agentRunId") if isinstance(payload.get("agentRunId"), str) else None, preflight=preflight_artifacts)
        return {
            **prompt,
            "compositeTool": "get-content-creator-brief",
            "generatedAt": raw_context["generatedAt"],
            "summary": raw_context["summary"],
            "sections": [],
            "serviceInputManifest": raw_context["serviceInputManifest"],
            "errors": raw_context["errors"],
            "resolvedConceptIds": raw_context["resolvedConceptIds"],
            "missingConceptRefs": [],
            "confirmedMissingConceptNodeIds": [],
            "openQuestions": raw_context["openQuestions"],
            "outputContract": raw_context["outputContract"],
            "rawContext": raw_context,
            "readiness": {"ready": ContentCreationPromptBuilder().is_ready(prompt), "errors": ContentCreationPromptBuilder().readiness_errors(prompt)},
        }

        resolved_graph_nodes: dict[str, dict[str, Any]] = {}
        resolved_content_concept_ids: list[str] = []
        unresolved_refs: list[str] = []
        confirmed_missing_ids: set[str] = set()
        labels: dict[str, str] = {}  # concept_ref → human-readable label, built as nodes are fetched

        domain_hint = payload.get("domain")
        if not isinstance(domain_hint, str) or not domain_hint:
            domain_hint = None

        for index, concept_ref in enumerate(concept_ids):
            selected_graph_node_id = (
                selected_node_ids[index]
                if index < len(selected_node_ids) and _is_graph_node_id(selected_node_ids[index])
                else None
            )
            graph_node_id: str | None = (
                concept_ref if _is_graph_node_id(concept_ref) else selected_graph_node_id
            )
            content_concept_id: str | None = (
                concept_ref if _is_canonical_concept_id(concept_ref) else None
            )
            resolved_match: dict[str, Any] | None = None

            if not _is_canonical_concept_id(concept_ref):
                resolution_input = {
                    "ref": concept_ref,
                    **({"domain": domain_hint} if domain_hint is not None else {}),
                    **({"studyMode": study_mode} if isinstance(study_mode, str) else {}),
                    "graphType": "both",
                    "limit": 8,
                }
                resolution = await self._manifested_tool_call(
                    service="knowledge-graph",
                    tool="resolve-concept-reference",
                    payload=resolution_input,
                    user_id=user_id,
                    errors=errors,
                    manifest=manifest,
                )
                if isinstance(resolution, dict):
                    match = resolution.get("match")
                    if isinstance(match, dict):
                        resolved_match = match
                        resolved_graph_nodes[concept_ref] = match
                        graph_node_id = _string_from_mapping(match, "nodeId") or graph_node_id
                        content_concept_id = (
                            _string_from_mapping(match, "conceptId") or content_concept_id
                        )
                        match_domain = _string_from_mapping(match, "domain")
                        if domain_hint is None and match_domain is not None:
                            domain_hint = match_domain
                        match_label = _extract_node_label(match)
                        if match_label:
                            labels[concept_ref] = match_label
                    sections.append(
                        _section(
                            key=f"conceptResolution:{concept_ref}",
                            title=f"Concept Resolution: {_label_for_concept(concept_ref, labels)}",
                            source_service="knowledge-graph-service",
                            value=resolution,
                            authority_label="recorded_fact" if resolved_match is not None else "detected_signal",
                        )
                    )

            if graph_node_id is not None:
                graph_type = (
                    _string_from_mapping(resolved_match, "graphType")
                    if resolved_match is not None
                    else None
                )
                if graph_type != "ckg":
                    node, kg_confirmed_missing = await self._safe_kg_concept_call(
                        tool="get-concept-node",
                        payload={"nodeId": graph_node_id},
                        user_id=user_id,
                        errors=errors,
                        manifest=manifest,
                    )
                    if kg_confirmed_missing and resolved_match is None:
                        confirmed_missing_ids.add(concept_ref)
                    if node is not None:
                        resolved_graph_nodes[concept_ref] = node
                        node_label = _extract_node_label(node)
                        if node_label:
                            labels[concept_ref] = node_label  # prefer node label over resolution match
                        if domain_hint is None and isinstance(node, dict):
                            node_domain = node.get("domain")
                            if isinstance(node_domain, str) and node_domain:
                                domain_hint = node_domain
                        sections.append(
                            _section(
                                key=f"graphConcept:{concept_ref}",
                                title=f"Graph Concept: {_label_for_concept(concept_ref, labels)}",
                                source_service="knowledge-graph-service",
                                value=node,
                            )
                        )

                if domain_hint is not None and graph_type != "ckg":
                    prereqs = await self._manifested_tool_call(
                        service="knowledge-graph",
                        tool="find-prerequisites",
                        payload={"nodeId": graph_node_id, "domain": domain_hint},
                        user_id=user_id,
                        errors=errors,
                        manifest=manifest,
                    )
                    if prereqs is not None:
                        sections.append(
                            _section(
                                key=f"graphPrerequisites:{concept_ref}",
                                title=f"Graph Prerequisites: {_label_for_concept(concept_ref, labels)}",
                                source_service="knowledge-graph-service",
                                value=prereqs,
                            )
                        )

            if content_concept_id is None:
                unresolved_refs.append(concept_ref)
                existing_query: dict[str, Any] = {
                    "search": _slug_to_label(concept_ref),
                    "states": ["active", "draft"],
                    "limit": 20,
                    **({"supportedStudyModes": [study_mode]} if isinstance(study_mode, str) else {}),
                }
            else:
                resolved_content_concept_ids.append(content_concept_id)
                coverage = await self._manifested_tool_call(
                    service="content",
                    tool="get-coverage",
                    payload={"conceptId": content_concept_id},
                    user_id=user_id,
                    errors=errors,
                    manifest=manifest,
                )
                if coverage is not None:
                    sections.append(
                        _section(
                            key=f"contentCoverage:{concept_ref}",
                            title=f"Content Coverage: {_label_for_concept(concept_ref, labels)}",
                            source_service="content-service",
                            value=coverage,
                        )
                    )

                variants = await self._manifested_tool_call(
                    service="content",
                    tool="list-generated-activity-variants",
                    payload={
                        "conceptId": content_concept_id,
                        **({"studyMode": study_mode} if isinstance(study_mode, str) else {}),
                        "limit": 20,
                    },
                    user_id=user_id,
                    errors=errors,
                    manifest=manifest,
                )
                if variants is not None:
                    sections.append(
                        _section(
                            key=f"generatedActivityVariants:{concept_ref}",
                            title=f"Generated Activity Variants: {_label_for_concept(concept_ref, labels)}",
                            source_service="content-service",
                            value={"generatedVariants": variants if isinstance(variants, list) else []},
                        )
                    )

                gap = await self._manifested_tool_call(
                    service="content",
                    tool="gap-fill-concepts",
                    payload={"conceptId": content_concept_id},
                    user_id=user_id,
                    errors=errors,
                    manifest=manifest,
                )
                if gap is not None:
                    sections.append(
                        _section(
                            key=f"contentGap:{concept_ref}",
                            title=f"Content Gap: {_label_for_concept(concept_ref, labels)}",
                            source_service="content-service",
                            value=gap,
                            authority_label="detected_signal",
                        )
                    )

                existing_query = {
                    "anchoredCkgNodeIds": [content_concept_id],
                    "states": ["active", "draft"],
                    "limit": 20,
                    **({"supportedStudyModes": [study_mode]} if isinstance(study_mode, str) else {}),
                }

                schedule = await self._manifested_tool_call(
                    service="scheduler",
                    tool="get-concept-schedule",
                    payload={"conceptId": content_concept_id, **({"studyMode": study_mode} if isinstance(study_mode, str) else {})},
                    user_id=user_id,
                    errors=errors,
                    manifest=manifest,
                )
                if schedule is not None:
                    sections.append(
                        _section(
                            key=f"learnerSchedule:{concept_ref}",
                            title=f"Learner Schedule: {_label_for_concept(concept_ref, labels)}",
                            source_service="scheduler-service",
                            value=schedule,
                        )
                    )

                reasoning = await self._manifested_tool_call(
                    service="metacognition",
                    tool="get-reasoning-average",
                    payload={"conceptId": content_concept_id, **({"studyMode": study_mode} if isinstance(study_mode, str) else {})},
                    user_id=user_id,
                    errors=errors,
                    manifest=manifest,
                )
                if reasoning is not None:
                    sections.append(
                        _section(
                            key=f"learnerReasoning:{concept_ref}",
                            title=f"Learner Reasoning: {_label_for_concept(concept_ref, labels)}",
                            source_service="metacognition-service",
                            value=reasoning,
                            authority_label="detected_signal",
                        )
                    )

            existing = await self._manifested_tool_call(
                service="content",
                tool="query-cards",
                payload=existing_query,
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if existing is not None:
                sections.append(
                    _section(
                        key=f"existingContent:{concept_ref}",
                        title=f"Existing Content: {_label_for_concept(concept_ref, labels)}",
                        source_service="content-service",
                        value=existing,
                    )
                )

        resolved_content_concept_ids = _dedupe_strings(resolved_content_concept_ids)
        if domain_hint is not None:
            health = await self._manifested_tool_call(
                service="knowledge-graph",
                tool="get-structural-health",
                payload={"domain": domain_hint, **({"studyMode": study_mode} if isinstance(study_mode, str) else {})},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if health is not None:
                sections.append(
                    _section(
                        key="graphStructuralHealth",
                        title="Graph Structural Health",
                        source_service="knowledge-graph-service",
                        value=health,
                    )
                )

        if isinstance(curriculum_id, str) and curriculum_id:
            for tool, key, title in (
                ("get-active-version", "curriculumActiveVersion", "Curriculum Active Version"),
                ("get-frontier", "curriculumFrontier", "Curriculum Frontier"),
            ):
                value = await self._manifested_tool_call(
                    service="curriculum",
                    tool=tool,
                    payload={"curriculumId": curriculum_id},
                    user_id=user_id,
                    errors=errors,
                    manifest=manifest,
                )
                if value is not None:
                    sections.append(
                        _section(
                            key=key,
                            title=title,
                            source_service="curriculum-service",
                            value=value,
                        )
                    )

        if isinstance(session_id, str) and session_id:
            remediation = await self._manifested_tool_call(
                service="metacognition",
                tool="get-remediation-brief",
                payload={"sessionId": session_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if remediation is not None:
                sections.append(
                    _section(
                        key="repairSignals",
                        title="Repair Signals",
                        source_service="metacognition-service",
                        value=remediation,
                        authority_label="detected_signal",
                    )
                )

        for document_id in document_ids:
            document_context = await self._manifested_tool_call(
                service="ingestion",
                tool="get-document-context",
                payload={"documentId": document_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if document_context is not None:
                sections.append(
                    _section(
                        key=f"sourceDocument:{document_id}",
                        title=f"Source Document {document_id}",
                        source_service="ingestion-service",
                        value=document_context,
                    )
                )

            chunks = await self._manifested_tool_call(
                service="vector",
                tool="retrieve-document-chunks",
                payload={
                    "documentId": document_id,
                    "conceptLabels": _semantic_retrieval_labels(
                        concept_ids, resolved_content_concept_ids, labels
                    ),
                    "conceptIds": resolved_content_concept_ids or concept_ids,
                    "limit": 8,
                },
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if chunks is not None:
                sections.append(
                    _section(
                        key=f"ragGrounding:{document_id}",
                        title=f"RAG Grounding {document_id}",
                        source_service="vector-service",
                        value=chunks,
                    )
                )

        guardian_constraints = {
            "owner": "pedagogy-guardian-service",
            "rules": [
                "Reject answer leakage.",
                "Reject unsupported factual claims.",
                "Reject wrong target concept or malformed response schema.",
                "Generated artifacts remain proposals until content-service persists them.",
            ],
        }
        sections.append(
            _section(
                key="guardianConstraints",
                title="Guardian Constraints",
                source_service="pedagogy-guardian-service",
                value=guardian_constraints,
                authority_label="policy",
            )
        )

        missing_concept_refs = [
            ref
            for ref in concept_ids
            if ref not in resolved_graph_nodes and ref not in resolved_content_concept_ids
        ]
        confirmed_missing_list = sorted(confirmed_missing_ids)
        open_questions = ["Which generated items need human review before session eligibility?"]
        if confirmed_missing_list:
            missing_labels = [_label_for_concept(ref, labels) for ref in confirmed_missing_list]
            open_questions.append(
                f"Concept(s) {missing_labels} were confirmed absent from the knowledge graph "
                "(KG returned not_found). Delegate to graph-intervention-orchestrator to resolve these nodes along with "
                "their prerequisites and entry-path edges before generating final cards."
            )
        elif missing_concept_refs:
            missing_labels = [_label_for_concept(ref, labels) for ref in missing_concept_refs]
            open_questions.append(
                f"Concept(s) {missing_labels} were not resolved to graph nodes. "
                "Choose one of the resolver candidates or delegate to graph-intervention-orchestrator before generating final cards."
            )
        if unresolved_refs:
            unresolved_labels = [_label_for_concept(ref, labels) for ref in unresolved_refs]
            open_questions.append(
                f"Concept(s) {unresolved_labels} were not resolved to canonical content concept IDs. "
                "The brief includes graph/search context, but content coverage and scheduler state require canonical concept IDs."
            )

        raw_context = {
            "compositeTool": "get-content-creator-brief",
            "generatedAt": _now_iso(),
            "summary": (
                f"Content creator brief assembled for {len(concept_ids)} concept(s), "
                f"{len(document_ids)} document(s), {len(sections)} section(s)."
            ),
            "sections": sections,
            "serviceInputManifest": manifest,
            "errors": errors,
            "resolvedConceptIds": resolved_content_concept_ids,
            "missingConceptRefs": missing_concept_refs,
            "confirmedMissingConceptNodeIds": confirmed_missing_list,
            "providerTools": [],
            "outputContract": {
                "schema": "content_creator_result",
                "artifacts": ["cards", "activityVariants"],
                "persistenceBoundary": "content-service",
                "validator": "pedagogy-guardian-service",
            },
            "openQuestions": open_questions,
        }
        request_like = SimpleNamespace(
            user_id=user_id or payload.get("userId") or "user_unknown",
            curriculum_id=curriculum_id,
            session_id=session_id,
            concept_ids=concept_ids,
            selected_node_ids=selected_node_ids,
            document_ids=document_ids,
            desired_card_types=[
                value for value in payload.get("desiredCardTypes", []) if isinstance(value, str)
            ],
            study_mode=study_mode,
            payload=payload,
        )
        prompt = ContentCreationPromptBuilder().build(
            request=request_like,
            raw_context=raw_context,
            run_id=payload.get("agentRunId") if isinstance(payload.get("agentRunId"), str) else None,
            preflight=payload.get("preflightArtifacts")
            if isinstance(payload.get("preflightArtifacts"), dict)
            else None,
        )
        return {
            **prompt,
            "compositeTool": "get-content-creator-brief",
            "generatedAt": raw_context["generatedAt"],
            "summary": raw_context["summary"],
            "sections": [],
            "serviceInputManifest": raw_context["serviceInputManifest"],
            "errors": raw_context["errors"],
            "resolvedConceptIds": raw_context["resolvedConceptIds"],
            "missingConceptRefs": raw_context["missingConceptRefs"],
            "confirmedMissingConceptNodeIds": raw_context["confirmedMissingConceptNodeIds"],
            "openQuestions": raw_context["openQuestions"],
            "outputContract": raw_context["outputContract"],
            "rawContext": raw_context,
            "readiness": {
                "ready": ContentCreationPromptBuilder().is_ready(prompt),
                "errors": ContentCreationPromptBuilder().readiness_errors(prompt),
            },
        }

    async def _get_ingestion_concept_extraction_brief(
        self, payload: dict[str, Any], user_id: str | None
    ) -> dict[str, Any]:
        errors: list[dict[str, Any]] = []
        sections: list[dict[str, Any]] = []
        manifest: list[dict[str, Any]] = []
        study_mode = payload.get("studyMode")
        curriculum_id = payload.get("curriculumId")
        intent = payload.get("intent", "both")
        document_id = payload.get("documentId")
        if not isinstance(document_id, str) or not document_id:
            document_ids = [value for value in payload.get("documentIds", []) if isinstance(value, str)]
            document_id = document_ids[0] if document_ids else None
        if not isinstance(document_id, str) or not document_id:
            return {
                "compositeTool": "get-ingestion-concept-extraction-brief",
                "generatedAt": _now_iso(),
                "summary": "Ingestion extraction brief could not be assembled because no document id was provided.",
                "sections": [],
                "serviceInputManifest": [],
                "errors": [{"service": "agents-runtime", "tool": "get-ingestion-concept-extraction-brief", "message": "documentId is required"}],
                "providerTools": [],
                "outputContract": {
                    "schema": "ingestion_concept_extraction_result",
                    "persistenceBoundary": "ingestion-service",
                },
                "openQuestions": ["Which document should be used for extraction?"],
            }

        document_context = await self._manifested_tool_call(
            service="ingestion",
            tool="get-document-context",
            payload={"documentId": document_id},
            user_id=user_id,
            errors=errors,
            manifest=manifest,
        )
        if document_context is not None:
            sections.append(
                _section(
                    key="documentContext",
                    title="Document Context",
                    source_service="ingestion-service",
                    value=document_context,
                )
            )

        document_ir = await self._manifested_tool_call(
            service="ingestion",
            tool="get-document-ir",
            payload={"documentId": document_id},
            user_id=user_id,
            errors=errors,
            manifest=manifest,
        )
        if document_ir is not None:
            sections.append(
                _section(
                    key="documentIr",
                    title="Document IR",
                    source_service="ingestion-service",
                    value=document_ir,
                )
            )

        document_chunks = await self._manifested_tool_call(
            service="ingestion",
            tool="get-document-chunks",
            payload={"documentId": document_id},
            user_id=user_id,
            errors=errors,
            manifest=manifest,
        )
        if document_chunks is not None:
            sections.append(
                _section(
                    key="documentChunks",
                    title="Document Chunks",
                    source_service="ingestion-service",
                    value=document_chunks,
                )
            )

        scan_windows = payload.get("scanWindows", [])
        if isinstance(scan_windows, list) and scan_windows:
            manifest.append(
                {
                    "service": "ingestion-service",
                    "tool": "build-document-scan-windows",
                    "input": {"documentId": document_id, "windowCount": len(scan_windows)},
                }
            )
            sections.append(
                _section(
                    key="documentScanWindows",
                    title="Document Scan Windows",
                    source_service="ingestion-service",
                    value=scan_windows,
                )
            )
        elif document_chunks is None:
            errors.append(
                {
                    "service": "ingestion-service",
                    "tool": "build-document-scan-windows",
                    "message": "scanWindows were not supplied and document chunks were unavailable for fallback derivation.",
                    "kind": "missing_context",
                }
            )

        if isinstance(curriculum_id, str) and curriculum_id:
            active_version = await self._manifested_tool_call(
                service="curriculum",
                tool="get-active-version",
                payload={"curriculumId": curriculum_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if active_version is not None:
                sections.append(
                    _section(
                        key="existingCurriculumContext",
                        title="Existing Curriculum Context",
                        source_service="curriculum-service",
                        value=active_version,
                    )
                )

        coverage = await self._manifested_tool_call(
            service="content",
            tool="query-cards",
            payload={"sourceDocumentIds": [document_id], "limit": 12},
            user_id=user_id,
            errors=errors,
            manifest=manifest,
        )
        if coverage is not None:
            sections.append(
                _section(
                    key="existingContentCoverage",
                    title="Existing Content Coverage",
                    source_service="content-service",
                    value=coverage,
                )
            )

        policy_context = {
            "confidenceThresholds": {
                "weakEvidence": 0.45,
                "candidate": 0.55,
                "matched": 0.85,
            },
            "approvalGating": {
                "graphProposalRequiresUserApproval": True,
                "curriculumDraftRequiresMappedConcepts": True,
                "contentSeedRequiresMappedConcepts": True,
            },
            "kgMappingMode": "ingestion-service performs owning-service match/propose calls after extraction",
            "allowedHandoffs": {
                "intent": intent,
                "curriculum": intent in {"derive_curriculum", "both"},
                "content": intent in {"seed_cards", "both"},
            },
        }
        sections.append(
            _section(
                key="policyContext",
                title="Policy Context",
                source_service="agents-runtime",
                value=policy_context,
                authority_label="policy",
            )
        )

        return {
            "compositeTool": "get-ingestion-concept-extraction-brief",
            "generatedAt": _now_iso(),
            "summary": f"Ingestion extraction brief assembled for document {document_id} with {len(sections)} section(s).",
            "sections": sections,
            "serviceInputManifest": manifest,
            "errors": errors,
            "providerTools": [],
            "outputContract": {
                "schema": "ingestion_concept_extraction_result",
                "artifacts": [
                    "documentSummary",
                    "sectionSummaries",
                    "conceptCandidates",
                    "mappingSuggestions",
                    "handoffRecommendations",
                ],
                "persistenceBoundary": "ingestion-service",
            },
            "openQuestions": [
                "Which candidates remain weak after the full-text scan windows have been processed?",
                "Which ambiguous mappings need explicit user review before downstream handoff?",
            ],
        }

    async def _get_lesson_plan_assembly_brief(
        self, payload: dict[str, Any], user_id: str | None
    ) -> dict[str, Any]:
        errors: list[dict[str, Any]] = []
        manifest: list[dict[str, Any]] = []
        sections: list[dict[str, Any]] = []
        session_id = str(payload["sessionId"])
        curriculum_id = payload.get("curriculumId")
        study_mode = payload.get("studyMode")
        requested_goal = payload.get("goal") or payload.get("topic")
        max_steps = payload.get("maxSteps") or payload.get("targetStepCount") or 6

        sections.extend(
            [
                _section(
                    key="role",
                    title="Role",
                    source_service="agents-runtime",
                    value={
                        "agent": "lesson-plan-generator",
                        "functionalName": "LessonPlan Generator",
                        "displayLabel": "Session Architect",
                        "authorityClass": "drafting_agent",
                        "primaryTruthOwner": "session-service",
                        "primaryValidator": "pedagogy-guardian-service",
                    },
                    authority_label="policy",
                    ttl_ms=300000,
                ),
                _section(
                    key="runContext",
                    title="Run Context",
                    source_service="agents-runtime",
                    value={
                        "sessionId": session_id,
                        "curriculumId": curriculum_id,
                        "studyMode": study_mode,
                        "repairOfPlan": payload.get("repairOfPlan"),
                        "guardianBlockReasons": payload.get("guardianBlockReasons", []),
                    },
                    authority_label="recorded_fact",
                    ttl_ms=30000,
                ),
                _section(
                    key="userIntent",
                    title="User Intent",
                    source_service="agents-runtime",
                    value={
                        "goal": requested_goal,
                        "targetDurationMinutes": payload.get("targetDurationMinutes"),
                        "preferredPace": payload.get("preferredPace"),
                        "learnerConstraints": payload.get("learnerConstraints", []),
                    },
                    authority_label="user_provided_intent",
                    ttl_ms=30000,
                ),
                _section(
                    key="constraints",
                    title="Constraints",
                    source_service="agents-runtime",
                    value={
                        "activeGoalCap": 4,
                        "maxSteps": max_steps,
                        "preSessionReviewRequired": True,
                        "stepFirst": True,
                        "cardsArePayloadCandidatesOnly": True,
                        "allowedEpistemicModes": [
                            "generative_retrieval",
                            "socratic_probe",
                            "comparison",
                            "transfer",
                        ],
                        "assessmentRequired": True,
                    },
                    authority_label="policy",
                    ttl_ms=300000,
                ),
                _section(
                    key="allowedActions",
                    title="Allowed Actions",
                    source_service="agents-runtime",
                    value=[
                        "draft_lesson_plan",
                        "propose_goals",
                        "propose_step_order",
                        "select_eligible_content_candidates",
                        "propose_assessment_strategy",
                        "repair_guardian_blocked_plan",
                    ],
                    authority_label="policy",
                    ttl_ms=300000,
                ),
                _section(
                    key="forbiddenActions",
                    title="Forbidden Actions",
                    source_service="agents-runtime",
                    value=[
                        "activate_plan_directly",
                        "bypass_guardian",
                        "mutate_graph_state",
                        "own_evaluation_results",
                        "own_schedule_state",
                        "use_ineligible_content",
                    ],
                    authority_label="policy",
                    ttl_ms=300000,
                ),
                _section(
                    key="uiSurface",
                    title="UI Surface",
                    source_service="agents-runtime",
                    value={
                        "primarySurface": "Session Plan Review",
                        "artifactLabels": ["Plan draft", "Guardian accepted", "Needs review"],
                        "showFriendlyWhy": True,
                        "showTechnicalProvenanceBelowFriendlyLayer": True,
                        "timelineMilestonesOnly": True,
                    },
                    authority_label="policy",
                    ttl_ms=300000,
                ),
            ]
        )

        session = await self._manifested_tool_call(
            service="session",
            tool="get-session",
            payload={"sessionId": session_id},
            user_id=user_id,
            errors=errors,
            manifest=manifest,
        )
        if session is not None:
            sections.append(
                _section(
                    key="sessionState",
                    title="Session State",
                    source_service="session-service",
                    value=session,
                )
            )
            sections.append(
                _section(
                    key="learningContext",
                    title="Learning Context",
                    source_service="session-service",
                    value={
                        "sessionId": session.get("id", session_id),
                        "studyMode": session.get("studyMode", study_mode),
                        "learningMode": session.get("learningMode"),
                        "curriculumId": session.get("curriculumId", curriculum_id),
                        "curriculumVersionId": session.get("curriculumVersionId"),
                        "topic": session.get("topic")
                        or (
                            (session.get("config") or {}).get("topic")
                            if isinstance(session.get("config"), dict)
                            else None
                        ),
                    },
                )
            )

        if isinstance(curriculum_id, str) and curriculum_id:
            session_slice = await self._manifested_tool_call(
                service="curriculum",
                tool="get-session-slice",
                payload={"curriculumId": curriculum_id, "payload": {"maxNodes": 6, "maxNewNodes": 2}},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if session_slice is not None:
                sections.append(
                    _section(
                        key="sessionSlice",
                        title="Session Slice",
                        source_service="curriculum-service",
                        value=session_slice,
                    )
                )
            frontier = await self._manifested_tool_call(
                service="curriculum",
                tool="get-frontier",
                payload={"curriculumId": curriculum_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if frontier is not None:
                sections.append(
                    _section(
                        key="curriculumFrontier",
                        title="Curriculum Frontier",
                        source_service="curriculum-service",
                        value=frontier,
                    )
                )
            progress = await self._manifested_tool_call(
                service="curriculum",
                tool="get-progress",
                payload={"curriculumId": curriculum_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if progress is not None:
                sections.append(
                    _section(
                        key="curriculumProgress",
                        title="Curriculum Progress",
                        source_service="curriculum-service",
                        value=progress,
                    )
                )

        due = await self._manifested_tool_call(
            service="scheduler",
            tool="get-due-concepts",
            payload={**({"studyMode": study_mode} if isinstance(study_mode, str) else {})},
            user_id=user_id,
            errors=errors,
            manifest=manifest,
        )
        if due is not None:
            sections.append(
                _section(
                    key="dueConcepts",
                    title="Due Concepts",
                    source_service="scheduler-service",
                    value=due,
                )
            )

        concept_ids = _concept_ids_from_lesson_sections(sections, payload)
        lesson_labels: dict[str, str] = {}
        for concept_id in concept_ids[:8]:
            schedule_payload = {
                "conceptId": concept_id,
                **({"studyMode": study_mode} if isinstance(study_mode, str) else {}),
            }
            # Fetch node first so the label is available for all subsequent section titles.
            node = await self._manifested_tool_call(
                service="knowledge-graph",
                tool="get-concept-node",
                payload={"nodeId": concept_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if node is not None:
                node_label = _extract_node_label(node)
                if node_label:
                    lesson_labels[concept_id] = node_label
                sections.append(
                    _section(
                        key=f"conceptNode:{concept_id}",
                        title=f"Concept Node: {_label_for_concept(concept_id, lesson_labels)}",
                        source_service="knowledge-graph-service",
                        value=node,
                    )
                )
            concept_label = _label_for_concept(concept_id, lesson_labels)
            schedule = await self._manifested_tool_call(
                service="scheduler",
                tool="get-concept-schedule",
                payload=schedule_payload,
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if schedule is not None:
                sections.append(
                    _section(
                        key=f"conceptSchedule:{concept_id}",
                        title=f"Concept Schedule: {concept_label}",
                        source_service="scheduler-service",
                        value=schedule,
                    )
                )
            transformation = await self._manifested_tool_call(
                service="scheduler",
                tool="get-transformation-history",
                payload={**schedule_payload, "limit": 4},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if transformation is not None:
                sections.append(
                    _section(
                        key=f"transformationHistory:{concept_id}",
                        title=f"Transformation History: {concept_label}",
                        source_service="scheduler-service",
                        value=transformation,
                    )
                )
            reasoning = await self._manifested_tool_call(
                service="metacognition",
                tool="get-reasoning-average",
                payload=schedule_payload,
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if reasoning is not None:
                sections.append(
                    _section(
                        key=f"reasoningAverage:{concept_id}",
                        title=f"Reasoning Average: {concept_label}",
                        source_service="metacognition-service",
                        value=reasoning,
                        authority_label="detected_signal",
                    )
                )
            prereqs = await self._manifested_tool_call(
                service="knowledge-graph",
                tool="find-prerequisites",
                payload={"nodeId": concept_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if prereqs is not None:
                sections.append(
                    _section(
                        key=f"prerequisites:{concept_id}",
                        title=f"Prerequisites: {concept_label}",
                        source_service="knowledge-graph-service",
                        value=prereqs,
                    )
                )
            related = await self._manifested_tool_call(
                service="knowledge-graph",
                tool="find-related-concepts",
                payload={"nodeId": concept_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if related is not None:
                sections.append(
                    _section(
                        key=f"relatedConcepts:{concept_id}",
                        title=f"Related Concepts: {concept_label}",
                        source_service="knowledge-graph-service",
                        value=related,
                        authority_label="detected_signal",
                    )
                )

        content_seed = await self._manifested_tool_call(
            service="content",
            tool="build-session-seed",
            payload={
                "sessionId": session_id,
                "curriculumId": curriculum_id,
                "conceptIds": concept_ids,
                **({"studyMode": study_mode} if isinstance(study_mode, str) else {}),
            },
            user_id=user_id,
            errors=errors,
            manifest=manifest,
        )
        if content_seed is not None:
            sections.append(
                _section(
                    key="contentSessionSeed",
                    title="Content Session Seed",
                    source_service="content-service",
                    value=content_seed,
                )
            )
        content_candidates = await self._manifested_tool_call(
            service="content",
            tool="query-cards",
            payload={
                "conceptIds": concept_ids,
                "reviewState": "active",
                "limit": 12,
            },
            user_id=user_id,
            errors=errors,
            manifest=manifest,
        )
        if content_candidates is not None:
            sections.append(
                _section(
                    key="eligibleContentCandidates",
                    title="Eligible Content Candidates",
                    source_service="content-service",
                    value=content_candidates,
                )
            )
        for concept_id in concept_ids[:8]:
            coverage = await self._manifested_tool_call(
                service="content",
                tool="get-coverage",
                payload={"conceptId": concept_id},
                user_id=user_id,
                errors=errors,
                manifest=manifest,
            )
            if coverage is not None:
                sections.append(
                    _section(
                        key=f"contentCoverage:{concept_id}",
                        title=f"Content Coverage: {_label_for_concept(concept_id, lesson_labels)}",
                        source_service="content-service",
                        value=coverage,
                    )
                )

        sections.append(
            _section(
                key="serviceFacts",
                title="Service Facts Summary",
                source_service="agents-runtime",
                value={
                    "services": sorted(
                        {
                            section.get("sourceService")
                            for section in sections
                            if isinstance(section.get("sourceService"), str)
                            and section.get("sourceService") != "agents-runtime"
                        }
                    ),
                    "sectionCount": len(sections),
                },
                authority_label="recorded_fact",
            )
        )
        sections.append(
            _section(
                key="detectedSignals",
                title="Detected Signals",
                source_service="agents-runtime",
                value={
                    "repairLikely": any(
                        isinstance(section.get("value"), dict)
                        and section.get("value", {}).get("queue") == "repair"
                        for section in sections
                    ),
                    "prefetchErrorCount": len(errors),
                    "conceptIds": concept_ids,
                },
                authority_label="detected_signal",
            )
        )
        sections.append(
            _section(
                key="artifactContext",
                title="Artifact Context",
                source_service="agents-runtime",
                value={
                    "selectedNodeIds": payload.get("selectedNodeIds", []),
                    "selectedCardIds": payload.get("selectedCardIds", []),
                    "contentCandidatesSection": "eligibleContentCandidates",
                },
                authority_label="recorded_fact",
            )
        )
        sections.append(
            _section(
                key="outputContract",
                title="Output Contract",
                source_service="agents-runtime",
                value={
                    "schema": "lesson_plan_result",
                    "normalizesTo": "session-service.CreateLessonPlanInput",
                    "requires": [
                        "goals",
                        "steps",
                        "assessmentStrategy",
                        "adaptationRules",
                        "learnerFacingSummary",
                        "technicalProvenance",
                    ],
                },
                authority_label="policy",
                ttl_ms=300000,
            )
        )
        sections.append(
            _section(
                key="provenance",
                title="Provenance",
                source_service="agents-runtime",
                value={
                    "serviceInputManifest": manifest,
                    "promptContextPack": "AgentContextPack",
                    "timelineMilestones": ["plan_generated", "guardian_accepted", "needs_review"],
                },
                authority_label="recorded_fact",
            )
        )

        provider_tools = await self._lesson_provider_tools(user_id=user_id, errors=errors)

        return {
            "compositeTool": "get-lesson-plan-assembly-brief",
            "generatedAt": _now_iso(),
            "summary": (
                f"Lesson-plan AgentContextPack assembled for session {session_id} "
                f"with {len(sections)} section(s), {len(concept_ids)} concept(s), "
                f"and {len(errors)} prefetch error(s)."
            ),
            "sections": sections,
            "serviceInputManifest": manifest,
            "errors": errors,
            "providerTools": provider_tools,
            "outputContract": {
                "schema": "lesson_plan_result",
                "normalizesTo": "session-service.CreateLessonPlanInput",
                "reviewPath": ["pedagogy-guardian", "session-plan-review"],
            },
            "openQuestions": [
                "Which selected concepts require repair before forward progress?"
                if concept_ids
                else "No concept ids were discoverable from prefetched context.",
            ],
        }

    async def _lesson_provider_tools(
        self, *, user_id: str | None, errors: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        allowed = {
            "session-service": {"get-session", "create-lesson-plan"},
            "curriculum-service": {"get-session-slice", "get-frontier", "get-progress"},
            "scheduler-service": {
                "get-due-concepts",
                "get-concept-schedule",
                "get-transformation-history",
            },
            "metacognition-service": {"get-reasoning-average"},
            "content-service": {"build-session-seed", "query-cards", "get-coverage"},
            "knowledge-graph-service": {
                "get-concept-node",
                "find-prerequisites",
                "find-related-concepts",
            },
            "pedagogy-guardian-service": {"validate-lesson-plan"},
        }
        provider_tools: list[dict[str, Any]] = []
        for service in [
            "session",
            "curriculum",
            "scheduler",
            "metacognition",
            "content",
            "knowledge-graph",
            "pedagogy-guardian",
        ]:
            definitions = await self._safe_tool_list(service=service, user_id=user_id, errors=errors)
            for definition in definitions:
                service_name = str(definition.get("service") or f"{service}-service")
                name = definition.get("name")
                if not isinstance(name, str) or name not in allowed.get(service_name, set()):
                    continue
                provider_tools.append({
                    "name": _provider_tool_name(service_name, name),
                    "service": service_name,
                    "tool": name,
                    "description": str(definition.get("description", "")),
                    "inputSchema": definition.get("inputSchema")
                    if isinstance(definition.get("inputSchema"), dict)
                    else {},
                    "sideEffects": bool(
                        definition.get("capabilities", {}).get("sideEffects")
                    )
                    if isinstance(definition.get("capabilities"), dict)
                    else False,
                })
        return provider_tools

    async def _get_graph_proposal_context(
        self, payload: dict[str, Any], user_id: str | None
    ) -> dict[str, Any]:
        errors: list[dict[str, Any]] = []
        sections: list[dict[str, Any]] = []
        concept_ids = [v for v in payload.get("conceptIds", []) if isinstance(v, str)]
        study_mode = payload.get("studyMode")
        proposal_type = payload.get("proposalType", "anchor")
        domain = payload.get("domain")
        graph_scope = {"domain": domain} if isinstance(domain, str) and domain else {}

        # Include conceptIds so the health report is scoped to the requested concepts
        # rather than returning a domain-wide aggregate with no concept context.
        health = await self._safe_tool_call(
            service="knowledge-graph",
            tool="get-structural-health",
            payload={
                **graph_scope,
                "conceptIds": concept_ids,
                **({"studyMode": study_mode} if isinstance(study_mode, str) else {}),
            },
            user_id=user_id,
            errors=errors,
        )
        if health is not None:
            sections.append(
                _section(
                    key="graphStructuralHealth",
                    title="Graph Structural Health",
                    source_service="knowledge-graph-service",
                    value=health,
                    authority_label="recorded_fact",
                )
            )

        graph_labels: dict[str, str] = {}
        selected_node_ids = [v for v in payload.get("selectedNodeIds", []) if isinstance(v, str)]
        for index, concept_id in enumerate(concept_ids):
            selected_node_id = (
                selected_node_ids[index]
                if index < len(selected_node_ids) and _is_graph_node_id(selected_node_ids[index])
                else None
            )
            resolution = await self._safe_tool_call(
                service="knowledge-graph",
                tool="resolve-concept-reference",
                payload={
                    "ref": concept_id,
                    **graph_scope,
                    **({"studyMode": study_mode} if isinstance(study_mode, str) else {}),
                    "graphType": "both",
                    "limit": 8,
                },
                user_id=user_id,
                errors=errors,
            )
            resolved_node_id = selected_node_id
            if resolution is not None:
                sections.append(
                    _section(
                        key=f"conceptResolution:{concept_id}",
                        title=f"Concept Resolution: {_label_for_concept(concept_id, graph_labels)}",
                        source_service="knowledge-graph-service",
                        value=resolution,
                        authority_label="recorded_fact",
                    )
                )
                resolution_items = []
                if isinstance(resolution, dict):
                    match = resolution.get("match")
                    if isinstance(match, dict):
                        resolution_items = [match]
                    if not resolution_items:
                        for container_key in ("matches", "candidates", "items", "nodes"):
                            container = resolution.get(container_key)
                            if isinstance(container, list):
                                resolution_items = [item for item in container if isinstance(item, dict)]
                                break
                    if not resolution_items and any(key in resolution for key in ("nodeId", "id")):
                        resolution_items = [resolution]
                if resolution_items:
                    first = resolution_items[0]
                    candidate_id = first.get("nodeId") or first.get("id")
                    candidate_label = _extract_node_label(first)
                    if isinstance(candidate_id, str) and candidate_id:
                        resolved_node_id = candidate_id
                    if candidate_label:
                        graph_labels[concept_id] = candidate_label
            if isinstance(resolved_node_id, str) and resolved_node_id:
                node = await self._safe_tool_call(
                    service="knowledge-graph",
                    tool="get-concept-node",
                    payload={"nodeId": resolved_node_id},
                    user_id=user_id,
                    errors=errors,
                )
                if node is not None:
                    node_label = _extract_node_label(node)
                    if node_label:
                        graph_labels[concept_id] = node_label
                    sections.append(
                        _section(
                            key=f"conceptNode:{concept_id}",
                            title=f"Concept Node: {_label_for_concept(concept_id, graph_labels)}",
                            source_service="knowledge-graph-service",
                            value=node,
                            authority_label="recorded_fact",
                        )
                    )
            concept_label = _label_for_concept(concept_id, graph_labels)

            if isinstance(resolved_node_id, str) and resolved_node_id:
                prereqs = await self._safe_tool_call(
                    service="knowledge-graph",
                    tool="find-prerequisites",
                    payload={"nodeId": resolved_node_id, **graph_scope},
                    user_id=user_id,
                    errors=errors,
                )
                if prereqs is not None:
                    sections.append(
                        _section(
                            key=f"prerequisites:{concept_id}",
                            title=f"Prerequisites: {concept_label}",
                            source_service="knowledge-graph-service",
                            value=prereqs,
                            authority_label="recorded_fact",
                        )
                    )

                related = await self._safe_tool_call(
                    service="knowledge-graph",
                    tool="find-related-concepts",
                    payload={"nodeId": resolved_node_id},
                    user_id=user_id,
                    errors=errors,
                )
                if related is not None:
                    sections.append(
                        _section(
                            key=f"relatedConcepts:{concept_id}",
                            title=f"Related Concepts: {concept_label}",
                            source_service="knowledge-graph-service",
                            value=related,
                            authority_label="detected_signal",
                        )
                    )

                contrasts = await self._safe_tool_call(
                    service="knowledge-graph",
                    tool="find-contrasts",
                    payload={"nodeId": resolved_node_id, **graph_scope},
                    user_id=user_id,
                    errors=errors,
                )
                if contrasts is not None:
                    sections.append(
                        _section(
                            key=f"contrasts:{concept_id}",
                            title=f"Contrasts: {concept_label}",
                            source_service="knowledge-graph-service",
                            value=contrasts,
                            authority_label="detected_signal",
                        )
                    )

                confusables = await self._safe_tool_call(
                    service="knowledge-graph",
                    tool="find-confusables",
                    payload={"nodeId": resolved_node_id, **graph_scope},
                    user_id=user_id,
                    errors=errors,
                )
                if confusables is not None:
                    sections.append(
                        _section(
                            key=f"confusables:{concept_id}",
                            title=f"Confusables: {concept_label}",
                            source_service="knowledge-graph-service",
                            value=confusables,
                            authority_label="detected_signal",
                        )
                    )

                misconception_links = await self._safe_tool_call(
                    service="knowledge-graph",
                    tool="find-misconception-links",
                    payload={"nodeId": resolved_node_id, **graph_scope},
                    user_id=user_id,
                    errors=errors,
                )
                if misconception_links is not None:
                    sections.append(
                        _section(
                            key=f"misconceptionLinks:{concept_id}",
                            title=f"Misconception Links: {concept_label}",
                            source_service="knowledge-graph-service",
                            value=misconception_links,
                            authority_label="detected_signal",
                        )
                    )

            if study_mode is not None:
                average = await self._safe_tool_call(
                    service="metacognition",
                    tool="get-reasoning-average",
                    payload={"conceptId": concept_id, "studyMode": study_mode},
                    user_id=user_id,
                    errors=errors,
                )
                if average is not None:
                    sections.append(
                        _section(
                            key=f"reasoningAverage:{concept_id}",
                            title=f"Reasoning Average: {concept_label}",
                            source_service="metacognition-service",
                            value=average,
                            authority_label="detected_signal",
                        )
                    )

        misconceptions = await self._safe_tool_call(
            service="knowledge-graph",
            tool="detect-misconceptions",
            payload={
                **graph_scope,
                **({"studyMode": study_mode} if isinstance(study_mode, str) else {}),
                "conceptIds": concept_ids,
                **({"proposalType": proposal_type} if proposal_type else {}),
            },
            user_id=user_id,
            errors=errors,
        )
        if misconceptions is not None:
            sections.append(
                _section(
                    key="misconceptionSignals",
                    title="Misconception Signals",
                    source_service="knowledge-graph-service",
                    value=misconceptions,
                    authority_label="detected_signal",
                )
            )

        return {
            "compositeTool": "get-graph-proposal-context",
            "generatedAt": _now_iso(),
            "summary": (
                f"Graph proposal context assembled for {len(concept_ids)} concept(s) "
                f"({len(sections)} sections, {len(errors)} error(s))."
            ),
            "sections": sections,
            "errors": errors,
            "openQuestions": [
                "Which proposals have enough structural evidence to surface for human review?",
                "Are there prerequisite gaps that block the proposed anchors?",
            ],
        }

    async def _get_curriculum_draft_context(
        self, payload: dict[str, Any], user_id: str | None
    ) -> dict[str, Any]:
        errors: list[dict[str, Any]] = []
        sections: list[dict[str, Any]] = []
        concept_ids = [v for v in payload.get("conceptIds", []) if isinstance(v, str)]
        concept_anchors = [
            value
            for value in payload.get("conceptAnchors", [])
            if isinstance(value, dict)
        ]
        curriculum_id = payload.get("curriculumId")
        study_mode = payload.get("studyMode")
        domain = payload.get("domain")
        graph_scope = {"domain": domain} if isinstance(domain, str) and domain else {}
        branch_candidates: list[dict[str, Any]] = []
        blocked_prerequisites: list[dict[str, Any]] = []
        focus_area_options: list[dict[str, Any]] = []
        coverage_gaps_by_branch: list[dict[str, Any]] = []
        concept_labels = {
            str(item.get("conceptId")): str(item.get("label"))
            for item in concept_anchors
            if isinstance(item.get("conceptId"), str) and isinstance(item.get("label"), str)
        }

        if concept_anchors:
            sections.append(
                _section(
                    key="requestedConceptAnchors",
                    title="Requested Concept Anchors",
                    source_service="web-app",
                    value={"items": concept_anchors},
                    authority_label="user_selected",
                )
            )

        due = await self._safe_tool_call(
            service="scheduler",
            tool="get-due-concepts",
            payload={**({"studyMode": study_mode} if isinstance(study_mode, str) else {})},
            user_id=user_id,
            errors=errors,
        )
        if due is not None:
            sections.append(
                _section(
                    key="dueConcepts",
                    title="Due Concepts",
                    source_service="scheduler-service",
                    value=due,
                    authority_label="recorded_fact",
                )
            )

        for concept_id in concept_ids:
            concept_node = await self._safe_tool_call(
                service="knowledge-graph",
                tool="get-concept-node",
                payload={"nodeId": concept_id},
                user_id=user_id,
                errors=errors,
            )
            if concept_node is not None:
                extracted_label = _extract_node_label(
                    concept_node.get("node", concept_node) if isinstance(concept_node, dict) else {}
                )
                if extracted_label:
                    concept_labels[concept_id] = extracted_label
                sections.append(
                    _section(
                        key=f"conceptLabel:{concept_id}",
                        title=f"Concept Anchor: {_label_for_concept(concept_id, concept_labels)}",
                        source_service="knowledge-graph-service",
                        value={
                            "conceptId": concept_id,
                            "label": _label_for_concept(concept_id, concept_labels),
                            "node": concept_node,
                        },
                        authority_label="recorded_fact",
                    )
                )
            concept_label = _label_for_concept(concept_id, concept_labels)
            schedule = await self._safe_tool_call(
                service="scheduler",
                tool="get-concept-schedule",
                payload={"conceptId": concept_id, **({"studyMode": study_mode} if isinstance(study_mode, str) else {})},
                user_id=user_id,
                errors=errors,
            )
            if schedule is not None:
                sections.append(
                    _section(
                        key=f"conceptSchedule:{concept_id}",
                        title=f"Concept Schedule: {concept_label}",
                        source_service="scheduler-service",
                        value=schedule,
                        authority_label="recorded_fact",
                    )
                )

            prereqs = await self._safe_tool_call(
                service="knowledge-graph",
                tool="find-prerequisites",
                payload={"nodeId": concept_id, **graph_scope},
                user_id=user_id,
                errors=errors,
            )
            if prereqs is not None:
                prereq_items = _relation_items(prereqs)
                if prereq_items:
                    blocked_prerequisites.extend(
                        {
                            "conceptId": concept_id,
                            "label": _extract_node_label(item) or _node_id_from(item, concept_id) or concept_id,
                            "branchIntent": "prerequisite_repair",
                        }
                        for item in prereq_items[:3]
                    )
                sections.append(
                    _section(
                        key=f"prerequisites:{concept_id}",
                        title=f"Prerequisites: {concept_label}",
                        source_service="knowledge-graph-service",
                        value=prereqs,
                        authority_label="recorded_fact",
                    )
                )

            related = await self._safe_tool_call(
                service="knowledge-graph",
                tool="find-related-concepts",
                payload={"conceptId": concept_id, **graph_scope},
                user_id=user_id,
                errors=errors,
            )
            if related is not None:
                related_items = _relation_items(related)
                focus_area_options.extend(
                    {
                        "sourceConceptId": concept_id,
                        "label": _extract_node_label(item) or _node_id_from(item, concept_id) or concept_label,
                        "focusTag": (
                            str(item.get("relationship"))
                            if isinstance(item.get("relationship"), str)
                            else "related_focus"
                        ),
                    }
                    for item in related_items[:3]
                )
                branch_candidates.extend(
                    {
                        "sourceConceptId": concept_id,
                        "branchGroupKey": f"branch_{concept_id}_{index + 1}",
                        "candidateConceptId": _node_id_from(item, concept_id) or concept_id,
                        "label": _extract_node_label(item) or concept_label,
                    }
                    for index, item in enumerate(related_items[:3])
                )
                sections.append(
                    _section(
                        key=f"relatedConcepts:{concept_id}",
                        title=f"Related Concepts: {concept_label}",
                        source_service="knowledge-graph-service",
                        value=related,
                        authority_label="recorded_fact",
                    )
                )

            average = await self._safe_tool_call(
                service="metacognition",
                tool="get-reasoning-average",
                payload={"conceptId": concept_id, **({"studyMode": study_mode} if isinstance(study_mode, str) else {})},
                user_id=user_id,
                errors=errors,
            )
            if average is not None:
                sections.append(
                    _section(
                        key=f"reasoningAverage:{concept_id}",
                        title=f"Reasoning Average: {concept_label}",
                        source_service="metacognition-service",
                        value=average,
                        authority_label="detected_signal",
                    )
                )

            coverage = await self._safe_tool_call(
                service="content",
                tool="get-coverage",
                payload={"conceptId": concept_id},
                user_id=user_id,
                errors=errors,
            )
            if coverage is not None:
                coverage_gaps_by_branch.append(
                    {
                        "conceptId": concept_id,
                        "activeCardCount": coverage.get("activeCardCount", 0),
                        "distinctActiveCardTypes": coverage.get("distinctActiveCardTypes", 0),
                    }
                )
                sections.append(
                    _section(
                        key=f"contentCoverage:{concept_id}",
                        title=f"Content Coverage: {concept_label}",
                        source_service="content-service",
                        value=coverage,
                        authority_label="recorded_fact",
                    )
                )

        if isinstance(curriculum_id, str) and curriculum_id:
            curriculum = await self._safe_tool_call(
                service="curriculum",
                tool="get-curriculum-by-id",
                payload={"curriculumId": curriculum_id},
                user_id=user_id,
                errors=errors,
            )
            if curriculum is not None:
                sections.append(
                    _section(
                        key="curriculum",
                        title="Curriculum",
                        source_service="curriculum-service",
                        value=curriculum,
                        authority_label="recorded_fact",
                    )
                )

            active_version = await self._safe_tool_call(
                service="curriculum",
                tool="get-active-version",
                payload={"curriculumId": curriculum_id},
                user_id=user_id,
                errors=errors,
            )
            if active_version is not None:
                sections.append(
                    _section(
                        key="activeVersion",
                        title="Active Curriculum Version",
                        source_service="curriculum-service",
                        value=active_version,
                        authority_label="recorded_fact",
                    )
                )

            progress = await self._safe_tool_call(
                service="curriculum",
                tool="get-progress",
                payload={"curriculumId": curriculum_id},
                user_id=user_id,
                errors=errors,
            )
            if progress is not None:
                sections.append(
                    _section(
                        key="curriculumProgress",
                        title="Curriculum Progress",
                        source_service="curriculum-service",
                        value=progress,
                        authority_label="recorded_fact",
                    )
                )

            frontier = await self._safe_tool_call(
                service="curriculum",
                tool="get-frontier",
                payload={"curriculumId": curriculum_id},
                user_id=user_id,
                errors=errors,
            )
            if frontier is not None:
                sections.append(
                    _section(
                        key="curriculumFrontier",
                        title="Curriculum Frontier",
                        source_service="curriculum-service",
                        value=frontier,
                        authority_label="recorded_fact",
                    )
                )

            proposals = await self._safe_tool_call(
                service="curriculum",
                tool="list-revision-proposals",
                payload={"curriculumId": curriculum_id},
                user_id=user_id,
                errors=errors,
            )
            if proposals is not None:
                sections.append(
                    _section(
                        key="revisionProposals",
                        title="Revision Proposals",
                        source_service="curriculum-service",
                        value=proposals,
                        authority_label="recorded_fact",
                    )
                )

            evidence = await self._safe_tool_call(
                service="curriculum",
                tool="get-realignment-evidence",
                payload={"curriculumId": curriculum_id},
                user_id=user_id,
                errors=errors,
            )
            if evidence is not None:
                sections.append(
                    _section(
                        key="realignmentEvidence",
                        title="Realignment Evidence",
                        source_service="curriculum-service",
                        value=evidence,
                        authority_label="detected_signal",
                    )
                )

        explicit_evidence = payload.get("evidence")
        if isinstance(explicit_evidence, dict) and explicit_evidence:
            sections.append(
                _section(
                    key="triggeringEvidence",
                    title="Triggering Evidence",
                    source_service="curriculum-service",
                    value=explicit_evidence,
                    authority_label="detected_signal",
                )
            )

        branch_states = []
        for section in sections:
            if section.get("key") == "curriculum":
                value = section.get("value")
                if isinstance(value, dict):
                    metadata = value.get("metadata")
                    if isinstance(metadata, dict):
                        maybe_states = metadata.get("branchStates")
                        if isinstance(maybe_states, list):
                            branch_states = [item for item in maybe_states if isinstance(item, dict)]
                break

        if branch_candidates:
            sections.append(
                _section(
                    key="branchCandidates",
                    title="Branch Candidates",
                    source_service="agents-runtime",
                    value={"items": branch_candidates},
                    authority_label="deterministic_projection",
                )
            )
        if blocked_prerequisites:
            sections.append(
                _section(
                    key="blockedPrerequisites",
                    title="Blocked Prerequisites",
                    source_service="agents-runtime",
                    value={"items": blocked_prerequisites},
                    authority_label="deterministic_projection",
                )
            )
        if focus_area_options:
            sections.append(
                _section(
                    key="focusAreaOptions",
                    title="Focus Area Options",
                    source_service="agents-runtime",
                    value={"items": focus_area_options},
                    authority_label="deterministic_projection",
                )
            )
        if coverage_gaps_by_branch:
            sections.append(
                _section(
                    key="coverageGapsByBranch",
                    title="Coverage Gaps By Branch",
                    source_service="agents-runtime",
                    value={"items": coverage_gaps_by_branch},
                    authority_label="deterministic_projection",
                )
            )
        if branch_states:
            sections.append(
                _section(
                    key="branchStateSummary",
                    title="Branch State Summary",
                    source_service="curriculum-service",
                    value={"items": branch_states},
                    authority_label="recorded_fact",
                )
            )

        return {
            "compositeTool": "get-curriculum-draft-context",
            "generatedAt": _now_iso(),
            "summary": (
                f"Curriculum draft context assembled for {len(concept_ids)} concept(s) "
                f"({len(sections)} sections, {len(errors)} error(s))."
            ),
            "sections": sections,
            "errors": errors,
            "openQuestions": [
                "Which unlocked focus branch best matches the learner's current goals and knowledge state?",
                "Where should the curriculum offer a diversion or remediation path before rejoining the main progression?",
            ],
        }


def _with_composite_readiness_report(
    context: dict[str, Any],
    *,
    target_agent: str,
    composite_tool: str,
) -> dict[str, Any]:
    sections = context.get("sections") if isinstance(context.get("sections"), list) else []
    errors = context.get("errors") if isinstance(context.get("errors"), list) else []
    manifest = context.get("serviceInputManifest") if isinstance(context.get("serviceInputManifest"), list) else []
    missing_fields = _composite_missing_fields(sections)
    policy_hidden_fields = _composite_policy_hidden_fields(sections)
    readiness_state = "ready"
    if policy_hidden_fields:
        readiness_state = "hidden_by_policy"
    elif errors or missing_fields:
        readiness_state = "deferred_missing_deterministic_context"
    elif _composite_empty_history(sections):
        readiness_state = "ready_with_empty_history"

    report = {
        "targetAgent": target_agent,
        "operation": "context_prefetch",
        "readinessState": readiness_state,
        "blockingReasons": [
            str(error.get("message") or error.get("kind") or "context fetch error")
            for error in errors
            if isinstance(error, dict)
        ]
        + [str(field["reason"]) for field in missing_fields]
        + [f"{field['fieldName']}: {field['reason']}" for field in policy_hidden_fields],
        "missingFields": missing_fields,
        "policyHiddenFields": policy_hidden_fields,
        "prefetchedFields": [
            {
                "fieldName": section.get("key"),
                "sourceService": section.get("sourceService"),
                "authorityLabel": section.get("authorityLabel"),
            }
            for section in sections
            if isinstance(section, dict)
        ],
        "callableToolFields": [],
        "prerequisiteAgentFields": [
            {
                "fieldName": "patchPlannerHandoffContext",
                "sourceAgent": "patch-planner-remediation-agent",
                "status": "not_requested_by_composite_context",
            },
            {
                "fieldName": "strategyHandoffContext",
                "sourceAgent": "strategy-replanning-agent",
                "status": "not_requested_by_composite_context",
            },
        ],
        "inferredFallbackFields": [],
        "serviceInputManifest": manifest,
        "humanReadableReasoningSections": [
            str(section.get("key"))
            for section in sections
            if isinstance(section, dict) and isinstance(section.get("key"), str)
        ],
        "serviceContractSections": ["agentInputReadinessReport", "serviceInputManifest"],
    }
    if isinstance(sections, list):
        sections.append(
            _section(
                key="agentInputReadinessReport",
                title="Agent Input Readiness Report",
                source_service="agents-runtime",
                value=report,
                authority_label="validation_result",
            )
        )
    return {
        **context,
        "compositeTool": composite_tool,
        "sections": sections,
        "agentInputReadinessReport": report,
        "summary": f"{context.get('summary', 'Learner-facing context assembled.')} Readiness: {readiness_state}.",
    }


def _composite_missing_fields(sections: list[Any]) -> list[dict[str, Any]]:
    missing: list[dict[str, Any]] = []
    keys = {
        section.get("key")
        for section in sections
        if isinstance(section, dict) and isinstance(section.get("key"), str)
    }
    for key, reason in (
        ("stepEvidenceRecord", "Step evidence record must be prefetched before learner-facing reflection."),
        ("rubricSummary", "Rubric summary must be prefetched before learner-facing reflection."),
        ("traceEvidencePack", "Trace evidence pack must be prefetched before learner-facing reflection."),
    ):
        if key not in keys:
            missing.append({"fieldName": key, "reason": reason, "sourceClass": "prefetched_deterministic_context"})
    evidence = _composite_section_value(sections, "stepEvidenceRecord")
    if evidence and not str(evidence.get("stepObjectiveText", "")).strip():
        missing.append(
            {
                "fieldName": "stepEvidenceRecord.stepObjectiveText",
                "reason": "Step objective text is empty.",
                "sourceClass": "prefetched_deterministic_context",
            }
        )
    trace = _composite_section_value(sections, "traceEvidencePack")
    frames = trace.get("frameEvidence") if isinstance(trace.get("frameEvidence"), list) else []
    if trace and not frames:
        missing.append(
            {
                "fieldName": "traceEvidencePack.frameEvidence",
                "reason": "Trace evidence pack has no frame evidence.",
                "sourceClass": "prefetched_deterministic_context",
            }
        )
    return missing


def _composite_policy_hidden_fields(sections: list[Any]) -> list[dict[str, Any]]:
    policy = _composite_section_value(sections, "watchtowerPolicyContext")
    if policy.get("surfaceVisibility") == "hidden":
        return [
            {
                "fieldName": "traceEvidencePack",
                "reason": policy.get("learnerFacingPolicyText", "Policy hides this surface."),
                "source": "watchtowerPolicyContext",
            }
        ]
    return []


def _composite_section_value(sections: list[Any], key: str) -> dict[str, Any]:
    for section in sections:
        if isinstance(section, dict) and section.get("key") == key and isinstance(section.get("value"), dict):
            return cast("dict[str, Any]", section["value"])
    return {}


def _composite_empty_history(sections: list[Any]) -> bool:
    return any(
        isinstance(section, dict)
        and any(
            marker in str(section.get("value", "")).lower()
            for marker in (
                "no prior similar step evidence",
                "no recent calibration trend recorded",
                "no corrections or dismissals recorded",
                "no prior calibration drills recorded",
            )
        )
        for section in sections
    )
