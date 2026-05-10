"""Gemini batch adapter — executes via concurrent generateContent calls.

Google AI Studio (generativelanguage.googleapis.com) has no batchGenerateContent
endpoint. Jobs are executed inline during submit_batch using asyncio.gather and
results are held in instance memory until fetch_batch_results drains them.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
import uuid
from typing import Any

import httpx

from ..model_registry import model_provider
from ..llm_router import (
    ProviderBatchItemResult,
    ProviderBatchPollResult,
    ProviderBatchRequest,
    ProviderBatchResults,
    ProviderBatchSubmission,
)

_INLINE_PREFIX = "local-gemini-"


def _extract_candidate_text(response: dict[str, Any]) -> str | None:
    candidates = response.get("candidates", [])
    if not isinstance(candidates, list) or not candidates:
        return None
    parts = candidates[0].get("content", {}).get("parts", [])
    if not isinstance(parts, list):
        return None
    text_parts = [part.get("text") for part in parts if isinstance(part, dict) and isinstance(part.get("text"), str)]
    return "\n".join(text_parts) if text_parts else None


def _supports_structured_output_tools(model: str) -> bool:
    return model.lower().startswith("gemini-3")


class GeminiBatchAdapter:
    provider_name = "google"

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: float = 120.0,
    ) -> None:
        self._api_key = api_key or os.getenv("GEMINI_API_KEY")
        self._base_url = (
            base_url or os.getenv("GEMINI_BASE_URL") or "https://generativelanguage.googleapis.com/v1beta"
        ).rstrip("/")
        self._timeout = timeout
        self._inline_results: dict[str, list[ProviderBatchItemResult]] = {}

    def _headers(self) -> dict[str, str]:
        if not self._api_key:
            raise RuntimeError("GEMINI_API_KEY is required for Gemini batch execution.")
        return {
            "x-goog-api-key": self._api_key,
            "Content-Type": "application/json",
        }

    async def _post_generate(self, request: ProviderBatchRequest) -> ProviderBatchItemResult:
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
        payload: dict[str, Any] = {
            "systemInstruction": {"parts": [{"text": "\n".join(request.system_instructions)}]},
            "contents": [{"role": "user", "parts": [{"text": request.user_prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseJsonSchema": request.response_schema,
            },
        }
        if tools and _supports_structured_output_tools(request.model):
            payload["tools"] = tools
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(
                f"{self._base_url}/models/{request.model}:generateContent",
                headers=self._headers(),
                json=payload,
            )
            response.raise_for_status()
            body = response.json()
        output_text = _extract_candidate_text(body)
        output_json: dict[str, Any] | None = None
        if output_text:
            with contextlib.suppress(json.JSONDecodeError):
                output_json = json.loads(output_text)
        return ProviderBatchItemResult(
            custom_id=request.custom_id,
            status="completed",
            output_text=output_text,
            output_json=output_json,
            raw_response=body,
            usage=body.get("usageMetadata"),
            error=None,
        )

    async def _generate_one(self, request: ProviderBatchRequest) -> ProviderBatchItemResult:
        try:
            return await self._post_generate(request)
        except httpx.HTTPStatusError as error:
            fallback_model = request.metadata.get("fallbackModel")
            fallback_provider = request.metadata.get("fallbackProvider")
            if (
                error.response.status_code not in {429, 503, 504}
                or not isinstance(fallback_model, str)
                or fallback_model.strip() == ""
                or not isinstance(fallback_provider, str)
                or fallback_provider != self.provider_name
                or model_provider(fallback_model) != self.provider_name
                or fallback_model == request.model
            ):
                raise
            fallback_request = ProviderBatchRequest(
                custom_id=request.custom_id,
                agent_name=request.agent_name,
                provider=request.provider,
                model=fallback_model,
                system_instructions=request.system_instructions,
                user_prompt=request.user_prompt,
                response_schema_name=request.response_schema_name,
                response_schema=request.response_schema,
                metadata={
                    **request.metadata,
                    "fallbackFromProvider": request.provider,
                    "fallbackFromModel": request.model,
                    "fallbackReason": f"HTTP {error.response.status_code}",
                },
                tools=request.tools,
            )
            return await self._post_generate(fallback_request)

    async def submit_batch(self, requests: list[ProviderBatchRequest]) -> ProviderBatchSubmission:
        if not requests:
            raise ValueError("Gemini batch submission requires at least one request.")

        raw_results = await asyncio.gather(
            *[self._generate_one(req) for req in requests],
            return_exceptions=True,
        )

        items: list[ProviderBatchItemResult] = []
        for req, result in zip(requests, raw_results, strict=True):
            if isinstance(result, Exception):
                if isinstance(result, httpx.HTTPStatusError):
                    status_code = result.response.status_code
                    error_message = (
                        f"Provider request failed with HTTP {status_code}: "
                        f"{result.response.text.strip() or result.response.reason_phrase}"
                    )
                    error_payload = {
                        "message": error_message,
                        "statusCode": status_code,
                        "code": "RATE_LIMITED" if status_code == 429 else "PROVIDER_HTTP_ERROR",
                        "retryable": status_code in {429, 503, 504},
                    }
                else:
                    error_payload = {"message": str(result)}
                items.append(ProviderBatchItemResult(
                    custom_id=req.custom_id,
                    status="failed",
                    output_text=None,
                    output_json=None,
                    raw_response={},
                    error=error_payload,
                ))
            else:
                items.append(result)

        batch_id = f"{_INLINE_PREFIX}{uuid.uuid4().hex}"
        self._inline_results[batch_id] = items
        inline_results_for_storage = {
            item.custom_id: {
                "status": item.status,
                "outputText": item.output_text,
                "outputJson": item.output_json,
                "usage": item.usage,
                "error": item.error,
                "rawResponse": item.raw_response,
            }
            for item in items
        }
        return ProviderBatchSubmission(
            provider_batch_id=batch_id,
            provider_status="JOB_STATE_SUBMITTED",
            raw_response={
                "batchId": batch_id,
                "itemCount": len(items),
                "__inline_results": inline_results_for_storage,
            },
        )

    async def get_batch_status(self, provider_batch_id: str) -> ProviderBatchPollResult:
        if provider_batch_id.startswith(_INLINE_PREFIX):
            done = provider_batch_id in self._inline_results
            return ProviderBatchPollResult(
                provider_batch_id=provider_batch_id,
                provider_status="JOB_STATE_SUCCEEDED" if done else "JOB_STATE_FAILED",
                normalized_status="completed" if done else "failed",
                done=True,
                raw_response={"batchId": provider_batch_id},
            )
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.get(
                f"{self._base_url}/{provider_batch_id}",
                headers=self._headers(),
            )
            response.raise_for_status()
            body = response.json()
        provider_status = str(body.get("metadata", {}).get("state") or body.get("state") or "JOB_STATE_QUEUED")
        normalized = {
            "JOB_STATE_PENDING": "submitted",
            "JOB_STATE_QUEUED": "submitted",
            "JOB_STATE_RUNNING": "running",
            "JOB_STATE_SUCCEEDED": "completed",
            "JOB_STATE_FAILED": "failed",
            "JOB_STATE_CANCELLED": "cancelled",
            "JOB_STATE_EXPIRED": "failed",
        }.get(provider_status, "submitted")
        return ProviderBatchPollResult(
            provider_batch_id=provider_batch_id,
            provider_status=provider_status,
            normalized_status=normalized,
            done=normalized in {"completed", "failed", "cancelled"},
            raw_response=body,
            error=body.get("error"),
        )

    async def fetch_batch_results(self, provider_batch_id: str) -> ProviderBatchResults:
        if provider_batch_id.startswith(_INLINE_PREFIX):
            items = self._inline_results.pop(provider_batch_id, [])
            return ProviderBatchResults(
                provider_batch_id=provider_batch_id,
                provider_status="JOB_STATE_SUCCEEDED",
                items={item.custom_id: item for item in items},
                raw_response={"batchId": provider_batch_id},
            )
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.get(
                f"{self._base_url}/{provider_batch_id}",
                headers=self._headers(),
            )
            response.raise_for_status()
            body = response.json()
        response_body = body.get("response", {})
        results: dict[str, ProviderBatchItemResult] = {}
        for inline_response in response_body.get("inlinedResponses", []):
            if not isinstance(inline_response, dict):
                continue
            metadata = inline_response.get("metadata", {})
            custom_id = str(metadata.get("key"))
            error = inline_response.get("error")
            response_payload = inline_response.get("response", {})
            output_text = _extract_candidate_text(response_payload) if isinstance(response_payload, dict) else None
            output_json = None
            if output_text:
                with contextlib.suppress(json.JSONDecodeError):
                    output_json = json.loads(output_text)
            results[custom_id] = ProviderBatchItemResult(
                custom_id=custom_id,
                status="failed" if error else "completed",
                output_text=output_text,
                output_json=output_json,
                raw_response=inline_response,
                usage=response_payload.get("usageMetadata") if isinstance(response_payload, dict) else None,
                error=error,
            )
        return ProviderBatchResults(
            provider_batch_id=provider_batch_id,
            provider_status=str(body.get("metadata", {}).get("state") or body.get("state") or "JOB_STATE_SUCCEEDED"),
            items=results,
            raw_response=body,
        )

    async def cancel_batch(self, provider_batch_id: str) -> str:
        if provider_batch_id.startswith(_INLINE_PREFIX):
            self._inline_results.pop(provider_batch_id, None)
            return "JOB_STATE_CANCELLED"
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(
                f"{self._base_url}/{provider_batch_id}:cancel",
                headers=self._headers(),
            )
            response.raise_for_status()
            body = response.json()
        return str(body.get("metadata", {}).get("state") or body.get("state") or "JOB_STATE_CANCELLED")
