"""Deterministic preflight agents for content creation orchestration."""

from __future__ import annotations

from typing import Any


class ContentIntentNormalizerAgent:
    """Normalize content-creation intent from caller input and service signals."""

    def normalize(self, *, request: Any, context_pack: dict[str, Any]) -> dict[str, Any]:
        payload = getattr(request, "payload", {}) or {}
        document_ids = list(getattr(request, "document_ids", []) or [])
        trigger = payload.get("trigger")
        if not isinstance(trigger, str):
            if document_ids:
                trigger = "source_ingestion"
            elif payload.get("repairOfPlan") or payload.get("triggerType"):
                trigger = "learner_repair"
            elif getattr(request, "curriculum_id", None):
                trigger = "curriculum_gap"
            else:
                trigger = "manual_author_request"
        artifact_scope = payload.get("artifactScope")
        if artifact_scope not in {"cards", "activity_variants", "cards_and_activity_variants"}:
            desired_activities = payload.get("desiredActivityTypes")
            desired_cards = getattr(request, "desired_card_types", []) or payload.get("desiredCardTypes", [])
            if desired_activities and not desired_cards:
                artifact_scope = "activity_variants"
            elif desired_cards and not desired_activities:
                artifact_scope = "cards"
            else:
                artifact_scope = "cards_and_activity_variants"
        mode = payload.get("mode", "agent_autonomous")
        source_policy = payload.get("sourcePolicy")
        if source_policy not in {"rag_required", "rag_allowed", "autonomous_allowed"}:
            source_policy = "rag_required" if mode == "rag_grounded" else "rag_allowed"
        return {
            "operationName": payload.get("operationName"),
            "trigger": trigger,
            "purpose": payload.get("purpose") or context_pack.get("summary") or "Create reviewable learning content.",
            "pedagogicalMove": payload.get("pedagogicalMove") or ("repair" if trigger == "learner_repair" else "reinforce"),
            "artifactScope": artifact_scope,
            "sourcePolicy": source_policy,
            "personalizationPolicy": payload.get("personalizationPolicy") or "concept_state",
            "agentName": "content-intent-normalizer-agent",
            "status": "finalized",
        }


class LearnerStateSummarizerAgent:
    """Normalize learner-state facts without inferring private affect."""

    def summarize(self, *, request: Any, prompt_seed: dict[str, Any]) -> dict[str, Any]:
        payload = getattr(request, "payload", {}) or {}
        explicit = payload.get("learnerState")
        explicit_global = explicit.get("global", {}) if isinstance(explicit, dict) and isinstance(explicit.get("global"), dict) else {}
        by_concept: dict[str, Any] = {}
        concepts = prompt_seed.get("serviceContract", {}).get("identityMap", {}).get("concepts", [])
        for concept in concepts if isinstance(concepts, list) else []:
            if not isinstance(concept, dict):
                continue
            ref = concept.get("conceptRef")
            if not isinstance(ref, str):
                continue
            by_concept[ref] = {
                "stabilityLabel": None,
                "confidenceCalibration": None,
                "recentFailureModes": [],
                "misconceptionSignals": [],
                "recommendedRepairMove": None,
                "difficultyRecommendation": None,
            }
        return {
            "global": {
                "displayName": explicit_global.get("displayName"),
                "preferredLanguage": explicit_global.get("preferredLanguage"),
                "currentMood": explicit_global.get("currentMood"),
                "cognitiveLoad": explicit_global.get("cognitiveLoad") or {"label": "unknown", "evidence": []},
                "fatigue": explicit_global.get("fatigue") or {"label": "unknown", "evidence": []},
                "motivation": explicit_global.get("motivation"),
            },
            "byConceptRef": by_concept,
            "agentName": "learner-state-summarizer-agent",
            "status": "finalized",
        }


class ContentPedagogyPlannerAgent:
    """Fill prompt pedagogy defaults that require agent judgment."""

    def plan(self, *, request: Any, prompt_seed: dict[str, Any]) -> dict[str, Any]:
        payload = getattr(request, "payload", {}) or {}
        targets: dict[str, str] = {}
        learner_by_ref = prompt_seed.get("pedagogicalContext", {}).get("learnerState", {}).get("byConceptRef", {})
        for concept_ref in learner_by_ref if isinstance(learner_by_ref, dict) else {}:
            targets[concept_ref] = "intermediate"
        return {
            "difficultyTargetsByConceptRef": targets,
            "desiredVariety": {
                "minDistinctTypesPerConcept": (
                    payload.get("varietyMandate", {}).get("minDistinctTypesPerConcept", 3)
                    if isinstance(payload.get("varietyMandate"), dict)
                    else 3
                ),
                "avoidRepeatingLatestTransformation": True,
            },
            "allowedActivityTypes": payload.get("desiredActivityTypes") or ["explanation"],
            "agentName": "content-pedagogy-planner-agent",
            "status": "finalized",
        }
