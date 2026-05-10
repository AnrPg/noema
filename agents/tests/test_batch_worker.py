from __future__ import annotations

import os
from typing import Any

import pytest

from src.agents.agent_runtime import AgentRunRequest, AgentRuntime
from src.agents.batch_jobs import TemporarySQLiteBatchJobStore
from src.agents.batch_worker import BatchJobCancellationError, BatchWorker, ServiceArtifactPersister
from src.agents.composite_tools import CompositeToolRegistry
from src.agents.guardian_client import GuardianOutcome
from src.agents.llm_router import (
    LLMRouter,
    ProviderBatchItemResult,
    ProviderBatchPollResult,
    ProviderBatchRequest,
    ProviderBatchResults,
    ProviderBatchSubmission,
)
from src.agents.outbox_dispatcher import OutboxDispatcher


class FakeInvoker:
    async def execute(
        self,
        service: str,
        tool: str,
        payload: dict[str, object],
        *,
        user_id: str | None = None,
    ) -> dict[str, object]:
        fixtures: dict[tuple[str, str], dict[str, object]] = {
            ("curriculum", "get-frontier"): [{"id": "cnode_1", "ckgConceptId": "concept_1"}],
            ("scheduler", "get-due-summary"): {"total": 1, "byQueue": {"repair": 1}},
        }
        return fixtures[(service, tool)]


class AcceptingGuardian:
    async def validate_activity(self, payload: object) -> GuardianOutcome:
        return GuardianOutcome(accepted=True, validationId="guardian_activity_test", reasons=[])

    async def validate_lesson_plan(self, payload: object) -> GuardianOutcome:
        return GuardianOutcome(accepted=True, validationId="guardian_plan_test", reasons=[])

    async def validate_coaching_artifact(self, payload: object) -> GuardianOutcome:
        return GuardianOutcome(accepted=True, validationId="guardian_coach_test", reasons=[])

    async def validate_replan(self, payload: object) -> GuardianOutcome:
        return GuardianOutcome(accepted=True, validationId="guardian_replan_test", reasons=[])


class FakeBatchAdapter:
    provider_name = "google"

    def __init__(self) -> None:
        self._submitted: dict[str, list[ProviderBatchRequest]] = {}

    async def submit_batch(self, requests: list[ProviderBatchRequest]) -> ProviderBatchSubmission:
        batch_id = "provider_batch_1"
        self._submitted[batch_id] = requests
        return ProviderBatchSubmission(
            provider_batch_id=batch_id,
            provider_status="JOB_STATE_QUEUED",
            raw_response={"name": batch_id, "metadata": {"state": "JOB_STATE_QUEUED"}},
        )

    async def get_batch_status(self, provider_batch_id: str) -> ProviderBatchPollResult:
        return ProviderBatchPollResult(
            provider_batch_id=provider_batch_id,
            provider_status="JOB_STATE_SUCCEEDED",
            normalized_status="completed",
            done=True,
            raw_response={"name": provider_batch_id, "metadata": {"state": "JOB_STATE_SUCCEEDED"}},
            error=None,
        )

    async def fetch_batch_results(self, provider_batch_id: str) -> ProviderBatchResults:
        requests = self._submitted[provider_batch_id]
        items = {}
        for request in requests:
            items[request.custom_id] = ProviderBatchItemResult(
                custom_id=request.custom_id,
                status="completed",
                output_text='{"cards":[{"cardType":"definition","conceptIds":["concept_1"],"content":{"front":"What is concept_1?","back":"A generated explanation."},"anchoredCkgNodeIds":["concept_1"],"tags":["generated"],"difficulty":"intermediate"}]}',
                output_json={
                    "cards": [
                        {
                            "cardType": "definition",
                            "conceptIds": ["concept_1"],
                            "anchoredCkgNodeIds": ["concept_1"],
                            "content": {
                                "front": "What is concept_1?",
                                "back": "A generated explanation.",
                            },
                            "tags": ["generated"],
                            "difficulty": "intermediate",
                        }
                    ]
                },
                raw_response={"custom_id": request.custom_id},
                usage={"prompt_tokens": 10, "completion_tokens": 20},
                error=None,
            )
        return ProviderBatchResults(
            provider_batch_id=provider_batch_id,
            provider_status="JOB_STATE_SUCCEEDED",
            items=items,
            raw_response={"name": provider_batch_id},
        )

    async def cancel_batch(self, provider_batch_id: str) -> str:
        return "JOB_STATE_CANCELLED"


class FakePersistenceClient:
    def __init__(self) -> None:
        self.content_payloads: list[dict[str, Any]] = []
        self.lesson_plan_payloads: list[dict[str, Any]] = []
        self.curriculum_payloads: list[dict[str, Any]] = []

    async def import_generated_content_batch(
        self,
        *,
        user_id: str,
        payload: dict[str, Any],
        correlation_id: str,
        idempotency_key: str,
    ) -> dict[str, Any]:
        self.content_payloads.append(
            {
                "userId": user_id,
                "payload": payload,
                "correlationId": correlation_id,
                "idempotencyKey": idempotency_key,
            }
        )
        return {
            "job": {"id": "cgenjob_1", "status": "completed"},
            "batch": {"created": [{"id": "card_1"}], "failed": [], "batchId": idempotency_key},
        }

    async def create_lesson_plan(
        self,
        *,
        user_id: str,
        session_id: str,
        payload: dict[str, Any],
        correlation_id: str,
        idempotency_key: str,
    ) -> dict[str, Any]:
        self.lesson_plan_payloads.append(
            {
                "userId": user_id,
                "sessionId": session_id,
                "payload": payload,
                "correlationId": correlation_id,
                "idempotencyKey": idempotency_key,
            }
        )
        return {"lessonPlan": {"id": "lessonplan_1"}}

    async def import_curriculum_agent_result(
        self,
        *,
        user_id: str,
        payload: dict[str, Any],
        correlation_id: str,
        idempotency_key: str,
    ) -> dict[str, Any]:
        self.curriculum_payloads.append(
            {
                "userId": user_id,
                "payload": payload,
                "correlationId": correlation_id,
                "idempotencyKey": idempotency_key,
            }
        )
        return {"curriculumVersionId": "cver_imported_1", "artifactKind": payload["artifactKind"]}


class FailThenSucceedPersister:
    def __init__(self, failures_before_success: int) -> None:
        self.failures_before_success = failures_before_success
        self.calls = 0

    async def persist(self, *, job: Any, finalized_result: dict[str, Any]) -> dict[str, Any]:
        self.calls += 1
        if self.calls <= self.failures_before_success:
            raise RuntimeError("temporary persistence outage")
        return {
            "artifactKind": "content_drafts",
            "storage": "test-persister",
            "jobId": job.job_id,
            "agentRunId": finalized_result.get("agentRunId"),
        }


class FakeRedisClient:
    def __init__(self, *, fail_first: bool = False) -> None:
        self.fail_first = fail_first
        self.calls = 0
        self.events: list[dict[str, str]] = []

    async def xadd(self, _stream: str, payload: dict[str, str]) -> str:
        self.calls += 1
        if self.fail_first and self.calls == 1:
            raise RuntimeError("redis unavailable")
        self.events.append(payload)
        return str(self.calls)


async def _build_test_worker() -> tuple[TemporarySQLiteBatchJobStore, AgentRuntime, BatchWorker]:
    store = TemporarySQLiteBatchJobStore()
    await store.initialize()
    adapter = FakeBatchAdapter()
    router = LLMRouter(batch_store=store, batch_adapters={"google": adapter})
    runtime = AgentRuntime(
        CompositeToolRegistry(FakeInvoker()),
        AcceptingGuardian(),
        batch_store=store,
        llm_router=router,
    )
    wrappers = runtime._runtime_state()[1]
    worker = BatchWorker(
        batch_store=store,
        router=router,
        guardian=AcceptingGuardian(),
        wrappers=wrappers,
    )
    return store, runtime, worker


@pytest.mark.asyncio
async def test_batch_worker_processes_content_creator_job_end_to_end() -> None:
    store, runtime, worker = await _build_test_worker()

    queued = await runtime.run(
        "content-creator-agent",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "conceptIds": ["concept_1"],
                "desiredCardTypes": ["definition"],
            }
        ),
    )

    assert queued["status"] == "queued"
    assert queued["jobId"] is not None

    submitted = await worker.run_submission_cycle(limit=50)
    assert submitted.submitted == 1

    polled = await worker.run_polling_cycle(limit=50)
    assert polled.polled == 1

    finalized = await worker.run_finalization_cycle(limit=50)
    assert finalized.finalized == 1

    job = await store.get_job(queued["jobId"])
    assert job.status == "completed"
    assert job.result_json is not None
    assert job.result_json["artifactKind"] == "content_drafts"
    assert job.result_json["agentRunId"] == queued["runId"]
    assert job.result_json["cards"][0]["guardianValidationId"] == "guardian_activity_test"
    attempts = await store.list_attempts_for_job(queued["jobId"])
    assert [attempt.attempt_kind for attempt in attempts] == ["submit", "poll", "finalize"]
    events = await store.list_outbox_events_for_job(queued["jobId"])
    assert [event.topic for event in events] == [
        "agent_batch_job.queued",
        "agent_batch_job.submitted",
        "agent_batch_job.completed",
    ]


@pytest.mark.asyncio
async def test_cancel_job_succeeds_only_before_provider_submission() -> None:
    store, runtime, worker = await _build_test_worker()

    queued = await runtime.run(
        "content-creator-agent",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "conceptIds": ["concept_1"],
                "desiredCardTypes": ["definition"],
            }
        ),
    )

    cancelled = await worker.cancel_job(str(queued["jobId"]))
    assert cancelled.status == "cancelled"
    assert cancelled.provider_batch_id is None

    job = await store.get_job(str(queued["jobId"]))
    assert job.status == "cancelled"


@pytest.mark.asyncio
async def test_cancel_job_rejects_provider_submitted_and_completed_jobs() -> None:
    _store, runtime, worker = await _build_test_worker()

    queued = await runtime.run(
        "content-creator-agent",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "conceptIds": ["concept_1"],
                "desiredCardTypes": ["definition"],
            }
        ),
    )

    await worker.run_submission_cycle(limit=50)

    with pytest.raises(BatchJobCancellationError, match="no longer cancellable"):
        await worker.cancel_job(str(queued["jobId"]))

    await worker.run_polling_cycle(limit=50)
    await worker.run_finalization_cycle(limit=50)

    with pytest.raises(BatchJobCancellationError, match="no longer cancellable"):
        await worker.cancel_job(str(queued["jobId"]))


@pytest.mark.asyncio
async def test_service_artifact_persister_uses_idempotent_content_creation_import() -> None:
    client = FakePersistenceClient()
    persister = ServiceArtifactPersister(client)  # type: ignore[arg-type]
    job = TemporarySQLiteBatchJobStore()
    await job.initialize()
    queued_job = await job.enqueue_job(
        run_id="run_1",
        agent_name="content-creator-agent",
        provider="google",
        model="gemini-2.5-flash",
        execution_strategy="batch",
        request_json={
            "userId": "user_1",
            "conceptIds": ["concept_1"],
            "desiredCardTypes": ["definition"],
            "payload": {"mode": "agent_autonomous"},
        },
        context_pack_json={},
        prompt_json=None,
        queued_event_payload={},
    )

    result = await persister.persist(
        job=queued_job,
        finalized_result={
            "agentRunId": "run_1",
            "cards": [
                {
                    "cardType": "definition",
                    "conceptIds": ["concept_1"],
                    "content": {"front": "Q", "back": "A"},
                }
            ],
            "rejectedDrafts": [],
        },
    )

    assert result["storage"] == "content-service"
    assert client.content_payloads[0]["idempotencyKey"] == queued_job.job_id
    assert client.content_payloads[0]["correlationId"] == queued_job.run_id
    assert client.content_payloads[0]["payload"]["job"]["conceptIds"] == ["concept_1"]


@pytest.mark.asyncio
async def test_failed_outbox_events_do_not_look_published() -> None:
    store = TemporarySQLiteBatchJobStore()
    await store.initialize()
    queued_job = await store.enqueue_job(
        run_id="run_2",
        agent_name="content-creator-agent",
        provider="google",
        model="gemini-2.5-flash",
        execution_strategy="batch",
        request_json={"userId": "user_2"},
        context_pack_json={},
        prompt_json=None,
        queued_event_payload={"status": "queued"},
    )

    events = await store.list_outbox_events_for_job(queued_job.job_id)
    await store.mark_outbox_failed([events[0].event_id])
    failed_events = await store.list_outbox_events_for_job(queued_job.job_id)

    assert failed_events[0].status == "failed"
    assert failed_events[0].published_at is None


@pytest.mark.asyncio
async def test_outbox_dispatcher_retries_failed_publications() -> None:
    store = TemporarySQLiteBatchJobStore()
    await store.initialize()
    queued_job = await store.enqueue_job(
        run_id="run_3",
        agent_name="content-creator-agent",
        provider="google",
        model="gemini-2.5-flash",
        execution_strategy="batch",
        request_json={"userId": "user_3"},
        context_pack_json={},
        prompt_json=None,
        queued_event_payload={"status": "queued"},
    )
    dispatcher = OutboxDispatcher(batch_store=store)
    fake_redis = FakeRedisClient(fail_first=True)
    dispatcher._redis = fake_redis

    first = await dispatcher.dispatch_pending(limit=10)
    assert len(first) == 1
    events = await store.list_outbox_events_for_job(queued_job.job_id)
    assert events[0].status == "failed"
    assert events[0].published_at is None

    second = await dispatcher.dispatch_pending(limit=10)
    assert len(second) == 1
    events = await store.list_outbox_events_for_job(queued_job.job_id)
    assert events[0].status == "published"
    assert events[0].published_at is not None
    assert fake_redis.events[0]["event_id"] == events[0].event_id


@pytest.mark.asyncio
async def test_finalization_failed_jobs_are_retried_and_can_recover() -> None:
    store = TemporarySQLiteBatchJobStore()
    await store.initialize()
    adapter = FakeBatchAdapter()
    router = LLMRouter(batch_store=store, batch_adapters={"google": adapter})
    runtime = AgentRuntime(
        CompositeToolRegistry(FakeInvoker()),
        AcceptingGuardian(),
        batch_store=store,
        llm_router=router,
    )
    queued = await runtime.run(
        "content-creator-agent",
        AgentRunRequest.model_validate(
            {"userId": "user_retry", "conceptIds": ["concept_1"], "desiredCardTypes": ["definition"]}
        ),
    )
    wrappers = runtime._runtime_state()[1]
    worker = BatchWorker(
        batch_store=store,
        router=router,
        guardian=AcceptingGuardian(),
        wrappers=wrappers,
        artifact_persister=FailThenSucceedPersister(failures_before_success=1),
    )

    await worker.run_submission_cycle(limit=50)
    await worker.run_polling_cycle(limit=50)
    first = await worker.run_finalization_cycle(limit=50)
    assert first.failed == 1
    job = await store.get_job(queued["jobId"])
    assert job.status == "finalization_failed"

    second = await worker.run_finalization_cycle(limit=50)
    assert second.finalized == 1
    job = await store.get_job(queued["jobId"])
    assert job.status == "completed"


@pytest.mark.asyncio
async def test_finalization_retries_eventually_exhaust_to_failed() -> None:
    store = TemporarySQLiteBatchJobStore()
    await store.initialize()
    adapter = FakeBatchAdapter()
    router = LLMRouter(batch_store=store, batch_adapters={"google": adapter})
    runtime = AgentRuntime(
        CompositeToolRegistry(FakeInvoker()),
        AcceptingGuardian(),
        batch_store=store,
        llm_router=router,
    )
    queued = await runtime.run(
        "content-creator-agent",
        AgentRunRequest.model_validate(
            {"userId": "user_fail", "conceptIds": ["concept_1"], "desiredCardTypes": ["definition"]}
        ),
    )
    wrappers = runtime._runtime_state()[1]
    worker = BatchWorker(
        batch_store=store,
        router=router,
        guardian=AcceptingGuardian(),
        wrappers=wrappers,
        artifact_persister=FailThenSucceedPersister(failures_before_success=99),
    )

    await worker.run_submission_cycle(limit=50)
    await worker.run_polling_cycle(limit=50)
    monkey_old = os.environ.get("AGENTS_BATCH_MAX_FINALIZATION_ATTEMPTS")
    os.environ["AGENTS_BATCH_MAX_FINALIZATION_ATTEMPTS"] = "2"
    try:
        await worker.run_finalization_cycle(limit=50)
        await worker.run_finalization_cycle(limit=50)
        exhausted = await worker.run_finalization_cycle(limit=50)
    finally:
        if monkey_old is None:
            os.environ.pop("AGENTS_BATCH_MAX_FINALIZATION_ATTEMPTS", None)
        else:
            os.environ["AGENTS_BATCH_MAX_FINALIZATION_ATTEMPTS"] = monkey_old

    assert exhausted.failed == 1
    job = await store.get_job(queued["jobId"])
    assert job.status == "failed"
    assert "Finalization retries exhausted" in (job.error_message or "")


@pytest.mark.asyncio
async def test_service_artifact_persister_preserves_lesson_plan_goals_and_topic() -> None:
    client = FakePersistenceClient()
    persister = ServiceArtifactPersister(client)  # type: ignore[arg-type]
    store = TemporarySQLiteBatchJobStore()
    await store.initialize()
    queued_job = await store.enqueue_job(
        run_id="run_lesson_1",
        agent_name="lesson-plan-generator",
        provider="google",
        model="gemini-2.5-pro",
        execution_strategy="batch",
        request_json={
            "sessionId": "session_1",
            "userId": "user_1",
            "curriculumId": "curriculum_1",
            "selectedNodeIds": ["node_1"],
            "payload": {"rigorLevel": "full", "topic": "Fallback topic"},
        },
        context_pack_json={},
        prompt_json=None,
        queued_event_payload={},
    )

    await persister.persist(
        job=queued_job,
        finalized_result={
            "agentRunId": "run_lesson_1",
            "topic": "Generated topic",
            "rationale": "Generated rationale",
            "goals": [
                {
                    "title": "Understand Bayes",
                    "type": "reasoning",
                    "targetNodeIds": ["node_1"],
                }
            ],
            "steps": [
                {
                    "objective": "Explain Bayes theorem",
                    "expectedOutcome": "Learner can explain Bayesian updating",
                    "conceptRefs": ["node_1"],
                    "activity": {"prompt": "Explain Bayes theorem."},
                }
            ],
        },
    )

    payload = client.lesson_plan_payloads[0]["payload"]
    assert payload["topic"] == "Generated topic"
    assert payload["goals"][0]["description"] == "Understand Bayes"
    assert payload["goals"][0]["conceptRefs"] == ["node_1"]


@pytest.mark.asyncio
async def test_service_artifact_persister_imports_curriculum_agent_result() -> None:
    client = FakePersistenceClient()
    persister = ServiceArtifactPersister(client)  # type: ignore[arg-type]
    store = TemporarySQLiteBatchJobStore()
    await store.initialize()
    queued_job = await store.enqueue_job(
        run_id="run_curriculum_1",
        agent_name="curriculum-planner",
        provider="google",
        model="gemini-2.5-pro",
        execution_strategy="batch",
        request_json={
            "userId": "user_1",
            "conceptIds": ["concept_1"],
            "payload": {"goal": "Learn statistics"},
        },
        context_pack_json={},
        prompt_json=None,
        queued_event_payload={},
    )

    result = await persister.persist(
        job=queued_job,
        finalized_result={
            "agentRunId": "run_curriculum_1",
            "artifactKind": "curriculum_draft",
            "nodes": [{"id": "cnode_1", "stableNodeKey": "node_1"}],
            "edges": [],
        },
    )

    assert result["storage"] == "curriculum-service"
    assert client.curriculum_payloads[0]["idempotencyKey"] == queued_job.job_id
    assert client.curriculum_payloads[0]["payload"]["artifactKind"] == "curriculum_draft"


@pytest.mark.asyncio
async def test_service_artifact_persister_keeps_curriculum_outline_local() -> None:
    client = FakePersistenceClient()
    persister = ServiceArtifactPersister(client)  # type: ignore[arg-type]
    store = TemporarySQLiteBatchJobStore()
    await store.initialize()
    queued_job = await store.enqueue_job(
        run_id="run_curriculum_outline_1",
        agent_name="curriculum-outline-planner",
        provider="google",
        model="gemini-2.5-pro",
        execution_strategy="batch",
        request_json={
            "userId": "user_1",
            "payload": {"goal": "Learn statistics", "domain": "probability"},
        },
        context_pack_json={},
        prompt_json=None,
        queued_event_payload={},
    )

    result = await persister.persist(
        job=queued_job,
        finalized_result={
            "agentRunId": "run_curriculum_outline_1",
            "artifactKind": "curriculum_outline",
            "candidateConcepts": [{"label": "Probability"}],
        },
    )

    assert result["storage"] == "agent_batch_jobs.result_json"
    assert client.curriculum_payloads == []


@pytest.mark.asyncio
async def test_batch_worker_finalizes_learner_loop_agents_without_service_mutation() -> None:
    store = TemporarySQLiteBatchJobStore()
    await store.initialize()
    router = LLMRouter(batch_store=store, batch_adapters={})
    worker = BatchWorker(
        batch_store=store,
        router=router,
        guardian=AcceptingGuardian(),
        wrappers={},
    )
    debugger_job = await store.enqueue_job(
        run_id="run_debug_1",
        agent_name="mental-debugger",
        provider="google",
        model="gemini-2.5-pro",
        execution_strategy="batch",
        request_json={"userId": "user_1", "stepId": "step_1"},
        context_pack_json={
            "sections": [
                {
                    "key": "evaluation",
                    "sourceService": "metacognition-service",
                    "authorityLabel": "recorded_fact",
                    "value": {"stepId": "step_1"},
                }
            ]
        },
        prompt_json=None,
        queued_event_payload={},
    )
    await store.store_polled_result(
        job_id=debugger_job.job_id,
        provider_status="completed",
        result_json={
            "providerItem": {
                "outputJson": {
                    "summary": "Reasoning trace",
                    "learnerFacingText": "This trace suggests a skipped check.",
                    "whatWorked": "The first cue was useful.",
                    "whereItSlipped": "The monitoring frame was fragile.",
                    "repairRecommendation": "Try one check-step.",
                    "confidence": "bounded",
                },
                "usage": {},
            }
        },
    )
    patch_job = await store.enqueue_job(
        run_id="run_patch_1",
        agent_name="patch-planner-remediation-agent",
        provider="google",
        model="gemini-2.5-flash",
        execution_strategy="batch",
        request_json={"userId": "user_1", "sessionId": "session_1", "stepId": "step_1", "conceptIds": ["concept_1"]},
        context_pack_json={},
        prompt_json=None,
        queued_event_payload={},
    )
    await store.store_polled_result(
        job_id=patch_job.job_id,
        provider_status="completed",
        result_json={
            "providerItem": {
                "outputJson": {
                    "scope": "local_step",
                    "repairType": "repair_step",
                    "learnerFacingText": "A tiny repair may help here.",
                    "friendlyWhy": "It checks the cue without changing the rest of the plan.",
                    "proposals": [
                        {
                            "kind": "local_step",
                            "ownerService": "session-service",
                            "payload": {"conceptIds": ["concept_1"]},
                            "state": "needs_review",
                        }
                    ],
                },
                "usage": {},
            }
        },
    )
    copilot_job = await store.enqueue_job(
        run_id="run_copilot_1",
        agent_name="cognitive-copilot",
        provider="google",
        model="gemini-2.5-pro",
        execution_strategy="batch",
        request_json={
            "userId": "user_1",
            "sessionId": "session_1",
            "stepId": "step_1",
            "conceptIds": ["concept_1"],
            "payload": {"surface": "sidebar"},
        },
        context_pack_json={
            "sections": [
                {
                    "key": "agentHints",
                    "sourceService": "agents-runtime",
                    "authorityLabel": "agent_inference",
                    "value": [{"summary": "Repair is available"}],
                }
            ]
        },
        prompt_json=None,
        queued_event_payload={},
    )
    await store.store_polled_result(
        job_id=copilot_job.job_id,
        provider_status="completed",
        result_json={
            "providerItem": {
                "outputJson": {
                    "summary": "A repair hint is available.",
                    "hintGroups": [
                        {
                            "category": "repair",
                            "title": "Repair suggestion",
                            "summary": "A repair hint is available.",
                            "source": "metacognition-service",
                            "priority": "medium",
                        }
                    ],
                    "mirrorStatements": ["This reflects current service facts."],
                    "suggestedActions": [
                        {"label": "Show why", "targetSurface": "details", "ownerService": "ui"}
                    ],
                },
                "usage": {},
            }
        },
    )
    watchtower_job = await store.enqueue_job(
        run_id="run_watchtower_1",
        agent_name="watchtower-governance-layer",
        provider="google",
        model="gemini-2.5-flash",
        execution_strategy="batch",
        request_json={"userId": "user_1", "payload": {"surface": "admin", "proposedAction": {"requiresReview": True}}},
        context_pack_json={"sections": [{"key": "policyContext", "sourceService": "agents-runtime", "authorityLabel": "recorded_fact", "value": {}}]},
        prompt_json=None,
        queued_event_payload={},
    )
    await store.store_polled_result(
        job_id=watchtower_job.job_id,
        provider_status="completed",
        result_json={
            "providerItem": {
                "outputJson": {
                    "state": "needs_review",
                    "statusLabel": "Needs review",
                    "friendlyWhy": "This proposal needs review.",
                    "domains": ["human_review", "audit"],
                    "visibilityDecision": "needs_review",
                    "privacyClass": "standard",
                    "requiresReview": True,
                    "auditRequired": True,
                },
                "usage": {},
            }
        },
    )
    taxonomy_job = await store.enqueue_job(
        run_id="run_taxonomy_1",
        agent_name="taxonomy-curator",
        provider="openai",
        model="gpt-5.4",
        execution_strategy="batch",
        request_json={"userId": "user_1", "conceptIds": ["concept_1"], "payload": {"taxonomyDomain": "failure", "labelIds": ["a", "b"]}},
        context_pack_json={"sections": [{"key": "evidenceClusters", "sourceService": "metacognition-service", "authorityLabel": "detected_signal", "value": [{"id": "cluster_1"}]}]},
        prompt_json=None,
        queued_event_payload={},
    )
    await store.store_polled_result(
        job_id=taxonomy_job.job_id,
        provider_status="completed",
        result_json={
            "providerItem": {
                "outputJson": {
                    "state": "needs_curator_review",
                    "statusLabel": "Needs curator review",
                    "friendlyWhy": "Curator review is required.",
                    "proposal": {
                        "changeType": "merge",
                        "ownerService": "metacognition-service",
                        "labelIds": ["a", "b"],
                        "summary": "Merge labels.",
                        "migrationGuidance": "Keep old labels mapped.",
                    },
                    "impactSummary": {"affectedRecordCount": 8},
                },
                "usage": {},
            }
        },
    )

    debugger_result = await worker._finalize_job(await store.get_job(debugger_job.job_id))
    patch_result = await worker._finalize_job(await store.get_job(patch_job.job_id))
    copilot_result = await worker._finalize_job(await store.get_job(copilot_job.job_id))
    watchtower_result = await worker._finalize_job(await store.get_job(watchtower_job.job_id))
    taxonomy_result = await worker._finalize_job(await store.get_job(taxonomy_job.job_id))

    assert debugger_result["artifactKind"] == "debugger_reflection"
    assert debugger_result["persistence"]["storage"] == "agent_batch_jobs.result_json"
    assert patch_result["artifactKind"] == "repair_proposal"
    assert patch_result["persistence"]["storage"] == "agent_batch_jobs.result_json"
    assert patch_result["proposals"][0]["ownerService"] == "session-service"
    assert copilot_result["artifactKind"] == "copilot_readout"
    assert copilot_result["guardianValidationId"] == "guardian_coach_test"
    assert copilot_result["persistence"]["storage"] == "agent_batch_jobs.result_json"
    assert copilot_result["reviewRouting"]["surface"] == "cognitive-copilot-sidebar"
    assert watchtower_result["artifactKind"] == "governance_decision"
    assert watchtower_result["persistence"]["storage"] == "agent_batch_jobs.result_json"
    assert taxonomy_result["artifactKind"] == "taxonomy_proposal"
    assert taxonomy_result["proposal"]["ownerService"] == "metacognition-service"
    assert taxonomy_result["persistence"]["storage"] == "agent_batch_jobs.result_json"
