"""Content creator agent for cards and Step Activity variants."""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from .guardian_client import GuardianClient

# Matches a nanoid tail: contains at least one uppercase letter, indicating it is
# machine-generated and not a human-readable slug (e.g. "AbCdEfGhIjKlMnOpQrStU").
_NANOID_RE = re.compile(r'[A-Z]')


def _readable_label(concept_id: str, context_pack: dict[str, Any]) -> str:
    """Return a human-readable label for a concept, preferring graph context over ID parsing.

    Distinguishes three cases for prefixed IDs:
    - Readable slug (all-lowercase tail, e.g. concept_stability) → title-cased
    - Opaque nanoid (mixed-case tail, e.g. concept_AbCdEfGhIjKlMnOpQrStU) → return full ID unchanged
    - No prefix (e.g. "Family") → return as-is; if all-lowercase slug, title-case it
    """
    if context_pack.get("schemaVersion") == "content_creation_prompt.v2":
        target_concepts = (
            context_pack.get("pedagogicalContext", {}).get("targetConcepts", [])
            if isinstance(context_pack.get("pedagogicalContext"), dict)
            else []
        )
        identity = (
            context_pack.get("serviceContract", {}).get("identityMap", {}).get("concepts", [])
            if isinstance(context_pack.get("serviceContract"), dict)
            else []
        )
        ref_for_id = None
        for item in identity if isinstance(identity, list) else []:
            if isinstance(item, dict) and item.get("conceptId") == concept_id:
                ref_for_id = item.get("conceptRef")
                break
        for item in target_concepts if isinstance(target_concepts, list) else []:
            if not isinstance(item, dict):
                continue
            if item.get("conceptRef") == ref_for_id:
                label = item.get("label")
                if isinstance(label, str) and label:
                    return label
    sections = context_pack.get("sections", [])
    if isinstance(sections, list):
        for section in sections:
            if not isinstance(section, dict):
                continue
            if section.get("key") != f"graphConcept:{concept_id}":
                continue
            value = section.get("value")
            if isinstance(value, dict):
                for key in ("label", "name", "title"):
                    label = value.get(key)
                    if isinstance(label, str) and label:
                        return label
                data = value.get("data")
                if isinstance(data, dict):
                    label = data.get("label")
                    if isinstance(label, str) and label:
                        return label
    for prefix in ("concept_", "node_", "kg_"):
        if concept_id.startswith(prefix):
            tail = concept_id[len(prefix):]
            if _NANOID_RE.search(tail):
                # Opaque machine-generated ID — no readable label can be derived.
                # Return the full ID as a formal identifier rather than a misleading substring.
                return concept_id
            return tail.replace("_", " ").title()
    # No recognized prefix: treat as a direct label.
    # All-lowercase slugs get title-cased; anything with uppercase is returned as-is.
    if concept_id == concept_id.lower():
        return concept_id.replace("_", " ").title()
    return concept_id


def _is_canonical_concept_id(value: str) -> bool:
    return bool(re.match(r"^concept_[A-Za-z0-9_-]{21}$", value))


def _is_graph_node_id(value: str) -> bool:
    return bool(re.match(r"^node_[A-Za-z0-9_-]{21}$", value))


def _is_ckg_anchor(value: str) -> bool:
    return _is_canonical_concept_id(value) or _is_graph_node_id(value)


def _identity_for_concept(context_pack: dict[str, Any], concept_id: str) -> dict[str, Any]:
    if context_pack.get("schemaVersion") != "content_creation_prompt.v2":
        return {}
    service_contract = context_pack.get("serviceContract")
    if not isinstance(service_contract, dict):
        return {}
    identity_map = service_contract.get("identityMap")
    if not isinstance(identity_map, dict):
        return {}
    concepts = identity_map.get("concepts")
    if not isinstance(concepts, list):
        return {}
    for item in concepts:
        if not isinstance(item, dict):
            continue
        if (
            item.get("conceptId") == concept_id
            or item.get("inputRef") == concept_id
            or item.get("conceptRef") == concept_id
        ):
            return item
    return {}


def _concept_context_for_ref(context_pack: dict[str, Any], concept_ref: str) -> dict[str, Any]:
    if context_pack.get("schemaVersion") != "content_creation_prompt.v2":
        return {}
    target_concepts = context_pack.get("pedagogicalContext", {}).get("targetConcepts", [])
    if not isinstance(target_concepts, list):
        return {}
    for item in target_concepts:
        if isinstance(item, dict) and item.get("conceptRef") == concept_ref:
            return item
    return {}


def _canonical_concept_ids(
    raw_ids: list[str],
    request: "ContentCreatorRequest",
) -> list[str]:
    canonical: list[str] = []
    for raw_id in raw_ids:
        if not isinstance(raw_id, str) or not raw_id:
            continue
        identity = _identity_for_concept(request.context_pack, raw_id)
        mapped = identity.get("conceptId")
        if isinstance(mapped, str) and mapped:
            canonical.append(mapped)
        else:
            canonical.append(raw_id)
    return list(dict.fromkeys(canonical))


_VACUOUS_EXPLANATION_PATTERNS = (
    "refers to a specific entity or concept known as",
    "without further context or information",
    "precise definition and significance cannot be elaborated",
    "it could be a term from various fields",
    "i don't have enough data",
    "not enough data to answer",
    "insufficient information",
)


def _is_vacuous_explanation(text: str) -> bool:
    normalized = text.strip().lower()
    if not normalized:
        return True
    return any(pattern in normalized for pattern in _VACUOUS_EXPLANATION_PATTERNS)


def _fallback_back_content(concept_id: str, request: "ContentCreatorRequest") -> str | None:
    identity = _identity_for_concept(request.context_pack, concept_id)
    concept_ref = identity.get("conceptRef") if isinstance(identity.get("conceptRef"), str) else None
    concept_context = _concept_context_for_ref(request.context_pack, concept_ref) if concept_ref else {}
    label = _readable_label(concept_id, request.context_pack)
    description = concept_context.get("description")
    if not isinstance(description, str) or not description.strip():
        description = concept_context.get("learnerFacingSummary")
    domain = concept_context.get("domain")
    aliases = concept_context.get("aliases")
    alias_text = ""
    if isinstance(aliases, list):
        alias_values = [item for item in aliases if isinstance(item, str) and item.strip()]
        if alias_values:
            alias_text = f" It is also referred to as {', '.join(alias_values[:3])}."

    relation_bits: list[str] = []
    relations = (
        request.context_pack.get("pedagogicalContext", {}).get("conceptRelations", {})
        if isinstance(request.context_pack.get("pedagogicalContext"), dict)
        else {}
    )
    if concept_ref and isinstance(relations, dict):
        for key in (
            "prerequisitesByConceptRef",
            "relatedConceptsByConceptRef",
            "contrastsByConceptRef",
            "confusablesByConceptRef",
        ):
            relation_pack = relations.get(key, {})
            items = relation_pack.get(concept_ref, {}).get("items", []) if isinstance(relation_pack, dict) else []
            if isinstance(items, list) and items:
                labels = [
                    str(item.get("label"))
                    for item in items
                    if isinstance(item, dict) and isinstance(item.get("label"), str) and item.get("label")
                ]
                if labels:
                    relation_bits.append(", ".join(labels[:2]))

    if isinstance(description, str) and description.strip():
        first_sentence = description.strip().rstrip(".")
        related_sentence = (
            f" It is commonly studied alongside {relation_bits[0]}."
            if relation_bits
            else ""
        )
        return f"{label} is {first_sentence}.{alias_text}{related_sentence}"

    if isinstance(domain, str) and domain.strip() and relation_bits:
        return (
            f"{label} is a concept in {domain.strip()}. "
            f"It is commonly connected to {relation_bits[0]}."
        )

    return None


class ContentCreatorRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_id: str = Field(default="user_unknown", alias="userId")
    operation_name: str | None = Field(default=None, alias="operationName")
    mode: Literal["rag_grounded", "agent_autonomous"]
    concept_ids: list[str] = Field(alias="conceptIds")
    selected_node_ids: list[str] = Field(default_factory=list, alias="selectedNodeIds")
    curriculum_id: str | None = Field(default=None, alias="curriculumId")
    session_id: str | None = Field(default=None, alias="sessionId")
    document_ids: list[str] = Field(default_factory=list, alias="documentIds")
    desired_card_types: list[str] = Field(default_factory=list, alias="desiredCardTypes")
    desired_activity_types: list[str] = Field(default_factory=list, alias="desiredActivityTypes")
    study_mode: str | None = Field(default=None, alias="studyMode")
    budget: dict[str, Any] = Field(default_factory=dict)
    context_pack: dict[str, Any] = Field(default_factory=dict, alias="contextPack")
    provider: str | None = None
    model: str | None = None
    agent_run_id: str | None = Field(default=None, alias="agentRunId")
    execution_strategy: str = Field(default="realtime", alias="executionStrategy")
    batch_requested: bool = Field(default=False, alias="batchRequested")


class ContentTransformRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    card: dict[str, Any]
    operation_name: str | None = Field(default=None, alias="operationName")
    transformation_kind: str = Field(alias="transformationKind")
    prompt: str | None = None
    parent_card_id: str | None = Field(default=None, alias="parentCardId")
    target_card_type: str | None = Field(default=None, alias="targetCardType")
    target_card_types: list[str] = Field(default_factory=list, alias="targetCardTypes")
    count: int = Field(default=1, alias="count")
    context_pack: dict[str, Any] = Field(default_factory=dict, alias="contextPack")
    provider: str | None = None
    model: str | None = None
    agent_run_id: str | None = Field(default=None, alias="agentRunId")
    execution_strategy: str = Field(default="realtime", alias="executionStrategy")
    batch_requested: bool = Field(default=False, alias="batchRequested")


class ContentCreatorAgent:
    def __init__(self, guardian: GuardianClient) -> None:
        self._guardian = guardian

    async def create(self, request: ContentCreatorRequest) -> dict[str, Any]:
        # When a model is configured + realtime strategy, stub cards will be blocked by
        # _blocking_card_reason. Signal this upfront so callers can switch to batch without
        # waiting for guardian validation to fail.
        requires_batch_llm = (
            bool(request.concept_ids)
            and request.model is not None
            and request.execution_strategy == "realtime"
        )
        generated = {
            "cards": [self._draft_card_for_concept(request, cid) for cid in request.concept_ids],
            "activityVariants": [
                self._draft_activity_variant_for_concept(request, cid)
                for cid in request.concept_ids
            ],
            "coveragePlan": self._coverage_plan(request),
            "groundingReport": self._grounding_report(request),
            "graphProposals": [],
            "missingConceptIds": [],
            "requiresBatchLlm": requires_batch_llm,
        }
        return await self.finalize_created_content(generated=generated, request=request)

    async def finalize_created_content(
        self,
        *,
        generated: dict[str, Any],
        request: ContentCreatorRequest,
    ) -> dict[str, Any]:
        run_id = request.agent_run_id or _new_agent_run_id()
        accepted_cards: list[dict[str, Any]] = []
        accepted_variants: list[dict[str, Any]] = []
        rejected: list[dict[str, Any]] = []

        for draft in _as_dict_list(generated.get("cards")):
            normalized = self._normalize_card_draft(draft, request)
            normalized = self._repair_or_reject_vacuous_card(normalized, request)
            reason = self._blocking_card_reason(normalized, request)
            if reason is not None:
                rejected.append({"kind": "card", "draft": normalized, "reasons": [reason]})
                continue
            outcome = await self._guardian.validate_activity(
                self._guardian_activity_for_draft(normalized)
            )
            if outcome.accepted:
                normalized["guardianValidationId"] = outcome.validation_id
                accepted_cards.append(normalized)
            else:
                rejected.append({"kind": "card", "draft": normalized, "reasons": outcome.reasons})

        for draft in _as_dict_list(generated.get("activityVariants")):
            normalized = self._normalize_activity_variant(draft, request)
            outcome = await self._guardian.validate_activity(
                self._guardian_activity_for_variant(normalized)
            )
            if outcome.accepted:
                normalized["guardianValidationId"] = outcome.validation_id
                accepted_variants.append(normalized)
            else:
                rejected.append(
                    {"kind": "activityVariant", "draft": normalized, "reasons": outcome.reasons}
                )

        return {
            "agentRunId": run_id,
            "operationName": request.operation_name or "draft_content",
            "promptProfileVersion": "content-operation-profile.v1",
            "cards": accepted_cards,
            "activityVariants": accepted_variants,
            "rejectedDrafts": [*rejected, *_as_dict_list(generated.get("rejectedDrafts"))],
            "graphProposals": generated.get("graphProposals", []),
            "missingConceptIds": generated.get("missingConceptIds", []),
            # True when cards were drafted but require LLM finalization via batch execution.
            # Callers must re-submit with executionStrategy=batch so finalize_generated_cards
            # is called with actual LLM output rather than stubs.
            "requiresBatchLlm": generated.get("requiresBatchLlm", False),
            "coveragePlan": generated.get("coveragePlan") or self._coverage_plan(request),
            "groundingReport": generated.get("groundingReport") or self._grounding_report(request),
            "costEstimate": generated.get(
                "costEstimate",
                {"units": len(accepted_cards) + len(accepted_variants) + len(rejected)},
            ),
            "execution": {
                "provider": request.provider,
                "model": request.model,
                "strategy": request.execution_strategy,
                "batchRequested": request.batch_requested,
            },
        }

    async def finalize_generated_cards(
        self,
        *,
        drafts: list[dict[str, Any]],
        request: ContentCreatorRequest,
    ) -> dict[str, Any]:
        """Compatibility finalizer for older batch workers/tests."""
        return await self.finalize_created_content(
            generated={"cards": drafts, "activityVariants": []},
            request=request,
        )

    async def transform(self, request: ContentTransformRequest) -> dict[str, Any]:
        run_id = request.agent_run_id or _new_agent_run_id()
        source_content = request.card.get("content", {})
        requested_types = [
            value
            for value in [request.target_card_type, *request.target_card_types]
            if isinstance(value, str) and value.strip()
        ]
        count = max(1, request.count)
        if not requested_types:
            requested_types = [str(request.card.get("cardType", "atomic"))]
        drafts: list[dict[str, Any]] = []
        for index in range(count):
            requested_type = requested_types[index] if index < len(requested_types) else requested_types[-1]
            draft = {
                **request.card,
                "cardType": requested_type,
                "parentCardId": request.parent_card_id,
                "transformationKind": request.transformation_kind,
                "content": {
                    **source_content,
                    "front": request.prompt or source_content.get("front", "Transform this card."),
                    "back": source_content.get("back", "Generated transformed variant."),
                },
                "metadata": {
                    **request.card.get("metadata", {}),
                    "transformationRationale": request.prompt or request.transformation_kind,
                    "transformationIndex": index,
                },
            }
            outcome = await self._guardian.validate_activity(self._guardian_activity_for_draft(draft))
            if not outcome.accepted:
                raise ValueError(f"Guardian rejected transformed card: {', '.join(outcome.reasons)}")
            draft["guardianValidationId"] = outcome.validation_id
            drafts.append(draft)
        return {
            "agentRunId": run_id,
            "operationName": request.operation_name or "transform_content",
            "promptProfileVersion": "content-operation-profile.v1",
            "cards": drafts,
            "execution": {
                "provider": request.provider,
                "model": request.model,
                "strategy": request.execution_strategy,
                "batchRequested": request.batch_requested,
            },
        }

    def _find_missing_concept_ids(self, request: ContentCreatorRequest) -> list[str]:
        """Return concept IDs confirmed absent from the graph.

        Graph readiness is now owned upstream by graph-intervention-orchestrator.
        Content creator never emits graph proposals or asks knowledge-graph-agent to
        resolve identity.
        """
        return []

    def _missing_concept_graph_proposal(
        self, concept_id: str, request: ContentCreatorRequest
    ) -> dict[str, Any]:
        """Produce a KG-agent delegation hint for a concept absent from the graph."""
        label = _readable_label(concept_id, request.context_pack)
        return {
            "conceptId": concept_id,
            "signal": "concept_not_in_graph",
            "proposedOperation": {
                "type": "add_node",
                "nodeType": "concept",
                "label": label,
                "domain": "general",
            },
            "prerequisitesRequired": True,
            "reviewNote": f"'{label}' was not found in finalized graph readiness.",
            "agentHint": {"delegateTo": "graph-intervention-orchestrator", "proposalType": "content_readiness", "conceptIds": [concept_id]},
        }

    def _draft_card_for_concept(
        self, request: ContentCreatorRequest, concept_id: str
    ) -> dict[str, Any]:
        card_type = request.desired_card_types[0] if request.desired_card_types else "short_answer"
        label = _readable_label(concept_id, request.context_pack)
        identity = _identity_for_concept(request.context_pack, concept_id)
        anchored_ckg_id = (
            identity.get("ckgNodeId")
            if isinstance(identity.get("ckgNodeId"), str)
            else identity.get("conceptId") if isinstance(identity.get("conceptId"), str) else concept_id
        )
        anchored_pkg_id = identity.get("pkgNodeId") if isinstance(identity.get("pkgNodeId"), str) else None
        return {
            "cardType": card_type,
            "originMode": request.mode,
            "anchoredCkgNodeIds": (
                [anchored_ckg_id] if _is_ckg_anchor(anchored_ckg_id) else []
            ),
            "anchoredPkgNodeIds": (
                [anchored_pkg_id] if anchored_pkg_id and _is_graph_node_id(anchored_pkg_id) else []
            ),
            "conceptIds": [concept_id],
            "sourceDocumentIds": request.document_ids,
            "sources": self._sources_from_context(request),
            "factualityScore": 0.92 if request.mode == "rag_grounded" else 0.78,
            "content": {
                "front": f"Explain {label} in your own words.",
                "back": "Generated draft pending review against the supplied context.",
            },
            "tags": ["generated", request.study_mode or "knowledge_gaining"],
            "difficulty": "intermediate",
            "rationale": "Drafted from prefetched content, graph, learner, and curriculum context.",
            # Marks this card as a placeholder produced without an LLM call.
            # _blocking_card_reason rejects it when a model is configured + execution is realtime,
            # forcing the caller to use the batch path where the LLM generates real content.
            "contentIsStub": True,
        }

    def _draft_activity_variant_for_concept(
        self, request: ContentCreatorRequest, concept_id: str
    ) -> dict[str, Any]:
        transformation = (
            request.desired_activity_types[0] if request.desired_activity_types else "explanation"
        )
        label = _readable_label(concept_id, request.context_pack)
        # Include a unique fragment so seeds are collision-free when agent_run_id is absent.
        run_token = request.agent_run_id or uuid4().hex[:8]
        return {
            "conceptId": concept_id,
            "studyMode": request.study_mode or "knowledge_gaining",
            "transformationType": transformation,
            "epistemicMode": "generative_retrieval",
            "difficultyBucket": 2,
            "sourceCardIds": [],
            "prompt": f"Explain the key idea of {label}, then give one concrete example.",
            "renderPayload": {"kind": "short_text", "conceptId": concept_id},
            "expectedResponseType": "short_text",
            "responseSchema": {"type": "string"},
            "variantSeed": f"{concept_id}:{transformation}:{run_token}",
            "generatorMetadata": {"agent": "content-creator-agent"},
            "ttlAt": _ttl_iso(),
            "rationale": "Generated as a Step Activity variant paired with the card draft.",
        }

    def _normalize_card_draft(
        self, draft: dict[str, Any], request: ContentCreatorRequest
    ) -> dict[str, Any]:
        concept_ids = _canonical_concept_ids(_strings(
            draft.get("conceptIds") or draft.get("anchoredCkgNodeIds") or request.concept_ids[:1]
        ), request)
        raw_ckg_anchors = _strings(draft.get("anchoredCkgNodeIds"))
        raw_pkg_anchors = _strings(draft.get("anchoredPkgNodeIds"))
        anchored_ckg_node_ids = [
            value for value in raw_ckg_anchors if _is_ckg_anchor(value)
        ]
        anchored_pkg_node_ids = [
            value
            for value in [*raw_pkg_anchors, *concept_ids]
            if _is_graph_node_id(value)
        ]
        for concept_id in concept_ids:
            identity = _identity_for_concept(request.context_pack, concept_id)
            ckg_node_id = identity.get("ckgNodeId")
            if isinstance(ckg_node_id, str) and _is_ckg_anchor(ckg_node_id):
                anchored_ckg_node_ids.append(ckg_node_id)
            pkg_node_id = identity.get("pkgNodeId")
            if isinstance(pkg_node_id, str) and _is_graph_node_id(pkg_node_id):
                anchored_pkg_node_ids.append(pkg_node_id)
        content = draft.get("content") if isinstance(draft.get("content"), dict) else {}
        normalized_content = dict(content)
        normalized_content["front"] = str(content.get("front", "Explain this concept."))
        normalized_content["back"] = str(content.get("back", "Generated draft pending review."))
        return {
            "cardType": str(
                draft.get(
                    "cardType",
                    request.desired_card_types[0] if request.desired_card_types else "short_answer",
                )
            ),
            "originMode": str(draft.get("originMode", request.mode)).lower(),
            "anchoredCkgNodeIds": anchored_ckg_node_ids,
            "anchoredPkgNodeIds": list(dict.fromkeys(anchored_pkg_node_ids)),
            "conceptIds": concept_ids,
            "sourceDocumentIds": _strings(draft.get("sourceDocumentIds") or request.document_ids),
            "sources": draft.get("sources") if isinstance(draft.get("sources"), list) else [],
            "factualityScore": float(draft.get("factualityScore", 0.75)),
            "content": normalized_content,
            "tags": _strings(draft.get("tags") or ["generated"]),
            "difficulty": str(draft.get("difficulty", "intermediate")).lower(),
            "rationale": str(draft.get("rationale", "Generated from prefetched agent context.")),
            "contentIsStub": bool(draft.get("contentIsStub", False)),
        }

    async def finalize_transformed_content(
        self,
        *,
        generated: dict[str, Any],
        request: ContentTransformRequest,
    ) -> dict[str, Any]:
        run_id = request.agent_run_id or _new_agent_run_id()
        accepted_cards: list[dict[str, Any]] = []
        rejected: list[dict[str, Any]] = []
        source_card = request.card if isinstance(request.card, dict) else {}
        source_content = source_card.get("content") if isinstance(source_card.get("content"), dict) else {}
        source_card_type = str(source_card.get("cardType", "atomic"))
        source_concept_ids = _strings(
            source_card.get("conceptIds") or source_card.get("anchoredCkgNodeIds") or []
        )
        source_related_ids = _strings(source_card.get("relatedConceptIds"))
        source_ckg_ids = [value for value in _strings(source_card.get("anchoredCkgNodeIds")) if _is_ckg_anchor(value)]
        source_pkg_ids = [value for value in _strings(source_card.get("anchoredPkgNodeIds")) if _is_graph_node_id(value)]

        for index, draft in enumerate(_as_dict_list(generated.get("cards"))):
            normalized_content = (
                draft.get("content") if isinstance(draft.get("content"), dict) else {}
            )
            normalized = {
                **source_card,
                **draft,
                "cardType": str(
                    draft.get("cardType")
                    or request.target_card_type
                    or (request.target_card_types[index] if index < len(request.target_card_types) else None)
                    or source_card_type
                ),
                "parentCardId": request.parent_card_id,
                "transformationKind": request.transformation_kind,
                "conceptIds": _strings(draft.get("conceptIds")) or source_concept_ids,
                "relatedConceptIds": _strings(draft.get("relatedConceptIds")) or source_related_ids,
                "anchoredCkgNodeIds": [
                    value for value in (_strings(draft.get("anchoredCkgNodeIds")) or source_ckg_ids) if _is_ckg_anchor(value)
                ],
                "anchoredPkgNodeIds": [
                    value for value in (_strings(draft.get("anchoredPkgNodeIds")) or source_pkg_ids) if _is_graph_node_id(value)
                ],
                "content": {
                    **source_content,
                    **normalized_content,
                    "front": str(
                        normalized_content.get("front")
                        or request.prompt
                        or source_content.get("front", "Transform this card.")
                    ),
                    "back": str(
                        normalized_content.get("back")
                        or source_content.get("back", "Generated transformed variant.")
                    ),
                },
                "tags": _strings(draft.get("tags") or source_card.get("tags") or ["generated", "transformed"]),
                "difficulty": str(draft.get("difficulty") or source_card.get("difficulty") or "intermediate").lower(),
                "factualityScore": float(draft.get("factualityScore", source_card.get("factualityScore", 0.75))),
                "rationale": str(
                    draft.get("rationale")
                    or f"Transformed from the parent card using {request.transformation_kind}."
                ),
                "sourceDocumentIds": _strings(draft.get("sourceDocumentIds") or source_card.get("sourceDocumentIds") or []),
                "sources": draft.get("sources") if isinstance(draft.get("sources"), list) else source_card.get("sources", []),
                "metadata": {
                    **(source_card.get("metadata") if isinstance(source_card.get("metadata"), dict) else {}),
                    **(draft.get("metadata") if isinstance(draft.get("metadata"), dict) else {}),
                    "transformationRationale": request.prompt or request.transformation_kind,
                    "transformationIndex": index,
                },
            }
            outcome = await self._guardian.validate_activity(self._guardian_activity_for_draft(normalized))
            if outcome.accepted:
                normalized["guardianValidationId"] = outcome.validation_id
                accepted_cards.append(normalized)
            else:
                rejected.append({"kind": "card", "draft": normalized, "reasons": outcome.reasons})
        return {
            "agentRunId": run_id,
            "operationName": request.operation_name or "transform_content",
            "promptProfileVersion": "content-operation-profile.v1",
            "cards": accepted_cards,
            "rejectedDrafts": rejected,
            "execution": {
                "provider": request.provider,
                "model": request.model,
                "strategy": request.execution_strategy,
                "batchRequested": request.batch_requested,
            },
        }

    def _repair_or_reject_vacuous_card(
        self, draft: dict[str, Any], request: ContentCreatorRequest
    ) -> dict[str, Any]:
        content = draft.get("content") if isinstance(draft.get("content"), dict) else {}
        back = content.get("back")
        if not isinstance(back, str) or not _is_vacuous_explanation(back):
            return draft

        concept_ids = _strings(draft.get("conceptIds"))
        concept_id = concept_ids[0] if concept_ids else (request.concept_ids[0] if request.concept_ids else "")
        fallback_back = _fallback_back_content(concept_id, request)
        if fallback_back is not None:
            content["back"] = fallback_back
            draft["content"] = content
            draft["factualityScore"] = max(float(draft.get("factualityScore", 0.0)), 0.6)
            draft["rationale"] = (
                str(draft.get("rationale", ""))
                + " Vacuous model output replaced with deterministic graph-context fallback."
            ).strip()
            return draft

        draft["factualityScore"] = 0.0
        draft["rationale"] = (
            str(draft.get("rationale", ""))
            + " Rejected because the generated explanation was vacuous and the prompt lacked semantic graph fields for a safe fallback."
        ).strip()
        draft["missingSemanticFields"] = [
            "pedagogicalContext.targetConcepts[].description or learnerFacingSummary",
            "pedagogicalContext.targetConcepts[].domain with meaningful relations",
            "pedagogicalContext.ragContext.evidenceByConceptRef",
        ]
        return draft

    def _normalize_activity_variant(
        self, draft: dict[str, Any], request: ContentCreatorRequest
    ) -> dict[str, Any]:
        concept_id = str(
            draft.get("conceptId")
            or (request.concept_ids[0] if request.concept_ids else "concept_unknown")
        )
        return {
            "conceptId": concept_id,
            "studyMode": str(draft.get("studyMode") or request.study_mode or "knowledge_gaining"),
            "transformationType": str(
                draft.get(
                    "transformationType",
                    request.desired_activity_types[0]
                    if request.desired_activity_types
                    else "explanation",
                )
            ),
            "epistemicMode": str(draft.get("epistemicMode", "generative_retrieval")),
            "difficultyBucket": int(draft.get("difficultyBucket", 2)),
            "sourceCardIds": _strings(draft.get("sourceCardIds")),
            "prompt": str(draft.get("prompt", f"Practice {concept_id}.")),
            "renderPayload": (
                draft.get("renderPayload")
                if isinstance(draft.get("renderPayload"), dict)
                else {}
            ),
            "expectedResponseType": str(draft.get("expectedResponseType", "short_text")),
            "responseSchema": (
                draft.get("responseSchema")
                if isinstance(draft.get("responseSchema"), dict)
                else {"type": "string"}
            ),
            "variantSeed": str(draft.get("variantSeed", f"{concept_id}:generated")),
            "generatorMetadata": (
                draft.get("generatorMetadata")
                if isinstance(draft.get("generatorMetadata"), dict)
                else {"agent": "content-creator-agent"}
            ),
            "ttlAt": str(draft.get("ttlAt") or _ttl_iso()),
            "rationale": str(draft.get("rationale", "Generated Step Activity variant.")),
        }

    def _blocking_card_reason(
        self, draft: dict[str, Any], request: ContentCreatorRequest
    ) -> str | None:
        if request.mode == "rag_grounded" and not draft["sourceDocumentIds"]:
            return "RAG-grounded cards require sourceDocumentIds."
        if request.mode == "rag_grounded" and not draft["sources"]:
            return "RAG-grounded cards require source citations."
        # factualityScore is always a float after _normalize_card_draft; a zero value
        # signals a missing or explicitly invalid grounding signal regardless of mode.
        if draft.get("factualityScore", 1.0) <= 0.0:
            missing_fields = draft.get("missingSemanticFields")
            if isinstance(missing_fields, list) and missing_fields:
                return (
                    "Cards require a positive factualityScore. Missing semantic grounding for a safe fallback: "
                    + ", ".join(str(item) for item in missing_fields)
                )
            return "Cards require a positive factualityScore."
        # Stub cards cannot substitute for LLM-generated content when a model is explicitly
        # configured and the execution strategy is realtime. The caller must use batch execution
        # so the LLM output is routed back through finalize_generated_cards.
        if (
            draft.get("contentIsStub")
            and request.model is not None
            and request.execution_strategy == "realtime"
        ):
            return "Placeholder drafts are only allowed outside realtime content generation."
        return None

    def _coverage_plan(self, request: ContentCreatorRequest) -> dict[str, Any]:
        return {
            "targetConceptIds": request.concept_ids,
            "desiredCardTypes": request.desired_card_types,
            "desiredActivityTypes": request.desired_activity_types,
            "contextSectionCount": len(request.context_pack.get("sections", [])),
        }

    def _grounding_report(self, request: ContentCreatorRequest) -> dict[str, Any]:
        return {
            "mode": request.mode,
            "documentIds": request.document_ids,
            "contextSummary": request.context_pack.get("summary"),
            "prefetchErrors": request.context_pack.get("errors", []),
        }

    def _sources_from_context(self, request: ContentCreatorRequest) -> list[dict[str, Any]]:
        if not request.document_ids:
            return []
        return [
            {
                "documentId": document_id,
                "title": document_id,
                "retrievedAt": datetime.now(UTC).isoformat(),
                "snippet": "Prefetched document grounding supplied by ingestion/vector services.",
            }
            for document_id in request.document_ids
        ]

    def _guardian_activity_for_draft(self, draft: dict[str, Any]) -> dict[str, Any]:
        content = draft.get("content", {})
        concept_ids = draft.get("conceptIds", draft.get("anchoredCkgNodeIds", []))
        concept_id = concept_ids[0] if concept_ids else "concept_unknown"
        uid = uuid4().hex[:8]
        return {
            "id": f"activity_{concept_id}_{uid}",
            "contentSourceType": "generated",
            "generatedVariantId": f"variant_{concept_id}_{uid}",
            "prompt": str(content.get("front", "Practice this concept.")),
            "expectedResponseType": "short_text",
            "responseSchema": {"type": "string"},
            "content": draft,
        }

    def _guardian_activity_for_variant(self, draft: dict[str, Any]) -> dict[str, Any]:
        concept_id = draft.get("conceptId", "concept_unknown")
        variant_seed = draft.get("variantSeed") or f"{concept_id}_{uuid4().hex[:8]}"
        return {
            "id": f"activity_{concept_id}_{uuid4().hex[:8]}",
            "contentSourceType": "generated",
            "generatedVariantId": variant_seed,
            "prompt": draft.get("prompt", "Practice this concept."),
            "expectedResponseType": draft.get("expectedResponseType", "short_text"),
            "responseSchema": draft.get("responseSchema", {"type": "string"}),
            "content": draft,
        }


def _as_dict_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _strings(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


def _ttl_iso() -> str:
    return (datetime.now(UTC) + timedelta(days=14)).isoformat()


def _new_agent_run_id() -> str:
    return f"agentrun_{uuid4().hex[:24]}"
