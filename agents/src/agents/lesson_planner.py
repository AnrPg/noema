"""Guardian-backed LessonPlan generator for Batch 11."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from .guardian_client import GuardianClient


class LessonPlanRequest(BaseModel):
    session_id: str = Field(alias="sessionId")
    user_id: str = Field(alias="userId")
    curriculum_id: str | None = Field(default=None, alias="curriculumId")
    curriculum_version_id: str | None = Field(default=None, alias="curriculumVersionId")
    selected_node_ids: list[str] = Field(default_factory=list, alias="selectedNodeIds")
    selected_card_ids: list[str] = Field(default_factory=list, alias="selectedCardIds")
    context: dict[str, Any] = Field(default_factory=dict)


class LessonPlanGenerator:
    def __init__(self, guardian: GuardianClient) -> None:
        self._guardian = guardian

    async def generate(self, request: LessonPlanRequest) -> dict[str, Any]:
        if request.curriculum_id and not request.selected_node_ids:
            raise ValueError("Curriculum-bound LessonPlans require at least one selected node")

        lesson_plan = {
            "sessionId": request.session_id,
            "userId": request.user_id,
            "curriculumId": request.curriculum_id,
            "curriculumVersionId": request.curriculum_version_id,
            "selectedNodeIds": request.selected_node_ids,
            "goals": [
                {
                    "title": "Serve selected curriculum frontier",
                    "targetNodeIds": request.selected_node_ids,
                    "source": "system_proposed",
                }
            ],
            "steps": [
                {
                    "ordinal": index + 1,
                    "targetNodeIds": request.selected_node_ids[:1],
                    "activity": {
                        "contentSourceType": "card",
                        "cardId": card_id,
                        "renderPayload": {},
                    },
                }
                for index, card_id in enumerate(request.selected_card_ids)
            ],
        }

        outcome = await self._guardian.validate_lesson_plan(lesson_plan)
        if not outcome.accepted:
            raise ValueError(f"Guardian rejected LessonPlan: {', '.join(outcome.reasons)}")
        lesson_plan["guardianValidationId"] = outcome.validation_id
        return lesson_plan
