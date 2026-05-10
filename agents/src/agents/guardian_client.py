"""HTTP port for Pedagogy Guardian validation."""

from __future__ import annotations

from typing import Any

import httpx
from pydantic import BaseModel, Field


class GuardianOutcome(BaseModel):
    accepted: bool = Field(default=True)
    blocking: bool = Field(default=False)
    validation_id: str | None = Field(default=None, alias="validationId")
    reasons: list[str] = Field(default_factory=list)
    reason_codes: list[str] = Field(default_factory=list, alias="reasonCodes")


class GuardianClient:
    def __init__(self, base_url: str, token: str | None = None) -> None:
        self._base_url = base_url.rstrip("/")
        self._token = token

    async def validate_lesson_plan(self, lesson_plan: dict[str, Any]) -> GuardianOutcome:
        return await self._post("/v1/validate/lesson-plan", lesson_plan)

    async def validate_activity(self, activity: dict[str, Any]) -> GuardianOutcome:
        return await self._post("/v1/validate/activity", {"activity": activity})

    async def validate_replan(self, replan: dict[str, Any]) -> GuardianOutcome:
        return await self._post("/v1/validate/replan", replan)

    async def validate_step(self, step: dict[str, Any]) -> GuardianOutcome:
        return await self._post("/v1/validate/step", step)

    async def validate_coaching_artifact(self, artifact: dict[str, Any]) -> GuardianOutcome:
        activity = {
            "id": str(artifact.get("id") or artifact.get("artifactId") or "calibration_coaching_artifact"),
            "contentSourceType": "generated",
            "generatedVariantId": str(artifact.get("id") or artifact.get("artifactId") or "calibration_coaching_artifact"),
            "prompt": str(artifact.get("learnerFacingText") or artifact.get("summary") or ""),
            "expectedResponseType": "reflection",
            "responseSchema": {"type": "string"},
            "content": artifact,
        }
        return await self._post(
            "/v1/validate/activity",
            {"activity": activity, "triggeredBy": str(artifact.get("triggeredBy") or "calibration-coach")},
        )

    async def _post(self, path: str, payload: dict[str, Any]) -> GuardianOutcome:
        headers = {"authorization": f"Bearer {self._token}"} if self._token else {}
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(f"{self._base_url}{path}", json=payload, headers=headers)
            response.raise_for_status()
        body = response.json()
        data = body.get("data", body)
        outcome = GuardianOutcome.model_validate(data)
        return outcome.model_copy(
            update={
                "accepted": not outcome.blocking,
                "reasons": outcome.reasons or outcome.reason_codes,
            }
        )
