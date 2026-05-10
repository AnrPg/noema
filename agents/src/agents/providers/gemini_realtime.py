"""Gemini realtime adapter for direct JSON-producing calls."""

from __future__ import annotations

import json
import os
from typing import Any

import httpx

from ..llm_router import ProviderBatchItemResult, ProviderBatchRequest


def _extract_candidate_text(response_body: dict[str, Any]) -> str:
    candidates = response_body.get("candidates", [])
    if not isinstance(candidates, list) or not candidates:
        raise ValueError("Gemini response did not contain candidates.")
    parts = candidates[0].get("content", {}).get("parts", [])
    if not isinstance(parts, list):
        raise ValueError("Gemini response candidate did not contain content parts.")
    text_parts = [part.get("text") for part in parts if isinstance(part, dict) and isinstance(part.get("text"), str)]
    if not text_parts:
        raise ValueError("Gemini response did not contain JSON text output.")
    return "\n".join(text_parts)


def _supports_structured_output_tools(model: str) -> bool:
    return model.lower().startswith("gemini-3")


class GeminiRealtimeAdapter:
    provider_name = "google"

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: float = 30.0,
    ) -> None:
        self._api_key = api_key or os.getenv("GEMINI_API_KEY")
        self._base_url = (
            base_url or os.getenv("GEMINI_BASE_URL") or "https://generativelanguage.googleapis.com/v1beta"
        ).rstrip("/")
        self._timeout = timeout

    def _headers(self) -> dict[str, str]:
        if not self._api_key:
            raise RuntimeError("GEMINI_API_KEY is required for Gemini realtime execution.")
        return {
            "x-goog-api-key": self._api_key,
            "Content-Type": "application/json",
        }

    async def generate(self, request: ProviderBatchRequest) -> ProviderBatchItemResult:
        tools = [
            {
                "function_declarations": [
                    {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.input_schema,
                    }
                ]
            }
            for tool in request.tools
        ]
        payload = {
            "systemInstruction": {"parts": [{"text": "\n".join(request.system_instructions)}]},
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": request.user_prompt}],
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseJsonSchema": request.response_schema,
            },
            **({"tools": tools} if tools and _supports_structured_output_tools(request.model) else {}),
        }
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(
                f"{self._base_url}/models/{request.model}:generateContent",
                headers=self._headers(),
                json=payload,
            )
            response.raise_for_status()
            body = response.json()
        output_text = _extract_candidate_text(body)
        return ProviderBatchItemResult(
            custom_id=request.custom_id,
            status="completed",
            output_text=output_text,
            output_json=json.loads(output_text),
            raw_response=body,
            usage=body.get("usageMetadata"),
            error=None,
        )
