from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from src.agents.agent_runtime import AgentRunRequest, AgentRuntime
from src.agents.composite_tools import CompositeToolRegistry
from src.agents.guardian_client import GuardianOutcome
from src.agents.telemetry import AgentTelemetryStore

if TYPE_CHECKING:
    from pathlib import Path


class FakeInvoker:
    async def execute(
        self,
        service: str,
        tool: str,
        payload: dict[str, object],
        *,
        user_id: str | None = None,
    ) -> dict[str, object]:
        _ = payload
        _ = user_id
        fixtures: dict[tuple[str, str], dict[str, object]] = {
            ("session", "get-session"): {"id": "session_1", "status": "active"},
            ("curriculum", "get-session-slice"): {
                "selectedNodeIds": ["cnode_1"],
                "conceptIds": ["concept_1"],
                "rationale": ["frontier priority"],
            },
            ("session", "get-step-loop-snapshot"): {"currentStep": {"id": "step_1"}},
            ("metacognition", "get-agent-safe-diagnostic-brief"): {
                "stepId": "step_1",
                "conceptRefs": ["concept_1"],
                "combinedScore": 0.5,
            },
            ("metacognition", "get-remediation-brief"): {
                "stepId": "step_1",
                "conceptRefs": ["concept_1"],
                "recommendedAction": "insert_repair_step",
                "triggersFired": ["trigger_1"],
            },
            ("scheduler", "explain-schedule-state"): {
                "conceptId": "concept_1",
                "queue": "repair",
                "explanation": "Concept needs repair before forward progress.",
            },
            ("curriculum", "get-frontier"): [{"id": "cnode_1", "ckgConceptId": "concept_1"}],
            ("scheduler", "get-due-summary"): {"total": 2, "byQueue": {"repair": 1}},
            ("metacognition", "get-reasoning-average"): {
                "conceptId": "concept_1",
                "averageReasoning": 0.61,
                "sampleCount": 4,
            },
            ("scheduler", "get-concept-schedule"): {
                "conceptId": "concept_1",
                "queue": "repair",
                "dueAt": "2026-05-04T12:00:00+00:00",
            },
        }
        return fixtures[(service, tool)]


class AcceptingGuardian:
    async def validate_activity(self, payload: object) -> GuardianOutcome:
        _ = payload
        return GuardianOutcome(accepted=True, validationId="guardian_activity_test", reasons=[])

    async def validate_lesson_plan(self, payload: object) -> GuardianOutcome:
        _ = payload
        return GuardianOutcome(accepted=True, validationId="guardian_plan_test", reasons=[])


@pytest.mark.asyncio
async def test_runtime_persists_run_details_and_exports(tmp_path: Path) -> None:
    store = AgentTelemetryStore(str(tmp_path / "agents-admin.sqlite3"))
    runtime = AgentRuntime(
        CompositeToolRegistry(FakeInvoker()),
        AcceptingGuardian(),
        telemetry_store=store,
    )

    result = await runtime.run(
        "lesson-plan-generator",
        AgentRunRequest.model_validate(
            {
                "userId": "user_1",
                "sessionId": "session_1",
                "curriculumId": "curr_1",
                "selectedNodeIds": ["cnode_1"],
                "selectedCardIds": ["card_1"],
            }
        ),
    )

    detail = store.get_run_detail(str(result["runId"]))
    markdown_export = store.get_or_create_export(str(result["runId"]), "md")
    json_export = store.get_or_create_export(str(result["runId"]), "json")

    assert detail["status"] == "completed"
    assert detail["toolCalls"]
    assert detail["events"]
    assert detail["transcript"]["agentName"] == "lesson-plan-generator"
    assert markdown_export["fileName"].endswith(".md")
    assert detail["runId"] in markdown_export["content"]
    assert json_export["fileName"].endswith(".json")
    assert '"agentName": "lesson-plan-generator"' in json_export["content"]


def test_config_draft_activation_updates_runtime_state(tmp_path: Path) -> None:
    store = AgentTelemetryStore(str(tmp_path / "agents-admin.sqlite3"))
    runtime = AgentRuntime(
        CompositeToolRegistry(FakeInvoker()),
        AcceptingGuardian(),
        telemetry_store=store,
    )

    active_wrapper = runtime.get_wrapper("cognitive-copilot")
    config = store.get_agent_config("cognitive-copilot")
    active_version = config["active"]
    assert active_version is not None

    draft = store.create_config_draft(
        agent_name="cognitive-copilot",
        actor_user_id="admin_1",
        notes="Disable for maintenance.",
        wrapper={
            **active_version["wrapper"],
            "enabled": False,
            "displayName": "Cognitive Copilot (Paused)",
        },
        tool_belt=active_version["toolBelt"],
    )
    store.activate_config_draft(version_id=str(draft["versionId"]), actor_user_id="admin_1")

    updated_wrapper = runtime.get_wrapper("cognitive-copilot")

    assert active_wrapper["enabled"] is True
    assert updated_wrapper["enabled"] is False
    assert updated_wrapper["displayName"] == "Cognitive Copilot (Paused)"


def test_bootstrap_configs_refreshes_system_defaults_when_bootstrapped_rows_drift(tmp_path: Path) -> None:
    store = AgentTelemetryStore(str(tmp_path / "agents-admin.sqlite3"))
    runtime = AgentRuntime(
        CompositeToolRegistry(FakeInvoker()),
        AcceptingGuardian(),
        telemetry_store=store,
    )

    initial = runtime.get_wrapper("curriculum-planner")
    assert initial["provider"] == "google"
    assert initial["model"] == "gemini-2.5-pro"

    config = store.get_agent_config("curriculum-planner")
    active_version = config["active"]
    assert active_version is not None

    store.update_config_draft(
        version_id=str(
            store.create_config_draft(
                agent_name="curriculum-planner",
                actor_user_id="system_bootstrap",
                notes="Temporary drift for bootstrap refresh test.",
                wrapper={
                    **active_version["wrapper"],
                    "provider": "openai",
                    "model": "gpt-5.4",
                },
                tool_belt=active_version["toolBelt"],
            )["versionId"]
        ),
        actor_user_id="system_bootstrap",
        wrapper={
            **active_version["wrapper"],
            "provider": "openai",
            "model": "gpt-5.4",
        },
        tool_belt=active_version["toolBelt"],
        notes="Temporary drift for bootstrap refresh test.",
    )

    drift_draft = store.get_agent_config("curriculum-planner")["drafts"][0]
    store.activate_config_draft(version_id=str(drift_draft["versionId"]), actor_user_id="system_bootstrap")

    refreshed = runtime.get_wrapper("curriculum-planner")
    assert refreshed["provider"] == "google"
    assert refreshed["model"] == "gemini-2.5-pro"
