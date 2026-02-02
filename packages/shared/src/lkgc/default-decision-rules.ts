// =============================================================================
// DEFAULT DECISION RULES - Deterministic Heuristics for Decision Layer
// =============================================================================
// Placeholder rules implementing deterministic heuristics.
// These rules:
// - Are designed to be replaced or augmented by ML models later
// - Are fully traceable and auditable
// - Preserve the right structure for explainability
//
// NO AI. NO FSRS/HLR. Just heuristics based on MasteryState.
// =============================================================================

import type {
  Timestamp,
  NormalizedValue,
  Confidence,
  NodeId,
} from "../types/lkgc/foundation";
import type { DecisionRuleId } from "./decision-types";
import { confidence, normalized, now as nowFn } from "./id-generator";
import type {
  DecisionRuleMetadata,
  ItemSelectionRule,
  PriorityScoringRule,
  CoachingRule,
  GamificationRule,
  ItemSelectionContext,
  ItemSelectionOutput,
  PriorityScoringOutput,
  CoachingContext,
  CoachingOutput,
  GamificationContext,
  GamificationOutput,
  DecisionRuleRegistry,
} from "./decision-rule-registry";
import { createDecisionRuleRegistry } from "./decision-rule-registry";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Clamp value to [0, 1]
 */
function clamp01(value: number): NormalizedValue {
  return normalized(Math.max(0, Math.min(1, value)));
}

/**
 * Create rule metadata helper
 */
function createMetadata(
  id: string,
  name: string,
  description: string,
  category: import("./decision-rule-registry").DecisionRuleCategory,
  priority: number,
  tags: readonly string[] = [],
): DecisionRuleMetadata {
  return {
    id: id as DecisionRuleId,
    name,
    description,
    category,
    version: 1,
    addedAt: nowFn(),
    isActive: true,
    priority,
    tags,
  };
}

// =============================================================================
// ITEM SELECTION RULES
// =============================================================================

/**
 * Rule: Include items based on retrievability threshold
 */
export const retrievabilityThresholdRule: ItemSelectionRule = {
  metadata: createMetadata(
    "selection.retrievability.threshold",
    "Retrievability Threshold",
    "Include items whose retrievability falls within the target range",
    "queue_selection",
    100,
    ["core", "retrievability"],
  ),

  applies(_context: ItemSelectionContext): boolean {
    return true; // Always applies
  },

  compute(context: ItemSelectionContext): ItemSelectionOutput {
    const { masteryState, constraints } = context;
    const retrievability = masteryState.memory.retrievability as number;
    const { min, max } = constraints.retrievabilityRange;

    const include =
      retrievability >= (min as number) - 0.1 &&
      retrievability <= (max as number);

    return {
      include,
      reason: include
        ? `Retrievability ${(retrievability * 100).toFixed(0)}% is within target range [${((min as number) * 100).toFixed(0)}%, ${((max as number) * 100).toFixed(0)}%]`
        : `Retrievability ${(retrievability * 100).toFixed(0)}% is outside target range`,
      confidence: confidence(0.9),
    };
  },
};

/**
 * Rule: Include overdue items regardless of retrievability
 */
export const overdueInclusionRule: ItemSelectionRule = {
  metadata: createMetadata(
    "selection.overdue.always",
    "Always Include Overdue",
    "Always include items that are significantly overdue",
    "queue_selection",
    95,
    ["core", "overdue"],
  ),

  applies(context: ItemSelectionContext): boolean {
    const retrievability = context.masteryState.memory.retrievability as number;
    return retrievability < 0.5; // Only applies to items with low retrievability
  },

  compute(context: ItemSelectionContext): ItemSelectionOutput {
    const retrievability = context.masteryState.memory.retrievability as number;

    return {
      include: true,
      reason: `Item is overdue (retrievability ${(retrievability * 100).toFixed(0)}% < 50%)`,
      confidence: confidence(0.95),
    };
  },
};

/**
 * Rule: Exclude items reviewed today (if filter enabled)
 */
export const excludeReviewedTodayRule: ItemSelectionRule = {
  metadata: createMetadata(
    "selection.exclude.reviewed_today",
    "Exclude Reviewed Today",
    "Exclude items that have already been reviewed today",
    "queue_selection",
    90,
    ["filter"],
  ),

  applies(context: ItemSelectionContext): boolean {
    return context.constraints.contentFilters.excludeReviewedToday;
  },

  compute(context: ItemSelectionContext): ItemSelectionOutput {
    const { masteryState, now } = context;
    const lastReview = masteryState.memory.lastReview;

    if (!lastReview) {
      return {
        include: true,
        reason: "Never reviewed",
        confidence: confidence(1.0),
      };
    }

    const today = new Date(now as number);
    const lastReviewDate = new Date(lastReview as number);
    const sameDay =
      today.getFullYear() === lastReviewDate.getFullYear() &&
      today.getMonth() === lastReviewDate.getMonth() &&
      today.getDate() === lastReviewDate.getDate();

    return {
      include: !sameDay,
      reason: sameDay ? "Already reviewed today" : "Not reviewed today",
      confidence: confidence(1.0),
    };
  },
};

/**
 * Rule: Respect new vs review ratio
 */
export const newVsReviewRatioRule: ItemSelectionRule = {
  metadata: createMetadata(
    "selection.ratio.new_review",
    "New vs Review Ratio",
    "Balance new and review items according to constraint",
    "queue_selection",
    85,
    ["balance"],
  ),

  applies(_context: ItemSelectionContext): boolean {
    return true;
  },

  compute(context: ItemSelectionContext): ItemSelectionOutput {
    const { masteryState, constraints } = context;
    const isNew = masteryState.memory.learningState === "new";
    const ratio = constraints.newVsReviewRatio as number;

    // This rule provides guidance but doesn't exclude
    // The queue builder uses this for balancing
    return {
      include: true,
      reason: isNew
        ? `New item (target ratio: ${(ratio * 100).toFixed(0)}% new)`
        : `Review item (target ratio: ${((1 - ratio) * 100).toFixed(0)}% review)`,
      confidence: confidence(0.8),
    };
  },
};

// =============================================================================
// PRIORITY SCORING RULES
// =============================================================================

/**
 * Rule: Urgency based on retrievability
 */
export const urgencyScoringRule: PriorityScoringRule = {
  metadata: createMetadata(
    "priority.urgency.retrievability",
    "Urgency from Retrievability",
    "Higher priority for items with lower retrievability (at risk of forgetting)",
    "queue_priority",
    100,
    ["core", "urgency"],
  ),

  applies(_context: ItemSelectionContext): boolean {
    return true;
  },

  compute(context: ItemSelectionContext): PriorityScoringOutput {
    const retrievability = context.masteryState.memory.retrievability as number;
    // Lower retrievability = higher urgency
    const urgency = 1 - retrievability;

    return {
      score: urgency,
      factorName: "urgency",
      weight: 0.35,
      explanation: `Urgency ${(urgency * 100).toFixed(0)}% (retrievability ${(retrievability * 100).toFixed(0)}%)`,
    };
  },
};

/**
 * Rule: Importance based on goal linkage
 */
export const importanceScoringRule: PriorityScoringRule = {
  metadata: createMetadata(
    "priority.importance.goals",
    "Importance from Goals",
    "Higher priority for items linked to active goals",
    "queue_priority",
    95,
    ["importance", "goals"],
  ),

  applies(context: ItemSelectionContext): boolean {
    return context.graphContext.linkedGoals.length > 0;
  },

  compute(context: ItemSelectionContext): PriorityScoringOutput {
    const goalCount = context.graphContext.linkedGoals.length;
    // More goals = more important, with diminishing returns
    const importance = Math.min(1, goalCount * 0.3);

    return {
      score: importance,
      factorName: "importance",
      weight: 0.2,
      explanation: `Linked to ${goalCount} goal(s)`,
    };
  },
};

/**
 * Rule: Prerequisite pressure
 */
export const prerequisitePressureRule: PriorityScoringRule = {
  metadata: createMetadata(
    "priority.prerequisite.pressure",
    "Prerequisite Pressure",
    "Higher priority for items that block many dependents",
    "queue_priority",
    90,
    ["prerequisite", "dependency"],
  ),

  applies(context: ItemSelectionContext): boolean {
    return context.graphContext.dependents.length > 0;
  },

  compute(context: ItemSelectionContext): PriorityScoringOutput {
    const dependentCount = context.graphContext.dependents.length;
    // More dependents = more pressure
    const pressure = Math.min(1, dependentCount * 0.15);

    return {
      score: pressure,
      factorName: "prerequisitePressure",
      weight: 0.15,
      explanation: `Blocks ${dependentCount} dependent item(s)`,
    };
  },
};

/**
 * Rule: Interference penalty
 */
export const interferencePenaltyRule: PriorityScoringRule = {
  metadata: createMetadata(
    "priority.interference.penalty",
    "Interference Penalty",
    "Lower priority for items with high confusion potential (handled by interleaving)",
    "queue_priority",
    85,
    ["interference", "confusion"],
  ),

  applies(context: ItemSelectionContext): boolean {
    return context.masteryState.forgetting.interferenceIndex > 0.3;
  },

  compute(context: ItemSelectionContext): PriorityScoringOutput {
    const interference = context.masteryState.forgetting
      .interferenceIndex as number;
    // Higher interference = negative contribution (penalty)
    const penalty = -interference * 0.5;

    return {
      score: penalty,
      factorName: "interferencePenalty",
      weight: 0.1,
      explanation: `Interference index ${(interference * 100).toFixed(0)}% (penalty applied)`,
    };
  },
};

/**
 * Rule: Time cost consideration
 */
export const timeCostRule: PriorityScoringRule = {
  metadata: createMetadata(
    "priority.time.cost",
    "Time Cost",
    "Prefer items with lower expected time cost",
    "queue_priority",
    80,
    ["time", "efficiency"],
  ),

  applies(_context: ItemSelectionContext): boolean {
    return true;
  },

  compute(context: ItemSelectionContext): PriorityScoringOutput {
    const avgResponseTime = context.masteryState.evidence
      .avgResponseTime as number;
    // Normalize to rough seconds (assuming ms)
    const seconds = avgResponseTime / 1000;
    // Lower time = higher score (inverse relationship)
    const timeCost = Math.max(0, 1 - seconds / 60); // Normalize to 60 seconds max

    return {
      score: timeCost,
      factorName: "timeCost",
      weight: 0.1,
      explanation: `Expected time ~${seconds.toFixed(1)}s`,
    };
  },
};

/**
 * Rule: Fatigue compatibility
 */
export const fatigueCompatibilityRule: PriorityScoringRule = {
  metadata: createMetadata(
    "priority.fatigue.compatibility",
    "Fatigue Compatibility",
    "Under high fatigue, prefer easier items",
    "queue_priority",
    75,
    ["fatigue", "difficulty"],
  ),

  applies(context: ItemSelectionContext): boolean {
    return (context.context.fatigue as number) > 0.5;
  },

  compute(context: ItemSelectionContext): PriorityScoringOutput {
    const fatigue = context.context.fatigue as number;
    const difficulty = context.masteryState.memory.difficulty as number;
    // High fatigue + high difficulty = low compatibility
    const compatibility = 1 - fatigue * difficulty;

    return {
      score: compatibility,
      factorName: "fatigueCompatibility",
      weight: 0.1,
      explanation: `Fatigue ${(fatigue * 100).toFixed(0)}%, difficulty ${(difficulty * 100).toFixed(0)}%`,
    };
  },
};

// =============================================================================
// COACHING RULES
// =============================================================================

/**
 * Rule: Show calibration feedback when overconfident
 */
export const calibrationFeedbackRule: CoachingRule = {
  metadata: createMetadata(
    "coaching.calibration.feedback",
    "Calibration Feedback",
    "Show calibration feedback when user shows overconfidence bias",
    "coaching_selection",
    100,
    ["calibration", "metacognition"],
  ),

  applies(context: CoachingContext): boolean {
    const bias = context.aggregateMastery.avgCalibrationBias;
    return bias > 0.15; // Overconfident by 15%+
  },

  compute(context: CoachingContext): CoachingOutput {
    const bias = context.aggregateMastery.avgCalibrationBias;

    return {
      showIntervention: true,
      interventionType: "calibration_feedback",
      promptText: `Your confidence has been running about ${Math.round(bias * 100)}% higher than your accuracy. Try being a bit more conservative with your confidence ratings.`,
      priority: 80,
      rationale: `Calibration bias of ${(bias * 100).toFixed(1)}% detected`,
    };
  },
};

/**
 * Rule: Suggest prediction prompt for item-level calibration
 */
export const predictionPromptRule: CoachingRule = {
  metadata: createMetadata(
    "coaching.prediction.prompt",
    "Prediction Prompt",
    "Ask for pre-answer confidence prediction",
    "coaching_selection",
    95,
    ["prediction", "metacognition"],
  ),

  applies(context: CoachingContext): boolean {
    // Show periodically (every 5th item on average)
    return Math.random() < 0.2;
  },

  compute(_context: CoachingContext): CoachingOutput {
    return {
      showIntervention: true,
      interventionType: "prediction_prompt",
      promptText: "Before answering, how confident are you that you know this?",
      priority: 60,
      rationale: "Periodic confidence calibration check",
    };
  },
};

/**
 * Rule: Error attribution after mistakes
 */
export const errorAttributionRule: CoachingRule = {
  metadata: createMetadata(
    "coaching.error.attribution",
    "Error Attribution",
    "Ask about error cause after mistakes",
    "coaching_selection",
    90,
    ["error", "attribution", "metacognition"],
  ),

  applies(context: CoachingContext): boolean {
    return context.recentHistory.mistakesLastSession > 3;
  },

  compute(context: CoachingContext): CoachingOutput {
    return {
      showIntervention: true,
      interventionType: "error_attribution",
      promptText:
        "When you get something wrong, what usually causes it? (Forgot it / Misunderstood / Read wrong / Careless)",
      priority: 70,
      rationale: `${context.recentHistory.mistakesLastSession} mistakes in last session`,
    };
  },
};

/**
 * Rule: Strategy suggestion when diversity is low
 */
export const strategySuggestionRule: CoachingRule = {
  metadata: createMetadata(
    "coaching.strategy.suggestion",
    "Strategy Suggestion",
    "Suggest trying different learning strategies",
    "coaching_selection",
    85,
    ["strategy", "variety"],
  ),

  applies(context: CoachingContext): boolean {
    return (context.aggregateMastery.strategyDiversity as number) < 0.3;
  },

  compute(context: CoachingContext): CoachingOutput {
    const strategies = [
      "Try creating mental images to help remember this concept",
      "Try explaining this to an imaginary student",
      "Try connecting this to something you already know well",
      "Try writing a brief summary in your own words",
    ];
    const suggestion =
      strategies[Math.floor(Math.random() * strategies.length)];

    return {
      showIntervention: true,
      interventionType: "strategy_suggestion",
      promptText: suggestion,
      priority: 65,
      rationale: `Strategy diversity is low (${((context.aggregateMastery.strategyDiversity as number) * 100).toFixed(0)}%)`,
    };
  },
};

/**
 * Rule: Reflection prompt after session
 */
export const reflectionPromptRule: CoachingRule = {
  metadata: createMetadata(
    "coaching.reflection.prompt",
    "Reflection Prompt",
    "Prompt for reflection after study session",
    "coaching_selection",
    80,
    ["reflection", "metacognition"],
  ),

  applies(context: CoachingContext): boolean {
    return context.recentHistory.daysSinceLastReflection > 3;
  },

  compute(context: CoachingContext): CoachingOutput {
    return {
      showIntervention: true,
      interventionType: "reflection_prompt",
      promptText:
        "Take a moment to reflect: What was challenging? What strategies worked well? What would you do differently?",
      priority: 50,
      rationale: `${context.recentHistory.daysSinceLastReflection} days since last reflection`,
    };
  },
};

/**
 * Rule: Interleaving explanation
 */
export const interleavingExplanationRule: CoachingRule = {
  metadata: createMetadata(
    "coaching.interleaving.explanation",
    "Interleaving Explanation",
    "Explain why topics are being mixed",
    "coaching_selection",
    75,
    ["interleaving", "explanation"],
  ),

  applies(context: CoachingContext): boolean {
    return context.constraints.enableInterleaving;
  },

  compute(_context: CoachingContext): CoachingOutput {
    return {
      showIntervention: true,
      interventionType: "interleaving_explanation",
      promptText:
        "Notice how we're mixing different topics? This interleaving helps strengthen your ability to discriminate between concepts and improves long-term retention.",
      priority: 40,
      rationale: "Interleaving is enabled; explain the learning science",
    };
  },
};

/**
 * Rule: Desirable difficulty framing
 */
export const desirableDifficultyRule: CoachingRule = {
  metadata: createMetadata(
    "coaching.difficulty.framing",
    "Desirable Difficulty Framing",
    "Frame difficulty as beneficial for learning",
    "coaching_selection",
    70,
    ["difficulty", "framing", "motivation"],
  ),

  applies(context: CoachingContext): boolean {
    return (context.aggregateMastery.avgFrustration as number) > 0.5;
  },

  compute(_context: CoachingContext): CoachingOutput {
    return {
      showIntervention: true,
      interventionType: "desirable_difficulty",
      promptText:
        "Finding this challenging? Good! Struggling to retrieve information actually strengthens your memory more than easy recall. The effort is the learning.",
      priority: 55,
      rationale: "High frustration detected; reframe difficulty as beneficial",
    };
  },
};

/**
 * Rule: Break suggestion when fatigued
 */
export const breakSuggestionRule: CoachingRule = {
  metadata: createMetadata(
    "coaching.break.suggestion",
    "Break Suggestion",
    "Suggest taking a break when fatigue is high",
    "coaching_selection",
    100,
    ["break", "fatigue", "wellbeing"],
  ),

  applies(context: CoachingContext): boolean {
    return (context.context.fatigue as number) > 0.7;
  },

  compute(context: CoachingContext): CoachingOutput {
    return {
      showIntervention: true,
      interventionType: "break_suggestion",
      promptText:
        "You've been working hard! Consider taking a short break. Even 5 minutes can help restore focus and improve retention.",
      priority: 90,
      rationale: `Fatigue level is high (${((context.context.fatigue as number) * 100).toFixed(0)}%)`,
    };
  },
};

// =============================================================================
// GAMIFICATION RULES
// =============================================================================

/**
 * Rule: Calibration mini-quest when overconfident
 */
export const calibrationQuestRule: GamificationRule = {
  metadata: createMetadata(
    "game.quest.calibration",
    "Calibration Quest",
    "Offer a calibration challenge when overconfidence is detected",
    "gamification_selection",
    100,
    ["quest", "calibration"],
  ),

  applies(context: GamificationContext): boolean {
    return context.aggregateMastery.avgCalibrationBias > 0.2;
  },

  compute(context: GamificationContext): GamificationOutput {
    return {
      activateHook: true,
      hookType: "quest",
      title: "Calibration Challenge",
      parameters: {
        type: "quest",
        targetCount: 10,
        difficulty: "medium",
        accuracyThreshold: 0.8,
        description:
          "Rate your confidence before each card. Get within 10% of your actual accuracy to win!",
      },
      rationale: `Overconfidence bias of ${(context.aggregateMastery.avgCalibrationBias * 100).toFixed(0)}% detected`,
    };
  },
};

/**
 * Rule: Confusion boss when interference is high
 */
export const confusionBossRule: GamificationRule = {
  metadata: createMetadata(
    "game.boss.confusion",
    "Confusion Boss",
    "Create a boss fight for frequently confused items",
    "gamification_selection",
    95,
    ["boss", "confusion", "interference"],
  ),

  applies(context: GamificationContext): boolean {
    return context.aggregateMastery.highInterferenceCount > 3;
  },

  compute(context: GamificationContext): GamificationOutput {
    return {
      activateHook: true,
      hookType: "boss",
      title: "Confusion Boss",
      parameters: {
        type: "boss",
        defeatsNeeded: 3,
        currentDefeats: 0,
        description:
          "Master these tricky items that keep getting confused! Get each one right 3 times to defeat the boss.",
      },
      rationale: `${context.aggregateMastery.highInterferenceCount} items with high interference detected`,
    };
  },
};

/**
 * Rule: Reflection streak challenge
 */
export const reflectionStreakRule: GamificationRule = {
  metadata: createMetadata(
    "game.streak.reflection",
    "Reflection Streak",
    "Encourage consistent reflection practice",
    "gamification_selection",
    90,
    ["streak", "reflection"],
  ),

  applies(context: GamificationContext): boolean {
    return (context.aggregateMastery.reflectionRate as number) < 0.5;
  },

  compute(_context: GamificationContext): GamificationOutput {
    return {
      activateHook: true,
      hookType: "streak_rule",
      title: "Reflection Streak",
      parameters: {
        type: "streak_rule",
        streakType: "reflection",
        targetStreak: 7,
        description:
          "Complete a meaningful reflection after each study session for 7 days!",
      },
      rationale: "Low reflection completion rate",
    };
  },
};

/**
 * Rule: Strategy diversity challenge
 */
export const strategyDiversityRule: GamificationRule = {
  metadata: createMetadata(
    "game.challenge.strategy",
    "Strategy Explorer",
    "Encourage trying different learning strategies",
    "gamification_selection",
    85,
    ["challenge", "strategy"],
  ),

  applies(context: GamificationContext): boolean {
    return (context.aggregateMastery.strategyDiversity as number) < 0.4;
  },

  compute(_context: GamificationContext): GamificationOutput {
    return {
      activateHook: true,
      hookType: "challenge",
      title: "Strategy Explorer",
      parameters: {
        type: "challenge",
        category: "strategy",
        targetValue: 4,
        currentValue: 0,
        description:
          "Try 4 different learning strategies this week: imagery, elaboration, self-explanation, and retrieval practice.",
      },
      rationale: "Low strategy diversity",
    };
  },
};

/**
 * Rule: Daily consistency streak
 */
export const dailyStreakRule: GamificationRule = {
  metadata: createMetadata(
    "game.streak.daily",
    "Daily Streak",
    "Reward consistent daily practice",
    "gamification_selection",
    100,
    ["streak", "consistency"],
  ),

  applies(context: GamificationContext): boolean {
    return context.recentHistory.currentStreak > 0;
  },

  compute(context: GamificationContext): GamificationOutput {
    const streak = context.recentHistory.currentStreak;
    const nextMilestone = Math.ceil(streak / 7) * 7;

    return {
      activateHook: true,
      hookType: "streak_rule",
      title: `${streak}-Day Streak!`,
      parameters: {
        type: "streak_rule",
        streakType: "daily",
        currentStreak: streak,
        targetStreak: nextMilestone,
        description: `Keep it going! ${nextMilestone - streak} more days to your next milestone.`,
      },
      rationale: `Maintaining ${streak}-day streak`,
    };
  },
};

/**
 * Rule: Progress celebration
 */
export const progressCelebrationRule: GamificationRule = {
  metadata: createMetadata(
    "game.reward.progress",
    "Progress Celebration",
    "Celebrate learning progress milestones",
    "gamification_selection",
    80,
    ["reward", "celebration"],
  ),

  applies(context: GamificationContext): boolean {
    // Celebrate when overdue count drops significantly
    return context.aggregateMastery.overdueCount < 5;
  },

  compute(context: GamificationContext): GamificationOutput {
    return {
      activateHook: true,
      hookType: "reward",
      title: "Caught Up!",
      parameters: {
        type: "reward",
        rewardType: "recognition",
        rewardId: "caught_up_badge",
        description:
          "You've stayed on top of your reviews! Only a few items remaining.",
      },
      rationale: `Only ${context.aggregateMastery.overdueCount} overdue items`,
    };
  },
};

// =============================================================================
// RULE COLLECTION
// =============================================================================

/**
 * All default item selection rules
 */
export const DEFAULT_ITEM_SELECTION_RULES: readonly ItemSelectionRule[] = [
  retrievabilityThresholdRule,
  overdueInclusionRule,
  excludeReviewedTodayRule,
  newVsReviewRatioRule,
];

/**
 * All default priority scoring rules
 */
export const DEFAULT_PRIORITY_SCORING_RULES: readonly PriorityScoringRule[] = [
  urgencyScoringRule,
  importanceScoringRule,
  prerequisitePressureRule,
  interferencePenaltyRule,
  timeCostRule,
  fatigueCompatibilityRule,
];

/**
 * All default coaching rules
 */
export const DEFAULT_COACHING_RULES: readonly CoachingRule[] = [
  calibrationFeedbackRule,
  predictionPromptRule,
  errorAttributionRule,
  strategySuggestionRule,
  reflectionPromptRule,
  interleavingExplanationRule,
  desirableDifficultyRule,
  breakSuggestionRule,
];

/**
 * All default gamification rules
 */
export const DEFAULT_GAMIFICATION_RULES: readonly GamificationRule[] = [
  calibrationQuestRule,
  confusionBossRule,
  reflectionStreakRule,
  strategyDiversityRule,
  dailyStreakRule,
  progressCelebrationRule,
];

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a registry pre-populated with default decision rules
 */
export function createDefaultDecisionRuleRegistry(): DecisionRuleRegistry {
  const registry = createDecisionRuleRegistry();

  for (const rule of DEFAULT_ITEM_SELECTION_RULES) {
    registry.registerItemSelectionRule(rule);
  }

  for (const rule of DEFAULT_PRIORITY_SCORING_RULES) {
    registry.registerPriorityScoringRule(rule);
  }

  for (const rule of DEFAULT_COACHING_RULES) {
    registry.registerCoachingRule(rule);
  }

  for (const rule of DEFAULT_GAMIFICATION_RULES) {
    registry.registerGamificationRule(rule);
  }

  return registry;
}
