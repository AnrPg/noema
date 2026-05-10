"""Guardian-validated Calibration Coach agent."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, cast
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from .guardian_client import GuardianClient, GuardianOutcome


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


class CalibrationCoachRequest(BaseModel):
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
    prompt_template_version: str = Field(default="calibration-coach.v1", alias="promptTemplateVersion")
    execution_strategy: str = Field(default="realtime", alias="executionStrategy")
    batch_requested: bool = Field(default=False, alias="batchRequested")


class CalibrationCoachAgent:
    """Produces learner-safe calibration reflections from service-owned evidence."""

    def __init__(self, guardian: GuardianClient) -> None:
        self._guardian = guardian

    async def coach(self, request: CalibrationCoachRequest) -> dict[str, Any]:
        generated = self._fallback_reflection(request)
        return await self.finalize_coaching(generated=generated, request=request)

    async def finalize_coaching(
        self,
        *,
        generated: dict[str, Any],
        request: CalibrationCoachRequest,
    ) -> dict[str, Any]:
        run_id = request.agent_run_id or f"cal_{uuid4().hex[:8]}"
        normalized = self._normalize(generated, request, run_id)
        reason = self._local_block_reason(normalized)
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
        return normalized

    def _fallback_reflection(self, request: CalibrationCoachRequest) -> dict[str, Any]:
        evidence = _first_section_value(request.context_pack, "evaluation")
        diagnostic = _first_section_value(request.context_pack, "diagnosticBrief")
        reasoning = _number(evidence, "reasoningQuality", _number(diagnostic, "reasoningQuality", None))
        confidence = _number(evidence, "confidenceSignal", _number(diagnostic, "confidenceSignal", None))
        self_rating = _string(evidence, "selfRating", _string(diagnostic, "selfRating", None))

        pattern = "single_signal"
        label = "Confidence matched"
        why = "This is one signal, so I would not treat it as a pattern yet."
        recommendation = "Keep comparing confidence with the evidence you can name."
        confidence_label = "bounded"

        if reasoning is not None and confidence is not None:
            gap = confidence - reasoning
            if gap >= 0.25:
                pattern = "overconfident_signal"
                label = "Confidence ahead of trace"
                why = "Your confidence was high, but the reasoning evidence was thinner than the rating."
                recommendation = "Use a quick check-step before moving on."
            elif gap <= -0.25:
                pattern = "underconfident_signal"
                label = "Trace stronger than confidence"
                why = "Your confidence was lower than the reasoning evidence for this Step."
                recommendation = "Name the cue that worked, then continue."
            elif self_rating == "hesitated" and reasoning >= 0.7:
                pattern = "hesitation_with_quality"
                label = "Useful hesitation"
                why = "You hesitated, but the reasoning trace held together."
                recommendation = "Treat that pause as careful checking, not failure."
            else:
                pattern = "well_calibrated"
                label = "Confidence matched"
                why = "Your confidence and reasoning evidence were aligned here."
                recommendation = "Repeat the same evidence check on the next similar Step."

        return {
            "state": "reflection_draft",
            "pattern": pattern,
            "summary": label,
            "learnerFacingText": why,
            "highlights": [why],
            "recommendations": [{"title": "Calibration habit", "detail": recommendation}],
            "confidence": confidence_label,
        }

    def _normalize(
        self,
        generated: dict[str, Any],
        request: CalibrationCoachRequest,
        run_id: str,
    ) -> dict[str, Any]:
        pattern = str(generated.get("pattern") or "single_signal")
        summary = _clean_text(generated.get("summary"), "Calibration note")
        learner_text = _clean_text(generated.get("learnerFacingText"), summary)
        recommendations = _recommendations(generated.get("recommendations"))
        manifest = _context_manifest(request.context_pack)
        return {
            "agentRunId": run_id,
            "artifactKind": "calibration_reflection",
            "state": generated.get("state") or "reflection_draft",
            "pattern": pattern,
            "summary": summary,
            "learnerFacingText": learner_text,
            "highlights": _strings(generated.get("highlights")) or [learner_text],
            "recommendations": recommendations,
            "confidence": str(generated.get("confidence") or "bounded"),
            "reviewRouting": {
                "surface": _surface_for_pattern(pattern),
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

    def _local_block_reason(self, normalized: dict[str, Any]) -> str | None:
        text = str(normalized.get("learnerFacingText", "")).lower()
        forbidden = ("liar", "dishonest", "lazy", "always", "never")
        for term in forbidden:
            if term in text:
                return f"Blocked learner-facing calibration language containing '{term}'."
        if len(text.strip()) == 0:
            return "Learner-facing calibration text is required."
        return None

    async def _validate_with_guardian(self, normalized: dict[str, Any]) -> GuardianOutcome:
        validator = getattr(self._guardian, "validate_coaching_artifact", None)
        if callable(validator):
            return cast("GuardianOutcome", await validator(normalized))
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
        request: CalibrationCoachRequest,
        validation_id: str | None = None,
    ) -> dict[str, Any]:
        return {
            **normalized,
            "state": "reflection_blocked",
            "rejectedArtifacts": [
                {
                    "kind": "calibration_reflection",
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
    sections = context_pack.get("sections", [])
    if not isinstance(sections, list):
        return {}
    for section in sections:
        if isinstance(section, dict) and section.get("key") == key and isinstance(section.get("value"), dict):
            return cast("dict[str, Any]", section["value"])
    return {}


def _number(source: dict[str, Any], key: str, default: float | None) -> float | None:
    value = source.get(key)
    return float(value) if isinstance(value, (int, float)) else default


def _string(source: dict[str, Any], key: str, default: str | None) -> str | None:
    value = source.get(key)
    return value if isinstance(value, str) else default


def _clean_text(value: Any, fallback: str) -> str:
    return str(value).strip()[:800] if isinstance(value, str) and value.strip() else fallback


def _strings(value: Any) -> list[str]:
    return [str(item).strip() for item in value if isinstance(item, str) and item.strip()] if isinstance(value, list) else []


def _recommendations(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return [{"title": "Calibration habit", "detail": "Compare confidence with one named piece of evidence."}]
    items: list[dict[str, str]] = []
    for item in value:
        if isinstance(item, dict):
            title = _clean_text(item.get("title"), "Calibration habit")
            detail = _clean_text(item.get("detail"), "Compare confidence with one named piece of evidence.")
            items.append({"title": title[:120], "detail": detail[:500]})
    return items or [{"title": "Calibration habit", "detail": "Compare confidence with one named piece of evidence."}]


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


def _surface_for_pattern(pattern: str) -> str:
    if pattern in {"overconfident_signal", "underconfident_signal", "hesitation_with_quality"}:
        return "post-step-reflection"
    return "calibration-dashboard"


def _status_for_pattern(pattern: str) -> str:
    return {
        "well_calibrated": "Well calibrated",
        "overconfident_signal": "Confidence ahead of trace",
        "underconfident_signal": "Trace stronger than confidence",
        "hesitation_with_quality": "Useful hesitation",
    }.get(pattern, "Single signal")
