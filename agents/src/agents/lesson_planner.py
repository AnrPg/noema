"""Guardian-backed LessonPlan generator for Batch 11."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from .guardian_client import GuardianClient


DEFAULT_STUDY_MODE = "knowledge_gaining"
DEFAULT_LEARNING_MODE = "exploration"
DEFAULT_EPISTEMIC_MODE = "generative_retrieval"
DEFAULT_TRANSFORMATION = "recall"


class LessonPlanRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    session_id: str = Field(alias="sessionId")
    user_id: str = Field(alias="userId")
    curriculum_id: str | None = Field(default=None, alias="curriculumId")
    curriculum_version_id: str | None = Field(default=None, alias="curriculumVersionId")
    selected_node_ids: list[str] = Field(default_factory=list, alias="selectedNodeIds")
    selected_card_ids: list[str] = Field(default_factory=list, alias="selectedCardIds")
    study_mode: str | None = Field(default=None, alias="studyMode")
    learning_mode: str | None = Field(default=None, alias="learningMode")
    rigor_level: str = Field(default="full", alias="rigorLevel")
    target_duration_minutes: int | None = Field(default=None, alias="targetDurationMinutes")
    max_steps: int | None = Field(default=None, alias="maxSteps")
    repair_of_plan: dict[str, Any] | None = Field(default=None, alias="repairOfPlan")
    guardian_block_reasons: list[str] = Field(
        default_factory=list, alias="guardianBlockReasons"
    )
    context: dict[str, Any] = Field(default_factory=dict)
    context_pack: dict[str, Any] = Field(default_factory=dict, alias="contextPack")
    provider: str | None = None
    model: str | None = None
    agent_run_id: str | None = Field(default=None, alias="agentRunId")
    execution_strategy: str = Field(default="realtime", alias="executionStrategy")
    batch_requested: bool = Field(default=False, alias="batchRequested")


class LessonPlanGenerator:
    """Drafts Step-first LessonPlans and routes them through Guardian validation."""

    def __init__(self, guardian: GuardianClient, *, max_goals: int = 4) -> None:
        self._guardian = guardian
        self._max_goals = max_goals

    async def generate(self, request: LessonPlanRequest) -> dict[str, Any]:
        """Build a deterministic plan from the prefetched context pack."""

        generated_plan = self.build_fallback_plan(request)
        return await self.finalize_generated_plan(generated_plan=generated_plan, request=request)

    async def finalize_generated_plan(
        self,
        *,
        generated_plan: dict[str, Any],
        request: LessonPlanRequest,
    ) -> dict[str, Any]:
        """Normalize model/fallback output, enforce local constraints, and call Guardian."""

        run_id = request.agent_run_id or _new_agent_run_id()
        lesson_plan = self.normalize_generated_plan(generated_plan, request)
        self.validate_plan_constraints(lesson_plan, request)

        outcome = await self._guardian.validate_lesson_plan(lesson_plan)
        if not outcome.accepted:
            raise ValueError(f"Guardian rejected LessonPlan: {', '.join(outcome.reasons)}")

        metadata = _as_dict(lesson_plan.get("metadata"))
        lesson_plan["metadata"] = {
            **metadata,
            "agentRunId": run_id,
            "artifactState": "guardian_accepted",
            "reviewRouting": {
                "surface": "Session Plan Review",
                "requiresLearnerReview": lesson_plan.get("rigorLevel") == "full",
            },
        }
        lesson_plan["guardianValidationId"] = outcome.validation_id
        lesson_plan["agentRunId"] = run_id
        lesson_plan["execution"] = {
            "provider": request.provider,
            "model": request.model,
            "strategy": request.execution_strategy,
            "batchRequested": request.batch_requested,
        }
        return lesson_plan

    def normalize_generated_plan(
        self, generated_plan: dict[str, Any], request: LessonPlanRequest
    ) -> dict[str, Any]:
        """Return a session-service CreateLessonPlanInput-compatible payload."""

        selected_node_ids = _strings(
            generated_plan.get("selectedNodeIds") or request.selected_node_ids
        )
        concept_refs = _dedupe(
            _strings(generated_plan.get("conceptRefs"))
            or _concept_refs_from_steps(generated_plan.get("steps"))
            or _concept_ids_from_context(request.context_pack)
            or selected_node_ids
        )
        curriculum_version_id = (
            generated_plan.get("curriculumVersionId")
            or request.curriculum_version_id
            or _curriculum_version_id_from_context(request.context_pack)
        )

        goals = self._normalize_goals(generated_plan, concept_refs)
        steps = self._normalize_steps(generated_plan, request, goals, concept_refs)
        source_refs = _source_refs_from_context(request.context_pack)
        metadata = _as_dict(generated_plan.get("metadata"))
        technical_provenance = _as_dict(generated_plan.get("technicalProvenance"))

        return {
            "sessionId": request.session_id,
            "userId": request.user_id,
            "curriculumId": generated_plan.get("curriculumId") or request.curriculum_id,
            "curriculumVersionId": curriculum_version_id,
            "selectedNodeIds": selected_node_ids,
            "studyMode": request.study_mode or DEFAULT_STUDY_MODE,
            "learningMode": request.learning_mode or DEFAULT_LEARNING_MODE,
            "rigorLevel": str(generated_plan.get("rigorLevel") or request.rigor_level or "full"),
            "topic": str(
                generated_plan.get("topic")
                or request.context.get("topic")
                or _topic_from_context(request.context_pack)
                or "Generated session plan"
            ),
            "conceptRefs": concept_refs,
            "prerequisites": _dedupe(
                _strings(generated_plan.get("prerequisites"))
                or _strings(request.context.get("prerequisites"))
            ),
            "sourceDecks": _strings(generated_plan.get("sourceDecks") or request.context.get("sourceDecks")),
            "sourceCategories": _strings(
                generated_plan.get("sourceCategories") or request.context.get("sourceCategories")
            ),
            "assessmentStrategy": str(
                generated_plan.get("assessmentStrategy")
                or request.context.get("assessmentStrategy")
                or "Each Step asks for explainable evidence, not just a final answer."
            ),
            "adaptationRules": str(
                generated_plan.get("adaptationRules")
                or request.context.get("adaptationRules")
                or "Insert the smallest Guardian-valid repair Step when evidence shows a prerequisite gap."
            ),
            "goals": goals,
            "steps": steps,
            "rationale": str(generated_plan.get("rationale") or ""),
            "learnerFacingSummary": str(
                generated_plan.get("learnerFacingSummary")
                or generated_plan.get("friendlyWhy")
                or "This plan organizes the selected curriculum frontier into Step-first practice."
            ),
            "friendlyWhy": generated_plan.get("friendlyWhy")
            or _friendly_why(steps, request.guardian_block_reasons),
            "technicalProvenance": {
                "sessionId": request.session_id,
                "curriculumId": request.curriculum_id,
                "curriculumVersionId": curriculum_version_id,
                "selectedNodeIds": selected_node_ids,
                "conceptRefs": concept_refs,
                "selectedCardIds": request.selected_card_ids,
                "contentCandidateIds": source_refs.get("contentCandidateIds", []),
                "contextSectionKeys": _section_keys(request.context_pack),
                **technical_provenance,
            },
            "groundingReport": generated_plan.get("groundingReport")
            or {
                "contextSummary": request.context_pack.get("summary"),
                "prefetchErrors": request.context_pack.get("errors", []),
                "authorityLabels": _authority_labels(request.context_pack),
            },
            "repairResponse": generated_plan.get("repairResponse")
            or _repair_response(request),
            "metadata": {
                **metadata,
                "artifactState": "plan_draft",
                "uiSurface": "Session Plan Review",
                "requiresLearnerReview": True,
                "planMilestones": ["plan_generated", "guardian_accepted", "needs_review"],
                "friendlyWhy": generated_plan.get("friendlyWhy")
                or _friendly_why(steps, request.guardian_block_reasons),
                "technicalProvenance": {
                    "contextPackShape": "AgentContextPack",
                    "serviceFactReferences": _section_keys(request.context_pack),
                },
            },
        }

    def build_fallback_plan(self, request: LessonPlanRequest) -> dict[str, Any]:
        """Create a conservative Step-first plan from prefetched service facts."""

        selected_node_ids = request.selected_node_ids or _selected_nodes_from_context(
            request.context_pack
        )
        concept_ids = _concept_ids_from_context(request.context_pack) or selected_node_ids
        if request.curriculum_id and not selected_node_ids:
            raise ValueError("Curriculum-bound LessonPlans require at least one selected node")

        max_steps = request.max_steps or int(request.context.get("maxSteps", 0) or 0) or 4
        max_steps = max(1, min(max_steps, 8))
        planned_concepts = concept_ids[:max_steps] or ["concept_unknown"]
        goals = [
            {
                "description": "Stabilize the selected curriculum frontier",
                "type": "acquisition",
                "source": "system_proposed",
                "conceptRefs": _dedupe(planned_concepts),
            }
        ]
        steps = [
            self._fallback_step(
                position=index,
                concept_id=concept_id,
                request=request,
                repair=index == 0 and bool(request.guardian_block_reasons),
            )
            for index, concept_id in enumerate(planned_concepts)
        ]
        return {
            "curriculumId": request.curriculum_id,
            "curriculumVersionId": request.curriculum_version_id
            or _curriculum_version_id_from_context(request.context_pack),
            "selectedNodeIds": selected_node_ids,
            "topic": request.context.get("topic") or _topic_from_context(request.context_pack),
            "conceptRefs": _dedupe(planned_concepts),
            "goals": goals,
            "steps": steps,
            "assessmentStrategy": (
                "Use short free-text explanations so metacognition-service can evaluate reasoning quality."
            ),
            "adaptationRules": (
                "Prefer local repair Steps for prerequisite gaps; avoid changing evaluated Steps."
            ),
            "rationale": (
                "Deterministic fallback assembled from prefetched session, curriculum, content, "
                "scheduler, graph, and metacognition context."
            ),
            "learnerFacingSummary": (
                f"This plan has {len(goals)} goal and {len(steps)} Step(s). Review before starting."
            ),
        }

    def validate_plan_constraints(
        self, plan: dict[str, Any], request: LessonPlanRequest
    ) -> None:
        """Enforce local hard constraints before Guardian validation."""

        if request.curriculum_id and not _strings(plan.get("selectedNodeIds")):
            raise ValueError("Curriculum-bound LessonPlans require at least one selected node")
        goals = _as_dict_list(plan.get("goals"))
        if len(goals) > self._max_goals:
            raise ValueError(f"LessonPlan may have at most {self._max_goals} active goals")
        steps = _as_dict_list(plan.get("steps"))
        if not steps:
            raise ValueError("LessonPlan requires at least one Step")
        for index, step in enumerate(steps):
            if not str(step.get("objective", "")).strip():
                raise ValueError(f"Step {index + 1} requires an objective")
            if not str(step.get("expectedOutcome", "")).strip():
                raise ValueError(f"Step {index + 1} requires an expected outcome")
            if not _strings(step.get("conceptRefs")):
                raise ValueError(f"Step {index + 1} requires conceptRefs")
            activities = _as_dict_list(step.get("activities"))
            if not activities:
                raise ValueError(f"Step {index + 1} requires at least one Activity")
            for activity_index, activity in enumerate(activities):
                if not str(activity.get("prompt", "")).strip():
                    raise ValueError(
                        f"Step {index + 1} activity {activity_index + 1} requires a prompt"
                    )

    def extract_context_section(
        self, context_pack: dict[str, Any], key: str
    ) -> dict[str, Any] | None:
        return _context_section(context_pack, key)

    def _normalize_goals(
        self, generated_plan: dict[str, Any], concept_refs: list[str]
    ) -> list[dict[str, Any]]:
        raw_goals = _as_dict_list(generated_plan.get("goals"))
        if not raw_goals:
            raw_goals = [
                {
                    "description": "Serve the selected lesson target",
                    "type": "acquisition",
                    "source": "system_proposed",
                    "conceptRefs": concept_refs,
                }
            ]
        goals: list[dict[str, Any]] = []
        for raw in raw_goals:
            goals.append(
                {
                    "description": str(
                        raw.get("description")
                        or raw.get("title")
                        or "Serve generated lesson goal"
                    ),
                    "type": str(raw.get("type") or "acquisition"),
                    "source": str(raw.get("source") or "system_proposed"),
                    "conceptRefs": _dedupe(
                        _strings(raw.get("conceptRefs"))
                        or _strings(raw.get("targetNodeIds"))
                        or concept_refs
                    ),
                }
            )
        return goals

    def _normalize_steps(
        self,
        generated_plan: dict[str, Any],
        request: LessonPlanRequest,
        goals: list[dict[str, Any]],
        concept_refs: list[str],
    ) -> list[dict[str, Any]]:
        raw_steps = _as_dict_list(generated_plan.get("steps"))
        if not raw_steps:
            raw_steps = self.build_fallback_plan(request)["steps"]
        max_steps = request.max_steps or int(request.context.get("maxSteps", 0) or 0) or len(raw_steps)
        goal_refs = [goal.get("id") for goal in goals if isinstance(goal.get("id"), str)]
        steps: list[dict[str, Any]] = []
        for index, raw in enumerate(raw_steps[:max_steps]):
            raw_activity = _as_dict(raw.get("activity"))
            raw_activities = _as_dict_list(raw.get("activities")) or (
                [raw_activity] if raw_activity else []
            )
            step_concepts = _dedupe(
                _strings(raw.get("conceptRefs"))
                or _strings(raw.get("targetNodeIds"))
                or concept_refs[:1]
            )
            activities = [
                self._normalize_activity(activity, index, step_concepts, request)
                for activity in raw_activities
            ]
            if not activities:
                activities = [self._fallback_activity(index, step_concepts[0], request)]
            steps.append(
                {
                    "objective": str(
                        raw.get("objective")
                        or f"Practice {step_concepts[0]} with explainable reasoning."
                    ),
                    "servesGoalIds": _strings(raw.get("servesGoalIds")) or goal_refs,
                    "eligibleModes": _strings(raw.get("eligibleModes")) or [DEFAULT_EPISTEMIC_MODE],
                    "selectedMode": str(raw.get("selectedMode") or DEFAULT_EPISTEMIC_MODE),
                    "transformationType": str(
                        raw.get("transformationType") or DEFAULT_TRANSFORMATION
                    ),
                    "expectedOutcome": str(
                        raw.get("expectedOutcome")
                        or "Learner explains the concept and shows reasoning evidence."
                    ),
                    "evaluationType": str(raw.get("evaluationType") or "self_explanation"),
                    "difficulty": _bounded_float(raw.get("difficulty"), default=0.5),
                    "isRepair": bool(raw.get("isRepair", False)),
                    "conceptRefs": step_concepts,
                    "variantSeed": str(
                        raw.get("variantSeed") or f"{request.session_id}:{index}:{step_concepts[0]}"
                    ),
                    "activities": activities,
                }
            )
        return steps

    def _normalize_activity(
        self,
        raw: dict[str, Any],
        step_index: int,
        concept_refs: list[str],
        request: LessonPlanRequest,
    ) -> dict[str, Any]:
        concept_id = concept_refs[0] if concept_refs else "concept_unknown"
        content_source_type = str(raw.get("contentSourceType") or "generated").lower()
        if content_source_type not in {"card", "template", "generated"}:
            content_source_type = "generated"
        return {
            "contentSourceType": content_source_type,
            "cardId": _optional_string(raw.get("cardId")),
            "templateId": _optional_string(raw.get("templateId")),
            "generatedVariantId": _optional_string(raw.get("generatedVariantId")),
            "prompt": str(
                raw.get("prompt")
                or f"Explain {concept_id}, then give one example that shows your reasoning."
            ),
            "renderPayload": _as_dict(raw.get("renderPayload")),
            "expectedResponseType": str(raw.get("expectedResponseType") or "free_text"),
            "responseSchema": _as_dict(raw.get("responseSchema")),
            "variantSeed": str(
                raw.get("variantSeed") or f"{request.session_id}:activity:{step_index}:{concept_id}"
            ),
            "generationFallbackReason": _optional_string(raw.get("generationFallbackReason")),
        }

    def _fallback_step(
        self,
        *,
        position: int,
        concept_id: str,
        request: LessonPlanRequest,
        repair: bool,
    ) -> dict[str, Any]:
        return {
            "objective": (
                f"Repair prerequisite understanding for {concept_id}."
                if repair
                else f"Practice {concept_id} with explainable reasoning."
            ),
            "eligibleModes": [DEFAULT_EPISTEMIC_MODE],
            "selectedMode": DEFAULT_EPISTEMIC_MODE,
            "transformationType": DEFAULT_TRANSFORMATION,
            "expectedOutcome": "Learner produces a short explanation with traceable reasoning.",
            "evaluationType": "self_explanation",
            "difficulty": 0.45 if repair else 0.55,
            "isRepair": repair,
            "conceptRefs": [concept_id],
            "variantSeed": f"{request.session_id}:fallback:{position}:{concept_id}",
            "activities": [self._fallback_activity(position, concept_id, request)],
        }

    def _fallback_activity(
        self, step_index: int, concept_id: str, request: LessonPlanRequest
    ) -> dict[str, Any]:
        card_id = request.selected_card_ids[step_index] if step_index < len(request.selected_card_ids) else None
        return {
            "contentSourceType": "card" if card_id else "generated",
            "cardId": card_id,
            "templateId": None,
            "generatedVariantId": None,
            "prompt": f"Explain {concept_id} in your own words and include one concrete example.",
            "renderPayload": {"kind": "short_text", "conceptId": concept_id},
            "expectedResponseType": "free_text",
            "responseSchema": {"type": "string"},
            "variantSeed": f"{request.session_id}:activity:{step_index}:{concept_id}",
            "generationFallbackReason": "Deterministic fallback from prefetched lesson context.",
        }


def _context_section(context_pack: dict[str, Any], key: str) -> dict[str, Any] | None:
    sections = context_pack.get("sections", [])
    if not isinstance(sections, list):
        return None
    for section in sections:
        if isinstance(section, dict) and section.get("key") == key:
            return section
    return None


def _selected_nodes_from_context(context_pack: dict[str, Any]) -> list[str]:
    for key in ("learningContext", "sessionSlice", "curriculumFrontier"):
        section = _context_section(context_pack, key)
        value = _as_dict(section.get("value")) if section else {}
        selected = _strings(value.get("selectedNodeIds"))
        if selected:
            return selected
        nodes = value.get("nodes") or value.get("frontier") or value.get("items")
        if isinstance(nodes, list):
            ids = [
                item.get("id")
                for item in nodes
                if isinstance(item, dict) and isinstance(item.get("id"), str)
            ]
            if ids:
                return ids
    return []


def _concept_ids_from_context(context_pack: dict[str, Any]) -> list[str]:
    concept_ids: list[str] = []
    for section in context_pack.get("sections", []):
        if not isinstance(section, dict):
            continue
        value = section.get("value")
        if isinstance(value, dict):
            concept_ids.extend(_strings(value.get("conceptIds")))
            concept_id = value.get("conceptId") or value.get("ckgConceptId") or value.get("id")
            if isinstance(concept_id, str) and concept_id.startswith("concept_"):
                concept_ids.append(concept_id)
            for item_key in ("nodes", "items", "frontier"):
                items = value.get(item_key)
                if isinstance(items, list):
                    for item in items:
                        if not isinstance(item, dict):
                            continue
                        item_concept_id = item.get("ckgConceptId") or item.get("conceptId")
                        if isinstance(item_concept_id, str):
                            concept_ids.append(item_concept_id)
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    item_concept_id = item.get("ckgConceptId") or item.get("conceptId")
                    if isinstance(item_concept_id, str):
                        concept_ids.append(item_concept_id)
    return _dedupe(concept_ids)


def _concept_refs_from_steps(value: Any) -> list[str]:
    refs: list[str] = []
    for step in _as_dict_list(value):
        refs.extend(_strings(step.get("conceptRefs")))
        refs.extend(_strings(step.get("targetNodeIds")))
    return _dedupe(refs)


def _curriculum_version_id_from_context(context_pack: dict[str, Any]) -> str | None:
    for key in ("learningContext", "sessionSlice", "curriculumActiveVersion"):
        section = _context_section(context_pack, key)
        value = _as_dict(section.get("value")) if section else {}
        for field in ("curriculumVersionId", "versionId", "id"):
            found = value.get(field)
            if isinstance(found, str) and found:
                return found
    return None


def _topic_from_context(context_pack: dict[str, Any]) -> str | None:
    for key in ("userIntent", "runContext", "sessionState"):
        section = _context_section(context_pack, key)
        value = _as_dict(section.get("value")) if section else {}
        topic = value.get("topic") or value.get("goal")
        if isinstance(topic, str) and topic:
            return topic
    return None


def _source_refs_from_context(context_pack: dict[str, Any]) -> dict[str, list[str]]:
    candidate_ids: list[str] = []
    for section in context_pack.get("sections", []):
        if not isinstance(section, dict):
            continue
        if section.get("sourceService") != "content-service":
            continue
        value = section.get("value")
        items = value.get("items") if isinstance(value, dict) else value if isinstance(value, list) else []
        if isinstance(items, list):
            for item in items:
                if isinstance(item, dict) and isinstance(item.get("id"), str):
                    candidate_ids.append(item["id"])
    return {"contentCandidateIds": _dedupe(candidate_ids)}


def _friendly_why(steps: list[dict[str, Any]], block_reasons: list[str]) -> list[str]:
    reasons = [
        "Steps define the learning intent; cards and generated content are only payload candidates.",
        "The plan uses service-owned curriculum, scheduler, content, graph, and reasoning context.",
    ]
    if any(step.get("isRepair") for step in steps):
        reasons.append("A repair Step is included because the supplied context indicated a block or gap.")
    if block_reasons:
        reasons.append("This repair responds to Guardian block reasons from the previous draft.")
    return reasons


def _repair_response(request: LessonPlanRequest) -> dict[str, Any] | None:
    if not request.repair_of_plan and not request.guardian_block_reasons:
        return None
    return {
        "repairOfPlan": request.repair_of_plan,
        "guardianBlockReasons": request.guardian_block_reasons,
        "strategy": "revise_blocked_steps_before_review",
    }


def _section_keys(context_pack: dict[str, Any]) -> list[str]:
    return [
        str(section.get("key"))
        for section in context_pack.get("sections", [])
        if isinstance(section, dict) and section.get("key") is not None
    ]


def _authority_labels(context_pack: dict[str, Any]) -> list[str]:
    return _dedupe(
        [
            str(section.get("authorityLabel"))
            for section in context_pack.get("sections", [])
            if isinstance(section, dict) and section.get("authorityLabel") is not None
        ]
    )


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_dict_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _strings(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str) and item]


def _optional_string(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def _bounded_float(value: Any, *, default: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = default
    return max(0.0, min(1.0, number))


def _new_agent_run_id() -> str:
    return f"agentrun_{uuid4().hex[:24]}"
