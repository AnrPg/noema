// =============================================================================
// DECISION ENGINE - Central Orchestrator for LKGC Decision Layer
// =============================================================================
// The DecisionEngine is the main entry point for the decision layer.
// It orchestrates:
// - ReviewQueueBuilder: Prioritized review queue generation
// - MetaCoachPlanner: Metacognitive coaching interventions
// - GameHookPlanner: Learning-grounded gamification hooks
//
// Produces a complete ActionPlan with:
// - Review queue with rationales
// - Coaching interventions
// - Gamification hooks
// - Diagnostics for transparency
//
// NO AI. NO ML. Pure deterministic heuristics.
// =============================================================================

import type {
  UserId,
  Timestamp,
  Duration,
  Confidence,
  NormalizedValue,
} from "../types/lkgc/foundation";
import type {
  DecisionConstraints,
  DecisionContext,
  ActionPlan,
  ActionPlanId,
  ActionPlanDiagnostics,
  PlanRationale,
  DecisionRuleId,
  DecisionTimeOfDay,
} from "./decision-types";
import type {
  MasteryStateStore,
  MasteryStateRecord,
} from "./mastery-state-store";
import type {
  DecisionRuleRegistry,
  AggregateMasteryMetrics,
  RecentSessionHistory,
} from "./decision-rule-registry";
import { RationaleBuilder } from "./decision-rule-registry";
import type { ReviewQueueBuilder } from "./review-queue-builder";
import type { MetaCoachPlanner } from "./meta-coach-planner";
import {
  calculateAggregateMastery,
  createDefaultRecentHistory,
} from "./meta-coach-planner";
import type { GameHookPlanner } from "./game-hook-planner";

// =============================================================================
// DECISION ENGINE CONFIGURATION
// =============================================================================

/**
 * Configuration for the decision engine
 */
export interface DecisionEngineConfig {
  /** Policy version identifier */
  readonly policyVersion: string;

  /** Enable diagnostics in output */
  readonly includeDiagnostics: boolean;

  /** Enable timing measurement */
  readonly measureTiming: boolean;
}

/**
 * Default decision engine configuration
 */
export const DEFAULT_ENGINE_CONFIG: DecisionEngineConfig = {
  policyVersion: "1.0.0-heuristic",
  includeDiagnostics: true,
  measureTiming: true,
};

// =============================================================================
// DECISION ENGINE INPUT
// =============================================================================

/**
 * Input for decision engine
 */
export interface DecisionEngineInput {
  /** User ID */
  readonly userId: UserId;

  /** Constraints for this decision (merged with defaults) */
  readonly constraints?: Partial<DecisionConstraints>;

  /** Context for this decision (merged with defaults) */
  readonly context?: Partial<DecisionContext>;

  /** Session history (optional - will use default if not provided) */
  readonly sessionHistory?: RecentSessionHistory;

  /** Override timestamp (mainly for testing) */
  readonly now?: Timestamp;
}

// =============================================================================
// DECISION ENGINE INTERFACE
// =============================================================================

/**
 * Interface for the decision engine
 */
export interface DecisionEngine {
  /**
   * Generate a complete action plan
   */
  generateActionPlan(input: DecisionEngineInput): Promise<ActionPlan>;

  /**
   * Get the policy version
   */
  getPolicyVersion(): string;
}

// =============================================================================
// DEFAULT DECISION ENGINE
// =============================================================================

/**
 * Default implementation of DecisionEngine
 */
export class DefaultDecisionEngine implements DecisionEngine {
  private planCounter = 0;

  constructor(
    private readonly masteryStore: MasteryStateStore,
    private readonly ruleRegistry: DecisionRuleRegistry,
    private readonly queueBuilder: ReviewQueueBuilder,
    private readonly coachPlanner: MetaCoachPlanner,
    private readonly gameHookPlanner: GameHookPlanner,
    private readonly config: DecisionEngineConfig = DEFAULT_ENGINE_CONFIG,
  ) {}

  async generateActionPlan(input: DecisionEngineInput): Promise<ActionPlan> {
    const startTime = performance.now();
    const timestamp = input.now || (Date.now() as Timestamp);

    // Merge constraints and context with defaults
    const constraints = this.mergeConstraints(input.constraints);
    const context = this.mergeContext(input.context, timestamp);

    // Load mastery states from store
    const masteryRecords = await this.loadMasteryStates(constraints);
    const masteryStates = masteryRecords.map((r) => r.state);

    // Calculate aggregate metrics
    const aggregateMastery = calculateAggregateMastery(masteryStates);

    // Get session history
    const sessionHistory = input.sessionHistory || createDefaultRecentHistory();

    // Build review queue
    const reviewQueue = this.queueBuilder.buildQueue(
      masteryRecords,
      constraints,
      context,
      timestamp,
    );

    // Plan coaching interventions
    const coachingInterventions = this.coachPlanner.planInterventions(
      constraints,
      context,
      aggregateMastery,
      reviewQueue.items.length,
      sessionHistory,
      timestamp,
    );

    // Plan gamification hooks
    const gamificationHooks = this.gameHookPlanner.planHooks(
      constraints,
      context,
      aggregateMastery,
      reviewQueue.items.length,
      sessionHistory,
      timestamp,
    );

    // Build diagnostics
    const endTime = performance.now();
    const diagnostics = this.buildDiagnostics(
      constraints,
      context,
      timestamp,
      endTime - startTime,
      masteryRecords.length,
      reviewQueue.items.length,
    );

    // Build overall rationale
    const rationale = this.buildOverallRationale(
      constraints,
      context,
      aggregateMastery,
      reviewQueue.items.length,
      coachingInterventions.length,
      gamificationHooks.length,
    );

    // Generate plan ID
    const planId =
      `plan_${timestamp.toString(36)}_${(++this.planCounter).toString(36).padStart(4, "0")}` as ActionPlanId;

    return {
      planId,
      userId: input.userId,
      generatedAt: timestamp,
      constraints,
      context,
      reviewQueue,
      coachingInterventions,
      gamificationHooks,
      diagnostics,
      rationale,
    };
  }

  getPolicyVersion(): string {
    return this.config.policyVersion;
  }

  // ---------------------------------------------------------------------------
  // MERGE HELPERS
  // ---------------------------------------------------------------------------

  private mergeConstraints(
    input: Partial<DecisionConstraints> | undefined,
  ): DecisionConstraints {
    const defaults: DecisionConstraints = {
      maxItems: 20,
      timeBudget: (30 * 60 * 1000) as Duration,
      retrievabilityRange: {
        min: 0.7 as NormalizedValue,
        max: 0.95 as NormalizedValue,
        target: 0.9 as NormalizedValue,
      },
      newVsReviewRatio: 0.2 as NormalizedValue,
      contentFilters: {
        deckIds: [],
        includeTags: [],
        excludeTags: [],
        nodeTypes: [],
        goalLinkedOnly: false,
        excludeReviewedToday: false,
      },
      enableInterleaving: true,
      maxConsecutiveSameTopic: 3,
      includeCoaching: true,
      includeGamification: true,
    };

    if (!input) {
      return defaults;
    }

    return {
      ...defaults,
      ...input,
      contentFilters: {
        ...defaults.contentFilters,
        ...input.contentFilters,
      },
      retrievabilityRange: {
        ...defaults.retrievabilityRange,
        ...input.retrievabilityRange,
      },
    };
  }

  private mergeContext(
    input: Partial<DecisionContext> | undefined,
    now: Timestamp,
  ): DecisionContext {
    const defaults: DecisionContext = {
      mode: "review",
      device: "desktop",
      fatigue: 0.3 as NormalizedValue,
      motivation: 0.7 as NormalizedValue,
      availableTime: (30 * 60 * 1000) as Duration,
      timeOfDay: this.calculateTimeOfDay(now),
      reviewedThisSession: [],
      currentStreak: 0,
      practiceMode: false,
    };

    if (!input) {
      return defaults;
    }

    return {
      ...defaults,
      ...input,
      timeOfDay: input.timeOfDay || this.calculateTimeOfDay(now),
    };
  }

  private calculateTimeOfDay(now: Timestamp): DecisionTimeOfDay {
    const hour = new Date(now).getHours();
    if (hour >= 5 && hour < 12) return "morning";
    if (hour >= 12 && hour < 17) return "afternoon";
    if (hour >= 17 && hour < 21) return "evening";
    return "night";
  }

  // ---------------------------------------------------------------------------
  // LOAD MASTERY STATES
  // ---------------------------------------------------------------------------

  private async loadMasteryStates(
    constraints: DecisionConstraints,
  ): Promise<MasteryStateRecord[]> {
    // Query mastery store with constraints
    const result = await this.masteryStore.query({
      granularity: "card",
      minRetrievability: ((constraints.retrievabilityRange.min as number) *
        0.5) as NormalizedValue,
      maxRetrievability: constraints.retrievabilityRange.max,
      limit: 500,
      sortBy: "retrievability",
      sortDirection: "asc",
    });

    return [...result.states];
  }

  // ---------------------------------------------------------------------------
  // BUILD DIAGNOSTICS
  // ---------------------------------------------------------------------------

  private buildDiagnostics(
    constraints: DecisionConstraints,
    context: DecisionContext,
    timestamp: Timestamp,
    computeTimeMs: number,
    candidateCount: number,
    selectedCount: number,
  ): ActionPlanDiagnostics {
    // Get rule versions
    const ruleVersions: Record<string, number> = {};
    for (const meta of this.ruleRegistry.getAllRuleMetadata()) {
      ruleVersions[meta.id] = meta.version;
    }

    return {
      policyVersion: this.config.policyVersion,
      ruleVersions,
      constraintsSnapshot: constraints,
      contextSnapshot: context,
      generationTime: computeTimeMs as Duration,
      excludedItemCount: candidateCount - selectedCount,
      warnings: [],
    };
  }

  // ---------------------------------------------------------------------------
  // BUILD OVERALL RATIONALE
  // ---------------------------------------------------------------------------

  private buildOverallRationale(
    constraints: DecisionConstraints,
    context: DecisionContext,
    aggregateMastery: AggregateMasteryMetrics,
    queueSize: number,
    coachingCount: number,
    gamificationCount: number,
  ): PlanRationale {
    let summary = `Generated ${queueSize} review items`;
    if (coachingCount > 0) {
      summary += ` with ${coachingCount} coaching intervention${coachingCount > 1 ? "s" : ""}`;
    }
    if (gamificationCount > 0) {
      summary += ` and ${gamificationCount} gamification hook${gamificationCount > 1 ? "s" : ""}`;
    }
    summary += ` for ${context.mode} mode session.`;

    return new RationaleBuilder()
      .withSummary(summary)
      .addFactor(
        "mode",
        context.mode,
        "context.mode",
        1,
        0.5,
        `Session mode: ${context.mode}`,
      )
      .addFactor(
        "avgRetrievability",
        aggregateMastery.avgRetrievability as number,
        "mastery.avgRetrievability",
        1,
        aggregateMastery.avgRetrievability as number,
        `Average retrievability: ${Math.round((aggregateMastery.avgRetrievability as number) * 100)}%`,
      )
      .addFactor(
        "overdueCount",
        aggregateMastery.overdueCount,
        "mastery.overdueCount",
        -1,
        Math.min(aggregateMastery.overdueCount / 50, 1),
        `${aggregateMastery.overdueCount} overdue items`,
      )
      .addRule("policy.decision_engine_v1" as DecisionRuleId, 1, true)
      .addCounterfactual(
        `If more items were due, queue would contain up to ${constraints.maxItems} items`,
      )
      .build(0.85 as Confidence);
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a new decision engine with all dependencies
 */
export function createDecisionEngine(
  masteryStore: MasteryStateStore,
  ruleRegistry: DecisionRuleRegistry,
  queueBuilder: ReviewQueueBuilder,
  coachPlanner: MetaCoachPlanner,
  gameHookPlanner: GameHookPlanner,
  config?: Partial<DecisionEngineConfig>,
): DecisionEngine {
  return new DefaultDecisionEngine(
    masteryStore,
    ruleRegistry,
    queueBuilder,
    coachPlanner,
    gameHookPlanner,
    {
      ...DEFAULT_ENGINE_CONFIG,
      ...config,
    },
  );
}

/**
 * Builder for creating a decision engine
 */
export class DecisionEngineBuilder {
  private masteryStore?: MasteryStateStore;
  private ruleRegistry?: DecisionRuleRegistry;
  private queueBuilder?: ReviewQueueBuilder;
  private coachPlanner?: MetaCoachPlanner;
  private gameHookPlanner?: GameHookPlanner;
  private config: Partial<DecisionEngineConfig> = {};

  withMasteryStore(store: MasteryStateStore): this {
    this.masteryStore = store;
    return this;
  }

  withRuleRegistry(registry: DecisionRuleRegistry): this {
    this.ruleRegistry = registry;
    return this;
  }

  withQueueBuilder(builder: ReviewQueueBuilder): this {
    this.queueBuilder = builder;
    return this;
  }

  withCoachPlanner(planner: MetaCoachPlanner): this {
    this.coachPlanner = planner;
    return this;
  }

  withGameHookPlanner(planner: GameHookPlanner): this {
    this.gameHookPlanner = planner;
    return this;
  }

  withConfig(config: Partial<DecisionEngineConfig>): this {
    this.config = { ...this.config, ...config };
    return this;
  }

  build(): DecisionEngine {
    if (!this.masteryStore) {
      throw new Error("MasteryStateStore is required");
    }
    if (!this.ruleRegistry) {
      throw new Error("DecisionRuleRegistry is required");
    }
    if (!this.queueBuilder) {
      throw new Error("ReviewQueueBuilder is required");
    }
    if (!this.coachPlanner) {
      throw new Error("MetaCoachPlanner is required");
    }
    if (!this.gameHookPlanner) {
      throw new Error("GameHookPlanner is required");
    }

    return createDecisionEngine(
      this.masteryStore,
      this.ruleRegistry,
      this.queueBuilder,
      this.coachPlanner,
      this.gameHookPlanner,
      this.config,
    );
  }
}
