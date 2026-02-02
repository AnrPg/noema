// =============================================================================
// META COACH PLANNER - Metacognitive Coaching Intervention Selection
// =============================================================================
// Selects metacognitive coaching interventions based on:
// - Calibration/bias metrics
// - Strategy diversity
// - Reflection patterns
//
// NO AI. Just deterministic heuristics based on MasteryState.
// =============================================================================

import type {
  Timestamp,
  Duration,
  Confidence,
  NormalizedValue,
} from "../types/lkgc/foundation";
import type { MasteryState } from "../types/lkgc/mastery";
import type {
  DecisionConstraints,
  DecisionContext,
  CoachingIntervention,
  InterventionId,
  PlanRationale,
  DecisionRuleId,
} from "./decision-types";
import type {
  DecisionRuleRegistry,
  AggregateMasteryMetrics,
  RecentSessionHistory,
} from "./decision-rule-registry";
import { RationaleBuilder } from "./decision-rule-registry";

// =============================================================================
// COACH PLANNER CONFIGURATION
// =============================================================================

/**
 * Configuration for the meta coach planner
 */
export interface MetaCoachPlannerConfig {
  /** Maximum interventions per session */
  readonly maxInterventionsPerSession: number;

  /** Minimum items between interventions */
  readonly minItemsBetweenInterventions: number;

  /** Default intervention priority threshold */
  readonly priorityThreshold: number;
}

/**
 * Default coach planner configuration
 */
export const DEFAULT_COACH_PLANNER_CONFIG: MetaCoachPlannerConfig = {
  maxInterventionsPerSession: 5,
  minItemsBetweenInterventions: 3,
  priorityThreshold: 50,
};

// =============================================================================
// META COACH PLANNER INTERFACE
// =============================================================================

/**
 * Interface for planning metacognitive coaching interventions
 */
export interface MetaCoachPlanner {
  /**
   * Plan coaching interventions for a session
   */
  planInterventions(
    constraints: DecisionConstraints,
    context: DecisionContext,
    aggregateMastery: AggregateMasteryMetrics,
    queueLength: number,
    recentHistory: RecentSessionHistory,
    now: Timestamp,
  ): CoachingIntervention[];
}

// =============================================================================
// DEFAULT META COACH PLANNER
// =============================================================================

/**
 * Default implementation of MetaCoachPlanner
 */
export class DefaultMetaCoachPlanner implements MetaCoachPlanner {
  constructor(
    private readonly ruleRegistry: DecisionRuleRegistry,
    private readonly config: MetaCoachPlannerConfig = DEFAULT_COACH_PLANNER_CONFIG,
  ) {}

  planInterventions(
    constraints: DecisionConstraints,
    context: DecisionContext,
    aggregateMastery: AggregateMasteryMetrics,
    queueLength: number,
    recentHistory: RecentSessionHistory,
    now: Timestamp,
  ): CoachingIntervention[] {
    if (!constraints.includeCoaching) {
      return [];
    }

    const interventions: CoachingIntervention[] = [];
    let interventionCount = 0;

    // Session start planning prompt
    if (context.reviewedThisSession.length === 0) {
      interventions.push(
        this.createPlanningIntervention(
          aggregateMastery,
          now,
          interventionCount++,
        ),
      );
    }

    // Calibration coaching if bias detected
    if (Math.abs(aggregateMastery.avgCalibrationBias) > 0.15) {
      interventions.push(
        this.createCalibrationIntervention(
          aggregateMastery.avgCalibrationBias > 0,
          queueLength,
          now,
          interventionCount++,
        ),
      );
    }

    // Strategy diversity coaching
    if ((aggregateMastery.strategyDiversity as number) < 0.3) {
      interventions.push(
        this.createStrategyIntervention(
          aggregateMastery,
          queueLength,
          now,
          interventionCount++,
        ),
      );
    }

    // Reflection prompt if not reflected recently
    if (recentHistory.daysSinceLastReflection > 3) {
      interventions.push(
        this.createReflectionIntervention(
          recentHistory,
          queueLength,
          now,
          interventionCount++,
        ),
      );
    }

    // Streak encouragement
    if (
      recentHistory.currentStreak > 0 &&
      recentHistory.currentStreak % 7 === 0
    ) {
      interventions.push(
        this.createStreakIntervention(
          recentHistory.currentStreak,
          now,
          interventionCount++,
        ),
      );
    }

    // Limit interventions
    return interventions.slice(0, this.config.maxInterventionsPerSession);
  }

  // ---------------------------------------------------------------------------
  // INTERVENTION CREATORS
  // ---------------------------------------------------------------------------

  private createPlanningIntervention(
    mastery: AggregateMasteryMetrics,
    now: Timestamp,
    index: number,
  ): CoachingIntervention {
    const promptText =
      mastery.overdueCount > 20
        ? `You have ${mastery.overdueCount} overdue items. Would you like to focus on catching up, or mix in some new learning?`
        : "What would you like to focus on today? Set a goal to make your study session more purposeful.";

    return {
      interventionId:
        `int_${now.toString(36)}_${index.toString().padStart(2, "0")}` as InterventionId,
      type: "planning_prompt",
      scope: "session",
      triggerPosition: { type: "session_start" },
      promptText,
      responseSchema: { type: "text", required: false },
      priority: 70,
      skippable: true,
      rationale: this.buildRationale(
        "Session start goal setting",
        "builtin.coach.planning",
      ),
    };
  }

  private createCalibrationIntervention(
    isOverconfident: boolean,
    queueLength: number,
    now: Timestamp,
    index: number,
  ): CoachingIntervention {
    const promptText = isOverconfident
      ? "Your predictions have been optimistic lately. Before answering, consider: how confident are you really?"
      : "You've been underselling yourself! Your actual performance is better than you think.";

    const triggerPosition = Math.floor(queueLength * 0.3);

    return {
      interventionId:
        `int_${now.toString(36)}_${index.toString().padStart(2, "0")}` as InterventionId,
      type: "calibration_feedback",
      scope: "batch",
      triggerPosition: { type: "after_item", itemIndex: triggerPosition },
      promptText,
      priority: 75,
      skippable: true,
      rationale: this.buildRationale(
        `Calibration ${isOverconfident ? "overconfidence" : "underconfidence"} detected`,
        "builtin.coach.calibration",
      ),
    };
  }

  private createStrategyIntervention(
    _mastery: AggregateMasteryMetrics,
    queueLength: number,
    now: Timestamp,
    index: number,
  ): CoachingIntervention {
    return {
      interventionId:
        `int_${now.toString(36)}_${index.toString().padStart(2, "0")}` as InterventionId,
      type: "strategy_suggestion",
      scope: "batch",
      triggerPosition: {
        type: "after_item",
        itemIndex: Math.floor(queueLength * 0.5),
      },
      promptText:
        "Try a different study strategy for the next few items. Options: visualize, elaborate, or create connections.",
      responseSchema: {
        type: "choice",
        options: ["Visualize", "Elaborate", "Connect", "Skip"],
        required: false,
      },
      priority: 60,
      skippable: true,
      rationale: this.buildRationale(
        "Low strategy diversity",
        "builtin.coach.strategy",
      ),
    };
  }

  private createReflectionIntervention(
    history: RecentSessionHistory,
    _queueLength: number,
    now: Timestamp,
    index: number,
  ): CoachingIntervention {
    return {
      interventionId:
        `int_${now.toString(36)}_${index.toString().padStart(2, "0")}` as InterventionId,
      type: "reflection_prompt",
      scope: "session",
      triggerPosition: { type: "session_end" },
      promptText: `It's been ${history.daysSinceLastReflection} days since your last reflection. What did you learn today?`,
      responseSchema: { type: "text", required: false },
      priority: 65,
      skippable: true,
      rationale: this.buildRationale(
        `No reflection in ${history.daysSinceLastReflection} days`,
        "builtin.coach.reflection",
      ),
    };
  }

  private createStreakIntervention(
    streak: number,
    now: Timestamp,
    index: number,
  ): CoachingIntervention {
    return {
      interventionId:
        `int_${now.toString(36)}_${index.toString().padStart(2, "0")}` as InterventionId,
      type: "streak_encouragement",
      scope: "session",
      triggerPosition: { type: "session_start" },
      promptText: `Amazing! You've maintained a ${streak}-day streak! Consistency is key to long-term retention.`,
      priority: 85,
      skippable: true,
      rationale: this.buildRationale(
        `Streak milestone: ${streak} days`,
        "builtin.coach.streak",
      ),
    };
  }

  private buildRationale(summary: string, ruleId: string): PlanRationale {
    return new RationaleBuilder()
      .withSummary(summary)
      .addRule(ruleId as DecisionRuleId, 1, true)
      .build(0.75 as Confidence);
  }
}

// =============================================================================
// AGGREGATE MASTERY CALCULATOR
// =============================================================================

/**
 * Calculate aggregate mastery metrics from individual mastery states
 */
export function calculateAggregateMastery(
  masteryStates: readonly MasteryState[],
): AggregateMasteryMetrics {
  if (masteryStates.length === 0) {
    return {
      avgRetrievability: 0.5 as NormalizedValue,
      avgCalibrationBias: 0,
      strategyDiversity: 0 as NormalizedValue,
      reflectionRate: 0 as NormalizedValue,
      avgFrustration: 0 as NormalizedValue,
      avgFlow: 0 as NormalizedValue,
      highInterferenceCount: 0,
      overdueCount: 0,
    };
  }

  let totalRetrievability = 0;
  let totalCalibrationBias = 0;
  let totalStrategyDiversity = 0;
  let totalReflectionRate = 0;
  let totalFrustration = 0;
  let totalFlow = 0;
  let highInterferenceCount = 0;
  let overdueCount = 0;

  for (const state of masteryStates) {
    totalRetrievability += state.memory.retrievability as number;
    totalCalibrationBias += state.metacognition.calibration.bias as number;
    totalStrategyDiversity += state.metacognition.strategyUsage
      .strategyDiversity as number;
    totalReflectionRate += state.metacognition.reflection
      .completionRate as number;
    totalFrustration += state.affect.frustration.combined as number;
    totalFlow += state.affect.flow.combined as number;

    if ((state.forgetting.interferenceIndex as number) > 0.5) {
      highInterferenceCount++;
    }

    if ((state.memory.retrievability as number) < 0.7) {
      overdueCount++;
    }
  }

  const count = masteryStates.length;

  return {
    avgRetrievability: (totalRetrievability / count) as NormalizedValue,
    avgCalibrationBias: totalCalibrationBias / count,
    strategyDiversity: (totalStrategyDiversity / count) as NormalizedValue,
    reflectionRate: (totalReflectionRate / count) as NormalizedValue,
    avgFrustration: (totalFrustration / count) as NormalizedValue,
    avgFlow: (totalFlow / count) as NormalizedValue,
    highInterferenceCount,
    overdueCount,
  };
}

/**
 * Create default recent session history
 */
export function createDefaultRecentHistory(): RecentSessionHistory {
  return {
    sessionsLast7Days: 0,
    avgSessionDuration: 0 as Duration,
    avgAccuracyLast7Days: 0.5 as NormalizedValue,
    reflectionsLast7Days: 0,
    daysSinceLastReflection: 7,
    currentStreak: 0,
    mistakesLastSession: 0,
  };
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a new meta coach planner
 */
export function createMetaCoachPlanner(
  ruleRegistry: DecisionRuleRegistry,
  config?: Partial<MetaCoachPlannerConfig>,
): MetaCoachPlanner {
  return new DefaultMetaCoachPlanner(ruleRegistry, {
    ...DEFAULT_COACH_PLANNER_CONFIG,
    ...config,
  });
}
