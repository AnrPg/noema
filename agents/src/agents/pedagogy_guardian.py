"""Agent wrapper around the Pedagogy Guardian validation service."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, Literal, cast
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from .guardian_client import GuardianClient, GuardianOutcome


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


class PedagogyGuardianRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_id: str = Field(alias="userId")
    artifact_type: Literal[
        "lesson_plan",
        "step",
        "activity",
        "replan",
        "generated_variant",
        "coaching_artifact",
    ] = Field(alias="artifactType")
    artifact: dict[str, Any] = Field(default_factory=dict)
    producer_service: str = Field(default="agents-runtime", alias="producerService")
    producer_agent: str | None = Field(default=None, alias="producerAgent")
    context_pack: dict[str, Any] = Field(default_factory=dict, alias="contextPack")
    provider: str | None = None
    model: str | None = None
    agent_run_id: str | None = Field(default=None, alias="agentRunId")
    prompt_template_version: str = Field(default="pedagogy-guardian.v1", alias="promptTemplateVersion")
    execution_strategy: str = Field(default="realtime", alias="executionStrategy")
    batch_requested: bool = Field(default=False, alias="batchRequested")


class PedagogyGuardianAgent:
    """Delegates validation to the owning Guardian service and normalizes the result."""

    def __init__(self, guardian: GuardianClient) -> None:
        self._guardian = guardian

    async def validate(self, request: PedagogyGuardianRequest) -> dict[str, Any]:
        outcome = await self._call_guardian(request)
        return self._normalize_outcome(request, outcome)

    async def finalize_validation(
        self,
        *,
        generated: dict[str, Any],
        request: PedagogyGuardianRequest,
    ) -> dict[str, Any]:
        artifact = generated.get("artifact")
        if isinstance(artifact, dict):
            request = request.model_copy(update={"artifact": artifact})
        outcome = await self._call_guardian(request)
        return self._normalize_outcome(request, outcome)

    async def _call_guardian(self, request: PedagogyGuardianRequest) -> GuardianOutcome:
        if request.artifact_type == "lesson_plan":
            return await self._guardian.validate_lesson_plan(request.artifact)
        if request.artifact_type == "coaching_artifact":
            validator = getattr(self._guardian, "validate_coaching_artifact", None)
            if callable(validator):
                return cast("GuardianOutcome", await validator(request.artifact))
            return await self._guardian.validate_activity(_coaching_as_activity(request.artifact))
        if request.artifact_type in {"activity", "step", "generated_variant", "replan"}:
            tool_name = {
                "activity": "validate-activity",
                "step": "validate-step",
                "generated_variant": "validate-generated-variant",
                "replan": "validate-replan",
            }[request.artifact_type]
            executor = self._guardian._post
            path = {
                "validate-activity": "/v1/validate/activity",
                "validate-step": "/v1/validate/step",
                "validate-generated-variant": "/v1/validate/generated-variant",
                "validate-replan": "/v1/validate/replan",
            }[tool_name]
            return await executor(path, request.artifact)
        raise ValueError(f"Unsupported Guardian artifact type: {request.artifact_type}")

    def _normalize_outcome(
        self,
        request: PedagogyGuardianRequest,
        outcome: GuardianOutcome,
    ) -> dict[str, Any]:
        run_id = request.agent_run_id or f"guardian_{uuid4().hex[:8]}"
        decision = "accepted" if outcome.accepted else "rejected"
        status_label = "Guardian accepted" if outcome.accepted else "Guardian blocked"
        friendly_why = (
            "Guardian accepted this artifact. It is ready for the owning service review path."
            if outcome.accepted
            else "Guardian blocked this artifact because it needs repair before learner exposure."
        )
        manifest = _context_manifest(request.context_pack)
        return {
            "agentRunId": run_id,
            "artifactKind": "guardian_validation",
            "artifactType": request.artifact_type,
            "producerService": request.producer_service,
            "producerAgent": request.producer_agent,
            "decision": decision,
            "statusLabel": status_label,
            "friendlyWhy": friendly_why,
            "validationId": outcome.validation_id,
            "reasonCodes": outcome.reason_codes or outcome.reasons,
            "repairReasons": [] if outcome.accepted else outcome.reasons,
            "rejectedArtifacts": []
            if outcome.accepted
            else [
                {
                    "kind": request.artifact_type,
                    "draft": request.artifact,
                    "repairReasons": outcome.reasons,
                }
            ],
            "reviewRouting": {
                "surface": _surface_for(request.artifact_type),
                "statusLabel": status_label,
                "friendlyWhy": friendly_why,
                "technicalProvenanceBelowFold": True,
                "hideInternalToolCalls": True,
            },
            "provenance": {
                "agentRunId": run_id,
                "promptTemplateVersion": request.prompt_template_version,
                "contextManifest": manifest,
                "sourceServiceReferences": _source_refs(manifest),
                "validationId": outcome.validation_id,
            },
            "execution": {
                "provider": request.provider,
                "model": request.model,
                "strategy": request.execution_strategy,
                "batchRequested": request.batch_requested,
            },
            "generatedAt": _now_iso(),
        }


def _coaching_as_activity(artifact: dict[str, Any]) -> dict[str, Any]:
    artifact_id = str(artifact.get("id") or artifact.get("agentRunId") or "coaching_artifact")
    return {
        "id": artifact_id,
        "contentSourceType": "generated",
        "generatedVariantId": artifact_id,
        "prompt": str(artifact.get("learnerFacingText") or artifact.get("summary") or ""),
        "expectedResponseType": "reflection",
        "responseSchema": {"type": "string"},
        "content": artifact,
    }


def _context_manifest(context_pack: dict[str, Any]) -> list[dict[str, Any]]:
    sections = context_pack.get("sections", [])
    if not isinstance(sections, list):
        return []
    return [
        {
            "key": section.get("key"),
            "sourceService": section.get("sourceService"),
            "authorityLabel": section.get("authorityLabel"),
            "freshness": section.get("freshness"),
        }
        for section in sections
        if isinstance(section, dict)
    ]


def _source_refs(manifest: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {"key": item.get("key"), "sourceService": item.get("sourceService")}
        for item in manifest
        if item.get("sourceService")
    ]


def _surface_for(artifact_type: str) -> str:
    return {
        "lesson_plan": "session-plan-review",
        "step": "session-plan-review",
        "activity": "content-workbench",
        "generated_variant": "content-workbench",
        "replan": "strategy-plan-change-review",
        "coaching_artifact": "post-step-reflection",
    }.get(artifact_type, "review-workbench")
