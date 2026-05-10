"""Watchtower / Governance Layer agent."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


class WatchtowerGovernanceRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_id: str = Field(alias="userId")
    session_id: str | None = Field(default=None, alias="sessionId")
    step_id: str | None = Field(default=None, alias="stepId")
    surface: str = "copilot"
    proposed_action: dict[str, Any] = Field(default_factory=dict, alias="proposedAction")
    agent_hints: list[dict[str, Any]] = Field(default_factory=list, alias="agentHints")
    policy_context: dict[str, Any] = Field(default_factory=dict, alias="policyContext")
    context_pack: dict[str, Any] = Field(default_factory=dict, alias="contextPack")
    provider: str | None = None
    model: str | None = None
    agent_run_id: str | None = Field(default=None, alias="agentRunId")
    prompt_template_version: str = Field(default="watchtower-governance-layer.v1", alias="promptTemplateVersion")
    execution_strategy: str = Field(default="realtime", alias="executionStrategy")
    batch_requested: bool = Field(default=False, alias="batchRequested")


class WatchtowerGovernanceAgent:
    """Produces visibility, intrusion, review, and audit decisions without owning domain truth."""

    async def govern(self, request: WatchtowerGovernanceRequest) -> dict[str, Any]:
        return await self.finalize_decision(generated=self._fallback_decision(request), request=request)

    async def finalize_decision(
        self, *, generated: dict[str, Any], request: WatchtowerGovernanceRequest
    ) -> dict[str, Any]:
        run_id = request.agent_run_id or f"watchtower_{uuid4().hex[:8]}"
        normalized = self._normalize(generated, request, run_id)
        reasons = _local_rejection_reasons(normalized)
        if reasons:
            return self._blocked(normalized, reasons)
        validation_id = f"watchtower_policy_{run_id}"
        normalized["validation"] = {
            "state": "accepted",
            "validator": "watchtower-local-policy",
            "validationId": validation_id,
            "reasonCodes": [],
        }
        normalized["provenance"]["validationId"] = validation_id
        normalized["governanceDecisionId"] = validation_id
        return normalized

    def _fallback_decision(self, request: WatchtowerGovernanceRequest) -> dict[str, Any]:
        sections = request.context_pack.get("sections", [])
        action = request.proposed_action
        requested_data = action.get("requestedDataClasses", []) if isinstance(action, dict) else []
        interruption_count = _int_from_sections(sections, "surfaceContext", "recentInterruptionCount")
        dismissed = _int_from_sections(sections, "userRoleAndPreferenceContext", "recentDismissalCount")
        stale = any(_section_value(section).get("stale") is True for section in sections if isinstance(section, dict))
        sensitive = "raw_trace" in requested_data or "sensitive_trace" in requested_data

        if sensitive:
            state = "hidden_by_policy"
            label = "Hidden by policy"
            why = "This item uses sensitive trace detail, so it is hidden unless a review surface explicitly needs it."
            domains = ["privacy"]
        elif stale:
            state = "expired"
            label = "Expired"
            why = "This hint depended on older context and should not be presented as current."
            domains = ["staleness"]
        elif interruption_count >= 1 or dismissed >= 2:
            state = "deferred"
            label = "Deferred"
            why = "Noema is keeping this quieter because this session already has enough visible prompts."
            domains = ["intrusiveness"]
        elif action.get("requiresReview") is True:
            state = "needs_review"
            label = "Needs review"
            why = "This proposal should be reviewed before it affects a learner or shared workspace."
            domains = ["human_review", "audit"]
        else:
            state = "allowed"
            label = "Allowed"
            why = "The item is current, minimally intrusive, and has enough provenance to show."
            domains = ["transparency"]
        return {
            "state": state,
            "statusLabel": label,
            "friendlyWhy": why,
            "domains": domains,
            "visibilityDecision": state,
            "privacyClass": "sensitive_trace" if sensitive else "standard",
            "requiresReview": state == "needs_review",
            "auditRequired": action.get("requiresReview") is True or state in {"hidden_by_policy", "needs_review"},
            "escalationRoute": "governance-dashboard" if state in {"hidden_by_policy", "needs_review"} else None,
        }

    def _normalize(self, generated: dict[str, Any], request: WatchtowerGovernanceRequest, run_id: str) -> dict[str, Any]:
        state = _text(generated.get("state"), "allowed")
        status = _text(generated.get("statusLabel"), _status_for_state(state))
        manifest = _context_manifest(request.context_pack)
        return {
            "agentRunId": run_id,
            "artifactKind": "governance_decision",
            "state": state,
            "statusLabel": status,
            "friendlyWhy": _text(generated.get("friendlyWhy"), status),
            "domains": _strings(generated.get("domains")) or ["transparency"],
            "visibilityDecision": _text(generated.get("visibilityDecision"), state),
            "privacyClass": _text(generated.get("privacyClass"), "standard"),
            "requiresReview": bool(generated.get("requiresReview", False)),
            "auditRequired": bool(generated.get("auditRequired", True)),
            "escalationRoute": generated.get("escalationRoute") if isinstance(generated.get("escalationRoute"), str) else None,
            "reviewRouting": {
                "surface": _surface(request.surface, state),
                "statusLabel": status,
                "friendlyWhy": _text(generated.get("friendlyWhy"), status),
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
        validation_id = f"watchtower_policy_blocked_{normalized['agentRunId']}"
        return {
            **normalized,
            "state": "policy_blocked",
            "rejectedArtifacts": [{"kind": "governance_decision", "draft": normalized, "repairReasons": reasons}],
            "validation": {
                "state": "rejected",
                "validator": "watchtower-local-policy",
                "validationId": validation_id,
                "reasons": reasons,
            },
            "provenance": {**normalized["provenance"], "validationId": validation_id},
        }


def _local_rejection_reasons(normalized: dict[str, Any]) -> list[str]:
    reasons: list[str] = []
    if normalized["state"] not in {
        "allowed", "deferred", "suppressed", "hidden_by_policy", "needs_review",
        "escalated", "expired", "audit_required", "role_denied", "privacy_blocked",
    }:
        reasons.append(f"Unsupported governance state: {normalized['state']}")
    if normalized["privacyClass"] in {"raw_trace", "private_raw_trace"} and normalized["visibilityDecision"] == "allowed":
        reasons.append("Raw sensitive trace detail cannot be allowed without minimization.")
    return reasons


def _text(value: Any, fallback: str) -> str:
    return str(value).strip()[:900] if isinstance(value, str) and value.strip() else fallback


def _strings(value: Any) -> list[str]:
    return [str(item).strip() for item in value if isinstance(item, str) and item.strip()] if isinstance(value, list) else []


def _section_value(section: dict[str, Any]) -> dict[str, Any]:
    value = section.get("value")
    return value if isinstance(value, dict) else {}


def _int_from_sections(sections: Any, key: str, field: str) -> int:
    if not isinstance(sections, list):
        return 0
    for section in sections:
        if isinstance(section, dict) and section.get("key") == key:
            value = _section_value(section).get(field)
            return int(value) if isinstance(value, int) else 0
    return 0


def _status_for_state(state: str) -> str:
    return {
        "allowed": "Allowed",
        "deferred": "Deferred",
        "suppressed": "Reduced",
        "hidden_by_policy": "Hidden by policy",
        "needs_review": "Needs review",
        "escalated": "Escalated",
        "expired": "Expired",
        "audit_required": "Audit required",
        "role_denied": "Role required",
        "privacy_blocked": "Privacy-sensitive",
    }.get(state, "Needs review")


def _surface(surface: str, state: str) -> str:
    if state in {"needs_review", "hidden_by_policy", "audit_required", "privacy_blocked"}:
        return "governance-dashboard"
    return {
        "copilot": "cognitive-copilot-sidebar",
        "timeline": "active-session-timeline",
        "admin": "governance-dashboard",
        "review": "proposal-review-surface",
    }.get(surface, "cognitive-copilot-sidebar")


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
