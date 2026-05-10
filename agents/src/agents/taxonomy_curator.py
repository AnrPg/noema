"""Taxonomy Curator agent."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


class TaxonomyCuratorRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_id: str = Field(alias="userId")
    taxonomy_domain: str = Field(default="failure", alias="taxonomyDomain")
    taxonomy_id: str | None = Field(default=None, alias="taxonomyId")
    current_version: str | None = Field(default=None, alias="currentVersion")
    label_ids: list[str] = Field(default_factory=list, alias="labelIds")
    concept_ids: list[str] = Field(default_factory=list, alias="conceptIds")
    context_pack: dict[str, Any] = Field(default_factory=dict, alias="contextPack")
    provider: str | None = None
    model: str | None = None
    agent_run_id: str | None = Field(default=None, alias="agentRunId")
    prompt_template_version: str = Field(default="taxonomy-curator.v1", alias="promptTemplateVersion")
    execution_strategy: str = Field(default="realtime", alias="executionStrategy")
    batch_requested: bool = Field(default=False, alias="batchRequested")


class TaxonomyCuratorAgent:
    """Drafts reviewable taxonomy proposals and never changes live taxonomy directly."""

    async def curate(self, request: TaxonomyCuratorRequest) -> dict[str, Any]:
        return await self.finalize_proposal(generated=self._fallback_proposal(request), request=request)

    async def finalize_proposal(self, *, generated: dict[str, Any], request: TaxonomyCuratorRequest) -> dict[str, Any]:
        run_id = request.agent_run_id or f"taxonomy_{uuid4().hex[:8]}"
        normalized = self._normalize(generated, request, run_id)
        reasons = _local_rejection_reasons(normalized)
        if reasons:
            return self._blocked(normalized, reasons)
        validation_id = f"taxonomy_policy_{run_id}"
        normalized["validation"] = {
            "state": "accepted",
            "validator": "taxonomy-curator-local-schema",
            "validationId": validation_id,
            "reasonCodes": [],
        }
        normalized["provenance"]["validationId"] = validation_id
        return normalized

    def _fallback_proposal(self, request: TaxonomyCuratorRequest) -> dict[str, Any]:
        evidence_count = _evidence_count(request.context_pack)
        weak = evidence_count < 5
        change_type = "merge" if len(request.label_ids) >= 2 else "definition_change"
        state = "needs_evidence" if weak else "needs_curator_review"
        return {
            "state": state,
            "statusLabel": "Evidence weak" if weak else "Needs curator review",
            "friendlyWhy": (
                "This proposed taxonomy change needs more aggregate evidence before review."
                if weak
                else "This taxonomy change is ready for curator review, with historical meaning preserved."
            ),
            "proposal": {
                "changeType": change_type,
                "ownerService": _owner_for_domain(request.taxonomy_domain),
                "labelIds": request.label_ids,
                "summary": "Review whether these labels should be clarified, merged, split, or deprecated.",
                "migrationGuidance": "Preserve historical records under their original taxonomy version and add explicit mappings for future display.",
            },
            "impactSummary": {
                "affectedRecordCount": evidence_count,
                "compatibilityRisk": "medium" if weak else "low",
                "learnerFacingLabelsAffected": request.taxonomy_domain in {"content", "failure", "misconception"},
            },
        }

    def _normalize(self, generated: dict[str, Any], request: TaxonomyCuratorRequest, run_id: str) -> dict[str, Any]:
        proposal = generated.get("proposal") if isinstance(generated.get("proposal"), dict) else {}
        manifest = _context_manifest(request.context_pack)
        return {
            "agentRunId": run_id,
            "artifactKind": "taxonomy_proposal",
            "state": _text(generated.get("state"), "needs_curator_review"),
            "taxonomyDomain": request.taxonomy_domain,
            "taxonomyId": request.taxonomy_id,
            "currentVersion": request.current_version,
            "statusLabel": _text(generated.get("statusLabel"), "Needs curator review"),
            "friendlyWhy": _text(generated.get("friendlyWhy"), "Curator review is required before any taxonomy changes become durable."),
            "proposal": {
                "changeType": _text(proposal.get("changeType"), "definition_change"),
                "ownerService": _text(proposal.get("ownerService"), _owner_for_domain(request.taxonomy_domain)),
                "labelIds": _strings(proposal.get("labelIds")) or request.label_ids,
                "summary": _text(proposal.get("summary"), "Review taxonomy label semantics."),
                "migrationGuidance": _text(
                    proposal.get("migrationGuidance"),
                    "Keep historical records interpretable under their original taxonomy version.",
                ),
                "payload": proposal.get("payload") if isinstance(proposal.get("payload"), dict) else {},
            },
            "impactSummary": generated.get("impactSummary") if isinstance(generated.get("impactSummary"), dict) else {},
            "reviewRouting": {
                "surface": _surface_for_domain(request.taxonomy_domain),
                "statusLabel": _text(generated.get("statusLabel"), "Needs curator review"),
                "friendlyWhy": _text(generated.get("friendlyWhy"), "Curator review is required before any taxonomy changes become durable."),
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
            "state": "rejected",
            "rejectedArtifacts": [{"kind": "taxonomy_proposal", "draft": normalized, "repairReasons": reasons}],
            "validation": {
                "state": "rejected",
                "validator": "taxonomy-curator-local-schema",
                "validationId": f"taxonomy_policy_blocked_{normalized['agentRunId']}",
                "reasons": reasons,
            },
        }


def _local_rejection_reasons(normalized: dict[str, Any]) -> list[str]:
    reasons: list[str] = []
    proposal = normalized.get("proposal", {})
    if isinstance(proposal, dict) and proposal.get("ownerService") not in {
        "metacognition-service", "knowledge-graph-service", "content-service",
        "curriculum-service", "agents-runtime",
    }:
        reasons.append("Taxonomy proposal must route to a known owning service or admin runtime.")
    if normalized.get("state") == "accepted":
        reasons.append("Taxonomy Curator may not mark proposals accepted; curator/admin review owns promotion.")
    return reasons


def _evidence_count(context_pack: dict[str, Any]) -> int:
    count = 0
    for section in context_pack.get("sections", []):
        if not isinstance(section, dict):
            continue
        value = section.get("value")
        if isinstance(value, list):
            count += len(value)
        elif isinstance(value, dict):
            maybe_count = value.get("count") or value.get("total") or value.get("affectedRecordCount")
            count += int(maybe_count) if isinstance(maybe_count, int) else 1
    return count


def _owner_for_domain(domain: str) -> str:
    return {
        "failure": "metacognition-service",
        "misconception": "knowledge-graph-service",
        "content": "content-service",
        "curriculum": "curriculum-service",
        "graph_relation": "knowledge-graph-service",
        "agent_evaluation": "agents-runtime",
    }.get(domain, "agents-runtime")


def _surface_for_domain(domain: str) -> str:
    return {
        "graph_relation": "graph-admin-review",
        "misconception": "taxonomy-workbench",
        "content": "content-taxonomy-review",
        "curriculum": "curriculum-workbench",
    }.get(domain, "taxonomy-workbench")


def _text(value: Any, fallback: str) -> str:
    return str(value).strip()[:1200] if isinstance(value, str) and value.strip() else fallback


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
