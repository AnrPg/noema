// =============================================================================
// SNAPSHOT PROFILE DEFINITIONS - Built-in Profiles for AI Integration
// =============================================================================
// Defines the 6 canonical snapshot profiles:
// 1. SchedulingSnapshot - Review prioritization & memory parameters
// 2. ConfusionDetectionSnapshot - Interference & confusion detection
// 3. PrerequisiteGraphSnapshot - Graph structure optimization
// 4. StrategyEfficacySnapshot - Learning strategy effectiveness
// 5. CalibrationTrainingSnapshot - Metacognitive calibration
// 6. SessionRegulationSnapshot - Self-regulation support
//
// Each profile is versioned, declarative, and bounded.
// =============================================================================

import type { Duration, NormalizedValue } from "../../types/lkgc/foundation";
import type {
  SnapshotProfileDefinition,
  SnapshotProfileId,
  ProfileBudgetBounds,
  ProfileTemporalBounds,
  ProfileGraphBounds,
  TieredBudgets,
  MasterySignalScope,
  ContextSignalScope,
  SnapshotPrivacyRules,
  TargetSelectionCriteria,
  ExpectedOutput,
} from "./snapshot-types";
import { now } from "../id-generator";

// =============================================================================
// HELPER: Create profile ID
// =============================================================================

function profileId(name: string, version: number): SnapshotProfileId {
  return `profile_${name}_v${version}` as SnapshotProfileId;
}

// =============================================================================
// 1. SCHEDULING SNAPSHOT v1
// =============================================================================

const SCHEDULING_BUDGET_BOUNDS: ProfileBudgetBounds = {
  maxNodes: { default: 500, min: 50, max: 2000 },
  maxEdges: { default: 1000, min: 100, max: 5000 },
  maxMasteryStates: { default: 500, min: 50, max: 2000 },
  maxFeatures: { default: 2000, min: 200, max: 10000 },
  maxPayloadBytes: { default: 1_000_000, min: 100_000, max: 5_000_000 },
};

const SCHEDULING_TIERED_BUDGETS: TieredBudgets = {
  minimal: {
    maxNodes: 100,
    maxEdges: 200,
    maxMasteryStates: 100,
    maxFeatures: 500,
    maxPayloadBytes: 200_000,
  },
  standard: {
    maxNodes: 500,
    maxEdges: 1000,
    maxMasteryStates: 500,
    maxFeatures: 2000,
    maxPayloadBytes: 1_000_000,
  },
  extended: {
    maxNodes: 2000,
    maxEdges: 5000,
    maxMasteryStates: 2000,
    maxFeatures: 10000,
    maxPayloadBytes: 5_000_000,
  },
};

const SCHEDULING_TEMPORAL_BOUNDS: ProfileTemporalBounds = {
  recentAttempts: { default: 20, min: 5, max: 50 },
  recentSessions: { default: 5, min: 1, max: 20 },
  rollingWindowDays: { default: 30, min: 7, max: 90 },
  maxLookbackDays: { default: 365, min: 30, max: 730 },
};

const SCHEDULING_GRAPH_BOUNDS: ProfileGraphBounds = {
  maxHops: { default: 1, min: 1, max: 2 },
  allowableEdgeTypes: [
    "part_of",
    "prerequisite_of",
    "frequently_confused_with",
    "targets_goal",
    "introduced_in_path_step",
  ],
  mandatoryExcludedEdgeTypes: [],
  allowableNodeTypes: ["card", "concept", "goal", "learning_path"],
  mandatoryExcludedNodeTypes: ["resource"],
};

const SCHEDULING_MASTERY_SCOPE: MasterySignalScope = {
  includeMemory: true,
  includeEvidence: true,
  includeMetacognition: true, // Limited to calibration only
  includeForgetting: true,
  includeGeneralization: false,
  includeCognitiveLoad: false,
  includeAffect: false,
  includeTrust: false,
  fieldWhitelist: [
    // Memory
    "memory.stability",
    "memory.difficulty",
    "memory.retrievability",
    "memory.halfLife",
    "memory.learningState",
    "memory.reps",
    "memory.lapses",
    "memory.streak",
    "memory.dueDate",
    "memory.lastReview",
    // Evidence
    "evidence.totalReviews",
    "evidence.reviewsByOutcome",
    "evidence.avgResponseTime",
    "evidence.hintDependencyRatio",
    // Forgetting
    "forgetting.interferenceIndex",
    // Metacognition (minimal)
    "metacognition.calibration.bias",
    "metacognition.calibration.confidenceAccuracyCorrelation",
  ],
  fieldBlacklist: [],
};

const SCHEDULING_CONTEXT_SCOPE: ContextSignalScope = {
  includeMode: true,
  includeTimeBudget: true,
  includeFatigueMotivation: true,
  includeDevice: true,
  includeTimeOfDay: true,
  includeGoals: true,
  includeStreak: true,
};

const SCHEDULING_PRIVACY_RULES: SnapshotPrivacyRules = {
  allowReflectionText: false,
  allowReflectionSummaries: false,
  allowRubricScores: true,
  allowStrategyTags: true,
  allowErrorAttribution: false,
  allowConfidencePredictions: true,
  maxTextLength: 0,
  requireExplicitConsent: false,
};

const SCHEDULING_TARGET_CRITERIA: TargetSelectionCriteria = {
  description:
    "Card nodes that are due/near-due (24-72h), recently failed (48h), or blocking dependents",
  targetNodeTypes: ["card"],
  targetGranularities: ["card"],
  dueFilter: {
    dueWithin: (72 * 60 * 60 * 1000) as Duration, // 72 hours
    overdueWithin: (48 * 60 * 60 * 1000) as Duration, // 48 hours
  },
  failureFilter: {
    failedWithin: (48 * 60 * 60 * 1000) as Duration, // 48 hours
    minFailures: 1,
  },
  blockingFilter: {
    minBlockedDependents: 3,
  },
};

const SCHEDULING_EXPECTED_OUTPUTS: readonly ExpectedOutput[] = [
  {
    type: "ranked_candidates",
    required: true,
    description: "Ranked list of review candidates with priority scores",
  },
  {
    type: "memory_parameter_proposals",
    required: false,
    description: "Non-binding memory parameter updates (stability, difficulty)",
  },
  {
    type: "scheduling_hints",
    required: false,
    description: "Suggested next-due dates (non-authoritative)",
  },
];

export const SCHEDULING_SNAPSHOT_V1: SnapshotProfileDefinition = {
  profileId: profileId("SchedulingSnapshot", 1),
  name: "SchedulingSnapshot",
  version: 1,
  purpose:
    "Enable AI/heuristic policies to prioritize review items, estimate memory parameters, and propose scheduling hints",
  description: `
    The SchedulingSnapshot provides data for:
    - Prioritizing review queue items
    - Estimating memory parameters (stability, difficulty, retrievability)
    - Proposing next-due hints (non-authoritative)
    
    Targets card nodes that are due/near-due, recently failed, or blocking dependents.
    Includes 1-hop graph context with key relationships (part_of, prerequisite_of, confused_with).
    Temporal scope covers last 20 attempts, 30-day rolling window, last 5 sessions.
  `,
  definedAt: now(),
  isActive: true,
  targetCriteria: SCHEDULING_TARGET_CRITERIA,
  graphBounds: SCHEDULING_GRAPH_BOUNDS,
  budgetBounds: SCHEDULING_BUDGET_BOUNDS,
  tieredBudgets: SCHEDULING_TIERED_BUDGETS,
  temporalBounds: SCHEDULING_TEMPORAL_BOUNDS,
  signalScope: {
    mastery: SCHEDULING_MASTERY_SCOPE,
    context: SCHEDULING_CONTEXT_SCOPE,
  },
  privacyRules: SCHEDULING_PRIVACY_RULES,
  expectedOutputs: SCHEDULING_EXPECTED_OUTPUTS,
  tags: ["scheduling", "memory", "review", "core"],
};

// =============================================================================
// 2. CONFUSION DETECTION SNAPSHOT v1
// =============================================================================

const CONFUSION_BUDGET_BOUNDS: ProfileBudgetBounds = {
  maxNodes: { default: 300, min: 50, max: 1000 },
  maxEdges: { default: 2000, min: 200, max: 10000 },
  maxMasteryStates: { default: 300, min: 50, max: 1000 },
  maxFeatures: { default: 3000, min: 300, max: 15000 },
  maxPayloadBytes: { default: 1_500_000, min: 150_000, max: 7_500_000 },
};

const CONFUSION_TIERED_BUDGETS: TieredBudgets = {
  minimal: {
    maxNodes: 50,
    maxEdges: 200,
    maxMasteryStates: 50,
    maxFeatures: 300,
    maxPayloadBytes: 150_000,
  },
  standard: {
    maxNodes: 300,
    maxEdges: 2000,
    maxMasteryStates: 300,
    maxFeatures: 3000,
    maxPayloadBytes: 1_500_000,
  },
  extended: {
    maxNodes: 1000,
    maxEdges: 10000,
    maxMasteryStates: 1000,
    maxFeatures: 15000,
    maxPayloadBytes: 7_500_000,
  },
};

const CONFUSION_TEMPORAL_BOUNDS: ProfileTemporalBounds = {
  recentAttempts: { default: 50, min: 20, max: 100 },
  recentSessions: { default: 10, min: 3, max: 30 },
  rollingWindowDays: { default: 30, min: 14, max: 90 },
  maxLookbackDays: { default: 180, min: 30, max: 365 },
};

const CONFUSION_GRAPH_BOUNDS: ProfileGraphBounds = {
  maxHops: { default: 2, min: 1, max: 3 },
  allowableEdgeTypes: [
    "frequently_confused_with",
    "prerequisite_of",
    "analogous_to",
    "contrasts_with",
    "defines",
    "uses",
    "example_of",
    "counterexample_of",
    "part_of",
  ],
  mandatoryExcludedEdgeTypes: ["targets_goal"],
  allowableNodeTypes: ["card", "concept"],
  mandatoryExcludedNodeTypes: ["goal", "quest", "badge", "boss", "reward"],
};

const CONFUSION_MASTERY_SCOPE: MasterySignalScope = {
  includeMemory: true,
  includeEvidence: true,
  includeMetacognition: true,
  includeForgetting: true,
  includeGeneralization: false,
  includeCognitiveLoad: false,
  includeAffect: false,
  includeTrust: false,
  fieldWhitelist: [
    // Memory
    "memory.difficulty",
    "memory.retrievability",
    "memory.lapses",
    // Evidence
    "evidence.reviewsByOutcome",
    "evidence.avgResponseTime",
    "evidence.responseTimeTrend",
    "evidence.answerChangeCount",
    "evidence.hintUsageCount",
    // Forgetting
    "forgetting.interferenceIndex",
    "forgetting.confusionPairs",
    // Metacognition
    "metacognition.calibration.bias",
  ],
  fieldBlacklist: [],
};

const CONFUSION_CONTEXT_SCOPE: ContextSignalScope = {
  includeMode: false,
  includeTimeBudget: false,
  includeFatigueMotivation: false,
  includeDevice: true, // Device/time splits to avoid false confusions
  includeTimeOfDay: true,
  includeGoals: false,
  includeStreak: false,
};

const CONFUSION_PRIVACY_RULES: SnapshotPrivacyRules = {
  allowReflectionText: false,
  allowReflectionSummaries: false,
  allowRubricScores: false,
  allowStrategyTags: false,
  allowErrorAttribution: true, // Important for confusion detection
  allowConfidencePredictions: true,
  maxTextLength: 0,
  requireExplicitConsent: false,
};

const CONFUSION_TARGET_CRITERIA: TargetSelectionCriteria = {
  description:
    "Concept nodes with high interference index, repeated clustered lapses, or high answer-change/peek frequency",
  targetNodeTypes: ["concept", "card"],
  targetGranularities: ["concept", "card"],
  interferenceFilter: {
    minInterferenceIndex: 0.3 as NormalizedValue,
  },
  failureFilter: {
    failedWithin: (30 * 24 * 60 * 60 * 1000) as Duration, // 30 days
    minFailures: 3,
  },
};

const CONFUSION_EXPECTED_OUTPUTS: readonly ExpectedOutput[] = [
  {
    type: "confusion_edge_proposals",
    required: true,
    description:
      "Proposed frequently_confused_with edges with weights, evidence count, and confidence",
  },
  {
    type: "clustering_results",
    required: false,
    description:
      "Suggested confusion drill sets (clusters of confusable items)",
  },
];

export const CONFUSION_DETECTION_SNAPSHOT_V1: SnapshotProfileDefinition = {
  profileId: profileId("ConfusionDetectionSnapshot", 1),
  name: "ConfusionDetectionSnapshot",
  version: 1,
  purpose:
    "Detect concept/card confusion pairs, interference clusters, and candidates for frequently_confused_with edges",
  description: `
    The ConfusionDetectionSnapshot provides data for:
    - Identifying confusion pairs
    - Detecting interference clusters
    - Proposing new frequently_confused_with edges
    
    Targets concepts with high interference index, clustered lapses, or high answer-change frequency.
    Includes 2-hop graph context with confusion-related edge types.
    Emphasizes pairwise history, co-failure rates, and error patterns.
  `,
  definedAt: now(),
  isActive: true,
  targetCriteria: CONFUSION_TARGET_CRITERIA,
  graphBounds: CONFUSION_GRAPH_BOUNDS,
  budgetBounds: CONFUSION_BUDGET_BOUNDS,
  tieredBudgets: CONFUSION_TIERED_BUDGETS,
  temporalBounds: CONFUSION_TEMPORAL_BOUNDS,
  signalScope: {
    mastery: CONFUSION_MASTERY_SCOPE,
    context: CONFUSION_CONTEXT_SCOPE,
  },
  privacyRules: CONFUSION_PRIVACY_RULES,
  expectedOutputs: CONFUSION_EXPECTED_OUTPUTS,
  tags: ["confusion", "interference", "graph", "detection"],
};

// =============================================================================
// 3. PREREQUISITE GRAPH SNAPSHOT v1
// =============================================================================

const PREREQ_BUDGET_BOUNDS: ProfileBudgetBounds = {
  maxNodes: { default: 400, min: 50, max: 1500 },
  maxEdges: { default: 3000, min: 200, max: 15000 },
  maxMasteryStates: { default: 400, min: 50, max: 1500 },
  maxFeatures: { default: 2000, min: 200, max: 10000 },
  maxPayloadBytes: { default: 2_000_000, min: 200_000, max: 10_000_000 },
};

const PREREQ_TIERED_BUDGETS: TieredBudgets = {
  minimal: {
    maxNodes: 50,
    maxEdges: 200,
    maxMasteryStates: 50,
    maxFeatures: 200,
    maxPayloadBytes: 200_000,
  },
  standard: {
    maxNodes: 400,
    maxEdges: 3000,
    maxMasteryStates: 400,
    maxFeatures: 2000,
    maxPayloadBytes: 2_000_000,
  },
  extended: {
    maxNodes: 1500,
    maxEdges: 15000,
    maxMasteryStates: 1500,
    maxFeatures: 10000,
    maxPayloadBytes: 10_000_000,
  },
};

const PREREQ_TEMPORAL_BOUNDS: ProfileTemporalBounds = {
  recentAttempts: { default: 30, min: 10, max: 100 },
  recentSessions: { default: 15, min: 5, max: 50 },
  rollingWindowDays: { default: 90, min: 30, max: 180 },
  maxLookbackDays: { default: 365, min: 60, max: 730 },
};

const PREREQ_GRAPH_BOUNDS: ProfileGraphBounds = {
  maxHops: { default: 3, min: 2, max: 4 },
  allowableEdgeTypes: [
    "prerequisite_of",
    "part_of",
    "introduced_in_path_step",
    "assessed_by",
    "practiced_by",
  ],
  mandatoryExcludedEdgeTypes: ["frequently_confused_with"],
  allowableNodeTypes: ["concept", "card", "learning_path", "goal"],
  mandatoryExcludedNodeTypes: ["quest", "badge", "boss", "reward"],
};

const PREREQ_MASTERY_SCOPE: MasterySignalScope = {
  includeMemory: true,
  includeEvidence: true,
  includeMetacognition: false,
  includeForgetting: false,
  includeGeneralization: true,
  includeCognitiveLoad: false,
  includeAffect: false,
  includeTrust: false,
  fieldWhitelist: [
    // Memory
    "memory.stability",
    "memory.retrievability",
    "memory.learningState",
    // Evidence
    "evidence.totalReviews",
    "evidence.recentAccuracy",
    "evidence.accuracyTrend",
    // Generalization
    "generalization.transferScore",
    "generalization.coverageScore",
  ],
  fieldBlacklist: [],
};

const PREREQ_CONTEXT_SCOPE: ContextSignalScope = {
  includeMode: false,
  includeTimeBudget: false,
  includeFatigueMotivation: false,
  includeDevice: false,
  includeTimeOfDay: false,
  includeGoals: true,
  includeStreak: false,
};

const PREREQ_PRIVACY_RULES: SnapshotPrivacyRules = {
  allowReflectionText: false,
  allowReflectionSummaries: false,
  allowRubricScores: false,
  allowStrategyTags: false,
  allowErrorAttribution: false,
  allowConfidencePredictions: false,
  maxTextLength: 0,
  requireExplicitConsent: false,
};

const PREREQ_TARGET_CRITERIA: TargetSelectionCriteria = {
  description:
    "Concepts in active learning paths/goals, or with high blocking score (many dependents + low mastery)",
  targetNodeTypes: ["concept"],
  targetGranularities: ["concept"],
  blockingFilter: {
    minBlockedDependents: 2,
  },
};

const PREREQ_EXPECTED_OUTPUTS: readonly ExpectedOutput[] = [
  {
    type: "prerequisite_edge_proposals",
    required: true,
    description:
      "Proposed prerequisite edge adjustments (add, remove, or reweight)",
  },
  {
    type: "scheduling_hints",
    required: false,
    description: "Reordered path suggestions and remedial micro-paths",
  },
];

export const PREREQUISITE_GRAPH_SNAPSHOT_V1: SnapshotProfileDefinition = {
  profileId: profileId("PrerequisiteGraphSnapshot", 1),
  name: "PrerequisiteGraphSnapshot",
  version: 1,
  purpose:
    "Improve prerequisite structure, learning path ordering, and bottleneck detection",
  description: `
    The PrerequisiteGraphSnapshot provides data for:
    - Analyzing prerequisite structure
    - Detecting learning bottlenecks
    - Suggesting path reordering
    - Proposing remedial micro-paths
    
    Targets concepts in active learning paths or with high blocking scores.
    Includes 3-hop graph context focused on prerequisite relationships.
    Temporal scope emphasizes trends over 60-90 days.
  `,
  definedAt: now(),
  isActive: true,
  targetCriteria: PREREQ_TARGET_CRITERIA,
  graphBounds: PREREQ_GRAPH_BOUNDS,
  budgetBounds: PREREQ_BUDGET_BOUNDS,
  tieredBudgets: PREREQ_TIERED_BUDGETS,
  temporalBounds: PREREQ_TEMPORAL_BOUNDS,
  signalScope: {
    mastery: PREREQ_MASTERY_SCOPE,
    context: PREREQ_CONTEXT_SCOPE,
  },
  privacyRules: PREREQ_PRIVACY_RULES,
  expectedOutputs: PREREQ_EXPECTED_OUTPUTS,
  tags: ["prerequisite", "graph", "path", "bottleneck"],
};

// =============================================================================
// 4. STRATEGY EFFICACY SNAPSHOT v1
// =============================================================================

const STRATEGY_BUDGET_BOUNDS: ProfileBudgetBounds = {
  maxNodes: { default: 200, min: 30, max: 500 },
  maxEdges: { default: 500, min: 50, max: 2000 },
  maxMasteryStates: { default: 200, min: 30, max: 500 },
  maxFeatures: { default: 1500, min: 150, max: 7500 },
  maxPayloadBytes: { default: 800_000, min: 80_000, max: 4_000_000 },
};

const STRATEGY_TIERED_BUDGETS: TieredBudgets = {
  minimal: {
    maxNodes: 30,
    maxEdges: 50,
    maxMasteryStates: 30,
    maxFeatures: 150,
    maxPayloadBytes: 80_000,
  },
  standard: {
    maxNodes: 200,
    maxEdges: 500,
    maxMasteryStates: 200,
    maxFeatures: 1500,
    maxPayloadBytes: 800_000,
  },
  extended: {
    maxNodes: 500,
    maxEdges: 2000,
    maxMasteryStates: 500,
    maxFeatures: 7500,
    maxPayloadBytes: 4_000_000,
  },
};

const STRATEGY_TEMPORAL_BOUNDS: ProfileTemporalBounds = {
  recentAttempts: { default: 40, min: 20, max: 100 },
  recentSessions: { default: 20, min: 5, max: 50 },
  rollingWindowDays: { default: 90, min: 30, max: 180 },
  maxLookbackDays: { default: 365, min: 90, max: 730 },
};

const STRATEGY_GRAPH_BOUNDS: ProfileGraphBounds = {
  maxHops: { default: 2, min: 1, max: 3 },
  allowableEdgeTypes: [
    "best_learned_with_strategy",
    "reflection_about",
    "targets_goal",
    "part_of",
  ],
  mandatoryExcludedEdgeTypes: [],
  allowableNodeTypes: ["strategy", "concept", "card", "reflection", "goal"],
  mandatoryExcludedNodeTypes: [],
};

const STRATEGY_MASTERY_SCOPE: MasterySignalScope = {
  includeMemory: true,
  includeEvidence: true,
  includeMetacognition: true,
  includeForgetting: false,
  includeGeneralization: false,
  includeCognitiveLoad: false,
  includeAffect: true,
  includeTrust: false,
  fieldWhitelist: [
    // Memory
    "memory.stability",
    "memory.retrievability",
    // Evidence
    "evidence.recentAccuracy",
    "evidence.accuracyTrend",
    // Metacognition
    "metacognition.strategyUsage",
    "metacognition.reflection.completionRate",
    "metacognition.reflection.averageQuality",
    // Affect
    "affect.frustration.combined",
    "affect.flow.combined",
  ],
  fieldBlacklist: [],
};

const STRATEGY_CONTEXT_SCOPE: ContextSignalScope = {
  includeMode: true,
  includeTimeBudget: false,
  includeFatigueMotivation: true,
  includeDevice: false,
  includeTimeOfDay: false,
  includeGoals: true,
  includeStreak: false,
};

const STRATEGY_PRIVACY_RULES: SnapshotPrivacyRules = {
  allowReflectionText: false,
  allowReflectionSummaries: true, // Strategy analysis benefits from reflection summaries
  allowRubricScores: true,
  allowStrategyTags: true,
  allowErrorAttribution: false,
  allowConfidencePredictions: false,
  maxTextLength: 500, // Limited summaries
  requireExplicitConsent: true, // Reflection summaries require consent
};

const STRATEGY_TARGET_CRITERIA: TargetSelectionCriteria = {
  description:
    "Strategy nodes, concepts/cards with strategy usage history, and reflection artifacts",
  targetNodeTypes: ["strategy", "concept", "card"],
  targetGranularities: ["concept", "card"],
};

const STRATEGY_EXPECTED_OUTPUTS: readonly ExpectedOutput[] = [
  {
    type: "strategy_efficacy_proposals",
    required: true,
    description: "Personalized strategy rankings per domain",
  },
  {
    type: "session_regulation_hints",
    required: false,
    description: "Trigger rules for strategy prompts",
  },
  {
    type: "confusion_edge_proposals",
    required: false,
    description: "Proposed best_learned_with_strategy edges",
  },
];

export const STRATEGY_EFFICACY_SNAPSHOT_V1: SnapshotProfileDefinition = {
  profileId: profileId("StrategyEfficacySnapshot", 1),
  name: "StrategyEfficacySnapshot",
  version: 1,
  purpose:
    "Learn which learning strategies work for this user, in which domains, and when to trigger meta-coaching",
  description: `
    The StrategyEfficacySnapshot provides data for:
    - Analyzing strategy effectiveness per user/domain
    - Ranking strategies by measured uplift
    - Detecting when to trigger strategy prompts
    - Proposing best_learned_with edges
    
    Targets strategy nodes and items with strategy usage history.
    Includes reflection quality correlation and pre/post-strategy windows.
    Temporal scope emphasizes 90-day rolling analysis with 7/14/30-day windows.
  `,
  definedAt: now(),
  isActive: true,
  targetCriteria: STRATEGY_TARGET_CRITERIA,
  graphBounds: STRATEGY_GRAPH_BOUNDS,
  budgetBounds: STRATEGY_BUDGET_BOUNDS,
  tieredBudgets: STRATEGY_TIERED_BUDGETS,
  temporalBounds: STRATEGY_TEMPORAL_BOUNDS,
  signalScope: {
    mastery: STRATEGY_MASTERY_SCOPE,
    context: STRATEGY_CONTEXT_SCOPE,
  },
  privacyRules: STRATEGY_PRIVACY_RULES,
  expectedOutputs: STRATEGY_EXPECTED_OUTPUTS,
  tags: ["strategy", "metacognition", "reflection", "personalization"],
};

// =============================================================================
// 5. CALIBRATION TRAINING SNAPSHOT v1
// =============================================================================

const CALIBRATION_BUDGET_BOUNDS: ProfileBudgetBounds = {
  maxNodes: { default: 150, min: 30, max: 500 },
  maxEdges: { default: 200, min: 50, max: 1000 },
  maxMasteryStates: { default: 150, min: 30, max: 500 },
  maxFeatures: { default: 2000, min: 200, max: 10000 },
  maxPayloadBytes: { default: 600_000, min: 60_000, max: 3_000_000 },
};

const CALIBRATION_TIERED_BUDGETS: TieredBudgets = {
  minimal: {
    maxNodes: 30,
    maxEdges: 50,
    maxMasteryStates: 30,
    maxFeatures: 200,
    maxPayloadBytes: 60_000,
  },
  standard: {
    maxNodes: 150,
    maxEdges: 200,
    maxMasteryStates: 150,
    maxFeatures: 2000,
    maxPayloadBytes: 600_000,
  },
  extended: {
    maxNodes: 500,
    maxEdges: 1000,
    maxMasteryStates: 500,
    maxFeatures: 10000,
    maxPayloadBytes: 3_000_000,
  },
};

const CALIBRATION_TEMPORAL_BOUNDS: ProfileTemporalBounds = {
  recentAttempts: { default: 200, min: 50, max: 500 },
  recentSessions: { default: 30, min: 10, max: 100 },
  rollingWindowDays: { default: 90, min: 30, max: 180 },
  maxLookbackDays: { default: 365, min: 90, max: 730 },
};

const CALIBRATION_GRAPH_BOUNDS: ProfileGraphBounds = {
  maxHops: { default: 1, min: 1, max: 2 },
  allowableEdgeTypes: ["part_of", "targets_goal", "mentions"],
  mandatoryExcludedEdgeTypes: [],
  allowableNodeTypes: ["card", "concept", "goal"],
  mandatoryExcludedNodeTypes: [],
};

const CALIBRATION_MASTERY_SCOPE: MasterySignalScope = {
  includeMemory: true,
  includeEvidence: true,
  includeMetacognition: true, // Full metacognition for calibration
  includeForgetting: false,
  includeGeneralization: false,
  includeCognitiveLoad: false,
  includeAffect: false,
  includeTrust: false,
  fieldWhitelist: [
    // Memory
    "memory.difficulty",
    "memory.retrievability",
    // Evidence (for outcome tracking)
    "evidence.totalReviews",
    "evidence.reviewsByOutcome",
    "evidence.recentAccuracy",
    // Metacognition (full calibration)
    "metacognition.calibration",
  ],
  fieldBlacklist: [],
};

const CALIBRATION_CONTEXT_SCOPE: ContextSignalScope = {
  includeMode: true,
  includeTimeBudget: false,
  includeFatigueMotivation: false,
  includeDevice: false,
  includeTimeOfDay: false,
  includeGoals: true,
  includeStreak: false,
};

const CALIBRATION_PRIVACY_RULES: SnapshotPrivacyRules = {
  allowReflectionText: false,
  allowReflectionSummaries: false,
  allowRubricScores: false,
  allowStrategyTags: false,
  allowErrorAttribution: true, // Error attribution helps calibration
  allowConfidencePredictions: true, // Core for calibration
  maxTextLength: 0,
  requireExplicitConsent: false,
};

const CALIBRATION_TARGET_CRITERIA: TargetSelectionCriteria = {
  description:
    "Items with confidence/recall predictions, grouped by domain (tags, concepts)",
  targetNodeTypes: ["card", "concept"],
  targetGranularities: ["card", "concept"],
};

const CALIBRATION_EXPECTED_OUTPUTS: readonly ExpectedOutput[] = [
  {
    type: "calibration_metrics",
    required: true,
    description: "Calibration metrics (Brier score, ECE, bias) per domain",
  },
  {
    type: "session_regulation_hints",
    required: false,
    description:
      "Recommended calibration interventions and probe moment thresholds",
  },
];

export const CALIBRATION_TRAINING_SNAPSHOT_V1: SnapshotProfileDefinition = {
  profileId: profileId("CalibrationTrainingSnapshot", 1),
  name: "CalibrationTrainingSnapshot",
  version: 1,
  purpose:
    "Train metacognitive calibration: confidence accuracy, bias awareness, prediction skill",
  description: `
    The CalibrationTrainingSnapshot provides data for:
    - Computing calibration metrics (Brier, ECE, bias, resolution)
    - Detecting calibration patterns by domain
    - Recommending calibration interventions
    - Identifying optimal "probe moments" for confidence prompts
    
    Targets items with prediction history.
    Minimal graph context — focus is on statistical analysis.
    Temporal scope covers last 200 predictions or 90 days.
  `,
  definedAt: now(),
  isActive: true,
  targetCriteria: CALIBRATION_TARGET_CRITERIA,
  graphBounds: CALIBRATION_GRAPH_BOUNDS,
  budgetBounds: CALIBRATION_BUDGET_BOUNDS,
  tieredBudgets: CALIBRATION_TIERED_BUDGETS,
  temporalBounds: CALIBRATION_TEMPORAL_BOUNDS,
  signalScope: {
    mastery: CALIBRATION_MASTERY_SCOPE,
    context: CALIBRATION_CONTEXT_SCOPE,
  },
  privacyRules: CALIBRATION_PRIVACY_RULES,
  expectedOutputs: CALIBRATION_EXPECTED_OUTPUTS,
  tags: ["calibration", "metacognition", "confidence", "prediction"],
};

// =============================================================================
// 6. SESSION REGULATION SNAPSHOT v1
// =============================================================================

const SESSION_BUDGET_BOUNDS: ProfileBudgetBounds = {
  maxNodes: { default: 100, min: 20, max: 300 },
  maxEdges: { default: 150, min: 30, max: 500 },
  maxMasteryStates: { default: 100, min: 20, max: 300 },
  maxFeatures: { default: 1000, min: 100, max: 5000 },
  maxPayloadBytes: { default: 400_000, min: 40_000, max: 2_000_000 },
};

const SESSION_TIERED_BUDGETS: TieredBudgets = {
  minimal: {
    maxNodes: 20,
    maxEdges: 30,
    maxMasteryStates: 20,
    maxFeatures: 100,
    maxPayloadBytes: 40_000,
  },
  standard: {
    maxNodes: 100,
    maxEdges: 150,
    maxMasteryStates: 100,
    maxFeatures: 1000,
    maxPayloadBytes: 400_000,
  },
  extended: {
    maxNodes: 300,
    maxEdges: 500,
    maxMasteryStates: 300,
    maxFeatures: 5000,
    maxPayloadBytes: 2_000_000,
  },
};

const SESSION_TEMPORAL_BOUNDS: ProfileTemporalBounds = {
  recentAttempts: { default: 100, min: 30, max: 300 },
  recentSessions: { default: 30, min: 10, max: 100 },
  rollingWindowDays: { default: 30, min: 7, max: 60 },
  maxLookbackDays: { default: 90, min: 30, max: 180 },
};

const SESSION_GRAPH_BOUNDS: ProfileGraphBounds = {
  maxHops: { default: 1, min: 1, max: 2 },
  allowableEdgeTypes: ["targets_goal", "introduced_in_path_step", "part_of"],
  mandatoryExcludedEdgeTypes: [],
  allowableNodeTypes: ["goal", "card", "concept"],
  mandatoryExcludedNodeTypes: [],
};

const SESSION_MASTERY_SCOPE: MasterySignalScope = {
  includeMemory: false,
  includeEvidence: true,
  includeMetacognition: true,
  includeForgetting: false,
  includeGeneralization: false,
  includeCognitiveLoad: true,
  includeAffect: true,
  includeTrust: false,
  fieldWhitelist: [
    // Evidence
    "evidence.avgResponseTime",
    "evidence.responseTimeTrend",
    // Metacognition
    "metacognition.selfRegulation",
    // Cognitive Load
    "cognitiveLoad",
    // Affect
    "affect.frustration",
    "affect.flow",
    "affect.boredom",
  ],
  fieldBlacklist: [],
};

const SESSION_CONTEXT_SCOPE: ContextSignalScope = {
  includeMode: true,
  includeTimeBudget: true,
  includeFatigueMotivation: true,
  includeDevice: true,
  includeTimeOfDay: true,
  includeGoals: true,
  includeStreak: true,
};

const SESSION_PRIVACY_RULES: SnapshotPrivacyRules = {
  allowReflectionText: false,
  allowReflectionSummaries: false,
  allowRubricScores: false,
  allowStrategyTags: false,
  allowErrorAttribution: false,
  allowConfidencePredictions: false,
  maxTextLength: 0,
  requireExplicitConsent: false,
};

const SESSION_TARGET_CRITERIA: TargetSelectionCriteria = {
  description:
    "Last 10-30 study sessions, attempts within sessions, active goals",
  targetNodeTypes: ["goal", "card", "concept"],
  targetGranularities: ["card"],
};

const SESSION_EXPECTED_OUTPUTS: readonly ExpectedOutput[] = [
  {
    type: "session_regulation_hints",
    required: true,
    description:
      "Recommended session length, pacing, mode switches, break/reflection prompts",
  },
  {
    type: "anomaly_detection",
    required: false,
    description: "Detected fatigue, flow, or regulation anomalies",
  },
];

export const SESSION_REGULATION_SNAPSHOT_V1: SnapshotProfileDefinition = {
  profileId: profileId("SessionRegulationSnapshot", 1),
  name: "SessionRegulationSnapshot",
  version: 1,
  purpose:
    "Support self-regulation: fatigue detection, flow optimization, session planning & adjustment",
  description: `
    The SessionRegulationSnapshot provides data for:
    - Detecting fatigue and flow states
    - Recommending session length and pacing
    - Suggesting mode switches (review ↔ learn ↔ reflect)
    - Generating planning/break/reflection prompts
    
    Targets recent sessions and active goals.
    Includes intra-session time series (performance vs time).
    Temporal scope emphasizes rolling 30-day patterns.
  `,
  definedAt: now(),
  isActive: true,
  targetCriteria: SESSION_TARGET_CRITERIA,
  graphBounds: SESSION_GRAPH_BOUNDS,
  budgetBounds: SESSION_BUDGET_BOUNDS,
  tieredBudgets: SESSION_TIERED_BUDGETS,
  temporalBounds: SESSION_TEMPORAL_BOUNDS,
  signalScope: {
    mastery: SESSION_MASTERY_SCOPE,
    context: SESSION_CONTEXT_SCOPE,
  },
  privacyRules: SESSION_PRIVACY_RULES,
  expectedOutputs: SESSION_EXPECTED_OUTPUTS,
  tags: ["session", "regulation", "fatigue", "flow", "pacing"],
};

// =============================================================================
// PROFILE REGISTRY
// =============================================================================

/**
 * All built-in snapshot profiles
 */
export const BUILTIN_SNAPSHOT_PROFILES: readonly SnapshotProfileDefinition[] = [
  SCHEDULING_SNAPSHOT_V1,
  CONFUSION_DETECTION_SNAPSHOT_V1,
  PREREQUISITE_GRAPH_SNAPSHOT_V1,
  STRATEGY_EFFICACY_SNAPSHOT_V1,
  CALIBRATION_TRAINING_SNAPSHOT_V1,
  SESSION_REGULATION_SNAPSHOT_V1,
];

/**
 * Get a profile by ID
 */
export function getSnapshotProfile(
  profileId: SnapshotProfileId,
): SnapshotProfileDefinition | undefined {
  return BUILTIN_SNAPSHOT_PROFILES.find((p) => p.profileId === profileId);
}

/**
 * Get a profile by name and version
 */
export function getSnapshotProfileByNameAndVersion(
  name: string,
  version: number,
): SnapshotProfileDefinition | undefined {
  return BUILTIN_SNAPSHOT_PROFILES.find(
    (p) => p.name === name && p.version === version,
  );
}

/**
 * Get the latest version of a profile by name
 */
export function getLatestSnapshotProfile(
  name: string,
): SnapshotProfileDefinition | undefined {
  const profiles = BUILTIN_SNAPSHOT_PROFILES.filter((p) => p.name === name);
  if (profiles.length === 0) return undefined;
  return profiles.reduce((latest, p) =>
    p.version > latest.version ? p : latest,
  );
}

/**
 * List all active profile names
 */
export function listActiveProfileNames(): readonly string[] {
  return [
    ...new Set(
      BUILTIN_SNAPSHOT_PROFILES.filter((p) => p.isActive).map((p) => p.name),
    ),
  ];
}
