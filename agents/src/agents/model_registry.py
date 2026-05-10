"""Model registry for Noema agent-to-model routing."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class AgentName(StrEnum):
    INGESTION_CONCEPT_EXTRACTION = "ingestion_concept_extraction"
    GRAPH_INTERVENTION_ORCHESTRATOR = "graph_intervention_orchestrator"
    KNOWLEDGE_GRAPH_AGENT = "knowledge_graph_agent"
    CURRICULUM_PLANNER = "curriculum_planner"
    CONTENT_CREATION_ORCHESTRATOR = "content_creation_orchestrator"
    CONTENT_INTENT_NORMALIZER_AGENT = "content_intent_normalizer_agent"
    LEARNER_STATE_SUMMARIZER_AGENT = "learner_state_summarizer_agent"
    CONTENT_PEDAGOGY_PLANNER_AGENT = "content_pedagogy_planner_agent"
    CONTENT_CREATOR_AGENT = "content_creator_agent"
    CONTENT_TRANSFORM_AGENT = "content_transform_agent"
    LESSON_PLAN_GENERATOR = "lesson_plan_generator"
    TAXONOMY_CURATOR = "taxonomy_curator"
    RESEARCH_EVALUATOR_AGENT = "research_evaluator_agent"
    SOCRATIC_TUTOR = "socratic_tutor"
    MENTAL_DEBUGGER = "mental_debugger"
    CALIBRATION_COACH = "calibration_coach"
    PATCH_PLANNER_REMEDIATION_AGENT = "patch_planner_remediation_agent"
    STRATEGY_REPLANNING_AGENT = "strategy_replanning_agent"
    AI_MIRROR_COGNITIVE_COPILOT = "ai_mirror_cognitive_copilot"
    PEDAGOGY_GUARDIAN = "pedagogy_guardian"
    WATCHTOWER_GOVERNANCE_LAYER = "watchtower_governance_layer"
    MODE_PREFERENCE_HELPER = "mode_preference_helper"


class ModelName(StrEnum):
    GEMINI_25_FLASH = "gemini-2.5-flash"
    GEMINI_25_PRO = "gemini-2.5-pro"
    GEMINI_31_FLASH_LITE_PREVIEW = "gemini-3.1-flash-lite-preview"
    GPT_54 = "gpt-5.4"


@dataclass(frozen=True)
class AgentModelConfig:
    primary: ModelName
    fallback: ModelName
    reason: str


@dataclass(frozen=True)
class EscalationPolicy:
    on_schema_failure: bool = True
    on_low_confidence: bool = True
    on_second_repair_attempt: bool = True
    on_high_impact_artifact: bool = True
    on_user_visible_critical_plan: bool = True
    max_automatic_escalations_per_request: int = 1


AGENT_MODEL_MAP: dict[AgentName, AgentModelConfig] = {
    AgentName.INGESTION_CONCEPT_EXTRACTION: AgentModelConfig(
        primary=ModelName.GEMINI_25_FLASH,
        fallback=ModelName.GEMINI_25_PRO,
        reason="High-volume extraction and evidence linking benefit from a cheaper default.",
    ),
    AgentName.GRAPH_INTERVENTION_ORCHESTRATOR: AgentModelConfig(
        primary=ModelName.GEMINI_25_FLASH,
        fallback=ModelName.GEMINI_25_PRO,
        reason="Graph readiness is mostly deterministic with bounded summarization agents.",
    ),
    AgentName.KNOWLEDGE_GRAPH_AGENT: AgentModelConfig(
        primary=ModelName.GEMINI_25_PRO,
        fallback=ModelName.GEMINI_25_FLASH,
        reason="Graph ambiguity, anchor resolution, and relation proposals should stay on Gemini-first routing.",
    ),
    AgentName.CURRICULUM_PLANNER: AgentModelConfig(
        primary=ModelName.GEMINI_25_PRO,
        fallback=ModelName.GEMINI_25_FLASH,
        reason="Curriculum planning and revision must stay Gemini-first across realtime and batch execution.",
    ),
    AgentName.CONTENT_CREATION_ORCHESTRATOR: AgentModelConfig(
        primary=ModelName.GEMINI_25_FLASH,
        fallback=ModelName.GEMINI_25_PRO,
        reason="Content creation orchestration should keep flash/pro escalation within Gemini.",
    ),
    AgentName.CONTENT_INTENT_NORMALIZER_AGENT: AgentModelConfig(
        primary=ModelName.GEMINI_25_FLASH,
        fallback=ModelName.GEMINI_25_PRO,
        reason="Intent normalization is short and structured.",
    ),
    AgentName.LEARNER_STATE_SUMMARIZER_AGENT: AgentModelConfig(
        primary=ModelName.GEMINI_25_FLASH,
        fallback=ModelName.GEMINI_25_PRO,
        reason="Learner state summaries are structured and source-bound.",
    ),
    AgentName.CONTENT_PEDAGOGY_PLANNER_AGENT: AgentModelConfig(
        primary=ModelName.GEMINI_25_FLASH,
        fallback=ModelName.GEMINI_25_PRO,
        reason="Difficulty and variety planning is bounded but should escalate within Gemini on ambiguity.",
    ),
    AgentName.CONTENT_CREATOR_AGENT: AgentModelConfig(
        primary=ModelName.GEMINI_25_FLASH,
        fallback=ModelName.GEMINI_25_PRO,
        reason="Practice material creation is high-volume but must escalate within Gemini when grounding is weak.",
    ),
    AgentName.CONTENT_TRANSFORM_AGENT: AgentModelConfig(
        primary=ModelName.GEMINI_25_FLASH,
        fallback=ModelName.GEMINI_25_PRO,
        reason="Transform drafts are usually bounded rewrites and can stay Gemini-first.",
    ),
    AgentName.LESSON_PLAN_GENERATOR: AgentModelConfig(
        primary=ModelName.GEMINI_25_PRO,
        fallback=ModelName.GEMINI_25_FLASH,
        reason="Session planning, step sequencing, and assessment structure should use Gemini Pro before Flash.",
    ),
    AgentName.TAXONOMY_CURATOR: AgentModelConfig(
        primary=ModelName.GEMINI_25_PRO,
        fallback=ModelName.GEMINI_25_FLASH,
        reason="Ontology, drift, and split-merge decisions should stay on Gemini-first routing.",
    ),
    AgentName.RESEARCH_EVALUATOR_AGENT: AgentModelConfig(
        primary=ModelName.GEMINI_25_PRO,
        fallback=ModelName.GEMINI_25_FLASH,
        reason="Cross-run evaluation, regression detection, and intervention analysis should stay Gemini-first.",
    ),
    AgentName.SOCRATIC_TUTOR: AgentModelConfig(
        primary=ModelName.GEMINI_25_FLASH,
        fallback=ModelName.GEMINI_25_PRO,
        reason="Bounded learner interaction favors fast responses with occasional Gemini Pro fallback.",
    ),
    AgentName.MENTAL_DEBUGGER: AgentModelConfig(
        primary=ModelName.GEMINI_25_PRO,
        fallback=ModelName.GEMINI_25_FLASH,
        reason="Diagnostic explanations need nuance, restraint, and Gemini-first reasoning.",
    ),
    AgentName.CALIBRATION_COACH: AgentModelConfig(
        primary=ModelName.GEMINI_25_FLASH,
        fallback=ModelName.GEMINI_25_PRO,
        reason="Most coaching is short and structured, with infrequent need for deeper reasoning.",
    ),
    AgentName.PATCH_PLANNER_REMEDIATION_AGENT: AgentModelConfig(
        primary=ModelName.GEMINI_25_FLASH,
        fallback=ModelName.GEMINI_25_PRO,
        reason="Repair-shape selection is usually bounded but occasionally needs more nuance.",
    ),
    AgentName.STRATEGY_REPLANNING_AGENT: AgentModelConfig(
        primary=ModelName.GEMINI_25_PRO,
        fallback=ModelName.GEMINI_25_FLASH,
        reason="Runtime adaptation quality affects trust, flow, and should stay on Gemini-first routing.",
    ),
    AgentName.AI_MIRROR_COGNITIVE_COPILOT: AgentModelConfig(
        primary=ModelName.GEMINI_31_FLASH_LITE_PREVIEW,
        fallback=ModelName.GEMINI_25_FLASH,
        reason="Summarization and reflective surfacing should stay inexpensive by default.",
    ),
    AgentName.PEDAGOGY_GUARDIAN: AgentModelConfig(
        primary=ModelName.GEMINI_25_PRO,
        fallback=ModelName.GEMINI_25_FLASH,
        reason="High-stakes validation language and review logic should stay on Gemini-first routing.",
    ),
    AgentName.WATCHTOWER_GOVERNANCE_LAYER: AgentModelConfig(
        primary=ModelName.GEMINI_25_FLASH,
        fallback=ModelName.GEMINI_25_PRO,
        reason="Governance surfacing is frequent and usually lighter than core planning agents.",
    ),
    AgentName.MODE_PREFERENCE_HELPER: AgentModelConfig(
        primary=ModelName.GEMINI_31_FLASH_LITE_PREVIEW,
        fallback=ModelName.GEMINI_25_FLASH,
        reason="Small tie-break decisions do not need an expensive default model.",
    ),
}


HIGH_IMPACT_AGENTS: frozenset[AgentName] = frozenset(
    {
        AgentName.KNOWLEDGE_GRAPH_AGENT,
        AgentName.GRAPH_INTERVENTION_ORCHESTRATOR,
        AgentName.CURRICULUM_PLANNER,
        AgentName.CONTENT_CREATION_ORCHESTRATOR,
        AgentName.LESSON_PLAN_GENERATOR,
        AgentName.TAXONOMY_CURATOR,
        AgentName.RESEARCH_EVALUATOR_AGENT,
        AgentName.MENTAL_DEBUGGER,
        AgentName.STRATEGY_REPLANNING_AGENT,
        AgentName.PEDAGOGY_GUARDIAN,
    }
)


DEFAULT_ESCALATION_POLICY = EscalationPolicy()

_AGENT_NAME_ALIASES: dict[str, AgentName] = {
    "ingestion-concept-extraction": AgentName.INGESTION_CONCEPT_EXTRACTION,
    "ingestion-concept-extraction-agent": AgentName.INGESTION_CONCEPT_EXTRACTION,
    "graph-intervention-orchestrator": AgentName.GRAPH_INTERVENTION_ORCHESTRATOR,
    "knowledge-graph-agent": AgentName.KNOWLEDGE_GRAPH_AGENT,
    "curriculum-outline-planner": AgentName.CURRICULUM_PLANNER,
    "curriculum-planner": AgentName.CURRICULUM_PLANNER,
    "curriculum-revision-agent": AgentName.CURRICULUM_PLANNER,
    "content-creation-orchestrator": AgentName.CONTENT_CREATION_ORCHESTRATOR,
    "content-intent-normalizer-agent": AgentName.CONTENT_INTENT_NORMALIZER_AGENT,
    "learner-state-summarizer-agent": AgentName.LEARNER_STATE_SUMMARIZER_AGENT,
    "content-pedagogy-planner-agent": AgentName.CONTENT_PEDAGOGY_PLANNER_AGENT,
    "content-creator-agent": AgentName.CONTENT_CREATOR_AGENT,
    "content-transform-agent": AgentName.CONTENT_TRANSFORM_AGENT,
    "lesson-plan-generator": AgentName.LESSON_PLAN_GENERATOR,
    "taxonomy-curator": AgentName.TAXONOMY_CURATOR,
    "research-evaluator-agent": AgentName.RESEARCH_EVALUATOR_AGENT,
    "socratic-tutor": AgentName.SOCRATIC_TUTOR,
    "mental-debugger": AgentName.MENTAL_DEBUGGER,
    "calibration-coach": AgentName.CALIBRATION_COACH,
    "patch-planner-remediation-agent": AgentName.PATCH_PLANNER_REMEDIATION_AGENT,
    "strategy-replanning-agent": AgentName.STRATEGY_REPLANNING_AGENT,
    "ai-mirror-cognitive-copilot": AgentName.AI_MIRROR_COGNITIVE_COPILOT,
    "cognitive-copilot": AgentName.AI_MIRROR_COGNITIVE_COPILOT,
    "pedagogy-guardian": AgentName.PEDAGOGY_GUARDIAN,
    "watchtower-governance-layer": AgentName.WATCHTOWER_GOVERNANCE_LAYER,
    "mode-preference-helper": AgentName.MODE_PREFERENCE_HELPER,
}


def resolve_agent_name(agent_name: str | AgentName) -> AgentName:
    """Resolve canonical and route-style agent names to the registry enum."""

    if isinstance(agent_name, AgentName):
        return agent_name
    try:
        return AgentName(agent_name)
    except ValueError:
        pass
    normalized = agent_name.strip().lower()
    if normalized in _AGENT_NAME_ALIASES:
        return _AGENT_NAME_ALIASES[normalized]
    raise ValueError(f"Unknown agent name: {agent_name}")


def model_provider(model_name: str | ModelName) -> str:
    """Return the provider slug for a configured model."""

    normalized = str(model_name)
    if normalized.startswith("gemini-"):
        return "google"
    if normalized.startswith("gpt-"):
        return "openai"
    return "unknown"


def get_agent_model_config(agent_name: str | AgentName) -> AgentModelConfig:
    """Return model routing for a known agent name."""

    return AGENT_MODEL_MAP[resolve_agent_name(agent_name)]


def is_high_impact_agent(agent_name: str | AgentName) -> bool:
    """Return whether this agent should escalate more readily to a premium fallback."""

    return resolve_agent_name(agent_name) in HIGH_IMPACT_AGENTS
