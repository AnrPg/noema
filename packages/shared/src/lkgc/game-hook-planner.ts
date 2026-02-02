// =============================================================================
// GAME HOOK PLANNER - Learning-Grounded Gamification
// =============================================================================
// Selects gamification hooks that are GROUNDED in learning science:
// - Quests tied to metacognitive goals
// - Challenges that promote desirable difficulties
// - Streaks that reinforce consistency
//
// NOT arbitrary dopamine loops. Every hook has a learning rationale.
//
// NO AI. Just deterministic heuristics based on MasteryState.
// =============================================================================

import type {
  Timestamp,
  Confidence,
  NormalizedValue,
} from "../types/lkgc/foundation";
import type {
  DecisionConstraints,
  DecisionContext,
  GamificationHook,
  GameHookId,
  QuestParameters,
  ChallengeParameters,
  StreakRuleParameters,
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
// GAME HOOK PLANNER CONFIGURATION
// =============================================================================

/**
 * Configuration for the game hook planner
 */
export interface GameHookPlannerConfig {
  /** Maximum hooks per session */
  readonly maxHooksPerSession: number;

  /** Enable quest system */
  readonly enableQuests: boolean;

  /** Enable challenge system */
  readonly enableChallenges: boolean;

  /** Enable streak rules */
  readonly enableStreaks: boolean;
}

/**
 * Default game hook planner configuration
 */
export const DEFAULT_GAME_HOOK_CONFIG: GameHookPlannerConfig = {
  maxHooksPerSession: 3,
  enableQuests: true,
  enableChallenges: true,
  enableStreaks: true,
};

// =============================================================================
// GAME HOOK PLANNER INTERFACE
// =============================================================================

/**
 * Interface for planning learning-grounded gamification hooks
 */
export interface GameHookPlanner {
  /**
   * Plan gamification hooks for a session
   */
  planHooks(
    constraints: DecisionConstraints,
    context: DecisionContext,
    aggregateMastery: AggregateMasteryMetrics,
    queueLength: number,
    recentHistory: RecentSessionHistory,
    now: Timestamp,
  ): GamificationHook[];
}

// =============================================================================
// DEFAULT GAME HOOK PLANNER
// =============================================================================

/**
 * Default implementation of GameHookPlanner
 */
export class DefaultGameHookPlanner implements GameHookPlanner {
  constructor(
    private readonly ruleRegistry: DecisionRuleRegistry,
    private readonly config: GameHookPlannerConfig = DEFAULT_GAME_HOOK_CONFIG,
  ) {}

  planHooks(
    constraints: DecisionConstraints,
    context: DecisionContext,
    aggregateMastery: AggregateMasteryMetrics,
    queueLength: number,
    recentHistory: RecentSessionHistory,
    now: Timestamp,
  ): GamificationHook[] {
    if (!constraints.includeGamification) {
      return [];
    }

    const hooks: GamificationHook[] = [];

    // Quest: Calibration improvement
    if (
      this.config.enableQuests &&
      Math.abs(aggregateMastery.avgCalibrationBias) > 0.15
    ) {
      hooks.push(this.createCalibrationQuest(aggregateMastery, now));
    }

    // Quest: Strategy explorer
    if (
      this.config.enableQuests &&
      (aggregateMastery.strategyDiversity as number) < 0.3
    ) {
      hooks.push(this.createStrategyQuest(aggregateMastery, now));
    }

    // Challenge: Perfect recall
    if (
      this.config.enableChallenges &&
      (recentHistory.avgAccuracyLast7Days as number) > 0.8 &&
      queueLength >= 10
    ) {
      hooks.push(this.createPerfectRecallChallenge(recentHistory, now));
    }

    // Streak: Daily study
    if (this.config.enableStreaks && recentHistory.currentStreak > 0) {
      hooks.push(this.createStudyStreakHook(recentHistory, now));
    }

    // Limit hooks
    return hooks.slice(0, this.config.maxHooksPerSession);
  }

  // ---------------------------------------------------------------------------
  // QUEST CREATORS
  // ---------------------------------------------------------------------------

  private createCalibrationQuest(
    mastery: AggregateMasteryMetrics,
    now: Timestamp,
  ): GamificationHook {
    const isOverconfident = mastery.avgCalibrationBias > 0;
    const parameters: QuestParameters = {
      type: "quest",
      targetCount: 10,
      difficulty: "medium",
      accuracyThreshold: 0.85 as NormalizedValue,
    };

    return {
      hookId: `hook_quest_calibration_${now.toString(36)}` as GameHookId,
      type: "quest",
      title: isOverconfident ? "The Humble Scholar" : "The Confident Learner",
      description: isOverconfident
        ? "Improve your prediction accuracy by making 10 confident-but-correct recalls."
        : "Build confidence by recognizing your true knowledge level.",
      parameters,
      targetNodes: [],
      reward: {
        type: "recognition",
        rewardId: "calibration_master",
        displayName: "Calibration Master",
        xpPoints: 100,
      },
      rationale: this.buildRationale(
        `Calibration ${isOverconfident ? "overconfidence" : "underconfidence"}: ${Math.round(Math.abs(mastery.avgCalibrationBias) * 100)}%`,
        "builtin.hook.calibration_quest",
      ),
    };
  }

  private createStrategyQuest(
    _mastery: AggregateMasteryMetrics,
    now: Timestamp,
  ): GamificationHook {
    const parameters: QuestParameters = {
      type: "quest",
      targetCount: 15,
      difficulty: "easy",
      accuracyThreshold: 0.7 as NormalizedValue,
    };

    return {
      hookId: `hook_quest_strategy_${now.toString(36)}` as GameHookId,
      type: "quest",
      title: "The Strategy Explorer",
      description:
        "Try 3 different study strategies to find what works best for you.",
      parameters,
      targetNodes: [],
      reward: {
        type: "recognition",
        rewardId: "strategy_explorer",
        displayName: "Strategy Explorer",
        xpPoints: 75,
      },
      rationale: this.buildRationale(
        "Low strategy diversity encourages exploration",
        "builtin.hook.strategy_quest",
      ),
    };
  }

  // ---------------------------------------------------------------------------
  // CHALLENGE CREATORS
  // ---------------------------------------------------------------------------

  private createPerfectRecallChallenge(
    history: RecentSessionHistory,
    now: Timestamp,
  ): GamificationHook {
    const parameters: ChallengeParameters = {
      type: "challenge",
      category: "accuracy",
      targetValue: 10,
      currentValue: 0,
    };

    return {
      hookId: `hook_challenge_perfect_${now.toString(36)}` as GameHookId,
      type: "challenge",
      title: "Perfect 10",
      description: "Get 10 items correct in a row!",
      parameters,
      targetNodes: [],
      deadline: (now + 30 * 60 * 1000) as Timestamp, // 30 minutes
      reward: {
        type: "recognition",
        rewardId: "perfect_streak",
        displayName: "Perfect Recall",
        xpPoints: 50,
      },
      progress: {
        completed: 0,
        total: 10,
        percentage: 0 as NormalizedValue,
      },
      rationale: this.buildRationale(
        `High recent accuracy (${Math.round((history.avgAccuracyLast7Days as number) * 100)}%) enables challenge`,
        "builtin.hook.perfect_challenge",
      ),
    };
  }

  // ---------------------------------------------------------------------------
  // STREAK CREATORS
  // ---------------------------------------------------------------------------

  private createStudyStreakHook(
    history: RecentSessionHistory,
    now: Timestamp,
  ): GamificationHook {
    const nextMilestone = Math.ceil(history.currentStreak / 7) * 7 || 7;
    const parameters: StreakRuleParameters = {
      type: "streak_rule",
      streakType: "daily",
      currentStreak: history.currentStreak,
      targetStreak: nextMilestone,
    };

    return {
      hookId: `hook_streak_daily_${now.toString(36)}` as GameHookId,
      type: "streak_rule",
      title: "Daily Scholar",
      description: `You've studied ${history.currentStreak} days in a row! Next milestone: ${nextMilestone} days.`,
      parameters,
      targetNodes: [],
      reward: {
        type: "recognition",
        rewardId: "streak_master",
        displayName: "Streak Master",
        xpPoints: history.currentStreak * 5,
      },
      progress: {
        completed: history.currentStreak,
        total: nextMilestone,
        percentage: Math.min(
          history.currentStreak / nextMilestone,
          1,
        ) as NormalizedValue,
      },
      rationale: this.buildRationale(
        `${history.currentStreak}-day study streak`,
        "builtin.hook.daily_streak",
      ),
    };
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  private buildRationale(summary: string, ruleId: string): PlanRationale {
    return new RationaleBuilder()
      .withSummary(summary)
      .addRule(ruleId as DecisionRuleId, 1, true)
      .build(0.7 as Confidence);
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a new game hook planner
 */
export function createGameHookPlanner(
  ruleRegistry: DecisionRuleRegistry,
  config?: Partial<GameHookPlannerConfig>,
): GameHookPlanner {
  return new DefaultGameHookPlanner(ruleRegistry, {
    ...DEFAULT_GAME_HOOK_CONFIG,
    ...config,
  });
}
