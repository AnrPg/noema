// =============================================================================
// BUILT-IN MODE DEFINITIONS
// =============================================================================
// Phase 5A: Define the 4 built-in learning modes as first-class entities.
//
// These are the system modes that ship with Manthanein:
// 1. Exploration - Curiosity-driven wandering
// 2. Goal-Driven - Structured progress toward target
// 3. Exam-Oriented - Time-bounded cramming
// 4. Synthesis - Integration work across contexts
//
// Each mode affects:
// - Navigation suggestions (what to explore next)
// - Review candidate selection & ordering
// - New-card introduction rate
// - Metacognitive prompts and synthesis triggers
// - UI emphasis (pressure vs discovery)
// =============================================================================

import type {
  ModeDefinition,
  SystemModeType,
  ModeParameterSchema,
  ModePolicyAffects,
  AffectedPolicies,
  ModeUiEmphasis,
  LkgcSignalType,
  NormalizedValue,
  Timestamp,
  LearningModeId,
} from "@manthanein/shared";

// Import the default parameters as values
import {
  DEFAULT_EXPLORATION_PARAMETERS,
  DEFAULT_GOAL_DRIVEN_PARAMETERS,
  DEFAULT_EXAM_ORIENTED_PARAMETERS,
  DEFAULT_SYNTHESIS_PARAMETERS,
  createSystemModeId,
} from "@manthanein/shared";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generate a stable mode ID for built-in modes
 */
function generateBuiltInModeId(type: SystemModeType): LearningModeId {
  return createSystemModeId(type);
}

/**
 * Get current timestamp as branded Timestamp type
 */
function now(): Timestamp {
  return Date.now() as Timestamp;
}

/**
 * Convert ModePolicyAffects to AffectedPolicies (required fields only)
 */
function toAffectedPolicies(affects: ModePolicyAffects): AffectedPolicies {
  return {
    navigation: affects.navigation,
    reviewSelection: affects.reviewSelection,
    cardOrdering: affects.cardOrdering,
    newCardIntroduction: affects.newCardIntroduction,
    schedulingParameters: affects.schedulingParameters ?? affects.scheduling,
    metacognitivePrompts: affects.metacognitivePrompts,
    synthesisTriggers: affects.synthesisTriggers,
    uiEmphasis: affects.uiEmphasis ?? affects.ui,
    categoryBehavior: affects.categoryBehavior,
  };
}

// =============================================================================
// PARAMETER SCHEMAS
// =============================================================================

const EXPLORATION_PARAMETER_SCHEMA: ModeParameterSchema = {
  parameters: [
    {
      key: "exploration_new_card_rate",
      label: "New Card Introduction Rate",
      description:
        "How aggressively to introduce new cards (0 = never, 1 = always)",
      type: "percentage",
      defaultValue: 0.3,
      required: false,
      range: { min: 0, max: 1, step: 0.05 },
      uiGroup: "discovery",
      advanced: false,
    },
    {
      key: "association_hop_limit",
      label: "Association Hop Limit",
      description: "How many edges away to explore from current context",
      type: "number",
      defaultValue: 2,
      required: false,
      range: { min: 1, max: 5, step: 1 },
      uiGroup: "discovery",
      advanced: false,
    },
    {
      key: "novelty_weight",
      label: "Novelty Weight",
      description: "How much to prioritize novel content over familiar",
      type: "percentage",
      defaultValue: 0.4,
      required: false,
      range: { min: 0, max: 1, step: 0.05 },
      uiGroup: "scoring",
      advanced: true,
    },
    {
      key: "bridge_bonus_weight",
      label: "Bridge Card Bonus",
      description: "Extra priority for cards connecting multiple contexts",
      type: "percentage",
      defaultValue: 0.3,
      required: false,
      range: { min: 0, max: 1, step: 0.05 },
      uiGroup: "scoring",
      advanced: true,
    },
    {
      key: "overdue_penalty_reduction",
      label: "Overdue Penalty Reduction",
      description:
        "Reduce urgency pressure from overdue cards (0 = full pressure, 1 = no pressure)",
      type: "percentage",
      defaultValue: 0.5,
      required: false,
      range: { min: 0, max: 1, step: 0.1 },
      uiGroup: "scoring",
      advanced: true,
    },
    {
      key: "serendipity_frequency",
      label: "Serendipity Frequency",
      description: "How often to inject random discovery prompts",
      type: "percentage",
      defaultValue: 0.15,
      required: false,
      range: { min: 0, max: 0.5, step: 0.05 },
      uiGroup: "discovery",
      advanced: false,
    },
  ],
  uiGroups: [
    {
      id: "discovery",
      label: "Discovery Settings",
      description: "Control how new content is discovered",
      order: 1,
    },
    {
      id: "scoring",
      label: "Scoring Weights",
      description: "Fine-tune how items are prioritized",
      collapsed: true,
      order: 2,
    },
  ],
};

const GOAL_DRIVEN_PARAMETER_SCHEMA: ModeParameterSchema = {
  parameters: [
    {
      key: "prerequisite_depth",
      label: "Prerequisite Depth",
      description: "How many levels of prerequisites to enforce",
      type: "number",
      defaultValue: 3,
      required: false,
      range: { min: 1, max: 10, step: 1 },
      uiGroup: "structure",
      advanced: false,
    },
    {
      key: "strictness_level",
      label: "Strictness Level",
      description:
        "How strictly to enforce prerequisite completion (0 = soft, 1 = hard gating)",
      type: "percentage",
      defaultValue: 0.7,
      required: false,
      range: { min: 0, max: 1, step: 0.1 },
      uiGroup: "structure",
      advanced: false,
    },
    {
      key: "tangential_suppression",
      label: "Tangential Content Suppression",
      description: "How much to deprioritize content not on the goal path",
      type: "percentage",
      defaultValue: 0.6,
      required: false,
      range: { min: 0, max: 1, step: 0.1 },
      uiGroup: "focus",
      advanced: false,
    },
    {
      key: "foundation_stability_threshold",
      label: "Foundation Stability Threshold",
      description:
        "Minimum stability required before advancing to dependent content",
      type: "percentage",
      defaultValue: 0.8,
      required: false,
      range: { min: 0.5, max: 1, step: 0.05 },
      uiGroup: "structure",
      advanced: true,
    },
    {
      key: "gap_alert_sensitivity",
      label: "Gap Alert Sensitivity",
      description:
        "How sensitive to be when detecting gaps in prerequisite chain",
      type: "percentage",
      defaultValue: 0.5,
      required: false,
      range: { min: 0, max: 1, step: 0.1 },
      uiGroup: "structure",
      advanced: true,
    },
    {
      key: "progress_update_frequency",
      label: "Progress Update Frequency",
      description: "How often to show progress updates",
      type: "enum",
      defaultValue: "per_review",
      required: false,
      enumOptions: [
        {
          value: "per_review",
          label: "After Each Review",
          description: "Show progress after every card",
        },
        {
          value: "per_session",
          label: "Per Session",
          description: "Show progress once per session",
        },
        {
          value: "on_milestone",
          label: "On Milestones",
          description: "Only show on significant progress",
        },
      ],
      uiGroup: "feedback",
      advanced: false,
    },
  ],
  uiGroups: [
    {
      id: "structure",
      label: "Prerequisite Structure",
      description: "How to handle prerequisite relationships",
      order: 1,
    },
    {
      id: "focus",
      label: "Focus Settings",
      description: "Control distraction and tangential content",
      order: 2,
    },
    {
      id: "feedback",
      label: "Progress Feedback",
      description: "How to display progress toward goal",
      collapsed: true,
      order: 3,
    },
  ],
};

const EXAM_ORIENTED_PARAMETER_SCHEMA: ModeParameterSchema = {
  parameters: [
    {
      key: "cram_aggressiveness",
      label: "Cram Aggressiveness",
      description:
        "How aggressively to surface at-risk content (0 = gentle, 1 = aggressive)",
      type: "percentage",
      defaultValue: 0.7,
      required: false,
      range: { min: 0, max: 1, step: 0.1 },
      uiGroup: "strategy",
      advanced: false,
    },
    {
      key: "breadth_vs_depth_slider",
      label: "Breadth vs Depth",
      description:
        "Focus on breadth of coverage vs depth of understanding (0 = depth, 1 = breadth)",
      type: "range",
      defaultValue: 0.6,
      required: false,
      range: { min: 0, max: 1, step: 0.1 },
      uiGroup: "strategy",
      advanced: false,
    },
    {
      key: "confidence_deprioritization_strength",
      label: "Confident Content Deprioritization",
      description: "How much to deprioritize content you already know well",
      type: "percentage",
      defaultValue: 0.4,
      required: false,
      range: { min: 0, max: 1, step: 0.1 },
      uiGroup: "strategy",
      advanced: true,
    },
    {
      key: "coverage_window_days",
      label: "Coverage Window (Days)",
      description: "How many days before exam to optimize coverage for",
      type: "number",
      defaultValue: 7,
      required: false,
      range: { min: 1, max: 30, step: 1 },
      uiGroup: "timing",
      advanced: false,
    },
    {
      key: "recovery_mode_duration_days",
      label: "Recovery Mode Duration (Days)",
      description: "How long to stay in recovery mode after exam",
      type: "number",
      defaultValue: 14,
      required: false,
      range: { min: 1, max: 30, step: 1 },
      uiGroup: "timing",
      advanced: true,
    },
    {
      key: "daily_time_budget_minutes",
      label: "Daily Time Budget (Minutes)",
      description: "Target study time per day",
      type: "number",
      defaultValue: 60,
      required: false,
      range: { min: 15, max: 240, step: 15 },
      uiGroup: "timing",
      advanced: false,
    },
  ],
  uiGroups: [
    {
      id: "strategy",
      label: "Study Strategy",
      description: "How to approach exam preparation",
      order: 1,
    },
    {
      id: "timing",
      label: "Timing & Budget",
      description: "Time-related settings",
      order: 2,
    },
  ],
};

const SYNTHESIS_PARAMETER_SCHEMA: ModeParameterSchema = {
  parameters: [
    {
      key: "bridge_priority",
      label: "Bridge Card Priority",
      description: "Priority boost for cards that bridge multiple contexts",
      type: "percentage",
      defaultValue: 0.8,
      required: false,
      range: { min: 0, max: 1, step: 0.1 },
      uiGroup: "synthesis",
      advanced: false,
    },
    {
      key: "comparison_frequency",
      label: "Comparison Prompt Frequency",
      description: "How often to prompt for cross-context comparisons",
      type: "percentage",
      defaultValue: 0.3,
      required: false,
      range: { min: 0, max: 0.5, step: 0.05 },
      uiGroup: "synthesis",
      advanced: false,
    },
    {
      key: "allowed_edge_types_for_paths",
      label: "Allowed Edge Types for Paths",
      description:
        "Which relationship types to follow when building synthesis paths",
      type: "category_list",
      defaultValue: ["prepares_for", "contrasts_with", "analogous_to"],
      required: false,
      uiGroup: "synthesis",
      advanced: true,
    },
    {
      key: "challenge_difficulty",
      label: "Challenge Difficulty",
      description:
        "Difficulty level for synthesis challenges (0 = easy, 1 = hard)",
      type: "percentage",
      defaultValue: 0.5,
      required: false,
      range: { min: 0, max: 1, step: 0.1 },
      uiGroup: "challenge",
      advanced: false,
    },
    {
      key: "synthesis_prompt_thresholds",
      label: "Synthesis Prompt Thresholds",
      description: "Conditions for triggering synthesis prompts",
      type: "string",
      defaultValue: JSON.stringify({
        min_participations: 2,
        min_divergence: 0.2,
      }),
      required: false,
      uiGroup: "synthesis",
      advanced: true,
    },
    {
      key: "constellation_challenge_enabled",
      label: "Constellation Challenges",
      description: "Enable multi-card constellation synthesis challenges",
      type: "boolean",
      defaultValue: true,
      required: false,
      uiGroup: "challenge",
      advanced: false,
    },
  ],
  uiGroups: [
    {
      id: "synthesis",
      label: "Synthesis Settings",
      description: "Control cross-context integration",
      order: 1,
    },
    {
      id: "challenge",
      label: "Challenge Settings",
      description: "Configure synthesis challenges",
      order: 2,
    },
  ],
};

// =============================================================================
// POLICY AFFECTS
// =============================================================================

const EXPLORATION_POLICY_AFFECTS: ModePolicyAffects = {
  navigation: true,
  reviewSelection: true,
  cardOrdering: true,
  newCardIntroduction: true,
  scheduling: false,
  schedulingParameters: false,
  ui: true,
  uiEmphasis: true,
  metacognitivePrompts: true,
  synthesisTriggers: false,
  categoryBehavior: false,
};

const GOAL_DRIVEN_POLICY_AFFECTS: ModePolicyAffects = {
  navigation: true,
  reviewSelection: true,
  cardOrdering: true,
  newCardIntroduction: true,
  scheduling: true,
  schedulingParameters: true,
  ui: true,
  uiEmphasis: true,
  metacognitivePrompts: true,
  synthesisTriggers: false,
  categoryBehavior: true,
};

const EXAM_ORIENTED_POLICY_AFFECTS: ModePolicyAffects = {
  navigation: false,
  reviewSelection: true,
  cardOrdering: true,
  newCardIntroduction: true,
  scheduling: true,
  schedulingParameters: true,
  ui: true,
  uiEmphasis: true,
  metacognitivePrompts: true,
  synthesisTriggers: false,
  categoryBehavior: true,
};

const SYNTHESIS_POLICY_AFFECTS: ModePolicyAffects = {
  navigation: true,
  reviewSelection: true,
  cardOrdering: true,
  newCardIntroduction: false,
  scheduling: false,
  schedulingParameters: false,
  ui: true,
  uiEmphasis: true,
  metacognitivePrompts: true,
  synthesisTriggers: true,
  categoryBehavior: true,
};

// =============================================================================
// UI EMPHASIS
// =============================================================================

const EXPLORATION_UI_EMPHASIS: ModeUiEmphasis = {
  pressureLevel: 0.2 as NormalizedValue,
  showTimer: false,
  showProgress: false,
  showStreaks: true,
  showEstimates: false,
  showOverdueIndicators: false,
  showTimePressure: false,
  showDiscoveryPrompts: true,
  showSynthesisPrompts: false,
  showMetacognitiveSignals: true,
  cardTransitionSpeed: "slow",
  feedbackDetail: "detailed",
  coverageVsDepth: 0.3, // Slight depth preference
  cardDisplayDensity: "detailed",
};

const GOAL_DRIVEN_UI_EMPHASIS: ModeUiEmphasis = {
  pressureLevel: 0.5 as NormalizedValue,
  showTimer: false,
  showProgress: true,
  showStreaks: true,
  showEstimates: true,
  showOverdueIndicators: true,
  showTimePressure: false,
  showDiscoveryPrompts: false,
  showSynthesisPrompts: false,
  showMetacognitiveSignals: true,
  cardTransitionSpeed: "normal",
  feedbackDetail: "standard",
  coverageVsDepth: -0.5, // Depth preference
  cardDisplayDensity: "normal",
};

const EXAM_ORIENTED_UI_EMPHASIS: ModeUiEmphasis = {
  pressureLevel: 0.8 as NormalizedValue,
  showTimer: true,
  showProgress: true,
  showStreaks: false,
  showEstimates: true,
  showOverdueIndicators: true,
  showTimePressure: true,
  showDiscoveryPrompts: false,
  showSynthesisPrompts: false,
  showMetacognitiveSignals: false,
  cardTransitionSpeed: "fast",
  feedbackDetail: "minimal",
  coverageVsDepth: 0.7, // Strong breadth preference
  cardDisplayDensity: "compact",
};

const SYNTHESIS_UI_EMPHASIS: ModeUiEmphasis = {
  pressureLevel: 0.3 as NormalizedValue,
  showTimer: false,
  showProgress: false,
  showStreaks: true,
  showEstimates: false,
  showOverdueIndicators: false,
  showTimePressure: false,
  showDiscoveryPrompts: true,
  showSynthesisPrompts: true,
  showMetacognitiveSignals: true,
  cardTransitionSpeed: "slow",
  feedbackDetail: "detailed",
  coverageVsDepth: 0, // Balanced
  cardDisplayDensity: "detailed",
};

// =============================================================================
// LKGC SIGNALS
// =============================================================================

const EXPLORATION_LKGC_SIGNALS: {
  consumed: LkgcSignalType[];
  amplified: LkgcSignalType[];
} = {
  consumed: [
    "novelty_score",
    "exploration_potential",
    "serendipity_score",
    "cross_context_stability",
    "mastery_level",
  ],
  amplified: ["novelty_score", "exploration_potential", "serendipity_score"],
};

const GOAL_DRIVEN_LKGC_SIGNALS: {
  consumed: LkgcSignalType[];
  amplified: LkgcSignalType[];
} = {
  consumed: [
    "stability",
    "retrievability",
    "prerequisite_completion",
    "blocking_gap",
    "learning_velocity",
    "structural_maturity",
  ],
  amplified: ["blocking_gap", "prerequisite_completion"],
};

const EXAM_ORIENTED_LKGC_SIGNALS: {
  consumed: LkgcSignalType[];
  amplified: LkgcSignalType[];
} = {
  consumed: [
    "forgetting_risk",
    "retrievability",
    "overdue_pressure",
    "difficulty",
    "stability",
    "half_life",
  ],
  amplified: ["forgetting_risk", "overdue_pressure"],
};

const SYNTHESIS_LKGC_SIGNALS: {
  consumed: LkgcSignalType[];
  amplified: LkgcSignalType[];
} = {
  consumed: [
    "cross_context_stability",
    "context_fragmentation",
    "synthesis_depth",
    "interference_risk",
    "mastery_level",
  ],
  amplified: ["synthesis_depth", "cross_context_stability"],
};

// =============================================================================
// MODE DEFINITIONS
// =============================================================================

/**
 * Create the Exploration mode definition
 */
export function createExplorationMode(): ModeDefinition {
  const timestamp = now();
  return {
    id: generateBuiltInModeId("exploration"),
    name: "Exploration",
    description:
      "Curiosity-driven wandering through your knowledge ecosystem. " +
      "Discover connections, follow associations, and embrace serendipity. " +
      "Overdue cards are gently deprioritized to reduce pressure.",
    tagline: "Follow your curiosity",
    icon: "🔍",
    systemType: "exploration",
    source: "system",
    version: "1.0.0",
    parameterSchema: EXPLORATION_PARAMETER_SCHEMA,
    defaultParameters: { ...DEFAULT_EXPLORATION_PARAMETERS },
    affectedPolicies: toAffectedPolicies(EXPLORATION_POLICY_AFFECTS),
    consumedLkgcSignals: EXPLORATION_LKGC_SIGNALS.consumed,
    amplifiedLkgcSignals: EXPLORATION_LKGC_SIGNALS.amplified,
    uiEmphasis: EXPLORATION_UI_EMPHASIS,
    suggestedViewLens: "knowledge_network",
    colorTheme: {
      primary: "#7C3AED", // Purple
      secondary: "#A78BFA",
      accent: "#DDD6FE",
    },
    enabledByDefault: true,
    supportsCategoryDefault: true,
    supportsSessionOverride: true,
    requiredCapabilities: [
      "navigation_feed",
      "review_policy",
      "explainability_provider",
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Create the Goal-Driven mode definition
 */
export function createGoalDrivenMode(): ModeDefinition {
  const timestamp = now();
  return {
    id: generateBuiltInModeId("goal_driven"),
    name: "Goal-Driven",
    description:
      "Structured progress toward a learning target. " +
      "Prerequisites are enforced, tangential content is suppressed, " +
      "and progress toward your goal is prominently displayed.",
    tagline: "Structured path to mastery",
    icon: "🎯",
    systemType: "goal_driven",
    source: "system",
    version: "1.0.0",
    parameterSchema: GOAL_DRIVEN_PARAMETER_SCHEMA,
    defaultParameters: { ...DEFAULT_GOAL_DRIVEN_PARAMETERS },
    affectedPolicies: toAffectedPolicies(GOAL_DRIVEN_POLICY_AFFECTS),
    consumedLkgcSignals: GOAL_DRIVEN_LKGC_SIGNALS.consumed,
    amplifiedLkgcSignals: GOAL_DRIVEN_LKGC_SIGNALS.amplified,
    uiEmphasis: GOAL_DRIVEN_UI_EMPHASIS,
    suggestedViewLens: "hierarchy",
    colorTheme: {
      primary: "#059669", // Green
      secondary: "#34D399",
      accent: "#A7F3D0",
    },
    enabledByDefault: true,
    supportsCategoryDefault: true,
    supportsSessionOverride: true,
    requiredCapabilities: [
      "navigation_feed",
      "review_policy",
      "card_ordering",
      "explainability_provider",
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Create the Exam-Oriented mode definition
 */
export function createExamOrientedMode(): ModeDefinition {
  const timestamp = now();
  return {
    id: generateBuiltInModeId("exam_oriented"),
    name: "Exam-Oriented",
    description:
      "Time-bounded preparation for an assessment. " +
      "Maximize coverage within time constraints, " +
      "prioritize at-risk content, and optimize for retention.",
    tagline: "Prepare for the test",
    icon: "📝",
    systemType: "exam_oriented",
    source: "system",
    version: "1.0.0",
    parameterSchema: EXAM_ORIENTED_PARAMETER_SCHEMA,
    defaultParameters: { ...DEFAULT_EXAM_ORIENTED_PARAMETERS },
    affectedPolicies: toAffectedPolicies(EXAM_ORIENTED_POLICY_AFFECTS),
    consumedLkgcSignals: EXAM_ORIENTED_LKGC_SIGNALS.consumed,
    amplifiedLkgcSignals: EXAM_ORIENTED_LKGC_SIGNALS.amplified,
    uiEmphasis: EXAM_ORIENTED_UI_EMPHASIS,
    suggestedViewLens: "flat",
    colorTheme: {
      primary: "#DC2626", // Red
      secondary: "#F87171",
      accent: "#FECACA",
    },
    enabledByDefault: true,
    supportsCategoryDefault: true,
    supportsSessionOverride: true,
    requiredCapabilities: [
      "review_policy",
      "card_ordering",
      "scheduling_modifier",
      "explainability_provider",
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Create the Synthesis mode definition
 */
export function createSynthesisMode(): ModeDefinition {
  const timestamp = now();
  return {
    id: generateBuiltInModeId("synthesis"),
    name: "Synthesis",
    description:
      "Integration work across contexts. " +
      "Bridge concepts from different domains, " +
      "compare and contrast perspectives, and build connections.",
    tagline: "Connect the dots",
    icon: "🔗",
    systemType: "synthesis",
    source: "system",
    version: "1.0.0",
    parameterSchema: SYNTHESIS_PARAMETER_SCHEMA,
    defaultParameters: { ...DEFAULT_SYNTHESIS_PARAMETERS },
    affectedPolicies: toAffectedPolicies(SYNTHESIS_POLICY_AFFECTS),
    consumedLkgcSignals: SYNTHESIS_LKGC_SIGNALS.consumed,
    amplifiedLkgcSignals: SYNTHESIS_LKGC_SIGNALS.amplified,
    uiEmphasis: SYNTHESIS_UI_EMPHASIS,
    suggestedViewLens: "knowledge_network",
    colorTheme: {
      primary: "#2563EB", // Blue
      secondary: "#60A5FA",
      accent: "#BFDBFE",
    },
    enabledByDefault: true,
    supportsCategoryDefault: true,
    supportsSessionOverride: true,
    requiredCapabilities: [
      "navigation_feed",
      "review_policy",
      "synthesis_triggers",
      "metacognitive_prompts",
      "explainability_provider",
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Get all built-in mode definitions
 */
export function getAllBuiltInModes(): ModeDefinition[] {
  return [
    createExplorationMode(),
    createGoalDrivenMode(),
    createExamOrientedMode(),
    createSynthesisMode(),
  ];
}

/**
 * Get a built-in mode by system type
 */
export function getBuiltInModeByType(
  type: SystemModeType,
): ModeDefinition | undefined {
  switch (type) {
    case "exploration":
      return createExplorationMode();
    case "goal_driven":
      return createGoalDrivenMode();
    case "exam_oriented":
      return createExamOrientedMode();
    case "synthesis":
      return createSynthesisMode();
    default:
      return undefined;
  }
}

/**
 * Check if a mode ID is a built-in system mode
 */
export function isSystemModeId(modeId: string): boolean {
  return modeId.startsWith("system:");
}

/**
 * Extract system type from a system mode ID
 */
export function extractSystemType(modeId: string): SystemModeType | undefined {
  if (!isSystemModeId(modeId)) return undefined;
  const type = modeId.replace("system:", "");
  if (
    type === "exploration" ||
    type === "goal_driven" ||
    type === "exam_oriented" ||
    type === "synthesis"
  ) {
    return type;
  }
  return undefined;
}

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

export const BuiltInModes = {
  createExplorationMode,
  createGoalDrivenMode,
  createExamOrientedMode,
  createSynthesisMode,
  getAllBuiltInModes,
  getBuiltInModeByType,
  isSystemModeId,
  extractSystemType,
};
