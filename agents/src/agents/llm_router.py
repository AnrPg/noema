"""Provider-neutral routing, prompt rendering, and batch enqueue contracts."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol

from .batch_jobs import AgentBatchJob, BatchJobStore, BatchSubmissionEnvelope
from .model_registry import get_agent_model_config, model_provider


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


@dataclass(slots=True)
class ProviderToolDefinition:
    name: str
    description: str
    input_schema: dict[str, Any]
    service: str
    side_effects: bool


@dataclass(slots=True)
class ProviderBatchRequest:
    custom_id: str
    agent_name: str
    provider: str
    model: str
    system_instructions: list[str]
    user_prompt: str
    response_schema_name: str
    response_schema: dict[str, Any]
    metadata: dict[str, Any]
    tools: list[ProviderToolDefinition] = field(default_factory=list)


@dataclass(slots=True)
class ProviderBatchSubmission:
    provider_batch_id: str
    provider_status: str
    raw_response: dict[str, Any]


@dataclass(slots=True)
class ProviderBatchItemResult:
    custom_id: str
    status: str
    output_text: str | None
    output_json: dict[str, Any] | None
    raw_response: dict[str, Any]
    usage: dict[str, Any] | None = None
    error: dict[str, Any] | None = None


@dataclass(slots=True)
class ProviderBatchPollResult:
    provider_batch_id: str
    provider_status: str
    normalized_status: str
    done: bool
    raw_response: dict[str, Any]
    error: dict[str, Any] | None = None


@dataclass(slots=True)
class ProviderBatchResults:
    provider_batch_id: str
    provider_status: str
    items: dict[str, ProviderBatchItemResult]
    raw_response: dict[str, Any]


class BatchProviderAdapter(Protocol):
    provider_name: str

    async def submit_batch(self, requests: list[ProviderBatchRequest]) -> ProviderBatchSubmission: ...

    async def get_batch_status(self, provider_batch_id: str) -> ProviderBatchPollResult: ...

    async def fetch_batch_results(self, provider_batch_id: str) -> ProviderBatchResults: ...

    async def cancel_batch(self, provider_batch_id: str) -> str: ...


class RealtimeProviderAdapter(Protocol):
    provider_name: str

    async def generate(self, request: ProviderBatchRequest) -> ProviderBatchItemResult: ...


def response_schema_for_wrapper(wrapper: Any) -> tuple[str, dict[str, Any]]:
    if wrapper.execution_mode == "content_transform":
        return (
            "content_transform_result",
            {
                "type": "object",
                "additionalProperties": False,
                "required": ["cards"],
                "properties": {
                    "cards": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                            "type": "object",
                            "additionalProperties": True,
                            "required": [
                                "cardType",
                                "content",
                                "conceptIds",
                                "anchoredCkgNodeIds",
                                "anchoredPkgNodeIds",
                                "tags",
                                "difficulty",
                                "factualityScore",
                                "rationale",
                            ],
                            "properties": {
                                "cardType": {"type": "string"},
                                "parentCardId": {"type": "string"},
                                "transformationKind": {"type": "string"},
                                "conceptIds": {"type": "array", "items": {"type": "string"}},
                                "relatedConceptIds": {"type": "array", "items": {"type": "string"}},
                                "anchoredCkgNodeIds": {"type": "array", "items": {"type": "string"}},
                                "anchoredPkgNodeIds": {"type": "array", "items": {"type": "string"}},
                                "sourceDocumentIds": {"type": "array", "items": {"type": "string"}},
                                "sources": {"type": "array", "items": {"type": "object", "additionalProperties": True}},
                                "content": {
                                    "type": "object",
                                    "additionalProperties": True,
                                    "required": ["front", "back"],
                                    "properties": {
                                        "front": {"type": "string"},
                                        "back": {"type": "string"},
                                    },
                                },
                                "tags": {"type": "array", "items": {"type": "string"}},
                                "difficulty": {"type": "string"},
                                "factualityScore": {"type": "number"},
                                "rationale": {"type": "string"},
                                "metadata": {"type": "object", "additionalProperties": True},
                            },
                        },
                    },
                    "notes": {"type": "string"},
                },
            },
        )
    if wrapper.execution_mode == "ingestion_concept_extraction":
        return (
            "ingestion_concept_extraction_result",
            {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "documentSummary",
                    "sectionSummaries",
                    "conceptCandidates",
                    "mappingSuggestions",
                    "handoffRecommendations",
                    "groundingReport",
                ],
                "properties": {
                    "documentSummary": {"type": "object", "additionalProperties": True},
                    "sectionSummaries": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["sectionPath", "summary"],
                            "properties": {
                                "sectionPath": {"type": "array", "items": {"type": "string"}},
                                "summary": {"type": "string"},
                            },
                        },
                    },
                    "conceptCandidates": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": True,
                            "required": [
                                "label",
                                "definition",
                                "evidenceChunkIds",
                                "salience",
                                "confidence",
                                "state",
                                "rationale",
                            ],
                            "properties": {
                                "label": {"type": "string"},
                                "definition": {"type": "string"},
                                "evidenceChunkIds": {"type": "array", "items": {"type": "string"}},
                                "salience": {"type": "number"},
                                "confidence": {"type": "number"},
                                "state": {"type": "string"},
                                "rationale": {"type": "string"},
                            },
                        },
                    },
                    "mappingSuggestions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": True,
                            "required": [
                                "label",
                                "candidateNodeIds",
                                "decision",
                                "confidence",
                                "reason",
                                "requiresUserApproval",
                            ],
                            "properties": {
                                "label": {"type": "string"},
                                "candidateNodeIds": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                                "decision": {"type": "string"},
                                "confidence": {"type": "number"},
                                "reason": {"type": "string"},
                                "requiresUserApproval": {"type": "boolean"},
                            },
                        },
                    },
                    "handoffRecommendations": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": True,
                            "required": ["target", "allowed", "reason", "payload"],
                            "properties": {
                                "target": {"type": "string"},
                                "allowed": {"type": "boolean"},
                                "reason": {"type": "string"},
                                "payload": {"type": "object", "additionalProperties": True},
                            },
                        },
                    },
                    "parseWarnings": {
                        "type": "array",
                        "items": {"type": "object", "additionalProperties": True},
                    },
                    "groundingReport": {"type": "object", "additionalProperties": True},
                },
            },
        )
    if wrapper.execution_mode in ("content_creation_orchestrator", "content_creator"):
        return (
            "content_creator_result",
            {
                "type": "object",
                "additionalProperties": False,
                "required": ["cards", "activityVariants", "groundingReport", "coveragePlan"],
                "properties": {
                    "cards": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": True,
                            "required": [
                                "cardType",
                                "originMode",
                                "anchoredCkgNodeIds",
                                "conceptIds",
                                "sourceDocumentIds",
                                "sources",
                                "factualityScore",
                                "content",
                                "tags",
                                "difficulty",
                                "rationale",
                            ],
                            "properties": {
                                "cardType": {"type": "string"},
                                "originMode": {"type": "string"},
                                "anchoredCkgNodeIds": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                                "conceptIds": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                                "sourceDocumentIds": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                                "sources": {
                                    "type": "array",
                                    "items": {"type": "object", "additionalProperties": True},
                                },
                                "factualityScore": {"type": "number"},
                                "content": {
                                    "type": "object",
                                    "additionalProperties": True,
                                    "required": ["front", "back"],
                                    "properties": {
                                        "front": {"type": "string"},
                                        "back": {"type": "string"},
                                    },
                                },
                                "tags": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                                "difficulty": {"type": "string"},
                                "rationale": {"type": "string"},
                            },
                        },
                    },
                    "activityVariants": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": True,
                            "required": [
                                "conceptId",
                                "studyMode",
                                "transformationType",
                                "epistemicMode",
                                "difficultyBucket",
                                "prompt",
                                "expectedResponseType",
                                "responseSchema",
                                "renderPayload",
                                "variantSeed",
                                "rationale",
                            ],
                            "properties": {
                                "conceptId": {"type": "string"},
                                "studyMode": {"type": "string"},
                                "transformationType": {"type": "string"},
                                "epistemicMode": {"type": "string"},
                                "difficultyBucket": {"type": "integer"},
                                "sourceCardIds": {"type": "array", "items": {"type": "string"}},
                                "prompt": {"type": "string"},
                                "renderPayload": {"type": "object", "additionalProperties": True},
                                "expectedResponseType": {"type": "string"},
                                "responseSchema": {"type": "object", "additionalProperties": True},
                                "variantSeed": {"type": "string"},
                                "generatorMetadata": {"type": "object", "additionalProperties": True},
                                "ttlAt": {"type": "string"},
                                "rationale": {"type": "string"},
                            },
                        },
                    },
                    "groundingReport": {"type": "object", "additionalProperties": True},
                    "coveragePlan": {"type": "object", "additionalProperties": True},
                    "notes": {"type": "string"},
                },
            },
        )
    if wrapper.execution_mode == "graph_proposal":
        return (
            "graph_proposal_result",
            {
                "type": "object",
                "additionalProperties": False,
                "required": ["proposals"],
                "properties": {
                    "proposals": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": True,
                            "required": ["conceptId", "proposalType", "operation", "rationale"],
                            "properties": {
                                "conceptId": {"type": "string"},
                                "proposalType": {"type": "string"},
                                "operation": {
                                    "type": "object",
                                    "additionalProperties": True,
                                    "required": ["type"],
                                    "properties": {
                                        "type": {"type": "string"},
                                        "subjectConceptId": {"type": "string"},
                                        "targetConceptId": {"type": "string"},
                                        "candidateLabel": {"type": "string"},
                                        "relationKind": {"type": "string"},
                                    },
                                },
                                "rationale": {"type": "string"},
                                "confidenceScore": {"type": "number"},
                                "candidateLabel": {"type": "string"},
                                "sourceDocumentIds": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                                "metadata": {
                                    "type": "object",
                                    "additionalProperties": True,
                                },
                            },
                        },
                    },
                    "notes": {"type": "string"},
                },
            },
        )
    if wrapper.execution_mode == "curriculum_outline":
        return (
            "curriculum_outline_result",
            {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "goal",
                    "goalSummary",
                    "candidateConcepts",
                    "candidateGroups",
                    "ambiguityNotes",
                    "prerequisiteThemes",
                    "provisionalOutline",
                    "readiness",
                    "rationale",
                ],
                "properties": {
                    "goal": {"type": "string"},
                    "goalSummary": {"type": "string"},
                    "candidateConcepts": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": [
                                "label",
                                "whySuggested",
                                "confidenceLabel",
                                "clusterLabel",
                                "requiresProvisionalPkgCreation",
                            ],
                            "properties": {
                                "label": {"type": "string"},
                                "whySuggested": {"type": "string"},
                                "confidenceLabel": {"type": "string"},
                                "confidenceScore": {"type": "number"},
                                "clusterLabel": {"type": "string"},
                                "suggestedDomain": {"type": "string"},
                                "source": {"type": "string"},
                                "requiresProvisionalPkgCreation": {"type": "boolean"},
                                "matchedConceptId": {"type": "string"},
                                "matchedGraphSource": {"type": "string"},
                            },
                        },
                    },
                    "candidateGroups": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["label", "conceptLabels"],
                            "properties": {
                                "label": {"type": "string"},
                                "conceptLabels": {"type": "array", "items": {"type": "string"}},
                            },
                        },
                    },
                    "ambiguityNotes": {"type": "array", "items": {"type": "string"}},
                    "prerequisiteThemes": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["label", "whyItMatters"],
                            "properties": {
                                "label": {"type": "string"},
                                "whyItMatters": {"type": "string"},
                            },
                        },
                    },
                    "provisionalOutline": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["title", "reason", "conceptLabels"],
                            "properties": {
                                "title": {"type": "string"},
                                "reason": {"type": "string"},
                                "conceptLabels": {"type": "array", "items": {"type": "string"}},
                            },
                        },
                    },
                    "readiness": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": [
                            "isReadyForConceptApproval",
                            "requiresLearnerConfirmation",
                            "blockingIssues",
                        ],
                        "properties": {
                            "isReadyForConceptApproval": {"type": "boolean"},
                            "requiresLearnerConfirmation": {"type": "boolean"},
                            "blockingIssues": {"type": "array", "items": {"type": "string"}},
                        },
                    },
                    "rationale": {"type": "string"},
                    "title": {"type": "string"},
                    "summary": {"type": "string"},
                },
            },
        )
    if wrapper.execution_mode == "curriculum_draft":
        return (
            "curriculum_draft_result",
            {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "goal",
                    "nodes",
                    "edges",
                    "rationale",
                    "pathExplanation",
                    "branchDecisionPoints",
                    "learnerModelSummary",
                    "planningSignalsUsed",
                ],
                "properties": {
                    "goal": {"type": "string"},
                    "curriculumVersionId": {"type": "string"},
                    "nodes": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": [
                                "label",
                                "stableNodeKey",
                                "estimatedSessions",
                                "traversalWeight",
                                "branchInfo",
                            ],
                            "anyOf": [
                                {"required": ["ckgConceptId"]},
                                {"required": ["proposedConcept"]},
                            ],
                            "properties": {
                                "id": {"type": "string"},
                                "ckgConceptId": {"type": "string"},
                                "proposedConcept": {
                                    "type": "object",
                                    "additionalProperties": True,
                                    "required": ["label"],
                                    "properties": {
                                        "label": {"type": "string"},
                                        "sourceDocumentIds": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                        },
                                    },
                                },
                                "label": {"type": "string"},
                                "stableNodeKey": {"type": "string"},
                                "stabilityThreshold": {"type": "number"},
                                "estimatedSessions": {"type": "integer"},
                                "traversalWeight": {"type": "integer"},
                                "branchInfo": {
                                    "type": "object",
                                    "additionalProperties": False,
                                    "required": ["pathRole", "isMainPath"],
                                    "properties": {
                                        "pathRole": {"type": "string"},
                                        "isMainPath": {"type": "boolean"},
                                        "branchGroupKey": {"type": "string"},
                                        "branchEntryStrategy": {"type": "string"},
                                        "branchExitTargets": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                        },
                                        "focusTags": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                        },
                                    },
                                },
                                "metadata": {
                                    "type": "object",
                                    "additionalProperties": True,
                                },
                            },
                        },
                    },
                    "edges": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["fromNodeId", "toNodeId", "type"],
                            "properties": {
                                "id": {"type": "string"},
                                "fromNodeId": {"type": "string"},
                                "toNodeId": {"type": "string"},
                                "type": {
                                    "type": "string",
                                    "enum": [
                                        "prerequisite",
                                        "recommended_before",
                                        "reinforces",
                                        "branch_option",
                                        "diversion_to",
                                    ],
                                },
                                "orderingWeight": {"type": "integer"},
                            },
                        },
                    },
                    "rationale": {"type": "string"},
                    "pathExplanation": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["mainPath"],
                        "properties": {
                            "mainPath": {"type": "string"},
                            "focusBranches": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                            "diversions": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                        },
                    },
                    "branchDecisionPoints": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["branchGroupKey", "reason"],
                            "properties": {
                                "branchGroupKey": {"type": "string"},
                                "reason": {"type": "string"},
                                "recommendedPathRole": {"type": "string"},
                            },
                        },
                    },
                    "learnerModelSummary": {
                        "type": "object",
                        "additionalProperties": True,
                    },
                    "planningSignalsUsed": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
            },
        )
    if wrapper.execution_mode == "curriculum_revision":
        return (
            "curriculum_revision_result",
            {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "curriculumId",
                    "curriculumVersionId",
                    "revisionReason",
                    "rationale",
                    "changeStrategySummary",
                    "changes",
                ],
                "properties": {
                    "curriculumId": {"type": "string"},
                    "curriculumVersionId": {"type": "string"},
                    "revisionReason": {"type": "string"},
                    "rationale": {"type": "string"},
                    "changeStrategySummary": {
                        "type": "object",
                        "additionalProperties": True,
                    },
                    "changes": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["kind", "payload", "rationale", "expectedEffect", "riskLevel"],
                            "properties": {
                                "kind": {
                                    "type": "string",
                                    "enum": [
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
                                    ],
                                },
                                "payload": {
                                    "type": "object",
                                    "additionalProperties": True,
                                },
                                "rationale": {"type": "string"},
                                "expectedEffect": {"type": "string"},
                                "riskLevel": {
                                    "type": "string",
                                    "enum": ["low", "medium", "high"],
                                },
                            },
                        },
                    },
                    "nodes": {
                        "type": "array",
                        "items": {"type": "object", "additionalProperties": True},
                    },
                    "edges": {
                        "type": "array",
                        "items": {"type": "object", "additionalProperties": True},
                    },
                    "changeCount": {"type": "integer"},
                    "revisedNodeCount": {"type": "integer"},
                    "revisedEdgeCount": {"type": "integer"},
                },
            },
        )
    if wrapper.execution_mode == "lesson_plan":
        return (
            "lesson_plan_result",
            {
                "type": "object",
                "additionalProperties": True,
                "required": [
                    "topic",
                    "goals",
                    "steps",
                    "assessmentStrategy",
                    "adaptationRules",
                    "learnerFacingSummary",
                    "groundingReport",
                ],
                "properties": {
                    "topic": {"type": "string"},
                    "selectedNodeIds": {"type": "array", "items": {"type": "string"}},
                    "conceptRefs": {"type": "array", "items": {"type": "string"}},
                    "rigorLevel": {"type": "string"},
                    "goals": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": True,
                            "required": ["description", "type", "source", "conceptRefs"],
                            "properties": {
                                "description": {"type": "string"},
                                "title": {"type": "string"},
                                "type": {"type": "string"},
                                "source": {"type": "string"},
                                "conceptRefs": {"type": "array", "items": {"type": "string"}},
                                "targetNodeIds": {"type": "array", "items": {"type": "string"}},
                            },
                        },
                    },
                    "steps": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": True,
                            "required": ["objective", "expectedOutcome", "conceptRefs", "activities"],
                            "properties": {
                                "ordinal": {"type": "integer"},
                                "objective": {"type": "string"},
                                "servesGoalIds": {"type": "array", "items": {"type": "string"}},
                                "eligibleModes": {"type": "array", "items": {"type": "string"}},
                                "selectedMode": {"type": "string"},
                                "transformationType": {"type": "string"},
                                "expectedOutcome": {"type": "string"},
                                "evaluationType": {"type": "string"},
                                "difficulty": {"type": "number"},
                                "isRepair": {"type": "boolean"},
                                "conceptRefs": {"type": "array", "items": {"type": "string"}},
                                "targetNodeIds": {"type": "array", "items": {"type": "string"}},
                                "variantSeed": {"type": "string"},
                                "activity": {"type": "object", "additionalProperties": True},
                                "activities": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "additionalProperties": True,
                                        "required": ["contentSourceType", "prompt"],
                                        "properties": {
                                            "contentSourceType": {"type": "string"},
                                            "cardId": {"type": "string"},
                                            "templateId": {"type": "string"},
                                            "generatedVariantId": {"type": "string"},
                                            "prompt": {"type": "string"},
                                            "renderPayload": {
                                                "type": "object",
                                                "additionalProperties": True,
                                            },
                                            "expectedResponseType": {"type": "string"},
                                            "responseSchema": {
                                                "type": "object",
                                                "additionalProperties": True,
                                            },
                                            "variantSeed": {"type": "string"},
                                            "generationFallbackReason": {"type": "string"},
                                        },
                                    },
                                },
                            },
                        },
                    },
                    "assessmentStrategy": {"type": "string"},
                    "adaptationRules": {"type": "string"},
                    "rationale": {"type": "string"},
                    "learnerFacingSummary": {"type": "string"},
                    "friendlyWhy": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "technicalProvenance": {
                        "type": "object",
                        "additionalProperties": True,
                    },
                    "groundingReport": {
                        "type": "object",
                        "additionalProperties": True,
                    },
                    "repairResponse": {
                        "type": "object",
                        "additionalProperties": True,
                    },
                },
            },
        )
    if wrapper.execution_mode == "calibration_coach":
        return (
            "calibration_coaching_result",
            {
                "type": "object",
                "additionalProperties": False,
                "required": ["summary", "learnerFacingText", "highlights", "recommendations", "confidence"],
                "properties": {
                    "state": {"type": "string"},
                    "pattern": {"type": "string"},
                    "summary": {"type": "string"},
                    "learnerFacingText": {"type": "string"},
                    "highlights": {"type": "array", "items": {"type": "string"}},
                    "recommendations": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["title", "detail"],
                            "properties": {
                                "title": {"type": "string"},
                                "detail": {"type": "string"},
                            },
                        },
                    },
                    "confidence": {"type": "string"},
                },
            },
        )
    if wrapper.execution_mode == "mental_debugger":
        return (
            "mental_debugger_result",
            {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "summary",
                    "learnerFacingText",
                    "whatWorked",
                    "whereItSlipped",
                    "repairRecommendation",
                    "confidence",
                ],
                "properties": {
                    "state": {"type": "string"},
                    "pattern": {"type": "string"},
                    "summary": {"type": "string"},
                    "learnerFacingText": {"type": "string"},
                    "whatWorked": {"type": "string"},
                    "whereItSlipped": {"type": "string"},
                    "repairRecommendation": {"type": "string"},
                    "uncertainty": {"type": "string"},
                    "handoffs": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["target", "reason"],
                            "properties": {
                                "target": {"type": "string"},
                                "reason": {"type": "string"},
                            },
                        },
                    },
                    "confidence": {"type": "string"},
                },
            },
        )
    if wrapper.execution_mode == "patch_planner":
        return (
            "patch_planner_result",
            {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "scope",
                    "repairType",
                    "learnerFacingText",
                    "friendlyWhy",
                    "proposals",
                ],
                "properties": {
                    "state": {"type": "string"},
                    "scope": {"type": "string"},
                    "repairType": {"type": "string"},
                    "statusLabel": {"type": "string"},
                    "learnerFacingText": {"type": "string"},
                    "friendlyWhy": {"type": "string"},
                    "expectedEffort": {"type": "string"},
                    "proposals": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": True,
                            "required": ["kind", "ownerService", "state"],
                            "properties": {
                                "kind": {"type": "string"},
                                "ownerService": {"type": "string"},
                                "payload": {"type": "object", "additionalProperties": True},
                                "state": {"type": "string"},
                            },
                        },
                    },
                },
            },
        )
    if wrapper.execution_mode == "strategy_replanning":
        return (
            "strategy_replanning_result",
            {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "scope",
                    "interventionType",
                    "statusLabel",
                    "learnerFacingNotice",
                    "friendlyWhy",
                    "changes",
                ],
                "properties": {
                    "state": {"type": "string"},
                    "scope": {"type": "string"},
                    "interventionType": {"type": "string"},
                    "statusLabel": {"type": "string"},
                    "learnerFacingNotice": {"type": "string"},
                    "friendlyWhy": {"type": "string"},
                    "impactSummary": {"type": "string"},
                    "changes": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": True,
                            "required": ["kind", "ownerService", "state"],
                            "properties": {
                                "kind": {"type": "string"},
                                "ownerService": {"type": "string"},
                                "targetStepId": {"type": "string"},
                                "supersedesEvaluatedSteps": {"type": "boolean"},
                                "payload": {"type": "object", "additionalProperties": True},
                                "state": {"type": "string"},
                            },
                        },
                    },
                },
            },
        )
    if wrapper.execution_mode == "cognitive_copilot":
        return (
            "cognitive_copilot_result",
            {
                "type": "object",
                "additionalProperties": False,
                "required": ["summary", "hintGroups", "mirrorStatements", "suggestedActions"],
                "properties": {
                    "state": {"type": "string"},
                    "statusLabel": {"type": "string"},
                    "summary": {"type": "string"},
                    "hintGroups": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["category", "title", "summary", "source", "priority"],
                            "properties": {
                                "category": {"type": "string"},
                                "title": {"type": "string"},
                                "summary": {"type": "string"},
                                "source": {"type": "string"},
                                "priority": {"type": "string"},
                            },
                        },
                    },
                    "mirrorStatements": {"type": "array", "items": {"type": "string"}},
                    "suggestedActions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["label", "targetSurface", "ownerService"],
                            "properties": {
                                "label": {"type": "string"},
                                "targetSurface": {"type": "string"},
                                "ownerService": {"type": "string"},
                            },
                        },
                    },
                },
            },
        )
    if wrapper.execution_mode == "watchtower_governance":
        return (
            "watchtower_governance_result",
            {
                "type": "object",
                "additionalProperties": False,
                "required": ["state", "statusLabel", "friendlyWhy", "domains", "visibilityDecision"],
                "properties": {
                    "state": {"type": "string"},
                    "statusLabel": {"type": "string"},
                    "friendlyWhy": {"type": "string"},
                    "domains": {"type": "array", "items": {"type": "string"}},
                    "visibilityDecision": {"type": "string"},
                    "privacyClass": {"type": "string"},
                    "requiresReview": {"type": "boolean"},
                    "auditRequired": {"type": "boolean"},
                    "escalationRoute": {"type": "string"},
                },
            },
        )
    if wrapper.execution_mode == "mode_preference":
        return (
            "mode_preference_result",
            {
                "type": "object",
                "additionalProperties": False,
                "required": ["state", "selectedMode", "statusLabel", "friendlyWhy", "rationale"],
                "properties": {
                    "state": {"type": "string"},
                    "selectedMode": {"type": "string"},
                    "statusLabel": {"type": "string"},
                    "friendlyWhy": {"type": "string"},
                    "rationale": {"type": "string"},
                    "avoidedModes": {"type": "array", "items": {"type": "string"}},
                    "uncertainty": {"type": "string"},
                },
            },
        )
    if wrapper.execution_mode == "taxonomy_curator":
        return (
            "taxonomy_curator_result",
            {
                "type": "object",
                "additionalProperties": False,
                "required": ["state", "statusLabel", "friendlyWhy", "proposal", "impactSummary"],
                "properties": {
                    "state": {"type": "string"},
                    "statusLabel": {"type": "string"},
                    "friendlyWhy": {"type": "string"},
                    "proposal": {
                        "type": "object",
                        "additionalProperties": True,
                        "required": ["changeType", "ownerService", "summary", "migrationGuidance"],
                        "properties": {
                            "changeType": {"type": "string"},
                            "ownerService": {"type": "string"},
                            "labelIds": {"type": "array", "items": {"type": "string"}},
                            "summary": {"type": "string"},
                            "migrationGuidance": {"type": "string"},
                        },
                    },
                    "impactSummary": {"type": "object", "additionalProperties": True},
                },
            },
        )
    if wrapper.execution_mode == "pedagogy_guardian":
        return (
            "guardian_validation_result",
            {
                "type": "object",
                "additionalProperties": True,
                "required": ["artifact"],
                "properties": {
                    "artifact": {"type": "object", "additionalProperties": True},
                    "notes": {"type": "string"},
                },
            },
        )
    return (
        "preview_result",
        {
            "type": "object",
            "additionalProperties": False,
            "required": ["summary", "highlights", "recommendations"],
            "properties": {
                "summary": {"type": "string"},
                "highlights": {"type": "array", "items": {"type": "string"}},
                "recommendations": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["title", "detail"],
                        "properties": {
                            "title": {"type": "string"},
                            "detail": {"type": "string"},
                        },
                    },
                },
                "confidence": {"type": "string"},
            },
        },
    )


def tool_definitions_for_belt(
    *,
    tool_belt: Any,
    available_tools: list[dict[str, Any]],
) -> list[ProviderToolDefinition]:
    allowed = set(getattr(tool_belt, "read_tools", [])) | set(getattr(tool_belt, "write_tools", []))
    forbidden = set(getattr(tool_belt, "forbidden_tools", []))
    definitions: list[ProviderToolDefinition] = []
    for tool in available_tools:
        name = tool.get("name")
        service = tool.get("service")
        if not isinstance(name, str) or not isinstance(service, str):
            continue
        qualified = f"{service.replace('-service', '')}.{name}"
        if qualified not in allowed or qualified in forbidden:
            continue
        capabilities = tool.get("capabilities", {})
        definitions.append(
            ProviderToolDefinition(
                name=name,
                description=str(tool.get("description", "")),
                input_schema=tool.get("inputSchema") if isinstance(tool.get("inputSchema"), dict) else {},
                service=service,
                side_effects=bool(capabilities.get("sideEffects")) if isinstance(capabilities, dict) else False,
            )
        )
    return definitions


def build_user_prompt(
    *,
    wrapper: Any,
    request_payload: dict[str, Any],
    context_pack: dict[str, Any] | None,
    prompt: Any | None,
) -> str:
    response_schema_name, response_schema = response_schema_for_wrapper(wrapper)
    instructions = {
        "agent": wrapper.name,
        "purpose": wrapper.purpose,
        "outputKind": wrapper.output_kind,
        "responseSchemaName": response_schema_name,
        "responseSchema": response_schema,
        "requirements": [
            "Return valid JSON only.",
            "Do not wrap the JSON in markdown fences.",
            "Use the provided context pack as factual grounding.",
            "Preserve selected concept and node identifiers where relevant.",
            "When uncertain, state uncertainty inside the JSON fields instead of inventing facts.",
        ],
    }
    body = {
        "instructions": instructions,
        "request": request_payload,
        "contextPack": context_pack or {},
        "promptSlots": None if prompt is None else getattr(prompt, "slots", None),
    }
    return json.dumps(body, ensure_ascii=True, sort_keys=True)


def build_provider_request(
    *,
    job: AgentBatchJob,
    wrapper: Any,
) -> ProviderBatchRequest:
    prompt_payload = job.prompt_json or {}
    prompt = _PromptEnvelopeLike(prompt_payload) if prompt_payload else None
    schema_name, schema = response_schema_for_wrapper(wrapper)
    tools = [
        ProviderToolDefinition(
            name=str(item.get("name", "")),
            description=str(item.get("description", "")),
            input_schema=item.get("inputSchema") if isinstance(item.get("inputSchema"), dict) else {},
            service=str(item.get("service", "")),
            side_effects=bool(item.get("sideEffects", False)),
        )
        for item in (prompt.slots.get("providerTools", []) if prompt is not None else [])
        if isinstance(item, dict)
    ]
    return ProviderBatchRequest(
        custom_id=job.job_id,
        agent_name=job.agent_name,
        provider=job.provider,
        model=job.model,
        system_instructions=[] if prompt is None else prompt.system_instructions,
        user_prompt=build_user_prompt(
            wrapper=wrapper,
            request_payload=job.request_json,
            context_pack=job.context_pack_json,
            prompt=prompt,
        ),
        response_schema_name=schema_name,
        response_schema=schema,
        metadata={
            "jobId": job.job_id,
            "runId": job.run_id,
            "agentName": job.agent_name,
            "occurredAt": _now_iso(),
            "fallbackModel": str(get_agent_model_config(job.agent_name).fallback),
            "fallbackProvider": model_provider(str(get_agent_model_config(job.agent_name).fallback)),
            "structuredToolsSupported": len(tools) > 0,
            "toolCount": len(tools),
        },
        tools=tools,
    )


class LLMRouter:
    """Resolves providers and creates durable batch queue records."""

    def __init__(
        self,
        *,
        batch_store: BatchJobStore,
        batch_adapters: dict[str, BatchProviderAdapter],
        realtime_adapters: dict[str, RealtimeProviderAdapter] | None = None,
    ) -> None:
        self._batch_store = batch_store
        self._batch_adapters = batch_adapters
        self._realtime_adapters = realtime_adapters or {}

    def get_batch_adapter(self, provider: str) -> BatchProviderAdapter:
        if provider not in self._batch_adapters:
            raise ValueError(f"No batch provider adapter registered for provider '{provider}'")
        return self._batch_adapters[provider]

    def get_realtime_adapter(self, provider: str) -> RealtimeProviderAdapter:
        if provider not in self._realtime_adapters:
            raise ValueError(f"No realtime provider adapter registered for provider '{provider}'")
        return self._realtime_adapters[provider]

    async def enqueue_batch_run(
        self,
        *,
        wrapper: Any,
        request: Any,
        run_id: str,
        execution_plan: Any,
        context_pack: dict[str, Any] | None,
        prompt: Any | None,
    ) -> BatchSubmissionEnvelope:
        request_payload = request.model_dump(by_alias=True)
        queued_event_payload = {
            "jobId": None,
            "runId": run_id,
            "agentName": wrapper.name,
            "provider": wrapper.provider,
            "model": wrapper.model,
            "strategy": execution_plan.strategy,
            "status": "queued",
            "providerBatchId": None,
            "correlationId": run_id,
            "resultRef": None,
            "error": None,
            "occurredAt": _now_iso(),
        }
        job = await self._batch_store.enqueue_job(
            run_id=run_id,
            agent_name=wrapper.name,
            provider=wrapper.provider or "unknown",
            model=wrapper.model or "",
            execution_strategy=str(execution_plan.strategy),
            request_json=request_payload,
            context_pack_json=context_pack,
            prompt_json=None if prompt is None else prompt.model_dump(by_alias=True),
            queued_event_payload=queued_event_payload,
        )
        return BatchSubmissionEnvelope(
            run_id=run_id,
            job_id=job.job_id,
            agent={
                "name": wrapper.name,
                "family": wrapper.family,
                "purpose": wrapper.purpose,
                "executionMode": wrapper.execution_mode,
            },
            execution_plan=execution_plan.model_dump(by_alias=True),
            status=job.status,
            provider=job.provider,
            model=job.model,
            provider_batch_id=job.provider_batch_id,
            poll_after_seconds=30,
        )


@dataclass(slots=True)
class _PromptEnvelopeLike:
    payload: dict[str, Any]

    @property
    def system_instructions(self) -> list[str]:
        value = self.payload.get("systemInstructions", [])
        return value if isinstance(value, list) else []

    @property
    def slots(self) -> dict[str, Any]:
        value = self.payload.get("slots", {})
        return value if isinstance(value, dict) else {}
