"""Execution routing metadata for realtime and batch-capable agents."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from .model_registry import AgentName, resolve_agent_name


class ExecutionPreference(StrEnum):
    AUTO = "auto"
    REALTIME = "realtime"
    BATCH = "batch"


@dataclass(frozen=True)
class AgentExecutionConfig:
    batch_allowed: bool
    batch_preferred: bool
    max_latency_seconds: int | None


@dataclass(frozen=True)
class AgentExecutionPlan:
    strategy: ExecutionPreference
    batch_allowed: bool
    batch_preferred: bool
    max_latency_seconds: int | None
    reason: str


AGENT_EXECUTION_MAP: dict[AgentName, AgentExecutionConfig] = {
    AgentName.INGESTION_CONCEPT_EXTRACTION: AgentExecutionConfig(True, True, 3600),
    AgentName.GRAPH_INTERVENTION_ORCHESTRATOR: AgentExecutionConfig(False, False, 10),
    AgentName.KNOWLEDGE_GRAPH_AGENT: AgentExecutionConfig(True, True, 1800),
    AgentName.CURRICULUM_PLANNER: AgentExecutionConfig(True, True, 1800),
    AgentName.CONTENT_CREATION_ORCHESTRATOR: AgentExecutionConfig(False, False, 30),
    AgentName.CONTENT_INTENT_NORMALIZER_AGENT: AgentExecutionConfig(False, False, 5),
    AgentName.LEARNER_STATE_SUMMARIZER_AGENT: AgentExecutionConfig(False, False, 5),
    AgentName.CONTENT_PEDAGOGY_PLANNER_AGENT: AgentExecutionConfig(False, False, 5),
    AgentName.CONTENT_CREATOR_AGENT: AgentExecutionConfig(True, True, 3600),
    AgentName.CONTENT_TRANSFORM_AGENT: AgentExecutionConfig(False, False, 10),
    AgentName.LESSON_PLAN_GENERATOR: AgentExecutionConfig(True, False, 10),
    AgentName.TAXONOMY_CURATOR: AgentExecutionConfig(True, True, 3600),
    AgentName.RESEARCH_EVALUATOR_AGENT: AgentExecutionConfig(True, True, 21600),
    AgentName.SOCRATIC_TUTOR: AgentExecutionConfig(False, False, 2),
    AgentName.MENTAL_DEBUGGER: AgentExecutionConfig(True, False, 5),
    AgentName.CALIBRATION_COACH: AgentExecutionConfig(True, False, 5),
    AgentName.PATCH_PLANNER_REMEDIATION_AGENT: AgentExecutionConfig(True, False, 5),
    AgentName.STRATEGY_REPLANNING_AGENT: AgentExecutionConfig(False, False, 2),
    AgentName.AI_MIRROR_COGNITIVE_COPILOT: AgentExecutionConfig(True, True, 300),
    AgentName.PEDAGOGY_GUARDIAN: AgentExecutionConfig(True, False, 5),
    AgentName.WATCHTOWER_GOVERNANCE_LAYER: AgentExecutionConfig(True, True, 3600),
    AgentName.MODE_PREFERENCE_HELPER: AgentExecutionConfig(False, False, 2),
}


def get_agent_execution_config(agent_name: str | AgentName) -> AgentExecutionConfig:
    """Return batch/realtime execution defaults for an agent."""

    return AGENT_EXECUTION_MAP[resolve_agent_name(agent_name)]


def resolve_execution_plan(
    agent_name: str | AgentName,
    preference: str | ExecutionPreference = ExecutionPreference.AUTO,
) -> AgentExecutionPlan:
    """Resolve the execution strategy the runtime should prefer for a request."""

    resolved_name = resolve_agent_name(agent_name)
    config = AGENT_EXECUTION_MAP[resolved_name]
    resolved_preference = (
        preference if isinstance(preference, ExecutionPreference) else ExecutionPreference(preference)
    )
    if resolved_preference == ExecutionPreference.BATCH and not config.batch_allowed:
        return AgentExecutionPlan(
            strategy=ExecutionPreference.REALTIME,
            batch_allowed=config.batch_allowed,
            batch_preferred=config.batch_preferred,
            max_latency_seconds=config.max_latency_seconds,
            reason="Batch was requested, but this agent must remain realtime.",
        )
    if resolved_preference != ExecutionPreference.AUTO:
        reason = (
            "Explicit execution preference requested by caller."
            if resolved_preference == ExecutionPreference.BATCH
            else "Realtime execution explicitly requested by caller."
        )
        return AgentExecutionPlan(
            strategy=resolved_preference,
            batch_allowed=config.batch_allowed,
            batch_preferred=config.batch_preferred,
            max_latency_seconds=config.max_latency_seconds,
            reason=reason,
        )
    strategy = ExecutionPreference.BATCH if config.batch_allowed and config.batch_preferred else ExecutionPreference.REALTIME
    reason = (
        "Agent is batch-friendly and defaults to deferred execution when latency is not critical."
        if strategy == ExecutionPreference.BATCH
        else "Agent defaults to realtime execution because latency matters to the learner flow."
    )
    return AgentExecutionPlan(
        strategy=strategy,
        batch_allowed=config.batch_allowed,
        batch_preferred=config.batch_preferred,
        max_latency_seconds=config.max_latency_seconds,
        reason=reason,
    )
