"""OpenAI batch adapter backed by the official HTTP API."""

from __future__ import annotations

import json
import os
from typing import Any

import httpx

from ..llm_router import (
    ProviderBatchItemResult,
    ProviderBatchPollResult,
    ProviderBatchRequest,
    ProviderBatchResults,
    ProviderBatchSubmission,
)


def _extract_json_text(content: Any) -> str | None:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                text_value = item.get("text")
                if isinstance(text_value, str):
                    parts.append(text_value)
        return "\n".join(parts) if parts else None
    return None


class OpenAIBatchAdapter:
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
            raise RuntimeError("OPENAI_API_KEY is required for OpenAI batch execution.")
        return {"Authorization": f"Bearer {self._api_key}"}

    async def submit_batch(self, requests: list[ProviderBatchRequest]) -> ProviderBatchSubmission:
        if not requests:
            raise ValueError("OpenAI batch submission requires at least one request.")
        lines = []
        for request in requests:
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
            lines.append(
                json.dumps(
                    {
                        "custom_id": request.custom_id,
                        "method": "POST",
                        "url": "/v1/chat/completions",
                        "body": {
                            "model": request.model,
                            "response_format": {
                                "type": "json_schema",
                                "json_schema": {
                                    "name": request.response_schema_name,
                                    "schema": request.response_schema,
                                },
                            },
                            "messages": [
                                {
                                    "role": "system",
                                    "content": "\n".join(request.system_instructions),
                                },
                                {
                                    "role": "user",
                                    "content": request.user_prompt,
                                },
                            ],
                            **({"tools": tools} if tools else {}),
                        },
                    },
                    ensure_ascii=True,
                )
            )
        jsonl_payload = "\n".join(lines).encode("utf-8")
        headers = self._headers()
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            upload = await client.post(
                f"{self._base_url}/v1/files",
                headers=headers,
                data={"purpose": "batch"},
                files={"file": ("batch_input.jsonl", jsonl_payload, "application/jsonl")},
            )
            upload.raise_for_status()
            file_body = upload.json()
            create = await client.post(
                f"{self._base_url}/v1/batches",
                headers={**headers, "Content-Type": "application/json"},
                json={
                    "input_file_id": file_body["id"],
                    "endpoint": "/v1/chat/completions",
                    "completion_window": "24h",
                    "metadata": {
                        "agent_name": requests[0].agent_name,
                        "request_count": str(len(requests)),
                    },
                },
            )
            create.raise_for_status()
            batch_body = create.json()
        return ProviderBatchSubmission(
            provider_batch_id=str(batch_body["id"]),
            provider_status=str(batch_body.get("status", "validating")),
            raw_response=batch_body,
        )

    async def get_batch_status(self, provider_batch_id: str) -> ProviderBatchPollResult:
        headers = self._headers()
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.get(f"{self._base_url}/v1/batches/{provider_batch_id}", headers=headers)
            response.raise_for_status()
            body = response.json()
        raw_status = str(body.get("status", "unknown"))
        normalized = {
            "validating": "submitted",
            "in_progress": "running",
            "finalizing": "running",
            "completed": "completed",
            "failed": "failed",
            "expired": "failed",
            "cancelling": "running",
            "cancelled": "cancelled",
        }.get(raw_status, "submitted")
        return ProviderBatchPollResult(
            provider_batch_id=provider_batch_id,
            provider_status=raw_status,
            normalized_status=normalized,
            done=normalized in {"completed", "failed", "cancelled"},
            raw_response=body,
            error=body.get("errors"),
        )

    async def fetch_batch_results(self, provider_batch_id: str) -> ProviderBatchResults:
        headers = self._headers()
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            batch_response = await client.get(
                f"{self._base_url}/v1/batches/{provider_batch_id}",
                headers=headers,
            )
            batch_response.raise_for_status()
            batch_body = batch_response.json()
            results: dict[str, ProviderBatchItemResult] = {}
            for file_field in ("output_file_id", "error_file_id"):
                file_id = batch_body.get(file_field)
                if not file_id:
                    continue
                file_response = await client.get(
                    f"{self._base_url}/v1/files/{file_id}/content",
                    headers=headers,
                )
                file_response.raise_for_status()
                for line in file_response.text.splitlines():
                    if not line.strip():
                        continue
                    row = json.loads(line)
                    custom_id = str(row["custom_id"])
                    response_body = row.get("response", {}).get("body", {})
                    content = None
                    if isinstance(response_body, dict):
                        choices = response_body.get("choices", [])
                        if isinstance(choices, list) and choices:
                            content = choices[0].get("message", {}).get("content")
                    output_text = _extract_json_text(content)
                    output_json = None
                    if output_text:
                        try:
                            output_json = json.loads(output_text)
                        except json.JSONDecodeError:
                            output_json = None
                    error = row.get("error")
                    results[custom_id] = ProviderBatchItemResult(
                        custom_id=custom_id,
                        status="failed" if error else "completed",
                        output_text=output_text,
                        output_json=output_json,
                        raw_response=row,
                        usage=response_body.get("usage") if isinstance(response_body, dict) else None,
                        error=error,
                    )
        return ProviderBatchResults(
            provider_batch_id=provider_batch_id,
            provider_status=str(batch_body.get("status", "completed")),
            items=results,
            raw_response=batch_body,
        )

    async def cancel_batch(self, provider_batch_id: str) -> str:
        headers = self._headers()
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(
                f"{self._base_url}/v1/batches/{provider_batch_id}/cancel",
                headers=headers,
            )
            response.raise_for_status()
            body = response.json()
        return str(body.get("status", "cancelling"))
