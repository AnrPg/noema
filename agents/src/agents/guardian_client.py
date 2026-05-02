"""HTTP port for Pedagogy Guardian validation."""

from __future__ import annotations

from typing import Any

import httpx
from pydantic import BaseModel, Field


class GuardianOutcome(BaseModel):
    accepted: bool = Field(default=True)
    validation_id: str | None = Field(default=None, alias="validationId")
    reasons: list[str] = Field(default_factory=list)


class GuardianClient:
    def __init__(self, base_url: str, token: str | None = None) -> None:
        self._base_url = base_url.rstrip("/")
        self._token = token

    async def validate_lesson_plan(self, lesson_plan: dict[str, Any]) -> GuardianOutcome:
        return await self._post("/v1/guardian/lesson-plans/validate", {"lessonPlan": lesson_plan})

    async def validate_activity(self, activity: dict[str, Any]) -> GuardianOutcome:
        return await self._post("/v1/guardian/activities/validate", {"activity": activity})

    async def _post(self, path: str, payload: dict[str, Any]) -> GuardianOutcome:
        headers = {"authorization": f"Bearer {self._token}"} if self._token else {}
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(f"{self._base_url}{path}", json=payload, headers=headers)
            response.raise_for_status()
        body = response.json()
        data = body.get("data", body)
        return GuardianOutcome.model_validate(data)
