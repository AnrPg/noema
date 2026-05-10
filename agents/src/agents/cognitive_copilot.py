"""Guardian-validated AI Mirror / Cognitive Copilot agent."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, cast
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from .guardian_client import GuardianClient, GuardianOutcome


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


class CognitiveCopilotRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_id: str = Field(alias="userId")
    session_id: str | None = Field(default=None, alias="sessionId")
    step_id: str | None = Field(default=None, alias="stepId")
    curriculum_id: str | None = Field(default=None, alias="curriculumId")
    concept_ids: list[str] = Field(default_factory=list, alias="conceptIds")
    study_mode: str | None = Field(default=None, alias="studyMode")
    surface: str = "sidebar"
    context_pack: dict[str, Any] = Field(default_factory=dict, alias="contextPack")
    provider: str | None = None
    model: str | None = None
    agent_run_id: str | None = Field(default=None, alias="agentRunId")
    prompt_template_version: str = Field(default="cognitive-copilot.v1", alias="promptTemplateVersion")
    execution_strategy: str = Field(default="realtime", alias="executionStrategy")
    batch_requested: bool = Field(default=False, alias="batchRequested")


class CognitiveCopilotAgent:
    """Builds source-bound UI readouts without becoming a fact owner."""

    def __init__(self, guardian: GuardianClient) -> None:
        self._guardian = guardian

    async def reflect(self, request: CognitiveCopilotRequest) -> dict[str, Any]:
        generated = self._fallback_readout(request)
        return await self.finalize_readout(generated=generated, request=request)

    async def finalize_readout(
        self,
        *,
        generated: dict[str, Any],
        request: CognitiveCopilotRequest,
    ) -> dict[str, Any]:
        run_id = request.agent_run_id or f"copilot_{uuid4().hex[:8]}"
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

    def _fallback_readout(self, request: CognitiveCopilotRequest) -> dict[str, Any]:
        sections = request.context_pack.get("sections", [])
        repair_available = _has_section(sections, "remediationBrief") or _has_section(sections, "patchPlannerSummary")
        plan_changed = _has_section(sections, "strategySummary") or _has_section(sections, "validationResults")
        groups = []
        if plan_changed:
            groups.append(
                {
                    "category": "plan_change",
                    "title": "Plan update",
                    "summary": "A plan-change item is available for review.",
                    "source": "session-service",
                    "priority": "medium",
                }
            )
        if repair_available:
            groups.append(
                {
                    "category": "repair",
                    "title": "Repair suggestion",
                    "summary": "A repair suggestion is available from the latest Step evidence.",
                    "source": "metacognition-service",
                    "priority": "medium",
                }
            )
        if not groups:
            groups.append(
                {
                    "category": "now",
                    "title": "Quiet",
                    "summary": "No high-priority hints are active right now.",
                    "source": "agents-runtime",
                    "priority": "low",
                }
            )
        return {
            "state": "fresh",
            "statusLabel": "Fresh",
            "summary": groups[0]["summary"],
            "hintGroups": groups,
            "mirrorStatements": ["This readout reflects current service facts and validated agent outputs."],
            "suggestedActions": [{"label": "Show why", "targetSurface": "details", "ownerService": "ui"}],
        }

    def _normalize(
        self,
        generated: dict[str, Any],
        request: CognitiveCopilotRequest,
        run_id: str,
    ) -> dict[str, Any]:
        groups = _hint_groups(generated.get("hintGroups"))
        statements = _strings(generated.get("mirrorStatements")) or ["No high-priority reflection is active right now."]
        summary = _clean_text(generated.get("summary"), groups[0]["summary"] if groups else statements[0])
        manifest = _context_manifest(request.context_pack)
        return {
            "agentRunId": run_id,
            "artifactKind": "copilot_readout",
            "state": _clean_text(generated.get("state"), "fresh"),
            "statusLabel": _clean_text(generated.get("statusLabel"), "Fresh"),
            "summary": summary,
            "hintGroups": groups,
            "mirrorStatements": statements,
            "suggestedActions": _actions(generated.get("suggestedActions")),
            "reviewRouting": {
                "surface": _surface(request.surface),
                "statusLabel": _clean_text(generated.get("statusLabel"), "Fresh"),
                "friendlyWhy": summary,
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
            return cast("GuardianOutcome", await validator({**normalized, "triggeredBy": "cognitive-copilot"}))
        return await self._guardian.validate_activity(
            {
                "id": normalized["agentRunId"],
                "contentSourceType": "generated",
                "generatedVariantId": normalized["agentRunId"],
                "prompt": normalized["summary"],
                "expectedResponseType": "reflection",
                "responseSchema": {"type": "string"},
                "content": normalized,
            }
        )

    def _blocked(
        self,
        normalized: dict[str, Any],
        reasons: list[str],
        request: CognitiveCopilotRequest,
        validation_id: str | None = None,
    ) -> dict[str, Any]:
        return {
            **normalized,
            "state": "hidden_by_policy",
            "rejectedArtifacts": [
                {
                    "kind": "copilot_readout",
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


def _has_section(sections: Any, key: str) -> bool:
    return any(isinstance(section, dict) and section.get("key") == key for section in sections) if isinstance(sections, list) else False


def _clean_text(value: Any, fallback: str) -> str:
    return str(value).strip()[:900] if isinstance(value, str) and value.strip() else fallback


def _strings(value: Any) -> list[str]:
    return [str(item).strip() for item in value if isinstance(item, str) and item.strip()] if isinstance(value, list) else []


def _hint_groups(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return [{"category": "now", "title": "Quiet", "summary": "No high-priority hints are active right now.", "source": "agents-runtime", "priority": "low"}]
    groups: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        groups.append(
            {
                "category": _clean_text(item.get("category"), "now"),
                "title": _clean_text(item.get("title"), "Now"),
                "summary": _clean_text(item.get("summary"), "A source-bound hint is available."),
                "source": _clean_text(item.get("source"), "agents-runtime"),
                "priority": _clean_text(item.get("priority"), "low"),
            }
        )
    return groups or [{"category": "now", "title": "Quiet", "summary": "No high-priority hints are active right now.", "source": "agents-runtime", "priority": "low"}]


def _actions(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    actions: list[dict[str, str]] = []
    for item in value:
        if isinstance(item, dict):
            actions.append(
                {
                    "label": _clean_text(item.get("label"), "Show why"),
                    "targetSurface": _clean_text(item.get("targetSurface"), "details"),
                    "ownerService": _clean_text(item.get("ownerService"), "ui"),
                }
            )
    return actions


def _local_block_reason(normalized: dict[str, Any]) -> str | None:
    text = " ".join(
        [
            str(normalized.get("summary", "")),
            " ".join(str(item) for item in normalized.get("mirrorStatements", [])),
        ]
    ).lower()
    for term in ("always", "never", "study personality", "definitely fix", "i know why"):
        if term in text:
            return f"Blocked learner-facing Copilot language containing '{term}'."
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


def _surface(surface: str) -> str:
    return {
        "sidebar": "cognitive-copilot-sidebar",
        "dashboard": "reflection-dashboard",
        "timeline": "active-session-timeline",
        "post_step": "post-step-reflection",
    }.get(surface, "cognitive-copilot-sidebar")
