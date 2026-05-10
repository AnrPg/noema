"""Curriculum Planner Agent - drafts and revises curriculum DAGs from goals and concepts."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


_DRAFT_VERSION_PREFIX = "cver_agent_draft"


class CurriculumDraftRequest(BaseModel):
    user_id: str = Field(alias="userId")
    goal: str | None = None
    concept_ids: list[str] = Field(default_factory=list, alias="conceptIds")
    document_ids: list[str] = Field(default_factory=list, alias="documentIds")
    study_mode: str | None = Field(default=None, alias="studyMode")
    target_horizon: str | None = Field(default=None, alias="targetHorizon")
    difficulty_preference: str | None = Field(default=None, alias="difficultyPreference")
    pacing: str | None = None
    focus_areas: list[str] = Field(default_factory=list, alias="focusAreas")
    learner_preferences: dict[str, Any] = Field(default_factory=dict, alias="learnerPreferences")
    branch_policy: str = Field(default="adaptive_short_detours", alias="branchPolicy")
    prerequisite_strictness: str = Field(
        default="strict_return_to_prerequisites", alias="prerequisiteStrictness"
    )
    detour_budget: dict[str, Any] = Field(default_factory=dict, alias="detourBudget")
    target_outcome: dict[str, Any] = Field(default_factory=dict, alias="targetOutcome")
    known_knowledge_state: dict[str, Any] = Field(default_factory=dict, alias="knownKnowledgeState")
    known_gaps: list[dict[str, Any]] = Field(default_factory=list, alias="knownGaps")
    active_branch_state: dict[str, Any] = Field(default_factory=dict, alias="activeBranchState")
    branch_drift_summary: dict[str, Any] = Field(default_factory=dict, alias="branchDriftSummary")
    context_pack: dict[str, Any] = Field(default_factory=dict, alias="contextPack")
    provider: str | None = None
    model: str | None = None
    agent_run_id: str | None = Field(default=None, alias="agentRunId")
    execution_strategy: str = Field(default="realtime", alias="executionStrategy")
    batch_requested: bool = Field(default=False, alias="batchRequested")


class CurriculumOutlineRequest(BaseModel):
    user_id: str = Field(alias="userId")
    goal: str
    domain: str | None = None
    study_mode: str | None = Field(default=None, alias="studyMode")
    focus_areas: list[str] = Field(default_factory=list, alias="focusAreas")
    learner_preferences: dict[str, Any] = Field(default_factory=dict, alias="learnerPreferences")
    context_pack: dict[str, Any] = Field(default_factory=dict, alias="contextPack")
    provider: str | None = None
    model: str | None = None
    agent_run_id: str | None = Field(default=None, alias="agentRunId")
    execution_strategy: str = Field(default="realtime", alias="executionStrategy")
    batch_requested: bool = Field(default=False, alias="batchRequested")


class CurriculumRevisionRequest(BaseModel):
    user_id: str = Field(alias="userId")
    curriculum_id: str = Field(alias="curriculumId")
    curriculum_version_id: str = Field(alias="curriculumVersionId")
    current_nodes: list[dict[str, Any]] = Field(default_factory=list, alias="currentNodes")
    current_edges: list[dict[str, Any]] = Field(default_factory=list, alias="currentEdges")
    progress: dict[str, Any] = Field(default_factory=dict)
    revision_reason: str = Field(default="evidence_based_update", alias="revisionReason")
    evidence: dict[str, Any] = Field(default_factory=dict)
    revision_scope: str = Field(default="targeted_branch_revision", alias="revisionScope")
    active_branch_state: dict[str, Any] = Field(default_factory=dict, alias="activeBranchState")
    branch_drift_summary: dict[str, Any] = Field(default_factory=dict, alias="branchDriftSummary")
    blocked_prerequisites: list[dict[str, Any]] = Field(default_factory=list, alias="blockedPrerequisites")
    focus_shift_signals: list[dict[str, Any]] = Field(default_factory=list, alias="focusShiftSignals")
    knowledge_state_delta: dict[str, Any] = Field(default_factory=dict, alias="knowledgeStateDelta")
    learner_intent_summary: dict[str, Any] = Field(default_factory=dict, alias="learnerIntentSummary")
    context_pack: dict[str, Any] = Field(default_factory=dict, alias="contextPack")
    provider: str | None = None
    model: str | None = None
    agent_run_id: str | None = Field(default=None, alias="agentRunId")
    execution_strategy: str = Field(default="realtime", alias="executionStrategy")
    batch_requested: bool = Field(default=False, alias="batchRequested")


class CurriculumPlannerAgent:
    """Drafts and revises curriculum DAGs from goals, concepts, and scheduling context."""

    def __init__(self) -> None:
        pass

    async def draft(self, request: CurriculumDraftRequest) -> dict[str, Any]:
        """Deterministic fallback: branch-aware DAG from the provided concept IDs."""
        return self._fallback_draft_from_concepts(request)

    async def outline(self, request: CurriculumOutlineRequest) -> dict[str, Any]:
        """Deterministic fallback: goal-first outline and concept proposal."""
        return self._fallback_outline_from_goal(request)

    async def revise(self, request: CurriculumRevisionRequest) -> dict[str, Any]:
        """Deterministic reviewed proposal from accumulated service evidence."""
        changes = self._fallback_revision_changes(request)
        return {
            "agentRunId": request.agent_run_id or f"cp_realtime_{uuid.uuid4().hex[:8]}",
            "curriculumId": request.curriculum_id,
            "curriculumVersionId": request.curriculum_version_id,
            "changes": changes,
            "changeStrategySummary": {
                "revisionScope": request.revision_scope,
                "activeBranchState": request.active_branch_state,
                "prerequisiteReturnPolicy": "short_detour_then_return",
            },
            "changeCount": len(changes),
            "revisedNodeCount": sum(1 for change in changes if change["kind"] in {"add_node", "split_node"}),
            "revisedEdgeCount": sum(
                1
                for change in changes
                if change["kind"]
                in {"insert_prerequisite", "remove_edge", "retarget_edge", "reorder", "insert_diversion_path"}
            ),
            "revisionReason": request.revision_reason,
            "reviewState": "draft",
            "confidenceLabel": "service_evidence" if changes else "weak_evidence",
            "rationale": (
                "Deterministic revision proposal from curriculum-service evidence. "
                "Each change requires review before application."
            ),
            "evidence": request.evidence,
            "generatedAt": _now_iso(),
        }

    async def finalize_curriculum_draft(
        self,
        *,
        generated_draft: dict[str, Any],
        request: CurriculumDraftRequest,
    ) -> dict[str, Any]:
        """Normalize LLM-produced curriculum draft from a batch job."""
        normalized = self._normalize_draft(generated_draft, request)
        return {
            **normalized,
            "agentRunId": request.agent_run_id or f"cp_batch_{uuid.uuid4().hex[:8]}",
            "artifactKind": "curriculum_draft",
            "reviewState": "draft",
            "confidenceLabel": "llm_inferred",
            "generatedAt": _now_iso(),
        }

    async def finalize_curriculum_outline(
        self,
        *,
        generated_outline: dict[str, Any],
        request: CurriculumOutlineRequest,
    ) -> dict[str, Any]:
        """Normalize LLM-produced exploratory curriculum outline from a batch job."""
        normalized = self._normalize_outline(generated_outline, request)
        return {
            **normalized,
            "agentRunId": request.agent_run_id or f"cp_outline_{uuid.uuid4().hex[:8]}",
            "artifactKind": "curriculum_outline",
            "reviewState": "draft",
            "confidenceLabel": "llm_inferred",
            "generatedAt": _now_iso(),
        }

    async def finalize_curriculum_revision(
        self,
        *,
        generated_revision: dict[str, Any],
        request: CurriculumRevisionRequest,
    ) -> dict[str, Any]:
        """Normalize LLM-produced curriculum revision from a batch job."""
        normalized = self._normalize_revision(generated_revision, request)
        return {
            **normalized,
            "agentRunId": request.agent_run_id or f"cp_rev_{uuid.uuid4().hex[:8]}",
            "artifactKind": "curriculum_revision",
            "reviewState": "draft",
            "confidenceLabel": "llm_inferred",
            "generatedAt": _now_iso(),
        }

    def _normalize_draft(
        self, raw: dict[str, Any], request: CurriculumDraftRequest
    ) -> dict[str, Any]:
        version_id = raw.get("curriculumVersionId") or _DRAFT_VERSION_PREFIX
        raw_nodes: list[dict[str, Any]] = raw.get("nodes") or []
        raw_edges: list[dict[str, Any]] = raw.get("edges") or []
        nodes: list[dict[str, Any]] = []
        for i, node in enumerate(raw_nodes):
            branch_info = node.get("branchInfo") if isinstance(node.get("branchInfo"), dict) else {}
            proposed_concept = (
                node.get("proposedConcept") if isinstance(node.get("proposedConcept"), dict) else None
            )
            ckg_concept_id = node.get("ckgConceptId")
            fallback_concept_id = request.concept_ids[i] if i < len(request.concept_ids) else None
            stable_node_key = node.get("stableNodeKey")
            if not isinstance(stable_node_key, str) or not stable_node_key:
                stable_seed = (
                    ckg_concept_id
                    if isinstance(ckg_concept_id, str) and ckg_concept_id
                    else proposed_concept.get("label") if proposed_concept is not None else i
                )
                stable_node_key = f"node_{stable_seed}"
            normalized_node: dict[str, Any] = {
                "id": node.get("id") or f"cnode_{i}",
                "curriculumVersionId": version_id,
                "stableNodeKey": stable_node_key,
                "label": node.get("label") or ckg_concept_id or str(i),
                "stabilityThreshold": float(
                    node.get("stabilityThreshold", node.get("masteryThreshold", 0.8))
                ),
                "estimatedSessions": int(node.get("estimatedSessions", 1)),
                "traversalWeight": int(node.get("traversalWeight", i + 1)),
                "branchInfo": branch_info,
                "metadata": node.get("metadata", {"goal": request.goal}),
            }
            if isinstance(ckg_concept_id, str) and ckg_concept_id:
                normalized_node["ckgConceptId"] = ckg_concept_id
            elif proposed_concept is not None:
                normalized_node["proposedConcept"] = proposed_concept
            elif isinstance(fallback_concept_id, str) and fallback_concept_id.startswith("node_"):
                normalized_node["proposedConcept"] = {
                    "label": node.get("label") or fallback_concept_id,
                    "pkgNodeId": fallback_concept_id,
                    "source": "pkg_anchor",
                }
            elif isinstance(fallback_concept_id, str) and fallback_concept_id:
                normalized_node["ckgConceptId"] = fallback_concept_id
            nodes.append(normalized_node)
        edges = [
            {
                "id": edge.get("id") or f"cedge_{i}",
                "curriculumVersionId": version_id,
                "fromNodeId": edge.get("fromNodeId", ""),
                "toNodeId": edge.get("toNodeId", ""),
                "type": edge.get("type", "prerequisite"),
                "orderingWeight": int(edge.get("orderingWeight", i)),
            }
            for i, edge in enumerate(raw_edges)
        ]
        normalized = {
            "curriculumVersionId": version_id,
            "goal": raw.get("goal") or request.goal,
            "nodes": nodes,
            "edges": edges,
            "nodeCount": len(nodes),
            "edgeCount": len(edges),
            "rationale": raw.get("rationale", ""),
            "pathExplanation": raw.get("pathExplanation", {}),
            "branchDecisionPoints": raw.get("branchDecisionPoints", []),
            "learnerModelSummary": raw.get("learnerModelSummary", {}),
            "planningSignalsUsed": raw.get("planningSignalsUsed", []),
            "studyMode": request.study_mode,
        }
        self._validate_normalized_draft(normalized)
        return normalized

    def _normalize_outline(
        self, raw: dict[str, Any], request: CurriculumOutlineRequest
    ) -> dict[str, Any]:
        raw_candidate_concepts = raw.get("candidateConcepts")
        raw_candidate_groups = raw.get("candidateGroups")
        raw_ambiguity_notes = raw.get("ambiguityNotes")
        raw_prerequisite_themes = raw.get("prerequisiteThemes")
        raw_provisional_outline = raw.get("provisionalOutline")
        raw_readiness = raw.get("readiness")

        candidate_concepts: list[dict[str, Any]] = []
        for index, item in enumerate(raw_candidate_concepts if isinstance(raw_candidate_concepts, list) else []):
            if not isinstance(item, dict):
                continue
            label = item.get("label")
            if not isinstance(label, str) or label.strip() == "":
                continue
            candidate_concepts.append(
                {
                    "label": label.strip(),
                    "whySuggested": str(
                        item.get("whySuggested")
                        or item.get("rationale")
                        or "Suggested from the goal and domain hints."
                    ),
                    "confidenceLabel": str(item.get("confidenceLabel") or "medium"),
                    "confidenceScore": float(item.get("confidenceScore", 0.67)),
                    "clusterLabel": str(item.get("clusterLabel") or "Candidate anchors"),
                    "suggestedDomain": item.get("suggestedDomain")
                    if isinstance(item.get("suggestedDomain"), str)
                    else None,
                    "source": str(item.get("source") or "goal_analysis"),
                    "requiresProvisionalPkgCreation": bool(
                        item.get("requiresProvisionalPkgCreation", True)
                    ),
                    "matchedConceptId": item.get("matchedConceptId")
                    if isinstance(item.get("matchedConceptId"), str)
                    else None,
                    "matchedGraphSource": item.get("matchedGraphSource")
                    if isinstance(item.get("matchedGraphSource"), str)
                    else None,
                    "order": index,
                }
            )

        candidate_groups: list[dict[str, Any]] = []
        for item in raw_candidate_groups if isinstance(raw_candidate_groups, list) else []:
            if not isinstance(item, dict):
                continue
            label = item.get("label")
            if not isinstance(label, str) or label.strip() == "":
                continue
            concept_labels = item.get("conceptLabels")
            candidate_groups.append(
                {
                    "label": label.strip(),
                    "conceptLabels": [
                        value for value in concept_labels if isinstance(value, str)
                    ]
                    if isinstance(concept_labels, list)
                    else [],
                }
            )

        ambiguity_notes = [
            value
            for value in raw_ambiguity_notes
            if isinstance(value, str) and value.strip() != ""
        ] if isinstance(raw_ambiguity_notes, list) else []

        prerequisite_themes: list[dict[str, Any]] = []
        for item in raw_prerequisite_themes if isinstance(raw_prerequisite_themes, list) else []:
            if not isinstance(item, dict):
                continue
            label = item.get("label")
            if not isinstance(label, str) or label.strip() == "":
                continue
            prerequisite_themes.append(
                {
                    "label": label.strip(),
                    "whyItMatters": str(
                        item.get("whyItMatters")
                        or "This theme supports later concepts in the path."
                    ),
                }
            )

        provisional_outline: list[dict[str, Any]] = []
        for item in raw_provisional_outline if isinstance(raw_provisional_outline, list) else []:
            if not isinstance(item, dict):
                continue
            title = item.get("title")
            if not isinstance(title, str) or title.strip() == "":
                continue
            concept_labels = item.get("conceptLabels")
            provisional_outline.append(
                {
                    "title": title.strip(),
                    "reason": str(item.get("reason") or "This stage supports the final goal."),
                    "conceptLabels": [
                        value for value in concept_labels if isinstance(value, str)
                    ]
                    if isinstance(concept_labels, list)
                    else [],
                }
            )

        readiness = {
            "isReadyForConceptApproval": True,
            "requiresLearnerConfirmation": True,
            "blockingIssues": [],
        }
        if isinstance(raw_readiness, dict):
            readiness = {
                "isReadyForConceptApproval": bool(
                    raw_readiness.get("isReadyForConceptApproval", True)
                ),
                "requiresLearnerConfirmation": bool(
                    raw_readiness.get("requiresLearnerConfirmation", True)
                ),
                "blockingIssues": [
                    value
                    for value in raw_readiness.get("blockingIssues", [])
                    if isinstance(value, str) and value.strip() != ""
                ]
                if isinstance(raw_readiness.get("blockingIssues"), list)
                else [],
            }

        normalized = {
            "goal": raw.get("goal")
            if isinstance(raw.get("goal"), str) and raw.get("goal", "").strip() != ""
            else request.goal,
            "goalSummary": str(
                raw.get("goalSummary")
                or f"Draft a concept-anchored curriculum for: {request.goal}"
            ),
            "candidateConcepts": candidate_concepts,
            "candidateGroups": candidate_groups,
            "ambiguityNotes": ambiguity_notes,
            "prerequisiteThemes": prerequisite_themes,
            "provisionalOutline": provisional_outline,
            "readiness": readiness,
            "rationale": str(
                raw.get("rationale")
                or "The learner goal was analyzed first so the concept anchors can be reviewed before the curriculum DAG is generated."
            ),
            "title": str(raw.get("title") or "Goal analysis ready"),
            "summary": str(
                raw.get("summary")
                or f"{len(candidate_concepts)} candidate concept{'s' if len(candidate_concepts) != 1 else ''} ready for guided approval before curriculum drafting."
            ),
            "studyMode": request.study_mode,
        }
        self._validate_normalized_outline(normalized)
        return normalized

    def _normalize_revision(
        self, raw: dict[str, Any], request: CurriculumRevisionRequest
    ) -> dict[str, Any]:
        changes = raw.get("changes", [])
        if not isinstance(changes, list):
            changes = []
        normalized = {
            "curriculumId": request.curriculum_id,
            "curriculumVersionId": request.curriculum_version_id,
            "changes": changes,
            "changeCount": len(changes),
            "revisedNodeCount": raw.get("revisedNodeCount", 0),
            "revisedEdgeCount": raw.get("revisedEdgeCount", 0),
            "revisionReason": request.revision_reason,
            "rationale": raw.get("rationale", ""),
            "changeStrategySummary": raw.get(
                "changeStrategySummary",
                {
                    "revisionScope": request.revision_scope,
                    "activeBranchState": request.active_branch_state,
                },
            ),
            "evidence": request.evidence,
        }
        if isinstance(raw.get("nodes"), list):
            normalized["nodes"] = raw["nodes"]
        if isinstance(raw.get("edges"), list):
            normalized["edges"] = raw["edges"]
        self._validate_normalized_revision(normalized)
        return normalized

    def _fallback_revision_changes(self, request: CurriculumRevisionRequest) -> list[dict[str, Any]]:
        stable_node_key = self._evidence_string(request.evidence, "stableNodeKey")
        trigger_type = self._evidence_string(request.evidence, "triggerType") or request.revision_reason
        if not stable_node_key and request.current_nodes:
            stable_node_key = str(request.current_nodes[0].get("stableNodeKey", ""))
        if not stable_node_key:
            return []
        if trigger_type in {"prerequisite_gap", "structural_invalidation"}:
            kind = "insert_diversion_path"
            payload = {
                "stableNodeKey": stable_node_key,
                "strategy": "main_path_reorder_or_diversion",
                "requiresHumanPlacement": True,
            }
            rationale = (
                "Repeated evidence indicates the node is reached before its prerequisites are secure, "
                "so the planner should consider a diversion that later rejoins the main path."
            )
        elif trigger_type in {"persistent_misconception", "misconception", "concept_confusion"}:
            kind = "insert_diversion_path"
            payload = {
                "stableNodeKey": stable_node_key,
                "triggerType": trigger_type,
                "requiresRemediationBranch": True,
            }
            rationale = "Durable misconception evidence supports a targeted remediation path."
        elif trigger_type in {"focus_shift", "interest_shift"}:
            kind = "promote_focus_branch"
            payload = {
                "stableNodeKey": stable_node_key,
                "triggerType": trigger_type,
            }
            rationale = "Learner behavior suggests an optional focus branch should be elevated."
        else:
            kind = "adjust_threshold"
            payload = {
                "stableNodeKey": stable_node_key,
                "thresholdDelta": 0.05,
                "triggerType": trigger_type,
            }
            rationale = "Durable evidence suggests this node needs stricter completion evidence."
        return [
            {
                "id": f"rchg_agent_{uuid.uuid4().hex[:16]}",
                "kind": kind,
                "payload": payload,
                "rationale": rationale,
                "expectedEffect": "Learner gets a short corrective branch that still preserves return to prerequisite mastery.",
                "riskLevel": "medium" if kind == "insert_diversion_path" else "low",
                "state": "pending",
            }
        ]

    def _evidence_string(self, evidence: dict[str, Any], key: str) -> str | None:
        value = evidence.get(key)
        return value if isinstance(value, str) and value else None

    def _fallback_draft_from_concepts(self, request: CurriculumDraftRequest) -> dict[str, Any]:
        concept_ids = request.concept_ids or ["concept_seed"]
        context_sections = request.context_pack.get("sections", [])
        prerequisite_layers = self._prerequisite_layers_from_context(context_sections)
        blocked_prereqs = self._blocked_prerequisites_from_context(context_sections)
        focus_areas = request.focus_areas or self._focus_areas_from_context(context_sections)

        foundations = prerequisite_layers or [concept_ids[:1]]
        remainder = [cid for cid in concept_ids if cid not in {item for layer in foundations for item in layer}]
        if remainder:
            branch_count = 2 if len(remainder) > 2 else 1
            branch_layers = [remainder[index::branch_count] for index in range(branch_count) if remainder[index::branch_count]]
        else:
            branch_layers = []

        all_layers = [layer for layer in foundations if layer] + branch_layers
        node_specs: list[dict[str, Any]] = []
        branch_groups = [self._branch_group_key(index, focus_areas) for index in range(len(branch_layers))]

        for layer_index, layer in enumerate(all_layers):
            for item_index, concept_id in enumerate(layer):
                role = "foundation" if layer_index < len(foundations) else "focus_area"
                branch_group_key = None
                is_main_path = layer_index < len(foundations) or (layer_index == len(foundations) and item_index == 0)
                if role == "focus_area":
                    branch_group_key = branch_groups[layer_index - len(foundations)]
                node_specs.append(
                    {
                        "concept_id": concept_id,
                        "label": self._label_for_concept(concept_id),
                        "path_role": role,
                        "branch_group_key": branch_group_key,
                        "is_main_path": is_main_path,
                        "focus_tags": [focus_areas[layer_index - len(foundations)]] if role == "focus_area" and layer_index - len(foundations) < len(focus_areas) else [],
                        "traversal_weight": len(node_specs) + 1,
                    }
                )

        diversion_specs: list[dict[str, Any]] = []
        if blocked_prereqs:
            rejoin_target = node_specs[0]["concept_id"] if node_specs else concept_ids[0]
            for prereq in blocked_prereqs[:2]:
                diversion_specs.append(
                    {
                        "concept_id": None,
                        "label": f"Bridge: {prereq}",
                        "path_role": "diversion",
                        "branch_group_key": "branch_remediation",
                        "is_main_path": False,
                        "focus_tags": ["prerequisite_repair"],
                        "rejoin_targets": [f"node_{rejoin_target}"],
                        "traversal_weight": len(node_specs) + len(diversion_specs) + 1,
                        "proposed_concept": {
                            "label": prereq,
                            "sourceDocumentIds": request.document_ids,
                        },
                    }
                )

        combined_specs = [*node_specs, *diversion_specs]
        nodes: list[dict[str, Any]] = []
        by_concept_or_label: dict[str, dict[str, Any]] = {}
        for index, spec in enumerate(combined_specs):
            concept_id = spec.get("concept_id")
            stable_key = (
                f"node_{concept_id}" if isinstance(concept_id, str) and concept_id else f"node_diversion_{index}"
            )
            node = {
                "id": f"cnode_{index}",
                "curriculumVersionId": _DRAFT_VERSION_PREFIX,
                "stableNodeKey": stable_key,
                **({"ckgConceptId": concept_id} if isinstance(concept_id, str) and concept_id else {}),
                **({"proposedConcept": spec["proposed_concept"]} if "proposed_concept" in spec else {}),
                "label": spec["label"],
                "stabilityThreshold": 0.8,
                "estimatedSessions": 1 if spec["path_role"] != "diversion" else 2,
                "traversalWeight": spec["traversal_weight"],
                "branchInfo": {
                    "pathRole": spec["path_role"],
                    **({"branchGroupKey": spec["branch_group_key"]} if spec["branch_group_key"] else {}),
                    **(
                        {"branchEntryStrategy": "learner_choice"}
                        if spec["path_role"] == "focus_area"
                        else {"branchEntryStrategy": "evidence_triggered"}
                        if spec["path_role"] == "diversion"
                        else {"branchEntryStrategy": "planner_recommended"}
                    ),
                    **(
                        {"branchExitTargets": spec["rejoin_targets"]}
                        if spec.get("rejoin_targets")
                        else {}
                    ),
                    "focusTags": spec["focus_tags"],
                    "isMainPath": spec["is_main_path"],
                },
                "metadata": {
                    "goal": request.goal,
                    "fallback": True,
                    "focusAreas": focus_areas,
                },
            }
            nodes.append(node)
            key = concept_id if isinstance(concept_id, str) and concept_id else spec["label"]
            by_concept_or_label[key] = node

        edges: list[dict[str, Any]] = []
        edge_index = 0

        def add_edge(from_node: dict[str, Any], to_node: dict[str, Any], edge_type: str) -> None:
            nonlocal edge_index
            edges.append(
                {
                    "id": f"cedge_{edge_index}",
                    "curriculumVersionId": _DRAFT_VERSION_PREFIX,
                    "fromNodeId": from_node["id"],
                    "toNodeId": to_node["id"],
                    "type": edge_type,
                    "orderingWeight": edge_index,
                }
            )
            edge_index += 1

        foundation_nodes = [
            by_concept_or_label[cid]
            for layer in foundations
            for cid in layer
            if cid in by_concept_or_label
        ]
        for index in range(1, len(foundation_nodes)):
            add_edge(foundation_nodes[index - 1], foundation_nodes[index], "prerequisite")

        branch_heads: list[dict[str, Any]] = []
        branch_tail_by_group: dict[str, dict[str, Any]] = {}
        foundation_tail = foundation_nodes[-1] if foundation_nodes else None
        for branch_index, layer in enumerate(branch_layers):
            branch_group_key = branch_groups[branch_index]
            branch_nodes = [by_concept_or_label[cid] for cid in layer if cid in by_concept_or_label]
            if not branch_nodes:
                continue
            branch_heads.append(branch_nodes[0])
            if foundation_tail is not None:
                add_edge(foundation_tail, branch_nodes[0], "branch_option")
            for index in range(1, len(branch_nodes)):
                add_edge(branch_nodes[index - 1], branch_nodes[index], "recommended_before")
            branch_tail_by_group[branch_group_key] = branch_nodes[-1]

        branch_tail_values = list(branch_tail_by_group.values())
        if len(branch_heads) > 1:
            for index in range(1, len(branch_heads)):
                add_edge(branch_heads[0], branch_heads[index], "reinforces")

        if branch_tail_values and foundation_tail is not None:
            capstone = {
                "id": f"cnode_{len(nodes)}",
                "curriculumVersionId": _DRAFT_VERSION_PREFIX,
                "stableNodeKey": "node_capstone",
                "proposedConcept": {
                    "label": request.goal or "Integrated capstone",
                    "sourceDocumentIds": request.document_ids,
                },
                "label": request.goal or "Integrated capstone",
                "stabilityThreshold": 0.85,
                "estimatedSessions": 2,
                "traversalWeight": len(nodes) + 1,
                "branchInfo": {
                    "pathRole": "capstone",
                    "branchEntryStrategy": "planner_recommended",
                    "focusTags": focus_areas,
                    "isMainPath": True,
                },
                "metadata": {"goal": request.goal, "fallback": True, "capstone": True},
            }
            nodes.append(capstone)
            add_edge(foundation_tail, capstone, "recommended_before")
            for tail in branch_tail_values:
                add_edge(tail, capstone, "recommended_before")

        if diversion_specs:
            rejoin_target = foundation_nodes[0] if foundation_nodes else None
            for diversion in diversion_specs:
                diversion_node = by_concept_or_label[diversion["label"]]
                if foundation_tail is not None:
                    add_edge(foundation_tail, diversion_node, "diversion_to")
                if rejoin_target is not None:
                    add_edge(diversion_node, rejoin_target, "recommended_before")

        return {
            "agentRunId": request.agent_run_id or f"cp_realtime_{uuid.uuid4().hex[:8]}",
            "curriculumVersionId": _DRAFT_VERSION_PREFIX,
            "goal": request.goal,
            "nodes": nodes,
            "edges": edges,
            "nodeCount": len(nodes),
            "edgeCount": len(edges),
            "reviewState": "draft",
            "confidenceLabel": "weak_evidence",
            "branchDecisionPoints": [
                {
                    "branchGroupKey": branch_group_key,
                    "reason": "Shared prerequisites unlock multiple valid focus directions.",
                    "recommendedPathRole": "focus_area",
                }
                for branch_group_key in branch_groups
            ],
            "pathExplanation": {
                "mainPath": "Foundational nodes lead into optional focus branches and rejoin through a capstone when available.",
                "focusBranches": focus_areas or [group for group in branch_groups],
                "diversions": blocked_prereqs[:2],
            },
            "learnerModelSummary": {
                "branchPolicy": request.branch_policy,
                "prerequisiteStrictness": request.prerequisite_strictness,
                "focusAreas": focus_areas,
                "knownKnowledgeState": request.known_knowledge_state,
                "knownGaps": request.known_gaps,
                "activeBranchState": request.active_branch_state,
                "branchDriftSummary": request.branch_drift_summary,
            },
            "planningSignalsUsed": [
                "blocked_prerequisites" if blocked_prereqs else "no_blocked_prerequisites",
                "focus_areas" if focus_areas else "no_explicit_focus_areas",
                request.branch_policy,
                request.prerequisite_strictness,
            ],
            "rationale": (
                "Deterministic fallback: branch-aware curriculum with a main path, optional focus branches, "
                "and prerequisite diversion capacity when the context indicates blocked foundations."
            ),
            "generatedAt": _now_iso(),
        }

    def _fallback_outline_from_goal(self, request: CurriculumOutlineRequest) -> dict[str, Any]:
        candidate_concepts = [
            {
                "label": label,
                "whySuggested": why,
                "confidenceLabel": confidence,
                "confidenceScore": score,
                "clusterLabel": cluster,
                "suggestedDomain": request.domain,
                "source": source,
                "requiresProvisionalPkgCreation": True,
            }
            for label, why, confidence, score, cluster, source in self._goal_concept_candidates(request)
        ]
        return {
            "goal": request.goal.strip(),
            "goalSummary": (
                "Start from the learner's outcome, surface likely concept anchors, and confirm them "
                "before generating the durable curriculum DAG."
            ),
            "candidateConcepts": candidate_concepts,
            "candidateGroups": self._group_outline_candidates(candidate_concepts),
            "ambiguityNotes": self._outline_ambiguities(request),
            "prerequisiteThemes": self._outline_prerequisite_themes(candidate_concepts),
            "provisionalOutline": self._outline_path(candidate_concepts),
            "readiness": {
                "isReadyForConceptApproval": len(candidate_concepts) > 0,
                "requiresLearnerConfirmation": True,
                "blockingIssues": []
                if candidate_concepts
                else ["No candidate concepts could be inferred from the current goal."],
            },
            "rationale": (
                "A durable curriculum should be generated from reviewed concept anchors instead of from free text alone. "
                "These candidates are intended for approval, removal, and augmentation before drafting."
            ),
            "title": "Goal analysis ready",
            "summary": f"{len(candidate_concepts)} candidate concept{'s' if len(candidate_concepts) != 1 else ''} are ready for approval.",
        }

    def _goal_concept_candidates(
        self, request: CurriculumOutlineRequest
    ) -> list[tuple[str, str, str, float, str, str]]:
        seen: set[str] = set()
        candidates: list[tuple[str, str, str, float, str, str]] = []

        def add(
            label: str,
            why: str,
            confidence: str,
            score: float,
            cluster: str,
            source: str,
        ) -> None:
            normalized = label.strip().lower()
            if normalized == "" or normalized in seen:
                return
            seen.add(normalized)
            candidates.append((label.strip(), why, confidence, score, cluster, source))

        for part in [item.strip() for item in (request.domain or "").split(",") if item.strip() != ""]:
            add(
                part,
                "It appeared directly in the domain hints and likely deserves explicit anchoring.",
                "high",
                0.92,
                "Domain anchors",
                "domain_hint",
            )

        lower_goal = request.goal.lower()
        explicit_terms = [
            "biochemistry",
            "chemistry",
            "biology",
            "microbiology",
            "anatomy",
            "medicine",
            "neuroscience",
            "gut microbiota",
            "neurodegenerative diseases",
            "statistics",
            "probability",
            "linear algebra",
            "bayes theorem",
            "pca",
        ]
        for term in explicit_terms:
            if term in lower_goal:
                add(
                    term.title() if term.islower() else term,
                    "It was named directly in the goal and likely belongs in the approved anchor set.",
                    "high",
                    0.88,
                    "Goal anchors",
                    "goal_text",
                )

        tokens = [
            token.strip(" ,.;:()[]{}")
            for token in request.goal.replace("/", " ").split()
            if len(token.strip(" ,.;:()[]{}")) >= 5
        ]
        for token in tokens[:8]:
            add(
                token.title(),
                "This term stands out in the goal and may need confirmation as a meaningful concept anchor.",
                "medium",
                0.61,
                "Goal signals",
                "goal_text",
            )

        if not candidates:
            add(
                "Foundational concepts",
                "The goal needs at least one anchor set before a durable curriculum can be drafted.",
                "low",
                0.5,
                "Fallback anchors",
                "fallback",
            )

        return candidates[:12]

    def _group_outline_candidates(self, candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
        grouped: dict[str, list[str]] = {}
        for item in candidates:
            cluster = item.get("clusterLabel")
            label = item.get("label")
            if not isinstance(cluster, str) or not isinstance(label, str):
                continue
            grouped.setdefault(cluster, []).append(label)
        return [{"label": key, "conceptLabels": values} for key, values in grouped.items()]

    def _outline_prerequisite_themes(
        self, candidates: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        labels = [item["label"] for item in candidates if isinstance(item.get("label"), str)]
        themes: list[dict[str, Any]] = []
        if any("chem" in label.lower() for label in labels):
            themes.append(
                {
                    "label": "Chemical foundations",
                    "whyItMatters": "Chemical vocabulary and mechanism thinking support later biological and medical concepts.",
                }
            )
        if any("bio" in label.lower() or "micro" in label.lower() for label in labels):
            themes.append(
                {
                    "label": "Biological systems framing",
                    "whyItMatters": "A systems-level biology lens helps organize later anatomy, microbiota, and disease material.",
                }
            )
        if not themes:
            themes.append(
                {
                    "label": "Vocabulary and conceptual grounding",
                    "whyItMatters": "Clarify the core concepts early so later branches do not lose coherence.",
                }
            )
        return themes

    def _outline_path(self, candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
        labels = [item["label"] for item in candidates if isinstance(item.get("label"), str)]
        if not labels:
            return []
        first_stage = labels[: min(3, len(labels))]
        second_stage = labels[min(3, len(labels)) : min(6, len(labels))]
        path = [
            {
                "title": "Confirm the conceptual foundations",
                "reason": "Start with the concepts that appear closest to the learner's stated goal and likely prerequisites.",
                "conceptLabels": first_stage,
            }
        ]
        if second_stage:
            path.append(
                {
                    "title": "Expand into supporting branches",
                    "reason": "After the foundations are confirmed, open the supporting branches that make the goal actionable.",
                    "conceptLabels": second_stage,
                }
            )
        return path

    def _outline_ambiguities(self, request: CurriculumOutlineRequest) -> list[str]:
        notes: list[str] = []
        goal_lower = request.goal.lower()
        if "understand deeply" in goal_lower or "learn enough" in goal_lower:
            notes.append(
                "The goal describes target depth broadly, so the final curriculum may need a later choice about how much prerequisite detail to include."
            )
        if request.domain and "," in request.domain:
            notes.append(
                "The domain hints span multiple areas, so branch prioritization should be confirmed before the curriculum is generated."
            )
        return notes

    def _validate_normalized_outline(self, normalized: dict[str, Any]) -> None:
        if not isinstance(normalized.get("goal"), str) or normalized["goal"].strip() == "":
            raise ValueError("Curriculum outline requires a non-empty goal.")
        if not isinstance(normalized.get("candidateConcepts"), list):
            raise ValueError("Curriculum outline must include candidateConcepts.")

    def _validate_normalized_draft(self, normalized: dict[str, Any]) -> None:
        nodes = normalized.get("nodes", [])
        edges = normalized.get("edges", [])
        node_keys = {
            node.get("stableNodeKey")
            for node in nodes
            if isinstance(node, dict) and isinstance(node.get("stableNodeKey"), str)
        }
        for node in nodes:
            if not isinstance(node, dict):
                raise ValueError("Curriculum draft nodes must be objects.")
            if not node.get("ckgConceptId") and not isinstance(node.get("proposedConcept"), dict):
                raise ValueError("Curriculum draft nodes must include either ckgConceptId or proposedConcept.")
            branch_info = node.get("branchInfo")
            if not isinstance(branch_info, dict):
                raise ValueError("Curriculum draft nodes must include branchInfo.")
            if branch_info.get("pathRole") == "focus_area" and not branch_info.get("branchGroupKey"):
                raise ValueError("Focus-area nodes must include branchGroupKey.")
            if branch_info.get("pathRole") == "diversion" and not branch_info.get("branchExitTargets"):
                raise ValueError("Diversion nodes must include branchExitTargets.")
        for edge in edges:
            if not isinstance(edge, dict):
                raise ValueError("Curriculum draft edges must be objects.")
            if edge.get("type") not in {
                "prerequisite",
                "recommended_before",
                "reinforces",
                "branch_option",
                "diversion_to",
            }:
                raise ValueError("Curriculum draft edges must use supported curriculum edge types.")
        for node in nodes:
            if not isinstance(node, dict):
                continue
            branch_info = node.get("branchInfo")
            if not isinstance(branch_info, dict):
                continue
            exit_targets = branch_info.get("branchExitTargets")
            if isinstance(exit_targets, list):
                for target in exit_targets:
                    if target not in node_keys:
                        raise ValueError("Diversion branchExitTargets must point to existing stableNodeKeys.")

    def _validate_normalized_revision(self, normalized: dict[str, Any]) -> None:
        allowed_kinds = {
            "add_branch_option",
            "close_branch_option",
            "insert_diversion_path",
            "rejoin_branch",
            "promote_focus_branch",
            "demote_focus_branch",
            "add_node",
            "split_node",
            "insert_prerequisite",
            "remove_edge",
            "retarget_edge",
            "reorder",
            "adjust_threshold",
            "relabel_node",
        }
        changes = normalized.get("changes", [])
        for change in changes:
            if not isinstance(change, dict):
                raise ValueError("Curriculum revision changes must be objects.")
            if change.get("kind") not in allowed_kinds:
                raise ValueError("Curriculum revision emitted an unsupported change kind.")
            if not isinstance(change.get("rationale"), str) or not change.get("rationale"):
                raise ValueError("Curriculum revision changes must include rationale.")
            if not isinstance(change.get("expectedEffect"), str) or not change.get("expectedEffect"):
                raise ValueError("Curriculum revision changes must include expectedEffect.")
            if change.get("riskLevel") not in {"low", "medium", "high"}:
                raise ValueError("Curriculum revision changes must include riskLevel.")

    def _prerequisite_layers_from_context(self, sections: list[dict[str, Any]]) -> list[list[str]]:
        layers: list[list[str]] = []
        for section in sections:
            key = section.get("key")
            if not isinstance(key, str) or not key.startswith("prerequisites:"):
                continue
            value = section.get("value")
            if not isinstance(value, dict):
                continue
            raw_layers = value.get("layers")
            if not isinstance(raw_layers, list):
                continue
            for raw_layer in raw_layers:
                if not isinstance(raw_layer, list):
                    continue
                layer: list[str] = []
                for item in raw_layer:
                    if not isinstance(item, dict):
                        continue
                    concept_id = item.get("conceptId") or item.get("nodeId")
                    if isinstance(concept_id, str) and concept_id:
                        layer.append(concept_id)
                if layer:
                    layers.append(layer)
        deduped: list[list[str]] = []
        seen: set[str] = set()
        for layer in layers:
            filtered = [concept_id for concept_id in layer if concept_id not in seen]
            if filtered:
                deduped.append(filtered)
                seen.update(filtered)
        return deduped[:2]

    def _blocked_prerequisites_from_context(self, sections: list[dict[str, Any]]) -> list[str]:
        blocked: list[str] = []
        for section in sections:
            key = section.get("key")
            if key != "blockedPrerequisites":
                continue
            value = section.get("value")
            if not isinstance(value, dict):
                continue
            items = value.get("items")
            if not isinstance(items, list):
                continue
            for item in items:
                if isinstance(item, dict):
                    label = item.get("label") or item.get("conceptId")
                    if isinstance(label, str) and label:
                        blocked.append(label)
        return blocked

    def _focus_areas_from_context(self, sections: list[dict[str, Any]]) -> list[str]:
        for section in sections:
            if section.get("key") != "focusAreaOptions":
                continue
            value = section.get("value")
            if not isinstance(value, dict):
                continue
            items = value.get("items")
            if not isinstance(items, list):
                continue
            areas: list[str] = []
            for item in items:
                if isinstance(item, dict):
                    label = item.get("label") or item.get("focusTag") or item.get("branchGroupKey")
                    if isinstance(label, str) and label:
                        areas.append(label)
            return areas
        return []

    def _branch_group_key(self, index: int, focus_areas: list[str]) -> str:
        if index < len(focus_areas):
            return f"branch_{focus_areas[index].strip().lower().replace(' ', '_')}"
        return f"branch_focus_{index + 1}"

    def _label_for_concept(self, concept_id: str) -> str:
        if concept_id.startswith("concept_"):
            return concept_id.removeprefix("concept_").replace("_", " ").replace("-", " ").title()
        return concept_id.replace("_", " ").replace("-", " ").title()
