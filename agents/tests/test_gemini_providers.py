from __future__ import annotations

from typing import Any, ClassVar

import httpx
import pytest

from src.agents.llm_router import ProviderBatchRequest, ProviderToolDefinition
from src.agents.providers import gemini_batch, gemini_realtime


class CapturingAsyncClient:
    captured_payloads: ClassVar[list[dict[str, Any]]] = []

    def __init__(self, *args: object, **kwargs: object) -> None:
        pass

    async def __aenter__(self) -> CapturingAsyncClient:
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def post(
        self,
        url: str,
        *,
        headers: dict[str, str],
        json: dict[str, Any],
    ) -> httpx.Response:
        self.captured_payloads.append(json)
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "text": (
                                        '{"cards":[],"activityVariants":[],'
                                        '"groundingReport":{},"coveragePlan":{}}'
                                    )
                                }
                            ]
                        }
                    }
                ],
                "usageMetadata": {},
            },
            request=httpx.Request("POST", url, headers=headers),
        )


def provider_request() -> ProviderBatchRequest:
    return ProviderBatchRequest(
        custom_id="run_1",
        agent_name="content-creator-agent",
        provider="google",
        model="gemini-2.5-flash",
        system_instructions=["Return JSON."],
        user_prompt="Generate content.",
        response_schema_name="content_creator_result",
        response_schema={
            "type": "object",
            "additionalProperties": False,
            "properties": {"cards": {"type": "array", "items": {"type": "object"}}},
        },
        metadata={},
    )


def provider_request_with_tool() -> ProviderBatchRequest:
    request = provider_request()
    request.tools.append(
        ProviderToolDefinition(
            name="content_query_cards",
            description="Query content cards.",
            input_schema={"type": "object"},
            service="content-service",
            side_effects=False,
        )
    )
    return request


@pytest.mark.asyncio
async def test_gemini_realtime_uses_json_schema_generation_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    CapturingAsyncClient.captured_payloads = []
    monkeypatch.setattr(gemini_realtime.httpx, "AsyncClient", CapturingAsyncClient)

    adapter = gemini_realtime.GeminiRealtimeAdapter(api_key="test_key")
    await adapter.generate(provider_request())

    payload = CapturingAsyncClient.captured_payloads[0]
    assert "generation_config" not in payload
    assert payload["generationConfig"]["responseMimeType"] == "application/json"
    assert payload["generationConfig"]["responseJsonSchema"]["additionalProperties"] is False


@pytest.mark.asyncio
async def test_gemini_realtime_omits_tools_for_gemini_25_structured_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    CapturingAsyncClient.captured_payloads = []
    monkeypatch.setattr(gemini_realtime.httpx, "AsyncClient", CapturingAsyncClient)

    adapter = gemini_realtime.GeminiRealtimeAdapter(api_key="test_key")
    await adapter.generate(provider_request_with_tool())

    payload = CapturingAsyncClient.captured_payloads[0]
    assert "tools" not in payload


@pytest.mark.asyncio
async def test_gemini_batch_uses_json_schema_generation_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    CapturingAsyncClient.captured_payloads = []
    monkeypatch.setattr(gemini_batch.httpx, "AsyncClient", CapturingAsyncClient)

    adapter = gemini_batch.GeminiBatchAdapter(api_key="test_key")
    await adapter.submit_batch([provider_request()])

    payload = CapturingAsyncClient.captured_payloads[0]
    assert "generation_config" not in payload
    assert payload["generationConfig"]["responseMimeType"] == "application/json"
    assert payload["generationConfig"]["responseJsonSchema"]["additionalProperties"] is False


@pytest.mark.asyncio
async def test_gemini_batch_omits_tools_for_gemini_25_structured_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    CapturingAsyncClient.captured_payloads = []
    monkeypatch.setattr(gemini_batch.httpx, "AsyncClient", CapturingAsyncClient)

    adapter = gemini_batch.GeminiBatchAdapter(api_key="test_key")
    await adapter.submit_batch([provider_request_with_tool()])

    payload = CapturingAsyncClient.captured_payloads[0]
    assert "tools" not in payload
