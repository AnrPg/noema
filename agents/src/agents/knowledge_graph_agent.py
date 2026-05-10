"""Knowledge Graph Agent - proposes concept anchors, prerequisites, and CKG mutations."""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from .graph_intervention import GraphInterventionOrchestrator


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _proposal_id() -> str:
    return f"kgp_{uuid.uuid4().hex[:16]}"


def _readable_label(concept_id: str) -> str:
    """Convert a concept ID to a human-readable label by stripping known prefixes."""
    for prefix in ("concept_", "node_", "kg_"):
        if concept_id.startswith(prefix):
            return concept_id[len(prefix):].replace("_", " ")
    return concept_id.replace("_", " ")


def _concept_id_from_label(label: str) -> str:
    """Normalise a human-readable label to a stable concept ID."""
    return "concept_" + label.lower().replace(" ", "_").replace("-", "_")


def _canonicalize_label(label: str) -> str:
    """Collapse superficial rephrasings into a stable comparison key."""
    normalized = re.sub(r"[^a-z0-9]+", " ", label.lower()).strip()
    return re.sub(r"\s+", " ", normalized)


def _title_case_label(label: str) -> str:
    words = [part for part in re.split(r"\s+", label.strip()) if part]
    return " ".join(word[:1].upper() + word[1:] for word in words)


def _normalize_edge_type(value: Any) -> str:
    raw = str(value or "related_to").strip().lower().replace("-", "_")
    mapping = {
        "is_a_type_of": "is_a",
        "type_of": "is_a",
        "kind_of": "is_a",
        "includes_study_of": "related_to",
        "studies": "related_to",
        "requires": "prerequisite",
        "prerequisite_for": "prerequisite",
        "contrast": "contrasts_with",
        "contrasts": "contrasts_with",
        "confusable": "confusable_with",
        "part": "part_of",
        "component_of": "part_of",
    }
    return mapping.get(raw, raw)


def _is_edge_like_proposal_type(proposal_type: Any) -> bool:
    normalized = str(proposal_type or "").upper()
    return any(
        marker in normalized
        for marker in (
            "EDGE",
            "STRUCTURAL",
            "PREREQUISITE",
            "RELATION",
            "ADD_NODE_AND_EDGE",
            "CREATE_CONCEPT_AND_EDGE",
        )
    )


def _is_semantic_proposal_type(proposal_type: Any) -> bool:
    normalized = str(proposal_type or "").upper()
    return "SEMANTIC" in normalized or "DESCRIPTION" in normalized or "NODE_REFINEMENT" in normalized


def _iter_nodes(section_value: Any) -> list[dict[str, Any]]:
    """Extract node dicts from the various shapes a context-pack section value can take."""
    if isinstance(section_value, dict):
        for key in ("nodes", "items", "concepts", "prerequisites", "related"):
            container = section_value.get(key)
            if isinstance(container, list):
                return [n for n in container if isinstance(n, dict)]
        if any(k in section_value for k in ("id", "nodeId", "conceptId")):
            return [section_value]
    if isinstance(section_value, list):
        return [n for n in section_value if isinstance(n, dict)]
    return []


# ---------------------------------------------------------------------------
# Concept structure table
#
# The agent reasons about prerequisites and entry-path chains BEFORE inspecting
# the graph. This table encodes domain knowledge used in that reasoning phase.
# Keys are lowercased concept label fragments; longest start-of-label match wins,
# then longest anywhere-in-label match. The graph is only consulted afterwards
# to decide whether to create a new node or reuse an existing one.
# ---------------------------------------------------------------------------

# Each entry: {"prerequisites": [labels], "entry_path": [labels]}
# prerequisites — concepts that must be understood before this one.
# entry_path    — ordered chain of intermediate concepts from the domain root
#                 to this concept (exclusive of the concept itself).
_CONCEPT_STRUCTURES: dict[str, dict[str, list[str]]] = {
    "permanova": {
        "prerequisites": ["ANOVA", "Multivariate Statistics"],
        "entry_path": ["Statistics", "ANOVA"],
    },
    "manova": {
        "prerequisites": ["ANOVA", "Multivariate Statistics"],
        "entry_path": ["Statistics", "ANOVA"],
    },
    "logistic regression": {
        "prerequisites": ["Statistics", "Linear Algebra"],
        "entry_path": ["Mathematics", "Linear Algebra", "Statistics"],
    },
    "linear regression": {
        "prerequisites": ["Statistics", "Linear Algebra"],
        "entry_path": ["Mathematics", "Linear Algebra", "Statistics"],
    },
    "regression": {
        "prerequisites": ["Statistics", "Linear Algebra"],
        "entry_path": ["Mathematics", "Statistics"],
    },
    "bayesian inference": {
        "prerequisites": ["Probability Theory", "Bayes Theorem"],
        "entry_path": ["Mathematics", "Probability Theory"],
    },
    "bayes": {
        "prerequisites": ["Probability Theory", "Conditional Probability"],
        "entry_path": ["Mathematics", "Probability Theory"],
    },
    "neural network": {
        "prerequisites": ["Linear Algebra", "Calculus"],
        "entry_path": ["Mathematics", "Linear Algebra", "Calculus"],
    },
    "backpropagation": {
        "prerequisites": ["Neural Network", "Calculus"],
        "entry_path": ["Mathematics", "Calculus", "Neural Network"],
    },
    "gradient descent": {
        "prerequisites": ["Calculus", "Linear Algebra"],
        "entry_path": ["Mathematics", "Calculus"],
    },
    "differential equation": {
        "prerequisites": ["Calculus", "Linear Algebra"],
        "entry_path": ["Mathematics", "Calculus"],
    },
    "graph theory": {
        "prerequisites": ["Combinatorics", "Set Theory"],
        "entry_path": ["Mathematics", "Set Theory", "Combinatorics"],
    },
    "anova": {
        "prerequisites": ["Statistics", "Hypothesis Testing"],
        "entry_path": ["Statistics", "Hypothesis Testing"],
    },
    "clustering": {
        "prerequisites": ["Distance Metrics", "Linear Algebra"],
        "entry_path": ["Mathematics", "Linear Algebra"],
    },
    "classification": {
        "prerequisites": ["Supervised Learning", "Linear Algebra"],
        "entry_path": ["Mathematics", "Linear Algebra", "Supervised Learning"],
    },
    "convolution": {
        "prerequisites": ["Linear Algebra", "Signal Processing"],
        "entry_path": ["Mathematics", "Linear Algebra"],
    },
    "eigenvalue": {
        "prerequisites": ["Linear Algebra", "Matrix Theory"],
        "entry_path": ["Mathematics", "Linear Algebra"],
    },
    "fourier": {
        "prerequisites": ["Calculus", "Linear Algebra"],
        "entry_path": ["Mathematics", "Calculus"],
    },
    "integral": {
        "prerequisites": ["Calculus", "Limits"],
        "entry_path": ["Mathematics", "Limits", "Calculus"],
    },
    "derivative": {
        "prerequisites": ["Limits", "Calculus"],
        "entry_path": ["Mathematics", "Limits"],
    },
    "multivariate": {
        "prerequisites": ["Statistics", "Linear Algebra"],
        "entry_path": ["Mathematics", "Linear Algebra", "Statistics"],
    },
    "probability": {
        "prerequisites": ["Set Theory", "Combinatorics"],
        "entry_path": ["Mathematics", "Set Theory"],
    },
    "inference": {
        "prerequisites": ["Probability Theory", "Statistics"],
        "entry_path": ["Mathematics", "Probability Theory"],
    },
    "statistics": {
        "prerequisites": ["Descriptive Statistics", "Probability Theory"],
        "entry_path": ["Mathematics", "Probability Theory"],
    },
}

_STRUCTURE_KEYS_BY_LENGTH = sorted(_CONCEPT_STRUCTURES, key=len, reverse=True)


def _infer_concept_structure(label: str) -> dict[str, list[str]]:
    """Reason about prerequisites and entry-path chain for a concept label.

    Match priority:
    1. Start-of-label (most specific: "PERMANOVA Statistics" matches "permanova" first).
    2. Anywhere-in-label, longest key first.
    3. Last word of a multi-word label as a single prerequisite/path hint.
    4. Empty structure for bare single-word labels with no domain table entry.
    """
    lower = label.lower()
    for key in _STRUCTURE_KEYS_BY_LENGTH:
        if lower.startswith(key):
            return _CONCEPT_STRUCTURES[key]
    for key in _STRUCTURE_KEYS_BY_LENGTH:
        if key in lower:
            return _CONCEPT_STRUCTURES[key]
    words = label.split()
    if len(words) > 1:
        tail = words[-1].capitalize()
        return {"prerequisites": [tail], "entry_path": [tail]}
    return {"prerequisites": [], "entry_path": []}


class KnowledgeGraphRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_id: str = Field(alias="userId")
    concept_ids: list[str] = Field(default_factory=list, alias="conceptIds")
    selected_node_ids: list[str] = Field(default_factory=list, alias="selectedNodeIds")
    document_ids: list[str] = Field(default_factory=list, alias="documentIds")
    graph_expansion_scope: dict[str, Any] = Field(
        default_factory=dict, alias="graphExpansionScope"
    )
    operation_name: str | None = Field(default=None, alias="operationName")
    proposal_type: str = Field(default="anchor", alias="proposalType")
    domain: str | None = None
    study_mode: str | None = Field(default=None, alias="studyMode")
    candidate_labels: list[str] = Field(default_factory=list, alias="candidateLabels")
    # Delegation hints forwarded by upstream agents (e.g. content-creator's graphProposals).
    # When present, propose() routes to anchor_missing_concepts() automatically.
    incoming_graph_proposals: list[dict[str, Any]] = Field(
        default_factory=list, alias="incomingGraphProposals"
    )
    finalized_graph_prompt: dict[str, Any] = Field(default_factory=dict, alias="finalizedGraphPrompt")
    context_pack: dict[str, Any] = Field(default_factory=dict, alias="contextPack")
    provider: str | None = None
    model: str | None = None
    agent_run_id: str | None = Field(default=None, alias="agentRunId")
    execution_strategy: str = Field(default="realtime", alias="executionStrategy")
    batch_requested: bool = Field(default=False, alias="batchRequested")


_PROPOSAL_REVIEW_STATE = "draft"


class KnowledgeGraphAgent:
    """Proposes CKG mutations: anchors, prerequisites, entry paths, misconceptions, and merges.

    Design contract
    ---------------
    The agent reasons about what should exist in the graph *before* inspecting actual
    graph state. It derives prerequisites and path chains from domain knowledge and label
    analysis, then checks the context pack to see which of those nodes already exist.
    The default action is to create new nodes; reusing an existing node is the exception
    (and earns a higher confidence score on the edge, not a skip of the node creation).

    Primary entry: propose()
    - Routes to anchor_missing_concepts() when proposalType="anchor" or
      incoming_graph_proposals are present.
    - Falls back to the generic per-concept stub for other proposal types.

    anchor_missing_concepts() guarantees per concept:
    1. One add_node proposal for the primary concept (anchorProposals), unless an
       equivalent graph node already exists and should be reused instead of duplicated.
    2. One add_node + one add_edge per inferred prerequisite (prerequisiteNodeProposals /
       prerequisiteEdgeProposals). Existing nodes skip the add_node; edge confidence rises.
    3. One add_node + one add_edge per step in the entry-path chain, plus a terminal edge
       from the last step to the concept (pathNodeProposals / pathEdgeProposals).
       A domain-root fallback ensures at least one path always exists.
    4. Recursive neighborhood expansion fills prerequisite/path holes around the target
       concept so the agent proposes a connected local structure, not an isolated node.
    """

    def __init__(self) -> None:
        pass

    # ------------------------------------------------------------------
    # Public entry points
    # ------------------------------------------------------------------

    async def propose(self, request: KnowledgeGraphRequest) -> dict[str, Any]:
        """Route to the appropriate proposal handler based on request intent."""
        operation_name = request.operation_name or request.proposal_type
        if operation_name == "expand_pkg":
            return await self.expand_pkg(request)
        if request.finalized_graph_prompt and operation_name != "anchor":
            return self._proposal_from_finalized_prompt(request)
        if operation_name == "content_readiness":
            return await self.ensure_content_readiness(request)
        if operation_name == "anchor" or request.incoming_graph_proposals:
            return await self.anchor_missing_concepts(request)

        proposals = [
            self._fallback_proposal_for_concept(
                concept_id=cid,
                proposal_type=request.proposal_type,
                candidate_label=request.candidate_labels[i] if i < len(request.candidate_labels) else None,
                domain=request.domain,
                context_pack=request.context_pack,
            )
            for i, cid in enumerate(request.concept_ids)
        ]
        return {
            "agentRunId": request.agent_run_id or f"kga_realtime_{uuid.uuid4().hex[:8]}",
            "proposals": proposals,
            "proposalCount": len(proposals),
            "operationName": operation_name,
            "proposalType": request.proposal_type,
            "reviewState": _PROPOSAL_REVIEW_STATE,
            "confidenceLabel": "no_evidence",
            "generatedAt": _now_iso(),
            "notes": (
                "Deterministic fallback: no LLM reasoning applied, confidenceScore=0.0. "
                "All proposals require human review before any CKG mutation."
            ),
        }

    async def expand_pkg(self, request: KnowledgeGraphRequest) -> dict[str, Any]:
        """Build a learner-reviewable PKG expansion proposal bundle."""
        prompt = request.finalized_graph_prompt
        identities = self._prompt_identity_records(request)
        relation_candidates = (
            prompt.get("pedagogicalContext", {}).get("relationCandidates", {})
            if isinstance(prompt, dict)
            else {}
        )
        proposals: list[dict[str, Any]] = []
        seen_signatures: set[str] = set()

        for identity in identities:
            concept_ref = str(identity.get("conceptRef") or identity.get("inputRef") or identity.get("label"))
            label = str(identity.get("label") or concept_ref)
            pkg_node_id = identity.get("pkgNodeId")
            ckg_node_id = identity.get("ckgNodeId")
            description = identity.get("learnerFacingSummary")

            structure = _infer_concept_structure(label)
            for prereq_label in structure["prerequisites"][:2]:
                prereq_id = _concept_id_from_label(prereq_label)
                existing = self._find_existing_node(prereq_id, prereq_label, request.context_pack)
                prereq_node_id = (
                    existing.get("id") or existing.get("nodeId") if isinstance(existing, dict) else None
                )
                pkg_operations: list[dict[str, Any]] = []
                affected_ids: list[str] = []
                affected_labels = [label, prereq_label]
                if not isinstance(prereq_node_id, str):
                    temp_ref = f"tmp_{_canonicalize_label(prereq_label).replace(' ', '_')}"
                    pkg_operations.append(
                        {
                            "type": "add_node",
                            "tempNodeRef": temp_ref,
                            "label": prereq_label,
                            "nodeType": "notion",
                            "domain": request.domain or "general",
                            "description": f"Supporting prerequisite concept for '{label}'.",
                        }
                    )
                    pkg_operations.append(
                        {
                            "type": "add_edge",
                            "sourceTempRef": temp_ref,
                            "targetNodeId": pkg_node_id,
                            "edgeType": "prerequisite",
                            "weight": 0.74,
                        }
                    )
                elif isinstance(pkg_node_id, str):
                    pkg_operations.append(
                        {
                            "type": "add_edge",
                            "sourceNodeId": prereq_node_id,
                            "targetNodeId": pkg_node_id,
                            "edgeType": "prerequisite",
                            "weight": 0.82,
                        }
                    )
                    affected_ids.extend([prereq_node_id, pkg_node_id])
                if pkg_operations:
                    signature = f"prereq:{_canonicalize_label(label)}:{_canonicalize_label(prereq_label)}"
                    if signature not in seen_signatures:
                        seen_signatures.add(signature)
                        proposals.append(
                            self._expansion_item(
                                request=request,
                                category="structural_optimization",
                                title=f"Add prerequisite support for {label}",
                                summary=f"Connect {label} to {prereq_label} so the graph explains what should come first.",
                                why_this_helps=f"{label} becomes easier to place and review when its dependency on {prereq_label} is explicit.",
                                what_will_change=f"Create or reuse {prereq_label} and connect it as a prerequisite for {label}.",
                                confidence_label="high" if isinstance(prereq_node_id, str) else "medium",
                                evidence_summary=f"Prerequisite inferred from the concept structure of {label}.",
                                affected_node_ids=affected_ids,
                                affected_node_labels=affected_labels,
                                pkg_operations=pkg_operations,
                                ckg_operations=[],
                            )
                        )

            pretty_label = self._preferred_label(label)
            if pretty_label != label and isinstance(pkg_node_id, str):
                signature = f"label:{pkg_node_id}:{pretty_label}"
                if signature not in seen_signatures:
                    seen_signatures.add(signature)
                    proposals.append(
                        self._expansion_item(
                            request=request,
                            category="label_improvement",
                            title=f"Clarify the label for {label}",
                            summary="Rename the node to a cleaner, more intuitive label.",
                            why_this_helps="A cleaner label makes the concept easier to scan in the map and easier to distinguish from nearby nodes.",
                            what_will_change=f"Update the label from '{label}' to '{pretty_label}'.",
                            confidence_label="medium",
                            evidence_summary="The current label looks mechanically formatted or less learner-friendly.",
                            affected_node_ids=[pkg_node_id],
                            affected_node_labels=[label],
                            preview={"beforeLabel": label, "afterLabel": pretty_label},
                            pkg_operations=[
                                {
                                    "type": "update_node",
                                    "nodeId": pkg_node_id,
                                    "updates": {"label": pretty_label},
                                }
                            ],
                            ckg_operations=(
                                [
                                    {
                                        "type": "update_node",
                                        "nodeId": ckg_node_id,
                                        "updates": {"label": pretty_label},
                                        "rationale": f"'{pretty_label}' is a clearer learner-facing label than '{label}'.",
                                    }
                                ]
                                if isinstance(ckg_node_id, str)
                                else []
                            ),
                        )
                    )

            improved_description = self._improved_description(label, description, structure["prerequisites"])
            if isinstance(pkg_node_id, str) and improved_description != (description or ""):
                signature = f"description:{pkg_node_id}:{improved_description}"
                if signature not in seen_signatures:
                    seen_signatures.add(signature)
                    proposals.append(
                        self._expansion_item(
                            request=request,
                            category="description_improvement",
                            title=f"Make {label} easier to understand",
                            summary="Replace the current description with a more explanatory learner-facing summary.",
                            why_this_helps="A concrete explanation makes the node more self-explanatory when you revisit the graph later.",
                            what_will_change="Update the node description with a shorter, more intuitive explanation.",
                            confidence_label="medium",
                            evidence_summary="The current node description is missing or too thin to explain the concept clearly.",
                            affected_node_ids=[pkg_node_id],
                            affected_node_labels=[label],
                            preview={
                                "beforeDescription": description or None,
                                "afterDescription": improved_description,
                            },
                            pkg_operations=[
                                {
                                    "type": "update_node",
                                    "nodeId": pkg_node_id,
                                    "updates": {"description": improved_description},
                                }
                            ],
                            ckg_operations=(
                                [
                                    {
                                        "type": "update_node",
                                        "nodeId": ckg_node_id,
                                        "updates": {"description": improved_description},
                                        "rationale": f"A clearer description helps explain {label} in the canonical graph.",
                                    }
                                ]
                                if isinstance(ckg_node_id, str)
                                else []
                            ),
                        )
                    )

            proposals.extend(
                self._relation_expansion_items(
                    request=request,
                    identity=identity,
                    relation_candidates=relation_candidates,
                    seen_signatures=seen_signatures,
                )
            )

        proposals = proposals[:12]
        node_ops = sum(1 for proposal in proposals if proposal["category"] == "expand_nodes")
        edge_ops = sum(
            1
            for proposal in proposals
            if proposal["category"] in {"expand_edges", "structural_optimization", "semantic_optimization"}
        )
        wording_ops = sum(
            1 for proposal in proposals if proposal["category"] in {"label_improvement", "description_improvement"}
        )
        canonical_count = sum(
            1
            for proposal in proposals
            if isinstance(proposal.get("canonicalSuggestion"), dict)
            and proposal["canonicalSuggestion"].get("queued") is True
        )
        return {
            "artifactKind": "pkg_expansion_proposal_bundle",
            "operationName": request.operation_name or request.proposal_type,
            "promptProfileVersion": "graph-operation-profile.v1",
            "scope": self._expansion_scope(request),
            "generatedAt": _now_iso(),
            "summary": {
                "proposalCount": len(proposals),
                "nodeProposalCount": node_ops,
                "edgeProposalCount": edge_ops,
                "wordingProposalCount": wording_ops,
                "canonicalCandidateCount": canonical_count,
            },
            "proposals": proposals,
        }

    async def ensure_content_readiness(self, request: KnowledgeGraphRequest) -> dict[str, Any]:
        """Return finalized graph context required by ContentCreationPromptV2.

        This is the content-creation preflight mode. The old local fallback used
        synthetic graph IDs; the readiness path now delegates to
        GraphInterventionOrchestrator so missing identities remain explicit
        blockers instead of becoming fake service handoffs.
        """
        return await GraphInterventionOrchestrator().build_readiness(
            request=request,
            context_pack=request.context_pack,
            agent_run_id=request.agent_run_id,
        )

    async def anchor_missing_concepts(self, request: KnowledgeGraphRequest) -> dict[str, Any]:
        """Anchor one or more concepts absent from the knowledge graph.

        For each concept the agent:
        1. Derives what prerequisite nodes and path-chain nodes should exist
           (reasoning phase — independent of graph state).
        2. Checks the context pack to see which of those nodes already exist
           (graph-check phase).
        3. Proposes add_node for every node not yet in the graph (bias: create
           rather than skip) and add_edge for every required relationship.

        All proposals carry reviewState="draft" and require approval before mutation.
        """
        concepts_to_anchor = self._concepts_from_incoming(request) or list(request.concept_ids)

        anchor_proposals: list[dict[str, Any]] = []
        prereq_node_proposals: list[dict[str, Any]] = []
        prereq_edge_proposals: list[dict[str, Any]] = []
        path_node_proposals: list[dict[str, Any]] = []
        path_edge_proposals: list[dict[str, Any]] = []
        resolved_targets: list[dict[str, str]] = []
        seen_node_labels: set[str] = set()
        seen_edge_keys: set[tuple[str, str, str]] = set()

        for concept_id in concepts_to_anchor:
            label = self._label_for_anchoring(concept_id, request)
            effective_anchor = self._existing_or_requested_anchor(concept_id, label, request)
            effective_concept_id = effective_anchor["conceptId"]
            effective_label = effective_anchor["label"]

            if not effective_anchor["existing"]:
                self._append_unique_node_proposal(
                    proposals=anchor_proposals,
                    proposal=self._build_anchor_proposal(effective_concept_id, effective_label, request),
                    seen_labels=seen_node_labels,
                )

            resolved_targets.append(
                {
                    "requestedConceptId": concept_id,
                    "effectiveConceptId": effective_concept_id,
                    "label": effective_label,
                    "existing": "true" if effective_anchor["existing"] else "false",
                }
            )

            p_nodes, p_edges, q_nodes, q_edges = self._expand_neighborhood(
                concept_id=effective_concept_id,
                label=effective_label,
                request=request,
                seen_labels=seen_node_labels,
                seen_edge_keys=seen_edge_keys,
            )
            prereq_node_proposals.extend(p_nodes)
            prereq_edge_proposals.extend(p_edges)
            path_node_proposals.extend(q_nodes)
            path_edge_proposals.extend(q_edges)

        all_proposals = [
            *anchor_proposals,
            *prereq_node_proposals,
            *prereq_edge_proposals,
            *path_node_proposals,
            *path_edge_proposals,
        ]
        has_context = bool(request.context_pack.get("sections"))
        confidence_label = "context_inferred" if has_context else "label_inferred"

        return {
            "agentRunId": request.agent_run_id or f"kga_anchor_{uuid.uuid4().hex[:8]}",
            "proposals": all_proposals,
            "proposalCount": len(all_proposals),
            "operationName": request.operation_name or "anchor",
            "proposalType": "anchor",
            # Fine-grained groups so callers can act on each role independently.
            "anchorProposals": anchor_proposals,
            "prerequisiteNodeProposals": prereq_node_proposals,
            "prerequisiteEdgeProposals": prereq_edge_proposals,
            "pathNodeProposals": path_node_proposals,
            "pathEdgeProposals": path_edge_proposals,
            "anchoredConceptIds": concepts_to_anchor,
            "resolvedTargets": resolved_targets,
            "reviewState": _PROPOSAL_REVIEW_STATE,
            "confidenceLabel": confidence_label,
            "generatedAt": _now_iso(),
            "notes": (
                f"Anchored {len(concepts_to_anchor)} concept(s). "
                f"{len(prereq_node_proposals)} prerequisite node(s) proposed, "
                f"{len(prereq_edge_proposals)} prerequisite edge(s) proposed. "
                f"{len(path_node_proposals)} path node(s) proposed, "
                f"{len(path_edge_proposals)} path edge(s) proposed. "
                "Neighborhood holes were expanded recursively, and duplicate/rephrased "
                "nodes were reused instead of re-created. All proposals require human "
                "review before CKG mutation."
            ),
        }

    async def finalize_graph_proposals(
        self,
        *,
        raw_proposals: list[dict[str, Any]],
        request: KnowledgeGraphRequest,
    ) -> dict[str, Any]:
        """Normalize and post-process LLM-produced graph proposals from a batch job."""
        proposals = self._normalize_proposals(raw_proposals, request)
        return {
            "agentRunId": request.agent_run_id or f"kga_batch_{uuid.uuid4().hex[:8]}",
            "proposals": proposals,
            "proposalCount": len(proposals),
            "operationName": request.operation_name or request.proposal_type,
            "proposalType": request.proposal_type,
            "reviewState": _PROPOSAL_REVIEW_STATE,
            "confidenceLabel": "llm_inferred" if proposals else "weak_evidence",
            "generatedAt": _now_iso(),
            "artifactKind": "graph_proposals",
        }

    def _proposal_from_finalized_prompt(self, request: KnowledgeGraphRequest) -> dict[str, Any]:
        """Return reviewed graph proposals from an already-finalized GraphAgentPromptV1."""
        prompt = request.finalized_graph_prompt
        operations = prompt.get("serviceContract", {}).get("ckgMutationPlan", {}).get("operations", [])
        proposals = [
            {
                "proposalId": _proposal_id(),
                "conceptId": operation.get("targetNodeId") or request.concept_ids[0] if request.concept_ids else "unknown",
                "proposalType": operation.get("edgeType") or operation.get("type"),
                "operation": operation,
                "rationale": operation.get("rationale", "GraphAgentPromptV1 mutation draft."),
                "confidenceScore": float(operation.get("weight", 0.5)),
                "reviewState": _PROPOSAL_REVIEW_STATE,
                "sourceDocumentIds": request.document_ids,
                "candidateLabel": None,
                "metadata": {
                    "graphPromptId": prompt.get("promptId"),
                    "source": "graph-intervention-orchestrator",
                },
            }
            for operation in operations
            if isinstance(operation, dict)
        ]
        return {
            "agentRunId": request.agent_run_id or f"kga_ready_{uuid.uuid4().hex[:8]}",
            "proposals": proposals,
            "proposalCount": len(proposals),
            "operationName": request.operation_name or request.proposal_type,
            "proposalType": request.proposal_type,
            "reviewState": _PROPOSAL_REVIEW_STATE,
            "confidenceLabel": "finalized_graph_prompt",
            "generatedAt": _now_iso(),
            "graphPrompt": prompt,
            "mutationDraft": {
                "schemaVersion": "graph_mutation_draft.v1",
                "graphPromptRef": prompt.get("promptId"),
                "pkgWritePlan": prompt.get("serviceContract", {}).get("pkgWritePlan", {}),
                "ckgMutationPlan": prompt.get("serviceContract", {}).get("ckgMutationPlan", {}),
            },
            "notes": "Generated from GraphAgentPromptV1. IDs were used only for service handoff.",
        }

    # ------------------------------------------------------------------
    # Neighborhood expansion
    # ------------------------------------------------------------------

    def _expand_neighborhood(
        self,
        *,
        concept_id: str,
        label: str,
        request: KnowledgeGraphRequest,
        seen_labels: set[str],
        seen_edge_keys: set[tuple[str, str, str]],
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
        """Recursively expand the concept neighborhood to fill prerequisite/path holes."""
        prereq_node_proposals: list[dict[str, Any]] = []
        prereq_edge_proposals: list[dict[str, Any]] = []
        path_node_proposals: list[dict[str, Any]] = []
        path_edge_proposals: list[dict[str, Any]] = []
        visited: set[str] = set()

        def walk(current_concept_id: str, current_label: str, depth: int) -> None:
            label_key = _canonicalize_label(current_label)
            if label_key in visited:
                return
            visited.add(label_key)

            p_nodes, p_edges = self._resolve_node_prerequisites(current_concept_id, current_label, request)
            q_nodes, q_edges = self._resolve_entry_paths(current_concept_id, current_label, request)

            for proposal in p_nodes:
                if self._append_unique_node_proposal(
                    proposals=prereq_node_proposals,
                    proposal=proposal,
                    seen_labels=seen_labels,
                ):
                    node_label = proposal.get("candidateLabel")
                    if isinstance(node_label, str) and depth < 3:
                        walk(proposal["conceptId"], node_label, depth + 1)
            for proposal in p_edges:
                self._append_unique_edge_proposal(
                    proposals=prereq_edge_proposals,
                    proposal=proposal,
                    seen_edge_keys=seen_edge_keys,
                )

            for proposal in q_nodes:
                self._append_unique_node_proposal(
                    proposals=path_node_proposals,
                    proposal=proposal,
                    seen_labels=seen_labels,
                )
            for proposal in q_edges:
                self._append_unique_edge_proposal(
                    proposals=path_edge_proposals,
                    proposal=proposal,
                    seen_edge_keys=seen_edge_keys,
                )

        walk(concept_id, label, 0)
        return (
            prereq_node_proposals,
            prereq_edge_proposals,
            path_node_proposals,
            path_edge_proposals,
        )

    # ------------------------------------------------------------------
    # Reasoning + graph-check: prerequisites
    # ------------------------------------------------------------------

    def _resolve_node_prerequisites(
        self,
        concept_id: str,
        label: str,
        request: KnowledgeGraphRequest,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """Derive prerequisite nodes and edges for a concept.

        Reasoning phase: infer prerequisite labels from the concept structure table.
        Graph-check phase: for each prerequisite, check whether a node already exists
        in the context pack. If it does, skip add_node (higher-confidence edge); if
        not, propose add_node (agent creates it) then add_edge.

        Returns (node_proposals, edge_proposals).
        """
        structure = _infer_concept_structure(label)
        node_proposals: list[dict[str, Any]] = []
        edge_proposals: list[dict[str, Any]] = []

        for prereq_label in structure["prerequisites"]:
            prereq_id = _concept_id_from_label(prereq_label)
            existing = self._find_existing_node(prereq_id, prereq_label, request.context_pack)

            if existing is None:
                node_proposals.append(
                    self._build_node_proposal(
                        concept_id=prereq_id,
                        label=prereq_label,
                        role="prerequisite",
                        request=request,
                        rationale=(
                            f"Prerequisite of '{label}'. Proposed as a new node because "
                            "it was absent from the knowledge graph at reasoning time."
                        ),
                        confidence=0.55,
                    )
                )
                effective_id = prereq_id
                edge_confidence = 0.55
            else:
                effective_id = existing.get("id") or existing.get("nodeId") or prereq_id
                edge_confidence = 0.75  # Existing node → stronger edge signal.

            edge_proposals.append(
                self._build_prerequisite_edge(
                    from_id=effective_id,
                    from_label=prereq_label,
                    to_id=concept_id,
                    to_label=label,
                    request=request,
                    source="domain_reasoning",
                    confidence=edge_confidence,
                    from_node_is_new=existing is None,
                )
            )

        return node_proposals, edge_proposals

    # ------------------------------------------------------------------
    # Reasoning + graph-check: entry paths
    # ------------------------------------------------------------------

    def _resolve_entry_paths(
        self,
        concept_id: str,
        label: str,
        request: KnowledgeGraphRequest,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """Derive a connected path of nodes from the domain root to the concept.

        Reasoning phase: build an ordered chain of intermediate concepts using the
        concept structure table (e.g. Statistics → ANOVA → PERMANOVA Statistics).
        Graph-check phase: for each step, check if the node exists; if yes, skip
        add_node; if no, propose it. Always emit add_edge for every step in the chain.
        A domain-root fallback guarantees at least one path even with zero context.

        Returns (node_proposals, edge_proposals).
        """
        structure = _infer_concept_structure(label)
        path_labels = structure["entry_path"]

        node_proposals: list[dict[str, Any]] = []
        edge_proposals: list[dict[str, Any]] = []

        if not path_labels:
            # No entry-path known — attach directly to the domain root.
            domain = request.domain or "general"
            root_id = _concept_id_from_label(f"{domain} root")
            edge_proposals.append(
                self._build_path_edge(
                    from_id=root_id,
                    from_label=f"{domain.capitalize()} root",
                    to_id=concept_id,
                    to_label=label,
                    request=request,
                    source="domain_root_fallback",
                    confidence=0.3,
                    from_node_is_new=False,
                )
            )
            return node_proposals, edge_proposals

        prev_id: str | None = None
        prev_label: str | None = None

        for step_label in path_labels:
            step_id = _concept_id_from_label(step_label)
            existing = self._find_existing_node(step_id, step_label, request.context_pack)

            if existing is None:
                node_proposals.append(
                    self._build_node_proposal(
                        concept_id=step_id,
                        label=step_label,
                        role="path_node",
                        request=request,
                        rationale=f"Intermediate path node on the route to '{label}'.",
                        confidence=0.5,
                    )
                )
                effective_id = step_id
                step_is_new = True
            else:
                effective_id = existing.get("id") or existing.get("nodeId") or step_id
                step_is_new = False

            if prev_id is not None:
                edge_proposals.append(
                    self._build_path_edge(
                        from_id=prev_id,
                        from_label=prev_label,
                        to_id=effective_id,
                        to_label=step_label,
                        request=request,
                        source="path_chain",
                        confidence=0.45 if step_is_new else 0.6,
                        from_node_is_new=False,  # prev node was handled in its own iteration
                    )
                )

            prev_id = effective_id
            prev_label = step_label

        # Terminal edge: last chain step → the anchored concept.
        if prev_id is not None:
            edge_proposals.append(
                self._build_path_edge(
                    from_id=prev_id,
                    from_label=prev_label,
                    to_id=concept_id,
                    to_label=label,
                    request=request,
                    source="path_chain_terminal",
                    confidence=0.6,
                    from_node_is_new=False,
                )
            )

        return node_proposals, edge_proposals

    # ------------------------------------------------------------------
    # Graph-check helper
    # ------------------------------------------------------------------

    def _find_existing_node(
        self, concept_id: str, label: str, context_pack: dict[str, Any]
    ) -> dict[str, Any] | None:
        """Return the matching node dict from the context pack, or None if absent.

        Checks direct concept sections first, then scans all structured graph sections.
        ID match takes priority; normalized label/alias match is the fallback to prevent
        duplicate nodes created from superficial rephrasings.
        """
        direct = self._get_context_section(f"conceptNode:{concept_id}", context_pack)
        if direct is not None:
            return direct if isinstance(direct, dict) else {"id": concept_id}

        normalized_label = _canonicalize_label(label)
        sections = context_pack.get("sections", [])
        if not isinstance(sections, list):
            return None

        for section in sections:
            if not isinstance(section, dict):
                continue
            for node in _iter_nodes(section.get("value")):
                nid = node.get("id") or node.get("nodeId") or node.get("conceptId")
                labels = self._node_labels(node)
                if nid == concept_id or normalized_label in labels:
                    return node

        return None

    def _node_id_from_context(self, concept_id: str, context_pack: dict[str, Any]) -> str | None:
        for key in (f"graphConcept:{concept_id}", f"conceptNode:{concept_id}"):
            value = self._get_context_section(key, context_pack)
            if isinstance(value, dict):
                for candidate_key in ("nodeId", "id"):
                    candidate = value.get(candidate_key)
                    if isinstance(candidate, str) and candidate.startswith("node_"):
                        return candidate
        return None

    # ------------------------------------------------------------------
    # Proposal builders
    # ------------------------------------------------------------------

    def _existing_or_requested_anchor(
        self,
        concept_id: str,
        label: str,
        request: KnowledgeGraphRequest,
    ) -> dict[str, Any]:
        existing = self._find_existing_node(concept_id, label, request.context_pack)
        if existing is None:
            return {"existing": False, "conceptId": concept_id, "label": label}
        effective_id = (
            existing.get("conceptId")
            or existing.get("id")
            or existing.get("nodeId")
            or concept_id
        )
        effective_label = (
            existing.get("label")
            or existing.get("name")
            or existing.get("title")
            or label
        )
        return {"existing": True, "conceptId": effective_id, "label": effective_label}

    def _node_labels(self, node: dict[str, Any]) -> set[str]:
        labels: set[str] = set()
        for key in ("label", "name", "title"):
            value = node.get(key)
            if isinstance(value, str) and value.strip():
                labels.add(_canonicalize_label(value))
        aliases = node.get("aliases")
        if isinstance(aliases, list):
            for alias in aliases:
                if isinstance(alias, str) and alias.strip():
                    labels.add(_canonicalize_label(alias))
        data = node.get("data")
        if isinstance(data, dict):
            for key in ("label", "name", "title"):
                value = data.get(key)
                if isinstance(value, str) and value.strip():
                    labels.add(_canonicalize_label(value))
            aliases = data.get("aliases")
            if isinstance(aliases, list):
                for alias in aliases:
                    if isinstance(alias, str) and alias.strip():
                        labels.add(_canonicalize_label(alias))
        return labels

    def _append_unique_node_proposal(
        self,
        *,
        proposals: list[dict[str, Any]],
        proposal: dict[str, Any],
        seen_labels: set[str],
    ) -> bool:
        label = proposal.get("candidateLabel")
        if not isinstance(label, str) or not label.strip():
            proposals.append(proposal)
            return True
        marker = _canonicalize_label(label)
        if marker in seen_labels:
            return False
        seen_labels.add(marker)
        proposals.append(proposal)
        return True

    def _append_unique_edge_proposal(
        self,
        *,
        proposals: list[dict[str, Any]],
        proposal: dict[str, Any],
        seen_edge_keys: set[tuple[str, str, str]],
    ) -> bool:
        operation = proposal.get("operation", {})
        if not isinstance(operation, dict):
            proposals.append(proposal)
            return True
        marker = (
            str(operation.get("edgeType") or ""),
            str(operation.get("sourceNodeId") or ""),
            str(operation.get("targetNodeId") or ""),
        )
        if marker in seen_edge_keys:
            return False
        seen_edge_keys.add(marker)
        proposals.append(proposal)
        return True

    def _build_anchor_proposal(
        self,
        concept_id: str,
        label: str,
        request: KnowledgeGraphRequest,
    ) -> dict[str, Any]:
        return {
            "proposalId": _proposal_id(),
            "conceptId": concept_id,
            "proposalType": "anchor",
            "operation": {
                "type": "add_node",
                "nodeType": "notion",
                "label": label,
                "description": (
                    f"Candidate concept node for '{label}', proposed because it was "
                    "referenced by an upstream agent but has no corresponding CKG node."
                ),
                "domain": request.domain or "general",
                "properties": {
                    "source": "knowledge-graph-agent",
                    "proposalType": "anchor",
                    "subjectConceptId": concept_id,
                    "signal": "concept_not_in_graph",
                },
            },
            "rationale": (
                f"'{label}' was referenced upstream but absent from the knowledge graph. "
                "Anchoring this node enables prerequisite resolution and path discovery."
            ),
            "confidenceScore": 0.6,
            "reviewState": _PROPOSAL_REVIEW_STATE,
            "sourceDocumentIds": request.document_ids,
            "candidateLabel": label,
            "metadata": {"nodeRole": "anchor"},
        }

    def _build_node_proposal(
        self,
        *,
        concept_id: str,
        label: str,
        role: str,
        request: KnowledgeGraphRequest,
        rationale: str,
        confidence: float,
    ) -> dict[str, Any]:
        """Build an add_node proposal for a prerequisite or path-chain node."""
        return {
            "proposalId": _proposal_id(),
            "conceptId": concept_id,
            "proposalType": role,
            "operation": {
                "type": "add_node",
                "nodeType": "notion",
                "label": label,
                "description": f"Concept node for '{label}'. {rationale}",
                "domain": request.domain or "general",
                "properties": {
                    "source": "knowledge-graph-agent",
                    "proposalType": role,
                    "subjectConceptId": concept_id,
                },
            },
            "rationale": rationale,
            "confidenceScore": confidence,
            "reviewState": _PROPOSAL_REVIEW_STATE,
            "sourceDocumentIds": request.document_ids,
            "candidateLabel": label,
            "metadata": {"nodeRole": role},
        }

    def _build_prerequisite_edge(
        self,
        *,
        from_id: str,
        from_label: str | None,
        to_id: str,
        to_label: str,
        request: KnowledgeGraphRequest,
        source: str,
        confidence: float,
        from_node_is_new: bool,
    ) -> dict[str, Any]:
        display_from = from_label or from_id
        return {
            "proposalId": _proposal_id(),
            "conceptId": to_id,
            "proposalType": "prerequisite",
            "operation": {
                "type": "add_edge",
                "edgeType": "prerequisite",
                "sourceNodeId": from_id,
                "targetNodeId": to_id,
                "weight": confidence,
                "rationale": f"'{display_from}' is a prerequisite of '{to_label}' inferred via {source.replace('_', ' ')}.",
            },
            "rationale": (
                f"'{display_from}' is a prerequisite of '{to_label}' "
                f"(inferred via {source.replace('_', ' ')}). "
                + ("Prerequisite node was also proposed in this batch." if from_node_is_new
                   else "Prerequisite node already exists in the graph.")
            ),
            "confidenceScore": confidence,
            "reviewState": _PROPOSAL_REVIEW_STATE,
            "sourceDocumentIds": request.document_ids,
            "candidateLabel": from_label,
            "metadata": {
                "inferenceSource": source,
                "edgeRole": "prerequisite",
                "fromNodeIsNew": from_node_is_new,
            },
        }

    def _build_path_edge(
        self,
        *,
        from_id: str,
        from_label: str | None,
        to_id: str,
        to_label: str,
        request: KnowledgeGraphRequest,
        source: str,
        confidence: float,
        from_node_is_new: bool,
    ) -> dict[str, Any]:
        display_from = from_label or from_id
        return {
            "proposalId": _proposal_id(),
            "conceptId": to_id,
            "proposalType": "path_edge",
            "operation": {
                "type": "add_edge",
                "edgeType": "related_to",
                "sourceNodeId": from_id,
                "targetNodeId": to_id,
                "weight": confidence,
                "rationale": f"Entry-path relation from '{display_from}' to '{to_label}' inferred via {source.replace('_', ' ')}.",
            },
            "rationale": (
                f"Path step: '{display_from}' → '{to_label}'. "
                f"Source: {source.replace('_', ' ')}. "
                + ("Both nodes proposed in this batch." if from_node_is_new
                   else "Source node exists in graph; target node proposed in this batch.")
            ),
            "confidenceScore": confidence,
            "reviewState": _PROPOSAL_REVIEW_STATE,
            "sourceDocumentIds": request.document_ids,
            "candidateLabel": from_label,
            "metadata": {
                "inferenceSource": source,
                "edgeRole": "entry_path",
                "fromNodeIsNew": from_node_is_new,
            },
        }

    def _expansion_scope(self, request: KnowledgeGraphRequest) -> dict[str, Any]:
        scope = request.graph_expansion_scope if isinstance(request.graph_expansion_scope, dict) else {}
        scope_type = str(scope.get("scopeType") or ("node" if request.selected_node_ids else "whole_pkg"))
        if scope_type not in {"whole_pkg", "node", "domain"}:
            scope_type = "whole_pkg"
        node_ids = [str(node_id) for node_id in scope.get("nodeIds", request.selected_node_ids) if isinstance(node_id, str)]
        domain = scope.get("domain") if isinstance(scope.get("domain"), str) else request.domain
        return {
            "scopeType": scope_type,
            "nodeIds": node_ids,
            "domain": domain,
        }

    def _prompt_identity_records(self, request: KnowledgeGraphRequest) -> list[dict[str, Any]]:
        prompt = request.finalized_graph_prompt if isinstance(request.finalized_graph_prompt, dict) else {}
        target_concepts = prompt.get("pedagogicalContext", {}).get("targetConcepts", [])
        concept_map: dict[str, dict[str, Any]] = {}
        for item in target_concepts if isinstance(target_concepts, list) else []:
            if not isinstance(item, dict):
                continue
            concept_ref = str(item.get("conceptRef") or "")
            concept_map[concept_ref] = {
                "conceptRef": concept_ref,
                "label": item.get("label"),
                "learnerFacingSummary": item.get("learnerFacingSummary") or item.get("description"),
                "domain": item.get("domain") or request.domain,
            }
        for item in prompt.get("serviceContract", {}).get("identityMap", {}).get("concepts", []):
            if not isinstance(item, dict):
                continue
            concept_ref = str(item.get("inputRef") or item.get("conceptRef") or "")
            record = concept_map.setdefault(concept_ref, {"conceptRef": concept_ref})
            record.update(
                {
                    "inputRef": concept_ref,
                    "conceptId": item.get("conceptId"),
                    "pkgNodeId": item.get("pkgNodeId"),
                    "ckgNodeId": item.get("ckgNodeId"),
                }
            )
        results = [item for item in concept_map.values() if item.get("label")]
        if results:
            return results
        return [
            {
                "conceptRef": concept_id,
                "inputRef": concept_id,
                "conceptId": concept_id if concept_id.startswith("concept_") else None,
                "pkgNodeId": request.selected_node_ids[index] if index < len(request.selected_node_ids) else None,
                "ckgNodeId": None,
                "label": self._label_for_anchoring(concept_id, request),
                "learnerFacingSummary": None,
                "domain": request.domain,
            }
            for index, concept_id in enumerate(request.concept_ids)
        ]

    def _preferred_label(self, label: str) -> str:
        cleaned = label.replace("_", " ").replace("-", " ").strip()
        if cleaned.isupper():
            return cleaned.title()
        parts = [part for part in cleaned.split() if part]
        if not parts:
            return label
        return " ".join(part.capitalize() if part.islower() else part for part in parts)

    def _improved_description(
        self,
        label: str,
        description: Any,
        prerequisites: list[str],
    ) -> str:
        current = str(description).strip() if isinstance(description, str) else ""
        if current and len(current) >= 60:
            return current
        if prerequisites:
            prereq_text = ", ".join(prerequisites[:2])
            return f"{label} builds on {prereq_text} and should be understood in relation to those supporting ideas."
        return f"{label} is a concept in this domain that should be easier to interpret directly from the graph."

    def _expansion_item(
        self,
        *,
        request: KnowledgeGraphRequest,
        category: str,
        title: str,
        summary: str,
        why_this_helps: str,
        what_will_change: str,
        confidence_label: str,
        evidence_summary: str,
        affected_node_ids: list[str],
        affected_node_labels: list[str],
        pkg_operations: list[dict[str, Any]],
        ckg_operations: list[dict[str, Any]],
        preview: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return {
            "proposalId": _proposal_id(),
            "category": category,
            "title": title,
            "summary": summary,
            "whyThisHelps": why_this_helps,
            "whatWillChange": what_will_change,
            "confidenceLabel": confidence_label,
            "evidenceSummary": evidence_summary,
            "scope": self._expansion_scope(request),
            "affectedNodeIds": [node_id for node_id in affected_node_ids if isinstance(node_id, str)],
            "affectedNodeLabels": [label for label in affected_node_labels if isinstance(label, str)],
            **({"preview": preview} if isinstance(preview, dict) and preview else {}),
            "pkgOperations": pkg_operations,
            "ckgOperations": ckg_operations,
            "canonicalSuggestion": {
                "queued": bool(ckg_operations),
                "rationale": what_will_change if ckg_operations else None,
                "operations": ckg_operations,
            },
        }

    def _canonical_edge_ops(
        self,
        *,
        edge_type: str,
        source_node_id: Any,
        target_node_id: Any,
        target_label: str,
        rationale: str,
    ) -> list[dict[str, Any]]:
        if not isinstance(source_node_id, str) or not isinstance(target_node_id, str):
            return []
        return [
            {
                "type": "add_edge",
                "edgeType": edge_type,
                "sourceNodeId": source_node_id,
                "targetNodeId": target_node_id,
                "weight": 0.76,
                "rationale": rationale or f"Relate {target_label} inside the canonical graph.",
            }
        ]

    def _relation_expansion_items(
        self,
        *,
        request: KnowledgeGraphRequest,
        identity: dict[str, Any],
        relation_candidates: dict[str, Any],
        seen_signatures: set[str],
    ) -> list[dict[str, Any]]:
        concept_ref = str(identity.get("conceptRef") or "")
        pkg_node_id = identity.get("pkgNodeId")
        ckg_node_id = identity.get("ckgNodeId")
        label = str(identity.get("label") or concept_ref)
        if not isinstance(pkg_node_id, str):
            return []
        category_map = {
            "related": ("semantic_optimization", "related_to", "Surface a related concept"),
            "contrasts": ("semantic_optimization", "contrasts_with", "Add a clarifying contrast"),
            "confusables": ("semantic_optimization", "confusable_with", "Mark a likely confusion"),
        }
        proposals: list[dict[str, Any]] = []
        prompt = request.finalized_graph_prompt if isinstance(request.finalized_graph_prompt, dict) else {}
        identity_items = prompt.get("serviceContract", {}).get("identityMap", {}).get("concepts", [])
        by_ref = {
            str(item.get("inputRef") or item.get("conceptRef") or ""): item
            for item in identity_items
            if isinstance(item, dict)
        }
        for key, (category, edge_type, title_prefix) in category_map.items():
            items = relation_candidates.get(key, [])
            if not isinstance(items, list):
                continue
            for relation in items[:2]:
                if not isinstance(relation, dict):
                    continue
                if str(relation.get("sourceConceptRef")) != concept_ref:
                    continue
                target_ref = str(relation.get("targetConceptRef") or "")
                target_identity = by_ref.get(target_ref, {})
                target_pkg = target_identity.get("pkgNodeId")
                target_ckg = target_identity.get("ckgNodeId")
                target_label = str(relation.get("targetLabel") or target_ref or "Related concept")
                if not isinstance(target_pkg, str):
                    continue
                signature = f"{edge_type}:{pkg_node_id}:{target_pkg}"
                if signature in seen_signatures:
                    continue
                seen_signatures.add(signature)
                explanation = str(relation.get("explanation") or f"{label} and {target_label} benefit from an explicit relation.")
                proposals.append(
                    self._expansion_item(
                        request=request,
                        category=category,
                        title=f"{title_prefix} for {label}",
                        summary=explanation,
                        why_this_helps=f"Connecting {label} with {target_label} makes the graph more explanatory, not just more complete.",
                        what_will_change=f"Add a {edge_type.replace('_', ' ')} edge between {label} and {target_label}.",
                        confidence_label="medium",
                        evidence_summary=explanation,
                        affected_node_ids=[pkg_node_id, target_pkg],
                        affected_node_labels=[label, target_label],
                        pkg_operations=[
                            {
                                "type": "add_edge",
                                "sourceNodeId": pkg_node_id,
                                "targetNodeId": target_pkg,
                                "edgeType": edge_type,
                                "weight": float(relation.get("confidenceScore") or 0.62),
                            }
                        ],
                        ckg_operations=self._canonical_edge_ops(
                            edge_type=edge_type,
                            source_node_id=ckg_node_id,
                            target_node_id=target_ckg,
                            target_label=target_label,
                            rationale=explanation,
                        ),
                    )
                )
        return proposals

    # ------------------------------------------------------------------
    # Context pack helpers
    # ------------------------------------------------------------------

    def _get_context_section(self, key: str, context_pack: dict[str, Any]) -> Any:
        sections = context_pack.get("sections", [])
        if not isinstance(sections, list):
            return None
        for section in sections:
            if isinstance(section, dict) and section.get("key") == key:
                return section.get("value")
        return None

    # ------------------------------------------------------------------
    # Anchor label resolution
    # ------------------------------------------------------------------

    def _concepts_from_incoming(self, request: KnowledgeGraphRequest) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for proposal in request.incoming_graph_proposals:
            if not isinstance(proposal, dict):
                continue
            cid = proposal.get("conceptId")
            if isinstance(cid, str) and cid and cid not in seen:
                seen.add(cid)
                result.append(cid)
        return result

    def _label_for_anchoring(self, concept_id: str, request: KnowledgeGraphRequest) -> str:
        for proposal in request.incoming_graph_proposals:
            if not isinstance(proposal, dict) or proposal.get("conceptId") != concept_id:
                continue
            op = proposal.get("proposedOperation", {})
            if isinstance(op, dict):
                label = op.get("label")
                if isinstance(label, str) and label:
                    return label

        if concept_id in request.concept_ids:
            idx = request.concept_ids.index(concept_id)
            if idx < len(request.candidate_labels):
                return request.candidate_labels[idx]

        ctx_label = self._label_from_context(concept_id, request.context_pack)
        if ctx_label:
            return ctx_label

        return _readable_label(concept_id)

    # ------------------------------------------------------------------
    # Batch finalization
    # ------------------------------------------------------------------

    def _normalize_proposals(
        self, raw: list[dict[str, Any]], request: KnowledgeGraphRequest
    ) -> list[dict[str, Any]]:
        normalized: list[dict[str, Any]] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            concept_id = item.get("conceptId") or (
                request.concept_ids[0] if request.concept_ids else "unknown"
            )
            normalized.append(
                {
                    "proposalId": item.get("proposalId") or _proposal_id(),
                    "conceptId": concept_id,
                    "proposalType": item.get("proposalType") or request.proposal_type,
                    "operation": self._normalize_operation(item, concept_id, request),
                    "rationale": item.get("rationale", ""),
                    "confidenceScore": float(item.get("confidenceScore", 0.5)),
                    "reviewState": _PROPOSAL_REVIEW_STATE,
                    "sourceDocumentIds": item.get("sourceDocumentIds", request.document_ids),
                    "candidateLabel": item.get("candidateLabel"),
                    "metadata": item.get("metadata", {}),
                }
            )
        return normalized

    # ------------------------------------------------------------------
    # Generic fallback (non-anchor proposal types)
    # ------------------------------------------------------------------

    def _fallback_proposal_for_concept(
        self,
        *,
        concept_id: str,
        proposal_type: str,
        candidate_label: str | None,
        domain: str | None,
        context_pack: dict[str, Any],
    ) -> dict[str, Any]:
        label = candidate_label or self._label_from_context(concept_id, context_pack) or concept_id
        rationale = (
            "Deterministic fallback from service context: proposes a reviewed CKG node candidate "
            "because no LLM reasoning has been applied yet."
        )
        if proposal_type in ("prerequisite", "misconception"):
            operation: dict[str, Any] = {
                "type": "add_edge",
                "edgeType": proposal_type,
                "sourceNodeId": "unresolved",
                "targetNodeId": concept_id,
                "weight": 0.0,
                "rationale": "Fallback edge proposal is unresolved and must be normalized by GraphReferenceResolver before submission.",
            }
        else:
            operation = {
                "type": "add_node",
                "nodeType": "notion",
                "label": label,
                "description": f"Candidate canonical concept proposed from learner and graph evidence for {label}.",
                "domain": domain or "general",
                "properties": {
                    "source": "knowledge-graph-agent",
                    "proposalType": proposal_type,
                    "subjectConceptId": concept_id,
                },
            }
        return {
            "proposalId": _proposal_id(),
            "conceptId": concept_id,
            "proposalType": proposal_type,
            "operation": operation,
            "rationale": rationale,
            "confidenceScore": 0.0,
            "reviewState": _PROPOSAL_REVIEW_STATE,
            "sourceDocumentIds": [],
            "candidateLabel": candidate_label,
            "metadata": {"fallback": True},
        }

    def _normalize_operation(  # noqa: PLR0911
        self, item: dict[str, Any], concept_id: str, request: KnowledgeGraphRequest
    ) -> dict[str, Any]:
        proposal_type = item.get("proposalType") or request.proposal_type
        operation = item.get("operation")
        if isinstance(operation, dict) and operation.get("type") in {
            "add_node", "remove_node", "update_node",
            "add_edge", "remove_edge", "merge_nodes", "split_node",
        }:
            if operation.get("type") == "add_node" and _is_edge_like_proposal_type(proposal_type):
                pass
            if operation.get("type") == "add_edge":
                operation = dict(operation)
                operation["sourceNodeId"] = (
                    operation.get("sourceNodeId")
                    or operation.get("fromNodeId")
                    or operation.get("sourceLabel")
                    or operation.get("fromLabel")
                    or operation.get("subjectConceptId")
                )
                operation["targetNodeId"] = (
                    operation.get("targetNodeId")
                    or operation.get("toNodeId")
                    or operation.get("targetLabel")
                    or operation.get("toLabel")
                    or operation.get("targetConceptId")
                )
                if not operation.get("sourceNodeId") or not operation.get("targetNodeId"):
                    inferred = self._infer_review_operation(
                        item=item,
                        concept_id=concept_id,
                        subject_label=self._label_from_context(concept_id, request.context_pack)
                        or (request.concept_ids[0] if request.concept_ids else concept_id),
                        request=request,
                        proposal_type="STRUCTURAL",
                    )
                    if inferred is not None:
                        return inferred
                operation["edgeType"] = _normalize_edge_type(
                    operation.get("edgeType") or operation.get("relationKind")
                )
                operation.setdefault("weight", item.get("confidenceScore", 0.5))
                operation.setdefault("rationale", item.get("rationale") or "Knowledge graph agent edge proposal.")
                operation.pop("fromNodeId", None)
                operation.pop("toNodeId", None)
                return operation
            if not (operation.get("type") == "add_node" and _is_edge_like_proposal_type(proposal_type)):
                return operation
        candidate_label = item.get("candidateLabel")
        operation_label = operation.get("label") if isinstance(operation, dict) else None
        label = (
            candidate_label
            if isinstance(candidate_label, str) and candidate_label
            else operation_label
            if isinstance(operation_label, str) and operation_label
            else self._label_from_context(concept_id, request.context_pack) or concept_id
        )
        if _is_edge_like_proposal_type(proposal_type):
            inferred = self._infer_review_operation(
                item=item,
                concept_id=concept_id,
                subject_label=label,
                request=request,
                proposal_type="STRUCTURAL",
            )
            if inferred is not None:
                return inferred
        if _is_semantic_proposal_type(proposal_type):
            inferred = self._infer_review_operation(
                item=item,
                concept_id=concept_id,
                subject_label=label,
                request=request,
                proposal_type="SEMANTIC",
            )
            if inferred is not None:
                return inferred
        if proposal_type in ("prerequisite", "misconception"):
            return {
                "type": "add_edge",
                "edgeType": proposal_type,
                "sourceNodeId": item.get("sourceNodeId") or item.get("fromNodeId", "unresolved"),
                "targetNodeId": item.get("targetNodeId") or item.get("toNodeId", concept_id),
                "weight": item.get("weight", item.get("confidenceScore", 0.0)),
                "rationale": item.get("rationale") or "Normalized unresolved edge proposal.",
            }
        return {
            "type": "add_node",
            "nodeType": "notion",
            "label": label,
            "description": f"Candidate canonical concept proposed from agent evidence for {label}.",
            "domain": request.domain or "general",
            "properties": {
                "source": "knowledge-graph-agent",
                "proposalType": proposal_type,
                "subjectConceptId": concept_id,
            },
        }

    def _infer_review_operation(
        self,
        *,
        item: dict[str, Any],
        concept_id: str,
        subject_label: str,
        request: KnowledgeGraphRequest,
        proposal_type: str,
    ) -> dict[str, Any] | None:
        rationale = str(item.get("rationale") or "").strip()
        operation = item.get("operation")
        operation_dict = operation if isinstance(operation, dict) else {}
        target_label = (
            self._label_from_context(concept_id, request.context_pack)
            or (request.concept_ids[0] if request.concept_ids else None)
            or subject_label
        )
        normalized_subject = _canonicalize_label(target_label)
        extracted_label = self._extract_related_label_from_rationale(
            rationale=rationale,
            subject_label=target_label,
        )
        operation_label = operation_dict.get("label")
        if not isinstance(operation_label, str) or operation_label.strip() == "":
            operation_label = item.get("candidateLabel")
        if not isinstance(operation_label, str) or operation_label.strip() == "":
            operation_label = extracted_label
        selected_node_id = next(
            (
                node_id
                for node_id in request.selected_node_ids
                if isinstance(node_id, str) and node_id.strip() != ""
            ),
            None,
        )
        target_reference = (
            selected_node_id
            or self._label_from_context(concept_id, request.context_pack)
            or target_label
        )

        if proposal_type == "SEMANTIC":
            return {
                "type": "update_node",
                "nodeId": target_reference,
                "updates": {
                    "description": rationale
                    or f"Refine the learner-facing description for {subject_label}.",
                },
            }

        if proposal_type == "STRUCTURAL":
            explicit_source = operation_dict.get("sourceNodeId") or operation_dict.get("fromNodeId")
            explicit_target = operation_dict.get("targetNodeId") or operation_dict.get("toNodeId")
            subject_ref = operation_dict.get("subjectConceptId") or item.get("subjectConceptId")
            target_ref = operation_dict.get("targetConceptId") or item.get("targetConceptId")
            source_reference = (
                explicit_source
                or (subject_ref if isinstance(subject_ref, str) and subject_ref.startswith("node_") else None)
                or operation_label
            )
            target_reference = (
                explicit_target
                or (target_ref if isinstance(target_ref, str) and target_ref.strip() != "" else None)
                or target_reference
            )
            if not isinstance(source_reference, str) or source_reference.strip() == "":
                return None
            if not isinstance(target_reference, str) or target_reference.strip() == "":
                return None
            normalized_extracted = _canonicalize_label(source_reference)
            if normalized_extracted not in {"", normalized_subject}:
                edge_type = _normalize_edge_type(
                    operation_dict.get("edgeType") or operation_dict.get("relationKind") or "prerequisite"
                )
                lowered_rationale = rationale.lower()
                if "component of" in lowered_rationale:
                    edge_type = "part_of"
                return {
                    "type": "add_edge",
                    "edgeType": edge_type,
                    "sourceNodeId": source_reference,
                    "targetNodeId": target_reference,
                    "weight": float(item.get("confidenceScore", 0.6)),
                    "properties": {
                        "source": "knowledge-graph-agent",
                        "proposalType": item.get("proposalType") or proposal_type,
                        "subjectConceptId": concept_id,
                        "synthesizedFromReview": True,
                    },
                    "rationale": rationale
                    or f"Connect {source_reference} to {target_label} as a structural relation.",
                }

        return None

    def _extract_related_label_from_rationale(
        self, *, rationale: str, subject_label: str
    ) -> str | None:
        if rationale.strip() == "":
            return None
        patterns = [
            r"\badding\s+([A-Za-z][A-Za-z\s-]{1,80}?)\s+as\s+(?:a|an)\s+prerequisite\b",
            r"\bwithin\s+([A-Za-z][A-Za-z\s-]{1,80}?)\b",
            r"\bcomponent of\s+([A-Za-z][A-Za-z\s-]{1,80}?)\b",
            r"\bgrasp of\s+basic\s+([A-Za-z][A-Za-z\s-]{1,80}?)\s+principles\b",
        ]
        for pattern in patterns:
            match = re.search(pattern, rationale, flags=re.IGNORECASE)
            if match is None:
                continue
            candidate = _title_case_label(match.group(1).strip(" .,:;"))
            if _canonicalize_label(candidate) != _canonicalize_label(subject_label):
                return candidate

        capitalized = re.findall(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b", rationale)
        for candidate in capitalized:
            normalized = _canonicalize_label(candidate)
            if normalized != "" and normalized != _canonicalize_label(subject_label):
                return candidate

        return None

    def _label_from_context(self, concept_id: str, context_pack: dict[str, Any]) -> str | None:
        sections = context_pack.get("sections", [])
        if not isinstance(sections, list):
            return None
        for section in sections:
            if not isinstance(section, dict) or section.get("key") != f"conceptNode:{concept_id}":
                continue
            value = section.get("value")
            if isinstance(value, dict):
                for key in ("label", "name", "title"):
                    label = value.get(key)
                    if isinstance(label, str) and label:
                        return label
                data = value.get("data")
                if isinstance(data, dict):
                    label = data.get("label")
                    if isinstance(label, str) and label:
                        return label
        return None
