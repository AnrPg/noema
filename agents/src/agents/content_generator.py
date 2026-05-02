"""Guardian-backed content generation and transformation agent."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Literal

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from .guardian_client import GuardianClient


class ContentGenerationRequest(BaseModel):
    mode: Literal["rag_grounded", "agent_autonomous"]
    concept_ids: list[str] = Field(alias="conceptIds")
    document_ids: list[str] = Field(default_factory=list, alias="documentIds")
    desired_card_types: list[str] = Field(default_factory=list, alias="desiredCardTypes")
    curriculum_context: dict[str, Any] = Field(default_factory=dict, alias="curriculumContext")
    student_context: dict[str, Any] = Field(default_factory=dict, alias="studentContext")
    budget: dict[str, Any] = Field(default_factory=dict)


class CardTransformRequest(BaseModel):
    card: dict[str, Any]
    transformation_kind: str = Field(alias="transformationKind")
    prompt: str | None = None


class ContentGenerationAgent:
    def __init__(self, guardian: GuardianClient) -> None:
        self._guardian = guardian

    async def generate(self, request: ContentGenerationRequest) -> dict[str, Any]:
        drafts = [self._draft_for_concept(request, concept_id) for concept_id in request.concept_ids]
        accepted: list[dict[str, Any]] = []
        rejected: list[dict[str, Any]] = []

        for draft in drafts:
            outcome = await self._guardian.validate_activity(draft)
            if outcome.accepted:
                draft["guardianValidationId"] = outcome.validation_id
                accepted.append(draft)
            else:
                rejected.append({"draft": draft, "reasons": outcome.reasons})

        return {
            "agentRunId": "agent_content_generation_draft",
            "cards": accepted,
            "rejectedDrafts": rejected,
            "costEstimate": {"units": len(drafts)},
        }

    async def transform(self, request: CardTransformRequest) -> dict[str, Any]:
        draft = {
            **request.card,
            "transformationKind": request.transformation_kind,
            "content": {
                **request.card.get("content", {}),
                "front": request.prompt or request.card.get("content", {}).get("front", ""),
            },
        }
        outcome = await self._guardian.validate_activity(draft)
        if not outcome.accepted:
            raise ValueError(f"Guardian rejected transformed card: {', '.join(outcome.reasons)}")
        draft["guardianValidationId"] = outcome.validation_id
        return {"agentRunId": "agent_content_transform_draft", "card": draft}

    def _draft_for_concept(
        self, request: ContentGenerationRequest, concept_id: str
    ) -> dict[str, Any]:
        card_type = request.desired_card_types[0] if request.desired_card_types else "definition"
        return {
            "cardType": card_type,
            "originMode": request.mode,
            "anchoredCkgNodeIds": [concept_id],
            "sourceDocumentIds": request.document_ids,
            "factualityScore": 0.8 if request.mode == "agent_autonomous" else None,
            "content": {
                "front": f"Explain the core idea behind {concept_id}.",
                "back": "Generated draft pending domain-specific grounding.",
            },
            "tags": ["generated"],
            "difficulty": "intermediate",
        }
