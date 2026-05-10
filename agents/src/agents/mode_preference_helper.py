"""Mode Preference Helper agent."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


class ModePreferenceRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_id: str = Field(alias="userId")
    session_id: str | None = Field(default=None, alias="sessionId")
    step_id: str | None = Field(default=None, alias="stepId")
    candidate_modes: list[str] = Field(default_factory=list, alias="candidateModes")
    deterministic_fallback: str | None = Field(default=None, alias="deterministicFallback")
    forbidden_modes: list[str] = Field(default_factory=list, alias="forbiddenModes")
    recent_modes: list[str] = Field(default_factory=list, alias="recentModes")
    learner_preferences: dict[str, Any] = Field(default_factory=dict, alias="learnerPreferences")
    trigger: dict[str, Any] = Field(default_factory=dict)
    context_pack: dict[str, Any] = Field(default_factory=dict, alias="contextPack")
    provider: str | None = None
    model: str | None = None
    agent_run_id: str | None = Field(default=None, alias="agentRunId")
    prompt_template_version: str = Field(default="mode-preference-helper.v1", alias="promptTemplateVersion")
    execution_strategy: str = Field(default="realtime", alias="executionStrategy")
    batch_requested: bool = Field(default=False, alias="batchRequested")


class ModePreferenceHelperAgent:
    """Tie-breaks among already eligible epistemic modes only."""

    async def choose(self, request: ModePreferenceRequest) -> dict[str, Any]:
        return await self.finalize_choice(generated=self._fallback_choice(request), request=request)

    async def finalize_choice(self, *, generated: dict[str, Any], request: ModePreferenceRequest) -> dict[str, Any]:
        run_id = request.agent_run_id or f"mode_{uuid4().hex[:8]}"
        normalized = self._normalize(generated, request, run_id)
        reasons = _local_rejection_reasons(normalized, request)
        if reasons:
            return self._blocked(normalized, reasons)
        validation_id = f"mode_policy_{run_id}"
        normalized["validation"] = {
            "state": "accepted",
            "validator": "deterministic-mode-routing",
            "validationId": validation_id,
            "reasonCodes": [],
        }
        normalized["provenance"]["validationId"] = validation_id
        return normalized

    def _fallback_choice(self, request: ModePreferenceRequest) -> dict[str, Any]:
        eligible = [mode for mode in request.candidate_modes if mode not in set(request.forbidden_modes)]
        fallback = request.deterministic_fallback if request.deterministic_fallback in eligible else (eligible[0] if eligible else None)
        preferred = request.learner_preferences.get("preferredMode")
        reduced = set(request.learner_preferences.get("reducedModes", [])) if isinstance(request.learner_preferences.get("reducedModes"), list) else set()
        selected = fallback
        state = "fallback_used"
        label = "Fallback"
        why = "The eligible options were equivalent, so Noema used the deterministic fallback."
        for mode in eligible:
            if mode == preferred and mode not in reduced:
                selected = mode
                state = "preference_used"
                label = "Learner preference"
                why = "The learner preference was used because this mode was already eligible."
                break
        if selected in request.recent_modes and len(eligible) > 1:
            for mode in eligible:
                if mode not in request.recent_modes and mode not in reduced:
                    selected = mode
                    state = "repeat_avoided"
                    label = "Avoided repeat"
                    why = "This mode was selected because it has not appeared recently in this session."
                    break
        if selected is None:
            state = "no_valid_mode"
            label = "No valid mode"
            why = "No candidate mode remained after deterministic constraints."
        return {
            "state": state,
            "selectedMode": selected,
            "statusLabel": label,
            "friendlyWhy": why,
            "rationale": why,
            "avoidedModes": sorted(reduced.intersection(eligible)),
            "uncertainty": "low" if selected else "high",
        }

    def _normalize(self, generated: dict[str, Any], request: ModePreferenceRequest, run_id: str) -> dict[str, Any]:
        manifest = _context_manifest(request.context_pack)
        selected = generated.get("selectedMode") if isinstance(generated.get("selectedMode"), str) else request.deterministic_fallback
        return {
            "agentRunId": run_id,
            "artifactKind": "mode_preference_choice",
            "state": _text(generated.get("state"), "fallback_used"),
            "selectedMode": selected,
            "candidateModes": request.candidate_modes,
            "deterministicFallback": request.deterministic_fallback,
            "forbiddenModes": request.forbidden_modes,
            "statusLabel": _text(generated.get("statusLabel"), "Mode selected"),
            "friendlyWhy": _text(generated.get("friendlyWhy"), "Mode selected from eligible candidates."),
            "rationale": _text(generated.get("rationale"), _text(generated.get("friendlyWhy"), "Mode selected from eligible candidates.")),
            "avoidedModes": _strings(generated.get("avoidedModes")),
            "uncertainty": _text(generated.get("uncertainty"), "low"),
            "reviewRouting": {
                "surface": "step-details",
                "statusLabel": _text(generated.get("statusLabel"), "Mode selected"),
                "friendlyWhy": _text(generated.get("friendlyWhy"), "Mode selected from eligible candidates."),
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

    def _blocked(self, normalized: dict[str, Any], reasons: list[str]) -> dict[str, Any]:
        return {
            **normalized,
            "state": "no_valid_mode",
            "rejectedArtifacts": [{"kind": "mode_preference_choice", "draft": normalized, "repairReasons": reasons}],
            "validation": {
                "state": "rejected",
                "validator": "deterministic-mode-routing",
                "validationId": f"mode_policy_blocked_{normalized['agentRunId']}",
                "reasons": reasons,
            },
        }


def _local_rejection_reasons(normalized: dict[str, Any], request: ModePreferenceRequest) -> list[str]:
    selected = normalized.get("selectedMode")
    candidates = set(request.candidate_modes)
    forbidden = set(request.forbidden_modes)
    if not isinstance(selected, str) or not selected:
        return ["No selected mode was produced."]
    if selected not in candidates:
        return ["Mode Preference Helper selected a mode outside the deterministic eligibility set."]
    if selected in forbidden:
        return ["Mode Preference Helper selected a forbidden mode."]
    return []


def _text(value: Any, fallback: str) -> str:
    return str(value).strip()[:900] if isinstance(value, str) and value.strip() else fallback


def _strings(value: Any) -> list[str]:
    return [str(item).strip() for item in value if isinstance(item, str) and item.strip()] if isinstance(value, list) else []


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
    return [{"key": item.get("key"), "sourceService": item.get("sourceService")} for item in manifest if item.get("sourceService")]
