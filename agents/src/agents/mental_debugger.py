"""Guardian-validated Mental Debugger agent."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, cast
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from .guardian_client import GuardianClient, GuardianOutcome


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


class MentalDebuggerRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_id: str = Field(alias="userId")
    session_id: str | None = Field(default=None, alias="sessionId")
    step_id: str | None = Field(default=None, alias="stepId")
    concept_ids: list[str] = Field(default_factory=list, alias="conceptIds")
    study_mode: str | None = Field(default=None, alias="studyMode")
    user_intent: dict[str, Any] = Field(default_factory=dict, alias="userIntent")
    context_pack: dict[str, Any] = Field(default_factory=dict, alias="contextPack")
    provider: str | None = None
    model: str | None = None
    agent_run_id: str | None = Field(default=None, alias="agentRunId")
    prompt_template_version: str = Field(default="mental-debugger.v1", alias="promptTemplateVersion")
    execution_strategy: str = Field(default="realtime", alias="executionStrategy")
    batch_requested: bool = Field(default=False, alias="batchRequested")


class MentalDebuggerAgent:
    """Explains service-owned metacognitive evidence without owning it."""

    def __init__(self, guardian: GuardianClient) -> None:
        self._guardian = guardian

    async def debug(self, request: MentalDebuggerRequest) -> dict[str, Any]:
        generated = self._fallback_reflection(request)
        return await self.finalize_reflection(generated=generated, request=request)

    async def finalize_reflection(
        self,
        *,
        generated: dict[str, Any],
        request: MentalDebuggerRequest,
    ) -> dict[str, Any]:
        run_id = request.agent_run_id or f"debug_{uuid4().hex[:8]}"
        normalized = self._normalize(generated, request, run_id)
        reason = _local_block_reason(normalized["learnerFacingText"])
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

    def _fallback_reflection(self, request: MentalDebuggerRequest) -> dict[str, Any]:
        evaluation = _first_section_value(request.context_pack, "evaluation")
        diagnostic = _first_section_value(request.context_pack, "diagnosticBrief")
        remediation = _first_section_value(request.context_pack, "remediationBrief")
        reasoning = _number(evaluation, "reasoningQuality", _number(diagnostic, "reasoningQuality", None))
        correctness = evaluation.get("correctness") or diagnostic.get("correctness")
        action = _string(remediation, "recommendedAction", "try a small repair")
        labels = _strings(diagnostic.get("failureLabels") or diagnostic.get("taxonomyLabels"))
        pattern = labels[0] if labels else _string(remediation, "diagnosticPattern", "single_signal")

        what_worked = "There is not enough trace detail to name a strong frame yet."
        where_slipped = "The available evidence points to a fragile reasoning step, but not a settled pattern."
        if reasoning is not None and reasoning >= 0.7:
            what_worked = "The reasoning trace mostly held together."
            where_slipped = "The useful signal may be in monitoring or transfer rather than basic recall."
        elif reasoning is not None and reasoning < 0.45:
            what_worked = "There is still usable evidence in this Step."
            where_slipped = "The trace suggests the reasoning path became fragile before the final answer."
        if correctness is True and reasoning is not None and reasoning < 0.55:
            where_slipped = "The answer may be right, but the trace suggests the check was thinner than ideal."

        learner_text = (
            f"This trace suggests {pattern.replace('_', ' ')}. {where_slipped} "
            f"I would treat this as one signal and try {action}."
        )
        return {
            "state": "reflection_draft",
            "pattern": pattern,
            "summary": "Reasoning trace",
            "learnerFacingText": learner_text,
            "whatWorked": what_worked,
            "whereItSlipped": where_slipped,
            "repairRecommendation": str(action).replace("_", " "),
            "uncertainty": "single_signal",
            "handoffs": [{"target": "patch-planner-remediation-agent", "reason": "repair recommendation available"}],
            "confidence": "bounded",
        }

    def _normalize(
        self,
        generated: dict[str, Any],
        request: MentalDebuggerRequest,
        run_id: str,
    ) -> dict[str, Any]:
        pattern = _clean_text(generated.get("pattern"), "single_signal")
        learner_text = _clean_text(generated.get("learnerFacingText"), "A reasoning reflection is available.")
        manifest = _context_manifest(request.context_pack)
        return {
            "agentRunId": run_id,
            "artifactKind": "debugger_reflection",
            "state": _clean_text(generated.get("state"), "reflection_draft"),
            "pattern": pattern,
            "summary": _clean_text(generated.get("summary"), "Reasoning trace"),
            "learnerFacingText": learner_text,
            "whatWorked": _clean_text(generated.get("whatWorked"), "The Step still contains useful evidence."),
            "whereItSlipped": _clean_text(generated.get("whereItSlipped"), "The fragile point is uncertain."),
            "repairRecommendation": _clean_text(generated.get("repairRecommendation"), "Try one small repair."),
            "uncertainty": _clean_text(generated.get("uncertainty"), "single_signal"),
            "handoffs": _handoffs(generated.get("handoffs")),
            "confidence": _clean_text(generated.get("confidence"), "bounded"),
            "reviewRouting": {
                "surface": "post-step-reflection",
                "statusLabel": _status_for_pattern(pattern),
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
            return cast("GuardianOutcome", await validator({**normalized, "triggeredBy": "mental-debugger"}))
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
        request: MentalDebuggerRequest,
        validation_id: str | None = None,
    ) -> dict[str, Any]:
        return {
            **normalized,
            "state": "reflection_blocked",
            "rejectedArtifacts": [
                {
                    "kind": "debugger_reflection",
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


def _string(source: dict[str, Any], key: str, default: str | None) -> str:
    value = source.get(key)
    return value if isinstance(value, str) and value else (default or "")


def _clean_text(value: Any, fallback: str) -> str:
    return str(value).strip()[:900] if isinstance(value, str) and value.strip() else fallback


def _strings(value: Any) -> list[str]:
    return [str(item).strip() for item in value if isinstance(item, str) and item.strip()] if isinstance(value, list) else []


def _handoffs(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return [{"target": "patch-planner-remediation-agent", "reason": "A small repair may help."}]
    handoffs: list[dict[str, str]] = []
    for item in value:
        if isinstance(item, dict):
            handoffs.append({
                "target": _clean_text(item.get("target"), "patch-planner-remediation-agent"),
                "reason": _clean_text(item.get("reason"), "Review the repair recommendation."),
            })
    return handoffs or [{"target": "patch-planner-remediation-agent", "reason": "A small repair may help."}]


def _local_block_reason(text: str) -> str | None:
    lowered = text.lower()
    for term in ("lazy", "bad at", "always", "never", "failed because", "proves you"):
        if term in lowered:
            return f"Blocked learner-facing diagnostic language containing '{term}'."
    if not text.strip():
        return "Learner-facing diagnostic text is required."
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


def _status_for_pattern(pattern: str) -> str:
    return {
        "cue_mismatch": "Cue mismatch",
        "retrieval_mismatch": "Retrieval mismatch",
        "strategy_mismatch": "Strategy mismatch",
        "execution_slip": "Execution slip",
        "skipped_check": "Skipped check",
        "transfer_issue": "Transfer issue",
        "prerequisite_gap": "Prerequisite gap",
        "confidence_mismatch": "Confidence mismatch",
    }.get(pattern, "Reasoning trace")
