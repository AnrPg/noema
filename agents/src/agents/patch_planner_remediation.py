"""Guardian-validated Patch Planner / Remediation agent."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, cast
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from .guardian_client import GuardianClient, GuardianOutcome


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


class PatchPlannerRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_id: str = Field(alias="userId")
    session_id: str | None = Field(default=None, alias="sessionId")
    step_id: str | None = Field(default=None, alias="stepId")
    concept_ids: list[str] = Field(default_factory=list, alias="conceptIds")
    study_mode: str | None = Field(default=None, alias="studyMode")
    trigger_type: str | None = Field(default=None, alias="triggerType")
    user_intent: dict[str, Any] = Field(default_factory=dict, alias="userIntent")
    context_pack: dict[str, Any] = Field(default_factory=dict, alias="contextPack")
    provider: str | None = None
    model: str | None = None
    agent_run_id: str | None = Field(default=None, alias="agentRunId")
    prompt_template_version: str = Field(default="patch-planner-remediation-agent.v1", alias="promptTemplateVersion")
    execution_strategy: str = Field(default="realtime", alias="executionStrategy")
    batch_requested: bool = Field(default=False, alias="batchRequested")


class PatchPlannerAgent:
    """Turns diagnostic signals into reviewable repair proposals."""

    def __init__(self, guardian: GuardianClient) -> None:
        self._guardian = guardian

    async def plan(self, request: PatchPlannerRequest) -> dict[str, Any]:
        generated = self._fallback_proposal(request)
        return await self.finalize_patch(generated=generated, request=request)

    async def finalize_patch(
        self,
        *,
        generated: dict[str, Any],
        request: PatchPlannerRequest,
    ) -> dict[str, Any]:
        run_id = request.agent_run_id or f"patch_{uuid4().hex[:8]}"
        normalized = self._normalize(generated, request, run_id)
        reason = _local_block_reason(normalized)
        if reason is not None:
            return self._blocked(normalized, [reason], request)

        outcome = await self._validate_with_guardian(normalized)
        if not outcome.accepted:
            return self._blocked(normalized, outcome.reasons, request, outcome.validation_id)

        normalized["guardianValidationId"] = outcome.validation_id
        normalized["validation"] = {
            "state": "accepted",
            "validator": "pedagogy-guardian-service",
            "validationId": outcome.validation_id,
            "reasonCodes": outcome.reason_codes,
        }
        normalized["provenance"]["validationId"] = outcome.validation_id
        return normalized

    def _fallback_proposal(self, request: PatchPlannerRequest) -> dict[str, Any]:
        remediation = _first_section_value(request.context_pack, "remediationBrief")
        evaluation = _first_section_value(request.context_pack, "evaluation")
        action = _clean_text(remediation.get("recommendedAction"), request.trigger_type or "repair_step")
        repeated = bool(remediation.get("repeatedPattern") or remediation.get("isRepeated"))
        reasoning = _number(evaluation, "reasoningQuality", None)

        scope = "local_step"
        repair_type = "repair_step"
        if reasoning is not None and reasoning >= 0.7:
            scope = "micro_prompt"
            repair_type = "self_check"
        if "prerequisite" in action or repeated:
            scope = "session_repair" if not repeated else "curriculum_branch"
            repair_type = "prerequisite_refresh"
        if "confidence" in action:
            scope = "calibration_drill"
            repair_type = "calibration_drill"
        if "defer" in action or "no_repair" in action:
            scope = "defer"
            repair_type = "no_repair"

        learner_text = (
            "A tiny repair may help here. It should check the cue that made this Step fragile "
            "without changing the rest of the plan."
        )
        if scope == "defer":
            learner_text = "No repair needed yet. This looks like a weak signal, and the next Step can clarify it."
        elif scope == "curriculum_branch":
            learner_text = "This looks repeated enough to save as a repair branch proposal instead of interrupting now."

        return {
            "state": "candidate",
            "scope": scope,
            "repairType": repair_type,
            "statusLabel": _status_for_scope(scope),
            "learnerFacingText": learner_text,
            "friendlyWhy": learner_text,
            "expectedEffort": "about two minutes" if scope not in {"defer", "curriculum_branch"} else "later",
            "proposals": [
                {
                    "kind": scope,
                    "ownerService": _owner_for_scope(scope),
                    "payload": {
                        "conceptIds": request.concept_ids or _strings(remediation.get("conceptRefs")),
                        "stepId": request.step_id,
                        "repairType": repair_type,
                    },
                    "state": "needs_review",
                }
            ],
        }

    def _normalize(
        self,
        generated: dict[str, Any],
        request: PatchPlannerRequest,
        run_id: str,
    ) -> dict[str, Any]:
        scope = _clean_text(generated.get("scope"), "local_step")
        learner_text = _clean_text(generated.get("learnerFacingText") or generated.get("friendlyWhy"), "A repair proposal is available.")
        proposals = _proposals(generated.get("proposals"), request, scope)
        manifest = _context_manifest(request.context_pack)
        return {
            "agentRunId": run_id,
            "artifactKind": "repair_proposal",
            "state": _clean_text(generated.get("state"), "candidate"),
            "scope": scope,
            "repairType": _clean_text(generated.get("repairType"), "repair_step"),
            "statusLabel": _clean_text(generated.get("statusLabel"), _status_for_scope(scope)),
            "learnerFacingText": learner_text,
            "friendlyWhy": _clean_text(generated.get("friendlyWhy"), learner_text),
            "expectedEffort": _clean_text(generated.get("expectedEffort"), "small"),
            "proposals": proposals,
            "reviewRouting": {
                "surface": _surface_for_scope(scope),
                "statusLabel": _status_for_scope(scope),
                "friendlyWhy": learner_text,
                "technicalProvenanceBelowFold": True,
                "hideInternalToolCalls": True,
            },
            "provenance": {
                "agentRunId": run_id,
                "promptTemplateVersion": request.prompt_template_version,
                "contextManifest": manifest,
                "sourceServiceReferences": _source_refs(manifest),
                "validationId": None,
            },
            "execution": {
                "provider": request.provider,
                "model": request.model,
                "strategy": request.execution_strategy,
                "batchRequested": request.batch_requested,
            },
            "generatedAt": _now_iso(),
        }

    async def _validate_with_guardian(self, normalized: dict[str, Any]) -> GuardianOutcome:
        validator = getattr(self._guardian, "validate_coaching_artifact", None)
        if callable(validator):
            return cast("GuardianOutcome", await validator({**normalized, "triggeredBy": "patch-planner-remediation-agent"}))
        return await self._guardian.validate_activity(
            {
                "id": normalized["agentRunId"],
                "contentSourceType": "generated",
                "generatedVariantId": normalized["agentRunId"],
                "prompt": normalized["learnerFacingText"],
                "expectedResponseType": "reflection",
                "responseSchema": {"type": "string"},
                "content": normalized,
            }
        )

    def _blocked(
        self,
        normalized: dict[str, Any],
        reasons: list[str],
        request: PatchPlannerRequest,
        validation_id: str | None = None,
    ) -> dict[str, Any]:
        return {
            **normalized,
            "state": "blocked",
            "rejectedArtifacts": [
                {
                    "kind": "repair_proposal",
                    "draft": normalized,
                    "repairReasons": reasons,
                }
            ],
            "validation": {
                "state": "rejected",
                "validator": "pedagogy-guardian-service",
                "validationId": validation_id,
                "reasons": reasons,
            },
            "provenance": {
                **normalized["provenance"],
                "validationId": validation_id,
                "agentRunId": request.agent_run_id or normalized["agentRunId"],
            },
        }


def _first_section_value(context_pack: dict[str, Any], key: str) -> dict[str, Any]:
    for section in context_pack.get("sections", []):
        if isinstance(section, dict) and section.get("key") == key and isinstance(section.get("value"), dict):
            return cast("dict[str, Any]", section["value"])
    return {}


def _number(source: dict[str, Any], key: str, default: float | None) -> float | None:
    value = source.get(key)
    return float(value) if isinstance(value, (int, float)) else default


def _clean_text(value: Any, fallback: str) -> str:
    return str(value).strip()[:900] if isinstance(value, str) and value.strip() else fallback


def _strings(value: Any) -> list[str]:
    return [str(item).strip() for item in value if isinstance(item, str) and item.strip()] if isinstance(value, list) else []


def _proposals(value: Any, request: PatchPlannerRequest, scope: str) -> list[dict[str, Any]]:
    if isinstance(value, list) and value:
        normalized: list[dict[str, Any]] = []
        for item in value:
            if not isinstance(item, dict):
                continue
            item_scope = _clean_text(item.get("kind") or item.get("scope"), scope)
            normalized.append(
                {
                    "kind": item_scope,
                    "ownerService": _clean_text(item.get("ownerService"), _owner_for_scope(item_scope)),
                    "payload": item.get("payload") if isinstance(item.get("payload"), dict) else {},
                    "state": _clean_text(item.get("state"), "needs_review"),
                }
            )
        if normalized:
            return normalized
    return [
        {
            "kind": scope,
            "ownerService": _owner_for_scope(scope),
            "payload": {"conceptIds": request.concept_ids, "stepId": request.step_id},
            "state": "needs_review",
        }
    ]


def _local_block_reason(normalized: dict[str, Any]) -> str | None:
    text = str(normalized.get("learnerFacingText", "")).lower()
    for term in ("punishment", "lazy", "always", "never", "failed because"):
        if term in text:
            return f"Blocked learner-facing repair language containing '{term}'."
    for proposal in normalized.get("proposals", []):
        if isinstance(proposal, dict) and proposal.get("ownerService") == "agents-runtime":
            return "Repair proposals must route to an owning service or review surface, not agent-owned durable truth."
    return None


def _context_manifest(context_pack: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "key": section.get("key"),
            "sourceService": section.get("sourceService"),
            "authorityLabel": section.get("authorityLabel"),
            "freshness": section.get("freshness"),
        }
        for section in context_pack.get("sections", [])
        if isinstance(section, dict)
    ]


def _source_refs(manifest: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {"key": item.get("key"), "sourceService": item.get("sourceService")}
        for item in manifest
        if item.get("sourceService")
    ]


def _owner_for_scope(scope: str) -> str:
    return {
        "micro_prompt": "session-service",
        "local_step": "session-service",
        "session_repair": "session-service",
        "content_request": "content-service",
        "curriculum_branch": "curriculum-service",
        "calibration_drill": "metacognition-service",
        "defer": "session-service",
        "no_repair": "session-service",
    }.get(scope, "session-service")


def _surface_for_scope(scope: str) -> str:
    return {
        "content_request": "content-workbench",
        "curriculum_branch": "curriculum-workbench",
        "calibration_drill": "post-step-reflection",
        "defer": "remediation-inbox",
        "no_repair": "post-step-reflection",
    }.get(scope, "session-plan-review")


def _status_for_scope(scope: str) -> str:
    return {
        "micro_prompt": "Tiny repair",
        "local_step": "Repair Step",
        "session_repair": "Repair suggested",
        "content_request": "Needs content",
        "curriculum_branch": "Repair branch proposed",
        "calibration_drill": "Calibration drill",
        "defer": "Saved for later",
        "no_repair": "No repair needed",
    }.get(scope, "Repair suggested")
