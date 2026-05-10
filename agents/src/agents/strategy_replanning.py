"""Guardian-validated Strategy / Replanning agent."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, cast
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from .guardian_client import GuardianClient, GuardianOutcome


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


class StrategyReplanningRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_id: str = Field(alias="userId")
    session_id: str = Field(alias="sessionId")
    step_id: str | None = Field(default=None, alias="stepId")
    concept_ids: list[str] = Field(default_factory=list, alias="conceptIds")
    study_mode: str | None = Field(default=None, alias="studyMode")
    trigger: dict[str, Any] = Field(default_factory=dict)
    patch_proposal: dict[str, Any] = Field(default_factory=dict, alias="patchProposal")
    calibration_signal: dict[str, Any] = Field(default_factory=dict, alias="calibrationSignal")
    context_pack: dict[str, Any] = Field(default_factory=dict, alias="contextPack")
    provider: str | None = None
    model: str | None = None
    agent_run_id: str | None = Field(default=None, alias="agentRunId")
    prompt_template_version: str = Field(default="strategy-replanning-agent.v1", alias="promptTemplateVersion")
    execution_strategy: str = Field(default="realtime", alias="executionStrategy")
    batch_requested: bool = Field(default=False, alias="batchRequested")


class StrategyReplanningAgent:
    """Proposes minimum-sufficient session replans without committing them."""

    def __init__(self, guardian: GuardianClient) -> None:
        self._guardian = guardian

    async def replan(self, request: StrategyReplanningRequest) -> dict[str, Any]:
        generated = self._fallback_replan(request)
        return await self.finalize_replan(generated=generated, request=request)

    async def finalize_replan(
        self,
        *,
        generated: dict[str, Any],
        request: StrategyReplanningRequest,
    ) -> dict[str, Any]:
        run_id = request.agent_run_id or f"strategy_{uuid4().hex[:8]}"
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

    def _fallback_replan(self, request: StrategyReplanningRequest) -> dict[str, Any]:
        remediation = _first_section_value(request.context_pack, "remediationBrief")
        evaluation = _first_section_value(request.context_pack, "evaluation")
        patch_scope = _clean_text(request.patch_proposal.get("scope"), "")
        recommended = _clean_text(remediation.get("recommendedAction"), "")
        reasoning = _number(evaluation, "reasoningQuality", None)

        scope = "none"
        intervention = "continue"
        if patch_scope:
            scope = _strategy_scope_from_patch_scope(patch_scope)
        elif "repair" in recommended or (reasoning is not None and reasoning < 0.45):
            scope = "local_step"
        elif "defer" in recommended:
            scope = "defer"

        if scope == "local_step":
            intervention = "insert_repair_step_proposal"
        elif scope == "structural":
            intervention = "replace_or_defer_pending_steps_proposal"
        elif scope == "full":
            intervention = "request_full_lesson_plan_rewrite"
        elif scope == "defer":
            intervention = "defer_repair"

        notice = "No change needed. The session can continue as planned."
        if scope == "local_step":
            notice = "One repair Step is proposed. The remaining plan stays unchanged."
        elif scope == "structural":
            notice = "A pending Step replacement is proposed. Completed Steps are unchanged."
        elif scope == "full":
            notice = "A full replan is requested for review before the active plan changes."
        elif scope == "defer":
            notice = "This repair is saved for later so the current session stays lighter."

        return {
            "state": "replan_proposed",
            "scope": scope,
            "interventionType": intervention,
            "statusLabel": _status_for_scope(scope),
            "learnerFacingNotice": notice,
            "friendlyWhy": notice,
            "impactSummary": "Completed Steps are immutable and remain unchanged.",
            "changes": [
                {
                    "kind": intervention,
                    "ownerService": "session-service",
                    "targetStepId": request.step_id,
                    "state": "needs_guardian_validation",
                }
            ],
        }

    def _normalize(
        self,
        generated: dict[str, Any],
        request: StrategyReplanningRequest,
        run_id: str,
    ) -> dict[str, Any]:
        scope = _clean_text(generated.get("scope"), "none")
        notice = _clean_text(generated.get("learnerFacingNotice"), "No change needed.")
        changes = _changes(generated.get("changes"), request, scope)
        manifest = _context_manifest(request.context_pack)
        return {
            "agentRunId": run_id,
            "artifactKind": "strategy_replan_proposal",
            "state": _clean_text(generated.get("state"), "replan_proposed"),
            "sessionId": request.session_id,
            "scope": scope,
            "interventionType": _clean_text(generated.get("interventionType"), "continue"),
            "statusLabel": _clean_text(generated.get("statusLabel"), _status_for_scope(scope)),
            "learnerFacingNotice": notice,
            "friendlyWhy": _clean_text(generated.get("friendlyWhy"), notice),
            "impactSummary": _clean_text(generated.get("impactSummary"), "Completed Steps are unchanged."),
            "changes": changes,
            "reviewRouting": {
                "surface": "session-plan-review" if scope not in {"none", "defer"} else "active-session-timeline",
                "statusLabel": _status_for_scope(scope),
                "friendlyWhy": notice,
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
        validator = getattr(self._guardian, "validate_replan", None)
        if callable(validator):
            return cast("GuardianOutcome", await validator(normalized))
        return cast("GuardianOutcome", await self._guardian._post("/v1/validate/replan", normalized))

    def _blocked(
        self,
        normalized: dict[str, Any],
        reasons: list[str],
        request: StrategyReplanningRequest,
        validation_id: str | None = None,
    ) -> dict[str, Any]:
        return {
            **normalized,
            "state": "guardian_blocked",
            "rejectedArtifacts": [
                {
                    "kind": "strategy_replan_proposal",
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


def _changes(value: Any, request: StrategyReplanningRequest, scope: str) -> list[dict[str, Any]]:
    if isinstance(value, list) and value:
        changes: list[dict[str, Any]] = []
        for item in value:
            if not isinstance(item, dict):
                continue
            changes.append(
                {
                    "kind": _clean_text(item.get("kind"), "continue"),
                    "ownerService": _clean_text(item.get("ownerService"), "session-service"),
                    "targetStepId": item.get("targetStepId") if isinstance(item.get("targetStepId"), str) else request.step_id,
                    "supersedesEvaluatedSteps": bool(item.get("supersedesEvaluatedSteps", False)),
                    "state": _clean_text(item.get("state"), "needs_guardian_validation"),
                    "payload": item.get("payload") if isinstance(item.get("payload"), dict) else {},
                }
            )
        if changes:
            return changes
    return [
        {
            "kind": "continue" if scope == "none" else "propose_replan",
            "ownerService": "session-service",
            "targetStepId": request.step_id,
            "supersedesEvaluatedSteps": False,
            "state": "needs_guardian_validation",
            "payload": {"conceptIds": request.concept_ids},
        }
    ]


def _local_block_reason(normalized: dict[str, Any]) -> str | None:
    scope = str(normalized.get("scope", ""))
    if scope not in {"none", "micro", "local_step", "structural", "full", "defer"}:
        return f"Unsupported replan scope: {scope}"
    for change in normalized.get("changes", []):
        if not isinstance(change, dict):
            continue
        if change.get("ownerService") != "session-service":
            return "Strategy replans must route session mutations through session-service."
        if change.get("supersedesEvaluatedSteps") is True:
            return "Strategy replans must not supersede evaluated Steps."
    text = str(normalized.get("learnerFacingNotice", "")).lower()
    for term in ("punishment", "lazy", "always", "never"):
        if term in text:
            return f"Blocked learner-facing replan language containing '{term}'."
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


def _strategy_scope_from_patch_scope(scope: str) -> str:
    return {
        "micro_prompt": "micro",
        "local_step": "local_step",
        "session_repair": "local_step",
        "curriculum_branch": "defer",
        "calibration_drill": "micro",
        "defer": "defer",
        "no_repair": "none",
    }.get(scope, "local_step")


def _status_for_scope(scope: str) -> str:
    return {
        "none": "No change",
        "micro": "Tiny repair",
        "local_step": "Repair inserted",
        "structural": "Pending Step replaced",
        "full": "Full replan needed",
        "defer": "Saved for later",
    }.get(scope, "Replan proposed")
