from __future__ import annotations

import pytest

from src.agents.content_generator import ContentGenerationAgent, ContentGenerationRequest
from src.agents.guardian_client import GuardianOutcome
from src.agents.lesson_planner import LessonPlanGenerator, LessonPlanRequest


class AcceptingGuardian:
    async def validate_activity(self, payload: object) -> GuardianOutcome:
        return GuardianOutcome(accepted=True, validationId="guardian_activity_test", reasons=[])

    async def validate_lesson_plan(self, payload: object) -> GuardianOutcome:
        return GuardianOutcome(accepted=True, validationId="guardian_plan_test", reasons=[])


@pytest.mark.asyncio
async def test_content_generation_calls_guardian() -> None:
    agent = ContentGenerationAgent(AcceptingGuardian())
    result = await agent.generate(
        ContentGenerationRequest(
            mode="agent_autonomous",
            conceptIds=["concept_linear_equations"],
            desiredCardTypes=["definition"],
        )
    )

    assert result["cards"][0]["guardianValidationId"] == "guardian_activity_test"
    assert result["cards"][0]["anchoredCkgNodeIds"] == ["concept_linear_equations"]


@pytest.mark.asyncio
async def test_lesson_plan_requires_selected_curriculum_node() -> None:
    agent = LessonPlanGenerator(AcceptingGuardian())

    with pytest.raises(ValueError, match="selected node"):
        await agent.generate(
            LessonPlanRequest(
                sessionId="session_1",
                userId="usr_1",
                curriculumId="curr_1",
                selectedNodeIds=[],
                selectedCardIds=["card_1"],
            )
        )


@pytest.mark.asyncio
async def test_lesson_plan_validates_with_guardian() -> None:
    agent = LessonPlanGenerator(AcceptingGuardian())
    plan = await agent.generate(
        LessonPlanRequest(
            sessionId="session_1",
            userId="usr_1",
            curriculumId="curr_1",
            selectedNodeIds=["cnode_1"],
            selectedCardIds=["card_1"],
        )
    )

    assert plan["guardianValidationId"] == "guardian_plan_test"
    assert plan["selectedNodeIds"] == ["cnode_1"]
