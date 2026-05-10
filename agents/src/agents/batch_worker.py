"""Submission, polling, and finalization workers for agent batch execution."""

from __future__ import annotations

import os
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol

from .agent_runtime import AgentWrapperDefinition
from .batch_jobs import AgentBatchJob, BatchAttemptKind, BatchJobStatus, BatchJobStore
from .calibration_coach import CalibrationCoachAgent, CalibrationCoachRequest
from .cognitive_copilot import CognitiveCopilotAgent, CognitiveCopilotRequest
from .content_creator import ContentCreatorAgent, ContentCreatorRequest
from .curriculum_planner import (
    CurriculumDraftRequest,
    CurriculumOutlineRequest,
    CurriculumPlannerAgent,
    CurriculumRevisionRequest,
)
from .guardian_client import GuardianClient
from .ingestion_concept_extraction_agent import (
    IngestionConceptExtractionAgent,
    IngestionConceptExtractionRequest,
)
from .knowledge_graph_agent import KnowledgeGraphAgent, KnowledgeGraphRequest
from .lesson_planner import LessonPlanGenerator, LessonPlanRequest
from .llm_router import LLMRouter, build_provider_request
from .mental_debugger import MentalDebuggerAgent, MentalDebuggerRequest
from .mode_preference_helper import ModePreferenceHelperAgent, ModePreferenceRequest
from .patch_planner_remediation import PatchPlannerAgent, PatchPlannerRequest
from .pedagogy_guardian import PedagogyGuardianAgent, PedagogyGuardianRequest
from .taxonomy_curator import TaxonomyCuratorAgent, TaxonomyCuratorRequest
from .watchtower_governance import WatchtowerGovernanceAgent, WatchtowerGovernanceRequest
from .service_clients import NoemaArtifactPersistenceClient, NoemaMcpServiceClient


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


class ArtifactPersister(Protocol):
    async def persist(self, *, job: AgentBatchJob, finalized_result: dict[str, Any]) -> dict[str, Any]: ...


class LocalArtifactPersister:
    """Local persistence envelope until downstream service write paths are wired."""

    async def persist(self, *, job: AgentBatchJob, finalized_result: dict[str, Any]) -> dict[str, Any]:
        artifact_kind = {
            "ingestion-concept-extraction-agent": "ingestion_extraction",
            "content-creator-agent": "content_drafts",
            "lesson-plan-generator": "lesson_plan_draft",
            "calibration-coach": "calibration_reflection",
            "mental-debugger": "debugger_reflection",
            "patch-planner-remediation-agent": "repair_proposal",
            "cognitive-copilot": "copilot_readout",
            "watchtower-governance-layer": "governance_decision",
            "mode-preference-helper": "mode_preference_choice",
            "taxonomy-curator": "taxonomy_proposal",
            "pedagogy-guardian": "guardian_validation",
        }.get(job.agent_name, "agent_artifact")
        return {
            "artifactKind": artifact_kind,
            "storage": "agent_batch_jobs.result_json",
            "jobId": job.job_id,
            "status": "recorded",
            "finalizedAt": _now_iso(),
        }


class ServiceArtifactPersister:
    """Persist finalized artifacts through owning domain service APIs."""

    def __init__(
        self,
        client: NoemaArtifactPersistenceClient,
        mcp_client: NoemaMcpServiceClient | None = None,
    ) -> None:
        self._client = client
        self._mcp_client = mcp_client

    async def persist(self, *, job: AgentBatchJob, finalized_result: dict[str, Any]) -> dict[str, Any]:
        if job.agent_name == "ingestion-concept-extraction-agent":
            return {
                "artifactKind": "ingestion_extraction",
                "storage": "agent_batch_jobs.result_json",
                "jobId": job.job_id,
                "status": "recorded",
                "finalizedAt": _now_iso(),
            }
        if job.agent_name == "content-creator-agent":
            cards = [_to_content_service_card(card, finalized_result) for card in finalized_result.get("cards", [])]
            activity_variants = [
                _to_content_service_activity_variant(variant, finalized_result)
                for variant in finalized_result.get("activityVariants", [])
            ]
            response = await self._client.import_generated_content_batch(
                user_id=str(job.request_json.get("userId")),
                payload={
                    "job": _to_content_creation_job_input(job),
                    "cards": cards,
                    "activityVariants": activity_variants,
                    "rejectedDrafts": finalized_result.get("rejectedDrafts", []),
                    "agentRunId": finalized_result.get("agentRunId"),
                    "resultPayload": {
                        "providerBatchId": job.provider_batch_id,
                        "providerStatus": job.provider_status,
                        "cardCount": len(cards),
                        "activityVariantCount": len(activity_variants),
                    },
                },
                correlation_id=job.run_id,
                idempotency_key=job.job_id,
            )
            batch = response.get("batch", {})
            created = batch.get("created", response.get("created", response.get("items", [])))
            failed = batch.get("failed", [])
            return {
                "artifactKind": "content_drafts",
                "storage": "content-service",
                "jobId": job.job_id,
                "createdCount": len(created) if isinstance(created, list) else 0,
                "failedCount": len(failed) if isinstance(failed, list) else 0,
                "generationJob": response.get("job"),
                "response": response,
            }
        if job.agent_name == "lesson-plan-generator":
            session_id = str(job.request_json.get("sessionId"))
            payload = _to_session_service_lesson_plan_input(job, finalized_result)
            response = await self._client.create_lesson_plan(
                user_id=str(job.request_json.get("userId")),
                session_id=session_id,
                payload=payload,
                correlation_id=job.run_id,
                idempotency_key=job.job_id,
            )
            return {
                "artifactKind": "lesson_plan_draft",
                "storage": "session-service",
                "jobId": job.job_id,
                "response": response,
            }
        if job.agent_name == "knowledge-graph-agent":
            proposals = finalized_result.get("proposals", [])
            submitted_mutations: list[dict[str, Any]] = []
            mutation_errors: list[str] = []
            if self._mcp_client is not None:
                for proposal in proposals:
                    operation = _to_ckg_mutation_operation(proposal)
                    if operation is None:
                        continue
                    try:
                        response = await self._mcp_client.execute(
                            "knowledge-graph",
                            "propose-mutation",
                            {
                                "operations": [operation],
                                "rationale": proposal.get("rationale")
                                or finalized_result.get("rationale")
                                or "Knowledge graph agent proposal from service evidence.",
                                "evidenceCount": len(proposal.get("sourceDocumentIds", [])),
                                "priority": 10,
                            },
                            user_id=str(job.request_json.get("userId", "")),
                        )
                        submitted_mutations.append(response)
                    except Exception as exc:
                        mutation_errors.append(str(exc))
            return {
                "artifactKind": "graph_proposals",
                "storage": "knowledge-graph-service" if submitted_mutations else "agent_batch_jobs.result_json",
                "jobId": job.job_id,
                "proposalCount": len(proposals),
                "submittedCount": len(submitted_mutations),
                "errorCount": len(mutation_errors),
                "errors": mutation_errors,
                "finalizedAt": _now_iso(),
            }

        if job.agent_name == "curriculum-outline-planner":
            return {
                "artifactKind": "curriculum_outline",
                "storage": "agent_batch_jobs.result_json",
                "jobId": job.job_id,
                "status": "recorded",
                "finalizedAt": _now_iso(),
            }

        if job.agent_name in ("curriculum-planner", "curriculum-revision-agent"):
            response = await self._client.import_curriculum_agent_result(
                user_id=str(job.request_json.get("userId")),
                payload={
                    "agentName": job.agent_name,
                    "agentRunId": finalized_result.get("agentRunId"),
                    "jobId": job.job_id,
                    "artifactKind": finalized_result.get("artifactKind", "curriculum_draft"),
                    "request": job.request_json,
                    "result": finalized_result,
                },
                correlation_id=job.run_id,
                idempotency_key=job.job_id,
            )
            return {
                "artifactKind": finalized_result.get("artifactKind", "curriculum_draft"),
                "storage": "curriculum-service",
                "jobId": job.job_id,
                "nodeCount": finalized_result.get("nodeCount", len(finalized_result.get("nodes", []))),
                "edgeCount": finalized_result.get("edgeCount", len(finalized_result.get("edges", []))),
                "status": "imported",
                "response": response,
                "finalizedAt": _now_iso(),
            }

        return {
            "artifactKind": finalized_result.get("artifactKind", "agent_artifact"),
            "storage": "agent_batch_jobs.result_json",
            "jobId": job.job_id,
            "status": "unsupported_external_persistence",
            "finalizedAt": _now_iso(),
        }


@dataclass(slots=True)
class BatchWorkerResult:
    submitted: int = 0
    polled: int = 0
    finalized: int = 0
    failed: int = 0


class BatchJobCancellationError(ValueError):
    def __init__(self, message: str, *, reason: str) -> None:
        super().__init__(message)
        self.reason = reason


class BatchWorker:
    def __init__(
        self,
        *,
        batch_store: BatchJobStore,
        router: LLMRouter,
        guardian: GuardianClient,
        wrappers: dict[str, AgentWrapperDefinition],
        artifact_persister: ArtifactPersister | None = None,
    ) -> None:
        self._batch_store = batch_store
        self._router = router
        self._guardian = guardian
        self._wrappers = wrappers
        self._artifact_persister = artifact_persister or LocalArtifactPersister()

    async def run_submission_cycle(self, *, limit: int = 100) -> BatchWorkerResult:
        jobs = await self._batch_store.list_jobs_for_submission(limit=limit)
        grouped: dict[tuple[str, str, str], list[AgentBatchJob]] = defaultdict(list)
        for job in jobs:
            grouped[(job.provider, job.model, job.agent_name)].append(job)
        result = BatchWorkerResult()
        for (provider, _model, _agent_name), group in grouped.items():
            adapter = self._router.get_batch_adapter(provider)
            requests = [
                build_provider_request(job=job, wrapper=self._wrappers[job.agent_name])
                for job in group
            ]
            attempt_ids: dict[str, str] = {}
            try:
                for job in group:
                    attempt_ids[job.job_id] = await self._batch_store.record_attempt_start(
                        job_id=job.job_id,
                        attempt_kind=BatchAttemptKind.SUBMIT,
                        request_json={"provider": provider, "groupSize": len(group)},
                    )
                submission = await adapter.submit_batch(requests)
                for job in group:
                    await self._batch_store.finish_attempt(
                        attempt_id=attempt_ids[job.job_id],
                        status="completed",
                        response_json=submission.raw_response,
                    )
                    await self._batch_store.mark_job_submitted(
                        job_id=job.job_id,
                        provider_batch_id=submission.provider_batch_id,
                        provider_status=submission.provider_status,
                        event_payload=_event_payload(
                            job=job,
                            status=BatchJobStatus.SUBMITTED,
                            provider_batch_id=submission.provider_batch_id,
                            provider_status=submission.provider_status,
                        ),
                    )
                    result.submitted += 1
            except Exception as error:
                for job in group:
                    attempt_id = attempt_ids.get(job.job_id)
                    if attempt_id:
                        await self._batch_store.finish_attempt(
                            attempt_id=attempt_id,
                            status="failed",
                            error_message=str(error),
                        )
                    await self._batch_store.mark_job_failed(
                        job_id=job.job_id,
                        error_message=str(error),
                        provider_status=None,
                        event_payload=_event_payload(
                            job=job,
                            status=BatchJobStatus.FAILED,
                            provider_batch_id=None,
                            provider_status=None,
                            error={"code": "SUBMIT_FAILED", "message": str(error), "retryable": True},
                        ),
                    )
                    result.failed += 1
        return result

    async def run_polling_cycle(self, *, limit: int = 100) -> BatchWorkerResult:
        jobs = await self._batch_store.list_jobs_for_polling(limit=limit)
        grouped: dict[tuple[str, str], list[AgentBatchJob]] = defaultdict(list)
        for job in jobs:
            if job.provider_batch_id is None or job.status == BatchJobStatus.CANCELLED:
                continue
            grouped[(job.provider, job.provider_batch_id)].append(job)
        result = BatchWorkerResult()
        for (provider, provider_batch_id), group in grouped.items():
            adapter = self._router.get_batch_adapter(provider)
            attempt_ids: dict[str, str] = {}
            try:
                for job in group:
                    attempt_ids[job.job_id] = await self._batch_store.record_attempt_start(
                        job_id=job.job_id,
                        attempt_kind=BatchAttemptKind.POLL,
                        request_json={"providerBatchId": provider_batch_id},
                    )
                poll = await adapter.get_batch_status(provider_batch_id)
                if poll.normalized_status == BatchJobStatus.RUNNING:
                    for job in group:
                        if job.status != BatchJobStatus.RUNNING:
                            await self._batch_store.mark_job_running(
                                job_id=job.job_id,
                                provider_status=poll.provider_status,
                                event_payload=_event_payload(
                                    job=job,
                                    status=BatchJobStatus.RUNNING,
                                    provider_batch_id=provider_batch_id,
                                    provider_status=poll.provider_status,
                                ),
                            )
                        await self._batch_store.finish_attempt(
                            attempt_id=attempt_ids[job.job_id],
                            status="completed",
                            response_json=poll.raw_response,
                        )
                        result.polled += 1
                    continue
                if poll.normalized_status == BatchJobStatus.COMPLETED:
                    fetched = await adapter.fetch_batch_results(provider_batch_id)
                    for job in group:
                        item = fetched.items.get(job.job_id)
                        if item is None:
                            await self._batch_store.finish_attempt(
                                attempt_id=attempt_ids[job.job_id],
                                status="failed",
                                response_json=fetched.raw_response,
                                error_message="Provider batch result missing local job id.",
                            )
                            await self._batch_store.mark_job_failed(
                                job_id=job.job_id,
                                error_message="Provider batch result missing local job id.",
                                provider_status=fetched.provider_status,
                                event_payload=_event_payload(
                                    job=job,
                                    status=BatchJobStatus.FAILED,
                                    provider_batch_id=provider_batch_id,
                                    provider_status=fetched.provider_status,
                                    error={
                                        "code": "RESULT_MISSING",
                                        "message": "Provider batch result missing local job id.",
                                        "retryable": False,
                                    },
                                ),
                            )
                            result.failed += 1
                            continue
                        if item.error:
                            normalized_error_message = _provider_item_error_message(item.error)
                            await self._batch_store.finish_attempt(
                                attempt_id=attempt_ids[job.job_id],
                                status="failed",
                                response_json=item.raw_response,
                                error_message=normalized_error_message,
                            )
                            await self._batch_store.mark_job_failed(
                                job_id=job.job_id,
                                error_message=normalized_error_message,
                                provider_status=fetched.provider_status,
                                event_payload=_event_payload(
                                    job=job,
                                    status=BatchJobStatus.FAILED,
                                    provider_batch_id=provider_batch_id,
                                    provider_status=fetched.provider_status,
                                    error={
                                        "code": _provider_item_error_code(item.error),
                                        "message": normalized_error_message,
                                        "retryable": _provider_item_retryable(item.error),
                                    },
                                ),
                            )
                            result.failed += 1
                            continue
                        await self._batch_store.finish_attempt(
                            attempt_id=attempt_ids[job.job_id],
                            status="completed",
                            response_json=item.raw_response,
                        )
                        await self._batch_store.store_polled_result(
                            job_id=job.job_id,
                            provider_status=fetched.provider_status,
                            result_json={
                                "providerBatchId": provider_batch_id,
                                "providerStatus": fetched.provider_status,
                                "providerItem": {
                                    "customId": item.custom_id,
                                    "status": item.status,
                                    "outputText": item.output_text,
                                    "outputJson": item.output_json,
                                    "usage": item.usage,
                                    "error": item.error,
                                    "rawResponse": item.raw_response,
                                },
                                "rawBatchResponse": fetched.raw_response,
                            },
                        )
                        result.polled += 1
                    continue
                if poll.normalized_status == BatchJobStatus.CANCELLED:
                    for job in group:
                        await self._batch_store.finish_attempt(
                            attempt_id=attempt_ids[job.job_id],
                            status="completed",
                            response_json=poll.raw_response,
                        )
                        await self._batch_store.mark_job_cancelled(
                            job_id=job.job_id,
                            provider_status=poll.provider_status,
                            event_payload=_event_payload(
                                job=job,
                                status=BatchJobStatus.CANCELLED,
                                provider_batch_id=provider_batch_id,
                                provider_status=poll.provider_status,
                            ),
                        )
                    continue
                if poll.normalized_status == BatchJobStatus.FAILED:
                    for job in group:
                        await self._batch_store.finish_attempt(
                            attempt_id=attempt_ids[job.job_id],
                            status="failed",
                            response_json=poll.raw_response,
                            error_message=str(poll.error),
                        )
                        await self._batch_store.mark_job_failed(
                            job_id=job.job_id,
                            error_message=str(poll.error),
                            provider_status=poll.provider_status,
                            event_payload=_event_payload(
                                job=job,
                                status=BatchJobStatus.FAILED,
                                provider_batch_id=provider_batch_id,
                                provider_status=poll.provider_status,
                                error={
                                    "code": "PROVIDER_BATCH_FAILED",
                                    "message": str(poll.error),
                                    "retryable": False,
                                },
                            ),
                        )
                        result.failed += 1
            except Exception as error:
                for job in group:
                    attempt_id = attempt_ids.get(job.job_id)
                    if attempt_id:
                        await self._batch_store.finish_attempt(
                            attempt_id=attempt_id,
                            status="failed",
                            error_message=str(error),
                        )
                result.failed += len(group)
        return result

    async def run_finalization_cycle(self, *, limit: int = 100) -> BatchWorkerResult:
        jobs = await self._batch_store.list_jobs_for_finalization(limit=limit)
        result = BatchWorkerResult()
        max_attempts = max(1, int(os.getenv("AGENTS_BATCH_MAX_FINALIZATION_ATTEMPTS", "3")))
        for job in jobs:
            attempts = await self._batch_store.list_attempts_for_job(job.job_id)
            failed_finalizations = sum(
                1
                for attempt in attempts
                if attempt.attempt_kind == BatchAttemptKind.FINALIZE and attempt.status == "failed"
            )
            if job.status == BatchJobStatus.FINALIZATION_FAILED and failed_finalizations >= max_attempts:
                await self._batch_store.mark_job_failed(
                    job_id=job.job_id,
                    error_message=(
                        f"Finalization retries exhausted after {failed_finalizations} attempt(s)."
                    ),
                    provider_status=job.provider_status,
                    event_payload=_event_payload(
                        job=job,
                        status=BatchJobStatus.FAILED,
                        provider_batch_id=job.provider_batch_id,
                        provider_status=job.provider_status,
                        error={
                            "code": "FINALIZATION_RETRIES_EXHAUSTED",
                            "message": (
                                f"Finalization retries exhausted after {failed_finalizations} attempt(s)."
                            ),
                            "retryable": False,
                        },
                    ),
                )
                result.failed += 1
                continue
            attempt_id = await self._batch_store.record_attempt_start(
                job_id=job.job_id,
                attempt_kind=BatchAttemptKind.FINALIZE,
                request_json={"providerBatchId": job.provider_batch_id},
            )
            try:
                finalized = await self._finalize_job(job)
                await self._batch_store.finish_attempt(
                    attempt_id=attempt_id,
                    status="completed",
                    response_json=finalized,
                )
                await self._batch_store.mark_job_completed(
                    job_id=job.job_id,
                    result_json=finalized,
                    event_payload=_event_payload(
                        job=job,
                        status=BatchJobStatus.COMPLETED,
                        provider_batch_id=job.provider_batch_id,
                        provider_status=job.provider_status,
                        result_ref={
                            "jobId": job.job_id,
                            "artifactCount": _artifact_count(finalized),
                            "artifactKind": finalized.get("artifactKind"),
                        },
                    ),
                )
                result.finalized += 1
            except Exception as error:
                await self._batch_store.finish_attempt(
                    attempt_id=attempt_id,
                    status="failed",
                    error_message=str(error),
                )
                await self._batch_store.mark_job_finalization_failed(
                    job_id=job.job_id,
                    error_message=str(error),
                    event_payload=_event_payload(
                        job=job,
                        status=BatchJobStatus.FINALIZATION_FAILED,
                        provider_batch_id=job.provider_batch_id,
                        provider_status=job.provider_status,
                        error={
                            "code": "FINALIZATION_FAILED",
                            "message": str(error),
                            "retryable": False,
                        },
                    ),
                )
                result.failed += 1
        return result

    async def cancel_job(self, job_id: str) -> AgentBatchJob:
        job = await self._batch_store.get_job(job_id)
        if job.status == BatchJobStatus.CANCELLED:
            raise BatchJobCancellationError(
                "This proposal request was already cancelled.",
                reason="already_cancelled",
            )
        if job.status in {
            BatchJobStatus.SUBMITTED,
            BatchJobStatus.RUNNING,
            BatchJobStatus.COMPLETED,
            BatchJobStatus.FAILED,
            BatchJobStatus.FINALIZATION_FAILED,
        } or job.provider_batch_id is not None:
            raise BatchJobCancellationError(
                "This proposal request is no longer cancellable because provider submission has already happened.",
                reason="provider_submission_started",
            )
        provider_status = None
        return await self._batch_store.mark_job_cancelled(
            job_id=job.job_id,
            provider_status=provider_status,
            event_payload=_event_payload(
                job=job,
                status=BatchJobStatus.CANCELLED,
                provider_batch_id=job.provider_batch_id,
                provider_status=provider_status,
            ),
        )

    async def _finalize_job(self, job: AgentBatchJob) -> dict[str, Any]:
        provider_item = ((job.result_json or {}).get("providerItem") or {})
        output_json = provider_item.get("outputJson")
        if not isinstance(output_json, dict):
            raw_text = provider_item.get("outputText")
            raise ValueError(f"Provider output was not valid JSON: {raw_text!r}")

        if job.agent_name == "ingestion-concept-extraction-agent":
            request = IngestionConceptExtractionRequest.model_validate(
                {
                    "userId": job.request_json.get("userId", ""),
                    "documentId": (
                        job.request_json.get("documentIds", [None])[0]
                        or job.request_json.get("payload", {}).get("documentId", "")
                    ),
                    "ingestionJobId": job.request_json.get("payload", {}).get("ingestionJobId"),
                    "intent": job.request_json.get("payload", {}).get("intent", "both"),
                    "studyMode": job.request_json.get("studyMode"),
                    "curriculumId": job.request_json.get("curriculumId"),
                    "document": job.request_json.get("payload", {}).get("document", {}),
                    "ir": job.request_json.get("payload", {}).get("ir", {}),
                    "chunks": job.request_json.get("payload", {}).get("chunks", []),
                    "scanWindows": job.request_json.get("payload", {}).get("scanWindows", []),
                    "retrievalSeed": job.request_json.get("payload", {}).get("retrievalSeed", []),
                    "contextPack": job.context_pack_json or {},
                    "provider": job.provider,
                    "model": job.model,
                    "agentRunId": job.run_id,
                    "executionStrategy": job.execution_strategy,
                    "batchRequested": True,
                }
            )
            agent = IngestionConceptExtractionAgent()
            finalized = await agent.finalize_extraction(generated=output_json, request=request)
            persistence = await self._artifact_persister.persist(job=job, finalized_result=finalized)
            return {
                **finalized,
                "artifactKind": "ingestion_extraction",
                "persistence": persistence,
                "providerBatch": {
                    "providerBatchId": job.provider_batch_id,
                    "providerStatus": job.provider_status,
                },
                "providerUsage": provider_item.get("usage"),
            }
        if job.agent_name == "content-creator-agent":
            request = ContentCreatorRequest.model_validate(
                {
                    "userId": job.request_json.get("userId", ""),
                    "mode": job.request_json.get("payload", {}).get("mode", "agent_autonomous"),
                    "conceptIds": job.request_json.get("conceptIds", []),
                    "selectedNodeIds": job.request_json.get("selectedNodeIds", []),
                    "curriculumId": job.request_json.get("curriculumId"),
                    "sessionId": job.request_json.get("sessionId"),
                    "documentIds": job.request_json.get("documentIds", []),
                    "desiredCardTypes": job.request_json.get("desiredCardTypes", []),
                    "desiredActivityTypes": job.request_json.get("payload", {}).get("desiredActivityTypes", []),
                    "studyMode": job.request_json.get("studyMode"),
                    "budget": job.request_json.get("payload", {}).get("budget", {}),
                    "contextPack": job.context_pack_json or {},
                    "provider": job.provider,
                    "model": job.model,
                    "agentRunId": job.run_id,
                    "executionStrategy": job.execution_strategy,
                    "batchRequested": True,
                }
            )
            agent = ContentCreatorAgent(self._guardian)
            finalized = await agent.finalize_created_content(
                generated=output_json,
                request=request,
            )
            persistence = await self._artifact_persister.persist(job=job, finalized_result=finalized)
            return {
                **finalized,
                "artifactKind": "content_drafts",
                "persistence": persistence,
                "providerBatch": {
                    "providerBatchId": job.provider_batch_id,
                    "providerStatus": job.provider_status,
                },
                "providerUsage": provider_item.get("usage"),
            }
        if job.agent_name == "knowledge-graph-agent":
            request = KnowledgeGraphRequest.model_validate(
                {
                    "userId": job.request_json.get("userId", ""),
                    "conceptIds": job.request_json.get("conceptIds", []),
                    "selectedNodeIds": job.request_json.get("selectedNodeIds", []),
                    "documentIds": job.request_json.get("documentIds", []),
                    "graphExpansionScope": job.request_json.get("graphExpansionScope", {}),
                    "proposalType": job.request_json.get("payload", {}).get("proposalType", "anchor"),
                    "domain": job.request_json.get("payload", {}).get("domain"),
                    "studyMode": job.request_json.get("studyMode"),
                    "candidateLabels": job.request_json.get("payload", {}).get("candidateLabels", []),
                    "contextPack": job.context_pack_json or {},
                    "provider": job.provider,
                    "model": job.model,
                    "agentRunId": job.run_id,
                    "executionStrategy": job.execution_strategy,
                    "batchRequested": True,
                }
            )
            kg_agent = KnowledgeGraphAgent()
            finalized = await kg_agent.finalize_graph_proposals(
                raw_proposals=output_json.get("proposals", []),
                request=request,
            )
            persistence = await self._artifact_persister.persist(job=job, finalized_result=finalized)
            return {
                **finalized,
                "artifactKind": "graph_proposals",
                "persistence": persistence,
                "providerBatch": {
                    "providerBatchId": job.provider_batch_id,
                    "providerStatus": job.provider_status,
                },
                "providerUsage": provider_item.get("usage"),
            }
        if job.agent_name == "curriculum-outline-planner":
            outline_request = CurriculumOutlineRequest.model_validate(
                {
                    "userId": job.request_json.get("userId", ""),
                    "goal": job.request_json.get("payload", {}).get("goal", ""),
                    "domain": job.request_json.get("payload", {}).get("domain"),
                    "studyMode": job.request_json.get("studyMode"),
                    "focusAreas": job.request_json.get("payload", {}).get("focusAreas", []),
                    "learnerPreferences": job.request_json.get("payload", {}).get(
                        "learnerPreferences", {}
                    ),
                    "contextPack": job.context_pack_json or {},
                    "provider": job.provider,
                    "model": job.model,
                    "agentRunId": job.run_id,
                    "executionStrategy": job.execution_strategy,
                    "batchRequested": True,
                }
            )
            cp_agent = CurriculumPlannerAgent()
            finalized = await cp_agent.finalize_curriculum_outline(
                generated_outline=output_json,
                request=outline_request,
            )
            persistence = await self._artifact_persister.persist(job=job, finalized_result=finalized)
            return {
                **finalized,
                "artifactKind": "curriculum_outline",
                "persistence": persistence,
                "providerBatch": {
                    "providerBatchId": job.provider_batch_id,
                    "providerStatus": job.provider_status,
                },
                "providerUsage": provider_item.get("usage"),
            }
        if job.agent_name == "curriculum-planner":
            draft_request = CurriculumDraftRequest.model_validate(
                {
                    "userId": job.request_json.get("userId", ""),
                    "goal": job.request_json.get("payload", {}).get("goal"),
                    "conceptIds": job.request_json.get("conceptIds", []),
                    "documentIds": job.request_json.get("documentIds", []),
                    "studyMode": job.request_json.get("studyMode"),
                    "targetHorizon": job.request_json.get("payload", {}).get("targetHorizon"),
                    "difficultyPreference": job.request_json.get("payload", {}).get("difficultyPreference"),
                    "pacing": job.request_json.get("payload", {}).get("pacing"),
                    "focusAreas": job.request_json.get("payload", {}).get("focusAreas", []),
                    "learnerPreferences": job.request_json.get("payload", {}).get("learnerPreferences", {}),
                    "branchPolicy": job.request_json.get("payload", {}).get("branchPolicy", "adaptive_short_detours"),
                    "prerequisiteStrictness": job.request_json.get("payload", {}).get(
                        "prerequisiteStrictness", "strict_return_to_prerequisites"
                    ),
                    "detourBudget": job.request_json.get("payload", {}).get("detourBudget", {}),
                    "targetOutcome": job.request_json.get("payload", {}).get("targetOutcome", {}),
                    "knownKnowledgeState": job.request_json.get("payload", {}).get("knownKnowledgeState", {}),
                    "knownGaps": job.request_json.get("payload", {}).get("knownGaps", []),
                    "activeBranchState": job.request_json.get("payload", {}).get("activeBranchState", {}),
                    "branchDriftSummary": job.request_json.get("payload", {}).get("branchDriftSummary", {}),
                    "contextPack": job.context_pack_json or {},
                    "provider": job.provider,
                    "model": job.model,
                    "agentRunId": job.run_id,
                    "executionStrategy": job.execution_strategy,
                    "batchRequested": True,
                }
            )
            cp_agent = CurriculumPlannerAgent()
            finalized = await cp_agent.finalize_curriculum_draft(
                generated_draft=output_json,
                request=draft_request,
            )
            persistence = await self._artifact_persister.persist(job=job, finalized_result=finalized)
            return {
                **finalized,
                "artifactKind": "curriculum_draft",
                "persistence": persistence,
                "providerBatch": {
                    "providerBatchId": job.provider_batch_id,
                    "providerStatus": job.provider_status,
                },
                "providerUsage": provider_item.get("usage"),
            }
        if job.agent_name == "curriculum-revision-agent":
            revision_request = CurriculumRevisionRequest.model_validate(
                {
                    "userId": job.request_json.get("userId", ""),
                    "curriculumId": job.request_json.get("curriculumId", ""),
                    "curriculumVersionId": job.request_json.get("payload", {}).get("curriculumVersionId", ""),
                    "currentNodes": job.request_json.get("payload", {}).get("currentNodes", []),
                    "currentEdges": job.request_json.get("payload", {}).get("currentEdges", []),
                    "progress": job.request_json.get("payload", {}).get("progress", {}),
                    "revisionReason": job.request_json.get("payload", {}).get("revisionReason", "evidence_based_update"),
                    "evidence": job.request_json.get("payload", {}).get("evidence", {}),
                    "revisionScope": job.request_json.get("payload", {}).get(
                        "revisionScope", "targeted_branch_revision"
                    ),
                    "activeBranchState": job.request_json.get("payload", {}).get("activeBranchState", {}),
                    "branchDriftSummary": job.request_json.get("payload", {}).get("branchDriftSummary", {}),
                    "blockedPrerequisites": job.request_json.get("payload", {}).get("blockedPrerequisites", []),
                    "focusShiftSignals": job.request_json.get("payload", {}).get("focusShiftSignals", []),
                    "knowledgeStateDelta": job.request_json.get("payload", {}).get("knowledgeStateDelta", {}),
                    "learnerIntentSummary": job.request_json.get("payload", {}).get("learnerIntentSummary", {}),
                    "contextPack": job.context_pack_json or {},
                    "provider": job.provider,
                    "model": job.model,
                    "agentRunId": job.run_id,
                    "executionStrategy": job.execution_strategy,
                    "batchRequested": True,
                }
            )
            cp_agent = CurriculumPlannerAgent()
            finalized = await cp_agent.finalize_curriculum_revision(
                generated_revision=output_json,
                request=revision_request,
            )
            persistence = await self._artifact_persister.persist(job=job, finalized_result=finalized)
            return {
                **finalized,
                "artifactKind": "curriculum_revision",
                "persistence": persistence,
                "providerBatch": {
                    "providerBatchId": job.provider_batch_id,
                    "providerStatus": job.provider_status,
                },
                "providerUsage": provider_item.get("usage"),
            }
        if job.agent_name == "lesson-plan-generator":
            request = LessonPlanRequest.model_validate(
                {
                    "sessionId": job.request_json.get("sessionId"),
                    "userId": job.request_json.get("userId"),
                    "curriculumId": job.request_json.get("curriculumId"),
                    "curriculumVersionId": job.request_json.get("payload", {}).get("curriculumVersionId"),
                    "selectedNodeIds": job.request_json.get("selectedNodeIds", []),
                    "selectedCardIds": job.request_json.get("selectedCardIds", []),
                    "studyMode": job.request_json.get("studyMode"),
                    "learningMode": job.request_json.get("payload", {}).get("learningMode"),
                    "rigorLevel": job.request_json.get("payload", {}).get("rigorLevel", "full"),
                    "targetDurationMinutes": job.request_json.get("payload", {}).get("targetDurationMinutes"),
                    "maxSteps": job.request_json.get("payload", {}).get("maxSteps"),
                    "repairOfPlan": job.request_json.get("payload", {}).get("repairOfPlan"),
                    "guardianBlockReasons": job.request_json.get("payload", {}).get("guardianBlockReasons", []),
                    "context": job.request_json.get("payload", {}),
                    "contextPack": job.context_pack_json or {},
                    "provider": job.provider,
                    "model": job.model,
                    "agentRunId": job.run_id,
                    "executionStrategy": job.execution_strategy,
                    "batchRequested": True,
                }
            )
            generator = LessonPlanGenerator(self._guardian)
            finalized = await generator.finalize_generated_plan(
                generated_plan=output_json,
                request=request,
            )
            persistence = await self._artifact_persister.persist(job=job, finalized_result=finalized)
            return {
                **finalized,
                "artifactKind": "lesson_plan_draft",
                "persistence": persistence,
                "providerBatch": {
                    "providerBatchId": job.provider_batch_id,
                    "providerStatus": job.provider_status,
                },
                "providerUsage": provider_item.get("usage"),
            }
        if job.agent_name == "calibration-coach":
            calibration_request = CalibrationCoachRequest.model_validate(
                {
                    "userId": job.request_json.get("userId", ""),
                    "sessionId": job.request_json.get("sessionId"),
                    "stepId": job.request_json.get("stepId"),
                    "conceptIds": job.request_json.get("conceptIds", []),
                    "studyMode": job.request_json.get("studyMode"),
                    "userIntent": job.request_json.get("payload", {}).get("userIntent", {}),
                    "contextPack": job.context_pack_json or {},
                    "provider": job.provider,
                    "model": job.model,
                    "agentRunId": job.run_id,
                    "executionStrategy": job.execution_strategy,
                    "batchRequested": True,
                }
            )
            coach = CalibrationCoachAgent(self._guardian)
            finalized = await coach.finalize_coaching(generated=output_json, request=calibration_request)
            persistence = await self._artifact_persister.persist(job=job, finalized_result=finalized)
            return {
                **finalized,
                "artifactKind": "calibration_reflection",
                "persistence": persistence,
                "providerBatch": {
                    "providerBatchId": job.provider_batch_id,
                    "providerStatus": job.provider_status,
                },
                "providerUsage": provider_item.get("usage"),
            }
        if job.agent_name == "mental-debugger":
            debugger_request = MentalDebuggerRequest.model_validate(
                {
                    "userId": job.request_json.get("userId", ""),
                    "sessionId": job.request_json.get("sessionId"),
                    "stepId": job.request_json.get("stepId"),
                    "conceptIds": job.request_json.get("conceptIds", []),
                    "studyMode": job.request_json.get("studyMode"),
                    "userIntent": job.request_json.get("payload", {}).get("userIntent", {}),
                    "contextPack": job.context_pack_json or {},
                    "provider": job.provider,
                    "model": job.model,
                    "agentRunId": job.run_id,
                    "executionStrategy": job.execution_strategy,
                    "batchRequested": True,
                }
            )
            debugger = MentalDebuggerAgent(self._guardian)
            finalized = await debugger.finalize_reflection(
                generated=output_json,
                request=debugger_request,
            )
            persistence = await self._artifact_persister.persist(job=job, finalized_result=finalized)
            return {
                **finalized,
                "artifactKind": "debugger_reflection",
                "persistence": persistence,
                "providerBatch": {
                    "providerBatchId": job.provider_batch_id,
                    "providerStatus": job.provider_status,
                },
                "providerUsage": provider_item.get("usage"),
            }
        if job.agent_name == "patch-planner-remediation-agent":
            planner_request = PatchPlannerRequest.model_validate(
                {
                    "userId": job.request_json.get("userId", ""),
                    "sessionId": job.request_json.get("sessionId"),
                    "stepId": job.request_json.get("stepId"),
                    "conceptIds": job.request_json.get("conceptIds", []),
                    "studyMode": job.request_json.get("studyMode"),
                    "triggerType": job.request_json.get("payload", {}).get("triggerType"),
                    "userIntent": job.request_json.get("payload", {}).get("userIntent", {}),
                    "contextPack": job.context_pack_json or {},
                    "provider": job.provider,
                    "model": job.model,
                    "agentRunId": job.run_id,
                    "executionStrategy": job.execution_strategy,
                    "batchRequested": True,
                }
            )
            planner = PatchPlannerAgent(self._guardian)
            finalized = await planner.finalize_patch(
                generated=output_json,
                request=planner_request,
            )
            persistence = await self._artifact_persister.persist(job=job, finalized_result=finalized)
            return {
                **finalized,
                "artifactKind": "repair_proposal",
                "persistence": persistence,
                "providerBatch": {
                    "providerBatchId": job.provider_batch_id,
                    "providerStatus": job.provider_status,
                },
                "providerUsage": provider_item.get("usage"),
            }
        if job.agent_name == "cognitive-copilot":
            copilot_request = CognitiveCopilotRequest.model_validate(
                {
                    "userId": job.request_json.get("userId", ""),
                    "sessionId": job.request_json.get("sessionId"),
                    "stepId": job.request_json.get("stepId"),
                    "curriculumId": job.request_json.get("curriculumId"),
                    "conceptIds": job.request_json.get("conceptIds", []),
                    "studyMode": job.request_json.get("studyMode"),
                    "surface": job.request_json.get("payload", {}).get("surface", "sidebar"),
                    "contextPack": job.context_pack_json or {},
                    "provider": job.provider,
                    "model": job.model,
                    "agentRunId": job.run_id,
                    "executionStrategy": job.execution_strategy,
                    "batchRequested": True,
                }
            )
            copilot = CognitiveCopilotAgent(self._guardian)
            finalized = await copilot.finalize_readout(
                generated=output_json,
                request=copilot_request,
            )
            persistence = await self._artifact_persister.persist(job=job, finalized_result=finalized)
            return {
                **finalized,
                "artifactKind": "copilot_readout",
                "persistence": persistence,
                "providerBatch": {
                    "providerBatchId": job.provider_batch_id,
                    "providerStatus": job.provider_status,
                },
                "providerUsage": provider_item.get("usage"),
            }
        if job.agent_name == "watchtower-governance-layer":
            wt_request = WatchtowerGovernanceRequest.model_validate(
                {
                    "userId": job.request_json.get("userId", ""),
                    "sessionId": job.request_json.get("sessionId"),
                    "stepId": job.request_json.get("stepId"),
                    "surface": job.request_json.get("payload", {}).get("surface", "admin"),
                    "proposedAction": job.request_json.get("payload", {}).get("proposedAction", {}),
                    "agentHints": job.request_json.get("payload", {}).get("agentHints", []),
                    "policyContext": job.request_json.get("payload", {}).get("policyContext", {}),
                    "contextPack": job.context_pack_json or {},
                    "provider": job.provider,
                    "model": job.model,
                    "agentRunId": job.run_id,
                    "executionStrategy": job.execution_strategy,
                    "batchRequested": True,
                }
            )
            finalized = await WatchtowerGovernanceAgent().finalize_decision(
                generated=output_json,
                request=wt_request,
            )
            persistence = await self._artifact_persister.persist(job=job, finalized_result=finalized)
            return {
                **finalized,
                "artifactKind": "governance_decision",
                "persistence": persistence,
                "providerBatch": {
                    "providerBatchId": job.provider_batch_id,
                    "providerStatus": job.provider_status,
                },
                "providerUsage": provider_item.get("usage"),
            }
        if job.agent_name == "taxonomy-curator":
            curator_request = TaxonomyCuratorRequest.model_validate(
                {
                    "userId": job.request_json.get("userId", ""),
                    "taxonomyDomain": job.request_json.get("payload", {}).get("taxonomyDomain", "failure"),
                    "taxonomyId": job.request_json.get("payload", {}).get("taxonomyId"),
                    "currentVersion": job.request_json.get("payload", {}).get("currentVersion"),
                    "labelIds": job.request_json.get("payload", {}).get("labelIds", []),
                    "conceptIds": job.request_json.get("conceptIds", []),
                    "contextPack": job.context_pack_json or {},
                    "provider": job.provider,
                    "model": job.model,
                    "agentRunId": job.run_id,
                    "executionStrategy": job.execution_strategy,
                    "batchRequested": True,
                }
            )
            finalized = await TaxonomyCuratorAgent().finalize_proposal(
                generated=output_json,
                request=curator_request,
            )
            persistence = await self._artifact_persister.persist(job=job, finalized_result=finalized)
            return {
                **finalized,
                "artifactKind": "taxonomy_proposal",
                "persistence": persistence,
                "providerBatch": {
                    "providerBatchId": job.provider_batch_id,
                    "providerStatus": job.provider_status,
                },
                "providerUsage": provider_item.get("usage"),
            }
        if job.agent_name == "pedagogy-guardian":
            guardian_request = PedagogyGuardianRequest.model_validate(
                {
                    "userId": job.request_json.get("userId", ""),
                    "artifactType": job.request_json.get("payload", {}).get("artifactType", "activity"),
                    "artifact": job.request_json.get("payload", {}).get("artifact", {}),
                    "producerService": job.request_json.get("payload", {}).get("producerService", "agents-runtime"),
                    "producerAgent": job.request_json.get("payload", {}).get("producerAgent"),
                    "contextPack": job.context_pack_json or {},
                    "provider": job.provider,
                    "model": job.model,
                    "agentRunId": job.run_id,
                    "executionStrategy": job.execution_strategy,
                    "batchRequested": True,
                }
            )
            guardian_agent = PedagogyGuardianAgent(self._guardian)
            finalized = await guardian_agent.finalize_validation(generated=output_json, request=guardian_request)
            persistence = await self._artifact_persister.persist(job=job, finalized_result=finalized)
            return {
                **finalized,
                "artifactKind": "guardian_validation",
                "persistence": persistence,
                "providerBatch": {
                    "providerBatchId": job.provider_batch_id,
                    "providerStatus": job.provider_status,
                },
                "providerUsage": provider_item.get("usage"),
            }
        persistence = await self._artifact_persister.persist(job=job, finalized_result=output_json)
        return {
            "artifactKind": "agent_preview",
            "result": output_json,
            "persistence": persistence,
            "providerBatch": {
                "providerBatchId": job.provider_batch_id,
                "providerStatus": job.provider_status,
            },
            "providerUsage": provider_item.get("usage"),
        }


def _to_ckg_mutation_operation(proposal: dict[str, Any]) -> dict[str, Any] | None:
    """Convert a normalized graph proposal into a knowledge-graph-service mutation operation."""
    operation = proposal.get("operation")
    if not isinstance(operation, dict):
        return None
    op_type = operation.get("type") or proposal.get("proposalType")
    if not op_type:
        return None
    if op_type in {
        "add_node",
        "remove_node",
        "update_node",
        "add_edge",
        "remove_edge",
        "merge_nodes",
        "split_node",
    }:
        if op_type == "add_edge":
            return {
                "type": "add_edge",
                "sourceNodeId": operation.get("sourceNodeId") or operation.get("fromNodeId"),
                "targetNodeId": operation.get("targetNodeId") or operation.get("toNodeId"),
                "edgeType": operation.get("edgeType") or proposal.get("proposalType") or "related_to",
                "weight": operation.get("weight", proposal.get("confidenceScore", 0.5)),
                "rationale": operation.get("rationale")
                or proposal.get("rationale")
                or "Knowledge graph agent edge proposal.",
            }
        return operation
    return {
        "type": "add_node",
        "nodeType": "concept",
        "label": operation.get("candidateLabel") or proposal.get("candidateLabel") or proposal.get("conceptId"),
        "description": proposal.get("rationale") or "Agent-proposed canonical concept candidate.",
        "domain": operation.get("domain") or proposal.get("domain") or "general",
        "properties": {
            "legacyOperationType": op_type,
            "subjectConceptId": operation.get("subjectConceptId") or proposal.get("conceptId"),
            "targetConceptId": operation.get("targetConceptId"),
            "relationKind": operation.get("relationKind"),
            "proposalId": proposal.get("proposalId"),
            "sourceDocumentIds": proposal.get("sourceDocumentIds", []),
            "metadata": proposal.get("metadata", {}),
        },
    }


def _artifact_count(finalized: dict[str, Any]) -> int:
    if isinstance(finalized.get("cards"), list):
        return len(finalized["cards"])
    if isinstance(finalized.get("steps"), list):
        return len(finalized["steps"])
    if isinstance(finalized.get("result"), dict):
        return 1
    return 0


def _provider_item_error_message(error: dict[str, Any] | None) -> str:
    if not isinstance(error, dict):
        return "Provider item failed."
    message = error.get("message")
    if isinstance(message, str) and message.strip() != "":
        return message
    return str(error)


def _provider_item_error_code(error: dict[str, Any] | None) -> str:
    if not isinstance(error, dict):
        return "PROVIDER_ITEM_FAILED"
    code = error.get("code")
    if isinstance(code, str) and code.strip() != "":
        return code
    status_code = error.get("statusCode")
    if status_code == 429:
        return "RATE_LIMITED"
    return "PROVIDER_ITEM_FAILED"


def _provider_item_retryable(error: dict[str, Any] | None) -> bool:
    if not isinstance(error, dict):
        return False
    retryable = error.get("retryable")
    if isinstance(retryable, bool):
        return retryable
    status_code = error.get("statusCode")
    return status_code in {429, 503, 504}


def _is_canonical_concept_id(value: object) -> bool:
    return isinstance(value, str) and value.startswith("concept_") and len(value) >= 29


def _is_graph_node_id(value: object) -> bool:
    return isinstance(value, str) and value.startswith("node_") and len(value) >= 26


def _to_content_service_card(card: dict[str, Any], finalized_result: dict[str, Any]) -> dict[str, Any]:
    raw_ckg_anchors = card.get("anchoredCkgNodeIds", [])
    raw_pkg_anchors = card.get("anchoredPkgNodeIds", [])
    raw_concepts = card.get("conceptIds", [])
    ckg_anchors = [
        value for value in raw_ckg_anchors if _is_canonical_concept_id(value)
    ]
    pkg_anchors = [
        value
        for value in [*raw_pkg_anchors, *raw_ckg_anchors, *raw_concepts]
        if _is_graph_node_id(value)
    ]
    return {
        "cardType": str(card.get("cardType", "definition")).lower(),
        "content": card.get("content", {}),
        "difficulty": str(card.get("difficulty", "intermediate")).lower(),
        "anchoredCkgNodeIds": list(dict.fromkeys(ckg_anchors)),
        "anchoredPkgNodeIds": list(dict.fromkeys(pkg_anchors)),
        "knowledgeNodeIds": list(dict.fromkeys(pkg_anchors)),
        "tags": card.get("tags", []),
        "supportedStudyModes": card.get("supportedStudyModes", ["knowledge_gaining"]),
        "source": "agent",
        "originMode": str(card.get("originMode", "agent_autonomous")).lower(),
        "originAgentRunId": finalized_result.get("agentRunId"),
        "sourceDocumentIds": card.get("sourceDocumentIds", []),
        "sources": card.get("sources", []),
        "factualityScore": card.get("factualityScore"),
        "reviewState": "pending_review",
        "guardianValidationId": card.get("guardianValidationId"),
        "metadata": {
            "generationRationale": card.get("rationale", ""),
            "batchJobArtifact": True,
            "agentRunId": finalized_result.get("agentRunId"),
        },
    }


def _to_content_service_activity_variant(
    variant: dict[str, Any],
    finalized_result: dict[str, Any],
) -> dict[str, Any]:
    metadata = variant.get("generatorMetadata", {})
    if not isinstance(metadata, dict):
        metadata = {}
    return {
        "conceptId": variant.get("conceptId"),
        "studyMode": variant.get("studyMode", "knowledge_gaining"),
        "transformationType": variant.get("transformationType", "explanation"),
        "epistemicMode": variant.get("epistemicMode", "generative_retrieval"),
        "difficultyBucket": variant.get("difficultyBucket", 2),
        "sourceCardIds": variant.get("sourceCardIds", []),
        "prompt": variant.get("prompt", "Practice this concept."),
        "renderPayload": variant.get("renderPayload", {}),
        "expectedResponseType": variant.get("expectedResponseType", "short_text"),
        "responseSchema": variant.get("responseSchema", {"type": "string"}),
        "variantSeed": variant.get("variantSeed"),
        "generatorMetadata": {
            **metadata,
            "agentRunId": finalized_result.get("agentRunId"),
            "guardianValidationId": variant.get("guardianValidationId"),
            "rationale": variant.get("rationale"),
        },
        "ttlAt": variant.get("ttlAt"),
    }


def _to_content_creation_job_input(job: AgentBatchJob) -> dict[str, Any]:
    payload = job.request_json.get("payload", {})
    return {
        "mode": payload.get("mode", "agent_autonomous"),
        "conceptIds": job.request_json.get("conceptIds", []),
        "documentIds": job.request_json.get("documentIds", []),
        "curriculumContext": {
            "curriculumId": job.request_json.get("curriculumId"),
            "selectedNodeIds": job.request_json.get("selectedNodeIds", []),
        },
        "studentContext": {"userId": job.request_json.get("userId")},
        "desiredCardTypes": job.request_json.get("desiredCardTypes", []),
        "varietyMandate": payload.get("varietyMandate", {}),
        "budget": payload.get("budget", {}),
    }


def _to_session_service_lesson_plan_input(job: AgentBatchJob, finalized_result: dict[str, Any]) -> dict[str, Any]:
    request_payload = job.request_json
    goals = [
        {
            "description": goal.get("description", goal.get("title", "Serve generated curriculum target")),
            "type": goal.get("type", "acquisition"),
            "source": goal.get("source", "system_proposed"),
            "conceptRefs": goal.get("conceptRefs", goal.get("targetNodeIds", [])),
        }
        for goal in finalized_result.get("goals", [])
    ]
    steps: list[dict[str, Any]] = []
    for step in finalized_result.get("steps", []):
        raw_activities = step.get("activities")
        if not isinstance(raw_activities, list) or not raw_activities:
            raw_activities = [step.get("activity", {})]
        activities: list[dict[str, Any]] = []
        for activity in raw_activities:
            if not isinstance(activity, dict):
                continue
            content_source_type = activity.get("contentSourceType", "generated")
            if isinstance(content_source_type, str):
                content_source_type = content_source_type.lower()
            activities.append(
                {
                    "contentSourceType": content_source_type,
                    "cardId": activity.get("cardId"),
                    "templateId": activity.get("templateId"),
                    "generatedVariantId": activity.get("generatedVariantId"),
                    "prompt": activity.get("prompt", f"Work through step {step.get('ordinal', 1)}."),
                    "renderPayload": activity.get("renderPayload", {}),
                    "expectedResponseType": activity.get("expectedResponseType", "free_text"),
                    "responseSchema": activity.get("responseSchema", {}),
                    "variantSeed": activity.get("variantSeed"),
                    "generationFallbackReason": activity.get("generationFallbackReason"),
                }
            )
        steps.append(
            {
                "objective": step.get("objective", f"Serve selected node(s) for {job.agent_name}"),
                "servesGoalIds": step.get("servesGoalIds", []),
                "eligibleModes": step.get("eligibleModes", ["generative_retrieval"]),
                "selectedMode": step.get("selectedMode", "generative_retrieval"),
                "transformationType": step.get("transformationType", "recall"),
                "expectedOutcome": step.get("expectedOutcome", "Learner completes the planned activity."),
                "evaluationType": step.get("evaluationType", "self_explanation"),
                "difficulty": step.get("difficulty", 0.5),
                "isRepair": step.get("isRepair", False),
                "conceptRefs": step.get("targetNodeIds", step.get("conceptRefs", [])),
                "variantSeed": step.get("variantSeed") or (activities[0].get("variantSeed") if activities else None),
                "activities": activities,
            }
        )
    return {
        "curriculumId": request_payload.get("curriculumId"),
        "selectedNodeIds": finalized_result.get("selectedNodeIds", request_payload.get("selectedNodeIds", [])),
        "curriculumVersionId": finalized_result.get("curriculumVersionId")
        or request_payload.get("payload", {}).get("curriculumVersionId"),
        "rigorLevel": request_payload.get("payload", {}).get("rigorLevel", "full"),
        "topic": finalized_result.get("topic")
        or request_payload.get("payload", {}).get("topic")
        or finalized_result.get("rationale"),
        "prerequisites": request_payload.get("payload", {}).get("prerequisites", []),
        "sourceDecks": request_payload.get("payload", {}).get("sourceDecks", []),
        "sourceCategories": request_payload.get("payload", {}).get("sourceCategories", []),
        "assessmentStrategy": request_payload.get("payload", {}).get("assessmentStrategy", "agent_generated"),
        "adaptationRules": request_payload.get("payload", {}).get("adaptationRules", "agent_generated"),
        "goals": goals,
        "steps": steps,
        "metadata": {
            "agentBatchJobId": job.job_id,
            "agentRunId": finalized_result.get("agentRunId"),
            "rationale": finalized_result.get("rationale"),
        },
    }


def _event_payload(
    *,
    job: AgentBatchJob,
    status: str,
    provider_batch_id: str | None,
    provider_status: str | None,
    result_ref: dict[str, Any] | None = None,
    error: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "jobId": job.job_id,
        "agentName": job.agent_name,
        "provider": job.provider,
        "model": job.model,
        "strategy": job.execution_strategy,
        "status": status,
        "providerBatchId": provider_batch_id,
        "providerStatus": provider_status,
        "correlationId": job.run_id,
        "resultRef": result_ref,
        "error": error,
        "occurredAt": _now_iso(),
    }
