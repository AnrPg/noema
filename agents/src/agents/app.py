"""HTTP entrypoint for Batch 11 curriculum and content agents."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, Any

import httpx
from dotenv import load_dotenv

_AGENTS_ENV_PATH = Path(__file__).resolve().parents[2] / ".env.local"
load_dotenv(dotenv_path=_AGENTS_ENV_PATH)

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse
from pydantic import BaseModel, Field

from .agent_runtime import AgentRunRequest, AgentRuntime, UserFacingAgentError
from .batch_jobs import BatchJobStore, build_batch_job_store
from .batch_worker import BatchJobCancellationError, BatchWorker, ServiceArtifactPersister
from .composite_tools import CompositeToolRegistry
from .content_creator import ContentCreatorAgent, ContentTransformRequest
from .guardian_client import GuardianClient
from .lesson_planner import LessonPlanGenerator, LessonPlanRequest
from .llm_router import LLMRouter
from .outbox_dispatcher import OutboxDispatcher
from .providers import (
    GeminiBatchAdapter,
    GeminiRealtimeAdapter,
    OpenAIBatchAdapter,
    OpenAIRealtimeAdapter,
)
from .service_clients import NoemaArtifactPersistenceClient, NoemaMcpServiceClient
from .telemetry import AgentTelemetryStore

if TYPE_CHECKING:
    from collections.abc import AsyncIterator


class ContentGenerateEnvelope(BaseModel):
    job: dict[str, Any]


class ContentTransformEnvelope(BaseModel):
    parent_card_id: str | None = Field(default=None, alias="parentCardId")
    prompt: str | None = None
    transformation_kind: str = Field(default="recall", alias="transformationKind")
    target_card_type: str | None = Field(default=None, alias="targetCardType")
    card: dict[str, Any] = Field(default_factory=dict)


class CurriculumDraftEnvelope(BaseModel):
    goal: str | None = None
    concept_ids: list[str] = Field(default_factory=list, alias="conceptIds")
    document_ids: list[str] = Field(default_factory=list, alias="documentIds")
    study_mode: str | None = Field(default=None, alias="studyMode")
    target_horizon: str | None = Field(default=None, alias="targetHorizon")
    difficulty_preference: str | None = Field(default=None, alias="difficultyPreference")
    pacing: str | None = None
    execution_preference: str = Field(default="auto", alias="executionPreference")


class CurriculumOutlineEnvelope(BaseModel):
    goal: str
    domain: str | None = None
    study_mode: str | None = Field(default=None, alias="studyMode")
    execution_preference: str = Field(default="auto", alias="executionPreference")


class CurriculumReviseEnvelope(BaseModel):
    curriculum_id: str = Field(alias="curriculumId")
    curriculum_version_id: str = Field(default="", alias="curriculumVersionId")
    current_nodes: list[dict[str, Any]] = Field(default_factory=list, alias="currentNodes")
    current_edges: list[dict[str, Any]] = Field(default_factory=list, alias="currentEdges")
    progress: dict[str, Any] = Field(default_factory=dict)
    revision_reason: str = Field(default="evidence_based_update", alias="revisionReason")
    evidence: dict[str, Any] = Field(default_factory=dict)
    execution_preference: str = Field(default="auto", alias="executionPreference")


class KnowledgeGraphProposeEnvelope(BaseModel):
    concept_ids: list[str] = Field(default_factory=list, alias="conceptIds")
    document_ids: list[str] = Field(default_factory=list, alias="documentIds")
    operation_name: str | None = Field(default=None, alias="operationName")
    proposal_type: str = Field(default="anchor", alias="proposalType")
    domain: str | None = None
    study_mode: str | None = Field(default=None, alias="studyMode")
    candidate_labels: list[str] = Field(default_factory=list, alias="candidateLabels")
    execution_preference: str = Field(default="auto", alias="executionPreference")


class IngestionExtractEnvelope(BaseModel):
    document_id: str = Field(alias="documentId")
    ingestion_job_id: str | None = Field(default=None, alias="ingestionJobId")
    intent: str = "both"
    curriculum_id: str | None = Field(default=None, alias="curriculumId")
    study_mode: str | None = Field(default=None, alias="studyMode")
    document: dict[str, Any] = Field(default_factory=dict)
    ir: dict[str, Any] = Field(default_factory=dict)
    chunks: list[dict[str, Any]] = Field(default_factory=list)
    scan_windows: list[dict[str, Any]] = Field(default_factory=list, alias="scanWindows")
    retrieval_seed: list[dict[str, Any]] = Field(default_factory=list, alias="retrievalSeed")
    execution_preference: str = Field(default="auto", alias="executionPreference")


class CompositeToolExecutionEnvelope(BaseModel):
    tool: str
    input: dict[str, Any] = Field(default_factory=dict)


class AgentConfigEnvelope(BaseModel):
    actor_user_id: str = Field(alias="actorUserId")
    notes: str | None = None
    wrapper: dict[str, Any]
    tool_belt: dict[str, Any] = Field(alias="toolBelt")


_fastapi_app = FastAPI(title="Noema Agents", version="0.1.0")
app: Any = _fastapi_app

_CORS_ALLOW_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3100",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
    "http://127.0.0.1:3100",
]

_batch_loop_task: asyncio.Task[None] | None = None
logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def guardian() -> GuardianClient:
    return GuardianClient(
        os.getenv("PEDAGOGY_GUARDIAN_SERVICE_URL", "http://localhost:3016"),
        os.getenv("SERVICE_AUTH_TOKEN"),
    )


@lru_cache(maxsize=1)
def composite_registry() -> CompositeToolRegistry:
    return CompositeToolRegistry(NoemaMcpServiceClient())


@lru_cache(maxsize=1)
def telemetry_store() -> AgentTelemetryStore:
    return AgentTelemetryStore()


@lru_cache(maxsize=1)
def batch_job_store() -> BatchJobStore:
    return build_batch_job_store()


@lru_cache(maxsize=1)
def llm_router() -> LLMRouter:
    return LLMRouter(
        batch_store=batch_job_store(),
        batch_adapters={
            "google": GeminiBatchAdapter(),
            "openai": OpenAIBatchAdapter(),
        },
        realtime_adapters={
            "google": GeminiRealtimeAdapter(),
            "openai": OpenAIRealtimeAdapter(),
        },
    )


@lru_cache(maxsize=1)
def batch_worker() -> BatchWorker:
    runtime = agent_runtime()
    wrappers = runtime._runtime_state()[1]
    return BatchWorker(
        batch_store=batch_job_store(),
        router=llm_router(),
        guardian=guardian(),
        wrappers=wrappers,
        artifact_persister=ServiceArtifactPersister(
            NoemaArtifactPersistenceClient(),
            mcp_client=NoemaMcpServiceClient(),
        ),
    )


@lru_cache(maxsize=1)
def outbox_dispatcher() -> OutboxDispatcher:
    return OutboxDispatcher(batch_store=batch_job_store())


def agent_runtime() -> AgentRuntime:
    return AgentRuntime(
        composite_registry(),
        guardian(),
        telemetry_store(),
        batch_store=batch_job_store(),
        llm_router=llm_router(),
    )


@app.on_event("startup")
async def startup_event() -> None:
    await batch_job_store().initialize()
    global _batch_loop_task
    if os.getenv("AGENTS_BATCH_BACKGROUND_WORKERS_ENABLED", "1") == "1":
        _batch_loop_task = asyncio.create_task(_batch_loop())


@app.on_event("shutdown")
async def shutdown_event() -> None:
    global _batch_loop_task
    if _batch_loop_task is not None:
        _batch_loop_task.cancel()
        try:
            await _batch_loop_task
        except asyncio.CancelledError:
            pass
        _batch_loop_task = None


async def _batch_loop() -> None:
    interval_seconds = max(5, int(os.getenv("AGENTS_BATCH_WORKER_INTERVAL_SECONDS", "30")))
    while True:
        try:
            await batch_worker().run_submission_cycle(limit=100)
            await batch_worker().run_polling_cycle(limit=100)
            await batch_worker().run_finalization_cycle(limit=100)
            await outbox_dispatcher().dispatch_pending(limit=100)
        except Exception:
            logger.exception("Agent batch loop iteration failed")
        await asyncio.sleep(interval_seconds)


def _ensure_agent_configs_bootstrapped() -> None:
    _ = agent_runtime().list_wrappers()


def _provider_error_detail(error: httpx.HTTPStatusError) -> str:
    try:
        body = error.response.json()
    except ValueError:
        body = None
    provider_message = None
    if isinstance(body, dict):
        raw_error = body.get("error")
        if isinstance(raw_error, dict) and isinstance(raw_error.get("message"), str):
            provider_message = raw_error["message"]
    if provider_message is None:
        provider_message = error.response.text.strip() or error.response.reason_phrase
    return f"Provider request failed with HTTP {error.response.status_code}: {provider_message}"


def _raise_provider_http_exception(error: httpx.HTTPStatusError) -> None:
    provider_status = error.response.status_code
    status_code = 503 if provider_status in {429, 503, 504} else 502
    raise HTTPException(status_code=status_code, detail=_provider_error_detail(error)) from error


def _raise_user_facing_agent_http_exception(error: UserFacingAgentError) -> None:
    raise HTTPException(status_code=error.status_code, detail=error.payload) from error


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/tools")
async def list_composite_tools() -> dict[str, Any]:
    definitions = composite_registry().list_definitions()
    return {
        "data": {
            "tools": definitions,
            "count": len(definitions),
        }
    }


@app.post("/v1/tools/execute")
async def execute_composite_tool(
    envelope: CompositeToolExecutionEnvelope,
    x_user_id: str = Header(default="user_devuser00000000000000"),
) -> dict[str, Any]:
    result = await composite_registry().execute(envelope.tool, envelope.input, x_user_id)
    return {
        "data": {
            "success": True,
            "data": result,
        }
    }


@app.get("/v1/agents")
async def list_agents() -> dict[str, Any]:
    wrappers = agent_runtime().list_wrappers()
    return {"data": {"agents": wrappers, "count": len(wrappers)}}


@app.get("/v1/agents/{agent_name}")
async def get_agent(agent_name: str) -> dict[str, Any]:
    try:
        wrapper = agent_runtime().get_wrapper(agent_name)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown agent wrapper: {agent_name}") from error
    return {"data": wrapper}


@app.post("/v1/agents/{agent_name}/preflight")
async def preflight_agent(agent_name: str, request: AgentRunRequest) -> dict[str, Any]:
    try:
        result = agent_runtime().preflight(agent_name, request)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown agent wrapper: {agent_name}") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"data": result}


@app.post("/v1/agents/{agent_name}/run")
async def run_agent(agent_name: str, request: AgentRunRequest) -> dict[str, Any]:
    try:
        result = await agent_runtime().run(agent_name, request)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown agent wrapper: {agent_name}") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except UserFacingAgentError as error:
        _raise_user_facing_agent_http_exception(error)
    except httpx.HTTPStatusError as error:
        _raise_provider_http_exception(error)
    return {"data": result}


@app.post("/v1/agents/{agent_name}/run-async")
async def run_agent_async(agent_name: str, request: AgentRunRequest) -> dict[str, Any]:
    try:
        result = await agent_runtime().run_async(agent_name, request)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown agent wrapper: {agent_name}") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except UserFacingAgentError as error:
        _raise_user_facing_agent_http_exception(error)
    except httpx.HTTPStatusError as error:
        _raise_provider_http_exception(error)
    return {"data": result}


@app.get("/v1/batch-jobs/{job_id}")
async def get_batch_job(job_id: str) -> dict[str, Any]:
    try:
        job = await batch_job_store().get_job(job_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown batch job: {job_id}") from error
    attempts = await batch_job_store().list_attempts_for_job(job_id)
    events = await batch_job_store().list_outbox_events_for_job(job_id)
    return {
        "data": {
            "job": _job_payload(job),
            "attempts": [_attempt_payload(item) for item in attempts],
            "events": [_event_payload(item) for item in events],
        }
    }


@app.get("/v1/batch-jobs")
async def list_batch_jobs(
    status: str | None = Query(default=None),
    agent_name: str | None = Query(default=None, alias="agentName"),
    provider: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
) -> dict[str, Any]:
    jobs = await batch_job_store().list_jobs(
        status=status,
        agent_name=agent_name,
        provider=provider,
        limit=limit,
    )
    return {"data": {"items": [_job_payload(job) for job in jobs], "count": len(jobs)}}


@app.post("/v1/batch-jobs/{job_id}/cancel")
async def cancel_batch_job(job_id: str) -> dict[str, Any]:
    try:
        job = await batch_worker().cancel_job(job_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown batch job: {job_id}") from error
    except BatchJobCancellationError as error:
        raise HTTPException(
            status_code=409,
            detail={
                "message": str(error),
                "reason": error.reason,
                "cancellationWindow": "none",
            },
        ) from error
    attempts = await batch_job_store().list_attempts_for_job(job_id)
    events = await batch_job_store().list_outbox_events_for_job(job_id)
    return {
        "data": {
            "job": _job_payload(job),
            "attempts": [_attempt_payload(item) for item in attempts],
            "events": [_event_payload(item) for item in events],
        }
    }


@app.get("/v1/admin/batch-jobs")
async def list_batch_jobs_admin(
    status: str | None = Query(default=None),
    agent_name: str | None = Query(default=None, alias="agentName"),
    provider: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
) -> dict[str, Any]:
    return await list_batch_jobs(status=status, agent_name=agent_name, provider=provider, limit=limit)


@app.get("/v1/admin/batch-jobs/{job_id}/events")
async def list_batch_job_events(job_id: str) -> dict[str, Any]:
    try:
        events = await batch_job_store().list_outbox_events_for_job(job_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown batch job: {job_id}") from error
    return {"data": {"items": [_event_payload(item) for item in events], "count": len(events)}}


@app.post("/v1/admin/batch-workers/run-once")
async def run_batch_workers_once() -> dict[str, Any]:
    submission = await batch_worker().run_submission_cycle(limit=100)
    polling = await batch_worker().run_polling_cycle(limit=100)
    finalization = await batch_worker().run_finalization_cycle(limit=100)
    dispatched = await outbox_dispatcher().dispatch_pending(limit=100)
    return {
        "data": {
            "submission": submission.__dict__,
            "polling": polling.__dict__,
            "finalization": finalization.__dict__,
            "outboxDispatched": len(dispatched),
        }
    }


def _telemetry_filters(
    *,
    agent_name: str | None = None,
    user_id: str | None = None,
    status: str | None = None,
    execution_mode: str | None = None,
    provider: str | None = None,
    model: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if agent_name:
        filters["agentName"] = agent_name
    if user_id:
        filters["userId"] = user_id
    if status:
        filters["status"] = status
    if execution_mode:
        filters["executionMode"] = execution_mode
    if provider:
        filters["provider"] = provider
    if model:
        filters["model"] = model
    if date_from:
        filters["dateFrom"] = date_from
    if date_to:
        filters["dateTo"] = date_to
    return filters


@app.get("/v1/admin/agents/stats")
async def get_agent_stats(
    agent_name: str | None = Query(default=None, alias="agentName"),
    user_id: str | None = Query(default=None, alias="userId"),
    status: str | None = Query(default=None),
    execution_mode: str | None = Query(default=None, alias="executionMode"),
    provider: str | None = Query(default=None),
    model: str | None = Query(default=None),
    date_from: str | None = Query(default=None, alias="dateFrom"),
    date_to: str | None = Query(default=None, alias="dateTo"),
) -> dict[str, Any]:
    return {
        "data": telemetry_store().get_stats(
            filters=_telemetry_filters(
                agent_name=agent_name,
                user_id=user_id,
                status=status,
                execution_mode=execution_mode,
                provider=provider,
                model=model,
                date_from=date_from,
                date_to=date_to,
            )
        )
    }


@app.get("/v1/admin/agents/runs")
async def list_agent_runs(
    agent_name: str | None = Query(default=None, alias="agentName"),
    user_id: str | None = Query(default=None, alias="userId"),
    status: str | None = Query(default=None),
    execution_mode: str | None = Query(default=None, alias="executionMode"),
    provider: str | None = Query(default=None),
    model: str | None = Query(default=None),
    date_from: str | None = Query(default=None, alias="dateFrom"),
    date_to: str | None = Query(default=None, alias="dateTo"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    return {
        "data": telemetry_store().list_runs(
            filters=_telemetry_filters(
                agent_name=agent_name,
                user_id=user_id,
                status=status,
                execution_mode=execution_mode,
                provider=provider,
                model=model,
                date_from=date_from,
                date_to=date_to,
            ),
            limit=limit,
            offset=offset,
        )
    }


@app.get("/v1/admin/agents/runs/{run_id}")
async def get_agent_run(run_id: str) -> dict[str, Any]:
    try:
        return {"data": telemetry_store().get_run_detail(run_id)}
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown agent run: {run_id}") from error


@app.get("/v1/admin/agents/tools")
async def get_agent_tool_stats(
    agent_name: str | None = Query(default=None, alias="agentName"),
    user_id: str | None = Query(default=None, alias="userId"),
) -> dict[str, Any]:
    return {
        "data": telemetry_store().get_tool_stats(
            filters=_telemetry_filters(agent_name=agent_name, user_id=user_id)
        )
    }


@app.get("/v1/admin/agents/users")
async def get_agent_user_breakdown() -> dict[str, Any]:
    stats = telemetry_store().get_stats()
    return {"data": {"items": stats["byUser"], "count": len(stats["byUser"])}}


@app.get("/v1/admin/agents/{agent_name}/stats")
async def get_single_agent_stats(agent_name: str) -> dict[str, Any]:
    return {"data": telemetry_store().get_stats(filters={"agentName": agent_name})}


async def _completed_run_stream() -> AsyncIterator[str]:
    last_event_id = 0
    while True:
        events = telemetry_store().list_completed_events(after_id=last_event_id)
        if not events:
            yield ": heartbeat\n\n"
        for event in events:
            last_event_id = max(last_event_id, int(event["eventId"]))
            yield f"id: {last_event_id}\n"
            yield "event: completed-run\n"
            yield f"data: {json.dumps(event, ensure_ascii=True)}\n\n"
        await asyncio.sleep(2)


@app.get("/v1/admin/agents/monitor/stream")
async def monitor_agent_runs() -> StreamingResponse:
    return StreamingResponse(_completed_run_stream(), media_type="text/event-stream")


@app.get("/v1/admin/agents/runs/{run_id}/transcript")
async def get_agent_run_transcript(run_id: str) -> dict[str, Any]:
    try:
        detail = telemetry_store().get_run_detail(run_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown agent run: {run_id}") from error
    return {"data": {"runId": run_id, "transcript": detail["transcript"]}}


@app.get("/v1/admin/agents/runs/{run_id}/export.json")
async def export_agent_run_json(run_id: str) -> PlainTextResponse:
    try:
        export = telemetry_store().get_or_create_export(run_id, "json")
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown agent run: {run_id}") from error
    return PlainTextResponse(
        export["content"],
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={export['fileName']}"},
    )


@app.get("/v1/admin/agents/runs/{run_id}/export.md")
async def export_agent_run_markdown(run_id: str) -> PlainTextResponse:
    try:
        export = telemetry_store().get_or_create_export(run_id, "md")
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown agent run: {run_id}") from error
    return PlainTextResponse(
        export["content"],
        media_type="text/markdown",
        headers={"Content-Disposition": f"attachment; filename={export['fileName']}"},
    )


@app.get("/v1/admin/agents/configs")
async def list_agent_configs() -> dict[str, Any]:
    _ensure_agent_configs_bootstrapped()
    configs = telemetry_store().list_configs()
    return {"data": {"items": configs, "count": len(configs)}}


@app.get("/v1/admin/agents/{agent_name}/config")
async def get_agent_config(agent_name: str) -> dict[str, Any]:
    _ensure_agent_configs_bootstrapped()
    try:
        return {"data": telemetry_store().get_agent_config(agent_name)}
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown agent config: {agent_name}") from error


@app.post("/v1/admin/agents/{agent_name}/config/drafts")
async def create_agent_config_draft(agent_name: str, envelope: AgentConfigEnvelope) -> dict[str, Any]:
    _ensure_agent_configs_bootstrapped()
    draft = telemetry_store().create_config_draft(
        agent_name=agent_name,
        actor_user_id=envelope.actor_user_id,
        wrapper=envelope.wrapper,
        tool_belt=envelope.tool_belt,
        notes=envelope.notes,
    )
    return {"data": draft}


@app.put("/v1/admin/agents/{agent_name}/config/drafts/{version_id}")
async def update_agent_config_draft(
    agent_name: str,
    version_id: str,
    envelope: AgentConfigEnvelope,
) -> dict[str, Any]:
    if envelope.wrapper.get("name") != agent_name:
        raise HTTPException(status_code=422, detail="Wrapper name must match route agent name.")
    try:
        draft = telemetry_store().update_config_draft(
            version_id=version_id,
            actor_user_id=envelope.actor_user_id,
            wrapper=envelope.wrapper,
            tool_belt=envelope.tool_belt,
            notes=envelope.notes,
        )
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown config draft: {version_id}") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"data": draft}


@app.post("/v1/admin/agents/{agent_name}/config/drafts/{version_id}/activate")
async def activate_agent_config_draft(
    agent_name: str,
    version_id: str,
    x_user_id: str = Header(default="admin_devuser", alias="x-user-id"),
) -> dict[str, Any]:
    try:
        activated = telemetry_store().activate_config_draft(
            version_id=version_id,
            actor_user_id=x_user_id,
        )
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown config draft: {version_id}") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    if activated["agentName"] != agent_name:
        raise HTTPException(status_code=422, detail="Activated config does not belong to this agent.")
    return {"data": activated}


@app.post("/v1/admin/agents/{agent_name}/config/drafts/{version_id}/rollback-source")
async def rollback_source_agent_config_draft(
    agent_name: str,
    version_id: str,
    x_user_id: str = Header(default="admin_devuser", alias="x-user-id"),
) -> dict[str, Any]:
    _ = version_id
    _ensure_agent_configs_bootstrapped()
    try:
        draft = telemetry_store().create_rollback_draft(
            agent_name=agent_name,
            actor_user_id=x_user_id,
        )
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown agent config: {agent_name}") from error
    return {"data": draft}


@app.get("/v1/admin/agents/{agent_name}/config/history")
async def get_agent_config_history(agent_name: str) -> dict[str, Any]:
    _ensure_agent_configs_bootstrapped()
    try:
        config = telemetry_store().get_agent_config(agent_name)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown agent config: {agent_name}") from error
    return {"data": {"items": config["history"], "count": len(config["history"])}}


@app.post("/v1/content/generate")
async def generate_content(
    envelope: ContentGenerateEnvelope,
    x_user_id: str = Header(default="user_devuser00000000000000"),
) -> dict[str, Any]:
    return await create_content(envelope, x_user_id)


@app.post("/v1/content/create")
async def create_content(
    envelope: ContentGenerateEnvelope,
    x_user_id: str = Header(default="user_devuser00000000000000"),
) -> dict[str, Any]:
    job = envelope.job
    rp = job.get("requestPayload", {})
    request = AgentRunRequest.model_validate(
        {
            "userId": x_user_id,
            "conceptIds": job.get("conceptIds", []),
            "selectedNodeIds": job.get("selectedNodeIds", []),
            "curriculumId": rp.get("curriculumId"),
            "sessionId": rp.get("sessionId"),
            "documentIds": job.get("documentIds", []),
            "desiredCardTypes": job.get("requestedCardTypes", []),
            "studyMode": rp.get("studyMode"),
            "executionPreference": rp.get("executionPreference", "realtime"),
            "payload": {
                "mode": job.get("mode", "agent_autonomous"),
                "desiredActivityTypes": rp.get("desiredActivityTypes", []),
                "budget": rp.get("budget", {}),
                "varietyMandate": rp.get("varietyMandate", {}),
                "sourcePolicy": rp.get("sourcePolicy"),
                "purpose": rp.get("purpose"),
                "trigger": rp.get("trigger"),
            },
        }
    )
    try:
        result = await agent_runtime().run("content-creation-orchestrator", request)
    except UserFacingAgentError as error:
        _raise_user_facing_agent_http_exception(error)
    except httpx.HTTPStatusError as error:
        _raise_provider_http_exception(error)
    content_result = result.get("execution", {}).get("result", {}) if isinstance(result.get("execution"), dict) else {}
    return {
        "data": {
            "agentRunId": content_result.get("agentRunId") or result.get("runId"),
            "drafts": content_result.get("cards", []),
            "activityVariants": content_result.get("activityVariants", []),
            "rejectedDrafts": content_result.get("rejectedDrafts", []),
            "contentCreationPrompt": result.get("execution", {}).get("contentCreationPrompt")
            if isinstance(result.get("execution"), dict)
            else None,
        }
    }


def _job_payload(job: Any) -> dict[str, Any]:
    is_cancellable = job.status == "queued" and job.provider_batch_id is None and job.submitted_at is None
    return {
        "jobId": job.job_id,
        "runId": job.run_id,
        "agentName": job.agent_name,
        "provider": job.provider,
        "model": job.model,
        "executionStrategy": job.execution_strategy,
        "status": job.status,
        "providerBatchId": job.provider_batch_id,
        "providerStatus": job.provider_status,
        "request": job.request_json,
        "result": job.result_json,
        "errorMessage": job.error_message,
        "submittedAt": job.submitted_at,
        "providerSubmittedAt": job.submitted_at if job.provider_batch_id is not None else None,
        "completedAt": job.completed_at,
        "createdAt": job.created_at,
        "updatedAt": job.updated_at,
        "isCancellable": is_cancellable,
        "cancellationWindow": "pre_submit_only" if is_cancellable else "none",
    }


def _attempt_payload(attempt: Any) -> dict[str, Any]:
    return {
        "attemptId": attempt.attempt_id,
        "jobId": attempt.job_id,
        "attemptKind": attempt.attempt_kind,
        "status": attempt.status,
        "request": attempt.request_json,
        "response": attempt.response_json,
        "errorMessage": attempt.error_message,
        "startedAt": attempt.started_at,
        "finishedAt": attempt.finished_at,
    }


def _event_payload(event: Any) -> dict[str, Any]:
    return {
        "eventId": event.event_id,
        "topic": event.topic,
        "aggregateType": event.aggregate_type,
        "aggregateId": event.aggregate_id,
        "payload": event.payload_json,
        "status": event.status,
        "createdAt": event.created_at,
        "publishedAt": event.published_at,
    }


@app.post("/v1/content/transform")
async def transform_content(envelope: ContentTransformEnvelope) -> dict[str, Any]:
    request = ContentTransformRequest.model_validate(
        {
            "card": envelope.card or {"content": {}},
            "transformationKind": envelope.transformation_kind,
            "prompt": envelope.prompt,
            "provider": None,
            "model": None,
            "executionStrategy": "realtime",
            "batchRequested": False,
        }
    )
    result = await ContentCreatorAgent(guardian()).transform(request)
    return {
        "data": {
            "agentRunId": result["agentRunId"],
            "draft": {
                **result["card"],
                "parentCardId": envelope.parent_card_id,
                "conceptIds": result["card"].get("conceptIds", []),
                "factualityScore": result["card"].get("factualityScore", 1.0),
            },
        }
    }


@app.post("/v1/ingestion/extract-concepts")
async def extract_ingestion_concepts(
    envelope: IngestionExtractEnvelope,
    x_user_id: str = Header(default="user_devuser00000000000000"),
) -> dict[str, Any]:
    request = AgentRunRequest.model_validate(
        {
            "userId": x_user_id,
            "curriculumId": envelope.curriculum_id,
            "documentIds": [envelope.document_id],
            "studyMode": envelope.study_mode,
            "executionPreference": envelope.execution_preference,
            "payload": {
                "documentId": envelope.document_id,
                "ingestionJobId": envelope.ingestion_job_id,
                "intent": envelope.intent,
                "document": envelope.document,
                "ir": envelope.ir,
                "chunks": envelope.chunks,
                "scanWindows": envelope.scan_windows,
                "retrievalSeed": envelope.retrieval_seed,
            },
        }
    )
    try:
        result = await agent_runtime().run("ingestion-concept-extraction-agent", request)
    except (KeyError, ValueError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"data": result}


@app.post("/v1/lesson-plans/generate")
async def generate_lesson_plan(request: LessonPlanRequest) -> dict[str, Any]:
    try:
        return {"data": await LessonPlanGenerator(guardian()).generate(request)}
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/v1/knowledge-graph/propose")
async def propose_graph_mutations(
    envelope: KnowledgeGraphProposeEnvelope,
    x_user_id: str = Header(default="user_devuser00000000000000"),
) -> dict[str, Any]:
    request = AgentRunRequest.model_validate(
        {
            "userId": x_user_id,
            "conceptIds": envelope.concept_ids,
            "documentIds": envelope.document_ids,
            "studyMode": envelope.study_mode,
            "operationName": envelope.operation_name,
            "executionPreference": envelope.execution_preference,
            "payload": {
                "operationName": envelope.operation_name,
                "proposalType": envelope.proposal_type,
                "domain": envelope.domain,
                "candidateLabels": envelope.candidate_labels,
            },
        }
    )
    try:
        result = await agent_runtime().run("knowledge-graph-agent", request)
    except (KeyError, ValueError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"data": result}


@app.post("/v1/curriculum/generate-draft")
async def generate_curriculum_draft(
    envelope: CurriculumDraftEnvelope,
    x_user_id: str = Header(default="user_devuser00000000000000"),
) -> dict[str, Any]:
    request = AgentRunRequest.model_validate(
        {
            "userId": x_user_id,
            "conceptIds": envelope.concept_ids,
            "documentIds": envelope.document_ids,
            "studyMode": envelope.study_mode,
            "executionPreference": envelope.execution_preference,
            "payload": {
                "goal": envelope.goal,
                "targetHorizon": envelope.target_horizon,
                "difficultyPreference": envelope.difficulty_preference,
                "pacing": envelope.pacing,
            },
        }
    )
    try:
        result = await agent_runtime().run("curriculum-planner", request)
    except (KeyError, ValueError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"data": result}


@app.post("/v1/curriculum/analyze-goal")
async def analyze_curriculum_goal(
    envelope: CurriculumOutlineEnvelope,
    x_user_id: str = Header(default="user_devuser00000000000000"),
) -> dict[str, Any]:
    request = AgentRunRequest.model_validate(
        {
            "userId": x_user_id,
            "studyMode": envelope.study_mode,
            "executionPreference": envelope.execution_preference,
            "payload": {
                "goal": envelope.goal,
                "domain": envelope.domain,
            },
        }
    )
    try:
        result = await agent_runtime().run("curriculum-outline-planner", request)
    except (KeyError, ValueError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"data": result}


@app.post("/v1/curriculum/propose-revision")
async def propose_curriculum_revision(
    envelope: CurriculumReviseEnvelope,
    x_user_id: str = Header(default="user_devuser00000000000000"),
) -> dict[str, Any]:
    request = AgentRunRequest.model_validate(
        {
            "userId": x_user_id,
            "curriculumId": envelope.curriculum_id,
            "executionPreference": envelope.execution_preference,
            "payload": {
                "curriculumVersionId": envelope.curriculum_version_id,
                "currentNodes": envelope.current_nodes,
                "currentEdges": envelope.current_edges,
                "progress": envelope.progress,
                "revisionReason": envelope.revision_reason,
                "evidence": envelope.evidence,
            },
        }
    )
    try:
        result = await agent_runtime().run("curriculum-revision-agent", request)
    except (KeyError, ValueError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"data": result}


app = CORSMiddleware(
    app=_fastapi_app,
    allow_origins=_CORS_ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
