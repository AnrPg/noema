"""OpenAI realtime adapter for direct JSON-producing calls."""

from __future__ import annotations

import json
import os

import httpx

from ..llm_router import ProviderBatchItemResult, ProviderBatchRequest


class OpenAIRealtimeAdapter:
    provider_name = "openai"

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: float = 30.0,
    ) -> None:
        self._api_key = api_key or os.getenv("OPENAI_API_KEY")
        self._base_url = (base_url or os.getenv("OPENAI_BASE_URL") or "https://api.openai.com").rstrip("/")
        self._timeout = timeout

    def _headers(self) -> dict[str, str]:
        if not self._api_key:
            raise RuntimeError("OPENAI_API_KEY is required for OpenAI realtime execution.")
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

    async def generate(self, request: ProviderBatchRequest) -> ProviderBatchItemResult:
        tools = [
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.input_schema,
                },
            }
            for tool in request.tools
        ]
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(
                f"{self._base_url}/v1/chat/completions",
                headers=self._headers(),
                json={
                    "model": request.model,
                    "response_format": {
                        "type": "json_schema",
                        "json_schema": {
                            "name": request.response_schema_name,
                            "schema": request.response_schema,
                        },
                    },
                    "messages": [
                        {"role": "system", "content": "\n".join(request.system_instructions)},
                        {"role": "user", "content": request.user_prompt},
                    ],
                    **({"tools": tools} if tools else {}),
                },
            )
            response.raise_for_status()
            body = response.json()
        content = body["choices"][0]["message"]["content"]
        output_json = json.loads(content)
        return ProviderBatchItemResult(
            custom_id=request.custom_id,
            status="completed",
            output_text=content,
            output_json=output_json,
            raw_response=body,
            usage=body.get("usage"),
            error=None,
        )
