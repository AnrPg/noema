"""Agent wrapper contracts, tool belts, and prompt-slot assembly."""

from __future__ import annotations

import hashlib
import time
from typing import TYPE_CHECKING, Any, Literal, cast

import httpx
from pydantic import BaseModel, Field

from .batch_jobs import BatchJobStore, BatchSubmissionEnvelope
from .calibration_coach import CalibrationCoachAgent, CalibrationCoachRequest
from .content_creation_preflight import (
    ContentIntentNormalizerAgent,
    ContentPedagogyPlannerAgent,
    LearnerStateSummarizerAgent,
)
from .content_creation_prompt import ContentCreationPromptBuilder
from .content_creator import ContentCreatorAgent, ContentCreatorRequest, ContentTransformRequest
from .cognitive_copilot import CognitiveCopilotAgent, CognitiveCopilotRequest
from .curriculum_planner import (
    CurriculumDraftRequest,
    CurriculumOutlineRequest,
    CurriculumPlannerAgent,
    CurriculumRevisionRequest,
)
from .execution_registry import resolve_execution_plan
from .graph_intervention import GraphInterventionOrchestrator, normalize_graph_operation_name
from .ingestion_concept_extraction_agent import (
    IngestionConceptExtractionAgent,
    IngestionConceptExtractionRequest,
)
from .knowledge_graph_agent import KnowledgeGraphAgent, KnowledgeGraphRequest
from .lesson_planner import LessonPlanGenerator, LessonPlanRequest
from .llm_router import (
    LLMRouter,
    ProviderBatchRequest,
    ProviderToolDefinition,
    build_user_prompt,
    response_schema_for_wrapper,
)
from .mental_debugger import MentalDebuggerAgent, MentalDebuggerRequest
from .mode_preference_helper import ModePreferenceHelperAgent, ModePreferenceRequest
from .model_registry import get_agent_model_config, model_provider
from .patch_planner_remediation import PatchPlannerAgent, PatchPlannerRequest
from .pedagogy_guardian import PedagogyGuardianAgent, PedagogyGuardianRequest
from .strategy_replanning import StrategyReplanningAgent, StrategyReplanningRequest
from .taxonomy_curator import TaxonomyCuratorAgent, TaxonomyCuratorRequest
from .telemetry import (
    AgentTelemetryStore,
    RunRecorder,
    active_run_recorder,
    build_transcript,
    create_run_id,
    extract_usage,
)
from .watchtower_governance import WatchtowerGovernanceAgent, WatchtowerGovernanceRequest

if TYPE_CHECKING:
    from .composite_tools import CompositeToolRegistry
    from .guardian_client import GuardianClient


class UserFacingAgentError(Exception):
    def __init__(
        self,
        *,
        message: str,
        reason_code: str,
        detail: str,
        retryable: bool,
        status_code: int,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.payload = {
            "message": message,
            "reasonCode": reason_code,
            "detail": detail,
            "retryable": retryable,
        }


def _graph_confirmation_result(
    *,
    run_id: str,
    request: "AgentRunRequest",
    graph_readiness: dict[str, Any],
    anchor_result: dict[str, Any],
) -> dict[str, Any]:
    pkg_write_plan = _pkg_write_plan_from_anchor_result(
        concept_ids=request.concept_ids,
        anchor_result=anchor_result,
    )
    return {
        "agentRunId": run_id,
        "status": "awaiting_graph_confirmation",
        "message": "Before we can generate content, we need to add this concept to your graph and connect it to related ideas. Please review and confirm those changes first.",
        "cards": [],
        "activityVariants": [],
        "rejectedDrafts": [],
        "graphReadiness": graph_readiness,
        "graphGeneration": {
            "mode": "graph_subgraph_generation",
            "anchorResult": anchor_result,
            "pkgWritePlan": pkg_write_plan,
            "confirmationTool": {
                "service": "knowledge-graph-service",
                "endpoint": "/v1/tools/execute",
                "tool": "confirm-pkg-write-plan",
                "input": {
                    "confirmed": True,
                    "operations": pkg_write_plan["operations"],
                    "confirmationMessage": pkg_write_plan["confirmationMessage"],
                    "idempotencyKey": pkg_write_plan["idempotencyKey"],
                },
            },
            "nextAction": "Review the graph changes, confirm them, then try content generation again.",
        },
        "coveragePlan": {
            "status": "awaiting_graph_confirmation",
            "reason": "We need to add this concept to your graph before we can generate grounded content for it.",
            "targetConceptIds": request.concept_ids,
        },
        "groundingReport": {
            "status": "awaiting_graph_confirmation",
            "message": "Graph confirmation is still needed before content generation can continue.",
            "blockedReasons": graph_readiness.get("blockedReasons", []),
        },
        "costEstimate": {"units": 0},
    }


def _pkg_write_plan_from_anchor_result(
    *,
    concept_ids: list[str],
    anchor_result: dict[str, Any],
) -> dict[str, Any]:
    proposals = [
        item for item in anchor_result.get("proposals", []) if isinstance(item, dict)
    ]
    node_temp_refs: dict[str, str] = {}
    operations: list[dict[str, Any]] = []
    for proposal in proposals:
        operation = proposal.get("operation")
        if not isinstance(operation, dict):
            continue
        if operation.get("type") == "add_node":
            concept_id = str(proposal.get("conceptId") or operation.get("label") or f"temp_{len(node_temp_refs) + 1}")
            temp_ref = f"tmp::{concept_id}"
            node_temp_refs[concept_id] = temp_ref
            operations.append(
                {
                    "type": "add_node",
                    "tempNodeRef": temp_ref,
                    "label": operation.get("label"),
                    "nodeType": operation.get("nodeType", "concept"),
                    "domain": operation.get("domain", "general"),
                    **({"description": operation.get("description")} if operation.get("description") is not None else {}),
                    **({"properties": operation.get("properties")} if operation.get("properties") is not None else {}),
                }
            )
    for proposal in proposals:
        operation = proposal.get("operation")
        if not isinstance(operation, dict) or operation.get("type") != "add_edge":
            continue
        source_raw = operation.get("sourceNodeId")
        target_raw = operation.get("targetNodeId")
        edge_operation: dict[str, Any] = {
            "type": "add_edge",
            "edgeType": operation.get("edgeType"),
            **({"weight": operation.get("weight")} if operation.get("weight") is not None else {}),
            **({"rationale": operation.get("rationale")} if operation.get("rationale") is not None else {}),
        }
        if isinstance(source_raw, str) and source_raw.startswith("node_"):
            edge_operation["sourceNodeId"] = source_raw
        elif isinstance(source_raw, str) and source_raw in node_temp_refs:
            edge_operation["sourceTempRef"] = node_temp_refs[source_raw]
        if isinstance(target_raw, str) and target_raw.startswith("node_"):
            edge_operation["targetNodeId"] = target_raw
        elif isinstance(target_raw, str) and target_raw in node_temp_refs:
            edge_operation["targetTempRef"] = node_temp_refs[target_raw]
        if "sourceNodeId" in edge_operation or "sourceTempRef" in edge_operation:
            if "targetNodeId" in edge_operation or "targetTempRef" in edge_operation:
                operations.append(edge_operation)
    joined = "|".join([*concept_ids, str(anchor_result.get("proposalCount", 0))])
    return {
        "requiresUserConfirmation": True,
        "ready": len(operations) > 0,
        "confirmationMessage": f"Create and connect graph nodes required before generating content for {', '.join(concept_ids)}.",
        "idempotencyKey": "pkg_write_" + hashlib.sha1(joined.encode("utf-8")).hexdigest()[:16],
        "operations": operations,
    }


class ToolBeltDefinition(BaseModel):
    id: str
    description: str
    read_tools: list[str] = Field(default_factory=list, alias="readTools")
    write_tools: list[str] = Field(default_factory=list, alias="writeTools")
    composite_tools: list[str] = Field(default_factory=list, alias="compositeTools")
    forbidden_tools: list[str] = Field(default_factory=list, alias="forbiddenTools")
    reviewed_write_by_default: bool = Field(default=True, alias="reviewedWriteByDefault")
    max_latency_ms: int = Field(default=10_000, alias="maxLatencyMs")
    max_cost_usd: float | None = Field(default=None, alias="maxCostUsd")
    budget: dict[str, Any] = Field(default_factory=dict)


class AgentWrapperDefinition(BaseModel):
    name: str
    family: str
    purpose: str
    execution_mode: Literal[
        "preview",
        "ingestion_concept_extraction",
        "content_creation_orchestrator",
        "content_intent_normalizer",
        "learner_state_summarizer",
        "content_pedagogy_planner",
        "content_creator",
        "content_transform",
        "lesson_plan",
        "graph_intervention_orchestrator",
        "graph_proposal",
        "curriculum_outline",
        "curriculum_draft",
        "curriculum_revision",
        "calibration_coach",
        "mental_debugger",
        "patch_planner",
        "strategy_replanning",
        "cognitive_copilot",
        "watchtower_governance",
        "mode_preference",
        "taxonomy_curator",
        "pedagogy_guardian",
    ] = Field(alias="executionMode")
    tool_belt_id: str = Field(alias="toolBeltId")
    primary_composite_tool: str | None = Field(default=None, alias="primaryCompositeTool")
    output_kind: str = Field(alias="outputKind")
    write_authority: str = Field(alias="writeAuthority")
    review_path: list[str] = Field(default_factory=list, alias="reviewPath")
    instructions: list[str] = Field(default_factory=list)
    required_fields: list[str] = Field(default_factory=list, alias="requiredFields")
    provider: str | None = None
    model: str | None = None
    batch_allowed: bool = Field(default=False, alias="batchAllowed")
    batch_preferred: bool = Field(default=False, alias="batchPreferred")
    max_latency_seconds: int | None = Field(default=None, alias="maxLatencySeconds")
    enabled: bool = True
    budget: dict[str, Any] = Field(default_factory=dict)
    display_name: str | None = Field(default=None, alias="displayName")
    config_version_id: str | None = Field(default=None, alias="configVersionId")


class PromptEnvelope(BaseModel):
    template_id: str = Field(alias="templateId")
    system_instructions: list[str] = Field(alias="systemInstructions")
    operation_name: str | None = Field(default=None, alias="operationName")
    prompt_profile_version: str | None = Field(default=None, alias="promptProfileVersion")
    prompt_builder_id: str | None = Field(default=None, alias="promptBuilderId")
    output_schema_id: str | None = Field(default=None, alias="outputSchemaId")
    scope: dict[str, Any] | None = None
    slots: dict[str, Any]


class AgentRunRequest(BaseModel):
    session_id: str | None = Field(default=None, alias="sessionId")
    user_id: str = Field(alias="userId")
    curriculum_id: str | None = Field(default=None, alias="curriculumId")
    step_id: str | None = Field(default=None, alias="stepId")
    concept_ids: list[str] = Field(default_factory=list, alias="conceptIds")
    selected_node_ids: list[str] = Field(default_factory=list, alias="selectedNodeIds")
    selected_card_ids: list[str] = Field(default_factory=list, alias="selectedCardIds")
    desired_card_types: list[str] = Field(default_factory=list, alias="desiredCardTypes")
    document_ids: list[str] = Field(default_factory=list, alias="documentIds")
    requested_tools: list[str] = Field(default_factory=list, alias="requestedTools")
    graph_expansion_scope: dict[str, Any] | None = Field(
        default=None, alias="graphExpansionScope"
    )
    study_mode: str | None = Field(default=None, alias="studyMode")
    operation_name: str | None = Field(default=None, alias="operationName")
    prompt_profile_version: str | None = Field(default=None, alias="promptProfileVersion")
    execution_preference: Literal["auto", "realtime", "batch"] = Field(
        default="auto", alias="executionPreference"
    )
    allow_fallback: bool = Field(default=True, alias="allowFallback")
    payload: dict[str, Any] = Field(default_factory=dict)


class ReviewRoutingDecision(BaseModel):
    allowed: bool
    risk_level: Literal["low", "medium", "high"] = Field(alias="riskLevel")
    requires_review: bool = Field(alias="requiresReview")
    review_queue: str | None = Field(default=None, alias="reviewQueue")
    review_path: list[str] = Field(default_factory=list, alias="reviewPath")
    reasons: list[str] = Field(default_factory=list)
    blocked_reasons: list[str] = Field(default_factory=list, alias="blockedReasons")
    allowed_actions: list[str] = Field(default_factory=list, alias="allowedActions")
    denied_actions: list[str] = Field(default_factory=list, alias="deniedActions")


class ExecutionPlan(BaseModel):
    strategy: Literal["realtime", "batch"] | Literal["auto"]
    batch_allowed: bool = Field(alias="batchAllowed")
    batch_preferred: bool = Field(alias="batchPreferred")
    max_latency_seconds: int | None = Field(default=None, alias="maxLatencySeconds")
    reason: str


class AgentOperationProfile(BaseModel):
    operation_name: str = Field(alias="operationName")
    prompt_builder_id: str = Field(alias="promptBuilderId")
    output_schema_id: str = Field(alias="outputSchemaId")
    prompt_profile_version: str = Field(default="v1", alias="promptProfileVersion")
    instructions: list[str] = Field(default_factory=list)
    scope_instructions: dict[str, list[str]] = Field(default_factory=dict, alias="scopeInstructions")


class AgentRuntime:
    def __init__(
        self,
        composite_registry: CompositeToolRegistry,
        guardian: GuardianClient,
        telemetry_store: AgentTelemetryStore | None = None,
        batch_store: BatchJobStore | None = None,
        llm_router: LLMRouter | None = None,
    ) -> None:
        self._composites = composite_registry
        self._guardian = guardian
        self._telemetry = telemetry_store
        self._batch_store = batch_store
        self._llm_router = llm_router
        self._default_tool_belts = _tool_belts()
        self._default_wrappers = _wrappers()

    def _runtime_state(self) -> tuple[dict[str, ToolBeltDefinition], dict[str, AgentWrapperDefinition]]:
        if self._telemetry is None:
            return self._default_tool_belts, self._default_wrappers
        wrappers, tool_belts = self._telemetry.get_runtime_state(
            {name: wrapper.model_dump(by_alias=True) for name, wrapper in self._default_wrappers.items()},
            {name: belt.model_dump(by_alias=True) for name, belt in self._default_tool_belts.items()},
        )
        runtime_tool_belts = {
            name: ToolBeltDefinition.model_validate(payload) for name, payload in tool_belts.items()
        }
        runtime_wrappers = {
            name: AgentWrapperDefinition.model_validate(payload) for name, payload in wrappers.items()
        }
        return runtime_tool_belts, runtime_wrappers

    def _ensure_realtime_content_generation_is_available(
        self,
        *,
        wrapper: AgentWrapperDefinition,
    ) -> None:
        if self._llm_router is None or wrapper.provider is None or wrapper.model is None:
            raise UserFacingAgentError(
                message="This content generator is not fully set up for realtime generation. Please contact the team or try a different generation mode.",
                reason_code="content_generation_not_configured",
                detail="Realtime content generation is missing an LLM router, provider, or model configuration.",
                retryable=False,
                status_code=500,
            )
        try:
            self._llm_router.get_realtime_adapter(wrapper.provider)
        except ValueError as error:
            raise UserFacingAgentError(
                message="This content generator is not fully set up for realtime generation. Please contact the team or try a different generation mode.",
                reason_code="content_generation_provider_not_supported",
                detail=f"Realtime adapter is not configured for provider '{wrapper.provider}'.",
                retryable=False,
                status_code=500,
            ) from error

    def _resolve_operation_profile(
        self, wrapper: AgentWrapperDefinition, request: AgentRunRequest
    ) -> AgentOperationProfile | None:
        registry = _operation_profiles().get(wrapper.name)
        if registry is None:
            return None
        payload = request.payload if isinstance(request.payload, dict) else {}
        if wrapper.name in {"graph-intervention-orchestrator", "knowledge-graph-agent"}:
            raw_operation = (
                request.operation_name
                or payload.get("operationName")
                or payload.get("requestedOperation")
                or payload.get("operationType")
                or payload.get("proposalType")
            )
            operation_name = normalize_graph_operation_name(raw_operation)
            return registry.get(operation_name) or registry.get("content_readiness")
        if wrapper.name in {"content-creation-orchestrator", "content-creator-agent"}:
            operation_name = _resolve_content_operation_name(request)
            return registry.get(operation_name) or registry.get("authoring_assistance")
        if wrapper.name == "content-transform-agent":
            operation_name = _resolve_content_transform_operation_name(request)
            return registry.get(operation_name) or registry.get("transform_content")
        return None

    def _resolved_scope(
        self, wrapper: AgentWrapperDefinition, request: AgentRunRequest
    ) -> dict[str, Any] | None:
        if wrapper.name not in {"graph-intervention-orchestrator", "knowledge-graph-agent"}:
            return None
        if isinstance(request.graph_expansion_scope, dict):
            return request.graph_expansion_scope
        payload = request.payload if isinstance(request.payload, dict) else {}
        scope = payload.get("graphExpansionScope")
        return scope if isinstance(scope, dict) else None

    def list_wrappers(self) -> list[dict[str, Any]]:
        tool_belts, wrappers = self._runtime_state()
        return [
            {
                **wrapper.model_dump(by_alias=True),
                "toolBelt": tool_belts[wrapper.tool_belt_id].model_dump(by_alias=True),
            }
            for wrapper in wrappers.values()
        ]

    def get_wrapper(self, name: str) -> dict[str, Any]:
        tool_belts, wrappers = self._runtime_state()
        wrapper = wrappers[name]
        return {
            **wrapper.model_dump(by_alias=True),
            "toolBelt": tool_belts[wrapper.tool_belt_id].model_dump(by_alias=True),
        }

    def preflight(self, name: str, request: AgentRunRequest) -> dict[str, Any]:
        tool_belts, wrappers = self._runtime_state()
        wrapper = wrappers[name]
        self._validate_request(wrapper, request)
        decision = self._build_review_decision(tool_belts[wrapper.tool_belt_id], wrapper, request)
        execution_plan = self._build_execution_plan(wrapper, request)
        return {
            "agent": self.get_wrapper(name),
            "request": request.model_dump(by_alias=True),
            "decision": decision.model_dump(by_alias=True),
            "executionPlan": execution_plan.model_dump(by_alias=True),
        }

    async def run(self, name: str, request: AgentRunRequest) -> dict[str, Any]:
        return await self._run(name, request, force_async=False)

    async def run_async(self, name: str, request: AgentRunRequest) -> dict[str, Any]:
        return await self._run(name, request, force_async=True)

    async def _run(self, name: str, request: AgentRunRequest, *, force_async: bool) -> dict[str, Any]:
        tool_belts, wrappers = self._runtime_state()
        wrapper = wrappers[name]
        tool_belt = tool_belts[wrapper.tool_belt_id]
        self._validate_request(wrapper, request)
        decision = self._build_review_decision(tool_belt, wrapper, request)
        execution_plan = self._build_execution_plan(wrapper, request)
        if force_async and execution_plan.strategy != "batch":
            raise ValueError(
                f"Agent '{wrapper.name}' resolved to realtime execution and cannot be queued with run-async."
            )
        if not decision.allowed:
            raise ValueError("; ".join(decision.blocked_reasons))
        started_at = time.perf_counter()
        request_payload = request.model_dump(by_alias=True)
        run_id = create_run_id()
        started_at_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        recorder: RunRecorder | None = None
        if self._telemetry is not None:
            self._telemetry.start_run(
                run_id=run_id,
                agent_name=wrapper.name,
                family=wrapper.family,
                execution_mode=wrapper.execution_mode,
                output_kind=wrapper.output_kind,
                write_authority=wrapper.write_authority,
                provider=wrapper.provider,
                model=wrapper.model,
                enabled=wrapper.enabled,
                config_version_id=wrapper.config_version_id,
                user_id=request.user_id,
                session_id=request.session_id,
                curriculum_id=request.curriculum_id,
                step_id=request.step_id,
                request_payload=request_payload,
                started_at=started_at_iso,
            )
            recorder = self._create_recorder(run_id, wrapper.name, started_at_iso)
            recorder.record_event("run_requested", {"request": request_payload})
            recorder.record_event("run_preflighted", decision.model_dump(by_alias=True))
            recorder.record_event("execution_planned", execution_plan.model_dump(by_alias=True))

        context_pack: dict[str, Any] | None = None
        prompt: PromptEnvelope | None = None
        execution: dict[str, Any] | None = None
        batch_submission: BatchSubmissionEnvelope | None = None

        if recorder is not None:
            with active_run_recorder(recorder):
                try:
                    context_pack, prompt, execution, batch_submission = await self._run_core(
                        wrapper=wrapper,
                        tool_belt=tool_belt,
                        request=request,
                        execution_plan=execution_plan,
                        run_id=run_id,
                        recorder=recorder,
                    )
                except Exception as error:
                    recorder.record_event("execution_failed", {"message": str(error)})
                    completed_at_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    transcript = build_transcript(
                        agent_name=wrapper.name,
                        request_payload=request_payload,
                        preflight=decision.model_dump(by_alias=True),
                        prompt=None if prompt is None else prompt.model_dump(by_alias=True),
                        context_pack=context_pack,
                        execution=None,
                        recorder=recorder,
                    )
                    # self._telemetry is guaranteed non-None when recorder is non-None
                    if self._telemetry is not None:
                        self._telemetry.finalize_run(
                            run_id=run_id,
                            status="failed",
                            preflight=decision.model_dump(by_alias=True),
                            context_pack=context_pack,
                            prompt=None if prompt is None else prompt.model_dump(by_alias=True),
                            execution=None,
                            transcript=transcript,
                            latency_ms=int((time.perf_counter() - started_at) * 1000),
                            usage=extract_usage(None),
                            error_code="RUN_FAILED",
                            error_message=str(error),
                            completed_at=completed_at_iso,
                            recorder=recorder,
                        )
                    raise
        else:
            context_pack, prompt, execution, batch_submission = await self._run_core(
                wrapper=wrapper,
                tool_belt=tool_belt,
                request=request,
                execution_plan=execution_plan,
                run_id=run_id,
                recorder=None,
            )

        result = {
            "runId": run_id,
            "jobId": None if batch_submission is None else batch_submission.job_id,
            "agent": self.get_wrapper(name),
            "request": request_payload,
            "preflight": decision.model_dump(by_alias=True),
            "executionPlan": execution_plan.model_dump(by_alias=True),
            "contextPack": context_pack,
            "prompt": None if prompt is None else prompt.model_dump(by_alias=True),
            "execution": execution,
            "status": "queued" if batch_submission is not None else "completed",
            "provider": _effective_provider(execution, wrapper),
            "model": _effective_model(execution, wrapper),
            "providerBatchId": None if batch_submission is None else batch_submission.provider_batch_id,
            "pollAfterSeconds": None if batch_submission is None else batch_submission.poll_after_seconds,
        }
        if recorder is not None and self._telemetry is not None:
            completed_at_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            transcript = build_transcript(
                agent_name=wrapper.name,
                request_payload=request_payload,
                preflight=decision.model_dump(by_alias=True),
                prompt=None if prompt is None else prompt.model_dump(by_alias=True),
                context_pack=context_pack,
                execution=execution,
                recorder=recorder,
            )
            self._telemetry.finalize_run(
                run_id=run_id,
                status="queued" if batch_submission is not None else "completed",
                preflight=decision.model_dump(by_alias=True),
                context_pack=context_pack,
                prompt=None if prompt is None else prompt.model_dump(by_alias=True),
                execution=execution,
                transcript=transcript,
                latency_ms=int((time.perf_counter() - started_at) * 1000),
                usage=extract_usage(execution),
                error_code=None,
                error_message=None,
                completed_at=completed_at_iso,
                recorder=recorder,
            )
        return result

    async def _run_core(
        self,
        *,
        wrapper: AgentWrapperDefinition,
        tool_belt: ToolBeltDefinition,
        request: AgentRunRequest,
        execution_plan: ExecutionPlan,
        run_id: str,
        recorder: RunRecorder | None,
    ) -> tuple[
        dict[str, Any],
        PromptEnvelope,
        dict[str, Any] | None,
        BatchSubmissionEnvelope | None,
    ]:
        """Build context, render prompt, and execute or enqueue the agent.

        Extracted from _run to eliminate the duplicated if-recorder/else-recorder
        branches. Emits telemetry events when recorder is provided.
        """
        provider_tools = await self._composites.provider_tools_for_belt(tool_belt)
        context_pack = await self._build_context(wrapper, request)
        context_pack = await self._prepare_learner_facing_readiness(
            wrapper=wrapper,
            request=request,
            context_pack=context_pack,
            provider_tools=provider_tools,
        )
        if provider_tools:
            context_pack["providerTools"] = provider_tools
        if recorder is not None:
            recorder.record_event("context_assembled", {"summary": context_pack.get("summary")})

        prompt = self._render_prompt(tool_belt, wrapper, request, context_pack)
        if recorder is not None:
            recorder.record_event(
                "prompt_rendered",
                {
                    "templateId": prompt.template_id,
                    "operationName": prompt.operation_name,
                    "promptBuilderId": prompt.prompt_builder_id,
                    "scope": prompt.scope,
                },
            )

        execution: dict[str, Any] | None = None
        batch_submission: BatchSubmissionEnvelope | None = None

        if execution_plan.strategy == "batch":
            batch_submission = await self._enqueue_batch(
                wrapper=wrapper,
                request=request,
                execution_plan=execution_plan,
                run_id=run_id,
                context_pack=context_pack,
                prompt=prompt,
            )
            execution = {
                "mode": "batch_submission",
                "strategy": "batch",
                "job": _batch_submission_payload(batch_submission),
            }
            if recorder is not None:
                recorder.record_event("batch_enqueued", _batch_submission_payload(batch_submission))
        else:
            execution = await self._execute(
                wrapper,
                request,
                execution_plan,
                run_id,
                context_pack,
                prompt,
            )

        if recorder is not None:
            recorder.record_event(
                "execution_completed",
                {
                    "mode": wrapper.execution_mode,
                    "hasExecution": execution is not None,
                    "strategy": execution_plan.strategy,
                },
            )

        return context_pack, prompt, execution, batch_submission

    async def _enqueue_batch(
        self,
        *,
        wrapper: AgentWrapperDefinition,
        request: AgentRunRequest,
        execution_plan: ExecutionPlan,
        run_id: str,
        context_pack: dict[str, Any] | None,
        prompt: PromptEnvelope | None,
    ) -> BatchSubmissionEnvelope:
        if self._llm_router is None or self._batch_store is None:
            raise RuntimeError("Batch execution requested but queue infrastructure is not configured.")
        return await self._llm_router.enqueue_batch_run(
            wrapper=wrapper,
            request=request,
            run_id=run_id,
            execution_plan=execution_plan,
            context_pack=context_pack,
            prompt=prompt,
        )

    def _create_recorder(self, run_id: str, agent_name: str, started_at: str) -> RunRecorder:
        return RunRecorder(run_id=run_id, agent_name=agent_name, started_at=started_at)

    def _validate_request(self, wrapper: AgentWrapperDefinition, request: AgentRunRequest) -> None:
        missing_fields: list[str] = []
        request_payload = request.model_dump(by_alias=True)
        for field_name in wrapper.required_fields:
            value = request_payload.get(field_name)
            if value is None:
                missing_fields.append(field_name)
                continue
            if isinstance(value, str) and value.strip() == "":
                missing_fields.append(field_name)
            if isinstance(value, list) and len(value) == 0:
                missing_fields.append(field_name)
        if missing_fields:
            raise ValueError(
                f"Missing required fields for {wrapper.name}: {', '.join(missing_fields)}"
            )
        if wrapper.execution_mode == "ingestion_concept_extraction":
            payload_document_id = request.payload.get("documentId")
            if not request.document_ids and not (
                isinstance(payload_document_id, str) and payload_document_id.strip()
            ):
                raise ValueError(
                    f"Missing required fields for {wrapper.name}: documentIds or payload.documentId"
                )

    def _build_review_decision(
        self, tool_belt: ToolBeltDefinition, wrapper: AgentWrapperDefinition, request: AgentRunRequest
    ) -> ReviewRoutingDecision:
        denied_actions = list(tool_belt.forbidden_tools)
        blocked_reasons: list[str] = []
        if not wrapper.enabled:
            blocked_reasons.append(f"Agent '{wrapper.name}' is disabled.")

        requested_tools = set(request.requested_tools)
        forbidden_requested = sorted(requested_tools.intersection(tool_belt.forbidden_tools))
        if forbidden_requested:
            blocked_reasons.append(
                "Requested forbidden tools: " + ", ".join(forbidden_requested)
            )

        risk_level = self._classify_risk(wrapper, request)
        requires_review = wrapper.write_authority != "agent_inference"
        if risk_level == "high":
            requires_review = True

        reasons = [
            f"Tool belt '{tool_belt.id}' governs the run.",
            f"Wrapper authority is '{wrapper.write_authority}'.",
        ]
        if requires_review:
            reasons.append("Run produces proposal-like output and must route through review.")
        else:
            reasons.append("Run is explanation-only and does not require reviewed write routing.")

        return ReviewRoutingDecision(
            allowed=len(blocked_reasons) == 0,
            riskLevel=risk_level,
            requiresReview=requires_review,
            reviewQueue=wrapper.review_path[0] if requires_review and wrapper.review_path else None,
            reviewPath=wrapper.review_path,
            reasons=reasons,
            blockedReasons=blocked_reasons,
            allowedActions=tool_belt.read_tools + tool_belt.write_tools + tool_belt.composite_tools,
            deniedActions=denied_actions,
        )

    def _classify_risk(
        self, wrapper: AgentWrapperDefinition, request: AgentRunRequest
    ) -> Literal["low", "medium", "high"]:
        if wrapper.execution_mode == "preview" and wrapper.write_authority == "agent_inference":
            return "low"
        if wrapper.execution_mode == "cognitive_copilot":
            return "low"
        if request.payload.get("forceFullReplan") is True:
            return "high"
        if wrapper.name == "strategy-replanning-agent":
            return "high"
        return "medium"

    def _build_execution_plan(
        self, wrapper: AgentWrapperDefinition, request: AgentRunRequest
    ) -> ExecutionPlan:
        plan = resolve_execution_plan(wrapper.name, request.execution_preference)
        return ExecutionPlan(
            strategy=cast("Literal['realtime', 'batch', 'auto']", plan.strategy),
            batchAllowed=wrapper.batch_allowed or plan.batch_allowed,
            batchPreferred=wrapper.batch_preferred or plan.batch_preferred,
            maxLatencySeconds=wrapper.max_latency_seconds or plan.max_latency_seconds,
            reason=plan.reason,
        )

    async def _build_context(
        self, wrapper: AgentWrapperDefinition, request: AgentRunRequest
    ) -> dict[str, Any]:
        if wrapper.execution_mode == "content_creation_orchestrator":
            return {
                "sections": [],
                "summary": "Content creation context is assembled after graph readiness finalizes.",
                "errors": [],
            }
        if wrapper.primary_composite_tool is None:
            return {"sections": [], "summary": "No composite context required.", "errors": []}

        composite_input: dict[str, Any] = {}
        if request.session_id is not None:
            composite_input["sessionId"] = request.session_id
        if request.curriculum_id is not None:
            composite_input["curriculumId"] = request.curriculum_id
        if request.step_id is not None:
            composite_input["stepId"] = request.step_id
        if request.concept_ids:
            composite_input["conceptIds"] = request.concept_ids
        if request.selected_node_ids:
            composite_input["selectedNodeIds"] = request.selected_node_ids
        if request.selected_card_ids:
            composite_input["selectedCardIds"] = request.selected_card_ids
        if request.study_mode is not None:
            composite_input["studyMode"] = request.study_mode
        for key in (
            "documentId",
            "document",
            "ir",
            "chunks",
            "scanWindows",
            "retrievalSeed",
            "intent",
            "domain",
            "proposalType",
            "curriculumVersionId",
            "currentNodes",
            "currentEdges",
            "progress",
            "evidence",
            "revisionReason",
            "desiredActivityTypes",
            "goal",
            "topic",
            "targetDurationMinutes",
            "maxSteps",
            "preferredPace",
            "learnerConstraints",
            "learningMode",
            "repairOfPlan",
            "guardianBlockReasons",
            "userIntent",
            "triggerType",
            "diagnosticPattern",
            "mentalDebuggerReflection",
            "activeRepairCount",
            "interventionBudget",
            "overloadSignal",
            "previousValidation",
            "trigger",
            "patchProposal",
            "calibrationSignal",
            "strategySummary",
            "agentHints",
            "timelineEvents",
            "mentalDebuggerSummary",
            "surface",
            "route",
            "sidebarState",
            "dismissedHintIds",
            "hiddenCategories",
            "proposedAction",
            "policyContext",
            "candidateModes",
            "deterministicFallback",
            "forbiddenModes",
            "recentModes",
            "learnerPreferences",
            "branchPolicy",
            "prerequisiteStrictness",
            "detourBudget",
            "targetOutcome",
            "knownKnowledgeState",
            "knownGaps",
            "activeBranchState",
            "branchDriftSummary",
            "revisionScope",
            "blockedPrerequisites",
            "focusShiftSignals",
            "knowledgeStateDelta",
            "learnerIntentSummary",
            "taxonomyDomain",
            "taxonomyId",
            "currentVersion",
            "labelIds",
            "taxonomySnapshot",
            "evidenceClusters",
            "impactContext",
            "preflightArtifacts",
            "sourcePolicy",
            "artifactScope",
            "pedagogicalMove",
            "personalizationPolicy",
            "purpose",
        ):
            if key in request.payload:
                composite_input[key] = request.payload[key]
        # request.document_ids is the authoritative source; payload["documentIds"] is
        # a legacy fallback only when the top-level field is absent.
        if request.document_ids:
            composite_input["documentIds"] = request.document_ids
        elif "documentIds" in request.payload:
            composite_input["documentIds"] = request.payload["documentIds"]
        if request.desired_card_types:
            composite_input["desiredCardTypes"] = request.desired_card_types

        context_pack = await self._composites.execute(
            wrapper.primary_composite_tool, composite_input, request.user_id
        )
        if wrapper.execution_mode in {"curriculum_outline", "curriculum_draft", "curriculum_revision"}:
            return await self._augment_curriculum_context(
                wrapper=wrapper,
                request=request,
                context_pack=context_pack,
            )
        return context_pack

    async def _augment_curriculum_context(
        self,
        *,
        wrapper: AgentWrapperDefinition,
        request: AgentRunRequest,
        context_pack: dict[str, Any],
    ) -> dict[str, Any]:
        sections = list(context_pack.get("sections", []))
        errors = list(context_pack.get("errors", []))

        prompt_seed = ContentCreationPromptBuilder().build(
            request=request,
            raw_context=context_pack,
            run_id="curriculum_prefetch",
        )
        learner_summary = LearnerStateSummarizerAgent().summarize(
            request=request,
            prompt_seed=prompt_seed,
        )
        sections.append(
            {
                "key": "learnerStateSummary",
                "title": "Learner State Summary",
                "authorityLabel": "agent_summary",
                "sourceService": "agents-runtime",
                "value": learner_summary,
                "freshness": {
                    "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "ttlMs": 30000,
                    "replayable": False,
                    "mayRefreshLive": True,
                },
            }
        )

        graph_readiness = await GraphInterventionOrchestrator().build_readiness(
            request=KnowledgeGraphRequest.model_validate(
                {
                    "userId": request.user_id,
                    "conceptIds": request.concept_ids,
                    "selectedNodeIds": request.selected_node_ids,
                    "documentIds": request.document_ids,
                    "proposalType": "content_readiness",
                    "studyMode": request.study_mode,
                    "candidateLabels": request.payload.get("focusAreas", []),
                    "domain": request.payload.get("domain"),
                    "contextPack": context_pack,
                    "provider": wrapper.provider,
                    "model": wrapper.model,
                    "agentRunId": "curriculum_graph_readiness",
                    "executionStrategy": "realtime",
                    "batchRequested": False,
                }
            ),
            context_pack=context_pack,
            agent_run_id="curriculum_graph_readiness",
        )
        sections.append(
            {
                "key": "graphReadiness",
                "title": "Graph Readiness",
                "authorityLabel": "agent_summary",
                "sourceService": "agents-runtime",
                "value": graph_readiness,
                "freshness": {
                    "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "ttlMs": 30000,
                    "replayable": False,
                    "mayRefreshLive": True,
                },
            }
        )

        planner_brief = self._build_curriculum_planner_brief(
            request=request,
            context_pack={**context_pack, "sections": sections},
            learner_summary=learner_summary,
            graph_readiness=graph_readiness,
        )

        return {
            **context_pack,
            "summary": f"{context_pack.get('summary', 'Curriculum context assembled.')} Added learner-state and graph-readiness orchestration artifacts.",
            "sections": sections,
            "errors": errors,
            "curriculumPlannerBrief": planner_brief,
            "collaboratorArtifacts": {
                "learnerStateSummary": learner_summary,
                "graphReadiness": graph_readiness,
            },
        }

    def _build_curriculum_planner_brief(
        self,
        *,
        request: AgentRunRequest,
        context_pack: dict[str, Any],
        learner_summary: dict[str, Any],
        graph_readiness: dict[str, Any],
    ) -> dict[str, Any]:
        def _section_value(key: str) -> Any:
            for section in context_pack.get("sections", []):
                if isinstance(section, dict) and section.get("key") == key:
                    return section.get("value")
            return None

        branch_states = _section_value("branchStateSummary")
        blocked_prerequisites = _section_value("blockedPrerequisites")
        focus_area_options = _section_value("focusAreaOptions")
        coverage_gaps = _section_value("coverageGapsByBranch")
        revision_proposals = _section_value("revisionProposals")
        triggering_evidence = _section_value("triggeringEvidence")

        branch_policy = request.payload.get("branchPolicy", "adaptive_short_detours")
        prerequisite_strictness = request.payload.get(
            "prerequisiteStrictness", "strict_return_to_prerequisites"
        )
        return {
            "objective": (
                "Design a coherent personalized curriculum DAG that adapts to learner readiness "
                "without allowing prerequisite debt to accumulate."
            ),
            "plainLanguageLearnerState": learner_summary,
            "structuralRiskSummary": {
                "graphReadiness": graph_readiness,
                "blockedPrerequisites": blocked_prerequisites,
                "coverageGapsByBranch": coverage_gaps,
                "triggeringEvidence": triggering_evidence,
            },
            "selectedPolicies": {
                "branchPolicy": branch_policy,
                "prerequisiteReturnPolicy": prerequisite_strictness,
                "detourRule": "Short adaptive detours are allowed, but the learner must return to prerequisite repair soon.",
            },
            "planningInputs": {
                "branchStateSummary": branch_states,
                "focusAreaOptions": focus_area_options,
                "revisionProposals": revision_proposals,
            },
            "allowedEdgeTypes": [
                "prerequisite",
                "recommended_before",
                "reinforces",
                "branch_option",
                "diversion_to",
            ],
            "allowedRevisionChangeKinds": [
                "add_branch_option",
                "close_branch_option",
                "insert_diversion_path",
                "rejoin_branch",
                "promote_focus_branch",
                "demote_focus_branch",
                "add_node",
                "split_node",
                "insert_prerequisite",
                "remove_edge",
                "retarget_edge",
                "reorder",
                "adjust_threshold",
                "relabel_node",
            ],
        }

    def _curriculum_section_value(self, context_pack: dict[str, Any], key: str) -> Any:
        for section in context_pack.get("sections", []):
            if isinstance(section, dict) and section.get("key") == key:
                return section.get("value")
        return None

    async def _prepare_learner_facing_readiness(
        self,
        *,
        wrapper: AgentWrapperDefinition,
        request: AgentRunRequest,
        context_pack: dict[str, Any],
        provider_tools: list[dict[str, Any]],
    ) -> dict[str, Any]:
        if wrapper.execution_mode not in {"mental_debugger", "calibration_coach"}:
            return context_pack

        sections = list(context_pack.get("sections", []))
        errors = list(context_pack.get("errors", []))
        service_manifest = list(context_pack.get("serviceInputManifest", []))
        surface = (
            "mental_debugger"
            if wrapper.execution_mode == "mental_debugger"
            else "calibration_coach"
        )

        prerequisite_artifacts: dict[str, Any] = {}
        policy = await self._build_watchtower_policy_context(
            wrapper=wrapper,
            request=request,
            context_pack={**context_pack, "sections": sections},
            surface=surface,
        )
        sections.append(
            _runtime_section(
                key="watchtowerPolicyContext",
                title="Watchtower Policy Context",
                source_service="agents-runtime",
                value=policy,
                authority_label="policy",
            )
        )

        lesson_handoff = _lesson_plan_handoff_context(sections, request)
        sections.append(
            _runtime_section(
                key="lessonPlanHandoffContext",
                title="Lesson Plan Handoff Context",
                source_service="agents-runtime",
                value=lesson_handoff,
                authority_label="deterministic_projection",
            )
        )

        need_patch = _needs_patch_planner(wrapper.execution_mode, sections, request)
        if need_patch:
            patch_request = PatchPlannerRequest.model_validate(
                {
                    "userId": request.user_id,
                    "sessionId": request.session_id,
                    "stepId": request.step_id,
                    "conceptIds": request.concept_ids,
                    "studyMode": request.study_mode,
                    "triggerType": request.payload.get("triggerType"),
                    "userIntent": request.payload.get("userIntent", {}),
                    "contextPack": {**context_pack, "sections": sections},
                    "provider": wrapper.provider,
                    "model": wrapper.model,
                    "agentRunId": f"prereq_patch_{create_run_id()}",
                    "executionStrategy": "realtime",
                    "batchRequested": False,
                }
            )
            patch_artifact = await PatchPlannerAgent(self._guardian).plan(patch_request)
            prerequisite_artifacts["patchPlannerHandoffContext"] = _patch_handoff_context(patch_artifact)
            sections.append(
                _runtime_section(
                    key="patchPlannerHandoffContext",
                    title="Patch Planner Handoff Context",
                    source_service="agents-runtime",
                    value=prerequisite_artifacts["patchPlannerHandoffContext"],
                    authority_label="agent_inference",
                )
            )

        need_strategy = _needs_strategy_planner(sections, request)
        if need_strategy and request.session_id is not None:
            strategy_request = StrategyReplanningRequest.model_validate(
                {
                    "userId": request.user_id,
                    "sessionId": request.session_id,
                    "stepId": request.step_id,
                    "conceptIds": request.concept_ids,
                    "studyMode": request.study_mode,
                    "trigger": request.payload.get("trigger", {}),
                    "patchProposal": prerequisite_artifacts.get("patchPlannerHandoffContext", {}),
                    "calibrationSignal": _first_section_value(sections, "calibrationTrendSummary"),
                    "contextPack": {**context_pack, "sections": sections},
                    "provider": wrapper.provider,
                    "model": wrapper.model,
                    "agentRunId": f"prereq_strategy_{create_run_id()}",
                    "executionStrategy": "realtime",
                    "batchRequested": False,
                }
            )
            strategy_artifact = await StrategyReplanningAgent(self._guardian).replan(strategy_request)
            prerequisite_artifacts["strategyHandoffContext"] = _strategy_handoff_context(strategy_artifact)
            sections.append(
                _runtime_section(
                    key="strategyHandoffContext",
                    title="Strategy Handoff Context",
                    source_service="agents-runtime",
                    value=prerequisite_artifacts["strategyHandoffContext"],
                    authority_label="agent_inference",
                )
            )

        if wrapper.execution_mode == "calibration_coach" and _needs_debugger_summary_for_calibration(sections):
            prerequisite_artifacts["debuggerSummaryForCalibration"] = _debugger_summary_for_calibration(sections)
            sections.append(
                _runtime_section(
                    key="debuggerSummaryForCalibration",
                    title="Debugger Summary For Calibration",
                    source_service="agents-runtime",
                    value=prerequisite_artifacts["debuggerSummaryForCalibration"],
                    authority_label="deterministic_projection",
                )
            )

        readiness = _build_input_readiness_report(
            target_agent=wrapper.name,
            operation=_operation_for_request(request),
            sections=sections,
            errors=errors,
            service_manifest=service_manifest,
            provider_tools=provider_tools,
            prerequisite_artifacts=prerequisite_artifacts,
            policy=policy,
            execution_mode=wrapper.execution_mode,
        )
        sections.append(
            _runtime_section(
                key="agentInputReadinessReport",
                title="Agent Input Readiness Report",
                source_service="agents-runtime",
                value=readiness,
                authority_label="validation_result",
            )
        )

        blocked_states = {
            "deferred_missing_deterministic_context",
            "deferred_waiting_for_prerequisite_agent",
            "hidden_by_policy",
            "blocked_by_validation",
            "blocked_by_stale_context",
        }
        if readiness["readinessState"] in blocked_states:
            raise UserFacingAgentError(
                message=f"{wrapper.name} is not ready to run yet.",
                reason_code=str(readiness["readinessState"]),
                detail="; ".join(readiness["blockingReasons"]),
                retryable=readiness["readinessState"].startswith("deferred"),
                status_code=403 if readiness["readinessState"] == "hidden_by_policy" else 409,
            )

        return {
            **context_pack,
            "sections": sections,
            "errors": errors,
            "serviceInputManifest": service_manifest,
            "agentInputReadinessReport": readiness,
            "watchtowerPolicyContext": policy,
            "prerequisiteArtifacts": prerequisite_artifacts,
            "summary": (
                f"{context_pack.get('summary', 'Learner-facing context assembled.')} "
                f"Readiness: {readiness['readinessState']}."
            ),
        }

    async def _build_watchtower_policy_context(
        self,
        *,
        wrapper: AgentWrapperDefinition,
        request: AgentRunRequest,
        context_pack: dict[str, Any],
        surface: str,
    ) -> dict[str, Any]:
        requested_data_classes = request.payload.get("requestedDataClasses")
        if not isinstance(requested_data_classes, list):
            requested_data_classes = ["prompt_safe_trace_summary"]
        proposed_action = {
            "targetAgent": wrapper.name,
            "surface": surface,
            "requestedDataClasses": requested_data_classes,
            "requiresReview": False,
        }
        wt_request = WatchtowerGovernanceRequest.model_validate(
            {
                "userId": request.user_id,
                "sessionId": request.session_id,
                "stepId": request.step_id,
                "surface": surface,
                "proposedAction": proposed_action,
                "policyContext": request.payload.get("policyContext", {}),
                "contextPack": context_pack,
                "provider": wrapper.provider,
                "model": wrapper.model,
                "agentRunId": f"prereq_watchtower_{create_run_id()}",
                "executionStrategy": "realtime",
                "batchRequested": False,
            }
        )
        decision = await WatchtowerGovernanceAgent().govern(wt_request)
        load_state = _first_section_value(context_pack.get("sections", []), "learnerLoadState")
        budget = _first_section_value(context_pack.get("sections", []), "exposureBudgetState")
        feedback = _first_section_value(context_pack.get("sections", []), "learnerFeedbackHistory")
        overload = str(load_state.get("overloadRiskLevel") or "low")
        quiet_surface = bool(budget.get("mustUseQuietSurface", False)) or overload == "high"
        hidden = decision.get("state") in {"hidden_by_policy", "privacy_blocked"}
        deferred = decision.get("state") == "deferred" or (overload == "high" and not request.payload.get("userExplicitlyRequested"))
        return {
            "privacyClass": decision.get("privacyClass", "standard"),
            "traceVisibility": "minimized_trace_summary" if not hidden else "hidden",
            "surfaceVisibility": "hidden" if hidden else "quiet" if quiet_surface or deferred else "prominent_allowed",
            "intrusionRiskLevel": "high" if overload == "high" else "medium" if quiet_surface else "low",
            "frustrationOrOverloadPolicyText": load_state.get("recommendedToneText", "Use standard learner-safe tone."),
            "allowedDetailLevelText": _allowed_detail_from_feedback(feedback, quiet_surface),
            "canShowDebuggerNow": surface == "mental_debugger" and not hidden and not deferred,
            "canShowCalibrationNow": surface == "calibration_coach" and not hidden and not deferred,
            "mustDeferNow": deferred,
            "mustUseQuietDashboardSurface": quiet_surface,
            "mustMinimizeTraceEvidence": True,
            "learnerFacingPolicyText": decision.get("friendlyWhy", "Use minimized, learner-safe policy wording."),
            "watchtowerDecision": decision,
            "serviceReferences": {
                "sessionId": request.session_id,
                "stepId": request.step_id,
                "governanceDecisionId": decision.get("governanceDecisionId"),
            },
        }

    def _render_prompt(
        self,
        tool_belt: ToolBeltDefinition,
        wrapper: AgentWrapperDefinition,
        request: AgentRunRequest,
        context_pack: dict[str, Any],
    ) -> PromptEnvelope:
        sections = context_pack.get("sections", [])
        operation_profile = self._resolve_operation_profile(wrapper, request)
        scope = self._resolved_scope(wrapper, request)
        scope_type = (
            str(scope.get("scopeType"))
            if isinstance(scope, dict) and isinstance(scope.get("scopeType"), str)
            else None
        )
        operation_instructions = operation_profile.instructions if operation_profile is not None else []
        scope_instructions = (
            operation_profile.scope_instructions.get(scope_type, [])
            if operation_profile is not None and scope_type is not None
            else []
        )
        service_input_manifest = context_pack.get("serviceInputManifest") or [
            {
                "key": section.get("key"),
                "sourceService": section.get("sourceService"),
                "authorityLabel": section.get("authorityLabel"),
                "freshness": section.get("freshness"),
            }
            for section in sections
            if isinstance(section, dict)
        ]
        output_contract = context_pack.get("outputContract", _output_contract_for(wrapper))
        prompt_profile_version = (
            request.prompt_profile_version
            or (None if operation_profile is None else operation_profile.prompt_profile_version)
        )
        output_schema_id = (
            output_contract.get("schema")
            if operation_profile is None
            else operation_profile.output_schema_id
        )
        return PromptEnvelope(
            templateId=f"{wrapper.name}.v1",
            systemInstructions=[
                f"You are the {wrapper.name} for Noema.",
                *wrapper.instructions,
                *operation_instructions,
                *scope_instructions,
                "Use only the assigned tool belt and respect reviewed-write by default.",
                "Distinguish recorded facts from agent inferences and proposals.",
                "Authority labels in the context pack are binding: recorded facts, detected signals, user-provided intent, agent inferences, proposals, and validation results.",
            ],
            operationName=None if operation_profile is None else operation_profile.operation_name,
            promptProfileVersion=prompt_profile_version,
            promptBuilderId=None if operation_profile is None else operation_profile.prompt_builder_id,
            outputSchemaId=output_schema_id,
            scope=scope,
            slots={
                "agentName": wrapper.name,
                "purpose": wrapper.purpose,
                "userId": request.user_id,
                "sessionId": request.session_id,
                "curriculumId": request.curriculum_id,
                "stepId": request.step_id,
                "conceptIds": request.concept_ids,
                "selectedNodeIds": request.selected_node_ids,
                "selectedCardIds": request.selected_card_ids,
                "payload": request.payload,
                "contextSummary": context_pack.get("summary"),
                "contextSections": sections,
                "serviceInputManifest": service_input_manifest,
                "prefetch": {
                    "strategy": "context_stuffed_before_model_call",
                    "compositeTool": context_pack.get("compositeTool"),
                    "sectionCount": len(sections) if isinstance(sections, list) else 0,
                    "complete": len(context_pack.get("errors", [])) == 0,
                    "errors": context_pack.get("errors", []),
                },
                "outputContract": output_contract,
                "promptRouting": {
                    "wrapperName": wrapper.name,
                    "executionMode": wrapper.execution_mode,
                    "operationName": None if operation_profile is None else operation_profile.operation_name,
                    "promptProfileVersion": prompt_profile_version,
                    "promptBuilderId": None if operation_profile is None else operation_profile.prompt_builder_id,
                    "outputSchemaId": output_schema_id,
                    "scope": scope,
                },
                "openQuestions": context_pack.get("openQuestions", []),
                "curriculumPlannerBrief": context_pack.get("curriculumPlannerBrief"),
                "toolBelt": tool_belt.model_dump(by_alias=True),
                "providerTools": context_pack.get("providerTools", _provider_tool_catalog(tool_belt)),
                "contentCreationPrompt": (
                    context_pack if context_pack.get("schemaVersion") == "content_creation_prompt.v2" else None
                ),
                "transformCardTypeCatalogue": (
                    _TRANSFORM_CARD_TYPE_CATALOG if wrapper.name == "content-transform-agent" else None
                ),
            },
        )

    async def _run_content_creation_orchestrator(
        self,
        *,
        wrapper: AgentWrapperDefinition,
        request: AgentRunRequest,
        execution_plan: ExecutionPlan,
        run_id: str,
        context_pack: dict[str, Any],
        prompt: PromptEnvelope | None,
    ) -> dict[str, Any]:
        builder = ContentCreationPromptBuilder()
        content_operation_name = _resolve_content_operation_name(request)
        request.payload.setdefault("operationName", content_operation_name)
        raw_context = context_pack.get("rawContext") if isinstance(context_pack.get("rawContext"), dict) else context_pack
        graph_prefetch = await self._composites.execute(
            "get-graph-proposal-context",
            {
                "userId": request.user_id,
                "conceptIds": request.concept_ids,
                "selectedNodeIds": request.selected_node_ids,
                "documentIds": request.document_ids,
                "proposalType": "content_readiness",
                "studyMode": request.study_mode,
                "domain": request.payload.get("domain"),
            },
            request.user_id,
        )
        graph_raw_context = (
            graph_prefetch.get("rawContext")
            if isinstance(graph_prefetch.get("rawContext"), dict)
            else graph_prefetch
        )

        intent = ContentIntentNormalizerAgent().normalize(request=request, context_pack=raw_context)
        seed_prompt = builder.build(
            request=request,
            raw_context=raw_context,
            run_id=run_id,
            preflight={"intent": intent},
        )
        learner_state = LearnerStateSummarizerAgent().summarize(
            request=request, prompt_seed=seed_prompt
        )
        pedagogy_plan = ContentPedagogyPlannerAgent().plan(
            request=request, prompt_seed=seed_prompt
        )
        graph_readiness = await GraphInterventionOrchestrator().build_readiness(
            request=KnowledgeGraphRequest.model_validate(
                {
                    "userId": request.user_id,
                    "conceptIds": request.concept_ids,
                    "selectedNodeIds": request.selected_node_ids,
                    "documentIds": request.document_ids,
                    "proposalType": "content_readiness",
                    "domain": request.payload.get("domain"),
                    "studyMode": request.study_mode,
                    "candidateLabels": request.payload.get("candidateLabels", []),
                    "contextPack": graph_raw_context,
                    "provider": wrapper.provider,
                    "model": wrapper.model,
                    "agentRunId": run_id,
                    "executionStrategy": execution_plan.strategy,
                    "batchRequested": execution_plan.strategy == "batch",
                }
            ),
            context_pack=graph_raw_context,
            agent_run_id=run_id,
        )
        if graph_readiness.get("status") != "finalized":
            anchor_request = KnowledgeGraphRequest.model_validate(
                {
                    "userId": request.user_id,
                    "conceptIds": request.concept_ids,
                    "selectedNodeIds": request.selected_node_ids,
                    "documentIds": request.document_ids,
                    "proposalType": "anchor",
                    "studyMode": request.study_mode,
                    "candidateLabels": request.payload.get("candidateLabels", []),
                    "domain": request.payload.get("domain"),
                    "contextPack": graph_raw_context,
                    "provider": wrapper.provider,
                    "model": wrapper.model,
                    "agentRunId": run_id,
                    "executionStrategy": execution_plan.strategy,
                    "batchRequested": execution_plan.strategy == "batch",
                }
            )
            anchor_result = await KnowledgeGraphAgent().propose(anchor_request)
            if prompt is not None:
                prompt.slots["contextSections"] = []
                prompt.slots["contextSummary"] = "Graph subgraph generation is required before content creation can continue."
                prompt.slots["prefetch"] = {
                    "strategy": "orchestrated_preflight_before_model_call",
                    "compositeTool": "get-content-creator-brief",
                    "sectionCount": 0,
                    "complete": False,
                    "errors": graph_readiness.get("blockedReasons", []),
                }
            return {
                "mode": "content_creation_orchestrator",
                "operationName": content_operation_name,
                "strategy": execution_plan.strategy,
                "preflightArtifacts": {
                    "intent": intent,
                    "learnerStateSummary": learner_state,
                    "pedagogyPlan": pedagogy_plan,
                    "graphReadiness": graph_readiness,
                },
                "contentCreationPrompt": builder.build(
                    request=request,
                    raw_context={"sections": [], "summary": "Graph readiness is blocked pending graph generation.", "errors": []},
                    run_id=run_id,
                    preflight={
                        "intent": intent,
                        "learnerStateSummary": learner_state,
                        "pedagogyPlan": pedagogy_plan,
                        "graphReadiness": graph_readiness,
                    },
                ),
                "result": _graph_confirmation_result(
                    run_id=run_id,
                    request=request,
                    graph_readiness=graph_readiness,
                    anchor_result=anchor_result,
                ),
            }
        preflight = {
            "intent": intent,
            "learnerStateSummary": learner_state,
            "pedagogyPlan": pedagogy_plan,
            "graphReadiness": graph_readiness,
        }
        content_prefetch_payload = {
            "userId": request.user_id,
            "operationName": content_operation_name,
            "conceptIds": request.concept_ids,
            "selectedNodeIds": request.selected_node_ids,
            "documentIds": request.document_ids,
            "curriculumId": request.curriculum_id,
            "sessionId": request.session_id,
            "studyMode": request.study_mode,
            "desiredCardTypes": request.desired_card_types,
            "desiredActivityTypes": request.payload.get("desiredActivityTypes", []),
            "mode": request.payload.get("mode", "agent_autonomous"),
            "sourcePolicy": request.payload.get("sourcePolicy"),
            "artifactScope": request.payload.get("artifactScope"),
            "pedagogicalMove": request.payload.get("pedagogicalMove"),
            "personalizationPolicy": request.payload.get("personalizationPolicy"),
            "purpose": request.payload.get("purpose"),
            "budget": request.payload.get("budget", {}),
            "varietyMandate": request.payload.get("varietyMandate", {}),
            "preflightArtifacts": preflight,
        }
        content_prefetch = await self._composites.execute(
            "get-content-creator-brief", content_prefetch_payload, request.user_id
        )
        raw_context = (
            content_prefetch.get("rawContext")
            if isinstance(content_prefetch.get("rawContext"), dict)
            else content_prefetch
        )
        final_prompt = builder.build(
            request=request,
            raw_context=raw_context,
            run_id=run_id,
            preflight=preflight,
        )
        readiness_errors = builder.readiness_errors(final_prompt)
        if readiness_errors:
            raise ValueError(
                "Content creation prompt is not ready: " + "; ".join(readiness_errors)
            )
        if prompt is not None:
            prompt.slots["contentCreationPrompt"] = final_prompt
            prompt.slots["contextSections"] = []
            prompt.slots["contextSummary"] = "ContentCreationPromptV2 ready for content creation."
            prompt.slots["serviceInputManifest"] = content_prefetch.get("serviceInputManifest", [])
            prompt.slots["prefetch"] = {
                "strategy": "orchestrated_preflight_before_model_call",
                "compositeTool": "get-content-creator-brief",
                "sectionCount": len(raw_context.get("sections", [])) if isinstance(raw_context.get("sections"), list) else 0,
                "complete": len(content_prefetch.get("errors", [])) == 0,
                "errors": content_prefetch.get("errors", []),
            }

        self._ensure_realtime_content_generation_is_available(wrapper=wrapper)

        creator_request = ContentCreatorRequest.model_validate(
            {
                "userId": request.user_id,
                "operationName": content_operation_name,
                "mode": final_prompt["serviceContract"]["requestValues"]["mode"],
                "conceptIds": final_prompt["serviceContract"]["requestValues"]["conceptIds"] or request.concept_ids,
                "selectedNodeIds": request.selected_node_ids,
                "curriculumId": request.curriculum_id,
                "sessionId": request.session_id,
                "documentIds": request.document_ids,
                "desiredCardTypes": request.desired_card_types,
                "desiredActivityTypes": request.payload.get("desiredActivityTypes", []),
                "studyMode": request.study_mode,
                "budget": request.payload.get("budget", {}),
                "contextPack": final_prompt,
                "provider": wrapper.provider,
                "model": wrapper.model,
                "agentRunId": run_id,
                "executionStrategy": execution_plan.strategy,
                "batchRequested": execution_plan.strategy == "batch",
            }
        )
        try:
            generated_json, model_routing = await self._execute_realtime_json(
                wrapper=wrapper,
                request=request,
                run_id=run_id,
                context_pack=final_prompt,
                prompt=prompt,
            )
        except httpx.HTTPStatusError as error:
            provider_name = wrapper.provider or "the AI service"
            raise UserFacingAgentError(
                message="We couldn't generate content right now because the AI service is unavailable. Please try again in a moment.",
                reason_code="content_generation_provider_unavailable",
                detail=(
                    f"Provider '{provider_name}' returned HTTP {error.response.status_code}: "
                    f"{error.response.text.strip() or error.response.reason_phrase}"
                ),
                retryable=error.response.status_code in {429, 503, 504},
                status_code=503 if error.response.status_code in {429, 503, 504} else 502,
            ) from error
        if generated_json is None:
            raise UserFacingAgentError(
                message="We couldn't generate content for this concept just now. The model responded, but the result was incomplete. Please try again.",
                reason_code="content_generation_incomplete_result",
                detail="Realtime content generation returned no structured JSON result for the finalized prompt.",
                retryable=True,
                status_code=502,
            )
        content_agent = ContentCreatorAgent(self._guardian)
        result = await content_agent.finalize_created_content(
            generated=generated_json,
            request=creator_request,
        )
        return {
            "mode": "content_creation_orchestrator",
            "operationName": content_operation_name,
            "strategy": execution_plan.strategy,
            "modelRouting": model_routing,
            "preflightArtifacts": preflight,
            "contentCreationPrompt": final_prompt,
            "result": result,
        }

    async def _execute(
        self,
        wrapper: AgentWrapperDefinition,
        request: AgentRunRequest,
        execution_plan: ExecutionPlan,
        run_id: str,
        context_pack: dict[str, Any] | None,
        prompt: PromptEnvelope | None = None,
    ) -> dict[str, Any] | None:
        if wrapper.execution_mode == "preview":
            return None

        if wrapper.execution_mode == "content_intent_normalizer":
            result = ContentIntentNormalizerAgent().normalize(
                request=request, context_pack=context_pack or {}
            )
            return {
                "mode": "content_intent_normalizer",
                "strategy": execution_plan.strategy,
                "result": result,
            }

        if wrapper.execution_mode == "learner_state_summarizer":
            seed = ContentCreationPromptBuilder().build(
                request=request, raw_context=context_pack or {}, run_id=run_id
            )
            result = LearnerStateSummarizerAgent().summarize(request=request, prompt_seed=seed)
            return {
                "mode": "learner_state_summarizer",
                "strategy": execution_plan.strategy,
                "result": result,
            }

        if wrapper.execution_mode == "content_pedagogy_planner":
            seed = ContentCreationPromptBuilder().build(
                request=request, raw_context=context_pack or {}, run_id=run_id
            )
            result = ContentPedagogyPlannerAgent().plan(request=request, prompt_seed=seed)
            return {
                "mode": "content_pedagogy_planner",
                "strategy": execution_plan.strategy,
                "result": result,
            }

        if wrapper.execution_mode == "content_creation_orchestrator":
            return await self._run_content_creation_orchestrator(
                wrapper=wrapper,
                request=request,
                execution_plan=execution_plan,
                run_id=run_id,
                context_pack=context_pack or {},
                prompt=prompt,
            )

        if wrapper.execution_mode == "graph_intervention_orchestrator":
            operation_profile = self._resolve_operation_profile(wrapper, request)
            operation_name = (
                operation_profile.operation_name
                if operation_profile is not None
                else normalize_graph_operation_name(request.payload.get("proposalType", "content_readiness"))
            )
            result = await GraphInterventionOrchestrator().build_readiness(
                request=KnowledgeGraphRequest.model_validate(
                    {
                        "userId": request.user_id,
                        "conceptIds": request.concept_ids,
                        "selectedNodeIds": request.selected_node_ids,
                        "documentIds": request.document_ids,
                        "graphExpansionScope": request.graph_expansion_scope or {},
                        "proposalType": operation_name,
                        "operationName": operation_name,
                        "studyMode": request.study_mode,
                        "candidateLabels": request.payload.get("candidateLabels", []),
                        "domain": request.payload.get("domain"),
                        "contextPack": context_pack or {},
                        "provider": wrapper.provider,
                        "model": wrapper.model,
                        "agentRunId": run_id,
                        "executionStrategy": execution_plan.strategy,
                        "batchRequested": execution_plan.strategy == "batch",
                    }
                ),
                context_pack=context_pack or {},
                agent_run_id=run_id,
            )
            return {
                "mode": "graph_intervention_orchestrator",
                "strategy": execution_plan.strategy,
                "result": result,
            }

        if wrapper.execution_mode == "calibration_coach":
            coach = CalibrationCoachAgent(self._guardian)
            result = await coach.coach(
                CalibrationCoachRequest.model_validate(
                    {
                        "userId": request.user_id,
                        "sessionId": request.session_id,
                        "stepId": request.step_id,
                        "conceptIds": request.concept_ids,
                        "studyMode": request.study_mode,
                        "userIntent": request.payload.get("userIntent", {}),
                        "contextPack": context_pack or {},
                        "provider": wrapper.provider,
                        "model": wrapper.model,
                        "agentRunId": run_id,
                        "executionStrategy": execution_plan.strategy,
                        "batchRequested": execution_plan.strategy == "batch",
                    }
                )
            )
            return {
                "mode": "calibration_coach",
                "strategy": execution_plan.strategy,
                "result": result,
            }

        if wrapper.execution_mode == "mental_debugger":
            debugger = MentalDebuggerAgent(self._guardian)
            debugger_request = MentalDebuggerRequest.model_validate(
                {
                    "userId": request.user_id,
                    "sessionId": request.session_id,
                    "stepId": request.step_id,
                    "conceptIds": request.concept_ids,
                    "studyMode": request.study_mode,
                    "userIntent": request.payload.get("userIntent", {}),
                    "contextPack": context_pack or {},
                    "provider": wrapper.provider,
                    "model": wrapper.model,
                    "agentRunId": run_id,
                    "executionStrategy": execution_plan.strategy,
                    "batchRequested": execution_plan.strategy == "batch",
                }
            )
            generated_json, model_routing = await self._execute_realtime_json(
                wrapper=wrapper,
                request=request,
                run_id=run_id,
                context_pack=context_pack or {},
                prompt=prompt,
            )
            if generated_json is not None:
                result = await debugger.finalize_reflection(
                    generated=generated_json,
                    request=debugger_request,
                )
            else:
                result = await debugger.debug(debugger_request)
            return {
                "mode": "mental_debugger",
                "strategy": execution_plan.strategy,
                "modelRouting": model_routing,
                "result": result,
            }

        if wrapper.execution_mode == "patch_planner":
            planner = PatchPlannerAgent(self._guardian)
            planner_request = PatchPlannerRequest.model_validate(
                {
                    "userId": request.user_id,
                    "sessionId": request.session_id,
                    "stepId": request.step_id,
                    "conceptIds": request.concept_ids,
                    "studyMode": request.study_mode,
                    "triggerType": request.payload.get("triggerType"),
                    "userIntent": request.payload.get("userIntent", {}),
                    "contextPack": context_pack or {},
                    "provider": wrapper.provider,
                    "model": wrapper.model,
                    "agentRunId": run_id,
                    "executionStrategy": execution_plan.strategy,
                    "batchRequested": execution_plan.strategy == "batch",
                }
            )
            generated_json, model_routing = await self._execute_realtime_json(
                wrapper=wrapper,
                request=request,
                run_id=run_id,
                context_pack=context_pack or {},
                prompt=prompt,
            )
            if generated_json is not None:
                result = await planner.finalize_patch(
                    generated=generated_json,
                    request=planner_request,
                )
            else:
                result = await planner.plan(planner_request)
            return {
                "mode": "patch_planner",
                "strategy": execution_plan.strategy,
                "modelRouting": model_routing,
                "result": result,
            }

        if wrapper.execution_mode == "strategy_replanning":
            strategy_agent = StrategyReplanningAgent(self._guardian)
            strategy_request = StrategyReplanningRequest.model_validate(
                {
                    "userId": request.user_id,
                    "sessionId": request.session_id,
                    "stepId": request.step_id,
                    "conceptIds": request.concept_ids,
                    "studyMode": request.study_mode,
                    "trigger": request.payload.get("trigger", {}),
                    "patchProposal": request.payload.get("patchProposal", {}),
                    "calibrationSignal": request.payload.get("calibrationSignal", {}),
                    "contextPack": context_pack or {},
                    "provider": wrapper.provider,
                    "model": wrapper.model,
                    "agentRunId": run_id,
                    "executionStrategy": execution_plan.strategy,
                    "batchRequested": execution_plan.strategy == "batch",
                }
            )
            generated_json, model_routing = await self._execute_realtime_json(
                wrapper=wrapper,
                request=request,
                run_id=run_id,
                context_pack=context_pack or {},
                prompt=prompt,
            )
            if generated_json is not None:
                result = await strategy_agent.finalize_replan(
                    generated=generated_json,
                    request=strategy_request,
                )
            else:
                result = await strategy_agent.replan(strategy_request)
            return {
                "mode": "strategy_replanning",
                "strategy": execution_plan.strategy,
                "modelRouting": model_routing,
                "result": result,
            }

        if wrapper.execution_mode == "cognitive_copilot":
            copilot = CognitiveCopilotAgent(self._guardian)
            copilot_request = CognitiveCopilotRequest.model_validate(
                {
                    "userId": request.user_id,
                    "sessionId": request.session_id,
                    "stepId": request.step_id,
                    "curriculumId": request.curriculum_id,
                    "conceptIds": request.concept_ids,
                    "studyMode": request.study_mode,
                    "surface": request.payload.get("surface", "sidebar"),
                    "contextPack": context_pack or {},
                    "provider": wrapper.provider,
                    "model": wrapper.model,
                    "agentRunId": run_id,
                    "executionStrategy": execution_plan.strategy,
                    "batchRequested": execution_plan.strategy == "batch",
                }
            )
            generated_json, model_routing = await self._execute_realtime_json(
                wrapper=wrapper,
                request=request,
                run_id=run_id,
                context_pack=context_pack or {},
                prompt=prompt,
            )
            if generated_json is not None:
                result = await copilot.finalize_readout(
                    generated=generated_json,
                    request=copilot_request,
                )
            else:
                result = await copilot.reflect(copilot_request)
            return {
                "mode": "cognitive_copilot",
                "strategy": execution_plan.strategy,
                "modelRouting": model_routing,
                "result": result,
            }

        if wrapper.execution_mode == "watchtower_governance":
            agent = WatchtowerGovernanceAgent()
            wt_request = WatchtowerGovernanceRequest.model_validate(
                {
                    "userId": request.user_id,
                    "sessionId": request.session_id,
                    "stepId": request.step_id,
                    "surface": request.payload.get("surface", "copilot"),
                    "proposedAction": request.payload.get("proposedAction", {}),
                    "agentHints": request.payload.get("agentHints", []),
                    "policyContext": request.payload.get("policyContext", {}),
                    "contextPack": context_pack or {},
                    "provider": wrapper.provider,
                    "model": wrapper.model,
                    "agentRunId": run_id,
                    "executionStrategy": execution_plan.strategy,
                    "batchRequested": execution_plan.strategy == "batch",
                }
            )
            generated_json, model_routing = await self._execute_realtime_json(
                wrapper=wrapper,
                request=request,
                run_id=run_id,
                context_pack=context_pack or {},
                prompt=prompt,
            )
            result = await agent.finalize_decision(
                generated=generated_json,
                request=wt_request,
            ) if generated_json is not None else await agent.govern(wt_request)
            return {
                "mode": "watchtower_governance",
                "strategy": execution_plan.strategy,
                "modelRouting": model_routing,
                "result": result,
            }

        if wrapper.execution_mode == "mode_preference":
            helper = ModePreferenceHelperAgent()
            mode_request = ModePreferenceRequest.model_validate(
                {
                    "userId": request.user_id,
                    "sessionId": request.session_id,
                    "stepId": request.step_id,
                    "candidateModes": request.payload.get("candidateModes", []),
                    "deterministicFallback": request.payload.get("deterministicFallback"),
                    "forbiddenModes": request.payload.get("forbiddenModes", []),
                    "recentModes": request.payload.get("recentModes", []),
                    "learnerPreferences": request.payload.get("learnerPreferences", {}),
                    "trigger": request.payload.get("trigger", {}),
                    "contextPack": context_pack or {},
                    "provider": wrapper.provider,
                    "model": wrapper.model,
                    "agentRunId": run_id,
                    "executionStrategy": execution_plan.strategy,
                    "batchRequested": execution_plan.strategy == "batch",
                }
            )
            generated_json, model_routing = await self._execute_realtime_json(
                wrapper=wrapper,
                request=request,
                run_id=run_id,
                context_pack=context_pack or {},
                prompt=prompt,
            )
            result = await helper.finalize_choice(
                generated=generated_json,
                request=mode_request,
            ) if generated_json is not None else await helper.choose(mode_request)
            return {
                "mode": "mode_preference",
                "strategy": execution_plan.strategy,
                "modelRouting": model_routing,
                "result": result,
            }

        if wrapper.execution_mode == "taxonomy_curator":
            curator = TaxonomyCuratorAgent()
            curator_request = TaxonomyCuratorRequest.model_validate(
                {
                    "userId": request.user_id,
                    "taxonomyDomain": request.payload.get("taxonomyDomain", "failure"),
                    "taxonomyId": request.payload.get("taxonomyId"),
                    "currentVersion": request.payload.get("currentVersion"),
                    "labelIds": request.payload.get("labelIds", []),
                    "conceptIds": request.concept_ids,
                    "contextPack": context_pack or {},
                    "provider": wrapper.provider,
                    "model": wrapper.model,
                    "agentRunId": run_id,
                    "executionStrategy": execution_plan.strategy,
                    "batchRequested": execution_plan.strategy == "batch",
                }
            )
            generated_json, model_routing = await self._execute_realtime_json(
                wrapper=wrapper,
                request=request,
                run_id=run_id,
                context_pack=context_pack or {},
                prompt=prompt,
            )
            result = await curator.finalize_proposal(
                generated=generated_json,
                request=curator_request,
            ) if generated_json is not None else await curator.curate(curator_request)
            return {
                "mode": "taxonomy_curator",
                "strategy": execution_plan.strategy,
                "modelRouting": model_routing,
                "result": result,
            }

        if wrapper.execution_mode == "pedagogy_guardian":
            guardian_agent = PedagogyGuardianAgent(self._guardian)
            result = await guardian_agent.validate(
                PedagogyGuardianRequest.model_validate(
                    {
                        "userId": request.user_id,
                        "artifactType": request.payload.get("artifactType", "activity"),
                        "artifact": request.payload.get("artifact", {}),
                        "producerService": request.payload.get("producerService", "agents-runtime"),
                        "producerAgent": request.payload.get("producerAgent"),
                        "contextPack": context_pack or {},
                        "provider": wrapper.provider,
                        "model": wrapper.model,
                        "agentRunId": run_id,
                        "executionStrategy": execution_plan.strategy,
                        "batchRequested": execution_plan.strategy == "batch",
                    }
                )
            )
            return {
                "mode": "pedagogy_guardian",
                "strategy": execution_plan.strategy,
                "result": result,
            }

        if wrapper.execution_mode == "ingestion_concept_extraction":
            document_id = (
                request.document_ids[0]
                if request.document_ids
                else str(request.payload.get("documentId", ""))
            )
            agent = IngestionConceptExtractionAgent(self._guardian)
            result = await agent.extract(
                IngestionConceptExtractionRequest.model_validate(
                    {
                        "userId": request.user_id,
                        "documentId": document_id,
                        "ingestionJobId": request.payload.get("ingestionJobId"),
                        "intent": request.payload.get("intent", "both"),
                        "studyMode": request.study_mode,
                        "curriculumId": request.curriculum_id,
                        "document": request.payload.get("document", {}),
                        "ir": request.payload.get("ir", {}),
                        "chunks": request.payload.get("chunks", []),
                        "scanWindows": request.payload.get("scanWindows", []),
                        "retrievalSeed": request.payload.get("retrievalSeed", []),
                        "contextPack": context_pack or {},
                        "provider": wrapper.provider,
                        "model": wrapper.model,
                        "agentRunId": run_id,
                        "executionStrategy": execution_plan.strategy,
                        "batchRequested": execution_plan.strategy == "batch",
                    }
                )
            )
            return {
                "mode": "ingestion_concept_extraction",
                "strategy": execution_plan.strategy,
                "result": result,
            }

        if wrapper.execution_mode == "content_creator":
            content_agent = ContentCreatorAgent(self._guardian)
            creator_request = ContentCreatorRequest.model_validate(
                {
                    "userId": request.user_id,
                    "mode": request.payload.get("mode", "agent_autonomous"),
                    "conceptIds": request.concept_ids,
                    "selectedNodeIds": request.selected_node_ids,
                    "curriculumId": request.curriculum_id,
                    "sessionId": request.session_id,
                    "documentIds": request.document_ids,
                    "desiredCardTypes": request.desired_card_types,
                    "desiredActivityTypes": request.payload.get("desiredActivityTypes", []),
                    "studyMode": request.study_mode,
                    "budget": request.payload.get("budget", {}),
                    "contextPack": context_pack or {},
                    "provider": wrapper.provider,
                    "model": wrapper.model,
                    "agentRunId": run_id,
                    "executionStrategy": execution_plan.strategy,
                    "batchRequested": execution_plan.strategy == "batch",
                }
            )
            generated_json, model_routing = await self._execute_realtime_json(
                wrapper=wrapper,
                request=request,
                run_id=run_id,
                context_pack=context_pack or {},
                prompt=prompt,
            )
            if generated_json is not None:
                result = await content_agent.finalize_created_content(
                    generated=generated_json,
                    request=creator_request,
                )
            else:
                result = await content_agent.create(creator_request)
            return {
                "mode": "content_creator",
                "strategy": execution_plan.strategy,
                "modelRouting": model_routing,
                "result": result,
            }

        if wrapper.execution_mode == "content_transform":
            content_agent = ContentCreatorAgent(self._guardian)
            transform_request = ContentTransformRequest.model_validate(
                {
                    "operationName": _resolve_content_transform_operation_name(request),
                    "card": request.payload.get("card", {"content": {}}),
                    "parentCardId": request.payload.get("parentCardId")
                    or (request.selected_card_ids[0] if request.selected_card_ids else None),
                    "transformationKind": request.payload.get(
                        "transformationKind", "rephrase"
                    ),
                    "targetCardType": request.payload.get("targetCardType")
                    or (request.desired_card_types[0] if request.desired_card_types else None),
                    "targetCardTypes": request.payload.get("targetCardTypes", []),
                    "count": request.payload.get("count", 1),
                    "prompt": request.payload.get("prompt"),
                    "contextPack": context_pack or {},
                    "provider": wrapper.provider,
                    "model": wrapper.model,
                    "agentRunId": run_id,
                    "executionStrategy": execution_plan.strategy,
                    "batchRequested": execution_plan.strategy == "batch",
                }
            )
            model_routing = {"provider": wrapper.provider, "model": wrapper.model}
            if execution_plan.strategy == "realtime":
                self._ensure_realtime_content_generation_is_available(wrapper=wrapper)
                llm_result, model_routing = await self._execute_realtime_json(
                    wrapper=wrapper,
                    request=request,
                    run_id=run_id,
                    context_pack=context_pack,
                    prompt=prompt,
                )
                if llm_result is None:
                    raise UserFacingAgentError(
                        message="We couldn't transform this card just now. The model responded, but the result was incomplete. Please try again.",
                        reason_code="content_transform_incomplete_result",
                        detail="Realtime content transform returned no usable structured JSON.",
                        retryable=True,
                        status_code=502,
                    )
                result = await content_agent.finalize_transformed_content(
                    generated=llm_result,
                    request=transform_request,
                )
            else:
                result = await content_agent.transform(transform_request)
            return {
                "mode": "content_transform",
                "operationName": _resolve_content_transform_operation_name(request),
                "strategy": execution_plan.strategy,
                "modelRouting": model_routing,
                "result": result,
            }

        if wrapper.execution_mode == "graph_proposal":
            kg_agent = KnowledgeGraphAgent()
            # incomingGraphProposals may be forwarded by graph-oriented workflows when
            # they detect missing concepts and delegate anchor resolution.
            # propose() routes to anchor_missing_concepts() when these are present or when
            # proposalType=="anchor", triggering prerequisite resolution and path discovery.
            incoming_graph_proposals = request.payload.get("incomingGraphProposals", [])
            operation_profile = self._resolve_operation_profile(wrapper, request)
            operation_name = (
                operation_profile.operation_name
                if operation_profile is not None
                else normalize_graph_operation_name(request.payload.get("proposalType", "anchor"))
            )
            graph_readiness = await GraphInterventionOrchestrator().build_readiness(
                request=KnowledgeGraphRequest.model_validate(
                    {
                        "userId": request.user_id,
                        "conceptIds": request.concept_ids,
                        "selectedNodeIds": request.selected_node_ids,
                        "documentIds": request.document_ids,
                        "graphExpansionScope": request.graph_expansion_scope or {},
                        "proposalType": operation_name,
                        "operationName": operation_name,
                        "studyMode": request.study_mode,
                        "candidateLabels": request.payload.get("candidateLabels", []),
                        "domain": request.payload.get("domain"),
                        "incomingGraphProposals": incoming_graph_proposals,
                        "contextPack": context_pack or {},
                        "provider": wrapper.provider,
                        "model": wrapper.model,
                        "agentRunId": run_id,
                        "executionStrategy": execution_plan.strategy,
                        "batchRequested": execution_plan.strategy == "batch",
                    }
                ),
                context_pack=context_pack or {},
                agent_run_id=run_id,
            )
            if graph_readiness.get("status") != "finalized" and operation_name != "ask_for_mapping_choice":
                raise ValueError(
                    "Graph intervention is not ready: "
                    + "; ".join(str(item) for item in graph_readiness.get("blockedReasons", []))
                )
            result = await kg_agent.propose(
                KnowledgeGraphRequest.model_validate(
                    {
                        "userId": request.user_id,
                        "conceptIds": request.concept_ids,
                        "selectedNodeIds": request.selected_node_ids,
                        "documentIds": request.document_ids,
                        "graphExpansionScope": request.graph_expansion_scope or {},
                        "proposalType": operation_name,
                        "operationName": operation_name,
                        "studyMode": request.study_mode,
                        "candidateLabels": request.payload.get("candidateLabels", []),
                        "domain": request.payload.get("domain"),
                        "incomingGraphProposals": incoming_graph_proposals,
                        "finalizedGraphPrompt": graph_readiness.get("graphPrompt", {}),
                        "contextPack": context_pack or {},
                        "provider": wrapper.provider,
                        "model": wrapper.model,
                        "agentRunId": run_id,
                        "executionStrategy": execution_plan.strategy,
                        "batchRequested": execution_plan.strategy == "batch",
                    }
                )
            )
            return {
                "mode": "graph_proposal",
                "strategy": execution_plan.strategy,
                "graphReadiness": graph_readiness,
                "result": result,
            }

        if wrapper.execution_mode == "curriculum_outline":
            cp_agent = CurriculumPlannerAgent()
            result = await cp_agent.outline(
                CurriculumOutlineRequest.model_validate(
                    {
                        "userId": request.user_id,
                        "goal": request.payload.get("goal", ""),
                        "domain": request.payload.get("domain"),
                        "studyMode": request.study_mode,
                        "focusAreas": request.payload.get("focusAreas", []),
                        "learnerPreferences": request.payload.get("learnerPreferences", {}),
                        "contextPack": context_pack or {},
                        "provider": wrapper.provider,
                        "model": wrapper.model,
                        "agentRunId": run_id,
                        "executionStrategy": execution_plan.strategy,
                        "batchRequested": execution_plan.strategy == "batch",
                    }
                )
            )
            return {
                "mode": "curriculum_outline",
                "strategy": execution_plan.strategy,
                "result": result,
            }

        if wrapper.execution_mode == "curriculum_draft":
            cp_agent = CurriculumPlannerAgent()
            result = await cp_agent.draft(
                CurriculumDraftRequest.model_validate(
                    {
                        "userId": request.user_id,
                        "goal": request.payload.get("goal"),
                        "conceptIds": request.concept_ids,
                        "documentIds": request.document_ids,
                        "studyMode": request.study_mode,
                        "targetHorizon": request.payload.get("targetHorizon"),
                        "difficultyPreference": request.payload.get("difficultyPreference"),
                        "pacing": request.payload.get("pacing"),
                        "focusAreas": request.payload.get("focusAreas", []),
                        "learnerPreferences": request.payload.get("learnerPreferences", {}),
                        "branchPolicy": request.payload.get("branchPolicy", "adaptive_short_detours"),
                        "prerequisiteStrictness": request.payload.get(
                            "prerequisiteStrictness", "strict_return_to_prerequisites"
                        ),
                        "detourBudget": request.payload.get("detourBudget", {}),
                        "targetOutcome": request.payload.get("targetOutcome", {}),
                        "knownKnowledgeState": request.payload.get("knownKnowledgeState", {}),
                        "knownGaps": request.payload.get("knownGaps", []),
                        "activeBranchState": request.payload.get(
                            "activeBranchState",
                            self._curriculum_section_value(context_pack or {}, "branchStateSummary") or {},
                        ),
                        "branchDriftSummary": request.payload.get("branchDriftSummary", {}),
                        "contextPack": context_pack or {},
                        "provider": wrapper.provider,
                        "model": wrapper.model,
                        "agentRunId": run_id,
                        "executionStrategy": execution_plan.strategy,
                        "batchRequested": execution_plan.strategy == "batch",
                    }
                )
            )
            return {
                "mode": "curriculum_draft",
                "strategy": execution_plan.strategy,
                "result": result,
            }

        if wrapper.execution_mode == "curriculum_revision":
            cp_agent = CurriculumPlannerAgent()
            result = await cp_agent.revise(
                CurriculumRevisionRequest.model_validate(
                    {
                        "userId": request.user_id,
                        "curriculumId": request.curriculum_id or "",
                        "curriculumVersionId": request.payload.get("curriculumVersionId", ""),
                        "currentNodes": request.payload.get("currentNodes", []),
                        "currentEdges": request.payload.get("currentEdges", []),
                        "progress": request.payload.get("progress", {}),
                        "revisionReason": request.payload.get("revisionReason", "evidence_based_update"),
                        "evidence": request.payload.get("evidence", {}),
                        "revisionScope": request.payload.get(
                            "revisionScope", "targeted_branch_revision"
                        ),
                        "activeBranchState": request.payload.get(
                            "activeBranchState",
                            self._curriculum_section_value(context_pack or {}, "branchStateSummary") or {},
                        ),
                        "branchDriftSummary": request.payload.get("branchDriftSummary", {}),
                        "blockedPrerequisites": request.payload.get(
                            "blockedPrerequisites",
                            (
                                self._curriculum_section_value(context_pack or {}, "blockedPrerequisites")
                                or {}
                            ).get("items", [])
                            if isinstance(
                                self._curriculum_section_value(
                                    context_pack or {}, "blockedPrerequisites"
                                ),
                                dict,
                            )
                            else [],
                        ),
                        "focusShiftSignals": request.payload.get("focusShiftSignals", []),
                        "knowledgeStateDelta": request.payload.get("knowledgeStateDelta", {}),
                        "learnerIntentSummary": request.payload.get("learnerIntentSummary", {}),
                        "contextPack": context_pack or {},
                        "provider": wrapper.provider,
                        "model": wrapper.model,
                        "agentRunId": run_id,
                        "executionStrategy": execution_plan.strategy,
                        "batchRequested": execution_plan.strategy == "batch",
                    }
                )
            )
            return {
                "mode": "curriculum_revision",
                "strategy": execution_plan.strategy,
                "result": result,
            }

        lesson_plan_generator = LessonPlanGenerator(self._guardian)
        lesson_request = LessonPlanRequest.model_validate(
            {
                "sessionId": request.session_id,
                "userId": request.user_id,
                "curriculumId": request.curriculum_id,
                "curriculumVersionId": request.payload.get("curriculumVersionId"),
                "selectedNodeIds": request.selected_node_ids,
                "selectedCardIds": request.selected_card_ids,
                "studyMode": request.study_mode,
                "learningMode": request.payload.get("learningMode"),
                "rigorLevel": request.payload.get("rigorLevel", "full"),
                "targetDurationMinutes": request.payload.get("targetDurationMinutes"),
                "maxSteps": request.payload.get("maxSteps"),
                "repairOfPlan": request.payload.get("repairOfPlan"),
                "guardianBlockReasons": request.payload.get("guardianBlockReasons", []),
                "context": request.payload,
                "contextPack": context_pack or {},
                "provider": wrapper.provider,
                "model": wrapper.model,
                "agentRunId": run_id,
                "executionStrategy": execution_plan.strategy,
                "batchRequested": execution_plan.strategy == "batch",
            }
        )
        generated_plan, model_routing = await self._execute_realtime_json(
            wrapper=wrapper,
            request=request,
            run_id=run_id,
            context_pack=context_pack or {},
            prompt=prompt,
        )
        if generated_plan is not None:
            result = await lesson_plan_generator.finalize_generated_plan(
                generated_plan=generated_plan,
                request=lesson_request,
            )
        else:
            result = await lesson_plan_generator.generate(lesson_request)
        return {
            "mode": "lesson_plan",
            "strategy": execution_plan.strategy,
            "modelRouting": model_routing,
            "result": result,
        }

    async def _execute_realtime_json(
        self,
        *,
        wrapper: AgentWrapperDefinition,
        request: AgentRunRequest,
        run_id: str,
        context_pack: dict[str, Any],
        prompt: PromptEnvelope | None,
    ) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
        if self._llm_router is None or wrapper.provider is None or wrapper.model is None:
            return None, None
        try:
            adapter = self._llm_router.get_realtime_adapter(wrapper.provider)
        except ValueError:
            return None, None
        provider = wrapper.provider
        model = wrapper.model
        schema_name, schema = response_schema_for_wrapper(wrapper)
        provider_tools = [
            ProviderToolDefinition(
                name=str(item.get("name", "")),
                description=str(item.get("description", "")),
                input_schema=item.get("inputSchema") if isinstance(item.get("inputSchema"), dict) else {},
                service=str(item.get("service", "")),
                side_effects=bool(item.get("sideEffects", False)),
            )
            for item in (prompt.slots.get("providerTools", []) if prompt is not None else [])
            if isinstance(item, dict)
        ]
        provider_request = ProviderBatchRequest(
            custom_id=run_id,
            agent_name=wrapper.name,
            provider=provider,
            model=model,
            system_instructions=[] if prompt is None else prompt.system_instructions,
            user_prompt=build_user_prompt(
                wrapper=wrapper,
                request_payload=request.model_dump(by_alias=True),
                context_pack=context_pack,
                prompt=prompt,
            ),
            response_schema_name=schema_name,
            response_schema=schema,
            metadata={
                "runId": run_id,
                "agentName": wrapper.name,
                "operationName": None if prompt is None else prompt.operation_name,
                "promptBuilderId": None if prompt is None else prompt.prompt_builder_id,
                "structuredToolsSupported": len(provider_tools) > 0,
                "toolCount": len(provider_tools),
            },
            tools=provider_tools,
        )
        try:
            result = await adapter.generate(provider_request)
        except httpx.HTTPStatusError as error:
            fallback_model = str(get_agent_model_config(wrapper.name).fallback)
            fallback_provider = model_provider(fallback_model)
            if (
                not request.allow_fallback
                or not bool(request.payload.get("allowFallback", True))
                or error.response.status_code not in {429, 503, 504}
                or fallback_model == model
            ):
                raise
            fallback_adapter = self._llm_router.get_realtime_adapter(fallback_provider)
            fallback_request = ProviderBatchRequest(
                custom_id=run_id,
                agent_name=wrapper.name,
                provider=fallback_provider,
                model=fallback_model,
                system_instructions=provider_request.system_instructions,
                user_prompt=provider_request.user_prompt,
                response_schema_name=schema_name,
                response_schema=schema,
                metadata={
                    **provider_request.metadata,
                    "fallbackFromProvider": provider,
                    "fallbackFromModel": model,
                    "fallbackReason": f"HTTP {error.response.status_code}",
                },
                tools=provider_tools,
            )
            result = await fallback_adapter.generate(fallback_request)
            return result.output_json, {
                "primaryProvider": provider,
                "primaryModel": model,
                "effectiveProvider": fallback_provider,
                "effectiveModel": fallback_model,
                "fallbackUsed": True,
                "fallbackReason": f"HTTP {error.response.status_code}",
            }
        return result.output_json, {
            "primaryProvider": provider,
            "primaryModel": model,
            "effectiveProvider": provider,
            "effectiveModel": model,
            "fallbackUsed": False,
        }


def _output_contract_for(wrapper: AgentWrapperDefinition) -> dict[str, Any]:
    if wrapper.execution_mode == "calibration_coach":
        return {
            "schema": "calibration_coaching_result",
            "required": ["summary", "learnerFacingText", "recommendations", "reviewRouting", "provenance"],
            "validator": "pedagogy-guardian-service",
            "persistenceBoundary": "metacognition-read-model-ui-projection",
        }
    if wrapper.execution_mode == "mental_debugger":
        return {
            "schema": "mental_debugger_result",
            "required": [
                "summary",
                "learnerFacingText",
                "whatWorked",
                "whereItSlipped",
                "repairRecommendation",
                "reviewRouting",
                "provenance",
            ],
            "validator": "pedagogy-guardian-service",
            "persistenceBoundary": "metacognition-read-model-ui-projection",
        }
    if wrapper.execution_mode == "patch_planner":
        return {
            "schema": "patch_planner_result",
            "required": [
                "scope",
                "repairType",
                "learnerFacingText",
                "proposals",
                "reviewRouting",
                "provenance",
            ],
            "validator": "pedagogy-guardian-service",
            "persistenceBoundary": "owning-service-review-surface",
        }
    if wrapper.execution_mode == "strategy_replanning":
        return {
            "schema": "strategy_replanning_result",
            "required": [
                "scope",
                "interventionType",
                "learnerFacingNotice",
                "changes",
                "reviewRouting",
                "provenance",
            ],
            "validator": "pedagogy-guardian-service",
            "persistenceBoundary": "session-service-review-import",
        }
    if wrapper.execution_mode == "cognitive_copilot":
        return {
            "schema": "cognitive_copilot_result",
            "required": [
                "summary",
                "hintGroups",
                "mirrorStatements",
                "suggestedActions",
                "reviewRouting",
                "provenance",
            ],
            "validator": "pedagogy-guardian-service",
            "persistenceBoundary": "ui-read-model-or-agent-batch-result",
        }
    if wrapper.execution_mode == "watchtower_governance":
        return {
            "schema": "watchtower_governance_result",
            "required": ["state", "statusLabel", "friendlyWhy", "reviewRouting", "provenance"],
            "validator": "watchtower-local-policy",
            "persistenceBoundary": "governance-dashboard-or-agent-batch-result",
        }
    if wrapper.execution_mode == "mode_preference":
        return {
            "schema": "mode_preference_result",
            "required": ["selectedMode", "candidateModes", "deterministicFallback", "reviewRouting", "provenance"],
            "validator": "deterministic-mode-routing",
            "persistenceBoundary": "invoking-service-review-import",
        }
    if wrapper.execution_mode == "taxonomy_curator":
        return {
            "schema": "taxonomy_curator_result",
            "required": ["taxonomyDomain", "proposal", "impactSummary", "reviewRouting", "provenance"],
            "validator": "taxonomy-curator-local-schema",
            "persistenceBoundary": "taxonomy-workbench-review",
        }
    if wrapper.execution_mode == "pedagogy_guardian":
        return {
            "schema": "guardian_validation_result",
            "required": ["decision", "validationId", "reasonCodes", "reviewRouting", "provenance"],
            "persistenceBoundary": "pedagogy-guardian-service",
        }
    if wrapper.execution_mode == "ingestion_concept_extraction":
        return {
            "schema": "ingestion_concept_extraction_result",
            "required": [
                "documentSummary",
                "sectionSummaries",
                "conceptCandidates",
                "mappingSuggestions",
                "handoffRecommendations",
                "groundingReport",
            ],
            "conceptCandidateRequired": [
                "label",
                "definition",
                "evidenceChunkIds",
                "salience",
                "confidence",
                "state",
                "rationale",
            ],
            "mappingSuggestionRequired": [
                "label",
                "candidateNodeIds",
                "decision",
                "confidence",
                "reason",
                "requiresUserApproval",
            ],
            "handoffRecommendationRequired": [
                "target",
                "allowed",
                "reason",
                "payload",
            ],
        }
        if wrapper.execution_mode in ("content_creation_orchestrator", "content_creator"):
            return {
                "schema": "content_creator_result",
            "promptSchema": "content_creation_prompt.v2",
            "required": ["cards", "activityVariants", "groundingReport", "coveragePlan"],
            "cardRequired": [
                "cardType",
                "originMode",
                "anchoredCkgNodeIds",
                "conceptIds",
                "sourceDocumentIds",
                "sources",
                "factualityScore",
                "content",
                "tags",
                "difficulty",
                "rationale",
            ],
            "activityVariantRequired": [
                "conceptId",
                "studyMode",
                "transformationType",
                "epistemicMode",
                "difficultyBucket",
                "prompt",
                "expectedResponseType",
                "responseSchema",
                "renderPayload",
                "variantSeed",
                "rationale",
            ],
        }
    if wrapper.execution_mode == "curriculum_outline":
        return {
            "schema": "curriculum_outline_result",
            "required": [
                "goal",
                "goalSummary",
                "candidateConcepts",
                "candidateGroups",
                "ambiguityNotes",
                "prerequisiteThemes",
                "provisionalOutline",
                "readiness",
                "rationale",
            ],
        }
    return {"schema": wrapper.output_kind}


def _provider_tool_catalog(tool_belt: ToolBeltDefinition) -> list[dict[str, Any]]:
    catalog: list[dict[str, Any]] = []
    for qualified_name in [*tool_belt.read_tools, *tool_belt.write_tools]:
        if "." not in qualified_name:
            continue
        service, name = qualified_name.split(".", 1)
        catalog.append(
            {
                "name": name,
                "service": f"{service}-service",
                "description": f"{qualified_name} available through the assigned tool belt.",
                "inputSchema": {"type": "object"},
                "sideEffects": qualified_name in tool_belt.write_tools,
            }
        )
    return catalog


def _model_routing(execution: dict[str, Any], wrapper: AgentWrapperDefinition) -> dict[str, Any] | None:
    routing = execution.get("modelRouting")
    if isinstance(routing, dict):
        return routing
    if wrapper.provider is None and wrapper.model is None:
        return None
    return {
        "primaryProvider": wrapper.provider,
        "primaryModel": wrapper.model,
        "effectiveProvider": wrapper.provider,
        "effectiveModel": wrapper.model,
        "fallbackUsed": False,
    }


def _effective_provider(execution: dict[str, Any], wrapper: AgentWrapperDefinition) -> str | None:
    routing = _model_routing(execution, wrapper)
    value = None if routing is None else routing.get("effectiveProvider")
    return value if isinstance(value, str) else wrapper.provider


def _effective_model(execution: dict[str, Any], wrapper: AgentWrapperDefinition) -> str | None:
    routing = _model_routing(execution, wrapper)
    value = None if routing is None else routing.get("effectiveModel")
    return value if isinstance(value, str) else wrapper.model


def _tool_belts() -> dict[str, ToolBeltDefinition]:
    belts = [
        ToolBeltDefinition(
            id="ingestion-extraction-belt",
            description="Extraction, mapping, and downstream-handoff tools for source ingestion.",
            readTools=[
                "ingestion.get-document-context",
                "ingestion.get-document-ir",
                "ingestion.get-document-chunks",
                "knowledge-graph.get-concept-node",
                "knowledge-graph.find-related-concepts",
                "curriculum.get-active-version",
                "content.get-coverage",
            ],
            writeTools=[
                "knowledge-graph.propose-mutation",
                "curriculum.create-draft-version",
                "content.request-generation",
            ],
            compositeTools=["get-ingestion-concept-extraction-brief"],
            forbiddenTools=[
                "session.complete-session",
                "content.create-card",
                "curriculum.apply-revision-proposal",
            ],
        ),
        ToolBeltDefinition(
            id="content-generation-belt",
            description="Creation tools for content creation and grounding.",
            readTools=[
                "content.query-cards",
                "content.get-coverage",
                "content.gap-fill-concepts",
                "curriculum.get-active-version",
                "curriculum.get-frontier",
                "scheduler.get-concept-schedule",
                "metacognition.get-reasoning-average",
                "knowledge-graph.get-concept-node",
                "knowledge-graph.find-prerequisites",
                "vector.retrieve-document-chunks",
                "ingestion.get-document-context",
            ],
            writeTools=[
                "content.request-generation",
                "content.transform-card",
                "pedagogy-guardian.validate-generated-variant",
            ],
            compositeTools=["get-content-creator-brief", "get-stability-and-reasoning-pack"],
            forbiddenTools=["session.complete-session"],
        ),
        ToolBeltDefinition(
            id="lesson-plan-belt",
            description="Planning tools for lesson-plan assembly.",
            readTools=["session.get-session", "curriculum.get-session-slice"],
            writeTools=["session.create-lesson-plan", "pedagogy-guardian.validate-lesson-plan"],
            compositeTools=["get-lesson-plan-assembly-brief", "get-active-learning-context"],
            forbiddenTools=["content.request-generation"],
        ),
        ToolBeltDefinition(
            id="repair-belt",
            description="Repair and replanning tools for active learner loops.",
            readTools=[
                "session.get-step-loop-snapshot",
                "metacognition.get-evaluation-by-step",
                "metacognition.get-agent-safe-diagnostic-brief",
                "metacognition.get-remediation-brief",
                "metacognition.get-reasoning-average",
                "scheduler.get-concept-schedule",
                "scheduler.get-transformation-history",
                "knowledge-graph.get-concept-node",
                "knowledge-graph.find-prerequisites",
                "knowledge-graph.find-related-concepts",
            ],
            writeTools=[
                "pedagogy-guardian.validate-replan",
                "pedagogy-guardian.validate-step",
                "pedagogy-guardian.validate-activity",
                "pedagogy-guardian.validate-coaching-artifact",
            ],
            compositeTools=[
                "get-step-repair-context",
                "get-patch-planner-context",
                "get-strategy-replanning-context",
                "get-session-explanation-pack",
            ],
            forbiddenTools=[
                "session.create-lesson-plan",
                "session.present-step",
                "session.answer-step",
                "session.skip-step",
                "session.complete-session",
                "content.request-generation",
                "curriculum.create-draft-version",
                "knowledge-graph.propose-mutation",
            ],
        ),
        ToolBeltDefinition(
            id="mental-debugger-belt",
            description="Learner-safe diagnostic explanation tools for post-Step reflection.",
            readTools=[
                "session.get-step-loop-snapshot",
                "metacognition.get-evaluation-by-step",
                "metacognition.get-agent-safe-diagnostic-brief",
                "metacognition.get-remediation-brief",
                "metacognition.get-reasoning-average",
                "scheduler.get-concept-schedule",
                "scheduler.get-transformation-history",
            ],
            writeTools=["pedagogy-guardian.validate-coaching-artifact"],
            compositeTools=["get-mental-debugger-context", "get-stability-and-reasoning-pack"],
            forbiddenTools=[
                "metacognition.record-evaluation",
                "session.create-lesson-plan",
                "session.present-step",
                "session.answer-step",
                "session.skip-step",
                "session.complete-session",
                "content.request-generation",
                "curriculum.create-draft-version",
            ],
        ),
        ToolBeltDefinition(
            id="copilot-belt",
            description="Source-bound explanation and learner-facing support tools.",
            readTools=[
                "session.get-session",
                "session.get-step-loop-snapshot",
                "metacognition.get-evaluation-by-step",
                "metacognition.get-agent-safe-diagnostic-brief",
                "metacognition.get-remediation-brief",
                "scheduler.get-concept-schedule",
                "scheduler.get-transformation-history",
                "knowledge-graph.get-concept-node",
                "knowledge-graph.find-prerequisites",
                "knowledge-graph.find-related-concepts",
            ],
            writeTools=["pedagogy-guardian.validate-coaching-artifact"],
            compositeTools=[
                "get-session-explanation-pack",
                "get-calibration-context",
                "get-cognitive-copilot-context",
            ],
            forbiddenTools=[
                "session.create-lesson-plan",
                "session.present-step",
                "session.answer-step",
                "session.skip-step",
                "session.complete-session",
                "content.request-generation",
                "content.transform-card",
                "curriculum.create-draft-version",
                "knowledge-graph.propose-mutation",
                "metacognition.record-evaluation",
            ],
        ),
        ToolBeltDefinition(
            id="calibration-belt",
            description="Read-only calibration and reasoning diagnostics.",
            readTools=[
                "session.get-step-loop-snapshot",
                "metacognition.get-evaluation-by-step",
                "metacognition.get-agent-safe-diagnostic-brief",
                "metacognition.get-reasoning-average",
                "scheduler.get-concept-schedule",
            ],
            writeTools=["pedagogy-guardian.validate-coaching-artifact"],
            compositeTools=["get-calibration-context", "get-stability-and-reasoning-pack"],
            forbiddenTools=["session.answer-step", "session.complete-session"],
        ),
        ToolBeltDefinition(
            id="watchtower-belt",
            description="Governance visibility, privacy, intrusion, review, and audit policy tools.",
            readTools=[
                "session.get-session",
                "session.get-step-loop-snapshot",
                "metacognition.get-evaluation-by-step",
                "metacognition.get-agent-safe-diagnostic-brief",
                "scheduler.get-transformation-history",
                "knowledge-graph.get-concept-node",
                "curriculum.list-revision-proposals",
                "content.get-card-history",
                "content.get-card-stats",
            ],
            writeTools=["pedagogy-guardian.validate-coaching-artifact"],
            compositeTools=["get-watchtower-governance-context"],
            forbiddenTools=[
                "session.create-lesson-plan",
                "session.present-step",
                "session.answer-step",
                "session.skip-step",
                "session.complete-session",
                "metacognition.record-evaluation",
                "content.create-card",
                "content.update-card",
                "content.change-card-state",
                "content.request-generation",
                "curriculum.create-draft-version",
                "knowledge-graph.add-concept-node",
                "knowledge-graph.add-edge",
                "knowledge-graph.propose-mutation",
            ],
        ),
        ToolBeltDefinition(
            id="mode-preference-belt",
            description="Small tie-break context for already eligible epistemic modes.",
            readTools=[
                "session.get-step-loop-snapshot",
                "scheduler.get-transformation-history",
                "knowledge-graph.get-concept-node",
                "metacognition.get-agent-safe-diagnostic-brief",
            ],
            writeTools=[],
            compositeTools=["get-mode-preference-context"],
            forbiddenTools=[
                "session.create-lesson-plan",
                "session.present-step",
                "session.answer-step",
                "session.complete-session",
                "content.request-generation",
                "knowledge-graph.propose-mutation",
                "metacognition.record-evaluation",
            ],
        ),
        ToolBeltDefinition(
            id="taxonomy-curator-belt",
            description="Read-only taxonomy evidence tools for reviewable curation proposals.",
            readTools=[
                "metacognition.get-agent-safe-diagnostic-brief",
                "metacognition.get-remediation-brief",
                "metacognition.get-reasoning-average",
                "knowledge-graph.get-canonical-structure",
                "knowledge-graph.get-structural-health",
                "knowledge-graph.detect-misconceptions",
                "knowledge-graph.get-concept-node",
                "knowledge-graph.find-related-concepts",
                "content.get-card-stats",
                "content.get-card-history",
                "content.count-cards",
                "curriculum.list-revision-proposals",
                "curriculum.get-realignment-evidence",
            ],
            writeTools=[],
            compositeTools=["get-taxonomy-curator-context"],
            forbiddenTools=[
                "metacognition.record-evaluation",
                "content.create-card",
                "content.update-card",
                "content.change-card-state",
                "content.request-generation",
                "curriculum.create-draft-version",
                "knowledge-graph.add-concept-node",
                "knowledge-graph.add-edge",
                "knowledge-graph.propose-mutation",
            ],
        ),
        ToolBeltDefinition(
            id="pedagogy-guardian-belt",
            description="Validation tools for learner-facing pedagogical artifacts.",
            readTools=[],
            writeTools=[
                "pedagogy-guardian.validate-lesson-plan",
                "pedagogy-guardian.validate-step",
                "pedagogy-guardian.validate-activity",
                "pedagogy-guardian.validate-replan",
                "pedagogy-guardian.validate-generated-variant",
                "pedagogy-guardian.validate-coaching-artifact",
            ],
            compositeTools=[],
            forbiddenTools=[
                "session.create-lesson-plan",
                "session.answer-step",
                "content.request-generation",
                "curriculum.create-draft-version",
                "knowledge-graph.propose-mutation",
            ],
        ),
        ToolBeltDefinition(
            id="knowledge-graph-belt",
            description="Graph-read and proposal-write tools for CKG mutation proposals.",
            readTools=[
                "knowledge-graph.resolve-concept-reference",
                "knowledge-graph.get-concept-node",
                "knowledge-graph.get-canonical-structure",
                "knowledge-graph.find-prerequisites",
                "knowledge-graph.find-related-concepts",
                "knowledge-graph.find-contrasts",
                "knowledge-graph.find-confusables",
                "knowledge-graph.find-misconception-links",
                "knowledge-graph.get-structural-health",
                "knowledge-graph.detect-misconceptions",
                "knowledge-graph.ensure-content-readiness-subgraph",
            ],
            writeTools=["knowledge-graph.propose-mutation", "knowledge-graph.confirm-pkg-write-plan"],
            compositeTools=["get-graph-proposal-context"],
            forbiddenTools=["session.complete-session", "curriculum.delete-version"],
        ),
        ToolBeltDefinition(
            id="curriculum-belt",
            description="Planning and revision tools for curriculum DAG authoring.",
            readTools=[
                "curriculum.get-frontier",
                "curriculum.get-active-version",
                "curriculum.get-progress",
                "scheduler.get-due-concepts",
                "scheduler.get-concept-schedule",
            ],
            writeTools=["curriculum.create-draft-version"],
            compositeTools=["get-curriculum-draft-context"],
            forbiddenTools=["session.complete-session"],
        ),
    ]
    return {belt.id: belt for belt in belts}


def _wrappers() -> dict[str, AgentWrapperDefinition]:
    wrappers = [
        AgentWrapperDefinition(
            name="ingestion-concept-extraction-agent",
            family="creation",
            purpose="Extract concept candidates, mapping suggestions, evidence links, and downstream handoff recommendations from ingested source material.",
            executionMode="ingestion_concept_extraction",
            toolBeltId="ingestion-extraction-belt",
            primaryCompositeTool="get-ingestion-concept-extraction-brief",
            outputKind="proposal",
            writeAuthority="agent_proposal",
            reviewPath=["knowledge-graph-review-queue", "curriculum-review-queue", "content-review-queue"],
            instructions=[
                "Treat ingestion-service as the authority for parsed documents, IR, chunks, and persisted concept candidates.",
                "Use prefetched service context as factual grounding and keep source evidence separate from downstream recommendations.",
                "Extract concepts from the supplied whole-document scan windows, not from retrieval-style question answering.",
                "Never commit graph mutations, learner-facing content, or curriculum activation directly.",
                "Return uncertainty explicitly in concept states, mapping suggestions, and handoff recommendations.",
            ],
            requiredFields=["userId"],
            provider=model_provider(get_agent_model_config("ingestion-concept-extraction").primary),
            model=str(get_agent_model_config("ingestion-concept-extraction").primary),
            batchAllowed=True,
            batchPreferred=True,
            maxLatencySeconds=3600,
        ),
        AgentWrapperDefinition(
            name="content-creation-orchestrator",
            family="creation",
            purpose="Run all content-creation preflight agents, build ContentCreationPromptV2, and hand off to the content creator only after readiness is finalized.",
            executionMode="content_creation_orchestrator",
            toolBeltId="content-generation-belt",
            primaryCompositeTool="get-content-creator-brief",
            outputKind="proposal",
            writeAuthority="agent_proposal",
            reviewPath=["pedagogy-guardian", "content-review-queue"],
            instructions=[
                "Run intent, graph, learner-state, and pedagogy preflight before content drafting.",
                "Block if ContentCreationPromptV2 is incomplete or RAG-required evidence is missing.",
                "Call content-creator-agent only with a ready ContentCreationPromptV2.",
            ],
            requiredFields=["userId", "conceptIds"],
            provider=model_provider(get_agent_model_config("content-creator-agent").primary),
            model=str(get_agent_model_config("content-creator-agent").primary),
            batchAllowed=False,
            batchPreferred=False,
            maxLatencySeconds=30,
        ),
        AgentWrapperDefinition(
            name="content-intent-normalizer-agent",
            family="creation",
            purpose="Normalize content creation trigger, purpose, policies, artifact scope, and pedagogical move.",
            executionMode="content_intent_normalizer",
            toolBeltId="content-generation-belt",
            primaryCompositeTool="get-content-creator-brief",
            outputKind="preflight",
            writeAuthority="agent_inference",
            reviewPath=["content-review-queue"],
            instructions=["Normalize intent from caller values and deterministic service facts."],
            requiredFields=["userId", "conceptIds"],
            provider=model_provider(get_agent_model_config("content-creator-agent").primary),
            model=str(get_agent_model_config("content-creator-agent").primary),
            batchAllowed=False,
            batchPreferred=False,
            maxLatencySeconds=5,
        ),
        AgentWrapperDefinition(
            name="learner-state-summarizer-agent",
            family="learner-loop",
            purpose="Normalize explicit learner check-ins and concept-indexed learning state for content creation.",
            executionMode="learner_state_summarizer",
            toolBeltId="content-generation-belt",
            primaryCompositeTool="get-content-creator-brief",
            outputKind="preflight",
            writeAuthority="agent_inference",
            reviewPath=["content-review-queue"],
            instructions=["Never infer mood without explicit learner-provided or service-provided affect data."],
            requiredFields=["userId", "conceptIds"],
            provider=model_provider(get_agent_model_config("content-creator-agent").primary),
            model=str(get_agent_model_config("content-creator-agent").primary),
            batchAllowed=False,
            batchPreferred=False,
            maxLatencySeconds=5,
        ),
        AgentWrapperDefinition(
            name="content-pedagogy-planner-agent",
            family="creation",
            purpose="Finalize output pedagogy defaults and difficulty targets for content creation.",
            executionMode="content_pedagogy_planner",
            toolBeltId="content-generation-belt",
            primaryCompositeTool="get-content-creator-brief",
            outputKind="preflight",
            writeAuthority="agent_inference",
            reviewPath=["content-review-queue"],
            instructions=["Fill only pedagogy planning fields; never draft content."],
            requiredFields=["userId", "conceptIds"],
            provider=model_provider(get_agent_model_config("content-creator-agent").primary),
            model=str(get_agent_model_config("content-creator-agent").primary),
            batchAllowed=False,
            batchPreferred=False,
            maxLatencySeconds=5,
        ),
        AgentWrapperDefinition(
            name="content-creator-agent",
            family="creation",
            purpose="Create grounded cards and Step Activity variants from a ready ContentCreationPromptV2.",
            executionMode="content_creation_orchestrator",
            toolBeltId="content-generation-belt",
            primaryCompositeTool="get-content-creator-brief",
            outputKind="proposal",
            writeAuthority="agent_proposal",
            reviewPath=["pedagogy-guardian", "content-review-queue"],
            instructions=_content_creator_instructions(),
            requiredFields=["userId", "conceptIds"],
            provider=model_provider(get_agent_model_config("content-creator-agent").primary),
            model=str(get_agent_model_config("content-creator-agent").primary),
            batchAllowed=True,
            batchPreferred=True,
            maxLatencySeconds=3600,
        ),
        AgentWrapperDefinition(
            name="content-transform-agent",
            family="creation",
            purpose="Rewrite or transform an existing card draft through the shared agent runtime.",
            executionMode="content_transform",
            toolBeltId="content-generation-belt",
            primaryCompositeTool="get-content-creator-brief",
            outputKind="proposal",
            writeAuthority="agent_proposal",
            reviewPath=["pedagogy-guardian", "content-review-queue"],
            instructions=[
                "Preserve the parent card's learning intent unless the transformation explicitly changes it.",
                "Return one transformed card draft and explain the transformation in metadata when helpful.",
            ],
            requiredFields=["userId", "selectedCardIds"],
            provider=model_provider(get_agent_model_config("content-transform-agent").primary),
            model=str(get_agent_model_config("content-transform-agent").primary),
            batchAllowed=False,
            batchPreferred=False,
            maxLatencySeconds=10,
        ),
        AgentWrapperDefinition(
            name="lesson-plan-generator",
            family="creation",
            purpose="Assemble a lesson plan aligned to the selected curriculum slice.",
            executionMode="lesson_plan",
            toolBeltId="lesson-plan-belt",
            primaryCompositeTool="get-lesson-plan-assembly-brief",
            outputKind="proposal",
            writeAuthority="agent_proposal",
            reviewPath=["pedagogy-guardian", "session-review-queue"],
            instructions=[
                "Bias toward selected curriculum frontier and available session context.",
                "Keep plans scoped to the current session slice.",
            ],
            requiredFields=["userId", "sessionId"],
            provider=model_provider(get_agent_model_config("lesson-plan-generator").primary),
            model=str(get_agent_model_config("lesson-plan-generator").primary),
            batchAllowed=True,
            batchPreferred=False,
            maxLatencySeconds=10,
        ),
        AgentWrapperDefinition(
            name="strategy-replanning-agent",
            family="learner-loop",
            purpose="Diagnose active learner-loop friction and propose minimal replans.",
            executionMode="strategy_replanning",
            toolBeltId="repair-belt",
            primaryCompositeTool="get-strategy-replanning-context",
            outputKind="proposal",
            writeAuthority="agent_proposal",
            reviewPath=["pedagogy-guardian", "session-plan-review", "active-session-timeline"],
            instructions=[
                "Prefer local repairs before structural replans.",
                "Escalate only when the trigger context justifies it.",
                "Draft reviewable session-service replan proposals only; never mutate LessonPlans, Steps, Activities, or queues directly.",
                "Keep evaluated Steps immutable and route rejected artifacts with repair reasons.",
            ],
            requiredFields=["userId", "sessionId"],
            provider=model_provider(get_agent_model_config("strategy-replanning-agent").primary),
            model=str(get_agent_model_config("strategy-replanning-agent").primary),
            batchAllowed=False,
            batchPreferred=False,
            maxLatencySeconds=2,
        ),
        AgentWrapperDefinition(
            name="mental-debugger",
            family="learner-loop",
            purpose="Explain completed or active Step reasoning traces from metacognition-owned facts.",
            executionMode="mental_debugger",
            toolBeltId="mental-debugger-belt",
            primaryCompositeTool="get-mental-debugger-context",
            outputKind="explanation",
            writeAuthority="agent_inference",
            reviewPath=["pedagogy-guardian", "post-step-reflection"],
            instructions=[
                "Explain Evaluation and trace evidence; never rewrite metacognition facts.",
                "Use provisional, non-shaming language and avoid stable trait diagnoses.",
                "Validate learner-facing diagnostic language before routing it to reflection surfaces.",
                "Recommend repair types only; Patch Planner and service Strategy own downstream repair paths.",
            ],
            requiredFields=["userId"],
            provider=model_provider(get_agent_model_config("mental-debugger").primary),
            model=str(get_agent_model_config("mental-debugger").primary),
            batchAllowed=True,
            batchPreferred=False,
            maxLatencySeconds=5,
        ),
        AgentWrapperDefinition(
            name="patch-planner-remediation-agent",
            family="learner-loop",
            purpose="Convert diagnostic signals into minimum-sufficient repair proposals.",
            executionMode="patch_planner",
            toolBeltId="repair-belt",
            primaryCompositeTool="get-patch-planner-context",
            outputKind="proposal",
            writeAuthority="agent_proposal",
            reviewPath=["pedagogy-guardian", "session-plan-review", "content-workbench", "curriculum-workbench"],
            instructions=[
                "Prefer no repair or tiny local repair when evidence is weak.",
                "Produce reviewable proposals only; never insert Steps, activate content, or mutate curricula.",
                "Route each proposal to the owning service or review surface.",
                "Validate learner-facing repair rationale before it appears in timelines or inboxes.",
            ],
            requiredFields=["userId"],
            provider=model_provider(get_agent_model_config("patch-planner-remediation-agent").primary),
            model=str(get_agent_model_config("patch-planner-remediation-agent").primary),
            batchAllowed=True,
            batchPreferred=False,
            maxLatencySeconds=5,
        ),
        AgentWrapperDefinition(
            name="cognitive-copilot",
            family="learner-loop",
            purpose="Explain the current learning state in a structured, learner-safe way.",
            executionMode="cognitive_copilot",
            toolBeltId="copilot-belt",
            primaryCompositeTool="get-cognitive-copilot-context",
            outputKind="explanation",
            writeAuthority="agent_inference",
            reviewPath=["pedagogy-guardian", "cognitive-copilot-sidebar", "reflection-dashboard"],
            instructions=[
                "Use learner-safe wording and avoid leaking raw trace internals.",
                "Surface confidence and uncertainty clearly.",
                "Use only service facts, validated agent outputs, and user-provided hints; keep internal tool calls out of learner timelines.",
                "Validate learner-facing copy before routing it to sidebar, dashboard, or timeline surfaces.",
            ],
            requiredFields=["userId", "sessionId"],
            provider=model_provider(get_agent_model_config("cognitive-copilot").primary),
            model=str(get_agent_model_config("cognitive-copilot").primary),
            batchAllowed=True,
            batchPreferred=True,
            maxLatencySeconds=300,
        ),
        AgentWrapperDefinition(
            name="watchtower-governance-layer",
            family="governance",
            purpose="Decide bounded visibility, privacy, intrusiveness, review, and audit routing for agent artifacts.",
            executionMode="watchtower_governance",
            toolBeltId="watchtower-belt",
            primaryCompositeTool="get-watchtower-governance-context",
            outputKind="governance_decision",
            writeAuthority="agent_inference",
            reviewPath=["governance-dashboard", "cognitive-copilot-sidebar"],
            instructions=[
                "Do not rebuild a broad Governance Agent; decide only Watchtower visibility, privacy, audit, and review policy.",
                "Do not validate pedagogy; Pedagogy Guardian owns that decision.",
                "Filter or defer surfacing without mutating service-owned facts.",
                "Use calm labels first, friendly why second, and technical provenance below the fold.",
            ],
            requiredFields=["userId"],
            provider=model_provider(get_agent_model_config("watchtower-governance-layer").primary),
            model=str(get_agent_model_config("watchtower-governance-layer").primary),
            batchAllowed=True,
            batchPreferred=True,
            maxLatencySeconds=3600,
        ),
        AgentWrapperDefinition(
            name="mode-preference-helper",
            family="helper",
            purpose="Tie-break among already eligible epistemic modes using recent history and preferences.",
            executionMode="mode_preference",
            toolBeltId="mode-preference-belt",
            primaryCompositeTool="get-mode-preference-context",
            outputKind="mode_choice",
            writeAuthority="agent_inference",
            reviewPath=["step-details", "lesson-plan-review"],
            instructions=[
                "Choose only among deterministic candidateModes supplied by the caller.",
                "Never create eligibility groups, override triggers, or select forbidden modes.",
                "Return the deterministic fallback when preferences and variety do not improve the choice.",
                "Keep the explanation short and suitable for Step details or Copilot.",
            ],
            requiredFields=["userId"],
            provider=model_provider(get_agent_model_config("mode-preference-helper").primary),
            model=str(get_agent_model_config("mode-preference-helper").primary),
            batchAllowed=False,
            batchPreferred=False,
            maxLatencySeconds=2,
        ),
        AgentWrapperDefinition(
            name="calibration-coach",
            family="learner-loop",
            purpose="Summarize calibration and reasoning alignment for selected concepts.",
            executionMode="calibration_coach",
            toolBeltId="calibration-belt",
            primaryCompositeTool="get-calibration-context",
            outputKind="explanation",
            writeAuthority="agent_inference",
            reviewPath=["watchtower"],
            instructions=[
                "Highlight confidence gaps without overstating certainty.",
                "Prefer concept-level specificity over generic advice.",
                "Validate learner-facing coaching language before routing it to a UI surface.",
                "Never mutate Evaluation, scheduler, session, or graph facts.",
            ],
            requiredFields=["userId"],
            provider=model_provider(get_agent_model_config("calibration-coach").primary),
            model=str(get_agent_model_config("calibration-coach").primary),
            batchAllowed=True,
            batchPreferred=False,
            maxLatencySeconds=5,
        ),
        AgentWrapperDefinition(
            name="taxonomy-curator",
            family="curation",
            purpose="Draft versioned taxonomy evolution proposals from aggregate evidence and service-owned taxonomy context.",
            executionMode="taxonomy_curator",
            toolBeltId="taxonomy-curator-belt",
            primaryCompositeTool="get-taxonomy-curator-context",
            outputKind="proposal",
            writeAuthority="agent_proposal",
            reviewPath=["taxonomy-workbench", "governance-dashboard"],
            instructions=[
                "Propose taxonomy changes only; never silently change live taxonomy or rewrite historical facts.",
                "Route proposals to the owning service or workbench for curator/admin review.",
                "Preserve historical interpretability with migration guidance and compatibility warnings.",
                "Use aggregate or minimized examples only; do not expose raw private traces.",
            ],
            requiredFields=["userId"],
            provider=model_provider(get_agent_model_config("taxonomy-curator").primary),
            model=str(get_agent_model_config("taxonomy-curator").primary),
            batchAllowed=True,
            batchPreferred=True,
            maxLatencySeconds=3600,
        ),
        AgentWrapperDefinition(
            name="pedagogy-guardian",
            family="governance",
            purpose="Validate learner-facing pedagogical artifacts through the Guardian service boundary.",
            executionMode="pedagogy_guardian",
            toolBeltId="pedagogy-guardian-belt",
            primaryCompositeTool=None,
            outputKind="validation",
            writeAuthority="deterministic_validation",
            reviewPath=["originating-service-review"],
            instructions=[
                "Act as a service-bound validation adapter, not a conversational agent.",
                "Guardian owns validation decisions only; producer services own their artifacts.",
                "Return calm status labels first, friendly why explanations second, and technical provenance below that.",
            ],
            requiredFields=["userId"],
            provider=model_provider(get_agent_model_config("pedagogy-guardian").primary),
            model=str(get_agent_model_config("pedagogy-guardian").primary),
            batchAllowed=True,
            batchPreferred=False,
            maxLatencySeconds=5,
        ),
        AgentWrapperDefinition(
            name="graph-intervention-orchestrator",
            family="curation",
            purpose="Build finalized GraphAgentPromptV1 readiness reports before graph reasoning, PKG confirmation, CKG mutation review, or content creation.",
            executionMode="graph_intervention_orchestrator",
            toolBeltId="knowledge-graph-belt",
            primaryCompositeTool="get-graph-proposal-context",
            outputKind="readiness_report",
            writeAuthority="deterministic_prefetch",
            reviewPath=["pkg-confirmation-popup", "knowledge-graph-review-queue"],
            instructions=_graph_intervention_orchestrator_instructions(),
            requiredFields=["userId", "conceptIds"],
            provider=model_provider(get_agent_model_config("knowledge-graph-agent").primary),
            model=str(get_agent_model_config("knowledge-graph-agent").primary),
            batchAllowed=False,
            batchPreferred=False,
            maxLatencySeconds=10,
        ),
        AgentWrapperDefinition(
            name="knowledge-graph-agent",
            family="curation",
            purpose=(
                "Propose concept anchors, prerequisite edges, misconception flags, and CKG mutations "
                "from document evidence and learner signals."
            ),
            executionMode="graph_proposal",
            toolBeltId="knowledge-graph-belt",
            primaryCompositeTool="get-graph-proposal-context",
            outputKind="proposal",
            writeAuthority="agent_proposal",
            reviewPath=["pedagogy-guardian", "knowledge-graph-review-queue"],
            instructions=_knowledge_graph_agent_instructions(),
            requiredFields=["userId", "conceptIds"],
            provider=model_provider(get_agent_model_config("knowledge-graph-agent").primary),
            model=str(get_agent_model_config("knowledge-graph-agent").primary),
            batchAllowed=True,
            batchPreferred=True,
            maxLatencySeconds=1800,
        ),
        AgentWrapperDefinition(
            name="curriculum-outline-planner",
            family="curation",
            purpose=(
                "Analyze a learner goal, infer candidate concept anchors, and prepare a provisional "
                "outline for guided concept approval before curriculum drafting."
            ),
            executionMode="curriculum_outline",
            toolBeltId="curriculum-belt",
            primaryCompositeTool="get-curriculum-draft-context",
            outputKind="proposal",
            writeAuthority="agent_proposal",
            reviewPath=["curriculum-concept-approval"],
            instructions=_curriculum_outline_instructions(),
            requiredFields=["userId"],
            provider=model_provider(get_agent_model_config("curriculum-planner").primary),
            model=str(get_agent_model_config("curriculum-planner").primary),
            batchAllowed=True,
            batchPreferred=True,
            maxLatencySeconds=1800,
        ),
        AgentWrapperDefinition(
            name="curriculum-planner",
            family="curation",
            purpose=(
                "Draft a curriculum DAG from learning goals, concept anchors, prerequisite structure, "
                "and scheduling readiness data."
            ),
            executionMode="curriculum_draft",
            toolBeltId="curriculum-belt",
            primaryCompositeTool="get-curriculum-draft-context",
            outputKind="proposal",
            writeAuthority="agent_proposal",
            reviewPath=["pedagogy-guardian", "curriculum-review-queue"],
            instructions=_curriculum_planner_instructions(),
            requiredFields=["userId", "conceptIds"],
            provider=model_provider(get_agent_model_config("curriculum-planner").primary),
            model=str(get_agent_model_config("curriculum-planner").primary),
            batchAllowed=True,
            batchPreferred=True,
            maxLatencySeconds=1800,
        ),
        AgentWrapperDefinition(
            name="curriculum-revision-agent",
            family="curation",
            purpose=(
                "Revise an existing curriculum DAG based on learner progress evidence, "
                "misconception signals, and scheduling drift."
            ),
            executionMode="curriculum_revision",
            toolBeltId="curriculum-belt",
            primaryCompositeTool="get-curriculum-draft-context",
            outputKind="proposal",
            writeAuthority="agent_proposal",
            reviewPath=["pedagogy-guardian", "curriculum-review-queue"],
            instructions=_curriculum_revision_instructions(),
            requiredFields=["userId", "curriculumId"],
            provider=model_provider(get_agent_model_config("curriculum-planner").primary),
            model=str(get_agent_model_config("curriculum-planner").primary),
            batchAllowed=True,
            batchPreferred=True,
            maxLatencySeconds=1800,
        ),
    ]
    return {wrapper.name: wrapper for wrapper in wrappers}


_GRAPH_OPERATION_NAMES = (
    "add_node",
    "add_edge",
    "add_prerequisite",
    "update_node",
    "remove_node",
    "remove_edge",
    "merge_nodes",
    "split_node",
    "anchor",
    "content_readiness",
    "ask_for_mapping_choice",
    "confusable_relation",
    "contrast_relation",
    "misconception_relation",
    "expand_pkg",
)


def _graph_output_schema_id(operation_name: str) -> str:
    if operation_name == "expand_pkg":
        return "pkg_expansion_proposal_bundle.v1"
    if operation_name == "content_readiness":
        return "graph_readiness_report.v1"
    return "graph_proposals.v1"


def _graph_scope_instructions() -> dict[str, list[str]]:
    return {
        "whole_pkg": [
            "Treat this as a whole-PKG expansion run. Optimize for global structure, missing bridges, semantic clarity, and graph-wide learner value.",
        ],
        "node": [
            "Treat this as a node-scoped expansion run. Stay tightly anchored to the selected node neighborhood and prefer local prerequisite, bridge, and wording improvements.",
        ],
        "domain": [
            "Treat this as a domain-scoped expansion run. Stay within the requested domain slice and prioritize domain-local gaps, structure, and explanations.",
        ],
    }


_CONTENT_OPERATION_NAMES = (
    "source_derived_generation",
    "curriculum_coverage_generation",
    "graph_gap_generation",
    "repair_generation",
    "transformation_generation",
    "authoring_assistance",
    "session_preparation",
)

_TRANSFORM_CARD_TYPE_CATALOG = [
    "atomic: basic question and answer recall",
    "cloze: fill in missing words inside a sentence or passage",
    "image_occlusion: hide labeled regions on an image",
    "audio: listen to audio and recall or identify content",
    "process: explain or reconstruct ordered steps",
    "comparison: compare two or more items across criteria",
    "exception: state the general rule and its exceptions",
    "error_spotting: find and correct a mistake",
    "confidence_rated: answer, then rate confidence",
    "concept_graph: map concepts and relations",
    "case_based: reason from a scenario or vignette",
    "multimodal: combine text with image or audio evidence",
    "transfer: apply an idea in a new setting",
    "progressive_disclosure: reveal a concept in staged layers",
    "multiple_choice: choose the best answer from options",
    "true_false: judge whether a statement is true or false",
    "matching: match paired items",
    "ordering: arrange items in the right order",
    "definition: recall or recognize a definition",
    "cause_effect: connect causes with effects",
    "timeline: place events or stages in time order",
    "diagram: label or interpret a diagram",
    "contrastive_pair: compare close lookalikes side by side",
    "minimal_pair: distinguish items with only a small difference",
    "false_friend: separate misleadingly similar terms",
    "old_vs_new_definition: contrast outdated and corrected definitions",
    "boundary_case: test edge cases and category boundaries",
    "rule_scope: decide when a rule does and does not apply",
    "discriminant_feature: focus on the feature that separates confusables",
    "assumption_check: surface and test a hidden assumption",
    "counterexample: show an example that breaks an overgeneral rule",
    "representation_switch: move between forms like text, symbol, table, or graph",
    "retrieval_cue: strengthen recall with a targeted cue",
    "encoding_repair: rebuild a weak or misleading memory trace",
    "overwrite_drill: replace a persistent wrong answer with the right one",
    "availability_bias_disconfirmation: counter a vivid but misleading belief",
    "self_check_ritual: practice a repeatable self-check routine",
    "calibration_training: compare confidence with actual correctness",
    "attribution_reframing: shift from unhelpful explanations to useful ones",
    "strategy_reminder: remind the learner which strategy to use",
    "confusable_set_drill: discriminate among several similar items",
    "partial_knowledge_decomposition: break a half-known idea into explicit parts",
]


def _resolve_content_operation_name(request: AgentRunRequest) -> str:
    payload = request.payload if isinstance(request.payload, dict) else {}
    explicit = request.operation_name or payload.get("operationName")
    if isinstance(explicit, str) and explicit in _CONTENT_OPERATION_NAMES:
        return explicit
    if any(
        isinstance(payload.get(key), str) and str(payload.get(key)).strip()
        for key in ("transformationKind", "parentCardId", "targetCardType")
    ) or bool(request.selected_card_ids):
        return "transformation_generation"
    if any(key in payload for key in ("repairRequest", "repairReason", "guardianBlockReasons", "patchProposal", "triggerType")):
        return "repair_generation"
    artifact_scope = payload.get("artifactScope")
    if artifact_scope == "session_preparation" or request.session_id:
        return "session_preparation"
    trigger = payload.get("trigger")
    if trigger == "graph_gap":
        return "graph_gap_generation"
    if request.curriculum_id:
        return "curriculum_coverage_generation"
    if request.document_ids:
        return "source_derived_generation"
    return "authoring_assistance"


def _resolve_content_transform_operation_name(request: AgentRunRequest) -> str:
    payload = request.payload if isinstance(request.payload, dict) else {}
    explicit = request.operation_name or payload.get("operationName")
    if isinstance(explicit, str) and explicit.strip():
        return explicit
    return "transform_content"


def _content_output_schema_id(wrapper_name: str, operation_name: str) -> str:
    if wrapper_name == "content-transform-agent" or operation_name == "transformation_generation":
        return "content_transform_result.v1"
    return "content_creator_result.v1"


def _content_operation_instructions(operation_name: str, *, wrapper_name: str) -> list[str]:
    orchestrator_prefix = (
        "This run is a content orchestration pass."
        if wrapper_name == "content-creation-orchestrator"
        else "This run is a content drafting pass."
    )
    if operation_name == "source_derived_generation":
        return [
            f"{orchestrator_prefix} Treat the primary context as source-derived generation and prioritize grounding strength, citation fidelity, and source-bounded claims.",
        ]
    if operation_name == "curriculum_coverage_generation":
        return [
            f"{orchestrator_prefix} Treat the primary context as curriculum coverage generation and optimize for missing practice coverage, concept alignment, and useful variety.",
        ]
    if operation_name == "graph_gap_generation":
        return [
            f"{orchestrator_prefix} Treat the primary context as graph-gap generation and target undercovered concepts or prerequisite gaps surfaced by graph readiness.",
        ]
    if operation_name == "repair_generation":
        return [
            f"{orchestrator_prefix} Treat the primary context as repair generation and optimize for remediation, misconception handling, and concrete recovery moves over breadth.",
        ]
    if operation_name == "transformation_generation":
        return [
            f"{orchestrator_prefix} Treat the primary context as transformation generation. Preserve the parent learning target while changing format, move, or response shape intentionally.",
        ]
    if operation_name == "session_preparation":
        return [
            f"{orchestrator_prefix} Treat the primary context as session preparation and optimize for immediately usable, policy-compliant candidate payloads rather than broad authoring coverage.",
        ]
    return [
        f"{orchestrator_prefix} Treat the primary context as authoring assistance and generate reviewable drafts, hints, or variants with clear provenance and bounded claims.",
    ]


def _graph_operation_instructions(operation_name: str, *, wrapper_name: str) -> list[str]:
    if wrapper_name == "graph-intervention-orchestrator":
        if operation_name == "expand_pkg":
            return [
                "This run is an explicit PKG expansion context build. Assemble scope-aware graph evidence for structural expansion, semantic optimization, edge and node discovery, and wording improvements.",
                "Inventory the requested graph scope before finalizing the prompt: whole PKG, selected node neighborhood, or domain slice.",
            ]
        if operation_name == "anchor":
            return [
                "This run is an anchor-preparation context build. Prioritize identity resolution, prerequisite/path evidence, and ambiguity blocking for concept anchoring.",
            ]
        if operation_name == "content_readiness":
            return [
                "This run is a content-readiness context build. Finalize graph grounding needed by downstream content creation and block if identity resolution remains unsafe.",
            ]
        return [
            f"This run is a graph orchestration pass for `{operation_name}`. Finalize the human-readable graph context and downstream handoff contract before reasoning continues.",
        ]

    if operation_name == "expand_pkg":
        return [
            "This run is an explicit PKG expansion review flow. Propose learner-reviewable graph expansion items with succinct rationale and keep canonical suggestions separate from direct PKG writes.",
            "Cover both structural and semantic optimizations when evidence supports them, including node/edge expansion, clearer labels, clearer descriptions, and explanatory wording.",
            "Always assign the most specific supported domain for every touched node and avoid defaulting to 'general' when target concepts, surrounding graph context, or source evidence indicate a real domain; multiple domains across touched nodes are allowed.",
            "Actively think of the plausible domains a concept could belong to before choosing one. Prefer a matching existing graph domain when one is already in use, but do not force the domain choice to come only from the existing list if a better new domain label is warranted.",
            "Do not propose isolated nodes when a relation is justified. Expansion should explain graph fit with at least one explicit edge whenever evidence supports prerequisite, taxonomic, part-whole, causal, contrastive, confusable, language, or other associative structure.",
            "Choose the most specific edge type available rather than falling back to related_to: use is_a for subtype links, part_of or constituted_by for composition, prerequisite/precedes/depends_on/derived_from/subskill_of/has_subskill for learning structure, causes for causation, equivalent_to/entails/disjoint_with/contradicts for logical links, contrasts_with/confusable_with/analogous_to/translation_equivalent/false_friend_of/minimal_pair_with/collocates_with for comparison or language links, exemplifies for example-to-concept links, has_property or governs for attribute/control links, and occupation-specific edge types only for skill-occupation relations.",
            "Use notion for general concepts, skill for competencies, occupation for roles, fact for atomic truths, procedure for stepwise methods, principle for governing rules, example/counterexample for illustrative instances, and misconception for false beliefs that need repair.",
        ]
    if operation_name == "anchor":
        return [
            "This run is an anchoring flow. Propose anchor nodes, prerequisite structure, and entry paths that place the concept into a coherent graph neighborhood.",
        ]
    if operation_name == "content_readiness":
        return [
            "This run is a content-readiness flow. Return only the graph readiness and proposal artifacts needed to ground downstream content creation safely.",
        ]
    return [
        f"This run is a graph proposal flow for `{operation_name}`. Keep proposals operation-specific, reviewable, and downstream-compatible.",
    ]


def _operation_profiles() -> dict[str, dict[str, AgentOperationProfile]]:
    graph_orchestrator_profiles = {
        operation_name: AgentOperationProfile(
            operationName=operation_name,
            promptBuilderId=f"graph-intervention-orchestrator.{operation_name}.v1",
            outputSchemaId="graph_readiness_report.v1",
            promptProfileVersion="graph-operation-profile.v1",
            instructions=_graph_operation_instructions(
                operation_name, wrapper_name="graph-intervention-orchestrator"
            ),
            scopeInstructions=_graph_scope_instructions() if operation_name == "expand_pkg" else {},
        )
        for operation_name in _GRAPH_OPERATION_NAMES
    }
    graph_proposal_profiles = {
        operation_name: AgentOperationProfile(
            operationName=operation_name,
            promptBuilderId=f"knowledge-graph-agent.{operation_name}.v1",
            outputSchemaId=_graph_output_schema_id(operation_name),
            promptProfileVersion="graph-operation-profile.v1",
            instructions=_graph_operation_instructions(
                operation_name, wrapper_name="knowledge-graph-agent"
            ),
            scopeInstructions=_graph_scope_instructions() if operation_name == "expand_pkg" else {},
        )
        for operation_name in _GRAPH_OPERATION_NAMES
    }
    content_orchestrator_profiles = {
        operation_name: AgentOperationProfile(
            operationName=operation_name,
            promptBuilderId=f"content-creation-orchestrator.{operation_name}.v1",
            outputSchemaId=_content_output_schema_id("content-creation-orchestrator", operation_name),
            promptProfileVersion="content-operation-profile.v1",
            instructions=_content_operation_instructions(
                operation_name, wrapper_name="content-creation-orchestrator"
            ),
        )
        for operation_name in _CONTENT_OPERATION_NAMES
    }
    content_creator_profiles = {
        operation_name: AgentOperationProfile(
            operationName=operation_name,
            promptBuilderId=f"content-creator-agent.{operation_name}.v1",
            outputSchemaId=_content_output_schema_id("content-creator-agent", operation_name),
            promptProfileVersion="content-operation-profile.v1",
            instructions=_content_operation_instructions(
                operation_name, wrapper_name="content-creator-agent"
            ),
        )
        for operation_name in _CONTENT_OPERATION_NAMES
    }
    content_transform_profiles = {
        "transform_content": AgentOperationProfile(
            operationName="transform_content",
            promptBuilderId="content-transform-agent.transform_content.v1",
            outputSchemaId="content_transform_result.v1",
            promptProfileVersion="content-operation-profile.v1",
            instructions=[
                "This run is a content transformation pass. Preserve the parent learning objective unless the transformation explicitly changes it.",
                "Make the transformed card meaningfully different in form or pedagogical move while keeping provenance and lineage clear.",
                "Use the explicit supported card type list in promptSlots.transformCardTypeCatalogue. Do not invent new card type names.",
                "Before choosing an output format, read the full transformCardTypeCatalogue and pick the most instructionally appropriate type or types.",
                "Each returned card must be fully structured for its chosen type, not reduced to generic front and back text.",
                "Return exactly the requested number of transformed cards. If no count is given, return one card.",
            ],
        )
    }
    return {
        "graph-intervention-orchestrator": graph_orchestrator_profiles,
        "knowledge-graph-agent": graph_proposal_profiles,
        "content-creation-orchestrator": content_orchestrator_profiles,
        "content-creator-agent": content_creator_profiles,
        "content-transform-agent": content_transform_profiles,
    }


def _batch_submission_payload(envelope: BatchSubmissionEnvelope) -> dict[str, Any]:
    return {
        "runId": envelope.run_id,
        "jobId": envelope.job_id,
        "agent": envelope.agent,
        "executionPlan": envelope.execution_plan,
        "status": envelope.status,
        "provider": envelope.provider,
        "model": envelope.model,
        "providerBatchId": envelope.provider_batch_id,
        "pollAfterSeconds": envelope.poll_after_seconds,
    }


def _first_section_value(sections: list[dict[str, Any]], key: str) -> dict[str, Any]:
    for section in sections:
        if isinstance(section, dict) and section.get("key") == key:
            value = section.get("value")
            if isinstance(value, dict):
                return value
    return {}


def _allowed_detail_from_feedback(feedback: dict[str, Any], quiet_surface: bool) -> str:
    if quiet_surface:
        return "Use a quiet, minimal detail level with concise learner-safe wording."
    if feedback.get("detailPreference") == "brief":
        return "Use a brief detail level."
    if feedback.get("detailPreference") == "full":
        return "Use a fuller detail level while staying learner-safe."
    return "Use a standard detail level with learner-safe wording."


def _runtime_section(
    *,
    key: str,
    title: str,
    source_service: str,
    value: Any,
    authority_label: str,
) -> dict[str, Any]:
    return {
        "key": key,
        "title": title,
        "authorityLabel": authority_label,
        "sourceService": source_service,
        "value": value,
        "freshness": {
            "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "ttlMs": 30000,
            "replayable": False,
            "mayRefreshLive": True,
        },
    }


def _lesson_plan_handoff_context(
    sections: list[dict[str, Any]], request: AgentRunRequest
) -> dict[str, Any]:
    step_evidence = _first_section_value(sections, "stepEvidenceRecord")
    curriculum_anchor = _first_section_value(sections, "curriculumAnchorSummary")
    activity_context = _first_section_value(sections, "stepActivityContext")
    objective = _clean_runtime_text(
        step_evidence.get("stepObjectiveText"),
        "Current Step objective is not available in the prefetched evidence record.",
    )
    lesson_goal = _clean_runtime_text(
        curriculum_anchor.get("curriculumAnchorText")
        or curriculum_anchor.get("topicText")
        or activity_context.get("activityPromptText"),
        "Current lesson goal is not available from session or curriculum context.",
    )
    return {
        "currentLessonGoalText": lesson_goal,
        "currentStepRoleText": objective,
        "availableDrillTypesText": [
            "confidence-before-evidence check",
            "cue-selection self-check",
            "minimum-sufficient repair Step",
        ],
        "recommendedInsertionPointText": "After the current Step, before introducing materially new content.",
        "serviceReferences": {
            "sessionId": request.session_id,
            "stepId": request.step_id,
            "conceptIds": request.concept_ids,
            "selectedNodeIds": request.selected_node_ids,
            **(
                curriculum_anchor.get("serviceReferences", {})
                if isinstance(curriculum_anchor.get("serviceReferences"), dict)
                else {}
            ),
        },
    }


def _needs_patch_planner(
    execution_mode: str, sections: list[dict[str, Any]], request: AgentRunRequest
) -> bool:
    if request.payload.get("skipPrerequisiteAgents") is True:
        return False
    if execution_mode == "mental_debugger" and request.payload.get("triggerType") is not None:
        return True
    remediation = _first_section_value(sections, "remediationBrief")
    action = str(remediation.get("recommendedAction", "")).lower()
    if execution_mode == "mental_debugger":
        return any(term in action for term in ("repair", "insert", "drill", "prerequisite", "replan"))
    if execution_mode == "calibration_coach":
        trend = _first_section_value(sections, "calibrationTrendSummary")
        if _runtime_number(trend.get("overconfidenceCount")) > 0:
            return True
        if request.payload.get("needsCalibrationDrill") is True:
            return True
        for section in sections:
            if not isinstance(section, dict) or not str(section.get("key", "")).startswith("conceptMismatchHistory:"):
                continue
            value = section.get("value")
            if isinstance(value, dict) and "drill" in str(value.get("recommendedCalibrationMoveText", "")).lower():
                return True
    return False


def _patch_handoff_context(artifact: dict[str, Any]) -> dict[str, Any]:
    proposals = artifact.get("proposals") if isinstance(artifact.get("proposals"), list) else []
    candidate_moves = [
        _clean_runtime_text(
            f"{proposal.get('kind', 'repair')} via {proposal.get('ownerService', 'owner service')}",
            "repair proposal",
        )
        for proposal in proposals
        if isinstance(proposal, dict)
    ]
    return {
        "repairIntentText": _clean_runtime_text(
            artifact.get("learnerFacingText") or artifact.get("friendlyWhy"),
            "A minimum-sufficient repair may be useful before moving forward.",
        ),
        "minimumSufficientInterventionText": _clean_runtime_text(
            artifact.get("expectedEffort") or artifact.get("statusLabel"),
            "Use the smallest intervention that clarifies the fragile cue.",
        ),
        "candidateRepairMovesText": candidate_moves or ["No concrete repair move was proposed."],
        "notRecommendedMovesText": ["Do not expose raw trace details or rewrite completed Steps."],
        "contentNeedText": _clean_runtime_text(
            artifact.get("repairType"),
            "No additional content need was identified.",
        ),
        "schedulerImpactText": _clean_runtime_text(
            artifact.get("scope"),
            "No scheduler impact was identified.",
        ),
        "state": artifact.get("state"),
        "validation": artifact.get("validation", {}),
        "reviewRouting": artifact.get("reviewRouting", {}),
        "serviceReferences": {
            "agentRunId": artifact.get("agentRunId"),
            "proposalPayloads": [
                proposal.get("payload", {}) for proposal in proposals if isinstance(proposal, dict)
            ],
        },
    }


def _needs_strategy_planner(sections: list[dict[str, Any]], request: AgentRunRequest) -> bool:
    if request.payload.get("skipPrerequisiteAgents") is True:
        return False
    if request.payload.get("trigger") or request.payload.get("forceStrategyPrerequisite"):
        return True
    patch = _first_section_value(sections, "patchPlannerHandoffContext")
    patch_text = " ".join(
        str(value)
        for key, value in patch.items()
        if key.endswith("Text") or key in {"schedulerImpactText", "state"}
    ).lower()
    if any(term in patch_text for term in ("session", "replan", "branch", "scheduler", "insert")):
        return True
    load_state = _first_section_value(sections, "learnerLoadState")
    return str(load_state.get("overloadRiskLevel", "")).lower() == "high"


def _strategy_handoff_context(artifact: dict[str, Any]) -> dict[str, Any]:
    changes = artifact.get("changes") if isinstance(artifact.get("changes"), list) else []
    return {
        "strategyDecisionText": _clean_runtime_text(
            artifact.get("learnerFacingNotice"),
            "Continue with the current session plan unless a reviewable change is accepted.",
        ),
        "continueOrRepairOrReplanText": _clean_runtime_text(
            artifact.get("interventionType"),
            "continue",
        ),
        "whyThisRoutingText": _clean_runtime_text(
            artifact.get("friendlyWhy") or artifact.get("impactSummary"),
            "Routing is based on prefetched Step evidence, remediation signals, and policy limits.",
        ),
        "constraintsText": [
            "Completed Steps remain immutable.",
            "Any session flow change remains a proposal until the owner service validates and persists it.",
        ],
        "state": artifact.get("state"),
        "validation": artifact.get("validation", {}),
        "reviewRouting": artifact.get("reviewRouting", {}),
        "serviceReferences": {
            "agentRunId": artifact.get("agentRunId"),
            "sessionId": artifact.get("sessionId"),
            "changePayloads": [change for change in changes if isinstance(change, dict)],
        },
    }


def _needs_debugger_summary_for_calibration(sections: list[dict[str, Any]]) -> bool:
    return any(
        isinstance(section, dict) and section.get("key") == "diagnosticBrief" for section in sections
    )


def _debugger_summary_for_calibration(sections: list[dict[str, Any]]) -> dict[str, Any]:
    diagnostic = _first_section_value(sections, "diagnosticBrief")
    trace = _first_section_value(sections, "traceEvidencePack")
    frame_evidence = trace.get("frameEvidence") if isinstance(trace.get("frameEvidence"), list) else []
    fragile = [
        _clean_runtime_text(frame.get("frameLabel") or frame.get("frameKey"), "unnamed frame")
        for frame in frame_evidence
        if isinstance(frame, dict) and "fragile" in str(frame.get("signalLabel", "")).lower()
    ]
    strong = [
        _clean_runtime_text(frame.get("frameLabel") or frame.get("frameKey"), "unnamed frame")
        for frame in frame_evidence
        if isinstance(frame, dict) and any(
            term in str(frame.get("signalLabel", "")).lower() for term in ("strong", "secure")
        )
    ]
    return {
        "traceExplanationText": _clean_runtime_text(
            trace.get("traceSummaryText") or diagnostic.get("summaryText"),
            "Trace evidence is available but does not include a learner-facing explanation yet.",
        ),
        "fragileFrameText": ", ".join(fragile) if fragile else "No fragile frame was isolated.",
        "whatWorkedText": ", ".join(strong) if strong else "No clearly strong frame was isolated.",
        "uncertaintyText": _clean_runtime_text(
            trace.get("confidenceNoteText") or diagnostic.get("confidenceNoteText"),
            "Use this as a bounded trace summary, not a full diagnosis.",
        ),
        "serviceReferences": {
            "evaluationId": trace.get("evaluationId") or diagnostic.get("evaluationId"),
            "stepId": trace.get("stepId") or diagnostic.get("stepId"),
        },
    }


def _operation_for_request(request: AgentRunRequest) -> str:
    operation = request.payload.get("operation") or request.payload.get("intent")
    if isinstance(operation, str) and operation:
        return operation
    if request.step_id:
        return "post_step_reflection"
    return "dashboard_summary"


def _build_input_readiness_report(
    *,
    target_agent: str,
    operation: str,
    sections: list[dict[str, Any]],
    errors: list[dict[str, Any]],
    service_manifest: list[dict[str, Any]],
    provider_tools: list[dict[str, Any]],
    prerequisite_artifacts: dict[str, Any],
    policy: dict[str, Any],
    execution_mode: str,
) -> dict[str, Any]:
    missing_fields = _missing_readiness_fields(sections=sections, operation=operation)
    policy_hidden_fields = []
    if policy.get("surfaceVisibility") == "hidden":
        policy_hidden_fields.append(
            {
                "fieldName": "traceEvidencePack",
                "reason": policy.get("learnerFacingPolicyText", "Watchtower hid this surface."),
                "source": "watchtowerPolicyContext",
            }
        )

    blocking_reasons = [
        str(error.get("message") or error.get("kind") or "context fetch error")
        for error in errors
        if isinstance(error, dict)
    ]
    blocking_reasons.extend(str(field["reason"]) for field in missing_fields)
    blocking_reasons.extend(
        f"{field['fieldName']}: {field['reason']}" for field in policy_hidden_fields
    )

    artifact_statuses = _prerequisite_agent_fields(prerequisite_artifacts)
    blocked_artifacts = [
        artifact for artifact in artifact_statuses if str(artifact.get("status", "")).lower() in {"blocked", "guardian_blocked"}
    ]
    if blocked_artifacts:
        blocking_reasons.append("A prerequisite agent artifact was blocked by validation.")

    if policy.get("surfaceVisibility") == "hidden":
        readiness_state = "hidden_by_policy"
    elif policy.get("mustDeferNow") is True:
        readiness_state = "hidden_by_policy"
        blocking_reasons.append(
            "Watchtower policy deferred this learner-facing surface because current load or intrusion risk is too high."
        )
    elif errors:
        readiness_state = "blocked_by_validation"
    elif missing_fields:
        readiness_state = "deferred_missing_deterministic_context"
    elif blocked_artifacts:
        readiness_state = "deferred_waiting_for_prerequisite_agent"
    elif _has_empty_history(sections):
        readiness_state = "ready_with_empty_history"
    else:
        readiness_state = "ready"

    section_keys = [
        str(section.get("key"))
        for section in sections
        if isinstance(section, dict) and isinstance(section.get("key"), str)
    ]
    return {
        "targetAgent": target_agent,
        "operation": operation,
        "executionMode": execution_mode,
        "sectionCount": len(sections),
        "errorCount": len(errors),
        "serviceManifestCount": len(service_manifest),
        "providerToolCount": len(provider_tools),
        "readinessState": readiness_state,
        "blockingReasons": blocking_reasons,
        "missingFields": missing_fields,
        "policyHiddenFields": policy_hidden_fields,
        "prefetchedFields": _prefetched_fields(sections),
        "callableToolFields": _callable_tool_fields(provider_tools),
        "prerequisiteAgentFields": artifact_statuses,
        "inferredFallbackFields": _inferred_fallback_fields(sections, prerequisite_artifacts),
        "serviceInputManifest": service_manifest,
        "humanReadableReasoningSections": [
            key for key in section_keys if key in _HUMAN_READABLE_REASONING_SECTION_KEYS or ":" in key
        ],
        "serviceContractSections": [
            key for key in section_keys if key in _SERVICE_CONTRACT_SECTION_KEYS
        ],
        "ready": readiness_state in {"ready", "ready_with_empty_history"},
    }


_HUMAN_READABLE_REASONING_SECTION_KEYS = {
    "stepLoopSnapshot",
    "stepEvidenceRecord",
    "rubricSummary",
    "evaluation",
    "traceEvidencePack",
    "diagnosticBrief",
    "remediationBrief",
    "conceptLearningContext",
    "contentAnchorSummaries",
    "curriculumAnchorSummary",
    "learnerFeedbackHistory",
    "learnerLoadState",
    "exposureBudgetState",
    "repeatedPatternHistory",
    "calibrationTrendSummary",
    "priorCalibrationDrillHistory",
    "interventionCadenceState",
    "watchtowerPolicyContext",
    "lessonPlanHandoffContext",
    "patchPlannerHandoffContext",
    "strategyHandoffContext",
    "debuggerSummaryForCalibration",
}

_SERVICE_CONTRACT_SECTION_KEYS = {
    "stepEvidenceRecord",
    "traceEvidencePack",
    "watchtowerPolicyContext",
    "lessonPlanHandoffContext",
    "patchPlannerHandoffContext",
    "strategyHandoffContext",
    "debuggerSummaryForCalibration",
    "agentInputReadinessReport",
}


def _clean_runtime_text(value: Any, fallback: str) -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()[:1200]
    return fallback


def _runtime_number(value: Any) -> float:
    return float(value) if isinstance(value, (int, float)) else 0.0


def _section_exists(sections: list[dict[str, Any]], key: str) -> bool:
    return any(isinstance(section, dict) and section.get("key") == key for section in sections)


def _missing_readiness_fields(*, sections: list[dict[str, Any]], operation: str) -> list[dict[str, Any]]:
    missing: list[dict[str, Any]] = []
    post_step = operation in {"post_step_reflection", "repair_handoff", "check_step_recommendation", "analysis"}
    if post_step:
        evidence = _first_section_value(sections, "stepEvidenceRecord")
        if not evidence:
            missing.append(
                {
                    "fieldName": "stepEvidenceRecord",
                    "reason": "Step objective and learner answer summary are required for post-Step learner-facing agents.",
                    "sourceClass": "prefetched_deterministic_context",
                }
            )
        else:
            completeness = evidence.get("evidenceCompleteness") if isinstance(evidence.get("evidenceCompleteness"), dict) else {}
            if str(completeness.get("state", "")).lower() in {"missing_required", "incomplete"}:
                missing.append(
                    {
                        "fieldName": "stepEvidenceRecord.evidenceCompleteness",
                        "reason": "Step evidence record reports missing required fields.",
                        "sourceClass": "prefetched_deterministic_context",
                    }
                )
            for field_name, reason in (
                ("stepObjectiveText", "Step objective text is missing."),
                ("learnerAnswerSummaryText", "Learner answer summary text is missing."),
            ):
                if not _clean_runtime_text(evidence.get(field_name), ""):
                    missing.append(
                        {
                            "fieldName": f"stepEvidenceRecord.{field_name}",
                            "reason": reason,
                            "sourceClass": "prefetched_deterministic_context",
                        }
                    )
        rubric = _first_section_value(sections, "rubricSummary")
        if not rubric or not _clean_runtime_text(rubric.get("rubricSummaryText"), ""):
            missing.append(
                {
                    "fieldName": "rubricSummary.rubricSummaryText",
                    "reason": "Rubric summary text is required for post-Step reflection.",
                    "sourceClass": "prefetched_deterministic_context",
                }
            )
        trace = _first_section_value(sections, "traceEvidencePack")
        frame_evidence = trace.get("frameEvidence") if isinstance(trace.get("frameEvidence"), list) else []
        trace_completeness = trace.get("traceCompleteness") if isinstance(trace.get("traceCompleteness"), dict) else {}
        if not trace or not frame_evidence or str(trace_completeness.get("state", "")).lower() in {"missing_required", "incomplete"}:
            missing.append(
                {
                    "fieldName": "traceEvidencePack.frameEvidence",
                    "reason": "Frame-level trace evidence is required before learner-facing reflective agents run.",
                    "sourceClass": "prefetched_deterministic_context",
                }
            )
    for required in ("watchtowerPolicyContext", "lessonPlanHandoffContext"):
        if not _section_exists(sections, required):
            missing.append(
                {
                    "fieldName": required,
                    "reason": f"{required} must be finalized before learner-facing agent execution.",
                    "sourceClass": "runtime_orchestration",
                }
            )
    return missing


def _prefetched_fields(sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    fields: list[dict[str, Any]] = []
    for section in sections:
        if not isinstance(section, dict):
            continue
        key = section.get("key")
        if not isinstance(key, str) or key in {
            "watchtowerPolicyContext",
            "lessonPlanHandoffContext",
            "patchPlannerHandoffContext",
            "strategyHandoffContext",
            "debuggerSummaryForCalibration",
            "agentInputReadinessReport",
        }:
            continue
        fields.append(
            {
                "fieldName": key,
                "sourceService": section.get("sourceService"),
                "authorityLabel": section.get("authorityLabel"),
                "freshness": section.get("freshness", {}),
            }
        )
    return fields


def _callable_tool_fields(provider_tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "fieldName": str(tool.get("name") or tool.get("tool")),
            "service": tool.get("service"),
            "sideEffects": bool(tool.get("sideEffects")),
            "valueMode": "callable_at_provider_runtime",
        }
        for tool in provider_tools
        if isinstance(tool, dict)
    ]


def _prerequisite_agent_fields(prerequisite_artifacts: dict[str, Any]) -> list[dict[str, Any]]:
    fields: list[dict[str, Any]] = []
    for key, value in prerequisite_artifacts.items():
        status = "complete"
        validation = value.get("validation") if isinstance(value, dict) and isinstance(value.get("validation"), dict) else {}
        if isinstance(value, dict) and str(value.get("state", "")).lower() in {"blocked", "guardian_blocked"}:
            status = str(value.get("state"))
        if validation.get("state") == "rejected":
            status = "blocked"
        fields.append(
            {
                "fieldName": key,
                "sourceAgent": _source_agent_for_prerequisite(key),
                "status": status,
                "authorityLabel": "agent_inference" if "debugger" not in key.lower() else "deterministic_projection",
            }
        )
    return fields


def _source_agent_for_prerequisite(key: str) -> str:
    if key == "patchPlannerHandoffContext":
        return "patch-planner-remediation-agent"
    if key == "strategyHandoffContext":
        return "strategy-replanning-agent"
    if key == "debuggerSummaryForCalibration":
        return "mental-debugger-summary-projection"
    return "agents-runtime"


def _inferred_fallback_fields(sections: list[dict[str, Any]], prerequisite_artifacts: dict[str, Any]) -> list[dict[str, Any]]:
    inferred: list[dict[str, Any]] = []
    lesson = _first_section_value(sections, "lessonPlanHandoffContext")
    if "not available" in str(lesson.get("currentLessonGoalText", "")).lower():
        inferred.append(
            {
                "fieldName": "lessonPlanHandoffContext.currentLessonGoalText",
                "reason": "Fallback wording used because session/curriculum lesson goal was unavailable.",
            }
        )
    if "debuggerSummaryForCalibration" in prerequisite_artifacts:
        inferred.append(
            {
                "fieldName": "debuggerSummaryForCalibration",
                "reason": "Deterministic projection from trace evidence until Phase 5 decides whether Mental Debugger must author this artifact.",
            }
        )
    return inferred


def _has_empty_history(sections: list[dict[str, Any]]) -> bool:
    empty_markers = (
        "no prior similar step evidence",
        "no recent calibration trend recorded",
        "no corrections or dismissals recorded",
        "no prior calibration drills recorded",
        "no concept-specific confidence/reasoning mismatch history",
    )
    for section in sections:
        if not isinstance(section, dict):
            continue
        key = str(section.get("key", ""))
        if key not in {
            "learnerFeedbackHistory",
            "repeatedPatternHistory",
            "calibrationTrendSummary",
            "priorCalibrationDrillHistory",
        } and not key.startswith("conceptMismatchHistory:"):
            continue
        if any(marker in str(section.get("value", "")).lower() for marker in empty_markers):
            return True
    return False


def _curriculum_planner_instructions() -> list[str]:
    return [
        "You are a curriculum systems planner, not a concept sequencer.",
        "Design one coherent learner progression DAG that adapts to learner state while preserving structural integrity.",
        "Treat prerequisite weakness as a real system constraint. A learner may take a short adaptive detour, but must return to prerequisite repair quickly.",
        "Never produce unrelated mini-paths or disconnected branches unless the request explicitly asks for separate curricula.",
        "Create branches only for one of these reasons: focus-area exploration, short prerequisite diversion, or remediation after evidence.",
        "Every diversion branch must include an explicit rejoin plan through branchExitTargets and rationale.",
        "Personalize progression using learner state, known gaps, branch drift, and focus signals, but do not let learner interest indefinitely postpone missing prerequisites.",
        "Separate recorded facts from context, your inferences about learner readiness, and your graph proposals.",
        "Think in systems: account for prerequisite risk, content coverage gaps, blocked nodes, learner momentum, and rejoin cost together before proposing structure.",
        "When branches compete, prefer the option that preserves momentum without increasing prerequisite debt.",
        "Use branchInfo precisely: pathRole explains the pedagogical role, isMainPath marks the main return route, branchGroupKey groups sibling options, branchEntryStrategy explains why the learner enters, branchExitTargets defines how they rejoin, and focusTags describe what the branch optimizes for.",
        "Use pathExplanation to describe the main path, focus branches, and diversions in plain language for downstream reviewers.",
        "Use branchDecisionPoints to capture where the learner has a meaningful route choice and why that choice exists.",
        "Use learnerModelSummary to summarize the learner knowledge state and planning assumptions that drove personalization.",
        "Use planningSignalsUsed to enumerate the decisive signals you actually used from the context.",
        "Allowed edge types are prerequisite, recommended_before, reinforces, branch_option, and diversion_to. Do not invent new edge types.",
        "A node must include either ckgConceptId or proposedConcept. Proposed concepts are allowed only for short diversion/remediation or capstone-style planning nodes when no anchored concept is available.",
        "Do not use branch_option or diversion_to casually. Each must have a clear pedagogical reason and a bounded path back toward mastery.",
        "Before finalizing, verify the graph stays coherent, branch-aware, personalized, and strict about returning to prerequisites.",
        "Avoid these failure modes: linear-only graphs, interest branches with no rejoin path, remediation branches that never resolve the blocker, branches that duplicate the same learning objective, and outputs that ignore learner-state evidence.",
    ]


def _curriculum_outline_instructions() -> list[str]:
    return [
        "You are analyzing a learner goal before any curriculum DAG is generated.",
        "Do not draft the final curriculum yet. Your job is to infer candidate concept anchors, likely prerequisite themes, and a provisional path that the learner can review.",
        "Treat the learner's goal as primary and concept IDs as something the system should resolve later, not something the learner must already know.",
        "Return candidate concepts in learner-facing language with clear whySuggested explanations.",
        "Use candidateGroups to cluster related anchors so the learner can inspect and edit them coherently.",
        "Use ambiguityNotes to surface where the goal is broad, underspecified, or spans multiple domains.",
        "Use prerequisiteThemes to explain the educational bridges the learner may need before the target area.",
        "Use provisionalOutline only as an exploratory staging sketch, not as a durable DAG.",
        "Mark readiness for concept approval, not for immediate curriculum import.",
        "Avoid these failure modes: pretending free-text hints are resolved concepts, hiding uncertainty, or emitting a final curriculum before concept approval happens.",
    ]


def _curriculum_revision_instructions() -> list[str]:
    return [
        "You are a curriculum systems planner revising a live curriculum system, not rewriting it from scratch.",
        "Prefer minimal structural edits that improve learner progression while preserving already-valid work.",
        "Completed or stable learner progress should be preserved unless the evidence clearly demands structural invalidation.",
        "Use branch-aware revisions when the evidence indicates branch drift, prerequisite blockage, or sustained learner focus on an alternate branch.",
        "Every proposed change must explain the intended effect and the risk if it is applied poorly.",
        "Short adaptive detours are allowed, but the revision must enforce a quick return to prerequisite repair.",
        "Use changeStrategySummary to explain the overall revision approach before enumerating changes.",
        "Use only supported change kinds and make each payload actionable for downstream services.",
        "Do not emit a full replacement graph unless the request or evidence explicitly requires it.",
        "Avoid these failure modes: revisions that erase learner progress, vague changes with no effect, branch promotions that ignore missing prerequisites, and remediation paths with no rejoin strategy.",
    ]


def _content_creator_instructions() -> list[str]:
    return [
        "Create content only from a ready ContentCreationPromptV2.",
        "Optimize for pedagogical fit first, then grounding quality, then personalization, then coverage/value, and only then style or polish.",
        "Before drafting anything, inspect the full input and identify: target concepts, learner state, curriculum context, content coverage gaps, available source evidence, grounding strength, readiness state, and output constraints.",
        "Input zone policy: pedagogicalContext is for reasoning and decisions; serviceContract is only for IDs, schema compliance, and downstream handoff; groundingReport and readiness fields decide whether generation is allowed, grounded, partial, or blocked; population and provenance metadata distinguish recorded facts from inferred, static, or defaulted fields.",
        "Read-before-write protocol: first read pedagogicalContext.targetConcepts for the exact learning target; then pedagogicalContext.learnerState for instability, misconception, and overload signals; then pedagogicalContext.curriculumContext for whether the artifact should repair, reinforce, extend, or assess; then pedagogicalContext.contentCoverageContext to avoid duplicating already-covered artifact types unless reinforcement is explicitly needed; then pedagogicalContext.ragContext and groundingReport to determine grounding strength; then guardianPolicy and outputPedagogy.responseExpectations before drafting.",
        "Reason only from human-readable pedagogicalContext, groundingReport, and readiness signals. Treat serviceContract as a transport contract. Never derive pedagogy from IDs, mappings, or downstream handoff fields.",
        "Resolve conflicts in this order: safety and guardian constraints, grounding availability, learner knowledge state, curriculum intent, then content variety or polish.",
        "If source evidence is missing or weak, narrow the claim, simplify the artifact, reduce scope, and surface uncertainty in structured fields instead of hallucinating coverage.",
        "Stay strictly grounded when the source policy or grounding state requires it. Generalize only when the prompt signals that controlled generalization is allowed and evidence remains directionally sufficient.",
        "Personalization must be operational, not cosmetic: adapt difficulty, transformation type, pacing, and artifact form to learner stability, reasoning weakness, likely misconception pattern, novelty-vs-reinforcement needs, and cognitive load.",
        "Coverage policy: choose whether the artifact should repair, reinforce, extend, or assess based on curriculum context and learner state, not randomness.",
        "Variety policy: avoid repeating recent transformations unless repetition is explicitly needed, match missing card types when coverage gaps exist, and choose activity form based on learner need rather than surface novelty.",
        "Output discipline: cards must be targeted, grounded, and concept-aligned; activityVariants must be pedagogically distinct rather than paraphrases; coveragePlan must explain what learner need the output covers; groundingReport must state what evidence was used and where confidence is limited.",
        "Treat generated content as a proposal until content-service and Pedagogy Guardian accept it.",
        "Avoid these failure modes: reasoning from serviceContract IDs, ignoring weak grounding, generating before checking readiness, producing elegant but pedagogically mismatched artifacts, repeating existing content shape without need, and over-diagnosing learner psychology from sparse data.",
        "Before finalizing, verify that each artifact is grounded, instructionally appropriate, personalized in a concrete way, distinct from prior coverage when needed, and faithful to the output contract.",
    ]


def _graph_intervention_orchestrator_instructions() -> list[str]:
    return [
        "Build a finalized GraphAgentPromptV1 before any graph reasoning or mutation proposal.",
        "Resolve labels and IDs before graph-agent reasoning whenever the available context allows it.",
        "Expose only human-readable pedagogicalContext to reasoning agents.",
        "Keep serviceContract IDs, routing, idempotency keys, and write-plan structures for downstream handoff only.",
        "Before finalizing readiness, inspect the full input and identify: requested operation, target concepts, resolved vs unresolved identities, relation candidates, learner graph signals, source evidence strength, ambiguity risk, and policy constraints.",
        "Input zone policy: pedagogicalContext is for reasoning; serviceContract is for transport, IDs, write compatibility, routing, and idempotency; populationReport distinguishes prefetched facts from inferred, static, or missing fields.",
        "If identity resolution is weak, ambiguity is blocking, or required source evidence is missing, reduce commitment and block or downgrade readiness instead of pretending the graph is ready.",
        "Block unresolved identities and duplicate ambiguities unless the operation explicitly asks for a mapping choice.",
        "Do not allow downstream graph reasoning to infer semantics from node IDs or transport-only fields.",
        "Prefer explicit reviewable ambiguity over silent assumptions.",
    ]


def _knowledge_graph_agent_instructions() -> list[str]:
    return [
        "Accept only finalized GraphAgentPromptV1 context from the graph-intervention-orchestrator.",
        "You are producing reviewable graph proposals, not executing graph writes.",
        "Optimize for this priority order: policy and mutation safety, identity resolution correctness, ambiguity handling, source evidence strength, graph coherence, learner value, then completeness or polish.",
        "Before generating anything, inspect the full input and identify: requested operation, target concepts, resolved identities, unresolved identities, relation candidates by type, learner graph signals, source evidence strength, ambiguity risks, policy constraints, and downstream output constraints.",
        "Read-before-write protocol:",
        "1. Read pedagogicalContext.requestedOperation and identify the exact graph task.",
        "2. Read pedagogicalContext.targetConcepts and identify the human-readable concepts.",
        "3. Read pedagogicalContext.relationCandidates and separate prerequisites, related concepts, contrasts, confusables, and misconception links.",
        "4. Read pedagogicalContext.learnerGraphSignals and determine whether any relation deserves stronger pedagogical emphasis.",
        "5. Read pedagogicalContext.sourceEvidence and determine whether evidence is strong enough for confident structure or only for reviewable proposals.",
        "6. Read pedagogicalContext.ambiguities and determine whether duplicate, merge, or split ambiguity blocks confident mutation.",
        "7. Read pedagogicalContext.policyContext before drafting any proposal.",
        "8. Read populationReport to distinguish prefetched facts from inferred, static, or missing fields.",
        "9. Use serviceContract only for IDs, mutation compatibility, routing, and idempotency. Never reason from IDs.",
        "10. If identity resolution, evidence, or ambiguity is weak, reduce commitment and return reviewable proposals instead of pretending certainty.",
        "Reason over human-readable pedagogicalContext, not node IDs.",
        "Use serviceContract IDs only for downstream handoff shapes.",
        "Learner signals may influence pedagogical importance, prerequisite emphasis, misconception priority, or contrast/confusable relevance, but must not be treated as sufficient evidence for graph mutation on their own.",
        "If source evidence is weak or missing, narrow the claim, lower confidence, and prefer candidate proposals or mapping-choice outputs instead of hallucinating structure.",
        "If ambiguity is blocking, do not produce confident mutation proposals.",
        "Proposals must reference source document IDs when available.",
        "Return proposals for all requested concept IDs even when confidence is low, but clearly distinguish high-confidence mutations from low-confidence review candidates.",
        "Never emit fromNodeId/toNodeId; downstream CKG add_edge uses sourceNodeId/targetNodeId.",
        "Avoid these failure modes: reasoning from serviceContract IDs, ignoring unresolved identities, proposing writes before examining ambiguity, inventing prerequisite edges without evidence, collapsing distinct relation types into one bucket, overfitting graph structure to weak learner signals, or treating review routing as optional.",
        "Before finalizing, verify that every proposal is evidence-aware, ambiguity-aware, identity-safe, and downstream-compatible.",
    ]
