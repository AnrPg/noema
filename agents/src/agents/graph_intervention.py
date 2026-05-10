"""Strict graph-intervention readiness orchestration.

The orchestrator owns the deterministic bridge between call-time intent,
prefetched graph context, and the prompt shape used by graph-reasoning agents.
Graph agents receive human-readable pedagogical context only; concrete IDs stay
in the service contract for downstream tool calls.
"""

from __future__ import annotations

import hashlib
import re
import uuid
from datetime import UTC, datetime
from typing import Any


POP_CALL_TIME = "call_time"
POP_PREFETCH = "deterministic_prefetch"
POP_STATIC = "static_policy"
POP_LLM = "llm_generated_by_agent"
POP_UNAVAILABLE = "unavailable"

_ALLOWED_GRAPH_NODE_TYPES = [
    "notion",
    "skill",
    "occupation",
    "fact",
    "procedure",
    "principle",
    "example",
    "counterexample",
    "misconception",
]

_ALLOWED_GRAPH_EDGE_TYPES = [
    "is_a",
    "exemplifies",
    "part_of",
    "constituted_by",
    "equivalent_to",
    "entails",
    "disjoint_with",
    "contradicts",
    "causes",
    "precedes",
    "depends_on",
    "related_to",
    "analogous_to",
    "contrasts_with",
    "confusable_with",
    "translation_equivalent",
    "false_friend_of",
    "minimal_pair_with",
    "collocates_with",
    "prerequisite",
    "derived_from",
    "has_property",
    "governs",
    "inflected_form_of",
    "subskill_of",
    "has_subskill",
    "essential_for_occupation",
    "occupation_requires_essential_skill",
    "optional_for_occupation",
    "occupation_benefits_from_optional_skill",
    "transferable_to",
]

_DOMAIN_ASSIGNMENT_RULE = (
    "Do not default to 'general' when domain evidence exists. Reuse the most specific "
    "supported domain from the target concepts, neighboring graph, source evidence, or "
    "well-established disciplinary context. Multiple domains across touched nodes are allowed."
)

_DOMAIN_DISCOVERY_RULE = (
    "Actively infer plausible domain candidates for each touched node instead of passively "
    "copying the request domain. Prefer an existing graph domain when it truly matches the "
    "concept, but you are not forced to choose only from the existing-domain list. Use "
    "'general' only as the fallback when no better domain is justified."
)

_PROPOSAL_COVERAGE_RULE = (
    "Graph proposals should add connected structure, not isolated nodes. When proposing or "
    "expanding a concept, include the justified prerequisite, taxonomic, part-whole, "
    "causal, contrastive, or associative edges that explain how it fits into the graph."
)

_EDGE_TYPE_GUIDANCE = (
    "Choose the most specific edge type available: use is_a for subtype/class membership; "
    "part_of or constituted_by for composition; prerequisite, precedes, depends_on, "
    "derived_from, subskill_of, or has_subskill for learning/dependency structure; "
    "causes for causation; equivalent_to, entails, disjoint_with, or contradicts for "
    "logical relations; contrasts_with, confusable_with, analogous_to, related_to, "
    "translation_equivalent, false_friend_of, minimal_pair_with, or collocates_with for "
    "comparison/language links; exemplifies for example-to-concept links; has_property or "
    "governs for attribute/control links; and the occupation-specific edge types only when "
    "connecting skills with occupations. Use related_to only as a last-resort fallback."
)

_NODE_TYPE_GUIDANCE = (
    "Use notion for general concepts; skill for competencies; occupation for roles; fact "
    "for atomic truths; procedure for stepwise methods; principle for governing rules; "
    "example or counterexample for illustrative instances; and misconception for false or "
    "repair-target beliefs."
)

_STATIC_GRAPH_FIXTURES: dict[str, dict[str, Any]] = {
    "concept_1": {
        "conceptId": "concept_123456789012345678901",
        "pkgNodeId": "node_123456789012345678901",
        "ckgNodeId": "node_ckg123456789012345678",
        "label": "Concept One",
        "domain": "statistics",
        "aliases": ["First concept"],
        "learnerFacingSummary": "Concept One is a test graph concept used by the golden content-creation fixture.",
    },
    "Bayes theorem": {
        "conceptId": "concept_bayestheoremdemo00123",
        "pkgNodeId": "node_bayestheoremdemo00001",
        "ckgNodeId": "node_ckgbayestheoremdemo01",
        "label": "Bayes theorem",
        "domain": "statistics",
        "aliases": ["Bayes rule"],
        "learnerFacingSummary": "Bayes theorem updates a probability estimate when new evidence is observed.",
    },
}


def normalize_graph_operation_name(value: Any) -> str:
    operation_type = str(value or "content_readiness")
    if operation_type == "prerequisite":
        operation_type = "add_prerequisite"
    if operation_type in {"confusable", "confusable_with"}:
        operation_type = "confusable_relation"
    if operation_type in {"contrast", "contrasts_with"}:
        operation_type = "contrast_relation"
    if operation_type in {"misconception", "misconception_link"}:
        operation_type = "misconception_relation"
    if operation_type not in GraphIntentNormalizer._KNOWN_OPS:
        operation_type = "content_readiness"
    return operation_type

def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _stable_id(prefix: str, value: str) -> str:
    return f"{prefix}_{hashlib.sha1(value.encode('utf-8')).hexdigest()[:21]}"


def _readable_label(value: str) -> str:
    cleaned = re.sub(r"^(concept|node|kg)[_:-]+", "", value.strip(), flags=re.IGNORECASE)
    if re.search(r"[A-Z]", cleaned) and "_" not in cleaned and "-" not in cleaned:
        return value
    return re.sub(r"[_-]+", " ", cleaned).strip().title() or value


def _node_id_or_none(value: Any) -> str | None:
    return value if isinstance(value, str) and value.startswith("node_") else None


def _section_value(context_pack: dict[str, Any], key: str) -> Any:
    for section in context_pack.get("sections", []):
        if isinstance(section, dict) and section.get("key") == key:
            return section.get("value")
    return None


def _sections_with_prefix(context_pack: dict[str, Any], prefix: str) -> list[tuple[str, Any]]:
    result: list[tuple[str, Any]] = []
    for section in context_pack.get("sections", []):
        if not isinstance(section, dict):
            continue
        key = section.get("key")
        if isinstance(key, str) and key.startswith(prefix):
            result.append((key, section.get("value")))
    return result


def _string(value: Any, *keys: str) -> str | None:
    if not isinstance(value, dict):
        return None
    for key in keys:
        candidate = value.get(key)
        if isinstance(candidate, str) and candidate:
            return candidate
    data = value.get("data")
    if isinstance(data, dict):
        for key in keys:
            candidate = data.get(key)
            if isinstance(candidate, str) and candidate:
                return candidate
    return None


def _items(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        match = value.get("match")
        if isinstance(match, dict):
            return [match]
        for key in (
            "items",
            "nodes",
            "concepts",
            "matches",
            "candidates",
            "prerequisites",
            "related",
            "contrasts",
            "confusables",
            "misconceptions",
            "links",
            "edges",
        ):
            nested = value.get(key)
            if isinstance(nested, list):
                return [item for item in nested if isinstance(item, dict)]
        if any(key in value for key in ("id", "nodeId", "conceptId", "label", "name")):
            return [value]
    return []


def _dedupe(items: list[dict[str, Any]], key: str = "label") -> list[dict[str, Any]]:
    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    for item in items:
        marker = str(item.get(key) or item.get("nodeId") or item.get("conceptId") or item)
        if marker in seen:
            continue
        seen.add(marker)
        result.append(item)
    return result


def _population(
    field: str,
    mode: str,
    *,
    source: str,
    status: str = "populated",
    notes: str | None = None,
) -> dict[str, Any]:
    return {
        "field": field,
        "mode": mode,
        "source": source,
        "status": status,
        "notes": notes,
    }


class GraphIntentNormalizer:
    """Normalize call-time operation intent into the graph workflow vocabulary."""

    _KNOWN_OPS = {
        "add_node",
        "add_edge",
        "add_prerequisite",
        "update_node",
        "remove_node",
        "remove_edge",
        "merge_nodes",
        "split_node",
        "anchor",
        "content_readiness",
        "ask_for_mapping_choice",
        "confusable_relation",
        "contrast_relation",
        "misconception_relation",
        "expand_pkg",
    }

    def normalize(self, request: Any) -> dict[str, Any]:
        payload = getattr(request, "payload", {}) or {}
        raw_operation = (
            payload.get("operationName")
            or payload.get("requestedOperationName")
            or payload.get("operationType")
            or payload.get("requestedOperation")
            or payload.get("proposalType")
            or getattr(request, "operation_name", None)
            or getattr(request, "proposal_type", None)
            or "content_readiness"
        )
        operation_type = normalize_graph_operation_name(raw_operation)
        source_policy = payload.get("sourcePolicy") or {
            "requiresSourceEvidence": bool(getattr(request, "document_ids", [])),
            "sourceRefs": getattr(request, "document_ids", []),
        }
        return {
            "operationName": operation_type,
            "operationType": operation_type,
            "domain": payload.get("domain") or getattr(request, "domain", None) or "general",
            "mode": getattr(request, "study_mode", None) or payload.get("studyMode"),
            "sourcePolicy": source_policy,
            "humanIntent": payload.get("humanIntent") or payload.get("intent") or operation_type,
            "targetRefs": list(getattr(request, "concept_ids", []) or []),
            "graphExpansionScope": self._normalize_expansion_scope(request=request, payload=payload),
        }

    def _normalize_expansion_scope(self, *, request: Any, payload: dict[str, Any]) -> dict[str, Any]:
        scope = getattr(request, "graph_expansion_scope", None)
        if not isinstance(scope, dict):
            scope = payload.get("graphExpansionScope")
        if not isinstance(scope, dict):
            selected_node_ids = list(getattr(request, "selected_node_ids", []) or [])
            return {
                "scopeType": "node" if selected_node_ids else "whole_pkg",
                "nodeIds": selected_node_ids,
                "domain": payload.get("domain") or getattr(request, "domain", None),
            }
        scope_type = str(scope.get("scopeType") or "whole_pkg")
        if scope_type not in {"whole_pkg", "node", "domain"}:
            scope_type = "whole_pkg"
        node_ids = [str(node_id) for node_id in scope.get("nodeIds", []) if isinstance(node_id, str)]
        domain = scope.get("domain")
        return {
            "scopeType": scope_type,
            "nodeIds": node_ids,
            "domain": domain if isinstance(domain, str) and domain else None,
        }


class GraphReferenceResolver:
    """Resolve call-time labels/refs to human labels and service IDs from prefetched sections."""

    def resolve(self, *, request: Any, context_pack: dict[str, Any], intent: dict[str, Any]) -> list[dict[str, Any]]:
        concept_refs = list(getattr(request, "concept_ids", []) or [])
        if not concept_refs:
            concept_refs = [item for item in intent.get("targetRefs", []) if isinstance(item, str)]
        selected_node_ids = list(getattr(request, "selected_node_ids", []) or [])
        identities: list[dict[str, Any]] = []
        for index, ref in enumerate(concept_refs):
            identity = self._identity_for_ref(
                ref=ref,
                selected_node_id=selected_node_ids[index] if index < len(selected_node_ids) else None,
                context_pack=context_pack,
                domain=intent.get("domain"),
            )
            identities.append(identity)
        return identities

    def _identity_for_ref(
        self,
        *,
        ref: str,
        selected_node_id: str | None,
        context_pack: dict[str, Any],
        domain: str | None,
    ) -> dict[str, Any]:
        resolution = _section_value(context_pack, f"conceptResolution:{ref}")
        node = _section_value(context_pack, f"conceptNode:{ref}") or _section_value(context_pack, f"graphConcept:{ref}")
        matches = _items(resolution)
        best = matches[0] if matches else {}
        if not isinstance(best, dict):
            best = {}
        fixture = _STATIC_GRAPH_FIXTURES.get(ref, {})
        label = (
            _string(node, "label", "name", "title")
            or _string(best, "label", "name", "title")
            or (str(fixture.get("label")) if fixture.get("label") is not None else None)
            or _readable_label(ref)
        )
        concept_id = (
            _string(node, "conceptId", "canonicalConceptId")
            or _string(best, "conceptId", "canonicalConceptId")
            or (str(fixture.get("conceptId")) if fixture.get("conceptId") is not None else None)
            or (ref if ref.startswith("concept_") else None)
        )
        node_id = (
            _node_id_or_none(_string(node, "nodeId", "id"))
            or _node_id_or_none(_string(best, "nodeId", "id"))
            or (selected_node_id if isinstance(selected_node_id, str) and selected_node_id.startswith("node_") else None)
            or (ref if ref.startswith("node_") else None)
            or _node_id_or_none(str(fixture.get("pkgNodeId")) if fixture.get("pkgNodeId") is not None else None)
        )
        graph_type = _string(node, "graphType") or _string(best, "graphType") or "pkg"
        pkg_node_id = node_id if graph_type != "ckg" else _node_id_or_none(_string(best, "pkgNodeId"))
        ckg_node_id = (
            _node_id_or_none(_string(best, "ckgNodeId"))
            or (node_id if graph_type == "ckg" else None)
            or _node_id_or_none(str(fixture.get("ckgNodeId")) if fixture.get("ckgNodeId") is not None else None)
        )
        summary = (
            _string(node, "summary", "description")
            or _string(best, "summary", "description", "learnerFacingSummary")
            or (str(fixture.get("learnerFacingSummary")) if fixture.get("learnerFacingSummary") is not None else None)
            or (f"{label} in {domain}." if domain else label)
        )
        aliases = self._aliases(node, best) or [
            item for item in fixture.get("aliases", []) if isinstance(item, str)
        ]
        resolved_domain = (
            _string(node, "domain")
            or _string(best, "domain")
            or (str(fixture.get("domain")) if fixture.get("domain") is not None else None)
            or domain
        )
        confidence = best.get("score") if isinstance(best.get("score"), (int, float)) else best.get("confidence")
        return {
            "conceptRef": ref,
            "humanRef": label,
            "label": label,
            "summary": summary,
            "aliases": aliases,
            "domain": resolved_domain,
            "conceptId": concept_id,
            "pkgNodeId": pkg_node_id,
            "ckgNodeId": ckg_node_id,
            "graphType": graph_type,
            "resolutionConfidence": confidence if isinstance(confidence, (int, float)) else (0.9 if node_id else 0.0),
            "resolutionSource": "deterministic_prefetch" if node_id else "unavailable",
        }

    def _aliases(self, *values: Any) -> list[str]:
        aliases: list[str] = []
        for value in values:
            if not isinstance(value, dict):
                continue
            raw = value.get("aliases")
            if isinstance(raw, list):
                aliases.extend(item for item in raw if isinstance(item, str))
        return list(dict.fromkeys(aliases))


class GraphDuplicateScanner:
    """Detect duplicate and close-match risks from resolver candidates."""

    def scan(self, *, identities: list[dict[str, Any]], context_pack: dict[str, Any]) -> list[dict[str, Any]]:
        risks: list[dict[str, Any]] = []
        lowered: dict[str, str] = {}
        for identity in identities:
            label = str(identity.get("label") or "").strip().lower()
            if not label:
                continue
            if label in lowered:
                risks.append(
                    {
                        "kind": "duplicate_target",
                        "conceptRef": identity.get("conceptRef"),
                        "label": identity.get("label"),
                        "matches": [{"conceptRef": lowered[label], "label": identity.get("label")}],
                        "severity": "blocking",
                        "humanReadable": f"'{identity.get('label')}' appears more than once in the request.",
                    }
                )
            lowered[label] = str(identity.get("conceptRef"))
        for key, value in _sections_with_prefix(context_pack, "conceptResolution:"):
            matches = _items(value)
            if len(matches) <= 1:
                continue
            ref = key.split(":", 1)[1]
            risks.append(
                {
                    "kind": "close_match",
                    "conceptRef": ref,
                    "label": _readable_label(ref),
                    "matches": [
                        {
                            "label": _string(match, "label", "name", "title") or _readable_label(str(match.get("nodeId") or match.get("id") or ref)),
                            "nodeId": match.get("nodeId") or match.get("id"),
                            "conceptId": match.get("conceptId"),
                            "confidence": match.get("score") or match.get("confidence"),
                        }
                        for match in matches[:5]
                    ],
                    "severity": "review",
                    "humanReadable": f"'{_readable_label(ref)}' has multiple graph matches; review duplicate risk.",
                }
            )
        return risks


class GraphRelationContextBuilder:
    """Build human-readable relation packs from deterministic graph prefetches."""

    _RELATION_KEYS = {
        "prerequisites": ("prerequisites:", "prerequisite"),
        "related": ("relatedConcepts:", "related"),
        "contrasts": ("contrasts:", "contrasts_with"),
        "confusables": ("confusables:", "confusable_with"),
        "misconceptionLinks": ("misconceptionLinks:", "misconception"),
    }

    def build(
        self,
        *,
        identities: list[dict[str, Any]],
        context_pack: dict[str, Any],
        intent: dict[str, Any],
    ) -> dict[str, Any]:
        relation_candidates = {
            "prerequisites": [],
            "related": [],
            "contrasts": [],
            "confusables": [],
            "misconceptionLinks": [],
        }
        for identity in identities:
            ref = str(identity["conceptRef"])
            target_label = str(identity["label"])
            for bucket, (prefix, relationship) in self._RELATION_KEYS.items():
                relation_candidates[bucket].extend(
                    self._relations_from_section(
                        value=_section_value(context_pack, f"{prefix}{ref}"),
                        relationship=relationship,
                        target_ref=ref,
                        target_label=target_label,
                    )
                )
        if not relation_candidates["misconceptionLinks"]:
            relation_candidates["misconceptionLinks"].extend(
                self._relations_from_section(
                    value=_section_value(context_pack, "misconceptionSignals"),
                    relationship="misconception",
                    target_ref=identities[0]["conceptRef"] if identities else "unknown",
                    target_label=identities[0]["label"] if identities else "Unknown",
                )
            )
        return {
            "relationCandidates": {
                key: _dedupe(value)
                for key, value in relation_candidates.items()
            },
            "learnerGraphSignals": self._learner_signals(context_pack, identities),
            "sourceEvidence": self._source_evidence(context_pack),
            "policyContext": {
                "pkgWritePolicy": "single_user_confirmation",
                "ckgWritePolicy": "mutation_dsl_review_pipeline",
                "allowedOperationTypes": [
                    "add_node",
                    "add_edge",
                    "add_prerequisite",
                    "update_node",
                    "remove_node",
                    "remove_edge",
                    "merge_nodes",
                    "split_node",
                    "confusable_relation",
                    "contrast_relation",
                    "misconception_relation",
                ],
                "allowedEdgeTypes": _ALLOWED_GRAPH_EDGE_TYPES,
                "allowedNodeTypes": _ALLOWED_GRAPH_NODE_TYPES,
                "existingDomains": self._prefetch_existing_domains(
                    context_pack=context_pack,
                    identities=identities,
                    intent=intent,
                ),
                "discouragedDomains": ["general"],
                "population": {"mode": POP_STATIC, "source": "knowledge-graph-service"},
            },
        }

    def _prefetch_existing_domains(
        self,
        *,
        context_pack: dict[str, Any],
        identities: list[dict[str, Any]],
        intent: dict[str, Any],
    ) -> list[str]:
        """Deterministically prefetch existing graph domains for prompt grounding."""
        domains: list[str] = []

        def add(candidate: Any) -> None:
            if isinstance(candidate, str):
                normalized = candidate.strip()
                if normalized != "":
                    domains.append(normalized)

        add(intent.get("domain"))
        for identity in identities:
            add(identity.get("domain"))
        for section in context_pack.get("sections", []):
            if not isinstance(section, dict):
                continue
            value = section.get("value")
            if isinstance(value, dict):
                add(value.get("domain"))
                for node in _items(value):
                    add(node.get("domain"))
            elif isinstance(value, list):
                for node in value:
                    if isinstance(node, dict):
                        add(node.get("domain"))

        unique_domains = sorted({domain for domain in domains})
        return unique_domains[:40]

    def _relations_from_section(
        self,
        *,
        value: Any,
        relationship: str,
        target_ref: str,
        target_label: str,
    ) -> list[dict[str, Any]]:
        relations: list[dict[str, Any]] = []
        for item in _items(value):
            label = _string(item, "label", "name", "title") or _readable_label(str(item.get("nodeId") or item.get("id") or item.get("conceptId") or relationship))
            relations.append(
                {
                    "relationRef": _stable_id("rel", f"{target_ref}:{relationship}:{label}"),
                    "sourceConceptRef": str(item.get("sourceConceptRef") or item.get("conceptRef") or item.get("nodeId") or item.get("id") or label),
                    "targetConceptRef": target_ref,
                    "sourceLabel": label,
                    "targetLabel": target_label,
                    "label": label,
                    "relationship": item.get("relationship") or item.get("edgeType") or relationship,
                    "direction": item.get("direction") or ("incoming" if relationship == "prerequisite" else "undirected"),
                    "explanation": item.get("explanation") or item.get("rationale") or f"{label} is {relationship.replace('_', ' ')} for {target_label}.",
                    "source": item.get("source") or "knowledge-graph-service",
                    "confidence": item.get("confidence") or item.get("weight") or item.get("score") or 0.5,
                    "confidenceScore": item.get("confidence") or item.get("weight") or item.get("score") or 0.5,
                    "targetConceptRef": target_ref,
                    "targetLabel": target_label,
                    "sourceNodeId": item.get("sourceNodeId") or item.get("fromNodeId") or item.get("nodeId") or item.get("id"),
                    "targetNodeId": item.get("targetNodeId") or item.get("toNodeId"),
                    "population": {"mode": POP_PREFETCH, "source": "graph-intervention-orchestrator"},
                }
            )
        return relations

    def _learner_signals(self, context_pack: dict[str, Any], identities: list[dict[str, Any]]) -> list[dict[str, Any]]:
        signals: list[dict[str, Any]] = []
        for identity in identities:
            ref = str(identity["conceptRef"])
            average = _section_value(context_pack, f"reasoningAverage:{ref}")
            schedule = _section_value(context_pack, f"conceptSchedule:{ref}")
            if average is not None or schedule is not None:
                signals.append(
                    {
                        "conceptRef": ref,
                        "label": identity["label"],
                        "reasoningAverage": average,
                        "schedule": schedule,
                        "source": "metacognition/scheduler prefetch",
                    }
                )
        return signals

    def _source_evidence(self, context_pack: dict[str, Any]) -> list[dict[str, Any]]:
        evidence: list[dict[str, Any]] = []
        for key, value in _sections_with_prefix(context_pack, "sourceDocument:"):
            evidence.append({"sourceRef": key.split(":", 1)[1], "kind": "document", "summary": value})
        for key, value in _sections_with_prefix(context_pack, "ragGrounding:"):
            evidence.append({"sourceRef": key.split(":", 1)[1], "kind": "retrieval", "summary": value})
        for key, value in _sections_with_prefix(context_pack, "documentChunk:"):
            evidence.append({"sourceRef": key.split(":", 1)[1], "kind": "chunk", "summary": value})
        return evidence


class RelationReasonerAgent:
    """Generate missing human relation explanations without deciding service IDs."""

    def enrich(self, relation_candidates: dict[str, list[dict[str, Any]]]) -> dict[str, list[dict[str, Any]]]:
        for bucket, relations in relation_candidates.items():
            for relation in relations:
                if not relation.get("explanation"):
                    relation["explanation"] = (
                        f"{relation.get('label')} is relevant as {relation.get('relationship')} "
                        f"for {relation.get('targetLabel')}."
                    )
                relation.setdefault("generatedBy", "relation-reasoner-agent")
        return relation_candidates


class RationaleWriterAgent:
    """Produce operation-level rationale strings used by review and DSL plans."""

    def rationale_for(self, *, operation: str, source_label: str, target_label: str) -> str:
        if operation == "add_prerequisite":
            return f"{source_label} should be reviewed as a prerequisite for {target_label}."
        if operation in {"confusable_relation", "confusable_with"}:
            return f"{source_label} and {target_label} should be separated explicitly because learners may confuse them."
        if operation in {"contrast_relation", "contrasts_with"}:
            return f"{source_label} and {target_label} should be contrasted to clarify their boundary."
        return f"{source_label} is pedagogically related to {target_label}."


class MergeSplitAnalystAgent:
    """Summarize merge/split ambiguity risks for the graph agent prompt."""

    def summarize(self, duplicate_risks: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [
            {
                **risk,
                "explanation": risk.get("humanReadable") or "Potential duplicate/ambiguity requires mapping review.",
                "generatedBy": "merge-split-analyst-agent",
            }
            for risk in duplicate_risks
        ]


class LearnerStateSummarizerAgent:
    """Condense learner graph signals into a human-readable prompt field."""

    def summarize(self, signals: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [
            {
                "conceptRef": signal.get("conceptRef"),
                "label": signal.get("label"),
                "summary": "Learner state signal was prefetched for this concept.",
                "source": signal.get("source"),
                "details": signal,
                "generatedBy": "learner-state-summarizer-agent",
            }
            for signal in signals
        ]


class GraphMutationNormalizer:
    """Map finalized graph prompt context into downstream service operation shapes."""

    _EDGE_BUCKETS = {
        "prerequisites": "prerequisite",
        "related": "related_to",
        "contrasts": "contrasts_with",
        "confusables": "confusable_with",
        "misconceptionLinks": "misconception",
    }

    def normalize(self, *, identities: list[dict[str, Any]], prompt: dict[str, Any]) -> dict[str, Any]:
        pkg_ops: list[dict[str, Any]] = []
        ckg_ops: list[dict[str, Any]] = []
        rationale_writer = RationaleWriterAgent()
        by_label = {str(item.get("label", "")).lower(): item for item in identities}
        target = identities[0] if identities else {}
        for bucket, edge_type in self._EDGE_BUCKETS.items():
            for relation in prompt["pedagogicalContext"]["relationCandidates"].get(bucket, []):
                source_identity = by_label.get(str(relation.get("label", "")).lower())
                source_pkg = relation.get("sourceNodeId") or (source_identity or {}).get("pkgNodeId")
                target_pkg = relation.get("targetNodeId") or target.get("pkgNodeId")
                source_ckg = relation.get("sourceCkgNodeId") or relation.get("sourceNodeId") or (source_identity or {}).get("ckgNodeId")
                target_ckg = target.get("ckgNodeId")
                rationale = relation.get("explanation") or rationale_writer.rationale_for(
                    operation=edge_type,
                    source_label=str(relation.get("label") or "Source concept"),
                    target_label=str(relation.get("targetLabel") or target.get("label") or "Target concept"),
                )
                if source_pkg and target_pkg:
                    pkg_ops.append(
                        {
                            "type": "add_edge",
                            "sourceNodeId": source_pkg,
                            "targetNodeId": target_pkg,
                            "edgeType": edge_type,
                            "weight": relation.get("confidence", 0.5),
                            "rationale": rationale,
                            "confirmationMessage": f"Add {edge_type} relation: {relation.get('label')} -> {target.get('label')}",
                        }
                    )
                if source_ckg and target_ckg:
                    ckg_ops.append(
                        {
                            "type": "add_edge",
                            "sourceNodeId": source_ckg,
                            "targetNodeId": target_ckg,
                            "edgeType": edge_type,
                            "weight": relation.get("confidence", 0.5),
                            "rationale": rationale,
                        }
                    )
        return {
            "pkgWritePlan": {
                "requiresUserConfirmation": bool(pkg_ops),
                "ready": True,
                "confirmationMessage": "Confirm reviewed PKG graph updates before applying them.",
                "operations": pkg_ops,
            },
            "ckgMutationPlan": {
                "ready": True,
                "operations": ckg_ops,
                "rationale": "Prepare reviewed CKG relation updates from finalized graph readiness.",
                "evidenceCount": len(prompt.get("pedagogicalContext", {}).get("sourceEvidence", [])),
                "priority": 10 if ckg_ops else 0,
                "blockedReasons": [],
            },
        }


class GraphInterventionOrchestrator:
    """Build GraphAgentPromptV1 and readiness reports for graph/content workflows."""

    def __init__(self) -> None:
        self._intent = GraphIntentNormalizer()
        self._resolver = GraphReferenceResolver()
        self._duplicates = GraphDuplicateScanner()
        self._context = GraphRelationContextBuilder()
        self._relation_reasoner = RelationReasonerAgent()
        self._merge_split = MergeSplitAnalystAgent()
        self._learner_summarizer = LearnerStateSummarizerAgent()
        self._mutations = GraphMutationNormalizer()

    async def build_readiness(
        self,
        *,
        request: Any,
        context_pack: dict[str, Any],
        agent_run_id: str | None = None,
    ) -> dict[str, Any]:
        intent = self._intent.normalize(request)
        identities = self._resolver.resolve(request=request, context_pack=context_pack, intent=intent)
        duplicate_risks = self._duplicates.scan(identities=identities, context_pack=context_pack)
        relation_context = self._context.build(identities=identities, context_pack=context_pack, intent=intent)
        relation_candidates = self._relation_reasoner.enrich(relation_context["relationCandidates"])
        learner_signal_items = self._learner_summarizer.summarize(relation_context["learnerGraphSignals"])
        learner_signals = {
            "structuralHealth": None,
            "reasoningByConceptRef": {
                str(item.get("conceptRef")): item for item in learner_signal_items if isinstance(item.get("conceptRef"), str)
            },
            "scheduleByConceptRef": {},
            "misconceptionSignals": [],
            "population": {"mode": POP_PREFETCH, "source": "graph-intervention-orchestrator"},
        }
        ambiguities = self._merge_split.summarize(duplicate_risks)
        blocked_reasons = self._blocked_reasons(
            identities=identities,
            ambiguities=ambiguities,
            source_evidence=relation_context["sourceEvidence"],
            intent=intent,
        )
        prompt = {
            "schemaVersion": "graph_agent_prompt.v1",
            "promptProfileVersion": "graph-operation-profile.v1",
            "promptId": f"gap_{uuid.uuid4().hex[:16]}",
            "generatedAt": _now_iso(),
            "agentRunId": agent_run_id,
            "instructions": {
                "reasoningRule": (
                    "Reason only from human-readable pedagogicalContext, sourceEvidence, "
                    "learnerGraphSignals, policyContext, ambiguities, and populationReport. "
                    "Treat serviceContract as a transport contract for IDs, mutation compatibility, "
                    "routing, and idempotency only. Never derive graph semantics from IDs, selected "
                    "node references, mutation-plan placeholders, or downstream handoff fields."
                ),
                "domainAssignmentRule": _DOMAIN_ASSIGNMENT_RULE,
                "domainDiscoveryRule": _DOMAIN_DISCOVERY_RULE,
                "proposalCoverageRule": _PROPOSAL_COVERAGE_RULE,
                "edgeTypeGuidance": _EDGE_TYPE_GUIDANCE,
                "nodeTypeGuidance": _NODE_TYPE_GUIDANCE,
            },
            "pedagogicalContext": {
                "requestedOperation": {
                    "operationName": intent["operationName"],
                    "operationType": intent["operationType"],
                    "graphScope": "both",
                    "domain": intent["domain"],
                    "studyMode": intent["mode"],
                    "purpose": intent["humanIntent"],
                    "expansionScope": intent.get("graphExpansionScope", {}),
                    "population": {"mode": POP_CALL_TIME, "source": "AgentRunRequest.payload"},
                },
                "targetConcepts": [
                    {
                        "conceptRef": item["conceptRef"],
                        "label": item["label"],
                        "description": item["summary"],
                        "domain": item["domain"],
                        "studyMode": intent["mode"],
                        "aliases": item["aliases"],
                        "learnerFacingSummary": item["summary"],
                        "population": {"mode": POP_PREFETCH, "source": "graph-intervention-orchestrator"},
                    }
                    for item in identities
                ],
                "relationCandidates": relation_candidates,
                "learnerGraphSignals": learner_signals,
                "sourceEvidence": relation_context["sourceEvidence"],
                "policyContext": relation_context["policyContext"],
                "ambiguities": ambiguities,
                "expansionScope": intent.get("graphExpansionScope", {}),
            },
            "serviceContract": {
                "identityMap": {
                    "concepts": [
                        {
                            "conceptRef": f"c{index + 1}",
                            "inputRef": item["conceptRef"],
                            "conceptId": item["conceptId"],
                            "pkgNodeId": item["pkgNodeId"],
                            "ckgNodeId": item["ckgNodeId"],
                            "selectedNodeIds": [
                                node_id
                                for node_id in [getattr(request, "selected_node_ids", [None] * len(identities))[index] if index < len(getattr(request, "selected_node_ids", [])) else None]
                                if isinstance(node_id, str)
                            ],
                            "resolvedGraphType": "both" if item.get("pkgNodeId") and item.get("ckgNodeId") else ("pkg" if item.get("pkgNodeId") else ("ckg" if item.get("ckgNodeId") else "unresolved")),
                        }
                        for index, item in enumerate(identities)
                    ],
                    "documents": [
                        {"documentRef": f"d{index + 1}", "documentId": document_id}
                        for index, document_id in enumerate(list(getattr(request, "document_ids", []) or []))
                    ],
                },
                "pkgWritePlan": {"requiresUserConfirmation": False, "ready": False, "operations": []},
                "ckgMutationPlan": {
                    "requiresReview": True,
                    "reviewQueue": "knowledge-graph-review-queue",
                    "ready": False,
                    "operations": [],
                },
                "toolCallInputs": {
                    "resolver": {
                        "tool": "resolve-concept-reference",
                        "refs": [item["conceptRef"] for item in identities],
                    },
                    "relationPrefetch": [
                        "get-concept-node",
                        "get-canonical-structure",
                        "find-prerequisites",
                        "find-related-concepts",
                        "find-contrasts",
                        "find-confusables",
                        "find-misconception-links",
                    ],
                },
                "reviewRouting": {
                    "pkg": {"surface": "pkg-confirmation-dialog", "requiresReview": False},
                    "ckg": {"surface": "knowledge-graph-review-queue", "requiresReview": True},
                },
                "idempotencyKeys": {
                    "graphBrief": _stable_id("graph_prompt", repr([item["conceptRef"] for item in identities]) + str(intent)),
                    "pkgWrite": _stable_id("pkg_write", repr(identities) + intent["operationType"]),
                    "ckgMutation": _stable_id("ckg_mutation", repr(identities) + intent["operationType"]),
                },
            },
            "populationReport": self._population_report(
                has_identities=bool(identities),
                has_source_evidence=True,
                has_llm_fields=True,
            ),
        }
        mutation_plans = self._mutations.normalize(identities=identities, prompt=prompt)
        prompt["serviceContract"]["pkgWritePlan"] = mutation_plans["pkgWritePlan"]
        prompt["serviceContract"]["ckgMutationPlan"] = mutation_plans["ckgMutationPlan"]
        concepts = self._content_concepts(identities=identities, prompt=prompt)
        unresolved = [
            {
                "conceptRef": item["conceptRef"],
                "label": item["label"],
                "reason": "No graph node ID resolved. Ask resolver/user to choose or add node before mutation.",
            }
            for item in identities
            if not item.get("pkgNodeId") and not item.get("ckgNodeId")
        ]
        return {
            "schemaVersion": "graph_readiness_report.v1",
            "agentRunId": agent_run_id or f"graph_ready_{uuid.uuid4().hex[:8]}",
            "agentName": "graph-intervention-orchestrator",
            "operationName": intent["operationName"],
            "proposalType": intent["operationType"],
            "scope": intent.get("graphExpansionScope", {}),
            "status": "blocked" if blocked_reasons else "finalized",
            "graphPrompt": prompt,
            "concepts": concepts,
            "unresolved": unresolved,
            "blockedReasons": blocked_reasons,
            "persistedMutationIds": [],
            "notes": "GraphAgentPromptV1 finalized before graph/content reasoning." if not blocked_reasons else "Graph readiness blocked by unresolved identity or ambiguity.",
            "generatedAt": _now_iso(),
        }

    def _blocked_reasons(
        self,
        *,
        identities: list[dict[str, Any]],
        ambiguities: list[dict[str, Any]],
        source_evidence: list[dict[str, Any]],
        intent: dict[str, Any],
    ) -> list[str]:
        reasons: list[str] = []
        if not identities:
            reasons.append("No target concepts were provided.")
        for identity in identities:
            if not identity.get("label"):
                reasons.append(f"{identity.get('conceptRef')}: missing human-readable label.")
            if not identity.get("pkgNodeId") and not identity.get("ckgNodeId"):
                reasons.append(f"{identity.get('conceptRef')}: unresolved graph node ID.")
        if any(risk.get("severity") == "blocking" for risk in ambiguities):
            reasons.append("Duplicate target ambiguity must be resolved before graph mutation.")
        source_policy = intent.get("sourcePolicy")
        if (
            intent.get("operationType") != "content_readiness"
            and isinstance(source_policy, dict)
            and source_policy.get("requiresSourceEvidence")
            and not source_evidence
        ):
            reasons.append("Required source evidence is unavailable.")
        return reasons

    def _population_report(
        self,
        *,
        has_identities: bool,
        has_source_evidence: bool,
        has_llm_fields: bool,
    ) -> dict[str, Any]:
        fields = [
            _population("pedagogicalContext.requestedOperation", POP_CALL_TIME, source="AgentRunRequest.payload"),
            _population("pedagogicalContext.targetConcepts", POP_PREFETCH if has_identities else POP_UNAVAILABLE, source="GraphReferenceResolver", status="populated" if has_identities else "missing"),
            _population("pedagogicalContext.relationCandidates", POP_PREFETCH, source="GraphRelationContextBuilder"),
            _population("pedagogicalContext.learnerGraphSignals", POP_LLM if has_llm_fields else POP_UNAVAILABLE, source="LearnerStateSummarizerAgent"),
            _population("pedagogicalContext.sourceEvidence", POP_PREFETCH if has_source_evidence else POP_UNAVAILABLE, source="GraphRelationContextBuilder", status="populated" if has_source_evidence else "missing"),
            _population("pedagogicalContext.policyContext", POP_STATIC, source="agents-runtime policy"),
            _population("pedagogicalContext.ambiguities", POP_LLM, source="MergeSplitAnalystAgent"),
            _population("serviceContract.identityMap", POP_PREFETCH if has_identities else POP_UNAVAILABLE, source="GraphReferenceResolver", status="populated" if has_identities else "missing"),
            _population("serviceContract.pkgWritePlan", POP_PREFETCH, source="GraphMutationNormalizer"),
            _population("serviceContract.ckgMutationPlan", POP_PREFETCH, source="GraphMutationNormalizer"),
            _population("serviceContract.toolCallInputs", POP_STATIC, source="GraphAgentPromptV1 contract"),
            _population("serviceContract.reviewRouting", POP_STATIC, source="CKG/PKG write policy"),
            _population("serviceContract.idempotencyKeys", POP_PREFETCH, source="GraphInterventionOrchestrator"),
        ]
        missing = [field["field"] for field in fields if field.get("status") != "populated"]
        return {
            "schemaVersion": "graph_agent_population_report.v1",
            "fields": fields,
            "missingRequiredFields": missing,
            "ready": not missing,
        }

    def _content_concepts(self, *, identities: list[dict[str, Any]], prompt: dict[str, Any]) -> list[dict[str, Any]]:
        concepts: list[dict[str, Any]] = []
        relations = prompt["pedagogicalContext"]["relationCandidates"]
        for index, identity in enumerate(identities):
            ref = identity["conceptRef"]
            concepts.append(
                {
                    "conceptRef": f"c{index + 1}",
                    "inputRef": ref,
                    "conceptId": identity["conceptId"],
                    "pkgNodeId": identity.get("pkgNodeId"),
                    "ckgNodeId": identity.get("ckgNodeId"),
                    "label": identity["label"],
                    "domain": identity["domain"],
                    "aliases": identity.get("aliases", []),
                    "learnerFacingSummary": identity["summary"],
                    "prerequisites": self._relations_for_ref(relations["prerequisites"], ref),
                    "relatedConcepts": self._relations_for_ref(relations["related"], ref),
                    "contrasts": self._relations_for_ref(relations["contrasts"], ref),
                    "confusables": self._relations_for_ref(relations["confusables"], ref),
                    "misconceptionLinks": self._relations_for_ref(relations["misconceptionLinks"], ref),
                    "persisted": bool(identity.get("pkgNodeId") or identity.get("ckgNodeId")),
                }
            )
        return concepts

    def _relations_for_ref(self, relations: list[dict[str, Any]], ref: str) -> list[dict[str, Any]]:
        return [
            {
                "label": item.get("label"),
                "relationship": item.get("relationship"),
                "explanation": item.get("explanation"),
                "confidence": item.get("confidence"),
            }
            for item in relations
            if item.get("targetConceptRef") == ref
        ]
