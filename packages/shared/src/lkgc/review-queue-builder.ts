// =============================================================================
// REVIEW QUEUE BUILDER - Prioritized Review Queue Generation
// =============================================================================
// Builds a prioritized review queue based on:
// - MasteryState (retrievability, difficulty, stability)
// - Decision rules (deterministic, explainable)
//
// NO AI. NO FSRS/HLR. Just deterministic heuristics.
// =============================================================================

import type {
  NodeId,
  Timestamp,
  Duration,
  Confidence,
} from "../types/lkgc/foundation";
import type { MasteryState, MasteryGranularity } from "../types/lkgc/mastery";
import type {
  DecisionConstraints,
  DecisionContext,
  ReviewQueue,
  ReviewQueueItem,
  QueueItemId,
  QueueCounts,
  DifficultyBucket,
  ItemCategory,
  PriorityScoring,
  PriorityScoringWeights,
  PlanRationale,
  DecisionRuleId,
} from "./decision-types";
import type {
  DecisionRuleRegistry,
  ItemGraphContext,
} from "./decision-rule-registry";
import { RationaleBuilder } from "./decision-rule-registry";
import type { MasteryStateRecord } from "./mastery-state-store";

// =============================================================================
// QUEUE BUILDER CONFIGURATION
// =============================================================================

/**
 * Configuration for the queue builder
 */
export interface QueueBuilderConfig {
  /** Default scoring weights */
  readonly defaultWeights: PriorityScoringWeights;

  /** Maximum items to consider before cutoff */
  readonly maxCandidates: number;

  /** Minimum gap between confusable items */
  readonly minConfusionGap: number;

  /** Maximum queue build time (ms) */
  readonly maxBuildTime: number;
}

/**
 * Default queue builder configuration
 */
export const DEFAULT_QUEUE_BUILDER_CONFIG: QueueBuilderConfig = {
  defaultWeights: {
    urgency: 0.35,
    importance: 0.2,
    prerequisitePressure: 0.15,
    interferencePenalty: 0.1,
    timeCost: 0.1,
    fatigueCompatibility: 0.1,
  },
  maxCandidates: 500,
  minConfusionGap: 3,
  maxBuildTime: 5000,
};

// =============================================================================
// QUEUE CANDIDATE - Internal representation
// =============================================================================

interface QueueCandidate {
  readonly nodeId: NodeId;
  readonly granularity: MasteryGranularity;
  readonly masteryState: MasteryState;
  readonly graphContext: ItemGraphContext;
  readonly scoring: PriorityScoring;
  readonly estimatedTime: number;
  readonly category: ItemCategory;
}

// =============================================================================
// REVIEW QUEUE BUILDER INTERFACE
// =============================================================================

/**
 * Interface for building review queues
 */
export interface ReviewQueueBuilder {
  /**
   * Build a review queue from mastery states
   */
  buildQueue(
    masteryStates: readonly MasteryStateRecord[],
    constraints: DecisionConstraints,
    context: DecisionContext,
    now: Timestamp,
  ): ReviewQueue;
}

// =============================================================================
// DEFAULT REVIEW QUEUE BUILDER
// =============================================================================

/**
 * Default implementation of ReviewQueueBuilder
 */
export class DefaultReviewQueueBuilder implements ReviewQueueBuilder {
  constructor(
    private readonly ruleRegistry: DecisionRuleRegistry,
    private readonly config: QueueBuilderConfig = DEFAULT_QUEUE_BUILDER_CONFIG,
  ) {}

  buildQueue(
    masteryStates: readonly MasteryStateRecord[],
    constraints: DecisionConstraints,
    context: DecisionContext,
    now: Timestamp,
  ): ReviewQueue {
    // Step 1: Build candidates with scoring
    const candidates = this.buildCandidates(
      masteryStates,
      constraints,
      context,
      now,
    );

    // Step 2: Sort by priority score
    const sorted = [...candidates].sort(
      (a, b) => b.scoring.finalScore - a.scoring.finalScore,
    );

    // Step 3: Limit to maxItems
    const limited = sorted.slice(0, constraints.maxItems);

    // Step 4: Apply interleaving if enabled
    const interleaved = constraints.enableInterleaving
      ? this.applyInterleaving(limited, constraints)
      : limited;

    // Step 5: Build queue items with positions and rationales
    const items = interleaved.map((candidate, position) =>
      this.buildQueueItem(candidate, position, now),
    );

    // Step 6: Calculate counts and total time
    const counts = this.calculateCounts(items);
    const estimatedTime = items.reduce(
      (total, item) => total + (item.estimatedTime as number),
      0,
    ) as Duration;

    // Step 7: Build queue rationale
    const rationale = this.buildQueueRationale(
      candidates.length,
      items.length,
      constraints,
    );

    return {
      items,
      estimatedTime,
      counts,
      rationale,
    };
  }

  // ---------------------------------------------------------------------------
  // CANDIDATE BUILDING
  // ---------------------------------------------------------------------------

  private buildCandidates(
    masteryStates: readonly MasteryStateRecord[],
    constraints: DecisionConstraints,
    context: DecisionContext,
    _now: Timestamp,
  ): QueueCandidate[] {
    const candidates: QueueCandidate[] = [];

    for (const record of masteryStates) {
      // Apply content filters
      if (!this.passesFilters(record, constraints)) {
        continue;
      }

      // Check if item is due (retrievability within range)
      if (!this.isDue(record.state, constraints)) {
        continue;
      }

      // Build graph context (simplified - empty for now)
      const graphContext = this.buildGraphContext(record.nodeId);

      // Calculate scoring
      const scoring = this.calculateScoring(
        record.state,
        graphContext,
        context,
        this.config.defaultWeights,
      );

      // Determine category
      const category = this.determineCategory(record.state);

      // Estimate time
      const estimatedTime = this.estimateTime(record.state);

      candidates.push({
        nodeId: record.nodeId,
        granularity: record.granularity,
        masteryState: record.state,
        graphContext,
        scoring,
        estimatedTime,
        category,
      });
    }

    return candidates;
  }

  private passesFilters(
    record: MasteryStateRecord,
    constraints: DecisionConstraints,
  ): boolean {
    const filters = constraints.contentFilters;

    // Deck filter
    if (filters.deckIds.length > 0) {
      // Would check if record belongs to one of the decks
      // Simplified: pass for now
    }

    // Node type filter
    if (filters.nodeTypes.length > 0) {
      // Would check node type
      // Simplified: pass for now
    }

    return true;
  }

  private isDue(
    state: MasteryState,
    constraints: DecisionConstraints,
  ): boolean {
    const retrievability = state.memory.retrievability as number;
    return (
      retrievability <= (constraints.retrievabilityRange.max as number) &&
      retrievability >= (constraints.retrievabilityRange.min as number) * 0.5 // Allow slightly overdue
    );
  }

  private buildGraphContext(_nodeId: NodeId): ItemGraphContext {
    // Simplified: return empty context
    // In real implementation, would query GraphStore
    return {
      prerequisites: [],
      dependents: [],
      confusions: [],
      strategies: [],
      linkedGoals: [],
    };
  }

  // ---------------------------------------------------------------------------
  // SCORING
  // ---------------------------------------------------------------------------

  private calculateScoring(
    state: MasteryState,
    graphContext: ItemGraphContext,
    context: DecisionContext,
    weights: PriorityScoringWeights,
  ): PriorityScoring {
    // Urgency: inverse of retrievability (low R = high urgency)
    const urgency = 1 - (state.memory.retrievability as number);

    // Importance: linked goals boost
    const importance = graphContext.linkedGoals.length > 0 ? 0.8 : 0.5;

    // Prerequisite pressure: dependents boost
    const prerequisitePressure = Math.min(
      graphContext.dependents.length * 0.2,
      1,
    );

    // Interference penalty: confusions penalty
    const interferencePenalty = Math.min(
      graphContext.confusions.length * 0.1,
      0.5,
    );

    // Time cost: inverse of stability (low stability = quick review)
    const timeCost = 1 - Math.min(state.memory.stability / 365, 1); // Normalize stability to 1 year

    // Fatigue compatibility: easy items when fatigued
    const fatigue = context.fatigue as number;
    const difficulty = state.memory.difficulty as number;
    const fatigueCompatibility = fatigue > 0.5 ? 1 - difficulty : difficulty;

    // Calculate final score
    const finalScore =
      weights.urgency * urgency +
      weights.importance * importance +
      weights.prerequisitePressure * prerequisitePressure -
      weights.interferencePenalty * interferencePenalty +
      weights.timeCost * timeCost +
      weights.fatigueCompatibility * fatigueCompatibility;

    return {
      urgency,
      importance,
      prerequisitePressure,
      interferencePenalty,
      timeCost,
      fatigueCompatibility,
      weights,
      finalScore,
    };
  }

  private determineCategory(state: MasteryState): ItemCategory {
    const learningState = state.memory.learningState;
    switch (learningState) {
      case "new":
        return "new";
      case "learning":
        return "learning";
      case "review":
        return "review";
      case "relearning":
        return "relearning";
      default:
        return "review";
    }
  }

  private estimateTime(state: MasteryState): number {
    // Base time + difficulty adjustment
    const baseTime = 15000; // 15 seconds
    const difficulty = state.memory.difficulty as number;
    return baseTime * (0.5 + difficulty);
  }

  // ---------------------------------------------------------------------------
  // INTERLEAVING
  // ---------------------------------------------------------------------------

  private applyInterleaving(
    candidates: QueueCandidate[],
    _constraints: DecisionConstraints,
  ): QueueCandidate[] {
    // Simplified interleaving: just return as-is for now
    // Real implementation would space out confusable items
    return candidates;
  }

  // ---------------------------------------------------------------------------
  // QUEUE ITEM BUILDING
  // ---------------------------------------------------------------------------

  private buildQueueItem(
    candidate: QueueCandidate,
    position: number,
    now: Timestamp,
  ): ReviewQueueItem {
    const rationale = new RationaleBuilder()
      .withSummary(
        `Item selected at position ${position + 1} with score ${candidate.scoring.finalScore.toFixed(2)}`,
      )
      .addFactor(
        "urgency",
        candidate.scoring.urgency,
        "memory.retrievability",
        candidate.scoring.weights.urgency,
        candidate.scoring.urgency * candidate.scoring.weights.urgency,
        `Retrievability: ${((1 - candidate.scoring.urgency) * 100).toFixed(0)}%`,
      )
      .addFactor(
        "importance",
        candidate.scoring.importance,
        "graph.linkedGoals",
        candidate.scoring.weights.importance,
        candidate.scoring.importance * candidate.scoring.weights.importance,
        candidate.graphContext.linkedGoals.length > 0
          ? "Goal-linked"
          : "No linked goals",
      )
      .addRule("queue.priority.default" as DecisionRuleId, 1, true)
      .build(0.8 as Confidence);

    return {
      itemId:
        `qi_${now.toString(36)}_${position.toString().padStart(3, "0")}` as QueueItemId,
      nodeId: candidate.nodeId,
      granularity: candidate.granularity,
      position,
      priorityScore: candidate.scoring.finalScore,
      scoring: candidate.scoring,
      estimatedTime: candidate.estimatedTime as Duration,
      category: candidate.category,
      rationale,
    };
  }

  // ---------------------------------------------------------------------------
  // COUNTS AND RATIONALE
  // ---------------------------------------------------------------------------

  private calculateCounts(items: readonly ReviewQueueItem[]): QueueCounts {
    const byDifficulty: Record<DifficultyBucket, number> = {
      easy: 0,
      medium: 0,
      hard: 0,
      very_hard: 0,
    };

    let newCount = 0;
    let reviewCount = 0;
    let overdueCount = 0;

    for (const item of items) {
      if (item.category === "new") newCount++;
      else reviewCount++;

      // Overdue if urgency is high
      if (item.scoring.urgency > 0.7) overdueCount++;

      // Difficulty bucket based on fatigue compatibility
      const diff = 1 - item.scoring.fatigueCompatibility;
      if (diff < 0.25) byDifficulty.easy++;
      else if (diff < 0.5) byDifficulty.medium++;
      else if (diff < 0.75) byDifficulty.hard++;
      else byDifficulty.very_hard++;
    }

    return {
      total: items.length,
      new: newCount,
      review: reviewCount,
      overdue: overdueCount,
      byDifficulty,
    };
  }

  private buildQueueRationale(
    candidateCount: number,
    selectedCount: number,
    constraints: DecisionConstraints,
  ): PlanRationale {
    return new RationaleBuilder()
      .withSummary(
        `Selected ${selectedCount} items from ${candidateCount} candidates`,
      )
      .addFactor(
        "maxItems",
        constraints.maxItems,
        "constraints.maxItems",
        1,
        0.5,
        `Limit: ${constraints.maxItems} items`,
      )
      .addFactor(
        "retrievabilityRange",
        `${((constraints.retrievabilityRange.min as number) * 100).toFixed(0)}-${((constraints.retrievabilityRange.max as number) * 100).toFixed(0)}%`,
        "constraints.retrievabilityRange",
        1,
        0.5,
        `Target retrievability: ${((constraints.retrievabilityRange.min as number) * 100).toFixed(0)}-${((constraints.retrievabilityRange.max as number) * 100).toFixed(0)}%`,
      )
      .addRule("queue.selection.default" as DecisionRuleId, 1, true)
      .build(0.85 as Confidence);
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a new review queue builder
 */
export function createReviewQueueBuilder(
  ruleRegistry: DecisionRuleRegistry,
  config?: Partial<QueueBuilderConfig>,
): ReviewQueueBuilder {
  return new DefaultReviewQueueBuilder(ruleRegistry, {
    ...DEFAULT_QUEUE_BUILDER_CONFIG,
    ...config,
  });
}
