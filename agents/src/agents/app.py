"""HTTP entrypoint for Batch 11 curriculum and content agents."""

from __future__ import annotations

import os
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .content_generator import (
    CardTransformRequest,
    ContentGenerationAgent,
    ContentGenerationRequest,
)
from .guardian_client import GuardianClient
from .lesson_planner import LessonPlanGenerator, LessonPlanRequest


class ContentGenerateEnvelope(BaseModel):
    job: dict[str, Any]


class ContentTransformEnvelope(BaseModel):
    parent_card_id: str | None = Field(default=None, alias="parentCardId")
    prompt: str | None = None
    transformation_kind: str = Field(default="recall", alias="transformationKind")
    target_card_type: str | None = Field(default=None, alias="targetCardType")
    card: dict[str, Any] = Field(default_factory=dict)


class CurriculumDraftEnvelope(BaseModel):
    goal: str | None = None
    concept_ids: list[str] = Field(default_factory=list, alias="conceptIds")


app = FastAPI(title="Noema Agents", version="0.1.0")


def guardian() -> GuardianClient:
    return GuardianClient(
        os.getenv("PEDAGOGY_GUARDIAN_SERVICE_URL", "http://localhost:3016"),
        os.getenv("SERVICE_AUTH_TOKEN"),
    )


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/content/generate")
async def generate_content(
    envelope: ContentGenerateEnvelope,
    x_user_id: str = Header(default="user_devuser00000000000000"),
) -> dict[str, Any]:
    job = envelope.job
    request = ContentGenerationRequest.model_validate(
        {
            "mode": job.get("mode", "agent_autonomous"),
            "conceptIds": job.get("conceptIds", []),
            "documentIds": job.get("documentIds", []),
            "desiredCardTypes": job.get("requestedCardTypes", []),
            "curriculumContext": job.get("requestPayload", {}).get("curriculumContext", {}),
            "studentContext": {"userId": x_user_id},
            "budget": job.get("requestPayload", {}).get("budget", {}),
        }
    )
    result = await ContentGenerationAgent(guardian()).generate(request)
    return {
        "data": {
            "agentRunId": result["agentRunId"],
            "drafts": result["cards"],
            "rejectedDrafts": result["rejectedDrafts"],
        }
    }


@app.post("/v1/content/transform")
async def transform_content(envelope: ContentTransformEnvelope) -> dict[str, Any]:
    request = CardTransformRequest.model_validate(
        {
            "card": envelope.card or {"content": {}},
            "transformationKind": envelope.transformation_kind,
            "prompt": envelope.prompt,
        }
    )
    result = await ContentGenerationAgent(guardian()).transform(request)
    return {
        "data": {
            "agentRunId": result["agentRunId"],
            "draft": {
                **result["card"],
                "parentCardId": envelope.parent_card_id,
                "conceptIds": result["card"].get("conceptIds", []),
                "factualityScore": result["card"].get("factualityScore", 1.0),
            },
        }
    }


@app.post("/v1/lesson-plans/generate")
async def generate_lesson_plan(request: LessonPlanRequest) -> dict[str, Any]:
    try:
        return {"data": await LessonPlanGenerator(guardian()).generate(request)}
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/v1/curriculum/generate-draft")
async def generate_curriculum_draft(envelope: CurriculumDraftEnvelope) -> dict[str, Any]:
    concept_ids = envelope.concept_ids or ["concept_seed"]
    version_id = "cver_agent_draft"
    nodes = [
        {
            "id": f"cnode_{index}",
            "curriculumVersionId": version_id,
            "stableNodeKey": f"node_{concept_id}",
            "ckgConceptId": concept_id,
            "label": concept_id,
            "masteryThreshold": 0.8,
            "estimatedSessions": 1,
            "traversalWeight": index + 1,
            "metadata": {"goal": envelope.goal},
        }
        for index, concept_id in enumerate(concept_ids)
    ]
    edges = [
        {
            "id": f"cedge_{index}",
            "curriculumVersionId": version_id,
            "fromNodeId": nodes[index - 1]["id"],
            "toNodeId": nodes[index]["id"],
            "type": "prerequisite",
            "orderingWeight": index,
        }
        for index in range(1, len(nodes))
    ]
    return {
        "data": {
            "agentRunId": "agent_curriculum_draft",
            "nodes": nodes,
            "edges": edges,
            "rationale": "Generated a deterministic concept sequence from requested anchors.",
        }
    }


@app.post("/v1/curriculum/propose-revision")
async def propose_curriculum_revision(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "data": {
            "agentRunId": "agent_curriculum_revision",
            "proposal": {
                "reason": "realignment_evidence",
                "evidence": payload.get("evidence", {}),
            },
        }
    }
