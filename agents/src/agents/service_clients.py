"""Shared MCP-aware service clients for cross-service agent composites and writes."""

from __future__ import annotations

import os
import time
from typing import Any, Protocol, cast

import httpx

from .telemetry import get_current_run_recorder


class ServiceError(RuntimeError):
    """Raised by service clients when a downstream call fails with a known HTTP status.

    Carrying status_code and kind lets composite tools classify errors without
    importing httpx or inspecting raw exception messages.
    """

    def __init__(self, message: str, *, status_code: int | None = None, kind: str = "unknown") -> None:
        super().__init__(message)
        self.status_code = status_code
        self.kind = kind  # "auth_error" | "not_found" | "validation_error" | "http_error" | "connection_error"


class ToolInvoker(Protocol):
    async def execute(
        self,
        service: str,
        tool: str,
        payload: dict[str, Any],
        *,
        user_id: str | None = None,
    ) -> dict[str, Any]:
        """Execute a tool on a downstream service."""


class ToolCatalogProvider(Protocol):
    async def list_tools(self, service: str) -> list[dict[str, Any]]:
        """List MCP tools exposed by a downstream service."""


class NoemaMcpServiceClient:
    """Thin async client for service MCP `/v1/tools/execute` endpoints."""

    def __init__(
        self,
        *,
        session_base_url: str | None = None,
        metacognition_base_url: str | None = None,
        scheduler_base_url: str | None = None,
        curriculum_base_url: str | None = None,
        knowledge_graph_base_url: str | None = None,
        content_base_url: str | None = None,
        ingestion_base_url: str | None = None,
        vector_base_url: str | None = None,
        pedagogy_guardian_base_url: str | None = None,
        token: str | None = None,
        timeout: float = 10.0,
    ) -> None:
        resolved_session_base_url = _resolved_url(
            session_base_url, "SESSION_SERVICE_URL", "http://localhost:3004"
        )
        resolved_metacognition_base_url = _resolved_url(
            metacognition_base_url, "METACOGNITION_SERVICE_URL", "http://localhost:3007"
        )
        resolved_scheduler_base_url = _resolved_url(
            scheduler_base_url, "SCHEDULER_SERVICE_URL", "http://localhost:3003"
        )
        resolved_curriculum_base_url = _resolved_url(
            curriculum_base_url, "CURRICULUM_SERVICE_URL", "http://localhost:3017"
        )
        resolved_knowledge_graph_base_url = _resolved_url(
            knowledge_graph_base_url, "KNOWLEDGE_GRAPH_SERVICE_URL", "http://localhost:3006"
        )
        resolved_content_base_url = _resolved_url(
            content_base_url, "CONTENT_SERVICE_URL", "http://localhost:3002"
        )
        resolved_ingestion_base_url = _resolved_url(
            ingestion_base_url, "INGESTION_SERVICE_URL", "http://localhost:3009"
        )
        resolved_vector_base_url = _resolved_url(
            vector_base_url, "VECTOR_SERVICE_URL", "http://localhost:3012"
        )
        resolved_pedagogy_guardian_base_url = _resolved_url(
            pedagogy_guardian_base_url,
            "PEDAGOGY_GUARDIAN_SERVICE_URL",
            "http://localhost:3016",
        )
        self._service_urls = {
            "session": resolved_session_base_url,
            "metacognition": resolved_metacognition_base_url,
            "scheduler": resolved_scheduler_base_url,
            "curriculum": resolved_curriculum_base_url,
            "knowledge-graph": resolved_knowledge_graph_base_url,
            "content": resolved_content_base_url,
            "ingestion": resolved_ingestion_base_url,
            "vector": resolved_vector_base_url,
            "pedagogy-guardian": resolved_pedagogy_guardian_base_url,
        }
        self._token = token or os.getenv("SERVICE_AUTH_TOKEN")
        self._timeout = timeout

    async def execute(
        self,
        service: str,
        tool: str,
        payload: dict[str, Any],
        *,
        user_id: str | None = None,
    ) -> dict[str, Any]:
        if service not in self._service_urls:
            raise ValueError(f"Unsupported service for composite tool execution: {service}")

        headers: dict[str, str] = {}
        if self._token:
            headers["authorization"] = f"Bearer {self._token}"
        if user_id:
            headers["x-user-id"] = user_id

        started_ms = time.perf_counter()
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            try:
                response = await client.post(
                    f"{self._service_urls[service]}/v1/tools/execute",
                    json={"tool": tool, "input": payload},
                    headers=headers,
                )
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                # knowledge-graph returns 422 when a concept reference cannot be resolved
                # (the entity doesn't exist), NOT because the request itself is malformed.
                # Reclassify as "not_found" so callers treat it as a missing-concept signal
                # rather than a hard validation failure.
                kg_unresolvable = service == "knowledge-graph" and status == 422
                kind = (
                    "auth_error" if status in (401, 403)
                    else "not_found" if status == 404 or kg_unresolvable
                    else "validation_error" if status == 422
                    else "http_error"
                )
                raise ServiceError(str(exc), status_code=status, kind=kind) from exc
            except httpx.ConnectError as exc:
                raise ServiceError(str(exc), kind="connection_error") from exc
            except httpx.TimeoutException as exc:
                raise ServiceError(str(exc), kind="timeout") from exc

        latency_ms = int((time.perf_counter() - started_ms) * 1000)
        body = cast("dict[str, Any]", response.json())
        result = cast("dict[str, Any]", body.get("data", {}))
        if not result.get("success", False):
            error = result.get("error", {})
            code = error.get("code", "TOOL_EXECUTION_FAILED")
            message = error.get("message", f"Tool {tool} failed on {service}")
            recorder = get_current_run_recorder()
            if recorder is not None:
                recorder.record_tool_call(
                    source_kind="mcp",
                    service=service,
                    tool_name=tool,
                    latency_ms=latency_ms,
                    success=False,
                    request_payload=payload,
                    response_payload=result,
                    error_message=f"{code}: {message}",
                )
            raise RuntimeError(f"{code}: {message}")
        data = cast("dict[str, Any]", result.get("data", {}))
        recorder = get_current_run_recorder()
        if recorder is not None:
            recorder.record_tool_call(
                source_kind="mcp",
                service=service,
                tool_name=tool,
                latency_ms=latency_ms,
                success=True,
                request_payload=payload,
                response_payload=data,
            )
        return data

    async def list_tools(
        self,
        service: str,
        *,
        user_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """List MCP-style tool definitions exposed by a downstream service."""

        if service not in self._service_urls:
            raise ValueError(f"Unsupported service for tool discovery: {service}")

        headers: dict[str, str] = {}
        if self._token:
            headers["authorization"] = f"Bearer {self._token}"
        if user_id:
            headers["x-user-id"] = user_id

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.get(f"{self._service_urls[service]}/v1/tools", headers=headers)
            response.raise_for_status()
            body = cast("dict[str, Any]", response.json())
        data = cast("dict[str, Any]", body.get("data", {}))
        tools = data.get("tools", [])
        return cast("list[dict[str, Any]]", tools if isinstance(tools, list) else [])


class NoemaArtifactPersistenceClient:
    """Thin async client for durable writes into owning domain services."""

    def __init__(
        self,
        *,
        content_base_url: str | None = None,
        session_base_url: str | None = None,
        curriculum_base_url: str | None = None,
        token: str | None = None,
        timeout: float = 15.0,
    ) -> None:
        self._content_base_url = _resolved_url(
            content_base_url, "CONTENT_SERVICE_URL", "http://localhost:3002"
        )
        self._session_base_url = _resolved_url(
            session_base_url, "SESSION_SERVICE_URL", "http://localhost:3004"
        )
        self._curriculum_base_url = _resolved_url(
            curriculum_base_url, "CURRICULUM_SERVICE_URL", "http://localhost:3017"
        )
        self._token = token or os.getenv("SERVICE_AUTH_TOKEN")
        self._timeout = timeout

    async def import_generated_content_batch(
        self,
        *,
        user_id: str,
        payload: dict[str, Any],
        correlation_id: str,
        idempotency_key: str,
    ) -> dict[str, Any]:
        return await self._post(
            f"{self._content_base_url}/v1/content/generation-jobs/import-result",
            user_id=user_id,
            body=payload,
            correlation_id=correlation_id,
            idempotency_key=idempotency_key,
        )

    async def create_lesson_plan(
        self,
        *,
        user_id: str,
        session_id: str,
        payload: dict[str, Any],
        correlation_id: str,
        idempotency_key: str,
    ) -> dict[str, Any]:
        return await self._post(
            f"{self._session_base_url}/v1/sessions/{session_id}/lesson-plan",
            user_id=user_id,
            body=payload,
            correlation_id=correlation_id,
            idempotency_key=idempotency_key,
        )

    async def import_curriculum_agent_result(
        self,
        *,
        user_id: str,
        payload: dict[str, Any],
        correlation_id: str,
        idempotency_key: str,
    ) -> dict[str, Any]:
        return await self._post(
            f"{self._curriculum_base_url}/v1/curricula/agent-results/import",
            user_id=user_id,
            body=payload,
            correlation_id=correlation_id,
            idempotency_key=idempotency_key,
        )

    async def _post(
        self,
        url: str,
        *,
        user_id: str,
        body: dict[str, Any],
        correlation_id: str,
        idempotency_key: str,
    ) -> dict[str, Any]:
        headers: dict[str, str] = {
            "x-user-id": user_id,
            "x-correlation-id": correlation_id,
            "x-idempotency-key": idempotency_key,
        }
        if self._token:
            headers["authorization"] = f"Bearer {self._token}"

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(url, json=body, headers=headers)
            response.raise_for_status()
            payload = cast("dict[str, Any]", response.json())
        return cast("dict[str, Any]", payload.get("data", payload))


def _resolved_url(explicit: str | None, env_key: str, default: str) -> str:
    value = explicit or os.getenv(env_key) or default
    return value.rstrip("/")
